# The printer

You change a WebAssembly module only by giving the printer a *change*: a
JSON file `{"note": "...", "ops": [ ... ]}`. The printer checks the whole
change, and either commits all of it or refuses all of it with a reason.
You never write WebAssembly bytes, and you may not use any other compiler,
assembler or tool to produce or inspect the module. Do not keep source
files of your own: the changes you submit are the only record.

Commands (run from this directory; `<dir>` is your state directory):

    node printer.mjs print <dir> <change.json>   submit a change
    node printer.mjs items <dir>                 every item, one per line
    node printer.mjs unit <dir> <name>           one function: its statements, numbered, each marked
                                                 with the change that wrote it (c3 = change 3)
    node printer.mjs history <dir> [name]        the changes, or those touching one item
    node printer.mjs change <dir> <n>            what change n did: statements removed (-) and added (+)
    node printer.mjs test <dir> <tests.json>     run tests against the committed module
    node printer.mjs check <dir> <change.json> [tests.json]
                                                 dry run: say whether the change would be committed,
                                                 and optionally run tests against the candidate; changes nothing
    node printer.mjs call <dir> "init(1); step(2); score(); text(4096,204)"
                                                 call exports in order on a fresh instance and print results;
                                                 text(ptr,len) prints memory as text

Operations:

    {"op":"memory.set","initial":1,"maximum":1}
    {"op":"global.add","name":"g","type":"i32","mutable":true,"init":0}
    {"op":"global.set","name":"g","init":5}                 (changes the initial value)
    {"op":"data.set","name":"d","at":256,"text":"abc"}      (or "bytes": hex)
    {"op":"func.add","name":"f","params":P,"results":["i32"],"locals":L,"body":[statement, ...]}
    {"op":"func.edit","name":"f","rev":"<rev from unit>","at":N,"del":K,"ins":[statement, ...]}
    {"op":"func.edit","name":"f","rev":"<rev>","edits":[{"at":N,"del":K,"ins":[...]}, ...],"locals":L}
    {"op":"func.remove","name":"f","rev":"<rev>"}
    {"op":"export.set","name":"exported_name","item":"f"}    (item "memory" exports the memory)
    {"op":"export.remove","name":"exported_name"}

`params` and `locals` are lists of `[name, type]` pairs:
`"params":[["n","i32"]]`, `"locals":[["acc","i32"]]`. Types are i32, i64,
f32, f64. A function may call any function that exists by the end of the
same change.

## A function body is a list of statements

`func.edit` changes part of a function. `at` is a statement number as
`unit` shows it, `del` is how many statements to remove there (0 to only
insert), and `ins` is the statements to put in their place (omit to only
remove). `rev` is the function's current revision, as `unit` shows it.
With `edits`, one operation makes several edits, and **every `at` refers to
the numbering you read**, however many statements other edits add or
remove. `locals`, if given, replaces the list of locals; the signature
cannot change.

Each statement is one tree, written as JSON, in WebAssembly's own
instruction names. An instruction is `[name, operand, operand, ...]`; its
operands are evaluated first, in order.

    5   -1                         a bare integer is an i32 constant
    ["i64.const", 7]               other constants are written out
    "n"                            a bare name reads the local or parameter of that name, else the global
    ["local.set","acc",["i32.add","acc","n"]]        ["local.tee","x", value]
    ["global.set","g", value]
    ["call","f", arg, arg]                           as a statement, or as an operand if it returns a value
    ["i32.add",a,b] i32.sub i32.mul i32.div_s i32.div_u i32.rem_s i32.rem_u i32.and i32.or i32.xor
    i32.shl i32.shr_s i32.shr_u i32.eqz i32.eq i32.ne i32.lt_s i32.lt_u i32.gt_s i32.gt_u
    i32.le_s i32.le_u i32.ge_s i32.ge_u    (and the same for i64, and the f32/f64 operators)
    ["i32.load8_u", addr]  i32.load  i32.load8_s  i32.load16_u       optional last item {"offset": N}
    ["i32.store8", addr, value]  i32.store  i32.store16              optional last item {"offset": N}
    ["select", a, b, cond]   ["drop", value]   ["return", value]   ["return"]   ["unreachable"]   ["nop"]

Control flow is written as statements of its own, closed by `["end"]`:

    ["if", cond]  ...statements...  ["else"]  ...statements...  ["end"]      (the else part is optional)
    ["block","name"]  ...  ["end"]
    ["loop","name"]   ...  ["end"]
    ["br","name"]   ["br_if","name", cond]     to a block's name: leave it; to a loop's name: go to its start

A block that yields a value takes a last item `{"result":"i32"}`.

Example:

    {"op":"func.add","name":"sum_to","params":[["n","i32"]],"results":["i32"],"locals":[["acc","i32"]],
     "body":[["block","done"],
             ["loop","top"],
             ["br_if","done",["i32.eqz","n"]],
             ["local.set","acc",["i32.add","acc","n"]],
             ["local.set","n",["i32.sub","n",1]],
             ["br","top"],
             ["end"],
             ["end"],
             ["return","acc"]]}

and, to change its fourth statement only (statement 3):

    {"op":"func.edit","name":"sum_to","rev":"1a2b3c4d","at":3,"del":1,
     "ins":[["local.set","acc",["i32.add","acc",["i32.mul","n",2]]]]}
