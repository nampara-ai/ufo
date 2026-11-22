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
