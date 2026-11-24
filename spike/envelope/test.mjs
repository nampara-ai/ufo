// The acceptance steps of the envelope spike in headless browsers (Playwright), each asserted and printed.
//   node spike/envelope/test.mjs                      every engine installed, one after another; then one table, step by context by engine,
//                                                     and the quirks corpus (quirks.mjs)
//   node spike/envelope/test.mjs --engine chromium|firefox|webkit      one engine
// (after `cargo build` of the kernel). The page is driven only by real input: clicks or taps on its canvases, keys (Tab, Enter, Space,
// typing, Backspace, copy and paste), its two buttons, and the browser's own prompt. What is read back comes from the page's read-only
// `ufo` (the lists last drawn; kernel queries), from the browser's accessibility roles (Playwright's role queries and aria snapshots, which
// work the same in the three engines), from the page's elements, and from the files it saves.
// No picture is taken of a page that is being asserted: Playwright's screenshot puts a style element into the page, which in WebKit the
// page's own policy refuses (vectors/quirks: harness). Pictures are taken at the end, of pages opened for nothing else.
import fs from 'fs'; import os from 'os'; import path from 'path'; import http from 'http'; import zlib from 'zlib'; import { execFileSync, spawn } from 'child_process'; import { fileURLToPath, pathToFileURL } from 'url';
import { start, commitsOf, layersOf } from '../binding/binding.mjs'; import { kernelWasm, shipped as minified, MINIFY } from './parts.mjs'; import { envelope } from './envelope.mjs'; import { tree, flat } from './nodes.mjs';
import { playwright, launch, executable, ENGINES } from './engines.mjs';
const { devices } = playwright, here = p => fileURLToPath(new URL(p, import.meta.url)), out = here('../out/'), shots = here('../out/shots/');
const arg = n => (i => i < 0 ? null : process.argv[i + 1])(process.argv.indexOf('--' + n)), engineName = arg('engine') || 'all';
const STEPS = ['kernel', 'host', 'opened', 'pure function', 'faces', 'node boxes', 'accessible', 'keyboard', 'edit', 'one word', 'paragraph start', 'typed', 'what will leave', 'saved', 'published', 'policy', 'reopened', 'no tools', 'safeguard', 'decisions', 'asset', 'table', 'contained', 'components', 'seals', 'damage', 'sent on', 'static face', 'reader', 'valid', 'quirks'];
const CONTEXTS = ['Node', 'desktop, file://', 'http origin', 'phone, larger', 'phone, smaller', 'scripts off', 'reader', 'validators'];
if (![...ENGINES, 'all'].includes(engineName)) { console.error('--engine chromium|firefox|webkit'); process.exit(2); }

// ---- every engine: each in its own process, then one table ----
if (engineName === 'all') {
  const run = (script, args, log) => new Promise(done => { const c = spawn('node', [here(script), ...args], { stdio: ['ignore', 'pipe', 'pipe'] }), f = fs.createWriteStream(log); c.stdout.pipe(f); c.stderr.pipe(f); c.on('close', done); });
  const res = {};
  for (const e of ENGINES) {
    if (!executable(e)) { console.log(`${e}: not installed here, not attempted`); continue; }
    const log = path.join(out, `envelope-test-output-${e}.txt`), t0 = Date.now(); process.stdout.write(`${e}: running (output in ${path.relative(process.cwd(), log)}) … `);
    const code = await run('test.mjs', ['--engine', e], log); res[e] = JSON.parse(fs.readFileSync(path.join(out, `envelope-test-results-${e}.json`), 'utf8'));
    console.log(`${res[e].total - res[e].failures} of ${res[e].total} passed, exit ${code}, ${Math.round((Date.now() - t0) / 1000)} s`);
  }
  const qlog = path.join(out, 'quirks-output.txt'); await run('quirks.mjs', [], qlog); const quirks = JSON.parse(fs.readFileSync(path.join(out, 'quirks-results.json'), 'utf8'));
  const names = Object.keys(res), mark = { passed: 'p', failed: 'F' }, cell = (s, c) => names.map(e => s === 'quirks' ? (c === 'Node' ? (quirks.engines[e] ? (quirks.engines[e].failed ? 'F' : 'p') : '-') : '-') : mark[res[e].results[c]?.[s]] || '-').join('');
  console.log(`\nstep × context × engine. In each cell one letter an engine, in the order ${names.join(', ')}: p passed, F FAILED, - not attempted there.`);
  console.log(`The phones are each engine's own: ${names.map(e => `${e}: ${res[e].phones.join(' and ')}`).join('; ')}.\n`);
  const w = Math.max(...STEPS.map(s => s.length)); console.log(['step'.padEnd(w), ...CONTEXTS].join(' | '));
  for (const s of STEPS) console.log([s.padEnd(w), ...CONTEXTS.map(c => cell(s, c).padEnd(c.length))].join(' | '));
  console.log('\ntotals: ' + names.map(e => `${e} ${res[e].total - res[e].failures} of ${res[e].total} checks passed`).join('; ') + `; quirks corpus ${quirks.passed} of ${quirks.total}`);
  console.log(fs.readFileSync(qlog, 'utf8').split('\n').filter(l => /^\s*(entry|\d\d-|harness)/.test(l)).join('\n'));
  const failed = names.some(e => res[e].failures) || quirks.failed || names.length < ENGINES.length;
  fs.writeFileSync(path.join(out, 'envelope-test-results.json'), JSON.stringify({ engines: res, quirks }, null, 1)); process.exit(failed ? 1 : 0);
}

const READER = '/tmp/claude-0/-home-user-ufo/4e3fe0fb-2c81-5333-8e7a-895d1e899d40/scratchpad/readertest2';   // run.py, universe.py, ufo.py: the independent reader; copied from here for each run, never modified
if (!executable(engineName)) { console.log(`${engineName} is not installed here: not attempted`); process.exit(3); }
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ufo-envelope-test-'));   // downloads, served files and the reader's copy: not kept
fs.mkdirSync(shots, { recursive: true });
const MADE = '2026-01-02', T = '71'.repeat(16);   // the date given to make.mjs; the text object of compose.ufx
const make = (pack, file, ...more) => execFileSync('node', [here('make.mjs'), pack, file, '--date', MADE, ...more]);
// the name a copy is given, by the rule the tools universe states as a formula (mkpack.mjs): `n` copies were saved from the page before it
const nameOf = (file, mark, n) => { const stem = path.basename(file).replace(/\.ufx\.html$/, ''); return (stem.endsWith(mark) ? `${stem}-${n + 2}` : stem + mark + (n ? `-${n + 1}` : '')) + '.ufx.html'; };
const original = path.join(work, 'compose.ufx.html'); make(here('../../vectors/compose.ufx'), original);

const results = {};   // results[context][step] = 'passed' | 'failed'
let failures = 0, total = 0, env = '';
const step = (name, ok, detail = '') => { const key = name.split(':')[0]; (results[env] ||= {})[key] = results[env][key] === 'failed' || !ok ? 'failed' : 'passed'; total++; if (!ok) failures++; console.log(`  [${ok ? 'passed' : 'FAILED'}] ${name}${detail ? ' — ' + detail : ''}`); return ok; };
const check = async (name, f) => { try { const r = await f(); return step(name, r !== false, typeof r === 'string' ? r : ''); } catch (e) { return step(name, false, String(e && e.message || e).split('\n')[0].slice(0, 500)); } };
const must = (c, why) => { if (!c) throw Error(why); };
const same = (a, b, why) => must(JSON.stringify(a) === JSON.stringify(b), `${why}: ${JSON.stringify(a)} is not ${JSON.stringify(b)}`);

// ---- a kernel in Node, for what is computed independently of the page: the static face of a pack, its state, its nodes ----
import { nodeKernel, ask, packOf } from './ask.mjs'; import { createHash } from 'crypto';
const inNode = async pack64 => { const k = await nodeKernel(); must(await k.open(new Uint8Array(Buffer.from(pack64, 'base64'))), 'the pack does not open in Node');
  return { html: k.sample({ as: 'static' }).html, text: k.sample({ as: 'text' }).text, head: k.commits()[0].commit, nodes: flat(tree(k.sample({ as: 'list', w: 600 }).list)), layers: k.layers(),
    leaving: history => k.project({ name: 'leaving', history }), history: k.project({ name: 'history', o: T }).split('\n').filter(l => l.startsWith('change ')) }; };
const packIn = f => /<script type="application\/x-ufo-pack">([^<]*)</.exec(fs.readFileSync(f, 'utf8'))[1];
// the frames of a pack, by kind (SPEC 2.1), and the value of each `absent` frame as far as this needs it
const framesOf = pack64 => { const d = Buffer.from(pack64, 'base64'), kinds = {}; let off = 8, absent = 0; while (off < d.length) { const kind = d[off]; let n = 0, sh = 0, p = off + 2, b; do { b = d[p++]; n += (b & 127) * 2 ** sh; sh += 7; } while (b & 128);
  kinds[kind] = (kinds[kind] || 0) + 1; if (kind === 6 && d.subarray(p, p + n).toString('latin1').includes('ghistory\xf5')) absent++; off = p + n; } return { kinds, absent }; };

// ---- in the page ----
// The parts, each as the text of the element that carries it: read by the test itself, not through the page's script.
const partsOf = page => page.evaluate(() => { const t = s => document.querySelector(s).textContent, d = n => t(`script[type="application/x-ufo-${n}"]`);
  return { title: document.title, style: t('style'), script: t('script[type=module]'), kernel: d('kernel'), 'kernel-hash': document.querySelector('script[type="application/x-ufo-kernel"]').dataset.hash, pack: d('pack'), skeleton: d('skeleton') }; });
// What was last drawn: the text items of each list with where they are in CSS pixels of its canvas, and whether a stroke underlines them.
const look = page => page.evaluate(() => { const texts = [], lists = ufo.drawn();
  lists.forEach((l, on) => { const st = [[1, 0, 0]]; l.forEach(([kind, it], i) => { const m = st[st.length - 1];
    if (kind === 'push') st.push(it.m ? [m[0] * it.m[0], m[1] + m[0] * it.m[4], m[2] + m[0] * it.m[5]] : m); else if (kind === 'pop') st.pop();
    else if (kind === 'text') texts.push({ s: it.s, on, X: m[1] + m[0] * it.x, Y: m[2] + m[0] * it.y, adv: m[0] * it.adv, size: m[0] * it.size, press: it.press ? it.press[1] || true : null, value: it.value, src: !!it.src, mono: it.font[0] === 'monospace', serif: it.font[0] === 'serif', weight: it.weight, slant: !!it.slant,
      lit: !!(l[i + 1] && l[i + 1][0] === 'path' && l[i + 1][1].stroke && l[i + 1][1].d.length === 2) }); }); });
  const rings = lists.map(l => l.filter(i => i[0] === 'path' && i[1].stroke && i[1].d.length === 5 && !i[1].fill).length);
  return { texts, rings, pages: lists[1].filter(i => i[0] === 'push' && i[1].clip).length, all: texts.map(t => t.s).join(''), said: texts.filter(t => t.on === 0 && t.serif && !t.press).map(t => t.s).join('') }; });
const headOf = async page => commitsOf(await ask(page, { name: 'history', full: true }))[0];
const whyOf = async (page, lo, hi) => (await ask(page, { name: 'why', o: T, lo, hi })).split('\n').filter(l => l.startsWith('run '));
const workOf = async (page, change) => JSON.parse((await ask(page, { name: 'object', o: change })).split('\n').find(l => l.startsWith('prop key=work')).slice(20)).ops.map(o => o.op === 'splice' ? [o.old ?? '', o.ins ?? ''] : ['set', o.key.join('.')]);
const charsOf = async page => { const s = (await ask(page, { name: 'text', o: T })).split('\n')[1]; return JSON.parse(s.slice(s.indexOf(' s=') + 3)); };
const spansOf = async page => Object.fromEntries(Object.entries(JSON.parse((await ask(page, { name: 'object', o: T })).split('\n').find(l => l.startsWith('prop key=spans')).slice(21))).map(([k, s]) => [k, /chars=\[(\d+),(\d+)\]/.exec(s.at.$anchor).slice(1).map(Number)]));
const inked = page => page.evaluate(() => { const c = document.querySelectorAll('#ufo-player canvas')[1], o = document.createElement('canvas'); o.width = c.width; o.height = Math.min(c.height, 4000); const g = o.getContext('2d', { willReadFrequently: true }); g.drawImage(c, 0, 0); const d = g.getImageData(0, 0, o.width, o.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] && d[i] + d[i + 1] + d[i + 2] < 384) n++; return n; });
const focused = page => page.evaluate(() => { const a = document.activeElement; return { tag: a.localName, role: a.getAttribute('role'), label: a.getAttribute('aria-label'), text: (a.textContent || '').trim(), pressed: a.getAttribute('aria-pressed'), current: a.getAttribute('aria-current'), seen: a.matches(':focus-visible'), outline: getComputedStyle(a).outlineStyle }; });
const flatten = s => s.replace(/\s+/g, '');

// ---- the origin the file is sent on to: a server that keeps a record of every request made of it ----
const served = path.join(work, 'served'), hits = []; fs.mkdirSync(served, { recursive: true });
const server = http.createServer((q, r) => { hits.push(q.url); const f = path.join(served, path.basename(decodeURIComponent(q.url))); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(fs.readFileSync(f)); });
await new Promise(ok => server.listen(0, '127.0.0.1', ok)); const origin = 'http://127.0.0.1:' + server.address().port;

// One context: a way of making browser contexts, a way of turning a file into an address, whether to tap, and the edits to make.
const EDITS = { para: 'Every figure', word: ['ledger', 'books'], start: ['Nothing here', 'Note: '], back: ['The appendix', ' by accident'], paste: ['Revenue grew', 'region'], none: 'First point', whole: ['What gets measured', 'trusted', 'known'], second: { para: 'Where a number', words: [['number', 'total'], ['kept', 'shown']] } };
async function environment(name, browser, options, address, { touch = false, first = original, kit = false, edits = EDITS, more = false, label = name } = {}) {
  env = name; console.log(`\n== ${label}`);
  const canvases = page => page.locator('#ufo-player canvas'), entry = page => page.locator('#ufo-entry'), area = page => page.locator('#ufo-entry textarea');
  const pressAt = async (page, t) => { must(t, 'nothing to press'); const c = canvases(page).nth(t.on);
    if (!t.on) await page.evaluate(y => { const top = document.getElementById('ufo-top'); if (y - top.scrollTop > top.clientHeight - 24 || y < top.scrollTop + 12) top.scrollTop = Math.max(0, y - top.clientHeight / 2); }, t.Y);   // what is held at the top scrolls within itself where it is taller than the view
    if (t.on) await page.evaluate(y => { const r = document.querySelectorAll('#ufo-player canvas')[1].getBoundingClientRect(), top = document.getElementById('ufo-top').getBoundingClientRect().bottom; if (r.top + y < top + 30 || r.top + y > innerHeight - 40) scrollBy(0, r.top + y - (top + innerHeight) / 2); }, t.Y);
    const b = await c.boundingBox(), x = b.x + t.X + Math.min(t.adv / 2, 30), y = b.y + t.Y - t.size / 3; await (touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y)); };
  const press = async (page, starts) => pressAt(page, (await look(page)).texts.find(t => t.s.trim().startsWith(starts)));
  const hit = (page, sel) => touch ? page.locator(sel).tap() : page.locator(sel).click();
  // one of the two kinds of copy, by its last word: on a narrow screen the words of a button may be drawn on two lines
  const choose = async (page, mode) => pressAt(page, (await look(page)).texts.find(t => t.press && t.on === 0 && t.s.includes(mode.split(' ').pop())));
  const open = async (file, who) => {
    const context = await browser.newContext({ acceptDownloads: true, ...options }), page = await context.newPage(), log = { requests: [], errors: [], asked: [], hits: hits.length };
    // every policy violation the page reports, from before its first script: a script added by the test's own means, which the page's policy does not govern
    await context.addInitScript(() => { globalThis.__violations = []; document.addEventListener('securitypolicyviolation', e => __violations.push(`${e.violatedDirective} ${e.blockedURI}`)); });
    await context.route('**/*', route => { log.requests.push(route.request().url()); route.continue(); });
    page.on('console', m => log.errors.push(`${m.type()}: ${m.text()}`)); page.on('pageerror', e => log.errors.push('error: ' + String(e)));
    page.on('dialog', d => { log.asked.push(d.message()); d.accept(who); });   // the browser's own prompt: the reader asking who its principal is
    const url = address(file); await page.goto(url); await page.waitForFunction(() => globalThis.ufo, null, { timeout: 15000 });
    return { context, page, log, url };
  };
  // The claim: nothing leaves the page and nothing is fetched into it. Asserted four ways, each valid in every engine: no request is seen by the
  // test's interception but the one for the file (an engine that does not report its reading of a local file shows none: Firefox); the page's own
  // record of what it fetched is empty; the server it came from, if any, was asked for the file once and for nothing else; no policy violation was
  // reported (a request the policy stopped would be one) and nothing was written to the console.
  const quiet = async (page, log, url) => {
    must(log.requests.every(r => r === url) && log.requests.length <= 1, 'requests seen: ' + JSON.stringify(log.requests));
    same(await page.evaluate(() => performance.getEntriesByType('resource').map(e => e.name)), [], 'the page fetched');
    if (url.startsWith('http')) same(hits.slice(log.hits), [new URL(url).pathname], 'the server was asked for');
    same(await page.evaluate(() => globalThis.__violations), [], 'policy violations'); same(log.errors, [], 'console'); same(log.asked, [], 'the browser\'s own dialogs (the reader has no question of its own)');
    return `${log.requests.length} seen by interception${url.startsWith('http') ? ', 1 by the server' : ''}, 0 fetched by the page, 0 violations, 0 console messages`;
  };
  // the page's own text is envelope(its parts): the parts from its elements, the static face and the state from a kernel in Node
  const pure = async (page, file) => { const bytes = fs.readFileSync(file, 'utf8'), date = /Exported (\d{4}-\d\d-\d\d)\. /.exec(bytes.slice(0, 200))[1], parts = await partsOf(page), st = await inNode(parts.pack);
    must(envelope({ ...parts, 'static-html': st.html, date }) === bytes, 'the file is not envelope(its parts)'); must(st.head === (await headOf(page)).commit, 'the pack in the file is not at the state the page shows'); return { bytes, date, parts }; };
  const editOn = async page => { if (!(await look(page)).texts.find(t => t.s === 'Edit').lit) await press(page, 'Edit'); must((await look(page)).texts.find(t => t.s === 'Edit').lit, 'Edit does not show that editing is on'); };
  // Through the tools, by typing: turn editing on if it is off, press a block, do things in the widget with the keyboard, then Done (or Cancel).
  // `act(old, keys)` gets the text the widget holds and the means: caret(a, b) puts the caret or a selection (the only thing not done by a key), type, key.
  // who is making the changes: the field the tools show while editing is on. Pressed, it mounts the same widget; the name is typed over what it holds
  const giveName = async (page, who) => { await editOn(page); const t = (await look(page)).texts.find(t => t.value !== undefined); must(t, 'no field for the name'); if (t.value === who) return 0;
    await pressAt(page, t); await entry(page).waitFor({ state: 'visible', timeout: 3000 }); const a = area(page); must(await a.inputValue() === t.value, 'the widget holds ' + await a.inputValue()); await a.evaluate(el => el.setSelectionRange(0, el.value.length));
    await page.keyboard.type(who); await hit(page, '#ufo-entry button >> nth=0'); await entry(page).waitFor({ state: 'hidden', timeout: 3000 }); must((await look(page)).texts.find(t => t.value === who), 'the name is not shown'); return 1; };
  const edit = async (page, log, who, para, act, { done = true, changes = true } = {}) => {
    const named = await giveName(page, who); await press(page, para); await entry(page).waitFor({ state: 'visible', timeout: 3000 });
    const a = area(page), old = await a.inputValue(); must(old.startsWith(para), 'the widget holds: ' + old.slice(0, 40)); must(await page.evaluate(() => document.activeElement.localName) === 'textarea', 'the widget does not have the focus');
    await act(old, { caret: (from, to = from) => a.evaluate((el, [from, to]) => el.setSelectionRange(from, to), [from, to]), type: s => page.keyboard.type(s), key: async (k, n = 1) => { for (let i = 0; i < n; i++) await page.keyboard.press(k); }, area: a });
    const s = await a.inputValue(), before = await headOf(page); await hit(page, done ? '#ufo-entry button >> nth=0' : '#ufo-entry button >> nth=1');
    await entry(page).waitFor({ state: 'hidden', timeout: 3000 }); const head = await headOf(page), l = await look(page);
    if (!changes) { must(head.commit === before.commit, 'a change was made'); return { old, s, head }; }
    must(head.height === before.height + 1, 'no change was made: ' + l.said);
    must(new RegExp(`change\\s*o:${head.change.slice(0, 8)}\\s*by\\s*${who.replace(' ', '\\s*')}\\.\\s*Not\\s*yet\\s*in\\s*a\\s*file`).test(l.said), 'the status does not say who changed it: ' + l.said);
    const chars = await charsOf(page); return { old, s, head, lo: chars.indexOf(s), named, ops: await workOf(page, head.change) };
  };
  const replaceWord = ([from, to]) => async (old, k) => { const at = old.indexOf(from); must(at >= 0, 'no ' + from); await k.caret(at, at + from.length); await k.type(to); };

  // ---- what an accessibility tree is given: asked of the browser by role, as assistive technology asks ----
  const accessible = async (page, parts) => {
    const want = (await inNode(parts.pack)).nodes, player = page.locator('#ufo-player'), doc = page.getByRole('document', { name: 'The document these tools work on' }), bar = page.getByRole('toolbar', { name: 'Tools' });
    const tools = async () => Promise.all((await bar.getByRole('button').all()).map(async b => [await b.textContent(), await b.getAttribute('aria-current'), await b.getAttribute('aria-pressed')]));
    await check('accessible: the canvases are hidden from it; the language is declared; the headings, with their levels and names', async () => {
      same(await canvases(page).evaluateAll(cs => cs.map(c => c.getAttribute('aria-hidden'))), ['true', 'true'], 'aria-hidden'); must(await page.evaluate(() => document.documentElement.lang) === 'en' && await bar.getAttribute('lang') === 'en', 'no language');
      const heads = want.filter(n => n.role === 'heading').map(n => [n.level, n.text]); must(heads.length >= 2, 'the pack has no headings to find');
      for (const [level, name] of heads) must(await doc.getByRole('heading', { name, level, exact: true }).count() === 1, `no heading ${level} ${name}`);
      same(await doc.getByRole('heading').evaluateAll(hs => hs.map(h => [+h.localName[1], h.textContent])), heads, 'the headings'); return heads.map(h => `h${h[0]} "${h[1]}"`).join(', ');
    });
    await check('accessible: the paragraphs in order, the list with its nested numbered items, the quote and the code', async () => {
      same(await doc.getByRole('paragraph').allTextContents(), want.filter(n => n.role === 'paragraph').map(n => n.text), 'the paragraphs');
      const lists = doc.getByRole('list'); must(await lists.count() === 2, 'not two lists'); const items = (l) => l.locator(':scope > [role=listitem]');
      same(await items(lists.first()).evaluateAll(is => is.map(i => [...i.childNodes].filter(n => n.nodeType === 3).map(n => n.data).join(''))), want.filter(n => n.role === 'item' && n.level === 1).map(n => n.text), 'the items');
      const inner = items(lists.first()).nth(1).getByRole('list'); same(await inner.getByRole('listitem').allTextContents(), ['1. A numbered step.', '2. Another numbered step.'], 'the numbered items, in the second item');
      must(await doc.getByRole('listitem').count() === 5, 'not five items in all');
      const quote = want.find(n => n.role === 'quote').text, code = want.find(n => n.role === 'code').text; must(await doc.getByRole('blockquote').textContent() === quote, 'the quote'); must(await doc.locator('pre').textContent() === code && code.includes('\n'), 'the code, with its line break');
      const snap = await player.ariaSnapshot(); for (const l of ['- toolbar "Tools":', '- document "The document these tools work on":', '  - heading "The Quarterly Review" [level=1]', '  - list:', '      - list:', '        - listitem: 1. A numbered step.', '  - blockquote: ' + quote]) must(snap.split('\n').includes(l), 'the snapshot has no line ' + l);
      fs.writeFileSync(path.join(out, `aria-${engineName}.txt`), snap + '\n'); return `${want.filter(n => n.role === 'paragraph').length} paragraphs, 2 lists, 5 items; snapshot in out/aria-${engineName}.txt`;
    });
    await check('accessible: the six tools are buttons that say how they stand, before and after Pages and Edit are pressed; the state is a status; the name is asked for by a labelled field', async () => {
      same(await tools(), [['Document', 'true', null], ['Pages', 'false', null], ['Text', 'false', null], ['Edit', null, 'false'], ['Save', null, 'false'], ['Changes', null, 'false']], 'at first');
      must(await bar.getByRole('button', { name: 'Edit', pressed: false }).count() === 1 && await page.getByRole('status').count() === 1, 'Edit is not a toggle that is off, or there is no status');
      await press(page, 'Pages'); same(await tools(), [['Document', 'false', null], ['Pages', 'true', null], ['Text', 'false', null], ['Edit', null, 'false'], ['Save', null, 'false'], ['Changes', null, 'false']], 'after Pages');
      const regions = await doc.getByRole('region').evaluateAll(rs => rs.map(r => r.getAttribute('aria-label'))); must(regions.length >= 2 && regions[0] === 'Page 1' && regions[1] === 'Page 2', 'the pages are not regions: ' + regions);
      same(await doc.getByRole('paragraph').allTextContents(), want.filter(n => n.role === 'paragraph').map(n => n.text), 'the paragraphs of the pages (one that runs over a page is still one)');
      await press(page, 'Edit'); same(await tools(), [['Document', 'false', null], ['Pages', 'true', null], ['Text', 'false', null], ['Edit', null, 'true'], ['Save', null, 'false'], ['Changes', null, 'false']], 'after Edit');
      must(await bar.getByRole('button', { name: 'Edit', pressed: true }).count() === 1, 'Edit is not pressed'); must(await doc.locator('[tabindex="0"]').count() === 0, 'the blocks can be reached before a name is given');
      const field = page.getByRole('textbox', { name: 'Your name, to record with the changes you make' }); must(await field.count() === 1 && await field.getAttribute('tabindex') === '0' && /first give your name/.test(await page.getByRole('status').textContent()), 'no field for the name, or the status does not ask for it');
      await giveName(page, 'Ada Tester'); must(await field.textContent() === 'Ada Tester' && /recorded as made by Ada Tester/.test(await page.getByRole('status').textContent()), 'the name is not in the field, or the status does not say it'); must(await doc.locator('[tabindex="0"]').count() >= 10, 'the blocks cannot be reached');
      await press(page, 'Edit'); await press(page, 'Document'); same(await tools(), [['Document', 'true', null], ['Pages', 'false', null], ['Text', 'false', null], ['Edit', null, 'false'], ['Save', null, 'false'], ['Changes', null, 'false']], 'back');
      must(await doc.locator('[tabindex]').count() === 0 && await page.getByRole('textbox').count() === 0, 'blocks can still be reached with editing off, or the field is still there'); return 'aria-current on the three that choose, aria-pressed on Edit and Save; the name is asked for by a field of the tools, named, and by the status';
    });
  };
  // ---- the keyboard alone: Tab to Edit, Enter, Tab to a paragraph, Enter, type, Tab to Done, Enter, back to Save, Enter: a file ----
  const keyboard = async file => {
    const { context, page, log, url } = await open(file, 'Kay Board'); let at = null;
    const tab = async (want, key = 'Tab', most = 40) => { for (let i = 0; i < most; i++) { await page.keyboard.press(key); at = await focused(page); if (want(at)) return i + 1; } throw Error('not reached; the focus is on ' + JSON.stringify(at)); };
    await check('keyboard: Tab reaches each tool in order, each shown by a ring; Enter on Edit turns editing on and says so', async () => {
      const seq = []; for (const w of ['Document', 'Pages', 'Text', 'Edit']) { await tab(() => true, 'Tab', 1); seq.push(at.text); must(at.role === 'button' && at.text === w, 'Tab went to ' + JSON.stringify(at)); must((await look(page)).rings[0] === 1, 'no ring is drawn on ' + w); }
      await page.keyboard.press('Enter'); at = await focused(page); must(at.text === 'Edit' && at.pressed === 'true', 'Edit is not pressed, or lost the focus: ' + JSON.stringify(at));
      await page.keyboard.press('Space'); must((await focused(page)).pressed === 'false', 'Space did not press it'); await page.keyboard.press('Space'); must((await focused(page)).pressed === 'true', 'Space did not press it again'); return seq.join(', ') + '; Enter and Space press';
    });
    let made = null;
    await check('keyboard: Tab to the field for the name, Enter, type, Tab to Done, Enter: the name is set, with no dialog, and the focus is back on the field', async () => {
      const n = await tab(a => a.role === 'textbox'); must(at.label === 'Your name, to record with the changes you make', 'the field is not named: ' + JSON.stringify(at)); await page.keyboard.press('Enter'); await entry(page).waitFor({ state: 'visible', timeout: 3000 });
      must((await focused(page)).tag === 'textarea', 'the edit box has not the focus'); await page.keyboard.type('Kay Board'); await tab(a => a.tag === 'button' && a.text === 'Done', 'Tab', 2); await page.keyboard.press('Enter'); await entry(page).waitFor({ state: 'hidden', timeout: 3000 });
      at = await focused(page); must(at.role === 'textbox' && at.text === 'Kay Board' && !log.asked.length, 'the focus is on ' + JSON.stringify(at)); return `${n} Tabs from Edit (Save, then the field)`;
    });
    await check('keyboard: Tab to a paragraph, Enter opens the labelled edit box, typing, Tab to Done, Enter: changed, and the focus is back on the paragraph', async () => {
      const n = await tab(a => a.tag === 'p' && a.text.startsWith('Readers who')); must((await look(page)).rings[1] === 1, 'no ring on the paragraph'); const y = await page.evaluate(() => scrollY);
      await page.keyboard.press('Enter'); await entry(page).waitFor({ state: 'visible', timeout: 3000 });
      must(await page.getByRole('textbox', { name: 'The text being changed' }).count() === 1 && (await focused(page)).tag === 'textarea', 'the edit box is not labelled, or has not the focus');
      await page.keyboard.type('Keyed in. '); await tab(a => a.tag === 'button' && a.text === 'Done', 'Tab', 2); must(at.seen && at.outline !== 'none', 'Done shows no focus: ' + JSON.stringify(at)); const h = await headOf(page);
      await page.keyboard.press('Enter'); await entry(page).waitFor({ state: 'hidden', timeout: 3000 }); const head = await headOf(page); must(head.height === h.height + 1, 'no change');
      at = await focused(page); must(at.tag === 'p' && at.text.includes('Keyed in.'), 'the focus is on ' + JSON.stringify(at)); made = head; return `${n} more Tabs to the paragraph (the page scrolled to ${y}); the work: ${JSON.stringify(await workOf(page, head.change))}`;
    });
    await check('keyboard: back to Save with Shift+Tab, Enter opens what will leave; Tab to the choice and Enter, Tab to "Save this copy", Enter: a file comes down, and the status says so', async () => {
      const n = await tab(a => a.role === 'button' && a.text === 'Save', 'Shift+Tab'); await page.keyboard.press('Enter'); at = await focused(page); must(at.text === 'Save' && at.pressed === 'true', 'Save does not say the panel is open: ' + JSON.stringify(at));
      must(await page.getByRole('region', { name: 'What will leave' }).count() === 1, 'no panel'); await tab(a => a.role === 'button' && a.text === 'For people working on this'); must(at.current === 'false', 'the copy for people working on this is chosen from the start');
      await tab(() => true, 'Tab', 1); must(at.text === 'For readers' && at.current === 'true', 'the copy for readers is not the one chosen: ' + JSON.stringify(at)); await tab(() => true, 'Shift+Tab', 1); await page.keyboard.press('Enter'); at = await focused(page);
      must(at.text === 'For people working on this' && at.current === 'true', 'Enter did not choose it, or the focus was lost: ' + JSON.stringify(at)); await tab(a => a.role === 'button' && a.text === 'Save this copy');
      const [download] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.keyboard.press('Enter')]);
      const f = path.join(work, `keyboard-${Date.now()}.html`); await download.saveAs(f); must((await inNode(packIn(f))).head === made.commit, 'the file does not hold the change');
      must((await page.getByRole('status').textContent()).includes('Saved as ' + nameOf(file, '-edited', 0)) && download.suggestedFilename() === nameOf(file, '-edited', 0) && await page.getByRole('region').count() === 0, 'the status does not say a file was made, or the panel is still there'); await quiet(page, log, url); return `${n} Shift+Tabs; ${download.suggestedFilename()}; no request, violation, console message or dialog in the whole run`;
    });
    await context.close();
  };
  // ---- where the nodes are: each element exactly over what is drawn for its node, so that what is under a finger or a pointer is that node ----
  // Of every node the kernel gave a `box` (of one drawn in several pieces, its first): the element's rectangle against the canvas's and the box, in CSS
  // pixels; and, where its middle is in view and no node within it covers that point, that the element found at the point is that element.
  const placed = page => page.evaluate(() => { const r = { nodes: 0, worst: 0, off: [], hit: 0, missed: [], roles: {} }, top = document.getElementById('ufo-top').getBoundingClientRect().bottom;
    document.querySelectorAll('#ufo-player canvas').forEach((c, on) => { const cr = c.getBoundingClientRect(), k = cr.width / c.w, els = [...c.previousElementSibling.querySelectorAll('*')], seen = new Set();
      for (const [kind, it] of ufo.drawn()[on]) { if (kind !== 'push' || !it.role || !it.box || seen.has(it.id)) continue; seen.add(it.id);
        const el = els.find(e => e.node === it.id); if (!el) { r.off.push(`no element for ${it.role}`); continue; } const b = el.getBoundingClientRect(), want = [cr.left + it.box[0] * k, cr.top + it.box[1] * k, it.box[2] * k, it.box[3] * k];
        const d = Math.max(Math.abs(b.left - want[0]), Math.abs(b.top - want[1]), Math.abs(b.width - want[2]), Math.abs(b.height - want[3])); r.nodes++; r.worst = Math.max(r.worst, d); if (d > 1) r.off.push(`${it.role} ${el.textContent.slice(0, 20)}: ${d}`);
        const x = b.left + b.width / 2, y = b.top + b.height / 2; if (!['heading', 'paragraph', 'button', 'item', 'quote', 'code', 'input'].includes(it.role) || x < 0 || x > innerWidth || y < (on ? top : 0) || y > innerHeight || (on === 0 && y > top)) continue;
        const at = document.elementFromPoint(x, y); if (at === el || (el.contains(at) && at !== el)) { r.hit++; r.roles[it.role] = (r.roles[it.role] || 0) + 1; } else r.missed.push(`${it.role} ${el.textContent.slice(0, 20)} -> ${at && (at.getAttribute('role') || at.localName)}`); } });
    return { ...r, dpr: devicePixelRatio }; });
  const boxes = async (page, first) => {
    const good = async when => { const r = await placed(page); must(r.nodes >= 15 && !r.off.length, `${when}: ${r.off.slice(0, 4).join('; ') || r.nodes + ' nodes'}`); must(r.hit >= 5 && !r.missed.length, `${when}: at the middle of what is drawn the element is another: ${r.missed.slice(0, 4).join('; ')} (${r.hit} found)`); return r; };
    await check('node boxes: every node\'s element lies exactly over what is drawn for it (within a pixel), and the element at the middle of a drawn heading, paragraph or button is that node', async () => { const r = await good('as opened');
      must(r.roles.heading >= 1 && r.roles.paragraph >= 2 && r.roles.button >= 5, 'not every kind was tried: ' + JSON.stringify(r.roles)); return `${r.nodes} nodes, the worst ${r.worst.toFixed(3)} px off at a device scale of ${r.dpr}; found at their middles: ${JSON.stringify(r.roles)}`; });
    if (!first) return;
    await check('node boxes: the same after scrolling, in the pages face, and after the view is resized', async () => { const said = [];
      await page.evaluate(() => scrollBy(0, 330)); await page.waitForTimeout(100); said.push('scrolled ' + (await good('scrolled')).hit); await press(page, 'Pages'); const pg = await good('pages'); said.push(`pages ${pg.nodes} nodes`); await page.evaluate(() => scrollTo(0, 0));
      const size = page.viewportSize(); await page.setViewportSize({ width: size.width - 97, height: size.height - 60 }); await page.waitForTimeout(300); said.push('narrower ' + (await good('resized')).nodes); await press(page, 'Document'); said.push('document ' + (await good('document, resized')).nodes);
      await page.setViewportSize(size); await page.waitForTimeout(300); await good('back'); return said.join('; '); });
    await check('node boxes: a pointer press on a node reaches the kernel as the press it is: the node over "Pages" takes the click, and the face changes', async () => {
      const t = (await look(page)).texts.find(t => t.s === 'Pages'), b = await canvases(page).first().boundingBox(), x = b.x + t.X + t.adv / 2, y = b.y + t.Y - t.size / 3;
      must(await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e.getAttribute('role') === 'button' && e.textContent === 'Pages' && !!e.closest('.ufo-nodes'); }, [x, y]), 'the element over the word is not its node');
      await (touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y)); must((await look(page)).texts.find(t => t.s === 'Pages').lit, 'the press did not arrive'); await press(page, 'Document'); });
  };
  // ---- a published copy, reopened: the same state, faces and `why`; its history says withheld; a new change on top of it; saved again each way ----
  const republished = async one => {
    const { context, page, log, url } = await open(one.published, 'nobody'); const got = {};
    await check('published: the copy reopens at the same state, in every face, and `why` still names who wrote each stretch', async () => { must((await headOf(page)).commit === one.head, 'state ' + (await headOf(page)).commit);
      must(flatten((await look(page)).all).includes(flatten(one.sentence)), 'the edit is not shown'); for (const w of ['Pages', 'Text', 'Document']) { await press(page, w); const l = await look(page); must(l.texts.find(t => t.s === w).lit && await inked(page) > 500, 'the face ' + w); }
      same(await whyOf(page, ...one.region), one.why, 'why'); await pure(page, one.published); return one.why[1].trim(); });
    await check('published: `history` lists every change with its work said to be withheld (E11), and the panel says no working history is held', async () => {
      const h = (await ask(page, { name: 'history', o: T })).split('\n').filter(l => l.startsWith('change ')); for (const l of h.slice(0, 3)) console.log('      ' + l);
      must(h.length === (await headOf(page)).height + 1 && h.every(l => l.endsWith('ops=withheld touched=withheld verdict=none') && /^change id=(o:[0-9a-f]{8} commit=c:[0-9a-f]{8,} time=\d+ actor="|withheld commit=c:[0-9a-f]{8,} time=withheld actor=withheld basis=unknown )/.test(l)) && h.some(l => l.includes('actor="Ada Tester"')), 'history: ' + h.join(' / '));
      await press(page, 'Save'); const said = flatten(await page.getByRole('region', { name: 'What will leave' }).textContent()); must(said.includes(flatten('none is held here')), said); await press(page, 'Cancel'); return `${h.length} changes, each "ops=withheld touched=withheld"; ${h.filter(l => l.startsWith('change id=withheld')).length} of them (changes that left nothing in the text as it stands) withheld whole, and said to be`; });
    await check('published: it is edited again, a new change on top of withheld history, and saved again each way', async () => {
      const e = await edit(page, log, 'Cy Third', edits.second.para, replaceWord(edits.second.words[0])); same(e.ops, [edits.second.words[0]], 'the work');
      const h = (await ask(page, { name: 'history', o: T })).split('\n').filter(l => l.startsWith('change ')); must(h[0].includes('actor="Cy Third"') && /ops=1 touched=\[o:71717171\] verdict=none$/.test(h[0]) && h[1].endsWith('touched=withheld verdict=none'), 'history: ' + h.slice(0, 2).join(' / '));
      const save = async (mode, name) => { await press(page, 'Save'); await choose(page, mode); const [d] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), press(page, 'Save this copy')]); must(d.suggestedFilename() === name, 'named ' + d.suggestedFilename()); const f = path.join(path.dirname(one.published), name); await d.saveAs(f); return f; };
      got.again = await save('For readers', nameOf(one.published, '-published', 0)); got.whole = await save('For people', nameOf(one.published, '-edited', 1)); got.head = e.head.commit;
      const a = await inNode(packIn(got.again)), w = await inNode(packIn(got.whole)); must(a.head === e.head.commit && w.head === e.head.commit && a.layers.history.bytes === 0 && a.layers.lacks.history === true && w.layers.history.bytes > 0, 'the two copies');
      must(framesOf(packIn(got.whole)).absent === 1, 'the copy with its history no longer says that earlier history is withheld'); await quiet(page, log, url); return `${path.basename(got.again)} (${fs.statSync(got.again).size} bytes) and ${path.basename(got.whole)} (${fs.statSync(got.whole).size} bytes), both at ${e.head.commit.slice(0, 16)}`; });
    await context.close();
    if (got.again) await check('published: the copy published a second time reopens at the state it was saved at, and shows the new edit', async () => { const { context, page } = await open(got.again, 'nobody'); must((await headOf(page)).commit === got.head, 'state'); must(flatten((await look(page)).all).includes(flatten(edits.second.words[0][1])), 'the edit'); await context.close(); });
    Object.assign(one, { republished: got });
  };
  // a to e, starting from `file`; gives the saved file and the state it holds
  const round = async (file, label, who, wantName, firstRound) => {
    const { context, page, log, url } = await open(file, who); const done = { head: null, saved: null }; let made = null;
    await check(`opened: ${label} runs its own kernel under its policy`, async () => {
      must(await page.evaluate(() => document.getElementById('ufo-static').hidden && !document.getElementById('ufo-player').hidden), 'the player is not showing');
      const csp = await page.evaluate(() => document.querySelector('meta[http-equiv]').content); must(/default-src 'none'/.test(csp) && /'wasm-unsafe-eval'/.test(csp) && !/unsafe-inline|unsafe-eval'|https?:|\*/.test(csp.replace("'wasm-unsafe-eval'", '')), 'policy: ' + csp);
      return 'state ' + (await headOf(page)).commit.slice(0, 16) + '; ' + csp.replace(/sha256-[^']+/g, 'sha256-…');
    });
    await check('opened: nothing was fetched, nothing left the page, no policy violation, nothing on the console', () => quiet(page, log, url));
    await check(`pure function: ${label}, read from disk, is envelope(parts) byte for byte, the parts being the text of its own elements`, async () => { made = await pure(page, file); return `${made.bytes.length} characters, exported ${made.date}`; });
    made ||= { parts: await partsOf(page) };
    const start0 = await look(page), plain0 = (await inNode(made.parts.pack)).text.replace(/^\n+/, '');
    await check('faces: the document face is drawn, and the tools show it is on', async () => { must(await canvases(page).nth(1).isVisible() && await inked(page) > 500, 'nothing drawn'); must(start0.all.includes('The Quarterly Review') && start0.texts.find(t => t.s === 'Document').lit && !start0.texts.find(t => t.s === 'Pages').lit, 'no heading, or no mark'); });
    await check('faces: the pages face is drawn', async () => { await press(page, 'Pages'); const l = await look(page); must(l.pages >= 2 && l.texts.find(t => t.s === 'Pages').lit && !l.texts.find(t => t.s === 'Document').lit, 'not pages'); must(await inked(page) > 500, 'nothing drawn'); return l.pages + ' pages'; });
    await check('faces: the plain-text face is drawn', async () => { await press(page, 'Text'); const l = await look(page), mono = flatten(l.texts.filter(t => t.mono).map(t => t.s).join('')); must(l.texts.find(t => t.s === 'Text').lit && mono.includes('TheQuarterlyReview') && mono.includes('•Firstpoint,short.') && mono.includes(flatten(plain0.trim().split('\n').pop()).slice(0, 30)), 'text missing'); });
    await check('faces: the tools stay in view when the document is scrolled to its end', async () => { await press(page, 'Pages'); await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(100);
      const r = await page.evaluate(() => { const b = document.querySelector('#ufo-player canvas').getBoundingClientRect(); return { top: b.top, bottom: b.bottom, y: scrollY, w: innerWidth, right: b.right }; }); must(r.y > 100 && r.top === 0 && r.bottom > 20 && r.right <= r.w, JSON.stringify(r));
      await press(page, 'Text'); must((await look(page)).texts.find(t => t.s === 'Text').lit, 'a tool pressed there did nothing'); await press(page, 'Document'); await page.evaluate(() => scrollTo(0, 0)); return `scrolled ${r.y}px: the tools are at the top of the view, ${Math.round(r.right)} of ${r.w}px wide, and work`; });
    await boxes(page, firstRound);
    if (firstRound) await accessible(page, made.parts);
    await check('edit: with editing off, a press on the document does nothing', async () => {
      const l = await look(page); must(l.texts.filter(t => t.press).map(t => t.s).join() === 'Document,Pages,Text,Edit,Save,Changes' && l.texts.filter(t => t.src && !t.press).length > 20, 'the working universe carries something to press');
      const h = await headOf(page); await press(page, edits.para); must(await entry(page).isHidden() && !log.asked.length && (await headOf(page)).commit === h.commit, 'a press on the document did something with editing off');
    });
    if (firstRound) {
      let e = null;
      await check(`edit: one word changed through the tools by selecting it and typing, as ${who}`, async () => { e = await edit(page, log, who, edits.para, replaceWord(edits.word)); must(!log.asked.length, 'a dialog was shown'); done.sentence = e.s; done.old = e.old; return 'the name was given through the field of the tools; the kernel and the host asked nothing'; });
      await check('one word: why shows three runs, the word alone attributed to the new change, by=person, and the name', async () => {
        const w = await whyOf(page, e.lo, e.lo + [...e.s].length), at = e.lo + e.s.indexOf(edits.word[1]); for (const l of w) console.log('      ' + l); console.log('      work: ' + JSON.stringify(e.ops));
        must(w.length === 3 && !w[0].includes(e.head.change.slice(0, 8)) && !w[2].includes(e.head.change.slice(0, 8)) && w[0].includes(`chars=[${e.lo},${at}]`), 'not three runs');
        must(w[1].includes(`chars=[${at},${at + edits.word[1].length}]`) && w[1].includes('change=o:' + e.head.change.slice(0, 8)) && w[1].includes('by=person') && w[1].includes(`who=${JSON.stringify(who)}`), 'the word is not attributed');
        same(e.ops, [edits.word], 'the splice is not the word'); done.region = [e.lo, e.lo + [...e.s].length]; return w[1].trim();
      });
      await check(`paragraph start: "${edits.start[1]}" typed a key at a time at the very start of a paragraph is attributed where it was typed and stays in the paragraph`, async () => {
        const spans0 = await spansOf(page), chars0 = await charsOf(page), at = chars0.indexOf(edits.start[0]), [key] = Object.entries(spans0).find(([k, r]) => k[0] === 'b' && r[0] === at), [prev] = Object.entries(spans0).find(([k, r]) => k[0] === 'b' && r[1] === at && r[0] < at);
        const p = await edit(page, log, who, edits.start[0], async (old, k) => { await k.caret(0); await k.type(edits.start[1]); }), spans = await spansOf(page), chars = await charsOf(page), w = await whyOf(page, at - 5, at + 12);
        for (const l of w) console.log('      ' + l); console.log('      work: ' + JSON.stringify(p.ops));
        same(p.ops, [['', edits.start[1]], ['set', `spans.${prev}.at`], ['set', `spans.${key}.at`]], 'the work'); must(w.length === 3 && w[1].includes(`chars=[${at},${at + edits.start[1].length}]`) && w[1].includes(p.head.change.slice(0, 8)), 'not attributed at the start: ' + w.join(' / '));
        must(spans[key][0] === at && chars.slice(...spans[key]) === p.s, 'the block does not hold the new text: ' + JSON.stringify(chars.slice(...spans[key]).slice(0, 30))); must(spans[prev].join() === spans0[prev].join() && chars.slice(...spans[prev]) === chars0.slice(...spans0[prev]), 'the block before changed');
        must(p.named === 0, 'the name had to be given again'); const l = await look(page); must(l.texts.find(t => t.s.startsWith(edits.start[1] + edits.start[0])), 'not drawn at the start of its paragraph'); done.sentence2 = p.s; return `${key} = [${spans[key]}], ${prev} = [${spans[prev]}]; ${w[1].trim()}`;
      });
      await check('typed: a run of Backspace is one removal', async () => { const [para, gone] = edits.back; const r = await edit(page, log, who, para, async (old, k) => { await k.caret(old.indexOf(gone) + gone.length); await k.key('Backspace', gone.length); }); same(r.ops, [[gone, '']], 'the work'); return JSON.stringify(r.ops); });
      await check('typed: a word copied and pasted elsewhere is one insertion, where it was pasted', async () => { const [para, word] = edits.paste; const r = await edit(page, log, who, para, async (old, k) => { const at = old.indexOf(word); await k.caret(at, at + word.length); await k.key('ControlOrMeta+c'); await k.caret(old.length); await k.key('ControlOrMeta+v'); });
        same(r.ops, [['', word]], 'the work'); must(r.s === r.old + word, 'not pasted at the end'); return JSON.stringify(r.ops); });
      await check('typed: typed and deleted again, then the same letters typed over themselves: no change is made, and none is claimed', async () => {
        const r = await edit(page, log, who, edits.none, async (old, k) => { await k.caret(5); await k.type(' zz'); await k.key('Backspace', 3); await k.caret(0, 5); await k.type(old.slice(0, 5)); }, { changes: false }); const said = (await look(page)).said; must(said.includes('change o:' + r.head.change.slice(0, 8)), 'the status names another change than the last one made: ' + said);
        await edit(page, log, who, edits.none, async (old, k) => { await k.type('given up'); }, { changes: false, done: false }); return 'nothing written; Cancel writes nothing either';
      });
      await check('typed: a change the widget reports with no position (its text set, as a filled-in or dictated text is) falls back on the difference', async () => { const [para, from, to] = edits.whole;
        const r = await edit(page, log, who, para, (old, k) => k.area.evaluate((el, [from, to]) => { el.value = el.value.replace(from, to); el.dispatchEvent(new Event('input', { bubbles: true })); }, [from, to])); must(r.s.includes(to) && !r.s.includes(from), 'not changed');
        must(r.ops.every(o => o[0] !== 'set') && r.ops.map(o => o[1]).join('').length <= to.length, 'more was written than differs: ' + JSON.stringify(r.ops)); return JSON.stringify(r.ops); });
    } else {
      await check(`edit: two words apart changed through the tools, as ${who}: two splices in one change`, async () => {
        const e = await edit(page, log, who, edits.second.para, async (old, k) => { for (const w of edits.second.words) await replaceWord(w)(await k.area.inputValue(), k); }), w = await whyOf(page, e.lo, e.lo + [...e.s].length);
        same(e.ops, edits.second.words, 'the work'); must(w.length === 5 && w.filter(l => l.includes(e.head.change.slice(0, 8)) && l.includes(`who=${JSON.stringify(who)}`)).length === 2, 'why: ' + w.join(' / '));
        done.sentence = e.s; done.old = e.old; return w.filter(l => l.includes(e.head.change.slice(0, 8))).map(l => /chars=\S+/.exec(l)[0]).join(' and ') + ' by ' + who;
      });
    }
    await check('edit: the new text shows in the document and plain-text faces, and nothing else changed', async () => {
      const doc = flatten((await look(page)).all); must(doc.includes(flatten(done.sentence)) && !doc.includes(flatten(done.old)), 'not shown in the document face');
      await press(page, 'Text'); const txt = flatten((await look(page)).texts.filter(t => t.mono).map(t => t.s).join('')); must(txt.includes(flatten(done.sentence)) && !txt.includes(flatten(done.old)), 'not in the plain-text face'); await press(page, 'Document');
      must(await page.getByRole('paragraph').filter({ hasText: done.sentence }).count() === 1, 'not in the accessibility tree');
    });
    await check('edit: nothing turns editing on but the tools, and the tools turn it off', async () => { await press(page, 'Edit'); must(!(await look(page)).texts.find(t => t.s === 'Edit').lit, 'still on'); const h = await headOf(page); await press(page, edits.para); must(await entry(page).isHidden() && (await headOf(page)).commit === h.commit, 'a press edited'); });
    // ---- Save: what will leave is shown first (E12), with the choice of E9; then a copy each way ----
    const region = page.getByRole('region', { name: 'What will leave' }), chosen = async () => Object.fromEntries(await region.getByRole('button').evaluateAll(bs => bs.filter(b => b.hasAttribute('aria-current')).map(b => [b.textContent, b.getAttribute('aria-current')])));
    const num = (said, re) => +(re.exec(said) || [0, NaN])[1], saveCopy = async (mode, name) => { if (!await region.count()) await press(page, 'Save'); if (mode) await choose(page, mode); const [download] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), press(page, 'Save this copy')]);
      must(download.suggestedFilename() === name, 'named ' + download.suggestedFilename()); const f = path.join(path.dirname(file), name); must(f !== file, 'same file'); await download.saveAs(f); await page.waitForTimeout(200); return f; };
    let shown = null;
    await check('what will leave: Save makes nothing yet: a named region shows the three layers, with the copy for readers chosen, and the choice changes what it says', async () => {
      done.head = (await headOf(page)).commit; let downloads = 0; const count = () => downloads++; page.on('download', count); await press(page, 'Save'); await page.waitForTimeout(150); must(!downloads, 'a file came down before anything was shown');
      must(await region.count() === 1 && await page.getByRole('toolbar').getByRole('button', { name: 'Save', pressed: true }).count() === 1, 'no region named "What will leave", or Save does not say it is open');
      same(await chosen(), { 'For people working on this': 'false', 'For readers': 'true' }, 'the choice at first'); const readers = flatten(await region.textContent());
      must(/Thedocument:\d+objects,\d+bytes\.Italwaystravels/.test(readers) && /Whoandwhatmadeit:\d+changes,from\d{4}-\d\d-\d\d\d\d:\d\dto\d{4}-\d\d-\d\d\d\d:\d\dUTC,\d+bytes\.Thisalwaystravels/.test(readers) && readers.includes(flatten(who)) && /Workinghistory\(everyoperation,andeveryearlierdraft\):withheld\.Its\d+bytesstayhere/.test(readers), 'the layers for readers: ' + readers);
      await choose(page, 'For people'); same(await chosen(), { 'For people working on this': 'true', 'For readers': 'false' }, 'the choice after a press'); const people = flatten(await region.textContent()); must(/:included,\d+bytes,theworkof\d+changes/.test(people), 'the layers for people working on this: ' + people);
      shown = { content: num(readers, /objects,(\d+)bytes\.Italways/), attribution: num(readers, /UTC,(\d+)bytes\.This/), history: num(readers, /withheld\.Its(\d+)bytes/), changes: num(readers, /madeit:(\d+)changes/), included: num(people, /included,(\d+)bytes/) };
      await press(page, 'Cancel'); must(!await region.count() && !downloads && (await headOf(page)).commit === done.head, 'Cancel did not close it, or something was made'); page.off('download', count); return JSON.stringify(shown);
    });
    if (done.region) done.why = await whyOf(page, ...done.region);
    await check('saved: with "For people working on this" chosen, a new .ufx.html comes down, and the figures shown were those of the kernel\'s `leaving` for what it holds', async () => {
      done.saved = await saveCopy('For people', wantName); must((await headOf(page)).commit === done.head && page.url() === url, 'the page changed, or went elsewhere');
      const st = await inNode(packIn(done.saved)), L = st.layers; same([shown.content, shown.attribution, shown.history, shown.included], [L.content.bytes, L.attribution.bytes, L.history.bytes, L.history.bytes], 'the figures shown, against `leaving` in Node');
      must(shown.changes === L.attribution.changes && L.lacks.history === false && !framesOf(packIn(done.saved)).absent, 'the changes named, or the copy is not whole'); const said = await page.getByRole('status').textContent();
      must(said.includes(`Saved as ${wantName}`) && !/for readers|Not yet in a file/.test(said), 'the status: ' + said); return `${wantName}, ${fs.statSync(done.saved).size} bytes; content ${shown.content}, attribution ${shown.attribution}, history ${shown.history} bytes`;
    });
    if (firstRound) await check('published: with "For readers" chosen the copy is smaller, at the same root hash, holds no record of working history and says so; the page still holds everything, and says that too', async () => {
      const name = nameOf(file, '-published', 1); done.published = await saveCopy('For readers', name); const pub = packIn(done.published), st = await inNode(pub), L = st.layers, fr = framesOf(pub);
      must(st.head === done.head, 'another state: ' + st.head); same([L.history.bytes, L.lacks.history, L.content.bytes, L.attribution.bytes], [0, true, shown.content, shown.attribution], 'its layers, by `leaving` in Node');
      must(fr.absent === 1 && fr.kinds[4] === 1 && fr.kinds[5] === 1, 'its frames: ' + JSON.stringify(fr)); must(fs.statSync(done.published).size < fs.statSync(done.saved).size, 'not smaller');
      must(st.leaving(true).includes('layer name=history included=true objects=0 bytes=0') && st.leaving(true).includes('lacks history=true'), 'leaving, of the copy');
      const said = flatten(await page.getByRole('status').textContent()); must(said.includes(flatten(`Saved as ${name}`)) && said.includes(flatten('That copy is for readers: its working history was withheld. Everything is still held here')), 'the status: ' + said);
      const mine = layersOf(await ask(page, { name: 'leaving' })); must(mine.history.bytes === shown.history && (await headOf(page)).commit === done.head, 'E13: the page no longer holds its history');
      return `${name}: ${fs.statSync(done.published).size} bytes against ${fs.statSync(done.saved).size}; pack ${Buffer.from(pub, 'base64').length} against ${Buffer.from(packIn(done.saved), 'base64').length}; ${L.content.bytes} bytes of content and ${L.attribution.bytes} of attribution, 0 of history, 1 absent frame`;
    });
    await check('pure function: the file saved by the page is envelope(parts), computed in Node from the parts, byte for byte', async () => {
      const bytes = fs.readFileSync(done.saved, 'utf8'), pack = packIn(done.saved), st = await inNode(pack), today = new Date().toISOString().slice(0, 10);
      must(st.head === done.head, 'the pack saved is not at the state the page had'); must(st.html.includes(done.sentence), 'the static face would not hold the edit');
      const parts = { ...made.parts, pack, 'static-html': st.html, date: today }, want = envelope(parts); must(want === bytes, bytes.length === want.length ? 'differs' : `lengths ${bytes.length} and ${want.length}`);
      must(bytes.startsWith(`<!DOCTYPE html>\n<!--\nUFO file (Universal File Object). Exported ${today}. Open it in a web browser.\n-->\n`) && !/--/.test(bytes.slice(20, bytes.indexOf('-->'))), 'the plain-text head'); return `${bytes.length} characters, exported ${today}`;
    });
    await check('policy: from opening, through every face, edit and the save: nothing fetched, nothing sent, no policy violation reported, nothing on the console', () => quiet(page, log, url));
    await check('policy: and it is enforced (an inline script and a style put into the page do nothing, a fetch is refused; each is reported as a violation)', async () => {
      const r = await page.evaluate(async () => { const s = document.createElement('script'); s.textContent = 'globalThis.injected = 1'; document.body.append(s); const y = document.createElement('style'); y.textContent = 'body{outline:9px solid red}'; document.head.append(y);
        let fetched = false; try { await fetch('data:text/plain,x'); fetched = true; } catch { } await new Promise(ok => setTimeout(ok, 200)); return { ran: !!globalThis.injected, styled: getComputedStyle(document.body).outlineStyle !== 'none', fetched, reported: globalThis.__violations.map(v => v.split(' ')[0]) }; });
      must(!r.ran && !r.fetched && !r.styled, JSON.stringify(r)); must(['script-src-elem', 'style-src-elem', 'connect-src'].every(d => r.reported.includes(d)), 'not all reported: ' + r.reported); must(log.requests.length <= 1, 'a request left the page'); return 'reported: ' + r.reported.join(', ');
    });
    await context.close(); return done;
  };
  const reopened = async (file, was) => check('reopened: the saved file holds the same state and shows the edit in both faces; opening it fetched and sent nothing', async () => {
    const { context, page, log, url } = await open(file, 'nobody'); must((await headOf(page)).commit === was.head, 'state ' + (await headOf(page)).commit + ' is not ' + was.head);
    must(flatten((await look(page)).all).includes(flatten(was.sentence)), 'edit not shown'); await press(page, 'Text'); must(flatten((await look(page)).texts.filter(t => t.mono).map(t => t.s).join('')).includes(flatten(was.sentence)), 'not in the plain-text face');
    must(/<div id="ufo-text">[^]*?<div id="ufo-player"/.exec(fs.readFileSync(file, 'utf8'))[0].includes(was.sentence), 'the static face of the saved file is old'); await pure(page, file); await quiet(page, log, url); must(!log.asked.length, 'asked'); await context.close(); return 'state ' + was.head.slice(0, 16);
  });
  const one = await round(first, 'the file', 'Ada Tester', nameOf(first, '-edited', 0), true);
  let two = null;
  if (one.saved) { await reopened(one.saved, one);
    console.log('  -- the saved file, edited and saved again');
    two = await round(one.saved, 'the saved file', 'Ben Second', nameOf(one.saved, '-edited', 0), false); if (two.saved) await reopened(two.saved, two);
  } else step('reopened: (nothing was saved)', false);
  if (one.published) { console.log('  -- the copy published for readers, reopened, edited and saved again'); await republished(one); } else step('published: (no copy was published)', false);
  console.log('  -- by the keyboard alone, from the file as first made'); await keyboard(first);
  if (kit && one.saved) { fs.copyFileSync(original, here('phone/compose.ufx.html')); fs.copyFileSync(one.saved, here('phone/compose-edited.ufx.html')); if (one.published) fs.copyFileSync(one.published, here('phone/compose-published.ufx.html')); }
  if (more) await more(open, press, { giveName, pressAt, one });
  return { one, two, open, press, look: look };
}

const browser = await launch(engineName), version = browser.version();
const file = f => pathToFileURL(f).href;
const dir = n => { const d = path.join(work, n); fs.mkdirSync(d, { recursive: true }); fs.copyFileSync(original, path.join(d, 'compose.ufx.html')); return path.join(d, 'compose.ufx.html'); };
// The phones are each engine's own descriptors where Playwright has them: Chrome on Android for Chromium, Safari on iOS for WebKit (the nearest
// thing to Safari that runs here). It has none for Firefox, which cannot be told it is a mobile browser: a phone's size, density and touch are given.
const PHONES = { chromium: ['Pixel 7', 'Galaxy S8'], webkit: ['iPhone 14', 'iPhone SE'],
  firefox: [{ name: 'Firefox, 412 by 839 at 2.625, touch', viewport: { width: 412, height: 839 }, deviceScaleFactor: 2.625, hasTouch: true }, { name: 'Firefox, 360 by 740 at 3, touch', viewport: { width: 360, height: 740 }, deviceScaleFactor: 3, hasTouch: true }] }[engineName];
const phone = d => typeof d === 'string' ? { name: `${d} (${devices[d].viewport.width} by ${devices[d].viewport.height})`, ...devices[d] } : d, phoneNames = PHONES.map(d => phone(d).name);
const option = ({ name, defaultBrowserType, ...o }) => o;

if (!arg('only')) {
// ---- the kernel alone, in Node: roundtrip.mjs (the tools driven by input events, positioned reports, the envelope function and its fixed case) and more-edits.mjs ----
env = 'Node'; console.log('\n== the kernel alone (Node)');
for (const [key, script, last] of [['kernel', 'roundtrip.mjs', /^OK$/], ['kernel', 'more-edits.mjs', /^end lines=12$/], ['kernel', '../vectors.mjs', /^agree \d+ differ 0$/], ['kernel', 'fuzz.mjs', /^fuzz: \d+ cases, 0 failed$/]]) await check(`${key}: ${script}`, () => { const said = execFileSync('node', [here(script)]).toString().trim().split('\n'); must(last.test(said.pop()), 'did not finish'); return said.length + ' lines'; });

// ---- host code: everything the page ships as script is the binding; its budget (PLAYER 11.1), and what it may not know or do ----
console.log('\n== host code (the script as the page carries it)');
// What is shipped is host.mjs minified: the budget of bytes is counted on what is shipped, the budget of lines on the source, and what the script may
// not know or do is looked for in both.
const html0 = fs.readFileSync(original, 'utf8'), shipped = html0.slice(html0.lastIndexOf('<script type="module">') + 22, html0.lastIndexOf('</script>')), source = fs.readFileSync(here('host.mjs'), 'utf8'), lines = source.split('\n');
const counted = lines.filter(l => l.trim() && !l.trim().startsWith('//')).length, longest = Math.max(...lines.map(l => l.length)), size = Buffer.byteLength(shipped), code = lines.filter(l => !l.trim().startsWith('//')).map(l => l.replace(/\s\/\/ .*$/, '')).join('\n');
const BOTH = [['the source', source], ['what is shipped', shipped]], terser = execFileSync(here('../tools/node_modules/.bin/terser'), ['--version']).toString().trim();
const FORBIDDEN = ['face', 'editing', 'export', 'pages', 'propose', 'splice', 'outerHTML', 'innerHTML', 'envelope', 'subject', 'tools', 'handler', 'commit', 'anchor', 'skeleton', 'universe', 'pack', 'formula', 'state'];
// Which engine it runs in is never asked: no name of an engine or a browser, no string that identifies one, no prefixed interface.
const ENGINE = [/userAgent/i, /\bvendor/i, /platform/i, /webkit/i, /safari/i, /firefox/i, /gecko/i, /chrom(e|ium)/i, /\bmoz|moz[A-Z]/, /\bms[A-Z]/, /\bopera|\bedge\b|trident/i];
// The look. An allow-list: wherever the script says `style`, in any letter case, it is one of exactly these: the two words in the query for the page's
// parts (its style and script elements), or the assignment of one of the four properties left, top, width, height of an element's `.style` (TRAVEL E23).
// Anything else that says it fails: another property, a style attribute, cssText, setProperty, a rule, a sheet, a style element.
// (`fillStyle` and `strokeStyle` are the paints of the canvas the drawing contract is carried out on, not the page's style: allowed, as those two names assigned to.)
const STYLE_OK = [/^(['"`])style,script\1/, /^style\.(left|top|width|height)\s*=(?!=)/], PAINT = /\.(fill|stroke)Style\s*=(?!=)/y, paint = (text, i) => [4, 6].some(k => { PAINT.lastIndex = i - k - 1; return PAINT.test(text) && PAINT.lastIndex > i; });
const styleUses = text => [...text.matchAll(/style/gi)].map(m => ({ at: m.index, ok: paint(text, m.index) || (text[m.index - 1] === '.' || /['"`]/.test(text[m.index - 1])) && STYLE_OK.some(r => r.test(text.slice(m.index - (text[m.index - 1] === '.' ? 0 : 1)))), near: text.slice(Math.max(0, m.index - 20), m.index + 30).replace(/\s+/g, ' ') }));
// And what could reach outside the policy by other means: a rule or a sheet, a script or another element the policy would have to allow, a page opened, a request.
const OUTSIDE = [/cssText|setProperty|insertRule|replaceSync|adoptedStyleSheets|styleSheets|CSSStyleSheet/, /setAttribute\(\s*["'`]style/, /createElement\(\s*["'`](style|script|link|iframe|img|object|embed)/, /\beval\(|new Function|setTimeout\(\s*["'`]/, /document\.write|insertAdjacentHTML|srcdoc/, /location\s*=|location\.(href|assign|replace)|window\.open|\.open\(/, /fetch\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|importScripts|import\(/];
await check('host: one script: host.mjs, minified by a pinned tool with fixed options, the same bytes wherever the source lies; and the envelope carries exactly those bytes', () => {
  must(shipped === minified() && (html0.match(/<script type="module">/g) || []).length === 2, 'the script in the envelope is not host.mjs minified');   // twice: once in the skeleton's own text
  const said = execFileSync(here('../tools/repro-host.sh'), [original]).toString(); must(/\nreproducible\s*$/.test(said) && said.includes('is exactly these bytes'), said); return `${terser}, options ${MINIFY.join(' ')}; ` + said.trim().split('\n').slice(1, 4).map(l => l.slice(0, 16) + '…' + l.slice(64)).join('; '); });
await check('host: within the budget of a binding: the source 600 lines with none over 160 characters, what is shipped 16 KiB', () => { must(counted <= 600 && size <= 16384 && longest <= 160, `${counted} lines, ${size} bytes, longest ${longest}`); return `source: ${counted} lines that are not blank or comment (${lines.length} in all), ${Buffer.byteLength(source)} bytes, longest line ${longest} characters; shipped: ${size} bytes`; });
await check('host: none of the forbidden knowledge, in the source or in what is shipped', () => { for (const [which, text0] of BOTH) { const text = text0.replace(/\bdocument\./g, 'DOM.').replace(/\.instance\.exports\b/g, '.instance.EX'), found = [...FORBIDDEN, 'document'].filter(w => text.toLowerCase().includes(w.toLowerCase())); must(!found.length, `found in ${which}: ` + found.join(', ')); }
  return 'not found, in code or comment, in any letter case, as a word or inside one: ' + [...FORBIDDEN, 'document (but as the DOM global `document.`; and `export` but as the WebAssembly member `.instance.exports`)'].join(', ') + '. The roles of the drawing contract (heading, paragraph, quote, code, button, item, link, input) are its to know'; });
await check('host: it never asks which engine it is in (no engine or browser name, no user-agent, vendor or platform string, no prefixed interface), in the source or in what is shipped', () => { for (const [which, text] of BOTH) { const found = ENGINE.filter(r => r.test(text)).map(String); must(!found.length, `found in ${which}: ` + found); } return ENGINE.length + ' patterns, none found in code or comment'; });
await check('host: of the look it writes exactly the place and size of a node\'s element (left, top, width, height of its `.style`), by an allow-list; it makes no script or other element a policy would have to allow, opens nothing as a page, fetches nothing', () => {
  const said = []; for (const [which, text] of [['the source', code], ['what is shipped', shipped]]) { const uses = styleUses(text), bad = uses.filter(u => !u.ok); must(!bad.length, `in ${which}, "style" is said where it is not allowed: ` + bad.map(u => u.near).join(' | '));
    const props = [...text.matchAll(/\.style\.(\w+)\s*=/g)].map(m => m[1]).sort(); same(props, ['height', 'left', 'top', 'width'], `the properties written in ${which}`); const found = OUTSIDE.filter(r => r.test(text)).map(String); must(!found.length, `found in ${which}: ` + found); said.push(`${which}: ${uses.length} uses of the word, all allowed`); }
  // the allow-list fails on what it must: each of these, put into the source, is found
  for (const bad of ["el.style.color = 'red'", "el.style['left'] = 0", "el.setAttribute('style', 'left:0')", "el.style.cssText = 'left:0'", "el.style.setProperty('left', 0)", "const s = el.style; s.left = 0", "document.createElement('style')", "sheet.insertRule('p{}')", "document.adoptedStyleSheets = []", "el.STYLE.left = 0", "Object.assign(el.style, { left: 0 })"])
    must(styleUses(bad).some(u => !u.ok) || OUTSIDE.some(r => r.test(bad)), 'the allow-list lets through: ' + bad);
  same([...code.matchAll(/createElement\((?:'(\w+)')?/g)].map(m => m[1] || 'of a role'), ['of a role', 'canvas', 'a', 'input'], 'the elements it makes'); must(/picker = document\.createElement\('input'\)/.test(code) && !/append\w*\((i|picker)\b/.test(code), 'the file chooser\'s element is put in the page');
  return said.join('; ') + '; 11 writes it must refuse, refused; it makes only the elements of roles, a canvas to measure with, the link a file is handed over by, and the element a file is chosen with, which is never put in the page'; });
await check('host: the style part holds no rule that fetches, and the skeleton no style attribute, no handler attribute and no element that loads', () => { const css = fs.readFileSync(here('page.css'), 'utf8'), sk = fs.readFileSync(here('skeleton.html'), 'utf8');
  must(!/url\(|@import|@font-face|expression\(/i.test(css), 'the style fetches'); must(!/\sstyle\s*=|\son[a-z]+\s*=|<(img|iframe|object|embed|video|audio|source|base|form)\b|\ssrc\s*=/i.test(sk), 'the skeleton'); same([...sk.matchAll(/<link[^>]*>/g)].map(m => m[0]), ['<link rel="icon" href="data:,">'], 'links');
  must(!/x-ufo-tools|\{\{tools\}\}/.test(sk), 'the skeleton still has a place for a tools part'); const csp = /Content-Security-Policy" content="([^"]*)"/.exec(sk)[1]; must(/style-src '\{\{csp:style\}\}';/.test(csp) && !/unsafe-inline|unsafe-hashes|unsafe-eval'/.test(csp.replace("'wasm-unsafe-eval'", '')), 'the policy: ' + csp);
  return 'every byte the policy governs is a part whose hash the envelope function writes: one style, one script; style-src is that one hash, with no unsafe-inline and no unsafe-hashes; the one link is an icon that is an empty data: address, which img-src data: allows'; });
globalThis.hostNumbers = { lines: counted, source_bytes: Buffer.byteLength(source), shipped_bytes: size, longest, minifier: terser, options: MINIFY.join(' '), forbidden: FORBIDDEN };
}

// ---- a to e on the desktop, from file:// ----
const desktop = { viewport: { width: 900, height: 900 }, deviceScaleFactor: 2 };
// A pack that names no tools universe, in this reader, which has none of its own: the page says so, shows the document to be read, and nothing can be pressed.
const bare = async (open, press) => check('no tools: a file whose pack carries no tools universe opens, says so in plain words, and shows the document to read; nothing in it can be pressed', async () => {
  const f = path.join(work, 'bare.ufx.html'); make(here('../../vectors/compose.ufx'), f, '--bare'); const { context, page, log, url } = await open(f, 'nobody');
  const said = await page.getByRole('status').textContent(); must(/This file carries no tools, and this reader has none of its own/.test(said), 'the status: ' + said); must((await headOf(page)).height === 0, 'the pack was changed');
  must(await page.getByRole('heading', { name: 'The Quarterly Review', level: 1 }).count() === 1 && await page.getByRole('paragraph').count() >= 6 && await page.locator('#ufo-player [tabindex], #ufo-player [role=button]').count() === 0, 'the document is not there as nodes, or something can be pressed');
  const l = await d0.look(page); must(l.texts.every(t => !t.press) && l.all.includes('Every figure in this section'), 'not drawn'); await press(page, 'Every figure'); await page.keyboard.press('Tab'); must(await page.locator('#ufo-entry').isHidden() && (await headOf(page)).height === 0, 'a press did something');
  must(log.requests.length <= 1 && !log.errors.length && !(await page.evaluate(() => globalThis.__violations)).length, 'not quiet'); await context.close(); return JSON.stringify(said);
});
const d0 = { look };
const D = 'desktop, file://', H = 'http origin';
// decisions (SPEC 5.4, R9): in the file as it was saved with its edits, the newest change is accepted and the one before it rejected
const decisions = async (open, press, { giveName, pressAt, one }) => check('decisions: through the tools, a change is accepted, which alters nothing, and another rejected, which undoes it; each is recorded with who decided; then the rejection is undone', async () => {
  must(one.saved, 'nothing was saved to decide about'); const { context, page, log } = await open(one.saved, 'nobody'), who = 'Dee Cider', text = () => charsOf(page), status = async () => flatten((await page.getByRole('status').allTextContents()).join(' '));
  const hist = async () => (await ask(page, { name: 'history' })).split('\n').filter(l => l.startsWith('change ')), nth = async (word, k) => pressAt(page, (await look(page)).texts.filter(t => t.s.trim() === word)[k]);
  const before = await text(), h0 = await hist(), [newest, second] = h0.map(l => /id=(o:[0-9a-f]+)/.exec(l)[1]); await press(page, 'Changes');
  const rows = async () => (await page.getByRole('region', { name: 'Changes' }).getByRole('paragraph').allTextContents()).filter(t => /, change o:/.test(t)); must((await rows()).length === h0.length && (await rows()).every(r => /not decided\.$/.test(r)), 'the changes are not listed: ' + (await rows()).join(' / '));
  await giveName(page, who); await press(page, 'Edit'); must((await rows()).length === h0.length, 'the panel closed');
  await nth('Accept', 0); let h = await hist(); must(h.length === h0.length + 1 && /ops=0 touched=\[\]/.test(h[0]) && h[0].includes(`actor="${who}"`) && h[1].endsWith(`verdict=accept decided-by="${who}"`) && await text() === before, 'accepting: ' + h.slice(0, 2).join(' / '));
  must((await status()).includes(flatten(`Recorded: change ${newest} accepted by ${who}.`)), 'the status: ' + await status());
  await nth('Reject', 2); h = await hist(); const after = await text(), line = h.find(l => l.includes(`id=${second} `));
  must(h.length === h0.length + 2 && line.endsWith(`verdict=reject decided-by="${who}"`) && after !== before, 'rejecting: ' + line);
  must((await status()).includes(flatten(`Recorded: change ${second} rejected by ${who}. What it did was undone.`)), 'the status: ' + await status());
  const via = (await ask(page, { name: 'why', o: T })).split('\n').filter(l => l.startsWith('run ') && l.includes('via=')); must(via.every(l => !l.includes(`who="${who}"`)), 'what was put back is given to the one who rejected: ' + via.join(' / '));
  const held = await ask(page, { name: 'history', full: true }); await nth('Reject', 3); must((await status()).includes(flatten('Not recorded: what that change wrote has been edited since')) && await ask(page, { name: 'history', full: true }) === held, 'a second rejection: ' + await status());
  // undo (PLAYER 9.6): the decider's own newest change that did something, the rejection, is undone; then there is nothing more of theirs
  await press(page, 'Undo my last change'); h = await hist(); must((await status()).includes(flatten('Undone: your change')) && await text() === before && h.length === h0.length + 3 && h[0].includes('by=tool'), 'undo: ' + await status() + ' / ' + h[0]);
  await press(page, 'Undo my last change'); must((await status()).includes(flatten('Not undone: there is no change of yours here to undo')), 'a second undo: ' + await status());
  must(log.requests.length <= 1 && !log.errors.length && !(await page.evaluate(() => globalThis.__violations)).length, 'not quiet: ' + JSON.stringify([log.requests.length, log.errors, await page.evaluate(() => globalThis.__violations)])); await context.close(); return `${newest} accepted, ${second} rejected by ${who}; ${via.length} stretches put back, each still its first author's`;
});
// adding a file (SPEC 5.2): through the tools, with the chooser the browser has, by a press and by the keyboard; then undone
const adding = async (open, press, { giveName }) => check('asset: through the tools, a file of the person\'s choosing is taken in exactly, and recorded as theirs, by a press and by the keyboard alone; choosing none writes nothing; an undo retires it', async () => {
  const f = path.join(work, 'adding.ufx.html'); make(here('../../vectors/compose.ufx'), f); const { context, page, log } = await open(f, 'nobody'), who = 'Ada Adder', status = async () => flatten((await page.getByRole('status').allTextContents()).join(' '));
  const want = JSON.parse(fs.readFileSync(here('../../vectors/provisional/asset.json'), 'utf8')), picture = (() => { let b = Buffer.alloc(0), h = Buffer.from('ufo-asset-vector'); while (b.length < 70000) { h = createHash('sha256').update(h).digest(); b = Buffer.concat([b, h]); } return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), b.subarray(0, 70000)]); })();
  must(createHash('sha256').update(picture).digest('hex') === want.first.sha256, 'the file is not the vector\'s'); const hist = async () => (await ask(page, { name: 'history', full: true })).split('\n').filter(l => l.startsWith('change '));
  must(!(await d0.look(page)).all.includes('Add a file'), 'a file can be added before editing is on'); await giveName(page, who); const h0 = await hist();
  // a press: the chooser opens; the file is given under a name and a kind that say something else, and its content decides
  // (the test must be listening before the chooser is asked for, and says so to the browser by a message of its own: so each way of asking begins with a step that goes to the page and comes back)
  const chosen = async (how, file, what) => { const [fc] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null), how()]); must(fc, 'no chooser opened ' + what + '; the focus is on ' + await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 120))); if (file) await fc.setFiles(file); return fc; };
  await chosen(() => press(page, 'Add a file'), { name: want.first.name, mimeType: 'text/plain', buffer: picture }, 'by a press'); await page.waitForFunction(() => /Added /.test(document.querySelector('[role=status]')?.textContent || ''), null, { timeout: 5000 });
  must((await status()).includes(flatten(`Added ${want.first.name}: image/png, ${picture.length} bytes, kept exactly as given, recorded as added by ${who}.`)), 'the status: ' + await status());
  let h = await hist(); must(h.length === h0.length + 1 && h[0].includes(`actor="${who}"`) && h[0].includes('ops=4'), 'the change: ' + h[0]); const A = /touched=\[o:([0-9a-f]{32})\]/.exec(h[0])[1];
  const obj = (await ask(page, { name: 'object', o: A })).split('\n').slice(1), wantObj = want.first.object_projection.slice(1).map(l => l.replace(/(id=o:|r=r:|by=o:)[0-9a-f]+/g, '$1'));
  must(JSON.stringify(obj.map(l => l.replace(/(id=o:|r=r:|by=o:)[0-9a-f]+/g, '$1'))) === JSON.stringify(wantObj), 'the asset: ' + obj.join(' / ')); const pack = Buffer.from(await packOf(page), 'base64'); must(pack.indexOf(picture.subarray(0, 2048)) >= 0 && pack.indexOf(Buffer.from(want.first.blob, 'hex')) >= 0, 'the file\'s bytes are not in the pack as they were given: no blob of the hash that names exactly those bytes');
  // the keyboard alone: the word is reached and pressed with Enter; and a chooser that is closed with nothing chosen writes nothing
  const word = page.getByRole('button', { name: 'Add a file' }); await chosen(async () => { await word.focus(); await page.keyboard.press('Enter'); }, { name: 'notes.TXT', mimeType: 'application/pdf', buffer: Buffer.from(want.second.bytes_as_text) }, 'by Enter');
  await page.waitForFunction(() => /Added notes\.TXT/.test(document.querySelector('[role=status]')?.textContent || ''), null, { timeout: 5000 }); must((await status()).includes(flatten(`Added notes.TXT: text/plain, ${want.second.length} bytes`)), 'by the keyboard: ' + await status());
  h = await hist(); must(h.length === h0.length + 2, 'the second file'); const B = /touched=\[o:([0-9a-f]{32})\]/.exec(h[0])[1]; await chosen(async () => { await word.focus(); await page.keyboard.press(' '); }, null, 'by Space'); await page.waitForTimeout(150); must((await hist()).length === h0.length + 2, 'written with no file chosen');
  // undo: the second file is retired; the first stays
  await press(page, 'Changes'); await press(page, 'Undo my last change'); h = await hist(); must((await status()).includes(flatten('Undone: your change')) && h.length === h0.length + 3 && h[0].includes('by=tool') && h[0].includes(`touched=[o:${B}]`), 'undo: ' + await status() + ' / ' + h[0]);
  must(await ask(page, { name: 'object', o: B }) === null && await ask(page, { name: 'object', o: A }) !== null, 'what is in the state after the undo');
  must(log.requests.length <= 1 && !log.errors.length && !(await page.evaluate(() => globalThis.__violations)).length, 'not quiet: ' + JSON.stringify([log.requests.length, log.errors, await page.evaluate(() => globalThis.__violations)])); await context.close();
  return `${want.first.name}, ${picture.length} bytes, told to be image/png from its content though given as text/plain; notes.TXT by the keyboard, then undone`;
});
// a table (PRESENTATION 7.2, 7.3, 7.6): a data object in a grid; a total by formula; values changed through the document's own handlers, when the person applies them
const tabled = async (open, press, { giveName, pressAt }) => check('table: a data object is presented as a table, with a total its formula works out; the document\'s own state is its own; what a press proposes is written only when the person applies it in the tools, as theirs; a figure typed is the person\'s own input and is written at once; the keyboard does the same', async () => {
  const f = path.join(work, 'table.ufx.html'); make(here('../../vectors/table.ufx'), f, '--title', 'Costs'); if (engineName === 'chromium') fs.copyFileSync(f, here('phone/table.ufx.html')); const { context, page, log } = await open(f, 'nobody'), who = 'Tess Table', want = JSON.parse(fs.readFileSync(here('../../vectors/provisional/data.json'), 'utf8'));
  const doc = async () => (await look(page)).texts.filter(t => t.on === 1).map(t => t.s), at = async s => (await look(page)).texts.find(t => t.on === 1 && t.s === s), hist = async () => (await ask(page, { name: 'history' })).split('\n').filter(l => l.startsWith('change '));
  const region = page.getByRole('region', { name: 'A change the document asks for' }), asked = async () => (await region.count()) ? (await region.getByRole('paragraph').allTextContents()).filter(t => t.startsWith('Set ')) : [];
  must(JSON.stringify(await doc()) === JSON.stringify(want.presented.texts.map(t => t.s)), 'as drawn: ' + (await doc()).join(' | '));
  // for whoever does not see it: one table, named; a row of three headers; three rows of three cells
  const tb = page.getByRole('table', { name: 'Costs' }); must(await tb.count() === 1 && await tb.getByRole('row').count() === 4 && await tb.getByRole('columnheader').count() === 3 && await tb.getByRole('cell').count() === 9, 'the table\'s nodes');
  must(JSON.stringify(await tb.getByRole('row').nth(2).getByRole('cell').allTextContents()) === JSON.stringify(['Ink', '45.50', 'not paid']), 'the second row: ' + (await tb.getByRole('row').nth(2).getByRole('cell').allTextContents()).join(' | '));
  const h0 = await hist(); await press(page, 'Show the note'); must((await doc()).includes('Note: the figures are in euros.') && await page.getByRole('note').count() === 1 && (await hist()).length === h0.length, 'the note');
  // a press on a value proposes; the person is asked in the tools; dismissed, nothing; then, in a name, applied
  await pressAt(page, await at('not paid')); must(JSON.stringify(await asked()) === JSON.stringify([want.proposed[0].asked]), 'asked: ' + (await asked()).join(' / ')); await press(page, 'Dismiss'); must((await asked()).length === 0 && (await hist()).length === h0.length, 'dismissed');
  await giveName(page, who); await pressAt(page, await at('not paid')); await press(page, 'Apply'); let h = await hist(); must(h.length === h0.length + 1 && h[0].includes(`actor="${who}"`) && h[0].endsWith(`verdict=approve decided-by="${who}"`), 'applied: ' + h[0]);
  must(JSON.stringify(await tb.getByRole('row').nth(2).getByRole('cell').allTextContents()) === JSON.stringify(['Ink', '45.50', 'paid']), 'the row after');
  // a figure, typed in the widget the browser has
  await pressAt(page, await at('45.50')); await page.locator('#ufo-entry').waitFor({ state: 'visible', timeout: 3000 }); const a = page.locator('#ufo-entry textarea'); must(await a.inputValue() === '45.50', 'the widget holds ' + await a.inputValue());
  await a.evaluate(el => el.setSelectionRange(0, el.value.length)); await page.keyboard.type('50'); await page.locator('#ufo-entry button').first().click(); await page.locator('#ufo-entry').waitFor({ state: 'hidden', timeout: 3000 });
  h = await hist(); must((await asked()).length === 0 && (await doc()).includes('50.00') && (await doc()).includes(want.typed[0].total_then) && h.length === h0.length + 2 && h[0].includes(`actor="${who}"`) && h[0].endsWith('verdict=none'), 'a figure typed is the person\'s own input, written at once: ' + (await asked()).join(' / ') + ' | ' + h[0]);
  // the keyboard alone: the value is reached, Enter proposes, the word in the tools is reached, Enter applies
  await tb.getByRole('row').nth(3).getByRole('cell').nth(2).focus(); await page.keyboard.press('Enter'); must((await asked()).length === 1 && (await asked())[0].includes('rows.r3.paid'), 'by Enter: ' + (await asked()).join(' / '));
  await region.getByRole('button', { name: 'Apply' }).focus(); await page.keyboard.press('Enter'); h = await hist(); must(h.length === h0.length + 3 && (await asked()).length === 0 && (await tb.getByRole('row').nth(3).getByRole('cell').nth(2).textContent()) === 'paid', 'applied by Enter: ' + h[0]);
  must(log.requests.length <= 1 && !log.errors.length && !(await page.evaluate(() => globalThis.__violations)).length, 'not quiet: ' + JSON.stringify([log.requests.length, log.errors, await page.evaluate(() => globalThis.__violations)])); await context.close();
  return `a table of 4 rows; ${want.proposed[0].asked} asked, and applied by ${who}; 45.50 typed to 50 and written at once with no question, the total then ${want.typed[0].total_then.slice(7)}; a press by the keyboard alone, asked and applied`;
});
// containment (PRESENTATION 7.6 F6, F8 to F11): a file whose own description tries each way out, in a real page
const contained = async (open, press, { giveName, pressAt }) => check('contained: a file whose formulas and handlers try to read the tools, take a subject, save, decide, undo, import, commit and fetch does none of it: nothing is downloaded, chosen, requested or written; what it proposes honestly is written only when the person applies it', async () => {
  const f = path.join(work, 'contained.ufx.html'); make(here('../../vectors/contained.ufx'), f); const { context, page, log } = await open(f, 'nobody'), who = 'Rhea Reader', want = JSON.parse(fs.readFileSync(here('../../vectors/provisional/containment.json'), 'utf8'));
  const events = []; page.on('download', () => events.push('download')); page.on('filechooser', () => events.push('filechooser')); page.on('popup', () => events.push('popup'));
  const doc = async () => (await look(page)).texts.filter(t => t.on === 1).map(t => t.s), word = async w => (await look(page)).texts.find(t => t.on === 1 && t.s.trim().length > 2 && w.startsWith(t.s.trim())), head = async () => (await headOf(page)).commit;
  const region = page.getByRole('region', { name: 'A change the document asks for' }), asked = async () => (await region.count()) ? (await region.getByRole('paragraph').allTextContents()).filter(t => t.startsWith('Set ')) : [];
  const labels = want.attempts.map(a => /^the label (.*)$/.exec(a.here)).filter(Boolean).map(m => m[1]); must(labels.length === 8, 'the vector\'s labels'); let d = await doc(); for (const l of labels) must(d.includes(l), 'not shown: ' + l + ' in ' + d.join(' | '));
  must(d.includes('OWN label=as it was made') && d.includes('DEEP x') && d.includes('STATE who=nobody editing=off ran=nothing'), 'its own universe and state: ' + d.join(' | '));
  await giveName(page, who); must((await doc()).includes('STATE who=nobody editing=off ran=nothing'), 'the file reads the tools\' state'); const h0 = await head(), status0 = flatten((await page.getByRole('status').allTextContents()).join(' '));
  for (const w of ['SAVE-ME', 'DECIDE-ME', 'UNDO-ME', 'IMPORT-ME', 'COMMIT-ME', 'REACH-ME', 'SPLICE-ME']) { await pressAt(page, await word(w)); await page.waitForTimeout(60);
    must(await head() === h0 && !events.length && (await asked()).length === 0 && flatten((await page.getByRole('status').allTextContents()).join(' ')) === status0, w + ' did something: ' + JSON.stringify(events) + (await page.getByRole('status').allTextContents()).join(' ')); }
  await pressAt(page, await word('SWITCH-ME')); must((await doc()).includes('STATE who=Mallory editing=on ran=nothing') && await head() === h0 && (await asked()).length === 0, 'its own state'); const st = (await look(page)).texts.filter(t => t.on === 0);
  must(st.find(t => t.s === 'Document').lit && !st.find(t => t.s === 'Text').lit && flatten((await page.getByRole('status').allTextContents()).join(' ')).includes(flatten(`recorded as made by ${who}`)), 'the tools\' state was set by the file');
  // the keyboard is no way round: the same word, reached and pressed with Enter
  await page.getByRole('button', { name: 'SAVE-ME' }).focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(60); must(await head() === h0 && !events.length, 'SAVE-ME by Enter: ' + JSON.stringify(events));
  // an honest proposal: asked, dismissed, nothing; asked, applied, the person's
  await pressAt(page, await word('HONEST-ME')); const line = await asked(); must(line.length === 1 && line[0] === 'Set label of o:93939393: from “as it was made” to “changed by the file”.', 'asked: ' + line.join(' / ')); await press(page, 'Dismiss'); must(await head() === h0 && (await asked()).length === 0, 'dismissed');
  await pressAt(page, await word('HONEST-ME')); await press(page, 'Apply'); const top = (await ask(page, { name: 'history' })).split('\n').find(l => l.startsWith('change ')); must(await head() !== h0 && top.includes(`actor="${who}"`) && top.endsWith(`verdict=approve decided-by="${who}"`) && (await doc()).includes('OWN label=changed by the file'), 'applied: ' + top);
  // F10, typing: into a value whose handler writes more than was typed, the person is asked; into one whose handler writes what was typed where the value was, it is theirs at once
  const type = async (shown, to) => { await pressAt(page, (await look(page)).texts.find(t => t.on === 1 && t.s === shown)); await page.locator('#ufo-entry').waitFor({ state: 'visible', timeout: 3000 }); const a = page.locator('#ufo-entry textarea'); must(await a.inputValue() === shown, 'the widget holds ' + await a.inputValue());
    await a.evaluate(el => el.setSelectionRange(0, el.value.length)); await page.keyboard.type(to); await page.locator('#ufo-entry button').first().click(); await page.locator('#ufo-entry').waitFor({ state: 'hidden', timeout: 3000 }); };
  const h1 = await head(); await type('TYPE-MORE', 'typed'); const more = await asked(); must(more.length === 1 && more[0].includes('and more than was typed') && await head() === h1, 'more than was typed: ' + more.join(' / ')); await press(page, 'Dismiss');
  await type('changed by the file', 'typed by the reader'); const top2 = (await ask(page, { name: 'history' })).split('\n').find(l => l.startsWith('change ')); must((await asked()).length === 0 && await head() !== h1 && top2.includes(`actor="${who}"`) && top2.endsWith('verdict=none') && (await doc()).includes('OWN label=typed by the reader'), 'what was typed: ' + top2);
  must(!events.length && log.requests.length <= 1 && !log.errors.length && !log.asked.length && !(await page.evaluate(() => globalThis.__violations)).length, 'not quiet: ' + JSON.stringify([events, log.requests, log.errors, log.asked])); await context.close();
  return `${labels.length} formulas that reach outside show their labels; 8 handlers pressed, one by the keyboard too, did nothing: no download, no chooser, no request, no change; one honest proposal dismissed, then applied by ${who}; typing that would write more than was typed, asked about; typing into a value, written at once as theirs`;
});
// components (SPEC 1.6; spike/SPLIT.md): a page runs the base, and beside it only what its file lists for that base and the kernel can verify
const components = async (open) => {
  const made = (name, pack, ...flags) => { const f = path.join(work, name); make(here('../../vectors/' + pack), f, ...flags); return f; }, SAFE = /This file needs something this reader does not have: ufo\.code/;
  const status = async page => (await page.getByRole('status').allTextContents()).join(' '), quiet = async (page, log) => must(log.requests.length <= 1 && !log.errors.length && !(await page.evaluate(() => globalThis.__violations)).length, 'not quiet: ' + JSON.stringify(log.errors));
  await check('components: a file that lists none runs on the base alone, and the agent\'s projections are not in the page; one that lists the agent has them, and they say what the whole kernel says', async () => {
    const a = await open(made('plain.ufx.html', 'compose.ufx'), 'nobody'); must(await a.page.evaluate(() => ufo.project({ name: 'history' })) === null, 'a page with no component answers as an agent would'); await quiet(a.page, a.log); await a.context.close();
    const b = await open(made('agent.ufx.html', 'compose.ufx', '--components', 'agent'), 'nobody'), mine = await b.page.evaluate(() => ufo.project({ name: 'why', o: '71'.repeat(16), lo: 0, hi: 60 }));
    must(mine && mine === await ask(b.page, { name: 'why', o: T, lo: 0, hi: 60 }), 'the agent in the page: ' + String(mine).slice(0, 120)); await quiet(b.page, b.log); await b.context.close();
    return `${fs.statSync(path.join(work, 'plain.ufx.html')).size} bytes with none; ${fs.statSync(path.join(work, 'agent.ufx.html')).size} with the agent`; });
  await check('components: a file that requires what the printer provides, and lists the printer, is shown as itself', async () => {
    const { context, page, log } = await open(made('code.ufx.html', 'needs-code.ufx', '--components', 'printer'), 'nobody'); must(!SAFE.test(await status(page)), 'the printer was not used: ' + await status(page)); await quiet(page, log); await context.close(); return 'no line of something missing'; });
  await check('components: the same with one byte of the printer changed in the file: it does not verify, and the file opens to its plain text, saying what is missing', async () => {
    const { context, page, log } = await open(made('damaged.ufx.html', 'needs-code.ufx', '--components', 'printer', '--damaged'), 'nobody'), said = await status(page); must(SAFE.test(said), 'not said: ' + said);
    must((await page.getByRole('paragraph').allTextContents()).some(t => t.includes('Its captions are text.')), 'the text is not shown'); await quiet(page, log); await context.close(); return JSON.stringify(said.match(SAFE)[0]); });
  await check('components: the same with the printer listed for another kernel: it is not this kernel\'s to use', async () => {
    const { context, page, log } = await open(made('other.ufx.html', 'needs-code.ufx', '--components', 'printer', '--for-another-kernel'), 'nobody'); must(SAFE.test(await status(page)), 'not said: ' + await status(page)); await quiet(page, log); await context.close(); return 'its plain text, and what is missing'; });
};
// seals (TRAVEL 14.2; PLAYER 9.3 `verify`): the page checks each signature with what the browser has, and the tools say what was found
const sealing = async (open) => check('seals: a file whose seal is good says who sealed it and that the signature is good; the same file with one bit of the signature changed says that it is not', async () => {
  const one = async pack => { const f = path.join(work, pack + '.html'); make(here('../../vectors/' + pack), f); const { context, page, log } = await open(f, 'nobody'), said = (await page.getByRole('status').allTextContents()).join(' ');
    must(log.requests.length <= 1 && !log.errors.length && !(await page.evaluate(() => globalThis.__violations)).length, 'not quiet: ' + JSON.stringify(log.errors)); await context.close(); return said; };
  const good = await one('history.ufx'), bad = await one('bad-seal.ufx');
  must(/Sealed by Test Author at state c:[0-9a-f]{8}: the signature is good\. The file has changed since\./.test(good), 'the good seal: ' + good); must(/A seal in the name of Test Author is here, and its signature is NOT good\. Do not rely on it\./.test(bad), 'the bad seal: ' + bad);
  return JSON.stringify(good.match(/Sealed by[^.]*\.[^.]*\./)[0]); });
// damage (SPEC P9, P11): found by an outside implementation as a file that opened to an empty text and said nothing
const damaged = async (open) => check('damage: a file whose index is wrong opens whole, and says that its index is wrong; one with a record gone shows what is left, and says that a record is missing; with no tools, the reader says it itself', async () => {
  const M = JSON.parse(fs.readFileSync(here('../../vectors/vectors.json'), 'utf8')).minimal_pack, nested = path.join(work, 'minimal-nested.ufx'); make(here('../../vectors/minimal.ufx'), path.join(work, 'minimal.ufx.html'), '--pack', nested);
  const b = fs.readFileSync(nested), frames = []; for (let off = 8; off + 2 < b.length;) { let n = 0, sh = 0, q = off + 2, x; do { x = b[q++]; n += (x & 0x7f) * 2 ** sh; sh += 7; } while (x & 0x80); frames.push({ off, kind: b[off], start: q, len: n }); off = q + n; }
  const text = Buffer.from(M.revisions.text, 'hex'), entry = frames.filter(f => f.kind === 4).flatMap(f => Array.from({ length: (f.len - 24) / 40 }, (_, i) => f.start + 24 + 40 * i)).filter(at => b.subarray(at, at + 32).equals(text)).pop(); must(entry, 'the text\'s revision is in no index');
  const at = Number(b.readBigUInt64LE(entry + 32)), other = frames.find(f => f.kind === 2 && f.off !== at).off, quiet = async (page, log) => must(log.requests.length <= 1 && !log.errors.length && !(await page.evaluate(() => globalThis.__violations)).length, 'not quiet: ' + JSON.stringify(log.errors));
  const made = (name, change, ...flags) => { const c = Buffer.from(b); change(c); const p = path.join(work, name + '.ufx'), f = path.join(work, name + '.ufx.html'); fs.writeFileSync(p, c); make(p, f, ...flags); return f; };
  const said = async page => (await page.getByRole('status').allTextContents()).join(' '), shown = async page => (await look(page)).texts.filter(t => t.on === 1).map(t => t.s).join(' ');
  { const { context, page, log } = await open(made('index-wrong', c => c.writeBigUInt64LE(BigInt(other), entry + 32)), 'nobody'); must(/This file is damaged: the index is wrong; the file was read by going through all of it\./.test(await said(page)) && (await shown(page)).includes('Hello, universe.'), 'a wrong index: ' + await said(page) + ' / ' + await shown(page)); await quiet(page, log); await context.close(); }
  { const { context, page, log } = await open(made('record-gone', c => { const f = frames.find(f => f.off === at); c[f.start + f.len - 3] ^= 1; }), 'nobody'), s = await said(page); must(/This file is damaged: a record the document needs is not in the file\./.test(s) && !(await shown(page)).includes('Hello, universe.'), 'a record gone: ' + s + ' / ' + await shown(page)); await quiet(page, log); await context.close(); }
  { const f = path.join(work, 'index-wrong-bare.ufx.html'); make(here('../../vectors/index-wrong.ufx'), f, '--bare'); const { context, page, log } = await open(f, 'nobody'), s = await said(page);
    must(/This file carries no tools/.test(s) && /This file is damaged: what could be read of it is shown\./.test(s) && (await shown(page)).includes('Hello, universe.'), 'with no tools: ' + s); await quiet(page, log); await context.close(); }
  return 'the index wrong: the text whole, and the index said to be wrong; a record gone: said, and nothing shown in its place as though it were the text';
});
// the safeguard (PLAYER K7): a file that requires what this reader does not have opens, says what is missing, and shows its text
const needy = async (open, press) => check('safeguard: a file that requires what this reader does not have opens to its plain text, with one line saying what is missing; nothing is broken and nothing can change it', async () => {
  const f = path.join(work, 'needs.ufx.html'); make(here('../../vectors/needs.ufx'), f); const { context, page, log } = await open(f, 'nobody'), want = JSON.parse(fs.readFileSync(here('../../vectors/vectors.json'), 'utf8')).needs['a_reader_without_ufo.time'];
  const said = await page.getByRole('status').allTextContents(), line = said.find(s => /This file needs something this reader does not have/.test(s)); must(line && want.missing.every(m => line.includes(m)), 'what is missing is not said: ' + said.join(' / '));
  const paras = (await page.getByRole('paragraph').allTextContents()).map(flatten); for (const p of want.plain_text_face.trim().split('\n\n')) must(paras.includes(flatten(p)), 'not shown: ' + p + ' in ' + paras.join(' / '));
  const l = await d0.look(page); must(l.all.includes('Its captions are text.') && l.all.includes('ufo.time'), 'not drawn'); const head = (await headOf(page)).commit; await press(page, 'Edit'); await press(page, 'A film'); await page.keyboard.type('x'); await page.keyboard.press('Tab');
  must((await headOf(page)).commit === head, 'the file was changed'); must(log.requests.length <= 1 && !log.errors.length && !(await page.evaluate(() => globalThis.__violations)).length, 'not quiet'); await context.close(); return JSON.stringify(line);
});
const d = await environment(D, browser, desktop, file, { label: `desktop ${engineName}, file://`, first: dir('desktop'), kit: engineName === 'chromium', more: async (open, press, h) => { await bare(open, press); await needy(open, press); await decisions(open, press, h); await adding(open, press, h); await tabled(open, press, h); await contained(open, press, h); await components(open); await sealing(open); await damaged(open); } });

// ---- f: sent on. The saved file served from another origin; and the packs given to the independent reader ----
let h = null;
if (d.one.saved) {
  const sent = path.join(served, 'compose-edited.ufx.html'); fs.copyFileSync(d.one.saved, sent);
  h = await environment(H, browser, desktop, f => { const s = path.join(served, path.basename(f)); if (f !== s) fs.copyFileSync(f, s); return origin + '/' + path.basename(f); }, { label: `${engineName}, http origin ${origin}`, first: sent,
    edits: { para: 'Readers who', word: ['detail', 'sums'], start: ['The appendix', 'Also: '], back: ['Where a number', ' and the earlier value is kept'], paste: ['Revenue grew', 'year'], none: 'Second point', whole: ['What gets measured', 'managed', 'blown'], second: { para: 'Corrections are', words: [['welcome', 'fair'], ['gave', 'hold']] } } });
  env = D; step('sent on: the saved file opens, is edited, saved and reopened from ' + origin, !!(h.two && h.two.saved && results[H] && Object.values(results[H]).every(v => v === 'passed')));
  results[H]['sent on'] = results[D]['sent on'];
}

// ---- g: scripts disabled: the static face is the document as elements ----
env = 'scripts off'; console.log(`\n== scripts off (${engineName}, javaScriptEnabled: false)`);
for (const [label, f, sentence, shot] of [['the original', original, 'Every figure in this section', 'static'], ['the saved file', d.one.saved, d.one.sentence, 'static-edited']]) if (f) await check(`static face: ${label} shows what the file is and what to do, and the document as elements: the same headings, paragraphs and lists`, async () => {
  const context = await browser.newContext({ ...desktop, javaScriptEnabled: false }), page = await context.newPage(), requests = []; await context.route('**/*', route => { requests.push(route.request().url()); route.continue(); }); await page.goto(file(f));
  must(await page.locator('#ufo-static').isVisible() && await page.locator('#ufo-player').isHidden(), 'wrong parts showing'); const t = await page.locator('body').innerText(), text = page.locator('#ufo-text');
  must(t.includes(sentence) && t.includes('Corrections are welcome') && t.includes('This is a UFO file') && t.includes('open this file in a web browser') && await page.locator('#ufo-fail').isHidden(), 'text missing');
  const want = (await inNode(/<script type="application\/x-ufo-pack">([^<]*)</.exec(fs.readFileSync(f, 'utf8'))[1])).nodes;
  same(await text.getByRole('heading').evaluateAll(hs => hs.map(h => [+h.localName[1], h.textContent])), want.filter(n => n.role === 'heading').map(n => [n.level, n.text]), 'the headings'); must(await text.getByRole('heading', { name: 'The Quarterly Review', level: 1 }).count() === 1 && await text.getByRole('heading', { name: 'Method', level: 2 }).count() === 1, 'not found by role');
  same(await text.getByRole('paragraph').allTextContents(), want.filter(n => n.role === 'paragraph').map(n => n.text), 'the paragraphs'); must(await text.getByRole('list').count() === 2 && await text.getByRole('listitem').count() === 5, 'the lists');
  same(await text.locator('ul > li').evaluateAll(is => is.map(i => i.firstChild.data.trim())), ['First point, short.', 'Second point, which runs long enough to need a second line at the width used here.', 'Third point.'], 'the bulleted items, as li of a ul');
  same(await text.locator('ul > li > ol > li').evaluateAll(is => is.map(i => [i.value, i.textContent])), [[1, 'A numbered step.'], [2, 'Another numbered step.']], 'the nested numbered items, as li of an ol in the second item'); must((await text.locator('pre').textContent()).includes('\n') && await text.locator('blockquote').count() === 1, 'the code and the quote');
  must(requests.every(r => r === file(f)) && requests.length <= 1, 'requests: ' + requests); await page.screenshot({ path: path.join(shots, `${engineName}-${shot}.png`), fullPage: true }); await context.close();
  const small = await browser.newContext({ ...option(phone(PHONES[1])), javaScriptEnabled: false }), p2 = await small.newPage(); await p2.goto(file(f)); must(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'wider than the phone'); await p2.screenshot({ path: path.join(shots, `${engineName}-phone-${shot}.png`) }); await small.close();
  return `${want.filter(n => n.role === 'heading').length} headings, ${want.filter(n => n.role === 'paragraph').length} paragraphs, 2 lists; fits ${phoneNames[1]}`;
});

// ---- h: phones, with touch ----
const phones = [];
for (const [i, key] of [[0, 'phone, larger'], [1, 'phone, smaller']]) { const p = phone(PHONES[i]); phones.push(await environment(key, browser, option(p), file, { label: `${p.name}, file://, taps`, touch: true, first: dir('phone' + i) })); }

// ---- pictures: pages opened for nothing else, after everything is asserted ----
for (const [shot, options, f] of [['desktop', desktop, original], ['phone', option(phone(PHONES[0])), original], ['phone-small', option(phone(PHONES[1])), original], ['desktop-edited', desktop, d.one.saved]]) if (f) try {
  const ctx2 = await browser.newContext({ acceptDownloads: true, ...options }), p = await ctx2.newPage(); p.on('dialog', x => x.accept('Picture')); await p.goto(file(f)); await p.waitForFunction(() => globalThis.ufo);
  const snap = what => p.screenshot({ path: path.join(shots, `${engineName}-${shot}-${what}.png`) }), tool = async w => { const t = (await look(p)).texts.find(t => t.s === w), b = await p.locator('#ufo-player canvas').first().boundingBox(); await p.mouse.click(b.x + t.X + 5, b.y + t.Y - 4); };
  await snap('document'); await tool('Pages'); await snap('pages'); await tool('Text'); await snap('text'); await tool('Document'); await tool('Edit');
  for (let i = 0; i < 4; i++) await p.keyboard.press('Tab'); await snap('focus'); await p.keyboard.press('Enter'); await p.waitForTimeout(300); await snap('editing'); await ctx2.close();
} catch (e) { console.log('  (a picture was not taken: ' + String(e).split('\n')[0] + ')'); }
await browser.close(); server.close();

// ---- the independent reader, on every pack: the tools universe, those the kernel wrote in Node, those taken out of files this engine saved ----
env = 'reader'; console.log('\n== the independent reader (a copy of run.py, universe.py and ufo.py, not modified)');
if (d.one.saved) await check('reader: accepts every pack; sees the tools universe nested and its records as content; classes every record a published copy lacks as withheld', async () => {
  const run = path.join(work, 'reader'); fs.mkdirSync(path.join(run, 'packs'), { recursive: true }); for (const f of ['run.py', 'universe.py', 'ufo.py']) fs.copyFileSync(path.join(READER, f), path.join(run, f));
  // from files this engine saved: whole copies, published copies, and a published copy that was then edited again (saved each way)
  const fromPage = { 'desktop-whole-1.ufx': [d.one.saved, d.one.head], 'desktop-whole-2.ufx': [d.two?.saved, d.two?.head], 'http-whole-1.ufx': [h?.one.saved, h?.one.head], 'phone-larger-whole-2.ufx': [phones[0]?.two?.saved, phones[0]?.two?.head], 'phone-smaller-whole-2.ufx': [phones[1]?.two?.saved, phones[1]?.two?.head],
    'desktop-published.ufx': [d.one.published, d.one.head], 'http-published.ufx': [h?.one.published, h?.one.head], 'phone-smaller-published.ufx': [phones[1]?.one.published, phones[1]?.one.head],
    'desktop-published-then-edited-whole.ufx': [d.one.republished?.whole, d.one.republished?.head], 'desktop-published-then-edited-published.ufx': [d.one.republished?.again, d.one.republished?.head] }, heads = {};
  for (const [n, [f, head]] of Object.entries(fromPage)) if (f) { fs.writeFileSync(path.join(run, 'packs', `${engineName}-${n}`), Buffer.from(packIn(f), 'base64')); heads[`${engineName}-${n}`] = head; }
  for (const [n, f] of [['tools.ufx', here('tools.ufx')], ['node-edit-positioned.ufx', here('../../vectors/edit-positioned.ufx')], ['node-one-word.ufx', out + 'edited-one-word.ufx'], ['node-paragraph-start.ufx', out + 'edited-paragraph-start.ufx'], ['node-two-words.ufx', out + 'edited-two-words.ufx'], ['node-all-edits.ufx', out + 'edited.ufx'], ['node-many-edits.ufx', out + 'edited-many.ufx'],
    ['node-nested-whole.ufx', out + 'nested-whole.ufx'], ['node-nested-published.ufx', out + 'nested-published.ufx'], ['node-nested-published-then-edited.ufx', out + 'nested-published-edited.ufx'], ['vector-edit-one-word-published.ufx', here('../../vectors/edit-one-word-published.ufx')]]) if (fs.existsSync(f)) fs.copyFileSync(f, path.join(run, 'packs', n));
  execFileSync('python3', ['run.py'], { cwd: run }); const res = JSON.parse(fs.readFileSync(path.join(run, 'results.json'), 'utf8')), said = [], toolsRoot = res['tools.ufx'].state.root_hash, toolsContent = res['tools.ufx'].layers.content;
  for (const [n, r] of Object.entries(res)) { must(!r.reader_crashed, n + ': the reader crashed'); const u = r.universes[r.state.root_hash], classes = [...new Set(r.missing_records.map(m => m.class))], nests = r.other_universes.nested.includes(toolsRoot), published = /published/.test(n), cons = u.commits.map(c => c.conservation.result);
    said.push(`${n}: state ${r.state.root_hash.slice(0, 16)} by the ${r.state.how}; layers content ${r.counts.content}, attribution ${r.counts.attribution}, working history ${r.counts.working_history}; ${nests ? 'the tools universe nested, its ' + toolsContent.length + ' content records content here; ' : ''}conservation ${cons.join(' ')}; whole ${r.whole}; missing ${r.missing_records.length}${classes.length ? ' (' + classes.join(', ') + ')' : ''}; absent frames ${JSON.stringify(r.absent_frames)}; index problems ${r.index.problems.length}; reported ${JSON.stringify(r.reported)}`);
    must(r.state.how === 'final head' && (!heads[n] || r.state.root_hash === heads[n]), n + ': state ' + r.state.root_hash); must(!r.index.problems.length && !Object.keys(r.reported).length, n + ': ' + JSON.stringify([r.index.problems, r.reported]));
    must(classes.every(c => c === 'unavailable: withheld (working history)'), n + ': a missing record is classed ' + classes); must(cons.every(c => ['ok', 'withheld', 'unavailable'].includes(c)), n + ': conservation ' + cons);
    if (/^(chromium|firefox|webkit)-|nested/.test(n)) { must(nests && toolsContent.every(x => r.layers.content.includes(x)) && (r.layers.live[toolsRoot] || []).length >= 10, n + ': the tools universe is not nested, or its records are not content'); }
    if (published) must(r.counts.working_history === (/then-edited-whole|then-edited\.ufx/.test(n) ? r.counts.working_history : 0) && !r.whole && r.missing_records.length > 0 && r.absent_frames.length === 1 && r.absent_frames[0].history === true, n + ': not as a published copy is');
    else must(r.whole && !r.missing_records.length && cons.every(c => c === 'ok'), n + ': not whole, or conservation ' + cons);
    if (published) { const present = u.commits.filter(c => c.conservation.result !== 'withheld').map(c => `height ${c.height}: ${c.conservation.result}${c.conservation.result === 'ok' ? '' : ' (' + c.conservation.details.join('; ').slice(0, 90) + ')'}`); if (present.length) said.push(`      of the changes whose work is present: ${present.join(', ')}`); } }
  must(Object.keys(heads).length >= 8, 'packs from the browser are missing: ' + Object.keys(heads)); fs.writeFileSync(path.join(out, `reader-verdicts-${engineName}.txt`), said.join('\n') + '\n'); console.log(said.map(l => '      ' + l).join('\n')); return Object.keys(res).length + ' packs';
});

// ---- validity (E3): the Nu HTML Checker (needs Java) and html-validate, on the envelope as made and as saved by the page ----
env = 'validators'; console.log('\n== validators');
const tools = here('../tools/node_modules/'), files = [['as made', original], ['saved by the page', d.one.saved], ['saved twice', d.two && d.two.saved]].filter(f => f[1]);
for (const [label, f] of files) {
  await check(`valid: Nu HTML Checker, ${label}`, () => {
    let said = ''; try { said = execFileSync('java', ['-jar', tools + 'vnu-jar/build/dist/vnu.jar', '--format', 'json', '--stdout', f], { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 }).toString(); } catch (e) { said = String(e.stdout || ''); must(said, 'the checker did not run: ' + e.message); }
    const m = JSON.parse(said).messages, errors = m.filter(x => x.type === 'error' || x.subType === 'fatal'), kinds = {}; for (const x of m) { const k = (x.subType || x.type) + ': ' + x.message.replace(/Should instead be[^]*/, '').slice(0, 110); kinds[k] = (kinds[k] || 0) + 1; }
    must(!errors.length, errors.map(x => x.message.slice(0, 200)).join(' | ')); return '0 errors; ' + (Object.entries(kinds).map(([k, n]) => `${n} × ${k}`).join('; ') || 'no messages');
  });
  await check(`valid: html-validate, ${label}`, () => {
    const to = path.join(work, 'html-validate.json'); try { execFileSync('node', [tools + 'html-validate/bin/html-validate.mjs', '--config', here('htmlvalidate.json'), '--formatter', 'json=' + to, f], { stdio: 'ignore' }); } catch { }   // its exit says whether it found anything
    const m = JSON.parse(fs.readFileSync(to, 'utf8')).flatMap(r => r.messages); must(!m.length, m.map(x => `${x.line}:${x.column} ${x.ruleId} ${x.message}`).slice(0, 8).join(' | ')); return 'no messages';
  });
}

// ---- the table ----
console.log('\n' + ['step', ...Object.keys(results)].join(' | ')); for (const s of STEPS) if (s !== 'quirks') console.log([s, ...Object.keys(results).map(e => results[e][s] || 'not attempted')].join(' | '));
fs.writeFileSync(path.join(out, `envelope-test-results-${engineName}.json`), JSON.stringify({ engine: engineName, version, phones: phoneNames, results, host: globalThis.hostNumbers, total, failures }, null, 1));
console.log(failures ? `\n${failures} of ${total} FAILED` : `\nall ${total} passed`); process.exit(failures ? 1 : 0);
