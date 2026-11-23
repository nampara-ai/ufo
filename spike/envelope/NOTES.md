# Envelope spike: notes

Three sections, in the order they were written. The first two are the
record of the first version (2026-11-22) and are kept as written, with a
dated remark wherever the third reverses them. The third (2026-11-23) is
the revision after the owner's five decisions. PLAN.md describes the spike
as it now stands; FINDINGS-STATUS.md says what became of each of the 35
findings numbered below.

## 2026-11-22: the kernel's write path, and tools (pieces 1 and 2 of PLAN.md)

What was added to `spike/kernel`: `write.rs` (new: `propose`, the replay, a
blob writer, the object map, base64), the append in `pack.rs` (`commit`:
records, index, head, then the state found afresh), `block_at`, `handler`
and `press` on items in `layout.rs`, seven exports in `lib.rs`. Tests:
`roundtrip.mjs` (the acceptance steps the kernel can do alone) and
`more-edits.mjs` (eleven edits in a row, each against a model).

### How `propose` works

1. Arguments, the head commit (`v` must be 1), the object (a `ufo.text`
   with no `syntax`, **X3**), **X1** on its `chars`, the positions.
2. One `splice` by element identity, made by cutting the runs of `seq` at
   `lo` and `hi`: `del` (runs), `old` (the characters there), `ins`,
   `after`. The new `seq` comes out of the same cut, tombstones kept, runs
   merged. New elements are numbered from 0 by the new change.
3. Inline spans that had an extent and now have none: one `set` each,
   `key: ["spans", k]`, `old` the span, no `val` (5.1).
4. The operations are encoded as the `work` will be, decoded again, and
   applied to the parent state by a second piece of code (`replay`) that
   knows only the rule of 1.7: it finds elements by identity among the
   expanded elements, checks `del` is live and `old` matches, inserts after
   `after`, and builds runs its own way. Its `p` and `seq` are compared with
   the new state by their canonical encodings. Any difference refuses the
   change; nothing has been written.
5. Records: the text's revision (made from the old node: `rev`+1, `prev`,
   `by`, `salt`, `p`, `seq`; everything else carried), the work's blob and
   its 48-byte opening, the change object, the object map rebuilt from all
   its entries, the commit.
6. `Pack::commit` appends the records the pack does not already hold, an
   index, and the head; then finds the state afresh from the bytes (2.3),
   which checks the head it wrote (**P3**). If that does not give the new
   commit, the bytes are taken off again.
7. The text is read back the ordinary way and compared with the state
   meant; if it differs the append is taken off and the change refused.

The 64 `random` bytes: change identity, the text revision's salt, the
change revision's salt, the opening's salt, 16 each, in that order.

### The index (2.4): what was done

An index is written with every commit (the text requires one only past
1 024 records or 16 MiB uncovered). It covers from the end of the newest
index's coverage (or the signature) to its own offset: every chunk and
node frame there is hashed and listed, lowest offset first for a repeated
record. Then the merge rule as written: while the index before has no more
than twice as many entries as the merged one so far, its entries are taken
in and its previous-index offset taken over. Entries are sorted by hash and
a hash listed twice keeps its lowest offset. In `edited.ufx` the first
index (10 entries) is absorbed by the second (7 new, 17 merged, previous
0). In `edited-many.ufx` the chain at the end is 18 entries, then 79.
The head's index offset names the new index; its previous-head offset
names the head that gave the state.

### Checked by the independent reader

The reader written from SPEC.md alone (`readertest2`, copied, not
modified) on the two packs written here:

- `edited.ufx`: state by the final head, `d34606c3…`; 17 records, all
  reachable and verified; index: one, 17 entries, no problems; both commits
  conservation `ok`; nothing reported malformed, inconsistent or missing.
- `edited-many.ufx`: 12 commits, 97 records, all verified; index chain
  18 → 79, no problems; all twelve conservation checks `ok`, including the
  change with a `set` that removes a span, the three removals with no
  `origin`, and the commits whose `chars` and `seq` are in blobs of two
  chunks (the reader checks the blob's shape against its bytes).

### What in SPEC.md was unclear, or had to be decided

1. **Where the new items of a replacement go** (1.7, 5.1). A splice puts
   `ins` after `after`; the text does not say which element a writer
   should name when it replaces a stretch. If it names the element before
   the stretch, then replacing the first characters of a block puts the new
   text in the block *before*: the block's start is "just before its first
   element", that element is now a tombstone lying after the new items, and
   a boundary on a tombstone resolves after them (4.3). 5.1 covers "text
   typed at the very start of a paragraph" (move the boundary with a `set`)
   but not a replacement. Decided: with anything removed, `after` is the
   **last removed element**. Every boundary fixed to a removed element then
   resolves just before the new text, so the text stays in the block it
   replaced part of, and no `set` is needed. This relies on "it may be a
   removed element" covering an element the same splice removes; the
   independent reader accepts it. The specification should say which.
2. **An insertion at the start of a block, with nothing removed.** It joins
   the block before (5.1's convention), and at position 0 it lies before
   the first block, in none. `propose` has no way to ask otherwise, and the
   text does not say which boundaries the `set` of 5.1 should move: the
   block's start alone would leave it overlapping the block before, whose
   end is the same boundary. Not handled.
   *(2026-11-23: handled. Both boundaries are moved, each with a `set`. See
   the revision.)*
3. **"An inline span left with no extent"** (5.1) is not defined. Taken as:
   both boundaries resolve and the first is not before the second, where
   before the change it was. Removed with a `set` on the path
   `["spans", key]` with `old` the whole span. Whether that `set` is
   required for conservation, or only asked of a text writer, is not said;
   the independent reader accepts the change with it.
4. **L1 and a replacement that repeats what was there.** If `ins` begins or
   ends as the removed stretch does, must the splice be reduced to the
   difference? L1 says operations are computed from the content before and
   after, which could be read either way. Not reduced: what the person put
   is new elements, attributed to them, even where it equals what was
   there. An `ins` equal to `old` is accepted.
   *(2026-11-23: reversed by the owner. Every edit is reduced to its
   difference; an `ins` equal to what is there is refused as "nothing to
   change". See the revision.)*
5. **`origin` on a change that only removes** (1.7: "absent if the change
   introduces none"). PLAN.md asked for an origin always; the kernel omits
   it when nothing is inserted. The `history` projection then prints
   `basis=unknown` for that change, which reads badly for a removal a
   person plainly made: the actor is still there, but nothing says "by
   person". Worth a sentence in 5.4 or Appendix B.
   *(2026-11-23: the kernel now writes the origin on every change it makes
   for a person, a removal included.)*
6. **Keys of an `obj` node this document does not list**, when a new
   revision is written. Appendix C says they are "preserved", which is
   said of copying. Carried into the new revision.
7. **Where a value is kept in the new revision** (1.4). SHOULD go outside
   past 4 096 bytes of encoding; nothing is said of a value that was
   outside and is now small, or of whether the form should be stable.
   Decided: outside if it was, or if its encoding exceeds 4 096 bytes;
   never moved back in. A veiled `chars` or `seq` is refused (it would need
   a salt and a decision about who may veil).
8. **The merge rule of 2.4.** "No more than twice as many entries as the
   merged index so far": taken before duplicates are dropped. "Covers from
   where that one began" has no field to write; it follows from the
   previous-index offset taken over. The non-normative generator
   (`tools/vectors/generate.py`) merges at most once, not "repeatedly".
9. **A record the pack already holds** is not written again (2.1 allows
   either). "Holds" means read back by hash and verified, not merely
   listed by an index (**P9**).
10. **"Never reused"** (1.5, of an identity). A writer can check the
    current object map and the `seq` it is editing; it cannot check
    identities of dropped objects or elements forgotten. The kernel refuses
    a change identity found in either of the first two and otherwise trusts
    the host's random bytes.
11. **`del` runs.** The rule that adjacent runs are written as one is said
    of `seq`. In `del` the kernel merges by change and number alone, so one
    run may name elements that are not neighbours in the sequence (another
    change's elements lie between); `old` is in sequence order. The
    independent reader accepts it; the text could say whether it is meant.
12. **`actor.with`** (Appendix C requires `name` and `version`): written as
    `ufo-spike-kernel`, `0.0.0`. `actor.who` and `origin.who` are both
    `{name}` from `who`; a principal with no key is allowed by the schema.
13. **2.2 steps 3 and 5 (durable)** mean nothing inside the kernel: it
    holds the pack in memory and the host saves it. The order of the bytes
    is the order of 2.2.

### Limits of what was built

- One kind of edit: a replacement by positions in the `chars` of a
  `ufo.text`. The replay knows `splice` on an existing text and `set`; not
  `new`, `drop`, `forget`, a splice that creates its property, bytes,
  lists or counts.
- A pack recovered by scan (bytes after its last valid head) is not
  written to: **P7**'s search and truncation are not implemented.
- A span to be removed that is kept outside the node, and veiled values,
  are refused.
- The blob writer's tree above one group (a blob of more than about a
  thousand chunks) is written but was never run. One and two chunks were,
  and read back by both readers.
- The object map is rebuilt whole and re-encoded at each commit (unchanged
  nodes are not written again). An interior node (more than 32 objects)
  was not exercised by these packs.
- Sequences are expanded element by element in the replay and in `block_at`;
  the replay finds each element by a linear search. Fine for a page, not
  for a book.
- No lock (2.2 step 1): one kernel instance holds the pack.

### Size

Same build and flags as SIZE-NOTES.md (`wasm-opt -Oz …`, raw DEFLATE 9).

| Build | After cargo | After `wasm-opt -Oz` | DEFLATE |
| --- | ---: | ---: | ---: |
| Before (SIZE-NOTES.md, the default build) | 180 147 | 154 154 | 71 742 |
| Now | 214 026 | 183 191 | 85 624 |
| Difference | +33 879 | +29 037 | +13 882 |

Measured once, earlier in the work, by cutting calls: without `propose`
(and so without the append) 159 384 and 74 161; without base64 as well
158 449 and 73 719. So the write path is about 23 700 optimised and 11 400
deflated, the tools and `block_at` about 4 300 and 2 000, base64 about 900
and 400. The write path is about 60 bytes a line, heavier than anything
but queries: it builds many small maps by hand (`map(vec![…])`), clones
values freely and encodes to compare. None of that was tuned. No
`core::fmt` came in (`strings | grep -c 3fmt`: 0), no dependency was
added, and the library sort and tree maps are still unused.

Lines (`git diff --numstat`, and `wc -l` for new files): `write.rs` 401
new; `pack.rs` +102 −2; `lib.rs` +60 −2; `layout.rs` +49 −3;
`binding.mjs` +10; `roundtrip.mjs` 100 and `more-edits.mjs` 48 new.

## 2026-11-22: the web envelope (pieces 3 and 4 of PLAN.md)

What was added: `make.mjs` (writes `name.ufx.html`; `--dense` for the
denser carriage of ENCODING.md), `page.html` and `page.css` (the fixed
markup and style), `shell.mjs` (the reader shell: faces, the edit box,
saving), `dense.mjs`, `test.mjs` (Playwright, Chromium only),
`encoding-measure.mjs`, `phone/` (a kit for testing on real phones, which
was not done here). `binding.mjs` gained `unbase64`, `base64`, `paint`,
`boxes`, `textAt`: plumbing for a page, nothing of the format.

**Tested only in headless Chromium** on Linux: desktop from `file://`,
from an `http://127.0.0.1` origin, and Chromium emulating an iPhone 14 and
a Pixel 7 (viewport, touch, user agent). No Safari, no WebKit, no Firefox,
no real phone. `navigator.share` was not exercised.

### How the page is put together

In order: doctype; the plain-text head (a comment: title, what the file
is, date, how to open); `head` with charset, title, the policy, viewport,
one `style`; the static face; the player's empty markup, hidden; the pack,
the tools pack and the kernel as script data blocks; one module script
(the binding, then the shell). The policy as shipped:

    default-src 'none'; script-src 'sha256-…' 'wasm-unsafe-eval';
    style-src 'sha256-…'; base-uri 'none'; form-action 'none'

Nothing else was needed in Chromium: the download through `a[download]`
with a `blob:` address, canvas, WebAssembly and `DecompressionStream` all
work under it, from `file://` and from `http:`. `test.mjs` checks that an
inline script put into the page does not run, that `fetch` is refused, and
that the page makes no request but for itself.

### How saving works: the page as its own template

*(2026-11-23: superseded. The owner rejected saving that depends on the
browser's reconstruction of the page. Nothing below is how it works now;
see the revision.)*

A page opened from `file://` cannot read its own bytes; what it has is the
document as parsed. So `make.mjs` writes the page **exactly as the HTML
serialisation algorithm would write it back**, and the first thing the
script does, before it touches the document, is take
`<!DOCTYPE html>` + the comment + `documentElement.outerHTML`. That string
is the file, byte for byte (asserted in the test for the file as made, as
saved, and saved twice). It is cut at four pairs of delimiters — `title`,
the static face's `h1`, the static face's `pre`, the pack's `script` — and
saving joins the pieces round a new static face and the new pack in
base64, with the date in the head comment replaced. The kernel text, the
tools text, the style and the script are carried inside the fixed pieces
untouched, so the hashes in the policy still match and a saved file is a
full envelope that saves again.

What "exactly as serialised" costs the exporter: attributes in double
quotes; `hidden=""`, not `hidden`; no `<` or `>` in attribute values
(serialisers now escape them; older ones did not); `&nbsp;` for U+00A0 and
`&amp; &lt; &gt;` in text; no white space between `<html>` and `<head>`,
none after `</body>`, no final line break (the parser drops the first and
moves the others into `body`); the line breaks after the doctype and the
comment are written by the shell, since the parser drops them; a `pre`
whose text does not begin with a line break.

### Where SPEC-TRAVEL 13.2 and SPEC-PLAYER 9 did not work as written, or did not decide

1. **"Bytes with four gaps, in that order"** (title, static face, pack,
   kernel). Counted in the page: the title stands in three places (the
   plain-text head, `title`, the static face, which must show it to be of
   use); the date of export is a fifth thing that changes; and the kernel
   is not a gap for a page saving itself (same kernel), only for an
   exporter carrying a newer one (**E8**). The plain-text head is listed
   among neither the fixed parts nor the gaps.
2. **"The binding supplies it: the fixed parts of the very page it is
   running in."** True only if the exporter writes the page in serialised
   form, as above; the text does not say so, and a page written any other
   valid way cannot give itself back. It also has to be taken before any
   script changes the document, and anything else that changes the
   document first (a browser extension, a previewer's injected style)
   would end up in every later copy. Not tested: whether Safari serialises
   identically.
3. **"To write an envelope the kernel fills the gaps … a binding contains
   no envelope-writing logic."** The kernel has no such export. The shell
   does it: about ten lines that know four pairs of delimiters, escape
   text for HTML, and base64 the pack. For the kernel to do it, it would
   have to escape text for HTML (the title and the static face), which is
   knowledge of HTML that "the kernel therefore contains no HTML" rules
   out; or the escaping stays in the binding, and then the binding is
   writing part of the envelope.
4. **Read-back (E1).** The binding gives the kernel the pack's script
   text and `find_pack` decodes all of it at once; "reads bytes on request
   by decoding the base64 group that holds them" is not built. At open the
   pack therefore exists as the script's text, as decoded bytes, and as
   the kernel's copy. The kernel's own text also exists twice (the script
   element and the template string).
5. **The kernel's base64 is decoded by the binding** (`atob`); the kernel
   cannot decode itself, and the text does not say who does. "Labeled with
   the hash of the uncompressed component" names no attribute
   (`data-sha256` here) and does not say whether a binding must check it.
   It is checked where `crypto.subtle` exists, which is not on a plain
   `http:` origin other than localhost.
6. **The policy.** "Permits only the envelope's own scripts, identified by
   hash": the static face and the player also need a style sheet, which
   needs its own hash (or `style` attributes, which a hash cannot allow).
   The data blocks need no hash because they are not executed. A policy in
   a `meta` cannot say `frame-ancestors` or `sandbox`.
   `'wasm-unsafe-eval'` is a newer keyword; a browser that does not know
   it refuses WebAssembly under this policy. **E4**'s list of what a
   browser must offer does not mention it, nor canvas text metrics
   (`fontBoundingBoxAscent`), nor downloading a `blob:`.
7. **The tools universe is carried beside the pack**, in a second data
   block of type `application/x-ufo-tools`, not inside the pack under
   `components.tools` as 9.6 and 13.2 have it. A deviation of the spike.
8. **The static face's order.** 13.2 puts the document's text first and
   the explanation after it. A previewer shows the top of the page, and
   under a long document the instruction would never be seen; here the
   explanation comes first. 13.2 also does not give the static face the
   title.
9. **"With its instruction for opening the file in the browser."** There
   may be no such instruction to give on a phone: as far as is known, iOS
   offers no way to open a web page stored on the phone in Safari. The
   static face here says so and suggests a link or a computer. Untested;
   `phone/PHONE-TEST.md` is how to find out.
10. **The plain-text head** needs more than "any run of hyphens in the
    title reduced to one" to be a valid comment: it may not begin with `>`
    or `->`, hold `<!--` or `--!>`, or end with `<!-`. Here `<` and `>`
    are taken out of the title as well.
11. **E2: "a reader MUST check" that the root hash is preserved.** There
    is nothing in the envelope to check it against: the hash is stated
    only by the pack. The page shows the state it found; the test
    compares.
12. **E5 names no file name** for what is saved. Here: the page's own name
    with `-edited`, then `-edited-2`, and so on.
13. **E12, "show what will travel", before any export:** not built. The
    tools pack's Save acts `export` at once.
14. **K6, "it adds no code to the binding".** As built, the shell holds
    all of the tools' meaning: a store for what handlers `set`; that
    `face` chooses the `as` of `sample`; that `editing` makes a tap choose
    a block and open a box; asking for a name; calling `propose`; and
    `export`. That is most of its 76 lines. The tools universe cannot show
    its own state (which face is on), so the shell underlines every tool
    whose handler would set what is already so, found by asking `press`
    for each tool's handler, which works only because `press` does
    nothing. And nothing turns editing off: the handler is
    `{set: "editing", to: true}`.
15. **An edit replaces the whole paragraph.** The box holds the block's
    text and Done proposes one splice over all of it, so after changing
    one word `why` attributes the whole paragraph to the editor. 9.6 and
    the `text` capability speak of committed edits of a caret, and **L1**
    of operations computed from before and after; neither says who reduces
    a replaced block to what actually changed, the kernel or the host.
    (NOTES above, item 4, is the same question from the kernel's side.)
16. **`time` and `random` are arguments of `propose`**, not the host
    interface's `time()` and `random()` (9.3); the kernel imports only
    `host_measure`.
17. **Hit testing is in the binding** (`boxes`, `textAt`: which text item
    lies under a point), though 11.1 lists hit testing with composition in
    the kernel. The kernel has no export for it. The binding's version
    knows only item positions; it hands the item's `src` back to the
    kernel.
18. **One canvas for the whole face.** Fine for this document. A long one
    exceeds what a phone allows a canvas (a limit of about 16.7 million
    pixels is commonly cited for iOS: about 4 800 CSS pixels of height at
    this width and density). A real binding draws the rows in view.
19. **Lines and pages depend on the device.** `measure` is the host's, so
    the same universe breaks lines, and therefore pages, differently on
    two devices. Nothing is wrong by the text; "page 3" is not the same
    place everywhere.
20. **Budgets (11.1).** The script as shipped is 18 302 bytes, over the
    16 KiB for "the web binding, as shipped": the binding proper is
    10 529 and the shell 7 774, unminified with comments (7 274 gzipped).
    11.1 does not say whether a shell counts, or whether shipped means
    minified. Lines: binding 119 (100 without blank and comment lines),
    shell 89 (76), against 600; but these are long lines.
21. **The Nu HTML Checker and the policy.** It warns that each data block
    "violates Content Security Policy" (they are not scripts to a
    browser), and it compares hashes against the script and style text
    *trimmed*, so a script that begins or ends with a line break is
    reported though browsers accept it. The page now has no line break at
    either end of its script and style. Warnings, not errors.
22. **Nothing drawn is accessible.** The faces are canvas; the static
    face, which is real text, is hidden once the player runs.

### Results

`node spike/envelope/test.mjs` (output kept in
`spike/out/envelope-test-output.txt`): opened, three faces, a paragraph
edited through the tools with `why` naming the change, `by=person` and the
name, saved by the page, reopened with the same state, edited and saved
again, and reopened again — on desktop Chromium from `file://`, from an
`http:` origin, and in the two phone emulations with touch; the static
face with scripts off; the dense variant. Nothing in the working universe
carries `press`, `press` of a working span key gives null, and a tap on
the document with editing off does nothing.

The independent reader (`readertest2`, copied, not modified) on the packs
taken out of three files saved by the browser: state by the final head,
equal to what the page showed; every record reachable and verified; index
without problems; conservation `ok` for every commit, including the ones
made in the browser; nothing reported.

Validity: Nu HTML Checker 26.11.20 (Java 21): 0 errors on the envelope as
made, as saved, and saved twice; three warnings each, item 21.
html-validate 11.21 with its recommended rules less `attribute-empty-style`
(which asks for `hidden` where the serialised form is `hidden=""`): no
messages.

### Size of the envelope of `compose.ufx`

| Part | Bytes |
| --- | ---: |
| Kernel: 183 191 optimised, 85 624 deflated, in base64 | 114 168 |
| Pack: 9 339 bytes, in base64 | 12 452 |
| Tools pack: 3 919 bytes, in base64 | 5 228 |
| Script: binding 10 529, shell 7 774 | 18 302 |
| Static face: the document's text, escaped | 1 135 |
| Style | 1 742 |
| Fixed text: plain-text head, `head`, the explanation, the player's markup, tags | 2 966 |
| **Total** | **155 993** |

152 KiB against 256 KiB for an envelope of one paragraph (this document is
about a page). After one edit the saved file is 163 248 bytes: each edit
here appends about 5.4 KB to the pack (records, an index, a head), which
is 7.2 KB in base64.

## 2026-11-23: the revision after the owner's five decisions

The five decisions and what was done are at the head of PLAN.md. This
section is what was found in doing it. FINDINGS-STATUS.md goes through the
35 findings above.

**Tested only in headless Chromium** on Linux, as before: desktop from
`file://`, from an `http://127.0.0.1` origin, and Chromium emulating an
iPhone 14 and a Pixel 7. `test.mjs --engine firefox|webkit` exists and was
not run: those engines are not installed here.

### What was added and removed

Kernel: `tool.rs` (343 lines, new), `diff.rs` (96, new), `envelope.rs`
(60, new); `write.rs` 401 → 459 (`git diff --numstat`: +114 −56),
`layout.rs` 836 → 895 (+65 −6), `lib.rs` 362 → 382 (+55 −35), `query.rs`
517 → 520 (+4 −1). Envelope: `host.mjs`, `mkpack.mjs`, `tools.ufx`,
`skeleton.html` (was `page.html`), `parts.mjs`, `envelope.mjs` new;
`make.mjs`, `test.mjs`, `roundtrip.mjs` rewritten; `shell.mjs` removed;
`--dense` removed from `make.mjs` (`dense.mjs` and `encoding-measure.mjs`
stay as the measurements behind ENCODING.md). `binding.mjs` is now only
the Node harness of the tests and vector scripts: it gained `start`,
`input`, `envelope` and the two new imports, and lost `press`.

### Found in doing it

R1. **The skeleton cannot be carried unchanged in a script element and
    also write `<!--` and `</script`.** The owner's definition has the
    skeleton as a part put in unchanged, and refuses a part put in
    unchanged that holds either. One gap was added, `{{<}}`, which gives
    `<`; the skeleton writes `{{<}}!--` and `{{<}}/script>`. The
    alternative was to carry the skeleton escaped in an ordinary element,
    which changes more of the definition.

R2. **`document.title` is not the text of the title element**: it strips
    and collapses white space. A title with two spaces together would not
    come back as it went in, and the saved file would differ from the
    made one. `make.mjs` writes the title already collapsed. The function
    itself does not care.

R3. **A difference cannot say where typed text went when it repeats its
    neighbour.** "Note: " typed before "Nothing" and "e: Not" typed after
    "Not" give the same text. With the prefix set aside first, the kernel
    writes the second: the text and the block are right, the three letters
    "Not" attributed to the person are not the three they typed. Setting
    the suffix aside first would instead misplace text typed at the end of
    a paragraph that ends as it does (a sentence added after a full stop),
    which is commoner. Only the host knows where the caret was: 7.6 has
    the host report "the range replaced and the text that replaced it",
    and the owner's decision has it report only the new text. Both could
    hold: the range as a hint the kernel checks against the difference.

R4. **`editable` on a Portal.** 7.6 marks a text primitive, or a region of
    one, `editable`. The tools universe cannot mark the subject's texts,
    so here the Portal onto the subject carries `editable` (a formula over
    state), meaning: what is shown through this accepts text entry. That
    is what makes "editing is on" description and not kernel knowledge.
    The specification does not say a Portal may carry it.

R5. **The plain-text face as a `face` hint.** 7.8 has `face` name a face
    object or a `medium` hint. The plain-text face (8.3) is not a face
    object. Here the hint `text` means it. The kernel draws it as text
    items in a monospaced font, broken to the width, so it is on the
    canvas like everything else (and no more accessible than the rest).

R6. **K6, "it adds no code to the binding and none to the kernel".** It
    now adds none to the binding. It added to the kernel: formulas and
    state and handlers, which a kernel has anyway; but also things that
    are the reader's and had nowhere else to live: the words it says about
    the last act ("Changed, and recorded as change … by …", "Made … bytes,
    holding state …", "Not changed: …"), drawn above the subject as the
    reader's own label rows; the rule for the saved file's name; asking
    the host for the person's name. A tools universe cannot yet say these:
    it would need text whose characters are a formula over `ask`.

R7. **`ask`.** 7.6: "an action that needs something only the person can
    supply … makes the reader ask for it." The host interface has no
    function for asking a person a question. Here it is an effect, `ask`
    `{label}`, answered by an input event `answer`; the host shows the
    browser's prompt. A page embedded where prompts are suppressed would
    never get a name, and no edit would start.

R8. **The kernel holds the parts.** To make an envelope the kernel needs
    the script, the style, the skeleton, the tools and its own text, so
    the host hands all of them over at `start` and the kernel keeps them:
    about 150 KB of text in its memory that it never looks at, its own
    130 KB among them. Worse than item 4 of the envelope list, not better.
    A `store`-like capability that reads a named part on request would
    avoid it.

R9. **One surface.** The whole screen is one canvas: the toolbar scrolls
    away with the document. Resizing while the editing surface is mounted
    redraws under it and does not move it. A press on the canvas while it
    is mounted does nothing (the host's two buttons end it).

R10. **What a host must still decide.** The editing surface has Done and
    Cancel buttons and their words are the host's. `deliver` is a download
    through `a[download]`; the share sheet and the fallback link of the
    first version are gone. Whether a host may offer sharing for a
    delivered file is the host's business and nothing in the kernel asks.

R11. **The removal with an origin** departs from the words of 1.7
    ("absent if the change introduces none"). The independent reader
    accepts it.

R12. **Formulas only where the reader presents tools.** A formula in a
    working universe is not evaluated at all (its property is as if
    absent). That is a limit of the spike, not a reading of 7.3: a working
    universe is entitled to formulas over its own state. F6 needs only
    that `arg("subject")` there is an error value and that handlers there
    are not run.

R13. **The Nu checker** now warns four times, not three: once more for the
    skeleton's data block. Still no errors.

### Results

`node spike/envelope/test.mjs` (output in `out/envelope-test-output.txt`,
results in `out/envelope-test-results.json`): 144 checks, all passed. The
kernel alone (`roundtrip.mjs`, `more-edits.mjs`); the host's budget and
forbidden words; then on desktop Chromium from `file://`, from an `http:`
origin, and in the two phone emulations with touch: opened, the file on
disk is `envelope(parts)`, three faces, one word edited and one word
attributed, a word typed at the start of a paragraph, saved, the saved
file is `envelope(parts)`, reopened, two words edited apart, saved again,
reopened; F6 in the page; the static face with scripts off; the
independent reader on nine packs (`out/reader-verdicts.txt`): every
conservation check `ok`, nothing reported; Nu and html-validate.

The page is driven only by clicks or taps on the canvas, typing in the
textarea, the two buttons and the browser's prompt. `globalThis.ufo` is
`{drawn, query}`: the list last drawn, and the kernel's read-only queries.

### Size

| Build | After cargo | After `wasm-opt -Oz` | DEFLATE |
| --- | ---: | ---: | ---: |
| First version (above) | 214 026 | 183 191 | 85 624 |
| Now | 245 806 | 210 911 | 98 276 |
| Difference | +31 780 | +27 720 | +12 652 |

Not broken down by part. One thing was measured: the library's search of
a text for a text (`str::find` with a text pattern, used three times)
cost 2 614 optimised bytes and 1 132 deflated, and was replaced by a
search of bytes. No `core::fmt` came in (`strings | grep -c 3fmt`: 0), no
dependency was added, the library sort and tree maps are still unused.

Lines (`wc -l`): 5 727 in all; 434 generated; 5 293 by hand, of which 142
are measuring stubs.

| Part of the envelope of `compose.ufx` | Bytes |
| --- | ---: |
| Kernel: 210 911 optimised, 98 276 deflated, in base64 | 131 036 |
| Pack: 9 339 bytes, in base64 | 12 452 |
| Tools universe: 6 256 bytes, in base64 | 8 344 |
| Script: `host.mjs` | 9 827 |
| Skeleton, as a part (it is also the fixed text of the page) | 2 374 |
| Style | 1 206 |
| Static face | 1 135 |
| Fixed text of the skeleton with its gaps filled, the title twice, the date, the hash | 2 430 |
| **Total** | **168 804** |
