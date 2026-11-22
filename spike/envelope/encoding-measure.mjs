// Measures the ways of carrying bytes in a script data block that ENCODING.md compares. Run: node spike/envelope/encoding-measure.mjs
import fs from 'fs'; import zlib from 'zlib'; import crypto from 'crypto'; import { fileURLToPath } from 'url'; import * as dense from './dense.mjs';
const here = p => fileURLToPath(new URL(p, import.meta.url));
const kernel = zlib.deflateRawSync(fs.readFileSync(here('../out/kernel.opt.wasm')), { level: 9 }), pack = fs.readFileSync(here('../../vectors/compose.ufx')), tools = fs.readFileSync(here('../../vectors/tools.ufx'));
// the one-byte characters a script data block may hold with no parse error and no loss: U+0020..U+007E, TAB, LF, FF, without "<"
const A97 = [...Array(95).keys()].map(i => String.fromCharCode(32 + i)).filter(c => c !== '<').concat(['\t', '\n', '\f']);
const A91 = A97.filter(c => !'\t\n\f\'"\\'.includes(c)), A85 = A91.slice(0, 85);
if (A91.length !== 91 || A97.length !== 97) throw Error('alphabets');
const ways = {
  'base64 (6 bits a byte)': b => Buffer.from(b).toString('base64'),
  'base 85, 4 bytes in 5 characters': b => { let s = ''; for (let i = 0; i < b.length; i += 4) { let v = 0; for (let j = 0; j < 4; j++) v = v * 256 + (b[i + j] || 0); let g = ''; for (let j = 0; j < 5; j++) { g = A85[v % 85] + g; v = Math.floor(v / 85); } s += g; } return s; },
  'basE91 (13 or 14 bits in 2 characters)': b => { let s = '', acc = 0, n = 0; for (const x of b) { acc |= x << n; n += 8; if (n > 13) { let v = acc & 8191; if (v > 88) { acc >>= 13; n -= 13; } else { v = acc & 16383; acc >>= 14; n -= 14; } s += A91[v % 91] + A91[Math.floor(v / 91)]; } } if (n) { s += A91[acc % 91]; if (n > 7 || acc > 90) s += A91[Math.floor(acc / 91)]; } return s; },
  'base 97, 14 bytes in 17 characters': b => { let s = ''; for (let i = 0; i < b.length; i += 14) { let v = 0n; for (let j = 0; j < 14; j++) v = v * 256n + BigInt(b[i + j] || 0); let g = ''; for (let j = 0; j < 17; j++) { g = A97[Number(v % 97n)] + g; v /= 97n; } s += g; } return s; },
  'dense.mjs: 27 bits in 4 bytes, one- and two-byte characters': b => dense.en(b),
};
// self-check of the dense coding
for (let n = 0; n < 300; n++) { const b = crypto.randomBytes(n); if (Buffer.compare(Buffer.from(dense.de(dense.en(b))), b)) throw Error('dense does not round-trip at ' + n); }
for (const b of [kernel, pack, tools, Buffer.alloc(1000), Buffer.alloc(1000, 255), Buffer.from([1, 0, 0]), Buffer.from([0, 1])]) { const t = dense.en(b); if (Buffer.compare(Buffer.from(dense.de(t)), b)) throw Error('dense does not round-trip'); if (/[<\0\r\n\f]|[\x7f-\x9f]/.test(t) || Buffer.byteLength(t) % 4) throw Error('dense text holds a character it may not'); }
const n = s => Buffer.byteLength(s), gz = s => zlib.gzipSync(s, { level: 9 }).length, br = s => zlib.brotliCompressSync(Buffer.from(s)).length;
const all = Buffer.concat([kernel, pack, tools]);
console.log('carried:', all.length, 'bytes (kernel, deflated,', kernel.length + '; pack', pack.length + '; tools', tools.length + ')\n');
console.log('| Way | Kernel | Pack | Tools | All three | Over the bytes | Bits a byte | gzip -9 of the text | brotli of the text |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
for (const [name, f] of Object.entries(ways)) { const t = [kernel, pack, tools].map(f), sum = t.reduce((a, s) => a + n(s), 0), joined = t.join('\n');
  console.log(`| ${name} | ${t.map(s => n(s)).join(' | ')} | ${sum} | +${(100 * (sum / all.length - 1)).toFixed(1)}% | ${(8 * all.length / sum).toFixed(2)} | ${gz(joined)} | ${br(joined)} |`); }
console.log(`| (the bytes themselves) | ${kernel.length} | ${pack.length} | ${tools.length} | ${all.length} | 0 | 8.00 | ${gz(all)} | ${br(all)} |`);
// capacities: the growth rate of the number of valid texts of n bytes
const cap = (a, ...more) => { let lo = 1, hi = 256; for (let i = 0; i < 80; i++) { const x = (lo + hi) / 2; (a / x + more.reduce((s, m, j) => s + m / x ** (j + 2), 0) > 1 ? (lo = x) : (hi = x)); } return Math.log2(lo); };
console.log('\nlimits, bits a byte: one-byte characters only (97):', Math.log2(97).toFixed(3), '; with two-byte characters U+00A0..U+07FF (1888):', cap(97, 1888).toFixed(3), '; with three- and four-byte characters too:', cap(97, 1888, 61406, 1048544).toFixed(3));
const src = fs.readFileSync(here('dense.mjs'), 'utf8').replace(/^export /gm, ''), code = src.replace(/^\/\/.*\n/gm, ''), deOnly = code.slice(0, code.indexOf('function en(')) + code.slice(code.indexOf('function de('));
console.log('dense.mjs as it goes into the page:', n(src), 'bytes with its comment,', n(code), 'without (gzip', gz(code) + '); the decoder alone', n(deOnly));
