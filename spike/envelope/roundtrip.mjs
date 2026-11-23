// Envelope spike, the kernel's part alone, in Node: the tools universe presented with a subject, driven only by
// raw input events (`input`), and what comes of it: faces, an edit of one word, an edit at the start of a paragraph,
// two words apart, a removal, the file made by Save, and the things that must not happen (F6, refusals).
// Build the kernel first (spike/README.md). Run from the repository root: node spike/envelope/roundtrip.mjs
import fs from 'fs'; import zlib from 'zlib'; import assert from 'assert'; import { start } from '../binding/binding.mjs';
import { fixedParts, kernelWasm, withTools } from './parts.mjs'; import { tree, flat, read } from './nodes.mjs'; import { envelope, fixedCase } from './envelope.mjs'; import { tools as toolsMade, hostile } from './mkpack.mjs';
const root = new URL('../../', import.meta.url), out = f => new URL('spike/out/' + f, root);
const file = f => new Uint8Array(fs.readFileSync(new URL(f, root)));
const hex = b => Buffer.from(b).toString('hex'), say = (...a) => console.log(...a);
// the synthetic host of compose-vectors.mjs: every character as wide as every other; a clock and random bytes that repeat
const measure = (piece, s) => ({ adv: [...s].length * piece.size * (piece.font.includes('monospace') ? 0.6 : piece.weight >= 700 ? 0.55 : 0.5), asc: 0.8 * piece.size, desc: 0.2 * piece.size });
const DAY = Date.UTC(2026, 0, 2, 12);
const kernel = (seed = 0) => { let n = 0; return start(kernelWasm(), measure, b => zlib.inflateRawSync(b), { time: () => DAY, random: len => { n++; return Uint8Array.from({ length: len }, (_, i) => (i * 37 + 11 + 101 * n + seed) & 255); } }); };
fs.mkdirSync(out(''), { recursive: true });
assert.deepStrictEqual(Buffer.from(toolsMade().bytes), Buffer.from(file('spike/envelope/tools.ufx')), 'tools.ufx is what mkpack.mjs writes');
// Two ways a reader comes by its tools. Here, mostly: the working pack is compose.ufx as it stands, which carries none, and the reader
// holds a tools universe of its own (K3), so that the packs written below are compose.ufx and the edits, and nothing else. Further
// down, and in the page: the tools universe is nested in the working pack, under `components.tools`, and the reader has none of its own.
const TOOLS = file('spike/envelope/tools.ufx'), parts = fixedParts(file('vectors/compose.ufx'), { title: 'The Quarterly Review' });

// ---- a reader: a kernel, the last list it drew, and presses by the place of a word ----
async function reader({ who, own = true, seed = 0, ...q }) {
  const k = await kernel(seed); assert(await k.start(q), 'starts'); if (own) assert(k.openTools(TOOLS), 'the reader\'s own tools open');
  const r = { k, lists: [[], []], high: [0, 0], fx: [] };
  // the host's part: it keeps each list as last drawn (a list that has not changed is not sent again)
  r.send = ev => { r.fx = k.input(ev); for (const [kind, d] of r.fx) if (kind === 'draw') { r.lists[d.on] = d.list; r.high[d.on] = d.h; } r.list = r.lists[1]; r.h = r.high[1]; return r.fx; };
  // the text items as drawn, with the list each is on (0: the tools, held in view; 1: the subject) and where it is there, and whether a stroke lies under it (an underline)
  r.texts = () => { const all = []; r.lists.forEach((list, on) => { const st = [[1, 0, 0]]; list.forEach(([kind, it], i) => { const m = st[st.length - 1];
    if (kind === 'push') st.push(it.m ? [m[0] * it.m[0], m[1] + m[0] * it.m[4], m[2] + m[0] * it.m[5]] : m); else if (kind === 'pop') st.pop();
    else if (kind === 'text') all.push({ ...it, i, on, X: m[1] + m[0] * it.x, Y: m[2] + m[0] * it.y, lit: list[i + 1]?.[0] === 'path' && !!list[i + 1][1].stroke && list[i + 1][1].d.length === 2 }); }); });
    return all; };
  r.find = starts => r.texts().find(t => t.s.trim().startsWith(starts));
  r.press = starts => { const t = r.find(starts); assert(t, 'nothing drawn begins ' + starts); return r.send({ press: [t.X + 4, t.Y - 4], on: t.on }); };
  r.kinds = () => r.fx.map(e => e[0]).filter(k => k !== 'draw').join(' ');   // what the host is asked for beside drawing
  r.fx1 = kind => (r.fx.find(e => e[0] === kind) || [])[1];
  r.nodes = on => flat(tree(r.lists[on]));
  r.shown = () => r.texts().map(t => t.s).join('');
  r.head = () => k.query({ q: 'commits' })[0];
  r.said = () => r.nodes(0).filter(n => n.depth === 1 && r.nodes(0)[0] && n.role === 'paragraph').map(n => n.text).join(' ');   // the lines of the tools that are not buttons: the status, and the panel
  r.status = () => { const ns = r.nodes(0), i = ns.findIndex(n => n.role === 'status'); return i < 0 ? '' : ns.slice(i + 1).filter((n, j, a) => a.slice(0, j + 1).every(m => m.depth > ns[i].depth)).map(n => n.text).join(' '); };
  // who is making the changes: the field the tools show while editing is on, given a text through the editing surface
  r.name = who => { const off = !r.find('Edit').lit; if (off) r.press('Edit'); const t = r.texts().find(t => t.on === 0 && 'value' in t); assert(t, 'no field for the name'); r.send({ press: [t.X + 4, t.Y - 4], on: 0 });
    const e = r.fx1('edit'); assert(e && r.kinds() === 'edit show', 'the field asks for the editing surface: ' + r.kinds()); r.send({ edit: e.id, end: true, s: who }); if (off) r.press('Edit'); return e; };
  r.send({ view: [600, 800] }); if (who) r.name(who);
  return r;
}
const T = '71'.repeat(16);
const chars = k => { const s = k.query({ q: 'project', name: 'text', o: T }).split('\n')[1]; return JSON.parse(s.slice(s.indexOf(' s=') + 3)); };
const why = (k, lo, hi) => k.query({ q: 'project', name: 'why', o: T, lo, hi }).split('\n').filter(l => l.startsWith('run '));
const work = (k, change) => JSON.parse(k.query({ q: 'project', name: 'object', o: change }).split('\n').find(l => l.startsWith('prop key=work')).slice('prop key=work value='.length)).ops;
const blockOf = (r, starts) => r.k.blockAt({ tag: 55462, v: r.find(starts).src.v });
// an edit made the way a person makes it: press a block, the host's editing surface is mounted, it reports the new text
// Here the host reports nothing of where: only the whole text when the person is done. The kernel falls back on the difference.
const edit = (r, starts, change) => { r.press(starts); const e = r.fx.find(e => e[0] === 'edit'); assert(e && e[1], 'no editing surface was asked for: ' + r.kinds()); const s = change(e[1].s); r.send({ edit: e[1].id, end: true, s }); return { old: e[1].s, s, asked: e[1] }; };
// And with positions: each thing done in the editing surface reported as it is done, `[at, del, ins]` in the text as the host holds it; then done, with the whole text.
const typed = (r, starts, steps) => { r.press(starts); const e = r.fx1('edit'); assert(e, 'no editing surface was asked for: ' + r.kinds()); let s = [...e.s]; const events = [];
  for (const st of steps) { const ev = typeof st === 'string' ? { edit: e.id, s: st } : { edit: e.id, at: st[0], del: st[1], ins: st[2] }; if (typeof st === 'string') s = [...st]; else s.splice(st[0], st[1], ...st[2]); events.push(ev); assert.deepStrictEqual(r.send(ev), [], 'a report from the editing surface asks nothing of the host'); }
  events.push({ edit: e.id, end: true, s: s.join('') }); r.send(events.at(-1)); return { old: e.s, s: s.join(''), events: events.map(({ edit, ...rest }) => rest) }; };
// the letters of a word typed one at a time from a place, as a keyboard reports them
const keys = (at, word) => [...word].map((c, i) => [at + i, 0, c]);

// ---- start: the reader's own act. The tools are the screen; the working universe is their subject ----
const r = await reader({ parts, name: 'compose.ufx.html' });
const head0 = r.head();
say('started: head', head0.commit.slice(0, 16), 'height', head0.height, '; drawn', r.list.length, 'items,', r.h, 'high');
say('\nthe tools universe, as composed (what a press on each names):');
for (const t of r.texts().filter(t => t.press)) say('  ', JSON.stringify(t.s).padEnd(12), 'press: ' + t.press[1], t.lit ? '(underlined)' : '');
assert.deepStrictEqual(r.texts().filter(t => t.press).map(t => t.s), ['Document', 'Pages', 'Text', 'Edit', 'Save']);
const subject = () => r.texts().filter(t => t.on === 1);
assert(subject().length > 20 && subject().every(t => !('press' in t)), 'nothing of the subject carries press');
assert(r.find('Document').lit && !r.find('Pages').lit && !r.find('Edit').lit, 'the tools show which face is on: a formula over state');

// ---- what an accessibility tree needs (9.2): the nodes of each list, as a host finds them ----
const how = n => n.role + (n.level ? ' ' + n.level : '') + ('current' in n ? (n.current ? ' current' : ' not-current') : '') + ('pressed' in n ? (n.pressed ? ' pressed' : ' not-pressed') : '') + (n.press ? ' press' : '');
const toolsNow = () => r.nodes(0).map(n => `${how(n)} ${JSON.stringify(n.label ?? n.text)}`);
say('\nthe nodes of the tools, as a host must expose them:'); for (const l of toolsNow()) say('  ' + l);
assert.deepStrictEqual(toolsNow().slice(0, 7), ['toolbar "Tools"', 'button current press "Document"', 'button not-current press "Pages"', 'button not-current press "Text"', 'button not-pressed press "Edit"', 'button not-pressed press "Save"', 'status "State"']);
assert(/^State c:[0-9a-f]{8}, after 1 changes\.$/.test(r.status()), 'the status, described in the tools universe, says which state this is: ' + r.status()); say('the status:', JSON.stringify(r.status()));
// every node's group carries the rectangle of what is drawn in it: a host puts the node there
{ const pushes = r.lists.flatMap(l => l.filter(i => i[0] === 'push' && i[1].role)); assert(pushes.length > 20 && pushes.every(i => i[1].box && i[1].box.length === 4 && i[1].box[2] > 0 && i[1].box[3] > 0), 'every node drawn has a box');
  const h1 = r.lists[1].find(i => i[0] === 'push' && i[1].role === 'heading')[1].box, t = r.find('The Quarterly'); assert(Math.abs(h1[0] - t.X) < 0.01 && h1[1] < t.Y && h1[1] + h1[3] > t.Y && Math.abs(h1[2] - t.adv) < 0.01, 'the box of the heading is where its text is drawn'); }
{ const doc = r.nodes(1); say('the nodes of the subject (the first of', doc.length + '):'); for (const n of doc.slice(0, 12)) say('  ' + '  '.repeat(n.depth) + how(n) + ' ' + JSON.stringify(n.label ?? n.text).slice(0, 60));
  assert.deepStrictEqual(doc.slice(0, 2).map(n => [n.depth, n.role, n.label ?? n.text]), [[0, 'document', 'The document these tools work on'], [1, 'heading', 'The Quarterly Review']]);
  assert.deepStrictEqual(doc.filter(n => n.role === 'heading').map(n => [n.level, n.text]), [[1, 'The Quarterly Review'], [2, 'Method']]);
  assert.deepStrictEqual(doc.filter(n => n.role === 'list' || n.role === 'item').map(n => [n.depth, n.role, n.text]), [[1, 'list', ''], [2, 'item', '• First point, short.'], [2, 'item', '• Second point, which runs long enough to need a second line at the width used here.'],
    [3, 'list', ''], [4, 'item', '1. A numbered step.'], [4, 'item', '2. Another numbered step.'], [2, 'item', '• Third point.']]);
  assert.strictEqual(doc.find(n => n.role === 'code').text, 'total = sum(rows)\nprint(total)'); assert(doc.find(n => n.role === 'quote').text.startsWith('What gets measured gets managed, and what gets explained gets trusted.'));
  assert(doc.every(n => !n.press && n.role), 'nothing of the subject can be pressed while it is not editable, and no text lies outside a node');
  // the text of the nodes, read in order, is the plain-text face (8.3) but for its empty lines and the indent of nested items: nothing is lost and nothing comes twice
  const flatten = s => s.replace(/\s+/g, ' ').trim(); assert.strictEqual(flatten(doc.map(n => n.text).join(' ')), flatten(r.k.sample({ as: 'text' }).text)); }

// ---- faces: presentation state set by handlers, read by the Portal's `face` formula ----
const docHigh = r.h, docText = r.shown(), docNodes = r.nodes(1);
r.press('Pages'); assert(r.find('Pages').lit && !r.find('Document').lit); assert(r.h > docHigh * 1.5 && r.list.filter(i => i[0] === 'push' && i[1].clip).length >= 2, 'pages are drawn');
assert.deepStrictEqual(toolsNow().slice(1, 4), ['button not-current press "Document"', 'button current press "Pages"', 'button not-current press "Text"']);
{ const pg = r.nodes(1), regions = pg.filter(n => n.role === 'region'); assert(regions.length >= 2 && regions[0].label === 'Page 1' && regions[1].label === 'Page 2', 'each page is a region, named');
  const doc = pg.filter(n => n.role !== 'region' && n.role !== 'document'); assert.deepStrictEqual(doc.filter(n => n.role === 'heading').map(n => n.text), ['The Quarterly Review', 'Method']);
  assert.deepStrictEqual(doc.map(n => [n.role, n.text]), docNodes.filter(n => n.role !== 'document').map(n => [n.role, n.text]), 'the pages hold the same nodes with the same text: a paragraph that runs over a page is one node'); }
say('\nface pages:', r.list.filter(i => i[0] === 'push' && i[1].clip).length, 'pages,', r.h, 'high');
r.press('Text'); assert(r.find('Text').lit); const mono = r.texts().filter(t => t.font[0] === 'monospace');
assert(mono.length > 10 && mono.map(t => t.s).join('').includes('• First point, short.') && mono.every(t => !t.src), 'the plain-text face, in a monospaced font');
say('face text:', mono.length, 'lines of plain text, the first', JSON.stringify(mono[0].s));
assert.deepStrictEqual(toolsNow().slice(1, 4), ['button not-current press "Document"', 'button not-current press "Pages"', 'button current press "Text"']);
r.press('Document'); assert.strictEqual(r.shown(), docText); assert.strictEqual(r.head().commit, head0.commit, 'changing face changes no byte');

// ---- F6: nothing in a file can act, or take a subject ----
{ const h = await reader({ parts: { ...parts, pack: Buffer.from(hostile().bytes).toString('base64') }, name: 'hostile.ufx.html', who: 'Reader Test' }); h.press('Edit'); h.press('Edit');
  const before = JSON.stringify(h.list, (k, v) => v instanceof Uint8Array ? hex(v) : v), t = h.find('SAVE-ME');
  assert(t && !t.press && !t.lit && !h.find('SWITCH-ME').press, 'a handler in the working universe gives its text nothing to press; its formula is not evaluated');
  for (const w of ['SAVE-ME', 'SWITCH-ME']) { h.press(w); assert.strictEqual(h.kinds(), '', 'a press on ' + w + ' did: ' + h.kinds()); assert.strictEqual(JSON.stringify(h.list, (k, v) => v instanceof Uint8Array ? hex(v) : v), before); }
  assert(h.find('NO-SUBJECT-HERE'), 'a Portal in the working universe whose `of` is arg("subject") shows its label: it was given no subject');
  say('\nF6: in a working universe that carries handlers and a Portal onto arg("subject"): presses did nothing, the Portal shows its label'); }

// ---- editing is off: a press on the document does nothing. On: the reader asks who the person is, once ----
r.press('Every figure'); assert.strictEqual(r.kinds(), '', 'a press on the document with editing off: ' + r.kinds());
r.press('Edit'); assert(r.find('Edit').lit, 'Edit shows that editing is on');
// who is editing is the tools universe's to ask, and the kernel has no question of its own: until a name is given the subject takes no text entry
r.press('Every figure'); assert.strictEqual(r.kinds(), '', 'with no name given, a press on the document does nothing: ' + r.kinds()); assert(/first give your name/.test(r.status()), r.status());
{ const field = r.nodes(0).find(n => n.role === 'input'); assert(field && field.press && field.label === 'Your name, to record with the changes you make', 'the field for the name is an input, named, that can be pressed');
  const e = r.name('Reader Test'); say('\nthe name field, pressed: edit ->', JSON.stringify(e)); assert.strictEqual(e.s, ''); assert(/recorded as made by Reader Test/.test(r.status()), r.status()); }
assert.strictEqual(toolsNow()[4], 'button pressed press "Edit"'); assert(r.nodes(1).filter(n => ['heading', 'paragraph', 'item', 'quote', 'code'].includes(n.role)).every(n => n.press), 'while the subject is editable every block of it says it can be pressed');
// focus: the host says which node has it; the kernel rings the node and asks for it to be brought into view
{ const para = r.nodes(1).find(n => n.text.startsWith('Every figure')), items = r.lists[1].length; r.send({ focus: r.lists[1].find(i => i[0] === 'push' && i[1].role === 'paragraph' && i[1].press).id ?? 0, on: 1 });
  const id = r.lists[1].filter(i => i[0] === 'push' && i[1].role === 'paragraph')[2][1].id; r.send({ focus: id, on: 1 }); assert.strictEqual(r.kinds(), 'show'); const ring = r.lists[1].at(-1);
  assert(r.lists[1].length === items + 1 && ring[0] === 'path' && ring[1].stroke && r.fx1('show').on === 1 && r.fx1('show').at[1] > 100, 'the node with the focus is ringed'); assert(para);
  r.send({ focus: null }); assert.strictEqual(r.lists[1].length, items, 'and the ring goes when the focus does'); }
r.press('Every figure'); assert.strictEqual(r.kinds(), 'edit show'); const asked = r.fx1('edit');
say('edit ->', JSON.stringify({ ...asked, s: asked.s.slice(0, 40) + '…' }));
assert(asked.s.startsWith('Every figure in this section') && asked.at.length === 4 && asked.at[3] > 20 && asked.size === 16);
r.send({ press: [20, 20] }); assert.deepStrictEqual(r.fx, [], 'while the editing surface is mounted a press does nothing');
assert(r.lists[1].at(-1)[0] === 'path' && r.lists[1].at(-1)[1].stroke, 'the block being changed is ringed');
r.send({ edit: asked.id, end: false }); assert.strictEqual(r.kinds(), 'edit'); assert.strictEqual(r.fx1('edit'), null, 'given up: unmounted'); assert.strictEqual(r.head().commit, head0.commit);

// ---- one word changed: one word attributed ----
const b10 = blockOf(r, 'Every figure');
const one = edit(r, 'Every figure', s => s.replace('ledger', 'books'));
assert.strictEqual(r.kinds(), 'edit'); assert.strictEqual(r.fx1('edit'), null);
const c1 = r.head(); assert.strictEqual(c1.height, head0.height + 1);
const id1 = r.head().change, change1 = id1.slice(0, 8); assert(r.status().includes('recorded as change o:' + change1 + ' by Reader Test. Not yet in a file.'), r.status());
const w1 = why(r.k, b10.lo, b10.lo + [...one.s].length), ops1 = work(r.k, id1);
say('\none word changed, "ledger" to "books", through the tools. The status now reads:', JSON.stringify(r.status()));
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

// ---- positioned reports: the host says where each thing was done. Positions decide where; the comparison of before with after removes what is the same (L1) ----
{ const fresh = async () => { const x = await reader({ parts, name: 'x', who: 'Reader Test' }); x.press('Edit'); return x; };
  const made = (x, e) => { const ops = work(x.k, x.head().change); return ops.map(o => o.op === 'splice' ? [o.old ?? '', o.ins ?? ''] : ['set', o.key.join('.')]); };
  // the case the difference gets wrong: "Note: " typed, a key at a time, immediately before "Nothing"
  const x = await fresh(), b = blockOf(x, 'Nothing here'), h0 = x.head().height;
  const e = typed(x, 'Nothing here', keys(0, 'Note: ')), ops = work(x.k, x.head().change), w = why(x.k, b.lo - 10, b.lo + 16);
  say('\n"Note: " typed before "Nothing", reported with positions. The work:'); for (const o of ops) say('  ' + JSON.stringify(o)); say('why, for the end of the block before and the start of this one:'); for (const l of w) say('  ' + l);
  assert.deepStrictEqual(made(x), [['', 'Note: '], ['set', 'spans.b11.at'], ['set', 'spans.' + b.key + '.at']], 'exactly the six characters typed, where they were typed');
  assert(w.length === 3 && w[1].includes(`chars=[${b.lo},${b.lo + 6}]`) && w[1].includes('change=o:' + x.head().change.slice(0, 8)) && w[1].includes('who="Reader Test"') && !w[0].includes(x.head().change.slice(0, 8)) && !w[2].includes(x.head().change.slice(0, 8)), 'attributed at the start, and nothing else');
  assert.strictEqual(blockOf(x, 'Note: Nothing').text, e.s); assert.strictEqual(blockOf(x, 'Note: Nothing').key, b.key); assert.strictEqual(x.head().height, h0 + 1);
  fs.writeFileSync(new URL('vectors/edit-positioned.ufx', root), x.k.packBytes());
  fs.writeFileSync(out('edit-positioned.json'), JSON.stringify({ block: { key: b.key, lo: b.lo, hi: b.hi, text: b.text }, events: e.events, who: 'Reader Test', time: DAY, change: x.head().change }, null, 1) + '\n');
  // a word replaced by selecting it and typing: the first key replaces the selection, the rest follow. The stretch is compared: here nothing is shared
  { const at = blockOf(x, 'Every figure').text.indexOf('ledger'), r2 = typed(x, 'Every figure', [[at, 6, 'b'], ...keys(at + 1, 'ooks')]); assert.deepStrictEqual(made(x), [['ledger', 'books']]); assert(r2.s.includes('from the books at')); }
  // where the word typed shares letters with the one it replaced, only the letters that differ are written: positions say which stretch, the comparison what of it
  { const at = [...blockOf(x, 'Every figure').text].join('').indexOf('taken'); typed(x, 'Every figure', [[at, 5, 't'], ...keys(at + 1, 'oken')]); assert.deepStrictEqual(made(x), [['a', 'o']]); }
  // a run of backspaces, from the end of what goes
  { const t = blockOf(x, 'The appendix').text, at = t.indexOf(' by accident'); typed(x, 'The appendix', Array.from({ length: 12 }, (_, i) => [at + 11 - i, 1, ''])); assert.deepStrictEqual(made(x), [[' by accident', '']]); }
  // a paste: many characters in one report; and a second thing done elsewhere in the same entry: two splices, one change
  { const t = blockOf(x, 'Readers who').text, at = t.indexOf('detail'); typed(x, 'Readers who', [[at, 0, 'whole of the '], [0, 7, 'Those']]); assert.deepStrictEqual(made(x), [['Reader', 'Tho'], ['', 'e'], ['', 'whole of the ']], 'the stretch replaced is compared (the s of Readers stays); the paste is where it was put'); }
  // typed and removed again: nothing differs, nothing is written, and the reader says nothing was changed
  { const n = x.head().height; typed(x, 'Corrections are', [...keys(11, ' truly'), ...Array.from({ length: 6 }, (_, i) => [16 - i, 1, ''])]); assert.strictEqual(x.head().height, n, 'typed and deleted: no change');
    typed(x, 'Corrections are', [[0, 11, 'C'], ...keys(1, 'orrections')]); assert.strictEqual(x.head().height, n, 'the same characters typed over themselves: no change');
    typed(x, 'Corrections are', [[0, 1, ''], [0, 0, 'C']]); assert.strictEqual(x.head().height, n, 'a letter removed and typed again: no change');
    assert.strictEqual(x.kinds(), 'edit'); assert(x.status().includes('change o:' + x.head().change.slice(0, 8)), 'and no word of a new change: ' + x.status()); }
  // typed over what was typed in the same entry: only what is there at the end counts
  { typed(x, 'Corrections are', [[0, 0, 'Xq'], [1, 1, ''], [0, 1, 'All c'], [5, 1, '']]); assert.deepStrictEqual(made(x), [['C', 'All c']]); }
  // the fallback: reports with no position (the whole text each time). The kernel takes the difference for each step, and "Note: " does not land where it was typed
  { const y = await fresh(), t = blockOf(y, 'Nothing here').text; typed(y, 'Nothing here', ['N' + t, 'No' + t, 'Not' + t, 'Note' + t, 'Note:' + t, 'Note: ' + t]); assert.deepStrictEqual(made(y), [['', 'ote: N']], 'with no positions the difference decides, a step at a time: one letter along here (three, where only the end is reported)');
    // mixed: a positioned report, then one without: the first keeps its place
    const t2 = blockOf(y, 'Readers who').text; typed(y, 'Readers who', [[0, 0, 'Re: '], 'Re: ' + t2.replace('detail', 'sums')]); assert.deepStrictEqual(made(y), [['', 'Re: '], ['set', 'spans.b12.at'], ['set', 'spans.b13.at'], ['detail', 'sums']].sort((a, b) => (a[0] === 'set') - (b[0] === 'set')));
    // a report the kernel cannot place (past the end) is left alone, and one that was never sent is missed: the whole text that ends the entry settles both
    const z = y.press('The appendix') && y.fx1('edit'); y.send({ edit: z.id, at: 9999, del: 0, ins: '!' }); y.send({ edit: z.id, end: true, s: z.s.replace('reason', 'why') }); assert.deepStrictEqual(made(y), [['reason', 'why']]);
    // and an entry given up writes nothing, whatever was reported
    const n = y.head().height, q = y.press('Corrections are') && y.fx1('edit'); y.send({ edit: q.id, at: 0, del: 0, ins: 'zzz' }); y.send({ edit: q.id, end: false }); assert.strictEqual(y.head().height, n); }
  say('positioned reports: a word replaced, letters shared, backspaces, a paste, typed-and-removed (no change), the fallback with no positions, a missed report: as expected'); }

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
r.press('Edit'); assert(!r.find('Edit').lit); r.press('The appendix'); assert.strictEqual(r.kinds(), '', 'editing is off again');

// ---- Save: a panel that shows what will leave (E12), a choice between the two defaults of E9, then the handler acts `export` ----
const figures = k => { const L = k.query({ q: 'layers' }); return { content: L.content.bytes_in_frames, attribution: L.attribution.bytes_in_frames, history: L.working_history.bytes_in_frames }; };
const panel = r => r.nodes(0).filter((n, i, a) => a.slice(0, i).some(m => m.role === 'region' && m.depth < n.depth)).map(n => n.text).join(' | ');
const choice = r => Object.fromEntries(r.nodes(0).filter(n => n.role === 'button' && 'current' in n && n.text.startsWith('For ')).map(n => [n.text, n.current]));
r.press('Save'); assert.strictEqual(r.kinds(), '', 'Save shows what will leave before anything is made: ' + r.kinds());
{ const region = r.nodes(0).find(n => n.role === 'region'), f = figures(r.k), said = panel(r); say('\nSave pressed. The panel, a region named', JSON.stringify(region.label) + ':'); for (const l of said.split(' | ')) say('   ', l);
  assert.strictEqual(region.label, 'What will leave'); assert.deepStrictEqual(choice(r), { 'For people working on this': false, 'For readers': true }, 'the copy for readers is chosen until the person says otherwise');
  assert(said.includes(`${f.content} bytes. It always travels`) && said.includes(`${f.attribution} bytes. This always travels`) && said.includes(`withheld. Its ${f.history} bytes stay here`), 'the three layers, with the figures of the kernel\'s `layers`: ' + JSON.stringify(f));
  assert(said.includes('Reader Test') && said.includes('Test Author') && said.includes('It names no model.') && said.includes('from 2026-01-01 00:00 to 2026-01-02 12:00 UTC') && said.includes('named compose-published.ufx.html'), 'who, when, and the name');
  assert.strictEqual(r.nodes(0).find(n => n.text === 'Save').pressed, true);
  r.press('For people'); assert.deepStrictEqual(choice(r), { 'For people working on this': true, 'For readers': false }); assert(panel(r).includes(`included, ${f.history} bytes`) && panel(r).includes('named compose-edited.ufx.html'), panel(r)); }
r.press('Cancel'); assert(!r.nodes(0).some(n => n.role === 'region') && r.kinds() === '', 'Cancel: the panel goes and nothing is made');
r.press('Save'); assert.deepStrictEqual(choice(r), { 'For people working on this': true, 'For readers': false }, 'the choice made is kept'); r.press('Save this copy'); assert.strictEqual(r.kinds(), 'deliver');
const made = r.fx1('deliver'), page = Buffer.from(made.bytes).toString('utf8'), pack = r.k.packBytes();
say('\ndeliver ->', JSON.stringify({ name: made.name, type: made.type, bytes: made.bytes.length }), '; the status:', JSON.stringify(r.status()));
assert.strictEqual(made.name, 'compose-edited.ufx.html'); assert.strictEqual(made.type, 'text/html'); assert(r.status().includes(`Saved as compose-edited.ufx.html: ${made.bytes.length} bytes, holding state ${r.head().commit.slice(0, 16)}`) && !/Not yet in a file|for readers/.test(r.status()), r.status());
const now = { ...parts, 'static-html': r.k.sample({ as: 'static' }).html, pack: Buffer.from(pack).toString('base64'), date: '2026-01-02' };
assert.strictEqual(page, envelope(now), 'the file made by Save is envelope(parts), as a second implementation computes it, byte for byte');
assert(page.startsWith('<!DOCTYPE html>\n<!--\nUFO file (Universal File Object). Exported 2026-01-02. Open it in a web browser.\n-->\n') && page.endsWith('</script></body></html>'));
say('the file is envelope(parts) by the JavaScript implementation, byte for byte:', page.length, 'characters');
// the names that follow, by the formula in the tools universe: for each kind of copy, and a second copy saved from the same page
for (const [name, whole, next] of [['compose-edited.ufx.html', true, 'compose-edited-2.ufx.html'], ['compose.ufx.html', false, 'compose-published.ufx.html'], ['compose-published.ufx.html', false, 'compose-published-2.ufx.html'], ['a.html', true, 'a-edited.ufx.html'], ['', true, 'untitled-edited.ufx.html'], ['compose-edited-9.ufx.html', true, 'compose-edited-9-edited.ufx.html']]) {
  const x = await reader({ parts, name }); x.press('Save'); if (whole) x.press('For people'); x.press('Save this copy'); assert.strictEqual(x.fx1('deliver').name, next);
  if (name === 'compose.ufx.html') { x.press('Save'); x.press('Save this copy'); assert.strictEqual(x.fx1('deliver').name, 'compose-published-2.ufx.html', 'a second copy from the same page is numbered'); } }
// E12 is the kernel's to keep, whatever a tools universe says: an export of what was not shown is refused. And a reader that was given no parts makes no file, and the status says so
{ const k = await kernel(); assert(await k.open(file('vectors/compose.ufx'))); assert(k.openTools(TOOLS)); const lists = [[], []], send = ev => { const fx = k.input(ev); for (const [kind, d] of fx) if (kind === 'draw') lists[d.on] = d.list; return fx; };
  const at = w => { const st = [[0, 0]]; for (const [kind, it] of lists[0]) { if (kind === 'push') st.push(it.m ? [st.at(-1)[0] + it.m[4], st.at(-1)[1] + it.m[5]] : st.at(-1)); else if (kind === 'pop') st.pop(); else if (kind === 'text' && it.s.startsWith(w)) return [st.at(-1)[0] + it.x + 4, st.at(-1)[1] + it.y - 4]; } };
  send({ view: [600, 800] }); send({ press: at('Save'), on: 0 }); const fx = send({ press: at('Save this copy'), on: 0 });
  assert(fx.every(e => e[0] === 'draw') && JSON.stringify(lists[0]).includes('No file was made: this reader was not given the parts'), 'no parts, no file'); }

// ---- the tools nested in the pack (SPEC 1.6, 1.8; PLAYER 9.6), a reader with none of its own; and a published copy (TRAVEL 13.3) ----
{ const nested = await withTools(file('vectors/compose.ufx')), again = await withTools(file('vectors/compose.ufx')); assert.deepStrictEqual(Buffer.from(nested), Buffer.from(again), 'nesting the tools is reproducible');
  assert.deepStrictEqual(Buffer.from(nested.slice(0, file('vectors/compose.ufx').length)), Buffer.from(file('vectors/compose.ufx')), 'the tools were nested by an append (P4)');
  const p2 = { ...parts, pack: Buffer.from(nested).toString('base64') }, n = await reader({ parts: p2, name: 'compose.ufx.html', own: false, who: 'Nested Reader' });
  const ov = n.k.query({ q: 'project', name: 'expand' }).split('\n'), comp = ov.find(l => l.startsWith('component ')); say('\nthe tools nested in the pack:', comp, '; the change that nested them:', n.k.query({ q: 'project', name: 'history' }).split('\n')[1]);
  const toolsRoot = toolsMade().root.toString('hex'); assert(comp === `component role=tools hash=c:${toolsRoot.slice(0, 8)} status=current`, comp);
  const work0 = work(n.k, n.head().change); assert.deepStrictEqual(work0.map(o => [o.op, o.key.join('.'), Object.keys(o.val)[0]]), [['set', 'components.tools', '$anchor']], 'one `set`, of components.tools, to an anchor'); say('its work:', JSON.stringify(work0));
  assert.deepStrictEqual(toolsNow.call(null).slice(0, 6), n.nodes(0).slice(0, 6).map(x => `${how(x)} ${JSON.stringify(x.label ?? x.text)}`).map((l, i) => i === 4 ? l : l), 'the same tools, from inside the pack');
  assert(n.texts().filter(t => t.on === 1).every(t => !('press' in t)), 'nothing of the subject carries press');
  const L0 = n.k.query({ q: 'layers' }); assert.strictEqual(L0.missing_from_content_or_attribution, 0); assert(L0.content.hashes.includes(toolsRoot) === false && L0.attribution.hashes.includes(toolsRoot), 'the tools universe\'s commit is in the attribution layer, as every commit is; its objects are content');
  const b = blockOf(n, 'Every figure'); n.press('Edit'); edit(n, 'Every figure', s => s.replace('ledger', 'books')); const head = n.head(), f = figures(n.k), why0 = why(n.k, b.lo, b.lo + 60);
  // the projection, both ways, as the panel reads it
  for (const history of [true, false]) { const text = n.k.query({ q: 'project', name: 'leaving', history }); say(text.trimEnd().split('\n').map(l => '   ' + l).join('\n'));
    const [c, a, h, lacks] = text.split('\n').slice(1); assert(c.includes(`name=content included=true`) && c.includes(`bytes=${f.content} `) && a.includes(`name=attribution included=true`) && a.includes(`bytes=${f.attribution} `) && a.includes('"Nested Reader"') && h.includes(`name=history included=${history} `) && h.includes(`bytes=${f.history} `) && lacks === `lacks history=${!history} blobs=0`, text); }
  n.press('Save'); assert(panel(n).includes(`withheld. Its ${f.history} bytes stay here`)); n.press('Save this copy'); const pub = n.fx1('deliver'), pubPage = Buffer.from(pub.bytes).toString('utf8'), pubPack = n.k.published();
  assert.strictEqual(pub.name, 'compose-published.ufx.html'); assert(/That copy is for readers: its working history was withheld\. Everything is still held here/.test(n.status()) && /Not yet in a file/.test(n.status()), 'E13: the page says what the copy lacks, and that it still holds everything: ' + n.status());
  assert.strictEqual(pubPage, envelope({ ...p2, 'static-html': n.k.sample({ as: 'static' }).html, pack: Buffer.from(pubPack).toString('base64'), date: '2026-01-02' }), 'the published file is envelope(parts) with the published pack');
  assert.deepStrictEqual(figures(n.k), f, 'E13: what is held here is as it was'); n.press('Save'); n.press('For people'); n.press('Save this copy'); const whole = n.fx1('deliver'), wholePack = n.k.packBytes();
  assert.strictEqual(whole.name, 'compose-edited-2.ufx.html'); assert(whole.bytes.length > pub.bytes.length); say('whole:', whole.bytes.length, 'bytes (pack', wholePack.length + '); published:', pub.bytes.length, 'bytes (pack', pubPack.length + ')');
  fs.writeFileSync(out('nested-whole.ufx'), wholePack); fs.writeFileSync(out('nested-published.ufx'), pubPack);
  // the published copy, opened: the same state, the same faces and `why`; its history is there, and says that the work was withheld
  const q = await reader({ parts: { ...p2, pack: Buffer.from(pubPack).toString('base64') }, name: pub.name, own: false, who: 'Later Reader', seed: 7 }), LP = q.k.query({ q: 'layers' });
  assert.strictEqual(q.head().commit, head.commit, 'the same root hash'); assert.deepStrictEqual([LP.working_history.records, LP.missing_from_content_or_attribution, LP.content.bytes_in_frames, LP.attribution.bytes_in_frames], [0, 0, f.content, f.attribution], 'it holds the two layers whole and nothing of the third');
  assert.strictEqual(q.texts().filter(t => t.on === 1).map(t => t.s).join(''), n.texts().filter(t => t.on === 1).map(t => t.s).join('')); assert.deepStrictEqual(why(q.k, b.lo, b.lo + 60), why0, '`why` names who wrote each stretch, as before');
  for (const w of ['Pages', 'Text', 'Document']) { q.press(w); assert(q.find(w).lit && q.texts().filter(t => t.on === 1).length > 10, 'the face ' + w); }
  const hist = q.k.query({ q: 'project', name: 'history', o: T }).split('\n'); say('history of the text, in the published copy:'); for (const l of hist.slice(0, -1)) say('   ' + l);
  assert(hist.length === 6 && hist.slice(1, 4).every(l => l.startsWith('change id=o:') && l.endsWith('ops=withheld touched=withheld')) && hist[1].includes('actor="Nested Reader"'), 'every change is there, with its actor, and its work is said to be withheld');
  assert(q.k.query({ q: 'project', name: 'leaving', history: true }).includes('layer name=history included=true objects=0 bytes=0 actors=[] models=[] changes=0 first=0 last=0\nlacks history=true'), 'and `leaving` says a copy of it lacks history whatever is chosen');
  q.press('Save'); assert(panel(q).includes('none is held here'), panel(q)); q.press('Cancel');
  // edited again: a new change on top of history that is withheld; saved again, both ways
  q.press('Edit'); edit(q, 'Readers who', s => s.replace('detail', 'sums')); assert.strictEqual(q.head().height, head.height + 1, q.status()); const h2 = q.k.query({ q: 'project', name: 'history', o: T }).split('\n');
  assert(h2[1].includes('actor="Later Reader"') && h2[1].endsWith('ops=1 touched=[o:71717171]') && h2[2].endsWith('ops=withheld touched=withheld'), 'the new change shows its work; the ones before it are still withheld'); say('after an edit of the published copy:'); for (const l of h2.slice(1, 3)) say('   ' + l);
  q.press('Save'); assert(panel(q).includes('withheld. Its ')); q.press('Save this copy'); const pub2 = q.fx1('deliver'); assert.strictEqual(pub2.name, 'compose-published-2.ufx.html'); const pp2 = q.k.published();
  q.press('Save'); q.press('For people'); q.press('Save this copy'); assert.strictEqual(q.fx1('deliver').name, 'compose-published-edited-2.ufx.html'); fs.writeFileSync(out('nested-published-edited.ufx'), q.k.packBytes()); fs.writeFileSync(out('nested-published-edited-published.ufx'), pp2);
  const z = await reader({ parts: { ...p2, pack: Buffer.from(pp2).toString('base64') }, name: 'z', own: false }); assert.strictEqual(z.head().commit, q.head().commit); assert.strictEqual(z.k.query({ q: 'layers' }).working_history.records, 0);
  say('the published copy: same state, faces, why; history says withheld; edited and saved again both ways');
  // a pack that carries no tools, in a reader that has none: it is shown to be read, and nothing can be pressed
  const bare = await reader({ parts, name: 'bare', own: false }); assert(/carries no tools/.test(bare.nodes(0)[0].text) && bare.nodes(0)[0].role === 'status' && bare.find('The Quarterly') && bare.texts().every(t => !t.press), 'no tools: the reader says so, and shows the document');
  bare.press('The Quarterly'); assert.strictEqual(bare.kinds(), ''); say('a pack with no tools, a reader with none: ' + JSON.stringify(bare.nodes(0)[0].text)); }

// ---- the envelope function: the kernel's and the JavaScript one agree, on a small fixed case and on what is refused ----
{ const first = { ...parts, 'static-html': '<p>x &lt; y</p>', date: '2026-01-02' }; assert.strictEqual(r.k.envelope(first).text, envelope(first), 'on the parts of a real file the two agree'); }
const fixed = JSON.parse(fs.readFileSync(out('envelope-case.json'), 'utf8'));
assert.deepStrictEqual(fixed.parts, fixedCase); assert.strictEqual(envelope(fixedCase), fixed.envelope); assert.deepStrictEqual(r.k.envelope(fixedCase), { text: fixed.envelope });
for (const [what, p] of Object.entries(fixed.refused)) { assert(r.k.envelope(p).refused, what); assert.throws(() => envelope(p), what); say('envelope refused (' + what + '):', r.k.envelope(p).refused); }
say('envelope: spike/out/envelope-case.json agrees with the kernel and with envelope.mjs:', fixed.envelope.length, 'characters');

// ---- the file made, opened by a fresh kernel from its own parts ----
const el = (type, attrs = '') => new RegExp(`<script type="${type}"${attrs}>([^]*?)</script>`).exec(page)[1];
const parts2 = { title: /<title>([^<]*)<\/title>/.exec(page)[1], style: /<style>([^]*?)<\/style>/.exec(page)[1], script: page.slice(page.lastIndexOf('<script type="module">') + 22, page.lastIndexOf('</script>')), pack: el('application/x-ufo-pack'),
  kernel: el('application/x-ufo-kernel', ' data-hash="[0-9a-f]+"'), 'kernel-hash': /data-hash="([0-9a-f]+)"/.exec(page)[1], skeleton: el('application/x-ufo-skeleton') };
for (const key of Object.keys(parts2)) assert.strictEqual(parts2[key], now[key], 'the part ' + key + ' reads back out of the file as it went in');
const r2 = await reader({ parts: parts2, name: made.name, who: 'Second Reader' });
assert.strictEqual(r2.head().commit, r.head().commit, 'the file holds the state the reader had'); assert.strictEqual(r2.texts().filter(t => t.on === 1).map(t => t.s).join(''), r.texts().filter(t => t.on === 1).map(t => t.s).join(''));
assert.deepStrictEqual(why(r2.k, b10.lo, b10.lo + 40), why(r.k, b10.lo, b10.lo + 40));
assert.deepStrictEqual(Buffer.from(pack.slice(0, file('vectors/compose.ufx').length)), Buffer.from(file('vectors/compose.ufx')), 'the pack was only appended to (P4)');
const layers = r2.k.query({ q: 'layers' }); assert.strictEqual(layers.missing_from_content_or_attribution, 0);
r2.press('Save'); r2.press('For people'); r2.press('Save this copy'); assert.strictEqual(r2.fx1('deliver').name, 'compose-edited-2.ufx.html');
assert.strictEqual(Buffer.from(r2.fx1('deliver').bytes).toString('utf8'), page, 'saved again with nothing changed, on the same day: the same file, byte for byte');
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
