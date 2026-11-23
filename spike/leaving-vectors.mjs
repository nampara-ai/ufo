// Writes vectors/provisional/leaving.json and vectors/edit-one-word-published.ufx: for the universe of vectors/edit-one-word.ufx
// (compose.ufx after one word was changed), what the kernel's `leaving` projection (SPEC-PLAYER 10.1, Appendix B; TRAVEL E12) says a
// copy would carry, with and without its working history; and the copy as it is published (TRAVEL 13.3, E9): the content and
// attribution layers of SPEC 2.5 and an `absent` frame. The published pack is a function of the pack it is made from: no time
// and no random bytes go into it. Build the kernel first (see README.md). Run: node spike/leaving-vectors.mjs
import fs from 'fs'; import crypto from 'crypto'; import zlib from 'zlib'; import { start } from './binding/binding.mjs';
const root = new URL('../', import.meta.url), file = f => new Uint8Array(fs.readFileSync(new URL(f, root))), sha = b => crypto.createHash('sha256').update(b).digest('hex');
const wasm = fs.readFileSync(new URL('spike/kernel/target/wasm32-unknown-unknown/release/ufo_spike_kernel.wasm', root)), T = '71'.repeat(16);
const open = async bytes => { const k = await start(wasm, () => ({ adv: 0, asc: 0, desc: 0 }), b => zlib.inflateRawSync(b)); if (!await k.open(bytes)) throw new Error('does not open'); return k; };
const lines = (k, q) => k.query({ q: 'project', ...q }).split('\n').filter(l => l);
const src = file('vectors/edit-one-word.ufx'), k = await open(src), L = k.query({ q: 'layers' }), pub = k.published();
if (sha(pub) !== sha((await open(src)).published())) throw new Error('the published pack is not reproducible');
fs.writeFileSync(new URL('vectors/edit-one-word-published.ufx', root), pub);
const p = await open(pub), LP = p.query({ q: 'layers' }), frames = bytes => { const d = Buffer.from(bytes), names = { 1: 'chunk', 2: 'node', 3: 'seal', 4: 'index', 5: 'head', 6: 'absent' }, out = []; let off = 8;
  while (off < d.length) { const kind = d[off]; let n = 0, sh = 0, at = off + 2, b; do { b = d[at++]; n += (b & 127) * 2 ** sh; sh += 7; } while (b & 128); out.push(kind === 6 ? `absent ${d.subarray(at, at + n).toString('hex')}` : names[kind] || 'kind ' + kind); off = at + n; } return out; };
const out = {
  status: { status: 'provisional', note: "the author's kernel only" },
  what: 'what would leave (SPEC-TRAVEL 13.3, E12) of the universe in vectors/edit-one-word.ufx, as the `leaving` projection says it for each of the two defaults of E9; and the published copy itself',
  how: 'The layers are those of SPEC 2.5, computed from the head commit. `leaving` writes one `layer` record each for content, attribution and history, in that order, then a `seal` record for each seal frame, then `lacks`, which is always written. Of a layer: `included`; `objects`, which for content counts the live objects, for attribution the attributing changes, and for history the objects whose current revision is in neither layer and is present; `bytes`, the sum over its records of the frames that hold them in this pack (frame header included); and of the changes it holds (none for content; the attributing changes for attribution; for history the changes whose `work` is present) their number, the least and greatest of their times, and the names of their actors and the models of their origins, each list in order of scalar value. `lacks history` is true if the copy would withhold history or if the pack it is made from already lacks the work of any change. Appendix B fixes the field names and their order; which objects, changes and bytes each layer counts is this kernel\'s reading and is not said there.',
  pack: { file: 'edit-one-word.ufx', length: src.length, sha256: sha(src), root_hash: k.query({ q: 'commits' })[0].commit },
  layers: { content: L.content, attribution: L.attribution, working_history: L.working_history },
  leaving: { 'for people working on this (history: true)': lines(k, { name: 'leaving', history: true }), 'for readers (history: false)': lines(k, { name: 'leaving', history: false }) },
  published: { file: 'edit-one-word-published.ufx', length: pub.length, sha256: sha(pub), root_hash: p.query({ q: 'commits' })[0].commit,
    what: 'the pack as the kernel publishes it: every record of the content and attribution layers, each once, in the order and the frames it has in edit-one-word.ufx; then an absent frame whose value is {history: true}; one index of every record; one head, naming the same commit, with no previous head. No record was changed: every hash that names a withheld record stays where it was (E10)',
    frames: frames(pub), records: { content: LP.content.hashes, attribution: LP.attribution.hashes, working_history: LP.working_history.hashes }, missing_from_content_or_attribution: LP.missing_from_content_or_attribution,
    leaving_of_the_copy: lines(p, { name: 'leaving', history: true }),
    a_reader_of_the_copy: { plain_text_face_is_that_of_the_whole_pack: p.sample({ as: 'text' }).text === k.sample({ as: 'text' }).text, why: lines(p, { name: 'why', o: T, lo: 423, hi: 537 }), why_is_as_from_the_whole_pack: JSON.stringify(lines(p, { name: 'why', o: T, lo: 423, hi: 537 })) === JSON.stringify(lines(k, { name: 'why', o: T, lo: 423, hi: 537 })),
      history: lines(p, { name: 'history', o: T }), history_from_the_whole_pack: lines(k, { name: 'history', o: T }),
      note: 'Where a change\'s work is withheld, `history` cannot say what the change touched: it lists the change, with `ops` and `touched` given as `withheld` (E11). Appendix B does not say this; it is this kernel\'s reading' } },
};
fs.writeFileSync(new URL('vectors/provisional/leaving.json', root), JSON.stringify(out, null, 1) + '\n');
console.log(out.leaving['for readers (history: false)'].join('\n')); console.log('published:', pub.length, 'bytes of', src.length, sha(pub).slice(0, 16), out.published.frames.join(' ').replace(/(chunk |node )+/g, m => m.trim().split(' ').length + ' records '));
console.log(out.published.a_reader_of_the_copy.history.join('\n'));
