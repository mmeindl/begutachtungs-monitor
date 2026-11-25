---
paths:
  - "server/utils/annex/{annexStrict,annexMark,verdict,coverage}.ts"
  - "server/utils/laender/landTguStrict.ts"
  - "shared/utils/draftCheckReasons.ts"
  - "scripts/harness/faultInjection.ts"
  - "scripts/lib/{rightColumnFaults,faultSites}.ts"
---

# The draft check: the annex held against the draft

The annex's columns held word for word against the draft's own law text, and
the Vermerk the page sets from it, for the Bund and the Länder, with its
measured figures, known limits and rejected alternatives. What an entry
holds, and the other areas: `docs/decisions.md`.

## The draft check

- **The right column of a Bund annex is held word for word against the
  draft's own law text** (21.11.2026, `annexStrictChecks` in
  `annex/annexStrict.ts` over `strictCheck` in `laender/landTguStrict.ts`,
  the Länder's check). The gate's word bags with floors caught a single
  misread figure or word, or a last new sentence lost, only where the
  Lesefassung's oracle saw it. Every word the column shows as new must
  stand, in order, in wording the draft's instructions for the § quote or
  print, and wording of the draft the column lacks is named too
  (`notShown`) — unless the column says it leaves text out there: an
  elision mark, which at the column's edge stands only for what follows
  the last word the column prints (22.11.2026). What cannot be held is
  said, not passed: a § no instruction names, a law the draft does not
  name, an instruction whose quotations have no readable role, a § too
  long for the alignment.
- **Only typography is normalised, in both directions** (21.11.2026): no
  letter, no digit, no order, no threshold; a single word is a finding.
  Details: the header of `laender/landTguStrict.ts`, `respace`.
- **A corpus that moves correctly says nothing about a rule that loosens
  the check** (23.11.2026): of nine rules that let the draft check account
  for more, whose 17 real §§ all read sound, two readers told to break them
  got a column the draft does not order past eight. The reviewer attack is
  in the skill `harness-round`.

## Struck text

- **The draft check reads what the right column strikes, on the Bund**
  (22.11.2026, `struckAccount` in `laender/landTguStrict.ts`, asked by
  `annexStrictChecks` alone). A sentence the draft keeps that the column
  loses shows on the page as a deletion the draft does not make; the
  oracle alone sees most of these, but a held draft check stands against
  it. Every struck word has to be the draft's (quoted as struck, in a unit
  repealed or written anew, in a stretch struck by a counted position, or
  notation); what is left makes the § differ (`struckNotInDraft`). The
  grammar of each case is in `struckAccount` and the helpers it names.
- **Each instruction accounts only where and for what it strikes**
  (22.11.2026): an address is a path, a line is read clause by clause, and
  a wording, a repeal, a position or a payload pays only inside the units
  its own line names. Details: `struckAccount`, `unitsOf`, `quoteRoles`.

## The Vermerk

- **A Bund annex § is shown without reservation only where its new text is
  confirmed** (21.11.2026, `markOf` in `annex/annexMark.ts`; the
  maintainer's decisions of 21.11.2026). The table stands on top of the
  gate and never withholds: a § the gate withholds stays withheld, and a §
  the gate marks „nicht geprüft" keeps that mark and its reason, also where
  the Lesefassung confirms it. For the rest: the draft check holds the §
  with at least one new word — no mark; the draft check objects — „nicht
  bestätigt", a second pill and a state of its own (`check:
  'unconfirmed'`, never derived from a reason string), the § shown all the
  same as the annex prints it; the draft check could not run — no mark
  where the Lesefassung confirms the §, else „nicht geprüft" with the
  reason in the Länder's words (`shared/utils/draftCheckReasons.ts`, one
  wording for Bund and Länder). Whose error an objection is, the page
  never says: the definition of „nicht bestätigt" names both, the two
  documents differing and the monitor's check erring.
- **Where the Lesefassung confirms a § the draft check objects to, the § is
  unmarked only where the objection names no wording of the draft the
  column lacks** (the maintainer's decision of 21.11.2026,
  `OBJECTION_OVER_CONFIRMATION = 'missing'`). The oracle holds the column
  by containment and cannot see wording it lacks; the §§ that name missing
  wording held all real differences of the cell read. The cell's two other
  values stay measurable in the records.
- **An objection about struck text alone stands whatever the Lesefassung
  says** (the maintainer's decision of 22.11.2026, `overrules` in
  `annexMark.ts`): in every injected lost sentence read, the draft check
  named it and the oracle confirmed wrongly. The price, taken: §§ whose
  objection is a false alarm of the draft check carry „nicht bestätigt"
  until the check reads those shapes. Where the objection names new words
  too, the confirmation still stands (one replacement at one place).
- **A § that shows only deletions is unmarked where the draft names what it
  strikes** (22.11.2026, `markOf`): every struck word accounted for by a
  quotation, a repeal or a unit written anew, and one at least. Struck by a
  position the draft only counts, or nothing the check could read: unmarked
  where the Lesefassung confirms the §, else „nicht geprüft"
  (`MARK_DELETIONS`). Otherwise an objection at a § without new text is
  judged as at any other §.
- **The oracle's check 2 does not stand against a held draft check**
  (22.11.2026): of 60 §§ read where it contradicts one, most were limits of
  the engine or the oracle.
- **A failed read of the Lesefassung costs its confirmation, not the annex**
  (23.11.2026, `readAndCheck`). The rows go out with marks built without
  the oracle, which can only mark more and never clear a §; the page says
  so („Gerade nicht abrufbar"), and the answer is not stored.

## Measured figures

| What | Value | Sample, date |
|---|---|---|
| A sentence the draft keeps, lost from the right column, judged through the whole chain | 982 of 1,002 (98.0 %, PDF) and 668 of 680 (98.2 %, table), held to 95 % on both paths | GP XXVIII (258 drafts), `faultInjection.ts --json` · 22.11.2026 |
| Classes not held to 95 % through the chain (PDF / table) | a designation 89.4 / 92.3 %, a sentence of the left column lost 79.4 / 78.8 %; another §'s sentence as proposed text not held on the table path | same |

## Known limits

Measured and not built: each either has no real case, or a rule for it would
mark sound §§ or risk a wrong clearance. A rule per § is not worth the risk
of a wrong clearance; counting a lifted § heading as shown was tried and
cleared KommAustria-G § 2 wrongly.

- **The other direction is not checked:** an old wording the draft replaces
  that still stands in the right column (StVG § 182). A rule would mark
  well over ten sound §§; it needs a narrower idea.
- **A payload whose address is not read, or whose unit the column does not
  print where the check looks, accounts between its own words wherever
  they align:** the largest hole class left (MVW § 4).
- **Each would mark sound §§:** a quoted wording counted once without
  „jeweils", the place of a piece of a §'s own quote, the end of a last
  list item on the PDF path at the first sentence end, the zone ahead of
  the § designation read as struck text.
- **Passes a column the draft does not order, no real case found:** a
  sentence ending on an article and a figure („… beginnt im 3.") read on
  into the next; the id list read a level up; a heading zone ended by a
  citation of the § in its own first sentence; a renumbering line running
  on into „und § 2 wird …"; an inserted wording asked only where the line
  names one §; two same-numbered units below an unknown part (GebG § 14);
  a single kept word joining two struck stretches.
- **Other holes:** an added „nicht" passes where the payloads leave one free
  (59 of 1,755 PDF, 28 of 968 table, 23.11.2026); a lone designation may
  come from the payload (about 10 of 1,207); a payload stretch printed
  twice; „1-5" against „15"; a renumbering in an unread phrasing is
  compared by number (a net on text likeness would cost two sound §§).
- **„(entfällt)" over an elided row** passes 330 of 399 injected faults on
  the table path; no such row of the corpus stands opposite an elided left
  column.
- **An invented group number at a §'s foot** passes 41.7 % (PDF) and 9.6 %
  (table), the first words of the next § 3.8 % and 7.8 %. `/genauigkeit`
  says so in words, because no round records these rates.
- **An elision inside a joined PDF row hides the payload it stands for**
  (97 d.B. XXVIII § 45): the table path marks the §, the PDF path holds it;
  the rule would sit in the shared draft check.
- **Sentences an instruction moves to another §** read as struck text the
  draft does not strike (GrEStG § 4).
- **A new § the annex sets opposite the next one's first rows:** that §'s
  heading reads as struck. The mark is right: the page shows a deletion the
  draft does not make.
- **A Vermerk too many, one-offs** on sound §§: parts paid per stretch
  („entfällt der Schlussteil"), a § named by its new number without
  „(neu)", word-diff cuts, rows split or joined by layout, sentences that
  cannot be counted, unquoted new designations, elisions the reader does
  not parse.
- **Lines the reader leaves unread, so the § stays „nicht geprüft":**
  „lautet der erste Satz „X“" without a colon (no line in the corpus),
  „Punkt 5. der Anlage 1 lautet:".

## Rejected alternatives

- **Marking a § whose deletions the Lesefassung does not confirm** („struck
  text needs the oracle", 21.11.2026). The oracle sees a kept sentence
  struck only where a Lesefassung exists and confirms: the rule would have
  marked up to 907 more §§, 39 % of the shown ones instead of 23 %. The
  draft check reads struck text instead.
