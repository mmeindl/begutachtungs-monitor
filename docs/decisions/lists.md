---
paths:
  - "app/pages/{index,suche}.vue"
  - "app/pages/entwuerfe/index.vue"
  - "app/pages/anliegen/index.vue"
  - "app/composables/{useDraftList,useDraftFilters,useFullTextSearch,useArrivalQuery,usePagedList}.ts"
  - "app/utils/{doors,draftFilters,siteSearch,listState,entryView,pagedList}.ts"
  - "app/components/{entry,search}/**"
  - "app/components/ui/{SpanSelect,SpanCutNote,DateRangeButton}.vue"
  - "shared/utils/{searchHaystack,periodCalendar,draftOrder,queryParams}.ts"
  - "server/api/suche.get.ts"
  - "server/utils/search/**"
  - "server/api/dashboard/**"
  - "server/api/dashboard.get.ts"
---

# The lists, the homepage and search

The lists (`/entwuerfe`, `/anliegen`), their filters and spans, the homepage
and the site search. What an entry holds, and the other areas:
`docs/decisions.md`. How a list loads and what its notes say:
`docs/decisions/ui.md`.

## The lists and the homepage

- **An open Vorlage or motion without a draft stands under the tab of its
  own station** (16.11.2026, `OpenVorlage.station`, `stationFor` on list
  101's status), as a draft's row does: „Regierungsvorlage" while the
  Nationalrat has it, „Parlament" once it is decided, at the Bundesrat or
  sent back to committee. A motion (Ausschussantrag, Gesetzesantrag des
  Bundesrates, Initiativantrag) stands under „Parlament" from its Einlangen,
  as `/wege` draws its path („entfällt" at the Regierungsvorlage): the tab
  „Regierungsvorlage" holds the government's Vorlagen only
  (`openVorlageStationOf` by the kind, `antragStationOf`).
- **The strip selects one station at most, and the address names one**
  (`parseStations`, 16.11.2026, maintainer's decision): no control of the
  page can produce two at once, so a link may not either. The homepage's
  door „Stellung nehmen im Parlament" opens „Parlament / Landtag". Under
  „Stellungnahme möglich" each of the two tabs alone points to the other
  with the rows it holds under the same filters („1 weitere unter
  „Parlament / Landtag“ →", `otherOpenStation`), counted by the same steps
  as the list's own rows and left out while a part of the count is loading
  or failed, never „0 weitere".
- **Between the open window and the law, rows without a draft are named,
  not dropped** (`withoutDraftGapDe`, 16.11.2026). A Regierungsvorlage
  without a draft, an Ausschussantrag and a Gesetzesantrag aus dem
  Bundesrat are no row of any source there (beschlossen, abgelehnt,
  verfallen); under „Regierungsvorlage" and „Parlament / Landtag" without
  „Stellungnahme möglich" one „Nicht im Monitor" sentence names them in one
  line. The states it means and where the Initiativanträge stand are the
  list's „Methode" (`MethodEntwurfsliste`).
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
  each ending in a blue „→" after its status, always shown. Each of the
  four rows is bounded by a hairline above and below, so each target shows
  where it begins and ends; no line above the first door (maintainer,
  16.11.2026). „Was daraus wurde" holds the newest laws, then the ranking:
  what changes after every plenary week above what spans the whole period
  (maintainer, 17.11.2026). „Beschlossen, noch nicht kundgemacht" is on
  `/entwuerfe` only. Doors are data tagged with their jurisdiction
  (`WEGE_STATE`, `'eu'`), so a country's segment (`/at`) and a second
  country are configuration.

## „Ohne Entwurf" and the select „Art"

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
  Land). „Gesetzesentwürfe" holds drafts only. URL: `art` +
  `begutachtung=ohne`, with `art=andere` and
  `begutachtung=ohne&art=landesgesetz`; a mismatched pair drops. „Alle ohne
  Entwurf" keeps the meaning of Bund and Salzburg's „ohne Begutachtung" and
  is therefore smaller than its group: the Landesgesetze option takes every
  Land's law the count line calls „ohne zugeordneten Entwurf", which claims
  nothing about a Begutachtung, and never a plain „Landesgesetz" before the
  register's reach (those are counted in a note).
- **An option that cannot apply stands disabled and names its reason after
  its label in short words** („– gerade nicht abrufbar"), since a greyed
  option without a word reads as a broken menu and a disabled option gives
  a screen reader no tooltip; a link that asks for it gets „Alle Arten" and
  one note naming the long reason. An option's availability is known before
  it is chosen: what the sources alone rule out (no Bund and no Salzburg,
  no Land, no Bund for „Andere") is disabled on the first render,
  server-side too; what only an answer can tell (the Bund's laws, else
  Salzburg's) is asked for under every option, the four draft options
  included, and stays enabled until the answer says otherwise — unknown is
  not unavailable. An answer the page will ask again for (`pending`, or
  `unread` while its retries last; for Salzburg statements still being
  read) is unknown too: the options stay enabled and the list says „noch
  geladen" under them; only the answer after the last retry disables. A
  Land's law whose „ohne Begutachtung" could not be read (`unread`, or
  `pending` after the last retry) is not dropped from the group's options
  in silence: the list counts it per Land in one „Gerade nicht abrufbar"
  sentence (`ohneUnreadCounts`). Under a draft option those answers are
  never shown, counted or announced, and the open Vorlagen, which decide
  nothing, are not fetched (`withoutDraftRequests`).
- **„Alle mit Entwurf" is exactly its group's sum** (`begutachtung=mit`,
  first of „Mit Entwurf"): every draft, no row without one; beside a draft
  kind the parameter drops. „Gesetzesentwürfe, als Initiativantrag
  eingebracht" (`art=als-antrag`, after „Gesetzesentwürfe") is not part of
  that sum but a subset of both: the Bund's Ministerialentwürfe whose row
  says „als Initiativantrag …" (`antragRouteCitation`, the row's own
  condition). It is the list's one filter on an inferred fact (the wording
  match of `antragPath.ts`, plus the stated successor of a Beschluss not
  promulgated), and its rows state the route themselves; outside the
  periods the table covers, or without the chains, it stands disabled with
  its reason, never as an empty list.

## The span select

- **The list filters by a time span; the Bund's GP names it** (14.11.2026).
  The Länder have periods of their own, so a Land's draft falls into the
  span in which its Begutachtung began, both ends inclusive (`gpWindow`,
  `readLaenderInWindow`). The select „Zeitraum" states the dates („seit
  24.10.2024 (GP XXVIII)", `gpSpanLabelDe`) instead of a note explaining
  the rule; value and `?gp=` stay the GP code. Not per-Land period
  selectors: ten controls for one question, and spans that compare with
  nothing. A Land's own periods are offered where one Land is in view
  alone (next entry).
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
  press opens a calendar in the site's own face (`DateRangeButton`), since
  the browser's native date picker cannot be styled or localised by the
  page. An open end reads „heute" and stays open.
  `?von=2026-11-09&bis=2026-11-15`, `bis` optional (open-ended): a link a
  team shares so everybody reviews the same rows, week by week. While it is
  set it is the span: no `gp` or `landtag` in the link beside it, and
  choosing a period drops it; two controls on one axis would intersect into
  an empty list that reads as a finding. Every half is still fetched per
  Bund period — the one the span lies in — and the page cuts each row set
  where the search term cuts it, so counts and pointer count the list. A
  row falls in by the day the order dates it by (`rowDay`): a draft by the
  start of its Begutachtung (Einlangen, RIS's Beginn, a Land's
  `landDraftDate`), a law without a draft by its Kundmachung. A row without
  a day falls in no span. A span over a Periodenwechsel shows its part in
  the later period and names the earlier part with a link („Nicht im
  Monitor"): uniting several Bund periods would make every list endpoint
  answer for several at once, and a weekly review never crosses one. The
  full text does not run under it: its hits know no date. Ends written the
  wrong way round are turned round; a `bis` without `von` is dropped. It
  opens on the running calendar week, from Monday. No day after today:
  every day a list cuts by lies in the past, so the calendar ends with
  today, a link's later `bis` becomes the open end and a later `von` no
  span (`orderedRange`). Today itself stays a fixed end, so a shared link
  keeps its days. Every list with a „Zeitraum" offers it and draws it
  through one component (`SpanSelect`, the Periodenwechsel note
  `SpanCutNote`): /entwuerfe and /anliegen. On /anliegen a row falls in by
  the day it arrived (`arrivedAt`) and the count line says „eingelangt";
  the calendar starts with `ANLIEGEN_FIRST_LIST_GP`, and a link's earlier
  start moves there. The tab „Petitionen an den Bundesrat" is cut by the
  reader's days unclipped, since the Bundesrat has no period.

## Search

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
    list's: the draft list through `useDraftList` (its filters read
    `/suche`'s address without writing it, `syncUrl: false`), the Anliegen
    through `anliegenSearchRows` (open and closed, the link carries
    `alle=1`), the EU lists through their view functions and `haystack`. A
    count here that differs from the list behind its link is a defect.
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

## Rejected alternatives

- **Our own full-text index.** RIS already indexes the full text; a copy
  means operating it (§12.31).
- **Full-text search over all periods.** A different question; the archive is
  linked at RIS (§12.31).
- **Caching search results by query.** Unbounded keys in a RAM cache; the
  documents are cached instead (§12.31).
- **A separate list or route for drafts without a Gegenstand.** One list with
  separate counts (§12.19).
- **A separate „Neu" list, or sorting by title.** A third of titles start
  with „Änderung" or „Verordnung"; the marker and the feed cover it (§12.22).
- **Pagination that takes rows out of the DOM.** Every organisation's name
  stays in the SSR HTML so the organisation can find itself (§12.15).
- **Truncating titles.** Official titles put the distinguishing part at the
  end (§12.28).
