# The Universal File Object (UFO) Specification

**Version 0.2 — draft for review. Nothing here is frozen. Nothing here has been implemented.**

This document specifies the UFO format: a single file that holds a universe of
described meaning, carries the small player that presents it, records where
every part of it came from, and can be extended by people and AI without loss.

It is written to be built from, and to stand alone: it depends on no other
document. It contains no code. Where it chooses a technology it gives the
reason, so the choice can be challenged. [CORE.md](CORE.md) states the whole
format in two pages; [RATIONALE.md](RATIONALE.md) explains why the format is
shaped as it is.

## 0. Reading this document

### 0.1 Conventions

The words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are used as in RFC 2119.
A sentence without one of these words is explanation, not requirement.

Every term is defined once, in **bold**, and listed in the glossary (§16).
Rules that a conformance suite must test carry a label such as **[C3]**.

*Reader* means any software that opens a UFO. *Writer* means any software that
changes one. *Person* means the human using a reader. *Agent* means software,
usually a language model, acting through the agent interface (§11.8). *Host*
means the platform a reader runs on: a browser, an operating system.

### 0.2 Status of each section

| Sections | Status in this draft |
| --- | --- |
| §1–§4 core, pack, anchors | Complete enough to implement; names and tag numbers provisional |
| §5–§7 vocabulary, player, host interface, faces | Complete in structure; layout and drawing semantics need a conformance corpus before freeze |
| §8–§11 profiles | Text, asset, derivation, Portal, Chronicle: complete. Compute-let, printer, ledger, summaries: complete in structure, operation tables provisional |
| §9.4 video and image envelopes | Outline |
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
   Chronicle. There is no way to alter a universe without extending it.
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
| **link** | the hash of a record (§1.3) |
| **ref** | the identity of an object in the same universe (§1.5) |
| **anchor** | a reference to a region of an object at a revision (§4) |
| **formula** | an expression that computes a value (§5.3) |

Values are encoded in CBOR (RFC 8949) using the core deterministic encoding
requirements of RFC 8949 §4.2.1, so that a value has exactly one encoding.
Link, ref, anchor and formula are CBOR tags 55460, 55461, 55462 and 55463
applied to a 32-byte string, a 16-byte string, a map and a list respectively.
These tag numbers are provisional until registered.

- **[C1]** A reader MUST reject as malformed any encoded value that is not in
  deterministic form, contains a non-finite float, an indefinite-length item,
  a duplicate map key, a non-text map key, an unknown tag, or nesting deeper
  than 64 levels.

*Reason.* CBOR is an Internet Standard with a defined canonical form, a
byte-string type and compact integers. A canonical text encoding would need
binary-to-text escapes and number-spelling rules, which are a well-known
source of disagreement between implementations. Models and people never read the encoding
directly; they read projections (§7.5).

### 1.3 Records

A **record** is an immutable byte string of one of two kinds:

- a **chunk**: raw bytes, at most 2²⁰ bytes;
- a **node**: one encoded value that is a map with a text entry `k` naming the
  kind of node.

The hash of a record is SHA-256 over one kind byte (`0x01` chunk, `0x02`
node) followed by the record's bytes. A record is identified only by its hash.

- **[C2]** A reader MUST verify the hash of every record before using its
  contents, and MUST treat a mismatch as malformed storage.
- **[C3]** A reader MUST preserve, when copying or rewriting a universe, every
  record reachable from a retained commit, whether or not it understands the
  record's node kind.

The node kinds the core defines are `blob`, `val`, `obj`, `map` and `commit`.

### 1.4 Blobs

A **blob** is an immutable byte stream of any length. It is stored as chunks
of exactly 2²⁰ bytes, except the last, which holds 1 to 2²⁰ bytes. A
zero-length blob has no chunks. The blob node is:

| Key | Value |
| --- | --- |
| `k` | `"blob"` |
| `len` | total length in bytes |
| `sha256` | SHA-256 of the whole stream |
| `chunks` | list of links |

If the stream has at most 1024 chunks, `chunks` lists them in order.
Otherwise `chunks` lists nodes of kind `blob` that each cover exactly
1024ⁿ chunks (the last may cover fewer), for the smallest *n* that keeps the
list at 1024 entries or fewer. The shape of a blob node is therefore a
function of its bytes alone, and identical streams have identical blob hashes
in every universe.

- **[C4]** To read bytes `[a, b)` a reader MUST load only the chunks that
  intersect the range, and MUST fail without returning bytes if a required
  chunk is missing, has the wrong length for its position, or fails its hash.
- **[C5]** A whole-stream read or export MUST also verify `sha256` and `len`.

A value that refers to a blob is a link to its blob node.

*Reason.* Fixed chunks make range lookup arithmetic. Fixing the chunk size in
the format, rather than per writer, is what makes a blob's hash independent
of who stored it, which deduplication, references between universes and
partial travel forms all depend on. Content-defined chunking would save space
when a large byte stream is edited in the middle, but native content is
description, not edited byte streams, and blobs are immutable originals.

**Out-of-line values.** Any value inside a node MAY be replaced by a link to a
node `{k: "val", v: value}`. A reader resolves such a link transparently.
Writers SHOULD move a value out of line when its encoding exceeds 4096 bytes,
so that changing a small property does not rewrite a large one.

A **salted value** is an out-of-line value whose node also carries `salt`: 16
random bytes. Its hash reveals nothing about a short or guessable value. The
format uses salted values wherever content may later be withheld from a copy
(§1.7, §9.3).

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
| `prev` | link to the previous revision; absent in revision 1 |
| `by` | identity of the change (§1.7) that produced this revision |
| `salt` | 16 random bytes, fresh for every revision |
| `p` | the properties |

The hash of this node is the **revision hash**. It names one exact state of
one object and, through `prev`, that object's whole history. Two copies of a
universe that diverge may each produce a revision 5 of the same object; the
revision hash, not the number, is what distinguishes them, and every
reference to a specific revision uses the hash. The salt ensures that the
hash of an earlier revision, which remains visible in `prev` when the
revision itself is withheld (§9.3), cannot be used to guess what it held.

An **edge** is a property whose value is, or contains, a ref. The property
name is the relation; the direction is from the object that owns the property
to the object named. The core defines no separate edge structure. Readers
MUST be able to answer "which objects refer to this one" (§7.5).

Type and property names are case-sensitive. Names beginning `ufo.` are
reserved for this specification. Other parties MUST use a reverse-DNS prefix
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
a leaf `{k: "map", e: [[id, link], …]}` sorted by identity if the set has 32
or fewer members, and otherwise an interior node `{k: "map", c: {…}}` whose
entries map the byte at position *d*, written as a two-digit lowercase
hexadecimal key, to the `map` node for that longer prefix. The object map is
therefore a function of its contents alone: the same set of revisions has the
same root hash however it was built.

A commit is the node:

| Key | Value |
| --- | --- |
| `k` | `"commit"` |
| `v` | format version, `1` |
| `parents` | list of links to parent commits; empty for the first commit |
| `objects` | link to the root of the object map |
| `change` | identity of the change this commit records |
| `height` | 0 for the first commit, otherwise 1 + the greatest parent height |

The hash of a commit is the **root hash** of the universe at that point. It
fixes every object, every byte and all history before it.

One object, the **universe object**, has the identity of sixteen zero bytes
and type `ufo.universe`. Its properties are:

| Property | Value |
| --- | --- |
| `lineage` | 16 random bytes fixed in the first commit; shared by every later state and every fork |
| `roots` | map from names to refs: the named entry points |
| `faces` | list of refs to face objects (§7.2) |
| `features` | map from feature name to `{v: integer, required: boolean}` |
| `summary` | ref to the top summary (§11.7), if any |
| `presenters` | map from a media type outside the baseline to the Compute-let that decodes assets of that type (§11.1, **M3**) |

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
| `ops` | list of operations, applied in order |
| `actor` | who committed the change (a principal, §10.1) and with what software |
| `time` | milliseconds since 1970-01-01T00:00:00Z, as the actor reported it |
| `origin` | where content introduced by this change came from (§8.5) |
| `evidence` | list of support links recorded by this change (§8.5) |
| `decisions` | list of decisions recorded by this change (§8.5) |
| `note` | a salted value: why the change was made, in the actor's words |

The **Chronicle** is the chain of commits and their changes, from the current
commit back to the first.

An **operation** states one edit against a named baseline. It has a *shape* —
which object, which property, where, how much — and *content*: what was
removed and what was put in its place. The shape is written in the operation.
The content is always a salted value (§1.4). This separation is what allows
a copy of a universe to keep the shape of its history, so that anchors and
authorship still verify, while withholding what earlier drafts said (§9.3).

The core operations are:

| `op` | Shape | Content | Effect |
| --- | --- | --- | --- |
| `new` | `obj`, `type` | — | creates an object with no properties |
| `set` | `obj`, `base`, `key` | `old`, `val` | sets property `key` to `val`; absent `val` removes it |
| `splice` | `obj`, `base`, `key`, `at`, `del`, `add` | `old`, `ins` | in the sequence at `key`, replaces the `del` items at position `at` (which are `old`) with the `add` items of `ins` |
| `remap` | `obj`, `base`, `axis`, `scale`, `shift` | — | declares that positions on a continuous axis moved (§4.3) |
| `drop` | `obj`, `base` | — | retires the object from the current state |

`base` is the revision hash the object had before this change (absent for an
object the same change created). `key` MAY be a list, naming a path through
nested maps.

A profile MAY define further operations, named with its prefix. An operation
is verified by the component that defines it: core operations by the kernel,
printer operations by the printer (§11.4).

The **laws of change** follow. They hold for every medium.

- **[L1] The bytes are the evidence.** A writer MUST compute operations from
  the actual content before and after, never from an account of what was
  changed.
- **[L2] Anchored.** Every operation on an existing object MUST carry `base`,
  and every `set` and `splice` MUST carry the exact `old` content.
- **[L3] Conservation.** Applying a change's operations, in order, to the
  parent commit's objects MUST produce exactly the commit's objects, compared
  as values with out-of-line values resolved, apart from the change object
  itself and the `rev`, `prev`, `by` and `salt` fields. A reader MUST be able
  to perform this check for any commit whose operation content is present
  (§7.5 `verify`), and MUST say so where it is not.
- **[L4] Refusal.** A writer MUST reject a change whole if any operation names
  a `base` that is not the object's current revision, an `old` that does not
  match the content found, counts that do not match the content, a range
  outside the sequence, ranges that overlap within one change, or an object
  that does not exist. Nothing is applied in part and nothing is repaired.
- **[L5] No silent reconstruction.** Origin is *witnessed* when the writer
  records it as the content is introduced. An origin established in any
  other way — by aligning text, by matching, by inference — MUST be recorded
  as *inferred*, with its method (§8.5). No component may record or present
  an inferred or unknown origin as witnessed, and a reader MUST NOT infer an
  origin the universe does not record.
- **[L6] Append-only.** A change object is never modified or dropped. A commit
  is never rewritten. History is only extended. A copy may withhold history
  (§9.3) or, by an explicit act, cut it at a declared boundary (§2.6); in
  both cases every hash that named the absent records remains.
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
| **inconsistent** | well-formed records break a law of change or a profile rule (a failed conservation check, a digest mismatch) | refuse to present or extend the affected state; offer the last consistent commit |
| **unavailable** | well-formed, but needs a feature, codec or record this reader does not have, including a record the sender withheld (§9.3) | preserve; present what can be presented; say what is missing and why |
| **unrecognized** | an object type, property, node kind or operation this reader does not interpret | preserve untouched; show an inspectable placeholder |

- **[C12]** Opening a universe executes nothing in it, changes no reader
  setting and writes nothing.
- **[C13]** A reader MUST enforce the limits of §3.1 by its own
  configuration, never by values read from the file.

The format version is the `v` of the commit. A reader MUST refuse to write a
universe whose version it does not implement and MAY read one in a degraded,
clearly labeled mode.

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
frame     = kind (1 byte)  codec (1 byte)  length (unsigned LEB128)  payload
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
`1` the payload begins with the decoded length as an unsigned LEB128,
followed by the compressed bytes. The hash of a record is always taken over
its decoded bytes. Only chunk and node frames may be compressed. Other
codecs are features (§1.6).

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

A pack changes only by appending. To commit, a writer appends the new
records, optionally an index frame, and then a **head** frame, and makes the
file durable before reporting success. The head frame's payload is exactly
64 bytes:

| Bytes | Field |
| --- | --- |
| 32 | hash of the commit this head marks |
| 8 | offset of the latest index frame, or 0 |
| 8 | offset of the previous head frame, or 0 |
| 8 | length of the pack up to and including this frame |
| 8 | check: the first 8 bytes of the SHA-256 of the preceding 56 bytes |

A head frame is 67 bytes in all and is the last frame of a pack.

- **[P3]** A head is **valid** if its check matches, its length field equals
  the offset just past it, and the commit record it names is present and
  passes its hash.
- **[P4]** A writer MUST NOT modify any byte before the last valid head,
  except through compaction (§2.6).
- **[P5]** A pack has at most one writer at a time. A writer MUST hold an
  exclusive lock supplied by the host for the duration of a commit.

There are no companion files: no journal, no lock file, no sidecar.

### 2.3 Recovery

A reader finds the current state as follows.

1. Read the final 67 bytes. If they are a valid head whose length field
   equals the file's length, that is the current state.
2. Otherwise, scan frames from the signature forward. A frame is
   well-formed if its kind, codec and length parse and its payload lies
   within the file. Stop at the first frame that is not. The current state
   is the last valid head met. Bytes after that head are an interrupted
   write: a reader ignores them and reports that it did so; the next writer
   truncates the file to the end of that head before appending.
3. If no valid head is found, the file holds no universe and is malformed.

- **[P6] Always whole.** After a write interrupted at any byte, a reader
  following these steps MUST arrive at the state of the last completed
  commit, with every record of that state intact. Step 2 costs a pass over
  the file and happens only after an interruption.

The previous-head offsets let a reader list every committed state from the
newest back without scanning.

### 2.4 The index

An **index** frame lets a reader find a record by hash without scanning. Its
payload is:

| Bytes | Field |
| --- | --- |
| 4 | count *n* of entries |
| 8 | offset of the previous index frame, or 0 |
| 40 × *n* | entries, each a 32-byte hash and an 8-byte offset, in ascending order of hash |

An index covers the chunk and node frames appended since the previous index,
or more: a writer appending an index MUST merge into it every immediately
preceding index that covers no more than twice as many records, so that the
chain of indexes stays logarithmic in the number of records. A lookup
searches each index in the chain, newest first, by binary search.

- **[P7]** The index is derived and carries no authority. A reader MAY ignore
  it and MUST be able to rebuild it by scanning frames. Because every record
  is verified by hash when read (**C2**), a wrong index can cause a lookup to
  fail and trigger a rebuild; it cannot cause wrong content to be accepted.
- **[P8]** With a correct index, reading any one record costs a number of
  seeks logarithmic in the number of records, and never a scan.

### 2.5 What a pack may lack

A pack is **whole** if it holds every record reachable from its head commit,
other than those of linked universes (§1.8). A working form is whole unless
the person has cut its history (§2.6).

A pack that deliberately lacks records carries a `note` frame, a map with
any of:

| Key | Meaning |
| --- | --- |
| `history` | `true`: working history was withheld by the sender (§9.3) |
| `boundary` | list of commit hashes whose ancestors were cut (§2.6) |
| `blobs` | list of `{blob, len, hints}`: blobs whose chunks are absent, each with its blob hash, length and zero or more locations where the chunks may be found |

Blob nodes themselves are never omitted, so a reader always knows the size,
hash and structure of a blob it lacks.

- **[P9]** A reader meeting a missing record that a `note` accounts for MUST
  classify it as unavailable and say which kind of lack it is. A missing
  record that no `note` accounts for is malformed storage.
- **[P10]** A reader MUST present everything that is present, MUST show for
  each absent blob an inspectable placeholder at the authored size (or a
  carried face, §7.1, if one is present), and MUST verify by hash anything
  it later obtains.

### 2.6 Compaction

**Compaction** writes a new pack containing the records reachable from a
chosen set of commits, with a single index, and replaces the old file
atomically. It is always an explicit act of the person, and it is the only
way space is reclaimed.

- **[P11] Every hash survives.** Compaction copies records. It MUST NOT
  change the decoded bytes of any record it keeps; it MAY change a frame's
  codec. Every kept record therefore has the hash it had, the root hash is
  unchanged, and every seal remains valid. A writer MUST confirm, before
  replacing the old file, that the new pack's head names the same commit and
  that every record reachable from it is present and passes its hash.

Compaction MAY cut history: the new pack keeps commits back to chosen
boundary commits and records them under `boundary` in its `note`. The kept
commits still name their parents by hash, so the chain remains verifiable
to the boundary; what lay beyond is declared gone, not silently missing.

---

## 3. Durability and hostile input

A general-purpose database would have supplied crash safety, indexed reads,
resource limits and long field testing. The pack must supply the same
assurances itself. §2 gives crash safety (**P6**) and indexed reads
(**P8**). This section gives the rest.

### 3.1 Limits

A reader MUST enforce each of these and MUST classify anything exceeding one
as malformed. A writer MUST NOT produce anything exceeding one.

| Quantity | Limit |
| --- | --- |
| Chunk record | 2²⁰ bytes |
| Node record, decoded | 16 MiB |
| Seal or note payload | 1 MiB |
| Index payload | 64 MiB |
| Payload of a frame of unknown kind | skipped unread; any length within the file |
| Nesting depth of a value | 64 |
| Entries in one map or list | 2²⁰ |
| Depth of the object map | 16 |
| Depth of a blob's chunk tree | 4 |
| Indexes in a chain | 64 |
| Parents of a commit | 16 |

A reader MUST also bound, by its own configuration: nesting depth of
universes being presented (default 8), running Compute-lets (default 16),
active media decoders (default 8), fuel per Compute-let per call (§11.2),
and formula evaluation steps per composition (§5.3).

### 3.2 Hostile files

- **[P12]** A reader MUST treat every length, offset and count in a pack as
  untrusted, and check it against the file's length and the limits of §3.1
  before allocating memory or seeking.
- **[P13]** A decoder for codec `1` MUST refuse a declared length over the
  limit for the frame's kind, MUST stop when its output reaches the declared
  length, and MUST classify a frame whose output differs from the declared
  length as malformed.
- **[P14]** A pack contains no executable schema, stored query, trigger or
  instruction to the reader. Parsing a pack performs no action other than
  reading bytes and computing hashes.
- **[P15] Total parsing.** For every possible input, the pack parser and the
  value decoder MUST terminate with a classification of §1.9. They never
  crash, never loop without consuming input, and never allocate more than a
  fixed amount beyond the limits of §3.1.
- **[P16] Fuzzing.** The reference pack parser and value decoder MUST be
  tested by coverage-guided fuzzing before every release: at least 10⁹
  executions since the last change to either, with no crash, no input taking
  over one second, and no allocation beyond **P15**. Every input that ever
  caused a failure is kept in the conformance corpus.

### 3.3 Small enough to rewrite

The pack's claim to archival durability is not a long history. It is that
it can be re-implemented from this page by one person in a weekend, in any
language, decades from now, with no other software.

| Measure | Limit |
| --- | --- |
| Pack reading, writing, recovery, index and compaction, in the kernel | 800 lines |
| Value decoder and encoder, in the kernel | 400 lines |
| An independent, read-only pack reader that lists, verifies and extracts records | 500 lines in a general-purpose language |

- **[P17] The weekend test.** §1.1–§1.6, §2 and §3 MUST be sufficient to
  write that independent reader. The test is run for real before the format
  is frozen: someone with no other knowledge of the project is given only
  those sections and the conformance packs, and the result must pass every
  read-only pack test. If it takes more than two days, §2 is simplified.

### 3.4 Derived stores

- **[P18]** A reader MAY build, on its own device, any derived store it finds
  useful — a search index, a cache, a database such as SQLite. Such a store
  is disposable: it is built from the pack, can be deleted without loss, is
  never exchanged, is never the working or travel form, and is never
  consulted in preference to the pack when the two disagree.

### 3.5 Why a pack and not an embedded database

1. **The player must be small.** Every travel-form file carries what reads
   its storage. A general database engine compiled to WebAssembly weighs
   several hundred kilobytes; the pack reader is a few hundred lines inside
   the kernel.
2. **Integrity is native.** Every record is verified by hash, and the state
   is one root hash that a signature can cover. A database file has no
   canonical byte form, so a second integrity scheme would be needed above
   it.
3. **The data is append-only already.** Blobs are immutable, revisions are
   immutable, history is never rewritten. In-place update of mutable pages,
   which is what a database adds, is the one thing the model does not use.
4. **One format in both forms.** The travel form carries the same pack bytes
   the working form holds. Conversion is a copy, checked by comparing one
   hash.
5. **Sets of hashed records compose.** Sending only what a receiver lacks,
   withholding history, merging divergent copies and fetching large media by
   content address are all operations on such sets.
6. **The attack surface is this page** rather than a query engine.

What is given up is decades of field hardening and a ubiquitous inspection
tool. §3.1–§3.3 are the reply to the first; the reference reader, which
travels in every web envelope, is the reply to the second.

---

## 4. Anchors, coordinate spaces and time

### 4.1 Anchors

An **anchor** refers to a region inside an object, at a revision. It is a map:

| Key | Value | Presence |
| --- | --- | --- |
| `o` | object identity | required |
| `r` | revision hash the region is expressed against | required |
| `a` | map from axis name to region on that axis | absent means the whole object |
| `u` | commit hash of another universe (§1.8) | absent means this universe |
| `d` | digest of the anchored content (§4.4) | present makes the anchor a **pin** |

Everything that attaches one thing to another uses an anchor: a Portal's
placement, an attribution, a citation, a comment, a transclusion, the sources
of a derivation, the scope of a summary, the resource of a permission.

### 4.2 Axes

A **coordinate space** is the set of named **axes** an object offers. Each
axis is one of three kinds. The core defines the kinds; a profile only
declares which axes its objects have.

| Kind | Positions | A region is | Examples |
| --- | --- | --- | --- |
| **sequence** | integers 0…n between the items of an ordered sequence | `[start, end]`, start ≤ end | characters of a text, items of a list, instructions of a function |
| **continuous** | numbers along a measured extent | `[low, high]`, low ≤ high | time, width, height, depth |
| **keyed** | stable keys | a list of keys | rows and columns of a table, children of a group, functions of a module |

A region over several axes is their product: a rectangle of a frame for a
span of time is a region on `t`, `x` and `y`.

Time on a continuous axis is an integer count of **flicks**: units of
1/705 600 000 of a second. Every common frame rate and audio sample rate
divides one second into a whole number of flicks, so time arithmetic is exact
and identical on every host. Lengths on spatial axes are floats in the
object's own units, whose extent the object declares.

### 4.3 How anchors survive edits

To use an anchor made against revision *A* at a later revision *B* of the
same object, a reader **carries** it: it takes, in commit order, the
operations on that object from the one whose `base` is *A* onward, and
applies the shape of each (§1.7):

- **Sequence axis.** For a `splice` at position *p* replacing *m* items with
  *n*: a position less than or equal to *p* is unchanged; a position greater
  than or equal to *p + m* moves by *n − m*; a position inside the replaced
  items moves to *p* if it is a region's end and to *p + n* if it is a
  region's start, after which a start greater than its end is set equal to
  the end. A region never grows to include content inserted at its edges.
- **Continuous axis.** For a `remap` with `scale` *s* and `shift` *t*, every
  position *x* becomes *s·x + t*. Trimming the start of a recording by five
  seconds is a remap with scale 1 and a shift of minus five seconds; resizing
  is a remap with the scale factor. A region carried partly outside the
  axis's extent is clipped to it.
- **Keyed axis.** A key is unchanged for as long as it exists. A region loses
  the keys that have been removed.

- **[A1]** A region that becomes empty on any axis is **detached**. A reader
  MUST report a detached anchor as detached, with the last revision at which
  it was attached, and MUST NOT move it to similar-looking content.
- **[A2]** If *B* does not descend from *A*, or the changes between them are
  absent, the anchor is **unresolved** at *B*. A reader MUST NOT resolve it
  by matching content. Carrying needs only the shapes of operations, so it
  works where the content of history has been withheld (§9.3).
- **[A3]** Carrying is deterministic: two readers carrying the same anchor
  across the same revisions MUST obtain the same region.

These three rules are the whole of anchor survival for every medium. Text
uses the first, time and space the second, tables and structure the third.

### 4.4 Pins and staleness

The **digest** of a region is the hash of the canonical encoding of the
content it covers: for a sequence, the list of covered items (for text, the
covered characters as one text value); for the whole object, the revision
hash itself; for any other region, the revision hash unless the object's
profile defines a narrower rule.

A **pin** is an anchor that records the digest its region had when the pin
was made. A pin is **current** if, carried to the object's current revision,
its region is attached and has the same digest. Otherwise it is **stale**.

This one test is how every derived thing in a universe knows whether it still
reflects its sources (§8.3).

### 4.5 Clocks

A **clock** maps a parent's time to a child's time:

```
child time = (parent time − start) × rate + offset      while start ≤ parent time < end
```

`start`, `end` and `offset` are in flicks; `rate` is a rational number given
as two integers. Outside its interval the clock's content is not present.

A clock is in one of three modes:

| Mode | Child time is driven by |
| --- | --- |
| `locked` | the parent, by the formula above; pausing or scrubbing the parent pauses or scrubs the child |
| `free` | the child's own running time, started when the parent enters the interval; the parent's pause still pauses it |
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
| **Group** | `ufo.group` | an ordered composition of children under a layout rule | `children` (keyed), `order` (sequence) |
| **Clock** | `ufo.clock` | a time mapping and interval (§4.5), holding children | `t`; `children` (keyed) |
| **Portal** | `ufo.portal` | a reference to another object, presented through its own description (§8.4) | those of its parent |
| **Surface** | `ufo.surface` | a region whose content a Compute-let produces live (§11.1) | `x`, `y`, `t`, plus any the Compute-let declares |
| **Data** | `ufo.data` | typed values and tables | `rows`, `cols` (keyed); `order` (sequence) |
| **Formula** | a value | a pure expression computing a value from data, time, input and other values (§5.3) | — |

Every primitive object MAY carry `label` (text, the accessible name), `role`
(text, a semantic hint such as `heading`, `figure`, `button`) and `lang`.
Every property of a primitive MAY be a formula.

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
| reference | `get` (a property of an object, by ref and key path), `cell` (a table cell by row and column key), `col` (a column as a list), `arg` (a named value supplied by the enclosing `each`) |
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
  evaluates to an error value, as does one that exceeds the reader's
  evaluation budget.
- **[F3] Deterministic.** Arithmetic is IEEE 754 binary64. Because every
  reader runs the same compiled kernel (§6.1), every operator, including the
  transcendental ones, gives bit-identical results everywhere.
- **[F4]** An error value propagates through operators and presents as a
  visible, inspectable marker. It never presents as a plausible number.

**Repetition.** A group MAY carry `each`: a formula yielding a list or a ref
to a data object, and `as`, a name. Its single child is then a template,
presented once per item with `arg` bound. This is how a table becomes rows
of text, and a dataset becomes the bars of a chart.

**Presentation state** is a small map of named values held by the reader for
one presentation: a sort column, a selected tab, a scroll position, a slider.
Primitives declare which input sets which state (`on`, Appendix A). It is not
part of the universe and changing it changes no byte. An action that edits
the universe is a change (§1.7), made through the onboard tools.

### 5.4 The deletion test

- **[V3]** A primitive, a layout rule, a formula operator, a host interface
  function or a kernel feature may be added to this specification only with
  a written demonstration that it cannot be expressed as data, as a formula,
  or as a composition of what exists, and with the budgets of §12 restated.

The test applied to this draft:

| Candidate | Outcome | Why |
| --- | --- | --- |
| Constraint layout | deleted | `absolute` with formulas over sibling and parent sizes expresses constraints, acyclic by **F2** |
| Stack layout | deleted | a one-row or one-column `grid`; back-to-front stacking is `absolute` |
| Paragraph, heading, list item | deleted | block spans of a text (§8.1), differing only in properties |
| Page | deleted | a region of fixed size holding a group |
| Slide | deleted | a region under a clock |
| Chart | deleted | data, formulas and paths under `each` |
| Table view | deleted | a `grid` group under `each` over a data object |
| Timeline, canvas | deleted | clocks holding children; a region with `absolute` children |
| Scene graph, camera, mesh, material | deleted from the format | data that a surface's Compute-let reads and draws (§5.5) |
| Edge | deleted | a property holding a ref (§1.5) |
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

**Three dimensions, explicitly.** A 3D scene uses nothing beyond what this
document already defines. Its description is an ordinary `ufo.data` object:
rows for nodes, meshes, materials, lights and cameras, with geometry in
assets. It is presented by an ordinary `ufo.surface` whose Compute-let reads
that data through the `objects` capability and draws through the `gpu`
capability. The format has no 3D object type, no third spatial axis on
regions, no 3D operation, no 3D display-list item and no scene profile.
Anchors to parts of a scene are anchors to rows of its data object, on a
keyed axis; anchors to places in the rendered view use axes the Compute-let
declares in its manifest (§11.1). Without `gpu`, the surface shows its
poster (**H2**). Which conventions a scene's rows follow is a matter between
the data and the presenter that reads it, both of which travel in the
universe; a second presenter may read the same rows or others.

---

## 6. The player

### 6.1 Four parts

Every UFO is presented by a **player** of exactly four parts.

1. The **kernel**: one program, compiled once to WebAssembly, that reads the
   pack, verifies records, resolves refs and anchors, checks and applies
   changes, evaluates formulas, performs layout and composes a display list.
   It knows the core and the primitives. It knows no medium, application or
   foreign format.
2. The **presenters**: components that turn display-list items into output.
   The four base presenters — text, path, raster, samples — are part of every
   reader and are the only presenters a reader has built in. Anything else
   that draws is a Compute-let attached to a surface (§11.1), carried in the
   universe that needs it.
3. The **binding**: the host-specific code that connects the kernel to a
   host: bytes in and out, a place to draw, input events, time, randomness,
   and the declared capabilities. It is the only part that differs by host.
4. The **universe**: the description. Everything that makes one UFO differ
   from another is here, as data.

- **[K1] One implementation.** The kernel and each presenter exist as one
  compiled WebAssembly artifact each, identified by hash, run unchanged by
  every reader: in a browser, in the installed web app, in native readers, in
  the command-line reader and behind the agent interface. A reader MUST NOT
  contain a second implementation of any kernel function in any language.
- **[K2] No domain knowledge outside the kernel.** The binding and any native
  shell MUST NOT parse the pack beyond locating it, and MUST NOT contain
  logic specific to any object type, profile, medium or foreign format.
- **[K3] Carried by content.** A reader that already holds a component with
  the same hash MUST be free to use its own copy.
- **[K4] Pay for what you use.** A universe carries only the presenters and
  components its content requires. A universe with no Compute-let carries no
  printer; one with no mesh carries no mesh presenter.

The kernel is itself a sandboxed component: it has no authority over the
host except through the host interface.

### 6.2 Composition and the display list

To present, the kernel **composes**: given a face (§7), an available size,
the root clock's time and the presentation state, it produces a **display
list**. The display list is the only thing presenters and bindings consume.
Its items are:

| Item | Content |
| --- | --- |
| `push` / `pop` | enter and leave a coordinate space: transform, clip, opacity |
| `text` | a run of characters, a style, a position, an available width |
| `path` | geometry, fill, stroke |
| `raster` | a source (blob, or surface output) with a source rectangle, a destination rectangle and, for video, a time |
| `samples` | a source, a start time on the root clock, a rate, a gain |
| `surface` | a rectangle handed to a running Compute-let |
| `hit` | a rectangle or path that, when it receives input, sets presentation state or delivers input to a surface |

Each item carries the anchor of the description it came from, so that
anything on screen can be traced to its object, and from there to its
origin (§7.5 `why`). Each MAY carry a label and role, from which the binding
builds the host's accessibility tree.

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
| `call(handle, operation, in, out) → status` | use a capability |
| `log(message)` | emit a diagnostic the reader may show; has no other effect |

The reader calls two functions the component exports: `frame(time)`, once
per presented frame, and `message(port)`, when a message arrives.

A **capability** is a named, granted authority. Everything beyond the base
functions is a capability:

| Capability | Gives | Held by default by |
| --- | --- | --- |
| `store` | read and append pack bytes; the host's exclusive lock | the kernel only |
| `text` | measure and break text for a given style and width | the kernel only |
| `media` | decode a baseline asset (§6.5) to pixels or samples at a time | the kernel only |
| `codec.<name>` | decode or encode a named storage codec | the kernel only |
| `verify` | check an Ed25519 signature | the kernel only |
| `objects` | read, or propose changes to, objects within a stated anchor | nobody |
| `gpu` | accelerated graphics on the component's surface | nobody |
| `audio` | a low-latency stream of generated samples | nobody |
| `input.raw` | high-frequency pointer, gamepad and device input | nobody |
| `time.precise` | sub-frame timing | nobody |
| `net` | requests to stated origins | nobody |
| `camera`, `microphone` | device capture | nobody |
| `files` | a file the person picks, or a place the person picks to save | nobody |
| `encode.<format>` | encode pixels, samples or pages to a standard format (§7.4) | the kernel, on export |

- **[H1]** A component obtains a capability only if its manifest requests it
  (§11.1), the person has granted it (§10.3), and the host offers it.
- **[H2] Degradation.** `capability` returns one of *granted*, *denied* or
  *absent*. A manifest marks each request `required` or `optional`. If a
  required capability is denied or absent, the reader MUST NOT start the
  component and MUST show, in its place and at its authored size, its carried
  face if it has one (§7.1), or an inspectable placeholder, with a plain
  statement of what is missing. If an optional capability is denied or
  absent, the component runs without it.
- **[H3]** A component holding a capability MAY pass a narrower one to a
  component it presents, never a broader one. The kernel is the first holder
  and narrows everything it passes on.
- **[H4]** New capabilities are added to this specification by name, under
  the deletion test (**V3**). Adding one never changes the base functions. A
  capability is something only a host can provide; anything that can be
  computed inside the sandbox is a Compute-let, not a capability.
- **[H5]** There is no other extension mechanism. Readers have no plugins,
  no registered handlers and no per-type code paths.

The interface is specified as plain WebAssembly imports under the module
name `ufo:host/1`, with arguments passed as offsets and lengths in the
component's memory and structured arguments encoded as values (§1.2). It is
designed so that it can also be stated in the WebAssembly component model
when that is uniformly available.

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
  `encode` capabilities, or through an encoder Compute-let fetched or carried
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

---

## 7. Faces

### 7.1 Three ways a face appears

A **face** is a presentation of a universe, or of an object in it. Every
face is produced in one of three ways, and a reader MUST show the person
which.

| Kind | Produced | Stored | Adds information |
| --- | --- | --- | --- |
| **sampled** | by the kernel composing authored description, on demand | no | no |
| **carried** | once, as a **rendition**: an asset derived from the description and kept beside it | yes | no |
| **transmuted** | by AI, as a **transmutation**: new described objects derived from others | yes, as objects | yes |

A transmuted face is itself description, so it is then sampled like any
other; what marks it is its origin. The classification is derived, not
declared: a face is *carried* if what it presents is an asset with a
derivation (§8.3); *transmuted* if what it presents is described objects
with a derivation whose origin is a model (§8.5); otherwise *sampled*.

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
| `of` | ref to the object presented |
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
tab-separated lines; for anything else, its label.

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

A text object (`ufo.text`) holds characters, their structure and their
attribution.

| Property | Value |
| --- | --- |
| `chars` | the content: one text value |
| `digest` | SHA-256 of the UTF-8 encoding of `chars` |
| `runs` | list of `[count, change, offset]` covering the content exactly, in order |
| `spans` | map from span key to span |
| `syntax` | absent for native text; otherwise the media type of a foreign syntax the characters are written in |

The `chars` axis is a sequence whose items are Unicode scalar values. A
position is a count of scalar values from the start.

*Reason for scalar values.* They are independent of any encoding and can
never split a character. Offsets in UTF-8 bytes or UTF-16 code units convert
to and from them deterministically.

A long work is several texts in a `flow` group — chapters, sections — not
one very large text. Writers SHOULD keep a single text under 1 MiB.

**Runs** record, for every character, the change that introduced it and its
offset within the characters that change inserted into this object. That
pair is the character's permanent identity: it does not alter when text
around it is edited. Adjacent runs that continue one another are merged.

A **span** marks a region of the characters:

| Field | Value |
| --- | --- |
| `at` | `[start, end]` on `chars` |
| `kind` | `block` or `inline` |
| `role` | semantic role: `paragraph`, `heading`, `item`, `quote`, `code`, `emphasis`, `strong`, `link`, `embed`, `marker`, or a prefixed name |
| other fields | properties: `level`, style properties (Appendix A), `href` (an anchor), `child` (a ref) |

Block spans do not partially overlap one another: any two are disjoint or
nested. A `marker` span covers characters that are part of a foreign syntax
and are not presented. An `embed` span covers exactly one U+FFFC OBJECT
REPLACEMENT CHARACTER and names, in `child`, the object presented at that
position — normally a Portal.

When characters are spliced, the writer carries every span's `at` by the
sequence rule of §4.3, in the same change. A span whose region becomes empty
is removed unless it is a block span.

- **[X1]** A reader MUST verify `digest` against `chars`, and that `runs`
  cover the content exactly, before presenting or editing a text. On failure
  the text is inconsistent (§1.9): it is not presented, edited or saved as
  though it were the document.
- **[X2]** A `splice` on `chars` gives every inserted character a run naming
  the change that contains the splice. No other operation alters runs,
  except to remove the runs of deleted characters.
- **[X3]** The kernel never parses a syntax. A text with a `syntax` is
  presented through its spans. If it has none, it is presented as its literal
  characters.

A writer that keeps a marked-up source authoritative — Markdown, for
example — stores the source as `chars`, declares `syntax`, and writes the
spans its own parser derives, including `marker` spans over the markup. Every
reader then presents the document richly without knowing the syntax, and the
writer's source remains exact. A writer converting a foreign document to
native text instead writes clean characters and spans, with no `syntax`.

### 8.2 Assets

An asset (`ufo.asset`) preserves a file's exact bytes.

| Property | Value |
| --- | --- |
| `bytes` | link to a blob |
| `media` | media type, determined from the content first and the name second |
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
- A **transmutation** is a set of objects with derivations whose origin is a
  model: a deck from a report, a narration from a document.
- Summaries (§11.7), the spans derived from a foreign syntax (§8.1), and
  native description converted from a foreign document (§6.4) are
  derivations too.

- **[D1]** A derivation is **stale** if any of its pins is stale, and current
  otherwise. Readers MUST compute this; it is never stored.
- **[D2]** A derived object is never treated as independent of its sources:
  a reader showing it MUST be able to lead the person to each source region.
- **[D3]** Regenerating a derivation is a change that writes new revisions
  with new pins. The earlier revisions remain in history.

### 8.4 Portals

A **Portal** (`ufo.portal`) is a region in a parent that presents one other
object. Each Portal is an **occurrence**: an object in its own right, with
its own identity, distinct from what it presents.

| Property | Value |
| --- | --- |
| `of` | what is presented: a ref, or an anchor — to a region of an object, to a fixed revision, or to an object in another universe (§1.8) |
| `face` | preferred face of the target: a ref to a face object or a `medium` hint; absent lets the reader choose |
| `place` | how it sits in the parent: `inline`, `block`, `float-start`, `float-end` (in a flow); by `x`, `y`, order (in an `absolute` group); by cell (in a `grid`) |
| `w`, `h` | authored size |
| `align`, `fit`, `crop` | alignment in the available space; `contain`, `cover`, `fill` or `none`; fractions cut from each edge |
| `playback` | map: `controls`, `autoplay`, `loop`, `muted` |
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
  Portal's identity and revision as its `base`. If the Portal no longer
  exists or has changed target when the import completes, **L4** refuses the
  binding; the imported asset remains in the universe, unreferenced.
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

**Transclusion** is a Portal whose `of` is a pin to a region of another
object, in this universe or another. The presented content remains what its
own Chronicle says it is: `why` on any part of it answers from the source's
history. Because the pin fixes a revision, the source cannot change beneath
the Portal; a later revision is offered as an update (**C9**).

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
`copied`. The origin of that content is then the origin of the region named,
found by following the anchor, in this universe or another, as far as it
leads. The copy is an action; it creates no new origin and erases none.
`basis` describes the copy itself: witnessed if the writer performed it,
inferred if it was detected afterward. The change holds the copied content
like any other, so the universe is whole even if the source is never seen
again; if the source is at hand, a reader MUST check that the two match.

- **[R1]** Origin is fixed when content is introduced and is never changed by
  any later change, including acceptance, editing nearby, moving or copying.
- **[R2] Three states, visibly.** A reader MUST present witnessed, inferred
  and unknown origins so that each is distinguishable at a glance from the
  others, in every place it presents origin, including projections for
  agents. Inferred is never shown as witnessed. Unknown is never shown as
  written by a person. For an inferred origin the reader MUST make the
  method and confidence available.

A witnessed origin is still a statement by the change's actor. Whether to
believe the actor is the business of seals (§10.2).

**Evidence** — what supports content. An entry in a change's `evidence`:

| Field | Value |
| --- | --- |
| `claim` | anchor to the content supported |
| `support` | pin to the supporting content: a region of a source, a dataset, a test, another universe |
| `kind` | `cites`, `quotes`, `computed-from`, `tested-by`, `exercised-by`, `consulted`, or a prefixed name |
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
| `verdict` | `accept`, `reject`, `revise`, `approve`, `retract`, or a prefixed name |
| `who` | the principal who decided |
| `note` | text |

- **[R6]** A decision changes no origin and certifies no accuracy. Accepted
  content from a model remains content from a model.
- **[R7]** The current decision about content is the latest decision in the
  Chronicle whose `about`, carried forward, covers it. Earlier decisions
  remain.

**Attribution** is the answer to "where did this come from", and it is read,
never reconstructed (**L5**). For a region of text, `why` returns, for each
run in the region: the change, its origin with its basis, any chain of
copies, the evidence
whose `claim` covers the run and the current decision. For any other
property, it returns the same for the change named by `by` in the revision
that last set it. For a unit of machine code, see §11.5.

---

## 9. Forms of the file

### 9.1 The working form

The **working form** is a whole pack (§2.5) in a file by itself. Its file
name ends `.ufo` and its media type is `application/vnd.ufo` (both
provisional, not yet registered). Native readers and agents work on this
form. It is the person's own copy and holds everything.

### 9.2 The travel form

The **travel form** is an **envelope**: a file that is valid in a common
format, shows an outer face to software that knows nothing of UFO, and
carries a pack and the player. The default envelope is a web page. Its file
name ends `.ufo.html`.

The web envelope is a conforming HTML document (WHATWG HTML Living Standard),
encoded in UTF-8, containing in this order:

1. The doctype, then a comment — the **plain-text head** — giving in plain
   words the title, the fact that this is a UFO, the date of export, and one
   sentence on how to open it.
2. A `head` with the title, and a content security policy that permits only
   the envelope's own scripts, identified by hash, and WebAssembly
   compilation, and forbids all network access.
3. A **static face**: the plain-text face (§7.3) of the primary face, as
   ordinary HTML text, up to a size the exporter chooses, followed by a
   plain explanation of how to open the file with scripts enabled. This is
   what a script-disabled previewer shows. The binding hides it once the
   player is running.
4. The pack, as the text of a `script` element of type
   `application/vnd.ufo;base64`: standard base64 (RFC 4648 §4), padded, with
   no line breaks.
5. The kernel, compressed with DEFLATE and then base64-encoded, as the text
   of a `script` element of type `application/wasm;deflate;base64`, labeled
   with the hash of the uncompressed component.
6. The binding, as a module script.

Presenters and other components beyond the kernel are records in the pack.

- **[E1] Read-back.** The binding reads the pack from the document it is
  running in, as text, and gives the kernel bytes on request by decoding the
  base64 quantum that holds them. The file is never fetched and the universe
  is stored once.
- **[E2] Lossless.** Decoding item 4 yields the pack byte for byte.
  Converting between the working form and the travel form therefore
  preserves the root hash, and a reader MUST check that it does.
- **[E3] Valid.** A web envelope MUST be a conforming HTML document with no
  parse errors. No envelope of any kind may depend on error recovery, a
  parser flaw or undefined behavior.
- **[E4] Self-sufficient.** A web envelope requires nothing but a browser:
  no network, no installation, no account.
- **[E5] Saving.** From a web envelope, saving produces a new travel-form
  file, containing the extended pack, which the person downloads or shares.
  Where the host offers the `files` capability, the reader MAY write the
  file the person chooses instead.
- **[E6]** When a reader opens a web envelope as a file, rather than as a
  page, it reads the pack in place by range, mapping byte offsets to base64
  offsets arithmetically, and runs its own kernel if that has the same or a
  later version than the one embedded.

*The cost of base64* is one third more bytes for the pack. It is accepted
because there is no way to place arbitrary bytes in a conforming HTML
document, a page opened from local disk cannot read its own file, and the
alternative — a second, readable copy — would store the universe twice.
Records are compressed individually before encoding (§2.1), so described
content is usually smaller in the envelope than raw.

*One foreign format, not two.* A file that is at once a web page and an
archive is sometimes proposed, on the grounds that browsers read from the
front and archive tools find their directory at the end. It cannot be done
validly. Bytes after the end of a page are still part of the HTML document,
and an archive's binary structures there are parse errors; the page would
display only through error recovery, which **E3** forbids. A web envelope is
a web page and nothing else.

### 9.3 Leaving a reader

- **[E7] Default distribution rule.** Whatever leaves a reader — sent,
  shared, exported, downloaded, copied out — leaves in the travel form,
  unless the person deliberately chooses the working form.
- **[E8]** A travel form carries the newest kernel and binding the exporting
  reader holds.

**What travels.** A universe has three layers, defined by reachability.

| Layer | What it is | Travels |
| --- | --- | --- |
| **Content** | the current revision of every **live** object — one reachable from the universe object by refs, links and anchors, without passing through a change — and the blobs those revisions name | always |
| **Attribution** | for every change that touched a live object, or records evidence or a decision about one: its actor, time, origin, evidence, decisions and the shapes of its operations (§1.7); the objects its evidence names as support; every commit node; every seal | by default |
| **Working history** | everything else: the content of operations (what was removed, inserted or set, and each change's note); earlier revisions; earlier object maps; prompts and conversations; objects that are no longer live, and changes that touched only those; earlier Compute-let snapshots | only if the person opts in |

- **[E9]** By default a travel form holds content and attribution and
  withholds working history. Its `note` frame says so (§2.5).
- **[E10] Stubs.** Withholding removes records and nothing else. Every hash
  that names a withheld record stays where it was: in `prev`, in commits, in
  operations, in `origin.prompt`. The recipient's reader can therefore
  verify the whole commit chain, every seal, and the place of every present
  object and change in the head commit; can carry every anchor (**A2**); and
  can answer `why` for all content present. It cannot run the conservation
  check on changes whose content is withheld, and says so (**L3**).
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

*What attribution reveals.* Names, times, model identifiers, and how many
edits of what size were made to each object. It does not reveal what any
earlier draft said: operation content and earlier revisions are named only
by hashes of salted records (§1.4, §1.5). The hash of a withheld blob does
reveal, to someone who already holds the same file, that it was once here.

### 9.4 Other envelopes (outline)

An envelope shows one outer face and carries the pack as data its format
defines as ignorable.

| Envelope | Outer face | Pack carried in |
| --- | --- | --- |
| Video (MP4) | a carried video face | a top-level `uuid` box (ISO/IEC 14496-12 user extension) |
| Image (PNG) | a carried still face | a private ancillary chunk, `ufOb` |

Both are valid under their own standards. Neither carries a player; a UFO
reader is needed to open the universe inside.

- **[E17] Best-effort carriers.** These envelopes deliver the universe only
  through channels that preserve the file's bytes. Any platform that
  re-encodes video or images — as most messaging and social platforms do —
  strips the universe, and what arrives is an ordinary video or image. A
  reader creating such an envelope MUST say this to the person, and MUST NOT
  describe it as a dependable way to send a universe. The web envelope is
  the dependable one.

### 9.5 The reader ladder

The same file works at every rung. Each rung is a binding and shell around
the same kernel (**K1**).

| Rung | Host | Adds |
| --- | --- | --- |
| 1 | any modern browser, opening a web envelope | nothing to install |
| 2 | the reader installed as a web app | offline use, opening `.ufo` and `.ufo.html` files, in-place saving where the platform allows |
| 3 | native readers and the command-line reader | file association, the working form on disk, permission prompts, seal verification, the agent interface |

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
holding `{commit, key, signature, time, name}`, where `signature` is the
Ed25519 signature of the bytes `"ufo-seal-1"` followed by the commit hash.

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
  scope.
- **[U6]** Before granting, the reader describes the request to the person in
  plain language, including its scope. Grants are narrow by default, and the
  person can revoke any grant at any time.
- **[U7]** A grant made for one root hash carries to a successor only when
  the successor was promoted (§11.6) in this reader with the person's
  approval, and requests nothing new. A file that arrives from elsewhere
  begins with no grants, whatever it contains.
- **[U8] Delegation.** A principal may pass a capability to another by a
  signed token naming issuer, audience, capability, scope, expiry and the
  token it derives from. A token MUST be equal to or narrower than the one
  it derives from. No shared secret is involved.
- **[U9]** The reader's own checks — record hashes, conservation where
  content is present, fuel metering, seal verification, permission
  enforcement, the limits of §3.1 — cannot be disabled or weakened by
  anything in a file.

### 10.4 Membranes

A membrane is any boundary between universes. It is not a mechanism of its
own: there are four crossings, and each is governed by rules stated
elsewhere in this document, gathered here.

| Crossing | What crosses | Rule |
| --- | --- | --- |
| **Nesting** | a universe's records sit inside another's pack | verified on its own terms; immutable; read-only; no authority from the parent (**C10**, **O8**) |
| **Reference** | an anchor names a commit elsewhere | names exact content; cannot be redirected; verified wherever found (**C9**) |
| **Transfer** | a file moves between people | carries its content, attribution, seals and requests, and its working history only by choice (§9.3); carries no grants; the recipient's reader decides everything (**U5**, **U7**) |
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

---

## 11. Profiles for behavior and attention

This section defines `ufo.computelet/1`, `ufo.printer/1` (with the ledger)
and `ufo.summary/1`.

### 11.1 The Compute-let

A **Compute-let** (`ufo.computelet`) is a program carried as an object. A
universe whose primary face presents a Compute-let is a Compute-let that
stands alone as a file.

Its properties are its **manifest**:

| Property | Value |
| --- | --- |
| `modules` | list of pins to module objects (§11.3); the first is the entry |
| `requests` | list of `{capability, scope, required, why}`; `why` is plain language for the person |
| `state` | link to a blob: the latest snapshot (§11.2), with the pin of the module it belongs to |
| `tests` | list of pins to test objects (§11.6) |
| `printer` | link to the blob of the printer component this Compute-let was built with |
| `docs` | ref to a text: documentation and instructions for people and agents |
| `poster` | ref to a rendition shown when the Compute-let cannot or may not run |
| `axes` | the axes its surface offers to anchors, if any beyond `x`, `y`, `t`: each with a name and a kind (§4.2) |

Modules and tests are named by pin, so the manifest's revision hash fixes
every component. That hash is the Compute-let's **root hash**.

- **[M1]** A Compute-let sees only the base host functions and the
  capabilities in its manifest that have been granted. Nothing else exists
  for it.
- **[M2]** A Compute-let is inert until a reader chooses to run it. Opening
  a universe runs nothing (**C12**).
- **[M3]** A presenter carried in a universe is a Compute-let attached to a
  surface, and nothing more: it is placed like any surface, by the author or
  by the tool that imported the content. The one convenience is the universe
  object's `presenters` map, which names, for a media type outside the
  baseline (§6.5), the Compute-let that can decode assets of that type, so
  that a raster or samples primitive may name such an asset as its source.
  The map is consulted for assets only. Native objects are never dispatched
  by type: the kernel composes them (§6.1).

### 11.2 Execution

Modules are WebAssembly (core specification 2.0) restricted for determinism:
no threads, no shared memory, no host-dependent instructions, and only
imports from `ufo:host/1`.

- **[M4] Fuel.** Every function and every loop decrements a fuel counter by
  the cost of the instructions it is about to run and traps when the counter
  is exhausted. The metering instructions are inserted by the printer by a
  fixed rule and are present in the stored bytes. A reader MUST verify their
  presence before running a module, by checking that removing and
  re-inserting them reproduces the module exactly, and MUST refuse a module
  that fails. The reader sets the fuel available for each call.
- **[M5] Determinism.** Given the same module, state, clock times, inputs,
  messages and random seed, a Compute-let MUST behave identically on every
  reader. The printer canonicalizes NaN values wherever their bits could be
  observed.
- **[M6] State.** A Compute-let's state is its memories and globals. A
  **snapshot** is their exact content, stored as a blob. A reader takes a
  snapshot at `checkpoint`, on suspension and before promotion, and resumes
  by restoring one. Recording a snapshot is a change like any other, so the
  history of state is in the Chronicle and any earlier state can be
  restored.
- **[M7] Replay.** A reader MAY record the times, inputs, messages and seeds
  delivered to a Compute-let. Replaying the record from the matching
  snapshot reproduces its behavior. This is what tests, verification by
  others and shared sessions rest on.
- **[M8]** A Compute-let that traps, exhausts its fuel or exceeds its memory
  limit is stopped. Its last snapshot is intact; its surface shows the last
  frame it drew, marked as stopped.

### 11.3 Modules and units

A module object (`ufo.module`) holds:

| Property | Value |
| --- | --- |
| `wasm` | link to a blob: the module's bytes. This is the only thing that runs, and the only authority on what the module is. |
| `units` | list, in function index order, of `[unit hash, change]` |
| `names` | map from unit hash to a name, for projections |

A module offers one keyed axis, `units`, whose keys are unit hashes.

A **unit** is one function body: its local declarations and its
instructions as the agent supplied them, before metering, in WebAssembly
binary encoding. A unit is identified by the hash of those bytes. Identical
units have the same identity in every module and every universe.

Everything else in `wasm` — section sizes, indices, the type, function,
export and element sections, metering instructions — is **derived**: computed
by the printer from the units and the module's declared structure by fixed
rules.

- **[N1]** A reader MUST be able to check that `wasm` is exactly what the
  printer's rules produce from `units` and the declared structure, and MUST
  classify a module that fails as inconsistent.

There is no source tree. The module's readable forms are projections.

### 11.4 The printer

The **printer** is the only component permitted to produce module bytes. It
is itself a WebAssembly component, identified by hash, carried once by any
universe that contains a Compute-let (**K4**) and shared by all of them.

An agent or person drives the printer with operations. Instruction
sequences are supplied in the WebAssembly text format; names refer to units
by hash or by the module's `names`.

| Operation | Effect |
| --- | --- |
| `func.add` | add a function with a signature and instructions |
| `func.replace` | replace the instructions of the function whose unit hash is given |
| `func.remove` | remove a function that nothing refers to |
| `export.set` / `export.remove` | export a function, global or memory under a name; remove an export |
| `import.add` | import a `ufo:host/1` function |
| `global.add` / `global.set` | add a global; change its initial value |
| `memory.set` | declare the memory's initial and maximum size |
| `data.set` | set the bytes of a data segment |
| `table.set` | set the functions of the indirect call table |
| `test.add` / `test.replace` / `test.remove` | change a test (§11.6) |

Each operation names the module's revision hash as `base`, and each
`func.replace` and `func.remove` names the unit hash it expects to find.

For a list of operations forming one change, the printer:

1. checks every operation against the baseline, and refuses the whole
   change if any `base` or expected unit hash does not match (**L4**);
2. encodes the supplied instructions deterministically;
3. recomputes every derived byte, including metering;
4. validates the resulting module against the WebAssembly specification and
   the restrictions of §11.2;
5. produces the new `wasm` blob, the new `units` list and the change that
   records the operations, to be committed together or not at all.

- **[N2]** The printer is deterministic: the same baseline and operations
  yield the same bytes on every reader.
- **[N3]** Where the content of a module's printer operations is present, a
  reader MUST be able to replay them with the printer named in the manifest
  and MUST classify the module as inconsistent if the result differs from
  `wasm`. Where it is withheld, **N1** and **M4** still hold and the reader
  says that the ledger cannot be replayed.

### 11.5 The ledger

The **ledger** of a Compute-let is the part of the Chronicle made of changes
whose operations are the printer's. It is not a separate structure: it obeys
the laws of §1.7 and is navigated by the projections of §7.5.

For each unit, the ledger answers:

| Question | Answered by |
| --- | --- |
| What caused it? | the `origin` of the change named beside the unit in `units`: prompt, model, requester |
| What did it replace? | that change's operation, which names the previous unit hash |
| What justifies it? | evidence of kind `tested-by`, from the unit to tests |
| What has run it? | evidence of kind `exercised-by`, from the unit to a recorded replay |
| What was decided? | decisions about that change |

- **[N4] Meaning, not mechanics.** Origin attaches to units. Derived bytes
  have no origin beyond "computed by the printer", and a change that only
  shifts derived bytes attributes nothing.
- **[N5] By content.** Because a unit is identified by its hash, its ledger
  entries apply wherever the same unit appears. A unit copied between
  Compute-lets is recorded with `copied`, as any copy is (§8.5).

Projections of a module, in addition to those of §7.5: `units` (each unit
with name, signature, size, origin and tests, one per line); `unit(hash)`
(its instructions in WebAssembly text format); `calls` (which units call
which); `unit-history(hash)` (the chain of units it descends from). Search
covers unit hash, name, signature, call relationships, prompt text, test
coverage and revision.

### 11.6 Tests and promotion

A test object (`ufo.test`) names an exported function to call or a recorded
replay to run, the snapshot to start from, and the result expected.

A change to a running Compute-let is **promoted** by this sequence, which
the reader, not the Compute-let, carries out:

1. The printer produces a candidate (§11.4). On refusal, stop.
2. The reader verifies the candidate (**M4**, **N1**). On failure, stop.
3. The reader runs the tests named by the manifest *as it was before the
   change* against the candidate, in a shadow instance started from a copy
   of the live state.
4. If every test passes, the reader commits the change, snapshots the live
   instance, starts the candidate from that snapshot and switches the
   surface to it. The previous revision remains in history.
5. If anything fails, the candidate is discarded. The running instance has
   not been touched.

- **[G1] The judge is outside the change.** The tests that gate a change are
  those in force before it. A change that alters tests is a **test change**.
  It MUST NOT be combined with any other operation, and it is committed only
  with a decision of verdict `approve` from the person.
- **[G2]** The running Compute-let never observes a candidate that failed.
- **[G3] Rollback** is promotion of an earlier revision, with the live state
  carried across in the same way and the same tests applied.

### 11.7 Summaries and the light cone

A summary (`ufo.summary`) condenses a stated scope. It is a derivation
(§8.3) with `how` `summarize`: its `from.sources` are pins to exactly what it
condenses — regions, objects, changes, units, other summaries, other
universes. Beyond `from` it has:

| Property | Value |
| --- | --- |
| `level` | 1: a line; 2: a paragraph; 3: a page |
| `text` | ref to the text of the summary |
| `parts` | list of refs to the summaries of the next finer scope |

Summaries form a tree through `parts`, from the universe object's `summary`
at the top down to content. The tree continues into nested and linked
universes through pins that name them. This tree is what the project calls
the light cone: the whole at low resolution, any part at full resolution.

- **[Z1] A summary is a claim; its pins are the evidence.** A stale summary
  MUST be marked stale wherever it is shown and MUST NOT be silently used.
- **[Z2] Navigation, not knowledge.** A summary is never a source: it may not
  be evidence (**R4**), and an answer drawn from summaries MUST cite the
  content they pin, not the summaries.
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

The projections of §7.5, the printer operations of §11.4 and the actions
below are functions of the kernel, so every reader has them. A reader of
rung 3 also offers them to outside agents as tools under the Model Context
Protocol:

| Action | Effect |
| --- | --- |
| `propose(change)` | submit operations with origin, evidence and note; the kernel verifies and commits, or refuses whole |
| `print(operations)` | submit printer operations for a Compute-let; begins promotion |
| `test(computelet)` | run its tests against the current state and report |
| `import(bytes)` | add an asset |
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
| Core operations | 5 | 5 | |
| Node kinds | 5 | 5 | |
| Frame kinds | 6 | 6 | |
| Formula operators | 64 | 50 | a spreadsheet's essentials; anything larger is a Compute-let |
| Base host functions | 12 | 10, plus 2 exports | small enough to implement identically on every host |
| Concepts in the glossary | 40 | 37 | what a newcomer must learn; each is justified in §16, and a new concept must displace one |

### 12.2 Size of the player

| Measure | Limit | Reason |
| --- | --- | --- |
| Kernel source, excluding tests | 10 000 lines | one engineer reading about 1 200 lines an hour finishes in a working day |
| Kernel, compiled WebAssembly | 256 KiB | a tenth of a typical phone photograph |
| Kernel, DEFLATE-compressed | 96 KiB | what an envelope actually carries |
| Binding source, per host | 600 lines | readable in minutes |
| Web binding, as shipped | 16 KiB | |
| Web envelope holding one paragraph | 160 KiB | compressed kernel in base64 (128 KiB), binding, static face, pack |
| Pack code in the kernel; value codec; an independent read-only reader | 800; 400; 500 lines | §3.3 |
| Printer, compiled | 192 KiB | carried only with Compute-lets |
| Implementations of any piece of format, layout or media logic | exactly 1 | **K1** |
| References to a medium, profile, object type or foreign format in a binding or native shell | 0 | **K2** |

### 12.3 Behavior

| Measure | Limit | Reason |
| --- | --- | --- |
| Static face visible, web envelope, any device | first paint | it is plain HTML ahead of everything else |
| Time to first interaction, one-paragraph envelope, mid-range phone | 500 ms | opening should feel like opening a photograph |
| Time to first interaction, Quarterly Review (§14.4), mid-range phone | 1 000 ms | |
| Tool calls for an agent to find and explain the origin of a unit of machine code | 5 | `overview`, `search`, `units`, `why`, `text` |
| Share of the universe an agent expands to do so | reported | must fall as the universe grows |
| Reopened universe has the same root hash on every reader tested | always | |
| Canonical export bytes identical on every reader tested | always | **S5** |

The conformance suite tests the one kernel against every labeled rule in
this document, and includes: malformed and hostile packs; the fuzzing of
**P16** and its corpus; writes interrupted at every byte offset of a commit
(**P6**); corruption by bit flips, truncation and swapped ranges; compaction
with every hash compared before and after (**P11**); the weekend test
(**P17**); refused changes of every kind named in **L4**; anchor carrying
across long edit histories, with and without operation content; and a
travel form with working history withheld, checked for what it reveals and
what it still verifies (**E10**). Independent implementations, when they
exist, are measured against the same suite.

---

## 13. Mapping a rich editing application

The provenance model of §1.7 and §8.5 belongs to the format. This section
shows that an application with its own, richer provenance system can write
its records into a UFO and read them back without loss. Cursive, a writing
application that attributes every AI contribution to the prompt and
generation behind it, is the example because its records are known in detail. It is not the authority,
and this mapping has been worked on paper against its record definitions,
not run against it.

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
| Attribution segment `[from, to)` in editor positions | not stored; it is the `runs` of the text. Cursive converts between its positions and character positions using its own parse of the same source |
| Generation record: prompt, model, operation, conversation, original and generated text | one change. `origin` is `{basis: witnessed, by: model, model, prompt, context, asked, parameters}`; the prompt and conversation are text objects; the generated text is the `ins` of the change's splices; the original text is their `old` |
| Parent and derived-from generation ids | `origin.context` pins to the earlier changes |
| Retrieved sources, with bibliographic fields and content hash | objects of type `io.cursive.source` holding those fields; evidence of kind `consulted` from the generated region to each (**R3**) |
| User change record, made by typing in the editor | a change with `origin` `{basis: witnessed, by: person}` |
| Attribution established after the fact by aligning text | a change with `origin` `{basis: inferred, by: person` or `model, method: text-alignment, confidence}`; Cursive's precision grade (`exact-mark`, `exact-text`, `single-window-text`, `fallback`) is the confidence (**R2**) |
| External or pasted content with no record | a change with `origin` `{basis: unknown}` |
| Content written by the application itself (restore, system) | a change with `origin` `{basis: witnessed, by: tool}` |
| Copy and paste with a transfer record | a change whose `origin` is `{basis: witnessed, copied: pin to the source region}`; the destination needs no new generation record, because origin follows `copied` (§8.5) |
| Acceptance, unacceptance | decisions with verdict `accept` and `retract` about the generation's change (**R6**, **R7**) |
| Generation deleted with a review action | the splice that removes the text, with a decision of verdict `reject` or `revise` |
| Generation declined before entering the document | the generated text kept as a text object referenced by nothing in the document, its change carrying a decision of verdict `reject` |
| Source-edit ledger entry: baseline hash, old text, contexts, replacement | a splice: `base`, `at`, `old`, `ins`. The context fields exist to locate an edit unambiguously; `at` against `base` already does |
| Shadow workspace result | the change computed from the shadow's bytes against the baseline (**L1**); the agent session is the `actor` |
| Version, with label and source | a commit. Every commit is a restorable version. The label is the change's `note` |
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

Cursive rebuilds its records from the Chronicle: segments from `runs`,
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
| `video` | `ufo.clock` | interval 0 to 20 min; the primary face presents it in a 1920 × 1080 region |
| `footage` | `ufo.raster` | source: asset `footage.mp4`; time: the enclosing clock's |
| `sound` | `ufo.samples` | source: the same asset |
| `dataset` | `ufo.data` | the figures; rows and columns keyed |
| `table-clock` | `ufo.clock` | interval 1:32 to 2:12, `locked`; holds `table-portal` |
| `table-portal` | `ufo.portal` | `of` `table-view`; placed `absolute` in the upper right of the frame's region |
| `table-view` | `ufo.group` | `grid`, `each` over `dataset` sorted by `state("sort")`; header cells carry `on` handlers that set `sort` |
| `info-clock` | `ufo.clock` | interval 8:00 to 8:45; holds `info-portal` |
| `info-portal` | `ufo.portal` | `of` `info-surface` |
| `info-surface` | `ufo.surface` | Compute-let `infographic`, granted `objects` read scope on `dataset` |
| `transcript` | `ufo.text` | the narration; one block span per sentence |
| `caption-n` | `ufo.clock` | one per sentence, each holding a Portal to that sentence's region of `transcript` |
| `article` | `ufo.text` | the document form of the video |
| `chapter-n`, `top` | `ufo.summary` | one per chapter, and one above them |

**Coordinate spaces and anchors.** `video` offers `t`, and through its
region `x` and `y`. The Portal's position is the interval of `table-clock`
(on `t`) and its rectangle in the region (on `x`, `y`). Sentences are tied
to time by construction: caption clock *n* holds a Portal whose `of` is a pin to
sentence *n*'s region on `chars`; the clock's interval is the sentence's
time range. "Which words are spoken at 3:10" is answered by finding the
caption clock present at that time; "when is this sentence spoken" by
finding the clock whose Portal pins it.

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
`top.parts` lists the chapters. Trimming the video's start by ten seconds is
a `remap` on `t`; every chapter pin carries by the continuous rule and stays
attached.

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
| `game-surface` | `ufo.surface` | Compute-let `game` |
| `game` | `ufo.computelet` | modules, tests, snapshot, poster; requests below |
| `engine` | `ufo.module` | units of the game |
| `level-1` … | `ufo.data` | tiles, entities and parameters of each level |
| `test-1` … | `ufo.test` | exported checks and recorded replays |

**Requests.** `gpu` (required), `audio` (optional), `input.raw` (optional),
`objects` read on the level objects (required). Keyboard, pointer and touch
arrive through the base `input` function and need no grant. Without `gpu`
the Portal shows the poster and says why. Without `audio` the game is
silent.

**What the host interface provides.** The ten base functions; the four
capabilities above; `frame(time)` at the display's rate with fuel set per
call. Nothing else.

**Levels are objects.** A person edits `level-2` with the onboard tools as
they would any table: a change with `set` operations. The game reads levels
through its `objects` capability and is told of the new revision by
`message`.

**Live modification.** With the game paused — its clock held, its state
snapshotted (**M6**) — an agent:

1. calls `propose` with `set` operations on `level-3`;
2. calls `print` with `func.add` for the new mechanic and `func.replace` for
   the update function, naming the module's `base`.

The reader runs the promotion sequence (§11.6): the tests in force before
the change run against the candidate in a shadow instance started from the
paused state; on success the candidate takes over from that state and the
game resumes with the mechanic. A broken candidate is discarded and the
paused game is untouched (**G2**).

**Text linked to code.** The paragraph of `design` describing the mechanic
carries a `link` span whose `href` is an anchor to `engine` with a region on
its keyed `units` axis naming the new unit's hash. In the other direction,
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

**Summary tree.** `corpus.summary` (level 3) has `parts`: one summary per
study and one for the report. Each study's summary pins that study's commit
and has parts for its documents, datasets, interviews and Compute-lets; a
document's summary has parts per section; an interview's per segment of
time. Four hundred documents are reached in four levels.

**The question.** "Why does the report conclude *C*?"

| Step | Call | Reads |
| --- | --- | --- |
| 1 | `overview` | the top summary and the list of studies |
| 2 | `search` for *C* in the report | the anchor of the sentence stating *C* |
| 3 | `why` on that anchor | its origin (who or what wrote it, from what prompt), its evidence (pins into two studies), its decisions |
| 4 | `text` on each evidence pin | the exact supporting passages and cells, each verified against its pin |
| 5 | `why` on a supporting passage | its own origin: say, a person's edit of a model's draft that consulted interview 7 between 12:40 and 14:05 |
| 6 | `text` on that interview region | the words spoken |

The agent answers with the anchors from steps 3 to 6 and their origins. It
has expanded one sentence of the report, a few passages of two studies and
ninety seconds of one transcript. The other studies were seen only as
single lines in step 1.

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
| Narrated video | transmuted, then sampled | `narration`: a text and synthesized samples, `from` pinning `report`; `video`: a clock ordering the deck's regions against the narration; exported by sampling |
| 3D view | transmuted, then sampled | `scene`: a `ufo.data` object whose rows describe bars, labels, lights and a camera for `figures`, with `from` pinning `figures`; `scene-surface`: a `ufo.surface` whose Compute-let, `scene-presenter`, requests `gpu` and `objects` read on `scene` |
| Application | sampled | `projector` presented alone, full size |

**The 3D view uses no hidden profile.** `scene` is a data object like
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
`figures` are stale (**D1**); each can be regenerated by a change that
writes new revisions (**D3**). `history` on the cell shows who changed it,
when and why.

**Sending.** To a colleague: a web envelope (§9.2) opening every face above
in a browser. Before it leaves, the reader shows what will travel (**E12**):
the content; the attribution, naming the author, the model that produced the
deck and narration, and forty-odd changes; not the prompts or the earlier
drafts of the report, unless the author includes them. To a video-only
channel: an MP4 envelope whose outer face is the exported narrated video,
on the understanding that the channel may strip the universe (**E17**).

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
| Presenters are sandboxed components behind a defined interface and can be carried as Compute-lets | Holds. Base presenters consume the display list; every other presenter is a Compute-let on a surface | §6.1, §6.3, **M3** |
| Every reference uses content addressing or stable identity, never file paths | Holds. Refs are identities; links and anchors are hashes; locations are hints without authority | **C11** |
| Every derived artifact records what it was derived from | Holds. One derivation record with pins, for renditions, transmutations, summaries, derived spans and imports | §8.3 |
| The host interface's optional capabilities have a defined request and degradation path | Holds | **H1**, **H2** |
| Nesting depth, active decoders and active Compute-lets are bounded by the reader, not trusted to the file | Holds | §3.1, **C13**, **O7** |
| The Chronicle and ledger share foundations so one navigation approach serves every medium | Holds. The ledger is the Chronicle's changes with printer operations; the same projections navigate both | §11.5, §7.5 |

"Holds" here means the design satisfies the check on paper. None has been
tested.

---

## 16. Glossary

The format has 37 concepts. A concept is listed only if it cannot be
expressed as a composition of the others; the third column says why not.

| Concept | Meaning | Why it cannot be removed | § |
| --- | --- | --- | --- |
| Anchor | a reference to a region of an object at a revision | the one way anything attaches to anything | 4.1 |
| Axis | a named dimension of an object: sequence, continuous or keyed | defines what a region is and how it survives edits | 4.2 |
| Binding | the host-specific code connecting the kernel to a host | the only part that differs by host; must be named to be kept empty of domain logic | 6.1 |
| Blob | an immutable byte stream stored as chunks | range reads and identity of large bytes | 1.4 |
| Capability | a named, granted authority beyond the base host functions | the unit of permission | 6.3 |
| Change | the object recording one transition of a universe | carries operations, origin, evidence and decisions | 1.7 |
| Clock | a mapping from a parent's time to a child's, over an interval | time cannot be composed from space | 4.5 |
| Commit | the record fixing a universe's state and history | the thing a root hash names and a seal signs | 1.6 |
| Compute-let | a program carried as an object, run in a sandbox | behavior cannot be composed from description | 11.1 |
| Decision | what a person chose to do about content | one of three facts that must never merge | 8.5 |
| Derivation | the record of what an object was made from, and how | basis of staleness for every derived thing | 8.3 |
| Display list | what the kernel composes for presenters to draw and play | the contract between kernel and host | 6.2 |
| Envelope | a file valid in a common format that carries a pack | how a universe reaches software that does not know the format | 9.2 |
| Evidence | what supports content | one of three facts that must never merge | 8.5 |
| Face | a presentation of a universe: sampled, carried or transmuted | what a person actually opens | 7.1 |
| Feature | a declared requirement a reader needs to interpret a universe | lets old readers fail plainly on new content | 1.6 |
| Formula | a pure, terminating, deterministic expression | computed values without a program | 5.3 |
| Grant | a reader's record that a person allowed a capability | must be distinct from a request, which a file can contain | 10.3 |
| Hash | the SHA-256 digest that names a record | identity of everything stored | 1.1 |
| Host interface | the complete set of functions a sandboxed component may import | the frozen boundary of the sandbox | 6.3 |
| Kernel | the one program that reads, verifies and composes a universe | the single implementation everything else relies on | 6.1 |
| Object | an identity with a type and properties | the unit of content | 1.5 |
| Operation | one edit stated against a named baseline | what conservation and anchor carrying are computed from | 1.7 |
| Origin | who or what contributed content: witnessed, inferred or unknown | one of three facts that must never merge | 8.5 |
| Pack | the byte format holding a universe's records | the file | 2.1 |
| Pin | an anchor that records the digest of what it covers | the staleness test | 4.4 |
| Portal | an occurrence in a parent that presents another object | composition of objects, within and across universes | 8.4 |
| Presenter | a component that turns display-list items into output | must be named to be kept few | 6.1 |
| Primitive | one of the eleven kinds of thing a universe can describe | the vocabulary | 5.1 |
| Principal | a party that acts, identified by key, name or both | who an actor, decider or sealer is | 10.1 |
| Printer | the only component that produces module bytes | sole writer of executable content | 11.4 |
| Projection | anything generated on demand and never stored | separates views from truth | 7.1 |
| Record | an immutable byte string named by its hash | the unit of storage | 1.3 |
| Revision | one state of an object, named by its revision hash | what an anchor is expressed against | 1.5 |
| Seal | a signature over a root hash | identity, as distinct from integrity | 10.2 |
| Summary | a derivation that condenses a pinned scope | navigation at low resolution | 11.7 |
| Universe | the set of objects reachable from one commit | the whole | 1.6 |

**Names for compositions.** These words are used in this document for
convenience. Each is fully defined by the concepts above and adds nothing
to learn.

| Word | Is |
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
| Membrane | the rules on four kinds of crossing between universes |
| Rendition | an asset with a derivation |
| Root | an entry in the universe object's `roots` |
| Snapshot | a blob of Compute-let state |
| Transmutation | described objects with a derivation whose origin is a model |
| Unit | a function body, named by its hash |
| Working form, travel form | a pack alone; a pack in an envelope |
| Working history | the records a travel form withholds by default |

---

## Appendix A. Properties of the primitives

All lengths are in the units of the enclosing region. Colors are sRGB with
alpha, as four floats from 0 to 1. Any property may be a formula.

**Common to all:** `label`, `role`, `lang`, `opacity`, `visible`, `on` (map
from an input event name — `press`, `enter`, `leave`, `key`, `change` — to
`{set: state name, to: formula}` or `{deliver: true}` for surfaces), `from`
(§8.3).

**In a parent:** `place`, `x`, `y`, `w`, `h`, `row`, `col`, `span`,
`align`, `grow`, `margin`.

| Primitive | Properties |
| --- | --- |
| Text | §8.1, and default style: `font` (list of family names or a ref to a font asset), `size`, `weight`, `slant`, `color`, `direction`, `line`, `align`, `decoration`. Spans override these |
| Path | `d`: list of segments `[M x y]`, `[L x y]`, `[C x1 y1 x2 y2 x y]`, `[Q x1 y1 x y]`, `[Z]`; `fill` and `stroke`: a color or a gradient `{kind, stops, from, to}`; `width`, `join`, `cap`, `dash`, `rule` |
| Raster | `source`: ref to an asset or surface; `time` (for video sources); `crop`; `fit`; `smooth` |
| Samples | `source`: ref to an asset or surface; `gain`; `pan`; `time` |
| Region | `children`; `w`, `h`; `transform`: six floats; `clip`: a path or boolean; `background`; `scroll` |
| Group | `children`; `layout`: `flow`, `grid` or `absolute`; `direction`; `gap`; `rows`, `cols` (for `grid`); `each`, `as` |
| Clock | `children`; `start`, `end`, `rate`, `offset`, `mode`; `drive` (formula, for `held`) |
| Portal | §8.4 |
| Surface | `computelet`: ref; `w`, `h`; `ports` |
| Data | `cols`: map from column key to `{label, type, order}`; `rows`: map from row key to map from column key to value; `order`: list of row keys |

## Appendix B. Projection line formats

A projection for agents is UTF-8 text. The first line states the projection,
the commit and the universe. Each following line is one record: a kind, then
fields separated by single spaces, text fields last and quoted as JSON
strings. Identities and hashes are shown as the shortest prefix, of at least
eight hexadecimal digits, that is unique in the universe.

```
why 3f9a12c4 @ commit 77e0b1d2 lineage 5c1e90aa
region  o=3f9a12c4 chars=[1042,1187] rev=a81f3320
run     chars=[1042,1120] change=d2c417e9 basis=witnessed by=model model="…" asked="…" prompt=withheld
run     chars=[1120,1187] change=0b77a3f1 basis=inferred by=person who="…" method=text-alignment confidence=exact-text
evidence claim=[1042,1120] kind=cites support=o:4410cc2e rows=[q3] cols=[revenue] state=current
decision about=d2c417e9 verdict=accept who="…" change=5e02d9b7
```

`basis` appears on every line that states an origin (**R2**). The line
formats for each projection of §7.5 and §11.5 are fixed by the conformance
suite alongside the first implementation, under two rules: a
projection is a function of the commit and its arguments alone, and every
field shown can be passed back, as written, as an argument to another
projection.
