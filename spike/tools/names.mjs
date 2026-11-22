// Symbol-level accounting of a wasm file that keeps its name section: bytes of each function's body,
// grouped by the part its name puts it in, and the sizes of the other sections. See ../SIZE-NOTES.md.
// node spike/tools/names.mjs file.wasm [--list] [--grep text]
import fs from 'fs';
const b = fs.readFileSync(process.argv[2]); let p = 8;
const leb = () => { let r = 0, s = 0, x; do { x = b[p++]; r += (x & 127) * 2 ** s; s += 7; } while (x & 128); return r; };
const str = () => { const n = leb(); const s = b.subarray(p, p + n).toString('utf8'); p += n; return s; };
const sections = {}, bodies = [], names = new Map(); let imports = 0, dataBytes = 0; const segs = [];
while (p < b.length) {
  const id = b[p++], n = leb(), end = p + n, start = p;
  if (id === 0) { const name = str(); sections['custom:' + name] = (sections['custom:' + name] || 0) + (end - start) + (p - start > 0 ? 0 : 0);
    if (name === 'name') while (p < end) { const sub = b[p++], sn = leb(), se = p + sn; if (sub === 1) { for (let c = leb(); c > 0; c--) { const i = leb(); names.set(i, str()); } } p = se; } }
  else { sections[id] = n + 1 + (start - (start - 1));
    if (id === 2) { for (let c = leb(); c > 0; c--) { str(); str(); const k = b[p++]; if (k === 0) { leb(); imports++; } else if (k === 1) { p++; const f = leb(); leb(); if (f & 1) leb(); } else if (k === 2) { const f = leb(); leb(); if (f & 1) leb(); } else if (k === 3) { p += 2; } } }
    if (id === 10) { for (let c = leb(); c > 0; c--) { const q = p, n2 = leb(); bodies.push(n2 + (p - q)); p += n2; } }
    if (id === 11) { for (let c = leb(); c > 0; c--) { const k = leb(); if (k === 0) { while (b[p++] !== 0x0b); } else if (k === 2) { leb(); while (b[p++] !== 0x0b); } const n2 = leb(); segs.push(n2); dataBytes += n2; p += n2; } } }
  p = end;
}
const part = n => {
  const own = /ufo_spike_kernel::(\w+)/.exec(n);
  if (/^(<?dlmalloc|.*dlmalloc::)/.test(n) || /__rust_(alloc|dealloc|realloc|alloc_zeroed)|__rdl_|__rg_/.test(n)) return 'dlmalloc';
  if (/miniz_oxide|adler/.test(n)) return 'miniz_oxide';
  if (/core::fmt|core..fmt|fmt::/.test(n)) return 'core::fmt';
  if (/panic|core::option::(unwrap|expect)_failed|core::result::unwrap_failed|slice_index|_fail\b|str::slice_error/.test(n)) return 'panic paths';
  if (own && !/^<?(alloc|core)::/.test(n)) return own[1] + '.rs';
  if (own) return 'alloc/core generics naming ' + own[1] + '.rs';
  if (/^<?(alloc|core)::|^<(alloc|core)|alloc::|core::/.test(n)) return 'alloc/core, other';
  if (/^(mem(cpy|set|move|cmp)|compiler_builtins|__\w+di\d|__mul|__udiv|__umod)/.test(n) || /compiler_builtins/.test(n)) return 'compiler_builtins (memcpy and the like)';
  return 'exports and other: ' + n;
};
const by = {}, list = []; let code = 0;
bodies.forEach((n, i) => { const name = names.get(i + imports) || '(unnamed ' + i + ')'; const k = part(name); by[k] = (by[k] || 0) + n; code += n; list.push([n, k, name]); });
console.log('file', b.length, 'functions', bodies.length, 'code bodies', code, 'data', dataBytes, 'in', segs.length, 'segments');
console.log('sections', JSON.stringify(sections));
for (const [k, n] of Object.entries(by).sort((a, c) => c[1] - a[1])) console.log(String(n).padStart(8), k);
const g = process.argv.indexOf('--grep');
if (process.argv.includes('--list') || g > 0) for (const [n, k, name] of list.sort((a, c) => c[0] - a[0])) if (g < 0 || name.includes(process.argv[g + 1]) || k.includes(process.argv[g + 1])) console.log(String(n).padStart(7), k.padEnd(28), name.slice(0, 150));
