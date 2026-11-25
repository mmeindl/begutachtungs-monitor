---
paths:
  - "server/utils/{diff,lawtext,explanations}/**"
  - "shared/utils/{lawStations,figureMark,diffKey,paragraphNumber,unitName}.ts"
  - "app/components/compare/**"
  - "app/utils/{diffSides,diffBadges,lawDiffCredits,reasoningNotes,lawPackage,newLawGroups}.ts"
  - "app/composables/{useDiffFilters,useLawDiffStep,useExplanations}.ts"
  - "scripts/harness/{station,units}.ts"
  - "scripts/lib/{stationMutations,stationChecks,unitCensus}.ts"
  - "server/utils/text/**"
  - "scripts/audit/paraTitle.ts"
---

# The § comparison and the Begründungen

The § comparison between stations, the comparison of the Begründungen, and a
new law's text on its draft page. What an entry holds, and the other areas:
`docs/decisions.md`.

## Stations and pairs

- **Adjacent stations by default,** so every change can be attributed to one
  actor: ressort, committee, plenary (§12.18). No Plenarfassung→BGBl pair: no
  actor changes the text in between (§12.33).
- **Stations are recognised by a measured whitelist of exact document
  titles,** never by keyword (§12.18).
- **Each side of a comparison carries its own licence credit.** RIS documents
  are CC BY 4.0, parliamentary documents free works, the Ministerialentwurf
  carries no licence claim (§12.18).
- **The § comparison reads the draft's text from Parliament's HTML first and
  the RIS XML only where that is missing.** Parser symmetry: Regierungsvorlage,
  Ausschuss and Plenum exist only as Parliament HTML, and a draft read from
  XML against a Vorlage read from HTML yields differences the format made
  (§12.33). This is the reverse of the Textgegenüberstellung, which reads RIS
  first for the licence; this order does not move either while the licence
  question is open (`readDraftUnits` in `server/utils/diff/lawDiffService.ts`).
- **The page's § comparison and its harness share one pair decision**
  (21.11.2026, `compareStationPair` in `server/utils/diff/stationPair.ts`):
  which texts of two stations are compared, and when a pair is refused, is
  decided once, for the route and for `station.ts`. The harness counts a
  refused pair (`refused`) instead of skipping it.
- **A first text that is no Regierungsvorlage is named by its kind
  wherever a comparison names it** (14.11.2026, `firstTextNameOf` in
  `shared/utils/lawStations.ts`): a committee's motion and a motion of the
  Bundesrat stand at the `rv` station, and label, question, genitive,
  credit line, citation („AB 14 BlgNR 28. GP", „452 BlgNR 25. GP") and the
  server's reasons say „Ausschussantrag", „Gesetzesantrag des Bundesrates"
  or „… von Mitgliedern des Bundesrates". A motion whose text is filed only
  as „Gesetzesantrag" or „Antrag" is not compared: that document can carry
  the Begründung, and no measured rule cuts it off (`MOTION_TEXT_TITLES`);
  the comparison says so. A treaty's or an Art.-15a-Vereinbarung's
  Kundmachung is a Vertragstext and is never compared, on the item's page
  and on its draft's (`treatyComparisonGapDe`). Nor is its Vorlage: the
  draft's comparison with it says the gap is the monitor's, not that
  Parliament published no Gesetzestext (15.11.2026, `missingStationReason`).
  After a changed text following the Bundesrat's Einspruch, Parliament's
  steps say that they end at the first Beschluss (`OBJECTION_STEPS_NOTE_DE`);
  the whole-way comparison reads the promulgated text.
- **Later-station comparisons are cut to the draft's own laws only where
  Parliament's `preconst` says the Regierungsvorlage bundles other drafts,**
  never by package size (§12.33, §12.40).
- **A commencement Artikel only one side carries is shown wherever no
  sentence covers it** (22.11.2026, `diffLawPackage` in
  `server/utils/diff/lawDiff.ts`). An Artikel „Inkrafttreten" is named in no
  list of bundled laws. It may go unshown only where the page says that
  only what both texts carry is compared (`mergedLawsNote`, which stands
  where `lawsOnlyInTo` names a law). Elsewhere it shows, inserted or
  removed; unshown, it is a silent gap.
- **An inferred station shows how it was inferred.** „Became law as an
  Initiativantrag" is our conclusion from text overlap, so the Antrag and the
  overlap share stand with it; the claim is about timing, never cause
  (§12.10).
- **Dead-draft copy says „selten", never „nicht mehr möglich":** a draft can
  still get its Regierungsvorlage in the next period (§12.10).

## Units

- **Units are aligned by article and heading, never by § number alone.** In
  one chain the Regierungsvorlage inserted two paragraphs, and a comparison
  by number marked 41 of 45 merely shifted paragraphs as changed. The number
  stays out of the compared text, so a renumbered § compares as unchanged.
- **Every instruction line lands in exactly one unit** (19.11.2026,
  `lawUnits.ts`): „25a." keeps its letter, „10.1." stays in instruction 10,
  and a number that recurs is kept as `#dup`, never dropped. A dropped line
  is on neither side of a comparison and in neither the engine's applied nor
  its refused list, and can show a kept line as „entfallen". The
  table-of-contents echo rule drops only a unit that holds no instruction.
  Gate: `pnpm harness:units`.
- **`#dup` is a key, never a designation** (19.11.2026). It marks a number the
  source gives twice under one law's key: printed twice („82." in the
  Waffengesetz), one law amended in two Artikel of one title, an old draft
  whose Artikel no reader splits. Pages print the number alone
  (`displayId`); the census counts the marks by cause and does not fail on
  them, since a gate would fail on the source's own numbering. Its classes
  „ohne Nummer" and „verdoppelt" are reader faults, not readings:
  „verdoppelt" is the number of the unit before, given a second time where
  the source printed it once (an unnumbered first line promoted to „1."
  before the printed „1.", a table row „2.1" read as instruction 2); only a
  number both opening lines print is „wiederholt" (`scripts/lib/unitCensus.ts`).
- **A plain line is promoted to the next instruction only on a number that
  stands alone** (19.11.2026, `lawUnits.ts`). „2.1", „4.800" — a number with
  a second one right behind its period — is a sub-number, a table row or an
  amount, never instruction 2.
- **An Artikel line and its name in one heading are two blocks, on both
  readers** (19.11.2026). „Artikel 1<br>Änderung des …" is split into the
  Artikel line and its name wherever the class mapping leaves the line to
  the text: Parliament's `articleNameSplit`, and RIS `ueberschrift
  typ="art"` (`risXml.ts`). Unsplit, the heading was text of the instruction
  above it and the package read as one law. A RIS `g1` heading of that shape
  is an Artikel already, keyed by the whole line, and stays as it is.
- **A schedule's designation is text on both readers, in a Novelle and in a
  law the draft enacts** (19.11.2026, `lawUnits.ts`): Parliament keeps
  `71Anlagenbez`, so the RIS reader keeps `<ueberschrift typ="anlage">` and
  the heading of that class right below it. Dropped on one side only, every
  „Anlage I (zu § 106)" read as removed from the last §. The schedules still
  count as text of the last §; units of their own are open.
- **A unit whose text came from a table says so** (21.11.2026,
  `LawDiffUnit.table`, `TABLE_AS_TEXT_DE`): the reader flattens a table to
  text, and the page says it at the unit, in a fold once.
- **Both readers name an image „[Abbildung]", and the verdict covers the
  words only** (19.11.2026, `shared/utils/figureMark.ts`): RIS's `<binary>`
  path and Parliament's `<img>` become the same mark, and every change whose
  text carries it says „Nicht im Monitor: Abbildungen vergleicht der Monitor
  nicht …". RIS's `<gt/>`/`<lt/>` and `<gs>` are read in `stripMarkup`, the
  one function all three RIS readers share, so draft, standing law and
  annex read them alike.
- **A text that parses into no § is „Nicht lesbar" for that text**
  (19.11.2026, `lawDiffService.ts`), asked before the cut to the draft's
  laws, which may rightly empty a side.

## The verdict

- **„Redaktionell" is decided by what changed, never by how much.** A change
  is editorial only if every inserted or removed piece is a citation, a
  number, a date, a single letter or punctuation; „und" → „oder" is not.
- **A changed cross-reference is editorial only where this comparison itself
  paired the old and new number.** Never „no word changed" for a change we
  cannot explain (§12.33).
- **The comparison key may fold typography; the displayed text never does**
  (§12.33). A minus sign is not typography (19.11.2026, `isSign` in
  `server/utils/lawtext/normalize.ts`): a hyphen right before a number that
  opens the text, follows a space or a bracket stays in the key, so „-18 °C"
  against „18 °C" is a change, not the hyphen of „Covid-19". A dash standing
  free („- 18") still folds.
- **What the unit key forgives, the badge forgives** (19.11.2026,
  `spacingOnly` in `server/utils/diff/wordDiff.ts`): a removed and an
  inserted run that differ only in spaces and hyphens are no changed word for
  „redaktionell", except a separator between two digits („1 3" is not
  „13") and a minus sign. The runs stay shown as they are; folding them to
  `equal` would print the earlier spelling as agreed.
- **A separator between two digits is no spacing, for the unit key as for
  the badge** (20.11.2026, `foldSpacing` in
  `server/utils/lawtext/normalize.ts`, read by `compareKey` and
  `spacingOnly`): between two digits a run that holds a hyphen is a range
  („3-5" equals „3 - 5", never „35"), a run of spaces alone a separator
  („1 3" is never „13"). One gap is layout, measured: between an amount and
  its footnote mark („35,82 1)": a two-digit fraction before it, one or two
  digits and „)" after), which a Land's PDF glues to the amount where the
  Landesgesetzblatt sets it apart. Thousands groupings are not folded: no
  two sources differed in one.
- **A changed sign is a changed word** (20.11.2026, `WORD_SIGN_RE` in
  `server/utils/diff/wordDiff.ts`): a mathematical sign, a currency sign,
  „%", „‰" and „°" standing as a token count as words for „redaktionell",
  so „5 %" → „5 ‰" or „> 50 mg" → „< 50 mg" is no editorial change.
  Quotation marks, the free dash, „§" and the list bullet stay punctuation.
- **A changed text without a word diff says so and stands unmarked**
  (19.11.2026, `NO_WORD_DIFF_DE` in `app/utils/diffSides.ts`, `DiffBody`):
  „Nicht im Monitor: Texte dieser Länge …", never both versions marked as
  wholly changed. The § comparison computes the word diff past the matrix's
  ceiling (`beyondCeiling` in `server/utils/diff/wordDiff.ts`); every caller
  that decides on segments (oracle, guard, Lesefassung, annex rows, the
  Länder's guard) keeps the ceiling as a refusal.
- **A removed and an inserted instruction become one „geändert" only with
  two witnesses, never the address alone** (`pairSameInstruction`): texts
  alike at 0,8 or more and the same §§ edited, in one Artikel, each side
  with exactly this one candidate and no crossing with another such pair.
  „§ 24 lit. d lautet" → „§ 24 Abs. 1 lit. d lautet" is one instruction
  readdressed; „§ 63 entfällt" → „§ 4a entfällt" stays two. The calibration
  is at `SAME_INSTRUCTION_SIMILARITY`. The unit is the Vorlage's with the
  draft's Ziffer in `fromId` („Z 24 → Z 25"), so the Begründung joins each
  side under its own number and the share counts it once; no paired unit
  ends with less Begründung than its halves had.

## The Begründungen

- **The reasoning comparison runs only ME → RV, and only where both sides
  give a reasoning.** „Unchanged" means the same words in the same order; no
  percentage threshold. Both sides are read with the same parser (§12.10b).
  `sameWording` keeps a separator between two numbers, as `foldSpacing`
  does (21.11.2026, `explanations/reasoningDiff.ts`).
- **Erläuterungen a side has not given us are said, above the comparison**
  (14.11.2026, `explanationsMissingNote`), instead of the Begründungen going
  missing silently. Parliament's record proves only what it lists, so the
  sentence is „nicht gelesen" — „liegen nur als PDF vor" or „das Parlament
  führt sie nicht als eigenes Dokument" —, never „nicht veröffentlicht": a
  Regierungsvorlage may carry its Erläuterungen inside its one document.
- **A Vorlage's Erläuterungen held as a PDF only are read from it, and
  refused whole where the reading cannot be vouched for** (23.11.2026,
  `explanations/explanationsPdf.ts`). The PDF's runs become the blocks the
  HTML gives and one walk reads both, so a heading means the same in either.
  Refused, as „Nicht lesbar" with the PDF linked: no text, a page of words
  that are no German (a font with no map to its letters), a page without
  text between others. A reasoning under the wrong §, or with a page missing,
  is worse than the gap. A table's rows are left out and the section says so
  (`dropped`); a footnote stands behind the paragraph that points to it. Only
  a Vorlage: an Antrag's Begründung and a Ministerialentwurf's documents at
  Parliament stay unread, and the credit is „freies Werk".
- **The ministry's reasoning is attached to a § only where the law key is
  certain.** A wrong reasoning at a § is worse than none (§12.30). A passage
  the document sets under another law's Artikel is never taken, even where
  no second Artikel of the draft addresses the number: a Vorlage that
  bundles other drafts explains laws the comparison does not hold (`ofLaw`,
  `articleOn` in `server/utils/explanations/reasoningDiff.ts`). A heading
  that names several laws (an Artikel range, §§ of two acts by their
  abbreviations) counts for each of them. Beside the Textgegenüberstellung,
  where a passage stands at one law's §, a heading over several Artikel
  („Zu Art. 1 Z 20, Art. 2 Z 16 … (§ 70a ASVG; § 36 GSVG; …)") is discarded
  in a package: which of its §§ is whose cannot be read (`namesSeveralArticles`
  in `server/utils/explanations/explanationsJoin.ts`).
- **A heading over a group of Artikel ends the passage before it, where the
  reasoning is shown at its §** (23.11.2026, `isArticleGroupHeading`). „Zu den
  Art. 16 bis 26:" is no address, so its text stayed in the passage above and
  showed the reasoning for other laws under one § (408 d.B. XXVII). A heading
  typed onto the end of a paragraph is taken off it the same way (462 d.B.
  XXVII). The reasoning comparison still reads both inside the passage.
- **„Zu den Z 22 und 102 (…):" is a Ziffer heading** (`zuDenZiffern`): the
  plural form over a Ziffer list („Z …", „Art. 1 Z … sowie Art. 4 Z …")
  opens a passage like „Zu Z …", printed as typed; „Zu den §§ …", „Zu den
  Abs. …" and prose stay text. „Zu 15 (§ 6):" without „Z" stays text:
  whether 15 is a Ziffer the line does not say.
- **A bare „Zu Z 5:" under a heading titled by § alone is that §'s Ziffer,**
  not a Novellierungsanordnung's passage — only in a document every bare
  Ziffer heading of which stands in such a run (`ownedPassages`, 67/ME
  XXVIII; 145/ME XXVII heads its Ziffern „Zu Z 1:" and keeps them).
- **A „§§" list is read item by item** (`listedParagraphs` in
  `server/utils/explanations/risExplanations.ts`): a number followed by
  „Abs." or „samt" is a §, a bare number after an Absatz, Ziffer or litera
  is not („§§ 46 Abs. 2, 47 und 48" may be Absätze), and a list in quotes is
  the citation an instruction replaces, not what it amends.
- **A Begründung printed under the neighbouring Ziffer is attached only with
  witnesses beyond the number** (`offsetPassage`): every § the passage names
  is one this change amends, the change that carries that number amends none
  of them, no other change of the law amends them, and the other document's
  passage names the same §. Missing one, the change keeps no Begründung.
  Where both documents print it so, the documents' agreement stands in for
  the second document, and the change whose number the passage carries
  says „die Erläuterungen zählen die Ziffern anders" only where that change
  alone amends every § the passage names and has no passage of its own
  (`claimedByAnother`, 96/ME XXVIII).
- **A change whose Begründung could not be attached says so, at the
  change,** wherever both documents carry Erläuterungen and the change
  stands on both sides — the Ziffer join, the § join, a new law's § by its
  own designation (`ReasoningDiffResponse.gaps`). Without the line it looked
  like a change whose Begründung was found and left unchanged. Only a change
  the entry ceiling turned away keeps silent: its Begründung was found. The
  reason is given only where it is proven: „die Erläuterungen zählen die
  Ziffern anders" where one side's passage to the Ziffer is about another §
  (`misnumbered`; a § another change of the same law amends is another §,
  never a slip of the heading); „nicht gefunden" only where that document
  names neither the Ziffer nor one of the change's §§ in any „Zu …" line or
  passage heading (`namesChange`), and has no prose at the level of the
  change's Artikel — under its own Artikel heading, a range heading holding
  it (also where the reader folded it into a passage's text), or as the
  introduction above its passages (`explainsLawWhole`: 96/ME XXVIII explains
  the EStG's § 105a in one block under „Zu Art. 7 (…)"). Outside the Ziffer
  join a new law's § is looked up by its own designation, a document that
  titles by neither Ziffer nor § proves nothing, and a passage on the other
  side whose words this side has under another number withholds the reason
  too (`provesAbsence`: 49/ME XXVIII heads its Inkrafttreten „Zu § 10:").
  Otherwise the line gives no reason: an unproven „nicht gefunden" would
  have been false on most such changes. **Whose gap the line names**
  (maintainer, 19.11.2026): where the join failed, it is ours — „Nicht
  lesbar: die Begründung – die Erläuterungen zählen die Ziffern anders." and,
  without a proven reason, „… – wo die Erläuterungen sie führen, liest der
  Monitor nicht sicher heraus."; where absence is proven, it is a fact about
  the document and takes no lead word — „Begründung: Die Erläuterungen des
  Entwurfs haben dazu keinen Abschnitt." (der Regierungsvorlage, beider
  Texte); the line stands at its change, so it does not name the change
  again, never „Nicht veröffentlicht", because prose elsewhere may still
  touch it. An inserted or removed change (19.11.2026) gets the line only
  where the one document it stands in proves the absence — the
  Regierungsvorlage's line at an inserted one, the Entwurf's at a removed
  one; never the unproven line, since its own document mostly explains such
  a change. The § join reads a § inside an Artikel of the law („In Artikel
  II § 9 …"), which the § name does not (`addressedParagraph(line, 'join')`).

## A new law's text

- **A new law's text stands on its draft page** (23.11.2026,
  `NewLawSection`, `enactedText.ts`). A Ministerialentwurf with
  `createsNewLaw` answers „Was regelt der Entwurf?" with its law by § from the
  RIS parse, the Begründung at each §, the group open and cut after 30 units.
  Its own section, because none of those drafts has a readable annex. Groups
  for every law only there: in an amending draft the enacted list also holds
  Artikel that are no law („Inkrafttreten"), so the annex's leftovers stay
  its filter. **The print is a layer over the parse, and the parse does not
  move:** `segmentUnits` keeps dropping the structure's headings and reading
  schedules as text of the last §, because every comparison is keyed on
  that, and `TextBlock.text` keeps „m 3". The print walks the blocks again
  for Anlagen as units, headings, formulas and raised, lowered or underlined
  runs (`parts`; an underline is how RIS draws a fraction's bar), and reads
  the footnotes. **A table prints as a table** (`risTables`,
  `EnactedTable`): an empty cell is what says which column a value stands in
  (149/ME XXVIII, Anlage 1: 350 under MW1, 120 under TMW), and as a run of
  cells that was lost. A grid is printed only where each block of the parse
  is one of its cells; otherwise the cells run on under „Nicht lesbar". RIS
  marks no header, so leading rows set all in bold count as one. Checked
  against RIS's HTML edition by a separate parser: all 43 tables match cell
  by cell, and the only token differences are RIS's two editions disagreeing
  or „Inkrafttreten" entries that are not printed (`everyLawEnd`). Vorlagen
  and Anträge without a Begutachtung are not in it: they need an endpoint and
  Parliament's credit, and their text has not been measured.

## Measured figures

| What | Value | Sample, date |
|---|---|---|
| Ministry reasoning attached at the § | 75.8 %, median 89 % per draft | 1,816/2,396 annex §§ · 02.10.2026 (§12.30) |
| Allgemeiner Teil of the Erläuterungen readable | 98.4 % | 465 documents (§12.29) |
| „RV bundles other drafts" judged by package size | wrong in 71 % | 90 of 126 · GP XXVI–XXVIII (§12.40) |
| Words of the ministry's reasoning changed ME → RV | median 8.9 %; Besonderer Teil 10.5 %, Allgemeiner Teil 3.9 % | 64 pairs, GP XXVIII · 22.09.2026 (§12.10b) |
| § comparison, the two null comparisons (`station.ts`) | last parliamentary text → Kundmachung 452 residues in 4,867 units, 1 not editorial; one draft read as HTML → as XML 6 in 4,675, 3 not editorial; 453 pairs of 91 drafts, no invariant breached | GP XXVIII · 19.11.2026 |
| § comparison under fault injection (`station.ts --mutationen`) | 22,787 changes of substance in nine classes, set into 7,153 units of the later texts: every one shown as a change of substance, none „redaktionell", none „unverändert" | GP XXVIII, 91 drafts · 20.11.2026 |
| Speaking names for changed units | 81 %, median 86 % per draft; no wrong heading | 40 drafts, production build · 14.11.2026 (§12.11, `pnpm audit:para-title XXVIII 40`) |
| Vorlagen whose Erläuterungen are a PDF only, read from it | XXVIII 12 of 155, XXVII 21 of 365, XXVI 8 of 117; all 41 shown, 28 with reasoning at the §; every printed line in the reading or explained as a stamp, running line, bound-in annex or table | built endpoint · 23.11.2026 |
| The PDF reader against the production HTML reader | 200 of the 592 Vorlagen with both formats: 195 read, 5 refused. 99.98 % of the prose words in order, both ways; of 5,556 §§, 3 differ, all where the HTML sets a heading at the end of a paragraph | 23.11.2026 |
| The same comparison with each passage given the next one's text | 16 of 2,430 §§ still pass (60 documents): the comparison sees a reasoning at the wrong § | 23.11.2026 |
| Heap for the largest PDF (69 d.B. XXVIII, 0.9 MB, 60 pages) | 39 MB on top of the process; the built server under `--max-old-space-size=320`, all 41 cold in a row: RSS 317 MB at the end | 23.11.2026 |

## Rejected alternatives

- **A similarity threshold for „redaktionell".** Wrong in both directions:
  of 26 units above 0.95 only 3 were editorial and 13 hid a change of term.
- **Quoting what the Regierungsvorlage's Erläuterungen say about the
  Begutachtung.** They say nothing (0 of 17,
  `docs/decisions/framing.md`, „The procedure"); the section would read
  „nothing here" on almost every draft.
- **Pairing articles by Stammnorm alone.** One BGBl often creates several
  laws, and the cited numbers contain typos (§12.18).
- **„Geltendes Recht → Ministerialentwurf" as a pair in the station chooser.**
  It would be an apply, not a diff: current law is a text plus a reference
  date that moves per station, and an omnibus draft would have as many left
  sides as laws. The exact answer is already on the page: the ministry's
  Textgegenüberstellung, the reading version confirmed against it, and the
  list of laws the draft would amend, linked to RIS (17.09.2026).
- **Checking a readdressed instruction for crossing against the pairs the
  engine already made.** Pairs the Vorlage moved within the law cross one
  and are the same instruction; crossing is checked among the new pairs only
  (14.11.2026).
- **A „date" class for a change of a date written with a month name.** 0 of
  97 such units change only the date (23.09.2026).
