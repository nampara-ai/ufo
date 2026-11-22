# The Universal File Object (UFO) Specification: Core

**Version 0.8 — draft for review. Nothing here is frozen. Nothing here has been implemented.**

The UFO format is a single file that holds a universe of described
meaning, carries the small player and tools that present and edit it,
records where every byte of it came from, and can be extended by people
and AI without loss.

The aim is an open, universal primitive of computing, in the way the PDF
became one: owned by no application and outliving all of them. One universe
can present as anything a computer can present — document, plain text,
image, video, audio, data, diagram, three-dimensional scene, application,
game — and universes nest and link into bodies of work of any size. Text is
implemented first. Every other medium is designed now, on the same
foundations.

This document is the core of the specification: storage, memory and
addressing. It is written to be built from, and to stand alone: a reader
of packs, objects, changes and anchors can be written from this document
and its test vectors and nothing else. It contains no code. Where it
chooses a technology it gives the reason, so the choice can be challenged.
[CORE.md](CORE.md) states the whole format in about four pages;
[RATIONALE.md](RATIONALE.md) explains why the format is shaped as it is.

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

## 0. Reading this document

### 0.1 Conventions

The words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are used as in RFC 2119
and RFC 8174. Requirements are of two kinds: sentences that use one of those
words, and rules that carry a label such as **[C3]**. A labeled rule is a
requirement in full, whether or not it uses one of those words; where it is
written in the indicative, it states what every conforming reader and writer
does. Everything else is explanation. The conformance suite tests every
labeled rule that a file, or the kernel at work, can show. A few rules
bind what a writer or a reader does where no file records it — **L1**,
**L5**, **M9**, **R2**, **E12**, **H6** — and can be tested only where a
harness watches the software at work. They are obligations all the same.

Every term is defined once, in **bold**, and has one meaning. Each part
of the specification ends with a table of the terms it defines; §6.2 holds
the core's, and the counts for the whole.

*Reader* means any software that opens a UFO. *Writer* means any software that
changes one. *Person* means the human using a reader. *Agent* means software,
usually a language model, acting through the agent interface (§10.3). *Host*
means the platform a reader runs on: a browser, an operating system.

### 0.2 Status of each section

| Sections | Status in this draft |
| --- | --- |
| §1–§4 records, pack, anchors | Complete, with a schema (Appendix C) and byte-level vectors (Appendix F); names and tag numbers provisional |
| §5 text, assets, derivation, the Chronicle | Complete |
| §7–§8 vocabulary, composition, faces | Composition (§7.7) is an algorithm for text, flow, grid, absolute position, clocks and pages; floats and hit testing are rules, not yet algorithms |
| §9–§11 player, tools, attention | The drawing contract and the capability contract are complete. Operations are written for the kernel's own capabilities and sketched for `gpu`; seven optional capabilities have none |
| §12 execution | Complete in structure; exhausting the call stack is not yet deterministic |
| §13–§14 travel and trust | Complete in structure; the `ufo:` scheme provisional |
| §6, §11 limits and budgets | Targets set before measurement; one measurement so far, of a miniature |

A section's being complete says that the text is there. It does not say
that anything has run. A requirement counts as settled only when
something exercises it: a test vector, a test, or running code. Until
then it is open, however fully it is written.

What has been exercised, and how, is in [VISION-TRACE.md](VISION-TRACE.md).

### 0.3 The design in one paragraph

A universe is a set of objects, stored as immutable records named by hash,
so that its state is one hash and so is its whole history. It moves forward
only by changes, which are objects too and record what was done, by whom
and from what. Any place in any object is named by an anchor that survives
edits. What a universe shows is described with eleven primitives; one small
kernel, compiled once to WebAssembly, composes the description into a list
of things to draw and play, and the host draws them. A face is any
presentation of a universe: sampled from the description, carried as a
stored rendition, or transmuted by AI with its sources attached. Programs
are described objects as well; they run in a sandbox with no authority but
what the person grants, and their bytes are printed from the description.
The file is a pack of records, alone or inside an envelope — by default a
web page — that also carries the player. Everything below is the precise
version of this paragraph.

---

## 1. The core

The core knows records, objects, properties, references, changes, anchors and
time. It does not know what text, a page, a frame or a polygon is.

### 1.1 Hashes

A **hash** is the 32-byte SHA-256 digest (FIPS 180-4) of a byte string. In
text it is written `sha256:` followed by 64 lowercase hexadecimal digits.

*Reason.* SHA-256 is standardized, unbroken, hardware-accelerated and present
in every browser and operating system. One algorithm keeps every hash
comparable. A future algorithm is a new format version (§1.9), not a per-file
option.

### 1.2 Values

A **value** is one of:

| Value | Meaning |
| --- | --- |
| null, boolean | as named |
| integer | signed, −2⁶³ … 2⁶³−1 |
| float | IEEE 754 binary64, finite |
| text | a string of Unicode scalar values |
| bytes | a byte string |
| list | an ordered sequence of values |
| map | text keys to values, keys unique |
| **ref** | the object identity of an object in the same universe (§1.5) |
| **anchor** | a reference to an object, or to a region of one (§4) |
| **formula** | an expression that computes a value (§7.3) |
| **indirect** | a stand-in for a value stored outside the node, in a blob (§1.4) |

Values are encoded in CBOR (RFC 8949) using the core deterministic encoding
requirements of RFC 8949 §4.2.1, so that a value has exactly one encoding.
Ref, anchor, formula and indirect are CBOR tags 55461, 55462, 55463 and
55464 applied to a 16-byte string, a map, a list and a list respectively. These tag numbers are provisional
until registered.

Integers are encoded in the shortest form. A float is encoded in the
shortest of the three IEEE widths that preserves its value exactly; a float
with an integral value remains a float; negative zero is distinct from
zero. The *depth* of a value is 1 for the value itself, plus one for each
list, map or tag it is nested inside. An *entry* is one item of a list or
one key with its value.

- **[C1]** A reader MUST reject as malformed any encoded value that is not in
  deterministic form; contains a non-finite float, an indefinite-length
  item, a duplicate map key, a non-text map key, text that is not valid
  UTF-8, a simple value other than false, true and null, or an integer
  outside the range above; applies one of the four tags above to content of
  the wrong kind or length, or has an anchor without `o`, a region of no
  defined form, or a formula whose first item is not text; exceeds a depth
  of 64; or is followed by further bytes in its record. A well-formed item under any other tag,
  bignum tags included, is an unrecognized value (§1.9): it is preserved
  and not interpreted.

*Reason.* CBOR is an Internet Standard with a defined canonical form, a
byte-string type and compact integers. A canonical text encoding would need
binary-to-text escapes and number-spelling rules, which are a well-known
source of disagreement between implementations. Models and people never read the encoding
directly; they read projections (§10.1).

### 1.3 Records

A **record** is an immutable byte string of one of two kinds:

- a **chunk**: raw bytes, at least 1 and at most 65 536;
- a **node**: one encoded value that is a map with a text entry `k` naming the
  kind of node.

The hash of a record is SHA-256 over one kind byte (`0x01` chunk, `0x02`
node) followed by the record's bytes. A record is identified only by its hash.

- **[C2]** A record is always obtained by its hash: from another record, an
  index entry or a head. A reader MUST compute the hash of the bytes it
  obtained and MUST treat a difference from the hash it asked for as
  malformed storage. A frame carries no hash of its own; a scan computes
  each record's hash, and `verify` (§10.1) reports any record reachable from
  the head that is absent or wrong, and any chunk or node frame that is not
  reachable from any head in the file.
- **[C3]** A reader MUST preserve, when copying or rewriting a universe, every
  record reachable from a retained commit, whether or not it understands the
  record's node kind.

The node kinds the core defines are `blob`, `obj`, `map` and `commit`. Where
a node names another record it does so by that record's hash, in a place
the node's schema fixes (Appendix C). A record is **reachable** from
another if a chain leads to it of such hashes, of indirects (§1.4), and of
the commits that anchors name, where those commits are present (§1.8). An
anchor counts wherever a value holds one: in properties, in values kept
outside a node, and in operations whose `work` is present. In a node of a
kind this document does not define, every 32-byte string is taken to name a
record, if such a record is present, so that what an unknown node needs is
kept with it (**C3**).

### 1.4 Blobs

A **blob** is an immutable byte stream of any length. It is pure content:
its hash depends on its bytes and nothing else, so identical content is
stored once and sent once, in every universe and between them. The player's
components, shared media, and the unchanged parts of successive versions
all rely on this.

**Chunks.** A blob's bytes are divided into chunks at places chosen by the
content itself, so that an edit in the middle of a large blob changes only
the chunks near it and the rest are shared with the version before. The
rule is a rolling hash of the *gear* kind:

- `G` is a table of 256 unsigned 64-bit numbers: `G[i]` is the first 8
  bytes, read as little-endian, of the SHA-256 of the 10 ASCII bytes
  `ufo-gear-1` followed by the single byte *i*.
- Starting each chunk with *h* = 0, for each byte *b* in turn,
  *h* = (2·*h* + `G[b]`) mod 2⁶⁴.
- A chunk ends after a byte if the chunk is then at least 2 048 bytes long
  and the top 13 bits of *h* are all zero, or if it is then 65 536 bytes
  long, or if the stream ends.

Chunks therefore average about 10 KiB. The last chunk may be shorter than
2 048 bytes. A zero-length blob has no chunks.

**The blob node.** A blob is named by the hash of its node:

| Key | Value |
| --- | --- |
| `k` | `"blob"` |
| `len` | total length in bytes |
| `sha256` | SHA-256 of the whole stream |
| `level` | 0 if `parts` names chunks; otherwise one more than the level of the nodes it names |
| `parts` | list of `[length, hash]`, in order |

A blob with many chunks is a tree, and the tree is divided by content too,
so that inserting a chunk near the start does not regroup everything after
it. Take the list of `[length, hash]` for the chunks. Divide it into
groups: a group ends after an entry if the group then has at least 2
entries and the first four bytes of that entry's hash, read as a big-endian
number, are divisible by 1 024; or if the group then has 4 096 entries; or
if the list ends. If that makes one group, it is the `parts` of the blob
node, at level 0. Otherwise each group becomes a `blob` node at level 0 for
the bytes it covers, with its own `len` and `sha256`; the list of
`[length, hash]` for those nodes is divided by the same rule; and so on,
one level higher each time, until one group remains.

The shape of a blob is therefore a function of its bytes alone. A reader
MUST treat a blob node of any other shape as malformed.

- **[C4]** To read bytes `[a, b)` a reader MUST load only the nodes and
  chunks that intersect the range, and MUST fail without returning bytes if
  one is missing, has a length other than the one stated for it, or fails
  its hash.
- **[C5]** A whole-stream read or export MUST also verify `sha256` and `len`.

*Reason.* Content-defined chunking is long established: in LBFS with Rabin
fingerprints, in backup tools such as Borg and restic, and in FastCDC,
whose gear hash this rule uses in its simplest form. Fixing every
parameter in the format, including the table, is what makes a blob's hash
independent of who stored it. The small average size suits what blobs
mostly hold here — texts and other described values, where an edit should
cost little — and costs large media about half a percent in chunk lists.

**Values kept outside a node.** Any value inside the properties of an `obj`
node (§1.5) MAY be stored outside the node, in a blob, and replaced in the
node by an **indirect**, `[kind, hash]`:

| `kind` | The blob holds | The value is |
| --- | --- | --- |
| `"b"` | raw bytes | that byte string |
| `"t"` | UTF-8 | that text |
| `"v"` | the encoding of a value | that value; it may itself contain indirects, to a depth a reader bounds (**C13**) |

A reader resolves an indirect transparently: wherever this document speaks
of a property's value, it means the value with every indirect replaced by
what it stands for. There is no other way to refer to stored content from
a property. A file's content is simply a byte string that is large, and so
is kept outside its node, raw; a long text likewise. Writers SHOULD move a
value outside when its encoding exceeds 4 096 bytes.

**Veiled indirects.** A hash can be guessed if what it hashes is short or
predictable, and a copy of a universe may hold a reference to content it
deliberately lacks (§13.3). Where that matters, the indirect is *veiled*:
`[kind, hash, true]`, where the hash is not the blob's but that of an
**opening**: a chunk of exactly 48 bytes, 16 of random salt followed by the
32 bytes of the blob's hash. Whoever holds the opening can find the blob;
whoever lacks it learns nothing, not even whether two veiled indirects
name the same content. The blob itself is never salted: wherever it is
present it is the same record as every other copy of that content.

### 1.5 Objects and revisions

An **object** has an object identity, a type and properties. Its **object identity** is
16 bytes chosen by its creator, unique within the universe, and never reused.
Its **type** is a text name. Its **properties** are a map from text names to
values.

Each state an object passes through is a **revision**, stored as a node:

| Key | Value |
| --- | --- |
| `k` | `"obj"` |
| `id` | the object's identity |
| `type` | the object's type |
| `rev` | revision number: 1 for the first revision, then previous + 1 |
| `prev` | hash of the previous revision; absent in revision 1 |
| `by` | object identity of the change (§1.7) that produced this revision |
| `salt` | 16 random bytes, fresh for every revision |
| `p` | the properties |
| `seq` | map from the name of each sequence property to the element identities of its elements (§1.7), each of which may be kept outside the node like a property's value; omitted when the object has none |

The hash of this node is the **revision hash**. It names one exact state of
one object and, through `prev`, that object's whole history. Two copies of a
universe that diverge may each produce a revision 5 of the same object; the
revision hash, not the number, is what distinguishes them, and every
reference to a specific revision uses the hash. The salt ensures that the
hash of an earlier revision, which remains visible in `prev` when the
revision itself is withheld (§13.3), cannot be used to guess what it held.

A reader checks that a revision's `id` is the object identity under which the
object map lists it and, where `prev` is present, that the previous
revision has the same `id` and `type` and a `rev` one less.

An **edge** is a property whose value is, or contains, a ref. The property
name is the relation; the direction is from the object that owns the property
to the object named. The core defines no separate edge structure. Readers
MUST be able to answer "which objects refer to this one" (§10.1).

Type and property names are case-sensitive. Names beginning `ufo.` are
reserved for this specification. Other parties MUST use a reverse-DNS prefix
of a domain they control: this project's own extensions and examples use
`ai.nampara.`, and an application such as Cursive uses its own
(`io.cursive.note`).

- **[C6]** A writer that changes some properties of an object MUST carry every
  other property of that object into the new revision unchanged, including
  properties it does not understand.
- **[C7]** A type, once given to an object, never changes.

### 1.6 The universe

A **universe** is the set of objects reachable from one **commit**. The
current revision of every object is recorded in an **object map**: a
persistent trie from object identity to revision hash, built of `map` nodes.

A `map` node covering a set of object identities that share a prefix of *d* bytes is
a leaf `{k: "map", e: [[id, hash], …]}` sorted by object identity if the set has 32
or fewer members, and otherwise an interior node `{k: "map", c: {…}}` whose
entries map the byte at position *d* of the object identity, counting from zero,
written as a two-digit lowercase hexadecimal key, to the `map` node for
that longer prefix. Every object is in the map, change objects included. The object map is
therefore a function of its contents alone: the same set of revisions has the
same hash at its root however it was built. The map of no objects is a leaf with
no entries. A reader MUST treat an object map of any other shape as
malformed: an interior node covering 32 object identities or fewer, a child that
is empty, entries out of order or under the wrong prefix.

A commit is the node:

| Key | Value |
| --- | --- |
| `k` | `"commit"` |
| `v` | format version, `1` |
| `parents` | list of the hashes of parent commits: empty for the first commit, otherwise exactly one |
| `objects` | hash of the root of the object map |
| `change` | hash of the revision of the change object this commit records |
| `height` | 0 for the first commit, otherwise 1 + the parent's height |

`change` is a hash, not an object identity, so the commit chain binds each change
to its place in history even when the object map of that commit is not at
hand (§13.3). A commit with more than one parent is a merge. Merging
divergent copies is a later feature, `ufo.merge`; until it is specified a
writer MUST NOT produce such a commit and a reader classifies one as
unavailable.

The hash of a commit is the **root hash** of the universe at that point. It
fixes every object, every byte and all history before it. The objects of a
universe at their revisions, as one commit fixes them, are its **universe
state**.

One object, the **universe object**, has the object identity of sixteen zero bytes
and type `ufo.universe`. Its properties are:

| Property | Value |
| --- | --- |
| `lineage` | 16 random bytes fixed in the first commit; shared by every later state and every fork. Required; every other property here is optional |
| `roots` | map from names to refs: the named entry points |
| `components` | map from a role — `tools`, `renderer`, or a prefixed name — to an indirect holding the component's bytes, or an anchor naming a universe, that the universe carries for it (§9.6, §8.4) |
| `faces` | list of refs to face objects (§8.2) |
| `summaries` | map from an object's identity, in lowercase hexadecimal, to a list of refs to the summaries whose scope lies in that object (§10.2). The kernel keeps it as `derive` writes them |
| `features` | map from feature name to `{v: integer, required: boolean}` |

The root named `primary` is the face a reader presents first.

A **feature** names a capability a reader needs in order to interpret part of
the universe: a profile or a codec.

- **[C8]** A reader that lacks a feature marked `required`, at the declared
  version, MUST report that full interpretation is unavailable. It MAY still
  inspect, verify, preserve and copy the universe.

### 1.7 Changes and the Chronicle

A **change** is an object of type `ufo.change` that records one transition of
the universe: one commit. Its properties are:

| Property | Value |
| --- | --- |
| `work` | a veiled indirect (§1.4) to `{ops, note}`: the operations, and optionally why the change was made, in the actor's words |
| `actor` | `{who, with}`: the principal (§14.1) who committed the change, and the name and version of the software used |
| `time` | milliseconds since 1970-01-01T00:00:00Z, as the actor reported it |
| `origin` | where content introduced by this change came from (§5.4); absent if the change introduces none |
| `evidence` | list of support links recorded by this change (§5.4); optional |
| `decisions` | list of decisions recorded by this change (§5.4); optional |
| `attributions` | list of later findings about the origin of content already present (§5.4); optional |

Everything that says what earlier content was — the operations and the note
— is in `work`, one value kept outside the node behind a veil. A copy of a
universe can therefore withhold it whole, revealing nothing of it, and keep
everything that says who and what made the content that is there (§13.3).
Content that an operation and the present state have in common — a large
file that was added and is still there — is one blob, named from both.

The change object is created by the act of committing, not by an operation:
it has no `new`, its `rev` is 1 and its `by` is its own object identity.

The **Chronicle** is the chain of commits and their changes, from the current
commit back to the first.

An **operation** states one edit to the parent commit's state. There are
four:

| `op` | Fields | Effect |
| --- | --- | --- |
| `new` | `obj`, `type` | creates an object with no properties |
| `set` | `obj`, `key`, `old`, `val` | sets property `key` to `val`; absent `val` removes it |
| `splice` | `obj`, `key`, `after`, `del`, `old`, `ins`, `forget` | in the sequence at `key`, removes the elements `del` (whose content is `old`), inserts the items `ins` after the element `after`, and discards the markers `forget` |
| `drop` | `obj` | retires the object from the current state |

Operations apply in the order listed, each to the state left by those
before it. For `set`, `key` MAY be a list, naming a path through nested
maps; maps along the path that do not exist are created, and a map left
empty by a removal remains. `old` is what was there, and is omitted when
nothing was; `val` and `ins` are omitted when nothing is put.

**Sequences and elements.** A property created by `splice` is a *sequence
property*. Its value is a text, a byte string, a list or a count, and its
items — Unicode scalar values, bytes, list items, or for a count the
units counted — are its **elements**. A *count* is a non-negative integer:
a sequence whose elements have element identities and no content of their own. It
is how time is edited (§4.5). Every
element has a permanent **element identity**: the change that inserted it, and a
number, counted from zero across everything that change inserts, in
operation order. An element's identity never changes and is never reused.
Everything that attaches to part of a sequence — an anchor, a span, an
attribution — attaches to element identities, never to positions (§4).

For each sequence property the revision records, in `seq`, the element identities
of its elements in order, as a list of runs. A run is
`[change, first, count]`: *count* elements with consecutive numbers from
*first*, inserted by *change*. A fourth item, `false`, marks the run as
**removed**: its elements hold no content and stay where they were, as
**tombstones**, so that whatever was attached to them can still be placed. The
runs not marked removed, in order, account for the property's items
exactly. Runs are an encoding and nothing more: two adjacent runs with the
same change, consecutive numbers, both removed or both not, MUST be written as one.
A reader knows a property is a sequence property because `seq` has an
entry for it.

A `splice` names elements by element identity. `after` is the element identity
`[change, number]` of the element the new items follow, or null for the
start of the sequence; it may be a removed element, and it is omitted when
nothing is inserted. `del` is a list of runs
naming elements to remove, each of which MUST not already be removed; `old`
is their content in sequence order. `ins` is a text, a byte string, a
list or a count, matching the property; for a count, `old` and `ins` are
the numbers of elements removed and inserted; its items become new elements directly after
`after`. `forget` is a list of runs naming removed elements whose tombstones
are to be discarded (§1.10); it is refused if any of them is not removed,
or is named by an anchor in the current revision of any object in the
object map. A `splice` on a property
that does not exist creates it, as the kind of value `ins` is. A `splice` on a property created by `set`, and a
`set` that gives a sequence property a value, are refused. A `set` with no
`val` removes a sequence property and its `seq` entry.

Only this specification defines operations, and these four are all of
them. Machine code is edited with them too (§12.3). Applications express
their edits in them.

The **laws of change** follow. They hold for every medium.

- **[L1] The bytes are the evidence.** A writer MUST compute operations from
  the actual content before and after, never from an account of what was
  changed.
- **[L2] Anchored.** Every operation applies to the parent commit's state,
  and every `set` and `splice` that removes or replaces something MUST carry
  exactly what was there, as `old`, compared by value.
- **[L3] Conservation.** Applying a change's operations, in order, to the
  parent commit's objects MUST produce exactly the commit's objects:
  object identity, type, properties with indirects resolved, and `seq`. Each object
  the operations touched has a new revision with `rev` one more than
  before, `prev` naming the revision before, and `by` naming this change;
  every other object has the revision it had; the change object is added.
  The parent state of the first commit is empty. A reader MUST be able to
  perform this check for any commit whose `work` is present (§10.1
  `verify`), and MUST say so where it is not.
- **[L4] Refusal.** A writer MUST reject a change whole if an `old` does not
  match what is there, an element named by `after` or `del` is not in the
  sequence, an element in `del` is already removed, a `forget` is not
  allowed, an object named does not exist, or an operation targets a change
  object. Nothing is applied in
  part and nothing is repaired.
- **[L5] No silent reconstruction.** Origin is *witnessed* when the writer
  records it as the content is introduced. An origin established in any
  other way — by aligning text, by matching, by inference — MUST be recorded
  as *inferred*, with its method (§5.4). No component may record or present
  an inferred or unknown origin as witnessed, and a reader MUST NOT infer an
  origin the universe does not record.
- **[L6] Append-only.** A change object is never modified or dropped. A commit
  is never rewritten. History is only extended. A copy may withhold history
  (§13.3); every hash that named the absent records remains.
- **[L7] No silent deletion.** `drop` removes an object from the current
  object map only. Its revisions remain in history. Removing a ref never
  drops the object it named.

A commit whose change fails L3 is **inconsistent** (§1.9).

*Reason for making the change an object.* Recording history then needs no
second mechanism. A change can be anchored to, cited, summarized, searched
and signed like anything else, and context accumulates as a side effect of
work by construction: the only way to move a universe forward is to write
down what was done.

### 1.8 References between universes

An anchor (§4.1) MAY name a commit of another universe. One record decides
what that universe is to this file: the commit named. If it is in the file,
the universe is **nested**: its records are reachable (§1.3), copying and
compaction keep them, and whatever that commit needs is present or lacking
by the rules of §2.5, exactly as if a head named it. If it is not, the
universe is **linked**: nothing of it is expected in the file, and a reader
may obtain its records from anywhere, verifying each by hash. Nesting and
linking are the same reference.

A ref is resolved in the universe of the object that holds it. Identities
are unique only within a universe — every universe object is sixteen zero
bytes — so whatever follows a reference into another universe carries that
universe along, and names an object there by commit and object identity together.

**An earlier state of the same universe.** An anchor's `u` MAY name an
earlier commit of the universe that holds it. It then names the object as
it was at that commit, together with everything it referred to then, which
is the one way to fix a composite thing exactly: a pin fixes one revision
of one object (§4.4). What such an anchor needs — the revisions, at that
commit, of the object named and of every object it reaches by refs, and
their blobs — is content (§13.3) and is kept where other history is
withheld. The rest of that commit's object map is not required.

**Editing a nested universe** is done in the file that nests it. The new
commit of the nested universe, and the change in the nesting universe that
moves its reference to that commit, are appended together and take effect
with one head (§2.2).

- **[C9]** A reference to another universe always names a commit hash and so
  can never be redirected. A newer commit of the same lineage is offered to
  the person as an update; adopting it is an ordinary recorded change.
- **[C10]** A nested or linked universe is immutable where it is referenced.
  Editing it produces a new commit of that universe, and a new reference.
- **[C11]** No reference in a universe is a file path, a URL or any other
  location. Locations MAY be recorded as hints for finding linked records
  (§2.5) and carry no authority.

### 1.9 Validation classes and limits

A reader distinguishes four conditions and MUST report each plainly and
separately:

| Class | Meaning | Reader behavior |
| --- | --- | --- |
| **malformed** | the bytes break a container, encoding or hash rule | refuse the affected records; never present them as content |
| **inconsistent** | well-formed records break a law of change or a profile rule (a failed conservation check, a `seq` that does not account for its sequence) | refuse to present or extend the affected state; offer the last consistent commit |
| **unavailable** | well-formed, but needs a feature, codec or record this reader does not have, including a record the sender withheld (§13.3) | preserve; present what can be presented; say what is missing and why |
| **unrecognized** | an object type, property, node kind, tagged value or operation this reader does not interpret | preserve untouched; show an inspectable placeholder |

- **[C12]** Opening a universe executes nothing in it, changes no reader
  setting and writes nothing.
- **[C13]** A reader MUST enforce the limits of §3.1 by its own
  configuration, never by values read from the file.

The format version is the `v` of the commit. A reader MUST refuse to write a
universe whose version it does not implement and MAY read one in a degraded,
clearly labeled mode.

### 1.10 Tombstones, and readiness for merging

**Markers are kept among collaborators.** A removed element stays in `seq`
as a tombstone for two reasons: an anchor may name it, and a collaborator's
operation, made without knowing of the removal, may name it as the place to
insert. A working form, and every copy shared with collaborators, keeps
all tombstones.

**A published copy may forget them.** Before publishing to outside readers
(§13.3), a writer MAY commit a change whose splices `forget` tombstones. A
tombstone may be forgotten only if no anchor in the universe names it. The
change is an ordinary one: it has an actor, it is in the Chronicle, and the
published copy's head is the commit that made it. Its effects are stated
plainly to the person: anchors held outside the universe that name a
forgotten element will resolve as detached in the new revision; a pin into
the earlier commit from another universe is unaffected, since that commit
is unchanged; and edits made elsewhere against the earlier state can no
longer be merged into the compacted one where they name forgotten
elements.

*The cost.* In a simulation of a heavily edited text, `seq` came to about
thirteen bytes for every character present with all tombstones kept, and
under four with them forgotten ([RATIONALE.md](RATIONALE.md)). `seq` is
kept outside its node, so an edit rewrites only the chunks near it (§1.4).

**Merging is a later feature; this design is ready for it.** The order of
a sequence is not an accident of the order in which operations arrived. It
is a function of facts that every copy agrees on:

- each element has a *parent*: the element its `splice` named in `after`,
  or the start; an element inserted together with others has the one before
  it as its parent;
- each element has a *rank*: the height of the commit that inserted it,
  then the object identity of the change, then its number;
- the sequence is the elements in the order of a walk that visits each
  element and then, at once, its children in descending rank, and their
  descendants with them;
- an element is removed if any operation removed it.

For a single line of history this gives exactly what §1.7 says: new items
go directly after `after`, because the newest commit has the highest rank.
For two lines of history that diverged, the union of their operations
gives one tree and one set of removals, and therefore one sequence,
whichever line is taken first. Appendix F has vectors: two writers insert
at the same place, each insert inside their own earlier insertions, and remove what
the other is inserting after, and the two orders of merging produce the
same result.

An element's parent is recorded in the `work` of the change that inserted
it, so only copies that hold working history can take part in a merge. A
published copy without it says so.

What remains for the merge feature is everything else: what a merge commit
records, how two `set` operations on one property are reconciled, and how
ranks are compared when a commit has two parents.

---

## 2. The pack

The pack is modeled on the way git stores a repository: immutable records
named by hash are the only truth, and everything that makes them fast to
find can be rebuilt and is disposable. It is meant to be simple enough that a
reader can be written from this section alone (§3.3).

### 2.1 Frames

The **pack** is the byte format that holds a universe's records. Alone in a
file it is the working form (§13.1); it is also the payload of every envelope
(§13.2).

A pack is an 8-byte signature followed by frames:

```
signature = 0x89 "UFO" 0x0D 0x0A 0x1A 0x0A
frame     = kind (1 byte)  codec (1 byte)  length (unsigned LEB128, shortest form, below 2⁶³)  payload
```

| Kind | Name | Payload |
| --- | --- | --- |
| `0x01` | chunk | a chunk record |
| `0x02` | node | a node record |
| `0x03` | seal | a signature (§14.2), encoded as a value |
| `0x04` | index | a lookup table that can be rebuilt (§2.4) |
| `0x05` | head | marks a committed state (§2.2) |
| `0x06` | absent | what this pack deliberately lacks (§2.5), encoded as a value |

`codec` is `0` for none or `1` for raw DEFLATE (RFC 1951). With codec
`1` the payload, whose length the frame states, is the decoded length as an
unsigned LEB128, in shortest form, followed by one complete DEFLATE stream
and nothing after it. A length that is not in shortest form makes a frame
ill-formed. The codec byte of a frame of unknown kind is not interpreted.
The same record MAY appear in more than one frame.

The payload of each kind has a required form: a chunk decodes to between 1
and 65 536 bytes; a node decodes to one value that is a map with a text `k`;
a seal or an absent frame is one value that is a map; an index is 24 + 40 × *n*
bytes for its stated *n*; a head is 72 bytes with codec 0. A frame whose
payload has that form is well-formed even if what it says is wrong: a head
whose check fails is a well-formed frame that is not a valid head. The hash of a record is always taken over
its decoded bytes. Only chunk and node frames may be compressed. Other
codecs are features (§1.6) and MUST NOT be used in a travel form (§13.2),
so that what travels can always be read.

All fixed-width integers in a pack are unsigned and little-endian. An
*offset* is the position in the pack of a frame's first byte.

- **[P1]** A reader that meets an unknown frame kind MUST skip it without
  interpreting its payload and MUST preserve it when copying the pack.
- **[P2]** A reader that meets an unknown codec MUST classify the record as
  unavailable, not malformed.

*Reason for the signature.* The leading non-ASCII byte and the line-ending
bytes detect transfers that strip high bits or rewrite line endings, as the
PNG signature does.

### 2.2 Commits are appends

A pack changes only by appending, and every append ends with a **head**
frame. To commit, a writer:

1. takes the host's exclusive lock, then finds the current state afresh
   (§2.3);
2. appends the new records and, if it writes one, an index frame;
3. makes those bytes durable;
4. appends the head frame;
5. makes the head durable, and only then reports success.

Seal and absent frames are appended the same way, followed by a head that
names the same commit as before.

The head frame has codec 0 and a payload of exactly 72 bytes:

| Bytes | Field |
| --- | --- |
| 32 | hash of the commit this head marks |
| 8 | offset of the frame holding that commit |
| 8 | offset of the latest index frame, or 0 |
| 8 | offset of the previous head frame, or 0 |
| 8 | length of the pack up to and including this frame |
| 8 | check: the first 8 bytes of the SHA-256 of the preceding 64 bytes |

A head frame is 75 bytes in all: kind `0x05`, codec `0x00`, length `0x48`,
payload.

- **[P3]** A head is **valid** if its check matches, its length field equals
  the offset just past it, and the frame at its commit offset lies before
  it — the commit's frame ends at or before the head's first byte — and
  holds a node of kind `commit` whose hash is the one the head names. Where
  the head gives the offset of a previous head, that head lies earlier, is
  itself valid, and names the same commit or an ancestor of it. No index and no scan is needed to check a head. A wrong index
  offset does not make a head invalid.
- **[P4]** A writer MUST NOT modify any byte before the last valid head,
  except through compaction (§2.6).
- **[P5]** A pack has at most one writer at a time. Where a host cannot
  supply an exclusive lock — some synchronized folders and network drives —
  the reader MUST say so before the first write, and a writer MUST NOT
  append; it writes a complete new file and replaces the old one atomically.

There are no companion files: no journal, no lock file, no sidecar.

### 2.3 Finding the current state

**The state of a pack is the commit named by the head frame in its final 75
bytes.** Every reader and every tool starts there.

1. Read the final 75 bytes. If they are a valid head, that is the current
   state.
2. Otherwise the last write was interrupted or the file is damaged. Scan
   frames from the signature forward. A frame is well-formed if its length
   parses, its payload lies within the file, and, for the six kinds this
   document defines, its codec is one the kind allows and its payload has
   the form that kind requires (§2.1). A frame with a codec this reader
   does not have is well-formed and unavailable (**P2**); the scan
   continues past it. Stop at the first frame that is not well-formed. The
   current state is the last valid head met. The reader reports how many
   bytes lie between the end of that head's frame and the end of the file.
3. If no valid head is found, no commit was ever completed in this file. It
   holds no universe, and a reader reports it as malformed.

- **[P6] Always whole.** After a write interrupted at any byte, a reader
  following these steps MUST arrive at the state of the last completed
  commit, with every record of that state intact. Step 2 costs a pass over
  the file and happens only after an interruption.
- **[P7] No silent truncation.** Before appending to a pack recovered by
  step 2, a writer MUST search the bytes after the recovered head for any
  75-byte window that is a valid head. If there is none, those bytes are an
  interrupted write and the writer truncates them. If there is one, the file
  is damaged in the middle: it is malformed, no writer may append to it, and
  the reader offers what can be salvaged.
- **[P8]** `verify` (§10.1) scans every frame. A pack whose final head does
  not lie on a frame boundary reached by that scan is malformed.

The previous-head offsets let a reader list every committed state from the
newest back without scanning.

### 2.4 The index

An **index** frame lets a reader find a record by hash without scanning. Its
payload is:

| Bytes | Field |
| --- | --- |
| 8 | count *n* of entries |
| 8 | offset of the previous index frame, or 0 |
| 8 | offset just past the last frame this index covers |
| 40 × *n* | entries, each a 32-byte hash and an 8-byte offset, in ascending order of hash |

The payload is exactly 24 + 40 × *n* bytes. A hash here is a record's hash
as §1.3 defines it; hashes are strictly ascending; where a record appears
in several frames within the index's coverage the entry gives the lowest
offset. An index need not list a record an earlier index in its chain
already lists.

An index covers every chunk and node frame between the end of the previous
index's coverage — or the end of the signature, for the first index — and
the end of its own, which may be the index frame's own offset. When a writer appends an index it
first merges into it the index before it, repeatedly, for as long as that
earlier index has no more than twice as many entries as the merged index so
far. A merged index takes the previous-index offset of the index it
absorbed and covers from where that one began. The absorbed index frame
stays in the file, outside the chain. The chain of indexes therefore stays
logarithmic in the number of records. A writer MUST append an index whenever the frames not yet covered
exceed 1024 records or 16 MiB.

To find a record, a reader searches each index in the chain, newest first,
by binary search, reading only the entries it probes, and then scans the
frames after the newest index's coverage.

- **[P9]** The index is rebuilt from the frames and carries no authority. A reader MAY ignore
  it and MUST be able to rebuild it by scanning frames. Every record is
  verified by hash when read (**C2**), so a wrong index cannot cause wrong
  content to be accepted. Before concluding that a record is absent, a
  reader MUST have scanned the frames itself or rebuilt the index: an index
  cannot hide a record that is there. A wrong index is reported and
  rebuilt; it does not make the pack malformed or a head invalid.
- **[P10]** With a correct index, reading any one record costs a number of
  seeks logarithmic in the number of records.

### 2.5 What a pack may lack

A pack is **whole** if it holds every record reachable from its head commit,
other than those of linked universes (§1.8).

A pack may lack records in exactly three ways, and a reader tells them apart
by where the missing record is referenced from, not by anything the pack
says about itself.

- **Linked universes** (§1.8). A commit named only by an anchor's `u` may
  be missing; the universe it fixes is then linked. An `absent` frame MAY list
  such commits under `links`, each `{commit, hints}`: zero or more
  locations where the records of that universe may be found. A component
  named by hash and not carried (**K3**) is listed the same way, under
  `blobs`. A hint carries no authority (**C11**): whatever is fetched is
  verified by hash.

- **Withheld history.** A missing record is *withheld* if it belongs to
  working history, as defined below.
- **Absent blobs.** A pack MAY omit the chunks of large blobs. It then
  carries an `absent` frame listing, for each, `{blob, len, hints}`: the blob
  hash, its length and zero or more locations where the chunks may be
  found. Blob nodes themselves are never omitted.

- **[P11]** A missing record of any of these kinds is unavailable (§1.9),
  and the reader says which kind. A missing record that is none of them —
  one in the content layer or the attribution layer, of this universe or
  of a nested one — is malformed storage, whatever any `absent` frame
  says.
- **[P12]** A reader MUST present everything that is present, MUST show for
  each absent blob an inspectable placeholder at the authored size (or a
  carried face, §8.1, if one is present), and MUST verify by hash anything
  it later obtains.

An `absent` frame MAY also record `history: true` as a courtesy to tools; it
has no effect on classification.

**The three layers.** Every record a universe can reach is in exactly one
of three layers. They decide what may be missing here, and what leaves a
reader (§13.3). They are computed from the head commit, and for a nested
universe (§1.8) from the commit that names it, in the same way.

An object is **live** if it is the universe object, or is named by a ref,
or by an anchor that has no `u`, anywhere in the properties or `seq` of
the current revision of a live object, values kept outside nodes
included. A change object is never live, and nothing is reached through
one.

- The **content layer** is: the nodes of the commit's object map; the
  current revision of every live object; and every record those revisions
  name outside themselves — openings, blob nodes and chunks. Where a live
  object holds an anchor with a `u` whose commit is present, it is also
  the content layer of that commit's universe, taking as live there the
  object the anchor names as well as that universe's own universe object.
- The **attribution layer** is: every commit node, from the commit back
  to the first; the current revision of every *attributing* change; and
  every record those change revisions name outside themselves, other than
  through `work`. A change is attributing if the current revision of a
  live object names it in `by` or in a run of `seq`; if it holds
  `evidence`, `decisions` or `attributions`; or if an attributing change
  names it, by a ref or an anchor, in any property but `work`. Where the
  content layer takes in another universe, the attribution layer takes in
  that universe's attribution layer, so that who wrote nested content can
  always be said.
- **Working history** is every other record: each change's `work` and the
  opening of its veil; earlier revisions; the object maps of earlier
  commits; the current revisions of objects that are not live and of
  changes that are not attributing; and all that only those name.

A missing record is therefore withheld, and not damage, exactly when what
names it is one of: the `prev` of a revision; a change's `work`; a
commit's `objects`, for a commit that is neither the head nor named by a
`u`; a commit's `change`, or an entry of the object map, where the object
it names is neither live nor an attributing change; or a record of
working history. A commit's `parents` are never withheld.

### 2.6 Compaction

**Compaction** writes a new pack, with a fresh index chain, and replaces
the old file atomically. It is always an explicit act of the person, and it
is the only way space is reclaimed. It keeps one of two sets of records:

- *everything* reachable from the head commit, discarding only frames no
  longer referenced — superseded indexes, the bytes of interrupted writes;
- *content and attribution* as §13.3 defines them, discarding working
  history. This is the same set a published copy holds.

- **[P13] Every hash survives.** Compaction copies records. It MUST NOT
  change the decoded bytes of any record it keeps; it MAY change a frame's
  codec. Every kept record therefore has the hash it had, the root hash is
  unchanged, and every seal remains valid. A writer MUST confirm, before
  replacing the old file, that the new pack's head names the same commit and
  that every record it meant to keep is present and passes its hash.

There is no third set. Attribution cannot be removed from a universe while
keeping its history verifiable. A person who needs content with no trail
starts a new universe from an export of it.

---

## 3. Durability and hostile input

A general-purpose database would have supplied crash safety, indexed reads,
resource limits and long field testing. The pack must supply the same
assurances itself. §2 gives crash safety (**P6**, **P7**) and indexed reads
(**P10**). This section gives the rest.

### 3.1 Limits

A reader MUST enforce each of these and MUST classify anything exceeding one
as malformed. A writer MUST NOT produce anything exceeding one.

| Quantity | Limit |
| --- | --- |
| Chunk record | 65 536 bytes |
| Node record, decoded | 16 MiB |
| Seal or absent payload | 1 MiB |
| Nesting depth of a value | 64 |
| Entries in one map or list | 2²⁰ |
| Interior levels of the object map above a leaf | 16 |
| Level of a `blob` node | 7 |
| Indexes in a chain | 64 |
| Parents of a commit | 1 |

A reader MUST be able to use an index larger than its memory, by reading
only the entries it probes.
A frame of unknown kind is skipped unread.

A reader MUST also bound, by its own configuration and never by values read
from a file: nesting depth of universes being presented (default 8);
running Compute-lets (default 16); active media decoders (default 8);
mounted editable regions (default 64); items in one display list (default
2²⁰); blob bytes verified or decoded for one presentation; and fuel per
Compute-let per call (§12.2). Formula evaluation is bounded by a fixed
figure, not a configurable one (§7.3), so that every reader computes the
same result.

### 3.2 Hostile files

- **[P14]** A reader MUST treat every length, offset and count in a pack as
  untrusted, and check it against the file's length and the limits of §3.1
  before allocating memory or seeking.
- **[P15]** A decoder for codec `1` MUST refuse a declared length over the
  limit for the frame's kind, MUST stop when its output reaches the declared
  length, and MUST classify a frame whose output differs from the declared
  length as malformed.
- **[P16]** A pack contains no executable schema, stored query, trigger or
  instruction to the reader. Parsing a pack performs no action other than
  reading bytes and computing hashes.
- **[P17] Total parsing.** For every possible input, the pack parser and the
  value decoder MUST terminate with a classification of §1.9. They never
  crash, never loop without consuming input, and never allocate more than a
  fixed amount beyond the limits of §3.1.
- **[P18]** A blob's declared length costs nothing to state. A reader MUST
  verify and read only the ranges it is about to use (**C4**), and MUST NOT
  perform a whole-stream read beyond its configured bound without the
  person's consent.

### 3.3 Small enough to rewrite

The pack's claim to archival durability is not a long history. It is that
it can be re-implemented from these pages by one person in a weekend, in
any language, decades from now, given only SHA-256 and DEFLATE, which every
platform has.

An independent, read-only pack reader that lists, verifies and extracts
records is to need no more than 500 lines in a general-purpose language.
The kernel's own share is budgeted in §11.1.

Two obligations bind every release of the reference implementation. They
are requirements on the project, not on files.

- **[P19] The weekend test.** This document — §1 to §5 and Appendices C
  and F — MUST be sufficient to write that independent reader, including the
  conservation check. The test is run for real
  before the format is frozen: someone with no other knowledge of the
  project is given only those sections and the conformance packs with their
  test vectors, and the result must pass every read-only pack test. If it
  takes more than two days, §2 is simplified.
- **[P20] Fuzzing.** The pack parser and value decoder MUST be tested by
  coverage-guided fuzzing before every release: at least 10⁹ executions
  since the last change to either, with no crash, no input taking over one
  second, and no allocation beyond **P17**. Every input that ever caused a
  failure is kept in the conformance corpus.

### 3.4 Caches

- **[P21]** A reader MAY build, on its own device, any **cache** it finds
  useful — a search index, a table of which objects refer to which, the
  changes that touched each object, a database such as SQLite. Such a store
  is disposable: it is built from the pack, can be deleted without loss, is
  never exchanged, is never the working or travel form, and is never
  consulted in preference to the pack when the two disagree.

The reasons for choosing a pack over an embedded database are in
[RATIONALE.md](RATIONALE.md).

---

## 4. Anchors, coordinate spaces and time

### 4.1 Anchors

An **anchor** refers to a region inside an object. It is a map:

| Key | Value | Presence |
| --- | --- | --- |
| `o` | object identity | required |
| `a` | map from axis name to region on that axis (§4.2) | absent means the whole object |
| `r` | hash of the revision the anchor was made at | optional; required in a pin |
| `u` | commit hash of another universe (§1.8) | absent means this universe |
| `d`, `s` | digest of the anchored content, and its salt (§4.4) | present makes the anchor a **pin** |

Everything that attaches one thing to another uses an anchor: a Portal's
placement, a span of a text, an attribution, a citation, a comment, a
transclusion, the sources of a derivation, the scope of a summary, the
resource of a permission.

### 4.2 Axes

A coordinate space is the set of named **axes** an object offers. Each axis
is one of three kinds. The core defines the kinds, and how a region of
each is resolved by a reader that knows nothing of the object's type.

| Kind | Bound to | A region is | Examples |
| --- | --- | --- | --- |
| **sequence** | a sequence property (§1.7): one with an entry in `seq`. The axis has the property's name | `["s", from, to]`: two boundaries | characters of a text, the time of a timeline |
| **continuous** | an *extent* the object's type defines | `["c", low, high]`, low ≤ high, in the axis's base coordinates | the time of a clock, width, height, the bytes of an asset |
| **keyed** | a property that is a map, or a list of refs in which no object appears twice; the axis has the property's name | `["k", key, …]` | rows and columns of a table, children of a group, functions of a module |

A region states its own kind in its first element, so that an anchor can
be resolved by a reader that knows nothing of the object's type.

A **boundary** on a sequence axis is a place between elements, named by an
element: `[change, number, 0]` is the place just before that element, and
`[change, number, 1]` the place just after it. `"start"` and `"end"` are
the two ends of the sequence. A region whose two boundaries are the same is
a point: a caret.

A region over several axes is their product: a rectangle of a picture for a
span of time is a region on `t`, `x` and `y`. A coordinate space may have
any number of axes of each kind. Space in three dimensions is three
continuous axes, `x`, `y` and `z`, and is as much a part of the anchor
model as a line of text: a volume is a region on all three, a moment in an
animated scene adds `t`, and a part of the scene is a key.

The **extent** of a continuous axis is a pair `[low, high]` in present
coordinates: where the axis begins and ends. This document defines two.
A clock's `t` runs from its `start` to its `end` (§4.5). An asset's
`bytes` runs from 0 to the length of its bytes (§5.2). Every other extent
is defined with the type that has it, in the part of the specification
that defines the type. A reader resolves a continuous region of an object
whose type it does not know all the same (§4.3): it cannot clip it, and
says so.

Time is an integer count of **flicks**: units of
1/705 600 000 of a second. Every common frame rate and audio sample rate
divides one second into a whole number of flicks, so time arithmetic is exact
and identical on every host. Lengths on spatial axes are floats.

### 4.3 Resolving an anchor

An anchor is resolved against a revision of its object — normally the
current one — and that revision alone. No history is consulted and nothing
is replayed. An anchor made long ago and one made now are resolved the same
way.

**Sequence axis.** The position of a boundary is the number of elements not
removed that come before it in `seq`. For a boundary that names a removed
element, before and after give the same position. A region covers the
elements between its two boundaries. Because a boundary is fixed to an
element, what is later inserted at the edge of a region falls inside or
outside it according to which element the boundary names: a region whose
end is "before the element that follows" takes in what is typed at its
end, and one whose end is "after its last element" does not. Whoever makes
the anchor chooses.

**Continuous axis.** An object MAY hold, in a property `scales`, for any of
its continuous axes, a list `[a, b, c]` — *a* and *b* positive integers, *c* an integer, or a
float on an axis whose positions are floats:
the axis's **scale**, mapping base coordinates to current ones. A position
*x* in base coordinates is now at *x·a/b + c*; with integer positions the
division rounds toward negative infinity. Whoever makes an anchor from a
current position *y* writes the base position *(y − c)·b/a*, rounded the
same way; an anchor made from a position and resolved at once may
therefore land one unit below it, and never above. An axis with no scale has the
scale `[1, 1, 0]`. A change that moves everything on an axis — trimming the
start of a recording, rescaling a drawing — sets the scale in the same
change, as an ordinary `set`, and regions follow with no further act.
`scales` is a map from axis name to scale.

The region, now in present coordinates, is then clipped to the extent,
both taken as closed intervals: `[low, high]` against `[e₀, e₁]` gives
`[max(low, e₀), min(high, e₁)]`. A region that only touches an end of the
extent resolves to that point. A region wholly outside it — `high` below
`e₀`, or `low` above `e₁` — is detached. Where the reader does not know
the extent, because it does not know the object's type, the region is not
clipped and is never detached, and the reader reports it as *unclipped*.

**Keyed axis.** A region resolves to those of its keys that are present.

- **[A1]** A region is **detached** if, on some axis, it resolves to
  nothing: a sequence region with different boundaries and no element left
  between them, or whose property or elements are not there; a continuous
  region wholly outside the extent; a keyed region none of whose keys is
  present; or any region of an object that has been dropped. A reader MUST
  report a detached anchor as detached and MUST NOT move it to
  similar-looking content.
- **[A2]** Resolution is a function of the anchor and the revision alone.
  It needs no earlier revision and no operation, and therefore works
  unchanged in a copy whose history is withheld (§13.3).
- **[A3]** Two readers resolving the same anchor against the same revision
  MUST obtain the same result.
- **[A4] Content that moves is anchored where it lives.** A scale carries
  an anchor through a uniform shift or scaling of an axis, and through
  nothing else. Time that is edited is therefore a sequence, whose anchors
  name elements and survive a cut as anchors in a text survive a deletion
  (§4.5). Space has no such order: moving one thing in a scene shifts
  nothing else, so there is nothing for a splice to express. An
  arrangement in space is changed by moving children — the nodes of a
  scene — never by rewriting positions inside one object, and an asset's
  own axes never change. A reader that anchors a place for a person anchors it in
  the innermost object whose own axis covers it: the caption's clock, the
  footage's own time, the node. That anchor follows its content wherever
  the content is moved. A region on the axis of a container names that
  place in the container, whatever comes to occupy it, and a reader that
  shows such an anchor says so.

A move — a cut and a paste — removes elements and inserts new ones.
Attribution follows the new elements (§5.4). Anchors to the old elements
detach; they do not follow the move.

### 4.4 Pins and staleness

A **pin** is an anchor that also records, in `r`, the revision it was made
at; in `s`, 16 random bytes of salt; and in `d`, the digest of what it
covered. The salt is there so that a pin to a short passage does not reveal
it.

The **digest** is the SHA-256 of these bytes, in order:

1. The salt.
2. The encoding of the *covered value*, with indirects resolved. For a
   whole object it is the object's properties. For a region it is a map
   from each axis the region names to that axis's part:
   - on a sequence axis, a list of two items: the covered items, as a text,
     a byte string or a list, or for a count the runs of `seq` that the
     region covers, each cut to the region and none of them removed; and a map, from property name to a map from
     key to value, built as follows. Take each property of the object,
     other than the sequence property itself, whose value is a map. Keep
     each of its entries whose value holds, at any depth, an anchor that
     has no `u`, names this object, and has a region on this axis that
     shares at least one present element with the covered ones. A point
     shares none, and removed elements do not count. A property with no
     entry kept is left out; the map is there even when it is empty. For
     a text, these are the spans that touch the passage;
   - on a keyed axis, a map from each key of the region that is present to
     its entry, or for a list of refs a list of those of its refs that the
     region names, in the order of the list;
   - on a continuous axis, the object's properties.

   A property named `snapshot` is left out of every covered value, of any
   object: it is a machine state, not content.
3. For each *followed* object, in ascending order of object identity: its object identity
   and then its current revision hash, or 32 zero bytes if it is no longer
   in the object map.

The followed objects are those the covered value names by a ref, at any
depth and inside formulas too, or by an anchor that is the value of a
property named `of` and has neither a digest nor a `u`; and all that those
reach in the same way through the whole of their properties, each once.
Three are never followed: the pinned object itself; a change object; and
any object made by the same derivation as the object
that holds the pin (one whose `from.by` is the same), so that a derived
thing shown inside its own source does not make itself stale.

A digest therefore changes when anything the region shows could change: a
pin to a group goes stale when a child changes, a pin to a chart goes stale
when its data does, and a pin to five minutes of a timeline goes stale when
a play that touches those five minutes does, and not when another does. Appendix F has vectors.

A pin is **current** if, resolved against the object's current revision,
its region is attached and has the same digest; and, where what it pins is
itself derived (§5.3), that derivation is current. Otherwise it is
**stale**. A pin fixes one revision of one object, and says whether what
that object shows has changed since. It does not keep what the object
referred to; an anchor that names a commit does (§1.8).

An anchor that names a commit — of another universe, or an earlier one of
this — names something that never changes, and is always current. A newer
commit of another universe is offered as an update (**C9**).

This one test is how every derived thing in a universe knows whether it still
reflects its sources (§5.3).

### 4.5 Clocks

A **clock** maps a parent's time to a child's time:

```
child time = (parent time − start) × rate + offset      while start ≤ parent time < end
```

`start`, `end` and `offset` are in flicks; `rate` is a rational number given
as two integers; the product is rounded toward negative infinity. Outside
its interval the clock's content is not present. A clock MAY carry `repeat`,
a count or `forever`: its interval then recurs end to end. A clock has no
layout of its own: its children occupy the box the clock was given, in
order from back to front, and are arranged by being groups or panes.

A clock is in one of three modes:

| Mode | Child time is driven by |
| --- | --- |
| `locked` | the parent, by the formula above; pausing or scrubbing the parent pauses or scrubs the child |
| `free` | the child's own running time: it starts at `offset` when the parent enters the interval and then advances with the root clock at `rate`, whatever the parent does. Scrubbing the parent out of the interval and back restarts it. When a face is sampled at a stated time with no history of scrubbing, a free clock reads as a locked one would |
| `held` | a formula (§7.3), typically of presentation state: a slider that scrubs an animation, a key that advances a deck |

The time at the top of a presentation is the **root clock**, supplied by the
reader. The reader MAY drive it from real time, from a scrub position, from a
recorded log, or picture by picture for export.

**Timelines.** A clock MAY hold `t` as a sequence property whose value is
a count (§1.7): its elements are flicks. The clock is then a **timeline**.
Its `t` axis is a sequence axis, its length is the count, and `end` is
`start` plus that length divided by `rate`. Time on a timeline is edited
as text is. Adding time is a `splice` that inserts flicks; a cut from the
middle is a `splice` that removes them; and every anchor to a region of
`t` names elements, so it stays on the moment it named, moves earlier when
time before it is cut, and detaches when its own moment is cut (**A1**).
An element's identity is the change that inserted it and a number, so a
place in time is, in effect, a stretch of inserted time and an offset into
it.

What plays is attached to the timeline as spans are attached to a text. A
timeline's `plays` is a map from a key to `{at, of, offset}`: `at` is an
anchor to a region of the timeline's own `t`; `of` is a ref to the object
that plays there; `offset`, zero if absent, is the time in `of` at the
place where the region begins. That place is read from the anchor, never
from the sequence: the region's first boundary MUST name an element,
`[c, n, side]`, and not `"start"`; then *n₀* is *n* + *side*, whether or
not the elements there are still present. At an element numbered *n* by
the same change *c*, inside the region, `of` is present at its own time
`offset` + (*n* − *n₀*). So a play whose beginning is cut still shows,
at each moment that remains, what it showed there before; and since an
element that an anchor names is never forgotten (§1.10), the place stays
readable. A timeline stores no `end`: it follows from the count. At an element of
any other change it is not present. The time a play shows is thus a
function of the element's identity, never of its position: when flicks
are cut from the middle of a play, the numbers on either side of the cut
no longer run on, and what plays skips exactly what was cut. Time later
inserted inside a play's region belongs to whatever is placed on it. The
plays present at one moment are composed in ascending order of key, over
the clock's children, which are given the position as their time and so
play through every cut.

- **[T3]** A reader that cuts, trims or extends a timeline for a person
  does it by `splice` on `t`, and never by rewriting `at` or `offset` of a
  play it is not otherwise changing.

- **[T1]** No component reads real time. Every component that asks the time
  receives the time of the clock it was placed under.
- **[T2]** A component's behavior MUST be a function of its content, its
  state, its clock's time and the input delivered to it.

T1 and T2 are what make export, replay and shared sessions possible: the same
description sampled at the same times yields the same result.

---

## 5. Content and memory

A **profile** is a versioned set of object types, properties, axes and
operations layered on the core. Each is declared as a feature (§1.6). This
section defines `ufo.text/1`, `ufo.asset/1`, `ufo.derivation/1` and
`ufo.chronicle/1`.

### 5.1 Text

A text object (`ufo.text`) holds characters and their structure.

| Property | Value |
| --- | --- |
| `chars` | the content: one text value |
| `spans` | map from span key to span |
| `syntax` | absent for native text; otherwise the media type of a foreign syntax the characters are written in |

`chars` is a sequence property (§1.7): its elements are Unicode scalar
values, each with a permanent element identity that names the change that
introduced it. A position, where one is shown to a person or an agent, is a
count of scalar values from the start.

*Reason for scalar values.* They are independent of any encoding and can
never split a character. Offsets in UTF-8 bytes or UTF-16 code units convert
to and from them deterministically.

A text may be of any length; a long one is kept outside its node (§1.4).

A **span** marks a region of the characters:

| Field | Value |
| --- | --- |
| `at` | an anchor to a region of this text's `chars` (§4.2) |
| `kind` | `block` or `inline` |
| `role` | semantic role: `paragraph`, `heading`, `item`, `quote`, `code`, `emphasis`, `strong`, `link`, `embed`, `markup`, or a prefixed name, which readers treat as an opaque label |
| other fields | properties: `level`, style properties (Appendix A), `href` (an anchor), `child` (a ref) |

A span's region is fixed to elements, so it stays in place however the text
around it is edited, with no work by anyone (§4.3). By convention a block
span begins just before its first element and ends just before the first
element of whatever follows it, or at `end`; text typed at the end of a
paragraph therefore joins that paragraph. An inline span chooses for
itself whether text typed at its end joins it. Where a writer means
otherwise — text typed at the very start of a paragraph — it moves the
boundary in the same change, with a `set`.

Block spans do not partially overlap one another: any two are disjoint or
nested. Blocks are separated by their spans, not by characters: `chars`
holds no paragraph separators, and the plain-text face (§8.3) writes a line
break between blocks. Blocks at the same position are ordered by span key.
An inline span left with no extent is removed in the same change; a block
span is kept. A `markup` span covers characters that are part of a foreign
syntax and are not presented. An `embed` span covers exactly one U+FFFC
OBJECT REPLACEMENT CHARACTER and names, in `child`, the object presented at
that position — a Portal, or a group such as a table.

- **[X1]** A reader MUST check that the `seq` of `chars` accounts for it
  exactly before presenting or editing a text. On
  failure the text is inconsistent (§1.9): it is not presented, edited or
  saved as though it were the document. No separate digest is stored: the
  hash of the revision already fixes the characters (**C2**).
- **[X2]** The kernel never parses a syntax. A text with a `syntax` is
  presented through its spans. If it has none, it is presented as its literal
  characters.
- **[X3] One source of structure.** A writer that does not implement a
  text's `syntax` MUST NOT edit its characters in place, because it cannot
  keep markup and spans in agreement. It either leaves the text read-only
  or first converts it to native text — removing the marked-up characters
  and the `syntax` in one recorded change — and then edits that.

A writer that keeps a marked-up source authoritative — Markdown, for
example — stores the source as `chars`, declares `syntax`, and writes the
spans its own parser derives, including `markup` spans over the markup. Every
reader then presents the document richly without knowing the syntax, and the
writer's source remains exact. A writer converting a foreign document to
native text instead writes clean characters and spans, with no `syntax`.

How each role is presented by default — spacing, indent, list markers and
numbering — is in Appendix A; any of it may be overridden on the span.

### 5.2 Assets

An asset (`ufo.asset`) preserves a file's exact bytes.

| Property | Value |
| --- | --- |
| `bytes` | the file's content: a byte string, kept outside the node (§1.4) |
| `media` | media type, determined by whatever imports the file, from the content first and the name second |
| `name` | the original file name, if any |

Any file can enter a universe as an asset, before any presenter understands
it. `bytes` is set whole and is never edited in place: it is not a
sequence property, and a different file is a different value. Its
`bytes` axis is continuous, in whole bytes: the region `["c", 3, 7]` is
the four bytes at offsets 3 to 6. Its extent is from 0 to the length, and
it never has a scale.

- **[X4]** Exporting an asset's original bytes MUST reproduce them exactly
  and MUST be offered separately from any export of a presentation of it.

### 5.3 Derivation

Any object produced from other content carries a `from` property:

| Field | Value |
| --- | --- |
| `sources` | list of pins (§4.4) to exactly what it was made from |
| `how` | `render`, `transmute`, `summarize`, `structure`, `import`, or a prefixed name |
| `by` | ref to the change that performed the derivation |

Who or what performed it, and with what, is the `origin` of that change
(§5.4): for a model, the model, the prompt, the parameters and who asked;
for a tool, its name, version and parameters. `from` and that origin
together are the object's **recipe**: everything needed to make it again.
`by` is recorded because an object's own `by` moves on when a person edits
it, and the recipe must still be found.

- A **rendition** is an asset with a derivation: a document rendered to
  pages, a video encoded for broad playback, a poster picture.
- A **transmutation** is a set of described objects whose derivation has
  `how` `transmute`, made by a model: a deck from a report, a narration
  from a document.
- Summaries (§10.2), native description converted from a foreign document
  (§9.4) and a described module lifted from a carried one (§12.3) are
  derivations too.

Each object a derivation creates carries a `from`. Its `sources` are those
that object was made from: all the derivation's sources, or the subset the
writer states for that object, so that a slide leads back to its section
and not only to the whole report (**D2**). Where many objects share one
`from`, writers SHOULD keep it outside the node (§1.4), where it is stored
once.

- **[D1]** A derivation is **stale** if any of its pins is stale (§4.4) —
  which includes a pin to something that is itself a stale derivation — and
  current otherwise. Readers MUST compute this; it is never stored.
- **[D2]** A derived object is never treated as independent of its sources:
  a reader showing it MUST be able to lead the person to each source region.
- **[D3] Made again in one step.** `refresh` (§10.3) repeats a recipe. The
  kernel does not run models: a writer that has the model takes the recipe
  from `recipe` — the same sources, resolved as they now are; the same
  `how`, model, prompt and parameters — runs it, and hands the result to
  `refresh`, which commits it as `derive` would, naming the earlier change
  in its origin's `context`. For a derivation by a tool the reader holds,
  the reader does all of it. The result may give new revisions to objects
  the earlier derivation made, add objects and drop some; `recipe` lists
  those a person has edited since, so that a writer can ask before
  replacing them. The earlier revisions remain in history. Where part of the recipe is withheld
  — a prompt, in a copy published without working history (§13.3) — the
  recipe still says how the object was made, and `refresh` is refused with
  that reason.
- **[D4] Transmutation is an operation of the format.** A model's
  contribution enters through `derive` (§10.3): the kernel, not the model
  or the application, computes the pins from the sources actually supplied
  and binds them to the new objects and to the change's origin in one
  commit. Every reader can therefore show, for any transmuted content, what
  it was made from, by what, at whose request, and whether it is current.
  The model runs outside the format. What the format does is supply its
  inputs exactly, bind its outputs to them, know when the two have parted,
  and hold what is needed to do it again.

### 5.4 The Chronicle: origin, evidence, decision

The Chronicle (§1.7) keeps three kinds of fact apart. None can be inferred
from another, and no operation merges them.

**Origin** — who or what contributed content. It is the `origin` property of
the change that introduced the content:

| Field | Value |
| --- | --- |
| `basis` | `witnessed`, `inferred` or `unknown` |
| `by` | `person`, `model` or `tool`; absent when the basis is `unknown` or the content was copied |
| `who` | for `person`: a principal (§14.1) |
| `model` | for `model`: the model's identifier as its provider states it |
| `prompt` | for `model`: a ref to the text object holding the prompt, or the conversation it was part of |
| `context` | list of pins to what the contribution was made from or answers: for a model, what it was given; for an undo or a refresh, the earlier change |
| `tool` | for `tool`: name and version of the deterministic process |
| `asked` | for `model` and `tool`: the principal at whose request it ran |
| `copied` | an anchor to the region this content was copied from |
| `sources` | written by the kernel for a copy within the same universe: for what this change inserted, in order, `[count, change]` naming the changes that first introduced it |
| `method` | for `inferred`: the name of the method that established the origin, and its parameters |
| `confidence` | for `inferred`, where the method yields one: a number from 0 to 1, or the method's own grade |
| `parameters` | map: whatever else is needed to describe the contribution |

The **basis** says how the origin is known.

- **Witnessed**: the writer that introduced the content recorded the origin
  at that moment, from its own part in the act — it received the keystrokes,
  it called the model, it performed the copy.
- **Inferred**: the origin was established some other way, for instance by
  aligning a document's text before and after an edit made elsewhere. The
  record says by what method and, where the method gives one, with what
  confidence.
- **Unknown**: the content arrived with no record of where it came from.

One change has one origin. A writer with content from two origins writes two
changes.

**Copies.** A change whose content was copied from one region carries
`copied`. The copy is an action; it creates no new origin and erases none.
`basis` describes the copy itself: witnessed if the writer performed it,
inferred if it was detected afterward. The change holds the copied content
like any other, so the universe is whole even if the source is never seen
again. If the source is at hand and does not match, the change is
inconsistent (§1.9).

Where the source is in the same universe, the kernel resolves the origin
when the change is committed, while the source is certainly present, so
that the answer never depends on history that may later be withheld. It
writes `origin.sources`: a list of `[count, change]` saying, for the
elements this change inserted, in order — or with a count of 1 for a value
that is not a sequence — which change first introduced what was copied,
following earlier copies back to their beginning. The copied elements are
new elements with element identities of their own; their attribution is read
through `sources`. Moving text by cut and paste therefore keeps every
character's attribution.

Where the source is in another universe, the origin is the origin of the
region named there, found by following the anchor when that universe is at
hand, and otherwise reported as "copied from" that exact commit and region.

The basis a reader shows for copied content is the weakest along the chain:
a witnessed copy of text whose origin was inferred is shown as inferred.

**Later findings.** Origin is never revised (**R1**), but knowledge may
arrive after content does: another device's history, an alignment pass
afterward. A change records such a finding in `attributions`, each
`{about, origin}`: an anchor to content already present and an origin with
its basis. `why` returns the original origin and every later finding, in
order, each labeled. A reader shows as the content's origin the strongest
of them — witnessed over inferred over unknown — and, among equals, the
latest.

- **[R1]** The origin recorded when content is introduced is never changed
  or removed by any later change, including acceptance, editing nearby,
  moving, copying, or a later finding.
- **[R2] Three bases, visibly.** A reader MUST present witnessed, inferred
  and unknown origins so that each is distinguishable at a glance from the
  others, in every place it presents origin, including projections for
  agents. Inferred is never shown as witnessed. Unknown is never shown as
  written by a person. For an inferred origin the reader MUST make the
  method and confidence available.

A witnessed origin is still a statement by the change's actor: software
reporting its own part in an act. Whether to believe the actor is the
business of seals (§14.2), and a reader shows, beside any origin, whether
the commit that recorded it is covered by a seal.

**Evidence** — what supports content. An entry in a change's `evidence`:

| Field | Value |
| --- | --- |
| `claim` | anchor to the content supported |
| `support` | pin to the supporting content: a region of a source, a dataset, a test, another universe |
| `kind` | `cites`, `quotes`, `computed-from`, `tested-by`, `exercised-by`, `consulted`, or a prefixed name, which readers treat as an opaque label |
| `note` | text |

- **[R3]** `consulted` records that a source was available to a model. It is
  not a claim that the source supports the content.
- **[R4]** A derivation's sources (§5.3) say what something was made from.
  They are not evidence that it is true. A summary MUST NOT be the `support`
  of any evidence.
- **[R5]** Evidence whose `support` pin is stale is shown as stale.

**Decision** — what a person chose. An entry in a change's `decisions`:

| Field | Value |
| --- | --- |
| `about` | anchor to content, or ref to a change |
| `verdict` | `accept`, `reject`, `revise`, `approve`, `retract`, or a prefixed name, which readers treat as an opaque label |
| `who` | the principal who decided |
| `note` | text |

- **[R6]** A decision changes no origin and certifies no accuracy. Accepted
  content from a model remains content from a model.
- **[R7]** The current decision about content is the latest decision in the
  Chronicle whose `about` covers it. Earlier decisions remain.

**Attribution** is the answer to "where did this come from", and it is read,
never reconstructed (**L5**). For a region of a sequence, `why` returns, for
each stretch of elements with one origin: the change, its origin with its
basis, where it was copied from if it was, the evidence
whose `claim` covers the run and the current decision. For any other
property, it returns the same for the change named by `by` in the revision
that last set it.

- **[R8] Every byte has a known origin.** For every byte of content in a
  universe, `why` MUST return a change and its origin: for an element of a
  sequence, by its element identity; for any other property value, by the revision that set it; for a
  byte of a blob, by the change that first referred to the blob; for a
  statement of a function, as for any element; for an implied byte of a
  printed module, "computed by the printer" from the description (**N4**).
  The bytes of records
  themselves — encodings, hashes, maps — are computed by the kernel from
  that content by the rules of §1 and have no other origin. An origin may be
  `unknown`; it is never absent.

---

## 6. Limits and terms

Elegance is measured. Each number below is a limit. Exceeding one is a
design failure to be explained in writing and resolved by simplifying, or by
changing this section with the reason recorded. Every milestone reports
every row.

These numbers were set before any implementation exists. The first
implementation MUST report the measured values, and this section is then
revised once, with reasons, before anything is frozen.

### 6.1 Size of the idea

| Measure | Limit | Now | Reason |
| --- | --- | --- | --- |
| Primitives | 11 | 11 | these sufficed for all four worked examples (§15) |
| Layout rules | 3 | 3 | two candidates were deleted (§7.4) |
| Roles of a text that the kernel presents | 10 | 10 | the document vocabulary inside the text primitive (§5.1, Appendix A) |
| Axis kinds | 3 | 3 | every anchor in §15 uses one of them |
| Operations, in all | 5 | 4 | `remap` became a property; the printer's twelve operations became the same four (§12.3) |
| Node kinds | 5 | 4 | values kept outside a node are blobs |
| Kinds of reference a value can hold | 5 | 4 | ref, anchor, formula, indirect; the link is gone |
| Frame kinds | 6 | 6 | |
| Formula operators | 64 | 52 | a spreadsheet's essentials, and `ask`; anything larger is a Compute-let |
| Base host functions | 12 | 10, plus 2 exports | small enough to implement identically on every host |
| Capabilities | 20 | 18 | each is something only a host can provide (**H4**) |
| Operations across UFO's own capabilities | 64 | 28 written: `store` 8, `inflate` 2, `verify` 1, `media` 1, `encode` 4, `engine` 6, `text` 3, `present` 2, `blobs` 1. `objects` exposes the projections and actions | seven optional capabilities are unwritten, and count here when they are |
| Operations of `gpu` | — | 27 sketched (Appendix E) | counted apart: they mirror an outside standard, WebGPU, and are not the format's to keep small |
| Concepts | 123 | 123 | what a capable newcomer must learn, counted without classification (§6.2): 59 for the core, 64 across the four profiles. The limit is the honest count; a new concept MUST displace one |
| All defined terms | 176 | 176 | concepts, and the names of parts and statuses. The limit is the honest count; a new term MUST displace one |

### 6.2 Glossary

Every defined term is in one table, in the part that defines it. Each
is marked one of two ways. A **concept** is an idea a capable newcomer must
learn to understand or build that part, whatever it is made of. A
**part** is a name for a piece of a record or for a status: its one line
here is the whole of it. A row naming several terms counts as that many.
A word has one meaning throughout the specification.

| Part | Concepts | Parts and statuses | All terms |
| --- | --- | --- | --- |
| Core | 59 | 33 | 92 |
| Presentation | 21 | 11 | 32 |
| The player | 16 | 2 | 18 |
| Execution | 13 | 4 | 17 |
| Travel and trust | 14 | 3 | 17 |
| **The whole format** | **123** | **53** | **176** |

The eleven primitives, the four operations, the three kinds of axis and
the three layouts are counted where they are named: a newcomer learns
each. Earlier drafts reported 39 concepts by listing only those that
could not be expressed as compositions of others, and placing the rest in
two further tables. Nothing was hidden, but the number answered a
different question from the one a newcomer asks.

**Terms of the core.**

| Term | | Meaning | § |
| --- | --- | --- | --- |
| Absent frame | part | a frame listing what a pack deliberately lacks, and where it may be found | 2.5 |
| Agent | concept | software, usually a language model, acting through the agent interface | 0.1 |
| Anchor | concept | a reference to an object or to a region of one | 4.1 |
| Asset | concept | an object whose `bytes` is a blob | 5.2 |
| Attribution | concept | origin, evidence and decision, read for a region | 5.4 |
| Axis | concept | a named dimension of an object: sequence, continuous or keyed | 4.2 |
| Basis | concept | how an origin is known: witnessed, inferred by a stated method, or unknown | 5.4 |
| Blob | concept | bytes of any size, stored as chunks under a tree divided by the content itself | 1.4 |
| Border | part | the moment of import or export | 5.3 |
| Boundary | part | one end of a sequence region, fixed before or after an element | 4.3 |
| Cache | part | anything a reader keeps on its own device that can be rebuilt from a pack | 3.4 |
| Change | concept | the object recording one commit: who, when, origin, evidence, decisions, and the work | 1.7 |
| Chronicle | concept | the chain of commits and their changes | 1.7 |
| Chunk | part | a record of raw bytes | 1.3 |
| Clock | concept | a mapping from a parent's time to a child's, over an interval | 4.5 |
| Commit | concept | the record fixing a universe's state and history: parent, object map, change | 1.6 |
| Compaction | concept | rewriting a pack without what is no longer reachable, every kept hash unchanged | 2.6 |
| Coordinate space | part | the set of axes an object offers | 4.2 |
| Count | part | a sequence property whose elements have no content of their own: a non-negative integer | 1.7 |
| Decision | concept | what a person chose to do about content | 5.4 |
| Derivation | concept | the record of what an object was made from, how, and by what | 5.3 |
| Derived | part | having a derivation | 5.3 |
| Detached | part | of a region: what it named is gone | 4.3 |
| Digest | concept | a salted hash of a region's content and of everything that content refers to | 4.4 |
| Edge | part | a property holding a ref | 1.5 |
| Element | concept | one item of a sequence property, with an element identity | 1.7 |
| Element identity | concept | the permanent name of an element: the change that inserted it and a number | 1.7 |
| Evidence | concept | what supports content | 5.4 |
| Feature | concept | a declared requirement a reader needs in order to interpret a universe | 1.6 |
| Finding | concept | a later statement about origin, added beside the first and never replacing it | 5.4 |
| Flick | part | the unit of time: 1/705 600 000 of a second | 4.5 |
| Frame | concept | one unit of a pack: a record, an index, a seal, a head, or a list of what is absent | 2.1 |
| Hash | concept | the SHA-256 digest that names a record | 1.1 |
| Head | concept | the frame that ends a commit; the last one names the state of the pack | 2.2 |
| Host | concept | the platform a reader runs on | 0.1 |
| Index | part | a lookup table from hash to offset, rebuilt at will | 2.4 |
| Indirect | concept | a value kept outside its node, in a blob, and named there by hash | 1.4 |
| Item | part | one member of a list or of a sequence | 1.2 |
| Laws of change | concept | the seven rules every change obeys; among them conservation: replaying the operations on the parent state gives the new state exactly | 1.7 |
| Lineage | concept | 16 bytes fixed in the first commit and shared by every later state and fork: what makes two files the same universe | 1.6 |
| Linked | concept | of another universe: named by hash, its commit not in this file | 1.8 |
| Malformed, inconsistent, unavailable, unrecognized | part | the four things a reader reports of content it cannot use | 1.9 |
| Nested | concept | of another universe: its commit is in this file | 1.8 |
| Node | part | a record holding one value | 1.3 |
| Note | part | words a writer attaches to a change, an evidence entry or a decision | 1.7 |
| Object | concept | an object identity with a type and properties | 1.5 |
| Object identity | concept | the permanent name of an object: 16 bytes chosen at its creation, never changed and never reused | 1.5 |
| Object map | concept | the trie from object identity to current revision, whose shape depends only on what it holds | 1.6 |
| Offset | part | a position in a pack, in bytes | 2.1 |
| Opening | part | the small record that connects a veiled indirect to its content | 1.4 |
| Operation | concept | one edit to the state: `new`, `set`, `splice` or `drop` | 1.7 |
| Origin | concept | who or what contributed content | 5.4 |
| Pack | concept | the byte format that holds a universe's records: the file | 2 |
| Person | part | the human using a reader | 0.1 |
| Pin | concept | an anchor with a digest of what it covered | 4.4 |
| Play | part | an entry of a timeline that attaches an object to a region of its time | 4.5 |
| Profile | concept | a versioned set of types, properties and axes, declared as a feature | 5 |
| Property | part | a named value of an object | 1.5 |
| Reachable | part | named, directly or through other records, from a commit | 1.3 |
| Reader | concept | any software that opens a UFO | 0.1 |
| Recipe | concept | a derivation with the origin of the change that made it: enough to make the thing again | 5.3 |
| Record | concept | an immutable byte string named by its hash: a chunk or a node | 1.3 |
| Ref | concept | a value naming an object by its object identity | 1.2 |
| Region | concept | the part of an object an anchor names, axis by axis | 4.1 |
| Rendition | concept | an asset with a derivation | 5.3 |
| Revision | concept | one state of an object, stored as a node that names the revision before | 1.5 |
| Revision hash | part | the hash of a revision | 1.5 |
| Root | part | an entry point named by the universe object | 1.6 |
| Root clock | part | the time at the top of a presentation, supplied by the reader | 4.5 |
| Root hash | concept | the hash of a commit | 1.6 |
| Run | part | consecutive elements written as `[change, first, count]` | 1.7 |
| Scale | concept | on a continuous axis, the mapping from the coordinates anchors are written in to present ones | 4.3 |
| Sequence property | concept | a property edited by `splice`: a text, a byte string, a list or a count | 1.7 |
| Signature | part | the fixed bytes that begin a pack | 2.1 |
| Span | concept | an anchor on a text's elements, with a role and properties | 5.1 |
| Stale | concept | of a pin: what it covered has changed. Otherwise it is current | 4.4 |
| Timeline | concept | a clock whose time is a sequence of flicks, edited by `splice`, with what plays attached to it as spans are to a text | 4.5 |
| Tombstone | concept | what a removed element leaves in place, so that what was attached to it can still be placed | 1.7, 1.10 |
| Transmutation | concept | described objects that a model made from other objects | 5.3 |
| Type | part | the name of the kind of an object | 1.5 |
| Universe | concept | the set of objects reachable from one commit | 1.6 |
| Universe object | concept | the object that names a universe's entry points, faces, features and components | 1.6 |
| Universe state | concept | the objects of a universe at their revisions, fixed by a commit | 1.6 |
| Value | concept | null, boolean, integer, float, text, bytes, list, map, or one of four references | 1.2 |
| Veiled | concept | of an indirect: naming its content through an opening, so that the hash reveals nothing when the content is withheld | 1.4 |
| Whole | part | of a pack: holding every record its state names | 2.5 |
| Withheld | part | deliberately absent, its hash remaining | 2.5 |
| Work | concept | the operations and note of a change, kept behind a veil so that they can be withheld | 1.7 |
| Writer | concept | any software that changes one | 0.1 |

---

### 6.3 Corner-painting checklist

| Check | Result | Where |
| --- | --- | --- |
| The core contains no assumption that content is text, that layout is a page, or that time does not exist | Holds. §1 names no medium. Text first appears in §5.1 as one profile; a page is a composition (§7.4); time is an axis kind and a clock | §1, §4.2, §4.5 |
| Anchors are generic and every profile defines how its anchors survive edits | Holds, more strongly: survival is defined once per axis kind in the core, and a profile only declares its axes | §4.2, §4.3 |
| The clock model serves video, audio, animation, simulations and games | Holds: locked, free and held clocks cover §15.1 (video, audio, captions), animation by formulas of `time`, and Compute-lets through `time()` | §4.5, §15.1, §15.2 |
| Presenters are sandboxed components behind a defined interface and can be carried as Compute-lets | Holds for every presenter a universe carries: each is a sandboxed Compute-let behind the host interface. The four base presenters are deliberately not components: they are the host's own facilities, behind the display list, which is equally a defined interface | §9.1, §9.2, §9.3, **M3** |
| Every reference uses content addressing or stable identity, never file paths | Holds. Refs are identities; indirects and anchors name hashes; locations are hints without authority | **C11** |
| Every derived artifact records what it was derived from | Holds. One derivation record with pins, for renditions, transmutations, summaries, derived spans and imports | §5.3 |
| The host interface's optional capabilities have a defined request and degradation path | Holds | **H1**, **H2** |
| Nesting depth, active decoders and active Compute-lets are bounded by the reader, not trusted to the file | Holds | §3.1, **C13**, **O7** |
| The Chronicle and ledger share foundations so one navigation approach serves every medium | Holds, more strongly: code is edited by the same four operations as everything else, so the ledger is the Chronicle and nothing more; the same projections navigate both | §12.5, §10.1 |

"Holds" here means the design satisfies the check on paper. None has been
tested.

---

## Appendix C. Schema of the core records

In CDDL (RFC 8610). `hash` is 32 bytes and `id` is 16.

```
hash   = bytes .size 32
id     = bytes .size 16
salt   = bytes .size 16
ref      = #6.55461(id)
anchor   = #6.55462({ o: id, ? a: { * tstr => region }, ? r: hash,
                      ? u: hash, ? d: hash, ? s: salt })
formula  = #6.55463([ tstr, * value ])
indirect = #6.55464([ "b" / "t" / "v", hash, ? true ])
           ; hash of a blob node; or, with `true`, of an opening: a chunk of
           ; 48 bytes, a salt followed by the blob node's hash
region   = [ "s", boundary, boundary ] / [ "c", number, number ]
         / [ "k", * (tstr / id) ]
boundary = "start" / "end" / [ id, uint, 0 / 1 ]   ; change, number, before / after
value    = nil / bool / int / float / tstr / bstr / [ * value ]
         / { * tstr => value } / ref / anchor / formula / indirect

blob   = { k: "blob", len: uint, sha256: hash, level: uint,
           parts: [ * [ uint, hash ] ] }                  ; length, hash
obj    = { k: "obj", id: id, type: tstr, rev: uint, ? prev: hash,
           by: id, salt: salt, p: { * tstr => value },
           ? seq: { * tstr => [ * run ] / indirect } }
run    = [ id, uint, uint ] / [ id, uint, uint, false ]   ; change, first, count; false = removed
map    = { k: "map", e: [ * [ id, hash ] ] }
       / { k: "map", c: { * tstr => hash } }
commit = { k: "commit", v: 1, parents: [ ? hash ], objects: hash,
           change: hash, height: uint }

seal   = { commit: hash, key: bytes .size 32, time: uint,
           ? name: tstr, signature: bytes .size 64 }
           ; signature = Ed25519 over the 10 bytes "ufo-seal-1" followed by the
           ; SHA-256 of the encoding of this map without `signature` (§14.2, in the part on travel and trust; a reader of the core keeps seal frames and need not verify them)
absent = { ? history: bool,
           ? blobs: [ * { blob: hash, len: uint, hints: [ * tstr ] } ],
           ? links: [ * { commit: hash, hints: [ * tstr ] } ] }

change-p = { work: indirect,
             actor: { who: principal, with: { name: tstr, version: tstr } },
             time: uint, ? origin: origin, ? evidence: [ * evidence ],
             ? decisions: [ * decision ], ? attributions: [ * finding ] }
work   = { ops: [ * op ], ? note: tstr }
op     = { op: "new", obj: id, type: tstr }
       / { op: "set", obj: id, key: key, ? old: value, ? val: value }
       / { op: "splice", obj: id, key: tstr, ? after: [ id, uint ] / nil,
           ? del: [ + [ id, uint, uint ] ], ? old: sequence, ? ins: sequence,
           ? forget: [ + [ id, uint, uint ] ] }
       / { op: "drop", obj: id }
key    = tstr / [ + tstr ]
sequence = tstr / bstr / [ * value ] / uint     ; uint: a count
principal = { ? key: bytes .size 32, ? name: tstr }
```

`change-p` is the `p` of an object of type `ufo.change`, and `work` is the
value its indirect stands for. In these schemas `uint` and `int` are within
the integer range of §1.2. A key this schema does not list is unrecognized
and preserved in `obj`, `commit`, `seal`, `absent`, `work` and in properties;
in `map` and `blob` nodes, whose shape must be a function of their
contents, it is malformed. Values are compared exactly: an integer is never
equal to a float.

The Chronicle's records (§5.4):

```
origin   = { basis: "witnessed" / "inferred" / "unknown",
             ? by: "person" / "model" / "tool", ? who: principal,
             ? model: tstr, ? prompt: ref, ? context: [ * anchor ],
             ? tool: { name: tstr, version: tstr }, ? asked: principal,
             ? copied: anchor, ? sources: [ * [ uint, id ] ], ? method: { name: tstr, * tstr => value },
             ? confidence: float / tstr, ? parameters: { * tstr => value } }
evidence = { claim: anchor, support: anchor, kind: tstr, ? note: tstr }
decision = { about: anchor / ref, verdict: tstr, who: principal, ? note: tstr }
finding  = { about: anchor, origin: origin }
```

The drawing contract (§9.2):

```
display-list = [ * item ]
item  = [ "push", { ? m: [ 6*6 float ], ? clip: rect / path-d, ? alpha: float, * meta } ]
      / [ "pop" ]
      / [ "text", { s: tstr, x: float, y: float, font: [ + (tstr / hash) ], size: float,
                    weight: uint, ? slant: bool, color: color, ? dir: "ltr" / "rtl",
                    adv: float, * meta } ]
      / [ "path", { d: path-d, ? fill: paint, ? stroke: paint, ? width: float,
                    ? join: tstr, ? cap: tstr, ? dash: [ * float ], ? rule: tstr, * meta } ]
      / [ "raster", { source: hash / uint / { mem: uint, w: uint, h: uint },
                      from: rect, to: rect, ? smooth: bool, ? t: int, ? rate: [ int, int ], * meta } ]
      / [ "samples", { source: hash / { mem: uint, n: uint, hz: uint, channels: uint },
                       at: int, ? t: int, ? rate: [ int, int ], ? gain: float, ? pan: float, * meta } ]
      / [ "surface", { id: uint, to: rect, * meta } ]
      / [ "hit", { id: uint, shape: rect / path-d, events: [ * tstr ], * meta } ]
meta   = ( ? src: anchor, ? label: tstr, ? role: tstr )
rect   = [ 4*4 float ]                      ; x, y, width, height
color  = [ 4*4 float ]                      ; red, green, blue, alpha, 0 to 1, sRGB
paint  = color / { kind: "linear" / "radial", stops: [ + [ float, color ] ],
                   from: [ 2*3 float ], to: [ 2*3 float ] }
path-d = [ * ( [ "M", float, float ] / [ "L", float, float ] / [ "Q", 4*4 float ]
             / [ "C", 6*6 float ] / [ "Z" ] ) ]
event  = [ "pointer", { phase: tstr, x: float, y: float, buttons: uint, pointer: uint, hit: uint, time: int } ]
       / [ "key", { phase: "down" / "up", key: tstr, mods: uint, hit: uint, time: int } ]
       / [ "text", { s: tstr, hit: uint, time: int } ]
       / [ "edit", { at: uint, del: uint, s: tstr, hit: uint, time: int } ]
       / [ "scroll", { dx: float, dy: float, hit: uint, time: int } ]
       / [ "focus", { on: bool, hit: uint, time: int } ]
       / [ "resize", { w: float, h: float, time: int } ]
```

The capability contract, the `text` operations, derivations and described
code (§9.3, §5.3, §12.3):

```
request = { capability: tstr, ? scope: value, required: bool, why: tstr, without: tstr }

text-piece        = { s: tstr, font: [ + (tstr / hash) ], size: float, weight: uint,
                    slant: bool, dir: "ltr" / "rtl" }
measure-request = { piece: text-piece, at: [ * uint ] }       ; offsets, in characters of `s`
measure-reply   = { adv: [ * float ], asc: float, desc: float }   ; one advance for each offset
locate-request  = { piece: text-piece, x: float }
locate-reply    = { at: uint }
edit-request    = { mount: rect, s: tstr, piece: text-piece, id: uint } / { unmount: uint }
present-raster  = { child: tstr, w: uint, h: uint }       ; the reply is a raster source (§9.2)
present-deliver = { child: tstr, event: event }

derivation = { sources: [ + anchor ], how: tstr, by: ref }   ; the `from` property; every source is a pin

module-p = { funcs: [ * ref ], ? memory: { initial: uint, maximum: uint },
             ? globals: { * tstr => { type: valtype, mutable: bool, init: int / float } },
             ? exports: { * tstr => ref / "memory" / { global: tstr } },
             ? data: { * tstr => { at: uint, bytes: bstr } }, ? table: [ * ref ] }
func-p   = { name: tstr, params: [ * [ tstr, valtype ] ], results: [ * valtype ],
             locals: [ * [ tstr, valtype ] ], ( body: [ * stmt ] // import: tstr ) }
stmt     = int / tstr / [ tstr, * ( stmt / ref / [ * tstr ] / functype / number ), ? attrs ]
attrs    = { ? result: valtype, ? label: tstr, ? offset: uint, ? align: uint }
functype = [ [ * valtype ], [ * valtype ] ]
valtype  = "i32" / "i64" / "f32" / "f64"
```

`module-p` and `func-p` are the `p` of objects of type `ufo.module` and
`ufo.func`.

Byte-level test vectors for this schema are in Appendix F.

## Appendix D. Checklist for any change to this design

The ten questions asked of every proposed addition to this specification,
the kernel, a presenter or a binding are in
[CONTRIBUTING.md](CONTRIBUTING.md), with the deletion test (**V3**). One
rule binds simplifications too: a simplification may remove mechanism,
never reach. Whoever removes a concept shows what it now composes from, and
that every worked example of §15 still works.

## Appendix F. Test vectors

The directory `vectors/` beside this document holds byte-level vectors.
They are normative, with this text: where the two disagree, one of them has
a defect, to be reported. The script that produced them is in
`tools/vectors/` and is not normative: it is not a reader, a writer or a
library, nothing may depend on it, and where it disagrees with this text or
the vectors, it is wrong. The kernel, when it exists, must reproduce every
vector on its own.

**Status.** Every group of vectors and every file has one of three
statuses, kept in `vectors/STATUS.json` and copied into each vector file.

| Status | Meaning |
| --- | --- |
| provisional | made by this specification's author only: the generator, the author's throwaway kernel (`spike/`), or both |
| reproduced | one independent implementation, built from the text alone with the expected values withheld, agrees |
| confirmed | two independent implementations agree, at least one of them from a different model family, or a person |

Nothing is confirmed yet. Where an independent implementation disagrees
with a vector, the disagreement is a finding against the text, the
vector, or both, and the status does not rise until it is settled.

The files in `vectors/provisional/` were produced by running the author's
throwaway kernel on the packs above:

| File | Contents |
| --- | --- |
| `provisional/composition.json` | `compose.ufx` composed at a stated width with a stated, synthetic measure of text: every row and its items; the rows on each page; the plain-text face (§7.7, §8.3) |
| `provisional/staleness.json` | three pins made at the first commit of `history.ufx`, and whether each is current, stale or detached at each later commit (§4.4) |
| `provisional/layers.json` | for four packs, the layer of every record: content, attribution, working history (§13.3) |
| `provisional/projections.json` | twelve projections of the packs, as text: `overview`, `object`, `text`, `history`, `why`, and outlines by `expand` (§10.1, §10.2, Appendix B) |

`spike/QUERY-NOTES.md` and `spike/COMPOSITION-NOTES.md` list each place
where the text did not decide what the kernel should do, and what it did.

| File | Contents |
| --- | --- |
| `vectors/minimal.ufx` | a whole pack of 2599 bytes holding one commit: a universe object, a text reading "Hello, universe." with one paragraph span, a face, and the change that made them, with an index and a head |
| `vectors/history.ufx` | a pack of 27722 bytes holding three commits, built to exercise what the first does not (below) |
| `vectors/nested.ufx`, `vectors/linked.ufx` | one universe twice, of 4031 and 2391 bytes: with the records of a second universe that its Portal names, and without them (§1.8). The root hash is the same |
| `vectors/timeline.ufx` | a pack of 11695 bytes holding four commits of one timeline (§4.5): ten seconds of time with three plays; two seconds cut from the middle; one second inserted; the start of a play cut |
| `vectors/published.ufx` | `history.ufx` as it is published (§13.3): a pack of 9437 bytes holding its content and attribution layers, its seal, and an `absent` frame saying that working history is withheld |
| `vectors/pins.ufx` | a pack of 7886 bytes holding one commit: a text with an empty block and an inline span, an asset, a clock with a scale, and an object holding an anchor of every kind (§4.2 to §4.4, §5.2) |
| `vectors/published-timeline.ufx`, `vectors/published-nested.ufx` | `timeline.ufx` and `nested.ufx` as they are published (§2.5): 3778 and 2557 bytes |
| `vectors/module.ufx` | a pack of 3714 bytes holding a described module of two functions (§12.3) |
| `vectors/compose.ufx` | a pack holding one text with every block role, a document face and a face of pages (§7.7, §8.3) |
| `vectors/vectors.json` | every vector below, as hexadecimal |

`history.ufx` extends the first pack. Its second commit, by a model,
replaces a word in the text (a `splice` that removes eight elements and
inserts five), replaces a property (a `set` with `old`), adds an asset
whose bytes are a blob, a clock, and forty small objects, so that the
object map gains an interior node; one node frame and three chunk frames are
compressed, and two properties are kept outside their nodes. A frame of unknown
kind precedes it and a seal follows it, with its own head. Its third
commit, by a person, appends a character, inserts and removes another,
shortens the clock and sets its frame, drops the asset and records a
decision. The file ends with a chain of two indexes and four heads.

| Group | What is fixed |
| --- | --- |
| `values` | the encoding of 20 values, each given both as a description and as bytes: integers at the width boundaries, floats at three widths and negative zero, map key order, the four tags, the three kinds of region, plain and veiled indirects |
| `values_malformed` | 10 encodings a reader must reject (**C1**) |
| `record_hashes` | the hash of a chunk and of a node |
| `gear` | the first entries of the chunking table and the hash of the whole table |
| `blobs` | 8 blobs: empty; three bytes; just under the minimum chunk; zero bytes at and just over the maximum chunk; one mebibyte of a stated pseudo-random stream, with its chunk count and first chunk lengths; the same with ten bytes inserted in the middle, which shares all but one chunk with it; and forty mebibytes, which is a tree of two levels |
| `value_kept_outside` | a value, the blob that holds it, the indirect that names it, and the veiled form with its salt and opening (§1.4) |
| `object_maps` | hashes of the root nodes of maps with 1, 32, 33 and 9 000 entries: a leaf, the largest leaf, the smallest interior node, and three levels |
| `minimal_pack` | every record of `minimal.ufx` with its offset and hash; the index; the head; the root hash. Removing its last byte leaves no valid head |
| `history_pack` | for each of the three commits: root hash, object-map root, number of objects, the text, its `seq`, and what its span resolves to; the blob; the seal with the exact bytes signed; four truncations of the file with the state each recovers to; ten anchors resolved at the last commit, on sequence and continuous axes, including a replaced word, a point at a removed element, clipping, and a dropped object |
| `resolve_sequence` | a sequence with removed elements, and nine regions resolved against it (§4.3) |
| `merge_readiness` | two writers diverging from one text, with insertions at the same place, inside their own earlier insertions and after an element the other removes; the order of elements and the text, identical whichever writer's operations are taken first (§1.10) |
| `digests` | two pins at the last commit of `history.ufx`, each with its salt, its covered value as bytes, the objects followed and the digest (§4.4): a passage of the text with the span that touches it, and the face object, whose ref to the text is followed |
| `resolve_continuous` | six regions resolved through a scale: shift, integer rounding of both signs, clipping, detachment, floats |
| `timeline` | for each of the four commits of `timeline.ufx`: the count, the `seq`, where three anchors and three plays resolve, and at sampled positions the element there and the time of each play present. The fourth commit cuts the start of a play |
| `published` | the hashes of the content layer and of the attribution layer of `history.ufx`, the number of records in its working history, and what a reader of `published.ufx` finds: the same state, the same text, the same answer to who wrote each character. Generator and kernel agree |
| `pins` | where each anchor of `pins.ufx` resolves: continuous regions inside, clipped to, touching and outside an extent, one whose extent is unknown, keyed regions, a point. Eight digests, each with its covered value and followed objects, one for each choice §4.4 settles |
| `published_timeline`, `published_nested` | the content and attribution layers of `timeline.ufx` and `nested.ufx`, and what a reader of each published copy finds: a commit whose change is withheld; who wrote the nested text |
| `nested` | for the two files above: the commit the anchor names, the Portal's `of` as bytes, which records are reachable only through the anchor, how a reader classifies each file, and the plain-text face of each (§8.3) |
| `printer` | the described module of `module.ufx` — a function with operands folded, a function with a loop, a call, a global and named locals, three exports and a memory — as encoded values, and the 119 bytes the printer makes of it |
| `instrumentation` | three modules and their instrumented forms under **M4**: an entry region, a loop region, and NaN canonicalization, each with the fuel it consumes |

Three values, for a first check without opening the files:

| | |
| --- | --- |
| Hash of the chunk `abc` | `1e18834c426d00e57788444cb3ccd62c771b420c095bb0c4e040a8c122c4570d` |
| Root hash of `minimal.ufx` | `804ec174f46f773d36c1fe7318c999ff21c338b735cb4e5068224725b9cce8bf` |
| Root hash of `history.ufx` | `821d84843a250c08a1f2b36670e715fd8c1ac1c2f0bcc5ad787277f7b7a76d72` |

How far these have been checked. For version 0.8 an independent reader was
written from this document alone, with every expected value withheld until
it ran. It opened all eight packs, replayed every change, and agreed with
304 of the 311 values it could be compared with on its first run; none of
the seven differences was a misreading of §1 to §5, two were errors in
this appendix's prose, since corrected, and four came from the layers of
what travels, which this document uses and does not define. It
reproduced the `timeline`, `digests` and `published` groups and the
provisional staleness values. It recorded 52 places where this text was
unclear. Before that, a second implementation, by the same
author as the script, opened the first five packs, read the expected text from
the first two, presented the nested text and the linked label, and printed
the module to the bytes recorded. The WebAssembly vectors were run in one
engine and the seal verified there. Nothing else has been reproduced, and
no vector has been reproduced by anyone who did not write this document.
[VISION-TRACE.md](VISION-TRACE.md) keeps the account.
