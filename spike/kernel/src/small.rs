// One sort and one sorted list, used everywhere in place of the library's sort and its tree maps.
// The work is in two functions that are compiled once (`order`, `search`); what is compiled per
// type is a comparison and a swap.
use alloc::vec::Vec;
use core::cmp::Ordering;

/// The stable order of `n` things: a bottom-up merge sort of their indices. `less(a, b)` says whether
/// thing `a` must come before thing `b`. At most n log2 n comparisons, two lists of n indices.
fn order(n: usize, less: &mut dyn FnMut(usize, usize) -> bool) -> Vec<usize> {
    let (mut a, mut b): (Vec<usize>, Vec<usize>) = ((0..n).collect(), (0..n).collect());
    let mut w = 1;
    while w < n {
        let mut lo = 0;
        while lo < n {
            let (mid, hi) = ((lo + w).min(n), (lo + 2 * w).min(n));
            let (mut i, mut j) = (lo, mid);
            for k in lo..hi {
                // the right side goes first only when it is strictly less: equal things keep their order
                if j < hi && (i == mid || less(a[j], a[i])) {
                    b[k] = a[j];
                    j += 1;
                } else {
                    b[k] = a[i];
                    i += 1;
                }
            }
            lo = hi;
        }
        core::mem::swap(&mut a, &mut b);
        w *= 2;
    }
    a
}
/// Puts things in the order `ix` gives (place i takes what was at ix[i]) by swaps.
fn permute(ix: &mut [usize], swap: &mut dyn FnMut(usize, usize)) {
    for i in 0..ix.len() {
        let mut j = i;
        loop {
            let k = ix[j];
            ix[j] = j;
            if k == i {
                break;
            }
            swap(j, k);
            j = k;
        }
    }
}
/// Sorts, stably.
pub fn sort_by<T>(v: &mut [T], mut cmp: impl FnMut(&T, &T) -> Ordering) {
    let mut ix = order(v.len(), &mut |a, b| cmp(&v[a], &v[b]) == Ordering::Less);
    permute(&mut ix, &mut |a, b| v.swap(a, b));
}
pub fn sort<T: Ord>(v: &mut [T]) {
    sort_by(v, |a, b| a.cmp(b))
}
/// Binary search among `n` things in order: where the one `cmp` calls Equal is, or where it would go.
pub fn search(n: usize, cmp: &mut dyn FnMut(usize) -> Ordering) -> Result<usize, usize> {
    let (mut lo, mut hi) = (0, n);
    while lo < hi {
        let mid = (lo + hi) / 2;
        match cmp(mid) {
            Ordering::Equal => return Ok(mid),
            Ordering::Less => lo = mid + 1,
            Ordering::Greater => hi = mid,
        }
    }
    Err(lo)
}
/// A map kept as a list in the order of its keys. Finding is a binary search; adding moves what follows.
pub struct Map<K, T>(pub Vec<(K, T)>);
pub type Set<K> = Map<K, ()>;
impl<K: Ord, T> Map<K, T> {
    pub fn new() -> Self {
        Map(Vec::new())
    }
    fn at(&self, k: &K) -> Result<usize, usize> {
        search(self.0.len(), &mut |i| self.0[i].0.cmp(k))
    }
    pub fn get(&self, k: &K) -> Option<&T> {
        self.at(k).ok().map(|i| &self.0[i].1)
    }
    pub fn contains(&self, k: &K) -> bool {
        self.at(k).is_ok()
    }
    /// The value under `k`, which is `v` if there was none.
    pub fn entry(&mut self, k: K, v: T) -> &mut T {
        let i = match self.at(&k) {
            Ok(i) => i,
            Err(i) => {
                self.0.insert(i, (k, v));
                i
            }
        };
        &mut self.0[i].1
    }
    /// Puts `v` under `k`, in place of what was there.
    pub fn set(&mut self, k: K, v: T) {
        match self.at(&k) {
            Ok(i) => self.0[i].1 = v,
            Err(i) => self.0.insert(i, (k, v)),
        }
    }
    pub fn keys(&self) -> impl Iterator<Item = &K> {
        self.0.iter().map(|e| &e.0)
    }
    pub fn into_keys(self) -> impl Iterator<Item = K> {
        self.0.into_iter().map(|e| e.0)
    }
    pub fn pop_first(&mut self) -> Option<K> {
        if self.0.is_empty() {
            return None;
        }
        Some(self.0.remove(0).0)
    }
}
impl<K: Ord> Map<K, ()> {
    /// False if it was there already.
    pub fn insert(&mut self, k: K) -> bool {
        match self.at(&k) {
            Ok(_) => false,
            Err(i) => {
                self.0.insert(i, (k, ()));
                true
            }
        }
    }
    pub fn extend(&mut self, ks: impl IntoIterator<Item = K>) {
        for k in ks {
            self.insert(k);
        }
    }
}
