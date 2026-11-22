# Rationale

Why the UFO format exists and why it is shaped the way it is. The
[specification](SPEC.md) says what; this says why. It is written for anyone
deciding whether the design deserves their attention.

## The ambition

The aim is an open, universal primitive of computing, of the kind the PDF
became: a format owned by no one, readable by anything, that outlives every
application that writes it.

One universe can present as anything a computer can present — a document,
plain text, an image, a video, audio, data, a diagram, a 3D scene, an
application, a game. It stands alone: it carries its own player and tools
and opens with nothing installed but a browser. Its programs are complete
single-purpose machines that run live inside other universes. Their machine
code is maintained without a source tree. Every byte has a known origin.
Any universe, however large, can be navigated from overview to exact bytes
at a cost that scales with the question. Universes nest and link without
limit. Transmutation by AI is an operation of the format itself.

Text is implemented first. Nothing else is deferred in design. The
simplifications described below are simplifications of mechanism; none
gives up any of this.

## The problem

A single piece of real work is scattered across a word processor, a
spreadsheet, a slide tool, a drive, email, chat, a tracker and several AI
assistants. Each keeps its own format, history and permissions. The context
that gives the work meaning — why a decision was made, what supports a
claim, who or what wrote a paragraph — is split among them and mostly lost.

Language models can now turn any form of information into any other. They
cannot see across those walls. So people act as couriers, copying fragments
between tools and re-explaining context that already exists somewhere else.

Agents have gained standard ways to call tools. There is no standard for
the material they work on: something that carries its own context, history,
permissions and behavior wherever it goes. That is what this format is for.

## Description, not depiction

Most file formats encode one medium. A video file is a video; turning it
into a document means making a second file that begins to drift from the
first at once.

A UFO stores what the work *is* — words and structure, data and
relationships, shapes, timing, sound, behavior — and treats every medium as
a way of presenting that. This is ordinary in particular fields. One
musical score yields many performances. One spreadsheet yields a grid and
several charts. One CAD model yields drawings, renders and toolpaths. What
has not existed is one description that does this across media, in one
portable file, with its history attached.

A presentation of a universe is called a face. A face is *sampled* (computed
on demand), *carried* (a stored rendition that records what it was made
from) or *transmuted* (new description written by a model, with its sources
pinned). Only the last adds information, and it is always marked as what it
is.

## A small player, not a large one

A file that opens anywhere must bring its own reader. The obvious way to
build a universal reader is to bundle a decoder for every format. That
reader grows without limit, and every file would pay for all of it.

The design avoids this in two moves.

First, native content is description built from eleven primitives, so
presenting it needs one small interpreter, not a library of decoders.
Second, the encodings that do exist are handled at the edge: common images,
audio, video and fonts by the host platform, which already decodes them
well; everything else by converting it to description once, on import, and
keeping the original bytes.

Five ways of going wrong are refused by rule, because each looks like
progress:

- the same logic written several times in several languages;
- one file carrying everything that might ever be needed;
- a small core surrounded by an ever-growing set of plugins;
- the same content stored several times in different formats;
- layers of compatibility code wrapped around one another.

The specification's budgets (SPEC §12) and its deletion test (SPEC §5.4)
exist to hold that line. A proposed addition must show that it cannot be
expressed as data, as a formula, or as a composition of what exists.

## One kernel

The program that interprets the format is written once, compiled once to
WebAssembly, and run unchanged in browsers, native readers and agent tools.
A second implementation inside the reference readers is forbidden. This
removes a whole class of defect — two implementations that disagree — and
makes behavior, including floating-point results, identical everywhere.
Independent implementations by others are welcome and are measured against
the same conformance suite.

## A pack of hashed records, not a database

The file is an append-only sequence of immutable records, each named by the
hash of its contents, in the manner of git. A universe's state and entire
history are fixed by one hash, which a signature can cover.

An embedded database was the obvious alternative and was considered
seriously. It was not chosen because every travelling file would have to
carry the database engine; because a database file has no canonical byte
form, so integrity and signatures would need a second scheme above it; and
because the data is append-only by nature, which is the one case where a
database's machinery is not needed.

What a database would have provided is supplied directly: crash safety by a
checksummed trailer, indexed reads by a derived index, strict limits and
mandatory fuzzing for hostile input, and compaction that preserves every
hash (SPEC §2–§3). The pack is kept simple enough that an independent
reader can be written from the specification in a weekend. That, rather
than a long history, is its claim to outlast its authors. A reader is free
to build a database as a local, disposable cache; it is never the format.

## History that cannot be detached

Every change to a universe is itself an object in it, and the chain of
changes is the only way the universe moves forward. Recording history is
therefore not a feature that can be skipped or lost in transit.

Three facts are kept apart and never merged: *origin* (who or what
contributed something), *evidence* (what supports it) and *decision* (what
a person chose to do with it). AI origin is not proof of error. Human origin
is not proof of truth. Acceptance does not certify accuracy.

Origin is honest about how it is known. It is *witnessed* when the software
that introduced the content recorded it at that moment, *inferred* when it
was worked out afterward by some stated method, and *unknown* otherwise.
Readers must show the three differently. Nothing is ever attributed by
resemblance and presented as fact.

## Private drafts, public authorship

The record that makes a file trustworthy also contains every prompt and
discarded draft. Sending all of that by default would make people afraid to
share. Sending none of it would discard the provenance the format exists to
carry.

So a file that leaves its owner carries its current content and the
attribution of that content — who and what wrote it, on what evidence, with
what decisions — and withholds working history unless the owner includes
it. Because everything is named by hash, withholding a record leaves its
hash in place: the chain of authorship still verifies, and nothing reveals
what the withheld drafts said. The owner's own copy keeps everything.

## Opening is not executing

Formats that let documents run code with authority became attack vectors
and were eventually shut out of platforms. Here, nothing runs because a
file was opened. Programs run only in a WebAssembly sandbox, metered, with
a virtual clock, able to call ten functions. Anything more is a capability
the file may request and only the person may grant, narrowly and revocably.
A file cannot grant itself anything, and no clever mechanism in the format
depends on defeating a platform's security.

## Machine code as description, with a record instead of source

Source code does two jobs: it is input to a compiler, and it is the record
of why the program is the way it is. When the maintainer is a language
model, the first job can be done directly and the second can be done
better.

A Compute-let's code is described the way everything else in a universe
is. A function is an object. Its body is a sequence of statements, each one
tree in WebAssembly's own instruction vocabulary, and each an element with
a permanent identity and an origin, exactly as each character of a text
is. Code is edited with the same four operations as a paragraph. The kernel
prints the bytes from the description by fixed rules, and what runs is
always what it printed. Nothing is stored twice, so nothing can drift.

There is still no source tree: no files of text that a person must read
and a compiler must parse, and nothing whose meaning lies outside
WebAssembly's own definition. What a maintainer reads is the statements,
one to a line, each marked with the change that wrote it. What it writes is
a statement, or three. What the record of a change holds is the statements
removed and the statements put in their place, with the prompt, the model
and the tests that came with them.

The first drafts did this differently, as the project's founding
intentions described it: the module's bytes were the only stored thing, and
a "printer" applied a vocabulary of twelve operations to them, each
replacing a whole function. That design was tried, with models, before it
was replaced; the next section but one has the numbers. Whether either
design scales from a game of a few hundred instructions to a large program
is still an open question.

## What was invented, and why existing things did not fit

The project uses established standards wherever one truly fits: SHA-256,
deterministic CBOR, DEFLATE, Ed25519, WebAssembly and its text format,
HTML, base64, MP4 and PNG containers, QR codes, the glTF object model for
3D scenes, the Model Context Protocol, flicks for time. Where none fits,
the smallest thing that closes the gap was designed, and is specified in
full. Each is recorded here so it can be challenged.

| Invention | Existing options, and what each misses | SPEC |
| --- | --- | --- |
| **Content-defined chunks and tree for blobs** | Fixed-size chunks rewrite everything after an insertion. *LBFS*, *Borg*, *restic* and *FastCDC* established content-defined chunking; the gear rolling hash of FastCDC is used in its simplest form, with every parameter and the table fixed by the format so that a blob's hash does not depend on who stored it. The tree above the chunks is divided by the same idea, as in prolly trees. | §1.4 |
| **Veiled indirects** | Salting content defeats deduplication; leaving hashes bare lets short content be guessed. A commitment on the reference, opened by a small record that can itself be withheld, gives both. | §1.4 |
| **The pack** | *SQLite*: no canonical bytes to hash or sign; its engine in every file. *Git packfiles*: delta compression and a separate index file make a weekend reader impossible; not built for one growing file. *ZIP*: no content addressing; central directory rewritten on every change. *CAR (IPLD)*: content-addressed, but no commit trailer, crash recovery or index. | §2, §3 |
| **Permanent element identities in every sequence** | *Position-based edit logs* (and this project's own first drafts) needed four interlocking mechanisms to keep attribution and structure attached to an edited sequence: runs, self-carried regions, an insertion bias and history replay. *Automerge* and *Peritext* show the better decomposition: give every element a permanent identity and attach everything to identities. Those systems are replication libraries with their own storage and no notion of attribution, evidence or a hashed, sealed history; the idea is taken, the format is not. Here an element's identity is the change that inserted it and a number, so identity is attribution, and removed elements stay as markers so anchors can always be placed. | §1.7, §4.3 |
| **Work kept apart from attribution** | *Git shallow clones* drop history wholesale, with its authorship. *Redaction* breaks hashes. A change keeps who and what in the object and the operations in one salted blob beside it, so a copy can withhold what earlier drafts said and still verify authorship. | §1.7, §9.3 |
| **Three kinds of axis, each resolved without history** | *W3C Web Annotation selectors* re-find text by quoting it, which is matching. *Media Fragments* address time and space but say nothing about edits. *Operational transformation* replays history. Here a sequence region names elements, a continuous region is mapped through a frame the object holds, and a keyed region names keys: all three resolve against the current state alone and never guess. | §4 |
| **Pins and one staleness test** | Build systems track staleness of files, not regions; document formats do not track it at all. A pin's digest follows references, so a pin to a container notices a change in anything it shows. | §4.4, §8.3 |
| **The change as an object, with origin, evidence and decision apart** | *Version control* records who committed, not who or what wrote each span, on what evidence, with what human decision. *C2PA* attests to whole assets after the fact, not to spans as they are written. *Track changes* is per application and lost on export. | §1.7, §8.5 |
| **Origin with a basis: witnessed, inferred, unknown** | Attribution systems either assert authorship or stay silent. None distinguishes what was recorded at the moment from what was worked out later. | §8.5 |
| **Eleven primitives and a display list** | *HTML and CSS* are a full description language, but far too large to interpret in a small kernel, and their meaning is whatever a browser version does. *SVG* has no flow layout, data or time model worth the name. *PDF* is depiction. *Scene and timeline formats* each cover one medium. | §5, §6.2 |
| **Formulas stored as structure** | *Spreadsheet formula text* needs a parser and differs between products. *Vega expressions* are JavaScript text. Structure needs no parser and has one meaning. | §5.3 |
| **Handlers that propose changes** | Interactive documents either embed a scripting language, with its security history, or cannot edit their own data. A declarative handler that yields a verified, attributed change needs neither. | §5.6 |
| **The host interface** | *WASI* assumes files, sockets and clocks, which is the authority a document must not have, and has no drawing or input. The *component model* is not yet uniformly available in browsers. Ten functions and named capabilities can be stated in either later. | §6.3 |
| **Code as description: statements as elements, printed by the kernel** | *Source text and a compiler* put the meaning in a language outside the format and the record of why in commit messages beside it. *Bytes plus a ledger of operations on them* (this project's own earlier draft) needed keys for the parts of a module, hashes with keys substituted for indices, a replay of all history to verify, a separate printer program, and a whole function resent for every change. *Unison* names code by content, for one language. Here the description is WebAssembly's own instructions as values, so there is no new language; each statement is an element like a character of text, so attribution, anchors, diffs and merging come from the core; and printing is a small pure function. | §11.3–§11.5 |
| **Metering inserted by the reader** | Runtimes with built-in fuel exist outside browsers only. Metering inserted by the toolchain must be trusted or re-verified by a second copy of the rule. Inserting it in the kernel at load means there is one rule and nothing to trust. | §11.2 |
| **The web envelope's read-back** | A page opened from disk cannot fetch its own file; *single-file web apps* store data as script or JSON text, not as range-readable, hash-verified records. | §9.2 |
| **The mark** | Metadata, boxes and chunks are stripped by re-encoding platforms. Only pixels survive, and QR is the standard way to put a short reference in pixels; what is new is treating it as a content address for a linked universe. | §9.4 |
| **Two layers of the light cone** | *Retrieval by similarity* returns fragments without telling you what you did not see. *Stored summaries* go stale silently, and a universe that depends on them cannot be navigated until a model has read it. *Tables of contents* cover headings and nothing else. Here an outline is computed for anything — sizes, kinds, headings, who changed what and when — and is always current; summaries are pinned derivations that attach to its parts and are written only where the outline cannot tell siblings apart. | §11.7 |
| **`break`, one line at a time** | *Host text layout* (CSS, TextKit, DirectWrite paragraphs) takes a whole paragraph and a fixed shape and returns all its lines, which hands every vertical decision to the host. *Measuring single runs* cannot break a paragraph with a bold word in it. A line iterator — given these runs, this place and this width, what fits — is what typesetting interfaces offer underneath, and is the least a host must do. | §6.3, §5.7 |
| **Rows, and three rules for pages** | *TeX's page builder* and *CSS fragmentation* are far larger than a small kernel can carry and depend on a full box model. Treating the flow as unbreakable rows, filling greedily, and applying three rules (no heading at the foot; no split of a short block; two lines on each side of a split) gives conventional pages from sixty lines of code. It is not optimal page-breaking and does not claim to be. | §5.7 |
| **The recipe** | *Notebooks and build files* record how to regenerate an output, apart from the output and by path. *Generation metadata* in image files records a prompt with nothing binding it to inputs. A derived object here names its sources by pin and the change that made it; that change's origin holds the model, prompt and parameters; so "make it again" is one action and "how was this made" is one question. | §8.3 |

## The name, the ending and the mark

The format and the concept are UFO, the Universal File Object. The
file-name ending is `.ufx`, read as "UFO Exchange", and the media type is
`application/vnd.ufx`. A file is a UFO file or a UFX file.

The obvious ending, `.ufo`, was not available. It is in active use by the
Unified Font Object format, with more than a dozen current font tools, and
live checks of the extension catalogues on 2026-11-22 found further
claimants: Ulead PhotoImpact objects, Ellisys Visual USB captures, SATURN
traffic-model files, Total Annihilation unit data and, in one catalogue,
Udemy video files. A new universal format cannot begin by colliding with
one in daily use.

For `.ufx`, the only prior use found is the material files of the Ultimate
3D game engine, long out of development, listed in one of three catalogues
and last updated there in 2019. No media type in the IANA registry contains
`ufx`, and it is not a top-level domain. The checks and their dates are in
NAMING.md.

Other candidates were considered and set aside. `.ufob`, `.uobj`, `.unifo`
and `.ufobj` were free of collisions but longer or clumsier, and `.ufx`
keeps three letters and the sound of the name. `.uf0`, `.ayy` and an emoji
ending were rejected because they cause ambiguity, undermine a serious
standard, or break in real tooling.

The brand mark and default file icon is a flying saucer. It is a visual
mark only — in icons, documentation and branding — and never appears in the
ending, the media type or any identifier of the format.

## What unifying sequences and stored values cost and bought

Two unifications were made after independent readers kept finding gaps in
the same places.

*Sequences.* Removed: runs as a mechanism, self-anchors, the insertion
bias, per-change lists of revisions, the `remap` operation, the split of an
operation into shape and content, and every rule for carrying an anchor
through history. Added: element identities, boundaries, and a frame on
continuous axes. An anchor is now resolved from the current revision alone.

It costs three things. Removed elements are kept as markers for good, so a
heavily edited sequence carries a record of its deletions (compact — three
or four small numbers per run — but permanent, and visible in a published
copy as "something was removed here by this change"). Finding an element by
identity means searching the runs, which readers will index. And an anchor
is larger: two element identities instead of two integers.

It buys the later collaborative phase for nothing: operations already name
elements, which is what merging concurrent edits requires.

*Stored values.* There were three ways for a value to live outside its
node: a transparent stand-in, a salted record for content that might be
withheld, and pieces for long texts; and there was a separate link for a
file's bytes. There is now one: an indirect to a blob. A blob is pure
content, never salted, so identical content is one record wherever it
appears — in a property, in the operation that set it, in another
universe. A file's bytes are simply a byte string kept outside its node,
so the link, and the confusion between links that are resolved and links
that are not, are gone: a value can hold four kinds of reference where it
held five. Where a hash must not be guessable or matchable — a change's
record of its operations, above all — the indirect is veiled: it names a
48-byte opening, a salt and the blob's hash, and whoever lacks the
opening learns nothing. Blobs are divided by content, in chunks and in the
tree above them, so an edit rewrites only what is near it: ten bytes
inserted into a mebibyte change one chunk in ninety-six.

## What the measurement spike showed

Before any implementation, a throwaway spike tried the format's new claims
in miniature. Its code is not kept; its results are these.

**Models maintaining code.** A game core of 300 to 400 instructions was
built, and then maintained, by fresh instances of two language models —
both weaker than a frontier model, so the results are a lower bound —
through a printer at four levels: flat instructions, folded text, a typed
expression language, and the statement trees the specification now uses.
Maintenance meant a planted one-token bug, found from a vague report, and
three new features, done by an instance with no memory of building and no
source, only the ledger and projections. Hidden tests the subjects never
saw scored every result.

- Every cell passed everything: 8 builds and 16 maintenance runs, all
  hidden tests, and every untouched function left unchanged. On a program
  this small, no level failed.
- Every subject found the bug the same way: the history showed a recent
  change, and the record of that change showed what it did. The ledger did
  the work a debugger usually does.
- With whole-function replacement, a one-token fix cost 1.4 to 2.6 KiB of
  resubmitted code in every run, and every subject asked for a way to
  change part of a function. With statement-level edits it cost about
  0.25 KiB, and the whole maintenance job 2.7 times less than the best
  earlier level, at the same tokens and time.
- Two runs per cell, one small program: suggestive, not established. The
  task was too easy to show where flat instructions stop being
  maintainable.

**One kernel, several faces.** A kernel miniature of 1 613 lines of Rust
opened real packs, including the normative vectors, and presented one small
universe as plain text, as a scrolling view and as pages, with a text from
a nested universe shown through a Portal. It needed an algorithm the
specification did not have (now §5.7) and a different `break` (now §6.3).
Built without the standard library and passed through a size optimiser, it
came to 78.4 KiB, about 40 bytes for each line of its own code. At that
density the first line budget, 10 000, and the byte budget could not both
hold. The byte budget is what a file pays for, so it stood at 256 KiB, and
the line budget became 6 000.

**The printer.** The same kernel printed six described modules to bytes
identical to a second implementation's, and the specification's vector to
bytes assembled by hand. The printer added about 11 KiB to the kernel. The
second implementation was the trial's own, in another language; it is
deleted with the rest of the spike, and the kernel's printer is the only
one there will be.

**The light cone.** On a corpus of 199 000 characters in four universes,
models answered three questions through four projections. With the
structural layer alone all answers were right; two cost about 1% of the
corpus, and one — finding a remark among eight untitled interviews — cost
18.5%. With one-line summaries that one cost 2.4%. So structure bounds
every search, and summaries pay where structure says nothing.

**Transmutation.** Pins, staleness through a ref, staleness of a
derivation of a derivation, the recipe, one-step regeneration and its
refusal when the prompt is withheld all ran, with a deterministic function
standing in for the model. Two defects in the digest rule were found and
fixed.

Not shown by any of this: anything at scale; grids, floats, clocks, audio,
video or 3D; a second person's implementation; a model writing summaries;
a real model transmuting.

The cost of keeping markers was measured on a simulation: a text first
typed as 10 000 characters, then edited 20 000 times with a mixture of
replacements, insertions and deletions, ended with 57 771 characters,
131 925 markers and a `seq` of about 779 KiB — some thirteen bytes for
every character present. With every marker forgotten it is about 211 KiB.
Most of the remainder is the price of knowing which change wrote each
stretch of text, which the format exists to know.


## Where the design departs from first intentions

Four choices differ from what the project first set out to do. They are
recorded so they can be reversed for good reason.

- **Code is described, and its bytes are a face of the description.** The
  first intention was worded as "the bytes are the only artifact", changed
  by structured operations to a printer and explained by a ledger of those
  operations. What that wording was rejecting was a human source tree:
  files, a build, a language written for people. The principle is now
  stated as what it meant. Code is description; a module's bytes are a
  deterministic face of that description, printed by a pure function and
  always verifiable against it, exactly as an image is a face of a
  document. There is still no human source tree, no build step and no
  separate ledger mechanism: the Chronicle is the ledger, now for each
  statement and not only for each function. The project's owner approved
  the change on the evidence of the trial described above. The earlier
  design is specification version 0.6.

- **Base presenters are the host, not WebAssembly components.** The first
  intention was that every presenter be compiled once and run everywhere. A
  component that only forwards "draw this text" to a host call is an empty
  layer; the host's own facilities, behind the display list, are the base
  presenters. Presenters a universe carries are still sandboxed components.
- **The reader, not the printer, inserts fuel metering.** The first
  intention was that the printer insert it and the reader check that it is
  there. Checking needs the same rule in two places, or trust in a printer
  the file supplied.
- **Regions are two-dimensional; space is not.** Three-dimensional space is
  first-class in the anchor model: a scene is a data object with `x`, `y`,
  `z` and `t` axes, and what sits in it — parts, Portals, flat content on a
  wall — is format data with attribution and summaries. Only the drawing is
  done by a carried program, which may hold no content of its own.

## Honest limits

- Envelopes other than the web page survive only where bytes are preserved.
- Live presentation uses each host's text rendering, so line breaks can
  differ between devices; identical output is promised only for canonical
  exports.
- A reference by hash can never be redirected, and can also fail to be
  found. The format verifies content from anywhere; it cannot make anyone
  keep it.
- Converting a foreign document to description can lose nuance. The
  original bytes are always kept, and the conversion is recorded.
- Every size and speed figure in the specification is a target set before
  anything was built, except the kernel's line limit, which was reset from
  one measurement of a miniature. Budgets change on measurement only.
- A web page that carries its own reader cannot vouch for itself. What it
  says about seals and origins is the file's own account until an installed
  reader checks it.
- The contract for capabilities is complete, and accelerated graphics is
  sketched on the WebGPU model, but the exact operations of most
  capabilities are still to be written.
- The test vectors were written by one script. Until an independent
  implementation reproduces them they prove consistency, not correctness.
