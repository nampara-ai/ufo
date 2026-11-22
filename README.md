# UFO — the Universal File Object

An open file format for work that has to cross boundaries: one file that
holds a universe of described meaning, carries the small player that
presents it, opens in any browser with nothing installed, and records where
every part of it came from.

**Status: specification draft, under review. There is no implementation.**

| Document | What it is |
| --- | --- |
| [SPEC.md](SPEC.md) | The draft specification, version 0.1 |
| [ORIENTATION.md](ORIENTATION.md) | What the project is, its hardest open problems, and the decisions in the draft that most need review |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How changes are judged |

The design in one paragraph: a universe is a set of objects stored as
immutable records named by their hashes; every change is itself an object,
so history cannot be separated from content; any location in any object is
named by an anchor that survives edits by one of three rules; what a
universe shows is described with eleven primitives that one small kernel,
compiled once to WebAssembly, composes for the host to draw; programs are
objects that run in a sandbox with only the authority a person grants.

Released under the [MIT License](LICENSE).
