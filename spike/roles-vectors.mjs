// Runs the throwaway spike kernel on vectors/compose.ufx and on the envelope's tools universe with the synthetic measure of
// compose-vectors.mjs and writes vectors/provisional/roles.json: the nodes an accessibility tree is to be built from
// (SPEC-PLAYER 9.2: `role`, `label`, `level`), as the kernel's display lists carry them and as a host must expose them.
// Build the kernel first (see README.md). Run: node spike/roles-vectors.mjs
import fs from 'fs'; import crypto from 'crypto'; import zlib from 'zlib'; import { start } from './binding/binding.mjs'; import { tree } from './envelope/nodes.mjs'; import { tools as toolsMade } from './envelope/mkpack.mjs';
const root = new URL('../', import.meta.url), file = f => new Uint8Array(fs.readFileSync(new URL(f, root)));
const wasm = fs.readFileSync(new URL('spike/kernel/target/wasm32-unknown-unknown/release/ufo_spike_kernel.wasm', root));
const factor = piece => piece.font.includes('monospace') ? 0.6 : piece.weight >= 700 ? 0.55 : 0.5;
const measure = (piece, s) => ({ adv: [...s].length * piece.size * factor(piece), asc: 0.8 * piece.size, desc: 0.2 * piece.size });
const pack = file('vectors/compose.ufx'), tools = toolsMade(false).bytes, width = 480, sha = b => crypto.createHash('sha256').update(b).digest('hex');
// the document face of compose.ufx, composed at the width, its rows stacked from the top left
const k = await start(wasm, measure, b => zlib.inflateRawSync(b)); if (!await k.open(pack)) throw new Error('compose.ufx does not open');
const document_face = tree(k.sample({ as: 'list', w: width }).list);
// the tools, presented with compose.ufx as their subject, driven by presses on the words as drawn
if (!k.openTools(tools)) throw new Error('tools.ufx does not open');
const lists = [[], []], send = ev => { for (const [kind, d] of k.input(ev)) if (kind === 'draw') lists[d.on] = d.list; };
const place = word => { const st = [[0, 0]]; for (const [kind, it] of lists[0]) { const m = st[st.length - 1]; if (kind === 'push') st.push(it.m ? [m[0] + it.m[4], m[1] + it.m[5]] : m); else if (kind === 'pop') st.pop(); else if (kind === 'text' && it.s === word) return [m[0] + it.x + 4, m[1] + it.y - 4]; } throw new Error(word); };
const press = word => send({ press: place(word), on: 0 }), blocks = () => { const all = [], walk = c => c.forEach(n => { if (typeof n !== 'string') { all.push(n); walk(n.content); } }); walk(tree(lists[1])); return all.filter(n => ['heading', 'paragraph', 'item', 'quote', 'code'].includes(n.role)); };
send({ view: [width, 800] });
const at_first = tree(lists[0]), subject_at_first = { role: tree(lists[1])[0].role, label: tree(lists[1])[0].label, blocks: blocks().length, that_can_be_pressed: blocks().filter(n => n.press).length };
press('Pages'); const after_pages = tree(lists[0]), regions = tree(lists[1])[0].content.filter(n => n.role === 'region').map(n => n.label);
press('Edit'); const after_edit = tree(lists[0]), subject_before_a_name = { blocks: blocks().length, that_can_be_pressed: blocks().filter(n => n.press).length };
// the field for the name: pressed, the editing surface is asked for; the text it reports back is set in the presentation state by the field's `change` handler
{ const st = [[0, 0]]; let at = null; for (const [kind, it] of lists[0]) { const m = st[st.length - 1]; if (kind === 'push') st.push(it.m ? [m[0] + it.m[4], m[1] + it.m[5]] : m); else if (kind === 'pop') st.pop(); else if (kind === 'text' && 'value' in it) at = [m[0] + it.x + 4, m[1] + it.y - 4]; }
  const fx = k.input({ press: at, on: 0 }), e = fx.find(e => e[0] === 'edit')[1]; send({ edit: e.id, end: true, s: 'A. Reader' }); }
const after_name = tree(lists[0]), subject_after_edit = { blocks: blocks().length, that_can_be_pressed: blocks().filter(n => n.press).length };
const out = {
  status: { status: 'provisional', note: "the author's kernel only" },
  what: 'the nodes of an accessibility tree (SPEC-PLAYER 9.2) for the universe in vectors/compose.ufx and for the tools universe of the web envelope spike, as the kernel\'s display lists carry them: exactly what a host must expose',
  how: 'In a display list a `push` that carries `role` opens a node and its `pop` closes it; a later group with the same `id` goes on with the same node (a paragraph that runs over a page, a button broken over two lines). A node\'s text is the `s` of the text items directly in it, in list order, each followed by its `then` if it has one (the space after a list marker; the line break that ended a line). Here each node is given with everything its `push` says of it but `id`, which only tells nodes apart, and with `content`: its texts and the nodes in it, in reading order.',
  vocabulary: { role: 'document, toolbar, button, status, input, region, heading, paragraph, list, item, quote, code, link. Of these 9.2 names heading, paragraph, list, item, link, button and region; a host hands any other on as it is named', level: 'of a heading (1 to 6) and of an item (its depth of nesting, from 1)',
    label: 'the name of a node whose text does not name it', lang: 'the language of what it holds', ordered: 'on a list whose first item is numbered', value: 'on a numbered item: its number', own: 'on an item whose marker is text of its own, neither the bullet nor a number',
    press: 'pressing it does something: a host makes it reachable by the keyboard, and Enter or Space on it is a press at a point where it is drawn', pressed: 'of a thing that is on or off: which', current: 'of things that choose among several: whether this is the one chosen' },
  measure: 'synthetic, as in composition.json: the advance of a piece up to an offset is (the number of Unicode scalar values) × size × f, f being 0.6 for a monospaced font, otherwise 0.55 at weight 700 or more, otherwise 0.5; ascent 0.8 × size, descent 0.2 × size. The nodes do not depend on it, nor on the width: only where lines break does',
  pack: { file: 'compose.ufx', sha256: sha(pack) }, width, document_face,
  tools: { pack: { file: 'spike/envelope/tools.ufx (written by spike/envelope/mkpack.mjs)', sha256: sha(tools) }, what: 'the first of the reader\'s two lists (the tools, held in view; the second is the subject), at first, after a press on "Pages", after a further press on "Edit" (the status then asks for a name, and a field for it, an `input`, is there), and after the name "A. Reader" was given through that field. `current` and `pressed` are formulas over the presentation state in the tools universe; the kernel reports their values and knows nothing of what they mean',
    at_first, after_pages, after_edit, after_name,
    subject: { what: 'the second list is one node, the Portal onto the subject, holding the nodes of compose.ufx in the face shown. While the Portal is editable every block of the subject says it can be pressed; in the pages face each page is a region', at_first: subject_at_first, regions_after_pages: regions, after_edit_before_a_name: subject_before_a_name, after_edit: subject_after_edit } },
};
fs.writeFileSync(new URL('vectors/provisional/roles.json', root), JSON.stringify(out, null, 1) + '\n');
const show = (c, d = 0) => c.forEach(n => typeof n === 'string' ? console.log('  '.repeat(d) + JSON.stringify(n)) : (console.log('  '.repeat(d) + JSON.stringify({ ...n, content: undefined })), show(n.content, d + 1)));
show(at_first); show(after_edit); console.log('roles.json:', JSON.stringify(document_face).length, 'characters of nodes for compose.ufx;', JSON.stringify(out.tools.subject));
