---
paths:
  - "server/utils/kons/**"
  - "shared/utils/{explanationKey,unitWord,scheduleNumber,annexOutcomes}.ts"
  - "app/components/compare/{LesefassungDisclosure,AnnexLawEnd}.vue"
  - "app/utils/{lesefassung,annexGroups}.ts"
  - "scripts/harness/{kons,konsJudge}.ts"
  - "scripts/lib/{konsDraftPath,konsGoldenKeys}.ts"
---

# The consolidated reading (Lesefassung)

The consolidated reading: the engine that applies a draft's Anweisungen and
the oracle that holds the result against the ministry's annex, with their
measured figures and rejected alternatives. The annex's readers are in
`docs/decisions/annex.md`, the draft check in `docs/decisions/draft-check.md`.
What an entry holds, and the other areas: `docs/decisions.md`.

## What is shown

- **A § of our own consolidated text is shown only where the engine did not
  refuse, the result is plausible, and the ministry's own Textgegenüberstellung
  confirms it.** A wrongly applied instruction publishes a law text that does
  not exist, the worst error this tool can make; and a missing refusal says
  nothing about correctness (§12.12).
- **Refusing beats coverage.** An instruction is never applied in part; every
  target is resolved before any is written (§12.12).
- **Its name is „Ganzer Paragraph in der vorgeschlagenen Fassung (nicht
  amtlich)"** (19.11.2026), on the fold and in every sentence about it: the
  word of the column above it, which the ministries print over that column
  too; „Ganzer" says what differs from the column, which prints extracts.
  A name the reader meets in one place has to hold wherever it is repeated
  (`LesefassungDisclosure.vue`). Inside the fold it is „dieser Text", and
  „Lesefassung" stays a word of the code and the docs: a lawyer's term the
  reader has met nowhere on the page.
- **Silence is not „unchanged".** Every list of shown §§ carries its balance
  („gezeigt N von M"). A refused § stays in the denominator, and our own load
  ceilings are named as ours, never as an engine refusal (§12.12a).
- **„Confirmed" is a finding, never the default,** and unchecked is not
  checked-and-wrong. Withheld text is emptied on the server (§12.13).
- **Real states answer, outages throw.** A timeout is never cached as a fact
  about a draft („no annex", „law not found") (§12.12a, §12.13).
- **„anhang-fremd" is mostly ours, not the ministries'** (census of
  19./20.11.2026: of 232, 152 were our reader, check or lookup). The site
  says nothing about a ministry's text that this does not prove per case.
- **The Lesefassung's only load ceiling is the § budget** (19.11.2026).
  `nicht-geladen` says „mehr Paragraphen, als wir für eine Seite laden",
  so it may stand only where the draft's §§ exceed the budget. Prüfstand
  check `obergrenze`.
- **A § contradicted by the annex is shown where the draft's own
  Gesetzestext settles every place** (20.11.2026, `kons/draftWitness.ts`;
  started on the maintainer's word). The second reading is the draft's PDF
  in the same RIS record, printed from the ministry's own document; RIS's
  HTML is rendered from the XML the engine reads and is no witness.
  Parliament's copy is not read. Such a § carries both wordings at the § as
  a list of places („wie wir sie lesen") and is never counted as confirmed.
  What a place must meet, the measurement and the rejected designs: the
  module's doc comment.
- **One outcome stands at one block** (19.11.2026): where a unit is printed
  as two blocks (a table of contents with § symbols, a schedule in two
  parts), at the one that prints most of it, the later on a tie; the other
  says nothing, not even „nicht gefunden" (`placeAtParagraphs`; Prüfstand
  check `doppelt`).
- **A § of the Lesefassung names the annex law it was checked against, in a
  single Novelle too** (19.11.2026, `annexLawOf` in `kons/consolidate.ts`).
  Two law ends that meet at one group are merged, never one set over the
  other.

## The standing text

- **A § whose standing text RIS now files in a later BGBl's version says
  so at the §** (20.11.2026; `superseded` in `standingOnDay`,
  `laterAmendment` in `consolidate`). The page says one sentence: inside
  the fold under the RIS link (which shows the later text), and beside a
  withheld §'s reason. The sentence reports
  RIS's record, never „rückwirkend geändert": RIS dates such versions back
  to the law's first day or files an Inkrafttretens-§ from its earliest
  date, and what took effect when only the BGBl says. It is not a gap
  sentence (no lead word, no `GapNote`): nothing is missing. A failed
  issue-date lookup drops only the date from the sentence, never the law.

## The engine

- **Parser vocabulary grows only from lines measured in the corpus,** never
  on suspicion (§12.12). BGBl citations never lose their Teil: 84/2001 is a
  different law in Teil I and Teil III (§12.11).
- **A unit deletion is carried out only where every noun its verb governs
  belongs to the address** (19.11.2026). Any other noun names a part of the
  unit („die Zeilen betreffend …", „die Überschrift"), and the line is
  refused rather than carried out on the whole unit, which the
  consolidation would then report as repealed. Fail-closed: an unseen noun
  is refused, never read. Details: `partStruck` and `partBeforeVerb` in
  `kons/novao.ts`.
- **The Artikel a line creates are counted and withheld under their own
  number, and new text that opens an Artikel as a unit is refused**
  (20.11.2026, `ARTICLE_IN_PAYLOAD` in `kons/lawApply.ts`). Carrying such
  lines out needs a payload reader for Artikel and is not built: two drafts
  of the corpus amend an Artikel law.
- **A schedule is keyed by its own number, a Roman one in Arabic**
  (19.11.2026), on the engine's side and the page's
  (`shared/utils/scheduleNumber.ts`): „Anhang XIV" is „Anl. 14", because
  RIS files every schedule so. The bare „Anl." means a law's only schedule,
  and the page gives it to a numbered block only where the annex prints one
  schedule for that law.

## Units and their words

- **One reader decides an annex row's unit, for the oracle and the page**
  (20.11.2026). The oracle files a row under its § and the page finds the
  outcome for a § block through the same functions in
  `shared/utils/explanationKey.ts`: `explanationParaId` for a § („§ 5.",
  „§. 39."), `articleUnitId` with `articleUnitLaws` for a law whose units
  are Artikel (the B-VG). A form one side learns goes into the shared
  reader, never into a pattern of one side. The schedule key is still
  built twice (`unitKey` on the server, `annexUnitId` on the page, both
  through `scheduleNumber`) and agrees by lowercasing.
- **A sentence about a unit takes the unit's word** (20.11.2026):
  „Paragraph", or „Artikel" in a law whose units are Artikel
  (`shared/utils/unitWord.ts`). The word is passed in, not replaced by a
  neutral one. Which unit a block is comes from `articleUnitLaws` alone and
  is handed down by the placement (`ParaPlacement.unit`, `LawEnd.unit`); no
  sentence reads it off a designation. Without a unit every sentence says
  „Paragraph" (/genauigkeit). A sentence about the whole draft takes the
  plural over the annex's laws: „Paragraphen", „Artikel", or „Paragraphen
  und Artikel" where the draft carries both. The list at the end of a law
  writes „Art. 94". Left in Paragraphen: the Begründung's summary at a
  law's end (passages are keyed by § alone) and the § comparison.

## The oracle

- **„(Anm. N)", „Beachte für folgende Bestimmung" and a dated version label
  are no text on either side** (19./20.11.2026); the standing-text reader
  (`lawtext/konsTree.ts`) and the annex gate move together, or the annex
  check loses §§. The checks themselves (the comparison form, checks 1 to
  6, what each cannot see) are documented at their functions in
  `kons/tguOracle.ts`.
- **A repeal is a result like any other, and the annex can contradict it**
  (19.11.2026, `annexKeepsUnit` in `kons/consolidate.ts`; Prüfstand check
  `entfällt-stehend`). The page prints no line at a repeal, so a wrong one
  would stand silent.
- **Guard, oracle and the Lesefassung's display go past the matrix
  ceiling** (19./20.11.2026, `beyondCeiling`; the oracle's checks
  21.11.2026, `MAX_LINEAR_CELLS` in `diff/wordDiff.ts`); 166 §§ had been withheld for
  their length alone. Past 30 million token pairs the oracle contradicts
  („Wortdiff zu groß für den Abgleich") rather than confirm without a
  check. The annex rows and the Länder's comparison keep the ceiling until
  measured.

## The instruments

- **The Prüfstand holds the designations as well as the words**
  (19.11.2026, `markerSequence` in `scripts/harness/kons.ts`). „identisch"
  compares `plainText`, which carries no „(2)", „3." or „b)"; the page
  shows them. A confirmed § whose designations differ from the RIS text is
  to stay at 0.
- **What the instruments cannot prove:** the annex oracle and fault injection
  do not show the output is free of error. Only the BGBl test bench (RIS
  after entry into force) has ground truth (§12.12c). The 60 Gazettes of
  the bench are its tuning corpus; the 140 before them were 304 of 308
  identical.

## Measured figures

| What | Value | Sample, date |
|---|---|---|
| Engine against RIS after entry into force: identical | 81.0 % (1,454 of 1,794) | 60 BGBl · 19.11.2026 (§12.12) |
| Engine's own deviations | 1.1 % (20); 0.5 % (7 of 1,469) among unrefused §§ | same |
| Unrefused but not the law in force | 0.9 % (13 of 1,469) | same |
| Annex-confirmed §§ against the enacted text | what the gate shows, both paths: 430 of 431 identical, 0 deviating (table 114 of 116 confirmed, PDF 318 of 320; the rest incomplete) | 19.11.2026 (§12.12c) |
| Fault injection: known error classes caught | ≥ 95 % each | 26.10.2026 (§12.12c) |
| Fault injection, one word, figure or place in a printed stretch (word dropped, added, swapped, figure, citation, two Ziffern swapped) | 99.3–100 % on both paths; § heading 99.9 % (PDF) and 100 % (table) | GP XXVIII · 19.11.2026 |
| The same where no changed row prints anything (word dropped / added / figure changed) | 99.0 / 99.7 / 99.6 % (PDF), 99.5 / 99.9 / 99.7 % (table), floored | GP XXVIII · 19.11.2026 |
| A struck Absatz put back under its old number (fault class Zurück) | 45 of 45 (PDF), 25 of 25 (table) | GP XXVIII · 19.11.2026 |
| A word dropped from the result where the word classes do not go (classes Rand-weg, Mehrfach-weg) | 3,576 of 4,263 (83.9 %), not floored, a blind spot of its own on the page | GP XXVIII, `faultInjection.ts` · 23.11.2026 |
| Changed §§ with an outcome on the page | all 4,798 in 164 drafts (ME), 1,518 in 222 without Gegenstand; no invariant violated. The JSON of an `accounting.ts` run is the per-draft record | GP XXVIII · 19.11.2026 (§12.12c) |
| Of those shown | 2,773 (ME, 20.11.2026); 636 without Gegenstand (19.11.2026) | same |

## Rejected alternatives

- **„Ganzer Paragraph danach"** (30.09. to 19.11.2026). „danach" meant
  „after the change above" only under one; on `/genauigkeit` and in the gap
  sentences it read as „the next paragraph". „So würde der ganze Paragraph
  lauten" was understood but tied to nothing on the page.
- **The Erläuterungen as a second verification signal.** 71 % of their quotes
  appear in neither text (§12.12b).
- **More tolerance when matching against the annex** (ignoring commas and
  brackets, a counted check): masks real contradictions (§12.12).
- **A word balance as check 6** (19.11.2026): it caught every unprinted word
  fault but withdrew about 44 sound confirmations as noise (group titles,
  abbreviations spelt two ways, rows paired differently). Check 3 in place
  catches 99.0–99.9 % of the same faults with none.
- **Showing repealed §§ as „entfällt" in the reading version,** or the
  reading version as a section of its own: a duplicate of the line above
  (§12.12, §12.12a).
- **Skipping §§ the annex is silent on to save load budget.** Coverage fell:
  instructions need their anchor §§ (§12.12a).
- **Loading §§ that contain tables.** Cells would be read as paragraphs
  (§12.12).
- **A product check of the Ziffer and Litera sequence of a shown §.** It
  would withdraw 3 (order rule) or 38 (gap rule) of 612 shown §§, all
  correct, and catch none (21.11.2026). The bench fails on designations
  that are not the law's instead.
- **A word census of RIS's § XML against the tree as an invariant.** Over
  4,000 documents it flags 2,991 (21.11.2026).
