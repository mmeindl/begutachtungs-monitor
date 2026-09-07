# Volksbegehren: could the monitor track them too?

**As of 2026-09-06.** Research memo answering one question: the monitor shows
what became of Begutachtungs-Stellungnahmen — could it do the same for
Volksbegehren, and is the tracking gap similar? Every procedural, legal and API
figure below was checked live against ris.bka.gv.at, parlament.gv.at and
bmi.gv.at on 2026-09-05/06; the downstream classification in §4 and the
appendix is a first pass that also relies on press and secondary sources
where a row says so. Method in §13.

**Verdict:** the gap is real and even Parliament's own research service has
quantified it, but it is a different *kind* of gap. A Volksbegehren has no
successor document, so "what became of it" is attribution over years, not a
diff. The dataset is 81 cases in 62 years. A mechanical tracker would show
47 of 47 Kenntnisnahmen since 2018 — while 10 of those 47 demands
nevertheless became law, two of them traceably — and would read as a blame
counter. **Not a work package now.** Three by-products of this research feed
straight into the Begutachtung work (§10), and Volksbegehren sit in the same
API family the monitor already uses, though they need the generic Gegenstand
parser the ME→RV layer will need too (§5).

---

## 1. The question

A Volksbegehren that reaches 100,000 signatures is a public event with press
coverage, and its parliamentary end — "zur Kenntnis genommen" — is
reported. What nobody records is whether the demand ever became law, by which
route, and how long it took. That is the same "Nachverfolgung" question the
monitor asks for Stellungnahmen. The rest of this memo checks whether the
answer is buildable and whether it would serve the theory of change.

## 2. Legal frame: a Behandlungspflicht without a Begründungspflicht

| Norm | What it says | Consequence |
|---|---|---|
| Art. 41 Abs. 2 B-VG | A Volksbegehren supported by 100,000 Stimmberechtigte (or one sixth in three Länder) "ist von der Bundeswahlbehörde dem Nationalrat zur Behandlung vorzulegen". May, not must, take the form of a Gesetzesantrag. | Duty to treat, nothing more. |
| § 24 GOG-NR | Priority on the agenda; committee deliberation must start within one month of Zuweisung; "nach weiteren vier Monaten ist dem Nationalrat jedenfalls ein Bericht zu erstatten". | Deadlines, no sanction. |
| § 27, § 69 GOG-NR | The committee may attach Gesetzes- or Entschließungsanträge to its report, or, in Parliament's own words, recommend "bloße Kenntnisnahme" (RLW explainer wording, not a statutory term). First reading only on Nationalrat decision; a Besonderer Ausschuss may be elected. | The only substantive outcome is discretionary. |
| § 37 Abs. 4, § 42 Abs. 1/1a GOG-NR | The Bevollmächtigte plus two deputies sit in the committee; their dissenting statement is attached to the report; the report is served on them and published. | A paper trail Begutachtung lacks. |
| § 21 Abs. 1a GOG-NR, Art. 28 Abs. 4 B-VG | Unfinished Volksbegehren carry over into the next Gesetzgebungsperiode. | Items get a new d.B. number; see §5 dedup note. |
| § 23b GOG-NR (since 1.8.2021) | Volksbegehren are published on parlament.gv.at and anyone may file Stellungnahmen during the procedure. | Volksbegehren are consultation objects on list 142; §6. |

Parliament's own wording, on its "Wissenswertes" page: "Kenntnisnahme
bedeutet, dass über die Themen des Volksbegehrens debattiert wurde,
signalisiert aber keine Zustimmung zu dessen Forderungen. Der Nationalrat ist
nicht verpflichtet, weitere Beschlüsse zu fassen." The Rechts-, Legislativ-
und Wissenschaftlicher Dienst (RLW) adds: "Weder der Ausschuss noch der
Nationalrat sind verpflichtet, weitere Beschlüsse zu fassen."

**The VfGH point, precisely.** VfSlg 16.241/2001 (G 103/00) struck a clause
of the Vorarlberg Landesverfassung under which a popular vote could oblige the
Landtag to pass a law matching a Volksbegehren: law-making against the
parliamentary majority's will is a "Konkurrenzmodell" incompatible with the
repräsentativ-demokratische Grundprinzip. Parliament and the literature read
this a fortiori for the federal level: a duty to *implement* would need a
Gesamtänderung with Volksabstimmung. The case says nothing about a purely
procedural duty to decide and give reasons; that would extend the
Behandlungspflicht that already exists and has never been litigated.

For the project this is the sharpest available precedent: Volksbegehren
already have half of the respond-or-explain rule (treat, within deadlines) and
the outcome shows what that half is worth without the other half (§3).

Petitionen and Bürgerinitiativen (§§ 100–100d GOG-NR) follow the same logic
with one difference: their committee may request Stellungnahmen from the
Bundesregierung, and its report must end in one of three formal dispositions
(forward to government, forward to Volksanwaltschaft, Kenntnisnahme).
Entschließungen of the Nationalrat (Art. 52 B-VG) are non-binding and carry
no statutory report-back duty.

## 3. The record

The RLW published the only aggregate analysis as a Fachdossier on 20.01.2025
("Wie hat sich die Nutzung von Volksbegehren seit 2018 verändert?"; press
release PK0016 of 21.01.2025). Our own tabulation of all Gegenstände via the
filter API reproduces its Kenntnisnahme and Entschließung counts and extends
them to 2025; the "36 of 46 single committee round" figure is the RLW's own
coding and was not reproduced. One residual difference: the RLW counts 35
pre-2018 arrivals in the Nationalrat, the API and the BMI threshold yield 34.

| Measure (since 2018) | Value |
|---|---|
| Volksbegehren held (Eintragungswoche), 2018–2024 | 67 (vs 39 in 1964–2017) |
| Reached 100,000, 2018–2024 | 46 (69 %; ~90 % before 2018) |
| Reached the Nationalrat, 2018–2025, distinct | 47 |
| Ended in plenary Kenntnisnahme | 47 of 47 (45 unanimous) |
| Also carried an adopted Entschließung | 7 (Frauen 2018, EURATOM, Klima, Tierschutz 2021, Ethik für ALLE, Mental Health, Essen nicht wegwerfen 2025) |
| Only one substantive committee round, 2018–2024 | 36 of 46 |
| Besonderer Ausschuss | 0 (6 before 2018; the last one for the Bildungsinitiative 2011, XXIV/I/1647, concluded 2012) |
| Committee report deadline missed | 0 of 47 |
| Median Einlangen → Kenntnisnahme | 217 days (n = 47, min 117, max 335; carry-overs dated from their re-Einlangen) |
| Closed in same-day plenary batches of three or more | 36 of 47 |

Totals: 109 Volksbegehren went to an Eintragungswoche since 1964, 81 reached
the Nationalrat (Parliament, Stand 1.1.2026). Arrivals per year since 2018:
3, 0, 4, 5, 14, 13, 7, 1, and 0 so far in 2026 — a 2022–23 spike and fall,
with 36 initiatives in the Einleitungsphase on 06.09.2026. All five June-2026
Volksbegehren missed 100,000 (best: 59,971).

## 4. Downstream: what became of the demands

No per-Volksbegehren outcome record exists anywhere (§7), so one was built
for this memo from the API plus Parliament's, RIS's and press attributions.
**First pass, medium confidence; contestable rows are flagged in the
appendix.** Coding:

- **A** formal win inside the procedure: adopted Entschließung and/or Besonderer Ausschuss
- **B** a later law whose Erläuterungen/Begründung, or Parliament itself, attribute it to the Volksbegehren
- **C** core demand legislated later without any citation (attribution by content and timing)
- **D** no identifiable follow-up; **D\*** demand already matched the status quo
- **E** later legislation went the opposite way; **E\*** defeated by executive action

| Code | All 81 (1964–2025) | Pre-2018 (34) | Post-2018 (47) |
|---|---|---|---|
| A or B (formal win or cited law) | 20 (25 %) | 12 | 8 |
| C (law without citation) | 11 (14 %) | 3 | 8 |
| D (no follow-up) | 39 (48 %) | 13 | 26 |
| E (reversed) | 11 (14 %) | 6 | 5 |
| **Core demand became law by any route** | **21 (26 %)** | 11 (32 %) | 10 (21 %) |
| …of which citation-verified | 8 (10 %) | | |
| Median lag, signature week → law | 18 months | | |

Five of the ten post-2018 "law" cases are one event: the unanimous repeal of
the COVID-19-Impfpflichtgesetz on 07.07.2022 (BGBl I 131/2022), which MPs
credited to demonstrators and to the FPÖ, not to any Volksbegehren; several
of those Volksbegehren were "zur Kenntnis genommen" months after the demand
was already met. Excluding that cluster the post-2018 rate is 5 of 42.
Reclassifying the eight C rows that are contestable or partial (#7, #8,
#13, #43, #45, #47, #52, #57) as D lowers "law by any route" to 13 of 81
(16 %); counting the four D\* status-quo rows as wins raises A+B+C to 35 of
81 (43 %). The headline therefore lives between 16 % and 43 %, and the honest
reading is "a minority, but real".

**Wins that are traceable in primary documents:**

- Rundfunk 1964 → Rundfunkgesetz 1966; 40-Stunden-Woche and 13. Schulstufe 1969 → laws the same year (Parliament's own attribution).
- Tierschutz 1996 → Bundestierschutzgesetz 2004 (BGBl I 118/2004), eight years later; the Erläuterungen of RV 446 d.B. XXII cite the Volksbegehren in their first sentence (with a wrong d.B. number).
- Don't smoke 2018 → formally Kenntnisnahme with the ban motion rejected (27.03.2019), then BGBl I 66/2019 via Initiativantrag 859/A, whose Begründung opens with the 881,569 signatures; ban in force 1.11.2019. The Volksbegehren's own Gegenstand page never mentions the law.
- Tierschutzvolksbegehren 2021 → Entschließung 215/E → Initiativantrag 2586/A → BGBl I 130/2022 (Vollspaltenboden). The Antrag text never names the Volksbegehren or 215/E, and neither record links the other: the hop Volksbegehren → 215/E is machine-readable, the hop 215/E → 2586/A is not; the only mention of the Volksbegehren on the Antrag's page is the title of a rejected Bundesrat motion (581/UEA-BR).
- Klimavolksbegehren 2020 → Entschließung 160/E with ~50 measures → Klimarat 2022 and two Bundesregierung reports (III-365, III-835 d.B.), but no Klimaschutzgesetz as of 09/2026.
- Rechtsstaat & Antikorruption 2022 → Kenntnisnahme without Entschließung; the initiators' own audit (24.06.2026) reports an aggregate implementation score of 18.96 % across its 72 demands — 5 fully, 33 partly, 34 not implemented; weighting unpublished.

The "5–10 % of Volksbegehren are implemented" figure that circulates online
has no primary source. It is a single unsourced sentence on a private site
run by the Bevollmächtigter of eight Volksbegehren. Neither Der Standard's
2018 analysis ("1.683.714 Fälle für die Schublade", a prospective piece about
the three October-2018 Volksbegehren) nor its 2022 piece ("Wirkungslose
direkte Demokratie?") is readable behind the paywall; Poier 2017 and the
Demokratiebefund of the Initiative Mehrheitswahlrecht und Demokratiereform
(IDM) contain no outcome statistics; the IDM manifesto's "only the
first three were ever followed" is contradicted by Parliament's own
attributions.

## 5. Data sources and API

### 5.1 Parliament filter API — Volksbegehren are list-101 rows

There is no dedicated list ID like 81 for Ministerialentwürfe. Volksbegehren
are Verhandlungsgegenstände of type `I` (Beilage) with `VOLKBG` in the
`ART`/`DOKTYP`/`VHG` columns. Parliament's own "Volksbegehren" link is a
list-101 filter; `/recherchieren/gegenstaende/volksbegehren` is a 404.

```bash
# all Volksbegehren ever laid before the Nationalrat: count 85 (2026-09-06)
curl -s -X POST "https://www.parlament.gv.at/Filter/api/filter/data/101?js=eval&showAll=true&sortrnr=9&ascDesc=DESC" \
  -H "Content-Type: application/json" -d '{"VHG":["VOLKBG"]}'
# same rows via the Gesetzesinitiativen list (20-column header incl. an `ausschuss` code and `ausschusstext`)
curl -s -X POST "https://www.parlament.gv.at/Filter/api/filter/data/2006?js=eval&showAll=true" \
  -H "Content-Type: application/json" -d '{"DOKTYP":["VOLKBG"]}'
# RSS change feed with the same filter dimensions as query parameters (works for list 81 too)
curl -s "https://www.parlament.gv.at/Filter/api/filter/rss/101?VHG=VOLKBG&GP_CODE=XXVIII"
curl -s "https://www.parlament.gv.at/Filter/api/filter/rss/81?AKTIV=J"
```

This resolves two open questions in `api-exploration.md` §5 — the list-101
type vocabulary (`VHG`/`DOKTYP` values such as `VOLKBG`, `E`, `PET`, `BI`)
and the RSS URL scheme — and `architecture.md` §13.7.

Row format: 36 positional columns; take the meaning from the `header` array,
whose `label` and `feld_name` differ (index 7 is labelled "Nummer", feld_name
`ZITATION`). Useful 0-based indices: 0 GP, 1 ITYP, 2 INR, 4 Datum, 5 Art,
6 title, 7 Nummer ("348 d.B."), 8 DATUMSORT, 9 PHASEN_BIS, 10 Status,
11 DOKTYP, 14 HIS_URL ("/gegenstand/XXVII/I/348"), 22 THEMEN, 23 SW,
24 EUROVOC, 29 NRBR, 30–35 the vote columns (null for every Volksbegehren).
No signature count, no committee column.

**Coverage and gotchas (all verified):**

- 85 rows are **81 distinct Volksbegehren**, exactly Parliament's published figure. Four May-2024 items appear twice: XXVII/I/2546–2549 (STATUS 2, "Verhandlungsgegenstand der nächstfolgenden GP gem. § 21 Abs. 1a GOG") and again as XXVIII/I/1–4, which hold the Kenntnisnahme. The successor's `reference[]` points back ("Neuverteilung gem. § 21 Abs. 1a GOG-NR"); the predecessor has `reference: null` and carries its forward link only as HTML in `status.description` and in its last stage text. Dedupe on that link.
- `STATUS` is a phase index (1 Einlangen, 2 Erste Lesung / carry-over, 3 Ausschuss, 5 Plenum abgeschlossen), **not an outcome code**. Of 59 status-5 rows, 52 say "Kenntnisnahme", five (1999–2012) "Ausschussbericht N d.B. zur Kenntnis genommen", two 1990s rows "wurde im Nationalrat behandelt" — 57 are a Kenntnisnahme, but the literal word appears only from GP XXV on. Before GP XXII (2003) the codes are unreliable (finished items with status 2/3).
- **Pre-1996 rows are skeletal**: 13 have a single "Einlangen" stage and the two GP-XVIII items have no `phase` key at all; `status` is absent (not null) on all 15; scanned PDF only; and dates that are the GP's opening day rather than the real Einlangen (e.g. both GP-XVIII items show 05.11.1990). A historical baseline needs BMI plus Stenographische Protokolle.
- Sixteen status-1 rows: fifteen pre-1996 items (API-dated 1964–1990) plus "Gegen Abfangjäger" 2002 (XXI/I/1291), which lapsed untreated. So did Sozialstaat 2002 (never deliberated), and Temelin 2002 lapsed unconcluded after Rückverweisung to its Besonderer Ausschuss — the carry-over rule dates from 1.4.2009 (Art. 28 Abs. 4 B-VG, BGBl I 31/2009), mirrored in § 21 Abs. 1a GOG-NR since 2015.
- The detail endpoint returned the **wrong Gegenstand** (same INR, different ITYP) on 3 of 81 first fetches during this research; correct on retry. Always assert `content.doktyp === "VOLKBG"`.

### 5.2 Detail JSON — the generic Gegenstand structure

```bash
curl -s "https://www.parlament.gv.at/gegenstand/XXVII/I/348?json=True"   # Klimavolksbegehren
```

Everything sits under `content`. Unlike Ministerialentwürfe (flat `stages[]`,
no `status`), Volksbegehren use the **generic Verhandlungsgegenstand
structure** shared by Regierungsvorlagen, Selbständige Anträge, Petitionen
and Bürgerinitiativen:

- `progress[]` — phases `{id, name, empty}`; ids seen 1 Einlangen NR, 2 Erste Lesung NR, 3 Ausschussberatungen NR, 4 Plenarberatungen NR, plus empty Bundesrat phases. The set is not fixed (no first reading on XXVIII/I/1); filter on `empty`, do not key on id.
- `phase[].stages[]` — dated HTML text: Zuweisung, "Frist für die Aufnahme der Vorberatung: …", "Fristsetzung für Berichterstattung: …", each committee sitting incl. "vertagt", "Bericht <a href=/gegenstand/…>199 d.B.</a>", every Entschließungsantrag with angenommen/abgelehnt and party lists, the final "Kenntnisnahme Dafür: … dagegen: …". Entries carry `fsth[]` deep links into the Stenographisches Protokoll and `reden` speaker tables.
- `status` — `{number, description, documents}`; `description` is the plenary vote as HTML; `documents` the Ausschussbericht (PDF + HTML). **Only Entschließungen derived from unselbständige Entschließungsanträge (UEA) appear here** ("Angenommene Entschließung: 160/E"); Ausschussentschließungsanträge (AEA) appear only in the stage text, and without their resulting E number (48/AEA → 159/E is found only on the AEA page or in the E's own `reference[]`). Of the seven post-2018 items with adopted Entschließungen (ten Entschließungen in total), only two are visible in `status`. Parse stages, and fetch the AEA page for the E number.
- `documents[]` — the Volksbegehren text (PDF + HTML). `names` is absent; Bevollmächtigte are named only in the Ausschussbericht HTML (together with the per-Land result table).
- `statements` — the list-142 wiring (§6); `statementsstate` is `"0"` on 78 of 85 items, including every item before GP XXVII; the string `9 Begutachtung erst ab 1.8.2021 bei dem Doktyp "VOLKBG" möglich` appears only on the seven GP-XXVII items that arrived before 1.8.2021 (345–348, 771–773) — do not use it to date items. `approvalstate` is `9 Keine Zustimmung bei dem Doktyp "VOLKBG" möglich` on all 85.

The parser branch this needs is the one the ME→RV accountability layer needs
anyway, because Regierungsvorlagen use the same structure.

### 5.3 The chain and where it goes dark

| Hop | Machine link? | How |
|---|---|---|
| Volksbegehren → Ausschussbericht → AEA/UEA → Entschließung (E) | **yes, both ways** (one extra fetch for AEAs, see §5.2) | `reference[]` on the Ausschussbericht (AUB; "Hauptgegenstand des Berichts"), UEA/AEA ("Bezug zu"), E ("Grundlage der Entschließung", "Bezug zu … d.B."); hrefs in stage text |
| Entschließung → Bericht der Bundesregierung (III-d.B.) | **prose only** | the report's detail-JSON `description` cites the E in at least seven formats (`160/E XXVII. GP`, `E 160-NR/XXVII.GP`, …); 34 of 1,241 GP-XXVII reports do; never in the list-101 title. Only 1 of 380 GP-XXVII E items has a "Bericht der Bundesregierung erstattet" stage. |
| Entschließung / Volksbegehren → implementing Antrag or Regierungsvorlage | **no** | 2586/A (Tierschutz 2022) has `reference: null`; neither its title, description nor its own documents name the Volksbegehren or 215/E — the only mention on its page is the title of a rejected Bundesrat motion (581/UEA-BR) in the stage text; 859/A (Don't smoke) cites the Volksbegehren only in its Begründung prose. |
| Antrag / RV → BGBl | **yes** | Parliament `status.bgbllinks`; RIS BgblAuth metadata fields `Initiativantrag`, `Regierungsvorlage`, `Gesetzgebungsperiode` |

```bash
curl -s "https://data.bka.gv.at/ris/api/v2.6/Bundesrecht?Applikation=BgblAuth&Bgblnummer=BGBl.%20I%20Nr.%20130/2022"
# → Initiativantrag 2586/A, GP XXVII, DatumNationalrat 2022-07-07
```

How this compares with the monitor's own joins: ME→RV is fully structured
(`preconst[]` on the Regierungsvorlage, href on the ME page;
`api-exploration.md` §3), and the open RIS Begut ↔ Parliament ME join
(`architecture.md` §13.2) at least has candidate keys, because both records
describe the same document with the same dates. The Entschließung → bill hop
has neither a key nor candidate keys: different documents, months or years
apart, only topic overlap and the occasional prose citation. In kind it is
a constructed join; in degree it is harder than anything the Begutachtung
layer needs.

### 5.4 Full-text search: an undocumented endpoint that bridges the dark hop

The website's search box (Volltextsuche, VTS) talks to an Elasticsearch endpoint that indexes
document full text, including OCR'd scans, back to at least GP XX:

```bash
# form: the 11 dimensions (s.sm.query, category, date_range, gp_liste, gremium, doktyp, name_nvg, schlagwort, thema, searchType, searchScope)
curl -s -X POST "https://www.parlament.gv.at/Filter/api/filterform/vts/form?FBEZ=VTS_01" \
  -H "Content-Type: application/json" -d '{}'
# data: the signature count that appears only inside Begründungen → 11 document hits incl. 859/A
curl -s -X POST "https://www.parlament.gv.at/Filter/api/filterform/vts/data?FBEZ=VTS_01&page=1&pagesize=100" \
  -H "Content-Type: application/json" \
  -d '{"s.sm.query":"881.569","category":["Verhandlungsgegenstände"]}'
```

`s.sm.query` must be a plain string (an array yields HTTP 500). Rows carry
`link` (the document) and `weiterfuehrender_link` (JSON with the Gegenstand
URL). A sweep over the 47 post-2018 Volksbegehren, restricted to doktyp
A/RV/BUA in GP XXVI–XXVIII, produced 29 candidate pairs with 10 genuine
citations (34 % raw precision) and found **both** enacted follow-up laws
(859/A, 2586/A — the latter only via a Bundesrat motion's title embedded in
its page). False positives are systematic: Parlamentskorrespondenz headlines
embedded in Gegenstand pages, and institutional mentions (Volksbegehrengesetz,
Art. 41). Only 4 of the 47 post-2018 Volksbegehren are cited in any later
Gesetzesantrag or Regierungsvorlage at all; 2 of those led to a law.

The endpoint is undocumented — found in the website's JavaScript bundle, not
in any documentation — and may change without notice: a research aid, not a runtime dependency.

### 5.5 BMI — the only source for the signature side

- `https://www.bmi.gv.at/411/alle_volksbegehren_der_zweiten_republik.html`: one HTML table, 114 rows (109 through 2025 + 5 in June 2026), columns Jahr, Betreff, Eintragungszeitraum, gültige Eintragungen, Stimmbeteiligung, Rang, Unterstützt durch. **No outcome column, no IDs, no Parliament link.** Applying the era threshold (200,000 before 1.8.1981, 100,000 since) yields exactly the 81.
- Per-Volksbegehren pages (`/411/volksbegehren_der_xx_gesetzgebungsperiode/<slug>/start.html`): full text, Einleitungs decision, Bevollmächtigte and Stellvertreter, Verlautbarung PDF, results by Land/Bezirk/Gemeinde as CSV since 2022 (`GKZ;Name;Wahlberechtigte;Summe;Unterstützungen;Eintragungen`, UTF-8 BOM, semicolon), XLSX for 2018/2020, HTML only for 2002, nothing before.
- **No open licence statement** on any BMI page. data.gv.at has no structured Volksbegehren dataset: none of the 27 hits is one; the BMI entries are IFG proactive-publication ZIPs (single PDFs) since April 2026, the rest municipal and Land IFG notices and a Parlamentsdirektion Fachinfo.
- The only join key to Parliament is the title string. A Bundeswahlbehörde Zahl appears in the Ausschussbericht and might serve as a stable ID; untested.

### 5.6 Licence

Parliament's 25 CC-BY-4.0 datasets contain none dedicated to Volksbegehren.
The "Aktuelle Beteiligungen" dataset (list 143) does include Volksbegehren
currently open for Stellungnahmen (dimension `VOLKBG`) and licenses its
result lists CC BY 4.0; it excludes only Beteiligungen zu Ministerialentwürfen.
The RV/Anträge/BI dataset pages exclude "sämtliche Informationen zu
Stellungnahmen" from both free use and CC-BY; assume the same for
Volksbegehren Stellungnahmen. The
Volksbegehren text itself is the initiators' work; quoting the ≤500-character
Antrag is low-risk, the Begründung PDFs are third-party documents like
Stellungnahmen. Signers are never published (VoBeG § 17 Abs. 3: records
irrevocably deleted), so no GDPR issue exists on the signature side;
Bevollmächtigte hold a statutory function but are private persons — their
republication was not assessed.

## 6. Stellungnahmen on Volksbegehren (§ 23b GOG-NR, since 1.8.2021)

The most direct "something similar": since BGBl I 63/2021, Volksbegehren in
the Nationalrat accept public Stellungnahmen through the same form and the
same list 142 the monitor ingests. (BGBl I 81/2024 only added the
publication duty for ME Stellungnahmen; it did not create this channel.)

```bash
# Rechtsstaat & Antikorruptionsvolksbegehren: count 1465
curl -s -X POST "https://www.parlament.gv.at/Filter/api/filter/data/142?js=eval&showAll=true" \
  -H "Content-Type: application/json" \
  -d '{"BEZUG_GP_CODE":["XXVII"],"BEZUG_ITYP":["I"],"BEZUG_INR":[1626]}'
```

| Measure (GP XXVII + XXVIII, 48 Gegenstände, 44 distinct) | Value |
|---|---|
| Stellungnahmen total | 6,795 (GP XXVII 6,781; GP XXVIII 14) |
| Items with 0 / 1–10 / 11–100 / >100 | 9 / 30 / 5 / 4 |
| Largest | Impfpflicht: Striktes NEIN 4,703; Antikorruption 1,465; Wiedergutmachung COVID 301; Impf-Freiheit 109 |
| Submitter type | 6,792 private persons, 3 institutions (Aufstehn.at, Digital Society, one glitch row) |
| "Nicht-öffentliche Stellungnahme" placeholders | 2,063 (30 %) |
| Named rows expose | full name; the SN detail JSON (`names[].name`) adds postcode and town from 2022 on |
| Text form | inline (max 10,000 chars), PDFs rare |
| Mentioned in any of five Ausschussberichte checked | none |

The list-142 header is **identical** to the ME case (same 23 feldIds); only
values differ (`ITYP` `SN` vs `SNME`, Nr `275083/SN` vs `16/SN-118/ME`,
`Zu` `1626/I`). The SN detail JSON has an inline `statement` field instead
of a PDF under `documents`; list-142 hrefs end in a slash and
`…/SN/275274/?json=True` answers 308 with an empty body, so strip the slash
or follow redirects. One trap: `BEZUG_ITYP: ["I"]` also returns
Stellungnahmen on Regierungsvorlagen (type I Beilagen); a `VHG` filter on
list 142 returns 0 and `BEZUG_VHG` is ignored — join client-side against the
VOLKBG INR set from list 101, or query per item.

Consequences: the monitor's GDPR constraint applies here in a *heavier* form
(almost no organisations, private names with locality), volumes were a
COVID-era phenomenon (14 statements across the five GP-XXVIII items), and the
committee reports show no trace of the input — which is the Begutachtung
finding again, one level down.

## 7. Who already tracks this, and who would use it

- **Nobody maintains a per-Volksbegehren outcome table.** Wikipedia's list is frozen at September 2022 and has no outcome column; the BMI list has signatures only; Parliament publishes the January-2025 aggregate and an anecdotal wins paragraph; the IDM (Initiative Mehrheitswahlrecht und Demokratiereform) ceased activity in May 2024; OffenesParlament.at never had a Volksbegehren scraper; Demokratiezentrum Wien and mehr demokratie! have no tabulation; academic work (Poier 2017, Merli 2012) gives verdicts without numbers.
- **The narrative already exists**, unlike for Begutachtung: Der Standard "Volksbegehren im Parlament: Wirkungslose direkte Demokratie?" (2022), ORF "Don't Smoke ad acta gelegt" (2019), the Klimavolksbegehren's "Zwei Jahre ohne Klimaschutzgesetz" (2023), the Antikorruption initiators' audit (June 2026), Stiftung COMÚN's demand for binding effect above 4 % (June 2026). Parliament's presidents counter with volume ("21 Volksbegehren in one session year") and never with outcomes.
- **Carriers exist and already track by hand** (named because they act publicly for their initiatives): Kreutner/Fiedler/Mayer (Antikorruption), Zukunftsallianz (ex-Klimavolksbegehren), Bohrn Mena/COMÚN (Tierschutz), mehr demokratie!; FPÖ campaigns for binding referendums (motions 79/A(E), 86/A parked in the Verfassungsausschuss since March 2025), SPÖ filed 55/A in 2020 for special sessions with speaking rights.
- **Foreign models worth copying if it is ever built:** the EU citizens' initiative results page (March 2026; wins-first framing per initiative), the UK Parliament petitions JSON (`government_response`, `debate` fields per petition), and Mehr Demokratie e.V.'s Volksbegehrensbericht (Germany, coded outcomes, 26 % success rate counting "parliament adopted the demand").

## 8. Reform context

- The ÖVP-FPÖ Regierungsprogramm 2017–2022 planned a binding Volksabstimmung above 900,000 signatures for 2022, plus procedural guarantees (own sessions, speaking right, Stellungnahmepflicht of the minister). Nothing was enacted; the coalition ended in 2019.
- The Volksbegehrengesetz 2018 was last amended substantively by BGBl I 7/2023; the cost-refund reform (fivefold refund, currently €18,852 per successful Volksbegehren) was announced in January 2024 and again in April 2025 and has no bill. Note: VoBeG amendments come as Initiativanträge, so their absence from list 81 proves nothing.
- The **Regierungsprogramm 2025–2029** contains no Volksbegehren reform, only a coalition-discipline clause (PDF p. 17) and a Verfassungskonvent covering "das Zusammenspiel von repräsentativer und direkter Demokratie" (PDF p. 136; not convened as of 09/2026). **Relevant for the monitor instead:** PDF p. 137 commits to a "Verpflichtung zur ausreichenden Begutachtung von Ministerialentwürfen" and to "umfassende Umsetzung der Informationsfreiheit".
- Demokratiepaket 2013 (special sessions, e-signing) failed for lack of a two-thirds majority; the fault line — procedural upgrades vs binding consequences — has not moved in thirteen years.

## 9. Structural comparison with Begutachtung

| | Begutachtung (Ministerialentwurf) | Volksbegehren |
|---|---|---|
| Object | legal text with a formal successor (Regierungsvorlage) | ≤500-character demand text; no successor document |
| "What became of it" | a **diff** (mechanical once joined) | **attribution** over years (editorial) |
| Volume | 51–105 MEs/year on list 81; 134–259 consultations/year in RIS Begut | 81 in 62 years; ~6/year since 2018, 1 in 2025 |
| Base-rate statistics (mechanism 2) | feasible | not at this N |
| Visibility of the shelving (mechanism 1) | invisible today | already public and reported; only the downstream is invisible |
| Wins (mechanism 3) | recoverable from the text diff | exist (~25 % formal or cited, ~10 % strict) but need a curated rubric |
| Default reading of a naive tracker | mixed outcomes | 47/47 Kenntnisnahme — a blame counter by construction |
| Legal duty on the addressee | none | Behandlungspflicht with deadlines, no Begründungspflicht |
| Stellungnahmen | list 142, mixed persons/organisations | list 142 since 2021, almost only private persons |
| GDPR | private submitters by name | same, heavier (locality), plus Bevollmächtigte |
| Licence | CC-BY metadata; Stellungnahmen texts excluded | no dedicated dataset; list-143 result lists CC-BY; Stellungnahmen excluded by analogy; BMI unlicensed |
| Data quality | clean since 1979 | skeletal before 1996; carry-over duplicates; stage-text parsing |
| Concentration | ministries | 8 of 14 Volksbegehren in March 2024 from two Bevollmächtigte |

## 10. Options, effort, recommendation

| Option | Effort (4 h/week) | Yield |
|---|---|---|
| (a) hand-curated "Was wurde aus …" table | ~20–25 h for the 47 post-2018 cases; 40–60 h for all 81 | the only such table in Austria; contestable rows; largely restates the RLW aggregate plus a dozen stories |
| (b) automated procedural tracker on the existing plumbing (own estimate) | ~12–20 h | correct and stable, but shows one number Parliament already published |
| (c) semi-automatic downstream layer: structural chain (§5.3) + full-text sweep (§5.4) + BgblAuth join + review queue | ~15–20 h (gap-investigation estimate for the whole seeding layer incl. scheduled job; parts overlap with (b)) | 100 % recall on known enacted edges, ~34 % raw precision, a few dozen items to review; most Volksbegehren leave no trace to find |
| (d) do nothing; use the findings | 0 | see below |

**Recommendation: (d), with (b)+(c) as a post-funding option.** Volksbegehren
follow-up is a different problem class from Begutachtung follow-up, N is too
small for the evidence mechanism, the shelving is already visible, and the
default output is a blame counter. Do not make it a grant work package;
mention it at most as a natural extension once the generic Gegenstand parser
exists. What to
take from this research now:

1. **The argument, both ways.** The procedure ends in Kenntnisnahme 47 times out of 47, and the wins that do happen — Don't smoke, Tierschutz 2021 — are invisible in that record; a Begründungspflicht would make both visible. That is the strongest empirical illustration available that a respond-or-explain rule needs the *explain* part. Use it in the September/October conversations together with the Regierungsprogramm's Begutachtung commitment (§8).
2. **The API by-products.** The list-101 type vocabulary (`VHG`/`DOKTYP` values such as `VOLKBG`, `E`, `PET`, `BI`) and the RSS URL scheme close two open questions in `api-exploration.md` §5 and `architecture.md` §13.7. And Volksbegehren, Regierungsvorlagen, Anträge, Petitionen and Bürgerinitiativen share one detail structure; the ME→RV layer needs that parser branch regardless — build it generically and Volksbegehren become a type, not a project.
3. **The text-mining technique.** ME→RV needs no help (structured, `api-exploration.md` §3) and the open RIS↔ME join is a metadata problem the full-text endpoint does not touch. Where §5.4 could pay off in the Begutachtung work is the next accountability question: do the Erläuterungen of a Regierungsvorlage or the Ausschussbericht acknowledge the consultation input at all ("im Begutachtungsverfahren wurde eingewendet …", organisation names)? Test it there.

If someone asks for a Volksbegehren view after the conversations, (b)+(c)
for the 47 post-2018 cases is bounded work with honest wins to show (Don't
smoke, Tierschutz 2021) — and the framing rule applies with extra force:
surface the A/B/C stories first, never a Kenntnisnahme counter.

## 11. If it is ever built: implementation notes

- Enumerate via list 101 `{"VHG":["VOLKBG"]}`; dedupe § 21 Abs. 1a carry-overs on the successor's `reference[]`; assert `content.doktyp === "VOLKBG"` on every detail fetch.
- Outcome extraction is regex over `phase[].stages[]`, not `status.description`: patterns "Kenntnisnahme|zur Kenntnis (zu nehmen|genommen)" (the bare word appears only from GP XXV on), "Entschließung … angenommen", "(N/AEA)", "(N/UEA)", "Bericht <a href>N d.B.</a>", "Fristsetzung für Berichterstattung: DATE", "vertagt", "Zurückverwiesen", "Verhandlungsgegenstand der nächstfolgenden GP".
- Signature counts come from BMI (title join) or from the Ausschussbericht HTML. Bevollmächtigte only after the §5.6 assessment; until then show the sponsoring organisation or nothing.
- Stellungnahmen: per-item list-142 queries; count placeholders separately; never display private names.
- Downstream: A–E rubric with an explicit attribution class per link (cited-in-materials / structural chain / content-and-timing / none) and a human review queue; show lag in months; show reversals (E) as plainly as wins.
- Start the historical baseline at GP XX (1996); earlier needs manual work.

## 12. Open questions

- Is the Bundeswahlbehörde Zahl in the Ausschussbericht a usable stable ID between BMI and Parliament?
- Does the VTS index cover pre-GP-XX scans, and how stable is the endpoint? Is the CSV export the site help mentions a more stable channel?
- Can the "Bericht der Bundesregierung aufgrund einer Entschließung" edge be extracted reliably from III-d.B. descriptions (seven citation formats seen)?
- Do the Stenographische Protokolle of Volksbegehren debates ever cite the public Stellungnahmen? The five Ausschussberichte checked do not.
- Why do 2022 Stellungnahmen rows expose postcode/town while 2021 rows do not (form change or submitter-entered)?
- The RLW's per-Volksbegehren coding behind "36 of 46" is not published; ask the Parlamentsdirektion for the table.
- Der Standard's 2018 and 2022 per-case classifications remain unread (paywall).
- The Begutachtung-side baseline: list 81 (51–105/yr) vs RIS Begut (134–259/yr, includes drafts never sent to Parliament and possibly Verordnungen) must be reconciled before any base-rate number goes into a grant application.

## 13. Method and sources

Six parallel research lenses (legal, empirical record, data sources, prior
art, reform context, strategic fit), 18 adversarial verifications of the key
claims (each opening the cited source plus an independent primary source),
a completeness critique, and three gap investigations (the downstream table,
citation-mining feasibility, the Stellungnahmen layer). Corrections from the
verification pass are incorporated above; the largest were: the count of
post-2018 Entschließungen (7, not 3–4 — `status.description` hides AEA
ones), the four "implementing" Tierschutz bills (three were shelved SPÖ
motions), the dating of § 23b (2021, not 2024), and the VfGH holding (a
Land referendum-binding clause, federal conclusion by inference). A second
review pass on the finished memo (facts, API, framing) corrected a further
set: the last Besonderer Ausschuss (2012, not 2002), the list-143 licence
reading, the date of the carry-over rule (2009), the median (217 days, not a
range), the current Einleitungsphase count (36), the `statementsstate`
marker, and the analogy between the Entschließung → bill hop and the
monitor's own joins.

Primary sources: RIS Bundesrecht konsolidiert (B-VG 10000138, GOG-NR
10000576, VoBeG 2018 20009719), VfGH G 103/00 (RIS Judikatur), RIS BgblAuth
API; parlament.gv.at filter API lists 101 (Verhandlungsgegenstände), 2006 (Gesetzesinitiativen), 142 (Stellungnahmen), 110 (Parlamentskorrespondenz), Gegenstand JSON,
Fachinfos "Wie behandelt der Nationalrat Volksbegehren" and "Wie hat sich
die Nutzung von Volksbegehren seit 2018 verändert" (20.01.2025), PK0016/2025,
Wissenswertes "Volksbegehren" (Stand 1.1.2026), open-data licence pages;
bmi.gv.at/411; Regierungsprogramm 2025–2029 (BKA PDF). Secondary: ORF, Der
Standard, Salzburger Nachrichten, OTS releases, de.wikipedia lists, Poier
2017, Merli 2012, mehrheitswahl.at, mehr-demokratie.at, citizens-initiative
.europa.eu, petition.parliament.uk, mehr-demokratie.de Volksbegehrensbericht
2026.

---

## Appendix: all 81 Volksbegehren that reached the Nationalrat, first-pass outcome coding

Codes as in §4. Abbreviations: VB = Volksbegehren; AEA / UEA = Ausschuss- / unselbständiger Entschließungsantrag; E = Entschließung; AB = Ausschussbericht; RV = Regierungsvorlage; A = Initiativantrag; UEA-BR = Bundesrat motion; BVG = Bundesverfassungsgesetz. "Parliament item" is `GP/INR` of the Beilage (`/gegenstand/{GP}/I/{INR}`).
Lag is months from the Eintragungswoche to the vehicle. Rows marked
contestable or low confidence carry that flag in the Code column.
Signatures are the BMI's final valid counts (Don't smoke differs slightly
from the preliminary 881,569 quoted in the Initiativantrag).

| # | Year | Volksbegehren | Signatures | Parliament item | Formal outcome (Parliament) | Code | Lag (months) | Vehicle / what followed |
|---|---|---|---|---|---|---|---|---|
| 1 | 1964 | Rundfunk (ORF GmbH) | 832,353 | X/544 | API: Einlangen 11.11.1964 only (pre-1996 data gap) | B | 21 | Rundfunkgesetz 1966 (BGBl 195/1966) via Initiativantrag in GP XI, Parliament page attributes |
| 2 | 1969 | Schrittweise 40-Stunden-Woche | 889,659 | XI/1327 | Einlangen 03.06.1969 | B | 7 | Arbeitszeitgesetz BGBl 461/1969 (11.12.1969), Parliament attributes |
| 3 | 1969 | Abschaffung 13. Schulstufe | 339,407 | XI/1340 | Einlangen 10.06.1969 | B | 2 | 3. SchOG-Novelle BGBl 289/1969, Parliament attributes |
| 4 | 1975 | Schutz des menschlichen Lebens | 895,665 | XIV/135 | Einlangen 10.03.1976 | D | - | Fristenregelung unchanged |
| 5 | 1980 | Pro-Zwentendorf (Aufhebung Atomsperrgesetz) | 421,282 | XV/563 | Einlangen 03.12.1980 | E | - | BVG atomfreies Österreich BGBl I 149/1999 entrenched the ban |
| 6 | 1982 | Konferenzzentrum-Einsparungsgesetz | 1,361,562 | XV/1183 | Einlangen 28.06.1982 | E* (defeated by executive action, no law) | - | Austria Center built, opened 1987 |
| 7 | 1985 | Konrad-Lorenz (BVG Umwelt, Energie, Arbeit) | 353,906 | XVI/607 | Einlangen 23.04.1985 | C (contestable) | ~140 | Kraftwerk Hainburg abandoned 1986, Nationalpark Donau-Auen 1996; no citation |
| 8 | 1985 | Zivildienst-Verlängerung | 196,376 | XVI/683 | Einlangen 19.06.1985 | C (contestable, low confidence) | ~86 | Zivildienst 10 months from 01.06.1992 (ZDG-Novelle 1991), 12 months 1997 |
| 9 | 1985 | Abfangjäger-Volksabstimmung | 121,182 | XVI/856 | Einlangen 13.01.1986 | D | - | no referendum, Draken bought |
| 10 | 1986 | Anti-Draken Steiermark (Luftfahrtgesetz) | 244,254 | XVI/968 | Einlangen 25.04.1986 | D | - | Draken stationed |
| 11 | 1987 | Anti-Privilegien (FPÖ) | 250,697 | XVII/238 | Einlangen 03.09.1987 | D | - | - |
| 12 | 1989 | Senkung Klassenschülerzahl | 219,127 | XVII/1042 | Einlangen 04.09.1989 | D (late realisation 2008 attributed by Parliament to the 2001 VB) | - | - |
| 13 | 1989 | Rundfunkfreiheit (FPÖ, private radio) | 109,197 | XVII/1190 | API date 17.12.1986 (unreliable; Eintragung was 27.11.-4.12.1989) | C (contestable, low confidence) | ~43 | Regionalradiogesetz 09.07.1993 (BGBl 506/1993), driven by EGMR Lentia |
| 14 | 1991 | EWR-Volksabstimmung (Grüne) | 126,834 | XVIII/378 | API date 05.11.1990 = GP start (unreliable) | E | - | EWR ratified 1992/93 without referendum |
| 15 | 1993 | Österreich zuerst (FPÖ) | 416,531 | XVIII/1015 | API date 05.11.1990 (unreliable) | D | - | - |
| 16 | 1996 | Tierschutz (Bundes-Tierschutzgesetz) | 459,096 | XX/171 | 26.02.1997 Rückverweisung (deferred), 16.01.1998 Unterausschuss, never Kenntnisnahme | B | 98 | RV 446 d.B. XXII → BGBl I 118/2004 (NR 27.05.2004 unanimous); Erläuterungen cite the VB |
| 17 | 1996 | Neutralität | 358,156 | XX/172 | ablehnender AB zur Kenntnis 26.02.1997 + 18/AEA adopted | A (formal only) | 11 | 18/AEA |
| 18 | 1997 | Gentechnik | 1,225,790 | XX/715 | Besonderer Ausschuss; 51/AEA + 52/AEA adopted 16.04.1998 | A (+ partial law) | 12 | GTG-Novelle BGBl I 73/1998 (AB 1112, same session); Greenpeace 2007: partly implemented |
| 19 | 1997 | Frauen | 644,665 | XX/716 | 9 Entschließungen 53-61/AEA 16.04.1998 | A (formal) | 12 | - |
| 20 | 1997 | Schilling-Volksabstimmung (FPÖ) | 253,949 | XX/1065 | ablehnender AB zur Kenntnis 17.06.1998 | E | - | Euro introduced |
| 21 | 1997 | Atomfreies Österreich | 248,787 | XX/1066 | 72/AEA + 571/UEA (=140/E) adopted 07.10.1998 | A + C (near-verbatim law) | 19 | BVG atomfreies Österreich BGBl I 149/1999 (NR 13.07.1999, Ausschussantrag 2026 d.B.); Wikipedia: 'Sein Text wurde fast wörtlich in das spätere Bundesverfassungsgesetz übernommen' |
| 22 | 1999 | Familien | 183,154 | XXI/1 | AB 716 zur Kenntnis + 34/AEA adopted 04.07.2001 | A + B (Parliament attribution; RV 620 text itself never says 'Volksbegehren') | 22 | Kinderbetreuungsgeldgesetz BGBl I 103/2001 |
| 23 | 2000 | Neue EU-Volksabstimmung | 193,901 | XXI/445 | Kenntnisnahme 04.07.2001 | D | - | - |
| 24 | 2001 | Bildungsoffensive & Studiengebühren | 173,594 | XXI/966 | AB 1113 zur Kenntnis 22.05.2002, 7 UEAs rejected | B (Parliament attribution, partial) | ~80 | Klassenschülerhöchstzahl 25 via SchOG-Novelle BGBl I 116/2008 (RV 632 d.B. XXIII) |
| 25 | 2002 | Veto gegen Temelin (FPÖ) | 914,973 | XXI/1065 | Besonderer Ausschuss, Bericht 1250 d.B., Rückverweisung 10.07.2002, lapsed with GP XXI | D (never concluded) | - | Temelín operating |
| 26 | 2002 | Sozialstaat Österreich | 717,102 | XXI/1161 | Zuweisung 13.06.2002, never deliberated, lapsed | D (never treated) | - | - |
| 27 | 2002 | Gegen Abfangjäger | 624,807 | XXI/1291 | Einlangen 09.10.2002 only, lapsed | D (never treated; Eurofighter bought 2003) | - | - |
| 28 | 2003 | Atomfreies Europa | 131,772 | XXII/206 | Kenntnisnahme + 8/AEA 29.01.2004 (ÖVP/F only) | A (formal) | 7 | - |
| 29 | 2004 | Pensions (ÖGB) | 627,559 | XXII/550 | Kenntnisnahme 18.11.2004 | D | - | - |
| 30 | 2006 | Österreich bleib frei! | 258,281 | XXII/1448 | AB zur Kenntnis 21.06.2006 | D | - | - |
| 31 | 2009 | Stopp dem Postraub | 140,582 | XXIV/343 | AB zur Kenntnis 18.11.2009 | E (contestable) | - | Postmarktgesetz 2009 liberalisation |
| 32 | 2011 | Bildungsinitiative | 383,724 | XXIV/1647 | Besonderer Ausschuss; 252-255/E adopted 14.06.2012 | A (formal) | 7 | - (Merli 2012: 'verpuffen ... wie sich zuletzt am Bildungsvolksbegehren zeigte') |
| 33 | 2015 | EU-Austritt | 261,056 | XXV/781 | Kenntnisnahme 27.01.2016 | D | - | - |
| 34 | 2017 | Gegen TTIP/CETA | 562,379 | XXV/1608 | Kenntnisnahme 12.10.2017, 6 UEAs rejected | E | - | CETA ratified by NR 13.06.2019 |
| 35 | 2018 | Frauenvolksbegehren | 481,959 | XXVI/433 | Kenntnisnahme 24.04.2019 + 9/AEA, 65/E, 66/E adopted; 32 UEAs rejected | A (formal) | 6 | - |
| 36 | 2018 | Don't smoke | 881,692 | XXVI/434 | Kenntnisnahme 27.03.2019 (152/UEA rejected) | B | 9 | 859/A (12.06.2019) → NR 02.07.2019 → BGBl I 66/2019; Begründung cites the VB |
| 37 | 2018 | ORF ohne Zwangsgebühren | 320,264 | XXVI/435 | Kenntnisnahme 24.04.2019 | E | - | ORF-Beitrags-Gesetz 2024 (BGBl I 112/2023): device-independent Haushaltsabgabe from 01.01.2024 |
| 38 | 2020 | EURATOM-Ausstieg | 100,482 | XXVII/347 | Kenntnisnahme + 49/AEA 26.03.2021 | A (formal) | 9 | - |
| 39 | 2020 | Asyl europagerecht umsetzen | 135,087 | XXVII/345 | Kenntnisnahme 26.03.2021 | D | - | - |
| 40 | 2020 | Smoke-NEIN | 140,526 | XXVII/346 | Kenntnisnahme 26.03.2021 | D* (status quo already matched) | - | - |
| 41 | 2020 | Klimavolksbegehren | 380,590 | XXVII/348 | Kenntnisnahme + 160/E (503/UEA) + 48/AEA 26.03.2021 | A (formal/partial) | 9 | 160/E 'auf das Klimavolksbegehren basierende Maßnahmen' (Klimakabinett, Treibhausgasbudget...); Klimarat 2022; no Klimaschutzgesetz to 09/2026 |
| 42 | 2021 | Tierschutzvolksbegehren | 416,229 | XXVII/771 | Kenntnisnahme + 71/AEA (=215/E) 15.12.2021 | A + law | 18 | 215/E 'Maßnahmen zur Umsetzung des Tierschutzvolksbegehrens' → 2586/A → BGBl I 130/2022 (NR 07.07.2022); IA text does not name the VB; VfGH G 193/2023 |
| 43 | 2021 | Für Impf-Freiheit | 259,149 | XXVII/773 | Kenntnisnahme 15.12.2021 | E→C (contestable attribution) | 18 | Impfpflichtgesetz BGBl I 4/2022 (against), repealed BGBl I 131/2022 (07.07.2022) |
| 44 | 2021 | Ethik für ALLE | 159,978 | XXVII/772 | Kenntnisnahme + 64/AEA 15.12.2021 | A (formal) | 11 | - |
| 45 | 2021 | Impfpflicht: Striktes NEIN | 269,391 | XXVII/1179 | Kenntnisnahme 19.05.2022 | E→C (contestable attribution) | 10 | as 43 |
| 46 | 2021 | Kauf Regional | 146,295 | XXVII/1180 | Kenntnisnahme 06.07.2022 | D (partial VO) | - | Herkunftskennzeichnungs-VO BGBl II 65/2023, Gemeinschaftsverpflegung only |
| 47 | 2022 | Rechtsstaat & Antikorruption | 307,629 | XXVII/1626 | Kenntnisnahme 01.02.2023 | C (partial) | 20 | IFG BGBl I 5/2024 (NR 31.01.2024), KorrStrÄG 2023; initiators' audit 24.06.2026: 18.96 % of 72 demands |
| 48 | 2022 | NEIN zur Impfpflicht | 246,878 | XXVII/1627 | Kenntnisnahme 01.02.2023 (after demand met) | C | 2 | 2676/A → NR 07.07.2022 unanimous → BGBl I 131/2022 |
| 49 | 2022 | BGE umsetzen | 168,981 | XXVII/1628 | Kenntnisnahme 01.02.2023 | D | - | - |
| 50 | 2022 | Impfpflichtabstimmung: NEIN respektieren | 246,476 | XXVII/1629 | Kenntnisnahme 01.02.2023 | C | 2 | as 48 |
| 51 | 2022 | Mental Health Jugend | 138,131 | XXVII/1630 | Kenntnisnahme 01.03.2023 + 80/AEA 02.03.2023 unanimous | A (formal) | 10 | - |
| 52 | 2022 | Stoppt Lebendtier-Transportqual | 426,938 | XXVII/1631 | Kenntnisnahme 01.02.2023 | C (partial, contestable) | 2 | Tiertransportgesetz amendment inside 2586/A (introduced 19.05.2022, ten days after the Eintragungswoche) → BGBl I 130/2022; no citation |
| 53 | 2022 | RÜCKTRITT BUNDESREGIERUNG | 172,712 | XXVII/1661 | Kenntnisnahme 29.03.2023 | D (non-legislative) | - | - |
| 54 | 2022 | KEINE IMPFPFLICHT | 242,168 | XXVII/1660 | Kenntnisnahme 01.02.2023 | C | 1 | repeal 07.07.2022 preceded arrival in NR (22.08.2022) |
| 55 | 2022 | RECHT AUF WOHNEN | 134,664 | XXVII/1797 | Kenntnisnahme 05.07.2023 | D | - | - |
| 56 | 2022 | Kinderrechte | 172,015 | XXVII/1796 | Kenntnisnahme 05.07.2023 | D | - | - |
| 57 | 2022 | COVID-Maßnahmen abschaffen | 218,800 | XXVII/1799 | Kenntnisnahme 29.03.2023 | C (partial, contestable) | 9 | COVID-19-Überführungsgesetz (RV 2048 d.B.) ended COVID-19-MG regime 30.06.2023 |
| 58 | 2022 | GIS Gebühr abschaffen | 364,346 | XXVII/1795 | Kenntnisnahme 05.07.2023 | E | 9 | ORF-Beitrags-Gesetz 2024 passed same week; Parliament news: 'Basis dafür bildete ein Volksbegehren zur Abschaffung der ORF-Gebühren' |
| 59 | 2022 | Wiedergutmachung COVID | 184,936 | XXVII/1798 | Kenntnisnahme 29.03.2023, 1029/UEA rejected | D | - | - |
| 60 | 2022 | Uneingeschränkte Bargeldzahlung | 530,938 | XXVII/1794 | Kenntnisnahme 24.05.2023, 3 UEAs rejected | E | - | promised Bargeld-Verfassungsbestimmung never enacted; EU Reg 2024/1624 EUR 10,000 cap from 10.07.2027 |
| 61 | 2023 | ECHTE Demokratie | 131,619 | XXVII/2074 | Kenntnisnahme 31.01.2024 | D | - | - |
| 62 | 2023 | Beibehaltung Sommerzeit | 168,705 | XXVII/2075 | Kenntnisnahme 31.01.2024 | D (EU competence) | - | - |
| 63 | 2023 | GIS Gebühren NEIN | 167,406 | XXVII/2076 | Kenntnisnahme 31.01.2024 | E | - | ORF-Beitrag in force 01.01.2024 |
| 64 | 2023 | Lieferkettengesetz | 120,397 | XXVII/2077 | Kenntnisnahme 31.01.2024 (FPÖ against) | D | - | no national law |
| 65 | 2023 | Unabhängige JUSTIZ sichern | 143,217 | XXVII/2078 | Kenntnisnahme 31.01.2024 | D (pending: Bundesstaatsanwaltschaft Ministerrat 09.07.2025, not enacted) | - | - |
| 66 | 2023 | NEHAMMER MUSS WEG | 106,440 | XXVII/2079 | Rückverweisung 31.01.2024; Kenntnisnahme 21.03.2024 | D (non-legislative) | - | - |
| 67 | 2023 | BARGELD-Zahlung: Obergrenze NEIN! | 121,350 | XXVII/2080 | Kenntnisnahme 14.12.2023 | E | - | EU Reg 2024/1624 |
| 68 | 2023 | U-Ausschüsse live übertragen | 102,755 | XXVII/2175 | Kenntnisnahme 28.02.2024 | D (pending) | - | 540/A XXVIII pending in the Geschäftsordnungsausschuss, cites the Volksbegehren |
| 69 | 2023 | Asylstraftäter sofort abschieben | 197,151 | XXVII/2173 | Kenntnisnahme 28.02.2024 | D | - | - |
| 70 | 2023 | Umsetzung Lebensmittelherkunftskennzeichnung | 149,891 | XXVII/2174 | Kenntnisnahme 28.02.2024, 2 UEAs rejected | D (VO BGBl II 65/2023 covers Gemeinschaftsverpflegung only, predates treatment; demand was processed food and gastronomy) | - | - |
| 71 | 2023 | Lebensmittelrettung | 203,831 | XXVII/2176 | Kenntnisnahme 28.02.2024 | D | - | - |
| 72 | 2023 | NEUTRALITÄT JA | 116,832 | XXVII/2171 | Kenntnisnahme 28.02.2024 | D* (status quo) | - | - |
| 73 | 2023 | anti-gendern | 154,102 | XXVII/2172 | Kenntnisnahme 28.02.2024 | D | - | - |
| 74 | 2023 | Gerechtigkeit den Pflegekräften | 131,921 | XXVII/2409 | Kenntnisnahme 05.07.2024 | D | - | - |
| 75 | 2023 | Impfpflichtgesetz abschaffen | 101,393 | XXVII/2407 | Kenntnisnahme 05.07.2024 | D* (moot, law repealed 2022) | - | - |
| 76 | 2023 | COVID-Strafen-Rückzahlung | 101,652 | XXVII/2408 | Kenntnisnahme 05.07.2024 | D | - | - |
| 77 | 2024 | Glyphosat verbieten! | 121,734 | XXVII/2548 → XXVIII/3 | carried over § 21 Abs 1a GOG; Kenntnisnahme 24.09.2025 | D | - | - |
| 78 | 2024 | Essen nicht wegwerfen! | 126,767 | XXVII/2547 → XXVIII/2 | Kenntnisnahme + 6/AEA adopted 10.07.2025 unanimous | A (formal) | 16 | - |
| 79 | 2024 | Kein NATO-Beitritt | 109,089 | XXVII/2546 → XXVIII/1 | Kenntnisnahme 24.09.2025 | D* (status quo) | - | - |
| 80 | 2024 | Nein zu Atomkraft-Greenwashing | 105,955 | XXVII/2549 → XXVIII/4 | Kenntnisnahme 10.07.2025 | D | - | - |
| 81 | 2025 | ORF-Haushaltsabgabe NEIN | 119,368 | XXVIII/98 | Kenntnisnahme 24.09.2025 | D | - | - |
