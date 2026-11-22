# Naming: candidates for the file-name ending and media type

**Status: a proposal for decision. Nothing here is chosen.**

The format is called UFO, the Universal File Object, and that name stays.
What is undecided is the file-name ending and the media type. The obvious
ending, `.ufo`, is in active use by the Unified Font Object format, so the
specification uses it only as a placeholder.

The research below was done by search and by reading mirrors of the
registries; several primary sources could not be fetched from the
environment it was done in, and the report says which. Treat it as
evidence gathered, not as clearance. The checks listed at the end should be
repeated against the live registries before a choice is made.

The specification's travel forms take the chosen ending before the
envelope's own: `<name>.<ending>.html`, `.mp4`, `.png`.

## How far this evidence goes

This sandbox blocked direct fetches of `fileinfo.com`, `filext.com`, `file-extensions.org`, `en.wikipedia.org`, `www.iana.org`, `data.iana.org` and `gitlab.freedesktop.org`. Nothing below comes from reading those pages directly.

What I actually used:

- **Extension catalogues and Wikipedia:** web-search summaries of the pages only (URLs cited inline). Treat these as second-hand.
- **IANA media types:** the mime-db mirror, which tags IANA-sourced entries: https://raw.githubusercontent.com/jshttp/mime-db/master/db.json and https://raw.githubusercontent.com/jshttp/mime-db/master/src/iana-types.json (2,215 IANA types). I could not date the snapshot.
- **Unregistered types:**
  - Apache `mime.types`: https://raw.githubusercontent.com/apache/httpd/trunk/docs/conf/mime.types
  - Apache Tika: https://raw.githubusercontent.com/apache/tika/main/tika-core/src/main/resources/org/apache/tika/mime/tika-mimetypes.xml
  - freedesktop shared-mime-info 2.4, via a Debian-derived mirror: https://raw.githubusercontent.com/pexip/os-shared-mime-info/trixie/data/freedesktop.org.xml.in
- **TLDs:** two mirrors, both sanity-checked with `uno` and `zip`: https://raw.githubusercontent.com/publicsuffix/list/main/public_suffix_list.dat and https://raw.githubusercontent.com/incognico/list-of-top-level-domains/master/tlds.csv
- **Real-world use:** GitHub code search, `extension:<ext>` hit counts (approximate).

Not verified at all: Apple UTI declarations, Windows registry associations, trademark registers (beyond one search hit), and the live IANA and Wikipedia pages.

## Results that apply to every candidate

- **TLD:** none of the candidates is a TLD in either mirror, so `report.<ext>` should not auto-link. The nearest TLDs are `.uno`, `.uol`, `.ups` and `.foo`.
- **IANA subtype:** no registered subtype is `ufo`, `vnd.ufo`, or `vnd.<candidate>` for any candidate. The only `vnd.u[fnov]*` names are `application/vnd.ufdl`, `application/vnd.unity`, `application/vnd.uoml+xml` and `video/vnd.uvvu.mp4`.
- **Unregistered types:** shared-mime-info, Tika and Apache have no glob for any candidate except `.uni`.

## Per-candidate findings

| Ext | Existing uses found | GitHub hits | Other hazards |
|---|---|---|---|
| `.ufo` | Unified Font Object (active; spec at https://unifiedfontobject.org/, zipped form is `.ufoz` per https://en.wikipedia.org/wiki/Unified_Font_Object). Also Ulead PhotoImpact objects, Ellisys Visual USB, Total Annihilation units, SATURN traffic data (https://fileinfo.com/extension/ufo, https://www.file-extensions.org/extension/ufo, https://file.org/extension/ufo). | not run | Heavily taken. On macOS a `.ufo` is a package directory, so font tools would claim it. |
| `.ufob` | None found in any search or database. | 0 | Shares a prefix with `.ufo`/`.ufoz`; reads as "fob". |
| `.ufobj` | None found. | 0 | Five letters; "obj" suggests Wavefront or compiler objects. |
| `.ufx` | Ultimate 3D game-engine material files (https://www.file-extensions.org/extension/ufx, https://file.org/extension/ufx). | 6 (shader effects, diagrams) | "UFX" is also a product name (RME audio interfaces, from my own knowledge, not checked). |
| `.uvo` | Sanyo Katana DLX voice memos, 2007, dead (https://www.file-extensions.org/extension/uvo). | 1 | "UVO" is Kia's infotainment brand (my own knowledge, not checked). |
| `.unv` | SDRC/I-DEAS Universal File Format, still used in CAE (https://en.wikipedia.org/wiki/Universal_File_Format, https://victorsndvg.github.io/FEconv/formats/unv.xhtml). Also SAP BusinessObjects Universe and Forecast Pro (https://file.org/extension/unv). | 3,432 | A direct clash: an existing "universal file" format. |
| `.uo` | mime-db lists `uo` as an extension of IANA-registered `application/vnd.uoml+xml`. Also Moscow ML/HOL4 compiled objects seen in the GitHub hits. | 16 | Two letters; too short to search for. |
| `.uni` | Ultra Tracker/MikMod modules (https://fileinfo.com/extension/uni), with a shared-mime-info glob `*.uni` under the tracker-module type. EDK II/UEFI string files, very active (https://tianocore-docs.github.io/edk2-UniSpecification/draft/1_introduction.html). Forecast Pro. | 103,296 | Common word ("uni" for university). |
| `.univ` | No catalogue entry found. | 207 (ad-hoc data, `Makefile.univ`) | Reads as "university". |
| `.ufoo` | None found. | 0 | Looks like a typo of `.ufo`; contains "foo". |
| `.ufile` | A weak file.org entry tied to UFile, the Canadian tax software (https://file.org/extension/ufile). | 2 | "UFile" is a commercial product name. |
| `.uobj` (mine) | No catalogue entry (search of https://fileinfo.com/list/u found none). | 29, all the legacy Franz Lisp `Make.uobj` | Echoes Unreal Engine's `UObject` class name, which is not a file type. |
| `.unifo` (mine) | None found. | 0 | A "UNIFO" US trademark exists for online software: Unifo Company Co., serial 88033233, status not checked (https://trademark.justia.com/owners/unifo-company-co-ltd-3882742). Close to `.unif`, the NES ROM format. |

I also considered `.ufoz`, `.ufd`, `.uvf` and `.uvx` and dropped them:

- `.ufoz` is the zipped Unified Font Object.
- `.ufd` is `application/vnd.ufdl` and Cellebrite dumps.
- `.uvf` and `.uvx` are IANA DECE types.

`.ufoc` and `.ufod` came back clean (0 GitHub hits, no search results) but add nothing over `.ufob`.

## Ranked shortlist

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

## Before the owner decides

Someone with open network access should re-check the top choices against:

- the live IANA registry: https://www.iana.org/assignments/media-types/media-types.xhtml
- the live TLD list: https://data.iana.org/TLD/tlds-alpha-by-domain.txt
- fileinfo, filext and Wikipedia's extension lists, read directly
- Apple UTI declarations and Windows associations
- a trademark register (USPTO/EUIPO), especially for `unifo`
