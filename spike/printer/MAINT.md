# Maintenance

You are taking over a WebAssembly module that others built and changed.
There is no source code for it anywhere. What exists is the module's state
directory and the printer's commands: `items`, `unit`, `history`, `change`,
`call`, `check`, `test`. The rules the program implements are in TASK1.md.

Do the two parts in order, as separate changes, each with a `note` saying
what you changed and why.

## Part A: a bug report

"Since a recent change, two things are wrong. The snake dies when its head
moves into the cell its tail is leaving, which the rules allow. And it
sometimes passes through its own body without dying. Both worked before."

Find the cause and fix it with the smallest change you can. Part A is done
when `tests1.json` and `bug1.json` both pass.

## Part B: new features

Then make the changes in TASK2.md. Part B is done when `tests2.json`
passes. (`tests1.json` and `bug1.json` are written to the old rules and
will no longer pass once `step` reports eating; that is expected.)

Functions that need no change must keep their hashes. Further tests you
cannot see will be run afterward.
