// The parts of a web envelope (spike/kernel/src/envelope.rs), put together from the files of this spike.
import fs from 'fs'; import zlib from 'zlib'; import crypto from 'crypto'; import { execFileSync } from 'child_process'; import { fileURLToPath } from 'url';
const here = p => fileURLToPath(new URL(p, import.meta.url));
// the kernel: cargo's output, optimised (SIZE-NOTES.md)
export function kernelWasm() {
  const built = here('../kernel/target/wasm32-unknown-unknown/release/ufo_spike_kernel.wasm'), opt = here('../out/kernel.opt.wasm');
  if (!fs.existsSync(opt) || fs.statSync(opt).mtimeMs < fs.statSync(built).mtimeMs) {
    fs.mkdirSync(here('../out/'), { recursive: true });
    execFileSync(here('../tools/node_modules/.bin/wasm-opt'), ['-Oz', '--enable-bulk-memory', '--enable-sign-ext', '--enable-nontrapping-float-to-int', '--enable-mutable-globals', built, '-o', opt]);
  }
  return fs.readFileSync(opt);
}
// Every part but `static` and `date`, which whoever makes the envelope supplies: the first from the kernel, the second from the clock.
// No line break at either end of the script or the style: the Nu checker hashes them trimmed, a browser as they stand.
export function fixedParts(pack, { title, tools = fs.readFileSync(here('tools.ufx')) } = {}) {
  const wasm = kernelWasm();
  return {
    title: title.trim().replace(/[\t\n\f\r ]+/g, ' '),   // as `document.title` will give it back
    style: fs.readFileSync(here('page.css'), 'utf8').trim(), script: fs.readFileSync(here('host.mjs'), 'utf8').trim(),
    kernel: zlib.deflateRawSync(wasm, { level: 9 }).toString('base64'), 'kernel-hash': crypto.createHash('sha256').update(wasm).digest('hex'),
    tools: Buffer.from(tools).toString('base64'), pack: Buffer.from(pack).toString('base64'), skeleton: fs.readFileSync(here('skeleton.html'), 'utf8').trim(),
  };
}
