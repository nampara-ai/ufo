// The pack (SPEC 2): frames, the head, recovery, the index; records by hash; blobs; objects.
use crate::value::*;
use alloc::collections::BTreeMap;
use alloc::string::String;
use alloc::vec::Vec;

pub type H = [u8; 32];
pub type Id = [u8; 16];
const SIG: [u8; 8] = [0x89, b'U', b'F', b'O', 0x0d, 0x0a, 0x1a, 0x0a];

pub struct Pack {
    d: Vec<u8>,
    pub head: H,
    index: usize,             // offset of the newest index frame, or 0
    after: BTreeMap<H, usize>, // records in frames no index covers
    pub unread_tail: usize,
}
struct Frame {
    kind: u8,
    codec: u8,
    start: usize,
    len: usize,
    next: usize,
}
fn le(b: &[u8]) -> usize {
    let mut n = 0u64;
    for (i, &x) in b.iter().enumerate().take(8) {
        n |= (x as u64) << (8 * i);
    }
    n as usize
}
fn leb(d: &[u8], mut p: usize) -> Option<(usize, usize)> {
    let (mut n, mut shift) = (0u64, 0);
    loop {
        let b = *d.get(p)?;
        p += 1;
        if shift >= 63 {
            return None;
        }
        n |= ((b & 0x7f) as u64) << shift;
        shift += 7;
        if b & 0x80 == 0 {
            if b == 0 && shift > 7 {
                return None; // not the shortest form
            }
            return Some((usize::try_from(n).ok()?, p));
        }
    }
}
impl Pack {
    fn frame(&self, off: usize) -> Option<Frame> {
        let kind = *self.d.get(off)?;
        let codec = *self.d.get(off + 1)?;
        let (len, start) = leb(&self.d, off + 2)?;
        let next = start.checked_add(len)?;
        if next > self.d.len() {
            return None;
        }
        Some(Frame { kind, codec, start, len, next })
    }
    /// The decoded record held by the chunk or node frame at `off`.
    fn record_at(&self, off: usize) -> Option<(u8, Vec<u8>)> {
        let f = self.frame(off)?;
        if f.kind != 1 && f.kind != 2 {
            return None;
        }
        let p = &self.d[f.start..f.next];
        let bytes = match f.codec {
            0 => p.to_vec(),
            1 => {
                let (n, q) = leb(p, 0)?;
                let out = miniz_oxide::inflate::decompress_to_vec_with_limit(&p[q..], n).ok()?;
                if out.len() != n {
                    return None;
                }
                out
            }
            _ => return None,
        };
        Some((f.kind, bytes))
    }
    fn hash_at(&self, off: usize) -> Option<H> {
        let (k, b) = self.record_at(off)?;
        Some(sha256(&[&[k], &b]))
    }
    /// P3. Returns the commit the head at `off` names, and its index offset.
    fn valid_head(&self, off: usize, depth: u32) -> Option<(H, usize)> {
        let f = self.frame(off)?;
        if f.kind != 5 || f.codec != 0 || f.len != 72 {
            return None;
        }
        let p = &self.d[f.start..f.next];
        if sha256(&[&p[..64]])[..8] != p[64..] || le(&p[56..64]) != f.next {
            return None;
        }
        let commit: H = p[..32].try_into().ok()?;
        let at = le(&p[32..40]);
        let cf = self.frame(at)?;
        if cf.next > off || self.hash_at(at)? != commit {
            return None;
        }
        let (_, bytes) = self.record_at(at)?;
        if decode(&bytes)?.get("k")?.s()? != "commit" {
            return None;
        }
        let prev = le(&p[48..56]);
        if prev != 0 && (prev >= off || depth > 4096 || self.valid_head(prev, depth + 1).is_none()) {
            return None;
        }
        Some((commit, le(&p[40..48])))
    }
    pub fn open(d: Vec<u8>) -> Option<Pack> {
        if d.len() < 8 || d[..8] != SIG {
            return None;
        }
        let mut pk = Pack { d, head: [0; 32], index: 0, after: BTreeMap::new(), unread_tail: 0 };
        let n = pk.d.len();
        let mut found = if n >= 83 { pk.valid_head(n - 75, 0).map(|h| (h, n)) } else { None };
        if found.is_none() {
            // 2.3 step 2: scan forward, keep the last valid head
            let mut off = 8;
            while let Some(f) = pk.frame(off) {
                if f.kind == 5 {
                    if let Some(h) = pk.valid_head(off, 0) {
                        found = Some((h, f.next));
                    }
                }
                off = f.next;
            }
        }
        let ((commit, index), end) = found?;
        pk.head = commit;
        pk.index = index;
        pk.unread_tail = n - end;
        // records after the newest index's coverage are found by scanning (2.4)
        let mut off = 8;
        if index != 0 {
            if let Some(f) = pk.frame(index) {
                if f.kind == 4 && f.len >= 24 {
                    off = le(&pk.d[f.start + 16..f.start + 24]).max(8);
                } else {
                    pk.index = 0;
                }
            } else {
                pk.index = 0;
            }
        }
        while off < end {
            let Some(f) = pk.frame(off) else { break };
            if f.kind == 1 || f.kind == 2 {
                if let Some(h) = pk.hash_at(off) {
                    pk.after.entry(h).or_insert(off);
                }
            }
            off = f.next;
        }
        Some(pk)
    }
    fn find(&self, h: &H) -> Option<usize> {
        if let Some(&o) = self.after.get(h) {
            return Some(o);
        }
        let mut at = self.index;
        let mut hops = 0;
        while at != 0 && hops < 64 {
            let f = self.frame(at)?;
            let p = &self.d[f.start..f.next];
            if f.kind != 4 || p.len() < 24 || p.len() != 24 + 40 * le(&p[..8]) {
                return None;
            }
            let (mut lo, mut hi) = (0, le(&p[..8]));
            while lo < hi {
                let mid = (lo + hi) / 2;
                let e = &p[24 + 40 * mid..64 + 40 * mid];
                match e[..32].cmp(&h[..]) {
                    core::cmp::Ordering::Equal => return Some(le(&e[32..])),
                    core::cmp::Ordering::Less => lo = mid + 1,
                    core::cmp::Ordering::Greater => hi = mid,
                }
            }
            at = le(&p[8..16]);
            hops += 1;
        }
        None
    }
    /// C2: a record is obtained by its hash and checked against it.
    pub fn record(&self, kind: u8, h: &H) -> Option<Vec<u8>> {
        let (k, bytes) = self.record_at(self.find(h)?)?;
        if k != kind || sha256(&[&[k], &bytes]) != *h {
            return None;
        }
        Some(bytes)
    }
    pub fn node(&self, h: &H) -> Option<V> {
        decode(&self.record(2, h)?)
    }
    /// 1.4: a blob's bytes, whole, checked.
    pub fn blob(&self, h: &H) -> Option<Vec<u8>> {
        let mut out = Vec::new();
        self.blob_into(h, &mut out, 0)?;
        let n = self.node(h)?;
        if n.get("sha256")?.hash()? != sha256(&[&out]) {
            return None;
        }
        Some(out)
    }
    fn blob_into(&self, h: &H, out: &mut Vec<u8>, depth: u32) -> Option<()> {
        let n = self.node(h)?;
        if n.get("k")?.s()? != "blob" || depth > 16 {
            return None;
        }
        let before = out.len();
        let level = n.get("level")?.i()?;
        for part in n.get("parts")?.l() {
            let (len, ph) = (part.l().first()?.i()? as usize, part.l().get(1)?.hash()?);
            let at = out.len();
            if level == 0 {
                out.extend(self.record(1, &ph)?);
            } else {
                self.blob_into(&ph, out, depth + 1)?;
            }
            if out.len() - at != len {
                return None;
            }
        }
        if out.len() - before != n.get("len")?.i()? as usize {
            return None;
        }
        Some(())
    }
    /// Replaces every indirect in a value by what it stands for (1.4).
    pub fn resolve(&self, v: &V, depth: u32) -> Option<V> {
        Some(match v {
            V::Tag(INDIRECT, x) if depth < 16 => {
                let l = x.l();
                let mut h = l[1].hash()?;
                if l.len() == 3 {
                    let opening = self.record(1, &h)?;
                    if opening.len() != 48 {
                        return None;
                    }
                    h = opening[16..].try_into().ok()?;
                }
                let bytes = self.blob(&h)?;
                match l[0].s()? {
                    "b" => V::B(bytes),
                    "t" => V::T(String::from_utf8(bytes).ok()?),
                    _ => self.resolve(&decode(&bytes)?, depth + 1)?,
                }
            }
            V::L(l) => V::L(l.iter().map(|x| self.resolve(x, depth)).collect::<Option<Vec<V>>>()?),
            V::M(m) => V::M(m.iter().map(|(k, x)| Some((k.clone(), self.resolve(x, depth)?))).collect::<Option<Vec<_>>>()?),
            V::Tag(n, x) if *n != ANCHOR => V::Tag(*n, alloc::boxed::Box::new(self.resolve(x, depth)?)),
            other => other.clone(),
        })
    }
    /// 1.6: the current revision of an object in the universe a commit fixes.
    pub fn object(&self, commit: &H, id: &Id) -> Option<Obj> {
        let c = self.node(commit)?;
        if c.get("k")?.s()? != "commit" {
            return None;
        }
        let mut at = c.get("objects")?.hash()?;
        for d in 0..=16 {
            let n = self.node(&at)?;
            if let Some(children) = n.get("c") {
                let b = *id.get(d)?;
                let key = [b"0123456789abcdef"[(b >> 4) as usize], b"0123456789abcdef"[(b & 15) as usize]];
                at = children.get(core::str::from_utf8(&key).ok()?)?.hash()?;
            } else {
                let e = n.get("e")?.l().iter().find(|e| e.l().first().and_then(|x| x.id()) == Some(*id))?;
                let rev = e.l().get(1)?.hash()?;
                let r = self.node(&rev)?;
                if r.get("id")?.id()? != *id {
                    return None;
                }
                return Some(Obj {
                    id: *id,
                    ty: String::from(r.get("type")?.s()?),
                    p: self.resolve(r.get("p")?, 0)?,
                    seq: match r.get("seq") {
                        Some(s) => Some(self.resolve(s, 0)?),
                        None => None,
                    },
                    rev,
                    by: r.get("by")?.id()?,
                });
            }
        }
        None
    }
}
pub struct Obj {
    pub id: Id,
    pub ty: String,
    pub p: V,
    pub seq: Option<V>,
    pub rev: H,
    pub by: Id,
}

// ---- sequences (1.7) and regions on them (4.3) ----
pub struct El {
    pub c: Id,
    pub n: u64,
    pub live: bool,
}
pub fn elements(runs: &V) -> Option<Vec<El>> {
    let mut out = Vec::new();
    for r in runs.l() {
        let r = r.l();
        let (c, first, count) = (r.first()?.id()?, r.get(1)?.i()? as u64, r.get(2)?.i()? as u64);
        for k in 0..count {
            out.push(El { c, n: first + k, live: r.len() == 3 });
        }
    }
    Some(out)
}
/// The position, counted in live elements, of a boundary; None if its element is not in the sequence.
pub fn boundary(els: &[El], b: &V) -> Option<usize> {
    match b.s() {
        Some("start") => return Some(0),
        Some("end") => return Some(els.iter().filter(|e| e.live).count()),
        _ => {}
    }
    let l = b.l();
    let (c, n, side) = (l.first()?.id()?, l.get(1)?.i()? as u64, l.get(2)?.i()?);
    let mut pos = 0;
    for e in els {
        if e.c == c && e.n == n {
            return Some(pos + if side == 1 && e.live { 1 } else { 0 });
        }
        pos += e.live as usize;
    }
    None
}
