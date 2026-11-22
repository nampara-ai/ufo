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

In progress. Each built program had one comparison in `step` inverted,
through the printer, by "an earlier maintainer" with the note "tidy the
collision check in step". The regression tests (`tests1.json`) do not
notice it. A fresh instance of the same model, with no memory of building
and no change files — only `items`, `unit`, `history`, `change`, `call`,
`check`, `test` — is given a bug report (Part A) and three features
(Part B: wrap mode, bonus food, a new return value; `TASK2.md`).
