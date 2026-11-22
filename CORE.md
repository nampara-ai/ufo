# UFO in two pages

The whole of the Universal File Object at low resolution: every part of the
[specification](SPEC.md) is here, none in full. Where the two differ, the
specification governs. Nothing is implemented yet.

**What it is.** One file holding a universe of *described* meaning — words,
data, shapes, timing, sound, behavior — with the full record of where every
byte came from, the small player that presents it and the tools that edit
it. It opens in any browser with nothing installed. It can present as a
document, plain text, an image, a video, audio, data, a diagram, a 3D scene,
an application or a game. It is meant to be for computing what the PDF is
for pages: open, universal, and independent of any application.

## Storage (SPEC §1–§3)

1. **Record.** An immutable byte string named by its SHA-256 hash: a *chunk*
   of raw bytes (≤ 1 MiB) or a *node*, one value in deterministic CBOR.
2. **Value.** Null, boolean, integer, float, text, bytes, list, map, and
   four references: *link* (a record's hash), *ref* (an object's identity),
   *anchor* and *formula*.
3. **Blob.** Bytes of any size as a tree of 1 MiB chunks. Same bytes, same
   hash, everywhere. Any range is read without the rest.
4. **Object.** A 16-byte identity, a type, properties. Each state is a
   salted *revision* linking to the one before. Unknown types and properties
   are always preserved.
5. **Commit.** Links to parent commits and to the object map, a trie whose
   shape depends only on its contents. A commit's hash, the *root hash*,
   fixes the universe and all its history. A *seal* is an Ed25519 signature
   of it; a principal is a key, a name, or both, and an unsealed name is
   only a claim.
6. **Pack.** The file: frames holding records, append-only. Each commit ends
   in a checksummed head, so an interrupted write falls back to the last
   whole state. Indexes are derived. Strict limits, total parsing, fuzzing,
   hash-preserving compaction. A reader distinguishes malformed,
   inconsistent, unavailable and unrecognized content, and opening a file
   runs nothing.

## Memory (SPEC §1.7, §8.5)

7. **Change.** An object recording one commit: operations, actor, time, and
   three facts kept apart — **origin** (who or what contributed; *witnessed*,
   *inferred* by a stated method, or *unknown*), **evidence** (what supports
   it) and **decision** (what a person chose). The chain of changes is the
   Chronicle. Every byte has an origin.
8. **Operation.** `new`, `set`, `splice`, `remap`, `drop`, against a named
   revision. Shape (where, how much) is in the change; content (what was
   removed and inserted) is in salted records.
9. **Laws.** Operations come from actual content. Replaying them reproduces
   the new state exactly. A change that does not fit is refused whole.
   Origin is never guessed silently and never revised. History is only
   extended.

## Addressing (SPEC §4, §1.8, §10.4)

10. **Anchor.** Object, revision, region on the object's axes. Axes are
    *sequence*, *continuous* or *keyed*, with one rule each for carrying a
    region across edits. An anchor that cannot be carried is reported
    detached, never re-found by matching.
11. **Pin.** An anchor plus the hash of what it covered; stale if that has
    changed. Every derived thing holds pins to its sources.
12. **Universes compose.** An anchor may name a commit of another universe:
    *nested* if its records are in the pack, *linked* if not. Bodies of
    work of any size are built this way. Every boundary is a **membrane**
    with fixed rules: nested content is verified, immutable and given no
    authority; references cannot be redirected; transfers carry no grants.

## Presentation (SPEC §5–§7)

13. **Eleven primitives.** Text, path, raster, samples, region (maps space),
    group (lays out by flow, grid or absolute position), clock (maps time),
    Portal (presents another object, here or in another universe), surface
    (drawn by a program, and may hold children), data, formula (a pure
    expression over data, time, input and state). Handlers on primitives
    set presentation state or propose changes, so forms and editable tables
    are description. Every medium is a composition: a video is clocks over
    rasters and samples; a chart is data, formulas and paths; a 3D scene is
    data in the glTF model drawn by a carried presenter.
14. **Player.** Four parts: the **kernel**, one WebAssembly program run
    unchanged everywhere, which composes a face into a *display list*;
    four base **presenters** that output it; a thin host **binding** that
    knows no medium; and the universe. No second implementation, no
    plugins. The kernel holds no decoder: the host decodes a baseline of
    image, audio, video and font formats, and everything else is converted
    to description once, at the border, keeping the original bytes.
15. **Faces.** *Sampled*: composed on demand. *Carried*: a stored rendition
    pinned to its sources. *Transmuted*: new description written by a model
    through the format's `derive` operation, pinned to its sources. A
    universe lists its faces. Every object has a plain-text face. An export
    is a face sampled with stated parameters; canonical exports are
    byte-identical everywhere.
16. **Onboard tools.** Kernel functions — overview, search, history, why,
    diff, verify, expand, propose, derive, export — and an interface to
    them that is itself a universe, carried by hash. Agents use the same
    functions through the Model Context Protocol.

## Behavior (SPEC §6.3, §10, §11)

17. **Compute-let.** A complete machine carried as an object: application,
    operating system, machine and environment. WebAssembly in a sandbox,
    fuel-metered, on a virtual clock, deterministic, snapshotted and
    resumed exactly. It runs live alone or inside any universe through a
    Portal. It has ten host functions; everything else is a named
    **capability** the manifest requests and only the person grants,
    narrowly and revocably, with a defined fallback when absent.
18. **Printer and ledger.** No source tree. The printer alone writes module
    bytes, from structured operations, deterministically; each function
    body, named by its hash, traces to its prompt, model and tests.
    Behavior changes while running: tests in force before the change gate a
    candidate on a shadow of live state, and failure leaves the machine
    untouched.

## Travel and attention (SPEC §9, §11.7)

19. **Forms.** A pack alone is the working form. The travel form is an
    envelope: by default a valid web page carrying kernel, binding, tools
    and pack, read back from itself; also a video or an image whose outer
    face any player shows, with a visible mark that leads back to the
    universe when a platform strips it. What leaves a reader leaves in the
    travel form.
20. **What leaves.** Content and its attribution always. Working history
    goes to collaborators by default and to outside readers only by choice,
    its hashes remaining so authorship still verifies. The reader shows
    exactly what will leave.
21. **Light cone.** Summaries at three sizes, each pinned to what it
    condenses, form a tree from the universe, through nested and linked
    universes, down to exact bytes. The cost of an answer scales with the
    question.

## Limits it holds itself to (SPEC §12)

Eleven primitives, three layouts, three axis kinds, five operations, ten
host functions, 38 concepts; a kernel of at most 10 000 lines and 256 KiB;
one implementation of everything; additions only by showing that data,
formulas or composition cannot do the job.
