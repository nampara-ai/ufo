// The acceptance steps of the envelope spike in headless Chromium (Playwright), each asserted and printed.
// Only Chromium: the "iPhone" and "Pixel" runs are Chromium emulating a viewport, touch and a user-agent string, not Safari.
// Run from anywhere, after `cargo build` of the kernel:  node spike/envelope/test.mjs
import fs from 'fs'; import os from 'os'; import path from 'path'; import http from 'http'; import zlib from 'zlib'; import { execFileSync } from 'child_process'; import { fileURLToPath, pathToFileURL } from 'url'; import { createRequire } from 'module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const here = p => fileURLToPath(new URL(p, import.meta.url)), out = here('../out/'), shots = here('../out/shots/'), work = fs.mkdtempSync(path.join(os.tmpdir(), 'ufo-envelope-test-'));   // downloads, served files and the reader's copy: not kept
const READER = '/tmp/claude-0/-home-user-ufo/4e3fe0fb-2c81-5333-8e7a-895d1e899d40/scratchpad/readertest2';
fs.mkdirSync(shots, { recursive: true });
const make = (file, ...more) => execFileSync('node', [here('make.mjs'), here('../../vectors/compose.ufx'), file, ...more]);
const original = path.join(work, 'compose.ufx.html'); make(original);

const results = {};   // results[environment][step] = 'passed' | 'failed'
let failures = 0, env = '';
const step = (name, ok, detail = '') => { const key = name.split(':')[0]; (results[env] ||= {})[key] = results[env][key] === 'failed' || !ok ? 'failed' : 'passed'; if (!ok) failures++; console.log(`  [${ok ? 'passed' : 'FAILED'}] ${name}${detail ? ' — ' + detail : ''}`); return ok; };
const check = async (name, f) => { try { const r = await f(); return step(name, r !== false, typeof r === 'string' ? r : ''); } catch (e) { return step(name, false, String(e && e.message || e).split('\n')[0]); } };
const must = (c, why) => { if (!c) throw Error(why); };

// ---- in the page ----
// Where a text item is on its canvas, in CSS pixels: the tools universe or the face showing.
const where = (page, of, starts) => page.evaluate(([of, starts]) => {
  const k = ufo.kernel, w = Math.min(document.getElementById('ufo-player').clientWidth, 760);
  const v = of === 'tools' ? k.sample({ of: 'tools', as: 'view', w }) : k.sample({ as: ufo.state.face, w }), zoom = of === 'tools' ? 1 : Math.min(2, w / v.w), st = [[0, 0]];
  for (const [kind, it] of v.list) { const m = st[st.length - 1];
    if (kind === 'push') st.push([m[0] + (it.m ? it.m[4] : 0), m[1] + (it.m ? it.m[5] : 0)]); else if (kind === 'pop') st.pop();
    else if (kind === 'text' && it.s.trim().startsWith(starts)) return { x: (m[0] + it.x + Math.min(it.adv / 2, 30)) * zoom, y: (m[1] + it.y - it.size / 3) * zoom }; }
  return null;
}, [of, starts]);
const texts = (page, params) => page.evaluate(p => { const v = ufo.kernel.sample({ ...p, w: Math.min(document.getElementById('ufo-player').clientWidth, 760) }); return v.text ?? v.list.filter(i => i[0] === 'text').map(i => i[1].s).join(''); }, params);
const headOf = page => page.evaluate(() => document.documentElement.dataset.ufoHead);
const inked = (page, id) => page.evaluate(id => { const c = document.getElementById(id), o = document.createElement('canvas'); o.width = c.width; o.height = c.height; const g = o.getContext('2d', { willReadFrequently: true }); g.drawImage(c, 0, 0); const d = g.getImageData(0, 0, o.width, o.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] && d[i] + d[i + 1] + d[i + 2] < 384) n++; return n; }, id);

// One environment: a way of making browser contexts, a way of turning a file into an address, and whether to tap.
async function environment(name, browser, options, address, { touch = false, shot = null, first = original, kit = false, para1 = 'Every figure', s1 = 'Each number below was read from the ledger on the last day of the quarter.' } = {}) {
  env = name; console.log(`\n== ${name}`);
  const press = async (page, id, pt) => { must(pt, 'nothing to press'); await page.evaluate(([id, y]) => { const r = document.getElementById(id).getBoundingClientRect(); if (r.top + y < 90 || r.top + y > innerHeight - 40) scrollBy(0, r.top + y - innerHeight / 2); }, [id, pt.y]); const b = await page.locator('#' + id).boundingBox(); await (touch ? page.touchscreen.tap(b.x + pt.x, b.y + pt.y) : page.mouse.click(b.x + pt.x, b.y + pt.y)); };
  const tool = async (page, word) => press(page, 'ufo-tools', await where(page, 'tools', word));
  const hit = (page, sel) => touch ? page.locator(sel).tap() : page.locator(sel).click();
  const snap = async (page, what) => { if (shot) await page.screenshot({ path: path.join(shots, `${shot}-${what}.png`) }); };
  const open = async file => {
    const context = await browser.newContext({ acceptDownloads: true, ...options }), page = await context.newPage(), log = { requests: [], errors: [] };
    await page.route('**/*', route => { log.requests.push(route.request().url()); route.continue(); });
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') log.errors.push(m.text()); }); page.on('pageerror', e => log.errors.push(String(e)));
    const url = address(file); await page.goto(url); await page.waitForFunction(() => document.documentElement.dataset.ufoHead, null, { timeout: 15000 });
    return { context, page, log, url };
  };
  // a to e, starting from `file`; gives the saved file and the state it holds
  const round = async (file, label, who, para, sentence, wantName) => {
    const { context, page, log, url } = await open(file); const done = { head: null, saved: null };
    await check(`opened: ${label} runs its own kernel under its policy`, async () => {
      must(await page.evaluate(() => !!ufo.kernel && document.getElementById('ufo-static').hidden && !document.getElementById('ufo-player').hidden), 'the player is not showing');
      const csp = await page.evaluate(() => document.querySelector('meta[http-equiv]').content); must(/default-src 'none'/.test(csp) && /'wasm-unsafe-eval'/.test(csp) && !/unsafe-inline|unsafe-eval'|https?:|\*/.test(csp.replace("'wasm-unsafe-eval'", '')), 'policy: ' + csp);
      return 'state ' + (await headOf(page)).slice(0, 16);
    });
    await check('opened: no console errors or warnings', () => { must(!log.errors.length, log.errors.join(' | ')); });
    await check('opened: no request but for the file itself', () => { must(log.requests.length === 1 && log.requests[0] === url, JSON.stringify(log.requests)); return log.requests.length + ' request'; });
    await check('opened: the page gives itself back byte for byte as its own template', async () => {
      const again = await page.evaluate(() => ufo.envelope(ufo.kernel.packBytes(), ufo.kernel.sample({ as: 'text' }).text)), bytes = fs.readFileSync(file, 'utf8'), day = s => s.replace(/Exported \d{4}-\d\d-\d\d/, 'Exported D');
      must(day(again) === day(bytes), 'differs'); return bytes.length + ' characters';
    });
    const before = await texts(page, { as: 'text' });
    await check('two faces: document face drawn', async () => { must(await page.locator('#ufo-face').isVisible() && await inked(page, 'ufo-face') > 500, 'nothing drawn'); must((await texts(page, { as: 'document' })).includes('The Quarterly Review'), 'no heading'); await snap(page, 'document'); });
    await check('two faces: pages face drawn', async () => { await tool(page, 'Pages'); must(await page.evaluate(() => ufo.state.face === 'pages' && ufo.kernel.sample({ as: 'pages' }).pages >= 2), 'not pages'); must(await inked(page, 'ufo-face') > 500, 'nothing drawn'); await snap(page, 'pages'); });
    await check('two faces: text face shown', async () => { await tool(page, 'Text'); const t = await page.locator('#ufo-plain').innerText(); must(await page.locator('#ufo-plain').isVisible() && t.includes('The Quarterly Review') && t.includes(para), 'text missing'); await snap(page, 'text'); });
    await check('edit: nothing in the working universe acts', async () => {
      await tool(page, 'Document');
      must(await page.evaluate(() => { const k = ufo.kernel; return k.sample({ as: 'document', w: 480 }).list.every(i => i[0] !== 'text' || !('press' in i[1])) && k.sample({ as: 'pages' }).list.every(i => i[0] !== 'text' || !('press' in i[1])) && ['p2', 'b10', 'b1'].every(key => k.press(key) === null) && k.press('t3') !== null; }), 'a working item presses');
      await press(page, 'ufo-face', await where(page, 'face', para)); must(await page.locator('#ufo-edit').isHidden(), 'a tap on the document did something with editing off');
    });
    await check(`edit: a paragraph changed through the tools, as ${who}`, async () => {
      await tool(page, 'Edit'); must(await page.locator('#ufo-hint').isVisible(), 'editing is not on');
      await press(page, 'ufo-face', await where(page, 'face', para)); await page.locator('#ufo-edit').waitFor({ state: 'visible', timeout: 3000 });
      const old = await page.locator('#ufo-ins').inputValue(); must(old.startsWith(para), 'the box holds: ' + old.slice(0, 40)); await snap(page, 'editing');
      if (await page.locator('#ufo-who').isVisible()) await page.locator('#ufo-who').fill(who); await page.locator('#ufo-ins').fill(sentence); await hit(page, '#ufo-done');
      await page.locator('#ufo-edit').waitFor({ state: 'hidden', timeout: 3000 }); done.head = await headOf(page); done.old = old;
    });
    await check('edit: the new text shows in the document and text faces', async () => {
      const doc = await texts(page, { as: 'document' }), txt = await texts(page, { as: 'text' }); must(doc.replace(/\s+/g, ' ').includes(sentence) && txt.includes(sentence) && !txt.includes(done.old), 'not shown');
      must(txt.split('\n').filter(l => !l.includes(sentence)).join('\n') === before.split('\n').filter(l => !l.includes(done.old)).join('\n'), 'another line changed');
      await tool(page, 'Text'); must((await page.locator('#ufo-plain').innerText()).includes(sentence), 'not in the text face'); await snap(page, 'edited-text'); await tool(page, 'Document'); await snap(page, 'edited-document');
    });
    await check('edit: why names the new change, by=person, and the name', async () => {
      const change = /change ([0-9a-f]{8})/.exec(await page.locator('#ufo-note').innerText())[1];
      const why = await page.evaluate(s => { const k = ufo.kernel, hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''); const it = k.sample({ as: 'document', w: 480 }).list.find(i => i[0] === 'text' && i[1].src && s.startsWith(i[1].s.trim()) && i[1].s.trim()), b = k.blockAt(it[1].src); return k.query({ q: 'project', name: 'why', o: hex(b.o), lo: b.lo, hi: b.hi }); }, sentence);
      const line = why.split('\n').find(l => l.includes(change)); must(line && line.includes('by=person') && line.includes(JSON.stringify(who)), 'why:\n' + why); return line.trim();
    });
    await check('saved: a new .ufx.html comes down', async () => {
      const [download] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), tool(page, 'Save')]); const name = download.suggestedFilename(); must(name === wantName, 'named ' + name);
      done.saved = path.join(path.dirname(file), name); must(done.saved !== file, 'same file'); await download.saveAs(done.saved);
      const html = fs.readFileSync(done.saved, 'utf8'); must(html.startsWith('<!DOCTYPE html>\n<!--') && html.endsWith('</html>'), 'not a page');
      const pack = Buffer.from(/<script type="application\/x-ufo-pack">([^<]*)</.exec(html)[1], 'base64'); must(pack.length === await page.evaluate(() => ufo.kernel.packBytes().length), 'pack length');
      must(await headOf(page) === done.head && log.requests.length === 1 && !log.errors.length, 'requests or errors while saving: ' + JSON.stringify([log.requests.slice(1), log.errors])); return `${name}, ${html.length} bytes`;
    });
    if (shot) await snap(page, 'saved');
    await check('opened: the policy is enforced (an inline script put into the page does not run; a fetch is refused)', async () => {
      const r = await page.evaluate(async () => { const s = document.createElement('script'); s.textContent = 'globalThis.injected = 1'; document.body.append(s); let fetched = false; try { await fetch('data:text/plain,x'); fetched = true; } catch { } return { ran: !!globalThis.injected, fetched }; });
      must(!r.ran && !r.fetched, JSON.stringify(r)); must(log.requests.length === 1, 'a request left the page');
    });
    await context.close(); return done;
  };
  const reopened = async (file, head, sentence) => check('reopened: the saved file holds the same state and shows the edit in both faces', async () => {
    const { context, page, log } = await open(file); must(await headOf(page) === head, 'state ' + await headOf(page) + ' is not ' + head);
    must((await texts(page, { as: 'document' })).replace(/\s+/g, ' ').includes(sentence) && (await texts(page, { as: 'text' })).includes(sentence), 'edit not shown'); await tool(page, 'Text'); must((await page.locator('#ufo-plain').innerText()).includes(sentence), 'not in text face');
    must(/<pre id="ufo-text">[^]*<\/pre>/.exec(fs.readFileSync(file, 'utf8'))[0].includes(sentence), 'the static face of the saved file is old'); must(!log.errors.length && log.requests.length === 1, 'errors or requests'); await snap(page, 'reopened'); await context.close(); return 'state ' + head.slice(0, 16);
  });
  const s2 = 'None of this is a forecast; what the team expects comes next.';
  const base = path.basename(first).replace(/\.ufx\.html$/, ''), n = /^(.*-edited)(?:-(\d+))?$/.exec(base), next = b => { const m = /^(.*-edited)(?:-(\d+))?$/.exec(b); return m ? m[1] + '-' + (+(m[2] || 1) + 1) : b + '-edited'; };
  const one = await round(first, 'the file', 'Ada Tester', para1, s1, next(base) + '.ufx.html');
  let two = null;
  if (one.saved) { await reopened(one.saved, one.head, s1);
    const shot0 = shot; shot = null; console.log('  -- the saved file, edited and saved again');
    two = await round(one.saved, 'the saved file', 'Ben Second', 'Nothing here', s2, next(next(base)) + '.ufx.html'); if (two.saved) await reopened(two.saved, two.head, s2); shot = shot0;
  } else step('reopened: (nothing was saved)', false);
  if (kit && one.saved) { fs.copyFileSync(original, here('phone/compose.ufx.html')); fs.copyFileSync(one.saved, here('phone/compose-edited.ufx.html')); }
  return { one, two };
}

const browser = await chromium.launch();
const file = f => pathToFileURL(f).href;
const dir = n => { const d = path.join(work, n); fs.mkdirSync(d, { recursive: true }); fs.copyFileSync(original, path.join(d, 'compose.ufx.html')); return path.join(d, 'compose.ufx.html'); };

// ---- a to e on the desktop, from file:// ----
const desktop = { viewport: { width: 900, height: 900 }, deviceScaleFactor: 2 };
const d = await environment('desktop Chromium, file://', browser, desktop, file, { shot: 'desktop', first: dir('desktop'), kit: true });

// ---- f: sent on. The saved file served from another origin; and its pack given to the independent reader ----
const served = path.join(work, 'served'); fs.mkdirSync(served, { recursive: true });
const server = http.createServer((q, r) => { const f = path.join(served, path.basename(decodeURIComponent(q.url))); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(fs.readFileSync(f)); });
await new Promise(ok => server.listen(0, '127.0.0.1', ok)); const origin = 'http://127.0.0.1:' + server.address().port;
if (d.one.saved) {
  const sent = path.join(served, 'compose-edited.ufx.html'); fs.copyFileSync(d.one.saved, sent);
  const h = await environment('Chromium, http origin', browser, desktop, f => origin + '/' + path.basename(f), { first: sent, shot: 'http', para1: 'Each number below', s1: 'The figures were read from the ledger when the quarter closed.' });
  env = 'desktop Chromium, file://'; step('sent on: the saved file opens, is edited, saved and reopened from ' + origin, !!(h.two && h.two.saved && results['Chromium, http origin'] && Object.values(results['Chromium, http origin']).every(v => v === 'passed')));
  results['Chromium, http origin']['sent on'] = results[env]['sent on'];
  await check('sent on: the independent reader accepts the pack made in the browser', async () => {
    const run = path.join(work, 'reader'); fs.cpSync(READER, run, { recursive: true }); for (const f of fs.readdirSync(path.join(run, 'packs'))) fs.rmSync(path.join(run, 'packs', f));
    const packs = { 'browser-edit-1.ufx': d.one.saved, 'browser-edit-2.ufx': d.two.saved, 'browser-http-edit-3.ufx': h.two.saved };
    for (const [n, f] of Object.entries(packs)) fs.writeFileSync(path.join(run, 'packs', n), Buffer.from(/<script type="application\/x-ufo-pack">([^<]*)</.exec(fs.readFileSync(f, 'utf8'))[1], 'base64'));
    const said = execFileSync('python3', ['run.py'], { cwd: run }).toString(); fs.writeFileSync(path.join(out, 'reader-on-browser-packs.txt'), said); console.log(said.split('\n').filter(Boolean).map(l => '      ' + l).join('\n'));
    const res = JSON.parse(fs.readFileSync(path.join(run, 'results.json'), 'utf8')), heads = { 'browser-edit-1.ufx': d.one.head, 'browser-edit-2.ufx': d.two.head, 'browser-http-edit-3.ufx': h.two.head };
    for (const [n, r] of Object.entries(res)) { const u = r.universes[r.state.root_hash];
      must(r.state.root_hash === heads[n] && r.state.how === 'final head', n + ': state ' + r.state.root_hash); must(u.commits.every(c => c.conservation.result === 'ok'), n + ': conservation ' + JSON.stringify(u.commits.map(c => c.conservation)));
      must(r.whole && !r.missing_records.length && !r.index.problems.length && !(r.reported.length), n + ': ' + JSON.stringify([r.missing_records, r.index.problems, r.reported])); }
    return Object.entries(res).map(([n, r]) => `${n}: ${r.universes[r.state.root_hash].commits.length} commits, conservation ${r.universes[r.state.root_hash].commits.map(c => c.conservation.result).join(' ')}`).join('; ');
  });
}

// ---- g: scripts disabled ----
env = 'scripts off'; console.log('\n== scripts off (Chromium, javaScriptEnabled: false)');
for (const [label, f, sentence, shot] of [['the original', original, 'Every figure in this section', 'desktop-static'], ['the saved file', d.one.saved, 'Each number below was read', 'desktop-static-edited']]) if (f) await check(`static face: ${label} shows the title, the text and what to do`, async () => {
  const context = await browser.newContext({ ...desktop, javaScriptEnabled: false }), page = await context.newPage(); await page.goto(file(f));
  must(await page.locator('#ufo-static').isVisible() && await page.locator('#ufo-player').isHidden(), 'wrong parts showing'); const t = await page.locator('body').innerText();
  must(await page.locator('#ufo-static h1').innerText() === 'The Quarterly Review' && t.includes(sentence) && t.includes('Corrections are welcome') && t.includes('This is a UFO file') && t.includes('open this file in a web browser'), 'text missing');
  await page.screenshot({ path: path.join(shots, shot + '.png'), fullPage: true }); await context.close();
  const phone = await browser.newContext({ ...devices['iPhone 14'], javaScriptEnabled: false }), p2 = await phone.newPage(); await p2.goto(file(f)); await p2.screenshot({ path: path.join(shots, shot.replace('desktop', 'iphone') + '.png') }); await phone.close();
});

// ---- h: phone emulation, with touch. Chromium all the same. ----
for (const [name, device, shot] of [['iPhone 14 emulated in Chromium, file://', 'iPhone 14', 'iphone'], ['Pixel 7 emulated in Chromium, file://', 'Pixel 7', 'pixel']])
  await environment(name, browser, { ...devices[device] }, file, { touch: true, shot, first: dir(shot) });

// ---- the dense variant (ENCODING.md): opened, edited, saved, reopened; and what decoding costs ----
env = 'dense variant, desktop Chromium, file://'; console.log('\n== ' + env);
const denseFile = path.join(work, 'dense', 'compose.ufx.html'); fs.mkdirSync(path.dirname(denseFile), { recursive: true }); make(denseFile, '--dense');
await check('dense: opened, edited, saved, reopened with the same state', async () => {
  const context = await browser.newContext({ acceptDownloads: true, ...desktop }), page = await context.newPage(), errors = [], requests = []; page.on('console', m => m.type() === 'error' && errors.push(m.text())); page.on('pageerror', e => errors.push(String(e))); page.on('request', r => requests.push(r.url()));
  await page.goto(file(denseFile)); await page.waitForFunction(() => document.documentElement.dataset.ufoHead); must(await page.evaluate(() => !!ufo.dense), 'not dense');
  must(await page.evaluate(() => ufo.envelope(ufo.kernel.packBytes(), ufo.kernel.sample({ as: 'text' }).text)) === fs.readFileSync(denseFile, 'utf8'), 'the page does not give itself back byte for byte');
  const head = await page.evaluate(() => { const k = ufo.kernel, it = k.sample({ as: 'document', w: 480 }).list.find(i => i[0] === 'text' && i[1].s.startsWith('Every figure')), b = k.blockAt(it[1].src); const r = k.propose({ o: b.o, lo: b.lo, hi: b.hi, ins: 'Dense.', who: 'Dense Tester', time: Date.now(), random: crypto.getRandomValues(new Uint8Array(64)) }); return Array.from(r.commit, x => x.toString(16).padStart(2, '0')).join(''); });
  const pt = await where(page, 'tools', 'Save'), b = await page.locator('#ufo-tools').boundingBox(); const [download] = await Promise.all([page.waitForEvent('download'), page.mouse.click(b.x + pt.x, b.y + pt.y)]);
  const saved = path.join(work, 'dense', download.suggestedFilename()); await download.saveAs(saved); await page.goto(file(saved)); await page.waitForFunction(() => document.documentElement.dataset.ufoHead);
  must(await headOf(page) === head && (await texts(page, { as: 'text' })).includes('Dense.'), 'reopened differently'); must(!errors.length && requests.every(r => r.startsWith('file:')), errors.join('|'));
  await context.close(); return 'state ' + head.slice(0, 16) + ', saved ' + fs.statSync(saved).size + ' bytes';
});
const timing = {};
for (const [label, f] of [['base64', original], ['dense', denseFile]]) {
  const context = await browser.newContext(desktop), page = await context.newPage(); await page.goto(file(f)); await page.waitForFunction(() => document.documentElement.dataset.ufoHead);
  timing[label] = await page.evaluate(() => { const t = document.querySelector('script[type="application/x-ufo-kernel"]').textContent, p = document.querySelector('script[type="application/x-ufo-pack"]').textContent;
    const de = ufo.dense ? ufo.dense.de : t => Uint8Array.from(atob(t), c => c.charCodeAt(0)), time = s => { const runs = []; let n = 0; for (let i = 0; i < 30; i++) { const t0 = performance.now(); n = de(s).length; runs.push(performance.now() - t0); } runs.sort((a, b) => a - b); return { bytes: n, ms: +runs[15].toFixed(3) }; };
    const out = { kernel: time(t), pack: time(p) }; if (ufo.dense) { const b = ufo.dense.de(t), t0 = performance.now(); for (let i = 0; i < 10; i++) ufo.dense.en(b); out.encodeKernelMs = +((performance.now() - t0) / 10).toFixed(3); } return out; });
  await context.close();
}
console.log('  decode time in the page, median of 30 (Chromium, this machine):', JSON.stringify(timing));
await browser.close(); server.close();

// ---- validity (E3): the Nu HTML Checker (needs Java) and html-validate, on the envelope as made, as saved by the page, and dense ----
env = 'validators'; console.log('\n== validators');
const tools = here('../tools/node_modules/'), files = [['as made', original], ['saved by the page', d.one.saved], ['saved twice', d.two && d.two.saved], ['dense', denseFile]].filter(f => f[1]);
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
const steps = ['opened', 'two faces', 'edit', 'saved', 'reopened', 'sent on', 'static face', 'dense', 'valid'];
console.log('\n' + ['step', ...Object.keys(results)].join(' | ')); for (const s of steps) console.log([s, ...Object.keys(results).map(e => results[e][s] || 'not attempted')].join(' | '));
fs.writeFileSync(path.join(out, 'envelope-test-results.json'), JSON.stringify({ results, timing, failures }, null, 1));
console.log(failures ? `\n${failures} FAILED` : '\nall passed'); process.exit(failures ? 1 : 0);
