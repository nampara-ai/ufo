# Envelope spike: plan and contract

Throwaway. The aim is the founding acceptance test: a received file opens
in a browser with nothing installed, is read in two faces, has one
paragraph edited through its own tools with attribution recorded, is
saved as a new travel-form file, reopens identically, and can be sent on.

## Pieces

1. **Kernel, write path** (`spike/kernel`): one edit through the normal
   gate. `propose` takes a splice on a text, builds the change, applies
   it, checks conservation by replay, writes the records, the index and
   the head onto the end of the pack it holds, and gives the pack back.
2. **Kernel, tools** (`spike/kernel`): a tools universe is a second pack
   the reader opens beside the working one and presents itself. Pressing
   something in it yields an action, which the reader performs on the
   working universe: the subject. Nothing in the tools pack names the
   subject, and nothing in the working pack can make itself one (**F6**).
3. **Envelope** (`spike/envelope`): `make.mjs` writes `name.ufx.html`
   from a pack, the tools pack, the kernel and the binding. The page reads
   its pack back from itself, runs the kernel, and can write a new
   envelope holding the extended pack.
4. **Tests** (`spike/envelope/test.mjs`): the acceptance steps in a
   headless browser, opened from `file://`, with scripts on and off.

## Kernel interface added for the spike

All arguments and results are encoded values, as `sample` and `query`
take and give them.

| Export | Takes | Gives |
| --- | --- | --- |
| `open_tools(ptr, len)` | a tools pack | 1 if it holds a universe |
| `sample` with `of: "tools"` | as for the working universe | the tools universe composed; every text item that lies under a span with an `on` handler carries `press`: the handler's key (the span's key) |
| `press(ptr, len)` | `{key}`: the span key of the pressed item of the tools universe | the action that span's `on.press` holds, as a value `{act, …}`, or null. A press on anything in the working universe gives null: only what the reader presents as tools acts |
| `block_at(ptr, len)` | `{src}`: the `src` anchor of a text item of the working universe | `{o, key, lo, hi, text}`: the block that holds it, by positions, and its characters |
| `propose(ptr, len)` | `{o, lo, hi, ins, who, time, random}`: replace positions lo..hi of the text `o` with `ins`; `who` a name; `time` in milliseconds; `random` 64 bytes from the host | `{commit, change, root}` or `{refused: reason}`. The change has one `splice`, origin `{basis: "witnessed", by: "person", who: {name}}`, and passes the kernel's own conservation check before anything is written |
| `pack_bytes()` | — | the whole pack as it now stands |
| `find_pack(ptr, len)` | the text of a web envelope's pack element | the pack's bytes, decoded |

## What counts as passing

Per platform, each of: opened; two faces read; one paragraph edited
through the tools, attribution recorded (the `why` projection names the
new change and the person); saved as a new `.ufx.html`; reopened, with
the same root hash the kernel reported at save and the edited text in
both faces; sent on (the saved file opens on another origin or machine
with nothing else).
