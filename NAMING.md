# Naming: candidates for the file-name ending and media type

**Status: a proposal for decision. Nothing here is chosen. The choice is the
project owner's.**

The format is called UFO, the Universal File Object, and that name stays.
What is undecided is the file-name ending and the media type. The obvious
ending, `.ufo`, is in active use by the Unified Font Object format and
several others, so the specification uses it only as a placeholder.

The specification's travel forms take the chosen ending before the
envelope's own: `<name>.<ending>.html`, `.mp4`, `.png`.

This document has two parts: the candidates, and the collision checks made
against live primary sources on 2026-11-22.

## Candidates

Ranked by an earlier survey; the ranking is advice, not a decision. One correction from the live checks below: `.ufx` has an entry in only one of the three catalogues.

The media types below are in the vendor tree. The standards tree needs an IETF or recognised standards-body specification, which I do not think is justified yet. IANA convention prefers a producer-qualified name such as `application/vnd.<project>.<ext>`; the bare forms below are the shortest that are free in the mirror. The travel form is still served as `text/html`, and the envelopes as `video/mp4` and `image/png`.

1. **`.ufob`** — `application/vnd.ufob`; envelopes `.ufob.html`, `.ufob.mp4`, `.ufob.png`.
   - For: zero hits in every source checked, four letters, keeps "UFO" visible ("UFO Binary/Object").
   - Against: differs from `.ufo`/`.ufoz` by one letter, so mistyping and font-tool confusion remain possible; as a "binary" suffix it sits oddly on `.ufob.html`.
   - Verdict: cleanest namespace, closest to the brand.

2. **`.uobj`** — `application/vnd.uobj`; envelopes `.uobj.html`, `.uobj.mp4`, `.uobj.png`.
   - For: no catalogue or MIME entry; no visual overlap with the font format; reads as "universal object" in both forms.
   - Against: 29 legacy `Make.uobj` files; the Unreal `UObject` echo; drops the "F".
   - Verdict: best if distance from the font format matters more than keeping "UFO".

3. **`.unifo`** — `application/vnd.unifo`; envelopes `.unifo.html`, `.unifo.mp4`, `.unifo.png`.
   - For: zero hits; pronounceable; a clear acronym of UNIversal File Object.
   - Against: five letters; the UNIFO trademark in a software class needs a legal check; close to `.unif`.
   - Verdict: distinctive, but only after trademark clearance.

4. **`.ufobj`** — `application/vnd.ufobj`; envelopes `.ufobj.html`, `.ufobj.mp4`, `.ufobj.png`.
   - For: zero hits; self-explanatory.
   - Against: longest; awkward to say; "obj" connotations; same `.ufo` prefix issue as `.ufob`.
   - Verdict: safe but clumsy.

5. **`.ufx`** — `application/vnd.ufx`; envelopes `.ufx.html`, `.ufx.mp4`, `.ufx.png`.
   - For: three letters; existing uses are obscure.
   - Against: it does have catalogue entries (Ultimate 3D) and scattered real files; "fx" implies effects.
   - Verdict: acceptable only if a three-letter extension is essential.

**Not shortlisted**

- `.ufo`: actively used by the font format.
- `.uni`: UEFI and tracker modules, with a shared-mime-info glob.
- `.unv`: an existing "Universal File Format".
- `.uo`: bound to an IANA type in mime-db, and two letters.
- `.uvo`: brand name plus a legacy format.
- `.univ`: reads as "university" and has ad-hoc uses.
- `.ufile`: product name.
- `.ufoo`: clean, but looks like a typo.

## Live collision checks, 2026-11-22

All fetches were made with `curl -sL` and a generic User-Agent on **2026-11-22, 03:53–03:56 UTC** (`date -u`: `Sun Nov 22 03:53:35 UTC 2026`). No files in the project were modified; downloads are in the session scratchpad only.

### (a) Sources checked

| Source | Exact URL(s) | HTTP | Source's own date stamp | Checked (UTC) |
|---|---|---|---|---|
| IANA media types, per-tree CSVs | `https://www.iana.org/assignments/media-types/{application,text,image,video,audio,model,font,message,multipart,haptics}.csv` | 200 for all ten (`example.csv` 404) | `last-modified: Wed, 18 Nov 2026 20:51:23 GMT` (application.csv) | 2026-11-22 |
| IANA registry index | `https://www.iana.org/assignments/media-types/media-types.xhtml` and `.xml` | 200 / 200 | "Last Updated 2026-11-18" (`<updated>2026-11-18`) | 2026-11-22 |
| IANA TLD list | `https://data.iana.org/TLD/tlds-alpha-by-domain.txt` | 200 | `# Version 2026112100, Last Updated Sat Nov 21 07:07:01 2026 UTC` | 2026-11-22 |
| FileInfo | `https://fileinfo.com/extension/<ext>` | ufo 200; ufob, uobj, unifo, ufobj, ufx 404 | ufo entries: "Updated: March 22, 2022" (Ulead), "Updated: February 13, 2018" (Unified Font Object) | 2026-11-22 |
| file-extensions.org | `https://www.file-extensions.org/extension/<ext>` and `https://www.file-extensions.org/<ext>-file-extension` (the latter redirects to the former when an entry exists) | ufo 200, ufx 200; ufob, uobj, unifo, ufobj 404 on both URL forms | Per entry, see table (b) | 2026-11-22 |
| FILExt | `https://filext.com/file-extension/<EXT>` | UFO 200; UFOB, UOBJ, UNIFO, UFOBJ, UFX 404 | None shown | 2026-11-22 |
| Wikipedia lists | `https://en.wikipedia.org/w/index.php?title=<page>&action=raw` for `List_of_filename_extensions` (now a redirect to "Lists of filename extensions"), the sub-pages (0–9), (A–E), (F–L), (M–R), (S–Z), and `List_of_file_formats` | 200 for all | Latest edits: (S–Z) 09:21, 21 November 2026; List of file formats 22:34, 21 November 2026 | 2026-11-22 |
| Wikipedia, Unified Font Object | `https://en.wikipedia.org/w/index.php?title=Unified_Font_Object&action=raw` | 200 | Latest edit 22:07, 8 November 2026 | 2026-11-22 |
| freedesktop shared-mime-info | `https://gitlab.freedesktop.org/xdg/shared-mime-info/-/raw/master/data/freedesktop.org.xml.in` | 200, but the body was a bot-challenge page ("Making sure you're not a bot!"), not the file; the GitLab API raw URL gave the same | n/a | 2026-11-22 |
| freedesktop shared-mime-info (workaround) | `git clone --depth 1 https://gitlab.freedesktop.org/xdg/shared-mime-info.git`, file `data/freedesktop.org.xml.in` | clone succeeded | HEAD `1f8113a2`, commit date 2026-11-09T14:39:54+00:00 | 2026-11-22 |
| Apache httpd mime.types | `https://raw.githubusercontent.com/apache/httpd/trunk/docs/conf/mime.types` | 200 | None in the file or headers | 2026-11-22 |
| Apache Tika | `https://raw.githubusercontent.com/apache/tika/main/tika-core/src/main/resources/org/apache/tika/mime/tika-mimetypes.xml` | 200 | None | 2026-11-22 |

### (b) Per-candidate findings

| Source | ufo | ufob | uobj | unifo | ufobj | ufx |
|---|---|---|---|---|---|---|
| IANA media types (all ten trees) | No match | No match | No match | No match | No match | No match |
| IANA TLD list | Absent | Absent | Absent | Absent | Absent | Absent |
| FileInfo | **Entry.** Title "UFO File - What is a .ufo file and how do I open it?"; "2 file types use the .ufo file extension": Ulead File Object (developer Ulead) and Unified Font Object File | 404, "File Extension Not Found" | 404, same | 404, same | 404, same | 404, "The extension ".UFX" was not found." |
| file-extensions.org | **Entry, five formats** (below) | 404, "Not Found" | 404, same | 404, same | 404, same | **Entry.** Title "UFX file: How to open? The best software for opening ufx files"; "Files with ufx file extension are associated with the Ultimate 3D game engine material data format." Date updated: August 9, 2019 |
| FILExt | **Entry.** Title "UFO File Extension - What is it? How to open a UFO file?"; "The UFO file type is primarily associated with Udemy" | 404, "404 - File not found" | 404, same | 404, same | 404, same | 404, ""UFX" did not return any results in the FILEXT.com database" |
| Wikipedia filename-extension lists | Not listed | Not listed | Not listed | Not listed | Not listed | Not listed |
| Wikipedia, List of file formats | "UFO – Unified Font Object is a cross-platform, cross-application, human readable, future proof format for storing font data." | Not listed | Not listed | Not listed | Not listed | Not listed |
| Wikipedia, Unified Font Object | Infobox: "extension = .ufo, .ufoz"; the `mime` field is empty | – | – | – | – | – |
| shared-mime-info (git HEAD) | No glob | No glob | No glob | No glob | No glob | No glob |
| Apache httpd mime.types | Absent | Absent | Absent | Absent | Absent | Absent |
| Apache Tika | Absent | Absent | Absent | Absent | Absent | Absent |

**IANA near-matches.** The only subtypes starting `vnd.uf`, `vnd.uo` or `vnd.unif` are `application/vnd.ufdl` [Dave_Manning] and `application/vnd.uoml+xml` [Arne_Gerdes], both in application.csv. Nothing starts with `ufo` or `vnd.ufo`. The alphabetically adjacent `application/vnd.unity` and `application/vnd.umajin` do not match any requested prefix.

**TLD near-matches.** The nearest entries are UNICOM, UNIVERSITY, UNO and UOL.

**Near-miss globs in the MIME databases.**
- shared-mime-info has `*.unif` (beside `*.unf`) and `*.ufraw`.
- Apache httpd maps `application/vnd.ufdl` to `ufd ufdl` and `application/vnd.uoml+xml` to `uoml`.
- Tika has `*.ufd`, `*.ufdl` and `*.uoml`.

**Wikipedia near-misses.** The "U" section of the (S–Z) list includes UOS, UOT, UNV, UNX, UMP, UPD, UPS, URL, USDZ, UST, USTX and UXF. None of the six candidates appears.

**file-extensions.org, the five .ufo formats:**
1. Ulead PhotoImpact object — "Record marked as obsolete"; updated August 1, 2019; signature `D0 CF 11 E0 A1 B1 1A E1 00`.
2. Ellisys Visual USB data file — updated July 14, 2025.
3. SATURN Suite file (traffic network analysis) — updated November 15, 2026.
4. Total Annihilation third-party unit data — updated July 11, 2024.
5. Unified font object — updated January 7, 2019; suggested software FontForge.

**Software currently claiming each extension**
- **.ufo, FileInfo:** Corel PhotoImpact, Ulead Photo Explorer and Binary Soft UniView (Ulead format); FontForge on Windows, Mac and Linux, plus Glyphs and RoboFont on Mac (font format). FileInfo notes "Ulead was acquired by Corel, and PhotoImpact is now discontinued."
- **.ufo, FILExt:** Udemy ("Udemy video file", with example names `WebHD_720p.mp4.ufo`), Ellisys Visual USB, PhotoImpact ("UFO = Ulead File for Objects") and Total Annihilation (Cavedog; HPIView, Dragon UnPACKer). FILExt states "50% of all UFO files" begin with "UUU" and "45%" are Microsoft Compound File.
- **.ufo, Wikipedia software table:** Area51, FontCreator, FontForge, FontLab, Fontra, Glyphs, KalliCulator, Metapolator, MetricsMachine, Prepolator, RoboFont, RoundingUFO, Superpolator, TruFont and UFOStretch. The article also says "UFO 4" is "currently in the concept phase".
- **.ufx, file-extensions.org:** Ultimate 3D ("A free 3D engine for computer games") and GameMaker, on Microsoft Windows.
- **.ufob, .uobj, .unifo, .ufobj:** no source names any software.

### (c) Could not be checked

- **freedesktop raw URL.** The prescribed URL and the GitLab API raw endpoint both returned HTTP 200 with a bot-challenge page instead of the file. I did not do the 60-second wait and retry, because a shallow git clone from the same host succeeded and gave the same file at master HEAD.
- **Wikipedia API.** `api.php` replied "You are making too many requests to the API." Edit dates were taken from the `action=history` pages instead.
- **Apple UTI declarations and Windows registry / ProgID associations.** None of the sources states them and they cannot be queried from here. The Wikipedia article says only that a UFO "is a package; a file system directory that presents as a single file on macOS".
- **Out of scope as specified.** Not checked: the IANA provisional or pending registrations list, PRONOM, the Linux `file` magic database, GitHub Linguist, app-store listings and general web usage.
- **Catalogue 404s.** A 404 shows only that the catalogue has no entry; it does not show the extension is unused in the wild.
- **Dates.** FILExt, Apache httpd and Tika expose no date stamp.

### (d) Differences from the earlier second-hand findings

- **Confirmed:** .ufo is taken by Unified Font Object and Ulead PhotoImpact.
- **Confirmed:** .ufob, .uobj, .unifo and .ufobj have no entry in any of the three catalogues, on Wikipedia or in any MIME database.
- **Confirmed:** no IANA subtype matches, and none of the six is a TLD.
- **More detail on .ufo "others":** the live pages name Ellisys Visual USB data, SATURN Suite (entry updated November 15, 2026, so actively maintained), Total Annihilation unit data, and, per FILExt, Udemy video files as the "primary" association.
- **Narrower for .ufx:** the Ultimate 3D entry exists on only one of the three catalogues (file-extensions.org, last updated 2019). FileInfo and FILExt both return 404 for .ufx, so "has catalogue entries" overstates it.
- **New:** .ufoz is also claimed by Unified Font Object (Wikipedia infobox).
- **New:** Unified Font Object has no registered media type (IANA has no match; the Wikipedia `mime` field is empty), so `application/vnd.ufo` is unregistered even though the extension is occupied.
- **New near-neighbours:** `application/vnd.ufdl` (.ufd, .ufdl), `application/vnd.uoml+xml` (.uoml) and the shared-mime-info glob `*.unif` are close to the candidates but not identical.

## Still to do before a choice is final

- Apple Uniform Type Identifier declarations and Windows file associations
  for the chosen ending, which no source above states.
- A trademark search (USPTO, EUIPO) for the chosen name, `unifo` in
  particular.
- IANA's provisional registrations, PRONOM, and the `file` magic database.
- Registration of the media type in the vendor tree once chosen.
