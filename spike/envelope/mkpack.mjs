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
  // The records as they are framed and one index of them, with no commit and no head: what the kernel carries into another pack
  // frame by frame, taking each hash from this index and reading nothing (write.rs, `set` with a pack)
  carried() { const ents = [...this.off].sort((a, b) => (a[0] < b[0] ? -1 : 1)), at = this.b.length, u64 = n => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
    return cat(this.b, frame(4, cat(u64(ents.length), u64(0), u64(at), ...ents.flatMap(([h, o]) => [Buffer.from(h, 'hex'), u64(o)])))); }
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
  const pk = new Pack('ufo-spike-tools-salt', compress), [XF, XG, XT, XR, XP, XC, XS, XL, XN, XW, XV, XH, XE, XM, XO, XB, XA, XY, XQ, XJ, XD, XK, XZ, XI, XU, XX, YA, YH, YE, YL, YB] = [0x82, 0x83, 0x81, 0x84, 0x85, 0x8c, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x8b, 0x8d, 0x8e, 0x8f, 0x90, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xab, 0xac, 0xad, 0xae, 0xaf].map(id);
  const S = f('arg', 'subject'), editing = is(st('editing'), true), named = not(is(st('who'), null)), share = is(st('share'), true), saving = is(st('panel'), 'save'), reviewing = is(st('panel'), 'changes'), lit = on => iff(on, 'underline', 'none');
  // what the kernel's projections say of the subject: `expand` of the whole, the changes newest first, and what a copy would carry
  // Each is asked once and named (`let`, 7.3), and read where it is wanted by its name.
  const named1 = n => f('arg', n), ov = named1('ov'), last = nth(f('ask', 'history', S), 0), leaving = f('ask', 'leaving', S, { history: share }), [content, credit, history, lacks] = ['content', 'credit', 'history', 'lacks'].map(named1);
  // The name of a saved file: the name of this one without its ending, then a mark for the kind of copy, then a number if a copy was
  // already saved from here; a name that has the mark already takes a number. (No operator of 7.3 finds a text in a text or reads a
  // number from one, so "-edited-2" cannot be counted on from: it becomes "-edited-2-edited".)
  const name = f('arg', 'name'), ends = (s, suf) => is(f('slice', s, plus(len(s), -suf.length), len(s)), suf), less = (s, k) => f('slice', s, 0, plus(len(s), -k));
  // The name without its ending is worked out once and named `stem`.
  const stem0 = iff(ends(name, '.ufx.html'), less(name, 9), iff(ends(name, '.html'), less(name, 5), name)), stem = named1('stem'), count = iff(is(st('n'), null), 0, st('n'));
  const marked = mark => iff(ends(stem, mark), join(stem, '-', num(plus(count, 2))), join(stem, mark, iff(is(count, 0), '', join('-', num(plus(count, 1))))));
  const saveAs = f('let', 'stem', f('let', 's', stem0, iff(is(named1('s'), ''), 'untitled', named1('s'))), join(iff(share, marked('-edited'), marked('-published')), '.ufx.html'));
  // the status: which state this is; how to begin; what was just recorded, or why not; what was saved, and what that copy lacks
  const did = st('did'), out = st('out'), decided = st('decided'), undone = st('undone'), added = st('added');
  const status = f('let', 'ov', nth(f('ask', 'expand', S), 0), join(
    list(join('State ', get(ov, 'commit'), ', after ', num(get(ov, 'changes')), ' changes.')),
    iff(and(editing, not(named)), list('To change the text, first give your name: press the line below.'), list()),
    iff(and(reviewing, not(named)), list('To accept or reject a change, first give your name: press the line below.'), list()),
    // a decision just recorded (SPEC 5.4), or why it was not
    iff(is(decided, null), list(), iff(get(decided, 'ok'),
      list(join('Recorded: change ', get(decided, 'about'), ' ', get(decided, 'verdict'), 'ed by ', st('who'), '.', iff(is(get(decided, 'verdict'), 'reject'), ' What it did was undone.', ''), ' Not yet in a file.')),
      list(join('Not recorded: ', get(decided, 'why'), '.')))),
    // an undoing just made (PLAYER 9.6), or why it was not
    iff(is(undone, null), list(), iff(get(undone, 'ok'), list(join('Undone: your change ', get(undone, 'about'), '. Not yet in a file.')), list(join('Not undone: ', get(undone, 'why'), '.')))),
    // a file just taken in as an asset (SPEC 5.2), or why it was not
    iff(is(added, null), list(), iff(get(added, 'ok'),
      list(join('Added ', iff(is(get(added, 'name'), ''), 'a file with no name', get(added, 'name')), ': ', get(added, 'media'), ', ', num(get(added, 'bytes')), ' bytes, kept exactly as given, recorded as added by ', st('who'),
        '. Nothing in the document uses it yet: it stays with the working history, and a copy for readers does not carry it. Not yet in a file.')),
      list(join('Not added: ', get(added, 'why'), '.')))),
    iff(and(editing, named), list(join('Changes will be recorded as made by ', st('who'), '. Press a paragraph to change it; press the name to change that.')), list()),
    iff(is(did, null), list(), iff(get(did, 'ok'),
      iff(is(st('fresh'), true), list(join('Changed, and recorded as change ', get(last, 'id'), ' by ', get(last, 'actor'), '. Not yet in a file.')), list()),
      list(join('Not changed: ', get(did, 'why'), '.')))),
    iff(is(out, null), list(), iff(get(out, 'ok'),
      join(list(join('Saved as ', get(out, 'name'), ': ', num(get(out, 'bytes')), ' bytes, holding state ', f('slice', get(out, 'commit'), 0, 16), '. It has been handed to your browser to save.')),
        iff(is(st('outshare'), true), list(), list('That copy is for readers: its working history was withheld. Everything is still held here, in this page; to keep it, save a copy for people working on this.'))),
      list(join('No file was made: ', get(out, 'why'), '.'))))));
  // what will leave (TRAVEL E12): the three layers of SPEC 2.5, as `leaving` counts them for the choice now made
  const when = t => f('format', t, 'YYYY-MM-DD hh:mm'), bytes = l => num(get(l, 'bytes')), HISTORY = 'Working history (every operation, and every earlier draft): ';
  const panel = f('let', 'L', leaving, 'content', nth(named1('L'), 0), 'credit', nth(named1('L'), 1), 'history', nth(named1('L'), 2), 'lacks', nth(named1('L'), 3), join(
    list(join('The document: ', num(get(content, 'objects')), ' objects, ', bytes(content), ' bytes. It always travels.'),
      join('Who and what made it: ', num(get(credit, 'changes')), ' changes, from ', when(get(credit, 'first')), ' to ', when(get(credit, 'last')), ' UTC, ', bytes(credit), ' bytes. This always travels. The names it holds:')),
    get(credit, 'actors'),
    iff(is(len(get(credit, 'models')), 0), list('It names no model.'), join(list('The models it names:'), get(credit, 'models'))),
    list(iff(is(get(history, 'bytes'), 0), join(HISTORY, 'none is held here.'),
      iff(share, join(HISTORY, 'included, ', bytes(history), ' bytes, the work of ', num(get(history, 'changes')), ' changes.'),
        join(HISTORY, 'withheld. Its ', bytes(history), ' bytes stay here, and the copy will say that they were withheld.')))),
    // what this reader cannot classify (TRAVEL E10): said plainly, with how much, and whether it goes
    iff(is(get(lacks, 'unread'), 0), list(), list(join('This reader cannot read ', num(get(lacks, 'unread-bytes')), ' bytes of this file, in ', iff(is(get(lacks, 'unread'), 1), 'one part', join(num(get(lacks, 'unread')), ' parts')), ' of a kind it does not know. ',
      iff(share, 'They will be carried as they are.', 'They will be left out of this copy, and stay here.')))),
    list(join('The copy will be named ', saveAs, '.'))));
  // each word is a button: what a press on it does (7.6); a formula that underlines it while what it would set is so (7.3);
  // and the same said for those who do not see it: `current` of those that choose among things, `pressed` of those that are on or off
  const button = (T, C, at, word, press, how, on) => ({ at: anchor({ o: T, a: { chars: ['s', [C, at, 0], [C, at + word.length - 1, 1]] } }), kind: 'inline', role: 'button', weight: 700, decoration: on === undefined ? 'none' : lit(on), ...how, on: { press } });
  // the texts, in the order their characters are put in: each begins where the one before ended, in the numbering of the change's elements
  let next = 0;
  const bar = (T, words, more = {}) => { const chars = words.map(w => w[0]).join('   '), spans = { b0: { ...block(T, XC, next), ...more } }; let at = next; next += chars.length;
    words.forEach(([w, press, how, on], i) => { spans['t' + i] = button(T, XC, at, w, press, how, on); at += w.length + 3; }); return { chars, spans, size: F(15), font: ['sans-serif'] }; };
  const shown = { document: f('or', is(st('face'), 'document'), is(st('face'), null)), pages: is(st('face'), 'pages'), text: is(st('face'), 'text') }, face = (word, to) => [word, { set: 'face', to }, { current: shown[to] }, shown[to]];
  const words = [face('Document', 'document'), face('Pages', 'pages'), face('Text', 'text'), ['Edit', { set: 'editing', to: not(editing) }, { pressed: editing }, editing], ['Save', { set: 'panel', to: iff(saving, null, 'save') }, { pressed: saving }, saving],
    ['Changes', { set: 'panel', to: iff(reviewing, null, 'changes') }, { pressed: reviewing }, reviewing]];
  const choice = [['For people working on this', { set: 'share', to: true }, { current: share }, share], ['For readers', { set: 'share', to: false }, { current: not(share) }, not(share)]];
  // Save: the export, with the choice made and the name; then, if it was not refused, what the status is to say of it, and the panel closes
  const save = [{ act: 'export', universe: S, history: share, name: saveAs, into: 'out' }, { set: 'outshare', to: share }, { set: 'n', to: plus(count, 1) }, { set: 'fresh', to: iff(share, false, st('fresh')) }, { set: 'panel', to: null }];
  // the seals (TRAVEL 14.2): what checking each signature found, in words; a seal that was not or could not be checked is never said to be good.
  // And what `verify` found wrong with the file itself (SPEC P9, P11): said in the same place, never passed over
  const z = f('arg', 'z'), signer = iff(is(get(z, 'name'), ''), 'a key that gives no name', get(z, 'name'));
  const sealLine = iff(is(get(z, 'status'), 'valid'), join('Sealed by ', signer, ' at state ', get(z, 'commit'), ': the signature is good.', iff(is(get(z, 'behind'), 0), ' Nothing has changed since.', ' The file has changed since.')),
    iff(is(get(z, 'status'), 'invalid'), join('A seal in the name of ', signer, ' is here, and its signature is NOT good. Do not rely on it.'), join('A seal in the name of ', signer, ' is here. This reader could not check it.')));
  const grey = [F(0.8), F(0.8), F(0.8), F(1)], side = [F(0), F(16), F(6), F(16)], line = X => ['ufo.portal', { of: f('arg', 'line') }];
  const tBar = bar(XT, words, { role: 'toolbar', label: 'Tools', lang: 'en' }), tHead = { chars: 'What will leave, if you save a copy', spans: { b0: { ...block(XH, XC, next), weight: 700 } }, size: F(15), font: ['sans-serif'] };
  next += tHead.chars.length; const tChoice = bar(XO, choice), tSave = bar(XB, [['Save this copy', save, {}], ['Cancel', { set: 'panel', to: null }, {}]]);
  // the changes, newest first (SPEC 5.4): who made each and when, the decision that stands about it, and two words to decide. A press
  // on one records a decision by the person named, about the change of its own line: `each` binds the line's record as `c`
  const c = f('arg', 'c'), decide = verdict => [{ act: 'decide', about: get(c, 'id'), verdict, who: st('who'), into: 'decided' }, { set: 'fresh', to: true }];
  const row = iff(is(get(c, 'id'), 'withheld'), 'A change whose record was withheld from this copy.',
    join(get(c, 'actor'), ', ', when(get(c, 'time')), ' UTC, change ', get(c, 'id'), ': ', iff(is(get(c, 'verdict'), 'none'), 'not decided.', join(get(c, 'verdict'), 'ed by ', get(c, 'decided-by'), '.'))));
  const tChanges = { chars: 'Changes, newest first', spans: { b0: { ...block(XY, XC, next), weight: 700 } }, size: F(15), font: ['sans-serif'] }; next += tChanges.chars.length;
  const tDecide = bar(XD, [['Accept', decide('accept'), {}], ['Reject', decide('reject'), {}]]);
  // undo (PLAYER 9.6): the newest change of the person named that is not undone yet
  const tUndo = bar(XK, [['Undo my last change', [{ act: 'undo', who: st('who'), into: 'undone' }, { set: 'fresh', to: true }], {}]]);
  // adding a file (SPEC 5.2): the reader asks the person for one, and takes it in as an asset, by the person named
  const tAdd = bar(XU, [['Add a file', [{ act: 'import', who: st('who'), into: 'added' }, { set: 'fresh', to: true }], {}]]);
  // what the document itself asks for (PRESENTATION 7.6 **F10**): a handler in the file proposed a change. Nothing is written until the
  // person says so here, where the file cannot reach; then it is their change, recorded with their decision and with what asked for it
  const pending = st('pending'), q = f('arg', 'q');
  const tAsk = { chars: 'The document asks to change itself', spans: { b0: { ...block(YH, XC, next), weight: 700 } }, size: F(15), font: ['sans-serif'] }; next += tAsk.chars.length;
  const tApply = bar(YB, [['Apply', [{ act: 'propose', change: pending, verdict: 'approve', who: st('who'), into: 'did' }, { set: 'pending', to: null }, { set: 'fresh', to: true }], {}], ['Dismiss', { set: 'pending', to: null }, {}]]);
  const asked = iff(is(pending, null), list(), get(pending, 'lines'));
  const askLine = join('Set ', get(q, 'key'), ' of ', get(q, 'obj'), ': from ', get(q, 'old'), ' to ', get(q, 'val'), '.');
  const root = universe(pk, XC, id(0x77), [
    [XF, 'ufo.face', { of: ref(XG), medium: 'document' }],
    [XG, 'ufo.group', { children: [ref(XT), ref(XS), ref(XZ), ref(XN), ref(XX), ref(YA), ref(XV), ref(XA), ref(XR), ref(XP)] }],
    [XT, 'ufo.text', { ...tBar, margin: [F(10), F(16), F(8), F(16)] }],
    [XS, 'ufo.group', { role: 'status', label: 'State', each: status, as: 'line', children: [ref(XL)], margin: side }],
    [XL, ...line()],
    [XZ, 'ufo.group', { role: 'status', label: 'Seals, and damage', each: f('ask', 'verify', S), as: 'z', children: [ref(XI)], margin: side }],
    [XI, 'ufo.portal', { of: iff(is(get(z, 'is'), 'issue'), join('This file is damaged: ', get(z, 's'), '.'), sealLine) }],
    // who is making the changes: a value of the presentation state, shown while editing is on, which takes text entry (7.6)
    [XN, 'ufo.group', { visible: f('or', editing, reviewing), each: list(st('who')), as: 'who', children: [ref(XW)], margin: side }],
    [XW, 'ufo.portal', { of: f('arg', 'who'), role: 'input', label: 'Your name, to record with the changes you make', editable: true, on: { change: { set: 'who', to: iff(is(f('arg', 'text'), ''), null, f('arg', 'text')) } } }],
    [XV, 'ufo.group', { visible: saving, role: 'region', label: 'What will leave', lang: 'en', children: [ref(XH), ref(XE), ref(XO), ref(XB)], margin: side }],
    [XH, 'ufo.text', tHead],
    [XE, 'ufo.group', { each: panel, as: 'line', children: [ref(XM)] }],
    [XM, ...line()],
    [XO, 'ufo.text', tChoice],
    [XB, 'ufo.text', tSave],
    [XA, 'ufo.group', { visible: reviewing, role: 'region', label: 'Changes', lang: 'en', children: [ref(XY), ref(XK), ref(XQ)], margin: side }],
    [XY, 'ufo.text', tChanges],
    [XQ, 'ufo.group', { each: f('ask', 'history', S), as: 'c', children: [ref(XJ), ref(XD)] }],
    [XJ, 'ufo.portal', { of: row }],
    [XD, 'ufo.text', tDecide],
    [XK, 'ufo.text', tUndo],
    [XX, 'ufo.group', { visible: and(editing, named), children: [ref(XU)], margin: side }],
    [XU, 'ufo.text', tAdd],
    [YA, 'ufo.group', { visible: not(is(pending, null)), role: 'region', label: 'A change the document asks for', lang: 'en', children: [ref(YH), ref(YE), ref(YB)], margin: side }],
    [YH, 'ufo.text', tAsk],
    [YE, 'ufo.group', { each: asked, as: 'q', children: [ref(YL)] }],
    [YL, 'ufo.portal', { of: askLine }],
    [YB, 'ufo.text', tApply],
    [XR, 'ufo.path', { d: [['M', F(0), F(0)], ['L', F(4000), F(0)]], stroke: grey, width: F(1), h: F(1) }],
    // the subject, in the face the state names. It takes text entry while `editing` is set and a name has been given; what is
    // done there is proposed as a change by that name, and the state then says that there is something not yet in a file
    [XP, 'ufo.portal', { of: S, face: st('face'), editable: and(editing, named), role: 'document', label: 'The document these tools work on',
      on: { change: [{ act: 'propose', who: st('who'), into: 'did' }, { set: 'fresh', to: true }], propose: { set: 'pending', to: f('arg', 'proposal') } } }],
  ]);
  return { bytes: pk.b, root, words: words.map(w => w[0]) };
}
// ---- a fixture: a working universe that tries to act and to take a subject (F6). Nothing in it may do anything. ----
// ---- a document with a table (PRESENTATION 7.2, 7.3, 7.6): a data object, presented by grids under `each`, with a total worked out
// by a formula, values that take text entry, a value that a press changes, and a line that the document's own state shows ----
export const TABLE = Object.fromEntries(['face', 'group', 'title', 'data', 'table', 'head', 'h1', 'h2', 'h3', 'body', 'c1', 'c2', 'c3', 'total', 'more', 'note', 'change'].map((k, i) => [k, id(0xb1 + i)]));
export function table() {
  const T = TABLE, pk = new Pack('ufo-spike-table-salt'), row = f('arg', 'row'), cell = k => get(row, k), at = k => list('rows', cell('key'), k), cols = [[2, 'fr'], [1, 'fr'], [1, 'fr']];
  const set = (k, val) => ({ propose: [{ op: 'set', obj: ref(T.data), key: at(k), val }] }), amount = r => get(ref(T.data), list('rows', r, 'amount'));
  let next = 0; const text = (o, chars, spans) => { const b = { chars, spans: spans(next) }; next += [...chars].length; return b; };
  const title = text(T.title, 'CostsPress a figure to change it.', n => ({ h: { at: anchor({ o: T.title, a: { chars: ['s', [T.change, n, 0], [T.change, n + 4, 1]] } }), kind: 'block', role: 'heading', level: 1 },
    p: { at: anchor({ o: T.title, a: { chars: ['s', [T.change, n + 5, 0], 'end'] } }), kind: 'block', role: 'paragraph' } }));
  const more = text(T.more, 'Show the note', n => ({ b0: block(T.more, T.change, n), t0: { at: anchor({ o: T.more, a: { chars: ['s', [T.change, n, 0], 'end'] } }), kind: 'inline', role: 'button', weight: 700,
    decoration: iff(is(st('note'), true), 'underline', 'none'), pressed: is(st('note'), true), on: { press: { set: 'note', to: not(is(st('note'), true)) } } } }));
  const root = universe(pk, T.change, id(0x44), [
    [T.face, 'ufo.face', { of: ref(T.group), medium: 'document' }],
    [T.group, 'ufo.group', { children: [ref(T.title), ref(T.table), ref(T.total), ref(T.more), ref(T.note)], gap: F(8) }],
    [T.title, 'ufo.text', title],
    [T.data, 'ufo.data', { cols: { item: { label: 'Item', type: 'text', order: 0 }, amount: { label: 'Amount', type: 'number', order: 1 }, paid: { label: 'Paid', type: 'boolean', order: 2 } },
      rows: { r1: { item: 'Paper', amount: 120, paid: true }, r2: { item: 'Ink', amount: F(45.5), paid: false }, r3: { item: 'Postage', amount: 30, paid: false } }, sort: ['r1', 'r2', 'r3'] }],
    [T.table, 'ufo.group', { role: 'table', label: 'Costs', children: [ref(T.head), ref(T.body)] }],
    [T.head, 'ufo.group', { layout: 'grid', role: 'rowgroup', cols, gap: F(6), children: [ref(T.h1), ref(T.h2), ref(T.h3)] }],
    [T.h1, 'ufo.portal', { of: 'Item', role: 'columnheader' }], [T.h2, 'ufo.portal', { of: 'Amount', role: 'columnheader' }], [T.h3, 'ufo.portal', { of: 'Paid', role: 'columnheader' }],
    [T.body, 'ufo.group', { layout: 'grid', role: 'rowgroup', cols, gap: F(6), each: ref(T.data), as: 'row', children: [ref(T.c1), ref(T.c2), ref(T.c3)] }],
    [T.c1, 'ufo.portal', { of: cell('item'), role: 'cell', editable: true, on: { change: set('item', f('arg', 'text')) } }],
    [T.c2, 'ufo.portal', { of: f('format', cell('amount'), '0.00'), role: 'cell', editable: true, on: { change: set('amount', f('number', f('arg', 'text'))) } }],
    [T.c3, 'ufo.portal', { of: iff(cell('paid'), 'paid', 'not paid'), role: 'cell', on: { press: set('paid', not(cell('paid'))) } }],
    [T.total, 'ufo.portal', { of: join('Total: ', f('format', plus(plus(amount('r1'), amount('r2')), amount('r3')), '0.00')), role: 'paragraph' }],
    [T.more, 'ufo.text', more],
    [T.note, 'ufo.portal', { of: iff(is(st('note'), true), 'Note: the figures are in euros.', ''), visible: is(st('note'), true), role: 'note' }],
  ]);
  return { bytes: pk.b, root };
}

// ---- a file that tries to reach outside itself (PRESENTATION 7.6 **F6**, **F8** to **F11**). Every attempt is in the description; the
// vector vectors/provisional/containment.json says what each must come to ----
export const HOSTILE = { words: ['SAVE-ME', 'SWITCH-ME', 'DECIDE-ME', 'UNDO-ME', 'IMPORT-ME', 'COMMIT-ME', 'REACH-ME', 'SPLICE-ME', 'BOTH-ME', 'HONEST-ME'] };
export function hostile() {
  // its text has the identity of the tools' Save bar, and a span with the key of that bar's first word: a press on it is still the file's
  const pk = new Pack('ufo-spike-hostile-salt'), [HF, HG, HP, HC, HS, HA, HN, HB, HX, HD, HL, HO, HQ, HR] = [0x92, 0x93, 0x95, 0x9c, 0x96, 0x97, 0x98, 0x99, 0x9a, 0x9b, 0x9d, 0x9e, 0x9f, 0xa0].map(id), HT = id(0x90);
  const S = f('arg', 'subject'), own = { op: 'set', obj: ref(HG), key: 'label', val: 'changed by the file' };
  const press = { 'SAVE-ME': { act: 'export', universe: S, history: true, name: 'taken.ufx.html' }, 'SWITCH-ME': [{ set: 'face', to: 'text' }, { set: 'editing', to: true }, { set: 'who', to: 'Mallory' }, { set: 'pending', to: { lines: [], ops: [] } }],
    'DECIDE-ME': { act: 'decide', about: 'o:9c9c9c9c', verdict: 'reject', who: 'Mallory' }, 'UNDO-ME': { act: 'undo', who: 'Mallory' }, 'IMPORT-ME': { act: 'import', who: 'Mallory' },
    'COMMIT-ME': { act: 'propose', change: { ops: [{ ...own, obj: HG, key: ['label'] }] }, who: 'Mallory', verdict: 'approve' },
    'REACH-ME': { propose: [{ op: 'set', obj: ref(id(0x85)), key: 'editable', val: true }] }, 'SPLICE-ME': { propose: [{ op: 'splice', obj: ref(HT), key: 'chars', after: null, ins: 'HACKED ' }] },
    'BOTH-ME': { propose: [own, { ...own, obj: ref(HP) }] }, 'HONEST-ME': { propose: [own] } };
  const chars = HOSTILE.words.join(' now. ') + ' now.', spans = { b0: block(HT, HC) };
  HOSTILE.words.forEach((word, k) => { const i = chars.indexOf(word);
    spans[k ? 'x' + k : 't0'] = { at: anchor({ o: HT, a: { chars: ['s', [HC, i, 0], [HC, i + word.length - 1, 1]] } }), kind: 'inline', role: 'button', weight: 700, on: { press: press[word] }, decoration: formula('if', true, 'underline', 'none') }; });
  // doubling: a text of eight scalar values, doubled eighteen times, would have 2 097 152
  let twice = 'xxxxxxxx'; for (let k = 0; k < 18; k++) twice = f('let', 'a', twice, join(f('arg', 'a'), f('arg', 'a')));
  // spending the bound: a text that weighs 524 289 is read twenty-four times, which is more than 10 000 000
  let half = 'xxxxxxxx'; for (let k = 0; k < 16; k++) half = f('let', 'a', half, join(f('arg', 'a'), f('arg', 'a')));
  const spend = f('let', 'h', half, f('list', ...Array.from({ length: 24 }, () => len(f('arg', 'h')))));
  // depth: formulas one inside another, sixty-four and sixty-five of them. A value nests at most 64 deep as it is encoded (SPEC 1.2), so the
  // chain is kept in pieces outside the node (1.4, kind "v"), each piece nine formulas
  const deep = n => { let v = 'x'; for (let k = 1; k <= n; k++) { v = join(v); if (k % 9 === 0 && k < n) v = new Tag(55464, ['v', pk.blob(enc(v))]); } return v; };
  const line = (o, of, label) => [o, 'ufo.portal', { of, label }];
  const root = universe(pk, HC, id(0x66), [
    [HF, 'ufo.face', { of: ref(HG), medium: 'document' }],
    [HG, 'ufo.group', { label: 'as it was made', children: [ref(HT), ref(HP), ref(HS), ref(HA), ref(HN), ref(HB), ref(HD), ref(HO), ref(HQ), ref(HR), ref(HX), ref(HL)], on: { load: { set: 'ran', to: 'load' }, time: { set: 'ran', to: 'time' }, view: { set: 'ran', to: 'view' } } }],
    [HT, 'ufo.text', { chars, spans }],
    [HP, 'ufo.portal', { of: S, with: { subject: ref(U) }, editable: true, label: 'NO-SUBJECT-HERE' }],
    line(HS, join('STATE who=', iff(is(st('who'), null), 'nobody', st('who')), ' editing=', iff(is(st('editing'), true), 'on', 'off'), ' ran=', iff(is(st('ran'), null), 'nothing', st('ran'))), 'STATE-FAILED'),
    line(HA, join('ASK ', num(len(f('ask', 'history', S)))), 'NO-ASKING-A-SUBJECT'),
    line(HN, join('NET ', f('fetch', 'https://example.invalid/')), 'NO-SUCH-OPERATOR'),
    line(HB, join('BIG ', num(len(twice))), 'TOO-HEAVY'),
    line(HD, join('OWN label=', get(ref(HG), 'label')), 'OWN-FAILED'),
    line(HO, join('OTHER ', get(ref(id(0x85)), 'label')), 'NO-OTHER-UNIVERSE'),
    line(HQ, join('DEEP ', deep(63)), 'DEEP-FAILED'),
    line(HR, join('DEEPER ', deep(64)), 'TOO-DEEP'),
    line(HX, join('SPENT ', num(len(spend))), 'BOUND-SPENT'),
    line(HL, join('AF', 'TER'), 'NOTHING-AFTER-THE-BOUND'),
  ]);
  return { bytes: pk.b, root };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const here = p => fileURLToPath(new URL(p, import.meta.url)); fs.mkdirSync(here('../out/'), { recursive: true });
  for (const [file, made] of [['tools.ufx', tools()], ['../out/hostile.ufx', hostile()], ['../out/table.ufx', table()]]) { fs.writeFileSync(here(file), made.bytes); console.log(file, made.bytes.length, 'bytes, root', made.root.toString('hex')); }
}
