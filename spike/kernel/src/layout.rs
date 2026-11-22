// From description to display list (SPEC-PRESENTATION 7.7): blocks, pieces, lines, rows, pages.
// The plain-text face (8.3). Line breaking and bidirectional ordering are the kernel's own.
use crate::pack::*;
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
}
pub struct Ctx<'a> {
    pub pk: &'a Pack,
    pub root: H,
    pub chain: Vec<(H, Id)>,
    pub blocks: u32,
    pub measure: &'a dyn Fn(&V) -> Option<V>,
    pub tools: bool, // what is composed is the reader's tools: its items say what pressing them names
}
fn fl(x: f64) -> V {
    V::F(x)
}
fn black() -> V {
    V::L(vec![fl(0.0), fl(0.0), fl(0.0), fl(1.0)])
}
fn plain_style() -> Style {
    Style { size: 16.0, weight: 400, slant: false, color: black(), font: V::L(vec![t("serif")]), line: 1.4, align: 0, dir: 0, deco: 0, start: 0.0, end: 0.0, press: V::Null }
}
/// A row of the reader's own words, where an object cannot be presented.
fn label_row(cx: &mut Ctx, s: &str, w: f64) -> Vec<Row> {
    let st = Style { size: 13.0, slant: true, color: V::L(vec![fl(0.4), fl(0.4), fl(0.4), fl(1.0)]), font: V::L(vec![t("sans-serif")]), ..plain_style() };
    let cs: Vec<char> = s.chars().collect();
    let n = cs.len();
    lines(cx, &Seg { cs, st: vec![0; n], pos: vec![0; n], bx: vec![None; n] }, &[st.clone()], &st, false, w, None).0
}

pub fn compose(cx: &mut Ctx, uni: &H, id: &Id, w: f64) -> Vec<Row> {
    // O7: an object already being presented is shown as a link, not expanded
    if cx.chain.len() >= 16 || cx.chain.contains(&(*uni, *id)) {
        return label_row(cx, "(shown above)", w);
    }
    let Some(o) = cx.pk.object(uni, id) else {
        return label_row(cx, "(not available)", w);
    };
    cx.chain.push((*uni, *id));
    let rows = match o.ty.as_str() {
        "ufo.text" => text_rows(cx, uni, &o, None, w).unwrap_or_else(|| label_row(cx, "(inconsistent text: not presented)", w)), // step 1
        "ufo.group" | "ufo.pane" => {
            let gap = o.p.get("gap").and_then(|g| g.f()).unwrap_or(0.0);
            let mut rows = Vec::new();
            for c in o.p.get("children").map(|c| c.l()).unwrap_or(&[]) {
                if let Some(cid) = c.tag(REF).and_then(|x| x.id()) {
                    let mut r = compose(cx, uni, &cid, w);
                    if let (false, Some(first)) = (rows.is_empty(), r.first_mut()) {
                        first.gap = first.gap.max(gap);
                    }
                    rows.append(&mut r);
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
            vec![Row { h: o.p.get("h").and_then(|h| h.f()).unwrap_or(0.0), gap: 0.0, items: vec![V::L(vec![t("path"), map(m)])], keep: false, block: cx.blocks, line: 0, lines: 1 }]
        }
        "ufo.portal" => portal(cx, uni, &o, w),
        _ => {
            let l = String::from(o.p.get("label").and_then(|l| l.s()).unwrap_or("(object)"));
            label_row(cx, &l, w)
        }
    };
    cx.chain.pop();
    rows
}
fn portal(cx: &mut Ctx, uni: &H, o: &Obj, w: f64) -> Vec<Row> {
    let label = String::from(o.p.get("label").and_then(|l| l.s()).unwrap_or("(portal)"));
    let w = o.p.get("w").and_then(|x| x.f()).map(|x| x.min(w)).unwrap_or(w);
    let Some(of) = o.p.get("of") else { return label_row(cx, &label, w) };
    if let Some(id) = of.tag(REF).and_then(|x| x.id()) {
        return compose(cx, uni, &id, w);
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

struct Span<'a> {
    a: usize,
    b: usize,
    block: bool,
    role: &'a str,
    key: &'a str,
    v: &'a V,
}
/// Step 2: the spans that resolve, in key order.
fn spans<'a>(o: &'a Obj, els: &[El]) -> Vec<Span<'a>> {
    let mut out = Vec::new();
    if let Some(V::M(m)) = o.p.get("spans") {
        for (key, v) in m {
            let Some(reg) = v.get("at").and_then(|a| a.tag(ANCHOR)).and_then(|a| a.get("a")).and_then(|a| a.get("chars")) else { continue };
            let r = reg.l();
            if r.len() != 3 {
                continue;
            }
            let (Some(a), Some(b)) = (boundary(els, &r[1]), boundary(els, &r[2])) else { continue }; // detached: takes no part
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
/// In a tools universe, a span with an `on` handler gives its key to the characters under it.
fn pressed(cx: &Ctx, st: &mut Style, s: &Span) {
    if cx.tools && s.v.get("on").is_some() {
        st.press = t(s.key);
    }
}
const HEADING: [f64; 6] = [2.0, 1.5, 1.25, 1.1, 1.0, 1.0];
fn level(s: &Span) -> usize {
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
struct Blk {
    span: Option<usize>,
    a: usize,
    b: usize,
}
/// Step 3: the blocks of the characters `ra` to `rb`, in order.
fn blocks(sp: &[Span], ra: usize, rb: usize) -> Vec<Blk> {
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
    let els = elements(o.seq.as_ref()?.get("chars")?)?;
    let live: Vec<&El> = els.iter().filter(|e| e.live).collect();
    if live.len() != chars.len() {
        return None; // X1
    }
    let sp = spans(o, &els);
    let inl = inline(&sp);
    let (ra, rb) = match region {
        Some(r) if r.l().len() == 3 => (boundary(&els, &r.l()[1])?, boundary(&els, &r.l()[2])?),
        _ => (0, chars.len()),
    };
    let mut text = plain_style();
    restyle(&mut text, &o.p);
    let line1 = text.size * text.line;
    let bl = blocks(&sp, ra, rb);
    let marks = markers(&sp, &bl);
    let mut rows: Vec<Row> = Vec::new();
    let mut asked = 0.0f64; // space the block before asked after itself
    for (blk, mark) in bl.iter().zip(&marks) {
        // step 4: the block's style; steps 8: its spacing
        let mut st = text.clone();
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
                pressed(cx, &mut st, &sp[j]);
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
            for s in inl.iter().filter(|s| s.a <= p && p < s.b) {
                left_out |= s.role == "markup";
                if s.role == "embed" {
                    child = child_of(s);
                }
                role_style(&mut cs, s, &text);
                pressed(cx, &mut cs, s);
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
            out.push(Row { h: st.size * st.line, gap: 0.0, items: Vec::new(), keep: false, block: cx.blocks, line: 0, lines: 1 });
        }
        if let Some((_, m)) = mark.take() {
            marker_item(cx, &mut out[0], m, &st, None, w, st.dir == 1);
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
    row.items.insert(0, text_item(&cs, x, y, st, adv[0], rtl, None));
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
fn lines(cx: &mut Ctx, g: &Seg, styles: &[Style], bst: &Style, code: bool, w: f64, from: Option<(&H, &Id, &[&El])>) -> (Vec<Row>, f64, bool) {
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
        let mut items = Vec::new();
        for k in bidi::order(&levels) {
            let (a, b, st) = (fr[k].0, fr[k].1, &styles[pieces[fr[k].2].st]);
            match (g.bx[a], from) {
                (Some((cid, bw, bh)), Some((uni, _, _))) => {
                    stack(&compose(cx, uni, &cid, bw), x, base - bh, &mut items);
                }
                _ => {
                    let anchor = from.map(|(uni, id, live)| src(cx, uni, id, Some((live[g.pos[a]], live[g.pos[b - 1]]))));
                    items.push(text_item(&cs[a..b], x, base, st, advs[k], levels[k] & 1 == 1, anchor));
                    if st.deco > 0 {
                        let y = base + st.size * if st.deco == 1 { 0.1 } else { -0.3 };
                        let d = V::L(vec![V::L(vec![t("M"), fl(x), fl(y)]), V::L(vec![t("L"), fl(x + advs[k]), fl(y)])]);
                        items.push(V::L(vec![t("path"), map(vec![("d", d), ("stroke", st.color.clone()), ("width", fl(st.size * 0.06))])]));
                    }
                }
            }
            x += advs[k];
        }
        if rows.is_empty() {
            first = (base, rtl);
        }
        rows.push(Row { h, gap: 0.0, items, keep: false, block: cx.blocks, line: rows.len() as u32, lines: 0 });
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
    for (k, r) in rows.iter().enumerate() {
        if k > 0 {
            y += r.gap;
        }
        if !r.items.is_empty() {
            out.push(V::L(vec![t("push"), map(vec![("m", V::L(vec![fl(1.0), fl(0.0), fl(0.0), fl(1.0), fl(x), fl(y)]))])]));
            out.extend(r.items.iter().cloned());
            out.push(V::L(vec![t("pop")]));
        }
        y += r.h;
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
        "ufo.text" => plain_text(pk, uni, &o, None, out, depth),
        "ufo.group" | "ufo.pane" | "ufo.pane" | "ufo.clock" => children(out),
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
                plain_text(pk, &target, &text, Some(region), &mut s, depth + 1);
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
fn plain_text(pk: &Pack, uni: &H, o: &Obj, region: Option<&V>, out: &mut String, depth: u32) {
    let (Some(chars), Some(els)) = (o.p.get("chars").and_then(|c| c.s()), o.seq.as_ref().and_then(|s| s.get("chars")).and_then(elements)) else { return };
    let chars: Vec<char> = chars.chars().collect();
    let sp = spans(o, &els);
    let inl = inline(&sp);
    let (ra, rb) = match region.map(|r| r.l()) {
        Some(r) if r.len() == 3 => (boundary(&els, &r[1]).unwrap_or(0), boundary(&els, &r[2]).unwrap_or(0)),
        _ => (0, chars.len()),
    };
    let bl = blocks(&sp, ra, rb.min(chars.len()));
    let mut was_item = None;
    for (b, mark) in bl.iter().zip(markers(&sp, &bl)) {
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

// ---- for the reader's tools: what a press names, and the block an item lies in ----
/// The handler a span of the tools universe holds for a press: the texts its primary face presents are searched.
pub fn handler(pk: &Pack, id: &Id, key: &str, depth: u32) -> Option<V> {
    let o = pk.object(&pk.head, id)?;
    if let Some(h) = o.p.get("spans").and_then(|s| s.get(key)).and_then(|s| s.get("on")).and_then(|on| on.get("press")) {
        return Some(h.clone());
    }
    let mut inside: Vec<&V> = o.p.get("children").map(|c| c.l().iter().collect()).unwrap_or_default();
    if let Some(V::M(m)) = o.p.get("spans") {
        inside.extend(m.iter().filter_map(|(_, s)| s.get("child")));
    }
    inside.iter().filter(|_| depth < 16).filter_map(|c| c.tag(REF)?.id()).find_map(|c| handler(pk, &c, key, depth + 1))
}
/// The block of a text that holds the characters an item's `src` names: its span's key, its positions, its characters.
pub fn block_at(pk: &Pack, src: &V) -> Option<V> {
    let a = src.tag(ANCHOR)?;
    let id = a.get("o")?.id()?;
    if a.get("u").is_some() {
        return None; // of another universe: not this one's to edit (1.8)
    }
    let o = pk.object(&pk.head, &id)?;
    let chars: Vec<char> = o.p.get("chars")?.s()?.chars().collect();
    let els = elements(o.seq.as_ref()?.get("chars")?)?;
    if els.iter().filter(|e| e.live).count() != chars.len() {
        return None; // X1
    }
    let p = boundary(&els, a.get("a")?.get("chars")?.l().get(1)?)?;
    let sp = spans(&o, &els);
    let b = blocks(&sp, 0, chars.len()).into_iter().find(|b| b.a <= p && p < b.b)?;
    Some(map(vec![("o", V::B(id.to_vec())), ("key", b.span.map_or(V::Null, |k| t(sp[k].key))), ("lo", V::Int(b.a as i64)), ("hi", V::Int(b.b as i64)), ("text", V::T(chars[b.a..b.b].iter().collect()))]))
}
