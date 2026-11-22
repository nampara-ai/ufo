# Design brief: the default icon for UFO files

Description only. No artwork exists yet.

## What it is for

One mark with two jobs: the icon a file manager shows for a `.ufx` file,
and the project's brand mark in documentation and readers. It is a visual
mark only. It never appears in the file-name ending, the media type or any
identifier of the format.

## The idea

A flying saucer, reduced to the fewest shapes that still read as one: a
shallow dome on a wider, flattened ellipse. Nothing else is required. A
short beam beneath is optional and is the first thing to go as the icon
gets smaller.

The mark should feel calm and exact rather than playful: a standard that
happens to have a memorable name. No faces, no aliens, no motion lines, no
gradients that carry meaning, no text.

## Sizes

It must be legible at every size a platform asks for, from 16 pixels to
1024.

| Size | What must survive |
| --- | --- |
| 16 px, 20 px | two shapes only: dome and disc, on the pixel grid, with at least one clear pixel between them and the edge. No beam, no lights, no outline thinner than one pixel |
| 32 px, 48 px | dome and disc, with one row of three to five lights on the rim if they stay distinct |
| 64 px to 256 px | the full mark; an optional beam; the document shape behind it where the platform expects one |
| 512 px, 1024 px | the same drawing, not a more detailed one. Detail is not added as size grows |

Each small size is drawn for its grid, not scaled down from the large one.

## Light and dark

Two variants, designed together, with the same silhouette.

- *Light:* the mark in a dark tone on a light or transparent ground.
- *Dark:* the mark in a light tone on a dark or transparent ground.

Both must keep a contrast ratio of at least 4.5 to 1 between the mark and
any ground it is likely to sit on, and must remain recognizable in a single
color, for places that allow only one.

## As a document icon

Where a platform shows document icons as a page with a badge, the saucer
sits on the page, centered, taking about half its width. Where a platform
shows a free-standing shape, the saucer stands alone. The same silhouette
serves both.

Travel forms keep their envelope's own icon — a web page, a video, an
image — because that is what they are to software that does not know the
format. A reader may overlay a small saucer badge on those in its own
windows.

## Color

One accent color at most, used only for the rim lights or the beam, and
never needed to recognize the mark. The exact color is the designer's to
propose, tested for the common forms of color-vision deficiency.

## Deliverables, when it is drawn

- Vector masters for light and dark.
- Hand-fitted bitmaps at 16, 20, 24, 32, 48, 64, 128, 256, 512 and 1024
  pixels, at one and two times scale.
- A single-color version.
- The platform packages the readers need: an icon set for macOS, an icon
  file for Windows, scalable and fixed-size icons under the freedesktop
  naming rules for `application-vnd.ufx`.

## Where the emoji fits

In plain text — a README, a message — the flying saucer emoji may stand in
for the mark. It is never part of a file name, the ending, the media type
or any identifier.
