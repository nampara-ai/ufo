# UFO: mapping an application's records

**A companion to the specification, version 0.8. Not normative.**

An argument, worked on paper for one application, that software with a
richer provenance model of its own can write its records into a UFO and
read them back without loss. It has not been run. Section numbers are
those of the specification: §0–§6 in [SPEC.md](SPEC.md), §7–§8 in
[SPEC-PRESENTATION.md](SPEC-PRESENTATION.md), §9–§11 in
[SPEC-PLAYER.md](SPEC-PLAYER.md), §12 in
[SPEC-EXECUTION.md](SPEC-EXECUTION.md), §13–§14 in
[SPEC-TRAVEL.md](SPEC-TRAVEL.md).

---

## 16. Mapping a rich editing application

The provenance model of §1.7 and §5.4 belongs to the format. This section
argues that an application with its own, richer provenance system can write
its records into a UFO and read them back without loss. Cursive, a writing
application that attributes every AI contribution to the prompt and
generation behind it, is the example because its records are known in detail. It is not the authority,
and this mapping has been worked on paper against its record definitions,
which are not reproduced here; it has not been run, and losslessness is a
claim to be tested (§16.4), not a result.

### 16.1 The principle

An application writes two things and only two:

1. **Portable facts**, in the format's own terms. These are what any other
   reader understands.
2. **Residual fields**, as properties under the application's prefix, on the
   same objects. These are what only it understands. Every other writer
   preserves them (**C6**).

No fact is written in both. If a portable fact can be computed from a
residual field or the reverse, only the portable fact is stored.

### 16.2 Cursive's records

| Cursive record | In a UFO |
| --- | --- |
| Note source (Markdown) | a text with `syntax` `text/markdown`; `chars` is the source, exactly; spans derived by Cursive's parser, with `markup` spans over markup (§5.1) |
| Attribution segment `[from, to)` in editor positions | not stored; it is the `seq` of the text, whose elements name their changes. Cursive converts between its positions and character positions using its own parse of the same source |
| Generation record: prompt, model, operation, conversation, original and generated text | one change. `origin` is `{basis: witnessed, by: model, model, prompt, context, asked, parameters}`; the prompt and conversation are text objects; the generated text is the `ins` of the change's splices; the original text is their `old` |
| Parent and derived-from generation ids | `origin.context` pins to the earlier changes; which is which is kept in `io.cursive.lineage` on the change |
| Retrieved sources, with bibliographic fields and content hash | objects of type `io.cursive.source` holding those fields; evidence of kind `consulted` from the generated region to each (**R3**) |
| User change record, made by typing in the editor | a change with `origin` `{basis: witnessed, by: person}` |
| Attribution established by aligning text | `{basis: inferred, by: person` or `model, method: text-alignment, confidence}`, where Cursive's precision grade (`exact-mark`, `exact-text`, `single-window-text`, `fallback`) is the confidence (**R2**). If the alignment is done as the edit is saved, this is the `origin` of that change; if it is done later, it is an entry in a later change's `attributions` (§5.4) |
| External or pasted content with no record | a change with `origin` `{basis: unknown}` |
| Content written by the application itself (restore, system) | a change with `origin` `{basis: witnessed, by: tool}` |
| Copy and paste with a transfer record | a change whose `origin` is `{basis: witnessed, copied: pin to the source region}`; the destination needs no new generation record, because origin follows `copied` (§5.4) |
| Acceptance, unacceptance | decisions with verdict `accept` and `retract` about the generation's change (**R6**, **R7**) |
| Generation deleted with a review action | the splice that removes the text, with a decision of verdict `reject` or `revise` |
| Generation declined before entering the document | the generated text kept as a text object referenced by nothing in the document, its change carrying a decision of verdict `reject` |
| Source-edit ledger entry: baseline hash, old text, contexts, replacement | a splice: the elements removed, `old`, `ins`, applied to the parent commit. The context fields exist to locate an edit unambiguously; element identities already do |
| Shadow workspace result | the change computed from the shadow's bytes against the baseline (**L1**); the agent session is the `actor` |
| Version, with label and source | a commit whose change carries `io.cursive.version` with the label and source. Every commit is restorable, but only these are Cursive's versions |
| Snapshot, by content hash | a revision, by revision hash |
| Restore | a change whose operations return the text to an earlier state, with `copied` pinning that revision |
| Document duplicate (fork) | a copy of the pack: same lineage, same history, diverging from the next commit |

### 16.3 What needs a residual field

| Cursive fact | Why it has no portable form | Stored as |
| --- | --- | --- |
| Separate attribution of formatting marks | portable: a change that sets a span has its own `by`. The opaque mark signature is Cursive's | `io.cursive.mark` on the span |
| Open vocabularies: operation, mode, macro id, decline reason, mark policy | application meaning | `io.cursive.*` on the change |
| Event identifiers and their original order | the Chronicle orders changes; Cursive's ids are its own | `io.cursive.event` on the change |
| Diagnostics, projection-saved witnesses | derived or local; a UFO's digests and conservation check do this work | not written |

### 16.4 Reading back, and the test

Cursive rebuilds its records from the Chronicle: segments from `seq`,
generation records from changes with model origin, acceptance state by
**R7**, versions from commits.

Every reader, not only Cursive, then shows aligned attribution for what it
is: inferred, by a named method, with a grade — distinct from text whose
origin was witnessed, and distinct from text of unknown origin.

When a Cursive document is sent, the default of §13.3 applies: who and what
wrote the text that is present travels; prompts, conversations, declined
generations and earlier versions stay behind unless the person includes
them.

The mapping is lossless if, for a Cursive document *D*: writing *D* to a
whole UFO, opening that UFO in a reader that knows nothing of Cursive, making an
edit there, and reading the result back into Cursive yields every record of
*D* unchanged, plus records for the foreign edit. That round trip is a
required conformance test for any application claiming to write this
profile.

One difference of principle remains and should be resolved in Cursive, not
in the format: Cursive keeps a second, element-level journal beside its
Chronicle. A UFO has one history. An application with two must choose which
is its record of origin.

---
