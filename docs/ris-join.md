# RIS Begut ↔ Parliament ME: the join, tested on a whole GP

**Status: resolved 2026-09-06.** The composite key described in
`api-exploration.md` §3 holds at corpus level. This document records the
corpus test (GP XXVII, all 350 Ministerialentwürfe), the rule that came out
of it, its failure modes, and what it means for the diff layer. Code:
`server/utils/risJoin.ts` (pure, tested); artefact:
`data/ris-me-map-gp27.json`; regression test: `tests/risJoin.test.ts`.

## 1. Why the join matters

Parliament (list 81 + `/gegenstand/{GP}/ME/{INR}`) knows the *procedure*:
arrival, Frist, Stellungnahmen, the ME→RV→BGBl chain. RIS
(`Applikation=Begut`) knows the *text*: draft, Erläuterungen,
Textgegenüberstellung as HTML/XML back to about 2004. Neither side carries
the other's identifier. The diff layer (architecture §12.2) needs the text
of the ME next to the text of the RV, so it needs this join, or a
Parliament-only source for the text (see §6).

## 2. Corpus test, GP XXVII (2019-10-23 to 2024-10-23)

| Measure | Result |
|---|---|
| list-81 rows | 353 |
| distinct MEs (dedupe by INR; duplicates are co-submitting ministries) | 350 |
| RIS Begut records total / in the GP window | 4,569 / 966 |
| RIS records in window classified Gesetz / Verordnung | 342 / 624 |
| MEs matched to exactly one RIS record | 337 (tier A 314, tier B 23) |
| MEs matched by the weak tier C rule | 1 (31/ME, title-blind) |
| Ambiguous | 0 |
| Unmatched | 12, all without any RIS record |
| RIS Gesetz records in window without an ME | 1 (published 12 days before the GP ended) |
| Sampled matches re-checked by hand | 25 / 25 correct |
| Absences re-checked by hand (title search + live RIS queries) | 12 / 12 confirmed |
| Pairs with an extractable Geschäftszahl on both cover letters | 6 / 6 identical |

Precision on the accepted set is at least 99 % (no false positive found).
Recall is 337 of 350 overall and 337 of 338 among MEs that exist in RIS.

### What each signal is worth

| Signal | Observation |
|---|---|
| RIS `EndeBegutachtungsfrist` == Parliament `Frist` | Equal in 336 of 337 true pairs. The one deviation is a RIS typo one month off (84/ME), proven by the cover letters. **Strongest signal.** |
| RIS `BeginnBegutachtungsfrist` vs Parliament arrival | Exact or minus one day in 72 %. RIS publishes first; Parliament's Einlangen lags 1–14 days in 28 % (125/ME: 14 days). Never trust this alone. |
| Dates + ministry | Not unique: the same ministry opens several consultations on the same day routinely. |
| Title | Containment beats Jaccard. RIS `Titel` enumerates every amended law, Parliament writes "X, Y u.a., Änderung". Parliament appends package abbreviations after " – " that RIS omits. Digits and roman numerals matter ("Teil I/II/III" packages). |
| Ministry code | 19 codes map 1:1. Exceptions: spelling (BMKOES/BMKÖS), state-secretary drafts filed under BKA, competence moves between GPs. Derive lineage groups from co-occurrence per GP, never hardcode for the future. |
| Full title from the ME detail JSON (`description` = "Ministerialentwurf betreffend …") | Equals RIS `Titel` or `Kurztitel` after trivial normalization in 317 of 337 matches. |

**Revision of an earlier assumption:** the recipe in `api-exploration.md`
§3 said to match on Beginn and to distrust Ende because of one-sided
deadline extensions. The corpus says the opposite: no one-sided extension
occurred in the whole GP, and Ende equality is the sharpest single signal.

### Why 12 MEs have no RIS record

All twelve are the BMK transport section (former BMVIT) between March 2020
and April 2021, plus BMEIA (76/ME, 93/ME). This is an upstream publication
gap on the RIS side, not a rule miss. It has to be a first-class state in
the product ("nicht im RIS veröffentlicht"), not an error.

## 3. The rule (ruleVersion 1, as tested)

1. **Dedupe list 81 by INR**, keeping the set of ministry codes.
2. **Classify RIS records** by title into Gesetz / Verordnung / other with
   regexes on `Titel` then `Kurztitel` (`classifyRisRecord`). Verordnungen
   get a score penalty of 0.15, "other" 0.05; they are never MEs.
3. **Candidates:** RIS records whose Beginn lies within [-14, +7] days of
   the Parliament arrival.
4. **Score** = 0.30·date + 0.20·ende + 0.15·ministry + 0.35·title − penalty.
   - date: 1.0 for offset 0/−1, 0.8 for −3..+1, 0.6 for −7..+3, 0.3 for −14..+7
   - ende: 1.0 if equal, 0.5 if within 3 days, else 0
   - ministry: 1.0 same code (after spelling map), 0.5 same lineage group
   - title: best of Kurztitel and Titel; containment ≥ 0.99 with ≥ 2 tokens on
     the shorter side gives 0.9 + 0.1·max(jaccard, common prefix); an
     abbreviation hit (Parliament's " – ABK" suffix vs RIS `Abkuerzung`
     or a bracketed abbreviation) lifts the title score to at least 0.9
5. **Assignment:** greedy 1:1 over all pairs by score, accept ≥ 0.75. A
   rival within 0.10 that is not a RIS duplicate (same code, same Ende,
   Beginn within a day, near-identical title) makes the row *ambiguous*.
   Tier A ≥ 0.90, tier B otherwise.
6. **Weak tier C:** below threshold, accept the single candidate that has
   exact dates, same ministry and class Gesetz when every other candidate
   scores < 0.5.
7. **States:** `matched`, `matched_weak`, `ambiguous`, `unmatched`. Persist
   the result as a committed JSON artefact with score and tier, plus a
   manual-override map for the few cases a human decided.

### 3a. ruleVersion 2 (2026-09-07, in force)

Driven by the first live GP XXVIII run (§6a) and the verifier's critique.
Checked against both GPs: on GP XXVII every accepted RIS id is unchanged,
15 rows move from tier B to A, and 84/ME keeps its match with the
discrepancy now flagged.

| Change | Why | Effect |
|---|---|---|
| Weights: date 0.20, **ende 0.30**, ministry 0.15, title 0.35 | Ende is the sharper signal (§2) | 12/ME XXVIII becomes reachable; tiers sharpen |
| A record whose Ende equals the Frist is a candidate regardless of Beginn offset | 12/ME XXVIII: RIS published 18 days before Parliament's Einlangen | recovers early RIS publications |
| RIS `Abkuerzung` is a third title field | 56/ME XXVIII: the whole package name "MinroG-Novelle IE-R 2025" sits in `Abkuerzung`, Parliament uses it as the title | title 1.0 instead of 0.13 |
| **Fristabweichung rescue**: Beginn exact, ministry exact, title ≥ 0.9, not a Verordnung, no non-Verordnung rival ≥ 0.6 → matched, tier B, reason `Fristabweichung: RIS-Ende ±N Tage` | 84/ME XXVII (RIS typo) and 56/ME XXVIII (one month apart). Three of four signals agree; the disagreement is data to show | both matched and flagged |
| Weak tier C admits class `other` | 11/ME XXVIII: RIS title "Verbot der unaufgeforderten Übermittlung von Genitalbildern" has no type word, dates + ministry unique | matched_weak |
| `ministryCodeOf` maps the long name "Europa, Integration und Familie" → BMEIF | RIS carries no code for that Staatssekretariat | 2 matches gain ministry 1.0 |
| Lineage groups for GP XXVIII: BMBWF/BMB/BMFWF, BMK/BMLUK/BMIMI/BML, BMSGPK/BMASGPK, BMAW/BMWET/BMWKMS/BMDW, BKA/BMEIF | successor codes after the March 2025 government; not yet needed by any pair, both sides used the same code | none observed, guards the seam |

Still open for a later version: exact normalized `description` (detail JSON)
as a tier before fuzzy scoring, which needs one detail fetch per ME; the
Geschäftszahl tie-breaker, which needs PDF text.

## 4. Operating it

- Nightly: fetch RIS Begut (46 pages of 100, 0.6 s apart, retries on the
  HTTP-200 error envelope), join against the cached list 81, write the
  artefact. One cheap `InBegutachtungAm` query per open ME cross-checks the
  live state.
- Lineage groups are per GP; GP XXVIII already has new ministry codes.
  Recompute co-occurrence and review the exceptions once per GP.
- RIS record duplicates exist (re-publications with identical dates and
  title). Keep them as `duplicates[]` on the row, do not treat as ambiguity.

## 4a. What is implemented (2026-09-07)

- `server/utils/risJoin.ts`: the rule above as a pure module, plus the
  adapter from mapped list-81 rows (`toMeListRows`).
- `server/utils/ris.ts`: RIS client. Full Begut corpus fetch (paged,
  retries, HTTP-200 error envelope handled), flattened records with the
  main-document HTML/XML/PDF URLs, cached 24 h; `getRisMapForGp(gp)` joins
  the cached list 81 against it, cached 30 min.
- `GET /api/ris-map/{gp}` returns the map (`RisMapResponse` in
  `shared/types.ts`) with a RIS page URL and document URLs per matched ME
  and the Beginn/Ende offsets, so a Fristabweichung is visible per row.
  Diagnostic endpoint for now; not yet exercised against the live API from
  the app itself (the fetch parameters and envelope were verified with
  curl and the corpus-test scripts).
- Consultation detail: `risDraft` on `ConsultationDetail`, rendered as the
  "Entwurf im RIS" block with the RIS entry, HTML/PDF text, a Fristabweichung
  note, and "im RIS nicht veröffentlicht" as a shown state.
- Nightly prewarm: systemd timer + oneshot in `deploy/systemd/`, installed
  and enabled by `deploy.sh` on every deploy and started after each restart;
  corpus TTL 20 h so the daily run always refreshes.
- ruleVersion 2 (§3a) with GP XXVIII fixtures and regression tests; the
  ministry lineage review for GP XXVIII is folded into it.

## 5. Artefact

`data/ris-me-map-gp27.json`: one row per ME with status, tier, RIS id,
Kurztitel, score, Beginn/Ende offsets, duplicates and reason. 350 rows.
Regenerate from the current rule with
`REGEN_RIS_MAP=1 pnpm vitest run tests/risJoin.test.ts` and read the diff
before committing: every changed RIS id is a claim that needs a look.
Test fixtures (CC-BY 4.0 metadata, no network needed):
`tests/fixtures/ris-begut-gp27.json` (993 RIS records around the GP
window) and `me-gp27.json` (353 list-81 rows); `ris-begut-gp28.json`
(340 records since 2024-09-15) and `me-gp28.json` (132 rows as of
2026-09-07).

## 6. Consequence for the diff layer

For GP XXVIII the join is not on the critical path: Parliament publishes
the ME Gesetzestext as HTML for 77 of 80 sampled MEs, and ME, RV,
Ausschussbericht and Plenum texts all use the same Word legistic template
(classes `45UeberschrPara`, `51Abs`, `991GldSymbol`, `52Aufzaehle*`,
`21/22NovAo*`, `41/42/43UeberschrG*`, `58Schlussteile0Abs`). A ~150-line
parser produced correct §-level units on three test chains.

GP XXVII and earlier are PDF-only on the Parliament side, and PDF text is
noisy. That is where RIS earns its place: HTML and XML drafts back to about
2004 with typed structure (`<schlussteil>`, `<inhaltsvz>`, gldsym, absatz
typ) and typed Erläuterungen.

Trap on either source: renumbering. In the
Erneuerbaren-Ausbau-Beschleunigungsgesetz chain the RV inserted two
paragraphs and a by-number diff marked 41 of 45 "changed" paragraphs that
were merely shifted. Align by Artikel heading and § heading with a
sequence fallback, never by § number alone.

Effort estimate: first §-level diff view on GP XXVIII with Parliament HTML
only, five to seven focused days. RIS join plus XML parser adds about two
more and buys the historical corpus.

## 6a. First live run on GP XXVIII (2026-09-07)

| Measure | Result |
|---|---|
| MEs on list 81 | 132 |
| Matched | 128 (tier A 122, tier B 6) |
| Ambiguous | 0 |
| Unmatched | 4 (11/ME, 12/ME, 56/ME, 60/ME), all with a best candidate below 0.75 |
| Ende offset among matches | 0 for all 128 |
| Beginn offset | 0 for 109, −1 for 12, the rest within −13..+1 |

The prewarm took 54 s cold. The four misses, resolved offline against the
RIS records of the period (fixtures in `tests/fixtures/*gp28*`):

| ME | Finding | ruleVersion 2 |
|---|---|---|
| 56/ME MinroG-Novelle (BMF) | RIS record exists: Beginn, ministry equal, package name in RIS `Abkuerzung`; RIS Ende 2025-11-10 vs Parliament 2025-10-10 | matched B, `Fristabweichung: RIS-Ende +31 Tage` |
| 12/ME Wehrgesetz (BMLV) | RIS published 2025-04-11, Parliament Einlangen 2025-04-29 (−18 days, outside the window); Ende equal | matched |
| 11/ME StGB (BMJ) | RIS title "Verbot der unaufgeforderten Übermittlung von Genitalbildern", no type word; dates and ministry unique | matched_weak C |
| 60/ME Eltern-Kind-Pass (BMASGPK) | no RIS record with these dates or this title | unmatched, correctly |

Under ruleVersion 2: 130 matched, 1 weak, 1 unmatched, 0 ambiguous.

## 7. Open questions left

- Does `Allgemein.Geaendert` move on RIS deadline extensions (history sync)?
- Do RIS Begut records ever get withdrawn (`IncludeDeletedDocuments`)?
- GP XXVIII rerun of the corpus test once the GP has enough MEs; expect new
  ministry codes and possibly different lag behaviour.
