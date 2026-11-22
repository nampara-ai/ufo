// Throwaway spike printer, second design: code is description. A function body is a sequence of
// statements, each one tree in WebAssembly's own vocabulary; edits are splices of statements.
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
// ---------- statements: trees in WebAssembly's vocabulary ----------
const CONSTS = { 'i32.const': 0x41, 'i64.const': 0x42, 'f32.const': 0x43, 'f64.const': 0x44 };
function compileBody(f, fn, mod) {
  const labels = []; const out = [];
  f.body.forEach((el, i) => {
    const err = m => refuse(`${f.name} statement ${i}: ${m}`);
    const bt = at => at.result ? [VT[at.result] ?? err(`unknown result type '${at.result}'`)] : [0x40];
    const node = (n, top) => {
      if (typeof n === 'number') { if (!Number.isInteger(n) || n < -(2 ** 31) || n >= 2 ** 32) err(`a bare number is an i32 constant; ${n} is not one (use ["i64.const", n] or ["f64.const", x])`); return [0x41, ...sleb(BigInt.asIntN(32, BigInt(n)))]; }
      if (typeof n === 'string') { const k = fn.localNames.indexOf(n); if (k >= 0) return [0x20, ...uleb(k)]; if (mod.globals.find(g => g.name === n)) return [0x23, { ref: 'global', name: n }]; err(`no local or global named '${n}'`); }
      if (!Array.isArray(n) || typeof n[0] !== 'string') err(`expected an instruction, a name or a number, found ${JSON.stringify(n)}`);
      let [op, ...a] = n; let at = {}; if (a.length && a[a.length - 1] && typeof a[a.length - 1] === 'object' && !Array.isArray(a[a.length - 1])) at = a.pop();
      const kids = xs => xs.flatMap(x => node(x, false)); const stmtOnly = () => { if (!top) err(`'${op}' is a statement of its own, not an operand`); };
      const name = what => { const s = a.shift(); if (typeof s !== 'string') err(`'${op}' needs the name of a ${what} first`); return s; };
      if (op === 'block' || op === 'loop') { stmtOnly(); const l = typeof a[0] === 'string' ? a.shift() : (at.label ?? ''); if (a.length) err(`'${op}' takes a label and nothing else; its contents are the statements up to its "end"`); labels.push(l); return [op === 'block' ? 2 : 3, ...bt(at)]; }
      if (op === 'if') { stmtOnly(); const c = kids(a); labels.push(at.label ?? ''); return [...c, 4, ...bt(at)]; }
      if (op === 'else') { stmtOnly(); if (!labels.length) err(`'else' outside an 'if'`); return [5]; }
      if (op === 'end') { stmtOnly(); if (!labels.length) err(`'end' with nothing open`); labels.pop(); return [0x0b]; }
      if (op === 'br' || op === 'br_if') { const l = a.shift(); let d; if (typeof l === 'number') d = l; else { const k = labels.lastIndexOf(l); if (typeof l !== 'string' || k < 0) err(`no enclosing block or loop labelled ${JSON.stringify(l)}`); d = labels.length - 1 - k; } return [...kids(a), op === 'br' ? 0x0c : 0x0d, ...uleb(d)]; }
      if (CONSTS[op]) { const v = a[0]; if (typeof v !== 'number' || a.length !== 1) err(`'${op}' takes one number`); if (op === 'i32.const') return [0x41, ...sleb(BigInt.asIntN(32, BigInt(v)))]; if (op === 'i64.const') return [0x42, ...sleb(BigInt(v))]; const b = Buffer.alloc(op === 'f32.const' ? 4 : 8); op === 'f32.const' ? b.writeFloatLE(v) : b.writeDoubleLE(v); return [CONSTS[op], ...b]; }
      if (op === 'local.get' || op === 'local.set' || op === 'local.tee') { const s = name('local'); const k = fn.localNames.indexOf(s); if (k < 0) err(`no local named '${s}'`); return [...kids(a), { 'local.get': 0x20, 'local.set': 0x21, 'local.tee': 0x22 }[op], ...uleb(k)]; }
      if (op === 'global.get' || op === 'global.set') { const s = name('global'); if (!mod.globals.find(g => g.name === s)) err(`no global named '${s}'`); return [...kids(a), op === 'global.get' ? 0x23 : 0x24, { ref: 'global', name: s }]; }
      if (op === 'call') { const s = name('function'); if (!mod.funcs.find(g => g.name === s)) err(`no function named '${s}'`); return [...kids(a), 0x10, { ref: 'func', name: s }]; }
      if (op === 'memory.size') return [0x3f, 0]; if (op === 'memory.grow') return [...kids(a), 0x40, 0];
      if (MEM[op]) return [...kids(a), MEM[op][0], ...uleb(at.align ? Math.log2(at.align) : MEM[op][1]), ...uleb(at.offset ?? 0)];
      if (OP[op] !== undefined) return [...kids(a), OP[op]];
      err(`unknown instruction '${op}'`);
    };
    out.push(...node(el.s, true));
  });
  if (labels.length) refuse(`${f.name}: ${labels.length} block(s) left open; each "block", "loop" and "if" needs its own ["end"] statement`);
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
    const chunks = compileBody(f, fn, st);
    const runs = []; for (const t of f.locals) { if (runs.length && runs[runs.length - 1][1] === t) runs[runs.length - 1][0]++; else runs.push([1, t]); }
    const locals = [...uleb(runs.length), ...runs.flatMap(([n, t]) => [...uleb(n), VT[t]])];
    const bodyBytes = [...locals, ...flat(chunks, 'real'), 0x0b];
    code.push([...uleb(bodyBytes.length), ...bodyBytes]);
    f.hash = hex(sha(Buffer.from(JSON.stringify([f.params, f.paramNames, f.results, f.locals, f.localNames, f.body.map(e => e.s)])))); f.size = bodyBytes.length; f.instrBytes = bodyBytes.length - locals.length;
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
  let serial = 0; const el = s => ({ id: [n, serial++], s });
  change.ops.forEach((op, k) => {
    const where = `op ${k} (${op.op})`;
    const find = (kind, name) => st[kind].find(x => x.name === name);
    const pairs = (list, what) => { for (const p of list || []) if (!Array.isArray(p) || p.length !== 2) refuse(`${where}: ${what} are [name, type] pairs`); return { names: (list || []).map(p => p[0]), types: (list || []).map(p => p[1]) }; };
    const stmts = b => { if (!Array.isArray(b)) refuse(`${where}: a body is a list of statements`); return b.map(el); };
    const rev = f => { if (typeof op.rev !== 'string' || op.rev.length < 8 || !f.hash.startsWith(op.rev)) refuse(`${where}: rev ${op.rev} is not the current revision of '${f.name}' (${f.hash.slice(0, 8)}); read it again with 'unit'`); };
    if (op.op === 'memory.set') st.memory = { initial: op.initial, maximum: op.maximum, by: n };
    else if (op.op === 'global.add') { if (find('globals', op.name)) refuse(`${where}: global '${op.name}' exists`); st.globals.push({ key: mint(k), name: op.name, type: op.type, mutable: !!op.mutable, init: op.init ?? 0, by: n }); }
    else if (op.op === 'global.set') { const g = find('globals', op.name) ?? refuse(`${where}: no global '${op.name}'`); g.init = op.init; g.by = n; }
    else if (op.op === 'data.set') { let d = find('datas', op.name); if (!d) { d = { key: mint(k), name: op.name }; st.datas.push(d); } d.at = op.at; d.bytes = op.text !== undefined ? hex(Buffer.from(op.text)) : op.bytes; d.by = n; }
    else if (op.op === 'func.add') { if (find('funcs', op.name)) refuse(`${where}: function '${op.name}' exists; use func.edit`); const p = pairs(op.params, 'params'), l = pairs(op.locals, 'locals'); st.funcs.push({ key: mint(k), name: op.name, params: p.types, paramNames: p.names, locals: l.types, localNames: l.names, results: op.results || [], body: stmts(op.body), by: n, history: [n] }); }
    else if (op.op === 'func.edit') { const f = find('funcs', op.name) ?? refuse(`${where}: no function '${op.name}'`); rev(f);
      const edits = (op.edits ?? [{ at: op.at, del: op.del, ins: op.ins }]).map(e => ({ at: e.at, del: e.del ?? 0, ins: e.ins ?? [] }));
      if (op.edits === undefined && op.at === undefined && !op.locals) refuse(`${where}: give "at" (and "del", "ins"), or "edits", or "locals"`);
      const real = (op.edits === undefined && op.at === undefined) ? [] : edits;
      for (const e of real) { if (!Number.isInteger(e.at) || !Number.isInteger(e.del) || e.at < 0 || e.del < 0 || e.at + e.del > f.body.length) refuse(`${where}: at ${e.at} del ${e.del} is outside '${f.name}', which has statements 0 to ${f.body.length - 1}`); if (!Array.isArray(e.ins)) refuse(`${where}: "ins" is a list of statements`); }
      const sorted = [...real].sort((a, b) => a.at - b.at); for (let i = 1; i < sorted.length; i++) if (sorted[i - 1].at + sorted[i - 1].del > sorted[i].at) refuse(`${where}: two edits overlap at statement ${sorted[i].at}`);
      op.edits = real.map(e => ({ at: e.at, del: e.del, old: f.body.slice(e.at, e.at + e.del).map(x => x.s), ins: e.ins })); delete op.at; delete op.del; delete op.ins;   // the record states what was there
      for (const e of sorted.reverse()) f.body.splice(e.at, e.del, ...e.ins.map(el));   // every position refers to the body as it was read
      if (op.locals) { const l = pairs(op.locals, 'locals'); f.locals = l.types; f.localNames = l.names; }
      f.by = n; f.history.push(n); }
    else if (op.op === 'func.remove') { const f = find('funcs', op.name) ?? refuse(`${where}: no function '${op.name}'`); rev(f); st.funcs.splice(st.funcs.indexOf(f), 1); st.exports = st.exports.filter(e => e.item !== op.name); }
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
if (cmd === 'init') { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(P('state.json'), JSON.stringify({ level: 'stmt', memory: null, globals: [], funcs: [], datas: [], exports: [], changes: 0 })); fs.writeFileSync(P('ledger.jsonl'), ''); fs.writeFileSync(P('attempts.jsonl'), ''); console.log('empty module'); }
else if (cmd === 'check') { const st = load(); try { let change; try { change = JSON.parse(fs.readFileSync(arg, 'utf8')); } catch (e) { refuse('the change is not valid JSON: ' + e.message); } const wasm = apply(st, change, st.changes + 1); const x = new WebAssembly.Instance(new WebAssembly.Module(wasm), {}).exports; console.log(`would be committed: module ${wasm.length} bytes (nothing changed)`); const tf = process.argv[5]; if (tf) { fs.writeFileSync(P('candidate.wasm'), wasm); runTests(tf, P('candidate.wasm')); } } catch (e) { if (!(e instanceof Refuse)) throw e; console.log('WOULD BE REFUSED: ' + e.message); process.exit(1); } }
else if (cmd === 'call') { const x = instantiate().exports; for (const c of arg.split(';').map(s => s.trim()).filter(Boolean)) { const m = c.match(/^(\w+)\((.*)\)$/); if (!m) { console.log(`cannot read '${c}'`); continue; } if (m[1] === 'text') { const [p, n] = m[2].split(',').map(Number); console.log(Buffer.from(x.memory.buffer, p, n).toString('latin1')); continue; } if (typeof x[m[1]] !== 'function') { console.log(`no export '${m[1]}'`); continue; } try { console.log(`${c} -> ${x[m[1]](...m[2].split(',').filter(s => s.trim()).map(Number))}`); } catch (e) { console.log(`${c} trapped: ${e.message}`); } } }
else if (cmd === 'change') { for (const l of fs.readFileSync(P('ledger.jsonl'), 'utf8').trim().split('\n').filter(Boolean)) { const c = JSON.parse(l); if (String(c.change) === arg) { console.log(`change id=${c.change} by=${JSON.stringify(c.by)} note=${JSON.stringify(c.note ?? '')}`); for (const o of c.ops) { if (o.op === 'func.edit') { console.log(`func.edit ${o.name} rev=${o.rev}${o.locals ? ' locals=' + JSON.stringify(o.locals) : ''}`); for (const e of o.edits) { e.old.forEach((s, i) => console.log(`  @${e.at + i} - ${JSON.stringify(s)}`)); e.ins.forEach(s => console.log(`  @${e.at} + ${JSON.stringify(s)}`)); } } else if (o.op === 'func.add') { console.log(`func.add ${o.name} params=${JSON.stringify(o.params || [])} results=${JSON.stringify(o.results || [])} locals=${JSON.stringify(o.locals || [])}`); o.body.forEach(s => console.log(`  + ${JSON.stringify(s)}`)); } else console.log(JSON.stringify(o)); } } } }
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
else if (cmd === 'unit') { const st = load(); const f = st.funcs.find(f => f.name === arg); if (!f) { console.log('no such function'); process.exit(1); } const pr = (n, t) => n.map((x, i) => [x, t[i]]); console.log(`unit name=${f.name} rev=${f.hash.slice(0, 8)} statements=${f.body.length} size=${f.size} changes=[${f.history}]`); console.log(`params=${JSON.stringify(pr(f.paramNames, f.params))} results=${JSON.stringify(f.results)} locals=${JSON.stringify(pr(f.localNames, f.locals))}`); let d = 0; f.body.forEach((e, i) => { const op = Array.isArray(e.s) ? e.s[0] : ''; if (op === 'end' || op === 'else') d--; console.log(`${String(i).padStart(3)} c${e.id[0]} ${'  '.repeat(Math.max(d, 0))}${JSON.stringify(e.s)}`); if (['block', 'loop', 'if', 'else'].includes(op)) d++; }); }
else if (cmd === 'history') { for (const l of fs.readFileSync(P('ledger.jsonl'), 'utf8').trim().split('\n').filter(Boolean)) { const c = JSON.parse(l); if (!arg || c.ops.some(o => o.name === arg)) console.log(`change id=${c.change} by=${JSON.stringify(c.by)} ops=${c.ops.length} touched=[${c.ops.map(o => o.name ?? o.op)}] note=${JSON.stringify(c.note ?? '')}`); } }
else if (cmd === 'test') runTests(arg, P('module.wasm'));
function runTests(arg, wasmPath) { const instantiate = () => new WebAssembly.Instance(new WebAssembly.Module(fs.readFileSync(wasmPath)), {});
  const tests = JSON.parse(fs.readFileSync(arg)); let pass = 0, fail = 0;
  for (const t of tests) { let msg = null; try { const x = instantiate().exports; t.steps.every((s, k) => { if (s.call) { if (typeof x[s.call] !== 'function') { msg = `step ${k}: no export '${s.call}'`; return false; } const r = x[s.call](...(s.args || [])); if ('expect' in s && r !== s.expect) { msg = `step ${k}: ${s.call}(${s.args || ''}) returned ${r}, expected ${s.expect}`; return false; } } if (s.text) { const got = Buffer.from(x.memory.buffer, s.text[0], s.text[1]).toString('latin1'); if (got !== s.expect) { msg = `step ${k}: memory text differs.\n--- got\n${got}--- expected\n${s.expect}`; return false; } } return true; }); } catch (e) { msg = 'trapped or failed: ' + e.message; }
    if (msg) { fail++; console.log(`FAIL ${t.name}: ${msg}`); } else pass++; }
  console.log(`${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
}
if (!['init','print','check','call','change','items','unit','history','test'].includes(cmd)) console.log('usage: printer.mjs init <dir> | print <dir> <change.json> | items <dir> | unit <dir> <name> | history <dir> [name] | test <dir> <tests.json>');
