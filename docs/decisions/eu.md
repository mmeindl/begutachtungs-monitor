---
paths:
  - "server/utils/{eu,bund-land}/**"
  - "server/api/eu-recht/**"
  - "app/pages/eu-recht/**"
  - "app/components/eu/**"
  - "app/utils/eu*.ts"
  - "app/composables/useEuRecht.ts"
  - "shared/utils/{eu,euEvents,euPortal,euVorschlag,countryNames}.ts"
  - "server/api/bundesrecht/**"
---

# EU law and federal law carried out by the Länder

EU acts, their rail and their pages, the Citizens' Initiative, and federal law
the Länder carry out. The feedback list is in `docs/decisions/eu-feedback.md`.
What an entry holds, and the other areas: `docs/decisions.md`.

## EU law and federal law carried out by the Länder

The code names the EU rules D1 to D7; this is where they are defined
(§12.66).

- **D1. The EU fact appears only as a positive finding** (transposes,
  accompanies, goes beyond). A statement on every draft would be noise.
- **D2. With contradicting Vorblätter** it appears only where all agree or
  the law text names the act.
- **D3. Deadlines only for directives.** Of several dates the latest is the
  deadline (50 of 168 directives carry several unlabelled Cellar dates).
- **D4. A deadline only for an act that is new to Austrian law.** „Already
  transposed" means a provision in force transposes the act, not merely
  mentions it: „mentioned anywhere in federal law" wrongly removed 43 of 70
  deadline lines. **D4a.** A base act cited „in der Fassung" of an
  amendment carries no deadline.
- **D5. The Erläuterungen decide whether a draft transposes EU law only
  where there is no Vorblatt, and never which act.** Sentences about other
  texts are no signal.
- **D6. Two dates side by side, no verdict:** no „late", no day count, no
  colour, no countdown, no lateness rate. The monitor cannot see whether a
  directive was transposed elsewhere, and „overdue" without a possible „on
  time" is a failure counter. The same holds for the deadline timeline: no
  axis from the adoption, no written distance („18 months after"), no
  before/after colour.
- **D7. Act names come from the Cellar,** not from a lookup table of short
  names: a table solves none of the act-less drafts, and ages.
- **From EUR-Lex only metadata (CC0) is taken;** acts are linked, the logo is
  never used (§12.66).
- **Bund → Land is keyed by the promulgation (BGBl. I), not the
  Ministerialentwurf.** Amendments enter at the RV, only two Länder write
  „in Ausführung des …", and reference lists cite everything. Drafts are
  counted, never Länder; „0 Länder" is never shown, and unread Länder are
  not „without" (§12.67). No overview page for Grundsatzgesetze: about
  five a year.
- **A reader change that alters a stored finding bumps its reader version in
  the same commit,** or the disk store keeps stale facts (§12.66, §12.67).
- **The EU readers are pure modules: text and a CELEX number in, never a
  RIS record** (04.11.2026, the headers of `umsetzungshinweis.ts`,
  `vorblatt.ts` and their neighbours). No Nitro globals and relative imports
  only, so the corpus script measures the shipped file and the Länder run
  the same reader over a Landesgesetz's text unchanged.
- **The header navigation is the door to `/eu-recht`** (14.11.2026), as the
  page grows into the EU cycle; the homepage has no window onto the map.
  The list's filter „Setzt EU-Recht um" stays — it combines with the other
  filters, it is no door.
- **Each EU source starts with a licence check, not with code,** written up
  in `docs/research/` (the Commission's consultation endpoint, the register
  of the European Citizens' Initiative).

### The acts and the lists on `/eu-recht`

- **The acts list („Rechtsakte, die Entwürfe dieser Periode umsetzen")
  orders by deadline, by name, or by „Entwürfe"** (16.11.2026,
  `euActComparator`): the drafts, Bund and Länder together, most first,
  ties in the tab's deadline order; each reversible. It counts drafts that
  implement an act, never acts not implemented, so it is no order by what
  is missing. „Ohne Frist" turns a deadline order into the names
  (`forcedToName`); the drafts' order stays.
- **The acts drafts only restate are a section of their own** (16.11.2026,
  „Rechtsakte, die Entwürfe nur wiederholt nennen", `EU_RESTATING_DE`),
  under the map, not a fold in it: a fold read as more of the same list,
  the impression D4 keeps them out of. The site's chips select them; the
  map's tabs, order and search stop at its heading. One order
  (`euRestatingRows`): the map's three tabs in a row, each in its own
  direction.
- **`/eu-recht`'s five lists open with five rows and step by ten**
  (16.11.2026, `EU_OVERVIEW_LIST_INITIAL`): the page is an overview of
  lists, so each opens short and all are in reach.
- **The directives a country has to transpose are listed from the
  Cellar, not from drafts** (15.11.2026): every
  directive with a transposition date within two years of today, by
  deadline, also where nobody works on it; each has a page. Beside it
  stand two observations from two sources — the drafts the monitor found,
  the measures the Member State notified to the Commission — each in its
  own sentence and each with its own „unknown" (null, never 0). A notified
  measure is the Member State's claim, so the word is „gemeldet"; nothing
  says „umgesetzt", „offen" or „überfällig", no colour, no count or order
  by what is missing (D6): the columns „Entwürfe" and „Gemeldet" do not
  sort. The deadline and the name do, each reversible
  (`EU_UMSETZUNG_SORT_COLUMNS`, a test holds the two columns out). The
  Commission's delegated and implementing directives stay behind a chip
  that is off and says how many they are.
- **The windows open on the portal are listed first on `/eu-recht`**
  (15.11.2026, `EuFensterList`): one request a day for the list, one row
  per window by closing day, tabs by where in the process
  („Konsultation", „Vorschlag", „Entwurf eines Rechtsakts"). No count of
  contributions in the list and no order by a count; the count stands on
  an initiative's own page, per window. The reader may order by closing
  day (the default, a window without a day last either way) or by title,
  each reversible; „Stadium" and „Vorgesehen" do not order — the tabs
  divide by them. A portal that could not be read is said with the link
  to the portal, never an empty list. No feed and no calendar of the
  windows (decided 16.11.2026, a ticket of its own; `?quelle=eu` is an
  unknown source, 404). An initiative has a page by the portal's number
  (`euInitiativePath`); its door is the way to the portal while a window
  is open, and the stations after the Commission say in a „Nicht im
  Monitor" sentence that the monitor does not follow it there yet.

### An act's rail and its page

- **An EU act has a rail of its own, read from the Cellar** (15.11.2026,
  `server/utils/eu/cellarDossier.ts`, `app/utils/euRail.ts`; facts in
  `docs/research/eu-zyklus.md`, plan in
  `docs/research/umsetzungsplan-eu-zyklus.md`). Its stations are „Vorschlag",
  the station of who decided, „Amtsblatt", and „Umsetzung" (directive,
  framework decision) or „Geltung" (regulation, decision); „Konsultation"
  joins in front once the Commission's portal is read. The five national
  stations are untouched.
  - **The third station is named from the act's authors in the Cellar,**
    not from a table of procedure types: Parliament and Council → „Parlament
    und Rat", the Council alone → „Rat" (all 27 such acts span four
    procedure types), the Commission → no such station and no „Vorschlag",
    with the sentence that the Cellar records no procedure between the
    institutions for it.
  - **Only steps on the allowlist are shown** (`shared/utils/euEvents.ts`),
    under the Cellar's own German label. Every other step is counted on the
    page, never taken for „did not happen".
  - **The proposal's day is the document's own** (`work_date_document`),
    which the Legislative Observatory also gives; the Cellar's adoption step
    is dated a day later.
  - **Dates, no durations** (D6 carries over): no time between two steps, no
    word on whether a deadline has passed. A test holds every string of the
    rail to that.
  - **„in Kraft" is the Cellar's date typed EV, „gilt" the one typed MA that
    is not partial, „wirksam" the one typed PE** (what a Beschluss carries).
    „gilt unmittelbar in jedem Mitgliedstaat" stands on a regulation only
    (Art. 288 AEUV).
  - **A gap names its reason:** the Cellar did not answer; the Cellar links
    the act to no procedure; the procedure names no proposal; the procedure
    records no decision of Parliament or Council the monitor reads.
  - **Every station has a section of the page under the station's own
    name,** as on a draft's page, and the rail links only to them; what
    leaves the site (EUR-Lex, the Legislative Observatory) stands in the
    section. A section exists also where it holds one line today, so a
    later step of the EU cycle fills a place that is already there; none
    is empty — it says what the Cellar has or why it has nothing. The
    sections stand in the rail's order, so the card is the page's table
    of contents; the last one holds the drafts, which a directive's are
    said to „umsetzen" and a regulation's or decision's to „durchführen".
    Rejected: the drafts' section first, against the rail's order; one
    section „Das Verfahren" for two stations; outbound links in the rail.
  - **The Legislative Observatory is linked by rule, not by lookup:**
    procedures from 1994 on, of type COD, CNS or APP; the link says that the
    page is English, and it is built from the procedure number, never
    fetched. Procedures the Observatory split into files „A" and „B"
    answer 404 under the plain number; `OBSERVATORY_FILE` names the file.
    Rejected: asking the European Parliament's API, which knows the files
    but not the act a file ended in.
  - **The rail adds nothing to the map's build.** One Cellar query per act,
    asked when the act's page is, beside the Amtsblatt reference and cached
    a month like it. No prewarm line, no stored file.
  - **Every EU address is built by `euPath`** (`shared/utils/eu.ts`) below
    one base, `/eu-recht` until the rename moves the acts to `/eu`.
- **An EU page is a detail page** (15.11.2026): the rules of „The detail
  pages" (`docs/decisions/ui.md`) hold and are not restated here. The
  act's, the proposal's, the initiative's and the Citizens' Initiative's
  page open with the one state card (`ProcedureCard`), the EU rail passed
  as its rail (`EuRail`) and the default way out; the note on an act of
  the Commission and the gap sentence on a step of the register the
  monitor does not know are the card's footer. The heading says the stand
  alone („Sondierung läuft", „Vorschlag liegt vor", „Anhängig laut
  EUR-Lex"); what it rests on stands in the rail. The act's headings:
  „Umsetzungsfrist läuft", „Umsetzungsfrist beendet", „Gilt", „In Kraft,
  gilt noch nicht" — no day in the heading; the day stands at the last
  station. „Beendet", not „abgelaufen": no word that reads as a verdict on
  the transposition (D6). The list of open windows uses the draft list's
  box for an open Frist, word for word and tone for tone.
- **A station ahead has no section** (15.11.2026, `euVorschlag.ts`,
  `euInitiative.ts`). As on a draft's page, an EU page shows a section
  only for a station that is reached. A station ahead stands in the rail,
  hollow, and the first one carries the one line there is to say: what
  the record holds, where the proposal's page continues, or that the
  monitor does not follow the initiative further. A station that has not
  happened is not a gap. The exception is an answer that did not come:
  then nobody knows whether the station is reached, and its section stays
  with „Gerade nicht abrufbar".
- **An EU page's action is a draft's door** (15.11.2026,
  `EuWindowAction` through `DraftDoorCard`), unchanged: its heading the
  countdown and date („Noch 56 Tage · bis So., 10.01.2027"), its ground
  the tone a Stellungnahme's door takes when the Frist is close; a window
  without a last day keeps its own heading. D6 forbids a day count beside
  a transposition deadline, where it would read as a verdict on a state; a
  window the reader can still use is the reader's own deadline, and there
  the count is the point.
  - **No body sentence where the button says it:** neither the
    Commission's door nor a Citizens' Initiative's has one.
  - **Above the button, the Commission's own sentence for the open stage**
    (`SourceQuote`, `app/utils/euFeedbackQuote.ts`), signed „Europäische
    Kommission", verbatim from the portal's German page text
    (`page.initiativeDetails.<stage>.feedbackmessage`, read 15.11.2026):
    Sondierung, öffentliche Konsultation, Entwurf eines Rechtsakts, and
    the adoption's sentence only for feedback on a legislative proposal.
    No quote for any other stage or adoption. Where several windows close
    on the door's day, only what the Commission says of all of them: the
    Sondierung's sentence is the first of the public consultation's, so
    that pair quotes it; sentences that share no such opening give no
    quote. A Citizens' Initiative's door quotes the three sentences under
    the heading of the Commission's German home page for the instrument
    (`EU_ECI_QUOTE`, read 16.11.2026).
  - **The door stands twice** (`EuRailSection.door`, set by the view):
    once more, solid, with the card's label, at the end of the section
    that holds the window the door counts down to — „Konsultation", or the
    Commission's own station („Vorschlag", „Rechtsakt der Kommission") for
    feedback on a proposal or a draft act; „Sammlung" for a Citizens'
    Initiative — under „Wer Rückmeldung gegeben hat", where the decision
    is made; only while the card shows and has a button. Two windows on
    that day in two sections: the later one, where the reading ends.

### The proposal

- **The stand of a proposal: which Cellar flags decide** (15.11.2026,
  `shared/utils/euVorschlag.ts`, `server/utils/eu/cellarVorschlag.ts`).
  A proposal that left the Commission has a page by its COM number
  (`euProposalPath`). Its dossier carries three flags — pending,
  withdrawn, adopted — that contradict each other in one dossier since
  2019, so no flag decides alone: „Rechtsakt geworden" needs the adopted
  flag AND an act the dossier produced; „Zurückgezogen" needs the
  Commission's dated step `WDW_byCOM`, and its day stands at the station,
  not in the card's heading, which names a state; the withdrawn flag alone
  gives „Laut EUR-Lex zurückgezogen", without a day; the pending flag
  alone gives „Anhängig laut EUR-Lex" with the day of the last recorded
  step, never „seit N Tagen" (D6). Missing or contradicting flags claim
  no stand, and the page says the Cellar gives no clear one. The Cellar's
  field „file-status" is NOT read: PENDING on 22 of 52 withdrawn dossiers,
  ADOPTED on 6 pending ones. Rejected: reading the pending flag as „still
  open" on its own. The page's absence sentences are about the record
  („der Cellar verzeichnet bisher keinen Beschluss"), not the world. One
  act with a page in the monitor: the proposal's address answers 301
  there; several: the page stays and links each. An initiative's page
  links the page of each proposal one of its publications carries and
  points its later stations there; it never redirects, as an initiative
  can hold several proposals.
- **A withdrawn proposal ends on a station „Zurückgezogen"**
  (15.11.2026): the withdrawal has a day and ends the procedure, so it is
  the rail's last station, after whatever Parliament and Council still
  decided, and it carries the highlight. „Amtsblatt" and the last station
  are not drawn: a hollow station means „still to come", and these never
  come. The rule „a section per station, even while empty" is for
  stations a later step fills. Where a proposal became acts, the last
  station is reached and says that its content stands with the acts.
  Visitors read „EUR-Lex", not „Cellar", in every sentence of the
  proposal's page; the source credit keeps the Cellar's full name.

### The Commission's portal „Ihre Meinung zählt"

- **The portal is read narrowly and gently** (15.11.2026): its interface
  is undocumented. Two addresses — the search by COM number, as a quoted
  phrase, and one initiative — one request at a time, 2.5 s apart, no
  retry, only when an act's page asks, cached a day. The list of
  contributions is asked only when the block „Wer Rückmeldung gegeben hat"
  nears the reader's viewport (`docs/decisions/eu-feedback.md`). The
  parser takes a fixed list of fields; the officials' names, mail
  addresses and telephone numbers in the portal's record reach no cache,
  no API answer and no page, and only what was parsed is cached. An
  initiative belongs to a proposal only when one of its publications
  carries exactly the COM number. „Not found in the portal", „older than
  the portal", „no number to search by" and „not read" are four
  sentences, and none says „keine Konsultation". Rejected: the prewarm of
  every act of the map. Not asked (23.11.2026, revising 14.11.): the
  Commission, whether a documented interface exists. `data.europa.eu`
  holds no dataset of the portal and none of the register of the European
  Citizens' Initiative, no documentation of either was found
  (`docs/research/eu-zyklus.md`, 1.2 and 1.3), and every request names the
  site in its User-Agent. A break is noticed by the uptime check's EU
  canary (`.github/workflows/uptime.yml`) and repaired here; the
  maintainer writes when a break leaves a question.
- **Who gave feedback on the portal:** `docs/decisions/eu-feedback.md`.

### The European Citizens' Initiative

- **The European Citizens' Initiative is an object of its own, with a
  rail of its own** (15.11.2026, `server/utils/eu/eciRegister.ts`,
  `eciService.ts`, `app/utils/euBuergerinitiative.ts`). No field of the
  register joins an initiative to a legal act, so it is no station of an
  act and its page links none. Address
  `/eu-recht/buergerinitiative/<year>/<nr>` by the register number
  (ECI(2022)000002 → `/2022/2`); a padded number answers 301. The register
  (`register.eci.ec.europa.eu`) is read through a pacer of its own, one
  request at a time, 2.5 s apart, no retry, each answer cached a day and
  served stale a second day. The register's public page of an initiative
  is built by `eciPageUrl`.
  - **The rail comes from the register's `progress`,** an unordered list
    whose active entry equals the status, with ten step names; a day can
    be missing. Stations: „Registrierung", „Sammlung" (begun with ONGOING,
    CLOSED or any later step), „Prüfung" (VERIFICATION), „Einreichung"
    (SUBMITTED), „Antwort der Kommission" (ANSWERED or an answer); a later
    step implies the earlier ones. An initiative that ended otherwise ends
    on a highlighted station of its own with the register's day, and the
    stations it can never reach are not drawn: „Zurückgezogen"
    (WITHDRAWN), „Nicht genug Unterstützungen" (both INSUFFICIENT
    statuses), worded „laut Register", no judgement. The card's heading is
    the state: „Registriert", „Sammlung läuft", „Sammlung beendet", „In
    Prüfung", „Eingereicht", „Von der Kommission beantwortet",
    „Zurückgezogen", „Nicht genug Unterstützungen laut Register". A step
    name outside the ten is no station; a „Nicht im Monitor" sentence under
    the rail names it, and nothing throws.
  - **The door stands only while the collection runs:** status ONGOING
    and the register's last day not passed by the Vienna day; it counts
    the days like a draft's door and leads to the German `supportLink`,
    and stands once more at the end of „Sammlung" („An EU page's action
    is a draft's door", above). No link, no button, no second door, and a
    gap sentence says so. The page does not say who may sign (not
    verified).
  - **Never read, into any object:** `members` and `funding` (personal
    data: names, e-mail addresses), `logo` (excluded by the EU's legal
    notice), and the organisers' own texts — `objectives`, `annexText`,
    `website`, documents, draft legal acts — to which the notice reserves
    third parties' rights; also `categories` and `treaties`. The page
    links the register for the objectives. A test feeds invented
    organisers, funders and texts and finds none in the parser's result.
  - **No threshold.** The register gives the total and the count per
    Member State, never how many a Member State needs nor whether that
    number is reached. The reader keeps the count of every country the
    register lists and knows no country itself; the page shows the total
    and the number of the country it serves (`EU_MEMBER_STATE_ECI`, the
    view's `memberState`; a page that serves no country shows none) and
    says once, in a „Nicht im Monitor" sentence, that it shows no
    threshold. Rejected: computing the thresholds from the regulation's
    annex — a second source with its own upkeep, and a „reached" mark
    would read as a verdict.
  - **The list „Jetzt unterstützbar" opens by the last day of the
    collection, soonest first, then by number** — the open windows' rule.
    The reader may also order by title or by supporters (most first),
    each reversible, a row without a day or count last either way: the
    count column is the twin of the draft list's Stellungnahmen. The list
    never opens on the supporters' order, which would read as a ranking of
    what is worth signing. The register's count stands in a column of its
    own, „Unterstützungen" (`EuCountCell`; the acts' drafts on `/eu-recht`
    too), „laut Register" in the frame row and the cell's words, a missing
    count the word „nicht angegeben", never 0. The list carries no
    deadline, so the details of each initiative in collection are read one
    after the other; the endpoint waits 8 s for them after the list, and a
    row without its day stays, with a „Gerade nicht abrufbar" sentence,
    never dropped.

## Measured figures

| What | Value | Sample, date |
|---|---|---|
| Vorblatt carries the EU heading | 94.8 % | 154 ME, GP XXVIII · 04.11.2026 (§12.66) |
| Vorblatt says „transposes a directive" / any EU link | 27.9 % / 41.6 % | same |
| Länder drafts that carry out something federal | about 7 % | 489 drafts · 06.11.2026 (§12.66) |
| Deadline stated in the Land draft | 2 of about 35 | same |
| EU acts of the map by who adopted them | Parliament and Council 167, Council 27, Commission 41 | 235 acts · 15.11.2026 |
