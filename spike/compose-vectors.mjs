// Runs the throwaway spike kernel on vectors/compose.ufx with a synthetic, exactly reproducible
// measure function and writes vectors/provisional/composition.json: the rows of the document face
// at one width, the pages of the pages face, and the plain-text face (SPEC-PRESENTATION 7.7, 8.3).
// Build the kernel first (see README.md). Run: node spike/compose-vectors.mjs
import fs from 'fs'; import crypto from 'crypto'; import { start } from './binding/binding.mjs';
const root = new URL('../', import.meta.url);
const wasm = fs.readFileSync(new URL('spike/kernel/target/wasm32-unknown-unknown/release/ufo_spike_kernel.wasm', root));
const pack = new Uint8Array(fs.readFileSync(new URL('vectors/compose.ufx', root)));
const STATUS = 'provisional: produced by the specification author\'s throwaway kernel; not yet reproduced by an independent implementation';
// The synthetic host. Every character is as wide as every other; nothing is shaped or kerned.
const factor = piece => piece.font.includes('monospace') ? 0.6 : piece.weight >= 700 ? 0.55 : 0.5;
let requests = 0;
const measure = (piece, s) => { requests++; return { adv: [...s].length * piece.size * factor(piece), asc: 0.8 * piece.size, desc: 0.2 * piece.size }; };
const k = await start(wasm, measure); if (!k.open(pack)) throw new Error('compose.ufx does not open');
const r6 = x => Math.round(x * 1e6) / 1e6;
const row = r => ({ top: r6(r.top), gap: r6(r.gap), height: r6(r.h), may_end_page: !r.keep, block: r.block, line: r.line, lines: r.lines,
  text: r.items.filter(i => i[0] === 'text').map(([, i]) => ({ s: i.s, x: r6(i.x), y: r6(i.y), size: i.size, weight: i.weight, slant: !!i.slant, advance: r6(i.adv), font: i.font, dir: i.dir, marker: !i.src })) });
const width = 480;
const doc = k.sample({ as: 'rows', w: width }).detail.map(row);
const pg = k.sample({ as: 'pages', detail: true });
const text = k.sample({ as: 'text' }).text;
const page = [320, 400], margins = [24, 24, 24, 24];
const out = {
  status: STATUS,
  what: 'the composition (SPEC-PRESENTATION 7.7), pagination and plain-text face (8.3) of the universe in vectors/compose.ufx',
  pack: { file: 'compose.ufx', sha256: crypto.createHash('sha256').update(pack).digest('hex') },
  measure: {
    what: 'the host\'s reply to every `measure` request (SPEC-PLAYER 9.3) is synthetic: no font is involved',
    advance: 'the advance of a piece up to an offset is (the number of Unicode scalar values up to that offset) × size × f, where f is 0.6 if the piece\'s font list contains "monospace", otherwise 0.55 if its weight is 700 or more, otherwise 0.5',
    ascent: '0.8 × size', descent: '0.2 × size' },
  numbers: 'lengths are IEEE 754 doubles as the kernel computed them, rounded here to six decimal places. In a row, x and y are from the row\'s top left; y is the baseline. `top` is where a view puts the row: each row below the last by its gap, the first at 0',
  rows: '`block` is a number the kernel gave the block the row belongs to, of no meaning but to tell blocks apart; `line` is the row\'s place among the block\'s `lines`, from 0; `may_end_page` is false for the rows of a heading; `marker` marks a list item\'s marker, which has no characters of the text',
  unicode: 'line breaking by UAX #14 and levels by UAX #9, with the data of Unicode 16.0',
  document_face: { width, height: r6(doc.length ? doc[doc.length - 1].top + doc[doc.length - 1].height : 0), row_count: doc.length, rows: doc },
  pages_face: { page, margins, width: page[0] - margins[1] - margins[3], height_available: page[1] - margins[0] - margins[2], page_count: pg.pages,
    pages: pg.breaks.map(([a, b], i) => ({ page: i + 1, first_row: a, last_row: b - 1, row_count: b - a })),
    rows_note: 'rows are numbered from 0 in the list below, which is the text composed at this face\'s width; they are not the rows of the document face',
    row_count: pg.detail.length, rows: pg.detail.map(row) },
  // the same rows on pages of other heights, chosen so that each rule of step 2 of "Pages" moves a break
  pagination_cases: [152, 184, 228, 356].map(h => {
    const r = k.sample({ as: 'pages', detail: true, page: [page[0], h], margins }), rows = r.detail, avail = h - margins[0] - margins[2];
    return { page: [page[0], h], margins, height_available: avail, page_count: r.pages,
      pages: r.breaks.map(([a, b], i) => {
        let y = rows[a].h, j = a + 1; while (j < rows.length && y + rows[j].gap + rows[j].h <= avail) { y += rows[j].gap + rows[j].h; j++; }   // step 1 alone
        return { page: i + 1, first_row: a, last_row: b - 1, ...(j === b ? {} : { rows_that_fit_but_were_moved_on: j - b }) };
      }) };
  }),
  plain_text_face: text,
};
fs.mkdirSync(new URL('vectors/provisional/', root), { recursive: true });
fs.writeFileSync(new URL('vectors/provisional/composition.json', root), JSON.stringify(out, null, 1) + '\n');
console.log('composition.json: document face', doc.length, 'rows, height', out.document_face.height, '; pages face', pg.detail.length, 'rows on', pg.pages, 'pages', JSON.stringify(pg.breaks), '; measure requests', requests);
