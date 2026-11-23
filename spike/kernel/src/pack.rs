// The pack (SPEC 2): frames, the head, recovery, the index; records by hash; blobs; objects.
use crate::value::*;
use crate::small::Map;
use alloc::string::String;
use alloc::vec::Vec;

pub type H = [u8; 32];
pub type Id = [u8; 16];
const SIG: [u8; 8] = [0x89, b'U', b'F', b'O', 0x0d, 0x0a, 0x1a, 0x0a];

pub struct Pack {
    d: Vec<u8>,
    pub head: H,
    index: usize,             // offset of the newest index frame, or 0
    head_at: usize,           // offset of the head frame that gives the state
    after: Map<H, usize>, // records in frames no index covers
    pub unread_tail: usize,
    /// Every compressed chunk or node frame, in the order of the pack: what the host is to inflate.
    pub pending: Vec<Pending>,
}
/// A compressed payload (codec 1, raw DEFLATE), and what it inflates to once the host has said.
pub struct Pending {
    off: usize,       // of its frame
    pub from: usize,  // of the compressed bytes
    pub to: usize,
    pub len: usize,   // the decoded length the frame declares
    pub got: Option<Vec<u8>>,
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
                let i = crate::small::search(self.pending.len(), &mut |i| self.pending[i].off.cmp(&off)).ok()?;
                self.pending[i].got.clone()?
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
    /// The first half of opening: the frames are walked and every compressed payload listed. Nothing
    /// is read from a record yet, since the commit a head names may itself be compressed.
    pub fn scan(d: Vec<u8>) -> Option<Pack> {
        if d.len() < 8 || d[..8] != SIG {
            return None;
        }
        let mut pk = Pack { d, head: [0; 32], index: 0, head_at: 0, after: Map::new(), unread_tail: 0, pending: Vec::new() };
        let mut off = 8;
        while let Some(f) = pk.frame(off) {
            if (f.kind == 1 || f.kind == 2) && f.codec == 1 {
                if let Some((len, q)) = leb(&pk.d[f.start..f.next], 0) {
                    pk.pending.push(Pending { off, from: f.start + q, to: f.next, len, got: None });
                }
            }
            off = f.next;
        }
        Some(pk)
    }
    pub fn compressed(&self, i: usize) -> Option<(&[u8], usize)> {
        let p = self.pending.get(i)?;
        Some((&self.d[p.from..p.to], p.len))
    }
    /// The second half, once the host has inflated what it could: the head, and the records no index covers.
    pub fn open(mut pk: Pack) -> Option<Pack> {
        pk.reopen()?;
        Some(pk)
    }
    /// 2.3: finds the current state afresh, from the bytes as they now stand.
    fn reopen(&mut self) -> Option<()> {
        let pk = self;
        pk.after = Map::new();
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
        pk.head_at = end - 75;
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
                    pk.after.entry(h, off);
                }
            }
            off = f.next;
        }
        Some(())
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
                // 2.5, E11: what is withheld stays an indirect; the reader says so and goes on
                if self.find(&h).is_none() {
                    return Some(v.clone());
                }
                if l.len() == 3 {
                    let opening = self.record(1, &h)?;
                    if opening.len() != 48 {
                        return None;
                    }
                    h = opening[16..].try_into().ok()?;
                    if self.find(&h).is_none() {
                        return Some(v.clone());
                    }
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

// ---- sequences (1.7) and regions on them (4.3): the one resolver, by runs, for sequences of any length ----
#[derive(Clone)]
pub struct Run {
    pub c: Id,
    pub first: u64,
    pub count: u64,
    pub live: bool,
}
pub fn runs(seq: &V) -> Vec<Run> {
    seq.l().iter().filter_map(|r| {
        let r = r.l();
        Some(Run { c: r.first()?.id()?, first: r.get(1)?.i()? as u64, count: r.get(2)?.i()? as u64, live: r.len() == 3 })
    }).collect()
}
pub fn bpos(rs: &[Run], b: &V) -> Option<u64> {
    match b.s() {
        Some("start") => return Some(0),
        Some("end") => return Some(rs.iter().filter(|r| r.live).map(|r| r.count).sum()),
        _ => {}
    }
    let l = b.l();
    let (c, n, side) = (l.first()?.id()?, l.get(1)?.i()? as u64, l.get(2)?.i()? as u64);
    let mut p = 0;
    for r in rs {
        if r.c == c && r.first <= n && n < r.first + r.count {
            return Some(p + if r.live { n - r.first + side } else { 0 });
        }
        if r.live {
            p += r.count;
        }
    }
    None
}
/// A1: None where the region is detached.
pub fn region(rs: &[Run], reg: &V) -> Option<(u64, u64)> {
    let l = reg.l();
    let (a, b) = (l.get(1)?, l.get(2)?);
    let (pa, pb) = (bpos(rs, a)?, bpos(rs, b)?);
    if pa >= pb && a != b {
        return None;
    }
    Some((pa, pb))
}
pub fn element_at(rs: &[Run], mut p: u64) -> Option<(Id, u64)> {
    for r in rs.iter().filter(|r| r.live) {
        if p < r.count {
            return Some((r.c, r.first + p));
        }
        p -= r.count;
    }
    None
}
/// One element of a sequence: who inserted it, its number, whether it is still there.
pub struct El {
    pub c: Id,
    pub n: u64,
    pub live: bool,
}
/// The elements of runs one by one, for a sequence short enough to hold so: a text being composed or edited.
pub fn expand(rs: &[Run]) -> Vec<El> {
    rs.iter().flat_map(|r| (0..r.count).map(move |k| El { c: r.c, n: r.first + k, live: r.live })).collect()
}
/// The position of a boundary as an index: `bpos`, for a sequence held in memory.
pub fn place(rs: &[Run], b: &V) -> Option<usize> {
    bpos(rs, b).map(|p| p as usize)
}

// ---- every frame, for queries that must account for the whole pack ----
impl Pack {
    /// (kind, hash) of every chunk and node frame, and the payload of every seal frame, up to the last head.
    pub fn frames(&self) -> (Vec<(u8, H, usize)>, Vec<Vec<u8>>) {
        let (mut recs, mut seals, mut off) = (Vec::new(), Vec::new(), 8);
        let end = self.d.len() - self.unread_tail;
        while off < end {
            let Some(f) = self.frame(off) else { break };
            if f.kind == 1 || f.kind == 2 {
                if let Some(h) = self.hash_at(off) {
                    recs.push((f.kind, h, f.next - off));
                }
            } else if f.kind == 3 {
                seals.push(self.d[f.start..f.next].to_vec());
            }
            off = f.next;
        }
        (recs, seals)
    }
}

// ---- a copy that withholds (2.5, TRAVEL 13.3) ----
impl Pack {
    /// Every record held, decoded, in the order of the pack: for nesting this pack's universe in another (1.8).
    pub fn records(&self) -> Vec<(u8, Vec<u8>)> {
        let (mut out, mut off) = (Vec::new(), 8);
        while let Some(f) = self.frame(off).filter(|_| off < self.d.len() - self.unread_tail) {
            out.extend(self.record_at(off));
            off = f.next;
        }
        out
    }
    /// A new pack of the records `keep` says, each once, in the order and the frames they have here
    /// (E10: withholding removes records and nothing else); then the seal frames and the frames of
    /// kinds not known (P1); an `absent` frame saying that history is withheld, with whatever an
    /// `absent` frame here already said; one index of everything; and a head naming the same commit.
    pub fn published(&self, keep: &dyn Fn(&H) -> bool) -> Option<Vec<u8>> {
        let (mut d, mut ents, mut later, mut absent) = (SIG.to_vec(), Map::new(), Vec::<u8>::new(), Vec::new());
        let (mut off, end) = (8, self.d.len() - self.unread_tail);
        while off < end {
            let f = self.frame(off)?;
            match f.kind {
                1 | 2 => {
                    if let Some(h) = self.hash_at(off).filter(|h| keep(h) && !ents.contains(h)) {
                        ents.set(h, d.len());
                        d.extend(&self.d[off..f.next]);
                    }
                }
                4 | 5 => {}
                6 => absent = match decode(&self.d[f.start..f.next]) {
                    Some(V::M(m)) => m,
                    _ => absent,
                },
                _ => later.extend(&self.d[off..f.next]),
            }
            off = f.next;
        }
        d.extend(later);
        absent.retain(|e| e.0 != "history");
        absent.push((String::from("history"), V::Bool(true)));
        frame_into(&mut d, 6, &encode(&V::M(absent)));
        let (at, commit_at) = (d.len(), *ents.get(&self.head)?);
        let mut p = Vec::new();
        for n in [ents.0.len(), 0, at] {
            p.extend((n as u64).to_le_bytes());
        }
        for (h, o) in &ents.0 {
            p.extend(h);
            p.extend((*o as u64).to_le_bytes());
        }
        frame_into(&mut d, 4, &p);
        let mut p = self.head.to_vec();
        for n in [commit_at, at, 0, d.len() + 75] {
            p.extend((n as u64).to_le_bytes());
        }
        let check = sha256(&[&p]);
        p.extend(&check[..8]);
        frame_into(&mut d, 5, &p);
        Some(d)
    }
}

// ---- writing (2.2, 2.4): a commit is an append of records, an index and a head ----
fn frame_into(d: &mut Vec<u8>, kind: u8, payload: &[u8]) {
    d.extend([kind, 0]);
    let mut n = payload.len();
    while n >= 0x80 {
        d.push(n as u8 | 0x80);
        n >>= 7;
    }
    d.push(n as u8);
    d.extend(payload);
}
impl Pack {
    pub fn bytes(&self) -> &[u8] {
        &self.d
    }
    /// Appends the records that are not here yet, an index that covers every frame up to itself, and a
    /// head naming `commit`; then finds the state afresh. On any failure the pack is as it was.
    pub fn commit(&mut self, recs: &[(u8, Vec<u8>)], commit: &H) -> Option<()> {
        let was = self.d.len();
        if self.unread_tail != 0 || self.write(recs, commit).is_none() || self.head != *commit {
            self.d.truncate(was);
            self.reopen();
            return None;
        }
        Some(())
    }
    /// Takes off what lies after the first `len` bytes: a commit that was appended and is not wanted.
    pub fn cut(&mut self, len: usize) {
        self.d.truncate(len);
        self.reopen();
    }
    fn write(&mut self, recs: &[(u8, Vec<u8>)], commit: &H) -> Option<()> {
        for (kind, bytes) in recs {
            let h = sha256(&[&[*kind], bytes]);
            if self.record(*kind, &h).is_none() {
                self.after.entry(h, self.d.len());
                frame_into(&mut self.d, *kind, bytes);
            }
        }
        let commit_at = self.find(commit)?;
        // 2.4: the new index covers from the end of the newest index's coverage to its own offset
        let field = |d: &[u8], at: usize, k: usize| le(&d[at + k..at + k + 8]);
        let index = |pk: &Pack, at: usize| pk.frame(at).filter(|f| f.kind == 4 && f.len >= 24 && f.len == 24 + 40 * le(&pk.d[f.start..f.start + 8])).map(|f| f.start);
        let (at, mut prev) = (self.d.len(), self.index);
        let mut off = match index(self, prev) {
            Some(p) => field(&self.d, p, 16).max(8),
            None => 8,
        };
        if off == 8 {
            prev = 0; // no index, or one that cannot be read: everything is listed again
        }
        let mut ents: Vec<(H, usize)> = Vec::new();
        while off < at {
            let f = self.frame(off)?;
            if f.kind == 1 || f.kind == 2 {
                ents.push((self.hash_at(off)?, off)); // a record that cannot be read would be hidden: refuse
            }
            off = f.next;
        }
        // the merge rule: absorb the index before, while it has no more than twice as many entries
        while let Some(p) = index(self, prev) {
            let n = field(&self.d, p, 0);
            if prev == 0 || n > 2 * ents.len() {
                break;
            }
            ents.extend((0..n).map(|i| (self.d[p + 24 + 40 * i..p + 56 + 40 * i].try_into().unwrap_or([0; 32]), field(&self.d, p, 56 + 40 * i))));
            prev = field(&self.d, p, 8);
        }
        crate::small::sort(&mut ents); // by hash, then by offset: the lowest offset of each record is kept
        ents.dedup_by(|b, a| a.0 == b.0);
        let mut p = Vec::new();
        for n in [ents.len(), prev, at] {
            p.extend((n as u64).to_le_bytes());
        }
        for (h, o) in &ents {
            p.extend(h);
            p.extend((*o as u64).to_le_bytes());
        }
        frame_into(&mut self.d, 4, &p);
        // 2.2: the head
        let mut p = commit.to_vec();
        for n in [commit_at, at, self.head_at, self.d.len() + 75] {
            p.extend((n as u64).to_le_bytes());
        }
        let check = sha256(&[&p]);
        p.extend(&check[..8]);
        frame_into(&mut self.d, 5, &p);
        self.reopen()
    }
}
