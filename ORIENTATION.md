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

## 11. The measurement spike, as redirected

Approved by the owner, to run after the cold re-review; strictly throwaway,
two days, in its own directory or branch, deleted or archived afterward. It
is not the beginning of the implementation.

It measures kernel and binding size against the budgets of SPEC §12.2, and
it does so by testing the format's new claims in miniature:

1. a one-paragraph universe presented through the primitive vocabulary as
   text, as a page and as an image, by one kernel;
2. a tiny Compute-let changed through the printer, with ledger attribution;
3. one light cone query answered while expanding only part of a small
   universe;
4. one transmuted face marked stale when its source changes.

Reported for each claim: whether the specification was sufficient, what
broke, and what had to be invented; and the size measurements. A claim that
fails in miniature is the most important finding of the phase.

## 12. Naming, decided

The owner decided on 2026-11-22: the format and concept remain UFO; the
file-name ending is `.ufx` ("UFO Exchange"); the media type is
`application/vnd.ufx`; the mark is a flying saucer, used only visually.
NAMING.md records the decision, the candidates and the dated checks. A
draft media type registration is in `registration/` and has not been
submitted. Section 10's note that naming was undecided is superseded.


## 13. The strict spec-first reader test: abandoned

A third independent reader test, stricter than the first two (build from
the text first; consult vectors only to check), was started in the
background against the text as it stood before the unification of
sequences and stored values. It stopped without a report when usage credits
ran out. It is abandoned and will not be re-run: the text it was reading is
two versions old (pre-0.5), and most of what it could have found was
overtaken by the unification. Its partial reader was not harvested for the
same reason. The strict test will be run fresh, on the post-spike text,
after the cold re-review.

Consequence, stated plainly: the unified storage design (versions 0.5 and
0.6) has not been read by any independent implementer. VISION-TRACE.md says
so.

## 14. Licensing: decided, and applied

Decided by the owner on 2026-11-22 and applied the same day, replacing the
MIT License: Apache-2.0 for code and everything not otherwise stated
(`LICENSE`, `NOTICE`, SPDX identifiers on source files); CC0 1.0 for the
test vectors (`vectors/LICENSE`); the Open Web Foundation Final
Specification Agreement 1.0 for the specification (`SPEC-LICENSE.md`), with
Jake Lundahl as the party making the commitment; a policy for the name and
the mark (`TRADEMARKS.md`). **Counsel will review all of it before the
project's public launch.** Three points for that review in particular: the
agreement is written for a final specification and is here applied to a
draft, version by version; the signature is a typed name entered at the
owner's instruction; and the terms for outside contributions, on which the
owner's proposal is this, now stated in CONTRIBUTING.md as pending counsel:

- contributions to the specification are made under the Open Web
  Foundation's Contributor License Agreement 1.0;
- contributions of code are made under Apache-2.0, by its contribution
  clause (section 5);
- the Final Specification Agreement is applied at each released version.

The Open Web Foundation publishes that contributor agreement in two forms,
one covering copyright only and one covering copyright and patents. The
proposal is read here as the second, since the final agreement makes
patent promises; counsel should confirm.

What follows is the proposal as it was put, kept for its reasoning. It
recommended Apache-2.0 for the vectors; the owner chose CC0 for them.

**The problem with the present state.** MIT grants copyright permission and
says nothing about patents. For a format meant to be implemented by
strangers for decades, the question an implementer's counsel asks is not
"may I copy the text" but "can anyone who helped write this later assert a
patent against my reader". MIT does not answer it. PDF answered it only in
2008, with Adobe's public patent licence alongside ISO 32000; before that,
every independent implementation carried the risk.

**Proposed structure.**

| What | Licence | Why |
| --- | --- | --- |
| Code: the future kernel, bindings, tools, `tools/vectors/` | Apache-2.0 | express patent grant from every contributor, covering their contributions; grant ends for anyone who sues over the work |
| Test vectors, `vectors/` | Apache-2.0 | they will be copied into every implementation's test suite; the same grant should go with them |
| Specification and its companions: SPEC, CORE, RATIONALE, VISION-TRACE, NAMING, registration draft | Open Web Foundation Final Specification Agreement (OWFa 1.0) | a copyright licence plus a promise not to assert patent claims *necessary to implement the specification*, against any implementation, by anyone — not only against users of this project's code |
| The name and the saucer mark | no licence; a short trademark and conformance policy later | so "reads UFO" can mean something; neither licence above covers names |

**Why two instruments.** Apache-2.0's grant covers a contributor's
contribution *as embodied in this project's code*. It does not clearly
cover a clean-room reader written from the specification, which is exactly
the implementation the format most needs to protect. The OWFa promise is
about the specification itself and reaches every implementation of it.
Conversely the OWFa is not a software licence. Each covers what the other
does not.

**Tradeoffs and alternatives.**

- *Apache-2.0 alone versus MIT/Apache-2.0 dual (the Rust convention).*
  Apache-2.0 is incompatible with GPLv2-only projects; dual licensing
  removes that at the cost of letting a user choose MIT and so take the
  code without the patent grant and without the retaliation clause. For a
  standard's reference kernel I would accept the GPLv2 limitation and use
  Apache-2.0 alone; the specification's own promise protects GPLv2
  implementers who write their own code.
- *OWFa versus the Community Specification License 1.0* (Joint Development
  Foundation). The Community Specification License was written for
  specifications developed in a git repository: it bundles the copyright
  licence, a patent licence that attaches when a contribution is merged or
  a version is approved, and a ready governance template. It is the more
  complete package and needs no separate signing step. The OWFa is older,
  shorter, better known to counsel at large companies, and was designed so
  that a specification can later be handed to a formal standards body
  (several W3C and other standards began under it). It binds only those
  who sign it, so it needs a contributor agreement (the OWF CLA 1.0) from
  everyone whose text is merged. Either is defensible. The OWFa is the
  lighter commitment now; the Community Specification License is the better
  fit if outside contributors are expected soon.
- *Creative Commons (CC BY 4.0) for the specification.* Familiar, but it
  licenses copyright only and expressly excludes patents. Not adequate on
  its own.
- *Non-assertion versus royalty-free licence.* The OWFa lets a signer
  choose between a non-assertion promise and a royalty-free licence on
  reasonable terms. The promise is simpler for implementers: nothing to
  request, nothing to sign.
- *Scope of the promise.* It covers only claims that are unavoidable when
  implementing the specification's required parts. Optional capabilities,
  and anything a carried Compute-let does, are outside it. That is normal
  and should be said in the README.
- *Defensive termination.* Apache-2.0 ends the patent grant for a party
  that sues over the work; the OWFa promise is likewise suspended against a
  party that asserts a necessary claim. Both discourage attack; neither
  protects against a patent holder who never contributed. No licence can.

**What a decision requires.**

1. The licence is granted by whoever holds the rights: the owner
   personally or a legal entity. For a format that claims independence from
   any application, the signer of the OWFa should be the entity that will
   steward the format, and eventually a neutral home.
2. Changing now is cheap: there is one rights holder and no outside
   contribution. Every merged outside contribution makes it harder.
3. CONTRIBUTING.md gains a contribution rule: inbound equals outbound for
   code (Apache-2.0 section 5), and a signed-off agreement to the
   specification's terms for text.
4. Each file states which licence covers it; LICENSE is replaced by the
   Apache-2.0 text, with the specification agreement beside it.
5. This is a legal instrument with long consequences. I am not a lawyer;
   the choice between the OWFa and the Community Specification License, and
   the identity of the signer, deserve an hour of counsel's time before the
   repository draws attention.

**Recommendation.** Apache-2.0 for code and vectors; OWFa 1.0 with the
non-assertion option for the specification; a contributor agreement in
CONTRIBUTING.md; trademark policy deferred but the name reserved in the
README. Reconsider the Community Specification License when the first
outside contributor to the specification appears.

## 15. The measurement spike: what ran, what changed, what awaits a decision

Run as redirected (§11) and extended by the owner: its job was to invent the
missing pieces in miniature and write them into the specification. The
evidence is in `spike/FINDINGS.md`; the code beside it is throwaway and is
to be deleted once this round is reviewed. Specification 0.7 is the result.

### 15.1 For each claim: did the specification suffice, what broke, what was invented

| Claim | Sufficed? | What broke | What was invented, and where it is now |
| --- | --- | --- | --- |
| Description to display list | No | No algorithm from text and spans to lines; `break` took a single run of one style; pagination was a sentence; no default sizes; a host reply in non-deterministic form was rejected by the kernel's one decoder | Blocks, runs, lines, rows; `break` as a line iterator; pagination with three rules (§5.7, §6.3, Appendix A) |
| The printer | Yes, and it was the wrong design | Nothing failed: all 24 runs at the specified level and two others passed. But every change resent a whole function, and all subjects said so | Code as description: functions as objects, bodies as sequences of statements in WebAssembly's vocabulary, edited by the four core operations, printed by a function of the kernel (§11.3–§11.5). Tried against the baseline under measures declared in advance |
| Light cone | No | Nothing said who writes summaries, when, or how good; a universe with none could not be navigated at all | A structural layer the kernel computes, always current; summaries as an optional layer attached by their pins; a rule for where a summary is worth writing; the summary tree deleted (§11.7) |
| Transmutation | Partly | A region's digest ignored spans; an anchor a Portal presents was not followed; the recipe could not be found once a person had edited the object; "regenerate" had no defined inputs | Digest covers what is anchored within a region (§4.4); `from.by`; the recipe; `refresh` and `recipe` (§8.3, §11.8) |
| Nested universes | No | A nested universe's records were unreachable by the definition of §1.3, so compaction would have discarded them | Reachability through an anchor's `u`; nested or linked decided by the presence of one commit; refs resolved in their own universe (§1.8, §2.5); vectors |

### 15.2 Size measurements

Kernel miniature: 1 613 lines of Rust, 102.5 KiB compiled, 44.7 KiB
compressed; about 50 bytes per line. Binding: 79 lines, 3.0 KiB
compressed. Printer within the kernel: 344 lines, 14 KiB. Described code:
2.8 times the size of its WebAssembly as values, 0.85 times after DEFLATE.

### 15.3 Decisions that are the owner's

1. **The printer redesign departs from the letter of a founding document.**
   The brief says the bytes are "the only artifact" and "the only thing
   that is authoritative". Version 0.7 stores the description and prints
   the bytes. The non-negotiable — printer and ledger replace the source
   tree; no human-readable source is required — is kept, and RATIONALE
   records the departure. Version 0.6 holds the earlier design whole. If
   the departure is refused, §11.3–§11.5 revert, and the patch operation
   the subjects asked for is added to the old vocabulary instead.
2. **The kernel's two limits disagree** by the one measurement there is
   (SPEC §12.2). Neither number has been changed.
3. **Canonical exports**: three options with measured sizes
   (`spike/FINDINGS.md` §6). Nothing chosen; §7.4 is unchanged.
4. **Licensing** (§14 above): proposed, nothing changed.
5. **The plain-text face of a Portal is its label** (§7.3), so nested or
   transcluded text does not appear in plain text. Left as specified;
   worth a second look.

### 15.4 Convergence, this round

| Measure | Before (0.6) | After (0.7) |
| --- | --- | --- |
| Gaps found | 49, by the second reader test, on the storage layer | 16, by the spike, on the layers above storage (listed in `spike/FINDINGS.md`); no reader test this round |
| Contradictions found | 5 | 3: "contains no further indirects" against the vectors; exports ordered "by bytes" against the order a map gives; reachability against nesting |
| Specification, words | 39 996 | 43 680 |
| Concepts | 39 | 39 |
| Defined terms | 127 | 129 (limit 130) |
| Operations, in all | 4 core + 12 printer | 4 |
| Node kinds; reference kinds | 4; 4 | 4; 4 |
| Kernel estimate | none measured | 1 613 lines → 102.5 KiB in miniature; the limits of 10 000 lines and 256 KiB cannot both hold at that density |
| Binding estimate | none measured | 79 lines, 3.0 KiB compressed, for half the drawing contract's items and one host function |

Fixes this round, classified:

- **Simplified (6):** printer operations, item keys, key-substituted
  hashes, the replay check and the stored module removed in favour of
  objects and sequences; the printer moved from a carried program to a
  kernel function; the summary tree (`parts`, the universe's `summary`)
  removed in favour of the outline; `parameters` of a derivation kept in
  one place; one ordering rule for everything keyed in a module; values
  kept outside may nest (a restriction removed).
- **Added (8):** composition (§5.7); `break` as a line iterator; the
  outline; `from.by` and the recipe; `try` and `call`; lifting of carried
  modules; the third way a pack may lack records (linked); defaults of a
  text.
- **Clarified (7):** reachability through anchors; refs resolved in their
  own universe; what a region's digest covers; an anchor's definition;
  frames on float axes; manifest requests; where the fuel export goes.

"Added" outnumbers "simplified", 8 to 6, and the specification grew by
3 700 words. The rule set for this work says to stop and say so when that
happens. The additions are the algorithms the owner asked the spike to
invent, and most replace prose that claimed more than it specified; but
the count is the count, and the document is now 9% longer than it was.

## 16. Decisions after the spike (owner, 2026-11-22)

1. **Printer redesign: approved.** The brief's wording, "the bytes are the
   only artifact", is superseded by its intent: code is description; a
   module's bytes are a deterministic face of that description, printed by
   a pure function and always verifiable against it. No human source tree,
   no build step, no separate ledger mechanism. Statements are addressed
   by their permanent identities. The trial's JavaScript printers are
   deleted with the spike; the kernel's printer is the only implementation.
2. **Kernel budgets: decided.** Measured with the reductions asked for
   (`spike/FINDINGS.md` §7): 78.4 KiB, 40 bytes a line. The compiled limit
   stays at 256 KiB, firm. The line limit is 6 000 lines of the kernel's
   own code, and the per-part budgets were divided again to sum to it
   (SPEC §12.2). Applying this showed that the compressed limit of 96 KiB
   could not hold beside it; the owner then resolved it: the size that
   travels is the firm limit — 128 KiB compressed; 256 KiB compiled is
   guidance derived from it at the measured 48%; a one-paragraph web
   envelope is 256 KiB in all; 6 000 lines stands.
3. **Canonical exports: reproducible given a named renderer** identified by
   its hash; a component fetched or carried only when such an export is
   requested, never part of an ordinary file's player. No engine chosen
   (SPEC §7.4).
4. **Licensing: decided and applied** (§14).
5. **Plain-text face:** nested universes in the pack contribute their text,
   marked, to the reader's depth limit; linked ones show label and
   reference; paragraph breaks and list markers are kept (SPEC §7.3).
6. **"Added" over "simplified" accepted for that round**; the specification
   was then read end to end and tightened: 43 675 words before, and the
   count after is in the round's report.
7. **Per-object overhead recorded** (`spike/FINDINGS.md` §8); no change.

Next, in order: the cold re-review of the tightened specification with the
updated VISION-TRACE.md; then, after the owner's review, the strict
spec-first reader test; then a spike on the thinnest row, the self-opening
web envelope.

For that envelope spike, asked by the owner and not to be started before
it: evaluate whether an encoding denser than base64 can carry the kernel
and the pack safely inside a web page — valid under the HTML Standard, with
no reliance on parser error recovery — and measure the saving.

## 17. The cold review of version 0.7, and the response

A reviewer with no part in the writing read version 0.7 (commit `010c2d5`)
against the project's founding intentions and reran what could be rerun.
It made 55 findings: 9 contradictions or failures of a stated claim, 18
serious gaps, 16 places where the text could not be built from, 12 small
ones. All were accepted. The review and the response to each finding are
kept outside this repository.

**What changed.**

- The onboard tools could not work as specified: a nested universe cannot
  reach the universe around it. A presenter may now hand a *subject*
  universe to what it presents (SPEC §5.6, §6.6).
- Line breaking was the host's, so there was one implementation per host
  and another in any renderer. The kernel now breaks every line and asks
  the host only what a run of text measures (§5.7, §6.3).
- Written where there had been a name or a paragraph: the pin's digest,
  grid, absolute position and clocks, the formula operators, the kernel's
  own capability operations, how a Compute-let is started, snapshot and
  replay formats, the renderer's interface, the envelope template, what an
  agent writes, where summaries live.
- Code has a *unit hash* and a Compute-let a *program hash* (§11.3).
  Vector instructions are excluded, for determinism.
- VISION-TRACE.md is re-rated at each row's weakest status: 2 tested, 11
  tested in miniature, 14 specified and untested, 17 thin.
- CORE.md gained what it omitted and no longer claims two pages.
  RATIONALE.md states the spike's stand-ins and lists twelve departures.

**What none of this is.** Every fix is text. None has run, and none has
been reviewed.

**Open, and owed a decision.**

1. *Length.* The specification is 48 681 words, up from 43 339. The review
   found it too long before the fixes. Splitting it into a core and
   profiles, and moving the worked examples out, are the options on the
   table.
2. *Terms.* Counted honestly there are 144 defined terms against a limit
   of 130 (§12.1). The limit has not been moved.
3. *Capability operations.* 55 of a limit of 64, with seven optional
   capabilities unwritten; `gpu` is 27 of them.
4. *The two redesigns above* await the owner's confirmation.

**Open, and owed work.**

- No vectors yet for composition, pagination, the plain text of lists,
  the layers of what travels, outlines, projections or an envelope.
- What line breaking and bidirectional ordering add to the kernel's size
  is unmeasured, against a firm limit.
- Exhausting the call stack is not yet deterministic across engines.
- Floats and hit testing are rules, not algorithms.
- A continuous anchor survives a shift or a scale; content cut from the
  middle of a timeline is safe only if anchored to an object that moves
  with it (rule **A4**).

Next, after the owner's review: the strict spec-first reader test, then
the envelope spike.

## 18. Version 0.8: the specification in parts (owner's decision, 2026-11-22)

The specification is now a core and four profiles, with the worked
examples and the application mapping as companions. Section numbers run
through all the documents. Entries above this one, and
`spike/FINDINGS.md`, cite the single document's numbers of their time;
this table converts them.

| Up to 0.7 | From 0.8 | Document |
| --- | --- | --- |
| §0–§4 | §0–§4 | SPEC.md (core) |
| §8.1, §8.2, §8.3, §8.5 | §5.1–§5.4 | SPEC.md |
| §12 (intro), §12.1 | §6, §6.1 | SPEC.md |
| §16 glossary, §15 checklist | §6.2, §6.3 | SPEC.md |
| §5.1–§5.7 | §7.1–§7.7 | SPEC-PRESENTATION.md |
| §8.4 Portals | §7.8 | SPEC-PRESENTATION.md |
| §7.1–§7.4 | §8.1–§8.4 | SPEC-PRESENTATION.md |
| §6.1–§6.6 | §9.1–§9.6 | SPEC-PLAYER.md |
| §7.5, §11.7, §11.8 | §10.1, §10.2, §10.3 | SPEC-PLAYER.md |
| §12.2, §12.3 | §11.1, §11.2 | SPEC-PLAYER.md |
| §11.1–§11.6 | §12.1–§12.6 | SPEC-EXECUTION.md |
| §9.1–§9.5 | §13.1–§13.5 | SPEC-TRAVEL.md |
| §10.1–§10.6 | §14.1–§14.6 | SPEC-TRAVEL.md |
| §14 | §15 | EXAMPLES.md |
| §13 | §16 | MAPPING.md |

Appendices keep their letters: C, D and F with the core, A with
presentation, B with the player, E with execution. Rule labels are
unchanged.

Word counts are in §19.

## 19. Version 0.8: decisions after the review response, and what was done (2026-11-22)

**The owner's decisions.**

1. Split the specification (§18).
2. **Nothing normative without something that exercises it**: a vector,
   a test or running code. A finding answered only in text is "open,
   text only". Now in CONTRIBUTING.md; VISION-TRACE.md ends with the
   register of what is still only text.
3. Give each overloaded word one meaning, then count concepts honestly
   and set the limits at the counts.
4. Count `gpu` operations apart; the limit of 64 covers the format's own.
5. Subjects approved, on two conditions: only a reader hands one over
   (**F6**), and a change through one passes the usual gate (**F7**).
6. The kernel breaks lines: approved; measure it against 128 KiB
   compressed in the next build, and bring the numbers if it does not fit.
7. Vector instructions excluded for now, with the way back recorded
   (SPEC-EXECUTION §12.2).
8. Evaluate time as a sequence, for the finding that continuous anchors
   survive only a shift or a scale.
9. Order: split and disambiguation; vectors; then the reader test on the
   core alone; then the envelope spike.

**One meaning each.** A removed element leaves a *tombstone*; "marker"
is a list item's. A *run* is consecutive elements; what a host measures
is a *piece* of text; the capability that reaches the host's engine is
`engine`. A *frame* is a unit of a pack; an axis has a *scale*; a
component exports `tick`; a video has *pictures*. A *region* is what an
anchor names; the space-mapping primitive is a *pane*; fuel is charged by
*stretch*. The *root hash* is a commit's. *Settings* are what a
presentation holds for its viewer; a Compute-let's property is
`snapshot`; a projection's field is `status`. An *absent* frame says what
a pack lacks; a *note* is words on a change. A *cache* is what can be
rebuilt; bytes fixed by the printing rules are *implied*; *derived* means
having a derivation. *Identity* and *state* each have one definition that
covers two things (object and element; universe and machine), and *item*
is a member of any list: the owner may want those three split further.

**Honest counts.** 121 concepts and 174 defined terms, with no
classification to shelter under: 58 concepts in the core, 63 in the four
profiles. The earlier 39 answered a different question. The limits are
121 and 174, and neither grows without displacing something.

**Time as a sequence: adopted.** A clock may hold `t` as a *count*, a
sequence whose elements are flicks and carry no content. A cut is a
splice. An anchor into time names elements. What plays is attached by
`plays`, as spans are attached to a text, and its time is a function of
the element's identity, so a cut from the middle skips what was cut.
Nothing was added to storage but the count. Space has no order for a
splice to act on, so rule **A4** stands there. Vector: `timeline.ufx`.

**Vectors.** The spike kernel is back under `spike/`, by the owner's
direction, to produce provisional vectors. It gained line breaking
(UAX #14) and bidirectional ordering (UAX #9), which pass the Unicode
16.0 conformance files in full: 16 672, 91 707 and 770 241 cases.

| Vector | Made by | Checked against |
| --- | --- | --- |
| `timeline.ufx` and its group | generator | the kernel: agree |
| `digests` | generator | the kernel: agree |
| `provisional/staleness.json` | kernel | nothing |
| `provisional/layers.json` | kernel | nothing |
| `provisional/projections.json` | kernel | nothing |
| `provisional/composition.json` | kernel | nothing |

Generator and kernel share an author. Nothing here is independent.

**What making them found.** 64 places where the text did not decide:
24 in `spike/QUERY-NOTES.md`, 40 in `spike/COMPOSITION-NOTES.md`. Among
the more serious: the current object map is in no travel layer; an
outline's ranges have no record; the section rule gives no structure to
a text with one heading at each of two levels; how a line that starts
inside a piece is measured; which characters end a line; a tall inline
box is placed partly above its row by the rules as written. None is
fixed yet: by rule 2, a fix needs a vector with it.

**Size.** The spike kernel as it stands is 3 836 lines, 251.7 KiB after
size optimisation and 112.5 KiB compressed: 88% of the firm limit, for
perhaps half a kernel. It is built with the standard library and uses
general text formatting for projections, so it is not comparable with
the 78.4 KiB of §15. Line breaking and bidirectional ordering are about
9.8 KiB of it, compressed. The comparable build belongs to the envelope
spike, and the owner has asked for the numbers if it does not fit.

**Words.** Core 20 400; presentation 9 900; player 9 200; execution
5 300; travel and trust 4 800; examples 3 000; mapping 1 100. Total
53 700, against 48 681 as one document: the split added preambles and a
glossary to each part, and the timeline, the subject rules and the
provisional-vector notes added the rest.

Next, after the owner's review: the strict spec-first reader test on the
core alone; then the envelope spike.

## 20. The strict reader test of the core, and what followed (2026-11-22)

**Decisions before it (owner).** Qualifiers, not new words: object
identity and element identity; universe state, machine state and
presentation state. The honest count is therefore 123 concepts and 176
terms. One defect fixed first, with a vector: the current object map is
content (`published.ufx`). CONCEPTS.md ranks the 123 for a later
simplification pass. The envelope spike will begin by building the kernel
comparably and projecting its full size; if that exceeds 128 KiB
compressed, work stops for options.

**The test.** An implementer with no part in the project was given the
core document and the eight pack files, and nothing else: no other part
of the specification, no generator, no kernel, no expected values. It
wrote a reader in Python. Only then were the expected values released,
and its untouched reader compared with them.

| | |
| --- | --- |
| Packs opened | 8 of 8 |
| Changes replayed to exactly the committed state | every one whose work is present |
| Expected values compared | 311 |
| Agreed on the first run | 304 |
| Of the 7 that differed | 1 an error in its own comparison; 2 errors in Appendix F's prose, now corrected; 4 from the layers of what travels |
| Misreadings of §1 to §5 | none |
| Places it found the text unclear | 52 |

It reproduced, from the text alone, the timeline vector (38 values), the
digests and the provisional staleness values (24), and the published copy
(13). Those are no longer checked only by their author.

**What it could not do from the core.**

1. *Clip a continuous region.* The extent of an axis is declared in the
   presentation part. It guessed, and the guess matched.
2. *Tell withheld from damaged.* §2.5 depends on "live" and on the three
   layers, which the travel part defines. Its guess gave the right layers
   for two packs and the wrong ones for two: it took every change to be
   attribution, where the kernel takes only those a live object names. It
   also found that §2.5's list of what may be absent omits a commit's
   change, so that a published copy of two packs read as malformed.
3. *Compute a digest in general.* The two pins in the vectors agree; four
   choices the rule leaves open were not exercised.

It also found: the asset section calls `bytes` a sequence while the
vector sets it whole; a play whose first element is cut has no defined
time base; the list of sections said to suffice for an independent
reader names one that is not in the core; and that in a published copy
of a universe that nests another, nobody can say who wrote the nested
text.

**The judgment it gave.** Storage can be built from the text alone.
Addressing and travel cannot yet, for the three reasons above.

Its notes, both phases and its reader are kept outside this repository.
Nothing it found has been fixed yet, except the two wrong sentences in
Appendix F: by the rule, each fix comes with a vector.

Next, after the owner's review: the envelope spike, beginning with the
kernel's size.

## 21. The core revised, and the second reader test (2026-11-22)

**Decisions (owner).** Fix the first reader's seven findings in the core,
each with a vector; the core must not depend on the profiles. Vector
status in three levels: provisional, reproduced, confirmed. The founding
names — Chronicle, ledger, light cone, player, onboard tools — are kept
and counted as names: 118 concepts and 5 names. The mechanism candidates
of CONCEPTS.md wait for a simplification pass after the envelope spike;
reproducible exports may be deferred there only as a later profile with
its design hook kept. Then the envelope spike, stopping if the kernel
projects over 128 KiB compressed.

**What changed in the core, with the vector that exercises each.**

| Finding | Now | Vector |
| --- | --- | --- |
| Where a continuous axis ends | an extent is a closed pair in present coordinates; the core defines a clock's and an asset's; an unknown one is reported unclipped (§4.2, §4.3) | `pins.ufx` |
| Withheld, or damage | live, and the three layers, defined in the core; a commit's change may be absent where it is not attributing (§2.5) | `published-timeline.ufx` |
| The digest's open choices | points, removed elements, empty maps, the pinned object, `snapshot` and `of` settled (§4.4) | eight cases in `pins` |
| Asset bytes | set whole; a continuous axis in whole bytes (§5.2) | `pins.ufx` |
| A play whose start is cut | its time base is read from its anchor (§4.5) | fourth commit of `timeline.ufx` |
| Who wrote nested text | a nested universe's attribution travels with it (§2.5) | `published-nested.ufx` |
| The sufficiency list | names this document only (**P19**) | — |

Two things were simplified to keep the core whole. The digest no longer
leaves out children that lie outside a continuous region: a pin to part
of an ordinary clock is stale when any child changes, and a timeline
keeps its precision through plays. And three things the travel part used
to place in the layers that always travel — support that evidence names,
earlier revisions pinned as support, summaries — are not yet placed by
the core's rule, and the travel part says so.

**The second test.** Same brief (`reader-test/INSTRUCTIONS.md`), a fresh
implementer, the revised core, eleven packs.

| | First test | Second test |
| --- | --- | --- |
| Packs opened | 8 of 8 | 11 of 11 |
| Expected values compared | 311 | 458 |
| Agreed on the first run | 304 | 456 |
| Differences that were the text's defect | 4 (the layers) | 0 |
| Differences that were the vectors' prose | 2 | 0 (two descriptions were vague, now corrected) |
| Differences in the reader's own check | 1 | 2 |
| Times it had to read bytes to decide | several | once: the clock's type name |
| Notes on unclear text | 52 | 52 |

Its judgment: yes, the core can be built from its text alone. Its
caution: the score overstates the evidence. It made about fifty
choices of interpretation; the vectors reach perhaps half; a second
implementer choosing differently elsewhere would also score in full.
Nothing it was given exercises refusal of a change, `forget`, absent
chunks, unknown codecs, damaged maps, an anchor to an earlier commit, or
keyed regions over a list of refs.

**Open in the core after it**, none yet fixed, each owed a vector:

1. Missing chunks: "absent blobs" says they are unavailable; **P11** says
   anything missing from the content layer is damage, and the content
   layer includes chunks.
2. The clock's type name and properties are not tabulated in the core.
3. The digest: whether `of` and `snapshot` apply at any depth; that the
   holder of a pin is not an input; the bytes of step 3; detached and
   multi-axis cases.
4. A point written with two different boundaries is detached by the
   letter of **A1**. Both readers followed the letter and questioned it.
5. Recovery: **P3** asks for an ancestry check "with no index and no
   scan"; a node that breaks **C1** ends the scan and hides later heads.
6. Layers: an anchor's `r`; whether removed runs make a change
   attributing; which map nodes an earlier-commit anchor needs.
7. How a profile's name appears in `features`; splice written as steps;
   what conservation does not compare.

**Vector status.** Every group of the core is now *reproduced*. Nothing is
*confirmed*: both readers are of the model that wrote the specification.
`python3 reader-test/package.py` builds the archive for an implementer
of another kind.

## 22. The envelope spike, first step: the kernel's size, and a stop (2026-11-22)

The owner asked for a comparable build of the kernel — no standard
library, size-optimised, no general text formatting — its compressed size
by part, and a projection to the full kernel, with work to stop if the
projection exceeds 128 KiB compressed. It does, as built. Work on the
envelope has stopped for the owner's decision.

**Measured** (`spike/SIZE-NOTES.md`; the build was repeated and the
vectors and the Unicode conformance files re-run on it):

| Build | Size-optimised | Compressed |
| --- | ---: | ---: |
| As it stood: standard library, text formatting | 264 289 | 117 951 |
| No standard library, no text formatting (stable compiler) | 219 754 | 97 207 |
| The same on a nightly compiler, panics compiled out, library built for size | 189 077 | 87 560 |

By part, compressed, in the stable build:

| Part | Lines | Compressed bytes |
| --- | ---: | ---: |
| Allocator | – | 1 899 |
| Inflating (the host's work by the specification; not counted below) | – | 4 915 |
| Values and hashing | 364 | 6 251 |
| Pack, objects, blobs | 368 | 7 012 |
| Composition, without the two Unicode algorithms | 790 | 17 901 |
| Line breaking: code, table | 174 | 1 355, 2 561 |
| Bidirectional ordering: code, tables | 329 | 3 333, 1 867 |
| Printer | 351 | 5 034 |
| Queries: regions, digests, timelines, layers | 507 | 24 440 |
| Projections | 653 | 20 300 |
| Glue | 166 | 339 |

Line breaking and bidirectional ordering together are 9.1 KiB
compressed: 7% of the limit. The owner asked for this number
specifically; they fit.

The kernel's own 3 702 lines compress to about 86 000 bytes: 23.2 bytes a
line, against the 19 on which the 6 000-line budget was set. The excess
is in the two newest parts. Queries and projections, written quickly,
use the library's sorted maps and its stable sort, which the compiler
copies in for each type: those two things are a fifth of the whole
build.

**Projected to a full kernel of 6 000 lines**, with the allocator and
tables added and inflating left to the host:

| Assumption | Compressed | Against 128 KiB |
| --- | ---: | --- |
| As built: 23.2 bytes a line | about 142 KiB | **over by 11%** |
| With the two mechanical changes not yet made (one small sort; sorted lists for maps), estimated at 13 000 bytes | about 122 KiB | under by 5% |
| Nightly compiler flags instead, no change to the source | about 127 KiB | under by 1% |
| Both | about 112 KiB | under by 13% |

Three cautions. The estimates for the changes not made are estimates.
The 6 000 lines are themselves an allocation: composition is at 1 293
lines of its 1 500 with grid, absolute position, clocks and hit testing
unwritten, and formulas (700 allocated) and all writing of changes are
not started. And compressed sizes of parts do not add exactly: the
breakdown is good to about a tenth.

**Options for the owner.**

1. *Make the two mechanical changes and measure* before anything else.
   A day's work, no change of behavior, and it replaces an estimate with
   a number. On the estimate, the projection passes with 5% to spare.
2. *Build with the nightly compiler's size flags.* 9 600 bytes for
   nothing in the source, at the price of a kernel that cannot be
   reproduced with a stable compiler. It could be kept in reserve.
3. *Carry parts of the kernel only when a file needs them.* The printer
   (5 KiB) matters only to a file with code; the projections' text for
   agents (20 KiB as built) only where an agent or the tools ask. The
   founding rule that a file carries only the components its content
   requires allows it. The firm limit would then bind the part every file
   carries. It costs the plainness of "one kernel", and a second way for
   a file to be incomplete.
4. *Lower the line budget to what the density allows.* At 23.2 bytes a
   line, 128 KiB holds about 5 400 lines; at 19.7, about 6 300.
5. *Raise the limit.* Not recommended: nothing measured yet says the
   work cannot be done within it.

Recommended: option 1 now, with option 2 in reserve and option 3 as the
design to turn to if, with formulas and the rest written, the measured
kernel still crowds the limit.

## 23. Decisions on the kernel's size, and what "done" means for the envelope (owner, 2026-11-22)

**Size.** The two mechanical changes are made and measured. The inflater
leaves the kernel: inflating is the host's. Nightly compiler flags are
rejected, even in reserve: a kernel is named by its hash in every file,
so anyone must be able to rebuild those exact bytes from source with a
stable toolchain; that is now a requirement of the budgets section. The
line budget is set from the density measured after those changes. The
limit stays at 128 KiB compressed. Queries and projections, the heaviest
and newest parts, are in scope for the simplification pass.

**The planned escape route**, not designed and with no specification text
until it is needed: if the full kernel still crowds the limit once
formulas and the write path exist, parts of it are carried only by files
that need them — the printer by files with code, the agent's projections
where an agent or the tools ask — in keeping with the founding rule that
a file carries only the components its content requires. The firm limit
would then bind what every file carries.

**The envelope spike's acceptance test** is the founding one. On a clean
machine and a clean phone, with nothing installed but a browser, a
received file can be: opened; read in at least two faces; edited through
its onboard tools, one paragraph changed with attribution recorded;
saved as a new travel-form file; reopened identically; sent on. Each
step is reported passed, failed or not attempted, per platform. Opening
alone is not the milestone.

Phones are reported as a person meets them: on an iPhone, the Files app,
Mail and Messages attachments, Safari and a hosted copy, saying exactly
what is seen on each, and the static face must give clear next steps
wherever scripts do not run. Android likewise where one can be reached.

The onboard tools appear in the spike in minimal form: subject handoff,
one edit through the normal gate, save.

**Independence.** The next independent reader is to come from a different
model family. The owner is running the outside package with another
model; "confirmed" waits for its result.

**During the spike the documents do not grow.** Findings go to the
spike's notes. The specification changes only where a vector or a
running test comes with the change.

**Future milestones, recorded and not begun.**

1. *The maintenance-cost benchmark.* A real program of meaningful size
   with a planted bug, maintained once as a conventional codebase and
   once as a UFO with its Chronicle and outline. The tokens spent finding
   the bug are measured apart from those spent fixing it.
2. *A real-model transmutation.* One face derived by an actual model
   through `derive` and `refresh`, replacing the stand-in.
3. *The light cone inside the kernel*, run on a pack, replacing the
   object model written for the first spike.

**Measured after the changes** (`spike/SIZE-NOTES.md`): 150.5 KiB
size-optimised, 70.1 KiB compressed, for 3 907 lines of the kernel's own.
The small sort saved 5.3 KiB compressed, sorted lists 14.9, removing the
inflater 4.8. Queries and projections halved. 16.7 compressed bytes a
line; the firm limit holds about 7 400 lines; the budget is set at 7 000
(SPEC-PLAYER §11.1), which projects to about 120 KiB. Three clean builds
with the stable compiler give identical bytes, and the nightly flags that
were rejected would now save under half a kibibyte. The projection is
under the limit, so the envelope spike continues.

## 24. The envelope spike: the round trip, in one browser engine (2026-11-22)

The founding acceptance test, run in headless Chromium, the only engine
available here (`spike/envelope/`; 125 checks, all passing):

| Step | From disk | From another origin | Phone-sized, touch (emulated) | Scripts off |
| --- | --- | --- | --- | --- |
| Opened, with no network request but the file | passed | passed | passed | — |
| Read in two faces (three are offered) | passed | passed | passed | — |
| One paragraph edited through the tools, attribution recorded | passed | passed | passed | — |
| Saved as a new travel-form file | passed | passed | passed | — |
| Reopened to the same state; edited and saved again | passed | passed | passed | — |
| Sent on: opened elsewhere; replayed by the independent reader | passed | passed | not attempted | — |
| Static face: the text, and what to do next | — | — | — | passed |

**Not attempted anywhere:** Safari, any WebKit, Firefox, a real iPhone or
Android phone, a file preview, Mail, Messages, AirDrop, the share sheet.
The emulated phones are Chromium with a small screen and touch. The
owner is testing a real iPhone with the kit in `spike/envelope/phone/`;
a branch `pages` holds the two test envelopes for the hosted path, and
is to be deleted afterwards.

**Sizes.** The envelope of the test document is 152 KiB against 256. The
kernel in it is 83.6 KiB compressed, with the write path. The binding is
100 lines and 10.3 KiB; with the reader's shell the script is 17.9 KiB,
over the 16 KiB set for the binding as shipped, unminified.

**A denser encoding than base64** was built and measured. 6.75 bits a
byte is reachable in valid HTML against base64's 6; the envelope shrinks
8.4%, and grows 10.5% wherever a transport compresses it. It also loses
fixed offsets into the pack and survives no tool that tidies text. Not
recommended; base64 stays.

**What the specification got wrong or left open**: 35 places, in
`spike/envelope/NOTES.md`. The ones that matter most: a page cannot read
its own bytes, so "the fixed parts of the very page" works only if the
exporter writes the page exactly as a browser would write it back, which
the text does not say; the tools universe as specified cannot carry its
own meaning, and the reader's shell holds it; there may be no truthful
instruction for opening a local web page in a phone's browser; an edit
replaces a whole paragraph, so the whole paragraph is attributed to
whoever changed one word; text typed at the very start of a paragraph
joins the one before.

None of these is fixed in the specification: by the owner's rule for the
spike, findings stay in the spike's notes until a fix comes with a test.
