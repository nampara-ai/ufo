# Vision trace

Where each element of the vision stands in specification version 0.5: which
sections realize it, what has actually exercised it, and how solid it is.

Status has three values.

- **Tested.** Something other than the author's reading has exercised it:
  an independent implementation built from the text, or code that ran.
- **Specified, untested.** The specification says how it works in enough
  detail to attempt; nothing has run.
- **Thin.** The specification names it, or describes it in prose, without
  enough to build from, or rests it on something that does not exist yet.

**The short version.** Everything tested so far is storage: records,
hashes, the pack, commits, conservation, seals, and fuel instrumentation of
three tiny modules. None of the claims that make this format new — one
kernel presenting many faces, a small vocabulary covering every medium,
machine code maintained without source, light cone navigation, staleness of
derived faces — has been exercised by anything. Several are thin. Of the 44
rows below, 5 are tested, 26 are specified and untested, and 13 are thin,
counting each row by its first status.

One further caution. The independent reader tests ran before the
unification of sequences and stored values (version 0.5). What they
confirmed about attribution and anchors applies to the earlier design. The
current design has been exercised only by the script that writes the
vectors.

## The non-negotiables

| # | Element | Realized in | Exercised by | Status |
| --- | --- | --- | --- | --- |
| 1 | An open, universal primitive of computing that outlives any application | SPEC §0; RATIONALE "The ambition"; the pack's re-implementability, §3.3 | Two independent readers built the storage layer from the text, with 57 and then 49 gaps found and fixed | **Thin.** The durability argument for the *container* is partly tested. Nothing about universality is: there is no kernel, no reader, no second writer, no file anyone has opened |
| 2 | One universe presents as anything: document, plain text, image, video, audio, data, diagram, 3D, application, game | §5 (vocabulary), §5.5 (compositions), §7 (faces), §14 | Nothing | **Specified, untested**, and thin in places: layout is three table rows (§5.2); how a text with spans becomes lines and blocks is spread over §8.1 and Appendix A without an algorithm; pagination is one sentence; a diagram's layout is "a Compute-let, or formulas"; audio is one primitive with four properties |
| 3 | The file stands alone: carries its player and onboard tools, opens with nothing but a browser | §6.1, §6.6, §9.2 | Nothing | **Thin.** The envelope's structure is specified, but the envelope template, the binding and the tools universe do not exist; K5 lists what the tools must do without describing them. Reading the pack back from a page opened from disk, compiling WebAssembly under the stated security policy, and behavior on phones are all untested |
| 4 | Description, not depiction; the description changes only when the work changes | §7.1 (S1), §5.3 (presentation state), §1.7 | Nothing | **Specified, untested** |
| 5 | Compute-lets are full machines — application, operating system, machine, environment — running live inside other universes through Portals | §11.1, §11.2, §8.4, §5.6, §6.3 | Fuel instrumentation of three small modules, validated and run in one WebAssembly engine | **Thin beyond metering.** "Operating system" is asserted on the strength of `frame`, ports and `draw`; ports are a paragraph; the snapshot has no byte format; most capability operations are unwritten; nothing has run inside a Portal |
| 6 | The printer and ledger replace the source tree | §11.3–§11.6 | Two printer operations with the module bytes they should produce; the bytes are valid WebAssembly. No printer produced them | **Thin.** The accepted subset of the text format, most derived-byte rules and item hashing with keys are stated briefly and untested. That a model can maintain a real program this way is the project's largest unproven claim |
| 7 | Every byte has a known origin; provenance is intrinsic | §1.7 (elements), §8.5 (R8), §11.5 | Before the unification: two independent readers checked attribution runs through three commits. After it: the generator only | **Specified, untested** in its current form. `origin.sources` for copies, later findings and `why` have never been exercised in any form |
| 8 | The light cone: overview to exact bytes at a cost that scales with the question | §11.7, §7.5 (`overview`, `expand`), §14.3 | Nothing | **Thin.** The structure is specified (summaries as pinned derivations in a tree). Who writes summaries and when, how good they must be to navigate by, what `search` is, and the cost claim itself are not |
| 9 | Universes nest and link without limit, through membranes with explicit rules | §1.8, §10.4, §8.4 (O7, O8) | Nothing: no vector contains a nested or linked universe | **Thin.** The reference is specified. How a nested universe's records sit in a pack beside its parent's, how a reader finds a linked universe "from anywhere", and encryption across a transfer are not |
| 10 | AI transmutation is a first-class operation of the format | §8.3 (D4), §11.8 (`derive`, `refresh`), §4.4 | Nothing | **Specified, untested**, and at risk of being a conventional mechanism under a new name: `derive` is a commit that records sources by hash. What is new is the pin, the staleness test and the three-part origin; the transmutation itself happens outside the format |

## The four layers and the membrane

| Element | Realized in | Exercised by | Status |
| --- | --- | --- | --- |
| The object: identity, type, history, provenance | §1.3–§1.6 | Two independent readers; byte-level vectors | **Tested** (storage form) |
| The view: any object inside any other through a Portal | §8.4 | Nothing | **Specified, untested** |
| The memory: an append-only Chronicle with origin, evidence, decision | §1.7, §8.5 | Conservation replayed by two independent readers (earlier design); one origin of each kind and one decision appear in a vector | **Tested** for conservation in the earlier design; **specified, untested** for evidence, decisions, findings and `why` |
| The attention: the light cone | §11.7 | Nothing | **Thin** (row 8) |
| The membrane | §10.4, §9.3 | Nothing | **Specified, untested**; the layers of what travels have no vector, and no published copy has been built or read |

## Faces

| Element | Realized in | Exercised by | Status |
| --- | --- | --- | --- |
| Sampled faces | §6.2, §7.1, §7.3, §7.4 | Nothing | **Thin.** The drawing contract — what the kernel emits — is exact. How the kernel gets from description to display list is not an algorithm anywhere in the document |
| Carried faces | §8.3, §7.1 | Nothing | **Specified, untested** |
| Transmuted faces, and their staleness | §8.3, §4.4 | Nothing | **Specified, untested.** The digest that follows references has never been computed by anything; its cost on a large universe is unknown |
| The face registry | §7.2 | One face object in a vector, never presented | **Specified, untested** |
| Export as sampling; two determinism tiers | §7.4 | Nothing | **Thin** for the canonical tier: it depends on a rasterizer and a text shaper that are named and not specified |

## The player

| Element | Realized in | Exercised by | Status |
| --- | --- | --- | --- |
| One kernel, compiled once, run everywhere | §6.1 (K1) | Nothing | **Specified, untested**; no kernel exists |
| Eleven primitives covering every medium | §5.1, Appendix A | Nothing | **Thin.** Appendix A lists property names without types, defaults or meanings for most of them |
| Formulas | §5.3 | Nothing | **Specified, untested**; fifty-one operators are named, few are defined |
| The drawing contract and base presenters | §6.2, Appendix C | Nothing | **Specified, untested** |
| The binding knows no medium | §6.1 (K2), §12.2 | Nothing | **Specified, untested** |
| The host interface and capability contract | §6.3, Appendix E | Nothing | **Specified, untested** for the contract; **thin** for the operations behind most capabilities |
| Budgets | §12 | Nothing measured | **Thin** until measured |

## Decode at the border

| Element | Realized in | Exercised by | Status |
| --- | --- | --- | --- |
| The kernel holds no decoder; the host decodes a baseline | §6.4, §6.5 | Nothing | **Specified, untested**; the baseline list has not been checked on any host |
| Foreign documents converted once, originals kept | §6.4, §8.3 | Nothing | **Thin.** The rule is stated. No conversion has been attempted, and nothing says what a faithful conversion of, say, a slide deck into primitives looks like |

## Behavior and trust

| Element | Realized in | Exercised by | Status |
| --- | --- | --- | --- |
| Fuel metering inserted by the reader | §11.2 (M4) | Three instrumented modules validated and run in one engine; fuel consumed as stated | **Tested**, at toy scale, with hand-assembled bytes |
| Deterministic execution, snapshot, replay | §11.2 (M5–M7) | Nothing | **Specified, untested** |
| Live modification gated by tests | §11.6 | Nothing | **Specified, untested** |
| Seals | §10.2 | One seal verified by an independent reader and separately in another runtime | **Tested** |
| Grants and the capability contract | §10.3, §6.3 | Nothing | **Specified, untested** |
| A self-carried reader cannot vouch for itself | §10.6 | Nothing | **Specified, untested** |

## Travel

| Element | Realized in | Exercised by | Status |
| --- | --- | --- | --- |
| The pack: append-only, recoverable, indexable | §2, §3 | Two independent readers, including recovery from four truncations | **Tested** |
| The web envelope | §9.2 | Nothing | **Thin** (row 3) |
| Video and image envelopes, and the mark | §9.4 | Nothing | **Specified, untested** |
| What leaves: content, attribution, working history | §9.3 | Nothing | **Specified, untested** |
| Platform declarations, media type | §9.5, `registration/` | The name was checked against live registries | **Specified, untested** |

## The worked examples

| Example | Realized in | Exercised by | Status |
| --- | --- | --- | --- |
| Interactive video | §14.1 | Nothing | **Specified, untested**: on paper only |
| Game inside a document | §14.2 | Nothing | **Specified, untested**; shared play needs a transport capability that is not specified |
| Body of research | §14.3 | Nothing | **Specified, untested**; depends on the light cone (thin) and on nested universes (thin) |
| Quarterly Review | §14.4 | Nothing | **Specified, untested** |

## What this says

The specification has been made precise where precision was easiest to
test: bytes. That work was needed, and it found more than a hundred
defects. But it is the conventional part. The parts that carry the
project's claims are either untested or thin, and the thin ones cluster in
four places:

1. **From description to display list.** There is an exact account of what
   a universe stores and an exact account of what a host draws, and prose
   in between.
2. **Machine code without source.** The printer is described by its
   operations and its laws, not by what it accepts.
3. **The light cone.** A data structure, without the practice that would
   make it work.
4. **The file that opens itself.** Every component of the web envelope
   except the pack is unwritten.

These are what the measurement spike is now aimed at.
