// Runs the throwaway spike kernel over the packs in vectors/ and writes vectors/provisional/*.json.
// Where the generator (tools/vectors/generate.py) already states an expected value, the two are compared:
// the generator and the kernel were written separately, in different languages, by the same author.
import fs from 'fs'; import zlib from 'zlib'; import { start, records } from './binding/binding.mjs';
const root = new URL('../', import.meta.url);
const wasm = fs.readFileSync(new URL('spike/kernel/target/wasm32-unknown-unknown/release/ufo_spike_kernel.wasm', root));
const V = JSON.parse(fs.readFileSync(new URL('vectors/vectors.json', root)));
const STATUSES = JSON.parse(fs.readFileSync(new URL('../vectors/STATUS.json', import.meta.url))).files;
const noMeasure = () => ({ adv: 0, asc: 0, desc: 0 });
const open = async f => { const k = await start(wasm, noMeasure, b => zlib.inflateRawSync(b)); if (!await k.open(new Uint8Array(fs.readFileSync(new URL('vectors/' + f, root))))) throw new Error('does not open: ' + f); return k; };
const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
const out = (name, v) => fs.writeFileSync(new URL('vectors/provisional/' + name, root), JSON.stringify({ status: STATUSES['provisional/' + name], ...v }, null, 1) + '\n');
let agree = 0, differ = 0; const check = (what, a, b) => { if (same(a, b)) agree++; else { differ++; console.log('DIFFERS:', what, '\n  kernel   ', JSON.stringify(a), '\n  generator', JSON.stringify(b)); } };

// Everything below is asked through projections (SPEC-PLAYER 10.1, Appendix B) and nothing else: the kernel has no other door.
const rec = (k, q) => records(k.project({ full: true, ...q })), bare = x => String(x).replace(/^[a-z]:/, '');
const prop = (rs, key) => rs.find(r => r.is === 'prop' && r.key === key)?.value;
// an anchor as a projection writes it: what its one region resolved to, as the generator states it
const resolved = s => { const parts = String(s).split('/').slice(1); if (parts[0] === 'detached') return 'detached'; const reg = parts.find(p => !p.startsWith('r:')); if (!reg) return 'the whole object';
  const v = reg.slice(reg.indexOf('=') + 1), list = x => { try { return JSON.parse(x); } catch { return x.slice(1, -1).split(','); } }; return v === 'detached' ? v : v.startsWith('unclipped') ? { unclipped: list(v.slice(9)) } : list(v); };
const anchors = m => Object.fromEntries(Object.entries(m).map(([key, v]) => [key, resolved((v.at || v).$anchor)]));
const states = (k, o, commit) => { const t = k.project({ name: 'why', o, ...(commit ? { commit } : {}) }); return t === null ? null : records(t).filter(r => r.is === 'source').map(r => r.status); };
const playing = (k, clock, commit, positions) => positions.map(position => ({ position, plays: Object.fromEntries(rec(k, { name: 'expand', o: clock, axis: 't', lo: position, hi: position, ...(commit ? { commit } : {}) }).map(r => [r.label, resolved(r.at)[0]])) }));
const bytes = f => fs.readFileSync(new URL('vectors/' + f, root));

// ---- timeline (section 4.5): the kernel against the generator ----
{ const k = await open('timeline.ufx'); const tv = V.timeline;
  for (const c of tv.commits) {
    const clock = rec(k, { name: 'object', o: tv.clock, commit: c.commit }), marks = rec(k, { name: 'object', o: tv.marks_object, commit: c.commit });
    check('timeline count ' + c.commit.slice(0, 8), prop(clock, 't'), c.t); check('timeline live elements', clock.filter(r => r.is === 'run').reduce((n, r) => n + r.t[1] - r.t[0], 0), c.t);
    check('timeline anchors', anchors(prop(marks, 'marks')), c.anchors); check('timeline plays', anchors(prop(clock, 'plays')), c.plays_resolve_to);
    check('timeline playing', playing(k, tv.clock, c.commit, c.playing_at.map(p => p.position)), c.playing_at.map(p => ({ position: p.position, plays: p.plays })));
  }
  check('timeline: the stored pin to three seconds is current', states(k, tv.pinned_object), ['current']); }

// ---- pins (section 4.4): stored in history.ufx as the sources of two objects, and read back with `why` at each commit ----
{ const k = await open('history.ufx'), P = V.history_pack.pinned, commits = k.commits().reverse();
  check('commits of history.ufx', commits.map(c => c.commit), V.history_pack.commits.map(c => c.root_hash));
  for (const which of ['made_at_the_first_commit', 'made_at_the_last_commit']) for (const [at, expected] of Object.entries(P[which].states))
    check(`pins ${which.replace(/_/g, ' ')}, at ${at}`, states(k, P[which].object, commits[+at.slice(7)].commit), expected);
  check('pins: none where the object is not yet', states(k, P.made_at_the_first_commit.object, commits[0].commit), null); }

// ---- projections and outlines (section 10.1, 10.2, Appendix B) ----
{ const cases = [
    ['history.ufx', { name: 'expand' }],
    ['history.ufx', { name: 'text', o: 'a1'.repeat(16) }], ['history.ufx', { name: 'object', o: 'a1'.repeat(16) }],
    ['history.ufx', { name: 'history', o: 'a1'.repeat(16) }], ['history.ufx', { name: 'why', o: 'a1'.repeat(16) }],
    ['history.ufx', { name: 'why', o: 'a1'.repeat(16), lo: 7, hi: 12 }],
    ['compose.ufx', { name: 'expand', o: '71'.repeat(16) }], ['compose.ufx', { name: 'expand', o: '71'.repeat(16), lo: 0, hi: 485 }],
    ['minimal.ufx', { name: 'expand' }], ['nested.ufx', { name: 'expand' }], ['timeline.ufx', { name: 'expand' }] ];
  const res = [];
  for (const [f, q] of cases) { const k = await open(f); const text = k.project({ ...q }); res.push({ pack: f, projection: q.name, arguments: Object.fromEntries(Object.entries(q).filter(([k]) => k !== 'name')), text }); if (text === null) console.log('NO ANSWER:', f, JSON.stringify(q)); }
  out('projections.json', { what: 'projections of the vector packs, as the text Appendix B fixes: the header, one record a line, and the count. Outlines are the projection `expand`', projections: res });
  console.log(res.filter(r => r.text).map(r => r.text).join('\n'));
}

// ---- published copies (sections 2.5, 13.3): the kernel publishes each pack, and the bytes are the generator's; then the copy is opened and read ----
const sameBytes = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
for (const [P, text] of [[V.published, 'a1'.repeat(16)], [V.published_timeline, null], [V.published_nested, null]]) {
  const whole = await open(P.made_from), pub = await open(P.file), key = P.file;
  check(key + ': the kernel publishes the same bytes', sameBytes(whole.published(), bytes(P.file)), true);
  check(key + ': a published copy published again is itself', sameBytes(pub.published(), bytes(P.file)), true);
  check(key + ': state', pub.commits()[0].commit, P.root_hash);
  const lw = whole.layers(false), lp = pub.layers();
  check(key + ': nothing of the third layer, and the two others as the whole pack has them', [lp.history.bytes, lp.lacks.history, lp.content.bytes, lp.attribution.bytes], [0, true, lw.content.bytes, lw.attribution.bytes]);
  check(key + ': plain text', pub.sample({ as: 'text' })?.text, whole.sample({ as: 'text' })?.text);
  if (text) { check(key + ': plain text, as the generator states it', pub.sample({ as: 'text' }).text, P['a_reader_of_published.ufx'].plain_text_face);
    check(key + ': why, as from the whole pack', pub.project({ name: 'why', o: text }), whole.project({ name: 'why', o: text })); console.log(pub.project({ name: 'history', o: text })); } }
{ const pub = await open('published-timeline.ufx'), whole = await open('timeline.ufx'), tv = V.timeline, at = tv.commits[3].playing_at.map(p => p.position);
  check('published timeline: what plays, as from the whole pack', playing(pub, tv.clock, null, at), playing(whole, tv.clock, null, at)); }
// ---- regions of every kind and the digest's cases (sections 4.2 to 4.4) ----
{ const P = V.pins, k = await open('pins.ufx');
  check('pins: every anchor resolved', anchors(prop(rec(k, { name: 'object', o: P.marks_object }), 'marks')), P.anchors_resolve_to);
  const here = P.digests.filter(d => !d.pack); check('pins: each stored pin is current, so each digest is the generator\'s', states(k, P.pinned_object), here.map(() => 'current'));
  console.log(k.project({ name: 'why', o: P.pinned_object })); }
console.log('agree', agree, 'differ', differ);
