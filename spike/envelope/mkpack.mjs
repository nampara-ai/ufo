// A small standalone pack writer (throwaway spike), for one purpose: to author the tools universe the web envelope
// carries, and a test fixture. It writes a pack of one commit: revisions, the change with its veiled work, the
// object map, the commit, an index and a head (SPEC 1.2 to 1.7, 2.1 to 2.4). The byte layout follows
// tools/vectors/generate.py (class Pack, revision, commit, object_map), read and copied here, not imported.
//   node spike/envelope/mkpack.mjs      writes spike/envelope/tools.ufx and spike/out/hostile.ufx
import fs from 'fs'; import crypto from 'crypto'; import { fileURLToPath } from 'url';
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
  constructor(saltLabel) { this.b = Buffer.from('\x89UFO\r\n\x1a\n', 'latin1'); this.off = new Map(); this.n = 0; this.saltLabel = saltLabel; }
  salt() { const n = Buffer.alloc(4); n.writeUInt32LE(this.n++); return sha(this.saltLabel, n).subarray(0, 16); }
  put(kind, rec) { const h = sha(Buffer.from([kind]), rec), k = h.toString('hex'); if (!this.off.has(k)) { this.off.set(k, this.b.length); this.b = cat(this.b, frame(kind, rec)); } return h; }
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
    const hK = this.node({ k: 'commit', v: 1, parents: [], objects: hM, change: hC, height: 0 });
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
const block = (T, C) => ({ at: anchor({ o: T, a: { chars: ['s', [C, 0, 0], 'end'] } }), kind: 'block', role: 'paragraph' });
function universe(pk, change, lineage, objects) {
  const F0 = objects[0][0], all = [[U, 'ufo.universe', { lineage, roots: { primary: ref(F0) }, faces: [ref(F0)] }], ...objects];
  return pk.genesis(change, all.map(([o, type, p]) => [o, type, p, p.chars === undefined ? undefined : { chars: [[change, 0, [...p.chars].length]] }]), all.flatMap(([o, type, p]) => making(o, type, p)), pub);
}

// ---- the tools universe (PLAYER 9.6). It names no universe: what it shows and changes is its subject. ----
export function tools() {
  const pk = new Pack('ufo-spike-tools-salt'), [XF, XG, XT, XR, XP, XC] = [0x82, 0x83, 0x81, 0x84, 0x85, 0x8c].map(id);
  const state = n => formula('state', n), is = (n, v) => formula('=', state(n), v), lit = on => formula('if', on, 'underline', 'none');
  // each word: what a press on it does (7.6), and a formula that underlines it while what it would set is so (7.3)
  const words = [
    ['Document', { set: 'face', to: 'document' }, lit(formula('or', is('face', 'document'), is('face', null)))],
    ['Pages', { set: 'face', to: 'pages' }, lit(is('face', 'pages'))],
    ['Text', { set: 'face', to: 'text' }, lit(is('face', 'text'))],
    ['Edit', { set: 'editing', to: formula('not', is('editing', true)) }, lit(is('editing', true))],
    ['Save', { act: 'export' }, 'none'],
  ];
  const chars = words.map(w => w[0]).join('   '), spans = { b0: block(XT, XC) }; let at = 0;
  words.forEach(([w, press, decoration], i) => {
    spans['t' + i] = { at: anchor({ o: XT, a: { chars: ['s', [XC, at, 0], [XC, at + w.length - 1, 1]] } }), kind: 'inline', role: 'strong', decoration, on: { press } };
    at += w.length + 3;
  });
  const grey = [F(0.8), F(0.8), F(0.8), F(1)];
  const root = universe(pk, XC, id(0x77), [
    [XF, 'ufo.face', { of: ref(XG), medium: 'document' }],
    [XG, 'ufo.group', { children: [ref(XT), ref(XR), ref(XP)] }],
    [XT, 'ufo.text', { chars, spans, size: F(15), font: ['sans-serif'], margin: [F(10), F(16), F(8), F(16)] }],
    [XR, 'ufo.path', { d: [['M', F(0), F(0)], ['L', F(4000), F(0)]], stroke: grey, width: F(1), h: F(1) }],
    // the subject, in the face the state names, taking text entry while `editing` is set
    [XP, 'ufo.portal', { of: formula('arg', 'subject'), face: state('face'), editable: is('editing', true), label: 'The document these tools work on' }],
  ]);
  return { bytes: pk.b, root, words, portal: { of: ['arg', 'subject'], face: ['state', 'face'], editable: ['=', ['state', 'editing'], true] } };
}
// ---- a fixture: a working universe that tries to act and to take a subject (F6). Nothing in it may do anything. ----
export function hostile() {
  const pk = new Pack('ufo-spike-hostile-salt'), [HF, HG, HT, HP, HC] = [0x92, 0x93, 0x91, 0x95, 0x9c].map(id);
  const chars = 'SAVE-ME now, or SWITCH-ME to text.', spans = { b0: block(HT, HC) };
  for (const [key, word, press] of [['x0', 'SAVE-ME', { act: 'export' }], ['x1', 'SWITCH-ME', { set: 'face', to: 'text' }]]) {
    const i = chars.indexOf(word); spans[key] = { at: anchor({ o: HT, a: { chars: ['s', [HC, i, 0], [HC, i + word.length - 1, 1]] } }), kind: 'inline', role: 'strong', on: { press }, decoration: formula('if', true, 'underline', 'none') };
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
