// Throwaway spike kernel: projections (SPEC Appendix B), as text. Not the beginning of the implementation.
use crate::pack::*;
use crate::query::*;
use crate::value::*;
use alloc::collections::BTreeMap;
use alloc::format;
use alloc::string::{String, ToString};
use alloc::vec::Vec;

struct Cx<'a> {
    pk: &'a Pack,
    commit: H,
    revs: BTreeMap<Id, H>,
    chain: Vec<(H, V)>,
    lines: Vec<String>,
}
fn json(s: &str) -> String {
    let mut o = String::from("\"");
    for c in s.chars() {
        match c {
            '"' => o.push_str("\\\""),
            '\\' => o.push_str("\\\\"),
            '\n' => o.push_str("\\n"),
            '\r' => o.push_str("\\r"),
            '\t' => o.push_str("\\t"),
            c if (c as u32) < 32 => o.push_str(&format!("\\u{:04x}", c as u32)),
            c => o.push(c),
        }
    }
    o.push('"');
    o
}
fn prefix(h: &[u8], others: &mut dyn Iterator<Item = &[u8]>) -> String {
    let full = hex(h);
    let all: Vec<String> = others.filter(|o| *o != h).map(hex).collect();
    let mut n = 8;
    while n < full.len() && all.iter().any(|o| o[..n] == full[..n]) {
        n += 1;
    }
    String::from(&full[..n])
}
impl<'a> Cx<'a> {
    fn o(&self, id: &Id) -> String {
        format!("o:{}", prefix(id, &mut self.revs.keys().map(|k| &k[..])))
    }
    fn r(&self, h: &H) -> String {
        format!("r:{}", prefix(h, &mut self.revs.values().map(|k| &k[..])))
    }
    fn c(&self, h: &H) -> String {
        format!("c:{}", prefix(h, &mut self.chain.iter().map(|k| &k.0[..])))
    }
    fn obj(&self, id: &Id) -> Option<Obj> {
        self.pk.object(&self.commit, id)
    }
    /// A value in the spelling an agent writes (Appendix B).
    fn jv(&self, v: &V) -> String {
        match v {
            V::Null => "null".into(),
            V::Bool(b) => b.to_string(),
            V::Int(i) => i.to_string(),
            V::F(x) => { let s = format!("{}", x); if s.contains('.') || s.contains('e') { s } else { s + ".0" } }
            V::T(s) => json(s),
            V::B(b) => format!("{{\"$bytes\":\"{}\"}}", hex(b)),
            V::L(l) => format!("[{}]", l.iter().map(|x| self.jv(x)).collect::<Vec<_>>().join(",")),
            V::M(m) => format!("{{{}}}", m.iter().map(|(k, x)| format!("{}:{}", json(k), self.jv(x))).collect::<Vec<_>>().join(",")),
            V::Tag(REF, x) => format!("{{\"$ref\":\"{}\"}}", x.id().map(|i| self.o(&i)).unwrap_or_default()),
            V::Tag(ANCHOR, a) => format!("{{\"$anchor\":{}}}", json(&self.anchor(a))),
            V::Tag(n, x) => format!("{{\"$tag{}\":{}}}", n, self.jv(x)),
        }
    }
    /// An anchor as projections write one: the identity, its regions as positions, the revision.
    fn anchor(&self, a: &V) -> String {
        let Some(id) = a.get("o").and_then(|o| o.id()) else { return String::new() };
        let mut s = self.o(&id);
        let o = self.obj(&id);
        if let (Some(V::M(axes)), Some(o)) = (a.get("a"), &o) {
            for (ax, reg) in axes {
                match o.seq.as_ref().and_then(|q| q.get(ax)).map(|q| runs(q)).and_then(|rs| region(&rs, reg)) {
                    Some((lo, hi)) => s.push_str(&format!(" {}=[{},{}]", ax, lo, hi)),
                    None => s.push_str(&format!(" {}=detached", ax)),
                }
            }
        }
        if let Some(o) = &o { s.push(' '); s.push_str(&self.r(&o.rev)); }
        s
    }
    fn change(&self, id: &Id) -> Option<V> {
        let o = self.obj(id)?;
        if o.ty == "ufo.change" { Some(o.p) } else { None }
    }
    /// The commit that a change made, and its height.
    fn commit_of(&self, id: &Id) -> Option<(H, i64)> {
        self.chain.iter().find(|(_, n)| n.get("change").and_then(|c| c.hash()).and_then(|c| self.pk.node(&c)).and_then(|n| n.get("id").and_then(|i| i.id())) == Some(*id))
            .map(|(h, n)| (*h, n.get("height").and_then(|x| x.i()).unwrap_or(0)))
    }
    /// The origin fields of a change, as `run`, `finding` and `made` write them.
    fn origin(&self, id: &Id) -> String {
        let Some(p) = self.change(id) else { return format!("change={} basis=unknown", self.o(id)) };
        let og = p.get("origin");
        let f = |k: &str| og.and_then(|o| o.get(k));
        let mut s = format!("change={} basis={}", self.o(id), f("basis").and_then(|b| b.s()).unwrap_or("unknown"));
        if let Some(b) = f("by").and_then(|b| b.s()) { s.push_str(&format!(" by={}", b)); }
        for k in ["who", "model", "tool", "asked", "prompt", "method", "confidence"] {
            if let Some(v) = f(k) {
                let shown = v.get("name").unwrap_or(v);
                s.push_str(&format!(" {}={}", k, self.jv(shown)));
            }
        }
        s
    }
    fn time(&self, id: &Id) -> i64 {
        self.change(id).and_then(|p| p.get("time").and_then(|t| t.i())).unwrap_or(0)
    }
    fn sealed(&self, id: &Id) -> bool {
        let Some((_, height)) = self.commit_of(id) else { return false };
        self.pk.frames().1.iter().filter_map(|s| decode(s)).filter_map(|s| s.get("commit").and_then(|c| c.hash()))
            .any(|c| self.chain.iter().any(|(h, n)| *h == c && n.get("height").and_then(|x| x.i()).unwrap_or(-1) >= height))
    }
    /// The change, among those that inserted a live element of positions lo..hi, whose commit is newest.
    fn last_change(&self, rs: &[Run], lo: u64, hi: u64) -> Option<Id> {
        let (mut best, mut p) = (None, 0);
        for r in rs.iter().filter(|r| r.live) {
            if p < hi && lo < p + r.count {
                let h = self.commit_of(&r.c).map(|x| x.1).unwrap_or(-1);
                if best.map(|(bh, _)| h > bh).unwrap_or(true) { best = Some((h, r.c)); }
            }
            p += r.count;
        }
        best.map(|b| b.1)
    }
}

// ---- a text's blocks, and its plain text (8.3) ----
struct Block { lo: u64, hi: u64, role: String, level: i64, marker: Option<V> }
fn blocks(o: &Obj) -> Vec<Block> {
    let Some(rs) = o.seq.as_ref().and_then(|q| q.get("chars")).map(runs) else { return Vec::new() };
    let mut out: Vec<(u64, String, Block)> = Vec::new();
    if let Some(V::M(spans)) = o.p.get("spans") {
        for (key, s) in spans {
            if s.get("kind").and_then(|k| k.s()) != Some("block") { continue; }
            let Some(reg) = s.get("at").and_then(|a| a.tag(ANCHOR)).and_then(|a| a.get("a")).and_then(|a| a.get("chars")) else { continue };
            let (Some(lo), Some(hi)) = (reg.l().get(1).and_then(|b| bpos(&rs, b)), reg.l().get(2).and_then(|b| bpos(&rs, b))) else { continue };
            out.push((lo, key.clone(), Block { lo, hi: hi.max(lo), role: s.get("role").and_then(|r| r.s()).unwrap_or("paragraph").into(), level: s.get("level").and_then(|l| l.i()).unwrap_or(1), marker: s.get("marker").cloned() }));
        }
    }
    out.sort_by(|a, b| (a.0, &a.1).cmp(&(b.0, &b.1)));
    out.into_iter().map(|x| x.2).collect()
}
/// The plain text of blocks i..j of a text (8.3): markers, and an empty line between blocks that are not both items.
fn plain_blocks(chars: &[char], bs: &[Block], i: usize, j: usize) -> String {
    let mut s = String::new();
    let mut counts: BTreeMap<i64, i64> = BTreeMap::new();
    for k in 0..j.min(bs.len()) {
        let b = &bs[k];
        if b.role == "item" {
            counts.retain(|l, _| *l <= b.level);
            *counts.entry(b.level).or_insert(0) += 1;
        } else {
            counts.clear();
        }
        if k < i { continue; }
        if k > i { s.push('\n'); if !(b.role == "item" && bs[k - 1].role == "item") { s.push('\n'); } }
        if b.role == "item" {
            for _ in 1..b.level { s.push_str("  "); }
            match b.marker.as_ref().and_then(|m| m.s()) {
                Some("number") => s.push_str(&format!("{}. ", counts[&b.level])),
                Some("bullet") | None => s.push_str("• "),
                Some(lit) => { s.push_str(lit); s.push(' '); }
            }
        }
        s.extend(&chars[b.lo as usize..(b.hi as usize).min(chars.len())]);
    }
    s
}

fn text(cx: &mut Cx, id: &Id) -> Option<()> {
    let o = cx.obj(id)?;
    let s = o.p.get("chars")?.s()?;
    let n = s.chars().count();
    let line = format!("text {} chars=[0,{}] {} chars={} s={}", cx.o(id), n, cx.r(&o.rev), n, json(s));
    cx.lines.push(line);
    Some(())
}
fn object(cx: &mut Cx, id: &Id) -> Option<()> {
    let o = cx.obj(id)?;
    let rev = cx.pk.node(&o.rev)?.get("rev")?.i()?;
    let line = format!("object id={} type={} rev={} r={} by={}", cx.o(id), o.ty, rev, cx.r(&o.rev), cx.o(&o.by));
    cx.lines.push(line);
    if let V::M(m) = &o.p {
        for (k, v) in m {
            let line = match v {
                V::T(s) if s.chars().count() > 200 => format!("prop key={} len={} kind=text", k, s.chars().count()),
                V::B(b) if b.len() > 200 => format!("prop key={} len={} kind=bytes", k, b.len()),
                _ => format!("prop key={} value={}", k, cx.jv(v)),
            };
            cx.lines.push(line);
        }
    }
    if let Some(V::M(seqs)) = &o.seq {
        for (k, q) in seqs { runs_of(cx, k, &runs(q), 0, u64::MAX); }
    }
    let ids: Vec<Id> = cx.revs.keys().cloned().collect();
    for other in ids {
        if other == *id { continue; }
        let Some(x) = cx.obj(&other) else { continue };
        if let V::M(m) = &x.p {
            for (k, v) in m {
                if k == "work" { continue; } // what a change did is history, not a reference
                let mut found = alloc::collections::BTreeSet::new();
                refs(v, &mut found);
                if found.contains(id) { let line = format!("referrer id={} key={}", cx.o(&other), k); cx.lines.push(line); }
            }
        }
    }
    Some(())
}
fn refs(v: &V, out: &mut alloc::collections::BTreeSet<Id>) {
    match v {
        V::Tag(REF, x) => { if let Some(i) = x.id() { out.insert(i); } }
        V::Tag(ANCHOR, a) => { if let Some(i) = a.get("o").and_then(|o| o.id()) { out.insert(i); } }
        V::Tag(_, x) => refs(x, out),
        V::L(l) => l.iter().for_each(|x| refs(x, out)),
        V::M(m) => m.iter().for_each(|(_, x)| refs(x, out)),
        _ => {}
    }
}
/// `run` records: stretches of live elements with one origin, between positions lo and hi.
fn runs_of(cx: &mut Cx, axis: &str, rs: &[Run], lo: u64, hi: u64) {
    let (mut p, mut open): (u64, Option<(Id, u64, u64)>) = (0, None);
    let mut out = Vec::new();
    for r in rs.iter().filter(|r| r.live) {
        let (a, b) = (lo.max(p), hi.min(p + r.count));
        if a < b {
            match &mut open {
                Some((c, _, end)) if *c == r.c && *end == a => *end = b,
                _ => { if let Some(x) = open.take() { out.push(x); } open = Some((r.c, a, b)); }
            }
        }
        p += r.count;
    }
    out.extend(open);
    for (c, a, b) in out {
        let line = format!("run {}=[{},{}] {} sealed={}", axis, a, b, cx.origin(&c), cx.sealed(&c));
        cx.lines.push(line);
    }
}
fn why(cx: &mut Cx, id: &Id, lo: Option<u64>, hi: Option<u64>) -> Option<()> {
    let o = cx.obj(id)?;
    let rs = runs(o.seq.as_ref()?.get("chars")?);
    let n: u64 = rs.iter().filter(|r| r.live).map(|r| r.count).sum();
    let (lo, hi) = (lo.unwrap_or(0), hi.unwrap_or(n).min(n));
    let line = format!("region {} chars=[{},{}] {}", cx.o(id), lo, hi, cx.r(&o.rev));
    cx.lines.push(line);
    runs_of(cx, "chars", &rs, lo, hi);
    // decisions about the changes that wrote the region
    let ids: Vec<Id> = cx.revs.keys().cloned().collect();
    for c in ids {
        let Some(p) = cx.change(&c) else { continue };
        for d in p.get("decisions").map(|d| d.l()).unwrap_or(&[]) {
            let Some(about) = d.get("about").and_then(|a| a.tag(REF)).and_then(|a| a.id()) else { continue };
            if !covered(&rs, lo, hi).contains(&about) { continue; }
            let who = d.get("who").map(|w| cx.jv(w.get("name").unwrap_or(w))).unwrap_or_default();
            let line = format!("decision about={} verdict={} who={} change={} time={}", cx.o(&about), d.get("verdict").and_then(|v| v.s()).unwrap_or(""), who, cx.o(&c), cx.time(&c));
            cx.lines.push(line);
        }
    }
    Some(())
}
fn covered(rs: &[Run], lo: u64, hi: u64) -> Vec<Id> {
    let (mut p, mut out) = (0, Vec::new());
    for r in rs.iter().filter(|r| r.live) {
        if p < hi && lo < p + r.count { out.push(r.c); }
        p += r.count;
    }
    out
}
fn history(cx: &mut Cx, id: &Id) -> Option<()> {
    let chain = cx.chain.clone();
    for (_, n) in &chain {
        let Some(cid) = n.get("change").and_then(|c| c.hash()).and_then(|c| cx.pk.node(&c)).and_then(|n| n.get("id").and_then(|i| i.id())) else { continue };
        let Some(p) = cx.change(&cid) else { continue };
        let ops = p.get("work").and_then(|w| w.get("ops")).map(|o| o.l()).unwrap_or(&[]);
        let mut touched: Vec<Id> = ops.iter().filter_map(|o| o.get("obj").and_then(|i| i.id())).collect();
        touched.sort();
        touched.dedup();
        if !touched.contains(id) { continue; }
        let og = p.get("origin");
        let mut line = format!("change id={} time={} actor={} basis={}", cx.o(&cid), cx.time(&cid),
            p.get("actor").and_then(|a| a.get("who")).map(|w| cx.jv(w.get("name").unwrap_or(w))).unwrap_or_else(|| "null".into()),
            og.and_then(|o| o.get("basis")).and_then(|b| b.s()).unwrap_or("unknown"));
        if let Some(b) = og.and_then(|o| o.get("by")).and_then(|b| b.s()) { line.push_str(&format!(" by={}", b)); }
        line.push_str(&format!(" ops={} touched=[{}]", ops.len(), touched.iter().map(|i| cx.o(i)).collect::<Vec<_>>().join(",")));
        if let Some(note) = p.get("work").and_then(|w| w.get("note")).and_then(|n| n.s()) { line.push_str(&format!(" note={}", json(note))); }
        cx.lines.push(line);
    }
    Some(())
}
fn part(cx: &Cx, anchor: String, ty: &str, label: &str, size: usize, changed: Option<Id>, parts: Option<usize>) -> String {
    let label: String = label.chars().take(60).collect();
    let mut s = format!("part {} type={} label={} size={}", anchor, ty, json(&label), size);
    if let Some(c) = changed {
        let p = cx.change(&c);
        let og = p.as_ref().and_then(|p| p.get("origin"));
        s.push_str(&format!(" changed={} by={} basis={}", cx.time(&c), og.and_then(|o| o.get("by")).and_then(|b| b.s()).unwrap_or("unknown"), og.and_then(|o| o.get("basis")).and_then(|b| b.s()).unwrap_or("unknown")));
    }
    if let Some(n) = parts { s.push_str(&format!(" parts={}", n)); }
    s
}
/// 10.2: the outline of a text, or of blocks of it within positions lo..hi.
fn expand_text(cx: &mut Cx, o: &Obj, lo: u64, hi: u64) -> Option<()> {
    let chars: Vec<char> = o.p.get("chars")?.s()?.chars().collect();
    let rs = runs(o.seq.as_ref()?.get("chars")?);
    let all = blocks(o);
    let inside: Vec<usize> = (0..all.len()).filter(|&i| all[i].lo >= lo && all[i].hi <= hi && (all[i].lo < hi || lo == hi)).collect();
    // the shallowest heading level with two or more headings
    let mut level = None;
    for l in 1..=6 {
        if inside.iter().filter(|&&i| all[i].role == "heading" && all[i].level == l).count() >= 2 { level = Some(l); break; }
    }
    let mut groups: Vec<(usize, usize, bool)> = Vec::new(); // first block, one past the last, begins with its heading
    match level {
        Some(l) => {
            for &i in &inside {
                let head = all[i].role == "heading" && all[i].level <= l;
                match groups.last_mut() {
                    Some(g) if !head => g.1 = i + 1,
                    _ => groups.push((i, i + 1, head)),
                }
            }
        }
        None => groups = inside.iter().map(|&i| (i, i + 1, false)).collect(),
    }
    for (a, b, head) in groups {
        let (plo, phi) = (all[a].lo, all[b - 1].hi);
        let label: String = chars[all[a].lo as usize..all[a].hi as usize].iter().collect();
        let ty = if level.is_some() { "section" } else { all[a].role.as_str() };
        let size = plain_blocks(&chars, &all, a, b).chars().count();
        let anchor = format!("{} chars=[{},{}] {}", cx.o(&o.id), plo, phi, cx.r(&o.rev));
        let n = if level.is_some() { Some(b - a - head as usize) } else { None };
        let line = part(cx, anchor, ty, &label, size, cx.last_change(&rs, plo, phi.max(plo + 1)), n);
        cx.lines.push(line);
    }
    Some(())
}
fn label_of(o: &Obj) -> String {
    for k in ["label", "name"] {
        if let Some(s) = o.p.get(k).and_then(|x| x.s()) { return s.into(); }
    }
    String::new()
}
fn plain_size(cx: &Cx, o: &Obj) -> usize {
    match o.ty.as_str() {
        "ufo.text" => { let chars: Vec<char> = o.p.get("chars").and_then(|c| c.s()).unwrap_or("").chars().collect(); let bs = blocks(o); if bs.is_empty() { chars.len() } else { plain_blocks(&chars, &bs, 0, bs.len()).chars().count() } }
        "ufo.face" | "ufo.portal" => o.p.get("of").and_then(|x| x.tag(REF)).and_then(|x| x.id()).and_then(|i| cx.obj(&i)).map(|t| plain_size(cx, &t)).unwrap_or(0),
        _ => label_of(o).chars().count(),
    }
}
fn object_part(cx: &Cx, o: &Obj) -> String {
    let anchor = format!("{} {}", cx.o(&o.id), cx.r(&o.rev));
    part(cx, anchor, &o.ty, &label_of(o), plain_size(cx, o), Some(o.by), None)
}
fn expand_universe(cx: &mut Cx) -> Option<()> {
    let u = cx.obj(&[0; 16])?;
    let mut first: Vec<Id> = Vec::new();
    if let Some(V::M(roots)) = u.p.get("roots") {
        for (_, r) in roots { if let Some(i) = r.tag(REF).and_then(|x| x.id()) { if !first.contains(&i) { first.push(i); } } }
    }
    for f in u.p.get("faces").map(|f| f.l()).unwrap_or(&[]) {
        if let Some(i) = f.tag(REF).and_then(|x| x.id()) { if !first.contains(&i) { first.push(i); } }
    }
    let mut rest: Vec<(String, String, Id)> = Vec::new();
    let ids: Vec<Id> = cx.revs.keys().cloned().collect();
    for i in ids {
        if i == [0; 16] || first.contains(&i) { continue; }
        if let Some(o) = cx.obj(&i) { rest.push((o.ty.clone(), label_of(&o), i)); }
    }
    rest.sort();
    for i in first.iter().chain(rest.iter().map(|r| &r.2)) {
        if let Some(o) = cx.obj(i) { let line = object_part(cx, &o); cx.lines.push(line); }
    }
    Some(())
}
fn overview(cx: &mut Cx) -> Option<()> {
    let u = cx.obj(&[0; 16])?;
    let head = cx.chain.first()?.clone();
    let mut types: BTreeMap<String, usize> = BTreeMap::new();
    let (mut times, mut actors): (Vec<i64>, Vec<String>) = (Vec::new(), Vec::new());
    let ids: Vec<Id> = cx.revs.keys().cloned().collect();
    for i in &ids {
        let Some(o) = cx.obj(i) else { continue };
        *types.entry(o.ty.clone()).or_insert(0) += 1;
        if o.ty == "ufo.change" {
            times.push(cx.time(i));
            if let Some(a) = o.p.get("actor").and_then(|a| a.get("who")).map(|w| cx.jv(w.get("name").unwrap_or(w))) { if !actors.contains(&a) { actors.push(a); } }
        }
    }
    actors.sort();
    let line = format!("universe lineage={} commit={} height={} objects={} types=[{}] changes={} first={} last={} actors=[{}]",
        hex(u.p.get("lineage")?.b()?), cx.c(&head.0), head.1.get("height")?.i()?, ids.len(),
        types.iter().map(|(k, n)| format!("{}:{}", k, n)).collect::<Vec<_>>().join(","), times.len(),
        times.iter().min().unwrap_or(&0), times.iter().max().unwrap_or(&0), actors.join(","));
    cx.lines.push(line);
    for s in cx.pk.frames().1.iter().filter_map(|s| decode(s)) {
        let mut line = format!("seal commit={} key={} status=unchecked", s.get("commit").and_then(|c| c.hash()).map(|c| cx.c(&c)).unwrap_or_default(), s.get("key").and_then(|k| k.b()).map(hex).unwrap_or_default());
        if let Some(n) = s.get("name").and_then(|n| n.s()) { line.push_str(&format!(" name={}", json(n))); }
        if let Some(t) = s.get("time").and_then(|t| t.i()) { line.push_str(&format!(" time={}", t)); }
        cx.lines.push(line);
    }
    if let Some(V::M(fs)) = u.p.get("features") {
        for (name, f) in fs {
            let line = format!("feature name={} v={} required={} supported={}", name, f.get("v").and_then(|v| v.i()).unwrap_or(0), f.get("required") == Some(&V::Bool(true)), name == "ufo.text");
            cx.lines.push(line);
        }
    }
    for f in u.p.get("faces").map(|f| f.l()).unwrap_or(&[]) {
        let Some(o) = f.tag(REF).and_then(|x| x.id()).and_then(|i| cx.obj(&i)) else { continue };
        let line = format!("face id={} kind=sampled status=current medium={} label={}", cx.o(&o.id), o.p.get("medium").and_then(|m| m.s()).unwrap_or(""), json(&label_of(&o)));
        cx.lines.push(line);
    }
    expand_universe(cx)
}

pub fn project(pk: &Pack, q: &V) -> Option<V> {
    let commit: H = q.get("commit").and_then(|c| c.s()).and_then(|s| crate::query::chain(pk).iter().map(|c| c.0).find(|h| hex(h) == s)).unwrap_or(pk.head);
    let mut cx = Cx { pk, commit, revs: objects(pk, &commit).into_iter().collect(), chain: chain(pk), lines: Vec::new() };
    let name = q.get("name")?.s()?;
    let id: Option<Id> = q.get("o").and_then(|o| o.s()).and_then(|s| cx.revs.keys().find(|k| hex(&k[..]) == s).cloned());
    let (lo, hi) = (q.get("lo").and_then(|x| x.i()).map(|x| x as u64), q.get("hi").and_then(|x| x.i()).map(|x| x as u64));
    let mut args = String::new();
    if let Some(i) = &id {
        args = format!(" {}", cx.o(i));
        if let (Some(a), Some(b)) = (lo, hi) { args.push_str(&format!(" chars=[{},{}]", a, b)); }
    }
    match (name, &id) {
        ("overview", _) => overview(&mut cx)?,
        ("text", Some(i)) => text(&mut cx, i)?,
        ("object", Some(i)) => object(&mut cx, i)?,
        ("history", Some(i)) => history(&mut cx, i)?,
        ("why", Some(i)) => why(&mut cx, i, lo, hi)?,
        ("expand", None) => expand_universe(&mut cx)?,
        ("expand", Some(i)) => {
            let o = cx.obj(i)?;
            if o.ty == "ufo.text" { expand_text(&mut cx, &o, lo.unwrap_or(0), hi.unwrap_or(u64::MAX))? } else { return None }
        }
        _ => return None,
    }
    let mut s = format!("{}{} @ commit={}\n", name, args, cx.c(&commit));
    for l in &cx.lines { s.push_str(l); s.push('\n'); }
    s.push_str(&format!("end lines={}\n", cx.lines.len()));
    Some(V::T(s))
}
