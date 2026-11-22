// Throwaway spike binding for the web. It knows encoded values, the kernel's four exports,
// one host function (text break) and the eight display-list items. It knows no medium.
// ---- encoded values (SPEC 1.2), as much as a binding needs ----
export function decode(b) {
  let p = 0; const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const val = () => {
    const h = b[p++], major = h >> 5, ai = h & 31; let n = ai;
    if (major === 7) {
      if (ai === 20 || ai === 21) return ai === 21; if (ai === 22) return null;
      if (ai === 25) { const x = dv.getUint16(p); p += 2; const e = (x >> 10) & 31, m = x & 1023; const v = e === 0 ? m * 2 ** -24 : (1024 + m) * 2 ** (e - 25); return x & 0x8000 ? -v : v; }
      if (ai === 26) { p += 4; return dv.getFloat32(p - 4); } p += 8; return dv.getFloat64(p - 8);
    }
    if (ai === 24) n = b[p++]; else if (ai === 25) { n = dv.getUint16(p); p += 2; } else if (ai === 26) { n = dv.getUint32(p); p += 4; } else if (ai === 27) { n = Number(dv.getBigUint64(p)); p += 8; }
    if (major === 0) return n; if (major === 1) return -1 - n;
    if (major === 2) { p += n; return b.subarray(p - n, p); }
    if (major === 3) { p += n; return new TextDecoder().decode(b.subarray(p - n, p)); }
    if (major === 4) return Array.from({ length: n }, val);
    if (major === 5) { const m = {}; for (let i = 0; i < n; i++) { const k = val(); m[k] = val(); } return m; }
    return { tag: n, v: val() };
  };
  return val();
}
export function encode(v) {
  const out = []; const head = (m, n) => { if (n < 24) out.push(m << 5 | n); else if (n < 256) out.push(m << 5 | 24, n); else if (n < 65536) out.push(m << 5 | 25, n >> 8, n & 255); else out.push(m << 5 | 26, n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255); };
  const put = v => {
    if (v === null) out.push(0xf6); else if (v === true || v === false) out.push(0xf4 + v);
    else if (Number.isInteger(v) && !Object.is(v, -0) && !put.float) v >= 0 ? head(0, v) : head(1, -1 - v);
    else if (typeof v === 'number') { const f = new DataView(new ArrayBuffer(8)); const h = half(v);   // the shortest width that keeps the value (1.2)
      if (h !== null) out.push(0xf9, h >> 8, h & 255); else if (Math.fround(v) === v) { f.setFloat32(0, v); out.push(0xfa, ...new Uint8Array(f.buffer, 0, 4)); } else { f.setFloat64(0, v); out.push(0xfb, ...new Uint8Array(f.buffer)); } }
    else if (typeof v === 'string') { const s = new TextEncoder().encode(v); head(3, s.length); out.push(...s); }
    else if (Array.isArray(v)) { head(4, v.length); v.forEach(put); }
    else { const ks = Object.keys(v).sort((a, b) => a.length - b.length || (a < b ? -1 : 1)); head(5, ks.length); for (const k of ks) { put(k); if (FLOATS.has(k)) { put.float = true; put(v[k]); put.float = false; } else put(v[k]); } }
  };
  put(v); return Uint8Array.from(out);
}
function half(v) {
  if (Math.fround(v) !== v) return null; const f = new DataView(new ArrayBuffer(4)); f.setFloat32(0, v); const u = f.getUint32(0), s = (u >>> 16) & 0x8000, e = ((u >>> 23) & 255) - 127, m = u & 0x7fffff;
  if (v === 0) return s; if (e >= -14 && e <= 15 && (m & 0x1fff) === 0) return s | ((e + 15) << 10) | (m >>> 13);
  if (e >= -24 && e < -14) { const sh = 13 + (-14 - e), full = 0x800000 | m; if ((full & ((1 << sh) - 1)) === 0) return s | (full >>> sh); }
  return null;
}
const FLOATS = new Set(['adv', 'asc', 'desc', 'width', 'w']);   // fields the contract types as float
// ---- the kernel ----
export async function start(wasmBytes, measure) {
  let ex; const mem = () => new Uint8Array(ex.memory.buffer);
  const give = bytes => { const p = ex.alloc(bytes.length); mem().set(bytes, p); return p; };
  const imports = { 'ufo:host/1': { host_break(req, n, out, cap) { const r = encode(breakLine(decode(mem().slice(req, req + n)), measure)); if (r.length > cap) return 0; mem().set(r, out); return r.length; } } };
  ex = (await WebAssembly.instantiate(wasmBytes, imports)).instance.exports;
  return {
    open: pack => ex.open(give(pack), pack.length) === 1,
    print: id => { const p = ex.print(give(id)); return mem().slice(p, p + ex.out_len()); },
    query: q => { const b = encode(q); const p = ex.query(give(b), b.length); return decode(mem().slice(p, p + ex.out_len())); },
    sample: params => { const q = encode(params); const p = ex.sample(give(q), q.length); return decode(mem().slice(p, p + ex.out_len())); },
  };
}
// ---- the text capability's `break`: how much of these runs fits in this width ----
// measure(run, text) -> { adv, asc, desc } comes from the host's own text facilities.
function breakLine(req, measure) {
  const { runs, from, width } = req; let [r, off] = from; const frags = []; let x = 0, asc = 0, desc = 0, any = false;
  while (r < runs.length) {
    const cps = [...runs[r].s]; let i = off, last = off, lastAdv = 0, fits = true;
    // break opportunities: after each run of spaces (the host's line-breaking rules would go here)
    while (i < cps.length) {
      let j = i; while (j < cps.length && cps[j] !== ' ') j++; while (j < cps.length && cps[j] === ' ') j++;
      const m = measure(runs[r], cps.slice(off, j).join('').replace(/ +$/, ''));
      if (x + m.adv > width && (any || last > off)) { fits = false; break; }
      const full = measure(runs[r], cps.slice(off, j).join(''));
      last = j; lastAdv = full.adv; asc = Math.max(asc, full.asc); desc = Math.max(desc, full.desc); i = j;
      if (x + m.adv > width) { fits = false; break; }   // a single word wider than the line: it goes alone
    }
    if (last > off) { frags.push({ run: r, from: off, to: last, adv: lastAdv }); x += lastAdv; any = true; }
    if (!fits) return { frags, asc, desc, to: last < cps.length ? [r, last] : [r + 1, 0] };
    r++; off = 0;
  }
  return { frags, asc, desc, to: [runs.length, 0] };
}
// ---- the drawing contract (SPEC 6.2) on a 2D canvas ----
const css = c => `rgba(${c.slice(0, 3).map(x => Math.round(x * 255))},${c[3]})`;
const fontOf = it => `${it.slant ? 'italic ' : ''}${it.weight} ${it.size}px ${it.font.map(f => /^[a-z-]+$/.test(f) ? f : JSON.stringify(f)).join(',')}`;
function trace(g, d) { g.beginPath(); for (const s of d) { if (s[0] === 'M') g.moveTo(s[1], s[2]); else if (s[0] === 'L') g.lineTo(s[1], s[2]); else if (s[0] === 'Q') g.quadraticCurveTo(s[1], s[2], s[3], s[4]); else if (s[0] === 'C') g.bezierCurveTo(s[1], s[2], s[3], s[4], s[5], s[6]); else g.closePath(); } }
export function draw(g, list) {
  for (const [kind, it] of list) {
    if (kind === 'push') { g.save(); if (it.m) g.transform(...it.m); if (it.clip) { g.beginPath(); g.rect(...it.clip); g.clip(); } if (it.alpha !== undefined) g.globalAlpha *= it.alpha; }
    else if (kind === 'pop') g.restore();
    else if (kind === 'text') { g.font = fontOf(it); g.fillStyle = css(it.color); g.textBaseline = 'alphabetic'; g.fillText(it.s, it.x, it.y); }
    else if (kind === 'path') { trace(g, it.d); if (it.fill) { g.fillStyle = css(it.fill); g.fill(it.rule || 'nonzero'); } if (it.stroke) { g.strokeStyle = css(it.stroke); g.lineWidth = it.width ?? 1; g.lineJoin = it.join || 'miter'; g.lineCap = it.cap || 'butt'; g.miterLimit = 4; g.stroke(); } }
    // raster, samples, surface and hit are not needed by the spike's universe and are not written
  }
}
export const canvasMeasure = g => (run, s) => { g.font = fontOf(run); const m = g.measureText(s); return { adv: m.width, asc: m.fontBoundingBoxAscent, desc: m.fontBoundingBoxDescent }; };
