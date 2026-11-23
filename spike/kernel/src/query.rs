// Throwaway spike kernel: queries that produce provisional vectors (timelines, digests,
// what travels, projections). Not the beginning of the implementation.
use crate::pack::*;
use crate::value::*;
use crate::small::{Map, Set};
use alloc::string::String;
use alloc::vec;
use alloc::vec::Vec;

pub fn hex(b: &[u8]) -> String {
    let mut s = String::new();
    for x in b {
        s.push(b"0123456789abcdef"[(x >> 4) as usize] as char);
        s.push(b"0123456789abcdef"[(x & 15) as usize] as char);
    }
    s
}
pub fn chain(pk: &Pack) -> Vec<(H, V)> {
    let (mut out, mut at) = (Vec::new(), Some(pk.head));
    while let Some(h) = at {
        let Some(n) = pk.node(&h) else { break };
        at = n.get("parents").and_then(|p| p.l().first()).and_then(|p| p.hash());
        out.push((h, n));
    }
    out
}
pub fn objects(pk: &Pack, commit: &H) -> Vec<(Id, H)> {
    fn walk(pk: &Pack, h: &H, out: &mut Vec<(Id, H)>, nodes: &mut Vec<H>) {
        let Some(n) = pk.node(h) else { return };
        nodes.push(*h);
        if let Some(V::M(c)) = n.get("c") {
            for (_, x) in c {
                if let Some(x) = x.hash() {
                    walk(pk, &x, out, nodes);
                }
            }
        } else if let Some(e) = n.get("e") {
            for e in e.l() {
                if let (Some(i), Some(r)) = (e.l().first().and_then(|x| x.id()), e.l().get(1).and_then(|x| x.hash())) {
                    out.push((i, r));
                }
            }
        }
    }
    let (mut out, mut nodes) = (Vec::new(), Vec::new());
    if let Some(m) = pk.node(commit).and_then(|c| c.get("objects").and_then(|o| o.hash())) {
        walk(pk, &m, &mut out, &mut nodes);
    }
    crate::small::sort(&mut out);
    out
}
/// The current revision of every object in the universe a commit fixes.
pub fn rev_map(pk: &Pack, commit: &H) -> Map<Id, H> {
    let mut m = Map::new();
    for (i, r) in objects(pk, commit) {
        m.set(i, r);
    }
    m
}
fn map_nodes(pk: &Pack, commit: &H) -> Vec<H> {
    fn walk(pk: &Pack, h: &H, nodes: &mut Vec<H>) {
        let Some(n) = pk.node(h) else { return };
        nodes.push(*h);
        if let Some(V::M(c)) = n.get("c") {
            for (_, x) in c {
                if let Some(x) = x.hash() {
                    walk(pk, &x, nodes);
                }
            }
        }
    }
    let mut nodes = Vec::new();
    if let Some(m) = pk.node(commit).and_then(|c| c.get("objects").and_then(|o| o.hash())) {
        walk(pk, &m, &mut nodes);
    }
    nodes
}

/// The live runs a region covers, each cut to it.
fn covered_runs(rs: &[Run], lo: u64, hi: u64) -> Vec<Run> {
    let (mut out, mut p) = (Vec::new(), 0);
    for r in rs.iter().filter(|r| r.live) {
        let (a, b) = (lo.max(p), hi.min(p + r.count));
        if a < b {
            out.push(Run { c: r.c, first: r.first + (a - p), count: b - a, live: true });
        }
        p += r.count;
    }
    out
}
// ---- 4.2, 4.3: continuous and keyed regions ----
/// A continuous region, clipped to the extent where the extent is known.
/// Returns (the interval or None if detached, whether it was clipped against a known extent).
pub fn extent(o: &Obj, ax: &str, reg: &V) -> (Option<(f64, f64)>, bool) {
    let (Some(lo), Some(hi)) = (reg.l().get(1).and_then(|x| x.f()), reg.l().get(2).and_then(|x| x.f())) else { return (None, true) };
    let e = match (o.ty.as_str(), ax) {
        ("ufo.clock", "t") => match (o.p.get("start").and_then(|x| x.f()), o.p.get("end").and_then(|x| x.f())) { (Some(a), Some(b)) => Some((a, b)), _ => None },
        ("ufo.asset", "bytes") => o.p.get("bytes").and_then(|b| b.b()).map(|b| (0.0, b.len() as f64)),
        _ => None,
    };
    match e {
        None => (Some((lo, hi)), false),
        Some((a, b)) if hi < a || lo > b => (None, true),
        Some((a, b)) => (Some((lo.max(a), hi.min(b))), true),
    }
}
fn anchors_in<'a>(v: &'a V, out: &mut Vec<&'a V>) {
    match v {
        V::Tag(ANCHOR, a) => out.push(a),
        V::Tag(_, x) => anchors_in(x, out),
        V::L(l) => l.iter().for_each(|x| anchors_in(x, out)),
        V::M(m) => m.iter().for_each(|(_, x)| anchors_in(x, out)),
        _ => {}
    }
}
fn refs_in(v: &V, portal_of: bool, out: &mut Set<Id>) {
    match v {
        V::Tag(REF, x) => { if let Some(i) = x.id() { out.insert(i); } }
        V::Tag(ANCHOR, a) => {
            if portal_of && a.get("d").is_none() && a.get("u").is_none() {
                if let Some(i) = a.get("o").and_then(|o| o.id()) { out.insert(i); }
            }
        }
        V::Tag(_, x) => refs_in(x, false, out),
        V::L(l) => l.iter().for_each(|x| refs_in(x, false, out)),
        V::M(m) => m.iter().for_each(|(k, x)| refs_in(x, k == "of", out)),
        _ => {}
    }
}
pub fn digest(pk: &Pack, commit: &H, id: &Id, axis: Option<(&str, &V)>, salt: &[u8]) -> Option<(H, V, Vec<(Id, H)>)> {
    let o = pk.object(commit, id)?;
    let covered = match axis {
        None => {
            let mut p = o.p.clone();
            if let V::M(m) = &mut p { m.retain(|(k, _)| k != "snapshot"); }
            p
        }
        Some((ax, reg)) if reg.l().first().and_then(|k| k.s()) == Some("c") => {
            extent(&o, ax, reg).0?;
            let mut p = o.p.clone();
            if let V::M(m) = &mut p { m.retain(|(k, _)| k != "snapshot"); }
            V::M(vec![(String::from(ax), p)])
        }
        Some((ax, reg)) if reg.l().first().and_then(|k| k.s()) == Some("k") => {
            let keys: Vec<&str> = reg.l()[1..].iter().filter_map(|k| k.s()).collect();
            let part = match o.p.get(ax)? {
                V::M(m) => V::M(m.iter().filter(|(k, _)| keys.contains(&k.as_str())).cloned().collect()),
                V::L(l) => V::L(l.iter().filter(|r| r.tag(REF).and_then(|i| i.id()).map(|i| keys.contains(&hex(&i).as_str())).unwrap_or(false)).cloned().collect()),
                _ => return None,
            };
            if matches!(&part, V::M(m) if m.is_empty()) || matches!(&part, V::L(l) if l.is_empty()) { return None; }
            V::M(vec![(String::from(ax), part)])
        }
        Some((ax, reg)) => {
            let rs = runs(o.seq.as_ref()?.get(ax)?);
            let (lo, hi) = region(&rs, reg)?;
            let items = match o.p.get(ax)? {
                V::T(s) => V::T(s.chars().skip(lo as usize).take((hi - lo) as usize).collect()),
                V::B(b) => V::B(b[lo as usize..hi as usize].to_vec()),
                V::L(l) => V::L(l[lo as usize..hi as usize].to_vec()),
                V::Int(_) => V::L(covered_runs(&rs, lo, hi).iter().map(|r| V::L(vec![V::B(r.c.to_vec()), V::Int(r.first as i64), V::Int(r.count as i64)])).collect()),
                _ => return None,
            };
            // every other entry of a map-valued property that holds an anchor to this object touching the region
            let mut touching = Vec::new();
            if let V::M(props) = &o.p {
                for (name, val) in props {
                    let V::M(entries) = val else { continue };
                    let mut kept = Vec::new();
                    for (key, e) in entries {
                        let mut found = Vec::new();
                        anchors_in(e, &mut found);
                        let touches = found.iter().any(|a| {
                            a.get("o").and_then(|x| x.id()) == Some(*id) && a.get("u").is_none()
                                && a.get("a").and_then(|x| x.get(ax)).and_then(|r| region(&rs, r)).map(|(a, b)| a < b && a < hi && lo < b).unwrap_or(false)
                        });
                        if touches { kept.push((key.clone(), e.clone())); }
                    }
                    if !kept.is_empty() { touching.push((name.clone(), V::M(kept))); }
                }
            }
            V::M(vec![(String::from(ax), V::L(vec![items, V::M(touching)]))])
        }
    };
    // followed objects: named by a ref, or by a Portal's `of` without a digest; and all those reach; changes never
    let (mut seen, mut todo, mut first) = (Set::new(), Set::new(), Set::new());
    refs_in(&covered, false, &mut first);
    todo.extend(first.into_keys());
    let mut followed = Vec::new();
    while let Some(i) = todo.pop_first() {
        if i == *id || !seen.insert(i) { continue; }
        match pk.object(commit, &i) {
            Some(x) if x.ty == "ufo.change" => {}
            Some(x) => { followed.push((i, x.rev)); let mut more = Set::new(); refs_in(&x.p, false, &mut more); todo.extend(more.into_keys()); }
            None => followed.push((i, [0; 32])),
        }
    }
    let enc = encode(&covered);
    let mut parts: Vec<&[u8]> = vec![salt, &enc];
    for (i, h) in &followed { parts.push(i); parts.push(h); }
    Some((sha256(&parts), covered, followed))
}
fn blob_records(pk: &Pack, h: &H, out: &mut Set<H>) {
    if !out.insert(*h) { return; }
    let Some(n) = pk.node(h) else { return };
    let level = n.get("level").and_then(|l| l.i()).unwrap_or(0);
    for part in n.get("parts").map(|p| p.l()).unwrap_or(&[]) {
        if let Some(ph) = part.l().get(1).and_then(|x| x.hash()) {
            if level == 0 { out.insert(ph); } else { blob_records(pk, &ph, out); }
        }
    }
}
/// Records a value names outside its node, and the identities it reaches by refs and anchors.
fn reach(pk: &Pack, v: &V, recs: &mut Set<H>, ids: &mut Set<Id>, other: &mut Vec<(H, Id)>) {
    match v {
        V::Tag(REF, x) => { if let Some(i) = x.id() { ids.insert(i); } }
        V::Tag(ANCHOR, a) => {
            match (a.get("u").and_then(|u| u.hash()), a.get("o").and_then(|o| o.id())) {
                (Some(u), Some(o)) => other.push((u, o)),
                (None, Some(o)) => { ids.insert(o); }
                _ => {}
            }
            reach(pk, a, recs, ids, other);
        }
        V::Tag(INDIRECT, x) => {
            let l = x.l();
            let Some(mut h) = l.get(1).and_then(|h| h.hash()) else { return };
            if l.len() == 3 {
                recs.insert(h);
                match pk.record(1, &h) { Some(o) if o.len() == 48 => h = o[16..].try_into().unwrap_or(h), _ => return }
            }
            blob_records(pk, &h, recs);
            if l.first().and_then(|k| k.s()) == Some("v") {
                if let Some(inner) = pk.blob(&h).and_then(|b| decode(&b)) { reach(pk, &inner, recs, ids, other); }
            }
        }
        V::Tag(_, x) => reach(pk, x, recs, ids, other),
        V::L(l) => l.iter().for_each(|x| reach(pk, x, recs, ids, other)),
        V::M(m) => m.iter().for_each(|(_, x)| reach(pk, x, recs, ids, other)),
        _ => {}
    }
}
/// 2.5: the content and attribution layers of the universe a commit fixes, and of the universes it takes in.
fn universe_layers(pk: &Pack, commit: &H, also: Option<Id>, content: &mut Set<H>, attribution: &mut Set<H>, attributing: &mut Vec<(H, Id)>, live: &mut Vec<(H, Id)>, done: &mut Set<(H, Id)>) {
    let revs = rev_map(pk, commit);
    content.extend(map_nodes(pk, commit));
    let mut at = Some(*commit);
    while let Some(h) = at {
        attribution.insert(h);
        at = pk.node(&h).and_then(|n| n.get("parents").and_then(|p| p.l().first()).and_then(|p| p.hash()));
    }
    let is_change = |i: &Id| revs.get(i).and_then(|r| pk.node(r)).map(|n| n.get("type").and_then(|x| x.s()) == Some("ufo.change")).unwrap_or(false);
    let mut changes: Set<Id> = Set::new();
    let mut todo = Set::new();
    todo.insert([0u8; 16]);
    todo.extend(also);
    let mut other = Vec::new();
    while let Some(i) = todo.pop_first() {
        if !done.insert((*commit, i)) { continue; }
        let Some(rev) = revs.get(&i) else { continue };
        let Some(n) = pk.node(rev) else { continue };
        if n.get("type").and_then(|x| x.s()) == Some("ufo.change") { continue; }
        content.insert(*rev);
        live.push((*commit, i));
        if let Some(b) = n.get("by").and_then(|b| b.id()) { changes.insert(b); }
        let mut ids = Set::new();
        if let Some(p) = n.get("p") { reach(pk, p, content, &mut ids, &mut other); }
        if let Some(seq) = n.get("seq") {
            reach(pk, seq, content, &mut Set::new(), &mut other);
            if let Some(V::M(m)) = pk.resolve(seq, 0) {
                for (_, rs) in m { for r in runs(&rs) { changes.insert(r.c); } }
            }
        }
        todo.extend(ids.into_keys());
    }
    // changes that hold evidence, decisions or findings
    for (i, rev) in &revs.0 {
        if let Some(p) = pk.node(rev).filter(|n| n.get("type").and_then(|x| x.s()) == Some("ufo.change")).and_then(|n| n.get("p").cloned()) {
            if ["evidence", "decisions", "attributions"].iter().any(|k| p.get(k).is_some()) { changes.insert(*i); }
        }
    }
    let mut todo: Vec<Id> = changes.into_keys().collect();
    let mut seen = Set::new();
    while let Some(c) = todo.pop() {
        if !is_change(&c) || !seen.insert(c) { continue; }
        let Some(&rev) = revs.get(&c) else { continue };
        attribution.insert(rev);
        attributing.push((*commit, c));
        if let Some(V::M(m)) = pk.node(&rev).and_then(|n| n.get("p").cloned()) {
            for (k, v) in &m {
                if k == "work" { continue; }
                let (mut ids, mut o2) = (Set::new(), Vec::new());
                reach(pk, v, attribution, &mut ids, &mut o2);
                todo.extend(ids.into_keys());
            }
        }
    }
    for (u, o) in other {
        if pk.node(&u).is_some() { universe_layers(pk, &u, Some(o), content, attribution, attributing, live, done); }
    }
}
/// The layers of the universe a pack's head fixes, with those of the universes it takes in: the
/// records of the content layer; those of the attribution layer that are not also content; the
/// attributing changes and the live objects, each with the commit of the universe it is in.
pub fn split(pk: &Pack) -> (Set<H>, Set<H>, Vec<(H, Id)>, Vec<(H, Id)>) {
    let (mut content, mut attribution, mut attributing, mut live, mut done) = (Set::new(), Set::new(), Vec::new(), Vec::new(), Set::new());
    universe_layers(pk, &pk.head, None, &mut content, &mut attribution, &mut attributing, &mut live, &mut done);
    let attribution: Set<H> = Map(attribution.0.into_iter().filter(|h| !content.contains(&h.0)).collect());
    (content, attribution, attributing, live)
}
pub fn published(pk: &Pack) -> Option<Vec<u8>> {
    let (content, attribution, _, _) = split(pk);
    pk.published(&|h| content.contains(h) || attribution.contains(h))
}
