# Where the text did not decide: digests, layers, timelines, projections

Written while making the spike kernel answer the queries behind the
provisional vectors (`spike/kernel/src/query.rs`, `project.rs`). Each item
is a place where the specification's text was silent or ambiguous, with
the choice the kernel made. Every one is a defect of the text, not of the
kernel, until the text is changed. Section numbers are those of 0.8.

## What travels (§13.3)

1. **The current object map is in no layer.** Content is "the current
   revision of every live object" and the blobs they name; attribution
   includes "every commit node". The nodes of the current object map,
   without which no object can be found, are not mentioned. *Chosen:*
   content.
2. **The opening of a veiled `work`.** A change's `work` is working
   history; the change object is attribution. The small record that opens
   the veil is neither named. If it travels, the recipient learns the hash
   of the work's blob, which the veil exists to hide. *Chosen:* working
   history, with the work.
3. **A nested universe's records.** Content includes "what a live
   object's anchor names in an earlier commit (§1.8)". For an anchor into
   a nested universe the kernel takes the named commit, its object map,
   the named object and that universe's own universe object, and all they
   reach. Whether the nested universe's own changes and commit chain are
   attribution of the outer universe is not said. *Chosen:* they are not
   followed; they fall into working history, which cannot be right for a
   published copy that must still verify the nested universe.
4. **"Records evidence, a decision or a finding about live content."**
   The kernel includes every change that holds any of the three, without
   testing what they are about.
5. **Not exercised:** an earlier revision pinned as evidence; `from`;
   `origin.sources`; summaries. No copy holding only the first two layers
   has been written and opened. The lists are of records; nothing shows
   that they suffice.

## Digests (§4.4)

6. **"Sharing at least one element."** For a span whose region is empty
   but lies inside the covered region, the kernel says it does not touch.
7. **Followed objects of a region.** A region's covered value can name
   its own object by a ref inside a touching entry; the kernel follows it
   as any other. For a whole object the object itself is not followed.
8. **Not exercised:** keyed and continuous axes; regions on two axes;
   children outside a continuous region; objects of the same derivation;
   a Portal's `of`; Compute-let snapshots.

## Timelines (§4.5)

9. **A play whose region starts at `start`.** Its first element is taken
   to be the first present element of the sequence at the time of
   reading, so its time base moves if time is inserted before it. A play
   should begin at a named element; the text should require it.
10. **`repeat`, `rate` other than 1, and `held` or `free` modes on a
    timeline** are not defined by §4.5 and were not tried.

## Projections (Appendix B)

11. **Ranges have no record.** §10.2 says that beyond 64 parts an outline
    shows ranges, "each range with the labels of its first and last parts,
    their number and the total of their sizes". Appendix B has no record
    kind for a range. *Not implemented.*
12. **`type` of a part of a text.** A part that is a block or a section
    is not an object. *Chosen:* the block's role, or `section`.
13. **`by` of a part.** §10.2 says "by which actor"; the records of
    Appendix B use `by` for the origin's kind (`person`, `model`).
    *Chosen:* the origin's kind.
14. **`actor`** is a map in a change. *Chosen:* the name of its `who`, as
    a JSON string.
15. **`types`** of a universe: "count of objects of each type" has no
    spelling. *Chosen:* `[type:count,…]` in order of type name.
16. **Which hashes a short hash must be unique among.** *Chosen:*
    identities among those in the commit's object map; revisions among
    current revisions; commits among the chain from the head.
17. **Change objects in a universe's outline.** "Its other objects,
    grouped by type" includes every change. In `history.ufx` they are 3
    of 47 parts; in a long-lived universe they would be most of them.
18. **The section rule finds nothing in a common document.** A text with
    one heading of level 1 and one of level 2 has no level with two
    headings, and is outlined as its blocks: 17 parts for the test text,
    with no structure. The rule should fall back to the deepest level
    that divides the text at all.
19. **A region that cuts a block.** `expand` of a region lists the blocks
    wholly inside it.
20. **`referrer`** would list a change whose operations mention the
    object. *Chosen:* a change's `work` is not searched.
21. **`sealed`** on a run. *Chosen:* true where some seal names a commit
    at or after the one that made the change. Seals are shown
    `unchecked`: this kernel has no signature verification.
22. **`supported`** of a feature cannot be a function of the commit and
    the arguments alone, as every projection is required to be: it
    depends on the reader.
23. **`run`** in the `object` projection is undefined there. *Chosen:* as
    in `why`, for each sequence property.
24. **Appendix B still lists `items`**, a projection of the design before
    code became description.
