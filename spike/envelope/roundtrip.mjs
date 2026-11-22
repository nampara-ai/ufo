// Envelope spike, the kernel's part alone, in Node: tools pressed, one paragraph edited through the
// gate, the pack saved, reopened in a fresh kernel, and an edit that must be refused.
// Build the kernel first (spike/README.md). Run from the repository root: node spike/envelope/roundtrip.mjs
import fs from 'fs'; import zlib from 'zlib'; import assert from 'assert'; import { start } from '../binding/binding.mjs';
const root = new URL('../../', import.meta.url);
const wasm = fs.readFileSync(new URL('spike/kernel/target/wasm32-unknown-unknown/release/ufo_spike_kernel.wasm', root));
const file = f => new Uint8Array(fs.readFileSync(new URL(f, root)));
// the synthetic host of compose-vectors.mjs: every character as wide as every other
const measure = (piece, s) => ({ adv: [...s].length * piece.size * (piece.font.includes('monospace') ? 0.6 : piece.weight >= 700 ? 0.55 : 0.5), asc: 0.8 * piece.size, desc: 0.2 * piece.size });
const kernel = () => start(wasm, measure, b => zlib.inflateRawSync(b));
const hex = b => Buffer.from(b).toString('hex');
const texts = rows => rows.map(r => r.items.filter(i => i[0] === 'text').map(i => i[1]));
const say = (...a) => console.log(...a);

const k = await kernel();
assert(await k.open(file('vectors/compose.ufx')), 'compose.ufx opens');
assert(k.openTools(file('vectors/tools.ufx')), 'tools.ufx opens');
const head0 = k.query({ q: 'commits' })[0];
say('opened compose.ufx: head', head0.commit.slice(0, 16), 'height', head0.height, '; pack', k.packBytes().length, 'bytes');

// ---- the tools universe, sampled and pressed ----
const tools = texts(k.sample({ of: 'tools', as: 'rows', w: 480 }).detail).flat();
say('\ntools universe, as composed:');
for (const it of tools) say('  ', JSON.stringify(it.s).padEnd(12), it.press ? 'press: ' + it.press : '(nothing to press)');
const key = word => tools.find(it => it.s.trim() === word).press;
for (const word of ['Edit', 'Save']) say('press', word, '(span ' + key(word) + ') ->', JSON.stringify(k.press(key(word))));
assert.deepStrictEqual(k.press(key('Edit')), { set: 'editing', to: true }); assert.deepStrictEqual(k.press(key('Save')), { act: 'export' });
assert.strictEqual(k.press('p2'), null, 'a span key of the working universe presses nothing');
assert(texts(k.sample({ as: 'rows', w: 480 }).detail).flat().every(it => !('press' in it)), 'nothing in the working universe carries press');

// ---- the second paragraph: an item of it, its block, its first sentence replaced ----
const rows = k.sample({ as: 'rows', w: 480 }).detail, plain0 = k.sample({ as: 'text' }).text;
// (compose.ufx: a heading, a paragraph, list items, a quote, code, a heading, then the second paragraph, which begins "Every figure")
const paragraph = [...new Set(rows.map(r => r.block))].map(b => rows.filter(r => r.block === b)).filter(rs => texts(rs).flat().map(i => i.s).join('').startsWith('Every figure'))[0];
const item = texts(paragraph)[0][0];
const block = k.blockAt(item.src);
say('\nitem', JSON.stringify(item.s), '\nblock_at ->', JSON.stringify({ ...block, o: hex(block.o) }));
const first = block.text.indexOf('. ') >= 0 ? block.text.slice(0, block.text.indexOf('. ') + 1) : block.text;
const sentence = 'Each number below was read from the ledger on the last day of the quarter.';
const time = 1767312000000, random = Uint8Array.from({ length: 64 }, (_, i) => (i * 37 + 11) & 255);
const edit = { o: block.o, lo: block.lo, hi: block.lo + [...first].length, ins: sentence, who: 'Reader Test', time, random };

// ---- an edit that must be refused: nothing is written ----
const before = k.packBytes();
const bad = k.propose({ ...edit, lo: 100000, hi: 100001 });
say('\nout of range ->', JSON.stringify(bad));
assert(bad.refused && !bad.commit); assert.deepStrictEqual(k.packBytes(), before, 'the pack is byte for byte as it was');
assert.strictEqual(k.query({ q: 'commits' })[0].commit, head0.commit);
say('  pack length unchanged:', before.length, '; head unchanged');

// ---- the edit ----
say('\npropose: replace', JSON.stringify(first), '\n        with   ', JSON.stringify(sentence));
const done = k.propose(edit);
assert(!done.refused, 'refused: ' + done.refused);
say('->', JSON.stringify({ commit: hex(done.commit), change: hex(done.change), root: hex(done.root) }));
assert.strictEqual(done.commit.length, 32); assert.deepStrictEqual(done.change, random.slice(0, 16)); assert.deepStrictEqual(done.root, done.commit);
const commits = k.query({ q: 'commits' });
assert.strictEqual(commits[0].commit, hex(done.commit)); assert.strictEqual(commits[0].height, head0.height + 1); assert.strictEqual(commits[1].commit, head0.commit);
say('commits now:', commits.map(c => c.commit.slice(0, 16) + ' height ' + c.height).join(' <- '));

const rows2 = k.sample({ as: 'rows', w: 480 }).detail, plain = k.sample({ as: 'text' }).text;
const shown = texts(rows2).flat().map(i => i.s).join('');
assert(shown.includes(sentence) && !shown.includes(first)); assert(plain.includes(sentence) && !plain.includes(first));
const block2 = k.blockAt(texts(rows2).flat().find(i => i.src && i.s.trim() && sentence.startsWith(i.s.trim())).src);
assert.strictEqual(block2.key, block.key, 'the new sentence is in the same block'); assert.strictEqual(block2.lo, block.lo);
assert.strictEqual(block2.text, sentence + block.text.slice(first.length));
say('\ndocument face, rows of the edited block (' + block2.key + '):'); for (const r of rows2) for (const i of texts([r])[0]) if (i.src && k.blockAt(i.src)?.key === block2.key) say('  |' + i.s);
say('plain-text face, the lines around it:'); const lines = plain.split('\n'), at = lines.findIndex(l => l.includes(sentence)); for (const l of lines.slice(at - 2, at + 3)) say('  |' + l);
assert.deepStrictEqual(plain.split('\n').filter(l => !l.includes(sentence)), plain0.split('\n').filter(l => !l.includes(first)), 'every other line of the plain text is as it was');

// ---- attribution: `why` on the edited block ----
const why = k.query({ q: 'project', name: 'why', o: hex(block.o), lo: block2.lo, hi: block2.hi });
say('\nproject why, the edited block:\n' + why);
const mine = why.split('\n').filter(l => l.includes(hex(done.change).slice(0, 8)));
assert(mine.some(l => l.includes('by=person') && l.includes('"Reader Test"') && l.includes('basis=witnessed')), 'the new stretch is attributed to the new change, by person, who Reader Test');
say('project history:\n' + k.query({ q: 'project', name: 'history', o: hex(block.o) }));
say('project text (start):\n' + k.query({ q: 'project', name: 'text', o: hex(block.o) }).slice(0, 300) + ' ...');

// ---- saved, and opened in a fresh kernel ----
const saved = k.packBytes();
fs.mkdirSync(new URL('spike/out/', root), { recursive: true }); fs.writeFileSync(new URL('spike/out/edited.ufx', root), saved);
assert.deepStrictEqual(saved.slice(0, before.length), before, 'the pack was only appended to (P4)');
const k2 = await kernel();
assert(await k2.open(file('spike/out/edited.ufx')), 'edited.ufx opens');
assert.strictEqual(k2.query({ q: 'commits' })[0].commit, hex(done.commit), 'the head of the saved file is the commit returned');
assert.strictEqual(k2.sample({ as: 'text' }).text, plain); assert.deepStrictEqual(k2.sample({ as: 'rows', w: 480 }), k.sample({ as: 'rows', w: 480 }));
assert.strictEqual(k2.query({ q: 'project', name: 'why', o: hex(block.o), lo: block2.lo, hi: block2.hi }), why);
const layers = k2.query({ q: 'layers' });
assert.strictEqual(layers.missing_from_content_or_attribution, 0);
say('\nsaved spike/out/edited.ufx:', saved.length, 'bytes (' + (saved.length - before.length) + ' appended); a fresh kernel finds head', k2.query({ q: 'commits' })[0].commit.slice(0, 16), 'and the same text, rows and why');
say('layers: content', layers.content.records, 'attribution', layers.attribution.records, 'working history', layers.working_history.records, 'missing', layers.missing_from_content_or_attribution);

// ---- find_pack: the pack as a web envelope's pack element holds it ----
assert.deepStrictEqual(k2.findPack(Buffer.from(saved).toString('base64')), saved); assert.strictEqual(k2.findPack('not base64!'), null); assert.strictEqual(k2.findPack(Buffer.from(saved).toString('base64').slice(0, -1)), null);
say('find_pack: base64 of the saved pack decodes to it byte for byte; text that is not base64 gives null');

// ---- more that must be refused, each with nothing written ----
for (const [what, e] of [['the same random bytes again', edit], ['a change object as the target', { ...edit, o: done.change }], ['positions reversed', { ...edit, lo: 5, hi: 2 }], ['no random bytes', { ...edit, random: random.slice(0, 16) }], ['nothing to change', { ...edit, hi: edit.lo, ins: '' }]]) {
  const r = k2.propose(e); assert(r.refused, what); assert.strictEqual(k2.packBytes().length, saved.length); say('refused (' + what + '):', r.refused); }
say('\nOK');
