---
paths:
  - "server/utils/eu/{portalFeedback,portalService,haveYourSay}.ts"
  - "app/components/eu/EuFeedback*.vue"
  - "app/utils/euFeedback*.ts"
  - "app/components/method/MethodEuRueckmeldungen.vue"
---

# Feedback on the Commission's portal

The list of who gave feedback on the Commission's portal: who is named, what
is read, how it is paged and shown. The portal's other rules are in
`docs/decisions/eu.md`. What an entry holds, and the other areas:
`docs/decisions.md`.

## Who is named, and what is never kept

- **Organisations named, persons counted** (15.11.2026, rule decided by
  the maintainer; `server/utils/eu/portalFeedback.ts`,
  `namedOrganisationOf`). A row of `allFeedback` names an organisation
  only if it is `PUBLISHED`, its kind is one of the eight organisation
  kinds (`EU_CITIZEN`, `NON_EU_CITIZEN`, `OTHER` and any unknown kind are
  counted, never named), it carries a non-empty organisation name, and two
  witnesses hold: a structural one — the size is SMALL, MEDIUM or LARGE,
  or the row carries a Transparency Register number — and a name witness
  — no word of three letters or more of the sender's first name or surname
  (case and accents ignored) is a word of the organisation's name. In
  doubt a sender is a person: any missing or odd field is counted. The
  reason for both witnesses: sole traders carry their own name as the
  business name (all such cases found by hand were MICRO).
  `server/utils/parliament/privacy.ts` is not the witness here and is not
  touched: built for Austrian submitter lines, it called most of these
  international names a person and missed real cases.
- **The name must be a name, and only its head is shown.** A field with a
  number of five or more digits or an e-mail address is counted; the name
  is cut at the first „;", at a web address and at „Contact:" and its
  like; and a head of more than 120 characters is a description, counted.
  Reason: fields were found holding an identity number, or naming a person
  in a sentence after the name, on rows without a sender's name to compare
  with. What remains possible is a person named inside the head in a form
  no test knows. **Any change to `namedOrganisationOf` is followed by a
  reading by hand of every name the rule newly shows,** through the built
  reader over whole windows.
- **WITHINFO and ANONYMOUS rows are named alike.** For an organisation
  the portal's own form publishes the organisation's details, its name
  included, either way; „anonymous" withholds the contact person's name.
  That person's name is read only for the name witness, inside the one
  function, and never copied into a result, a log, an error or a cache.
- **The text arrives and is dropped at the parser:** the contribution's
  text, its attachments, the login and the names are not in the parsed
  row, which has a fixed list of fields; a test feeds all of them and
  finds none in the output. Each listed contribution links its own page on
  the portal (`…/initiatives/<initiative>/F<number>_de`,
  `contributionPageUrl`), where the text is read. „Statement texts are
  linked, never fetched or parsed" (`docs/decisions/legal.md`) stays as it
  is for Parliament.
- **Names in memory only, six hours** (`FEEDBACK_NAMES_TTL_S`, the
  derived mount, memory in dev and production): consent to publication
  can be withdrawn after a window closed, so no name may outlive a restart
  or reach the disk or the fact store. The API answer says
  `Cache-Control: no-store` for the same reason.
- **A counted row keeps no date, no number and no link.** Persons
  (`EU_CITIZEN`, `NON_EU_CITIZEN`), „Sonstige" (`OTHER` and unknown kinds),
  organisations counted without a name and rows the portal does not list
  as published are never named rows. The parser builds two shapes: a named
  row keeps its day and number, a counted row only its kind, whether it is
  published and its country — so it cannot carry them by mistake, and a
  test feeds both with a day and a number and finds neither on a counted
  one. Per country only counts are kept (the citizens per country).
- Rejected: naming every row of an organisation kind (sole traders), the
  Parliament classifier as witness, and keeping names in the fact store
  for closed windows.

## How the list is read

- **On approach, the newest 1,000; more on request, up to 5,000**
  (`EU_FEEDBACK_AUTO_PAGES`): the block „Wer Rückmeldung gegeben hat"
  under each feedback period with contributions (`EuFeedbackBlock`) reads
  by itself up to ten pages of 100, newest first, through the portal's
  pacer, once, when it comes near the viewport (`useNearViewportSection`)
  — never with the page; each window's block asks on its own. Not
  unlimited: requests scale with the window at 2.5 s a page, and the
  largest windows are campaigns of persons, who are only counted. Further
  steps of five pages (`?seiten=15`, 20, … 50) are read only on a press,
  so the portal is asked only when a reader wants the answer; a higher
  fixed limit was rejected for that reason. The endpoint answers only for
  a publication that is a window of the initiative named, so it is no
  proxy for arbitrary numbers, and only for a step that is a multiple of
  five pages from 5 to 50 (any other is a 400).
- **Page one first, no page twice** (`feedbackOf`, `feedbackStageOf`,
  `nextAutomaticStep`). The block asks for page one first (`?teil=erste`,
  state `teilweise`, or `gelesen` where page one is the whole list or the
  first step is cached), then `?seiten=5` and, where more are counted,
  `?seiten=10`. Page one is cached in memory apart
  (`eu-portal-rueckmeldungen-erste`, after the naming rule, six hours) and
  the first step starts from it; a request in flight is shared, and every
  step's six hours count from page one's read.
- **Each step from the step before, five requests at most**
  (`readFeedbackStep`): every step is cached apart under its number of
  pages (`eu-portal-rueckmeldungen`, key `…-s10|f4`, memory, six hours from
  page one's read) and asks only for the pages it lacks, at most five per
  request, so a step fits the endpoint's 30 s at the pacer's 2.5 s. Where
  the step before is gone, the step begins again at page one and holds
  what five requests reach. Catching up in one request was rejected: it
  would break the 30 s and the five requests. A window's steps run one
  after the other (`serial`).
- **Rows that move between reads** (`readOlder`, `readNewer`). A
  contribution arriving between two reads pushes every row down, and a
  counted row keeps no number (and must not), so a repeat cannot be
  recognised afterwards. The guard is the portal's count (`totalElements`),
  the only field that says the list moved: the progress keeps the count at
  page one's read (the anchor) and at the latest read. Grown by k, the
  first k rows of the next page are repeats, skipped after being compared
  one by one with the rows read last (a named row by its number, a counted
  row by kind, status and country). A lower count, a skip off the page, a
  repeat that does not match, or a named row read twice is a misfit: the
  step reads again from page one, once, within its five requests; a second
  misfit is „Gerade nicht abrufbar". At the end of a run the rows that
  arrived since are taken from a fresh page one and the anchor moves
  there. Known blind spot: a withdrawal below the last row read while
  another arrives counts a counted row at the seam twice. `total` on the
  page is the latest count.

## How the list is shown

- **Until the automatic reading is complete, nothing counts, filters or
  orders:** the named rows read so far, newest first, and the pager; no
  tabs, chip, search, order, set line or closing rows — over part of the
  reading they would be wrong and change under the reader's eyes. A
  failed automatic step says „Gerade nicht abrufbar" with „Erneut
  versuchen" for that step, the rows kept and the controls still hidden.
- **One row per contribution, as a list of the Stellungnahmen**
  (maintainer, 15.11.2026; `EuFeedbackPanel`, words in
  `app/utils/euFeedback.ts`): date · name (the link to the contribution on
  the portal) · kind · country (`countryNameOf`). An organisation that
  answered twice stands twice — rows are never merged; one line per
  organisation was rejected because the reader wants to open
  contributions one by one. The kinds are tabs with their counts, search
  over the names above twenty rows, ten rows a page, order by date (the
  default), name or Land, each reversible. No order by a count, nothing
  „most active", and no figure stands for what a contribution achieved.
- **What is counted closes the list:** one muted row per figure, no link,
  no day, no country, after the last named row (e.g. „13 weitere
  Nichtregierungsorganisationen · ohne Namen"); hidden under the chip or
  a search. The tabs add up to the rows read. „Methode" under the list
  opens who is counted without a name (`MethodEuRueckmeldungen`).
- **The data knows no country, the view takes one.** The reading and the
  endpoint carry no member state (no parameter, nothing in the cache
  key); the view takes the country the page serves (`EU_MEMBER_STATE`)
  and offers a chip „Aus <Land>"; with none (null) there is no chip and
  nothing is said to be missing.
- **Search, filter and order reach only what was read,** so where the
  portal counts more, the list's first row, above the tabs (`ListBox`'s
  `frame` slot), says how many of how many („Gelesen sind die neuesten
  1.000 von 1.099 Rückmeldungen.") and offers „Weitere N lesen" (at most
  500; neutral outline, not blue). At 5,000 a „Nicht im Monitor" sentence
  says so, without a button. A step's reading is swapped in under the
  reader's tab, chip, search, order and paged rows, and the live region
  says its arrival once.
- **The set line only while narrowed** (maintainer, 16.11.2026,
  `feedbackSetLineVisible`): visible while a search or the country chip
  narrows the list, and where no organisation is named at all („Keine
  Organisation mit Namen unter den gelesenen Rückmeldungen."); otherwise
  `sr-only`, still the polite live region.
