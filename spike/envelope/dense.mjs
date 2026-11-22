// A denser carriage than base64 for bytes in an HTML script data block (ENCODING.md): 27 bits in every 4 bytes of UTF-8.
// The text uses 95 one-byte characters (U+0020 to U+007E without "<", and TAB) and the 1 888 two-byte characters
// U+00A0 to U+07FF. F[n] is the number of such texts that are exactly n bytes long; F[4] = 136 132 769 >= 2^27.
const F = [1, 95, 10913, 1216095, 136132769];
const sym = i => String.fromCharCode(i > 93 ? 9 : i + (i < 28 ? 32 : 33)), val = c => c === 9 ? 94 : c - (c < 60 ? 32 : 33);
export function en(b) {   // the bytes, then a byte 1, then zero bits to a whole group
  let s = '', acc = 0, bits = 0;
  const put = v => { for (let n = 4; n;) if (v < 95 * F[n - 1]) { s += sym(Math.floor(v / F[--n])); v %= F[n]; } else { v -= 95 * F[n - 1]; n -= 2; s += String.fromCharCode(160 + Math.floor(v / F[n])); v %= F[n]; } };
  for (let i = 0; i <= b.length; i++) { acc = acc * 256 + (i < b.length ? b[i] : 1); bits += 8; if (bits >= 27) { const sh = 2 ** (bits - 27), v = Math.floor(acc / sh); put(v); acc -= v * sh; bits -= 27; } }
  if (bits) put(acc * 2 ** (27 - bits));
  return s;
}
export function de(s) {
  const out = new Uint8Array(Math.ceil(s.length * 27 / 16) + 4); let o = 0, acc = 0, bits = 0, v = 0, n = 4;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i); if (c < 128) v += val(c) * F[--n]; else { v += 95 * F[n - 1]; n -= 2; v += (c - 160) * F[n]; }
    if (!n) { acc = acc * 2 ** 27 + v; bits += 27; v = 0; n = 4; while (bits >= 8) { const sh = 2 ** (bits - 8), x = Math.floor(acc / sh); out[o++] = x; acc -= x * sh; bits -= 8; } }
  }
  while (o && out[--o] !== 1);
  return out.subarray(0, o);
}
