# What became of the 35 findings

The findings are the two numbered lists of NOTES.md: thirteen from the
kernel's write path (W1 to W13 here), twenty-two from the envelope (E1 to
E22). Each has one of four answers:

- **(a)** resolved by the revision of 2026-11-23, with the test that shows it;
- **(b)** a fix of behaviour made then, with its test;
- **(c)** needs a change to the text of the specification, and what would
  exercise it;
- **(d)** not addressed, and why.

Tests are named as `roundtrip.mjs` prints them (the kernel alone, in Node)
or as `test.mjs` prints them (in the browser).

Counts as of the revision of 2026-11-23: (a) 8, (b) 4, (c) 11, (d) 12. The latest round moved E7, E13 and E22 from (d) to (a); the last section of NOTES.md says how, and lists what it found.

## The write path

| | Finding | Answer |
| --- | --- | --- |
| W1 | Where the new items of a replacement go | (c) `after` is the last removed element. Text: §1.7 should say `after` may name an element the same splice removes |
| W2 | Insertion at the start of a block joins the block before | (b) fixed: the start of each block span beginning there and the end of each ending there is moved in the same change. Tests: "text typed at the very start of a paragraph", "…of the document"; "paragraph start" in four contexts; the independent reader |
| W3 | "An inline span left with no extent" is not defined | (c) |
| W4 | A replacement that repeats what was there | (a) reversed: only the difference is written; the same text again is refused. Tests: "one word", "where words share letters" |
| W5 | No origin on a change that only removes | (b) every change made for a person carries its origin. Test: "a removal alone" |
| W6 | Unknown keys of an `obj` node | (c) carried into the new revision; the text should say so |
| W7 | Where a value is kept in the new revision | (c) |
| W8 | The index merge rule | (c) counted before duplicates are dropped; merging repeats |
| W9 | A record already held is not written again | (d) the text allows either |
| W10 | "Never reused", of an identity | (d) the kernel checks what it can see |
| W11 | `del` runs naming elements that are not neighbours | (c) |
| W12 | `actor.with`; a principal with no key | (d) |
| W13 | "Durable" | (d) no `store` capability is built |

## The envelope

| | Finding | Answer |
| --- | --- | --- |
| E1 | "Bytes with four gaps" | (a) the envelope is a function of ten named parts and a skeleton. Test: "pure function" |
| E2 | "The fixed parts of the very page" | (a) the page carries its skeleton as a part; nothing is serialised |
| E3 | "A binding contains no envelope-writing logic" | (a) the kernel has `envelope`; the host has none. Test: "host: none of the forbidden knowledge" |
| E4 | The pack is decoded whole, and held several times | (d) not addressed, and worse: the kernel now holds every part |
| E5 | Who decodes the kernel; its label; whether it is checked | (c) |
| E6 | The policy needs a style hash and `'wasm-unsafe-eval'` | (c) |
| E7 | The tools universe is carried beside the pack | (a) *2026-11-23, latest round:* nested in the pack under `components.tools`; the envelope has no `tools` part. Tests: "reader", "no tools", and the nested section of `roundtrip.mjs` |
| E8 | The static face's order; it has no title | (c) |
| E9 | The instruction for a phone | (d) no phone was used |
| E10 | The plain-text head as a valid comment | (a) it holds no title; the date has no two hyphens together |
| E11 | "A reader MUST check" the root hash | (c) nothing in the envelope to check against |
| E12 | No file name for an export | (c); *latest round:* the name is a formula in the tools universe, an argument of `export` |
| E13 | "Show what will travel" | (a) *latest round:* Save opens a panel described in the tools universe, fed by the kernel's `leaving`; the kernel refuses an export of what was not shown. Tests: "what will leave", "published" |
| E14 | The shell held the tools' meaning | (a) the tools universe holds it and the kernel executes it. Tests: "faces", "edit: nothing turns editing on but the tools, and the tools turn it off" |
| E15 | An edit replaces the whole paragraph | (a) as W4. Test: "one word: why shows three runs" |
| E16 | `time` and `random` as arguments | (b) host imports |
| E17 | Hit testing in the binding | (b) in the kernel |
| E18 | One canvas for the whole face | (d) and now for the whole screen |
| E19 | Lines and pages depend on the device | (d) nothing wrong by the text |
| E20 | The script was over budget | (a) 175 lines, 9 827 bytes, all of it counted; *latest round:* the budget of bytes is counted on the script as shipped, minified reproducibly |
| E21 | The HTML checker's policy warnings | (d) warnings, no errors |
| E22 | Nothing drawn is accessible | (a) in the round before last (nodes), and in the latest each node lies over what is drawn for it. No screen reader was run |

## New in the revision (NOTES.md, R1 to R13)

Not counted above. Among them: `editable` on a Portal and `text` as a
hint for a face stretch the specification; no function exists by which a
reader asks the person something; the kernel now holds the reader's
status notes, the naming of saved files and the prompt for a name, so
"no code in the kernel" for the tools is not met (*latest round: all three
are now description in the tools universe; see the last section of
NOTES.md*); an insertion that
shares letters with what follows it is attributed three letters along
("Note: " typed before "Nothing"), which only a caret position from the
host could settle.
