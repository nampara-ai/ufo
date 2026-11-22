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
    node printer.mjs test <dir> <tests.json>     run tests against the committed module
    node printer.mjs check <dir> <change.json> [tests.json]
                                                 dry run: say whether the change would be committed,
                                                 and optionally run tests against the candidate; changes nothing
    node printer.mjs call <dir> "init(1); step(2); score(); text(4096,204)"
                                                 call exports in order on a fresh instance and print results;
                                                 text(ptr,len) prints memory as text
    node printer.mjs change <dir> <n>            the operations of change n, exactly as recorded

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

## Function bodies at this level: named, folded WebAssembly text

`params` and `locals` are lists of `[name, type]` pairs:
`"params":[["n","i32"]]`, `"locals":[["acc","i32"]]`.

`body` is a string of WebAssembly text-format instructions. Folded
(parenthesized) expressions and names for locals, labels, globals and
functions are accepted; flat instructions may be mixed in.

    (local.get $n)  (local.set $acc (i32.add (local.get $acc) (i32.const 1)))  (local.tee $x ...)
    (global.get $g)  (global.set $g ...)  (call $f arg arg)
    (i32.const -5)  (i64.const 7)
    i32.add i32.sub i32.mul i32.div_s i32.div_u i32.rem_s i32.rem_u i32.and i32.or i32.xor
    i32.shl i32.shr_s i32.shr_u i32.eqz i32.eq i32.ne i32.lt_s i32.lt_u i32.gt_s i32.gt_u
    i32.le_s i32.le_u i32.ge_s i32.ge_u   (and the same for i64, and the f32/f64 operators)
    (i32.load addr) i32.load8_u i32.load8_s i32.load16_u (i32.store addr value) i32.store8 i32.store16  (optional offset=N)
    (block $name ...)  (loop $name ...)
    (if (condition) (then ...) (else ...))     with a value: (if (result i32) (condition) (then ...) (else ...))
    (br $name)  (br_if $name (condition))      br to a loop's name jumps to its start
    (return ...)  (drop ...)  (select a b cond)  unreachable  nop

Comments `;; to end of line` are allowed inside the body string.

Example:

    {"op":"func.add","name":"sum_to","params":[["n","i32"]],"results":["i32"],"locals":[["acc","i32"]],
     "body":"(block $done (loop $top (br_if $done (i32.eqz (local.get $n))) (local.set $acc (i32.add (local.get $acc) (local.get $n))) (local.set $n (i32.sub (local.get $n) (i32.const 1))) (br $top))) (local.get $acc)"}
