// Measures the kernel as a base and components (spike/SPLIT.md). Each row is built from the one codebase,
// optimised and compressed as size.mjs does it.
//   whole           everything
//   without X       the whole built without X (a `cut-` feature): what X adds where it shares all it uses with the rest
//   X alone         a module holding X and everything X reaches, cut from the whole by wasm-metadce: X with its own
//                   copies of the shared code
// node spike/tools/split.mjs
import fs from 'fs'; import zlib from 'zlib'; import { execFileSync } from 'child_process'; import { fileURLToPath } from 'url'; import { build, measure } from './size.mjs';
const here = fileURLToPath(new URL('.', import.meta.url)), bin = here + 'node_modules/.bin/';
const row = (name, m) => { console.log(name.padEnd(52), String(m.opt).padStart(9), String(m.deflate).padStart(9), (m.deflate / 1024).toFixed(1).padStart(7)); return m; };
console.log(''.padEnd(52), ' wasm-opt', '  deflate', '    KiB');
const whole = row('whole', measure(build([], { dir: 'split-whole' })));
const noPrint = row('without the printer', measure(build(['cut-print'], { dir: 'split-noprint' })));
const noAgent = row('without the agent-facing projections', measure(build(['cut-agent'], { dir: 'split-noagent' })));
const base = row('base: without both', measure(build(['cut-print', 'cut-agent'], { dir: 'split-base' })));
// a module of one entry point and all it reaches
const OPEN = ['memory', 'alloc', 'open', 'pending', 'pending_get', 'pending_put', 'ready', 'out_len'];
function alone(name, exports) {
  const src = here + '../kernel/target/split-whole/wasm32-unknown-unknown/release/ufo_spike_kernel.wasm', out = src.replace(/\.wasm$/, `.${name}.wasm`), graph = out + '.json';
  fs.writeFileSync(graph, JSON.stringify([{ name: 'root', root: true, reaches: exports }, ...exports.map(e => ({ name: e, export: e }))]));
  execFileSync(bin + 'wasm-metadce', ['--enable-bulk-memory', '--enable-sign-ext', '--enable-nontrapping-float-to-int', '--enable-mutable-globals', src, '--graph-file', graph, '-o', out], { stdio: ['ignore', 'ignore', 'pipe'] });
  return measure(out);
}
const printer = row('the printer alone, with its own copies', alone('printer', [...OPEN, 'print']));
const agent = row('the agent-facing projections alone, with copies', alone('agent', [...OPEN, 'project']));
const opening = row('(opening a pack alone: what both of those hold)', alone('open', OPEN));
console.log('\nthe printer:            shares everything', whole.deflate - noPrint.deflate, '| carries copies', printer.deflate, '| the copies cost', printer.deflate - (whole.deflate - noPrint.deflate));
console.log('agent-facing projections: shares everything', whole.deflate - noAgent.deflate, '| carries copies', agent.deflate, '| the copies cost', agent.deflate - (whole.deflate - noAgent.deflate));
console.log('base', base.deflate, 'bytes,', (base.deflate / 1024).toFixed(1), 'KiB,', Math.round(base.deflate / 131072 * 100) + '% of 128 KiB; the two components together, sharing:', whole.deflate - base.deflate);
fs.writeFileSync(here + '../out/split.json', JSON.stringify({ whole, noPrint, noAgent, base, printer, agent, opening }, null, 1));
