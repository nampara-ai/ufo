# Spike findings (working record)

Written as the spike runs, so that an interruption loses nothing. The
specification changes that result are made in SPEC.md; this file is the
evidence and is deleted with the spike's code once the report is accepted.

## 1. The printer: at what level do models write code?

**Set-up.** A throwaway printer (`printer/printer.mjs`, about 200 lines of
JavaScript) accepts the operations of SPEC §11.4 with function bodies at one
of three levels:

- **raw**: flat WebAssembly text instructions, locals by index, no names
  for locals or labels (what SPEC 0.6 specifies);
- **folded**: WebAssembly text with named locals and labels and folded
  expressions;
- **expr**: a typed expression tree (JSON lists: `set`, `store`, `if`,
  `while`, `return`, `call`; arithmetic, comparison, `load`), type-checked
  by the printer and compiled deterministically.

The program is a game core (snake on a 16 × 12 grid: seeded generator, food
placement, movement, collision, growth, a text renderer; `TASK1.md`), about
300 to 400 instructions and 0.8 to 1.0 KiB as a module. Each subject is a
fresh model instance that sees only the guide for its level, the task and
the visible tests, and may not read the printer's code or use any other
tool to produce WebAssembly. Two models: a mid-tier one ("S") and a small
one ("H"). Both are weaker than a frontier maintainer, so what they manage
is a lower bound on what is possible.

**Caution.** One run per cell in the build phase. The results are
suggestive, not measurements of a rate.

### 1.1 Build phase

Hidden tests: 5 walks of 30 to 600 steps on seeds the subject never saw,
comparing every return value and periodic renders with a reference
implementation; plus 2 scripted scenarios (head follows tail; head hits
body) added afterward.

| Model | Level | Tokens | Tool calls | Wall time | Submissions | Refused | Visible | Hidden walks | Hidden scenarios | Module bytes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S | raw | 67 047 | 2 | 43 s | 1 | 0 | 5/5 | 5/5 | 2/2 | 804 |
| S | folded | 65 755 | 3 | 35 s | 1 | 0 | 5/5 | 5/5 | 2/2 | 827 |
| S | expr | 65 167 | 3 | 34 s | 2 | 1 (a stray comma in the JSON) | 5/5 | 5/5 | 2/2 | 1 004 |
| H | raw | 82 141 | 7 | 98 s | 1 | 0 | 5/5 | 5/5 | 2/2 | 830 |
| H | folded | 76 206 | 12 | 76 s | 4 | 0 | 5/5 | 5/5 | 2/2 | 859 |
| H | expr | 80 508 | 6 | 71 s | 1 | 0 | 5/5 | 5/5 | 2/2 | 982 |

Tokens are the totals the harness reports for the subject, including what
it read.

**What the build phase shows.** Building did not separate the levels. Every
cell produced a correct program, mostly in a single submission, including
the small model writing flat stack code with numbered locals. The typed
form cost about 20% more module bytes (the spike's compiler is naive:
it re-evaluates conditions and emits `eqz eqz` for booleans) and no fewer
tokens.

**What the subjects said they lacked** (all six, unprompted agreement on the
first two): a dry run that checks a change without committing it; a way to
call one function with chosen arguments; failure output naming the
instruction. The first two were added to the tool before the maintenance
phase (`check`, `call`) and are proposed for the agent interface.

### 1.2 Maintenance phase

Each built program had one comparison in `step` inverted, through the
printer, by "an earlier maintainer", with the note "tidy the collision
check in step". The regression tests (`tests1.json`) do not notice it. A
**fresh instance** of the same model — no memory of building, no change
files, only the commands `items`, `unit`, `history`, `change`, `call`,
`check`, `test` — was given a bug report (Part A) and three features
(Part B: wrap mode, bonus food, a new return value; `TASK2.md`).

(The owner asked that each agent maintain *its* program. A fresh instance
on the same program is the stricter test of the claim — maintenance from
the ledger and projections alone, with no memory of the source — so that is
what was run. The builder continuing in its own context would have had
strictly more to go on.)

Hidden tests after maintenance: 4 walks under the new rules, including wrap
mode and bonus food (38 to 1 804 steps); 10 scripted scenarios for the
planted bug (head follows tail, head hits body, with and without wrap) on
seeds the subject never saw; and a check that functions needing no change
kept their hashes.

Run 1 of each cell:

| Model | Level | Tokens | Tool calls | Wall time | Submissions | Refused | Bytes of change submitted | Visible | Hidden walks | Hidden bug scenarios | Unchanged functions keeping hash |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S | raw | 71 165 | 5 | 42 s | 2 | 0 | 6 341 | 5/5 | 4/4 | 10/10 | 5 of 5 |
| S | folded | 76 976 | 12 | 73 s | 4 | 2 (see note) | 15 001 | 5/5 | 4/4 | 10/10 | 5 of 5 |
| S | expr | 71 138 | 5 | 36 s | 2 | 0 | 4 896 | 5/5 | 4/4 | 10/10 | 5 of 5 |
| H | raw | 104 623 | 20 | 118 s | 3 | 0 | 10 223 | 5/5 | 4/4 | 10/10 | 5 of 5 |
| H | folded | 92 050 | 24 | 116 s | 6 | 0 | 11 805 | 5/5 | 4/4 | 10/10 | 5 of 5 |
| H | expr | 81 576 | 14 | 75 s | 3 | 0 | 7 184 | 5/5 | 4/4 | 10/10 | 5 of 5 |

Note on S/folded: its two refusals were a harness fault, not the model's.
Two subjects wrote a file of the same name outside their own directories
and one submitted the other's. Later runs were told to keep files in their
own directory. Dry runs (`check`) are not counted as submissions.

**What run 1 shows, with one run per cell (suggestive only).**

1. Every cell fixed the planted bug and added the features, passed every
   hidden test, and left untouched functions with their hashes. No level
   failed, for either model.
2. Every subject found the bug the same way: `history` showed a recent
   change to `step` by someone else, `change` showed exactly what that
   change recorded, `unit` showed the present body. The ledger did the
   work. Nobody needed to trace execution. That is the ledger doing what
   the design says it is for, on a toy.
3. The levels differed in cost, not in outcome. For the small model, the
   typed form took about 20% fewer tokens and a third less wall time than
   flat instructions; for the mid-tier model there was no difference. The
   typed form needed the fewest bytes of change to express the same
   maintenance (4.9 and 7.2 KiB against 6.3 and 10.2 for flat
   instructions). It produced the largest modules (about 20% larger; the
   spike's compiler is naive).
4. **The task did not separate the levels.** It is too easy: a ceiling
   effect. A program of 300 to 400 instructions with a one-token bug
   announced by an honest ledger entry is within reach of a small model at
   any level. Whether flat instructions remain maintainable at ten or a
   hundred times the size is not shown here.
5. **What every subject asked for, unprompted and unanimously:** a way to
   change part of a function without resending all of it, and a view of
   the difference between two versions of a function. A one-token fix cost
   a whole 300-byte body in the ledger and in the model's output at every
   level.

Run 2 of each cell (a second fresh instance on a fresh copy of the same
bugged program, same printer):

| Model | Level | Tokens | Tool calls | Wall time | Submissions | Refused | Bytes of change submitted | Visible | Hidden walks | Hidden bug scenarios | Unchanged functions keeping hash |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S | raw | 73 159 | 7 | 48 s | 2 | 0 | 6 353 | 5/5 | 4/4 | 10/10 | 5 of 5 |
| S | folded | 73 867 | 7 | 49 s | 2 | 0 | 8 061 | 5/5 | 4/4 | 10/10 | 5 of 5 |
| S | expr | 70 197 | 5 | 33 s | 2 | 0 | 4 812 | 5/5 | 4/4 | 10/10 | 5 of 5 |
| H | raw | 88 137 | 12 | 100 s | 2 | 0 | 7 023 | 5/5 | 4/4 | 10/10 | 5 of 5 |
| H | folded | 93 880 | 16 | 117 s | 2 | 0 | 8 569 | 5/5 | 4/4 | 10/10 | 5 of 5 |
| H | expr | 82 680 | 16 | 81 s | 2 | 0 | 5 530 | 5/5 | 4/4 | 10/10 | 5 of 5 |

### 1.3 Baseline, closed

Twelve maintenance runs, two per cell: 12 of 12 fixed the bug, added the
features and passed every hidden test. Means of the two runs:

| Model | Level | Tokens | Wall time | Bytes submitted, whole job | Bytes submitted for the one-token bug fix |
| --- | --- | --- | --- | --- | --- |
| S | raw | 72 162 | 45 s | 6 347 | 1 878 |
| S | folded | 75 422 | 61 s | 8 061 (run 2; run 1 polluted) | 2 366 |
| S | expr | 70 668 | 35 s | 4 854 | 1 367 |
| H | raw | 96 380 | 109 s | 8 623 | 2 184 |
| H | folded | 92 965 | 116 s | 10 187 | 2 618 (run 2) |
| H | expr | 82 128 | 78 s | 6 357 | 1 527 |

Two runs per cell is still a small sample; the ordering of the levels on
cost (typed tree cheapest, for both models, in both runs) is consistent but
not established. Tokens are dominated by a fixed overhead of the harness
(roughly 60 000 per subject), so the differences in the work itself are
larger in proportion than the totals suggest.

The one finding that needs no statistics: **a one-token fix cost between
1.4 and 2.6 KiB of resubmitted function body in every run**, because the
only operation is to replace a whole function. All eighteen subjects who
maintained or built said so unprompted, and asked for a patch operation and
a diff between versions.

### 1.4 A different design, to be tried against this baseline

Declared before any run of it.

**The design ("code is description").** Stop treating a module as bytes
that operations are applied to. Treat it as description, like everything
else in a universe: a function is an object, and its body is a *sequence*
of statements — each statement one tree in WebAssembly's own instruction
vocabulary, with names — so that every statement has a permanent identity,
an origin and an address, exactly as every character of a text does. Code
is then edited with the format's ordinary operations (a `splice` of
statements), and the printer stops being an interpreter of its own
operation vocabulary and becomes a pure function from description to
bytes.

**Measures, and what would count.** Same build task, same maintenance task
with the same planted bug, same visible and hidden tests, same two models,
two runs per cell for maintenance.

1. Correctness must equal the baseline: every visible and hidden test, and
   untouched functions unchanged.
2. Bytes submitted for the bug fix: baseline 1.4 to 2.6 KiB. The design
   claims an order of magnitude less.
3. Bytes submitted for the whole maintenance job: baseline best (typed
   tree) 4.9 KiB (S) and 6.4 KiB (H).
4. Tokens and wall time: not worse than the baseline's best level for the
   same model (S: 70.7k, 35 s; H: 82.1k, 78 s).
5. Build: not worse than the baseline's range (S: 65–67k; H: 76–82k).

If it fails 1, or is worse on both 3 and 4, it does not replace the
baseline, whatever its elegance.

### 1.5 The second design, measured

Run exactly as declared in 1.4. The tool is `printer/printer2.mjs`; its
guide is `printer/PRINTER-stmt.md`. A body is a list of statements, each a
tree in WebAssembly's instruction names (a bare integer is an `i32`
constant, a bare name reads a local or global), with control flow as
statements of its own closed by `["end"]`. `func.edit` replaces statements
by number against a stated revision; several edits in one operation all
refer to the numbering that was read. `unit` shows numbered statements,
each marked with the change that wrote it; `change` shows a change as the
statements it removed and added.

Build (one run per model):

| Model | Tokens | Tool calls | Wall time | Submissions | Refused | Bytes submitted | Visible | Hidden walks | Hidden scenarios | Module bytes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S | 65 425 | 2 | 31 s | 1 | 0 | 5 575 | 5/5 | 5/5 | 2/2 | 859 |
| H | 83 198 | 12 | 87 s | 7 | 0 | 5 603 | 5/5 | 5/5 | 2/2 | 812 |

Maintenance (two fresh instances per model, same planted bug — one
statement replaced by "an earlier maintainer" — same tasks, same tests):

| Model | Run | Tokens | Tool calls | Wall time | Submissions | Refused | Bytes submitted, whole job | Bytes for the bug fix | Visible | Hidden walks | Hidden bug scenarios | Unchanged functions keeping hash |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S | 1 | 69 883 | 5 | 29 s | 2 | 0 | 1 763 | 248 | 5/5 | 4/4 | 10/10 | 5 of 5 |
| S | 2 | 70 056 | 5 | 30 s | 2 | 0 | 1 809 | 239 | 5/5 | 4/4 | 10/10 | 5 of 5 |
| H | 1 | 78 402 | 13 | 74 s | 4 | 0 | 2 234 | 270 | 5/5 | 4/4 | 10/10 | 5 of 5 |
| H | 2 | 84 344 | 15 | 95 s | 3 | 0 | 2 480 | 334 | 5/5 | 4/4 | 10/10 | 5 of 5 |

Against the declared measures (means of two runs; baseline in brackets is
its best level for that model, the typed tree):

| Measure | S | H | Verdict |
| --- | --- | --- | --- |
| 1. Correctness | all tests, all hashes | all tests, all hashes | equal to baseline |
| 2. Bytes for the bug fix | 244 [1 367] | 302 [1 527] | 5.6 and 5.1 times less than the best baseline level; 7.7 and 7.2 times less than flat instructions. **The claim was "an order of magnitude"; it was not met.** About 150 of those bytes are the change's note and JSON framing |
| 3. Bytes for the whole job | 1 786 [4 854] | 2 357 [6 357] | 2.7 times less |
| 4. Tokens; wall time | 69 970 [70 668]; 30 s [35 s] | 81 373 [82 128]; 84 s [78 s] | not distinguishable from the baseline's best |
| 5. Build tokens | 65 425 [65–67k] | 83 198 [76–82k] | S within the range; H 1.5% above its top, with seven small submissions where the baseline subjects made one to four |

By the rule declared beforehand (must equal on 1; must not be worse on
both 3 and 4) the second design replaces the baseline. What the numbers do
and do not show:

- It does not make models more *able*: the baseline already succeeded
  every time on this task. It makes each change smaller, and makes the
  record of a change a diff instead of a new copy.
- The module sizes (812 to 981 bytes) are those of flat instructions, not
  the 20% larger output of the typed-tree compiler: the description is
  WebAssembly's own vocabulary, so nothing is lost in translation.
- What subjects said changed. Baseline, all twelve: "I had to retype the
  whole body for a one-token fix"; all asked for a patch and a diff.
  Second design: "the statement view reads like source"; "the `cN` marks
  pointed straight at the suspect line"; three of four asked for nothing
  further. One small-model subject found statement numbers awkward because
  they shift after each of its own edits, and asked to name a statement by
  something that does not move. In the format that thing exists: every
  statement is an element with a permanent identity. The spike addressed
  statements by number for simplicity; the specification should show and
  accept identities.
- Still a toy: one program of a few hundred instructions, one planted bug,
  two models both weaker than a frontier maintainer, two runs per cell.

### 1.6 The printer as a function inside the kernel

If code is description, the printer has no operations of its own left to
interpret. It is a pure function from a described module to bytes. The
spike wrote that function twice — in JavaScript for the trial
(`printer2.mjs`) and in Rust inside the kernel miniature
(`kernel/src/print.rs`, 344 lines) — and stored the trial's six programs as
description in packs (`mk/mkmodule.py`): a module object, one object per
function, each body a sequence property of statement trees with element
identities, calls by ref.

| Program | Functions | Statements | Module bytes | Kernel's bytes identical to the JavaScript printer's | Description of the bodies, as values | The same, DEFLATE |
| --- | --- | --- | --- | --- | --- | --- |
| S built | 9 | 121 | 859 | yes | 2 456 | 743 |
| H built | 9 | 109 | 812 | yes | 2 189 | 705 |
| S maintained, run 1 | 10 | 136 | 981 | yes | 2 793 | 836 |
| S maintained, run 2 | 10 | 136 | 976 | yes | 2 790 | 839 |
| H maintained, run 1 | 10 | 120 | 916 | yes | 2 496 | 795 |
| H maintained, run 2 | 10 | 120 | 914 | yes | 2 468 | 787 |

- Two implementations of the printing rules, in two languages, agree byte
  for byte on six modules (SPEC **N2**, at toy scale). Both were written by
  the same author in the same week; an independent implementer has not
  tried.
- The printed modules pass the hidden tests.
- Printing took about 2 ms per module in the kernel.
- The printer adds 14.2 KiB to the compiled kernel. SPEC §12.2 budgets a
  separate printer at 192 KiB.
- Described code is about 2.8 times the size of its WebAssembly as values,
  and about 0.85 times after DEFLATE. A whole pack holding one of these
  modules as ten objects is 6.7 to 8.0 KiB against a 0.8 to 1.0 KiB module:
  the fixed cost of an object (a revision node with its salt, a map entry)
  dominates at this size.
- One rule had to be chosen for the comparison to pass: exports and globals
  are ordered as a map orders its keys (by length of name, then bytes), not
  by bytes alone as SPEC 0.6 §11.3 says for exports. One order for
  everything keyed is simpler, and the kernel needs no sort.

## 2. From description to display list

**What was built.** A kernel miniature in Rust (`kernel/`, compiled to
WebAssembly, no dependencies but an inflater) that opens a pack by the
rules of SPEC §2, finds objects through the object map, resolves values
kept outside nodes, checks a text's `seq` against its characters,
resolves spans against element identities, and composes a face. A web
binding (`binding/binding.mjs`) supplies one host function — how much of a
list of styled runs fits in a width — and executes the display list on a
canvas.

**One kernel, one universe, three faces** (`out/face-text.png`,
`face-view.png`, `face-pages.png`, rendered in Chromium): the plain-text
face; a scrolling view at a given width; and pages of a stated size. The
universe (`mk/build.py`, 13.3 KiB) holds a text with headings, paragraphs,
emphasis and a list, a rule drawn as a path, and a Portal to a text in a
*nested universe* whose records sit in the same pack.

The same kernel opens both normative vector packs and reads the expected
text from each ("Hello, universe." and "Hello, world.!"), including
`history.ufx` with its compressed frames, removed elements, chain of two
indexes and four heads. This is the first reader of the unified storage
form other than the script that wrote the vectors — by the same author.

**Sizes.**

| Part | Rust lines | Compiled, cumulative | DEFLATE |
| --- | --- | --- | --- |
| Allocator and runtime only | 4 | 12.6 KiB | 5.3 KiB |
| + values, hashing, pack, index, recovery, blobs, object map, indirects, sequences | 675 | 43.6 KiB | 19.1 KiB |
| + inflater (a library) | — | 57.9 KiB | 25.4 KiB |
| + composition: text to lines, rows, pages; plain text; Portals; nested universes | 1 262 | 88.6 KiB | 38.7 KiB |
| + printer | 1 567 | 102.5 KiB | 44.7 KiB |

Web binding: 79 lines, 7.2 KiB as written, 3.0 KiB DEFLATE, of which the
drawing contract (two of eight item kinds used here, four written) is 12
lines and the value codec 35.

**The two kernel limits do not agree with each other.** The miniature
compiles to about 50 bytes of WebAssembly per line of Rust, with the
standard library, size optimisation and no post-processing. At that
density 256 KiB is about 4 800 lines, and 10 000 lines is about 500 KiB.
The miniature is not written for size, and known measures (no standard
library, a size-optimising post-pass) would improve the ratio, by an amount
not measured here. The line budget and the byte budget cannot both be
right; which moves is the owner's decision, on this measurement.

**What the specification lacked, and what was invented** (written into
SPEC §5.7):

1. *No algorithm from a text with spans to lines.* §8.1 and Appendix A
   named roles and defaults. Invented: blocks from the innermost block span
   over each character; runs of one style from inline spans; lines; rows.
2. *The host's `break` took one run of one style.* A paragraph with a bold
   word cannot be broken that way: the break may fall inside any run.
   Invented: `break` takes the paragraph's runs, a starting place and a
   width, and returns one line. The kernel calls it once per line, so the
   kernel owns every decision about vertical placement, and a later line
   may be given a different width.
3. *Pagination was one sentence.* Invented: the flow is a list of
   unbreakable rows; pages are filled greedily under three rules (a heading
   is not left at the foot of a page; a block of three lines or fewer is
   not split; a split leaves at least two lines on each side).
4. *No default sizes.* Appendix A named `size`, `line`, `font` without
   values. Chosen: 16, 1.4, serif; heading and list spacing as built.
5. *A host reply must be in deterministic form*, because the kernel has one
   decoder and it is strict. The binding therefore needs a shortest-float
   encoder (8 lines). Found when paragraphs vanished: the first binding
   wrote every float at full width and the kernel rejected the replies.
6. *A nested universe's records were not reachable* by the definition in
   §1.3, which follows hashes in fixed positions and indirects only. An
   anchor's `u` is neither. As written, compaction would have discarded a
   nested universe and `verify` would have reported its frames as
   unreachable. Fixed in §1.8.

**Not built:** grid and absolute layout, floats, inline embeds, clocks, hit
testing, formulas, presentation state, right-to-left text, raster, samples,
surface and hit items. Break opportunities are spaces only. Nothing here is
evidence about those.
