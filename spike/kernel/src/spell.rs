// Throwaway spike kernel: spelling text without `core::fmt`. Strings, integers in decimal, hex,
// and floats in the fewest digits that read back as the same float. Not the beginning of the implementation.
use alloc::string::String;
use alloc::vec;
use alloc::vec::Vec;

/// What `cat!` and `put!` can append to a string.
pub trait Put {
    fn put(&self, o: &mut String);
}
impl<T: Put + ?Sized> Put for &T {
    fn put(&self, o: &mut String) {
        (**self).put(o)
    }
}
impl Put for str {
    fn put(&self, o: &mut String) {
        o.push_str(self)
    }
}
impl Put for String {
    fn put(&self, o: &mut String) {
        o.push_str(self)
    }
}
impl Put for bool {
    fn put(&self, o: &mut String) {
        o.push_str(if *self { "true" } else { "false" })
    }
}
impl Put for u64 {
    fn put(&self, o: &mut String) {
        let (mut b, mut i, mut x) = ([0u8; 20], 20, *self);
        loop {
            i -= 1;
            b[i] = b'0' + (x % 10) as u8;
            x /= 10;
            if x == 0 {
                break;
            }
        }
        b[i..].iter().for_each(|&c| o.push(c as char));
    }
}
impl Put for usize {
    fn put(&self, o: &mut String) {
        (*self as u64).put(o)
    }
}
impl Put for i64 {
    fn put(&self, o: &mut String) {
        if *self < 0 {
            o.push('-');
        }
        self.unsigned_abs().put(o)
    }
}
/// A new string of the pieces, in order.
macro_rules! cat {
    ($($x:expr),* $(,)?) => {{ let mut s = alloc::string::String::new(); $( $crate::spell::Put::put(&$x, &mut s); )* s }};
}
/// The pieces appended to a string.
macro_rules! put {
    ($s:expr; $($x:expr),* $(,)?) => {{ $( { let x = $x; $crate::spell::Put::put(&x, &mut $s); } )* }};
}
pub(crate) use {cat, put};

// ---- floats ----
// Whole numbers of any size, least significant word first, with no zero words at the top.
type N = Vec<u32>;
fn mul(a: &mut N, by: u32) {
    let mut carry = 0u64;
    for w in a.iter_mut() {
        let x = *w as u64 * by as u64 + carry;
        *w = x as u32;
        carry = x >> 32;
    }
    if carry != 0 {
        a.push(carry as u32);
    }
}
fn add(a: &N, b: &N) -> N {
    let (mut o, mut carry) = (N::new(), 0u64);
    for i in 0..a.len().max(b.len()) {
        let x = *a.get(i).unwrap_or(&0) as u64 + *b.get(i).unwrap_or(&0) as u64 + carry;
        o.push(x as u32);
        carry = x >> 32;
    }
    if carry != 0 {
        o.push(carry as u32);
    }
    o
}
/// a - b, where a >= b.
fn sub(a: &mut N, b: &N) {
    let mut borrow = 0i64;
    for i in 0..a.len() {
        let x = a[i] as i64 - *b.get(i).unwrap_or(&0) as i64 - borrow;
        a[i] = x as u32;
        borrow = (x < 0) as i64;
    }
    while a.last() == Some(&0) {
        a.pop();
    }
}
fn less(a: &N, b: &N, or_equal: bool) -> bool {
    if a.len() != b.len() {
        return a.len() < b.len();
    }
    for i in (0..a.len()).rev() {
        if a[i] != b[i] {
            return a[i] < b[i];
        }
    }
    or_equal
}
fn shl(a: &mut N, n: u32) {
    for _ in 0..n / 31 {
        mul(a, 1 << 31);
    }
    mul(a, 1 << (n % 31));
}
/// The fewest decimal digits that read back as `x` (and, among those, the nearest to it), written
/// without an exponent: the spelling `{}` gives. A whole number comes out without a point.
/// Exact arithmetic on whole numbers (Steele and White's free-format method, as Burger and Dybvig give it).
pub fn float_into(x: f64, o: &mut String) {
    let bits = x.to_bits();
    if x.is_nan() {
        return o.push_str("NaN");
    }
    if bits >> 63 != 0 {
        o.push('-');
    }
    if x.is_infinite() {
        return o.push_str("inf");
    }
    let (be, frac) = ((bits >> 52 & 0x7ff) as i32, bits & ((1 << 52) - 1));
    if be == 0 && frac == 0 {
        return o.push('0');
    }
    // x = m * 2^e
    let (m, e) = if be == 0 { (frac, -1074) } else { (frac | 1 << 52, be - 1075) };
    let even = m & 1 == 0; // the ends of the interval read back as x only if its last bit is 0
    let wide = frac == 0 && be > 1; // the float below is half as far away as the float above
    // x = r / s; the halfway points to the floats either side are (r - lo) / s and (r + hi) / s
    let (mut r, mut s, mut lo, mut hi) = (vec![m as u32, (m >> 32) as u32], vec![1u32], vec![1u32], vec![1u32]);
    sub(&mut r, &N::new()); // drops a zero word at the top
    shl(&mut r, 1 + wide as u32);
    shl(&mut s, 1 + wide as u32);
    shl(&mut hi, wide as u32);
    if e >= 0 {
        shl(&mut r, e as u32);
        shl(&mut lo, e as u32);
        shl(&mut hi, e as u32);
    } else {
        shl(&mut s, -e as u32);
    }
    // k: the digits are those of 0.ddd… * 10^k
    let mut k = 0i32;
    while less(&s, &add(&r, &hi), even) {
        mul(&mut s, 10);
        k += 1;
    }
    loop {
        let mut top = add(&r, &hi);
        mul(&mut top, 10);
        if !less(&top, &s, !even) {
            break;
        }
        mul(&mut r, 10);
        mul(&mut lo, 10);
        mul(&mut hi, 10);
        k -= 1;
    }
    let mut ds: Vec<u8> = Vec::new();
    loop {
        mul(&mut r, 10);
        mul(&mut lo, 10);
        mul(&mut hi, 10);
        let mut d = b'0';
        while less(&s, &r, true) {
            sub(&mut r, &s);
            d += 1;
        }
        let (low, high) = (less(&r, &lo, even), less(&s, &add(&r, &hi), even));
        if low || high {
            // between two candidates, the nearer; exactly between, the upper (as `{}` does)
            mul(&mut r, 2);
            let up = high && (!low || less(&s, &r, true));
            ds.push(d + up as u8);
            break;
        }
        ds.push(d);
    }
    let n = ds.len() as i32;
    if k <= 0 {
        o.push_str("0.");
        (k..0).for_each(|_| o.push('0'));
    }
    for (i, d) in ds.iter().enumerate() {
        if i as i32 == k && k > 0 {
            o.push('.');
        }
        o.push(*d as char);
    }
    (n..k).for_each(|_| o.push('0'));
}
