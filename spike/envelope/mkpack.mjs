// A small standalone pack writer (throwaway spike), for one purpose: to author the tools universe the web envelope
// carries, and a test fixture. It writes a pack of one commit: revisions, the change with its veiled work, the
// object map, the commit, an index and a head (SPEC 1.2 to 1.7, 2.1 to 2.4). The byte layout follows
// tools/vectors/generate.py (class Pack, revision, commit, object_map), read and copied here, not imported.
//   node spike/envelope/mkpack.mjs      writes spike/envelope/tools.ufx and spike/out/hostile.ufx
import fs from 'fs'; import crypto from 'crypto'; import zlib from 'zlib'; import { fileURLToPath } from 'url';
const sha = (...b) => { const h = crypto.createHash('sha256'); for (const x of b) h.update(x); return h.digest(); };
const cat = (...b) => Buffer.concat(b.map(x => Buffer.from(x)));

// ---- values (1.2): deterministic CBOR. A float is F(x); an integer is a plain number ----
export class Tag { constructor(n, v) { this.n = n; this.v = v; } }
export class Float { constructor(x) { this.x = x; } }
export const F = x => new Float(x), ref = id => new Tag(55461, id), anchor = m => new Tag(55462, m), formula = (...f) => new Tag(55463, f);
const head = (major, n) => {
  if (n < 24) return Buffer.from([major << 5 | n]);
  if (n < 256) return Buffer.from([major << 5 | 24, n]);
  if (n < 65536) return Buffer.from([major << 5 | 25, n >> 8, n & 255]);
  if (n < 2 ** 32) { const b = Buffer.alloc(5); b[0] = major << 5 | 26; b.writeUInt32BE(n, 1); return b; }
  const b = Buffer.alloc(9); b[0] = major << 5 | 27; b.writeBigUInt64BE(BigInt(n), 1); return b;
};
function float(x) {   // the shortest of half, single and double that keeps the value
  const d = Buffer.alloc(9); d[0] = 0xfb; d.writeDoubleBE(x, 1);
  if (Math.fround(x) !== x) return d;
  const s = Buffer.alloc(5); s[0] = 0xfa; s.writeFloatBE(x, 1);
  const u = s.readUInt32BE(1), sign = (u >>> 16) & 0x8000, e = ((u >>> 23) & 255) - 127, m = u & 0x7fffff;
  let h = null;
  if (x === 0) h = sign; else if (e >= -14 && e <= 15 && (m & 0x1fff) === 0) h = sign | ((e + 15) << 10) | (m >>> 13);
  else if (e >= -24 && e < -14) { const sh = 13 + (-14 - e), full = 0x800000 | m; if ((full & ((1 << sh) - 1)) === 0) h = sign | (full >>> sh); }
  return h === null ? s : Buffer.from([0xf9, h >> 8, h & 255]);
}
export function enc(v) {
  if (v === null) return Buffer.from([0xf6]);
  if (v === true || v === false) return Buffer.from([0xf4 + v]);
  if (typeof v === 'number') { if (!Number.isInteger(v)) throw Error('a float is written F(x)'); return v >= 0 ? head(0, v) : head(1, -1 - v); }
  if (v instanceof Float) return float(v.x);
  if (typeof v === 'string') { const b = Buffer.from(v, 'utf8'); return cat(head(3, b.length), b); }
  if (v instanceof Uint8Array) return cat(head(2, v.length), v);
  if (Array.isArray(v)) return cat(head(4, v.length), ...v.map(enc));
  if (v instanceof Tag) return cat(head(6, v.n), enc(v.v));
  const items = Object.entries(v).map(([k, x]) => [enc(k), enc(x)]).sort((a, b) => Buffer.compare(a[0], b[0]));
  return cat(head(5, items.length), ...items.flat());
}

// ---- frames (2.1) and blobs (1.4) ----
const leb = n => { const out = []; do { out.push(n & 0x7f | (n > 0x7f ? 0x80 : 0)); n = Math.floor(n / 128); } while (n); return Buffer.from(out); };
const frame = (kind, payload) => cat([kind, 0], leb(payload.length), payload);
// codec 1 (2.1): the record's length, then the record as a raw DEFLATE stream. The project's build tooling writes it; the kernel only reads it, through the host's inflate
const squeezed = (kind, payload) => { const z = cat(leb(payload.length), zlib.deflateRawSync(payload, { level: 9 })); return cat([kind, 1], leb(z.length), z); };
const GEAR = Array.from({ length: 256 }, (_, i) => sha('ufo-gear-1', Buffer.from([i])).readBigUInt64LE(0));
function chunks(data) {   // the gear rule: a chunk ends where it is 2 048 bytes or more and the top 13 bits of the hash are 0, or at 65 536
  const out = []; let start = 0, h = 0n;
  for (let i = 0; i < data.length; i++) {
    h = (h * 2n + GEAR[data[i]]) & 0xffffffffffffffffn; const size = i + 1 - start;
    if ((size >= 2048 && h >> 51n === 0n) || size === 65536) { out.push(data.subarray(start, i + 1)); start = i + 1; h = 0n; }
  }
  if (start < data.length) out.push(data.subarray(start));
  return out;
}

export class Pack {
  constructor(saltLabel, compress = false) { this.b = Buffer.from('\x89UFO\r\n\x1a\n', 'latin1'); this.off = new Map(); this.n = 0; this.saltLabel = saltLabel; this.compress = compress; }
  salt() { const n = Buffer.alloc(4); n.writeUInt32LE(this.n++); return sha(this.saltLabel, n).subarray(0, 16); }
  // a record is compressed where that is asked for and makes its frame smaller; never a commit, which a head must be checked against before anything is inflated
  put(kind, rec, plain = false) { const h = sha(Buffer.from([kind]), rec), k = h.toString('hex'); if (!this.off.has(k)) { this.off.set(k, this.b.length); const f = frame(kind, rec), z = this.compress && !plain ? squeezed(kind, rec) : f; this.b = cat(this.b, z.length < f.length ? z : f); } return h; }
  node(v) { return this.put(2, enc(v)); }
  blob(data) {   // chunks, then their tree; for the small blobs written here one group is always enough
    let parts = chunks(data).map(c => [c.length, this.put(1, c)]);
    if (parts.length > 4096 || parts.slice(1, -1).some(p => p[1].readUInt32BE(0) % 1024 === 0)) throw Error('a blob of more than one group: not written by this script');
    return this.node({ k: 'blob', len: data.length, sha256: sha(data), level: 0, parts });
  }
  veiled(v) { return new Tag(55464, ['v', this.put(1, cat(this.salt(), this.blob(enc(v)))), true]); }   // 1.4: behind an opening
  revision(id, type, by, p, seq) { const n = { k: 'obj', id, type, rev: 1, by, salt: this.salt(), p }; if (seq) n.seq = seq; return this.node(n); }
  // One commit, the first: `objects` is [[id, type, properties, seq]], `ops` the operations that make them (1.7).
  genesis(change, objects, ops, pub) {
    const state = objects.map(([id, type, p, seq]) => [id, this.revision(id, type, change, p, seq)]);
    const hC = this.revision(change, 'ufo.change', change, { ...pub, work: this.veiled({ ops }) });
    state.push([change, hC]); state.sort((a, b) => Buffer.compare(a[0], b[0]));
    if (state.length > 32) throw Error('an object map of more than one node: not written by this script');
    const hM = this.node({ k: 'map', e: state });
    const hK = this.put(2, enc({ k: 'commit', v: 1, parents: [], objects: hM, change: hC, height: 0 }), true);
    // 2.4: the index, every record by hash; 2.3: the head
    const ents = [...this.off].sort((a, b) => (a[0] < b[0] ? -1 : 1)), at = this.b.length, u64 = n => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
    this.b = cat(this.b, frame(4, cat(u64(ents.length), u64(0), u64(at), ...ents.flatMap(([h, o]) => [Buffer.from(h, 'hex'), u64(o)]))));
    const body = cat(hK, u64(this.off.get(hK.toString('hex'))), u64(at), u64(0), u64(this.b.length + 75)), f = frame(5, cat(body, sha(body).subarray(0, 8)));
    if (f.length !== 75) throw Error('head'); this.b = cat(this.b, f); return hK;
  }
}
const id = x => Buffer.alloc(16, x), U = Buffer.alloc(16);
const pub = { actor: { who: { name: 'UFO spike' }, with: { name: 'spike/envelope/mkpack.mjs', version: '0.0.0' } }, time: 1767225600000, origin: { basis: 'witnessed', by: 'person', who: { name: 'UFO spike' } } };
// The operations that make an object of given properties: `new`, then a `set` for each, but `chars`, which is spliced in.
const making = (o, type, p) => [{ op: 'new', obj: o, type }, ...Object.entries(p).map(([key, val]) => key === 'chars' ? { op: 'splice', obj: o, key, after: null, ins: val } : { op: 'set', obj: o, key, val })];
const block = (T, C, first = 0) => ({ at: anchor({ o: T, a: { chars: ['s', [C, first, 0], 'end'] } }), kind: 'block', role: 'paragraph' });
function universe(pk, change, lineage, objects) {
  const F0 = objects[0][0], all = [[U, 'ufo.universe', { lineage, roots: { primary: ref(F0) }, faces: [ref(F0)] }], ...objects];
  let n = 0;   // elements are numbered across everything the change inserts, in the order of its operations (1.7)
  return pk.genesis(change, all.map(([o, type, p]) => { const k = p.chars === undefined ? 0 : [...p.chars].length; n += k; return [o, type, p, k ? { chars: [[change, n - k, k]] } : p.chars === undefined ? undefined : { chars: [] }]; }), all.flatMap(([o, type, p]) => making(o, type, p)), pub);
}

// ---- the tools universe (PLAYER 9.6). It names no universe: what it shows and changes is its subject. ----
// Everything it does is here, as description: formulas (7.3) over its presentation state, over what the reader hands it (`arg`:
// the subject, and the file's `name`) and over the kernel's projections of the subject (`ask`); handlers (7.6) that set state
// or `act`. Text that is computed is a list of lines under `each`, each presented by a Portal whose `of` is `arg` (7.8).
const f = formula, st = n => f('state', n), is = (a, b) => f('=', a, b), not = a => f('not', a), and = (a, b) => f('and', a, b), iff = (c, a, b) => f('if', c, a, b);
const join = (...a) => f('concat', ...a), list = (...a) => f('list', ...a), get = (m, k) => f('get', m, k), nth = (l, i) => f('nth', l, i), num = n => f('format', n, '0'), len = x => f('len', x), plus = (a, b) => f('+', a, b);
export function tools(compress = true) {
  const pk = new Pack('ufo-spike-tools-salt', compress), [XF, XG, XT, XR, XP, XC, XS, XL, XN, XW, XV, XH, XE, XM, XO, XB] = [0x82, 0x83, 0x81, 0x84, 0x85, 0x8c, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x8b, 0x8d, 0x8e, 0x8f, 0x90].map(id);
  const S = f('arg', 'subject'), editing = is(st('editing'), true), named = not(is(st('who'), null)), share = is(st('share'), true), saving = is(st('panel'), 'save'), lit = on => iff(on, 'underline', 'none');
  // what the kernel's projections say of the subject: `expand` of the whole, the changes newest first, and what a copy would carry
  const ov = nth(f('ask', 'expand', S), 0), last = nth(f('ask', 'history', S), 0), leaving = f('ask', 'leaving', S, { history: share }), [content, credit, history] = [0, 1, 2].map(i => nth(leaving, i));
  // The name of a saved file: the name of this one without its ending, then a mark for the kind of copy, then a number if a copy was
  // already saved from here; a name that has the mark already takes a number. (No operator of 7.3 finds a text in a text or reads a
  // number from one, so "-edited-2" cannot be counted on from: it becomes "-edited-2-edited".)
  const name = f('arg', 'name'), ends = (s, suf) => is(f('slice', s, plus(len(s), -suf.length), len(s)), suf), less = (s, k) => f('slice', s, 0, plus(len(s), -k));
  // (The name without its ending is worked out once, when Save is pressed, and kept in the state as `stem`: a formula has no other way to name a value and use it twice.)
  const stem0 = iff(ends(name, '.ufx.html'), less(name, 9), iff(ends(name, '.html'), less(name, 5), name)), stem = st('stem'), count = iff(is(st('n'), null), 0, st('n'));
  const marked = mark => iff(ends(stem, mark), join(stem, '-', num(plus(count, 2))), join(stem, mark, iff(is(count, 0), '', join('-', num(plus(count, 1))))));
  const saveAs = join(iff(share, marked('-edited'), marked('-published')), '.ufx.html');
  // the status: which state this is; how to begin; what was just recorded, or why not; what was saved, and what that copy lacks
  const did = st('did'), out = st('out');
  const status = join(
    list(join('State ', get(ov, 'commit'), ', after ', num(get(ov, 'changes')), ' changes.')),
    iff(and(editing, not(named)), list('To change the text, first give your name: press the line below.'), list()),
    iff(and(editing, named), list(join('Changes will be recorded as made by ', st('who'), '. Press a paragraph to change it; press the name to change that.')), list()),
    iff(is(did, null), list(), iff(get(did, 'ok'),
      iff(is(st('fresh'), true), list(join('Changed, and recorded as change ', get(last, 'id'), ' by ', get(last, 'actor'), '. Not yet in a file.')), list()),
      list(join('Not changed: ', get(did, 'why'), '.')))),
    iff(is(out, null), list(), iff(get(out, 'ok'),
      join(list(join('Saved as ', get(out, 'name'), ': ', num(get(out, 'bytes')), ' bytes, holding state ', f('slice', get(out, 'commit'), 0, 16), '. It has been handed to your browser to save.')),
        iff(is(st('outshare'), true), list(), list('That copy is for readers: its working history was withheld. Everything is still held here, in this page; to keep it, save a copy for people working on this.'))),
      list(join('No file was made: ', get(out, 'why'), '.')))));
  // what will leave (TRAVEL E12): the three layers of SPEC 2.5, as `leaving` counts them for the choice now made
  const when = t => f('format', t, 'YYYY-MM-DD hh:mm'), bytes = l => num(get(l, 'bytes')), HISTORY = 'Working history (every operation, and every earlier draft): ';
  const panel = join(
    list(join('The document: ', num(get(content, 'objects')), ' objects, ', bytes(content), ' bytes. It always travels.'),
      join('Who and what made it: ', num(get(credit, 'changes')), ' changes, from ', when(get(credit, 'first')), ' to ', when(get(credit, 'last')), ' UTC, ', bytes(credit), ' bytes. This always travels. The names it holds:')),
    get(credit, 'actors'),
    iff(is(len(get(credit, 'models')), 0), list('It names no model.'), join(list('The models it names:'), get(credit, 'models'))),
    list(iff(is(get(history, 'bytes'), 0), join(HISTORY, 'none is held here.'),
      iff(share, join(HISTORY, 'included, ', bytes(history), ' bytes, the work of ', num(get(history, 'changes')), ' changes.'),
        join(HISTORY, 'withheld. Its ', bytes(history), ' bytes stay here, and the copy will say that they were withheld.'))),
      join('The copy will be named ', saveAs, '.')));
  // each word is a button: what a press on it does (7.6); a formula that underlines it while what it would set is so (7.3);
  // and the same said for those who do not see it: `current` of those that choose among things, `pressed` of those that are on or off
  const button = (T, C, at, word, press, how, on) => ({ at: anchor({ o: T, a: { chars: ['s', [C, at, 0], [C, at + word.length - 1, 1]] } }), kind: 'inline', role: 'button', weight: 700, decoration: on === undefined ? 'none' : lit(on), ...how, on: { press } });
  // the texts, in the order their characters are put in: each begins where the one before ended, in the numbering of the change's elements
  let next = 0;
  const bar = (T, words, more = {}) => { const chars = words.map(w => w[0]).join('   '), spans = { b0: { ...block(T, XC, next), ...more } }; let at = next; next += chars.length;
    words.forEach(([w, press, how, on], i) => { spans['t' + i] = button(T, XC, at, w, press, how, on); at += w.length + 3; }); return { chars, spans, size: F(15), font: ['sans-serif'] }; };
  const shown = { document: f('or', is(st('face'), 'document'), is(st('face'), null)), pages: is(st('face'), 'pages'), text: is(st('face'), 'text') }, face = (word, to) => [word, { set: 'face', to }, { current: shown[to] }, shown[to]];
  const words = [face('Document', 'document'), face('Pages', 'pages'), face('Text', 'text'), ['Edit', { set: 'editing', to: not(editing) }, { pressed: editing }, editing], ['Save', [{ set: 'stem', to: stem0 }, { set: 'stem', to: iff(is(stem, ''), 'untitled', stem) }, { set: 'panel', to: iff(saving, null, 'save') }], { pressed: saving }, saving]];
  const choice = [['For people working on this', { set: 'share', to: true }, { current: share }, share], ['For readers', { set: 'share', to: false }, { current: not(share) }, not(share)]];
  // Save: the export, with the choice made and the name; then, if it was not refused, what the status is to say of it, and the panel closes
  const save = [{ act: 'export', universe: S, history: share, name: saveAs, into: 'out' }, { set: 'outshare', to: share }, { set: 'n', to: plus(count, 1) }, { set: 'fresh', to: iff(share, false, st('fresh')) }, { set: 'panel', to: null }];
  const grey = [F(0.8), F(0.8), F(0.8), F(1)], side = [F(0), F(16), F(6), F(16)], line = X => ['ufo.portal', { of: f('arg', 'line') }];
  const tBar = bar(XT, words, { role: 'toolbar', label: 'Tools', lang: 'en' }), tHead = { chars: 'What will leave, if you save a copy', spans: { b0: { ...block(XH, XC, next), weight: 700 } }, size: F(15), font: ['sans-serif'] };
  next += tHead.chars.length; const tChoice = bar(XO, choice), tSave = bar(XB, [['Save this copy', save, {}], ['Cancel', { set: 'panel', to: null }, {}]]);
  const root = universe(pk, XC, id(0x77), [
    [XF, 'ufo.face', { of: ref(XG), medium: 'document' }],
    [XG, 'ufo.group', { children: [ref(XT), ref(XS), ref(XN), ref(XV), ref(XR), ref(XP)] }],
    [XT, 'ufo.text', { ...tBar, margin: [F(10), F(16), F(8), F(16)] }],
    [XS, 'ufo.group', { role: 'status', label: 'State', each: status, as: 'line', children: [ref(XL)], margin: side }],
    [XL, ...line()],
    // who is making the changes: a value of the presentation state, shown while editing is on, which takes text entry (7.6)
    [XN, 'ufo.group', { visible: editing, each: list(st('who')), as: 'who', children: [ref(XW)], margin: side }],
    [XW, 'ufo.portal', { of: f('arg', 'who'), role: 'input', label: 'Your name, to record with the changes you make', editable: true, on: { change: { set: 'who', to: iff(is(f('arg', 'text'), ''), null, f('arg', 'text')) } } }],
    [XV, 'ufo.group', { visible: saving, role: 'region', label: 'What will leave', lang: 'en', children: [ref(XH), ref(XE), ref(XO), ref(XB)], margin: side }],
    [XH, 'ufo.text', tHead],
    [XE, 'ufo.group', { each: panel, as: 'line', children: [ref(XM)] }],
    [XM, ...line()],
    [XO, 'ufo.text', tChoice],
    [XB, 'ufo.text', tSave],
    [XR, 'ufo.path', { d: [['M', F(0), F(0)], ['L', F(4000), F(0)]], stroke: grey, width: F(1), h: F(1) }],
    // the subject, in the face the state names. It takes text entry while `editing` is set and a name has been given; what is
    // done there is proposed as a change by that name, and the state then says that there is something not yet in a file
    [XP, 'ufo.portal', { of: S, face: st('face'), editable: and(editing, named), role: 'document', label: 'The document these tools work on',
      on: { change: [{ act: 'propose', who: st('who'), into: 'did' }, { set: 'fresh', to: true }] } }],
  ]);
  return { bytes: pk.b, root, words: words.map(w => w[0]) };
}
// ---- a fixture: a working universe that tries to act and to take a subject (F6). Nothing in it may do anything. ----
export function hostile() {
  const pk = new Pack('ufo-spike-hostile-salt'), [HF, HG, HT, HP, HC] = [0x92, 0x93, 0x91, 0x95, 0x9c].map(id);
  const chars = 'SAVE-ME now, or SWITCH-ME to text.', spans = { b0: block(HT, HC) };
  for (const [key, word, press] of [['x0', 'SAVE-ME', { act: 'export' }], ['x1', 'SWITCH-ME', { set: 'face', to: 'text' }]]) {
    const i = chars.indexOf(word); spans[key] = { at: anchor({ o: HT, a: { chars: ['s', [HC, i, 0], [HC, i + word.length - 1, 1]] } }), kind: 'inline', role: 'button', weight: 700, on: { press }, decoration: formula('if', true, 'underline', 'none') };
  }
  const root = universe(pk, HC, id(0x66), [
    [HF, 'ufo.face', { of: ref(HG), medium: 'document' }],
    [HG, 'ufo.group', { children: [ref(HT), ref(HP)] }],
    [HT, 'ufo.text', { chars, spans }],
    [HP, 'ufo.portal', { of: formula('arg', 'subject'), with: { subject: ref(U) }, editable: true, label: 'NO-SUBJECT-HERE' }],
  ]);
  return { bytes: pk.b, root };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const here = p => fileURLToPath(new URL(p, import.meta.url)); fs.mkdirSync(here('../out/'), { recursive: true });
  for (const [file, made] of [['tools.ufx', tools()], ['../out/hostile.ufx', hostile()]]) { fs.writeFileSync(here(file), made.bytes); console.log(file, made.bytes.length, 'bytes, root', made.root.toString('hex')); }
}
