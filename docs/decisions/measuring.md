---
paths:
  - "scripts/harness/**"
  - "scripts/lib/**"
  - "shared/data/genauigkeit.json"
  - "shared/utils/genauigkeit.ts"
  - "app/pages/genauigkeit.vue"
  - "app/components/genauigkeit/**"
  - "server/utils/harness/**"
  - "scripts/ci/**"
---

# Measuring and /genauigkeit

How the instruments in `scripts/harness` measure, what a round must pass, and
how `/genauigkeit` shows the result. The procedures are the `harness-round`
skill. What an entry holds, and the other areas: `docs/decisions.md`.


## Measuring

- **Every measurement calls the shipped function, never a copy,** and code in
  a harness that passes judgement is tested like production code (§12.12a).
- **A harness resolves a law as the page does** (21.11.2026,
  `scripts/lib/productionSources.ts`). A failed lookup counts as a draft not
  reached, never as a law that does not exist.
- **`station.ts` reads what the server reads** (21.11.2026): Parliament's
  HTML in the charset the page declares, and so does every script
  (`getParliamentHtml`).
- **Print the requested corpus beside the corpus actually reached;** a shrunk
  corpus looks like a full one (§12.12).
- **An engine change is measured over the corpus the published figures
  stand on,** as `scripts/harness/round.sh` runs the bench (`kons.ts --seit`,
  every Bundesgesetz of the period), never over a shorter run (18.11.2026):
  a shorter `--discover` once missed a range the full run held.
- **Report per-draft figures (median, share of drafts)** over pooled
  percentages, which a few large laws dominate (§12.12).
- **Figures about windows, claims and joins are measured on a production
  build with cold caches** (`pnpm build`, then the built server), never on
  the dev server: its derived cache keeps entries from before a code change,
  and the RIS stock grows between two runs, so two such figures can
  contradict each other.
- **After a change to the oracle, the engine or the annex reader, the fault
  floor runs on both paths and the BGBl bench with the oracle; after a
  change to the page, the accounting runs** (26.10.2026). Two runs are
  compared draft by draft in their `--json`, not by the pass mark: every
  invariant can hold while one counter doubles from a single draft. A key
  read in several places changes in all of them. The first alarms of a new
  check are read by hand: they find faults of the readers, not only of the
  engine.
- **A census of the instruction lines reads them as the check does**
  (23.11.2026): through `printedQuotes`. Run on the plain text of the
  blocks, it never saw a quotation and reported that no line changed its
  reading. A „nothing moved" from an instrument that never saw a quotation
  is no result.
- **A document in two formats is read through both readers** (23.11.2026).
  A Regierungsvorlage that Parliament publishes as HTML and as PDF is a free
  control of either reader: it found a list lost from the PDF reading
  (630 d.B.) that reading by eye had missed.
- **The harness cache never answers the Begut list** (20.11.2026,
  `isBegutSearch` in `scripts/lib/harnessCache.ts`). Served from disk it
  froze every round, and the weekly drift alarm could not see a new draft,
  the only thing that shows a ministry's new layout. Every record says its
  window and the day the list was fetched.

## The BGBl bench

- **The BGBl bench scores the engine and the gate, not the page's glue**
  (21.11.2026, `scripts/harness/kons.ts`). It does not drive
  `consolidate()`: the Artikel labels, the chains and the doubled laws are
  held by the oracle and by `tests/konsGolden.test.ts`, never by enacted
  law. Its input and its truth are read by the same reader (`konsTree`), so
  a block that reader drops is missing on both sides and scores
  „identisch".
- **The bench reads every Bundesgesetz of the period, and nothing drops out
  unsaid** (24.11.2026, `kons.ts --seit`, `scripts/lib/benchCensus.ts`).
  Nothing proves that every way a law can go wrong has been thought of, so
  the builder holds three things instead: no BGBl number is missing; every
  entry ends in one outcome; and a law the bench cannot score, a wrong
  repeal, or a kind of change no law before made, refuses the round until a
  person has read it and entered it in `benchKnown.ts`. A shown § that is
  not the law refuses nothing: the page prints that figure itself.
- **The bench reads RIS as it stands, not as a cache once saw it**
  (24.11.2026; details: `kons.ts`, „What `--cache` serves from disk"). An
  absence is asked live before it counts.
- **The bench passes a law's clause as the page does** (24.11.2026,
  `konsLaw.ts`): a Novelle may name its law only by its long title, so the
  resolver takes a name equal to RIS's long title, word for word.
- **The figure for the whole § is measured on the path a reader meets**
  (23.11.2026, `kons.ts --entwurf`, `scripts/lib/konsDraftPath.ts`). The
  BGBl bench says only that the engine and the gate reproduce RIS from the
  law's own instructions. The page's first figure is `consolidate` on the
  drafts behind that bench, scored only where the draft's instruction and
  the text in force went into the law unchanged, the one case with a single
  right answer. The second witness's figure stays beside it and is no
  evidence for drafts: on the bench it reads a Bundesgesetzblatt against
  itself.
- **The draft path counts the shown §§ no enacted law of the bench joins,
  and the page says how many** (24.11.2026). Such a § counts as „nicht
  Gesetz geworden" only on proof (`noArticleFor`); without it the § stays
  at „no law".
- **What the page composed for a new law is kept at first sight, and scored
  as it was** (24.11.2026, `scripts/lib/firstSight.ts`,
  `scripts/harness/firstSight.json`, `kons.ts --erstsicht`). Once a round's
  faults are fixed, how often the page is right on a law nobody corrected
  it on cannot be measured afterwards. Only the builder writes the file;
  no bench run on a law newer than the last round happens outside one. The
  figure stays off the page until it covers enough drafts (about three a
  month, so roughly half a year); until then the round prints it.
  Rejected: a weekly job that froze the rules at a git tag to score only
  later laws; its alarm would have watched the frozen code, not what runs.
- **A bench line promises nothing it does not check** (19.11.2026,
  `scripts/harness/kons.ts`): the class „unverändert gelassen" is split by
  why the § stood still, a § is scored under its own number, and the
  unrefused block sums to its denominator.
- **A bench keys a unit as the page keys it** (`unitKey`, `unitsByKey`;
  19.11.2026). The ME bench and the fault injection key the same way.

## Fault injection

- **A new gate rule is held to fault injection before it is trusted**
  (10.09.2026, `scripts/harness/faultInjection.ts`). A corpus shows only
  what a rule fires on, never what it lets through: the left check alone
  passed 93 % of lost sentences before an injection measured it.
- **The fault harness judges an annex fault through the whole chain the
  page runs** (21.11.2026, `judgeChain` in `faultInjection.ts`). A class is
  held to 95 % only where the chain can reach it (`CHAIN_FLOORED`); a class
  not held carries its reason in the record (`CHAIN_NOT_FLOORED`), so a
  floor never fails by construction and never passes by silence.
- **A heading at the foot of a §'s new text has to be the following §'s**
  (23.11.2026, `isFollowingHeading` in `kons/tguOracle.ts`). A removed pass
  falls to check 2's contradiction, no looser reading.
- **A fault builder builds what its name says** (21.11.2026,
  `scripts/lib/rightColumnFaults.ts`): a figure, not a label; a sentence,
  not a marker; an edit placed by the diff's word index, never at the first
  occurrence of its text.
- **A floored class that cannot occur on a path says so** (21.11.2026): the
  floor and the record read „nicht anwendbar" instead of „nicht gehalten",
  only while no site is found.
- **„Lücke" stays below the floor's 20 tries on the PDF path, and a round
  says so** (23.11.2026). Trying every skipped unit would clear the floor
  with no more evidence, so a round is written with
  `--erlaube-ungehalten=Lücke`.
- **`markedParas` is what the page marks, `uncheckedParas` every unchecked
  verdict** (21.11.2026, annex records): a figure about the mark reads the
  first.
- **An unchanged annex row is held against RIS, and a hit costs a mark, never
  the §** (the maintainer's decision of 23.11.2026, `unchangedRowsNotStanding`
  in `annex/coverage.ts`, `annexMark.ts`). The rule rejected on 11.09.2026
  withheld; since a § can carry „nicht bestätigt", a false alarm costs a
  pill. Only §§ that show a change. A foreign sentence inside a changed row stays under the left
  check's 95 % where it is short against its row, and the page says so.

## The § comparison and the stations

- **The § comparison is held by `scripts/harness/station.ts`** (19.11.2026):
  its invariants must hold for every pair, and every residue of its null
  comparisons that is not editorial carries its reason in
  `scripts/harness/stationBaseline.json`. A residue there is a line to
  explain or fix, never an accepted one.
- **The § comparison is held to faults** (20.11.2026,
  `scripts/lib/stationMutations.ts`, `station.ts --mutationen`): a change
  of substance set into a unit may never come out „unverändert",
  „redaktionell" or without a marked run; a miss fails the run.

## The Länder

- **The Länder's harnesses fail as the Bund's do** (20.11.2026,
  `landStations.ts`, `landGuard.ts`). An invariant hit read and found to be
  the documents' own stands in `landStationsAccepted.json` with its reason,
  and an entry whose hit no longer occurs fails the run as a new hit does.
  Kärnten's comparison stands in the record apart from the four Länder the
  draft rules are asked of.
- **What a Land's § strikes is held against the draft, and sets the mark**
  (the maintainer's decision of 23.11.2026, `struckNotHeld`,
  `landTguGuard.ts`). „Nicht geprüft" where struck words have no
  instruction, or where a § with no new word strikes what the draft does
  not name. Nothing is withheld. Kärnten's §§ shown as changed or new all
  carry „nicht geprüft" (`withoutDraftRules`): no draft rule is asked of
  them.
- **A Land's law page has a harness** (20. and 22.11.2026,
  `scripts/harness/landLawChanges.ts`): every § RIS ties to a
  Landesgesetzblatt ends exactly once, shown or withheld with a reason, or
  the section is off with its sentence. From the cache alone it cannot read
  a § never compared before: only a run against RIS shows a newly matched
  law's comparisons.

## From a round to /genauigkeit

- **The figures on `/genauigkeit` come out of a measurement round, never
  out of a hand** (19.11.2026). `scripts/harness/genauigkeit.ts` reads the
  round's records — `kons.ts`, `faultInjection.ts` on both annex paths,
  `annexPdf.ts`, `station.ts`, `accounting.ts` with and without `--ris`, and
  the Länder harnesses' `summary.json` — and writes
  `shared/data/genauigkeit.json` with the day and the commit measured;
  `shared/utils/genauigkeit.ts` puts it into words. Not in CI: the
  accounting asks a running server and a round takes minutes. A figure
  typed into copy is wrong by the evening.
- **A round reaches `/genauigkeit` only where it passed its own gates**
  (20.11.2026, `scripts/lib/genauigkeitRound.ts`). Every harness record
  names its commit (`+dirty` over an uncommitted tree), its time and how
  much of its corpus it reached (`scripts/lib/harnessRecord.ts`). The
  builder refuses a missing record, a funnel that does not add up, station
  breaches, Länder hits, records from more than one day, an accounting
  with failures, a fault floor that failed or did not run, a floored class
  tried fewer than 20 times („nicht gehalten", never a pass), records of
  several commits or of a dirty tree, a corpus reached in part, and a
  confirmed § whose designations deviate from the enacted text. Two
  exceptions, only by name and written into the record:
  `--erlaube-ungehalten`, `--erlaube-gemischt`.
- **A round names one period, and the builder holds it** (23.11.2026,
  `--nur-periode`, `inPeriod`). RIS ignores the period filter, so „the 400
  newest" held drafts of the period before. The weekly drift alarm keeps
  the whole window. The page also says the whole the readable annexes are a
  part of: drafts in RIS, with an annex, read, without an amending clause,
  refused.
- **The Länder's records are held like the Bund's** (23.11.2026): a
  tampered round of 40 of 372 pairs had built without refusal. The builder
  refuses a Land that did not reach its documents, breaches, missed
  mutations, a failed floor, baseline findings and an unbalanced page
  accounting.
- **The record says what the page shows of the ministry's annex, and what
  catching did with a §** (22.11.2026, `annex.marks`, `annex.chain`). Since
  the mark stands on the gate, the gate's verdicts are not what a reader
  sees. The builder refuses annex records
  written before the mark, records whose shown §§ are not the gate's
  verified and unchecked ones, a fault record without the chain, and a
  floored chain class that fell. A wrong word, figure or label in the new
  text never withholds the § — it is shown with „nicht bestätigt" — so each
  bar of the chain says under it how many caught faults leave the § on the
  page (`faultNoteDe`), and the page's opening says „wird nicht gezeigt oder
  trägt einen Vermerk". A floored class the harness says cannot occur on a
  path („nicht anwendbar") is not an unheld one and needs no
  `--erlaube-ungehalten`.

## What /genauigkeit shows

- **`/genauigkeit` is scanned, not read: shares in view, counts one click
  down** (maintainer, 24.11.2026). Exact counts of Paragraphen and Entwürfe
  tell a reader less than shares and figures. Four shares at the top, as
  large as a heading; what stays to check as lines that open in bold; one
  picture of an injected fault for what every share is of; and per kind of
  comparison the same order (`GenauigkeitArt`): what it is held against,
  one figure, the faults, „Im Einzelnen". The figure is a square of 100
  where a § can be one of several things (`GenauigkeitHundert`: no mark,
  „nicht bestätigt", „nicht geprüft", not shown, each square drawn as the §
  looks on the page, no hue), a funnel for how many whole §§ arrive
  (`GenauigkeitTrichter`: the steps' figures, each drop with its why), and
  frequencies („34 von 1.000") where a percentage would read as rounding.
  Parts of one whole are rounded by largest remainder (`largestRemainder`),
  so the squares add up to 100 and a funnel's drops subtract to its next
  figure. Every count, rule and sentence stands under „Im Einzelnen" of its
  kind. A figure measured where the rules were tuned says what that means
  for a reader at its figure in the section („Bei neuen Gesetzen kann der
  Anteil niedriger sein"); the tile at the top carries only where it was
  measured („Gemessen an Paragraphen, die so Gesetz wurden, wie der Entwurf
  sie vorschlug"). The cause — the rules were developed on part of these
  laws — stands under „Was die Zahlen nicht sagen"; at the tile it was a
  caveat no reader could decode (maintainer, 24.11.2026).
- **The copy follows what simulated readers misread** (24.11.2026): two
  agents given only the page's screenshots and text, an NGO's policy
  officer on a laptop and a citizen without legal training on a phone.
  - a catch rate prints its verb („0,2 % gefangen", `weakFigureDe`): bare,
    the comma's 0,2 % read as „commas almost never go missing";
  - not „zweite Lesung" (a stage in Parliament the monitor follows) but
    „Gegenlesen am PDF" and „liest den Entwurf ein zweites Mal";
  - each share at the top says what it is not or what remains: read bare,
    a share read as „a third of the changes missing", „correct",
    „error-free" or „drafts pass unchanged" (the framing rule);
  - „Was selbst nachzusehen bleibt" opens with the instruction and gives
    each mark its own line and action; the term „Textgegenüberstellung" is
    explained where it first appears again;
  - the funnel says „werden nicht ganz ausgeschrieben", not „scheiden aus";
  - the Länder whose Textgegenüberstellung the monitor does not read are
    named as „Nicht im Monitor" under the Länder's squares and in the
    checklist, from the record and `LAND_NAME` (`landsNotRead`), never
    typed; and why Kärnten has no check stands there: its right column
    prints the draft's Anweisungen, so the new text has nothing second to
    be held against;
  - under each count of „Regelverstöße", what the rules check;
  - one word for what a draft orders, „Anweisung"; see „The page says
    „Anweisung", never „Anordnung"" in `docs/decisions/ui.md`.

  A simulated reader is not a user test (those wait for 2027); it finds
  wording a reader stumbles on, not whether the page serves its people.
- **On `/genauigkeit` a § that is not shown is counted at the step it ended
  at, and a blind spot is a short bar** (19.11.2026). The harnesses and the
  commit measured are not on the page, which is for a reader and not for a
  developer — the record carries both.
- **Each kind of comparison names on `/genauigkeit` what its check does not
  catch, measured** (19.11.2026): a fault class the harness injects stands
  in exactly one of the page's groups (`tests/genauigkeit.test.ts` fails on
  a key no group names), and a blind spot by construction — a unit RIS
  lacks too, a foreign sentence in both columns alike, one misread word in
  a Land's right column — is a bar of its own, never left out of a range,
  and its count of tries stands under „Im Einzelnen" (since 24.11.2026; a
  bar of fewer than 100 tries says so under it). Shares are rounded down,
  so the page never claims a catch that was not measured.
- **A kind of fault the check catches „fast immer" stands in one bar with
  the others; every other one alone, with its why** (24.11.2026,
  `FAST_IMMER`, `fehlerBild`). „Fast immer" is at least 95 %, in the bar's
  weakest class too, so a sum never shows more than its weakest class
  caught. Every bar below the line carries one sentence of what it means
  for a reader (`FaultBar.why`), so a new round that moves a bar needs a
  sentence, not a silent place.
- **A bar names its weakest class, and a catch rate is not an accuracy**
  (23.11.2026): a sum over classes hides its weakest, and `weakestOf`
  prints it under the bar. A part of a whole is rounded to the nearest
  tenth (`partDe`), a catch rate down (`shareDe`): otherwise the same share
  stands on the page twice, differently.
- **The share of whole §§ shown counts only the §§ that have a proposed
  version to compose** (19.11.2026, `wegFunnel`). A § the draft repeals has
  none, and a § of a law the draft enacts anew is the draft's own text;
  both are named beside the figure. The page gives the annex's figure
  first: the annex is the change, the composed § the addition, and „half of
  the §§" read alone sounds as if half the changes were missing.
- **The pill at a § is a „Vermerk" in reader copy** (22.11.2026), in the
  method note and on `/genauigkeit` alike. „Markierung" is the colour that
  shows a change, in every section's credit line and in the gap sentence
  „ohne Markierung"; a § „ohne Markierung" would be one without highlighted
  changes.
