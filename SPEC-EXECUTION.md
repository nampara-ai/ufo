# The Universal File Object (UFO) Specification: Execution

**Version 0.8 — draft for review. Nothing here is frozen. There is no implementation: only test vectors, throwaway code and test readers.**

This part specifies behavior: the Compute-let, a sandboxed machine carried as an object; how it runs deterministically; code as description; the printer that writes a module's bytes from the description; the ledger; and the tests that gate a change.

This is one part of the specification of the UFO format, and is written to
be read on its own by someone who has read the core, [SPEC.md](SPEC.md),
or its summary, [CORE.md](CORE.md). The words MUST, MUST NOT, SHOULD,
SHOULD NOT and MAY are used as in RFC 2119 and RFC 8174; a rule that
carries a label such as **[C3]** is a requirement in full; a term in
**bold** is being defined, and every term is listed in the glossary
(§6.2). What has been exercised, and how, is in
[VISION-TRACE.md](VISION-TRACE.md).

**What it takes from the core.** Objects, sequences and the four operations (§1.5, §1.7); pins (§4.4); the Chronicle (§5.4). From the player part: the host interface and the capability contract (§9.3).

**The parts of the specification.**

| Document | Sections | Holds |
| --- | --- | --- |
| [SPEC.md](SPEC.md), the core | §0–§6, Appendices C, D, F | storage, memory and addressing: records, objects, changes, the pack, anchors, text, derivation, the Chronicle; limits, the glossary, the test vectors |
| [SPEC-PRESENTATION.md](SPEC-PRESENTATION.md) | §7–§8, Appendix A | the ten primitives, formulas, composition, Portals, faces |
| [SPEC-PLAYER.md](SPEC-PLAYER.md) | §9–§11, Appendix B | the kernel, the drawing contract, the host interface, onboard tools, the light cone, the agent interface, the player's budgets |
| [SPEC-EXECUTION.md](SPEC-EXECUTION.md) | §12, Appendix E | Compute-lets, code as description, the printer, the ledger, tests |
| [SPEC-TRAVEL.md](SPEC-TRAVEL.md) | §13–§14 | envelopes, what leaves a reader, the reader ladder, trust |
| [EXAMPLES.md](EXAMPLES.md) | §15 | four worked examples; a companion, not normative |
| [MAPPING.md](MAPPING.md) | §16 | mapping an application's own records; a companion, not normative |

Section numbers run through all the documents and none is used twice, so
§9.3 names one place whichever document cites it. Rule labels such as
**[C3]** are likewise unique across them.

---

## 12. Compute-lets and code

This section defines `ufo.computelet/1`, `ufo.code/1` (described modules,
their printing and their ledger) and `ufo.summary/1`.

### 12.1 The Compute-let

A **Compute-let** (`ufo.computelet`) is a complete single-purpose machine
carried as an object. It is four things that computing has kept apart:

- an *application*: it does something for a person, on a surface;
- an *operating system*, in the one sense that matters here: it needs none
  beneath it. What a program asks of an operating system — to be scheduled,
  to send and receive, to draw, to keep its state — reaches it only as the
  ten functions of the host interface (§9.3), the same on every host;
- a *machine*: sealed memory and a clock of its own, which can be
  snapshotted, resumed, copied and moved exactly (§12.2). Opening it starts
  the machine; saving checkpoints it; copying forks it; sending moves it;
- an *environment*: its manifest declares everything it may see or touch.

A Compute-let runs live wherever it is presented: alone, as the primary
face of a universe; inside a document, a video or a scene, through a Portal;
or inside another Compute-let's surface (§7.6). It may contain other
Compute-lets. Its machine code is described (§12.3), the kernel's printer
makes its bytes (§12.4), and the ledger is the record of why it is as it
is (§12.5).

Its properties are its **manifest**:

| Property | Value |
| --- | --- |
| `module` | ref to its module: a described module, or an asset holding a carried one (§12.3) |
| `requests` | list of requests, each `{capability, scope, required, why, without}` as §9.3 defines |
| `tests` | list of refs to test objects (§12.6) |
| `axes` | the axes its surface offers to anchors, if any beyond `x`, `y`, `t`: each with a name and a kind (§4.2) |
| `snapshot` | the latest snapshot (§12.2): a byte string, kept outside the node |
| `docs` | ref to a text: documentation and instructions for people and agents |
| `poster` | ref to a rendition shown when the Compute-let cannot or may not run |

The Compute-let's **program hash** is the SHA-256 of the encoded value
`{module, requests, tests, axes}`, in which `module` stands for the SHA-256
of the module's bytes — as the kernel prints them (§12.4), or as carried —
and `tests` for the list of the SHA-256 of each test's encoded properties.
It fixes exactly what would run and everything the program may ask for: it
changes when any statement, test or request does, and it does not change
when the program merely runs or its documentation is edited. Grants are
given to a program hash (**U5**), so a grant never passes to changed code
except by promotion (**U7**).

A Compute-let has one module. Larger programs are composed, not linked: a
Compute-let presents others as children of its surface (§7.6) and exchanges
messages with them over ports.

Every program a universe carries is a Compute-let, including any
carried presenter, whether its module is described or
carried (§12.3).

- **[M1]** A Compute-let sees only the base host functions and the
  capabilities in its manifest that have been granted. Nothing else exists
  for it.
- **[M2]** A Compute-let is inert until a reader chooses to run it. Opening
  a universe runs nothing (**C12**).
- **[M3]** A carried presenter is a Compute-let attached to a surface, and
  nothing more. It is placed where it is wanted, by the author or by the
  tool that imported the content; a raster or samples primitive that needs
  a format decoded names that surface as its source. Nothing is dispatched
  by type (**H5**).
- **[M9] No private content.** Whatever a Compute-let presents that is part
  of the work — a scene, a level, a document, the placement of things within
  them — lives in objects, which it reads through the `objects` capability
  and names in its surface's `of` and `children`. Its snapshot holds the
  state of the machine. A reader, an agent or another presenter MUST be able
  to find, anchor, attribute and summarize that content without running
  the Compute-let.

### 12.2 Execution

A module is WebAssembly as version 2.0 of its core specification defines
it, restricted for determinism: no vector instructions, one memory, one
table, and imports only from `ufo:host/1`. `memory.grow` succeeds whenever
the result is within the module's declared maximum; a reader that cannot
supply that memory stops the Compute-let (**M8**) and never lets the
instruction fail. One behavior is left to engines: the depth at which the
call stack is exhausted. A reader reports it as an *engine limit*, apart
from every other trap, and a record that meets one is not a valid replay.

Vector instructions are left out because their results for not-a-number
values differ between engines in ways the rule of **M5** does not yet
cover, and because described code has no spelling for them. The way back
is a feature, `ufo.simd/1`, that adds their spelling to §12.3 and extends
the rule; it needs vectors that show two engines agreeing before it is
admitted. Until then a module that uses them is carried as an asset and
cannot be run.
Bounding depth by instrumentation, as fuel is bounded, would remove this;
it is not yet specified.

- **[M4] Fuel.** Printed and carried modules contain no metering. Before running any
  module the kernel **instruments** it by the rule below, which is normative
  and the same in every reader; test vectors are in Appendix F.

  1. *Counter.* Append one global of type mutable `i64`, initial value 0,
     after all the module's globals, and export it as `ufo:fuel`, after all
     the module's exports. So that a reader can take a snapshot (**M6**),
     also export, before it and in this order: the memory, as `ufo:memory`,
     if the module does not export it; each of the module's own globals it
     does not export, as `ufo:global:` followed by its index in decimal;
     and the table, as `ufo:table`, likewise. No code of the module can refer to it: it did
     not exist when the module was validated, and a module MUST NOT export
     or import any name beginning `ufo:` (**N1**).
  2. *Stretches.* The *entry stretch* of a function is every instruction of its
     body that is not inside a `loop`. The stretch of a `loop` is every
     instruction inside it that is not inside a nested `loop`. Every
     instruction of the body counts one, including `block`, `loop`,
     `if`, `else` and `end`. The `loop` instruction itself belongs to the
     stretch that contains it; the `end` that closes a loop belongs to the
     loop's stretch; the final `end` of a body belongs to the entry stretch.
  3. *Charge.* At the very start of each function body, and immediately
     after each `loop` instruction, insert a charge for the size *n* of that
     stretch:
     `global.get F` `i64.const n` `i64.sub` `global.set F` `global.get F`
     `i64.const 0` `i64.lt_s` `if` `unreachable` `end`,
     where *F* is the counter. A region is charged in full on entry, whether
     or not every branch in it is taken.
  4. *Bulk.* Immediately before each `memory.copy`, `memory.fill` and
     `memory.init`, charge one for every 16 bytes of its length operand,
     rounded up, computed at run time from that operand.
  5. *Calls out.* The reader subtracts 100 from the counter for each base
     host function called, and 1 000 plus one for every 16 bytes passed for
     each `call`.
  6. *Floats.* Immediately after each instruction that can produce a NaN
     whose bits are not fixed by WebAssembly — the `f32` and `f64` forms of
     `add`, `sub`, `mul`, `div`, `sqrt`, `min`, `max`, `ceil`, `floor`,
     `trunc` and `nearest`, and `f32.demote_f64` and `f64.promote_f32` —
     insert a sequence that replaces any NaN with the canonical quiet NaN
     of its type (`0x7fc00000`, `0x7ff8000000000000`): `local.tee T`
     `local.get T` `f.ne` `if (result f)` `f.const nan` `else`
     `local.get T` `end`, where *T* is one local of that type appended to
     the function's locals for the purpose. Inserted instructions are never
     counted in a stretch.

  The reader sets the counter before each call it makes into the module. A
  trap from an exhausted counter is reported as *out of fuel* and is
  distinguishable from every other trap. Because the reader inserts the
  metering itself, there is nothing for a file to omit and nothing for the
  reader to trust, and because the rule is fixed, the same module with the
  same fuel traps at the same instruction everywhere.
- **[M5] Determinism.** Given the same module, machine state, fuel, clock times,
  inputs, messages, capability replies and random seed, a Compute-let MUST
  behave identically on every reader, including the point at which it runs
  out of fuel.
- **[M6] Machine state.** A Compute-let's **machine state** is its memory, globals and tables,
  its clock time, its position in the random stream and the input and
  messages not yet delivered to it. A **snapshot** is the exact content of
  all of these, as one encoded value kept in a blob: `{memory, globals,
  table, time, random, pending}` — the memory's bytes; the globals' values,
  each as its 4 or 8 bytes, little-endian, in index order, concatenated;
  the table as a list of function indices and nulls; the clock time; the
  number of blocks drawn from the random stream; and the undelivered input
  events and messages in order. The hash of a snapshot is the SHA-256 of
  that encoding. `random` yields, 32 bytes at a time, the SHA-256 of a
  32-byte seed followed by a block counter from 0, as 8 bytes,
  little-endian; the reader chooses the seed at start and records it. A reader takes a snapshot only between
  calls into the module: `checkpoint` asks for one when the current call
  returns. Running a Compute-let changes its machine state in the reader and writes
  nothing to the universe (**S1**). The machine state is recorded — a change that
  sets `snapshot`, with origin `tool` and the person as `asked` — when the
  person saves, and before a promotion (§12.6). Earlier snapshots remain in
  history and can be restored.
- **[M7] Replay.** A reader MAY record the fuel, times, inputs, messages,
  capability replies and seeds delivered to a Compute-let, as a blob: a
  list of encoded values in order of delivery, each `[kind, …]` — `["seed",
  bytes]`, `["call", export, arguments, fuel]`, `["time", flicks]`,
  `["input", event]`, `["message", port, value]`, `["reply", handle,
  value]`. Replaying the record from
  the matching snapshot reproduces its behavior. This is what tests,
  verification by others and shared sessions rest on.
- **[M8]** A Compute-let that traps, exhausts its fuel or exceeds its memory
  limit is stopped. Its last snapshot is intact; its surface shows the last
  picture it drew, marked as stopped.

A Compute-let with no granted capability still draws and sounds: it emits
display-list items through `draw`, whose raster and samples items may take
their source from its own memory (§9.2).

### 12.3 Code is description

A program's machine code is described, like everything else in a universe.
Its bytes are a face of that description (§8.1): sampled from it by a pure,
deterministic function, and so always verifiable against it, as an image is
a face of a document. There is no source tree, no build step, and no ledger
apart from the Chronicle.

A **module** object (`ufo.module`) holds:

| Property | Value |
| --- | --- |
| `funcs` | list of refs to function objects, in the order of the function index space, imported functions first |
| `memory` | `{initial, maximum}`, in pages; absent if the module has no memory |
| `globals` | map from a name to `{type, mutable, init}` |
| `exports` | map from an exported name to a ref to a function, the text `memory`, or `{global: name}` |
| `data` | map from a name to `{at, bytes}`: bytes placed at a fixed address when the module starts |
| `table` | list of refs to functions, or null for an empty entry: the table for indirect calls, if any |

A function object (`ufo.func`) holds:

| Property | Value |
| --- | --- |
| `name` | text, for people and agents. It appears nowhere in the bytes |
| `params`, `locals` | lists of `[name, type]`; a type is `i32`, `i64`, `f32` or `f64` |
| `results` | list of types |
| `body` | a sequence property (§1.7): a list of statements |
| `import` | in place of `body`, for a function the host supplies: its name in `ufo:host/1` |

A **statement** is one tree in WebAssembly's own vocabulary. An instruction
is a list: its standard text-format name; then its immediates; then its
operands, each a tree; then, optionally, a map of attributes. A bare
integer is an `i32.const`. A bare text reads the local or parameter of that
name, or else the global of that name. A tree is printed by printing its
operands in order and then the instruction. An instruction written without
operands takes them from the stack, as WebAssembly defines, so that every
function body within what can be described (below) can be written: flat,
folded, or anywhere between. A bare float is an `f64.const`.

| Instruction | Immediates |
| --- | --- |
| `local.get`, `local.set`, `local.tee` | the local's name |
| `global.get`, `global.set` | the global's name |
| `call` | a ref to the function object |
| `call_indirect` | a function type, `[[parameter types], [result types]]` |
| `block`, `loop` | a label: a text, possibly empty |
| `br`, `br_if` | the label of an enclosing `block`, `loop` or `if`, or a depth |
| `br_table` | a list of labels, then the default label |
| `i32.const`, `i64.const` | the number |
| `f32.const`, `f64.const` | the number, as a float where it is finite and the constant's type holds it exactly; otherwise an integer giving the constant's bits |
| every other instruction | none |

The attributes are `result` (a type, on `block`, `loop` and `if`), `label`
(on `if`), and `offset` and `align` (on loads and stores). A `br` names the
innermost enclosing construct that has its label; a construct with an
empty label can be named only by depth. `funcs`, `table` and the maps of a
module are ordinary properties, set whole or by key; only `body` is a
sequence.

**What can be described.** This version of the profile describes modules
that use the instructions of WebAssembly 1.0, the sign-extension and
saturating-conversion instructions, and `memory.copy` and `memory.fill`,
with one result to a block, four value types, active data segments and one
table of function references. That is narrower than what may run (§12.2).
A module outside it stays carried (**N6**) until a later version of the
profile can describe it.

Control flow is flat. `block`, `loop` and `if` — whose operand is its
condition — each open a stretch that a later `end` statement closes, with
`else` between for an `if`. These five are statements only, never
operands.

Every statement is an element (§1.7). It has a permanent element identity, names
the change that inserted it, and through that change has an origin (§5.4).
Code is therefore edited with `splice`, as text is: a fix to one statement
is an operation on one statement, and its record is the statement removed
and the statement put in its place. Statements are always addressed by
their element identities, never by number: a number moves with every edit above
it, and an element identity does not. An anchor addresses statements by a region on
`body` and survives edits around them (§4.3). A module offers the keyed
axis `funcs`.

**Printing.** A module's bytes are a function of its description:

- Sections appear in the order type, import, function, table, memory,
  global, export, element, code, data, each only if not empty. There are no
  custom sections and no start section.
- The type section lists each distinct function type once, in order of
  first use: by each function of `funcs` in turn, its own type and then
  the types its `call_indirect` instructions name.
- Functions are in the order of `funcs`. Globals, exports and data segments
  are in the order of their keys in the encoded map (§1.2): by length of
  name, then by bytes. A function's or global's index is its position in
  that order.
- An imported function is an entry of the import section: module name
  `ufo:host/1`, the field name its `import` gives, and its type.
- A global's initial value is a constant of its type: `init` is an
  integer for `i32` and `i64`, within the type's range, and a number for
  `f32` and `f64`. A module with any other `init` does not print. A data segment is
  active, at offset `i32.const` *at*. A `table`, if present, is one table
  of function references of exactly the list's length, filled by one active
  element segment at offset 0.
- Locals are declared as the code section encodes them: one entry for each
  run of consecutive locals of one type.
- A body is its statements printed in order, then `end`.
- A load or store has its natural alignment unless `align` says otherwise.
- Every length and index is an unsigned LEB128 in shortest form, and every
  integer constant a signed LEB128 in shortest form. A bare integer or an
  `i32.const` from 2³¹ to 2³² − 1 stands for the same 32 bits read as
  signed.

- **[N1]** Before running a described module, the kernel prints it and
  checks that the result is a valid WebAssembly module within the
  restrictions of §12.2, and that it exports and imports no name beginning
  `ufo:` other than its imports from `ufo:host/1`. The kernel checks the
  restrictions as it instruments the module; validity is the judgment of
  the host's engine when the kernel loads it (`engine`, §9.3), which the
  WebAssembly specification makes the same in every engine. A module that does not
  print, or does not pass, is inconsistent (§1.9). It is not run.
- **[N2]** Printing is deterministic: the same description yields the same
  bytes on every reader. Appendix F has a vector.
- **[N3]** A change to a module, or to a function a module lists, is
  verified as any change is (**L3**, **L4**), and further: the kernel
  prints the module as the change would leave it, and refuses the change
  whole if **N1** fails. A change to the code of a Compute-let is
  committed only by promotion (§12.6), whether or not it has tests.
- **[N4] Meaning, not mechanics.** Origin attaches to statements, and to
  the properties of functions and modules. Every other byte of a printed
  module — the framing of sections, lengths, indices, the order of types —
  is **implied** by the rules above and has no origin but them. Every byte
  of a module is thus either stated, with an origin, or implied (**R8**).
- **[N5] By content.** A function's **unit hash** is the SHA-256 of the
  encoded value `[params, results, locals, body]`. It names what the
  function is, apart from where it is: it does not change when the function
  is renamed, when other functions come and go, or when it is copied to
  another universe together with the functions it calls; and two functions
  with the same statements, calling the same functions, have the same one
  in any file. `unit` shows it and `search` finds by it. Equal
  bodies kept outside their nodes are stored once (§1.4). A copied function
  keeps its unit hash and is recorded with `copied`, as any copy is (§5.4);
  its history is found by following that.

**Carried modules.** A program compiled elsewhere enters a universe as what
it is: a file. It is an asset (§5.2) of media type `application/wasm`,
whose origin names the tool that produced it. A Compute-let's `module` may
name such an asset, and it runs under the same checks, sandbox and
metering. Its bytes are all the format knows of it. Like a text in a
foreign syntax (**X3**), it is not edited in place.

- **[N6]** A carried module that is within what can be described becomes
  maintainable by being **lifted**: one recorded change that writes a
  described module from it — each function's instructions as statements
  without operands, in order, with names taken from its exports and its
  name section where it has one, and its other custom sections left behind
  — as a derivation (§5.3) that pins the asset. Lifting is exact: printing
  the lifted module MUST yield a valid module in which every function has
  the same instructions in the same order as the original. The asset
  remains. A module outside what can be described cannot be lifted, and a
  reader says which of its features prevents it.

*Reason.* An earlier draft stored a module's bytes and changed them through
a second vocabulary of operations, which needed keys for the parts of a
module, hashes with keys in place of indices, a replay of all history to
verify, and a whole function sent again for each change. The core already
had what replaces all of it. [RATIONALE.md](RATIONALE.md) has the
measurements that decided it.

### 12.4 The printer

The **printer** is the function of §12.3 that turns a described module into
bytes. It is part of the kernel, there is one implementation of it (**K1**),
and it is the only writer of module bytes: no reader, writer, agent or
application supplies bytes for a described module, and what a reader runs
is what the kernel printed and then instrumented (**M4**). A reader stores
no bytes for a described module; a cache (§3.4) MAY keep them,
under the module's digest. A model never types bytes. It reads a function
through `unit`, one statement to a line, each with its element identity and the
change that wrote it; it writes statements through `propose`, as it would
any content (§10.3); and the kernel refuses a change whose module would not
validate (**N3**).

### 12.5 The ledger

The ledger of a Compute-let is the part of the Chronicle made of changes to
its module, its functions, its tests and its manifest. It is not a separate
structure: it obeys the laws of §1.7 and is navigated by the projections of
§10.1.

For each function, and for each statement of it, the ledger answers:

| Question | Answered by |
| --- | --- |
| What caused it? | the `origin` of the change that inserted the statement, or last set the property: prompt, model, requester |
| What did it replace? | that change's operation, which holds the statements removed |
| What justifies it? | evidence of kind `tested-by`, written at promotion (§12.6): from each function a change touched to each test that then passed |
| What has run it? | evidence of kind `exercised-by`, which a reader MAY record with a replay (**M7**): from each function the replay entered — the entry charges of **M4** count them — to the replay |
| What was decided? | decisions about that change |

The projections of code are in §10.1. Search covers name, signature,
digest, call relationships, prompt text, test coverage and revision.

### 12.6 Tests and promotion

A test object (`ufo.test`) holds:

| Property | Value |
| --- | --- |
| `run` | either `{call, arguments}`: an exported function and values to pass; or `{replay}`: the bytes of a recorded replay (**M7**) |
| `from` | the bytes of the snapshot to start from, or `live` to start from a copy of the running machine state |
| `expect` | either `{returns}`: the values the call must return; or `{state}`: the hash the snapshot taken afterward must have; or `{draws}`: the hash of the display list last drawn |
| `fuel` | the fuel allowed |
| `judges` | list of refs to functions in the module that exist to serve this test |

A change to a Compute-let is **promoted** by this sequence, which the
reader, not the Compute-let, carries out:

1. The kernel applies the change to a copy of the state and prints the
   candidate (§12.4). On refusal, stop.
2. The reader verifies the candidate (**N1**). On failure, stop.
3. The reader runs the tests named by the manifest *as it was before the
   change* against the candidate, each from the state its `from` names, in
   a shadow instance. The running instance is not touched.
4. If every test passes, the reader obtains the person's approval, unless
   the person has approved in advance changes by this actor to this
   Compute-let for the present session. A test change (**G1**) is never
   approved in advance.
5. The reader records the live machine state (**M6**), commits the change, starts
   the candidate from that machine state and switches the surface to it. The
   candidate's memory, globals and tables are those of the live instance; a
   global the change added takes its declared initial value; a data segment
   the change altered is not applied again. The
   previous revision remains in history.
6. If anything fails or approval is refused, the candidate is discarded.

A change to a function that the modules of several Compute-lets list is
promoted for each of them, and committed only if every one passes. The
change that commits a promotion records, as evidence of kind `tested-by`,
each test that passed against each function it touched.

- **[G1] The judge is outside the change.** The tests that gate a change are
  those in force before it. A change that adds, alters or removes a test
  object, alters a manifest's `tests`, or touches any function a test lists
  under `judges`, is a **test change**. It MUST NOT be combined with any other operation, and it is
  committed only with a decision of verdict `approve` from the person,
  given for that change.
- **[G2]** The running Compute-let never observes a candidate that failed.
- **[G3] Rollback** is promotion of an earlier revision, with the live machine state
  carried across in the same way and the same tests applied.

## Terms of this part

Marked as in the core's glossary (§6.2): a **concept** is an idea a newcomer must learn; a **name** is a founding word for something built of concepts; a **part** is a name for a piece of a record or a status.

| Term | | Meaning | § |
| --- | --- | --- | --- |
| Compute-let | concept | a complete single-purpose machine carried as an object and run in a sandbox | 12.1 |
| Fuel | concept | the count of instructions a Compute-let may still execute, charged by code the reader inserts | 12.2 |
| Implied | part | of a module's bytes: fixed by the printing rules, not by any statement | 12.4 |
| Ledger | name | the changes to a Compute-let's code, tests and manifest | 12.5 |
| Lifted | concept | of a module compiled elsewhere: turned into description, exactly | 12.3 |
| Machine state | concept | the memory, globals and tables of a running Compute-let | 12.2 |
| Manifest | concept | what a Compute-let declares: its module, the capabilities it asks for, its tests | 12.1 |
| Module | concept | a described WebAssembly module: functions, memory, globals, exports, data | 12.3 |
| Printer | concept | the kernel's function from a described module to its bytes | 12.4 |
| Program hash | concept | the hash of what a Compute-let would run and may ask for; grants attach to it | 12.1 |
| Promotion | concept | the gate by which a change to code takes effect: tests, approval, switch | 12.6 |
| Snapshot | concept | a blob holding a machine state | 12.2 |
| Statement | concept | one element of a function's body: a tree in WebAssembly's own vocabulary | 12.3 |
| Stretch | part | the instructions one charge of fuel covers | 12.2 |
| Test | concept | an object stating a call or a replay and what must result | 12.6 |
| Test change | part | a change that adds, alters or removes a test | 12.6 |
| Unit hash | part | the hash of a function's content | 12.3 |

---

## Appendix E. Accelerated graphics, sketched

The `gpu` capability follows the model of WebGPU (W3C), which every
current platform's graphics interface can serve, and uses its shading
language, WGSL. The contract of §9.3 is complete without this appendix;
the operations below are a sketch to be made exact with the first
implementation that needs them. Each is one `call` on the capability's
handle; resources are named by small integers the program chooses.

| Group | Operations |
| --- | --- |
| Limits | `limits` (what the host offers: texture size, sample counts, formats) |
| Buffers | `buffer.create`, `buffer.write`, `buffer.destroy` |
| Textures | `texture.create`, `texture.write`, `texture.from` (a raster source from §9.2, including one returned by `present`), `texture.destroy`, `sampler.create` |
| Shaders | `shader.create` (WGSL source; the reply reports errors) |
| Pipelines | `pipeline.render`, `pipeline.compute`, `bindgroup.create`, `pipeline.destroy` |
| Passes | `pass.begin` (targets: the surface or a texture), `pass.pipeline`, `pass.bind`, `pass.vertex`, `pass.index`, `pass.viewport`, `pass.scissor`, `pass.draw`, `pass.draw-indexed`, `pass.dispatch`, `pass.end` |
| Tick | `submit` (everything queued is drawn to the surface for this tick) |
| Readback | `read` (a texture's pixels; used for export and for tests) |

Rules that are already fixed:

- The surface is the only thing a program can draw to on screen. It cannot
  read what lies outside it.
- Every operation is charged fuel in proportion to the bytes it passes
  (**M4**), and the reader bounds the memory a program's resources may
  hold.
- Results on screen are not required to be bit-identical between hosts.
  Where they must be — a test with `expect.draws` — the reader uses a
  software implementation of the same operations, and `read`.
- Shader source travels as data in the Compute-let and is given to the
  host to compile. This is the one place a Compute-let hands a host code
  that is not WebAssembly; the host's own validation of WGSL is the
  boundary, as it is for web pages.
