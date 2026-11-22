# The reader test

A test of whether the core of the specification can be built from its
text alone. An implementer who knows nothing of the project is given the
core document and the pack files, and nothing else. Expected values are
held back until their reader is written.

A vector that such a reader reproduces rises from *provisional* to
*reproduced*; one that two independent readers reproduce, at least one of
them from a different model family or a person, is *confirmed*
(`vectors/STATUS.json`).

## Running it

    python3 reader-test/package.py

writes `ufo-reader-test.zip`, holding exactly:

- `SPEC.md`, the core document;
- `INSTRUCTIONS.md`, the brief, word for word as every implementer gets it;
- `packs/`, every `.ufx` file of `vectors/`.

It holds no expected values, no other part of the specification, no
generator and no kernel. Give the implementer the archive and nothing
else, in a place where the rest of this repository cannot be read.

When they report that phase 1 is done, give them, for phase 2:

- `vectors/vectors.json`
- `vectors/provisional/staleness.json` and `vectors/provisional/layers.json`

and ask for what the brief's last section asks for: every mismatch
classified, a table of agreement by group, and the ten changes to the
text that would help the next implementer most.

## What has been run

| When | Who | Result |
| --- | --- | --- |
| 2026-11-22 | an independent instance of the model that wrote the specification, given the core of version 0.8 | 304 of 311 on the first run; 52 notes. ORIENTATION.md §20 |
