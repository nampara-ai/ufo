# Phone test of the web envelope

**None of this has been tried on a real device, and no screen reader has
been run.** The files here were made and tested only in headless browsers
on Linux, driven by Playwright: Chromium, Firefox, and Playwright's build
of WebKit (the nearest thing to Safari that runs here; it is not Safari,
not iOS and not macOS), at desktop size and at phone sizes with touch
events. Every line below marked *Expectation* is a guess from how these
systems are known to behave, written down so that it can be proved wrong.
Please record what actually happens.

## The files

| File | What it is |
| --- | --- |
| `compose.ufx.html` | the test document (*The Quarterly Review*) as exported: 225 235 bytes. Its pack carries the tools (the words at the top and everything they do) as a universe nested in it |
| `compose-edited.ufx.html` | the same after edits by "Ada Tester", saved by the page itself in the test run with "For people working on this" chosen: everything, with its working history: 263 700 bytes |
| `compose-published.ufx.html` | the same state, saved with "For readers" chosen: the document and who made it, with the working history withheld: 203 984 bytes |
| `index.html` | a plain page linking them, for hosting (it asks search engines not to index it) |

Hosted address used below (a placeholder until the files are put there):
`https://nampara-ai.github.io/ufo/compose.ufx.html`

## What "working" looks like

When the file's reader is running you see a row of five words at the top
— **Document  Pages  Text  Edit  Save** — a line under them that begins
"State c:…", and the document drawn below. The words and the line stay at
the top while the document scrolls. Everything is drawn by the reader in
the file.

When it is not running you see the **static face**: a blue box that begins
"This is a UFO file: a document that carries its own reader. You are seeing
its text only…", then the document as headings, paragraphs and lists. That
is the intended fallback, not a failure of the file; but it does mean that
route cannot do steps 2 to 6.

## The six steps

1. **Opened.** The five words, the "State c:…" line and the drawn document
   appear. (If you see the blue box instead, write "static face only".)
2. **Two faces.** Tap **Pages**: the document appears as pages with grey
   between them. Tap **Text**: plain text. Tap **Document**: back. The word
   for the face showing is underlined.
3. **Edit a paragraph.** Tap **Edit** (it becomes underlined). The line
   under the words now says "To change the text, first give your name:
   press the line below", and below it is a grey line "Your name, to record
   with the changes you make". Tap that grey line: a text box opens at the
   top, with **Done** and **Cancel**. Type your name, tap **Done**: the
   line now shows your name, and the line above says "Changes will be
   recorded as made by …". No browser dialog should appear at any point;
   if one does, write down what it said. Now tap a paragraph: the same
   text box opens holding the paragraph's text, and the paragraph is
   ringed in blue. Change a word, tap **Done**. The paragraph is redrawn
   with your text and the lines at the top say "Changed, and recorded as
   change o:… by …. Not yet in a file." Tap **Edit** again to turn editing
   off.
4. **Save.** Tap **Save**. Nothing is downloaded yet: a panel opens under
   the words, headed "What will leave, if you save a copy". It says how
   large the document is, who and what made it (names, how many changes,
   from when to when) and whether the working history (every operation and
   earlier draft) is included. Under it are two choices, **For people
   working on this** and **For readers**; **For readers** is underlined at
   first, and the panel then says the working history is "withheld". Tap
   the other and the panel says "included" and the name of the copy
   changes. Choose one and tap **Save this copy** (or **Cancel**). The
   browser should offer to download `compose-published.ufx.html` (for
   readers) or `compose-edited.ufx.html` (for people working on this), and
   the lines at the top say "Saved as …: … bytes, holding state …". After
   a copy for readers they add that everything is still held in the page.
   Note the first characters of the state.
5. **Reopen the saved file.** Find the downloaded file and open it the
   same way you opened the first. It should show your edit, and the "State
   c:…" line should begin with the same eight characters. (If it opens
   only as the static face, check that the text there has your edit: it
   should.)
6. **Send it on.** Send the saved file to another device (AirDrop, Mail,
   Messages) and open it there. A computer's browser is the surest check:
   it should show your edit and the same State.

On a small phone the panel of step 4 may be taller than the screen. The
part held at the top then scrolls within itself: drag inside it to reach
**Save this copy**. *Expectation:* this works; say if the panel's lower
part cannot be reached.

## With a keyboard (a computer, or a keyboard attached to a tablet)

*Expectation:* Tab moves through the five words in order, each ringed in
blue when it has the focus; Enter or Space presses the one in focus. With
**Edit** on, Tab reaches the line for your name and then each paragraph;
Enter opens the text box, in which you type; Tab moves to **Done**, Enter
presses it, and the focus goes back to where it was. With the Save panel
open, Tab goes on from **Save** to the two choices, **Save this copy** and
**Cancel**. After **Save this copy** the panel is gone and so is the focus:
Tab starts again from the top.

**Safari on a Mac moves the focus with Tab only to text boxes unless told
otherwise.** Turn on Safari → Settings → Advanced → "Press Tab to highlight
each item on a webpage". If it is off, Option-Tab does what Tab does when
it is on. (In System Settings → Keyboard, "Keyboard navigation" is a
different switch, for the system's own controls.) Please say which way you
had it.

| Step, keyboard only | Result (passed / failed / not attempted) | What I saw |
| --- | --- | --- |
| Tab reaches Document, Pages, Text, Edit, Save, each ringed | | |
| Enter on Edit; Tab to the name line; Enter; type; Tab to Done; Enter | | |
| Tab to a paragraph; Enter; type; Done; the focus returns to the paragraph | | |
| Save: Enter; Tab to a choice, Enter; Tab to Save this copy, Enter: a download | | |

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
the page inside the message, and whether the file arrived unchanged (its size should be 225 235 bytes; a mail system that rewrites HTML attachments
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

1. Put the files of this folder where the placeholder address
   points (`index.html` lists the others).
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
- Step 4: after **Save this copy**, Safari should ask "Do you want to
  download compose-published.ufx.html?" (or `compose-edited…`) and put it
  in Files → Downloads. There is no link and no Share… button: if nothing
  is offered, say so.
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
pass; **Save this copy** downloads to Downloads. (There is no Share…
button in this revision.) *Expectation, TalkBack:* with TalkBack on
(Settings → Accessibility → TalkBack, or hold both volume keys for three
seconds where that shortcut is set), the same things should be spoken as
the VoiceOver section below describes, and dragging a finger over the
page should speak what is drawn under it. Not tried.

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
| D | 4 Save | | |
| D | TalkBack: reads in order; speaks what is under the finger | | |
| D | 5 Reopen the saved file | | |
| D | 6 Send it on | | |

Android version: ________  Browser and version: ________

## Checking a saved file on a computer

Open the file sent from the phone in any desktop browser. The line under
the five words gives the State; it should begin as the one the phone
showed after the edit. `node spike/envelope/test.mjs` does this check, and
others, automatically for files saved by headless Chromium, Firefox and
Playwright's WebKit; a file saved by Safari, or by any browser on a phone,
has not been through it.

## VoiceOver, on an iPhone and on a Mac

Nothing in this section has been tried. What a screen reader is given was
checked only through the browsers' own role queries in the headless
engines; no screen reader was run. Each "should" below is an expectation.

How it is built, so that what is heard can be compared: the document is
drawn on a canvas, which is hidden from a screen reader. Over the canvas,
in the same places, lie invisible elements, one for each thing drawn: the
toolbar and its five buttons; a status holding the "State c:…" lines; the
document, with its headings, paragraphs, lists and items, quotation and
code. Each lies exactly over what is drawn for it.

**Turning VoiceOver on and off.**

- iPhone: Settings → Accessibility → VoiceOver. Or ask Siri: "Turn on
  VoiceOver" / "Turn off VoiceOver". Or set Settings → Accessibility →
  Accessibility Shortcut to VoiceOver, and then triple-click the side
  button (the Home button on a phone that has one) to turn it on and off.
  With VoiceOver on, a single tap selects and speaks, a double tap
  anywhere presses what is selected, a swipe right or left moves to the
  next or previous thing, and three fingers scroll.
- Mac: Command-F5 turns it on and off (on a keyboard with Touch ID, hold
  Command and press Touch ID three times quickly). "VO" below means
  Control and Option held together.

Open the file by Route 5 (Safari, from a hosted address) on the iPhone,
and in Safari from a file or an address on the Mac.

A double tap with VoiceOver on is expected to reach the page as a click on
the element VoiceOver has selected, with no touch before it; the page
takes such a click as a press on that element. If VoiceOver instead sends
a touch at the middle of the element, the page takes that as a press at
that point, which is the same thing. If a double tap does nothing, or
presses something else, that is the most useful thing to write down.

**The steps, and what should be heard** (each an expectation):

1. *Reading continuously.* iPhone: swipe down with two fingers ("read from
   here"), or up with two fingers ("read from the top"). Mac: VO-A. Should
   be heard: "Tools, toolbar", the five buttons — "Document, current
   page" (or "selected"; how `aria-current` is spoken is not known),
   "Pages", "Text", "Edit" as a toggle that is off, "Save" — then "State
   c:… after 1 changes" (it may say "State, status"), then "The document
   these tools work on" (a document, or a group), "The Quarterly Review,
   heading level 1", and each paragraph and list item in order, "Method,
   heading level 2" among them. The page should scroll as the reading
   moves down; **this is not expected to work fully**: VoiceOver's own
   cursor does not move the keyboard focus, and only the keyboard focus
   makes the page scroll what is drawn into view.
2. *By headings.* iPhone: turn two fingers on the screen as if turning a
   dial until "Headings" is heard, then swipe down or up to go to the next
   or previous heading. Mac: VO-Command-H for the next heading (add Shift
   for the previous), or VO-U for the rotor, the left and right arrows to
   the Headings list. Should be heard: "The Quarterly Review, heading
   level 1", "Method, heading level 2".
3. *Touch exploration (iPhone).* Put a finger on the page and drag it
   slowly over the drawn document. Should be heard: what is drawn under
   the finger — the heading when the finger is on the title, each
   paragraph as the finger enters it, "Edit, button" on the word Edit.
   This is what the invisible elements were placed for. Say for each thing
   whether what was spoken was what was under the finger, something else,
   or nothing; and whether VoiceOver's black rectangle sat on the thing
   drawn. (On the Mac the nearest equivalent is moving the pointer with
   "speak items under the pointer" on, in VoiceOver Utility → Speech; or
   the trackpad commander.)
4. *Edit.* Find "Edit" (swipe to it, or touch it) and double-tap; on the
   Mac, VO-Space. Should be heard: "Edit, selected" or "on" (a toggle now
   on), and — it is a status — the new lines: "To change the text, first
   give your name: press the line below." Whether a status that changes
   is spoken without being asked for is not known. Move on to "Your name,
   to record with the changes you make" (should be announced as a text
   field) and double-tap: a text box opens and has the focus; it should be
   announced as "The text being changed, text field" with the keyboard
   showing. Type the name, find "Done, button", double-tap.
5. *Choose a paragraph, type, Done.* Swipe to a paragraph of the document
   and double-tap. Should be heard: "The text being changed, text field",
   holding the paragraph's text. Change it (on the iPhone, typing and the
   rotor's Characters and Words to move the insertion point), find "Done",
   double-tap. Should be heard afterwards, from the status: "Changed, and
   recorded as change o:… by …. Not yet in a file."
6. *Save, and what will travel.* Find "Save", double-tap. Should be heard:
   "Save" as on, and a region "What will leave" that can be read through:
   "What will leave, if you save a copy", "The document: … objects, …
   bytes. It always travels.", "Who and what made it: … changes, from … to
   … UTC…", the names, "It names no model.", "Working history (every
   operation, and every earlier draft): withheld. Its … bytes stay
   here…", "The copy will be named …". Then two buttons: "For people
   working on this" and "For readers, current" (the one chosen). Double-tap
   the other: it should now be the one announced as current, and the
   working-history line should read "included". Then "Save this copy,
   button": double-tap. Should happen: the browser's download prompt; and
   from the status, "Saved as …".

**Record what was heard and done.** One row a step, one column a device.
In each cell: worked / failed / not attempted, and what was announced.

| Step | iPhone (iOS ____, Safari) | Mac (macOS ____, Safari ____) |
| --- | --- | --- |
| VoiceOver turned on (which way) | | |
| 1 Reads continuously, in order, from the toolbar to the end | | |
| 1 The page scrolls as the reading moves down | | |
| 1 How the toolbar's buttons were announced (current, on/off) | | |
| 2 By headings: both found, with their levels | | |
| 3 Touch exploration: speaks what is drawn under the finger | | |
| 3 The VoiceOver rectangle sits on the thing drawn | | |
| 4 Edit operated; how its state was announced | | |
| 4 The status lines were spoken when they changed | | |
| 4 The name line: announced as a text field; opened; name typed; Done | | |
| 5 A paragraph chosen; the edit box's label announced; typed; Done | | |
| 6 Save opened; the panel read through, with its figures | | |
| 6 The two choices: which was announced as chosen; the other chosen | | |
| 6 Save this copy: a download; the status spoken | | |
| VoiceOver turned off (which way) | | |

Also worth trying, on the Mac, with VoiceOver off: the keyboard steps of
the section above, with Safari's Tab setting each way.
