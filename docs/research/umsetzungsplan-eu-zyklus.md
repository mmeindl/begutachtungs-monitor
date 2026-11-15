# Implementation plan: the EU cycle

**14.11.2026.** A read-only planning pass over the code, with probes against
the Cellar, the Commission's portal „Ihre Meinung zählt", the register of the
European Citizens' Initiative and the European Parliament's open-data API.
It plans what `docs/decisions.md`, "Routes to a norm, and what the monitor
follows", names as the EU cycle. The facts behind it, with sources and what
is not verified, are in `eu-zyklus.md`; this file does not repeat them.
Function names are the stable reference; nothing here was built or run
against a dev server. `app/utils/wege.ts` and
`server/routes/sitemap.xml.get.ts` were being changed by other work on the
same day (the new Parliament item pages); read both again on main before
touching them.

Steps, in the order to build: (0) the country-neutral groundwork; (1) the
rail of an adopted act from the Cellar; (2) the consultation station from
the portal; (3) open windows and pending proposals; (4) who gave feedback;
(5) the European Citizens' Initiative; (6) the move to `/eu` with the
rename; (7) the directives a country has to transpose, which needs only
steps 0 and 1.

## State of the build (15.11.2026)

Steps 0 and 1 are built on the branch `feat/eu-zyklus`, not merged. Where
the build left this plan, and why:

- **No route of its own, no prewarm line, no stored file for the rail.** The
  plan asked for all three. One Cellar query per act returns the whole rail
  in about 0.3 s, so it is asked when the act's page is asked, in parallel
  with the Amtsblatt reference and cached a month like it. Nothing is added
  to `buildEuMap` or to the prewarm, which was the condition after the
  report on the map's memory. The fact store's key option exists and is
  tested; its first user is step 2.
- **The third station's name comes from the act's authors,** not from the
  procedure type (decision 13 named the type): the authors are the data for
  „who decided", and all 27 acts of the Council alone get „Rat" under four
  procedure types without a table.
- **The base path is a constant** (`EU_BASE_PATH`, `shared/utils/eu.ts`),
  not runtime configuration: a pure shared module cannot read the runtime
  config, and step 6 changes one line. The other places that write
  `/eu-recht` (header, feeds, page-view classes, `wege.ts`, the act page's
  own redirects and back links) are untouched and are step 6's.
- **A section per station, under the station's name.** The rail links
  only into the page; EUR-Lex and the Observatory are linked in the
  sections. The sections stand in the rail's order; the last one („Umsetzung"
  or „Geltung") holds the Austrian drafts, under „Entwürfe, die sie
  umsetzen" or, for a regulation or decision, „durchführen".
  Steps 2, 5 and 7 fill these sections and add „Konsultation" with its
  station.
- **The Legislative Observatory is linked only for procedures from 1994 on
  of type COD, CNS or APP,** and the link says the page is English: older
  procedures and some types have no page there.
- **Split procedures are linked from a table of four acts.** The
  Observatory split three procedures into files „A" and „B"
  (2016/0224(COD), 2018/0063(COD), 2023/0077(COD)); the plain number the
  Cellar carries answers 404 there. The European Parliament's documented
  API knows both files but does not name the act a file ended in, so it
  would have been a new source that still needs a guess. Instead
  `OBSERVATORY_FILE` names the file per act, each read from the file's own
  page on 15.11.2026. A split procedure of an act new to the map gets a
  dead link until it is added.
- **The Impressum sentence of `#imp-eurlex` is widened on the branch,** and
  names the days of entry into force and of application besides what the
  draft below lists.
- **Station 1 „Konsultation" is not rendered,** not even as a placeholder,
  until step 2 reads the portal.

Measured on the map of 14.11.2026 (235 acts): `docs/decisions.md`, figures
under „Länder, EU law, federal law carried out by the Länder". The script
is `scripts/corpus/euVerfahren.ts`.

Open after this build, for the maintainer: the rail's look (a proposal
that follows the national spine's grammar); the page's head line and the
heading „Entwürfe, die sie umsetzen", which now say again what the rail
says, and say „umsetzen" on a regulation's page beside the station
„Geltung"; whether the two acts of procedure 2023/0077(COD), whose
decisions the Cellar does not record, get a second source (it is one of
the three split procedures above, which may be why).

## Decisions taken by the maintainer (14.11.2026)

1. Pending proposals are in scope: the monitor shows where a person can take
   part at EU level now, not only what happened to acts already adopted.
2. All open windows are followed, not only legislative proposals: calls for
   evidence, public consultations, feedback on adopted proposals, and drafts
   of delegated and implementing acts (49 open on 14.11.2026, 22 of them
   legislative).
3. Organisations that gave feedback are named, private persons are counted
   and never named, as for statements in Parliament.
4. The European Citizens' Initiative is followed as an object of its own,
   with its own rail, beside the open consultations. It is not a station of
   an act: no field of the register joins an initiative to an act.
5. The EU is a jurisdiction of its own. Its objects get one canonical home
   under `/eu`; a country holds a view onto it. The move happens together
   with the rename to `viewyourstate.org/at`, not before.
6. `/eu-recht` splits at that move: the overview stays Austria's view and
   becomes `/at/eu-recht`; everything below it moves to `/eu/…`.
7. The portal's undocumented interface is used. The Commission is asked in
   parallel whether a documented one exists; the question is a dated task of
   the maintainer and does not block the build.
8. The Impressum is adjusted. Each wording ships in the commit that starts
   using the source it names, never ahead of the site (the drafts are
   below).

9. Reading a feedback row brings the contribution's text along; it is
   dropped at the parser, never parsed, stored or shown. That is accepted
   for the Commission's portal. The rule „statement texts are linked, never
   fetched or parsed" stays as it is for Parliament's statements.
10. At most 500 feedback rows are read per window; beyond that the page
    says how many of how many were read.
11. Open EU windows are a source of their own in `/feed.xml` and
    `/kalender.ics` (`?quelle=eu`), never mixed into the
    Begutachtungsfristen by default.
12. The path words under the EU base stay German until the site speaks
    English; the address helper is the one place to change then.

13. The station names follow the process, and two of them carry the name
    of what the act is, as the third national station carries
    „Regierungsvorlage" or „Initiativantrag" (left to the planning session
    by the maintainer, 14.11.2026):
    1. „Konsultation";
    2. „Vorschlag" (the row names the Commission and the COM number);
    3. „Parlament und Rat" for the ordinary procedure, „Rat" where the
       dossier's procedure type gives the Council alone the decision; only
       the types measured in the map get a name, any other says „Verfahren"
       and names the type;
    4. „Amtsblatt";
    5. „Umsetzung" for a directive and a framework decision, with the
       deadline; „Geltung" for a regulation and a decision, which need no
       national act: the day of entry into force and the sentence that the
       act applies directly, then the drafts that accompany it where there
       are any. The day a regulation starts to APPLY often differs from its
       entry into force; it is printed only once step 0 has read it from
       the Cellar, until then the station says „in Kraft seit".
    Step 7's list is „Umzusetzende Richtlinien"; it holds directives only.

Rules that outlive this plan go into `docs/decisions.md` with the step that
makes them true, not before.

## What the EU pages say today that will change

- `app/utils/wege.ts`: the rows for „Ihre Meinung zählt" and the
  Bürgerinitiative stand in the block under the table as instruments the
  monitor does not follow. With step 3 and step 5 each becomes followed and
  gets its link; the comment at each cell keeps naming the provision.
- `app/components/method/MethodEuRecht.vue` and
  `shared/utils/datenlage.ts` describe the EU part as „an act a draft
  names". From step 3 on the EU part also holds objects no draft names.
- The act page's empty state („Zu diesem Rechtsakt kennt der Monitor keinen
  Entwurf", 404) is right today because the map is the only population.
  Once acts exist under `/eu` on their own, an act without an Austrian draft
  is a page, and the sentence moves into Austria's block as „Der Monitor hat
  keinen Entwurf gefunden" — never „nicht umgesetzt" (rule D6).

## Where Austria is built into the EU code today

| Place | Assumes |
|---|---|
| `server/utils/cache/factStore.ts` (`createFactStore`, `storePath`) | one file per Gesetzgebungsperiode; the path is validated with `GP_RE` |
| `server/utils/eu/euMapStore.ts`, `euMapService.ts`, `euMap.ts` | the population is „drafts of a period's window"; an act exists because a draft names it |
| `server/utils/eu/cellar.ts` (`transpositionQuery`, `ojQuery`) | the German expression (`…/language/DEU`) is written into the query |
| `shared/utils/eu.ts` (`euActPath`, `EU_ACT_PATH_WORD`) | the base `/eu-recht` and German path words are literals |
| `server/api/eu-recht/akte/[celex].get.ts` | 404 for an act no draft names |
| `shared/utils/safeExternalUrl.ts` (`UPSTREAM_HOSTS`) | of the EU hosts only `publications.europa.eu` may be fetched |
| `server/utils/zaehlung/klassen.ts`, `server/routes/sitemap.xml.get.ts`, `server/utils/feeds.ts`, `app/components/chrome/AppHeader.vue` | `/eu-recht` as a literal |

Works already and is reused: the Cellar policy and its queue of two
(`CELLAR_POLICY`, `inCellarTurn`), the month-long cache of a Cellar answer,
the rule „a failure is not an answer" (`cache/gathered.ts`), the prewarm
guard (`PREWARM_ONLY` in `server/utils/http/rateLimit.ts`), the list rows
(`EntryList`) for Austria's block.

## The addresses

One helper builds every EU address from one configured base (`/eu-recht`
today, `/eu` after the rename). An object is addressed by the strongest
identifier that is verified, and a weaker address answers 301 to the
stronger one:

| Object | Address below the base | Known from |
|---|---|---|
| adopted act | `/richtlinie/2024/1069` (as today) | CELEX |
| proposal of the Commission | `/vorschlag/2022/177` | COM number (Cellar dossier, or a publication of the portal) |
| initiative before a proposal, or a draft act of the Commission | `/initiative/13192` | the portal's number |
| European Citizens' Initiative | `/buergerinitiative/2022/2` | register number |

A redirect is set only on a verified join: initiative → proposal when a
publication of the initiative carries the COM number as its `reference`;
proposal → act when the Cellar dossier names the act it produced. One
proposal can produce several acts (COM(2023)148 → two acts of the map); then
the proposal's page stays and links both.

The path words are German nouns today. Whether they follow the page's
language once English exists is open; the helper is the one place to
change.

## The steps

Each is shippable alone. The house rule holds for each: measure, then show;
read samples, not only rates.

### Step 0 — country-neutral groundwork

- A store keyed by EU object, not by period: `createFactStore` takes the
  validation of its file key as an option (today `GP_RE`), and the EU rail
  gets its own instance (`subdir: 'eu-vorhaben'`) with its own reader
  version. The existing per-period file keeps what it holds: the Austrian
  fact „draft X names act Y".
- `server/utils/eu/cellarDossier.ts`, a pure module: the dossier of an act
  through **both** links (`cdm:dossier_produces_resource_legal` at the
  dossier finds 208 of 231, `cdm:resource_legal_produced_by_dossier` at the
  act only 76), its procedure number, COM reference, status, and its events
  (type, date, institution). The parser reads the leading digits of a
  composite reference („722 - 3") and keeps the suffix.
- The event allowlist. Before any event is shown, the labels of the event
  types are read from the Cellar's authority table
  (`…/resource/authority/event/<code>`) and the list of types the rail
  reads is written down with them: the proposal (`ADP_byCOM`,
  `ADP_PROPLEG_byCOM`), Parliament's first-reading position (two
  vocabularies: `ADP_R1_POS_byEP`, older `OPI_R1_byEP`), the Council's
  approval (`APR_R1_byCONSIL`), signature, publication, the opinions of the
  two committees. A type not on the list is unread, never „did not happen".
- The language of a title becomes a parameter of the Cellar queries.
- The address helper above; `euActPath` goes through it.
- Measure over all 231 acts and read 20 rails in full against the
  Legislative Observatory's page of the procedure, old and new vocabulary
  both.

### Step 1 — the rail of an adopted act, from the Cellar

No new source.

- `EuActResponse` gains `rail`: the stations „Vorschlag der Kommission",
  „Parlament und Rat", „Amtsblatt", „Umsetzung in Österreich", each with its
  dated events, its identifier and its link (the proposal on EUR-Lex by its
  CELEX, the procedure in the Legislative Observatory by its number — built,
  never fetched).
- A rail component of its own. The five national stations
  (`SpineRail.vue`) are not reused for another object; the visual grammar
  is. Its design is settled with the maintainer before it is built.
- States: a station whose dossier could not be read says so; an act without
  a dossier (23 of 231, by their kind probably acts of the Commission) says
  that the Cellar records no procedure between the institutions for it —
  not that there was none.
- Rule D6 carries over: dates, no durations, no „it took".
- One Cellar query more per act, cached a month like the others; in the
  prewarm the map's acts can be asked 60 at a time (measured: four queries
  for the dossiers, three for the events).
- Impressum: the sentence of `#imp-eurlex` is widened (draft below).

### Step 2 — the consultation station, from the portal

The first new source.

- `ec.europa.eu` joins `UPSTREAM_HOSTS`; the comment there says what for. A
  policy of its own: one request at a time, 2.5 s apart, `maxBytes` sized
  for an initiative (97 KB measured; all language versions come along).
- `server/utils/eu/haveYourSay.ts`, a pure module: the search by COM
  reference and the initiative. The parser takes a **fixed list of fields**
  — id, short title, and per publication: type, stage, reference, published
  day, end of the feedback period, `totalFeedback`, feedback status, the
  types of the attached documents. The author fields (`authorName`,
  `authorSurname`, `authorMail`, `authorPhoneNumber`, `surveyContactMail`)
  are never read into an object; a test feeds a full answer and asserts
  that none of them survives.
- The join is proven, not trusted: `exactMatch` was wrong in 8 of 51
  lookups. An initiative belongs to a proposal only when one of its
  publications carries exactly the COM number.
- The answers that are no answer: HTTP 406 (5 of 51, reproducible, meaning
  unknown), any error, and an answer whose shape the parser does not know —
  „konnte nicht gelesen werden", with the link to the portal, not stored. A
  search that proves no initiative: „im Portal nicht gefunden", never „keine
  Konsultation". A proposal from before 2017: the sentence that the portal
  does not hold such proposals (0 of 15 in the sample).
- Station 1 „Konsultation" with its events (roadmap or call for evidence,
  public consultation: period and number of contributions); the feedback
  period on the adopted proposal is an event of station 2. The Commission's
  own summary report, where the initiative attaches one, is linked and
  named as the Commission's account.
- Prewarm: about 170 requests cold (two per act with a proposal from 2017
  on), about seven minutes; warm, only what the store lacks. A closed
  window's facts do not change and are kept.
- Measure every act with a proposal from 2017 on (86), not a sample; read
  the „nicht gefunden" cases by hand on the portal.
- Impressum: the new entry for the portal (draft below).

**Built and measured on 15.11.2026.** Through the running reader, every
act of the map (235), not a sample:

| What the page says | Acts |
|---|---|
| no station: an act of the Commission (40), or no procedure read (3) | 43 |
| the proposal is older than the portal (before 2017) | 94 |
| the Cellar names no COM number to search by | 8 |
| initiative found, the join proven by the COM number | 87 |
| not found | 2 |
| not read | 1 |

- Of the 90 acts with a proposal from 2017 on, 87 are found. All 87 carry
  a feedback period on the adopted proposal; 63 a period before it (50
  roadmaps, 47 public consultations, 11 Sondierungen). Every period is
  closed.
- The three others, read by hand on the portal: COM(2017)47 — one hit,
  the Solvency II review, which does not carry the number: not in the
  portal as far as its search goes. COM(2025)106 — 75 loosely matched
  hits even as a phrase, none of the first three carries it: the page
  says that more hits exist than the monitor opens. COM(2024)497 — the
  portal answers „not_acceptable" (the 406 of the memo), reproducibly:
  not read.
- **The search must be a quoted phrase.** Unquoted, „COM(2022)71"
  returned 167 initiatives and the right one (12548) was not among the
  first ten. This also explains part of the memo's finding that
  `exactMatch` was wrong in 8 of 51 lookups.
- An initiative can hold several proposals (102 adoption publications in
  87 initiatives); „Rückmeldungen zum Vorschlag" takes the publication
  that carries this act's COM number.

Against the plan above:

- **No prewarm and no store.** Only an act's page asks, for that act: at
  most four requests, a day's cache. The page waits nine seconds for the
  portal, then says „konnte nicht gelesen werden"; the reading goes on
  and the next view has it (6 of 235 on a cold first pass).
- **Only the parsed result is cached,** never the portal's record, which
  names officials. The test fixture carries placeholders for them.
- The types of the attached documents and the Commission's summary
  report are not read yet.
- The initiative's page is linked as `…/initiatives/<id>_de`. Opened in
  a browser on 15.11.2026: the application adds the title to the address
  itself. A single contribution has a page too
  (`…/initiatives/<id>/F<number>_de`).
- The portal's entry is in `impressum.vue` on the branch, from the draft
  below.

### Step 3 — open windows and pending proposals

The population no longer comes from Austrian drafts.

- One request a day returns every open window:
  `searchInitiatives?feedbackStatus=OPEN&size=100` (49 on 14.11.2026; the
  parameter names are the portal's own form fields). An initiative that is
  new, or whose status changed, is read once. If the count ever exceeds one
  page, the reader pages and says so in its report.
- A page per initiative and per proposal (addresses above) with the rail as
  far as it exists, and at the open window the one blue element of the
  page: the link to where the contribution is made, with the day the window
  closes. The link's address needs one check in a browser (the script
  cannot verify it; see „Not probed").
- The overview lists what is open now, by closing day. It carries no count
  of contributions as a ranking and no „most discussed".
- A proposal that left the Commission: its dossier in the Cellar by COM
  number gives the stations „Vorschlag" and „Parlament und Rat" as they
  fill. „Anhängig" is printed as the Cellar's statement, with its day: the
  two flags of the Cellar disagree on 131 of 308 pending dossiers, and 90
  „pending" ones date from 2010 to 2016. Before this ships,
  `cdm:dossier_withdrawn-proposal` is evaluated, and an ending without an
  act is shown only where a source states it.
- At Parliament and Council the page says that no channel for individuals
  exists at this stage, and links the procedure.
- Feed and calendar: open EU windows are a source of their own
  (`?quelle=eu`), not mixed into the Begutachtungsfristen by default
  (decision 11).
- Sitemap, the page-view classes, the header entry and `wege.ts` follow.
- A window that closed stays a page: what was open, until when, how many
  contributions. Nothing is deleted when the portal's list no longer
  returns it.

**Open windows built on 15.11.2026** (the pending proposals from the
Cellar are not): the list on `/eu-recht` (`fenster.get.ts`, `EuFensterList`),
the initiative's page (`/eu-recht/initiative/<nr>`), `?quelle=eu` in feed and
calendar, sitemap, page-view class, `/wege`, the Impressum sentence. Against
the plan: no fact store for once-open initiatives — a closed initiative's
page reads the portal again when asked, cached a day; the header entry is not
added. Not verified: what the portal answers for an unknown number (taken as
404), the `page` parameter beyond the first page (the reader checks the page
number the answer reports), and the address of an initiative's page on the
portal in a browser.

**Pending proposals built on 15.11.2026**: the page of a proposal
(`/eu-recht/vorschlag/<year>/<nr>`, `vorschlag/[year]/[number].get.ts`,
`cellarVorschlag.ts`, `app/utils/euVorschlag.ts`), the stand rule
(`shared/utils/euVorschlag.ts`), the page-view class, and the initiative's
page linking each proposal one of its publications carries. Measured on
15.11.2026:

- One SPARQL query per proposal, addressed by the proposal's CELEX
  (`5<year>PC<number padded to four>`) through `owl:sameAs` on the CELEX
  resource, answers in 0.25 s. The same address as a FILTER on the CELEX
  literal took 55–90 s.
- All 11 proposals with an open feedback window that day have a dossier
  with procedure number, type and dated steps.
- The dossier's three flags (pending, withdrawn, adopted) contradict each
  other in one dossier since 2019. The separate field „file-status" says
  PENDING on 22 of the 52 withdrawn dossiers of 2019–2024 and ADOPTED on 6
  pending ones; it is not read (docs/decisions.md, „The stand of a
  proposal").
- 50 of those 52 withdrawn dossiers carry a dated step `WDW_byCOM`, which
  dates the withdrawal. Its German label on the page („Rücknahme durch die
  Kommission") is ours until the Cellar's authority table is read.
- The German title is missing on some fresh proposals (COM(2026) 780:
  English only); the English one stands in, flagged on the page.

Against the plan: the address 301s to the act's page only where the
dossier names exactly one act AND the monitor has that act's page (an act
of the map, or a directive) — any other act would answer 404 there today,
so it is linked to EUR-Lex. The open windows' proposal pages are not in
the sitemap: the join needs a read of each initiative. Not verified: the
COM number is turned into the CELEX by rule, and the Cellar's identifiers
disagree with each other now and then on old acts (32013L0059); not
measured for proposals. A split procedure (2023/0077) gets no Observatory
link on the proposal's page; its acts' pages link their files.

### Step 4 — who gave feedback

Changes what the monitor names; built with the maintainer present.

- `allFeedback` is read page by page for one publication, at most 500 rows
  (decision 10). Beyond the cap the page says how many were read of how
  many (one consultation of the sample held 39,046).
- Classification on the server, before the payload: a row is an
  organisation only when its `userType` is one of the organisation types
  **and** it names an organisation; `EU_CITIZEN`, `NON_EU_CITIZEN`, `OTHER`,
  an unknown type, or a contradiction between type and fields is a person.
  First name and surname are never read into an object, for any type.
  ~~A row published as `ANONYMOUS` shows no organisation name either.~~
  **Changed by the maintainer on 15.11.2026:** an `ANONYMOUS` row of an
  organisation kind is named like a `WITHINFO` one — the portal's own form
  publishes an organisation's name either way and withholds only the
  contact person's.
- ~~The organisation name additionally passes the existing classifier
  (`server/utils/parliament/privacy.ts`, unchanged) as a second witness.~~
  **Changed by the maintainer on 15.11.2026:** the second witness is
  structural and a name check, not `privacy.ts` (which called 62 % of 934
  international organisation names a person and missed 3 of the 8 real
  cases): the size is SMALL, MEDIUM or LARGE or the row carries a
  Transparency Register number, AND no word of the sender's first name or
  surname occurs in the organisation's name. All 8 person-bearing names
  among the 934 were MICRO.
- Names are held in memory for a short time and never written to the fact
  store: consent to publication can be withdrawn after the window closed.
- The text of a contribution arrives in the same row as its metadata and
  is dropped at the parser. The monitor's rule „statement texts are linked,
  never fetched or parsed" was written for Parliament's statements; here
  the text cannot be left unfetched if the names are read (decision 9).
- Before it ships: every organisation name the page would show for a
  sample of 20 windows is read by hand, as after a change to `privacy.ts`.

**Built on 15.11.2026** (the rule in `docs/decisions.md`, „Who gave
feedback on the Commission's portal"): the reader
(`server/utils/eu/portalFeedback.ts` — `namedOrganisationOf`, the one pure
function of the rule; `parseFeedbackPage` with a fixed list of fields;
`readFeedback`, at most five pages of 100), the publication's own number in
the initiative's reader (`PORTAL_READER_VERSION` 5), the service
(`feedbackOf` in `portalService.ts`: the publication must be a window of the
initiative, read through the initiative's cache; same pacer; cached six
hours in the derived mount, memory in dev and production), the route
`/api/eu-recht/rueckmeldungen/<initiative>/<publication>` (404 for a
publication that is none of the initiative's windows, `no-store`), and the
fold „Wer Rückmeldung gegeben hat" (`EuFeedbackFold`, words in
`app/utils/euFeedback.ts`) under every feedback period with contributions on
the act's, the proposal's and the initiative's page, read only when opened.
Against the plan: rows with another status than `PUBLISHED` are counted
apart, of no kind; the publication mode must be `WITHINFO` or `ANONYMOUS`,
any other word is counted; a register number needs a digit; accents are
folded for the name witness (more rows counted, never fewer). The hand
reading through the built reader was done the same day (27 windows in
full, 4,537 rows, 2,078 distinct names) and added two conditions: no
number of five or more digits and no e-mail address in the name, and only
the head of the field is shown (cut at „;", a web address, „Contact:"; a
head over 120 characters is counted). Not done: the Impressum sentence
(maintainer's). Not verified: the portal's answer to a page number past
the last.

### Step 5 — the European Citizens' Initiative

- A reader of the register with a fixed list of fields: number, title and
  objectives, status, the days of registration and collection, the link to
  sign, signatures in total and per member state, the Commission's answer
  and its links. Never read: members (`fullName`, `email`), funders, logos.
- A rail of its own from the register's `progress` entries, whose
  vocabulary is read and written down first.
- The list shows what can be signed now (13 on 14.11.2026) with the day
  collection ends; the page shows the signatures from Austria beside the
  total. The threshold per member state is not in the answers read so far.
- One request a day for the list, one per initiative that is collecting or
  changed.
- Impressum: the new entry for the register (draft below).

**Built (15.11.2026)** (the rule in `docs/decisions.md`, „The European
Citizens' Initiative is an object of its own"): the reader
(`server/utils/eu/eciRegister.ts`, `ECI_READER_VERSION` 1, fixed lists of
fields), the service (`eciService.ts`: `eciList`, `eciByNumber` with found /
unknown on a 404 / not read, `eciOpen`; a pacer of its own for
`register.eci.ec.europa.eu`, cached a day and served stale a second day,
`ECI_REGISTER_STALE_S`), the routes `/api/eu-recht/buergerinitiativen` and
`/api/eu-recht/buergerinitiative/<year>/<nr>`, the page
`/eu-recht/buergerinitiative/<year>/<nr>` (`app/utils/euBuergerinitiative.ts`),
the list „Jetzt unterstützbar: Europäische Bürgerinitiativen" on
`/eu-recht` after the open windows (`EuEciList`, `MethodEuEci`), the
page-view class `eu-buergerinitiative`, the sitemap (the initiatives in
collection, from the list alone), `/wege` (the instrument is followed), the
EU summary on `/datenlage`, and the Impressum entry
`#imp-buergerinitiative`. Measured on the fixtures of 15.11.2026 (the list
of 136 and eight initiatives, one per status, organisers, funders, logos and
texts removed): the `progress` vocabulary, now in `docs/decisions.md`.

Against the plan:

- **Objectives are not read.** The plan named „title and objectives"; the
  objectives and the annex are the organisers' texts, to which the EU's
  legal notice reserves third parties' rights, so the page links the
  register for them. Members, funders and logos are not read, as planned.
- **No fact store.** Like the portal's initiatives, an initiative's page
  reads the register again when asked, cached a day; nothing is stored on
  disk beyond the cache.
- **„One request per initiative that is collecting or changed"** became one
  per initiative in collection a day: the list carries no deadline, and
  `latestUpdateDate` is read but not used to skip a read.
- **The per-country count is kept for the Member State only,** not for
  every member state; the page never shows the others.
- **Not in the feed and calendar:** decision 11 names the portal's windows
  only. Open for the maintainer.

Checked on 15.11.2026 against the live register: its public page of an
initiative (`…/initiatives/details/<year>/<6 digits>_de`) opens in a
browser; an unknown number answers 404; the first request for the list on
a cold cache took 15 s and carried four of 13 closing days, the rest
followed in the background within a minute. The reader keeps the count of
every country, not one Member State's; the page picks the country it
serves. Not verified: the meaning of `preAnswer` (seen once, ignored).

### Step 6 — the move to `/eu`, with the rename

Part of the maintainer's dated task for the rename, not of this plan's
schedule.

- The base flips from `/eu-recht` to `/eu`. `/eu-recht` itself becomes
  `/at/eu-recht`; every address below it answers one 301 to `/eu/…`, with
  no chain through `/at`.
- The act page's last station becomes one block per country the instance
  covers; Austria's block is today's timeline and rows.
- A country's facts keep pointing at the EU store; the EU store knows no
  country. An instance may run `/eu` with one country, or a country alone.

### Step 7 — directives a country has to transpose

Asked for by the maintainer on 14.11.2026: per country, the directives that
have to be transposed, also where nobody is working on one yet. It needs
steps 0 and 1 only and no new source, so it can be built right after
step 1.

- The population comes from the Cellar, not from drafts: directives whose
  latest transposition date lies in a window around today (measured
  14.11.2026: 56 with the deadline in the past two years, 55 in the next
  two).
- Per directive and country, three observations, each printed as what it
  is and with its source:
  1. the drafts the monitor found (the existing map);
  2. what the country notified to the Commission as transposition: the
     Cellar holds every national implementing measure
     (`cdm:measure_national_implementing_implements_resource_legal`, by
     country) with title, kind („Landesgesetz"), gazette number, day of
     notification and, for Austria, the RIS address. Metadata of the same
     source the Impressum already names;
  3. where neither exists: „Der Monitor hat keinen Entwurf gefunden.
     Österreich hat der Kommission bisher keine Maßnahme gemeldet." Two
     statements about two sources — never „nicht umgesetzt".
- A notified measure is the member state's claim, not a finding that the
  directive is transposed: Austria notified a Land law of 1993 for a
  directive of 2019. The page says „gemeldet", and the Commission does not
  confirm completeness in this data.
- Rule D6 holds and is the hard part here: two dates and the observations,
  no „überfällig", no colour, no count of directives without a measure, no
  ordering by it. The list is ordered by deadline. The wording and the
  layout are settled with the maintainer before anything is built; this is
  the place where the monitor comes closest to a counter.
- The same query answers for any member state. Germany's list exists before
  a single German draft is read; it then shows observation 2 only and says
  that the monitor reads no German drafts yet.
- One query per country for the window, cached a day.
- Measure first: for every directive of the window, the Austrian measures
  read in full for 20 of them; the two directives past their deadline
  without an Austrian measure read by hand (transposition may be notified
  late, or not be needed).

**Measured on 15.11.2026** (window 15.11.2024 – 15.11.2028, the Cellar's
answers kept and cut into `tests/fixtures/eu-umsetzung`):

- 124 directives have a transposition date in the window: 96 of Parliament
  and Council or the Council, 21 delegated, 7 implementing. A directive's
  deadline is its latest date; for 13 that lies beyond the window. For 72
  it has passed, for 52 it is that day or to come.
- Austria notified 1,264 measures for 80 of them (663 Landesgesetze, 338
  Bundesgesetze, 172 Verordnungen); the median directive has 2, one has
  139. 465 measures in 42 directives are older than the directive's year.
  Every measure has title, kind, day of notification and gazette day; 766
  an address, 15 of those into the federal intranet (not passed on).
  Germany notified 252 for 78, without addresses.
- Against the monitor's map: of the 72 with the date passed, 63 have an
  Austrian measure and 9 have none — 6 of the 9 delegated or implementing
  directives of the Commission, 2 of the 9 with a draft in the monitor
  (Richtlinie (EU) 2024/1069, whose Begutachtung ended on 10.11.2026). Of
  the 52 to come, 33 have neither a draft nor a measure.
- 31 directives with the date passed have a notified measure and no
  implementing draft in the monitor's window: transposed by law older than
  the window, or notified as covered by existing law.

**Built on 15.11.2026**, after the maintainer settled the four questions
(the list first on the EU overview; a row of two sentences; the
Commission's directives behind a chip that is off; the measures as a count
in the row and in full on the directive's page):

- Three small Cellar queries, each run that day and answered in under a
  second, each cached a day (`server/utils/eu/cellarUmsetzung.ts`,
  `cellarService.ts`): the directives with all their dates, titles and
  types (158 kB); a country's number of measures per directive (17 kB);
  one directive's measures (145 kB for the largest). The first reader
  loaded all of a country's measures at once, 1.6 MB; that is gone.
- `GET /api/eu-recht/umsetzung` joins them with the map; „unknown" is
  null, never 0. The act's API answers for a directive no draft names,
  with a head from the Cellar, and carries the notified measures.
- `/eu-recht` opens with „Richtlinien, die Österreich umzusetzen hat"
  (`EuUmsetzungList`), tabs „Frist läuft" and „Abgelaufen" as the list
  below has them; the map of drafts follows under its own heading. On a
  directive's page, „Umsetzung" states the count and folds the measures
  (`EuStationSection`'s record), with the sentence on what a notification
  is and is not.
- The Member State (`EU_MEMBER_STATE`) and the window are written once,
  in `shared/utils/eu.ts`.
- Not done: no line in the sitemap for directives no draft names; no
  prewarm (the list's first request after a restart waits for the map);
  the wording of the list is a first proposal for the maintainer to read.
- The Impressum sentence of `#imp-eurlex` is widened on the branch by the
  list of directives and the notified measures (title, kind, day of
  notification, gazette reference): metadata of the source it already
  names.

### Not in this plan

The comparison of a proposal's text with the adopted act. Both texts are in
the Cellar, but the monitor takes only metadata from EUR-Lex today, no
official Textgegenüberstellung exists to verify against, and the articles
are renumbered. It is a project of its own.

## The Impressum, as drafts

Each is a proposal for the maintainer. All three are in `impressum.vue` on the branch `feat/eu-zyklus` since 15.11.2026, each in a wording widened when built (`#imp-eurlex`, `#imp-kommission`, `#imp-buergerinitiative`); the drafts below are the plan's.

- **`#imp-eurlex`, with step 1** — after „das Datum ihres Beschlusses":
  „…, der amtliche Titel und die Fundstelle im Amtsblatt, sowie zum
  Verfahren eines Rechtsakts dessen Nummer, die Nummer des Vorschlags der
  Kommission und die Schritte mit ihrem Datum".
- **New, with step 2** — „Europäische Kommission, Portal „Ihre Meinung
  zählt": Zu Vorhaben und Vorschlägen der Kommission: Titel, Stadium, der
  Zeitraum, in dem Rückmeldungen möglich sind oder waren, und ihre Zahl.
  Inhalte der Kommission stehen laut ihrem rechtlichen Hinweis unter
  CC BY 4.0; der Monitor gibt sie gekürzt und in eigener Darstellung
  wieder. Beiträge selbst übernimmt er nicht, er verlinkt sie." With step
  4 one sentence more: „Organisationen, die sich geäußert haben, nennt er;
  Privatpersonen zählt er und nennt sie nicht."
- **New, with step 5** — „Europäische Kommission, Register der Europäischen
  Bürgerinitiative: Titel, Stand, Fristen und die Zahl der
  Unterstützungen, CC BY 4.0 laut rechtlichem Hinweis der Europäischen
  Union. Namen der Organisatorinnen und Organisatoren und Geldgeber
  übernimmt der Monitor nicht."

## Cache, heap and cold start

| Step | Requests | Stored | Note |
|---|---|---|---|
| 1 | one Cellar query per act, or 7 for the map in batches | a few events per act | month-long cache as today |
| 2 | about 170 cold, then only what is missing | up to four publications per act | paced; prewarm only |
| 3 | 1 a day, plus one per new or changed initiative | one entry per open or once-open initiative | grows by what the portal opens; a closed entry is final |
| 4 | pages of one window, capped | nothing | memory only, short |
| 5 | 1 a day, plus about 13 | one entry per initiative | — |

Everything stays in the JSON fact store on disk: a few hundred bytes per
object, no database, no account, no key, no bill. Answers are read one at a
time and reduced to the field list before the next is fetched, so the heap
stays flat; the smoke run on the small heap covers the prewarm line of each
step before it ships. A new prewarm line goes behind `PREWARM_ONLY`.

**The map's build is already near the ceiling.** Reported by another
session on 14.11.2026, one run each, not re-measured here: on a cold
production build with a 320 MB heap, `/api/eu-recht/karte?gp=aktuell` timed
out after 300 s and was where the process's memory peaked, 664 MB on main
and 590 MB on the commit before that day's work, against the box's 704 MB.
So no step adds reads to `buildEuMap`. The rail is built by a route of its
own and its own prewarm line, after the map's, and step 1 measures the peak
of the whole prewarm sequence before and after on the small heap; a higher
peak than before blocks the step.

What breaks without warning is the portal's interface. It is confined to
its reader; a changed shape turns its stations and the open-windows list
into „konnte nicht gelesen werden" with the link to the portal, and nothing
else on the page depends on it.

## Not probed

- The address of an initiative's page on the portal: the script builds it
  from an „initiative path" and the language; whether the number alone
  resolves needs a browser.
- The labels of the Cellar's 85 event types. (The vocabulary of the ECI
  register's `progress` was read on 15.11.2026 over 28 initiatives — ten
  names; it is in `docs/decisions.md` with step 5.)
- The key from an act of the Commission to its initiative (the C number),
  and from an adopted act to later initiatives about it.
- `cdm:dossier_withdrawn-proposal`, and what `OP_DATPRO` as a dossier's
  reference type means.
- What the portal's `UPCOMING` (495 entries) promises, and whether a
  planned window has a date.
- The legal notice the portal's application itself links, and both legal
  notices of the European Parliament (not readable without a browser).
- Whether the portal removes contributions after a window closed, which
  would move a stored count.

## Open questions

None of the plan's own. One thing was named on 14.11.2026 and is not
planned here: acts addressed to a single member state (the Cellar records
the addressee; not probed).
