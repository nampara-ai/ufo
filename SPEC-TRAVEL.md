# The Universal File Object (UFO) Specification: Travel and trust

**Version 0.8 — draft for review. Nothing here is frozen. Nothing here has been implemented.**

This part specifies the forms in which a universe leaves a reader — the pack alone, and envelopes that carry the player with it — what is included when it leaves, the readers it meets, and trust: principals, seals, permissions and membranes.

This is one part of the specification of the UFO format, and is written to
be read on its own by someone who has read the core, [SPEC.md](SPEC.md),
or its summary, [CORE.md](CORE.md). The words MUST, MUST NOT, SHOULD,
SHOULD NOT and MAY are used as in RFC 2119 and RFC 8174; a rule that
carries a label such as **[C3]** is a requirement in full; a term in
**bold** is being defined, and every term is listed in the glossary
(§6.2). What has been exercised, and how, is in
[VISION-TRACE.md](VISION-TRACE.md).

**What it takes from the core.** Records and their reachability (§1.3, §2.5); the pack (§2); changes and their veiled work (§1.7); references between universes (§1.8). From the player part: the four parts of the player (§9.1).

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

## 13. Forms of the file

### 13.1 The working form

The **working form** is a pack in a file by itself. The format is UFO; its
file-name ending is `.ufx`, read as "UFO Exchange", and its media type is
`application/vnd.ufx` (registration drafted, not yet submitted). A file is
a UFO file or a UFX file; both are correct. The ending and the media type
identify the pack wherever it is stored; the name UFO remains in the
format's own identifiers — the signature, type names, `ufo:` names.
Native readers and agents work on this form. A person's own working form
is whole (§2.5); one saved from a published copy lacks what its sender
withheld, and says so.

### 13.2 The travel form

The **travel form** is an **envelope**: a file that is valid in a common
format, shows an outer face to software that knows nothing of UFO, and
carries a pack and the player. The default envelope is a web page. Its file
name ends `.ufx.html`.

The web envelope is a conforming HTML document, encoded in UTF-8, valid
against the HTML Standard as it stood on the date of this specification
(the conformance suite names the snapshot). It contains, in this order:

1. The doctype, then a comment of at most 512 bytes — the **plain-text
   head** — giving in plain words the title, the fact that this is a UFO,
   the date of export, and one sentence on how to open it. It is UTF-8
   text, with any run of hyphens in the title reduced to one.
2. A `head` whose first element declares the character encoding, followed
   by the title and a content security policy that permits only the
   envelope's own scripts, identified by hash, and WebAssembly compilation,
   and forbids all network access.
3. A **static face**: the plain-text face (§8.3) of the primary face, as
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
four gaps, in that order. The binding supplies it: in a web envelope, the
fixed parts of the very page it is running in, the binding included;
elsewhere, a copy the reader holds. To write an envelope the kernel fills
the gaps. The kernel therefore contains no HTML, a binding contains no
envelope-writing logic, and nothing travels twice.

Finding a pack inside a file is the one thing the kernel knows about three
foreign containers: a pair of markers in HTML text, a box in ISO media, a
chunk in PNG. It is admitted under **V3** because it cannot be data or
composition — it happens before any universe is open — and it is not
decoding (**B1**): nothing of the container is interpreted but where the
pack begins and ends. Reading is the reverse and also
the kernel's: given the bytes of any file, the kernel finds the pack — at
the start of a working form, between the markers of a web envelope, in the
box or chunk of §13.4 — so a binding never parses an envelope (**K2**).

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
  no network, no installation, no account. A browser, here, is one that
  offers WebAssembly with 64-bit integers passed to and from script, script
  modules, a two-dimensional canvas, and decompression of raw DEFLATE
  streams. The conformance suite names the versions of the common browsers
  from which that holds.
- **[E5] Saving.** From a web envelope, saving produces a new travel-form
  file, containing the extended pack, which the person downloads or shares.
  Where the host offers the `files` capability, the reader MAY write the
  file the person chooses instead.
- **[E6] Opened as a file.** A reader of rung 2 or 3 (§13.5) that is given a
  web envelope reads the pack in place by range and runs its own kernel,
  never the embedded one (§14.6). If the universe needs a later format
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

### 13.3 Leaving a reader

- **[E7] Default distribution rule.** Whatever leaves a reader — sent,
  shared, exported, downloaded, copied out — leaves in the travel form,
  unless the person deliberately chooses the working form.
- **[E8]** A travel form carries the newest kernel and binding the exporting
  reader holds.

**What travels.** A universe has three layers, defined by reachability.

| Layer | What it is | Travels |
| --- | --- | --- |
| **Content** | the current revision of every **live** object — one reachable from the universe object by refs, indirects and anchors, without passing through a change — what a live object's anchor names in an earlier commit (§1.8), any earlier revision that a live object pins as support for evidence, and the blobs all of those name | always |
| **Attribution** | for every change that an element or a `by` of a live object names, that a live object's `from` names, that an included change's `sources` names, or that records evidence, a decision or a finding about live content: the change object, which holds its actor, time, origin, evidence, decisions and findings (§1.7); the objects its evidence names as support; every commit node; every seal | always |
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
  Markers of removed elements may be forgotten first (§1.10).
- **[E10] Stubs.** Withholding removes records and nothing else. Every hash
  that names a withheld record stays where it was: in `prev`, in commits, in
  `work`, in `origin.prompt`. The recipient's reader can therefore check
  the whole commit chain and every seal; check that each change it holds is
  the one its commit names; resolve every anchor, since resolution needs
  no history (**A2**); and answer `why` for all content present, since
  element identities and `origin.sources` never point into withheld
  records (§5.4). It cannot run the conservation check on a change whose
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

### 13.4 Video and image envelopes

A universe can also travel inside a video or an image, so that software
that knows nothing of UFO — a player, a gallery, a chat application — shows
a face of it. An envelope shows one outer face and carries the pack as data
its format defines as ignorable.

| Envelope | Outer face | Pack carried in | File name ends |
| --- | --- | --- | --- |
| Video | a carried video face: H.264 with AAC in MP4 (§9.5) | a top-level `uuid` box (ISO/IEC 14496-12) whose 16-byte type is the first 16 bytes of the SHA-256 of the ASCII text `ufo-pack-1`, placed after `moov` and `mdat` | `.ufx.mp4` |
| Image | a carried still face: PNG | one or more consecutive private ancillary chunks of type `ufOb`, placed after `IDAT` and before `IEND`, whose data concatenated is the pack | `.ufx.png` |

- **[E17]** Each envelope MUST be valid under its own standard and play or
  display correctly in software that ignores the pack. The outer face is a
  rendition (§5.3) of a face of the universe inside, with pins, so a reader
  can tell whether it is current.
- **[E18]** The kernel finds the pack in such a file by walking the
  container's boxes or chunks (§13.2), and the reader then proceeds as for a
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

### 13.5 The reader ladder

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

## 14. Trust

### 14.1 Principals

A **principal** is a party that acts: a person, an organization, an agent
acting for one. It is a map with either or both of `key`, an Ed25519 public
key (RFC 8032), and `name`, text.

- **[U1] Claims are claims.** A principal recorded in a change is a claim
  made by whoever wrote the change. It is established only for commits
  covered by a seal from that key (§14.2). A reader MUST show the
  difference.

### 14.2 Seals

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

### 14.3 Permissions

- **[U5] Requests, not possessions.** A universe can contain requests for
  capabilities (§12.1). It cannot contain grants. A **grant** is recorded by
  the reader, outside every universe, for one person, one Compute-let
  identified by its program hash (§12.1), and one capability with a stated
  scope. A reader with nowhere durable to keep grants — a page opened from
  disk — keeps them until the page closes.
- **[U6]** Asking, granting, narrowing and revoking follow the contract of
  §9.3. Grants are narrow by default.
- **[U7]** A grant made for one program hash carries to a successor only when
  the successor was promoted (§12.6) in this reader with the person's
  approval, and requests nothing new. A file that arrives from elsewhere
  begins with no grants, whatever it contains.
- **[U8] Delegation.** A principal may pass a capability to another by a
  token: an encoded value `{issuer, audience, capability, scope, expires,
  parent}` signed as a seal is, where `parent` is the hash of the token it
  derives from. A token MUST be equal to or narrower than its parent. No
  shared secret is involved. Within one reader, **H3** applies.
- **[U9]** The reader's own checks — record hashes, conservation where
  content is present, fuel metering, seal verification, permission
  enforcement, the limits of §3.1 — cannot be disabled or weakened by
  anything in a file.

### 14.4 Membranes

A **membrane** is any boundary between universes. Universes nest and link
without limit (§1.8), and every such boundary is a membrane with explicit
rules about what crosses it. There are four crossings.

| Crossing | What crosses | Rule |
| --- | --- | --- |
| **Nesting** | a universe's records sit inside another's pack | verified on its own terms; immutable; read-only; no authority from the parent (**C10**, **O8**) |
| **Reference** | an anchor names a commit elsewhere | names exact content; cannot be redirected; verified wherever found (**C9**) |
| **Transfer** | a file moves between people | carries its content, attribution, seals and requests; carries its working history to collaborators by default and to outside readers only by choice (§13.3); carries no grants; the recipient's reader decides everything (**U5**, **U7**) |
| **Capability** | a component reaches beyond its sandbox | only by a requested, granted, scoped, revocable capability (**H1**) |

Copying content from one universe into another crosses a reference
membrane: the change's `copied` anchor names the source commit, so the
content's origin remains answerable (§5.4).

Encryption of universes in transit and at rest is a later phase. The design
leaves room for it as a codec (§2.1) over record payloads, which keeps
hashes, deduplication and verification meaningful to key holders.

### 14.5 Conduct of readers

- **[U10]** No component may run by exploiting a parser flaw, bypass an
  operating system's security controls, remove quarantine markings, or alter
  system settings or file associations without the person's consent.
- **[U11]** Any local network service a reader offers is off by default.
  When enabled it listens only on the local machine unless the person
  chooses otherwise, and requires authentication for every request that can
  change a universe.

### 14.6 Security and privacy, gathered

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
Runaway or hostile programs: fuel, memory limits and the sandbox (§12.2).
Hostile nested universes: read-only, isolated state, no inherited authority
(**O8**, §7.3, **O10**). Self-granted authority: **U5**, **U7**. Forged
history: the commit chain (§1.6), seals (§14.2). Tests weakened
to pass a change: **G1**. What a published copy reveals: §13.3.

**Known and accepted.** The lineage links every copy of a universe. Hashes
of blobs are visible to anyone holding the same bytes. Under the encryption
planned for a later phase, record hashes would remain visible to parties
without keys unless records are also salted; that design is not settled.
Consent prompts are only as good as the attention paid to them.

---
