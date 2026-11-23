// Writes a web envelope (SPEC-TRAVEL 13.2): one HTML file holding a pack, the kernel and the binding. The tools universe travels in
// the pack: if the pack's universe names none under `components.tools`, the one in tools.ufx is nested in it first, by a change
// through the kernel's gate (parts.mjs, `withTools`), unless --bare.
// Throwaway spike. The file is `envelope(parts)`, computed by the kernel (spike/kernel/src/envelope.rs): the same
// function the page uses when it saves itself. Usage, from anywhere:
//   node spike/envelope/make.mjs <pack.ufx> <out.ufx.html> [--title T] [--tools tools.ufx] [--bare] [--date YYYY-MM-DD] [--sizes] [--pack out.ufx]
// Build the kernel first (spike/README.md); this runs wasm-opt on it with the flags of SIZE-NOTES.md, and terser on host.mjs.
import fs from 'fs'; import zlib from 'zlib'; import { start } from '../binding/binding.mjs'; import { fixedParts, kernelWasm, withTools } from './parts.mjs';
const args = process.argv.slice(2), flag = n => { const i = args.indexOf('--' + n); return i < 0 ? null : args.splice(i, 2)[1]; }, has = n => { const i = args.indexOf('--' + n); return i >= 0 && !!args.splice(i, 1); };
const title0 = flag('title'), toolsPath = flag('tools'), date = flag('date') || new Date().toISOString().slice(0, 10), sizes = has('sizes'), bare = has('bare'), packOut = flag('pack');
const [packPath, outPath] = args; if (!outPath) { console.error('usage: make.mjs <pack> <out.ufx.html> [--title T] [--tools tools.ufx] [--bare] [--date YYYY-MM-DD] [--pack out.ufx]'); process.exit(2); }
const open = async pack => { const k = await start(kernelWasm(), (piece, s) => ({ adv: [...s].length * piece.size / 2, asc: piece.size * 0.8, desc: piece.size * 0.2 }), b => zlib.inflateRawSync(b)); if (!await k.open(pack)) throw Error('the pack does not open'); return k; };
let pack = new Uint8Array(fs.readFileSync(packPath)), k = await open(pack);
const carries = /^component role=tools /m.test(k.project({ name: 'expand' }));
if (!bare && !carries) { pack = await withTools(pack, { time: Date.parse(date), ...(toolsPath ? { tools: fs.readFileSync(toolsPath) } : {}) }); k = await open(pack); }
if (packOut) fs.writeFileSync(packOut, pack);
// the static face: the nodes of the primary face as markup, from the kernel. The title, unless given: the first line of the plain-text face
const text = k.sample({ as: 'text' }).text.replace(/^\n+/, '');
const parts = { ...fixedParts(pack, { title: title0 || text.split('\n').find(l => l.trim()) || 'Untitled' }), 'static-html': k.sample({ as: 'static' }).html, date };
const made = k.envelope(parts); if (made.refused) throw Error('no envelope: ' + made.refused);
fs.writeFileSync(outPath, made.text);
const n = s => Buffer.byteLength(s), report = { file: outPath, total: n(made.text), gzip: zlib.gzipSync(made.text, { level: 9 }).length, pack: pack.length, parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, n(v)])) };
report.fixed = report.total - Object.values(report.parts).reduce((a, b) => a + b, 0) - report.parts.title;   // the title is put in twice, the skeleton's gaps are filled
if (sizes) console.log(JSON.stringify(report, null, 1)); else console.log(`${outPath}: ${report.total} bytes (kernel ${report.parts.kernel}, pack ${report.parts.pack}, script ${report.parts.script}, skeleton ${report.parts.skeleton})`);
