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
| `press(ptr, len)` | `{key}`: the span key of the pressed item of the tools universe | the handler that span's `on.press` holds, as a value: `{set, to}` or `{act, …}`, or null. The tools pack is `vectors/tools.ufx`: its handlers set `face` to `document`, `pages` or `text`, set `editing` to true, and act `export`. A press on anything in the working universe gives null: only what the reader presents as tools acts |
| `block_at(ptr, len)` | `{src}`: the `src` anchor of a text item of the working universe | `{o, key, lo, hi, text}`: the block that holds it, by positions, and its characters |
| `propose(ptr, len)` | `{o, lo, hi, ins, who, time, random}`: replace positions lo..hi of the text `o` with `ins`; `who` a name; `time` in milliseconds; `random` 64 bytes from the host | `{commit, change, root}` or `{refused: reason}`. The change has one `splice`, origin `{basis: "witnessed", by: "person", who: {name}}`, and passes the kernel's own conservation check before anything is written |
| `pack_bytes()` | — | the whole pack as it now stands |
| `find_pack(ptr, len)` | the text of a web envelope's pack element | the pack's bytes, decoded |

### As implemented (kernel side; `roundtrip.mjs`, `more-edits.mjs`, NOTES.md)

Where the table above left something open, or the kernel departs from it:

- `open_tools` takes the pack's bytes raw, as `open` does. Compressed
  records in a tools pack are not inflated (there is no `pending` round for
  it); `vectors/tools.ufx` has none.
- `pack_bytes` gives one encoded value, a byte string; `find_pack` takes one
  encoded text (the text of the pack elements, concatenated) and gives a
  byte string, or null if the text is not standard base64 with padding.
  White space around the whole text is not counted; inside it, it is refused.
- `propose` gives `commit` and `root` as the same 32 bytes (the hash of a
  commit is the root hash, SPEC 1.6) and `change` as the change's 16-byte
  identity, which is the first 16 bytes of `random`. `o` and `random` are
  byte strings; `block_at` gives `o` as a byte string too.
- **Departure:** the change has `origin` only if it inserts something. SPEC
  1.7 has `origin` "absent if the change introduces none", so a removal with
  nothing put records no origin.
- The change may hold a second operation: a `set` that removes an inline
  span the edit left with no extent (SPEC 5.1).
- `press` looks for the span key in the text the tools universe's primary
  face presents, and in what that text holds (children, embedded children).
- `block_at` gives `key` null for characters that lie in no block span, and
  null as a whole for an anchor into another universe.
- `binding.mjs`: `openTools`, `press`, `blockAt`, `propose`, `packBytes`,
  `findPack`; its `encode` now writes byte strings (`Uint8Array`) and
  tagged values (`{tag, v}`, as `decode` gives them), which the arguments
  need.

## What counts as passing

Per platform, each of: opened; two faces read; one paragraph edited
through the tools, attribution recorded (the `why` projection names the
new change and the person); saved as a new `.ufx.html`; reopened, with
the same root hash the kernel reported at save and the edited text in
both faces; sent on (the saved file opens on another origin or machine
with nothing else).
