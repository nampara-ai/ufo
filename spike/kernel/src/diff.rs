// The difference between two texts, as the fewest scalar values removed and inserted (SPEC 1.7, L1:
// operations are computed from the content before and after). E. W. Myers, "An O(ND) Difference
// Algorithm and Its Variations" (1986), the greedy algorithm of its figure 2, run forward.
//
// Which shortest script, where there are several, is fixed by three rules:
// 1. the longest common prefix is set aside first, then the longest common suffix of what is left;
// 2. on each diagonal k of round d the path comes from diagonal k+1 (an insertion) when k = -d, or
//    when k != d and that path has got strictly further along the old text; otherwise it comes
//    from diagonal k-1 (a removal). Diagonals are tried from -d upward, and the first to reach
//    the end ends the search;
// 3. removals and insertions with nothing kept between them are one edit.
use alloc::vec;
use alloc::vec::Vec;

/// Positions `lo` to `hi` of the old text are replaced by `ins`. Either side may be empty, not both.
pub struct Edit {
    pub lo: usize,
    pub hi: usize,
    pub ins: Vec<char>,
}
/// The edits that turn `a` into `b`, in order, apart, with positions in `a`. Past `LIMIT` remembered
/// path ends the middle is given as one replacement, which is correct and not minimal.
pub fn diff(a: &[char], b: &[char]) -> Vec<Edit> {
    const LIMIT: usize = 1 << 22;
    let mut pre = 0;
    while pre < a.len() && pre < b.len() && a[pre] == b[pre] {
        pre += 1;
    }
    let mut suf = 0;
    while suf < a.len() - pre && suf < b.len() - pre && a[a.len() - 1 - suf] == b[b.len() - 1 - suf] {
        suf += 1;
    }
    let (x, y) = (&a[pre..a.len() - suf], &b[pre..b.len() - suf]);
    let (n, m) = (x.len(), y.len());
    if n == 0 && m == 0 {
        return Vec::new();
    }
    let whole = || vec![Edit { lo: pre, hi: pre + n, ins: y.to_vec() }];
    if n == 0 || m == 0 {
        return whole();
    }
    let off = (n + m) as isize;
    let from = |v: &[usize], k: isize, d: isize| k == -d || (k != d && v[(k - 1 + off) as usize] < v[(k + 1 + off) as usize]);
    let mut v = vec![0usize; 2 * (n + m) + 2];
    let mut trace: Vec<Vec<usize>> = Vec::new(); // trace[d]: how far each diagonal had got before round d
    let mut found = false;
    'rounds: for d in 0..=(n + m) as isize {
        if (trace.len() + 1) * v.len() > LIMIT {
            return whole();
        }
        trace.push(v.clone());
        let mut k = -d;
        while k <= d {
            let mut i = if from(&v, k, d) { v[(k + 1 + off) as usize] } else { v[(k - 1 + off) as usize] + 1 };
            let mut j = (i as isize - k) as usize;
            while i < n && j < m && x[i] == y[j] {
                i += 1;
                j += 1;
            }
            v[(k + off) as usize] = i;
            if i == n && j == m {
                found = true;
                break 'rounds;
            }
            k += 2;
        }
    }
    if !found {
        return whole();
    }
    // back along the path: one step a round, each a removal of x[i] or an insertion of y[j] at (i, j)
    let (mut i, mut j, mut steps) = (n, m, Vec::new());
    for d in (1..trace.len()).rev() {
        let (k, v) = (i as isize - j as isize, &trace[d]);
        let ins = from(v, k, d as isize);
        let pk = if ins { k + 1 } else { k - 1 };
        i = v[(pk + off) as usize];
        j = (i as isize - pk) as usize;
        steps.push((i, j, ins));
    }
    let (mut out, mut next): (Vec<Edit>, (usize, usize)) = (Vec::new(), (usize::MAX, 0));
    for &(i, j, ins) in steps.iter().rev() {
        if (i, j) != next {
            out.push(Edit { lo: pre + i, hi: pre + i, ins: Vec::new() });
        }
        let Some(e) = out.last_mut() else { break };
        if ins {
            e.ins.push(y[j]);
            next = (i, j + 1);
        } else {
            e.hi += 1;
            next = (i + 1, j);
        }
    }
    out
}
