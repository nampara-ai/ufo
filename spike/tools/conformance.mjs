// Runs the kernel's line breaking and bidirectional ordering against the Unicode 16.0 conformance
// files. They are not kept in the repository: put LineBreakTest.txt (from ucd/auxiliary/),
// BidiCharacterTest.txt and BidiTest.txt in ucd/ here, with EastAsianWidth.txt for gen_linebreak.mjs.
// They are at https://www.unicode.org/Public/16.0.0/ucd/ and, the same files, in
// https://github.com/unicode-org/unicodetools under unicodetools/data/ucd/16.0.0/.
// Build first: cd ../kernel && cargo build --release --target wasm32-unknown-unknown --features conformance --target-dir ../tools/target
import fs from 'fs';
const here = new URL('.', import.meta.url);
const wasm = fs.readFileSync(new URL('target/wasm32-unknown-unknown/release/ufo_spike_kernel.wasm', here));
const ex = (await WebAssembly.instantiate(wasm, { 'ufo:host/1': { host_measure: () => 0, host_time: () => 0, host_random() { } } })).instance.exports;
const mem = () => new Uint8Array(ex.memory.buffer);
const call = (f, bytes) => { const p = ex.alloc(bytes.length); mem().set(bytes, p); const o = f(p, bytes.length); return mem().slice(o, o + ex.out_len()); };
{
  let pass = 0, total = 0; const fails = [];
  for (const line of fs.readFileSync(new URL('ucd/LineBreakTest.txt', here), 'utf8').split('\n')) {
    const t = line.split('#')[0].trim(); if (!t) continue; total++;
    const parts = t.split(/\s+/), cps = [], want = [];
    for (const x of parts) if (x === '×') want.push(0); else if (x === '÷') want.push(1); else cps.push(parseInt(x, 16));
    // the kernel says 2 where a break is mandatory; the file does not distinguish
    const got = [...call(ex.uax14, new TextEncoder().encode(String.fromCodePoint(...cps)))].map(b => b ? 1 : 0);
    if (got.length === want.length && got.every((g, i) => g === want[i])) pass++; else if (fails.length < 12) fails.push(line + '\n   got ' + got.join(''));
  }
  console.log(`LineBreakTest.txt: ${pass} of ${total} pass`); fails.forEach(f => console.log(f));
}
const { decode } = await import('../binding/binding.mjs');
{
  let pass = 0, total = 0; const fails = [];
  for (const line of fs.readFileSync(new URL('ucd/BidiCharacterTest.txt', here), 'utf8').split('\n')) {
    if (!line || line[0] === '#') continue; total++;
    const [cps, dir, base, levels, order] = line.split(';');
    const text = new TextEncoder().encode(String.fromCodePoint(...cps.split(' ').map(x => parseInt(x, 16))));
    const got = decode(call(ex.uax9, Uint8Array.from([+dir, ...text])));
    const mine = [got[0], got[1].map(l => l < 0 ? 'x' : l).join(' '), got[2].join(' ')].join(';');
    if (mine === [base, levels, order].join(';')) pass++; else if (fails.length < 12) fails.push(line + '\n   got ' + mine);
  }
  console.log(`BidiCharacterTest.txt: ${pass} of ${total} pass`); fails.forEach(f => console.log(f));
}
{
  // BidiTest.txt gives classes, not characters: one character of each class stands for it
  const rep = { L: 0x61, R: 0x5D0, AL: 0x627, EN: 0x31, ES: 0x2B, ET: 0x24, AN: 0x661, CS: 0x2C, NSM: 0x300, BN: 0xAD, B: 0x2029, S: 0x9, WS: 0x20, ON: 0x21,
    LRE: 0x202A, LRO: 0x202D, RLE: 0x202B, RLO: 0x202E, PDF: 0x202C, LRI: 0x2066, RLI: 0x2067, FSI: 0x2068, PDI: 0x2069 };
  let pass = 0, total = 0, levels = '', order = ''; const fails = [];
  for (const line of fs.readFileSync(new URL('ucd/BidiTest.txt', here), 'utf8').split('\n')) {
    if (line.startsWith('@Levels:')) levels = line.slice(8).trim(); else if (line.startsWith('@Reorder:')) order = line.slice(9).trim();
    if (!line || line[0] === '#' || line[0] === '@') continue;
    const [classes, bits] = line.split(';'); const text = new TextEncoder().encode(String.fromCodePoint(...classes.trim().split(' ').map(c => rep[c])));
    for (const [bit, dir] of [[1, 2], [2, 0], [4, 1]]) if (+bits & bit) {
      total++; const got = decode(call(ex.uax9, Uint8Array.from([dir, ...text])));
      if (got[1].map(l => l < 0 ? 'x' : l).join(' ') === levels && got[2].join(' ') === order) pass++; else if (fails.length < 12) fails.push(line + ' dir ' + dir + ' want ' + levels + ' / ' + order + '\n   got ' + JSON.stringify(got));
    }
  }
  console.log(`BidiTest.txt: ${pass} of ${total} pass`); fails.forEach(f => console.log(f));
}
