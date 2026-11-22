// Which way text runs: the Unicode Bidirectional Algorithm (UAX #9) for Unicode 16.0, one
// paragraph at a time. Rule numbers are those of the annex.
pub use crate::bidi_data::*;
use alloc::vec;
use alloc::vec::Vec;

static mut TABLE: Vec<u32> = Vec::new();
pub fn class(c: char) -> u8 {
    unsafe {
        if TABLE.is_empty() {
            TABLE = crate::linebreak::unpack(&RUNS);
        }
        crate::linebreak::lookup(&TABLE, c)
    }
}
/// X9: characters the rules after it do not see.
pub fn removed(t: u8) -> bool {
    matches!(t, LRE | RLE | LRO | RLO | PDF | BN)
}
fn initiator(t: u8) -> bool {
    matches!(t, LRI | RLI | FSI)
}
/// A strong direction as the neutral rules count it: numbers are R. ON if none.
fn strong(t: u8) -> u8 {
    match t {
        L => L,
        R | EN | AN => R,
        _ => ON,
    }
}
/// P2, P3: the level the first strong character asks for, isolates skipped.
fn first_strong(t: &[u8]) -> Option<u8> {
    let mut depth = 0;
    for &x in t {
        match x {
            LRI | RLI | FSI => depth += 1,
            PDI if depth > 0 => depth -= 1,
            L if depth == 0 => return Some(0),
            R | AL if depth == 0 => return Some(1),
            _ => {}
        }
    }
    None
}
const UNMATCHED: usize = usize::MAX;
fn bracket(c: char) -> u32 {
    match c as u32 {
        0x2329 => 0x3008, // canonical equivalents
        0x232A => 0x3009,
        c => c,
    }
}

/// The embedding level of each character of one paragraph, by rules P2 to I2, and the paragraph's
/// level. `dir`: 0 left to right, 1 right to left, 2 the first strong character's. A character X9
/// removes is given the level of the character before it.
pub fn levels(s: &[char], dir: u8) -> (Vec<u8>, u8) {
    let orig: Vec<u8> = s.iter().map(|&c| class(c)).collect();
    let n = s.len();
    let base = if dir < 2 { dir } else { first_strong(&orig).unwrap_or(0) };
    // BD9: each isolate initiator's PDI
    let mut pdi = vec![UNMATCHED; n];
    let mut open = Vec::new();
    for i in 0..n {
        if initiator(orig[i]) {
            open.push(i);
        } else if orig[i] == PDI {
            if let Some(j) = open.pop() {
                pdi[j] = i;
                pdi[i] = j;
            }
        }
    }
    // X1 to X8: explicit levels. A stack entry: level, override (ON for none), isolate.
    let mut t = orig.clone();
    let mut lv = vec![base; n];
    let mut stack: Vec<(u8, u8, bool)> = vec![(base, ON, false)];
    let (mut over_iso, mut over_emb, mut valid_iso) = (0u32, 0u32, 0u32);
    for i in 0..n {
        let top = stack[stack.len() - 1];
        let mut x = orig[i];
        if x == FSI {
            x = if first_strong(&orig[i + 1..pdi[i].min(n)]) == Some(1) { RLI } else { LRI };
        }
        match x {
            RLE | LRE | RLO | LRO | RLI | LRI => {
                let iso = x == RLI || x == LRI;
                if iso {
                    lv[i] = top.0;
                    if top.1 != ON {
                        t[i] = top.1;
                    }
                }
                let new = if matches!(x, RLE | RLO | RLI) { (top.0 + 1) | 1 } else { (top.0 + 2) & !1 };
                if new <= 125 && over_iso == 0 && over_emb == 0 {
                    valid_iso += iso as u32;
                    stack.push((new, if x == RLO { R } else if x == LRO { L } else { ON }, iso));
                } else if iso {
                    over_iso += 1;
                } else if over_iso == 0 {
                    over_emb += 1;
                }
            }
            PDI => {
                if over_iso > 0 {
                    over_iso -= 1;
                } else if valid_iso > 0 {
                    over_emb = 0;
                    while !stack[stack.len() - 1].2 {
                        stack.pop();
                    }
                    stack.pop();
                    valid_iso -= 1;
                }
                let top = stack[stack.len() - 1];
                lv[i] = top.0;
                if top.1 != ON {
                    t[i] = top.1;
                }
            }
            PDF => {
                if over_iso > 0 {
                } else if over_emb > 0 {
                    over_emb -= 1;
                } else if !top.2 && stack.len() >= 2 {
                    stack.pop();
                }
            }
            B | BN => {}
            _ => {
                lv[i] = top.0;
                if top.1 != ON {
                    t[i] = top.1;
                }
            }
        }
    }
    // X9, X10: level runs of what remains, joined into isolating run sequences
    let keep: Vec<usize> = (0..n).filter(|&i| !removed(orig[i])).collect();
    let mut runs: Vec<(usize, usize)> = Vec::new(); // ranges of `keep`
    for k in 0..keep.len() {
        match runs.last_mut() {
            Some(r) if lv[keep[k]] == lv[keep[k - 1]] => r.1 = k + 1,
            _ => runs.push((k, k + 1)),
        }
    }
    let explicit = lv.clone(); // sos and eos are found from the levels as X1 to X8 left them
    let level_at = |k: Option<usize>| k.and_then(|k| keep.get(k)).map_or(base, |&i| explicit[i]);
    for r in 0..runs.len() {
        let first = keep[runs[r].0];
        if orig[first] == PDI && pdi[first] != UNMATCHED {
            continue; // continues the sequence of its initiator
        }
        let mut seq: Vec<usize> = Vec::new();
        let mut cur = runs[r];
        loop {
            seq.extend_from_slice(&keep[cur.0..cur.1]);
            let last = seq[seq.len() - 1];
            match runs.binary_search_by(|x| keep[x.0].cmp(&pdi[last])) {
                Ok(next) if initiator(orig[last]) => cur = runs[next],
                _ => break,
            }
        }
        let level = explicit[seq[0]];
        let after = if initiator(orig[seq[seq.len() - 1]]) { base } else { level_at(Some(cur.1)) };
        let side = |l: u8| if l.max(level) & 1 == 1 { R } else { L };
        resolve(s, &orig, &mut t, &mut lv, &seq, side(level_at(runs[r].0.checked_sub(1))), side(after));
    }
    for i in 0..n {
        if removed(orig[i]) {
            lv[i] = if i > 0 { lv[i - 1] } else { base };
        }
    }
    (lv, base)
}
/// W1 to I2 for one isolating run sequence.
fn resolve(s: &[char], orig: &[u8], t: &mut [u8], lv: &mut [u8], seq: &[usize], sos: u8, eos: u8) {
    let n = seq.len();
    let e = if lv[seq[0]] & 1 == 1 { R } else { L };
    // W1, W2, W3
    let (mut prev, mut last) = (sos, sos);
    for &i in seq {
        if t[i] == NSM {
            t[i] = if initiator(prev) || prev == PDI { ON } else { prev };
        }
        prev = t[i];
        match t[i] {
            L | R => last = t[i],
            AL => {
                last = AL;
                t[i] = R;
            }
            EN if last == AL => t[i] = AN,
            _ => {}
        }
    }
    // W4
    for k in 1..n.saturating_sub(1) {
        let (a, b) = (t[seq[k - 1]], t[seq[k + 1]]);
        if a == b && ((t[seq[k]] == ES && a == EN) || (t[seq[k]] == CS && (a == EN || a == AN))) {
            t[seq[k]] = a;
        }
    }
    // W5
    for k in 1..n {
        if t[seq[k]] == ET && t[seq[k - 1]] == EN {
            t[seq[k]] = EN;
        }
    }
    for k in (0..n.saturating_sub(1)).rev() {
        if t[seq[k]] == ET && t[seq[k + 1]] == EN {
            t[seq[k]] = EN;
        }
    }
    // W6, W7
    let mut last = sos;
    for &i in seq {
        match t[i] {
            ES | ET | CS => t[i] = ON,
            L | R => last = t[i],
            EN if last == L => t[i] = L,
            _ => {}
        }
    }
    // N0: bracket pairs (BD16), in the order of their opening brackets
    let mut stack: Vec<(u32, usize)> = Vec::new();
    let mut pairs: Vec<(usize, usize)> = Vec::new();
    for k in 0..n {
        let c = bracket(s[seq[k]]);
        if t[seq[k]] != ON {
        } else if let Some(b) = BRACKETS.iter().find(|b| b.0 as u32 == c) {
            if stack.len() == 63 {
                break;
            }
            stack.push((b.1 as u32, k));
        } else if let Some(j) = stack.iter().rposition(|x| x.0 == c) {
            pairs.insert(pairs.partition_point(|p| p.0 < stack[j].1), (stack[j].1, k));
            stack.truncate(j);
        }
    }
    for &(a, b) in &pairs {
        let mut d = ON;
        for k in a + 1..b {
            let x = strong(t[seq[k]]);
            if x != ON {
                d = x;
                if x == e {
                    break;
                }
            }
        }
        if d == ON {
            continue;
        }
        if d != e {
            let before = (0..a).rev().map(|k| strong(t[seq[k]])).find(|&x| x != ON).unwrap_or(sos);
            if before != d {
                d = e;
            }
        }
        for k in [a, b] {
            t[seq[k]] = d;
            let mut m = k + 1;
            while m < n && orig[seq[m]] == NSM {
                t[seq[m]] = d;
                m += 1;
            }
        }
    }
    // N1, N2
    let neutral = |x: u8| matches!(x, B | S | WS | ON | FSI | LRI | RLI | PDI);
    let mut k = 0;
    while k < n {
        let a = k;
        while k < n && neutral(t[seq[k]]) {
            k += 1;
        }
        if k > a {
            let before = if a == 0 { sos } else { strong(t[seq[a - 1]]) };
            let after = if k == n { eos } else { strong(t[seq[k]]) };
            for m in a..k {
                t[seq[m]] = if before == after { before } else { e };
            }
        }
        k += 1;
    }
    // I1, I2
    for &i in seq {
        lv[i] += match (lv[i] & 1, t[i]) {
            (0, R) | (1, L) | (1, EN) | (1, AN) => 1,
            (0, EN) | (0, AN) => 2,
            _ => 0,
        };
    }
}
/// L1, for the characters of one line: separators, and white space before them or at the end
/// of the line, take the paragraph's level.
pub fn reset(s: &[char], lv: &mut [u8], base: u8) {
    let mut tail = true;
    for i in (0..s.len()).rev() {
        let t = class(s[i]);
        if t == B || t == S {
            lv[i] = base;
            tail = true;
        } else if matches!(t, WS | FSI | LRI | RLI | PDI) || removed(t) {
            if tail {
                lv[i] = base;
            }
        } else {
            tail = false;
        }
    }
}
/// L2: the visual order, left to right, of things with these levels.
pub fn order(lv: &[u8]) -> Vec<usize> {
    let mut o: Vec<usize> = (0..lv.len()).collect();
    for l in (1..=lv.iter().copied().max().unwrap_or(0)).rev() {
        let mut k = 0;
        while k < o.len() {
            let a = k;
            while k < o.len() && lv[o[k]] >= l {
                k += 1;
            }
            o[a..k].reverse();
            k += 1;
        }
    }
    o
}
