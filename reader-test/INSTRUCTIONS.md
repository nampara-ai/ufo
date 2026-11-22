# Reader test: instructions for the implementer

You are an independent implementer taking part in a strict "spec-first
reader test" of a file-format specification. The purpose is to find out
whether a reader can be built from the specification's text ALONE. Your
failures and confusions are the result being measured, so honesty matters
far more than success.

## What you have

- `SPEC.md`: the core document of the specification. It is the only
  description of the format you may use.
- `packs/`: files in the format.

You have no expected values. They are held back until you have finished.

## Strict rules

- Work only in this directory. Do not look for information about this
  format anywhere else: not on disk, not on the web, not in a repository.
  General references — RFC 8949 (CBOR), SHA-256, DEFLATE, Unicode — are
  fine, from your own knowledge or a standard library.
- `SPEC.md` refers to other documents (`SPEC-PRESENTATION.md` and so on).
  You do not have them and must not seek them. If somewhere the core
  cannot be implemented without them, that is a finding: write it down.
- You may read the files in `packs/` as bytes; that is the point. But do
  not learn the format from them by reverse engineering where the text is
  silent. When the text does not tell you what to do, record the gap in
  `NOTES.md` FIRST — quote the sentence or name the section, and say what
  is missing. Only then may you look at the bytes to choose an
  interpretation, and you must say that you did.
- Use one language and its standard library only. No third-party
  packages.

## Phase 1

Read `SPEC.md` in full, carefully, before writing code. Then write a
reader of the core and run it on every file in `packs/`. From the text
alone it should:

1. Find the current state of each pack: the head, and the recovery
   procedure when the tail is damaged. Test this yourself by truncating
   copies of packs at a few places.
2. Read and verify every record by its hash; decode values strictly, as
   the text requires; handle compressed frames; read the index.
3. Walk the commit chain. For each commit read the object map and every
   object's revision; resolve indirects, including veiled ones, and
   blobs.
4. For every change whose work is present, replay its operations on the
   parent state and check that the result equals the committed state
   exactly: the conservation check and the other laws of change. Where
   work is withheld, report it as withheld.
5. Handle sequences: `seq`, runs, tombstones. Resolve every anchor you
   find in any property against its object, at every commit: sequence,
   continuous and keyed regions; scales; extents.
6. Compute the digest of a pin as §4.4 defines it: a function that takes
   an object, an optional region and a salt. You have no expected values
   yet; just implement it.
7. Timelines (§4.5): for a clock whose `t` is a count, resolve its plays
   and, for a given position, say which plays are present and at what
   time.
8. References to other universes (§1.8): tell nested from linked; read a
   nested universe's objects.
9. What a pack may lack (§2.5): compute the three layers of each pack,
   and report every missing record as the text says: withheld, absent, or
   malformed storage.

Skip anything that belongs to documents you do not have: presentation,
the player, execution, travel envelopes, the verification of a seal's
signature. If the core's text leaves you unable to tell whether something
is core, note it.

Write `results.json`. For each pack: the state's root hash; each commit
(hash, height, change identity); for each commit the objects (identity,
type, revision hash); every text's characters and `seq`; every anchor
found and what it resolves to at each commit; the result of the
conservation check for each change; the hashes of the records in each of
the three layers; counts of records verified; anything reported
malformed, inconsistent, unavailable or unrecognized. For a pack that
holds a timeline: for each commit, where each play resolves and what
plays at a few positions of your choosing, for example every whole
second.

Write `NOTES.md` as you go, not at the end: a numbered list of every
place the text was ambiguous, silent, contradictory, wrong, or required
reading the bytes to decide. For each: the section, the sentence, what
you needed, what you did, and whether you looked at bytes. Also record:
anything you found easy and clear, briefly; roughly how long each part
took; any bug of your own that you fixed, and whether a clearer text
would have prevented it.

## When phase 1 is done

Stop, and report: what runs, what does not, the number of entries in
`NOTES.md` and the five most serious, and any result that surprised you.
Keep an untouched copy of your reader and of `results.json` as they are
at this moment.

## Phase 2

You will then be given `vectors.json` and, with it, a few provisional
values. Do not change your reader yet.

1. Write a check that compares what your phase 1 reader computes with
   every expected value it can be compared with, including the small
   unit-level groups: value encodings, record hashes, blob chunking and
   trees, object map roots, the cases of region resolution, digests with
   the given salts and regions, timelines, layers. Ignore groups that
   belong to other documents (`printer`, instrumentation).
2. Where a vector needs a function you did not write in phase 1, say
   whether the core's text defines it. If it does, write it now, from the
   text, in a separate file, and record that it was written after you saw
   which things are tested.
3. For EVERY mismatch write an entry: what was compared, your value, the
   expected value, and a classification — (a) your bug: the text was
   clear and you erred; (b) the text's defect: ambiguous, silent or
   wrong, and which of your notes predicted it, if any; (c) the vector's
   defect: the expected value contradicts the text; (d) not comparable.
   Then say what the smallest change to the TEXT would be that would have
   made you get it right. Only after classifying may you fix your reader,
   and re-run to see whether the fix makes everything agree; record that
   too.
4. Give a table of agreement by group — compared, agreed on the first
   run, agreed after fixes — and your judgment in a few sentences: can
   the core be built from its text alone? What ten changes to the text
   would help the next implementer most?
