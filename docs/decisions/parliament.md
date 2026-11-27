---
paths:
  - "server/utils/{parliament,ris}/**"
  - "server/api/{antraege.get.ts,ohne-begutachtung.get.ts,staatsvertraege.get.ts}"
  - "server/api/{genannt,ris-map,stations,drafts}/**"
  - "shared/utils/{antragPath,antragPathTable,budgetExempt,miterledigung,citations,secondRound,promulgation,rvLatency,draftStations,risConsultations}.ts"
  - "scripts/corpus/**"
  - "data/**"
  - "server/api/{ris-drafts,verfahren,bgbl,stellungnahmen}/**"
---

# Following a Bund law through Parliament and RIS

Following a Bund law: „ohne Begutachtung", the joins between Parliament and
RIS, and how Parliament's items are read. What an entry holds, and the other
areas: `docs/decisions.md`.

## Ohne Begutachtung

- **„Ohne Begutachtung" is said only on evidence, and never as a reproach.**
  A procedural fact per law, no total beside the list's count, no ranking
  or filter by Ressort (a Ressort filter over these rows would be that
  ranking). Doubt says nothing: a missing, late or failed read is silence,
  never „keine".
- **Bund, four classes in this order:** consulted (a draft's stage record
  links the Vorlage, a chain reached it, or the Antrag table names the
  Antrag), exempt (the budget procedure: `shared/utils/budgetExempt.ts` and
  titles that start with „Bundesfinanz(rahmen)gesetz"), unknown (part of a
  consulted draft's text in the Antrag, a plausible draft by title, a check
  that did not run, no Gegenstand, the law's own Erläuterungen or Antrag
  text mentioning a Begutachtung), none. Only none says „ohne
  Begutachtung"; a law whose Nationalrat committee itself invited written
  Stellungnahmen is „Ausschussbegutachtung", never both. A period whose
  drafts are not linked to Vorlagen carries no such rows at all.
- **The source's reach is said as structural, never as „gerade"
  (15.11.2026).** The Bundesgesetzblatt in RIS begins 01.01.2004
  (`BGBL_AUTH_FROM`, one constant; answers carry it as `coversFrom`). A
  period that ended before it answers `gap: 'beforeSource'` (XIV–XXI); one
  that began before it (XXII) keeps its rows and says the laws promulgated
  earlier are missing; an Initiativantrag of a period before it says its
  Kundmachung cannot be checked (`periodAgainstSource`, `lawsReachNoteDe`,
  `antragGapNotes`).
- **A mention silences.** Every HTML document of the carrying Gegenstand
  except Gesetzestext and Textgegenüberstellung is read; „Begutacht…"
  anywhere in it makes the law „nicht feststellbar" (no row, no count; the
  page says so). Read like the committee check: same round, same budget, an
  unreadable document is a check that did not run and the law is left out.
  It errs towards silence: 607/A mentions another law's Begutachtung.
- **The rail out of that station says it in shape too, never alone:** pale =
  not walked (a known „ohne Begutachtung"), pale and dashed = not known
  („nicht feststellbar"), ink = walked; the words and a screen-reader word
  („nicht erreicht", „unbekannt") carry the fact.
- **Said once, as the first station of the card.** Pale (the rail's
  hollow, grey state, no warning colour) where none took place or none can
  be told; an ordinary station where one took place. Never a sentence above
  the card beside it.

## Joins

- **A positive from a constructed join (title similarity) may be shown with a
  link to check it. A negative never goes into a headline, a list column or a
  filter:** at 85–92 % coverage one row in twelve would be wrong, in the
  direction that sounds like an accusation. Applies to BGBl II and to the
  Länder (§12.32, §12.43).
- **Whether a RIS record has a Gegenstand is decided by the RIS↔ME join;**
  the title classifier only labels. Errors must fall on the harmless side:
  call a Verordnung a law, never take a law's Parliament page away (§12.16).
- **The RIS↔ME join weighs the end of the Frist highest and never trusts its
  start alone.** Parliament and RIS share no identifier, so a draft is
  matched to its RIS record by dates, ministry and title. The end date is
  equal in 336 of 337 true pairs; the start lags by 1 to 14 days in 28 %,
  because RIS publishes first; dates and ministry together are not unique.
  A change to a weight, a band or the title normalisation keeps the
  regression on both periods green (`tests/risJoin.test.ts`) or raises
  `RULE_VERSION` and regenerates `data/ris-me-map-gp27.json`, whose diff is
  read row by row: every changed RIS id is a claim.
- **The RIS Begut list is read whole or the shortfall is said** (18.11.2026).
  The list sorts by the Frist end, and records that share a day stand in no
  fixed order between two page requests: where such a day straddles a page
  boundary, one record comes twice and another not at all. A repeat is the
  sign. Its day is asked for whole (`InBegutachtungAm`) and added; what then
  still falls short of RIS's own count is logged. `begutCollector`
  (`ris/risRecord.ts`) is the one implementation, for the server and the
  scripts. Sorting by another column does not help: `Kurztitel` and
  `EinbringendeStelle` tie far more.
- **A draft without a RIS record is a state the page shows, not an error.**
  The twelve of GP XXVII are an upstream gap (the BMK's transport section
  between March 2020 and April 2021, and two drafts of the BMEIA).
- **Where RIS and Parliament state different deadlines for the same draft,
  the draft stays matched and the difference is shown** (84/ME XXVII: one
  month apart, start, ministry and title equal).
- **Never link a chain by short title** (§12.21). Laws in BGBl I are ordered
  by BGBl number, not by decision date (§12.23).
- **In the BGBl II join a shared name ranks before the title score**
  (14.11.2026, `bgblJoin.isNamed`): a Kundmachung that shares the draft's
  Kurztitel or Abkürzung, and is of the same kind (both amend or neither),
  is preferred over a higher-scoring one without it — an amendment always
  names the Verordnung it amends, and `cont` scores it higher than the
  Verordnung itself. A description („Änderung der …") and a running number
  („37. MBA-Verordnung") are no names. The witness only orders candidates
  above `BGBL_ACCEPT`; it admits none. This is not linking by short title
  across a chain: the witness decides only among candidates the window, the
  Ressort and the threshold already admit.
- **A Länder § comparison runs only against a promulgation the Land itself
  names,** never against our own title search, even with one candidate: it
  fails when the right promulgation lies outside the window (§12.44).
- **„In 298 d.B. genannt": a draft Parliament links to no Vorlage, whose
  title the Erläuterungen of another draft's Vorlage name** (14.11.2026,
  `server/utils/parliament/namedInRv.ts`). Parliament's links are not the
  complete list of what became of a draft: a ministry can fold one draft
  into the Vorlage of another, which Parliament then links to that one
  only (44/ME XXVIII in 298 d.B., linked to 54/ME). A positive from a
  constructed join, so shown with the sentence that carries it and a link
  to the document. All six conditions or no state:
  1. closed, no linked Vorlage, the period's links exist
     (`mayClaimOutcome`), no Initiativantrag route (`antragPath`, whole or
     in part), no same-title successor;
  2. a title core — normalised, without a leading „Bundes(verfassungs)gesetz
     zur/über …/mit dem" and a trailing „, Änderung"/„-Novelle …" — of at
     least 25 characters that is not a list of laws ending in „u.a.";
  3. the core verbatim on word boundaries inside one paragraph of the
     Erläuterungen of a Vorlage of the same period not linked to the draft
     (a group named „Erläuterungen", else one that carries them under
     another name, „Vorblatt, WFA, Erläuterungen");
  4. that Vorlage came after the Frist and at most `RV_LATENCY_CONTEXT_DAYS`
     (180) later;
  5. exactly one Vorlage in that window names it — a PDF-only Erläuterung
     in the window is read to rule out the second witness, and one that
     cannot be read refuses the state;
  6. the sentence is a witness: it does not call the draft a pending
     „Entwurf"/„Begutachtung" before naming it, and where the title amends
     a law (the core is the law's name) it says the Vorlage takes the text
     up („aufgenommen", „übernommen", „einbezogen", „integriert", …).
  A partially built index claims nothing; the draft then says what it said
  before. The state is its own: no § comparison, no Parlament or
  Bundesgesetzblatt station on the draft's bar (hollow, they would read as
  still ahead of this draft while the Vorlage went on without it), and the
  base rates keep counting Parliament's links only.

## Parliament's items and how they are read

- **The Bundesrat's Einspruch is an event of the station Parlament**
  (14.11.2026, `server/utils/parliament/bundesratObjection.ts`). Read from
  the law's own Verlauf: the stage „Antrag, Einspruch zu erheben,
  angenommen", in „Plenarberatungen BR", which links the Einspruch's item
  (type EBR, „20 d.B."). Two traps, both in the tests: „Antrag, keinen
  Einspruch zu erheben, angenommen" stands on almost every law, and the
  motions before the stage („Antrag der Bundesräte …, Einspruch zu erheben
  (…/GO-BR/…) angenommen") carry a GO number, not the EBR; a title is never
  read — treaty Vorlagen are called „Einspruch der Republik Österreich gegen
  …". The second witness is the period's EBR list (list 101, `ITYP` I and
  `DOKTYP` EBR, asserted on every row), each EBR naming its law through
  „Bezug zu": it supplies the EBR where the stage links none. What followed
  is read off the EBR's own Verlauf and only in the vocabulary measured on
  all 35 EBR of GP XXII–XXVIII: „Wiederholung des Gesetzesbeschlusses" or
  „Bekanntgabe des Beharrungsbeschlusses" is a Beharrungsbeschluss; „Antrag
  auf Annahme des veränderten Gesetzesvorschlags … angenommen" a changed
  text; no decision is „pending" while the EBR's period runs and „lapsed"
  after it; anything else, or an unread record, is „unknown" and says so.
  The Einspruch is no Beschluss of the Bundesrat: no „Nationalrat und
  Bundesrat haben beschlossen", no „nicht kundgemacht" while it is
  undecided. The headline is „Gesetz geworden" where a Kundmachung is found
  — Parliament links it on the EBR, RIS keys it by the Antrag too
  (`Initiativantrag`) —, otherwise „Einspruch des Bundesrates", with „–
  Gesetzgebungsperiode beendet" once lapsed. A row „Bundesrat" says what
  happened and when, never why. After a changed text nothing calls the
  first text „unverändert", and an Abänderungsantrag adopted in plenary
  counts as a change even where no Plenarfassung was published. The EBR's
  own address leads to its law's page; any other item the monitor does not
  follow is refused as „Kein Gegenstand, den der Monitor verfolgt", with
  its page at Parliament, never as „nicht gefunden".
- **§ 23b GOG-NR covers more than Vorlagen and less than everything.** It
  names Regierungsvorlagen, Anträge of members and of committees, the
  Bundesrat's Gesetzesanträge and Volksbegehren (Abs. 1), Petitionen and
  Bürgerinitiativen (Abs. 2). Parliament admits no Stellungnahme on a
  Vorlage on a Staatsvertrag (type RVS); whether a motion of a third of the
  Bundesrat's members is covered is open. So no copy says „jede
  Gesetzesinitiative", and the statement window of every route the monitor
  adds is the one already stated for a Vorlage (`SECOND_ROUND_WINDOW`).
- **Before 01.08.2021 no Stellungnahme was possible, and the page says so**
  (14.11.2026, `statementsPredateSecondRound`): „Stellungnahmen an den
  Nationalrat waren erst ab 01.08.2021 möglich." in place of „Keine
  eingebracht" — on every item of a period that ended before that day (GP
  XXVI and earlier, whose flag reads „0"), and on a GP-XXVII item only where
  its flag says „9 Begutachtung erst ab 1.8.2021".
- **A treaty's Kundmachung: RIS's key first, Parliament's link as
  fallback** (14.11.2026, `resolveTreatyBgbl` in
  `server/utils/parliament/staatsvertraege.ts`, one function for the page,
  the station map and the list). The key is the law's: period and Vorlage
  number (`Gesetzgebungsperiode`, `Regierungsvorlage.item`) on a Teil-III
  record, or Teil I for an Art.-15a-Vereinbarung (list 101's `VHG`
  „RVS15"). It wins because Parliament's link can be wrong: 1041 d.B. XXVII
  links BGBl. I Nr. 187/2021, the COVID-19-Zweckzuschussgesetz, while RIS
  keys the Vereinbarung to I Nr. 193/2021. The link stands only where RIS
  has no record; a disagreement is not shown. No title join. And a treaty
  never gets the 120-day „nicht kundgemacht" claim (decision 5 of
  `docs/research/umsetzungsplan-weitere-wege.md`): a Kundmachung follows
  the ratification, which no date of Parliament's bounds — 42 of the 87
  promulgated treaties of GP XXVII took more than 120 days. A missing one
  is „ausstehend" while the period runs and afterwards only „im RIS bisher
  nicht verzeichnet", a statement about our search
  (`pnpm corpus:staatsvertraege`).
- **Every item of list 101 on a law has a kind, and the kind is read from
  the `DOKTYP`** (14.11.2026, `pageKindOf`): RV Regierungsvorlage, A
  Initiativantrag, BUA Ausschussantrag, GABR/GABR13 Gesetzesantrag des
  Bundesrates / von Mitgliedern des Bundesrates, RVS Staatsvertrag (RVS15
  Vereinbarung nach Art. 15a B-VG, read from the Verlauf stage). Each has an
  address that names it (`/entwuerfe/<gp>/ausschussantrag/<n>`, …), and
  `/vorlage/<n>` 301s there once the type is read. One read per period
  (`getItemsForGp`, `ITYP` I with these `DOKTYP`s, asserted on every row);
  never `{ GP_CODE }` alone. A Berichterstatter in `names[]` is never
  printed; Bundesrat members are never named.
- **A law from an Ausschussantrag claims „ohne Begutachtung" only under the
  Antrag's three checks, and stays silent when its „Bezug zu" parent was
  consulted** (`related-consulted`): a committee motion on a consulted
  Regierungsvorlage says that it refers to that Vorlage, whose draft went
  through Begutachtung, never that its text is the consulted one.
- **A citation carries a prefix only where it is true and established**
  (RV, AB for a committee motion, IA). A Bundesrat motion is cited by its
  bare Beilage number („452 BlgNR 25. GP"): the BGBl and RIS file it under
  „RV" for want of another slot, and copying that would name the government
  as its author. No invented prefix.
- **Every Initiativantrag is a row of „Alle Initiativanträge"**
  (`/api/antraege`, outside „Alle Arten"), and the open ones are rows under
  „Stellungnahme möglich" with „Alle Arten" too (16.11.2026, maintainer's
  decision, `antragRowsOf`): that status holds every item one can file on,
  and the home page's door „Stellung nehmen im Parlament" leads there. An
  open Antrag sorts as an open Vorlage, by its Einlangen, never ahead for
  being open (`rowOrderKey`). The exception to „every": one that carries a
  consulted draft's text: that is a row of its draft, and its own page names
  the draft in a row worded by the match (whole text, or „ein Teil"). The
  states are read per item, never from the list's status column alone: it
  predicts the Stellungnahme flag in 182 of 183 items of a running period
  but in 560 of 895 after the period ended. „Stellungnahme möglich" stands
  only on the item's own flag. A Miterledigung („Miterledigt mit Bericht
  565 d.B.") is its own outcome on every page and row, never „ohne
  Beschluss". No club names in rows, no club filter, no counts per club.
- **„Neues Gesetz" needs positive evidence** (14.11.2026,
  `createsNewLawFrom`): no law found AND no Novellierungsanordnung AND no
  name saying it amends, or that it repeals without also enacting
  (23.11.2026: 139/ME XXVIII repeals one law and enacts its successor). A
  law the reader could not name is „nicht lesbar", never „neues Recht"; a
  text it could not identify (a motion's „Gesetzesantrag" or „Antrag") is a
  stated gap in the frame, never a missing frame.
- **A new law's row links its text** (20.11.2026, `newLawText` in
  `entwurfFrame.ts`): „Neues Gesetz" stands where „Ändert" would, its value
  the draft's „Gesetzestext" (the PDF, else the HTML) with „Zitieren", as a
  law in force is linked there. The document is found by its title, exact
  or prefix: „Gesetzestext" on a Ministerialentwurf and a Regierungsvorlage
  alike. Without one (an Antrag publishes only itself) the row keeps its
  sentence, never an empty value. The credit names Parliament, whose
  document list it is. Its sentence says what the text is and nothing about
  law in force (23.11.2026): at least 14 of the 53 new laws of GP
  XXVII–XXVIII repeal one.
- **A law is named from a title or a clause only by an exact match**
  (14.11.2026, `titleLaws.ts`, `law-by-name`): where no clause cites a
  Stammnorm, the title „…, mit dem das X (und das Y) geändert wird" names
  the laws only if every piece is the Kurztitel or Abkürzung of exactly one
  consolidated law in RIS — all pieces or none; „Allgemeine
  Sozialversicherungsgesetz" is not the ASVG, an EU act is never a law of
  ours. A law found by name carries RIS's own Stammnorm. Rows are merged
  only when they resolve to the same RIS law, never because two laws share a
  Stammnorm (FPG, NAG and AsylG 2005 are all BGBl. I Nr. 100/2005).
- **„idF" never names a Novelle published after the reference date**
  (15.11.2026, `latestAmendmentOf` with `keep`, `amendedByOn`). RIS rewrites
  some § versions in place, so a version in force on the date can carry a
  later „zuletzt geändert durch". A later year is late outright, a Novelle
  of the reference year by its issue date; an unknown date gives no „idF".
  Known residue: a Novelle before the date that touched only rewritten
  versions is missed.

## Measured figures

### The corpus

| What | Value | Sample, date |
|---|---|---|
| RIS Begut records by type | Verordnungen 65.9 %, laws 33.4 % | 4,574 records · 17.09.2026 (§12.16) |
| Running Begutachtungen list 81 covers | 4 of 8 | 17.09.2026 (§12.16) |
| RVs without a `preconst` pointer | 32 of 117 | GP XXVIII (§12.28) |

### The monitor's own accuracy and coverage

| What | Value | Sample, date |
|---|---|---|
| RIS↔ME join, GP XXVII | 337 of 350 matched, 1 weakly, 0 ambiguous, 12 without any RIS record; by hand 25 of 25 sampled matches right, 12 of 12 absences confirmed | 350 Ministerialentwürfe, 966 RIS records in the period · 06.09.2026 |
| RIS↔ME join, GP XXVIII | 161 of 163 matched, 1 weakly (11/ME), 1 without a RIS record (60/ME) | `pnpm corpus:tgu-deckung -- --gp XXVIII` · 18.11.2026 |
| Ordinance → BGBl II join found | 85.4 %; 91.1 % where the Frist is over a year old | 251/294, 163/179 · 22.10.2026 (§12.32) |
| Ordinance drafts matched to a BGBl. II | 263 of 304 | RIS `Begut` · 14.11.2026 |
| RIS Begut list read whole | 4,621 of 4,621 | `pnpm corpus:tgu-deckung`, one pass over 47 pages · 18.11.2026 |

### What becomes of a draft

| What | Value | Sample, date |
|---|---|---|
| Drafts that reach a Regierungsvorlage | XXVII 84 %, XXVI 70 % | 296/353, 114/163 · 08.09.2026 (§12.10) |
| RV within 180 days of the Frist | 89.5 % | GP XXVII (§12.10) |
| Drafts open at the end of the period that got an RV in the next | XXVII 4 of 61, XXVI 14 of 63 | (§12.10) |
| Expired drafts without an RV that became law as an Initiativantrag | 42 of 140 | GP XXVI–XXVIII, text overlap ≥ 0.6 · 30.09.2026 (§12.10) |
| Drafts without a linked RV whose title another draft's RV names („genannt") | XXVIII 1 (44/ME → 298 d.B.), XXVII 1 (93/ME → 945 d.B.), XXVI 0 | every Vorlage of the period read · `pnpm corpus:rv-genannt` · 14.11.2026 |
| Cold „genannt" index, production build, 320 MB heap | GP XXVIII 17 s with its station map, peak 251 MB | 14.11.2026 |

### Laws without a Begutachtung

| What | Value | Sample, date |
|---|---|---|
| Bund laws „ohne Begutachtung" + „Ausschussbegutachtung" | XXVIII 57 + 8, XXVII 320 + 8 | 205 and 923 federal laws · 12.11.2026 |

## Rejected alternatives

### Joins and comparisons

- **Weakening „Seit Ende der Begutachtungsfrist … liegt keine
  Regierungsvorlage vor" on every draft** because a few drafts were folded
  into another's Vorlage (14.11.2026). The verdict is true of Parliament's
  record for the other drafts; where a Vorlage names a draft, the page says
  that instead (`namedInRv.ts`).
- **„Aufgegangen in" / „zusammengeführt mit" as the state.** The evidence
  shows that a Vorlage's Erläuterungen name the draft's title, not how much
  of the draft the Vorlage carries; „genannt" is the weakest state it
  supports, and the quote lets the reader judge the rest.
- **The title witness alone** (conditions 1–5 of „genannt" without the
  sentence guard). It accepted 16/ME XXVI, which 68 d.B. names as „des dzt.
  in Begutachtung befindlichen Entwurfs", and 24/ME XXVI, whose core is
  only the heading „Zum Einkommensteuergesetz 1988:" in 190 d.B.
- **Building the station map from the Vorlage via `preconst`.** A missing
  pointer would become a false „keine Regierungsvorlage" (§12.26).
- **Lowering the BGBl II acceptance threshold.** The 0.45–0.72 band is almost
  entirely non-pairs (§12.32).
- **One promulgation ↔ one draft per period.** Removes 8 wrong matches and
  hides 20 defensible ones (§12.32).
- **A different name as a counter-witness in the BGBl II join.** Names
  differ on mostly right matches: a year moved on („…verordnung 2025" →
  „… 2026"), or a spelling („PlAblV" for „PflAV") (14.11.2026).
- **An identical title as a witness in the BGBl II join.** Descriptive titles
  recur with other content: the draft „über eine Einbeziehung in die
  Zusatzversicherung" (2008) carries BGBl. II Nr. 23/2009's title word for
  word and Nr. 362/2008's text (14.11.2026).

### Parliament's items

- **Letting the transmitting ministry lead a joint draft** (27.11.2026).
  The lead stays the first ministry code in code-point order
  (`foldJointDraft`); change it only when a page visibly names the wrong
  ministry.

## Open questions

- **Does list 81 update `Frist` when a Begutachtung is extended?** No
  extension has been observed yet; RIS and list 81 agree on 336 of 337
  deadlines of GP XXVII, so extensions are rare.
- **One Ministerialentwurf, several Regierungsvorlagen.** The page uses the
  RV whose text Parliament attaches; whether to show every strand is open.
- **Whether a Begutachtung is required at all,** federally or in any Land,
  and in what form. The product's wording („ohne Begutachtung", never
  „übersprungen") does not depend on it, but any public claim beyond it does.
- **A consulted draft under another title.** A Bund law whose draft was
  consulted under a different title and whose text took a path no record
  links still reads „ohne Begutachtung · kein Ministerialentwurf" (126 d.B.,
  Tabakgesetz, after 5/ME). Its own documents do not mention a Begutachtung,
  so „A mention silences" (under „Ohne Begutachtung") does not reach it; a
  draft under another title has no safe join yet.
- **„Upcoming" Begutachtungen** have no verified data source: the Parliament
  API knows a consultation only once it starts.
