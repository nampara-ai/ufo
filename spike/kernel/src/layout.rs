// From description to display list (SPEC-PRESENTATION 7.7): blocks, pieces, lines, rows, pages.
// The plain-text face (8.3). Line breaking and bidirectional ordering are the kernel's own.
use crate::pack::*;
use crate::spell::{cat, put};
use crate::value::*;
use crate::{bidi, linebreak as lb};
use alloc::boxed::Box;
use alloc::string::String;
use alloc::vec;
use alloc::vec::Vec;

/// One unbreakable strip of a vertical flow: a line of text, a rule, a picture.
pub struct Row {
    pub h: f64,
    pub gap: f64, // space wanted above it; dropped at the top of a page
    pub items: Vec<V>,
    pub keep: bool, // may not end a page
    pub block: u32,
    pub line: u32,
    pub lines: u32,
    pub path: Vec<V>, // the nodes it lies in, outermost first: what an accessibility tree needs (PLAYER 9.2)
}
/// A node: a group of items that is one thing to an accessibility tree. Its `push` carries the map:
/// `role`, an `id` that tells nodes apart (a node drawn in several pieces has several groups of one
/// `id`), and whatever of `level`, `label`, `lang`, `press`, `pressed`, `current` it has. A list says
/// whether it is `ordered` (its first item is numbered); an item its `value` if it is numbered, or
/// `own` if its marker is text of its own. The marker itself is a text item of the item, with no `src`.
pub fn node(role: &str, id: i64, more: Vec<(&'static str, V)>) -> V {
    let mut m = vec![("role", t(role)), ("id", V::Int(id))];
    m.extend(more);
    map(m)
}
/// What an object or a span says of itself that a node repeats: its name, its language, and how it
/// stands (`pressed`, `current`: booleans, in a tools universe usually formulas over its state).
fn said(v: &V, m: &mut Vec<(&'static str, V)>) {
    for k in ["label", "lang"] {
        if let Some(x) = v.get(k).filter(|x| x.s().is_some()) {
            m.push((k, x.clone()));
        }
    }
    for k in ["pressed", "current"] {
        if let Some(V::Bool(b)) = v.get(k) {
            m.push((k, V::Bool(*b)));
        }
    }
}
#[derive(Clone, PartialEq)]
struct Style {
    size: f64,
    weight: i64,
    slant: bool,
    color: V,
    font: V,
    line: f64,
    align: u8, // 0 start, 1 center, 2 end
    dir: u8,   // 0 left to right, 1 right to left, 2 auto
    deco: u8,  // 0 none, 1 underline, 2 strike
    start: f64, // indents, on the side lines start from and on the other
    end: f64,
    press: V, // in a tools universe: the key of the span whose `on` handler the characters lie under
    node: V,  // the node the characters lie in, if an inline span makes one (a button, a link)
}
pub struct Ctx<'a> {
    pub pk: &'a Pack,
    pub root: H,
    pub chain: Vec<(H, Id)>,
    pub blocks: u32,
    pub measure: &'a dyn Fn(&V) -> Option<V>,
    pub env: Option<&'a crate::tool::Env<'a>>, // what is composed is the reader's tools: formulas have values, items say what pressing them names
    pub nodes: i64,  // nodes that are not blocks, numbered: an identity is twice a block's number, or twice this and one
    pub press: bool, // a press on a block does something (its text is editable, 7.6): its node says so
    pub own: bool,   // what was just composed can itself be pressed (a value that takes text entry, an object with a handler)
    pub seat: u32,   // where in the description what is being composed sits: which child of which group, in which copy of a template
}
impl<'a> Ctx<'a> {
    pub fn new(pk: &'a Pack, measure: &'a dyn Fn(&V) -> Option<V>, env: Option<&'a crate::tool::Env<'a>>) -> Ctx<'a> {
        Ctx { pk, root: pk.head, chain: Vec::new(), blocks: 0, measure, env, nodes: 0, press: false, own: false, seat: 0 }
    }
    fn next(&mut self) -> i64 {
        self.nodes += 1;
        2 * self.nodes + 1
    }
}
/// The block number of the row that holds a subject, as the reader's tools present it (tool.rs).
pub const SUBJECT: u32 = u32::MAX;
fn fl(x: f64) -> V {
    V::F(x)
}
fn black() -> V {
    V::L(vec![fl(0.0), fl(0.0), fl(0.0), fl(1.0)])
}
fn plain_style() -> Style {
    Style { size: 16.0, weight: 400, slant: false, color: black(), font: V::L(vec![t("serif")]), line: 1.4, align: 0, dir: 0, deco: 0, start: 0.0, end: 0.0, press: V::Null, node: V::Null }
}
/// A row of the reader's own words, where an object cannot be presented.
pub fn label_row(cx: &mut Ctx, s: &str, w: f64) -> Vec<Row> {
    said_rows(cx, s, w, "paragraph")
}
/// The same, as a node of the role given.
pub fn said_rows(cx: &mut Ctx, s: &str, w: f64, role: &str) -> Vec<Row> {
    let st = Style { size: 13.0, slant: true, color: V::L(vec![fl(0.4), fl(0.4), fl(0.4), fl(1.0)]), font: V::L(vec![t("sans-serif")]), ..plain_style() };
    own_rows(cx, s, &st, w, role)
}
fn own_rows(cx: &mut Ctx, s: &str, st: &Style, w: f64, role: &str) -> Vec<Row> {
    let cs: Vec<char> = s.chars().collect();
    let n = cs.len();
    let mut rows = lines(cx, &Seg { cs, st: vec![0; n], pos: vec![0; n], bx: vec![None; n] }, core::slice::from_ref(st), st, false, w, None).0;
    for r in rows.iter_mut() {
        r.path = vec![node(role, 2 * r.block as i64, Vec::new())];
    }
    rows
}
/// The plain-text face (8.3) as rows: each of its lines set in a monospaced font and broken to the width.
pub fn plain_rows(cx: &mut Ctx, s: &str, w: f64) -> Vec<Row> {
    let st = Style { size: 14.0, font: V::L(vec![t("monospace")]), ..plain_style() };
    let mut rows = Vec::new();
    for l in s.trim_end_matches('\n').split('\n') {
        if l.is_empty() {
            cx.blocks += 1;
            rows.push(Row { h: st.size * st.line, gap: 0.0, items: Vec::new(), keep: false, block: cx.blocks, line: 0, lines: 1, path: Vec::new() });
        } else {
            rows.append(&mut own_rows(cx, l, &st, w, "paragraph"));
        }
    }
    rows
}
/// The face of pages (7.7) of what `f` presents, as items: each page a region of fixed size with a
/// background, holding its share of the flow. Gives the page's width, the height of them all, the
/// rows each page takes, and the rows.
pub fn paged(cx: &mut Ctx, root: &H, f: &Obj, params: &V, list: &mut Vec<V>) -> Option<(f64, f64, Vec<(usize, usize)>, Vec<Row>)> {
    let s = f.p.get("sampling");
    let dim = |k: &str, i: usize, d: f64| params.get(k).or(s.and_then(|s| s.get(k))).and_then(|v| v.l().get(i)).and_then(|v| v.f()).unwrap_or(d);
    let (pw, ph) = (dim("page", 0, 595.0), dim("page", 1, 842.0));
    let (mt, mr, mb, ml) = (dim("margins", 0, 48.0), dim("margins", 1, 48.0), dim("margins", 2, 48.0), dim("margins", 3, 48.0));
    let rows = compose(cx, root, &f.p.get("of")?.tag(REF)?.id()?, pw - ml - mr);
    let pages = paginate(&rows, ph - mt - mb);
    let gap = 16.0;
    for (k, (a, b)) in pages.iter().enumerate() {
        let top = k as f64 * (ph + gap);
        let id = cx.next();
        list.push(V::L(vec![t("push"), map(vec![("m", V::L(vec![fl(1.0), fl(0.0), fl(0.0), fl(1.0), fl(0.0), fl(top)])), ("clip", V::L(vec![fl(0.0), fl(0.0), fl(pw), fl(ph)])), ("role", t("region")), ("id", V::Int(id)), ("label", V::T(cat!("Page ", k + 1)))])]));
        list.push(V::L(vec![t("path"), map(vec![("d", V::L(vec![V::L(vec![t("M"), fl(0.0), fl(0.0)]), V::L(vec![t("L"), fl(pw), fl(0.0)]), V::L(vec![t("L"), fl(pw), fl(ph)]), V::L(vec![t("L"), fl(0.0), fl(ph)]), V::L(vec![t("Z")])])), ("fill", V::L(vec![fl(1.0), fl(1.0), fl(1.0), fl(1.0)]))])]));
        stack(&rows[*a..*b], ml, mt, list);
        list.push(V::L(vec![t("pop")]));
    }
    let n = pages.len() as f64;
    Some((pw, n * ph + (n - 1.0).max(0.0) * gap, pages, rows))
}

pub fn compose(cx: &mut Ctx, uni: &H, id: &Id, w: f64) -> Vec<Row> {
    // O7: an object already being presented is shown as a link, not expanded
    if cx.chain.len() >= 16 || cx.chain.contains(&(*uni, *id)) {
        return label_row(cx, "(shown above)", w);
    }
    let Some(mut o) = cx.pk.object(uni, id) else {
        return label_row(cx, "(not available)", w);
    };
    if let Some(env) = cx.env {
        o.p = crate::tool::settle(&o.p, env); // 7.3: a property may be a formula; here it has its value
        if o.p.get("visible") == Some(&V::Bool(false)) {
            return Vec::new(); // Appendix A, `visible`: when it is present
        }
    }
    // Appendix A, in a parent: `margin`, one float or four (top, right, bottom, left)
    let margin: Vec<f64> = o.p.get("margin").map(|m| if let Some(x) = m.f() { vec![x; 4] } else { m.l().iter().filter_map(|x| x.f()).collect() }).filter(|m| m.len() == 4).unwrap_or_default();
    let w = margin.get(1).map_or(w, |r| w - r - margin[3]);
    cx.chain.push((*uni, *id));
    let mut rows = match o.ty.as_str() {
        "ufo.text" => text_rows(cx, uni, &o, None, w).unwrap_or_else(|| label_row(cx, "(inconsistent text: not presented)", w)), // step 1
        "ufo.group" if o.p.get("layout").and_then(|l| l.s()) == Some("grid") => grid(cx, uni, &o, w),
        "ufo.group" => {
            let gap = o.p.get("gap").and_then(|g| g.f()).unwrap_or(0.0);
            let mut rows = Vec::new();
            // 7.3, repetition: under `each` the child is a template, presented once for each item, with `arg` of the
            // name in `as` bound to the item
            let items = each_of(cx, uni, &o);
            let name = String::from(o.p.get("as").and_then(|a| a.s()).unwrap_or(""));
            for (j, item) in items.into_iter().enumerate() {
                if let (Some(env), Some(v)) = (cx.env, &item) {
                    env.args.borrow_mut().push((name.clone(), v.clone()));
                }
                for (i, c) in o.p.get("children").map(|c| c.l()).unwrap_or(&[]).iter().enumerate() {
                    if let Some(cid) = c.tag(REF).and_then(|x| x.id()) {
                        // Where formulas have values, what is shown comes and goes with the state. A node's identity is
                        // then to be that of its place in the description, not of how many rows happen to stand before
                        // it: a host keeps a node by its identity, and with it the focus. Numbering starts afresh, at a
                        // number made from the seat, for each child of a group and each copy of a template.
                        let seat = cx.seat;
                        if cx.env.is_some() {
                            cx.seat = (seat.wrapping_mul(31).wrapping_add((j * 61 + i + 1) as u32)) & 0xf_ffff;
                            (cx.blocks, cx.nodes) = (cx.seat << 8, (cx.seat as i64) << 8);
                        }
                        let mut r = compose(cx, uni, &cid, w);
                        cx.seat = seat;
                        if let (false, Some(first)) = (rows.is_empty(), r.first_mut()) {
                            first.gap = first.gap.max(gap);
                        }
                        rows.append(&mut r);
                    }
                }
                if let (Some(env), Some(_)) = (cx.env, &item) {
                    env.args.borrow_mut().pop();
                }
            }
            rows
        }
        "ufo.path" => {
            let mut m = vec![("d", o.p.get("d").cloned().unwrap_or(V::L(vec![])))];
            for k in ["fill", "stroke", "width", "join", "cap", "dash", "rule"] {
                if let Some(v) = o.p.get(k) {
                    m.push((k, v.clone()));
                }
            }
            m.push(("src", src(cx, uni, id, None)));
            cx.blocks += 1;
            vec![Row { h: o.p.get("h").and_then(|h| h.f()).unwrap_or(0.0), gap: 0.0, items: vec![V::L(vec![t("path"), map(m)])], keep: false, block: cx.blocks, line: 0, lines: 1, path: Vec::new() }]
        }
        "ufo.portal" => portal(cx, uni, &o, w),
        _ => {
            let l = String::from(o.p.get("label").and_then(|l| l.s()).unwrap_or("(object)"));
            label_row(cx, &l, w)
        }
    };
    cx.chain.pop();
    let own = core::mem::take(&mut cx.own);
    // an object that says what it is (`role`) is a node, and what it presents lies in it
    if let Some(role) = o.p.get("role").and_then(|r| r.s()) {
        let mut m = Vec::new();
        said(&o.p, &mut m);
        if own {
            m.push(("press", V::Bool(true)));
        }
        let n = node(role, cx.next(), m);
        for r in rows.iter_mut() {
            r.path.insert(0, n.clone());
        }
    }
    if let (4, Some(last)) = (margin.len(), rows.len().checked_sub(1)) {
        for (k, r) in rows.iter_mut().enumerate() {
            r.items.insert(0, V::L(vec![t("push"), map(vec![("m", V::L(vec![fl(1.0), fl(0.0), fl(0.0), fl(1.0), fl(margin[3]), fl(if k == 0 { margin[0] } else { 0.0 })]))])]));
            r.items.push(V::L(vec![t("pop")]));
        }
        rows[0].h += margin[0];
        rows[last].h += margin[2];
    }
    rows
}
fn portal(cx: &mut Ctx, uni: &H, o: &Obj, w: f64) -> Vec<Row> {
    let label = String::from(o.p.get("label").and_then(|l| l.s()).unwrap_or("(portal)"));
    let w = o.p.get("w").and_then(|x| x.f()).map(|x| x.min(w)).unwrap_or(w);
    let Some(of) = o.p.get("of") else { return label_row(cx, &label, w) };
    if let Some(id) = of.tag(REF).and_then(|x| x.id()) {
        return compose(cx, uni, &id, w);
    }
    if let Some(env) = cx.env {
        // 7.6: `of` may be `arg`, and here has its value. The subject: only what the reader itself presents as
        // tools has one to be given (F6). A text: presented as a text that says nothing of itself is (Appendix
        // A, the defaults). Nothing: the label, as for any target that is not there (O4). What is `editable`
        // takes text entry, and what has a handler for a press can be pressed: its items say so, naming it.
        if crate::tool::is_subject(of) {
            return crate::tool::subject_rows(cx, env, o, w).unwrap_or_else(|| label_row(cx, &label, w));
        }
        if matches!(of, V::T(_) | V::Null) {
            let s = of.s().unwrap_or("");
            let mut rows = if s.is_empty() { label_row(cx, &label, w) } else { own_rows(cx, s, &plain_style(), w, "paragraph") };
            // a value in what a file presents takes text entry only while the reader has the file open for changes
            let field = o.p.get("editable") == Some(&V::Bool(true)) && (env.home.is_none() || cx.press);
            if field || o.p.get("on").and_then(|h| h.get("press")).is_some() {
                cx.own = true;
                let names = names(cx, &o.id, V::Null);
                for item in rows.iter_mut().flat_map(|r| r.items.iter_mut()) {
                    more(item, "press", names.clone());
                    if field {
                        more(item, "value", t(s));
                    }
                }
            }
            return rows;
        }
    }
    if of.tag(crate::tool::FORMULA).is_some() {
        return label_row(cx, &label, w); // for anything a file presents, formulas have no values: the label
    }
    if let Some(a) = of.tag(ANCHOR) {
        // 1.8: an anchor may name a commit of another universe; nested if its records are here
        let target = a.get("u").and_then(|u| u.hash()).unwrap_or(*uni);
        let Some(id) = a.get("o").and_then(|x| x.id()) else { return label_row(cx, &label, w) };
        if cx.pk.node(&target).is_none() {
            // O4: linked and not at hand: an inspectable placeholder
            return label_row(cx, &label, w);
        }
        if let Some(region) = a.get("a").and_then(|r| r.get("chars")) {
            if let Some(t) = cx.pk.object(&target, &id) {
                if let Some(rows) = text_rows(cx, &target, &t, Some(region), w) {
                    return rows;
                }
            }
            return label_row(cx, &label, w);
        }
        return compose(cx, &target, &id, w);
    }
    label_row(cx, &label, w)
}
/// The anchor a display-list item carries back to its description.
fn src(cx: &Ctx, uni: &H, id: &Id, chars: Option<(&El, &El)>) -> V {
    let mut m = vec![("o", V::B(id.to_vec()))];
    if let Some((a, b)) = chars {
        let bd = |e: &El, side: i64| V::L(vec![V::B(e.c.to_vec()), V::Int(e.n as i64), V::Int(side)]);
        m.push(("a", map(vec![("chars", V::L(vec![t("s"), bd(a, 0), bd(b, 1)]))])));
    }
    if *uni != cx.root {
        m.push(("u", V::B(uni.to_vec())));
    }
    V::Tag(ANCHOR, Box::new(map(m)))
}

pub struct Span<'a> {
    pub a: usize,
    pub b: usize,
    block: bool,
    pub role: &'a str,
    key: &'a str,
    v: &'a V,
}
/// Step 2: the spans that resolve, in key order.
pub fn spans<'a>(o: &'a Obj, rs: &[Run]) -> Vec<Span<'a>> {
    let mut out = Vec::new();
    if let Some(V::M(m)) = o.p.get("spans") {
        for (key, v) in m {
            let Some(reg) = v.get("at").and_then(|a| a.tag(ANCHOR)).and_then(|a| a.get("a")).and_then(|a| a.get("chars")) else { continue };
            let r = reg.l();
            if r.len() != 3 {
                continue;
            }
            let (Some(a), Some(b)) = (place(rs, &r[1]), place(rs, &r[2])) else { continue }; // detached: takes no part
            let block = v.get("kind").and_then(|k| k.s()) == Some("block");
            if a < b || (block && a == b) {
                out.push(Span { a, b, block, role: v.get("role").and_then(|r| r.s()).unwrap_or(""), key, v });
            }
        }
    }
    out
}
fn restyle(st: &mut Style, v: &V) {
    if let Some(x) = v.get("size").and_then(|x| x.f()) {
        st.size = x;
    }
    if let Some(x) = v.get("weight").and_then(|x| x.i()) {
        st.weight = x;
    }
    if let Some(V::Bool(x)) = v.get("slant") {
        st.slant = *x;
    }
    if let Some(x) = v.get("color") {
        st.color = x.clone();
    }
    if let Some(x) = v.get("font") {
        st.font = x.clone();
    }
    if let Some(x) = v.get("line").and_then(|x| x.f()) {
        st.line = x;
    }
    let word = |k: &str, of: [&str; 3], to: &mut u8| {
        if let Some(i) = v.get(k).and_then(|x| x.s()).and_then(|x| of.iter().position(|o| *o == x)) {
            *to = i as u8;
        }
    };
    word("align", ["start", "center", "end"], &mut st.align);
    word("direction", ["ltr", "rtl", "auto"], &mut st.dir);
    word("decoration", ["none", "underline", "strike"], &mut st.deco);
}
/// What a press on an item names: the object, the key of a span of it or nothing, and what any `each` has bound
/// here, so that a handler can read it when the press comes. What a file presents adds that it is the file's:
/// a press on it is then never taken for one on the reader's tools, whatever identity it gives (F9).
fn names(cx: &Ctx, id: &Id, key: V) -> V {
    let mut v = vec![V::B(id.to_vec()), key, V::M(cx.env.map(|e| e.args.borrow()[e.base.min(e.args.borrow().len())..].to_vec()).unwrap_or_default())];
    if cx.env.map_or(false, |e| e.home.is_some()) {
        v.push(V::Bool(true));
    }
    V::L(v)
}
/// Where formulas have values, a span with an `on` handler gives the characters under it what a press on
/// them names: the text, and the span's key.
fn pressed(cx: &Ctx, st: &mut Style, s: &Span, id: &Id) -> bool {
    let on = cx.env.is_some() && s.v.get("on").is_some();
    if on {
        // with what any `each` has bound here, so that the handler can read it when the press comes
        st.press = names(cx, id, t(s.key));
    }
    on
}
/// The node a span makes: its role, with `level` for a heading or an item, what it says of itself,
/// and `press` if pressing it does something.
fn span_node(s: &Span, role: &str, id: i64, press: bool) -> V {
    let mut m = Vec::new();
    if matches!(role, "heading" | "item") {
        m.push(("level", V::Int(level(s) as i64)));
    }
    said(s.v, &mut m);
    if press {
        m.push(("press", V::Bool(true)));
    }
    node(role, id, m)
}
const HEADING: [f64; 6] = [2.0, 1.5, 1.25, 1.1, 1.0, 1.0];
pub fn level(s: &Span) -> usize {
    s.v.get("level").and_then(|l| l.i()).unwrap_or(1).max(1) as usize
}
/// A span's part in a style: the defaults of its role (Appendix A), then its own properties.
fn role_style(st: &mut Style, s: &Span, text: &Style) {
    match s.role {
        "heading" => {
            st.size = text.size * HEADING[level(s).min(6) - 1];
            st.weight = 700;
        }
        "item" => st.start += level(s) as f64 * 1.5 * text.size,
        "quote" => {
            st.start += text.size;
            st.end += text.size;
        }
        "code" => st.font = V::L(vec![t("monospace")]),
        "emphasis" => st.slant = true,
        "strong" => st.weight = 700,
        _ => {}
    }
    restyle(st, s.v);
}
/// A block: the characters `a` to `b` whose innermost block span is `span`, or an empty span.
pub struct Blk {
    pub span: Option<usize>,
    pub a: usize,
    pub b: usize,
}
/// Step 3: the blocks of the characters `ra` to `rb`, in order.
pub fn blocks(sp: &[Span], ra: usize, rb: usize) -> Vec<Blk> {
    let inner = |i: usize| -> Option<usize> {
        let mut best: Option<usize> = None;
        for (k, s) in sp.iter().enumerate() {
            if s.block && s.a <= i && i < s.b && best.map_or(true, |b| s.a > sp[b].a || (s.a == sp[b].a && s.b < sp[b].b)) {
                best = Some(k);
            }
        }
        best
    };
    let mut empty: Vec<usize> = Vec::new(); // by place, then by key
    for k in (0..sp.len()).filter(|&k| sp[k].block && sp[k].a == sp[k].b && ra <= sp[k].a && sp[k].a <= rb) {
        empty.insert(empty.partition_point(|&e| sp[e].a <= sp[k].a), k);
    }
    let (mut out, mut i) = (Vec::new(), ra);
    loop {
        // an empty block comes before the first block that begins at or after its place
        let n = empty.iter().take_while(|&&k| sp[k].a <= i || i >= rb).count();
        out.extend(empty.drain(..n).map(|k| Blk { span: Some(k), a: sp[k].a, b: sp[k].a }));
        if i >= rb {
            return out;
        }
        let (b, mut e) = (inner(i), i + 1);
        while e < rb && inner(e) == b {
            e += 1;
        }
        out.push(Blk { span: b, a: i, b: e });
        i = e;
    }
}
/// Step 7: for each block that is a list item, its level and its marker's text.
fn markers(sp: &[Span], bl: &[Blk]) -> Vec<Option<(usize, String)>> {
    let mut counts: Vec<Option<i64>> = Vec::new(); // the number of the latest item of each level
    let mut out = Vec::new();
    for b in bl {
        let s = b.span.map(|k| &sp[k]);
        if s.map(|s| s.role) == Some("heading") {
            counts.clear();
        }
        let Some(s) = s.filter(|s| s.role == "item") else {
            out.push(None);
            continue;
        };
        let lvl = level(s);
        let n = match counts.get(lvl - 1) {
            Some(Some(c)) => c + 1,
            _ => s.v.get("start").and_then(|x| x.i()).unwrap_or(1),
        };
        counts.truncate(lvl - 1); // an item ends the counts of deeper levels
        counts.resize(lvl - 1, None);
        counts.push(Some(n));
        out.push(Some((lvl, match s.v.get("marker").and_then(|m| m.s()) {
            Some("number") => {
                let (mut d, mut n) = (String::from("."), n.max(0));
                loop {
                    d.insert(0, (b'0' + (n % 10) as u8) as char);
                    n /= 10;
                    if n == 0 {
                        break d;
                    }
                }
            }
            Some("bullet") | None => String::from("\u{2022}"),
            Some(other) => String::from(other),
        })));
    }
    out
}
fn inline<'a, 'b>(sp: &'b [Span<'a>]) -> Vec<&'b Span<'a>> {
    let mut v: Vec<&Span> = Vec::new(); // by start, then by key
    for s in sp.iter().filter(|s| !s.block) {
        v.insert(v.partition_point(|e| e.a <= s.a), s);
    }
    v
}
fn child_of(s: &Span) -> Option<Id> {
    s.v.get("child").and_then(|c| c.tag(REF)).and_then(|c| c.id())
}

/// A text, or a region of one, as rows: the steps of 7.7.
fn text_rows(cx: &mut Ctx, uni: &H, o: &Obj, region: Option<&V>, w: f64) -> Option<Vec<Row>> {
    let chars: Vec<char> = o.p.get("chars")?.s()?.chars().collect();
    let rs = runs(o.seq.as_ref()?.get("chars")?);
    let live: Vec<El> = expand(&rs).into_iter().filter(|e| e.live).collect();
    if live.len() != chars.len() {
        return None; // X1
    }
    let sp = spans(o, &rs);
    let inl = inline(&sp);
    let (ra, rb) = match region {
        Some(r) if r.l().len() == 3 => (place(&rs, &r.l()[1])?, place(&rs, &r.l()[2])?),
        _ => (0, chars.len()),
    };
    let mut text = plain_style();
    restyle(&mut text, &o.p);
    let line1 = text.size * text.line;
    let bl = blocks(&sp, ra, rb);
    let marks = markers(&sp, &bl);
    let mut rows: Vec<Row> = Vec::new();
    let mut asked = 0.0f64; // space the block before asked after itself
    let mut lists: Vec<(V, Option<V>)> = Vec::new(); // the lists open, one a level, each with its latest item
    let mut ids = vec![0i64; inl.len()]; // the identity of the node each inline span makes, once it is needed
    for (blk, mark) in bl.iter().zip(&marks) {
        let marker = mark.as_ref().map_or("", |m| m.1.as_str());
        // step 4: the block's style; steps 8: its spacing
        let mut st = text.clone();
        let mut press = cx.press;
        let (mut before, mut after, mut keep, mut code) = (0.0, line1, false, false);
        if let Some(k) = blk.span {
            let s = &sp[k];
            let encloses = |j: usize| {
                let e = &sp[j];
                e.block && j != k && if s.a == s.b { e.a < s.a && s.a < e.b } else { e.a <= s.a && s.b <= e.b && ((e.a, e.b) != (s.a, s.b) || j > k) }
            };
            let mut chain: Vec<usize> = Vec::new(); // outermost first
            for j in (0..sp.len()).filter(|&j| encloses(j)) {
                let at = chain.iter().position(|&x| (sp[j].a, sp[x].b, x) < (sp[x].a, sp[j].b, j)).unwrap_or(chain.len());
                chain.insert(at, j);
            }
            chain.push(k);
            for j in chain {
                role_style(&mut st, &sp[j], &text);
                press |= pressed(cx, &mut st, &sp[j], &o.id);
            }
            (before, after, keep, code) = match s.role {
                "heading" => (line1, line1 * 0.5, true, false),
                "item" => (0.0, line1 * 0.25, false, false),
                "paragraph" | "quote" => (0.0, line1, false, false),
                r => (0.0, 0.0, false, r == "code"),
            };
        }
        // step 5: the characters presented, each with its style, cut where a child is a block
        let mut styles: Vec<Style> = Vec::new();
        let mut g = Seg::default();
        let mut out: Vec<Row> = Vec::new();
        let mut mark = mark.as_ref();
        let mut flush = |cx: &mut Ctx, g: &mut Seg, styles: &[Style], out: &mut Vec<Row>| {
            if g.cs.is_empty() {
                return;
            }
            let (mut r, base, rtl) = lines(cx, g, styles, &st, code, w, Some((uni, &o.id, &live)));
            if let Some((_, m)) = mark.take() {
                marker_item(cx, &mut r[0], m, &st, Some(base), w, rtl);
            }
            out.append(&mut r);
            *g = Seg::default();
        };
        for p in blk.a..blk.b {
            let (mut cs, mut left_out, mut child) = (st.clone(), false, None);
            for (k, s) in inl.iter().enumerate().filter(|(_, s)| s.a <= p && p < s.b) {
                left_out |= s.role == "markup";
                if s.role == "embed" {
                    child = child_of(s);
                }
                role_style(&mut cs, s, &text);
                let on = pressed(cx, &mut cs, s, &o.id);
                if matches!(s.role, "button" | "link") {
                    if ids[k] == 0 {
                        ids[k] = cx.next();
                    }
                    cs.node = span_node(s, s.role, ids[k], on);
                }
            }
            if left_out {
                continue;
            }
            let mut bx = None;
            if let Some(cid) = child {
                let c = cx.pk.object(uni, &cid);
                let prop = |k: &str| c.as_ref().and_then(|c| c.p.get(k));
                if prop("place").and_then(|x| x.s()) == Some("inline") {
                    let dim = |k: &str| prop(k).and_then(|x| x.f()).unwrap_or(0.0);
                    bx = Some((cid, dim("w"), dim("h")));
                } else {
                    flush(cx, &mut g, &styles, &mut out);
                    for mut row in compose(cx, uni, &cid, w - st.start - st.end) {
                        row.items.insert(0, V::L(vec![t("push"), map(vec![("m", V::L(vec![fl(1.0), fl(0.0), fl(0.0), fl(1.0), fl(st.start), fl(0.0)]))])]));
                        row.items.push(V::L(vec![t("pop")]));
                        out.push(row);
                    }
                    continue;
                }
            }
            let si = styles.iter().position(|x| *x == cs).unwrap_or(styles.len());
            if si == styles.len() {
                styles.push(cs);
            }
            g.cs.push(chars[p]);
            g.st.push(si);
            g.pos.push(p);
            g.bx.push(bx);
        }
        flush(cx, &mut g, &styles, &mut out);
        if out.is_empty() {
            // an empty block: a row one line high
            cx.blocks += 1;
            out.push(Row { h: st.size * st.line, gap: 0.0, items: Vec::new(), keep: false, block: cx.blocks, line: 0, lines: 1, path: Vec::new() });
        }
        if let Some((_, m)) = mark.take() {
            marker_item(cx, &mut out[0], m, &st, None, w, st.dir == 1);
        }
        // the block's node: the first row's block number names it; an item lies in the list of its
        // level, and that in the item before it of the level above
        let (s, id) = (blk.span.map(|k| &sp[k]), 2 * out[0].block as i64);
        let mut path = Vec::new();
        match s.filter(|s| s.role == "item") {
            Some(s) => {
                let lvl = level(s);
                lists.truncate(lvl);
                // a numbered item says its number; one whose marker is neither a number nor the bullet, that it is its own
                let number = marker.strip_suffix('.').filter(|d| !d.is_empty() && d.bytes().all(|c| c.is_ascii_digit())).map(|d| d.bytes().fold(0i64, |n, c| n.wrapping_mul(10).wrapping_add((c - b'0') as i64)));
                while lists.len() < lvl {
                    lists.push((node("list", cx.next(), if number.is_some() { vec![("ordered", V::Bool(true))] } else { Vec::new() }), None));
                }
                let mut it = span_node(s, "item", id, press);
                if let V::M(m) = &mut it {
                    match number {
                        Some(n) => m.push((String::from("value"), V::Int(n))),
                        None if marker != "\u{2022}" => m.push((String::from("own"), V::Bool(true))),
                        None => {}
                    }
                }
                lists[lvl - 1].1 = Some(it);
                for (l, i) in &lists {
                    path.push(l.clone());
                    path.extend(i.clone());
                }
            }
            None => {
                lists.clear();
                path.push(match s {
                    Some(s) => span_node(s, if s.role.is_empty() { "paragraph" } else { s.role }, id, press),
                    None => node("paragraph", id, if press { vec![("press", V::Bool(true))] } else { Vec::new() }),
                });
            }
        }
        // (a block with nothing to read, an empty one, is no node: there is nothing to tell of it)
        for row in out.iter_mut().filter(|_| blk.a < blk.b) {
            row.path.splice(0..0, path.iter().cloned());
        }
        // step 8
        out[0].gap = out[0].gap.max(before).max(asked);
        asked = after;
        for mut row in out {
            row.keep |= keep;
            rows.push(row);
        }
    }
    Some(rows)
}
/// Asks the host what a piece measures (PLAYER 9.3): its advance up to each offset, its ascent and descent.
fn measure(cx: &Ctx, s: &[char], st: &Style, rtl: bool, at: &[usize]) -> (Vec<f64>, f64, f64) {
    let piece = map(vec![("s", V::T(s.iter().collect())), ("font", st.font.clone()), ("size", fl(st.size)), ("weight", V::Int(st.weight)), ("slant", V::Bool(st.slant)), ("dir", t(if rtl { "rtl" } else { "ltr" }))]);
    let rep = (cx.measure)(&map(vec![("piece", piece), ("at", V::L(at.iter().map(|&a| V::Int(a as i64)).collect()))])).unwrap_or(V::Null);
    let f = |v: Option<&V>| v.and_then(|x| x.f()).unwrap_or(0.0);
    let adv = rep.get("adv").map(|a| a.l()).unwrap_or(&[]);
    ((0..at.len()).map(|k| f(adv.get(k))).collect(), f(rep.get("asc")), f(rep.get("desc")))
}
fn text_item(s: &[char], x: f64, y: f64, st: &Style, adv: f64, rtl: bool, src: Option<V>) -> V {
    let mut m = vec![("s", V::T(s.iter().collect())), ("x", fl(x)), ("y", fl(y)), ("font", st.font.clone()), ("size", fl(st.size)), ("weight", V::Int(st.weight)), ("color", st.color.clone()), ("dir", t(if rtl { "rtl" } else { "ltr" })), ("adv", fl(adv))];
    if st.slant {
        m.push(("slant", V::Bool(true)));
    }
    if let Some(a) = src {
        m.push(("src", a));
    }
    if st.press != V::Null {
        m.push(("press", st.press.clone()));
    }
    V::L(vec![t("text"), map(m)])
}
/// Step 7: a list item's marker, on the baseline of the row, ending 0.4 of its size before the indent.
/// Where the row has no baseline (an empty item), the marker's own measure gives one.
fn marker_item(cx: &mut Ctx, row: &mut Row, m: &str, st: &Style, base: Option<f64>, w: f64, rtl: bool) {
    let cs: Vec<char> = m.chars().collect();
    let (adv, asc, desc) = measure(cx, &cs, st, rtl, &[cs.len()]);
    let y = base.unwrap_or((row.h - asc - desc) / 2.0 + asc);
    let x = if rtl { w - st.start + st.size * 0.4 } else { st.start - st.size * 0.4 - adv[0] };
    let mut it = text_item(&cs, x, y, st, adv[0], rtl, None);
    then(&mut it, " ");
    row.items.insert(0, it);
}
/// `then` on a text item: what follows its characters in the text as it is read, and is not drawn:
/// the space after a marker, the break that ended a line.
fn then(item: &mut V, s: &str) {
    more(item, "then", t(s));
}
/// One more field on a text item.
fn more(item: &mut V, k: &str, v: V) {
    if let V::L(l) = item {
        if l.first().and_then(|k| k.s()) != Some("text") {
            return;
        }
        if let Some(V::M(m)) = l.get_mut(1) {
            m.push((String::from(k), v));
        }
    }
}

/// What step 6 sets in lines: presented characters, each with the index of its style, its position in
/// the text, and its box if it stands for an inline child.
#[derive(Default)]
struct Seg {
    cs: Vec<char>,
    st: Vec<usize>,
    pos: Vec<usize>,
    bx: Vec<Option<(Id, f64, f64)>>,
}
struct Piece {
    a: usize,
    b: usize,
    st: usize,
    rtl: bool,
    adv: Vec<f64>, // the advance up to each offset that has been asked for
}
/// The advance of the pieces' characters from `s` to `q`.
fn width(pieces: &[Piece], s: usize, q: usize) -> f64 {
    pieces.iter().filter(|p| p.a < q && p.b > s).map(|p| p.adv[q.min(p.b) - p.a] - p.adv[s.max(p.a) - p.a]).sum()
}
/// Step 6. Returns the rows, the first row's baseline, and whether its line runs right to left.
fn lines(cx: &mut Ctx, g: &Seg, styles: &[Style], bst: &Style, code: bool, w: f64, from: Option<(&H, &Id, &[El])>) -> (Vec<Row>, f64, bool) {
    let (cs, n) = (&g.cs, g.cs.len());
    // levels, one paragraph of UAX #9 at a time
    let (mut lv, mut para) = (Vec::new(), Vec::new());
    while lv.len() < n {
        let a = lv.len();
        let e = cs[a..].iter().position(|&c| bidi::class(c) == bidi::B).map_or(n, |k| a + k + 1);
        let (l, base) = bidi::levels(&cs[a..e], bst.dir);
        para.resize(e, base);
        lv.extend(l);
    }
    // opportunities
    let ends = |c: char| if code { c == '\n' || c == '\u{2028}' } else { matches!(lb::class(c), lb::BK | lb::CR | lb::LF | lb::NL) };
    let mut brk = lb::breaks(cs);
    for p in 1..n {
        if code {
            brk[p] = if ends(cs[p - 1]) { lb::MUST } else { lb::NO };
        }
    }
    // pieces: one style and one direction; a character that ends a line is in none
    let mut pieces: Vec<Piece> = Vec::new();
    for i in (0..n).filter(|&i| !ends(cs[i])) {
        let rtl = lv[i] & 1 == 1;
        match pieces.last_mut() {
            Some(p) if p.b == i && p.st == g.st[i] && p.rtl == rtl && g.bx[i].is_none() && g.bx[i - 1].is_none() => p.b = i + 1,
            _ => pieces.push(Piece { a: i, b: i + 1, st: g.st[i], rtl, adv: Vec::new() }),
        }
    }
    // fill: each piece measured up to each opportunity in it, with and without the spaces before it
    let strip = |q: usize| (0..q).rev().find(|&k| !ends(cs[k]) && lb::class(cs[k]) != lb::SP).map_or(0, |k| k + 1);
    let mut need = vec![false; n + 1];
    for q in (1..=n).filter(|&q| brk[q] != lb::NO) {
        need[q] = true;
        need[strip(q)] = true;
    }
    let ask = |cx: &Ctx, p: &mut Piece, at: Vec<usize>| match g.bx[p.a] {
        Some(b) => p.adv = vec![0.0, b.1],
        None => {
            p.adv.resize(p.b - p.a + 1, 0.0);
            let (adv, _, _) = measure(cx, &cs[p.a..p.b], &styles[p.st], p.rtl, &at);
            for (k, &o) in at.iter().enumerate() {
                p.adv[o] = adv[k];
            }
        }
    };
    for p in pieces.iter_mut() {
        let at = (1..=p.b - p.a).filter(|&o| need[p.a + o] || p.a + o == p.b).collect();
        ask(cx, p, at);
    }
    let avail = w - bst.start - bst.end;
    cx.blocks += 1;
    let (mut rows, mut first, mut s) = (Vec::<Row>::new(), (0.0, bst.dir == 1), 0);
    while s < n {
        let (mut q, mut opp) = (None, None);
        for p in s + 1..=n {
            if brk[p] != lb::NO {
                opp = opp.or(Some(p));
                if width(&pieces, s, strip(p).max(s)) <= avail {
                    q = Some(p);
                }
                if brk[p] == lb::MUST {
                    break;
                }
            }
        }
        let opp = opp.unwrap_or(n);
        if q.is_none() && !code {
            // the first opportunity is too far: the last place before it that fits
            for p in pieces.iter_mut().filter(|p| p.a < opp && p.b > s) {
                let at = (s.max(p.a) + 1 - p.a..=opp.min(p.b) - p.a).collect();
                ask(cx, p, at);
            }
            let ok = |p: usize| p == opp || !matches!(lb::class(cs[p]), lb::CM | lb::ZWJ);
            q = (s + 1..opp).rev().find(|&p| ok(p) && width(&pieces, s, p) <= avail).or((s + 1..=opp).find(|&p| ok(p)));
        }
        let q = q.unwrap_or(opp);
        // fragments: of one piece and one level, in visual order
        let mut lvl = lv[s..q].to_vec();
        bidi::reset(&cs[s..q], &mut lvl, para[s]);
        let mut fr: Vec<(usize, usize, usize)> = Vec::new(); // from, to, piece
        for (k, p) in pieces.iter().enumerate().filter(|(_, p)| p.a < q && p.b > s) {
            for i in s.max(p.a)..q.min(p.b) {
                match fr.last_mut() {
                    Some(f) if f.2 == k && lvl[f.0 - s] == lvl[i - s] => f.1 = i + 1,
                    _ => fr.push((i, i + 1, k)),
                }
            }
        }
        let (mut h, mut asc, mut desc, mut advs) = (0.0f64, 0.0f64, 0.0f64, Vec::new());
        for &(a, b, k) in &fr {
            let st = &styles[pieces[k].st];
            if let Some((_, bw, bh)) = g.bx[a] {
                advs.push(bw);
                h = h.max(bh);
            } else {
                let (adv, x, y) = measure(cx, &cs[a..b], st, lvl[a - s] & 1 == 1, &[b - a]);
                advs.push(adv[0]);
                h = h.max(st.size * st.line);
                asc = asc.max(x);
                desc = desc.max(y);
            }
        }
        if fr.is_empty() {
            h = bst.size * bst.line;
        }
        let base = (h - asc - desc) / 2.0 + asc;
        let total: f64 = advs.iter().sum();
        let spare = (avail - total).max(0.0) * bst.align as f64 / 2.0;
        let rtl = para[s] == 1;
        let mut x = if rtl { bst.end + avail - total - spare } else { bst.start + spare };
        let levels: Vec<u8> = fr.iter().map(|f| lvl[f.0 - s]).collect();
        // Where each fragment stands is by visual order; the items are listed in the order of the
        // text, which is the order they are read in (nothing here overlaps, so painting is the same).
        let mut xs = vec![0.0; fr.len()];
        for k in bidi::order(&levels) {
            xs[k] = x;
            x += advs[k];
        }
        let mut items = Vec::new();
        for k in 0..fr.len() {
            let (a, b, st, x) = (fr[k].0, fr[k].1, &styles[pieces[fr[k].2].st], xs[k]);
            match (g.bx[a], from) {
                (Some((cid, bw, bh)), Some((uni, _, _))) => {
                    stack(&compose(cx, uni, &cid, bw), x, base - bh, &mut items);
                }
                _ => {
                    let anchor = from.map(|(uni, id, live)| src(cx, uni, id, Some((&live[g.pos[a]], &live[g.pos[b - 1]]))));
                    if st.node != V::Null {
                        items.push(V::L(vec![t("push"), st.node.clone()]));
                    }
                    items.push(text_item(&cs[a..b], x, base, st, advs[k], levels[k] & 1 == 1, anchor));
                    if st.deco > 0 {
                        let y = base + st.size * if st.deco == 1 { 0.1 } else { -0.3 };
                        let d = V::L(vec![V::L(vec![t("M"), fl(x), fl(y)]), V::L(vec![t("L"), fl(x + advs[k]), fl(y)])]);
                        items.push(V::L(vec![t("path"), map(vec![("d", d), ("stroke", st.color.clone()), ("width", fl(st.size * 0.06))])]));
                    }
                    if st.node != V::Null {
                        items.push(V::L(vec![t("pop")]));
                    }
                }
            }
        }
        // a line ended by a character that ends lines: the last item says a break follows what it reads
        if q < n && ends(cs[q - 1]) {
            if let Some(last) = items.iter_mut().rev().find(|i| i.l().first().and_then(|k| k.s()) == Some("text")) {
                then(last, "\n");
            }
        }
        if rows.is_empty() {
            first = (base, rtl);
        }
        rows.push(Row { h, gap: 0.0, items, keep: false, block: cx.blocks, line: rows.len() as u32, lines: 0, path: Vec::new() });
        s = q;
    }
    let count = rows.len() as u32;
    for row in rows.iter_mut() {
        row.lines = count;
    }
    (rows, first.0, first.1)
}

/// Rows stacked from `y`, as display-list items.
pub fn stack(rows: &[Row], x: f64, mut y: f64, out: &mut Vec<V>) -> f64 {
    let mut open: &[V] = &[]; // the nodes whose groups are open: those of the row before
    for (k, r) in rows.iter().enumerate() {
        if k > 0 {
            y += r.gap;
        }
        // the nodes this row shares with the last stay open; the others close, and its own open
        let same = open.iter().zip(&r.path).take_while(|(a, b)| a.get("id") == b.get("id")).count();
        for _ in same..open.len() {
            out.push(V::L(vec![t("pop")]));
        }
        for n in &r.path[same..] {
            out.push(V::L(vec![t("push"), n.clone()]));
        }
        open = &r.path;
        if !r.items.is_empty() {
            out.push(V::L(vec![t("push"), map(vec![("m", V::L(vec![fl(1.0), fl(0.0), fl(0.0), fl(1.0), fl(x), fl(y)]))])]));
            out.extend(r.items.iter().cloned());
            out.push(V::L(vec![t("pop")]));
        }
        y += r.h;
    }
    for _ in open {
        out.push(V::L(vec![t("pop")]));
    }
    y
}
/// Rows as a value, for whoever wants them before they are stacked: each with the top a view gives it.
pub fn rows_value(rows: &[Row]) -> V {
    let mut y = 0.0;
    V::L(rows.iter().enumerate().map(|(k, r)| {
        y += if k > 0 { r.gap } else { 0.0 };
        let v = map(vec![("top", fl(y)), ("h", fl(r.h)), ("gap", fl(r.gap)), ("keep", V::Bool(r.keep)), ("block", V::Int(r.block as i64)), ("line", V::Int(r.line as i64)), ("lines", V::Int(r.lines as i64)), ("items", V::L(r.items.clone()))]);
        y += r.h;
        v
    }).collect())
}
/// Pages (7.7): which rows go on which page, for the height available on a page.
pub fn paginate(rows: &[Row], height: f64) -> Vec<(usize, usize)> {
    let mut pages = Vec::new();
    let mut i = 0;
    while i < rows.len() {
        // 1: rows while they fit; the first is taken whatever its height
        let (mut y, mut taken) = (rows[i].h, i + 1);
        while taken < rows.len() && y + rows[taken].gap + rows[taken].h <= height {
            y += rows[taken].gap + rows[taken].h;
            taken += 1;
        }
        // 2: move back, while a row is left that could move
        let mut j = taken;
        while j > i && j < rows.len() {
            let first = j - rows[j].line as usize; // the first line of row j's block
            if rows[j - 1].keep {
                j -= 1; // (a)
            } else if rows[j - 1].block == rows[j].block && (rows[j].lines <= 3 || j - first.max(i) < 2) {
                j = first.max(i); // (b): a short block, or fewer than two lines left behind
            } else if rows[j - 1].block == rows[j].block && rows[j].line + 1 == rows[j].lines {
                j -= 1; // (b): only the last line would move
            } else {
                break;
            }
        }
        if j == i {
            j = taken; // 3
        }
        pages.push((i, j));
        i = j;
    }
    pages
}

/// The plain-text face (8.3), in lines each ended by U+000A.
pub fn plain(pk: &Pack, uni: &H, id: &Id, out: &mut String, depth: u32) {
    let Some(o) = pk.object(uni, id) else { return };
    let children = |out: &mut String| {
        for c in o.p.get("children").map(|c| c.l()).unwrap_or(&[]) {
            if let (true, Some(cid)) = (depth < 16, c.tag(REF).and_then(|x| x.id())) {
                plain(pk, uni, &cid, out, depth + 1);
            }
        }
    };
    let label = |out: &mut String| {
        out.push_str(o.p.get("label").and_then(|l| l.s()).unwrap_or(""));
        out.push('\n');
    };
    match o.ty.as_str() {
        "ufo.text" => plain_text(pk, uni, &o, None, None, out, depth),
        "ufo.group" | "ufo.clock" => children(out),
        "ufo.portal" => {
            let Some(of) = o.p.get("of").filter(|_| depth < 16) else { return label(out) };
            if let Some(cid) = of.tag(REF).and_then(|x| x.id()) {
                return plain(pk, uni, &cid, out, depth + 1);
            }
            let Some((a, cid)) = of.tag(ANCHOR).and_then(|a| Some((a, a.get("o")?.id()?))) else { return label(out) };
            let target = a.get("u").and_then(|u| u.hash()).unwrap_or(*uni);
            let mut s = String::new();
            if pk.node(&target).is_none() {
                // a linked universe: the label and the commit
                out.push_str(o.p.get("label").and_then(|l| l.s()).unwrap_or(""));
                out.push_str(" (ufo:");
                for b in target {
                    out.push_str(core::str::from_utf8(&[b"0123456789abcdef"[(b >> 4) as usize], b"0123456789abcdef"[(b & 15) as usize]]).unwrap_or(""));
                }
                out.push_str(")\n");
            } else if let (Some(region), Some(text)) = (a.get("a").and_then(|r| r.get("chars")), pk.object(&target, &cid)) {
                plain_text(pk, &target, &text, Some(region), None, &mut s, depth + 1);
            } else {
                plain(pk, &target, &cid, &mut s, depth + 1);
            }
            if target == *uni {
                out.push_str(&s);
            } else if pk.node(&target).is_some() {
                // content of another universe is marked
                out.push_str(o.p.get("label").and_then(|l| l.s()).unwrap_or(""));
                out.push_str(":\n");
                for l in s.lines() {
                    out.push_str("> ");
                    out.push_str(l);
                    out.push('\n');
                }
            }
        }
        _ => label(out),
    }
}
/// The plain-text face of a text or of a region of it; with `at`, of blocks `at.0` up to `at.1` of the whole text only.
pub fn plain_text(pk: &Pack, uni: &H, o: &Obj, region: Option<&V>, at: Option<(usize, usize)>, out: &mut String, depth: u32) {
    let (Some(chars), Some(rs)) = (o.p.get("chars").and_then(|c| c.s()), o.seq.as_ref().and_then(|s| s.get("chars")).map(runs)) else { return };
    let chars: Vec<char> = chars.chars().collect();
    let sp = spans(o, &rs);
    let inl = inline(&sp);
    let (ra, rb) = match region.map(|r| r.l()) {
        Some(r) if r.len() == 3 => (place(&rs, &r[1]).unwrap_or(0), place(&rs, &r[2]).unwrap_or(0)),
        _ => (0, chars.len()),
    };
    let bl = blocks(&sp, ra, rb.min(chars.len()));
    let mut was_item = None;
    let (first, end) = at.unwrap_or((0, bl.len()));
    for (b, mark) in bl.iter().zip(markers(&sp, &bl)).take(end).skip(first) {
        if was_item.is_some() && was_item != Some(true) || was_item.is_some() && mark.is_none() {
            out.push('\n'); // an empty line between blocks, unless both are list items
        }
        was_item = Some(mark.is_some());
        let mut start = out.len(); // where the line being written begins
        if let Some((level, m)) = mark {
            for _ in 1..level {
                out.push_str("  ");
            }
            out.push_str(&m);
            out.push(' ');
        }
        let mut ended = false; // the line was ended by a child's lines
        for p in b.a..b.b {
            let over = |role: &str| inl.iter().filter(|s| s.a <= p && p < s.b && s.role == role).last();
            if over("markup").is_some() {
            } else if let Some(cid) = over("embed").and_then(|s| child_of(s)) {
                let mut s = String::new();
                if depth < 16 {
                    plain(pk, uni, &cid, &mut s, depth + 1);
                }
                if s.ends_with('\n') {
                    s.pop();
                }
                if s.contains('\n') {
                    // more than one line: lines of its own
                    if out.len() > start {
                        out.push('\n');
                    }
                    out.push_str(&s);
                    out.push('\n');
                    start = out.len();
                    ended = true;
                } else {
                    out.push_str(&s);
                    ended = false;
                }
            } else {
                out.push(chars[p]);
                ended = false;
            }
        }
        if !ended {
            out.push('\n');
        }
    }
}

// ---- for the reader's tools: the block an item lies in ----
/// The block of a text that holds the characters an item's `src` names: its span's key, its positions, its characters.
pub fn block_at(pk: &Pack, src: &V) -> Option<V> {
    let a = src.tag(ANCHOR)?;
    let id = a.get("o")?.id()?;
    if a.get("u").is_some() {
        return None; // of another universe: not this one's to edit (1.8)
    }
    let o = pk.object(&pk.head, &id)?;
    let chars: Vec<char> = o.p.get("chars")?.s()?.chars().collect();
    let rs = runs(o.seq.as_ref()?.get("chars")?);
    if place(&rs, &t("end")) != Some(chars.len()) {
        return None; // X1
    }
    let p = place(&rs, a.get("a")?.get("chars")?.l().get(1)?)?;
    let sp = spans(&o, &rs);
    let b = blocks(&sp, 0, chars.len()).into_iter().find(|b| b.a <= p && p < b.b)?;
    Some(map(vec![("o", V::B(id.to_vec())), ("key", b.span.map_or(V::Null, |k| t(sp[k].key))), ("lo", V::Int(b.a as i64)), ("hi", V::Int(b.b as i64)), ("text", V::T(chars[b.a..b.b].iter().collect()))]))
}

// ---- the static face of a web envelope (TRAVEL 13.2) ----
/// The nodes of a display list as HTML: each node the element of its role, holding the text of its
/// items as it is read. The only markup is what the table here writes; every character of text is
/// escaped. A list is `ol` if it is ordered, else `ul`; an item is `li`, with its number as `value`,
/// and its marker is left to the element to show, unless it is the item's own, which is then
/// written and the element told (by a class) to show none. Roles with no element of their own (a
/// button, a link: nothing can be pressed where there is no script) add nothing; any other role
/// is a `div`.
pub fn html(list: &[V]) -> String {
    let (mut out, mut open) = (String::new(), Vec::new()); // of each `push`: its element, and whether it is an item whose marker is not written
    for item in list {
        let it = item.l().get(1);
        let has = |k: &str| it.and_then(|i| i.get(k));
        match item.l().first().and_then(|k| k.s()) {
            Some("push") => {
                let (mut more, mut marked) = (String::new(), false);
                let tag = match has("role").and_then(|r| r.s()) {
                    None | Some("button" | "link") => "",
                    Some("heading") => ["h1", "h2", "h3", "h4", "h5", "h6"][has("level").and_then(|l| l.i()).unwrap_or(1).clamp(1, 6) as usize - 1],
                    Some("paragraph") => "p",
                    Some("quote") => "blockquote",
                    Some("code") => "pre",
                    Some("list") => if has("ordered").is_some() { "ol" } else { "ul" },
                    Some("item") => {
                        match (has("value").and_then(|v| v.i()), has("own")) {
                            (Some(n), _) => more = cat!(" value=\"", n, "\""),
                            (_, Some(_)) => more = String::from(" class=\"ufo-own\""),
                            _ => {}
                        }
                        marked = has("own").is_none();
                        "li"
                    }
                    Some(_) => "div",
                };
                if !tag.is_empty() {
                    put!(out; "<", tag, more, ">");
                }
                open.push((tag, marked));
            }
            Some("pop") => {
                if let Some((tag, _)) = open.pop().filter(|t| !t.0.is_empty()) {
                    put!(out; "</", tag, ">\n");
                }
            }
            Some("text") if has("src").is_none() && open.iter().rev().find(|o| !o.0.is_empty()).map_or(false, |o| o.1) => {} // a marker the element shows
            Some("text") => {
                for k in ["s", "then"] {
                    for c in it.and_then(|i| i.get(k)).and_then(|s| s.s()).unwrap_or("").chars() {
                        match c {
                            '&' => out.push_str("&amp;"),
                            '<' => out.push_str("&lt;"),
                            '>' => out.push_str("&gt;"),
                            '"' => out.push_str("&quot;"),
                            c => out.push(c),
                        }
                    }
                }
            }
            _ => {}
        }
    }
    out
}
/// The static face of a universe: the nodes of its primary face. Nothing is measured, so lines end
/// only where the text ends them, and the result is the same on every host.
/// What a group under `each` is presented for (7.3): each item of the list its formula gave; or, where `each`
/// is a ref to a data object, each of its rows in the table's order, as a map from column key to value with the
/// row's own key under `key`. With no `each`, once, for nothing. Where formulas have no values, not at all.
fn each_of(cx: &Ctx, uni: &H, o: &Obj) -> Vec<Option<V>> {
    match (cx.env, o.p.get("each")) {
        (_, None) => vec![None],
        (Some(_), Some(V::L(l))) => l.iter().cloned().map(Some).collect(),
        (Some(_), Some(V::Tag(REF, id))) if crate::held(crate::FORMULAS) => data_rows(cx, uni, id),
        _ => Vec::new(),
    }
}
/// The rows of a data object, in the table's order: each a map from column key to value, with the row's own
/// key under `key`.
#[inline(never)] // an entry of the formulas component
fn data_rows(cx: &Ctx, uni: &H, id: &V) -> Vec<Option<V>> {
    let Some(d) = id.id().and_then(|i| cx.pk.object(uni, &i)) else { return Vec::new() };
    let Some(V::M(rows)) = d.p.get("rows") else { return Vec::new() };
    let keys: Vec<&str> = match d.p.get("sort") {
        Some(V::L(order)) => order.iter().filter_map(|k| k.s()).collect(),
        _ => rows.iter().map(|r| r.0.as_str()).collect(),
    };
    keys.iter().filter_map(|k| { let mut m = match rows.iter().find(|r| r.0 == *k)?.1.clone() { V::M(m) => m, _ => return None }; m.push((String::from("key"), t(k))); Some(Some(V::M(m))) }).collect()
}
/// 7.7, a grid's tracks: a column is a length, `fit` (as wide as the longest line of its cells) or a
/// fraction of what is left; a row is as tall as its tallest cell; the children, once for each item of `each`,
/// fill the cells in order, row by row. Not here yet: `rows`, `row`, `col`, `span`, `align`, and the roles of a table.
fn grid(cx: &mut Ctx, uni: &H, o: &Obj, w: f64) -> Vec<Row> {
    let gap = o.p.get("gap").and_then(|g| g.f()).unwrap_or(0.0);
    let tracks: Vec<V> = o.p.get("cols").map(|c| c.l().to_vec()).filter(|c| !c.is_empty()).unwrap_or_else(|| vec![V::L(vec![V::Int(1), t("fr")])]);
    let (n, name) = (tracks.len(), String::from(o.p.get("as").and_then(|a| a.s()).unwrap_or("")));
    let kids: Vec<Id> = o.p.get("children").map(|c| c.l()).unwrap_or(&[]).iter().filter_map(|c| c.tag(REF)?.id()).collect();
    let cells: Vec<(Option<V>, Id)> = each_of(cx, uni, o).into_iter().flat_map(|item| kids.iter().map(move |k| (item.clone(), *k))).collect();
    // one cell composed at a width, with what `each` binds bound while it is
    let cell = |cx: &mut Ctx, k: usize, cw: f64| -> Vec<Row> {
        let bound = match (cx.env, &cells[k].0) { (Some(env), Some(v)) => { env.args.borrow_mut().push((name.clone(), v.clone())); true } _ => false };
        let seat = cx.seat;
        if cx.env.is_some() {
            cx.seat = (seat.wrapping_mul(31).wrapping_add(k as u32 + 1)) & 0xf_ffff;
            (cx.blocks, cx.nodes) = (cx.seat << 8, (cx.seat as i64) << 8);
        }
        let rows = compose(cx, uni, &cells[k].1, cw);
        cx.seat = seat;
        if let (true, Some(env)) = (bound, cx.env) { env.args.borrow_mut().pop(); }
        rows
    };
    let fraction = |t: &V| t.l().first().and_then(|x| x.f());
    let free = (w - tracks.iter().filter_map(|t| t.f()).sum::<f64>() - gap * (n - 1) as f64).max(0.0);
    let mut widths: Vec<f64> = tracks.iter().map(|t| t.f().unwrap_or(0.0)).collect();
    for c in (0..n).filter(|&c| tracks[c].s() == Some("fit")) {
        for k in (c..cells.len()).step_by(n) {
            // the width of its longest line, composed in the width the fixed columns leave
            let longest = cell(cx, k, free).iter().flat_map(|r| r.items.iter()).filter(|i| i.l().first().and_then(|k| k.s()) == Some("text")).filter_map(|i| Some(i.l().get(1)?.get("x")?.f()? + i.l().get(1)?.get("adv")?.f()?)).fold(0.0, f64::max);
            widths[c] = widths[c].max(longest);
        }
    }
    let (left, parts) = ((free - (0..n).filter(|&c| tracks[c].s() == Some("fit")).map(|c| widths[c]).sum::<f64>()).max(0.0), tracks.iter().filter_map(fraction).sum::<f64>());
    for c in 0..n {
        if let Some(f) = fraction(&tracks[c]) { widths[c] = left * f / parts; }
    }
    // Appendix A, `role`: the rows of a grid that says it is a table, or a group of a table's rows, are nodes
    let table = matches!(o.p.get("role").and_then(|r| r.s()), Some("table" | "rowgroup"));
    let (mut items, mut y) = (Vec::new(), 0.0);
    for r in (0..cells.len()).step_by(n) {
        let (mut x, mut h, row) = (0.0, 0.0f64, node("row", cx.next(), Vec::new()));
        for c in 0..n.min(cells.len() - r) {
            let mut rows = cell(cx, r + c, widths[c]);
            if table {
                rows.iter_mut().for_each(|r| r.path.insert(0, row.clone()));
            }
            h = h.max(stack(&rows, x, y, &mut items) - y);
            x += widths[c] + gap;
        }
        y += h + gap;
    }
    cx.blocks += 1;
    vec![Row { h: (y - gap).max(0.0), gap: 0.0, items, keep: false, block: cx.blocks, line: 0, lines: 1, path: Vec::new() }]
}
/// The safeguard (PLAYER K7): where the universe requires what this reader does not have, a face is not
/// attempted. What is shown is one line, said by the reader, naming what is missing, and then the plain-text
/// face (8.3) of the object. None where nothing is missing.
pub fn safeguard(cx: &mut Ctx, pk: &Pack, id: &Id, w: f64) -> Option<Vec<Row>> {
    let missing = crate::project::unmet(pk);
    if missing.is_empty() {
        return None;
    }
    let mut rows = said_rows(cx, &cat!("This file needs something this reader does not have: ", missing.join(", "), ". Its text is shown below. What is not text cannot be shown here."), w, "status");
    let mut s = String::new();
    plain(pk, &pk.head, id, &mut s, 0);
    rows.extend(plain_rows(cx, s.trim_start_matches('\n'), w));
    Some(rows)
}
pub fn static_face(pk: &Pack) -> Option<String> {
    let u = pk.object(&pk.head, &[0; 16])?;
    let f = pk.object(&pk.head, &u.p.get("roots")?.get("primary")?.tag(REF)?.id()?)?;
    let mut cx = Ctx::new(pk, &|_| None, None);
    let id = f.p.get("of")?.tag(REF)?.id()?;
    let rows = match safeguard(&mut cx, pk, &id, 1e9) { Some(rows) => rows, None => compose(&mut cx, &pk.head, &id, 1e9) };
    let mut list = Vec::new();
    stack(&rows, 0.0, 0.0, &mut list);
    Some(html(&list))
}
