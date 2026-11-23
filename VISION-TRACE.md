# Vision trace

Where each element of the vision stands in specification version 0.8: which
sections realize it, what has actually exercised it, and how solid it is.

Status has four values.

- **Tested.** Something other than the author's reading has exercised it at
  its real form: an independent implementation built from the text, or code
  that ran on the real bytes.
- **Tested in miniature.** It ran in the measurement spike: small, written
  by the specification's author, thrown away afterward, and often on a
  stand-in (a Python object model, a stand-in for a language model). Enough
  to find what was missing; not evidence of scale, and not independent.
- **Specified, untested.** The specification says how it works in enough
  detail to attempt; nothing has run.
- **Thin.** The specification names it, or describes it in prose, without
  enough to build from, or rests it on something that does not exist yet.

**The short version.** Until this version, everything tested was storage.
The spike has now run each of the claims that make the format new — one
kernel presenting several faces, code maintained by models without source,
navigation from the whole to exact text, staleness and regeneration of
derived faces, a universe nested in another — once, in miniature. Each
needed something the specification did not have, which is now written into
it. None has been exercised at scale, by a second person, or outside text.

A cold review of version 0.7 then judged this trace row by row and found
it generous in three ways, all corrected here. Rows rested "tested" on
independent readers of a storage form that has since changed. The count
took each row at its best status. And several rows said "specified,
untested" of things with too little written to build from. Of the 48 rows
below, taking each at its **weakest** status: 7 are tested, 11 tested in
miniature, 13 specified and untested, and 17 thin. Taking each at its
first status: 8, 14, 13 and 13. Before version 0.8 there were 44 rows:
2, 11, 14 and 17 at their weakest.

Three cautions.

- The independent reader tests ran before version 0.5, on fixed chunks,
  runs and an earlier anchor. Of what they built, the pack's frames, heads
  and recovery are little changed; objects, sequences and conservation
  are not what they read. The current form has been read by the spike's
  kernel, written by the author of the vectors, and its conservation has
  been replayed once, by the reviewer, on the vector packs. It held.
- The review led to large additions: line breaking moved into the kernel,
  algorithms for grid, absolute position and clocks, exact definitions of
  the formula operators, the formats of a snapshot and a replay log, the
  interface to a renderer, the tools universe's subject. **None of that
  text has run, and none has been reviewed.** Where the review rated a row
  thin and text has been added since, the row stays thin until someone
  other than the author has read it.
- Nothing here has been built by a person.

**Since the review: version 0.8.** The owner set a rule: nothing
normative counts as settled until something exercises it. The throwaway
kernel was restored to produce test vectors, and now breaks its own
lines. What that changed below: composition, pagination and the
plain-text face of a text with lists have vectors; so have digests and
staleness, the layers of what travels, outlines and five other
projections; and time that is edited became a sequence, with a vector on
which the kernel and the vector generator agree. All of these vectors
are **provisional**: one author wrote the text, the generator and the
kernel. Making them found 64 places where the text did not decide what
to do (`spike/QUERY-NOTES.md`, `spike/COMPOSITION-NOTES.md`). The last
section lists what is still text and nothing else.

**The reader test.** An independent reader was then built from the core
document alone, with the expected values withheld. Storage, changes,
sequences, anchors into sequences, timelines and the published copy are
now tested in their current form by something other than their author.
It found 52 unclear places, and three things a core reader must do that
the core does not let it decide: where a continuous axis ends, which
missing records are withheld and which are damage, and the digest in
general.

**The second reader test.** The first reader's findings in the core were
answered, each with a vector, and the three layers, extents and the rest
of what the core needed were moved into the core. A second reader, built
from the revised text alone, agreed with 456 of 458 expected values on its
first run, the two differences being in its own check. It is of the same
model family as the specification's author, so the vectors it reproduced
are *reproduced*, not *confirmed*. It warned that the score overstates
the evidence: about half of the fifty choices it had to make are reached
by no vector.

## The ten commitments the owner set as not negotiable

| # | Element | Realized in | Exercised by | Status |
| --- | --- | --- | --- | --- |
| 1 | An open, universal primitive of computing that outlives any application | SPEC §0; RATIONALE "The ambition"; the pack's re-implementability, §3.3 | Two independent readers built the storage layer of an earlier version from the text; a kernel miniature read the current one | **Thin.** There is still no reader anyone can use, no second writer, no file anyone has opened outside a test |
| 2 | One universe presents as anything: document, plain text, image, video, audio, data, diagram, 3D, application, game | §7 (vocabulary), §7.7 (composition), §8 (faces), §15 | One text with every block role composed by a kernel that breaks its own lines, into rows and pages, with a provisional vector; earlier, one small universe drawn in a browser | **Tested in miniature for a document. Thin for everything else.** Rules for grid, absolute position and clocks have not run; floats, charts from data, video, audio and 3D have less |
| 3 | The file stands alone: carries its player and onboard tools, opens with nothing but a browser | §9.1, §9.6, §13.2 | One HTML file carrying kernel, binding, tools universe and pack, under a policy that forbids all network. In headless Chromium, from disk and from another origin: read in three faces; a paragraph edited through the tools, one changed word attributed as one word; saved as a function of the page's parts, never read back from the browser; reopened to the same state and edited again. The tools' meaning is description in the tools universe, run by the kernel; the host is 175 lines and knows nothing of faces, edits or saving. Every change made in the browser was replayed by the independent reader | **Tested in miniature, in one browser engine.** Not tried: Firefox, any WebKit, Safari, a real phone, a file preview. The tools are five words; some of their meaning has moved into the kernel, not into description (`spike/envelope/NOTES.md`, R6) |
| 4 | Description, not depiction; the description changes only when the work changes | §8.1 (S1), §7.3, §7.7 | The three faces above were sampled from one description. The kernel that did it could not write, so that it wrote nothing shows little | **Tested in miniature**, for text only |
| 5 | Compute-lets are full machines — application, operating system, machine, environment — running live inside other universes through Portals | §12.1, §12.2, §7.8, §7.6, §9.3 | Fuel instrumentation of three small hand-assembled modules; printed modules run as plain WebAssembly under tests | **Thin beyond metering and printing.** How a module is started, the snapshot and the replay log now have formats, unrun. Running out of call stack is not yet deterministic. Seven optional capabilities have no operations. Nothing has run inside a Portal or drawn through `draw` |
| 6 | The printer and ledger replace the source tree: code is description, and its bytes are a face of it | §12.3–§12.6 | Two language models built a 300-to-400-instruction program and fresh instances maintained it from a ledger alone: 8 builds and 16 maintenance runs at four levels, scored on hidden tests, all passing. Of those, the adopted design had 2 builds and 4 maintenance runs, through a tool that addressed statements by number. The printer written twice, agreeing byte for byte on six modules and with a hand-assembled vector | **Tested in miniature.** No model has edited code by element identity through `propose`, or read the Chronicle itself as the ledger. The claim at the size of a real program is still the project's largest unproven one. Lifting a compiled module, promotion and tests-as-objects have not run |
| 7 | Every byte has a known origin; provenance is intrinsic | §1.7 (elements), §5.4 (R8), §12.3 (N4) | The kernel miniature read `seq` and resolved spans by element identity; the trial printer showed each statement with the change that wrote it, and subjects used that to find a bug | **Specified, untested** as a whole: `why`, `origin.sources` for copies, later findings and attribution of derived bytes have never run |
| 8 | The light cone: overview to exact bytes at a cost that scales with the question | §10.2, §10.1, §15.3 | Two models answered three questions over a 199 000-character corpus in four universes, on an object model outside the kernel, with scripted summaries. Since then the kernel computes outlines of a text and of a universe from real packs, as provisional vectors | **Tested in miniature.** Building the outline found the section rule gives no structure to a text with one heading at each of two levels, and that ranges have no record. Ranges, summaries beside parts, and stale summaries have not run |
| 9 | Universes nest and link without limit, through membranes with explicit rules | §1.8, §14.4, §7.8 (O7, O8) | Normative vectors `nested.ufx` and `linked.ufx`; the kernel miniature presented a nested text through a Portal and showed a label for a linked one | **Tested in miniature** for nesting. **Thin for linking:** a linked universe is a hash, a label and, since the review, a hint of where to look. Transfer between people and encryption are not specified enough to try |
| 10 | AI transmutation is a first-class operation of the format | §5.3 (D3, D4), §10.3 (`derive`, `refresh`, `recipe`), §4.4 | Pins, staleness through a ref and through a chain of derivations, the recipe, one-step regeneration and its refusal when the prompt is withheld, with a deterministic function standing in for the model | **Tested in miniature.** The transmutation itself happens outside the format; what the format does — supply inputs, bind outputs, know when they part, hold the recipe — is what ran. No real model was in the loop |

## The four layers and the membrane

| Element | Realized in | Exercised by | Status |
| --- | --- | --- | --- |
| The object: identity, type, history, provenance | §1.3–§1.6 | An independent reader built from the core document alone, expected values withheld: all eight packs opened, every record verified, 231 nodes re-encoded byte for byte | **Tested** in its current form |
| The view: any object inside any other through a Portal | §7.8, §7.7 | A Portal to a text in a nested universe, composed in line with the surrounding document | **Tested in miniature**, for one Portal presenting text |
| The memory: an append-only Chronicle with origin, evidence, decision | §1.7, §5.4 | The independent reader replayed every change of every pack to exactly the committed state, and caught each of 16 corruptions it injected | **Tested** for conservation in its current form; **specified, untested** for evidence, decisions, findings and `why` |
| The attention: the light cone | §10.2 | See row 8 | **Tested in miniature** |
| The membrane | §14.4, §13.3 | Nothing | **Specified, untested**; the layers of what travels have no vector, and no published copy has been built or read |

## Addressing

| Element | Realized in | Exercised by | Status |
| --- | --- | --- | --- |
| Anchors, resolved without history | §4.2, §4.3 | Two independent readers of the current form. The second, from the revised text, resolved an anchor of every kind in `pins.ufx`: sequence, continuous inside, clipped, touching and outside an extent, of unknown extent, keyed, a point | **Tested.** Two differently written boundaries with nothing between them are detached by the letter of the rule, which both readers followed and both questioned |
| Time that is edited: a timeline | §4.5, §1.7 | `timeline.ufx`, four commits: a cut from the middle, an insertion, the start of a play cut. Generator, kernel and two independent readers agree on every value | **Tested** for resolution. Nothing has played |
| Pins and staleness | §4.4 | Ten digests and three pins across three commits, on which generator, kernel and the second independent reader agree | **Tested** for what the vectors reach. The second reader listed eleven small choices in the rule that no vector reaches |
| Projections for agents | §10.1, Appendix B | Twelve projections of real packs as text, from the kernel | **Tested in miniature.** No model has read them |

## Faces

| Element | Realized in | Exercised by | Status |
| --- | --- | --- | --- |
| Sampled faces | §7.7, §9.2, §8.1, §8.3, §8.4 | Text, view and pages, by one kernel | **Tested in miniature** for text in a vertical flow |
| Carried faces | §5.3, §8.1 | Nothing | **Specified, untested** |
| Transmuted faces, and their staleness | §5.3, §4.4 | See row 10 | **Tested in miniature** |
| The face registry | §8.2 | The kernel miniature chose between two face objects by `medium` | **Specified, untested** beyond that |
| Export as sampling; two determinism tiers | §8.4 | A page image, through the host's drawing | **Specified, untested** for the ordinary tier. **Thin** for the canonical tier: it rests on a renderer that does not exist. The interface to one was written after the review; no engine is chosen and the size of a real one is known only from the spike's measurements of existing libraries |

## The player

| Element | Realized in | Exercised by | Status |
| --- | --- | --- | --- |
| One kernel, compiled once, run everywhere | §9.1 (K1) | One throwaway kernel, in one browser engine and one other runtime | **Specified, untested** as a claim about every host |
| Eleven primitives covering every medium | §7.1, Appendix A | Text, group, path and Portal were composed | **Thin.** Seven primitives have never been composed. Appendix A gained types and domains after the review |
| Formulas | §7.3 | Nothing | **Thin** as reviewed: operators were named, few defined. Fifty-two are now defined; unrun and unreviewed |
| The drawing contract and base presenters | §9.2, Appendix C | Four of eight item kinds executed on a canvas | **Specified, untested** for raster, samples, surface, hit and input |
| The binding knows no medium | §9.1 (K2), §11.1 | A 79-line binding: a value codec, one host function, the drawing loop for two kinds of item. That one function broke lines, which the kernel now does; the binding's part is now to measure | **Tested in miniature**, generously; **specified, untested** in its present form |
| The host interface and capability contract | §9.3, Appendix E | One operation, in a form since replaced | **Specified, untested** for the contract and for the kernel's own capabilities; **thin** for the seven optional capabilities, which have no operations |
| Budgets | §6, §11 | A throwaway kernel of 3 907 lines, built with a stable compiler, no standard library, no text formatting, no inflater: 150.5 KiB, 70.1 KiB compressed, 16.7 compressed bytes a line. Three clean builds give the same bytes | **Tested in miniature** for the kernel's limit: at the density measured a kernel at its 7 000-line budget is about 120 KiB compressed. The kernel is perhaps half written; the other budgets are still targets |

## Decode at the border

| Element | Realized in | Exercised by | Status |
| --- | --- | --- | --- |
| The kernel holds no decoder; the host decodes a baseline | §9.4, §9.5 | Nothing | **Specified, untested**; the baseline list has not been checked on any host |
| Foreign documents converted once, originals kept | §9.4, §5.3, §12.3 (N6) | Nothing | **Thin.** No conversion has been attempted; lifting a compiled module is specified in a paragraph |

## Behavior and trust

| Element | Realized in | Exercised by | Status |
| --- | --- | --- | --- |
| Fuel metering inserted by the reader | §12.2 (M4) | Three instrumented modules, assembled by hand, validated and run in one engine; reproduced by the reviewer | **Tested in miniature.** What ran is three hand-made outputs of the rule. No instrumenter exists |
| Deterministic execution, snapshot, replay | §12.2 (M5–M7) | Nothing | **Thin.** Formats for the snapshot and the replay log were written after the review. Exhausting the call stack still differs between engines; a rule to meter depth is designed and not yet specified |
| Live modification gated by tests | §12.6 | The trial's dry run (`check` with tests against a candidate) is the nearest thing | **Thin**: it rests on the row above |
| Seals | §14.2 | One seal verified by an independent reader and separately in another runtime | **Tested** |
| Grants and the capability contract | §14.3, §9.3 | Nothing | **Specified, untested** |
| A self-carried reader cannot vouch for itself | §14.6 | Nothing | **Specified, untested** |

## Travel

| Element | Realized in | Exercised by | Status |
| --- | --- | --- | --- |
| The pack: append-only, recoverable, indexable | §2, §3 | Two independent readers of an earlier form; a third, of the current form, recovered the last whole state from about 30 truncations of each pack | **Tested** |
| The web envelope | §13.2 | As row 3; and with scripts off the static face shows the whole text and what to do next. Valid HTML by two checkers, no parse errors. 152 KiB for the test document against a budget of 256 | **Tested in miniature**, in Chromium only (row 3) |
| Video and image envelopes, and the mark | §13.4 | Nothing | **Specified, untested** |
| What leaves: content, attribution, working history | §2.5, §13.3 | Three published copies. The second independent reader computed the layers of seven packs from the core's rule and agreed with the generator and the kernel on every record; it read each published copy with nothing reported as damage | **Tested** for the layers and for reading a published copy. No reader has written one. Absent blobs and linked universes' hints have no vector, and one rule about missing chunks contradicts another |
| Platform declarations, media type | §13.5, `registration/` | The name was checked against live registries | **Specified, untested** |

## The worked examples

| Example | Realized in | Exercised by | Status |
| --- | --- | --- | --- |
| Interactive video | §15.1 | Nothing | **Thin**: composition under clocks has rules written after the review and has not run |
| Game inside a document | §15.2 | The trial's program is a game core, built and changed by models through the printer; nothing else of the example | **Thin**: execution is thin (row 5) |
| Body of research | §15.3 | A miniature of it: one corpus, three nested studies, a conclusion traced to its evidence | **Tested in miniature** |
| Quarterly Review | §15.4 | The spike's universe is a fragment of it: the report as text, view and pages | **Thin** for the charts, the grid and the deck, whose composition has not run; **specified, untested** for the rest; one face of nine tested in miniature |

## What this says

The four places where the vision was thinnest are now of three kinds.

1. **From description to display list: no longer prose, for text.** There
   is an algorithm from a text with spans to lines, rows and pages, and it
   ran, with the host breaking the lines. The kernel now breaks them, by
   two Unicode algorithms no one has yet fitted into its budget. Grid,
   absolute position and clocks have rules and have not run.
2. **Machine code without source: tried, and redesigned on the evidence.**
   Models maintained a program from the ledger. The design they did it
   best with was not the one specified, and the specification changed.
3. **The light cone: a practice, not only a structure.** Two layers, a rule
   for when a summary is worth writing, and a measurement of what each
   layer buys.
4. **The file that opens itself: untouched.** Every component of the web
   envelope except the pack is still unwritten. It is now the thinnest
   part of the vision, and the next thing a spike or an implementation
   should attack.

## Open, text only

Requirements written into the specification that nothing has exercised:
no vector, no test, no code that ran. By the owner's rule they are open,
however fully they are written.

- **Subjects** (§7.6, **F6**, **F7**), `ask` and `act`: how tools reach
  the work.
- **Composition** of grid, absolute position, clocks, inline boxes in
  flow, page headers and footers (§7.7); every formula operator (§7.3);
  the types of Appendix A.
- **The plain-text face** of data, of a group under `each`, of a clock
  (§8.3).
- **The renderer** and canonical exports (§8.4).
- **Execution**: `engine`, the snapshot and replay formats, the random
  generator, the unit hash and program hash, the test gate, evidence
  written at promotion, the described subset and lifting (§12).
- **The kernel's capability operations** other than `measure` (§9.3).
- **The envelope**: template, browser baseline, head (§13.2).
- **Linking**: where a linked universe is found (§2.5).
- **Summaries**: their list in the universe object, matching to parts,
  ranges (§10.2).
- **Rule A4** for space (§4.3); derivation sources per object, `refresh`
  (§5.3); what an agent writes (Appendix B).
- **Right-to-left text in composition.** The bidirectional algorithm
  passes its conformance tests; no vector composes right-to-left text.
