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
fn unhex(s: &str) -> Option<Vec<u8>> {
    let b = s.as_bytes();
    let d = |c: u8| (c as char).to_digit(16).map(|x| x as u8);
    (0..b.len() / 2).map(|i| Some(d(b[2 * i])? << 4 | d(b[2 * i + 1])?)).collect()
}
fn arg_id(q: &V, k: &str) -> Option<Id> {
    unhex(q.get(k)?.s()?)?.try_into().ok()
}
fn arg_commit(pk: &Pack, q: &V) -> H {
    q.get("commit").and_then(|c| c.s()).and_then(unhex).and_then(|b| b.try_into().ok()).unwrap_or(pk.head)
}
/// A boundary as the harness writes it: "start", "end", or [change hex, number, side].
fn arg_boundary(b: &V) -> Option<V> {
    if b.s().is_some() {
        return Some(b.clone());
    }
    let l = b.l();
    Some(V::L(vec![V::B(unhex(l.first()?.s()?)?), l.get(1)?.clone(), l.get(2)?.clone()]))
}

// ---- the chain of commits, and the objects of one ----
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

// ---- sequences by runs (1.7) and regions on them (4.3), for sequences of any length ----
#[derive(Clone)]
pub struct Run {
    pub c: Id,
    pub first: u64,
    pub count: u64,
    pub live: bool,
}
pub fn runs(seq: &V) -> Vec<Run> {
    seq.l().iter().filter_map(|r| {
        let r = r.l();
        Some(Run { c: r.first()?.id()?, first: r.get(1)?.i()? as u64, count: r.get(2)?.i()? as u64, live: r.len() == 3 })
    }).collect()
}
pub fn bpos(rs: &[Run], b: &V) -> Option<u64> {
    match b.s() {
        Some("start") => return Some(0),
        Some("end") => return Some(rs.iter().filter(|r| r.live).map(|r| r.count).sum()),
        _ => {}
    }
    let l = b.l();
    let (c, n, side) = (l.first()?.id()?, l.get(1)?.i()? as u64, l.get(2)?.i()? as u64);
    let mut p = 0;
    for r in rs {
        if r.c == c && r.first <= n && n < r.first + r.count {
            return Some(p + if r.live { n - r.first + side } else { 0 });
        }
        if r.live {
            p += r.count;
        }
    }
    None
}
/// A1: None where the region is detached.
pub fn region(rs: &[Run], reg: &V) -> Option<(u64, u64)> {
    let l = reg.l();
    let (a, b) = (l.get(1)?, l.get(2)?);
    let (pa, pb) = (bpos(rs, a)?, bpos(rs, b)?);
    if pa >= pb && a != b {
        return None;
    }
    Some((pa, pb))
}
pub fn element_at(rs: &[Run], mut p: u64) -> Option<(Id, u64)> {
    for r in rs.iter().filter(|r| r.live) {
        if p < r.count {
            return Some((r.c, r.first + p));
        }
        p -= r.count;
    }
    None
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
fn span_or_detached(r: Option<(u64, u64)>) -> V {
    match r {
        Some((a, b)) => V::L(vec![V::Int(a as i64), V::Int(b as i64)]),
        None => t("detached"),
    }
}

// ---- 4.5: a timeline ----
fn timeline(pk: &Pack, q: &V) -> Option<V> {
    let commit = arg_commit(pk, q);
    let k = pk.object(&commit, &arg_id(q, "clock")?)?;
    let rs = runs(k.seq.as_ref()?.get("t")?);
    let reg_of = |a: &V| -> Option<V> { Some(a.tag(ANCHOR)?.get("a")?.get("t")?.clone()) };
    let mut anchors = Vec::new();
    if let Some(m) = arg_id(q, "marks").and_then(|i| pk.object(&commit, &i)) {
        if let Some(V::M(m)) = m.p.get("marks") {
            for (key, a) in m {
                anchors.push((key.clone(), span_or_detached(reg_of(a).and_then(|r| region(&rs, &r)))));
            }
        }
    }
    let plays: Vec<(String, V)> = match k.p.get("plays") {
        Some(V::M(m)) => m.clone(),
        _ => Vec::new(),
    };
    let mut resolved = Vec::new();
    for (key, pl) in &plays {
        resolved.push((key.clone(), span_or_detached(pl.get("at").and_then(reg_of).and_then(|r| region(&rs, &r)))));
    }
    let mut playing = Vec::new();
    for p in q.get("positions").map(|p| p.l()).unwrap_or(&[]) {
        let p = p.i()? as u64;
        let (c, n) = element_at(&rs, p)?;
        let mut now = Vec::new();
        for (key, pl) in &plays {
            let Some(reg) = pl.get("at").and_then(reg_of) else { continue };
            let Some((lo, hi)) = region(&rs, &reg) else { continue };
            if p < lo || p >= hi {
                continue;
            }
            // the first element the region covers, from its start boundary
            if reg.l().get(1)?.s().is_some() { continue; }
            let b = reg.l().get(1)?.l();
            let (c0, n0) = (b.first()?.id()?, b.get(1)?.i()? as u64 + b.get(2)?.i()? as u64);
            if c == c0 {
                now.push((key.clone(), V::Int(pl.get("offset").and_then(|o| o.i()).unwrap_or(0) + n as i64 - n0 as i64)));
            }
        }
        playing.push(map(vec![("position", V::Int(p as i64)), ("element", V::L(vec![t(&hex(&c)), V::Int(n as i64)])), ("plays", V::M(now))]));
    }
    Some(map(vec![("t", k.p.get("t")?.clone()), ("live", V::Int(rs.iter().filter(|r| r.live).map(|r| r.count).sum::<u64>() as i64)),
        ("anchors", V::M(anchors)), ("plays_resolve_to", V::M(resolved)), ("playing_at", V::L(playing))]))
}

// ---- 4.2, 4.3: continuous and keyed regions ----
/// A continuous region in present coordinates, clipped to the extent where the extent is known.
/// Returns (the interval or None if detached, whether it was clipped against a known extent).
fn extent(pk: &Pack, _commit: &H, o: &Obj, ax: &str, reg: &V) -> (Option<(f64, f64)>, bool) {
    let (Some(lo), Some(hi)) = (reg.l().get(1).and_then(|x| x.f()), reg.l().get(2).and_then(|x| x.f())) else { return (None, true) };
    let ints = matches!(reg.l().get(1), Some(V::Int(_)));
    let sc = o.p.get("scales").and_then(|s| s.get(ax)).map(|s| s.l().iter().filter_map(|x| x.f()).collect::<Vec<f64>>()).unwrap_or(vec![1.0, 1.0, 0.0]);
    let map = |x: f64| { let y = x * sc[0] / sc[1]; (if ints { libm_floor(y) } else { y }) + sc[2] };
    let (lo, hi) = (map(lo), map(hi));
    let e = match (o.ty.as_str(), ax) {
        ("ufo.clock", "t") => match (o.p.get("start").and_then(|x| x.f()), o.p.get("end").and_then(|x| x.f())) { (Some(a), Some(b)) => Some((a, b)), _ => None },
        ("ufo.asset", "bytes") => o.p.get("bytes").and_then(|b| b.b()).map(|b| (0.0, b.len() as f64)),
        _ => None,
    };
    let _ = pk;
    match e {
        None => (Some((lo, hi)), false),
        Some((a, b)) if hi < a || lo > b => (None, true),
        Some((a, b)) => (Some((lo.max(a), hi.min(b))), true),
    }
}
fn libm_floor(x: f64) -> f64 {
    let t = x as i64 as f64;
    if t > x { t - 1.0 } else { t }
}
/// Every anchor in an object's `marks`, resolved against the commit.
fn resolve_marks(pk: &Pack, q: &V) -> Option<V> {
    let commit = arg_commit(pk, q);
    let m = pk.object(&commit, &arg_id(q, "marks")?)?;
    let V::M(marks) = m.p.get("marks")? else { return None };
    let num = |x: f64, ints: bool| if ints { V::Int(x as i64) } else { V::F(x) };
    let mut out = Vec::new();
    for (name, a) in marks {
        let a = a.tag(ANCHOR)?;
        let Some(o) = a.get("o").and_then(|i| i.id()).and_then(|i| pk.object(&commit, &i)) else { out.push((name.clone(), t("detached"))); continue };
        let Some(V::M(axes)) = a.get("a") else { out.push((name.clone(), t("the whole object"))); continue };
        let (ax, reg) = axes.first()?;
        let r = match reg.l().first().and_then(|k| k.s()) {
            Some("s") => span_or_detached(o.seq.as_ref().and_then(|s| s.get(ax)).map(runs).and_then(|rs| region(&rs, reg))),
            Some("c") => {
                let ints = matches!(reg.l().get(1), Some(V::Int(_)));
                match extent(pk, &commit, &o, ax, reg) {
                    (None, _) => t("detached"),
                    (Some((lo, hi)), true) => V::L(vec![num(lo, ints), num(hi, ints)]),
                    (Some((lo, hi)), false) => map(vec![("unclipped", V::L(vec![num(lo, ints), num(hi, ints)]))]),
                }
            }
            Some("k") => {
                let present: Vec<V> = reg.l()[1..].iter().filter(|k| match o.p.get(ax) { Some(V::M(m)) => m.iter().any(|(x, _)| Some(x.as_str()) == k.s()), _ => false }).cloned().collect();
                if present.is_empty() { t("detached") } else { V::L(present) }
            }
            _ => t("detached"),
        };
        out.push((name.clone(), r));
    }
    Some(V::M(out))
}

// ---- 4.4: the digest of a pin ----
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
            extent(pk, commit, &o, ax, reg).0?;
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
fn digest_q(pk: &Pack, q: &V) -> Option<V> {
    let commit = arg_commit(pk, q);
    let id = arg_id(q, "o")?;
    let salt = unhex(q.get("salt")?.s()?)?;
    let reg = match q.get("axis") {
        Some(ax) if q.get("low").is_some() => Some((ax.s()?, V::L(vec![t("c"), q.get("low")?.clone(), q.get("high")?.clone()]))),
        Some(ax) if q.get("keys").is_some() => { let mut l = vec![t("k")]; l.extend(q.get("keys")?.l().iter().cloned()); Some((ax.s()?, V::L(l))) }
        Some(ax) => Some((ax.s()?, V::L(vec![t("s"), arg_boundary(q.get("a")?)?, arg_boundary(q.get("b")?)?]))),
        None => None,
    };
    match digest(pk, &commit, &id, reg.as_ref().map(|(a, r)| (*a, r)), &salt) {
        Some((d, covered, followed)) => Some(map(vec![("digest", t(&hex(&d))), ("covered_value_hex", t(&hex(&encode(&covered)))),
            ("followed", V::L(followed.iter().map(|(i, h)| map(vec![("id", t(&hex(i))), ("revision", t(&hex(h)))])).collect()))])),
        None => Some(map(vec![("digest", t("detached"))])),
    }
}

// ---- 13.3: the three layers of what travels ----
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
fn universe_layers(pk: &Pack, commit: &H, also: Option<Id>, content: &mut Set<H>, attribution: &mut Set<H>, attributing: &mut Vec<Id>, done: &mut Set<(H, Id)>) {
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
        attributing.push(c);
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
        if pk.node(&u).is_some() { universe_layers(pk, &u, Some(o), content, attribution, attributing, done); }
    }
}
fn layers(pk: &Pack) -> Option<V> {
    let (mut content, mut attribution, mut attributing, mut done) = (Set::new(), Set::new(), Vec::new(), Set::new());
    universe_layers(pk, &pk.head, None, &mut content, &mut attribution, &mut attributing, &mut done);
    let (all, seals) = pk.frames();
    let mut present: Set<H> = Set::new();
    present.extend(all.iter().map(|(_, h, _)| *h));
    let attribution: Set<H> = Map(attribution.0.into_iter().filter(|h| !content.contains(&h.0)).collect());
    let size = |set: &Set<H>| all.iter().filter(|(_, h, _)| set.contains(h)).map(|(_, _, n)| *n).sum::<usize>();
    let history: Set<H> = Map(present.0.iter().filter(|h| !content.contains(&h.0) && !attribution.contains(&h.0)).cloned().collect());
    let list = |set: &Set<H>| V::L(set.keys().map(|h| t(&hex(h))).collect());
    let layer = |set: &Set<H>| map(vec![("records", V::Int(set.0.len() as i64)), ("bytes_in_frames", V::Int(size(set) as i64)), ("hashes", list(set))]);
    crate::small::sort(attributing.as_mut_slice());
    Some(map(vec![("content", layer(&content)), ("attribution", layer(&attribution)), ("working_history", layer(&history)),
        ("seal_frames", V::Int(seals.len() as i64)), ("attributing_changes", V::L(attributing.iter().map(|c| t(&hex(c))).collect())),
        ("missing_from_content_or_attribution", V::Int(content.keys().chain(attribution.keys()).filter(|h| !present.contains(*h)).count() as i64))]))
}

pub fn query(pk: &Pack, q: &V) -> Option<V> {
    match q.get("q")?.s()? {
        "commits" => Some(V::L(chain(pk).iter().map(|(h, n)| map(vec![("commit", t(&hex(h))), ("height", n.get("height").cloned().unwrap_or(V::Null))])).collect())),
        "timeline" => timeline(pk, q),
        "digest" => digest_q(pk, q),
        "resolve" => resolve_marks(pk, q),
        "layers" => layers(pk),
        #[cfg(not(feature = "cut-project"))]
        "project" => crate::project::project(pk, q),
        _ => None,
    }
}
