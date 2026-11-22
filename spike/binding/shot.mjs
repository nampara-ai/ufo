import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)('playwright'); import http from 'http'; import fs from 'fs'; import path from 'path';
const dir = path.dirname(new URL(import.meta.url).pathname);
const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => { const f = path.join(dir, q.url.split('?')[0]); try { r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); } catch { r.writeHead(404); r.end(); } }).listen(0);
const port = srv.address().port; const b = await chromium.launch(); 
for (const [as, w] of [['view', 520], ['pages', 0], ['text', 0]]) {
  const p = await b.newPage({ viewport: { width: 700, height: 900 }, deviceScaleFactor: 1 }); const errs = []; p.on('console', m => m.type() === 'error' && errs.push(m.text())); p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`http://localhost:${port}/page.html?f=doc.ufx&as=${as}&w=${w}`); await p.waitForFunction('window.done', null, { timeout: 15000 }).catch(() => {});
  console.log(as, JSON.stringify(await p.evaluate('window.result')), errs.join(' | '));
  await p.screenshot({ path: path.join(dir, '..', 'out', `face-${as}.png`), fullPage: true }); await p.close();
}
await b.close(); srv.close();
