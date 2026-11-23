// Envelope spike, the kernel's part alone, in Node: the tools universe presented with a subject, driven only by
// raw input events (`input`), and what comes of it: faces, an edit of one word, an edit at the start of a paragraph,
// two words apart, a removal, the file made by Save, and the things that must not happen (F6, refusals).
// Build the kernel first (spike/README.md). Run from the repository root: node spike/envelope/roundtrip.mjs
import fs from 'fs'; import zlib from 'zlib'; import assert from 'assert'; import { start } from '../binding/binding.mjs';
import { fixedParts, kernelWasm } from './parts.mjs'; import { envelope, fixedCase } from './envelope.mjs'; import { tools as toolsMade, hostile } from './mkpack.mjs';
const root = new URL('../../', import.meta.url), out = f => new URL('spike/out/' + f, root);
const file = f => new Uint8Array(fs.readFileSync(new URL(f, root)));
const hex = b => Buffer.from(b).toString('hex'), say = (...a) => console.log(...a);
// the synthetic host of compose-vectors.mjs: every character as wide as every other; a clock and random bytes that repeat
const measure = (piece, s) => ({ adv: [...s].length * piece.size * (piece.font.includes('monospace') ? 0.6 : piece.weight >= 700 ? 0.55 : 0.5), asc: 0.8 * piece.size, desc: 0.2 * piece.size });
const DAY = Date.UTC(2026, 0, 2, 12);
const kernel = () => { let n = 0; return start(kernelWasm(), measure, b => zlib.inflateRawSync(b), { time: () => DAY, random: len => { n++; return Uint8Array.from({ length: len }, (_, i) => (i * 37 + 11 + 101 * n) & 255); } }); };
fs.mkdirSync(out(''), { recursive: true });
assert.deepStrictEqual(Buffer.from(toolsMade().bytes), Buffer.from(file('spike/envelope/tools.ufx')), 'tools.ufx is what mkpack.mjs writes');
const parts = fixedParts(file('vectors/compose.ufx'), { title: 'The Quarterly Review' });

// ---- a reader: a kernel, the last list it drew, and presses by the place of a word ----
async function reader(q) {
  const k = await kernel(); assert(await k.start(q), 'starts');
  const r = { k, list: [], fx: [] };
  r.send = ev => { r.fx = k.input(ev); const d = r.fx.find(e => e[0] === 'draw'); if (d) { r.list = d[1].list; r.h = d[1].h; } return r.fx; };
  // the text items as drawn, with where they are on the screen, and whether a stroke lies under them (an underline)
  r.texts = () => { const st = [[1, 0, 0]], all = []; r.list.forEach(([kind, it], i) => { const m = st[st.length - 1];
    if (kind === 'push') st.push(it.m ? [m[0] * it.m[0], m[1] + m[0] * it.m[4], m[2] + m[0] * it.m[5]] : m); else if (kind === 'pop') st.pop();
    else if (kind === 'text') all.push({ ...it, i, X: m[1] + m[0] * it.x, Y: m[2] + m[0] * it.y, lit: r.list[i + 1]?.[0] === 'path' && !!r.list[i + 1][1].stroke && r.list[i + 1][1].d.length === 2 }); });
    return all; };
  r.find = starts => r.texts().find(t => t.s.trim().startsWith(starts));
  r.press = starts => { const t = r.find(starts); assert(t, 'nothing drawn begins ' + starts); return r.send({ press: [t.X + 4, t.Y - 4] }); };
  r.kinds = () => r.fx.map(e => e[0]).join(' ');
  r.shown = () => r.texts().map(t => t.s).join('');
  r.head = () => k.query({ q: 'commits' })[0];
  r.send({ view: [600, 800] });
  return r;
}
const T = '71'.repeat(16);
const chars = k => { const s = k.query({ q: 'project', name: 'text', o: T }).split('\n')[1]; return JSON.parse(s.slice(s.indexOf(' s=') + 3)); };
const why = (k, lo, hi) => k.query({ q: 'project', name: 'why', o: T, lo, hi }).split('\n').filter(l => l.startsWith('run '));
const work = (k, change) => JSON.parse(k.query({ q: 'project', name: 'object', o: change }).split('\n').find(l => l.startsWith('prop key=work')).slice('prop key=work value='.length)).ops;
const blockOf = (r, starts) => r.k.blockAt({ tag: 55462, v: r.find(starts).src.v });
// an edit made the way a person makes it: press a block, the host's editing surface is mounted, it reports the new text
const edit = (r, starts, change) => { r.press(starts); const e = r.fx.find(e => e[0] === 'edit'); assert(e && e[1], 'no editing surface was asked for: ' + r.kinds()); const s = change(e[1].s); r.send({ edit: e[1].id, s }); return { old: e[1].s, s, asked: e[1] }; };

// ---- start: the reader's own act. The tools are the screen; the working universe is their subject ----
const r = await reader({ parts, name: 'compose.ufx.html' });
const head0 = r.head();
say('started: head', head0.commit.slice(0, 16), 'height', head0.height, '; drawn', r.list.length, 'items,', r.h, 'high');
say('\nthe tools universe, as composed (what a press on each names):');
for (const t of r.texts().filter(t => t.press)) say('  ', JSON.stringify(t.s).padEnd(12), 'press: ' + t.press, t.lit ? '(underlined)' : '');
assert.deepStrictEqual(r.texts().filter(t => t.press).map(t => t.s), ['Document', 'Pages', 'Text', 'Edit', 'Save']);
const subject = () => r.texts().filter(t => !t.press && t.Y > 60);
assert(subject().length > 20 && subject().every(t => !('press' in t)), 'nothing of the subject carries press');
assert(r.find('Document').lit && !r.find('Pages').lit && !r.find('Edit').lit, 'the tools show which face is on: a formula over state');

// ---- faces: presentation state set by handlers, read by the Portal's `face` formula ----
const docHigh = r.h, docText = r.shown();
r.press('Pages'); assert(r.find('Pages').lit && !r.find('Document').lit); assert(r.h > docHigh * 1.5 && r.list.filter(i => i[0] === 'push' && i[1].clip).length >= 2, 'pages are drawn');
say('\nface pages:', r.list.filter(i => i[0] === 'push' && i[1].clip).length, 'pages,', r.h, 'high');
r.press('Text'); assert(r.find('Text').lit); const mono = r.texts().filter(t => t.font[0] === 'monospace');
assert(mono.length > 10 && mono.map(t => t.s).join('').includes('• First point, short.') && mono.every(t => !t.src), 'the plain-text face, in a monospaced font');
say('face text:', mono.length, 'lines of plain text, the first', JSON.stringify(mono[0].s));
r.press('Document'); assert.strictEqual(r.shown(), docText); assert.strictEqual(r.head().commit, head0.commit, 'changing face changes no byte');

// ---- F6: nothing in a file can act, or take a subject ----
{ const h = await reader({ parts: { ...parts, pack: Buffer.from(hostile().bytes).toString('base64') }, name: 'hostile.ufx.html', who: 'Reader Test' });
  const before = JSON.stringify(h.list, (k, v) => v instanceof Uint8Array ? hex(v) : v), t = h.find('SAVE-ME');
  assert(t && !t.press && !t.lit && !h.find('SWITCH-ME').press, 'a handler in the working universe gives its text nothing to press; its formula is not evaluated');
  for (const w of ['SAVE-ME', 'SWITCH-ME']) { h.press(w); assert.strictEqual(h.kinds(), 'draw', 'a press on ' + w + ' did: ' + h.kinds()); assert.strictEqual(JSON.stringify(h.list, (k, v) => v instanceof Uint8Array ? hex(v) : v), before); }
  assert(h.find('NO-SUBJECT-HERE'), 'a Portal in the working universe whose `of` is arg("subject") shows its label: it was given no subject');
  say('\nF6: in a working universe that carries handlers and a Portal onto arg("subject"): presses did nothing, the Portal shows its label'); }

// ---- editing is off: a press on the document does nothing. On: the reader asks who the person is, once ----
r.press('Every figure'); assert.strictEqual(r.kinds(), 'draw', 'a press on the document with editing off: ' + r.kinds());
r.press('Edit'); assert(r.find('Edit').lit, 'Edit shows that editing is on');
r.press('Every figure'); assert.strictEqual(r.kinds(), 'draw ask', 'the reader asks for the name of its principal: ' + r.kinds());
say('\nask ->', JSON.stringify(r.fx[1][1]));
r.send({ answer: 'Reader Test' }); assert.strictEqual(r.kinds(), 'draw edit'); const asked = r.fx[1][1];
say('edit ->', JSON.stringify({ ...asked, s: asked.s.slice(0, 40) + '…' }));
assert(asked.s.startsWith('Every figure in this section') && asked.at.length === 4 && asked.at[3] > 20 && asked.size === 16);
r.send({ press: [20, 20] }); assert.strictEqual(r.kinds(), '', 'while the editing surface is mounted a press does nothing');
r.send({ edit: asked.id }); assert.strictEqual(r.kinds(), 'draw edit'); assert.strictEqual(r.fx[1][1], null, 'given up: unmounted'); assert.strictEqual(r.head().commit, head0.commit);

// ---- one word changed: one word attributed ----
const b10 = blockOf(r, 'Every figure');
const one = edit(r, 'Every figure', s => s.replace('ledger', 'books'));
assert.strictEqual(r.kinds(), 'draw edit'); assert.strictEqual(r.fx[1][1], null);
const c1 = r.head(); assert.strictEqual(c1.height, head0.height + 1);
const id1 = r.head().change, change1 = id1.slice(0, 8); assert(r.shown().includes('change ' + change1 + ' by Reader Test'));
const w1 = why(r.k, b10.lo, b10.lo + [...one.s].length), ops1 = work(r.k, id1);
say('\none word changed, "ledger" to "books", through the tools. The reader says:', JSON.stringify(r.texts().find(t => t.s.includes('recorded')).s));
say('why, for the paragraph:'); for (const l of w1) say('  ' + l);
say('the work of the change:', JSON.stringify(ops1));
const at = one.old.indexOf('ledger');
assert.strictEqual(w1.length, 3, 'three runs');
assert(w1[0].includes(`chars=[${b10.lo},${b10.lo + at}]`) && w1[0].includes('change=o:7c7c7c7c') && w1[2].includes('change=o:7c7c7c7c') && w1[2].includes(`chars=[${b10.lo + at + 5},${b10.lo + [...one.s].length}]`), 'before and after: the old change');
assert(w1[1].includes(`chars=[${b10.lo + at},${b10.lo + at + 5}]`) && w1[1].includes('change=o:' + change1) && w1[1].includes('by=person') && w1[1].includes('who="Reader Test"') && w1[1].includes('basis=witnessed'), 'the word: the new change, by person, the name');
assert.strictEqual(ops1.length, 1); assert.deepStrictEqual([ops1[0].op, ops1[0].old, ops1[0].ins, ops1[0].del.length, ops1[0].del[0][2]], ['splice', 'ledger', 'books', 1, 6], 'the splice removes and inserts exactly the word');
assert.strictEqual(chars(r.k).slice(b10.lo, b10.lo + one.s.length), one.s);
fs.writeFileSync(out('edited-one-word.ufx'), r.k.packBytes());
// where the two words share letters, less than the word is attributed: the difference is by scalar values
{ const x = await reader({ parts, name: 'x', who: 'Reader Test' }); x.press('Edit'); edit(x, 'Every figure', s => s.replace('quarter', 'quarterly').replace('taken', 'token'));
  const ops = work(x.k, x.head().change);
  say('where words share letters ("taken" to "token", "quarter" to "quarterly"):', JSON.stringify(ops.map(o => ({ old: o.old, ins: o.ins }))));
  assert.deepStrictEqual(ops.map(o => [o.old, o.ins]), [['a', 'o'], [undefined, 'ly']]); }

// ---- text typed at the very start of a paragraph stays in that paragraph (5.1); at the start of the document too ----
const prev0 = blockOf(r, 'Where a number'), b12 = blockOf(r, 'Nothing here');
const two = edit(r, 'Nothing here', s => 'Truly, ' + s);   // a word added at the very beginning: an insertion and nothing else
const id2 = r.head().change, ops2 = work(r.k, id2);
say('\ntext typed at the very start of a paragraph. The work:'); for (const o of ops2) say('  ' + JSON.stringify(o));
const b12b = blockOf(r, 'Truly, Nothing'), prev1 = blockOf(r, 'Where a number');
assert.strictEqual(b12b.key, b12.key, 'the new text is in the block it was typed into'); assert.strictEqual(b12b.lo, b12.lo); assert.strictEqual(b12b.text, two.s);
assert.deepStrictEqual([prev1.key, prev1.lo, prev1.hi, prev1.text], [prev0.key, prev0.lo, prev0.hi, prev0.text], 'the block before is as it was');
assert.deepStrictEqual(ops2.map(o => o.op + ' ' + (o.ins ?? o.key.join('.'))), ['splice Truly, ', 'set spans.' + prev0.key + '.at', 'set spans.' + b12.key + '.at'], 'one splice, and the two boundaries that named the place');
assert(!ops2[0].del && !ops2[0].old);
say('why, for the end of the block before and the start of this one:'); for (const l of why(r.k, b12.lo - 10, b12.lo + 17)) say('  ' + l);
// a replacement at the start needs no `set`: the new text follows the element it removes, and the boundary is fixed to that element
const repl = edit(r, 'Readers who', s => 'All r' + s.slice(1)), ops2b = work(r.k, r.head().change);
assert.deepStrictEqual(ops2b.map(o => [o.op, o.old, o.ins]), [['splice', 'R', 'All r']]); assert(blockOf(r, 'All readers').text === repl.s && blockOf(r, 'Truly, Nothing').text === two.s && blockOf(r, 'Truly, Nothing').hi === blockOf(r, 'All readers').lo, 'a replacement at the start of a paragraph');
const top = edit(r, 'The Quarterly', s => 'Now: ' + s), ops3 = work(r.k, r.head().change);
say('text typed at the very start of the document. The work:'); for (const o of ops3) say('  ' + JSON.stringify(o));
const b0 = blockOf(r, 'Now: The Quarterly'); assert.strictEqual(b0.key, 'b00'); assert.strictEqual(b0.lo, 0); assert.strictEqual(b0.text, top.s); assert.strictEqual(ops3[0].after, null); assert.strictEqual(ops3.length, 2);
assert(r.find('Now: The Quarterly').weight === 700, 'and it is drawn as the heading is');
fs.writeFileSync(out('edited-paragraph-start.ufx'), r.k.packBytes());

// Where what is typed begins as the text after it does, the difference alone cannot say where it went: "Also: " before "All readers"
// reads the same as "lso: A" after the "A". Rule 1 of diff.rs puts it as late as it can go. The text and the block are right either way.
{ const x = await reader({ parts, name: 'x', who: 'Reader Test' }); x.press('Edit'); const e = edit(x, 'Nothing here', s => 'Note: ' + s), ops = work(x.k, x.head().change);
  say('"Note: " typed before "Nothing": the work is', JSON.stringify(ops.map(o => ({ op: o.op, ins: o.ins, after: o.after && o.after[1] }))));
  assert.deepStrictEqual(ops.map(o => [o.op, o.ins]), [['splice', 'e: Not']]); assert.strictEqual(blockOf(x, 'Note: Nothing').text, e.s); assert.strictEqual(blockOf(x, 'Note: Nothing').key, b12.key); }

// ---- two words changed apart: two splices in one change ----
const b11 = blockOf(r, 'Where a number');
const three = edit(r, 'Where a number', s => s.replace('number', 'total').replace('kept', 'shown'));
const ops4 = work(r.k, r.head().change), w4 = why(r.k, b11.lo, b11.lo + [...three.s].length);
say('\ntwo words changed apart, in one edit. The work:', JSON.stringify(ops4.map(o => ({ op: o.op, old: o.old, ins: o.ins, after: o.after })))); for (const l of w4) say('  ' + l);
assert.deepStrictEqual(ops4.map(o => [o.op, o.old, o.ins]), [['splice', 'number', 'total'], ['splice', 'kept', 'shown']]); assert.strictEqual(w4.length, 5);
assert.deepStrictEqual(w4.map(l => /change=o:(\w{8})/.exec(l)[1] === '7c7c7c7c'), [true, false, true, false, true]);
fs.writeFileSync(out('edited-two-words.ufx'), r.k.packBytes());

// ---- a removal made by a person carries an origin ----
edit(r, 'The appendix', s => s.replace(' by accident', ''));
const hist = r.k.query({ q: 'project', name: 'history', o: T }).split('\n'); say('\na removal alone:', hist[1]);
assert(hist[1].includes('basis=witnessed') && hist[1].includes('by=person') && hist[1].includes('ops=1'));
assert(!work(r.k, r.head().change)[0].ins);
// the same text reported back: nothing is written
const n = r.head().height; edit(r, 'The appendix', s => s); assert.strictEqual(r.head().height, n);
// editing is turned off by the tool that turned it on
r.press('Edit'); assert(!r.find('Edit').lit); r.press('The appendix'); assert.strictEqual(r.kinds(), 'draw', 'editing is off again');

// ---- Save: the handler acts `export`; the kernel makes the envelope and hands the host a file ----
r.press('Save'); assert.strictEqual(r.kinds(), 'draw deliver');
const made = r.fx[1][1], page = Buffer.from(made.bytes).toString('utf8'), pack = r.k.packBytes();
say('\ndeliver ->', JSON.stringify({ name: made.name, type: made.type, bytes: made.bytes.length }), '; the reader says:', JSON.stringify(r.texts().filter(t => t.i < 40 && t.slant).map(t => t.s).join('')));
assert.strictEqual(made.name, 'compose-edited.ufx.html'); assert.strictEqual(made.type, 'text/html');
const now = { ...parts, static: r.k.sample({ as: 'text' }).text.replace(/^\n+/, ''), pack: Buffer.from(pack).toString('base64'), date: '2026-01-02' };
assert.strictEqual(page, envelope(now), 'the file made by Save is envelope(parts), as a second implementation computes it, byte for byte');
assert(page.startsWith('<!DOCTYPE html>\n<!--\nUFO file (Universal File Object). Exported 2026-01-02. Open it in a web browser.\n-->\n') && page.endsWith('</script></body></html>'));
say('the file is envelope(parts) by the JavaScript implementation, byte for byte:', page.length, 'characters');
// the names that follow
for (const [name, next] of [['compose-edited.ufx.html', 'compose-edited-2.ufx.html'], ['compose-edited-9.ufx.html', 'compose-edited-10.ufx.html'], ['a.html', 'a-edited.ufx.html'], ['', 'untitled-edited.ufx.html']]) {
  const x = await reader({ parts, name, who: 'x' }); x.press('Save'); assert.strictEqual(x.fx[1][1].name, next); }
// a reader that was given no parts makes no file, and says so
{ const k = await kernel(); assert(await k.open(file('vectors/compose.ufx'))); assert(k.openTools(file('spike/envelope/tools.ufx'))); const d = k.input({ view: [600, 800] })[0][1];
  const t = d.list.filter(i => i[0] === 'text').find(i => i[1].s === 'Save')[1], fx = k.input({ press: [16 + t.x + 4, 10 + t.y - 4] });
  assert(fx.length === 1 && JSON.stringify(fx).includes('No file was made'), 'no parts, no file'); }

// ---- the envelope function: the kernel's and the JavaScript one agree, on a small fixed case and on what is refused ----
{ const first = { ...parts, static: 'x < y', date: '2026-01-02' }; assert.strictEqual(r.k.envelope(first).text, envelope(first), 'on the parts of a real file the two agree'); }
const fixed = JSON.parse(fs.readFileSync(out('envelope-case.json'), 'utf8'));
assert.deepStrictEqual(fixed.parts, fixedCase); assert.strictEqual(envelope(fixedCase), fixed.envelope); assert.deepStrictEqual(r.k.envelope(fixedCase), { text: fixed.envelope });
for (const [what, p] of Object.entries(fixed.refused)) { assert(r.k.envelope(p).refused, what); assert.throws(() => envelope(p), what); say('envelope refused (' + what + '):', r.k.envelope(p).refused); }
say('envelope: spike/out/envelope-case.json agrees with the kernel and with envelope.mjs:', fixed.envelope.length, 'characters');

// ---- the file made, opened by a fresh kernel from its own parts ----
const el = (type, attrs = '') => new RegExp(`<script type="${type}"${attrs}>([^]*?)</script>`).exec(page)[1];
const parts2 = { title: /<title>([^<]*)<\/title>/.exec(page)[1], style: /<style>([^]*?)<\/style>/.exec(page)[1], script: page.slice(page.lastIndexOf('<script type="module">') + 22, page.lastIndexOf('</script>')), pack: el('application/x-ufo-pack'), tools: el('application/x-ufo-tools'),
  kernel: el('application/x-ufo-kernel', ' data-hash="[0-9a-f]+"'), 'kernel-hash': /data-hash="([0-9a-f]+)"/.exec(page)[1], skeleton: el('application/x-ufo-skeleton') };
for (const key of Object.keys(parts2)) assert.strictEqual(parts2[key], now[key], 'the part ' + key + ' reads back out of the file as it went in');
const r2 = await reader({ parts: parts2, name: made.name, who: 'Second Reader' });
assert.strictEqual(r2.head().commit, r.head().commit, 'the file holds the state the reader had'); assert.strictEqual(r2.shown(), r.shown().replace(/Made .*save\./, ''));
assert.deepStrictEqual(why(r2.k, b10.lo, b10.lo + 40), why(r.k, b10.lo, b10.lo + 40));
assert.deepStrictEqual(Buffer.from(pack.slice(0, file('vectors/compose.ufx').length)), Buffer.from(file('vectors/compose.ufx')), 'the pack was only appended to (P4)');
const layers = r2.k.query({ q: 'layers' }); assert.strictEqual(layers.missing_from_content_or_attribution, 0);
r2.press('Save'); assert.strictEqual(r2.fx[1][1].name, 'compose-edited-2.ufx.html');
assert.strictEqual(Buffer.from(r2.fx[1][1].bytes).toString('utf8'), page, 'saved again with nothing changed, on the same day: the same file, byte for byte');
say('\na fresh kernel started from the parts of the file made: head', r2.head().commit.slice(0, 16), 'height', r2.head().height, '; the same text and why; saved again, the same bytes');

// ---- the gate: what `propose` refuses, each with nothing written ----
const before = r.k.packBytes(), o = Uint8Array.from(Buffer.from(T, 'hex')), random = Uint8Array.from({ length: 64 }, (_, i) => (i * 13 + 5) & 255), e0 = { o, lo: 10, hi: 20, ins: 'something', who: 'Reader Test', time: DAY, random };
const same = chars(r.k).slice(10, 20);
for (const [what, e] of [['positions out of range', { ...e0, lo: 100000, hi: 100001 }], ['a change object as the target', { ...e0, o: Uint8Array.from(Buffer.from(id1, 'hex')) }], ['positions reversed', { ...e0, lo: 5, hi: 2 }], ['no random bytes', { ...e0, random: random.slice(0, 16) }],
  ['nothing to change', { ...e0, hi: e0.lo, ins: '' }], ['what is there, put again', { ...e0, ins: same }], ['an identity already in use', { ...e0, random: Uint8Array.from({ length: 64 }, () => 0x7c) }]]) {
  const x = r.k.propose(e); assert(x.refused && !x.commit, what); assert.deepStrictEqual(r.k.packBytes(), before, what + ': the pack is byte for byte as it was'); say('refused (' + what + '):', x.refused); }
assert.deepStrictEqual(r.k.findPack(Buffer.from(before).toString('base64')), before); assert.strictEqual(r.k.findPack('not base64!'), null);
fs.writeFileSync(out('edited.ufx'), before);
say('\nOK');
