// Throwaway spike printer. Three levels of body: "raw" (flat WAT, numeric locals),
// "folded" (WAT with names and folded expressions), "expr" (typed expression tree).
import fs from 'fs'; import crypto from 'crypto'; import path from 'path';
const sha = b => crypto.createHash('sha256').update(Buffer.from(b)).digest();
const hex = b => Buffer.from(b).toString('hex');
class Refuse extends Error {}
const refuse = m => { throw new Refuse(m); };
// ---------- LEB ----------
const uleb = n => { n = BigInt(n); const o = []; do { let b = Number(n & 127n); n >>= 7n; if (n) b |= 128; o.push(b); } while (n); return o; };
const sleb = n => { n = BigInt(n); const o = []; for (;;) { const b = Number(n & 127n); n >>= 7n; if ((n === 0n && !(b & 64)) || (n === -1n && (b & 64))) { o.push(b); return o; } o.push(b | 128); } };
const VT = { i32: 0x7f, i64: 0x7e, f32: 0x7d, f64: 0x7c };
// ---------- opcode table ----------
const OP = { unreachable: 0, nop: 1, return: 0x0f, drop: 0x1a, select: 0x1b };
const seq = (start, pre, names) => names.forEach((n, i) => OP[pre + n] = start + i);
const cmpI = ['eqz', 'eq', 'ne', 'lt_s', 'lt_u', 'gt_s', 'gt_u', 'le_s', 'le_u', 'ge_s', 'ge_u'], cmpF = ['eq', 'ne', 'lt', 'gt', 'le', 'ge'];
const ariI = ['clz', 'ctz', 'popcnt', 'add', 'sub', 'mul', 'div_s', 'div_u', 'rem_s', 'rem_u', 'and', 'or', 'xor', 'shl', 'shr_s', 'shr_u', 'rotl', 'rotr'];
const ariF = ['abs', 'neg', 'ceil', 'floor', 'trunc', 'nearest', 'sqrt', 'add', 'sub', 'mul', 'div', 'min', 'max', 'copysign'];
seq(0x45, 'i32.', cmpI); seq(0x50, 'i64.', cmpI); seq(0x5b, 'f32.', cmpF); seq(0x61, 'f64.', cmpF);
seq(0x67, 'i32.', ariI); seq(0x79, 'i64.', ariI); seq(0x8b, 'f32.', ariF); seq(0x99, 'f64.', ariF);
seq(0xa7, '', ['i32.wrap_i64', 'i32.trunc_f32_s', 'i32.trunc_f32_u', 'i32.trunc_f64_s', 'i32.trunc_f64_u', 'i64.extend_i32_s', 'i64.extend_i32_u', 'i64.trunc_f32_s', 'i64.trunc_f32_u', 'i64.trunc_f64_s', 'i64.trunc_f64_u', 'f32.convert_i32_s', 'f32.convert_i32_u', 'f32.convert_i64_s', 'f32.convert_i64_u', 'f32.demote_f64', 'f64.convert_i32_s', 'f64.convert_i32_u', 'f64.convert_i64_s', 'f64.convert_i64_u', 'f64.promote_f32', 'i32.reinterpret_f32', 'i64.reinterpret_f64', 'f32.reinterpret_i32', 'f64.reinterpret_i64']);
const MEM = {}; ['i32.load', 'i64.load', 'f32.load', 'f64.load', 'i32.load8_s', 'i32.load8_u', 'i32.load16_s', 'i32.load16_u', 'i64.load8_s', 'i64.load8_u', 'i64.load16_s', 'i64.load16_u', 'i64.load32_s', 'i64.load32_u', 'i32.store', 'i64.store', 'f32.store', 'f64.store', 'i32.store8', 'i32.store16', 'i64.store8', 'i64.store16', 'i64.store32'].forEach((n, i) => { const m = n.match(/(\d+)(_[su])?$/); const w = m ? +m[1] : +n.slice(1, 3); MEM[n] = [0x28 + i, Math.log2(w / 8)]; });
// ---------- WAT body (raw and folded) ----------
function tokenize(s) { s = s.replace(/\(;[\s\S]*?;\)/g, ' ').replace(/;;[^\n]*/g, ' '); return s.match(/[()]|[^\s()]+/g) || []; }
function compileWat(body, fn, level) {
  const t = tokenize(body); let i = 0; const labels = [];
  const peek = (k = 0) => t[i + k], next = () => t[i++] ?? refuse(`${fn.name}: unexpected end of body`);
  const expect = x => { const g = next(); if (g !== x) refuse(`${fn.name}: expected '${x}' but found '${g}' (token ${i})`); };
  const localNames = fn.localNames;
  if (level === 'raw' && t.includes('(')) refuse(`${fn.name}: level raw accepts flat instructions only; found '('`);
  const num = (s, what) => { if (!/^[-+]?(0x[0-9a-fA-F_]+|[0-9_]+)$/.test(s)) refuse(`${fn.name}: expected ${what}, found '${s}'`); return BigInt(s.replace(/_/g, '').replace(/^\+/, '')); };
  const local = s => { if (s.startsWith('$')) { if (level === 'raw') refuse(`${fn.name}: level raw takes locals by index, found '${s}'`); const k = localNames.indexOf(s.slice(1)); if (k < 0) refuse(`${fn.name}: no local '${s}'`); return k; } const k = Number(num(s, 'a local index')); if (k >= fn.nlocals) refuse(`${fn.name}: local index ${k} out of range (0..${fn.nlocals - 1})`); return k; };
  const label = s => { if (s.startsWith('$')) { const k = labels.lastIndexOf(s); if (k < 0) refuse(`${fn.name}: no label '${s}' in scope`); return labels.length - 1 - k; } return Number(num(s, 'a label depth')); };
  const blocktype = () => { if (peek() === '(' && peek(1) === 'result') { i += 2; const ty = next(); expect(')'); return [VT[ty] ?? refuse(`${fn.name}: unknown type '${ty}'`)]; } if (level === 'raw' && VT[peek()] !== undefined) return [VT[next()]]; return [0x40]; };
  const optLabel = () => (peek() && peek().startsWith('$')) ? next() : null;
  const imm = op => { // immediates of a plain operator, as chunks
    if (op === 'i32.const') { const v = num(next(), 'an integer'); if (v < -(2n ** 31n) || v >= 2n ** 32n) refuse(`${fn.name}: i32.const out of range`); return [0x41, ...sleb(BigInt.asIntN(32, v))]; }
    if (op === 'i64.const') return [0x42, ...sleb(BigInt.asIntN(64, num(next(), 'an integer')))];
    if (op === 'f32.const') { const b = Buffer.alloc(4); b.writeFloatLE(Number(next())); return [0x43, ...b]; }
    if (op === 'f64.const') { const b = Buffer.alloc(8); b.writeDoubleLE(Number(next())); return [0x44, ...b]; }
    if (op === 'local.get' || op === 'local.set' || op === 'local.tee') return [{ 'local.get': 0x20, 'local.set': 0x21, 'local.tee': 0x22 }[op], ...uleb(local(next()))];
    if (op === 'global.get' || op === 'global.set') return [op === 'global.get' ? 0x23 : 0x24, { ref: 'global', name: next().replace(/^\$/, '') }];
    if (op === 'call') return [0x10, { ref: 'func', name: next().replace(/^\$/, '') }];
    if (op === 'br' || op === 'br_if') return [op === 'br' ? 0x0c : 0x0d, ...uleb(label(next()))];
    if (op === 'memory.size') return [0x3f, 0]; if (op === 'memory.grow') return [0x40, 0];
    if (MEM[op]) { let [code, al] = MEM[op], off = 0n; while (peek() && /^(offset|align)=/.test(peek())) { const [k, v] = next().split('='); if (k === 'offset') off = num(v, 'an offset'); else al = Math.log2(Number(num(v, 'an alignment'))); } return [code, ...uleb(al), ...uleb(off)]; }
    if (OP[op] !== undefined) return [OP[op]];
    refuse(`${fn.name}: unknown or unsupported instruction '${op}'`);
  };
  const seqUntil = ends => { const out = []; while (!ends.includes(peek())) { if (peek() === undefined) refuse(`${fn.name}: body ended while expecting ${ends.join(' or ')}`); out.push(...instr()); } return out; };
  function instr() {
    if (peek() === '(') { i++; const op = next(); let out;
      if (op === 'block' || op === 'loop') { const l = optLabel(), bt = blocktype(); labels.push(l ?? ''); out = [op === 'block' ? 2 : 3, ...bt, ...seqUntil([')']), 0x0b]; labels.pop(); }
      else if (op === 'if') { const l = optLabel(), bt = blocktype(); const cond = []; while (peek() === '(' && peek(1) !== 'then') cond.push(...instr()); expect('('); expect('then'); labels.push(l ?? ''); const th = seqUntil([')']); expect(')'); let el = null; if (peek() === '(') { expect('('); expect('else'); el = seqUntil([')']); expect(')'); } labels.pop(); out = [...cond, 4, ...bt, ...th, ...(el ? [5, ...el] : []), 0x0b]; }
      else { const head = imm(op); const args = []; while (peek() === '(') args.push(...instr()); out = [...args, ...head]; }
      expect(')'); return out; }
    const op = next();
    if (op === 'block' || op === 'loop') { const l = optLabel(), bt = blocktype(); labels.push(l ?? ''); const b = seqUntil(['end']); next(); optLabel(); labels.pop(); return [op === 'block' ? 2 : 3, ...bt, ...b, 0x0b]; }
    if (op === 'if') { const l = optLabel(), bt = blocktype(); labels.push(l ?? ''); const th = seqUntil(['else', 'end']); let el = null; if (next() === 'else') { optLabel(); el = seqUntil(['end']); next(); } optLabel(); labels.pop(); return [4, ...bt, ...th, ...(el ? [5, ...el] : []), 0x0b]; }
    if (op === 'else' || op === 'end' || op === ')') refuse(`${fn.name}: unexpected '${op}'`);
    return imm(op);
  }
  const out = seqUntil([undefined].concat(level === 'raw' ? [] : [])); return out;
}
// ---------- typed expression form ----------
const BIN = { '+': 'add', '-': 'sub', '*': 'mul', '/': 'div_s', '/u': 'div_u', '%': 'rem_s', '%u': 'rem_u', '&': 'and', '|': 'or', '^': 'xor', '<<': 'shl', '>>': 'shr_s', '>>>': 'shr_u' };
const CMP = { '==': 'eq', '!=': 'ne', '<': 'lt_s', '<u': 'lt_u', '>': 'gt_s', '>u': 'gt_u', '<=': 'le_s', '<=u': 'le_u', '>=': 'ge_s', '>=u': 'ge_u' };
const LOAD = { u8: ['i32.load8_u', 'i32'], s8: ['i32.load8_s', 'i32'], u16: ['i32.load16_u', 'i32'], s16: ['i32.load16_s', 'i32'], i32: ['i32.load', 'i32'], i64: ['i64.load', 'i64'] };
const STORE = { u8: ['i32.store8', 'i32'], u16: ['i32.store16', 'i32'], i32: ['i32.store', 'i32'], i64: ['i64.store', 'i64'] };
function compileExpr(body, fn, mod) {
  let depth = 0; const loops = []; // each: {brk, cont} absolute depths
  const where = p => `${fn.name} at ${p}`;
  const memop = n => [MEM[n][0], MEM[n][1], 0];
  function ex(e, p) { // -> [chunks, type]
    if (typeof e === 'number') { if (!Number.isInteger(e)) refuse(`${where(p)}: only integer literals are supported`); return [[0x41, ...sleb(BigInt.asIntN(32, BigInt(e)))], 'i32']; }
    if (typeof e === 'string') { const k = fn.localNames.indexOf(e); if (k >= 0) return [[0x20, ...uleb(k)], fn.localTypes[k]]; const g = mod.globals.find(g => g.name === e); if (g) return [[0x23, { ref: 'global', name: e }], g.type]; refuse(`${where(p)}: no local or global named '${e}'`); }
    if (!Array.isArray(e) || typeof e[0] !== 'string') refuse(`${where(p)}: expected an expression, found ${JSON.stringify(e)}`);
    const [op, ...a] = e; const need = n => { if (a.length !== n) refuse(`${where(p)}: '${op}' takes ${n} argument(s), found ${a.length}`); };
    const sub = k => ex(a[k], `${p}/${op}[${k}]`);
    if (op === 'i64' && typeof a[0] === 'number') { need(1); return [[0x42, ...sleb(BigInt(a[0]))], 'i64']; }
    if (op === 'i64') { need(1); const [c, t] = sub(0); if (t !== 'i32') refuse(`${where(p)}: 'i64' converts an i32, found ${t}`); return [[...c, OP['i64.extend_i32_s']], 'i64']; }
    if (op === 'i32') { need(1); const [c, t] = sub(0); if (t !== 'i64') refuse(`${where(p)}: 'i32' converts an i64, found ${t}`); return [[...c, OP['i32.wrap_i64']], 'i32']; }
    if (BIN[op] || CMP[op]) { need(2); const [c1, t1] = sub(0), [c2, t2] = sub(1); if (t1 !== t2) refuse(`${where(p)}: '${op}' has operands of different types, ${t1} and ${t2}`); return [[...c1, ...c2, OP[`${t1}.${BIN[op] || CMP[op]}`]], BIN[op] ? t1 : 'i32']; }
    if (op === '!') { need(1); const [c, t] = sub(0); return [[...c, OP[`${t}.eqz`]], 'i32']; }
    if (op === 'and' || op === 'or') { need(2); const [c1, t1] = sub(0); depth++; const [c2, t2] = sub(1); depth--; if (t1 !== 'i32' || t2 !== 'i32') refuse(`${where(p)}: '${op}' takes i32 conditions`); return [op === 'and' ? [...c1, 4, 0x7f, ...c2, OP['i32.eqz'], OP['i32.eqz'], 5, 0x41, 0, 0x0b] : [...c1, 4, 0x7f, 0x41, 1, 5, ...c2, OP['i32.eqz'], OP['i32.eqz'], 0x0b], 'i32']; }
    if (op === 'if') { need(3); const [c, t] = sub(0); depth++; const [x, tx] = sub(1), [y, ty] = sub(2); depth--; if (t !== 'i32') refuse(`${where(p)}: condition must be i32`); if (tx !== ty) refuse(`${where(p)}: the two branches have different types, ${tx} and ${ty}`); return [[...c, 4, VT[tx], ...x, 5, ...y, 0x0b], tx]; }
    if (op === 'load') { need(2); const L = LOAD[a[0]] ?? refuse(`${where(p)}: load width must be one of ${Object.keys(LOAD)}`); const [c, t] = sub(1); if (t !== 'i32') refuse(`${where(p)}: an address must be i32`); return [[...c, ...memop(L[0])], L[1]]; }
    if (op === 'call') { const [c, t] = call(a, p); if (!t) refuse(`${where(p)}: '${a[0]}' returns nothing and cannot be used as a value`); return [c, t]; }
    refuse(`${where(p)}: unknown expression operator '${op}'`);
  }
  function call(a, p) { const f = mod.funcs.find(f => f.name === a[0]) ?? refuse(`${where(p)}: no function named '${a[0]}'`); if (a.length - 1 !== f.params.length) refuse(`${where(p)}: '${f.name}' takes ${f.params.length} argument(s), found ${a.length - 1}`); const out = []; a.slice(1).forEach((x, k) => { const [c, t] = ex(x, `${p}/call ${f.name}[${k}]`); if (t !== f.params[k]) refuse(`${where(p)}: argument ${k} of '${f.name}' must be ${f.params[k]}, found ${t}`); out.push(...c); }); return [[...out, 0x10, { ref: 'func', name: f.name }], f.results[0]]; }
  function stmts(list, p) { if (!Array.isArray(list)) refuse(`${where(p)}: expected a list of statements`); return list.flatMap((s, k) => st(s, `${p}[${k}]`)); }
  function st(s, p) {
    if (!Array.isArray(s)) refuse(`${where(p)}: expected a statement, found ${JSON.stringify(s)}`);
    const [op, ...a] = s;
    if (op === 'set') { const [c, t] = ex(a[1], p + '/set'); const k = fn.localNames.indexOf(a[0]); if (k >= 0) { if (fn.localTypes[k] !== t) refuse(`${where(p)}: '${a[0]}' is ${fn.localTypes[k]}, value is ${t}`); return [...c, 0x21, ...uleb(k)]; } const g = mod.globals.find(g => g.name === a[0]) ?? refuse(`${where(p)}: no local or global named '${a[0]}'`); if (!g.mutable) refuse(`${where(p)}: global '${a[0]}' is not mutable`); if (g.type !== t) refuse(`${where(p)}: '${a[0]}' is ${g.type}, value is ${t}`); return [...c, 0x24, { ref: 'global', name: a[0] }]; }
    if (op === 'store') { const S = STORE[a[0]] ?? refuse(`${where(p)}: store width must be one of ${Object.keys(STORE)}`); const [c1, t1] = ex(a[1], p + '/store addr'), [c2, t2] = ex(a[2], p + '/store value'); if (t1 !== 'i32') refuse(`${where(p)}: an address must be i32`); if (t2 !== S[1]) refuse(`${where(p)}: store ${a[0]} takes ${S[1]}, found ${t2}`); return [...c1, ...c2, ...memop(S[0])]; }
    if (op === 'if') { const [c, t] = ex(a[0], p + '/if cond'); if (t !== 'i32') refuse(`${where(p)}: condition must be i32`); depth++; const th = stmts(a[1], p + '/then'), el = a[2] ? stmts(a[2], p + '/else') : null; depth--; return [...c, 4, 0x40, ...th, ...(el ? [5, ...el] : []), 0x0b]; }
    if (op === 'while') { const brk = depth + 1, cont = depth + 2; loops.push({ brk, cont }); depth += 2; const [c, t] = ex(a[0], p + '/while cond'); if (t !== 'i32') refuse(`${where(p)}: condition must be i32`); const b = stmts(a[1], p + '/body'); depth -= 2; loops.pop(); return [2, 0x40, 3, 0x40, ...c, OP['i32.eqz'], 0x0d, 1, ...b, 0x0c, 0, 0x0b, 0x0b]; }
    if (op === 'break' || op === 'continue') { const L = loops[loops.length - 1] ?? refuse(`${where(p)}: '${op}' outside a loop`); return [0x0c, ...uleb(depth - (op === 'break' ? L.brk : L.cont))]; }
    if (op === 'return') { if (fn.results.length) { if (a.length !== 1) refuse(`${where(p)}: this function returns ${fn.results[0]}; 'return' needs a value`); const [c, t] = ex(a[0], p + '/return'); if (t !== fn.results[0]) refuse(`${where(p)}: returns ${fn.results[0]}, value is ${t}`); return [...c, 0x0f]; } if (a.length) refuse(`${where(p)}: this function returns nothing`); return [0x0f]; }
    if (op === 'call') { const [c, t] = call(a, p); return t ? [...c, 0x1a] : c; }
    refuse(`${where(p)}: unknown statement '${op}'`);
  }
  const out = stmts(body, 'body'); if (fn.results.length) out.push(0); // falling off the end of a function that returns a value traps
  return out;
}
// ---------- module assembly ----------
function build(st) {
  const key = (kind, name) => { const it = st[kind].find(x => x.name === name) ?? refuse(`no ${kind.replace(/s$/, '')} named '${name}'`); return it; };
  const types = []; const typeOf = f => { const enc = [0x60, ...uleb(f.params.length), ...f.params.map(t => VT[t]), ...uleb(f.results.length), ...f.results.map(t => VT[t])]; const h = hex(enc); let k = types.findIndex(t => t.h === h); if (k < 0) { types.push({ h, enc }); k = types.length - 1; } return [k, enc]; };
  const flat = (chunks, mode) => chunks.flatMap(c => typeof c === 'number' ? [c] : mode === 'hash' ? [...Buffer.from(key(c.ref + 's', c.name).key, 'hex')] : uleb(st[c.ref + 's'].indexOf(key(c.ref + 's', c.name))));
  const code = [], ftypes = [];
  for (const f of st.funcs) {
    const [ti, tenc] = typeOf(f); ftypes.push(ti);
    const all = [...f.params, ...f.locals]; const fn = { name: f.name, results: f.results, nlocals: all.length, localNames: [...(f.paramNames || []), ...(f.localNames || [])], localTypes: all };
    for (const t of all) if (VT[t] === undefined) refuse(`${f.name}: unknown type '${t}'`);
    const chunks = f.level === 'expr' ? compileExpr(f.body, fn, st) : compileWat(f.body, fn, f.level);
    const runs = []; for (const t of f.locals) { if (runs.length && runs[runs.length - 1][1] === t) runs[runs.length - 1][0]++; else runs.push([1, t]); }
    const locals = [...uleb(runs.length), ...runs.flatMap(([n, t]) => [...uleb(n), VT[t]])];
    const bodyBytes = [...locals, ...flat(chunks, 'real'), 0x0b];
    code.push([...uleb(bodyBytes.length), ...bodyBytes]);
    f.hash = hex(sha([...tenc, ...locals, ...flat(chunks, 'hash'), 0x0b])); f.size = bodyBytes.length; f.instrBytes = bodyBytes.length - locals.length;
  }
  const sec = (id, items) => items.length ? [id, ...uleb(items.flat().length + uleb(items.length).length), ...uleb(items.length), ...items.flat()] : [];
  const constExpr = g => g.type === 'i64' ? [0x42, ...sleb(BigInt(g.init)), 0x0b] : [0x41, ...sleb(BigInt.asIntN(32, BigInt(g.init))), 0x0b];
  const name = s => { const b = [...Buffer.from(s)]; return [...uleb(b.length), ...b]; };
  const exps = [...st.exports].sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name))).map(e => { if (e.item === 'memory') return [...name(e.name), 2, 0]; const f = st.funcs.find(f => f.name === e.item); if (f) return [...name(e.name), 0, ...uleb(st.funcs.indexOf(f))]; const g = st.globals.find(g => g.name === e.item) ?? refuse(`export '${e.name}': no item named '${e.item}'`); return [...name(e.name), 3, ...uleb(st.globals.indexOf(g))]; });
  for (const g of st.globals) g.hash = hex(sha([VT[g.type], g.mutable ? 1 : 0, ...constExpr(g)]));
  const bytes = [0, 0x61, 0x73, 0x6d, 1, 0, 0, 0,
    ...sec(1, types.map(t => t.enc)), ...sec(3, ftypes.map(uleb)),
    ...(st.memory ? sec(5, [[1, ...uleb(st.memory.initial), ...uleb(st.memory.maximum)]]) : []),
    ...sec(6, st.globals.map(g => [VT[g.type], g.mutable ? 1 : 0, ...constExpr(g)])),
    ...sec(7, exps), ...sec(10, code),
    ...sec(11, st.datas.map(d => { const b = [...Buffer.from(d.bytes, 'hex')]; return [0, 0x41, ...sleb(d.at), 0x0b, ...uleb(b.length), ...b]; }))];
  const wasm = Uint8Array.from(bytes);
  try { new WebAssembly.Module(wasm); } catch (e) { let m = String(e.message).replace(/^WebAssembly\.Module\(\): /, ''); const k = m.match(/function #(\d+)/); if (k && st.funcs[+k[1]]) m += ` [function #${k[1]} is '${st.funcs[+k[1]].name}']`; refuse('module does not validate: ' + m); }
  return wasm;
}
// ---------- operations ----------
function apply(st, change, n) {
  const mint = k => hex(sha(Buffer.from(`change ${n} op ${k}`))).slice(0, 32);
  const level = st.level;
  change.ops.forEach((op, k) => {
    const where = `op ${k} (${op.op})`;
    const find = (kind, name) => st[kind].find(x => x.name === name);
    const sig = () => { const pn = (op.params || []).map(p => Array.isArray(p) ? p[0] : null), pt = (op.params || []).map(p => Array.isArray(p) ? p[1] : p), ln = (op.locals || []).map(p => Array.isArray(p) ? p[0] : null), lt = (op.locals || []).map(p => Array.isArray(p) ? p[1] : p); if (level === 'raw' && [...pn, ...ln].some(x => x)) refuse(`${where}: level raw declares params and locals by type only`); if (level !== 'raw' && [...pn, ...ln].some(x => !x)) refuse(`${where}: params and locals are [name, type] pairs`); return { params: pt, paramNames: pn, locals: lt, localNames: ln }; };
    const checkBody = () => { if (level === 'expr' ? !Array.isArray(op.body) : typeof op.body !== 'string') refuse(`${where}: body must be ${level === 'expr' ? 'a list of statements' : 'WebAssembly text'}`); };
    if (op.op === 'memory.set') st.memory = { initial: op.initial, maximum: op.maximum, by: n };
    else if (op.op === 'global.add') { if (find('globals', op.name)) refuse(`${where}: global '${op.name}' exists`); st.globals.push({ key: mint(k), name: op.name, type: op.type, mutable: !!op.mutable, init: op.init ?? 0, by: n }); }
    else if (op.op === 'global.set') { const g = find('globals', op.name) ?? refuse(`${where}: no global '${op.name}'`); g.init = op.init; g.by = n; }
    else if (op.op === 'data.set') { let d = find('datas', op.name); if (!d) { d = { key: mint(k), name: op.name }; st.datas.push(d); } d.at = op.at; d.bytes = op.text !== undefined ? hex(Buffer.from(op.text)) : op.bytes; d.by = n; }
    else if (op.op === 'func.add') { if (find('funcs', op.name)) refuse(`${where}: function '${op.name}' exists; use func.replace`); checkBody(); st.funcs.push({ key: mint(k), name: op.name, ...sig(), results: op.results || [], body: op.body, level, by: n, history: [n] }); }
    else if (op.op === 'func.replace') { const f = find('funcs', op.name) ?? refuse(`${where}: no function '${op.name}'`); if (op.expect !== f.hash && op.expect !== f.hash.slice(0, 8)) refuse(`${where}: expected hash ${op.expect} but '${op.name}' is ${f.hash.slice(0, 8)}; read it again with 'unit' before replacing it`); checkBody(); const s = sig(); f.locals = s.locals; f.localNames = s.localNames; f.body = op.body; f.by = n; f.history.push(n); }
    else if (op.op === 'func.remove') { const f = find('funcs', op.name) ?? refuse(`${where}: no function '${op.name}'`); if (op.expect !== f.hash && op.expect !== f.hash.slice(0, 8)) refuse(`${where}: expected hash does not match`); st.funcs.splice(st.funcs.indexOf(f), 1); st.exports = st.exports.filter(e => e.item !== op.name); }
    else if (op.op === 'export.set') { st.exports = st.exports.filter(e => e.name !== op.name); st.exports.push({ key: mint(k), name: op.name, item: op.item, by: n }); }
    else if (op.op === 'export.remove') st.exports = st.exports.filter(e => e.name !== op.name);
    else refuse(`${where}: unknown operation`);
  });
  return build(st);
}
// ---------- command line ----------
const [cmd, dir, arg] = process.argv.slice(2);
const P = f => path.join(dir, f);
const load = () => JSON.parse(fs.readFileSync(P('state.json')));
const instantiate = () => new WebAssembly.Instance(new WebAssembly.Module(fs.readFileSync(P('module.wasm'))), {});
if (cmd === 'init') { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(P('state.json'), JSON.stringify({ level: arg, memory: null, globals: [], funcs: [], datas: [], exports: [], changes: 0 })); fs.writeFileSync(P('ledger.jsonl'), ''); fs.writeFileSync(P('attempts.jsonl'), ''); console.log(`empty module at level ${arg}`); }
else if (cmd === 'check') { const st = load(); try { let change; try { change = JSON.parse(fs.readFileSync(arg, 'utf8')); } catch (e) { refuse('the change is not valid JSON: ' + e.message); } const wasm = apply(st, change, st.changes + 1); const x = new WebAssembly.Instance(new WebAssembly.Module(wasm), {}).exports; console.log(`would be committed: module ${wasm.length} bytes (nothing changed)`); const tf = process.argv[5]; if (tf) { fs.writeFileSync(P('candidate.wasm'), wasm); runTests(tf, P('candidate.wasm')); } } catch (e) { if (!(e instanceof Refuse)) throw e; console.log('WOULD BE REFUSED: ' + e.message); process.exit(1); } }
else if (cmd === 'call') { const x = instantiate().exports; for (const c of arg.split(';').map(s => s.trim()).filter(Boolean)) { const m = c.match(/^(\w+)\((.*)\)$/); if (!m) { console.log(`cannot read '${c}'`); continue; } if (m[1] === 'text') { const [p, n] = m[2].split(',').map(Number); console.log(Buffer.from(x.memory.buffer, p, n).toString('latin1')); continue; } if (typeof x[m[1]] !== 'function') { console.log(`no export '${m[1]}'`); continue; } try { console.log(`${c} -> ${x[m[1]](...m[2].split(',').filter(s => s.trim()).map(Number))}`); } catch (e) { console.log(`${c} trapped: ${e.message}`); } } }
else if (cmd === 'change') { for (const l of fs.readFileSync(P('ledger.jsonl'), 'utf8').trim().split('\n').filter(Boolean)) { const c = JSON.parse(l); if (String(c.change) === arg) { console.log(`change id=${c.change} by=${JSON.stringify(c.by)} note=${JSON.stringify(c.note ?? '')}`); for (const o of c.ops) console.log(JSON.stringify(o)); } } }
else if (cmd === 'print') {
  const st = load(); let change, raw = fs.readFileSync(arg, 'utf8'); const n = st.changes + 1; let err = null, wasm;
  try { try { change = JSON.parse(raw); } catch (e) { refuse('the change is not valid JSON: ' + e.message); } if (!Array.isArray(change.ops)) refuse("a change is {note, ops: [...]}"); wasm = apply(st, change, n); } catch (e) { if (!(e instanceof Refuse)) throw e; err = e.message; }
  fs.appendFileSync(P('attempts.jsonl'), JSON.stringify({ t: Date.now(), ok: !err, bytes: raw.length, ops: change?.ops?.length ?? 0, err }) + '\n');
  if (err) { console.log('REFUSED (nothing changed): ' + err); process.exit(1); }
  st.changes = n; fs.writeFileSync(P('state.json'), JSON.stringify(st)); fs.writeFileSync(P('module.wasm'), wasm);
  fs.appendFileSync(P('ledger.jsonl'), JSON.stringify({ change: n, note: change.note, by: change.by ?? null, ops: change.ops, module: hex(sha(wasm)), size: wasm.length, units: Object.fromEntries(st.funcs.filter(f => f.by === n).map(f => [f.name, f.hash])) }) + '\n');
  console.log(`change ${n} committed: module ${wasm.length} bytes; ` + st.funcs.filter(f => f.by === n).map(f => `${f.name}=${f.hash.slice(0, 8)}`).join(' '));
}
else if (cmd === 'items') { const st = load(); if (st.memory) console.log(`item kind=memory initial=${st.memory.initial} maximum=${st.memory.maximum} by=change:${st.memory.by}`); for (const g of st.globals) console.log(`item kind=global name=${g.name} type=${g.type} mutable=${g.mutable} init=${g.init} by=change:${g.by}`); for (const d of st.datas) console.log(`item kind=data name=${d.name} at=${d.at} size=${d.bytes.length / 2} by=change:${d.by}`); for (const f of st.funcs) console.log(`item kind=func name=${f.name} signature=(${f.params.join(',')})->(${f.results.join(',')}) hash=${f.hash.slice(0, 8)} size=${f.size} by=change:${f.by}`); for (const e of st.exports) console.log(`item kind=export name=${e.name} item=${e.item} by=change:${e.by}`); }
else if (cmd === 'unit') { const st = load(); const f = st.funcs.find(f => f.name === arg); if (!f) { console.log('no such function'); process.exit(1); } const pr = (n, t) => n.map((x, i) => x ? [x, t[i]] : t[i]); console.log(`unit name=${f.name} hash=${f.hash.slice(0, 8)} size=${f.size} by=change:${f.by} changes=[${f.history}]`); console.log(JSON.stringify({ params: pr(f.paramNames, f.params), results: f.results, locals: pr(f.localNames, f.locals) })); const fmt = (list, ind) => '[\n' + list.map(s => ind + ' ' + (s[0] === 'if' ? `["if", ${JSON.stringify(s[1])}, ${fmt(s[2], ind + ' ')}${s[3] ? ', ' + fmt(s[3], ind + ' ') : ''}]` : s[0] === 'while' ? `["while", ${JSON.stringify(s[1])}, ${fmt(s[2], ind + ' ')}]` : JSON.stringify(s))).join(',\n') + '\n' + ind + ']'; console.log(typeof f.body === 'string' ? f.body : fmt(f.body, '')); }
else if (cmd === 'history') { for (const l of fs.readFileSync(P('ledger.jsonl'), 'utf8').trim().split('\n').filter(Boolean)) { const c = JSON.parse(l); if (!arg || c.ops.some(o => o.name === arg)) console.log(`change id=${c.change} by=${JSON.stringify(c.by)} ops=${c.ops.length} touched=[${c.ops.map(o => o.name ?? o.op)}] note=${JSON.stringify(c.note ?? '')}`); } }
else if (cmd === 'test') runTests(arg, P('module.wasm'));
function runTests(arg, wasmPath) { const instantiate = () => new WebAssembly.Instance(new WebAssembly.Module(fs.readFileSync(wasmPath)), {});
  const tests = JSON.parse(fs.readFileSync(arg)); let pass = 0, fail = 0;
  for (const t of tests) { let msg = null; try { const x = instantiate().exports; t.steps.every((s, k) => { if (s.call) { if (typeof x[s.call] !== 'function') { msg = `step ${k}: no export '${s.call}'`; return false; } const r = x[s.call](...(s.args || [])); if ('expect' in s && r !== s.expect) { msg = `step ${k}: ${s.call}(${s.args || ''}) returned ${r}, expected ${s.expect}`; return false; } } if (s.text) { const got = Buffer.from(x.memory.buffer, s.text[0], s.text[1]).toString('latin1'); if (got !== s.expect) { msg = `step ${k}: memory text differs.\n--- got\n${got}--- expected\n${s.expect}`; return false; } } return true; }); } catch (e) { msg = 'trapped or failed: ' + e.message; }
    if (msg) { fail++; console.log(`FAIL ${t.name}: ${msg}`); } else pass++; }
  console.log(`${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
}
if (!['init','print','check','call','change','items','unit','history','test'].includes(cmd)) console.log('usage: printer.mjs init <dir> raw|folded|expr | print <dir> <change.json> | items <dir> | unit <dir> <name> | history <dir> [name] | test <dir> <tests.json>');
