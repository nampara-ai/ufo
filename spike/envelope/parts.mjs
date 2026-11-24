// The parts of a web envelope (spike/kernel/src/envelope.rs), put together from the files of this spike.
import fs from 'fs'; import zlib from 'zlib'; import crypto from 'crypto'; import { execFileSync } from 'child_process'; import { fileURLToPath } from 'url'; import { start } from '../binding/binding.mjs'; import { Pack, Tag } from './mkpack.mjs'; import { divide } from '../tools/divide.mjs';
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
// The kernel as files carry it (spike/SPLIT.md): the base, and each component, divided from one build by spike/tools/divide.mjs
// and made again whenever the kernel's source is newer than they are. `kernelWasm`, above, is the kernel whole: what the tests in
// Node ask their questions of.
export const ROLES = { printer: 'ufo.printer', agent: 'ufo.agent', formulas: 'ufo.formulas' };
export function divided(name = 'base') {
  const dir = here('../out/divided/'), file = dir + name + '.wasm', src = here('../kernel/src/'), newest = Math.max(...fs.readdirSync(src).map(f => fs.statSync(src + f).mtimeMs));
  if (!fs.existsSync(file) || fs.statSync(file).mtimeMs < newest) divide(dir);
  return fs.readFileSync(file);
}
export const hashOf = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
// A pack that lists components for the base it will travel with (SPEC 1.6): for each, one change through the kernel's gate sets
// `components.<role>` of the universe object to `{module, for}`: the component's bytes as a blob, its chunks compressed here, and the
// hash of the base it was divided from. The kernel carries the blob's frames in as they stand. `damage` changes one byte of what was
// carried in, for the tests: the component then does not verify.
export async function withComponents(pack, names, { time = Date.UTC(2026, 0, 2), who = 'UFO spike', base = divided(), other = false, damage = false } = {}) {
  for (const name of names) {
    const k = await start(kernelWasm(), () => ({ adv: 0, asc: 0, desc: 0 }), z => zlib.inflateRawSync(z)); if (!await k.open(new Uint8Array(pack))) throw Error('not a pack');
    const carry = new Pack('ufo-spike-component', true), blob = carry.blob(divided(name)), frames = carry.carried(), before = pack.length;
    const made = k.propose({ o: new Uint8Array(16), key: ['components', ROLES[name]], val: { module: { tag: 55464, v: ['b', Uint8Array.from(blob)] }, for: Uint8Array.from(Buffer.from(other ? '00'.repeat(32) : hashOf(base), 'hex')) },
      with: new Uint8Array(frames), who, time, random: new Uint8Array(crypto.createHash('sha512').update('ufo-spike-component').update(pack).update(name).digest()) });
    if (made.refused) throw Error(`the component ${name} was not carried in: ${made.refused}`);
    pack = Buffer.from(k.packBytes()); if (damage) pack[before + 200] ^= 1;   // inside the first frame carried in: a chunk of the module
  }
  return pack;
}
// The script as it is shipped: host.mjs through terser, a pinned version (spike/tools/package-lock.json) with fixed options and no
// source map. The same source gives the same bytes wherever it lies (spike/tools/repro-host.sh checks). The budget of a binding
// (PLAYER 11.1) is counted on these bytes; the source is what is read, and is checked for the same things.
export const MINIFY = ['--module', '--ecma', '2020', '--compress', '--mangle'];
export const shipped = (source = here('host.mjs')) => execFileSync(here('../tools/node_modules/.bin/terser'), [source, ...MINIFY]).toString().trim();
// A pack with a tools universe nested in it (SPEC 1.8, PLAYER 9.6): one change through the kernel's gate, which sets
// `components.tools` of the universe object to an anchor naming the tools universe's commit, and with which the tools
// universe's records come to lie in the pack. The same pack, tools and time give the same bytes: what stands for random bytes
// is drawn from them.
export async function withTools(pack, { tools = fs.readFileSync(here('tools.ufx')), time = Date.UTC(2026, 0, 2), who = 'UFO spike' } = {}) {
  const open = async b => { const k = await start(kernelWasm(), () => ({ adv: 0, asc: 0, desc: 0 }), z => zlib.inflateRawSync(z)); if (!await k.open(new Uint8Array(b))) throw Error('not a pack'); return k; };
  const k = await open(pack), commit = (await open(tools)).commits()[0].commit, zero = new Uint8Array(16);
  const made = k.propose({ o: zero, key: ['components', 'tools'], val: { tag: 55462, v: { o: zero, u: Uint8Array.from(Buffer.from(commit, 'hex')) } }, with: new Uint8Array(tools), who, time,
    random: new Uint8Array(crypto.createHash('sha512').update('ufo-spike-nest').update(pack).update(tools).digest()) });
  if (made.refused) throw Error('the tools were not nested: ' + made.refused);
  return k.packBytes();
}
// Every part but `static` and `date`, which whoever makes the envelope supplies: the first from the kernel, the second from the clock.
// No line break at either end of the script or the style: the Nu checker hashes them trimmed, a browser as they stand.
export function fixedParts(pack, { title } = {}) {
  const wasm = divided();   // a file carries the base; what else it needs, it lists (withComponents)
  return {
    title: title.trim().replace(/[\t\n\f\r ]+/g, ' '),   // as `document.title` will give it back
    style: fs.readFileSync(here('page.css'), 'utf8').trim(), script: shipped(),
    kernel: zlib.deflateRawSync(wasm, { level: 9 }).toString('base64'), 'kernel-hash': crypto.createHash('sha256').update(wasm).digest('hex'),
    pack: Buffer.from(pack).toString('base64'), skeleton: fs.readFileSync(here('skeleton.html'), 'utf8').trim(),
  };
}
