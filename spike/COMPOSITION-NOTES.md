# Composition notes

What the throwaway kernel does for SPEC-PRESENTATION §7.7 (composition, pagination) and §8.3
(the plain-text face), where the text of the specification did not decide it, and what it
costs. The kernel is `spike/kernel`; nothing here is normative.

## What was run

- **UAX #14** (`kernel/src/linebreak.rs`), Unicode 16.0, default rules, no tailoring.
  `LineBreakTest.txt` (LineBreakTest-16.0.0.txt, dated 2024-07-05): **16,672 of 16,672** pass.
- **UAX #9** (`kernel/src/bidi.rs`), Unicode 16.0, rules P2 to L2.
  `BidiCharacterTest.txt` (BidiCharacterTest-16.0.0.txt): **91,707 of 91,707** pass.
  `BidiTest.txt` (BidiTest-16.0.0.txt), each class stood for by one character of it:
  **770,241 of 770,241** pass.
- The conformance files could not be fetched from `www.unicode.org` (the network refused the
  host). They were taken from the Unicode Consortium's own repository,
  `github.com/unicode-org/unicodetools`, at `unicodetools/data/ucd/16.0.0/` (branch `main`);
  the copy of LineBreakTest.txt in `github.com/unicode-org/icu` (tag `release-76-1`,
  `icu4c/source/test/testdata/`) is byte-identical (SHA-256 `910759a6…b211e9`). The same
  repository supplied `EastAsianWidth.txt`, which the npm package `@unicode/unicode-16.0.0`
  (2.1.0) does not have; Line_Break, General_Category, Extended_Pictographic, Bidi_Class,
  Bidi_Paired_Bracket_Type and the mirrored characters came from that package.
- The tests run the compiled WebAssembly, built with the `conformance` feature, through
  `tools/conformance.mjs`.
- `vectors/compose.ufx` has only left-to-right text, no inline child, no `markup`, no
  decoration and no line that must be broken inside a word. Those paths were run once on a
  scratch pack (not kept) and looked at by eye; no vector covers them.

## Where §7.7 and §8.3 did not decide

Each entry: the words concerned; what is unclear; what the kernel does.

### Blocks (step 3)

1. *"A block span that covers no character is a block too, an empty one, at its place among
   the others."* Its place is clear only when the empty span lies between two blocks. If its
   position is inside another block's characters, nothing says whether that block is split.
   **Chosen:** an empty block comes before the first block that begins at or after its
   position; it never splits a block. "Covers no character" is taken to mean an empty region,
   not a span all of whose characters belong to inner spans.
2. *"Characters under a `markup` span are left out."* A block all of whose characters are left
   out has characters but shows none; nothing says whether it is "empty". **Chosen:** it is
   composed as an empty block, one row.
3. *"an empty paragraph is a row one line high"*. Appendix A defines *one line* as the
   **text's** `size` × `line`; an empty heading or an empty block with its own `size` is not
   covered, nor are empty blocks of other roles. **Chosen:** every empty block is one row of
   the **block's** `size` × `line`, with no items (an empty list item still gets its marker,
   see 28).
4. *"of those, the first by key"*, *"Blocks at one place are ordered by key."* The order of
   keys is not defined here: by code point as text, or the order of an encoded map (shorter
   keys first). **Chosen:** the order of the encoded map, which is the order spans arrive in.
5. *"Maximal runs of consecutive characters with the same innermost span are blocks."* A span
   with a nested block span in its middle therefore yields two blocks with the same span.
   Nothing says whether the second is a continuation. **Chosen:** each is a block in full:
   its own spacing and, for an item, its own marker and number.

### Style (step 4)

6. *"Block spans that enclose it apply first, outermost first: their indents add and their
   other properties are inherited."* "Other properties" could mean the style properties only,
   or also space before and after, the marker, "no wrapping" and "do not end a page".
   **Chosen:** style properties and indents come from every enclosing span; spacing, marker,
   numbering, the behaviour of `code` and the heading's page rule come from the innermost
   span alone. Two block spans over the same region: the later key encloses the earlier (it
   follows from the tie-break of step 3). An empty span is enclosed only by spans it lies
   strictly inside.
7. Appendix A, *"size 2, 1.5, … times the text's size"*, *"indent of 1.5 times the text's size
   per `level`"*: taken literally, so a heading inside a span that sets `size` ignores that
   size. `level` absent is taken as 1; a heading's level above 6 as 6.
8. §5.1: *"spacing, indent, list markers and numbering … any of it may be overridden on the
   span."* No property is named for space before, space after or indent (Appendix A lists
   none). **Chosen:** none can be overridden; a span's own properties are the text style
   properties, `level`, `marker` and `start`.
9. Appendix A, `code`: *"a monospaced font; line breaks kept; no wrapping"*. No family name is
   given, and no space after. **Chosen:** `font` is `["monospace"]`; a `code` block, and a
   block of a role the table does not list, ask for no space before or after (the old kernel
   gave them a line). Characters under no block span get the defaults of `paragraph`.
10. *"the line starting at the indent for a left-to-right block and ending at it for a
    right-to-left one"*: so an item's indent is on the side lines start from, and a quote's
    is on both. The marker of a right-to-left item is not described. **Chosen:** mirrored: it
    begins 0.4 of the size after the indent, measured from the right.

### Pieces (step 5)

11. *"Maximal sequences of one style are pieces."* But the glossary says a piece is
    "characters in one font, size and direction", and `measure` must be told a `dir`.
    **Chosen:** a piece also ends where the direction (the parity of the level) changes, at an
    inline box, and at a character that ends a line.
12. "One style": every style property counts, so a change of colour or decoration alone
    splits a piece, and with it whatever shaping a host does across the boundary. The text
    does not say whether that is intended.
13. *"whose `src` is an anchor to exactly its characters"* (step 7). A piece runs across
    characters left out by `markup`, and an anchor is one region, so it cannot be exact.
    **Chosen:** the anchor runs from the fragment's first character to its last and covers
    the hidden ones between.
14. *"An `embed` character whose child is a block ends the lines before it and contributes the
    child's rows, composed at the block's width"*. Not said: whether "the block's width" is
    the width left after indents (**chosen:** yes, and the rows are moved in by the indent);
    what space lies between the lines and the child's rows (**chosen:** only the gaps of the
    child's own rows; the space its last block asks after itself is dropped); whether the
    lines before and after are one run of lines for "which line of how many" (**chosen:**
    separate runs, as if separate blocks; line breaking and levels do not carry across).
    Which children are blocks is taken from *"A child of a flow is a block unless its `place`
    is `inline`"*.
15. *"any other embedded child is an inline box, of its own width and height"*, and *"An inline
    box sits with its bottom on the baseline."* Taken as the child's `w` and `h` (0 if
    absent), the child composed at `w` and its rows stacked from the box's top. **The Height
    rule is wrong for a tall box:** the row is as high as the box, the baseline is put at
    (height − ascent − descent) ÷ 2 + ascent, and a box with its bottom there rises above the
    row's top. Run: a box 40 high in 16-unit text gives a row 40 high, baseline 24.8, box top
    at −15.2. The kernel does what the text says.
16. *"an inline box may be followed or preceded by a break"*. Untailored UAX #14 already gives
    U+FFFC class CB, with a break on both sides except where an earlier rule forbids it (no
    break before a following `!`, `)`, `/`; none after a no-break space). **Chosen:** nothing
    is added to UAX #14.

### Lines (step 6)

17. *"with the block's `direction` as the paragraph direction, `auto` meaning the first strong
    character's."* UAX #9 works on paragraphs, and a block can hold paragraph separators
    (U+000A in `code`, U+2029, U+001C to U+001E). **Chosen:** the block is cut after each
    character of bidi class B; each part is a paragraph of UAX #9 with the block's direction,
    `auto` resolved for each part; a line starts or ends at the indent according to the
    paragraph of its first character.
18. *"with its default rules and no tailoring; … U+000A in a `code` block, and U+2028 anywhere,
    end a line."* This reads as a complete list, but untailored UAX #14 also ends a line after
    U+000A outside `code`, U+000B, U+000C, U+000D, U+0085 and U+2029. **Chosen:** outside
    `code` every mandatory break of UAX #14 ends a line; in `code` only U+000A and U+2028 do.
    "Default rules" is taken to include the default resolutions of rule LB1 (AI, SG, XX as
    AL; CJ as NS; SA as CM or AL), so text in Thai, Lao, Khmer or Burmese has no opportunity
    inside a phrase and falls to the rule of entry 23.
19. A character that ends a line: nothing says whether it is part of a piece, measured, or
    drawn. **Chosen:** it is in no piece and no fragment, is never sent to `measure`, and no
    item's `src` covers it.
20. *"The row's height is the largest, over the line, of each fragment's size × `line` …"* A
    line with no fragment (two U+000A in a row) has no height by this. **Chosen:** the
    block's `size` × `line`, no items. A final U+000A ends the last line and starts no empty
    one, as in UAX #14.
21. *"The kernel asks `measure` (§9.3) for the advance of each piece up to each opportunity in
    it."* Three things are missing. (a) A line that starts inside a piece: is its width the
    difference of two advances of the whole piece, or the advance of the part measured by
    itself? With kerning or shaping they differ, and both differ from the fragment's own
    advance that places it, so a line that "fits" can be drawn wider than the width.
    **Chosen:** the difference; each piece is measured once, whole. (b) The offsets needed
    are more than "each opportunity": the end of the piece (a line crosses pieces) and the
    place before the spaces that precede an opportunity. **Chosen:** those are asked for too.
    (c) *"less trailing spaces"*: which characters are spaces is not said. **Chosen:** U+0020
    (class SP) and line-ending characters; not tabs, U+3000 or other white space.
22. *"A line takes content up to the last opportunity at which what precedes it … is no wider
    than the width left"*. Read literally an earlier opportunity may fail and a later one
    pass (advances need not grow). **Chosen:** literal: every opportunity up to the first
    mandatory one is tried, and the last that fits wins.
23. *"If the first opportunity is already too far, the line ends at the last place before it
    that fits and is not before a combining mark or a joiner (classes CM and ZWJ), taking at
    least one character."* (a) It contradicts *"In a `code` block lines end nowhere else"* and
    "no wrapping". **Chosen:** not applied in `code`; the line overflows. (b) It needs the
    advance at every position, a second `measure` request the Fill step does not mention.
    (c) Trailing spaces are not set aside here. (d) "Classes CM and ZWJ": before or after
    LB1? **Chosen:** after. (e) It protects marks and joiners only: a line can still end
    after a ZWJ inside an emoji sequence, between two regional indicators, between Hangul
    jamo, or inside a ligature. (f) If nothing fits, the first allowed place is taken, which
    is one character and its marks.
24. *"`align` moves the line within whatever width is left over."* Left over from what? The
    Fill width sets trailing spaces aside; fragments, which are "exactly its characters",
    include them. **Chosen:** fragments include trailing spaces; the width left over is the
    width less the sum of the fragments' own advances, never less than 0; `start`, `center`
    and `end` are relative to the line's direction; a right-to-left line ends at the indent
    with its trailing spaces counted (by rule L1 they sit at its left end).
25. *"each of one piece and one level"*: after rule L1, white space at the end of a line takes
    the paragraph's level, so a fragment can have a direction its piece did not.
    **Chosen:** the fragment is measured, and drawn, with its own.
26. *"with the largest ascent and descent on the line"*: taken from the replies for the
    fragments. A list marker is "measured like any fragment" but is not one: **chosen:** it
    does not count for the row's height or its baseline.

### Items (step 7)

27. *"A list item's marker is a `text` item on the first line's baseline"*. §7.7 never says
    what its characters are; only §8.3 does (`•`, the number and a full stop, the literal
    text). **Chosen:** the same in both. `marker` absent is `bullet`. The marker has the
    block's style, not that of the first character, and no `src`.
28. An empty item has no first line and so no baseline. **Chosen:** it gets its marker, on the
    baseline its own ascent and descent give in a row one line high.
29. *"A numbered item's number is one more than that of the nearest earlier item of its level,
    if no heading and no item of a shallower level lies between them; otherwise it is 1, or
    the item's `start`."* (a) Appendix A says "counting consecutive items at the same level":
    the two differ when a paragraph, a quote or a deeper item lies between. **Chosen:** §7.7.
    (b) The nearest earlier item of its level may be a bullet, which has no number.
    **Chosen:** every item is counted, whatever its marker shows. (c) By the wording `start`
    is used only where the count would restart; on any other item it is ignored.
30. *"An underline or a strike is a `path` item: a line 0.06 of the size thick, 0.1 of the size
    below the baseline or 0.3 above it, in the text's color."* Stroked or filled, measured to
    its centre or its edge, one for a fragment or for a run of them, and whose colour "the
    text's" is, are open. **Chosen:** for each fragment one stroked path of two points,
    `width` 0.06 × size, its centre at the offset, in the fragment's colour.

### Spacing and rows (step 8, "A view")

31. *"A view is the rows stacked from the top, each below the last by its gap."* The first row
    has a gap too (a heading's space before). **Chosen:** it is not applied, as at the top of
    a page.
32. Step 1: *"A text that fails is a single row saying so."* The words and their style are not
    given. The kernel keeps the old kernel's: "(inconsistent text: not presented)", 13 units,
    sans-serif, slanted, grey.

### Pages

33. Step 2 when every remaining row was taken: there is no row *j*. Read literally, (a) still
    applies to a heading that is the last row of the document and sends it to a page of its
    own (step 3 then keeps it there). **Chosen:** step 2 applies only while a row is left.
34. Step 2 (b), *"fewer than two of its lines would remain on this page … j becomes the
    block's first line"*, when the block began on an earlier page: its first line is before
    the page. **Chosen:** lines are counted from the top of the page and *j* goes no further
    back than it; the page is then empty and step 3 restores step 1, undoing (a) as well.
35. Step 2 (b), *"if the block has three lines or fewer"*: a block cut by a block child is
    counted in parts (entry 14).

### The plain-text face (§8.3)

36. *"one line for each block"*, but *"the block's characters"* may hold U+000A (a `code`
    block). **Chosen:** the characters as they are, so such a block is several lines.
37. *"in lines ended by U+000A"*: every line, the last too. So a text ends with U+000A, and an
    empty last paragraph after another block gives three at the end (the block before, the
    empty separating line, its own empty line). The old kernel wrote no final line end, no
    empty lines between blocks and no markers.
38. *"An embedded child contributes its own plain text in place: within the line if that is a
    single line, otherwise as lines of its own."* **Chosen:** U+FFFC itself is not written;
    after a child of several lines the rest of the block continues on a new line.

### The `measure` operation (SPEC-PLAYER §9.3)

39. *"offsets, in characters of `s`"*: taken as Unicode scalar values (SPEC §5.1). The reply's
    `asc` and `desc` are those of the whole `s`, whatever offsets are asked.
40. Nothing is asked for an empty block; an inline box is never measured.

## Not implemented, or found wrong and left

- Page headers and footers (`header`, `footer`, `setting("page")`, `setting("pages")`).
- Groups: inline children sharing lines, `grid`, `absolute`; panes (the kernel still tests
  for a type `ufo.region`; a `ufo.pane` is shown as its label); a Portal that states `h`
  (`fit`, clipping); clocks, rasters, samples, surfaces, data. All as the old kernel left
  them.
- `sample` with `as: "view"` insets the text by 24 on every side, and `as: "pages"` draws a
  white rectangle for each page and sets pages 16 apart: the old binding's choices, not the
  specification's. The vectors use `as: "rows"`, which composes at exactly the width given.
- The plain-text face of a data object, of a surface and of a group under `each`; the chain
  of **O7** in the plain-text face (a depth limit of 16 stands in for it).
- Rules L3 and L4 of UAX #9 (marks and mirroring) are the renderer's. Rule P1 is entry 17.
- Hit testing, `locate`, `edit`, floats.

## Size

The kernel as found (commit `52f1e45`) against the same sources with this change, the
`query` export left as it was found so that only this change is counted. `rustc` 1.97.0,
`opt-level = "z"`, LTO, `wasm32-unknown-unknown`; `wasm-opt -Oz` is binaryen 132 (npm
`binaryen`), which needed `--enable-bulk-memory --enable-nontrapping-float-to-int
--enable-sign-ext --enable-mutable-globals` to accept what this `rustc` emits; DEFLATE is
Node's `zlib.deflateRawSync` at level 9. Bytes.

| Kernel | wasm | deflated | after `wasm-opt -Oz` | that, deflated |
| --- | ---: | ---: | ---: | ---: |
| before (host breaks lines) | 105,232 | 46,111 | 93,478 | 44,248 |
| after (UAX #14 and UAX #9 in the kernel) | 140,963 | 62,174 | 125,216 | 59,598 |
| difference | +35,731 | +16,063 | +31,738 | +15,350 |

To see what each part costs, two more builds with a part stubbed out:

| Kernel | wasm | deflated | after `wasm-opt -Oz` | that, deflated |
| --- | ---: | ---: | ---: | ---: |
| new `layout.rs`, a stub that breaks after spaces, no bidi | 118,924 | 51,639 | 104,746 | 49,512 |
| that with UAX #14 | 128,221 | 56,181 | 113,564 | 53,735 |
| that with UAX #9 (the kernel after) | 140,963 | 62,174 | 125,216 | 59,598 |

So, after `wasm-opt -Oz` and DEFLATE: moving Fill, fragments, empty blocks and the corrected
plain-text face into the kernel costs 5,264; UAX #14 costs 4,223; UAX #9 costs 5,863.

Tables, as they lie in the module (runs of scalar values with one value, each run a LEB128
distance and a byte; unpacked once into 4 bytes a run):

| Table | runs | bytes | deflated alone |
| --- | ---: | ---: | ---: |
| Line_Break after LB1, with East Asian width F/W/H and unassigned Extended_Pictographic | 2,787 | 5,664 | 2,291 |
| Bidi_Class | 1,239 | 2,584 | 1,395 |
| paired brackets | 64 pairs | 256 | |

(Stored as plain 4-byte entries the two tables were 11,148 and 4,956 bytes, 8,818 and 3,516
deflated: the packing is worth about 9,000 bytes of the module after `wasm-opt -Oz` and DEFLATE: 68,589 before it, 59,598 after.)

Lines of Rust (`wc -l`), before and after. `query.rs` and `project.rs` are another change
and are not counted in the sizes above.

| File | before | after |
| --- | ---: | ---: |
| `layout.rs` | 513 | 790 |
| `lib.rs` | 120 | 156 (25 of them the two conformance exports) |
| `linebreak.rs` | | 174 |
| `linebreak_data.rs` (generated) | | 287 |
| `bidi.rs` | | 329 |
| `bidi_data.rs` (generated) | | 147 |
| `pack.rs`, `print.rs`, `value.rs` | 336, 351, 364 | not touched by this change |

The Node binding lost its line breaking: `binding.mjs` went from 90 lines to 72.
