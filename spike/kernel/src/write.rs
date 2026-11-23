// Throwaway spike kernel: one edit through the gate (SPEC 1.7). A splice on a text is built by
// positions, replayed on the parent state by the generic rule, compared, and only then written:
// the revision, the change and its veiled work (1.4), the object map (1.6), the commit.
// Also the text of a web envelope's pack element read back (SPEC-TRAVEL 13.2).
use crate::diff::{diff, Edit};
use crate::pack::*;
use crate::query::{hex, objects, runs, Run};
use crate::value::*;
use alloc::boxed::Box;
use alloc::string::String;
use alloc::vec;
use alloc::vec::Vec;

type Recs = Vec<(u8, Vec<u8>)>;
fn node(recs: &mut Recs, v: &V) -> H {
    let b = encode(v);
    let h = sha256(&[&[2], &b]);
    recs.push((2, b));
    h
}
fn bytes(b: &[u8]) -> V {
    V::B(b.to_vec())
}

/// 1.4: a blob written: its chunks by the gear rule, then its tree of nodes. Gives the hash of its node.
fn blob(recs: &mut Recs, data: &[u8]) -> H {
    let mut gear = [0u64; 256];
    for (i, g) in gear.iter_mut().enumerate() {
        *g = u64::from_le_bytes(sha256(&[b"ufo-gear-1", &[i as u8]])[..8].try_into().unwrap_or([0; 8]));
    }
    // each part: the bytes it covers, from and to, and its hash
    let (mut parts, mut from, mut h) = (Vec::new(), 0, 0u64);
    for (i, &b) in data.iter().enumerate() {
        h = h.wrapping_mul(2).wrapping_add(gear[b as usize]);
        let n = i + 1 - from;
        if (n >= 2048 && h >> 51 == 0) || n == 65536 || i + 1 == data.len() {
            recs.push((1, data[from..=i].to_vec()));
            parts.push((from, i + 1, sha256(&[&[1], &data[from..=i]])));
            (from, h) = (i + 1, 0);
        }
    }
    let mut level = 0;
    loop {
        let (mut next, mut a) = (Vec::new(), 0);
        for i in 0..parts.len().max(1) {
            let n = i + 1 - a;
            let ends = parts.get(i).map_or(false, |p: &(usize, usize, H)| n >= 2 && u32::from_be_bytes([p.2[0], p.2[1], p.2[2], p.2[3]]) % 1024 == 0);
            if ends || n == 4096 || i + 1 >= parts.len() {
                let group = &parts[a..(i + 1).min(parts.len())];
                let (from, to) = (group.first().map_or(0, |p| p.0), group.last().map_or(0, |p| p.1));
                let n = map(vec![("k", t("blob")), ("len", V::Int((to - from) as i64)), ("sha256", bytes(&sha256(&[&data[from..to]]))), ("level", V::Int(level)),
                    ("parts", V::L(group.iter().map(|p| V::L(vec![V::Int((p.1 - p.0) as i64), bytes(&p.2)])).collect()))]);
                next.push((from, to, n));
                a = i + 1;
            }
        }
        // one group is the blob's node; several are nodes of this level, grouped again one level higher
        let whole = next.len() == 1;
        parts = next.into_iter().map(|(from, to, n)| (from, to, node(recs, &n))).collect();
        if whole {
            return parts[0].2;
        }
        level += 1;
    }
}
/// 1.6: the object map of a set of revisions, sorted by identity. Gives the hash of its root.
fn object_map(recs: &mut Recs, ents: &[(Id, H)], d: usize) -> H {
    if ents.len() <= 32 || d >= 16 {
        return node(recs, &map(vec![("k", t("map")), ("e", V::L(ents.iter().map(|(i, h)| V::L(vec![bytes(i), bytes(h)])).collect()))]));
    }
    let (mut c, mut a) = (Vec::new(), 0);
    while a < ents.len() {
        let b = a + ents[a..].iter().take_while(|e| e.0[d] == ents[a].0[d]).count();
        c.push((hex(&[ents[a].0[d]]), bytes(&object_map(recs, &ents[a..b], d + 1))));
        a = b;
    }
    node(recs, &map(vec![("k", t("map")), ("c", V::M(c))]))
}

/// Sets, or with no value removes, what lies at a path through nested maps (1.7, `set`).
fn set_in(v: &mut V, path: &[&str], val: Option<V>) -> Option<()> {
    let V::M(m) = v else { return None };
    let at = m.iter().position(|e| e.0 == path[0]);
    if path.len() > 1 {
        let i = match at {
            Some(i) => i,
            None => {
                m.push((String::from(path[0]), V::M(Vec::new()))); // maps along the path are created
                m.len() - 1
            }
        };
        return set_in(&mut m[i].1, &path[1..], val);
    }
    match (at, val) {
        (Some(i), Some(x)) => m[i].1 = x,
        (Some(i), None) => drop(m.remove(i)),
        (None, Some(x)) => m.push((String::from(path[0]), x)),
        _ => {}
    }
    Some(())
}
/// The generic rule (1.7): a change's operations applied in order to one object's properties and
/// `seq`. It finds elements by identity and knows nothing of how the operations were made. None
/// where a law of change refuses (L2, L4), or for what this spike does not replay: `new`, `drop`,
/// `forget`, a splice that creates its property or is not on a text.
fn replay(id: &Id, change: &Id, ops: &[V], p: &V, seq: &V) -> Option<(V, V)> {
    let (mut p, mut seq, mut number) = (p.clone(), seq.clone(), 0u64);
    for op in ops {
        if op.get("obj")?.id()? != *id {
            return None;
        }
        match op.get("op")?.s()? {
            "splice" if op.get("forget").is_none() => {
                let key = op.get("key")?.s()?;
                // every element, with its content if it is not removed
                let mut content = p.get(key)?.s()?.chars();
                let mut els: Vec<(Id, u64, Option<char>)> = Vec::new();
                for e in elements(seq.get(key)?)? {
                    els.push((e.c, e.n, if e.live { Some(content.next()?) } else { None }));
                }
                if content.next().is_some() {
                    return None; // X1
                }
                let mut gone = vec![false; els.len()];
                for r in op.get("del").map(|d| d.l()).unwrap_or(&[]) {
                    let r = r.l();
                    let (c, first, count) = (r.first()?.id()?, r.get(1)?.i()? as u64, r.get(2)?.i()? as u64);
                    for n in first..first + count {
                        let i = els.iter().position(|e| e.0 == c && e.1 == n)?; // L4: in the sequence
                        if r.len() != 3 || gone[i] || els[i].2.is_none() {
                            return None; // L4: not already removed
                        }
                        gone[i] = true;
                    }
                }
                let mut old = String::new();
                for i in (0..els.len()).filter(|&i| gone[i]) {
                    old.push(els[i].2.take()?);
                }
                let same = match op.get("old") {
                    Some(V::T(s)) => *s == old,
                    None => old.is_empty(),
                    _ => false,
                };
                if !same {
                    return None; // L2
                }
                if let Some(ins) = op.get("ins") {
                    let at = match op.get("after")? {
                        V::Null => 0,
                        a => {
                            let (c, n) = (a.l().first()?.id()?, a.l().get(1)?.i()? as u64);
                            els.iter().position(|e| e.0 == c && e.1 == n)? + 1
                        }
                    };
                    let new: Vec<(Id, u64, Option<char>)> = ins.s()?.chars().map(|ch| {
                        number += 1;
                        (*change, number - 1, Some(ch))
                    }).collect();
                    els.splice(at..at, new);
                }
                let mut rs = Vec::new();
                let mut i = 0;
                while i < els.len() {
                    let mut j = i + 1;
                    while j < els.len() && els[j].0 == els[i].0 && els[j].1 == els[i].1 + (j - i) as u64 && els[j].2.is_some() == els[i].2.is_some() {
                        j += 1;
                    }
                    let mut r = vec![bytes(&els[i].0), V::Int(els[i].1 as i64), V::Int((j - i) as i64)];
                    if els[i].2.is_none() {
                        r.push(V::Bool(false));
                    }
                    rs.push(V::L(r));
                    i = j;
                }
                set_in(&mut p, &[key], Some(V::T(els.iter().filter_map(|e| e.2).collect())))?;
                set_in(&mut seq, &[key], Some(V::L(rs)))?;
            }
            "set" => {
                let path: Vec<&str> = match op.get("key")? {
                    V::T(k) => vec![k.as_str()],
                    l => l.l().iter().map(|k| k.s()).collect::<Option<_>>()?,
                };
                if seq.get(path.first()?).is_some() || path.iter().try_fold(&p, |v, k| v.get(k)).map(encode) != op.get("old").map(encode) {
                    return None; // a sequence property is not set; L2: `old` is what was there, by value
                }
                set_in(&mut p, &path, op.get("val").cloned())?;
            }
            _ => return None,
        }
    }
    Some((p, seq))
}

fn push_run(out: &mut Vec<Run>, c: Id, first: u64, count: u64, live: bool) {
    match out.last_mut() {
        _ if count == 0 => {}
        Some(l) if l.c == c && l.first + l.count == first && l.live == live => l.count += count,
        _ => out.push(Run { c, first, count, live }),
    }
}
fn runs_value(rs: &[Run]) -> V {
    V::L(rs.iter().map(|r| {
        let mut v = vec![bytes(&r.c), V::Int(r.first as i64), V::Int(r.count as i64)];
        if !r.live {
            v.push(V::Bool(false));
        }
        V::L(v)
    }).collect())
}
/// A value as a revision holds it: outside the node if it was, or if its encoding has grown past 4 096 bytes (1.4).
fn held(recs: &mut Recs, was: Option<&V>, kind: &str, data: &[u8], inline: V) -> Result<V, &'static str> {
    match was.and_then(|w| w.tag(INDIRECT)) {
        Some(x) if x.l().len() == 3 => Err("the value is kept behind a veil: not rewritten by this spike"),
        None if encode(&inline).len() <= 4096 => Ok(inline),
        _ => Ok(V::Tag(INDIRECT, Box::new(V::L(vec![t(kind), bytes(&blob(recs, data))])))),
    }
}

/// `{o, lo, hi, ins, who, time, random}`: positions lo..hi of the text `o` now read `ins`.
/// Gives `{commit, change, root, ops}`, or the reason it is refused; then nothing has been written.
pub fn propose(pk: &mut Pack, q: &V) -> Result<V, &'static str> {
    let int = |k: &str| q.get(k).and_then(|x| x.i()).filter(|i| *i >= 0).map(|i| i as u64);
    let (Some(id), Some(lo), Some(hi), Some(ins), Some(who), Some(time), Some(random)) = (q.get("o").and_then(|x| x.id()), int("lo"), int("hi"), q.get("ins").and_then(|x| x.s()),
        q.get("who").and_then(|x| x.s()), int("time"), q.get("random").and_then(|x| x.b()).filter(|b| b.len() == 64)) else {
        return Err("arguments: o (16 bytes), lo, hi, ins (text), who (text), time, random (64 bytes)");
    };
    edit(pk, id, lo as usize, hi as usize, ins, None, who, time, random)
}
/// The same, by arguments. The stretch is compared with what it is to read and only the difference
/// is written (L1): one `splice` for each run of scalar values removed or inserted (diff.rs), all in
/// one change. Or, where it is known where the stretch was changed, `given` says so, and `ins` is not
/// looked at: edits in order and apart, with positions in the stretch (tool.rs, `net`). `random` is
/// 64 bytes: the change's identity, then three salts.
pub fn edit(pk: &mut Pack, id: Id, lo: usize, hi: usize, ins: &str, given: Option<Vec<Edit>>, who: &str, time: u64, random: &[u8]) -> Result<V, &'static str> {
    if pk.unread_tail != 0 {
        return Err("the pack was recovered after an interrupted write (2.3): this spike does not truncate it and append (P7)");
    }
    let parent = pk.head;
    let c = pk.node(&parent).ok_or("the head commit cannot be read")?;
    let height = c.get("height").and_then(|h| h.i()).ok_or("the head commit has no height")?;
    if c.get("v") != Some(&V::Int(1)) {
        return Err("a universe of a format version this kernel does not implement is not written (1.9)");
    }
    let o = pk.object(&parent, &id).ok_or("no such object in the current state (L4)")?;
    if o.ty != "ufo.text" {
        return Err("the object is not a text");
    }
    if o.p.get("syntax").is_some() {
        return Err("a text in a foreign syntax is not edited in place (X3)");
    }
    let raw = pk.node(&o.rev).ok_or("the revision cannot be read")?;
    let (Some(seqs), Some(text)) = (o.seq.as_ref(), o.p.get("chars").and_then(|c| c.s())) else { return Err("the text has no characters") };
    let chars: Vec<char> = text.chars().collect();
    let seq0 = seqs.get("chars").ok_or("`chars` is not a sequence property")?;
    let (old_runs, els0) = (runs(seq0), elements(seq0).ok_or("inconsistent `seq` (X1)")?);
    let live: Vec<usize> = (0..els0.len()).filter(|&i| els0[i].live).collect(); // where each position is in the sequence
    if old_runs.len() != seq0.l().len() || live.len() != chars.len() {
        return Err("`seq` does not account for the characters: the text is inconsistent and is not edited (X1)");
    }
    if lo > hi || hi > chars.len() {
        return Err("positions out of range");
    }
    let wanted: Vec<char> = ins.chars().collect();
    let mut edits = given.unwrap_or_else(|| diff(&chars[lo..hi], &wanted));
    if edits.is_empty() {
        return Err("nothing to change");
    }
    let mut end = 0;
    for e in &edits {
        if e.lo < end || e.hi < e.lo || e.hi > hi - lo || (e.hi == e.lo && e.ins.is_empty()) {
            return Err("the edits given are not in order, apart and within the stretch");
        }
        end = e.hi + 1;
    }
    let change: Id = random.get(..16).and_then(|r| r.try_into().ok()).filter(|_| random.len() == 64).ok_or("random: 64 bytes")?;
    let mut ents = objects(pk, &parent);
    if ents.iter().any(|e| e.0 == change) || old_runs.iter().any(|r| r.c == change) {
        return Err("the identity drawn for the change is already in use");
    }
    // The operations, by element identity. New items go after the last element an edit removes, so
    // that a boundary fixed to a removed element (the start of a block whose first characters are
    // replaced) still lies before them (4.3); with nothing removed, after the element before the
    // place, or at the start. Elements are numbered across the operations in their order (1.7).
    let (mut ops, mut gone, mut put, mut number) = (Vec::new(), vec![false; els0.len()], Vec::new(), 0u64);
    for e in edits.iter_mut() {
        (e.lo, e.hi) = (e.lo + lo, e.hi + lo);
    }
    for e in &edits {
        let after = if e.hi > e.lo { Some(live[e.hi - 1]) } else if e.lo > 0 { Some(live[e.lo - 1]) } else { None };
        let mut op = vec![("op", t("splice")), ("obj", bytes(&id)), ("key", t("chars"))];
        if !e.ins.is_empty() {
            op.push(("after", after.map_or(V::Null, |i| V::L(vec![bytes(&els0[i].c), V::Int(els0[i].n as i64)]))));
            op.push(("ins", V::T(e.ins.iter().collect())));
            put.push((after, number, &e.ins));
            number += e.ins.len() as u64;
        }
        if e.hi > e.lo {
            let mut del = Vec::new();
            for &i in &live[e.lo..e.hi] {
                gone[i] = true;
                push_run(&mut del, els0[i].c, els0[i].n, 1, true);
            }
            op.push(("del", runs_value(&del)));
            op.push(("old", V::T(chars[e.lo..e.hi].iter().collect())));
        }
        ops.push(map(op));
    }
    // the new state of the text: every element where it was, the removed ones as tombstones, the new ones in
    let (mut new_runs, mut new_chars, mut pos) = (Vec::new(), String::new(), 0);
    for i in 0..=els0.len() {
        let at = i.checked_sub(1);
        if let Some(e) = at.map(|i| &els0[i]) {
            push_run(&mut new_runs, e.c, e.n, 1, e.live && !gone[i - 1]);
            if e.live {
                if !gone[i - 1] {
                    new_chars.push(chars[pos]);
                }
                pos += 1;
            }
        }
        for (_, first, ins) in put.iter().filter(|p| p.0 == at) {
            push_run(&mut new_runs, change, *first, ins.len() as u64, true);
            new_chars.extend(ins.iter());
        }
    }
    let new_seq = runs_value(&new_runs);
    let (mut p1, mut seq1, mut raw_p) = (o.p.clone(), seqs.clone(), raw.get("p").cloned().ok_or("the revision has no properties")?);
    set_in(&mut p1, &["chars"], Some(V::T(new_chars.clone())));
    set_in(&mut seq1, &["chars"], Some(new_seq.clone()));
    // 5.1, both in the same change, each with a `set`. An inline span left with no extent is
    // removed. And where the stretch gained text at its very start with nothing removed there, the
    // text is meant to lie in the stretch: a block span that began at that place, or ended there,
    // would by its own boundary begin or end after the new text, so its boundary is moved to just
    // before the first new element.
    let at_start = hi > lo && edits[0].lo == lo && edits[0].hi == lo;
    let els1 = elements(&new_seq).ok_or("seq")?;
    if let Some(V::M(spans)) = o.p.get("spans") {
        for (key, s) in spans {
            let Some(r) = s.get("at").and_then(|a| a.tag(ANCHOR)).filter(|a| a.get("o").and_then(|o| o.id()) == Some(id)).and_then(|a| a.get("a")).and_then(|a| a.get("chars")).map(|r| r.l()).filter(|r| r.len() == 3) else { continue };
            let at = |els: &[El]| (boundary(els, &r[1]), boundary(els, &r[2]));
            let ((a0, b0), (a1, b1)) = (at(&els0), at(&els1));
            let (mut r2, first) = (r.to_vec(), V::L(vec![bytes(&change), V::Int(0), V::Int(0)]));
            let inline = s.get("kind").and_then(|k| k.s()) == Some("inline");
            let lost = inline && a0 < b0 && a0.is_some() && !(a1 < b1 && a1.is_some());
            if !inline && at_start && a0 == Some(lo) && b0 > a0 && a1 != a0 {
                r2[1] = first.clone();
            }
            if !inline && at_start && b0 == Some(lo) && a0 < b0 && a0.is_some() && b1 != b0 {
                r2[2] = first;
            }
            if !lost && r2 == r {
                continue;
            }
            if raw_p.get("spans").and_then(|m| m.get(key)).and_then(|s| s.get("at")).is_none() {
                return Err("a span to be rewritten is kept outside the node: not rewritten by this spike");
            }
            let (mut path, mut op) = (vec!["spans", key.as_str()], vec![("op", t("set")), ("obj", bytes(&id))]);
            let mut val = None;
            if lost {
                op.push(("old", s.clone()));
            } else {
                let mut moved = s.get("at").cloned().ok_or("at")?;
                if let V::Tag(_, inner) = &mut moved {
                    set_in(inner, &["a", "chars"], Some(V::L(r2)));
                }
                path.push("at");
                op.push(("old", s.get("at").cloned().ok_or("at")?));
                op.push(("val", moved.clone()));
                val = Some(moved);
            }
            op.push(("key", V::L(path.iter().map(|k| t(k)).collect())));
            ops.push(map(op));
            set_in(&mut p1, &path, val.clone());
            set_in(&mut raw_p, &path, val);
        }
    }
    // L3, L4, before anything is written: the operations, read back from the bytes that will be the
    // work, are applied to the parent state by the generic rule, and the result compared exactly.
    let work = encode(&map(vec![("ops", V::L(ops))]));
    let ops = decode(&work).and_then(|w| w.get("ops").cloned()).ok_or("work")?;
    let (p2, seq2) = replay(&id, &change, ops.l(), &o.p, seqs).ok_or("refused: the operations do not apply to the parent state (L2, L4)")?;
    if encode(&p2) != encode(&p1) || encode(&seq2) != encode(&seq1) {
        return Err("refused: the operations do not produce the new state (L3)");
    }
    // The records. The text's new revision carries everything else as it was (C6).
    let mut recs: Recs = Vec::new();
    let (mut rev, mut raw_seq) = (raw.clone(), raw.get("seq").cloned().ok_or("seq")?);
    let v = held(&mut recs, raw_p.get("chars"), "t", new_chars.as_bytes(), V::T(new_chars.clone()))?;
    set_in(&mut raw_p, &["chars"], Some(v));
    let v = held(&mut recs, raw_seq.get("chars"), "v", &encode(&new_seq), new_seq)?;
    set_in(&mut raw_seq, &["chars"], Some(v));
    let number = raw.get("rev").and_then(|r| r.i()).ok_or("rev")?;
    for (k, v) in [("rev", V::Int(number + 1)), ("prev", bytes(&o.rev)), ("by", bytes(&change)), ("salt", bytes(&random[16..32])), ("p", raw_p), ("seq", raw_seq)] {
        set_in(&mut rev, &[k], Some(v));
    }
    let text_rev = node(&mut recs, &rev);
    // the change: its work in a blob, behind an opening (1.4); created by committing, so `rev` 1 and `by` itself
    let mut opening = random[48..].to_vec();
    opening.extend(blob(&mut recs, &work));
    let veiled = V::Tag(INDIRECT, Box::new(V::L(vec![t("v"), bytes(&sha256(&[&[1], &opening])), V::Bool(true)])));
    recs.push((1, opening));
    let whom = map(vec![("name", t(who))]);
    // The origin is written whatever the change does. 1.7 has it "absent if the change introduces
    // none", and a removal introduces nothing; but then nothing would say a person made it.
    let cp = vec![("work", veiled), ("actor", map(vec![("who", whom.clone()), ("with", map(vec![("name", t("ufo-spike-kernel")), ("version", t("0.0.0"))]))])), ("time", V::Int(time as i64)),
        ("origin", map(vec![("basis", t("witnessed")), ("by", t("person")), ("who", whom)]))];
    let change_rev = node(&mut recs, &map(vec![("k", t("obj")), ("id", bytes(&change)), ("type", t("ufo.change")), ("rev", V::Int(1)), ("by", bytes(&change)), ("salt", bytes(&random[32..48])), ("p", map(cp))]));
    // every other object keeps the revision it had; the change object is added (L3)
    for e in ents.iter_mut().filter(|e| e.0 == id) {
        e.1 = text_rev;
    }
    ents.push((change, change_rev));
    crate::small::sort(&mut ents);
    let objects = object_map(&mut recs, &ents, 0);
    let commit = node(&mut recs, &map(vec![("k", t("commit")), ("v", V::Int(1)), ("parents", V::L(vec![bytes(&parent)])), ("objects", bytes(&objects)), ("change", bytes(&change_rev)), ("height", V::Int(height + 1))]));
    let was = pk.bytes().len();
    pk.commit(&recs, &commit).ok_or("the pack could not be extended: nothing was written")?;
    // and read back the ordinary way; if the state written is not the state meant, it is taken off again
    let back = pk.object(&commit, &id).filter(|b| encode(&b.p) == encode(&p1) && b.seq.as_ref().map(encode) == Some(encode(&seq1)) && b.by == change);
    if back.is_none() || pk.object(&commit, &change).is_none() {
        pk.cut(was);
        return Err("what was written does not read back as the new state: taken off again");
    }
    Ok(map(vec![("commit", bytes(&commit)), ("change", bytes(&change)), ("root", bytes(&commit)), ("ops", ops)]))
}

/// Standard base64 (RFC 4648, section 4) with padding and no line breaks.
pub fn base64(b: &[u8]) -> String {
    const A: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(b.len().div_ceil(3) * 4);
    for g in b.chunks(3) {
        let n = (g[0] as u32) << 16 | (*g.get(1).unwrap_or(&0) as u32) << 8 | *g.get(2).unwrap_or(&0) as u32;
        for k in 0..4 {
            out.push(if k <= g.len() { A[(n >> (18 - 6 * k) & 63) as usize] as char } else { '=' });
        }
    }
    out
}
/// Standard base64 (RFC 4648, section 4), with padding and no line breaks, as a web envelope's pack
/// element holds it; white space around the whole is not counted. None if it is anything else.
pub fn unbase64(s: &str) -> Option<Vec<u8>> {
    let b = s.trim_matches(|c: char| c.is_ascii_whitespace()).as_bytes();
    if b.len() % 4 != 0 {
        return None;
    }
    let mut out = Vec::with_capacity(b.len() / 4 * 3);
    for (k, g) in b.chunks(4).enumerate() {
        let pad = if k + 1 == b.len() / 4 { g.iter().rev().take_while(|c| **c == b'=').count() } else { 0 };
        let mut n = 0u32;
        for &c in &g[..4 - pad.min(3)] {
            n = n << 6 | match c {
                b'A'..=b'Z' => c - b'A',
                b'a'..=b'z' => c - b'a' + 26,
                b'0'..=b'9' => c - b'0' + 52,
                b'+' => 62,
                b'/' => 63,
                _ => return None,
            } as u32;
        }
        n <<= 6 * pad as u32;
        if pad > 2 || n & [0, 0xff, 0xffff][pad] != 0 {
            return None; // too much padding, or bits that belong to no byte
        }
        out.extend(&n.to_be_bytes()[1..4 - pad]);
    }
    Some(out)
}
