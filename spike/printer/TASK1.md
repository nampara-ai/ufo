# Task 1: build the game core

Build a WebAssembly module, through the printer only, with one page of
memory and these exports. All integers are i32.

Grid: 16 columns (x = 0..15) by 12 rows (y = 0..11). A cell index is
`y*16 + x`. Each cell is empty, snake, or food. Directions: 0 up (y−1),
1 right (x+1), 2 down (y+1), 3 left (x−1).

Random numbers: a 32-bit state. `next()`: state = state × 1103515245 + 12345
(mod 2^32); the value is `(state >>> 16) & 0x7fff` (unsigned shift).

Placing food: repeat { x = next() mod 16; y = next() mod 12 } until cell
(x, y) is empty; that cell becomes food. (x is drawn first, then y, every
attempt.) If the snake occupies all 192 cells, no food is placed.

- `init(seed)`: state = seed. Empty grid. Snake of length 3 at (5,6), (6,6),
  (7,6); the head is (7,6); the tail is (5,6). Direction 1. Score 0. Alive.
  Then place food.
- `step(dir) -> i32`: if dead, return 1 and change nothing. If `dir` is
  0..3 and is not the opposite of the current direction, it becomes the
  current direction; any other value keeps the direction. Compute the cell
  one step from the head in the current direction.
  - Outside the grid: the snake dies; return 1.
  - Food: score += 1; the snake grows by one (the new cell becomes the
    head, the tail stays); place food; return 0.
  - Snake: if that cell is the current tail, it is not a collision (the
    tail moves away); any other snake cell: the snake dies; return 1.
  - Otherwise (empty, or the tail cell): the tail cell is vacated, the new
    cell becomes the head; return 0.
- `score() -> i32`, `length() -> i32` (snake length), `head() -> i32` (cell
  index of the head).
- `cell(x, y) -> i32`: 0 empty, 1 snake, 2 food; −1 if (x, y) is outside
  the grid.
- `render(ptr) -> i32`: writes the grid as text at memory address `ptr`:
  12 rows, each 16 characters followed by a newline (byte 10). `@` head,
  `o` other snake cells, `*` food, `.` empty. Returns 204. Tests call it
  with ptr = 4096, so keep your own data below 4096 or above 4300.
- `memory`: the memory, exported under that name.

Done when `node printer.mjs test <dir> tests1.json` reports no failures.
Further tests you cannot see will be run afterward on the same rules.
