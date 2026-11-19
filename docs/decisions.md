# Decisions

What binds future work and cannot be read off the code: standing rules, the
measurements that carry the product's claims, and alternatives that were
tried and rejected.

The numbers in parentheses (§12.31) are sections of `docs/architecture.md`,
the change-by-change log this file replaced. It is kept under a tag, as is
`docs/ris-join.md` (the reasoning behind each weight of the RIS↔Parliament
join is in `server/utils/ris/risJoin.ts`):

```sh
git show architecture-archive-2026-11:docs/architecture.md
git show ris-join-archive-2026-11:docs/ris-join.md
```

The story of a change belongs in its commit message. A rule that outlives the
change belongs here.

**What an entry holds:** the rule, one reason, and a pointer to the code or
the measurement. What a change moved (counts before and after), the
calibration of a threshold and the history of a bug stay in the commit
message or at the constant. A figure enters section 2 where the product or a
rule stands on it, never as the delta of one fix. A rejected alternative
gets an entry of its own only where it carries a reason the rule does not.

## 1. Standing rules

### Foundations

- **Boring, low-ops tech.** No database, no accounts: the Nitro server is a
  caching proxy in front of the official APIs. The predecessor
  (OffenesParlament.at) died in operation, not in construction.
- **Anyone can run a copy for under €100 a year,** without the maintainer
  and without an organisation behind it: a successor must be able to take
  over on one domain and one small server. So no recurring paid service
  beyond those two, one domain for all countries (a country is a path
  segment), and the public address comes from configuration. Anything that
  needs a recurring bill is a layer the core runs without.
- **No third-party resources at runtime.** No web fonts, no icon or script
  CDN, no analytics service, and no cookie but `quellen`, set only when a
  reader changes the sources of the list. Hosting only with EU-owned
  providers, not the EU regions of US hyperscalers (CLOUD Act). The
  build-time dependency on the npm registry is the documented compromise.
- **No `v-html` for upstream content.** Everything is reduced to plain text
  on the server.
- **No Pinia or other state layer.** `useFetch` suffices; there is no shared
  client state.
- **No page may wait on hundreds of upstream fetches.** Station maps are
  cached, time-budgeted and prewarmed; when the budget runs out the list
  stays unfiltered and says so (§12.26).
- **The list waits only for the half that carries it** (12.11.2026). Rows
  that arrived render; a half still loading is named in the count line and
  never counted as 0. The server's render gives the other halves 2 s
  (`useDraftHalves.ts`); a cold Länder read was measured at up to 30 s.
  Rows that sort in later keep the reader's cut (`cutKeeping`), and the cut
  holds under a search query too.
- **Upstream calls identify themselves** with one `User-Agent`, retry twice
  on 5xx, and time out after 8 s per attempt, because timeout × 3 is how long
  an SSR render blocks before the error page.
- **Every whole-list read is checked against the `count` of the same
  response,** and every row against the requested period: the Parliament API
  silently ignores unknown filter keys and `showAll` silently stops at
  100,000 rows. Positional list headers are asserted before anything is
  cached (§12.14).
- **A paged upstream read fetches its remaining pages together once page 1
  states the total** (`upstream/pages.ts`): four at a time, inside a RIS
  host's 24 slots. The count check on every page, the breaks and the ceiling
  stay the loop's, and one failed page fails the read. Sequential on
  purpose, and named in `tests/pages.test.ts`: the Begut corpus (paced) and
  a Bundesgesetzblatt year (pages of up to 3.6 MB on a 320 MB heap).
- **The current legislative period is never hardcoded without a fallback
  path.** Units and scripts say `aktuell` and `vorperiode`, because a roman
  numeral in a unit file turns wrong on the day nobody is looking.
- **An address that goes away keeps working, for good** (14.11.2026). It
  gets a 301 in `routeRules` (`nuxt.config.ts`) to its nearest successor,
  never to the homepage, with the date and the reason in a comment; the
  line is never removed and the slug is never reused. Links in mails,
  newsletters and podcast notes do not expire. Its class in the page count
  (`zaehlung/klassen.ts`) stays, labelled „bis <date>" on `/statistik`, for
  the days already counted; the 301 itself is not counted, the successor's
  page is. Old anchors are not mapped: the fragment never reaches the
  server, and a section dissolved into the places it describes has no one
  target. The move to `viewyourstate.org/at` needs a path-keeping 301 from
  the old host, under which these rules still apply.

- **Each of the prose pages has one job, and a fact stands on one of them**
  (16.11.2026). `/impressum`: the disclosure under § 25 MedienG. `/quellen`:
  which source is read and under which licence, one entry per source.
  `/datenschutz`: what is processed, and in `#dse-names` who is named and
  who is not, for every source. `/datenlage`: what a source publishes.
  `/ueber`: what the monitor is, its limits, how to subscribe and support.
  The others link there instead of repeating it: the licences stood on
  `/ueber` and in the Impressum and had drifted apart, the names rule stood
  in three places, and how the Commission's feedback names are held stood
  only inside a licence entry. `/impressum#imp-license` stays as a short
  section, because a fragment cannot be redirected.
- **The monitor's own texts are CC BY 4.0** (16.11.2026, decided by the
  maintainer; `/quellen#eigene-texte`): explanations, method texts, the
  descriptions of routes and of the Datenlage. Not the material of the
  sources, which keeps its own terms, and not the name or the § mark. The
  code stays AGPL-3.0-or-later. The grant cannot be withdrawn for what was
  published under it.

### Privacy

- **No private person is named.** The pipeline filters on the server, before
  anything reaches the SSR payload. When in doubt a submitter is a person: an
  organisation shown as „Privatperson" is a cosmetic bug, a published name is
  a legal risk.
- **The naming segment decides.** „Nachname, Vorname; Universität Salzburg"
  is a person with an affiliation. A person attached behind an organisation's
  name is cut off; an e.U. counts as a natural person (§12.14).
- **List 142's institution flag can withhold a name but never publish one on
  its own.** It records how the submitter registered and also marks persons
  and law firms under a lawyer's name (§12.14).
- **A stored name is held against today's classifier** before it is served:
  a record outlives the rules that wrote it.
- **A change to `privacy.ts` is validated by a corpus comparison, not by
  tests:** old against new over every list-142 row, every newly public name
  read by hand. Tests alone have missed real leaks (§12.14).
- **Above the fetch cap, the rows that are not organisations are not called
  „Privatpersonen":** 955 of the 3,459 person rows in GP XXVIII are
  non-public statements (§12.14).
- **Statement texts and covering letters are linked, never fetched or
  parsed.** Covering letters are mostly scans, and the readable ones name an
  official's personal service address (§12.16).
- **Page views are counted, visitors are not.** Daily sums per page class and
  referring host; no address, no hash, no cookie, no per-request line
  (§12.65). Fetches of the feed and the calendar are counted apart and
  never added to the page views: readers and calendar apps ask on a timer,
  and on the first day measured they were 89 of 186 requests (31.10.2026).
  `/statistik` shows every counted day. The oldest day file is
  left out of every figure: counting starts inside that day, so it is always
  cut short (a rule, not a date, so a copy drops its own). A referring host
  is shown only from five visits, summed over the whole history.

### Framing and what the page may claim

- **Nachverfolgung, not pillory.** Amendments after the Begutachtung are wins
  and are shown as prominently as standstill. No blame counters, no „ignored"
  rhetoric, no accusation badges.
- **Lists sort by participation, never by outcome.** Success and shelving get
  one colour; colour marks deadline urgency only. No computed „X Monate ohne
  Vorlage" column, no section that opens with failures only (§12.21, §12.28).
- **Rankings stay within one legislative period.** Across periods the list is
  a COVID monument that never changes (§12.21). At a period change the
  accountability sections fall back to the previous period as a whole and
  name it; open deadlines of the previous period are always carried over
  (§12.35, §12.36).
- **No change figure is read as the effect of a Stellungnahme.** The ME→RV
  change rate (~98 %) separates nothing. Where the Regierungsvorlage was
  tabled on or before the Frist, the page says so under „Eingebracht":
  temporal, not causal (§12.38).
- **How much a station changed is counted once, in its comparison.** The
  legend counts the units per kind, at every station alike. No share of the
  draft in the station frame and no bar against the period's range, as the
  Regierungsvorlage's frame had from 02.10. to 17.11.2026 („Umgeschrieben
  oder gestrichen"): the row repeated the legend for one station only, the
  middle half (46–77 % in XXVII) is too wide to place a single draft, and a
  share of three Paragraphen is no measurement. The measure stays in the
  corpus script (`ownChangeShare`, values under „The procedure").
- **A station frame holds what only it can say:** that the station was
  reached, when, and its documents. What the comparison under it shows is
  not repeated above it. The Regierungsvorlage's row „Begründung" went on
  17.11.2026 for that reason, with the count of changed Begründungen (in
  the frame and above the other comparisons): a number about the
  comparison answers no reader's question, which is asked at one Paragraph
  and answered there, where a changed Begründung opens. The frame's pointer
  to the Erläuterungen went with it; the credit line under the comparison
  links them. Before a row is added to a frame, ask whether the comparison
  could show it instead.
- **Copy about statements on a Regierungsvorlage says where they go** (the
  Klubs) and never what they achieve (§12.14). The ministry is not named
  since 15.11.2026: Parliament's general pages name it for every kind of
  item, its form on a Regierungsvorlage names the Klubs only
  (`docs/research/stellungnahmen-empfaenger.md`). The window
  lasts through the parliamentary procedure (§ 23b GOG-NR): for a law the
  Bundesrat does not object to, until its Beschluss. Whether it opens again
  after an Einspruch is not documented (14.11.2026).
- **„Bisher keine Regierungsvorlage" only when proven.** An unread chain, a
  missing `preconst` pointer or an exhausted fetch budget shows the weakest
  state the evidence supports. Silence can be repaired, a false accusation
  cannot (§12.21, §12.26, §12.28).
- **In a closed period where no draft links beyond the Begutachtung, absence
  is an archive gap, not a finding** (§12.27).
- **„Text unverändert beschlossen" needs a text list that says so**
  (14.11.2026). 306 records of GP XXVII, promulgated 2019 to early 2022,
  carry no list of text versions at all; read as an empty list, 226 pages
  said „unverändert", and three of three committee reports read said the
  committee had changed the text. No list is unknown (`amendedIn: null`):
  the draft's own copy of the list answers where it names a changed text,
  otherwise the page says „beschlossen" and nothing about the text. An
  Abänderungsantrag adopted in plenary still says „im Plenum geändert"
  (`docs/research/plenum-aenderung-ohne-textliste.md`).
- **„Noch nicht kundgemacht" needs one of two signals:** Parliament's own
  „Keine Kundmachung" stage, or no promulgation 120 days after the final
  decision — the Bundesrat's Beschluss; after an Einspruch the Nationalrat's
  Beharrungsbeschluss, or the Bundesrat's Beschluss on a changed text, and
  no count at all while the Einspruch is undecided (14.11.2026,
  `finalDecisionOf`).
  A successor is named only through Parliament's own link, never by title:
  every similarity threshold added pairs from different laws (§12.10,
  §12.21, §12.33).
- **Not „not promulgated" while time can still explain it.** For ordinances
  „pending" covers the first 180 days (§12.32).
- **Club votes:** „alle Klubs dafür", never „einstimmig"; no counts derived
  from seats, no per-party scorecard. The vote covers the whole law and never
  stands as a verdict on a § or a Stellungnahme (§12.34).
- **A failed source says so; it never renders as an empty result.** An empty
  answer names what was searched. „Nothing found" for something unchecked is
  the most expensive lie the product can tell. A failed fetch never counts
  as empty and refutes nothing (§12.13, §12.31, §12.58).
- **Pages without a parliamentary Gegenstand show no statement sections,**
  and the count cell says „nicht gezählt", never 0: nobody publishes who
  filed (§12.16, §12.28).
- **The Gegenstand half and the RIS half of the corpus are never pooled into
  one total** and never share a schema with invented empty fields (§12.19,
  §12.28).
- **Rankings order objects, never actors.** The framing rule binds tone,
  completeness and conclusion; it does not forbid saying who issued a draft.
  Ruled out are a figure that counts only failures, a ranking that invites
  „the worst", and a conclusion the data does not carry.
- **The length of a Frist is flagged only at both edges:** „Kurze Frist"
  under 21 days, „Volle Frist" from 42. Never a flag against the six-week
  norm alone: it would stand on most pages and work as a blame counter
  (`app/utils/deadlines.ts`, `fristClassOf`).
- **A number on the homepage and the same number on the page it links to
  agree.** Every change to a filter is checked against it.
- **An open Vorlage or motion without a draft stands under the tab of its
  own station** (16.11.2026, `OpenVorlage.station`, `stationFor` on list
  101's status), as a draft's row does: „Regierungsvorlage" while the
  Nationalrat has it, „Parlament" once it is decided, at the Bundesrat or
  sent back to committee. A motion (Ausschussantrag, Gesetzesantrag des
  Bundesrates, Initiativantrag) stands under „Parlament" from its Einlangen,
  as `/wege` draws its path („entfällt" at the Regierungsvorlage): the tab
  „Regierungsvorlage" holds the government's Vorlagen only
  (`openVorlageStationOf` by the kind, `antragStationOf`; 16.11.2026).
  Before that day every such row stood under „Regierungsvorlage" (365 d.B. XXVIII, sent back, stood at „Parlament" on
  its own page). The strip selects one station at most, and the address
  names one (`parseStations`, 16.11.2026, maintainer's decision): a link
  naming both tabs, shown as a sixth tab „A + B" and then as two tabs
  selected at once, was tried that day and removed — no control of the page
  can produce that state. The homepage's door „Stellung nehmen im Parlament"
  opens „Parlament / Landtag". Under „Stellungnahme
  möglich" each of the two tabs alone points to the other with the rows it holds
  under the same filters („1 weitere unter „Parlament / Landtag“ →",
  `otherOpenStation`), counted by the same steps as the list's own rows
  and left out while a part of the count is loading or failed, never
  „0 weitere". Between the open window and the law a Regierungsvorlage
  without a draft, an Ausschussantrag and a Gesetzesantrag aus dem
  Bundesrat are no row of any source (beschlossen, abgelehnt, verfallen);
  under „Regierungsvorlage" and „Parlament / Landtag" without „Stellungnahme
  möglich" one „Nicht im Monitor" sentence names them in one line
  (`withoutDraftGapDe`, 16.11.2026); the states it means and where the
  Initiativanträge stand are the list's „Methode" (`MethodEntwurfsliste`). 
- **The homepage: act first, then follow** (16.11.2026, `app/utils/doors.ts`).
  Four objects take part on their own rails (a draft, an Anliegen, an EU
  act, a Citizens' Initiative), so the page is not organised along one
  object's stations. „Jetzt mitreden" holds the doors, the ways of taking
  part open today (`/wege` made live): the first, „Stellung nehmen zu einem
  Entwurf", expanded into the open list; the others one row each, with what
  is open and a link to its list. A door's count stands only once its source
  answered: loading words while it is on its way, a gap sentence after a
  failure, „derzeit keine" in words for a true zero, and it is the number
  the linked list states, from the function that list counts with; where
  that list prints no single number for the set, the door says „Derzeit
  möglich" without a number (Stellung nehmen im Parlament: the list splits
  it by kind). The first door is a section head like the lists under
  „Was daraus wurde" (ink, „Alle N offenen Entwürfe →" its one way out);
  the other four are rows a step below it, the label blue and the whole row
  its target (one link stretched over the row, hover underlines the label),
  each ending in a blue „→" after its status, always shown.
  Each of the four rows is bounded by a hairline above and below, so each
  target shows where it begins and ends; no line above the first door
  (maintainer, 16.11.2026). „Was daraus
  wurde" holds the newest laws, then the ranking: what changes after every
  plenary week above what spans the whole period (maintainer, 17.11.2026). „Beschlossen, noch nicht
  kundgemacht" is on `/entwuerfe` only. Doors are data tagged with their
  jurisdiction (`WEGE_STATE`, `'eu'`), so a country's segment (`/at`) and a
  second country are configuration.

### Ohne Begutachtung

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
- **The rail out of that station says it in shape too, never alone:** pale =
  not walked (a known „ohne Begutachtung"), pale and dashed = not known
  („nicht feststellbar"), ink = walked; the words and a screen-reader word
  („nicht erreicht", „unbekannt") carry the fact.
- **Said once, as the first station of the card.** Pale (the rail's
  hollow, grey state, no warning colour) where none took place or none can
  be told; an ordinary station where one took place. Never a sentence above
  the card beside it.
- **Every law gets a page; no row links out.** A Land's law without a joined
  draft is a row of the Länder list by default, its page built from RIS; a
  law with a joined draft moves to the draft's page (301). The register's
  reach decides the wording, not whether a law is a row: before it a plain
  „Landesgesetz", counted under its own term and never added to „ohne
  zugeordneten Entwurf". The Bund's laws without a Ministerialentwurf stand
  in the default list too; „Ohne Entwurf" only narrows to them.
- **„Ohne Entwurf", whatever the sources (14.11.2026).** It holds at both
  levels (no Ministerialentwurf; no draft in Salzburg's register), and it
  never switches with the selection: „Ohne Ministerialentwurf" was false
  beside a Land, „Ohne Begutachtung" false for the Ausschussbegutachtung
  rows. The precise claim stays on the row. A chosen Land that cannot answer
  is named above the rows: under it its laws are not shown.
- **One select „Art", in the path graphic's words** (14.11.2026,
  `ART_CHOICES`): „Alle Arten"; „Mit Entwurf": Gesetzes-, Verordnungs-,
  Andere Entwürfe (the last only while the view holds one); „Ohne Entwurf":
  Alle ohne Entwurf, Regierungsvorlagen ohne Entwurf, Initiativanträge ohne
  Entwurf, Landesgesetze ohne zugeordneten Entwurf (the last only with a
  Land). The chip „Ohne Entwurf" went into it; „Gesetzesentwürfe" holds
  drafts only. The URL did not change: `art` + `begutachtung=ohne`, with
  `art=andere` and `begutachtung=ohne&art=landesgesetz` added; a mismatched
  pair drops. „Alle ohne Entwurf" keeps the chip's meaning (Bund and
  Salzburg's „ohne Begutachtung") and is therefore smaller than its group:
  the Landesgesetze option takes every Land's law the count line calls
  „ohne zugeordneten Entwurf", which claims nothing about a Begutachtung,
  and never a plain „Landesgesetz" before the register's reach (those are
  counted in a note). An option that cannot apply stands disabled and names
  its reason after its label in short words („– gerade nicht abrufbar"),
  since a greyed option without a word reads as a broken menu and a
  disabled option gives a screen reader no tooltip; a link that asks for it
  gets „Alle Arten" and one note naming the long reason. An
  option's availability is known before it is chosen: what the sources
  alone rule out (no Bund and no Salzburg, no Land, no Bund for „Andere")
  is disabled on the first render, server-side too; what only an answer
  can tell (the Bund's laws, else Salzburg's) is asked for under every
  option, the four draft options included, and stays enabled until the
  answer says otherwise — unknown is not unavailable. An answer the page
  will ask again for (`pending`, or `unread` while its retries last; for
  Salzburg statements still being read) is unknown too: the options stay
  enabled and the list says „noch geladen" under them; only the answer
  after the last retry disables. A Land's law whose „ohne Begutachtung"
  could not be read (`unread`, or `pending` after the last retry) is not
  dropped from the group's options in silence: the list counts it per Land
  in one „Gerade nicht abrufbar" sentence (`ohneUnreadCounts`). Under a draft option
  those answers are never shown, counted or announced, and the open
  Vorlagen, which decide nothing, are not fetched (`withoutDraftRequests`).
  „Alle mit Entwurf" (`begutachtung=mit`, first of „Mit Entwurf") is exactly
  its group's sum: every draft, no row without one; beside a draft kind the
  parameter drops. „Gesetzesentwürfe, als Initiativantrag eingebracht"
  (`art=als-antrag`, after „Gesetzesentwürfe") is not part of that sum but
  a subset of both: the Bund's Ministerialentwürfe whose row says „als
  Initiativantrag …" (`antragRouteCitation`, the row's own condition). It is
  the list's one filter on an inferred fact (the wording match of
  `antragPath.ts`, plus the stated successor of a Beschluss not promulgated),
  and its rows state the route themselves; outside the periods the table
  covers, or without the chains, it stands disabled with its reason, never
  as an empty list.
- **A Land law's changed laws come from RIS's consolidated Landesrecht,
  filtered by the Landesgesetzblatt** (`Kundmachungsorgannummer`), never from
  an Artikel heading or a title.
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
  is the place to read it.

### Joins

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
  because RIS publishes first; no one-sided extension occurred in a whole
  period; dates and ministry together are not unique. A
  change to a weight, a band or the title normalisation keeps the regression
  on both periods green (`tests/risJoin.test.ts`) or raises `RULE_VERSION`
  and regenerates `data/ris-me-map-gp27.json`, whose diff is read row by row:
  every changed RIS id is a claim.
- **The RIS Begut list is read whole or the shortfall is said** (18.11.2026).
  The list sorts by one column, the Frist end, and records that share a day
  stand in no fixed order between two page requests: where such a day
  straddles a page boundary, one record comes twice and another not at all.
  Deduping hid the repeat, and every rebuild lost a different handful: a
  draft missing from the list, or a Ministerialentwurf without its RIS
  record. A repeat is the sign. Its day is asked for whole
  (`InBegutachtungAm`, a few dozen records) and added; what then still
  falls short of RIS's own count is logged. `begutCollector`
  (`ris/risRecord.ts`) is the one implementation, for the server and the
  scripts. Rejected: a second pass in the other direction (47 more requests
  a day for a loss eleven repair it exactly) and sorting by another column
  (`Kurztitel` and `EinbringendeStelle` tie far more).
- **A draft without a RIS record is a state the page shows, not an error.**
  The twelve of GP XXVII are an upstream gap: the transport section of the
  BMK between March 2020 and April 2021, and two drafts of the BMEIA.
- **Where RIS and Parliament state different deadlines for the same draft,
  the draft stays matched and the difference is shown** (84/ME XXVII, 56/ME
  XXVIII: one month apart, start, ministry and title equal).
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
  across a chain: there is no exact key for a Verordnung, and the witness
  decides only among candidates the window, the Ressort and the threshold
  already admit.
- **A Länder § comparison runs only against a promulgation the Land itself
  names,** never against our own title search, even with one candidate: it
  fails when the right promulgation lies outside the window (§12.44).
- **„In 298 d.B. genannt": a draft Parliament links to no Vorlage, whose
  title the Erläuterungen of another draft's Vorlage name** (14.11.2026,
  `server/utils/parliament/namedInRv.ts`). Parliament's links are not the
  complete list of what became of a draft: a ministry can fold one draft
  into the Vorlage of another, which Parliament then links to that one
  only (44/ME XXVIII, the Kopftuchverbot, in 298 d.B., linked to 54/ME).
  A positive from a constructed join, so shown with the sentence that
  carries it and a link to the document. All six conditions or no state:
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
  Conditions 1–5 were the rule as decided; the corpus run accepted two
  wrong drafts under them (16/ME and 24/ME XXVI, below), and the sixth was
  added for them. A partially built index claims nothing; the draft then
  says what it said before. The state is its own: no § comparison, no
  Parlament or Bundesgesetzblatt station on the draft's bar (hollow, they
  read as still ahead of this draft while the Vorlage went on without it),
  and the base rates are not re-measured — they count Parliament's links,
  so 93/ME XXVII stands among the 57 drafts of GP XXVII without a Vorlage.

### Comparisons

- **Adjacent stations by default,** so every change can be attributed to one
  actor: ressort, committee, plenary (§12.18). No Plenarfassung→BGBl pair: no
  actor changes the text in between (§12.33).
- **Stations are recognised by a measured whitelist of exact document
  titles,** never by keyword (§12.18).
- **Each side of a comparison carries its own licence credit.** RIS documents
  are CC BY 4.0, parliamentary documents free works, the Ministerialentwurf
  carries no licence claim (§12.18).
- **Units are aligned by article and heading, never by § number alone.** In
  one chain the Regierungsvorlage inserted two paragraphs, and a comparison
  by number marked 41 of 45 merely shifted paragraphs as changed. The number
  stays out of the compared text, so a renumbered § compares as unchanged.
- **Every instruction line lands in exactly one unit** (19.11.2026,
  `lawUnits.ts`): „25a." keeps its letter, „10.1." stays in instruction 10,
  and a number that recurs is kept as `#dup`, never dropped. A dropped line
  is on neither side of a comparison and in neither the engine's applied nor
  its refused list: „25a." read as „25" lost 21 lines over 275
  Bundesgesetzblätter and 21 over 595 Parliament texts, and showed a kept
  line as „entfallen" (95/ME, 58/ME, 15/ME). The table-of-contents echo rule
  drops only a unit that holds no instruction. Gate: `pnpm harness:units`.
- **`#dup` is a key, never a designation** (19.11.2026). It marks a number the
  source gives twice under one law's key: printed twice („82." in the
  Waffengesetz), one law amended in two Artikel of one title, an old draft
  whose Artikel no reader splits. Pages print the number alone
  (`displayId`); the census counts the marks by cause and does not fail on
  them, since a gate would fail on the source's own numbering. Its class
  „ohne Nummer" is a reader fault, not a reading.
- **A schedule's designation is text on both readers, in a Novelle and in a
  law the draft enacts** (19.11.2026, `lawUnits.ts`): Parliament keeps
  `71Anlagenbez`, so the RIS reader keeps `<ueberschrift typ="anlage">` and
  the heading of that class right below it. Dropped on one side only, every
  „Anlage I (zu § 106)" read as removed from the last § (32/ME, 43/ME). The
  schedules still count as text of the last §; units of their own are open.
- **„Redaktionell" is decided by what changed, never by how much.** A change
  is editorial only if every inserted or removed piece is a citation, a
  number, a date, a single letter or punctuation; „und" → „oder" is not.
- **The comparison key may fold typography; the displayed text never does**
  (§12.33). A minus sign is not typography (19.11.2026, `isSign` in
  `server/utils/lawtext/normalize.ts`): a hyphen right before a number that
  opens the text, follows a space or a bracket stays in the key, so „-18 °C"
  against „18 °C" is a change; folded with the hyphens of „Covid-19" and
  „BT-06", it read „unverändert". Station, annex and fault-injection
  harnesses moved nothing. A dash standing free („- 18") still folds.
- **What the unit key forgives, the badge forgives** (19.11.2026,
  `spacingOnly` in `server/utils/diff/wordDiff.ts`): a removed and an
  inserted run that differ only in spaces and hyphens are no changed word for
  „redaktionell", except a separator between two digits („1 3" is not
  „13") and a minus sign. The runs stay shown as they are; folding them to `equal` would print
  the earlier spelling as agreed.
- **A changed text without a word diff says so and stands unmarked**
  (19.11.2026, `NO_WORD_DIFF_DE` in `app/utils/diffSides.ts`, `DiffBody`):
  „Nicht im Monitor: Texte dieser Länge …", never both versions marked as
  wholly changed. The § comparison computes the word diff past the matrix's
  ceiling (`beyondCeiling` in `server/utils/diff/wordDiff.ts`); every caller
  that decides on segments (oracle, guard, Lesefassung, annex rows, the
  Länder's guard) keeps the ceiling as a refusal.
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
- **Erläuterungen a side has not given us are said, above the comparison**
  (14.11.2026, `explanationsMissingNote`; in the frame's Begründung row
  until 17.11.2026), instead of the Begründungen going missing silently. Parliament's record proves only what it lists, so the sentence
  is „nicht gelesen" — „liegen nur als PDF vor" or „das Parlament führt sie
  nicht als eigenes Dokument" —, never „nicht veröffentlicht": a
  Regierungsvorlage may carry its Erläuterungen inside its one document.
  GP XXVIII: 13 compared drafts have such a side.
- **„Zu den Z 22 und 102 (…):" is a Ziffer heading** (`zuDenZiffern`): the
  plural form over a Ziffer list („Z …", „Art. 1 Z … sowie Art. 4 Z …")
  opens a passage like „Zu Z …", printed as typed; „Zu den §§ …", „Zu den
  Abs. …" and prose stay text. „Zu 15 (§ 6):" without „Z" stays text:
  whether 15 is a Ziffer the line does not say.
- **A „§§" list is read item by item** (`listedParagraphs` in
  `server/utils/explanations/risExplanations.ts`): a number followed by
  „Abs." or „samt" is a §, a bare number after an Absatz, Ziffer or litera
  is not („§§ 46 Abs. 2, 47 und 48" may be Absätze), and a list in quotes is
  the citation an instruction replaces, not what it amends.
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
- **A changed cross-reference is editorial only where this comparison itself
  paired the old and new number.** Never „no word changed" for a change we
  cannot explain (§12.33).
- **Later-station comparisons are cut to the draft's own laws only where
  Parliament's `preconst` says the Regierungsvorlage bundles other drafts,**
  never by package size (§12.33, §12.40).
- **The ministry's reasoning is attached to a § only where the law key is
  certain.** A wrong reasoning at a § is worse than none (§12.30). A passage
  the document sets under another law's Artikel is never taken, even where
  no second Artikel of the draft addresses the number: a Vorlage that
  bundles other drafts explains laws the comparison does not hold, and 53
  units of GP XXVIII were compared against partly another law's Begründung
  (`ofLaw`, `articleOn` in `server/utils/explanations/reasoningDiff.ts`). A
  heading that names several laws (an Artikel range, §§ of two acts by their
  abbreviations) counts for each of them. Beside the Textgegenüberstellung,
  where a passage stands at one law's §, a heading over several Artikel
  („Zu Art. 1 Z 20, Art. 2 Z 16 … (§ 70a ASVG; § 36 GSVG; …)") is discarded
  in a package: which of its §§ is whose cannot be read (`namesSeveralArticles`
  in `server/utils/explanations/explanationsJoin.ts`).
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
- **A bare „Zu Z 5:" under a heading titled by § alone is that §'s Ziffer,**
  not a Novellierungsanordnung's passage — only in a document every bare
  Ziffer heading of which stands in such a run (`ownedPassages`, 67/ME
  XXVIII; 145/ME XXVII heads its Ziffern „Zu Z 1:" and keeps them).
- **A change whose Begründung could not be attached says so, at the
  change,** wherever both documents carry Erläuterungen and the change
  stands on both sides — the Ziffer join, the § join, a new law's § by its
  own designation (`ReasoningDiffResponse.gaps`; outside the Ziffer join
  since 19.11.2026, when 134 of 1.808 paired changes of GP XXVIII stood
  silent). Without the line it looked like a change whose Begründung was
  found and left unchanged. Only a change the entry ceiling turned away
  keeps silent: its Begründung was found. The reason is given only
  where it is proven: „die Erläuterungen zählen die Ziffern anders" where
  one side's passage to the Ziffer is about another § (`misnumbered`; a §
  another change of the same law amends is another §, never a slip of the
  heading);
  „nicht gefunden" only where that document names neither the Ziffer nor one
  of the change's §§ in any „Zu …" line or passage heading (`namesChange`),
  and has no prose at the level of the change's Artikel — under its own
  Artikel heading, a range heading holding it (also where the reader folded
  it into a passage's text), or as the introduction above its passages
  (`explainsLawWhole`: 96/ME XXVIII explains the EStG's § 105a
  in one block under „Zu Art. 7 (…)"; 226/ME XXVII's introduction says the
  Novelle „im Übrigen" adjusts the Geschlechterbezeichnungen). Outside the
  Ziffer join a new law's § is looked up by its own designation, a document
  that titles by neither Ziffer nor § proves nothing, and a passage on the
  other side whose words this side has under another number withholds the
  reason too (`provesAbsence`: 49/ME XXVIII heads its Inkrafttreten „Zu § 10:").
  Otherwise the line is „Begründung: nicht zuzuordnen." with no reason: an
  unproven „nicht gefunden" would have been false on most such changes.
  An inserted or removed change (20.11.2026) gets the line only where the
  one document it stands in proves the absence — „in der
  Regierungsvorlage nicht gefunden" at an inserted one, „im Entwurf nicht
  gefunden" at a removed one; 15 changes of GP XXVIII, silent before. Not
  „nicht zuzuordnen." at the 857 others: its own document mostly explains
  such a change, and there was only nothing to hold that against. The §
  join reads a § inside an Artikel of the law („In Artikel II § 9 …"),
  which the § name does not (`addressedParagraph(line, 'join')`): the
  typed reading gave „§ 9" for „Art. II § 9 Abs. 3 entfällt." already, and
  75/ME XXVIII's „In Artikel II § 9 entfällt der dritte Absatz.", refused by
  the engine since 19.11.2026, had lost its Begründung.
- **The reasoning comparison runs only ME → RV, and only where both sides
  give a reasoning.** „Unchanged" means the same words in the same order; no
  percentage threshold. Both sides are read with the same parser (§12.10b).
- **An inferred station shows how it was inferred.** „Became law as an
  Initiativantrag" is our conclusion from text overlap, so the Antrag and the
  overlap share stand with it; the claim is about timing, never cause
  (§12.10).
- **Dead-draft copy says „selten", never „nicht mehr möglich":** a draft can
  still get its Regierungsvorlage in the next period (§12.10).
- **The § comparison reads the draft's text from Parliament's HTML first and
  the RIS XML only where that is missing.** Parser symmetry: Regierungsvorlage,
  Ausschuss and Plenum exist only as Parliament HTML, and a draft read from
  XML against a Vorlage read from HTML yields differences the format made
  (§12.33). This is the reverse of the Textgegenüberstellung, which reads RIS
  first for the licence; this order does not move either while the licence
  question is open (`readDraftUnits` in `server/utils/diff/lawDiffService.ts`).
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
  and on its draft's (`treatyComparisonGapDe`: 79/ME XXVI showed both
  Ziffern as „entfallen"). Nor is its Vorlage: the draft's comparison with
  it says the gap is the monitor's, not that Parliament published no
  Gesetzestext (15.11.2026, `missingStationReason`). After a changed text
  following the Bundesrat's Einspruch, Parliament's steps say that they end
  at the first Beschluss (`OBJECTION_STEPS_NOTE_DE`); the whole-way comparison reads the
  promulgated text.

### The consolidated reading (Lesefassung) and the annex

- **A § of our own consolidated text is shown only where the engine did not
  refuse, the result is plausible, and the ressort's own Textgegenüberstellung
  confirms it.** A wrongly applied instruction publishes a law text that does
  not exist, the worst error this tool can make; and a missing refusal says
  nothing about correctness (§12.12).
- **The annex confirms text, it never supplies it.** It is the ministry's
  reading aid; 10–13 % of its proposed versions differ from the draft itself
  (§12.12).
- **Refusing beats coverage.** An instruction is never applied in part; every
  target is resolved before any is written (§12.12).
- **An unmarked `erltext` block behind an Absatz of the standing law is
  that Absatz's closing part** (19.11.2026), the shape RIS's newer converter
  gives the same sentences (`<schlussteil ebene="0">`). Skipped, binding
  sentences were missing from oracle-confirmed Lesefassungen (UStG § 21,
  BUAG § 13d): an annex row's „…" leaves no check a word to miss. RIS's
  apparatus stays out: italics, „Anm", footnotes, the footnote rule and the
  italic blocks behind a numbered note, a note split over two blocks, and a
  line that heads the next numbered Absatz (`lawtext/konsTree.ts`).
- **A new unit's text prints every number its line announces** (19.11.2026),
  for appended and inserted Absätze, Ziffern, Literae and §§; more printed
  than announced passes. An unmarked unit never takes the announced number
  of its place: over the corpus it was a misread dash item or continuation
  seven times in ten. A sub-unit anchored only to a whole § („Nach § 18c …
  Abs. 1a") is refused, since a § need not list its units in order
  (`kons/lawApply.ts`).
- **A unit deletion is carried out only where every noun its verb governs
  belongs to the address** (19.11.2026): a designation the target carries,
  the sentence or heading the address read, a place word's noun, and what
  follows „samt/einschließlich". Any other noun names a part of the unit
  („die Zeilen betreffend …", „die Überschrift", „der dritte Absatz"), and
  the line is refused rather than carried out on the whole unit, which the
  consolidation would then report as repealed. Fail-closed: an unseen noun
  is refused, never read (`partStruck` in `kons/novao.ts`). The same holds
  for the subject in front of the verb where no „wird/werden" stands
  (20.11.2026, `partBeforeVerb`): there every word must be the address's —
  an opening article or preposition, designator and designation, „in der
  Fassung … BGBl. …", a title in brackets that names no number, the
  sentence or heading word the address read, a division's words only for a
  division, or a division named with its §§ („Der 2. Abschnitt mit den §§ 5,
  6 und 7"), whose §§ go as the line says. Census over the 2,447 whole-unit
  deletions of the 1,973 cached legistic XML files: 44 were carried out on a
  unit the line did not name whole — „Anhang III Teil B Tabelle 2 entfällt"
  on Anhang III, „§ 33 Tarifpost 8 entfällt" on § 33, „Die Überschrift vor
  § 25 entfällt" on § 25, „In Abschnitt D des Teiles 2 der Anlage zu § 2
  entfallen die Z 4 bis 30" on Ziffern the Anlage numbers once per
  Abschnitt. Refused, at a cost of six lines whose net effect was right
  („Die Überschrift vor § 20 und § 20 entfallen", which also deleted § 20
  twice).
- **„jeweils" in front of the sentence gives it to every address**
  (20.11.2026): „In § 14 Abs. 2, … und § 135 Abs. 1 entfällt jeweils der
  letzte Satz", „In § 15 Abs. 5 und § 16 Abs. 6 lautet jeweils der zweite
  Satz:". The list is cut at its commas and the sentence stood in the last
  address only; the others were whole Absätze, deleted until 19.11.2026 and
  refused since. Only where „jeweils" governs the sentence phrase: in „In
  § 5 Abs. 1 und § 7 Abs. 2 erster Satz wird jeweils das Wort …" the
  sentence is the last address's own (`spreadSentence` in `kons/novao.ts`).
  One replacement text then stands in each sentence; several sentences
  without „jeweils" stay refused.
- **„Angefügt" is the unit's end; a sentence the clause before named is the
  place only behind the end mark that clause replaced** (19.11.2026). After
  that sentence's deletion the new one goes to the end; after a change
  inside it, and for „an Stelle des N. Satzes … angefügt", the line is
  refused: the words do not settle the place (`parseInstruction` in
  `kons/novao.ts`).
- **New text the payload parser could not read as a unit is not appended,
  and neither is a picture** (19.11.2026). A line left as a heading below
  the § („c. Telefonnummer", a lone „42.") is read by no renderer and no
  check; a picture's file path would stand as law text. Both refused, as a
  table is (`kons/lawApply.ts`).
- **„Nach der Z 3 folgender Satz angefügt" closes the list** (19.11.2026):
  the text goes behind the unit named, into the unit above it, as its
  Schlussteil, and only behind the list's last unit with no Schlussteil
  yet. A Schlussteil closes Ziffern or Literae, never Absätze
  (`behindListItem` in `kons/novao.ts`, `kons/lawApply.ts`).
- **New §§ announced „samt Überschrift(en)" are inserted only where the
  first one carries a heading** (19.11.2026); one heading may stand over
  several §§ (StPO §§ 115f to 115l), so not each. A heading of a division
  („vierter Teil samt Überschrift") does not count (`announcesHeading`).
- **Silence is not „unchanged".** Every list of shown §§ carries its balance
  („gezeigt N von M"). A refused § stays in the denominator, and our own load
  ceilings are named as ours, never as an engine refusal (§12.12a).
- **„Confirmed" is a finding, never the default,** and unchecked is not
  checked-and-wrong. Withheld text is emptied on the server (§12.13).
- **Real states answer, outages throw.** A timeout is never cached as a fact
  about a draft („no annex", „law not found") (§12.12a, §12.13).
- **Only firmly matched RIS records show an annex.** A weak match is the one
  error the RIS check cannot catch: another draft's annex quotes current law
  just as faithfully (§12.13).
- **Licence decides the source order, not completeness.** The
  Textgegenüberstellung is read from RIS (CC BY) first; Parliament's copy is
  a fallback that makes no CC-BY claim (§12.13).
- **The annex is held against the law as of the first day of the
  Begutachtung,** not today's (§12.13). A law's previous version is never
  derived from the promulgation date: amendments apply retroactively
  (§12.12).
- **Safe directions.** A wrong address is worse than none. A lost
  confirmation is better than a false one. A dropped PDF page is a hole the
  reader is told about, a misread page is undetectable, so the page is
  rejected. Half a name is worse than no name (§12.11, §12.13).
- **Parser vocabulary grows only from lines measured in the corpus,** never
  on suspicion (§12.12). BGBl citations never lose their Teil: 84/2001 is a
  different law in Teil I and Teil III (§12.11).
- **The drift baseline is compared for equality, moves in the same commit as
  the change that moves it, and is never rewritten by CI,** because a
  self-updating baseline absorbs the drift it exists to catch (§12.13).
- **An omission the annex makes without „…" is read as one only where the
  standing § proves it:** both columns jump from the same unit to the same
  later one (or a cell that opens the § starts at a later unit), and the
  standing § carries exactly the units the two numbers count between them.
  Anything else stays a stretch held whole. A unit missing from RIS that the
  annex skips silently cannot be told from one repealed long ago; fault
  class „Lücke-beide" measures that blind spot and is not held to the 95 %
  floor. Accepted as a blind spot, not a gap to close: closing it would need
  a third source for the units of a § that no upstream offers. A drop of the
  class below its 3 of 16 is still worth reading.
- **The oracle's comparison form drops a bare „3." as a Ziffer's marker only
  where nothing before it says it is a figure** (19.11.2026): kept are a
  date's day, a citation's number, an ordinal after an article or possessive
  („das 18. Lebensjahr", „dem 2. Hauptstück"; „1." excepted, since a list
  can open after the article its items share), four-digit numbers and an
  Official Journal page („S. 1."). Rules read only the words before the
  number: the annex prints markers that RIS's text does not, so whatever
  follows differs between the two sides of one sentence.
- **The heading a changed row opens the § with is held where the result
  begins, never found just anywhere** (19.11.2026): at the start, or after
  the part of a wrapped heading the row does not print, as the standing text
  places it. A heading stack is dropped only where the remainder opens the
  result, and a stretch that carries a § symbol and text after it is never
  „a group heading alone". Found anywhere, a heading or a remainder was
  found in the body, and the words in front of it went unchecked.
  **Nor is a § heading passed over as a stack** (19.11.2026): a group
  heading first in a cell is read for the § heading in its tail, which has
  to open the result where the geltende column carries one there; and check
  2 drops a prefix as a stack only where it is shaped like a group heading
  (unit, numbering, capitals, a title's tail in brackets) or the geltende
  column prints a stack over the § too. A plain prefix over a § that had
  none is the heading the draft adds (BBG 2027-2028 § 61: „Vollziehung",
  refused by the engine, confirmed by the oracle).
- **Check 2 reads the changed rows of a § in the annex's order** (19.11.2026):
  each row from where the one above ended, so two Ziffern swapped across
  rows (the table path prints one per row) are a contradiction, reported as
  text standing „an anderer Stelle".
- **What stands in front of an omission mark is law unless it can only be
  the omission's label** (19.11.2026, `withoutHead` in
  `server/utils/annex/elision.ts`). A chain behind text of the stretch's
  own is the label only where a head can start: after a finished sentence,
  at a bare marker behind prose, at a range whose first number has no dot,
  or as the §'s designation behind its heading. Taken off from any space,
  „gemäß §§ 3 Abs. 2 Z 1 bis 6 und 4 … Z 1 und 2. (2) …" lost the citation
  the draft changes, and the oracle could not see whether the engine
  changed it.
- **A heading the draft does not mark as one never replaces the law's own**
  (19.11.2026, `parsePayload` and `GUESSED_HEADINGS` in
  `server/utils/kons/lawApply.ts`). RIS marks a printed § heading
  (`ueberschrift typ="para"`); a bare first line is a guess, and a lead-in
  that ends in a colon or a lower-case word is text. Without „samt
  Überschrift", a guess that would overrule the standing heading is
  refused. Heading and body read as one string to the oracle's checks 1 to
  3, so a moved boundary between them read right: BilDokG 2020 § 26
  (14/ME XXVIII) stood on the page as confirmed with its lead-in printed as
  the heading.
- **The Prüfstand holds the designations as well as the words**
  (19.11.2026, `markerSequence` in `scripts/harness/kons.ts`). „identisch"
  compares `plainText`, which carries no „(2)", „3." or „b)"; the page
  shows them. A confirmed § whose designations differ from the RIS text is
  to stay at 0.
- **A struck Absatz is looked for where the LCS could equally have put its
  deletion, and by its marker** (19.11.2026): check 4 reads a pure deletion
  inside a printed stretch at the stretch's edge where its struck words end
  or begin with the words between it and that edge, and check 5 contradicts
  a result that still holds an Absatz the geltende column prints with its
  words and no proposed column prints or chains over. The LCS takes the
  first equal words it meets, so a struck Absatz that opens like the next
  one landed inside the stretch, and BVergGVS § 30 was confirmed with the
  Abs. 8 the annex strikes (`keptDeletion`, `absatzOrderBroken`).
- **Every change the engine made has to stand in the annex where it made
  it** (19.11.2026, check 3 in place, `unplacedChange`): each changed word
  inside a four-word window of the annex, each run tied at one side to the
  unchanged words beside it or to the edge of a printed stretch, read under
  both tie-breaks of the LCS. Asked only whether a word stands anywhere in
  the annex, „der", „und" or a „jeweils" carried into one Absatz too many
  passed, and 14/ME BilDokG § 26 came out confirmed with a heading made of
  the lead-in „Mit der Vollziehung dieses Bundesgesetzes ist". A change the
  annex leaves out (TDBG § 40b: „1. bis 6. …" where the draft changes Z 6)
  costs a correct confirmation; the oracle does not vouch for what the
  ministry does not print.
- **A repeal is a result like any other, and the annex can contradict it**
  (19.11.2026). A unit the engine's result no longer carries is `entfaellt`
  only where the annex strikes it, says it goes („(entfällt)", „Ersatzlos
  gestrichen") or has no rows for it; where the annex shows it still
  standing, it is `anhang-widerspricht`. The page prints no line at a
  repeal, so a wrong one stood silent beside annex rows that kept the unit
  (`annexKeepsUnit` in `kons/consolidate.ts`; Prüfstand check
  `entfällt-stehend`).
- **The Lesefassung's only load ceiling is the § budget** (19.11.2026).
  `nicht-geladen` says „mehr Paragraphen, als wir für eine Seite laden",
  so it may stand only where the draft's §§ exceed the budget; a ceiling of
  40 laws withheld 139 §§ of 116/ME XXVIII under that sentence while 289
  §§ fit. Prüfstand check `obergrenze`.
- **A schedule is keyed by its own number, a Roman one in Arabic**
  (19.11.2026): „Anhang XIV" is „Anl. 14" on the engine's side and the
  page's, because RIS files every schedule so; a letter or an unreadable
  numeral keeps a key of its own. The bare „Anl." means a law's only
  schedule, and the page gives it to a numbered block only where the annex
  prints one schedule for that law. Read as the first number anywhere, all
  Roman schedules of a law shared one outcome (58/ME XXVIII: one at eleven
  Anhänge) (`shared/utils/scheduleNumber.ts`).
- **One outcome stands at one block** (19.11.2026): where a unit is printed
  as two blocks (a table of contents with § symbols, a schedule in two
  parts), at the one that prints most of it, the later on a tie; the other
  says nothing, not even „nicht gefunden" (`placeAtParagraphs`; Prüfstand
  check `doppelt`).
- **A § of the Lesefassung names the annex law it was checked against, in a
  single Novelle too** (19.11.2026), so the page files it under that law's
  group; with no law, 144/ME XXVIII's BSFG §§ stood under „Gesetzestext"
  after the group of the law the draft enacts (`annexLawOf` in
  `kons/consolidate.ts`). Two law ends that meet at one group are merged,
  never one set over the other: 25 §§ in five drafts vanished from the page
  that way.
- **A § the annex shows as repealed is shown so only where the draft repeals
  it** (19.11.2026, `server/utils/annex/repeals.ts`): an instruction of the
  same law that deletes the § itself, a list or range naming it, or a whole
  division RIS files it under. Otherwise the § is withheld
  (`repealUnproven`), whatever the left check said. An empty right column is
  also what a reading leaves where it missed the § there (a quoted „„§ 1.",
  an annex printing instructions, a renumbering paired by its old number);
  the left check confirms such a § because its left column is the law in
  force. A draft that could not be read disarms the rule, as it does rule 2.
- **A § one column of a PDF annex prints twice is never paired by length**
  (19.11.2026, `unitsOfColumn` in `server/utils/annex/annexPdf.ts`): a
  print is dropped only as a contents entry, a print carrying no provision,
  or a word-for-word repeat; a later print that re-opens the § at an
  Absatz past the last one printed is joined to it in printed order; any
  other second print (a variant, staged versions, another law's § of the
  same number) makes the row `ambiguous`, and the gate withholds the §
  (`repeated`). Keeping the longest print dropped the rest without a word:
  FPRG 2021 § 3 was confirmed without its new Abs. 12. No § opens on a line
  the line above runs on into („… gemäß" over „§ 19b."); that citation
  split a § and hid its end.
- **On the table path a withheld § names our filing too** (19.11.2026,
  `annexNotes.ts`): the cells are the ressort's, but the § a row belongs to
  is ours where it opens none. A designation typed as text — in the
  `typ="para"` heading, or at the head of both columns — opens its § like a
  `<gldsym>` (`typedDesignation` in `comparisonRows.ts`); unread, SchOG
  §§ 6, 21c and 40 were withheld for rows of §§ 8, 35, 37, 39 and 45.
- **What a PDF annex prints before a law's first § is said where the
  columns differ in it** (19.11.2026, `frontMatterDiffers`): the parse
  leaves it out by method — Langtitel, Promulgationsklausel, and sometimes
  a provision without a § (the Versorgungssicherungsgesetz's Art. I,
  „2026" → „2036"). Compared word by word, chrome that cannot be law text
  left out, a difference puts „Nicht im Monitor: …" at the law. Showing it
  as a row was rejected: an annex that prints amending instructions in the
  right column would diff an old § against an instruction. About one flag
  in five is a trivial difference (a title fragment, a reprinted contents
  line); the sentence stays true there. A part set otherwise that yields
  no row counts its pages as unread (`droppedPages`).
- **What the instruments cannot prove:** the annex oracle and fault injection
  do not show the output is free of error. Only the BGBl test bench (RIS
  after entry into force) has ground truth (§12.12c).

### Measuring

- **Every measurement calls the shipped function, never a copy,** and code in
  a harness that passes judgement is tested like production code (§12.12a).
- **Print the requested corpus beside the corpus actually reached;** a shrunk
  corpus looks like a full one (§12.12).
- **An engine change is measured over the 60 Bundesgesetzblätter the
  documented figures stand on,** not over a shorter run (18.11.2026). The
  change of 14.11. to enumerations marked „(neu)" was measured with
  `--discover=40`, where no class moved; the range „Die §§ 7 bis 9 (neu) …
  werden ersetzt" stands in the 48th of the 60, and eleven §§ of the
  IVS-Gesetz that matched the RIS were refused for four days unseen.
- **A bench line promises nothing it does not check** (19.11.2026,
  `scripts/harness/kons.ts`). „unverändert gelassen — ungefährlich, wird
  verweigert" was printed over 189 §§, and 28 were not refused: among them
  five whose only line `segmentUnits` had dropped, and two that no refusal
  holds back while they are not the law. The class is split by why the §
  stood still, a § is scored under its own number („Art. 1 § 3" is § 3,
  not 1), and the unrefused block sums to its denominator.
- **Before a parser change, compare old against new over the whole corpus and
  read every item that moves.** Zeros measured on tuning data are in-sample.
- **The § comparison is held by `scripts/harness/station.ts`** (19.11.2026):
  reconstruction, completeness, a visible change and the own heading must
  hold for every pair (exit 1 on a breach); the last parliamentary text
  against the Kundmachung and one draft read as HTML and as XML are null
  comparisons, and every residue that is not editorial carries its reason in
  `scripts/harness/stationBaseline.json`. A residue there is a line to
  explain or fix, never an accepted one.
- **Report per-draft figures (median, share of drafts)** over pooled
  percentages, which a few large laws dominate (§12.12).
- **Figures about windows, claims and joins are measured on a production
  build with cold caches** (`pnpm build`, then the built server), never on
  the dev server: its derived cache keeps entries from before a code change,
  and the RIS stock grows between two runs, so two such figures can
  contradict each other.

### Länder

- **Precision before coverage.** A § of a Land's Textgegenüberstellung is
  shown only where RIS confirms its current wording on the document's date
  (≥ 0.98 word match) or the § is new; the rest is withheld and counted
  (§12.45, §12.52). The match runs both ways for a § printed unchanged and
  without omissions: it must also hold every word of RIS's law text, from
  its first to its last, numbers and citations included (`cutShort`,
  `risLawText`, 19.11.2026), or a § cut short in both columns reads
  „unverändert". A share floor (0.9) saw only cuts near a §'s middle: it
  passed half of the lost last sentences and nearly every lost last line,
  first line or single number. RIS's notes, fields and headings are not its
  law text, nor is the § designation Wien's records lead the first Absatz
  with (`<gldsym>`). Not seen: a § printed with omissions, the § heading, and a new
  text lost only where it differs, so that both columns read as the old.
  An omission is read as the Land prints it: Salzburg
  marks an unchanged Absatz or Ziffer by its bare designation („(1) (2) …",
  „1. 2. …"), read as „…" for Salzburg only, and only where the next
  designation follows or a pair ends the § (14.11.2026).
- **A Land's Textgegenüberstellung confirms text, it never supplies it**
  (12.11.2026), as the Bund's annex. A § it shows as changed or new is held
  against the draft's own Gesetzestext with the Bund's thresholds,
  unchanged; where part of its new text is not in the draft it is withheld,
  said as the monitor's own finding. Below the word floor nothing is said. A
  draft that could not be read disarms the rule, and the answer is not
  stored. Kärnten is not asked: its right column is the Novelle's
  instructions. Extraction noise is answered in the reader, never by
  loosening thresholds.
- **The draft reader drops only real division headings:** a Roman numeral
  in capitals with a capitalised title, never one the next word declines
  („des I. Teiles") or counts („I. Dienstklasse"), and never a line opening
  „lit.".
- **A bare „§ 8." after a line that runs on is the sentence's end, not a
  §** (19.11.2026, `RUNS_ON_RE` in `landTgu.ts`, in the draft reader and the
  Textgegenüberstellung reader alike):
  a citation the column wrapped („… gemäß" / „§ 8.") split the § it stands
  in. No test of the number's order: a contents list echoed before the law
  numbers below the § before it too.
- **A bare number is a page's own only at the page's edge** (19.11.2026,
  `pageLines` in `draftPdfLaw.ts`): a table value on a line of its own is
  law text, and dropped it read as inserted against the Landesgesetzblatt.
  Salzburg's running head is known by its path or its save stamp, each line
  on its own, so a head wrapped onto two lines is no law text either.
- **A sub-instruction of any depth or form is part of its instruction, on
  both sides** (19.11.2026, `SUB_INSTRUCTION` in `draftPdfLaw.ts`, used by
  `lgblUnits`): „15.1.1.", „26a.1.", „18.1a.", „2.1 Abs", „19.1.Nach". The
  §§ such a sub-instruction names before its quoted wording are instructed
  (`subInstructionHeads`). An ordinal division after the number is an
  address, not a sub-instruction: „2. 3.Teil Z 16 lautet:" is instruction 2.
- **A § of a law the Landesgesetzblatt enacts anew is named in a sentence
  true of it** (19.11.2026, `enactedUnread` in `landLawChangesService.ts`):
  where RIS holds it in no single version whose text the monitor reads, it
  is listed — never as „eine Anweisung nennt ihn", and never dropped.
- **„Entfallen" only where the draft says so.** An empty right column can be
  text the reader missed (§12.52).
- **A document a Land files as the draft but that is not one is not read as
  the draft;** the page says so (§12.63). Among several candidates the
  content decides, not the title: where the first holds no law text, the
  first of the next that does is the draft (at most eight read, a failed
  read fails the choice); where none does, the first stays (14.11.2026).
- **Landtag motions name the party only where the committee report does;**
  members named there are never named (§12.61). In Land submitter data only
  unambiguous organisation and authority abbreviations are expanded (§12.64).
- **The list filters by a time span; the Bund's GP names it** (14.11.2026).
  The Länder have periods of their own, so a Land's draft falls into the
  span in which its Begutachtung began, both ends inclusive (`gpWindow`,
  `readLaenderInWindow`). The select „Zeitraum" states the dates („seit
  24.10.2024 (GP XXVIII)", `gpSpanLabelDe`) instead of a note explaining
  the rule; value and `?gp=` stay the GP code. Not per-Land period
  selectors: ten controls for one question, and spans that compare with
  nothing. A Land's own periods are offered where one Land is in view alone
  (next rule); their dates are verified since 14.11.2026
  (`docs/research/landtagsperioden.md`).
- **Which spans the select offers follows the sources; one control, one
  calendar** (14.11.2026, `shared/utils/periodCalendar.ts`). The Bund among
  the sources, alone or with Länder: the Bund's periods as above. Exactly one
  Land and no Bund: that Land's own Landtag periods, named as the Land names
  them („seit … (17. Gesetzgebungsperiode)"), each from the constituent
  sitting to the day before the next, the newest open-ended; then the Bund's
  spans its calendar does not reach back to. Several Länder and no Bund: the
  Bund's spans by their dates alone — no period name, since none is theirs.
  A Land whose calendar is empty, or does not reach back to the span, gets
  the third case: that is the permanent behaviour for an unverified Land, not
  a stub. A date enters the calendar only with two agreeing sources
  (`docs/research/landtagsperioden.md`); the server's window, the labels and
  the tests read the same rows, the tests on fixture calendars. URL: `?gp=`
  stays the value of every Bund span, dates-only included; a Land period is
  `?landtag=sbg-17` (Land code, ordinal), read in either case and checked
  against the calendar. Each applies only in its view; a value the sources do
  not offer is dropped — from the URL too — and the list falls to the running
  span of the calendar in view, never an error card and never a filter the
  control no longer shows. The Länder endpoints take `landtag` in place of
  `gp` (400 malformed or both, 404 not in the calendar); the Bund's are never
  asked with it. The chip: „GP XXVIII", „17. GP Salzburg", or the compact
  dates. The EU overview, the corpus measurements, the Bund's laws and open
  Vorlagen stay on the Bund's period.
- **A span of the reader's own is one more value of the same select**
  (18.11.2026, `customSpanOf`). „Eigener Zeitraum …" turns the select's own
  box into the span as text, the select folded to its chevron beside it; a
  press opens a calendar in the site's own face (`DateRangeButton`). An
  open end reads „heute" and stays open.
  `?von=2026-11-09&bis=2026-11-15`, `bis` optional (open-ended): a link a
  team shares so everybody reviews the same rows, week by week. While it is
  set it is the span: no `gp` or `landtag` in the link beside it, and
  choosing a period drops it. Every half is still fetched per Bund period —
  the one the span lies in — and the page cuts each row set where the
  search term cuts it, so counts and pointer count the list. A row falls in
  by the day the order dates it by (`rowDay`): a draft by the start of its
  Begutachtung (Einlangen, RIS's Beginn, a Land's `landDraftDate`), a law
  without a draft by its Kundmachung. A row without a day falls in no span.
  A span over a Periodenwechsel shows its part in the later period and
  names the earlier part with a link („Nicht im Monitor"). The full text
  does not run under it: its hits know no date. Ends written the wrong way
  round are turned round; a `bis` without `von` is dropped. It opens on the
  running calendar week, from Monday. No day after today: every day a list
  cuts by lies in the past, so the calendar ends with today, a link's later
  `bis` becomes the open end and a later `von` no span (`orderedRange`).
  Today itself stays a fixed end, so a shared link keeps its days.
  Every list with a „Zeitraum" offers it and draws it through one component
  (`SpanSelect`, the Periodenwechsel note `SpanCutNote`): /entwuerfe and
  /anliegen. On /anliegen a row falls in by the day it arrived (`arrivedAt`)
  and the count line says „eingelangt"; the calendar starts with
  `ANLIEGEN_FIRST_LIST_GP`, and a link's earlier start moves there. The tab
  „Petitionen an den Bundesrat" is cut by the reader's days unclipped, since
  the Bundesrat has no period.
- **Upstream blocks are respected, not circumvented:** one request per second
  and a two-hour pause after a 403 at Steiermark's firewall; EUR-Lex's bot
  check is not bypassed, only the Cellar is queried (§12.64, §12.66).
- **A `robots.txt` that excludes everything is a question to the publisher,
  not a block** (15.11.2026). Tirol's Landtagsevidenz (`lte.tirol.gv.at`)
  answers `User-agent: *` / `Disallow: /`; the monitor keeps reading it at
  its usual pace and asks the Landtag. The file is a convention, not a
  licence term. Where it carries legal weight is the reservation against
  text and data mining (§ 42h Abs. 6 UrhG), and what is read there is
  Landtag material, taken to be free official works (§ 7 UrhG); statement
  texts, where a reservation would bite, are linked and never fetched. Not
  settled: the database right (§ 76c ff. UrhG). A fetch for a page view is
  arguably no robot, the prewarm and the scheduled list reads are. A
  publisher that says no, or a block, ends the reading, and the page then
  says „nicht abrufbar" with the reason. A new source whose `robots.txt`
  excludes programs is asked before it ships.

### EU law and federal law carried out by the Länder

The code names the EU rules D1 to D7; this is where they are defined
(§12.66).

- **D1. The EU fact appears only as a positive finding** (transposes,
  accompanies, goes beyond). A statement on every draft would be noise.
- **D2. With contradicting Vorblätter** it appears only where all agree or
  the law text names the act.
- **D3. Deadlines only for directives.** Of several dates the latest is the
  deadline.
- **D4. A deadline only for an act that is new to Austrian law.** „Already
  transposed" means a provision in force transposes the act, not merely
  mentions it. **D4a.** A base act cited „in der Fassung" of an amendment
  carries no deadline.
- **D5. The Erläuterungen decide whether a draft transposes EU law only
  where there is no Vorblatt, and never which act.** Sentences about other
  texts are no signal.
- **D6. Two dates side by side, no verdict:** no „late", no day count, no
  colour, no countdown. The monitor cannot see whether a directive was
  transposed elsewhere, and „overdue" without a possible „on time" is a
  failure counter. No lateness rate either: it would rest on the latest
  named directive.
- **D7. Act names come from the Cellar,** not from a lookup table of short
  names.
- **From EUR-Lex only metadata (CC0) is taken;** acts are linked, the logo is
  never used (§12.66).
- **Bund → Land is keyed by the promulgation (BGBl. I), not the
  Ministerialentwurf.** Drafts are counted, never Länder; „0 Länder" is never
  shown, and unread Länder are not „without" (§12.67).
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
- **A reader change that alters a stored finding bumps its reader version in
  the same commit,** or the disk store keeps stale facts (§12.66, §12.67).
- **The header navigation is the door to `/eu-recht`** (14.11.2026). The
  homepage's window onto the map („EU-Recht in der Begutachtung") and the
  list's link to it (`EuMapLink`) are gone; the list's filter „Setzt
  EU-Recht um" stays — it combines with the other filters, it is no door.
- **`/eu-recht`'s five lists open with five rows and step by ten**
  (16.11.2026, `EU_OVERVIEW_LIST_INITIAL`): the page is an overview of
  lists, so each opens short and all are in reach.
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
    und Rat", the Council alone → „Rat" (measured: all 27 such acts, under
    four procedure types), the Commission → no such station and no
    „Vorschlag", with the sentence that the Cellar records no procedure
    between the institutions for it.
  - **Only steps on the allowlist are shown** (`shared/utils/euEvents.ts`,
    31 of the 85 types on the map's dossiers, old and new vocabulary), under
    the Cellar's own German label. Every other step is counted on the page,
    never taken for „did not happen".
  - **The proposal's day is the document's own** (`work_date_document`),
    which the Legislative Observatory also gives; the Cellar's adoption step
    is dated a day later in the sample.
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
    Rejected: the drafts' section first, against the rail's order. Rejected: one section „Das Verfahren"
    for two stations, and outbound links in the rail.
  - **The directives a country has to transpose are listed from the
    Cellar, not from drafts** (15.11.2026): every directive with a
    transposition date within two years of today, by deadline, also where
    nobody works on it; each has a page. Beside it stand two observations
    from two sources — the drafts the monitor found, the measures the
    Member State notified to the Commission — each in its own sentence
    and each with its own „unknown" (null, never 0). A notified measure is
    the Member State's claim, so the word is „gemeldet"; nothing says
    „umgesetzt", „offen" or „überfällig", no colour, no count or order by
    what is missing (rule D6): the columns „Entwürfe" and „Gemeldet" do not
    sort. The deadline (in the tab's direction) and the directive's name
    do, each reversible (16.11.2026, `EU_UMSETZUNG_SORT_COLUMNS`, a test
    holds the two columns out). The Commission's delegated and
    implementing directives stay behind a chip that is off and says how
    many they are.
  - **The Commission's portal „Ihre Meinung zählt" is read narrowly and
    gently** (15.11.2026): its interface is undocumented. Two addresses —
    the search by COM number, as a quoted phrase, and one initiative —
    one request at a time, 2.5 s apart, no retry, only when an act's page
    asks, cached a day. The list of contributions is asked only when the
    block „Wer Rückmeldung gegeben hat" nears the reader's viewport (step 4,
    below). The
    parser takes a fixed list of fields; the officials' names, mail
    addresses and telephone numbers in the portal's record reach no
    cache, no API answer and no page, and only what was parsed is cached.
    An initiative belongs to a proposal only when one of its publications
    carries exactly the COM number. „Not found in the portal", „older
    than the portal", „no number to search by" and „not read" are four
    sentences, and none says „keine Konsultation". Rejected: the prewarm
    of every act of the map.
  - **Who gave feedback on the Commission's portal: organisations named,
    persons counted** (15.11.2026, step 4, rule decided by the maintainer;
    `server/utils/eu/portalFeedback.ts`, `namedOrganisationOf`). A row of
    `allFeedback` names an organisation only if it is `PUBLISHED`, its
    kind is one of the eight organisation kinds (`EU_CITIZEN`,
    `NON_EU_CITIZEN`, `OTHER` and any unknown kind are counted, never
    named), it carries a non-empty organisation name, and two witnesses
    hold: a structural one — the size is SMALL, MEDIUM or LARGE, or the row
    carries a Transparency Register number — and a name witness — no word
    of three letters or more of the sender's first name or surname (case
    and accents ignored) is a word of the organisation's name. In doubt a
    sender is a person: any missing or odd field is counted. Measured on
    15.11.2026: 934 distinct organisation names from 26 windows (1,500
    rows) read by hand; 8 of them carried a person's name, all 8 MICRO —
    sole traders carry their own name as the business name. The rule names
    88 % of the organisation rows. `server/utils/parliament/privacy.ts` is
    not the witness here and is not touched: built for Austrian submitter
    lines, it called 62 % of these international names a person and
    missed 3 of the 8 real cases.
    - **The name must be a name, and only its head is shown.** The reading
      through the built reader (15.11.2026: 27 windows in full, 4,537
      rows, 2,078 distinct names shown, each read by hand) found three
      the first rule let through: a field that held an identity number
      instead of a name, and two that named a person in a sentence after
      the name („… Contact: <name>", „…; <name> … is the co-author"), on
      rows without a sender's name to compare with. Therefore: a field
      with a number of five or more digits or an e-mail address is
      counted; the name is cut at the first „;", at a web address and at
      „Contact:" and its like; and a head of more than 120 characters is a
      description, counted (13 of the 2,078). What remains possible is a
      person named inside the head in a form no test knows. Any change to
      `namedOrganisationOf` is followed by the same reading: every name
      the rule newly shows, by hand.
    - **WITHINFO and ANONYMOUS rows are named alike.** For an organisation
      the portal's own form publishes the organisation's details, its name
      included, either way; „anonymous" withholds the contact person's
      name. That person's name is read only for the name witness, inside
      the one function, and never copied into a result, a log, an error or
      a cache. The plan's earlier line (ANONYMOUS shows no organisation)
      is revised.
    - **The text arrives and is dropped at the parser** (plan, decision
      9): the contribution's text, its attachments, the login and the
      names are not in the parsed row, which has a fixed list of fields; a
      test feeds all of them and finds none in the output. Each listed
      contribution links its own page on the portal
      (`…/initiatives/<initiative>/F<number>_de`, `contributionPageUrl`),
      where the text is read. „Statement texts are linked, never fetched or
      parsed" stays as it is for Parliament.
    - **Names in memory only, six hours** (`FEEDBACK_NAMES_TTL_S`, the
      derived mount, memory in dev and production): consent to
      publication can be withdrawn after a window closed, so no name may
      outlive a restart or reach the disk or the fact store. The API answer
      says `Cache-Control: no-store` for the same reason.
    - **On approach, the newest 1,000; more on request, up to 5,000**
      (plan, decision 10; steps since 16.11.2026, 1,000 instead of 500
      since the same day, `EU_FEEDBACK_AUTO_PAGES`): the block „Wer
      Rückmeldung gegeben hat" under each feedback period with
      contributions (`EuFeedbackBlock`) reads by itself up to ten pages of
      100, newest first, through the portal's pacer, once, when it comes
      near the viewport (`useNearViewportSection`) — never with the page;
      each window's block asks on its own. The automatic reading is 1,000
      and not unlimited because requests to the portal and time scale with
      the window — 2.5 s a page, so 50,000 contributions would be 500
      requests — and the largest windows are campaigns of persons, who are
      only counted. An open block, not a fold, since 16.11.2026, as the
      Stellungnahmen stand on a draft page; the loading line holds its
      place, and a failed read shows the gap sentence with „Erneut
      versuchen". Where the portal counts more, the list's first row says
      „Gelesen sind die neuesten 1.000 von 1.099 Rückmeldungen." beside a
      button „Weitere 99 lesen" (what remains, at most „Weitere 500
      lesen"; neutral outline like „Weitere 10 anzeigen", not blue). A
      press asks for the next step of five pages (`?seiten=15`, 20, … 50),
      so the portal is asked only when a reader wants the answer; a higher
      fixed limit was rejected for that reason. While the step is read a
      progress line stands in the button's place and the list stays usable;
      the step's reading is swapped in under the reader's tab, chip,
      search, order and paged rows, and the block's live region says its
      arrival once. A failed step keeps the list and says „Gerade nicht
      abrufbar" with „Erneut versuchen" for that step. At fifty pages (5,000
      rows) with more counted, a „Nicht im Monitor" sentence says how many of
      how many and that the monitor reads no more for one window; no button.
      The row stands first in the list box, above the tabs (`ListBox`'s
      `frame` slot): a step changes the tabs' counts as well as the rows and
      the closing rows, and what a control changes stands at it or below it.
      The endpoint answers only for a publication that is a window of the
      initiative named, so it is no proxy for arbitrary numbers, and only
      for a step that is a multiple of five pages from 5 to 50 (any other is
      a 400).
    - **Page one first, no page twice** (16.11.2026, `feedbackOf`,
      `feedbackStageOf`, `nextAutomaticStep`): a read of 500 took about
      12 s, and the rows a reader sees first are page one's anyway (newest
      first, ten a page). So the block asks for page one first
      (`?teil=erste` on the one route, state `teilweise`, or `gelesen`
      where page one is the whole list or the first step is cached), then
      for the first step (`?seiten=5`) and, where more are counted, the
      second (`?seiten=10`) — two requests from the client, because one
      request reads at most five pages (below); a window of 480 or exactly
      500 asks no second step. Page one is cached in memory apart
      (`eu-portal-rueckmeldungen-erste`, after the naming rule, six hours)
      and the first step starts from it, so a window costs the portal one
      request a page (one more where the list moved meanwhile, below); a
      request in flight is shared, and every step's six hours count from
      page one's read. Until the automatic reading is complete, the list
      shows the named rows read so far newest first and the pager, and
      nothing that counts, filters or orders — no tabs, chip, search,
      order, set line or closing rows: over part of the reading they would
      be wrong and would change under the reader's eyes without their
      doing. The first step's rows are swapped in under the pager, and the
      live region says the arrival once, at the end. A line with the
      spinner stands in the tool row's place; where an automatic step
      fails, a „Gerade nicht abrufbar" sentence with „Erneut versuchen" for
      that step alone, the rows kept and the controls still hidden — no
      count stands over a reading that stopped short. When the automatic
      reading is complete the controls appear and the rows already paged
      to stay.
    - **Each step from the step before, five requests at most**
      (16.11.2026, `readFeedbackStep`, `feedbackOf`): every step is cached
      apart under its number of pages (`eu-portal-rueckmeldungen`, key
      `…-s10|f4`, memory, six hours from page one's read) and starts from
      the step before it — the first one from page one — asking only for
      the pages it lacks, never one twice, at most five per request, so a
      step fits the endpoint's 30 s at the pacer's 2.5 s. Where the step
      before is gone (six hours past, a restart, or the memory's LRU let it
      go), the step begins again at page one and holds what five requests
      reach; the block offers the next step from there. Catching up in one
      request was rejected: it would break the 30 s and the five requests.
      A window's steps run one after the other (`serial`), so a step's
      look-up of the one before never meets it half computed.
    - **Rows that move between reads** (16.11.2026, `readOlder`,
      `readNewer`). The list is newest first, so a contribution arriving
      between two reads pushes every row down by one, and the next page
      would repeat a row already read; a counted row keeps no number and no
      day (and must not), so a repeat cannot be recognised afterwards. The
      guard is the portal's count (`totalElements`), the only field of the
      answer that says the list moved (`totalPages`, `numberOfElements`,
      `first`, `last` follow from it; no answer carries a time or a
      version): the progress keeps the count at page one's read (the
      anchor) and at the latest read. Grown by k since the anchor, the next
      row stands k further down: the first rows of its page are repeats and
      are skipped, after being compared one by one with the rows read last
      (a named row by its number, a counted row by kind, status and
      country). A count lower than at the read before, a skip that does
      not fall on the page, a repeat that does not match, or a named row
      already read among the kept ones is a misfit: the step reads again
      from page one, once, within its five requests; a second misfit is
      „Gerade nicht abrufbar". Once the run is read to its end, the rows
      that arrived since are taken from the head of a fresh page one and
      the anchor moves there, so „read" can reach „total". The same rule
      holds inside the first reading. What it cannot see: a contribution
      withdrawn below the last row read while another arrives, between two
      reads — the count stays, and a counted row at the seam is counted
      twice (a named row is caught by its number). `total` on the page is
      the latest count.
    - **One row per contribution, as a list of the Stellungnahmen**
      (maintainer, 15.11.2026; `EuFeedbackPanel`, words in
      `app/utils/euFeedback.ts`). A named organisation's contribution is a
      row: date · name (the link to the contribution on the portal) · kind
      · country (its German name from the runtime's CLDR data,
      `countryNameOf`; the monitor keeps only the ISO alpha-3 → alpha-2
      map). An organisation that answered twice stands twice —
      rows are never merged. The list is the Stellungnahmen panel's
      grammar, built from its parts: the kinds as tabs with their counts
      (every kind with a row read, its unnamed included, and the citizens;
      „Alle" first where there are two tabs or more or „Sonstige" or rows
      not published), the search over the names above twenty rows, ten rows
      a page with „Alle N", the order by date (newest first, the portal's
      own; a row without a date last either way), by name (German
      collation) or by Land (the German name, then newest first; a row
      without a country last either way), each reversible. No order by a count, nothing „most active", and no
      figure stands for what a contribution achieved. The tabs count the
      kinds' whole; the chip below them counts within the chosen kind —
      what a control changes stands below it.
    - **A counted row keeps no date, no number and no link.** Persons
      (`EU_CITIZEN`, `NON_EU_CITIZEN`), „Sonstige" (`OTHER` and unknown
      kinds), organisations counted without a name and rows the portal
      does not list as published are never named rows (since 16.11.2026
      they are the list's closing rows, below).
      The parser builds two shapes: a named row keeps its day and number,
      a counted row only its kind, whether it is published and its
      country — so it cannot carry them by mistake, and a test feeds both
      with a day and a number and finds neither on a counted one. Per
      country only counts are kept (the citizens per country).
    - **What is counted closes the list** (16.11.2026, replacing the block
      „Ohne Namen gezählt" under it). One muted row per figure, no link, no
      day, no country: a kind's organisations without a name under its
      tab and in „Alle" („13 weitere Nichtregierungsorganisationen · ohne
      Namen"), citizens, „Sonstige" and rows not published in „Alle" only.
      They stand after the last named row and appear once every named row
      of the tab is shown, as the Stellungnahmen reach their rows without a
      name by paging; the pager counts named rows. Under the chip or a
      search they are hidden — nothing in them can match — and the set line
      counts named rows only. The tabs add up to the rows read. The citizens
      have a tab of one row per country, by count by default; „Alle" holds
      them as one row. Under the list „Methode" alone, opening who is
      counted without a name (`MethodEuRueckmeldungen`); the line
      „Privatpersonen werden gezählt, nie genannt." beside it went on
      18.11.2026 as over-explaining: the rows without a name show it, and
      the method's lead line says it.
    - **The data knows no country, the view takes one.** The reading and
      the endpoint carry no member state (no parameter, nothing in the
      cache key); the view takes the country the page serves, today the
      configured one (`EU_MEMBER_STATE`), as `euBuergerinitiativeView`
      does. With it the list offers a chip „Aus <Land>" with its count
      within the tab above it (in the citizens' tab, that country's row);
      with none (null) there is no chip and nothing is said to be missing.
    - **Search, filter and order reach only what was read.** The newest
      1,000 rows are read first, so where more are counted the list's first
      row says how many of how many, above the tabs and the search — before
      a reader takes an empty result for an absent organisation — and
      offers the next 500; at 5,000 it says so in a „Nicht im Monitor"
      sentence.
    - **The set line only while narrowed** (maintainer, 16.11.2026,
      `feedbackSetLineVisible`). „4 Rückmeldungen von Organisationen mit
      Namen" above the column header repeated, unfiltered, what the tabs,
      the closing rows and the pager say. It stands visibly only while a
      search or the country chip narrows the list — then it is the result's
      count, the zero included — and where no organisation is named at all
      („Keine Organisation mit Namen unter den gelesenen Rückmeldungen."),
      since the box would hold no word else. A tab alone is no narrowing:
      its count stands on it. Otherwise the line is `sr-only`, still the
      polite live region a screen reader hears on a change of tab, chip or
      query; it mounts anew per reading, so a further step's new count is
      not said a second time beside the block's one arrival sentence. The
      phone's order stays in the tool row, which the set line never held.
    - Rejected: naming every row of an organisation kind (sole traders),
      the Parliament classifier as witness, keeping names in the fact store
      for closed windows, and (15.11.2026) one line per organisation with
      its countries and number of contributions: it merged contributions
      the reader wants to open one by one.
  - **The windows open on the portal are listed first on `/eu-recht`**
    (15.11.2026, step 3, `EuFensterList`): one request a day for the list,
    one row per window by closing day, tabs by where in the process
    („Konsultation", „Vorschlag", „Entwurf eines Rechtsakts"). No count of
    contributions in the list and no order by a count; the count stands on an initiative's own page, per
    window. The reader may order by closing day (the default, a window
    without a day last either way) or by title, each reversible
    (16.11.2026); „Stadium" and „Vorgesehen" do not order — the tabs divide
    by them. A portal that could not be read is said with the link to the
    portal, never an empty list. No feed and no calendar of the windows:
    decided 16.11.2026, the first version of the EU pages has none, it is a
    ticket of its own (`?quelle=eu` is an unknown source, 404, as any
    other). An initiative has a page by the
    portal's number (`euInitiativePath`); its door is the way to the portal
    while a window is open, and the stations after the Commission say in a
    „Nicht im Monitor" sentence that the monitor does not follow it there
    yet.
  - **An EU page is a detail page** (15.11.2026, rebased onto „The detail
    pages" the same day; that section's rules hold, they are not restated
    here). The act's, the proposal's, the initiative's and the Citizens'
    Initiative's page open with the one state card (`ProcedureCard`), the
    EU rail passed as its rail (`EuRail`) and the default way out; what
    stood under the rail of the EU card of its own (`EuProcedureCard`,
    deleted) — the note on an act of the Commission, the gap sentence on a
    step of the register the monitor does not know — is the card's footer.
    The heading says the stand alone („Sondierung läuft", „Vorschlag liegt
    vor", „Anhängig laut EUR-Lex"); what it rests on stands in the rail.
    The act's page follows since 16.11.2026: „Umsetzungsfrist läuft",
    „Umsetzungsfrist beendet", „Gilt", „In Kraft, gilt noch nicht" — no
    day in the heading, which „Umzusetzen bis 07.05.2027" carried; the day
    stands at the last station. „Beendet", not „abgelaufen": no word that
    reads as a verdict on the transposition (rule D6).
    The list of open windows uses the draft list's box for an open Frist,
    word for word and tone for tone.
  - **An EU page's action is a draft's door** (15.11.2026,
    `EuWindowAction` through `DraftDoorCard`), unchanged: its heading the
    countdown and date („Noch 56 Tage · bis So., 10.01.2027"), its ground
    the tone a Stellungnahme's door takes when the Frist is close; a window
    without a last day keeps its own heading. Rule D6 forbids a day count
    beside a transposition deadline, where it would read as a verdict on a
    state; a window the reader can still use is the reader's own deadline,
    and there the count is the point. **No body sentence where the button
    says it:** the Commission's door has none (the heading says the day,
    the button the portal), and a Citizens' Initiative's has none either
    (16.11.2026: „Der Link führt zum Sammelsystem der Initiative." said
    what the button and its arrow say). **Above the button, the
    Commission's own sentence for the open stage** (`SourceQuote`,
    `app/utils/euFeedbackQuote.ts`), signed „Europäische Kommission",
    verbatim from the portal's German page text
    (`page.initiativeDetails.<stage>.feedbackmessage`, read 15.11.2026):
    Sondierung, öffentliche Konsultation, Entwurf eines Rechtsakts, and the
    adoption's sentence only for feedback on a legislative proposal. No
    quote for any other stage or adoption, and where several windows close
    on the door's day, only what the Commission says of all of them: the
    Sondierung's sentence is the first of the public consultation's, so
    that pair quotes it (16.11.2026); sentences that share no such opening
    give no quote (which window the door is for is then not clear). A Citizens' Initiative's door quotes the three
    sentences under the heading of the Commission's German home page for
    the instrument (`EU_ECI_QUOTE`, read 16.11.2026): what a million
    signatures bring, and that the Commission then decides. **The door stands twice**
    (`EuRailSection.door`, set by the view): once more, solid, with the
    card's label, at the end of the section that holds the window the door
    counts down to — „Konsultation", or the Commission's own station
    („Vorschlag", „Rechtsakt der Kommission") for feedback on a proposal or
    a draft act; „Sammlung" for a Citizens' Initiative — under „Wer
    Rückmeldung gegeben hat", where the decision is made; only while the
    card shows and has a button. Two windows on that day in two sections:
    the later one, where the reading ends.
  - **A station ahead has no section** (15.11.2026, `euVorschlag.ts`,
    `euInitiative.ts`). As on a draft's page, an EU page shows a section
    only for a station that is reached. A station ahead stands in the
    rail, hollow, and the first one carries the one line there is to say:
    what the record holds, where the proposal's page continues, or that
    the monitor does not follow the initiative further. A station that
    has not happened is not a gap. The exception is an answer that did not
    come: then nobody knows whether the station is reached, and its
    section stays with „Gerade nicht abrufbar".
  - **A withdrawn proposal ends on a station „Zurückgezogen"**
    (15.11.2026): the withdrawal has a day and ends the procedure, so it
    is the rail's last station, after whatever Parliament and Council
    still decided, and it carries the highlight. „Amtsblatt" and the last
    station are not drawn: a hollow station means „still to come", and
    these never come. The rule „a section per station, even while empty"
    is for stations a later step fills. Where a proposal became acts, the
    last station is reached and says that its content stands with the
    acts. Visitors read „EUR-Lex", not „Cellar", in every sentence of the
    proposal's page; the source credit keeps the Cellar's full name.
  - **The European Citizens' Initiative is an object of its own, with a
    rail of its own** (15.11.2026, step 5, decision 4 of the plan;
    `server/utils/eu/eciRegister.ts`, `eciService.ts`,
    `app/utils/euBuergerinitiative.ts`). No field of the register joins an
    initiative to a legal act, so it is no station of an act and its page
    links none. Address `/eu-recht/buergerinitiative/<year>/<nr>` by the
    register number (ECI(2022)000002 → `/2022/2`); a padded number answers
    301. The register (`register.eci.ec.europa.eu`) is read through a
    pacer of its own, one request at a time, 2.5 s apart, no retry, each
    answer cached a day and served stale a second day.
    - **The rail comes from the register's `progress`,** an unordered list
      whose active entry equals the status. Measured over 28 initiatives:
      REGISTERED 28, ONGOING 18, COLLECTION_START_DATE 14, CLOSED 10
      (COLLECTION_EARLY_CLOSURE on 2), VERIFICATION 7, SUBMITTED 5,
      ANSWERED 4, WITHDRAWN 3, INSUFFICIENT_SUPPORT 3,
      INSUFFICIENT_SUPPORT_AFTER_VERIFICATION 2 — ten names; a day was
      missing on 3 of 94 entries. Stations: „Registrierung", „Sammlung"
      (begun with ONGOING, CLOSED or any later step), „Prüfung"
      (VERIFICATION), „Einreichung" (SUBMITTED), „Antwort der Kommission"
      (ANSWERED or an answer); a later step implies the earlier ones. An
      initiative that ended otherwise ends on a highlighted station of its
      own with the register's day, and the stations it can never reach are
      not drawn: „Zurückgezogen" (WITHDRAWN), „Nicht genug Unterstützungen"
      (both INSUFFICIENT statuses), worded „laut Register", no judgement.
      The card's heading is the state: „Registriert", „Sammlung läuft",
      „Sammlung beendet", „In Prüfung", „Eingereicht", „Von der Kommission
      beantwortet", „Zurückgezogen", „Nicht genug Unterstützungen laut
      Register". A step name outside the ten is no station; a „Nicht im
      Monitor" sentence under the rail names it, and nothing throws.
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
      Stricter than the plan, which named „title and objectives".
    - **No threshold.** The register gives the total and the count per
      Member State, never how many a Member State needs nor whether that
      number is reached. The reader keeps the count of every country the
      register lists and knows no country itself; the page shows the total
      and the number of the country it serves (`EU_MEMBER_STATE_ECI`, the
      view's `memberState`; a page that serves no country shows none) and
      says once, in a „Nicht im
      Monitor" sentence, that it shows no threshold. Rejected: computing the
      thresholds from the regulation's annex — a second source with its own
      upkeep, and a „reached" mark would read as a verdict.
    - **The list „Jetzt unterstützbar" opens by the last day of the
      collection, soonest first, then by number** — the open windows' rule.
      Since 16.11.2026 the reader may also order by title or by supporters
      (most first), each reversible, a row without a day or count last
      either way: the draft list lets its Stellungnahmen column order its
      rows, and the count column here is its twin. The list never opens on
      the supporters' order, which would read as a ranking of what is worth
      signing. The register's count stands in a column of its own,
      „Unterstützungen", as the draft list keeps its Stellungnahmen
      (`EuCountCell`, 16.11.2026; the acts' drafts on `/eu-recht` too), „laut
      Register" in the frame row and the cell's words, a missing count the
      word „nicht angegeben", never 0. The
      list carries no deadline, so the details of each initiative in
      collection are read one after the other (about 45 s cold for 13); the
      endpoint waits 8 s for them after the list, and a row without its day
      stays, with a „Gerade nicht abrufbar" sentence, never dropped.
    - **The register's public page of an initiative** (`eciPageUrl`,
      `…/initiatives/details/<year>/<6 digits>_de`) was opened in a browser
      on 15.11.2026 for one initiative and resolves. An unknown number
      answered 404 through the built endpoint the same day.
    - The deadlines are NOT in `/feed.xml` or `/kalender.ics`: decided
      16.11.2026, the first version of the EU pages has no feed and no
      calendar; that is a ticket of its own.
  - **The stand of a proposal: which Cellar flags decide** (15.11.2026,
    step 3, `shared/utils/euVorschlag.ts`, `server/utils/eu/cellarVorschlag.ts`).
    A proposal that left the Commission has a page by its COM number
    (`euProposalPath`). Its dossier carries three flags — pending,
    withdrawn, adopted — that contradict each other in one dossier since
    2019, so no flag decides alone: „Rechtsakt geworden" needs the adopted
    flag AND an act the dossier produced; „Zurückgezogen" needs the
    Commission's dated step `WDW_byCOM` (50 of 52 withdrawn dossiers of
    2019–2024 carry it), and its day stands at the station, not in the
    card's heading, which names a state; the withdrawn flag alone gives
    „Laut EUR-Lex zurückgezogen", without a day; the pending flag alone
    gives „Anhängig laut EUR-Lex" with the day of the last recorded step,
    never „seit N Tagen" (rule D6). Missing or contradicting flags claim
    no stand, and the page says the Cellar gives no clear one. The
    Cellar's field „file-status" is NOT read: PENDING on 22 of the 52
    withdrawn dossiers, ADOPTED on 6 pending ones. Rejected: reading the
    pending flag as „still open" on its own. The page's absence sentences
    are about the record („der Cellar verzeichnet bisher keinen
    Beschluss"), not the world. One act with a page in the monitor: the
    proposal's address answers 301 there; several: the page stays and
    links each. An initiative's page links the page of each proposal one
    of its publications carries and points its later stations there; it
    never redirects, as an initiative can hold several proposals.
  - **The Legislative Observatory is linked by rule, not by lookup:**
    procedures from 1994 on, of type COD, CNS or APP; the link says that the
    page is English, and it is built from the procedure number, never
    fetched. Three procedures the Observatory split into files „A" and
    „B" answer 404 under the plain number the Cellar carries; for their
    four acts `OBSERVATORY_FILE` names the file. Rejected: asking the
    European Parliament's API, which knows the files but not the act a
    file ended in.
  - **The rail adds nothing to the map's build.** One Cellar query per act,
    asked when the act's page is, beside the Amtsblatt reference and cached
    a month like it. No prewarm line, no stored file.
  - **Every EU address is built by `euPath`** (`shared/utils/eu.ts`) below
    one base, `/eu-recht` until the rename moves the acts to `/eu`.

### Routes to a norm, and what the monitor follows

Settled on 14.11.2026; the facts are in
`docs/research/wege-zu-einer-rechtsnorm.md`, whose last section
(„Einschätzung") gives the order to build in. A session that builds a route
not yet followed, or the EU cycle, starts there.

- **One page of ways per jurisdiction** (16.11.2026). The EU is a
  jurisdiction of its own, as for its object pages, so a country's ways and
  the EU's are two pages, and a second country gets a page of its own
  instead of sharing one with Austria. The country's page stays at `/wege`
  (Bund, Länder, Anliegen an das Parlament; of „Nicht im Monitor" the
  Volksbefragung and the Länder's instruments); the EU's stands at
  `euWegePath()`, `/eu-recht/wege` until step 6 moves it to `/eu/wege` with
  every other EU address (EU-Rechtsakt, Europäische Bürgerinitiative; the
  Petition an das Europäische Parlament). Both are „Wege der Gesetzgebung";
  the H1 adds where („in Österreich", from `EU_MEMBER_STATE_NAME_DE`; „in der
  EU"), so the place never becomes part of the name. The EU's lede is its
  own: an act walks to „Geltung" or „Umsetzung", and a Citizens' Initiative
  is no text that comes to apply. One component draws both (`WegeView`)
  from one object per page (`WegePage` in `app/utils/wege.ts`); every
  matrix, seam and instrument carries its jurisdiction, and each page's
  legend names only the marks it draws. A third jurisdiction is an id, an
  address in `WEGE_PATH_OF`, its words in `WEGE_PAGE_COPY`, its rows tagged,
  and a page file of three lines.
- **The seam is a link in both directions, where a law crosses**
  (16.11.2026), never a generic „see also". On the EU's page the
  directive's note „Umsetzung durch Bund oder Land" is itself the link to
  the country's page, beside „Entwürfe, die EU-Recht umsetzen"; the header
  „Umsetzung oder Geltung" carries none, as „Geltung" does not cross. On
  the country's page one line of the card, „EU-Recht" with „EU-Richtlinie,
  EU-Verordnung", opens the page — it enters the Bund's and the
  Länder's paths alike, so it belongs to neither matrix; a directive exists
  before the draft that carries it out, so the page reads EU, Bund, Länder,
  and mirrors the EU's page, which ends with the link here — and links the
  EU's page and the list of drafts that carry out EU law (`WEG_SEAMS`). It
  is a group of the card, not a paragraph above it. `?weg=` selects a row
  only on the page that holds it (`wegSelected`); `wegHref` leads each id to
  its page, and the EU object pages' state cards lead to the EU's page with
  their row where their kind is read (`euWegFor`). An old `/wege?weg=eu-…`
  selects nothing: no code ever wrote one.
- **The graphic shows every route that exists, the monitor follows
  fewer.** A route that is not followed stands in the graphic as „nicht im
  Monitor" with its reason. Since 16.11.2026 every followed object has a
  matrix of its own with the stations of its own rail, names and order read
  from the rail's code (`WEG_MATRICES`, `WegMatrix`), each on its
  jurisdiction's page: the national norm
  (Bund and Länder a matrix each, the same five stations, the last two
  named „Parlament" and „Bundesgesetzblatt" or „Landtag" and
  „Landesgesetzblatt" in the header, so no sentence translates one), an
  EU act (Konsultation · Vorschlag · Parlament und Rat · Amtsblatt ·
  Umsetzung oder Geltung), a European Citizens' Initiative, an Anliegen an
  das Parlament (the Nationalrat's three kinds and the Petition an den
  Bundesrat, whose rail names its last column „Bundesrat"; four columns,
  since the committee's Erledigung is part of the committee's row); one card, one
  legend, the blue mark wherever one can take part, each row naming how
  („Rückmeldung möglich"). The matrices read as
  one grid (16.11.2026): the first column is „Weg" in each, a bar carries
  its name and no sentence, and the station columns have one width in
  every matrix, so all marks stand in five verticals. A header that does
  not fit breaks between words or at a compound's joint
  („Regierungs-vorlage", `wegHeaderLabel`), never where the browser
  guesses, and stands on the bottom line, next to its marks. Five columns
  are what these rails have, not a rule: a rail with four or six stations
  gets four or six. The pages are „Wege der Gesetzgebung" (16.11.2026; „Der
  Weg eines Entwurfs" named two of the then six blocks) and each runs: how
  a text becomes law (Bund, Länder; an EU act), how people start something
  themselves (Anliegen; the Citizens' Initiative), then what is not
  followed. Until 16.11.2026 one page held both jurisdictions, Austria
  before the EU within each part. Table or rails is the card's question, not the
  window's (a container query at 50rem, 16.11.2026): the table stays while
  the card holds the five station columns and 200 px for the paths. Only the instruments
  the monitor does not follow are a list without stations, „Nicht im
  Monitor", each with its reason.
- **A link on a page of ways shows what its words name, and a mark means one
  thing** (16.11.2026, after opening every link and reading every cell).
  A row's link leads to its kind: where hardly one of a kind is open on a
  given day (Volksbegehren, Petition an den Bundesrat) to the list without
  „Nur offene", never to an empty one; „Richtlinie" to the directives
  Austria has to transpose, and the open feedback windows stand behind the
  two EU stations that carry them. An Ausschussbegutachtung is „je nach
  Fall" at Begutachtung at both levels, never a dash beside a note that
  names it and never in the Landtag's column. The legend names every mark,
  the dash too. A blue mark links to where that can be done now
  (16.11.2026, `wegCellHref`): the list of exactly the row's kind at that
  station with „Stellungnahme möglich" on, written by the list's own query
  helpers; the Anliegen list of the kind with its open default; the EU's
  open windows or Citizens' Initiatives. Its name says where it leads
  („Stellungnahme möglich: Ausschussantrag, Parlament – offene anzeigen",
  `wegCellLinkName`); on the rails the mark's word is the link. A mark
  whose kind no view holds open there gets no link, its reason at the row
  (`openSkip`): „als Initiativantrag" (the route is known only once
  kundgemacht), the Ausschussantrag (a row under its own option only where
  „ohne Entwurf" is evidenced, never before its law), the Bundesrat's motion
  (no option of its own). Not changed: the header „Parlament" of the Bund leads to
  the list's tab, which is empty on days when nothing is between Beschluss
  and Kundmachung.
- **Each thing stands once among the pages of ways** (15./16.11.2026). What is a route to
  a norm is a row, and only a row: a Volksbegehren in the Bund or a Land, an
  initiative of Gemeinden or citizens, and the Volksabstimmung, which sits
  between the Beschluss and the Kundmachung — a row with no column of its
  own (no sixth station), its note saying where it falls, its Kundmachung
  „je nach Fall". The list „Nicht im Monitor" keeps what has no path to a
  norm or no source: the EP petition (no interface, and the portal refuses
  programs), the Volksbefragung (one so far, bound to no law), and the
  Länder's Volksbefragung, petitions and Bürgerrat. A reason says what was
  found; „Quellen nicht geprüft" stands only where nobody has read them.
- **A route is followed only when three things hold:** an official,
  machine-readable source whose reuse is checked and stated on `/quellen`;
  enough cases to matter; and no upkeep that somebody has to carry by hand.
- **The five stations stay five.** They are the rail of one national norm. A
  motion has no third station: „Regierungsvorlage" is drawn pale with its
  reason („keine · Antrag eines Ausschusses", `noRvReasonDe`), and the
  motion enters at „Parlament", its kind and Einlangen the station's first
  fact — on its page, in the list and on `/wege` alike (16.11.2026,
  maintainer's decision; until then the third station carried the motion's
  name). The Bundesrat's objection
  and a Volksabstimmung are events inside a station. Whatever does not fit is
  a different object and gets a rail of its own on a page of its own — an EU
  act under `/eu-recht`, a Petition, Bürgerinitiative or Volksbegehren under
  `/anliegen` („Anliegen an den Nationalrat" below). No sixth station.
- **The graphic follows the law, not the code** (14.11.2026). Every cell of
  `app/utils/wege.ts` names in a comment the provision the memo cites for it;
  what the memo lists under „Offen" is „je nach Fall" or left out, never a
  mark. Whether the monitor follows a row is read from the code and named at
  the row. Rows that are a DRAFT in Begutachtung (a Verordnungsentwurf, a
  Land's Gesetzesentwurf) keep their blue mark, and a sibling row or a link
  to `/datenlage#begutachtung-vorgeschrieben` says that the law does not
  prescribe it everywhere. Routes that pass only „Kundgemacht"
  (Notverordnung, Wiederverlautbarung, VfGH-Aufhebung) are not rows: nobody
  can take part on them.
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
  „Bezug zu": it supplies the EBR where the stage links none (1105/A →
  616 d.B.). What followed is read off the EBR's own Verlauf and only in the
  vocabulary measured on all 35 EBR of GP XXII–XXVIII: „Wiederholung des
  Gesetzesbeschlusses" or „Bekanntgabe des Beharrungsbeschlusses" is a
  Beharrungsbeschluss; „Antrag auf Annahme des veränderten
  Gesetzesvorschlags … angenommen" a changed text; no decision is
  „pending" while the EBR's period runs and „lapsed" after it; anything
  else, or an unread record, is „unknown" and says so. The Einspruch is no
  Beschluss of the Bundesrat: no „Nationalrat und Bundesrat haben
  beschlossen", no „nicht kundgemacht" while it is undecided. The headline
  is „Gesetz geworden" where a Kundmachung is found — Parliament links it on
  the EBR, RIS keys it by the Antrag too (`Initiativantrag`) —, otherwise
  „Einspruch des Bundesrates", with „– Gesetzgebungsperiode beendet" once
  lapsed. A row „Bundesrat" says what happened and when, never why. After
  a changed text nothing calls the first text „unverändert", and an
  Abänderungsantrag adopted in plenary counts as a change even where no
  Plenarfassung was published. The EBR's own address leads to its law's
  page; any other item the monitor does not follow is refused as „Kein
  Gegenstand, den der Monitor verfolgt", with its page at Parliament, never
  as „nicht gefunden".
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
  record, or Teil I for an Art.-15a-Vereinbarung (list 101's `VHG` „RVS15";
  29 of 29 in GP XXVI–XXVIII). It wins because Parliament's link can be
  wrong: 1041 d.B. XXVII links BGBl. I Nr. 187/2021, the
  COVID-19-Zweckzuschussgesetz, while RIS keys the Vereinbarung to I Nr.
  193/2021. The link stands only where RIS has no record (510 d.B. XXVI ⇒
  III Nr. 128/2019); a disagreement is not shown. No title join. And a
  treaty never gets the 120-day „nicht kundgemacht" claim (decision 5 of
  `docs/research/umsetzungsplan-weitere-wege.md`): a Kundmachung follows
  the ratification, which no date of Parliament's bounds — 42 of the 87
  promulgated treaties of GP XXVII took more than 120 days, up to 2,023. A
  missing one is „ausstehend" while the period runs and afterwards only „im
  RIS bisher nicht verzeichnet", a statement about our search
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
  through Begutachtung, never that its text is the consulted one. Measured
  14.11.2026: of the 15 such laws of GP XXVIII 3 claim it, of the 83 of
  XXVII 27, each checked against the period's drafts; laws with no carrying
  item fell from 17 to 2 (XXVIII) and 87 to 4 (XXVII).
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
  Beschluss" (15 items in GP XXVII–XXVIII said so before). No club names in
  rows, no club filter, no counts per club.
- **„Neues Gesetz" needs positive evidence** (14.11.2026,
  `createsNewLawFrom`): no law found AND no Novellierungsanordnung AND no
  name saying it amends or repeals. A law the reader could not name is „nicht
  lesbar", never „neues Recht"; a text it could not identify (a motion's
  „Gesetzesantrag" or „Antrag") is a stated gap in the frame, never a
  missing frame.
- **A law is named from a title or a clause only by an exact match**
  (14.11.2026, `titleLaws.ts`, `law-by-name`): where no clause cites a
  Stammnorm, the title „…, mit dem das X (und das Y) geändert wird" names
  the laws only if every piece is the Kurztitel or Abkürzung of exactly one
  consolidated law in RIS — all pieces or none; „Allgemeine
  Sozialversicherungsgesetz" is not the ASVG, an EU act is never a law of
  ours. A law found by name carries RIS's own Stammnorm. Rows are merged
  only when they resolve to the same RIS law, never because two laws share a
  Stammnorm (FPG, NAG and AsylG 2005 are all BGBl. I Nr. 100/2005; about 30
  pages had lost rows that way). Measured over 647 frames: 55 changed, each
  read.
- **„idF" never names a Novelle published after the reference date**
  (15.11.2026, `latestAmendmentOf` with `keep`, `amendedByOn`). RIS rewrites
  some § versions in place, so a version in force on the date can carry a
  later „zuletzt geändert durch" (eEltern-Kind-Pass-Gesetz on 19.11.2025:
  BGBl. I Nr. 62/2026). A later year is late outright, a Novelle of the
  reference year by its issue date; an unknown date gives no „idF". Over
  XXVII and XXVIII, 176 of about 1,480 rows changed (170 to an older Novelle,
  6 to none), spot-checked against RIS's full history. Known residue: a
  Novelle before the date that touched only rewritten versions is missed.
- **Order.** Followed since 14.11.2026: committee motions, motions of the
  Bundesrat, every Initiativantrag on a law, the Bundesrat's objection as an
  event, treaties up to BGBl. III. Built on 15.11.2026 as an object of their
  own: Petitionen, Bürgerinitiativen and Volksbegehren in the Nationalrat.
  Not followed: the regulators' Verordnungen (no machine-readable source of
  their consultations; `docs/research/wege-ausserhalb-der-stationen.md`) and
  Verordnungen without a Begutachtung, which wait until a missing draft can
  be proven. The promulgation match finds 263 of 304 drafts, and its misses
  are not an error rate: of 15 old misses read, 7 were promulgated and
  missed, 5 never were.

### Anliegen an den Nationalrat

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
  its own, „Anliegen" (16.11.2026, for „Aktuell"; the wordmark leads to the
  homepage), and a door on the homepage; the footer no longer links it.
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
  carries no entry (34 of 59 forwarded items of GP XXVI and XXVII).
- **A period's end is said from the period, not from a field.** A
  Bürgerinitiative is carried over and links its successor; a Petition
  never is and simply stops.
- **Volksbegehren from GP XXII on.** Older records are too thin for a true
  page (15 carry a single stage); the address answers with Parliament's
  link.
- **Petitionen to the Bundesrat are a fourth kind with steps of their own**
  (15.11.2026; 42, none since April 2024), at
  `/anliegen/BR/petition-bundesrat/<nr>`: the Bundesrat has no periods, so
  „BR" stands where a period does, and their tab ignores the period select.
  31 end in „Übermittlung an das Bundeskanzleramt / Bundesministerium", a
  step the Nationalrat's rail does not have, 10 in a report the Bundesrat
  takes note of, 1 counts as withdrawn (§ 16 Abs. 5 GO-BR). The addressee
  is printed only where it matches „das Bundeskanzleramt" or „das
  Bundesministerium für …"; otherwise „eine Stelle der Bundesverwaltung".
  What the administration did with a petition is not in the record, and
  the page says so. Members of the Bundesrat are shown by club only.
- **The section is called „Anliegen an das Parlament"** since the Bundesrat's
  petitions are in it (one constant, `ANLIEGEN_SECTION_DE`); sentences about
  the Nationalrat keep its name. The address stays `/anliegen`.
- **The list offers GP XXII to the running period** (15.11.2026), the
  periods the reader is measured on. It started at XXV until the older
  periods were read: there the Sammelbericht is a stage of its own in five
  spellings („Sammelbericht über die Petitionen Nr. … (N d.B.)"), which the
  reader did not know on most items. In an ended period „Nur offene" is
  unavailable and says why, and the records take the long TTL of settled
  periods.
- **Members of the Nationalrat are cut from the record too,** not only
  private persons: their names stand in their own motions („Antrag der
  Abgeordneten …") and in two titles („überreicht vom Abgeordneten …").
  Until 15.11.2026 the cached record kept them.
- **The plenary's vote on the Sammelbericht is the one shown.** On a
  forwarded item a later vote on the subject committee's report used to
  overwrite it and misdate the Sammelbericht (19 items of XXV to XXVII).
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
  10 s. Before, the list reads had no bound of their own and a slow
  Parliament cost 40 to 88 s. What is late is said, never guessed: a kind
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
  Before, the rail held every fact and the sections were sorted by kind
  (Beteiligung, Stellungnahmen, Dokumente), so card and page told the course
  in two orders. The committee's ending is an event in the committee's row,
  not a row of its own. A step reached with nothing beyond its summary
  (the Erste Lesung) gets no section and no link. The Einbringung's section
  holds the documents, the Unterstützungen and their door; the committee's
  the Stellungnahmen and theirs, because the statements the committee
  requests stand in the same list. „Stellungnahmen: 0" is a row only where
  no table counts them. No „Beteiligung" box.
- **The EU cycle starts with a licence check, not with code:** the reuse
  terms of the Commission's consultation endpoint (undocumented) and of the
  register of the European Citizens' Initiative, written up in
  `docs/research/`. `EU-Recht` stands in the header navigation since
  14.11.2026 because that page is meant to grow into the cycle.

### Language models

- **No model call while serving a request.** If summaries are ever built:
  generated once into a data file keyed by a content hash, marked as
  machine-generated, above the legal text and never instead of it, and for
  drafts only, never for Stellungnahmen (§12.11).

### Search

- **Full-text search matches only what a result row shows.** A hit that sits
  only in a ministry's name is labelled and sorted last, not deleted
  (§12.31).
- **The list search on `/entwuerfe` is filtered on the page, with the same
  per-row predicate the endpoints use** (`shared/utils/searchHaystack.ts`,
  12.11.2026): one search, one code path, no refetch per term. The
  endpoints still accept `q` and answer with the rows the page shows for
  it. The row prints every alias the search reads.
- **The site search (`/suche`, 17.11.2026) answers per list, never pooled.**
  The homepage's field leads there. Groups: Entwürfe und Gesetze, Anliegen,
  and each of the EU page's five lists. Each group shows its list's own
  count and first rows and links into the list with the term set. No
  ranking across groups, no total. Rule and words: `app/utils/siteSearch.ts`.
  - **A group's rows come from its list's own code,** so the counts are the
    list's: the draft list through `useDraftList` (moved out of
    `/entwuerfe` for this; its filters read `/suche`'s address without
    writing it, `syncUrl: false`), the Anliegen through
    `anliegenSearchRows` (open and closed, the link carries `alle=1`), the
    EU lists through their view functions and `haystack`. A count here that
    differs from the list behind its link is a defect.
  - **The full text of the running Begutachtungen stays on `/entwuerfe`:**
    it costs a request to RIS. The drafts group says the list searches it.
  - **A list that could not be read or is still loading says so on its own
    line;** only lists that answered can stand in „Nichts gefunden in: …".
  - **`/eu-recht?q=` seeds every list's field on arrival** and is not
    written back (`useArrivalQuery`). A list with deadline tabs opens on
    „Abgelaufen" when only that tab holds a hit. The tab is derived from
    the answer, not set by a watcher, so the server render and hydration
    agree.
  - **The term is never stored:** the page-view count keeps the path alone
    (class `suche`). Result pages are `noindex`.
  - Rejected: a scope dropdown beside the field, because it asks for the
    site's object types before the reader knows them. A dropdown of grouped
    rows instead of a page, because without JavaScript, without an address
    and without room for gap lines the answer gets lost. A later dropdown
    may show the groups' counts as links, with Enter opening the page.
    `/suche` redirected onto `/entwuerfe` from 22.09. to 17.11.2026: while
    the drafts were the only list, two addresses answered one question.

### The detail pages

A detail page is the page of one draft, law, Vorlage or Anliegen. These
rules hold for all of them; each names the component that carries it, and
the reasoning in full stands in that component's header comment.

- **One order, top to bottom** (15.09.2026): the header (kind and number,
  title, sender, the source and „Zitieren"), the state card, the door card
  while a window for input is open, „Worum geht es?" where the source
  summarises the item, then one section per
  station in the stations' order — Der Entwurf, Die Begutachtung, Die
  Regierungsvorlage, Im Parlament, Im Bundesgesetzblatt. The door card is
  the one deliberate break with that order: the page's action must not sink
  below a long comparison (`app/pages/entwuerfe/[gp]/[inr].vue`).
- **On the page of a Vorlage, an Antrag or a motion the item's own blocks
  stand in its station's section** (16.11.2026, `ItemOwnBlocks`): what it
  changes, its documents, the Stellungnahmen on it and the door once more.
  Under „Die Regierungsvorlage" for a Vorlage (a treaty's under its own
  name), inside „Im Parlament" for a motion, which enters there. „Der
  Entwurf" and „Stellungnahmen an den Nationalrat" were sections of these
  pages until then — two headings their rail has no station for.
- **A door quotes the receiving institution only where its sentence was
  read** (`statementQuote.ts`, `euFeedbackQuote.ts`). Read: Parliament's
  form for a Ministerialentwurf, a Regierungsvorlage, an Initiativantrag
  (16.11.2026), an Ausschussantrag, a Petition and a Bürgerinitiative; the
  Commission's portal per stage; the Citizens' Initiative. No quote, because
  no institution's sentence exists or was read: a Verordnung's and a Land's
  draft (filed at the ministry or the Land's office, no form), a
  Gesetzesantrag des Bundesrates and a Petition an den Bundesrat (no open
  window to read).
- **The state card names the state, and nothing stands under its heading**
  (15.11.2026, `ProcedureCard`). Its heading is the state in a few words
  („In Begutachtung", „Bisher keine Regierungsvorlage", „Gesetz geworden"):
  no sentence, no date, no count, no countdown. Beside it, the one way out
  (the overview of routes of its jurisdiction: `/wege`, or on an EU page
  the EU's, with the page's row selected where its kind is read). Under it,
  the rail; after the rail,
  at most a footer of facts. The component has no slot between heading and
  rail, so a description there cannot be added; a page without a rail shows
  the heading alone and says the rest in its sections. One card for every
  detail page, the Anliegen's included, which brings its own rail.
- **Five stations, vertical at every width** (15.09.2026, `SpineRail`):
  Entwurf, Begutachtung, Regierungsvorlage, Parlament, Bundesgesetzblatt,
  one row each. The station the text is on carries the yellow dot and the
  wash over its row; nothing else on the rail is yellow. A new fact extends a
  row's fact line; it adds no row („The five stations stay five", above).
- **A step not reached gets no section** (15.09.2026). A station's section
  renders exactly when the station has happened and something to say; until
  then the station is a row of the rail in plain text, not a link, and the
  page has no heading for it, no „ausstehend" section and no empty one. The
  rail's link into a section exists exactly where the section renders (the
  `sections` and `stationAnchors` computeds of each page; on the Länder
  pages the conditions in `LandStationSections`).
- **The door stands twice:** once in the door card at the top, once at the
  end of the section where the decision to file is made, solid, with the
  card's label (`DoorButton`). It lands in the form („A door lands in the
  form", below).
- **A box says what one does with it** (03.10.2026, the docblock of
  `FactList`): the accent-washed box is the door you act on, the white card
  an instrument you operate (state card, comparison, statement tables), the
  unfilled hairline frame facts to consult, bare text to read.
- **A comparison opens with its list** (02.10.2026 for the Bund, 23.10.2026
  for the Länder): no sentence above it repeats what the legend and the
  group pills count. Only a rare warning that the list may be misread
  stands above, in `ComparisonCaveats`.
- **The comparison's left side is the Regierungsvorlage** for every station
  after it; the Ministerialentwurf is the left side only for the Vorlage
  itself. Readers compare a law against the Vorlage, and adjacent stations
  attribute each change to who made it: the ministry after the
  Begutachtung, Parliament through its amendments. Both ends stay freely
  selectable.

### Design and accessibility

- **Two hues, one meaning each.** Blue means „you can do something here",
  yellow is the highlighter. Selection is ink: a selected control is the one
  you cannot act on.
- **AAA contrast (7:1), computed, never judged by eye.** The gray hierarchy
  is therefore flat; hierarchy comes from size and weight.
- **Target size is AA by decision:** 44 px for coarse pointers, 36 px for
  fine ones, because 44 px on desktop made controls taller than the rows they
  sit under. `/ueber` names the exception.
- **Every link that leaves the site opens a new window and says so.**
- **A sheet holds rows or one object with a job of its own, never prose.**
- **Every multi-colour categorical palette passes the palette validator;**
  text never carries the data colour.
- **What a control changes sits at it or below it, never above.** Stable
  headings, selectors in the section head, the source line as a footnote.
- **Help opens in place, below, as a native `<details>`** (14.11.2026). No
  tooltips, no (i) icons, no popovers, no `title` carrying meaning: the
  reader meets a term at the tag, and a phone has no hover. Three levels: a
  term („redaktionell", „nicht gezählt", „kurz") opens its one to three
  sentences under its own row (`TermNote`); „Methode", the last item of a
  section's credit line, opens the section's method text under the line
  (`SectionCredits` `#method`); a gap stays a sentence at its place. Open
  help text sits behind a 4 px `baseline` rule on the left, indented
  (15.11.2026, the GOV.UK „Details" pattern, in `TermNote` for both
  levels): bare, it read as the section's content. Not a hairline frame,
  which means facts to consult and stacks under FactList's; no icon. The
  rule means help and nothing else: the warnings above a comparison
  (`ComparisonCaveats`) lost theirs the same day, their lead word marks them. A
  control is never also a disclosure, so filter toggles and the count pills
  in a group's header button define nothing. Definitions live in
  `app/utils/terms.ts`, method texts as components in
  `app/components/method/` — copy out of logic, one place per language.
- **The page says „Ministerium", never „Ressort"** (18.11.2026; a RIS
  draft's page since 30.09.2026). One word per thing: labels said „Ressort"
  („Begründung des Ressorts", „Beim Ressort") while the running text said
  „Ministerium", and two words for one body make a reader ask whether they
  differ. „Ressort" is the administration's word, „Ministerium" the
  reader's, and the object is a Ministerialentwurf. It stays where a source
  is quoted in its own words (Parliament's sentence on what happens to a
  Stellungnahme) and in English comments and identifiers.
- **A method text is the credit line in full sentences, and it is scanned,
  not read** (18.11.2026, first `MethodGegenueberstellung`, the same day
  all fourteen). A `<dl>` whose terms
  are the answers themselves („Der Text ist vom Ministerium", „Die Markierung
  ist von uns"), in the order of the line above it, so the bold lines alone
  give the method. Set in the help size with the terms in medium weight:
  at body size and semibold they read as headings of the page and competed
  with the section heading below. It says what a reader needs to read this section: whose
  text, what is ours, how it is checked, what a withheld row means. Why a
  document exists in law, exceptions inside a check and pointers to other
  sections stay out. Where a section stands on several kinds of page, the
  text varies with the document shown (author, reference date) and a caveat
  appears only where it applies; a sentence true on one page and false on
  another is the fault this replaced.
- **Text runs the full width of its column** (maintainer, 17.11.2026). The
  page column (`max-w-2xl` … `max-w-5xl` on the page's root) is the only
  measure; no paragraph, help text, gap sentence, list or method text inside
  it gets a width of its own (`max-w-prose`, `max-w-md`, `…ch`). A text
  narrower than the boxes and rules around it leaves a ragged empty band on
  the right and reads as a layout fault. Boxes that are not text (a card on
  the error page, a control in a toolbar) may be capped.
- **A list shows its frame while loading; the loading line and the gap
  sentence stand where the rows will be** (maintainer, 16.11.2026,
  `ListBoxState`, `listBoxStatusOf`, `EntryList`'s `state`). A section that
  showed only its heading and a centred spinner far below took the lede,
  the box and the column header away until the data came. Now everything
  that does not depend on the data renders at once and stays put: heading,
  lede, the list box, its column header (plain labels until rows exist),
  the controls whose content is known without the data, the credit line.
  A tab with a count is data: the tabs stand as labels without counts,
  disabled with the loading line as their reason (`EuFensterList`), or,
  without counts, usable (the choice applies when the rows come); a search
  over rows that are not there is disabled; a count line waits. In the
  rows' place, left-aligned like a row, the spinner and the list's own
  line, `min-h-48` (12rem, about two and a half rows, so the page moves
  little when the rows come); a failed request takes the same place and
  height, its words through `GapNote` with the list's „Erneut versuchen".
  The part that will hold the rows is `aria-busy`; a polite live region
  outside it says the loading line and, once, the arrival. No fake rows and
  no grey bars: decoration that carries no information. One piece for every
  list; a detail page gated as a whole has no frame to show and keeps
  `FetchGate`.
- **A list's notes state, they do not explain** (14.11.2026). Above the
  rows stands only what is true of the list right now and differs from what
  its controls claim, one sentence each: a source that failed, a filter that
  could not apply, a Land the list does not hold in full. What a row's label
  means is explained on that row's page, at the term (`TermNote`); what the
  list leaves out by design goes into one „Methode" at the list's foot
  (`SectionCredits` `#method`, `MethodEntwurfsliste`). No „nicht" is
  weakened, a claim about absence keeps its proof, and two different gaps are
  never one sentence. The fold „Wie vollständig die Länder-Entwürfe sind" is
  one line naming the incomplete Länder, each linked to its block on
  `/datenlage`, shown only when one applies.
- **A gap sentence opens with one of four lead words that say whose gap it
  is** (15.11.2026, `shared/utils/gaps.ts`, `GapNote`): „Nicht
  veröffentlicht" (the source does not publish it; the word of
  `/datenlage`), „Gerade nicht abrufbar" (no answer just now, no claim
  about fault), „Nicht lesbar" (this document, our reading failed or a check
  refused it), „Nicht im Monitor" (our scope or method, for every case of
  its kind). The lead word is semibold in the text's own ink; no colour, no
  symbol. A label puts the object first: „Kundmachung: gerade nicht
  abrufbar"; so does the heading of an error box with a retry button
  („Stellungnahmen: gerade nicht abrufbar", bare where it names nothing). One verb for a failed request, never „derzeit", „verfügbar" or
  „gerade nicht lesbar"; gap sentences say „der Monitor", not „wir". A state
  of the procedure („noch keine Regierungsvorlage", „Beschlossen – nicht
  kundgemacht") is no gap and takes none, nor does a sentence that follows
  from a gap already named („Ganze Paragraphen danach zeigt der Monitor
  deshalb auch nicht …"). A record that lists no document
  proves no absence: a missing Erläuterungen document is „Nicht lesbar",
  never „Nicht veröffentlicht". Kept apart on purpose: the verification
  check's own leads („Nicht geprüft:", „Nicht gezeigt:"), the per-change
  „Begründung: nicht zuzuordnen", the Lesefassung's per-§ reasons, and the
  list's count line, whose clauses already say „gerade nicht abrufbar".
  Before the rule, 192 strings of the site were read and sorted by it.
- **A door lands in the form** (15.11.2026). A button that sends the reader
  to file a Stellungnahme leads as close to the form as the source allows,
  never to a page from which the reader must find it. Parliament's page of
  an item opens on „Übersicht"; its forms sit on the Stellungnahmen tab
  behind two closed accordions. So every Parliament door is two buttons,
  „Stellungnahme als Privatperson" and „… für eine Organisation", each
  opening its form (`?selectedStage=101&persForm=1#persForm`, Parliament's
  own `formlink`; `&orgForm=1#orgForm`, linked by Parliament nowhere, found
  by trying), on Ministerialentwurf, Regierungsvorlage, the other items and
  the Anliegen (`StatementFormDoors`, `statementFormUrl`). A choice instead
  of an instruction: a sentence above one button, telling the reader to
  open „Formular für Privatperson", was rejected, it hands Parliament's
  layout to the reader. The two buttons share one weight; a label names the
  item where a page carries two pairs („… zur Regierungsvorlage …"). An
  address that rests on an unofficial parameter must fail into a longer way,
  never a dead link: without `orgForm` the tab still opens. An address that
  carries a source's internal ids is read from the source, not written into
  code: Vorarlberg's form server (`parseVbgFormUrl`), falling back to the
  page that links it. Checked in a browser on each item type, not in CI: a
  browser test against an outside site fails for reasons that are not ours.
  Not checked: the Petition an den Bundesrat, which keeps the one
  `formlink`.
- **The monitor asks for a correction where it makes a claim of its own**
  (17.11.2026). „Fehler melden" ends
  a section's credit line exactly when the line names something as the
  monitor's (marking, pairing, a count, the classification of who filed;
  `SectionCredits`): a line that only credits publishers gets none. It
  opens in place, as „Methode" does: „Hinweis an" and the address,
  written out, as a link whose mail names the page and the claim. Not a
  bare `mailto:` link on the words themselves: that does nothing,
  silently, where no mail program answers it, and here the reader at
  least reads the address. Opening it closes „Methode" and the other way
  round (`<details name>`, one group per credit line). No such line stands under every page: one asking for hints
  under each draft was removed on 30.09.2026, nobody there had the
  question. It is a muted item of the line, never the accent box: blue buttons are the doors into lawmaking, and a
  field beside a draft would be taken for filing a Stellungnahme.
- **Every page invites people to work with the project, in one line of
  the footer** (maintainer, 17.11.2026; `AppFooter`, `COOPERATION_DE`):
  „Am Monitor mitwirken: eine Funktion wünschen, einen Kontakt vermitteln,
  einen Workshop anfragen" and the address on a line of its own under it,
  in the text's size above the colophon. On every page, because the
  readers it is for arrive on a draft's page from a feed or a search and never see the start page. One
  line and the address, no link to a longer text and no section: four
  rows in the doors' grammar stood on the start page and on `/ueber` for
  an hour and were taken back for the simpler line, and under every page they would stand beside the doors into lawmaking
  and be read as some of them. „Am Monitor", not a bare „Mitmachen": on
  this site that word means taking part in lawmaking. It names no price
  and promises nothing. No header label: a sixth does not fit at 320 px
  (`AppHeader`).
- **Mail leaves from the reader's program, not from the server**
  (17.11.2026, `app/utils/contact.ts`). A form needs a sending path with
  credentials, spam protection without a third party, a failure state and
  a section of its own in the Datenschutzerklärung. What it would add is a
  report without a sender's address. Not built until readers are seen to
  answer the invitations; if built, it sends only to the monitor's own
  address, never a copy to an address typed in, and does not render where
  no sending path is configured.
- **The contact address is configuration**
  (`runtimeConfig.public.contactEmail`, `useContact`), as the site's
  address is: no page writes it out.

### Operations

- **The deploy waits for the prewarm.** A restart empties every memory cache, so
  warming before it is pointless; `✔ deployed` means the next visitor finds a
  warm server. A failed prewarm does not fail the deploy.
- **The consolidated reading is deliberately not prewarmed:** it is fetched
  on the client, and warming it per open draft would make every deploy
  longer each month. The Textgegenüberstellung, the Land comparisons, „Im
  Bundesgesetzblatt" and the § names are fetched on the client too, when
  they come near the viewport (`useNearViewportSection`).
- **A cache that pays an upstream round trip or a fan-out is served stale
  while it refreshes, up to a limit named per cache** (`cache/ttl.ts`);
  past the limit a request waits for the fresh value. On a quiet site the
  request after an expiry was nearly always a visitor's: cold 4–13 s against
  0.1 s warm (12.11.2026). Never for the Stellungnahmen, whose count is a
  claim the page makes about now, and never on a layer that only recomputes
  cached inputs, because limits along a chain add up. Requests that reach
  the server directly — prewarm, watchdog, archive — always wait for the
  fresh value, so the prewarm's builds keep running one after another
  instead of all at once on one heap.
- **Published documents are kept on disk across restarts, for 30 days** —
  law texts, § versions, Erläuterungen, closed Bundesgesetzblatt years, in
  the StateDirectory (`cache/documentDriver.ts`). Upstream payloads only,
  never a list or search answer, never a Stellungnahme; the names are a
  hard-coded list in `tests/cacheLayers.test.ts`, and the prewarm unit
  deletes files past 32 days. It saves the document fetches after a deploy,
  not the cold wait of a comparison: that wait is RIS's query answers, which
  stay in memory.
- **Memory:** `--max-old-space-size=320`, `MemoryMax=512M`,
  `MemorySwapMax=0`, so a leak hits V8's clean limit and restarts instead of
  swapping. Measured peak of the deploy sequence: 217 MB (26.10.2026).
- **Measure bundle size only after a clean install.** `node_modules` keeps
  orphaned packages and Nitro's trace picks them up (13.8 MB against
  5.26 MB for one commit).

## 2. Measured figures

Dates are the day of measurement. GP = Gesetzgebungsperiode, ME =
Ministerialentwurf, RV = Regierungsvorlage.

### The procedure

| What | Value | Sample, date |
|---|---|---|
| ME→RV text changed | XXVII 98.9 %, XXVI 97.0 % | 274/277, 98/101 · 27.09.2026 (§12.38) |
| Change share of a draft's own provisions, p25 / median / p75 | XXVII 46 / 63 / 77 %, XXVI 35 / 50 / 73 % | 03.10.2026 (§12.38, §12.40) |
| RV tabled on or before the Frist | XXVIII 7 of 91 (median change share 0 % against 60 %), XXVII 1 of 296 | 29.09.2026 (§12.38) |
| Fristende → first RV | median 40 days, p90 189 | GP XXVII (§12.23) |
| Nationalrat decision → promulgation | median 20 days, p90 29, max 82 | 84 laws, GP XXVIII · 03.10.2026 (§12.21) |
| Drafts changed again in Parliament after the RV | 52 of 91 | GP XXVIII (§12.18) |
| Regierungsvorlagen whose Erläuterungen say what became of the Begutachtung | 0 of 17 | 18 Vorlagen of GP XXVIII sampled, 17 with readable Erläuterungen · 08.09.2026 |
| Statements on Regierungsvorlagen | 555 on 68 Vorlagen | GP XXVIII · 15.09.2026 (§12.14) |
| Oral hearings in committee on ME-derived Vorlagen | XXVIII 1 of 79, XXVII 8 of 286 | 26.09.2026 (§12.14) |
| Votes: coalition only / no club against | XXVIII 32 % / 26 %, XXVII 15 % / 36 % | 110 and 361 decided RVs (§12.34) |
| Largest Begutachtung | XXVII 106,184 statements, XXVIII 846 | (§12.21) |
| Ordinance, Frist → BGBl II | median 57 days, p90 179, max 538 | 22.10.2026 (§12.32) |
| Einsprüche of the Bundesrat (EBR items) | XXII 24, XXIII 2, XXIV 0, XXV 1, XXVI 0, XXVII 8, XXVIII 0; of the 35: 29 Beharrungsbeschluss, 1 changed text, 5 undecided at the period's end | list 101 and each EBR's Verlauf · 14.11.2026 |

### The corpus

| What | Value | Sample, date |
|---|---|---|
| RIS Begut records by type | Verordnungen 65.9 %, laws 33.4 % | 4,574 records · 17.09.2026 (§12.16) |
| Running Begutachtungen list 81 covers | 4 of 8 | 17.09.2026 (§12.16) |
| Open at the same time | 6 ME (p90 10), 7 RIS records (p90 18) | 2025-01-01 to 17.09.2026 (§12.20) |
| Textgegenüberstellung present | laws 44.8 %, Verordnungen 16.1 % | (§12.16) |
| Comparable ME/RV texts, GP XXIII to XXVIII | 64 · 70 · 87 · 93 · 97 · 100 % | (§12.38) |
| List 142 flag agrees with the name heuristic | 96.8 / 99.7 / 94.2 % | 106,626 rows · 16.09.2026 |
| RVs without a `preconst` pointer | 32 of 117 | GP XXVIII (§12.28) |

### The monitor's own accuracy and coverage

| What | Value | Sample, date |
|---|---|---|
| RIS↔ME join, GP XXVII | 337 of 350 matched, 1 weakly, 0 ambiguous, 12 without any RIS record; by hand 25 of 25 sampled matches right, 12 of 12 absences confirmed | 350 Ministerialentwürfe, 966 RIS records in the period · 06.09.2026 |
| RIS↔ME join, GP XXVIII, first live run | 130 of 132 matched, 1 weakly, 1 without a RIS record | 07.09.2026 |
| RIS↔ME join, GP XXVIII | 161 of 163 matched, 1 weakly (11/ME), 1 without a RIS record (60/ME). Before the same day's fix 149/ME stood without its record: a dash in the law's own name („Immissionsschutzgesetz – Luft 2027, IG-L 2027") was read as the start of an abbreviation | `pnpm corpus:tgu-deckung -- --gp XXVIII`, 4,621 of 4,621 RIS records read · 18.11.2026 |
| Ordinance → BGBl II join found | 85.4 %; 91.1 % where the Frist is over a year old | 251/294, 163/179 · 22.10.2026 (§12.32) |
| Länder LGBl title match (Oberösterreich oracle) | 77 of 83 right, at most 2 wrong | (§12.43) |
| Oberösterreich draft → promulgation comparable | 83 of 83 | 22.10.2026 (§12.44) |
| Ministry reasoning attached at the § | 75.8 %, median 89 % per draft | 1,816/2,396 annex §§ · 02.10.2026 (§12.30) |
| Allgemeiner Teil of the Erläuterungen readable | 98.4 % | 465 documents (§12.29) |
| Full-text hits located in a named document | 100 % | 58/58 over 12 keywords · 22.09.2026 (§12.31) |
| „RV bundles other drafts" judged by package size | wrong in 71 % | 90 of 126 · GP XXVI–XXVIII (§12.40) |

### What becomes of a draft

| What | Value | Sample, date |
|---|---|---|
| Drafts that reach a Regierungsvorlage | XXVII 84 %, XXVI 70 % | 296/353, 114/163 · 08.09.2026 (§12.10) |
| RV within 180 days of the Frist | 89.5 % | GP XXVII (§12.10) |
| Drafts open at the end of the period that got an RV in the next | XXVII 4 of 61, XXVI 14 of 63 | (§12.10) |
| Expired drafts without an RV that became law as an Initiativantrag | 42 of 140 | GP XXVI–XXVIII, text overlap ≥ 0.6 · 30.09.2026 (§12.10) |
| Such motions filed while the Frist was still running | 8 of 31 | GP XXVII and XXVIII (§12.10) |
| Drafts without a linked RV whose title another draft's RV names („genannt") | XXVIII 1 (44/ME → 298 d.B., +26 d), XXVII 1 (93/ME → 945 d.B., +104 d), XXVI 0 | 32, 14 and 26 candidates, every Vorlage of the period read · `pnpm corpus:rv-genannt` · 14.11.2026 |
| Title hits the rule rejects | XXVIII 1 (138/ME before the Frist); XXVII 4 (125, 126/ME past the window; 205, 228/ME Antrag route — 228 also +196 d); XXVI 7 (16/ME cross-reference, 24/ME law name, 140/ME Antrag, 34, 141, 143, 164/ME before the Frist) | same run |
| Vorlagen whose Erläuterungen are a PDF only | XXVIII 9 of 131, XXVII 21 of 365, XXVI 8 of 117 (budget laws mostly) | same run |
| Cold „genannt" index, production build, 320 MB heap, empty document disk | GP XXVII 3 s after its station map (181 Erläuterungen read), RSS 198 → 233 MB; GP XXVIII 17 s with its station map, peak 251 MB | 14.11.2026 |
| Words of the ministry's reasoning changed ME → RV | median 8.9 %; Besonderer Teil 10.5 %, Allgemeiner Teil 3.9 % | 64 pairs, GP XXVIII · 22.09.2026 (§12.10b) |

### The consolidated reading and the annex

| What | Value | Sample, date |
|---|---|---|
| Engine against RIS after entry into force: identical | 80.4 % (1,444 of 1,796; 1,439 before the same night's engine fixes, `erltext` read as law text among them). The bench scored 1,752 §§ until 19.11.2026: 45 §§ of laws RIS files as „Art. 1 § 3" were never scored (41 identical), and the same day five §§ whose only line `segmentUnits` had lost became identical (79.5 %, 1,392, before both); 77.9 % on 04.10.2026 | 60 BGBl · 19.11.2026 (§12.12) |
| Engine's own deviations | 1.1 % (20); 0.5 % (7 of 1,470) among unrefused §§ (1.2 % and 0.6 %, 9 of 1,476, before the engine fixes of 19.11.2026). 0.7 % until 19.11.2026, one of them the bench's own: AlVG „Art. 1 § 3" held against the engine's § 1 | same |
| Unrefused but not the law in force | 0.9 % (13) of 1,470 §§; KFG § 24 and VBG § 100 are identical since `erltext` is read on both sides. 1.4 % (21) of 1,476 §§ before that, counting since 19.11.2026 the two §§ an instruction named, nothing refused and the engine left (partly) as they stood (KFG § 24, VBG § 100); BVergGVS § 30 identical since its lost line is read; 1.4 % (20 of 1,435) on 18.11.2026; 3.0 % (46 of 1,519) on 04.10.2026. Of the 26 that left, 21 are refused now with the same text and 4 became identical: bookkeeping, not accuracy. The 26th was Privatschulgesetz § 30, never wrong (next row) | same |
| Annex-confirmed §§ against the enacted text | Table path: 116 confirmed, 114 identical, 2 incomplete and withheld as implausible, 0 deviating, so all 114 the gate shows are identical (107 before typed designations opened their §; 108 and 106 on 18.11.2026, before the lettered Ziffern were read). PDF path, read by the bench since 19.11.2026: 319 confirmed, 317 identical, 0 deviating; of the two incomplete, one is plausible and shown, Grundversorgungsgesetz – Bund 2005 § 5 (BGBl. I Nr. 39/2026), which lacks part of the enacted text and adds no word. Both paths, what the gate shows: 428 of 429 identical. „0 of 108 deviate" (26.10.2026) counted the class „abweichend" alone and summed three §§ away; the third, Privatschulgesetz § 30, was word for word the law and read as „halb angewendet" because RIS gives the designation once as `<ueberschrift typ="para">` and once as `<gldsym>` (`konsTree.ts`) | 19.11.2026 (§12.12c) |
| Fault injection: known error classes caught | ≥ 95 % each | 26.10.2026 (§12.12c) |
| Fault injection, one word, figure or place in a printed stretch (word dropped, added, swapped, figure, citation, two Ziffern swapped) | 99.3–100 % on both paths; § heading 99.9 % (PDF, 94.8 % before the heading-area fix) and 100 % (table) | GP XXVIII · 19.11.2026 |
| The same where no changed row prints anything (word dropped / added / figure changed) | 99.0 / 99.7 / 99.6 % (PDF), 99.5 / 99.9 / 99.7 % (table), floored; 65.0 / 23.8 / 95.8 % and 66.7 / 28.0 / 97.1 % while check 3 asked only whether a word stands anywhere in the annex. Withdrawn without injection: 6 of 1,549 PDF and 2 of 1,153 table confirmations, each read (four engine gaps behind a refusal, one result without a heading the annex prints, three correct results the annex prints wrongly: TDBG § 40b, HSG § 7, BD-EG § 38) | GP XXVIII · 19.11.2026 |
| A struck Absatz put back under its old number (fault class Zurück) | 45 of 45 (PDF), 25 of 25 (table); 41 of 46 and 20 of 25 before checks 4 and 5 read a struck Absatz that opens like the next | GP XXVIII · 19.11.2026 |
| Silent omission read (`silentOmissions`) under fault injection | a skipped unit the engine loses caught 16 of 16; one missing from RIS too caught 3 of 16 | GP XXVIII · 14.11.2026 |
| Changed §§ with an outcome on the page | all 4,701 in 163 drafts (ME) and 1,490 in 219 (without Gegenstand); 4,463 and 1,541 on 27.10.2026. The second fell although five drafts came, and none of it is the engine: six drafts left the set (−89; four got a Parliament page as 150/ME to 153/ME, two were lost by the corpus read, next table), eleven came (+38), and on the 208 in both the count stayed 1,452. Reconstructed by running the code of 27.10. offline on the same inputs: 214 drafts, 1,541, 630, the recorded figures. The JSON of an `accounting.ts` run is the per-draft record from now on | GP XXVIII · 18.11.2026 (§12.12c) |
| Of those shown | 2,267 and 623; 2,167 and 630 on 27.10.2026. Without Gegenstand: −33 with the six that left, +11 with the eleven that came, +15 on the 208 in both (7262426, omissions without „…": 14; 14984f1, letter-spaced words: 1) | same |
| RIS Begut list read whole | 4,621 of 4,621 with the repair; without it one pass gave 4,602 (19 sent twice, 19 skipped), another 4,614, the dev server's 380 of the 382 in the period | `pnpm corpus:tgu-deckung`, one pass over 47 pages · 18.11.2026 |
| Amending drafts that show at least one § | 111 of 122 | GP XXVIII · 06.10.2026 (§12.12) |
| Amending drafts with a readable annex | 121 of 122 | 06.10.2026 (§12.12) |
| Textgegenüberstellung readable | XXVIII 124 of 139, XXVII 290 of 342 | 27.09.2026 (§12.13) |
| Annex's proposed column differs from the draft itself | 10–13 % of §§ | 1,337 §§ in 78 drafts · 06.10.2026 (§12.12) |
| Annex's current-law column differs from RIS | 7.3 % | same |
| The ministry's yellow highlighting misses a difference | 1,395 of 8,430 row pairs | 08.09.2026 (§12.13) |
| Rasterised RIS annexes with a PDF text layer | all 527 | 28.09.2026 (§12.13) |
| Amendment instructions read completely | 5,584 of 6,576 | 300 drafts · 25.09.2026 (§12.12a) |
| Speaking names for changed units | 81 %, median 86 % per draft; no wrong heading — the check's only disagreements are its two known law-name false positives and five moving instructions („In § 20 entfällt die Paragraphenbezeichnung …"), named by the § they move into | 40 drafts, production build · 14.11.2026 (§12.11, `pnpm audit:para-title XXVIII 40`) |
| Omnibus drafts among those with an annex | 59 % | 64 of 109, GP XXVIII (§12.12) |

Drafts without an annex are almost all new laws, which need none (BKA-VD
circular of 10.12.2015).

### Länder, EU law, federal law carried out by the Länder

| What | Value | Sample, date |
|---|---|---|
| Oberösterreich Textgegenüberstellung: §§ confirmed / new / withheld | 1,301 / 239 / 213 | 73 drafts · 22.10.2026 (§12.45) |
| Salzburg title search against the Land's own link | laws 262 of 267, Verordnungen 355 of 357 | 22.10.2026 (§12.47) |
| Salzburg drafts that show a comparison | 139 of 151 | 23.10.2026 (§12.52) |
| Salzburg Textgegenüberstellung: §§ shown / withheld | 1,716 / 451 | 147 drafts, 140 with a comparison · 14.11.2026 |
| Changed §§ with a per-§ reasoning | Oberösterreich 88 %, Salzburg 65 % | 25 drafts each (§12.53) |
| Vorblatt carries the EU heading | 94.8 % | 154 ME, GP XXVIII · 04.11.2026 (§12.66) |
| Vorblatt says „transposes a directive" / any EU link | 27.9 % / 41.6 % | same |
| Directives with several unlabelled Cellar dates | 50 of 168 | same |
| Länder drafts that carry out something federal | about 7 % | 489 drafts · 06.11.2026 (§12.66) |
| The same, by kind | 20 carry out a Grundsatzgesetz, 21 an agreement under Art. 15a B-VG, 37 either (4 both); 4 drafts unread | the same 489 drafts, counted again offline · 15.11.2026 |
| Deadline stated in the Land draft | 2 of about 35 | same |
| EU acts of the map by who adopted them | Parliament and Council 167, Council 27, Commission 41 | 235 acts · 15.11.2026 |
| EU acts with a procedure in the Cellar / with its number / with a dated proposal | 212 / 188 / 191 | same |
| Acts of Parliament or Council the Cellar links to no procedure | 2 (Verordnung 1182/71, Richtlinie (EU) 2024/825) | same |
| Procedures with no decision of Parliament or Council on record | 1 (2023/0077(COD), two acts) | same |
| Regulations with a typed day of application / with partial days | 38 / 30 of 68 | same |
| Decisions typed „Wirksamwerden" instead of an entry into force | 12 of 13 | same |
| Procedure numbers with a page in the Legislative Observatory | 180 of 187; of the 181 the rule links, 178 (the other three, 2016/0224(COD), 2018/0063(COD), 2023/0077(COD), are split into files A and B and linked by `OBSERVATORY_FILE`) | every number of the map, one request each · 15.11.2026 |
| Rail against the Legislative Observatory: proposal, Parliament, Council, signature | identical in 15 of 18 procedures with a page; in 3 the difference has a named reason (Council position adopted a day before the Observatory dates its publication; an act on two procedures; a consent procedure whose „proposal" the Observatory dates later); 2 of 20 have no page | 20 acts across six procedure types · 15.11.2026 |
| Land Textgegenüberstellung, right column found in the draft | 550 of 550 judgeable §§ | 63 documents, Oberösterreich, Salzburg, Tirol, Wien, 1,156 §§ shown, GP XXVIII · 12.11.2026 |
| The same check under fault injection, caught | another § of the same draft appended 57.8 % (315/545), another draft's sentence 76.4 % (420/550); by design none of a number changed, one word swapped, a sentence dropped (0 of 474 / 549 / 336) | same |

### Laws without a Begutachtung

| What | Value | Sample, date |
|---|---|---|
| Bund laws „ohne Begutachtung" + „Ausschussbegutachtung" | XXVIII 57 + 8, XXVII 320 + 8 | 205 and 923 federal laws · 12.11.2026 |
| Bund Initiativanträge with a readable ParlDion Textgegenüberstellung | XXVIII 23 of 44 (11 unreadable, 10 none), XXVII 127 of 293 (73, 93) | enacted laws without a Ministerialentwurf · 12.11.2026 |
| Bund Vorlagen with a readable Textgegenüberstellung | XXVIII 8 of 21 (12 PDF only, 1 none), XXVII 13 of 35 (13, 9) | same |
| Salzburg „ohne Begutachtung" | 41 of 452 laws, all Initiativanträge | GP XXV–XXVIII · 10.11.2026 |
| Salzburg Vorlagen joined by title that carry the heading | 264 of 264 | laws since 2016 · 10.11.2026 |
| Land laws with ≥ 1 law at its geltende Fassung in RIS | 98.0 % of amending laws (2,720 of 2,776), 97.5 % of all | all nine Länder since 2016 · 10.11.2026 |
| First text → Kundmachung comparison shown | Salzburg Initiativantrag 87 of 103, Oberösterreich Beilage 181 of 201 | since 2016 · 10.11.2026 |
| Land law „Was das Gesetz geändert hat": laws with ≥ 1 § compared / named §§ compared | Burgenland 19 / 86 %, Wien 14 / 77 %, Tirol 17 / 69 %, Niederösterreich 16 / 60 %, Steiermark 18 / 58 %, Oberösterreich 15 / 49 %, Vorarlberg 17 / 43 %, Salzburg 13 / 34 %, Kärnten 10 / 23 % | 20 laws per Land since 2016, 5 per Land checked against the instructions · 12.11.2026 |

### Anliegen an den Nationalrat

| What | Value | Sample, date |
|---|---|---|
| Petitionen / Bürgerinitiativen per period | XXV 111 / 121, XXVI 30 / 67, XXVII 148 / 74, XXVIII 29 / 36 | list 101 · 14.11.2026 |
| How the committee ended an item | 354 Kenntnisnahme im Ausschuss, 122 Zuweisung an einen Fachausschuss, no third way | 616 items, GP XXV–XXVIII · 15.11.2026 |
| What a subject committee did with a forwarded item | 34 no entry, 15 report, 10 last adjourned | 59 items, GP XXVI and XXVII · 15.11.2026 |
| The two flags against each other and against list 143's `AKTIV` | never differ (44 open, 572 closed); `AKTIV` agrees on 65 of 65 | 616 items; GP XXVIII · 15.11.2026 |
| When the window closes | closed on exactly the 21 whose Kenntnisnahme the plenary has taken note of; open on all 8 forwarded | 65 items, GP XXVIII · 15.11.2026 |
| Requests of the committee for a statement | 1,796, addressee free text, 222 with a person behind „;" | 616 items · 15.11.2026 |
| Stages the reader does not recognise | 2 of 1,100 Petitionen and Bürgerinitiativen of GP XXII–XXVIII („Abstandnahme von der weiteren Verhandlung", „Änderung der Vorlage"), 4 of 85 Volksbegehren | whole corpus · 15.11.2026 |
| The same before the older shapes were read | XXII 115 of 124 items with an unread stage, XXIII 36 of 66, XXIV 195 of 294 | 15.11.2026 |
| Names in anything assembled or cached, all periods and kinds | 0 of 1,427 named and 20,179 linked persons | 1,227 records · 15.11.2026 |
| Erstunterzeichner names in anything assembled or cached | 0 of 300 | 701 records · 15.11.2026 |
| Names on Bundesrat petitions (members handing in, Berichterstatter, movers) in the reduced record or the detail | 0 of 113, full name or surname | 42 records · 15.11.2026 |
| Anliegen list, cold | running period 3.8 s (70 + 42 records), GP XXVII 14.6 s (265 + 42); warm under 0.1 s | Parliament answering in about 1 s · 15.11.2026 |
| Volksbegehren in the Nationalrat | 85 rows; 59 Kenntnisnahme (11 with an Entschließung), 15 with one stage only (GP X–XVIII) | all periods · 15.11.2026 |
| Petitionen to the Bundesrat | 42; 31 forwarded to the Bundeskanzleramt or a ministry, 10 report taken note of, 1 withdrawn (§ 16 Abs. 5 GO-BR); no stage unread | all · 15.11.2026 |
| List 101's date column on these items | the day of arrival on 287 of 287, not the last treatment | GP XXVII and XXVIII · 15.11.2026 |
| Ordinance drafts matched to a BGBl. II | 263 of 304 (260 before the spelling fix of 14.11.2026) | RIS `Begut` · 14.11.2026 |

## 3. Rejected alternatives

### The engine and the annex

- **The Erläuterungen as a second verification signal.** 71 % of their quotes
  appear in neither text (§12.12b).
- **The Regierungsvorlage's Textgegenüberstellung to raise coverage.** It
  does not exist yet during the Begutachtung (§12.12).
- **OCR for scanned annexes.** Unnecessary, and containment checks pass
  missing words (§12.13).
- **More tolerance when matching against the annex** (ignoring commas and
  brackets, a counted check): masks real contradictions (§12.12).
- **A word balance as check 6** (19.11.2026): the result less the standing
  text must change every word's count by exactly as much as the annex's
  changed rows. It caught every unprinted word fault, and withdrew 50
  confirmations on the PDF path and 6 on the table path, about 44 of them
  noise: group titles and a neighbouring §'s heading carried into a cell,
  abbreviations spelt two ways, rows the table path pairs differently from
  the draft. Check 3 in place catches 99.0–99.9 % of the same faults with
  none (`scripts/harness/faultInjection.ts`).
- **Showing repealed §§ as „entfällt" in the reading version,** or the
  reading version as a section of its own: a duplicate of the line above
  (§12.12, §12.12a).
- **Skipping §§ the annex is silent on to save load budget.** Coverage fell:
  instructions need their anchor §§ (§12.12a).
- **Loading §§ that contain tables.** Cells would be read as paragraphs
  (§12.12).
- **Withholding a whole law when deviant §§ cluster.** It discarded §§ that
  each passed; it became a note (§12.13).
- **Reading a § the right column quotes („„§ 1. …“") as a unit of the PDF
  annex** (measured 19.11.2026). It turns four withheld false repeals into
  confirmed changes, but in annexes that print instructions it glues the
  next instruction („§ 4 lautet:") into the § as new text, confirmed, and in
  a renumbering chain it pairs the old § 68i MSchG with the new one by
  number, also confirmed. The repeal rule withholds those §§ with a true
  reason instead (`annex/repeals.ts`).
- **A health endpoint, a dead man's switch, a status page.** Stale data is
  labelled on the page, and a failed prewarm costs seconds (§12.7).

### Länder and EU

- **An index over all Regierungsvorlage PDFs.** A standing obligation, not a
  query (§12.47).
- **Headings detected by text alone.** Mostly wrong; font weight is used for
  Wien only (§12.62).
- **„Mentioned anywhere in federal law" as „already transposed".** Wrongly
  removed 43 of 70 deadline lines (§12.66).
- **A short-name lookup table for EU acts.** Solves 0 of 50 act-less drafts,
  and ages (§12.66).
- **On the deadline timeline:** an axis from the directive's adoption, a
  broken axis, a written distance („18 months after"), a before/after colour
  (§12.66).
- **The Ministerialentwurf, „in Ausführung des …" or a bare BGBl citation as
  the Bund → Land key.** Amendments enter at the RV, only two Länder write
  the phrase, and reference lists cite everything (§12.67).
- **An overview page for Grundsatzgesetze.** About five a year (§12.67).

- **Old against new wording from RIS's consolidated Landesrecht as a set
  per law.** 94 % of changed §§ have their previous version, but the changed
  § set matches the Landesgesetzblatt's instructions in only 57 of 176 laws
  (20 Novellen per Land, 10.11.2026). Built instead per §, each one checked
  against an instruction (Länder above).
- **The changed laws of a Land law derived from Artikel headings or the
  title.** Genitives („Änderung des NÖ Pflichtschulgesetzes") and
  Sammelnovellen need guessing; the consolidated records name them directly.
- **A per-law Begutachtung statement for Burgenland.** Its register does not
  carry the key Salzburg's Vorlagen do, and the hand sample of „none" laws
  found 1 of 25 wrong.
- **A first text from the Landtag item RIS links** (Wien, Niederösterreich,
  Tirol). Wien's Beilagen read as law text 3 of 10, Niederösterreich's 0 of
  10 (10.11.2026).
- **Kärnten's instruction heads read through the Bund's `novao` grammar.**
  Over 121 documents and 3,350 instructions (12.11.2026): 163 heads read
  differently, 13 documents change, one § would be shown wrong (only its
  heading) and two correct §§ withheld — for about 40 lines saved.

### Operations and data

- **Our own full-text index.** RIS already indexes the full text; a copy
  means operating it (§12.31).
- **Full-text search over all periods.** A different question; the archive is
  linked at RIS (§12.31).
- **Caching search results by query.** Unbounded keys in a RAM cache; the
  documents are cached instead (§12.31).
- **A language model for the Erläuterungen.** The typed RIS XML is parsed
  (§12.29).
- **Two lanes in the upstream slot queue** (`upstream/fetch.ts`). A cold
  draft request took ~0.8 s idle and the same during one station-map build;
  only several fan-outs at once add 0.5–2 s (12.11.2026). Not built until a
  slow Parliament shows a queue in practice.
- **Our own copy of the law in force** (for a page per law). RIS holds the
  text and `FassungVom` serves every reference date; a copy would be a sync
  job with no gain.

### Privacy

- **Extending the e.U. rule to GmbH, AG, OG and KG.** It hid 95 strings,
  among them Flughafen Wien AG (§12.14).

### Framing

- **KPI tiles or a summary sentence on the homepage.** No user question asks
  for those numbers; a number stands at what it counts (§12.20).
- **„X % ohne Begutachtung" or „X drafts changed" as a headline.** A
  scoreboard without a win side (§12.20).
- **A pure success list, a cross-period ranking, colour per outcome.**
  (§12.21, §12.28)
- **Measuring a weight or effect of statements on a Vorlage.** Committee
  changes are common with or without statements (§12.14).
- **A per-party scorecard or „laws X voted against" filter** (§12.34).
- **A party axis.** The sources carry no party; „blocking" is not observable
  (a Begutachtung without a Vorlage covers coalition disputes, elections,
  changed EU law, merged drafts and rightly withdrawn ones); and before
  Parliament only governing parties appear.

### Joins and comparisons

- **Weakening „Seit Ende der Begutachtungsfrist … liegt keine
  Regierungsvorlage vor" on every draft** because a few drafts were folded
  into another's Vorlage (14.11.2026). The verdict is true of Parliament's
  record for the other drafts; where a Vorlage names a draft, the page says
  that instead (`namedInRv.ts`).
- **„Aufgegangen in" / „zusammengeführt mit" as the state.** What the
  evidence shows is that a Vorlage's Erläuterungen name the draft's title,
  not how much of the draft the Vorlage carries; „genannt" is the weakest
  state it supports, and the quote lets the reader judge the rest.
- **The title witness alone** (conditions 1–5 without the sentence guard).
  Over GP XXVI–XXVIII it accepted four drafts, two wrongly: 16/ME XXVI,
  which 68 d.B. names as „des dzt. in Begutachtung befindlichen Entwurfs",
  and 24/ME XXVI („Einkommensteuergesetz 1988, Änderung"), whose core is
  only the heading „Zum Einkommensteuergesetz 1988:" in 190 d.B.

- **Building the station map from the Vorlage via `preconst`.** A missing
  pointer would become a false „keine Regierungsvorlage" (§12.26).
- **Lowering the BGBl II acceptance threshold.** The 0.45–0.72 band is almost
  entirely non-pairs (§12.32).
- **One promulgation ↔ one draft per period.** Removes 8 wrong matches and
  hides 20 defensible ones (§12.32).
- **A different name as a counter-witness in the BGBl II join.** 188 of
  2,647 matches differ in their names and are mostly right: a year moved on
  („…verordnung 2025" → „… 2026"), or a spelling („PlAblV" for „PflAV")
  (14.11.2026).
- **An identical title as a witness in the BGBl II join.** Descriptive titles
  recur with other content: the draft „über eine Einbeziehung in die
  Zusatzversicherung" (2008) carries BGBl. II Nr. 23/2009's title word for
  word and Nr. 362/2008's text (14.11.2026).
- **Character similarity for LGBl matching.** The boilerplate („Gesetz, mit
  dem das … geändert wird") dominates; distinguishing words are used
  (§12.43).
- **A similarity threshold for „redaktionell".** Wrong in both directions:
  of 26 units above 0.95 only 3 were editorial and 13 hid a change of term;
  one unit below it was pure reference shifting.
- **Quoting what the Regierungsvorlage's Erläuterungen say about the
  Begutachtung.** They say nothing (0 of 17, above); the section would read
  „nothing here" on almost every draft.
- **Pairing articles by Stammnorm alone.** One BGBl often creates several
  laws, and the cited numbers contain typos (§12.18).
- **A threshold on the new period's age for carrying over open deadlines.**
  Every threshold would have been wrong at one of the last two changes
  (§12.36).
- **„Geltendes Recht → Ministerialentwurf" as a pair in the station chooser.**
  It would be an apply, not a diff: a Novelle is a list of instructions to
  carry out, current law is a text plus a reference date that moves per
  station, and an omnibus draft would have as many left sides as laws. The
  exact answer is already on the page: the ministry's Textgegenüberstellung,
  the reading version confirmed against it, and the list of laws the draft
  would amend, linked to RIS (17.09.2026).
- **Checking a readdressed instruction for crossing against the pairs the
  engine already made.** 6 of the 27 calibrated pairs cross one — an
  instruction the Vorlage moved within the law (37/ME XXVII Z 60 → Z 70) —
  and all six are the same instruction; the same §§ already exclude the
  wrong ones. Crossing is checked among the new pairs only (14.11.2026).
- **A „date" class for a change of a date written with a month name.** 0 of
  97 such units change only the date (23.09.2026).

### Interface

- **Date fields beside the period select** (18.11.2026). Two controls on one
  axis intersect, and „GP XXVII" with „9.–15.11.2026" is an empty list that
  reads as a finding. The span of the reader's own is a value of the select.
- **Native date fields for that span** (18.11.2026). The browser's picker
  cannot be styled or localised by the page (Chrome's came up English) and
  read as a foreign part.
- **A span united over several Bund periods** (18.11.2026). Every list
  endpoint would have to answer for several periods at once; a weekly
  review never crosses one, so the later part is shown and the earlier
  linked.
- **A separate list or route for drafts without a Gegenstand.** One list with
  separate counts (§12.19).
- **A separate search page.** One question, one address (§12.31).
- **A separate „Neu" list, or sorting by title.** A third of titles start
  with „Änderung" or „Verordnung"; the marker and the feed cover it (§12.22).
- **Pagination that takes rows out of the DOM.** Every organisation's name
  stays in the SSR HTML so the organisation can find itself (§12.15).
- **Truncating titles.** Official titles put the distinguishing part at the
  end (§12.28).
- **A filter that isolates one change type.** Readers want to suppress types;
  the legend hides them (§12.17).
- **Station icons, yellow bars on every section, a wash on the current
  station** (§12.39).
- **The stations as a horizontal stepper** (15.09.2026). The German station
  names hyphenate in the prose column („Regierungsvorla-ge"), and the
  breakout that bought the width was unwanted itself.
- **Versions as nodes, stages as arrows.** The Begutachtung, the product's
  subject, shrank to a connector, and two arrows had nothing observable
  behind them.
- **„Geltendes Recht" as a station, Ausschuss and Plenum as two.** The law in
  force is no step of the procedure (it is a fact of the Entwurf, „ändert 2
  Gesetze"); readers ask what Parliament did, not which body did it.
- **A pale halo as the marker of the current station,** a ringed ink dot, a
  blue „still actionable" wash (03.10.2026). Too weak, or a second meaning
  for blue.
- **A dated mark between the stations** (the Umsetzungsfrist, 04.11.2026).
  It showed order without measure; the EU dates got a time-scaled strip
  under the EU fact instead.
- **A sentence under the state card's heading** (15.11.2026). It made the
  reader read two lines before the answer and repeated the rows.
- **Renaming the path word `/entwuerfe` now.** The address was renamed once
  already (from `/begutachtungen`), and a restructure with a country segment
  is planned: rename at most once, then. Candidate for that day:
  `/verfahren` — a page is one procedure, which holds for drafts that end,
  laws without a draft and Verordnungen, and the new pages' API already says
  `verfahren`. `/gesetze` is rejected: most drafts never become one. The
  address the current word fits worst: `/entwuerfe/<land>/lgbl/<year>/<nr>`.

## 4. Open questions

- **Licence.** Whether Parliament's „die Dokumente selbst sind freie Werke"
  holds for a Ministerialentwurf's documents too, and what covers the
  metadata of the Begutachtung lists. Until answered, the source order of the
  Textgegenüberstellung does not move, and no blanket CC-BY claim is made.
- **The basis for reading the Länder's documents** (15.11.2026,
  `docs/research/amtliche-werke-landesdokumente.md`): drafts, Erläuterungen
  and Vorlagen of a Land are most likely free works (§ 7 Abs. 1 UrhG);
  statements of third parties are not. Two points rest on our own
  reasoning and wait for a lawyer: whether a Begutachtungsentwurf counts
  as an official work, also one that never became law, and whether the
  database right (§ 76d UrhG) stands against reading a Land's register
  systematically.
- **Does a Stellungnahme on a Regierungsvorlage reach the ministry?**
  (15.11.2026, `docs/research/stellungnahmen-empfaenger.md`) Parliament's
  general pages say released Stellungnahmen go to the Klubs and the
  responsible ministry, for every kind of item; its form on a
  Regierungsvorlage, an Ausschussantrag, a Petition and a Bürgerinitiative
  names the Klubs only. Until the Parlamentsdirektion answers, the site names
  the Klubs alone after the Begutachtung.
- **Does list 81 update `Frist` when a Begutachtung is extended?** Forty
  daily snapshots to 02.11.2026 contained no extension to observe; RIS and
  list 81 agree on 336 of 337 deadlines of GP XXVII, so extensions are rare.
- **One Ministerialentwurf, several Regierungsvorlagen.** The page uses the
  RV whose text Parliament attaches; whether to show every strand is open.
- **Whether a Begutachtung is required at all,** federally or in any Land,
  and in what form. The product's wording („ohne Begutachtung", never
  „übersprungen") does not depend on it, but any public claim beyond it does.
- **A consulted draft under another title.** A Bund law whose draft was
  consulted under a different title and whose text took a path no record
  links still reads „ohne Begutachtung · kein Ministerialentwurf" (126 d.B.,
  Tabakgesetz, after 5/ME). Its own documents do not mention a Begutachtung,
  so the mention rule (above) does not reach it; a draft under another title
  has no safe join yet.
- **„Upcoming" Begutachtungen** have no verified data source: the Parliament
  API knows a consultation only once it starts.
- **Outcome claims in periods with partial linkage.** `chainCoverageOf`
  silences outcome claims only where no draft of a closed period links
  beyond the Begutachtung. Where only some do, a missing link cannot be told
  from a draft that stalled: sampled at eight drafts per period, links first
  appear in GP XVIII (3 of 8) and are reliable from GP XX (7 of 8;
  `docs/api-exploration.md`, „Both corpora are well populated from GP XVI
  on"). In between, „keine Regierungsvorlage" may be an archive gap. The
  code has no period floor for it.
- **Cutting the rows of a PDF annex at the number of a
  Novellierungsanordnung.** It would mend the annexes that print instructions
  in their right column (1 of 114 in GP XXVIII) and touches every annex, so
  it waits for a measurement over the corpus
  (`scripts/harness/faultInjection.ts`).
