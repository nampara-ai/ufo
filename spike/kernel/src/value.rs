// Values (SPEC 1.2): strict deterministic CBOR in, deterministic CBOR out; SHA-256.
use alloc::boxed::Box;
use alloc::string::String;
use alloc::vec::Vec;

#[derive(Clone, PartialEq)]
pub enum V {
    Null,
    Bool(bool),
    Int(i64),
    F(f64),
    T(String),
    B(Vec<u8>),
    L(Vec<V>),
    M(Vec<(String, V)>),
    Tag(u64, Box<V>),
}
pub const REF: u64 = 55461;
pub const ANCHOR: u64 = 55462;
pub const INDIRECT: u64 = 55464;

impl V {
    pub fn get(&self, k: &str) -> Option<&V> {
        match self {
            V::M(m) => m.iter().find(|e| e.0 == k).map(|e| &e.1),
            _ => None,
        }
    }
    pub fn s(&self) -> Option<&str> {
        if let V::T(s) = self { Some(s) } else { None }
    }
    pub fn f(&self) -> Option<f64> {
        match self {
            V::F(x) => Some(*x),
            V::Int(i) => Some(*i as f64),
            _ => None,
        }
    }
    pub fn i(&self) -> Option<i64> {
        if let V::Int(i) = self { Some(*i) } else { None }
    }
    pub fn l(&self) -> &[V] {
        if let V::L(l) = self { l } else { &[] }
    }
    pub fn b(&self) -> Option<&[u8]> {
        if let V::B(b) = self { Some(b) } else { None }
    }
    pub fn tag(&self, n: u64) -> Option<&V> {
        match self {
            V::Tag(t, v) if *t == n => Some(v),
            _ => None,
        }
    }
    pub fn id(&self) -> Option<[u8; 16]> {
        self.b().and_then(|b| b.try_into().ok())
    }
    pub fn hash(&self) -> Option<[u8; 32]> {
        self.b().and_then(|b| b.try_into().ok())
    }
}
pub fn map(e: Vec<(&str, V)>) -> V {
    V::M(e.into_iter().map(|(k, v)| (String::from(k), v)).collect())
}
pub fn t(s: &str) -> V {
    V::T(String::from(s))
}

// ---- decoding, rejecting everything C1 lists ----
struct Dec<'a> {
    d: &'a [u8],
    p: usize,
}
impl<'a> Dec<'a> {
    fn take(&mut self, n: usize) -> Option<&'a [u8]> {
        let e = self.p.checked_add(n)?;
        let s = self.d.get(self.p..e)?;
        self.p = e;
        Some(s)
    }
    fn head(&mut self) -> Option<(u8, u8, u64)> {
        let b = self.take(1)?[0];
        let (major, ai) = (b >> 5, b & 31);
        let n = match ai {
            0..=23 => ai as u64,
            24..=27 => {
                let w = 1usize << (ai - 24);
                let mut n = 0u64;
                for &x in self.take(w)? {
                    n = n << 8 | x as u64;
                }
                // shortest form (floats carry their own rule)
                if major != 7 && (n < 24 || (w > 1 && n >> (8 * (w / 2)) == 0)) {
                    return None;
                }
                n
            }
            _ => return None,
        };
        Some((major, ai, n))
    }
    fn val(&mut self, depth: u32) -> Option<V> {
        if depth > 64 {
            return None;
        }
        let (major, ai, n) = self.head()?;
        Some(match major {
            0 if n <= i64::MAX as u64 => V::Int(n as i64),
            1 if n <= i64::MAX as u64 => V::Int(-1 - n as i64),
            2 => V::B(self.take(usize::try_from(n).ok()?)?.to_vec()),
            3 => V::T(String::from(core::str::from_utf8(self.take(usize::try_from(n).ok()?)?).ok()?)),
            4 => {
                let mut l = Vec::new();
                for _ in 0..n {
                    l.push(self.val(depth + 1)?);
                }
                V::L(l)
            }
            5 => {
                let mut m: Vec<(String, V)> = Vec::new();
                let mut prev: &[u8] = &[];
                for _ in 0..n {
                    let start = self.p;
                    let k = match self.val(depth + 1)? {
                        V::T(s) => s,
                        _ => return None,
                    };
                    let key = &self.d[start..self.p];
                    if !m.is_empty() && prev >= key {
                        return None;
                    }
                    prev = key;
                    m.push((k, self.val(depth + 1)?));
                }
                V::M(m)
            }
            6 => {
                let v = self.val(depth + 1)?;
                let ok = match n {
                    REF => v.id().is_some(),
                    ANCHOR => v.get("o").and_then(|o| o.id()).is_some(),
                    55463 => v.l().first().and_then(|x| x.s()).is_some(),
                    INDIRECT => {
                        let l = v.l();
                        (l.len() == 2 || (l.len() == 3 && l[2] == V::Bool(true)))
                            && matches!(l[0].s(), Some("b" | "t" | "v"))
                            && l[1].hash().is_some()
                    }
                    _ => true,
                };
                if !ok {
                    return None;
                }
                V::Tag(n, Box::new(v))
            }
            7 => match ai {
                20 => V::Bool(false),
                21 => V::Bool(true),
                22 => V::Null,
                25 => V::F(half_to_f64(n as u16)).finite()?,
                26 => {
                    let x = f32::from_bits(n as u32) as f64;
                    if f64_to_half(x).is_some() {
                        return None;
                    }
                    V::F(x).finite()?
                }
                27 => {
                    let x = f64::from_bits(n);
                    if (x as f32) as f64 == x {
                        return None;
                    }
                    V::F(x).finite()?
                }
                _ => return None,
            },
            _ => return None,
        })
    }
}
impl V {
    fn finite(self) -> Option<V> {
        match self {
            V::F(x) if x.is_finite() => Some(V::F(x)),
            _ => None,
        }
    }
}
fn half_to_f64(h: u16) -> f64 {
    let (s, e, m) = ((h >> 15) as u64, ((h >> 10) & 31) as i32, (h & 1023) as f64);
    let x = match e {
        0 => m * pow2(-24),
        31 => {
            if m == 0.0 { f64::INFINITY } else { f64::NAN }
        }
        _ => (1024.0 + m) * pow2(e - 25),
    };
    if s == 1 { -x } else { x }
}
fn pow2(e: i32) -> f64 {
    f64::from_bits(((1023 + e) as u64) << 52)
}
fn f64_to_half(x: f64) -> Option<u16> {
    for h in [(x.to_bits() >> 48) as u16 & 0x8000] {
        // search the 15-bit magnitude space by construction, not by table: exact match only
        let a = if x < 0.0 { -x } else { x };
        if a == 0.0 {
            return Some(h);
        }
        let bits = a.to_bits();
        let e = ((bits >> 52) & 0x7ff) as i32 - 1023;
        let frac = bits & ((1u64 << 52) - 1);
        if (-14..=15).contains(&e) && frac & ((1u64 << 42) - 1) == 0 {
            return Some(h | (((e + 15) as u16) << 10) | (frac >> 42) as u16);
        }
        if (-24..-14).contains(&e) {
            let m = ((1u64 << 52) | frac) >> (42 + (-14 - e) as u32);
            if half_to_f64(m as u16) == a {
                return Some(h | m as u16);
            }
        }
    }
    None
}
pub fn decode(d: &[u8]) -> Option<V> {
    let mut r = Dec { d, p: 0 };
    let v = r.val(1)?;
    if r.p == d.len() { Some(v) } else { None }
}

// ---- encoding ----
fn put_head(o: &mut Vec<u8>, major: u8, n: u64) {
    let m = major << 5;
    if n < 24 {
        o.push(m | n as u8)
    } else if n < 1 << 8 {
        o.extend([m | 24, n as u8])
    } else if n < 1 << 16 {
        o.push(m | 25);
        o.extend((n as u16).to_be_bytes())
    } else if n < 1 << 32 {
        o.push(m | 26);
        o.extend((n as u32).to_be_bytes())
    } else {
        o.push(m | 27);
        o.extend(n.to_be_bytes())
    }
}
pub fn encode_into(v: &V, o: &mut Vec<u8>) {
    match v {
        V::Null => o.push(0xf6),
        V::Bool(b) => o.push(0xf4 + *b as u8),
        V::Int(i) if *i >= 0 => put_head(o, 0, *i as u64),
        V::Int(i) => put_head(o, 1, (-1 - *i) as u64),
        V::F(x) => {
            if let Some(h) = f64_to_half(*x) {
                o.push(0xf9);
                o.extend(h.to_be_bytes())
            } else if (*x as f32) as f64 == *x {
                o.push(0xfa);
                o.extend((*x as f32).to_be_bytes())
            } else {
                o.push(0xfb);
                o.extend(x.to_be_bytes())
            }
        }
        V::B(b) => {
            put_head(o, 2, b.len() as u64);
            o.extend(b)
        }
        V::T(s) => {
            put_head(o, 3, s.len() as u64);
            o.extend(s.as_bytes())
        }
        V::L(l) => {
            put_head(o, 4, l.len() as u64);
            for x in l {
                encode_into(x, o)
            }
        }
        V::M(m) => {
            let mut ix: Vec<usize> = (0..m.len()).collect();
            ix.sort_by(|&a, &b| (m[a].0.len(), m[a].0.as_bytes()).cmp(&(m[b].0.len(), m[b].0.as_bytes())));
            put_head(o, 5, m.len() as u64);
            for i in ix {
                put_head(o, 3, m[i].0.len() as u64);
                o.extend(m[i].0.as_bytes());
                encode_into(&m[i].1, o)
            }
        }
        V::Tag(n, x) => {
            put_head(o, 6, *n);
            encode_into(x, o)
        }
    }
}
pub fn encode(v: &V) -> Vec<u8> {
    let mut o = Vec::new();
    encode_into(v, &mut o);
    o
}

// ---- SHA-256 (FIPS 180-4) ----
const K: [u32; 64] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
    0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
    0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
#[cfg(feature = "cut-sha")]
pub fn sha256(parts: &[&[u8]]) -> [u8; 32] {
    let mut h = [K[0] as u8; 32];
    for p in parts {
        for (i, b) in p.iter().enumerate() {
            h[i % 32] ^= *b;
        }
    }
    h
}
#[cfg(not(feature = "cut-sha"))]
pub fn sha256(parts: &[&[u8]]) -> [u8; 32] {
    let mut h: [u32; 8] = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    let total: usize = parts.iter().map(|p| p.len()).sum();
    let mut block = [0u8; 64];
    let mut fill = 0;
    let mut feed = |h: &mut [u32; 8], b: u8| {
        block[fill] = b;
        fill += 1;
        if fill == 64 {
            fill = 0;
            let mut w = [0u32; 64];
            for i in 0..16 {
                w[i] = u32::from_be_bytes([block[4 * i], block[4 * i + 1], block[4 * i + 2], block[4 * i + 3]]);
            }
            for i in 16..64 {
                let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
                let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
                w[i] = w[i - 16].wrapping_add(s0).wrapping_add(w[i - 7]).wrapping_add(s1);
            }
            let mut v = *h;
            for i in 0..64 {
                let s1 = v[4].rotate_right(6) ^ v[4].rotate_right(11) ^ v[4].rotate_right(25);
                let ch = (v[4] & v[5]) ^ (!v[4] & v[6]);
                let t1 = v[7].wrapping_add(s1).wrapping_add(ch).wrapping_add(K[i]).wrapping_add(w[i]);
                let s0 = v[0].rotate_right(2) ^ v[0].rotate_right(13) ^ v[0].rotate_right(22);
                let t2 = s0.wrapping_add((v[0] & v[1]) ^ (v[0] & v[2]) ^ (v[1] & v[2]));
                v = [t1.wrapping_add(t2), v[0], v[1], v[2], v[3].wrapping_add(t1), v[4], v[5], v[6]];
            }
            for i in 0..8 {
                h[i] = h[i].wrapping_add(v[i]);
            }
        }
    };
    for p in parts {
        for &b in *p {
            feed(&mut h, b);
        }
    }
    feed(&mut h, 0x80);
    let mut n = total + 1;
    while n % 64 != 56 {
        feed(&mut h, 0);
        n += 1;
    }
    for b in ((total as u64) * 8).to_be_bytes() {
        feed(&mut h, b);
    }
    let mut out = [0u8; 32];
    for i in 0..8 {
        out[4 * i..4 * i + 4].copy_from_slice(&h[i].to_be_bytes());
    }
    out
}
