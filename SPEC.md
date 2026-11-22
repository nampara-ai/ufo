# The Universal File Object (UFO) Specification

**Version 0.6 — draft for review. Nothing here is frozen. Nothing here has been implemented.**

This document specifies the UFO format: a single file that holds a universe of
described meaning, carries the small player and tools that present and edit
it, records where every byte of it came from, and can be extended by people
and AI without loss.

The aim is an open, universal primitive of computing, in the way the PDF
became one: owned by no application and outliving all of them. One universe
can present as anything a computer can present — document, plain text,
image, video, audio, data, diagram, three-dimensional scene, application,
game — and universes nest and link into bodies of work of any size. Text is
implemented first. Every other medium is designed here, now, on the same
foundations.

It is written to be built from, and to stand alone: it depends on no other
document. It contains no code. Where it chooses a technology it gives the
reason, so the choice can be challenged. [CORE.md](CORE.md) states the whole
format in two pages; [RATIONALE.md](RATIONALE.md) explains why the format is
shaped as it is.

## 0. Reading this document

### 0.1 Conventions

The words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are used as in RFC 2119
and RFC 8174. Requirements are of two kinds: sentences that use one of those
words, and rules that carry a label such as **[C3]**. A labeled rule is a
requirement in full, whether or not it uses one of those words; where it is
written in the indicative, it states what every conforming reader and writer
does. Everything else is explanation. The conformance suite tests every
labeled rule.

Every term is defined once, in **bold**. §16 lists them all, in three
tables: the concepts a newcomer must learn, the names given to compositions
of those concepts, and the structural terms of the storage layer.

*Reader* means any software that opens a UFO. *Writer* means any software that
changes one. *Person* means the human using a reader. *Agent* means software,
usually a language model, acting through the agent interface (§11.8). *Host*
means the platform a reader runs on: a browser, an operating system.

### 0.2 Status of each section

| Sections | Status in this draft |
| --- | --- |
| §1–§4 core, pack, anchors | Complete, with a schema (Appendix C) and byte-level test vectors (Appendix F, `vectors/`); names and tag numbers provisional |
| §5–§7 vocabulary, player, host interface, faces | Complete in structure. The drawing contract (§6.2) and the capability contract (§6.3) are complete; layout semantics need a conformance corpus before freeze. Operation sets: complete for `text`, `objects` and `present`; sketched for `gpu` (Appendix E); to be written for the rest |
| §8–§11 profiles | Text, asset, derivation, Portal, Chronicle: complete. Compute-let, printer, ledger, summaries: complete in structure, operation tables provisional |
| §9.4 video and image envelopes | Complete in structure; the `ufo:` scheme and file-name endings provisional |
| §12 budgets | Numbers are targets set before measurement; the first implementation confirms or revises each with reasons |
| Timelines, scenes, grids, canvases, conversations | Compositions of the primitives, not profiles; see §5.5 |

### 0.3 The design in nine sentences

1. A **universe** is a set of **objects**. An object has an identity, a type and
   properties. A property value may refer to another object, to bytes, or to a
   region inside an object.
2. Everything is stored as immutable **records** named by the hash of their
   contents. The state of a universe is one hash. So is its entire history.
3. Every change to a universe is an object too: a **change**, holding the
   operations performed, who performed them, where the new content came from,
   what supports it and what was decided about it. The chain of changes is the
   Chronicle. A universe moves forward only by extending it, and any other
   alteration is detectable.
4. Any location in any object is named by an **anchor**: object, axes, region,
   revision. There are three kinds of axis — sequence, continuous and keyed —
   and one rule for each saying how an anchor survives an edit.
5. What a universe shows is described with eleven **primitives**: text, path,
   raster, samples, region, group, clock, Portal, surface, data and formula.
   A document, a chart, a video and an interface are arrangements of these.
6. One small **kernel**, compiled once to WebAssembly, reads the description
   and composes it into a list of things to draw and play for a given
   viewport and moment. The host draws them. Foreign media are decoded by the
   host; foreign documents are converted once, at the border.
7. A **face** is any presentation of a universe. It is sampled from the
   description on demand, carried inside as a stored rendition, or transmuted
   by AI into new described content with its sources attached.
8. Programs are objects as well. A **Compute-let** is WebAssembly that runs in
   a sandbox with no authority except what the person grants. Its machine code
   is written only by the **printer**, and the Chronicle entries the printer
   writes are its ledger.
9. The file is a **pack**: an append-only sequence of records. Alone, it is
   the working form. Inside an **envelope** — by default a web page that also
   carries the player — it is the travel form, and that is how it leaves a
   reader, with its content and attribution but without its working history
   unless the person chooses to send that too.

Everything below is the precise version of those nine sentences.

---

## 1. The core

The core knows records, objects, properties, references, changes, anchors and
time. It does not know what text, a page, a frame or a polygon is.

### 1.1 Hashes

A **hash** is the 32-byte SHA-256 digest (FIPS 180-4) of a byte string. In
text it is written `sha256:` followed by 64 lowercase hexadecimal digits.

*Reason.* SHA-256 is standardized, unbroken, hardware-accelerated and present
in every browser and operating system. One algorithm keeps every identity
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
| **ref** | the identity of an object in the same universe (§1.5) |
| **anchor** | a reference to an object, or to a region of one (§4) |
| **formula** | an expression that computes a value (§5.3) |
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
directly; they read projections (§7.5).

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
  each record's hash, and `verify` (§7.5) reports any record reachable from
  the head that is absent or wrong, and any chunk or node frame that is not
  reachable from any head in the file.
- **[C3]** A reader MUST preserve, when copying or rewriting a universe, every
  record reachable from a retained commit, whether or not it understands the
  record's node kind.

The node kinds the core defines are `blob`, `obj`, `map` and `commit`. Where
a node names another record it does so by that record's hash, in a place
the node's schema fixes (Appendix C). A record is **reachable** from
another if a chain of such hashes, and of indirects (§1.4), leads to it.

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
deliberately lacks (§9.3). Where that matters, the indirect is *veiled*:
`[kind, hash, true]`, where the hash is not the blob's but that of an
**opening**: a chunk of exactly 48 bytes, 16 of random salt followed by the
32 bytes of the blob's hash. Whoever holds the opening can find the blob;
whoever lacks it learns nothing, not even whether two veiled indirects
name the same content. The blob itself is never salted: wherever it is
present it is the same record as every other copy of that content.

### 1.5 Objects and revisions

An **object** is an identity with a type and properties. Its **identity** is
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
| `by` | identity of the change (§1.7) that produced this revision |
| `salt` | 16 random bytes, fresh for every revision |
| `p` | the properties |
| `seq` | map from the name of each sequence property to the identities of its elements (§1.7), each of which may be kept outside the node like a property's value; omitted when the object has none |

The hash of this node is the **revision hash**. It names one exact state of
one object and, through `prev`, that object's whole history. Two copies of a
universe that diverge may each produce a revision 5 of the same object; the
revision hash, not the number, is what distinguishes them, and every
reference to a specific revision uses the hash. The salt ensures that the
hash of an earlier revision, which remains visible in `prev` when the
revision itself is withheld (§9.3), cannot be used to guess what it held.

A reader checks that a revision's `id` is the identity under which the
object map lists it and, where `prev` is present, that the previous
revision has the same `id` and `type` and a `rev` one less.

An **edge** is a property whose value is, or contains, a ref. The property
name is the relation; the direction is from the object that owns the property
to the object named. The core defines no separate edge structure. Readers
MUST be able to answer "which objects refer to this one" (§7.5).

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
persistent trie from identity to revision hash, built of `map` nodes.

A `map` node covering a set of identities that share a prefix of *d* bytes is
a leaf `{k: "map", e: [[id, hash], …]}` sorted by identity if the set has 32
or fewer members, and otherwise an interior node `{k: "map", c: {…}}` whose
entries map the byte at position *d* of the identity, counting from zero,
written as a two-digit lowercase hexadecimal key, to the `map` node for
that longer prefix. Every object is in the map, change objects included. The object map is
therefore a function of its contents alone: the same set of revisions has the
same root hash however it was built. The map of no objects is a leaf with
no entries. A reader MUST treat an object map of any other shape as
malformed: an interior node covering 32 identities or fewer, a child that
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

`change` is a hash, not an identity, so the commit chain binds each change
to its place in history even when the object map of that commit is not at
hand (§9.3). A commit with more than one parent is a merge. Merging
divergent copies is a later feature, `ufo.merge`; until it is specified a
writer MUST NOT produce such a commit and a reader classifies one as
unavailable.

The hash of a commit is the **root hash** of the universe at that point. It
fixes every object, every byte and all history before it.

One object, the **universe object**, has the identity of sixteen zero bytes
and type `ufo.universe`. Its properties are:

| Property | Value |
| --- | --- |
| `lineage` | 16 random bytes fixed in the first commit; shared by every later state and every fork. Required; every other property here is optional |
| `roots` | map from names to refs: the named entry points |
| `components` | map from a role — `tools`, `printer`, `shaper`, `rasterizer`, or a prefixed name — to an indirect holding the component's bytes, or an anchor naming a universe, that the universe carries for it (§6.6, §7.4, §11.4) |
| `faces` | list of refs to face objects (§7.2) |
| `features` | map from feature name to `{v: integer, required: boolean}` |
| `summary` | ref to the top summary (§11.7), if any |

The root named `primary` is the face a reader presents first.

A **feature** names a capability a reader needs in order to interpret part of
the universe: a profile, a codec, an operation vocabulary.

- **[C8]** A reader that lacks a feature marked `required`, at the declared
  version, MUST report that full interpretation is unavailable. It MAY still
  inspect, verify, preserve and copy the universe.

### 1.7 Changes and the Chronicle

A **change** is an object of type `ufo.change` that records one transition of
the universe: one commit. Its properties are:

| Property | Value |
| --- | --- |
| `work` | a veiled indirect (§1.4) to `{ops, note}`: the operations, and optionally why the change was made, in the actor's words |
| `actor` | `{who, with}`: the principal (§10.1) who committed the change, and the name and version of the software used |
| `time` | milliseconds since 1970-01-01T00:00:00Z, as the actor reported it |
| `origin` | where content introduced by this change came from (§8.5); absent if the change introduces none |
| `evidence` | list of support links recorded by this change (§8.5); optional |
| `decisions` | list of decisions recorded by this change (§8.5); optional |
| `attributions` | list of later findings about the origin of content already present (§8.5); optional |

Everything that says what earlier content was — the operations and the note
— is in `work`, one value kept outside the node behind a veil. A copy of a
universe can therefore withhold it whole, revealing nothing of it, and keep
everything that says who and what made the content that is there (§9.3).
Content that an operation and the present state have in common — a large
file that was added and is still there — is one blob, named from both.

The change object is created by the act of committing, not by an operation:
it has no `new`, its `rev` is 1 and its `by` is its own identity.

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
property*. Its value is a text, a byte string or a list, and its items —
Unicode scalar values, bytes or list items — are its **elements**. Every
element has a permanent **identity**: the change that inserted it, and a
number, counted from zero across everything that change inserts, in
operation order. An element's identity never changes and is never reused.
Everything that attaches to part of a sequence — an anchor, a span, an
attribution — attaches to element identities, never to positions (§4).

For each sequence property the revision records, in `seq`, the identities
of its elements in order, as a list of runs. A run is
`[change, first, count]`: *count* elements with consecutive numbers from
*first*, inserted by *change*. A fourth item, `false`, marks the run as
**removed**: its elements hold no content and stay where they were, as
markers, so that whatever was attached to them can still be placed. The
runs not marked removed, in order, account for the property's items
exactly. Runs are an encoding and nothing more: two adjacent runs with the
same change, consecutive numbers and the same state MUST be written as one.
A reader knows a property is a sequence property because `seq` has an
entry for it.

A `splice` names elements by identity. `after` is the identity
`[change, number]` of the element the new items follow, or null for the
start of the sequence; it may be a removed element, and it is omitted when
nothing is inserted. `del` is a list of runs
naming elements to remove, each of which MUST not already be removed; `old`
is their content in sequence order. `ins` is a text, a byte string or a
list, matching the property; its items become new elements directly after
`after`. `forget` is a list of runs naming removed elements whose markers
are to be discarded (§1.10); it is refused if any of them is not removed,
or is named by an anchor anywhere in the universe. A `splice` on a property
that does not exist creates it, as the kind of value `ins` is. A `splice` on a property created by `set`, and a
`set` that gives a sequence property a value, are refused. A `set` with no
`val` removes a sequence property and its `seq` entry.

Because operations name elements and not positions, an operation means the
same thing whatever else has changed around it. Merging divergent copies,
in a later phase, rests on this.

Only this specification defines operations. The printer's operations
(§11.4) are the one further vocabulary; they are verified by replaying them
with the printer. Applications express their edits in the four above.

The **laws of change** follow. They hold for every medium.

- **[L1] The bytes are the evidence.** A writer MUST compute operations from
  the actual content before and after, never from an account of what was
  changed.
- **[L2] Anchored.** Every operation applies to the parent commit's state,
  and every `set` and `splice` that removes or replaces something MUST carry
  exactly what was there, as `old`, compared by value.
- **[L3] Conservation.** Applying a change's operations, in order, to the
  parent commit's objects MUST produce exactly the commit's objects:
  identity, type, properties with indirects resolved, and `seq`. Each object
  the operations touched has a new revision with `rev` one more than
  before, `prev` naming the revision before, and `by` naming this change;
  every other object has the revision it had; the change object is added.
  The parent state of the first commit is empty. A reader MUST be able to
  perform this check for any commit whose `work` is present (§7.5
  `verify`), and MUST say so where it is not.
- **[L4] Refusal.** A writer MUST reject a change whole if an `old` does not
  match what is there, an element named by `after` or `del` is not in the
  sequence, an element in `del` is already removed, an object named does
  not exist, or an operation targets a change object. Nothing is applied in
  part and nothing is repaired.
- **[L5] No silent reconstruction.** Origin is *witnessed* when the writer
  records it as the content is introduced. An origin established in any
  other way — by aligning text, by matching, by inference — MUST be recorded
  as *inferred*, with its method (§8.5). No component may record or present
  an inferred or unknown origin as witnessed, and a reader MUST NOT infer an
  origin the universe does not record.
- **[L6] Append-only.** A change object is never modified or dropped. A commit
  is never rewritten. History is only extended. A copy may withhold history
  (§9.3); every hash that named the absent records remains.
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

An anchor (§4.1) MAY name a commit of another universe. If the records
reachable from that commit are present in the same file, the other universe
is **nested**. If they are not, it is **linked**, and the reader may obtain
them from anywhere, verifying each record by hash. Nesting and linking are
the same reference; they differ only in which records are at hand.

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
| **unavailable** | well-formed, but needs a feature, codec or record this reader does not have, including a record the sender withheld (§9.3) | preserve; present what can be presented; say what is missing and why |
| **unrecognized** | an object type, property, node kind, tagged value or operation this reader does not interpret | preserve untouched; show an inspectable placeholder |

- **[C12]** Opening a universe executes nothing in it, changes no reader
  setting and writes nothing.
- **[C13]** A reader MUST enforce the limits of §3.1 by its own
  configuration, never by values read from the file.

The format version is the `v` of the commit. A reader MUST refuse to write a
universe whose version it does not implement and MAY read one in a degraded,
clearly labeled mode.

### 1.10 Markers, and readiness for merging

**Markers are kept among collaborators.** A removed element stays in `seq`
as a marker for two reasons: an anchor may name it, and a collaborator's
operation, made without knowing of the removal, may name it as the place to
insert. A working form, and every copy shared with collaborators, keeps
all markers.

**A published copy may forget them.** Before publishing to outside readers
(§9.3), a writer MAY commit a change whose splices `forget` markers. A
marker may be forgotten only if no anchor in the universe names it. The
change is an ordinary one: it has an actor, it is in the Chronicle, and the
published copy's head is the commit that made it. Its effects are stated
plainly to the person: anchors held outside the universe that name a
forgotten element will resolve as detached in the new revision; a pin into
the earlier commit from another universe is unaffected, since that commit
is unchanged; and edits made elsewhere against the earlier state can no
longer be merged into the compacted one where they name forgotten
elements.

*The cost, measured on a simulation:* a text first typed as 10 000
characters, then edited 20 000 times with a mixture of replacements,
insertions and deletions, ended with 57 771 characters, 131 925 markers and
a `seq` of about 779 KiB — some thirteen bytes for every character
present. With every marker forgotten it is about 211 KiB. Most of the
remainder is the price of knowing which change wrote each stretch of text,
which the format exists to know. `seq` is kept outside its node, so an
edit rewrites only the chunks near it (§1.4).

**Merging is a later feature; this design is ready for it.** The order of
a sequence is not an accident of the order in which operations arrived. It
is a function of facts that every copy agrees on:

- each element has a *parent*: the element its `splice` named in `after`,
  or the start; an element inserted together with others has the one before
  it as its parent;
- each element has a *rank*: the height of the commit that inserted it,
  then the identity of the change, then its number;
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

What remains for the merge feature is everything else: what a merge commit
records, how two `set` operations on one property are reconciled, and how
ranks are compared when a commit has two parents.

---

## 2. The pack

The pack is modeled on the way git stores a repository: immutable records
named by hash are the only truth, and everything that makes them fast to
find is derived and disposable. It is meant to be simple enough that a
reader can be written from this section alone (§3.3).

### 2.1 Frames

The **pack** is the byte format that holds a universe's records. Alone in a
file it is the working form (§9.1); it is also the payload of every envelope
(§9.2).

A pack is an 8-byte signature followed by frames:

```
signature = 0x89 "UFO" 0x0D 0x0A 0x1A 0x0A
frame     = kind (1 byte)  codec (1 byte)  length (unsigned LEB128, shortest form, below 2⁶³)  payload
```

| Kind | Name | Payload |
| --- | --- | --- |
| `0x01` | chunk | a chunk record |
| `0x02` | node | a node record |
| `0x03` | seal | a signature (§10.2), encoded as a value |
| `0x04` | index | a derived lookup table (§2.4) |
| `0x05` | head | marks a committed state (§2.2) |
| `0x06` | note | what this pack deliberately lacks (§2.5), encoded as a value |

`codec` is `0` for identity or `1` for raw DEFLATE (RFC 1951). With codec
`1` the payload, whose length the frame states, is the decoded length as an
unsigned LEB128, in shortest form, followed by one complete DEFLATE stream
and nothing after it. A length that is not in shortest form makes a frame
ill-formed. The codec byte of a frame of unknown kind is not interpreted.
The same record MAY appear in more than one frame.

The payload of each kind has a required form: a chunk decodes to between 1
and 65 536 bytes; a node decodes to one value that is a map with a text `k`;
a seal or a note is one value that is a map; an index is 24 + 40 × *n*
bytes for its stated *n*; a head is 72 bytes with codec 0. A frame whose
payload has that form is well-formed even if what it says is wrong: a head
whose check fails is a well-formed frame that is not a valid head. The hash of a record is always taken over
its decoded bytes. Only chunk and node frames may be compressed. Other
codecs are features (§1.6) and MUST NOT be used in a travel form (§9.2),
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

Seal and note frames are appended the same way, followed by a head that
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
- **[P8]** `verify` (§7.5) scans every frame. A pack whose final head does
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

- **[P9]** The index is derived and carries no authority. A reader MAY ignore
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

A pack may lack records in exactly two ways, and a reader tells them apart
by where the missing record is referenced from, not by anything the pack
says about itself.

- **Withheld history** (§9.3). A missing record is *withheld* if it is
  reachable only through references that §9.3 defines as working history:
  the `prev` of a revision, a change's `work`, the object map of a commit
  other than the head, an origin's `prompt`, or an entry of the head's
  object map for an object that is not live and not part of attribution.
- **Absent blobs.** A pack MAY omit the chunks of large blobs. It then
  carries a `note` frame listing, for each, `{blob, len, hints}`: the blob
  hash, its length and zero or more locations where the chunks may be
  found. Blob nodes themselves are never omitted.

- **[P11]** A missing record of either kind is unavailable (§1.9), and the
  reader says which kind. A missing record that is neither — one that
  current content or attribution needs — is malformed storage, whatever any
  `note` says.
- **[P12]** A reader MUST present everything that is present, MUST show for
  each absent blob an inspectable placeholder at the authored size (or a
  carried face, §7.1, if one is present), and MUST verify by hash anything
  it later obtains.

A `note` frame MAY also record `history: true` as a courtesy to tools; it
has no effect on classification.

### 2.6 Compaction

**Compaction** writes a new pack, with a fresh index chain, and replaces
the old file atomically. It is always an explicit act of the person, and it
is the only way space is reclaimed. It keeps one of two sets of records:

- *everything* reachable from the head commit, discarding only frames no
  longer referenced — superseded indexes, the bytes of interrupted writes;
- *content and attribution* as §9.3 defines them, discarding working
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
| Seal or note payload | 1 MiB |
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
Compute-let per call (§11.2). Formula evaluation is bounded by a fixed
figure, not a configurable one (§5.3), so that every reader computes the
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

| Measure | Limit |
| --- | --- |
| Pack reading, writing, recovery, index and compaction, in the kernel | 800 lines |
| Value decoder and encoder, in the kernel | 400 lines |
| An independent, read-only pack reader that lists, verifies and extracts records | 500 lines in a general-purpose language |

Two obligations bind every release of the reference implementation. They
are requirements on the project, not on files.

- **[P19] The weekend test.** §1, §2, §3, §4.1–§4.3, §10.2 and Appendices
  C and F MUST be sufficient to write that independent reader, including the
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

### 3.4 Derived stores

- **[P21]** A reader MAY build, on its own device, any derived store it finds
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
is one of three kinds. The core defines the kinds; a profile only declares
which axes its objects have.

| Kind | Bound to | A region is | Examples |
| --- | --- | --- | --- |
| **sequence** | a sequence property (§1.7); the axis has the property's name | `["s", from, to]`: two boundaries | characters of a text, bytes of an asset |
| **continuous** | an extent the object's type declares (Appendix A), or a data object declares in `axes` | `["c", low, high]`, low ≤ high, in the axis's base coordinates | time, width, height |
| **keyed** | a property that is a map, or a list of refs in which no object appears twice; the axis has the property's name | `["k", key, …]` | rows and columns of a table, children of a group, functions of a module |

A region states its own kind in its first element, so that an anchor can
be resolved by a reader that knows nothing of the object's type.

A **boundary** on a sequence axis is a place between elements, named by an
element: `[change, number, 0]` is the place just before that element, and
`[change, number, 1]` the place just after it. `"start"` and `"end"` are
the two ends of the sequence. A region whose two boundaries are the same is
a point: a caret.

A region over several axes is their product: a rectangle of a frame for a
span of time is a region on `t`, `x` and `y`. A coordinate space may have
any number of axes of each kind. Space in three dimensions is three
continuous axes, `x`, `y` and `z`, and is as much a part of the anchor
model as a line of text: a volume is a region on all three, a moment in an
animated scene adds `t`, and a part of the scene is a key. Every object
declares the axes it offers. The primitives' axes are fixed by §5.1; a data
object declares its own, in `axes` (Appendix A), which is how a described
space of any dimension — a scene, a map, a volume of measurements — becomes
addressable.

Time on a continuous axis is an integer count of **flicks**: units of
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

**Continuous axis.** An object MAY hold, in a property `frames`, for any of
its continuous axes, a list `[a, b, c]` — *a* and *b* positive integers, *c* an integer, or a
float on an axis whose positions are floats:
the axis's *frame*, mapping base coordinates to current ones. A position
*x* in base coordinates is now at *x·a/b + c*; with integer positions the
division rounds toward negative infinity. Whoever makes an anchor from a
current position *y* writes the base position *(y − c)·b/a*, rounded the
same way; an anchor made from a position and resolved at once may
therefore land one unit below it, and never above. An axis with no frame has the
frame `[1, 1, 0]`. A change that moves everything on an axis — trimming the
start of a recording, rescaling a drawing — sets the frame in the same
change, as an ordinary `set`, and regions follow with no further act. A
region is clipped to the axis's present extent.

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
  unchanged in a copy whose history is withheld (§9.3).
- **[A3]** Two readers resolving the same anchor against the same revision
  MUST obtain the same result.

A move — a cut and a paste — removes elements and inserts new ones.
Attribution follows the new elements (§8.5). Anchors to the old elements
detach; they do not follow the move.

### 4.4 Pins and staleness

The **digest** of a region is a hash of what the region covers:

- for a region on a sequence or keyed axis: the covered items or entries, as
  an encoded value;
- for the whole object, or a region on a continuous axis: the object's
  properties, as an encoded value;

in each case followed, for every ref those values contain — inside formulas
included — by the identity and current revision hash of the object referred
to, and of every object reachable from it by refs, in ascending order of
identity, each once. Change objects are not followed.

A digest therefore changes when anything the region shows could change: a
pin to a group goes stale when a child changes, and a pin to a chart goes
stale when its data does.

A **pin** is an anchor that records the digest its region had when the pin
was made, in `d`, together with 16 random bytes of salt, in `s`; the digest
is taken over the salt followed by the content, so that a pin to a short
passage does not reveal it. A pin is **current** if, resolved against the
object's current revision, its region is attached and has the same digest; and, where
what it pins is itself derived (§8.3), that derivation is current.
Otherwise it is **stale**.

A pin into another universe (§1.8) names a commit, which never changes, and
is always current; a newer commit of that universe is offered as an update
(**C9**).

This one test is how every derived thing in a universe knows whether it still
reflects its sources (§8.3).

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
order from back to front, and are arranged by being groups or regions.

A clock is in one of three modes:

| Mode | Child time is driven by |
| --- | --- |
| `locked` | the parent, by the formula above; pausing or scrubbing the parent pauses or scrubs the child |
| `free` | the child's own running time: it starts at `offset` when the parent enters the interval and then advances with the root clock at `rate`, whatever the parent does. Scrubbing the parent out of the interval and back restarts it. When a face is sampled at a stated time with no history of scrubbing, a free clock reads as a locked one would |
| `held` | a formula (§5.3), typically of presentation state: a slider that scrubs an animation, a key that advances a deck |

The time at the top of a presentation is the **root clock**, supplied by the
reader. The reader MAY drive it from real time, from a scrub position, from a
recorded log, or frame by frame for export.

- **[T1]** No component reads real time. Every component that asks the time
  receives the time of the clock it was placed under.
- **[T2]** A component's behavior MUST be a function of its content, its
  state, its clock's time and the input delivered to it.

T1 and T2 are what make export, replay and shared sessions possible: the same
description sampled at the same times yields the same result.

---

## 5. The primitive vocabulary

### 5.1 The eleven primitives

Everything a universe presents is described with these and nothing else.
Ten are object types; the eleventh, the formula, is a value. A clock maps
time as a region maps space.

| Primitive | Type | What it describes | Axes it offers |
| --- | --- | --- | --- |
| **Text** | `ufo.text` | characters with structure and style (§8.1) | `chars` (sequence) |
| **Path** | `ufo.path` | vector geometry with fill and stroke | `x`, `y` (continuous) |
| **Raster** | `ufo.raster` | a grid of pixels from an asset, a surface, or a video at a moment | `x`, `y`; `t` if timed |
| **Samples** | `ufo.samples` | audio from an asset or a surface | `t` (continuous) |
| **Region** | `ufo.region` | a two-dimensional coordinate space with a transform and a clip, holding children | `x`, `y`; `children` (keyed) |
| **Group** | `ufo.group` | an ordered composition of children under a layout rule | `children` (keyed) |
| **Clock** | `ufo.clock` | a time mapping and interval (§4.5), holding children | `t`; `children` (keyed) |
| **Portal** | `ufo.portal` | a reference to another object, presented through its own description (§8.4) | those of its parent |
| **Surface** | `ufo.surface` | a region whose content a Compute-let produces live (§11.1); it may hold children that the Compute-let places within what it draws (§5.6) | `x`, `y`, `t`, plus any the Compute-let declares; `children` (keyed) |
| **Data** | `ufo.data` | typed values and tables | `rows`, `cols` (keyed) |
| **Formula** | a value | a pure expression computing a value from data, time, input and other values (§5.3) | — |

Every primitive object MAY carry `label` (text, the accessible name), `role`
(text, a semantic hint such as `heading`, `figure`, `button`) and `lang`.

A property that says how something looks, where it sits or when it is
present MAY be a formula; so may the geometry of a path. A property that
says what something is MUST NOT be: content (`chars`, `rows`), structure
(`children`, `spans`), references (`of`, `source`, `computelet`), and
`from`. Appendix A marks which is which.

Property tables for each primitive are in Appendix A.

### 5.2 Layout

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
- **[V2]** Lengths are in the units of the nearest enclosing region. The root
  region's unit is the CSS reference pixel (1/96 inch).

### 5.3 Formulas

A **formula** is a list whose first item is an operator name and whose
remaining items are arguments: values or further formulas. It is stored as
structure, never as text to be parsed; a readable spelling is a projection.

| Group | Operators |
| --- | --- |
| reference | `get` (a property of an object, by ref and key path), `cell` (a table cell by row and column key), `col` (a column as a list), `arg` (a named value supplied by the enclosing `each`), `size` (the laid-out width and height of an earlier sibling in the same group) |
| environment | `time` (the enclosing clock's time), `input` (the pointer's position and pressed state within the enclosing region), `view` (the available width and height), `state` (a named value of presentation state) |
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
  reader runs the same compiled kernel (§6.1), every operator, including the
  transcendental ones, gives bit-identical results everywhere.
- **[F4]** An error value propagates through operators and presents as a
  visible, inspectable marker. It never presents as a plausible number.
- **[F5] No coercion, no locale.** An operator applied to a value of the
  wrong type yields an error value. `sort` orders numbers numerically and
  text by Unicode scalar value. `format` takes a number and a pattern of
  fixed decimals, grouping and percent, or a time in flicks or milliseconds
  and a pattern of ISO 8601 fields in UTC; it never consults the host's
  locale or time zone. `size` of anything but an earlier sibling is an error
  value, which keeps layout to one pass (**V1**).

**Repetition.** A group MAY carry `each`: a formula yielding a list or a ref
to a data object, and `as`, a name. Its single child is then a template,
presented once per item with `arg` bound. This is how a table becomes rows
of text, and a dataset becomes the bars of a chart.

**Presentation state** is a small map of named values held by the reader for
one presentation: a sort column, a selected tab, a scroll position, a slider.
Primitives declare which input sets which state (`on`, Appendix A). It is not
part of the universe and changing it changes no byte. Each presentation of
an object through a Portal has its own state: two Portals onto one table
sort independently, and nothing inside a nested or linked universe can read
or set the state of what presents it. An action that edits
the universe is a change (§1.7), made through the onboard tools.

### 5.4 The deletion test

- **[V3]** A primitive, a layout rule, a formula operator, a host interface
  function or a kernel feature may be added to this specification only with
  a written demonstration that it cannot be expressed as data, as a formula,
  or as a composition of what exists, and with the budgets of §12 restated.

The test applied to this draft:

| Candidate | Outcome | Why |
| --- | --- | --- |
| Constraint layout | deleted | `absolute` with formulas over `view` and the `size` of earlier siblings expresses one-directional constraints in a single pass. Simultaneous constraints, which need a solver, are not offered; a layout that truly needs one computes positions in a Compute-let |
| Stack layout | deleted | a one-row or one-column `grid`; back-to-front stacking is `absolute` |
| Paragraph, heading, list item | deleted | block spans of a text (§8.1), differing only in properties |
| Page | deleted | a region of fixed size holding a group |
| Slide | deleted | a region under a clock |
| Chart | deleted | data, formulas and paths under `each` |
| Table view | deleted | a `grid` group under `each` over a data object |
| Timeline, canvas | deleted | clocks holding children; a region with `absolute` children |
| Scene graph, camera, mesh, material | deleted from the format | data that a surface's Compute-let reads and draws (§5.5) |
| Edge | deleted | a property holding a ref (§1.5) |
| Playback settings on a Portal | deleted | looping is a clock's `repeat`; muting is a samples' `gain`; whether time runs unprompted is the clock's mode; controls are the tools' interface (§6.6) |
| A table from media type to presenter | deleted | a surface names its Compute-let directly; nothing is dispatched by type (**H5**) |
| An ordering axis beside `children` | deleted | a keyed axis already survives reordering |
| Rendition, transmutation, summary as separate mechanisms | deleted | one derivation record (§8.3) |
| Ledger as a separate store | deleted | Chronicle changes whose operations are the printer's (§11.5) |

### 5.5 What the familiar media are

These are compositions, shown to make the vocabulary concrete. None is a
type the kernel knows.

| Medium | Composition |
| --- | --- |
| Document | a text, presented as a `flow` group; Portals at positions in it |
| Paginated document | the same text sampled into regions of page size (§7.4) |
| Spreadsheet | a data object; a `grid` group under `each` presenting it; cells may hold formulas |
| Chart | a region holding paths and text under `each` over a data object |
| Diagram | a data object of nodes and links; a layout Compute-let, or formulas, giving positions; paths and text |
| Slide deck | a clock in `held` mode over a list of regions, advanced by input |
| Video | a clock holding clocks, each bringing a raster, samples, text, paths or Portals into presence for an interval |
| Recorded footage | a raster whose source is a video asset and whose time is the clock's |
| Animation | any of the above with formulas of `time` |
| Interface | regions, groups, text and paths with `on` handlers setting presentation state |
| Application, game | a surface |
| 3D scene | a data object describing the scene; a surface whose Compute-let draws it using the `gpu` capability |

Timelines, scenes, grids and canvases therefore need no new core and no
profile of their own: each is a documented composition. Conversations are
text objects whose spans carry speaker and time, with the Chronicle
recording origin as for any text.

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
rules: keys persist, and rescaling the scene sets the frames of its axes.

*Attribution is ordinary.* Each row was set by a change, so `why` on a node
answers who or what placed it, from what prompt, on what evidence.

*The light cone covers it.* Summaries pin regions of the scene — a table,
a set of nodes, a volume — and form a tree like any other (§11.7). The
plain-text face of a scene lists its nodes by label in the order of the
scene's hierarchy (§7.3).

*What appears inside the scene is format data too.* A surface names the
object it presents in `of`. Its children — a Portal onto a spreadsheet, a
region holding a page of text — are objects, each with `place.at`: an
anchor into the scene naming the node on which the child sits. That node's
row gives its position, orientation and the size of the rectangle, in
scene units. So "the spreadsheet is on the north wall" is a fact in the
universe, with an origin, which an agent can read and change; the program
only draws it (§5.6).

*The program holds no content.* The scene's presenter is a carried
Compute-let drawing through the `gpu` capability. Its memory holds the
state of a machine — a camera being moved, a cache of buffers — never
anything that is part of the work (**M9**). Without `gpu` the surface shows
its poster (**H2**), and everything above remains readable.

The format therefore has no 3D object type, no 3D operation, no 3D
display-list item and no scene profile, and three dimensions are not
opaque to it.

**What the removed profiles compose from.** Each medium once planned as a
profile is fully expressible now:

| Medium | Composes from | Shown in |
| --- | --- | --- |
| Timeline (video, audio) | clocks holding rasters, samples, text, paths and Portals for intervals | §14.1 |
| Grid (tables) | a data object; a `grid` group under `each`; formulas in cells; `propose` handlers for editing | §14.1, §14.4 |
| Canvas (free layout) | a region with `absolute` children | §14.4 charts |
| Scene (3D) | a data object in the glTF model with `x`, `y`, `z`, `t` axes; a surface that names it in `of`, with a carried presenter; children placed by anchors into the scene | §14.2, §14.4 |
| Conversation | a text with spans for speaker and time; origin per turn in the Chronicle | §13.2 |

If any medium is found that these cannot express, the remedy is to restore
or add a profile, under the deletion test, not to narrow what a universe
may be.

### 5.6 Interfaces that edit, and surfaces that hold children

Two small additions let description do work that would otherwise need a
program, and let programs take part in composition.

**Handlers that propose changes.** An `on` handler (Appendix A) may carry
`propose`: a list of operations (§1.7) in which any field may be a formula.
When the event occurs, the kernel evaluates the formulas — against data,
presentation state and the event — and submits the result as a change, with
origin `{basis: witnessed, by: person}` naming the person using the reader.
It is verified and committed, or refused, like any change (**L4**). A
checkbox, a form, an editable cell and a button that adds a row are
therefore description, with no Compute-let.

**Editable text.** A text primitive, or a region of one, marked `editable`
accepts text entry. The host supplies the editing surface it already has —
caret, selection, input methods, accessibility — through the `text`
capability and reports each committed edit as an input event `edit` giving
the range replaced and the text that replaced it. The kernel turns the
range into the identities of the elements concerned and submits a
`splice`. The host
knows it is editing a run of text and nothing more (**K2**).

**Children of a surface.** A surface MAY have `children`, a keyed map of
objects: Portals, or regions, groups and texts directly. Where each child
sits is stated in the child's `place.at`, an anchor into the object the
surface presents (its `of`), so that the arrangement is data. The kernel
does not draw the placement; the surface's Compute-let does, using the
`present` capability: it asks for a child to be presented at a size in
pixels, receives a raster it can draw or use as a texture, and passes back
any input that falls on the child, translated into the child's coordinates. Parents still size children (**V1**), the child is
composed by the kernel exactly as it would be anywhere, and the limits on
nesting apply (**O7**). This is how a Portal appears on a wall of a 3D
scene, on a screen inside a game, or in a custom interface.

---

## 6. The player

### 6.1 Four parts

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
   Compute-let attached to a surface (§11.1), carried in the universe that
   needs it, which itself draws by emitting display-list items or through
   the `gpu` capability.
3. The **binding**: the host-specific code that connects the kernel to a
   host. It supplies bytes, executes display lists with the host's
   facilities, delivers input, and provides the capabilities the host has.
   It is the only part that differs by host.
4. The **universe**: the description. Everything that makes one UFO differ
   from another is here, as data.

A base presenter is not a WebAssembly component, because a component that
only forwarded each item to a host call would be an empty layer. For exports
that must be identical everywhere, the same display list is instead executed
by two carried components, a rasterizer and a text shaper (§7.4).

- **[K1] One implementation.** The kernel and every carried component exist
  as one compiled WebAssembly artifact each, identified by hash. The
  project's readers — in a browser, as an installed web app, native, on the
  command line and behind the agent interface — all run those same
  artifacts, and MUST NOT contain a second implementation of any kernel
  function in any language. Independent implementations of the format by
  others are welcome and are measured against the same conformance suite
  (§12.3).
- **[K2] No domain knowledge outside the kernel.** A binding and any native
  shell know the display-list items of §6.2, the input events and the
  capabilities of §6.3, and the baseline media types of §6.5. They MUST NOT
  contain logic specific to any object type, property, profile, operation
  or foreign document format, and they do not parse a pack or an envelope:
  the kernel locates the pack within the bytes of a file (§9.2).
- **[K3] Carried by content.** A component is named by its hash. A universe
  MUST NOT depend on the copy it carries being the one used: a reader that
  holds a component with the same hash uses its own.
- **[K4] Pay for what you use.** A universe carries only the components its
  content requires. A universe with no Compute-let carries no printer; one
  with no 3D scene carries no scene presenter. The universe object's
  `components` names those it does carry (§1.6), so that copying and
  compaction keep them.

The kernel is itself a sandboxed component: it has no authority over the
host except through the host interface.

### 6.2 The drawing contract

To present, the kernel **composes**: given a face (§7), an available size,
the root clock's time and the presentation state, it produces a **display
list**. Executing display lists is the whole of what a host draws and
plays, and this section is the whole of what a binding knows about
presentation. It is part of the frozen host interface (§6.3): once
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
accessibility tree. A binding does not interpret `src`; it hands it back
with input, so that anything on screen can be traced to its object and from
there to its origin (§7.5 `why`).

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
  host's own measurements (§6.3 `text`), and `adv` MUST equal the advance
  the host then draws.
- **[W5] Rasters.** A host decodes the source, maps the `from` rectangle to
  the `to` rectangle, with bilinear filtering if `smooth` and nearest
  neighbor if not. For video it shows the frame at `t`; if `rate` is not
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
editable region: the range replaced and its replacement, §5.6), `scroll`,
`focus`, `resize`.

**Conformance of a binding** is tested against this section alone: a corpus
of display lists with reference results. Path and raster items are compared
to reference images, requiring every channel of at least 99.5% of pixels to
be within 8 of 255. Text items are tested for position and advance, not for
glyph shapes, which belong to the host's fonts. Input is tested by
synthetic events against `hit` items.

Exports that must be identical everywhere do not use the host for drawing
at all: the same display list is executed by the carried rasterizer and
shaper (§7.4).

Composition is a projection (§7.1): the display list is never stored.

### 6.3 The host interface

The **host interface** is the complete set of functions a sandboxed
component — the kernel, a presenter, a Compute-let — may import. It is small,
and once published it is frozen: functions are never removed or changed.

Base functions, available to every component with no grant:

| Function | Purpose |
| --- | --- |
| `draw(list)` | submit the component's display list for the current frame, in its own surface's coordinates |
| `input(buffer) → count` | read the input events delivered since the last call: pointer, key, text, focus, resize; each with a clock time |
| `time() → flicks` | the component's clock time (**T1**) |
| `random(buffer)` | fill with random bytes; from a recorded seed during replay |
| `send(port, message)` / `receive(port, buffer) → length` | exchange messages on a port the component was given |
| `checkpoint()` | ask the reader to record the component's state now (§11.2) |
| `capability(name) → handle` | obtain a granted capability, or learn that it is absent or denied |
| `call(handle, operation, in, out) → status` | use a capability. The status is *done*, with the reply in `out`; *failed*; or *pending*, in which case the reply arrives later as a message on the handle |
| `log(message)` | emit a diagnostic the reader may show; has no other effect |

The reader calls two functions the component exports: `frame(time)`, once
per presented frame, and `message(port)`, when a message or a pending reply
arrives.

Every capability operation may answer *pending*. Hosts differ in what they
can answer at once — a browser decodes media and reads files only
asynchronously — so a component is written to continue when the reply
comes. During replay (§11.2), replies are delivered from the record at the
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

*Request.* A Compute-let's manifest (§11.1) lists its requests. Each is
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
the program's identity, who sealed it if anyone, the capability in plain
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

*Narrowing.* A component that presents another may ask the kernel for a
handle with a smaller scope and pass that to the child. It can never pass
a wider one (**H3**).

| Capability | Scope | Gives | If absent or denied | Held by default by |
| --- | --- | --- | --- | --- |
| `store` | one pack | read and append its bytes; the exclusive lock | no reader | the kernel only |
| `text` | — | `break`, `locate`, `edit` (below) | no reader | the kernel only |
| `media` | — | decode a baseline asset (§6.5) to pixels or samples at a time | the asset's poster or label | the kernel only |
| `inflate` | — | decode and encode DEFLATE (§2.1) | compressed records are unavailable | the kernel only |
| `verify` | — | check an Ed25519 signature | seals are shown as unchecked | the kernel only |
| `encode` | — | encode pixels or samples to a baseline format, or pages to PDF | that export is not offered | the kernel, on export |
| `objects` | an anchor, and `read` or `propose` | read objects within the anchor; submit changes to them, which are verified like any change | the program runs on what it carries | nobody |
| `present` | the surface's own children | present a child into a raster; route input to it | children are not shown | a Compute-let whose surface has children |
| `gpu` | the surface | accelerated graphics (Appendix E) | poster, or the program's own fallback through `draw` | nobody |
| `audio` | the surface | a low-latency stream of generated samples | silence | nobody |
| `input.raw` | the surface | unbuffered pointer, gamepad and device input | ordinary `input` events | nobody |
| `time.precise` | — | timing finer than a frame | frame times | nobody |
| `net` | a list of origins | requests to those origins | the program runs offline | nobody |
| `camera`, `microphone` | the device | capture while the surface is visible | none | nobody |
| `files` | one file or folder the person picks | read it, or save to it | the reader's own save | nobody |

`text` has three operations. `break`: given characters, a font list, a
size, a weight, a slant, a direction and a width, the lines they break
into, each with its character range, advance, ascent and descent. `locate`:
given one such line and a horizontal offset, the nearest character
position. `edit`: mount or unmount the host's editing surface on a
rectangle with given text (§5.6). The operations of `objects` are the
projections and actions of §7.5 and §11.8, confined to the scope. Those of
`present` are `raster` (child key, width, height → a raster source) and
`deliver` (child key, input event). The operations of `gpu` are sketched in
Appendix E. Those of the remaining capabilities are few and are written
with the first implementation; the contract above does not wait for them.

- **[H1]** A component obtains a capability only if its manifest requests it
  (§11.1), the person has granted it (§10.3), and the host offers it.
- **[H2] Degradation.** Every capability has a defined result when absent or
  denied, given in the table. A program whose required request is not
  granted is replaced, in place and at its authored size, by its poster and
  a plain statement; one whose optional request is not granted runs
  without it. Nothing is ever left blank or broken.
- **[H3]** A component holding a capability MAY pass a narrower one to a
  component it presents, never a broader one. The kernel is the first holder
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
contract of §6.2 and the capability contract above. The operations of each
capability are part of this specification too and are counted in §12.

### 6.4 Decode at the border, encode at the border

- **[B1]** The kernel contains no decoder for any image, audio, video, font
  or document format, and no encoder for any.

Foreign content enters a universe at the **border**: the moment of import.
Exactly one of three treatments applies, in this order of preference.

1. **Host-decodable media stay as assets.** A file in a baseline format
   (§6.5) is stored as its exact original bytes (§8.2) and decoded by the
   host, through the `media` capability, when presented.
2. **Structured documents are transmuted once.** A foreign document — word
   processing, spreadsheet, presentation, diagram, structured data, marked-up
   text — is converted to native description by any capable tool or agent.
   The original bytes are kept as an asset. The conversion is recorded as a
   derivation (§8.3) whose source is that asset.
3. **Anything else is preserved with a carried face.** The original bytes are
   kept as an asset together with a rendition in a baseline format, produced
   once at the border (§7.1): page images for a fixed-layout document, a
   still for an unknown image format. If live decoding is truly needed, the
   decoder is a Compute-let on a surface, carried only by universes that
   hold that format (**M3**).

- **[B2]** Import never discards or alters the original bytes.
- **[B3]** Export encodes at the border the same way: through the host's
  `encode` capability, or through an encoder Compute-let fetched or carried
  by content when a reproducible export is asked for (§7.4).

### 6.5 Baseline asset formats

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
  or 3 of §6.4, so that every conforming reader can show something for it.

### 6.6 Onboard tools

A UFO is inspected and edited with tools it carries. The **onboard tools**
are two things.

1. *Functions of the kernel*: the projections of §7.5 and the actions of
   §11.8. Because they are in the kernel, every reader on every rung has
   them, and so does every web envelope.
2. *An interface to those functions*, which is itself a universe: text,
   groups, regions and paths, with handlers that set presentation state and
   propose changes (§5.6), and Portals onto the universe being worked on.
   It is identified by its commit hash, carried in the pack as a nested
   universe (§1.8), and presented by the kernel as the frame around the
   primary face. A reader that holds the same tools universe
   uses its own copy (**K3**); a reader MAY substitute a newer one.

- **[K5]** A web envelope MUST carry a tools universe sufficient to: choose
  among faces; show for anything on screen its origin, evidence and
  decisions; edit text and data; add an asset; accept, reject or revise a
  contribution; verify the universe and its seals; show what will travel;
  and save or send the result.
- **[K6]** The tools interface contains no logic of its own. Everything it
  does is a formula, a presentation-state change, or a proposed change. It
  adds no code to the binding and none to the kernel.

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

The tools universe counts toward the envelope weight of §12.2. It is
carried under `components.tools` (§1.6).

---

## 7. Faces

### 7.1 Three ways a face appears

A **face** is a presentation of a universe, or of an object in it. Every
face is produced in one of three ways, and a reader MUST show the person
which.

| Kind | Produced | Stored | Adds information |
| --- | --- | --- | --- |
| **sampled** | by the kernel composing authored description, on demand | no | no |
| **carried** | once, as a **rendition**: an asset derived from the description and kept beside it | yes | only if a model made it |
| **transmuted** | by AI, as a **transmutation**: new described objects derived from others | yes, as objects | yes |

The classification is derived, not declared, from the derivation (§8.3) of
what the face presents: *carried* if it is an asset with a derivation;
*transmuted* if it is described objects whose derivation has `how`
`transmute`; otherwise *sampled*. A transmuted face is itself description,
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

### 7.2 The face registry

A face object has type `ufo.face` and properties:

| Property | Value |
| --- | --- |
| `of` | ref to the object presented; absent for a face that is offered but not yet made |
| `recipe` | for a face not yet made: the sources and the request from which it would be transmuted or rendered. A reader lists such a face as available on request |
| `medium` | a hint for the person's choice: `document`, `pages`, `text`, `data`, `image`, `video`, `audio`, `deck`, `space`, `application` |
| `label` | text |
| `sampling` | map of sampling parameters that fix the face: viewport size, page size, time range, frame rate, camera (see §7.4) |

The universe object's `faces` lists the faces the universe offers. A reader
presents that list as a choice. A reader MAY also offer faces it can sample
without a registry entry — the plain-text face and the data face exist for
any universe that holds text or data.

### 7.3 The plain-text face

The **plain-text face** of an object is its text in reading order, without
layout or style: for a text, its characters, with each Portal replaced by its
label; for a group, region or clock, the plain-text faces of its children in
order (for a clock, in order of start time); for a data object, its rows as
tab-separated lines, table by table; for a surface, the plain-text face of
what it presents followed by those of its children; for anything else, its
label.

- **[S4]** Every reader MUST be able to produce the plain-text face of any
  object. It is what a text editor, a search index, a screen reader and a
  language model have in common.

### 7.4 Export is sampling

An **export** samples a face with stated parameters and encodes the result
at the border (**B3**). Nothing is converted; the description stays where it
is.

| Export | Sampling | Parameters |
| --- | --- | --- |
| Plain text | the plain-text face | — |
| Table file | a data object's rows | columns, order |
| Image | one moment, one viewport | time, viewport, resolution |
| Paged document | the flow, broken into page-sized regions | page size, margins |
| Video | a span of time at a frame rate | time range, frame rate, viewport, resolution |
| Audio | a span of time, samples only | time range, sample rate |
| Original bytes | an asset, exactly | — |

There are two **determinism tiers**.

- **Live.** Presentation uses the host's text shaping and rasterization. Two
  readers produce equivalent results: the same content, structure, order and
  layout decisions made by the kernel, with glyph shapes and anti-aliasing
  as the host renders them.
- **Canonical.** An export marked canonical uses a software rasterizer and a
  text-shaping component, both carried or fetched by content hash, together
  with fonts embedded in the universe as assets, and takes no input from the
  host but bytes. **[S5]** The same universe, face and parameters MUST then
  yield identical bytes on every reader.

An export is a fixed performance. It carries no structure, history or
behavior, unless it is an envelope (§9.2). Importing an exported file creates
a new asset; it does not recover the description.

### 7.5 Projections for agents and people

The kernel offers these projections. They are the onboard tools' vocabulary
and the agent interface's (§11.8).

| Projection | Returns |
| --- | --- |
| `overview` | the universe's lineage, root hash, seals, faces, features, and top summary |
| `object(ref)` | an object's type, properties, revision and the objects that refer to it |
| `text(anchor)` | the plain-text face of a region |
| `search(query)` | objects and regions matching by type, property, text, hash, origin, actor or time |
| `history(anchor)` | the changes that produced the content of a region, newest first |
| `why(anchor)` | for a region: its origin, the evidence recorded for it and the decisions made about it (§8.5) |
| `diff(a, b)` | the operations separating two commits or two revisions |
| `expand(ref)` | the next level of summary or content beneath a summary (§11.7) |
| `verify(commit)` | the result of the conservation check and every profile check, by validation class |
| `sample(face, parameters)` | a face: as text, as a display list, or as an encoded export |

Projections for agents are dense, regular text designed for a language
model: one record per line, fields in a fixed order, hashes abbreviated to a
unique prefix with the full value available on request, no raw binary. The
rules and an example are in Appendix B. Each projection states the commit it
was computed from, so that an answer can be checked later.

---

## 8. Profiles for content and memory

A **profile** is a versioned set of object types, properties, axes and
operations layered on the core. Each is declared as a feature (§1.6). This
section defines `ufo.text/1`, `ufo.asset/1`, `ufo.derivation/1`,
`ufo.portal/1` and `ufo.chronicle/1`.

### 8.1 Text

A text object (`ufo.text`) holds characters and their structure.

| Property | Value |
| --- | --- |
| `chars` | the content: one text value |
| `spans` | map from span key to span |
| `syntax` | absent for native text; otherwise the media type of a foreign syntax the characters are written in |

`chars` is a sequence property (§1.7): its elements are Unicode scalar
values, each with a permanent identity that names the change that
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
| `role` | semantic role: `paragraph`, `heading`, `item`, `quote`, `code`, `emphasis`, `strong`, `link`, `embed`, `marker`, or a prefixed name, which readers treat as an opaque label |
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
holds no paragraph separators, and the plain-text face (§7.3) writes a line
break between blocks. Blocks at the same position are ordered by span key.
An inline span left with no extent is removed in the same change; a block
span is kept. A `marker` span covers characters that are part of a foreign
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
spans its own parser derives, including `marker` spans over the markup. Every
reader then presents the document richly without knowing the syntax, and the
writer's source remains exact. A writer converting a foreign document to
native text instead writes clean characters and spans, with no `syntax`.

How each role is presented by default — spacing, indent, list markers and
numbering — is in Appendix A; any of it may be overridden on the span.

### 8.2 Assets

An asset (`ufo.asset`) preserves a file's exact bytes.

| Property | Value |
| --- | --- |
| `bytes` | the file's content: a byte string, kept outside the node (§1.4) |
| `media` | media type, determined by whatever imports the file, from the content first and the name second |
| `name` | the original file name, if any |

Any file can enter a universe as an asset, before any presenter understands
it. The `bytes` axis is a sequence of bytes.

- **[X4]** Exporting an asset's original bytes MUST reproduce them exactly
  and MUST be offered separately from any export of a presentation of it.

### 8.3 Derivation

Any object produced from other content carries a `from` property:

| Field | Value |
| --- | --- |
| `sources` | list of pins (§4.4) to exactly what it was made from |
| `how` | `render`, `transmute`, `summarize`, `structure`, `import`, or a prefixed name |
| `parameters` | map: whatever is needed to repeat the derivation |

Who or what performed the derivation is the `origin` of the change that
wrote the object (§8.5); it is not repeated here.

- A **rendition** is an asset with a derivation: a document rendered to
  pages, a video encoded for broad playback, a poster frame.
- A **transmutation** is a set of described objects whose derivation has
  `how` `transmute`, made by a model: a deck from a report, a narration
  from a document.
- Summaries (§11.7), the spans derived from a foreign syntax (§8.1), and
  native description converted from a foreign document (§6.4) are
  derivations too.

- **[D1]** A derivation is **stale** if any of its pins is stale (§4.4) —
  which includes a pin to something that is itself a stale derivation — and
  current otherwise. Readers MUST compute this; it is never stored.
- **[D2]** A derived object is never treated as independent of its sources:
  a reader showing it MUST be able to lead the person to each source region.
- **[D3]** Regenerating a derivation is a change that writes new revisions
  with new pins. The earlier revisions remain in history.
- **[D4] Transmutation is an operation of the format.** A model's
  contribution enters through `derive` (§11.8): the kernel, not the model
  or the application, computes the pins from the sources actually supplied
  and binds them to the new objects and to the change's origin in one
  commit. Every reader can therefore show, for any transmuted content, what
  it was made from, by what, at whose request, and whether it is current.

### 8.4 Portals

A **Portal** (`ufo.portal`) is a region in a parent that presents one other
object. Each Portal is an **occurrence**: an object in its own right, with
its own identity, distinct from what it presents.

| Property | Value |
| --- | --- |
| `of` | what is presented: a ref (the object, as it now is); an anchor (a region of it as it now is, so that it follows edits); a pin (exactly the revision pinned, which never changes beneath the Portal); or an anchor into another universe (§1.8) |
| `face` | preferred face of the target: a ref to a face object or a `medium` hint; absent lets the reader choose |
| `place` | how it sits in the parent: `inline`, `block`, `float-start`, `float-end` (in a flow); by `x`, `y`, order (in an `absolute` group); by cell (in a `grid`); by `at`, an anchor into the space its parent surface presents (§5.6) |
| `w`, `h` | authored size |
| `align`, `fit`, `crop` | alignment in the available space; `contain`, `cover`, `fill` or `none`; fractions cut from each edge |
| `label` | accessible name; also what the plain-text face shows |

A Portal's position is its place in its parent: in a text, the character
covered by its `embed` span; in a group or region, its entry among the
children; in time, the interval of the clock that holds it. Each is
addressable by an anchor and survives edits by the rules of §4.3. A Portal
has no timing of its own: how its target's time relates to its parent's is
the clock it is placed under (§4.5).

- **[O1] Inert.** A Portal is data. A reader that does not interpret Portals
  shows the label. Nothing is presented, decoded or run until a reader
  chooses to present the target.
- **[O2] Parents size children.** The parent gives the Portal a rectangle;
  the target is presented inside it by `fit`. A target never sizes its
  Portal.
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
  person grants (§10.3).

**Transclusion** is a Portal whose `of` is an anchor or a pin to a region of
another object, in this universe or another. The presented content remains
what its own Chronicle says it is: `why` on any part of it answers from the
source's history. With an anchor the Portal shows the region as it now is.
With a pin, or across universes, the source cannot change beneath the
Portal; a later revision is offered as an update (**C9**).

### 8.5 The Chronicle: origin, evidence, decision

The Chronicle (§1.7) keeps three kinds of fact apart. None can be inferred
from another, and no operation merges them.

**Origin** — who or what contributed content. It is the `origin` property of
the change that introduced the content:

| Field | Value |
| --- | --- |
| `basis` | `witnessed`, `inferred` or `unknown` |
| `by` | `person`, `model` or `tool`; absent when the basis is `unknown` or the content was copied |
| `who` | for `person`: a principal (§10.1) |
| `model` | for `model`: the model's identifier as its provider states it |
| `prompt` | for `model`: a ref to the text object holding the prompt, or the conversation it was part of |
| `context` | for `model`: list of pins to what the model was given |
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
new elements with identities of their own; their attribution is read
through `sources`. Moving text by cut and paste therefore keeps every
character's attribution.

Where the source is in another universe, the origin is the origin of the
region named there, found by following the anchor when that universe is at
hand, and otherwise reported as "copied from" that exact commit and region.

The basis a reader shows for copied content is the weakest along the chain:
a witnessed copy of text whose origin was inferred is shown as inferred.

**Later findings.** Origin is never revised (**R1**), but knowledge may
arrive after content does: another device's history, an alignment run
afterward. A change records such a finding in `attributions`, each
`{about, origin}`: an anchor to content already present and an origin with
its basis. `why` returns the original origin and every later finding, in
order, each labeled. A reader shows as the content's origin the strongest
of them — witnessed over inferred over unknown — and, among equals, the
latest.

- **[R1]** The origin recorded when content is introduced is never changed
  or removed by any later change, including acceptance, editing nearby,
  moving, copying, or a later finding.
- **[R2] Three states, visibly.** A reader MUST present witnessed, inferred
  and unknown origins so that each is distinguishable at a glance from the
  others, in every place it presents origin, including projections for
  agents. Inferred is never shown as witnessed. Unknown is never shown as
  written by a person. For an inferred origin the reader MUST make the
  method and confidence available.

A witnessed origin is still a statement by the change's actor: software
reporting its own part in an act. Whether to believe the actor is the
business of seals (§10.2), and a reader shows, beside any origin, whether
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
- **[R4]** A derivation's sources (§8.3) say what something was made from.
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
that last set it. For an item of a module, see §11.5.

- **[R8] Every byte has a known origin.** For every byte of content in a
  universe, `why` MUST return a change and its origin: for an element of a
  sequence, by its identity; for any other property value, by the revision that set it; for a
  byte of a blob, by the change that first referred to the blob; for an item
  of a module, by its `by`; for a derived byte of a module, "computed by the
  printer" from named items (**N5**). The bytes of records
  themselves — encodings, hashes, maps — are computed by the kernel from
  that content by the rules of §1 and have no other origin. An origin may be
  `unknown`; it is never absent.

---

## 9. Forms of the file

### 9.1 The working form

The **working form** is a pack in a file by itself. The format is UFO; its
file-name ending is `.ufx`, read as "UFO Exchange", and its media type is
`application/vnd.ufx` (registration drafted, not yet submitted). A file is
a UFO file or a UFX file; both are correct. The ending and the media type
identify the pack wherever it is stored; the name UFO remains in the
format's own identifiers — the signature, type names, `ufo:` names.
Native readers and agents work on this form. A person's own working form
is whole (§2.5); one saved from a published copy lacks what its sender
withheld, and says so.

### 9.2 The travel form

The **travel form** is an **envelope**: a file that is valid in a common
format, shows an outer face to software that knows nothing of UFO, and
carries a pack and the player. The default envelope is a web page. Its file
name ends `.ufx.html`.

The web envelope is a conforming HTML document, encoded in UTF-8, valid
against the HTML Standard as it stood on the date of this specification
(the conformance suite names the snapshot). It contains, in this order:

1. The doctype, then a comment of at most 512 bytes — the **plain-text
   head** — giving in plain words the title, the fact that this is a UFO,
   the date of export, and one sentence on how to open it. It is written in
   ASCII, with any run of hyphens in the title reduced to one.
2. A `head` whose first element declares the character encoding, followed
   by the title and a content security policy that permits only the
   envelope's own scripts, identified by hash, and WebAssembly compilation,
   and forbids all network access.
3. A **static face**: the plain-text face (§7.3) of the primary face, as
   escaped HTML text, up to a size the exporter chooses, followed by a plain
   explanation of how to open the file with scripts enabled. This is what a
   script-disabled previewer shows. The binding hides it once the player is
   running.
4. The pack, as the text of one or more consecutive `script` elements of
   type `application/x-ufo-pack`, each holding at most 64 MiB of the pack
   in standard base64 (RFC 4648 §4) with no line breaks; every element but
   the last holds a whole number of 3-byte groups.
5. The kernel, compressed with DEFLATE and then base64-encoded, as the text
   of a `script` element of type `application/x-ufo-kernel`, labeled with
   the hash of the uncompressed component.
6. The binding, as a module script.

Other components the universe needs are records in the pack (**K4**).

The fixed parts of this document — everything but the title, the static
face, the pack and the kernel — are an **envelope template**: bytes with
named gaps, carried in the tools universe as an asset. To write an envelope
the kernel fills the gaps. The kernel therefore contains no HTML, and no
binding contains envelope-writing logic. Reading is the reverse and also
the kernel's: given the bytes of any file, the kernel finds the pack — at
the start of a working form, between the markers of a web envelope, in the
box or chunk of §9.4 — so a binding never parses an envelope (**K2**).

- **[E1] Read-back.** The binding gives the kernel the text of the pack's
  script elements; the kernel reads bytes on request by decoding the base64
  group that holds them. The file is never fetched and the universe is
  stored once.
- **[E2] Lossless.** Decoding item 4 yields the pack byte for byte.
  Converting between the working form and the travel form therefore
  preserves the root hash, and a reader MUST check that it does.
- **[E3] Valid.** A web envelope MUST be a conforming HTML document with no
  parse errors. No envelope of any kind may depend on error recovery, a
  parser flaw or undefined behavior. A web envelope is a web page and
  nothing else: bytes after the end of a page are part of the page, so it
  cannot also be an archive.
- **[E4] Self-sufficient.** A web envelope requires nothing but a browser:
  no network, no installation, no account.
- **[E5] Saving.** From a web envelope, saving produces a new travel-form
  file, containing the extended pack, which the person downloads or shares.
  Where the host offers the `files` capability, the reader MAY write the
  file the person chooses instead.
- **[E6] Opened as a file.** A reader of rung 2 or 3 (§9.5) that is given a
  web envelope reads the pack in place by range and runs its own kernel,
  never the embedded one (§10.6). If the universe needs a later format
  version than that kernel implements, the reader says so and offers to
  update itself.

*Costs, stated plainly.* Base64 adds one third to the pack's size. It is
accepted because arbitrary bytes cannot appear in a conforming HTML
document, a page opened from local disk cannot read its own file, and a
second readable copy would store the universe twice. Records are compressed
individually first (§2.1), so described content is usually smaller in the
envelope than raw. A browser parses the whole page before any script runs,
and holds the pack's text in memory, so time to first interaction grows
with file size and a web envelope has a practical ceiling of some hundreds
of megabytes; a carried video is decoded from a second in-memory copy.
Above 256 MiB a reader SHOULD propose leaving large blobs out (§2.5) or
using the working form. Some phone file previewers show local web pages
with scripts disabled; there the static face is what is seen, with its
instruction for opening the file in the browser.

*Durability, stated plainly.* The pack is designed to be readable for
decades from this document alone (§3.3). The self-opening property of the
web envelope lasts as long as browsers support the handful of interfaces
its binding uses. When they no longer do, the pack inside is still there
and still readable.

### 9.3 Leaving a reader

- **[E7] Default distribution rule.** Whatever leaves a reader — sent,
  shared, exported, downloaded, copied out — leaves in the travel form,
  unless the person deliberately chooses the working form.
- **[E8]** A travel form carries the newest kernel and binding the exporting
  reader holds.

**What travels.** A universe has three layers, defined by reachability.

| Layer | What it is | Travels |
| --- | --- | --- |
| **Content** | the current revision of every **live** object — one reachable from the universe object by refs, indirects and anchors, without passing through a change — any earlier revision that a live object pins as something to present or as support for evidence, and the blobs all of those name | always |
| **Attribution** | for every change that an element or a `by` of a live object names, that an included change's `sources` names, or that records evidence, a decision or a finding about live content: the change object, which holds its actor, time, origin, evidence, decisions and findings (§1.7); the objects its evidence names as support; every commit node; every seal | always |
| **Working history** | everything else: the `work` of every change — its operations and its note; changes that contributed nothing now present; earlier revisions; earlier object maps; prompts and conversations; objects that are no longer live, and changes that touched only those; summaries whose sources are all working history; earlier Compute-let snapshots | depends on the membrane crossed |

The trail of work is the context for whoever continues it, so who is
receiving decides the default.

- **[E9] Two defaults.** *Sharing* is sending to people who work on the
  universe: collaborators. A shared copy is whole by default — content,
  attribution and working history. *Publishing* is sending to readers
  outside the work. A published copy holds content and attribution and
  withholds working history by default, and its `note` frame says so
  (§2.5). The person states which they are doing, can change what is
  included either way, and sees the result before it leaves (**E12**).
  Before publishing, the writer MAY also forget the markers of removed
  elements that nothing anchors (§1.10), by a recorded change, so that the
  published copy does not show where deletions were.
- **[E10] Stubs.** Withholding removes records and nothing else. Every hash
  that names a withheld record stays where it was: in `prev`, in commits, in
  `work`, in `origin.prompt`. The recipient's reader can therefore check
  the whole commit chain and every seal; check that each change it holds is
  the one its commit names; resolve every anchor, since resolution needs
  no history (**A2**); and answer `why` for all content present, since
  element identities and `origin.sources` never point into withheld
  records (§8.5). It cannot run the conservation check on a change whose
  `work` is withheld, and says so (**L3**).
- **[E11] Withheld is not missing.** A reader MUST present a withheld record
  as withheld by the sender — "prompt withheld" — and never as damaged,
  absent by accident, or nonexistent.
- **[E12] Show what will travel.** Before any send, share or export of a
  universe, the reader MUST show the person exactly what will leave: the
  faces and objects, and their size; the principals, models, times and
  number of changes named in the attribution; whether working history is
  included; which seals; which blobs are absent. The person confirms or
  changes it. The reader MUST NOT send anything it did not show.
- **[E13] Nothing is lost at home.** Withholding applies only to the copy
  that leaves. A reader MUST NOT remove working history from the person's
  own working form as a consequence of sending, and copies the person makes
  for themselves — backups, their other devices — are whole.
- **[E14]** A recipient extends a received universe by committing on its
  head as usual. If working history is supplied later, its records are
  recognised by hash and fill the stubs.
- **[E15]** A travel form holds every blob of its content unless the person
  deliberately leaves some out (§2.5). The static face of such an envelope
  MUST say what is absent, and its content security policy MAY then permit
  the origins named in its location hints.
- **[E16]** A web envelope opened in a browser MAY offer, once, to install a
  native reader where one exists. It MUST work fully if the offer is ignored.

*What a published copy reveals, plainly.* The person should know this before
choosing to publish, and **E12** shows it to them.

- The names, keys, times and software of everyone who changed a live
  object, and the identifiers of the models used.
- For each sequence, how much each change contributed that has since been
  removed, and where it sat, unless the markers were forgotten before
  publishing (§1.10). What the removed elements said is not there.
- The notes on evidence and decisions, the parameters of origins, and any
  fields an application added to changes.
- The objects that evidence names as support, in full, including sources
  consulted for text that was later deleted.
- The lineage, which is the same in every copy and fork of a universe and
  so links them.
- For a withheld blob: its hash, which tells someone who already holds the
  same file that it was once here.

It does not reveal what any earlier draft, prompt or deleted passage said.
Those are named only behind veils (§1.4) and by hashes of salted revisions
(§1.5), and pins are salted (§4.4). It reveals nothing of what the operations were: not
which properties were edited, not how often, not in what order. A person who needs to reveal less than this starts a
new universe from an export (§2.6).

### 9.4 Video and image envelopes

A universe can also travel inside a video or an image, so that software
that knows nothing of UFO — a player, a gallery, a chat application — shows
a face of it. An envelope shows one outer face and carries the pack as data
its format defines as ignorable.

| Envelope | Outer face | Pack carried in | File name ends |
| --- | --- | --- | --- |
| Video | a carried video face: H.264 with AAC in MP4 (§6.5) | a top-level `uuid` box (ISO/IEC 14496-12) whose 16-byte type is the first 16 bytes of the SHA-256 of the ASCII text `ufo-pack-1`, placed after `moov` and `mdat` | `.ufx.mp4` |
| Image | a carried still face: PNG | one or more consecutive private ancillary chunks of type `ufOb`, placed after `IDAT` and before `IEND`, whose data concatenated is the pack | `.ufx.png` |

- **[E17]** Each envelope MUST be valid under its own standard and play or
  display correctly in software that ignores the pack. The outer face is a
  rendition (§8.3) of a face of the universe inside, with pins, so a reader
  can tell whether it is current.
- **[E18]** The kernel finds the pack in such a file by walking the
  container's boxes or chunks (§9.2), and the reader then proceeds as for a
  working form. These envelopes carry no player.
- **[E19] The mark.** The outer face SHOULD carry a **mark**: a QR code
  (ISO/IEC 18004) encoding `ufo:` followed by the commit hash in lowercase
  hexadecimal and, optionally, `?at=` and a location hint. In a video it is
  shown for at least the first and last two seconds; in an image it sits in
  a corner. A reader that is shown a file bearing a mark but no pack treats
  the mark as a reference to a linked universe (§1.8): it obtains the
  records from the hint or anywhere else and verifies them against the hash.
  The person MAY turn the mark off.

*The limit, plainly.* Platforms that re-encode video or images — most
messaging and social platforms — discard the box or chunk. What arrives is
then an ordinary video or image, and the universe is not in it.

*The path past it.* The mark is made of pixels, so it survives re-encoding.
It turns a stripped envelope from a dead copy into a verifiable pointer:
anyone with a reader can still reach the exact universe the face was made
from, provided its records are kept somewhere reachable. Where bytes are
preserved, the universe arrives whole and the mark is not needed.

- **[E20]** A reader creating a video or image envelope MUST tell the person
  that re-encoding platforms strip the universe, and whether the mark is
  present and where it points. The web envelope remains the form to use
  when the universe itself must arrive.

### 9.5 The reader ladder

The same file works at every rung. Each rung is a binding and shell around
the same kernel (**K1**).

| Rung | Host | Adds |
| --- | --- | --- |
| 1 | any modern browser, opening a web envelope | nothing to install |
| 2 | the reader installed as a web app | offline use, opening `.ufx` and `.ufx.html` files, in-place saving where the platform allows |
| 3 | native readers and the command-line reader | file association, the working form on disk, permission prompts, seal verification, the agent interface |

**File-type declarations.** A native reader registers the format with its
platform by declaration only. These are the declarations; they contain no
logic, and a reader MUST NOT register anything broader.

*macOS and iOS.* An exported uniform type identifier and a document type:

| Key | Value |
| --- | --- |
| `UTTypeIdentifier` | `ai.nampara.ufx` |
| `UTTypeDescription` | UFO file |
| `UTTypeConformsTo` | `public.data`, `public.composite-content` |
| `UTTypeTagSpecification` | `public.filename-extension`: `ufx`; `public.mime-type`: `application/vnd.ufx` |
| `CFBundleDocumentTypes` | one entry: `LSItemContentTypes` the identifier above; `CFBundleTypeRole` `Editor`; `LSHandlerRank` `Owner`; the document icon of the brand brief |

*Windows.* Per-user registration by the installer, with the person's
consent (**U10**):

| Key | Value |
| --- | --- |
| `.ufx` | default `UFO.File.1`; `Content Type` `application/vnd.ufx`; `PerceivedType` `document` |
| `UFO.File.1` | default `UFO file`; `DefaultIcon` the document icon; `shell\open\command` the reader with `"%1"` |

*Linux and other freedesktop systems.* A shared-MIME-info entry and a
desktop entry naming it:

```
<mime-type type="application/vnd.ufx">
  <comment>UFO file</comment>
  <acronym>UFO</acronym>
  <expanded-acronym>Universal File Object</expanded-acronym>
  <glob pattern="*.ufx"/>
  <magic priority="80">
    <match type="string" offset="0" value="\x89UFO\r\n\x1a\n"/>
  </magic>
</mime-type>
```

The travel forms are files of their envelope's own type — `text/html`,
`video/mp4`, `image/png` — and are opened by default in whatever opens
those. A reader MAY additionally offer itself for `*.ufx.html`, `*.ufx.mp4`
and `*.ufx.png` where a platform can match a double ending (freedesktop
globs can; Windows and Apple platforms match the last ending only), and
MUST NOT take over `.html`, `.mp4` or `.png` in general.

---

## 10. Trust

### 10.1 Principals

A **principal** is a party that acts: a person, an organization, an agent
acting for one. It is a map with either or both of `key`, an Ed25519 public
key (RFC 8032), and `name`, text.

- **[U1] Claims are claims.** A principal recorded in a change is a claim
  made by whoever wrote the change. It is established only for commits
  covered by a seal from that key (§10.2). A reader MUST show the
  difference.

### 10.2 Seals

A **seal** is a signature over a root hash. It is a `seal` frame (§2.1)
holding `{commit, key, time, name, signature}`, where `signature` is the
Ed25519 signature of the bytes `"ufo-seal-1"` followed by the SHA-256 of
the encoded value `{commit, key, time, name}`. The name and time are thus
signed with the hash, and remain the signer's own claims about themselves.
A reader checks that the commit a seal names is in the pack; a seal says
nothing about any other commit.

Because a commit fixes all history before it, sealing the latest commit
vouches for the state, not for the authorship of every earlier change.
Earlier seals, on earlier commits, remain valid for those commits. A
universe's authorship history is thus a chain: each sealed commit, and the
changes since the previous one.

- **[U2]** Readers verify seals and state in plain words who sealed which
  state, or that the universe is unsealed. Hash verification establishes
  integrity; only a seal establishes identity. A reader MUST NOT present one
  as the other.
- **[U3]** Writers preserve every seal frame whose commit is retained.
- **[U4] Keys stay home.** No signing key, password, token or credential is
  ever stored in a universe, an envelope or a reader's distributed files.

Which keys a person trusts is the reader's business and is never read from
the file.

### 10.3 Permissions

- **[U5] Requests, not possessions.** A universe can contain requests for
  capabilities (§11.1). It cannot contain grants. A **grant** is recorded by
  the reader, outside every universe, for one person, one Compute-let
  identified by its root hash (§11.1), and one capability with a stated
  scope. A reader with nowhere durable to keep grants — a page opened from
  disk — keeps them until the page closes.
- **[U6]** Before granting, the reader describes the request to the person in
  plain language, including its scope. Grants are narrow by default, and the
  person can revoke any grant at any time.
- **[U7]** A grant made for one root hash carries to a successor only when
  the successor was promoted (§11.6) in this reader with the person's
  approval, and requests nothing new. A file that arrives from elsewhere
  begins with no grants, whatever it contains.
- **[U8] Delegation.** A principal may pass a capability to another by a
  token: an encoded value `{issuer, audience, capability, scope, expires,
  parent}` signed as a seal is, where `parent` is the hash of the token it
  derives from. A token MUST be equal to or narrower than its parent. No
  shared secret is involved. Within one reader, a component passes a
  narrower capability to a child it presents by asking the kernel for a new
  handle with a smaller scope (**H3**).
- **[U9]** The reader's own checks — record hashes, conservation where
  content is present, fuel metering, seal verification, permission
  enforcement, the limits of §3.1 — cannot be disabled or weakened by
  anything in a file.

### 10.4 Membranes

A **membrane** is any boundary between universes. Universes nest and link
without limit (§1.8), and every such boundary is a membrane with explicit
rules about what crosses it. There are four crossings.

| Crossing | What crosses | Rule |
| --- | --- | --- |
| **Nesting** | a universe's records sit inside another's pack | verified on its own terms; immutable; read-only; no authority from the parent (**C10**, **O8**) |
| **Reference** | an anchor names a commit elsewhere | names exact content; cannot be redirected; verified wherever found (**C9**) |
| **Transfer** | a file moves between people | carries its content, attribution, seals and requests; carries its working history to collaborators by default and to outside readers only by choice (§9.3); carries no grants; the recipient's reader decides everything (**U5**, **U7**) |
| **Capability** | a component reaches beyond its sandbox | only by a requested, granted, scoped, revocable capability (**H1**) |

Copying content from one universe into another crosses a reference
membrane: the change's `copied` anchor names the source commit, so the
content's origin remains answerable (§8.5).

Encryption of universes in transit and at rest is a later phase. The design
leaves room for it as a codec (§2.1) over record payloads, which keeps
hashes, deduplication and verification meaningful to key holders.

### 10.5 Conduct of readers

- **[U10]** No component may run by exploiting a parser flaw, bypass an
  operating system's security controls, remove quarantine markings, or alter
  system settings or file associations without the person's consent.
- **[U11]** Any local network service a reader offers is off by default.
  When enabled it listens only on the local machine unless the person
  chooses otherwise, and requires authentication for every request that can
  change a universe.

### 10.6 Security and privacy, gathered

**Who enforces the rules.** Every guarantee in this document that begins "a
reader MUST" is kept by the reader's code. In a reader the person
installed — rungs 2 and 3 — that code came from a publisher they chose,
and such a reader runs only its own kernel, or one sealed by a key it
trusts for kernels. A web envelope opened as a page is different: its
kernel and binding came with the file. There, the only boundary the person
can rely on is the browser's own sandbox, which confines the page whatever
it contains.

- **[U12] An envelope cannot vouch for itself.** Anything a web envelope's
  embedded reader displays about seals, origins or permissions is the
  file's own account. The embedded reader MUST label it so — "this file
  states that it is sealed by…" — and MUST offer the way to check it: open
  the file in an installed reader. An installed reader never runs an
  embedded kernel or binding (**E6**).
- **[U13]** A page opened from disk has nowhere safe to keep a signing key.
  Changes made there are recorded with the principal as a claim (**U1**) and
  can be sealed later in a reader that holds the person's key.

**Threats this document addresses, and where.** Hostile packs: §3.
Decompression and declared-size attacks: **P15**, **P18**. Runaway
composition: the formula bound (**F2**) and the display-list bound (§3.1).
Runaway or hostile programs: fuel, memory limits and the sandbox (§11.2).
Hostile nested universes: read-only, isolated state, no inherited authority
(**O8**, §5.3, **O10**). Self-granted authority: **U5**, **U7**. Forged
history: the commit chain (§1.6), seals (§10.2). Tests weakened
to pass a change: **G1**. What a published copy reveals: §9.3.

**Known and accepted.** The lineage links every copy of a universe. Hashes
of blobs are visible to anyone holding the same bytes. Under the encryption
planned for a later phase, record hashes would remain visible to parties
without keys unless records are also salted; that design is not settled.
Consent prompts are only as good as the attention paid to them.

---

## 11. Profiles for behavior and attention

This section defines `ufo.computelet/1`, `ufo.printer/1` (with the ledger)
and `ufo.summary/1`.

### 11.1 The Compute-let

A **Compute-let** (`ufo.computelet`) is a complete single-purpose machine
carried as an object. It is four things that computing has kept apart:

- an *application*: it does something for a person, on a surface;
- an *operating system*: it carries the services it needs — its own state
  and history, its scheduling through `frame`, its messaging through ports,
  its presentation through `draw` — and borrows none from a host it cannot
  trust;
- a *machine*: sealed memory and a clock of its own, which can be
  snapshotted, resumed, copied and moved exactly (§11.2). Opening it starts
  the machine; saving checkpoints it; copying forks it; sending moves it;
- an *environment*: its manifest declares everything it may see or touch.

A Compute-let runs live wherever it is presented: alone, as the primary
face of a universe; inside a document, a video or a scene, through a Portal;
or inside another Compute-let's surface (§5.6). It may contain other
Compute-lets. There is no source tree: its machine code is maintained
through the printer, and the ledger is the record of why it is as it is
(§11.4, §11.5).

Its properties are its **manifest**:

| Property | Value |
| --- | --- |
| `module` | pin to its module object (§11.3) |
| `requests` | list of requests, each `{capability, scope, required, why, without}` as §6.3 defines |
| `tests` | list of pins to test objects (§11.6) |
| `axes` | the axes its surface offers to anchors, if any beyond `x`, `y`, `t`: each with a name and a kind (§4.2) |
| `state` | the latest snapshot (§11.2): a byte string, kept outside the node |
| `docs` | ref to a text: documentation and instructions for people and agents |
| `poster` | ref to a rendition shown when the Compute-let cannot or may not run |

The Compute-let's **root hash** is the hash of the encoded value of its
`module`, `requests`, `tests` and `axes`. It fixes every component and
everything the program may ask for. It does not change when the program
merely runs, or when its documentation is edited.

A Compute-let has one module. Larger programs are composed, not linked: a
Compute-let presents others as children of its surface (§5.6) and exchanges
messages with them over ports.

Every program a universe carries is a Compute-let, including the printer,
a text shaper, a rasterizer and any carried presenter. Those that were
compiled by an ordinary toolchain, not written through the printer, are
imported whole: their module is created by a single change whose origin is
`tool`, naming the compiler, and their ledger is that one entry. They run
under the same sandbox and the same metering.

- **[M1]** A Compute-let sees only the base host functions and the
  capabilities in its manifest that have been granted. Nothing else exists
  for it.
- **[M2]** A Compute-let is inert until a reader chooses to run it. Opening
  a universe runs nothing (**C12**).
- **[M9] No private content.** Whatever a Compute-let presents that is part
  of the work — a scene, a level, a document, the placement of things within
  them — lives in objects, which it reads through the `objects` capability
  and names in its surface's `of` and `children`. Its snapshot holds the
  state of the machine. A reader, an agent or another presenter MUST be able
  to find, anchor, attribute and summarize that content without running
  the Compute-let.
- **[M3]** A carried presenter is a Compute-let attached to a surface, and
  nothing more. It is placed where it is wanted, by the author or by the
  tool that imported the content; a raster or samples primitive that needs
  a format decoded names that surface as its source. Nothing is dispatched
  by type (**H5**).

### 11.2 Execution

A module is WebAssembly (core specification 2.0) restricted for
determinism: no threads, no shared memory, one memory, and imports only
from `ufo:host/1`.

- **[M4] Fuel.** Stored modules contain no metering. Before running any
  module the kernel **instruments** it by the rule below, which is normative
  and the same in every reader; test vectors are in Appendix F.

  1. *Counter.* Append one global of type mutable `i64`, initial value 0,
     after all the module's globals, and export it as `ufo:fuel`. No stored
     code can refer to it: it did not exist when the module was validated,
     and a stored module MUST NOT export or import any name beginning
     `ufo:` (**N1**).
  2. *Regions.* The *entry region* of a function is every instruction of its
     body that is not inside a `loop`. The region of a `loop` is every
     instruction inside it that is not inside a nested `loop`. Every
     instruction of the stored body counts one, including `block`, `loop`,
     `if`, `else` and `end`. The `loop` instruction itself belongs to the
     region that contains it; the `end` that closes a loop belongs to the
     loop's region; the final `end` of a body belongs to the entry region.
  3. *Charge.* At the very start of each function body, and immediately
     after each `loop` instruction, insert a charge for the size *n* of that
     region:
     `global.get F` `i64.const n` `i64.sub` `global.set F` `global.get F`
     `i64.const 0` `i64.lt_s` `if` `unreachable` `end`,
     where *F* is the counter. A region is charged in full on entry, whether
     or not every branch in it is taken.
  4. *Bulk.* Immediately before each `memory.copy`, `memory.fill` and
     `memory.init`, charge one for every 16 bytes of its length operand,
     rounded up, computed at run time from that operand.
  5. *Calls out.* The reader subtracts 100 from the counter for each base
     host function called, and 1 000 plus one for every 16 bytes passed for
     each `call`.
  6. *Floats.* Immediately after each instruction that can produce a NaN
     whose bits are not fixed by WebAssembly — the `f32` and `f64` forms of
     `add`, `sub`, `mul`, `div`, `sqrt`, `min`, `max`, `ceil`, `floor`,
     `trunc` and `nearest`, and `f32.demote_f64` and `f64.promote_f32` —
     insert a sequence that replaces any NaN with the canonical quiet NaN
     of its type (`0x7fc00000`, `0x7ff8000000000000`): `local.tee T`
     `local.get T` `f.ne` `if (result f)` `f.const nan` `else`
     `local.get T` `end`, where *T* is one local of that type appended to
     the function's locals for the purpose. Inserted instructions are never
     counted in a region.

  The reader sets the counter before each call it makes into the module. A
  trap from an exhausted counter is reported as *out of fuel* and is
  distinguishable from every other trap. Because the reader inserts the
  metering itself, there is nothing for a file to omit and nothing for the
  reader to trust, and because the rule is fixed, the same module with the
  same fuel traps at the same instruction everywhere.
- **[M5] Determinism.** Given the same module, state, fuel, clock times,
  inputs, messages, capability replies and random seed, a Compute-let MUST
  behave identically on every reader, including the point at which it runs
  out of fuel.
- **[M6] State.** A Compute-let's state is its memory, globals and tables,
  its clock time, its position in the random stream and the input and
  messages not yet delivered to it. A **snapshot** is the exact content of
  all of these, stored as a blob. A reader takes a snapshot only between
  calls into the module: `checkpoint` asks for one when the current call
  returns. Running a Compute-let changes its state in the reader and writes
  nothing to the universe (**S1**). The state is recorded — a change that
  sets `state`, with origin `tool` and the person as `asked` — when the
  person saves, and before a promotion (§11.6). Earlier snapshots remain in
  history and can be restored.
- **[M7] Replay.** A reader MAY record the fuel, times, inputs, messages,
  capability replies and seeds delivered to a Compute-let, as a blob: a
  list of encoded values in order of delivery. Replaying the record from
  the matching snapshot reproduces its behavior. This is what tests,
  verification by others and shared sessions rest on.
- **[M8]** A Compute-let that traps, exhausts its fuel or exceeds its memory
  limit is stopped. Its last snapshot is intact; its surface shows the last
  frame it drew, marked as stopped.

A Compute-let with no granted capability still draws and sounds: it emits
display-list items through `draw`, whose raster and samples items may take
their source from its own memory (§6.2).

### 11.3 Modules and items

A module object (`ufo.module`) holds:

| Property | Value |
| --- | --- |
| `wasm` | the module's bytes, uninstrumented: a byte string, kept outside the node. This is the only authority on what the module is. |
| `items` | map from item key to `{kind, hash, by, name, index}` |

An **item** is one declared part of a module: a function, a global, a data
segment, an export, an import, a table, the memory declaration. Its **key**
is 16 bytes chosen when it is added and kept for as long as it exists,
however its content changes. `by` is the change that last set its content;
`name` is for projections; `index` is its position in its index space.
Every byte of a module that carries meaning belongs to exactly one item.
All other bytes — section framing, sizes, the order of sections — are
**derived**: computed by the printer's fixed rules, which are these. Sections
appear in the order type, import, function, table, memory, global, export,
element, code, data, each only if not empty; there are no custom sections
and no start section. The type section lists each distinct function type
once, in order of first use by item `index`. Items of each kind appear in
order of `index`, which is dense from zero. Exports appear in ascending
order of name, by bytes. Every length and index is an unsigned LEB128 in
shortest form.

A **unit** is an item of kind `func`. Its `hash` is the SHA-256 of these
bytes in order: the function's type as WebAssembly encodes a function type
(`0x60`, parameters, results); its local declarations as the code section
encodes them; and its instructions as the code section encodes them, ending
with the final `end`, except that every index operand is replaced — of a
function, global, table, data or element segment, by the 16-byte key of the
item it refers to; of a type, by that type's encoding. Indices of locals
and labels are left as they are. The hash of any other item is the SHA-256
of its content as its section encodes it, with indices replaced likewise. A unit's hash therefore depends on what
it does and on which items it uses, and not on where anything sits in the
module: adding, removing or reordering other functions does not change it.
Two modules that hold items with the same keys and the same content have
units with the same hashes.

A module offers one keyed axis, `items`. An anchor to a function survives
`func.replace`, because the key does.

- **[N1]** A reader MUST check, before running a module, that `wasm` is a
  valid module within the restrictions of §11.2, that it uses no name
  beginning `ufo:` other than its imports from `ufo:host/1`, and that the
  hash of every item computed from `wasm` equals the hash recorded for it. A
  module that fails is inconsistent.

There is no source tree. The module's readable forms are projections.

### 11.4 The printer

The **printer** is the only writer of module bytes. It is a Compute-let
(§11.1), identified by hash and named in the universe's `components`. A
universe carries it when it carries working history, since it is needed to
change or replay a module and not to run one; a published copy MAY leave
it out. A reader holds its own copy and uses it to create the first
Compute-let in a universe that has none.

An agent or person drives the printer with operations. Instruction
sequences are supplied in the WebAssembly text format, naming other items
by key or by name.

| Operation | Effect |
| --- | --- |
| `func.add` | add a function with a signature and instructions, under a key the operation supplies |
| `func.replace` | replace the instructions of the function with a given key, expecting a given current hash |
| `func.remove` | remove a function that nothing refers to |
| `export.set` / `export.remove` | export an item under a name; remove an export |
| `import.add` | import a `ufo:host/1` function |
| `global.add` / `global.set` | add a global; change its initial value |
| `memory.set` | declare the memory's initial and maximum size |
| `data.set` | set the bytes of a data segment |
| `table.set` | set the functions of the indirect call table |
| `module.import` | create a module from bytes compiled elsewhere, assigning keys to its items |

Every operation that creates an item supplies its key, so that replaying
the operations reproduces the module exactly. The fields of each operation
are in Appendix C. In the terms of §4.3, each operation is a `set` on the
keyed `items` axis: `add` creates a key, `replace` and `set` keep it,
`remove` deletes it.

For a list of operations forming one change, the printer:

1. checks every operation against the module's current revision, and
   refuses the whole change if a key is missing or an expected hash does
   not match (**L4**);
2. encodes the supplied instructions deterministically;
3. recomputes every derived byte;
4. validates the resulting module against the WebAssembly specification and
   the restrictions of §11.2;
5. produces the new `wasm` blob, the new `items` and the change that records
   the operations, to be committed together or not at all.

- **[N2]** The printer is deterministic: the same baseline and operations
  yield the same bytes on every reader.
- **[N3]** Where the content of a module's printer operations is present, a
  reader MUST be able to replay them with the printer and MUST classify the
  module as inconsistent if the result differs from `wasm`. Where it is
  withheld, **N1** still holds and the reader says that the ledger cannot
  be replayed.
- **[N4] Printer only.** The kernel MUST refuse any core operation (§1.7)
  that sets `wasm` or `items` of a module, or `module` or `tests` of a
  Compute-let. Those change only through the printer and the promotion
  sequence (§11.6).

### 11.5 The ledger

The ledger of a Compute-let is the part of the Chronicle made of changes
whose operations are the printer's. It is not a separate structure: it obeys
the laws of §1.7 and is navigated by the projections of §7.5.

For each item, the ledger answers:

| Question | Answered by |
| --- | --- |
| What caused it? | the `origin` of the change named in the item's `by`: prompt, model, requester |
| What did it replace? | that change's operation, which names the previous hash |
| What justifies it? | evidence of kind `tested-by`, from the item to tests |
| What has run it? | evidence of kind `exercised-by`, from the item to a recorded replay |
| What was decided? | decisions about that change |

- **[N5] Meaning, not mechanics.** Origin attaches to items. Derived bytes
  have no origin beyond "computed by the printer", and a change that only
  shifts derived bytes attributes nothing. Every byte of a module is thus
  either an item's, with an origin, or derived (**R8**).
- **[N6] By content.** A unit copied to another module keeps its key and
  therefore its hash; the copy is recorded with `copied`, as any copy is
  (§8.5), and its history is found by following that.

Projections of a module, in addition to those of §7.5: `items` (each item
with key, kind, name, signature, size, origin and tests, one per line);
`unit(key)` (its instructions in WebAssembly text format, with other items
shown by name); `calls` (which units call which); `unit-history(key)` (the
changes that set it, newest first). Search covers key, hash, name,
signature, call relationships, prompt text, test coverage and revision.

### 11.6 Tests and promotion

A test object (`ufo.test`) holds:

| Property | Value |
| --- | --- |
| `run` | either `{call, arguments}`: an exported function and values to pass; or `{replay}`: the bytes of a recorded replay (**M7**) |
| `from` | the bytes of the snapshot to start from, or `live` to start from a copy of the running state |
| `expect` | either `{returns}`: the values the call must return; or `{state}`: the hash the snapshot taken afterward must have; or `{draws}`: the hash of the display list last drawn |
| `fuel` | the fuel allowed |
| `judges` | list of item keys: functions in the module that exist to serve this test |

A change to a Compute-let is **promoted** by this sequence, which the
reader, not the Compute-let, carries out:

1. The printer produces a candidate (§11.4). On refusal, stop.
2. The reader verifies the candidate (**N1**). On failure, stop.
3. The reader runs the tests named by the manifest *as it was before the
   change* against the candidate, each from the state its `from` names, in
   a shadow instance. The running instance is not touched.
4. If every test passes, the reader obtains the person's approval, unless
   the person has approved in advance changes by this actor to this
   Compute-let for the present session.
5. The reader records the live state (**M6**), commits the change, starts
   the candidate from that state and switches the surface to it. The
   candidate's memory, globals and tables are those of the live instance; a
   global the change added takes its declared initial value; a data segment
   the change altered is not re-applied unless the operation says so. The
   previous revision remains in history.
6. If anything fails or approval is refused, the candidate is discarded.

- **[G1] The judge is outside the change.** The tests that gate a change are
  those in force before it. A change that adds, alters or removes a test
  object, or touches any item a test lists under `judges`, is a **test
  change**. It MUST NOT be combined with any other operation, and it is
  committed only with a decision of verdict `approve` from the person,
  given for that change.
- **[G2]** The running Compute-let never observes a candidate that failed.
- **[G3] Rollback** is promotion of an earlier revision, with the live state
  carried across in the same way and the same tests applied.

### 11.7 Summaries and the light cone

A summary (`ufo.summary`) condenses a stated scope. It is a derivation
(§8.3) with `how` `summarize`: its `from.sources` are pins to exactly what it
condenses — regions, objects, changes, items, other summaries, other
universes. Beyond `from` it has:

| Property | Value |
| --- | --- |
| `line`, `paragraph`, `page` | the summary at three sizes: each a ref to a text, any of which may be absent |
| `parts` | list of refs to the summaries of the scopes this one divides into |

Summaries form a tree through `parts`, from the universe object's `summary`
at the top down to content. The tree continues into nested and linked
universes through pins that name them. This tree is what the project calls
the light cone: the whole at low resolution, any part at full resolution.

- **[Z1] A summary is a claim; its pins are the evidence.** A stale summary
  MUST be marked stale wherever it is shown and MUST NOT be silently used.
- **[Z2] Navigation, not knowledge.** A summary is never a source: it may not
  be evidence (**R4**). Every projection that returns summary text labels it
  as a summary and gives the pins beneath it, so that whoever reads it can
  cite the content and not the summary.
- **[Z3]** `expand` on a summary returns its `parts`; on a summary without
  parts, the content its pins name. An observer can therefore always go from
  the whole at low resolution to any part at full resolution, and the cost
  of doing so depends on the path taken, not on the size of the universe.

Lossless compression for storage and transport is a codec (§2.1) and is
independent of summaries.

Summaries of history pin changes. In a copy that withholds working history
they remain readable, and their pins to withheld content report as
unavailable rather than stale.

### 11.8 The agent interface

The projections of §7.5 and the actions below are functions of the kernel,
so every reader has them; the printer's operations (§11.4) are available
wherever the printer is. A reader of
rung 3 also offers them to outside agents as tools under the Model Context
Protocol:

| Action | Effect |
| --- | --- |
| `propose(change)` | submit operations with origin, evidence and note; the kernel verifies and commits, or refuses whole |
| `print(operations)` | submit printer operations for a Compute-let; begins promotion |
| `test(computelet)` | run its tests against the current state and report |
| `import(bytes)` | add an asset |
| `derive(sources, how, objects)` | write objects derived from the stated sources — a transmutation, a rendition, a summary — in one change, with pins to exactly those sources made by the kernel, and the origin stated. A derivation can enter a universe no other way |
| `refresh(object)` | list the stale pins of a derived object and, on `derive`, replace it with a regenerated one (**D3**) |
| `export(face, parameters)` | sample and encode a face |

- **[I1]** An agent sees a universe only through the kernel, and so sees
  exactly what a person's reader sees.
- **[I2]** Every action an agent takes that alters a universe is a change
  whose `actor` names the agent and whose `origin` names the model, the
  prompt and the principal who asked.
- **[I3]** The interface is subject to **U11**.

---

## 12. Budgets

Elegance is measured. Each number below is a limit. Exceeding one is a
design failure to be explained in writing and resolved by simplifying, or by
changing this section with the reason recorded. Every milestone reports
every row.

These numbers were set before any implementation exists. The first
implementation MUST report the measured values, and this section is then
revised once, with reasons, before anything is frozen.

### 12.1 Size of the idea

| Measure | Limit | Now | Reason |
| --- | --- | --- | --- |
| Primitives | 11 | 11 | these sufficed for all four worked examples (§14) |
| Layout rules | 3 | 3 | two candidates were deleted (§5.4) |
| Axis kinds | 3 | 3 | every anchor in §14 uses one of them |
| Core operations | 5 | 4 | `remap` became a property |
| Node kinds | 5 | 4 | values kept outside a node are blobs |
| Kinds of reference a value can hold | 5 | 4 | ref, anchor, formula, indirect; the link is gone |
| Frame kinds | 6 | 6 | |
| Formula operators | 64 | 51 | a spreadsheet's essentials; anything larger is a Compute-let |
| Base host functions | 12 | 10, plus 2 exports | small enough to implement identically on every host |
| Capabilities | 20 | 16 | each is something only a host can provide (**H4**) |
| Operations across all capabilities | 64 | 32 written or sketched: `text` 3, `present` 2, `gpu` 27 (Appendix E); `objects` reuses the projections and actions | the rest are unwritten; the count is part of the interface's true size |
| Printer operations | 16 | 12 | |
| Concepts | 40 | 39 | what a newcomer must learn; each is justified in §16, and a new concept must displace one |
| All defined terms, including names for compositions and structural terms | 130 | 127 | the full total of §16's three tables |

### 12.2 Size of the player

Lines are non-blank, non-comment lines of the implementation language, Rust.
These limits change only on measurement.

| Measure | Limit | Reason |
| --- | --- | --- |
| Kernel source, excluding tests | 10 000 lines | one engineer reading about 1 200 lines an hour finishes in a working day |
| Kernel, compiled WebAssembly | 256 KiB | a tenth of a typical phone photograph |
| Kernel, DEFLATE-compressed | 96 KiB | what an envelope actually carries |
| Binding source, per host | 600 lines | readable in minutes; this now includes executing the drawing contract (§6.2) |
| Web binding, as shipped | 16 KiB | |
| Tools universe (§6.6), as carried | 24 KiB | description only; no code |
| Web envelope holding one paragraph | 192 KiB | compressed kernel in base64 (128 KiB), binding, tools universe, static face, pack |
| Web envelope for each worked example of §14 | reported | no limit yet; measured and published with the first implementation |
| Printer, compiled | 192 KiB | carried only with working history of Compute-lets |
| Implementations of any piece of format, layout or media logic in the project's readers | exactly 1 | **K1** |
| Names of object types, properties, profiles, operations or foreign document formats appearing in a binding or native shell | 0 | **K2**; found by searching its source |

The kernel's lines are budgeted by part, so that growth is noticed where it
happens:

| Part of the kernel | Lines |
| --- | --- |
| Hashing, values, pack, recovery, index, compaction | 1 300 |
| Objects, object map, blobs, changes, conservation, sequences | 1 300 |
| Anchors, resolution, pins, digests, derivations, travel layers | 1 000 |
| Formulas, including arithmetic that must be identical everywhere | 1 200 |
| Layout, composition, clocks, hit testing, presentation state, pagination | 2 500 |
| Projections, search, difference, actions, undo | 1 500 |
| Module checking, instrumentation, promotion | 1 200 |

### 12.3 Behavior

| Measure | Limit | Reason |
| --- | --- | --- |
| Static face visible, web envelope, any device | first paint | it is plain HTML ahead of everything else |
| Time to first interaction, one-paragraph envelope, mid-range phone | 500 ms | opening should feel like opening a photograph |
| Time to first interaction, Quarterly Review (§14.4), mid-range phone | 1 000 ms | |
| Tool calls for an agent to find and explain the origin of a unit of machine code, entering at the top summary | 3 + the depth of the summary tree | `overview`, one `expand` per level, `why`, `text` |
| Share of the universe an agent expands to do so | reported | must fall as the universe grows |
| Reopened universe has the same root hash on every reader tested | always | |
| Canonical export bytes identical on every reader tested | always | **S5** |

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

## 13. Mapping a rich editing application

The provenance model of §1.7 and §8.5 belongs to the format. This section
argues that an application with its own, richer provenance system can write
its records into a UFO and read them back without loss. Cursive, a writing
application that attributes every AI contribution to the prompt and
generation behind it, is the example because its records are known in detail. It is not the authority,
and this mapping has been worked on paper against its record definitions,
which are not reproduced here; it has not been run, and losslessness is a
claim to be tested (§13.4), not a result.

### 13.1 The principle

An application writes two things and only two:

1. **Portable facts**, in the format's own terms. These are what any other
   reader understands.
2. **Residual fields**, as properties under the application's prefix, on the
   same objects. These are what only it understands. Every other writer
   preserves them (**C6**).

No fact is written in both. If a portable fact can be computed from a
residual field or the reverse, only the portable fact is stored.

### 13.2 Cursive's records

| Cursive record | In a UFO |
| --- | --- |
| Note source (Markdown) | a text with `syntax` `text/markdown`; `chars` is the source, exactly; spans derived by Cursive's parser, with `marker` spans over markup (§8.1) |
| Attribution segment `[from, to)` in editor positions | not stored; it is the `seq` of the text, whose elements name their changes. Cursive converts between its positions and character positions using its own parse of the same source |
| Generation record: prompt, model, operation, conversation, original and generated text | one change. `origin` is `{basis: witnessed, by: model, model, prompt, context, asked, parameters}`; the prompt and conversation are text objects; the generated text is the `ins` of the change's splices; the original text is their `old` |
| Parent and derived-from generation ids | `origin.context` pins to the earlier changes; which is which is kept in `io.cursive.lineage` on the change |
| Retrieved sources, with bibliographic fields and content hash | objects of type `io.cursive.source` holding those fields; evidence of kind `consulted` from the generated region to each (**R3**) |
| User change record, made by typing in the editor | a change with `origin` `{basis: witnessed, by: person}` |
| Attribution established by aligning text | `{basis: inferred, by: person` or `model, method: text-alignment, confidence}`, where Cursive's precision grade (`exact-mark`, `exact-text`, `single-window-text`, `fallback`) is the confidence (**R2**). If the alignment is done as the edit is saved, this is the `origin` of that change; if it is done later, it is an entry in a later change's `attributions` (§8.5) |
| External or pasted content with no record | a change with `origin` `{basis: unknown}` |
| Content written by the application itself (restore, system) | a change with `origin` `{basis: witnessed, by: tool}` |
| Copy and paste with a transfer record | a change whose `origin` is `{basis: witnessed, copied: pin to the source region}`; the destination needs no new generation record, because origin follows `copied` (§8.5) |
| Acceptance, unacceptance | decisions with verdict `accept` and `retract` about the generation's change (**R6**, **R7**) |
| Generation deleted with a review action | the splice that removes the text, with a decision of verdict `reject` or `revise` |
| Generation declined before entering the document | the generated text kept as a text object referenced by nothing in the document, its change carrying a decision of verdict `reject` |
| Source-edit ledger entry: baseline hash, old text, contexts, replacement | a splice: the elements removed, `old`, `ins`, applied to the parent commit. The context fields exist to locate an edit unambiguously; element identities already do |
| Shadow workspace result | the change computed from the shadow's bytes against the baseline (**L1**); the agent session is the `actor` |
| Version, with label and source | a commit whose change carries `io.cursive.version` with the label and source. Every commit is restorable, but only these are Cursive's versions |
| Snapshot, by content hash | a revision, by revision hash |
| Restore | a change whose operations return the text to an earlier state, with `copied` pinning that revision |
| Document duplicate (fork) | a copy of the pack: same lineage, same history, diverging from the next commit |

### 13.3 What needs a residual field

| Cursive fact | Why it has no portable form | Stored as |
| --- | --- | --- |
| Separate attribution of formatting marks | portable: a change that sets a span has its own `by`. The opaque mark signature is Cursive's | `io.cursive.mark` on the span |
| Open vocabularies: operation, mode, macro id, decline reason, mark policy | application meaning | `io.cursive.*` on the change |
| Event identifiers and their original order | the Chronicle orders changes; Cursive's ids are its own | `io.cursive.event` on the change |
| Diagnostics, projection-saved witnesses | derived or local; a UFO's digests and conservation check do this work | not written |

### 13.4 Reading back, and the test

Cursive rebuilds its records from the Chronicle: segments from `seq`,
generation records from changes with model origin, acceptance state by
**R7**, versions from commits.

Every reader, not only Cursive, then shows aligned attribution for what it
is: inferred, by a named method, with a grade — distinct from text whose
origin was witnessed, and distinct from text of unknown origin.

When a Cursive document is sent, the default of §9.3 applies: who and what
wrote the text that is present travels; prompts, conversations, declined
generations and earlier versions stay behind unless the person includes
them.

The mapping is lossless if, for a Cursive document *D*: writing *D* to a
whole UFO, opening that UFO in a reader that knows nothing of Cursive, making an
edit there, and reading the result back into Cursive yields every record of
*D* unchanged, plus records for the foreign edit. That round trip is a
required conformance test for any application claiming to write this
profile.

One difference of principle remains and should be resolved in Cursive, not
in the format: Cursive keeps a second, element-level journal beside its
Chronicle. A UFO has one history. An application with two must choose which
is its record of origin.

---

## 14. Worked examples

Each example is represented using only the core, the eleven primitives and
the profiles of §8 and §11. Object names in `code` are labels for this
text; real identities are 16 bytes.

### 14.1 An interactive video

*A twenty-minute explanatory video with a live table, a computed
infographic, an anchored transcript, a document rendition and chapter
summaries.*

**Objects.**

| Object | Type | Content |
| --- | --- | --- |
| `video` | `ufo.clock` | interval 0 to 20 min; holds `stage` |
| `stage` | `ufo.group` | `absolute`, 1920 × 1080; its children are everything below that appears in the frame |
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
| `chapter-n`, `top` | `ufo.summary` | one per chapter, and one above them |

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
`top.parts` lists the chapters. Because a digest follows refs (§4.4), a
chapter summary goes stale when any caption or the footage within it
changes, and `top` goes stale when a chapter does. Trimming the video's start by ten seconds is
a `set` of the clock's frame on `t`; every chapter pin resolves through the
frame and stays attached.

**Export.** A standard video file is `video` sampled over 0 to 20 min at a
frame rate; `info-surface` is run frame by frame from its snapshot (**M5**),
the table in its default sort.

### 14.2 A game inside a document

*A design document containing the playable game, with editable levels, a
live modification by an agent, text linked to the code, and shared play.*

**Objects.**

| Object | Type | Content |
| --- | --- | --- |
| `design` | `ufo.text` | the document; an `embed` span halfway down names `game-portal` |
| `game-portal` | `ufo.portal` | `of` `game-surface`; `place` `block`; 960 × 540 |
| `game-surface` | `ufo.surface` | Compute-let `game`; `of` the current level; children: `terminal-portal` |
| `game` | `ufo.computelet` | module, tests, snapshot, poster; requests below |
| `engine` | `ufo.module` | the game's items |
| `level-1` … | `ufo.data` | each level as a scene in the glTF model (§5.5): nodes for rooms, props and spawn points, with `x`, `y`, `z` axes for the level's space and `t` for its scripted time |
| `manual` | `ufo.text` | the game's instructions, also readable on a terminal inside the game |
| `terminal-portal` | `ufo.portal` | child of `game-surface`; `of` `manual`; `place.at` an anchor to node `terminal-screen` of `level-1` |
| `test-1` … | `ufo.test` | calls with expected returns, and recorded replays with expected state |

**Requests.** `gpu` (required), `audio` (optional), `input.raw` (optional),
`objects` read on the level objects (required). Keyboard, pointer and touch
arrive through the base `input` function and need no grant. Without `gpu`
the Portal shows the poster and says why. Without `audio` the game is
silent.

**What the host interface provides.** The ten base functions; the four
capabilities above and `present`; `frame(time)` at the display's rate with
fuel set per call. Nothing else.

**The game's world is format data.** The three conditions of §5.5 hold:

- *Space is addressable.* A design note in `design` links to "the ledge
  above the second door" by an anchor to `level-1` with a region on `x`,
  `y`, `z`, and to a spawn point by its key on `nodes`. A cut-scene is
  cited by a region on `t`. These hold through edits to the level like any
  anchors; rescaling the level sets its frames.
- *What sits in the world is data, with attribution and summaries.* The
  terminal showing the manual is `terminal-portal`, an object whose
  `place.at` names the node it sits on. Every node of every level was set
  by a change, so `why` on a prop says who or what placed it. Each level
  has a summary whose sources pin its node table, under one summary for the
  game; an agent can learn what is in level 3 without starting the game.
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
2. calls `print` with `func.add` for the new mechanic and `func.replace` for
   the update function, naming each function's key and expected hash.

The reader runs the promotion sequence (§11.6): the tests in force before
the change run against the candidate in a shadow instance started from the
paused state; on success, and with the person's approval, the candidate
takes over from that state and the game resumes with the mechanic. The
agent cannot make the tests easier in the same breath: touching a test or
a function a test relies on is a test change, alone and approved (**G1**). A broken candidate is discarded and the
paused game is untouched (**G2**).

**Text linked to code.** The paragraph of `design` describing the mechanic
carries a `link` span whose `href` is an anchor to `engine` with a region on
its keyed `items` axis naming the new function's key, which survives later
improvements to the function. In the other direction,
the agent's change records evidence `{claim: that unit, support: pin to the
paragraph, kind: cites}`. `why` on the
unit returns the prompt, the model, the tests and the paragraph.

**Shared play, later.** Two people open their own copies. Their readers
exchange only inputs, each stamped with a clock time, on a port. Each reader
delivers the merged inputs to its own instance at the same clock times.
Because execution is deterministic (**M5**) and time comes only from the
clock (**T1**), both instances stay identical. This needs a transport
capability and nothing in the core.

### 14.3 A body of research

*Four hundred documents, sixty datasets, twenty interviews with
transcripts, twelve analysis Compute-lets; an agent asked why a conclusion
was reached.*

**Structure.** The corpus is one universe, `corpus`, whose objects include
the final report and whose pack nests one universe per study (§1.8). Each
study universe holds its documents as texts, its datasets as data objects,
its interviews as clocks over audio assets with transcript texts anchored
to time as in §14.1, and its Compute-lets. Studies shared with other
corpora are linked rather than nested; the reference is identical.

**Linking.** A passage quoted from a study into the report is a Portal
whose `of` is a pin to the passage's region, in the study's universe at a
stated commit (transclusion, §8.4). A chart in the report is a Portal to a
group in the study that presents its dataset. Conclusions in the report
carry evidence entries whose `support` pins regions of study documents and
cells of datasets.

**Summary tree.** `corpus.summary` has `parts`: one summary per
study and one for the report. Each study's summary pins that study's commit
and has parts for its documents, datasets, interviews and Compute-lets; a
document's summary has parts per section; an interview's per segment of
time. Four hundred documents are reached in four levels.

**The question.** "Why does the report conclude *C*?"

| Step | Call | Reads |
| --- | --- | --- |
| 1 | `overview` | the top summary's page: what the corpus is, and one line for each study and for the report |
| 2 | `expand` on the report's summary | one line per section of the report; the conclusions section is evident |
| 3 | `expand` on that section's summary | a paragraph per conclusion, each with the pin of the sentences it condenses; *C* is one |
| 4 | `why` on the pin for *C* | its origin (who or what wrote it, with what basis), its evidence (pins into two studies), its decisions |
| 5 | `text` on each evidence pin | the exact supporting passages and cells, each checked against its pin |
| 6 | `why` on a supporting passage | its own origin: say, a person's edit of a model's draft that consulted interview 7 between 12:40 and 14:05 |
| 7 | `text` on that interview region | the words spoken |

The agent entered at the coarsest summary and descended three levels
without searching. It answers with the anchors from steps 4 to 7 and their
origins. It has expanded one branch of the summary tree, a few passages of
two studies and ninety seconds of one transcript. The other studies were
seen only as single lines in step 1. `search` remains available as a
shortcut; the light cone does not depend on it.

If a supporting passage has changed since the conclusion was written, its
pin is stale and step 4 says so (**R5**): the agent reports that the
conclusion rests on evidence that has since moved.

### 14.4 The Quarterly Review

*A report, a dataset, two charts, a photograph and a Compute-let, opened as
nine faces and sent two ways.*

**What the author made.**

| Object | Type | Content |
| --- | --- | --- |
| `report` | `ufo.text` | about two thousand words; embed spans for two charts, the photograph and the projector |
| `figures` | `ufo.data` | quarterly figures |
| `chart-a`, `chart-b` | `ufo.region` | axes, bars and labels as paths and text under `each` over `figures` |
| `photo` | `ufo.asset` | the photograph's original JPEG bytes; presented by a raster |
| `projector` | `ufo.computelet` | the assumptions tool; requests `objects` read on `figures` |
| `approved.pdf` | `ufo.asset` | `from` `{sources: [pin report, pin figures, …], how: render}`; with it, page images in a baseline format, since a reader does not decode PDF (§6.4) |

**Faces.**

| Face | Kind | How |
| --- | --- | --- |
| Document | sampled | `report` composed as a flow; charts drawn from current `figures`; `projector` running in its Portal |
| Plain text | sampled | §7.3 |
| Spreadsheet | sampled | `figures` presented as a grid; export as a table file |
| Image | sampled | any object at one moment, one viewport (§7.4) |
| Fixed document | carried | the page images of `approved.pdf`, shown with a stale mark if any pin has moved; the PDF itself is exported byte for byte |
| Slide deck | transmuted | `deck`: a `held` clock over regions, with Portals to `chart-a` and `chart-b`; `from` pins `report` and `figures`; origin `model` |
| Narrated video | transmuted, then sampled | `narration`: a text (transmuted) and its synthesized voice (an audio asset: carried, with a model as origin), each with `from` pinning what it was made from; `video`: a clock ordering the deck's regions against the narration; exported by sampling |
| 3D view | transmuted, then sampled | `scene`: a `ufo.data` object in the glTF model (§5.5) whose rows describe bars, labels, lights and a camera for `figures`, with `from` pinning `figures`; `scene-surface`: a `ufo.surface` whose Compute-let, `scene-presenter`, requests `gpu` and `objects` read on `scene` and `figures`. Bar heights are read from `figures` as it now is, so the view is live; the arrangement and styling in `scene` are what was transmuted |
| Application | sampled | `projector` presented alone, full size |

**The 3D view meets the three conditions of §5.5.** *Addressable:* `scene`
declares `x`, `y`, `z` and `t`; the report's sentence "the third quarter
towers over the rest" links to the bar by its key on `nodes`, and a
reviewer's comment is anchored to a region of space above it. *Readable
without the program:* each bar's node was written by the transmuting
change, so `why` on it names the model and the prompt, and the scene has a
summary pinned to its node table, under the report's. *Flat content placed
in it is data:* a caption panel beside the bars is a Portal child of
`scene-surface` whose `of` is an anchor to the sentence in `report` and
whose `place.at` names the node `caption-panel`; edit the sentence and the
panel in the scene shows the new words.

**It uses no hidden profile.** `scene` is a data object like
`figures`. `scene-presenter` is a Compute-let like `projector`, carried in
this universe and in no universe without a scene (**K4**). The kernel
composes a `surface` item and hands it the rectangle; it does not know the
content is three-dimensional. Exports of the view — a still, a turntable
video — are the surface sampled over time (§7.4). A standard 3D model file
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

**Sending.** To a colleague: a web envelope (§9.2) opening every face above
in a browser. Before it leaves, the reader shows what will travel (**E12**):
the content; the attribution, naming the author, the model that produced the
deck and narration, and forty-odd changes; not the prompts or the earlier
drafts of the report, unless the author includes them. To a video-only
channel: an MP4 envelope whose outer face is the exported narrated video,
bearing its mark, on the understanding that the channel may strip the pack
and leave the mark as the way back to the universe (**E19**, **E20**).

### 14.5 What the examples required of the core

Nothing was added to §1–§4 to represent these examples. They did shape
three decisions made while drafting: clocks became a primitive symmetrical
with regions, rather than a property; presentation state was separated from
universe state, so that sorting a table inside a video is not an edit; and
references to other universes were made identical for nested and linked
content.

---

## 15. Corner-painting checklist

| Check | Result | Where |
| --- | --- | --- |
| The core contains no assumption that content is text, that layout is a page, or that time does not exist | Holds. §1 names no medium. Text first appears in §8.1 as one profile; a page is a composition (§5.4); time is an axis kind and a clock | §1, §4.2, §4.5 |
| Anchors are generic and every profile defines how its anchors survive edits | Holds, more strongly: survival is defined once per axis kind in the core, and a profile only declares its axes | §4.2, §4.3 |
| The clock model serves video, audio, animation, simulations and games | Holds: locked, free and held clocks cover §14.1 (video, audio, captions), animation by formulas of `time`, and Compute-lets through `time()` | §4.5, §14.1, §14.2 |
| Presenters are sandboxed components behind a defined interface and can be carried as Compute-lets | Holds for every presenter a universe carries: each is a sandboxed Compute-let behind the host interface. The four base presenters are deliberately not components: they are the host's own facilities, behind the display list, which is equally a defined interface | §6.1, §6.2, §6.3, **M3** |
| Every reference uses content addressing or stable identity, never file paths | Holds. Refs are identities; indirects and anchors name hashes; locations are hints without authority | **C11** |
| Every derived artifact records what it was derived from | Holds. One derivation record with pins, for renditions, transmutations, summaries, derived spans and imports | §8.3 |
| The host interface's optional capabilities have a defined request and degradation path | Holds | **H1**, **H2** |
| Nesting depth, active decoders and active Compute-lets are bounded by the reader, not trusted to the file | Holds | §3.1, **C13**, **O7** |
| The Chronicle and ledger share foundations so one navigation approach serves every medium | Holds. The ledger is the Chronicle's changes with printer operations; the same projections navigate both | §11.5, §7.5 |

"Holds" here means the design satisfies the check on paper. None has been
tested.

---

## 16. Glossary

Every defined term of this document is in one of three tables. There are
127 in all: 39 concepts, 20 names for compositions, and 68 structural
terms.

**Concepts.** What a newcomer must learn. A concept is listed here only if
it cannot be expressed as a composition of the others; the third column
says why not.

| Concept | Meaning | Why it cannot be removed | § |
| --- | --- | --- | --- |
| Anchor | a reference to an object or a region of one | the one way anything attaches to anything | 4.1 |
| Axis | a named dimension of an object: sequence, continuous or keyed | defines what a region is and how it survives edits | 4.2 |
| Binding | the host-specific code connecting the kernel to a host | the only part that differs by host; must be named to be kept empty of domain logic | 6.1 |
| Blob | an immutable byte stream stored as chunks | range reads and identity of large bytes | 1.4 |
| Capability | a named, granted authority beyond the base host functions | the unit of permission | 6.3 |
| Change | the object recording one transition of a universe | carries operations, origin, evidence and decisions | 1.7 |
| Clock | a mapping from a parent's time to a child's, over an interval | time cannot be composed from space | 4.5 |
| Commit | the record fixing a universe's state and history | the thing a root hash names and a seal signs | 1.6 |
| Compute-let | a complete single-purpose machine carried as an object, run in a sandbox | behavior cannot be composed from description | 11.1 |
| Decision | what a person chose to do about content | one of three facts that must never merge | 8.5 |
| Derivation | the record of what an object was made from, and how | basis of staleness for every derived thing | 8.3 |
| Display list | what the kernel composes for presenters to draw and play | the contract between kernel and host | 6.2 |
| Element | one item of a sequence, with a permanent identity | what attribution, anchors and spans attach to; the basis of later merging | 1.7 |
| Envelope | a file valid in a common format that carries a pack | how a universe reaches software that does not know the format | 9.2 |
| Evidence | what supports content | one of three facts that must never merge | 8.5 |
| Face | a presentation of a universe: sampled, carried or transmuted | what a person actually opens | 7.1 |
| Feature | a declared requirement a reader needs to interpret a universe | lets old readers fail plainly on new content | 1.6 |
| Formula | a pure, terminating, deterministic expression | computed values without a program | 5.3 |
| Grant | a reader's record that a person allowed a capability | must be distinct from a request, which a file can contain | 10.3 |
| Hash | the SHA-256 digest that names a record | identity of everything stored | 1.1 |
| Host interface | the complete set of functions a sandboxed component may import | the frozen boundary of the sandbox | 6.3 |
| Kernel | the one program that reads, verifies and composes a universe | the single implementation everything else relies on | 6.1 |
| Membrane | a boundary between universes, with rules for what crosses | what makes unlimited nesting and linking safe; decides what travels | 10.4 |
| Object | an identity with a type and properties | the unit of content | 1.5 |
| Operation | one edit to the parent commit's state | what conservation is computed from | 1.7 |
| Origin | who or what contributed content: witnessed, inferred or unknown | one of three facts that must never merge | 8.5 |
| Pack | the byte format holding a universe's records | the file | 2.1 |
| Pin | an anchor that records the digest of what it covers | the staleness test | 4.4 |
| Portal | an occurrence in a parent that presents another object | composition of objects, within and across universes | 8.4 |
| Presenter | what turns display-list items into output: the host's facilities, or a carried Compute-let | must be named to be kept few | 6.1 |
| Primitive | one of the eleven kinds of thing a universe can describe | the vocabulary | 5.1 |
| Principal | a party that acts, identified by key, name or both | who an actor, decider or sealer is | 10.1 |
| Printer | the only writer of module bytes | sole writer of executable content | 11.4 |
| Projection | anything generated on demand and never stored | separates views from truth | 7.1 |
| Record | an immutable byte string named by its hash | the unit of storage | 1.3 |
| Revision | one state of an object, named by its revision hash | what an anchor is expressed against | 1.5 |
| Seal | a signature over a root hash | identity, as distinct from integrity | 10.2 |
| Summary | a derivation that condenses a pinned scope | navigation at low resolution | 11.7 |
| Universe | the set of objects reachable from one commit | the whole | 1.6 |

**Names for compositions.** Each of these is fully part of the format and
loses nothing by appearing here. It is built from the concepts above, and
the second column says how.

| Name | Is |
| --- | --- |
| Agent | a writer acting through the agent interface |
| Asset | an object whose `bytes` is a blob |
| Attribution | origin, evidence and decision read for a region |
| Border | the moment of import or export |
| Chronicle | the chain of commits and their changes |
| Coordinate space | the set of axes an object offers |
| Edge | a property holding a ref |
| Ledger | the changes whose operations are the printer's |
| Light cone | the summary tree |
| Rendition | an asset with a derivation |
| Root | an entry in the universe object's `roots` |
| Snapshot | a blob of Compute-let state |
| Span | an anchor on a text's elements, with a role and properties |
| Transclusion | a Portal whose target is a region of another object |
| Transmutation | described objects with a derivation whose `how` is `transmute` |
| Unit | a module item that is a function, named by key and hash |
| Working form, travel form | a pack alone; a pack in an envelope |
| Content, attribution, working history | the three sets of records, by reachability, that decide what travels |
| Carried presenter, component | a Compute-let on a surface; a Compute-let the player relies on |
| Tools universe | a nested universe that is the interface to the kernel's functions |

**Structural terms.** Words for the parts of records and for the states
things can be in, each defined where it is first used: chunk, node, value, ref, indirect, veiled, opening, frame (of a pack), head, index, note, signature (of a pack), offset, reachable, identity, type, property, sequence property, run, removed (of an element), boundary, revision hash, root hash, object map, universe object, lineage, work (of a change), region, frame (of an axis), digest, flick, basis (witnessed, inferred, unknown), finding, malformed, inconsistent, unavailable, unrecognized, whole, live, withheld, detached, current, stale, compaction, presentation state, player, base presenter, drawing contract, port, manifest, module, item, key, derived bytes, fuel, test, test change, promotion, static face, plain-text head, envelope template, mark, sharing, publishing, export, determinism tier, occurrence.

---

## Appendix A. Properties of the primitives

All lengths are in the units of the enclosing region. Colors are sRGB with
alpha, as four floats from 0 to 1. Properties in *italics* say what a thing
is and MUST NOT be formulas (§5.1); all others may be.

**Common to all:** `frames` (§4.3), `label`, `role`, `lang`, `opacity`, `visible`, `on` (map
from an input event name — `press`, `enter`, `leave`, `key`, `change` — to
`{set: state name, to: formula}`, `{propose: operations}` (§5.6), or
`{deliver: true}` for surfaces), `from` (§8.3).

**In a parent:** `place` (including `at`, an anchor, for a child of a
surface), `x`, `y`, `w`, `h`, `row`, `col`, `span`, `align`, `grow`,
`margin`.

| Primitive | Properties |
| --- | --- |
| Text | *`chars`*, *`spans`*, *`syntax`* (§8.1); `editable` (§5.6); and default style: `font` (list of family names or a ref to a font asset), `size`, `weight`, `slant`, `color`, `direction`, `line`, `align`, `decoration`. Spans override these |
| Path | `d`: list of segments `[M x y]`, `[L x y]`, `[C x1 y1 x2 y2 x y]`, `[Q x1 y1 x y]`, `[Z]`; `fill` and `stroke`: a color or a gradient `{kind, stops, from, to}`; `width`, `join`, `cap`, `dash`, `rule` |
| Raster | *`source`*: ref to an asset or surface; `time` (for video sources); `crop`; `fit`; `smooth` |
| Samples | *`source`*: ref to an asset or surface; `gain`; `pan`; `time` |
| Region | *`children`*; `w`, `h`; `transform`: six floats; `clip`: a path or boolean; `background`; `scroll` |
| Group | *`children`*; `layout`: `flow`, `grid` or `absolute`; `direction`; `gap`; `rows`, `cols` (for `grid`); `each`, `as` |
| Clock | *`children`*; `start`, `end`, `rate`, `offset`, `repeat`, `mode`; `drive` (formula, for `held`) |
| Portal | §8.4 |
| Surface | *`computelet`*: ref; *`of`*: ref to the object it presents, if it presents one; `w`, `h`; *`ports`*: map from port name to the surface it connects to; *`children`* |
| Data | *`cols`*: map from column key to `{label, type, order}`; *`rows`*: map from row key to map from column key to value, each row out of line when large; a cell may hold a formula; `sort`: list of row keys giving the default order; *`axes`*: map from axis name to `{kind, low, high, unit}` for continuous axes the object offers beyond its keyed ones, and *`tables`*: for an object holding several tables, map from table name to `{cols, rows}` |

**Axes.** A sequence or keyed axis has the name of the property it is bound
to. The continuous axes and their extents are:

| Type | Axis | Extent |
| --- | --- | --- |
| Clock | `t` | `start` to `end`, in flicks |
| Region, group, surface, raster, path, Portal | `x`, `y` | 0 to `w`, 0 to `h` |
| Raster or samples from a timed source | `t` | 0 to the source's duration, in flicks |
| Data | those it declares in `axes` | as declared |
| Surface | those its Compute-let declares in `axes` (§11.1) | as declared |

**Default presentation of text roles.** A block span is laid out as a block
in the flow. Unless the span says otherwise:

| Role | Default |
| --- | --- |
| `paragraph` | space after equal to one line |
| `heading` | `level` 1 to 6; size 2, 1.5, 1.25, 1.1, 1, 1 times the text's size; weight bold; space before one line |
| `item` | indent of two character widths per `level`; a marker before the first line: `marker` is `bullet`, `number` (counting consecutive items at the same level) or literal text |
| `quote` | indent of two character widths at both sides |
| `code` | a monospaced font; line breaks kept; no wrapping |
| `emphasis`, `strong` | slant italic; weight bold |
| `link` | `href` is followed on `press` |
| `marker` | not presented |

A table within a text is a `grid` group at an `embed` span. Page headers
and footers are groups given to the paged sampling (§7.4) as parameters;
formulas in them read `state("page")` and `state("pages")`.

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
| identity | `o:` and the shortest prefix of its lowercase hexadecimal, of at least 8 digits, that is unique among identities in the universe |
| hash | the same rule among hashes of its kind, with `r:` for a revision, `c:` for a commit, `b:` for a blob, `k:` for a module item's key |
| region | `axis=[low,high]` for sequence and continuous axes, `axis=[key,key]` for keyed ones; several axes are several fields |
| anchor | `o:…` then, if any, its regions, then `r:…`; written without spaces inside brackets |
| integer, float | decimal; floats with the fewest digits that round-trip |
| time | milliseconds as an integer; clock times in flicks with the suffix `f` |
| text | a JSON string (RFC 8259) |
| list | values separated by commas, in brackets |
| state | one of `current`, `stale`, `detached`, `unresolved`, `withheld`, `absent` |
| basis | one of `witnessed`, `inferred`, `unknown` |

A value too long to show — text over 200 characters where the projection
is not asked for the text itself — is written as its first 200 characters
followed by `…` inside the string, with a `len=` field after it.

Two rules bind every projection. It is a function of the commit and its
arguments alone. And every identity, hash and anchor it shows can be
passed back, exactly as written, as an argument to another projection.

**Records.**

| Projection | Arguments | Records, in order (`*` any number, `?` at most one) |
| --- | --- | --- |
| `overview` | — | `universe`; `seal`*; `feature`*; `component`*; `face`*; `lacks`?; `summary`? |
| `object` | identity | `object`; `prop`*; `run`*; `referrer`* |
| `text` | anchor | `text` |
| `search` | query | `hit`* |
| `history` | anchor | `change`* newest first |
| `why` | anchor | `region`; then for each part of it: `run` or `value`; `copied`*; `finding`*; `evidence`*; `decision`? |
| `diff` | two commits or revisions | `op`* |
| `expand` | identity of a summary | `summary`; then `part`* or `content`* |
| `verify` | commit | `check`*; `issue`* |
| `sample` | face, parameters | as text: `text`; as a display list: `item`* |
| `items` | identity of a module | `item`* |
| `unit` | item key | `unit`; `code` |
| `calls` | identity of a module | `call`* |
| `unit-history` | item key | `change`* newest first |

| Record | Fields |
| --- | --- |
| `universe` | `lineage` `commit` `height` `objects` (count) `changes` (count) |
| `seal` | `commit` `key` `state` (`valid`, `invalid`, `unchecked`) [`name`] [`time`] |
| `feature` | `name` `v` `required` `supported` |
| `component` | `role` `hash` `state` |
| `face` | `id` `kind` (`sampled`, `carried`, `transmuted`) `state` `medium` `label` |
| `lacks` | `history` (boolean) `blobs` (count) |
| `summary` | `id` `size` (`line`, `paragraph`, `page`) `state` `sources` (list of anchors) `text` |
| `part` | `id` `state` `line` (text of its one-line size) |
| `content` | an anchor, then `type` |
| `object` | `id` `type` `rev` (number) `r` (revision hash) `by` |
| `prop` | `key` then `value`, or `len` and `kind` when large |
| `run` | a stretch of elements with one origin: the region, as positions, then `change` `basis` [`by`] [`who`] [`model`] [`tool`] [`asked`] [`prompt`] [`method`] [`confidence`] `sealed` (boolean) |
| `value` | `key` then the same fields as `run` from `change` on |
| `copied` | `from` (anchor) `basis` |
| `finding` | `change` `basis` and the origin fields, as in `run` |
| `evidence` | `claim` (region) `kind` `support` (anchor) `state` [`note`] |
| `decision` | `about` `verdict` `who` `change` `time` [`note`] |
| `referrer` | `id` `key` |
| `text` | the anchor, `chars` (count), then `s` |
| `hit` | the anchor, `type`, `s` (up to 80 characters around the match) |
| `change` | `id` `time` `actor` `basis` [`by`] `ops` (count) `touched` (list of identities) [`note`] |
| `op` | `op` `obj` [`key`] [`after`] [`del`] then `old` and `new`, each a value; where the change's `work` is withheld, one record `op withheld` |
| `check` | `rule` (a label of this document) `scope` `result` (`pass`, `fail`, `skipped`) [`reason`] |
| `issue` | `class` (of §1.9) `record` `rule` `s` |
| `item` | for `sample`: the display-list item as fields. For `items`: `key` `kind` `index` `name` `hash` `size` `by` `basis` `tests` (count) [`signature`] |
| `unit` | `key` `name` `signature` `hash` `by` |
| `code` | `s`: the instructions in WebAssembly text format, one per line, other items shown by name |
| `call` | `from` `to` (item keys) `count` |

An example:

```
why o:3f9a12c4 chars=[1042,1187] @ commit=c:77e0b1d2
region o:3f9a12c4 chars=[1042,1187] r:a81f3320
run chars=[1042,1120] change=o:d2c417e9 basis=witnessed by=model model="example-model-1" asked="A. Author" prompt=withheld sealed=true
evidence claim=chars=[1042,1120] kind=cites support=o:4410cc2e rows=[q3] cols=[revenue] r:09be77a1 state=current
decision about=o:d2c417e9 verdict=accept who="A. Author" change=o:5e02d9b7 time=1767225600000
run chars=[1120,1187] change=o:0b77a3f1 basis=inferred by=person who="A. Author" method="text-alignment" confidence="exact-text" sealed=false
end lines=5
```

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
           ; SHA-256 of the encoding of this map without `signature` (section 10.2)
note   = { ? history: bool,
           ? blobs: [ * { blob: hash, len: uint, hints: [ * tstr ] } ] }

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
sequence = tstr / bstr / [ * value ]
principal = { ? key: bytes .size 32, ? name: tstr }
```

`change-p` is the `p` of an object of type `ufo.change`, and `work` is the
value its indirect stands for. In these schemas `uint` and `int` are within
the integer range of §1.2. A key this schema does not list is unrecognized
and preserved in `obj`, `commit`, `seal`, `note`, `work` and in properties;
in `map` and `blob` nodes, whose shape must be a function of their
contents, it is malformed. Values are compared exactly: an integer is never
equal to a float.

The Chronicle's records (§8.5):

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

The drawing contract (§6.2):

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

The capability contract and the printer (§6.3, §11.4):

```
request = { capability: tstr, ? scope: value, required: bool, why: tstr, without: tstr }
print-op = { op: "func.add", key: id, ? name: tstr, params: [ * valtype ], results: [ * valtype ],
             locals: [ * valtype ], body: tstr }          ; body in WebAssembly text format
         / { op: "func.replace", key: id, expect: hash, locals: [ * valtype ], body: tstr }
         / { op: "func.remove", key: id, expect: hash }
         / { op: "export.set", key: id, name: tstr, item: id } / { op: "export.remove", key: id }
         / { op: "import.add", key: id, name: tstr, params: [ * valtype ], results: [ * valtype ] }
         / { op: "global.add", key: id, type: valtype, mutable: bool, init: value }
         / { op: "global.set", key: id, init: value }
         / { op: "memory.set", key: id, initial: uint, maximum: uint }
         / { op: "data.set", key: id, at: uint, bytes: bstr }
         / { op: "table.set", key: id, items: [ * id ] }
         / { op: "module.import", wasm: bstr, keys: [ * id ] }
valtype = "i32" / "i64" / "f32" / "f64"
```

Byte-level test vectors for this schema are in Appendix F.

## Appendix D. Checklist for any change to this design

Applied in review to every proposed addition to this specification, the
kernel, a presenter or a binding. A "yes" to any of the first six means
stop and redesign.

1. Does it implement something that already exists elsewhere in the system,
   in another language or another component?
2. Does it add a decoder, converter or format-specific path to the kernel?
3. Does it store the same content more than once in different forms?
4. Does it add a plugin, adapter or extension point where a composition of
   existing primitives would serve?
5. Does it teach a binding or native shell anything about a medium,
   document or application?
6. Does it carry components into files that do not use them?
7. Can it be expressed as data, a formula, or a composition instead?
8. Does it make the system easier or harder to explain on one page?
9. Will a universe that does not need it pay any cost for its existence?
10. If it were deleted, what would actually break, and could that be
    handled at the border instead?

A simplification must also pass the opposite test: it may remove mechanism,
never reach. Whoever removes a concept shows what it now composes from and
that every worked example of §14 still works.

## Appendix E. Accelerated graphics, sketched

The `gpu` capability follows the model of WebGPU (W3C), which every
current platform's graphics interface can serve, and uses its shading
language, WGSL. The contract of §6.3 is complete without this appendix;
the operations below are a sketch to be made exact with the first
implementation that needs them. Each is one `call` on the capability's
handle; resources are named by small integers the program chooses.

| Group | Operations |
| --- | --- |
| Limits | `limits` (what the host offers: texture size, sample counts, formats) |
| Buffers | `buffer.create`, `buffer.write`, `buffer.destroy` |
| Textures | `texture.create`, `texture.write`, `texture.from` (a raster source from §6.2, including one returned by `present`), `texture.destroy`, `sampler.create` |
| Shaders | `shader.create` (WGSL source; the reply reports errors) |
| Pipelines | `pipeline.render`, `pipeline.compute`, `bindgroup.create`, `pipeline.destroy` |
| Passes | `pass.begin` (targets: the surface or a texture), `pass.pipeline`, `pass.bind`, `pass.vertex`, `pass.index`, `pass.viewport`, `pass.scissor`, `pass.draw`, `pass.draw-indexed`, `pass.dispatch`, `pass.end` |
| Frame | `submit` (everything queued is drawn to the surface for this frame) |
| Readback | `read` (a texture's pixels; used for export and for tests) |

Rules that are already fixed:

- The surface is the only thing a program can draw to on screen. It cannot
  read what lies outside it.
- Every operation is charged fuel in proportion to the bytes it passes
  (**M4**), and the reader bounds the memory a program's resources may
  hold.
- Results on screen are not required to be bit-identical between hosts.
  Where they must be — a canonical export (§7.4), or a test with
  `expect.draws` — the reader uses a software implementation of the same
  operations, carried as a component, and `read`.
- Shader source travels as data in the Compute-let and is given to the
  host to compile. This is the one place a Compute-let hands a host code
  that is not WebAssembly; the host's own validation of WGSL is the
  boundary, as it is for web pages.

## Appendix F. Test vectors

The directory `vectors/` beside this document holds byte-level vectors.
They are normative, with this text: where the two disagree, one of them has
a defect, to be reported. The script that produced them is in
`tools/vectors/` and is not normative: it is not a reader, a writer or a
library, nothing may depend on it, and where it disagrees with this text or
the vectors, it is wrong. The kernel, when it exists, must reproduce every
vector on its own.

| File | Contents |
| --- | --- |
| `vectors/minimal.ufx` | a whole pack of 2599 bytes holding one commit: a universe object, a text reading "Hello, universe." with one paragraph span, a face, and the change that made them, with an index and a head |
| `vectors/history.ufx` | a pack of 27722 bytes holding three commits, built to exercise what the first does not (below) |
| `vectors/vectors.json` | every vector below, as hexadecimal |

`history.ufx` extends the first pack. Its second commit, by a model,
replaces a word in the text (a `splice` that removes eight elements and
inserts five), replaces a property (a `set` with `old`), adds an asset
whose bytes are a blob, a clock, and forty small objects, so that the
object map gains an interior node; one node frame and one chunk frame are
compressed, and one property is kept outside its node. A frame of unknown
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
| `object_maps` | root hashes of maps with 1, 32, 33 and 9 000 entries: a leaf, the largest leaf, the smallest interior node, and three levels |
| `minimal_pack` | every record of `minimal.ufx` with its offset and hash; the index; the head; the root hash. Removing its last byte leaves no valid head |
| `history_pack` | for each of the three commits: root hash, object-map root, number of objects, the text, its `seq`, and what its span resolves to; the blob; the seal with the exact bytes signed; four truncations of the file with the state each recovers to; ten anchors resolved at the last commit, on sequence and continuous axes, including a replaced word, a point at a removed element, clipping, and a dropped object |
| `resolve_sequence` | a sequence with removed elements, and nine regions resolved against it (§4.3) |
| `merge_readiness` | two writers diverging from one text, with insertions at the same place, inside their own earlier insertions and after an element the other removes; the order of elements and the text, identical whichever writer's operations are taken first (§1.10) |
| `resolve_continuous` | six regions resolved through a frame: shift, integer rounding of both signs, clipping, detachment, floats |
| `printer` | two printer operations on an empty module, the module bytes they produce, and the hash of each item with the exact bytes hashed |
| `instrumentation` | three stored modules and their instrumented forms under **M4**: an entry region, a loop region, and NaN canonicalization, each with the fuel it consumes |

Three values, for a first check without opening the files:

| | |
| --- | --- |
| Hash of the chunk `abc` | `1e18834c426d00e57788444cb3ccd62c771b420c095bb0c4e040a8c122c4570d` |
| Root hash of `minimal.ufx` | `804ec174f46f773d36c1fe7318c999ff21c338b735cb4e5068224725b9cce8bf` |
| Root hash of `history.ufx` | `d9c0eec863503cdd969209285e1f4db095654bc0f0f46d7bf445566c316727df` |

How far these have been checked: the WebAssembly vectors were validated and
run in one engine (Node.js) and behave as stated. The seal's signature was
verified there too, and the chunking table and the chunk boundaries of the
one-mebibyte stream were recomputed there from this text. The other
vectors, in their present form, have been produced by one script and not
yet reproduced by an independent implementation.
