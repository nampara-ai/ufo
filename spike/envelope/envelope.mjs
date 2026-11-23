// The web envelope as a pure function of its parts: a second implementation, in JavaScript, of what the kernel's
// `envelope` does (spike/kernel/src/envelope.rs, where the definition is written out). For the tests only: the
// page and make.mjs use the kernel's. It also writes the small fixed case, spike/out/envelope-case.json and vectors/provisional/envelope.json:
//   node spike/envelope/envelope.mjs
import crypto from 'crypto'; import fs from 'fs'; import { fileURLToPath } from 'url';
const ESCAPED = ['title', 'date', 'static'], RAW = ['style', 'script', 'kernel', 'kernel-hash', 'pack', 'skeleton', 'static-html'];
const escapes = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export function envelope(parts) {
  const part = n => { if (typeof parts[n] !== 'string') throw Error('a part the skeleton asks for is absent, or is not a text: ' + n); return parts[n]; };
  let rest = part('skeleton'), out = '';
  for (let a; (a = rest.indexOf('{{')) >= 0;) {
    const b = rest.indexOf('}}', a + 2); if (b < 0) throw Error('a gap in the skeleton is not closed');
    const name = rest.slice(a + 2, b); out += rest.slice(0, a); rest = rest.slice(b + 2);
    if (name === '<') out += '<';
    else if (ESCAPED.includes(name)) out += part(name).replace(/[&<>"]/g, c => escapes[c]);
    else if (RAW.includes(name)) {
      const p = part(name), low = p.replace(/[A-Z]/g, c => c.toLowerCase());   // ASCII letters only
      if (low.includes('</script') || low.includes('<!--') || (name === 'style' && low.includes('</style'))) throw Error('a part to be put in unchanged holds text that would end or escape its element: ' + name);
      out += p;
    } else if (name === 'csp:script' || name === 'csp:style') out += 'sha256-' + crypto.createHash('sha256').update(Buffer.from(part(name.slice(4)), 'utf8')).digest('base64');
    else throw Error('the skeleton has a gap of a name that is not known: ' + name);
  }
  return out + rest;
}
// A small fixed case: every kind of gap, a part that needs escaping, a part that holds gap marks which must not be filled.
export const fixedCase = {
  title: 'A & B <c> "d"', date: '2026-01-02', static: 'one < two\n{{pack}} is not filled here', style: 'p{color:red}', script: 'let a = "{{title}}" < 1;',
  kernel: 'AAAA', 'kernel-hash': 'df3f619804a92fdb4057192dc43dd748ea778adc52bc498ce80524c014b81119', pack: 'UEFDSw==',
  skeleton: '{{<}}!-- {{date}} -->\n<title>{{title}}</title><meta content="script-src \'{{csp:script}}\'; style-src \'{{csp:style}}\'"><style>{{style}}</style>\n<pre>{{static}}</pre>\n'
    + '<script type="a/pack">{{pack}}{{<}}/script><script type="a/kernel" data-hash="{{kernel-hash}}">{{kernel}}{{<}}/script>\n'
    + '<script type="a/skeleton">{{skeleton}}{{<}}/script><script type="module">{{script}}{{<}}/script>',
};
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const made = { status: { status: 'provisional', note: "the author's kernel only" },
    what: 'envelope(parts): the definition is at the head of spike/kernel/src/envelope.rs. Every value is a text; the envelope is compared as UTF-8 bytes. There is no `tools` part: the tools universe travels in the pack, nested under `components.tools` (SPEC-PLAYER 9.6), and a skeleton that asks for one is refused.', parts: fixedCase, envelope: envelope(fixedCase),
    refused: { 'a part put in unchanged holds </SCRIPT': { ...fixedCase, pack: 'x</SCRIPT>' }, 'the style holds </style': { ...fixedCase, style: 'p{}</Style>' }, 'a part holds <!--': { ...fixedCase, kernel: '<!--' },
      'a gap of an unknown name': { ...fixedCase, skeleton: '{{nothing}}' }, 'a gap named tools, which is no longer a part': { ...fixedCase, tools: 'VE9PTFM=', skeleton: '{{tools}}' }, 'a gap that is not closed': { ...fixedCase, skeleton: 'a {{title' }, 'a part is absent': { skeleton: '{{title}}' } } };
  for (const file of ['../out/envelope-case.json', '../../vectors/provisional/envelope.json'].map(f => fileURLToPath(new URL(f, import.meta.url)))) { fs.writeFileSync(file, JSON.stringify(made, null, 1) + '\n'); console.log(file); }
}
