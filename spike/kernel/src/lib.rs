// Throwaway spike kernel: opens a pack, composes a face into a display list,
// paginates it, and gives the plain-text face. Not the beginning of the implementation.
// Built without the standard library unless the `std` feature is on.
#![cfg_attr(not(feature = "std"), no_std)]
#![allow(static_mut_refs)]
extern crate alloc;
mod bidi;
mod bidi_data;
mod layout;
mod linebreak;
mod linebreak_data;
mod pack;
mod print;
mod project;
mod query;
mod small;
mod spell;
mod value;
use alloc::string::String;
use alloc::vec;
use alloc::vec::Vec;
use layout::*;
use pack::*;
use value::*;

#[link(wasm_import_module = "ufo:host/1")]
extern "C" {
    /// The `text` capability's `measure` (PLAYER 9.3): request and reply are encoded values.
    fn host_measure(req: *const u8, n: usize, out: *mut u8, cap: usize) -> usize;
}
#[cfg(not(any(feature = "std", feature = "cut-alloc")))]
#[global_allocator]
static ALLOCATOR: dlmalloc::GlobalDlmalloc = dlmalloc::GlobalDlmalloc;
#[cfg(not(feature = "std"))]
#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! {
    core::arch::wasm32::unreachable()
}
// ---- for measuring only: see the `cut-` features in Cargo.toml ----
#[cfg(feature = "cut-alloc")]
mod cut_alloc {
    use core::alloc::{GlobalAlloc, Layout};
    struct Bump;
    static mut NEXT: usize = 0;
    unsafe impl GlobalAlloc for Bump {
        unsafe fn alloc(&self, l: Layout) -> *mut u8 {
            if NEXT == 0 {
                NEXT = core::arch::wasm32::memory_size(0) << 16;
            }
            let p = (NEXT + l.align() - 1) & !(l.align() - 1);
            NEXT = p + l.size();
            while NEXT > core::arch::wasm32::memory_size(0) << 16 {
                if core::arch::wasm32::memory_grow(0, 1) == usize::MAX {
                    return core::ptr::null_mut();
                }
            }
            p as *mut u8
        }
        unsafe fn dealloc(&self, _: *mut u8, _: Layout) {}
    }
    #[global_allocator]
    static ALLOCATOR: Bump = Bump;
}
#[cfg(all(feature = "keep", not(feature = "cut-pack")))]
#[no_mangle]
pub unsafe extern "C" fn keep(p: *mut u8, n: usize) -> *const u8 {
    let q = decode(&Vec::from_raw_parts(p, n, n.max(1))).unwrap_or(V::Null);
    OUT = encode(&keep_pack(&q).unwrap_or(V::Null));
    OUT.as_ptr()
}
#[cfg(all(feature = "keep", not(feature = "cut-pack")))]
unsafe fn keep_pack(q: &V) -> Option<V> {
    let pk = PACK.as_ref()?;
    let (h, id) = (q.get("h")?.hash()?, q.get("o")?.id()?);
    Some(match q.get("k")?.i()? {
        0 => pk.node(&h)?,
        1 => V::B(pk.blob(&h)?),
        2 => V::B(pk.record(1, &h)?),
        3 => pk.resolve(q, 0)?,
        4 => {
            let o = pk.object(&h, &id)?;
            V::L(vec![o.p, o.seq?, V::B(o.rev.to_vec()), V::B(o.by.to_vec()), V::T(o.ty)])
        }
        5 => V::Int(boundary(&elements(q)?, q)? as i64),
        _ => {
            let (a, b) = pk.frames();
            V::Int((a.len() + b.len() + pk.unread_tail) as i64)
        }
    })
}
#[cfg(feature = "cut-values")]
fn decode(_: &[u8]) -> Option<V> {
    None
}
#[cfg(feature = "cut-values")]
fn encode(_: &V) -> Vec<u8> {
    Vec::new()
}
#[cfg(feature = "cut-pack")]
fn scan_pack(_: Vec<u8>) -> Option<Pack> {
    None
}
#[cfg(feature = "cut-pack")]
fn open_pack(_: Pack) -> Option<Pack> {
    None
}
#[cfg(not(feature = "cut-pack"))]
fn scan_pack(d: Vec<u8>) -> Option<Pack> {
    Pack::scan(d)
}
#[cfg(not(feature = "cut-pack"))]
fn open_pack(pk: Pack) -> Option<Pack> {
    Pack::open(pk)
}
#[cfg(feature = "cut-layout")]
unsafe fn run(_: &V) -> Option<V> {
    None
}
#[cfg(feature = "cut-print")]
fn print_module(_: &Pack, _: &H, _: &Id) -> Option<Vec<u8>> {
    None
}
#[cfg(not(feature = "cut-print"))]
use print::print as print_module;
#[cfg(feature = "cut-query")]
fn answer(_: &Pack, _: &V) -> Option<V> {
    None
}
#[cfg(not(feature = "cut-query"))]
use query::query as answer;

static mut PACK: Option<Pack> = None; // the open pack
static mut SCANNED: Option<Pack> = None; // a pack given to `open`, until `ready`
static mut OUT: Vec<u8> = Vec::new();

#[no_mangle]
pub extern "C" fn alloc(n: usize) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(n.max(1));
    let p = v.as_mut_ptr();
    core::mem::forget(v);
    p
}
/// Takes ownership of a buffer from `alloc` holding a pack. Returns 0 if it is not a pack. If it has
/// compressed records (`pending` is not 0) the answer 1 is provisional: the host inflates them
/// (`pending_get`, `pending_put`) and then asks `ready`. Otherwise 1 says it holds a universe.
#[no_mangle]
pub unsafe extern "C" fn open(p: *mut u8, n: usize) -> i32 {
    PACK = None;
    SCANNED = scan_pack(Vec::from_raw_parts(p, n, n.max(1)));
    match pending() {
        0 => ready(),
        _ => 1,
    }
}
/// How many compressed payloads the kernel needs inflated before it can answer anything.
#[no_mangle]
pub unsafe extern "C" fn pending() -> usize {
    SCANNED.as_ref().map_or(0, |pk| pk.pending.len())
}
/// The i-th of them, an encoded map: `bytes`, raw DEFLATE, and `len`, what it must inflate to.
#[cfg(not(feature = "cut-pack"))]
#[no_mangle]
pub unsafe extern "C" fn pending_get(i: usize) -> *const u8 {
    let v = SCANNED.as_ref().and_then(|pk| pk.compressed(i)).map(|(b, n)| map(vec![("bytes", V::B(b.to_vec())), ("len", V::Int(n as i64))]));
    OUT = encode(&v.unwrap_or(V::Null));
    OUT.as_ptr()
}
/// Takes ownership of a buffer from `alloc` holding the i-th inflated. Returns 1 if it is of the
/// declared length and was kept. A payload never given, or refused here, leaves its record unavailable.
#[cfg(not(feature = "cut-pack"))]
#[no_mangle]
pub unsafe extern "C" fn pending_put(i: usize, p: *mut u8, n: usize) -> i32 {
    let got = Vec::from_raw_parts(p, n, n.max(1));
    match SCANNED.as_mut().and_then(|pk| pk.pending.get_mut(i)) {
        Some(e) if e.len == n => {
            e.got = Some(got);
            1
        }
        _ => 0,
    }
}
/// Finishes opening, after the host has inflated what it could. Returns 1 if the pack holds a universe.
#[no_mangle]
pub unsafe extern "C" fn ready() -> i32 {
    if let Some(pk) = SCANNED.take() {
        PACK = open_pack(pk);
    }
    PACK.is_some() as i32
}
#[no_mangle]
pub unsafe extern "C" fn out_len() -> usize {
    OUT.len()
}
fn host(req: &V) -> Option<V> {
    let r = encode(req);
    let mut buf = vec![0u8; 64 + 9 * req.get("at").map_or(0, |a| a.l().len())];
    let n = unsafe { host_measure(r.as_ptr(), r.len(), buf.as_mut_ptr(), buf.len()) };
    decode(buf.get(..n)?)
}
fn rect(x: f64, y: f64, w: f64, h: f64) -> V {
    V::L(vec![V::F(x), V::F(y), V::F(w), V::F(h)])
}
/// Samples the primary face. Parameters, an encoded map: `as` ("text", "view", "rows", "pages"), `w`,
/// and `detail` to have the rows of pages too.
#[no_mangle]
pub unsafe extern "C" fn sample(p: *mut u8, n: usize) -> *const u8 {
    let params = decode(&Vec::from_raw_parts(p, n, n.max(1))).unwrap_or(V::Null);
    OUT = encode(&run(&params).unwrap_or(V::Null));
    OUT.as_ptr()
}
#[cfg(not(feature = "cut-layout"))]
unsafe fn run(params: &V) -> Option<V> {
    let pk = PACK.as_ref()?;
    let root = pk.head;
    let u = pk.object(&root, &[0; 16])?;
    let face = |medium: &str| -> Option<Obj> {
        for f in u.p.get("faces")?.l() {
            let o = pk.object(&root, &f.tag(REF)?.id()?)?;
            if o.p.get("medium").and_then(|m| m.s()) == Some(medium) {
                return Some(o);
            }
        }
        None
    };
    let primary = pk.object(&root, &u.p.get("roots")?.get("primary")?.tag(REF)?.id()?)?;
    let of = |f: &Obj| f.p.get("of").and_then(|o| o.tag(REF)).and_then(|o| o.id());
    let mode = params.get("as").and_then(|a| a.s()).unwrap_or("view");
    if mode == "text" {
        let mut s = String::new();
        plain(pk, &root, &of(&primary)?, &mut s, 0);
        return Some(map(vec![("text", V::T(s))]));
    }
    let mut cx = Ctx { pk, root, chain: Vec::new(), blocks: 0, measure: &host };
    let mut list = Vec::new();
    if mode == "pages" {
        let f = face("pages").unwrap_or(primary);
        let s = f.p.get("sampling");
        let dim = |k: &str, i: usize, d: f64| params.get(k).or(s.and_then(|s| s.get(k))).and_then(|v| v.l().get(i)).and_then(|v| v.f()).unwrap_or(d);
        let (pw, ph) = (dim("page", 0, 595.0), dim("page", 1, 842.0));
        let (mt, mr, mb, ml) = (dim("margins", 0, 48.0), dim("margins", 1, 48.0), dim("margins", 2, 48.0), dim("margins", 3, 48.0));
        let rows = compose(&mut cx, &root, &of(&f)?, pw - ml - mr);
        let pages = paginate(&rows, ph - mt - mb);
        let gap = 16.0;
        for (k, (a, b)) in pages.iter().enumerate() {
            let top = k as f64 * (ph + gap);
            // a page is a region of fixed size with a background, holding its share of the flow
            list.push(V::L(vec![t("push"), map(vec![("m", V::L(vec![V::F(1.0), V::F(0.0), V::F(0.0), V::F(1.0), V::F(0.0), V::F(top)])), ("clip", rect(0.0, 0.0, pw, ph))])]));
            list.push(V::L(vec![t("path"), map(vec![("d", V::L(vec![V::L(vec![t("M"), V::F(0.0), V::F(0.0)]), V::L(vec![t("L"), V::F(pw), V::F(0.0)]), V::L(vec![t("L"), V::F(pw), V::F(ph)]), V::L(vec![t("L"), V::F(0.0), V::F(ph)]), V::L(vec![t("Z")])])), ("fill", V::L(vec![V::F(1.0), V::F(1.0), V::F(1.0), V::F(1.0)]))])]));
            stack(&rows[*a..*b], ml, mt, &mut list);
            list.push(V::L(vec![t("pop")]));
        }
        let n = pages.len() as f64;
        let breaks = pages.iter().map(|(a, b)| V::L(vec![V::Int(*a as i64), V::Int(*b as i64)])).collect();
        let detail = if params.get("detail").is_some() { rows_value(&rows) } else { V::Null };
        return Some(map(vec![("list", V::L(list)), ("w", V::F(pw)), ("h", V::F(n * ph + (n - 1.0).max(0.0) * gap)), ("pages", V::Int(pages.len() as i64)), ("rows", V::Int(rows.len() as i64)), ("breaks", V::L(breaks)), ("detail", detail)]));
    }
    let w = params.get("w").and_then(|w| w.f()).unwrap_or(600.0);
    if mode == "rows" {
        // the rows of the primary face composed at exactly `w`, before they are stacked
        return Some(map(vec![("detail", rows_value(&compose(&mut cx, &root, &of(&primary)?, w)))]));
    }
    let pad = 24.0;
    let rows = compose(&mut cx, &root, &of(&primary)?, w - 2.0 * pad);
    let h = stack(&rows, pad, pad, &mut list) + pad;
    Some(map(vec![("list", V::L(list)), ("w", V::F(w)), ("h", V::F(h)), ("rows", V::Int(rows.len() as i64))]))
}
/// Prints the module object whose 16-byte identity is at `p`. Empty output if it cannot be printed.
#[no_mangle]
pub unsafe extern "C" fn print(p: *const u8) -> *const u8 {
    let id: [u8; 16] = core::slice::from_raw_parts(p, 16).try_into().unwrap_or([0; 16]);
    OUT = PACK.as_ref().and_then(|pk| print_module(pk, &pk.head, &id)).unwrap_or_default();
    OUT.as_ptr()
}
/// Answers a query, an encoded map with `q` naming it. Null if it cannot be answered.
#[no_mangle]
pub unsafe extern "C" fn query(p: *mut u8, n: usize) -> *const u8 {
    let q = decode(&Vec::from_raw_parts(p, n, n.max(1))).unwrap_or(V::Null);
    OUT = encode(&PACK.as_ref().and_then(|pk| answer(pk, &q)).unwrap_or(V::Null));
    OUT.as_ptr()
}
/// For the conformance run only: the break at each position of a UTF-8 string, by UAX #14.
#[cfg(feature = "conformance")]
#[no_mangle]
pub unsafe extern "C" fn uax14(p: *mut u8, n: usize) -> *const u8 {
    let s: Vec<char> = String::from_utf8_lossy(&Vec::from_raw_parts(p, n, n.max(1))).chars().collect();
    OUT = linebreak::breaks(&s);
    OUT.as_ptr()
}
/// For the conformance run only. Input: a direction byte (0, 1, or 2 for auto), then one paragraph in
/// UTF-8. Output, an encoded list: the paragraph level, the levels (-1 where X9 removes), the order.
#[cfg(feature = "conformance")]
#[no_mangle]
pub unsafe extern "C" fn uax9(p: *mut u8, n: usize) -> *const u8 {
    let d = Vec::from_raw_parts(p, n, n.max(1));
    let s: Vec<char> = String::from_utf8_lossy(&d[1..]).chars().collect();
    let (mut lv, base) = bidi::levels(&s, d[0]);
    bidi::reset(&s, &mut lv, base);
    let keep: Vec<usize> = (0..s.len()).filter(|&i| !bidi::removed(bidi::class(s[i]))).collect();
    let kept: Vec<u8> = keep.iter().map(|&i| lv[i]).collect();
    let levels = (0..s.len()).map(|i| V::Int(if keep.contains(&i) { lv[i] as i64 } else { -1 })).collect();
    let order = bidi::order(&kept).iter().map(|&k| V::Int(keep[k] as i64)).collect();
    OUT = encode(&V::L(vec![V::Int(base as i64), V::L(levels), V::L(order)]));
    OUT.as_ptr()
}
