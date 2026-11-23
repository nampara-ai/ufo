// The web binding of the UFO player (SPEC-PLAYER 9.1): all the script this file ships.
// It knows encoded values, the kernel's entry points, the display-list items it can draw and the roles a group of them
// may carry, raw input, how to measure and inflate, a text-entry widget, and how to hand a file to the person.
// What is shown, and what any of it means, is the kernel's business and is not known here.
// How the page looks is its style sheet's alone. This script changes attributes and text, and writes one thing of the look:
// where each node of the drawing lies, as the four properties left, top, width and height of its element (TRAVEL 13.2, E23).
const $ = s => document.querySelector(s), U8 = Uint8Array, enc = new TextEncoder(), dec = new TextDecoder();

// ---- encoded values (SPEC 1.2), as much as a binding needs ----
function decode(b) {
  let p = 0;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const val = () => {
    const h = b[p++], major = h >> 5, ai = h & 31;
    let n = ai;
    if (major === 7) {
      if (ai < 23) return ai === 22 ? null : ai === 21;
      p += 1 << (ai - 24);
      if (ai > 25) return ai === 26 ? dv.getFloat32(p - 4) : dv.getFloat64(p - 8);
      const x = dv.getUint16(p - 2), e = (x >> 10) & 31, m = x & 1023;
      return (x & 0x8000 ? -1 : 1) * (e ? (1024 + m) * 2 ** (e - 25) : m * 2 ** -24);
    }
    if (ai === 24) n = b[p++];
    else if (ai === 25) { n = dv.getUint16(p); p += 2; }
    else if (ai === 26) { n = dv.getUint32(p); p += 4; }
    else if (ai === 27) { n = Number(dv.getBigUint64(p)); p += 8; }
    if (major === 0) return n;
    if (major === 1) return -1 - n;
    if (major === 2) return b.subarray(p, p += n);
    if (major === 3) return dec.decode(b.subarray(p, p += n));
    if (major === 4) return Array.from({ length: n }, val);
    if (major === 6) return { tag: n, v: val() };
    const m = {};
    while (n--) { const k = val(); m[k] = val(); }
    return m;
  };
  return val();
}
function half(v) {   // the 16 bits of a float that fits in them, or null
  const f = new DataView(new ArrayBuffer(4));
  f.setFloat32(0, v);
  const u = f.getUint32(0), s = (u >>> 16) & 0x8000, e = ((u >>> 23) & 255) - 127, m = u & 0x7fffff;
  if (v === 0) return s;
  if (e >= -14 && e <= 15 && !(m & 0x1fff)) return s | ((e + 15) << 10) | (m >>> 13);
  const sh = -1 - e, full = 0x800000 | m;
  return e >= -24 && e < -14 && !(full & ((1 << sh) - 1)) ? s | (full >>> sh) : null;
}
function encode(v) {
  const out = [], f = new DataView(new ArrayBuffer(8));
  const head = (m, n) => {
    const w = n < 24 ? 0 : n < 256 ? 1 : n < 65536 ? 2 : 4;
    out.push(m << 5 | (w ? 23 + (w === 4 ? 3 : w) : n));
    for (let i = w; i--;) out.push((n >>> (8 * i)) & 255);
  };
  const put = v => {
    if (v === null || v === undefined) out.push(0xf6);
    else if (v === true || v === false) out.push(0xf4 + v);
    else if (Number.isInteger(v) && Math.abs(v) < 2 ** 32) v >= 0 ? head(0, v) : head(1, -1 - v);
    else if (typeof v === 'number') {   // a float, in the shortest width that keeps it
      const h = Math.fround(v) === v ? half(v) : null;
      if (h !== null) out.push(0xf9, h >> 8, h & 255);
      else if (Math.fround(v) === v) { f.setFloat32(0, v); out.push(0xfa, ...new U8(f.buffer, 0, 4)); }
      else { f.setFloat64(0, v); out.push(0xfb, ...new U8(f.buffer)); }
    } else if (typeof v === 'string') { const s = enc.encode(v); head(3, s.length); for (const x of s) out.push(x); }
    else if (Array.isArray(v)) { head(4, v.length); v.forEach(put); }
    else if (v instanceof U8) { head(2, v.length); for (const x of v) out.push(x); }
    else {   // a map: keys in the order of their encodings, shorter first
      const ks = Object.keys(v).map(k => [enc.encode(k), k]);
      ks.sort(([a], [b]) => a.length - b.length || cmp(a, b));
      head(5, ks.length);
      for (const [, k] of ks) { put(k); put(v[k]); }
    }
  };
  put(v);
  return U8.from(out);
}
const cmp = (a, b) => { const i = a.findIndex((x, i) => x !== b[i]); return i < 0 ? 0 : a[i] - b[i]; };

// ---- the drawing contract (SPEC-PLAYER 9.2) on a 2D canvas: push, pop, text and path ----
const css = c => `rgba(${c.slice(0, 3).map(x => Math.round(x * 255))},${c[3]})`;
const family = f => /^[a-z-]+$/.test(f) ? f : JSON.stringify(f);
const fontOf = it => `${it.slant ? 'italic ' : ''}${it.weight} ${it.size}px ${it.font.map(family).join(',')}`;
const SEG = { M: 'moveTo', L: 'lineTo', Q: 'quadraticCurveTo', C: 'bezierCurveTo', Z: 'closePath' };
function draw(g, list) {
  for (const [kind, it] of list) {
    if (kind === 'push') {
      g.save();
      if (it.m) g.transform(...it.m);
      if (it.clip) { g.beginPath(); g.rect(...it.clip); g.clip(); }
      if (it.alpha !== undefined) g.globalAlpha *= it.alpha;
    } else if (kind === 'pop') g.restore();
    else if (kind === 'text') {
      g.font = fontOf(it); g.fillStyle = css(it.color); g.textBaseline = 'alphabetic';
      g.fillText(it.s, it.x, it.y);
    } else if (kind === 'path') {
      g.beginPath();
      for (const [s, ...xy] of it.d) g[SEG[s]](...xy);
      if (it.fill) { g.fillStyle = css(it.fill); g.fill(it.rule || 'nonzero'); }
      if (it.stroke) {
        g.strokeStyle = css(it.stroke); g.lineWidth = it.width ?? 1; g.lineJoin = it.join || 'miter';
        g.lineCap = it.cap || 'butt'; g.miterLimit = 4;
        g.stroke();
      }
    }   // items of the other kinds are skipped
  }
}

// ---- the same list for whoever does not see it (9.2: `role`, `label`, `level`): its nodes, as elements ----
// A `push` that carries a role opens a node, and a later group of the same `id` goes on with it. The text of a node is that
// of the text items in it, each with what it says comes `then`. Elements are kept from one drawing to the next and only
// what differs is touched, so that what has the focus keeps it and a place in the reading is not lost. Each element is put
// exactly over what is drawn for its node: the `box` its group carries (of a node drawn in several pieces, the first), so that
// what lies under a finger or a pointer is the node drawn there. `k` is how many CSS pixels of the page one unit of the list is.
const EL = { heading: 'h1', paragraph: 'p', quote: 'blockquote', code: 'pre', button: 'div button', item: 'div listitem', link: 'a link',
  input: 'div textbox' };
const attr = (el, name, v) => v === undefined ? el.removeAttribute(name) : el.getAttribute(name) !== String(v) && el.setAttribute(name, v);
function element(it) {   // the element of a role; a role with none of its own is handed on as it is named
  const [tag, role] = (EL[it.role] || 'div ' + it.role).split(' ');
  const el = document.createElement(it.role === 'heading' ? 'h' + Math.min(it.level || 1, 6) : tag);
  attr(el, 'role', role);
  return el;
}
function nodes(root, list, k) {
  const open = [root], pushed = [], seen = new Map(), at = [[1, 1, 0, 0]], kept = root.kept || seen;
  root.next = root.firstChild; root.box = [0, 0];
  for (const [kind, it] of list) {
    const p = open[open.length - 1], m = at[at.length - 1], t = it?.m;
    if (kind === 'push') {
      at.push(t ? [m[0] * t[0], m[1] * t[3], m[0] * t[4] + m[2], m[1] * t[5] + m[3]] : m);
      let el = null;
      if (it.role) {
        const is = it.role + (it.level || '');
        el = seen.get(it.id) || kept.get(it.id);
        if (el?.is !== is) Object.assign(el = element(it), { is, node: it.id });
        if (!seen.has(it.id)) {   // met for the first time in this list: put where the list has it, if it is not there
          seen.set(it.id, el);
          const from = el.parentNode;   // taken from where it was: whatever was to come next there is what came after it
          if (from?.next === el) from.next = el.nextSibling;
          if (from !== p || p.next !== el.nextSibling) p.insertBefore(el, p.next);
          el.next = el.firstChild; el.xy = null;
          const b = el.box = it.box || [p.box[0], p.box[1], 0, 0];
          el.style.left = (b[0] - p.box[0]) * k + 'px'; el.style.top = (b[1] - p.box[1]) * k + 'px';
          el.style.width = b[2] * k + 'px'; el.style.height = b[3] * k + 'px';
        }
        attr(el, 'aria-label', it.label); attr(el, 'lang', it.lang);
        attr(el, 'aria-pressed', it.pressed); attr(el, 'aria-current', it.current);
        // what can be pressed can be reached by the keyboard; a button that cannot be is passed over and says so
        const dead = !it.press && it.role === 'button';
        attr(el, 'tabindex', it.press ? 0 : dead ? -1 : undefined); attr(el, 'aria-disabled', dead || undefined);
        open.push(el);
      }
      pushed.push(el);
    } else if (kind === 'pop') {
      at.pop();
      if (pushed.pop()) open.pop();
    } else if (kind === 'text') {
      const s = it.s + (it.then || ''), old = p.next;
      const xy = [m[0] * (it.x + it.adv / 2) + m[2], m[1] * (it.y - it.size / 3) + m[3]];
      for (const el of open) el.xy ||= xy;   // a point on the node, and on each node it lies in that has none yet: where a press on it is
      if (old?.nodeType === 3) { if (old.data !== s) old.data = s; p.next = old.nextSibling; } else p.insertBefore(new Text(s), old);
    }
  }
  for (const el of [root, ...seen.values()]) while (el.next) { const gone = el.next; el.next = gone.nextSibling; gone.remove(); }
  root.kept = seen;
}

// ---- what the host supplies (SPEC-PLAYER 9.3): text measure, inflate, time, random bytes ----
const ruler = document.createElement('canvas').getContext('2d');
function measure({ piece, at }) {   // the advance of a piece up to each offset, its ascent and descent
  ruler.direction = piece.dir; ruler.font = fontOf(piece);
  const cps = [...piece.s], m = ruler.measureText(piece.s);
  const adv = at.map(o => ruler.measureText(cps.slice(0, o).join('')).width);
  return { adv, asc: m.fontBoundingBoxAscent, desc: m.fontBoundingBoxDescent };
}
const inflate = async b => new U8(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
let ex;
const mem = () => new U8(ex.memory.buffer);
const give = b => { const p = ex.alloc(b.length); mem().set(b, p); return p; };
const got = p => decode(mem().slice(p, p + ex.out_len()));
const call = (f, v) => { const q = encode(v); return ex[f](give(q), q.length); };
const imports = {
  host_measure(req, n, out, cap) {
    const r = encode(measure(decode(mem().slice(req, req + n))));
    if (r.length > cap) return 0;
    mem().set(r, out);
    return r.length;
  },
  host_time: () => Date.now(),
  host_random(out, n) { crypto.getRandomValues(mem().subarray(out, out + n)); },
};

// ---- effects: what the kernel asks of the host after each input event ----
const player = $('#ufo-player'), sheets = [...player.querySelectorAll('canvas')], entry = $('#ufo-entry'), area = $('#ufo-entry textarea');
let shown = [], mounted = 0, width = 0, back = null, held = '', sel = null, comp = null;
const DO = {
  draw({ on, list, w, h }) {   // a display list, on one of the page's canvases, w by h CSS pixels at the device's own density
    const c = sheets[on], r = globalThis.devicePixelRatio || 1, g = c.getContext('2d');
    c.width = Math.ceil(w * r); c.height = Math.ceil(h * r); c.w = w;   // how large it is on the page follows from these, by the style sheet
    g.setTransform(r, 0, 0, r, 0, 0);
    draw(g, shown[on] = list);
    nodes(c.previousElementSibling, list, c.clientWidth / w);
  },
  edit(e) {   // the text capability's edit: mount the text-entry widget with a text, or take it away
    entry.hidden = !e;
    if (!e) return back?.isConnected && back.focus();   // the focus goes back to where it was
    mounted = e.id; back = document.activeElement;
    area.rows = Math.min(12, Math.ceil(e.at[3] / e.size / 1.4) + 1);
    area.value = e.s; held = area.value; sel = comp = null;
    if (held !== e.s) send({ edit: mounted, s: held });   // the widget holds line ends its own way: say what it holds
    area.focus();
  },
  show({ on, at }) {   // bring a rectangle of a canvas into view, below whatever is held at the top
    const c = sheets[on], k = c.clientWidth / c.w, top = c.getBoundingClientRect().top + at[1] * k, low = top + at[3] * k;
    const head = on ? $('#ufo-top').getBoundingClientRect().bottom + 8 : 0, foot = innerHeight - 8;
    if (top < head || low > foot) scrollBy(0, top < head || low - top > foot - head ? top - head : low - foot);
  },
  deliver({ name, bytes }) {   // a file for the person: offered as a download, as bytes of no declared kind, which nothing will try to show
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' })); a.download = name;
    a.click();
  },
};
// One raw input event to the kernel; then whatever it asks for, done blindly. One at a time: an event that comes while
// that is being done (an engine reports a focus lost while the nodes are being put in their places) waits its turn
// (vectors/quirks 06).
const waiting = []; let busy = false;
function send(event) {
  waiting.push(event); if (busy) return; busy = true;
  try { while (waiting.length) for (const [kind, v] of got(call('input', waiting.shift())) || []) DO[kind]?.(v); } finally { busy = false; }
}
// ---- raw input: presses, the keyboard's focus, what is done in the text-entry widget, the size of the view ----
// A press of a pointer is the pointer going down and coming up in one place, and then the click that ends it. Where it was is
// what the pointer said: the point it came up at, on the drawing it went down on. Of the click only that it came is used: where a
// touch falls on nothing that can be pressed, the click may be given to a neighbour that can, at a point on that neighbour
// (vectors/quirks 05). Such a click given to something outside the drawing is not that thing's: it goes no further.
// A click that no pointer came before names a node and no point (one made for the person by other software): a press on that node.
let down = null, up = null;
const where = el => sheets.findIndex(c => c.parentNode.contains(el));
addEventListener('pointerdown', e => { down = e.isPrimary ? e : null; }, true);
addEventListener('pointercancel', () => { down = null; }, true);
addEventListener('pointerup', e => {
  const on = down ? where(down.target) : -1, c = sheets[on], r = c?.getBoundingClientRect();
  const near = down && Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) < 12;
  up = near ? { on, t: performance.now(), at: c && [e.clientX - r.left, e.clientY - r.top].map(v => v * c.w / r.width) } : null;
  down = null;
}, true);
addEventListener('click', e => {
  const u = up, on = where(e.target);
  up = null;
  if (!u || performance.now() - u.t > 700) return on >= 0 && e.target.xy && send({ press: e.target.xy, on });
  if (u.on < 0) return;
  if (on !== u.on) { e.stopPropagation(); e.preventDefault(); }
  send({ press: u.at, on: u.on });
}, true);
sheets.forEach((c, on) => {
  const root = c.previousElementSibling, press = el => el?.xy && send({ press: el.xy, on });
  root.addEventListener('keydown', e => {   // Enter or Space on what has the focus is a press on it: no element here makes a press of its own
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); press(e.target); }
  });
  root.addEventListener('focusin', e => send({ focus: e.target.node, on }));
  root.addEventListener('focusout', e => e.relatedTarget?.node || send({ focus: null, on }));
});
// Each change in the widget is reported with where it was, in scalar values of the text as it was held: from where the caret
// was before (or where an input method began) to where the selection ends after. Where that does not account for the change,
// or nothing said where the caret was, the whole text is reported and no position.
const count = s => [...s].length;
area.addEventListener('beforeinput', () => { sel = area.selectionStart; });
area.addEventListener('compositionstart', () => { comp = area.selectionStart; });
area.addEventListener('compositionend', () => setTimeout(() => { comp = null; }));
area.addEventListener('input', () => {
  const was = held, now = area.value, to = area.selectionStart, end = area.selectionEnd, at = Math.min(sel ?? to, comp ?? to, to);
  const ins = now.slice(at, end), del = was.length - now.length + ins.length;
  const found = del >= 0 && was.slice(0, at) === now.slice(0, at) && was.slice(at + del) === now.slice(end);
  held = now; sel = null;
  send(found ? { edit: mounted, at: count(was.slice(0, at)), del: count(was.slice(at, at + del)), ins } : { edit: mounted, s: now });
});
area.addEventListener('keydown', e => e.key === 'Escape' && send({ edit: mounted, end: false }));
$('#ufo-entry button').onclick = () => send({ edit: mounted, end: true, s: area.value });
$('#ufo-entry button + button').onclick = () => send({ edit: mounted, end: false });
const view = () => { if (ex && player.clientWidth !== width) send({ view: [width = player.clientWidth, innerHeight] }); };
addEventListener('resize', view);

// ---- start: every part this file carries, as the text of its element; the kernel out of them; then the kernel has it ----
async function boot() {
  const parts = { title: document.title };
  for (const e of document.querySelectorAll('style,script')) {
    const name = e.type.split('x-ufo-')[1] || e.localName;
    parts[name] = e.textContent;
    for (const d in e.dataset) parts[name + '-' + d] = e.dataset[d];
  }
  const wasm = await inflate(U8.from(atob(parts.kernel), c => c.charCodeAt(0)));
  const sum = globalThis.crypto?.subtle && new U8(await crypto.subtle.digest('SHA-256', wasm));
  if (sum && Array.from(sum, x => x.toString(16).padStart(2, '0')).join('') !== parts['kernel-hash']) throw 0;
  ex = (await WebAssembly.instantiate(wasm, { 'ufo:host/1': imports })).instance.exports;
  if (!call('start', { parts, name: decodeURIComponent(location.pathname.split('/').pop()) })) throw 0;
  for (let i = 0; i < ex.pending(); i++) {   // records the kernel needs inflated before it can go on
    const o = await inflate(got(ex.pending_get(i)).bytes).catch(() => null);
    if (o) ex.pending_put(i, give(o), o.length);
  }
  if (!ex.ready()) throw 0;
  // What else of the kernel this file carries, for this kernel: each piece, read and checked by the kernel, is put beside it
  // with what the kernel itself offers as its imports. One that is not there, or will not stand, is left out; the kernel is
  // told which it has, and answers for the rest in its own words.
  let have = 0; const mine = parts['kernel-hash'];
  for (let i = 0, c; (c = got(call('component', { i, kernel: mine }))); i++) {
    const at = call('component_bytes', { i, kernel: mine }), piece = mem().slice(at, at + ex.out_len());
    if (piece.length && await WebAssembly.instantiate(piece, { 'ufo:base': ex }).then(() => 1, () => 0)) have |= c.bit;
  }
  ex.components(have);
  player.hidden = false; $('#ufo-static').hidden = true;
  view();
  globalThis.ufo = { drawn: () => shown, project: q => got(call('project', q)), raw: f => got(ex[f]()) };   // for looking only: none changes anything
}
boot().catch(() => { player.hidden = true; $('#ufo-static').hidden = false; $('#ufo-fail').hidden = false; });
