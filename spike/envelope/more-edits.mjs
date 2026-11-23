// Envelope spike: more edits than roundtrip.mjs makes, one after another on compose.ufx, each checked
// against a model kept here; the result is spike/out/edited-many.ufx, for an independent reader to replay.
// Run from the repository root: node spike/envelope/more-edits.mjs
import fs from 'fs'; import zlib from 'zlib'; import assert from 'assert'; import { start } from '../binding/binding.mjs';
const root = new URL('../../', import.meta.url);
const wasm = fs.readFileSync(new URL('spike/kernel/target/wasm32-unknown-unknown/release/ufo_spike_kernel.wasm', root));
const measure = (piece, s) => ({ adv: [...s].length * piece.size * 0.5, asc: 0.8 * piece.size, desc: 0.2 * piece.size });
const kernel = () => start(wasm, measure, b => zlib.inflateRawSync(b));
const hex = b => Buffer.from(b).toString('hex'), T = '71'.repeat(16), o = Uint8Array.from(Buffer.from(T, 'hex'));
const k = await kernel(); assert(await k.open(new Uint8Array(fs.readFileSync(new URL('vectors/compose.ufx', root)))));
const chars = () => { const s = k.project({ name: 'text', o: T }).split('\n')[1]; return [...JSON.parse(s.slice(s.indexOf(' s=') + 3))]; };
const spans = () => k.project({ name: 'object', o: T }).split('\n').filter(l => l.startsWith('prop key=spans'))[0];
const block = at => { const rows = k.sample({ as: 'rows', w: 480 }).detail; for (const r of rows) for (const [kind, i] of r.items) if (kind === 'text' && i.src) { const b = k.blockAt(i.src); if (b.lo <= at && at < b.hi) return b; } };
let n = 0, model = chars();
const edit = (what, lo, hi, ins, check) => {
  n++; const random = Uint8Array.from({ length: 64 }, (_, i) => (i * 29 + 101 * n) & 255);
  const r = k.propose({ o, lo, hi, ins, who: 'Reader Test', time: 1767312000000 + n * 60000, random });
  assert(!r.refused, what + ': ' + r.refused);
  model = [...model.slice(0, lo), ...ins, ...model.slice(hi)];
  assert.deepStrictEqual(chars(), model, what);
  const why = k.project({ name: 'why', o: T, lo, hi: lo + [...ins].length });
  // only the difference is written (L1): what `why` gives the new change is exactly what the operations inserted, and never more than `ins`
  const mine = why.split('\n').filter(l => l.startsWith('run ') && l.includes('change=o:' + hex(r.change).slice(0, 8))).map(l => /chars=\[(\d+),(\d+)\]/.exec(l)).reduce((n, m) => n + (m[2] - m[1]), 0);
  const put = r.ops.filter(o => o.op === 'splice').reduce((n, o) => n + [...(o.ins || '')].length, 0), took = r.ops.filter(o => o.op === 'splice').reduce((n, o) => n + [...(o.old || '')].length, 0);
  assert(mine === put && put <= [...ins].length && took <= hi - lo && [...ins].length - put === hi - lo - took, what + ': why');
  if (check) check(r);
  console.log('ok', (what + ':').padEnd(64), 'commit', hex(r.commit).slice(0, 12), 'pack', k.packBytes().length);
};
const b12 = block(model.join('').indexOf('Nothing here is a forecast.'));
edit('the first sentence of a block of two', b12.lo, b12.lo + 'Nothing here is a forecast.'.length, 'None of this is a prediction.', () => { const b = block(b12.lo); assert.strictEqual(b.key, b12.key); assert(b.text.startsWith('None of this is a prediction. The next section')); });
assert(spans().includes('"i0"'));
edit('every character of an inline span (5.1: the span goes too)', 36, 48, '', () => assert(!spans().includes('"i0"') && spans().includes('"i1"')));
edit('part of an inline span', 55, 60, 'ab', () => assert(spans().includes('"i1"')));
edit('an insertion at the very start', 0, 0, '» ');
edit('an insertion at the very end', model.length, model.length, ' (End.)');
edit('a removal with nothing put', model.length - 7, model.length, '');
const b3 = block(model.join('').indexOf('First point')), b4 = block(model.join('').indexOf('Second point'));
edit('a replacement across the boundary of two blocks', b3.hi - 6, b4.lo + 6, '— AND —', () => { assert.strictEqual(block(b3.lo).key, b3.key); });
let long = ''; for (let i = 0, x = 7; long.length < 9000; i++) { x = (x * 1103515245 + 12345) >>> 0; long += 'lorem ipsum dolor sit amet '.split(' ')[x % 5] + (x % 11 ? ' ' : '. '); }
edit('a long insertion: `chars`, `seq` or `work` outgrow one chunk or the node', 100, 100, long);
edit('an edit of a text now kept outside its node', 110, 130, 'short again');
edit('an edit inside what an earlier edit inserted', 3, 3, 'x');
edit('the removal of what three changes inserted', 0, 6, '');
const refused = k.propose({ o, lo: 0, hi: model.length + 1, ins: 'x', who: 'Reader Test', time: 0, random: new Uint8Array(64) }); assert(refused.refused);
const saved = k.packBytes(); fs.writeFileSync(new URL('spike/out/edited-many.ufx', root), saved);
const k2 = await kernel(); assert(await k2.open(saved));
assert.strictEqual(k2.commits().length, n + 1); assert.strictEqual(k2.sample({ as: 'text' }).text, k.sample({ as: 'text' }).text);
assert.strictEqual(k2.layers().lacks.history, false);
console.log(n, 'edits; spike/out/edited-many.ufx', saved.length, 'bytes; reopened in a fresh kernel with', k2.commits().length, 'commits and the same text');
console.log(k2.project({ name: 'history', o: T }));
