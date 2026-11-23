// The web binding of the UFO player (SPEC-PLAYER 9.1): all the script this file ships.
// It knows encoded values, the kernel's entry points, the display-list items it can draw, raw input,
// how to measure and inflate, a text-entry widget, and how to hand a file to the person.
// What is shown, and what any of it means, is the kernel's business and is not known here.
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
const player = $('#ufo-player'), canvas = $('#ufo-player canvas'), entry = $('#ufo-entry'), area = $('#ufo-entry textarea');
let shown = [], mounted = 0, width = 0;
const DO = {
  draw({ list, w, h }) {   // a display list, on a canvas of w by h CSS pixels at the device's own density
    const r = globalThis.devicePixelRatio || 1, g = canvas.getContext('2d');
    canvas.width = Math.ceil(w * r); canvas.height = Math.ceil(h * r);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    g.setTransform(r, 0, 0, r, 0, 0);
    draw(g, shown = list);
  },
  edit(e) {   // the text capability's edit: mount the text-entry widget on a rectangle, or take it away
    entry.hidden = !e;
    if (!e) return;
    mounted = e.id;
    Object.assign(entry.style, { left: e.at[0] + 'px', top: e.at[1] + 'px', width: e.at[2] + 'px' });
    area.style.font = fontOf(e); area.style.height = e.at[3] + 24 + 'px';
    area.value = e.s;
    area.focus();
  },
  deliver({ name, type, bytes }) {   // a file for the person: offered as a download
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new File([bytes], name, { type })); a.download = name;
    a.click();
  },
  ask({ label }) { send({ answer: prompt(label) }); },   // something only the person can supply
};
function send(event) {   // one raw input event to the kernel; then whatever it asks for, done blindly
  for (const [kind, v] of got(call('input', event)) || []) DO[kind]?.(v);
}
canvas.onclick = e => send({ press: [e.offsetX, e.offsetY] });
$('#ufo-entry button').onclick = () => send({ edit: mounted, s: area.value });
$('#ufo-entry button + button').onclick = () => send({ edit: mounted });
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
  player.hidden = false; $('#ufo-static').hidden = true;
  view();
  globalThis.ufo = { drawn: () => shown, query: q => got(call('query', q)) };   // for looking only: neither changes anything
}
boot().catch(() => { player.hidden = true; $('#ufo-static').hidden = false; $('#ufo-fail').hidden = false; });
