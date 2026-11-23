// Throwaway spike kernel: opens a pack, composes a face into a display list,
// paginates it, and gives the plain-text face. Not the beginning of the implementation.
// Built without the standard library unless the `std` feature is on.
#![cfg_attr(not(feature = "std"), no_std)]
#![allow(static_mut_refs)]
extern crate alloc;
mod bidi;
mod bidi_data;
mod diff;
mod envelope;
mod layout;
mod linebreak;
mod linebreak_data;
mod pack;
mod print;
mod project;
mod query;
mod small;
mod spell;
mod tool;
mod value;
mod write;
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
    /// The time now, in milliseconds since 1970 (PLAYER 9.3, `time`).
    fn host_time() -> f64;
    /// Fills a buffer with random bytes (PLAYER 9.3, `random`).
    fn host_random(out: *mut u8, n: usize);
}
pub fn now() -> u64 {
    unsafe { host_time() as u64 }
}
pub fn random(buf: &mut [u8]) {
    unsafe { host_random(buf.as_mut_ptr(), buf.len()) }
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
static mut TOOLS: Option<Pack> = None; // the tools universe, opened beside the working one
static mut READER: Option<tool::Reader> = None; // what the reader holds while it presents the tools
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
pub fn host(req: &V) -> Option<V> {
    let r = encode(req);
    let mut buf = vec![0u8; 64 + 9 * req.get("at").map_or(0, |a| a.l().len())];
    let n = unsafe { host_measure(r.as_ptr(), r.len(), buf.as_mut_ptr(), buf.len()) };
    decode(buf.get(..n)?)
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
    if mode == "static" {
        return Some(map(vec![("html", V::T(static_face(pk)?))])); // the static face of a web envelope
    }
    let mut cx = Ctx::new(pk, &host, None);
    let mut list = Vec::new();
    if mode == "pages" {
        let (pw, h, pages, rows) = paged(&mut cx, &root, &face("pages").unwrap_or(primary), params, &mut list)?;
        let breaks = pages.iter().map(|(a, b)| V::L(vec![V::Int(*a as i64), V::Int(*b as i64)])).collect();
        let detail = if params.get("detail").is_some() { rows_value(&rows) } else { V::Null };
        return Some(map(vec![("list", V::L(list)), ("w", V::F(pw)), ("h", V::F(h)), ("pages", V::Int(pages.len() as i64)), ("rows", V::Int(rows.len() as i64)), ("breaks", V::L(breaks)), ("detail", detail)]));
    }
    let w = params.get("w").and_then(|w| w.f()).unwrap_or(600.0);
    if mode == "list" {
        // the display list of the primary face composed at exactly `w`, its rows stacked from the top left
        let h = stack(&compose(&mut cx, &root, &of(&primary)?, w), 0.0, 0.0, &mut list);
        return Some(map(vec![("list", V::L(list)), ("w", V::F(w)), ("h", V::F(h))]));
    }
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

// ---- for the envelope spike (spike/envelope/PLAN.md): tools beside the working universe, one edit, the pack back ----
unsafe fn taken(p: *mut u8, n: usize) -> V {
    decode(&Vec::from_raw_parts(p, n, n.max(1))).unwrap_or(V::Null)
}
unsafe fn given(v: Option<V>) -> *const u8 {
    OUT = encode(&v.unwrap_or(V::Null));
    OUT.as_ptr()
}
/// Takes ownership of a buffer from `alloc` holding a tools pack, and opens it beside the working one.
/// Returns 1 if it holds a universe. Its compressed records, if it has any, are not inflated.
#[no_mangle]
pub unsafe extern "C" fn open_tools(p: *mut u8, n: usize) -> i32 {
    TOOLS = scan_pack(Vec::from_raw_parts(p, n, n.max(1))).and_then(open_pack);
    TOOLS.is_some() as i32
}
/// The reader's own act (F6): `{parts, name, who}`. `parts` are the parts of the web envelope the host
/// came in, each the text of an element; of them `pack` (the working universe) and `tools` (the tools
/// universe) are packs in base64. `name` is the file's name; `who`, if the host knows it already,
/// the person using the reader. The tools are presented with the working universe as their subject.
/// Returns as `open` does: if `pending` is not 0 the host inflates and then asks `ready`.
#[no_mangle]
pub unsafe extern "C" fn start(p: *mut u8, n: usize) -> i32 {
    let q = taken(p, n);
    let part = |k: &str| q.get("parts").and_then(|p| p.get(k)).and_then(|p| p.s()).and_then(write::unbase64);
    PACK = None;
    TOOLS = part("tools").and_then(scan_pack).and_then(open_pack);
    SCANNED = part("pack").and_then(scan_pack);
    READER = Some(tool::Reader::new(q.get("parts").cloned().unwrap_or(V::Null), q.get("name").and_then(|n| n.s()).unwrap_or(""), q.get("who").and_then(|w| w.s())));
    if TOOLS.is_none() || SCANNED.is_none() {
        return 0;
    }
    match pending() {
        0 => ready(),
        _ => 1,
    }
}
/// One input event (tool.rs): the effects the host is to carry out, a list. Null if nothing is open.
#[no_mangle]
pub unsafe extern "C" fn input(p: *mut u8, n: usize) -> *const u8 {
    let ev = taken(p, n);
    let rd = READER.get_or_insert_with(|| tool::Reader::new(V::Null, "", None));
    given(match (TOOLS.as_ref(), PACK.as_mut()) {
        (Some(tools), Some(pk)) => Some(tool::input(rd, tools, pk, &ev)),
        _ => None,
    })
}
/// The web envelope of its parts (envelope.rs), a map of texts: `{text}`, or `{refused: reason}`.
#[no_mangle]
pub unsafe extern "C" fn envelope(p: *mut u8, n: usize) -> *const u8 {
    given(Some(match envelope::envelope(&taken(p, n)) {
        Ok(page) => map(vec![("text", V::T(page))]),
        Err(why) => map(vec![("refused", t(why))]),
    }))
}
/// `{src}`, the `src` of a text item of the working universe: `{o, key, lo, hi, text}`, the block that holds it.
#[no_mangle]
pub unsafe extern "C" fn block_at(p: *mut u8, n: usize) -> *const u8 {
    let q = taken(p, n);
    given(PACK.as_ref().and_then(|pk| layout::block_at(pk, q.get("src")?)))
}
/// `{o, lo, hi, ins, who, time, random}`: one edit through the gate. `{commit, change, root}`, or `{refused: reason}`.
#[no_mangle]
pub unsafe extern "C" fn propose(p: *mut u8, n: usize) -> *const u8 {
    let q = taken(p, n);
    let r = match PACK.as_mut() {
        Some(pk) => write::propose(pk, &q),
        None => Err("no pack is open"),
    };
    given(Some(r.unwrap_or_else(|why| map(vec![("refused", t(why))]))))
}
/// The whole pack as it now stands, as a byte string.
#[no_mangle]
pub unsafe extern "C" fn pack_bytes() -> *const u8 {
    given(PACK.as_ref().map(|pk| V::B(pk.bytes().to_vec())))
}
/// The text of a web envelope's pack elements: the pack's bytes, as a byte string, or null if it is not base64.
#[no_mangle]
pub unsafe extern "C" fn find_pack(p: *mut u8, n: usize) -> *const u8 {
    given(taken(p, n).s().and_then(write::unbase64).map(V::B))
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
