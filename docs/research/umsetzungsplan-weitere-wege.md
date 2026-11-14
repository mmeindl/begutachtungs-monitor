# Implementation plan: five more routes from Parliament's list 101

**14.11.2026.** A read-only planning pass over the code, with probes against
the dev server, Parliament's filter and detail JSON and RIS `BgblAuth`. It
plans what `docs/decisions.md`, "Routes to a norm, and what the monitor
follows", decided to build first. The facts behind it are in
`wege-zu-einer-rechtsnorm.md`. Line numbers are those of 14.11.2026 and drift;
function names are the stable reference.

Routes, in the order to build: (0) the Bundesrat's Einspruch as an event,
which also repairs false statements; (1) committee motions (DOKTYP `BUA`);
(2) motions of the Bundesrat (`GABR`, `GABR13`); (3) every Initiativantrag on
a law (ITYP `A`, Art `A`); (5) treaties (`RVS`, `RVS15`) up to BGBl. III.
Step 4 of the original numbering is step 0 here.

**Built on 14.11.2026, all six steps.** The rules that outlive this plan are
in `docs/decisions.md`, „Routes to a norm, and what the monitor follows";
the measurements in the step sections below are the planning figures, the
ones after building stand in those rules.

## Decisions taken by the maintainer (14.11.2026)

1. Every Initiativantrag enters the list as its own option „Alle
   Initiativanträge" (`art=initiativantraege`), outside „Alle Arten". The
   default list stays as it is.
2. A law from a committee motion may say „ohne Begutachtung" under the same
   three checks as an Antrag, and stays silent when its „Bezug zu" parent was
   consulted.
3. List options: „Ausschussanträge ohne Entwurf" (`art=ausschussantrag`,
   group „Ohne Entwurf"); Bundesrat motions get no option (rows under „Alle
   ohne Entwurf"; the graphic's row stays unlinked); „Staatsverträge" is a
   separate option outside „Alle Arten".
4. Addresses name the kind: `/entwuerfe/XXVIII/ausschussantrag/14`,
   `…/bundesratsantrag/21`, `…/staatsvertrag/119`, with a 301 from
   `/vorlage/<n>` once the DOKTYP is read. An EBR item's address redirects to
   its law.
5. A treaty with no promulgation found says „ausstehend", never „nicht
   kundgemacht": 119 d.B. XXVIII was promulgated 330 days after approval, so
   the 120-day rule for laws would lie. After the period at most „im RIS
   bisher nicht verzeichnet", as a statement about our search.
6. Statements on the new item kinds are shown exactly as for a
   Regierungsvorlage (count, date, consents, names of organisations, link;
   private persons counted, never named; texts linked, never fetched).
7. The Impressum was widened with the maintainer on 14.11.2026: Parliament's
   entry names motions of members, committees and the Bundesrat and treaties;
   the statements entry is headed „Stellungnahmen im parlamentarischen
   Verfahren". Until steps 1, 2 and 5 ship, the Impressum is ahead of the
   site — ship them together or take the item kinds back out.

8. One term, „Ausschussantrag", on the rail, in rows, in the list option, in
   the address and on `/wege` (which said „Antrag eines Ausschusses").
9. An Initiativantrag that carries a consulted draft's text (`ANTRAG_PATHS`)
   keeps its own page; a row names the draft and links it, worded by the
   match: „Der Text dieses Antrags ist der des Ministerialentwurfs …" where
   it carries the draft, „Ein Teil dieses Antrags steht wörtlich im …" where
   it carries a part, and then the Begutachtung station stays „nicht
   feststellbar". No redirect: a partial match would send a reader to a
   different bill, and the Antrag has facts of its own (its statements, its
   steps, its comparison).
10. Every page `/entwuerfe/<gp>/<kind>/<inr>` is counted under one new
    page-view class `vorlage-bund`, whatever the kind; the days before stay
    under `sonstige`.
11. Citations carry a short prefix only where it is true and established
    (RV, AB for a committee motion, IA). A motion of the Bundesrat is cited
    by its bare Beilage number, „452 BlgNR 25. GP": the BGBl and RIS file it
    under „RV" because their form has no other slot, and copying that would
    say the government brought the bill in. No invented prefix (Parliament's
    internal `GABR` means nothing to a reader); the page's heading names the
    kind.

## False statements in the behaviour of 14.11.2026 (probed)

1. `/entwuerfe/XXVII/antrag/84` and `…/antrag/481` say „Beschlossen – nicht
   kundgemacht" and „Nationalrat und Bundesrat haben den Text beschlossen;
   kundgemacht ist er seit dem … nicht." The Bundesrat objected (EBR 20 d.B.,
   150 d.B.), the Nationalrat repeated its decision; both are law (BGBl. I
   Nr. 11/2020, 41/2020). `/api/ohne-begutachtung?gp=XXVII` lists both as
   promulgated and links to these pages.
   Causes: `enactmentOfItem` (`server/utils/parliament/draftDetail.ts`) never
   asks RIS for an Antrag although RIS names it (`Initiativantrag.item`); the
   BGBl link sits on the EBR item; `findBundesratDecisionDate` counts the
   objection as „Beschluss im Bundesrat", so `promulgationState`
   (`shared/utils/promulgation.ts`) says „overdue".
2. `/entwuerfe/XXVII/antrag/1105`: the same; after the Einspruch the
   Nationalrat passed a changed text through EBR 616 d.B. → BGBl. I
   Nr. 158/2020.
3. `/entwuerfe/XXVII/antrag/2597` and the draft page `/entwuerfe/XXVII/251`
   (Vorlage 2455 d.B., EBR 2705 d.B., never decided) say both houses decided
   the text; the Bundesrat objected.
4. `/entwuerfe/XXVIII/vorlage/14` (BUA), `…/XXVIII/vorlage/119` (RVS),
   `…/XXVII/vorlage/21` (GABR), `…/XXVII/vorlage/616` (EBR),
   `…/XXVII/vorlage/1940` (GABR13) answer 404 „Vorlage nicht gefunden"; the
   API says „Keine Regierungsvorlage". The items exist; the monitor does not
   follow them.
5. On every Vorlage/Antrag page the pale first station (state `never`)
   silences later unreached stations for screen readers
   (`app/components/draft/SpineRail.vue`), so the Bundesgesetzblatt row
   announces „ausstehend" while the Parlament row says „seit … nicht
   kundgemacht".
6. True but poorer than it could be: `/entwuerfe/XXVIII/antrag/72` says
   Begutachtung „nicht feststellbar" while the page of 6/ME says its text
   became law as 72/A (`ANTRAG_PATHS`).

No false open statement window exists for treaties: `isFilingOpen` reads
`statementsstate` „9 Keine Begutachtung …" as closed.

## Where the item kind enters the code

| Place | Assumes |
|---|---|
| `shared/types/procedure.ts` (`ProcedureItemType`, `VorlageKind`, `VorlageDetail.ityp`) | no document type; `ministry`/`moverClubs` keyed on `ityp` |
| `shared/utils/procedureRoot.ts` (`itypOfKind`, `kindOfItyp`, `vorlagePath`, `vorlageApiBase`, `rootCitation`) | `I` ⇒ „vorlage", citation „n d.B."; `rootKey` `${gp}-I-${inr}` is unique for BUA/GABR/RVS/EBR too |
| `server/utils/parliament/vorlageDetailAssembly.ts` (`isPageItem`, `ministryOf`, `officialTitleOf`, `firstTextPdf`) | `I` ⇒ `RV` only — the 404 gate; a BUA's description is „Bericht und Antrag des …" |
| `server/utils/parliament/vorlageDetail.ts` (`evidenceOfNoBegutachtung`) | kind `'rv' \| 'antrag'`; a pending Antrag never gets a claim |
| `app/pages/entwuerfe/[gp]/[kind]/[inr].vue` | `kindWord`, `byline` („Eingebracht von der Bundesregierung" for every `I`), `citeAs` (`rvCitationDe`), door, statements (`item: 'rv' \| 'antrag'`), `vorlageWeg` |
| `app/utils/spine.ts` | `vorlageStatusDe` („Gesetz geworden" whenever there is a BGBl — false for a treaty), `vorlageItemStations`, `PARLIAMENT_OUTCOME_DE`, `decidedStandDe`, `houseOutcomeOf` |
| `app/components/statements/RvStatements.vue`, `ParliamentStationSection.vue`, `BgblStationSection.vue` | `item: 'rv' \| 'antrag'`, `facts`, `citeAs`, `origin` |
| `server/utils/ris/skippedLaws.ts` | `CarryingItem.kind: 'rv' \| 'antrag'`; a BUA law is `no-item`; a GABR law is `unchecked` (RIS puts the GABR number in `Regierungsvorlage`) |
| `server/utils/ris/bgblJoin.ts` (`bgblRecordOf`) | does not read `AusschussberichtNationalrat`; for a BUA law that field holds the BUA's own d.B. number and nothing else names it (BGBl. I 156/2024 ⇒ 14) |
| `server/utils/parliament/drafts.ts` (`getVorlagenForGp`, `getAntraegeForGp`), `list101.ts` (`mapVorlageRow`) | `VHG: ['RV']`; hardcoded `/I/`; no DOKTYP |
| `server/api/dashboard/zweite-runde.get.ts` | `STATUS_IN_PROCEDURE` = 1, 2, 4 (365 d.B. BUA has an open window at status 3); RV only |
| `shared/types/dashboard.ts` | `OpenVorlage` has no kind; `LawWithoutBegutachtung.item.kind` |
| `app/utils/entryView.ts` (`viewOfVorlage`, `viewOfLaw`), `app/utils/draftFilters.ts` (`OhneArt`, `EMPTY_TERM`, `ART_CHOICES`, `choiceAdmitsBundLaw`, `bundLawChoice`) | two kinds |
| `server/routes/sitemap.xml.get.ts`, `server/utils/zaehlung/klassen.ts` | `kind === 'rv' ? 'I' : 'A'`; three-segment paths count as `sonstige` |
| `app/utils/wege.ts` (`wegFor`, rows `ausschussantrag`, `bundesrat-antrag`, `staatsvertrag`) | switching a row to followed is `notFollowed: null` plus an `href` |

Works already: statements for every `I` item (`getStatementsForItem`, list
142 `BEZUG_ITYP I`, the same classifier path); `extractBgblLink` and
`bgblNumberOf` read Teil III and RVS15 links; `isFilingOpen` closes RVS and
items from before 01.08.2021; every Initiativantrag page renders
(`isPageItem('A','A')`).

## What the data shows (list 101, 14.11.2026)

- **BUA:** 18 in XXVIII (15 promulgated, 3 open: 683, 684, 365 d.B.), 84 in
  XXVII, 14 in XXVI, 21 in XXV. Each links a parent („Bezug zu"), an RV or an
  Antrag. `names[]` holds only the Berichterstatter — never printed.
- **GABR / GABR13:** XXVII 2 + 4, none in XXVIII. One became law: XXV/452 →
  BGBl. I 44/2015. `statementsstate` „9 …" or `0`; whether § 23b covers
  GABR13 is open — no copy may claim it either way.
- **RVS:** 26 in XXVIII, 105 in XXVII, of which `VHG` `RVS15` are Art. 15a
  agreements promulgated in BGBl. **I** (388 d.B. ⇒ I 16/2026). Some RVS are
  titled „Einspruch der Republik Österreich gegen …" — never read titles for
  the Einspruch. `vote` is null, the stage reads „Genehmigung". RIS Teil 3
  records carry `Gesetzgebungsperiode` + `Regierungsvorlage.item`, the same
  exact key as Teil I, on Jahrgang pages already fetched.
- **EBR:** 8 in XXVII (6 decided, 2 never: 1615, 2705 d.B.), 1 in XXV, 0 in
  XXVIII. The EBR item carries „Bezug zu" back to the law, its own Verlauf
  („Bekanntgabe des Beharrungsbeschlusses", or „Antrag auf Annahme des
  veränderten Gesetzesvorschlags") and the `bgbllinks`. The law's own Verlauf
  says „Antrag, Einspruch zu erheben, angenommen". Trap: „Antrag, **keinen**
  Einspruch zu erheben" stands on almost every law.
- **Initiativanträge (Art A):** XXVIII 183 — 98 pending, 66 decided with a
  third-reading vote, 17 rejected through a negative committee report, 2 at
  status 4. Of the decided, 44 are rows today, 6 are in `ANTRAG_PATHS`, 3 in
  `ANTRAG_PARTIAL`. XXVII 895 — 483 decided, 328 ended with the period.

## The steps

Each is shippable alone. The house rule holds for each: measure, then show;
read samples, not only rates.

### Step 0 — the Einspruch as an event, and the bugs above

- `EnactmentInfo.bundesratObjection: { date; ebr: { citation, url } | null;
  outcome: 'beharrung' | 'new-decision' | 'pending' | 'lapsed' | 'unknown';
  decidedAt } | null`.
- `findBundesratObjection` on the Verlauf, anchored on „Antrag, Einspruch zu
  erheben, … angenommen"; tests for the „keinen Einspruch" trap and the
  treaty-title trap.
- EBR index per period from list 101 (`DOKTYP EBR`, ≤ 8 detail reads, cached
  with the station map; no prewarm line, no new memo).
- `enactmentOfItem` asks RIS for an Antrag too (generalise
  `pickBgblIForVorlage` in `server/utils/ris/bgblVorlage.ts`).
- `promulgationState`: an objection is not a Beschluss; no „overdue" while it
  is unresolved; the 120 days count from the final decision.
- Page: the event in the Parlament rail facts, one frame row „Bundesrat"
  after the vote, the headline „Einspruch des Bundesrates" (pending) or
  „… – Gesetzgebungsperiode beendet" (lapsed), „Gesetz geworden" where a
  BGBl is found. After `new-decision` no section may say the first text was
  promulgated unchanged.
- The 404 of items that exist at Parliament but are not followed says so,
  with a link to Parliament.
- Measure every EBR of XXIV–XXVIII: outcome, links both ways, BGBl, the
  page's headline and row before and after, each read in full.

### Step 1 — committee motions (BUA)

- `ProcedureItemKind = 'regierungsvorlage' | 'initiativantrag' |
  'ausschussantrag' | 'bundesratsantrag' | 'staatsvertrag'`;
  `VorlageDetail.itemKind` from the DOKTYP; `isPageItem` becomes
  `pageKindOf(ityp, doktyp)`. New `committee` (parsed from „Bericht und
  Antrag des (…) über den Entwurf") and `relatedItems` („Bezug zu").
- `BgblRecord.ausschussberichte`; in `classifyOne` a record with no RV and no
  IA whose AB number is a BUA of the period becomes item `ausschussantrag`
  instead of `no-item`. New unknown reason `related-consulted`.
- One shared list-101 read `getItemsForGp(gp)` = `{ GP_CODE, ITYP: ['I'],
  DOKTYP: ['RV','BUA','GABR','GABR13','RVS','EBR'] }` (XXVII: 568 rows);
  assert the DOKTYP on every row; `getVorlagenForGp` filters it. Never
  `{ GP_CODE }` alone (76,000 rows).
- `zweite-runde`: BUA rows too, and status 3 (the flag still decides).
- Labels: station 3 „Ausschussantrag"; byline „Eingebracht vom
  Verfassungsausschuss des Nationalrates", or „… von einem Ausschuss des
  Nationalrates" when the committee cannot be parsed; the citation prefix for
  „Bericht und Antrag" needs checking (never „RV").
- States: door only on `statementsstate` `1`; Begutachtung station „ohne
  Begutachtung · kein Ministerialentwurf" only if classified `none`,
  otherwise „nicht feststellbar · …", with the parent linked where it was
  consulted.
- Measure: `pnpm corpus:ohne-begutachtung -- XXVIII` and `-- XXVII`, every
  BUA row read; the class of the 15 + 84 BUA laws; how many `no-item` remain.
- Risk: a BUA's text may be a ministry's consulted text; `antragPath` joins
  Anträge only. `related-consulted` and the title check err towards silence.

### Step 2 — motions of the Bundesrat (GABR, GABR13)

- `itemKind 'bundesratsantrag'`, `variant: 'bundesrat' | 'drittel'`. In
  `skippedLaws` a `Regierungsvorlage` number that list 101 says is GABR is
  checked like an Antrag.
- Labels: „Gesetzesantrag des Bundesrates" / „Gesetzesantrag von Mitgliedern
  des Bundesrates"; byline „Eingebracht vom Bundesrat" / „… von einem Drittel
  der Mitglieder des Bundesrates". No names.
- The window from the flag alone. Fixtures XXVII/21, XXVII/1940, XXV/452.
  About ten pages across XXIV–XXVIII, each read by hand.

### Step 3 — every Initiativantrag

- Pages exist. Add the link to the draft whose text an Antrag carries
  (`ANTRAG_PATHS`).
- New `/api/antraege?gp=` → rows with a state: `open` (verified per item:
  `statementsstate` `1` and the period running), `pending-unverified`,
  `rejected`, `decided`, `promulgated`, `lapsed`. Anträge in `ANTRAG_PATHS`
  are excluded — they are rows of their draft.
- A row says: „Stellungnahme möglich · eingebracht am …" (blue only when
  verified), „Im Nationalrat abgelehnt", „Ohne Beschluss –
  Gesetzgebungsperiode beendet", or as today when promulgated. Never „ohne
  Begutachtung" on a pending Antrag. No club names in rows, no club filter.
- Measure (new `corpus:antraege`): list status against `statementsstate` over
  all 183 and 895 before the status column may stand in for the flag; the
  state split; twenty rows per state read.
- Risk: a long list of rejected opposition motions reads as a scorecard. One
  colour, sorted by participation and date, no counts per club.

### Step 5 — treaties to BGBl. III

- `itemKind 'staatsvertrag'`, `treatyKind: 'staatsvertrag' |
  'vereinbarung-15a'` (VHG RVS / RVS15), `filing: { possible: false, reason }`.
- `loadTeilYear(year, 'Teil3')` in `server/utils/ris/bgblService.ts` (same
  pages, no new request); Parliament's `bgbllinks` first; no title join.
- Page: headline „Kundgemacht", never „Gesetz geworden"; „Der Nationalrat hat
  den Staatsvertrag genehmigt."; no door and no statements section, one
  sentence in their place („Zu Staatsverträgen nimmt das Parlament keine
  Stellungnahmen an.") with the source; no § comparison offered for Teil III.
- Measure (`corpus:staatsvertraege`): per period the link present, the RIS
  key agreeing with Parliament's link, the delay from decision to issue
  (median, p90, max), RVS15 always Teil I, and the Ministerialentwürfe whose
  Vorlage is an RVS (their draft pages run the 120-day rule today).

## Cache, heap and cold start

The box has a 704 MB ceiling and a history of running out of memory. One
shared list-101 read per period replaces `vorlagen-gp`. Step 1 adds at most
about 85 detail reads per period inside the existing committee budget. Step 3
with per-item verification adds about 100 detail JSONs for the running period
(an estimate of 5–8 MB, not measured) and one prewarm line. Step 0 adds ≤ 8
detail reads per period. No new memo caches. Measure the peak RSS of the full
prewarm sequence on a production build after each step (reference: 251 MB on
14.11.2026).

## Not probed

The full `pnpm corpus:*` runs; `statementsstate` on all Anträge (six
sampled); the meaning of `0` on GABR13 and EBR; the vocabulary of EBR records
before 2020; delays of treaties other than 119 d.B.; Ministerialentwürfe
whose Vorlage is an RVS; Parliament's licence page for motions; the citation
abbreviation of a BUA. The heap figures are estimates.
