// Runs the quirks corpus (vectors/quirks/quirks.json) in every engine installed and prints a table, entry by engine.
//   node spike/envelope/quirks.mjs [--engine chromium|firefox|webkit]
// An entry passes in an engine when its page gives "pass" every way it is to be opened, with nothing on the console, no policy
// violation, no request to the origin but for the page, and the download it names if it names one. The naive pages are run too:
// each must fail in the engines the index says it fails in and pass in the others, or the index is wrong about that engine.
// Entry 00 is the envelope itself, built by make.mjs and driven by the keyboard through an edit, a save and a reopening.
import fs from 'fs'; import os from 'os'; import path from 'path'; import http from 'http'; import { execFileSync } from 'child_process'; import { fileURLToPath, pathToFileURL } from 'url';
import { launch, executable, ENGINES } from './engines.mjs';
const here = p => fileURLToPath(new URL(p, import.meta.url)), dir = here('../../vectors/quirks/'), out = here('../out/');
execFileSync('node', [here('quirks-make.mjs')]);   // the pages carry hashes of their own text: written afresh, so that the corpus is what the generator says
const index = JSON.parse(fs.readFileSync(dir + 'quirks.json', 'utf8')), only = (i => i < 0 ? null : process.argv[i + 1])(process.argv.indexOf('--engine'));
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ufo-quirks-')), hits = [];
const server = http.createServer((q, r) => { hits.push(q.url); const name = path.basename(decodeURIComponent(q.url)), f = [dir + name, path.join(work, name)].find(f => fs.existsSync(f)); if (!f) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(fs.readFileSync(f)); });
await new Promise(ok => server.listen(0, '127.0.0.1', ok)); const origin = 'http://127.0.0.1:' + server.address().port;
const address = (f, scheme) => scheme === 'http' ? origin + '/' + path.basename(f) : pathToFileURL(f).href;

// One page, opened one way: what it said, and everything seen from outside it.
async function visit(browser, f, scheme, { drive = [], act = null, until = p => p.waitForFunction(() => document.documentElement.dataset.result, null, { timeout: 8000 }) } = {}) {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 900, height: 700 } }), page = await context.newPage(), seen = { console: [], requests: [], downloads: [], from: hits.length };
  await context.addInitScript(() => { globalThis.__violations = []; document.addEventListener('securitypolicyviolation', e => __violations.push(`${e.violatedDirective} ${e.blockedURI}`)); });
  await context.route('**/*', route => { seen.requests.push(route.request().url()); route.continue(); });
  page.on('console', m => seen.console.push(`${m.type()}: ${m.text().slice(0, 140)}`)); page.on('pageerror', e => seen.console.push('error: ' + String(e).slice(0, 140))); page.on('dialog', d => d.accept('Quirk Runner'));
  page.on('download', async d => { const to = path.join(work, `${Date.now()}-${d.suggestedFilename()}`); await d.saveAs(to); seen.downloads.push({ name: d.suggestedFilename(), file: to }); });
  const url = address(f, scheme); await page.goto(url);
  for (const [what, a, b] of drive) {
    if (what === 'focus') await page.locator(a).focus(); else if (what === 'click') await page.locator(a).click(); else if (what === 'type') await page.keyboard.type(a); else if (what === 'insertText') await page.keyboard.insertText(a);
    else if (what === 'press') await page.keyboard.press(a); else if (what === 'caret') await page.evaluate(([a, b]) => document.activeElement.setSelectionRange(a, b), [a, b]);
  }
  if (act === 'screenshot') await page.screenshot();
  let result = null; try { await until(page); result = await page.evaluate(() => document.documentElement.dataset.result || null); } catch (e) { result = 'fail: ' + String(e).split('\n')[0].slice(0, 120); }
  await page.waitForTimeout(500);
  Object.assign(seen, { url, result, detail: await page.evaluate(() => document.documentElement.dataset.detail || '').catch(() => ''), violations: await page.evaluate(() => globalThis.__violations).catch(() => ['(the page is gone)']), asked: hits.slice(seen.from), fetched: await page.evaluate(() => performance.getEntriesByType('resource').map(e => e.name)).catch(() => []) });
  return { context, page, seen };
}
// What is wrong with a visit, by what the entry expects: nothing, if it passes.
function wrong(seen, scheme, expect = {}) {
  const w = [];
  if (seen.result !== 'pass') w.push(seen.result || 'no result');
  if (seen.console.length) w.push('console: ' + seen.console.join(' | '));
  if (seen.violations.length) w.push('violations: ' + seen.violations.join(', '));
  if (seen.fetched.length) w.push('fetched: ' + seen.fetched.join(', '));
  if (!seen.requests.every(r => r === seen.url) || seen.requests.length > 1) w.push('requests: ' + seen.requests.join(', '));
  if (scheme === 'http' && seen.asked.length !== (expect.requests ?? 1)) w.push('the origin was asked for ' + seen.asked.join(', '));
  if (expect.download) { const d = seen.downloads[0]; if (!d || d.name !== expect.download.name) w.push('no download named ' + expect.download.name); else if (fs.readFileSync(d.file, 'utf8') !== expect.download.text) w.push('the download is not the bytes given'); }
  else if (seen.downloads.length) w.push('a download: ' + seen.downloads[0].name);
  return w;
}
// Entry 00: the envelope, by the keyboard alone, from an http origin; then what it saved, reopened from there.
async function envelope(browser) {
  const f = path.join(work, 'compose.ufx.html'); if (!fs.existsSync(f)) execFileSync('node', [here('make.mjs'), here('../../vectors/compose.ufx'), f, '--date', '2026-01-02']);
  const ready = p => p.waitForFunction(() => globalThis.ufo, null, { timeout: 15000 }), w = [], key = async (p, k, n = 1) => { for (let i = 0; i < n; i++) await p.keyboard.press(k); };
  const a = await visit(browser, f, 'http', { until: ready }), p = a.page, at = () => p.evaluate(() => document.activeElement.localName + ':' + (document.activeElement.textContent || '').slice(0, 11));
  try {
    await key(p, 'Tab', 4); if (await at() !== 'button:Edit') w.push('four Tabs reach ' + await at()); await key(p, 'Enter');
    for (let i = 0; i < 30 && !(await at()).startsWith('p:Readers who'); i++) await key(p, 'Tab'); await key(p, 'Enter'); await p.locator('#ufo-entry').waitFor({ state: 'visible', timeout: 3000 });
    await p.keyboard.type('Quirk. '); await key(p, 'Tab'); await key(p, 'Enter'); await p.locator('#ufo-entry').waitFor({ state: 'hidden', timeout: 3000 });
    for (let i = 0; i < 40 && await at() !== 'button:Save'; i++) await key(p, 'Shift+Tab'); const state = await p.evaluate(() => ufo.query({ q: 'commits' })[0]);
    if (state.height !== 1) w.push('no change was made'); await Promise.all([p.waitForEvent('download', { timeout: 10000 }), key(p, 'Enter')]); await p.waitForTimeout(600);
    Object.assign(a.seen, { result: 'pass', violations: await p.evaluate(() => globalThis.__violations), asked: hits.slice(a.seen.from), fetched: await p.evaluate(() => performance.getEntriesByType('resource').map(e => e.name)) });
    const d = a.seen.downloads[0]; w.push(...wrong(a.seen, 'http', { download: d && { name: 'compose-edited.ufx.html', text: fs.readFileSync(d.file, 'utf8') } }));
    if (d) { const saved = path.join(work, 'compose-edited.ufx.html'); fs.copyFileSync(d.file, saved); const b = await visit(browser, saved, 'http', { until: ready });
      if ((await b.page.evaluate(() => ufo.query({ q: 'commits' })[0].commit)) !== state.commit) w.push('the saved file is not at the state the page had'); b.seen.result = 'pass'; w.push(...wrong(b.seen, 'http').map(x => 'reopened: ' + x)); await b.context.close(); }
  } catch (e) { w.push(String(e).split('\n')[0].slice(0, 200)); }
  await a.context.close(); return w;
}

const engines = (only ? [only] : ENGINES).filter(e => executable(e)), table = {}, results = { engines: {}, total: 0, passed: 0, failed: 0, naive: [], harness: {} };
for (const e of engines) {
  const browser = await launch(e); results.engines[e] = { version: browser.version(), failed: 0, entries: {} };
  for (const entry of index.entries) {
    const w = [];
    if (!entry.file) w.push(...await envelope(browser));
    else for (const scheme of entry.where) { const v = await visit(browser, dir + entry.file, scheme, entry); w.push(...wrong(v.seen, scheme, entry.expect).map(x => `${scheme}: ${x}`)); entry.detail = v.seen.detail; await v.context.close(); }
    results.total++; results[w.length ? 'failed' : 'passed']++; results.engines[e].failed += !!w.length; results.engines[e].entries[entry.id] = w.length ? w : 'pass'; (table[entry.id] ||= {})[e] = w.length ? 'FAIL' : 'pass';
    if (w.length) console.log(`${e} ${entry.id}: ${w.join('; ')}`);
    // the naive pages: failing where the index says, passing elsewhere
    for (const n of entry.naive || []) { const w = [];
      for (const scheme of entry.where) { const v = await visit(browser, dir + n.file, scheme, n); w.push(...wrong(v.seen, scheme, n.expect ?? entry.expect).map(x => `${scheme}: ${x}`)); await v.context.close(); }
      const said = !!n.fails[e], does = !!w.length; (table['  ' + n.file] ||= {})[e] = (does ? 'fails' : 'passes') + (said === does ? '' : ' (!)');
      results.naive.push({ file: n.file, engine: e, fails: does, as_recorded: said === does, how: w.join('; ').slice(0, 300) }); }
  }
  for (const hq of index.harness) { const v = await visit(browser, dir + hq.page, 'file', { act: hq.act });
    (table[hq.id] ||= {})[e] = hq.act === 'screenshot' ? (v.seen.violations.length ? `${v.seen.violations.length} violation` : 'clean') : `${v.seen.requests.length} reported`; results.harness[`${hq.id} ${e}`] = { violations: v.seen.violations, requests: v.seen.requests.length }; await v.context.close(); }
  await browser.close();
}
server.close();
const names = Object.keys(table), w = Math.max(...names.map(n => n.length));
console.log(`\nquirks corpus, ${index.entries.length} entries; engines ${engines.map(e => `${e} ${results.engines[e].version}`).join(', ')}. A naive page "fails" or "passes"; (!) marks one that did not do what the index records.`);
console.log(['entry'.padEnd(w), ...engines.map(e => e.padEnd(12))].join(' | ')); for (const n of names) console.log([n.padEnd(w), ...engines.map(e => (table[n][e] || '-').padEnd(12))].join(' | '));
const off = results.naive.filter(n => !n.as_recorded); results.off = off.length;
fs.writeFileSync(path.join(out, 'quirks-results.json'), JSON.stringify(results, null, 1));
console.log(`\n${results.passed} of ${results.total} passed` + (off.length ? `; ${off.length} naive pages did not behave as the index records` : '; every naive page behaved as the index records')); process.exit(results.failed || off.length ? 1 : 0);
