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

## Machine code with a record instead of source

Source code does two jobs: it is input to a compiler, and it is the record
of why the program is the way it is. When the maintainer is a language
model, the first job can be done directly and the second can be done
better. A Compute-let keeps canonical WebAssembly as the only thing that
runs, and a ledger stating, for each function, the request that caused it,
the model that wrote it, what it replaced and the tests that justify it.
Readable listings are generated on demand. Whether this scales from a
calculator to a large program is an open question the project intends to
answer by building.

## What was invented, and why existing things did not fit

The project uses established standards wherever one truly fits: SHA-256,
deterministic CBOR, DEFLATE, Ed25519, WebAssembly and its text format,
HTML, base64, MP4 and PNG containers, QR codes, the glTF object model for
3D scenes, the Model Context Protocol, flicks for time. Where none fits,
the smallest thing that closes the gap was designed, and is specified in
full. Each is recorded here so it can be challenged.

| Invention | Existing options, and what each misses | SPEC |
| --- | --- | --- |
| **The pack** | *SQLite*: no canonical bytes to hash or sign; its engine in every file. *Git packfiles*: delta compression and a separate index file make a weekend reader impossible; not built for one growing file. *ZIP*: no content addressing; central directory rewritten on every change. *CAR (IPLD)*: content-addressed, but no commit trailer, crash recovery or index. | §2, §3 |
| **Operations split into shape and salted content** | *Git shallow clones* drop history wholesale, with its authorship. *Redaction* breaks hashes. Nothing kept an edit history verifiable, and anchors resolvable, while withholding what the edits said. | §1.7, §9.3 |
| **Three kinds of axis with one survival rule each** | *W3C Web Annotation selectors* re-find text by quoting it, which is matching. *Media Fragments* address time and space but say nothing about edits. *Operational transformation and CRDT positions* cover sequences only. Nothing covered text, time, space and tables with one model that never guesses. | §4 |
| **Pins and one staleness test** | Build systems track staleness of files, not regions; document formats do not track it at all. A pin's digest follows references, so a pin to a container notices a change in anything it shows. | §4.4, §8.3 |
| **Runs and self-anchors in the core** | Attribution systems for text live inside one editor and know about paragraphs. Putting per-item runs and self-carried regions in the core gives every sequence of every medium span-level attribution and structure that stays put, with no knowledge of text. | §1.7 |
| **Insertion bias on a splice** | Editors resolve "which side does typed text join" with caret affinity that is never recorded. One field on the operation makes the answer part of history and deterministic for every reader. | §4.3 |
| **The change as an object, with origin, evidence and decision apart** | *Version control* records who committed, not who or what wrote each span, on what evidence, with what human decision. *C2PA* attests to whole assets after the fact, not to spans as they are written. *Track changes* is per application and lost on export. | §1.7, §8.5 |
| **Origin with a basis: witnessed, inferred, unknown** | Attribution systems either assert authorship or stay silent. None distinguishes what was recorded at the moment from what was worked out later. | §8.5 |
| **Eleven primitives and a display list** | *HTML and CSS* are a full description language, but far too large to interpret in a small kernel, and their meaning is whatever a browser version does. *SVG* has no flow layout, data or time model worth the name. *PDF* is depiction. *Scene and timeline formats* each cover one medium. | §5, §6.2 |
| **Formulas stored as structure** | *Spreadsheet formula text* needs a parser and differs between products. *Vega expressions* are JavaScript text. Structure needs no parser and has one meaning. | §5.3 |
| **Handlers that propose changes** | Interactive documents either embed a scripting language, with its security history, or cannot edit their own data. A declarative handler that yields a verified, attributed change needs neither. | §5.6 |
| **The host interface** | *WASI* assumes files, sockets and clocks, which is the authority a document must not have, and has no drawing or input. The *component model* is not yet uniformly available in browsers. Ten functions and named capabilities can be stated in either later. | §6.3 |
| **The printer and ledger** | *Source maps and debug information* point bytes back at source text; here there is no source text. *Reproducible builds* prove a binary came from a source, not why each function exists. | §11.3–§11.6 |
| **Item keys in modules** | WebAssembly refers to functions by index, so a hash of a function's bytes changes when an unrelated function is added. *Unison* solves this for a language by hashing references; here every item has a lasting key, and hashes are taken with keys in place of indices. | §11.3 |
| **Metering inserted by the reader** | Runtimes with built-in fuel exist outside browsers only. Metering inserted by the toolchain must be trusted or re-verified by a second copy of the rule. Inserting it in the kernel at load means there is one rule and nothing to trust. | §11.2 |
| **The web envelope's read-back** | A page opened from disk cannot fetch its own file; *single-file web apps* store data as script or JSON text, not as range-readable, hash-verified records. | §9.2 |
| **The mark** | Metadata, boxes and chunks are stripped by re-encoding platforms. Only pixels survive, and QR is the standard way to put a short reference in pixels; what is new is treating it as a content address for a linked universe. | §9.4 |
| **Summaries as pinned derivations in a tree** | *Retrieval by similarity* returns fragments without telling you what you did not see. *Stored summaries* go stale silently. | §11.7 |

## Where the design departs from first intentions

Three choices differ from what the project first set out to do. They are
recorded so they can be reversed for good reason.

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
  anything was built. Budgets change on measurement only.
- A web page that carries its own reader cannot vouch for itself. What it
  says about seals and origins is the file's own account until an installed
  reader checks it.
- The contract for capabilities is complete, and accelerated graphics is
  sketched on the WebGPU model, but the exact operations of most
  capabilities are still to be written.
- The file-name ending is not chosen: `.ufo` is already a font format's.
  Candidates and evidence are in NAMING.md.
- The test vectors were written by one generator and read back by one
  independent reader. No second writer exists yet.
