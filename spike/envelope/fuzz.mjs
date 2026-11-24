// A fuzzing pass over two things an outside implementation found this kernel wrong about (2026-11-24):
// every 64-bit offset and count a pack holds, and the names a described module may export.
//   node spike/envelope/fuzz.mjs        writes spike/out/fuzz-results.json; the last line says how many cases, and how many failed
// Offsets. Each eight-byte field of every head and index frame of several packs is given values that this machine's
// 32 bits cannot hold. The rule (SPEC 2.3, 2.4, P9): such a value lies outside the file, and is treated exactly as one
// just past the end of the file is; it is never narrowed to its low half. For a head, the check is made again, so
// that the field is the only thing wrong. So for each field: what the kernel makes of the pack with the large value
// must be what it makes of it with (length + 9) there. And for an index, which carries no authority: the same state
// and the same text as the pack untouched.
// Names. A module that exports any name beginning `ufo:` is not printed (EXECUTION N1); one whose names only resemble
// it is, and what is printed is a valid module with that export.
import fs from 'fs'; import zlib from 'zlib'; import crypto from 'crypto'; import { fileURLToPath } from 'url';
import { start } from '../binding/binding.mjs'; import { kernelWasm } from './parts.mjs'; import { Pack, ref } from './mkpack.mjs';
const here = p => fileURLToPath(new URL(p, import.meta.url)), wasm = kernelWasm();
const kernel = () => start(wasm, () => ({ adv: 0, asc: 0, desc: 0 }), b => zlib.inflateRawSync(b), { verify: false });
let cases = 0; const failed = [], fail = (what, detail) => { failed.push({ what, detail }); if (failed.length <= 12) console.log('FAILED:', what, '\n  ', JSON.stringify(detail).slice(0, 400)); };

// ---- offsets ----
// what the kernel makes of some bytes: whether they open, at which commit, the text, the history, and what `verify` reports besides
const made = async bytes => { const k = await kernel(); let opened = false; try { opened = await k.open(new Uint8Array(bytes)); } catch (e) { return { threw: String(e).slice(0, 120) }; }
  if (!opened) return { opened };
  const issues = (k.project({ name: 'verify' }) || '').split('\n').filter(l => l.startsWith('issue ')).map(l => /rule=(\S+)/.exec(l)[1]);
  return { opened, commit: k.commits()[0]?.commit ?? null, text: k.sample({ as: 'text' })?.text ?? null, history: k.project({ name: 'history', full: true }), issues }; };
const frames = b => { const out = []; let off = 8; while (off + 2 < b.length) { let n = 0, sh = 0, q = off + 2, x; do { x = b[q++]; n += (x & 0x7f) * 2 ** sh; sh += 7; } while (x & 0x80); if (q + n > b.length) break; out.push({ off, kind: b[off], start: q, len: n }); off = q + n; } return out; };
const u64 = n => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt.asUintN(64, BigInt(n))); return b; };
const fields = b => frames(b).flatMap(f => f.kind === 5 && f.len === 72 ? [32, 40, 48, 56].map((at, i) => ({ frame: f, at: f.start + at, what: `head at ${f.off}: ${['commit offset', 'index offset', 'previous head', 'end'][i]}` }))
  : f.kind === 4 && f.len >= 24 ? [...[0, 8, 16].map((at, i) => ({ frame: f, at: f.start + at, what: `index at ${f.off}: ${['count', 'previous index', 'coverage'][i]}` })),
    ...Array.from({ length: (f.len - 24) / 40 | 0 }, (_, i) => ({ frame: f, at: f.start + 24 + 40 * i + 32, what: `index at ${f.off}: offset of entry ${i}` }))] : []);
const patched = (b, field, value) => { const c = Buffer.from(b); u64(value).copy(c, field.at); if (field.frame.kind === 5) crypto.createHash('sha256').update(c.subarray(field.frame.start, field.frame.start + 64)).digest().copy(c, field.frame.start + 64, 0, 8); return c; };
let seed = 0x5eed; const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed; };
const perPack = {};
for (const name of ['minimal.ufx', 'compose.ufx', 'history.ufx', 'undone.ufx', 'table-edited.ufx', 'needs.ufx', 'module.ufx']) {
  const b = fs.readFileSync(here('../../vectors/' + name)), whole = await made(b), all = fields(b), offs = frames(b).map(f => f.off); let n = 0;
  if (!whole.opened) { fail(name + ' does not open untouched', whole); continue; }
  // every field of a small pack; of a larger one, every field of its heads and the first fields of its indexes, and a sample of the entries
  const chosen = all.length <= 120 ? all : all.filter((f, i) => f.frame.kind === 5 || !/entry/.test(f.what) || i % Math.ceil(all.length / 60) === 0);
  for (const field of chosen) {
    const t = b.readBigUInt64LE(field.at), past = await made(patched(b, field, b.length + 9));
    const large = [t + 2n ** 32n, t + 2n ** 33n, t + 2n ** 40n, 2n ** 32n + BigInt(offs[rnd() % offs.length]), 2n ** 63n + t, 2n ** 64n - 1n, (BigInt(rnd()) << 32n) + BigInt(rnd() % b.length), (BigInt((rnd() | 1) >>> 0) << 32n) + t];
    for (const v of large) { cases++; n++;
      const got = await made(patched(b, field, v)); if (JSON.stringify(got) !== JSON.stringify(past)) fail(`${name}, ${field.what}: ${t} written as ${v} is not treated as an offset outside the file`, { got: { ...got, text: got.text?.slice(0, 40), history: undefined }, past: { ...past, text: past.text?.slice(0, 40), history: undefined } }); }
    // an index carries no authority: whatever one of its fields says, the state and the text are those of the pack untouched
    if (field.frame.kind === 4) { cases++; n++; if (!(past.opened && past.commit === whole.commit && past.text === whole.text && past.history === whole.history)) fail(`${name}, ${field.what}: a wrong index changed what is read`, { past: { ...past, history: undefined }, whole: { ...whole, history: undefined } }); }
    // a head field that is wrong makes that head no head: the state is an earlier one, or the file does not open; never the same commit by another route
    if (field.frame.kind === 5 && field.frame.off === b.length - 75 && !/index offset/.test(field.what)) { cases++; n++; if (past.opened && past.commit === whole.commit) fail(`${name}, ${field.what}: the newest head is still taken though it is wrong`, past); }
  }
  perPack[name] = { fields: all.length, tried: chosen.length, cases: n };
}

// ---- names ----
const id = x => Buffer.alloc(16, x), U = Buffer.alloc(16), [MOD, FN, IMP, CH] = [0xe0, 0xad, 0xae, 0xd3].map(id);
const pub = { actor: { who: { name: 'UFO spike' }, with: { name: 'spike/envelope/fuzz.mjs', version: '0.0.0' } }, time: 1767225600000, origin: { basis: 'witnessed', by: 'tool', tool: { name: 'fuzz' }, asked: { name: 'UFO spike' } } };
const moduleOf = (exports, more = {}) => { const pk = new Pack('ufo-spike-fuzz-salt'), add = { name: 'add', params: [['a', 'i32'], ['b', 'i32']], results: ['i32'], locals: [], body: [['i32.add', 'a', 'b']] };
  const mod = { funcs: [ref(FN)], memory: { initial: 1, maximum: 1 }, globals: { g: { type: 'i32', mutable: true, init: 7 } }, exports, ...more.module };
  const objs = [[U, 'ufo.universe', { lineage: id(0x48), roots: { primary: ref(MOD) } }], [FN, 'ufo.func', add, { body: [[CH, 0, 1]] }], ...(more.objects || []), [MOD, 'ufo.module', mod]];
  const ops = objs.flatMap(([o, type, p]) => [{ op: 'new', obj: o, type }, ...Object.entries(p).map(([key, val]) => key === 'body' ? { op: 'splice', obj: o, key, after: null, ins: val } : { op: 'set', obj: o, key, val })]);
  pk.genesis(CH, objs, ops, pub); return pk.b; };
const printed = async bytes => { const k = await start(wasm, () => ({ adv: 0, asc: 0, desc: 0 }), b => zlib.inflateRawSync(b)); if (!await k.open(new Uint8Array(bytes))) return null; return Buffer.from(k.print(Uint8Array.from(MOD))); };
const RESERVED = ['ufo:fuel', 'ufo:memory', 'ufo:table', 'ufo:global:0', 'ufo:global:1', 'ufo:', 'ufo:x', 'ufo:host/1', 'ufo:fuel ', 'ufo::', 'ufo:é', 'ufo:FUEL'];
const ALLOWED = ['ufo', 'ufo_fuel', 'UFO:fuel', 'Ufo:fuel', 'xufo:fuel', ' ufo:fuel', 'fuel', 'u', 'ufo;fuel', 'ufo/fuel', 'uf:o', 'ｕfo:fuel', 'ufo​:fuel', 'add'];
const targets = { function: ref(FN), memory: 'memory', global: { global: 'g' } };
for (const [kind, target] of Object.entries(targets)) {
  for (const n of RESERVED) { cases++; const out = await printed(moduleOf({ add: ref(FN), [n]: target })); if (out === null || out.length) fail(`a ${kind} exported as ${JSON.stringify(n)} is printed`, out && out.toString('hex').slice(0, 80)); }
  for (const n of ALLOWED) { cases++; const out = await printed(moduleOf({ add: ref(FN), [n]: target })); let names = null; try { names = WebAssembly.Module.exports(new WebAssembly.Module(out)).map(e => e.name); } catch (e) { names = String(e).slice(0, 100); }
    if (!Array.isArray(names) || !names.includes(n) || names.some(x => x.startsWith('ufo:'))) fail(`a ${kind} exported as ${JSON.stringify(n)}: not printed as a valid module with that export`, names); }
}
// a function the host is to supply, under a reserved name or any other: this printer prints no import, so neither is printed; nothing is emitted for it
for (const n of ['ufo:fuel', 'ufo:x', 'log']) { cases++; const out = await printed(moduleOf({ add: ref(FN) }, { module: { funcs: [ref(FN), ref(IMP)] }, objects: [[IMP, 'ufo.func', { name: 'h', params: [], results: [], import: n }]] }));
  if (out === null || out.length) fail(`a module importing ${JSON.stringify(n)} is printed`, out && out.toString('hex').slice(0, 80)); }

fs.writeFileSync(here('../out/fuzz-results.json'), JSON.stringify({ cases, failed: failed.length, offsets: perPack, names: { refused: RESERVED, printed: ALLOWED, as: Object.keys(targets) }, failures: failed.slice(0, 50) }, null, 1) + '\n');
for (const [name, p] of Object.entries(perPack)) console.log(`${name}: ${p.fields} offset and count fields, ${p.tried} tried, ${p.cases} cases`);
console.log(`names: ${RESERVED.length} reserved and ${ALLOWED.length} allowed, each as a function, the memory and a global`);
console.log(`fuzz: ${cases} cases, ${failed.length} failed`); process.exit(failed.length ? 1 : 0);
