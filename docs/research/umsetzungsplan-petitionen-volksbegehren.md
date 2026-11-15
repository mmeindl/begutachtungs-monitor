# Implementation plan: Petitionen, Bürgerinitiativen and Volksbegehren in the Nationalrat

**14.11.2026.** A read-only planning pass over the code, with probes against
the dev server and Parliament's filter and detail JSON. It plans what the
maintainer chose on 14.11.2026 from
`wege-ausserhalb-der-stationen.md`: the monitor shows every way to raise
one's voice on federal lawmaking, so Petitionen and Bürgerinitiativen are
built, and Volksbegehren with them. The facts are in that memo (sections 1
and 2) and in `volksbegehren.md`. Function names are the stable reference;
nothing here is built yet.

These three are **a different object, not a draft**: no law has to result,
and none of them walks the five stations. They get a rail of their own on
pages of their own and never enter the list of Entwürfe
(`docs/decisions.md`, "Routes to a norm, and what the monitor follows").

## Decisions taken by the maintainer (14.11.2026)

1. Build Petitionen and Bürgerinitiativen; the aim is one place that shows
   everything from lawmaking to raising one's voice, also where Parliament
   shows the same item.
2. Volksbegehren are part of it from the start, for their time in the
   Nationalrat.
3. Go ahead on our reading of Parliament's licence pages: the number of
   electronic Unterstützungen is covered (the exclusion names only
   Stellungnahmen); statements are shown as on a Regierungsvorlage. The two
   questions go to the Parlamentsdirektion with the one already planned;
   the answer may change what is shown.

4. **The object is called „Anliegen an den Nationalrat"** and lives at
   `/anliegen`, items at `/anliegen/<gp>/petition/<nr>`,
   `…/buergerinitiative/<nr>`, `…/volksbegehren/<nr>` (the d.B. number).
   Not under `/entwuerfe`: the object there is the Entwurf, and these are
   none. Parliament's own press releases call them „Bürger:innen-Anliegen".
   `/beteiligung` was the alternative; that word also covers the
   Begutachtung.
5. **No sixth header label** (the five measure the width the header has).
   The section is reached from a block on the homepage, from `/wege` and
   from the footer. A header label only if the section proves to be read
   (`/statistik`).
6. **The members who hand in a Petition** are shown as the page of an
   Initiativantrag shows its movers, mandate holders in their function;
   never in list rows, no filter by club.
7. **No feed in the first release;** afterwards a feed of its own
   (`?quelle=anliegen`), dated by Einlangen, so the drafts' feed keeps its
   meaning. `/kalender.ics` cannot carry these items at all: none has a
   Frist (the window closes with the item's end, unannounced; the same
   reason keeps the Vorlagen out, `zweite-runde.get.ts`).

## Decisions still open, with a recommendation each

1. **Petitionen to the Bundesrat** (`ITYP` `PET-BR`). Measured 14.11.2026:
   42 in all, the last from April 2024, none open, 7,496 Unterstützungen
   and one Stellungnahme altogether. They carry no period (`GP_CODE` „BR",
   numbered by year, `/gegenstand/BR/PET-BR/56`) and go to another
   committee. Recommended: measured in step 0 with the rest, named and
   linked on the list in the first release, added as a fourth kind
   afterwards if the same rail fits.
2. **How far back.** Recommended: the list shows the running period, and
   the previous one as a whole after a period change (the rule the
   accountability sections follow); a page answers for any period the
   measurement of step 0 covered.
3. **Page-view classes.** Recommended: `anliegen` (the list) and
   `anliegen-gegenstand` (every item page, whatever the kind).

## What the site says today (probed)

- `/entwuerfe/XXVIII/vorlage/98` and `…/vorlage/1` (both Volksbegehren)
  answer 404 „Kein Gegenstand, den der Monitor verfolgt" with Parliament's
  address. True; once the pages exist, these addresses redirect to them (as
  an EBR's does to its law).
- `/wege` draws the Volksbegehren as a row „nicht im Monitor: kein
  Folgedokument" and lists Petition, Bürgerinitiative and Volksbegehren
  under the table, the first two with a link to Parliament's explainer
  page, the third with none.
- No false statement was found.

## Where the code assumes two kinds of item

| Place | Assumes |
|---|---|
| `shared/types/procedure.ts` (`ProcedureItemType` `'ME' \| 'I' \| 'A'`, `ProcedureItemKind`) | no `PET`, `BI`; every `I` kind is a law's vehicle |
| `shared/utils/procedureRoot.ts` (`KIND_SEGMENT`, `itemPath`, `rootCitation`, `parliamentItemUrl`) | paths under `/entwuerfe/<gp>/<kind>/<nr>`; `rootKey` already carries the type, so `XXVIII-BI-5` collides with nothing |
| `server/utils/parliament/vorlageDetailAssembly.ts` (`pageKindOf`) | `VOLKBG` → null, hence the 404 above. It stays null: a Volksbegehren is no Vorlage page |
| `server/utils/parliament/list101.ts`, `drafts.ts` (`ITEM_DOKTYPES`, `getItemsForGp`) | the shared read is the Vorlagen's; `VOLKBG` must not be added to it, or every consumer would have to filter it out |
| `server/utils/parliament/statements.ts` (`getStatementsForItem(gp, ityp: 'I' \| 'A', inr)`), `list142.ts` (`StatementItemType`, `statementPageUrl`) | two parent types. List 142 answers `BEZUG_ITYP` `PET` and `BI` the same way (`api-exploration.md` §4); the classifier path is the same |
| `server/utils/parliament/detailJson.ts` (`isFilingOpen`, `parseStages`, `readCommitteeConsultation`) | `statementsstate` only; `approvalstate` (the Unterstützung) is read nowhere. `readCommitteeConsultation` reads the same „Ausschussbegutachtung" stages the Petitionen committee produces 105 times on 65 items |
| `app/components/draft/SpineRail.vue`, `app/utils/spine.ts` (`Station.id: StationId`) | the five stations. Not reused for another object (`umsetzungsplan-eu-zyklus.md`, step 1, plans a rail component of its own for the same reason; whichever is built first is written so the other can use it) |
| `app/components/statements/RvStatements.vue` | `item: 'rv' \| 'antrag'` and the other kinds added on 14.11.2026 |
| `app/utils/wege.ts` (`WEG_INSTRUMENTS`, row `volksbegehren`, `wegFor`) | instruments link out; the row is not followed |
| `server/routes/sitemap.xml.get.ts`, `server/utils/zaehlung/klassen.ts` | no such pages |
| `app/pages/impressum.vue` | Parliament's entry names drafts, Vorlagen, motions and treaties |

Works already: `getGegenstand(gp, ityp, inr)` takes any type; the 404 with
Parliament's address; the statement classifier and its storage; the list
header assertions (`listHeaders.ts`) as the pattern for a new list.

## What the data shows (14.11.2026)

- **Volume.** Petitionen / Bürgerinitiativen: XXV 111 / 121, XXVI 30 / 67,
  XXVII 148 / 74, XXVIII 29 / 36. Volksbegehren: 85 rows over all periods,
  43 in XXVII, 5 in XXVIII.
- **Open today.** 24 Petitionen and 20 Bürgerinitiativen take
  Unterstützungen and Stellungnahmen (`statementsstate` and `approvalstate`
  `1`); list 143's `AKTIV` gives the same two numbers. No Volksbegehren is
  open: all five of XXVIII ended in Kenntnisnahme by 24.09.2025, none
  arrived in 2026.
- **Participation, XXVIII.** Petitionen: 444 Stellungnahmen, 30,351
  Unterstützungen (median 177, largest 12,582). Bürgerinitiativen: 816 and
  22,836 (median 189, largest 4,748). Volksbegehren: 14 Stellungnahmen;
  Unterstützung is not possible (`approvalstate` „9 Keine Zustimmung bei dem
  Doktyp "VOLKBG" möglich").
- **How they end.** Of the 65 Petitionen and Bürgerinitiativen of XXVIII:
  21 „durch Kenntnisnahme im Ausschuss" and reported to the plenary, 8
  passed to a subject committee, 4 Kenntnisnahme not yet reported, 32 in
  deliberation. Forwarding to the Bundesregierung or the Volksanwaltschaft
  (§ 100c Abs. 3 GOG-NR) did not occur and is unmeasured.
- **Traps, all seen.** `status.number` 5 stands on items still in
  deliberation, and `status.description` is the last stage, not an outcome,
  on 37 of 58 such items. List 143 unfiltered returns 655,099 rows and
  stops at 100,000. `content.names[]` of a Bürgerinitiative is its
  Erstunterzeichner, a private person, on all 36. The stage text names
  officials in the committee's requests for statements. List 305 holds
  supporters by name, postcode and town. The detail endpoint has returned
  another item of the same number (`volksbegehren.md` §5.1): assert `ityp`
  and `doktyp` on every read.
- **Volksbegehren carry two dated duties** in their stages: „Frist für die
  Aufnahme der Vorberatung: 05.10.2025" and „Fristsetzung für
  Berichterstattung: 05.02.2026" (§ 24 GOG-NR). An adopted Entschließung
  shows as a stage („… beigedruckten Entschließung 6/AEA angenommen"),
  without the resulting E number (`volksbegehren.md` §5.2).
- **Carry-over.** 18 of 36 Bürgerinitiativen and 4 of 5 Volksbegehren of
  XXVIII come from XXVII; the successor names its predecessor in
  `reference[]` („Neuverteilung gem. § 21 Abs. 1a GOG-NR").

## Step 0, measured (15.11.2026)

`pnpm corpus:anliegen` over every Petition and Bürgerinitiative of GP XXV to
XXVIII (318 and 298, all read) and all 85 Volksbegehren; the committee's
motions, the requests and the forwarded items read again by hand from the
cached records.

**Petitionen and Bürgerinitiativen.**

- **The committee has two ways to end an item, and no third occurs.** In
  616 items: 354 motions „… durch Kenntnisnahme im Ausschuss zu erledigen"
  and 122 „Ersuchen an den Präsidenten / die Präsidentin um Zuweisung an
  den …ausschuss". Forwarding to the Bundesregierung or the
  Volksanwaltschaft (§ 100c Abs. 3 GOG-NR) does not occur once. The closed
  set is therefore: Kenntnisnahme im Ausschuss, Zuweisung an einen
  Fachausschuss; anything else is „unknown" and said so.
- **„Präsidentin" is a trap.** A reader anchored on „den Präsidenten"
  misses every Zuweisung of GP XXV; the first run of the script did, and
  counted 55 forwarded items as „plenary only".
- **What a subject committee did with a forwarded item** (59 of GP XXVI and
  XXVII): 34 carry no entry of that committee at all, 15 end in its „Bericht
  N d.B.", 10 were last adjourned. The record goes on for some and stops
  for most; the page says which.
- **Every ended item reaches the plenary only inside a Sammelbericht:**
  „Antrag, den Ausschussbericht zur Kenntnis zu nehmen, angenommen" (older:
  „Antrag auf Kenntnisnahme angenommen"). That is a vote on the report,
  never on the item.
- **How a period's end shows.** A Bürgerinitiative is carried over
  (`status.description`: „Verhandlungsgegenstand der nächstfolgenden GP gem.
  § 21 Abs. 1a GOG (n/BI/XXVI. GP)": 18, 15 and 14 at the ends of XXV, XXVI,
  XXVII; the successor's `reference[]` names it, 105 times). A Petition is
  never carried over: 22, 21 and 15 simply stop, with a last stage that says
  nothing („auf Tagesordnung …", „Beratungen nicht aufgenommen"). „Mit der
  Gesetzgebungsperiode beendet" is therefore said from the period, not from
  a field.
- **`status.number` says nothing:** 5 stands on 76 Petitionen and 16
  Bürgerinitiativen without an ending, 4 and 3 on 142 that have one.
- **The two flags never differ** (`statementsstate` · `approvalstate`: `1 ·
  1` on 44, `0 · 0` on 572), and list 143's `AKTIV` agrees with them on 65
  of 65 items of GP XXVIII. The list may narrow; the flag of the item
  decides the door.
- **The stages are not in order of time.** They come phase by phase; the
  plenary's „Mitteilung des Einlangens" of December stands after the
  committee's sitting of February. The reader sorts by date, stable.
- **Votes come in two shapes:** „Dafür: ÖVP, SPÖ, NEOS, dagegen: FPÖ,
  GRÜNE", and in GP XXV also „mehrstimmig ( dafür S, V; dagegen F, G, N;
  nicht anwesend … )". Only the first is read; the second shows as „mit
  Mehrheit", without clubs.
- **Whom the committee asks for a statement cannot be shown.** 1,796
  requests (1,789 „angenommen", 7 without a result). The addressee is free
  text: 222 carry a person behind a „;", others behind a „*", and some
  requests go to a person alone (an expert, with title). No rule separates
  organisation from person reliably, and in doubt it is a person. The page
  shows the number of requests and their dates, never the addressees.
- **`names[]`:** 464 „Petition überreicht von" on 318 Petitionen; 300
  „Erstunterzeichnerin/Erstunterzeichner" on 298 Bürgerinitiativen (some
  carry more than one) and one „Petition überreicht von" on a Bürgerinitiative. The
  function text decides what is kept, not the kind.

**Volksbegehren.**

- Of 85 rows: 48 Kenntnisnahme, 11 Kenntnisnahme with an adopted
  Entschließung in the stages, 4 carried into GP XXVIII, 15 with a single
  „Einlangen" stage (GP X to XVIII), 6 with a committee report and no
  plenary step found (GP XX, XXI), 1 open-ended (GP XXI). A page is true
  from GP XXII on; before that the record is too thin, and the address
  answers with Parliament's link.
- `approvalstate` is „9 Keine Zustimmung …" on all 85; `statementsstate`
  `0` on 78 and „9 …" on 7. None is open.
- The vocabulary is wider than the Petitionen's (388 shapes, 279 on one
  item only, because every subject committee has its own lines). The
  closed set the page names: Einlangen, erste Lesung, Zuweisung an den
  …ausschuss, the two dated duties („Frist für die Aufnahme der
  Vorberatung", „Fristsetzung für Berichterstattung"), Bericht N d.B.,
  Kenntnisnahme, „… beigedruckten Entschließung N/AEA angenommen",
  carry-over. A Besonderer Ausschuss (4 motions) is named by its line.

**Petitionen to the Bundesrat** (all 42 read on the second run, through the
row's own `HIS_URL`; Parliament files them under `/gegenstand/BR/PET-BR/<nr>`
whatever the list's period column says). They do not fit the rail of the
Nationalrat's: 31 of 42 end in a step that does not exist there,
„Übermittlung der Petition an das Bundeskanzleramt / Bundesministerium …";
10 in a report the Bundesrat takes note of; one is open-ended. Their
committee is the „Ausschuss für BürgerInnenrechte und Petitionen des
Bundesrates", both flags are `0` on all 42, and 14 carry „Keine
Veröffentlichung der Dokumente". A fourth kind would need steps of its own.

**The shipped reader, held against the corpus** (`readAnliegenCourse`,
15.11.2026): it finds the same 354 Kenntnisnahmen, 122 Zuweisungen and 1,796
requests as the hand count; 7 of 616 Petitionen and Bürgerinitiativen and 4
of 85 Volksbegehren carry a stage it does not recognise (a Miterledigung, a
changed Vorlage, an Entschließung on a Petition, a „Zurückverwiesen an …"),
counted and never shown. None of the 300 names Parliament gives for
Erstunterzeichner occurs in any detail the reader assembles, nor in the
record it caches (swept over all 701 records).

**When the window closes** (all 65 items of GP XXVIII, flag against course):
closed on exactly the 21 whose Kenntnisnahme im Ausschuss the plenary has
taken note of; open on the 32 without a disposal, on the 4 taken note of in
committee but not yet reported, and on all 8 forwarded ones, also after the
plenary took note of the report. So the page may say that the window closes
when the treatment in the Nationalrat ends, and a forwarded item stays open.

Three things the page and the list must know:

- **Carried over is more than „no ending":** 37, 17 and 18
  Bürgerinitiativen went into the next period at the ends of XXV, XXVI and
  XXVII, because forwarded ones still lying in a subject committee are
  carried too (the 18, 15 and 14 above are those without any disposal).
- **`end` „plenum" does not mean finished** for a forwarded item: the
  plenary took note of the Sammelbericht that reports the forwarding, and
  the item lives on in the subject committee (1/BI XXVIII). The page reads
  `subjectCommittee`, not `end` alone.
- **List 101's date is the day of arrival,** on 287 of 287 items of XXVII
  and XXVIII, although Parliament's dataset page calls it the date of the
  last treatment. The last step needs the item's record: one detail read
  per row, 65 for the running period on a cold cache, inside a time budget;
  a row whose record has not arrived says so and is not given a date.

Not done in step 0 and owed before step 2 ships: the 200 kept lines read by
hand (the reader now keeps no free text of a request, so the check moves to
whatever text the page prints); the `TYP` split of list 142 for these
parents.

## State of the build (15.11.2026)

Steps 0 to 4 are built and not yet live. What is left is the Impressum
(with the maintainer) and the open decisions above; the list under „Open"
below is the state before step 4 and is kept for the record.

- **Step 4, built 15.11.2026:** the statements table on the item page
  (statements on a Petition are items of type `SPET`, on a Bürgerinitiative
  `SBI`; the mapper knew neither); the homepage block, the footer link, the
  links from `/wege` and the row „Volksbegehren" as followed for its time
  in the Nationalrat; `sitemap.xml` (the list and the running period's
  items); the page-view classes `anliegen` and `anliegen-gegenstand`; the
  301 from a Volksbegehren's `/entwuerfe/<gp>/vorlage/<nr>`; the refusal
  text; the block on `/datenlage`; a prewarm line; one club table
  (`shared/utils/clubs.ts`); list 143 in `listHeaders.ts`.
- **The classifier over these statements** (GP XXVIII, 444 on Petitionen
  and 816 on Bürgerinitiativen): 193 rows printed by name, 100 distinct
  names, each read, each an institution by Parliament's own flag, no
  person; no leak candidate; 12 rows Parliament flags as institutions stay
  counted as persons. The audit's citation pattern knew only `SN` and was
  blind for these parents until fixed the same day.
- **Decided while building step 4:** a closed item without statements gets
  no statements section (whether one was ever possible on an old item is
  not known); no committee line in the statements panel (the course shows
  the requests); the footer link reads „Anliegen an den Nationalrat"; the
  `/wege` links carry the kind (`?art=`); on `/datenlage` Anliegen are a
  block of their own, not a column of the drafts' table; the reduced item
  record is cached on the derived layer.
- **Added after step 4 (15.11.2026), on the maintainer's word:** the rows
  on the draft rows' own components (Anliegen · Unterstützungen ·
  Stellungnahmen · Stand); a period select (XXV to the running period);
  Petitionen to the Bundesrat as a fourth kind (open decision 1, decided:
  built); the section renamed „Anliegen an das Parlament"; the Impressum
  entry; the reason on `/wege` for Verordnungen without a Begutachtung
  („keine Quelle belegt, dass die Begutachtung fehlte").
- **Verified on the running site (15.11.2026):** the period select, the
  two-line pill and the three endings of a Bundesrat petition. Not looked
  at: the phone layout with four columns.
- **Time limits (15.11.2026):** the list answers within 20 s, one item
  within 10 s; with Parliament slow the list had taken 40 to 88 s. Cold
  with Parliament fast: 3.8 s for the running period, 14.6 s for GP XXVII.
  Still unbounded: finding the running period on a cold server.
- **Privacy on the Bundesrat petitions:** 113 names in the 42 records
  (members handing in, Berichterstatter, movers), none in the reduced
  record or the detail, by full name or surname.
- **Open:** the period select starts at XXV although Volksbegehren have
  pages from XXII; the Petitionen and Bürgerinitiativen of XXII to XXIV
  are not measured yet.
- **Licence, open:** no dataset of Parliament's is named for Volksbegehren;
  the Impressum says how we read it, and the question is noted.
- **Measured:** GP XXVII (265 items) cold 12 to 15 s, warm under 0.1 s,
  with Parliament answering normally.

- **Built:** the reader and its service, the item page
  `/anliegen/<gp>/<kind>/<nr>` and the list `/anliegen` with their two API
  routes. The list of the running period agrees with the measurement: 70
  rows (29, 36, 5), 44 open, 32 in deliberation, 25 taken note of in
  committee, 8 forwarded, 5 Volksbegehren taken note of.
- **Decided while building,** beyond the steps below: the member who hands
  in a Petition is shown by club only, and the name is neither served nor
  cached; whom the committee asked for statements is not shown; a
  Volksbegehren before GP XXII is refused with Parliament's address
  (`anliegenIsFollowed`); a closed item says participation is „nicht
  möglich", not „nicht mehr"; a row's page step is 10.
- **Open, step 4 and what waits on shared files:** the statements table on
  the item page (parent types `PET` and `BI` in `statements.ts` and
  `list142.ts`); list 143's columns in `listHeaders.ts`; the redirect of a
  Volksbegehren's old `/entwuerfe/…/vorlage/<nr>` address; the links from
  `/wege`, the homepage block, the footer; `sitemap.xml`; the page-view
  classes; the „not followed" text, which does not name Anliegen; one club
  table instead of two; `docs/decisions.md` and `docs/api-exploration.md`;
  a prewarm line; the Impressum, with the maintainer, before anything is
  live.
- **Not measured:** a truly cold call of the list (1.8 s was seen with the
  records possibly warm); the `TYP` split of list 142 for these parents.

## The steps

Each is shippable alone, except that the Impressum (step 4) ships with the
first page that shows the data. The house rule holds for each: measure,
then show; read samples, not only rates.

### Step 0 — measure the course before any page says it

- New `pnpm corpus:anliegen`: every Petition and Bürgerinitiative of XXV to
  XXVIII (616 detail reads) and all 85 Volksbegehren, paced, through
  `.harness-cache`.
- The stage vocabulary per kind and period, counted, and from it the closed
  set of steps the page may name. Everything outside the set is „unknown"
  and said so, as with the Einspruch (`readObjectionOutcome`).
- The end of an item, read from the stages: Kenntnisnahme im Ausschuss,
  passed to a subject committee (and what that committee did: the record
  goes on, 1/BI XXVIII shows it), Bundesregierung, Volksanwaltschaft,
  Kenntnisnahme im Plenum, ended with the period. Twenty of each read in
  full.
- `statementsstate` and `approvalstate` against list 143's `AKTIV`, item by
  item, before the list may stand in for the flag.
- Person names in the stage text: which line shapes carry them, so the
  reader keeps the organisation and drops the rest; every kept line of a
  sample of 200 read by hand.
- List 142 for these parents: the split of the `TYP` flag (institution or
  person), and whether the statements the committee itself requested
  arrive there.
- Pre-1996 Volksbegehren are skeletal (`volksbegehren.md` §5.1): find the
  first period from which a page can be true, and refuse the ones before
  with Parliament's address.

### Step 1 — readers and types

- `shared/types/anliegen.ts`: `AnliegenKind = 'petition' |
  'buergerinitiative' | 'volksbegehren'`; `AnliegenRoot { gp, kind, inr }`;
  `AnliegenStep` (the rail's steps, a closed union per kind);
  `AnliegenDetail`, `AnliegenRow`. `shared/utils/anliegen.ts`: segment,
  path, Parliament address and citation („21/PET", „5/BI", „98 d.B.") in
  one place, as `procedureRoot.ts` does for drafts; the Parliament type of
  a kind (`PET`, `BI`, `I`).
- `server/utils/parliament/anliegen.ts`, pure: `readAnliegenCourse(phases,
  kind)` → steps with dates, the committee's vote by clubs („alle Klubs
  dafür", never „einstimmig"), the requests for statements as dates and a
  number only (step 0: the addressee is free text and names persons), the two dated duties of a Volksbegehren, an adopted
  Entschließung as an event, the predecessor from `reference[]`.
  `participationOf(content)` → `{ statements: open | closed, support: open |
  closed | impossible }` from the two flags, verified per item.
- `anliegenService.ts`: `getAnliegenForGp(gp)` = three list-101 reads,
  `{ GP_CODE, ITYP: ['PET'] }`, `{ …, ITYP: ['BI'] }`, `{ …, ITYP: ['I'],
  DOKTYP: ['VOLKBG'] }`, each checked against its `count` and every row
  against the requested type (the filter ignores keys it does not know).
  Not through `getItemsForGp`.
- Participation counts from list 143 with the same three filters
  (`server/utils/parliament/list143.ts`, positions asserted against the
  header in `listHeaders.ts`). Never without `GP_CODE` and `ITYP`. List 305
  is not read at all.
- `getStatementsForItem` takes `'PET'` and `'BI'` as parent types;
  `StatementItemType` and `statementPageUrl` with them. The cache key
  already carries the type.
- `names[]` of a Bürgerinitiative is dropped in the reader, before anything
  is cached; a test holds a fixture with a name and asserts it reaches no
  field of the answer.
- API: `/api/anliegen?gp=` (rows) and `/api/anliegen/<gp>/<kind>/<nr>`
  (detail), `…/stellungnahmen` as for a Vorlage.
- Fixtures: XXVIII/BI/5 (Kenntnisnahme, carried over), XXVIII/BI/1 (passed
  to the Bildungsausschuss, adjourned), one open Petition, XXVIII/I/98 and
  XXVIII/I/2 (Volksbegehren with first reading; carried over with an
  Entschließung).

### Step 2 — the page of one item

- `/anliegen/[gp]/[kind]/[nr].vue`. A rail of its own with the steps the
  item really took, in Parliament's order:
  - Petition, Bürgerinitiative: Eingebracht · Ausschuss für Petitionen und
    Bürgerinitiativen · Erledigung im Ausschuss · Nationalrat.
  - Volksbegehren: Eingelangt · Erste Lesung (only where held) · Ausschuss ·
    Nationalrat.
- The door, blue, only on a flag verified for this item: „Unterstützen" and
  „Stellung nehmen" lead to Parliament's forms (`appformlink`,
  `formlink`). Beside it one sentence that the window has no Frist and
  closes when the item ends, and for the Unterstützung what Parliament
  says of it (it informs the deliberation; one per person).
- Facts in the frame: kind, citation, date, for a Petition who handed it in
  (open decision 3), for a Bürgerinitiative „von mindestens 500
  Bürgerinnen und Bürgern eingebracht" and no name, the predecessor of a
  carried-over item as a link, the numbers of Unterstützungen and
  Stellungnahmen.
- Statements exactly as on a Regierungsvorlage (count, date, consents,
  names of organisations, link; private persons counted, never named;
  texts linked, never fetched).
- Documents and Parlamentskorrespondenz linked at Parliament; the item's
  text is not rendered in the first release.
- **What the page says it cannot show**, each with its reason: what became
  of the Anliegen after the Nationalrat (no source links a later law to
  it); why the committee took note (the record gives the motion and the
  vote, no reason); for a Volksbegehren the Unterstützung and Eintragung
  before it reached the Nationalrat (the Bundesministerium für Inneres
  holds them, without an interface or a stated licence), with a link
  there.
- Wording follows the framing rule: the step is named in Parliament's
  words („zur Kenntnis genommen"), with Parliament's own explanation of
  what Kenntnisnahme means where it is cited, and no sentence weighs it.
- Redirects: `/entwuerfe/<gp>/vorlage/<nr>` of a Volksbegehren → its page.

### Step 3 — the list

- `/anliegen`: one list, one select „Art" (Alle · Petitionen ·
  Bürgerinitiativen · Volksbegehren), a toggle „Jetzt offen" that is on by
  default.
- Sorted by the date of the last step, newest first. Never by outcome, and
  no count of outcomes anywhere on the page; one colour for every closed
  state, blue only for a verified open window.
- A row: title, kind and citation, the last step in words and its date,
  the two counts, the open mark.
- Empty states say what was read: „Derzeit liegt kein Volksbegehren im
  Nationalrat" only when the list answered and holds none open, with the
  link to where Volksbegehren are supported before they get there.
- A half that failed is named in the count line and never counted as 0.
- „Petitionen an den Bundesrat sind nicht erfasst" at the list, if open
  decision 5 stays as recommended.

### Step 4 — entry points, legal text, records

- Homepage: a block of the open Anliegen (count and the newest few),
  placed after the drafts' sections. `/wege`: the three instruments link to
  the section instead of out; the row „Volksbegehren" loses „nicht im
  Monitor: kein Folgedokument" and gains the note that Unterstützung and
  Eintragung are not in the monitor.
- Impressum, **with the maintainer**: Parliament's entry names Petitionen,
  Bürgerinitiativen and Volksbegehren; the numbers of Unterstützungen are
  named as taken from Parliament's list of participations; the statements
  entry needs no new wording. Until then nothing of steps 2 and 3 goes
  live.
- `sitemap.xml`, `klassen.ts` (open decision 7), `/datenlage` (what is
  covered, what is not, the measured figures), the footer.
- `docs/decisions.md`: a section for the object (its rail, what is never
  named, no outcome tally, the flag decides the door) and the figures of
  step 0; "Routes to a norm" updated. `docs/api-exploration.md`: list 143
  as it really is, `approvalstate`, the status trap.
- Tests for every trap in "What the data shows".

## Cache, heap and cold start

Per period three list-101 reads and three list-143 reads, small (65 and 5
rows in XXVIII; 222 and 43 in XXVII). The list verifies the open mark per
item: about 45 detail JSONs for the running period, on the leaf cache, the
order of the Anträge step; not measured. Statements are read per page, as
today. One prewarm line for the running period's list. Nothing is written
to disk beyond what the statement store already does. The 704 MB ceiling
is checked with the SSR smoke after step 3.

## Not in this plan

- The outcome of an Anliegen beyond the Nationalrat, and any table of what
  became of Volksbegehren (`volksbegehren.md` §10: attribution over years,
  curated by hand).
- Signatures of a Volksbegehren and those in the Einleitungsphase (BMI).
- Petitionen to the Bundesrat, the Länder's petitions and Volksbegehren,
  Vienna's petition platform.
- Alerts. The calendar, for the reason in open decision 4.
- A text view or search over the items' documents.

## Not probed

- Whether the committee-requested statements stand in list 142, and how
  they are flagged.
- The stage vocabulary before XXVIII, and the three endings that did not
  occur in XXVIII.
- Per-item agreement of list 143's `AKTIV` with the two flags (the totals
  agree: 24 and 20).
- Whether `approvalstate` and `statementsstate` ever differ on one item.
- The official address for supporting a Volksbegehren; the memo names
  none, and `wege.ts` links none for that reason.
- Memory and cold-start cost of the list's verification.
- Parliament's answer on the two licence questions; the plan runs on our
  reading until it arrives.
