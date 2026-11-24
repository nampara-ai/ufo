// The printer as a pure function: a described module (objects) in, WebAssembly bytes out.
use crate::pack::*;
use crate::value::*;
use alloc::string::String;
use alloc::vec;
use alloc::vec::Vec;

fn uleb(o: &mut Vec<u8>, mut n: u64) {
    loop {
        let b = (n & 127) as u8;
        n >>= 7;
        if n == 0 {
            o.push(b);
            return;
        }
        o.push(b | 128);
    }
}
fn sleb(o: &mut Vec<u8>, mut n: i64) {
    loop {
        let b = (n & 127) as u8;
        n >>= 7;
        if (n == 0 && b & 64 == 0) || (n == -1 && b & 64 != 0) {
            o.push(b);
            return;
        }
        o.push(b | 128);
    }
}
fn vt(s: &str) -> Option<u8> {
    Some(match s {
        "i32" => 0x7f,
        "i64" => 0x7e,
        "f32" => 0x7d,
        "f64" => 0x7c,
        _ => return None,
    })
}
// WebAssembly's numeric instructions, in opcode order; the name is the standard text-format name.
const CMP_I: &str = "eqz eq ne lt_s lt_u gt_s gt_u le_s le_u ge_s ge_u";
const CMP_F: &str = "eq ne lt gt le ge";
const ARI_I: &str = "clz ctz popcnt add sub mul div_s div_u rem_s rem_u and or xor shl shr_s shr_u rotl rotr";
const ARI_F: &str = "abs neg ceil floor trunc nearest sqrt add sub mul div min max copysign";
const CONV: &str = "i32.wrap_i64 i32.trunc_f32_s i32.trunc_f32_u i32.trunc_f64_s i32.trunc_f64_u i64.extend_i32_s i64.extend_i32_u i64.trunc_f32_s i64.trunc_f32_u i64.trunc_f64_s i64.trunc_f64_u f32.convert_i32_s f32.convert_i32_u f32.convert_i64_s f32.convert_i64_u f32.demote_f64 f64.convert_i32_s f64.convert_i32_u f64.convert_i64_s f64.convert_i64_u f64.promote_f32 i32.reinterpret_f32 i64.reinterpret_f64 f32.reinterpret_i32 f64.reinterpret_i64";
const MEM: &str = "i32.load i64.load f32.load f64.load i32.load8_s i32.load8_u i32.load16_s i32.load16_u i64.load8_s i64.load8_u i64.load16_s i64.load16_u i64.load32_s i64.load32_u i32.store i64.store f32.store f64.store i32.store8 i32.store16 i64.store8 i64.store16 i64.store32";
fn at(list: &str, name: &str) -> Option<u8> {
    list.split(' ').position(|x| x == name).map(|i| i as u8)
}
fn plain(name: &str) -> Option<u8> {
    Some(match name {
        "unreachable" => 0,
        "nop" => 1,
        "return" => 0x0f,
        "drop" => 0x1a,
        "select" => 0x1b,
        _ => {
            if let Some(i) = at(CONV, name) {
                return Some(0xa7 + i);
            }
            let (ty, op) = name.split_once('.')?;
            let (cmp, ari, int) = match ty {
                "i32" => (0x45, 0x67, true),
                "i64" => (0x50, 0x79, true),
                "f32" => (0x5b, 0x8b, false),
                "f64" => (0x61, 0x99, false),
                _ => return None,
            };
            return at(if int { CMP_I } else { CMP_F }, op).map(|i| cmp + i).or_else(|| at(if int { ARI_I } else { ARI_F }, op).map(|i| ari + i));
        }
    })
}
struct Fx<'a> {
    locals: Vec<&'a str>,
    labels: Vec<&'a str>,
    funcs: &'a [Id],
    globals: &'a [(String, V)],
}
impl<'a> Fx<'a> {
    fn kids(&mut self, a: &'a [V], o: &mut Vec<u8>) -> Option<()> {
        for x in a {
            self.node(x, false, o)?;
        }
        Some(())
    }
    /// One statement, or one operand: operands first, in order, then the instruction.
    fn node(&mut self, n: &'a V, top: bool, o: &mut Vec<u8>) -> Option<()> {
        match n {
            V::Int(i) => {
                o.push(0x41);
                sleb(o, *i as i32 as i64);
                return Some(());
            }
            V::T(name) => {
                if let Some(k) = self.locals.iter().position(|l| l == name) {
                    o.push(0x20);
                    uleb(o, k as u64);
                } else {
                    o.push(0x23);
                    uleb(o, self.globals.iter().position(|g| g.0 == *name)? as u64);
                }
                return Some(());
            }
            _ => {}
        }
        let l = n.l();
        let op = l.first()?.s()?;
        let mut a = &l[1..];
        let attrs = match a.last() {
            Some(m @ V::M(_)) => {
                a = &a[..a.len() - 1];
                Some(m)
            }
            _ => None,
        };
        let attr = |k: &str| attrs.and_then(|m| m.get(k));
        let bt = |o: &mut Vec<u8>| -> Option<()> {
            o.push(match attr("result") {
                Some(r) => vt(r.s()?)?,
                None => 0x40,
            });
            Some(())
        };
        match op {
            "block" | "loop" | "if" | "else" | "end" if !top => return None,
            "block" | "loop" => {
                let label = match a.first() {
                    Some(V::T(s)) => s.as_str(),
                    _ => "",
                };
                self.labels.push(label);
                o.push(if op == "block" { 2 } else { 3 });
                bt(o)?;
            }
            "if" => {
                self.kids(a, o)?;
                self.labels.push(attr("label").and_then(|l| l.s()).unwrap_or(""));
                o.push(4);
                bt(o)?;
            }
            "else" => o.push(5),
            "end" => {
                self.labels.pop()?;
                o.push(0x0b);
            }
            "br" | "br_if" => {
                let depth = match a.first()? {
                    V::Int(d) => *d as u64,
                    V::T(s) => (self.labels.len() - 1 - self.labels.iter().rposition(|l| l == s)?) as u64,
                    _ => return None,
                };
                self.kids(&a[1..], o)?;
                o.push(if op == "br" { 0x0c } else { 0x0d });
                uleb(o, depth);
            }
            "i32.const" => {
                o.push(0x41);
                sleb(o, a.first()?.i()? as i32 as i64);
            }
            "i64.const" => {
                o.push(0x42);
                sleb(o, a.first()?.i()?);
            }
            "f32.const" => {
                o.push(0x43);
                o.extend((a.first()?.f()? as f32).to_le_bytes());
            }
            "f64.const" => {
                o.push(0x44);
                o.extend(a.first()?.f()?.to_le_bytes());
            }
            "local.get" | "local.set" | "local.tee" => {
                let name = a.first()?.s()?;
                self.kids(&a[1..], o)?;
                o.push(match op {
                    "local.get" => 0x20,
                    "local.set" => 0x21,
                    _ => 0x22,
                });
                uleb(o, self.locals.iter().position(|l| *l == name)? as u64);
            }
            "global.get" | "global.set" => {
                let name = a.first()?.s()?;
                self.kids(&a[1..], o)?;
                o.push(if op == "global.get" { 0x23 } else { 0x24 });
                uleb(o, self.globals.iter().position(|g| g.0 == name)? as u64);
            }
            "call" => {
                let id = a.first()?.tag(REF)?.id()?;
                self.kids(&a[1..], o)?;
                o.push(0x10);
                uleb(o, self.funcs.iter().position(|f| *f == id)? as u64);
            }
            "memory.size" => o.extend([0x3f, 0]),
            "memory.grow" => {
                self.kids(a, o)?;
                o.extend([0x40, 0]);
            }
            _ => {
                self.kids(a, o)?;
                if let Some(i) = at(MEM, op) {
                    o.push(0x28 + i);
                    let digits = op.trim_end_matches("_s").trim_end_matches("_u");
                    let natural = if digits.ends_with("8") { 0 } else if digits.ends_with("16") { 1 } else if digits.ends_with("d32") || digits.ends_with("e32") || op.starts_with("i32") || op.starts_with("f32") { 2 } else { 3 };
                    uleb(o, attr("align").and_then(|x| x.i()).map(|x| x.trailing_zeros() as u64).unwrap_or(natural));
                    uleb(o, attr("offset").and_then(|x| x.i()).unwrap_or(0) as u64);
                } else {
                    o.push(plain(op)?);
                }
            }
        }
        Some(())
    }
}
fn section(out: &mut Vec<u8>, id: u8, items: &[Vec<u8>]) {
    if items.is_empty() {
        return;
    }
    let mut body = Vec::new();
    uleb(&mut body, items.len() as u64);
    for i in items {
        body.extend(i);
    }
    out.push(id);
    uleb(out, body.len() as u64);
    out.extend(body);
}
fn name(o: &mut Vec<u8>, s: &str) {
    uleb(o, s.len() as u64);
    o.extend(s.as_bytes());
}
fn pairs(v: Option<&V>) -> Vec<(&str, &str)> {
    v.map(|l| l.l()).unwrap_or(&[]).iter().filter_map(|p| Some((p.l().first()?.s()?, p.l().get(1)?.s()?))).collect()
}
/// SPEC 11.3: every byte that is not an item's is derived here, by fixed rules.
#[inline(never)] // the entry of the printer component
pub fn print(pk: &Pack, uni: &H, module: &Id) -> Option<Vec<u8>> {
    let m = pk.object(uni, module)?;
    let funcs: Vec<Id> = m.p.get("funcs")?.l().iter().filter_map(|f| f.tag(REF).and_then(|x| x.id())).collect();
    let empty = Vec::new();
    let globals: &Vec<(String, V)> = match m.p.get("globals") {
        Some(V::M(g)) => g,
        _ => &empty,
    };
    let (mut types, mut ftypes, mut code): (Vec<Vec<u8>>, Vec<Vec<u8>>, Vec<Vec<u8>>) = (Vec::new(), Vec::new(), Vec::new());
    for id in &funcs {
        let f = pk.object(uni, id)?;
        let (params, locals) = (pairs(f.p.get("params")), pairs(f.p.get("locals")));
        let mut ty = vec![0x60];
        uleb(&mut ty, params.len() as u64);
        for p in &params {
            ty.push(vt(p.1)?);
        }
        let results = f.p.get("results").map(|r| r.l()).unwrap_or(&[]);
        uleb(&mut ty, results.len() as u64);
        for r in results {
            ty.push(vt(r.s()?)?);
        }
        let ti = types.iter().position(|t| *t == ty).unwrap_or_else(|| {
            types.push(ty);
            types.len() - 1
        });
        let mut one = Vec::new();
        uleb(&mut one, ti as u64);
        ftypes.push(one);
        // locals, as runs of one type
        let mut body = Vec::new();
        let mut runs: Vec<(u64, u8)> = Vec::new();
        for l in &locals {
            let t = vt(l.1)?;
            match runs.last_mut() {
                Some(r) if r.1 == t => r.0 += 1,
                _ => runs.push((1, t)),
            }
        }
        uleb(&mut body, runs.len() as u64);
        for (n, t) in runs {
            uleb(&mut body, n);
            body.push(t);
        }
        let mut fx = Fx { locals: params.iter().chain(locals.iter()).map(|p| p.0).collect(), labels: Vec::new(), funcs: &funcs, globals };
        for s in f.p.get("body")?.l() {
            fx.node(s, true, &mut body)?;
        }
        if !fx.labels.is_empty() {
            return None;
        }
        body.push(0x0b);
        let mut entry = Vec::new();
        uleb(&mut entry, body.len() as u64);
        entry.extend(body);
        code.push(entry);
    }
    let mut out = vec![0, 0x61, 0x73, 0x6d, 1, 0, 0, 0];
    section(&mut out, 1, &types);
    section(&mut out, 3, &ftypes);
    if let Some(mem) = m.p.get("memory") {
        let mut e = vec![1];
        uleb(&mut e, mem.get("initial")?.i()? as u64);
        uleb(&mut e, mem.get("maximum")?.i()? as u64);
        section(&mut out, 5, &[e]);
    }
    let mut gs = Vec::new();
    for (_, g) in globals {
        let ty = g.get("type")?.s()?;
        // its initial value is a constant of its type, or the module is not printed
        let mut e = vec![vt(ty)?, (g.get("mutable") == Some(&V::Bool(true))) as u8];
        let zero = V::Int(0);
        let init = g.get("init").unwrap_or(&zero);
        match (ty, init.i().filter(|_| matches!(init, V::Int(_)))) {
            ("i64", Some(n)) => {
                e.push(0x42);
                sleb(&mut e, n);
            }
            ("i32", Some(n)) if (-(1i64 << 31)..1i64 << 32).contains(&n) => {
                e.push(0x41);
                sleb(&mut e, n as i32 as i64);
            }
            ("f32", _) => {
                e.push(0x43);
                e.extend((init.f()? as f32).to_le_bytes());
            }
            ("f64", _) => {
                e.push(0x44);
                e.extend(init.f()?.to_le_bytes());
            }
            _ => return None,
        }
        e.push(0x0b);
        gs.push(e);
    }
    section(&mut out, 6, &gs);
    let mut ex = Vec::new();
    if let Some(V::M(exports)) = m.p.get("exports") {
        // a map's entries are already in ascending order of name
        for (n, target) in exports {
            if n.starts_with("ufo:") {
                return None; // N1: the names the kernel keeps for itself are no module's to export
            }
            let mut e = Vec::new();
            name(&mut e, n);
            if let Some(id) = target.tag(REF).and_then(|x| x.id()) {
                e.push(0);
                uleb(&mut e, funcs.iter().position(|f| *f == id)? as u64);
            } else if target.s() == Some("memory") {
                e.extend([2, 0]);
            } else {
                e.push(3);
                uleb(&mut e, globals.iter().position(|g| Some(g.0.as_str()) == target.get("global").and_then(|x| x.s()))? as u64);
            }
            ex.push(e);
        }
    }
    section(&mut out, 7, &ex);
    section(&mut out, 10, &code);
    let mut data = Vec::new();
    if let Some(V::M(segments)) = m.p.get("data") {
        for (_, d) in segments {
            let mut e = vec![0, 0x41];
            sleb(&mut e, d.get("at")?.i()? as i32 as i64);
            e.push(0x0b);
            let b = d.get("bytes")?.b()?;
            uleb(&mut e, b.len() as u64);
            e.extend(b);
            data.push(e);
        }
    }
    section(&mut out, 11, &data);
    Some(out)
}
