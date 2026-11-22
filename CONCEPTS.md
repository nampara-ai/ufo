# The 123 concepts, ranked

Input to a simplification pass. Nothing in the specification is changed by
this document.

**Decided by the owner since it was written (2026-11-22).** The five
founding names — Chronicle, ledger, light cone, player, onboard tools —
are kept as the vision's vocabulary and counted as names, not
mechanisms: the specification now counts 118 concepts and 5 names, and
candidates D4, D5, D9, D24 and the "player" part of D8 below are closed.
The seven mechanism candidates of section 2 go to the simplification pass
after the envelope spike. Deferring reproducible exports (R4) is
acceptable there only as a later profile with its design hook kept, not
as removal. The `snapshot` property and the `status` field keep their
names. The ranking below still numbers all 123.

The specification counts 123 concepts: every idea a capable newcomer must
learn to understand or build the format, counted without classification
(SPEC §6.2). It was 121 when first counted honestly; giving "identity" and
"state" their qualifiers made them five entries where there had been
three. Earlier drafts reported 39 by listing only what could not be
composed from something else.

This document ranks the 123 by how essential each is, then lists the
candidates for removal, merging or demotion, with what each would save
and what it would cost.

**Three words used below.**

- *Demote*: stop defining the term. The text says the same thing in
  plain words where it is needed. The mechanism stays. This lowers the
  count and lightens the reading; it removes nothing a builder must
  build.
- *Merge*: two concepts become one, because one is a case of the other.
  The mechanism stays, described once.
- *Remove*: the mechanism goes. This is the only kind that makes the
  format smaller.

## 1. The ranking

### Tier A: the format cannot be explained without these (25)

A stranger who learns only these knows what a UFO is.

| # | Concept | Part | Why it is irreducible |
| --- | --- | --- | --- |
| 1 | Record | core | the unit of storage |
| 2 | Hash | core | the name of every record |
| 3 | Value | core | what a record holds |
| 4 | Object | core | the unit of content |
| 5 | Object identity | core | how an object is named for ever |
| 6 | Revision | core | one state of an object |
| 7 | Commit | core | fixes a state and its history |
| 8 | Universe | core | the whole |
| 9 | Change | core | the only way a universe moves |
| 10 | Operation | core | what a change does |
| 11 | Element | core | what attribution and anchors attach to |
| 12 | Element identity | core | how an element is named for ever |
| 13 | Anchor | core | the one way anything attaches to anything |
| 14 | Region | core | what an anchor names within an object |
| 15 | Pin | core | how a derived thing knows it is out of date |
| 16 | Origin | core | where content came from |
| 17 | Pack | core | the file |
| 18 | Primitive | presentation | the vocabulary of description |
| 19 | Face | presentation | what a person opens |
| 20 | Portal | presentation | one thing inside another |
| 21 | Kernel | player | the one implementation |
| 22 | Capability | player | the unit of permission |
| 23 | Compute-let | execution | behavior |
| 24 | Envelope | travel | how a file opens with nothing installed |
| 25 | Seal | travel | who vouches for a state |

### Tier B: needed to build a part correctly (61)

Each is a real mechanism or a distinction a builder gets wrong without.

| # | Concept | Part | # | Concept | Part |
| --- | --- | --- | --- | --- | --- |
| 26 | Ref | core | 57 | Clock | core |
| 27 | Indirect | core | 58 | Timeline | core |
| 28 | Blob | core | 59 | Span | core |
| 29 | Object map | core | 60 | Asset | core |
| 30 | Universe object | core | 61 | Presentation state | presentation |
| 31 | Universe state | core | 62 | Handler | presentation |
| 32 | Root hash | core | 63 | Projection | presentation |
| 33 | Sequence property | core | 64 | Display list | player |
| 34 | Tombstone | core | 65 | Binding | player |
| 35 | Laws of change | core | 66 | Host interface | player |
| 36 | Work | core | 67 | Presenter | player |
| 37 | Frame | core | 68 | Outline | player |
| 38 | Head | core | 69 | Summary | player |
| 39 | Axis | core | 70 | Manifest | execution |
| 40 | Digest | core | 71 | Module | execution |
| 41 | Stale | core | 72 | Statement | execution |
| 42 | Derivation | core | 73 | Printer | execution |
| 43 | Evidence | core | 74 | Fuel | execution |
| 44 | Decision | core | 75 | Machine state | execution |
| 45 | Basis | core | 76 | Snapshot | execution |
| 46 | Nested | core | 77 | Test | execution |
| 47 | Linked | core | 78 | Promotion | execution |
| 48 | Feature | core | 79 | Content layer | travel |
| 49 | Text | presentation | 80 | Attribution layer | travel |
| 50 | Path | presentation | 81 | Working history | travel |
| 51 | Raster | presentation | 82 | Principal | travel |
| 52 | Samples | presentation | 83 | Grant | travel |
| 53 | Pane | presentation | 84 | Membrane | travel |
| 54 | Group | presentation | 85 | Formula | presentation |
| 55 | Surface | presentation | 86 | Layout | presentation |
| 56 | Data | presentation | | | |

### Tier C: names for things already understood (37)

Each names a combination, a role or a case. The format would work
unchanged if the word were never defined.

| # | Concept | Part | What it is, in plain words |
| --- | --- | --- | --- |
| 87 | Reader | core | software that opens a file |
| 88 | Writer | core | software that changes one |
| 89 | Agent | core | software acting through the kernel's functions |
| 90 | Host | core | the platform a reader runs on |
| 91 | Veiled | core | a way an indirect can be written |
| 92 | Lineage | core | a property of the universe object |
| 93 | Profile | core | a feature that defines types |
| 94 | Chronicle | core | the chain of commits |
| 95 | Compaction | core | rewriting a pack without what is unreachable |
| 96 | Scale | core | a mapping an axis may hold |
| 97 | Recipe | core | a derivation with the origin of its change |
| 98 | Rendition | core | an asset with a derivation |
| 99 | Transmutation | core | objects a model derived |
| 100 | Finding | core | a later statement of origin |
| 101 | Attribution | core | origin, evidence and decision, read together |
| 102 | Subject | presentation | a universe a reader hands to a tool |
| 103 | Plain-text face | presentation | a face that is text |
| 104 | Export | presentation | a face sampled and encoded |
| 105 | Renderer | presentation | a Compute-let that draws exports |
| 106 | Poster | presentation | the rendition shown when a program cannot run |
| 107 | Player | player | kernel, binding and presenters |
| 108 | Carried presenter | player | a Compute-let that draws a surface |
| 109 | Component | player | a Compute-let the player relies on |
| 110 | Drawing contract | player | the fixed form of the display list |
| 111 | Onboard tools | player | the kernel's functions and their interface |
| 112 | Tools universe | player | that interface, as a universe |
| 113 | Light cone | player | outlines with summaries |
| 114 | Agent interface | player | the kernel's functions, as an agent calls them |
| 115 | Program hash | execution | the hash of what a Compute-let would run |
| 116 | Lifted | execution | of a compiled module: turned into description |
| 117 | Ledger | execution | the changes to a Compute-let's code |
| 118 | Working form | travel | a pack alone |
| 119 | Travel form | travel | a pack in an envelope |
| 120 | Static face | travel | the text shown where no script runs |
| 121 | Sharing | travel | sending to collaborators |
| 122 | Publishing | travel | sending to outside readers |
| 123 | Mark | travel | the visible sign on a video or image envelope |

Ranking within a tier is by how many other concepts rest on the one in
question. Between tiers B and C the line is a judgment, and about ten
entries could sit on either side: Asset, Handler, Root hash and Universe
state lean toward C; Subject, Tools universe and Mark lean toward B.

## 2. Candidates that remove mechanism

These are the only ones that make the format smaller. Each needs its own
argument and, by the project's rule, vectors.

| | Candidate | Saves | Costs | Strength |
| --- | --- | --- | --- | --- |
| R1 | **Remove the scale of a continuous axis.** Since time that is edited became a sequence, a scale carries an anchor only through a uniform shift or scaling. | 1 concept (Scale), the rounding rules of §4.3, one vector group, one property on every primitive | Trimming the start of a raw recording, or rescaling a drawing, would no longer carry anchors by itself. Trimming becomes wrapping the recording in a timeline; rescaling becomes a transform on the pane that holds the drawing. Both need showing | Strong. The mechanism was introduced for a problem that now has a better answer |
| R2 | **One kind of clock.** Make every clock's time a sequence, and drop `start`, `end` and the arithmetic of §4.5 for children. | 1 concept (Timeline), the two rules for how a child gets its time | Every clock, even a two-second animation, carries a `seq`. Free and held modes need restating over elements. A play-through child (music under edited pictures) loses its simple form | Medium. Elegant, but the cost falls on the simplest cases |
| R3 | **Merge pane into group.** A pane is a group with absolute layout, a transform and a clip. | 1 concept, 1 primitive (eleven become ten), part of Appendix A | The founding count of eleven primitives; "a clock maps time as a pane maps space" loses its second half; a surface would be "a group a Compute-let draws" | Medium. The deletion test of §7.4 was never run against this pair |
| R4 | **Defer the canonical tier of exports.** Version 1 promises the host's rendering only. | 2 concepts (Renderer; Export becomes plain description), 1 part (determinism tier), a capability (`blobs`), the renderer's interface, and the largest component any file could need (several hundred KiB) | The founding documents ask for two determinism tiers. Reproducible exports would wait for a later version. The design decided for it (named by hash, no engine chosen) would be kept on paper | Strong on weight, and it is all unexercised text. The cost is a stated limit on a founding intention |
| R5 | **Two layers of what travels, not three.** What always travels; and working history. | 1 concept | The reader must still show the person who and what made the content (**E12**); "attribution" survives as a word in that sentence. The vector shows the split of records is mechanical either way | Weak. It renames more than it removes |
| R6 | **Fold the three provenance facts' satellites.** Basis becomes a field of origin; a finding becomes a later origin entry. | 2 concepts | None in mechanism: both already are what the fold says. The rule that inferred is never shown as witnessed stays | Strong, and nearly free |
| R7 | **Drop the static face as a thing of its own.** It is the plain-text face, carried in the envelope. | 1 concept | None | Strong, and free |

If all seven were taken: 123 becomes 114, and the text loses
perhaps 3,000 words, most of them from R1 and R4.

## 3. Candidates that demote a name to plain description

These lower the count and the reading load. They do not make the format
smaller, and the pass should not mistake one for the other.

| | Candidate | Saves | Cost |
| --- | --- | --- | --- |
| D1 | Reader, Writer, Agent, Host: ordinary words, used ordinarily | 4 | none; §0.1 keeps one sentence |
| D2 | Root hash: "the hash of a commit" | 1 | the word is in the pack's vocabulary and in seals; every use becomes four words |
| D3 | Universe state: "the objects at one commit" | 1 | none |
| D4 | Chronicle: "the history" | 1 | a founding word; the four layers are named object, view, memory, attention, and Chronicle is the name of memory |
| D5 | Ledger: "the history of a Compute-let's code" | 1 | "the printer and the ledger" is a founding phrase |
| D6 | Rendition: "an asset with a derivation"; Recipe: "a derivation and the origin of its change" | 2 | none for Rendition; Recipe is the word the agent interface uses |
| D7 | Working form, Travel form: "a pack alone", "an envelope" | 2 | rule **E7** reads less crisply |
| D8 | Player; Carried presenter; Component | 3 | Supplement B is titled for the player; the three are "kernel, binding and presenters", "a Compute-let that draws a surface", "a Compute-let the player relies on" |
| D9 | Onboard tools; Agent interface | 2 | "onboard tools" is a founding phrase |
| D10 | Drawing contract: the display list, frozen | 1 | none |
| D11 | Attribution: "origin, evidence and decision" | 1 | the word is everywhere in the vision; it would remain as an ordinary word |
| D12 | Stale: a status of a pin | 1 | none |
| D13 | Veiled: a way of writing an indirect | 1 | none; the mechanism stays in §1.4 |
| D14 | Lineage: a property | 1 | none |
| D15 | Profile: a feature that defines types | 1 | none |
| D16 | Nested and linked: one idea, a reference to another universe, present or absent | 1 | none |
| D17 | Compaction | 1 | none |
| D18 | Sharing, Publishing | 2 | rule **E9** names them |
| D19 | Poster: "the rendition shown instead" | 1 | none |
| D20 | Program hash; Lifted | 2 | none |
| D21 | Snapshot: a stored machine state | 1 | none |
| D22 | Handler: what `on` holds | 1 | none |
| D23 | Asset: "an object that holds bytes" | 1 | the type keeps its name |
| D24 | Light cone: "outlines, with summaries" | 1 | a founding word, and one of the ten commitments is named for it |

Taken together: 34. With section 2, 123 becomes 80.

## 4. What I would not touch

- **Object identity and element identity, element, tombstone.** This is
  the mechanism the format's promises about attribution and anchors rest
  on, and the one the timeline reused without change.
- **Origin, evidence, decision as three.** The founding rule is that they
  never merge.
- **Pin and digest.** One test for everything derived.
- **Work.** It is what lets a published copy withhold drafts and still
  verify authorship; the vector `published.ufx` shows it working.
- **Subject.** New, and the only way tools reach the work.
- **Kernel, binding, host interface, capability, grant.** The trust
  boundary. Each word marks a line someone must not cross.

## 5. What the count does not show

The weight of the specification is not evenly spread over its concepts.
By words: the core is 41% of the text for 59 concepts; presentation 20%
for 21; the player 19% for 16; execution 11% for 13; travel and trust 10%
for 14. That is about 350 words a concept in the core, 470 in
presentation and 580 in the player: those two parts spend a third to two
thirds more words per concept than the core, because they hold algorithms (composition, the
host interface) and tables (formula operators, capability operations,
projections) that no concept count measures.

A simplification pass that looks only at this list will miss those. The
64 places where the text failed to decide (`spike/QUERY-NOTES.md`,
`spike/COMPOSITION-NOTES.md`) are a second input of equal value: most of
them are in composition and projections, and several ask for more text,
not less.

Three questions the pass will have to answer that this list cannot:

1. Is the count the measure, or is it the number of things a builder
   must get exactly right? By the second measure the format's weight is
   in perhaps thirty mechanisms, and demoting names changes nothing.
2. Which founding words are kept as words? Chronicle, ledger, light
   cone, player and onboard tools are all demotion candidates and all
   come from the founding documents.
3. Does version 1 need both determinism tiers (R4)? It is the largest
   single piece of unexercised design.
