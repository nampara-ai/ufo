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
import { start } from '../binding/binding.mjs'; import { kernelWasm } from './parts.mjs'; import { envelope } from './envelope.mjs'; import { tree, flat } from './nodes.mjs';
import { playwright, launch, executable, ENGINES } from './engines.mjs';
const { devices } = playwright, here = p => fileURLToPath(new URL(p, import.meta.url)), out = here('../out/'), shots = here('../out/shots/');
const arg = n => (i => i < 0 ? null : process.argv[i + 1])(process.argv.indexOf('--' + n)), engineName = arg('engine') || 'all';
const STEPS = ['kernel', 'host', 'opened', 'pure function', 'faces', 'accessible', 'keyboard', 'edit', 'one word', 'paragraph start', 'typed', 'saved', 'policy', 'reopened', 'sent on', 'static face', 'reader', 'valid', 'quirks'];
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

const READER = '/tmp/claude-0/-home-user-ufo/4e3fe0fb-2c81-5333-8e7a-895d1e899d40/scratchpad/reader3';   // run.py, universe.py, ufo.py: a copy of the independent reader, not modified
if (!executable(engineName)) { console.log(`${engineName} is not installed here: not attempted`); process.exit(3); }
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ufo-envelope-test-'));   // downloads, served files and the reader's copy: not kept
fs.mkdirSync(shots, { recursive: true });
const MADE = '2026-01-02', T = '71'.repeat(16);   // the date given to make.mjs; the text object of compose.ufx
const make = (pack, file, ...more) => execFileSync('node', [here('make.mjs'), pack, file, '--date', MADE, ...more]);
const original = path.join(work, 'compose.ufx.html'); make(here('../../vectors/compose.ufx'), original);

const results = {};   // results[context][step] = 'passed' | 'failed'
let failures = 0, total = 0, env = '';
const step = (name, ok, detail = '') => { const key = name.split(':')[0]; (results[env] ||= {})[key] = results[env][key] === 'failed' || !ok ? 'failed' : 'passed'; total++; if (!ok) failures++; console.log(`  [${ok ? 'passed' : 'FAILED'}] ${name}${detail ? ' — ' + detail : ''}`); return ok; };
const check = async (name, f) => { try { const r = await f(); return step(name, r !== false, typeof r === 'string' ? r : ''); } catch (e) { return step(name, false, String(e && e.message || e).split('\n')[0].slice(0, 500)); } };
const must = (c, why) => { if (!c) throw Error(why); };
const same = (a, b, why) => must(JSON.stringify(a) === JSON.stringify(b), `${why}: ${JSON.stringify(a)} is not ${JSON.stringify(b)}`);

// ---- a kernel in Node, for what is computed independently of the page: the static face of a pack, its state, its nodes ----
const nodeKernel = () => start(kernelWasm(), (piece, s) => ({ adv: [...s].length * piece.size / 2, asc: piece.size * 0.8, desc: piece.size * 0.2 }), b => zlib.inflateRawSync(b));
const inNode = async pack64 => { const k = await nodeKernel(); must(await k.open(new Uint8Array(Buffer.from(pack64, 'base64'))), 'the pack does not open in Node');
  return { html: k.sample({ as: 'static' }).html, text: k.sample({ as: 'text' }).text, head: k.query({ q: 'commits' })[0].commit, nodes: flat(tree(k.sample({ as: 'list', w: 600 }).list)) }; };

// ---- in the page ----
// The parts, each as the text of the element that carries it: read by the test itself, not through the page's script.
const partsOf = page => page.evaluate(() => { const t = s => document.querySelector(s).textContent, d = n => t(`script[type="application/x-ufo-${n}"]`);
  return { title: document.title, style: t('style'), script: t('script[type=module]'), kernel: d('kernel'), 'kernel-hash': document.querySelector('script[type="application/x-ufo-kernel"]').dataset.hash, tools: d('tools'), pack: d('pack'), skeleton: d('skeleton') }; });
// What was last drawn: the text items of each list with where they are in CSS pixels of its canvas, and whether a stroke underlines them.
const look = page => page.evaluate(() => { const texts = [], lists = ufo.drawn();
  lists.forEach((l, on) => { const st = [[1, 0, 0]]; l.forEach(([kind, it], i) => { const m = st[st.length - 1];
    if (kind === 'push') st.push(it.m ? [m[0] * it.m[0], m[1] + m[0] * it.m[4], m[2] + m[0] * it.m[5]] : m); else if (kind === 'pop') st.pop();
    else if (kind === 'text') texts.push({ s: it.s, on, X: m[1] + m[0] * it.x, Y: m[2] + m[0] * it.y, adv: m[0] * it.adv, size: m[0] * it.size, press: it.press || null, src: !!it.src, mono: it.font[0] === 'monospace', weight: it.weight, slant: !!it.slant,
      lit: !!(l[i + 1] && l[i + 1][0] === 'path' && l[i + 1][1].stroke && l[i + 1][1].d.length === 2) }); }); });
  const rings = lists.map(l => l.filter(i => i[0] === 'path' && i[1].stroke && i[1].d.length === 5 && !i[1].fill).length);
  return { texts, rings, pages: lists[1].filter(i => i[0] === 'push' && i[1].clip).length, all: texts.map(t => t.s).join(''), said: texts.filter(t => t.on === 0 && t.slant).map(t => t.s).join('') }; });
const headOf = page => page.evaluate(() => ufo.query({ q: 'commits' })[0]);
const whyOf = (page, lo, hi) => page.evaluate(([o, lo, hi]) => ufo.query({ q: 'project', name: 'why', o, lo, hi }).split('\n').filter(l => l.startsWith('run ')), [T, lo, hi]);
const workOf = async (page, change) => (await page.evaluate(o => JSON.parse(ufo.query({ q: 'project', name: 'object', o }).split('\n').find(l => l.startsWith('prop key=work')).slice(20)).ops, change)).map(o => o.op === 'splice' ? [o.old ?? '', o.ins ?? ''] : ['set', o.key.join('.')]);
const charsOf = page => page.evaluate(o => { const s = ufo.query({ q: 'project', name: 'text', o }).split('\n')[1]; return JSON.parse(s.slice(s.indexOf(' s=') + 3)); }, T);
const spansOf = async page => Object.fromEntries(Object.entries(JSON.parse((await page.evaluate(o => ufo.query({ q: 'project', name: 'object', o }), T)).split('\n').find(l => l.startsWith('prop key=spans')).slice(21))).map(([k, s]) => [k, /chars=\[(\d+),(\d+)\]/.exec(s.at.$anchor).slice(1).map(Number)]));
const inked = page => page.evaluate(() => { const c = document.querySelectorAll('#ufo-player canvas')[1], o = document.createElement('canvas'); o.width = c.width; o.height = Math.min(c.height, 4000); const g = o.getContext('2d', { willReadFrequently: true }); g.drawImage(c, 0, 0); const d = g.getImageData(0, 0, o.width, o.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] && d[i] + d[i + 1] + d[i + 2] < 384) n++; return n; });
const focused = page => page.evaluate(() => { const a = document.activeElement; return { tag: a.localName, text: (a.textContent || '').trim(), pressed: a.getAttribute('aria-pressed'), current: a.getAttribute('aria-current'), seen: a.matches(':focus-visible'), outline: getComputedStyle(a).outlineStyle }; });
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
    if (t.on) await page.evaluate(y => { const r = document.querySelectorAll('#ufo-player canvas')[1].getBoundingClientRect(), top = document.getElementById('ufo-top').getBoundingClientRect().bottom; if (r.top + y < top + 30 || r.top + y > innerHeight - 40) scrollBy(0, r.top + y - (top + innerHeight) / 2); }, t.Y);
    const b = await c.boundingBox(), x = b.x + t.X + Math.min(t.adv / 2, 30), y = b.y + t.Y - t.size / 3; await (touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y)); };
  const press = async (page, starts) => pressAt(page, (await look(page)).texts.find(t => t.s.trim().startsWith(starts)));
  const hit = (page, sel) => touch ? page.locator(sel).tap() : page.locator(sel).click();
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
    same(await page.evaluate(() => globalThis.__violations), [], 'policy violations'); same(log.errors, [], 'console');
    return `${log.requests.length} seen by interception${url.startsWith('http') ? ', 1 by the server' : ''}, 0 fetched by the page, 0 violations, 0 console messages`;
  };
  // the page's own text is envelope(its parts): the parts from its elements, the static face and the state from a kernel in Node
  const pure = async (page, file) => { const bytes = fs.readFileSync(file, 'utf8'), date = /Exported (\d{4}-\d\d-\d\d)\. /.exec(bytes.slice(0, 200))[1], parts = await partsOf(page), st = await inNode(parts.pack);
    must(envelope({ ...parts, 'static-html': st.html, date }) === bytes, 'the file is not envelope(its parts)'); must(st.head === (await headOf(page)).commit, 'the pack in the file is not at the state the page shows'); return { bytes, date, parts }; };
  const editOn = async page => { if (!(await look(page)).texts.find(t => t.s === 'Edit').lit) await press(page, 'Edit'); must((await look(page)).texts.find(t => t.s === 'Edit').lit, 'Edit does not show that editing is on'); };
  // Through the tools, by typing: turn editing on if it is off, press a block, do things in the widget with the keyboard, then Done (or Cancel).
  // `act(old, keys)` gets the text the widget holds and the means: caret(a, b) puts the caret or a selection (the only thing not done by a key), type, key.
  const edit = async (page, log, who, para, act, { done = true, changes = true } = {}) => {
    await editOn(page); const named = log.asked.length; await press(page, para); await entry(page).waitFor({ state: 'visible', timeout: 3000 });
    const a = area(page), old = await a.inputValue(); must(old.startsWith(para), 'the widget holds: ' + old.slice(0, 40)); must(await page.evaluate(() => document.activeElement.localName) === 'textarea', 'the widget does not have the focus');
    await act(old, { caret: (from, to = from) => a.evaluate((el, [from, to]) => el.setSelectionRange(from, to), [from, to]), type: s => page.keyboard.type(s), key: async (k, n = 1) => { for (let i = 0; i < n; i++) await page.keyboard.press(k); }, area: a });
    const s = await a.inputValue(), before = await headOf(page); await hit(page, done ? '#ufo-entry button >> nth=0' : '#ufo-entry button >> nth=1');
    await entry(page).waitFor({ state: 'hidden', timeout: 3000 }); const head = await headOf(page), l = await look(page);
    if (!changes) { must(head.commit === before.commit, 'a change was made'); return { old, s, head }; }
    must(head.height === before.height + 1, 'no change was made: ' + l.said);
    must(new RegExp(`change\\s*${head.change.slice(0, 8)}\\s*by\\s*${who.replace(' ', '\\s*')}`).test(l.said), 'the reader does not say who changed it: ' + l.said);
    const chars = await charsOf(page); return { old, s, head, lo: chars.indexOf(s), asked: log.asked.length - named, ops: await workOf(page, head.change) };
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
    await check('accessible: the five tools are buttons that say how they stand, before and after Pages and Edit are pressed; what the reader says is a status', async () => {
      same(await tools(), [['Document', 'true', null], ['Pages', 'false', null], ['Text', 'false', null], ['Edit', null, 'false'], ['Save', null, null]], 'at first');
      must(await bar.getByRole('button', { name: 'Edit', pressed: false }).count() === 1 && await page.getByRole('status').count() === 1, 'Edit is not a toggle that is off, or there is no status');
      await press(page, 'Pages'); same(await tools(), [['Document', 'false', null], ['Pages', 'true', null], ['Text', 'false', null], ['Edit', null, 'false'], ['Save', null, null]], 'after Pages');
      const regions = await doc.getByRole('region').evaluateAll(rs => rs.map(r => r.getAttribute('aria-label'))); must(regions.length >= 2 && regions[0] === 'Page 1' && regions[1] === 'Page 2', 'the pages are not regions: ' + regions);
      same(await doc.getByRole('paragraph').allTextContents(), want.filter(n => n.role === 'paragraph').map(n => n.text), 'the paragraphs of the pages (one that runs over a page is still one)');
      await press(page, 'Edit'); same(await tools(), [['Document', 'false', null], ['Pages', 'true', null], ['Text', 'false', null], ['Edit', null, 'true'], ['Save', null, null]], 'after Edit');
      must(await bar.getByRole('button', { name: 'Edit', pressed: true }).count() === 1, 'Edit is not pressed'); must(await doc.locator('[tabindex="0"]').count() >= 10, 'the blocks cannot be reached');
      await press(page, 'Edit'); await press(page, 'Document'); same(await tools(), [['Document', 'true', null], ['Pages', 'false', null], ['Text', 'false', null], ['Edit', null, 'false'], ['Save', null, null]], 'back');
      must(await doc.locator('[tabindex]').count() === 0, 'blocks can still be reached with editing off'); return 'aria-current on the three that choose, aria-pressed on Edit';
    });
  };
  // ---- the keyboard alone: Tab to Edit, Enter, Tab to a paragraph, Enter, type, Tab to Done, Enter, back to Save, Enter: a file ----
  const keyboard = async file => {
    const { context, page, log, url } = await open(file, 'Kay Board'); let at = null;
    const tab = async (want, key = 'Tab', most = 40) => { for (let i = 0; i < most; i++) { await page.keyboard.press(key); at = await focused(page); if (want(at)) return i + 1; } throw Error('not reached; the focus is on ' + JSON.stringify(at)); };
    await check('keyboard: Tab reaches each tool in order, each shown by a ring; Enter on Edit turns editing on and says so', async () => {
      const seq = []; for (const w of ['Document', 'Pages', 'Text', 'Edit']) { await tab(() => true, 'Tab', 1); seq.push(at.text); must(at.tag === 'button' && at.text === w, 'Tab went to ' + JSON.stringify(at)); must((await look(page)).rings[0] === 1, 'no ring is drawn on ' + w); }
      await page.keyboard.press('Enter'); at = await focused(page); must(at.text === 'Edit' && at.pressed === 'true', 'Edit is not pressed, or lost the focus: ' + JSON.stringify(at));
      await page.keyboard.press('Space'); must((await focused(page)).pressed === 'false', 'Space did not press it'); await page.keyboard.press('Space'); must((await focused(page)).pressed === 'true', 'Space did not press it again'); return seq.join(', ') + '; Enter and Space press';
    });
    let made = null;
    await check('keyboard: Tab to a paragraph, Enter opens the labelled edit box, typing, Tab to Done, Enter: changed, and the focus is back on the paragraph', async () => {
      const n = await tab(a => a.tag === 'p' && a.text.startsWith('Readers who')); must((await look(page)).rings[1] === 1, 'no ring on the paragraph'); const y = await page.evaluate(() => scrollY);
      await page.keyboard.press('Enter'); await entry(page).waitFor({ state: 'visible', timeout: 3000 }); must(log.asked.length === 1, 'the name was not asked for');
      must(await page.getByRole('textbox', { name: 'The text being changed' }).count() === 1 && (await focused(page)).tag === 'textarea', 'the edit box is not labelled, or has not the focus');
      await page.keyboard.type('Keyed in. '); await tab(a => a.tag === 'button' && a.text === 'Done', 'Tab', 2); must(at.seen && at.outline !== 'none', 'Done shows no focus: ' + JSON.stringify(at)); const h = await headOf(page);
      await page.keyboard.press('Enter'); await entry(page).waitFor({ state: 'hidden', timeout: 3000 }); const head = await headOf(page); must(head.height === h.height + 1, 'no change');
      at = await focused(page); must(at.tag === 'p' && at.text.includes('Keyed in.'), 'the focus is on ' + JSON.stringify(at)); made = head; return `${n} more Tabs to the paragraph (the page scrolled to ${y}); the work: ${JSON.stringify(await workOf(page, head.change))}`;
    });
    await check('keyboard: back to Save with Shift+Tab, Enter: a file comes down, and the status says so', async () => {
      const n = await tab(a => a.tag === 'button' && a.text === 'Save', 'Shift+Tab'); const [download] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.keyboard.press('Enter')]);
      const f = path.join(work, `keyboard-${Date.now()}.html`); await download.saveAs(f); const pack = /<script type="application\/x-ufo-pack">([^<]*)</.exec(fs.readFileSync(f, 'utf8'))[1]; must((await inNode(pack)).head === made.commit, 'the file does not hold the change');
      must(/^Made .*\.ufx\.html/.test(await page.getByRole('status').textContent()), 'the status does not say a file was made'); await quiet(page, log, url); return `${n} Shift+Tabs; ${download.suggestedFilename()}; no request, violation or console message in the whole run`;
    });
    await context.close();
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
    if (firstRound) await accessible(page, made.parts);
    await check('edit: with editing off, a press on the document does nothing', async () => {
      const l = await look(page); must(l.texts.filter(t => t.press).map(t => t.s).join() === 'Document,Pages,Text,Edit,Save' && l.texts.filter(t => t.src && !t.press).length > 20, 'the working universe carries something to press');
      const h = await headOf(page); await press(page, edits.para); must(await entry(page).isHidden() && !log.asked.length && (await headOf(page)).commit === h.commit, 'a press on the document did something with editing off');
    });
    if (firstRound) {
      let e = null;
      await check(`edit: one word changed through the tools by selecting it and typing, as ${who}`, async () => { e = await edit(page, log, who, edits.para, replaceWord(edits.word)); must(e.asked === 1 && /name/.test(log.asked[0]), 'the reader did not ask who is editing, once'); done.sentence = e.s; done.old = e.old; return `asked "${log.asked[0]}"`; });
      await check('one word: why shows three runs, the word alone attributed to the new change, by=person, and the name', async () => {
        const w = await whyOf(page, e.lo, e.lo + [...e.s].length), at = e.lo + e.s.indexOf(edits.word[1]); for (const l of w) console.log('      ' + l); console.log('      work: ' + JSON.stringify(e.ops));
        must(w.length === 3 && !w[0].includes(e.head.change.slice(0, 8)) && !w[2].includes(e.head.change.slice(0, 8)) && w[0].includes(`chars=[${e.lo},${at}]`), 'not three runs');
        must(w[1].includes(`chars=[${at},${at + edits.word[1].length}]`) && w[1].includes('change=o:' + e.head.change.slice(0, 8)) && w[1].includes('by=person') && w[1].includes(`who=${JSON.stringify(who)}`), 'the word is not attributed');
        same(e.ops, [edits.word], 'the splice is not the word'); return w[1].trim();
      });
      await check(`paragraph start: "${edits.start[1]}" typed a key at a time at the very start of a paragraph is attributed where it was typed and stays in the paragraph`, async () => {
        const spans0 = await spansOf(page), chars0 = await charsOf(page), at = chars0.indexOf(edits.start[0]), [key] = Object.entries(spans0).find(([k, r]) => k[0] === 'b' && r[0] === at), [prev] = Object.entries(spans0).find(([k, r]) => k[0] === 'b' && r[1] === at && r[0] < at);
        const p = await edit(page, log, who, edits.start[0], async (old, k) => { await k.caret(0); await k.type(edits.start[1]); }), spans = await spansOf(page), chars = await charsOf(page), w = await whyOf(page, at - 5, at + 12);
        for (const l of w) console.log('      ' + l); console.log('      work: ' + JSON.stringify(p.ops));
        same(p.ops, [['', edits.start[1]], ['set', `spans.${prev}.at`], ['set', `spans.${key}.at`]], 'the work'); must(w.length === 3 && w[1].includes(`chars=[${at},${at + edits.start[1].length}]`) && w[1].includes(p.head.change.slice(0, 8)), 'not attributed at the start: ' + w.join(' / '));
        must(spans[key][0] === at && chars.slice(...spans[key]) === p.s, 'the block does not hold the new text: ' + JSON.stringify(chars.slice(...spans[key]).slice(0, 30))); must(spans[prev].join() === spans0[prev].join() && chars.slice(...spans[prev]) === chars0.slice(...spans0[prev]), 'the block before changed');
        must(p.asked === 0, 'asked for the name again'); const l = await look(page); must(l.texts.find(t => t.s.startsWith(edits.start[1] + edits.start[0])), 'not drawn at the start of its paragraph'); done.sentence2 = p.s; return `${key} = [${spans[key]}], ${prev} = [${spans[prev]}]; ${w[1].trim()}`;
      });
      await check('typed: a run of Backspace is one removal', async () => { const [para, gone] = edits.back; const r = await edit(page, log, who, para, async (old, k) => { await k.caret(old.indexOf(gone) + gone.length); await k.key('Backspace', gone.length); }); same(r.ops, [[gone, '']], 'the work'); return JSON.stringify(r.ops); });
      await check('typed: a word copied and pasted elsewhere is one insertion, where it was pasted', async () => { const [para, word] = edits.paste; const r = await edit(page, log, who, para, async (old, k) => { const at = old.indexOf(word); await k.caret(at, at + word.length); await k.key('ControlOrMeta+c'); await k.caret(old.length); await k.key('ControlOrMeta+v'); });
        same(r.ops, [['', word]], 'the work'); must(r.s === r.old + word, 'not pasted at the end'); return JSON.stringify(r.ops); });
      await check('typed: typed and deleted again, then the same letters typed over themselves: no change is made, and none is claimed', async () => {
        await edit(page, log, who, edits.none, async (old, k) => { await k.caret(5); await k.type(' zz'); await k.key('Backspace', 3); await k.caret(0, 5); await k.type(old.slice(0, 5)); }, { changes: false }); const said = (await look(page)).said; must(!/Changed/.test(said), 'the reader says: ' + said);
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
    await check('saved: a new .ufx.html comes down', async () => {
      done.head = (await headOf(page)).commit;
      const [download] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), press(page, 'Save')]); const name = download.suggestedFilename(); must(name === wantName, 'named ' + name);
      done.saved = path.join(path.dirname(file), name); must(done.saved !== file, 'same file'); await download.saveAs(done.saved); await page.waitForTimeout(200);
      must((await headOf(page)).commit === done.head && page.url() === url, 'the page changed, or went elsewhere'); return `${name}, ${fs.statSync(done.saved).size} bytes`;
    });
    await check('pure function: the file saved by the page is envelope(parts), computed in Node from the parts, byte for byte', async () => {
      const bytes = fs.readFileSync(done.saved, 'utf8'), pack = /<script type="application\/x-ufo-pack">([^<]*)</.exec(bytes)[1], st = await inNode(pack), today = new Date().toISOString().slice(0, 10);
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
  const base = path.basename(first).replace(/\.ufx\.html$/, ''), next = b => { const m = /^(.*-edited)(?:-(\d+))?$/.exec(b); return m ? m[1] + '-' + (+(m[2] || 1) + 1) : b + '-edited'; };
  const one = await round(first, 'the file', 'Ada Tester', next(base) + '.ufx.html', true);
  let two = null;
  if (one.saved) { await reopened(one.saved, one);
    console.log('  -- the saved file, edited and saved again');
    two = await round(one.saved, 'the saved file', 'Ben Second', next(next(base)) + '.ufx.html', false); if (two.saved) await reopened(two.saved, two);
  } else step('reopened: (nothing was saved)', false);
  console.log('  -- by the keyboard alone, from the file as first made'); await keyboard(first);
  if (kit && one.saved) { fs.copyFileSync(original, here('phone/compose.ufx.html')); fs.copyFileSync(one.saved, here('phone/compose-edited.ufx.html')); }
  if (more) await more(open, press);
  return { one, two, open, press };
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
for (const [key, script, last] of [['kernel', 'roundtrip.mjs', /^OK$/], ['kernel', 'more-edits.mjs', /^end lines=12$/]]) await check(`${key}: ${script}`, () => { const said = execFileSync('node', [here(script)]).toString().trim().split('\n'); must(last.test(said.pop()), 'did not finish'); return said.length + ' lines'; });

// ---- host code: everything the page ships as script is the binding; its budget (PLAYER 11.1), and what it may not know or do ----
console.log('\n== host code (the script as the page carries it)');
const html0 = fs.readFileSync(original, 'utf8'), shipped = html0.slice(html0.lastIndexOf('<script type="module">') + 22, html0.lastIndexOf('</script>')), lines = shipped.split('\n');
const counted = lines.filter(l => l.trim() && !l.trim().startsWith('//')).length, longest = Math.max(...lines.map(l => l.length)), size = Buffer.byteLength(shipped);
const FORBIDDEN = ['face', 'editing', 'export', 'pages', 'propose', 'splice', 'outerHTML', 'innerHTML', 'envelope', 'subject', 'tools', 'handler', 'commit', 'anchor', 'skeleton', 'universe', 'pack', 'formula', 'state'];
// Which engine it runs in is never asked: no name of an engine or a browser, no string that identifies one, no prefixed interface.
const ENGINE = [/userAgent/i, /\bvendor/i, /platform/i, /webkit/i, /safari/i, /firefox/i, /gecko/i, /chrom(e|ium)/i, /\bmoz|moz[A-Z]/, /\bms[A-Z]/, /\bopera|\bedge\b|trident/i];
// Nothing it does can fall outside the policy the envelope function writes: it writes no style by any means, makes no script, and opens nothing as a page.
const STYLE = [/\.style\b\s*[.=\[]/, /setAttribute\(\s*["'`]style/, /cssText/, /insertRule|replaceSync|adoptedStyleSheets|styleSheets/, /createElement\(\s*["'`](style|script|link|iframe|img|object|embed)/, /\beval\(|new Function|setTimeout\(\s*["'`]/, /document\.write|insertAdjacentHTML|srcdoc/, /location\s*=|location\.(href|assign|replace)|window\.open|\.open\(/, /fetch\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|importScripts|import\(/];
const code = lines.filter(l => !l.trim().startsWith('//')).join('\n');
await check('host: one script, the same as spike/envelope/host.mjs', () => { must(shipped === fs.readFileSync(here('host.mjs'), 'utf8').trim() && (html0.match(/<script type="module">/g) || []).length === 2, 'differs'); });   // twice: once in the skeleton's own text
await check('host: within the budget of a binding, 600 lines and 16 KiB as shipped, no line over 160 characters', () => { must(counted <= 600 && size <= 16384 && longest <= 160, `${counted} lines, ${size} bytes, longest ${longest}`); return `${counted} lines that are not blank or comment (${lines.length} in all), ${size} bytes, longest line ${longest} characters`; });
await check('host: none of the forbidden knowledge', () => { const text = shipped.replace(/\bdocument\./g, 'DOM.').replace(/\.instance\.exports\b/g, '.instance.EX'), found = [...FORBIDDEN, 'document'].filter(w => text.toLowerCase().includes(w.toLowerCase())); must(!found.length, 'found: ' + found.join(', '));
  return 'not found, in code or comment, in any letter case, as a word or inside one: ' + [...FORBIDDEN, 'document (but as the DOM global `document.`; and `export` but as the WebAssembly member `.instance.exports`)'].join(', ') + '. The roles of the drawing contract (heading, paragraph, quote, code, button, item, link) are its to know'; });
await check('host: it never asks which engine it is in (no engine or browser name, no user-agent, vendor or platform string, no prefixed interface)', () => { const found = ENGINE.filter(r => r.test(shipped)).map(String); must(!found.length, 'found: ' + found); return ENGINE.length + ' patterns, none found in code or comment'; });
await check('host: it writes no style, makes no script or other element a policy would have to allow, opens nothing as a page, and fetches nothing', () => { const found = STYLE.filter(r => r.test(code)).map(String); must(!found.length, 'found: ' + found);
  same([...code.matchAll(/createElement\((?:'(\w+)')?/g)].map(m => m[1] || 'of a role'), ['of a role', 'canvas', 'a'], 'the elements it makes'); return `${STYLE.length} patterns, none found; it makes only the elements of roles, a canvas to measure with, and the link a file is handed over by`; });
await check('host: the style part holds no rule that fetches, and the skeleton no style attribute, no handler attribute and no element that loads', () => { const css = fs.readFileSync(here('page.css'), 'utf8'), sk = fs.readFileSync(here('skeleton.html'), 'utf8');
  must(!/url\(|@import|@font-face|expression\(/i.test(css), 'the style fetches'); must(!/\sstyle\s*=|\son[a-z]+\s*=|<(img|iframe|object|embed|video|audio|source|base|form)\b|\ssrc\s*=/i.test(sk), 'the skeleton'); same([...sk.matchAll(/<link[^>]*>/g)].map(m => m[0]), ['<link rel="icon" href="data:,">'], 'links');
  return 'every byte the policy governs is a part whose hash the envelope function writes: one style, one script; the one link is an icon that is an empty data: address, which img-src data: allows'; });
globalThis.hostNumbers = { lines: counted, bytes: size, longest, forbidden: FORBIDDEN };
}

// ---- a to e on the desktop, from file:// ----
const desktop = { viewport: { width: 900, height: 900 }, deviceScaleFactor: 2 };
// F6 in the page: a working universe that carries handlers and a Portal onto arg("subject")
const f6 = async (open, press) => check('edit: F6, a file whose own content carries handlers and asks for a subject: nothing in it acts', async () => {
  const f = path.join(work, 'hostile.ufx.html'); make(here('../out/hostile.ufx'), f, '--title', 'Hostile'); const { context, page, log } = await open(f, 'nobody'); let downloads = 0; page.on('download', () => downloads++);
  const l = await look(page); must(l.texts.find(t => t.s === 'SAVE-ME' && !t.press && !t.lit) && l.all.includes('NO-SUBJECT-HERE'), 'not as expected: ' + l.all.slice(0, 200)); const h = await headOf(page);
  same(await page.getByRole('document', { name: 'The document these tools work on' }).locator('button').evaluateAll(bs => bs.map(b => [b.textContent, b.tabIndex, b.getAttribute('aria-disabled'), b.getAttribute('aria-pressed')])), [['SAVE-ME', -1, 'true', null], ['SWITCH-ME', -1, 'true', null]], 'the buttons it carries, to the keyboard and to assistive technology');
  for (const w of ['SAVE-ME', 'SWITCH-ME']) await press(page, w); await page.waitForTimeout(300); const l2 = await look(page);
  must(!downloads && (await headOf(page)).commit === h.commit && l2.texts.find(t => t.s === 'Document').lit && !l2.texts.some(t => t.mono) && !log.asked.length && !log.errors.length, 'something happened'); await context.close(); return 'pressed SAVE-ME and SWITCH-ME: no file, no change of face, no change; the Portal shows its label; to the keyboard they are not there';
});
const D = 'desktop, file://', H = 'http origin';
const d = await environment(D, browser, desktop, file, { label: `desktop ${engineName}, file://`, first: dir('desktop'), kit: engineName === 'chromium', more: f6 });

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
if (d.one.saved) await check('reader: accepts the tools universe, the packs the kernel wrote in Node, and the packs taken out of files saved by the browser', async () => {
  const run = path.join(work, 'reader'); fs.mkdirSync(path.join(run, 'packs'), { recursive: true }); for (const f of ['run.py', 'universe.py', 'ufo.py']) fs.copyFileSync(path.join(READER, f), path.join(run, f));
  const fromPage = { 'desktop-saved-1.ufx': d.one, 'desktop-saved-2.ufx': d.two, 'http-saved-1.ufx': h?.one, 'http-saved-2.ufx': h?.two, 'phone-larger-saved-2.ufx': phones[0]?.two, 'phone-smaller-saved-2.ufx': phones[1]?.two }, heads = {};
  for (const [n, x] of Object.entries(fromPage)) if (x?.saved) { fs.writeFileSync(path.join(run, 'packs', `${engineName}-${n}`), Buffer.from(/<script type="application\/x-ufo-pack">([^<]*)</.exec(fs.readFileSync(x.saved, 'utf8'))[1], 'base64')); heads[`${engineName}-${n}`] = x.head; }
  for (const [n, f] of [['tools.ufx', here('tools.ufx')], ['node-edit-positioned.ufx', here('../../vectors/edit-positioned.ufx')], ['node-one-word.ufx', out + 'edited-one-word.ufx'], ['node-paragraph-start.ufx', out + 'edited-paragraph-start.ufx'], ['node-two-words.ufx', out + 'edited-two-words.ufx'], ['node-all-edits.ufx', out + 'edited.ufx'], ['node-many-edits.ufx', out + 'edited-many.ufx']]) fs.copyFileSync(f, path.join(run, 'packs', n));
  execFileSync('python3', ['run.py'], { cwd: run }); const res = JSON.parse(fs.readFileSync(path.join(run, 'results.json'), 'utf8')), said = [];
  for (const [n, r] of Object.entries(res)) { const u = r.universes[r.state.root_hash];
    said.push(`${n}: state ${r.state.root_hash.slice(0, 16)} by the ${r.state.how}; ${u.commits.length} commits, conservation ${u.commits.map(c => c.conservation.result).join(' ')}; whole ${r.whole}; missing ${r.missing_records.length}; index problems ${r.index.problems.length}; reported ${JSON.stringify(r.reported)}`);
    must(r.state.how === 'final head' && (!heads[n] || r.state.root_hash === heads[n]), n + ': state ' + r.state.root_hash); must(u.commits.every(c => c.conservation.result === 'ok'), n + ': conservation ' + JSON.stringify(u.commits.map(c => c.conservation)));
    must(r.whole && !r.missing_records.length && !r.index.problems.length && !Object.keys(r.reported).length, n + ': ' + JSON.stringify([r.missing_records, r.index.problems, r.reported])); }
  must(Object.keys(heads).length >= 4, 'packs from the browser are missing'); fs.writeFileSync(path.join(out, `reader-verdicts-${engineName}.txt`), said.join('\n') + '\n'); console.log(said.map(l => '      ' + l).join('\n')); return Object.keys(res).length + ' packs, every conservation check ok';
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
