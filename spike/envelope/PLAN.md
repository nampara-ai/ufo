# Envelope spike: plan and contract

Throwaway. The aim is the founding acceptance test: a received file opens
in a browser with nothing installed, is read in two faces, has one
paragraph edited through its own tools with attribution recorded, is
saved as a new travel-form file, reopens identically, and can be sent on.

Revised 2026-11-23 after the owner rejected five things about the first
version. This file describes the spike as it now stands; NOTES.md keeps
the record of the first version and says what changed;
FINDINGS-STATUS.md goes through the 35 findings one by one.

A later round the same day (three engines, an accessibility tree, positioned
edits) changed the host interface, the static face and the policy: the last
section of NOTES.md says how, and is right where this file differs.

A further round (the tools universe nested in the pack and holding all of
what the tools do; what will leave shown before a save, and a published
copy; each accessible node placed over what is drawn; the script shipped
minified) changed the envelope's parts, the host interface, the tools
universe and the kernel's part in it. The section of NOTES.md headed
"the tools as description" is right where this file differs: in
particular there is no `tools` part, no `ask` effect and no `who` at
`start`, and "What the kernel learned" and "The tools universe" above
describe the tools universe before it.

## The five decisions, and what was done about each

1. **The shell counts as host code.** There is no shell. Everything the
   page ships as script is `host.mjs`, the web binding: 175 lines that are
   not blank or comment, 9 827 bytes as carried, longest line 144
   characters (budget: 600 lines, 16 KiB).
2. **What the tools do lives in the tools universe, executed by the
   kernel.** `tools.ufx` (written by `mkpack.mjs`) holds the toolbar and a
   Portal onto its subject; the kernel keeps the presentation state,
   evaluates the formulas, executes the handlers, tests presses against its
   own display list, asks the host for a text-entry widget, and makes the
   file. The host forwards raw input and executes effects blindly.
3. **Every edit is reduced to its actual difference.** The kernel compares
   the block before and after (`kernel/src/diff.rs`, Myers) and writes one
   `splice` per run of difference, all in one change.
4. **Saving is a pure function of parts**, in the kernel
   (`kernel/src/envelope.rs`). Nothing reads the serialised document.
5. **Engines**: Chromium only was run. `test.mjs --engine
   chromium|firefox|webkit` runs the same steps on another engine if it is
   installed, and says "not attempted" if it is not.

## Pieces

| File | What it is |
| --- | --- |
| `kernel/src/tool.rs` | the reader's part: formulas, presentation state, handlers, hit testing, text entry, export |
| `kernel/src/diff.rs` | the difference of two texts, with its tie-break written at the head |
| `kernel/src/envelope.rs` | `envelope(parts)`, with its definition written at the head |
| `kernel/src/write.rs` | the gate: `propose`, now of several operations; the paragraph-start rule |
| `envelope/mkpack.mjs` | a standalone pack writer; writes `tools.ufx` and the fixture `out/hostile.ufx` |
| `envelope/tools.ufx` | the tools universe the envelope carries |
| `envelope/host.mjs` | the web binding: all the script in the page |
| `envelope/skeleton.html`, `page.css` | the skeleton (fixed markup with gaps) and the style |
| `envelope/parts.mjs`, `make.mjs` | the parts from this spike's files; the first envelope, by the kernel's `envelope` |
| `envelope/envelope.mjs` | a second implementation of `envelope` in JavaScript, for the tests; writes `out/envelope-case.json` |
| `envelope/roundtrip.mjs`, `more-edits.mjs` | the kernel alone, in Node |
| `envelope/test.mjs` | the acceptance steps in a browser |
| `binding/binding.mjs` | the Node harness the tests and the vector scripts use (not shipped in the page) |

## The tools universe (`tools.ufx`), as values

A formula is a tagged list (tag 55463) whose first item is the operator.
Written here as `[op, …]`.

    universe.roots.primary -> face { of: group, medium: "document" }
    group { children: [toolbar, rule, portal] }

    toolbar: ufo.text  chars "Document   Pages   Text   Edit   Save"
             size 15, font ["sans-serif"], margin [10, 16, 8, 16]
      spans, each inline, role strong:
        "Document"  on: {press: {set: "face", to: "document"}}
                    decoration: ["if", ["or", ["=", ["state","face"], "document"], ["=", ["state","face"], null]], "underline", "none"]
        "Pages"     on: {press: {set: "face", to: "pages"}}
                    decoration: ["if", ["=", ["state","face"], "pages"], "underline", "none"]
        "Text"      on: {press: {set: "face", to: "text"}}
                    decoration: ["if", ["=", ["state","face"], "text"], "underline", "none"]
        "Edit"      on: {press: {set: "editing", to: ["not", ["=", ["state","editing"], true]]}}
                    decoration: ["if", ["=", ["state","editing"], true], "underline", "none"]
        "Save"      on: {press: {act: "export"}}

    rule: ufo.path  d [[M,0,0],[L,4000,0]], stroke grey, width 1, h 1

    portal: ufo.portal
        of:       ["arg", "subject"]
        face:     ["state", "face"]
        editable: ["=", ["state", "editing"], true]
        label:    "The document these tools work on"

Nothing in it names a universe. The names `face` and `editing` are the
tools universe's own: the kernel knows neither. It knows that a Portal has
`of`, `face` and `editable`, that a handler is `{set, to}` or `{act}`, and
the media a `face` hint can name.

What is a stretch of the specification here, and is said so in
FINDINGS-STATUS.md and NOTES.md: `editable` on a Portal (7.6 gives it to a
text primitive); `text` as a `medium` hint for the plain-text face, which
is not a face object; `=` compared with `null` to mean "not yet set".

## What the kernel learned

- **Formulas** (7.3): `state`, `arg` (only `"subject"`), `=`, `not`, `and`,
  `or`, `if`. Anything else is an error value. An error value presents as
  the property being absent, not as a visible sign (F4 not met). The bound
  of F2 is not counted. Formulas are evaluated only in what the reader
  presents as tools: a formula in a working universe is left alone (a
  limit of the spike, and what F6's test relies on for `arg`).
- **Presentation state** (7.3): a small map held for the one presentation
  of the tools universe. Null until set. Changing it changes no byte.
- **Subject** (7.6, 9.6): the reader's own act is the export `start`. A
  Portal whose `of` evaluates to the subject is composed from the working
  pack in the face its `face` names: `pages` (the face of that medium,
  paginated, scaled to the width up to twice, on a grey ground), `text`
  (the plain-text face, 8.3, each line set in a monospaced font and
  broken to the width), anything else the primary face. Composition of the
  subject is given no environment: no state, no subject, nothing to press
  (**F6**). A `with` naming `subject` in a file is simply never read; it
  is not yet "reported as inconsistent".
- **Handlers** (7.6): `{set: name, to: value or formula}` sets state.
  `{act: "export"}` is the action of 10.3 on the subject: the kernel makes
  the envelope and hands the host a file. A handler is looked for only in
  the tools universe.
- **Editable text** (7.6): when a press falls on a text item of the
  subject and the Portal's `editable` is true, the kernel finds the block
  (the innermost block span) that holds it and asks the host to mount its
  editing surface on the block's rectangle with the block's text
  (`text.edit`, 9.3). The host reports the new text; the kernel proposes
  it through `write::edit`, which is what the export `propose` calls: the
  same gate (**F7**). Editing stays on until the tool that turned it on is
  pressed again.
- **`margin`** (Appendix A) on a child of a group, which the toolbar needs.

## The host interface, as built

Kernel imports (`ufo:host/1`): `host_measure` (as before), `host_time() →
milliseconds`, `host_random(buffer, n)`. Time and random bytes are imports,
as 9.3 has them, not arguments of an event. (The export `propose`, used by
the Node tests, still takes `time` and `random` as arguments.)

Kernel exports the page uses: `alloc`, `out_len`, `start`, `pending`,
`pending_get`, `pending_put`, `ready`, `input`, and `query` for the
read-only `ufo` object the tests look through.

| Export | Takes | Gives |
| --- | --- | --- |
| `start` | `{parts, name, who}`: the parts of the envelope the host came in, each the text of an element; the file's name; optionally the person's name | 1 if the tools (`parts.tools`) and the working universe (`parts.pack`) open; then `pending`/`ready` as for `open` |
| `input` | one event | a list of effects, each `[kind, value]` |
| `envelope` | parts | `{text}` or `{refused}` |
| `propose` | `{o, lo, hi, ins, who, time, random}`: positions lo..hi now read `ins` | `{commit, change, root, ops}` or `{refused}` |
| `open`, `open_tools`, `sample`, `query`, `print`, `block_at`, `pack_bytes`, `find_pack` | as before | as before (`sample` no longer takes `of: "tools"`; `press` is gone; `commits` entries gained `change`) |

**Events** (raw input, 9.2): `{view: [w, h]}`; `{press: [x, y]}` in CSS
pixels of the drawn surface; `{edit: id, s: text}` when the editing
surface commits, `{edit: id}` when it is given up; `{answer: text or
null}` to an `ask`.

**Effects**: `draw` `{list, w, h}`: a display list and the size of the
surface; `edit` `{id, at: [x, y, w, h], s, font, size, weight}` to mount
the editing surface, or null to unmount it; `deliver` `{name, type,
bytes}`: a file for the person; `ask` `{label}`: something only the
person can supply, here their name.

**Who is editing** is the reader's principal. The host may pass `who` to
`start`; the page does not, so the kernel asks for it once, with `ask`,
the first time a press would start an edit, and keeps it for the session.
The host shows the browser's own prompt. A cancelled prompt starts no
edit.

**Everything the host code knows**: encoded values; the names of the
kernel's entry points above; the four display-list items it draws (push,
pop, text, path); how to measure text, inflate, give the time and random
bytes; that a click is `{press}` and a resize `{view}`; the four effects
and how to carry each out (a canvas, a textarea with two buttons, a
download, a prompt); the ids of four elements of the page; that the
element of type `…x-ufo-kernel` holds the kernel as base64 of raw DEFLATE
and that its `kernel-hash` is its SHA-256; that every `style` and `script`
element's text is a part to hand over, named by its type. `test.mjs`
fails if the shipped script holds any of: face, editing, export, pages,
propose, splice, outerHTML, innerHTML, envelope, subject, tools, handler,
commit, paragraph, anchor, skeleton, universe, pack, formula, state, or
document (other than the DOM global `document.`; `export` other than the
WebAssembly member `.instance.exports`).

## Edits: the difference, and where new text goes

`propose` compares the stretch with what it is to read, by Unicode scalar
values, and writes one `splice` for each run removed or inserted, in
order, all in one change with elements numbered across them. The script
is a shortest one (Myers' greedy algorithm); which of several is fixed by
three rules written at the head of `diff.rs`: the common prefix is set
aside first, then the common suffix; on a diagonal a removal is preferred
unless the insertion path has got strictly further; removals and
insertions with nothing kept between them are one edit. Past 2²² remembered
path ends the middle is written as one replacement. Text equal to what is
there is never written: an edit that changes nothing is refused ("nothing
to change").

What is attributed is therefore exactly the scalar values that differ.
"ledger" to "books" attributes the word. "taken" to "token" attributes one
letter. Where typed text begins as the text after it does ("Note: " before
"Nothing"), the difference cannot say where it went, and rule 1 puts it as
late as it can go (`e: Not` after `Not`).

New elements follow the last element an edit removes; with nothing
removed, the element before the place. Where the stretch gained text at
its very start with nothing removed there, every block span that began at
that place, and every block span that ended there, has its boundary moved
to just before the first new element, by a `set` of `["spans", key,
"at"]` in the same change (5.1). The origin `{basis: witnessed, by:
person, who}` is written on every change, a removal included.

## The envelope function

Defined at the head of `kernel/src/envelope.rs`, which is the text to
implement from. In short: parts `title`, `date`, `static`, `style`,
`script`, `kernel`, `kernel-hash`, `tools`, `pack`, `skeleton`, each a
text. The envelope is the skeleton with each gap `{{name}}` replaced in
one pass: `title`, `date`, `static` escaped (`& < > "`); the other seven
unchanged; `{{csp:script}}`, `{{csp:style}}` as `sha256-` and base64 of
the SHA-256 of the part; refused on an unknown or unclosed gap, an absent
part, or a part put in unchanged that holds `</script` or `<!--` (or, for
style, `</style`).

**One gap was added to the owner's definition: `{{<}}`, which gives `<`.**
The skeleton is itself a part put in unchanged, inside a script element,
so it may not hold `</script` or `<!--`; but it has to write both. It
writes `{{<}}/script>` and `{{<}}!--`.

Where each part comes from in the page: `title` is `document.title`
(which collapses white space, so `make.mjs` writes it collapsed); `style`,
`script`, `kernel`, `tools`, `pack`, `skeleton` are the `textContent` of
their elements; `kernel-hash` is the `data-hash` of the kernel's element.
At export the kernel replaces three: `static` (the plain-text face of the
subject, without the line breaks it begins with), `pack` (base64 of the
extended pack) and `date` (the host's time as a UTC calendar date,
`YYYY-MM-DD`: no two hyphens together, so the head comment stays a
comment). The plain-text head is "UFO file (Universal File Object).
Exported {{date}}. Open it in a web browser." and no longer holds the
title. The file's name is the page's own with `-edited`, then
`-edited-2`, and so on.

The denser text encoding of ENCODING.md is no longer wired in: the
function fixes base64.

## What counts as passing

Per platform, each of: opened; faces read; one word edited through the
tools with that word alone attributed (`why` shows three runs); a word
typed at the start of a paragraph stays in it; saved as a new
`.ufx.html` that is `envelope(parts)` byte for byte; reopened with the
same state and the edit in both faces; edited and saved again; sent on
(the saved file opens on another origin). Once: the kernel alone in Node;
the host's budget and what it may not know; the static face with scripts
off; the independent reader on every pack; validity.
