---
paths:
  - "server/utils/annex/**"
  - "app/components/compare/TextComparisonSection.vue"
  - "app/utils/annexNotes.ts"
  - "scripts/harness/annexPdf.ts"
  - ".github/workflows/annex-drift.yml"
---

# The ministry's annex (Textgegenüberstellung)

The ministry's Textgegenüberstellung: its principles, its PDF, table and Word
readers, and the gate, with their measured figures and rejected alternatives.
The engine and oracle are in `docs/decisions/lesefassung.md`, the draft check
in `docs/decisions/draft-check.md`. What an entry holds, and the other areas:
`docs/decisions.md`.

## Principles

- **The annex confirms text, it never supplies it.** It is the ministry's
  reading aid; 10–13 % of its proposed versions differ from the draft itself
  (1,337 §§ in 78 drafts, 06.10.2026; §12.12).
- **Only firmly matched RIS records show an annex.** A weak match is the one
  error the RIS check cannot catch: another draft's annex quotes current law
  just as faithfully (§12.13).
- **Licence decides the source order, not completeness.** The
  Textgegenüberstellung is read from RIS (CC BY) first; Parliament's copy is
  a fallback that makes no CC-BY claim (§12.13).
- **The annex is held against the law as of the first day of the
  Begutachtung,** not today's (§12.13). A law's previous version is never
  derived from the promulgation date: amendments apply retroactively
  (§12.12).
- **Safe directions.** A wrong address is worse than none. A lost
  confirmation is better than a false one. A dropped PDF page is a hole the
  reader is told about, a misread page is undetectable, so the page is
  rejected. Half a name is worse than no name (§12.11, §12.13).
- **The drift baseline is compared for equality, moves in the same commit as
  the change that moves it, and is never rewritten by CI,** because a
  self-updating baseline absorbs the drift it exists to catch (§12.13).
- **No Textgegenüberstellung among a draft's documents is „Nicht lesbar"**,
  never „Nicht veröffentlicht", on a draft's page and on a Vorlage's
  (21.11.2026): a document list proves no absence, as for Erläuterungen.
  Drafts without an annex are almost all new laws, which need none (BKA-VD
  circular of 10.12.2015).
- **The annex section asks the Lesefassung of the same draft**
  (21.11.2026, `readAndCheck` in `textComparisonService.ts`): the mark
  needs the oracle's word, so the section waits for it. A Lesefassung run
  that throws, throws through the section (nothing cached, „Gerade nicht
  abrufbar"), except as `docs/decisions/draft-check.md` says for a failed
  read; where there is none (a Vorlage, Parliament's copy, a run not made)
  the draft check stands alone. The join of an annex § to the Lesefassung's
  outcome lives once (`shared/utils/annexOutcomes.ts`), for the page's
  placement and for the server's mark, and a § counts as confirmed only
  where every printed row of it is.

## The gate

- **An omission the annex makes without „…" is read as one only where the
  standing § proves it:** both columns jump from the same unit to the same
  later one (or a cell that opens the § starts at a later unit), and the
  standing § carries exactly the units the two numbers count between them.
  Anything else stays a stretch held whole. A unit missing from RIS that the
  annex skips silently cannot be told from one repealed long ago; fault
  class „Lücke-beide" measures that blind spot and is not held to the 95 %
  floor. Accepted as a blind spot, not a gap to close: closing it would need
  a third source for the units of a § that no upstream offers. A drop of the
  class below its 3 of 16 is still worth reading.
- **What stands in front of an omission mark is law unless it can only be
  the omission's label** (19.11.2026, `withoutHead` in
  `server/utils/annex/elision.ts`). A chain behind text of the stretch's
  own is the label only where a head can start: after a finished sentence,
  at a bare marker behind prose, at a range whose first number has no dot,
  or as the §'s designation behind its heading. Taken off from any space,
  a citation the draft changes was lost and the oracle could not see
  whether the engine changed it.
- **A § the annex shows as repealed is shown so only where the draft repeals
  it** (19.11.2026, `server/utils/annex/repeals.ts`): an instruction of the
  same law that deletes the § itself, a list or range naming it, or a whole
  division RIS files it under. Otherwise the § is withheld
  (`repealUnproven`), whatever the left check said. An empty right column is
  also what a reading leaves where it missed the § there (a quoted „„§ 1.",
  an annex printing instructions, a renumbering paired by its old number);
  the left check confirms such a § because its left column is the law in
  force. A draft that could not be read disarms the rule, as it does rule 2
  (`annex/verdict.ts`). **A division is proven by the §'s whole division
  path** (19.11.2026, `divisionPath`): walked back over the §§ the check
  fetched, a heading belongs to the § where it is outer to every division
  already taken, and which kind is outer is read from the law's own heading
  lists („TEIL B | … | I. ABSCHNITT"), never assumed; an unfetched § or a
  kind whose order the law never shows ends the walk. A repeal qualified by
  another division („Der II. Abschnitt des Teils A") proves a § only where
  the path holds both; lettered Teile and plural lists („Die Teile B und C
  entfallen") are read.
- **A § with no standing text is held against the whole draft**
  (21.11.2026, rule 2 in `annex/verdict.ts`): a § the draft inserts, one not
  in RIS, one of a draft that amends no law. `notInDraft` withholds it. It
  owes no check only where rule 2 held at least `MIN_NEW_WORDS` of new text
  (`REASON_NOTHING_TO_COMPARE`); otherwise it carries „nicht geprüft". A §
  renumbered into its number is marked (`REASON_RENUMBERED`). The whole
  draft, not the instructions for the §: the per-§ reference withheld 12
  such §§, 5 of them sound.
- **A Bund PDF annex is cut at an unread page**, as a Land's is, and a cut
  § stays unchecked (`REASON_CUT`, 21.11.2026).
- **The left column of a Bund annex is held by containment alone**
  (21.11.2026, measured, no rule). The gate's left check and the oracle's
  check 1 both ask whether the column's text stands in the standing §. They
  see a word or a figure the column misreads, not text it lost: a sentence
  dropped from the left column is seen by the oracle in 27 % (PDF) and 37 %
  (table) of the cases, and the gate's left check passes it in 92 % and
  99.7 %. It is withheld in 61 % and 67 % only because the word diff then
  shows the lost standing text as new and the right column's rules see
  that. A sentence both columns lack is invisible to both.
- **On the table path a withheld § names our filing too** (19.11.2026,
  `annexNotes.ts`): the cells are the ministry's, but the § a row belongs to
  is ours where it opens none. A designation typed as text — in the
  `typ="para"` heading, or at the head of both columns — opens its § like a
  `<gldsym>` (`typedDesignation` in `comparisonRows.ts`).

## The PDF reader

- **A § one column of a PDF annex prints twice is never paired by length**
  (19.11.2026, `unitsOfColumn` in `server/utils/annex/annexPdf.ts`): a
  print is dropped only as a contents entry, a print carrying no provision,
  or a word-for-word repeat; a later print that re-opens the § at an
  Absatz past the last one printed is joined to it in printed order; any
  other second print (a variant, staged versions, another law's § of the
  same number) makes the row `ambiguous`, and the gate withholds the §
  (`repeated`). Keeping the longest print dropped the rest without a word.
  No § opens on a line the line above runs on into („… gemäß" over
  „§ 19b.").
- **What a PDF annex prints before a law's first § is said where the
  columns differ in it** (19.11.2026, `frontMatterDiffers`): the parse
  leaves it out by method — Langtitel, Promulgationsklausel, and sometimes
  a provision without a §. Compared word by word, chrome that cannot be law
  text left out, a difference puts „Nicht im Monitor: …" at the law.
  Showing it as a row was rejected: an annex that prints amending
  instructions in the right column would diff an old § against an
  instruction. About one flag in five is a trivial difference; the sentence
  stays true there. A part set otherwise that yields no row counts its
  pages as unread (`droppedPages`).
- **Parliament's margin stamps come off its PDF before the geometry reads
  it** (23.11.2026, `annex/parliamentPdfStamps.ts`). Every page of its copy
  carries three runs turned against the text at the outer edge: the page
  count, the Beilage and the address. Left on, they stand in the columns as
  words of the law and refuse short pages at the frame check (18 of 465
  pages). A run goes only if its text is exactly a stamp's and it stands in
  the margin, and the frame check then counts what is left.
- **A page whose text is set off the document's frame is cut at its own
  gutter and judged against its own edges** (23.11.2026, `pageCut` in
  `annex/annexPdf.ts`). Some documents print the header pair in one place on
  every page and shift the text under it. Only where a line shows it: a run
  crossing the document's cut at one edge of the page's empty strip, the
  other column's run at the other. Every other page keeps the document's
  cut, and edges and margins are measured as read at that cut, so a page
  that did not move reads as if no other had. Rejected: one cut in front of
  the leftmost column (it cut words off the pages set further right), and
  moving a page into the document's frame (the margins of a moved page then
  decide what counts as a heading on the others).
- **Where ten runs crossing the cut end at one x with another run behind a
  real gap, the cut moves behind that edge** (23.11.2026,
  `cutPastSharedEdge`). The search covers the middle tenth of the page, and
  a gutter can lie outside it (630 d.B. XXVII); every full line of the left
  column then read as a heading across both columns.
- **Page furniture does not count towards the ten lines a column's edge
  needs** (23.11.2026, `columnEdge`), but stays in the measure: taken out,
  it moved real edges and joined words across table cells.
- **A repeal word alone beside a § only the left column opens is that §'s
  right cell** (22.11.2026, `repealedBeside` in `annex/annexPdf.ts`). Some
  annexes set „Aufgehoben" beside the heading and each Absatz and print no
  designation on the right (RIS CF28D2C0). The row goes out as removed, and
  such a word is never the heading of a § with its own designation.
- **Two or three flush lines under a finished sentence are the next §'s
  heading** (22.11.2026, `flushHeadingRun`): not centred, opening no
  Absatz, ending no sentence, begun with a capital. Its cost: the title of
  one Verordnung above an elided „§ 1. bis § 15. …" is shown nowhere. BWG's
  division line „XIII. …" stays at § 64 (rejected alternatives below).
- **A line that opens with the Absatz the other column opens a § with opens
  that § too, under a centred heading below a finished sentence**
  (23.11.2026, `opensBeside` in `annex/annexPdf.ts`). The designation goes
  on the line, or the word diff shows a number both columns share as new.
  An Absatz alone is no evidence: BAO § 86's „(1)" stands beside the other
  column's „§ 86a. (1)".
- **A column that opens a § without printing its designation opens it
  beside the other column's** (`sameAbsatzBeside`, and since 23.11.2026
  `openedAboveBeside`): at the same Absatz on one line, or under the other
  column's „§ 80a. (1) …." where this one leaves that line empty and both go
  on with the same Absatz. Only under the heading shape `opensBeside` asks
  for, and the shared heading then stays that §'s.
- **A heading both columns print over a § only one of them prints is the
  row's context** (23.11.2026, `moveSharedHeadings`), in neither column's
  text, since each column on its own gives those words to a different §.
  Only where the other column prints that § nowhere in the section.
- **A § without its full stop opens at „(1)" only before a capitalised word,
  a „§" or „bis (", under a finished sentence or a centred heading**
  (23.11.2026, `undottedFirstAbsatz`). „§ 5 (1) und (2) gelten" and „§ 5
  (1) Z 3" stay citations.
- **A line above a schedule's designation stays with the schedule before it**
  unless it is centred or RIS's own „Anlagen" or „Beachte für folgende
  Bestimmung" (23.11.2026, `unitsOfColumn`). A schedule names itself under
  its designation; what stood above was the last item of the one before.
  Its cost: schedules that print only „Siehe …pdf" are withheld, because
  that pointer is no text of the law in RIS.
- **„§ 4 lautet:" over „„§ 4. (1) …" opens § 4, and the instruction is no
  text of either §** (23.11.2026, `restatedParagraph`). Some right columns
  print the draft's instruction above the new wording. A designation behind
  a quotation mark counts only under an instruction naming the same §.

## The Word reader

- **Parliament's copy of an annex is translated into RIS's spelling at the
  door** (23.11.2026, `annex/wordTemplate.ts`). It is the ministry's Word
  file: `<p class=45UeberschrPara>` for `<ueberschrift typ="para">`,
  `61TabText` for `typ="tabtext"`, and a grid whose column numbers mean
  nothing, since one annex sets the same pair `2+1+2` and `1+3+1`. A cell
  therefore belongs to the column its middle stands in, by the widths Word
  states against the header pair. A class counts only for what it says: the
  ministries also set notes in the schedule class, and such a line opens no
  schedule. A document without the template's classes is returned
  unchanged, so the RIS path cannot move through this code.

## Measured figures

| What | Value | Sample, date |
|---|---|---|
| Textgegenüberstellung readable | XXVIII 124 of 139, XXVII 290 of 342 | 27.09.2026 (§12.13) |
| Annex's current-law column differs from RIS | 7.3 % | 1,337 §§ in 78 drafts · 06.10.2026 (§12.12) |
| The ministry's yellow highlighting misses a difference | 1,395 of 8,430 row pairs | 08.09.2026 (§12.13) |
| Silent omission read (`silentOmissions`) under fault injection | a skipped unit the engine loses caught 16 of 16; one missing from RIS too caught 3 of 16 | GP XXVIII · 14.11.2026 |
| Bund Initiativanträge with a readable ParlDion Textgegenüberstellung | XXVIII 23 of 44, XXVII 127 of 293 | enacted laws without a Ministerialentwurf · 12.11.2026 |
| Bund Vorlagen with a readable Textgegenüberstellung | XXVIII 20 of 21, XXVII 25 of 36 | enacted laws without a Ministerialentwurf, `pnpm corpus:vorlage-pdf` · 23.11.2026 |
| The Vorlagen read from Parliament's PDF: §§ shown / withheld | XXVIII 333 / 11, XXVII 215 / 34; 118 of XXVII's 128 „nicht geprüft" stand in two Sammelgesetze (2310 and 2432 d.B.) whose law boundaries the reader refuses. Not part of the figures on /genauigkeit, which are measured on drafts | 25 documents, 465 pages · 23.11.2026 |
| Heap for the largest of them (2310 d.B., 125 pages) | 65 MB on top of the process; all 25 read in a row on a built server under `--max-old-space-size=320` | same |

## Known limits

- **Three §§ the PDF reader files differently from the HTML** among 517
  compared: 625 d.B. XXVIII §§ 90b and 96a, 1493 d.B. XXVII § 27.
- **`normalizeText` turns an en dash into a hyphen** on every path, so a
  column shows „-" where the document prints „–". It is one sign and no word.

## Rejected alternatives

- **The Regierungsvorlage's Textgegenüberstellung to raise coverage.** It
  does not exist yet during the Begutachtung (§12.12).
- **OCR for scanned annexes.** Unnecessary: all 527 rasterised RIS annexes
  carry a PDF text layer (28.09.2026); and containment checks pass missing
  words (§12.13).
- **Withholding a whole law when deviant §§ cluster.** It discarded §§ that
  each passed; it became a note (§12.13).
- **Reading a § the right column quotes („„§ 1. …“") as a unit of the PDF
  annex** (19.11.2026). In annexes that print instructions it glues the
  next instruction into the § as new text, confirmed, and in a renumbering
  chain it pairs the old § with the new one by number, also confirmed. The
  repeal rule withholds those §§ with a true reason instead
  (`annex/repeals.ts`).
- **A Roman-numeral division rule for the PDF annex.** It moves BWG's
  „XIII. …" from § 64 to § 69, also wrong, and gives 6 other §§ a wrong
  heading (22.11.2026).
- **A heading rule for a line Parliament sets in the division class above a
  §** (141/ME XXVII). It mends the Vorlage's side and moves the breach to
  the Kundmachung, whose RIS XML sets the same heading as a division's
  (22.11.2026).

## Open questions

- **Cutting the rows of a PDF annex at the number of a
  Novellierungsanordnung.** It would mend the annexes that print instructions
  in their right column (1 of 114 in GP XXVIII) and touches every annex, so
  it waits for a measurement over the corpus
  (`scripts/harness/faultInjection.ts`).
