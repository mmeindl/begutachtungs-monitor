# Fixture provenance

Nothing in this directory is invented: every file is a recording of an official
document or of an official list, checked in so the tests need no network. The
table says for each one what it holds, where it came from, under which licence,
and when it was fetched. The date is the first commit that carries the file
(`git log --follow --format=%as -- <file> | tail -1`), which is the day it was
pulled from upstream; a document recorded again later shows up as a commit, not
as a silent overwrite.

The monitor draws on two upstreams and their terms are not the same, so the
per-dataset split the site prints on `/impressum` holds here too
(`docs/architecture.md` §13.1). `data/ris-me-map-gp27.json` is listed with them
because it is a test artefact in everything but its location:
`tests/risJoin.test.ts` measures the join rule against it.

| File | What it is | Upstream source and URL pattern | Licence | Fetched |
| --- | --- | --- | --- | --- |
| `annex-vkrg.xml` | The Textgegenüberstellung of the Verbraucherkreditrechts-Änderungsgesetz 2026 (GP XXVIII) as legistic XML, verbatim — a five-Artikel package, so it exercises the law boundaries as well | RIS-Begut `BEGUT_A93F21DF_4EC7_4B57_B449_E72C303E7D6E`, document `Materialien_0002_B29AE200_9698_4B1A_9FF6_2EFABCE198DA` — `https://ogd.ris.bka.gv.at/Dokumente/Begut/{id}/{document}.xml` | CC BY 4.0 | 2026-09-10 |
| `annex-uwg-pages.json` | The page geometry of the UWG-Novelle's Textgegenüberstellung (`pagesOf` output, coordinates rounded to two decimals), whose pages are turned a quarter turn — the geometry rather than the PDF, so the test needs no pdf.js | RIS-Begut `BEGUT_297DBC0E_ABF7_4F3F_9AA5_CC122D6680B5`, document `Materialien_0002_E25736EE_ABD1_42AD_B703_05293842C897` — `https://ogd.ris.bka.gv.at/Dokumente/Begut/{id}/{document}.pdf` | CC BY 4.0, derived from that PDF | 2026-09-10 |
| `ris-begut-95me-xxvii.xml` | The draft text of 95/ME XXVII (Informationsfreiheitsgesetz) as legistic XML, verbatim — the left side of the §-comparison test | RIS-Begut `BEGUT_COO_2026_100_2_1836568` — `https://ogd.ris.bka.gv.at/Dokumente/Begut/{id}/{id}.xml` | CC BY 4.0 | 2026-09-08 |
| `ris-begut-gp27.json` | 993 RIS-Begut records around the GP XXVII window: id, Kurztitel, Titel, Abkürzung, Stelle, Begutachtungsfrist | RIS OGD API — `GET https://data.bka.gv.at/ris/api/v2.6/Bundesrecht?Applikation=Begut&DokumenteProSeite=OneHundred&Seitennummer={n}` | CC BY 4.0 | 2026-09-07 |
| `ris-begut-gp28.json` | The same for GP XXVIII: 340 records since 2024-09-15 | RIS OGD API, as above | CC BY 4.0 | 2026-09-07 |
| `gate-avg.json`, `gate-informationssicherheit.json`, `gate-leitungspositionen.json`, `gate-obsorge.json`, `gate-organtransplantation.json` | One recorded gate run each (`scripts/ci/gateGoldenRecord.ts`): the draft XML, its Textgegenüberstellung as XML or as page geometry, every answer RIS gave for the standing law, and the verdict the gate reached per § | Draft and annex from RIS-Begut — `https://ogd.ris.bka.gv.at/Dokumente/Begut/{id}/…`, both named in each file's `urls`; the standing law from the RIS OGD API, `?Applikation=BrKons` | CC BY 4.0 | 2026-09-22 |
| `annex-baseline.json` | The drift alarm's baseline for GP XXVIII: per draft the counts of the gate run (checked, clean, substantial, dropped pages) — figures, no document text | Derived by `scripts/ci/annexDrift.ts` from harness runs over the RIS-Begut documents above | CC BY 4.0, derived from those documents | 2026-09-16 |
| `parl-rv-2238-xxvii.html` | The Gesetzestext of Regierungsvorlage 2238 d.B. XXVII. GP (Informationsfreiheitsgesetz) as Parliament's Word HTML, verbatim — the right side of the §-comparison test | Parlamentsdirektion — `https://www.parlament.gv.at/dokument/XXVII/I/2238/fname_*.html` | A freies Werk (§ 7 UrhG) per Parliament's dataset page — „die Dokumente selbst … ohne Lizenzierung frei nutzbar“; the result lists and the API data around it are CC BY 4.0 | 2026-09-08 |
| `me-gp27.json` | Every list-81 row of GP XXVII, 353 of them: Zitat, Titel, Ressortkürzel, Einlangen, Frist | Parlamentsdirektion, list 81 — `POST https://www.parlament.gv.at/Filter/api/filter/data/81?js=eval&showAll=true` | None — see below | 2026-09-07 |
| `me-gp28.json` | The same for GP XXVIII: 132 rows as of 2026-09-07 | Parlamentsdirektion, list 81, as above | None — see below | 2026-09-07 |
| `../../data/ris-me-map-gp27.json` | The RIS↔ME join map for GP XXVII, 350 rows with status, tier, RIS id, score and date offsets — the corpus ground truth of `tests/risJoin.test.ts`, regenerated with `REGEN_RIS_MAP=1 pnpm vitest run tests/risJoin.test.ts` | Derived from `me-gp27.json` and `ris-begut-gp27.json` | Parliament half: none — see below | 2026-09-07 |

**The last three rows.** They hold factual metadata of the Begutachtungsverfahren
itself — citation, title, ministry, dates — and for that dataset Parliament
grants no open-data licence: it excludes the Begutachtungsverfahren from reuse
as open data expressly, and no licensed dataset covers Ministerialentwürfe. On
what basis such metadata may be reused is the open question of
`docs/architecture.md` §13.1, and it is not settled here. They are kept because
the join rule's corpus test needs a fixed population to measure against: a rule
whose ground truth moves is a rule nobody can re-check.

Attribution, as CC BY 4.0 § 3(a) requires it: the licensor of every row marked
CC BY 4.0 is the Republik Österreich — Bundeskanzleramt (data.gv.at dataset
„RIS Daten Version 2.6"), and the licence is
<https://creativecommons.org/licenses/by/4.0/>. The Regierungsvorlage is the one
row that carries no licence to attribute: Parliament calls the documents of such
items freie Werke, free to use without licensing, and only the lists around them
CC BY 4.0 — it is credited to the Parlamentsdirektion as its publisher, not
under a licence. None of these files names a private person: grepped on
2026-09-23 across all fifteen, no list-142 row and no `SN-` citation occurs in
any of them, and the three hits for the word
„Stellungnahme" are the legal term inside the Informationsfreiheitsgesetz and
the Leitungspositionengesetz, not a submitter.
