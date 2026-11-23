# The Universal File Object (UFO) Specification: The player

**Version 0.8 — draft for review. Nothing here is frozen. There is no implementation: only test vectors, throwaway code and test readers.**

This part specifies what presents a universe and lets it be worked on: the kernel, the drawing contract between kernel and host, the host interface and its capabilities, the onboard tools, the light cone, the agent interface, and the budgets all of it is held to.

This is one part of the specification of the UFO format, and is written to
be read on its own by someone who has read the core, [SPEC.md](SPEC.md),
or its summary, [CORE.md](CORE.md). The words MUST, MUST NOT, SHOULD,
SHOULD NOT and MAY are used as in RFC 2119 and RFC 8174; a rule that
carries a label such as **[C3]** is a requirement in full; a term in
**bold** is being defined, and every term is listed in the glossary
(§6.2). What has been exercised, and how, is in
[VISION-TRACE.md](VISION-TRACE.md).

**What it takes from the core.** Records, objects, changes and conservation (§1); the pack (§2); anchors and pins (§4); the Chronicle (§5.4). From the presentation part: composition (§7.7), whose result the drawing contract carries.

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

## 9. The player

### 9.1 Four parts

Every UFO is presented by a **player** of exactly four parts.

1. The **kernel**: one program, compiled once to WebAssembly, that reads the
   pack, verifies records, resolves refs and anchors, checks and applies
   changes, evaluates formulas, performs layout and composes a display list.
   It knows the core and the primitives. It knows no medium, application or
   foreign format.
2. The **presenters**: what turns display-list items into output. There are
   four **base presenters** — for text, path, raster and samples items — and
   they are the host's own drawing and audio facilities, reached through the
   binding. Anything else that draws is a **carried presenter**: a
   Compute-let attached to a surface (§12.1), carried in the universe that
   needs it, which itself draws by emitting display-list items or through
   the `gpu` capability.
3. The **binding**: the host-specific code that connects the kernel to a
   host. It supplies bytes, executes display lists with the host's
   facilities, delivers input, and provides the capabilities the host has.
   It is the only part that differs by host.
4. The **universe**: the description. Everything that makes one UFO differ
   from another is here, as data.

A base presenter is not a WebAssembly component, because a component that
only forwarded each item to a host call would be an empty layer.

- **[K1] One implementation.** The kernel and every carried component exist
  as one compiled WebAssembly artifact each, identified by hash. The
  project's readers — in a browser, as an installed web app, native, on the
  command line and behind the agent interface — all run those same
  artifacts, and MUST NOT contain a second implementation of any kernel
  function in any language. Independent implementations of the format by
  others are welcome and are measured against the same conformance suite
  (§11.2).
- **[K2] No domain knowledge outside the kernel.** A binding and any native
  shell know the display-list items of §9.2, the input events and the
  capabilities of §9.3, and the baseline media types of §9.5. They MUST NOT
  contain logic specific to any object type, property, profile, operation
  or foreign document format, and they do not parse a pack or an envelope:
  the kernel locates the pack within the bytes of a file (§13.2).
- **[K3] Carried by content.** A component is named by its hash. A universe
  MUST NOT depend on the copy it carries being the one used: a reader that
  holds a component with the same hash uses its own.
- **[K4] Pay for what you use.** A universe carries only the components its
  content requires. A universe with no 3D scene carries no scene presenter,
  and no ordinary universe carries a renderer for canonical exports (§8.4). The universe object's
  `components` names those it does carry (§1.6), so that copying and
  compaction keep them.

The kernel is itself a sandboxed component: it has no authority over the
host except through the host interface.

### 9.2 The drawing contract

To present, the kernel **composes**: given a face (§8), an available size,
the root clock's time and the presentation state, it produces a **display
list**. Executing display lists is the whole of what a host draws and
plays, and this section is the whole of what a binding knows about
presentation. It is part of the frozen host interface (§9.3): once
published, items are never removed or changed.

A display list is an encoded value (§1.2): a list of items, each a list
whose first element names its kind. The schema is in Appendix C.

| Item | Fields |
| --- | --- |
| `push` | `m`: six floats, a transform; `clip`: a rectangle or a path; `alpha`: 0 to 1. All optional |
| `pop` | none; ends the innermost `push` |
| `text` | `s`: the characters of one line; `x`, `y`: where its baseline starts; `font`: a list of family names and font assets, in order of preference; `size`; `weight` (100 to 900); `slant` (boolean); `color`; `dir`: `ltr` or `rtl`; `adv`: the advance the host reported for this line |
| `path` | `d`: segments `M`, `L`, `Q`, `C`, `Z` with their coordinates; `fill`, `stroke`: a color or gradient; `width`; `join`: `miter`, `round`, `bevel`; `cap`: `butt`, `round`, `square`; `dash`; `rule`: `nonzero` or `evenodd` |
| `raster` | `source`: a blob in a baseline format, a surface's identifier, or `{mem, w, h}` naming RGBA pixels in the emitting component's memory; `from`, `to`: source and destination rectangles; `smooth`; and for video `t`, a time in flicks, and `rate`, two integers |
| `samples` | `source`: a blob in a baseline format, or `{mem, n, hz, channels}` naming samples in the emitting component's memory; `at`: when on the root clock the source's `t` is to sound; `t`; `rate`; `gain`; `pan` |
| `surface` | `id`, `to`: a rectangle handed to a running Compute-let, which fills it with its own display list |
| `hit` | `id`, `shape`: a rectangle or path; `events`: which input events it takes |

Every item MAY also carry `src`, the anchor of the description it came
from, and `label` and `role`, from which the binding builds the host's
accessibility tree. `role` is one of `heading`, `paragraph`, `list`,
`item`, `link`, `button`, `image`, `table`, `row`, `cell`, `input` and
`region`, which every host's accessibility interface has, with `level` for
a heading or an item; any other role reaches the host as a plain label. A binding does not interpret `src`; it hands it back
with input, so that anything on screen can be traced to its object and from
there to its origin (§10.1 `why`).

- **[W1] Space.** The origin is the top left of the surface, `x` to the
  right, `y` downward, in CSS reference pixels. A transform `[a b c d e f]`
  maps `(x, y)` to `(a·x + c·y + e, b·x + d·y + f)`. Each `push` composes
  its transform with, and intersects its clip with, those in force; `pop`
  restores them.
- **[W2] Order.** Items are painted in list order, each over what came
  before, by source-over compositing in sRGB with premultiplied alpha.
- **[W3] Paths.** A host fills and strokes exactly the stated geometry.
  Strokes are centered on the path; the miter limit is 4. After
  anti-aliasing, coverage MUST match the exact geometry to within half a
  device pixel at every edge.
- **[W4] Text.** A host draws the characters of `s` on one line starting at
  the baseline point, in the first font of the list it has, falling back
  through the list and then to its own default. It MUST NOT break, wrap,
  justify or truncate the line: the kernel has already broken it, using the
  host's own measurements (§9.3 `text`), and `adv` MUST equal the advance
  the host then draws.
- **[W5] Rasters.** A host decodes the source, maps the `from` rectangle to
  the `to` rectangle, with bilinear filtering if `smooth` and nearest
  neighbor if not. For video it shows the picture at `t`; if `rate` is not
  zero it goes on advancing at that rate until the next display list
  arrives, which is the only thing a host knows about playback.
- **[W6] Samples.** A host sounds the source so that its position `t` is
  heard at root-clock time `at`, advancing at `rate`, scaled by `gain`.
- **[W7] Input.** A host reports input as events (below), each with the `id`
  of the innermost `hit` item under it, coordinates local to that item, and
  the root clock's time.
- **[W8] Nothing else.** A host executes these eight kinds and no others,
  and adds nothing of its own to a surface. An item of a kind it does not
  know is skipped and logged.

**Input events**, also encoded values: `pointer` (`down`, `up`, `move`,
`enter`, `leave`; position; buttons; pointer identifier), `key` (`down`,
`up`; the key's name as the UI Events specification gives it; modifiers),
`text` (characters committed by the host's input method), `edit` (for an
editable region: the range replaced and its replacement, §7.6), `scroll`,
`focus`, `resize`.

**Conformance of a binding** is tested against this section alone: a corpus
of display lists with reference results. Path and raster items are compared
to reference images, requiring every channel of at least 99.5% of pixels to
be within 8 of 255. Text items are tested for position and advance, not for
glyph shapes, which belong to the host's fonts. Input is tested by
synthetic events against `hit` items.

A canonical export does not use the host for drawing at all: the same
display list is executed by a renderer named by hash (§8.4).

Composition is a projection (§8.1): the display list is never stored.

### 9.3 The host interface

The **host interface** is the complete set of functions a sandboxed
component — the kernel, a presenter, a Compute-let — may import. It is small,
and once published it is frozen: functions are never removed or changed.

Base functions, available to every component with no grant:

| Function | Purpose |
| --- | --- |
| `draw(list)` | submit the component's display list for the current tick, in its own surface's coordinates |
| `input(buffer) → count` | read the input events delivered since the last call (§9.2), each with a clock time |
| `time() → flicks` | the component's clock time (**T1**) |
| `random(buffer)` | fill with random bytes; from a recorded seed during replay |
| `send(port, message)` / `receive(port, buffer) → length` | exchange messages on a port the component was given |
| `checkpoint()` | ask the reader to record the component's state now (§12.2) |
| `capability(name) → handle` | obtain a granted capability, or learn that it is absent or denied |
| `call(handle, operation, in, out) → status` | use a capability. The status is *done*, with the reply in `out`; *failed*; or *pending*, in which case the reply arrives later as a message on the handle |
| `log(message)` | emit a diagnostic the reader may show; has no other effect |

The reader calls two functions the component exports: `tick(time)`, once
each time the presentation is drawn, and `message(port)`, when a message or a pending reply
arrives.

Every capability operation may answer *pending*. Hosts differ in what they
can answer at once — a browser decodes media and reads files only
asynchronously — so a component is written to continue when the reply
comes. During replay (§12.2), replies are delivered from the record at the
same points.

A **port** is a small integer naming one end of a channel: to the component
that presents this one, to a child it presents, or to another Compute-let
the surface's `ports` property connects it to. A message is one encoded
value of at most 64 KiB.

A **capability** is a named, granted authority. Everything beyond the base
functions is a capability.

**The contract.** It is the same for every capability, and it is complete:
adding a capability adds a row to the table below and a set of operations,
and changes nothing here.

*Request.* A Compute-let's manifest (§12.1) lists its requests. Each is
`{capability, scope, required, why, without}`: the capability's name; a
scope in that capability's own terms; whether the program cannot run
without it; a sentence for the person saying why it is wanted; and a
sentence saying what the person loses if it is refused.

*Offer.* When a program is about to start, the reader works out, for each
request, one of four states:

| State | Meaning |
| --- | --- |
| *granted* | the host has it and the person has allowed it, for this scope or a wider one |
| *undecided* | the host has it and the person has not yet been asked |
| *denied* | the person refused, or revoked |
| *absent* | the host does not have it |

*Asking.* For each *undecided* request the reader asks the person, showing
the program's hash, who sealed it if anyone, the capability in plain
words, the exact scope, and the program's `why` and `without` as the
program's own words. The person answers yes, no, or yes with a narrower
scope, for this session or until revoked. A reader MUST NOT ask on merely
opening a universe: it asks when the person acts to run the program.

*Start.* If every required request is *granted*, the program starts. If
any is *denied* or *absent*, it does not: its poster is shown at its
authored size with a plain statement of what is missing and, if denied, the
means to grant it (**H2**). Optional requests never prevent a start.

*Use.* `capability(name)` returns a handle or the state. Every `call` on a
handle is checked against the granted scope; a call outside it fails and
is logged. A program MAY call `capability` again later: the answer can
change while it runs.

*Revocation.* The person can revoke any grant at any time. The handle
becomes invalid at once, calls on it fail with *revoked*, and the program
receives a message on the handle's port. A program that held a required
capability is stopped at the end of its current call and its poster shown.

| Capability | Scope | Gives | If absent or denied | Held by default by |
| --- | --- | --- | --- | --- |
| `store` | one pack | read and append its bytes; the exclusive lock | no reader | the kernel only |
| `text` | — | `measure`, `locate`, `edit` (below) | no reader | the kernel only |
| `media` | — | decode a baseline asset (§9.5) to pixels or samples at a time | the asset's poster or label | the kernel only |
| `inflate` | — | decode and encode DEFLATE (§2.1) | compressed records are unavailable | the kernel only |
| `verify` | — | check an Ed25519 signature | seals are shown as unchecked | the kernel only |
| `engine` | — | run a module in the host's WebAssembly engine | no Compute-let runs; posters are shown | the kernel only |
| `blobs` | a set of hashes | read those blobs | — | a renderer (§8.4) |
| `encode` | — | encode pixels or samples to a baseline format, or pages to PDF | that export is not offered | the kernel, on export |
| `objects` | an anchor, and `read` or `propose` | read objects within the anchor; submit changes to them, which are verified like any change | the program runs on what it carries | nobody |
| `present` | the surface's own children | present a child into a raster; route input to it | children are not shown | a Compute-let whose surface has children |
| `gpu` | the surface | accelerated graphics (Appendix E) | poster, or the program's own fallback through `draw` | nobody |
| `audio` | the surface | a low-latency stream of generated samples | silence | nobody |
| `input.raw` | the surface | unbuffered pointer, gamepad and device input | ordinary `input` events | nobody |
| `time.precise` | — | timing finer than a tick | tick times | nobody |
| `net` | a list of origins | requests to those origins | the program runs offline | nobody |
| `camera`, `microphone` | the device | capture while the surface is visible | none | nobody |
| `files` | one file or folder the person picks | read it, or save to it | the reader's own save | nobody |

`text` has three operations. `measure`: given a piece — its characters, font
list, size, weight, slant and direction — and a list of offsets into it,
the advance of the piece's text up to each offset, as the host would draw
it, and the piece's ascent and descent. That is all a host contributes to
layout: where lines break and how they are ordered is the kernel's (§7.7).
`measure` answers at once, never *pending*, as do `inflate` and `verify`.
For a canonical export the renderer answers it in the host's place (§8.4).
`locate`: given a fragment as it was drawn and a horizontal offset within
it, the nearest character position. `edit`: mount or unmount the host's editing surface on a
rectangle with given text (§7.6). The operations of `objects` are the
projections and actions of §10.1 and §10.3, confined to the scope. Those of
`present` are `raster` (child key, width, height → a raster source) and
`deliver` (child key, input event). The operations of `gpu` are sketched in
Appendix E.

The kernel's own capabilities are part of the frozen interface, and their
operations are these:

| Capability | Operations |
| --- | --- |
| `store` | `size`; `read(offset, length)`; `lock`, `unlock`; `append(bytes)`; `sync`, returning when what was appended is durable; `truncate(length)` (**P7**); `replace(bytes)`, which writes a whole new file and puts it in the old one's place atomically (**P5**, §2.6) |
| `inflate` | `inflate(bytes, length)`; `deflate(bytes)` |
| `verify` | `ed25519(key, message, signature)` |
| `media` | `info(source)`: its kind, pixel size, duration and sample rate. Pixels and samples never enter the kernel; the host decodes when it executes a raster or samples item (§9.2) |
| `encode` | `image(format, parameters)`, `audio(format, parameters)`, `video(format, parameters)`, `pages(parameters)`: the host encodes what it has just drawn or played for an export |
| `engine` | `load(bytes)`, giving a module or the engine's refusal of it as invalid; `start(module, snapshot)`; `call(instance, export, arguments, fuel)`, giving results, or a trap and its kind; `read` and `write` of an instance's exported memory, globals and table; `drop` |

A kernel is itself WebAssembly and cannot run a module: `engine` is how it
asks the host's engine to. The operations of `audio`, `input.raw`,
`time.precise`, `net`, `camera`, `microphone` and `files` are not yet
written.

- **[H1]** A component obtains a capability only if its manifest requests it
  (§12.1), the person has granted it (§14.3), and the host offers it.
- **[H2] Degradation.** Every capability has a defined result when absent or
  denied, given in the table. A program whose required request is not
  granted is replaced, in place and at its authored size, by its poster and
  a plain statement; one whose optional request is not granted runs
  without it. Nothing is ever left blank or broken.
- **[H3] Narrowing.** A component holding a capability MAY ask the kernel
  for a handle with a smaller scope and pass that to a component it
  presents. It can never pass a broader one. The kernel is the first holder
  and narrows everything it passes on.
- **[H4]** New capabilities are added to this specification by name, under
  the deletion test (**V3**). Adding one never changes the base functions or
  the contract. A capability is something only a host can provide; anything
  that can be computed inside the sandbox is a Compute-let, not a
  capability.
- **[H5]** There is no other extension mechanism. Readers have no plugins,
  no registered handlers and no per-type code paths.
- **[H6]** A reader MUST show the person, at any time, every grant in force,
  and what each program has done with it during the session.

The interface is specified as plain WebAssembly imports under the module
name `ufo:host/1`, with arguments passed as offsets and lengths in the
component's memory and structured arguments encoded as values (§1.2).

The frozen surface is the ten base functions, the two exports, the drawing
contract of §9.2 and the capability contract above. The operations of each
capability are part of this specification too and are counted in §6.

### 9.4 Decode at the border, encode at the border

- **[B1]** The kernel contains no decoder for any image, audio, video, font
  or document format, and no encoder for any.

Foreign content enters a universe at the **border**: the moment of import.
Exactly one of three treatments applies, in this order of preference.

1. **Host-decodable media stay as assets.** A file in a baseline format
   (§9.5) is stored as its exact original bytes (§5.2) and decoded by the
   host, through the `media` capability, when presented.
2. **Structured documents are transmuted once.** A foreign document — word
   processing, spreadsheet, presentation, diagram, structured data, marked-up
   text — is converted to native description by any capable tool or agent.
   The original bytes are kept as an asset. The conversion is recorded as a
   derivation (§5.3) whose source is that asset.
3. **Anything else is preserved with a carried face.** The original bytes are
   kept as an asset together with a rendition in a baseline format, produced
   once at the border (§8.1): page images for a fixed-layout document, a
   still for an unknown image format. If live decoding is truly needed, the
   decoder is a Compute-let on a surface, carried only by universes that
   hold that format (**M3**).

- **[B2]** Import never discards or alters the original bytes.
- **[B3]** Export encodes at the border the same way: through the host's
  `encode` capability, or, for a canonical export, through the renderer
  (§8.4).

### 9.5 Baseline asset formats

A conforming reader presents assets in these formats through its host:

| Kind | Formats |
| --- | --- |
| Image | PNG, JPEG, WebP, GIF, and SVG presented as a static image with scripts and external references disabled |
| Audio | MP3, AAC in MP4, FLAC, PCM in WAV |
| Video | H.264 (8-bit, 4:2:0) with AAC in MP4 |
| Font | OpenType and TrueType, bare or as WOFF2 |

This list is proposed from the formats decoded by current browsers and
operating systems. It has not been tested by this project and MUST be
confirmed on every rung of the reader ladder before it is frozen. H.264 in
particular depends on the host's licensing position.

- **[B4]** An asset outside the baseline MUST be imported under treatment 2
  or 3 of §9.4, so that every conforming reader can show something for it.

### 9.6 Onboard tools

A UFO is inspected and edited with tools it carries. The **onboard tools**
are two things.

1. *Functions of the kernel*: the projections of §10.1 and the actions of
   §10.3. Because they are in the kernel, every reader on every rung has
   them, and so does every web envelope.
2. *An interface to those functions*, which is itself a universe, the
   **tools universe**: text, groups, panes and paths. It reads the
   universe being worked on with `ask` (§7.3), changes it through handlers
   that `act` (§7.6), and shows it through a Portal whose `of` is
   `arg("subject")`. The reader presents the tools universe and, by its
   own act and never at a file's instruction (**F6**), gives it the
   working universe as its subject. Nothing in a tools universe names
   any particular universe, so one tools universe, with one hash, serves
   every file. It is carried under `components.tools` as a nested universe
   (§1.8); a reader that holds the same one uses its own copy (**K3**), and
   a reader MAY substitute a newer one.

- **[K5]** A web envelope MUST carry a tools universe sufficient to: choose
  among faces; show for anything on screen its origin, evidence and
  decisions; edit text and data; add an asset; accept, reject or revise a
  contribution; verify the universe and its seals; show what will travel;
  and save or send the result.
- **[K6]** The tools interface contains no logic of its own. Everything it
  does is a formula, a change of presentation state, or an action of §10.3 on
  its subject, performed by the kernel as the act of the person using it.
  It adds no code to the binding and none to the kernel.

**What one change is.** While a person types, edits accumulate in the
reader. They become one change when the person pauses, moves elsewhere,
saves, or after a few seconds — never one change per keystroke — and
pointer motion is never a change. A change made by an agent or a tool is
committed as it is proposed.

**Undo** is a change like any other: the kernel builds the operations that
reverse a stated earlier change of the same person, verified against the
current state, and commits them with origin `tool` and the reversed change
named in `origin.context`. If later edits make the reversal impossible it
is refused (**L4**). History therefore shows both the act and its undoing.

The tools universe counts toward the envelope weight of §11.1. It is
carried under `components.tools` (§1.6).

---

## 10. Attention and agents


### 10.1 Projections for agents and people

The kernel offers these projections. They are the onboard tools' vocabulary
and the agent interface's (§10.3).

| Projection | Returns |
| --- | --- |
| `overview` | the universe's lineage, root hash, seals, faces and features, and its outline (§10.2) |
| `object(ref)` | an object's type, properties, revision and the objects that refer to it |
| `text(anchor)` | the plain-text face of a region |
| `search(query)` | objects and regions matching by type, property, text, hash, origin, actor or time |
| `history(anchor)` | the changes that produced the content of a region, newest first |
| `why(anchor)` | for a region: its origin, the evidence recorded for it and the decisions made about it (§5.4) |
| `diff(a, b)` | the operations separating two commits or two revisions |
| `expand(anchor)` | the outline of an object or region: its parts, each with its size, when and by whom it last changed, and its summary where one exists (§10.2) |
| `recipe(ref)` | for a derived object: its sources with the state of each, how it was made, by what and at whose request (§5.3) |
| `verify(commit)` | the result of the conservation check and every profile check, by validation class |
| `leaving(parameters)` | exactly what a send, share or export with those parameters would carry (**E12**) |
| `sample(face, parameters)` | a face: as text, as a display list, or as an encoded export |
| `items(ref)` | a module's functions, globals and exports, with name, signature, size, origin and tests (§12.5) |
| `unit(ref)` | a function: its signature, and its statements one to a line, each with its element identity and the change that wrote it |
| `calls(ref)`, `unit-history(ref)` | which functions call which; the changes that touched a function, newest first |

Projections for agents are dense, regular text designed for a language
model: one record per line, fields in a fixed order, hashes abbreviated to a
unique prefix with the full value available on request, no raw binary. The
rules and an example are in Appendix B. Each projection states the commit it
was computed from, so that an answer can be checked later.

---

### 10.2 The light cone

Any universe can be read from the whole at low resolution down to exact
bytes. Two layers make that possible. The first is computed and is always
there. The second is written, and is optional.

**The structural layer.** For any object or region the kernel computes an
**outline**: a bounded list of its parts, each with what a reader needs in
order to decide whether to go further. An outline is a projection (§8.1).
It is a function of the commit alone, is never stored and never stale, and
needs no model.

| Outline of | Its parts |
| --- | --- |
| a universe | its roots and faces; the universes it nests or links to; its other objects, grouped by type |
| a group, pane, clock or surface | its children, in order |
| a Portal | what it presents, followed into the universe it is in |
| a text, or a region of one | its sections: of the heading levels within it, the shallowest that has two or more headings, each section running to the next heading of that level or above. Where there are no headings, its blocks |
| a data object | its tables and columns, and its rows in ranges |
| a module | its functions |
| a function | its statements, in ranges |
| a change | its operations |

Each part is shown with its anchor; its type and its label, heading, name
or — for a block of text — its first 60 characters; its **size**, the
length of the plain-text face beneath it (§8.3), or for bytes their number;
when it last changed, by which actor and with what basis; and, if it is
derived, whether it is stale. A universe is shown with its count of objects
by type, the times of its first and last changes, and its actors.

A text with one heading or none is outlined by its blocks, and what comes
before a first heading is a part of its own. For a region of a sequence,
"last changed" is the latest change that inserted an element in it; a
removal shows only in the time of the object as a whole.

An outline lists at most 64 parts. Where there are more, consecutive parts
are shown 64 to a range, and ranges 64 to a range of ranges, each range
with the labels of its first and last parts, their number and the total of
their sizes, so that every reply is bounded and any part is reached in a
number of steps logarithmic in the number of parts. A universe's other
objects are in order of type name, then label, then object identity. `history` is
bounded the same way: the 64 newest changes, then older ones in ranges. Sizes and times are totals over what lies beneath a part;
a reader MAY keep them in a cache (§3.4) under revision hashes,
which a commit changes only along the path it touched.

**The model layer.** A summary (`ufo.summary`) condenses a stated scope in
words. It is a derivation (§5.3) with `how` `summarize`: its `from.sources`
are pins to exactly what it condenses — an object, a region, a set of them,
another universe. Beyond `from` it has:

| Property | Value |
| --- | --- |
| `line` | a text of at most 160 characters: what the scope is, and what distinguishes it from its siblings |
| `paragraph`, `page` | optionally, texts of at most 800 and 4 000 characters |

A summary belongs to a scope by its pins, and to nothing else: the tree is
the outline's. The universe object lists every summary in `summaries`
(§1.6), under the object its first source names, so that an object's
summaries are found without a search, and travel as content (§13.3).
Wherever an outline shows a part, it shows beside it the `line` of the
summary whose first source resolves, in the current revision, to exactly
that part — the most recently written, if several — and whether it is
current. A summary of a scope that is no part of the outline — a stretch
of a recording's time, a passage that a new heading has since divided — is
shown with the smallest part that contains it, with its own anchor, so
that nothing written drops out of view.

- *Who writes them.* Any writer that has a model, through `derive`
  (§10.3): a reader, when the person asks or has asked that it be done
  before sharing; an agent, which having had to read a scope to find its
  way MAY leave a summary for whoever comes next, where it is allowed to
  write. The kernel writes none, and opening a universe causes none to be
  written (**C12**).
- *Where they are worth writing.* Where the outline does not discriminate:
  a scope longer than a page whose parts cannot be told apart by their
  outline lines — untitled sections, recordings, interviews, tables of
  prose, code. A summary of a scope shorter than a page costs as much to
  read as the scope, and SHOULD NOT be written.
- *When they are made again.* A summary whose pins are stale is shown as
  stale, beside an outline that is current. It is made again with
  `refresh`, on request or before sharing, not on every edit. An edit
  stales only the summaries on the path from the edited scope upward
  (§4.4), so the cost of bringing a universe's summaries up to date follows
  the size of what changed.

- **[Z1] A summary is a claim; its pins are the evidence.** A stale summary
  MUST be marked stale wherever it is shown and MUST NOT be silently used.
- **[Z2] Navigation, not knowledge.** A summary is never a source: it may not
  be evidence (**R4**). Every projection that returns summary text labels it
  as a summary and gives the pins beneath it, so that whoever reads it can
  cite the content and not the summary.
- **[Z3]** `expand` on any anchor returns its outline; on a part that has
  no parts, `text` returns its content. An observer can therefore always go
  from the whole at low resolution to any part at full resolution, with or
  without summaries, and the cost of doing so depends on the path taken,
  not on the size of the universe. That is the cost to whoever is reading.
  A reader computing an outline must total what lies beneath each part: a
  pass over it the first time, and nothing afterward where it keeps the
  totals (§3.4). A page opened from disk keeps them only while it is
  open.

A navigation structure that does not follow the structure of the work — an
index by theme across many documents — is not a kind of summary. It is a
text like any other, transmuted or written, whose links anchor the passages
it gathers, and its outline is navigated in the same way.

Lossless compression for storage and transport is a codec (§2.1) and is
independent of summaries.

Summaries of history pin changes. In a copy that withholds working history
they remain readable, and their pins to withheld content report as
unavailable rather than stale.

### 10.3 The agent interface

The projections of §10.1 and the actions below are functions of the
kernel, so every reader has them. A reader of rung 3 also offers them
to outside agents as tools under the Model Context Protocol:

| Action | Effect |
| --- | --- |
| `propose(change)` | submit operations with origin, evidence and note; the kernel verifies and commits, or refuses whole and says why |
| `try(change)` | everything `propose` would do short of committing: verify the change and, for a Compute-let, print the candidate and run its tests in a shadow (§12.6). It reports what `propose` would report, and changes nothing |
| `call(computelet, export, arguments, from)` | run one exported function in a shadow instance started from a stated snapshot, and return its results. It changes nothing |
| `test(computelet)` | run its tests against the current state and report |
| `import(bytes)` | add an asset |
| `derive(sources, how, origin, operations)` | write objects derived from the stated sources — a transmutation, a rendition, a summary — in one change: the kernel computes pins to exactly those sources, puts `from` on every object the operations create, and records the origin. A derivation can enter a universe no other way |
| `refresh(object, operations)` | commit a derived object made again from its recipe (**D3**) |
| `export(face or universe, parameters)` | sample and encode a face; or write the universe itself, as a travel form or a working form holding the layers the parameters state (§13.3) |

Projections show a statement, or an item of any list that is a sequence,
with its element identity, and an operation names it by that element identity. Characters
and bytes are too many to show one by one: projections show them by
position at the revision named in the header, and an operation may name
them by positions together with that revision, which the kernel turns into
element identities using it. Either way, an edit made against a reading that is a
little out of date lands on the elements that were read, or is refused
(**L4**) if they are gone; it never lands on whatever now stands in the
same place.

- **[I1]** An agent sees a universe only through the kernel, and so sees
  exactly what a person's reader sees.
- **[I2]** Every action an agent takes that alters a universe is a change
  whose `actor` names the agent and whose `origin` names the model, the
  prompt and the principal who asked.
- **[I3]** The interface is subject to **U11**.

---

## 11. Budgets of the player


### 11.1 Size of the player

Lines are non-blank, non-comment lines of the implementation language, Rust.
These limits change only on measurement.

| Measure | Limit | Reason |
| --- | --- | --- |
| Kernel, DEFLATE-compressed | 128 KiB, firm | this is the size that travels: every envelope carries the kernel compressed, so this is the limit every file pays for |
| Kernel, compiled WebAssembly | 256 KiB, as guidance | computed from the compressed limit; not a limit of its own |
| Kernel source: its own code, excluding tests, generated tables and anything borrowed | 7 000 lines | set from the compressed limit at the measured density of 16.7 compressed bytes a line, with a margin; see below |
| The kernel's bytes, rebuilt from its source | identical | **[B5]** a kernel is named by its hash in every file that carries it. Anyone MUST be able to rebuild those exact bytes from the source, with a stable release of the compiler and tools the source names, and no others. A build that needs an unstable compiler, or that differs from one machine to the next, is not a kernel |
| Binding source, per host | 600 lines | the base functions, the drawing contract and the kernel's own capabilities. Each optional capability a host offers is counted apart, and reported |
| Web binding, as shipped | 16 KiB | every script an envelope carries is the binding and counts here and in the line above, as carried in the page. A host has no other code |
| Tools universe (§9.6), as carried | 24 KiB | description only; no code |
| Web envelope holding one paragraph | 256 KiB | the compressed kernel in base64 (171 KiB at its limit), the binding, the tools universe inside the pack in base64 (32 KiB), the static face, the rest of the pack |
| Web envelope for each worked example of §15 | reported | no limit yet; measured and published with the first implementation |
| Printer, as a part of the kernel | 16 KiB | it is a function of the kernel, within the kernel's limits above; it measured 11 KiB in miniature |
| Implementations of any piece of format, layout or media logic in the project's readers | exactly 1 | **K1** |
| Names of object types, properties, profiles, operations or foreign document formats appearing in a binding or native shell | 0 | **K2**; found by searching its source |

The kernel's lines are budgeted by part, so that growth is noticed where it
happens:

| Part of the kernel | Lines | Measured so far, in the throwaway kernel |
| --- | --- | --- |
| Values, hashing, pack, index, recovery, compaction; finding and writing a pack in an envelope | 900 | 886 lines read all of this but compaction and envelopes |
| Objects, object map, blobs and chunking, changes, conservation, sequences | 900 | reading only; the write path is not written |
| Anchors, resolution, pins, digests, derivations, the layers of what travels | 600 | 517 |
| Formulas, with the mathematics routines they need | 700 | nothing |
| Composition: text with line breaking and bidirectional ordering, flow, grid, absolute, clocks, pages, plain text, presentation state, hit testing | 1 900 | 1 293, for text, flow, pages, plain text and the two Unicode algorithms |
| Projections, outlines, search, difference, actions, undo, the agent's spelling of values | 900 | 653, for six projections |
| Code and machines: printing; decoding and instrumenting modules; lifting; promotion; running Compute-lets through `engine`; snapshots and replay; capabilities | 1 100 | 351, the printer for part of the instruction set |

These are allocations, not measurements. No validator is budgeted,
because whether a module is valid is the host engine's judgment (**N1**),
and no inflater, because inflating is the host's (§9.3).

**The measurement behind these.** A throwaway kernel of 3 907 lines of its
own, covering what the last column lists, built with a stable compiler,
without the standard library, without general text formatting and
without an inflater, then passed through a size-optimising pass: 150.5 KiB,
and 70.1 KiB compressed. Of the compressed bytes, 2.0 KiB are the
allocator and 4.3 KiB the tables of the two Unicode algorithms, which
with their code come to 8.9 KiB; the kernel's own lines are 63.7 KiB, or
16.7 compressed bytes each. Three clean builds, one from a copy of the
source in another place, gave the same bytes (`spike/tools/repro.sh`),
which is the test behind **B5**.

The limits follow, in this order. What a file pays for is what travels,
and what travels is the compressed kernel: 128 KiB, firm. Less the
allocator and the tables, that holds about 7 400 lines at the density
measured. The budget is 7 000, so that a kernel at its budget is about
120 KiB compressed and has room for the density of unwritten parts to
differ: across the parts written it runs from 15 to 58 compiled bytes a
line. In base64 a kernel at its compressed limit is 171 KiB. The tools
universe travels inside the pack, so its 24 KiB are 32 KiB in the page.
With a binding of 16 KiB that leaves about 37 KiB of a 256 KiB envelope
for the static face, the page's fixed text and the rest of the pack.
Earlier limits were set from smaller kernels: 6 000 lines from one of
1 613 that compiled to 40 bytes a line and compressed to 48%.

### 11.2 Behavior

| Measure | Limit | Reason |
| --- | --- | --- |
| Static face visible, web envelope, any device | first paint | it is plain HTML ahead of everything else |
| Time to first interaction, one-paragraph envelope, mid-range phone | 500 ms | opening should feel like opening a photograph |
| Time to first interaction, Quarterly Review (§15.4), mid-range phone | 1 000 ms | |
| Tool calls for an agent to find and explain the origin of a unit of machine code, entering at `overview` | 3 + the depth of the outline | `overview`, one `expand` per level, `why`, `text` |
| Share of the universe an agent expands to do so | reported | must fall as the universe grows |
| Reopened universe has the same root hash on every reader tested | always | |
| Canonical export bytes identical on every reader tested, for one renderer | always | **S5** |

The conformance suite tests the one kernel against every labeled rule in
this document, and includes: malformed and hostile packs; the fuzzing of
**P20** and its corpus; writes interrupted at every byte offset of a commit
(**P6**); corruption by bit flips, truncation and swapped ranges; compaction
with every hash compared before and after (**P13**); the weekend test
(**P19**); refused changes of every kind named in **L4**; anchors resolved
after long edit histories; and a
travel form with working history withheld, checked for what it reveals and
what it still verifies (**E10**). Independent implementations, when they
exist, are measured against the same suite.

---

## Terms of this part

Marked as in the core's glossary (§6.2): a **concept** is an idea a newcomer must learn; a **name** is a founding word for something built of concepts; a **part** is a name for a piece of a record or a status.

| Term | | Meaning | § |
| --- | --- | --- | --- |
| Agent interface | concept | the kernel's functions as an agent calls them | 10.3 |
| Base presenter | part | a presenter that is the host's own drawing and sound | 9.1 |
| Binding | concept | the host-specific code that connects the kernel to a host | 9.1 |
| Capability | concept | a named authority beyond the base host functions, granted by the person | 9.3 |
| Carried presenter | concept | a presenter that is a Compute-let on a surface | 9.1 |
| Component | concept | a Compute-let the player relies on, carried by hash | 9.1 |
| Display list | concept | what the kernel composes for presenters to draw and play | 9.2 |
| Drawing contract | concept | the frozen form of the display list and of input events | 9.2 |
| Host interface | concept | the complete set of functions a sandboxed component may import | 9.3 |
| Kernel | concept | the one program that reads, verifies and composes a universe | 9.1 |
| Light cone | name | outlines, with summaries attached to their parts: from the whole to exact bytes | 10.2 |
| Onboard tools | name | the kernel's projections and actions, and the tools universe | 9.6 |
| Outline | concept | what the kernel computes of any object: its parts, their sizes and kinds, who changed them and when | 10.2 |
| Player | name | what presents a universe: kernel, presenters, binding | 9.1 |
| Port | part | a channel for messages between components | 9.3 |
| Presenter | concept | what turns the display list into output | 9.1 |
| Summary | concept | a derivation that condenses what it pins | 10.2 |
| Tools universe | concept | a universe that is the interface to those functions, presented with the work as its subject | 9.6 |

---

## Appendix B. Projections

What a model reads is part of the format. This appendix fixes it exactly.

**Form.** A projection is UTF-8 text, lines ended by U+000A. The first line
is the header: the projection's name, its arguments as written by the
caller, `@`, and `commit=` with the commit it was computed from. Every
other line is one record: a *kind*, one space, then *fields* separated by
one space, each `name=value`, always in the order given below. A field
shown in brackets is omitted when it has no value. The last line is `end`
followed by `lines=` and the count of record lines, so that truncation is
detectable.

**Values.**

| Value | Written as |
| --- | --- |
| object identity | `o:` and the shortest prefix of its lowercase hexadecimal, of at least 8 digits, that is unique among object identities in the universe |
| hash | the same rule among hashes of its kind, with `r:` for a revision, `c:` for a commit, `b:` for a blob |
| element | the object identity of the change that inserted it, a dot, and its number: `o:d2c417e9.12` |
| region | `axis=[low,high]` for sequence and continuous axes, `axis=[key,key]` for keyed ones; several axes are several fields |
| anchor | `o:…` then, if any, its regions, then `r:…`; written without spaces inside brackets |
| integer, float | decimal; floats with the fewest digits that round-trip |
| time | milliseconds as an integer; clock times in flicks with the suffix `f` |
| text | a JSON string (RFC 8259) |
| list | values separated by commas, in brackets |
| status | one of `current`, `stale`, `detached`, `unresolved`, `withheld`, `absent` |
| basis | one of `witnessed`, `inferred`, `unknown` |

A value too long to show — text over 200 characters where the projection
is not asked for the text itself — is written as its first 200 characters
followed by `…` inside the string, with a `len=` field after it.

Two rules bind every projection. It is a function of the commit and its
arguments alone. And every object identity, hash and anchor it shows can be
passed back, exactly as written, as an argument to another projection.

**Records.**

| Projection | Arguments | Records, in order (`*` any number, `?` at most one) |
| --- | --- | --- |
| `overview` | — | `universe`; `seal`*; `feature`*; `component`*; `face`*; `lacks`?; `part`* |
| `object` | object identity | `object`; `prop`*; `run`*; `referrer`* |
| `text` | anchor | `text` |
| `search` | query | `hit`* |
| `history` | anchor | `change`* newest first |
| `why` | anchor | `region`; then for each part of it: `run` or `value`; `copied`*; `finding`*; `evidence`*; `decision`? |
| `diff` | two commits or revisions | `op`* |
| `expand` | anchor | `part`* |
| `recipe` | object identity | `source`*; `made` |
| `verify` | commit | `check`*; `issue`* |
| `leaving` | the parameters of an export | `layer`*; `seal`*; `lacks`? |
| `sample` | face, parameters | as text: `text`; as a display list: `item`* |
| `items` | object identity of a module | `item`* |
| `unit` | object identity of a function | `unit`; `stmt`* |
| `calls` | object identity of a module | `call`* |
| `unit-history` | object identity of a function | `change`* newest first |

| Record | Fields |
| --- | --- |
| `universe` | `lineage` `commit` `height` `objects` (count) `types` (count of objects of each type) `changes` (count) `first` `last` (times) `actors` (list) |
| `seal` | `commit` `key` `status` (`valid`, `invalid`, `unchecked`) [`name`] [`time`] |
| `feature` | `name` `v` `required` `supported` |
| `component` | `role` `hash` `status` |
| `face` | `id` `kind` (`sampled`, `carried`, `transmuted`) `status` `medium` `label` |
| `lacks` | `history` (boolean) `blobs` (count) |
| `part` | an anchor, then `type` `label` (its label, heading or name, or the first 60 characters of a block) `size` `changed` (time) `by` `basis` [`parts` (count)] [`derived` (status)] [`summary` (the text of its line) `summary-status`] |
| `source` | an anchor, then `r` `status` |
| `made` | `how` `change` `basis` [`by`] [`model`] [`tool`] [`asked`] [`prompt` (its text, or `withheld`)] [`parameters`] |
| `object` | `id` `type` `rev` (number) `r` (revision hash) `by` |
| `prop` | `key` then `value`, or `len` and `kind` when large |
| `run` | a stretch of elements with one origin: the region, as positions, then `change` `basis` [`by`] [`who`] [`model`] [`tool`] [`asked`] [`prompt`] [`method`] [`confidence`] `sealed` (boolean) |
| `value` | `key` then the same fields as `run` from `change` on |
| `copied` | `from` (anchor) `basis` |
| `finding` | `change` `basis` and the origin fields, as in `run` |
| `evidence` | `claim` (region) `kind` `support` (anchor) `status` [`note`] |
| `decision` | `about` `verdict` `who` `change` `time` [`note`] |
| `referrer` | `id` `key` |
| `text` | the anchor, `chars` (count), then `s` |
| `hit` | the anchor, `type`, `s` (up to 80 characters around the match) |
| `change` | `id` `time` `actor` `basis` [`by`] `ops` (count) `touched` (list of object identities) [`note`] |
| `op` | `op` `obj` [`key`] [`after`] [`del`] then `old` and `new`, each a value; where the change's `work` is withheld, one record `op withheld` |
| `check` | `rule` (a label of this document) `scope` `result` (`pass`, `fail`, `skipped`) [`reason`] |
| `layer` | `name` (`content`, `attribution`, `history`) `included` (boolean) `objects` (count) `bytes` `actors` (list) `models` (list) `changes` (count) `first` `last` (times) |
| `issue` | `class` (of §1.9) `record` `rule` `s` |
| `item` | for `sample`: the display-list item as fields. For `items`: `id` `kind` `name` `size` `by` `basis` `tests` (count) [`signature`] |
| `unit` | `id` `name` `signature` `r` `statements` (count) |
| `stmt` | `e` (the statement's element identity) `change` `depth` (of the blocks enclosing it) `s` (the statement, in the JSON spelling of its value, with functions shown by name) |
| `call` | `from` `to` (object identities) `count` |

**Queries.** `search` takes a map with any of: `text`; `type`; `hash` (of a
record, a blob or a unit); `basis`; `by`; `actor`; `model`; `after` and
`before` (times); `calls` (a function); and `in`, an anchor to search
within. Every field given must match. It returns the 64 best hits, then
the rest in ranges, as an outline does (§10.2).

**What an agent writes.** The arguments of an action (§10.3) are JSON. A
value is spelled: `null`, `true`, `false`; a number with no fraction or
exponent for an integer, and with one for a float; a string for a text; an
array for a list; an object for a map. An object with one key beginning
`$` spells the other kinds: `{"$ref": "o:3f9a12c4"}`; `{"$anchor": "…"}`,
holding an anchor as projections write one; `{"$element":
"o:d2c417e9.12"}`; `{"$bytes": "68656c6c6f"}`, in hexadecimal;
`{"$formula": […]}`. A change is `{ops, origin, evidence, decisions,
note}`, its operations having the fields Appendix C names. Projections use
the same spelling wherever they show a value, and add `name` to a `$ref`
whose object has one; a `name` given back is ignored.

An example:

```
why o:3f9a12c4 chars=[1042,1187] @ commit=c:77e0b1d2
region o:3f9a12c4 chars=[1042,1187] r:a81f3320
run chars=[1042,1120] change=o:d2c417e9 basis=witnessed by=model model="example-model-1" asked="A. Author" prompt=withheld sealed=true
evidence claim=chars=[1042,1120] kind=cites support=o:4410cc2e rows=[q3] cols=[revenue] r:09be77a1 status=current
decision about=o:d2c417e9 verdict=accept who="A. Author" change=o:5e02d9b7 time=1767225600000
run chars=[1120,1187] change=o:0b77a3f1 basis=inferred by=person who="A. Author" method="text-alignment" confidence="exact-text" sealed=false
end lines=5
```
