# The kernel as a base and its components

Approved by the owner on 2026-11-23: one build, divided after linking.
The division is now made, measured, reproducible and run (section 7).
None of it is in the specification yet, and the page does not yet load a
component. It follows the founding design: every
file carries the base kernel and only the components its content
requires, each named by its hash, and a reader that already holds one
uses its own.

The measurements are of the throwaway spike kernel, by
`spike/tools/split.mjs`, optimised and compressed as every other size in
these notes. Sizes are compressed bytes unless a line says otherwise.

## 1. What was measured

| | Bytes | KiB |
| --- | ---: | ---: |
| The kernel whole | 113 440 | 110.8 |
| Without the printer | 108 393 | 105.9 |
| Without the agent-facing projections | 110 390 | 107.8 |
| **The base: without both** | **105 266** | **102.8** |
| The printer as a module of its own, with copies of all it uses | 31 723 | 31.0 |
| The agent-facing projections as a module of their own, with copies | 50 142 | 49.0 |
| Opening a pack and nothing else: what any such module holds | 26 731 | 26.1 |

So a component costs very differently by how it is linked:

| Component | Sharing the base's code | Carrying its own copies | The copies cost |
| --- | ---: | ---: | ---: |
| Printer | 5 047 | 31 723 | 26 676 |
| Agent-facing projections | 3 050 | 50 142 | 47 092 |

"Sharing" is the difference between the whole kernel and the kernel built
without the part: what the part adds when every function it calls is the
base's own. It is a lower bound for any design that shares, because a
real boundary adds the glue of each call across it. That glue was not
measured: it needs a tool this environment does not have (section 3).

The base is 80% of the 128 KiB limit. By function bytes before
optimisation (244 469 in all):

| Part of the base | Share |
| --- | ---: |
| Composition, with line breaking, bidirectional text, the plain-text face and the static face | 23% |
| The projections the tools need (the universe, history, attribution, what will leave), with anchors, digests and layers | 20% |
| The tools engine: formulas, handlers, hit testing, text entry | 16% |
| The write path: operations, replay, blobs, the object map, difference | 14% |
| The library's own generics: collections, sorting, strings | 12% |
| Storage: the pack and values | 8% |
| The allocator | 2% |
| The envelope, the entry points, the rest | 6% |

## 2. Where the boundary lies

**The base** is what every file needs to be opened, read in its faces,
edited through its onboard tools, saved and sent on, with attribution
shown: storage; the write path; composition of text, with line breaking
and bidirectional text; the tools engine; the four projections the tools
ask (`expand` of the universe, `history`, `why`, `leaving`); the
plain-text face; the envelope. The 128 KiB limit binds the base.

**Components**, each carried only by a file whose content needs it:

| Component | Holds | Measured |
| --- | --- | --- |
| Printer | printing a described module to bytes; later, metering and what else execution needs of the kernel | 5 047, the printer alone |
| Agent | the projections only agents ask (`object`, `text`, the outline of a text or a timeline; later `search`, `diff`, `verify`, `unit`) and the text of every projection | 3 050 for what exists |
| Formulas | the operators beyond those the base tools use | not built |
| Time and space | composing clocks, absolute placement, surfaces: the faces of media beyond text | not built |
| Presenters carried as Compute-lets | drawing what the host's four base presenters do not | not kernel code; unchanged by this design |

What the split buys today is 8 174 bytes, because the two components
that exist are small. What it buys from here on is that everything in the
right-hand list grows outside the limit. What the base still lacks, and
must fit in its remaining 25 KiB: named values and the few operators the
tools need; grid layout and the editing of data; accepting and rejecting
a contribution; adding an asset; verifying seals; undo.

**A question for the owner.** Tables are in ordinary documents, so grid
layout is put in the base here. Absolute placement and clocks are put in
a component, which means a slide deck or a video carries it. If "read in
its faces" must hold for every face of every file with the base alone,
they belong in the base and it will not fit.

## 3. How a component is linked

One codebase, one implementation of each piece, and a component calls
the base rather than holding copies. There are two ways to do that.

**A. One build, divided after linking.** The kernel is compiled and
linked once, whole. A tool then divides the module: the base keeps its
memory, its table of functions and the functions of the base; each
component is a second module that imports that memory and table and the
base functions it calls, and holds only its own functions. Nothing is
duplicated, and no interface is designed or frozen: the boundary is
wherever the division is drawn. The cost is that a component works only
with the exact base it was divided from. Each component therefore states
the hash of its base, and a reader uses it with that base and no other.

**B. A specified interface.** The base exports a fixed set of functions
(`ufo:kernel/1`), as the host exports `ufo:host/1`, and a component is
built against them alone. It works with any conforming base. But a
component needs what the kernel has inside: objects, sequences, anchors,
digests, layers, the plain text of a region, the spelling of values.
Either every one of those becomes part of a second frozen interface as
large as the kernel's own structure, or the component carries copies,
at the cost section 1 measured.

**Recommended: A.** The kernel's components are parts of one kernel,
released together and trusted together, and they are never mixed across
builds: a page runs the kernel and components its file carries, and an
installed reader runs its own (**E6**). Pairing a component with its base
by hash states that plainly. B's portability would be bought with a
second interface to specify, test and keep for ever.

Carried presenters are a different class and do not change: they are
Compute-lets, sandboxed, built against the host interface, independent
of any kernel build.

**Shown since** (section 7): the division was made with Binaryen's
`wasm-split`, its real cost measured, and its bytes found reproducible.

## 4. How a file lists what it carries, and how a reader skips it

**Listing.** The universe object already has `components` (§1.6): a map
from a role to what the universe carries for it. A kernel component is
an entry under its role, `ufo.printer`, `ufo.agent`, `ufo.formulas`,
`ufo.time`:

```
components: { "ufo.printer": { "module": <indirect to a blob>, "for": <hash of the base kernel> } }
```

`module` is the component's bytes as a blob, so its hash is a function
of its bytes and names the component everywhere. `for` is the hash of
the base it was divided from. The base kernel itself stays where it is:
an envelope part beside the pack, with `kernel-hash`, because it must
run before any pack can be read.

**Carrying.** The blob's chunks are compressed by the build tooling that
made the component and are carried between packs as they are framed: the
kernel copies frames it cannot read, and holds no compressor. This is
the mechanism the tools universe now uses.

**Loading, in a page.** On opening, the kernel tells the binding which
components the universe lists whose `for` is this kernel: for each, the
bytes. The binding instantiates each with the base's own exports as its
imports. That is one rule and a few lines, and the binding learns no
role, no medium and no format.

**Skipping.** A reader that holds a module with that hash uses its own
and does not read the blob (**K3**). A reader that opens a pack by range
then never touches those bytes. A page has no store of its own and uses
what the file carries.

**Absent, or for another kernel.** Each function a component serves has
a stated result when the component is not there, as a capability has: a
projection answers that it needs the component, by role; a formula
operator gives an error value; a module is not printed and its surface
shows its poster. A component whose `for` is another kernel is reported
so and not run.

**Adding one.** A reader that makes a file need a component, by adding
code to a document for instance, copies the component from its own store
into the pack in the same change. A page can do this only for components
its file already carries: it reaches no network. That is a stated limit
of the first rung, and the installed reader is the way past it.

## 5. The one-paragraph envelope

Measured today, for `minimal.ufx` with the tools nested: 185 856 bytes
(181.5 KiB), of which the kernel in base64 is 151 148, the pack 18 260,
the binding 9 192, the skeleton twice 5 098 and the style 2 050.

| | Bytes | KiB |
| --- | ---: | ---: |
| Today, the kernel whole | 185 856 | 181.5 |
| With the base as measured | 175 064 | 171.0 |
| With a base at its 128 KiB limit | 209 472 | 204.6 |

All are within the 256 KiB budget. The second and third are arithmetic
from the first: no envelope was built with a base kernel.

## 6. What is not known

- The sizes of the components that do not exist: formulas, time and
  space, the rest of the agent's projections, execution.
- Whether a page runs the founding round trip on the base alone. In Node
  the base alone reads, composes, edits and publishes as the whole
  kernel does (section 7); in a browser it has not been tried.

## 7. The division, made (2026-11-23)

`spike/tools/divide.mjs` builds the kernel whole, gives each function a
short name, works out from the call graph which functions only a
component's entries reach, and divides the module with Binaryen's
`wasm-split`; each module is then optimised as the whole kernel is. The
tool is release 132 of Binaryen, the version of the optimiser already
pinned, from its published archive (SHA-256
`195ddc94f9bc89f45abdabb0b9eea86023d727ba90eac8b35b80f2544fc30572`).

| | Functions | Compressed | KiB |
| --- | ---: | ---: | ---: |
| The kernel whole | 670 | 113 853 | 111.2 |
| **The base** | 640 | **107 093** | **104.6** |
| Printer | 18 | 5 061 | 4.9 |
| Agent | 12 | 3 712 | 3.6 |
| The three together | | 115 866 | |

**What the boundary costs: 2 013 bytes**, 1.8% of the kernel, nearly all
of it in the base: 1 827 over the lower bound of section 1, for the
functions, memory and table it must now export. The printer costs 14
bytes over its lower bound and the agent 662. With the compiler's long
names left on the exports the cost was 6 059; functions are therefore
renamed before the division.

**Reproducible.** Two clean divisions, each from its own build of the
kernel in its own directory, give the same bytes for the base and for
both components.

**Run.** `spike/divided.mjs` asks the same questions of the kernel whole
and divided, and compares the answers byte for byte (9 of 9 agree):

- base, printer and agent together answer everything as the whole kernel
  does: faces, an edit, a published pack, ten projections, a printed
  module;
- the base alone reads, composes, edits and publishes exactly as the
  whole kernel does, gives no text of any projection, and prints nothing;
- with one component left out, the other still answers as the whole
  kernel does.

A component is instantiated with the base's own exports as its imports,
and the base is then told which components stand beside it; a call into
one that is absent is never made.

**Still not done.** The web binding does not load components, a file
does not yet list them, and the envelope still carries the kernel whole.
A page run with the base alone has not been tried.

## 8. The base after decisions and named values (2026-11-23)

| | Compressed | KiB |
| --- | ---: | ---: |
| The kernel whole | 120 347 | 117.5 |
| **The base** | **113 973** | **111.3** |
| Printer | 5 057 | 4.9 |
| Agent | 3 714 | 3.6 |

Since section 7 the base grew by 6 880 bytes: about 2 050 for the
safeguard and what came with decisions in the projections; 4 095 for
recording a decision and undoing a rejected change; 386 for named
values; the rest in the division. Two clean divisions still give the
same bytes, and the divided kernel still answers as the whole one does
(`divided.mjs`, 14 of 14, with the safeguard's cases).

The operators the base holds, being those the tools use: `state`, `arg`,
`let`, `=`, `not`, `and`, `or`, `if`, `+`, `list`, `nth`, `len`,
`concat`, `slice`, `format`, `get` of a record, `ask`. Every other
operator of §7.3 is the formulas component's, and is not built.

**What remains for the base, and what it may cost.** These are
estimates from the size of like code already written, not measurements:

| | Estimate |
| --- | ---: |
| Undo: the undoing already written for rejection, with a tool's origin | 0.5 KB |
| Verifying seals: the bytes signed, the host's `verify`, the result shown | 1 KB |
| Adding an asset: a new object in a change; the blob writer exists | 1 to 1.5 KB |
| Grid layout, and the editing of data | 5 to 8 KB |
| Together | 7.5 to 11 KB |

Against 17.1 KB left, that leaves between 6 and 9.5 KB at the end. The
largest and least certain is the last.
