---
paths:
  - "nuxt.config.ts"
  - "server/utils/{upstream,cache,http}/**"
  - "server/utils/laender/session.ts"
  - "server/utils/feeds.ts"
  - "server/routes/**"
  - "deploy/**"
  - ".github/workflows/**"
  - "app/composables/useDraftHalves.ts"
  - "server/middleware/**"
  - "server/plugins/**"
  - "server/utils/pool.ts"
---

# Foundations and operations

Rules that hold across the product and its operation: what it runs on, how it
reads upstream sources, addresses, caches, feeds and deploys. What an entry
holds, and the other areas: `docs/decisions.md`.

## Foundations

- **Anyone can run a copy for under €100 a year,** without the maintainer
  and without an organisation behind it: a successor must be able to take
  over on one domain and one small server. So no recurring paid service
  beyond those two, one domain for all countries (a country is a path
  segment), and the public address comes from configuration. Anything that
  needs a recurring bill is a layer the core runs without.
- **No third-party resources at runtime** (CLAUDE.md, „Legal"). Hosting only
  with EU-owned providers, not the EU regions of US hyperscalers (CLOUD
  Act). The build-time dependency on the npm registry is the documented
  compromise.
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
- **A section's anchor does not repeat its page** (maintainer, 24.11.2026).
  The path already names the page: `/ueber#a11y`, not `/ueber#about-a11y`.
  An id is a word or a short compound that reads on its own beside the
  path and is unique on its page (`about-status` for „Grenzen" is
  `limits`). Old anchors are not mapped, as with a moved address: an old
  one still opens the right page, at its top. The one exception is an
  anchor known to be linked from outside: `/impressum#imp-license` keeps
  answering as an empty target at the top of `#license` (`ProseSection`'s
  `formerId`).
- **Upstream blocks are respected, not circumvented:** one request per second
  and a two-hour pause after a 403 at Steiermark's firewall; EUR-Lex's bot
  check is not bypassed, only the Cellar is queried (§12.64, §12.66). The
  `User-Agent` is never changed to get past a block, and a probe of a Land's
  site goes through the shared session and its pace too
  (`laender/session.ts`, `SitePacer`). A local test does not show where a
  firewall draws its line, so after a deploy that adds or changes a session
  reader the journal is read for 403s.
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

## Language models

- **No model call while serving a request.** If summaries are ever built:
  generated once into a data file keyed by a content hash, marked as
  machine-generated, above the legal text and never instead of it, and for
  drafts only, never for Stellungnahmen (§12.11).

## Feeds and calendars

- **One source per subscription** (`?quelle=`): the Bund at the bare address,
  each Land, and `parlament` (23.11.2026). New kinds get a source of their
  own, so nothing arrives unasked in an existing subscription.
- **`?quelle=parlament` is RSS only.** It carries what takes Stellungnahmen
  right now (`getOpenVorlagen`): Regierungsvorlagen, Ausschussanträge and
  motions of the Bundesrat, dated by Einlangen. They publish no Frist, so no
  calendar holds them. A Vorlage on a Staatsvertrag takes no Stellungnahme
  and is not in it; a law without a draft offers nothing to act on and is
  not either.
- **The 50-item cap never cuts a running Frist** (23.11.2026). Burgenland's
  drafts have no start date; a draft without a start is ordered by
  `landDraftDate` and prints no `pubDate`: that day is not when it appeared.
- **A running Land Frist outlives the Bund's period** (`landDraftInWindow`):
  a Nationalrat election ends no Land's Begutachtung.
- **An unreadable Land: RSS may shrink, a calendar may not.** While a Land's
  whole list cannot be read, its RSS carries the running drafts and names
  the gap in the channel description; a reader keeps what it has seen. Its
  calendar answers 503, because the app would delete every event missing
  from a shorter answer.

## Operations

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
- **Memory:** `--max-old-space-size=320`, `MemoryMax=704M`,
  `MemorySwapMax=0`, so a leak hits V8's clean limit and restarts instead of
  swapping. Through the deploy sequence and then every draft's comparison,
  the built server peaked at 288 MB of heap before a collection and 234 MB
  live after a full one (22./23.11.2026). The process's total on a Mac is
  not production's figure, so compare two revisions on the same machine
  rather than read one alone.
- **Measure bundle size only after a clean install.** `node_modules` keeps
  orphaned packages and Nitro's trace picks them up (13.8 MB against
  5.26 MB for one commit).

## Rejected alternatives

- **A health endpoint, a dead man's switch, a status page.** Stale data is
  labelled on the page, and a failed prewarm costs seconds (§12.7).
- **A language model for the Erläuterungen.** The typed RIS XML is parsed
  (§12.29).
- **Two lanes in the upstream slot queue** (`upstream/fetch.ts`). Only
  several fan-outs at once add 0.5–2 s to a cold draft request
  (12.11.2026). Not built until a slow Parliament shows a queue in
  practice.
- **Our own copy of the law in force** (for a page per law). RIS holds the
  text and `FassungVom` serves every reference date; a copy would be a sync
  job with no gain.
- **Renaming the path word `/entwuerfe` now.** The address was renamed once
  already, and a restructure with a country segment is planned: rename at
  most once, then. Candidate for that day: `/verfahren` — a page is one
  procedure, which holds for drafts that end, laws without a draft and
  Verordnungen, and the new pages' API already says `verfahren`.
  `/gesetze` is rejected: most drafts never become one.
