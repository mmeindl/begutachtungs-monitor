# API exploration: Parliament JSON API & RIS OGD `Begut`

**As of 2026-08-15.** All requests were executed live and subsequently
re-verified independently by a second pass. Every `curl` here is copy-paste-ready.

**Overall verdict:** both APIs fully carry stage 1. No auth, open CORS,
JSON everywhere. The biggest positive surprise: Parliament maintains a dedicated
Begutachtung list (filter list 81) with a server-computed "deadline running" flag
and statement counts right in the row. The accountability chain
ME → RV → BGBl is machine-traversable.

---

## 1. Parliament filter API

```
POST https://www.parlament.gv.at/Filter/api/filter/data/{listeId}
Content-Type: application/json
```

- **No auth, no cookies, CORS `access-control-allow-origin: *`** — usable directly from the browser.
- **Body** = filter dimensions as `{"FELD":["wert",...]}`. Multiple keys are AND-combined, values within an array OR-combined. `{}` matches everything.
- **Query params:** `pagesize=N`, `page=N` (1-based), `sortrnr=<header-rnr>`, `ascDesc=ASC|DESC`. `showAll=true` returns all matches in one response — **but only when `pagesize` is absent** (an explicit `pagesize` always wins). Default without either: 20 rows. `js=eval` is optional (identical response without it).
- **Response:** `{pages, count, lastSync, header:[...], rows:[[...]]}`. Rows are **positional arrays**; column meaning comes from the `header` array (rnr N = array index N−1), indices differ per list.

### ⚠️ The two most dangerous properties

1. **Unknown filter keys are silently ignored** — a typo returns the unfiltered full dataset, not an error. Always cross-check via `count` that the filter took effect.
2. **Unknown filter values silently return `count=0`** — zero can mean "wrong list/wrong value", not "no data".

Also: without `sortrnr` the order is not deterministic — paginating without sorting risks duplicates/gaps. On list 81 always `sortrnr=11&ascDesc=DESC`.

### List 81 — Ministerialentwürfe (THE Begutachtung list)

Found via the SSR configuration of the website itself: `/recherchieren/gegenstaende/ministerialentwuerfe?json=True` → `{bez:"ME_81", listeId:81}`. This `?json=True` trick works on every list page of the website and is the way to discover further list IDs.

**All currently open consultations** (on 2026-08-15: 8 of them):

```bash
curl -s -X POST "https://www.parlament.gv.at/Filter/api/filter/data/81?js=eval&showAll=true&sortrnr=11&ascDesc=DESC" \
  -H "Content-Type: application/json" -d '{"AKTIV":["J"]}'
```

`AKTIV` (J/N) is **computed server-side from the deadline** — no client-side date arithmetic needed.

Confirmed filter keys: `GP_CODE` (e.g. `["XXVIII"]`), `AKTIV`, `MIN` (ministry short code, e.g. `["BMJ"]`). Presumably the complete set per header `feld_name`: additionally `ITYP`, `INR`, `DOKTYP` (untested).

**Row format (18 elements, 0-based):**

| Index | Content | Example (133/ME) |
|---|---|---|
| 0 | GP_CODE | `"XXVIII"` |
| 1 | ITYP | `"ME"` |
| 2 | INR | `133` |
| 3 | Arrival (display) | `"03.08.2026"` |
| 4 | Subject | … |
| 5 | Citation | `"133/ME"` |
| 6 | Ministry short code | `"BMF"` |
| 7 | Detail path | `"/gegenstand/XXVIII/ME/133"` |
| 8 | **Frist** (end of Begutachtung, display) | `"24.08.2026"` |
| 9 | Doktyp | `"MEG"` |
| 10 | Datesort (ISO) | — |
| 11 | **AKTIV** | `"J"` / `"N"` |
| 12 | "Engagement" (meaning unclear, 0 everywhere) | `0` |
| 13 | **Statement count** | `450` (126/ME) |
| 14 | Fristsort (`yyyymmdd`) | `20260824` |
| 15 | sortinr | — |
| 16 | Ministry (full name) | — |
| 17 | wentry_id | — |

Always parse date fields from `Datesort`/`Fristsort`, never from the `dd.mm.yyyy` display strings.

**History:** 4,204 MEs in total, back to GP XIV (oldest: 1/ME, arrived 1979-01-05). GP XXVIII: 132 MEs (as of 2026-08-15); front-runners by volume: 88/ME 707 SN, 44/ME 616, 32/ME 572, 126/ME 450.

The list configuration names export formats `json`, `rss`, `csv` — **RSS could be a cheap change feed** (export URL scheme not yet explored).

### Detail JSON of an item

```bash
curl -s "https://www.parlament.gv.at/gegenstand/XXVIII/ME/88?json=True"
```

Works on every `/gegenstand/{GP}/{ITYP}/{INR}` (also `?json=true`). Payload under `.content`:

- **The Begutachtung deadline is NOT structured here** — it only exists as German prose in `.content.stages[].text` ("Ende der Begutachtungsfrist 08.04.2026"). Structured deadline ⇒ list 81 (index 8/14).
- **Ministry:** `.content.names[]` with `funktext: "Übermittelt von"` (minister + `ltext` = ministry).
- **Draft documents:** `.content.documents[]` — Kurzinformation, Begleitschreiben, Gesetzestext, Vorblatt/WFA, Erläuterungen, Textgegenüberstellung. **Gesetzestext and Erläuterungen exist as PDF and HTML**, the rest PDF only. Links are site-relative.
- **Process history:** `.content.stages[]` — arrival → deadline end → transmission → "Regierungsvorlage (`<a href="/gegenstand/XXVIII/I/474">474 d.B.</a>`)". The RV link is an href inside HTML text (regex-parseable).
- **Accountability gold mine:** `.content.statements.documents[]` (misleading key!) lists the **text evolution** right on the ME page: "Gesetzestext" → RV document, "Geändert im Ausschuss", "Geändert im Plenum". The diff chain for the accountability layer is delivered for free.
- Detail pages are pre-generated/cached (`meta.generationTime`, observed ~2 days old) — fine for a nightly sync.

### List 142 — Stellungnahmen

Dimensioned via the **parent item** (`BEZUG_*`):

```bash
# All 707 Stellungnahmen for 88/ME:
curl -s -X POST "https://www.parlament.gv.at/Filter/api/filter/data/142?js=eval&showAll=true" \
  -H "Content-Type: application/json" \
  -d '{"BEZUG_GP_CODE":["XXVIII"],"BEZUG_ITYP":["ME"],"BEZUG_INR":[88]}'
```

- Without `BEZUG_INR`: all ME Stellungnahmen of the GP (XXVIII: 5,505). Completely unfiltered: 633,416 (all GPs, all types). Careful: `{"GP_CODE":["XXVIII"]}` is a **different** dimension (GP of the SN itself, all types, 8,513 rows) — not interchangeable with `BEZUG_*`.
- Row (0-based): `[2]` SNME-INR (→ detail URL), `[4]` date, `[6]` submitter as HTML `<a>` with the name, `[12]` endorsements (int, **approximation only** — list 305 is authoritative, a 5-vs-4 discrepancy was observed), `[15]` citation (`476/SN-88/ME`), `[18]` parent path.
- Document links are NOT in the row → fetch the SNME detail.
- The list definition is embedded in every ME detail under `.content.statements.filter.data.definition`.

**Upstream index gap — RESOLVED 2026-09-01** (first observed 2026-08-27). Parliament
rebuilt the index and confirmed the fix by mail; re-measured the same day:
88/ME returns its full 707 rows, and `{GP: XXVIII, ITYP: ME}` returns 6,008
rows against list 81's 5,977. The incident stays documented because the
failure mode is silent and can recur — that is what the last-good store
guards against, and question 2 below is still unanswered upstream.
List 142 silently under-delivers when filtered via `BEZUG_*`. For GP XXVIII
list 81 counts **5,977** Stellungnahmen, list 142 returns **2,916** rows:

| | MEs | missing SN |
|---|---|---|
| absent from the index entirely | 47 | 1,705 |
| partial, delta > 5 | 42 | 1,303 |
| partial, delta ≤ 5 (plausibly the normal publication lag) | 26 | 53 |
| complete | 17 | – |

Worst cases: **88/ME 707 → 0**, 8/ME 143 → 1, 104/ME 101 → 0, 62/ME 101 → 1,
44/ME 616 → 485, 32/ME 572 → 484. Both of the demo links used in outreach
(8/ME, 88/ME) are affected.

- Not a request-shape problem: the body above is byte-identical to the
  `fixedParams` parliament.gv.at embeds in its own 88/ME page, and the
  variants (with/without `js=eval`, `sortrnr`, `pagesize`) all return 0.
- Not a filter that fails to grip: `{"BEZUG_GP_CODE":["XXVIII"],
  "BEZUG_ITYP":["ME"]}` returns 2,916 rows, and **none** of them carries
  `BEZUG_INR = "88"` (85 distinct MEs present, 88 not among them).
- The items themselves are intact: `GET /gegenstand/XXVIII/SNME/3699?json=True`
  still resolves to `476/SN-88/ME`. Data is not deleted, the index is
  incomplete.
- `lastSync` is current (identical on lists 81 and 142), so nothing in the
  response signals the gap — a consumer cannot tell "0 rows" from "0
  Stellungnahmen" without the list-81 counter.
- Consequence for us: `getStatementsForMe` throws rather than caching a
  zero, and the persisted last-good store (`server/utils/lastgood.ts`)
  keeps the aggregation alive across restarts — the defence that outlives
  this incident.
- Open question the fix does not answer: an API consumer still cannot
  distinguish "0 rows" from "0 Stellungnahmen" without cross-checking the
  list-81 counter. Worth raising if there is ever a second occasion.
- Evidence of the outage: `outreach/list142-luecke-2026-08-31.csv`
  (per-ME comparison, 2026-08-31).

### SNME detail — a Stellungnahme as its own item

```bash
curl -s "https://www.parlament.gv.at/gegenstand/XXVIII/SNME/3262?json=True"
```

- **Web-form submissions: the full text is INLINE in the JSON** (`.content.statement`, HTML string). Upload submissions: `statement=null`, PDF under `.content.documents[]`. Inline vs. PDF follows the **submission channel**, not the submitter type (organisations can be inline too).
- SNME-INR is a GP-wide sequence, independent of the numbering in the citation (`476/SN-88/ME` has SNME-INR 3699).
- Non-public submissions appear as the placeholder name `"Nicht-öffentliche Stellungnahme"`.

### List 305 — endorsements

```bash
curl -s -X POST "https://www.parlament.gv.at/Filter/api/filter/data/305?js=eval&showAll=true" \
  -H "Content-Type: application/json" \
  -d '{"GP_CODE":["XXVIII"],"ITYP":["SNME"],"INR":[3699]}'
```

One row per endorser: `[0]` full name, `[1]` postal code, `[2]` town, `[5]` date. Definition embedded in every SNME detail (`.content.approvals.filter.data.definition`). Careful: the header declares 16 columns, rows have 15 elements — map by observed position.

### List 101 — Verhandlungsgegenstände (for RV tracking)

MEs are **not** included here (all type filters with `ME` → `count=0`); the list covers the formal parliamentary procedure (RV, resolutions, …). `{"GP_CODE":["XXVII"]}` filters (388,778 → 76,395 rows); the **type filter is unsolved** (VHG/VHG2/DOKTYP with "ME"/RV values did not take effect; the value vocabulary is different, e.g. `ENQ`). Practically irrelevant: for the accountability layer the detail JSONs via `preconst` are the better route (§3).

---

## 2a. RIS OGD API — `Applikation=BrKons` (konsolidiertes Bundesrecht)

Explored 2026-09-08 for the consolidated-text package (`architecture.md`
§12.12) and the § title lookup speaking names need (§12.11). Same endpoint and
version as `Begut`, no auth:

```
GET https://data.bka.gv.at/ris/api/v2.6/Bundesrecht?Applikation=BrKons&Titel=…
```

**One document per paragraph, not per law.** IDs are `NOR…`, and the metadata
block `Bundesrecht.BrKons` carries what a lookup needs:

| Field | Example | Why it matters |
|---|---|---|
| `Abkuerzung` | `GSpG` | the join key from a draft's Promulgationsklausel to the law |
| `ArtikelParagraphAnlage` / `Paragraphnummer` | `§ 0` / `0` | addresses the single § |
| `Inkrafttretensdatum` | `1990-01-01` | … |
| `Ausserkrafttretensdatum` | `2026-07-29` | **… together: every historical version is its own document with a validity interval** |
| `Kundmachungsorgan`, `StammnormBgblnummer` | `BGBl. Nr. 620/1989` | identity of the Stammnorm |
| `Aenderung` | `BGBl. Nr. 532/1993 (NR: GP XVIII RV 1130 AB 1170 …)` | every amending BGBl **with its Regierungsvorlage number and GP** |
| `Eli` | `…/eli/bgbl/1989/620/P0/NOR11004660` | stable address |

**Consequence for the verification harness.** Because each § version carries
Inkrafttreten and Außerkrafttreten, the version *before* an amendment and the
version *after* are both addressable. An engine that applies
Novellierungsanordnungen can therefore be measured against ground truth for
every already-promulgated amendment — in GP XXVII alone, 296 of 353 drafts
became a Regierungsvorlage, most of them enacted. Nothing about this is
blocked; what remains is enumerating the instruction forms and building the
harness.

**`Aenderung` is a backwards chain.** The tool currently walks ME → RV → BGBl
forwards. This field walks it back: from a law in force to the
Regierungsvorlage that changed it, with GP and number. Not needed for the
diff, but it is the missing direction for "which consultation produced the § I
am reading".

**Gotcha, and it is a silent one:** unsupported query parameters are
**ignored, not rejected**. `Paragraf=9` and `Abkuerzung=GSpG` both returned
441.147 hits — the entire corpus — with HTTP 200. Always sanity-check the hit
count against expectations before treating a result as filtered (same failure
class as the list-142 gap, `§list 142`).

## 2b. RIS OGD API — die übrigen `Bundesrecht`-Anwendungen

Explored 2026-09-08 while building the amendment engine (`architecture.md`
§12.12). The complete list is not in the documentation but falls out of an
error message: an invalid child element makes the endpoint answer with
**every** application it accepts.

```
Suchworte, Titel, BrKons, BgblAuth, BgblPdf, BgblAlt, Begut, RegV, Erv
```

`RegV` is the one to note: **the RIS also publishes Regierungsvorlagen.** The
diff layer currently takes them from Parliament HTML (GP XXVIII on) and falls
back to Begut XML for older periods (`ris-join.md` §6b/§6c) — `RegV` is an
untested third path and possibly the better one for old GPs. Not needed for
what ships today; worth a look before more effort goes into HTML variants.

### `Applikation=BgblAuth` — the authentic Bundesgesetzblatt

18.911 documents (2026-09-08), IDs `BGBLA_<Jahr>_<Teil>_<Nummer>`, e.g.
`BGBLA_2022_I_187`. Metadata under `Bundesrecht.BgblAuth`: `Bgblnummer`
("BGBl. I Nr. 187/2022"), `Ausgabedatum`, `Einbringer`.

**The decisive property: the main document is the same legistic XML as
`Begut`** — `absatz typ="novao1|novao2"`, `<gldsym>`, `ueberschrift
typ="para"`. So `parseRisXml` + `segmentUnits` read a promulgated amendment
without a single new line of parsing, and the instructions are the *enacted*
ones — no drift between draft and law.

Useful filter for a harness: the title of a single-law amendment is
formulaic, `Bundesgesetz, mit dem das <Gesetz> geändert wird`. Those are the
cases whose result can be scored against one law.

### The exact join from a Bundesgesetzblatt to the text it produced

Every consolidated paragraph version (`BrKons`, §2a) carries in
`Kundmachungsorgan`:

```
BGBl. Nr. 620/1989 zuletzt geändert durch BGBl. I Nr. 187/2022
```

So for a given BGBl number, the version it created and the version it replaced
are both addressable — which is what makes the verification harness possible.
The field is in the **list** response, so no per-document fetch is needed to
find the pair.

**Two caveats, both learned by getting them wrong first:**

- **Dates cannot substitute for the pair.** Amendments are routinely
  retroactive: GSpG § 20 was promulgated 2022-12-06 and applies from
  2022-01-01, so `Fassung.FassungVom` on the promulgation date already returns
  the *amended* text. Any before/after derived from the Kundmachungsdatum
  compares the new law against itself.
- **`zuletzt geändert durch` names the law's most recent amendment, not the
  paragraph's author.** RIS cuts one consolidated version per effective date,
  so a version can also carry a long-dated change from an earlier amendment
  (GSpG § 17 in the 2022-12-07 cut). Ground truth at paragraph level is
  therefore slightly coarser than the question "what did *this* amendment
  do" — see `architecture.md` §12.12 for how the harness handles it.

## 2c. Die amtliche Textgegenüberstellung

Explored 2026-09-08. The consolidated comparison the accountability layer
wants to compute **already exists for a large share of drafts**, written by
the ministry itself.

A `Textgegenüberstellung` is a standard annex to an Austrian
Ministerialentwurf, regulated by a BKA Rundschreiben of 27.03.2002
(GZ 600.824/003-V/2/2001): two columns headed **`Geltende Fassung`** and
**`Vorgeschlagene Fassung`**, the headings repeated on every page, and
unchanged text between two changes abbreviated as a designation plus three
dots ("2. bis 26b. …").

**Both publish it; only RIS publishes it as a table.** For XXVIII/ME/125 the
Parliament document list offers `Textgegenüberstellung` in PDF alone, while
the RIS `Begut` record has the same annex as Xml, Html, Pdf and often Rtf —
and that observation was written up as the general rule. It is not one.
Measured over all 132 GP-XXVIII Ministerialentwürfe on 2026-09-10 (Parliament
`content.documents[]`, group title `Textgegenüberstellung`, against the joined
RIS record):

| GP XXVIII, 132 MEs | Parlament: PDF **und** HTML | Parlament: nur PDF | Parlament: nichts |
|---|---:|---:|---:|
| RIS-XML lesbar (65) | 64 | 1 | 0 |
| RIS-XML gerastert (44) | 0 | 44 | 0 |
| RIS ohne Beilage (23, davon 2 ohne Datensatz) | 9 | 3 | 11 |

Three things follow, and each one contradicts a sentence that was here before:

1. **Parliament offers HTML for 73 of the 121 MEs that have an annex at all** —
   XXVIII/ME/125 is one of the 48 exceptions, not the rule.
2. **Every single one of the 44 rasterised RIS annexes is PDF-only at
   Parliament too.** The HTML twin exists exactly where RIS already has a
   readable XML table, so Parliament's HTML would buy nothing for the path
   that needs it most. (Parliament marks the scans in the file name:
   `imfname_*.pdf` rather than `fname_*.pdf`.)
3. **11 drafts have an annex at Parliament and none in RIS** — 8 of them with
   HTML, 3 only as an `imfname_` scan. Reading the annex from RIS alone is
   therefore right for the *rows* and wrong for the *sentence*: until
   2026-09-10 those 11 were told "Keine Textgegenüberstellung", which is a
   statement about RIS dressed up as one about the draft
   (`architecture.md` §12.13).

Also measured, and worth writing down because §2c has an open item about it:
**no** GP-XXVIII ME carries two Textgegenüberstellung documents at Parliament.
The two-annex case below is a RIS-side phenomenon.

**Availability, measured over the 200 drafts published in the last twelve
months:**

| | |
|---|---|
| with a Textgegenüberstellung | 121 (60 %) |
| of those, offered as XML | 121 (100 %) |
| of those, XML that is actually a table | 78 (60 %) |
| XML that is only scanned images (`<binary datatype="gif">`) | 53 (40 %) |

So **roughly 39 % of drafts have a machine-readable official comparison** —
and "available as XML" is not the same as readable, which is the trap here.
For the running GP XXVIII specifically the share is higher: of 132 drafts,
109 carry the annex with XML and **65 of those are readable (49 %)**.

**The "scans" are not scans (2026-09-09).** The 40 % above is a property of
the RIS *XML* rendering, which rasterises the annex into
`<binary datatype="gif">`. The **PDF of the very same annex** is Word output
with a full text layer: across all 44 rasterised GP-XXVIII annexes there is
not one image XObject, and there are 955 font references. The text was never
lost — the project was reading the one format that had thrown it away. So the
readable share for GP XXVIII is not 49 % but **109 of 132 (82 %)**: 65 from
the XML table (`textComparison.ts`) and 44 from the PDF's positioned text
runs (`annexPdf.ts`, geometry, because a PDF has no row elements and the
paragraph marker is the only boundary the layout guarantees). Both are on
the page since 2026-09-09; no draft is refused as "nur ein Scan" any more,
and of the 23 that stay unavailable 21 carry no annex at all.

**Both paths need the RIS check before anything is shown**
(`annexCheck.ts`, `architecture.md` §12.13). Neither is a parse that can be
trusted on sight: the left column claims to be the standing law, and holding
that claim against RIS Bundesrecht is the only self-check either path has.
Measured over the readable XML annexes on 2026-09-09, 86,9 % of paragraphs
with real prose covered the standing text to 99 % or better and 4,7 % fell
below 80 %; on the PDF path the same ruler gave 70,2 %. **After that day's
parser corrections it reads 88,9 % (930 of 1.046 §§ with prose) on the table
path and 76,1 % (1.421 of 1.867) on the PDF path** (2026-09-10) — the PDF
path gained six points from the per-page geometry gate, the per-column edges
and the hyphen rule (`architecture.md` §12.13), and stays the rougher of the
two. **The table path reads 91,4 % (955 of 1.045) since 2026-09-11**, when
inline markup stopped being a word boundary on all three sides of the
comparison at once; the PDF number is unchanged, because a text layer carries
no markup to begin with. Where the check fails, the row is mis-paired or the ministry quoted a
superseded version — and the page would otherwise print a word diff over a
provision the row does not belong to. The name varies:
`Textgegenüberstellung`, `TGÜ`, `TGG`, and a misspelt
`Textgegenbüberstellung`, so matching has to be loose.

**The right column has references too (2026-09-10).** It was called
unverifiable here — "the law the draft proposes, which exists nowhere else
yet" — and that is wrong twice over. What the annex shows as *new* must not
already stand in the § (RIS holds that text), and it must occur in the
draft's own Gesetzestext, which the very same RIS `Begut` record publishes as
its `MainDocument` beside the annex — in the Novellierungsanordnungen it
addresses to *that* § since 2026-09-10, because the whole draft as one
reference is blind to text dragged out of a neighbouring §. The second one is
the tighter reference of the two: over 1.145 GP-XXVIII paragraphs with at
least ten new words, the share found in the draft's text is 100 % at the
median and 98 % at p10. Both checks matter because containment is
one-directional — text a parser loses on the left passes the RIS check and is
then painted green as an addition, which happened in 1.019 of 1.092 injected
cases (93,3 %); the two rules together catch 567 of those, 51,9 % with the
whole draft as the reference and 62,1 % (PDF) / 69,5 % (table) with it per §
— the table figure over 246 injection sites since 2026-09-11, three more than
the run it was first measured on, because §§ the left check used to fail now
reach the injection at all.
Thresholds, the honest reach, the addressing coverage and the rejected
variants: `architecture.md` §12.13. A parser detail
found on the way: the PDF text layer writes RIS's editorial note as
"(Anm. **:** aufgehoben durch …)", with a space before the colon, so a
pattern built for the XML spelling leaves it in the column while the standing
side has dropped it — an asymmetry that reads as the ministry's error and is
ours.

**Structure of the readable ones** (one `<table>`, 153 `<tr>` in the sample):

- row 0 is the header pair, `<ueberschrift typ="tgue">`
- `<td colspan="2">` spans an Artikel heading over both columns
- a normal row pairs one cell of current law with one of proposed law
- an empty left cell is an insertion, an empty right cell a deletion
- `<gldsym>` gives the § marker, `<symbol>` the Ziffer marker
- **a row can carry two `<gldsym>`, one per column, and they need not agree**:
  where the draft renumbers a provision the annex prints the standing "§ 7."
  on the left and the proposed "§ 8." on the right, in one and the same row
  (42 rows in GP XXVIII, 2026-09-11 — `architecture.md` §12.13)
- **`<span style="background:yellow">` is the ministry's own change marking** —
  8.769 of them across 9.142 rows in the sample

That last point is the valuable part: the author marks what changed, so the
comparison needs no engine and carries no risk of inventing law text.

**Als Orakel für die Engine (2026-09-09, `architecture.md` §12.12).** Drei
Dinge, die der Prüfstand auf dem Weg dorthin gelernt hat:

- **Der Rückweg BGBl → Entwurf ist exakt.** `Aenderung` im BrKons nennt die
  Regierungsvorlage („BGBl. I Nr. 31/2026 (NR: GP XXVIII RV 447 …)"), und das
  Parlament-JSON der Regierungsvorlage (`/gegenstand/XXVIII/I/447?json=True`)
  trägt in `content.preconst[]` den Ministerialentwurf (`ityp: "ME"`, `inr`).
  Von dort zum RIS-Begut-Satz über Titel und Beginn (±21 Tage um das
  Einlangen). Initiativanträge („IA 951/A") und Ausschussanträge haben keinen
  Entwurf und damit nie eine Gegenüberstellung — im 54-Novellen-Korpus 25 von
  54; weitere 9 Regierungsvorlagen haben `preconst: null`.
- **Regierungsvorlagen tragen die Gegenüberstellung uneinheitlich:** als HTML
  (518 d.B.), nur als PDF (447 d.B.), gar nicht (531 d.B.). Wer die Deckung
  des Orakels erhöhen will, muss den Parlaments-Anhang der RV lesen, wo der
  Entwurf keinen hat — offen.
- **Der Anhang hat eigene Fehler.** Er ist handgeschrieben: Tippfehler
  gegenüber dem Gesetzestext desselben Entwurfs („therapeutischem" gegen
  „therapeutischen"), Platzhalter für die spätere Kundmachungsnummer
  („BGBl. I Nr. xxx/2025"), eigene Anführungszeichen um Zitate. Ein Vergleich
  gegen ihn muss das aushalten, und er bestätigt entsprechend weniger, als er
  könnte — nie mehr.

### Was die beiden Parser 2026-09-10 falsch gelesen haben

Gemessen über die **240 Beilagen der GP XXVIII** (400 RIS-Begut-Datensätze,
Gesetze und Verordnungen; 126 lesbare XML-Tabellen, 114 über die PDF-Geometrie).
Der RIS-Abgleich (`annexCheck.ts`) prüft nur Zeilen, die eine
Paragraphenbezeichnung tragen **und** als „geändert"/„entfällt" angezeigt
werden — alles andere muss der Parser allein richtig haben. Genau dort lagen
die fünf Befunde.

| | vorher | nachher |
|---|---:|---:|
| Zeilen insgesamt | 21.117 | 15.677 |
| geändert | 9.335 | 5.904 |
| neu | 4.799 | 3.244 |
| entfällt | 1.311 | 838 |
| als „ausgelassen" verworfen | 3.352 | 2.496 |
| davon mit einer Änderung darin | **919** | **41** |

- **„Ausgelassen" hieß nur „endet mit drei Punkten".** Der Test las beide
  Spalten auf ein Schluss-`…` — und auf dem PDF-Weg ist eine Zeile ein ganzer
  Paragraph, also fiel jeder Paragraph darunter, dessen *letzter* Absatz
  ausgelassen ist. 919 Zeilen trugen eine echte Änderung und wurden trotzdem
  verworfen (die UI blendet sie aus, der RIS-Abgleich überspringt sie), während
  `stats.changed` sie weiterzählte: die GAP-Strategieplan-Anwendungsverordnung
  verlor so eine Definition von Grünland und einen Satz von 20 % auf 50 %.
  Jetzt muss die Zeile *ausschließlich* aus Auslassungssyntax bestehen —
  Bezeichnungen, „bis"/„und", Bindestrich-Bereiche, das Platzhalter-„xx", Punkte
  —, davor höchstens eine Überschrift von maximal 80 Zeichen und nur, wenn beide
  Spalten sie gleich drucken. Rest: 41 Zeilen, in denen sich nur die Auslassung
  selbst unterscheidet („1. bis 59. …" gegen „1. bis 60. …", „..." gegen „…") —
  vergleichbaren Gesetzestext trägt dort keine Spalte.
- **PDF: der Vorspann wurde als neues Recht gezeigt.** Was eine Spalte vor
  ihrem ersten `§`-Marker druckt, bildet eine Einheit ohne Bezeichnung; die
  beiden Spalten teilen dafür keinen Schlüssel. Aus der rechten allein
  ausgegeben wurde daraus eine „neu"-Zeile: 134 Zeilen in 62 der 114
  PDF-Beilagen zeigten Inhaltsverzeichnis, „E n t w u r f", Langtitel oder
  „Präambel/Promulgationsklausel" als Zusatz des Entwurfs, eine davon 94.000
  Zeichen lang. Die linke Spalte fiel schon vorher stillschweigend weg — die
  Asymmetrie war die ganze Behauptung. Beide Seiten fallen jetzt weg und werden
  gezählt (`AnnexParse.unplaced`, 272 Blöcke im Korpus). Preis: zwei Beilagen
  liefern damit gar keine Zeilen mehr, darunter eine Verordnung mit genau einer
  Bestimmung ohne `§`-Marker. Das ist der bewusste Tausch — eine positionelle
  Paarung wäre geraten, und „neu" für unverändertes Recht ist die schlechtere
  Fehlerart.
- **PDF: gedrehte Seiten.** Die UWG-Novelle setzt `/Rotate 0` und dreht
  stattdessen die *Textmatrix*: jeder Lauf trägt `[0, 9.96, -9.96, 0, x, y]`,
  die Grundlinie läuft entlang der y-Achse, und „Geltende Fassung" (121, 215)
  und „Vorgeschlagene Fassung" (121, 537) liegen übereinander statt
  nebeneinander. `transform[4]`/`[5]` roh gelesen ergab zwei Zeilen
  geschütteltes Wortmaterial, angezeigt als neues Recht. `annexPdfPages.ts`
  rechnet jetzt `viewport.transform` (das trägt `/Rotate`) in jede
  Lauf-Matrix, bestimmt aus deren Grundlinienrichtung die dominante
  Vierteldrehung der Seite und dreht die Seite in ein aufrechtes Bild zurück
  (Ursprung unten links, y nach oben — dieselbe Konvention, in der
  `annexPdf.ts` sortiert und in der jede Fixture geschrieben ist). Aufrechte
  Seiten kommen unverändert durch. Ergebnis für diese Beilage: 2 Unsinnszeilen
  → 7 echte Paragraphen (§§ 1, 1a, 2, 7a, 33a, 44, 45).
- **Dazu ein Tor.** Jede Zeile dieses Wegs wird aus einer Koordinate
  erschlossen, und am Text selbst wäre nie zu sehen, dass die Koordinaten
  falsch gelesen wurden: die Wörter sind echt, nur ihre Anordnung ist unsere.
  Findet sich das vorgeschriebene Kopfpaar auf keiner Zeile als links/rechts,
  liefert der Parser nichts (`AnnexParse.unreadable`). Es kostet nach der
  Drehungskorrektur **keine einzige** der 114 Beilagen — vorher hätte es drei
  gekostet, zwei davon nur wegen der Schreibweise: „Geltende Fassung nach
  Inkrafttreten EuGB-VVG" und „Geltender Text"/„Vorgeschlagener Text". Die
  Kopfzeilen werden deshalb über ein Muster erkannt, nicht über
  Zeichengleichheit. **Ein Bit pro Dokument war das aber**: eine einzelne
  anders gesetzte Seite in einer sonst geraden Beilage fiel nicht auf. Seit
  demselben Tag trägt jede Seite ihre eigene Geometrie (`AnnexPage.geometry`
  aus `uprightRuns`: Läufe, Läufe gegen die Drehung der Seite, schräge Läufe),
  und `parseAnnexPdf` liest eine Seite nicht, deren Breite um mehr als 1 % von
  der des Dokuments abweicht, die einen schrägen Lauf trägt oder deren
  abweichend gedrehte Läufe 5 % überschreiten — `AnnexParse.droppedPages`,
  heute 0 für alle 114 (`architecture.md` §12.13).
- **XML: verschachtelte Inhaltstabellen wurden zu erfundenen Änderungen.**
  Der Lift war für den Layout-Fall gebaut — eine Wrapper-Zeile, eine Zelle über
  die volle Breite, die Gegenüberstellung darin — und feuerte auf *jede*
  verschachtelte Tabelle. 443 der 458 verschachtelten Tabellen der GP XXVIII
  sitzen aber in einer Zelle *innerhalb* einer Spalte, und ihre Spalten sind
  nicht „geltend" und „vorgeschlagen": das Finanzausgleichsgesetz § 11 meldete
  „Grunderwerbsteuer" → „5,702 0,556 93,742", die Fruchtsaftverordnung 158
  geänderte Zeilen aus einer „Fruchtnektar aus | Mindestgehalt"-Tabelle, die
  Universitätsfinanzierungsverordnung 672 aus einer ISCED-Codeliste. Gehoben
  wird jetzt nur noch, was die Breite deckt (alle anderen Zellen der Zeile
  leer) oder selbst mit dem Kopfpaar beginnt; alles andere wird als Text in die
  Zelle geschrieben — Zeilen mit " ", Zellen mit " | " —, steht damit in beiden
  Spalten und wird vom Wortdiff verglichen. Das Kriterium „Wrapper-Zeile hat
  genau eine Zelle" wäre zu eng gewesen: das ABGB schreibt
  `<td colspan="2">…Vergleich…</td><td/>` und verlor damit den neuen § 1159
  Abs. 6.
- **XML: eine Zeile muss die Spaltenbreiten des Kopfes nicht einhalten.** Das
  Verbraucherkreditrechts-Änderungsgesetz 2026 setzt den Kopf `colspan="5"`
  gegen `colspan="1"` und den Anhang `4` gegen `3`: beide Zellen landeten unter
  „Geltende Fassung", die rechte Spalte blieb leer, und elf Zeilen wurden als
  **entfällt** gemeldet, die der Anhang in beiden Spalten gleich druckt. Keine
  davon trägt eine Paragraphenbezeichnung, der RIS-Abgleich sieht sie also nie.
  Bleibt eine Seite leer, wird jetzt nach den Breiten der Zeile selbst geteilt.
- **XML: Kopf fehlt ganz.** Genau eine der 126 lesbaren Beilagen druckt das
  Kopfpaar nicht (Kurztitel beginnt „Änderung der Universitäts- und
  Hochschulstatistik-…"). Sie *ist* eine zweispaltige Gegenüberstellung, nur
  ohne Überschrift; die Spaltenbreiten kommen deshalb aus der häufigsten
  Zeilenform statt aus einer Annahme, und ein Dokument, dessen Zeilen nicht
  zwei Zellen breit sind, liefert nichts statt Paaren aus unverwandten Zellen.

Zwei weitere Befunde derselben Runde (2026-09-10, gemessen über die 2.000
jüngsten RIS-Begut-Datensätze, 403 davon mit lesbarer XML-Beilage — die
Zahlen in Klammern über die 400 jüngsten, das Fenster der Tabellen oben):

- **XML: eine Datentabelle allein in einer Zelle wurde zur Gegenüberstellung.**
  Der Lift greift ohne Kopfpaar, wenn eine Zelle die volle Breite deckt — und
  das muss er, denn so schreibt das ABGB seinen § 1159, und so stehen Artikel-
  und Abschnittszeilen in mehreren Beilagen. Er feuert auf 73 verschachtelte
  Tabellen; 18 davon sind aber Tabellen **des Gesetzes**, die zufällig allein
  in ihrer Zelle stehen, und ihre zwei Spalten wurden als „geltend" gegen
  „vorgeschlagen" gelesen: die Bildungsdokumentation meldete „Attribut" →
  „Wert", die Pflanzgutverordnung „Gattung oder Art" → „Schadorganismen", die
  Hochschul-Curriculaverordnung „Bildungswissenschaftliche Grundlagen" → „10".
  Bei letzterer besteht die ganze Beilage aus solchen Tabellen: alle 19 Zeilen
  waren erfunden, sie liefert jetzt nichts und sagt warum. Entschieden wird
  über die Auszeichnung des RIS, nicht über die Form: `<absatz typ="tabtext…">`
  ist, wie das RIS Tabellenzellen typisiert, und es typisiert damit nie eine
  Bestimmung. Alle 18 werden erkannt, keine der 6 echten verschachtelten
  Gegenüberstellungen — 128 (20) Zeilen weniger, die „geändert" hießen.
- **Eine Anlage beendet die Paragraphenfolge, sie gliedert sie nicht.** Zeilen
  ohne eigene Bezeichnung erben den zuletzt geöffneten Paragraphen, und das
  galt auch über „Anhang" hinweg: im VerKRÄG gingen vierzehn Zeilen des Anhangs
  als § 14 des Verbraucherbehördenkooperationsgesetzes hinaus, wurden vom
  RIS-Abgleich einbehalten und der Leserin mit „der geltende Text dieser Stelle
  steht so nicht im RIS" erklärt — wahr über § 14 und falsch über die Beilage,
  die das nie behauptet hat. Erkannt wird die Anlage über `typ="anlage"` und,
  wo die Auszeichnung fehlt (12 Zeilen im Fenster), über die Wortwahl mit
  derselben Längenschranke wie bei Abschnitt/Hauptstück. Betroffen: 1.982 (951)
  Zeilen in 168 (61) Anlagen, davon 678 (230) als Änderung gezeigt. Sie tragen
  jetzt die Anlage als Bezeichnung statt des Paragraphen davor — 522 (213) mit
  einer Bezeichnung, die das RIS beantworten kann („Anlage 1" → `Anl. 1`); wo
  die Zeile keine Nummer nennt („Anhang"), bleiben sie ungeprüft, was ihnen
  zusteht.

Und drei Befunde, die nur den PDF-Weg betreffen (2026-09-10, über die 114
PDF-Beilagen der GP XXVIII; Zahlen und Varianten in `architecture.md` §12.13):

- **Die Spaltenkante muss aus der Spalte kommen.** „Diese Zeile ist
  umbrochen" entschied sich links am Bundsteg und rechts am *Seitenrand* —
  aber die rechte Spalte endet im Median 84,8 pt vor dem Papierrand, also
  zählte über den ganzen Korpus keine rechte Zeile als umbrochen. Weil die
  Übernahme einer Überschrift an der umbrochenen Zeile stoppt, landete eine
  zweizeilige Paragraphenüberschrift nur in der rechten Spalte: **70
  Paragraphen zeigten ihre eigene geltende Überschrift als Zusatz des
  Entwurfs**. Jede Spalte wird jetzt an ihrer eigenen, aus ihren Zeilen
  gemessenen Kante geprüft, und die Toleranz dafür ist eine eigene Zahl
  (6 pt gegen 18 pt für den Bundsteg), weil die Beilagen im Blocksatz stehen.
- **Ein nachgedrucktes Inhaltsverzeichnis liefert Bestimmungen, die es
  nicht gibt.** Fünf einseitige Zeilen des Korpus waren Einträge zu
  Paragraphen, die die Beilage nie druckt — vier davon seit Jahren in Geltung
  (§ 79a Mindestbesteuerungsgesetz, § 13a
  GAP-Strategieplan-Anwendungsverordnung, § 11 Energie-Control-Gesetz,
  § 77d BWG) — und gingen als „neu" hinaus. Eine Bestimmung hat einen Körper, und ein Körper enthält einen
  Satz: eine einseitige Einheit, deren Text nach der Bezeichnung nicht leer
  ist und kein Satzzeichen trägt, ist ein Inhaltsverzeichnis-Eintrag.
- **Ein Bindestrich am Zeilenende** darf nur aufgelöst werden, wenn die
  Zeile, die ihn trägt, bis an die Spaltenkante gelaufen ist; gefragt wurde
  die Zeile danach. Beide Richtungen waren falsch — „Nachrichten- dienst"
  blieb getrennt, „Staatsschutz- und" wurde zu „Staatsschutzund". 135 Zeilen
  über die 114 Beilagen, netto −340 Zeichen von 7,46 Mio.

**Offen: zwei Beilagen-Dokumente pro Datensatz.** 2 der 240 Datensätze mit
Beilage tragen zwei davon — „Textgegenüberstellung (Verordnung)" +
„Textgegenüberstellung (Anlagen)" (Methodenverordnung Wasser) und
„Textgegenüberstellung (Artikel1)" + „Textgegenüberstellung (Artikel 2)"
(Weinrecht-Sammelverordnung 2026). `ris.ts` nimmt das erste; die zweite Hälfte
der Gegenüberstellung wird nicht gezeigt und auch nicht erwähnt. Nicht
behoben.

## 2. RIS OGD API — `Applikation=Begut`

```
GET https://data.bka.gv.at/ris/api/v2.6/Bundesrecht?Applikation=Begut&...
```

`Begut` is a **parameter of the `Bundesrecht` resource**, not its own endpoint. 4,566 documents (as of 2026-08-15), one `OgdDocumentReference` = **one consultation** (not one file).

### Query parameters (complete per the official example form, all verified live)

| Parameter | Values | Purpose |
|---|---|---|
| `Suchworte` | free text | full-text search (452 hits for "Klimaschutz") |
| `Titel` | free text | title search — **matches loosely**, never use as a join |
| `InBegutachtungAm` | `yyyy-MM-dd` | deadline covers the reference date (2026-08-15: 13 open) |
| `EinbringendeStelle` | short code (`BMF`, `BKA`, …) | ministry — codes change with every government, **do not hardcode** (the new BMWKMS is already missing from the official list) |
| `ImRisSeit` | `EinerWoche`…`EinemJahr` | coarse relative interval |
| `Seitennummer` | 1-based | paging |
| `DokumenteProSeite` | `Ten`/`Twenty`/`Fifty`/`OneHundred` | max. 100 ⇒ full sync = ~46 requests |
| `Sortierung.SortedByColumn` | `Kurztitel`/`EinbringendeStelle`/`EndeBegutachtungsfrist` | + `Sortierung.SortDirection=Ascending\|Descending` |

**No from/to date range** on the main endpoint. Incremental sync via the history endpoint:

```bash
curl -s "https://data.bka.gv.at/ris/api/v2.6/History?Anwendung=Begut&AenderungenVon=2026-08-01&DokumenteProSeite=Ten&Seitennummer=1"
```

(`AenderungenVon`/`AenderungenBis`, optionally `IncludeDeletedDocuments` — deleted behavior untested.)

### Metadata schema (complete, union over 100 records)

```
Technisch:   ID, Applikation="Begut", Organ, ImportTimestamp (always xsi:nil)
Allgemein:   Geaendert (yyyy-MM-dd), DokumentUrl
Bundesrecht: Kurztitel, Titel,
             Begut: EinbringendeStelle, BeginnBegutachtungsfrist*, EndeBegutachtungsfrist*,
                    Abkuerzung (optional), Schlagworte (optional)
```

\* **The deadline fields are optional** — at least one record has neither, and null sorts first under `EndeBegutachtungsfrist Ascending`. Oldest non-null value: 2002-09-20; practical coverage from ~2004. Historical/closed consultations are retained.

There is **no document-type field** (bill draft vs. regulation draft only derivable from the title) and **no parliament reference whatsoever** (no GP, no ME number, no parlament.gv.at URL — verified by grepping full records).

### Attached documents

`Data.Dokumentliste.ContentReference[]`, `ContentType`:

- `MainDocument` — exactly 1 per record, `Name="Hauptdokument"` = the draft text. Always Html+Pdf+Rtf+Xml.
- `Letter` — 1 per record, cover letter. **Sometimes PDF only** (4 of 39 in the verification sample).
- `Material` — Erläuterungen, Textgegenüberstellung, Vorblatt/WFA. Names are ministries' free text ("Vorblatt und WFA", "WFA samt Vorblatt", "TGÜ") — **classify by ContentType, never by name**.
- `Attachment` — annexes.
- `EmbeddedAttachment` — inline images, massive noise (~5,000 per 100 records), filter out early.

Every format incl. Html/Xml is **optional per file**. URL pattern: `https://www.ris.bka.gv.at/Dokumente/Begut/{ID}/{datei}.{ext}` (PDF download verified: 200, `application/pdf`).

### RIS quirks

- **XML-to-JSON trap:** `ContentReference`, `ContentUrl` etc. are an array for several elements, a **bare object for one**. Every parser needs an as-array normalizer.
- `Hits` is `{"@pageNumber":"1","@pageSize":"10","#text":"4566"}` — numbers as strings.
- **Errors arrive as HTTP 200** with an `OgdSearchResult.Error` object (SOAP schema message) — check every response for it. Useful: a deliberately invalid enum value returns the valid values in the error text.
- Record IDs: new `BEGUT_{GUID}`, old `BEGUT_COO_2026_100_2_{n}` — the "2026" is **not a year**, never parse data out of IDs.
- **`Begut.Gesetzgebungsperiode` is silently ignored** (verified 2026-09-10): `?Applikation=Begut&Begut.Gesetzgebungsperiode=XXVIII` and the same query without it both return 4.570 hits. Unknown filter keys are dropped without an error — the same trap the Parliament API has (§1), and the reason `assertRowsMatchGp` exists there. Consequence for the record: `scripts/annex-pdf-verify.ts` passes that parameter and takes the first four pages, so what it labels "GP XXVIII" is really **the 400 most recent Begut records** (default sort is newest first; their Begutachtungsbeginn runs 2024-04-29 … 2026-09-08, so roughly a quarter of them predate GP XXVIII). Corpus figures quoted from that harness — 240 Beilagen, 126 lesbare XML-Tabellen, 114 PDF — carry that caveat. Numbers about *the 132 Ministerialentwürfe* are joined through Parliament's list 81 instead and are exact.
- Docs: the HTML help pages are empty ASP.NET boilerplate. The real reference: `data.bka.gv.at/ris/api/v2.6/Content/Examples.zip` (→ `begut.html` with all enums) and the XSDs under `data.bka.gv.at/ris/ogd/v2.6/XSD/`.
- **License:** the response carries no license field; the data.gv.at dataset "RIS Daten Version 2.6" (Bundeskanzleramt) licenses all distributions **CC-BY 4.0**.

---

## 3. Accountability chain: ME → RV → BGBl

**Verdict: machine-traversable.** Two real chains traced end to end and re-verified:

1. **Informationsfreiheitsgesetz:** RIS `BEGUT_COO_2026_100_2_1836568` (BKA, deadline 2021-02-22–2021-04-19) ↔ `95/ME` XXVII (189 SN) → RV `2238 d.B.` → resolution `892/BNR` (NR 2024-01-31, BR 2024-02-15) → **BGBl I 5/2024** = RIS `BGBLA_2024_I_5`.
2. **Erneuerbaren-Ausbau-Gesetz:** `58/ME` XXVII → RV `471 d.B.` **and** `733 d.B.` → **BGBl I 150/2021**. ⚠️ **ME→RV is 1:n** — never model as 1:1.

### The joins, strongest to weakest

- **RV → ME: fully structured.** `content.preconst[] = {gp_code:"XXVII", ityp:"ME", inr:95, …}` plus `content.reference[]` with the citation. **Recommended crawl direction: harvest RVs (ITYP `I`) and invert `preconst[]`** — yields all ME→RV edges without HTML parsing and handles 1:n naturally.
- **RV → law: fully structured.** `content.status.bgbllinks[]` contains the RIS link with `Dokumentnummer=BGBLA_2024_I_5`. Select the entry via `Abfrage=BgblAuth` in the link, not blindly `[0]` (a second "Kunsttext" entry exists). Bonus: `content.status.description` contains the voting behavior per party.
- **BGBl → Parliament: fully structured (reverse direction!).** RIS BgblAuth records carry `Gesetzgebungsperiode`, `Regierungsvorlage` (d.B. number), `AusschussberichtNationalrat`, `DatumNationalrat/Bundesrat` — the last leg is an ID join in both directions. ⚠️ BgblAuth search: `Teil=1` is ignored, `hit[0]` is not part-I-first — always select via the ID prefix `BGBLA_{Jahr}_I_` or the Bgblnummer string.
- **ME → RV (forward): semi-structured.** Only as an href in `stages[].text` — a one-line regex, or more elegantly via the inverted `preconst` edges. Additionally, the evolved text versions (RV/committee/plenary) sit on the ME page under `.content.statements.documents[]`.
- **RIS Begut ↔ Parliament ME: a constructed join is required** (no shared key). Tested composite key, matched 2/2 cleanly:
  `BeginnBegutachtungsfrist == ME arrival` (exact in both cases) **+** title prefix match after stripping "Ministerialentwurf betreffend " (Parliament sometimes appends package short names that RIS omits) **+** ministry substring (`"Bundeskanzleramt"` ⊂ `"BKA (Bundeskanzleramt)"`). Title search alone never suffices (2–3 loose hits per search term). **Corpus-tested 2026-09-06 on all 350 MEs of GP XXVII: 337 unique matches, 0 ambiguous, 12 unmatched (all without any RIS record), 25/25 samples verified.** Two corrections from the corpus: `EndeBegutachtungsfrist == Frist` is the *strongest* signal (336/337, no one-sided extension in the whole GP), and Beginn is only exact in 72 % because Parliament's Einlangen lags RIS by 1–14 days. Full rule, numbers and failure modes: `docs/ris-join.md`; code `server/utils/risJoin.ts`; artefact `data/ris-me-map-gp27.json`.

---

## 4. GDPR findings

Private persons are **fully identifiable on three levels** straight from the API: list 142 (last name, first name in the row), SNME detail (name **plus postal code and town**), list 305 (endorsers with name, postal code, town). There is **no structural flag organisation vs. private person** — only name heuristics. Web-form full texts sit inline in the JSON; whether they fall under the CC-BY metadata license or under the full-text exclusion needs legal clarification — **the transport format does not decide the license question.** Our pipeline must enforce the metadata-only/no-names rules; the API does not help.

---

## 5. Open questions

1. ~~Does the RIS↔Parliament composite key scale to corpus level?~~ **Resolved 2026-09-06:** yes — 337/350 on GP XXVII, 0 ambiguous, no one-sided deadline extension observed; 12 MEs have no RIS record at all (BMK transport section 2020–Q1 2021, BMEIA), which the product must show as a state, not an error. See `docs/ris-join.md`.
**What the name heuristic gets wrong, measured (2026-09-15, `scripts/classifier-audit.ts` over all 6,067 GP-XXVIII rows; GP XXVII hits the 100,000-row cap and is COVID-skewed, so only per-item numbers are quoted for it):**

- **Institutions filed as "Privatperson":** at least 334 rows — 221 of them federal ministries in their own short form (`BM f. Finanzen`, `BM f. Justiz`, …), then courts (`Oberlandesgericht Wien; Geschäftsabteilung der Präsidentin`), the Datenschutzbehörde, the FMA, Staats- and Umweltanwaltschaften, and brand-style NGOs without a legal form (`Presseclub Concordia`, `GLOBAL 2000`, `VCÖ`, `WEISSER RING`). A separate cause hid ÖGB, ÖAMTC, SPÖ, ARBÖ: JavaScript's `\b` is ASCII-only, so a word boundary never matches before "Ö". All of these are organisations by pattern now; the cosmetic direction of the error, but for the accountability layer a court's or a ministry's Stellungnahme is exactly the institutional input worth seeing.
- **Persons published as organisations — the direction that matters:** `Lastname, Firstname; Universität Salzburg`, `Name, Dr.; Rechtsanwalt; … Rechtsanwälte GesbR`, `Name Name, Richterin am Landesgericht …` — a person filing with an affiliation, and the affiliation's keyword won. 239 rows in GP XXVII, 2 in GP XXVIII. Since 2026-09-15 the segment that names the submitter decides (`leadsWithPersonName` in `server/utils/privacy.ts`), checked before any organisation signal.
- **Not safe as rules, on the same data:** a bare semicolon (persons file as `Krejci, Florian; Dr. med. dent.`), all-caps (`KOLLROSS, PETER`), digits (`Scheer, Ma8`), and bare two-word heads that are acronyms (`WU Wien, Institut für …`) or split compounds (`Österreichischer Mieter-, Siedler und Wohnungseigentümerbund`).

2. ~~Type-filter syntax on list 101~~ **Resolved 2026-09-06:** the type filter is `VHG` (or `DOKTYP`) with values such as `VOLKBG`, `E`, `PET`, `BI` — see `docs/volksbegehren.md` §5.1.
3. ~~RSS export of the filter lists~~ **Resolved 2026-09-06:** `GET /Filter/api/filter/rss/{listId}?FIELD=value` honours the same filter dimensions, e.g. `rss/81?AKTIV=J` — see `docs/volksbegehren.md` §5.1.
4. Is `Allgemein.Geaendert` bumped on deadline extensions (is history polling enough)? Does `IncludeDeletedDocuments` return withdrawn drafts?
5. ~~How to recognize dead MEs (never became an RV)? Watch the `vhg_fertig` field on the ME detail.~~ **Resolved 2026-09-08 — negatively for the field:** `content.vhg_fertig` (and `vhg_fertig_docs`, `process`, `approvalstate`) is `J` / identical on every ME sampled across GP XXVI–XXVIII, running Frist included; nothing upstream marks a draft as dead. What works instead: the GP boundary (a draft stays with its GP; constituent-session dates in `shared/utils/gp.ts`) plus base rates measured with `scripts/rv-latency.mjs` — GP XXVII: 296 of 353 MEs got an RV, median 40 days after Fristende, p90 189 days; **4 of the 61 drafts still without RV at the GP's end got one in GP XXVIII**, linked in the old ME's own stage list (209, 326, 351, 352/ME) — so the stage record does carry cross-GP RVs, and "GP over" must never be rendered as "impossible". GP XXVI: 114 of 163, 14 late RVs of 63. Detail: `docs/architecture.md` §12.10.
6. Rate limits are undocumented; ~40-request sessions ran unthrottled. Test a nightly full sync (Parliament ~1 request via `showAll`, RIS ~46). Occasional 502s observed → plan retry logic.
7. Semantics of list-81 column 12 "Engagement" (0 everywhere) and `content.status.number` (5 = promulgated?).
