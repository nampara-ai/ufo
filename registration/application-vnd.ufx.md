# Draft media type registration: application/vnd.ufx

**Draft. Not submitted.** Prepared against the registration template of
RFC 6838, section 5.6, for the vendor tree. Fields marked *to be supplied*
need the project owner.

**Type name:** application

**Subtype name:** vnd.ufx

**Required parameters:** none

**Optional parameters:** none

**Encoding considerations:** binary

**Security considerations:**

A UFX file is a container of immutable, content-addressed records that
describe documents, data, media and programs, together with their history.

- *Active content.* A file may contain programs, as WebAssembly modules.
  Opening a file executes nothing. A program runs only when the person acts
  to run it, inside a WebAssembly sandbox, metered by instructions the
  reader itself inserts, with a virtual clock, and with access to ten host
  functions for drawing, input, time, randomness and messaging. Anything
  further — network, files, devices, accelerated graphics, other content in
  the file — is a named capability that the file may request and only the
  person can grant, narrowly and revocably. A file cannot grant itself any
  authority, and grants are stored by the reader, never in a file.
- *Integrity.* Every record is named by the SHA-256 hash of its contents and
  is verified when read. The state of a file and its entire history are
  fixed by one hash. Hash verification establishes integrity, not identity.
- *Authenticity.* Identity is established only by Ed25519 signatures
  ("seals") over that hash. Names and times recorded in a file without a
  covering seal are claims. A file in its web-page travel form carries its
  own reader; statements that such a page makes about its own seals are the
  file's account and must be checked by an installed reader.
- *Privacy.* A file may contain a complete record of its editing history,
  including prompts given to AI models and discarded drafts. The format
  defines which layers leave a reader by default, requires the reader to
  show exactly what will be sent, and allows history to be withheld while
  remaining verifiable. Even then a file reveals names, times, model
  identifiers and the shape of its edit history. A persistent lineage
  identifier links all copies of a file.
- *External references.* Files may refer to content in other files by hash.
  Such references cannot be redirected; fetching them is an action of the
  reader, subject to its own policy.
- *Parsing.* The specification sets hard limits on every length, count and
  depth, requires that parsing terminate with a classification on every
  input, and requires fuzz testing of the reference parser. Compressed
  records declare their decoded length, which readers must enforce.
- *Embedded media.* Foreign media (images, audio, video, fonts) are decoded
  by the host platform's decoders; their security considerations apply.

**Interoperability considerations:**

The format is specified to be implementable from the specification alone,
with normative byte-level test vectors. All integers in the container are
little-endian; structured records use the deterministic encoding of CBOR
(RFC 8949, section 4.2.1). A reader must preserve content it does not
understand. The same container is also carried inside other formats as
"envelopes": a conforming HTML document (served as text/html), an MP4 file
(in a `uuid` box) and a PNG file (in a private ancillary chunk). Those
files have their envelope's media type, not this one. Platforms that
re-encode video or images remove the container from those envelopes.

**Published specification:** The UFO specification,
https://github.com/nampara-ai/ufo (SPEC.md). At the time of this draft the
specification is itself a draft, version 0.4.

**Applications that use this media type:** readers and editors of UFO
files, and AI agents that read and write them through the format's agent
interface. No implementation exists at the time of this draft.

**Fragment identifier considerations:** none defined. (The format has its
own notion of an anchor into a file; a mapping to fragment identifiers may
be registered later.)

**Additional information:**

- *Deprecated alias names for this type:* none
- *Magic number(s):* the first eight bytes are
  `89 55 46 4F 0D 0A 1A 0A` (0x89, "UFO", CR, LF, 0x1A, LF)
- *File extension(s):* .ufx
- *Macintosh file type code(s):* none. Uniform type identifier, provisional:
  `io.github.nampara-ai.ufx`, conforming to `public.data` and
  `public.composite-content`

**Person and email address to contact for further information:** *to be
supplied*

**Intended usage:** COMMON

**Restrictions on usage:** none

**Author:** *to be supplied*

**Change controller:** *to be supplied*

**Provisional registration?** *to be decided by the project owner*
