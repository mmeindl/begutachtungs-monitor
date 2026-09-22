# Refactor plan — polishing the grown structure (September 2026)

Written 2026-09-22 against the working tree at commit 18bfd56 plus the staged
Begründungsvergleich work. Line numbers below are from that state and will
drift; the file:line pairs are pointers, not contracts. Every claim marked
**verified** was re-checked by hand in this session; the rest comes from a
full read of the area and carries a grep.

Baseline: 50 test files, 1083 tests green in under a second; `pnpm typecheck`
and `pnpm typecheck:tools` both clean. No lint tooling exists.

---

## 0. Verdict

The architecture is sound and should not change: two upstreams behind a
caching Nitro proxy, pure parsers with tests beside Nitro-bound `*Service`
modules, one `shared/` layer for both runtimes, cache rules enforced by a
test, GDPR filtering server-side. Every one of the six areas audited came
back "better organised than its size suggests". Nothing in this plan alters
what the code decides.

What has accreted, in order of cost:

1. **Narrative weight.** 40 % of all lines in `app/`, `server/` and `shared/`
   are comments (13.365 of 33.234). Roughly a third of those are dated
   measurement stories that already stand verbatim in
   `docs/architecture.md` §12, and about a fifth are German, concentrated
   in files first committed on or after 2026-09-15. The German split is
   chronological, not topical.
2. **Duplication that grew from parallel work.** The two comparison
   sections (`LawDiffSection.vue`, `TextComparisonSection.vue`) are one
   component written twice. Seven hand-written HTTP clients, five worker
   pools, three budget races, three Jaccards, eight copies of one TTL
   constant, five copies of the script argument parser.
3. **Flat directories past their carrying capacity.** 53 files in
   `server/utils/`, 29 in `app/components/`, 27 in `scripts/`, one
   1456-line `shared/types.ts`. Six files hold more than one job:
   `annexCheck.ts` (nine concerns, 52 exports), `textComparison.ts` (four),
   `parliament.ts` (four), `mappers.ts` (five), `lawTitles.ts` (four),
   `risJoin.ts` (join + a title toolkit four other modules borrow).

Three product bugs surfaced on the way (§1). They come first and are not
part of the refactor.

### Principles for every step

- **Move, never change.** Thresholds, rule orders, regex literals, the
  two-source read order and every `return fail(...)` in `novao.ts` are
  measured decisions. The consolidated do-not-touch register is §9.
- **One mechanical step per commit**, tests and both typechecks green
  after each. Folder moves and content changes never share a commit.
- **The cache-layer guard moves first.** `tests/cacheLayers.test.ts:52`
  scans `server/utils` flat (**verified**). It must walk recursively
  before any cached function moves into a subfolder, or the invariant
  for cache rule 5 silently stops being enforced.
- **Nitro auto-imports share one namespace** across `server/utils/**` and
  `shared/utils/**`. Every extracted helper needs a collision-free name
  (`reasoningDiff.ts:36` and `shared/utils/explanations.ts:12` record two
  past collisions). Nitro 2.13.4 scans `utils/**/*` recursively
  (**verified** in the installed package), so subfolders are safe.
- **Comments: keep the decision, the number and the rejected alternative.
  Move the story.** A block that re-tells a §12 section becomes the one
  sentence a future reader needs in order not to undo the decision, plus
  the pointer.
- **All comments in English.** German stays only where it is data or
  copy: regex and phrase literals, `REASON_*` and `WITHHOLD_LABEL` strings,
  quoted UI output, quoted passages from upstream documents, and the
  German display strings the drift job writes into GitHub issues
  (`scripts/annex-report.ts:207-225`). German domain terms stay as terms
  inside English sentences. Spelling stays „Paragraph".

---

## 1. Bugs found on the way — fix first, separate commits

| # | What | Where | Status |
|---|---|---|---|
| B1 | **Upstream failures cached for 24 h as an answer.** Three `.catch(() => null)` / `catch { [] }` inside the derived, 24-h `amended-laws` cache. A short Parliament or RIS blip pins "this draft changes no law" or drops every RIS link on the Geltendes-Recht section for a day. `konsCache.ts:43-49` documents this exact class as fixed once before. | `server/utils/amendedLawsService.ts:69,77,83,126` | **verified** |
| B2 | **RIS page footer leaks into the Erläuterungen.** `parseRisXml` strips `kzinhalt` and `layoutdaten` but not `fzinhalt`; the two sibling parsers strip all three. The footer (`www.ris.bka.gv.at … Seite 2 von 2`) lands in an anonymous passage. **Measured 22.09.2026 over the full offline cache:** 180 of 314 readable Erläuterungen documents leak today; stripping the element leaves 0; the `chars` inflation is 0,06 %, so folding is unaffected and the visible passage is the whole problem. Decided: strip. Re-run `pnpm audit:erlaeuterungen` after, for the record. | `server/utils/lawText.ts:605` vs `lawStructure.ts:50`, `textComparison.ts:99` | **verified + measured** |
| B3 | **The calendar day is frozen into a 30-minute cache.** `getRisOnlyForGp` computes `today()` inside the cached body and keys only by GP, so `active` can disagree with the Parliament half (which applies `reconcileActive` per request) for up to 30 minutes after midnight. | `server/utils/risOnly.ts:134,143` vs `parliament.ts:365-376` | **verified** |
| B4 | **Local function shadows a shared auto-import.** `TextComparisonSection.vue` defines `matchesQuery(row, q)` with different semantics than `shared/utils/searchQuery.matchesQuery`. Deleting the local one would silently bind to the shared one. Rename to `rowMatches`. | `app/components/TextComparisonSection.vue:195` | **verified** |
| B5 | **Index-based `v-for` keys on lists that change under search.** Block kinds change with the query, so Vue may reuse a unit `div` as a `<details>` and carry open state onto a different §. | `LawDiffSection.vue:667`, `TextComparisonSection.vue:816,875,887` | agent, plausible |
| B6 | **Three hand-rolled budget races leak their timer.** `withinBudget()` exists, is tested and clears its timer; the three copies do not. | `api/drafts/index.get.ts:94`, `api/ris-drafts/index.get.ts:124`, `api/ris-drafts/[id].get.ts:35` | **verified** |
| B7 | **Wrong comment on a real cost.** `konsService.ts:134-135` claims both annex paths share one cache hit. True for XML, false for PDF: the PDF byte cache is bypassed in production by design (`annexPdfService.ts:65`), so `/konsolidiert` and `/gegenueberstellung` each fetch and parse the PDF. Fix the comment; consider a derived cache over the *parse* keyed by URL. | `server/utils/konsService.ts:134`, `annexPdfService.ts:65` | **verified** |
| B8 | Closed BGBl years re-derived four times a day with the running-year TTL. | `server/utils/bgblService.ts:138` | agent |

---

## 2. Tooling — do this before touching structure

1. **Add ESLint via `@nuxt/eslint`** (flat config, the Nuxt 4 standard),
   with its `stylistic` option for formatting. **Decided 22.09.2026: no
   Prettier** — one tool, one config, and the stylistic rules are
   autofixable via `eslint --fix`. Rules that pay for themselves here: `no-unused-vars`,
   `@typescript-eslint/no-unused-vars`, `import/no-duplicates`,
   `vue/no-unused-properties`. Then either delete the 28
   `eslint-disable` comments in 10 files that currently suppress nothing
   (**verified**) or keep the ones the real linter needs.
2. **`noUnusedLocals: true` in `tsconfig.tools.json`**, so a dead helper
   like `firstDifference` in `scripts/kons-harness.ts:800` (**verified**
   unused) fails the build next time.
3. **Recursive scan in `tests/cacheLayers.test.ts`** (see §0).
4. **Add `pnpm lint` to `ci.yml`** beside test and the two typechecks.
5. **Convert the three `.mjs` scripts to `.ts`** so they enter
   `typecheck:tools`; they are ~1.330 lines that nothing checks today.
   `scripts/dev-watch-fallback.cjs` stays `.cjs` (loaded via `--require`).
6. **Component tests — the trade-off in full, and the decision.** No
   `.vue` file has a test today; the 1083 tests all cover `shared/` and
   `server/`. The question is how the phase-5 dedup of the two comparison
   sections gets verified.

   *What a component-test stack would give.* `@nuxt/test-utils` with
   `@vue/test-utils` and `happy-dom` lets Vitest mount a component in a
   Nuxt-aware environment: auto-imports resolve, `useFetch` can be mocked
   with `registerEndpoint`, and a test can assert that `DiffText` renders a
   `<del>` for a removed segment or that `DiffGroupHeader` emits `toggle`.
   That is real protection for *behavioural* contracts: which branch
   renders, which event fires, which aria-label is set.

   *What it costs.* Three new devDependencies and a second Vitest project
   (the Nuxt environment is separate from the node environment the pure
   tests use, and it is slower: seconds of environment boot instead of the
   current sub-second run). Each component test needs fixtures for the
   response types it consumes (`LawDiffResponse` has ~15 fields per unit),
   and those fixtures then need maintaining with every type change. It is
   a standing cost, small but permanent.

   *What it would not catch.* The dedup risk is mostly *visual*: the same
   segment loop now renders through one component, and the question is
   whether the six call sites still look identical — spacing, the pill
   classes, the gutter, the `<details>` open state. A DOM assertion can
   check class strings, but it cannot see a 2 px shift or a wrapped pill.
   Only pixels can.

   *What screenshots give.* The existing headless-Chrome method renders the
   running app at a fixed width. Two drafts cover the surfaces: one
   Ministerialentwurf with an enactment (both comparison sections, all
   badge kinds, the folded groups), one with a readable annex (the
   Textgegenüberstellung rows and the consolidated text). Screenshot
   before, apply the dedup, screenshot after, diff. That catches exactly
   the class of regression the dedup can introduce, costs nothing
   permanent, and the artefacts are throwaway.

   *What screenshots do not give.* Interaction: the search field, the
   toggle, the "Alle anzeigen" step. Those are covered differently: the
   pure logic behind them (`diffBadges.ts`, the filter predicates, the
   grouping) leaves the components in phase 5 and lands in Vitest, where
   it is cheap and fast. What remains inside the components after that is
   template and event wiring, small enough to check by hand once.

   **Decision (22.09.2026): screenshots plus pure-logic tests for phase 5;
   no component-test stack now.** The concrete trigger for reopening this:
   if the screenshot round finds a regression that a DOM assertion would
   have caught, or once a component carries logic that cannot be pulled
   out (a stateful interaction with no pure core), add `@nuxt/test-utils`
   for that component only.

---

## 3. Dead code and unread fields — one commit each, cheapest wins

**Delete (verified unused, one reference each = the definition):**
- `server/utils/lawApply.ts:324` `paraKey`
- `server/utils/risKons.ts:334` `fetchParagraphHeading`
- `scripts/kons-harness.ts:800` `firstDifference`
- `shared/utils/outcomes.ts:33` `RV_BASE_RATES_MEASURED_ON`
- `app/assets/css/main.css:100` `--color-status-warning`
- `app/pages/entwuerfe/[gp]/[inr].vue:11` the `stations` import (only
  prose mentions remain)
- `app/components/ErrorState.vue:5` prop `description` (no call site
  passes it)
- Orphaned or double JSDoc blocks: `LawDiffSection.vue:216`,
  `shared/types.ts:724-733` (documents `ParagraphTitlesResponse`, sits on
  `AmendedLaw`), `shared/types.ts:702-714`, `novao.ts:347-355` (documents
  `parseAddressList`, attached to `splitPluralParagraphs`),
  `shared/utils/lawStations.ts:179-185`, `shared/utils/draftOrder.ts:31-48`
  (the `compareDrafts` rationale sits on `draftOrderKey`),
  `scripts/erl-diff-corpus.ts:77-85`
- `mappers.ts:822-825` a section banner with no code under it

**Response fields produced but never read by the app (verified by grep):**

| Field | Producer | Note |
|---|---|---|
| `ConsolidatedParagraph.before` / `.after` | `konsService.ts:299-300` | **Whole § texts, both versions, up to 80 §§ per draft page.** Largest payload win in the plan. **Decided 22.09.2026: drop both**; rebuilt when a view needs them. |
| `ConsolidatedParagraph.law` / `.article` / `.label` | `konsService.ts:292-295` | unread (`heading` is read) |
| `ConsolidatedTextResponse.withheld` / `.available` / `.unavailableReason` / `.asOf` | `konsService.ts` | consumer reads only `paragraphs` and `touched` |
| `DashboardPayload.stats.openCount` / `.closingWithin7Days` / `.statementsTotalGp` | `api/dashboard.get.ts:18-34` | leftovers of the removed stat tiles (§12.20); only `consultationsTotalGp` is read. Removing `closingWithin7Days` makes `DEADLINE_SERIOUS_DAYS` module-internal and `deadlines.ts` app-only. |
| `DraftDetail.trace` | `parliament.ts:768` | its own comment calls it raw material |
| `TextComparisonRow.marked` | `textComparison.ts:1029`, `annexPdf.ts:859` | one test asserts it is produced, nothing reads it |
| `LawDiffUnit.similarity` | `lawDiff.ts:421` | only `TokenDiff.similarity` is read |
| `BegutSearchResponse.terms` / `.located` | `begutSearchService.ts:396` | the page highlights from `snippet` |
| `RisMapRow.beginnOffsetDays` | `ris.ts:169` | unread |
| `ReasoningDiffResponse.available` / `.unavailableReason` / `.rvCitation`, `ParagraphTitlesResponse.gp` / `.inr` | services | keep `available`/`unavailableReason` only if the section will ever print them |

**Un-export, keep (internal to their file):** `novaoNumber`
(`lawText.ts:285`), `RIS_KONS_BASE`, `LAW_BOUNDARY_RE`, `LAW_TITLE_RE`,
`cloneLaw`, `joinPhrase`, `parseSatz`, `Matrix`, `RawViewport`,
`DEADLINE_CRITICAL_DAYS`, `FristDivergence`, `lawStationIndex`,
`ResolvedLawStation`, and the ~35 server exports the server audit lists
that never leave their file (`FilterListResponse`, `GpDrafts`, the risJoin
score internals, the listHeaders column tables …). Each costs a global in
`.nuxt/types/nitro-imports.d.ts` (420 entries today).

**Keep exported, but label:** the measured surface that exists so
harnesses and tests can reach it (`annexCheck` thresholds and `REASON_*`,
`applyReport`, `risJoin.dateScore`, `feeds.fnv1a64` …). One banner per
file: `// --- measured surface: exported for tests and scripts ---`. A
future dead-code sweep must not misread these.

**Unused default parameters:** `formatLawList(entries, max)`,
`explanationsByParagraph(doc, articles = [])`, `buildSnippet(…, radius)`,
`blocksFromPlainText(text, maxLen)`, `linesFromPage(page, boundary?)`,
`parseAnnexPdf(pages, articles = [])` — the first two can lose the
default; the rest are test seams and get a one-line comment saying so.

**Not dead, looks dead:** `/api/bgbl/teil2`, `/api/ris-map/:gp`,
`/api/stations/:gp` are prewarm targets of
`deploy/systemd/begutachtungs-monitor-prewarm.service` (**verified**).
Mark them (`server/api/_prewarm/` or a `@prewarm-only` line).
`app/pages/live.vue` is the fixed address for the Demokratiewoche workshop
on 2026-10-22 with `MEETING_URL = ''` as the intended switch. The five
`shared/types.ts` types nothing imports by name (`RisJoinStatus`,
`RisNamedDocument`, `ExplanationsPassageView`, `BegutSearchSnippet`,
`BegutSearchEntry`) are structurally referenced inside the contract and
stay exported.

---

## 4. Target structure

### 4.1 `server/utils/` — domain folders, and split only the six multi-job files

Group by domain first. Splitting every file into one-function modules
would trade a flat directory for a deep one; the six files named in §0
are the ones whose size hides more than one job.

```
server/utils/
  http/           params.ts (+ readGpParam, readRisId, readListQuery)  respond.ts (ETag/304)  budget.ts
  cache/          base.ts (DERIVED_CACHE)  ttl.ts (three named TTLs with their reasoning)
  upstream/       fetch.ts (retry, timeout, UA, byte cap, OGD error envelope)  parliament.ts  ris.ts  bgbl.ts
  parliament/     list81.ts  list142.ts  list101.ts  detailJson.ts  html.ts  dates.ts     ← mappers.ts split
                  privacy.ts (content untouched)  listHeaders.ts  lastgood.ts  statementDocument.ts
                  organisations.ts (the org-grouping algorithm)  draftDetail.ts (uncached assembly)
                  stationMap.ts  related.ts  precedingDraft.ts
  ris/            risRecord.ts  risJoin.ts  titleSimilarity.ts  ministryCodes.ts  risOnly.ts  kons.ts (request half of risKons)
                  bgblJoin.ts  bgblService.ts
  lawtext/        normalize.ts  parliamentHtml.ts  risXml.ts (one strip-list home, + fzinhalt)  units.ts
                  konsTree.ts (= lawStructure.ts)  lawNames.ts (bgbl citations, both tokenizers, one jaccard, thresholds)
                  articles.ts  instructionAddress.ts (from lawTitles)
  diff/           words.ts (diffTokens, bagSimilarity, isEditorialChange)  align.ts  lawDiff.ts
                  lawDiffService.ts  paraTitleService.ts  lawStations.ts  fetchDocument.ts (was fetchLawHtml)
  annex/          elements.ts  cells.ts  elision.ts  rows.ts             ← textComparison.ts split
                  boundaries.ts  pdfPages.ts  pdf.ts  draftUnits.ts
                  text.ts  coverage.ts  rightColumn.ts  verdict.ts  gateRows.ts   ← annexCheck.ts split along its own banners
                  annexSource.ts (READ_PARLIAMENT_COPY, annexSourceFor)  guardService.ts  pdfService.ts  textComparisonService.ts
  kons/           novao.ts  lawApply.ts  applyGuard.ts  gate.ts  cache.ts  service.ts  tguOracle.ts
  explanations/   ris.ts  html.ts  join.ts  service.ts  reasoningDiff.ts  reasoningDiffService.ts
  search/         begutSearch.ts  searchHaystack.ts  begutSearchService.ts
  harness/        applyReport.ts  risKonsHistory.ts (the six script-only RIS history functions)
  text/           tokens.ts  designation.ts (bareParaId, labelKey)  match.ts (pickClearWinner)
  feeds.ts  pool.ts (mapWithConcurrency, replaces five copies)
```

Cost: ~155 import lines in `scripts/` and `tests/`, ~80 inside `server/`.
Do one folder per commit.

**Shared helpers to create once (all verified duplicated):**
`upstream/fetch.ts` (11 raw `fetch(` sites in 7 files, `USER_AGENT`
declared six times, `sleep` twice, `RIS_API_BASE` three times,
`TIMEOUT_MS` five times); `pool.ts` (five pools; keep the fail-fast
semantics `annexCheck.ts:1352-1354` documents); `cache/ttl.ts`
(`TTL_S = 24 h` in eight files, `DOCUMENT_TTL_S = 30 d` in four — but keep
`RIS_CORPUS_TTL_S = 20 h` separate, it is 20 on purpose); `http/respond.ts`
(the ETag block copied into all five routes); a single `jaccard`;
`textNodes` into `konsTree.ts`; `paraId`/`labelKey`/`addressOf` into
`text/designation.ts` and `novao.ts`.

**Do not merge, only co-locate and rename:** the two law-name tokenizers
(`lawDiff.lawNameTokens` vs `lawTitles.titleTokens`), the four
§-designation normalisers (`designationKey`, `paraId`, `paraIdOfGld`,
`idOfMarker`), the two `ANNOTATION_RE` (the annex one is a deliberate
superset), the three `STRIP` lists until measured. They differ on
purpose; today only some say so.

**Handlers.** Eleven of 29 are already thin. Move the logic out of
`api/dashboard/enacted.get.ts:50-130`, `api/drafts/index.get.ts:125-176`,
`api/ris-drafts/index.get.ts:129-158`, `rv-stellungnahmen.get.ts:17-22`;
unify the two `aktuell` spellings; state in one line that a page route
answers 404 where the API answers 400 for the same malformed id.

### 4.2 `shared/` — barrel the types, shelve the app-only utils

- **`shared/types.ts` → `shared/types/` behind `index.ts`.** All 85 import
  lines in four spellings keep resolving (`moduleResolution: Bundler`
  resolves the directory). Files: `common`, `drafts`, `statements`,
  `dashboard`, `ris`, `lawDiff`, `annex`, `explanations`, `search`,
  `bgbl`. Zero call-site changes.
- **Move six app-only modules to `app/utils/`** (Nuxt auto-imports it):
  `stations.ts` (→ `spine.ts`), `entryView.ts`, `deadlines.ts`,
  `outcomes.ts`, `lawPackage.ts`, `search.ts`. None is imported by the
  server; all are German UI copy or view models. 24 explicit import lines.
  **Decided 22.09.2026: `shared/` means "both runtimes import it"** — the
  six move. Write that rule into `docs/architecture.md` §5 so the next
  app-only module is created in `app/utils/` from the start. Pure app
  modules stay Vitest-reachable there (relative imports, no Vue).
- **One wording for one fact.** `fristLabel` prints „Endete am 24.08.2026"
  (the deadline chip and the inline date on both detail pages);
  `endedState` prints „Frist endete 24.08.2026" (the row detail under
  „Begutachtung abgeschlossen" / „Bisher keine Regierungsvorlage"). Same
  fact, two strings — what §12.28 set out to remove. Recommendation: one
  `fristEndedDe(deadline)` = „Frist endete am {date}", used by both: it is
  grammatical German where the row form is telegram style, and it matches
  the chip's dateless sibling „Frist abgelaufen". Needs one yes.
- **Merge `search.ts` + `searchQuery.ts` → `textMatch.ts`.** Same
  AND-token algorithm, different normalisers; today the Stellungnahmen
  list folds umlauts and the draft list does not — a user-visible
  inconsistency. One `matchesQuery(haystack, q, { fold })`.
- **Give `DraftStation` the `lawStations.ts` treatment.** The runtime array
  `['begutachtung','rv','parlament','bgbl']` is spelled out in
  `api/drafts/index.get.ts:15`, `api/ris-drafts/index.get.ts:30` and
  `app/pages/entwuerfe/index.vue:78-84` (**verified**); add
  `DRAFT_STATION_ORDER` / `DRAFT_STATION_LABEL` to `draftChain.ts`
  (rename → `draftStations.ts`).
- Renames: `query.ts` → `queryParams.ts` (it is not search),
  `aliases.ts`/`CONSULTATION_ALIASES` → `draftAliases.ts`/`DRAFT_ALIASES`
  (keys are drafts), `explanations.ts` → `explanationKey.ts`.
- One `bgblShort()` in `format.ts` for the `Bundesgesetzblatt → BGBl.`
  replace written three times; one `STATUS_FINISHED`.

### 4.3 `app/` — subfolders, six new components, three composables

Component registration is by bare file name (`pathPrefix: false`), so
subfolders cost nothing but the existing "names globally unique" rule.

```
app/components/
  chrome/      AppHeader  AppFooter
  ui/          EmptyState  ErrorState  LoadingState  FetchGate*  ExternalLink  TokenSelect  ListHeader  ListMore  SectionCredits  SubscribeLinks*
  entry/       EntryList  EntryItem  EntryState  DeadlineBadge  MinistryBadge  NewBadge  SearchEvidence
  draft/       DraftHeader*  DraftBackLink*  DraftDescription  DocumentList  SpineRail  BgblOutcomeBlock
  statements/  StatementsPanel  StatementRow  OrganisationStatementLinks  StatementDocumentTag  RvStatements
  compare/     LawDiffSection  TextComparisonSection  ExplanationsSection  DiffText*  DiffGroupHeader*  DiffToolbar*
app/composables/  useExplanations  useStatementDocuments  useFeedUrls  useDraftFilters*  useFullTextSearch*  useFoldedGroups*
app/utils/        spine  entryView  deadlines  outcomes  lawPackage  (from shared/, §4.2)  + new pure modules below
```

**New components, in order of payoff (all verified duplicated):**

1. `DiffText` — props `segments: LawDiffSegment[]`, `side?: 'from'|'to'`.
   Replaces the `<del>/<ins>/<span>` loop written at
   `LawDiffSection.vue:711,728,738,762` and
   `TextComparisonSection.vue:904,924,934,972,986`, plus both
   `sideSegments()` helpers and both `splitRows()`.
2. `DiffGroupHeader` + `DiffToolbar` + `useFoldedGroups()` — the group
   header markup is character-identical between the two sections
   (`LawDiffSection.vue:638-665` ≡ `TextComparisonSection.vue:785-813`),
   the toolbar differs in two aria-labels, and `BADGE_CLASS` /
   `GUTTER_CLASS` / `BADGE_ORDER` / `toggleGroup` / `groupOpen` /
   `groupBadges` / `fullyShown` / `showAll` / `SHOWN_CHANGES` are
   duplicated verbatim. Tables go to a pure `diffBadges.ts` with a
   `removedLabel` parameter (the one difference: „entfallen" vs
   „entfällt"). ~450 lines removable across the two files.
3. `FetchGate` — the `pending && !data` / `error` / `data` triad at
   `index.vue:295`, `entwuerfe/index.vue:771`, `[id].vue:94`,
   `[gp]/[inr].vue:320`; also the natural place to drop the unused
   `ErrorState.description`.
4. `SubscribeLinks` with a `#lead` slot — `index.vue:270-292` and
   `entwuerfe/index.vue:1035-1058` share their last 13 lines.
5. `DraftHeader` + `DraftBackLink` for the two detail pages' top. **Do not**
   extract the status card or the CTA card below them: the two pages
   render different things there and a shared shell would be two
   mutually exclusive slots.

**Explicitly not worth extracting:** the filter bar of
`entwuerfe/index.vue` (one page's control surface, with a documented
CSS-only disclosure); a shared list renderer for `index.vue` vs the list
page (they already share `EntryList`); a generic `<Badge variant>` over
the four badge components (they share only "small and rounded");
`SectionCredits` (already the extraction).

**Logic leaving `<script setup>` for pure, testable modules:**

- `entwuerfe/index.vue` (750 script lines, three concerns): URL-query
  parsing (`parseStations`, `parseSort`, `parseStatus`, `parseArt`, the
  `query` computed, the URL-writing watch) → `useDraftFilters()` with the
  parse half in `draftFilters.ts` (the one block that deserves a unit test
  and has none); the full-text half (lines 437-631, own debounce, own
  fetch, eight computeds) → `useFullTextSearch()`; `orderOf` and
  `compareByStatements` → `shared/utils/draftOrder.ts` beside
  `compareDrafts`, gaining `tests/draftOrder.test.ts` for free.
- `StatementsPanel.vue`: `compareRows`, `orgSortDate`, `orgRowDate`,
  `orgRows` → `statementRows.ts`; `submitterLabel`/`submitterName` carry
  the GDPR guard and are untestable today — pure module **with tests**.
- `TextComparisonSection.vue`: ~200 lines of German sentence-building
  (`checkNote`, `withheldClause`, the `WITHHELD_*` tables, `withheldText`,
  `droppedPagesNote`, `doubtfulNote`) → `annexNotes.ts`; `absaetze` + the
  `ABS_MARK` regex (a parser with a documented edge case and no test) →
  its own module.
- `endorsementLabel(n)` written identically three times → `format.ts`
  beside `countLabelDe`.
- The house inline-link class string, declared locally six times and
  inlined in 31 places → `@utility link-inline` in `main.css`, the
  precedent `tap-target` already set.

### 4.4 `scripts/` — a lib, five groups, one naming scheme

```
scripts/
  lib/      args.ts (both `--k v` and `--k=v` shapes, named apart)  http.ts (risJson, getJson, retry)  async.ts (pool, sleep)
            fmt.ts (pct, quantile)  ris.ts (asArray, ANNEX_NAME_RE)  corpus.ts (← risCorpus)  harnessCache.ts (← harness-cache)
            annexReport.ts (← annex-report; imported by tests)  gateGoldenKeys.ts (← gate-golden-keys; imported by tests)
  harness/  kons  me  annexPdf  faultInjection  guardEval
  corpus/   novao  novaoForms  verordnungen  stationen  erlaeuterungen  erlDiff  kurzinfo  bgbl2  bgblStation
            begutachtungSkipped  meAntragJoin  rvLatency   (the three .mjs, converted)
  audit/    classifier  paraTitle
  ci/       annexDrift  gateGoldenRecord
  dev/      annexPdfCheck  watchFallback.cjs
```

Package scripts: keep `harness:*`, `audit:*` (checks *our* output),
add `corpus:*` (measures upstream to gate a decision) and `ci:*`. Update
the paths in `.github/workflows/annex-drift.yml:129,132,164,201,202` and
`tests/annexGateGolden.test.ts:39` in the same commit as the move.
`scripts/og-image.svg` moves to `assets/`.

Every script has a verdict in the scripts audit; none is broken, all
imports resolve. **Decided 22.09.2026, after checking each:**
- `annex-pdf-check.ts` — **remove.** A 39-line debug printer referenced
  nowhere (not in docs, TODO, package.json or CI). Its one distinction,
  being the only reader of `AnnexParse.unplaced`, goes with it: that field
  becomes internal or is dropped.
- `.cache/tgue/` — **delete.** 132 files, 8,5 MB, no script writes or
  reads it (the only mention of the name is a comment in
  `textComparison.ts`). Fix the `.gitignore:14` attribution while there.
- `novao-forms.ts` — **keep.** `docs/architecture.md:722` cites it with
  `novao-corpus.ts` as the instrument behind the grammar-coverage figure,
  and the two harnesses do not replace it: they print per-draft refusals,
  this one prints corpus-wide coverage grouped by refusal reason.
- `verordnungen-corpus.ts` should use `fetchRisBegutCorpus` instead of its
  own paging copy (it lacks the retry added on 2026-09-19; note it sorts
  ascending where the lib sorts descending — re-run and diff the report).

**User-Agent.** Two identities are in circulation (**verified**):
`begutachtungs-monitor/0.1 (ziviltech-prototyp…)` in `parliament.ts:83`
and four scripts, `begutachtungs-monitor/0.1 (+https://begutachtungs-monitor.at…)`
in every RIS client and the other scripts; `classifier-audit.ts` sends a
third, `begutachtungs-monitor/audit`. Recommendation: one constant in
`upstream/fetch.ts`, `begutachtungs-monitor/0.1 (+https://begutachtungs-monitor.at)`,
and scripts append `; scripts/<name>` the way `risCorpus.ts:59` already
does. The URL form is the useful one for an upstream operator — it says
who to contact — and "prototyp" has been untrue since the site went live
on 2026-08-26. Update `docs/architecture.md:40` with it. No reason to keep
two.

### 4.5 `tests/` — flat stays, two renames, one helpers file

Keep `tests/` flat with the rule *test file name = module basename*.
Two files break it today: `listSearch.test.ts` tests `format.ts` and
`search.ts`; `statementDocument.test.ts` tests functions in `mappers.ts`
while a real `statementDocument.ts` is tested by nothing under that name
(**verified**). Add `tests/helpers/builders.ts` for the fixture builders
written three times each (`DraftArticle[]`, `DraftSummary`,
`RisConsultation`, `LawNode`). Leave the large inline synthetic fixtures
where they are; `annexGolden.test.ts:8-18` argues for exactly that.

---

## 5. Comments — the pass, with rules

Do this **last**, after every move, so translation diffs never collide
with move diffs, and do it file by file so each diff is reviewable as
translation only.

**Counts to expect:** ~2.650 German comment lines in `app/`, `server/`,
`shared/`; ~460 more in `scripts/` and 26 test files. Per area the audits
list the files; the heaviest are `entwuerfe/index.vue` (60 German blocks),
`begutSearchService.ts`, `begutSearch.ts`, `konsService.ts` and
`konsGate.ts` (whole files), `novao.ts` (its September half),
`shared/types.ts` (~190 lines), `entryView.ts` (~105).

**Essays that become a pointer (~1.100 lines, decision kept):**
`annexCheck.ts` (~450 lines of dated measurement narrative that stands
verbatim in §12.13 — the reach table at `:790-797` is
`architecture.md:2263-2268`); `shared/types.ts` (~280 lines, e.g.
`:1079-1163` on `verification`); `begutSearchService.ts:1-43`,
`searchHaystack.ts:1-36`, `api/ris-drafts/index.get.ts:87-109` (§12.31);
`EntryState.vue:5-66`, `EntryItem.vue` zone essays, `entryView.ts:1-42`
(§12.28); `useExplanations.ts:1-40` (§12.29); `lawText.ts:134-182`,
`lawText.ts:575-595` + `lawStructure.ts:51-71` (both re-tell the
`<schlussteil>` finding), `textComparison.ts:103-124,524-573`;
`annex-fault-injection.ts:98-136` (the changelog paragraphs). Keep the
rejected-variant lists (`annexCheck.ts:805-828` is the model).

**Outdated comments to fix (verified unless noted):**
- `nuxt.config.ts:47` "no web fonts" — Source Serif 4 is self-hosted
  since 2026-08-27 (`main.css:10`); `architecture.md` §8 says the same.
- `konsService.ts:134-135` (B7).
- `textComparisonService.ts:21-23` and `explanationsService.ts:205-207`
  say the Parliament copy is read as fallback; `READ_PARLIAMENT_COPY =
  false` since the same day.
- `[gp]/[inr].vue:109-113` justifies `stationContext` with a "Station n
  von 5" header the same file records as removed on 2026-09-18.
- `parliament.ts:10` announces three cache rules and lists four.
- `lastgood.ts:15` "NLnet work package 3" — NLnet is closed.
- `lawText.ts:140` names `annexCheck.ANNOTATION_RE`; the paired module is
  `lawStructure`, and the two regexes differ on purpose.
- `applyReport.ts:11` quotes 23,9 %, the first measurement; add the date
  or the correction (2,8 % / 7,3 %).
- `annexPdf.ts:960` "not yet read anywhere" — `scripts/annex-pdf-check.ts`
  reads it.
- `annexCheck.ts:485` says 11,8 % / 32,1 %; `architecture.md:2153` says
  12,0 % / 32,5 % for the same rule. Two numbers for one measurement is
  the argument for the pointer.
- `shared/utils/deadlines.ts:3,43` name the stat tile and `DeadlineBlock`;
  `stations.ts:39-42` says the spine fetches nothing (false since
  `StationContext`); `shared/types.ts:386` "Active consultations".
- `annex-report.ts:14` points to a "Prüfstandskopf" that does not say what
  it is cited for. Either the claim or the pointer is wrong; it is the
  premise of the Class A/B split, so verify by measurement.
- `.gitignore:14` attributes `.cache/` and `.harness-cache/` to
  `rv-latency.mjs`; six scripts share `.cache/`.

**Docs drift to fix in the same pass (`docs/architecture.md`):** §6 lists
`StageBar`, `VolumeBar`, `TraceTimeline` (gone) and misses 13 existing
components; §7 names four of nine pages; §8 says "system sans"; §9 says
27 test files / ~650 cases (50 / 1083); §5 names `lawsOnlyInRv` /
`lawsOnlyInMe` where the type says `lawsOnlyInTo` / `lawsOnlyInFrom`.

**Restating-the-code comments:** rare everywhere (every audit said so);
~15 lines in the engines, a handful in `app/`. Delete on sight during the
pass; do not hunt for them.

---

## 6. Performance — ordered by verified value

1. **`/entwuerfe` awaits its two SSR fetches in sequence** (**verified**,
   `entwuerfe/index.vue:231` then `:244`), while `index.vue:36-106` creates
   handles first and awaits later, with the reason written down. Same
   pattern; shortens TTFB on the corpus page by one upstream round trip.
2. **No debounce on the two in-section search fields** (**verified**),
   over up to 413 units; each keystroke lowercases six fields per unit and
   re-runs `blocksOf` for closed groups too. 200–300 ms debounce plus a
   precomputed lowercase haystack per unit. Fold `extraHeading`,
   `unitLabel`, `splitRows`, `reasoningOf` into the `Block` objects
   `blocksOf` already builds (called two to five times per row per
   render today).
3. **`alignUnits` step 3 runs a full LCS per remaining pair**
   (**verified**, `lawDiff.ts:262-269`; agent measured 240×240 units =
   2,0 s). Pre-filter with `bagSimilarity`: it is `2·|multiset
   intersection|/(n+m)` and LCS ≤ multiset intersection, so skipping pairs
   below 0,6 is exactly behaviour-preserving. Add a similarity-only path
   that skips segment construction in steps 2 and 3.
4. **The cold `/konsolidiert` path is serial where it need not be**
   (**verified**): `konsService.ts:150` awaits per article, and each
   `resolveLawByBgbl` pages RIS serially (`risKons.ts:281`). Run the
   per-article pipeline in a bounded pool; the only cross-article coupling
   is the mutable budget counter. Ordering affects which §§ the budget
   cuts (`konsService.ts:194-206`) — keep it deterministic.
5. **The same RIS draft XML is fetched under two cache names and parsed
   three times per cold detail page** (**verified**: `law-html` 24 h in
   `lawDiffService`, `entwurfstext-xml` 30 d in `explanationsService`,
   plus `konsService.ts:123`). One derived `getDraftArticles(gp, inr)`;
   `tests/cacheLayers.test.ts:23-45` hard-codes the names and must change
   with it.
6. **Full-text search re-parses the same XML up to eight times per
   request** (`begutSearchService.locate:342-358`, `blocksOf:281`) and
   compiles a regex per block per term (`begutSearch.termRe:103-107`);
   `searchHaystack.stripMinistryMentions` builds ~15 regexes per item per
   filtered list request. Per-request memoisation (dies with the request,
   allowed by the cache rules) and precompiled patterns. Also replace the
   lock-step batching at `:419-421` with the pool.
7. **`getDraftDetail` serialises the RV leg and `findRelated`**
   (`parliament.ts:788,805`) although `findRelated` needs only
   `hasRv`, known before the fetch. One round trip saved per detail page.
8. **`konsService.ts:239-247` allocates `instructions.map(...)` per §**
   (80 §§ × 500 instructions); index once. `tguOracle.paragraphRows`
   materialises the map per call on single-law drafts. `annexPdf.baselines`
   is quadratic per page and runs two to four times per page; sort and
   sweep, memoise per page — `annexGolden.test.ts` freezes the output.
9. **`entwuerfe/index.vue` ships both halves of the corpus in the SSR
   payload under an `art` filter** and renders one; pass `art` through or
   answer totals only (server change). `:1210` builds a `.map()` array in
   a template prop; make it a computed.
10. Feeds rebuild the whole body per poll (ETag saves bandwidth only) —
    theoretical, flagged not measured; cache the body in `DERIVED_CACHE`
    only if it ever shows up.

Not a problem, so not to be "optimised": the stationMap cold build (paid
by the prewarm unit, the model the others should copy); `StatementsPanel`
rendering the whole organisation list under `hidden="until-found"`;
`diffTokens` itself and its `MAX_DP_CELLS` ceiling; the annex row parse
(38 ms for 873 rows).

---

## 7. Sequencing

Each phase ends with `pnpm test`, `pnpm typecheck`, `pnpm typecheck:tools`
(and `pnpm lint` once it exists) green. Phases that move engine files also
run `pnpm harness:me -- --cache` on one draft and compare its summary line
to the run before; a phase that moves `privacy.ts` runs
`pnpm audit:classifier -- --gp XXVIII` even though its rules do not change.

| Phase | Content | Commits (≈) |
|---|---|---|
| 0 | Commit the staged Begründungsvergleich work. Tooling (§2). Bugs B1–B8 (§1), each its own commit with its own test where one is possible (B1 and B3 need one). | 10 |
| 1 | Dead code, unread fields, un-exports, orphaned JSDoc (§3). | 4 |
| 2 | `shared/`: types barrel; `textMatch` merge (fixes the umlaut inconsistency); `DraftStation` order/label; renames; app-only utils → `app/utils/` (after the decision in §8). | 6 |
| 3 | `server/` pure wins without moves: `upstream/fetch.ts`, `pool.ts`, `http/respond.ts`, `cache/ttl.ts`, `withinBudget` in the three handlers, handler logic → services. Then split `parliament.ts` and `mappers.ts`. Then the folder move, one folder per commit. | 12 |
| 4 | Engines: extract `jaccard`, `textNodes`, `paraId`/`labelKey`/`addressOf`, `pickClearWinner`; move `diffTokens` family to `diff/words.ts`; split `annexCheck.ts` along its banners; split `textComparison.ts`; `lawNames` co-location; `getDraftArticles`; performance items 3–5, 8. Folder move last. | 14 |
| 5 | `app/`: screenshots of two drafts first; `DiffText` → `DiffGroupHeader`/`DiffToolbar`/`useFoldedGroups` → `FetchGate` → `SubscribeLinks` → `DraftHeader`/`DraftBackLink`; logic out of the three big scripts; performance items 1, 2, 9; B4, B5; component subfolders; screenshots again. | 10 |
| 6 | `scripts/lib`, groups, `.mjs` → `.ts`, `corpus:*` names, workflow paths; `tests/helpers`, two renames. | 5 |
| 7 | Comments pass (§5) file by file; docs drift; `CLAUDE.md` §6 inventory refresh. | 15+ |

Phases 2, 3+4 and 5 are independent of each other and can run in parallel
worktrees if wanted; phase 7 must follow everything.

---

## 8. Decisions — taken on 22.09.2026

1. **`ConsolidatedParagraph.before/after`: drop both.** Rebuilt when a
   view needs them. (§3, phase 1)
2. **`shared/` means "both runtimes import it".** The six app-only modules
   move to `app/utils/`; the rule goes into `docs/architecture.md` §5.
   (§4.2, phase 2)
3. **Lint: `@nuxt/eslint` with `stylistic`, no Prettier.** (§2, phase 0)
4. **Both behaviour changes measured over the full offline cache
   (19.724 RIS XML documents):**
   - `fzinhalt` strip (B2): 180 of 314 readable Erläuterungen documents
     leak the footer today, 0 after the strip, 0,06 % of characters. **Do
     it.** Re-run `pnpm audit:erlaeuterungen` afterwards for the record.
   - `lawStructure.text` → `decodeEntities`: **0 of 17.293** standing-law
     paragraph documents render any undecoded entity reference under the
     current hand-rolled decoder. Aligning it changes nothing observable —
     so it is a pure simplification (ten `.replace` calls become one
     `decodeEntities`), safe to do in phase 4 without a measurement gate.
5. **Remove what has no user:** `annex-pdf-check.ts` and `.cache/tgue/`.
   **Keep `novao-forms.ts`** — it is the cited instrument for the
   grammar-coverage figure and nothing else measures that. (§4.4, phase 6)
6. **Component tests: screenshots plus pure-logic tests for phase 5, no
   component-test stack now.** The full trade-off and the reopening
   trigger are in §2 item 6.
7. **User-Agent: one identity,** `begutachtungs-monitor/0.1 (+https://begutachtungs-monitor.at)`,
   scripts append `; scripts/<name>`. The reasoning is in §4.4. (phase 3)
8. **Frist wording: proposed „Frist endete am {date}" for chip and row
   alike** (§4.2). This is the one item still waiting for a yes.

**What is needed from Manu to start phase 0:** commit or stash the staged
Begründungsvergleich work so the refactor commits start from a clean tree;
a yes (or a different wording) on item 8; and the go for the phase order in
§7 — or a different order. Nothing else blocks. Execution can run with
Opus agents per phase, each handed one section of this plan and a fixed
verification protocol, with review and the screenshot rounds in the main
session.

---

## 9. Do-not-touch register (moves allowed, decisions not)

- **Licence:** the annex read order RIS first, Parliament fallback, and
  `READ_PARLIAMENT_COPY = false` (`textComparisonService.ts:223,251-261`);
  `isLicensedPair` in `lawStations.ts`; the credit lines. Question E3.
- **GDPR:** every rule and their order in `privacy.ts`; the `P`-flag
  veto-only rule; `ORG_ALLOWLIST`; `submitterName` nullability;
  `submitterLabel`/`submitterName` in `StatementsPanel.vue` (move into a
  tested module, never simplify away). Corpus comparison after any change.
- **Cache rules:** leaves only, `swr: false`, `DERIVED_CACHE` for anything
  computed, never cache `getDraftDetail`, never cache `parseRisXml` /
  `parseKonsParagraph` results beyond the request, `RIS_CORPUS_TTL_S = 20 h`,
  the dev-only `shouldBypassCache` on the three byte caches, one cache
  name per consumer (`cacheLayers.test.ts:29-33`), fetch-outside-try /
  parse-inside-try, no `.catch` into a cached value.
- **Join calibration:** `risJoin.ts` weights, bands, `MINISTRY_LINEAGE`,
  `RULE_VERSION` (bump and regenerate `data/ris-me-map-gp27.json` if
  anything moves); `bgblJoin` constants; `precedingDraft` 0,50;
  `related.ts` exact-token equality; `chainCoverageOf`/`mayClaimOutcome`
  with `unknown` treated as `unlinked`.
- **Engine thresholds and orders:** everything the consolidation audit
  lists — `MIN_PROSE_TOKENS`, `PARAGRAPH_THRESHOLD`, `LAW_THRESHOLD`,
  `MIN_STANDING_STRETCH`, `MIN_NEW_WORDS`, `MIN_MISSING_WORDS`,
  `DRAFT_THRESHOLD`, `SIZE_TOLERANCE`, `TITLE_MATCH`/`TITLE_AGREE`,
  `pickByName`'s 0,6 and strict tie rule, the PDF geometry tolerances,
  `IMPLAUSIBLE_HITS`, both `MAX_PARAGRAPHS`, `MAX_LAWS`; the withheld-cause
  order `standing → alreadyStanding → notInDraft`; the gate order
  `refused → unplausibel → oracle`; boundary resolution order; the
  `ANNOTATION_RE` superset; `designationKey` exactness and `indexOf`
  first-wins; every refusal in `novao.ts`.
- **Diff heuristics:** `compareKey` folding, `stripMarkup`'s seven tags and
  the exclusion of `sup`/`sub`, the two-signal promotion of untagged
  instructions, the three-step alignment order with 0,5/0,6,
  `isEditorialChange` class order and the placeholder slash,
  `diffLawPackage` scoping, both copies of the "law named before its first
  instruction" window, `isElidedPair` + `ELISION_HEADING_MAX`, the two
  held-row stacks, `closingHost`'s non-use of `ebene`,
  `NAME_MIN_JACCARD`, `CHANGED_AT`, `unitKey` including `change`.
- **Frontend decisions with a measured reason:** `TokenSelect` stays a
  native `<select>` (reka-ui hydration crash); `EntryItem`'s explicit
  `NuxtLink` import; `@theme static` and the full accent ramp;
  `divide-rows` with its `until-found` reset; the 45rem container query;
  `ExternalLink` without `target="_blank"`; `useExplanations`'
  `dedupe: 'defer'` and `onNuxtReady` refresh; `SpineRail`'s `isolate`
  placement; the CSS-only filter disclosure; `main.css` as a whole.
- **Operational:** the five 301 route rules; the three prewarm endpoints;
  `dev-watch-fallback.cjs` as `.cjs`; `annex-pdf-verify.ts` installing the
  fetch cache unconditionally (the drift job's runtime budget depends on
  it); `tests/fixtures/annex-baseline.json` written only by the drift
  script, in the same commit as an engine change; the `@tiptap` override
  block (re-verified against `@nuxt/ui` 4.11.1); `app/pages/live.vue`.
