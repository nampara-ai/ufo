# Task 2: modify the game core

A module built by someone else is in your state directory. You have no
source for it. Learn what it is with the `items`, `unit` and `history`
commands, then change it, through the printer only, by replacing and
adding functions. Do not rebuild it from scratch: functions that need no
change must keep their hashes.

The rules of the game are in TASK1.md. Make these three changes.

1. **Wrap mode.** New export `set_wrap(on)`: `on` ≠ 0 turns wrap mode on,
   0 turns it off. `init` turns it off. With wrap mode on, a step that
   would leave the grid arrives at the opposite edge instead (x and y wrap
   independently) and the rules for what is in that cell then apply as
   usual. With wrap mode off, behaviour is as before.
2. **Bonus food.** Count the foods placed since `init` (the one placed by
   `init` is the first). Every fifth food placed (the 5th, 10th, …) is a
   bonus food: `cell` reports 3 for it, `render` shows `$`, and eating it
   adds 3 to the score instead of 1. The snake still grows by one.
3. **Eating is reported.** `step` returns 2, not 0, when the step ate food
   of either kind.

Done when `node printer.mjs test <dir> tests2.json` reports no failures.
Further tests you cannot see will be run afterward on the same rules.
