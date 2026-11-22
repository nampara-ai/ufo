// Runs the throwaway spike kernel over the packs in vectors/ and writes vectors/provisional/*.json.
// Where the generator (tools/vectors/generate.py) already states an expected value, the two are compared:
// the generator and the kernel were written separately, in different languages, by the same author.
import fs from 'fs'; import zlib from 'zlib'; import { start } from './binding/binding.mjs';
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

// ---- timeline (section 4.5): the kernel against the generator ----
{ const k = await open('timeline.ufx'); const tv = V.timeline;
  for (const c of tv.commits) {
    const r = k.query({ q: 'timeline', commit: c.commit, clock: tv.clock, marks: 'e5'.repeat(16), positions: c.playing_at.map(p => p.position) });
    check('timeline count ' + c.commit.slice(0, 8), r.t, c.t); check('timeline live elements', r.live, c.t);
    check('timeline anchors', r.anchors, c.anchors); check('timeline plays', r.plays_resolve_to, c.plays_resolve_to); check('timeline playing', r.playing_at, c.playing_at);
  } }

// ---- digests (section 4.4): at the last commit against the generator; then at every commit, for staleness ----
{ const k = await open('history.ufx'); const text = 'a1'.repeat(16), face = 'fa'.repeat(16), c1 = 'c1'.repeat(16);
  const [dt, df] = V.digests; const commits = k.query({ q: 'commits' }).reverse();
  const pinText = { q: 'digest', o: text, axis: 'chars', a: [c1, 0, 0], b: [c1, 6, 1], salt: dt.salt }, pinFace = { q: 'digest', o: face, salt: df.salt };
  const last = k.query(pinText), lastF = k.query(pinFace);
  check('digest of the text region', last.digest, dt.digest); check('covered value of the text region', last.covered_value_hex, dt.covered_value_hex);
  check('digest of the face', lastF.digest, df.digest); check('followed by the face', lastF.followed, df.followed);
  const pinWord = { q: 'digest', o: text, axis: 'chars', a: [c1, 7, 0], b: [c1, 14, 1], salt: dt.salt };
  const rows = commits.map(c => ({ commit: c.commit, height: c.height,
    text_region_before_c1_0_to_after_c1_6: k.query({ ...pinText, commit: c.commit }).digest,
    text_region_before_c1_7_to_after_c1_14: k.query({ ...pinWord, commit: c.commit }).digest,
    face_whole: k.query({ ...pinFace, commit: c.commit }).digest }));
  const stale = key => rows.map((r, i) => i === 0 ? 'made here' : r[key] === 'detached' ? 'detached' : r[key] === rows[0][key] ? 'current' : 'stale');
  out('staleness.json', { what: 'three pins made at the first commit of history.ufx, with the salt of the digests group, and their digests at each later commit. A pin is stale where the digest differs from the one it was made with (section 4.4)',
    salts: { text_regions: dt.salt, face: df.salt }, digests_by_commit: rows,
    state_by_commit: { text_region_before_c1_0_to_after_c1_6: stale('text_region_before_c1_0_to_after_c1_6'), text_region_before_c1_7_to_after_c1_14: stale('text_region_before_c1_7_to_after_c1_14'), face_whole: stale('face_whole') },
    notes: ['"Hello, " is never edited, and its one span still touches it: current throughout', 'the word "universe" is replaced at the second commit: every element the region covered is removed, so it is detached', 'the face\'s medium is set at the second commit and the text it refers to changes at the second and third: stale at both'] });
}

// ---- what travels (section 13.3) ----
{ const res = {};
  for (const f of ['minimal.ufx', 'history.ufx', 'nested.ufx', 'timeline.ufx']) { const k = await open(f); res[f] = k.query({ q: 'layers' }); }
  out('layers.json', { what: 'for each pack, every record by the layer it falls in at the last commit: content, attribution, working history (section 13.3). Seals are frames, not records, and always travel', packs: res });
  for (const [f, r] of Object.entries(res)) console.log(f, 'content', r.content.records, 'attribution', r.attribution.records, 'history', r.working_history.records);
}


// ---- projections and outlines (section 10.1, 10.2, Appendix B) ----
{ const cases = [
    ['history.ufx', { name: 'overview' }], ['history.ufx', { name: 'expand' }],
    ['history.ufx', { name: 'text', o: 'a1'.repeat(16) }], ['history.ufx', { name: 'object', o: 'a1'.repeat(16) }],
    ['history.ufx', { name: 'history', o: 'a1'.repeat(16) }], ['history.ufx', { name: 'why', o: 'a1'.repeat(16) }],
    ['history.ufx', { name: 'why', o: 'a1'.repeat(16), lo: 7, hi: 12 }],
    ['compose.ufx', { name: 'expand', o: '71'.repeat(16) }], ['compose.ufx', { name: 'expand', o: '71'.repeat(16), lo: 0, hi: 485 }],
    ['minimal.ufx', { name: 'overview' }], ['nested.ufx', { name: 'expand' }], ['timeline.ufx', { name: 'expand' }] ];
  const res = [];
  for (const [f, q] of cases) { const k = await open(f); const text = k.query({ q: 'project', ...q }); res.push({ pack: f, projection: q.name, arguments: Object.fromEntries(Object.entries(q).filter(([k]) => k !== 'name')), text }); if (text === null) console.log('NO ANSWER:', f, JSON.stringify(q)); }
  out('projections.json', { what: 'projections of the vector packs, as the text Appendix B fixes: the header, one record a line, and the count. Outlines are the projection `expand`', projections: res });
  console.log(res.filter(r => r.text).map(r => r.text).join('\n'));
}

// ---- a published copy (section 13.3): the generator's layers against the kernel's; the copy opened and read ----
{ const P = V.published; const whole = await open('history.ufx'), pub = await open('published.ufx');
  const lw = whole.query({ q: 'layers' }), lp = pub.query({ q: 'layers' });
  check('content layer of history.ufx', lw.content.hashes, P.content); check('attribution layer of history.ufx', lw.attribution.hashes, P.attribution);
  check('working history, count', lw.working_history.records, P.working_history_records);
  check('published copy: state', pub.query({ q: 'commits' })[0].commit, P.root_hash);
  check('published copy: nothing but the two layers', lp.working_history.records, 0);
  check('published copy: content', lp.content.hashes, P.content); check('published copy: attribution', lp.attribution.hashes, P.attribution);
  check('published copy: plain text', pub.sample({ as: 'text' }).text, P['a_reader_of_published.ufx'].plain_text_face);
  const text = 'a1'.repeat(16);
  check('published copy: why, as from the whole pack', pub.query({ q: 'project', name: 'why', o: text }), whole.query({ q: 'project', name: 'why', o: text }));
  console.log(pub.query({ q: 'project', name: 'history', o: text })); }
// ---- regions of every kind and the digest's cases (sections 4.2 to 4.4) ----
{ const P = V.pins; const k = await open('pins.ufx'), tl = await open('timeline.ufx');
  check('pins: every anchor resolved', k.query({ q: 'resolve', marks: P.marks_object }), P.anchors_resolve_to);
  for (const d of P.digests) { const { case: name, why, salt, covered_value_hex, followed, digest, pack, ...pin } = d;
    const r = (pack ? tl : k).query({ q: 'digest', salt, ...pin });
    check('pins digest: ' + name + ' (covered value)', r.covered_value_hex, covered_value_hex); check('pins digest: ' + name + ' (followed)', r.followed, followed); check('pins digest: ' + name, r.digest, digest); } }
// ---- the layers of the other packs, and their published copies (section 2.5) ----
for (const key of ['published_timeline', 'published_nested']) { const P = V[key]; const whole = await open(P.made_from), pub = await open(P.file);
  const lw = whole.query({ q: 'layers' }), lp = pub.query({ q: 'layers' });
  check(key + ': content', lw.content.hashes, P.content); check(key + ': attribution', lw.attribution.hashes, P.attribution); check(key + ': working history, count', lw.working_history.records, P.working_history_records);
  check(key + ': the copy holds nothing else', lp.working_history.records, 0); check(key + ': the copy lacks nothing it needs', lp.missing_from_content_or_attribution, 0);
  check(key + ': the copy has the same layers', [lp.content.hashes, lp.attribution.hashes], [P.content, P.attribution]);
  check(key + ': state', pub.query({ q: 'commits' })[0].commit, P.root_hash); }
{ const pub = await open('published-timeline.ufx'), whole = await open('timeline.ufx'), tv = V.timeline, c = tv.commits[3];
  const q = { q: 'timeline', clock: tv.clock, positions: c.playing_at.map(p => p.position) };
  check('published timeline: what plays, as from the whole pack', pub.query(q).playing_at, whole.query(q).playing_at);
  const pn = await open('published-nested.ufx'); const wn = await open('nested.ufx');
  check('published nested: plain text', pn.sample({ as: 'text' }).text, wn.sample({ as: 'text' }).text); }
console.log('agree', agree, 'differ', differ);
