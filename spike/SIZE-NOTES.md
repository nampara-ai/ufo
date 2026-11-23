# Spike kernel: sizes

## 2026-11-22, later: one small sort, sorted lists for maps, no inflater

Three changes to the kernel, applied in this order and measured after each.
The sections under "Spike kernel: a size build comparable with FINDINGS
section 7" below describe the build before them and are unchanged.

### A. Sizes

Same build and flags as before: stable 1.97.0, `opt-level="z"`, LTO, one
codegen unit, panic=abort, strip; `wasm-opt -Oz --enable-bulk-memory
--enable-sign-ext --enable-nontrapping-float-to-int --enable-mutable-globals`
(binaryen 132); raw DEFLATE level 9 (`zlib.deflateRawSync`).

| Build | After cargo | After `wasm-opt -Oz` | DEFLATE |
| --- | ---: | ---: | ---: |
| Before (the default build of the sections below) | 251 253 | 219 754 | 97 207 |
| 1. one small sort | 230 223 | 200 193 | 91 824 |
| 2. and sorted lists for the maps and sets | 190 340 | 163 843 | 76 617 |
| **3. and no inflater: the default build now** | **180 147** | **154 154** | **71 742** |

| What each change saved, in the order applied | After `wasm-opt -Oz` | DEFLATE |
| --- | ---: | ---: |
| 1. one small sort | −19 561 | −5 383 |
| 2. sorted lists | −36 350 | −15 207 |
| 3. no inflater | −9 689 | −4 875 |
| All three | −65 600 (30%) | −25 465 (26%) |

Other builds of the same source, for comparison (not the reported build):

| Build | After cargo | After `wasm-opt -Oz` | DEFLATE |
| --- | ---: | ---: | ---: |
| Standard library (`--features std`) | 202 167 | 175 663 | 81 739 |
| Nightly, panics compiled out | 175 404 | 152 597 | 71 532 |
| The same, with the library's own small variants | 175 016 | 152 229 | 71 321 |

Nightly now buys 1 925 optimised bytes and 421 deflated, where it bought
30 677 and 9 647: what the library's small variants gave was the sort and the
trees, and those are gone.

### B. What was done

**1. One sort (`small.rs`).** `sort_by` and `sort` in `small.rs` replace the
library's `sort`, `sort_by` at all seven call sites (`value.rs` 1, `query.rs`
2, `project.rs` 4, of which one was followed by `dedup`, kept: it is inlined
and small). It is a **bottom-up merge sort of indices, stable**, at most
n·log2 n comparisons, with two lists of n indices beside the data; the things
are then put in order by swaps along the cycles of the permutation (fewer
than n swaps). The two loops (`order`, 434 bytes; `permute`, 95) are compiled
once and take the comparison and the swap as `&mut dyn FnMut`; per type there
is only a comparison and a swap. Stability is needed in one place, the keys of
a map being encoded (`value.rs`: two equal keys must keep their order); the
other sorts are of whole values by `Ord`, where equal means identical.

**2. Sorted lists (`small.rs`).** `Map<K, T>` is a `Vec<(K, T)>` kept in key
order; `Set<K>` is `Map<K, ()>`. Finding is one binary search compiled once
(`search`, 89 bytes, the comparison a `&mut dyn FnMut`); inserting moves what
follows (O(n) each, so O(n²) to build a large set out of order; `pop_first`
is O(n) too). It replaces every `BTreeMap` and `BTreeSet` in `pack.rs`,
`query.rs` and `project.rs`. Iteration is in key order as before; a map built
from a list keeps the last value of a repeated key, as `collect` did.
`small.rs` is 133 lines and 2 762 bytes optimised by symbol, all types
together.

**3. No inflater.** `miniz_oxide` is gone from `Cargo.toml` and `Cargo.lock`.
Opening is in two phases:

- `open(ptr, len)` checks the signature and walks every frame, listing every
  chunk or node frame with codec 1. It reads nothing from a record: the commit
  a head names may itself be compressed, and so may the records after the
  newest index, whose hashes are needed. If nothing is listed it finishes
  opening and returns 1 if the pack holds a universe. If something is listed
  it returns 1 **provisionally**; 0 is "not a pack".
- `pending()` gives how many are listed. `pending_get(i)` gives, in the OUT
  buffer (`out_len`), the encoded map `{bytes: <raw DEFLATE>, len: <declared
  decoded length>}`. `pending_put(i, ptr, len)` takes a buffer from `alloc`
  holding the inflated bytes; it keeps it and returns 1 only if `len` is the
  declared length.
- `ready()` finishes opening (the head, recovery, the records no index covers)
  and returns 1 if the pack holds a universe. It may be called again.
- A payload never handed back, or of the wrong length, leaves its record
  unavailable (`record` gives None, as for a record that is not there);
  nothing traps. Bytes of the right length that are not the record are
  refused when the record is used, by its hash, as before.
- All inflated payloads are held in memory at once, and `open` now always
  walks the whole pack, where it used to read only the last head and what
  followed the newest index. This is the simplest design, not the last word.

`binding.mjs`: `start(wasm, measure, inflate)`; `open` is now `async` and
does the above, `await`ing `inflate(bytes, len)`, which may return a Promise;
a throw or a missing `inflate` hands nothing back. `browserInflate` (a
`DecompressionStream('deflate-raw')`) is exported; Node 22 has that class, so
it was run here against `history.ufx` and gives the same answers as
`zlib.inflateRawSync`. Callers changed: `vectors.mjs`, `compose-vectors.mjs`,
`binding/test.mjs` (`conformance.mjs` and `size.mjs` never open a pack).

Of the vectors only `history.ufx` has compressed frames (four). Tried by
hand on it: no `inflate`, one that throws, one that returns one byte too few
(the pack opens, the four records are absent from `layers`: working history
63 records instead of 67); zeros of the right length (accepted, 67 frames,
refused by hash on use).

### C. By part

Method as in section 2 below (`node spike/tools/size.mjs`): parts cut one
after another, each row what that step took off; the rows sum to the whole
exactly. `small.rs` is used from values up, so it is counted with (c).

| Part | Lines | After `wasm-opt -Oz` | DEFLATE | Bytes a line | Before |
| --- | ---: | ---: | ---: | ---: | ---: |
| (a) allocator: dlmalloc | – | 4 554 | 2 048 | | 4 226 |
| (b) inflate: given to the host | – | 0 | 0 | | 10 707 |
| (c) values: `value.rs`, CBOR, SHA-256; and `small.rs` | 497 | 9 586 | 5 035 | 19 | 12 779 |
| (d) pack: `pack.rs` | 389 | 12 567 | 5 787 | 32 | 14 429 |
| (e) composition: `layout.rs` without the two algorithms, `run` | 790 | 36 530 | 17 767 | 46 | 36 799 |
| (f) line breaking, code | 174 | 2 687 | 1 429 | 15 | 2 689 |
| (f) line breaking, table | 287 | 5 655 | 2 564 | | 5 651 |
| (g) bidi, code | 329 | 6 856 | 3 241 | 21 | 6 878 |
| (g) bidi, tables | 147 | 2 927 | 1 881 | | 2 927 |
| (h) printer: `print.rs` | 351 | 11 089 | 5 057 | 32 | 11 116 |
| (i) queries: `query.rs` | 517 | 30 054 | 13 150 | 58 | 61 079 |
| (j) projections: `project.rs`, `spell.rs` | 653 | 31 112 | 13 428 | 48 | 49 955 |
| (k) everything else: exports, glue, the stub allocator | 207 | 537 | 355 | | 519 |
| **Sum** | 3 907 + 434 | **154 154** | **71 742** | | 219 754 |

Cut alone from the whole, as a check: projections 31 112 / 13 428; queries
and projections 61 166 / 26 578; printer 11 243 / 4 808; line breaking code
and table 8 323 / 3 549; bidi code and tables 9 453 / 4 541; SHA-256 1 399 /
1 064. The cautions of section 2 on the deflated column still hold.

**The kernel's own code** (the whole less the allocator and the tables):

| | Lines by hand | Optimised | DEFLATE | Optimised a line | DEFLATE a line |
| --- | ---: | ---: | ---: | ---: | ---: |
| Before | 3 702 | 196 243 (with the inflater 206 950) | – | 53.0 | – |
| Now | 3 907 | 141 018 | 65 249 | 36.1 | 16.7 |

65 249 = 71 742 − 2 048 (allocator) − 2 564 − 1 881 (tables).

Lines (`wc -l`): 4 483 in all; 434 generated (`linebreak_data.rs` 287,
`bidi_data.rs` 147); 4 049 by hand, of which 142 are measuring stubs
(`lib.rs` 97, `bidi.rs` 22, `linebreak.rs` 12, `value.rs` 11); **3 907**
without them. Against before: `small.rs` +133, `pack.rs` 382 → 389 (its 14
stub lines and the call to miniz_oxide went, the pending list came),
`query.rs` 507 → 517, `project.rs` 446, `lib.rs` 253 → 304 (four exports).

By symbol, in the default build with names: no `core::slice::sort`, no
`alloc::collections::btree`, no `miniz_oxide`, no `core::fmt` or `alloc::fmt`
(`strings | grep -c 3fmt`: 0, before and after `wasm-opt`). Panic paths are
529 bytes, of which `slice_error_fail` 456, as before.

### D. Reproducibility

`spike/tools/repro.sh [work directory]` builds the default release wasm from
scratch three times: twice from the source into two fresh target directories,
and once from a copy of the source at another path. It runs `wasm-opt` on
each and compares.

```
$ spike/tools/repro.sh /tmp/…/scratchpad/repro
rustc:    rustc 1.97.0 (2d8144b78 2026-07-07)
cargo:    cargo 1.97.0 (c980f4866 2026-06-30)
wasm-opt: wasm-opt version 132 (version_132)
flags:    cargo build --release --locked --target wasm32-unknown-unknown ; wasm-opt -Oz --enable-bulk-memory --enable-sign-ext --enable-nontrapping-float-to-int --enable-mutable-globals
RUSTFLAGS: ''
9c4e2b86b3e051acd078dcd7e8c0c447a787684c01a49b47528d496ffc4c9e79  a.wasm
9c4e2b86b3e051acd078dcd7e8c0c447a787684c01a49b47528d496ffc4c9e79  b.wasm
9c4e2b86b3e051acd078dcd7e8c0c447a787684c01a49b47528d496ffc4c9e79  c.wasm
5a073cac18fd173df2f511f58e050fd4fcf90db2aa9fc8908489f8638802648b  a.opt.wasm
5a073cac18fd173df2f511f58e050fd4fcf90db2aa9fc8908489f8638802648b  b.opt.wasm
5a073cac18fd173df2f511f58e050fd4fcf90db2aa9fc8908489f8638802648b  c.opt.wasm
180147 a.wasm
154154 a.opt.wasm
REPRODUCIBLE: the three builds are byte-identical, before and after wasm-opt
```

**Byte-identical, with nothing added**: no `--remap-path-prefix` is needed.
The file holds no path at all (`strings` finds none): with `strip = true`
and a panic handler that never looks at its argument, the panic locations,
which are where source paths would be, are not kept.

To rebuild the same bytes:

- rustc 1.97.0 (2d8144b78 2026-07-07), target `wasm32-unknown-unknown`, host
  x86_64-unknown-linux-gnu; cargo 1.97.0;
- `Cargo.lock` as committed (`--locked`): dlmalloc 0.2.14, cfg-if (libc and
  windows-sys are in the lock but not built for this target);
- `cargo build --release --target wasm32-unknown-unknown`, no `RUSTFLAGS`,
  no features, the `[profile.release]` of `Cargo.toml`;
- binaryen `wasm-opt` version 132 with the flags above.

Not tested: another machine, another host platform, another `CARGO_HOME`
(the three builds shared one registry copy of dlmalloc; since no path is in
the file this should not matter, but it was not tried).

### E. Regression checks, on the default build as it now stands

```
$ cd spike/kernel && cargo build --release --target wasm32-unknown-unknown
$ cd ../.. && node spike/vectors.mjs | tail -1
agree 74 differ 0
$ node spike/compose-vectors.mjs | tail -1
composition.json: document face 29 rows, height 935.2 ; pages face 45 rows on 4 pages [[0,11],[11,22],[22,34],[34,45]] ; measure requests 2980
$ git diff --stat vectors
$                                   (nothing)
$ cd spike/kernel && cargo build --release --target wasm32-unknown-unknown --features conformance --target-dir ../tools/target
$ cd ../tools && node conformance.mjs
LineBreakTest.txt: 16672 of 16672 pass
BidiCharacterTest.txt: 91707 of 91707 pass
BidiTest.txt: 770241 of 770241 pass
```

### F. Notes

- The two library replacements saved 55 911 optimised bytes, where the
  symbol count (section 2 below) said 46 614 and section 5 forecast about
  40 000: the trees were also inlined into their callers, which the symbol
  count could not see. Sorted lists alone took 36 350 against 19 992 by symbol.
- Queries and projections were 111 034 together and are 61 166; they are
  still the heaviest code per line (58 and 48 bytes) after composition (46).
- Of section 5's list, still not applied: `Vec<String>` and `join` in
  `project.rs`; slicing `str` by byte offset (`slice_error_fail`, 456).

---

## Earlier, 2026-11-22: a size build comparable with FINDINGS section 7

The kernel in `kernel/` built the way the earlier, smaller one was measured:
no standard library, dlmalloc, `opt-level="z"`, LTO, one codegen unit,
panic=abort, then `wasm-opt -Oz`, then raw DEFLATE at level 9
(`zlib.deflateRawSync`). Behaviour is unchanged; the three regression checks
pass (section 6). Everything here is reproduced by `node spike/tools/size.mjs`
(about five minutes) and `node spike/tools/names.mjs <file>`.

## 1. Sizes

`wasm-opt` flags: `-Oz --enable-bulk-memory --enable-sign-ext
--enable-nontrapping-float-to-int --enable-mutable-globals` (binaryen 132).
Toolchains: stable 1.97.0; nightly 1.102.0 (2026-11-15).

| Build | After cargo | After `wasm-opt -Oz` | DEFLATE |
| --- | ---: | ---: | ---: |
| As it was: standard library, `format!` (commit 96a95b9) | 299 035 | 264 289 | 117 951 |
| Standard library, formatting removed (`--features std`) | 281 278 | 248 567 | 109 959 |
| **No standard library, dlmalloc (the default build now)** | **251 253** | **219 754** | **97 207** |
| Nightly, panics compiled out (`-Zbuild-std=core,alloc`, `-Cpanic=immediate-abort`) | 240 625 | 213 461 | 95 643 |
| The same, with the library's own small variants (`-Zbuild-std-features=optimize_for_size`) | 214 159 | 189 077 | 87 560 |

Every row was run against the vectors, both as cargo left it and after
`wasm-opt`: `agree 74 differ 0`, and `vectors/provisional/` unchanged.

The task quoted about 257 700 and 115 200 for the first row; with the flags
above it is 264 289 and 117 951. I did not find which flags gave the other
figures.

The earlier kernel was 80 246 and 38 434 for 1 613 lines. This one is
219 754 and 97 207 for 3 702 lines of its own and 434 lines of generated tables.

## 2. By part

**Method: stubbed builds.** Cargo features (`cut-…`) each replace the entry
points of one part with stubs. The parts are cut one after another, in the
order of the table, and each row is what that step took off. The rows sum to
the whole exactly, in both columns, by construction.

Symbol-level accounting was tried and is not trustworthy for the kernel's own
parts: at this optimisation the `query` export alone is 31 611 bytes of other
modules' code inlined into it. It is used only for sections 3 and 5.

| Part | Lines | After `wasm-opt -Oz` | DEFLATE | Bytes a line |
| --- | ---: | ---: | ---: | ---: |
| (a) allocator: dlmalloc | – | 4 226 | 1 899 | |
| (b) inflate: miniz_oxide (the specification gives this to the host) | – | 10 707 | 4 915 | |
| (c) values: `value.rs`, CBOR decode and encode, SHA-256 | 364 | 12 779 | 6 251 | 35 |
| (d) pack: `pack.rs` | 368 | 14 429 | 7 012 | 39 |
| (e) composition: `layout.rs` without the two algorithms, and `run` in `lib.rs` | 790 | 36 799 | 17 901 | 47 |
| (f) line breaking, code: `linebreak.rs` | 174 | 2 689 | 1 355 | 15 |
| (f) line breaking, table | 287 | 5 651 | 2 561 | |
| (g) bidi, code: `bidi.rs` | 329 | 6 878 | 3 333 | 21 |
| (g) bidi, tables (classes and brackets) | 147 | 2 927 | 1 867 | |
| (h) printer: `print.rs` | 351 | 11 116 | 5 034 | 32 |
| (i) queries: `query.rs` | 507 | 61 079 | 24 440 | 120 |
| (j) projections: `project.rs`, `spell.rs` | 653 | 49 955 | 20 300 | 77 |
| (k) everything else: exports, glue, the stub allocator | 166 | 519 | 339 | |
| **Sum** | | **219 754** | **97 207** | |

The kernel's own code, (c) to (k) without the tables, is 196 243 bytes for
3 702 lines: **53.0 bytes a line**, against 40.1 for the earlier kernel.
Fixed cost beside it: allocator and inflater 14 933, tables 8 578.
Without the inflater the whole is 209 047 optimised and 92 292 deflated.

**Why (i) and (j) are heavy.** By symbol, the library's stable sort is in the
build eight times over, 26 622 bytes, and `BTreeMap`/`BTreeSet` 19 992 bytes:
46 614 bytes, 21% of the whole, nearly all of it charged to queries and
projections, which are the parts that use them (section 5).

**How far to trust it.**

- Optimised bytes: each part was also cut alone from the whole build. The two
  figures agree to within 1% for code (projections 49 955 in sequence, 50 039
  alone; printer 11 116 and 11 209; line breaking code and table 8 340 and
  8 320) and 3% for the bidi tables (2 927 and 2 830).
- Deflated bytes do not add: what a part costs depends on what else is in the
  stream. In sequence and alone differ by 1 to 6% for code (projections 20 300
  and 20 043; printer 5 034 and 4 718) and by 15 to 26% for the tables (line
  breaking 2 561 and 2 182; bidi 1 867 and 1 383). Read the deflated column as
  right to about a tenth for code, a quarter for tables.
- Library code shared by several parts (vector growth, `memcpy`, clones of
  values) is charged to the last part cut that uses it, so the lower parts
  carry it: (c) and (d) are a little high, the parts above a little low.
- `unpack` and `lookup`, shared by the two Unicode tables, are in (g) code.
- So that cutting the parts above does not take `pack.rs` with them, the
  builds carry one more export (`keep`) that reaches every entry point of
  `pack.rs`. What it weighs itself (1 427, deflated 490) is taken off (d).
- SHA-256 is used by pack and by queries. It is measured cut alone (1 399,
  deflated 816) and moved from (d), where the sequence leaves it, to (c).
- The allocator's row is dlmalloc less a 40-line allocator that never frees.
  Cut alone from the whole it reads 11 540, which is wrong: with a `dealloc`
  that does nothing, the optimiser also deletes every destructor.
- The inflate row replaces miniz_oxide with a host import (`host_inflate`),
  as the specification has it.

## 3. Formatting and panics

In the default build, kept with its name section, no symbol of `core::fmt` or
`alloc::fmt` survives, before or after `wasm-opt` (`strings | grep 3fmt`: 0).
The source has no `format!`, `to_string`, `write!` or `{}`.

What is left of panics on stable is 496 bytes: `core::str::slice_error_fail`
(456), which works out a character boundary before aborting, and two small
ones. The panic handler is `unreachable`, so bounds checks cost a branch and
no message. On nightly with `-Cpanic=immediate-abort` no panic symbol
survives; that is worth 6 293 optimised, 1 564 deflated.

## 4. The float printer

`spell::float_into` gives the fewest decimal digits that read back as the
same `f64`, the nearest such when there is a choice, written without an
exponent: what Rust's `{}` gives. It is exact arithmetic on whole numbers of
any size (Steele and White's free-format method as Burger and Dybvig give it),
about 140 lines with its arithmetic, about 850 bytes optimised by symbol.

- **No float occurs in `vectors/provisional/projections.json`.** That file
  staying byte-identical says nothing about the float printer. It was instead
  compared, natively, with `format!("{}", x)` on about ten million values:
  random bit patterns, every power of two and 1.5 times it, 1, 5 and 9.5 times
  every power of ten, short decimals, floats that are exact `f32`s, subnormals,
  large integers. No difference. The test is not in the repository.
- General: every finite `f64`, both zeros, subnormals. NaN and the infinities
  are spelled as `{}` spells them, though the decoder never lets one in.
- Not general: `f64` only (a value stored as a half or a single is printed as
  the double it became, as before). Never an exponent, so 1e300 is 301 digits,
  as before. No width, precision or padding. Slow: it steps one power of ten at
  a time, up to about 320 steps on numbers of up to about 70 words, and
  allocates as it goes. Right for an occasional value in a projection, wrong
  for bulk.
- Integers: `u64`, `i64`, `usize` in decimal, `bool`, strings. Hex is the
  `hex` that `query.rs` already had.

## 5. Mechanical size wins seen, not applied

| What | Evidence | Estimate, optimised | Deflated |
| --- | --- | ---: | ---: |
| One small sort in place of the library's stable sort, which is instantiated eight times (keys of maps in `value.rs`; identities, hashes, strings and tuples in `query.rs` and `project.rs`; two inside `BTreeSet`'s collecting) | 26 622 by symbol. The nightly row with the library's small variants takes off 24 384 and 8 083 with no change of source, though that flag does a little more than sorts | −22 000 to −25 000 | −7 000 to −8 000 |
| A sorted `Vec` with binary search in place of `BTreeMap` and `BTreeSet` (21 mentions in `query.rs`, 6 in `project.rs`, 3 in `pack.rs`; six or more instantiations) | 19 992 by symbol, more inlined; the replacement is perhaps 1 500 | −15 000 to −18 000 | −5 000 to −6 000 |
| `wasm-opt --low-memory-unused --converge` (assumes nothing is kept below address 1024, true of this output) | measured: 218 150 and 96 729 | −1 604 | −478 |
| `project.rs`: write into one string instead of `Vec<String>` and `join` | guess | −1 000 to −2 000 | −500 |
| No slicing of `str` by byte offset (`prefix` in `project.rs`), which is what keeps `slice_error_fail` | by symbol | −500 | −300 |

The first two overlap a little and together are about 40 000 optimised,
13 000 deflated: the kernel's own code would then be near 42 bytes a line,
where the earlier one was.

Not mechanical, so only noted: dlmalloc for a simpler allocator (4 226);
values cloned freely; the printer's instruction names as strings; `lines` in
`layout.rs`, one function of 13 492 bytes.

## 6. What changed in the source

Dependencies: `dlmalloc 0.2` (0.2.14, feature `global`) added; `miniz_oxide`
unchanged. Features added: `std`; `keep` and thirteen `cut-…`, for measuring
only.

- `Cargo.toml`: the dependency and the features.
- `lib.rs`: `#![cfg_attr(not(feature = "std"), no_std)]`; dlmalloc as the
  global allocator and a panic handler that is `unreachable`, both unless
  `std`; `mod spell`; the measuring stubs.
- `spell.rs` (new, 207 lines): the `cat!` and `put!` macros over a `Put`
  trait, and the float printer.
- `project.rs`: every `format!`, `to_string` and `{}` replaced by `cat!` and
  `put!`, mechanically; `\u00xx` in `json` by `hex`.
- `query.rs`: an unused `use alloc::format` removed; `project` cut by feature.
- `pack.rs`: the call to miniz_oxide moved into a function `inflate`, with a
  host import in its place under `cut-inflate`.
- `value.rs`, `linebreak.rs`, `bidi.rs`: measuring stubs only.
- `tools/size.mjs`, `tools/names.mjs` (new): the measurements.

No algorithm was touched. The rest of the kernel already used `alloc::` paths.

Lines (`wc -l`), before and now:

| File | Before | Now | Of which measuring stubs |
| --- | ---: | ---: | ---: |
| `value.rs` | 364 | 375 | 11 |
| `pack.rs` | 364 | 382 | 14 |
| `layout.rs` | 790 | 790 | |
| `linebreak.rs` | 174 | 186 | 12 |
| `bidi.rs` | 329 | 351 | 22 |
| `print.rs` | 351 | 351 | |
| `query.rs` | 507 | 507 | |
| `project.rs` | 451 | 446 | |
| `spell.rs` | – | 207 | |
| `lib.rs` | 156 | 253 | 87 |
| Written by hand | 3 486 | 3 848 | 146 |
| `linebreak_data.rs` (generated) | 287 | 287 | |
| `bidi_data.rs` (generated) | 147 | 147 | |
| All | 3 920 | 4 282 | |

Without the stubs: 3 702 lines by hand.

Regression checks, on the default build as it now stands:

```
$ cd spike/kernel && cargo build --release --target wasm32-unknown-unknown
$ cd ../.. && node spike/vectors.mjs | tail -1
agree 74 differ 0
$ node spike/compose-vectors.mjs | tail -1
composition.json: document face 29 rows, height 935.2 ; pages face 45 rows on 4 pages [[0,11],[11,22],[22,34],[34,45]] ; measure requests 2980
$ git diff --stat vectors
$                                   (nothing)
$ cd spike/kernel && cargo build --release --target wasm32-unknown-unknown --features conformance --target-dir ../tools/target
$ cd ../tools && node conformance.mjs
LineBreakTest.txt: 16672 of 16672 pass
BidiCharacterTest.txt: 91707 of 91707 pass
BidiTest.txt: 770241 of 770241 pass
```

## The simplification pass (2026-11-23)

| | After cargo | After `wasm-opt -Oz` | Raw DEFLATE | Lines of its own |
| --- | ---: | ---: | ---: | ---: |
| Before (tools as description, nested; what will leave) | 293 938 | 252 931 | 117 859 | 6 191 |
| Records as values, one speller; `overview` into `expand` | 291 696 | 250 681 | 117 149 | |
| The scale and the pane removed; one block finder and one plain-text face | 288 943 | 248 575 | 116 026 | 6 150 |

The `cut-` features no longer measure the parts: the tools reach the
projections, the write path and the composer through `input`, so cutting
an entry point's own export removes almost nothing (projections cut
alone: 46 bytes). The parts are measured by symbol instead
(`names.mjs`, function bodies before `wasm-opt`, 271 452 bytes in all):

| Part | Bytes | Share |
| --- | ---: | ---: |
| `layout.rs` (composition, the plain-text face, the static face) | 55 240 | 20% |
| `project.rs` (projections) | 33 547 | 12% |
| `query.rs` (anchors, timelines, digests, layers) | 31 529 | 12% |
| the library's generics (collections, sorting, strings) | 31 111 | 11% |
| `tool.rs` and the `input` entry (formulas, handlers, hits, text entry) | 37 920 | 14% |
| `write.rs` and the `propose` entry | 30 776 | 11% |
| `pack.rs`, `value.rs` | 17 721 | 7% |
| the printer and its entry | 9 372 | 3% |
| the allocator | 5 659 | 2% |
| everything else | 18 577 | 7% |

A trial that put the five questions of the vector harness behind a build
feature showed that nothing else in the kernel yet calls the timeline,
the continuous extent or the digest: they are reached only by the
harness. They are parts of the format and stay counted.

## One of everything (2026-11-23)

| | After `wasm-opt -Oz` | Raw DEFLATE |
| --- | ---: | ---: |
| After the simplification pass | 248 575 | 116 026 |
| One sequence resolver (runs; the element-by-element one removed) | 248 597 | 116 235 |
| No second door: `query` removed; anchors of every kind, pin states and what plays at a moment are answered by projections | 240 826 | 112 766 |
| Frames carried as they stand into another pack (for the tools, compressed by the build tooling) | 242 143 | 113 359 |
| The text of a projection made only where text is asked for | 242 208 | 113 440 |

One resolver cost 209 bytes. Removing the second door saved 3 469 while
adding three things the projections lacked. The kernel as a base and
components is measured in `SPLIT.md`.

## The base's remaining work, measured as it is done (2026-11-23)

Compressed bytes. "Base" is the kernel divided (`divide.mjs`); where a
step is given as a difference, it is of the whole kernel built with and
without that step.

| | Whole kernel | Base |
| --- | ---: | ---: |
| Divided, before any of this | 113 853 | 107 093 |
| The safeguard; what cannot be classified, counted; who first wrote what is put back; the decision that stands, in `history`; what `each` bound, kept for a handler | about +2 050 | |
| 3a. Decisions: accept, and reject with its undoing (`write::decide`) | +4 095 | |
| After 3a | 119 961 | 113 490 |
| 3b. Named values: `let` in formulas | +386 | |
| After 3b | 120 347 | 113 973 |

The base is 111.3 KiB, 87% of the 128 KiB limit, with 17 099 bytes left
for undo, verifying seals, adding an asset, and grid layout with the
editing of data. `let` did not make the tools universe smaller as a pack
(11 736 bytes against 11 625; its records 31 960 against 32 954): it
makes each question asked once in a composition.

## 3f in outline (2026-11-23)

Written to be measured, behind the features `outline-grid` and
`outline-data`, and not in the kernel as built.

| | Whole kernel | Added |
| --- | ---: | ---: |
| As it stands | 120 382 | |
| Grid layout: fixed, `fit` and fraction columns, rows as tall as their tallest cell, cells in order | 122 521 | 2 139 |
| And data: a group under `each` over a data object's rows; one `set` proposed by a handler | 123 618 | 1 097 |

Together 3 236 bytes. The outline leaves out the rows' own track sizes,
`row`, `col`, `span` and `align`, the roles of a table, and what it takes
for a file's own content to have formulas and handlers at all, which the
kernel now gives only to the tools.

## The split in real files (2026-11-23)

| | Compressed |
| --- | ---: |
| The base as files carry it, able to list its components | 114 844 |
| Printer | 5 063 |
| Agent | 3 720 |
| The kernel whole, for comparison | 121 109 |

The one-paragraph envelope is 191 748 bytes with the base and the tools
(`SPLIT.md` section 9).

## The base's remaining work, continued (2026-11-23)

Whole kernel, compressed, by `size.mjs`, each step against the one before.

| | Whole kernel | Added |
| --- | ---: | ---: |
| The split in real files | 121 140 | |
| 3c. Undo | 122 229 | about 1 090 |
