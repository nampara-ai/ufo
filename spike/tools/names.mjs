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
// Names are in rustc's v0 mangling: a path is spelled as its segments, each with its length before it.
// A function is put with the first of these that its name mentions, so an instance of a library
// generic for one of the kernel's types goes to the library. Functions inlined into another are
// counted with it: this is good for the allocator, the inflater and what is left of formatting, not for the kernel's own parts.
const part = n => {
  if (/8dlmalloc|__rust_(alloc|dealloc|realloc)|__rdl_|__rg_/.test(n)) return 'dlmalloc';
  if (/11miniz_oxide|6adler2/.test(n)) return 'miniz_oxide';
  if (/4core3fmt|5alloc3fmt/.test(n)) return 'core::fmt';
  if (/4core9panicking|4core6option13(unwrap|expect)_failed|4core6result13unwrap_failed|4core5slice5index|4core3str16slice_error_fail|5alloc7raw_vec12handle_error|5alloc5alloc18handle_alloc_error|rust_begin_unwind|__rust_alloc_error_handler|capacity_overflow|8panicking/.test(n)) return 'panic paths';
  if (/5alloc11collections5btree/.test(n)) return 'alloc: BTreeMap, BTreeSet';
  if (/4core5slice4sort/.test(n)) return 'core: sorting';
  if (/17compiler_builtins|^mem(cpy|set|move|cmp)$/.test(n)) return 'compiler_builtins (memcpy and the like)';
  const own = /16ufo_spike_kernel\d+([a-z_]+?)(?=\d|[A-Z]|$)/.exec(n);
  if (/^_R[^C]*Cs\w+_(4core|5alloc)/.test(n) || /^_RI?NvM?s?\w*Nt\w*Cs\w+_(4core|5alloc)/.test(n)) return 'alloc/core, other generics';
  if (own) return own[1] + '.rs';
  if (/4core|5alloc/.test(n)) return 'alloc/core, other generics';
  return 'export: ' + n;
};
const by = {}, list = []; let code = 0;
bodies.forEach((n, i) => { const name = names.get(i + imports) || '(unnamed ' + i + ')'; const k = part(name); by[k] = (by[k] || 0) + n; code += n; list.push([n, k, name]); });
console.log('file', b.length, 'functions', bodies.length, 'code bodies', code, 'data', dataBytes, 'in', segs.length, 'segments');
console.log('sections', JSON.stringify(sections));
for (const [k, n] of Object.entries(by).sort((a, c) => c[1] - a[1])) console.log(String(n).padStart(8), k);
const g = process.argv.indexOf('--grep');
if (process.argv.includes('--list') || g > 0) for (const [n, k, name] of list.sort((a, c) => c[0] - a[0])) if (g < 0 || name.includes(process.argv[g + 1]) || k.includes(process.argv[g + 1])) console.log(String(n).padStart(7), k.padEnd(28), name.slice(0, 150));
