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
    node printer.mjs unit <dir> <name>           one function, as it was last written
    node printer.mjs history <dir> [name]        the changes, or those touching one item
    node printer.mjs test <dir> <tests.json>     run tests

Operations:

    {"op":"memory.set","initial":1,"maximum":1}
    {"op":"global.add","name":"g","type":"i32","mutable":true,"init":0}
    {"op":"global.set","name":"g","init":5}                 (changes the initial value)
    {"op":"data.set","name":"d","at":256,"text":"abc"}      (or "bytes": hex)
    {"op":"func.add","name":"f","params":P,"results":["i32"],"locals":L,"body":B}
    {"op":"func.replace","name":"f","expect":"<hash from items or unit>","locals":L,"body":B}
    {"op":"func.remove","name":"f","expect":"<hash>"}
    {"op":"export.set","name":"exported_name","item":"f"}    (item "memory" exports the memory)
    {"op":"export.remove","name":"exported_name"}

`func.replace` keeps the signature and must state the current hash of the
function, as `items` or `unit` shows it. Types are i32, i64, f32, f64.
A function may call any function that exists by the end of the same change.

## Function bodies at this level: typed expression trees

`params` and `locals` are lists of `[name, type]` pairs:
`"params":[["n","i32"]]`, `"locals":[["acc","i32"]]`.

`body` is a JSON list of statements. The printer checks every type and
compiles the tree deterministically; a refusal names the path to the
offending expression.

Statements:

    ["set", "name", expr]                     assign a local or a mutable global
    ["store", width, addr, value]             width: "u8", "u16", "i32", "i64"
    ["if", cond, [statements], [statements]]  the else list is optional
    ["while", cond, [statements]]
    ["break"]   ["continue"]                  innermost while
    ["return", expr]    or ["return"] in a function with no result
    ["call", "f", arg, ...]                   call as a statement; a result is discarded

Expressions:

    5   -1                                    integer literal, i32
    ["i64", 5]                                i64 literal; ["i64", expr] widens an i32 (signed); ["i32", expr] narrows an i64
    "name"                                    a local, parameter or global
    [op, a, b]   op: + - * / % & | ^ << >> >>>      (/ % >> are signed; "/u" "%u" ">>>" unsigned)
    [cmp, a, b]  cmp: == != < <= > >=               (signed; "<u" "<=u" ">u" ">=u" unsigned); result i32 0 or 1
    ["!", a]                                  1 if a is 0, else 0
    ["and", a, b]  ["or", a, b]               short-circuit; result 0 or 1
    ["if", cond, a, b]                        value of a or b; only one is evaluated
    ["load", width, addr]                     width: "u8", "s8", "u16", "s16", "i32", "i64"
    ["call", "f", arg, ...]

Both operands of an operator must have the same type. A function with a
result must end every path with `return`.

Example:

    {"op":"func.add","name":"sum_to","params":[["n","i32"]],"results":["i32"],"locals":[["acc","i32"]],
     "body":[["while",["!=","n",0],[["set","acc",["+","acc","n"]],["set","n",["-","n",1]]]],["return","acc"]]}
