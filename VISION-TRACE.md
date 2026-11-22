# Vision trace

Where each element of the vision stands in specification version 0.7: which
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
Of the 44 rows below, 5 are tested, 12 tested in miniature, 20 specified
and untested, and 7 thin, counting each row by its first status. A version
ago the count was 5 tested, 26 specified and untested, and 13 thin.

Two cautions carry over. The independent reader tests ran before the
unification of sequences and stored values (version 0.5); nothing
independent has read the current storage form. And the spike's kernel,
which did read it, was written by the same author as the vectors.

## The non-negotiables

| # | Element | Realized in | Exercised by | Status |
| --- | --- | --- | --- | --- |
| 1 | An open, universal primitive of computing that outlives any application | SPEC §0; RATIONALE "The ambition"; the pack's re-implementability, §3.3 | Two independent readers built the storage layer of an earlier version from the text; a kernel miniature read the current one | **Thin.** There is still no reader anyone can use, no second writer, no file anyone has opened outside a test |
| 2 | One universe presents as anything: document, plain text, image, video, audio, data, diagram, 3D, application, game | §5 (vocabulary), §5.7 (composition), §7 (faces), §14 | One small universe presented by one kernel as plain text, as a view and as pages, drawn in a browser | **Tested in miniature for a document. Thin for everything else:** grid and absolute layout, floats, charts from data, clocks, video, audio and 3D have rules and no algorithm, and nothing has run |
| 3 | The file stands alone: carries its player and onboard tools, opens with nothing but a browser | §6.1, §6.6, §9.2 | A kernel and a 79-line binding ran in a browser, served from a local server, not from inside an envelope | **Thin.** The envelope template and the tools universe do not exist. Reading the pack back from a page opened from disk, compiling WebAssembly under the stated security policy, and phones are all untested |
| 4 | Description, not depiction; the description changes only when the work changes | §7.1 (S1), §5.3, §5.7 | The three faces above were sampled from one description without writing a byte | **Tested in miniature** |
| 5 | Compute-lets are full machines — application, operating system, machine, environment — running live inside other universes through Portals | §11.1, §11.2, §8.4, §5.6, §6.3 | Fuel instrumentation of three small modules; printed modules run as plain WebAssembly under tests | **Thin beyond metering and printing.** Ports are a paragraph; the snapshot has no byte format; most capability operations are unwritten; nothing has run inside a Portal or drawn through `draw` |
| 6 | The printer and ledger replace the source tree: code is description, and its bytes are a face of it | §11.3–§11.6 | Two language models built a 300-to-400-instruction program and fresh instances maintained it from the ledger alone: 8 builds and 16 maintenance runs at four levels, scored on hidden tests, all passing. The printer written twice, agreeing byte for byte on six modules and with a hand-assembled vector | **Tested in miniature.** The claim at the size of a real program is still the project's largest unproven one. Lifting a compiled module, promotion and tests-as-objects have not run |
| 7 | Every byte has a known origin; provenance is intrinsic | §1.7 (elements), §8.5 (R8), §11.3 (N4) | The kernel miniature read `seq` and resolved spans by element identity; the trial printer showed each statement with the change that wrote it, and subjects used that to find a bug | **Specified, untested** as a whole: `why`, `origin.sources` for copies, later findings and attribution of derived bytes have never run |
| 8 | The light cone: overview to exact bytes at a cost that scales with the question | §11.7, §7.5, §14.3 | Two models answered three questions over a 199 000-character corpus in four universes, with the structural layer alone and with both layers; cost recorded per question | **Tested in miniature**, on an object model outside the kernel, with summaries written by a script. 62 objects is not scale |
| 9 | Universes nest and link without limit, through membranes with explicit rules | §1.8, §10.4, §8.4 (O7, O8) | Normative vectors `nested.ufx` and `linked.ufx`; the kernel miniature presented a nested text through a Portal and showed a label for a linked one | **Tested in miniature** for the reference and for presentation. Finding a linked universe elsewhere, transfer between people and encryption are not specified enough to try |
| 10 | AI transmutation is a first-class operation of the format | §8.3 (D3, D4), §11.8 (`derive`, `refresh`, `recipe`), §4.4 | Pins, staleness through a ref and through a chain of derivations, the recipe, one-step regeneration and its refusal when the prompt is withheld, with a deterministic function standing in for the model | **Tested in miniature.** The transmutation itself happens outside the format; what the format does — supply inputs, bind outputs, know when they part, hold the recipe — is what ran. No real model was in the loop |

## The four layers and the membrane

| Element | Realized in | Exercised by | Status |
| --- | --- | --- | --- |
| The object: identity, type, history, provenance | §1.3–§1.6 | Two independent readers (earlier form); byte-level vectors; the kernel miniature (current form) | **Tested** (storage form) |
| The view: any object inside any other through a Portal | §8.4, §5.7 | A Portal to a text in a nested universe, composed in line with the surrounding document | **Tested in miniature**, for one Portal presenting text |
| The memory: an append-only Chronicle with origin, evidence, decision | §1.7, §8.5 | Conservation replayed by two independent readers (earlier design); the ledger used by models to find a planted bug | **Tested** for conservation in the earlier design; **specified, untested** for evidence, decisions, findings and `why` |
| The attention: the light cone | §11.7 | See row 8 | **Tested in miniature** |
| The membrane | §10.4, §9.3 | Nothing | **Specified, untested**; the layers of what travels have no vector, and no published copy has been built or read |

## Faces

| Element | Realized in | Exercised by | Status |
| --- | --- | --- | --- |
| Sampled faces | §5.7, §6.2, §7.1, §7.3, §7.4 | Text, view and pages, by one kernel | **Tested in miniature** for text in a vertical flow |
| Carried faces | §8.3, §7.1 | Nothing | **Specified, untested** |
| Transmuted faces, and their staleness | §8.3, §4.4 | See row 10 | **Tested in miniature** |
| The face registry | §7.2 | The kernel miniature chose between two face objects by `medium` | **Specified, untested** beyond that |
| Export as sampling; two determinism tiers | §7.4 | A page image, through the host's drawing | **Specified, untested.** A canonical export is now defined as reproducible given a renderer named by its hash, fetched only for such exports; no renderer is chosen and none has run |

## The player

| Element | Realized in | Exercised by | Status |
| --- | --- | --- | --- |
| One kernel, compiled once, run everywhere | §6.1 (K1) | One throwaway kernel, in one browser engine and one other runtime | **Specified, untested** as a claim about every host |
| Eleven primitives covering every medium | §5.1, Appendix A | Text, group, path and Portal were composed | **Thin.** Seven primitives have never been composed; Appendix A still lists most properties without types or meanings |
| Formulas | §5.3 | Nothing | **Specified, untested**; fifty-one operators are named, few are defined |
| The drawing contract and base presenters | §6.2, Appendix C | Four of eight item kinds executed on a canvas | **Specified, untested** for raster, samples, surface, hit and input |
| The binding knows no medium | §6.1 (K2), §12.2 | A 79-line binding: a value codec, one host function, the drawing loop | **Tested in miniature** |
| The host interface and capability contract | §6.3, Appendix E | One operation, `break`, in its new form | **Specified, untested** for the contract; **thin** for the operations behind most capabilities |
| Budgets | §12 | One measurement, of a miniature: 78.4 KiB, 40 bytes of WebAssembly per line, built without the standard library and size-optimised. The kernel's line limit was reset from it, to 6 000; the compiled limit stayed at 256 KiB | **Thin.** One miniature is a narrow base for the line limit, and the same measurement says a full-size kernel would exceed its compressed limit; every other number is still a target |

## Decode at the border

| Element | Realized in | Exercised by | Status |
| --- | --- | --- | --- |
| The kernel holds no decoder; the host decodes a baseline | §6.4, §6.5 | Nothing | **Specified, untested**; the baseline list has not been checked on any host |
| Foreign documents converted once, originals kept | §6.4, §8.3, §11.3 (N6) | Nothing | **Thin.** No conversion has been attempted; lifting a compiled module is specified in a paragraph |

## Behavior and trust

| Element | Realized in | Exercised by | Status |
| --- | --- | --- | --- |
| Fuel metering inserted by the reader | §11.2 (M4) | Three instrumented modules validated and run in one engine | **Tested**, at toy scale, with hand-assembled bytes |
| Deterministic execution, snapshot, replay | §11.2 (M5–M7) | Nothing | **Specified, untested** |
| Live modification gated by tests | §11.6 | The trial's dry run (`check` with tests against a candidate) is the nearest thing | **Specified, untested** |
| Seals | §10.2 | One seal verified by an independent reader and separately in another runtime | **Tested** |
| Grants and the capability contract | §10.3, §6.3 | Nothing | **Specified, untested** |
| A self-carried reader cannot vouch for itself | §10.6 | Nothing | **Specified, untested** |

## Travel

| Element | Realized in | Exercised by | Status |
| --- | --- | --- | --- |
| The pack: append-only, recoverable, indexable | §2, §3 | Two independent readers, including recovery from four truncations; the kernel miniature | **Tested** |
| The web envelope | §9.2 | Nothing | **Thin** (row 3) |
| Video and image envelopes, and the mark | §9.4 | Nothing | **Specified, untested** |
| What leaves: content, attribution, working history | §9.3 | Nothing | **Specified, untested** |
| Platform declarations, media type | §9.5, `registration/` | The name was checked against live registries | **Specified, untested** |

## The worked examples

| Example | Realized in | Exercised by | Status |
| --- | --- | --- | --- |
| Interactive video | §14.1 | Nothing | **Specified, untested**: on paper only |
| Game inside a document | §14.2 | The trial's program is a game core, built and changed by models through the printer; nothing else of the example | **Specified, untested** |
| Body of research | §14.3 | A miniature of it: one corpus, three nested studies, a conclusion traced to its evidence | **Tested in miniature** |
| Quarterly Review | §14.4 | The spike's universe is a fragment of it: the report as text, view and pages | **Specified, untested** for eight of its nine faces |

## What this says

The four places where the vision was thinnest are now of three kinds.

1. **From description to display list: no longer prose, for text.** There
   is an algorithm from a text with spans to lines, rows and pages, and it
   ran. Everything that is not text in a vertical flow is where text was a
   version ago.
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
