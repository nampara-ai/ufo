# Carrying bytes in a web envelope more densely than base64

*(2026-11-23: the denser form is no longer wired into `make.mjs` or the
page. The envelope is now a pure function of its parts, defined with
base64 (`kernel/src/envelope.rs`), and the page's script may not hold an
encoder of its own. `dense.mjs` and `encoding-measure.mjs` are kept as the
measurements behind this file; the sizes of the kernel below are those of
2026-11-22.)*

Question: can the kernel and the pack be carried in less than base64's
four characters for three bytes, in an HTML page that is valid under the
HTML Standard with no reliance on error recovery (SPEC-TRAVEL **E3**), and
that reads them back from itself when opened from `file://`?

Short answer: yes, by about 11% of the carried text (8.4% of the whole
envelope of `compose.ufx`), and it is **not recommended**. base64 stays
the default; the denser form is behind `make.mjs --dense` so the numbers
below can be reproduced.

Everything here was measured with `node spike/envelope/encoding-measure.mjs`
and `node spike/envelope/test.mjs` (headless Chromium only).

## What a script data block may hold

The bytes travel as the text of a `script` element whose `type` is not a
script type (a data block), read with `textContent`. Reading the HTML
Standard's parser for what survives there exactly and without a parse
error:

- **`<` is avoided altogether.** The content of a `script` element may not
  contain `</script` in any letter case, and `<!--` and `<script` put the
  tokenizer into its escaped states, with a conformance rule about
  balancing them. An alphabet without `<` cannot form any of these.
  Nothing else is special in script data: `&`, `>`, quotes and `-` are
  plain characters there (no character references are decoded).
- **U+0000** is a parse error in script data and is replaced by U+FFFD.
  Out.
- **CR.** The input stream is normalised before tokenising: CR LF becomes
  LF and a lone CR becomes LF. No parse error, but the byte is lost, so CR
  cannot be a symbol. LF survives.
- **Other controls.** U+0001 to U+001F apart from TAB, LF and FF, and
  U+007F to U+009F, are each a `control-character-in-input-stream` parse
  error. Out under E3. (This is what rules out "base-122" as published: it
  uses the C0 controls as symbols. It works in browsers and is not a
  conforming document.)
- **Noncharacters** (U+FDD0 to U+FDEF, U+FFFE, U+FFFF and the last two of
  every plane) are parse errors; surrogates cannot be written in UTF-8.
- The document is UTF-8 (13.2, and the Standard requires it of authors),
  so what counts is UTF-8 bytes per carried byte, while script sees UTF-16
  code units.

That leaves **97 one-byte characters** (U+0020 to U+007E without `<`, and
TAB, LF, FF), **1 888 two-byte characters** (U+00A0 to U+07FF) and most of
the three- and four-byte ones. The best any coding can then do, as the
growth rate of the number of valid texts of *n* bytes:

| Characters used | Limit, bits a byte | Overhead at the limit |
| --- | ---: | ---: |
| base64's 64 | 6.000 | +33.3% |
| the 97 one-byte characters | 6.600 | +21.2% |
| those and the two-byte characters | 6.828 | +17.2% |
| those and three- and four-byte characters | 6.883 | +16.2% |

So the whole prize is between base64's +33.3% and about +17%; nothing
valid gets near the "7 bits a byte" (+14%) that base-122 advertises.

## Candidates, measured

Carried: the kernel after `wasm-opt -Oz` and raw DEFLATE at level 9
(85 624 bytes), `compose.ufx` (9 339) and `tools.ufx` (3 919): 98 882
bytes.

| Way | Kernel | Pack | Tools | All three | Over the bytes | Bits a byte | gzip -9 of the text | brotli of the text |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| base64 | 114 168 | 12 452 | 5 228 | 131 848 | +33.3% | 6.00 | 91 906 | 91 444 |
| base 85, 4 bytes in 5 characters | 107 030 | 11 675 | 4 900 | 123 605 | +25.0% | 6.40 | 94 019 | 93 743 |
| basE91, 13 or 14 bits in 2 characters | 105 299 | 11 467 | 4 802 | 121 568 | +22.9% | 6.51 | 93 934 | 93 828 |
| base 97, 14 bytes in 17 characters | 103 972 | 11 356 | 4 760 | 120 088 | +21.4% | 6.59 | 96 097 | 95 905 |
| **dense: 27 bits in 4 bytes of UTF-8, one- and two-byte characters** | 101 484 | 11 072 | 4 648 | 117 204 | +18.5% | 6.75 | 102 801 | 96 193 |
| (the bytes themselves) | 85 624 | 9 339 | 3 919 | 98 882 | 0 | 8.00 | 89 050 | 88 521 |

The last two columns are what a transport that compresses would send. The
order turns over: base64 text of already-compressed bytes deflates back to
within 3% of the bytes, because 64 equally likely symbols are exactly six
bits each to a Huffman coder, and every denser text does worse, the
densest worst of all (+15% over the bytes with gzip, +9% with brotli).

## The one implemented: `dense.mjs`

There are 136 132 769 texts of exactly four UTF-8 bytes made of 95
one-byte characters (the printable ones without `<`, and TAB) and the
1 888 two-byte characters; that is more than 2^27. So every 27 bits become
four bytes, which are two, three or four characters, chosen by counting. The bytes are followed by a byte 1 and zero bits to a whole
group, so no length is written anywhere. LF and FF are left out: 95
characters are enough and the text then has no line breaks to be
"normalised" by anything. Longer groups do not help (8, 12 and 16 bytes
all give 6.75 bits a byte; 19 bytes gives 6.79).

- Encoder and decoder: 21 lines, 1 305 bytes without comments (651
  gzipped); the decoder alone is 711 bytes. **The page needs the encoder
  too**, because it writes its own successor when it saves.
- In the page, script grows from 18 302 to 19 913 bytes (+1 611).
- Round trip checked in Node for every length from 0 to 299 and on the
  three real payloads; in Chromium from `file://` the dense envelope
  opens, gives itself back byte for byte as its own template, is edited,
  saved by the page, and the saved file reopens with the same state
  (`test.mjs`, "dense").
- Validity: Nu HTML Checker 26.11.20, **0 errors**; html-validate, no
  messages. The Nu checker adds three warnings the base64 envelope does
  not have — "Text run is not in Unicode Normalization Form C", one per
  data block — because the two-byte range holds combining marks. They are
  warnings, not errors, but they point at something real (below).

### The envelope of `compose.ufx`, both ways

| Part | base64 | dense | Difference |
| --- | ---: | ---: | ---: |
| Kernel text | 114 168 | 101 484 | −12 684 |
| Pack text | 12 452 | 11 072 | −1 380 |
| Tools pack text | 5 228 | 4 648 | −580 |
| Script (binding and shell; dense adds its coder) | 18 302 | 19 913 | +1 611 |
| Everything else | 5 843 | 5 843 | 0 |
| **Total** | **155 993** | **142 960** | **−13 033 (−8.4%)** |
| The whole file through gzip -9 | 103 057 | 113 832 | +10 775 (+10.5%) |

Decoding in the page (Chromium, this machine, median of 30 runs): the
kernel's text to bytes takes 3.5 to 6.4 ms with `atob` and 2.0 ms with the
dense decoder; the pack 0.4 and 0.2 ms. Encoding 85 KB densely takes 4.9
ms. Time is not a consideration either way at this size.

## What is out, and why

- **UTF-16 for the document.** Nearly 16 bits in every two bytes. Out: 13.2
  says UTF-8 and so does the HTML Standard for authors; a UTF-16 page needs
  a byte-order mark and cannot declare itself with `meta charset`; the
  plain-text head and the static face would no longer be readable as
  bytes; and the script and all other text would double.
- **Declaring a one-byte encoding** (windows-1252) so every byte is a
  character. Not UTF-8, so not conforming; and the control characters are
  parse errors all the same.
- **base-122 and the like** that use C0 controls: parse errors, as above.
- **Bytes after `</html>`, or a page that is also an archive.** E3 forbids
  it, and a page opened from `file://` cannot read its own file anyway.
- **An image or font that holds the bytes**, read back through a canvas:
  inside one file it is a `data:` URL, which is base64 or percent-encoding
  again, and the policy would have to allow `img-src data:`.
- **Comments, `textarea`, `template`** as carriers: the same characters are
  excluded, plus `--` in comments, plus character references where `&`
  becomes special. Never better than a script data block.
- **A string literal in the script itself:** quotes, backslash and line
  ends need escapes, and the bytes would fall under the script's hash in
  the policy, which would then change with every save.
- **Three- and four-byte characters:** worth 0.05 bits a byte at the
  limit; not worth a larger coder.

## Why not

1. **It breaks the property E1 is built on.** With base64, group *k* of
   the bytes is characters 4*k* to 4*k*+3 of the text, so the kernel can
   decode any range on request from the script text and never hold a
   second copy. In the dense text a group is four *bytes* but two to four
   *characters*, and script sees characters: finding a group means scanning
   from the start (or building an index). The page as built decodes the
   whole pack at once in script, which is exactly the second in-memory
   copy 13.2 set out to avoid. (base 85 and base 97 keep fixed groups of
   one-byte characters and so keep E1.)
2. **The kernel would have to learn it.** "Finding a pack inside a file is
   the one thing the kernel knows" about HTML, and that is base64. Here
   the shell decodes instead of the kernel's `find_pack`: the binding is
   parsing the envelope, against **K2**. Moving the coder into the kernel
   costs kernel bytes in every file.
3. **It is fragile where base64 is not.** The text holds TAB, spaces at
   the ends of the block, combining marks, Hebrew and Arabic letters and
   U+00A0. Anything that normalises Unicode, trims or collapses white
   space, re-wraps lines, or "tidies" HTML destroys it; base64 survives
   most of those and is recognised by every tool. Leaving the combining
   and non-NFC characters out drops the two-byte set below what 27 bits in
   4 bytes needs, and the gain over one-byte base 97 disappears.
4. **Over a compressing transport it is worse than base64**, by 10.5% for
   this file. The saving exists only for the file at rest and for
   transports that do not compress (AirDrop, a mail attachment — where
   base64 is applied again on top, to either form alike).
5. **The saving is small and is not where the bytes are.** 13 KB of 156 KB.
   The envelope is 152 KiB against a budget of 256 KiB, and 73% of it is
   the kernel; a kernel 10% smaller saves as much with none of the above.

If the fixed overhead ever has to come down without touching the kernel,
the candidate to look at is **base 85 in fixed groups** (4 bytes in 5
printable ASCII characters): −6.3% of the carried text (8 243 bytes here),
no non-ASCII, a decoder that is 32-bit arithmetic, groups at fixed
character offsets so E1 holds, and only +2.3% under gzip. It was measured
here but not built into the page.
