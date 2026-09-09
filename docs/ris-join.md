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
- Detail pages wait at most 2 s for the join (`withinBudget`, `server/utils/budget.ts`)
  and otherwise render without the RIS block — the prewarm starts with
  `--no-block` after a restart, so a visitor can arrive before it finishes
  (measured 61 s on the first detail-page hit after the 2026-09-07 deploy).
  The dropped fetch is not aborted and still warms the cache; `/api/ris-map`
  keeps the unbounded call, which is what the prewarm hits.
- Nightly prewarm: systemd timer + oneshot in `deploy/systemd/`, installed
  and enabled by `deploy.sh` on every deploy and started after each restart;
  corpus TTL 20 h so the daily run always refreshes.
- ruleVersion 2 (§3a) with GP XXVIII fixtures and regression tests; the
  ministry lineage review for GP XXVIII is folded into it.
- The first §-level diff view (§6b).

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

### 6b. Shipped (2026-09-08): the first §-level view

- `server/utils/lawText.ts`: Word-template HTML → blocks → units. A unit is
  one § with its Absätze and Ziffern, or one Novellierungsanordnung (Z n)
  with the quoted § inside. The Gliederungssymbol is kept out of the unit
  text so a renumbered § compares equal.
- `server/utils/lawDiff.ts`: alignment in three passes — article + § heading
  (unique on both sides), then article + id where at least one side has no
  heading and the texts are ≥ 0.5 similar, then remaining units of the same
  article by similarity ≥ 0.6. LCS word diff with a 2.5 M-cell cap (long
  units get a similarity but no segments). Output in RV reading order,
  removed §§ placed where they stood in the draft.
- `server/utils/lawDiffService.ts` + `GET /api/consultations/:gp/:inr/diff`:
  finds the two Gesetzestext HTMLs on the ME detail (RV via
  `statements.documents`), fetches with a leaf cache per URL, diffs, caches
  24 h. `available: false` with a German reason when no RV exists yet or a
  text is PDF-only.
- `app/components/LawDiffSection.vue` on the consultation page, once an RV
  exists: "Was sich nach der Begutachtung geändert hat". The summary sentence
  stands alone; the list opens on request (32/ME has 330 units). Inside:
  filter chips alle / geändert / neu / entfallen / unverändert with counts, a
  text search over ids, headings and both texts, and one collapsible group
  per Gesetz of the package with its own counts (a single-law text has no
  group header). Rows in RV order with geändert / neu / entfallen /
  unverändert and "redaktionell" (see below), expandable word-level diff,
  both sources linked with CC BY attribution. Lazy client-side load so the
  page never waits for the two documents.

Live numbers, 2026-09-08: 43/ME → 449 d.B. gives 74 units, 8 unchanged,
58 changed (26 of them redaktionell), 6 inserted, 2 removed; 2.3 s cold,
14 ms warm. 100/ME (a Novelle) gives 13 Z units, 6 changed, 2 new, 2 gone.

Follow-up 2026-09-08, after the first screenshot: the draft and the bill
may title the same article differently ("Änderung des Umsatzsteuergesetzes
1994" vs "Bundesgesetz, mit dem das Umsatzsteuergesetz 1994 geändert wird"),
which made every Ziffer of 88/ME appear once as new and once as removed.
Articles are now paired first, by the law they name (stemmed title tokens
with the legistic boilerplate removed, Jaccard ≥ 0.5), then by article
number. Each Ziffer carries its instruction line as heading ("§ 6 Abs. 1 Z 9
lautet"), which is both the label a reader needs and the alignment key that
survives renumbering; the Ziffer number itself, like the § symbol, is kept
out of the compared text. The section explains Z 1, Z 2 … when the draft is
a Novelle.

"Redaktionell" is decided by what changed, not by how much: a changed unit
is editorial only if every inserted or removed piece is a citation, a
number, a date, a single letter (lit. a) or punctuation; a piece of
connectives alone ("und" → "oder") or any ordinary word makes it
substantive. The earlier similarity threshold (≥ 0.95) was wrong in both
directions on 43/ME: of 26 units above it only 3 are editorial, 13 hide term
changes such as "Vorhaben" → "Energieanlagen"; one unit below it (§ 34,
0.92) is pure reference shifting.

### 6c. RIS XML path and the Erläuterungen question (2026-09-08)

**RIS XML path shipped.** When Parliament has no HTML for the draft (GP
XXVII and earlier), `lawDiffService` looks up the draft's RIS record via the
GP map and reads the main document as layout XML; `parseRisXml` emits the
same blocks as the HTML parser (ueberschrift typ para/g1/g1min/g2/titel/
anlage, absatz typ abs/novao1/novao2, listelem, inhaltsvz; `kzinhalt` and
`layoutdaten` stripped), so segmentation, alignment and diff are shared.
The bill side stays Parliament HTML, which existed for RVs in GP XXVII.
Attribution switches to "RIS und Parlament"; `meSource` says which.
Fixture: 95/ME XXVII (Informationsfreiheitsgesetz) from RIS against 2238
d.B. from Parliament — 43 draft units, 30 bill units, 8 unchanged, 21
changed, 1 inserted, 14 removed. The 14 are real: the draft's Artikel 3 and
4 (Rechnungshofgesetz, Verfassungsgerichtshofgesetz) are not in the bill.
When a draft has no RIS record or RIS offers no XML, the section says so.

**Erläuterungen passage: not built, on evidence.** Sampled 2026-09-08:
of 18 GP XXVIII Regierungsvorlagen, 17 have HTML Erläuterungen, and exactly
one paragraph in all of them mentions "Begutachtung" or "Stellungnahme" —
a false positive about a different kind of Stellungnahme. Ministries do not
account for the Begutachtungsverfahren in the RV Erläuterungen, so a quote
feature would say "nothing here" almost every time. Dropped; the absence
itself is an argument for the respond-or-explain rule (mechanism 2), not a
UI element.

Known limits of this version: RIS XML variants from before ~2010 are
untested; Erläuterungen are not compared. Effort spent: about one focused day
against the five to seven estimated, because the corpus-test prototype
already held the parser and the alignment lesson.

### 6d. The Sammelgesetz problem, and the article marker (2026-09-08)

A corpus run over all 132 GP XXVIII drafts (90 have a comparison: 87 from
Parliament HTML, 3 from RIS XML) turned up two defects in the first version.

**1. The article marker was read from the CSS class.** `41UeberschrG1` without
"Artikel n" was correctly demoted to a section heading, but `43UeberschrG2`
*with* it was never promoted. 125/ME (Glücksspielgesetz) puts the package
title in `41UeberschrG1` and "Artikel 1" one level down; its Regierungsvorlage
does it the other way round. Every unit of the draft came out with
`article: null`, no article paired, and all 108 units read as new or dropped.
Now the text decides, not the class — including the placeholder numbering
("Artikel X1") a draft uses when it is written for a collective act whose
final article count is not known yet (22/ME, IFG-Anpassung of the BKA).

| | before | after |
|---|---|---|
| 125/ME | 108 units, 0 unchanged, 55 new, 52 dropped | 59 units, 11 unchanged, 6 new, 3 dropped |
| 58/ME Vergaberecht | 503 units, 192 unchanged, 133 new, 101 dropped | 413 units, 293 unchanged, 16 new, 11 dropped |
| 14 drafts changed in total | | every one an improvement, 76 untouched |

**2. ME→RV is not always 1:1, and the unit diff cannot say so.** Ten of the 90
reported 83–98 % of the bill as new. Not a parser fault: those bills are
collective acts. 22/ME is the Bundeskanzleramt's three articles, its
Regierungsvorlage merges every ministry's IFG draft into 138. Diffed unit by
unit that reads as "the ministry rewrote everything" — the false accusation
the framing rule forbids, only pointing the other way.

`diffLawPackage` therefore scopes the comparison to the laws both documents
carry and reports the rest as laws, not as paragraphs (`lawsOnlyInRv`,
`lawsOnlyInMe`). The fact survives, the false precision goes:

| ME | new before | new after |
|---|---|---|
| 12/ME Wehrgesetz | 603 | 1 |
| 17/ME IFG-Anpassung BMI | 586 | 7 |
| 21/ME Eisenbahngesetz | 610 | 8 |
| 22/ME IFG-Anpassung BKA | 611 | 2 |
| 24/ME IFG-Anpassung BMWKMS | 546 | 0 |

32 of 90 drafts scope out at least one law; drafts above 50 % new fall from 16
to 3 (19/ME, 62/ME, 103/ME — 62/ME verified as real: the Regierungsvorlage
more than doubled the StVO-Novelle). Units without an article always stay in,
and when no article pairs at all the scoping is skipped — an empty comparison
helps nobody.

**Consequence for §13.4 of `architecture.md` (ME→RV 1:n).** The run produced
the evidence that question was waiting for: 27/ME (IFG-Anpassung BMF) has two
Regierungsvorlagen, 134 d.B. and 129 d.B., both dated 2025-06-18. Against the
one the tool picks, 25 of its laws look absent — they are plausibly in the
other. Until the UI handles all strands, the copy says "in dieser
Regierungsvorlage" and adds that a draft can end up in more than one. It must
never read as "the law was dropped".

### 6e. The instruction number, and what a lost instruction costs (2026-09-09)

`segmentUnits` opened a unit only on `^\d+\.\s`, and a Novellierungsanordnung
whose number is not in that exact form fell through into the *previous*
unit's text. That is worse than losing it: two units then carry text that
belongs to neither, and both read as "geändert". Measured over the 131
GP-XXVIII drafts with a RIS document, three classes:

| | drafts | instructions |
|---|---|---|
| separator missing or unusual — "2.§ 30", "13 § 178", "4 . Dem", "222- Im" | 8 | 15 |
| RIS tagged the instruction as plain text (`absatz typ="satz"`) | 6 | 7 |
| first instruction of a law, unnumbered | 10 | 10 |

The third class matters most for coverage: a law amended in a single respect
carries no Ziffer, because there is nothing to count. For 110/ME and 59/ME
that one line *is* the whole Novelle — both segmented to zero units and their
comparison was refused outright. What makes such a line recognisable is the
**Promulgationsklausel directly above it**, and only that: three lines that
look identical follow something else (a continuation fragment, an instruction
quoted inside a payload, and the clause itself where RIS mistags it).

Promoting a block RIS did *not* tag needs two independent signals — the next
number in sequence, and standing outside any quoted payload. On the twelve
candidates in the corpus the two agreed every time: all seven outside a
payload were the next number, all five inside it were law text that merely
began with a numeral. Only an Absatz may be promoted; a `listelem` is a
Ziffer of a quoted list, numbered from 1 like an instruction, and satisfies
both signals by coincidence.

Two findings against the obvious simplification: `novao2` is **not** a
sub-item — 2.243 numbered `novao2` blocks are genuine first-level
instructions that RIS merely tags differently, and demoting them would melt
down a third of all units. And the 211 litera lines ("a) In Abs. 3 lautet der
erste Satz:") already sit correctly inside the numbered instruction above
them; RIS uses `novao1` and `novao2` for them interchangeably, so the class
is no guide.

Effect: 6.165 → 6.196 units, 20 drafts, two rescued from zero.

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
