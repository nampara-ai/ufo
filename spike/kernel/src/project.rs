// Throwaway spike kernel: projections (SPEC Appendix B). Not the beginning of the implementation.
// A projection is a list of records, and a record is a value: a map whose first field, `is`, is its
// kind, with its other fields after it in the order Appendix B gives. What an agent reads is that
// list spelled as text by one function (`spell`), and what a formula is given by `ask` is the list
// itself (`records`). Nothing is spelled and then read back.
use crate::pack::*;
use crate::query::*;
use crate::value::*;
use crate::small::{Map, Set};
use crate::spell::*;
use alloc::boxed::Box;
use alloc::string::String;
use alloc::vec;
use alloc::vec::Vec;

/// Inside the kernel only, never in a record that is stored: a text that is written bare, as an
/// identity, a hash, an anchor or a word of a fixed set is. Any other text is written in quotes.
const WORD: u64 = u64::MAX;
use crate::AGENT;
fn w(s: impl Into<String>) -> V {
    V::Tag(WORD, Box::new(V::T(s.into())))
}
/// A record being made: its kind, then its fields in order.
struct R(Vec<(String, V)>);
impl R {
    fn new(kind: &str) -> R {
        R(vec![("is".into(), w(kind))])
    }
    fn f(mut self, name: &str, v: V) -> R {
        self.0.push((name.into(), v));
        self
    }
    fn opt(self, name: &str, v: Option<V>) -> R {
        match v { Some(v) => self.f(name, v), None => self }
    }
    fn more(mut self, fields: Vec<(String, V)>) -> R {
        self.0.extend(fields);
        self
    }
}
fn int(n: usize) -> V {
    V::Int(n as i64)
}

struct Cx<'a> {
    pk: &'a Pack,
    commit: H,
    revs: Map<Id, H>,
    chain: Vec<(H, V)>,
    recs: Vec<V>,
    full: bool,
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
            c if (c as u32) < 32 => { o.push_str("\\u00"); o.push_str(&hex(&[c as u8])); }
            c => o.push(c),
        }
    }
    o.push('"');
    o
}
fn prefix(h: &[u8], others: &mut dyn Iterator<Item = &[u8]>, whole: bool) -> String {
    let full = hex(h);
    if whole {
        return full;
    }
    let all: Vec<String> = others.filter(|o| *o != h).map(hex).collect();
    let mut n = 8;
    while n < full.len() && all.iter().any(|o| o[..n] == full[..n]) {
        n += 1;
    }
    String::from(&full[..n])
}
impl<'a> Cx<'a> {
    fn o(&self, id: &Id) -> String {
        cat!("o:", prefix(id, &mut self.revs.keys().map(|k| &k[..]), self.full))
    }
    fn r(&self, h: &H) -> String {
        cat!("r:", prefix(h, &mut self.revs.0.iter().map(|e| &e.1[..]), self.full))
    }
    fn c(&self, h: &H) -> String {
        cat!("c:", prefix(h, &mut self.chain.iter().map(|k| &k.0[..]), self.full))
    }
    fn obj(&self, id: &Id) -> Option<Obj> {
        self.pk.object(&self.commit, id)
    }
    /// A value in the spelling an agent writes (Appendix B).
    fn jv(&self, v: &V) -> String {
        match v {
            V::Null => "null".into(),
            V::Bool(b) => cat!(b),
            V::Int(i) => cat!(i),
            V::F(x) => { let mut s = String::new(); float_into(*x, &mut s); if !s.contains('.') { s.push_str(".0"); } s }
            V::T(s) => json(s),
            V::B(b) => cat!("{\"$bytes\":\"", hex(b), "\"}"),
            V::L(l) => cat!("[", l.iter().map(|x| self.jv(x)).collect::<Vec<_>>().join(","), "]"),
            V::M(m) => cat!("{", m.iter().map(|(k, x)| cat!(json(k), ":", self.jv(x))).collect::<Vec<_>>().join(","), "}"),
            V::Tag(REF, x) => cat!("{\"$ref\":\"", x.id().map(|i| self.o(&i)).unwrap_or_default(), "\"}"),
            V::Tag(ANCHOR, a) => cat!("{\"$anchor\":", json(&self.anchor(a)), "}"),
            V::Tag(WORD, x) => x.s().unwrap_or("").into(),
            V::Tag(n, x) => cat!("{\"$tag", n, "\":", self.jv(x), "}"),
        }
    }
    /// An anchor as projections write one, resolved against the commit (4.3): the identity; each region as it
    /// resolves, or `detached`; the revision. A sequence region is two positions; a continuous one is clipped to
    /// the extent, or marked `unclipped` where the extent is not known; a keyed one is the keys that are present.
    fn anchor(&self, a: &V) -> String {
        let Some(id) = a.get("o").and_then(|o| o.id()) else { return String::new() };
        let mut s = self.o(&id);
        let Some(o) = self.obj(&id) else { s.push_str("/detached"); return s };
        if let Some(V::M(axes)) = a.get("a") {
            for (ax, reg) in axes {
                put!(s; "/", ax, "=");
                let l = reg.l();
                match l.first().and_then(|k| k.s()) {
                    Some("s") => match o.seq.as_ref().and_then(|q| q.get(ax)).map(|q| runs(q)).and_then(|rs| region(&rs, reg)) {
                        Some((lo, hi)) => put!(s; "[", lo, ",", hi, "]"),
                        None => s.push_str("detached"),
                    },
                    Some("c") => match extent(&o, ax, reg) {
                        (None, _) => s.push_str("detached"),
                        (Some((lo, hi)), clipped) => {
                            let num = |x: f64| if matches!(l.get(1), Some(V::Int(_))) { V::Int(x as i64) } else { V::F(x) };
                            put!(s; if clipped { "" } else { "unclipped" }, "[", self.jv(&num(lo)), ",", self.jv(&num(hi)), "]");
                        }
                    },
                    _ => {
                        let present: Vec<&str> = l.iter().skip(1).filter_map(|k| k.s()).filter(|k| o.p.get(ax).map_or(false, |m| m.get(k).is_some())).collect();
                        if present.is_empty() { s.push_str("detached") } else { put!(s; "[", present.join(","), "]") }
                    }
                }
            }
        }
        s.push('/');
        s.push_str(&self.r(&o.rev));
        s
    }
    /// An anchor to an object at its revision, with a region of positions on one axis if one is given: one value, written with no space.
    fn at(&self, o: &Obj, region: Option<(&str, u64, u64)>) -> V {
        let mut s = self.o(&o.id);
        if let Some((ax, lo, hi)) = region { put!(s; "/", ax, "=[", lo, ",", hi, "]"); }
        put!(s; "/", self.r(&o.rev));
        w(s)
    }
    fn push(&mut self, r: R) {
        self.recs.push(V::M(r.0));
    }
    /// The name of whoever a change names under `who`, as a value.
    fn name(v: &V) -> V {
        v.get("name").unwrap_or(v).clone()
    }
    /// Names with none twice, in the order of their spelling.
    fn names(&self, mut vs: Vec<V>) -> V {
        crate::small::sort_by(&mut vs, |a, b| self.jv(a).cmp(&self.jv(b)));
        vs.dedup();
        V::L(vs)
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
    fn origin(&self, id: &Id) -> Vec<(String, V)> {
        let p = self.change(id);
        let og = p.as_ref().and_then(|p| p.get("origin"));
        let f = |k: &str| og.and_then(|o| o.get(k));
        let mut r = R(Vec::new()).f("change", w(self.o(id))).f("basis", w(f("basis").and_then(|b| b.s()).unwrap_or("unknown"))).opt("by", f("by").and_then(|b| b.s()).map(w));
        for k in ["who", "model", "tool", "asked", "prompt", "method", "confidence"] {
            r = r.opt(k, f(k).map(Self::name));
        }
        r.0
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

#[inline(never)] // an entry of the agent component: kept a function of its own, so that the kernel can be divided here
fn text(cx: &mut Cx, id: &Id) -> Option<()> {
    let o = cx.obj(id)?;
    let s = o.p.get("chars")?.s()?;
    let n = s.chars().count();
    let r = R::new("text").f("at", cx.at(&o, Some(("chars", 0, n as u64)))).f("chars", int(n)).f("s", t(s));
    cx.push(r);
    Some(())
}
#[inline(never)] // an entry of the agent component: kept a function of its own, so that the kernel can be divided here
fn object(cx: &mut Cx, id: &Id) -> Option<()> {
    let o = cx.obj(id)?;
    let rev = cx.pk.node(&o.rev)?.get("rev")?.i()?;
    let r = R::new("object").f("id", w(cx.o(id))).f("type", w(o.ty.as_str())).f("rev", V::Int(rev)).f("r", w(cx.r(&o.rev))).f("by", w(cx.o(&o.by)));
    cx.push(r);
    if let V::M(m) = &o.p {
        for (k, v) in m {
            let r = R::new("prop").f("key", w(k.as_str()));
            cx.push(match v {
                V::T(s) if s.chars().count() > 200 => r.f("len", int(s.chars().count())).f("kind", w("text")),
                V::B(b) if b.len() > 200 => r.f("len", int(b.len())).f("kind", w("bytes")),
                _ => r.f("value", v.clone()),
            });
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
                let mut found = Set::new();
                refs(v, &mut found);
                if found.contains(id) { let r = R::new("referrer").f("id", w(cx.o(&other))).f("key", w(k.as_str())); cx.push(r); }
            }
        }
    }
    Some(())
}
fn refs(v: &V, out: &mut Set<Id>) {
    match v {
        V::Tag(REF, x) => { if let Some(i) = x.id() { out.insert(i); } }
        V::Tag(ANCHOR, a) => { if let Some(i) = a.get("o").and_then(|o| o.id()) { out.insert(i); } }
        V::Tag(_, x) => refs(x, out),
        V::L(l) => l.iter().for_each(|x| refs(x, out)),
        V::M(m) => m.iter().for_each(|(_, x)| refs(x, out)),
        _ => {}
    }
}
/// `run` records: stretches of live elements with one origin, between positions lo and hi. Where the change
/// that inserted elements says who first introduced them (`origin.sources`, 5.4: it put back what another had
/// written), the origin given is that first change's, and `via` names the change that put them here.
fn runs_of(cx: &mut Cx, axis: &str, rs: &[Run], lo: u64, hi: u64) {
    let (mut p, mut out): (u64, Vec<(Id, Option<Id>, u64, u64)>) = (0, Vec::new());
    for r in rs.iter().filter(|r| r.live) {
        let sources = cx.change(&r.c).and_then(|c| c.get("origin")?.get("sources").cloned());
        let mut n = r.first;
        while n < r.first + r.count {
            // the source of element n of this change, and the number its stretch runs up to
            let (mut first, mut upto, mut at) = (None, u64::MAX, 0u64);
            for s in sources.as_ref().map(|s| s.l()).unwrap_or(&[]) {
                let count = s.l().first().and_then(|x| x.i()).unwrap_or(0) as u64;
                if n < at + count { (first, upto) = (s.l().get(1).and_then(|x| x.id()), at + count); break; }
                at += count;
            }
            let end = upto.min(r.first + r.count);
            let (a, b) = (lo.max(p + (n - r.first)), hi.min(p + (end - r.first)));
            if a < b {
                let (c, via) = (first.unwrap_or(r.c), first.map(|_| r.c));
                match out.last_mut() {
                    Some(x) if x.0 == c && x.1 == via && x.3 == a => x.3 = b,
                    _ => out.push((c, via, a, b)),
                }
            }
            n = end;
        }
        p += r.count;
    }
    for (c, via, a, b) in out {
        let r = R::new("run").f(axis, V::L(vec![V::Int(a as i64), V::Int(b as i64)])).more(cx.origin(&c)).opt("via", via.map(|v| w(cx.o(&v)))).f("sealed", V::Bool(cx.sealed(&c)));
        cx.push(r);
    }
}
fn why(cx: &mut Cx, id: &Id, lo: Option<u64>, hi: Option<u64>) -> Option<()> {
    let o = cx.obj(id)?;
    let rs = o.seq.as_ref().and_then(|q| q.get("chars")).map(runs);
    match &rs {
        Some(rs) => {
            let n: u64 = rs.iter().filter(|r| r.live).map(|r| r.count).sum();
            let (lo, hi) = (lo.unwrap_or(0), hi.unwrap_or(n).min(n));
            let r = R::new("region").f("at", cx.at(&o, Some(("chars", lo, hi))));
            cx.push(r);
            runs_of(cx, "chars", rs, lo, hi);
            // decisions about the changes that wrote the region
            let ids: Vec<Id> = cx.revs.keys().cloned().collect();
            for c in ids {
                let Some(p) = cx.change(&c) else { continue };
                for d in p.get("decisions").map(|d| d.l()).unwrap_or(&[]) {
                    let Some(about) = d.get("about").and_then(|a| a.tag(REF)).and_then(|a| a.id()) else { continue };
                    if !covered(rs, lo, hi).contains(&about) { continue; }
                    let r = R::new("decision").f("about", w(cx.o(&about))).f("verdict", w(d.get("verdict").and_then(|v| v.s()).unwrap_or(""))).f("who", d.get("who").map_or(V::Null, Cx::name)).f("change", w(cx.o(&c))).f("time", V::Int(cx.time(&c)));
                    cx.push(r);
                }
            }
        }
        None => { let r = R::new("region").f("at", cx.at(&o, None)); cx.push(r); }
    }
    // of a derived object (5.3): each source, a pin, with its state now (4.4); and how it was made
    if let Some(from) = o.p.get("from") {
        for pin in from.get("sources").map(|x| x.l()).unwrap_or(&[]) {
            let Some(a) = pin.tag(ANCHOR) else { continue };
            let axis = match a.get("a") { Some(V::M(m)) => m.first().map(|(k, r)| (k.as_str(), r)), _ => None };
            let now = a.get("o").and_then(|i| i.id()).zip(a.get("s").and_then(|x| x.b())).and_then(|(i, salt)| digest(cx.pk, &cx.commit, &i, axis, salt));
            let status = match now { None => "detached", Some((d, _, _)) if a.get("d").and_then(|x| x.hash()) == Some(d) => "current", _ => "stale" };
            let r = R::new("source").f("at", w(cx.anchor(a))).f("status", w(status));
            cx.push(r);
        }
        let mut r = R::new("made").f("how", w(from.get("how").and_then(|h| h.s()).unwrap_or("")));
        if let Some(by) = from.get("by").and_then(|b| b.tag(REF)).and_then(|b| b.id()) { r = r.more(cx.origin(&by)); }
        cx.push(r);
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
/// `history`: the changes that touched an object, or with none named every change of the
/// universe, newest first. A change whose `work` is withheld (TRAVEL 13.3) cannot be asked what it
/// touched: it is listed, with `ops` and `touched` given as `withheld` (E11: withheld, never
/// missing). So is a change whose own revision is withheld, of which the commit says only that it was.
fn history(cx: &mut Cx, id: Option<&Id>) -> Option<()> {
    let chain = cx.chain.clone();
    // R7: the current decision about a change is the latest in the Chronicle that is about it
    let mut decided: Vec<(Id, V, V)> = Vec::new();
    for (_, n) in &chain {
        let Some(p) = n.get("change").and_then(|c| c.hash()).and_then(|c| cx.pk.node(&c)).and_then(|n| n.get("p").cloned()) else { continue };
        for d in p.get("decisions").map(|d| d.l()).unwrap_or(&[]) {
            if let Some(about) = d.get("about").and_then(|a| a.tag(REF)).and_then(|a| a.id()).filter(|a| decided.iter().all(|e| e.0 != *a)) {
                decided.push((about, d.get("verdict").cloned().unwrap_or(V::Null), d.get("who").map_or(V::Null, Cx::name)));
            }
        }
    }
    for (h, n) in &chain {
        let Some(cid) = n.get("change").and_then(|c| c.hash()).and_then(|c| cx.pk.node(&c)).and_then(|n| n.get("id").and_then(|i| i.id())) else {
            let wh = || w("withheld");
            cx.push(R::new("change").f("id", wh()).f("commit", w(cx.c(h))).f("time", wh()).f("actor", wh()).f("basis", w("unknown")).f("ops", wh()).f("touched", wh()).f("verdict", w("none")));
            continue;
        };
        let Some(p) = cx.change(&cid) else { continue };
        let held = p.get("work").map_or(false, |w| w.tag(INDIRECT).is_none());
        let ops = p.get("work").and_then(|w| w.get("ops")).map(|o| o.l()).unwrap_or(&[]);
        let mut touched: Vec<Id> = ops.iter().filter_map(|o| o.get("obj").and_then(|i| i.id())).collect();
        crate::small::sort(&mut touched);
        touched.dedup();
        if held && id.map_or(false, |id| !touched.contains(id)) { continue; }
        let og = p.get("origin");
        let mut r = R::new("change").f("id", w(cx.o(&cid))).f("commit", w(cx.c(h))).f("time", V::Int(cx.time(&cid))).f("actor", p.get("actor").and_then(|a| a.get("who")).map_or(V::Null, Cx::name))
            .f("basis", w(og.and_then(|o| o.get("basis")).and_then(|b| b.s()).unwrap_or("unknown"))).opt("by", og.and_then(|o| o.get("by")).and_then(|b| b.s()).map(w));
        r = if held {
            r.f("ops", int(ops.len())).f("touched", V::L(touched.iter().map(|i| w(cx.o(i))).collect()))
        } else {
            r.f("ops", w("withheld")).f("touched", w("withheld"))
        };
        let verdict = decided.iter().find(|e| e.0 == cid);
        r = r.f("verdict", w(verdict.and_then(|e| e.1.s()).unwrap_or("none"))).opt("decided-by", verdict.map(|e| e.2.clone()));
        r = r.opt("note", p.get("work").and_then(|w| w.get("note")).and_then(|n| n.s()).map(t));
        cx.push(r);
    }
    Some(())
}
/// `leaving` (10.1, E12): what an export of the universe would carry, by the layers of SPEC 2.5, with
/// those of the universes it takes in. One `layer` record each for `content`, `attribution` and
/// `history`, in that order; then `lacks`, always, so that it is found by its place; then the seals. `lacks`: whether the copy would lack
/// history, by this choice or because what is held here already lacks some. Of each layer: whether
/// it is included; `objects`, the live objects, the attributing changes, or the objects whose
/// current revision is neither; `bytes`, of its records as they are framed here; and of the changes
/// it holds (for `attribution` the attributing changes, for `history` the changes whose `work` is
/// here) their number, the first and last of their times, the names of their actors and their models.
fn leaving(cx: &mut Cx, history: bool) -> Option<()> {
    let pk = cx.pk;
    let (content, attribution, attributing, live) = split(pk);
    let (all, _) = pk.frames();
    let bytes = |keep: &dyn Fn(&H) -> bool| all.iter().filter(|(_, h, _)| keep(h)).map(|(_, _, n)| *n).sum::<usize>();
    let other = |h: &H| !content.contains(h) && !attribution.contains(h);
    // every universe taken in, by its commit; and every change of each, by the hash its commit gives
    let mut universes: Vec<H> = Vec::new();
    for (u, _) in &live { if !universes.contains(u) { universes.push(*u); } }
    let (mut worked, mut lacking, mut rest) = (Vec::new(), false, 0usize);
    for u in &universes {
        rest += objects(pk, u).iter().filter(|(_, r)| other(r) && pk.node(r).is_some()).count();
        let mut at = Some(*u);
        while let Some(n) = at.and_then(|h| pk.node(&h)) {
            at = n.get("parents").and_then(|p| p.l().first()).and_then(|p| p.hash());
            let p = n.get("change").and_then(|c| c.hash()).and_then(|c| pk.node(&c)).and_then(|c| c.get("p").cloned());
            let here = p.as_ref().and_then(|p| p.get("work")?.tag(INDIRECT)?.l().get(1)?.hash()).map_or(false, |h| pk.record(1, &h).is_some());
            lacking |= !here;
            worked.extend(p.filter(|_| here));
        }
    }
    let credited: Vec<V> = attributing.iter().filter_map(|(u, i)| pk.object(u, i)).map(|o| o.p).collect();
    let said = |cx: &Cx, name: &str, included: bool, objects: usize, bytes: usize, changes: &[V]| {
        let (mut actors, mut models, mut times): (Vec<V>, Vec<V>, Vec<i64>) = (Vec::new(), Vec::new(), Vec::new());
        for p in changes {
            times.extend(p.get("time").and_then(|t| t.i()));
            actors.extend(p.get("actor").and_then(|a| a.get("who")).map(Cx::name));
            models.extend(p.get("origin").and_then(|o| o.get("model")).cloned());
        }
        R::new("layer").f("name", w(name)).f("included", V::Bool(included)).f("objects", int(objects)).f("bytes", int(bytes)).f("actors", cx.names(actors)).f("models", cx.names(models))
            .f("changes", int(changes.len())).f("first", V::Int(*times.iter().min().unwrap_or(&0))).f("last", V::Int(*times.iter().max().unwrap_or(&0)))
    };
    let layers = [said(cx, "content", true, live.len(), bytes(&|h| content.contains(h)), &[]), said(cx, "attribution", true, credited.len(), bytes(&|h| attribution.contains(h)), &credited), said(cx, "history", history, rest, bytes(&other), &worked)];
    for r in layers { cx.push(r); }
    // what this kernel cannot classify, frames of kinds it does not know: how many and how much. A copy for
    // outside readers leaves them out (E10); a whole copy is the pack as it stands, and carries them
    let (unread, unread_bytes) = pk.unknown();
    cx.push(R::new("lacks").f("history", V::Bool(!history || lacking)).f("blobs", V::Int(0)).f("unread", int(unread)).f("unread-bytes", int(unread_bytes)));
    seals(cx);
    Some(())
}
/// A seal (14.2) as its frame holds it, and the bytes that were signed: the ten bytes `ufo-seal-1`, then the
/// SHA-256 of the encoding of the seal without its signature.
pub fn seal_at(pk: &Pack, i: usize) -> Option<(V, Vec<u8>)> {
    let s = decode(pk.frames().1.get(i)?)?;
    let V::M(m) = &s else { return None };
    let unsigned = V::M(m.iter().filter(|e| e.0 != "signature").cloned().collect());
    let mut message = b"ufo-seal-1".to_vec();
    message.extend(sha256(&[&encode(&unsigned)]));
    Some((s, message))
}
/// `seal` records. The status of each is what the host found when it was asked to check the signature:
/// `valid`, `invalid`, or `unchecked` where it could not (H2: a capability's stated result when it is absent).
/// `behind` is how many commits have been made since the one it seals, or -1 where that commit is not in the chain.
fn seals(cx: &mut Cx) {
    for i in 0.. {
        let Some((s, _)) = seal_at(cx.pk, i) else { break };
        let commit = s.get("commit").and_then(|c| c.hash());
        let behind = commit.and_then(|c| cx.chain.iter().position(|e| e.0 == c));
        let r = R::new("seal").f("commit", w(commit.map(|c| cx.c(&c)).unwrap_or_default())).f("key", w(s.get("key").and_then(|k| k.b()).map(hex).unwrap_or_default()))
            .f("status", w(match crate::sealed(i) { Some(true) => "valid", Some(false) => "invalid", None => "unchecked" })).f("name", t(s.get("name").and_then(|n| n.s()).unwrap_or("")))
            .opt("time", s.get("time").and_then(|t| t.i()).map(V::Int)).f("behind", behind.map_or(V::Int(-1), int));
        cx.push(r);
    }
}
fn part(cx: &Cx, anchor: V, ty: &str, label: &str, size: usize, changed: Option<Id>, parts: Option<usize>) -> R {
    let label: String = label.chars().take(60).collect();
    let mut r = R::new("part").f("at", anchor).f("type", w(ty)).f("label", V::T(label)).f("size", int(size));
    if let Some(c) = changed {
        let p = cx.change(&c);
        let og = p.as_ref().and_then(|p| p.get("origin"));
        let word = |k: &str| w(og.and_then(|o| o.get(k)).and_then(|b| b.s()).unwrap_or("unknown"));
        r = r.f("changed", V::Int(cx.time(&c))).f("by", word("by")).f("basis", word("basis"));
    }
    r.opt("parts", parts.map(int))
}
/// The length of a plain-text face (8.3), without its last line end.
fn size(s: &str) -> usize {
    s.strip_suffix('\n').unwrap_or(s).chars().count()
}
/// 10.2: the outline of a text, or of blocks of it within positions lo..hi. The blocks and the plain
/// text are the composer's (7.7, 8.3): there is one of each in the kernel.
#[inline(never)] // an entry of the agent component: kept a function of its own, so that the kernel can be divided here
fn expand_text(cx: &mut Cx, o: &Obj, lo: u64, hi: u64) -> Option<()> {
    use crate::layout::{blocks, level, plain_text, spans};
    let chars: Vec<char> = o.p.get("chars")?.s()?.chars().collect();
    let seq = o.seq.as_ref()?.get("chars")?;
    let rs = runs(seq);
    let sp = spans(o, &rs);
    let all = blocks(&sp, 0, chars.len());
    let role = |i: usize| all[i].span.map(|k| sp[k].role).filter(|r| !r.is_empty()).unwrap_or("paragraph");
    let lev = |i: usize| all[i].span.map_or(1, |k| level(&sp[k]));
    let inside: Vec<usize> = (0..all.len()).filter(|&i| all[i].a as u64 >= lo && all[i].b as u64 <= hi && ((all[i].a as u64) < hi || lo == hi)).collect();
    // the shallowest heading level with two or more headings
    let level = (1..=6).find(|&l| inside.iter().filter(|&&i| role(i) == "heading" && lev(i) == l).count() >= 2);
    let mut groups: Vec<(usize, usize, bool)> = Vec::new(); // first block, one past the last, begins with its heading
    match level {
        Some(l) => {
            for &i in &inside {
                let head = role(i) == "heading" && lev(i) <= l;
                match groups.last_mut() {
                    Some(g) if !head => g.1 = i + 1,
                    _ => groups.push((i, i + 1, head)),
                }
            }
        }
        None => groups = inside.iter().map(|&i| (i, i + 1, false)).collect(),
    }
    for (a, b, head) in groups {
        let (plo, phi) = (all[a].a, all[b - 1].b);
        let label: String = chars[all[a].a..all[a].b].iter().collect();
        let ty = if level.is_some() { "section" } else { role(a) };
        let mut s = String::new();
        plain_text(cx.pk, &cx.commit, o, None, Some((a, b)), &mut s, 0);
        let n = if level.is_some() { Some(b - a - head as usize) } else { None };
        let r = part(cx, cx.at(o, Some(("chars", plo as u64, phi as u64))), ty, &label, size(&s), cx.last_change(&rs, plo as u64, (phi as u64).max(plo as u64 + 1)), n);
        cx.push(r);
    }
    Some(())
}
/// 10.2: the outline of a stretch of a timeline (4.5): what plays in it. One part for each play that covers
/// some of positions lo..hi (or the one position, where they are the same), anchored to what it plays at the
/// times of its own that fall there: its `offset`, and the count on from the play's first element. Only
/// elements inserted by the change that inserted that first element are the play's own (T3).
#[inline(never)] // an entry of the agent component: kept a function of its own, so that the kernel can be divided here
fn expand_clock(cx: &mut Cx, o: &Obj, lo: u64, hi: u64) -> Option<()> {
    let rs = runs(o.seq.as_ref()?.get("t")?);
    let Some(V::M(plays)) = o.p.get("plays") else { return Some(()) };
    for (key, pl) in plays {
        let Some(reg) = pl.get("at").and_then(|a| a.tag(ANCHOR)).and_then(|a| a.get("a")).and_then(|a| a.get("t")) else { continue };
        let (Some((a, b)), Some(first)) = (region(&rs, reg), reg.l().get(1).filter(|b| b.s().is_none()).map(|b| b.l())) else { continue };
        let (from, to) = (a.max(lo), b.min(hi.max(lo + 1)));
        if from >= to { continue; }
        let (Some(c0), Some(n0)) = (first.first().and_then(|x| x.id()), first.get(1).and_then(|x| x.i()).zip(first.get(2).and_then(|x| x.i())).map(|(n, side)| n + side)) else { continue };
        let own = |p: u64| element_at(&rs, p).filter(|e| e.0 == c0).map(|e| pl.get("offset").and_then(|o| o.i()).unwrap_or(0) + e.1 as i64 - n0);
        let (Some(t0), Some(t1)) = (own(from), own(to - 1)) else { continue };
        let Some(child) = pl.get("of").and_then(|x| x.tag(REF)).and_then(|x| x.id()).and_then(|i| cx.obj(&i)) else { continue };
        let at = cat!(cx.o(&child.id), "/t=[", t0, ",", if hi > lo { t1 + 1 } else { t1 }, "]/", cx.r(&child.rev));
        let r = part(cx, w(at), &child.ty, key, (to - from) as usize, Some(child.by), None);
        cx.push(r);
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
    let of = o.p.get("of").filter(|_| o.ty == "ufo.face").and_then(|x| x.tag(REF)).and_then(|x| x.id());
    let mut s = String::new();
    crate::layout::plain(cx.pk, &cx.commit, &of.unwrap_or(o.id), &mut s, 0);
    size(&s)
}
fn object_part(cx: &Cx, o: &Obj) -> R {
    part(cx, cx.at(o, None), &o.ty, &label_of(o), plain_size(cx, o), Some(o.by), None)
}
/// The parts of a universe (10.2): its roots and faces, then its other objects by type, label and identity.
fn universe_parts(cx: &mut Cx) -> Option<()> {
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
    crate::small::sort(&mut rest);
    for i in first.iter().chain(rest.iter().map(|r| &r.2)) {
        if let Some(o) = cx.obj(i) { let r = object_part(cx, &o); cx.push(r); }
    }
    Some(())
}
/// `expand` of the universe (10.2): what it is, its seals, features, components and faces, then its parts.
fn expand_universe(cx: &mut Cx) -> Option<()> {
    let u = cx.obj(&[0; 16])?;
    let head = cx.chain.first()?.clone();
    let mut types: Map<String, usize> = Map::new();
    let (mut times, mut actors): (Vec<i64>, Vec<V>) = (Vec::new(), Vec::new());
    let ids: Vec<Id> = cx.revs.keys().cloned().collect();
    for i in &ids {
        let Some(o) = cx.obj(i) else { continue };
        *types.entry(o.ty.clone(), 0) += 1;
        if o.ty == "ufo.change" {
            times.push(cx.time(i));
            actors.extend(o.p.get("actor").and_then(|a| a.get("who")).map(Cx::name));
        }
    }
    let r = R::new("universe").f("lineage", w(hex(u.p.get("lineage")?.b()?))).f("commit", w(cx.c(&head.0))).f("height", V::Int(head.1.get("height")?.i()?)).f("objects", int(ids.len()))
        .f("types", V::M(types.0.iter().map(|(k, n)| (k.clone(), int(*n))).collect())).f("changes", int(times.len()))
        .f("first", V::Int(*times.iter().min().unwrap_or(&0))).f("last", V::Int(*times.iter().max().unwrap_or(&0))).f("actors", cx.names(actors));
    cx.push(r);
    seals(cx);
    if let Some(V::M(fs)) = u.p.get("features") {
        for (name, f) in fs {
            let v = f.get("v").and_then(|v| v.i()).unwrap_or(0);
            let r = R::new("feature").f("name", w(name.as_str())).f("v", V::Int(v)).f("required", V::Bool(f.get("required") == Some(&V::Bool(true)))).f("supported", V::Bool(supported(name, v)));
            cx.push(r);
        }
    }
    // 1.6: what the universe carries for a role, where that is a universe an anchor names: nested if its commit is here
    if let Some(V::M(cs)) = u.p.get("components") {
        for (role, c) in cs {
            let Some(h) = c.tag(ANCHOR).and_then(|a| a.get("u")).and_then(|u| u.hash()) else { continue };
            let r = R::new("component").f("role", w(role.as_str())).f("hash", w(cx.c(&h))).f("status", w(if cx.pk.node(&h).is_some() { "current" } else { "absent" }));
            cx.push(r);
        }
    }
    for f in u.p.get("faces").map(|f| f.l()).unwrap_or(&[]) {
        let Some(o) = f.tag(REF).and_then(|x| x.id()).and_then(|i| cx.obj(&i)) else { continue };
        let r = R::new("face").f("id", w(cx.o(&o.id))).f("kind", w("sampled")).f("status", w("current")).f("medium", w(o.p.get("medium").and_then(|m| m.s()).unwrap_or(""))).f("label", V::T(label_of(&o)));
        cx.push(r);
    }
    universe_parts(cx)
}

/// An object identity as a projection wrote it (`o:` and a prefix, Appendix B), read back: the one identity of
/// the current state that begins so.
pub fn identity(pk: &Pack, spelled: &str) -> Option<Id> {
    let want = spelled.strip_prefix("o:")?;
    let mut found = objects(pk, &pk.head).into_iter().map(|e| e.0).filter(|i| hex(i).starts_with(want));
    found.next().filter(|_| !want.is_empty() && found.next().is_none())
}
/// Whether this reader has what a feature names (1.6): the base has the text profile; described code needs
/// the printer component beside it; nothing else is known here.
/// Whether this reader has a feature at a version (1.6, **C8**): each of those it has, it has at version 1.
pub fn supported(feature: &str, v: i64) -> bool {
    v == 1 && match feature {
        "ufo.text" => true,
        "ufo.code" => crate::held(crate::PRINTER),
        "ufo.formulas" => crate::held(crate::FORMULAS),
        _ => false,
    }
}
/// The features a universe requires that this reader does not have, by name: what is missing (9.1, K7).
pub fn unmet(pk: &Pack) -> Vec<String> {
    match pk.object(&pk.head, &[0; 16]).and_then(|u| u.p.get("features").cloned()) {
        Some(V::M(fs)) => fs.iter().filter_map(|(name, f)| {
            let v = f.get("v").and_then(|v| v.i()).unwrap_or(0);
            if f.get("required") != Some(&V::Bool(true)) || supported(name, v) { None } else if v == 1 { Some(name.clone()) } else { Some(cat!(name, " at version ", v)) }
        }).collect(),
        _ => Vec::new(),
    }
}
/// The records of a projection, in the context they were made in, and its header line. `q` names the
/// projection and gives its arguments. The base of the kernel needs four of them, for the tools: `expand`
/// of the universe, `history`, `why` and `leaving`. The others, and the text of any of them, are for agents.
fn run<'a>(pk: &'a Pack, q: &V) -> Option<(Cx<'a>, String)> {
    let commit: H = q.get("commit").and_then(|c| c.s()).and_then(|s| crate::query::chain(pk).iter().map(|c| c.0).find(|h| hex(h) == s)).unwrap_or(pk.head);
    let mut cx = Cx { pk, commit, revs: rev_map(pk, &commit), chain: chain(pk), recs: Vec::new(), full: q.get("full") == Some(&V::Bool(true)) };
    let name = q.get("name")?.s()?;
    let id: Option<Id> = q.get("o").and_then(|o| o.s()).and_then(|s| cx.revs.keys().find(|k| hex(&k[..]) == s).cloned());
    let (lo, hi) = (q.get("lo").and_then(|x| x.i()).map(|x| x as u64), q.get("hi").and_then(|x| x.i()).map(|x| x as u64));
    let mut args = String::new();
    let whole = q.get("history") != Some(&V::Bool(false));
    if name == "leaving" {
        args = cat!(" history=", whole);
    }
    if let Some(i) = &id {
        args = cat!(" ", cx.o(i));
        if let (Some(a), Some(b)) = (lo, hi) { put!(args; "/", q.get("axis").and_then(|a| a.s()).unwrap_or("chars"), "=[", a, ",", b, "]"); }
    }
    match (name, &id) {
        ("history", i) => {
            history(&mut cx, i.as_ref())?;
            // in parts: with `count`, at most that many of them, after the `first` newest
            if let Some(n) = q.get("count").and_then(|n| n.i()) {
                let from = (q.get("first").and_then(|n| n.i()).unwrap_or(0).max(0) as usize).min(cx.recs.len());
                cx.recs = cx.recs[from..(from + n.max(0) as usize).min(cx.recs.len())].to_vec();
            }
        }
        ("leaving", _) => leaving(&mut cx, whole)?,
        ("why", Some(i)) => why(&mut cx, i, lo, hi)?,
        ("expand", None) => expand_universe(&mut cx)?,
        // 10.1, in part: the seals, each as the host found it; and what is wrong with the storage. A record of the
        // content or attribution layer that is not here is malformed storage (P11); an index that hid a record is wrong (P9)
        ("verify", _) => {
            seals(&mut cx);
            let issue = |record: V, rule: &str, s: &str| R::new("issue").f("class", w("malformed")).f("record", record).f("rule", w(rule)).f("s", t(s));
            for h in crate::query::missing(pk) {
                cx.push(issue(w(cat!("h:", hex(&h).get(..if cx.full { 64 } else { 8 }).unwrap_or(""))), "P11", "a record the document needs is not in the file"));
            }
            if pk.index_wrong() {
                cx.push(issue(w("index"), "P9", "the index is wrong; the file was read by going through all of it"));
            }
        }
        #[cfg(not(feature = "cut-agent"))]
        ("text", Some(i)) if crate::held(AGENT) => text(&mut cx, i)?,
        #[cfg(not(feature = "cut-agent"))]
        ("object", Some(i)) if crate::held(AGENT) => object(&mut cx, i)?,
        #[cfg(not(feature = "cut-agent"))]
        ("expand", Some(i)) if crate::held(AGENT) => {
            let o = cx.obj(i)?;
            match o.ty.as_str() {
                "ufo.text" => expand_text(&mut cx, &o, lo.unwrap_or(0), hi.unwrap_or(u64::MAX))?,
                "ufo.clock" => expand_clock(&mut cx, &o, lo.unwrap_or(0), hi.unwrap_or(u64::MAX))?,
                _ => return None,
            }
        }
        _ => return None,
    }
    let head = cat!(name, args, " @ commit=", cx.c(&commit), "\n");
    Some((cx, head))
}
/// A projection as the text an agent reads (Appendix B): the one spelling of its records.
#[cfg(not(feature = "cut-agent"))]
pub fn project(pk: &Pack, q: &V) -> Option<V> {
    if !crate::held(AGENT) {
        return None; // the text of a projection is the agent component's
    }
    let (cx, s) = run(pk, q)?;
    Some(V::T(spelled(&cx, s)))
}
#[cfg(not(feature = "cut-agent"))]
#[inline(never)] // an entry of the agent component
fn spelled(cx: &Cx, mut s: String) -> String {
    for r in &cx.recs {
        let V::M(fields) = r else { continue };
        for (i, (k, v)) in fields.iter().enumerate() {
            if i > 0 { put!(s; " ", k, "="); }
            s.push_str(&cx.jv(v));
        }
        s.push('\n');
    }
    put!(s; "end lines=", cx.recs.len(), "\n");
    s
}
#[cfg(feature = "cut-agent")]
pub fn project(_: &Pack, _: &V) -> Option<V> {
    None
}
/// A projection as `ask` gives it to a formula (7.3): the records themselves, a word being a text.
pub fn records(pk: &Pack, q: &V) -> Option<V> {
    fn plain(v: V) -> V {
        match v {
            V::Tag(WORD, x) => *x,
            V::L(l) => V::L(l.into_iter().map(plain).collect()),
            V::M(m) => V::M(m.into_iter().map(|(k, x)| (k, plain(x))).collect()),
            v => v,
        }
    }
    run(pk, q).map(|x| plain(V::L(x.0.recs)))
}
