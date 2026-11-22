# The Universal File Object (UFO) Specification: Presentation

**Version 0.8 — draft for review. Nothing here is frozen. Nothing here has been implemented.**

This part specifies how a universe describes what it shows: the eleven primitives and their layout, formulas, the algorithm that composes a description into rows, lines and pages, Portals, and faces.

This is one part of the specification of the UFO format, and is written to
be read on its own by someone who has read the core, [SPEC.md](SPEC.md),
or its summary, [CORE.md](CORE.md). The words MUST, MUST NOT, SHOULD,
SHOULD NOT and MAY are used as in RFC 2119 and RFC 8174; a rule that
carries a label such as **[C3]** is a requirement in full; a term in
**bold** is being defined, and every term is listed in the glossary
(§6.2). What has been exercised, and how, is in
[VISION-TRACE.md](VISION-TRACE.md).

**What it takes from the core.** Objects with types and properties (§1.5); values and the four references (§1.2); sequences and their elements (§1.7); anchors, axes and pins (§4); the text and derivation profiles (§5.1, §5.3); references between universes (§1.8).

**The parts of the specification.**

| Document | Sections | Holds |
| --- | --- | --- |
| [SPEC.md](SPEC.md), the core | §0–§6, Appendices C, D, F | storage, memory and addressing: records, objects, changes, the pack, anchors, text, derivation, the Chronicle; limits, the glossary, the test vectors |
| [SPEC-PRESENTATION.md](SPEC-PRESENTATION.md) | §7–§8, Appendix A | the eleven primitives, formulas, composition, Portals, faces |
| [SPEC-PLAYER.md](SPEC-PLAYER.md) | §9–§11, Appendix B | the kernel, the drawing contract, the host interface, onboard tools, the light cone, the agent interface, the player's budgets |
| [SPEC-EXECUTION.md](SPEC-EXECUTION.md) | §12, Appendix E | Compute-lets, code as description, the printer, the ledger, tests |
| [SPEC-TRAVEL.md](SPEC-TRAVEL.md) | §13–§14 | envelopes, what leaves a reader, the reader ladder, trust |
| [EXAMPLES.md](EXAMPLES.md) | §15 | four worked examples; a companion, not normative |
| [MAPPING.md](MAPPING.md) | §16 | mapping an application's own records; a companion, not normative |

Section numbers run through all the documents and none is used twice, so
§9.3 names one place whichever document cites it. Rule labels such as
**[C3]** are likewise unique across them.

---

## 7. The primitive vocabulary

### 7.1 The eleven primitives

Everything a universe presents is described with these and nothing else.
Ten are object types; the eleventh, the formula, is a value. A clock maps
time as a pane maps space.

| Primitive | Type | What it describes | Axes it offers |
| --- | --- | --- | --- |
| **Text** | `ufo.text` | characters with structure and style (§5.1) | `chars` (sequence) |
| **Path** | `ufo.path` | vector geometry with fill and stroke | `x`, `y` (continuous) |
| **Raster** | `ufo.raster` | a grid of pixels from an asset, a surface, or a video at a moment | `x`, `y`; `t` if timed |
| **Samples** | `ufo.samples` | audio from an asset or a surface | `t` (continuous) |
| **Pane** | `ufo.pane` | a two-dimensional coordinate space with a transform and a clip, holding children | `x`, `y`; `children` (keyed) |
| **Group** | `ufo.group` | an ordered composition of children under a layout rule | `children` (keyed) |
| **Clock** | `ufo.clock` | a time mapping and interval (§4.5), holding children | `t`; `children` (keyed) |
| **Portal** | `ufo.portal` | a reference to another object, presented through its own description (§7.8) | those of its parent |
| **Surface** | `ufo.surface` | a pane whose content a Compute-let produces live (§12.1); it may hold children that the Compute-let places within what it draws (§7.6) | `x`, `y`, `t`, plus any the Compute-let declares; `children` (keyed) |
| **Data** | `ufo.data` | typed values and tables | `rows`, `cols` (keyed) |
| **Formula** | a value | a pure expression computing a value from data, time, input and other values (§7.3) | — |

Every primitive object MAY carry `label` (text, the accessible name), `role`
(text, a semantic hint such as `heading`, `figure`, `button`) and `lang`.

A property that says how something looks, where it sits or when it is
present MAY be a formula; so may the geometry of a path. A property that
says what something is MUST NOT be: content (`chars`, `rows`), structure
(`children`, `spans`), references (`of`, `source`, `computelet`), and
`from`. Appendix A marks which is which.

Property tables for each primitive are in Appendix A.

### 7.2 Layout

A group lays out its children by one of three rules:

| Rule | Behavior |
| --- | --- |
| `flow` | children are placed one after another along the inline direction and wrap to new lines along the block direction, within the group's width. A child marked `block` starts and ends a line. A child marked `float` is placed at the start or end edge and later content wraps beside it. |
| `grid` | children are placed in cells of declared rows and columns. Track sizes are fixed lengths, fractions of the remaining space, or the largest minimum size of the children in the track. |
| `absolute` | each child is placed at its own `x`, `y`, `w`, `h` in the group's coordinate space, in list order from back to front. |

- **[V1] Parents size children.** Layout proceeds from the root down. A parent
  gives each child a finite available size; a child reports the size it uses
  within that; no child's size can depend on a later sibling or on its
  parent's final size. Layout therefore terminates in one pass per level.
- **[V2]** Lengths are in the units of the nearest enclosing pane. The root
  pane's unit is the CSS reference pixel (1/96 inch).

### 7.3 Formulas

A **formula** is a list whose first item is an operator name and whose
remaining items are arguments: values or further formulas. It is stored as
structure, never as text to be parsed; a readable spelling is a projection.

| Group | Operators |
| --- | --- |
| reference | `get` (a property of an object, by ref and key path), `cell` (a table cell by row and column key), `col` (a column as a list), `arg` (a named value supplied by the enclosing `each`, or by the Portal that presents this, §7.6), `size` (the laid-out width and height of an earlier sibling in the same group), `ask` (the records of a projection, §10.1) |
| environment | `time` (the enclosing clock's time), `input` (the pointer's position and pressed state within the enclosing pane, and the `src` of the item under it), `view` (the available width and height), `state` (a named value of presentation state) |
| arithmetic | `+ − × ÷ mod neg abs min max floor ceil round sqrt pow exp ln sin cos atan2` |
| logic | `= ≠ < ≤ > ≥ and or not if` |
| text | `concat len slice format` (numbers and dates to text by a stated pattern) |
| lists | `list count sum mean nth sort filter map range` |

`filter`, `map` and `sort` take a formula applied to each item, which refers
to the item with `arg`.

- **[F1] Pure.** A formula has no effect and reads nothing but its arguments
  and the environment operators above.
- **[F2] Terminating.** There is no recursion and no unbounded loop. The
  dependency graph among formulas MUST be acyclic; a formula in a cycle
  evaluates to an error value. One composition evaluates at most 10⁷
  operator applications; a formula reached after that evaluates to an error
  value. The figure is fixed here, not left to readers, so that all readers
  agree.
- **[F3] Deterministic.** Arithmetic is IEEE 754 binary64. Because every
  reader runs the same compiled kernel (§9.1), every operator, including the
  transcendental ones, gives bit-identical results everywhere.
- **[F4]** An error value propagates through operators and presents as a
  visible, inspectable sign of the error. It never presents as a plausible number.
- **[F5] No coercion, no locale.** An operator applied to a value of the
  wrong type yields an error value. `sort` orders numbers numerically and
  text by Unicode scalar value. `format` takes a number and a pattern of
  fixed decimals, grouping and percent, or a time in flicks or milliseconds
  and a pattern of ISO 8601 fields in UTC; it never consults the host's
  locale or time zone. `size` of anything but an earlier sibling is an error
  value, which keeps layout to one pass (**V1**).

**Operators, exactly.** Arguments are evaluated left to right before an
operator is applied, except that `if`, `and` and `or` evaluate only what
they need. Each application counts one toward the bound of **F2**.
Integers and floats are both numbers here; arithmetic is done in binary64,
and a result that is not finite is an error value.

| Operators | Defined as |
| --- | --- |
| `+ − × neg abs min max` | as IEEE 754 |
| `÷` | division; by zero, an error value |
| `mod` | *a* − *b* × floor(*a* ÷ *b*): the result has the sign of *b* |
| `floor ceil round` | to an integer; `round` takes halves away from zero |
| `sqrt pow exp ln sin cos atan2` | the results of the routines of the same names in the FreeBSD mathematics library (msun), which the kernel carries, so that they are the same everywhere |
| `= ≠` | exact comparison of two values; a number never equals a text |
| `< ≤ > ≥` | of two numbers, or of two texts by scalar value; anything else, an error value |
| `and or not if` | on booleans; `if(c, a, b)` |
| `concat len slice` | `len` counts the scalar values of a text or the items of a list; `slice(x, from, to)` takes those from index *from* up to but not including *to*, counted from 0 and clipped to the ends |
| `format` | `format(n, pattern)`: a pattern is `0` followed optionally by `.` and one `0` for each decimal place, optionally containing `,` to group thousands, optionally ending `%`, which multiplies by 100. For a time, a pattern made of `YYYY`, `MM`, `DD`, `hh`, `mm`, `ss` and any other characters, in UTC |
| `list count sum mean nth range` | `sum` of nothing is 0 and `mean` of nothing an error value; `nth(list, i)` counts from 0 and is an error value outside the list; `range(a, b)` is the integers from *a* up to but not including *b*, at most 2²⁰ of them |
| `sort filter map` | `sort(list, key)` is stable and ascending by the key formula's value, or by the items themselves |
| `get cell col` | `get(ref, path)` is the value at a key path of an object's properties; `cell(ref, row, col)` a cell's value, a formula there being evaluated; `col(ref, col)` a column's values in the table's order. A missing object, key or cell is an error value |
| `arg size time input view setting` | `size(key)` is `[w, h]`; `time` is in flicks; `input` is `[x, y, pressed, src]`, `src` being the anchor carried by the item under the pointer (§9.2); `view` is `[w, h]`; `setting(name)` is null until set |
| `ask` | `ask(projection, argument…)` is the records a projection of §10.1 returns for those arguments, as a list of maps from field name to value. A projection is a function of a commit, so `ask` is as pure as `get`. It reads the universe the formula is in, or a subject it was given (§7.6). Each record counts one toward the bound of **F2** |

**Repetition.** A group MAY carry `each`: a formula yielding a list or a ref
to a data object, and `as`, a name. Its single child is then a template,
presented once per item with `arg` bound. This is how a table becomes rows
of text, and a dataset becomes the bars of a chart.

**Settings** are a small map of named values held by the reader for
one presentation: a sort column, a selected tab, a scroll position, a slider.
Primitives declare which input sets which setting (`on`, Appendix A). It is not
part of the universe and changing it changes no byte. Each presentation of
an object through a Portal has its own settings: two Portals onto one table
sort independently, and nothing inside a nested or linked universe can read
or set the settings of what presents it; what it is given, it is given in
`with` (§7.6). An action that edits
the universe is a change (§1.7), made through the onboard tools.

### 7.4 The deletion test

- **[V3]** A primitive, a layout rule, a formula operator, a host interface
  function or a kernel feature may be added to this specification only with
  a written demonstration that it cannot be expressed as data, as a formula,
  or as a composition of what exists, and with the budgets of §6 restated.

The test applied to this draft:

| Candidate | Outcome | Why |
| --- | --- | --- |
| Constraint layout | deleted | `absolute` with formulas over `view` and the `size` of earlier siblings expresses one-directional constraints in a single pass. Simultaneous constraints, which need a solver, are not offered; a layout that truly needs one computes positions in a Compute-let |
| Stack layout | deleted | a one-row or one-column `grid`; back-to-front stacking is `absolute` |
| Paragraph, heading, list item | moved, not deleted | they are block spans of a text (§5.1). The text profile has ten roles whose default presentation the kernel knows (Appendix A), and §6.1 counts them: a small document vocabulary lives inside the text primitive |
| Page | deleted | a region of fixed size holding a group |
| Slide | deleted | a pane under a clock |
| Chart | deleted | data, formulas and paths under `each` |
| Table view | deleted | a `grid` group under `each` over a data object |
| Timeline, canvas | deleted | clocks holding children; a pane with `absolute` children |
| Scene graph, camera, mesh, material | deleted from the format | data that a surface's Compute-let reads and draws (§7.5) |
| Edge | deleted | a property holding a ref (§1.5) |
| Playback settings on a Portal | deleted | looping is a clock's `repeat`; muting is a samples' `gain`; whether time runs unprompted is the clock's mode; controls are the tools' interface (§9.6) |
| A table from media type to presenter | deleted | a surface names its Compute-let directly; nothing is dispatched by type (**H5**) |
| An ordering axis beside `children` | deleted | a keyed axis already survives reordering |
| Rendition, transmutation, summary as separate mechanisms | deleted | one derivation record (§5.3) |
| Ledger as a separate store | deleted | the Chronicle's changes to a Compute-let's code (§12.5) |
| Printer operations, item keys, a stored module | deleted | a module is objects and sequences, edited by the four operations and printed by the kernel (§12.3) |
| A summary tree | deleted | the outline is the tree; a summary attaches to a scope by its pins (§10.2) |

### 7.5 What the familiar media are

These are compositions, shown to make the vocabulary concrete. None is a
type the kernel knows.

| Medium | Composition |
| --- | --- |
| Document | a text, presented as a `flow` group; Portals at positions in it |
| Paginated document | the same text sampled into panes of page size (§8.4) |
| Spreadsheet | a data object; a `grid` group under `each` presenting it; cells may hold formulas |
| Chart | a pane holding paths and text under `each` over a data object |
| Diagram | a data object of nodes and links; a layout Compute-let, or formulas, giving positions; paths and text |
| Slide deck | a clock in `held` mode over a list of panes, advanced by input |
| Video | a clock holding clocks, each bringing a raster, samples, text, paths or Portals into presence for an interval |
| Recorded footage | a raster whose source is a video asset and whose time is the clock's |
| Animation | any of the above with formulas of `time` |
| Interface | panes, groups, text and paths with `on` handlers that set settings |
| Application, game | a surface |
| 3D scene | a data object in the glTF model, with `x`, `y`, `z` and `t` axes; a surface that names it in `of` and whose Compute-let draws it using the `gpu` capability; children placed by anchors into the scene |

Conversations are text objects whose spans carry speaker and time, with
the Chronicle recording origin as for any text.

**Three dimensions, explicitly.** A 3D scene is drawn by a program, and
everything about it that is content is format data, readable by the kernel
and by any agent without running that program.

*The scene is a data object.* It follows the object model of glTF 2.0
(ISO/IEC 12113): its tables are `scenes`, `nodes`, `meshes`, `materials`,
`textures`, `cameras`, `lights` and `animations`, each row holding the
properties glTF defines for that object, with keys in place of glTF's array
indices and geometry and images in assets. It declares four continuous
axes, `x`, `y`, `z` and `t`, with the scene's bounds and duration as their
extents, beside its keyed axes. A glTF file converts to such an object at
the border without loss, and exports from one (**B3**). The kernel does not
interpret these tables; it stores, anchors, attributes and summarizes them
as it does any data.

*Anchors reach into it three ways.* To a part: a key on `nodes`, `meshes`
or any other table. To a place: a region on `x`, `y`, `z`. To a time: a
region on `t`. A comment on a doorway, evidence for the dimensions of a
beam, a summary of the east wing and a decision about a material are all
ordinary anchors to the scene object, and survive edits by the ordinary
rules: keys persist, and rescaling the scene sets the scales of its axes.

*Attribution is ordinary.* Each row was set by a change, so `why` on a node
answers who or what placed it, from what prompt, on what evidence.

*The light cone covers it.* Its outline lists its tables and nodes as any
data object's does, and summaries may pin regions of it — a table, a set
of nodes, a volume (§10.2). The
plain-text face of a scene is that of any data object (§8.3): the kernel
knows nothing of a scene's hierarchy.

*What appears inside the scene is format data too.* A surface names the
object it presents in `of`. Its children — a Portal onto a spreadsheet, a
pane holding a page of text — are objects, each with `place.at`: an
anchor into the scene naming the node on which the child sits. That node's
row gives its position, orientation and the size of the rectangle, in
scene units. So "the spreadsheet is on the north wall" is a fact in the
universe, with an origin, which an agent can read and change; the program
only draws it (§7.6).

*The program holds no content.* The scene's presenter is a carried
Compute-let drawing through the `gpu` capability. Its memory holds the
state of a machine — a camera being moved, a cache of buffers — never
anything that is part of the work (**M9**). Without `gpu` the surface shows
its poster (**H2**), and everything above remains readable.

The format therefore has no 3D object type, no 3D operation, no 3D
display-list item and no scene profile, and three dimensions are not
opaque to it.

**The removed profiles.** Timelines, grids, canvases, scenes and
conversations were once planned as profiles. Each is a row of the table
above, and each is worked through in §15: timelines in §15.1, grids in
§15.1 and §15.4, canvases in the charts of §15.4, scenes in §15.2 and
§15.4, conversations in §16.2. If any medium is found that these
compositions cannot express, the remedy is to restore or add a profile,
under the deletion test, not to narrow what a universe may be.

### 7.6 Interfaces that edit, and surfaces that hold children

Two small additions let description do work that would otherwise need a
program, and let programs take part in composition.

**Handlers that propose changes.** An `on` handler (Appendix A) may carry
`propose`: a list of operations (§1.7) in which any field may be a formula.
When the event occurs, the kernel evaluates the formulas — against data,
settings and the event — and submits the result as a change, with
origin `{basis: witnessed, by: person}` naming the person using the reader.
It is verified and committed, or refused, like any change (**L4**). A
checkbox, a form, an editable cell and a button that adds a row are
therefore description, with no Compute-let.

A handler may instead carry `act`: the name of any action of §10.3 and its
arguments, in which any field may be a formula. The kernel performs it as
the act of the person using the reader. `propose` is the commonest case and
keeps its own spelling. An action that needs something only the person can
supply — a file to import, a place to save, a recipient — makes the reader
ask for it.

**Subjects.** A Portal MAY pass values to what it presents, in `with`; the
description presented reads them with `arg`, and a Portal there MAY have
`arg` as its `of`. This is what lets an interface work on something other
than itself. An `ask` reads, and an action changes, the universe that holds
the formula or handler, unless it is aimed at a **subject**: an anchor to
another universe that the presenter supplied in `with`. A presenter can
supply as a subject only itself, or a subject it was itself given, so
nesting a universe never gives it power over anything but what its
presenter chose to hand it. A reader hands the universe being worked on to
the tools it has chosen (§9.6).

**Editable text.** A text primitive, or a region of one, marked `editable`
accepts text entry. The host supplies the editing surface it already has —
caret, selection, input methods, accessibility — through the `text`
capability and reports each committed edit as an input event `edit` giving
the range replaced and the text that replaced it. The kernel turns the
range into the identities of the elements concerned and submits a
`splice`. The host
knows it is editing a piece of text and nothing more (**K2**).

**Children of a surface.** A surface MAY have `children`, a keyed map of
objects: Portals, or panes, groups and texts directly. Where each child
sits is stated in the child's `place.at`, an anchor into the object the
surface presents (its `of`), so that the arrangement is data. The kernel
does not draw the placement; the surface's Compute-let does, using the
`present` capability: it asks for a child to be presented at a size in
pixels, receives a raster it can draw or use as a texture, and passes back
any input that falls on the child, translated into the child's coordinates. Parents still size children (**V1**), the child is
composed by the kernel exactly as it would be anywhere, and the limits on
nesting apply (**O7**). This is how a Portal appears on a wall of a 3D
scene, on a screen inside a game, or in a custom interface.

### 7.7 Composition

To compose is to turn description into a display list (§9.2). This section
is normative, and all of it is the kernel's: the host is asked only what a
piece of text measures.

**Rows.** Composing an object for a width yields a list of **rows**. A row
is an unbreakable strip across the flow: a height; a *gap*, the space it
asks for above itself; the display-list items in it, placed from its top
left; and three facts used only when breaking pages — whether it may end a
page, which block it belongs to, and which line of how many it is.

| Object | Its rows |
| --- | --- |
| a text | by the steps below |
| a group with `flow` | the rows of its children, in order. The first row of each child after the first has the larger of its own gap and the group's `gap`. A child of a flow is a block unless its `place` is `inline`. Consecutive inline children share lines: each is placed after the last at its own width, a new line beginning when the next does not fit, and each line is one row, as tall as its tallest child |
| a group with `grid` | one row: its tracks are sized as below and each child composed in its cell |
| a group with `absolute`; a pane | one row, of the object's `h`: each child composed at its own `w` and placed at its `x`, `y`, in list order, back to front |
| a path, raster or samples; a surface | one row, of its `h`, holding its item |
| a Portal that states `h` | one row of that height: the target composed at the Portal's width, its rows stacked, then fitted into the Portal's rectangle by `fit` and clipped (**O2**) |
| a Portal that states no `h` | the rows of its target, composed in the target's universe (§1.8) at the Portal's width: it takes the height they need, as a text does. Where **O4** or **O7** says so, one row showing its label |
| a clock | one row, as tall as its tallest child: the children present at the time of composition, each composed at the time the clock gives it (§4.5), one over another in list order |

**A grid's tracks.** `cols` and `rows` are lists of track sizes: a length,
a fraction `[n, "fr"]`, or `"fit"`. A fixed column has its length. A `fit`
column is as wide as the widest of its children, each measured as the width
of its longest line when composed in the width left by the fixed columns,
or its own `w`. What then remains is shared among fraction columns in
proportion. Rows are sized the same way from their children composed at
their column widths; fraction rows share what remains of the group's `h`,
and count as `fit` if it has none. A child sits in the cell its `row` and
`col` name, counted from 0, across the tracks its `span` gives, placed by
`align`. Under `each`, the copies of the template fill cells in order, row
by row.

**A text into rows.**

1. *Check.* Apply **X1**. A text that fails is a single row saying so.
2. *Spans.* Resolve each span's region (§4.3). A detached span takes no
   part.
3. *Blocks.* Each character belongs to the innermost block span covering
   it: of those that cover it, the one that starts latest; of those, the
   one that ends earliest; of those, the first by key. Maximal runs of
   consecutive characters with the same innermost span are blocks.
   Characters under no block span form paragraphs of their own. A block
   span that covers no character is a block too, an empty one, at its
   place among the others: an empty paragraph is a row one line high, and a
   line of its own in the plain-text face. Blocks at one place are ordered
   by key.
4. *Style.* A block's style is the text's (Appendix A), then the defaults
   of its span's role, then the span's own properties. Block spans that
   enclose it apply first, outermost first: their indents add and their
   other properties are inherited.
5. *Runs.* Within a block, each character's style is the block's, changed
   by each inline span covering it, in order of start and then of key.
   Characters under a `markup` span are left out. Maximal sequences of one
   style are **pieces**. An `embed` character whose child is a block ends the
   lines before it and contributes the child's rows, composed at the
   block's width; any other embedded child is an inline box, of its own
   width and height, in the list of runs.
6. *Lines.* The kernel breaks lines; no host does.
   - *Levels.* The characters' embedding levels are those of the Unicode
     Bidirectional Algorithm (UAX #9), with the block's `direction` as the
     paragraph direction, `auto` meaning the first strong character's.
   - *Opportunities.* A line may end where the Unicode Line Breaking
     Algorithm (UAX #14) allows, with its default rules and no tailoring;
     an inline box may be followed or preceded by a break; U+000A in a
     `code` block, and U+2028 anywhere, end a line. In a `code` block
     lines end nowhere else.
   - *Fill.* The kernel asks `measure` (§9.3) for the advance of each piece
     up to each opportunity in it. A line takes content up to the last
     opportunity at which what precedes it, less trailing spaces, is no
     wider than the width left after indents. If the first opportunity is
     already too far, the line ends at the last place before it that fits
     and is not before a combining mark or a joiner (classes CM and ZWJ),
     taking at least one character.
   - *Fragments.* A line's content is cut into fragments, each of one piece
     and one level, and put in visual order by rule L2 of UAX #9. The
     kernel asks `measure` for each fragment's own advance. Fragments are
     placed left to right, the line starting at the indent for a
     left-to-right block and ending at it for a right-to-left one; `align`
     moves the line within whatever width is left over.
   - *Height.* The row's height is the largest, over the line, of each
     fragment's size × `line` and each inline box's height. Its baseline
     lies below the row's top by (height − ascent − descent) ÷ 2 + ascent,
     with the largest ascent and descent on the line. An inline box sits
     with its bottom on the baseline.
7. *Items.* Each fragment is a `text` item with `dir` from its level, whose
   `src` is an anchor to exactly its characters, by element boundaries,
   with `u` when the text is in another universe. A list item's marker is a
   `text` item on the first line's baseline, measured like any fragment and
   ending 0.4 of the size before the indent. A numbered item's number is
   one more than that of the nearest earlier item of its level, if no
   heading and no item of a shallower level lies between them; otherwise it
   is 1, or the item's `start`. An underline or a strike is a `path` item:
   a line 0.06 of the size thick, 0.1 of the size below the baseline or 0.3
   above it, in the text's color.
8. *Spacing.* The gap of a block's first row is the larger of the space the
   block asks before itself and the space the block before it asked after
   itself. Its other rows have no gap. The rows of a heading may not end a
   page.

The data for both Unicode algorithms is that of Unicode 16.0. A later
version is a new version of the text profile (§1.6).

**A view** is the rows stacked from the top, each below the last by its
gap.

**Pages.** Given rows, and the height available on a page — the page's
height less its top and bottom margins — pages are filled in order:

1. Starting a page at row *i*, take rows while they fit. The gap of the
   first row on a page does not count. A row taller than a page is taken
   alone, and is clipped. Let *j* be the first row not taken.
2. Move *j* back while either of these applies, until neither does.
   (a) Row *j* − 1 may not end a page: *j* becomes *j* − 1.
   (b) Rows *j* − 1 and *j* are lines of one block: if the block has three
   lines or fewer, or fewer than two of its lines would remain on this
   page, *j* becomes the block's first line; otherwise, if only the block's
   last line would move to the next page, *j* becomes *j* − 1.
3. If that would leave the page empty, *j* is as step 1 left it.
4. The page is rows *i* to *j* − 1, and the next page starts at *j*.

Each page is a region of the page's size, clipping, that holds its rows at
the margins. A header and a footer, if given (Appendix A), are composed at
the width between the side margins with `setting("page")` and
`setting("pages")`, and placed in the top and bottom margins, one line from
the rows. Breaking pages never changes a line: lines are broken once, for
the page's width.

- **[V4]** Composition is a function of the description, the sampling
  parameters, the settings and the replies of `measure`. Given
  the same of each, every kernel produces the same display list. Where two
  hosts measure the same text differently — other fonts, other shaping —
  its lines, and so its pages, may differ between them. With the same
  fonts and one renderer they do not (§8.4).

Not yet an algorithm, and not exercised: floats (§7.2) and hit testing.
The line-breaking steps above replace a host operation that an earlier
draft and the measurement spike used; they have not themselves been run.

---

### 7.8 Portals

A **Portal** (`ufo.portal`) is a pane in a parent that presents one other
object. Each Portal is an **occurrence**: an object in its own right, with
its own identity, distinct from what it presents.

| Property | Value |
| --- | --- |
| `of` | what is presented: a ref (the object, as it now is); an anchor (a region of it as it now is, so that it follows edits); a pin (the same, marked when what it shows has changed since the pin was made, §4.4); an anchor that names a commit (§1.8) — exactly what was there, in another universe or in an earlier state of this one, and for a universe object, the face its `primary` root names; or `arg` (§7.6) |
| `face` | preferred face of the target: a ref, or for a target in another universe an anchor, to a face object there; or a `medium` hint; absent lets the reader choose |
| `with` | map from names to values: what this Portal gives to what it presents (§7.6) |
| `place` | how it sits in the parent: `inline`, `block`, `float-start`, `float-end` (in a flow); by `x`, `y`, order (in an `absolute` group); by cell (in a `grid`); by `at`, an anchor into the space its parent surface presents (§7.6) |
| `w`, `h` | authored size |
| `align`, `fit`, `crop` | alignment in the available space; `contain`, `cover`, `fill` or `none`; fractions cut from each edge |
| `label` | accessible name; also what the plain-text face shows |

A Portal's position is its place in its parent: in a text, the character
covered by its `embed` span; in a group or pane, its entry among the
children; in time, the interval of the clock that holds it. Each is
addressable by an anchor and survives edits by the rules of §4.3. A Portal
has no timing of its own: how its target's time relates to its parent's is
the clock it is placed under (§4.5).

- **[O1] Inert.** A Portal is data. A reader that does not interpret Portals
  shows the label. Nothing is presented, decoded or run until a reader
  chooses to present the target.
- **[O2] Parents size children.** The parent gives the Portal its width, and
  the Portal's own `h` its height; the target is presented inside that
  rectangle by `fit`. A Portal that states no height takes the height its
  target's rows need at that width, as a text does (§7.7). A target never
  sets its Portal's width, nor its height where one is stated.
- **[O3] Occurrences are never shared.** Duplicating a Portal, by any means,
  gives the copy a new identity. Both may present the same target.
- **[O4] Missing targets.** A Portal whose target is absent or unavailable
  shows an inspectable placeholder at the authored size.
- **[O5] One drop, one owner.** Content dropped over nested Portals is claimed
  by exactly one: the deepest that accepts it.
- **[O6] No stale binding.** An import started for a Portal names that
  Portal's identity and the target it had; the change that binds the
  result gives that target as `old`. If the Portal no longer exists or has
  changed target when the import completes, **L4** refuses the binding; the
  imported asset remains in the universe, unreferenced.
- **[O7] Guarded nesting.** A reader tracks the chain of objects currently
  being presented, by revision hash and across universes. An object already
  on the chain is shown as a link, not expanded. The limits of **C13** apply.
  A global "already seen" set MUST NOT be used: the same object may
  legitimately appear in independent places.
- **[O8] Other universes are verified and read-only.** A target in another
  universe is verified record by record like any file, presented read-only,
  and given no authority by the universe that presents it.
- **[O9] Edits are ordinary changes.** Inserting, moving, resizing or
  rebinding a Portal is one change. Pointer motion is not history.
- **[O10] Authority is never inherited.** A Compute-let presented through a
  Portal runs under the presenting reader's sandbox with only what that
  person grants (§14.3).

**Transclusion** is a Portal whose `of` is an anchor or a pin to a region of
another object, in this universe or another. The presented content remains
what its own Chronicle says it is: `why` on any part of it answers from the
source's history. With an anchor the Portal shows the region as it now is.
With a pin it shows the same, and says when what it shows has changed
since the pin was made. With an anchor that names a commit — of another
universe, or an earlier one of this — it shows exactly what was there,
which cannot change beneath it; a later state is offered as an update
(**C9**).

## 8. Faces

### 8.1 Three ways a face appears

A **face** is a presentation of a universe, or of an object in it. Every
face is produced in one of three ways, and a reader MUST show the person
which.

| Kind | Produced | Stored | Adds information |
| --- | --- | --- | --- |
| **sampled** | by the kernel composing authored description, on demand | no | no |
| **carried** | once, as a **rendition**: an asset derived from the description and kept beside it | yes | only if a model made it |
| **transmuted** | by AI, as a **transmutation**: new described objects derived from others | yes, as objects | yes |

The classification is read, not declared, from the derivation (§5.3) of
what the face presents: *carried* if it is an asset with a derivation;
*transmuted* if it is described objects with a derivation that a model
performed, whatever its `how`; otherwise *sampled*. A transmuted face is itself description,
so it is then sampled like any other, and it remains transmuted however
much a person edits it afterward: the attribution of each part says who
wrote what. A carried face made by a model — synthesized narration, a
generated image — is carried, and its origin says it came from a model. The
reader shows both facts: how the face is produced, and where its content
came from.

- **[S1]** Viewing a face writes nothing to the universe.
- **[S2]** For a carried or transmuted face, the reader MUST show whether its
  derivation is current or stale (§4.4).
- **[S3]** A stale carried face MAY be shown, marked as reflecting an earlier
  state. It MUST NOT be shown as current.

A **projection** is anything generated on demand and never stored: a display
list, an outline, a listing for an agent, a difference between revisions. A
sampled face is a projection. Projections have no authority.

### 8.2 The face registry

A face object has type `ufo.face` and properties:

| Property | Value |
| --- | --- |
| `of` | ref to the object presented; absent for a face that is offered but not yet made |
| `recipe` | for a face not yet made: what `derive` would be given to make it (§5.3) — `sources` as anchors, `how`, and the origin's `model`, `prompt` and `parameters`. A reader lists such a face as available on request. The prompt it names is content: a live object refers to it |
| `medium` | a hint for the person's choice: `document`, `pages`, `text`, `data`, `image`, `video`, `audio`, `deck`, `space`, `application` |
| `label` | text |
| `sampling` | map of sampling parameters that fix the face: viewport size, page size, time range, picture rate, camera (see §8.4) |

The universe object's `faces` lists the faces the universe offers. A reader
presents that list as a choice. A reader MAY also offer faces it can sample
without a registry entry — the plain-text face and the data face exist for
any universe that holds text or data.

### 8.3 The plain-text face

The **plain-text face** of an object is its text in reading order, without
layout or style. It is Unicode text, in lines ended by U+000A.

| Object | Its plain text |
| --- | --- |
| a text | one line for each block (§7.7), in order: the block's characters, without those under `markup` spans. A list item's line begins with two spaces for each level above the first, then its marker — `•`, its number and a full stop, or its literal text — and a space. An empty line separates two blocks unless both are list items. An embedded child contributes its own plain text in place: within the line if that is a single line, otherwise as lines of its own |
| a group, pane or clock | the plain text of its children, in list order, each starting a new line; for a group under `each`, that of each copy of its template |
| a Portal | the plain text of what it presents — the object, or the region its anchor names — where that is in this universe or in a universe nested in the file (§1.8). Content from another universe is marked: a line holding the Portal's label and a colon, then the content with `> ` before each of its lines. Where the target is in a linked universe, where the chain of **O7** already holds it, or beyond the reader's limit on nesting (§3.1): one line, the Portal's label, followed for a linked universe by a space and `(ufo:` the commit hash in lowercase hexadecimal `)` |
| a data object | its tables in key order. For each: a line of the columns' labels, then a line for each row, in the table's order; cells in the order of their columns, separated by U+0009. A cell that holds a formula gives its value. A tab or a line break inside a cell is written as a space |
| a surface | the plain text of what it presents, then that of its children |
| anything else | its label |

The plain-text face of a universe is that of the object its `primary` root
presents. It is a function of the file: a linked universe contributes its
label and reference whether or not a reader could find its records.

- **[S4]** Every reader MUST be able to produce the plain-text face of any
  object. It is what a text editor, a search index, a screen reader and a
  language model have in common.

### 8.4 Export is sampling

An **export** samples a face with stated parameters and encodes the result
at the border (**B3**). Nothing is converted; the description stays where it
is.

| Export | Sampling | Parameters |
| --- | --- | --- |
| Plain text | the plain-text face | — |
| Table file | a data object's rows | columns, order |
| Image | one moment, one viewport | time, viewport, resolution |
| Paged document | the flow, broken into page-sized panes | page size, margins |
| Video | a span of time at a picture rate | time range, picture rate, viewport, resolution |
| Audio | a span of time, samples only | time range, sample rate |
| Original bytes | an asset, exactly | — |

There are two **determinism tiers**.

- **Live.** Presentation uses the host's text shaping and rasterization. Two
  readers produce equivalent results: the same content, structure, order and
  layout decisions made by the kernel, with glyph shapes and anti-aliasing
  as the host renders them.
- **Canonical.** A canonical export is reproducible given a named renderer.
  **[S5]** The same universe, face, parameters and renderer MUST yield
  identical bytes on every reader; this follows from **M5**.

The **renderer** is a component identified by its hash, like any other
(**K3**): a Compute-let with no surface, which the reader runs and
addresses on one port. It does three things, and takes nothing from the
host but bytes:

| Message to the renderer | Reply |
| --- | --- |
| `{measure: measure-request}` | a `measure-reply` (§9.3): during a canonical export the kernel sends `measure` here, not to the host |
| `{render: {list, w, h, scale}}` | `{pixels: {mem, w, h}}`, and `{samples: {mem, n, hz, channels}}` if the list sounds: the display list of §9.2, executed |
| `{encode: {format, parameters}}` | `{bytes: {mem, len}}`: what was last rendered, encoded |

Replies name ranges of the renderer's own memory, which the reader reads.
The renderer reads the fonts, images and other blobs a display list names
through one capability, `blobs`, whose scope is those hashes and whose one
operation is `read(hash, offset, length)`.

A renderer declares what it reproduces: which display-list items, and which
formats of raster, samples and font. An export is canonical only if all it
draws is within that declaration; otherwise the reader does not call it
canonical, and says which item prevents it. A surface drawn through `gpu`
is within it only for a renderer that carries those operations in software
(Appendix E). The export's parameters name the renderer by hash, and a
canonical export kept as a rendition records them in its origin (§5.3).

A renderer is used only when a canonical export is requested. It is never
part of an ordinary file's player, is not counted in the player's budgets
(§11.1), and nothing else in a reader depends on it. A universe that wants
its canonical exports to be possible anywhere carries one under
`components.renderer`; otherwise a reader holds one, or finds one by a
location hint (§2.5). A web envelope opened as a page reaches no network
(§13.2), so it makes canonical exports only with a renderer it carries.

This specification defines no rasterizer and no shaping algorithm, and
chooses no renderer: an existing engine may fill the role, and a different
one may later, without any file changing its meaning. The engines measured
so far, for text and paths alone, come to about 0.9 MiB; decoders and
encoders for the formats of §9.5 would add to that, and have not been
measured.

An export is a fixed performance. It carries no structure, history or
behavior, unless it is an envelope (§13.2). Importing an exported file creates
a new asset; it does not recover the description.

## Appendix A. Properties of the primitives

All lengths are in the units of the enclosing pane. Colors are sRGB with
alpha, as four floats from 0 to 1. Properties in *italics* say what a thing
is and MUST NOT be formulas (§7.1); all others may be.

**Common to all:** `scales` (§4.3), `label`, `role`, `lang`, `opacity`, `visible`, `on` (map
from an input event name — `press`, `enter`, `leave`, `key`, `change` — to
`{set: setting name, to: formula}`, `{propose: operations}` (§7.6), or
`{deliver: true}` for surfaces), `from` (§5.3). Of the events: `press` is
a pointer going down and up on the item, or Enter or Space while it has
focus; `enter` and `leave` are the pointer's; `key` is a key going down
while it has focus; `change` is an `edit` event delivered to it (§9.2).

**In a parent:** `place` (including `at`, an anchor, for a child of a
surface), `x`, `y`, `w`, `h`, `row`, `col`, `span`, `align`, `grow`,
`margin`.

| Primitive | Properties |
| --- | --- |
| Text | *`chars`*, *`spans`*, *`syntax`* (§5.1); `editable` (§7.6); and default style: `font` (list of family names or a ref to a font asset), `size`, `weight`, `slant`, `color`, `direction`, `line`, `align`, `decoration`. Spans override these |
| Path | `d`: list of segments `[M x y]`, `[L x y]`, `[C x1 y1 x2 y2 x y]`, `[Q x1 y1 x y]`, `[Z]`; `fill` and `stroke`: a color or a gradient `{kind, stops, from, to}`; `width`, `join`, `cap`, `dash`, `rule` |
| Raster | *`source`*: ref to an asset or surface; `time` (for video sources); `crop`; `fit`; `smooth` |
| Samples | *`source`*: ref to an asset or surface; `gain`; `pan`; `time` |
| Pane | *`children`*; `w`, `h`; `transform`: six floats; `clip`: a path or boolean; `background`; `scroll` |
| Group | *`children`*; `layout`: `flow`, `grid` or `absolute`; `direction`; `gap`; `rows`, `cols` (for `grid`); `each`, `as` |
| Clock | *`children`*; `start`, `end`, `rate`, `offset`, `repeat`, `mode`; `drive` (formula, for `held`) |
| Portal | §7.8 |
| Surface | *`computelet`*: ref; *`of`*: ref to the object it presents, if it presents one; `w`, `h`; *`ports`*: map from port name to the surface it connects to; *`children`* |
| Data | *`cols`*: map from column key to `{label, type, order}`; *`rows`*: map from row key to map from column key to value, each row out of line when large; a cell may hold a formula; `sort`: list of row keys giving the default order; *`axes`*: map from axis name to `{kind, low, high, unit}` for continuous axes the object offers beyond its keyed ones, and *`tables`*: for an object holding several tables, map from table name to `{cols, rows}` |

**Types of these properties.**

| Properties | Value |
| --- | --- |
| `x`, `y`, `w`, `h`, `gap`, `size`, `width` | a float, in the units of the enclosing pane |
| `margin` | one float, or four: top, right, bottom, left |
| `opacity`, `gain` | a float from 0 to 1; `pan` from −1 to 1 |
| `visible`, `smooth`, `slant`, `editable` | a boolean |
| `place` | `block`, `inline`, `float-start`, `float-end`, or `{at: anchor}` for a child of a surface |
| `row`, `col` | an integer from 0; `span` is `[rows, cols]`, `[1, 1]` if absent |
| `align` | `start`, `center` or `end`; in a cell, one value or two, inline then block |
| `grow` | a float: the share of a flow line's leftover width this inline child takes |
| `fit` | `contain`, `cover`, `fill` or `none`; `crop` is four fractions from 0 to 1: top, right, bottom, left |
| `children` | a list of refs, set as a whole; for a surface, a map from key to ref |
| `layout` | `flow`, `grid` or `absolute`; `rows`, `cols` are lists of track sizes (§7.7) |
| `transform` | six floats (**W1**); `clip` is a boolean, or a path's `d`; `background` is a color or gradient; `scroll` is `none`, `x`, `y` or `both` |
| `fill`, `stroke` | a color, or a gradient `{kind: linear or radial, stops: [[offset, color], …], from, to}` with points in the item's own space |
| `join`, `cap`, `rule` | `miter`, `round`, `bevel`; `butt`, `round`, `square`; `nonzero`, `evenodd`; `dash` is a list of floats |
| `font` | a list of family names and refs to font assets; `weight` 100 to 900; `direction` `ltr`, `rtl` or `auto`; `line` a multiple of `size`; `decoration` `none`, `underline` or `strike` |
| `source`, `computelet`, `of` | a ref; `time` is an integer of flicks |
| `start`, `end`, `offset` | integers of flicks; `rate` two integers; `repeat` an integer or `forever`; `mode` `locked`, `free` or `held` |
| `cols` | each `{label, type, order}`: `type` is `number`, `text`, `boolean`, `time` or `any`; `order` an integer; `sort` is a list of row keys |
| a page's header and footer | sampling parameters `header` and `footer`: refs to groups (§7.7) |

**Axes.** A sequence or keyed axis has the name of the property it is bound
to. The continuous axes and their extents are:

| Type | Axis | Extent |
| --- | --- | --- |
| Clock | `t` | `start` to `end`, in flicks |
| Pane, group, surface, raster, path, Portal | `x`, `y` | 0 to `w`, 0 to `h` |
| Raster or samples from a timed source | `t` | 0 to the source's duration, in flicks |
| Data | those it declares in `axes` | as declared |
| Surface | those its Compute-let declares in `axes` (§12.1) | as declared |

**Defaults of a text.** Where a text does not say: `font` is `["serif"]`,
`size` 16, `weight` 400, `slant` false, `color` opaque black, `line` 1.4,
`align` `start`, `direction` `ltr`. *One line*, below, is the text's `size`
× `line`.

**Default presentation of text roles.** A block span is laid out as a block
in the flow (§7.7). Unless the span says otherwise:

| Role | Default |
| --- | --- |
| `paragraph` | space after equal to one line |
| `heading` | `level` 1 to 6; size 2, 1.5, 1.25, 1.1, 1, 1 times the text's size; weight 700; space before one line and after half a line; its lines do not end a page |
| `item` | indent of 1.5 times the text's size per `level`; space after a quarter of a line; a marker before the first line: `marker` is `bullet`, `number` (counting consecutive items at the same level) or literal text |
| `quote` | indent of the text's size at both sides; space after one line |
| `code` | a monospaced font; line breaks kept; no wrapping |
| `emphasis`, `strong` | slant true; weight 700 |
| `link` | `href` is followed on `press` |
| `markup` | not presented |

A table within a text is a `grid` group at an `embed` span.
