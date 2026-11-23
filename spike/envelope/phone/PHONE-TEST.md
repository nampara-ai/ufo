# Phone test of the web envelope

**None of this has been tried on a real device.** The files here were made
and tested only in headless Chromium on Linux (desktop size, and Chromium
pretending to be an iPhone 14 and a Pixel 7: a viewport, touch events and
a user-agent string, not Safari and not Android). Safari and WebKit were
not run at all. Every line below marked *Expectation* is a guess from how
these systems are known to behave, written down so that it can be proved
wrong. Please record what actually happens.

## The files

| File | What it is |
| --- | --- |
| `compose.ufx.html` | the test document (*The Quarterly Review*) as exported: 155 993 bytes |
| `compose-edited.ufx.html` | the same after the paragraph beginning "Every figure in this section…" was replaced with "Each number below was read from the ledger on the last day of the quarter.", by "Ada Tester", and saved by the page itself in the test run |
| `index.html` | a plain page linking the two, for hosting (it asks search engines not to index it) |

Hosted address used below (a placeholder until the files are put there):
`https://nampara-ai.github.io/ufo/compose.ufx.html`

## What "working" looks like

When the file's reader is running you see a row of five words at the top
— **Document  Pages  Text  Edit  Save** — and the document drawn below it,
on one drawn surface. (Revised 2026-11-23: the whole screen is now drawn by
the reader in the file; there is no line of state at the bottom, no link
and no Share… button. Steps and tables below that mention them are marked.)

When it is not running you see the **static face**: a blue box that begins
"This is a UFO file: a document that carries its own reader. You are seeing
its text only…", then the title and the whole text of the document as plain
text. That is the intended fallback, not a failure of the file; but it does
mean that route cannot do steps 2 to 6.

## The six steps

1. **Opened.** The five words and the drawn document appear. (If you see
   the blue box instead, write "static face only".)
2. **Two faces.** Tap **Pages**: the document appears as small pages with
   grey between them. Tap **Text**: plain text. Tap **Document**: back.
   The word for the face showing is underlined.
3. **Edit a paragraph.** Tap **Edit** (it becomes underlined). Tap a
   paragraph. The first time, the browser asks "Your name, to record with
   the changes you make": type it and confirm. A text box then opens over
   the paragraph, holding its text, with **Done** and **Cancel** under it.
   Change a word, tap **Done**. The paragraph is redrawn with your text and
   a grey italic line under the five words says "Changed, and recorded as
   change … by …". Tap **Edit** again to turn editing off.
4. **Save.** Tap **Save**. The grey italic line says "Made
   compose-edited.ufx.html: … bytes, holding state …" (or `…-edited-2…`).
   Note the first characters of the state. The browser should offer to
   download the file. There is no link to tap and no Share… button in this
   revision: if nothing is offered, say so (step 4b does not apply).
5. **Reopen the saved file.** Find the downloaded file and open it the
   same way you opened the first. It should show your edit. (To see its
   state, tap **Save** again: the line names the state, which should be the
   one you noted in step 4.) (If it opens only as the static face, check
   that the plain text there has your edit: it should.)
6. **Send it on.** Send the saved file to another device (AirDrop, Mail,
   Messages) and open it there. A computer's browser is the surest check:
   it should show your edit and the same State.

## Route 1: AirDrop from a Mac to the iPhone

1. On the Mac, select `compose.ufx.html` in Finder, Share → AirDrop → the
   iPhone.
2. On the iPhone, accept.

*Expectation:* iOS either asks which app to open the file with (a short
list that probably holds Files and any app that has said it opens web
pages, and probably does not hold Safari), or puts it in Files → Downloads
without asking. Write down exactly what the sheet offered. If it offers a
browser (Chrome, Firefox, Edge, or any other), try each one that is listed.

| Step | Result (passed / failed / not attempted) | What I saw |
| --- | --- | --- |
| 1 Opened | | |
| 2 Two faces | | |
| 3 Edit a paragraph | | |
| 4 Save | | |
| 5 Reopen the saved file | | |
| 6 Send it on | | |

## Route 2: from the Files app

1. Get the file into Files (AirDrop as above, or save it from Mail or
   Safari).
2. Tap it.

*Expectation:* Files shows a Quick Look preview, and Quick Look does not
run scripts in a web page. You should therefore see the **static face**:
the blue box, the title "The Quarterly Review", and the full text. If you
see the five words and the drawn document instead, scripts ran — say so,
it would be good news — and carry on with the steps.

Then try the share button (the square with an arrow) in the preview and in
the file's long-press menu, and write down every entry that might open the
file in a browser ("Open in Safari", "Open in Chrome", "Open with…", and
so on). *Expectation:* there is no "Open in Safari" for a web page stored
on the phone; other browsers installed on the phone may or may not offer
themselves. Try each that does.

| Step | Result (passed / failed / not attempted) | What I saw |
| --- | --- | --- |
| Static face shown in the preview (blue box, title, full text) | | |
| What the share sheet offered | | |
| 1 Opened (in anything that runs the reader) | | |
| 2 Two faces | | |
| 3 Edit a paragraph | | |
| 4 Save | | |
| 5 Reopen the saved file | | |
| 6 Send it on | | |

## Route 3: as a Mail attachment

1. On the Mac, mail `compose.ufx.html` to yourself as an attachment.
2. On the iPhone, open the message in Mail and tap the attachment.

*Expectation:* the same Quick Look preview as in Files: the static face.
Note whether Mail shows the attachment as an icon to tap or tries to show
the page inside the message, and whether the file arrived unchanged (its
size should be 155 993 bytes; a mail system that rewrites HTML attachments
would break it, and that would be worth knowing).

| Step | Result (passed / failed / not attempted) | What I saw |
| --- | --- | --- |
| Static face shown in the preview | | |
| What the share sheet offered | | |
| 1 Opened (in anything that runs the reader) | | |
| 2 Two faces | | |
| 3 Edit a paragraph | | |
| 4 Save | | |
| 5 Reopen the saved file | | |
| 6 Send it on | | |

## Route 4: as a Messages attachment

1. On the Mac, drag `compose.ufx.html` into a Messages conversation with
   yourself (or another phone).
2. On the iPhone, tap the attachment in the conversation.

*Expectation:* the same Quick Look preview: the static face.

| Step | Result (passed / failed / not attempted) | What I saw |
| --- | --- | --- |
| Static face shown in the preview | | |
| What the share sheet offered | | |
| 1 Opened (in anything that runs the reader) | | |
| 2 Two faces | | |
| 3 Edit a paragraph | | |
| 4 Save | | |
| 5 Reopen the saved file | | |
| 6 Send it on | | |

## Route 5: in Safari, from a hosted address

1. Put the three files of this folder where the placeholder address
   points (`index.html` lists the other two).
2. On the iPhone, open
   `https://nampara-ai.github.io/ufo/compose.ufx.html` in Safari.

*Expectation:* this is the route most likely to pass all six steps,
because here the file is an ordinary web page in a real browser. It needs
a Safari recent enough for the pieces the page uses — raw-DEFLATE
`DecompressionStream`, WebAssembly allowed by `'wasm-unsafe-eval'` in the
page's policy, module scripts, canvas text metrics — which is expected to
mean Safari 16.4 or later. On an older Safari the expectation is the
static face, with a red line in the blue box saying the browser could not
run the reader. Please note the iOS version.

Things that are open on this route, each an expectation:

- Step 3: tapping the paragraph should bring up the keyboard and scroll
  the box into view. The box sits under the paragraph, over the text that
  follows it. Say if the keyboard hides it or the page jumps.
- Step 4: Safari should ask "Do you want to download
  compose-edited.ufx.html?" and put it in Files → Downloads. If nothing
  happens on tapping Save, tap the link in the blue line. The **Share…**
  button should appear if Safari is willing to share an HTML file from a
  page; if it does, it opens the share sheet with the file (AirDrop, Mail,
  Messages, Save to Files).
- Step 5: the downloaded file is on the phone, so opening it from Files is
  Route 2 again: expect the static face, which should hold your edited
  text. To see it running, send it to a computer (step 6) or host it.
- Whether the file works with the phone in Airplane Mode once the page has
  loaded: it should, since it fetches nothing.

| Step | Result (passed / failed / not attempted) | What I saw |
| --- | --- | --- |
| 1 Opened | | |
| 2 Two faces | | |
| 3 Edit a paragraph | | |
| 4 Save (download) | | |
| 4b Share… button present, and what it offered | | |
| 5 Reopen the saved file | | |
| 6 Send it on | | |

iOS version: ________  Safari version if known: ________

## Android

Not tried on a real device either. The same five routes, with these
expectations.

**A. Received as a file** (Quick Share / Nearby Share from another device,
a USB copy, or downloaded from mail), then tapped in the Files app or the
Downloads list. *Expectation:* Android asks which app should open it, and
the list usually holds Chrome (and other installed browsers) and sometimes
an "HTML Viewer". In Chrome the page is expected to run — Chrome opens the
file through a `content://` address and runs its scripts — so all six
steps may pass. "HTML Viewer" is a bare system component and may show only
the static face or a broken page. Write down what was offered and what
each did.

**B. As a Gmail attachment.** *Expectation:* tapping it offers the same
"open with" list, or a built-in preview that shows the static face.

**C. As an attachment in Messages / WhatsApp / Signal.** *Expectation:*
most of these hand the file to the "open with" list; some refuse to send
or open `.html` files at all. Note any that refuse.

**D. In Chrome from the hosted address.** *Expectation:* all six steps
pass; Save downloads to Downloads; a **Share…** button appears and opens
the Android share sheet with the file.

**E. Reopening the saved file** from the Downloads list. *Expectation:* as
A.

| Route | Step | Result (passed / failed / not attempted) | What I saw |
| --- | --- | --- | --- |
| A file, tapped | What apps were offered | | |
| A | 1 Opened | | |
| A | 2 Two faces | | |
| A | 3 Edit a paragraph | | |
| A | 4 Save | | |
| A | 5 Reopen the saved file | | |
| A | 6 Send it on | | |
| B Gmail | 1 Opened / static face only | | |
| B | 2–6 | | |
| C Messages or other | 1 Opened / static face only | | |
| C | 2–6 | | |
| D hosted, Chrome | 1 Opened | | |
| D | 2 Two faces | | |
| D | 3 Edit a paragraph | | |
| D | 4 Save, and Share… | | |
| D | 5 Reopen the saved file | | |
| D | 6 Send it on | | |

Android version: ________  Browser and version: ________

## Checking a saved file on a computer

Open the file sent from the phone in any desktop browser. The grey line at
the bottom gives the State; it should be the one the phone showed after
the edit. `node spike/envelope/test.mjs` does this check, and others,
automatically for files saved by Chromium; a file saved by Safari has not
been through it.
