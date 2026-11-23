// The kernel divided (spike/SPLIT.md, spike/tools/divide.mjs) against the kernel whole: the same questions asked of
// both, and the answers compared byte for byte; then the base with a component left out, which must still read,
// compose, edit and publish exactly as the whole kernel does, and say nothing where the component would have answered.
//   node spike/tools/divide.mjs && node spike/divided.mjs
import fs from 'fs'; import zlib from 'zlib'; import crypto from 'crypto'; import { start } from './binding/binding.mjs';
const root = new URL('../', import.meta.url), file = f => fs.readFileSync(new URL(f, root)), sha = b => crypto.createHash('sha256').update(b).digest('hex');
const V = JSON.parse(file('vectors/vectors.json')), D = 'spike/out/divided/', whole = file(D + 'whole.wasm'), base = file(D + 'base.wasm'), printer = file(D + 'printer.wasm'), agent = file(D + 'agent.wasm');
const measure = (piece, s) => ({ adv: [...s].length * piece.size * 0.5, asc: piece.size * 0.8, desc: piece.size * 0.2 }), clock = { time: () => 1767312000000, random: n => new Uint8Array(n).fill(7) };
const kernel = async (pack, components) => { const k = await start(components ? base : whole, measure, b => zlib.inflateRawSync(b), clock, components); if (!await k.open(new Uint8Array(file('vectors/' + pack)))) throw new Error('does not open: ' + pack); return k; };
const T = '71'.repeat(16);
// what the base must do by itself: read, compose, edit, publish
async function reads(components) { const out = {};
  for (const pack of ['compose.ufx', 'history.ufx', 'nested.ufx', 'timeline.ufx']) { const k = await kernel(pack, components); out[pack] = { text: k.sample({ as: 'text' })?.text ?? null, list: sha(JSON.stringify(k.sample({ as: 'list', w: 480 })?.list ?? null)), published: sha(k.published()), commits: k.commits === undefined ? null : undefined }; delete out[pack].commits; }
  const k = await kernel('compose.ufx', components), made = k.propose({ o: Uint8Array.from(Buffer.from(T, 'hex')), lo: 0, hi: 3, ins: 'An', who: 'Divided Test', time: 1767312000000, random: new Uint8Array(64).fill(9) });
  out.edit = { refused: made.refused ?? null, pack: sha(k.packBytes()), text: k.sample({ as: 'text' }).text.slice(0, 24) };
  return out; }
// what the components answer
async function asks(components) { const out = {};
  for (const [pack, qs] of [['compose.ufx', [{ name: 'expand' }, { name: 'expand', o: T }, { name: 'why', o: T, lo: 0, hi: 40 }, { name: 'object', o: T }, { name: 'text', o: T }, { name: 'history' }, { name: 'leaving', history: false }]],
      ['history.ufx', [{ name: 'why', o: V.history_pack.pinned.made_at_the_first_commit.object }, { name: 'history', full: true }]], ['timeline.ufx', [{ name: 'expand', o: V.timeline.clock, axis: 't', lo: 0, hi: 1411200000 }]]]) {
    const k = await kernel(pack, components); out[pack] = qs.map(q => k.project(q)); }
  const k = await kernel('module.ufx', components); out.printed = Buffer.from(k.print(Uint8Array.from(Buffer.from(V.printer.module, 'hex')))).toString('hex');
  return out; }
let ok = 0, bad = 0; const check = (what, a, b) => { if (JSON.stringify(a) === JSON.stringify(b)) { ok++; console.log('  agrees:', what); } else { bad++; console.log('  DIFFERS:', what, '\n    ', JSON.stringify(a).slice(0, 300), '\n    ', JSON.stringify(b).slice(0, 300)); } };
const W = { reads: await reads(null), asks: await asks(null) };
check('the printer of the whole kernel prints the vector', W.asks.printed, V.printer.printed_hex);
console.log('base, printer and agent:'); { const all = { printer, agent }; check('reading, composing, an edit, publishing', await reads(all), W.reads); check('every projection asked, and the module printed', await asks(all), W.asks); }
console.log('the base alone:'); { const none = {}; check('reading, composing, an edit, publishing', await reads(none), W.reads); const a = await asks(none);
  check('no text of any projection, and nothing printed', [Object.values(a).flat().every(x => x === null || x === ''), a.printed], [true, '']); }
console.log('the base and the agent, no printer:'); { const a = await asks({ agent }); check('the projections as the whole kernel gives them', [a['compose.ufx'], a['history.ufx'], a['timeline.ufx']], [W.asks['compose.ufx'], W.asks['history.ufx'], W.asks['timeline.ufx']]); check('nothing printed', a.printed, ''); }
console.log('the base and the printer, no agent:'); { const a = await asks({ printer }); check('the module printed as the vector has it', a.printed, V.printer.printed_hex); check('no text of any projection', a['compose.ufx'].every(x => x === null), true); }
console.log(bad ? `${bad} DIFFER` : `all ${ok} agree`); process.exit(bad ? 1 : 0);
