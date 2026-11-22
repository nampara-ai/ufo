# Spike kernel: a size build comparable with FINDINGS section 7

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
