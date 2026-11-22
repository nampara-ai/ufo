# UFO in brief

The whole of the Universal File Object at low resolution, in about four
pages: every part of the [specification](SPEC.md) is here, none in full. Where the two differ, the
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
   of raw bytes (at most 64 KiB) or a *node*, one value in deterministic CBOR.
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

## Memory (SPEC §1.7, §5.4)

7. **Change.** An object recording one commit: its *work* (the operations
   and a note, kept outside the node so that it can be withheld), actor,
   time, and three facts kept apart — **origin** (who or what contributed;
   *witnessed*, *inferred* by a stated method, or *unknown*), **evidence**
   (what supports it) and **decision** (what a person chose). The chain of
   changes is the Chronicle.
8. **Operation.** `new`, `set`, `splice`, `drop`, applied in order to the
   parent commit's state, each stating exactly what it replaced. These four
   edit everything, machine code included.
9. **Element.** Every item of a sequence — every character of a text — has
   a permanent identity: the change that inserted it and a number. A
   `splice` names elements, not positions. Removed elements stay as
   tombstones among collaborators, and may be forgotten on publication. The
   order of a sequence is a function of facts all copies share, so
   concurrent edits converge. So every byte has an origin, read and never reconstructed, and
   operations mean the same thing whatever else has changed, which is what
   merging divergent copies will later rest on.
10. **Laws.** Operations come from actual content. Replaying them reproduces
    the new state exactly. A change that does not fit is refused whole. The
    origin recorded with content is never altered; later findings are added
    beside it. History is only extended.

## Addressing (SPEC §4, §1.8, §14.4)

11. **Anchor.** An object and a region on its axes. Axes are *sequence*,
    *continuous* or *keyed*. A sequence region is two boundaries, each
    fixed to an element; a continuous region is in the axis's base
    coordinates, mapped through a scale the object holds; a keyed region is
    a list of keys. An anchor is resolved against the current revision
    alone — no history, no replay — and is reported detached, never
    re-found by matching, when what it named is gone. A span of a text is
    simply an anchor. Time that is edited is a sequence too: a timeline is
    a clock whose flicks are elements, a cut is a splice, and what plays
    is attached to it as spans are to a text, so that an anchor into time
    survives a cut as an anchor into a text survives a deletion.
12. **Pin.** An anchor plus a salted hash of what it covered and everything
    that content refers to; stale if any of that has changed. Every derived
    thing holds pins to its sources.
13. **Universes compose.** An anchor may name a commit of another universe:
    *nested* if its records are in the pack, *linked* if not, in which
    case the file holds its hash, a label and a hint of where to look,
    and little else is yet specified. Bodies of work of any size are
    built this way. A chain of Portals never presents a universe inside
    itself, and a reader stops at a stated depth of nesting. Every boundary is a **membrane**
    with fixed rules: nested content is verified, immutable and given no
    authority; references cannot be redirected; transfers carry no grants.

## Presentation (SPEC §7–§9)

14. **Eleven primitives.** Text (characters plus spans for structure and
    style), path, raster, samples, pane (maps space), group (lays out by
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
    *display list* — text into blocks, lines and rows, rows into pages, by
    a fixed algorithm that breaks every line itself and asks the host only
    what a piece of text measures; the
    **presenters**, which are the host's own drawing and
    audio for the four basic items and carried programs for anything else;
    a thin host **binding** that knows no medium; and the universe. A
    file carries only the components its content needs, each named by
    hash, and a reader that already holds one uses its own. The
    display list's eight items and the input events are a frozen *drawing
    contract*, exactly specified, against which a binding is tested. No
    plugins and no dispatch by type. The kernel holds no decoder: the host
    decodes a baseline of image, audio, video and font formats, and
    everything else is converted to description once, at the border,
    keeping the original bytes.
16. **Faces.** *Sampled*: composed on demand. *Carried*: a stored rendition
    pinned to its sources. *Transmuted*: new description written by a model
    through the format's `derive` action, pinned to its sources, with a
    *recipe* — sources, model, prompt, parameters — from which it is made
    again in one step when they change. A universe lists its faces, made or
    offered. Every object has a plain-text face, which keeps paragraph
    breaks and list markers and includes, marked, the text of universes
    nested in the file. An export is a face sampled with stated parameters.
    Live presentation uses the host's text rendering; a canonical export is
    reproducible given a renderer named by its hash, a component fetched
    only when such an export is asked for and never part of an ordinary
    file's player.
17. **Onboard tools.** Kernel functions — overview, search, history, why,
    diff, verify, expand, recipe, propose, try, derive, refresh, undo,
    export — and an interface
    to them that is itself a universe, carried by hash and presented with
    the universe being worked on as its *subject*. Agents use the same
    functions through the Model Context Protocol, and what they read back
    is fixed field by field: one record per line, every identity reusable
    as an argument.

## Behavior (SPEC §9.3, §14, §12)

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
19. **Printer and ledger.** No source tree. Code is description: a function
    is an object whose body is a sequence of statements in WebAssembly's
    own vocabulary, each an element with an identity and an origin, edited
    by the same four operations as text. The printer, a function of the
    kernel, alone writes module bytes from the description,
    deterministically: the bytes are a face of the code, always verifiable
    against it, and nothing is stored twice. Every statement traces to
    the change that wrote it, and through that to its prompt and model;
    the tests it passed are recorded when a change is promoted. A program compiled elsewhere is carried as
    an asset and lifted to description when it is first maintained.
    Behavior changes while running: tests in force before the change gate a
    candidate on a shadow of live state; the person approves; failure
    leaves the machine untouched.
20. **Trust.** A *seal* is an Ed25519 signature over a root hash; a
    principal is a key, a name, or both, and an unsealed name is only a
    claim. A web page that carries its own reader cannot vouch for itself:
    it labels what it says as the file's account, and an installed reader
    checks it.

## Travel and attention (SPEC §13, §10.2)

21. **Forms.** A pack alone is the working form. The travel form is an
    envelope: by default a valid web page carrying kernel, binding, tools
    and pack, read back from itself with no network, with a static face
    of the text for a previewer that runs no script; also a video or an
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
23. **Light cone.** Two layers. An *outline* the kernel computes for
    anything — its parts, their sizes and kinds, headings, who changed what
    and when — bounded, always current, needing no model, from the universe
    through nested and linked universes down to exact bytes. And
    *summaries* written by a model, each pinned to what it condenses and
    shown beside the outline's parts, worth writing where the outline
    cannot tell siblings apart. The cost of an answer scales with the
    question.

## Readers and applications (SPEC §13.5, §14.3, §16)

24. **The reader ladder.** The same file works on three rungs, each a
    binding and shell around the same kernel: any browser opening a web
    envelope, with nothing installed; the reader installed as a web app;
    and native and command-line readers, which add file association,
    seal verification, permission prompts and the agent interface.
25. **Delegation.** A principal may pass a capability it holds to
    another, never wider than its own.
26. **Applications.** An application with richer records of its own
    writes portable facts in the format's terms and keeps the rest as
    properties under its own prefix, which every other writer preserves.
    That this loses nothing is a claim worked on paper for one
    application, and not yet run.

## Limits it holds itself to (SPEC §6)

Eleven primitives, three layouts, three axis kinds, four operations, ten
host functions, 121 concepts for a newcomer to learn, 58 of them in the core; a kernel of at most 128 KiB as it travels,
compressed, and 6 000 lines;
one implementation of everything in the project's readers; additions only
by showing that data, formulas or composition cannot do the job; and
simplifications that remove mechanism, never reach.
