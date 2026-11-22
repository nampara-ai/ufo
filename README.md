# 🛸 UFO — the Universal File Object

An open file format for work that has to cross boundaries: one file that
holds a universe of described meaning, carries the small player that
presents it, opens in any browser with nothing installed, and records where
every part of it came from.

**Status: specification draft, under review. There is no implementation.**

| Document | What it is |
| --- | --- |
| [CORE.md](CORE.md) | The whole format in about four pages |
| [SPEC.md](SPEC.md) | The draft specification, version 0.7 |
| [RATIONALE.md](RATIONALE.md) | Why the format is shaped as it is |
| [VISION-TRACE.md](VISION-TRACE.md) | Each element of the vision: where it is specified, what has tested it, and how solid it is |
| [vectors/](vectors/) | Byte-level test vectors (normative) |
| [tools/](tools/) | Non-normative tooling |
| [spike/](spike/) | Throwaway code and findings of the measurement spike; to be deleted once reviewed |
| [NAMING.md](NAMING.md) | The decision on the file-name ending (`.ufx`) and media type, with the candidates compared and the dated checks |
| [registration/](registration/) | Draft media type registration; not submitted |
| [brand/](brand/) | Design brief for the default icon |
| [ORIENTATION.md](ORIENTATION.md) | Working notes: open problems and the record of design decisions |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How changes are judged |
| [SPEC-LICENSE.md](SPEC-LICENSE.md), [TRADEMARKS.md](TRADEMARKS.md) | The specification's licence; the policy for the name and the mark |

The aim is an open, universal primitive of computing, of the kind the PDF
became: one universe that can present as a document, plain text, an image,
a video, audio, data, a diagram, a 3D scene, an application or a game, and
that outlives every application that writes it. Start with CORE.md.

## License

Three licences, by what a thing is:

| What | Licence | Why |
| --- | --- | --- |
| The specification: [SPEC.md](SPEC.md) and [CORE.md](CORE.md) | [Open Web Foundation Final Specification Agreement 1.0](SPEC-LICENSE.md) | a copyright licence, and a promise not to assert necessary patent claims against any implementation of the specification |
| Test vectors: everything in [vectors/](vectors/) | [CC0 1.0](vectors/LICENSE) | they are meant to be copied into every implementation's tests, with no conditions |
| Everything else: code, tooling and the other documents | [Apache License 2.0](LICENSE), with [NOTICE](NOTICE) | an express patent grant from every contributor |

Source files carry an SPDX identifier. The name and the 🛸 mark are not
licensed by any of these: see [TRADEMARKS.md](TRADEMARKS.md).
