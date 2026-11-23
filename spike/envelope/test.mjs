// The acceptance steps of the envelope spike in a headless browser (Playwright), each asserted and printed.
// The page is driven only by real input: clicks or taps on its canvas, typing in the text-entry widget, its two
// buttons, and the browser's own prompt. What is read back comes from the page's read-only `ufo` (the list last
// drawn; kernel queries), from the page's elements, and from the files it saves.
//   node spike/envelope/test.mjs [--engine chromium|firefox|webkit]      (after `cargo build` of the kernel)
// Only Chromium has been run. The "iPhone" and "Pixel" runs are that engine emulating a viewport, touch and a user-agent string.
import fs from 'fs'; import os from 'os'; import path from 'path'; import http from 'http'; import zlib from 'zlib'; import { execFileSync } from 'child_process'; import { fileURLToPath, pathToFileURL } from 'url'; import { createRequire } from 'module';
import { start } from '../binding/binding.mjs'; import { kernelWasm } from './parts.mjs'; import { envelope } from './envelope.mjs';
const playwright = createRequire(import.meta.url)('playwright'), { devices } = playwright;
const engineName = (i => i < 0 ? 'chromium' : process.argv[i + 1])(process.argv.indexOf('--engine')), engine = playwright[engineName];
if (!['chromium', 'firefox', 'webkit'].includes(engineName)) { console.error('--engine chromium|firefox|webkit'); process.exit(2); }
if (!fs.existsSync(engine.executablePath())) { console.log(`${engineName} is not installed here (${engine.executablePath()}): not attempted`); process.exit(3); }
const here = p => fileURLToPath(new URL(p, import.meta.url)), out = here('../out/'), shots = here('../out/shots/'), work = fs.mkdtempSync(path.join(os.tmpdir(), 'ufo-envelope-test-'));   // downloads, served files and the reader's copy: not kept
const READER = '/tmp/claude-0/-home-user-ufo/4e3fe0fb-2c81-5333-8e7a-895d1e899d40/scratchpad/readertest2';
fs.mkdirSync(shots, { recursive: true });
const MADE = '2026-01-02', T = '71'.repeat(16);   // the date given to make.mjs; the text object of compose.ufx
const make = (pack, file, ...more) => execFileSync('node', [here('make.mjs'), pack, file, '--date', MADE, ...more]);
const original = path.join(work, 'compose.ufx.html'); make(here('../../vectors/compose.ufx'), original);

const results = {};   // results[environment][step] = 'passed' | 'failed'
let failures = 0, total = 0, env = '';
const step = (name, ok, detail = '') => { const key = name.split(':')[0]; (results[env] ||= {})[key] = results[env][key] === 'failed' || !ok ? 'failed' : 'passed'; total++; if (!ok) failures++; console.log(`  [${ok ? 'passed' : 'FAILED'}] ${name}${detail ? ' — ' + detail : ''}`); return ok; };
const check = async (name, f) => { try { const r = await f(); return step(name, r !== false, typeof r === 'string' ? r : ''); } catch (e) { return step(name, false, String(e && e.message || e).split('\n')[0].slice(0, 400)); } };
const must = (c, why) => { if (!c) throw Error(why); };

// ---- a kernel in Node, for what is computed independently of the page: the plain-text face of a pack ----
const nodeKernel = () => start(kernelWasm(), (piece, s) => ({ adv: [...s].length * piece.size / 2, asc: piece.size * 0.8, desc: piece.size * 0.2 }), b => zlib.inflateRawSync(b));
const staticOf = async pack64 => { const k = await nodeKernel(); must(await k.open(new Uint8Array(Buffer.from(pack64, 'base64'))), 'the pack does not open in Node'); return { text: k.sample({ as: 'text' }).text.replace(/^\n+/, ''), head: k.query({ q: 'commits' })[0].commit }; };

// ---- in the page ----
// The parts, each as the text of the element that carries it: read by the test itself, not through the page's script.
const partsOf = page => page.evaluate(() => { const t = s => document.querySelector(s).textContent, d = n => t(`script[type="application/x-ufo-${n}"]`);
  return { title: document.title, style: t('style'), script: t('script[type=module]'), kernel: d('kernel'), 'kernel-hash': document.querySelector('script[type="application/x-ufo-kernel"]').dataset.hash, tools: d('tools'), pack: d('pack'), skeleton: d('skeleton') }; });
// What was last drawn: its text items with where they are in CSS pixels of the canvas, and whether a stroke underlines them.
const look = page => page.evaluate(() => { const st = [[1, 0, 0]], texts = [], l = ufo.drawn();
  l.forEach(([kind, it], i) => { const m = st[st.length - 1];
    if (kind === 'push') st.push(it.m ? [m[0] * it.m[0], m[1] + m[0] * it.m[4], m[2] + m[0] * it.m[5]] : m); else if (kind === 'pop') st.pop();
    else if (kind === 'text') texts.push({ s: it.s, X: m[1] + m[0] * it.x, Y: m[2] + m[0] * it.y, adv: m[0] * it.adv, size: m[0] * it.size, press: it.press || null, src: !!it.src, mono: it.font[0] === 'monospace', weight: it.weight, slant: !!it.slant,
      lit: !!(l[i + 1] && l[i + 1][0] === 'path' && l[i + 1][1].stroke && l[i + 1][1].d.length === 2) }); });
  return { texts, pages: l.filter(i => i[0] === 'push' && i[1].clip).length, all: texts.map(t => t.s).join(''), kinds: [...new Set(l.map(i => i[0]))] }; });
const headOf = page => page.evaluate(() => ufo.query({ q: 'commits' })[0]);
const whyOf = (page, lo, hi) => page.evaluate(([o, lo, hi]) => ufo.query({ q: 'project', name: 'why', o, lo, hi }).split('\n').filter(l => l.startsWith('run ')), [T, lo, hi]);
const workOf = (page, change) => page.evaluate(o => JSON.parse(ufo.query({ q: 'project', name: 'object', o }).split('\n').find(l => l.startsWith('prop key=work')).slice(20)).ops, change);
const charsOf = page => page.evaluate(o => { const s = ufo.query({ q: 'project', name: 'text', o }).split('\n')[1]; return JSON.parse(s.slice(s.indexOf(' s=') + 3)); }, T);
const spansOf = async page => Object.fromEntries(Object.entries(JSON.parse((await page.evaluate(o => ufo.query({ q: 'project', name: 'object', o }), T)).split('\n').find(l => l.startsWith('prop key=spans')).slice(21))).map(([k, s]) => [k, /chars=\[(\d+),(\d+)\]/.exec(s.at.$anchor).slice(1).map(Number)]));
const inked = page => page.evaluate(() => { const c = document.querySelector('#ufo-player canvas'), o = document.createElement('canvas'); o.width = c.width; o.height = Math.min(c.height, 4000); const g = o.getContext('2d', { willReadFrequently: true }); g.drawImage(c, 0, 0); const d = g.getImageData(0, 0, o.width, o.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] && d[i] + d[i + 1] + d[i + 2] < 384) n++; return n; });

// One environment: a way of making browser contexts, a way of turning a file into an address, whether to tap, and the edits to make.
const EDITS = { para: 'Every figure', word: ['ledger', 'books'], start: ['Nothing here', 'Truly, '], second: { para: 'Where a number', words: [['number', 'total'], ['kept', 'shown']] } };
async function environment(name, browser, options, address, { touch = false, shot = null, first = original, kit = false, edits = EDITS, more = false } = {}) {
  env = name; console.log(`\n== ${name}`);
  const pressAt = async (page, t) => { must(t, 'nothing to press');
    await page.evaluate(y => { const r = document.querySelector('#ufo-player canvas').getBoundingClientRect(); if (r.top + y < 40 || r.top + y > innerHeight - 60) scrollBy(0, r.top + y - innerHeight / 2); }, t.Y);
    const b = await page.locator('#ufo-player canvas').boundingBox(), x = b.x + t.X + Math.min(t.adv / 2, 30), y = b.y + t.Y - t.size / 3; await (touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y)); };
  const press = async (page, starts) => pressAt(page, (await look(page)).texts.find(t => t.s.trim().startsWith(starts)));
  const hit = (page, sel) => touch ? page.locator(sel).tap() : page.locator(sel).click();
  const snap = async (page, what) => { if (shot) await page.screenshot({ path: path.join(shots, `${shot}-${what}.png`) }); };
  const open = async (file, who) => {
    const context = await browser.newContext({ acceptDownloads: true, ...options }), page = await context.newPage(), log = { requests: [], errors: [], asked: [] };
    await page.route('**/*', route => { log.requests.push(route.request().url()); route.continue(); });
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') log.errors.push(m.text()); }); page.on('pageerror', e => log.errors.push(String(e)));
    page.on('dialog', d => { log.asked.push(d.message()); d.accept(who); });   // the browser's own prompt: the reader asking who its principal is
    const url = address(file); await page.goto(url); await page.waitForFunction(() => globalThis.ufo, null, { timeout: 15000 });
    return { context, page, log, url };
  };
  // the page's own text is envelope(its parts): the parts from its elements, the static face and the state from a kernel in Node
  const pure = async (page, file) => { const bytes = fs.readFileSync(file, 'utf8'), date = /Exported (\d{4}-\d\d-\d\d)\. /.exec(bytes.slice(0, 200))[1], parts = await partsOf(page), st = await staticOf(parts.pack);
    must(envelope({ ...parts, static: st.text, date }) === bytes, 'the file is not envelope(its parts)'); must(st.head === (await headOf(page)).commit, 'the pack in the file is not at the state the page shows'); return { bytes, date, parts }; };
  // through the tools: turn editing on if it is off, press a block, type in the widget, Done
  const edit = async (page, log, who, para, change) => {
    if (!(await look(page)).texts.find(t => t.s === 'Edit').lit) await press(page, 'Edit'); must((await look(page)).texts.find(t => t.s === 'Edit').lit, 'Edit does not show that editing is on');
    const named = log.asked.length; await press(page, para); await page.locator('#ufo-entry').waitFor({ state: 'visible', timeout: 3000 });
    const old = await page.locator('#ufo-entry textarea').inputValue(); must(old.startsWith(para), 'the widget holds: ' + old.slice(0, 40));
    const s = change(old); await page.locator('#ufo-entry textarea').fill(s); await snap(page, 'editing'); const before = await headOf(page); await hit(page, '#ufo-entry button >> nth=0');
    await page.locator('#ufo-entry').waitFor({ state: 'hidden', timeout: 3000 }); const head = await headOf(page);
    must(head.height === before.height + 1, 'no change was made: ' + (await look(page)).texts.filter(t => t.slant && !t.src).map(t => t.s).join(''));
    must(new RegExp(`change\\s*${head.change.slice(0, 8)}\\s*by\\s*${who.replace(' ', '\\s*')}`).test((await look(page)).all), 'the reader does not say who changed it');
    const chars = await charsOf(page); return { old, s, head, lo: chars.indexOf(s), asked: log.asked.length - named };
  };
  // a to e, starting from `file`; gives the saved file and the state it holds
  const round = async (file, label, who, wantName, firstRound) => {
    const { context, page, log, url } = await open(file, who); const done = { head: null, saved: null }; let made = null;
    await check(`opened: ${label} runs its own kernel under its policy`, async () => {
      must(await page.evaluate(() => document.getElementById('ufo-static').hidden && !document.getElementById('ufo-player').hidden), 'the player is not showing');
      const csp = await page.evaluate(() => document.querySelector('meta[http-equiv]').content); must(/default-src 'none'/.test(csp) && /'wasm-unsafe-eval'/.test(csp) && !/unsafe-inline|unsafe-eval'|https?:|\*/.test(csp.replace("'wasm-unsafe-eval'", '')), 'policy: ' + csp);
      return 'state ' + (await headOf(page)).commit.slice(0, 16);
    });
    await check('opened: no console errors or warnings', () => { must(!log.errors.length, log.errors.join(' | ')); });
    await check('opened: no request but for the file itself', () => { must(log.requests.length === 1 && log.requests[0] === url, JSON.stringify(log.requests)); return log.requests.length + ' request'; });
    await check(`pure function: ${label}, read from disk, is envelope(parts) byte for byte, the parts being the text of its own elements`, async () => { made = await pure(page, file); return `${made.bytes.length} characters, exported ${made.date}`; });
    made ||= { parts: await partsOf(page) };
    const start0 = await look(page), plain0 = (await staticOf(made.parts.pack)).text;
    await check('faces: the document face is drawn, and the tools show it is on', async () => { must(await page.locator('#ufo-player canvas').isVisible() && await inked(page) > 500, 'nothing drawn'); must(start0.all.includes('The Quarterly Review') && start0.texts.find(t => t.s === 'Document').lit && !start0.texts.find(t => t.s === 'Pages').lit, 'no heading, or no mark'); await snap(page, 'document'); });
    await check('faces: the pages face is drawn', async () => { await press(page, 'Pages'); const l = await look(page); must(l.pages >= 2 && l.texts.find(t => t.s === 'Pages').lit && !l.texts.find(t => t.s === 'Document').lit, 'not pages'); must(await inked(page) > 500, 'nothing drawn'); await snap(page, 'pages'); return l.pages + ' pages'; });
    await check('faces: the plain-text face is drawn', async () => { await press(page, 'Text'); const l = await look(page), mono = l.texts.filter(t => t.mono).map(t => t.s).join('').replace(/\s+/g, ''); must(l.texts.find(t => t.s === 'Text').lit && mono.includes('TheQuarterlyReview') && mono.includes('•Firstpoint,short.') && mono.includes(plain0.split('\n').pop().replace(/\s+/g, '').slice(0, 30)), 'text missing'); await snap(page, 'text'); });
    await check('edit: with editing off, a press on the document does nothing', async () => {
      await press(page, 'Document'); const l = await look(page); must(l.texts.filter(t => t.press).map(t => t.s).join() === 'Document,Pages,Text,Edit,Save' && l.texts.filter(t => t.src && !t.press).length > 20, 'the working universe carries something to press');
      const h = await headOf(page); await press(page, edits.para); must(await page.locator('#ufo-entry').isHidden() && !log.asked.length && (await headOf(page)).commit === h.commit, 'a press on the document did something with editing off');
    });
    if (firstRound) {
      let e = null;
      await check(`edit: one word changed through the tools, as ${who}`, async () => { e = await edit(page, log, who, edits.para, s => s.replace(...edits.word)); must(e.asked === 1 && /name/.test(log.asked[0]), 'the reader did not ask who is editing, once'); await snap(page, 'edited'); done.sentence = e.s; done.old = e.old; return `asked "${log.asked[0]}"`; });
      await check('one word: why shows three runs, the word alone attributed to the new change, by=person, and the name', async () => {
        const w = await whyOf(page, e.lo, e.lo + [...e.s].length), at = e.lo + e.s.indexOf(edits.word[1]), ops = await workOf(page, e.head.change); for (const l of w) console.log('      ' + l); console.log('      work: ' + JSON.stringify(ops.map(o => ({ op: o.op, old: o.old, ins: o.ins, del: o.del.map(d => d.slice(1)) }))));
        must(w.length === 3 && !w[0].includes(e.head.change.slice(0, 8)) && !w[2].includes(e.head.change.slice(0, 8)) && w[0].includes(`chars=[${e.lo},${at}]`), 'not three runs');
        must(w[1].includes(`chars=[${at},${at + edits.word[1].length}]`) && w[1].includes('change=o:' + e.head.change.slice(0, 8)) && w[1].includes('by=person') && w[1].includes(`who=${JSON.stringify(who)}`), 'the word is not attributed');
        must(ops.length === 1 && ops[0].op === 'splice' && ops[0].old === edits.word[0] && ops[0].ins === edits.word[1], 'the splice is not the word'); return w[1].trim();
      });
      await check('paragraph start: a word typed at the very start of a paragraph stays in it; the one before is as it was', async () => {
        const spans0 = await spansOf(page), chars0 = await charsOf(page), at = chars0.indexOf(edits.start[0]), [key] = Object.entries(spans0).find(([k, r]) => k[0] === 'b' && r[0] === at), [prev] = Object.entries(spans0).find(([k, r]) => k[0] === 'b' && r[1] === at && r[0] < at);
        const p = await edit(page, log, who, edits.start[0], s => edits.start[1] + s), spans = await spansOf(page), chars = await charsOf(page), ops = await workOf(page, p.head.change);
        must(spans[key][0] === at && chars.slice(...spans[key]) === p.s, 'the block does not hold the new text: ' + JSON.stringify(chars.slice(...spans[key]).slice(0, 30))); must(spans[prev].join() === spans0[prev].join() && chars.slice(...spans[prev]) === chars0.slice(...spans0[prev]), 'the block before changed');
        must(ops.map(o => o.op + ' ' + (o.ins ?? o.key.join('.'))).join('; ') === `splice ${edits.start[1]}; set spans.${prev}.at; set spans.${key}.at`, 'the work: ' + JSON.stringify(ops)); must(p.asked === 0, 'asked for the name again');
        const l = await look(page); must(l.texts.find(t => t.s.startsWith(edits.start[1] + edits.start[0])), 'not drawn at the start of its paragraph'); done.sentence2 = p.s; return `${key} = [${spans[key]}], ${prev} = [${spans[prev]}]; ${ops.length} operations`;
      });
    } else {
      await check(`edit: two words apart changed through the tools, as ${who}: two splices in one change`, async () => {
        const e = await edit(page, log, who, edits.second.para, s => edits.second.words.reduce((s, w) => s.replace(...w), s)), ops = await workOf(page, e.head.change), w = await whyOf(page, e.lo, e.lo + [...e.s].length);
        must(JSON.stringify(ops.map(o => [o.op, o.old, o.ins])) === JSON.stringify(edits.second.words.map(w => ['splice', ...w])), 'the work: ' + JSON.stringify(ops)); must(w.length === 5 && w.filter(l => l.includes(e.head.change.slice(0, 8)) && l.includes(`who=${JSON.stringify(who)}`)).length === 2, 'why: ' + w.join(' / '));
        done.sentence = e.s; done.old = e.old; return w.filter(l => l.includes(e.head.change.slice(0, 8))).map(l => /chars=\S+/.exec(l)[0]).join(' and ') + ' by ' + who;
      });
    }
    await check('edit: the new text shows in the document and plain-text faces, and nothing else changed', async () => {
      const flat = s => s.replace(/\s+/g, ''), doc = flat((await look(page)).all); must(doc.includes(flat(done.sentence)) && !doc.includes(flat(done.old)), 'not shown in the document face');
      await press(page, 'Text'); const txt = flat((await look(page)).texts.filter(t => t.mono).map(t => t.s).join('')); must(txt.includes(flat(done.sentence)) && !txt.includes(flat(done.old)), 'not in the plain-text face'); await snap(page, 'edited-text'); await press(page, 'Document');
      const plain = (await page.evaluate(() => ufo.query({ q: 'project', name: 'text', o: '71'.repeat(16) }))).length; must(plain > 0, 'no text');
    });
    await check('edit: nothing turns editing on but the tools, and the tools turn it off', async () => { await press(page, 'Edit'); must(!(await look(page)).texts.find(t => t.s === 'Edit').lit, 'still on'); const h = await headOf(page); await press(page, edits.para); must(await page.locator('#ufo-entry').isHidden() && (await headOf(page)).commit === h.commit, 'a press edited'); });
    await check('saved: a new .ufx.html comes down', async () => {
      done.head = (await headOf(page)).commit;
      const [download] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), press(page, 'Save')]); const name = download.suggestedFilename(); must(name === wantName, 'named ' + name);
      done.saved = path.join(path.dirname(file), name); must(done.saved !== file, 'same file'); await download.saveAs(done.saved);
      must((await headOf(page)).commit === done.head && log.requests.length === 1 && !log.errors.length, 'requests or errors while saving: ' + JSON.stringify([log.requests.slice(1), log.errors])); await snap(page, 'saved'); return `${name}, ${fs.statSync(done.saved).size} bytes`;
    });
    await check('pure function: the file saved by the page is envelope(parts), computed in Node from the parts, byte for byte', async () => {
      const bytes = fs.readFileSync(done.saved, 'utf8'), pack = /<script type="application\/x-ufo-pack">([^<]*)</.exec(bytes)[1], st = await staticOf(pack), today = new Date().toISOString().slice(0, 10);
      must(st.head === done.head, 'the pack saved is not at the state the page had'); must(st.text.includes(done.sentence), 'the static face would not hold the edit');
      const parts = { ...made.parts, pack, static: st.text, date: today }, want = envelope(parts); must(want === bytes, bytes.length === want.length ? 'differs' : `lengths ${bytes.length} and ${want.length}`);
      must(bytes.startsWith(`<!DOCTYPE html>\n<!--\nUFO file (Universal File Object). Exported ${today}. Open it in a web browser.\n-->\n`) && !/--/.test(bytes.slice(20, bytes.indexOf('-->'))), 'the plain-text head'); return `${bytes.length} characters, exported ${today}`;
    });
    await check('opened: the policy is enforced (an inline script put into the page does not run; a fetch is refused)', async () => {
      const r = await page.evaluate(async () => { const s = document.createElement('script'); s.textContent = 'globalThis.injected = 1'; document.body.append(s); let fetched = false; try { await fetch('data:text/plain,x'); fetched = true; } catch { } return { ran: !!globalThis.injected, fetched }; });
      must(!r.ran && !r.fetched, JSON.stringify(r)); must(log.requests.length === 1, 'a request left the page');
    });
    await context.close(); return done;
  };
  const reopened = async (file, was) => check('reopened: the saved file holds the same state and shows the edit in both faces', async () => {
    const { context, page, log } = await open(file, 'nobody'), flat = s => s.replace(/\s+/g, ''); must((await headOf(page)).commit === was.head, 'state ' + (await headOf(page)).commit + ' is not ' + was.head);
    must(flat((await look(page)).all).includes(flat(was.sentence)), 'edit not shown'); await press(page, 'Text'); must(flat((await look(page)).texts.filter(t => t.mono).map(t => t.s).join('')).includes(flat(was.sentence)), 'not in the plain-text face');
    must(/<pre id="ufo-text">[^]*?<\/pre>/.exec(fs.readFileSync(file, 'utf8'))[0].includes(was.sentence), 'the static face of the saved file is old'); await pure(page, file); must(!log.errors.length && log.requests.length === 1 && !log.asked.length, 'errors or requests'); await snap(page, 'reopened'); await context.close(); return 'state ' + was.head.slice(0, 16);
  });
  const base = path.basename(first).replace(/\.ufx\.html$/, ''), next = b => { const m = /^(.*-edited)(?:-(\d+))?$/.exec(b); return m ? m[1] + '-' + (+(m[2] || 1) + 1) : b + '-edited'; };
  const one = await round(first, 'the file', 'Ada Tester', next(base) + '.ufx.html', true);
  let two = null;
  if (one.saved) { await reopened(one.saved, one);
    const shot0 = shot; shot = null; console.log('  -- the saved file, edited and saved again');
    two = await round(one.saved, 'the saved file', 'Ben Second', next(next(base)) + '.ufx.html', false); if (two.saved) await reopened(two.saved, two); shot = shot0;
  } else step('reopened: (nothing was saved)', false);
  if (kit && one.saved) { fs.copyFileSync(original, here('phone/compose.ufx.html')); fs.copyFileSync(one.saved, here('phone/compose-edited.ufx.html')); }
  if (more) await more(open, press);
  return { one, two };
}

const browser = await engine.launch();
const file = f => pathToFileURL(f).href;
const dir = n => { const d = path.join(work, n); fs.mkdirSync(d, { recursive: true }); fs.copyFileSync(original, path.join(d, 'compose.ufx.html')); return path.join(d, 'compose.ufx.html'); };
const device = n => { const d = { ...devices[n] }; if (engineName === 'firefox') delete d.isMobile; return d; };

// ---- the kernel alone, in Node: roundtrip.mjs (the tools driven by input events, the envelope function and its fixed case) and more-edits.mjs ----
env = 'kernel alone (Node)'; console.log('\n== ' + env);
for (const [key, script, last] of [['kernel', 'roundtrip.mjs', /^OK$/], ['kernel', 'more-edits.mjs', /^end lines=12$/]]) await check(`${key}: ${script}`, () => { const said = execFileSync('node', [here(script)]).toString().trim().split('\n'); must(last.test(said.pop()), 'did not finish'); return said.length + ' lines'; });

// ---- host code: everything the page ships as script is the binding; its budget (PLAYER 11.1), and what it may not know ----
env = 'host code'; console.log('\n== host code (the script as the page carries it)');
const shipped = (html => html.slice(html.lastIndexOf('<script type="module">') + 22, html.lastIndexOf('</script>')))(fs.readFileSync(original, 'utf8')), lines = shipped.split('\n');
const counted = lines.filter(l => l.trim() && !l.trim().startsWith('//')).length, longest = Math.max(...lines.map(l => l.length)), size = Buffer.byteLength(shipped);
const FORBIDDEN = ['face', 'editing', 'export', 'pages', 'propose', 'splice', 'outerHTML', 'innerHTML', 'envelope', 'subject', 'tools', 'handler', 'commit', 'paragraph', 'anchor', 'skeleton', 'universe', 'pack', 'formula', 'state'];
await check('host: one script, the same as spike/envelope/host.mjs', () => { must(shipped === fs.readFileSync(here('host.mjs'), 'utf8').trim() && (fs.readFileSync(original, 'utf8').match(/<script type="module">/g) || []).length === 2, 'differs'); });   // twice: once in the skeleton's own text
await check('host: within the budget of a binding, 600 lines and 16 KiB as shipped, no line over 160 characters', () => { must(counted <= 600 && size <= 16384 && longest <= 160, `${counted} lines, ${size} bytes, longest ${longest}`); return `${counted} lines that are not blank or comment (${lines.length} in all), ${size} bytes, longest line ${longest} characters`; });
await check('host: none of the forbidden knowledge', () => { const text = shipped.replace(/\bdocument\./g, 'DOM.').replace(/\.instance\.exports\b/g, '.instance.EX'), found = [...FORBIDDEN, 'document'].filter(w => text.toLowerCase().includes(w.toLowerCase())); must(!found.length, 'found: ' + found.join(', '));
  return 'not found, in code or comment, in any letter case, as a word or inside one: ' + [...FORBIDDEN, 'document (but as the DOM global `document.`; and `export` but as the WebAssembly member `.instance.exports`)'].join(', '); });

// ---- a to e on the desktop, from file:// ----
const desktop = { viewport: { width: 900, height: 900 }, deviceScaleFactor: 2 };
// F6 in the page: a working universe that carries handlers and a Portal onto arg("subject")
const f6 = async (open, press) => check('edit: F6, a file whose own content carries handlers and asks for a subject: nothing in it acts', async () => {
  const f = path.join(work, 'hostile.ufx.html'); make(here('../out/hostile.ufx'), f, '--title', 'Hostile'); const { context, page, log } = await open(f, 'nobody'); let downloads = 0; page.on('download', () => downloads++);
  const l = await look(page); must(l.texts.find(t => t.s === 'SAVE-ME' && !t.press && !t.lit) && l.all.includes('NO-SUBJECT-HERE'), 'not as expected: ' + l.all.slice(0, 200)); const h = await headOf(page);
  for (const w of ['SAVE-ME', 'SWITCH-ME']) await press(page, w); await page.waitForTimeout(300); const l2 = await look(page);
  must(!downloads && (await headOf(page)).commit === h.commit && l2.texts.find(t => t.s === 'Document').lit && !l2.texts.some(t => t.mono) && !log.asked.length && !log.errors.length, 'something happened'); await context.close(); return 'pressed SAVE-ME and SWITCH-ME: no file, no change of face, no change; the Portal shows its label';
});
const d = await environment(`desktop ${engineName}, file://`, browser, desktop, file, { shot: 'desktop', first: dir('desktop'), kit: engineName === 'chromium', more: f6 });

// ---- f: sent on. The saved file served from another origin; and the packs given to the independent reader ----
const served = path.join(work, 'served'); fs.mkdirSync(served, { recursive: true });
const server = http.createServer((q, r) => { const f = path.join(served, path.basename(decodeURIComponent(q.url))); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(fs.readFileSync(f)); });
await new Promise(ok => server.listen(0, '127.0.0.1', ok)); const origin = 'http://127.0.0.1:' + server.address().port;
if (d.one.saved) {
  const sent = path.join(served, 'compose-edited.ufx.html'); fs.copyFileSync(d.one.saved, sent); const httpEnv = `${engineName}, http origin`;
  const h = await environment(httpEnv, browser, desktop, f => origin + '/' + path.basename(f), { first: sent, shot: 'http', edits: { para: 'Readers who', word: ['detail', 'sums'], start: ['The appendix', 'Also: '], second: { para: 'Corrections are', words: [['welcome', 'fair'], ['gave', 'hold']] } } });
  env = `desktop ${engineName}, file://`; step('sent on: the saved file opens, is edited, saved and reopened from ' + origin, !!(h.two && h.two.saved && results[httpEnv] && Object.values(results[httpEnv]).every(v => v === 'passed')));
  results[httpEnv]['sent on'] = results[env]['sent on'];
  env = 'independent reader'; console.log('\n== the independent reader (readertest2, copied, not modified)');
  await check('reader: accepts the tools universe, the packs the kernel wrote in Node, and the packs taken out of files saved by the browser', async () => {
    const run = path.join(work, 'reader'); fs.cpSync(READER, run, { recursive: true }); for (const f of fs.readdirSync(path.join(run, 'packs'))) fs.rmSync(path.join(run, 'packs', f));
    const fromPage = { 'browser-edit-1.ufx': d.one, 'browser-edit-2.ufx': d.two, 'browser-http-edit-3.ufx': h.two }, heads = {};
    for (const [n, x] of Object.entries(fromPage)) { fs.writeFileSync(path.join(run, 'packs', n), Buffer.from(/<script type="application\/x-ufo-pack">([^<]*)</.exec(fs.readFileSync(x.saved, 'utf8'))[1], 'base64')); heads[n] = x.head; }
    for (const [n, f] of [['tools.ufx', here('tools.ufx')], ['node-one-word.ufx', out + 'edited-one-word.ufx'], ['node-paragraph-start.ufx', out + 'edited-paragraph-start.ufx'], ['node-two-words.ufx', out + 'edited-two-words.ufx'], ['node-all-edits.ufx', out + 'edited.ufx'], ['node-many-edits.ufx', out + 'edited-many.ufx']]) fs.copyFileSync(f, path.join(run, 'packs', n));
    execFileSync('python3', ['run.py'], { cwd: run }); const res = JSON.parse(fs.readFileSync(path.join(run, 'results.json'), 'utf8')), said = [];
    for (const [n, r] of Object.entries(res)) { const u = r.universes[r.state.root_hash];
      said.push(`${n}: state ${r.state.root_hash.slice(0, 16)} by the ${r.state.how}; ${u.commits.length} commits, conservation ${u.commits.map(c => c.conservation.result).join(' ')}; whole ${r.whole}; missing ${r.missing_records.length}; index problems ${r.index.problems.length}; reported ${JSON.stringify(r.reported)}`);
      must(r.state.how === 'final head' && (!heads[n] || r.state.root_hash === heads[n]), n + ': state ' + r.state.root_hash); must(u.commits.every(c => c.conservation.result === 'ok'), n + ': conservation ' + JSON.stringify(u.commits.map(c => c.conservation)));
      must(r.whole && !r.missing_records.length && !r.index.problems.length && !Object.keys(r.reported).length, n + ': ' + JSON.stringify([r.missing_records, r.index.problems, r.reported])); }
    fs.writeFileSync(path.join(out, 'reader-verdicts.txt'), said.join('\n') + '\n'); console.log(said.map(l => '      ' + l).join('\n')); return Object.keys(res).length + ' packs, every conservation check ok';
  });
}

// ---- g: scripts disabled ----
env = 'scripts off'; console.log(`\n== scripts off (${engineName}, javaScriptEnabled: false)`);
for (const [label, f, sentence, shot] of [['the original', original, 'Every figure in this section', 'desktop-static'], ['the saved file', d.one.saved, d.one.sentence, 'desktop-static-edited']]) if (f) await check(`static face: ${label} shows the title, the text and what to do`, async () => {
  const context = await browser.newContext({ ...desktop, javaScriptEnabled: false }), page = await context.newPage(); await page.goto(file(f));
  must(await page.locator('#ufo-static').isVisible() && await page.locator('#ufo-player').isHidden(), 'wrong parts showing'); const t = await page.locator('body').innerText();
  must(await page.locator('#ufo-static h1').innerText() === 'The Quarterly Review' && t.includes(sentence) && t.includes('Corrections are welcome') && t.includes('This is a UFO file') && t.includes('open this file in a web browser') && await page.locator('#ufo-fail').isHidden(), 'text missing');
  await page.screenshot({ path: path.join(shots, shot + '.png'), fullPage: true }); await context.close();
  const phone = await browser.newContext({ ...device('iPhone 14'), javaScriptEnabled: false }), p2 = await phone.newPage(); await p2.goto(file(f)); await p2.screenshot({ path: path.join(shots, shot.replace('desktop', 'iphone') + '.png') }); await phone.close();
});

// ---- h: phone emulation, with touch. The same engine all the same. ----
for (const [name, dev, shot] of [[`iPhone 14 emulated in ${engineName}, file://`, 'iPhone 14', 'iphone'], [`Pixel 7 emulated in ${engineName}, file://`, 'Pixel 7', 'pixel']])
  await environment(name, browser, device(dev), file, { touch: true, shot, first: dir(shot) });
await browser.close(); server.close();

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
    let said = ''; try { said = execFileSync('node', [tools + 'html-validate/bin/html-validate.mjs', '--config', here('htmlvalidate.json'), '--formatter', 'json', f], { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 }).toString(); } catch (e) { said = String(e.stdout || ''); must(said, 'html-validate did not run: ' + e.message); }
    const m = JSON.parse(said).flatMap(r => r.messages); must(!m.length, m.map(x => `${x.line}:${x.column} ${x.ruleId} ${x.message}`).slice(0, 8).join(' | ')); return 'no messages';
  });
}

// ---- the table ----
const steps = ['kernel', 'host', 'opened', 'pure function', 'faces', 'edit', 'one word', 'paragraph start', 'saved', 'reopened', 'sent on', 'static face', 'reader', 'valid'];
console.log('\n' + ['step', ...Object.keys(results)].join(' | ')); for (const s of steps) console.log([s, ...Object.keys(results).map(e => results[e][s] || 'not attempted')].join(' | '));
fs.writeFileSync(path.join(out, 'envelope-test-results.json'), JSON.stringify({ engine: engineName, results, host: { lines: counted, bytes: size, longest, forbidden: FORBIDDEN }, total, failures }, null, 1));
console.log(failures ? `\n${failures} of ${total} FAILED` : `\nall ${total} passed`); process.exit(failures ? 1 : 0);
