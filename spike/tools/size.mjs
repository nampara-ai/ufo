// Measures the spike kernel: after cargo, after wasm-opt -Oz, and that after raw DEFLATE at level 9.
// Then cuts the parts away one after another (the `cut-` features of the kernel) and gives what each
// step took off, and what cutting each part alone takes off. See ../SIZE-NOTES.md.
// The kernel no longer inflates (the host does, through `pending`), so there is no inflate row.
// Run from anywhere: node spike/tools/size.mjs [--quick]
import fs from 'fs'; import zlib from 'zlib'; import { execFileSync } from 'child_process'; import { fileURLToPath } from 'url';
const here = fileURLToPath(new URL('.', import.meta.url)), kernel = here + '../kernel', home = process.env.HOME;
const env = { ...process.env, PATH: home + '/.cargo/bin:' + process.env.PATH };
const OPT = ['-Oz', '--enable-bulk-memory', '--enable-sign-ext', '--enable-nontrapping-float-to-int', '--enable-mutable-globals'];
export function measure(file, extra = []) {
  const out = file.replace(/\.wasm$/, '.opt.wasm');
  execFileSync(here + 'node_modules/.bin/wasm-opt', [...OPT, ...extra, file, '-o', out]);
  const raw = fs.readFileSync(file), opt = fs.readFileSync(out);
  return { cargo: raw.length, opt: opt.length, deflate: zlib.deflateRawSync(opt, { level: 9 }).length, out };
}
export function build(features, { nightly = false, std = false, names = false, small = false, dir = 'size' } = {}) {
  const f = [...features, ...(std ? ['std'] : [])];
  const args = [...(nightly ? ['+nightly'] : []), 'build', '--release', '--target', 'wasm32-unknown-unknown', '--target-dir', kernel + '/target/' + dir, ...(f.length ? ['--features', f.join(',')] : []),
    ...(nightly ? ['-Zbuild-std=core,alloc'] : []), ...(small ? ['-Zbuild-std-features=optimize_for_size'] : [])];
  const e = { ...env };
  if (nightly) e.RUSTFLAGS = '-Zunstable-options -Cpanic=immediate-abort';
  if (names) e.CARGO_PROFILE_RELEASE_STRIP = 'debuginfo';
  execFileSync('cargo', args, { cwd: kernel, env: e, stdio: ['ignore', 'ignore', 'pipe'] });
  return kernel + '/target/' + dir + '/wasm32-unknown-unknown/release/ufo_spike_kernel.wasm';
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const row = (name, m) => console.log(name.padEnd(58), String(m.cargo).padStart(8), String(m.opt).padStart(8), String(m.deflate).padStart(8));
  console.log(''.padEnd(58), '   cargo', ' wasm-opt', 'deflate');
  const full = measure(build([])); row('no standard library, dlmalloc', full);
  row('standard library (feature std)', measure(build([], { std: true, dir: 'size-std' })));
  try { row('nightly, panics compiled out (-Cpanic=immediate-abort)', measure(build([], { nightly: true, dir: 'size-nightly' })));
    row("the same, and the library's own small variants", measure(build([], { nightly: true, small: true, dir: 'size-nightly-small' }))); } catch (e) { console.log('nightly build failed:', String(e.stderr || e).split('\n').filter(l => /error/.test(l)).slice(0, 3).join(' | ')); }
  if (!process.argv.includes('--quick')) {
    const steps = [['cut-project', '(j) projections (project.rs, spell.rs)'], ['cut-query', '(i) queries (query.rs)'], ['cut-print', '(h) printer (print.rs)'],
      ['cut-lb-table', '(f) line breaking: table'], ['cut-lb', '(f) line breaking: code'], ['cut-bidi-table', '(g) bidi: tables'], ['cut-bidi', '(g) bidi: code'], ['cut-layout', '(e) composition (layout.rs)'],
      ['cut-pack', '(d) pack (pack.rs), less SHA-256 cut alone'], ['cut-values', '(c) values (value.rs), with SHA-256 cut alone'], ['cut-alloc', '(a) allocator (dlmalloc)']];
    // every build from here has the `keep` export, so that pack.rs stays whole until it is cut; what the export itself weighs is taken off the step that cuts it
    const kept = measure(build(['keep'])), glue = { cargo: kept.cargo - full.cargo, opt: kept.opt - full.opt, deflate: kept.deflate - full.deflate }; row('(the keep export itself)', glue);
    const sha = measure(build(['keep', 'cut-sha'])), dsha = { cargo: kept.cargo - sha.cargo, opt: kept.opt - sha.opt, deflate: kept.deflate - sha.deflate };
    console.log('\ncut one after another: what each step took off'); let prev = kept, sum = { cargo: 0, opt: 0, deflate: 0 }; const fs_ = ['keep'];
    for (const [f, name] of steps) { fs_.push(f); const m = measure(build(fs_)); const d = { cargo: prev.cargo - m.cargo, opt: prev.opt - m.opt, deflate: prev.deflate - m.deflate };
      for (const k in d) { if (f === 'cut-pack') d[k] -= glue[k] + dsha[k]; if (f === 'cut-values') d[k] += dsha[k]; }
      row(name, d); for (const k in sum) sum[k] += d[k]; prev = m; }
    row('(k) what is left: glue, exports, a stub allocator', prev); for (const k in sum) sum[k] += prev[k]; row('sum', sum);
    console.log('\ncut alone: what the whole loses');
    for (const [fl, name] of [[['cut-sha'], 'SHA-256'], [['cut-project'], 'projections'], [['cut-query'], 'queries and projections'], [['cut-print'], 'printer'], [['cut-lb-table'], 'line breaking table'], [['cut-lb-table', 'cut-lb'], 'line breaking, code and table'],
      [['cut-bidi-table'], 'bidi tables'], [['cut-bidi-table', 'cut-bidi'], 'bidi, code and tables'], [['cut-layout'], 'composition with both algorithms'], [['cut-alloc'], 'allocator (dlmalloc for one that never frees)']]) {
      const m = measure(build(['keep', ...fl])); row(name, { cargo: kept.cargo - m.cargo, opt: kept.opt - m.opt, deflate: kept.deflate - m.deflate }); }
  }
}
