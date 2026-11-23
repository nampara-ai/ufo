// Throwaway spike kernel: the reader's part in the onboard tools (PLAYER 9.6). The reader presents
// the tools universe as the whole screen and, by its own act, gives it the working universe as its
// subject. Here are: the formulas a tools universe needs (PRESENTATION 7.3), the presentation
// state, the handlers (7.6), hit testing on the kernel's own display list, text entry through the
// `text` capability's `edit`, and export. The host forwards raw input and executes effects.
use crate::diff::{diff, Edit};
use crate::envelope::envelope;
use crate::layout::*;
use crate::pack::*;
use crate::query::hex;
use crate::spell::*;
use crate::value::*;
use crate::write;
use alloc::boxed::Box;
use alloc::string::String;
use alloc::vec;
use alloc::vec::Vec;
use core::cell::Cell;

pub const FORMULA: u64 = 55463;
/// What formulas read while the tools universe is composed or one of its handlers runs.
pub struct Env<'a> {
    pub state: &'a [(String, V)],   // the presentation state of this presentation (7.3)
    pub subject: Option<&'a Pack>,  // the universe the reader handed over (F6), read as `arg("subject")`
    pub editable: Cell<bool>,       // set while composing: the Portal onto the subject is `editable` (7.6)
}
/// The subject, as a value inside the kernel. No file can spell it: a literal of this shape is an error value.
fn subject() -> V {
    V::Tag(0, Box::new(V::Null))
}
/// A value, or a formula's value (7.3). None is the error value (F4). Operators: `state`, `arg`,
/// `=`, `not`, `and`, `or`, `if`; any other is an error value. The bound of F2 is not counted.
pub fn eval(v: &V, env: &Env) -> Option<V> {
    let Some(f) = v.tag(FORMULA) else { return if v.tag(0).is_some() { None } else { Some(v.clone()) } };
    let arg = |i: usize| eval(f.l().get(i)?, env);
    let truth = |i: usize| if let V::Bool(b) = arg(i)? { Some(b) } else { None }; // F5: no coercion
    Some(match f.l().first()?.s()? {
        "state" => {
            let name = arg(1)?;
            env.state.iter().find(|e| Some(e.0.as_str()) == name.s()).map_or(V::Null, |e| e.1.clone())
        }
        "arg" => match arg(1)?.s() {
            Some("subject") if env.subject.is_some() => subject(),
            _ => return None, // there is no `each` here to supply any other
        },
        "=" => {
            let (a, b) = (arg(1)?, arg(2)?);
            V::Bool(match (&a, &b) {
                (V::Int(_) | V::F(_), V::Int(_) | V::F(_)) => a.f() == b.f(),
                _ => a == b,
            })
        }
        "not" => V::Bool(!truth(1)?),
        "and" => V::Bool(truth(1)? && truth(2)?),
        "or" => V::Bool(truth(1)? || truth(2)?),
        "if" => arg(if truth(1)? { 2 } else { 3 })?,
        _ => return None,
    })
}
/// Properties with every formula among them replaced by its value (an error value by null), but
/// for handlers (`on`), whose formulas are evaluated when their event occurs.
pub fn settle(v: &V, env: &Env) -> V {
    match v {
        V::Tag(FORMULA, _) => eval(v, env).unwrap_or(V::Null),
        V::M(m) => V::M(m.iter().map(|(k, x)| (k.clone(), if k == "on" { x.clone() } else { settle(x, env) })).collect()),
        _ => v.clone(),
    }
}
fn primary(pk: &Pack) -> Option<(Obj, Obj)> {
    let u = pk.object(&pk.head, &[0; 16])?;
    let f = pk.object(&pk.head, &u.p.get("roots")?.get("primary")?.tag(REF)?.id()?)?;
    Some((u, f))
}
/// A Portal of the tools universe whose `of` is `arg("subject")`: the subject composed in the face
/// its `face` asks for, a `medium` hint (7.8): `pages`, `text` (the plain-text face, 8.3, which
/// every universe has), or anything else for the primary face. One row holds it all.
pub fn subject_rows(cx: &mut Ctx, env: &Env, portal: &Obj, w: f64) -> Option<Vec<Row>> {
    if eval(portal.p.get("of")?, env)? != subject() {
        return None;
    }
    let pk = env.subject?;
    let (u, first) = primary(pk)?;
    let hint = portal.p.get("face").and_then(|f| eval(f, env));
    let hint = hint.as_ref().and_then(|h| h.s());
    let editable = portal.p.get("editable").and_then(|e| eval(e, env)) == Some(V::Bool(true));
    env.editable.set(editable);
    // What a file presents is given no `env`: no subject, no state, nothing to press (F6). Its
    // blocks and nodes are numbered on from those of the tools, so that no two are alike.
    let mut sub = Ctx::new(pk, cx.measure, None);
    (sub.blocks, sub.nodes, sub.press) = (cx.blocks, cx.nodes, editable && hint != Some("text"));
    let (mut items, pad) = (Vec::new(), 24.0);
    let id = first.p.get("of")?.tag(REF)?.id()?;
    let h = match hint {
        Some("text") => {
            let mut s = String::new();
            plain(pk, &pk.head, &id, &mut s, 0);
            let rows = plain_rows(&mut sub, s.trim_start_matches('\n'), w - 2.0 * pad);
            stack(&rows, pad, pad, &mut items) + pad
        }
        Some("pages") => {
            let face = u.p.get("faces")?.l().iter().filter_map(|f| pk.object(&pk.head, &f.tag(REF)?.id()?)).find(|f| f.p.get("medium").and_then(|m| m.s()) == Some("pages")).unwrap_or(first);
            let mut list = Vec::new();
            let (pw, ph, _, _) = paged(&mut sub, &pk.head, &face, &V::Null, &mut list)?;
            // the pages as large as the width allows, up to twice their size, centered on a ground
            let (z, f) = ((w / pw).min(2.0), |x: f64| V::F(x));
            let (dx, h) = ((w - pw * z) / 2.0, ph * z + 2.0 * pad);
            let d = V::L(vec![V::L(vec![t("M"), f(0.0), f(0.0)]), V::L(vec![t("L"), f(w), f(0.0)]), V::L(vec![t("L"), f(w), f(h)]), V::L(vec![t("L"), f(0.0), f(h)]), V::L(vec![t("Z")])]);
            items.push(V::L(vec![t("path"), map(vec![("d", d), ("fill", V::L(vec![f(0.79), f(0.79), f(0.77), f(1.0)]))])]));
            items.push(V::L(vec![t("push"), map(vec![("m", V::L(vec![f(z), f(0.0), f(0.0), f(z), f(dx), f(pad)]))])]));
            items.append(&mut list);
            items.push(V::L(vec![t("pop")]));
            h
        }
        _ => {
            let rows = compose(&mut sub, &pk.head, &id, w - 2.0 * pad);
            stack(&rows, pad, pad, &mut items) + pad
        }
    };
    (cx.blocks, cx.nodes) = (sub.blocks, sub.nodes);
    Some(vec![Row { h, gap: 0.0, items, keep: false, block: SUBJECT, line: 0, lines: 1, path: Vec::new() }])
}

/// A block of the subject's text with the host's editing surface mounted on it. The host reports
/// what is done there as it is done (below, `step`); what the block reads now is kept as its
/// scalar values, each either one of the block's own, by its place there, or new.
struct Entry {
    id: i64,
    node: i64, // the block's node, to be marked while it is being changed
    o: Id,
    lo: usize,
    hi: usize,
    text: Vec<char>,
    now: Vec<(usize, char)>,
}
const NEW: usize = usize::MAX;
/// One report from the editing surface. With a position, `{at, del, ins}`: in the text as the host
/// holds it, counted in scalar values, `del` of them at `at` gave way to `ins`. With none, `{s}`:
/// the whole text as it now reads, and where it changed is taken from the difference (diff.rs).
/// A position that cannot be (past the end) is left to the report that ends the entry, which
/// carries the whole text.
fn step(e: &mut Entry, ev: &V) {
    let int = |k: &str| ev.get(k).and_then(|x| x.i()).filter(|i| *i >= 0).map(|i| i as usize);
    if let (Some(at), Some(ins)) = (int("at"), ev.get("ins").and_then(|s| s.s())) {
        let del = int("del").unwrap_or(0);
        if at.checked_add(del).map_or(false, |end| end <= e.now.len()) {
            e.now.splice(at..at + del, ins.chars().map(|c| (NEW, c)));
        }
    } else if let Some(s) = ev.get("s").and_then(|s| s.s()) {
        let (old, new): (Vec<char>, Vec<char>) = (e.now.iter().map(|c| c.1).collect(), s.chars().collect());
        for d in diff(&old, &new).into_iter().rev() {
            e.now.splice(d.lo..d.hi, d.ins.into_iter().map(|c| (NEW, c)));
        }
    }
}
/// What the reports come to (L1: only what differs is written). The positions decide where: each
/// stretch of the block between two of its scalar values that are still there, of which something
/// was removed or into which something was put, is taken by itself. The comparison decides what:
/// a stretch that reads as it did is no change at all (typed and removed again; the same
/// characters typed over themselves); a stretch that only lost or only gained is written as that;
/// a stretch that did both is compared, before with after (diff.rs), and what the two share is not
/// written. Positions are in the block.
fn net(e: &Entry) -> Vec<Edit> {
    let (mut out, mut from, mut ins) = (Vec::new(), 0usize, Vec::<char>::new());
    for &(i, c) in e.now.iter().chain(core::iter::once(&(e.text.len(), ' '))) {
        if i == NEW {
            ins.push(c);
            continue;
        }
        let old = &e.text[from.min(i)..i];
        if old.is_empty() != ins.is_empty() {
            out.push(Edit { lo: from, hi: i, ins: core::mem::take(&mut ins) });
        } else if old != &ins[..] {
            out.extend(diff(old, &ins).into_iter().map(|d| Edit { lo: d.lo + from, hi: d.hi + from, ins: d.ins }));
        }
        ins.clear();
        from = i + 1;
    }
    out
}
/// What the reader holds for one presentation of the tools universe.
pub struct Reader {
    pub parts: V,            // the parts of the envelope this reader came in, as the host found them
    pub name: String,        // the name of the file it came in
    pub who: Option<String>, // the reader's principal: the person using it, named by the host
    state: Vec<(String, V)>,
    w: f64,
    lists: [Vec<V>; 2],      // the display lists last given to the host: what is held in view above (the tools), and the subject, which scrolls. Presses are tested against them
    high: [f64; 2],
    editable: bool,
    entry: Option<Entry>,
    waiting: Option<V>, // the `src` pressed, kept while the host asks who the person is
    note: String,       // the reader's own words about the last act, shown under the tools
    serial: i64,
    focus: Option<(usize, i64)>, // the node the host says has the focus, and the list it is in
}
impl Reader {
    pub fn new(parts: V, name: &str, who: Option<&str>) -> Reader {
        Reader { parts, name: String::from(name), who: who.map(String::from), state: Vec::new(), w: 600.0, lists: [Vec::new(), Vec::new()], high: [-1.0; 2], editable: false, entry: None, waiting: None, note: String::new(), serial: 0, focus: None }
    }
}
fn effect(kind: &str, v: V) -> V {
    V::L(vec![t(kind), v])
}
/// The text items of a list: which item, the box it occupies in the list's own coordinates
/// (transforms without rotation), and the vertical scale in force.
fn boxes(list: &[V]) -> Vec<(usize, [f64; 4], f64)> {
    let (mut st, mut out) = (vec![[1.0, 1.0, 0.0, 0.0]], Vec::new()); // scale across and down, then where the origin is
    for (i, item) in list.iter().enumerate() {
        let (m, it) = (st[st.len() - 1], item.l().get(1));
        let num = |k: &str| it.and_then(|it| it.get(k)).and_then(|x| x.f()).unwrap_or(0.0);
        match item.l().first().and_then(|k| k.s()) {
            Some("push") => {
                let n: Vec<f64> = it.and_then(|it| it.get("m")).map(|m| m.l().iter().filter_map(|x| x.f()).collect()).unwrap_or_default();
                st.push(if n.len() == 6 { [m[0] * n[0], m[1] * n[3], m[0] * n[4] + m[2], m[1] * n[5] + m[3]] } else { m });
            }
            Some("pop") if st.len() > 1 => drop(st.pop()),
            Some("text") => {
                let (x, y, size) = (num("x"), num("y"), num("size"));
                out.push((i, [m[0] * x + m[2], m[1] * (y - size) + m[3], m[0] * (x + num("adv")) + m[2], m[1] * (y + 0.3 * size) + m[3]], m[1]));
            }
            _ => {}
        }
    }
    out
}
/// The text item at a point among those that have the field `with`: one whose line the point is
/// on, or within `slop` of, and of those the nearest across, no further than `reach`.
fn at(list: &[V], x: f64, y: f64, with: &str, slop: f64, reach: f64) -> Option<(usize, f64)> {
    let (mut best, mut least) = (None, f64::INFINITY);
    for (i, b, scale) in boxes(list) {
        let (dy, dx) = ((b[1] - y).max(y - b[3]).max(0.0), (b[0] - x).max(x - b[2]).max(0.0));
        if list[i].l()[1].get(with).is_some() && dy <= slop && dx <= reach && dy * 1e4 + dx < least {
            (best, least) = (Some((i, scale)), dy * 1e4 + dx);
        }
    }
    best
}
/// For each item of a list, the nodes it lies in, outermost first, each by its `push`.
fn within(list: &[V]) -> Vec<Vec<usize>> {
    let (mut open, mut nodes, mut out) = (Vec::new(), Vec::new(), Vec::with_capacity(list.len()));
    for (i, item) in list.iter().enumerate() {
        match item.l().first().and_then(|k| k.s()) {
            Some("push") => {
                let node = item.l().get(1).map_or(false, |m| m.get("role").is_some());
                open.push(node);
                if node {
                    nodes.push(i);
                }
            }
            Some("pop") => {
                if open.pop() == Some(true) {
                    nodes.pop();
                }
            }
            _ => {}
        }
        out.push(nodes.clone());
    }
    out
}
fn id_of(list: &[V], push: usize) -> Option<i64> {
    list[push].l().get(1)?.get("id")?.i()
}
/// The box of a node: of every text item in any of the groups that carry its identity, but for
/// what lies in a list within it (an item's box is its own lines, not those of the items under it).
fn bounds(list: &[V], id: i64) -> Option<[f64; 4]> {
    let (inside, mut r) = (within(list), None);
    let is_list = |p: &usize| list[*p].l()[1].get("role").and_then(|r| r.s()) == Some("list");
    for (i, b, _) in boxes(list) {
        if inside[i].iter().position(|&p| id_of(list, p) == Some(id)).map_or(false, |k| !inside[i][k + 1..].iter().any(is_list)) {
            r = Some(r.map_or(b, |r: [f64; 4]| [r[0].min(b[0]), r[1].min(b[1]), r[2].max(b[2]), r[3].max(b[3])]));
        }
    }
    r
}

/// One input event from the host (PLAYER 9.2), and what the host is to do: a list of effects, each
/// `[kind, value]`. Events: `{view: [w, h]}`; `{press: [x, y], on: n}`, a press on the n-th list;
/// `{focus: id or null, on: n}`, the node of that list the host's focus is now on; from the editing
/// surface `{edit: id, at, del, ins}` or `{edit: id, s}` as it is used (see `step`), and
/// `{edit: id, end: true, s}` when the person is done, or `end: false` when they give it up;
/// `{answer: text}` to an `ask`. Effects: `draw` `{on, list, w, h}`, one for each list that is not
/// as the host last had it; `edit` `{id, at, s, font, size, weight}` to mount the editing surface,
/// or null to unmount it; `show` `{on, at}`, a rectangle of a list to bring into view; `deliver`
/// `{name, type, bytes}`, a file for the person; `ask` `{label}`.
pub fn input(rd: &mut Reader, tools: &Pack, pk: &mut Pack, ev: &V) -> V {
    let (mut fx, mut mount) = (Vec::new(), None);
    let num = |v: &V, i: usize| v.l().get(i).and_then(|x| x.f());
    let on = (ev.get("on").and_then(|n| n.i()) == Some(1)) as usize;
    if let Some(v) = ev.get("view") {
        rd.w = num(v, 0).unwrap_or(rd.w).max(160.0);
    } else if let Some(p) = ev.get("press") {
        if rd.entry.is_some() || rd.waiting.is_some() {
            return V::L(fx); // the editing surface is the host's until it reports back
        }
        rd.note.clear();
        let (x, y, list) = (num(p, 0).unwrap_or(-1.0), num(p, 1).unwrap_or(-1.0), &rd.lists[on]);
        if let Some(key) = at(list, x, y, "press", 14.0, 24.0).and_then(|(i, _)| list[i].l()[1].get("press")).and_then(|k| k.s()).map(String::from) {
            // 7.6: the handler the pressed thing of the tools universe holds for a press
            let h = primary(tools).and_then(|(_, f)| handler(tools, &f.p.get("of")?.tag(REF)?.id()?, &key, 0));
            perform(rd, pk, &h.unwrap_or(V::Null), &mut fx);
        } else if let Some(found) = at(list, x, y, "src", 10.0, f64::INFINITY).filter(|_| rd.editable && on == 1) {
            // 7.6: editable text, pressed. The change will name the person, so the reader must know who it is.
            if rd.who.is_some() {
                mount = Some(found);
            } else {
                rd.waiting = Some(V::L(vec![V::F(x), V::F(y)]));
                fx.push(effect("ask", map(vec![("label", t("Your name, to record with the changes you make"))])));
            }
        }
    } else if let Some(a) = ev.get("answer") {
        let name = a.s().map(|n| n.trim()).filter(|n| !n.is_empty());
        if let (Some(p), Some(name)) = (rd.waiting.take(), name) {
            rd.who = Some(String::from(name));
            mount = at(&rd.lists[1], num(&p, 0).unwrap_or(-1.0), num(&p, 1).unwrap_or(-1.0), "src", 10.0, f64::INFINITY);
        }
    } else if let Some(f) = ev.get("focus") {
        rd.focus = f.i().map(|id| (on, id));
        if let Some(b) = rd.focus.and_then(|(n, id)| bounds(&rd.lists[n], id)) {
            fx.push(effect("show", map(vec![("on", V::Int(on as i64)), ("at", V::L(vec![V::F(b[0]), V::F(b[1]), V::F(b[2] - b[0]), V::F(b[3] - b[1])]))])));
        }
    } else if let Some(e) = ev.get("edit").and_then(|id| rd.entry.as_mut().filter(|e| Some(e.id) == id.i())) {
        let Some(V::Bool(done)) = ev.get("end") else {
            step(e, ev);
            return V::L(fx);
        };
        if *done {
            step(e, &map(vec![("s", ev.get("s").cloned().unwrap_or(V::Null))])); // the whole text, in case a report was missed
        }
        let edits = if *done { net(e) } else { Vec::new() };
        let e = rd.entry.take();
        fx.push(effect("edit", V::Null));
        if let (false, Some(e)) = (edits.is_empty(), e) {
            // 7.6: the edit becomes a change, through the same gate as any other (F7)
            let (mut random, who) = ([0u8; 64], rd.who.clone().unwrap_or_default());
            crate::random(&mut random);
            rd.note = match write::edit(pk, e.o, e.lo, e.hi, "", Some(edits), &who, crate::now(), &random) {
                Ok(r) => cat!("Changed, and recorded as change ", &hex(r.get("change").and_then(|c| c.b()).unwrap_or(&[]))[..8], " by ", who, ". Not yet in a file."),
                Err(why) => cat!("Not changed: ", why),
            };
        }
    } else {
        return V::L(fx);
    }
    if let Some(mut e) = mount.and_then(|(i, scale)| enter(rd, pk, i, scale)) {
        fx.append(&mut e);
    }
    let mut out = present(rd, tools, pk);
    out.append(&mut fx);
    V::L(out)
}
/// 7.6: a handler performed. `{set, to}` sets presentation state; `{act}` is an action of 10.3 on the subject.
fn perform(rd: &mut Reader, pk: &Pack, h: &V, fx: &mut Vec<V>) {
    if let Some(name) = h.get("set").and_then(|n| n.s()) {
        let to = h.get("to").and_then(|v| eval(v, &Env { state: &rd.state, subject: Some(pk), editable: Cell::new(false) }));
        match to {
            Some(v) => {
                rd.state.retain(|e| e.0 != name);
                rd.state.push((String::from(name), v));
            }
            None => rd.note = String::from("(a formula gave an error value: nothing was set)"),
        }
    } else if h.get("act").and_then(|a| a.s()) == Some("export") {
        match export(rd, pk) {
            Ok((name, page)) => {
                rd.note = cat!("Made ", name, ": ", page.len(), " bytes, holding state ", &hex(&pk.head)[..16], ". It has been handed to your browser to save.");
                fx.push(effect("deliver", map(vec![("name", V::T(name)), ("type", t("text/html")), ("bytes", V::B(page.into_bytes()))])));
            }
            Err(why) => rd.note = cat!("No file was made: ", why),
        }
    } else if *h != V::Null {
        rd.note = String::from("(this reader cannot do that)");
    }
}
/// 10.3 `export`, of the subject, as a web envelope: the parts this reader came in, with the
/// subject's plain-text face, its pack and today's date in place of those it came with.
fn export(rd: &Reader, pk: &Pack) -> Result<(String, String), &'static str> {
    let V::M(mut parts) = rd.parts.clone() else { return Err("this reader was not given the parts of a file to make another from") };
    for (k, v) in [("static-html", static_face(pk).ok_or("no primary face")?), ("pack", write::base64(pk.bytes())), ("date", date(crate::now()))] {
        parts.retain(|e| e.0 != k);
        parts.push((String::from(k), V::T(v)));
    }
    // the name: the file's own with `-edited`, then `-edited-2`, and so on
    let base = [".ufx.html", ".html", ".htm"].iter().find_map(|e| rd.name.strip_suffix(*e)).unwrap_or(&rd.name);
    let base = if base.is_empty() { "untitled" } else { base };
    let (stem, n) = match base.as_bytes().windows(7).rposition(|w| w == b"-edited") {
        Some(i) if i + 7 == base.len() => (&base[..i], 2),
        Some(i) if base[i + 7..].starts_with('-') && base.len() > i + 8 && base[i + 8..].bytes().all(|c| c.is_ascii_digit()) => (&base[..i], base[i + 8..].bytes().fold(0u64, |n, c| n.wrapping_mul(10).wrapping_add((c - b'0') as u64)).wrapping_add(1)),
        _ => (base, 1),
    };
    let name = if n == 1 { cat!(stem, "-edited.ufx.html") } else { cat!(stem, "-edited-", n, ".ufx.html") };
    Ok((name, envelope(&V::M(parts))?))
}
/// A time in milliseconds as a calendar date in UTC, `YYYY-MM-DD` (ISO 8601): no two hyphens together.
pub fn date(ms: u64) -> String {
    let z = (ms / 86_400_000) as i64 + 719_468;
    let (era, doe) = (z / 146_097, z % 146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let (d, m) = (doy - (153 * mp + 2) / 5 + 1, if mp < 10 { mp + 3 } else { mp - 9 });
    let y = yoe + era * 400 + (m <= 2) as i64;
    let two = |x: i64| cat!(if x < 10 { "0" } else { "" }, x);
    cat!(if y < 1000 { "0" } else { "" }, y, "-", two(m), "-", two(d))
}
/// `text.edit` (PLAYER 9.3): the host's editing surface asked for, on the block of the subject that
/// holds the item pressed. The rectangle is that of the block's node as it was last drawn.
fn enter(rd: &mut Reader, pk: &Pack, i: usize, scale: f64) -> Option<Vec<V>> {
    let list = &rd.lists[1];
    let it = &list[i].l()[1];
    let b = block_at(pk, it.get("src")?)?;
    let node = within(list)[i].iter().rev().find(|&&p| list[p].l()[1].get("press").is_some()).and_then(|&p| id_of(list, p))?;
    let r = bounds(list, node)?;
    let text: Vec<char> = b.get("text")?.s()?.chars().collect();
    rd.serial += 1;
    let wide = (rd.w - 2.0 * r[0]).max(r[2] - r[0]);
    let at = V::L(vec![V::F(r[0]), V::F(r[1]), V::F(wide), V::F(r[3] - r[1])]);
    let mut m = vec![("id", V::Int(rd.serial)), ("at", at.clone()), ("s", b.get("text")?.clone()), ("size", V::F(it.get("size")?.f()? * scale))];
    for k in ["font", "weight", "slant"] {
        if let Some(v) = it.get(k) {
            m.push((k, v.clone()));
        }
    }
    rd.entry = Some(Entry { id: rd.serial, node, o: b.get("o")?.id()?, lo: b.get("lo")?.i()? as usize, hi: b.get("hi")?.i()? as usize, now: text.iter().copied().enumerate().collect(), text });
    Some(vec![effect("edit", map(m)), effect("show", map(vec![("on", V::Int(1)), ("at", at)]))])
}
/// The tools universe composed at the reader's width, with the subject in it, as two lists: what
/// comes before the subject, which the host holds in view, with the reader's own words about the
/// last act under it; and the subject, which scrolls. The node that has the focus, and the block
/// being changed, are each ringed. Gives a `draw` effect for each list that changed.
fn present(rd: &mut Reader, tools: &Pack, pk: &Pack) -> Vec<V> {
    let env = Env { state: &rd.state, subject: Some(pk), editable: Cell::new(false) };
    let mut cx = Ctx::new(tools, &crate::host, Some(&env));
    let rows = primary(tools).and_then(|(_, f)| Some(compose(&mut cx, &tools.head, &f.p.get("of")?.tag(REF)?.id()?, rd.w))).unwrap_or_default();
    let cut = rows.iter().position(|r| r.block == SUBJECT).unwrap_or(rows.len());
    let (mut lists, mut high) = ([Vec::new(), Vec::new()], [0.0; 2]);
    high[0] = stack(&rows[..cut], 0.0, 0.0, &mut lists[0]);
    // what the reader says is a node of its own, there whether or not anything is said: a host can then tell the person when it changes
    let mut said = said_rows(&mut cx, &rd.note, rd.w - 32.0, "status");
    for r in said.iter_mut() {
        r.path = vec![node("status", 1, Vec::new())];
    }
    if rd.note.is_empty() {
        lists[0].extend([V::L(vec![t("push"), node("status", 1, Vec::new())]), V::L(vec![t("pop")])]);
    } else {
        high[0] = stack(&said, 16.0, high[0] + 4.0, &mut lists[0]) + 8.0;
    }
    high[1] = stack(&rows[cut..], 0.0, 0.0, &mut lists[1]);
    for (n, id) in rd.focus.into_iter().chain(rd.entry.as_ref().map(|e| (1, e.node))) {
        if let Some(b) = bounds(&lists[n], id) {
            let (f, c) = (|x: f64| V::F(x), V::L(vec![V::F(0.08), V::F(0.35), V::F(0.84), V::F(1.0)]));
            let d = V::L(vec![V::L(vec![t("M"), f(b[0] - 3.0), f(b[1] - 2.0)]), V::L(vec![t("L"), f(b[2] + 3.0), f(b[1] - 2.0)]), V::L(vec![t("L"), f(b[2] + 3.0), f(b[3] + 2.0)]), V::L(vec![t("L"), f(b[0] - 3.0), f(b[3] + 2.0)]), V::L(vec![t("Z")])]);
            lists[n].push(V::L(vec![t("path"), map(vec![("d", d), ("stroke", c), ("width", f(2.0))])]));
        }
    }
    let mut fx = Vec::new();
    for n in 0..2 {
        if lists[n] != rd.lists[n] || high[n] != rd.high[n] {
            fx.push(effect("draw", map(vec![("on", V::Int(n as i64)), ("list", V::L(lists[n].clone())), ("w", V::F(rd.w)), ("h", V::F(high[n]))])));
        }
    }
    (rd.editable, rd.lists, rd.high) = (env.editable.get(), lists, high);
    fx
}
