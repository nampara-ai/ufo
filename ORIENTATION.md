# Orientation

This is my account of the UFO project after reading the canonical brief,
Supplement A (*One File, Many Faces*) and Supplement B (*The Player Inside
the File*) in full, and studying the parts of the two reference repositories
the brief points to. It says what I understand the project to be, where the
documents disagree with each other or with the facts, and what I did about
each disagreement in the draft specification ([SPEC.md](SPEC.md)).

Nothing described here has been built or run. The specification is a draft
for review.

These are working notes for the project's owner. They discuss three founding
documents that are not published; the specification itself does not depend
on them, and public rationale is in [RATIONALE.md](RATIONALE.md). Section 8
records the decisions taken at the first review and what changed.

## 1. What UFO is

A UFO is one file that holds a body of work as a *description of what the
work is* — words and their structure, data and its relationships, shapes,
timing, sound, behavior — together with the complete record of how that
description came to be, and a small program that can present it.

Three properties make it different from the formats we have.

- **It stands alone.** The file carries its own player. Opened in any
  browser, with nothing installed, it presents itself and can be inspected
  and edited.
- **It has many faces and one truth.** The same description presents as a
  document, plain text, a table, an image, a video or a running program.
  None of those is a copy that can drift.
- **It remembers.** Every change is recorded with who or what made it, from
  what, on what evidence, and what a person decided about it. That record
  cannot be separated from the content, because recording it is the only
  way the content can change.

Programs are content too. A Compute-let is WebAssembly carried as an object,
run in a sandbox with no authority except what the person grants, and
maintained through a printer that records the cause of every function it
writes.

## 2. Why it matters now

Language models can turn any form of information into any other. What they
cannot do is see across the walls between applications, each of which keeps
its own format, history and permissions. People have become couriers
between their own tools, and context is lost at every crossing.

Agents now have a standard way to call tools. They have no standard for the
material they work on. A format that carries content, context, history,
permissions and behavior across every boundary fills that gap, and it
should be open.

It is possible now because of things that did not exist together before:
a universal reader on every device (the browser); a universal safe
execution substrate (WebAssembly); proven building blocks (content
addressing, signatures, capability security); AI that makes writing
converters cheap; and an urgent need to know where content came from.

## 3. How one unchanging description presents as many faces

By giving up the idea that a file is an encoding of one medium. The file is
the score; each medium is a performance.

- A face is **sampled** when the player computes it from the description on
  demand. Nothing is stored and nothing changes.
- A face is **carried** when a finished rendition, such as a PDF or an
  encoded video, is kept beside the description with a record of exactly
  what it was made from.
- A face is **transmuted** when AI writes new description — a deck from a
  report — which is added with its sources pinned.

Carried and transmuted faces add to the file. They never alter what they
were made from, and each can tell, by comparing hashes, when its sources
have moved on.

## 4. Why the player can be tiny

A universal media player is enormous because it must decode thousands of
foreign encodings. A UFO's native content is not an encoding. It is a
description built from eleven primitives, and presenting a description
needs one small interpreter, not a library of decoders.

The encodings that do exist are handled at the edge. Common images, audio,
video and fonts are decoded by the host, which already has the best
decoders in the world. Foreign documents are converted once, on the way in.
The core stays the same size however many formats the world invents.

In the specification this became sharper than I expected. Several things
the brief treats as separate mechanisms turned out to be one:

| The brief describes | The specification has |
| --- | --- |
| objects, properties and edges | objects and properties; an edge is a property that holds a reference |
| a Chronicle, and a ledger sharing its foundations | one Chronicle; the ledger is the part written by the printer |
| a history log beside the data | the commit chain itself; each change is an object |
| renditions, transmutations, summaries, each with staleness rules | one derivation record and one staleness test |
| anchor survival rules per profile | three kinds of axis, one rule each, in the core |
| nested universes and linked universes | one reference; the difference is whether the records are at hand |
| timeline, scene, grid and canvas profiles | compositions of the eleven primitives; no profiles |

## 5. The hardest open problems

In rough order of how much they worry me.

1. **Layout and text inside the budget.** The kernel must do flow layout,
   line breaking with host measurement, grids and composition in about ten
   thousand lines. Text is where minimal systems go to die. The budget is a
   bet, stated before measurement.
2. **The onboard editing interface.** The brief requires that a UFO be
   editable through its own tools in a bare browser. Supplement B's
   four-part player has no place for an editor's interface, and putting one
   in the binding would break the rule that the binding knows no domain.
   My proposed answer is that the tools' interface is itself a universe of
   primitives, carried by content hash like any component. That is
   attractive and unproven, and the specification does not yet define it.
3. **Machine code without source, at scale.** The printer and ledger replace
   source code with canonical bytes and a record of causes. For a
   calculator this is clearly workable. For a game with thousands of
   functions written as WebAssembly instructions by a model, nobody knows
   yet. The phase plan's calculator will not answer the question; the game
   in worked example two would.
4. **Exact reproducibility.** Canonical exports need a software rasterizer
   and a text-shaping engine carried as components. Those are large, and
   they are a second way of drawing text beside the host's. I believe this
   is a legitimate border component and not plywood, because it serves a
   different guarantee, but it deserves challenge.
5. **Moves.** A cut and paste is a deletion and an insertion. Origin
   survives, because the insertion records where it was copied from.
   Anchors into the moved text do not: they detach. Carrying anchors across
   moves by following the copy record looks possible and is not specified.
6. **Privacy of history.** Decided at review: attribution travels, working
   history stays home unless included (SPEC §9.3). What remains open is how
   much attribution itself reveals — names, times, the number and size of
   edits — and whether that is acceptable for anonymous publication.
7. **Who holds linked content.** A reference by hash can never be silently
   redirected, and it can also simply never be found. The format can verify
   content from anywhere; it cannot make anyone keep it.
8. **Consent that means something.** Capability prompts are only as good as
   people's attention. Narrow scopes and plain language help. This is a
   design problem for readers more than for the format.
9. **Merging.** Character identity in the text profile was designed so that
   concurrent editing can be added without changing stored content. I have
   not shown that it can.
10. **The container.** See tension 1 below.

## 6. Tensions, ambiguities and contradictions

For each: what the documents say, what I found, what the draft does.

### 6.1 The storage engine against the size of the player

*The brief* names a transactional single-file database, SQLite in
particular, as the leading candidate for the working form, and lists "the
storage engine compiled to WebAssembly" among the travel form's contents.
*Supplement B* requires a player small enough to read in a day and measured
in kilobytes, and names four parts, none of which is a database engine.

These cannot both be met. A database engine in every file is, by Supplement
B's own definition, a buffalo: every one-paragraph note would carry
hundreds of kilobytes of query engine it never uses (I have not measured a
build; the figure is from published sizes of SQLite's WebAssembly
distribution).

**Resolution in the draft:** the working form is an append-only pack of
content-addressed records, specified in two pages (SPEC §2). The brief
delegates this choice to the specification and asks for reasons; they are
in SPEC §2.7. Beyond size, the decisive ones are that a universe's state
becomes a single hash that a signature can cover, and that both forms of
the file hold identical bytes.

**What it costs:** SQLite's decades of hardening, its universal inspection
tools and its archival standing.

**Decided at review:** approved as canonical, on the model of git. SPEC §2
and §3 now define what the database would have supplied.

### 6.2 An envelope that is both a web page and an archive

*The brief* says the travel form may also be a valid archive, because
"browsers read from the front and archive tools find their index at the
end, so a single file can satisfy both honestly."

This is not correct for HTML. Bytes after the end of the page are still
part of the HTML document. An archive's binary structures there contain
null bytes and byte sequences that are not valid UTF-8, which are parse
errors. Such a file displays correctly only because browsers recover from
errors, and both the brief and Supplement A forbid depending on that.

**Resolution:** the web envelope is strictly valid HTML and nothing else
(SPEC §9.2, E3). The archive view is dropped. If an archive view is wanted,
it should be a separate envelope whose outer format is the archive.

**Correction to the brief (approved at review).** The sentence in Part
Twelve beginning "Browsers read from the front and archive tools find their
index at the end" should be struck, together with the offer that the
envelope "may also be a valid archive", and Part Four's lesson from
self-contained portable executables should not be applied to HTML. The
accurate statement is: *a travel-form envelope is valid in exactly one
foreign format. A web envelope is a conforming HTML document and nothing
else, because any bytes after the page are part of the page.*

### 6.3 Envelopes through platforms that re-encode

*Supplement A* says a UFO posted as a video to a chat application can be
opened as the full universe "from that same file" by anyone with a reader.

Most messaging and social platforms re-encode video and images and discard
anything they do not recognise. The universe will often not survive the
trip. **Resolution, approved at review:** these envelopes are best-effort
carriers and readers must say so (SPEC §9.4, E17).

### 6.4 Two meanings of "presenter"

*The brief* (Part Ten): a presenter draws "an object of a given type".
*Supplement B*: a presenter turns *primitives* into output, and there are
few because there are few primitives.

Under the brief's meaning there would be a document presenter, a table
presenter, a chart presenter — a plugin swamp. **Resolution:** Supplement
B's meaning wins. The kernel composes every native object into a display
list of primitives; four base presenters output them. The brief's
type-specific presenter survives in exactly one place: a Compute-let
attached to a surface, for content that is not native description (SPEC
§6.1, M3).

### 6.5 "Authoritative source text and its syntax" against "no parser in the kernel"

*The brief's* text profile stores authoritative source text and its syntax.
The obsolete experiment made that Markdown, with Portals spelled as fenced
blocks of JSON inside it. *Supplement B* forbids format-specific paths in
the kernel, and Markdown is a foreign syntax.

**Resolution:** a text is characters plus spans that mark structure and
style. A writer that wants to keep Markdown authoritative stores the exact
source as the characters, declares the syntax, and writes the spans its own
parser derives, including spans over the markup characters that say "do not
present these". Every reader then shows the document properly without
knowing Markdown. The kernel never parses (SPEC §8.1, X3).

### 6.6 Revision numbers

*The brief* gives every object "a revision number" and ties anchors to
"revision". Two copies of a file edited separately will each produce a
revision 5 that differ. **Resolution:** the number is kept as a counter;
every reference to a specific revision uses the hash of that revision (SPEC
§1.5).

### 6.7 Three kinds of representation, twice

*The brief* has renditions, transmutations and projections, and says a
transmutation is "a rendition or new objects". *Supplement A* has sampled,
carried and transmuted faces. The two triples overlap without matching.

**Resolution:** Supplement A's classification is used for faces. A sampled
face is a projection. A carried face is a rendition. A transmutation is
always new described objects; an AI-produced video file is a rendition
whose origin happens to be a model. One derivation record serves all (SPEC
§7.1, §8.3).

### 6.8 Later profiles that are not needed

*The brief* plans profiles for timelines, scenes, grids and canvases.
*Supplement B* says these are compositions of primitives. The worked
examples confirm Supplement B: all four are represented with no such
profile (SPEC §5.5, §14). I have removed them from the plan rather than
left them as future work.

### 6.9 Where the printer lives

*The brief* says the printer is "present once inside the Compute-let".
*Supplement B* says components are identified by content, carried only
where used and never stored twice. **Resolution:** a Compute-let names its
printer by hash; the universe carries one copy however many Compute-lets
it holds (SPEC §11.4).

### 6.10 "No source tree" and what an agent actually writes

*The brief* says models do not type bytes; they issue structured operations
containing instruction sequences. It does not say how an instruction
sequence is spelled. **Resolution:** in the standard WebAssembly text
format, for instructions only, in both directions. It is never stored. I
note the obvious objection: this is source code in everything but name, at
the lowest level. That is consistent with the brief, and it is part of open
problem 3.

### 6.11 Grants and live modification

*The brief* wants software that changes continuously while running, and
permissions that a file can never grant itself. If a grant is tied to exact
code, every change re-prompts; if it is tied to identity, a hostile file
with the same identity inherits it. **Resolution:** a grant is tied to the
exact root hash and carries forward only through a promotion performed in
the person's own reader with their approval, and only if nothing new is
requested (SPEC U7).

### 6.12 "Reopens identically everywhere"

*The brief* asks to report whether a saved UFO reopens identically
everywhere. Live presentation uses each host's text shaping, so lines may
break in different places on different devices. What is identical
everywhere is the content and its root hash, and canonical exports.
**Resolution:** two determinism tiers, stated honestly (SPEC §7.4).

### 6.13 A PDF in a Portal

*The brief's* composition demonstration shows "a PDF in its own Portal".
Browsers can display a PDF but offer pages no dependable way to decode one,
especially on phones, and a PDF renderer inside the player is exactly the
buffalo. **Resolution:** under decode-at-the-border a PDF is an asset
outside the baseline. It is preserved exactly and carries page renditions
made once at import, or is transmuted to native description (SPEC §6.4,
B4). The demonstration should be read that way.

### 6.14 Sealing in a bare browser

*The brief* says keys never live in a file or a reader, and also that a
UFO received on a clean device can be modified, saved and sent on. Both
hold, but the change made on that device will usually be unsealed: a page
opened from disk has no safe place for a signing key. The specification
records such authorship as a claim (SPEC U1). Readers on rungs 2 and 3 can
use platform key storage.

### 6.15 What the reference material shows

**Cursive.** Its principles are the ones the brief adopts, and its
source-edit ledger and shadow pipeline are close to the specification's
`splice` with `base` and `old`. Three things differ and are worth knowing:

- Its Chronicle is an ordered log without a hash chain, and it is
  occasionally compacted. The format's Chronicle is chained by
  construction.
- It sometimes establishes attribution after the fact, by aligning text,
  and records how precise the result was. Decided at review: origin has
  three states — witnessed, inferred, unknown — and Cursive's aligned
  attribution maps to inferred, with its method and precision grade (SPEC
  §8.5, §13.2).
- It keeps two provenance stores, the Chronicle and an element-level
  journal. A UFO has one history.

**The obsolete experiment.** Carried forward: objects and typed values in
one address space; content-addressed chunks; unknown preservation; nested
universes with path-based cycle guards; stored renditions that record their
source; Portal rules (parents size children, occurrences never shared, one
drop one owner, no stale binding); a text digest that must match before
anything is shown. Left behind: the database container; Portals as JSON
inside Markdown, which needed three hand-kept codecs agreeing on number
spelling; private per-application tables; three different spellings of a
hash; and, above all, its presentation layer, which bundled or shelled out
to a PDF renderer, an office suite, a media transcoder and a 3D engine.
That layer is the clearest example I have seen of what Supplement B
forbids.

## 7. Questions raised at the first review, and their answers

1. Pack in place of SQLite: **approved**, as canonical.
2. Dropping the archive view of the web envelope: **approved**.
3. History on leaving: **split in two** — attribution travels, working
   history is private unless included, with hash stubs.
4. Founding documents: **not published**; the specification stands alone.
5. Estimated attribution: **a third origin state, inferred.**

## 8. What changed in version 0.2

- **Pack (SPEC §2, §3).** Checksummed 67-byte head with an exact recovery
  procedure; index layout; a limits table; total parsing and mandatory
  fuzzing; compaction that preserves every hash; line-count targets and a
  "weekend test" for an independent reader; SQLite permitted only as a
  disposable local cache.
- **Change records (SPEC §1.7).** An operation now has a shape, kept in the
  change, and content, kept in salted records. This is what makes
  withholding possible: anchors are carried by shapes alone, so they still
  resolve when the content of history is absent. Revisions are salted so
  that the hash of a withheld draft cannot be used to guess it.
- **What travels (SPEC §9.3).** Three layers — content, attribution, working
  history — defined by reachability; a required display of exactly what
  will leave; nothing removed from the owner's copy.
- **Origin (SPEC §8.5).** `basis`: witnessed, inferred (with method and
  confidence) or unknown; readers must show the three differently. A copy is
  now recorded on the change's origin, one source per change, rather than
  on individual operations.
- **Three dimensions (SPEC §5.5, §14.4).** Confirmed and tightened: a scene
  is a data object plus a surface whose Compute-let draws it. The optional
  third axis that version 0.1 allowed on regions was a hidden step toward a
  scene profile and has been removed.
- **Standing alone.** Every reference to the founding documents is gone from
  the specification. RATIONALE.md carries the public reasoning.
- **Weight.** CORE.md states the format in two pages. The glossary went from
  47 concepts to 37; the ten removed are compositions and are now listed as
  such (Agent, Asset, Border, Chronicle, Coordinate space, Ledger, Light
  cone, Membrane, Rendition, Transmutation).
- **Found on re-reading and fixed.** A summary's scope was stored twice (in
  `of` and in its derivation); a Portal had a timing property duplicating
  the clock primitive; text was stored as a list of segments whose
  boundaries would have made the conservation check ambiguous; the
  presenter map could dispatch on object type, which was an extension point
  in disguise; a rule required replaying printer operations before running
  a module, which a file with withheld history could not satisfy; a module's
  `units` axis was used in an example but never declared; section 3 was an
  empty placeholder.

## 9. What changed in version 0.3

Two things happened after version 0.2: the owner's addendum — simplify the
mechanism, never the ambition; invent where nothing fits — and an
independent cold review of 75 findings, ten critical. The review and the
finding-by-finding response are kept in the project's private notes.

**From the addendum.** Reach restored or extended: texts of any length;
Portals inside 3D scenes and games, through children of a surface; scene
data in the glTF object model; video and image envelopes specified in full,
with a visible mark as the way back to a universe that a platform has
stripped; onboard tools designed, as kernel functions plus a tools universe;
handlers that propose changes; transmutation as a first-class `derive`
action; the history default set by the membrane crossed.

**From the review.** The rules that did not yet do what the design
intended:

- operations apply in order; the sequence rule for anchors is a table with
  no overlapping cases;
- runs and self-anchors moved into the core, so text needs no special
  handling and conservation is exact;
- a commit links its change by hash and each change lists the revisions it
  touched, so withheld history is checkable and not merely asserted;
- copies keep their runs, so attribution survives moves and withholding;
- staleness follows references and derivations;
- capability calls may be pending, because hosts are asynchronous;
- a web envelope must say it cannot vouch for itself;
- the kernel inserts fuel metering, so there is nothing to verify;
- module parts have lasting keys, so a function's identity survives changes
  around it;
- tests cannot be weakened inside the change they judge.

**Three departures from first intentions that need the owner's eye.** Base
presenters are the host's facilities, not WebAssembly components. The
reader, not the printer, inserts fuel metering. Regions are two-dimensional;
three dimensions belong to a surface. Each is argued in RATIONALE.md.

**Open, and said so in the specification.** The operations behind most
capabilities, `gpu` above all. Byte-level test vectors. Whether the kernel
fits its budget, which was raised once in response to the review. The exact
fields of projections. The file-name ending, which collides with an
existing font format.

**Weight, honestly.** The specification grew, from about 21 000 words to
about 32 000, because the review showed it was not yet complete enough to
build from. CORE.md is the two-page form. Concepts went from 47 to 38; the
full count of defined terms, which version 0.1 did not report, is 125.

## 10. What changed in version 0.4

- **Budgets restored** to 10 000 lines and 256 KiB for the kernel, and 600
  lines for a binding. They change on measurement only.
- **Test vectors exist** (SPEC Appendix F, `vectors/`): encodings, hashes,
  blob and object-map shapes, a whole minimal pack, anchor carrying,
  printer output and fuel instrumentation. A small generator script wrote
  them. This is conformance tooling, not a reader, but it is the first
  code in the repository and is flagged as such.
- **Projections are specified field by field** (Appendix B).
- **The capability contract is complete** (§6.3): request, offer, asking,
  start, use, revocation, narrowing, and a defined result for every
  capability when absent or denied. Accelerated graphics is sketched on
  the WebGPU model (Appendix E).
- **The drawing contract is frozen and exact** (§6.2), with a schema and a
  conformance method for bindings.
- **Fuel metering is a normative rule** (M4) with vectors that were run in a
  WebAssembly engine.
- **Three dimensions are format data** (§5.5): a scene declares `x`, `y`,
  `z` and `t`; anchors address nodes, places and times; Portals and flat
  content in a scene are objects placed by anchors; a rule (M9) forbids a
  program from being the only holder of content. Both the game and the 3D
  example show the three conditions.
- **Naming** is a proposal with evidence (NAMING.md); nothing is chosen.

## 11. A proposed measurement spike

The kernel and binding budgets are bets. I do not know that they are
wrong, and I do not know that they are right. A throwaway spike, outside
the specification and not to be kept, would settle the three parts that
carry the most risk:

1. values, records, pack reading with recovery, object map and blobs,
   checked against the vectors;
2. flow layout of one styled paragraph with the host breaking lines,
   composed to a display list, plus a web binding that draws it;
3. module checking and fuel instrumentation, checked against the vectors.

Measured: lines of Rust per part against the per-part budget of SPEC
§12.2, compiled and compressed size, and the binding's lines. About two
days. It needs the owner's go-ahead, because it is implementation.

## 12. Naming, decided

The owner decided on 2026-11-22: the format and concept remain UFO; the
file-name ending is `.ufx` ("UFO Exchange"); the media type is
`application/vnd.ufx`; the mark is a flying saucer, used only visually.
NAMING.md records the decision, the candidates and the dated checks. A
draft media type registration is in `registration/` and has not been
submitted. Section 10's note that naming was undecided is superseded.

