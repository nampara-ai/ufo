# Envelope spike: notes

## 2026-11-22: the kernel's write path, and tools (pieces 1 and 2 of PLAN.md)

What was added to `spike/kernel`: `write.rs` (new: `propose`, the replay, a
blob writer, the object map, base64), the append in `pack.rs` (`commit`:
records, index, head, then the state found afresh), `block_at`, `handler`
and `press` on items in `layout.rs`, seven exports in `lib.rs`. Tests:
`roundtrip.mjs` (the acceptance steps the kernel can do alone) and
`more-edits.mjs` (eleven edits in a row, each against a model).

### How `propose` works

1. Arguments, the head commit (`v` must be 1), the object (a `ufo.text`
   with no `syntax`, **X3**), **X1** on its `chars`, the positions.
2. One `splice` by element identity, made by cutting the runs of `seq` at
   `lo` and `hi`: `del` (runs), `old` (the characters there), `ins`,
   `after`. The new `seq` comes out of the same cut, tombstones kept, runs
   merged. New elements are numbered from 0 by the new change.
3. Inline spans that had an extent and now have none: one `set` each,
   `key: ["spans", k]`, `old` the span, no `val` (5.1).
4. The operations are encoded as the `work` will be, decoded again, and
   applied to the parent state by a second piece of code (`replay`) that
   knows only the rule of 1.7: it finds elements by identity among the
   expanded elements, checks `del` is live and `old` matches, inserts after
   `after`, and builds runs its own way. Its `p` and `seq` are compared with
   the new state by their canonical encodings. Any difference refuses the
   change; nothing has been written.
5. Records: the text's revision (made from the old node: `rev`+1, `prev`,
   `by`, `salt`, `p`, `seq`; everything else carried), the work's blob and
   its 48-byte opening, the change object, the object map rebuilt from all
   its entries, the commit.
6. `Pack::commit` appends the records the pack does not already hold, an
   index, and the head; then finds the state afresh from the bytes (2.3),
   which checks the head it wrote (**P3**). If that does not give the new
   commit, the bytes are taken off again.
7. The text is read back the ordinary way and compared with the state
   meant; if it differs the append is taken off and the change refused.

The 64 `random` bytes: change identity, the text revision's salt, the
change revision's salt, the opening's salt, 16 each, in that order.

### The index (2.4): what was done

An index is written with every commit (the text requires one only past
1 024 records or 16 MiB uncovered). It covers from the end of the newest
index's coverage (or the signature) to its own offset: every chunk and
node frame there is hashed and listed, lowest offset first for a repeated
record. Then the merge rule as written: while the index before has no more
than twice as many entries as the merged one so far, its entries are taken
in and its previous-index offset taken over. Entries are sorted by hash and
a hash listed twice keeps its lowest offset. In `edited.ufx` the first
index (10 entries) is absorbed by the second (7 new, 17 merged, previous
0). In `edited-many.ufx` the chain at the end is 18 entries, then 79.
The head's index offset names the new index; its previous-head offset
names the head that gave the state.

### Checked by the independent reader

The reader written from SPEC.md alone (`readertest2`, copied, not
modified) on the two packs written here:

- `edited.ufx`: state by the final head, `d34606c3…`; 17 records, all
  reachable and verified; index: one, 17 entries, no problems; both commits
  conservation `ok`; nothing reported malformed, inconsistent or missing.
- `edited-many.ufx`: 12 commits, 97 records, all verified; index chain
  18 → 79, no problems; all twelve conservation checks `ok`, including the
  change with a `set` that removes a span, the three removals with no
  `origin`, and the commits whose `chars` and `seq` are in blobs of two
  chunks (the reader checks the blob's shape against its bytes).

### What in SPEC.md was unclear, or had to be decided

1. **Where the new items of a replacement go** (1.7, 5.1). A splice puts
   `ins` after `after`; the text does not say which element a writer
   should name when it replaces a stretch. If it names the element before
   the stretch, then replacing the first characters of a block puts the new
   text in the block *before*: the block's start is "just before its first
   element", that element is now a tombstone lying after the new items, and
   a boundary on a tombstone resolves after them (4.3). 5.1 covers "text
   typed at the very start of a paragraph" (move the boundary with a `set`)
   but not a replacement. Decided: with anything removed, `after` is the
   **last removed element**. Every boundary fixed to a removed element then
   resolves just before the new text, so the text stays in the block it
   replaced part of, and no `set` is needed. This relies on "it may be a
   removed element" covering an element the same splice removes; the
   independent reader accepts it. The specification should say which.
2. **An insertion at the start of a block, with nothing removed.** It joins
   the block before (5.1's convention), and at position 0 it lies before
   the first block, in none. `propose` has no way to ask otherwise, and the
   text does not say which boundaries the `set` of 5.1 should move: the
   block's start alone would leave it overlapping the block before, whose
   end is the same boundary. Not handled.
3. **"An inline span left with no extent"** (5.1) is not defined. Taken as:
   both boundaries resolve and the first is not before the second, where
   before the change it was. Removed with a `set` on the path
   `["spans", key]` with `old` the whole span. Whether that `set` is
   required for conservation, or only asked of a text writer, is not said;
   the independent reader accepts the change with it.
4. **L1 and a replacement that repeats what was there.** If `ins` begins or
   ends as the removed stretch does, must the splice be reduced to the
   difference? L1 says operations are computed from the content before and
   after, which could be read either way. Not reduced: what the person put
   is new elements, attributed to them, even where it equals what was
   there. An `ins` equal to `old` is accepted.
5. **`origin` on a change that only removes** (1.7: "absent if the change
   introduces none"). PLAN.md asked for an origin always; the kernel omits
   it when nothing is inserted. The `history` projection then prints
   `basis=unknown` for that change, which reads badly for a removal a
   person plainly made: the actor is still there, but nothing says "by
   person". Worth a sentence in 5.4 or Appendix B.
6. **Keys of an `obj` node this document does not list**, when a new
   revision is written. Appendix C says they are "preserved", which is
   said of copying. Carried into the new revision.
7. **Where a value is kept in the new revision** (1.4). SHOULD go outside
   past 4 096 bytes of encoding; nothing is said of a value that was
   outside and is now small, or of whether the form should be stable.
   Decided: outside if it was, or if its encoding exceeds 4 096 bytes;
   never moved back in. A veiled `chars` or `seq` is refused (it would need
   a salt and a decision about who may veil).
8. **The merge rule of 2.4.** "No more than twice as many entries as the
   merged index so far": taken before duplicates are dropped. "Covers from
   where that one began" has no field to write; it follows from the
   previous-index offset taken over. The non-normative generator
   (`tools/vectors/generate.py`) merges at most once, not "repeatedly".
9. **A record the pack already holds** is not written again (2.1 allows
   either). "Holds" means read back by hash and verified, not merely
   listed by an index (**P9**).
10. **"Never reused"** (1.5, of an identity). A writer can check the
    current object map and the `seq` it is editing; it cannot check
    identities of dropped objects or elements forgotten. The kernel refuses
    a change identity found in either of the first two and otherwise trusts
    the host's random bytes.
11. **`del` runs.** The rule that adjacent runs are written as one is said
    of `seq`. In `del` the kernel merges by change and number alone, so one
    run may name elements that are not neighbours in the sequence (another
    change's elements lie between); `old` is in sequence order. The
    independent reader accepts it; the text could say whether it is meant.
12. **`actor.with`** (Appendix C requires `name` and `version`): written as
    `ufo-spike-kernel`, `0.0.0`. `actor.who` and `origin.who` are both
    `{name}` from `who`; a principal with no key is allowed by the schema.
13. **2.2 steps 3 and 5 (durable)** mean nothing inside the kernel: it
    holds the pack in memory and the host saves it. The order of the bytes
    is the order of 2.2.

### Limits of what was built

- One kind of edit: a replacement by positions in the `chars` of a
  `ufo.text`. The replay knows `splice` on an existing text and `set`; not
  `new`, `drop`, `forget`, a splice that creates its property, bytes,
  lists or counts.
- A pack recovered by scan (bytes after its last valid head) is not
  written to: **P7**'s search and truncation are not implemented.
- A span to be removed that is kept outside the node, and veiled values,
  are refused.
- The blob writer's tree above one group (a blob of more than about a
  thousand chunks) is written but was never run. One and two chunks were,
  and read back by both readers.
- The object map is rebuilt whole and re-encoded at each commit (unchanged
  nodes are not written again). An interior node (more than 32 objects)
  was not exercised by these packs.
- Sequences are expanded element by element in the replay and in `block_at`;
  the replay finds each element by a linear search. Fine for a page, not
  for a book.
- No lock (2.2 step 1): one kernel instance holds the pack.

### Size

Same build and flags as SIZE-NOTES.md (`wasm-opt -Oz …`, raw DEFLATE 9).

| Build | After cargo | After `wasm-opt -Oz` | DEFLATE |
| --- | ---: | ---: | ---: |
| Before (SIZE-NOTES.md, the default build) | 180 147 | 154 154 | 71 742 |
| Now | 214 026 | 183 191 | 85 624 |
| Difference | +33 879 | +29 037 | +13 882 |

Measured once, earlier in the work, by cutting calls: without `propose`
(and so without the append) 159 384 and 74 161; without base64 as well
158 449 and 73 719. So the write path is about 23 700 optimised and 11 400
deflated, the tools and `block_at` about 4 300 and 2 000, base64 about 900
and 400. The write path is about 60 bytes a line, heavier than anything
but queries: it builds many small maps by hand (`map(vec![…])`), clones
values freely and encodes to compare. None of that was tuned. No
`core::fmt` came in (`strings | grep -c 3fmt`: 0), no dependency was
added, and the library sort and tree maps are still unused.

Lines (`git diff --numstat`, and `wc -l` for new files): `write.rs` 401
new; `pack.rs` +102 −2; `lib.rs` +60 −2; `layout.rs` +49 −3;
`binding.mjs` +10; `roundtrip.mjs` 100 and `more-edits.mjs` 48 new.
