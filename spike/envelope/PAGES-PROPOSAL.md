# Proposal: serving the test envelopes with GitHub Pages

**Not enabled. Nothing in this repository turns it on.** This file is the
proposal; it contains no workflow that runs. It needs the owner's
approval, and one setting only the owner can change.

## Why

A page opened from a web address is the path most likely to work on a
phone: the browser runs it with scripts on. The acceptance test needs
that path tried beside the local ones (Files, Mail, Messages, AirDrop).

## What would be served

Only the test envelopes and one index page linking to them:

    index.html                 a plain list of the files below
    compose.ufx.html           the test document, as an envelope
    compose-edited.ufx.html    the same after one edit, saved by the page itself

They hold the test text of `vectors/compose.ufx` and nothing else: no
personal data, no keys. Each is a single self-contained file whose
content security policy forbids all network access, so serving it adds
no way for it to reach anything.

## Recommended setup: a branch that holds only those files

1. A branch named `pages`, with no history in common with the work
   branches, holding exactly the files above. I would create it and push
   it only after approval; it is outside the one branch I may push to
   now.
2. The owner turns Pages on: repository **Settings → Pages → Build and
   deployment → Source: Deploy from a branch → Branch: `pages`, folder
   `/ (root)`**.
3. The envelopes are then at
   `https://nampara-ai.github.io/ufo/compose.ufx.html`.
4. To turn it off: set Source to **None**, and delete the branch.

Why this and not the alternatives:

| Option | For | Against |
| --- | --- | --- |
| **A branch holding only the envelopes** (recommended) | nothing else of the repository is served; no workflow, no token, no build; off again in one setting | envelopes are copied to the branch by hand each time they change |
| A workflow that publishes `spike/envelope/out/` on each push | always current | adds an Actions workflow with deployment permissions to a repository that has none; more to review for a throwaway test |
| Pages from `/docs` on the default branch | one setting | serves from the default branch, which this work does not touch; mixes test files into the tree |

## What to check before approving

- The repository is public, so the pages will be public and indexable.
  The index page would carry `<meta name="robots" content="noindex">`.
- `github.io` is a shared domain. Nothing is stored by these pages
  (no cookies, no local storage), so there is nothing for a neighbour to
  read.
- A hosted envelope is the same bytes as the local file. If it behaves
  differently when hosted, that difference is a finding.

## After the test

Turn Pages off and delete the branch. The spike is throwaway; a standing
demonstration site is a separate decision.
