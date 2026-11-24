// Divides the kernel, built whole, into a base and its components (spike/SPLIT.md), with Binaryen's wasm-split:
// the base keeps its memory, its table and its own functions; a component is a module that imports those and holds
// only the functions that nothing but its own entries reach. Then measures each, optimised and compressed as size.mjs
// does it, and says whether two clean divisions give the same bytes.
//   node spike/tools/divide.mjs [--out dir]        BINARYEN=<dir of the pinned release, with bin/wasm-split>
import fs from 'fs'; import os from 'os'; import path from 'path'; import zlib from 'zlib'; import crypto from 'crypto'; import { execFileSync } from 'child_process'; import { fileURLToPath } from 'url';
const here = fileURLToPath(new URL('.', import.meta.url)), kernel = path.join(here, '../kernel'), home = process.env.HOME;
const BIN = (process.env.BINARYEN || home + '/binaryen-132') + '/bin/', FEATURES = ['--enable-bulk-memory', '--enable-sign-ext', '--enable-nontrapping-float-to-int', '--enable-mutable-globals'];
const env = { ...process.env, PATH: home + '/.cargo/bin:' + process.env.PATH, CARGO_PROFILE_RELEASE_STRIP: 'debuginfo' };   // the names are kept until the division is made
// the entries of each component: the functions the base calls it by. Everything only they reach goes with them
export const COMPONENTS = { printer: [/ufo_spike_kernel5print5print$/], agent: [/7project(4text|6object|11expand_text|12expand_clock|7spelled)$/],
  formulas: [/ufo_spike_kernel4tool(6handle|6number|6by_ref)$/, /ufo_spike_kernel6layout9data_rows$/, /ufo_spike_kernel5write(6submit|6stated)$/] };
const sha = b => crypto.createHash('sha256').update(b).digest('hex'), deflated = b => zlib.deflateRawSync(b, { level: 9 }).length;
// Writes the module again with each function named by a short name of its index, and nothing else named. The division
// exports and imports functions by name, so the compiler's long names would be carried in every module.
function shortNames(from, to) {
  const b = fs.readFileSync(from), out = [b.subarray(0, 8)], long = new Map(); let p = 8;
  const leb = () => { let r = 0, s = 0, x; do { x = b[p++]; r += (x & 127) * 2 ** s; s += 7; } while (x & 128); return r; };
  const enc = n => { const o = []; do { o.push(n & 127 | (n > 127 ? 128 : 0)); n = Math.floor(n / 128); } while (n); return Buffer.from(o); };
  const str = t => { const x = Buffer.from(t); return Buffer.concat([enc(x.length), x]); };
  while (p < b.length) {
    const start = p, id = b[p++], n = leb(), end = p + n;
    if (id !== 0) { out.push(b.subarray(start, end)); p = end; continue; }
    const len = leb(), name = b.subarray(p, p + len).toString(); p += len;
    if (name === 'name') { const subs = [];
      while (p < end) { const sub = b[p++], sn = leb(), se = p + sn;
        if (sub === 1) { const ents = []; for (let c = leb(); c > 0; c--) { const i = leb(), l = leb(), short = 'f' + i.toString(36); long.set(short, b.subarray(p, p + l).toString()); p += l; ents.push(Buffer.concat([enc(i), str(short)])); }
          const body = Buffer.concat([enc(ents.length), ...ents]); subs.push(Buffer.concat([Buffer.from([1]), enc(body.length), body])); }
        p = se; }
      const payload = Buffer.concat([str('name'), ...subs]); out.push(Buffer.concat([Buffer.from([0]), enc(payload.length), payload])); }
    p = end;   // every other custom section is left out
  }
  fs.writeFileSync(to, Buffer.concat(out)); return long;
}
export function divide(dir, target = 'divide') {
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('cargo', ['build', '--release', '--locked', '--target', 'wasm32-unknown-unknown', '--target-dir', path.join(kernel, 'target', target)], { cwd: kernel, env, stdio: ['ignore', 'ignore', 'pipe'] });
  const cargo = path.join(kernel, 'target', target, 'wasm32-unknown-unknown/release/ufo_spike_kernel.wasm'), built = path.join(dir, 'named.wasm'), wat = path.join(dir, 'whole.wat');
  const long = shortNames(cargo, built);   // short name -> the compiler's name
  execFileSync(BIN + 'wasm-dis', [...FEATURES, built, '-o', wat]);
  // the call graph, from the text: who calls whom; what the table holds; what is exported
  const calls = new Map(), kept = new Set(); let cur = null;
  for (const line of fs.readFileSync(wat, 'utf8').split('\n')) {
    const f = /^ \(func \$(\S+)/.exec(line); if (f) { cur = f[1].replace(/\)$/, ''); calls.set(cur, new Set()); }
    if (/^ \((elem|export|start)/.test(line)) { cur = null; for (const m of line.matchAll(/\$([^\s()]+)/g)) kept.add(m[1]); }
    if (cur) for (const m of line.matchAll(/\((?:call|return_call|ref\.func) \$([^\s()]+)/g)) calls.get(cur).add(m[1]);
  }
  const names = [...calls.keys()], entries = Object.fromEntries(Object.entries(COMPONENTS).map(([c, pats]) => [c, names.filter(n => pats.some(p => p.test(long.get(n) || n)))]));
  for (const [c, e] of Object.entries(entries)) if (!e.length) throw new Error('no entry found for ' + c);
  const all = new Set(Object.values(entries).flat());
  const reach = (from, stop) => { const seen = new Set(), todo = [...from]; while (todo.length) { const n = todo.pop(); if (seen.has(n) || !calls.has(n)) continue; seen.add(n); if (!stop.has(n) || from.includes(n)) for (const m of calls.get(n)) todo.push(m); } return seen; };
  const base = reach([...kept].filter(n => !all.has(n)), all); for (const e of all) base.delete(e);
  const members = {}, taken = new Set();
  for (const [c, e] of Object.entries(entries)) { const others = new Set([...all].filter(n => !e.includes(n))); members[c] = [...reach(e, others)].filter(n => !base.has(n) && !others.has(n)); }
  // what two components both reach, and the base does not, stays in the base: decided for all of them before any list is changed
  const shared = new Set(Object.keys(members).flatMap(c => members[c].filter(n => !entries[c].includes(n) && Object.keys(members).some(d => d !== c && members[d].includes(n)))));
  for (const c of Object.keys(members)) { members[c] = members[c].filter(n => !shared.has(n)); for (const n of members[c]) taken.add(n); }
  const manifest = path.join(dir, 'manifest.txt'); fs.writeFileSync(manifest, Object.entries(members).map(([c, fns]) => [c, ...fns.sort()].join('\n')).join('\n\n') + '\n');
  execFileSync(BIN + 'wasm-split', ['--multi-split', ...FEATURES, '-g', '--no-placeholders', '--import-namespace=ufo:base', '--manifest', manifest, '--out-prefix', dir + '/raw-', built, '-o', path.join(dir, 'raw-base.wasm')], { stdio: ['ignore', 'pipe', 'pipe'] });
  const out = { functions: { whole: names.length, ...Object.fromEntries(Object.entries(members).map(([c, m]) => [c, m.length])) } };
  execFileSync(BIN + 'wasm-opt', ['-Oz', ...FEATURES, built, '-o', path.join(dir, 'whole.wasm')]);
  for (const m of ['base', ...Object.keys(members)]) execFileSync(BIN + 'wasm-opt', ['-Oz', ...FEATURES, path.join(dir, `raw-${m}.wasm`), '-o', path.join(dir, m + '.wasm')]);
  for (const m of ['whole', 'base', ...Object.keys(members)]) { const b = fs.readFileSync(path.join(dir, m + '.wasm')); out[m] = { bytes: b.length, deflate: deflated(b), sha256: sha(b) }; }
  return out;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = process.argv.indexOf('--out'), dir = arg > 0 ? process.argv[arg + 1] : path.join(here, '../out/divided');
  const a = divide(dir), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ufo-divide-')), b = divide(path.join(tmp, 'again'), 'divide-again');
  console.log('functions:', JSON.stringify(a.functions));
  console.log(''.padEnd(10), 'optimised'.padStart(10), 'deflate'.padStart(9), 'KiB'.padStart(7), ' sha256');
  for (const m of ['whole', 'base', ...Object.keys(COMPONENTS)]) console.log(m.padEnd(10), String(a[m].bytes).padStart(10), String(a[m].deflate).padStart(9), (a[m].deflate / 1024).toFixed(1).padStart(7), ' ' + a[m].sha256.slice(0, 16), a[m].sha256 === b[m].sha256 ? 'the same from a second clean division' : 'DIFFERS from a second division');
  const parts = ['base', ...Object.keys(COMPONENTS)].reduce((n, m) => n + a[m].deflate, 0);
  console.log('the parts together', parts, 'against the whole', a.whole.deflate, ': the division costs', parts - a.whole.deflate);
  fs.writeFileSync(path.join(here, '../out/divided.json'), JSON.stringify(a, null, 1)); process.exit(['whole', 'base', ...Object.keys(COMPONENTS)].every(m => a[m].sha256 === b[m].sha256) ? 0 : 1);
}
