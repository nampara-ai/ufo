# Rationale

Why the UFO format exists and why it is shaped the way it is. The
[specification](SPEC.md) says what; this says why. It is written for anyone
deciding whether the design deserves their attention.

## The problem

A single piece of real work is scattered across a word processor, a
spreadsheet, a slide tool, a drive, email, chat, a tracker and several AI
assistants. Each keeps its own format, history and permissions. The context
that gives the work meaning — why a decision was made, what supports a
claim, who or what wrote a paragraph — is split among them and mostly lost.

Language models can now turn any form of information into any other. They
cannot see across those walls. So people act as couriers, copying fragments
between tools and re-explaining context that already exists somewhere else.

Agents have gained standard ways to call tools. There is no standard for
the material they work on: something that carries its own context, history,
permissions and behavior wherever it goes. That is what this format is for.

## Description, not depiction

Most file formats encode one medium. A video file is a video; turning it
into a document means making a second file that begins to drift from the
first at once.

A UFO stores what the work *is* — words and structure, data and
relationships, shapes, timing, sound, behavior — and treats every medium as
a way of presenting that. This is ordinary in particular fields. One
musical score yields many performances. One spreadsheet yields a grid and
several charts. One CAD model yields drawings, renders and toolpaths. What
has not existed is one description that does this across media, in one
portable file, with its history attached.

A presentation of a universe is called a face. A face is *sampled* (computed
on demand), *carried* (a stored rendition that records what it was made
from) or *transmuted* (new description written by a model, with its sources
pinned). Only the last adds information, and it is always marked as what it
is.

## A small player, not a large one

A file that opens anywhere must bring its own reader. The obvious way to
build a universal reader is to bundle a decoder for every format. That
reader grows without limit, and every file would pay for all of it.

The design avoids this in two moves.

First, native content is description built from eleven primitives, so
presenting it needs one small interpreter, not a library of decoders.
Second, the encodings that do exist are handled at the edge: common images,
audio, video and fonts by the host platform, which already decodes them
well; everything else by converting it to description once, on import, and
keeping the original bytes.

Five ways of going wrong are refused by rule, because each looks like
progress:

- the same logic written several times in several languages;
- one file carrying everything that might ever be needed;
- a small core surrounded by an ever-growing set of plugins;
- the same content stored several times in different formats;
- layers of compatibility code wrapped around one another.

The specification's budgets (SPEC §12) and its deletion test (SPEC §5.4)
exist to hold that line. A proposed addition must show that it cannot be
expressed as data, as a formula, or as a composition of what exists.

## One kernel

The program that interprets the format is written once, compiled once to
WebAssembly, and run unchanged in browsers, native readers and agent tools.
A second implementation inside the reference readers is forbidden. This
removes a whole class of defect — two implementations that disagree — and
makes behavior, including floating-point results, identical everywhere.
Independent implementations by others are welcome and are measured against
the same conformance suite.

## A pack of hashed records, not a database

The file is an append-only sequence of immutable records, each named by the
hash of its contents, in the manner of git. A universe's state and entire
history are fixed by one hash, which a signature can cover.

An embedded database was the obvious alternative and was considered
seriously. It was not chosen because every travelling file would have to
carry the database engine; because a database file has no canonical byte
form, so integrity and signatures would need a second scheme above it; and
because the data is append-only by nature, which is the one case where a
database's machinery is not needed.

What a database would have provided is supplied directly: crash safety by a
checksummed trailer, indexed reads by a derived index, strict limits and
mandatory fuzzing for hostile input, and compaction that preserves every
hash (SPEC §2–§3). The pack is kept simple enough that an independent
reader can be written from the specification in a weekend. That, rather
than a long history, is its claim to outlast its authors. A reader is free
to build a database as a local, disposable cache; it is never the format.

## History that cannot be detached

Every change to a universe is itself an object in it, and the chain of
changes is the only way the universe moves forward. Recording history is
therefore not a feature that can be skipped or lost in transit.

Three facts are kept apart and never merged: *origin* (who or what
contributed something), *evidence* (what supports it) and *decision* (what
a person chose to do with it). AI origin is not proof of error. Human origin
is not proof of truth. Acceptance does not certify accuracy.

Origin is honest about how it is known. It is *witnessed* when the software
that introduced the content recorded it at that moment, *inferred* when it
was worked out afterward by some stated method, and *unknown* otherwise.
Readers must show the three differently. Nothing is ever attributed by
resemblance and presented as fact.

## Private drafts, public authorship

The record that makes a file trustworthy also contains every prompt and
discarded draft. Sending all of that by default would make people afraid to
share. Sending none of it would discard the provenance the format exists to
carry.

So a file that leaves its owner carries its current content and the
attribution of that content — who and what wrote it, on what evidence, with
what decisions — and withholds working history unless the owner includes
it. Because everything is named by hash, withholding a record leaves its
hash in place: the chain of authorship still verifies, and nothing reveals
what the withheld drafts said. The owner's own copy keeps everything.

## Opening is not executing

Formats that let documents run code with authority became attack vectors
and were eventually shut out of platforms. Here, nothing runs because a
file was opened. Programs run only in a WebAssembly sandbox, metered, with
a virtual clock, able to call ten functions. Anything more is a capability
the file may request and only the person may grant, narrowly and revocably.
A file cannot grant itself anything, and no clever mechanism in the format
depends on defeating a platform's security.

## Machine code with a record instead of source

Source code does two jobs: it is input to a compiler, and it is the record
of why the program is the way it is. When the maintainer is a language
model, the first job can be done directly and the second can be done
better. A Compute-let keeps canonical WebAssembly as the only thing that
runs, and a ledger stating, for each function, the request that caused it,
the model that wrote it, what it replaced and the tests that justify it.
Readable listings are generated on demand. Whether this scales from a
calculator to a large program is an open question the project intends to
answer by building.

## Honest limits

- Envelopes other than the web page survive only where bytes are preserved.
- Live presentation uses each host's text rendering, so line breaks can
  differ between devices; identical output is promised only for canonical
  exports.
- A reference by hash can never be redirected, and can also fail to be
  found. The format verifies content from anywhere; it cannot make anyone
  keep it.
- Converting a foreign document to description can lose nuance. The
  original bytes are always kept, and the conversion is recorded.
- Every size and speed figure in the specification is a target set before
  anything was built.
