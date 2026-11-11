# Decisions

What binds future work and cannot be read off the code: standing rules, the
measurements that carry the product's claims, and alternatives that were
tried and rejected.

This file replaces `docs/architecture.md`, a change-by-change log that had
grown to 15,800 lines. The log is kept in git under the tag
`architecture-archive-2026-11`; the numbers in parentheses (§12.31) are its
section numbers:

```sh
git show architecture-archive-2026-11:docs/architecture.md
```

The story of a change belongs in its commit message. A rule that outlives the
change belongs here.

## 1. Standing rules

### Foundations

- **Boring, low-ops tech.** No database, no accounts: the Nitro server is a
  caching proxy in front of the official APIs. The predecessor
  (OffenesParlament.at) died in operation, not in construction.
- **No third-party resources at runtime.** No web fonts, no icon or script
  CDN, no analytics service, no cookies. Hosting only with EU-owned
  providers, not the EU regions of US hyperscalers (CLOUD Act). The
  build-time dependency on the npm registry is the documented compromise.
- **No `v-html` for upstream content.** Everything is reduced to plain text
  on the server.
- **No Pinia or other state layer.** `useFetch` suffices; there is no shared
  client state.
- **No page may wait on hundreds of upstream fetches.** Station maps are
  cached, time-budgeted and prewarmed; when the budget runs out the list
  stays unfiltered and says so (§12.26).
- **Upstream calls identify themselves** with one `User-Agent`, retry twice
  on 5xx, and time out after 8 s per attempt, because timeout × 3 is how long
  an SSR render blocks before the error page.
- **Every whole-list read is checked against the `count` of the same
  response,** and every row against the requested period: the Parliament API
  silently ignores unknown filter keys and `showAll` silently stops at
  100,000 rows. Positional list headers are asserted before anything is
  cached (§12.14).
- **The current legislative period is never hardcoded without a fallback
  path.** Units and scripts say `aktuell` and `vorperiode`, because a roman
  numeral in a unit file turns wrong on the day nobody is looking.

### Privacy

- **No private person is named.** The pipeline filters on the server, before
  anything reaches the SSR payload. When in doubt a submitter is a person: an
  organisation shown as „Privatperson" is a cosmetic bug, a published name is
  a legal risk.
- **The naming segment decides.** „Nachname, Vorname; Universität Salzburg"
  is a person with an affiliation. A person attached behind an organisation's
  name is cut off; an e.U. counts as a natural person (§12.14).
- **List 142's institution flag can withhold a name but never publish one on
  its own.** It records how the submitter registered and also marks law firms
  under a lawyer's name (§12.14).
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
  (§12.65).

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
  change rate (~98 %) separates nothing; what carries information is a
  draft's change share against its period's interquartile range. Where the
  Regierungsvorlage was tabled on or before the Frist, the page shows the
  date instead: temporal, not causal (§12.38).
- **Copy about statements on a Regierungsvorlage says where they go** (the
  Klubs and the ministry) and never what they achieve (§12.14). The window
  lasts until the Bundesrat decides (§ 23b GOG-NR).
- **„Bisher keine Regierungsvorlage" only when proven.** An unread chain, a
  missing `preconst` pointer or an exhausted fetch budget shows the weakest
  state the evidence supports. Silence can be repaired, a false accusation
  cannot (§12.21, §12.26, §12.28).
- **In a closed period where no draft links beyond the Begutachtung, absence
  is an archive gap, not a finding** (§12.27).
- **„Noch nicht kundgemacht" needs one of two signals:** Parliament's own
  „Keine Kundmachung" stage, or no promulgation 120 days after the decision.
  A successor is named only through Parliament's own link, never by title
  (§12.21, §12.33).
- **Not „not promulgated" while time can still explain it.** For ordinances
  „pending" covers the first 180 days (§12.32).
- **Club votes:** „alle Klubs dafür", never „einstimmig"; no counts derived
  from seats, no per-party scorecard. The vote covers the whole law and never
  stands as a verdict on a § or a Stellungnahme (§12.34).
- **A failed source says so; it never renders as an empty result.** An empty
  answer names what was searched. „Nothing found" for something unchecked is
  the most expensive lie the product can tell (§12.13, §12.31).
- **Pages without a parliamentary Gegenstand show no statement sections,**
  and the count cell says „nicht gezählt", never 0: nobody publishes who
  filed (§12.16, §12.28).
- **The Gegenstand half and the RIS half of the corpus are never pooled into
  one total** and never share a schema with invented empty fields (§12.19,
  §12.28).

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
  that did not run, no Gegenstand), none. Only none says „ohne
  Begutachtung"; a law whose Nationalrat committee itself invited written
  Stellungnahmen is „Ausschussbegutachtung", never both. A period whose
  drafts are not linked to Vorlagen carries no such rows at all.
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
  in the default list too; the chip only narrows to them.
- **A Land law's changed laws come from RIS's consolidated Landesrecht,
  filtered by the Landesgesetzblatt** (`Kundmachungsorgannummer`), never from
  an Artikel heading or a title.

### Joins

- **A positive from a constructed join (title similarity) may be shown with a
  link to check it. A negative never goes into a headline, a list column or a
  filter:** at 85–92 % coverage one row in twelve would be wrong, in the
  direction that sounds like an accusation. Applies to BGBl II and to the
  Länder (§12.32, §12.43).
- **Whether a RIS record has a Gegenstand is decided by the RIS↔ME join;**
  the title classifier only labels. Errors must fall on the harmless side:
  call a Verordnung a law, never take a law's Parliament page away (§12.16).
- **Never link a chain by short title** (§12.21). Laws in BGBl I are ordered
  by BGBl number, not by decision date (§12.23).
- **A Länder § comparison runs only against a promulgation the Land itself
  names,** never against our own title search, even with one candidate
  (§12.44).

### Comparisons

- **Adjacent stations by default,** so every change can be attributed to one
  actor: ressort, committee, plenary (§12.18). No Plenarfassung→BGBl pair: no
  actor changes the text in between (§12.33).
- **Stations are recognised by a measured whitelist of exact document
  titles,** never by keyword (§12.18).
- **Each side of a comparison carries its own licence credit.** RIS documents
  are CC BY 4.0, parliamentary documents free works, the Ministerialentwurf
  carries no licence claim (§12.18).
- **The comparison key may fold typography; the displayed text never does**
  (§12.33).
- **A changed cross-reference is editorial only where this comparison itself
  paired the old and new number.** Never „no word changed" for a change we
  cannot explain (§12.33).
- **Later-station comparisons are cut to the draft's own laws only where
  Parliament's `preconst` says the Regierungsvorlage bundles other drafts,**
  never by package size (§12.33, §12.40).
- **The ministry's reasoning is attached to a § only where the law key is
  certain.** A wrong reasoning at a § is worse than none (§12.30).

- **The reasoning comparison runs only ME → RV, and only where both sides
  give a reasoning.** „Unchanged" means the same words in the same order; no
  percentage threshold. Both sides are read with the same parser (§12.10b).
- **An inferred station shows how it was inferred.** „Became law as an
  Initiativantrag" is our conclusion from text overlap, so the Antrag and the
  overlap share stand with it; the claim is about timing, never cause
  (§12.10).
- **Dead-draft copy says „selten", never „nicht mehr möglich":** a draft can
  still get its Regierungsvorlage in the next period (§12.10).

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
- **What the instruments cannot prove:** the annex oracle and fault injection
  do not show the output is free of error. Only the BGBl test bench (RIS
  after entry into force) has ground truth (§12.12c).

### Measuring

- **Every measurement calls the shipped function, never a copy,** and code in
  a harness that passes judgement is tested like production code (§12.12a).
- **Print the requested corpus beside the corpus actually reached;** a shrunk
  corpus looks like a full one (§12.12).
- **Before a parser change, compare old against new over the whole corpus and
  read every item that moves.** Zeros measured on tuning data are in-sample.
- **Report per-draft figures (median, share of drafts)** over pooled
  percentages, which a few large laws dominate (§12.12).

### Länder

- **Precision before coverage.** A § of a Land's Textgegenüberstellung is
  shown only where RIS confirms its current wording on the document's date
  (≥ 0.98 word match) or the § is new; the rest is withheld and counted
  (§12.45, §12.52).
- **„Entfallen" only where the draft says so.** An empty right column can be
  text the reader missed (§12.52).
- **A failed fetch never counts as empty** and refutes nothing (§12.58).
- **A document a Land files as the draft but that is not one is not read as
  the draft;** the page says so (§12.63).
- **Landtag motions name the party only where the committee report does;**
  members named there are never named (§12.61). In Land submitter data only
  unambiguous organisation and authority abbreviations are expanded (§12.64).
- **Upstream blocks are respected, not circumvented:** one request per second
  and a two-hour pause after a 403 at Steiermark's firewall; EUR-Lex's bot
  check is not bypassed, only the Cellar is queried (§12.64, §12.66).

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
  failure counter.
- **D7. Act names come from the Cellar,** not from a lookup table of short
  names.
- **From EUR-Lex only metadata (CC0) is taken;** acts are linked, the logo is
  never used (§12.66).
- **Bund → Land is keyed by the promulgation (BGBl. I), not the
  Ministerialentwurf.** Drafts are counted, never Länder; „0 Länder" is never
  shown, and unread Länder are not „without" (§12.67).
- **A reader change that alters a stored finding bumps its reader version in
  the same commit,** or the disk store keeps stale facts (§12.66, §12.67).

### Language models

- **No model call while serving a request.** If summaries are ever built:
  generated once into a data file keyed by a content hash, marked as
  machine-generated, above the legal text and never instead of it, and for
  drafts only, never for Stellungnahmen (§12.11).

### Search

- **Full-text search matches only what a result row shows.** A hit that sits
  only in a ministry's name is labelled and sorted last, not deleted
  (§12.31).

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

### Operations

- **The deploy waits for the prewarm.** A restart empties every cache, so
  warming before it is pointless; `✔ deployed` means the next visitor finds a
  warm server. A failed prewarm does not fail the deploy.
- **The consolidated reading is deliberately not prewarmed:** it is the one
  section fetched lazily on the client, and warming it per open draft would
  make every deploy longer each month.
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
| Of the 30 most recent laws, never in Begutachtung | 6 | 18.09.2026 (§12.23) |
| Statements on Regierungsvorlagen | 555 on 68 Vorlagen | GP XXVIII · 15.09.2026 (§12.14) |
| Oral hearings in committee on ME-derived Vorlagen | XXVIII 1 of 79, XXVII 8 of 286 | 26.09.2026 (§12.14) |
| Votes: coalition only / no club against | XXVIII 32 % / 26 %, XXVII 15 % / 36 % | 110 and 361 decided RVs (§12.34) |
| Largest Begutachtung | XXVII 106,184 statements, XXVIII 846 | (§12.21) |
| Ordinance, Frist → BGBl II | median 57 days, p90 179, max 538 | 22.10.2026 (§12.32) |

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
| Words of the ministry's reasoning changed ME → RV | median 8.9 %; Besonderer Teil 10.5 %, Allgemeiner Teil 3.9 % | 64 pairs, GP XXVIII · 22.09.2026 (§12.10b) |

### The consolidated reading and the annex

| What | Value | Sample, date |
|---|---|---|
| Engine against RIS after entry into force: identical | 77.9 % | 60 BGBl, 1,744 §§ · 04.10.2026 (§12.12) |
| Engine's own deviations | 1.3 % (0.7 % among unrefused §§) | same |
| Unrefused but not the law in force | 3.0 % of 1,513 §§ | same |
| Annex-confirmed §§ that deviate from the enacted text | 0 of 108 | 26.10.2026 (§12.12c) |
| Fault injection: known error classes caught | ≥ 95 % each | 26.10.2026 (§12.12c) |
| Changed §§ with an outcome on the page | all 4,463 (ME) and 1,541 (without Gegenstand) | GP XXVIII · 27.10.2026 (§12.12c) |
| Of those shown | 2,167 and 630 | same |
| Amending drafts that show at least one § | 111 of 122 | GP XXVIII · 06.10.2026 (§12.12) |
| Amending drafts with a readable annex | 121 of 122 | 06.10.2026 (§12.12) |
| Textgegenüberstellung readable | XXVIII 124 of 139, XXVII 290 of 342 | 27.09.2026 (§12.13) |
| Annex's proposed column differs from the draft itself | 10–13 % of §§ | 1,337 §§ in 78 drafts · 06.10.2026 (§12.12) |
| Annex's current-law column differs from RIS | 7.3 % | same |
| The ministry's yellow highlighting misses a difference | 1,395 of 8,430 row pairs | 08.09.2026 (§12.13) |
| Rasterised RIS annexes with a PDF text layer | all 527 | 28.09.2026 (§12.13) |
| Amendment instructions read completely | 5,584 of 6,576 | 300 drafts · 25.09.2026 (§12.12a) |
| Speaking names for changed units | 71 %, median 81 % per draft, 0 wrong of 451 | 40 drafts · 30.09.2026 (§12.11) |
| Omnibus drafts among those with an annex | 59 % | 64 of 109, GP XXVIII (§12.12) |

Drafts without an annex are almost all new laws, which need none (BKA-VD
circular of 10.12.2015).

### Länder, EU law, federal law carried out by the Länder

| What | Value | Sample, date |
|---|---|---|
| Oberösterreich Textgegenüberstellung: §§ confirmed / new / withheld | 1,301 / 239 / 213 | 73 drafts · 22.10.2026 (§12.45) |
| Salzburg title search against the Land's own link | laws 262 of 267, Verordnungen 355 of 357 | 22.10.2026 (§12.47) |
| Salzburg drafts that show a comparison | 139 of 151 | 23.10.2026 (§12.52) |
| Changed §§ with a per-§ reasoning | Oberösterreich 88 %, Salzburg 65 % | 25 drafts each (§12.53) |
| Vorblatt carries the EU heading | 94.8 % | 154 ME, GP XXVIII · 04.11.2026 (§12.66) |
| Vorblatt says „transposes a directive" / any EU link | 27.9 % / 41.6 % | same |
| Directives with several unlabelled Cellar dates | 50 of 168 | same |
| Länder drafts that carry out something federal | about 7 % | 489 drafts · 06.11.2026 (§12.66) |
| Deadline stated in the Land draft | 2 of about 35 | same |
| Feed and calendar polls among reader requests | 89 of 186 | 31.10.2026 (§12.65) |

### Laws without a Begutachtung

| What | Value | Sample, date |
|---|---|---|
| Bund laws „ohne Begutachtung" + „Ausschussbegutachtung" | XXVIII 59 + 8, XXVII 331 + 8 | 205 and 923 federal laws · 10.11.2026 |
| Salzburg „ohne Begutachtung" | 41 of 452 laws, all Initiativanträge | GP XXV–XXVIII · 10.11.2026 |
| Salzburg Vorlagen joined by title that carry the heading | 264 of 264 | laws since 2016 · 10.11.2026 |
| Land laws with ≥ 1 law at its geltende Fassung in RIS | 98.0 % of amending laws (2,720 of 2,776), 97.5 % of all | all nine Länder since 2016 · 10.11.2026 |
| First text → Kundmachung comparison shown | Salzburg Initiativantrag 87 of 103, Oberösterreich Beilage 181 of 201 | since 2016 · 10.11.2026 |

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
- **Showing repealed §§ as „entfällt" in the reading version,** or the
  reading version as a section of its own: a duplicate of the line above
  (§12.12, §12.12a).
- **Skipping §§ the annex is silent on to save load budget.** Coverage fell:
  instructions need their anchor §§ (§12.12a).
- **Loading §§ that contain tables.** Cells would be read as paragraphs
  (§12.12).
- **Withholding a whole law when deviant §§ cluster.** It discarded §§ that
  each passed; it became a note (§12.13).
- **Fuzzy title matching to find a dead draft's successor.** Every threshold
  added pairs from different laws (§12.10).
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
- **Publishing a lateness rate.** Rests on the latest named directive, and is
  a blame counter (§12.66).
- **On the deadline timeline:** an axis from the directive's adoption, a
  broken axis, a written distance („18 months after"), a before/after colour
  (§12.66).
- **The Ministerialentwurf, „in Ausführung des …" or a bare BGBl citation as
  the Bund → Land key.** Amendments enter at the RV, only two Länder write
  the phrase, and reference lists cite everything (§12.67).
- **An overview page for Grundsatzgesetze.** About five a year (§12.67).

- **Old against new wording from RIS's consolidated Landesrecht as every
  Land's „what changed".** 94 % of changed §§ have their previous version,
  but the changed § set matches the Landesgesetzblatt's instructions in only
  57 of 176 laws (20 Novellen per Land, 10.11.2026). Oberösterreich (14 of
  19) and Tirol (10 of 19) would be the place to try again.
- **The changed laws of a Land law derived from Artikel headings or the
  title.** Genitives („Änderung des NÖ Pflichtschulgesetzes") and
  Sammelnovellen need guessing; the consolidated records name them directly.
- **A per-law Begutachtung statement for Burgenland.** Its register does not
  carry the key Salzburg's Vorlagen do, and the hand sample of „none" laws
  found 1 of 25 wrong.
- **A first text from the Landtag item RIS links** (Wien, Niederösterreich,
  Tirol). Wien's Beilagen read as law text 3 of 10, Niederösterreich's 0 of
  10 (10.11.2026).

### Operations and data

- **Our own full-text index.** RIS already indexes the full text; a copy
  means operating it (§12.31).
- **Full-text search over all periods.** A different question; the archive is
  linked at RIS (§12.31).
- **Caching search results by query.** Unbounded keys in a RAM cache; the
  documents are cached instead (§12.31).
- **A language model for the Erläuterungen.** The typed RIS XML is parsed
  (§12.29).

### Privacy

- **The list-142 institution flag as permission to publish.** It also marks
  persons (§12.14).
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

### Joins and comparisons

- **Building the station map from the Vorlage via `preconst`.** A missing
  pointer would become a false „keine Regierungsvorlage" (§12.26).
- **Lowering the BGBl II acceptance threshold.** The 0.45–0.72 band is almost
  entirely non-pairs (§12.32).
- **One promulgation ↔ one draft per period.** Removes 8 wrong matches and
  hides 20 defensible ones (§12.32).
- **Character similarity for LGBl matching.** The boilerplate („Gesetz, mit
  dem das … geändert wird") dominates; distinguishing words are used
  (§12.43).
- **Trusting a unique title-search candidate for the Länder diff.** Fails
  when the right promulgation lies outside the window (§12.44).
- **Pairing articles by Stammnorm alone.** One BGBl often creates several
  laws, and the cited numbers contain typos (§12.18).
- **A threshold on the new period's age for carrying over open deadlines.**
  Every threshold would have been wrong at one of the last two changes
  (§12.36).

### Interface

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

## 4. Open questions

- **Licence.** Whether Parliament's „die Dokumente selbst sind freie Werke"
  holds for a Ministerialentwurf's documents too, and what covers the
  metadata of the Begutachtung lists. Until answered, the source order of the
  Textgegenüberstellung does not move, and no blanket CC-BY claim is made.
- **Does list 81 update `Frist` when a Begutachtung is extended?** Forty
  daily snapshots to 02.11.2026 contained no extension to observe; RIS and
  list 81 agree on 336 of 337 deadlines of GP XXVII, so extensions are rare.
- **One Ministerialentwurf, several Regierungsvorlagen.** The page uses the
  RV whose text Parliament attaches; whether to show every strand is open.
- **Rate limits of the Parliament API** are undocumented.
- **Whether a Begutachtung is required at all,** federally or in any Land,
  and in what form. The product's wording („ohne Begutachtung", never
  „übersprungen") does not depend on it, but any public claim beyond it does.
- **A consulted draft under another title.** A Bund law whose draft was
  consulted under a different title and whose text took a path no record
  links still reads „keine · kein Ministerialentwurf" (126 d.B.,
  Tabakgesetz, after 5/ME). Whether the Vorlage's own documents carry a
  usable signal, as Salzburg's do, is measured below the rule's evidence and
  open.
- **„Upcoming" Begutachtungen** have no verified data source: the Parliament
  API knows a consultation only once it starts.
