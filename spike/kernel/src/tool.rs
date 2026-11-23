// Throwaway spike kernel: the reader's part in the onboard tools (PLAYER 9.6). The reader presents
// a tools universe as the whole screen and, by its own act, gives it the working universe as its
// subject. Here are the general mechanisms a tools universe is made of, and nothing of any one tools
// universe: formulas (PRESENTATION 7.3), among them `ask`; the presentation state; handlers (7.6) and
// the two actions of 10.3 they may `act` here; hit testing on the kernel's own display list; text
// entry through the `text` capability's `edit`. The host forwards raw input and executes effects.
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
use core::cell::{Cell, RefCell};

pub const FORMULA: u64 = 55463;
/// What formulas read while a tools universe is composed or one of its handlers runs.
pub struct Env<'a> {
    pub state: &'a [(String, V)],          // the presentation state of this presentation (7.3)
    pub args: RefCell<Vec<(String, V)>>,   // named values, read with `arg`: what the reader handed over, what an `each` binds, what an event carries
    pub subject: Option<&'a Pack>,         // the universe the reader handed over (F6), read as `arg("subject")`
    pub editable: Cell<bool>,              // set while composing: the Portal onto the subject is `editable` (7.6)
    pub through: Cell<Option<Id>>,         // and which Portal that is
    pub left: Cell<Option<bool>>,          // and whether `leaving` was asked of the subject, with or without its history (E12)
}
impl<'a> Env<'a> {
    fn new(state: &'a [(String, V)], args: &[(String, V)], more: &[(String, V)], subject: &'a Pack) -> Env<'a> {
        Env { state, args: RefCell::new(args.iter().chain(more).cloned().collect()), subject: Some(subject), editable: Cell::new(false), through: Cell::new(None), left: Cell::new(None) }
    }
}
/// The subject, as a value inside the kernel. No file can spell it: a literal of this shape is an error value.
fn subject() -> V {
    V::Tag(0, Box::new(V::Null))
}
pub fn is_subject(v: &V) -> bool {
    *v == subject()
}
/// A value, or a formula's value (7.3). None is the error value (F4). A list or a map that is not
/// a formula may hold formulas (7.6: "any field may be a formula"), and has their values. Operators:
/// `state`, `arg`, `=`, `not`, `and`, `or`, `if`, `+`, `list`, `nth`, `len`, `concat`, `slice`,
/// `format`, `get` (of a map, by a key or a path of keys), `ask`; any other is an error value. The
/// bound of F2 is not counted.
pub fn eval(v: &V, env: &Env) -> Option<V> {
    let Some(f) = v.tag(FORMULA) else {
        return match v {
            V::Tag(0, _) => None,
            V::M(m) => Some(V::M(m.iter().map(|(k, x)| Some((k.clone(), eval(x, env)?))).collect::<Option<_>>()?)),
            V::L(l) => Some(V::L(l.iter().map(|x| eval(x, env)).collect::<Option<_>>()?)),
            _ => Some(v.clone()),
        };
    };
    let arg = |i: usize| eval(f.l().get(i)?, env);
    let truth = |i: usize| if let V::Bool(b) = arg(i)? { Some(b) } else { None }; // F5: no coercion
    let all = || f.l()[1..].iter().map(|x| eval(x, env)).collect::<Option<Vec<V>>>();
    let index = |i: usize| arg(i)?.f().filter(|x| *x == (*x as i64) as f64).map(|x| x as i64);
    Some(match f.l().first()?.s()? {
        "state" => {
            let name = arg(1)?;
            env.state.iter().find(|e| Some(e.0.as_str()) == name.s()).map_or(V::Null, |e| e.1.clone())
        }
        "arg" => match arg(1)?.s()? {
            "subject" if env.subject.is_some() => subject(),
            name => env.args.borrow().iter().rev().find(|e| e.0 == name)?.1.clone(), // the innermost that binds it
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
        "+" => match (arg(1)?, arg(2)?) {
            (V::Int(a), V::Int(b)) => V::Int(a.checked_add(b)?), // whole numbers stay whole
            (a, b) => Some(a.f()? + b.f()?).filter(|x| x.is_finite()).map(V::F)?,
        },
        "list" => V::L(all()?),
        "nth" => arg(1)?.l().get(usize::try_from(index(2)?).ok()?)?.clone(),
        "len" => match arg(1)? {
            V::T(s) => V::Int(s.chars().count() as i64),
            V::L(l) => V::Int(l.len() as i64),
            _ => return None,
        },
        "concat" => {
            let parts = all()?;
            if parts.iter().all(|p| matches!(p, V::L(_))) {
                V::L(parts.iter().flat_map(|p| p.l().iter().cloned()).collect())
            } else {
                V::T(parts.iter().map(|p| p.s()).collect::<Option<Vec<&str>>>()?.concat())
            }
        }
        "slice" => {
            let (x, n) = (arg(1)?, |i: usize, len: usize| index(i).map(|k| k.clamp(0, len as i64) as usize));
            match &x {
                V::T(s) => {
                    let cs: Vec<char> = s.chars().collect();
                    let (a, b) = (n(2, cs.len())?, n(3, cs.len())?);
                    V::T(cs[a..b.max(a)].iter().collect())
                }
                V::L(l) => {
                    let (a, b) = (n(2, l.len())?, n(3, l.len())?);
                    V::L(l[a..b.max(a)].to_vec())
                }
                _ => return None,
            }
        }
        "format" => V::T(format(arg(1)?.f()?, arg(2)?.s()?)?),
        "get" => {
            let (m, path) = (arg(1)?, arg(2)?);
            match &path {
                V::T(k) => m.get(k)?.clone(),
                l => l.l().iter().try_fold(&m, |v, k| v.get(k.s()?))?.clone(),
            }
        }
        "ask" => {
            // The records of a projection (10.1), each a map from field name to value. Its arguments are the
            // projection's: a map is its named parameters; the subject, where it stands among them, is what the
            // projection is of (7.6). Only a subject can be asked here: not the universe the formula is in.
            let (args, mut q) = (all()?, Vec::new());
            for a in &args[1..] {
                if let V::M(m) = a {
                    q.extend(m.iter().cloned());
                }
            }
            let pk = env.subject.filter(|_| args[1..].iter().any(is_subject))?;
            let name = args.first()?.s()?;
            q.push((String::from("name"), t(name)));
            if name == "leaving" {
                env.left.set(Some(q.iter().all(|e| e.0 != "history" || e.1 != V::Bool(false))));
            }
            crate::project::records(pk, &V::M(q))?
        }
        _ => return None,
    })
}
/// `format` (7.3). A number by a pattern of fixed decimals: `0`, then `.` and a `0` for each decimal
/// place; a `,` anywhere in it groups thousands; a final `%` multiplies by 100. Halves round away from
/// zero. Or a time, in milliseconds, by a pattern of `YYYY`, `MM`, `DD`, `hh`, `mm`, `ss` and any
/// other characters, in UTC: any pattern that does not begin as a number's does.
pub fn format(x: f64, pat: &str) -> Option<String> {
    if !x.is_finite() {
        return None;
    }
    if !pat.starts_with(['0', ',']) {
        let ms = if x < 0.0 { return None } else { x as u64 };
        let (y, mo, d) = civil(ms / 86_400_000);
        let s = ms / 1000 % 86_400;
        let (mut out, mut rest) = (String::new(), pat);
        'pattern: while let Some(c) = rest.chars().next() {
            for (word, n, wide) in [("YYYY", y as u64, 4), ("MM", mo as u64, 2), ("DD", d as u64, 2), ("hh", s / 3600, 2), ("mm", s / 60 % 60, 2), ("ss", s % 60, 2)] {
                if let Some(after) = rest.strip_prefix(word) {
                    let digits = cat!(n);
                    (digits.len()..wide).for_each(|_| out.push('0'));
                    out.push_str(&digits);
                    rest = after;
                    continue 'pattern;
                }
            }
            out.push(c);
            rest = &rest[c.len_utf8()..];
        }
        return Some(out);
    }
    let (body, percent) = pat.strip_suffix('%').map_or((pat, false), |b| (b, true));
    let (group, plain): (bool, String) = (body.contains(','), body.chars().filter(|c| *c != ',').collect());
    let places = match plain.strip_prefix('0')? {
        "" => 0,
        frac => frac.strip_prefix('.').filter(|z| !z.is_empty() && z.bytes().all(|c| c == b'0'))?.len(),
    };
    let scale = (0..places).fold(1u64, |s, _| s.saturating_mul(10));
    let a = (if x < 0.0 { -x } else { x }) * if percent { 100.0 } else { 1.0 } * scale as f64 + 0.5;
    if a >= 9.0e15 {
        return None;
    }
    let (n, whole) = (a as u64, cat!(a as u64 / scale));
    let mut out = String::from(if x < 0.0 && n != 0 { "-" } else { "" });
    for (i, c) in whole.chars().enumerate() {
        if group && i > 0 && (whole.len() - i) % 3 == 0 {
            out.push(',');
        }
        out.push(c);
    }
    if places > 0 {
        let frac = cat!(n % scale);
        out.push('.');
        (frac.len()..places).for_each(|_| out.push('0'));
        out.push_str(&frac);
    }
    if percent {
        out.push('%');
    }
    Some(out)
}
/// A count of days since 1970-01-01 as a year, a month and a day of the proleptic Gregorian calendar.
fn civil(days: u64) -> (i64, i64, i64) {
    let z = days as i64 + 719_468;
    let (era, doe) = (z / 146_097, z % 146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let (d, m) = (doy - (153 * mp + 2) / 5 + 1, if mp < 10 { mp + 3 } else { mp - 9 });
    (yoe + era * 400 + (m <= 2) as i64, m, d)
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
fn primary(pk: &Pack, commit: &H) -> Option<Id> {
    let u = pk.object(commit, &[0; 16])?;
    pk.object(commit, &u.p.get("roots")?.get("primary")?.tag(REF)?.id()?)?.p.get("of")?.tag(REF)?.id()
}
/// The tools universe a working universe carries (SPEC 1.6): what its universe object names under
/// `components.tools`, an anchor whose `u` is a commit; nested, if that commit is in the pack (1.8).
pub fn carried(pk: &Pack) -> Option<H> {
    let c = pk.object(&pk.head, &[0; 16])?.p.get("components")?.get("tools")?.tag(ANCHOR)?.get("u")?.hash()?;
    pk.node(&c).filter(|n| n.get("k").and_then(|k| k.s()) == Some("commit")).map(|_| c)
}
/// A Portal of a tools universe whose `of` is `arg("subject")`: the subject composed in the face
/// its `face` asks for, a `medium` hint (7.8): `pages`, `text` (the plain-text face, 8.3, which
/// every universe has), or anything else for the primary face. One row holds it all.
pub fn subject_rows(cx: &mut Ctx, env: &Env, portal: &Obj, w: f64) -> Option<Vec<Row>> {
    let pk = env.subject?;
    let u = pk.object(&pk.head, &[0; 16])?;
    let first = pk.object(&pk.head, &u.p.get("roots")?.get("primary")?.tag(REF)?.id()?)?;
    let hint = portal.p.get("face").and_then(|h| h.s());
    let editable = portal.p.get("editable") == Some(&V::Bool(true));
    env.editable.set(editable);
    env.through.set(Some(portal.id));
    // What a file presents is given no `env`: no subject, no state, nothing to press (F6). Its
    // blocks and nodes are numbered from far above those of the tools, so that no two are alike.
    let mut sub = Ctx::new(pk, cx.measure, None);
    (sub.blocks, sub.nodes, sub.press) = (1 << 30, 1 << 30, editable && hint != Some("text"));
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
/// What the reader holds for one presentation of a tools universe.
pub struct Reader {
    pub parts: V,                // the parts of the envelope this reader came in, as the host found them
    args: Vec<(String, V)>,      // what the reader hands the tools beside their subject: what the host told it, such as the file's `name`
    state: Vec<(String, V)>,
    w: f64,
    drawn: f64,                  // the width the lists were last drawn at
    lists: [Vec<V>; 2],          // the display lists last given to the host: what is held in view above (the tools), and the subject, which scrolls. Presses are tested against them
    high: [f64; 2],
    editable: bool,
    through: Option<Id>,         // the Portal the subject is presented through
    shown: Option<bool>,         // what was last presented asked what would leave, with or without history (E12)
    entry: Option<Entry>,        // a block of the subject, in the editing surface
    field: Option<(i64, Id)>,    // or a value a Portal of the tools presents: the entry's number, and the Portal
    serial: i64,
    focus: Option<(usize, i64)>, // the node the host says has the focus, and the list it is in
}
impl Reader {
    pub fn new(parts: V, args: Vec<(String, V)>) -> Reader {
        Reader { parts, args, state: Vec::new(), w: 600.0, drawn: 0.0, lists: [Vec::new(), Vec::new()], high: [-1.0; 2], editable: false, through: None, shown: None, entry: None, field: None, serial: 0, focus: None }
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

/// Each node's group is told the rectangle of what is drawn in it (`box`: x, y, width, height, in
/// the list's coordinates): of every text item in the group, however deep. A node drawn in several
/// groups has a rectangle for each. A group with nothing drawn in it has none.
fn boxed(list: &mut [V]) {
    let (inside, mut of) = (within(list), Vec::<(usize, [f64; 4])>::new());
    for (i, b, _) in boxes(list) {
        for &p in &inside[i] {
            match of.iter_mut().find(|e| e.0 == p) {
                Some(e) => e.1 = [e.1[0].min(b[0]), e.1[1].min(b[1]), e.1[2].max(b[2]), e.1[3].max(b[3])],
                None => of.push((p, b)),
            }
        }
    }
    for (p, b) in of {
        if let Some(V::M(m)) = list[p].l().get(1).cloned() {
            let mut m = m;
            m.push((String::from("box"), V::L(vec![V::F(b[0]), V::F(b[1]), V::F(b[2] - b[0]), V::F(b[3] - b[1])])));
            list[p] = V::L(vec![t("push"), V::M(m)]);
        }
    }
}

/// One input event from the host (PLAYER 9.2), and what the host is to do: a list of effects, each
/// `[kind, value]`. Events: `{view: [w, h]}`; `{press: [x, y], on: n}`, a press on the n-th list;
/// `{focus: id or null, on: n}`, the node of that list the host's focus is now on; from the editing
/// surface `{edit: id, at, del, ins}` or `{edit: id, s}` as it is used (see `step`), and
/// `{edit: id, end: true, s}` when the person is done, or `end: false` when they give it up.
/// Effects: `draw` `{on, list, w, h}`, one for each list that is not as the host last had it; `edit`
/// `{id, at, s, font, size, weight}` to mount the editing surface, or null to unmount it; `show`
/// `{on, at}`, a rectangle of a list to bring into view; `deliver` `{name, type, bytes}`, a file for
/// the person. `own` is a tools universe the reader holds itself (K3); with none, the one the
/// working universe carries is presented (9.6); with neither, the working universe, to read.
pub fn input(rd: &mut Reader, own: Option<&Pack>, pk: &mut Pack, ev: &V) -> V {
    let mut fx = Vec::new();
    let home = own.map(|t| t.head).or_else(|| carried(pk));
    let object = |pk: &Pack, id: &Id| home.and_then(|h| own.unwrap_or(pk).object(&h, id));
    let num = |v: &V, i: usize| v.l().get(i).and_then(|x| x.f());
    let on = (ev.get("on").and_then(|n| n.i()) == Some(1)) as usize;
    if let Some(v) = ev.get("view") {
        rd.w = num(v, 0).unwrap_or(rd.w).max(160.0);
    } else if let Some(p) = ev.get("press") {
        if rd.entry.is_some() || rd.field.is_some() {
            return V::L(fx); // the editing surface is the host's until it reports back
        }
        let (x, y) = (num(p, 0).unwrap_or(-1.0), num(p, 1).unwrap_or(-1.0));
        if let Some((i, scale)) = at(&rd.lists[on], x, y, "press", 14.0, 24.0) {
            // 7.6: what was pressed names a thing of the tools universe, and of a text the span. Its handler for a
            // press is performed; or, if it has none and takes text entry, the editing surface is put on its value.
            let it = rd.lists[on][i].l()[1].clone();
            let (id, key) = (it.get("press").and_then(|p| p.l().first()?.id()), it.get("press").and_then(|p| p.l().get(1)?.s()));
            let o = id.and_then(|id| object(pk, &id));
            let holder = o.as_ref().and_then(|o| match key {
                Some(k) => o.p.get("spans")?.get(k),
                None => Some(&o.p),
            });
            match (holder.and_then(|h| h.get("on")?.get("press")).cloned(), it.get("value").and_then(|v| v.s()), id) {
                (Some(h), _, _) => perform(rd, pk, &h, &[], None, &mut fx),
                (None, Some(s), Some(id)) => {
                    if let Some((_, e)) = surface(rd, on, i, scale, s) {
                        rd.field = Some((rd.serial, id));
                        fx.extend(e);
                    }
                }
                _ => {}
            }
        } else if let Some((i, scale)) = at(&rd.lists[on], x, y, "src", 10.0, f64::INFINITY).filter(|_| rd.editable && on == 1) {
            // 7.6: editable text, pressed: `text.edit` (PLAYER 9.3), on the block of the subject that holds the item
            let b = rd.lists[1][i].l()[1].get("src").and_then(|src| block_at(pk, src));
            let found = b.as_ref().and_then(|b| Some((b.get("text")?.s()?, b.get("o")?.id()?, b.get("lo")?.i()? as usize, b.get("hi")?.i()? as usize)));
            if let Some((s, o, lo, hi)) = found {
                if let Some((node, e)) = surface(rd, 1, i, scale, s) {
                    let text: Vec<char> = s.chars().collect();
                    rd.entry = Some(Entry { id: rd.serial, node, o, lo, hi, now: text.iter().copied().enumerate().collect(), text });
                    fx.extend(e);
                }
            }
        }
    } else if let Some(f) = ev.get("focus") {
        rd.focus = f.i().map(|id| (on, id));
        if let Some(b) = rd.focus.and_then(|(n, id)| bounds(&rd.lists[n], id)) {
            fx.push(effect("show", map(vec![("on", V::Int(on as i64)), ("at", V::L(vec![V::F(b[0]), V::F(b[1]), V::F(b[2] - b[0]), V::F(b[3] - b[1])]))])));
        }
    } else if let Some((_, id)) = ev.get("edit").and_then(|n| rd.field.filter(|f| Some(f.0) == n.i())) {
        // text entry on a value: when the person is done, the `change` handler of what presents it is performed,
        // with the text as `arg("text")` (Appendix A: `change` is an `edit` event delivered to it)
        let Some(V::Bool(done)) = ev.get("end") else { return V::L(fx) };
        rd.field = None;
        fx.push(effect("edit", V::Null));
        if let (true, Some(h)) = (*done, object(pk, &id).and_then(|o| o.p.get("on")?.get("change").cloned())) {
            perform(rd, pk, &h, &[(String::from("text"), ev.get("s").cloned().unwrap_or(V::Null))], None, &mut fx);
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
        // 7.6: text entry on the subject is an `edit` event delivered to the Portal it is presented through: where
        // it comes to a difference, that Portal's `change` handler is performed, and says how it is proposed
        let h = rd.through.and_then(|id| object(pk, &id)).and_then(|o| o.p.get("on")?.get("change").cloned());
        if let (false, Some(e), Some(h)) = (edits.is_empty(), e, h) {
            perform(rd, pk, &h, &[], Some((e, edits)), &mut fx);
        }
    } else {
        return V::L(fx);
    }
    let mut out = present(rd, own, pk, home);
    out.append(&mut fx);
    V::L(out)
}
/// 7.6: a handler performed. It is one map, or several in a list, performed in order, each with its
/// formulas evaluated against the state the ones before it left; a formula that gives an error
/// value, or an action that is refused, ends the list there. `{set, to}` sets presentation state.
/// `{act, …, into}` is an action of 10.3, with its arguments, performed as the act of the person
/// using the reader; what came of it is set in the presentation state under the name in `into`, if
/// there is one: `{ok: true, …}`, or `{ok: false, why}`. The actions here are `export`, of the
/// subject, and `propose`, of the change the event carries: what was done in the editing surface.
fn perform(rd: &mut Reader, pk: &mut Pack, h: &V, event: &[(String, V)], mut change: Option<(Entry, Vec<Edit>)>, fx: &mut Vec<V>) {
    for h in if let V::L(l) = h { &l[..] } else { core::slice::from_ref(h) } {
        let Some(m) = eval(h, &Env::new(&rd.state, &rd.args, event, pk)) else { return };
        let set = |state: &mut Vec<(String, V)>, name: &str, v: V| {
            state.retain(|e| e.0 != name);
            state.push((String::from(name), v));
        };
        if let Some(name) = m.get("set").and_then(|n| n.s()) {
            set(&mut rd.state, name, m.get("to").cloned().unwrap_or(V::Null));
        } else if let Some(act) = m.get("act").and_then(|a| a.s()) {
            let text = |k: &str| m.get(k).and_then(|x| x.s()).filter(|s| !s.is_empty());
            let done = match (act, change.take()) {
                ("export", _) if m.get("universe").map_or(false, is_subject) => export(&rd.parts, rd.shown, pk, text("name"), m.get("history") != Some(&V::Bool(false)), fx),
                ("propose", Some((e, edits))) => text("who").ok_or("a change says who made it, and no name was given").and_then(|who| {
                    let mut random = [0u8; 64];
                    crate::random(&mut random);
                    let r = write::edit(pk, e.o, e.lo, e.hi, "", Some(edits), who, crate::now(), &random)?;
                    Ok(vec![("change", t(&hex(r.get("change").and_then(|c| c.b()).unwrap_or(&[]))))])
                }),
                _ => Err("this reader cannot do that"),
            };
            let (ok, v) = match done {
                Ok(mut said) => {
                    said.push(("ok", V::Bool(true)));
                    (true, map(said))
                }
                Err(why) => (false, map(vec![("ok", V::Bool(false)), ("why", t(why))])),
            };
            if let Some(name) = m.get("into").and_then(|n| n.s()) {
                set(&mut rd.state, name, v);
            }
            if !ok {
                return;
            }
        }
    }
}
/// 10.3 `export`, of the subject, as a web envelope (TRAVEL 13.2): the parts this reader came in, with
/// the subject's static face, its pack and today's date in place of those it came with. With its
/// history, the pack is the whole of what is held; without, a copy that holds the content and
/// attribution layers and says that history is withheld (13.3, E9). What is held here is not
/// changed either way (E13). It is refused unless what is on the screen asked `leaving` of the
/// subject with the same choice (E12: nothing leaves that was not shown), and unless it has a name.
fn export(parts: &V, shown: Option<bool>, pk: &Pack, name: Option<&str>, history: bool, fx: &mut Vec<V>) -> Result<Vec<(&'static str, V)>, &'static str> {
    let V::M(mut parts) = parts.clone() else { return Err("this reader was not given the parts of a file to make another from") };
    if shown != Some(history) {
        return Err("what would leave has not been shown (E12)");
    }
    let name = name.ok_or("no name was given for the file")?;
    let pack = if history { pk.bytes().to_vec() } else { crate::query::published(pk).ok_or("the copy could not be made")? };
    for (k, v) in [("static-html", static_face(pk).ok_or("no primary face")?), ("pack", write::base64(&pack)), ("date", format(crate::now() as f64, "YYYY-MM-DD").unwrap_or_default())] {
        parts.retain(|e| e.0 != k);
        parts.push((String::from(k), V::T(v)));
    }
    let page = envelope(&V::M(parts))?;
    let said = vec![("name", t(name)), ("bytes", V::Int(page.len() as i64)), ("commit", t(&hex(&pk.head)))];
    fx.push(effect("deliver", map(vec![("name", t(name)), ("type", t("text/html")), ("bytes", V::B(page.into_bytes()))])));
    Ok(said)
}
/// `text.edit` (PLAYER 9.3): the host's editing surface asked for, on what holds the i-th item of a
/// list, with the text `s`. The rectangle is that of the innermost node that can be pressed, as it
/// was last drawn. Gives that node, and the effects.
fn surface(rd: &mut Reader, on: usize, i: usize, scale: f64, s: &str) -> Option<(i64, Vec<V>)> {
    let list = &rd.lists[on];
    let it = &list[i].l()[1];
    let node = within(list)[i].iter().rev().find(|&&p| list[p].l()[1].get("press").is_some()).and_then(|&p| id_of(list, p))?;
    let r = bounds(list, node)?;
    rd.serial += 1;
    let wide = (rd.w - 2.0 * r[0]).max(r[2] - r[0]);
    let at = V::L(vec![V::F(r[0]), V::F(r[1]), V::F(wide), V::F(r[3] - r[1])]);
    let mut m = vec![("id", V::Int(rd.serial)), ("at", at.clone()), ("s", t(s)), ("size", V::F(it.get("size")?.f()? * scale))];
    for k in ["font", "weight", "slant"] {
        if let Some(v) = it.get(k) {
            m.push((k, v.clone()));
        }
    }
    Some((node, vec![effect("edit", map(m)), effect("show", map(vec![("on", V::Int(on as i64)), ("at", at)]))]))
}
/// The tools universe composed at the reader's width, with the subject in it, as two lists: what
/// comes before the subject, which the host holds in view; and the subject, which scrolls. With no
/// tools universe, the reader's own words in the first and the subject's primary face in the second.
/// The node that has the focus, and the block being changed, are each ringed. Gives a `draw` effect
/// for each list that changed.
fn present(rd: &mut Reader, own: Option<&Pack>, pk: &Pack, home: Option<H>) -> Vec<V> {
    let (mut lists, mut high) = ([Vec::new(), Vec::new()], [0.0; 2]);
    let (mut editable, mut through, mut shown) = (false, None, None);
    if let Some(home) = home {
        let (tools, env) = (own.unwrap_or(pk), Env::new(&rd.state, &rd.args, &[], pk));
        let mut cx = Ctx::new(tools, &crate::host, Some(&env));
        cx.root = home;
        let rows = primary(tools, &home).map(|id| compose(&mut cx, &home, &id, rd.w)).unwrap_or_default();
        let cut = rows.iter().position(|r| r.block == SUBJECT).unwrap_or(rows.len());
        high[0] = stack(&rows[..cut], 0.0, 0.0, &mut lists[0]);
        high[1] = stack(&rows[cut..], 0.0, 0.0, &mut lists[1]);
        (editable, through, shown) = (env.editable.get(), env.through.get(), env.left.get());
    } else {
        let mut cx = Ctx::new(pk, &crate::host, None);
        let said = said_rows(&mut cx, "This file carries no tools, and this reader has none of its own. The document is shown to be read; it cannot be changed or saved from here.", rd.w - 32.0, "status");
        high[0] = stack(&said, 16.0, 10.0, &mut lists[0]) + 10.0;
        let rows = primary(pk, &pk.head).map(|id| compose(&mut cx, &pk.head, &id, rd.w - 48.0)).unwrap_or_default();
        high[1] = stack(&rows, 24.0, 24.0, &mut lists[1]) + 24.0;
    }
    for (n, id) in rd.focus.into_iter().chain(rd.entry.as_ref().map(|e| (1, e.node))) {
        if let Some(b) = bounds(&lists[n], id) {
            let (f, c) = (|x: f64| V::F(x), V::L(vec![V::F(0.08), V::F(0.35), V::F(0.84), V::F(1.0)]));
            let d = V::L(vec![V::L(vec![t("M"), f(b[0] - 3.0), f(b[1] - 2.0)]), V::L(vec![t("L"), f(b[2] + 3.0), f(b[1] - 2.0)]), V::L(vec![t("L"), f(b[2] + 3.0), f(b[3] + 2.0)]), V::L(vec![t("L"), f(b[0] - 3.0), f(b[3] + 2.0)]), V::L(vec![t("Z")])]);
            lists[n].push(V::L(vec![t("path"), map(vec![("d", d), ("stroke", c), ("width", f(2.0))])]));
        }
    }
    let mut fx = Vec::new();
    for n in 0..2 {
        boxed(&mut lists[n]);
        if lists[n] != rd.lists[n] || high[n] != rd.high[n] || rd.w != rd.drawn {
            fx.push(effect("draw", map(vec![("on", V::Int(n as i64)), ("list", V::L(lists[n].clone())), ("w", V::F(rd.w)), ("h", V::F(high[n]))])));
        }
    }
    (rd.editable, rd.through, rd.shown, rd.lists, rd.high, rd.drawn) = (editable, through, shown, lists, high, rd.w);
    fx
}
