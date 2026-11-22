# Contributing

The project is at the specification stage. The most useful contributions
are reviews of [SPEC.md](SPEC.md): places where it is ambiguous, untestable,
larger than it needs to be, or wrong.

## How a change is judged

The format reaches for universality by finding a small structure that makes
cases unnecessary, not by covering cases one at a time. Before proposing an
addition to the specification, the kernel, a presenter or a binding, answer
these. A "yes" to any of the first six means stop and redesign.

1. Am I implementing something that already exists elsewhere in the system,
   in another language or another component?
2. Am I adding a decoder, converter or format-specific path to the kernel?
3. Am I storing the same content more than once in different formats
   because I am unsure which will open?
4. Am I adding a plugin, adapter or extension point where a composition of
   existing primitives would serve?
5. Am I teaching the binding or a native shell anything about a medium,
   document or application?
6. Am I carrying components into files that do not use them?
7. Can this be expressed as data, a formula, or a composition instead of
   new code?
8. Does this addition make the system easier or harder to explain on one
   page?
9. Will a universe that does not need this feature pay any cost for its
   existence?
10. If I deleted this, what would actually break, and could that be handled
    at the border instead?

An addition to the specification must also pass the deletion test (SPEC
§5.4, rule V3) and restate the budgets of SPEC §12. A simplification must
pass the opposite test: it may remove mechanism, never reach. Whoever
removes a concept shows what it now composes from, and that every worked
example of SPEC §14 still works.

## The terms of a contribution

*Proposed by the project's owner, and pending review by counsel.*

- **To the specification** (`SPEC.md`, `CORE.md`): under the Open Web
  Foundation's [Contributor License Agreement 1.0](https://www.openwebfoundation.org/the-agreements/the-owf-1-0-agreements-granted-claims),
  in its form covering copyright and patents. The
  [Final Specification Agreement](SPEC-LICENSE.md) is then applied to each
  released version.
- **To code and tooling, and to the other documents**: under the
  [Apache License 2.0](LICENSE), by its contribution clause (section 5):
  what you submit for inclusion is under that licence unless you say
  otherwise.

## Standards

- Report only what you ran and observed. Where a check could not be run,
  say so and say why.
- Every new requirement in the specification must be testable and carry a rule
  label.
- Define a term once and use it the same way everywhere.

## One implementation, and no accidental second one

- The files in `vectors/` are normative. The script that wrote them,
  `tools/vectors/generate.py`, is not. If they ever disagree, the
  specification and the vectors win and the script is fixed.
- When the kernel exists it must reproduce every vector on its own.
- The generator must never become a reader, a writer or a library that
  anything else imports or depends on. A second place where the format's
  logic lives, kept in step by hand, is exactly the failure this project
  exists to avoid. The same holds for any future tool: tools call the
  kernel; they do not re-implement it.
