# UFO: worked examples

**A companion to the specification, version 0.8. Not normative.**

Four examples worked on paper, to show that the format's parts are enough
and to find where they are not. Nothing here adds a requirement. What has
run of each is in [VISION-TRACE.md](VISION-TRACE.md). Section numbers are
those of the specification: §0–§6 in [SPEC.md](SPEC.md), §7–§8 in
[SPEC-PRESENTATION.md](SPEC-PRESENTATION.md), §9–§11 in
[SPEC-PLAYER.md](SPEC-PLAYER.md), §12 in
[SPEC-EXECUTION.md](SPEC-EXECUTION.md), §13–§14 in
[SPEC-TRAVEL.md](SPEC-TRAVEL.md).

---

## 15. Worked examples

Each example is represented using only the core, the ten primitives and
the profiles of §5 and §12. Object names in `code` are labels for this
text; real object identities are 16 bytes.

### 15.1 An interactive video

*A twenty-minute explanatory video with a live table, a computed
infographic, an anchored transcript, a document rendition and chapter
summaries.*

**Objects.**

| Object | Type | Content |
| --- | --- | --- |
| `video` | `ufo.clock` | interval 0 to 20 min; holds `stage` |
| `stage` | `ufo.group` | `absolute`, 1920 × 1080; its children are everything below that appears in the picture |
| `footage` | `ufo.raster` | source: asset `footage.mp4`; time: the enclosing clock's |
| `sound` | `ufo.samples` | source: the same asset |
| `dataset` | `ufo.data` | the figures; rows and columns keyed |
| `table-clock` | `ufo.clock` | interval 1:32 to 2:12, `locked`; holds `table-portal` |
| `table-portal` | `ufo.portal` | `of` `table-view`; `table-clock` is a child of `stage` placed at the upper right |
| `table-view` | `ufo.group` | `grid`, `each` over `dataset` sorted by `state("sort")`; header cells carry `on` handlers that set `sort` |
| `info-clock` | `ufo.clock` | interval 8:00 to 8:45; holds `info-portal` |
| `info-portal` | `ufo.portal` | `of` `info-surface` |
| `info-surface` | `ufo.surface` | Compute-let `infographic`, granted `objects` read scope on `dataset` |
| `transcript` | `ufo.text` | the narration; one block span per sentence |
| `caption-n` | `ufo.clock` | one per sentence, each holding a Portal whose `of` is an anchor to that sentence's region of `transcript`, so that a corrected word appears in the caption at once |
| `article` | `ufo.text` | the document form of the video |
| `chapter-n`, `top` | `ufo.summary` | one per chapter, and one for the whole |

**Coordinate spaces and anchors.** `video` offers `t`, and `stage` offers
`x` and `y`. The Portal's position is the interval of `table-clock`
(on `t`) and its rectangle in `stage` (on `x`, `y`). Sentences are tied
to time by construction: caption clock *n* holds a Portal whose `of` is an
anchor to sentence *n*'s region on `chars`; the clock's interval is the sentence's
time range. "Which words are spoken at 3:10" is answered by finding the
caption clock present at that time; "when is this sentence spoken" by
finding the clock whose Portal anchors it.

**Clocks.** `table-clock` and `info-clock` are `locked`: scrubbing the video
scrubs them. The table's sort order is presentation state, so sorting while
the video plays changes no byte (**S1**). `info-surface` receives the locked
time through `time()` (**T1**) and reads `dataset` through its granted
capability; its figures are computed live. If the person denies the grant,
the surface shows the Compute-let's poster (**H2**).

**Derivation and Chronicle.** `article` has `from` `{sources: [pin
transcript, pin dataset], how: transmute}`. The change that wrote it has
`origin` `{basis: witnessed, by: model, model, prompt, context, asked}` and, once reviewed, a
decision. The face registry lists two faces: `video` (sampled) and `article`
(transmuted). Editing `transcript` or `dataset` makes `article`'s pins stale
(**D1**).

**Summaries.** The sources of `chapter-n` are a pin to `video` with a region
on `t` covering the chapter, and a pin to the matching region of `transcript`.
`top` pins `video` whole. Because a digest follows refs (§4.4), a
chapter summary goes stale when any caption or the footage within it
changes, and so does `top`. Trimming the video's start by ten seconds is
a `set` of the clock's `start`: no time within it moves, and every
chapter pin stays attached (**A4**).

**Export.** A standard video file is `video` sampled over 0 to 20 min at a
picture rate; `info-surface` is run tick by tick from its snapshot (**M5**),
the table in its default sort.

### 15.2 A game inside a document

*A design document containing the playable game, with editable levels, a
live modification by an agent, text linked to the code, and shared play.*

**Objects.**

| Object | Type | Content |
| --- | --- | --- |
| `design` | `ufo.text` | the document; an `embed` span halfway down names `game-portal` |
| `game-portal` | `ufo.portal` | `of` `game-surface`; `place` `block`; 960 × 540 |
| `game-surface` | `ufo.surface` | Compute-let `game`; `of` the current level; children: `terminal-portal` |
| `game` | `ufo.computelet` | module, tests, snapshot, poster; requests below |
| `engine` | `ufo.module` | the game's functions |
| `level-1` … | `ufo.data` | each level as a scene in the glTF model (§7.5): nodes for rooms, props and spawn points, with `x`, `y`, `z` axes for the level's space and `t` for its scripted time |
| `manual` | `ufo.text` | the game's instructions, also readable on a terminal inside the game |
| `terminal-portal` | `ufo.portal` | child of `game-surface`; `of` `manual`; `place.at` an anchor to node `terminal-screen` of `level-1` |
| `test-1` … | `ufo.test` | calls with expected returns, and recorded replays with expected state |

**Requests.** `gpu` (required), `audio` (optional), `input.raw` (optional),
`objects` read on the level objects (required). Keyboard, pointer and touch
arrive through the base `input` function and need no grant. Without `gpu`
the Portal shows the poster and says why. Without `audio` the game is
silent.

**What the host interface provides.** The ten base functions; the four
capabilities above and `present`; `tick(time)` at the display's rate with
fuel set per call. Nothing else.

**The game's world is format data.** The three conditions of §7.5 hold:

- *Space is addressable.* A design note in `design` links to "the ledge
  above the second door" by an anchor to `level-1` with a region on `x`,
  `y`, `z`, and to a spawn point by its key on `nodes`. A cut-scene is
  cited by a region on `t`. These hold through edits to the level like any
  anchors; the level is resized where it is placed, and its own
  coordinates stay as they were.
- *What sits in the world is data, with attribution and summaries.* The
  terminal showing the manual is `terminal-portal`, an object whose
  `place.at` names the node it sits on. Every node of every level was set
  by a change, so `why` on a prop says who or what placed it. Each level
  has an outline of its nodes, and may have a summary that pins its node
  table; an agent can learn what is in level 3 without starting the game.
- *Flat content in the world is data.* The manual on the terminal is the
  same text object the document's appendix presents. The game asks for it
  with `present` and draws the raster on the screen's node.

The game's memory holds positions of moving things, scores and timers: the
state of a machine in play, snapshotted with it (**M6**, **M9**).

**Levels are objects.** A person edits `level-2` with the onboard tools as
they would any table: a change with `set` operations. The game reads levels
through its `objects` capability and is told of the new revision by
`message`.

**Live modification.** With the game paused — the reader has stopped its
clock — an agent:

1. calls `propose` with `set` operations on `level-3`;
2. calls `propose` with a change that adds a function object for the new
   mechanic and splices three statements into the update function, having
   first checked it with `try`.

The reader runs the promotion sequence (§12.6): the tests in force before
the change run against the candidate in a shadow instance started from the
paused state; on success, and with the person's approval, the candidate
takes over from that state and the game resumes with the mechanic. The
agent cannot make the tests easier in the same breath: touching a test or
a function a test relies on is a test change, alone and approved (**G1**). A broken candidate is discarded and the
paused game is untouched (**G2**).

**Text linked to code.** The paragraph of `design` describing the mechanic
carries a `link` span whose `href` is an anchor to the new function object,
which survives later improvements to the function; a sentence about one
check inside it anchors those statements. In the other direction,
the agent's change records evidence `{claim: that unit, support: pin to the
paragraph, kind: cites}`. `why` on the
unit returns the prompt, the model, the tests and the paragraph.

**Shared play, later.** Two people open their own copies. Their readers
exchange only inputs, each stamped with a clock time, on a port. Each reader
delivers the merged inputs to its own instance at the same clock times.
Because execution is deterministic (**M5**) and time comes only from the
clock (**T1**), both instances stay identical. This needs a transport
capability and nothing in the core.

### 15.3 A body of research

*Four hundred documents, sixty datasets, twenty interviews with
transcripts, twelve analysis Compute-lets; an agent asked why a conclusion
was reached.*

**Structure.** The corpus is one universe, `corpus`, whose objects include
the final report and whose pack nests one universe per study (§1.8). Each
study universe holds its documents as texts, its datasets as data objects,
its interviews as clocks over audio assets with transcript texts anchored
to time as in §15.1, and its Compute-lets. Studies shared with other
corpora are linked rather than nested; the reference is identical.

**Linking.** A passage quoted from a study into the report is a Portal
whose `of` is a pin to the passage's region, in the study's universe at a
stated commit (transclusion, §7.8). A chart in the report is a Portal to a
group in the study that presents its dataset. Conclusions in the report
carry evidence entries whose `support` pins regions of study documents and
cells of datasets.

**Outline and summaries.** The outline of `corpus` has a part for the
report and one for each study, followed into its universe; a study's has
its documents, datasets, interviews and Compute-lets; a document's has its
sections. Four hundred documents are reached in four levels, with no model
involved. Studies, documents and interviews also carry summaries, each
pinning what it condenses; they matter most for the interviews, whose
outlines are a row of dates.

**The question.** "Why does the report conclude *C*?"

| Step | Call | Reads |
| --- | --- | --- |
| 1 | `expand` of the whole | what the corpus is, and one line for each study and for the report, with their summaries |
| 2 | `expand` on the report | one line per section of the report; the conclusions section is evident |
| 3 | `expand` on that section | one line per conclusion, each with its anchor; *C* is one |
| 4 | `why` on the pin for *C* | its origin (who or what wrote it, with what basis), its evidence (pins into two studies), its decisions |
| 5 | `text` on each evidence pin | the exact supporting passages and cells, each checked against its pin |
| 6 | `why` on a supporting passage | its own origin: say, a person's edit of a model's draft that consulted interview 7 between 12:40 and 14:05 |
| 7 | `text` on that interview region | the words spoken |

The agent entered at the whole and descended three levels
without searching. It answers with the anchors from steps 4 to 7 and their
origins. It has expanded one branch of the outline, a few passages of
two studies and ninety seconds of one transcript. The other studies were
seen only as single lines in step 1. `search` remains available as a
shortcut; the light cone does not depend on it. A miniature of this
example, with one corpus and three studies, has been run on a stand-in — an
object model outside the kernel, with summaries written by a script and
not by a model: see
[RATIONALE.md](RATIONALE.md).

If a supporting passage has changed since the conclusion was written, its
pin is stale and step 4 says so (**R5**): the agent reports that the
conclusion rests on evidence that has since moved.

### 15.4 The Quarterly Review

*A report, a dataset, two charts, a photograph and a Compute-let, opened as
nine faces and sent two ways.*

**What the author made.**

| Object | Type | Content |
| --- | --- | --- |
| `report` | `ufo.text` | about two thousand words; embed spans for two charts, the photograph and the projector |
| `figures` | `ufo.data` | quarterly figures |
| `chart-a`, `chart-b` | `ufo.group` | axes, bars and labels as paths and text under `each` over `figures` |
| `photo` | `ufo.asset` | the photograph's original JPEG bytes; presented by a raster |
| `projector` | `ufo.computelet` | the assumptions tool; requests `objects` read on `figures` |
| `approved.pdf` | `ufo.asset` | `from` `{sources: [pin report, pin figures, …], how: render}`; with it, page images in a baseline format, since a reader does not decode PDF (§9.4) |

**Faces.**

| Face | Kind | How |
| --- | --- | --- |
| Document | sampled | `report` composed as a flow; charts drawn from current `figures`; `projector` running in its Portal |
| Plain text | sampled | §8.3 |
| Spreadsheet | sampled | `figures` presented as a grid; export as a table file |
| Image | sampled | any object at one moment, one viewport (§8.4) |
| Fixed document | carried | the page images of `approved.pdf`, shown with a stale mark if any pin has moved; the PDF itself is exported byte for byte |
| Slide deck | transmuted | `deck`: a `held` clock over groups, with Portals to `chart-a` and `chart-b`; `from` pins `report` and `figures`; origin `model` |
| Narrated video | transmuted, then sampled | `narration`: a text (transmuted) and its synthesized voice (an audio asset: carried, with a model as origin), each with `from` pinning what it was made from; `video`: a clock ordering the deck's regions against the narration; exported by sampling |
| 3D view | transmuted, then sampled | `scene`: a `ufo.data` object in the glTF model (§7.5) whose rows describe bars, labels, lights and a camera for `figures`, with `from` pinning `figures`; `scene-surface`: a `ufo.surface` whose Compute-let, `scene-presenter`, requests `gpu` and `objects` read on `scene` and `figures`. Bar heights are read from `figures` as it now is, so the view is live; the arrangement and styling in `scene` are what was transmuted |
| Application | sampled | `projector` presented alone, full size |

**The 3D view meets the three conditions of §7.5.** *Addressable:* `scene`
declares `x`, `y`, `z` and `t`; the report's sentence "the third quarter
towers over the rest" links to the bar by its key on `nodes`, and a
reviewer's comment is anchored to a region of space above it. *Readable
without the program:* each bar's node was written by the transmuting
change, so `why` on it names the model and the prompt, and the scene has a
summary pinned to its node table. *Flat content placed
in it is data:* a caption panel beside the bars is a Portal child of
`scene-surface` whose `of` is an anchor to the sentence in `report` and
whose `place.at` names the node `caption-panel`; edit the sentence and the
panel in the scene shows the new words.

**It uses no hidden profile.** `scene` is a data object like
`figures`. `scene-presenter` is a Compute-let like `projector`, carried in
this universe and in no universe without a scene (**K4**). The kernel
composes a `surface` item and hands it the rectangle; it does not know the
content is three-dimensional. Exports of the view — a still, a turntable
video — are the surface sampled over time (§8.4). A standard 3D model file
is an export encoded by that Compute-let at the border (**B3**).

The deck and video present the charts through Portals, not copies. They
show current figures even when their own derivation is stale, and the stale
mark says the narrative around them may no longer match.

**Changing one figure.** A `set` on a cell of `figures`, in a change with
origin `person` and a note. Then: the document, spreadsheet, image and
application faces reflect it at the next composition. The pins of
`approved.pdf`, `deck`, `narration`, `video` and `scene` that cover
`figures` are stale (**D1**) — the 3D view already shows the new height,
and the mark says its arrangement was designed for the old figures; each can be regenerated by a change that
writes new revisions (**D3**). `history` on the cell shows who changed it,
when and why.

**Sending.** To a colleague: a web envelope (§13.2) opening every face above
in a browser. Before it leaves, the reader shows what will travel (**E12**):
the content; the attribution, naming the author, the model that produced the
deck and narration, and forty-odd changes; not the prompts or the earlier
drafts of the report, unless the author includes them. To a video-only
channel: an MP4 envelope whose outer face is the exported narrated video,
bearing its mark, on the understanding that the channel may strip the pack
and leave the mark as the way back to the universe (**E19**, **E20**).

### 15.5 What the examples required of the core

Nothing was added to §1–§4 to represent these examples. They did shape
three decisions made while drafting: clocks became a primitive symmetrical
with regions, rather than a property; presentation state was separated from
universe state, so that sorting a table inside a video is not an edit; and
references to other universes were made identical for nested and linked
content.

---
