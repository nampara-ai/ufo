// Where lines may end: the Unicode Line Breaking Algorithm (UAX #14) for Unicode 16.0,
// its default rules, without tailoring. Rule numbers are those of the annex.
pub use crate::linebreak_data::*;
use alloc::vec;
use alloc::vec::Vec;

/// A table of a property, unpacked: for each run of scalar values, its first shifted left 8, and its value.
pub fn unpack(runs: &[u8]) -> Vec<u32> {
    let (mut out, mut c, mut i) = (Vec::new(), 0u32, 0);
    while i < runs.len() {
        let mut shift = 0;
        while runs[i] & 128 != 0 {
            c += ((runs[i] & 127) as u32) << shift;
            shift += 7;
            i += 1;
        }
        c += (runs[i] as u32) << shift;
        out.push(c << 8 | runs[i + 1] as u32);
        i += 2;
    }
    out
}
pub fn lookup(table: &[u32], c: char) -> u8 {
    table[table.partition_point(|r| *r <= (c as u32) << 8 | 0xff) - 1] as u8
}
static mut TABLE: Vec<u32> = Vec::new();
/// A character's table value: its class after LB1 in bits 0 to 5, and two flags.
pub fn value(c: char) -> u8 {
    unsafe {
        if TABLE.is_empty() {
            TABLE = unpack(&RUNS);
        }
        lookup(&TABLE, c)
    }
}
pub fn class(c: char) -> u8 {
    value(c) & 63
}
/// A character and those LB9 joins to it, as the rules after LB9 see them.
#[derive(Clone, Copy)]
struct U {
    c: u8, // class; QI and QF are QU that is initial or final punctuation
    ea: bool, // East Asian: wide, fullwidth or halfwidth
    ep: bool, // an unassigned Extended_Pictographic
    ch: char,
    zwj: bool, // its last character is ZWJ
}
const NONE: U = U { c: 63, ea: false, ep: false, ch: '\0', zwj: false };
fn any(c: u8, set: &[u8]) -> bool {
    set.contains(&c)
}
fn qu(c: u8) -> bool {
    any(c, &[QU, QI, QF])
}
fn al(c: u8) -> bool {
    c == AL || c == HL
}
fn aks(u: U, with_as: bool) -> bool {
    u.c == AK || u.ch == '\u{25CC}' || (with_as && u.c == AS)
}
pub const NO: u8 = 0;
pub const MAY: u8 = 1;
pub const MUST: u8 = 2;

/// For each position 0 to the length: whether a line may or must end there. Position 0 is NO (LB2)
/// and the end is MUST (LB3).
pub fn breaks(s: &[char]) -> Vec<u8> {
    let mut out = vec![NO; s.len() + 1];
    // LB9, LB10: units
    let mut u: Vec<U> = Vec::new();
    let mut at: Vec<usize> = Vec::new();
    for (i, &ch) in s.iter().enumerate() {
        let v = value(ch);
        let c = v & 63;
        if c == CM || c == ZWJ {
            if let Some(p) = u.last_mut().filter(|p| !any(p.c, &[BK, CR, LF, NL, SP, ZW])) {
                p.zwj = c == ZWJ;
                continue;
            }
        }
        u.push(U { c: if c == CM || c == ZWJ { AL } else { c }, ea: v & 64 != 0, ep: v & 128 != 0, ch, zwj: c == ZWJ });
        at.push(i);
    }
    let get = |k: isize| if k >= 0 && (k as usize) < u.len() { u[k as usize] } else { NONE };
    let mut nonsp = NONE; // the unit before the spaces before this boundary, and the one before it
    let mut nonsp_prev = NONE;
    let mut ri = 0u32; // regional indicators just before the boundary
    let mut num = 0u8; // 1: within NU (SY | IS)*; 2: that and CL or CP
    for k in 1..u.len() {
        let (a, b, n) = (u[k - 1], u[k], get(k as isize + 1));
        let aa = get(k as isize - 2);
        if a.c != SP {
            nonsp_prev = aa;
            nonsp = a;
        }
        ri = if a.c == RI { ri + 1 } else { 0 };
        num = match a.c {
            NU => 1,
            SY | IS if num == 1 => 1,
            CL | CP if num == 1 => 2,
            _ => 0,
        };
        let r = if a.c == BK || (any(a.c, &[CR, LF, NL]) && !(a.c == CR && b.c == LF)) {
            MUST // LB4, LB5
        } else if any(b.c, &[BK, CR, LF, NL, SP, ZW]) {
            NO // LB5, LB6, LB7
        } else if nonsp.c == ZW {
            MAY // LB8
        } else if a.zwj || a.c == WJ || b.c == WJ || a.c == GL {
            NO // LB8a, LB11, LB12
        } else if b.c == GL && !any(a.c, &[SP, BA, HY]) {
            NO // LB12a
        } else if any(b.c, &[CL, CP, EX, SY]) || nonsp.c == OP {
            NO // LB13, LB14
        } else if nonsp.c == QI && any(nonsp_prev.c, &[NONE.c, BK, CR, LF, NL, OP, QU, QI, QF, GL, SP, ZW]) {
            NO // LB15a
        } else if b.c == QF && any(n.c, &[NONE.c, SP, GL, WJ, CL, QU, QI, QF, CP, EX, IS, SY, BK, CR, LF, NL, ZW]) {
            NO // LB15b
        } else if a.c == SP && b.c == IS && n.c == NU {
            MAY // LB15c
        } else if b.c == IS || (any(nonsp.c, &[CL, CP]) && b.c == NS) || (nonsp.c == B2 && b.c == B2) {
            NO // LB15d, LB16, LB17
        } else if a.c == SP {
            MAY // LB18
        } else if any(b.c, &[QU, QF]) || any(a.c, &[QU, QI]) {
            NO // LB19
        } else if (qu(b.c) && (!a.ea || !n.ea)) || (qu(a.c) && (!b.ea || !aa.ea)) {
            NO // LB19a (nothing, at either end of the text, is not East Asian)
        } else if a.c == CB || b.c == CB {
            MAY // LB20
        } else if (a.c == HY || a.ch == '\u{2010}') && b.c == AL && any(aa.c, &[NONE.c, BK, CR, LF, NL, SP, ZW, CB, GL]) {
            NO // LB20a
        } else if any(b.c, &[BA, HY, NS]) || a.c == BB {
            NO // LB21
        } else if aa.c == HL && (a.c == HY || (a.c == BA && !a.ea)) && b.c != HL {
            NO // LB21a
        } else if (a.c == SY && b.c == HL) || b.c == IN {
            NO // LB21b, LB22
        } else if (al(a.c) && b.c == NU) || (a.c == NU && al(b.c)) {
            NO // LB23
        } else if (a.c == PR && any(b.c, &[ID, EB, EM])) || (any(a.c, &[ID, EB, EM]) && b.c == PO) {
            NO // LB23a
        } else if (any(a.c, &[PR, PO]) && al(b.c)) || (al(a.c) && any(b.c, &[PR, PO])) {
            NO // LB24
        } else if num > 0 && any(b.c, &[PO, PR]) || (num == 1 && b.c == NU) {
            NO // LB25, the rules that begin with NU
        } else if any(a.c, &[PO, PR]) && (b.c == NU || (b.c == OP && (n.c == NU || (n.c == IS && get(k as isize + 2).c == NU)))) {
            NO // LB25
        } else if any(a.c, &[HY, IS]) && b.c == NU {
            NO // LB25
        } else if (a.c == JL && any(b.c, &[JL, JV, H2, H3])) || (any(a.c, &[JV, H2]) && any(b.c, &[JV, JT])) || (any(a.c, &[JT, H3]) && b.c == JT) {
            NO // LB26
        } else if (any(a.c, &[JL, JV, JT, H2, H3]) && b.c == PO) || (a.c == PR && any(b.c, &[JL, JV, JT, H2, H3])) {
            NO // LB27
        } else if al(a.c) && al(b.c) {
            NO // LB28
        } else if (a.c == AP && aks(b, true)) || (aks(a, true) && any(b.c, &[VF, VI])) || (aks(aa, true) && a.c == VI && aks(b, false)) || (aks(a, true) && aks(b, true) && n.c == VF) {
            NO // LB28a
        } else if a.c == IS && al(b.c) {
            NO // LB29
        } else if (any(a.c, &[AL, HL, NU]) && b.c == OP && !b.ea) || (a.c == CP && !a.ea && any(b.c, &[AL, HL, NU])) {
            NO // LB30
        } else if (a.c == RI && b.c == RI && ri % 2 == 1) || ((a.c == EB || a.ep) && b.c == EM) {
            NO // LB30a, LB30b
        } else {
            MAY // LB31
        };
        out[at[k]] = r;
    }
    if !s.is_empty() {
        out[s.len()] = MUST;
    }
    out
}
