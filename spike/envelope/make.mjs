// Writes a web envelope (SPEC-TRAVEL 13.2): one HTML file holding a pack, the tools pack, the kernel and the binding.
// Throwaway spike. Usage, from anywhere:
//   node spike/envelope/make.mjs <pack.ufx> <out.ufx.html> [--title T] [--dense] [--tools tools.ufx] [--date YYYY-MM-DD] [--sizes]
// Build the kernel first (spike/README.md); this runs wasm-opt on it with the flags of SIZE-NOTES.md.
import fs from 'fs'; import zlib from 'zlib'; import crypto from 'crypto'; import { execFileSync } from 'child_process'; import { fileURLToPath } from 'url';
import { start } from '../binding/binding.mjs'; import * as denser from './dense.mjs';
const here = p => fileURLToPath(new URL(p, import.meta.url));
const args = process.argv.slice(2), flag = n => { const i = args.indexOf('--' + n); return i < 0 ? null : args.splice(i, 2)[1]; }, has = n => { const i = args.indexOf('--' + n); return i >= 0 && !!args.splice(i, 1); };
const title0 = flag('title'), toolsPath = flag('tools') || here('../../vectors/tools.ufx'), date = flag('date') || new Date().toISOString().slice(0, 10), dense = has('dense'), sizes = has('sizes');
const [packPath, outPath] = args; if (!outPath) { console.error('usage: make.mjs <pack> <out.ufx.html> [--title T] [--dense]'); process.exit(2); }

// ---- the kernel: cargo's output, optimised (SIZE-NOTES.md), raw DEFLATE at level 9 ----
const built = here('../kernel/target/wasm32-unknown-unknown/release/ufo_spike_kernel.wasm'), opt = here('../out/kernel.opt.wasm');
if (!fs.existsSync(opt) || fs.statSync(opt).mtimeMs < fs.statSync(built).mtimeMs) { fs.mkdirSync(here('../out/'), { recursive: true });
  execFileSync(here('../tools/node_modules/.bin/wasm-opt'), ['-Oz', '--enable-bulk-memory', '--enable-sign-ext', '--enable-nontrapping-float-to-int', '--enable-mutable-globals', built, '-o', opt]); }
const wasm = fs.readFileSync(opt), deflated = zlib.deflateRawSync(wasm, { level: 9 });
const pack = new Uint8Array(fs.readFileSync(packPath)), tools = new Uint8Array(fs.readFileSync(toolsPath));

// ---- the static face: the plain-text face, from the kernel ----
const k = await start(wasm, (piece, s) => ({ adv: [...s].length * piece.size / 2, asc: piece.size * 0.8, desc: piece.size * 0.2 }), b => zlib.inflateRawSync(b));
if (!await k.open(pack)) throw Error('the pack does not open'); if (!k.openTools(tools)) throw Error('the tools pack does not open');
const text = k.sample({ as: 'text' }).text.replace(/^\n+/, ''), title = title0 || text.split('\n').find(l => l.trim()) || 'Untitled';
const esc = s => s.replace(/[&<> ]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] || '&nbsp;');

// ---- the script: the binding, then the shell, as one module ----
const strip = s => s.replace(/^export /gm, '').replace(/^import .*\n/gm, '');
let shell = strip(fs.readFileSync(here('shell.mjs'), 'utf8'));
if (dense) shell = shell.replace(/^const dense = null;.*$/m, () => 'const dense = (() => {\n' + strip(fs.readFileSync(here('dense.mjs'), 'utf8')) + 'return { en, de };\n})();');
// (no line break at either end of the script or the style: the Nu checker hashes them trimmed, a browser as they stand)
const script = (strip(fs.readFileSync(here('../binding/binding.mjs'), 'utf8')) + shell).trim();
const style = fs.readFileSync(here('page.css'), 'utf8').trim();
for (const [what, s] of [['script', script], ['style', style]]) if (/<!--|<\/?script|<\/style|\r|\0/i.test(s)) throw Error('the ' + what + ' holds text that may not stand in its element');
const sha = s => crypto.createHash('sha256').update(s).digest('base64');
const csp = `default-src 'none'; script-src 'sha256-${sha(script)}' 'wasm-unsafe-eval'; style-src 'sha256-${sha(style)}'; base-uri 'none'; form-action 'none'`;

// ---- the page. Written exactly as a browser serialises the document it parses from it, so that the page can give
// itself back as the envelope template (see the head of shell.mjs): no white space where the parser would drop or move it. ----
const carry = b => dense ? denser.en(b) : Buffer.from(b).toString('base64');
const comment = `\n${title.replace(/-+/g, '-').replace(/[<>]/g, '')}\nThis file is a UFO: a document that carries its own reader, in one web page.\nExported ${date}.\nTo open it, open this file in a web browser with scripts enabled. Nothing is fetched from the network.\n`;
if (Buffer.byteLength(comment) + 7 > 512) throw Error('the plain-text head is over 512 bytes');
const body = fs.readFileSync(here('page.html'), 'utf8').trim().replace('{{title}}', () => esc(title)).replace('{{text}}', () => esc(text));
const parts = {
  head: `<!DOCTYPE html>\n<!--${comment}-->\n<html lang="en"><head><meta charset="utf-8">\n<title>${esc(title)}</title>\n<meta http-equiv="Content-Security-Policy" content="${csp}">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<style>${style}</style>\n</head><body>\n`,
  body: body + '\n',
  pack: `<script type="application/x-ufo-pack">${carry(pack)}</script>\n`,
  tools: `<script type="application/x-ufo-tools">${carry(tools)}</script>\n`,
  kernel: `<script type="application/x-ufo-kernel" data-sha256="${crypto.createHash('sha256').update(wasm).digest('hex')}">${carry(deflated)}</script>\n`,
  binding: `<script type="module">${script}</script></body></html>`,
};
const html = Object.values(parts).join('');
fs.writeFileSync(outPath, html);
const n = s => Buffer.byteLength(s), gz = zlib.gzipSync(html, { level: 9 }).length;
const report = { file: outPath, dense, total: n(html), gzip: gz, kernel: { wasm: wasm.length, deflated: deflated.length, carried: n(carry(deflated)), sha256: crypto.createHash('sha256').update(wasm).digest('hex') },
  pack: { bytes: pack.length, carried: n(carry(pack)) }, tools: { bytes: tools.length, carried: n(carry(tools)) },
  script: { bytes: n(script), binding: n(strip(fs.readFileSync(here('../binding/binding.mjs'), 'utf8'))), shell: n(shell), gzip: zlib.gzipSync(script, { level: 9 }).length },
  staticText: n(esc(text)), style: n(style), fixed: n(html) - n(carry(deflated)) - n(carry(pack)) - n(carry(tools)) - n(script) - n(esc(text)) - n(style), csp };
if (sizes) console.log(JSON.stringify(report, null, 1)); else console.log(`${outPath}: ${report.total} bytes (kernel ${report.kernel.carried}, pack ${report.pack.carried}, tools ${report.tools.carried}, script ${report.script.bytes})`);
