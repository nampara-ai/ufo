// From description to display list: blocks, lines, rows, pages. The plain-text face.
use crate::pack::*;
use crate::value::*;
use alloc::boxed::Box;
use alloc::string::String;
use alloc::vec;
use alloc::vec::Vec;

/// One unbreakable strip of a vertical flow: a line of text, a rule, a picture.
pub struct Row {
    pub h: f64,
    pub gap: f64, // space wanted above it; dropped at the top of a page
    pub items: Vec<V>,
    pub keep: bool, // must not be the last row on a page
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
}
struct Run {
    s: String,
    st: Style,
    pos: usize, // live position of its first character in the text
}
pub struct Ctx<'a> {
    pub pk: &'a Pack,
    pub root: H,
    pub chain: Vec<(H, Id)>,
    pub blocks: u32,
    pub brk: &'a dyn Fn(&V) -> Option<V>,
}
fn fl(x: f64) -> V {
    V::F(x)
}
fn black() -> V {
    V::L(vec![fl(0.0), fl(0.0), fl(0.0), fl(1.0)])
}
fn label_row(cx: &mut Ctx, s: &str, w: f64) -> Vec<Row> {
    let st = Style { size: 13.0, weight: 400, slant: true, color: V::L(vec![fl(0.4), fl(0.4), fl(0.4), fl(1.0)]), font: V::L(vec![t("sans-serif")]), line: 1.4 };
    let runs = vec![Run { s: String::from(s), st, pos: 0 }];
    lines(cx, &runs, w, 0.0, None)
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
        "ufo.text" => text_rows(cx, uni, &o, None, w).unwrap_or_else(|| label_row(cx, "(inconsistent text: not presented)", w)),
        "ufo.group" | "ufo.region" => {
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
    v: &'a V,
}
fn spans<'a>(o: &'a Obj, els: &[El]) -> Vec<Span<'a>> {
    let mut out = Vec::new();
    if let Some(V::M(m)) = o.p.get("spans") {
        // the map is in key order, which is the order the rules of 8.1 use for ties
        for (_, v) in m {
            let Some(reg) = v.get("at").and_then(|a| a.tag(ANCHOR)).and_then(|a| a.get("a")).and_then(|a| a.get("chars")) else { continue };
            let r = reg.l();
            if r.len() != 3 {
                continue;
            }
            let (Some(a), Some(b)) = (boundary(els, &r[1]), boundary(els, &r[2])) else { continue }; // detached: not presented
            let block = v.get("kind").and_then(|k| k.s()) == Some("block");
            if a < b || block {
                out.push(Span { a, b, block, role: v.get("role").and_then(|r| r.s()).unwrap_or(""), v });
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
}
const HEADING: [f64; 6] = [2.0, 1.5, 1.25, 1.1, 1.0, 1.0];

/// A text, or a region of one, as rows (the algorithm of SPEC 5.7).
fn text_rows(cx: &mut Ctx, uni: &H, o: &Obj, region: Option<&V>, w: f64) -> Option<Vec<Row>> {
    let chars: Vec<char> = o.p.get("chars")?.s()?.chars().collect();
    let els = elements(o.seq.as_ref()?.get("chars")?)?;
    let live: Vec<&El> = els.iter().filter(|e| e.live).collect();
    if live.len() != chars.len() {
        return None; // X1
    }
    let sp = spans(o, &els);
    let (ra, rb) = match region {
        Some(r) if r.l().len() == 3 => (boundary(&els, &r.l()[1])?, boundary(&els, &r.l()[2])?),
        _ => (0, chars.len()),
    };
    let mut base = Style { size: 16.0, weight: 400, slant: false, color: black(), font: V::L(vec![t("serif")]), line: 1.4 };
    restyle(&mut base, &o.p);
    let line1 = base.size * base.line;
    // step 1: the innermost block span over each character
    let inner = |i: usize| -> Option<usize> {
        let mut best: Option<usize> = None;
        for (k, s) in sp.iter().enumerate() {
            if s.block && s.a <= i && i < s.b && best.map_or(true, |b| s.a > sp[b].a || (s.a == sp[b].a && s.b < sp[b].b)) {
                best = Some(k);
            }
        }
        best
    };
    let mut rows: Vec<Row> = Vec::new();
    let mut after = 0.0f64; // space the previous block wants below it
    let mut count = 0i64; // numbering of consecutive items
    let mut i = ra;
    while i < rb {
        let b = inner(i);
        let mut e = i + 1;
        while e < rb && inner(e) == b {
            e += 1;
        }
        // step 2: the block's style and spacing
        let mut st = base.clone();
        let (mut before, mut indent, mut keep, mut marker) = (0.0, 0.0, false, None);
        let below;
        if let Some(k) = b {
            let s = &sp[k];
            let level = s.v.get("level").and_then(|l| l.i()).unwrap_or(1).clamp(1, 6);
            match s.role {
                "heading" => {
                    st.size = base.size * HEADING[level as usize - 1];
                    st.weight = 700;
                    before = line1;
                    below = line1 * 0.5;
                    keep = true;
                }
                "item" => {
                    indent = level as f64 * 1.5 * base.size;
                    count += 1;
                    marker = Some(match s.v.get("marker").and_then(|m| m.s()) {
                        Some("number") => {
                            let mut d = String::new();
                            let mut n = count;
                            while n > 0 {
                                d.insert(0, (b'0' + (n % 10) as u8) as char);
                                n /= 10;
                            }
                            d.push('.');
                            d
                        }
                        Some("bullet") | None => String::from("\u{2022}"),
                        Some(other) => String::from(other),
                    });
                    below = line1 * 0.25;
                }
                "quote" => {
                    indent = base.size;
                    below = line1;
                }
                "code" => {
                    st.font = V::L(vec![t("monospace")]);
                    below = line1;
                }
                _ => below = line1,
            }
            if s.role != "item" {
                count = 0;
            }
            restyle(&mut st, s.v);
        } else {
            below = line1;
            count = 0;
        }
        // step 3: runs of one style, broken at block-level embeds
        let mut runs: Vec<Run> = Vec::new();
        let mut first = true;
        let flush = |cx: &mut Ctx, runs: &mut Vec<Run>, rows: &mut Vec<Row>, first: &mut bool, marker: &mut Option<String>| {
            if runs.is_empty() {
                return;
            }
            let mk = marker.take().map(|m| (m, st.clone()));
            let mut r = lines(cx, runs, w, indent, Some((uni, &o.id, &live)));
            if let (Some((m, mst)), Some(row)) = (mk, r.first_mut()) {
                marker_item(cx, row, &m, &mst, indent);
            }
            for row in r.iter_mut() {
                row.keep = keep;
            }
            if let Some(row) = r.first_mut() {
                row.gap = if *first { after.max(before) } else { 0.0 };
            }
            *first = false;
            rows.append(&mut r);
            runs.clear();
        };
        for p in i..e {
            let mut cs = st.clone();
            let mut skip = false;
            let mut child: Option<Id> = None;
            for s in sp.iter().filter(|s| !s.block && s.a <= p && p < s.b) {
                match s.role {
                    "emphasis" => cs.slant = true,
                    "strong" => cs.weight = 700,
                    "marker" => skip = true,
                    "embed" => child = s.v.get("child").and_then(|c| c.tag(REF)).and_then(|c| c.id()),
                    _ => {}
                }
                restyle(&mut cs, s.v);
            }
            if skip {
                continue;
            }
            if let Some(cid) = child {
                flush(cx, &mut runs, &mut rows, &mut first, &mut marker);
                let mut r = compose(cx, uni, &cid, w - indent);
                if let Some(row) = r.first_mut() {
                    row.gap = row.gap.max(if first { after.max(before) } else { line1 * 0.5 });
                }
                first = false;
                rows.append(&mut r);
                continue;
            }
            match runs.last_mut() {
                Some(r) if r.st == cs => r.s.push(chars[p]),
                _ => runs.push(Run { s: String::from(chars[p]), st: cs, pos: p }),
            }
        }
        flush(cx, &mut runs, &mut rows, &mut first, &mut marker);
        after = below;
        i = e;
    }
    Some(rows)
}
fn run_value(r: &Run) -> V {
    map(vec![("s", V::T(r.s.clone())), ("font", r.st.font.clone()), ("size", fl(r.st.size)), ("weight", V::Int(r.st.weight)), ("slant", V::Bool(r.st.slant))])
}
fn text_item(s: &str, x: f64, y: f64, st: &Style, adv: f64, src: Option<V>) -> V {
    let mut m = vec![("s", t(s)), ("x", fl(x)), ("y", fl(y)), ("font", st.font.clone()), ("size", fl(st.size)), ("weight", V::Int(st.weight)), ("color", st.color.clone()), ("dir", t("ltr")), ("adv", fl(adv))];
    if st.slant {
        m.push(("slant", V::Bool(true)));
    }
    if let Some(a) = src {
        m.push(("src", a));
    }
    V::L(vec![t("text"), map(m)])
}
fn marker_item(cx: &mut Ctx, row: &mut Row, m: &str, st: &Style, indent: f64) {
    let run = Run { s: String::from(m), st: st.clone(), pos: 0 };
    let req = map(vec![("runs", V::L(vec![run_value(&run)])), ("from", V::L(vec![V::Int(0), V::Int(0)])), ("width", fl(1e9))]);
    let Some(rep) = (cx.brk)(&req) else { return };
    let adv = rep.get("frags").and_then(|f| f.l().first()).and_then(|f| f.get("adv")).and_then(|a| a.f()).unwrap_or(0.0);
    // the marker shares the first line's baseline
    let y = row.items.first().and_then(|it| it.l().get(1)).and_then(|m| m.get("y")).and_then(|y| y.f()).unwrap_or(row.h);
    row.items.insert(0, text_item(m, indent - adv - st.size * 0.4, y, st, adv, None));
}
/// Step 4: lines. The host says how much of the runs fits in a width; the kernel places it.
fn lines(cx: &mut Ctx, runs: &[Run], w: f64, indent: f64, from: Option<(&H, &Id, &Vec<&El>)>) -> Vec<Row> {
    let rv = V::L(runs.iter().map(run_value).collect());
    let mut rows = Vec::new();
    let (mut r, mut off) = (0usize, 0usize);
    cx.blocks += 1;
    let block = cx.blocks;
    while r < runs.len() {
        let req = map(vec![("runs", rv.clone()), ("from", V::L(vec![V::Int(r as i64), V::Int(off as i64)])), ("width", fl((w - indent).max(1.0)))]);
        let Some(rep) = (cx.brk)(&req) else { break };
        let (asc, desc) = (rep.get("asc").and_then(|a| a.f()).unwrap_or(0.0), rep.get("desc").and_then(|a| a.f()).unwrap_or(0.0));
        let mut h = 0.0f64;
        let mut items = Vec::new();
        let frags = rep.get("frags").map(|f| f.l()).unwrap_or(&[]);
        for f in frags {
            if let Some(k) = f.get("run").and_then(|k| k.i()) {
                if let Some(run) = runs.get(k as usize) {
                    h = h.max(run.st.size * run.st.line);
                }
            }
        }
        let base = (h - (asc + desc)) / 2.0 + asc;
        let mut x = indent;
        for f in frags {
            let (Some(k), Some(a), Some(b), Some(adv)) = (f.get("run").and_then(|k| k.i()), f.get("from").and_then(|k| k.i()), f.get("to").and_then(|k| k.i()), f.get("adv").and_then(|k| k.f())) else { continue };
            let Some(run) = runs.get(k as usize) else { continue };
            let s: String = run.s.chars().skip(a as usize).take((b - a) as usize).collect();
            let anchor = match from {
                Some((uni, id, live)) if b > a => match (live.get(run.pos + a as usize), live.get(run.pos + b as usize - 1)) {
                    (Some(e0), Some(e1)) => Some(src(cx, uni, id, Some((e0, e1)))),
                    _ => None,
                },
                _ => None,
            };
            items.push(text_item(&s, x, base, &run.st, adv, anchor));
            x += adv;
        }
        rows.push(Row { h, gap: 0.0, items, keep: false, block, line: rows.len() as u32, lines: 0 });
        let to = rep.get("to").map(|t| t.l()).unwrap_or(&[]);
        let (nr, no) = (to.first().and_then(|x| x.i()).unwrap_or(runs.len() as i64) as usize, to.get(1).and_then(|x| x.i()).unwrap_or(0) as usize);
        if (nr, no) <= (r, off) {
            break; // a host that makes no progress cannot make the kernel loop
        }
        r = nr;
        off = no;
    }
    let n = rows.len() as u32;
    for row in rows.iter_mut() {
        row.lines = n;
    }
    rows
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
/// Pagination (SPEC 5.7): which rows go on which page, for a content height.
pub fn paginate(rows: &[Row], height: f64) -> Vec<(usize, usize)> {
    let mut pages = Vec::new();
    let mut i = 0;
    while i < rows.len() {
        let (mut y, mut j) = (0.0, i);
        while j < rows.len() {
            let add = if j == i { 0.0 } else { rows[j].gap } + rows[j].h;
            if j > i && y + add > height {
                break;
            }
            y += add;
            j += 1;
        }
        if j < rows.len() {
            let mut k = j;
            loop {
                let was = k;
                while k > i && rows[k - 1].keep {
                    k -= 1; // a heading is not left at the foot of a page
                }
                if k > i && rows[k].block == rows[k - 1].block {
                    let (line, total) = (rows[k].line as usize, rows[k].lines as usize);
                    if total <= 3 || line < 2 {
                        k -= line.min(k - i); // too short to split, or would leave one line behind
                    } else if total - line < 2 {
                        k -= 1; // would carry one line over
                    }
                }
                if k == was {
                    break;
                }
            }
            if k > i {
                j = k;
            }
        }
        pages.push((i, j));
        i = j;
    }
    pages
}

/// The plain-text face (7.3).
pub fn plain(pk: &Pack, uni: &H, id: &Id, out: &mut String, depth: u32) {
    let Some(o) = pk.object(uni, id) else { return };
    let label = |out: &mut String| {
        if let Some(l) = o.p.get("label").and_then(|l| l.s()) {
            out.push_str(l);
        }
    };
    match o.ty.as_str() {
        "ufo.text" => {
            let (Some(chars), Some(els)) = (o.p.get("chars").and_then(|c| c.s()), o.seq.as_ref().and_then(|s| s.get("chars")).and_then(elements)) else { return };
            let sp = spans(&o, &els);
            let mut starts: Vec<usize> = sp.iter().filter(|s| s.block).flat_map(|s| [s.a, s.b]).collect();
            starts.sort();
            for (p, c) in chars.chars().enumerate() {
                if p > 0 && starts.binary_search(&p).is_ok() {
                    out.push('\n');
                }
                let mut shown = true;
                for s in sp.iter().filter(|s| !s.block && s.a <= p && p < s.b) {
                    if s.role == "marker" {
                        shown = false;
                    }
                    if s.role == "embed" {
                        shown = false;
                        if let (true, Some(cid)) = (depth < 16, s.v.get("child").and_then(|c| c.tag(REF)).and_then(|c| c.id())) {
                            plain(pk, uni, &cid, out, depth + 1);
                        }
                    }
                }
                if shown {
                    out.push(c);
                }
            }
        }
        "ufo.group" | "ufo.region" | "ufo.clock" => {
            for (k, c) in o.p.get("children").map(|c| c.l()).unwrap_or(&[]).iter().enumerate() {
                if let (true, Some(cid)) = (depth < 16, c.tag(REF).and_then(|x| x.id())) {
                    if k > 0 && !out.is_empty() && !out.ends_with('\n') {
                        out.push('\n');
                    }
                    plain(pk, uni, &cid, out, depth + 1);
                }
            }
        }
        _ => label(out), // a Portal is replaced by its label
    }
}
