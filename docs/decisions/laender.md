---
paths:
  - "server/utils/laender/**"
  - "server/api/laender/**"
  - "app/components/land/**"
  - "app/utils/{landLaw,landReasons,landUnchecked,landWithheld}.ts"
  - "shared/utils/{laender,laenderCoverage,landRecent}.ts"
  - "scripts/harness/land*.ts"
---

# The Länder

The nine Länder: their drafts, Textgegenüberstellungen, Erläuterungen and
Landesgesetzblätter. The draft check the Länder share with the Bund is in
`docs/decisions/draft-check.md`; the span select in `docs/decisions/lists.md`.
What an entry holds, and the other areas: `docs/decisions.md`.

## Länder

- **Precision before coverage.** A § of a Land's Textgegenüberstellung is
  shown only where RIS confirms its current wording on the document's date
  (≥ 0.98 word match) or the § is new; the rest is withheld and counted
  (§12.45, §12.52). The match runs both ways for a § printed unchanged and
  without omissions: it must also hold every word of RIS's law text, from
  its first to its last, numbers and citations included (`cutShort`,
  `risLawText`, 19.11.2026), or a § cut short in both columns reads
  „unverändert". RIS's notes, fields and headings are not its law text, nor
  is the § designation Wien's records lead the first Absatz with
  (`<gldsym>`). Not seen: a § printed with omissions, the § heading, and a
  new text lost only where it differs, so that both columns read as the
  old. An omission is read as the Land prints it: Salzburg marks an
  unchanged Absatz or Ziffer by its bare designation („(1) (2) …",
  „1. 2. …"), read as „…" for Salzburg only, and only where the next
  designation follows or a pair ends the § (14.11.2026).
- **The left column of a changed Land § is held by RIS alone, at 98 %**
  (21.11.2026, measured, no rule): a misread number, word or citation in a
  stretch both columns share passes in three of four one-column cases
  (Oberösterreich, Tirol) and in one of four two-column ones.
- **A Land's Textgegenüberstellung confirms text, it never supplies it**
  (12.11.2026), as the Bund's annex does. A § it shows as changed or new is
  held against the draft's own Gesetzestext with the Bund's thresholds,
  unchanged; where part of its new text is not in the draft it is withheld,
  said as the monitor's own finding. Below the word floor nothing is said. A
  draft that could not be read disarms the rule, and the answer is not
  stored. Kärnten is not asked: its right column is the Novelle's
  instructions. Extraction noise is answered in the reader, never by
  loosening thresholds.
- **The right column is held word for word where the draft quotes the
  wording** (20.11.2026, `landTguStrict.ts`). The bag rule cannot see a
  wrong word, a changed number or a lost sentence. So a § is first aligned,
  in order, with the payloads of the draft's instructions for it; a stretch
  quoted in an instruction's line must stand in the column as one stretch.
  A number is a word, one word is a finding, and only typography is
  normalised (case, quotes, dashes, punctuation, a broken word, where a
  space stands). Where the two differ the § is withheld as `draftDiffers`,
  said without saying whose deviation it is. A § that cannot be held this
  way — no instruction names it, a quotation's role is not read, a payload
  for several §§ without designations — is never passed for having been
  asked: the bag rule decides, and the harness counts it apart. Rejected: a
  tolerance of one or two words (a Wien fine „3 000"/„2 500" is one word).
  Open: the Tirol font residue („fl" for ß) is answered in this module, not
  in the reader.
- **What the draft check takes for the draft's on the Länder** (21.11.2026):
  a single new word only where an instruction quotes or prints it, never
  from its address; a part of a quoted wording only where the whole stands;
  a block after a line that runs on (`RUNS_ON_RE`) opens no § in a payload;
  and where the draft's wording for the § is missing, the § differs, even
  if the rest is written elsewhere. Blind spots: a seam word shared with old
  text, a one-word quotation that stands again inside a payload, a payload
  word the alignment finds again further down; of the RIS check, a heading
  lost in both columns.
- **A Land's § whose new text the draft check did not hold carries „nicht
  geprüft" at the §** (21.11.2026, `notHeld` in `landTguGuard.ts`), decided
  on the server, the reason said once per law. An unread draft marks every
  changed § and keeps the answer out of the cache. A § the check objects to
  is withheld there (`draftDiffers`), not marked: the second pill („nicht
  bestätigt", `docs/decisions/draft-check.md`) is the Bund's.
- **„Entfallen" only where the draft says so.** An empty right column can be
  text the reader missed (§12.52). „Entfallen" in Oberösterreich's
  one-column form and in Tirol's is not held against the draft (21.11.2026,
  measured): all 42 removed §§ are real repeals, 14 of them in forms
  `draftDeletes` cannot read (a division, a range, a renumbering).
- **What a draft's instructions change and the comparison does not print
  is withheld as `unprinted`** (21.11.2026, `unprintedInstructed`), only for
  a law the comparison holds and never for an anchor („Nach § N wird …
  eingefügt"). A law the comparison has nothing of is not listed: it may be
  printed under a new name. A missing Textgegenüberstellung is „Nicht im
  Monitor" with what was searched, never „Nicht veröffentlicht" on titles
  alone.
- **A document a Land files as the draft but that is not one is not read as
  the draft;** the page says so (§12.63). Among several candidates the
  content decides, not the title: where the first holds no law text, the
  first of the next that does is the draft (at most eight read, a failed
  read fails the choice); where none does, the first stays (14.11.2026).
- **A Land draft's own documents are told from the Vorlage's by one rule**
  (20.11.2026, `draftExplanationsDocument` in `texts/read.ts`): Kärnten and
  Tirol list „Regierungsvorlage, Erläuterungen" in the draft's record. An
  answer that rests on a failed read of the draft's PDF is served and not
  kept (`onlyComplete`), as the Bund's is.
- **Landtag motions name the party only where the committee report does;**
  members named there are never named (§12.61). In Land submitter data only
  unambiguous organisation and authority abbreviations are expanded (§12.64).

### Reading a Land's PDFs

- **Oberösterreich's marks are read where the page puts each letter**
  (20.11.2026, `landTguPdf.ts` `textState`, `landTgu.ts` `placedCentres`).
  A run's width shared out over its glyphs put a letter after a space up
  to half a letter off and moved letters across the edge of an underlined
  and a struck stretch. The glyph positions come from the page's text
  operators, with the text state restored at Q; the estimate remains only
  where a run is not found letter for letter. An internet address
  underlined on its own is a link, not an addition. Rejected: computing the
  spaces from the run's leftover width, and anchoring at rule ends — each
  broke a § the estimate had right.
- **A misread font in a Land's PDF is repaired run by run** (21.11.2026,
  `repairMisreadFonts` in `texts/read.ts`): a font whose runs carry the
  Mac-Roman signs and no real umlaut or §. Its text is read unnormalised, so
  that its „ﬂ" is still the ß, and normalised afterwards as pdf.js would.
  The line-level repair (`repairMacRoman`) is a fallback. A „ß" standing
  alone before a number is a „§".
- **The draft reader drops only real division headings:** a Roman numeral
  in capitals with a capitalised title, never one the next word declines
  („des I. Teiles") or counts („I. Dienstklasse"), and never a line opening
  „lit.".
- **A bare „§ 8." after a line that runs on is the sentence's end, not a
  §** (19.11.2026, `RUNS_ON_RE` in `landTgu.ts`, in the draft reader and the
  Textgegenüberstellung reader alike): a citation the column wrapped
  („… gemäß" / „§ 8.") split the § it stands in. No test of the number's
  order: a contents list echoed before the law numbers below the § before
  it too.
- **Where a § ends in a Land's Textgegenüberstellung** (21.11.2026). A line
  that opens like a paragraph joins the sentence above only where that line
  runs on (`RUNS_ON_RE`) and the line is a cited § or a date, never a
  numbered list item. A heading of what follows closes the § before it: a
  Roman numeral with a letter („VIIa. ABSCHNITT"), Oberösterreich's bare law
  name after a sentence's end, in Kärnten a title line that opens a
  „(Kärntner … gesetz" bracket. An Anlage the document marks (struck,
  underlined, renamed) ends once, withheld with the annex reason, in every
  Land reader; one printed unchanged stays out.
- **A bare number is a page's own only at the page's edge** (19.11.2026,
  `pageLines` in `draftPdfLaw.ts`): a table value on a line of its own is
  law text. Salzburg's running head is known by its path or its save stamp,
  each line on its own, so a head wrapped onto two lines is no law text
  either.
- **Kärnten's session stamp at a page's head is the page's furniture**
  (20.11.2026, `SESSION_STAMP_RE` in `draftPdfLaw.ts`). „REG.SITZG." opens
  every page of a Vorlage for the Regierungssitzung; joined to the line
  before it, it read as text the Landesregierung inserted and the Landtag
  removed. Dropped only as a page's first line, where all measured lines
  stand.
- **A line under „§ N" that closes with a full stop, colon or semicolon, or
  that fills the measure with no numbered Absatz under it, is the §'s
  first line of text and not its title** (20.11.2026, `isFirstTextLine` in
  `draftPdfLaw.ts`). Read as the title, it stood on the page as a heading
  the Landesgesetzblatt inserted. No real title closes with such a mark.
  Limit: first lines of 64 to 84 characters are still read as titles; at
  that length a line does not tell its kind.
- **A sub-instruction of any depth or form is part of its instruction, on
  both sides** (19.11.2026, `SUB_INSTRUCTION` in `draftPdfLaw.ts`, used by
  `lgblUnits`): „15.1.1.", „26a.1.", „18.1a.", „2.1 Abs", „19.1.Nach". The
  §§ such a sub-instruction names before its quoted wording are instructed
  (`subInstructionHeads`). An ordinal division after the number is an
  address, not a sub-instruction: „2. 3.Teil Z 16 lautet:" is instruction 2.
- **An instruction whose announced text a reader did not find in its place
  is not compared as if it had none** (19.11.2026, `announcedText.ts`,
  `settleAnnounced` in `landLawDiffService.ts`). A Land's PDF sets a
  schedule's row or a table-of-contents entry as a table; its text layer
  puts it elsewhere, or the reader drops it (table-of-contents entries by
  design, on both sides), and the Landesgesetzblatt's reader loses an
  announced heading the same way; the station comparison then showed it as
  new or as gone. Such a unit is **withheld** („Nicht gezeigt", reason
  `announced`); where both sides lack the text alike the unit is shown and
  named in a „Nicht lesbar" line (`unreadAnnounced`): the rest of the
  instruction is compared, that text is not. Checked only in an instruction
  (in a §, a colon before a list is the law's own); a row of figures after
  the colon is the text, not a sub-instruction („2.3 43 80 59"); trailing
  quotations count as displaced only where they are row-like and the
  instructions before left exactly as many announcements empty. Reading
  the tables in place, from the page's geometry, is the fix that would show
  these instead; not built.
- **Address normalisation lives in the guard, not in the draft reader**
  (21.11.2026, `readableBlocks` in `landTguGuard.ts`). A rule that rewrites
  how the reader prints text belongs where that text is not compared with
  another source: the station pages hold the draft PDF's text against the
  Landesgesetzblatt, which also prints „§ 24 b".
- **A Land's station comparison passes the word diff's ceiling**, as the
  Bund's does (21.11.2026, `diffLandDraft`): below it changed units stood
  unmarked; at most 70 ms per pair.

### Erläuterungen and the Begründungsvergleich

- **Page furniture in a Land's Erläuterungen is a line at the same place of
  three pages**, within two lines of the top or the bottom (21.11.2026).
  Rejected: any short line met three times — it dropped „Zu Abs 1:" and
  „werden.".
- **What belongs to a § entry of a Land's Erläuterungen** (21. and
  22.11.2026, `landExplanations.ts`). „Zu Abs …" under an entry that names a
  § is part of that entry. A „§§ a bis b" heading names every § of the
  range; behind a heading that names its §, the bracket is a title and names
  none. A document's bare „Zu Z n:" headings are the Ziffern of the § above
  only where every one stands under a heading titled by § alone
  (`ziffernOfParagraphs`, the Bund's rule, decided per document); most
  documents use them to head instructions.
- **A Land Vorlage's particular part ends at the Landesregierung's motion**
  („Die Landesregierung stellt sohin den Antrag", „Die Oö. Landesregierung
  beantragt, …"; 21.11.2026); no draft's Erläuterungen carry such a line.
- **In a Land package a Begründung stands only at its own law's §**
  (21.11.2026): an entry with no known law, or a § under no law, attaches
  nowhere and is listed at the end under „Ohne Zuordnung zu einem Gesetz".
  The Begründungsvergleich keeps the § join's own guard
  (`ambiguousParagraphs`): the same filter there removed correct
  attachments and fixed none.
- **A Land's Begründungsvergleich joins a § of a law enacted anew by its
  own designation** (21.11.2026, `joinOwnParagraph`), after the § join. A §
  heading that runs on into prose behind its colon joins nothing (a
  Vorlage's answers to the statements). A grouped instruction „Im § N
  werden folgende Änderungen vorgenommen:" is joined at its head's §
  (22.11.2026, `groupedHead`): read whole, such units named another § through
  the citations of their payloads, or none. A change on both sides whose
  Begründung the join could not attach carries the 'unread' line, only
  where the comparison compared any Begründung.

### What a Landesgesetzblatt changed

- **A Land law's changed laws come from RIS's consolidated Landesrecht,
  filtered by the Landesgesetzblatt** (`Kundmachungsorgannummer`), never from
  an Artikel heading or a title: genitives („Änderung des NÖ
  Pflichtschulgesetzes") and Sammelnovellen would need guessing.
- **What a Land law changed is compared per §, and only where three sources
  agree** (`landLawChanges.ts`): the new wording is a version RIS ties to
  the Landesgesetzblatt (named last in its Kundmachungsorgan); the old one is
  the same §'s version that ended the day before (none at all → „neu"; a
  gap, several candidates, no date → not compared); and an instruction of
  the Landesgesetzblatt names the §. A version that began before the
  Kundmachung and has since been replaced is not taken — RIS Kärnten names
  the amendment on the wording it replaced. RIS's notes on
  Landesgesetzblätter („(Anm: LGBl.Nr. …)", „*) Fassung LGBl.Nr. …") are not
  the law's wording and are dropped. What is not compared is counted and
  named in the frame, never dropped. More than 150 §§ → the Landesgesetzblatt
  is the place to read it. Rejected: old against new as a set per law — the
  changed § set matches the instructions in only 57 of 176 laws
  (10.11.2026).
- **Which instructions of a Landesgesetzblatt amend which of RIS's laws**
  (22.11.2026, `instructionLawsOf` in `landLawChanges.ts`). An Artikel
  titled with its number alone („Artikel I") is matched by the law its
  promulgation clause names (`lgblArticleClauses`). Then a law still
  unmatched and an Artikel no law took are paired only where each is the
  other's only candidate, by the Kurztitel without RIS's own abbreviation or
  by the Stammnorm the clause cites; two candidates, or none, stay
  `lawUnmatched`. The instructions are a guard, not content: what the page
  shows are RIS's two versions of the §.
- **A Land law page compares RIS's two versions of a § with their headings
  where the headings differ** (21.11.2026): RIS keeps the heading out of
  the text, and by text alone a heading-only change read „unverändert".
- **Within 60 days of its Kundmachung a Landesgesetzblatt RIS ties no
  version to is „Im RIS noch nicht eingearbeitet"** (21.11.2026,
  `LAND_CONSOLIDATION_DAYS`), on the § comparison as on the list, and not
  cached; „Nicht veröffentlicht" only after.
- **A § of a law the Landesgesetzblatt enacts anew is named in a sentence
  true of it** (19.11.2026, `enactedUnread` in `landLawChangesService.ts`):
  where RIS holds it in no single version whose text the monitor reads, it
  is listed — never as „eine Anweisung nennt ihn", and never dropped.
- **A § a Landesgesetzblatt repeals, of which RIS holds no earlier
  version, is withheld as `unpaired`** (20.11.2026,
  `landLawChangesService.ts`): neither side was read, and the § fell out
  of both lists.
- **A law a Landesgesetzblatt repeals as a whole is stated once, not listed
  § by §** (23.11.2026, `lgblRepealedLaws`, `LandRepealedLaws`). One row
  per law: it says that the Landesgesetzblatt repeals the law as a whole,
  and how many §§ RIS records as repealed by it. It is what the
  Landesgesetzblatt does, so the row takes no gap lead word and no „nicht
  gezeigt". It needs both witnesses: every version RIS ties is „aufgehoben
  durch" this Landesgesetzblatt, and one of its own sentences puts that law
  out of force by the Stammnorm RIS gives it, never a § or an Artikel of it,
  never „mit Ausnahme". RIS alone is not enough: it records two Verordnungen
  as repealed by Salzburg's LGBl. Nr. 64/2018 that the Landesgesetzblatt
  does not name, and those §§ stay `lawUnmatched`.
- **A „lautet:" wording RIS's version lacks withholds the §** (22.11.2026,
  `lautetMissing`, reason `wordingNotInRis`). Wien LGBl. Nr. 45/2020 lets a
  wording expire, RIS ties the version after the expiry to it, and the page
  showed the Landesgesetzblatt's own words as removed by it. Words, not
  sequence; where the instruction quotes its wording, only the quoted text
  (Wien goes on behind it: „der bisherige § 143 erhält die Absatzbezeichnung
  „(1)"; diesem wird … angefügt"). One direction only: RIS's number, heading
  or division lines, which the Landesgesetzblatt prints outside the §, stay
  a count. The two signatures that close a Landesgesetzblatt are not its
  wording, where they stand as plain paragraphs behind its last
  instruction (23.11.2026, `SIGNATURE_BLOCK_RE`: both offices in order, then
  only the names).
- **A § a Landesgesetzblatt renumbers is withheld** (22.11.2026,
  `lgblRenumberedParagraphs`, reason `renumbered`). RIS files a § under its
  number, and after „Die bisherigen §§ 2a, 3 und 4 werden als §§ 3, 4 und 5
  bezeichnet" the two versions under „§ 3" are two paragraphs. Every § such
  an instruction names, under the old number and the new, is withheld and
  says why. The two phrasings read are the ones the cached
  Landesgesetzblätter use: „… werden als §§ … bezeichnet" and „… erhält die
  (Paragraphen)bezeichnung „§ …"". Rejected: pairing the § with the history
  of its old number — a second history read per § and a mapping of two
  lists, for a handful of Landesgesetzblätter.

## Ohne Begutachtung

- **Salzburg, the one Land with a statement, in this order of evidence:** a
  draft of the register joined to the law (the Land's record or the title
  search) — consulted; the Regierungsvorlage's Erläuterungen carry
  „Ergebnis(se) des Begutachtungsverfahrens" and do not also say there was
  none — consulted, shown as a win; then silent for a budget law
  (Landeshaushaltsgesetz, not the Allgemeines Landeshaushaltsgesetz), a law
  older than the register's reach, a draft with a similar title before the
  Beschluss, a document not read, no route in RIS; „ohne Begutachtung" only
  last, with the Vorlage read in full without the heading — or the
  Initiativantrag read in full without the word „Begutachtung" — and a
  committee report that names none except to say there was none.
- **Every other Land says „nicht feststellbar"** and why: its register keeps
  drafts too briefly to be joined (a draft may have existed and been taken
  down), or no Landtag document RIS links is read for this question.
  Rejected for Burgenland: its register does not carry the key Salzburg's
  Vorlagen do, and the hand sample of „none" laws found 1 of 25 wrong.

## Measured figures

| What | Value | Sample, date |
|---|---|---|
| Oberösterreich Textgegenüberstellung: §§ confirmed / new / withheld | 1,301 / 239 / 213 | 73 drafts · 22.10.2026 (§12.45) |
| Salzburg title search against the Land's own link | laws 262 of 267, Verordnungen 355 of 357 | 22.10.2026 (§12.47) |
| Salzburg Textgegenüberstellung: §§ shown / withheld | 1,716 / 451 | 147 drafts, 140 with a comparison · 14.11.2026 |
| Changed §§ with a per-§ reasoning | Oberösterreich 88 %, Salzburg 65 % | 25 drafts each (§12.53) |
| Land Textgegenüberstellung, right column found in the draft | 552 of 552 judgeable §§ | 63 documents, Oberösterreich, Salzburg, Tirol, Wien, 1,160 §§ shown, GP XXVIII · 19.11.2026 |
| The same check under fault injection, caught | another § of the same draft appended 57.0 % (312/547), another draft's sentence 76.4 % (422/552); with the word-for-word rule (`landTguStrict.ts`), where the draft quotes the wording: a number changed 611 of 652, one word swapped 876 of 934, a sentence dropped 315 of 348. The Bund's annex gate has no such rule | same · 20.11.2026 |
| Land station pairs, with the Bund's checks | hits 0, breaches 0, symmetry 0, 3 accepted (`landStationsAccepted.json`), in 362 compared pairs with 8,461 units; Kärnten 93 of 99 pairs compared, Oberösterreich 69 of 69, Salzburg 200 of 201, Tirol 0 of 3 (PDFs not in the cache) | 372 cached pairs, GP XXVIII · 20.11.2026 |
| Länder LGBl title match (Oberösterreich oracle) | 77 of 83 right, at most 2 wrong | (§12.43) |
| Oberösterreich draft → promulgation comparable | 83 of 83 | 22.10.2026 (§12.44) |
| Salzburg „ohne Begutachtung" | 41 of 452 laws, all Initiativanträge | GP XXV–XXVIII · 10.11.2026 |
| Salzburg Vorlagen joined by title that carry the heading | 264 of 264 | laws since 2016 · 10.11.2026 |
| Land laws with ≥ 1 law at its geltende Fassung in RIS | 98.0 % of amending laws (2,720 of 2,776), 97.5 % of all | all nine Länder since 2016 · 10.11.2026 |
| First text → Kundmachung comparison shown | Salzburg Initiativantrag 87 of 103, Oberösterreich Beilage 181 of 201 | since 2016 · 10.11.2026 |
| Land law „Was das Gesetz geändert hat": laws with ≥ 1 § compared / named §§ compared | Burgenland 19 / 86 %, Wien 14 / 77 %, Tirol 17 / 69 %, Niederösterreich 16 / 60 %, Steiermark 18 / 58 %, Oberösterreich 15 / 49 %, Vorarlberg 17 / 43 %, Salzburg 13 / 34 %, Kärnten 10 / 23 % | 20 laws per Land since 2016, 5 per Land checked against the instructions · 12.11.2026 |

## Rejected alternatives

- **An index over all Regierungsvorlage PDFs.** A standing obligation, not a
  query (§12.47).
- **Headings detected by text alone.** Mostly wrong; font weight is used for
  Wien only (§12.62).
- **Character similarity for LGBl matching.** The boilerplate („Gesetz, mit
  dem das … geändert wird") dominates; distinguishing words are used
  (§12.43).
- **A first text from the Landtag item RIS links** (Wien, Niederösterreich,
  Tirol). Wien's Beilagen read as law text 3 of 10, Niederösterreich's 0 of
  10 (10.11.2026).
- **Kärnten's instruction heads read through the Bund's `novao` grammar.**
  It would show one § wrong and withhold two correct ones, for about 40
  lines saved (12.11.2026).
- **A weekly drift alarm for the Länder.** It would fetch nine sites from a
  runner every week: an obligation to operate, and a Land's site does not
  reliably answer a runner. In its place the Land guard with its baseline,
  its floor and its page accounting, run with each round, and
  `tests/landTguGolden.test.ts`, which pins the draft rules' verdicts on six
  real documents on every push (21.11.2026).
- **`coverOfRis` for the changed §§ of a Land.** Neither the comparison's
  spacing rule nor `foldSpacing` clears its refusals without passing a real
  difference or keeping the format refusals (RIS notes, tables, a lost
  exponent) (21.11.2026, measured twice).
