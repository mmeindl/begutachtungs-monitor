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

**RIS carries it as XML, Parliament only as PDF.** For XXVIII/ME/125 the
Parliament document list offers `Textgegenüberstellung` in PDF alone, while
the RIS `Begut` record has the same annex as Xml, Html, Pdf and often Rtf.
Anything built on this must therefore come from RIS, not from the Parliament
HTML the ME→RV diff uses.

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
The name varies: `Textgegenüberstellung`, `TGÜ`, `TGG`, and a misspelt
`Textgegenbüberstellung`, so matching has to be loose.

**Structure of the readable ones** (one `<table>`, 153 `<tr>` in the sample):

- row 0 is the header pair, `<ueberschrift typ="tgue">`
- `<td colspan="2">` spans an Artikel heading over both columns
- a normal row pairs one cell of current law with one of proposed law
- an empty left cell is an insertion, an empty right cell a deletion
- `<gldsym>` gives the § marker, `<symbol>` the Ziffer marker
- **`<span style="background:yellow">` is the ministry's own change marking** —
  8.769 of them across 9.142 rows in the sample

That last point is the valuable part: the author marks what changed, so the
comparison needs no engine and carries no risk of inventing law text.

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
2. ~~Type-filter syntax on list 101~~ **Resolved 2026-09-06:** the type filter is `VHG` (or `DOKTYP`) with values such as `VOLKBG`, `E`, `PET`, `BI` — see `docs/volksbegehren.md` §5.1.
3. ~~RSS export of the filter lists~~ **Resolved 2026-09-06:** `GET /Filter/api/filter/rss/{listId}?FIELD=value` honours the same filter dimensions, e.g. `rss/81?AKTIV=J` — see `docs/volksbegehren.md` §5.1.
4. Is `Allgemein.Geaendert` bumped on deadline extensions (is history polling enough)? Does `IncludeDeletedDocuments` return withdrawn drafts?
5. ~~How to recognize dead MEs (never became an RV)? Watch the `vhg_fertig` field on the ME detail.~~ **Resolved 2026-09-08 — negatively for the field:** `content.vhg_fertig` (and `vhg_fertig_docs`, `process`, `approvalstate`) is `J` / identical on every ME sampled across GP XXVI–XXVIII, running Frist included; nothing upstream marks a draft as dead. What works instead: the GP boundary (a draft stays with its GP; constituent-session dates in `shared/utils/gp.ts`) plus base rates measured with `scripts/rv-latency.mjs` — GP XXVII: 296 of 353 MEs got an RV, median 40 days after Fristende, p90 189 days; **4 of the 61 drafts still without RV at the GP's end got one in GP XXVIII**, linked in the old ME's own stage list (209, 326, 351, 352/ME) — so the stage record does carry cross-GP RVs, and "GP over" must never be rendered as "impossible". GP XXVI: 114 of 163, 14 late RVs of 63. Detail: `docs/architecture.md` §12.10.
6. Rate limits are undocumented; ~40-request sessions ran unthrottled. Test a nightly full sync (Parliament ~1 request via `showAll`, RIS ~46). Occasional 502s observed → plan retry logic.
7. Semantics of list-81 column 12 "Engagement" (0 everywhere) and `content.status.number` (5 = promulgated?).
