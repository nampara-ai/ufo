// Throwaway spike kernel: opens a pack, composes a face into a display list,
// paginates it, and gives the plain-text face. Not the beginning of the implementation.
#![allow(static_mut_refs)]
extern crate alloc;
mod layout;
mod pack;
mod print;
mod project;
mod query;
mod value;
use alloc::string::String;
use alloc::vec;
use alloc::vec::Vec;
use layout::*;
use pack::*;
use value::*;

#[link(wasm_import_module = "ufo:host/1")]
extern "C" {
    /// The `text` capability's `break`: request and reply are encoded values.
    fn host_break(req: *const u8, n: usize, out: *mut u8, cap: usize) -> usize;
}
static mut PACK: Option<Pack> = None;
static mut OUT: Vec<u8> = Vec::new();

#[no_mangle]
pub extern "C" fn alloc(n: usize) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(n.max(1));
    let p = v.as_mut_ptr();
    core::mem::forget(v);
    p
}
/// Takes ownership of a buffer from `alloc` holding a pack. Returns 1 if it holds a universe.
#[no_mangle]
pub unsafe extern "C" fn open(p: *mut u8, n: usize) -> i32 {
    PACK = Pack::open(Vec::from_raw_parts(p, n, n.max(1)));
    PACK.is_some() as i32
}
#[no_mangle]
pub unsafe extern "C" fn out_len() -> usize {
    OUT.len()
}
fn host(req: &V) -> Option<V> {
    let r = encode(req);
    let mut buf = vec![0u8; 16384];
    let n = unsafe { host_break(r.as_ptr(), r.len(), buf.as_mut_ptr(), buf.len()) };
    decode(buf.get(..n)?)
}
fn rect(x: f64, y: f64, w: f64, h: f64) -> V {
    V::L(vec![V::F(x), V::F(y), V::F(w), V::F(h)])
}
/// Samples the primary face. Parameters, an encoded map: `as` ("text", "view", "pages"), `w`.
#[no_mangle]
pub unsafe extern "C" fn sample(p: *mut u8, n: usize) -> *const u8 {
    let params = decode(&Vec::from_raw_parts(p, n, n.max(1))).unwrap_or(V::Null);
    OUT = encode(&run(&params).unwrap_or(V::Null));
    OUT.as_ptr()
}
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
    let mut cx = Ctx { pk, root, chain: Vec::new(), blocks: 0, brk: &host };
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
        return Some(map(vec![("list", V::L(list)), ("w", V::F(pw)), ("h", V::F(n * ph + (n - 1.0).max(0.0) * gap)), ("pages", V::Int(pages.len() as i64)), ("rows", V::Int(rows.len() as i64))]));
    }
    let w = params.get("w").and_then(|w| w.f()).unwrap_or(600.0);
    let pad = 24.0;
    let rows = compose(&mut cx, &root, &of(&primary)?, w - 2.0 * pad);
    let h = stack(&rows, pad, pad, &mut list) + pad;
    Some(map(vec![("list", V::L(list)), ("w", V::F(w)), ("h", V::F(h)), ("rows", V::Int(rows.len() as i64))]))
}
/// Prints the module object whose 16-byte identity is at `p`. Empty output if it cannot be printed.
#[no_mangle]
pub unsafe extern "C" fn print(p: *const u8) -> *const u8 {
    let id: [u8; 16] = core::slice::from_raw_parts(p, 16).try_into().unwrap_or([0; 16]);
    OUT = PACK.as_ref().and_then(|pk| print::print(pk, &pk.head, &id)).unwrap_or_default();
    OUT.as_ptr()
}
/// Answers a query, an encoded map with `q` naming it. Null if it cannot be answered.
#[no_mangle]
pub unsafe extern "C" fn query(p: *mut u8, n: usize) -> *const u8 {
    let q = decode(&Vec::from_raw_parts(p, n, n.max(1))).unwrap_or(V::Null);
    OUT = encode(&PACK.as_ref().and_then(|pk| query::query(pk, &q)).unwrap_or(V::Null));
    OUT.as_ptr()
}
