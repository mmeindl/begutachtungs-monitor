---
paths:
  - "server/utils/parliament/anliegen*.ts"
  - "server/api/anliegen/**"
  - "app/pages/anliegen/**"
  - "app/components/anliegen/**"
  - "app/utils/anliegenView.ts"
  - "shared/utils/anliegen.ts"
---

# Anliegen an das Parlament

Petitionen, Bürgerinitiativen and Volksbegehren in the Nationalrat, and the
Petitionen an den Bundesrat. What an entry holds, and the other areas:
`docs/decisions.md`.

## Anliegen an den Nationalrat

Built 15.11.2026; the measurement and the plan are
`docs/research/umsetzungsplan-petitionen-volksbegehren.md`, the decision
memo `docs/research/wege-ausserhalb-der-stationen.md`.

- **A different object, not a sixth kind of draft.** A Petition, a
  parlamentarische Bürgerinitiative and a Volksbegehren need not end in a
  law and walk none of the five stations. They share no type, list or
  address with the Entwürfe: `AnliegenRoot`, `/anliegen`,
  `/anliegen/<gp>/<kind>/<nr>`, a rail of their own. The list read is their
  own too (three list-101 reads per period, each row asserted against the
  requested type); `VOLKBG` never joins `getItemsForGp`. A header label of
  its own, „Anliegen" (16.11.2026; the wordmark leads to the
  homepage), and a door on the homepage.
- **Why it is built although Parliament shows the same items:** the aim is
  one place from lawmaking to raising one's voice. The memo recommended
  linking only; the maintainer decided otherwise (14.11.2026).
- **The item's own flags open the door, nothing else.** „Unterstützen" and
  „Stellung nehmen" stand, in blue, only where `approvalstate` and
  `statementsstate` of that item say open. List 143's `AKTIV` may narrow a
  list (it agreed on 65 of 65) and never opens a door. `status.number` and
  `status.description` say nothing about an ending and are not read for
  one.
- **There is no Frist, so no calendar and no countdown.** The window closes
  when the treatment in the Nationalrat ends, unannounced; a forwarded item
  stays open. A closed item says participation is „nicht möglich".
- **Never named: the Erstunterzeichner of a Bürgerinitiative** (a private
  person; dropped in the reader before anything is cached, and a test holds
  a name against every field), **the member who hands in a Petition** (the
  club only, as an Initiativantrag shows its movers), **whom the committee
  asked for a statement** (free text that names persons behind „;", „*" and
  alone; only the number and the dates). List 305, the supporters by name,
  is not read at all.
- **No stage text is passed through.** The course is typed facts from a
  closed vocabulary; a stage no pattern recognises is counted and the page
  says that a step could not be read. The committee ends an item in three
  ways: Kenntnisnahme im Ausschuss, Zuweisung an einen Fachausschuss, and,
  once in 1,100 items (144/PET XXIV), Übermittlung an die Volksanwaltschaft,
  which the plenary agrees to. Forwarding to the Bundesregierung occurs
  nowhere and has no step.
- **Framing.** The step is named in Parliament's words („zur Kenntnis
  genommen") and no sentence weighs it. No tally of outcomes anywhere, the
  list sorts by the last step and never by outcome, every closed state has
  one colour. A vote is „alle Klubs dafür", never „einstimmig": the record
  gives clubs, not members. The plenary's vote is on the committee's
  Sammelbericht, never on the item, and the page says so.
- **What the page says it cannot show:** what became of an Anliegen after
  the Nationalrat (no source links a later law to it); why the committee
  took note (the record gives the motion and the vote); Unterstützung and
  Eintragung of a Volksbegehren before it arrives (Bundesministerium für
  Inneres, no interface); what a subject committee did where its record
  carries no entry.
- **A period's end is said from the period, not from a field.** A
  Bürgerinitiative is carried over and links its successor; a Petition
  never is and simply stops.
- **Volksbegehren from GP XXII on.** Older records are too thin for a true
  page (15 carry a single stage); the address answers with Parliament's
  link.
- **Petitionen to the Bundesrat are a fourth kind with steps of their own**
  (15.11.2026), at `/anliegen/BR/petition-bundesrat/<nr>`: the Bundesrat
  has no periods, so „BR" stands where a period does, and their tab ignores
  the period select. They end in „Übermittlung an das Bundeskanzleramt /
  Bundesministerium", a step the Nationalrat's rail does not have, in a
  report the Bundesrat takes note of, or as withdrawn (§ 16 Abs. 5 GO-BR).
  The addressee
  is printed only where it matches „das Bundeskanzleramt" or „das
  Bundesministerium für …"; otherwise „eine Stelle der Bundesverwaltung".
  What the administration did with a petition is not in the record, and
  the page says so. Members of the Bundesrat are shown by club only.
- **The section is called „Anliegen an das Parlament"** since the Bundesrat's
  petitions are in it (one constant, `ANLIEGEN_SECTION_DE`); sentences about
  the Nationalrat keep its name. The address stays `/anliegen`.
- **The list offers GP XXII to the running period** (15.11.2026), the
  periods the reader is measured on; there the Sammelbericht is a stage of
  its own in five spellings („Sammelbericht über die Petitionen Nr. … (N
  d.B.)"). In an ended period „Nur offene" is
  unavailable and says why, and the records take the long TTL of settled
  periods.
- **Members of the Nationalrat are cut from the record too,** not only
  private persons: their names stand in their own motions („Antrag der
  Abgeordneten …") and in two titles („überreicht vom Abgeordneten …").
- **The plenary's vote on the Sammelbericht is the one shown,** on a
  forwarded item too, never a later vote on the subject committee's report.
  What the plenary did with the subject committee's report is not read.
- **Licence.** Parliament's datasets „Petitionen" and „Bürgerinitiativen"
  are CC BY 4.0 for the result lists and the items' pages; everything about
  Stellungnahmen is excluded there too. The numbers of Unterstützungen are
  read as covered, statements are shown as on a Regierungsvorlage. Both
  readings are ours; the question to the Parlamentsdirektion is still to
  be asked, and the answer may change what is shown.
- **No feed in the first release;** later one of its own, dated by
  Einlangen, so the drafts' feed keeps its meaning.
- **Every Anliegen endpoint answers within a stated time** (15.11.2026):
  the list within 20 s for lists and records together, one item within
  10 s. What is late is said, never guessed: a kind
  whose list did not arrive is „konnte nicht gelesen werden", a row whose
  record did not arrive is „Stand nicht gelesen", counts are „nicht
  abrufbar"; a record that does not arrive is a 504. Late reads still fill
  the cache, so the next call is complete. Not built: rows first and states
  after, because the list sorts by the last step and would reorder while
  loading.
- **The rail is the page's table of contents** (15.11.2026), as on a
  draft's page. Each row shows a summary, the outcome or the date, plain
  and without a link of its own, and links to the section of the same name
  (`anliegenRail`, `anliegenSections`, one step list for both). The section
  holds the rest: sittings, requests, vote, the report's link, the notes.
  The committee's ending is an event in the committee's row,
  not a row of its own. A step reached with nothing beyond its summary
  (the Erste Lesung) gets no section and no link. The Einbringung's section
  holds the documents, the Unterstützungen and their door; the committee's
  the Stellungnahmen and theirs, because the statements the committee
  requests stand in the same list. „Stellungnahmen: 0" is a row only where
  no table counts them. No „Beteiligung" box.

## Measured figures

### Anliegen an den Nationalrat

| What | Value | Sample, date |
|---|---|---|
| How the committee ended an item | 354 Kenntnisnahme im Ausschuss, 122 Zuweisung an einen Fachausschuss, no third way | 616 items, GP XXV–XXVIII · 15.11.2026 |
| What a subject committee did with a forwarded item | 34 no entry, 15 report, 10 last adjourned | 59 items, GP XXVI and XXVII · 15.11.2026 |
| The two flags against each other and against list 143's `AKTIV` | never differ (44 open, 572 closed); `AKTIV` agrees on 65 of 65 | 616 items; GP XXVIII · 15.11.2026 |
| When the window closes | closed on exactly the 21 whose Kenntnisnahme the plenary has taken note of; open on all 8 forwarded | 65 items, GP XXVIII · 15.11.2026 |
| Requests of the committee for a statement | 1,796, addressee free text, 222 with a person behind „;" | 616 items · 15.11.2026 |
| Stages the reader does not recognise | 2 of 1,100 Petitionen and Bürgerinitiativen of GP XXII–XXVIII („Abstandnahme von der weiteren Verhandlung", „Änderung der Vorlage"), 4 of 85 Volksbegehren | whole corpus · 15.11.2026 |
| Names in anything assembled or cached, all periods and kinds | 0 of 1,427 named and 20,179 linked persons | 1,227 records · 15.11.2026 |
| Erstunterzeichner names in anything assembled or cached | 0 of 300 | 701 records · 15.11.2026 |
| Names on Bundesrat petitions (members handing in, Berichterstatter, movers) in the reduced record or the detail | 0 of 113, full name or surname | 42 records · 15.11.2026 |
| Anliegen list, cold | running period 3.8 s (70 + 42 records), GP XXVII 14.6 s (265 + 42); warm under 0.1 s | Parliament answering in about 1 s · 15.11.2026 |
| Volksbegehren in the Nationalrat | 85 rows; 59 Kenntnisnahme (11 with an Entschließung), 15 with one stage only (GP X–XVIII) | all periods · 15.11.2026 |
| Petitionen to the Bundesrat | 42; 31 forwarded to the Bundeskanzleramt or a ministry, 10 report taken note of, 1 withdrawn (§ 16 Abs. 5 GO-BR); no stage unread | all · 15.11.2026 |
| List 101's date column on these items | the day of arrival on 287 of 287, not the last treatment | GP XXVII and XXVIII · 15.11.2026 |
