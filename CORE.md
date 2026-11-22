# UFO in two pages

The whole of the Universal File Object at low resolution: every part of the
[specification](SPEC.md) is here, none in full. Where the two differ, the
specification governs. Nothing is implemented yet.

**What it is.** One file holding a universe of *described* meaning — words,
data, shapes, timing, sound, behavior — with the record of where every byte
came from, the small player that presents it and the tools that edit it. It
opens in any browser with nothing installed. It can present as a document,
plain text, an image, a video, audio, data, a diagram, a 3D scene, an
application or a game. It is meant to be for computing what the PDF is for
pages: open, universal, and independent of any application.

## Storage (SPEC §1–§3)

1. **Record.** An immutable byte string named by its SHA-256 hash: a *chunk*
   of raw bytes (≤ 1 MiB) or a *node*, one value in deterministic CBOR.
2. **Value.** Null, boolean, integer, float, text, bytes, list, map, and
   four references: *ref* (an object's identity), *anchor*, *formula* and
   *indirect* (a value kept outside its node). Records name one another by
   hash in fixed positions.
3. **Blob.** Bytes of any size, divided by their own content into chunks
   of about 10 KiB and a tree above them, so an edit changes only what is
   near it. Pure content, never salted: same bytes, same hash, stored and
   sent once, everywhere. Any range is read without the rest.
4. **Object.** A 16-byte identity, a type, properties. Each state is a
   salted *revision* naming the one before. Unknown types, properties
   and values are always preserved. A large value — a file's bytes, a long
   text — is kept outside its node in a blob and named by an *indirect*,
   which can be *veiled* so that its hash reveals nothing when the content
   is withheld.
5. **Commit.** The hashes of the parent commit, of the object map (a trie whose
   shape depends only on its contents) and of the change it records. Its
   hash, the *root hash*, fixes the universe and all its history. One
   object, the *universe object*, names the entry points, the faces
   offered, the features a reader needs and the components carried.
6. **Pack.** The file: frames holding records, append-only. Each commit ends
   in a checksummed head; the state is whatever the final head names, and
   an interrupted write falls back to the last whole state. Indexes are
   derived. Strict limits, parsing that always terminates, mandatory
   fuzzing, compaction that preserves every hash; simple enough to
   re-implement in a weekend, with byte-level test vectors to check
   against. A reader reports content as malformed,
   inconsistent, unavailable or unrecognized, and opening a file runs
   nothing.

## Memory (SPEC §1.7, §8.5)

7. **Change.** An object recording one commit: its *work* (the operations
   and a note, kept outside the node so that it can be withheld), actor,
   time, and three facts kept apart — **origin** (who or what contributed;
   *witnessed*, *inferred* by a stated method, or *unknown*), **evidence**
   (what supports it) and **decision** (what a person chose). The chain of
   changes is the Chronicle.
8. **Operation.** `new`, `set`, `splice`, `drop`, applied in order to the
   parent commit's state, each stating exactly what it replaced.
9. **Element.** Every item of a sequence — every character of a text — has
   a permanent identity: the change that inserted it and a number. A
   `splice` names elements, not positions. Removed elements stay as
   markers among collaborators, and may be forgotten on publication. The
   order of a sequence is a function of facts all copies share, so
   concurrent edits converge. So every byte has an origin, read and never reconstructed, and
   operations mean the same thing whatever else has changed, which is what
   merging divergent copies will later rest on.
10. **Laws.** Operations come from actual content. Replaying them reproduces
    the new state exactly. A change that does not fit is refused whole. The
    origin recorded with content is never altered; later findings are added
    beside it. History is only extended.

## Addressing (SPEC §4, §1.8, §10.4)

11. **Anchor.** An object and a region on its axes. Axes are *sequence*,
    *continuous* or *keyed*. A sequence region is two boundaries, each
    fixed to an element; a continuous region is in the axis's base
    coordinates, mapped through a frame the object holds; a keyed region is
    a list of keys. An anchor is resolved against the current revision
    alone — no history, no replay — and is reported detached, never
    re-found by matching, when what it named is gone. A span of a text is
    simply an anchor.
12. **Pin.** An anchor plus a salted hash of what it covered and everything
    that content refers to; stale if any of that has changed. Every derived
    thing holds pins to its sources.
13. **Universes compose.** An anchor may name a commit of another universe:
    *nested* if its records are in the pack, *linked* if not. Bodies of
    work of any size are built this way. Every boundary is a **membrane**
    with fixed rules: nested content is verified, immutable and given no
    authority; references cannot be redirected; transfers carry no grants.

## Presentation (SPEC §5–§7)

14. **Eleven primitives.** Text (characters plus spans for structure and
    style), path, raster, samples, region (maps space), group (lays out by
    flow, grid or absolute position), clock (maps time), Portal (presents
    another object, here or in another universe), surface (drawn by a
    program, and may hold children), data, formula (a pure expression over
    data, time, input and state). Handlers on primitives set presentation
    state or propose changes, so forms and editable tables are description.
    Every medium is a composition: a video is clocks over rasters and
    samples; a chart is data, formulas and paths; a 3D scene is data in the
    glTF model, with `x`, `y`, `z` and `t` axes that anchors address, drawn
    by a carried presenter that holds no content of its own. A Portal on a
    wall is an object placed by an anchor into the scene.
15. **Player.** Four parts: the **kernel**, one WebAssembly program run
    unchanged in all the project's readers, which composes a face into a
    *display list*; the **presenters**, which are the host's own drawing and
    audio for the four basic items and carried programs for anything else;
    a thin host **binding** that knows no medium; and the universe. The
    display list's eight items and the input events are a frozen *drawing
    contract*, exactly specified, against which a binding is tested. No
    plugins and no dispatch by type. The kernel holds no decoder: the host
    decodes a baseline of image, audio, video and font formats, and
    everything else is converted to description once, at the border,
    keeping the original bytes.
16. **Faces.** *Sampled*: composed on demand. *Carried*: a stored rendition
    pinned to its sources. *Transmuted*: new description written by a model
    through the format's `derive` action, pinned to its sources. A universe
    lists its faces, made or offered. Every object has a plain-text face.
    An export is a face sampled with stated parameters; live presentation
    uses the host's text rendering, and canonical exports are
    byte-identical everywhere.
17. **Onboard tools.** Kernel functions — overview, search, history, why,
    diff, verify, expand, propose, derive, undo, export — and an interface
    to them that is itself a universe, carried by hash. Agents use the same
    functions through the Model Context Protocol, and what they read back
    is fixed field by field: one record per line, every identity reusable
    as an argument.

## Behavior (SPEC §6.3, §10, §11)

18. **Compute-let.** A complete machine carried as an object: application,
    operating system, machine and environment. One WebAssembly module in a
    sandbox, metered by instructions the reader itself inserts, on a
    virtual clock, deterministic, snapshotted and resumed exactly. It runs
    live alone or inside any universe through a Portal. It has ten host
    functions; everything else is a named **capability** under one
    contract: the manifest requests it with a scope and a reason; the
    person is asked when the program is run, never on opening; grants are
    narrow, revocable at any moment and kept by the reader, never in a
    file; and each capability has a defined result when absent or denied.
    Accelerated graphics follows the WebGPU model.
19. **Printer and ledger.** No source tree. The printer alone writes module
    bytes, from structured operations, deterministically. Every part of a
    module is an item with a lasting key, and traces to its prompt, model
    and tests. Behavior changes while running: tests in force before the
    change gate a candidate on a shadow of live state; the person approves;
    failure leaves the machine untouched.
20. **Trust.** A *seal* is an Ed25519 signature over a root hash; a
    principal is a key, a name, or both, and an unsealed name is only a
    claim. A web page that carries its own reader cannot vouch for itself:
    it labels what it says as the file's account, and an installed reader
    checks it.

## Travel and attention (SPEC §9, §11.7)

21. **Forms.** A pack alone is the working form. The travel form is an
    envelope: by default a valid web page carrying kernel, binding, tools
    and pack, read back from itself with no network; also a video or an
    image whose outer face any player shows, with a visible mark that leads
    back to the universe when a platform strips it. What leaves a reader
    leaves in the travel form.
22. **What leaves.** Three layers, by reachability: *content* (what is
    there now), *attribution* (who and what made it) and *working history*
    (the operations, earlier drafts and prompts).
    The first two always travel. Working history goes to collaborators by
    default and to outside readers only by choice, its hashes remaining so
    the chain of authorship can still be checked. The reader shows exactly
    what will leave.
23. **Light cone.** Summaries at three sizes, each pinned to what it
    condenses, form a tree from the universe, through nested and linked
    universes, down to exact bytes. The cost of an answer scales with the
    question.

## Limits it holds itself to (SPEC §12)

Eleven primitives, three layouts, three axis kinds, four operations, ten
host functions, 39 concepts; a kernel of at most 10 000 lines and 256 KiB;
one implementation of everything in the project's readers; additions only
by showing that data, formulas or composition cannot do the job; and
simplifications that remove mechanism, never reach.
