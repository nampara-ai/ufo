// Writes vectors/provisional/edits.json from the two edited packs: what the kernel says of each after reopening it.
import fs from 'fs'; import zlib from 'zlib'; import { start } from './binding/binding.mjs';
const root = new URL('../', import.meta.url);
const wasm = fs.readFileSync(new URL('spike/kernel/target/wasm32-unknown-unknown/release/ufo_spike_kernel.wasm', root));
const STATUSES = JSON.parse(fs.readFileSync(new URL('vectors/STATUS.json', root))).files;
const T = '71'.repeat(16);
const open = async f => { const k = await start(wasm, () => ({ adv: 0, asc: 0, desc: 0 }), b => zlib.inflateRawSync(b)); if (!await k.open(new Uint8Array(fs.readFileSync(new URL('vectors/' + f, root))))) throw new Error(f); return k; };
const lines = (k, q) => k.project({ ...q }).split('\n').filter(l => l && !l.startsWith('end ') && !l.includes(' @ commit='));
const res = {};
for (const [f, lo, hi, what] of [
  ['edit-one-word.ufx', 423, 537, 'compose.ufx after one edit through the gate: in the paragraph that now lies at positions 423 to 537 (half-open), the word "ledger" became "books". Exactly the five new characters are attributed to the new change; what stands before and after keeps its first attribution'],
  ['edit-paragraph-start.ufx', 656, 683, 'a later state of the same pack, five commits in all. The change at height 2 typed "Truly, " at the very start of the paragraph beginning "Nothing here is a forecast"; the change at height 4, the last, typed "Now: " at the very start of the text. The change at height 2 holds the splice and two sets that move the boundary between the two block spans to before the first new element, so the new text lies in the paragraph it was typed in']]) {
  const k = await open(f);
  res[f] = { what, commits: k.commits(), why: { region: [lo, hi], runs: lines(k, { name: 'why', o: T, lo, hi }) },
    blocks: lines(k, { name: 'expand', o: T }).map(l => l.split(' type=')[0] + ' ' + (l.match(/label="[^"]{0,24}/) || [''])[0] + '"') };
}
// A third pack: an edit the host reported with positions (PLAYER 9.2 `edit`, PRESENTATION 7.6). spike/envelope/roundtrip.mjs writes the pack,
// with a fixed clock and fixed random bytes, and the reports it gave the kernel (spike/out/edit-positioned.json).
{ const f = 'edit-positioned.ufx', k = await open(f), given = JSON.parse(fs.readFileSync(new URL('spike/out/edit-positioned.json', root))), { lo } = given.block, hi = lo + 6, change = k.commits()[0].change;
  const ops = JSON.parse(k.project({ name: 'object', o: change }).split('\n').find(l => l.startsWith('prop key=work')).slice('prop key=work value='.length)).ops;
  res[f] = { status: 'provisional', what: 'compose.ufx after one edit through the gate, made from positioned reports: with the editing surface on the paragraph that began "Nothing here is a forecast" (positions ' + lo + ' to ' + given.block.hi + ', half-open), the six characters of "Note: " were typed one at a time at its very start. A comparison of the paragraph before and after cannot say where they went ("Note: " before "Nothing" reads the same as "e: Not" after "Not"); the positions can. Exactly the six characters typed are attributed to the new change, at the start of the paragraph, and the two sets move the boundary between the two block spans so that they lie in the paragraph they were typed in',
    commits: k.commits(),
    reports: { what: 'what the host reported while the editing surface was on the block, in order: `at`, `del`, `ins` in the text of the block as the host held it, counted in Unicode scalar values; then the end of the entry, with the whole text', block: given.block, who: given.who, time: given.time, events: given.events },
    operations: ops, why: { region: [lo - 10, hi + 10], runs: lines(k, { name: 'why', o: T, lo: lo - 10, hi: hi + 10 }) },
    blocks: lines(k, { name: 'expand', o: T }).map(l => l.split(' type=')[0] + ' ' + (l.match(/label="[^"]{0,24}/) || [''])[0] + '"') }; }
fs.writeFileSync(new URL('vectors/provisional/edits.json', root), JSON.stringify({ status: STATUSES['provisional/edits.json'],
  what: 'two packs written by the author\'s kernel, each replayed by an independent reader with conservation ok, and what a reader finds in them (sections 1.7, 5.1)', packs: res }, null, 1) + '\n');
console.log(JSON.stringify(res['edit-one-word.ufx'].why.runs, null, 1), res['edit-paragraph-start.ufx'].blocks.slice(10, 14));
