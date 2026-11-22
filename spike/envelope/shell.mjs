// The reader shell of a web envelope (throwaway spike): which face is showing, the edit box, saving.
// The binding (../binding/binding.mjs) is apart and knows none of this. make.mjs puts both in the page's one module script.
import { start, browserInflate, canvasMeasure, paint, boxes, textAt, unbase64, base64 } from '../binding/binding.mjs';
const dense = null;   // make.mjs --dense puts the denser text encoding here (ENCODING.md)
const $ = id => document.getElementById(id), part = t => document.querySelector(`script[type="application/x-ufo-${t}"]`);
const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
const esc = s => s.replace(/[&<> ]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] || '&nbsp;');

// ---- the envelope template (TRAVEL 13.2): this page as it was parsed, cut at its gaps, before anything here touches it ----
const tag = (n, a = '') => ['<' + n + a + '>', '</' + n + '>'];
const GAPS = [tag('title'), tag('h1'), tag('pre', ' id="ufo-text"'), tag('script', ' type="application/x-ufo-pack"')];
const fixed = [], fill = [];
{ let rest = '<!DOCTYPE html>\n<' + '!--' + document.childNodes[1].data + '-->\n' + document.documentElement.outerHTML;
  for (const [open, close] of GAPS) { const a = rest.indexOf(open) + open.length, b = rest.indexOf(close, a); fixed.push(rest.slice(0, a)); fill.push(rest.slice(a, b)); rest = rest.slice(b); }
  fixed.push(rest); fill[2] = fill[3] = ''; }   // the static face and the pack are made anew at each save
function envelope(pack, text) {   // the same page with the date, the static face and the pack new
  fill[2] = esc(text.replace(/^\n+/, '')); fill[3] = dense ? dense.en(pack) : base64(pack);
  return fixed[0].replace(/Exported \d{4}-\d\d-\d\d/, 'Exported ' + new Date().toISOString().slice(0, 10)) + fixed.slice(1).map((f, i) => fill[i] + f).join('');
}

// ---- start: the kernel out of the page, the pack through the kernel, the tools beside it ----
let k, state = { face: 'document', editing: false }, tools = [], shown = null, zoom = 1, width = 0, block = null, named = false;
async function boot() {
  const bytes = t => dense ? dense.de(t) : unbase64(t), kel = part('kernel'), wasm = await browserInflate(bytes(kel.textContent));
  if (globalThis.crypto?.subtle && hex(new Uint8Array(await crypto.subtle.digest('SHA-256', wasm))) !== kel.dataset.sha256) throw Error('the reader in this file does not match its label');
  k = await start(wasm, canvasMeasure(document.createElement('canvas').getContext('2d')), browserInflate);
  const pack = t => dense ? dense.de(t) : k.findPack(t), p = pack(part('pack').textContent);
  if (!p || !await k.open(p)) throw Error('the document in this file could not be opened');
  if (!k.openTools(pack(part('tools').textContent))) throw Error('the tools in this file could not be opened');
  $('ufo-player').hidden = false; show(); $('ufo-static').hidden = true;
  globalThis.ufo = { kernel: k, state, envelope, dense };   // for the tests and for looking; nothing here uses it
}

// ---- showing: the tools universe above, the working universe below in the face chosen ----
const head = () => k.query({ q: 'commits' })[0].commit;
function show() {
  width = Math.min($('ufo-player').clientWidth, 760);
  const t = k.sample({ of: 'tools', as: 'view', w: width }); tools = t.list;
  const g = paint($('ufo-tools'), tools, width, t.h); g.fillStyle = '#1558d6';
  for (const [it, x0, , x1, y1] of boxes(tools)) { const h = it.press && k.press(it.press); if (h && 'set' in h && state[h.set] === h.to) g.fillRect(x0, y1 + 1, x1 - x0, 2); }   // a tool whose press would set what is already so
  const v = k.sample({ as: state.face, w: width }); shown = v.list || null;
  $('ufo-face').hidden = !shown; $('ufo-plain').hidden = !!shown;
  if (shown) { zoom = Math.min(2, width / v.w); $('ufo-face').style.background = v.pages ? '#c9c9c4' : ''; const g = paint($('ufo-face'), shown, v.w, v.h, zoom); if (block) place(g, v.w); } else { $('ufo-plain').textContent = v.text; $('ufo-edit').hidden = true; }
  $('ufo-hint').hidden = !state.editing; $('ufo-hint').textContent = shown ? 'Editing is on. Tap a paragraph to change it.' : 'Editing is on. Choose Document or Pages, then tap a paragraph to change it.';
  const h = head(); document.documentElement.dataset.ufoHead = h; $('ufo-status').textContent = `State ${h.slice(0, 16)}… · ${k.packBytes().length} bytes in the pack`;
}
function place(g, w) {   // tint the block being edited and put the edit box under it
  let top = Infinity, bottom = 0;
  for (const [it, , y0, , y1] of boxes(shown)) { const b = it.src && k.blockAt(it.src); if (b && b.lo === block.lo && hex(b.o) === hex(block.o)) { top = Math.min(top, y0); bottom = Math.max(bottom, y1); } }
  g.fillStyle = 'rgba(21,88,214,0.12)'; g.fillRect(0, top - 2, w, bottom - top + 4);
  $('ufo-edit').style.top = (bottom + 6) * zoom + 'px'; $('ufo-edit').hidden = false;
}

// ---- pressing: only the tools universe acts; the working universe is only pointed at ----
$('ufo-tools').onclick = e => {
  const it = textAt(tools, e.offsetX, e.offsetY, i => i.press, 24), h = it && k.press(it.press);
  if (!h) return;
  if ('set' in h) { state[h.set] = h.to; block = null; $('ufo-edit').hidden = true; show(); } else if (h.act === 'export') save();
};
$('ufo-face').onclick = e => {
  if (!state.editing) return;
  const it = textAt(shown, e.offsetX / zoom, e.offsetY / zoom, i => i.src), b = it && k.blockAt(it.src);
  if (!b) return;
  block = b; $('ufo-ins').value = b.text; $('ufo-refused').hidden = true; $('ufo-who-row').hidden = named; show(); $('ufo-ins').focus({ preventScroll: false });
};
$('ufo-cancel').onclick = () => { block = null; $('ufo-edit').hidden = true; show(); };
$('ufo-done').onclick = () => {
  const ins = $('ufo-ins').value, who = $('ufo-who').value.trim() || 'Anonymous';
  if (ins === block.text) return $('ufo-cancel').onclick();
  const r = k.propose({ o: block.o, lo: block.lo, hi: block.hi, ins, who, time: Date.now(), random: crypto.getRandomValues(new Uint8Array(64)) });
  if (r.refused) { $('ufo-refused').textContent = 'Not changed: ' + r.refused; $('ufo-refused').hidden = false; return; }
  named = true; block = null; $('ufo-edit').hidden = true; show();
  $('ufo-note').textContent = `Changed, and recorded as change ${hex(r.change).slice(0, 8)} by ${who}. Not yet saved to a file: press Save.`; $('ufo-note').hidden = false;
};
addEventListener('resize', () => { if (k && Math.min($('ufo-player').clientWidth, 760) !== width) show(); });

// ---- saving: a new envelope made of this page, offered as a download (and to the share sheet where there is one) ----
function save() {
  const html = envelope(k.packBytes(), k.sample({ as: 'text' }).text);
  const was = decodeURIComponent(location.pathname.split('/').pop()).replace(/\.ufx\.html$|\.html?$/, '') || 'document', n = /^(.*-edited)(?:-(\d+))?$/.exec(was);
  const name = (n ? n[1] + '-' + (+(n[2] || 1) + 1) : was + '-edited') + '.ufx.html', file = new File([html], name, { type: 'text/html' });
  const a = $('ufo-link'); URL.revokeObjectURL(a.href); a.href = URL.createObjectURL(file); a.download = name; a.textContent = name;
  $('ufo-note').textContent = `Made a new file of ${file.size} bytes holding state ${head().slice(0, 16)}…. If no download started, use the link.`; $('ufo-note').hidden = false; $('ufo-saved').hidden = false;
  let can = false; try { can = !!navigator.canShare && navigator.canShare({ files: [file] }); } catch { }
  $('ufo-share').hidden = !can; $('ufo-share').onclick = () => navigator.share({ files: [file] }).catch(() => { });
  a.click();
}

boot().catch(e => { $('ufo-player').hidden = true; $('ufo-static').hidden = false; $('ufo-fail').textContent = 'This browser could not run the reader this file carries (' + (e && e.message || e) + '). The text below is the whole document.'; $('ufo-fail').hidden = false; });
