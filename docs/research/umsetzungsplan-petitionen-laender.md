# Implementation plan: petitions to the Landtage, and the EP petition

**15.11.2026.** Plans what `petitionen-laender-und-eu.md` found: which of the
entries under „Weitere Wege, sich zu äußern" the monitor can follow, in which
order, and what each step costs. The Commission's consultations and the
European Citizens' Initiative are planned in `umsetzungsplan-eu-zyklus.md`
(steps 2, 3, 5) and are not repeated here. Line numbers drift; function and
file names are the stable reference.

Nothing in this plan is built. Each step that adds a source is the
maintainer's decision (CLAUDE.md: a new source ships only with its licence
checked and stated; a `robots.txt` that excludes programs is asked first).

## What the research decided, in one table

| Instrument | Verdict | Why |
|---|---|---|
| Petition an das Europäische Parlament | link, never follow | no machine source; the portal answers programs with 403, and the EP's legal notice forbids circumventing technical measures |
| Oberösterreich | build first | a register the monitor already reads, 281 petitions and 270 answers in GP XXIX, reuse granted with attribution |
| Vorarlberg | build after asking | 4–6 a year, readable, reuse of text not stated |
| Burgenland | build after asking | 52 in GP XXII, 3 in XXIII; the item page opens by postback; reuse not stated |
| Tirol | ask the Landtag first | the only source sits on `lte.tirol.gv.at`, whose `robots.txt` excludes all; it has online support like the Nationalrat |
| Steiermark | ask the Landtag | the platform sits behind a CAPTCHA „vor automatisierten Zugriffen" |
| Wien | do not follow | the law confines the petition to „Verwaltung der Gemeinde"; no route to a norm |
| Salzburg, Niederösterreich, Kärnten | gap sentence | no petition type in the register |
| Volksabstimmung, Volksbefragung | never follow | too rare to fill a list |

## Decisions for the maintainer

Each with a recommendation. The steps below assume the recommendation.

1. **Where Land petitions live.** (a) In `/anliegen` as a fifth kind,
   `petition-landtag`, with the Land in the first path segment where the
   Bundesrat has „BR" (`/anliegen/ooe/petition-landtag/2026-21276`), and the
   section renamed „Anliegen an Parlament und Landtage"; or (b) a section of
   their own. **Recommended (a):** one place for „Anliegen", one rail
   grammar, one list with a Land filter; the Bundesrat already proved that a
   kind without periods fits. The route segment is the Land code from
   `shared/utils/laender.ts` (no new spelling), and every path is built from
   the base path, not written (CLAUDE.md, the `/at` move).
2. **Who is named.** The rule of the Nationalrat's Anliegen carries over:
   Gemeinden, Städte and bodies named; organisations as `privacy.ts` decides
   today; private persons counted, never named. Oberösterreich writes the
   person into the title („Petition von Herrn/Frau … betreffend …"), so the
   title is cut to „Petition betreffend …" **on the server** before anything
   reaches the payload, and in doubt the submitter is a person.
   **Recommended:** yes, with the classifier corpus comparison
   (`pnpm audit:classifier`) extended to the Land titles before the first
   deploy.
3. **The petition text.** It is the submitter's text, not an official work.
   **Recommended:** linked, never fetched, like a Stellungnahme. The answer
   of the Landesregierung is shown as a fact (answered on …, a link), not
   read either in the first release.
4. **Asking Tirol and Steiermark.** Outreach is the maintainer's. The
   question per Landtag: may a non-commercial monitor read the petition
   overview once a day and link each petition. Nothing for these two is
   built before an answer.
5. **Vorarlberg and Burgenland reuse.** Neither states terms for text.
   **Recommended:** ask both in the same letter round; build after a yes.

## The steps

### Step 0 — `/wege` says what is true today (no new source)

- The EP petition entry gets a gap in the row's words: „Nicht im Monitor:
  das Petitionsportal des Parlaments bietet keine Schnittstelle." Written
  through `shared/utils/gaps.ts`.
- The Länder entry (`id: 'laender'`, „Volksabstimmung, Volksbefragung,
  Petition, Bürgerrat") stays one line until step 1 ships; then „Petition"
  in Oberösterreich gets its `monitorHref` and the line says which Länder
  are followed.
- Cost: copy and a test. No operations.

### Step 1 — Oberösterreich, measured before built

**1a. The item page, read once by hand.** Open questions 1 and 4 of the
memo decide the shape of the rail: whether the register's item page (reached
by posting `nummer` and `jahr` into the search form, the only way found)
carries an arrival date, a committee, a link to the answer. Without it a row
has only „document number / year" and a title, too little for a rail.
Write the result into the memo before coding.

**1b. The reader** (`server/utils/laender/oberoesterreichPetitionen.ts`):

- The search, as the drafts reader already talks to this host: a
  `LandSession` (cookie), the **complete** form with its defaults (a request
  with the type alone answers „Ein unerwarteter Fehler"), `beilageTyp`
  `PET` and `PETAT`, the running period and the one before, `rowCount` 500.
  One `SitePacer` shared with the drafts reader, so the host sees one
  client.
- The gate (`LandSourceError`): each page held to its result line
  („Zeilen 1 bis N von M"); a page without it is refused, and the list says
  „Gerade nicht abrufbar", never „keine Petitionen".
- The title cut and the submitter class (decision 2) in the reader, before
  the cache. The reader's output never holds the original title of a
  person's petition.
- The join of petition and answer: by whatever 1a finds; only as a fallback
  by the subject after „betreffend", which joined 170 of 281 in GP XXIX.
  An unjoined petition shows „Nicht lesbar: ob und wann die Petition
  beantwortet wurde." — never „unbeantwortet". Art. 64 obliges an answer,
  but its absence in the register is no proof.
- Cache: a day for the list, like the Länder drafts; the prewarm reads the
  running period only.

**1c. The page and the list.**

- Rail from what 1a finds; at least „Eingebracht" and „Beantwortet". Its
  note (the `note` field of `AnliegenRailRow`, 15.11.2026) quotes the duty:
  „in Behandlung zu nehmen und zu beantworten (Art. 64 Oö. L-VG)".
- No support figures: Oberösterreich has no online support. The page says
  so in one line, not with an empty count.
- The list gets the Land as a filter beside the kind tabs, and the kind tab
  „Petitionen an Landtage".
- Credit line and Impressum entry: „Quelle: Land Oberösterreich", under the
  terms quoted in the memo, with the open point that the register does not
  name its own terms.

**1d. Privacy check before deploy:** the classifier comparison over both
periods' titles, every newly shown name read by hand (CLAUDE.md, „Legal").

Cost: one more reader on a host already read, a daily list fetch, a title
classifier to keep honest. Upkeep risk: the form changes (it already needs
every field), and the session wall.

### Step 2 — Vorarlberg and Burgenland, after a yes on reuse

- Vorarlberg: the Domino search sorted by date, one item page per petition
  (title, period, „Eingelangt"). The answer within three months (Art. 10
  L-V) is not in the item; until it is found in the LIS, the rail ends at
  „Eingelangt" and the note states the duty, never a missed deadline.
- Burgenland: the views per period; the item page by postback (the
  helper `postbackDocument` in `server/utils/laender/session.ts`, which
  `tirol.ts` already uses). Measure first, like 1a.
- Same title and privacy rules; the titles read so far name no person.

### Step 3 — Tirol and Steiermark, after the Landtag's answer

- Tirol is the closest to the Nationalrat: petitions and Bürgerinitiativen
  with online support „bis zum Abschluss der Ausschussberatungen". If the
  Landtag agrees, the reader follows `lte.tirol.gv.at` as the drafts reader
  does, and the page shows the support count and the open window.
- Steiermark: only with a way in that is not a CAPTCHA (an export, a list
  page without the check, or the Landtag's permission and a technical
  route). Otherwise the gap sentence stays.

### Not in this plan

- Wien's petitions (municipal administration).
- The EP petition beyond the link.
- Reading petition texts or answers (synthesis is deferred on purpose,
  CLAUDE.md item 4).
- Any alert on new petitions (item 1).

## Operations and the €100 ceiling

Step 1 adds requests to a host the monitor already reads; steps 2 and 3 add
one host each. Daily reads of short lists, no stored history, no database:
inside the ceiling. The standing cost is upkeep — every Land register is a
form someone wrote once, and each breaks on its own schedule. That is the
third condition of „Routes to a norm"; it argues for stopping after the
Länder that have a register type, not for skipping them.
