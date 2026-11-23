// Writes the quirks corpus, vectors/quirks/: one small self-contained page for each difference between engines that the web
// envelope met, built the way that works in every engine, beside the naive construction where there is one; and quirks.json.
// The pages are generated because each carries the hashes of its own script and style in its policy.
//   node spike/envelope/quirks-make.mjs
// Each page ends by writing its verdict into <html data-result="pass | fail: why"> and into the page. quirks.mjs runs them.
import fs from 'fs'; import crypto from 'crypto'; import { fileURLToPath } from 'url';
const dir = fileURLToPath(new URL('../../vectors/quirks/', import.meta.url)); fs.mkdirSync(dir, { recursive: true });
const hash = s => 'sha256-' + crypto.createHash('sha256').update(s).digest('base64');
// what every page begins with: it listens for violations of its own policy, and its verdict counts them
const PRE = `const violations = []; document.addEventListener('securitypolicyviolation', e => violations.push(e.violatedDirective + ' ' + e.blockedURI));
const finish = (problems = [], wait = 400) => setTimeout(() => { const all = [...problems, ...violations.map(v => 'policy violation: ' + v)];
  document.getElementById('result').textContent = document.documentElement.dataset.result = all.length ? 'fail: ' + all.join('; ') : 'pass'; }, wait);
`;
function page(file, { title, says, style = '', body = '', script, icon = true, policy = '' }) {
  const css = 'body{font:16px/1.4 system-ui,sans-serif;margin:16px;max-width:44em}#result{font-weight:700}' + style, js = PRE + script;
  fs.writeFileSync(dir + file, `<!DOCTYPE html>
<!-- ${says} -->
<html lang="en"><head><meta charset="utf-8">
<title>${title}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src '${hash(js)}'; style-src '${hash(css)}'${icon === true ? '; img-src data:' : ''}${policy}; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1">${icon ? '\n<link rel="icon" href="data:,">' : ''}
<style>${css}</style>
</head><body>
<h1>${title}</h1>
<p>${says}</p>
<p>Result: <span id="result">not finished</span></p>
${body}
<script type="module">${js}</script></body></html>
`);
}
const E = [];   // the index

// ---- 01: no engine is given a reason to ask for an icon ----
const icon = { title: '01 no icon request', script: 'finish();' };
page('01-no-icon-request.html', { ...icon, says: 'The page names its own icon, an empty data: address, and its policy allows images from data: and nowhere else. Every engine: no request beside the page, no violation, nothing on the console.' });
page('01-no-icon-request.naive.html', { ...icon, icon: false, says: 'Naive: no icon is named. Firefox 155, from an http origin, asks the origin for /favicon.ico; the policy stops it, reports an img-src violation and writes to the console. Chromium (headless shell) and WebKit (Playwright build) do not ask.' });
page('01-no-icon-request.naive2.html', { ...icon, icon: 'named', says: 'Naive: the icon is named, but the policy has no img-src. Chromium 153 and Firefox 155 refuse to load data:, under default-src and write to the console (Firefox also reports a violation); WebKit 26 says nothing.' });
E.push({ id: '01-no-icon-request', name: 'An engine asks the origin for an icon the page never named, and the page\'s own policy then reports the engine\'s request',
  file: '01-no-icon-request.html', where: ['file', 'http'], expect: { requests: 1 },
  naive: [{ file: '01-no-icon-request.naive.html', fails: { firefox: 'from http: GET /favicon.ico is attempted, blocked by default-src \'none\', reported as an img-src violation and a console error' } },
    { file: '01-no-icon-request.naive2.html', fails: { chromium: 'console error: loading data:, violates default-src \'none\'', firefox: 'img-src violation and console error for data:,' } }],
  rule: 'A web envelope MUST name its icon itself, as an empty data: address (<link rel="icon" href="data:,">), and its policy MUST allow images from data: and from nowhere else (img-src data:). No engine then has a reason to ask any origin for anything.',
  pass: 'opened from a local file and from an http origin: the server sees exactly one request (the page); zero securitypolicyviolation events; zero console messages' });

// ---- 02: how the page looks at run time never needs a style the policy has not hashed ----
const look = { title: '02 the look changes without a style being written', style: '.box{width:200px}.moved{margin-left:20px}canvas{display:block;width:100%;height:auto}[hidden]{display:none!important}',
  body: '<div class="box"><p id="p">a paragraph</p><p id="q">another</p><canvas id="c"></canvas><textarea id="t" rows="2"></textarea></div>' };
const lookCheck = `const p = document.getElementById('p'), q = document.getElementById('q'), c = document.getElementById('c'), t = document.getElementById('t'), problems = [];
const css = (el, k) => getComputedStyle(el)[k];
if (css(p, 'marginLeft') !== '20px') problems.push('the paragraph did not move: ' + css(p, 'marginLeft'));
if (css(q, 'display') !== 'none') problems.push('the second paragraph is not hidden');
if (c.clientWidth !== 200 || c.clientHeight !== 50) problems.push('the canvas is ' + c.clientWidth + ' by ' + c.clientHeight + ', not 200 by 50');
if (t.rows !== 5) problems.push('the text box has not five rows');
finish(problems);`;
page('02-look-without-style.html', { ...look, says: 'The script moves a paragraph by a class, hides another by the hidden attribute, sizes a canvas by its width and height attributes (the style sheet gives it the width of its box and the height that follows) and a text box by rows. Every engine: all four take effect, and no violation.',
  script: `document.getElementById('p').className = 'moved'; document.getElementById('q').hidden = true; Object.assign(document.getElementById('c'), { width: 400, height: 100 }); document.getElementById('t').rows = 5;\n` + lookCheck });
page('02-look-without-style.naive.html', { ...look, says: 'Naive: the script writes a style attribute and makes a style element. Every engine (Chromium 153, Firefox 155, WebKit 26) refuses both under a policy that names styles by hash, reports style-src-attr and style-src-elem violations, and nothing moves.',
  script: `document.getElementById('p').setAttribute('style', 'margin-left:20px'); const s = document.createElement('style'); s.textContent = '#q{display:none}'; document.head.append(s);
Object.assign(document.getElementById('c'), { width: 400, height: 100 }); document.getElementById('t').rows = 5;\n` + lookCheck });
E.push({ id: '02-look-without-style', name: 'A style written at run time (a style attribute, a style element made by script) is outside what a policy of hashes states, and is refused',
  file: '02-look-without-style.html', where: ['file', 'http'], expect: { requests: 1 },
  naive: [{ file: '02-look-without-style.naive.html', fails: { chromium: 'style-src-attr and style-src-elem violations; the style is not applied', firefox: 'the same', webkit: 'the same ("Refused to apply a stylesheet…")' } }],
  rule: 'Every byte a web envelope\'s policy constrains MUST be a part whose hash the envelope function writes into the policy: one style, one script. A binding MUST NOT write a style by any means (no style attribute, no style element, no style-sheet interface, no style property): it changes how the page looks only by attributes (hidden, class, width, height, rows, ARIA) whose effect the hashed style sheet states.',
  pass: 'the four changes take effect (computed style and size checked by the page); zero securitypolicyviolation events; zero console messages. On the envelope itself: a static check that the script holds no style write, and zero violations over open, edit, save and reopen (entry 00)',
  note: 'Setting a style property through script (element.style.left = …) was allowed under the policy by all three engines here. The rule forbids it all the same, so that what the page may look like is exactly what the hashed style part says.' });

// ---- 03: a file is handed over as bytes ----
const saved = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>saved</title><style>p{color:#060}</style></head><body><p>saved</p></body></html>\n';
const save = type => `const href = location.href, a = document.createElement('a');
a.href = URL.createObjectURL(new Blob([${JSON.stringify(saved)}], { type: '${type}' })); a.download = 'saved.ufx.html'; a.click();
setTimeout(() => finish(location.href === href && document.getElementById('result') ? [] : ['the page went elsewhere'], 100), 600);`;
page('03-save-as-bytes.html', { title: '03 a file is handed over as bytes', script: save('application/octet-stream'),
  says: 'The script hands over a file by a link it makes and never puts in the page: download names the file, and the address is a blob of bytes of no declared kind. Every engine, from a local file and from http: the file comes down under its name, the page stays, no violation.' });
page('03-save-as-bytes.naive.html', { title: '03 a file is handed over as bytes', script: save('text/html'),
  says: 'Naive: the blob says it is text/html. Chromium 153, Firefox 155 and WebKit 26 still download it and show nothing; no misbehaviour was seen here. A browser that does not honour download would open it as a page, under the policy of the page that made it.' });
E.push({ id: '03-save-as-bytes', name: 'A saved file that says it is a page may be opened as one, under the saving page\'s policy, where download is not honoured',
  file: '03-save-as-bytes.html', where: ['file', 'http'], expect: { requests: 1, download: { name: 'saved.ufx.html', text: saved } },
  naive: [{ file: '03-save-as-bytes.naive.html', fails: {}, expect: { requests: 1, download: { name: 'saved.ufx.html', text: saved } } }],
  rule: 'A binding hands a file to the person as bytes of no declared kind (application/octet-stream), by a link with download that is never put into the page. It MUST NOT open, show or navigate to what it saves, so that no document but the envelope itself ever has to satisfy the envelope\'s policy.',
  pass: 'from a local file and from an http origin: a download named as asked whose bytes are those given; the page\'s address does not change; zero violations; zero console messages; the server sees one request',
  note: 'No engine here misbehaved with the naive construction. The rule is kept because the failure it prevents (the saved page shown in place, as a blob: document that inherits the policy) needs no bug, only a browser that ignores the download attribute.' });

// ---- 04: where text was changed is found from the selection, and checked ----
const TEXT = 'Revenue grew in every region this quarter, and for the first time the growth came mostly from customers.';
const model = `const area = document.getElementById('t'), problems = []; let held = area.value, text = [...held], sel = null, comp = null, placed = 0, whole = 0;
const count = s => [...s].length;
const report = ev => { if ('at' in ev) { placed++; text.splice(ev.at, ev.del, ...ev.ins); } else { whole++; text = [...ev.s]; } };   // what a kernel does with a report
area.addEventListener('beforeinput', () => { sel = area.selectionStart; });
area.addEventListener('compositionstart', () => { comp = area.selectionStart; });
area.addEventListener('compositionend', () => setTimeout(() => { comp = null; }));
`;
const done = `document.getElementById('done').onclick = () => { if (text.join('') !== area.value) problems.push('the reports do not add up to the text: ' + JSON.stringify(text.join('').slice(0, 40)) + ' is not ' + JSON.stringify(area.value.slice(0, 40)));
  document.documentElement.dataset.detail = placed + ' with a position, ' + whole + ' without'; finish(problems, 50); };`;
const positions = { title: '04 where a text box was changed', body: `<textarea id="t" rows="4" cols="60" aria-label="text">${TEXT}</textarea><p><button type="button" id="done">Done</button></p>` };
page('04-edit-positions.html', { ...positions, says: 'Each change in the text box is reported as (at, removed, inserted): from where the caret was before, or where an input method began, to where the selection ends after; the report is checked against the text before and after, and where it does not account for the change the whole text is reported instead. Every engine: the reports add up to the text, whatever is typed, removed, pasted, cut or undone.',
  script: model + `area.addEventListener('input', () => {
  const was = held, now = area.value, to = area.selectionStart, end = area.selectionEnd, at = Math.min(sel ?? to, comp ?? to, to);
  const ins = now.slice(at, end), del = was.length - now.length + ins.length;
  const found = del >= 0 && was.slice(0, at) === now.slice(0, at) && was.slice(at + del) === now.slice(end);
  held = now; sel = null;
  report(found ? { at: count(was.slice(0, at)), del: count(was.slice(at, at + del)), ins } : { s: now });
});\n` + done });
page('04-edit-positions.naive.html', { ...positions, says: 'Naive: the caret after the change is taken as the end of what was inserted, and the report is not checked. WebKit 26 leaves the text an undo brings back selected, so the caret is at its start: the report is wrong and the reports no longer add up. Chromium 153 and Firefox 155 put the caret after it.',
  script: model + `area.addEventListener('input', () => {
  const was = held, now = area.value, to = area.selectionStart, at = Math.min(sel ?? to, comp ?? to, to);
  const ins = now.slice(at, to), del = Math.max(0, was.length - now.length + ins.length);
  held = now; sel = null;
  report({ at: count(was.slice(0, at)), del: count(was.slice(at, at + del)), ins });
});\n` + done });
page('04-edit-positions.naive2.html', { ...positions, says: 'Naive: the place is asked of the event (getTargetRanges). For a text box Chromium 153, Firefox 155 and WebKit 26 all give an empty list, so nothing is known and nothing adds up.',
  script: model + `area.addEventListener('beforeinput', e => { const r = e.getTargetRanges()[0]; if (r) report({ at: r.startOffset, del: r.endOffset - r.startOffset, ins: e.data || '' }); });\n` + done });
const drive = [['focus', '#t'], ['caret', 0, 0], ['type', 'No'], ['caret', 8, 14], ['type', 'x'], ['press', 'Backspace'], ['press', 'Delete'], ['caret', 2, 9], ['press', 'ControlOrMeta+c'], ['caret', 0, 0], ['press', 'ControlOrMeta+v'],
  ['caret', 2, 9], ['press', 'ControlOrMeta+x'], ['caret', 20, 20], ['press', 'Control+Backspace'], ['press', 'ControlOrMeta+z'], ['insertText', '日本'], ['press', 'Enter'], ['type', 'é𝄞'], ['click', '#done']];
E.push({ id: '04-edit-positions', name: 'Engines say differently where a text box was changed: none gives target ranges for it, and after an undo WebKit leaves the restored text selected',
  file: '04-edit-positions.html', where: ['file'], drive, expect: {},
  naive: [{ file: '04-edit-positions.naive.html', drive, fails: { webkit: 'after undo the selection is the restored text (start 17, end 20), not a caret after it: the report says nothing was inserted, and the model no longer matches the text' } },
    { file: '04-edit-positions.naive2.html', drive, fails: { chromium: 'getTargetRanges() is an empty list for a textarea', firefox: 'the same', webkit: 'the same' } }],
  rule: 'A binding reports each change of an editing surface as (at, removed, inserted) only when the selection before and after accounts for it exactly: the text before `at` and after the change is unchanged. Otherwise it reports the whole text with no position, and it always reports the whole text when the entry ends. A kernel MUST accept both, and settle any disagreement by the whole text.',
  pass: 'after typing, replacing a selection, Backspace, Delete, copy and paste, cut, delete-word, undo, text inserted by an input method, a line break and characters outside the basic plane: the reports, applied in order, give exactly the text the box holds',
  note: 'Seen here: beforeinput and input fire for a textarea in all three with the same inputType values; getTargetRanges() is empty in all three; Firefox sends compositionend before the last input of a composition, the others after; WebKit selects what an undo restores.' });

// ---- 00: the envelope itself, as make.mjs builds it ----
E.unshift({ id: '00-envelope', name: 'The envelope as built: opened, edited by the keyboard, saved and reopened under its own policy', file: null, where: ['http'], expect: {},
  rule: 'A web envelope, through opening, every face, an edit, saving and reopening what was saved, MUST cause zero policy violations, write nothing to the console, and make no request but the one that fetched it.',
  pass: 'built by spike/envelope/make.mjs from vectors/compose.ufx and served from an http origin: after Tab to Edit, Enter, Tab to a paragraph, Enter, typing, Done, Save: one file comes down; it reopens at the same state; over both pages zero securitypolicyviolation events, zero console messages, and the server saw each page asked for once and nothing else' });

const harness = [
  { id: 'harness-screenshot', name: 'Playwright\'s screenshot puts a style element into the page; in WebKit the page\'s policy refuses it and reports it', page: '02-look-without-style.html', act: 'screenshot',
    seen: { chromium: 'nothing reported', firefox: 'nothing reported', webkit: 'one style-src-elem violation and a console error for each screenshot' },
    rule: 'A conformance run takes no picture of a page it is asserting on, and puts nothing into it. What is observed of a page is observed from outside it, or by a script added before the page\'s own by means its policy does not govern.' },
  { id: 'harness-local-file-request', name: 'Request interception does not report the reading of a local file in Firefox', page: '02-look-without-style.html', act: 'count',
    seen: { chromium: 'the file:// address is reported once', firefox: 'nothing is reported', webkit: 'the file:// address is reported once' },
    rule: 'That nothing leaves a page is asserted by what every engine shows: the origin\'s own record of requests, the page\'s record of what it fetched (resource timing), and its policy violations. A count from the test tool\'s interception is "at most the page itself".' },
];
fs.writeFileSync(dir + 'quirks.json', JSON.stringify({ status: { status: 'provisional', note: 'the author\'s envelope and harness only; engines: Chromium 153 (headless shell), Firefox 155, WebKit 26.6 (Playwright builds, Linux)' },
  what: 'Differences between browser engines that the web envelope (SPEC-TRAVEL 13.2) met, each with a page built so that the difference cannot arise, the naive construction that shows it, and the rule that makes it impossible. A reader or exporter passes an entry when its page gives the result stated in every engine.',
  how: 'Each page writes its verdict to <html data-result>: "pass", or "fail: " and why; it counts violations of its own policy. `where` says how it is opened: from a local file, from an http origin, or both. `drive` is real input for the runner to give, in order: focus and click (a selector), caret (a selection in the focused text box, in UTF-16 units), type, insertText, press (a key). `expect.requests` is how many requests the origin may see; `expect.download` a file that must come down. `naive[].fails` says, by engine, what goes wrong with the naive page; an engine not named there passes it. Entry 00 has no page: its subject is the envelope itself.',
  runner: 'spike/envelope/quirks.mjs', entries: E.map(e => ({ ...e, status: 'provisional' })), harness }, null, 1) + '\n');
console.log(`${dir}: ${fs.readdirSync(dir).length} files`);
