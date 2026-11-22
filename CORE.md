# UFO in two pages

This is the whole format, stated so that a capable engineer could build it
in outline. [SPEC.md](SPEC.md) is the precise version; where the two differ,
the specification governs. Nothing here is implemented.

## Storage

1. **Record.** An immutable byte string named by its SHA-256 hash. Two
   kinds: a *chunk* of raw bytes (at most 1 MiB) and a *node*, one value in
   deterministic CBOR.
2. **Value.** Null, boolean, integer, float, text, bytes, list, map, and
   four references: a *link* (a record's hash), a *ref* (an object's
   identity), an *anchor* (below) and a *formula* (below).
3. **Blob.** A byte stream of any size: a node listing its 1 MiB chunks, as
   a tree when there are more than 1024. The same bytes have the same hash
   everywhere.
4. **Object.** A 16-byte identity, a type and a map of properties. Each
   state is a *revision*: a node holding the properties, a link to the
   previous revision, and the identity of the change that made it.
5. **Commit.** A node holding links to its parent commits and to the object
   map — a trie from identity to current revision whose shape depends only
   on its contents. The hash of a commit fixes the whole universe and all
   its history. A *seal* is an Ed25519 signature of that hash.
6. **Pack.** The file: a signature, then frames (kind, codec, length,
   payload) holding records. It only grows. Each commit ends with a
   checksummed 67-byte head frame, so an interrupted write falls back to the
   last complete state. Index frames map hashes to offsets and are derived:
   delete them and nothing is lost.

## Change

7. **Change.** An object recording one commit: its operations, who
   committed it, and three facts kept apart — **origin** (who or what
   contributed the content; witnessed, inferred or unknown), **evidence**
   (what supports it) and **decision** (what a person chose).
8. **Operation.** `new`, `set`, `splice`, `remap` or `drop`, each naming the
   revision it applies to. Its shape (where, how much) is in the change; its
   content (what was removed and inserted) is in separate salted records.
9. **Laws.** Operations are computed from actual content, not from an
   account of it. Applying them to the parent state must reproduce the new
   state exactly. A change that does not fit its baseline is refused whole.
   Origin is never guessed and never revised. Nothing is deleted from
   history.

## Addressing

10. **Anchor.** Object, revision hash, and a region on the object's axes.
    An axis is a *sequence* (characters, items), *continuous* (time, length)
    or *keyed* (rows, children). An anchor is carried to a later revision by
    replaying operation shapes: splices shift sequence positions, remaps
    scale and shift continuous ones, keys persist until removed. If that
    fails, the anchor is reported detached. It is never re-found by
    matching.
11. **Pin.** An anchor plus the hash of what it covered. If the content
    there now hashes differently, the pin is stale. Everything derived from
    something else — a rendition, an AI-made deck, a summary — holds pins to
    its sources, and that is how it knows when it is out of date.
12. **Other universes.** An anchor may name a commit of another universe.
    If those records are in the same pack the universe is nested; if not,
    it is linked. Either way it is immutable and verified by hash.

## Presentation

13. **Primitives.** Text, path, raster, samples, region, group, clock,
    Portal, surface, data, formula. A region maps space; a clock maps time;
    a group lays out children by flow, grid or absolute position; a Portal
    presents another object; a surface is drawn by a program; data holds
    tables; a formula is a pure expression over data, time and input. A
    document, chart, video, deck and interface are arrangements of these.
14. **Kernel.** One program, compiled once to WebAssembly and run unchanged
    everywhere. Given a face, a size and a time, it composes the description
    into a *display list*: text runs, paths, rasters, samples and surfaces
    in nested coordinate spaces. The host draws that list. The kernel holds
    no decoder; the host decodes common images, audio, video and fonts.
    Other foreign content is converted to description once, on import, and
    its original bytes are kept.
15. **Face.** A presentation. *Sampled*: composed on demand, nothing
    stored. *Carried*: a stored rendition with pins to its sources.
    *Transmuted*: new description written by a model, with pins to its
    sources. An export is a face sampled with stated parameters and encoded
    by the host.

## Behavior

16. **Compute-let.** WebAssembly carried as an object, run in a sandbox with
    fuel metering and a virtual clock, so the same inputs give the same
    behavior everywhere. It can call ten host functions: draw, input, time,
    random, send, receive, checkpoint, capability, call, log. Everything
    else — network, graphics acceleration, other objects — is a *capability*
    the file may request and only the person can grant.
17. **Printer.** The only writer of module bytes. An agent gives it
    operations ("replace this function's instructions"); it checks them
    against the baseline, encodes, re-derives every mechanical byte, and
    validates. The changes it writes are the ledger: each function body,
    named by its hash, traces to the prompt, model and tests behind it. A
    change takes effect only if the tests in force before it pass on a
    shadow copy of the running state.

## Travel

18. **Envelope.** A pack alone is the working form. For travel it rides in
    a valid web page that also carries the kernel and a small host binding,
    with the pack as base64 text the page reads from itself. Opened in any
    browser, it runs with no network and nothing installed.
19. **What leaves.** The current content and its attribution travel by
    default. Working history — prompts, drafts, earlier revisions — is
    withheld unless the person includes it; its hashes remain, so the
    authorship chain still verifies. The reader shows exactly what will
    leave before it does.
20. **Attention.** Summaries at three sizes, each pinned to what it
    condenses, form a tree from the universe down to content. A reader or
    agent starts at the top and expands only what its question needs.

## What a reader must never do

Run anything because a file was opened. Present damaged or inconsistent
content as content. Show an inferred origin as a witnessed one. Resolve a
reference by guessing. Let a file grant itself authority. Carry a second
implementation of the kernel.
