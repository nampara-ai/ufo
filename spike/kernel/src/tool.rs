// Throwaway spike kernel: the reader's part in the onboard tools (PLAYER 9.6). The reader presents
// the tools universe as the whole screen and, by its own act, gives it the working universe as its
// subject. Here are: the formulas a tools universe needs (PRESENTATION 7.3), the presentation
// state, the handlers (7.6), hit testing on the kernel's own display list, text entry through the
// `text` capability's `edit`, and export. The host forwards raw input and executes effects.
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
pub fn subject_rows(cx: &Ctx, env: &Env, portal: &Obj, w: f64) -> Option<Vec<Row>> {
    if eval(portal.p.get("of")?, env)? != subject() {
        return None;
    }
    let pk = env.subject?;
    let (u, first) = primary(pk)?;
    let hint = portal.p.get("face").and_then(|f| eval(f, env));
    env.editable.set(portal.p.get("editable").and_then(|e| eval(e, env)) == Some(V::Bool(true)));
    // What a file presents is given no `env`: no subject, no state, nothing to press (F6).
    let mut sub = Ctx { pk, root: pk.head, chain: Vec::new(), blocks: 0, measure: cx.measure, env: None };
    let (mut items, pad) = (Vec::new(), 24.0);
    let id = first.p.get("of")?.tag(REF)?.id()?;
    let h = match hint.as_ref().and_then(|h| h.s()) {
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
    Some(vec![Row { h, gap: 0.0, items, keep: false, block: SUBJECT, line: 0, lines: 1 }])
}

/// A block of the subject's text with the host's editing surface mounted on it.
struct Entry {
    id: i64,
    o: Id,
    lo: usize,
    hi: usize,
    text: String,
}
/// What the reader holds for one presentation of the tools universe.
pub struct Reader {
    pub parts: V,            // the parts of the envelope this reader came in, as the host found them
    pub name: String,        // the name of the file it came in
    pub who: Option<String>, // the reader's principal: the person using it, named by the host
    state: Vec<(String, V)>,
    w: f64,
    list: Vec<V>,            // the display list last given to the host: presses are tested against it
    subject: (usize, usize), // which of its items are the subject's
    editable: bool,
    entry: Option<Entry>,
    waiting: Option<V>, // the `src` pressed, kept while the host asks who the person is
    note: String,       // the reader's own words about the last act, shown above the subject
    serial: i64,
}
impl Reader {
    pub fn new(parts: V, name: &str, who: Option<&str>) -> Reader {
        Reader { parts, name: String::from(name), who: who.map(String::from), state: Vec::new(), w: 600.0, list: Vec::new(), subject: (0, 0), editable: false, entry: None, waiting: None, note: String::new(), serial: 0 }
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
/// The text item at a point among those of `range` that have the field `with`: one whose line the
/// point is on, or within `slop` of, and of those the nearest across, no further than `reach`.
fn at<'a>(list: &'a [V], range: (usize, usize), x: f64, y: f64, with: &str, slop: f64, reach: f64) -> Option<&'a V> {
    let (mut best, mut least) = (None, f64::INFINITY);
    for (i, b, _) in boxes(list) {
        let it = &list[i].l()[1];
        let (dy, dx) = ((b[1] - y).max(y - b[3]).max(0.0), (b[0] - x).max(x - b[2]).max(0.0));
        if range.0 <= i && i < range.1 && it.get(with).is_some() && dy <= slop && dx <= reach && dy * 1e4 + dx < least {
            (best, least) = (Some(it), dy * 1e4 + dx);
        }
    }
    best
}

/// One input event from the host (PLAYER 9.2), and what the host is to do: a list of effects, each
/// `[kind, value]`. Events: `{view: [w, h]}`; `{press: [x, y]}`; `{edit: id, s: text}`, the host's
/// editing surface committed, or with no `s` given up; `{answer: text}` to an `ask`. Effects:
/// `draw` `{list, w, h}`; `edit` `{id, at, s, font, size, weight}` to mount the editing surface, or
/// null to unmount it; `deliver` `{name, type, bytes}`, a file for the person; `ask` `{label}`.
pub fn input(rd: &mut Reader, tools: &Pack, pk: &mut Pack, ev: &V) -> V {
    let (mut fx, mut mount) = (Vec::new(), None);
    let num = |v: &V, i: usize| v.l().get(i).and_then(|x| x.f());
    if let Some(v) = ev.get("view") {
        rd.w = num(v, 0).unwrap_or(rd.w).max(160.0);
    } else if let Some(p) = ev.get("press") {
        if rd.entry.is_some() || rd.waiting.is_some() {
            return V::L(fx); // the editing surface is the host's until it reports back
        }
        rd.note.clear();
        let (x, y) = (num(p, 0).unwrap_or(-1.0), num(p, 1).unwrap_or(-1.0));
        if let Some(key) = at(&rd.list, (0, rd.list.len()), x, y, "press", 14.0, 24.0).and_then(|it| it.get("press")).and_then(|k| k.s()).map(String::from) {
            // 7.6: the handler the pressed thing of the tools universe holds for a press
            let h = primary(tools).and_then(|(_, f)| handler(tools, &f.p.get("of")?.tag(REF)?.id()?, &key, 0));
            perform(rd, pk, &h.unwrap_or(V::Null), &mut fx);
        } else if let Some(src) = at(&rd.list, rd.subject, x, y, "src", 10.0, f64::INFINITY).filter(|_| rd.editable).and_then(|it| it.get("src")) {
            // 7.6: editable text, pressed. The change will name the person, so the reader must know who it is.
            if rd.who.is_some() {
                mount = Some(src.clone());
            } else {
                rd.waiting = Some(src.clone());
                fx.push(effect("ask", map(vec![("label", t("Your name, to record with the changes you make"))])));
            }
        }
    } else if let Some(a) = ev.get("answer") {
        let name = a.s().map(|n| n.trim()).filter(|n| !n.is_empty());
        if let (Some(src), Some(name)) = (rd.waiting.take(), name) {
            rd.who = Some(String::from(name));
            mount = Some(src);
        }
    } else if let Some(e) = ev.get("edit").and_then(|id| rd.entry.take_if(|e| Some(e.id) == id.i())) {
        fx.push(effect("edit", V::Null));
        if let Some(s) = ev.get("s").and_then(|s| s.s()).filter(|s| *s != e.text) {
            // 7.6: the committed edit becomes a change, through the same gate as any other (F7)
            let (mut random, who) = ([0u8; 64], rd.who.clone().unwrap_or_default());
            crate::random(&mut random);
            rd.note = match write::edit(pk, e.o, e.lo, e.hi, s, &who, crate::now(), &random) {
                Ok(r) => cat!("Changed, and recorded as change ", &hex(r.get("change").and_then(|c| c.b()).unwrap_or(&[]))[..8], " by ", who, ". Not yet in a file."),
                Err(why) => cat!("Not changed: ", why),
            };
        }
    } else {
        return V::L(fx);
    }
    fx.insert(0, present(rd, tools, pk));
    if let Some(e) = mount.and_then(|src| enter(rd, pk, &src)) {
        fx.push(e);
    }
    V::L(fx)
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
    let mut text = String::new();
    let (_, face) = primary(pk).ok_or("no primary face")?;
    plain(pk, &pk.head, &face.p.get("of").and_then(|o| o.tag(REF)).and_then(|o| o.id()).ok_or("no primary face")?, &mut text, 0);
    for (k, v) in [("static", String::from(text.trim_start_matches('\n'))), ("pack", write::base64(pk.bytes())), ("date", date(crate::now()))] {
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
/// holds what was pressed. The rectangle is that of the block's lines as they were just drawn.
fn enter(rd: &mut Reader, pk: &Pack, src: &V) -> Option<V> {
    let b = block_at(pk, src)?;
    let same = |it: &V| it.get("src").and_then(|s| block_at(pk, s)).map_or(false, |x| x.get("o") == b.get("o") && x.get("lo") == b.get("lo"));
    let (mut r, mut first) = ([f64::INFINITY, f64::INFINITY, 0.0, 0.0], None);
    for (i, bx, scale) in boxes(&rd.list) {
        let it = &rd.list[i].l()[1];
        if rd.subject.0 <= i && i < rd.subject.1 && same(it) {
            r = [r[0].min(bx[0]), r[1].min(bx[1]), r[2].max(bx[2]), r[3].max(bx[3])];
            first = first.or(Some((it, scale)));
        }
    }
    let (it, scale) = first?;
    let text = String::from(b.get("text")?.s()?);
    rd.serial += 1;
    rd.entry = Some(Entry { id: rd.serial, o: b.get("o")?.id()?, lo: b.get("lo")?.i()? as usize, hi: b.get("hi")?.i()? as usize, text: text.clone() });
    let wide = (rd.w - 2.0 * r[0]).max(r[2] - r[0]);
    let mut m = vec![("id", V::Int(rd.serial)), ("at", V::L(vec![V::F(r[0]), V::F(r[1]), V::F(wide), V::F(r[3] - r[1])])), ("s", V::T(text)), ("size", V::F(it.get("size")?.f()? * scale))];
    for k in ["font", "weight", "slant"] {
        if let Some(v) = it.get(k) {
            m.push((k, v.clone()));
        }
    }
    Some(effect("edit", map(m)))
}
/// The tools universe composed at the reader's width, with the subject in it: the `draw` effect.
fn present(rd: &mut Reader, tools: &Pack, pk: &Pack) -> V {
    let env = Env { state: &rd.state, subject: Some(pk), editable: Cell::new(false) };
    let mut cx = Ctx { pk: tools, root: tools.head, chain: Vec::new(), blocks: 0, measure: &crate::host, env: Some(&env) };
    let rows = primary(tools).and_then(|(_, f)| Some(compose(&mut cx, &tools.head, &f.p.get("of")?.tag(REF)?.id()?, rd.w))).unwrap_or_default();
    let mut said = if rd.note.is_empty() { Vec::new() } else { label_row(&mut cx, &rd.note, rd.w - 32.0) };
    let (mut list, mut y, mut range) = (Vec::new(), 0.0, (0, 0));
    for (k, r) in rows.iter().enumerate() {
        if r.block == SUBJECT {
            y = stack(&said, 16.0, y + if said.is_empty() { 0.0 } else { 8.0 }, &mut list);
            said.clear();
            range.0 = list.len();
        }
        y = stack(core::slice::from_ref(r), 0.0, y + if k > 0 { r.gap } else { 0.0 }, &mut list);
        if r.block == SUBJECT {
            range.1 = list.len();
        }
    }
    y = stack(&said, 16.0, y, &mut list);
    (rd.subject, rd.editable, rd.list) = (range, env.editable.get(), list.clone());
    effect("draw", map(vec![("list", V::L(list)), ("w", V::F(rd.w)), ("h", V::F(y))]))
}
