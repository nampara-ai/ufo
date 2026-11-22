// Does the kernel, printing a described module from a pack, reproduce the trial printer's bytes?
import fs from 'fs'; import { execSync } from 'child_process'; import { start } from './binding.mjs';
const wasm = fs.readFileSync(new URL('../kernel/target/wasm32-unknown-unknown/release/ufo_spike_kernel.wasm', import.meta.url));
const [stateDir, work, tests] = process.argv.slice(2);
fs.mkdirSync(work, { recursive: true });
const info = JSON.parse(execSync(`python3 ${new URL('../mk/mkmodule.py', import.meta.url).pathname} ${stateDir}/state.json ${work}/module.ufx`).toString());
// the reference: the JavaScript printer, with globals in the order a map gives them
const st = JSON.parse(fs.readFileSync(stateDir + '/state.json')); st.globals.sort((a, b) => info.canonical_global_order.indexOf(a.name) - info.canonical_global_order.indexOf(b.name));
fs.mkdirSync(work + '/ref', { recursive: true }); fs.writeFileSync(work + '/ref/state.json', JSON.stringify(st)); fs.writeFileSync(work + '/empty.json', '{"ops":[]}');
// exports in the order a map gives them too: by length of name, then by bytes
const P = work + '/printer2-maporder.mjs'; { const src = fs.readFileSync(new URL('../printer/printer2.mjs', import.meta.url), 'utf8'); const from = ".sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)))"; if (!src.includes(from)) throw new Error('reference printer changed'); fs.writeFileSync(P, src.replace(from, ".sort((a, b) => Buffer.byteLength(a.name) - Buffer.byteLength(b.name) || Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)))")); }
const refOut = execSync(`node ${P} check ${work}/ref ${work}/empty.json ${tests}`).toString().trim().split('\n').pop();
const ref = fs.readFileSync(work + '/ref/candidate.wasm');
const k = await start(wasm, () => ({ adv: 0, asc: 0, desc: 0 })); if (!k.open(new Uint8Array(fs.readFileSync(work + '/module.ufx')))) throw new Error('pack does not open');
const t0 = performance.now(); const got = k.print(Uint8Array.from(Buffer.from(info.module_id, 'hex'))); const ms = performance.now() - t0;
console.log(JSON.stringify({ program: stateDir.split('/').slice(-2)[0], functions: info.functions, statements: info.statements, wasm_bytes: ref.length, kernel_bytes: got.length, identical: Buffer.compare(Buffer.from(got), ref) === 0, reference_tests: refOut, description_bytes: info.bodies_as_values, description_deflated: info.bodies_deflated, pack: info.pack, print_ms: +ms.toFixed(2) }));
