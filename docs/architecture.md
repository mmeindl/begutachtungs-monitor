# Architecture & Decisions (v1 prototype, August 2026)

This document is blueprint **and** decision log. §12/§13 collect what was
deliberately deferred and what is still open.

## 1. Stack & foundational decisions

- **Nuxt 4** (Vue 3, TypeScript strict), **Tailwind CSS v4** (CSS-first via `@theme`), **Nuxt UI v4** for generic primitives, SSR on.
- **No persistence layer of our own in v1.** The Nitro server is a caching
  proxy in front of the Parliament API (`defineCachedFunction`, 30 min TTL,
  **no SWR** — rationale in §5). Deliberately "boring": the predecessor died
  in operation, not in construction.
- **Parliament API first; RIS as a second upstream since Sept 2026.** The
  Parliament API covers all UI features (incl. draft PDFs/HTML). RIS is
  joined per GP (`docs/ris-join.md`, corpus-tested) and shows the draft's
  RIS entry and documents on the detail page; its XML texts are the path to
  a comparison for GP XXVII and earlier. The §-level diff itself runs on
  Parliament HTML (GP XXVIII on), no RIS needed.
- **German, light mode only, no i18n** in v1.

## 2. Data flow

```
Browser ──> Nuxt SSR / client nav
              └─> /api/* (Nitro)
                    └─> cached upstream calls (30 min TTL, no SWR — §5)
                          ├─> POST parlament.gv.at/Filter/api/filter/data/81   (ME list per GP)
                          ├─> POST .../filter/data/142                          (Stellungnahmen per ME)
                          ├─> GET  .../gegenstand/{GP}/ME/{INR}?json=True       (detail)
                          ├─> GET  .../gegenstand/{GP}/I/{NR}?json=True         (RV enrichment)
                          ├─> GET  .../dokument/{GP}/ME/{INR}/…html + …/I/{NR}/…html   (Gesetzestext ME + RV → §-diff, 24 h)
                          └─> GET  data.bka.gv.at/ris/api/v2.6/Bundesrecht?Applikation=Begut   (RIS corpus, 46 pages, 20 h, prewarmed nightly)
```

Rules for upstream calls (rationales in `docs/api-exploration.md`):

- `showAll=true` **without** `pagesize` (an explicit `pagesize` wins otherwise), plus `sortrnr=11&ascDesc=DESC` on list 81.
- Sanity check after every list call: all rows `row[0] === gp`, otherwise throw (the API silently ignores unknown filter keys!).
- Retry: 2 retries on 5xx/network errors, 300 ms backoff, **8 s timeout per attempt**. Sporadic 502s observed (the retry absorbs those). The timeout is chosen tight because timeout × 3 is how long an SSR render blocks before the error page: 8 s → ~25 s worst case instead of over 60 s. Measured p90 is ~0.1 s.
- `User-Agent: begutachtungs-monitor/0.1 (+https://begutachtungs-monitor.at)` — identify politely. One identity for every upstream call, set in `server/utils/upstream/fetch.ts` (the single HTTP client: timeout, retry, byte cap, RIS error envelope); `scripts/` append `; scripts/<name>`.
- Current GP: from the page configuration `GET /recherchieren/gegenstaende/ministerialentwuerfe?json=True` (field `…definition.params.GP_CODE[0]`, cached 24 h), fallback constant `'XXVIII'`. Never hardcode without a fallback path.

## 3. GDPR enforcement (hard, server-side)

The API delivers full names + postal code/town of private persons. **Our
pipeline filters before anything leaves the server** — including the SSR
payload:

- `server/utils/parliament/privacy.ts`: `classifySubmitter(raw, upstreamFlag?) → { kind: 'organisation'|'person'|'nonpublic', name: string|null }`.
- Rules: placeholder `Nicht-öffentliche Stellungnahme` → `nonpublic`. Org indicators (GmbH, AG, Verein, Verband, Kammer, Ministerium, Bundes-, Universität, Institut, Stadt/Gemeinde/Land, Gewerkschaft, Gesellschaft, Stiftung, Österreich, …) → `organisation` with name. Person patterns ("Lastname, Firstname", academic titles, `(postal code town)` suffix) → `person`, name **null**.
- **Safe default: when in doubt, `person`** — an organisation misclassified as a person appears as "Privatperson" (a cosmetic bug); a person misclassified as an org would publish a name (a legal risk).
- **The naming segment decides (2026-09-15).** "Lastname, Firstname; Universität Salzburg" is a person with an affiliation, not an organisation — but the affiliation's keyword used to win, and the row was published whole: 239 rows in GP XXVII, 2 in GP XXVIII (`scripts/audit/classifier.ts`). `leadsWithPersonName` in `parliament/privacy.ts` now checks the segment before the first semicolon (or the first two comma parts, or the left of a single comma when the right carries the org signal) before any organisation rule runs, legal forms included. Price: a brand-style organisation filing as "Name Name; Abteilung" stays hidden like any other name the heuristic cannot place; the corpus comparison found four such in GP XXVII and each got a pattern or an allowlist entry.
- **A second oracle: list 142's own `TYP` flag (2026-09-16).** Column 19 carries `I` (institution) or `P` (person) on 100 % of rows — measured over 106,626 across GP XXVIII/ME, GP XXVII/ME and the RV Stellungnahmen; it agrees with the name heuristic on 96.8 / 99.7 / 94.2 %. It records **how the submitter registered**, not what the name denotes, which is why it sees the one class a name rule structurally cannot: a person standing *behind* an org-shaped naming segment ("Windland Energieerzeugungs GmbH; <Vorname Nachname>", "i.A. <Nachname>, <Verband>"). `leadsWithPersonName` inspects the segment before the first semicolon and looks straight past those. **It may only ever veto, never authorise:** `P` suppresses a name the string alone would publish; `I` changes nothing by itself, because publishing on an undocumented upstream column would hand it the hard invariant — one silent flip and the site republishes names. The `I` disagreements are printed by `scripts/audit/classifier.ts` as list 3, a review queue; `ORG_ALLOWLIST` is what publishes one, by hand, and therefore outranks the flag. Orthogonal to `nonpublic` (902 non-public rows are `P`, 13 are `I`), so the placeholder string stays the only truth there. Column 19 is asserted in `parliament/listHeaders.ts` by its `feld_name` (`TYP`; its `label` is literally `"?"`), so a move fails loudly. Adoption cost across all three corpora: **0 names newly published**, 5 + 24 + 0 rows no longer published — of the 29, roughly sixteen named a real person. `docs/api-exploration.md` §4 carries the numbers.
- **The allowlist carries an optional display name (2026-09-16).** Parliament stores the submitter in two fields shaped "Nachname, Vorname"; an organisation that fills them in comes back inverted ("Pressefreiheit, Institut für", "GmbH, Verkehrsverbund Ost-Region (VOR); …") and was printed that way for as long as the row was public. `ORG_ALLOWLIST` is a `Map`: the value is the name to print, `null` keeps the upstream string. A display name is a **de-inversion read off the same string**, never an invention and never a person's name. The 13 organisations whose staff registered privately — the flag's false vetoes — were added this way; each matched exactly one upstream string in GP XXVIII/XXVII and nothing else.
- **Validation is a corpus comparison, not a unit test.** A change to `classifySubmitter` is run old-against-new over every list-142 row of a GP; every string that becomes public is read by hand (they must all be organisations), every string that becomes hidden is printed with its naming segment masked (they should all be persons). The 2026-09-15 change, final round: GP XXVIII 482 rows newly public (126 distinct strings), all institutions; 1 newly hidden, a lawyer filing with the firm. Six rounds were needed — each added pattern was tried against the corpus and three of them (`schule`, `österreichisch`, `hochschüler`) first let a person through in GP XXVII (a dotted degree that broke the title stripper, an all-lowercase name, two representatives filing jointly with a slash) before the guard learned those shapes.
- SNME detail pages (incl. full texts) are **not fetched at all** in v1. Links point to parlament.gv.at (linking ≠ republishing).
- Unit tests for the classifier are mandatory (`tests/privacy.test.ts`).

## 4. Framing rule (binding for the UI)

**Nachverfolgung, not pillory.** The accountability section is called
"Was wurde daraus?" and shows the process history neutrally to positively:
amendments after Begutachtung are **wins** and are shown just as prominently
as standstill. No blame counters, no "ignored" rhetoric, no red accusation
badges. Tone: factual, precise, no exclamation marks.

## 5. API contract (types: `shared/types/` — single source)

| Route | Response | Source |
|---|---|---|
| `GET /api/dashboard` | `DashboardPayload` | List 81 (current GP) — plus list 81 of the period before it in two independent places, both only around a Periodenwechsel: the still-running Fristen it carries into `open` (§12.36) and, while the new period is too young to be ranked, the volume ranking (§12.35) |
| `GET /api/dashboard/outcomes` | `DashboardOutcomes` | The outcomes of the volume ranking — of the SAME period `/api/dashboard` ranked, through `rankedPeriod.ts` (§12.35) — (closed rows only, ≤5 ME-Gegenstand + their RV leg through the 30-min leaf caches). Server-rendered on `/` with a 4 s timeout. The recency pool and its extension probe were removed on 18.09.2026 with the section they fed (§12.23) |
| `GET /api/dashboard/enacted` | `DashboardEnacted` | "Zuletzt Gesetz geworden": list 101 narrowed by `Status` to the finished Vorlagen, detail JSON for the newest 30 of them, ordered by BGBl number (Teil I), deduplicated per draft, top 4 joined against list 81; falls back to the period before while the running one has promulgated nothing, and names which it read (§12.35). Server-rendered with a 4 s timeout — measured 0.93 s fully cold (30 parallel Gegenstand fetches: 0.54 s), 14 ms warm |
| `GET /api/drafts?gp&status&station&ministry&q` | `DraftsResponse` | List 81 + the station map (§12.26). **Without `gp` the answer carries the Fristen that outlive a Periodenwechsel** and names their period in `carriedOverFrom`; with a `gp` it is strictly that period (§12.36). `status`: `open\|closed\|all` (default `all`), where **`open` = „Stellungnahme möglich"**: laufende Frist ODER offenes Vorlagen-Formular. `station`: comma list of `begutachtung\|rv\|parlament\|bgbl` (default all), read under a 2.5 s budget — on timeout the answer carries `stationsAvailable: false` and is NOT filtered. `q` searches title/citation/ministry CODE and the debate names server-side: the words of the query are AND-linked and each one a substring, read raw or with umlauts, transliterations and punctuation folded — either reading may match, so „oekostrom" finds „Ökostromförderung" and „ergesetz" still finds „Paketsteuergesetz" (`shared/utils/textMatch.ts`, measured 22.09.2026). No `art`: this list holds Ministerialentwürfe and nothing else, so the Art filter of `/entwuerfe` does not narrow it — it decides whether the endpoint is asked at all (§7) |
| `GET /api/stations/:gp` | counts per station | The station map of one period (`aktuell` = running GP), awaited in full — the prewarm call that pays the cold build (227 requests for GP XXVIII, 650 for XXVII). Its counts are the live base rate of a running period (§12.26) |
| `GET /api/drafts/:gp/:inr` | `DraftDetail` | Detail JSON + list-81 row + statements summary + RV enrichment |
| `GET /api/drafts/:gp/:inr/statements` | `StatementsResponse` | List 142, GDPR-filtered, date descending; on failure the persisted last-good list with `staleAsOf` (cache rule 4), 502 only without any record |
| `GET /api/drafts/:gp/:inr/diff` | `LawDiffResponse` | The two Gesetzestext HTMLs (ME from `content.documents`, RV from `content.statements.documents`) → § units → **scoped to the laws both texts carry** → aligned → word diff; cached 24 h. `lawsOnlyInTo` / `lawsOnlyInFrom` name the laws left out, with their unit counts — a Regierungsvorlage that merges several drafts would otherwise report hundreds of §§ as new (§6d). `available: false` with a German reason when no RV exists yet or a text is PDF-only (GP XXVII and earlier). `docs/ris-join.md` §6b |
| `GET /api/ris-drafts?gp&status&ministry&art&q` | `RisConsultationsResponse` | The RIS Begut records Parliament has no Gegenstand for — mostly Verordnungsentwürfe (§12.16). Same query vocabulary as `/api/drafts` plus `art` — which here means the INSTRUMENT KIND (`verordnung\|gesetz\|unbestimmt`) and not the Art filter of `/entwuerfe`: that one names a HALF, and 3 of the 201 records of this half are no Verordnungen (measured 23.09.2026), so the page selects the half and never passes its value on. Sorted by the same `compareDrafts`, because `/entwuerfe` merges both lists (§12.19). Without `gp` it carries the still-running Begutachtungen of the period before (§12.36) and reports them in `carriedOverFrom`; a record whose Ministerialentwurf belongs to that earlier period is claimed by its map too, so the boundary cannot produce the same draft twice (§12.37) |
| `GET /api/ris-drafts/:id` | `RisConsultationDetail` | One such record by its RIS document id (`BEGUT_…`, validated against `RIS_ID_RE` — the same pattern the page route and the per-item `.ics` test). Renders at `/entwuerfe/:id`, the same namespace as a draft (§12.19) |
| `GET /api/ris-map/:gp` (or `aktuell`) | `RisMapResponse` | RIS Begut record per ME of the GP with status/tier/score, RIS URL and document URLs, the Ende offset (a non-zero value is a Fristabweichung). Cached 30 min on top of the 20-h corpus cache; the nightly prewarm timer calls `aktuell`. `docs/ris-join.md` §3a |
| `GET /feed.xml` | RSS 2.0 | Current GP plus the Fristen still running from the period before it (§12.36), newest arrival first, max 50 items; deterministic output (no `Date.now()`, absolute dates in descriptions — never countdowns), ETag/304; builders in `server/utils/feeds.ts` (pure, tested) |
| `GET /kalender.ics` | iCalendar (RFC 5545) | All deadlines of the current GP, plus those still running from the period before it (§12.36 — a subscription replaces its whole event set on refresh, so this is what keeps a running Frist from falling out of the calendar), as all-day transparent events; UID domain FROZEN (`@begutachtungs-monitor.at`, survives renames); DTSTAMP follows the deadline so extensions propagate through import paths; ETag/304 |

Param validation: `gp` = Roman numerals (`/^[IVXLC]+$/`), `inr` = positive integer; otherwise 400. Unknown item → 404.

Where a module belongs (decided 22.09.2026): `shared/` holds what BOTH
runtimes import — the contract in `shared/types/` and the pure helpers the
server and the app call alike — `shared/types/` plus `shared/utils/`
(`draftAliases`, `draftOrder`, `draftStations`, `lawStations`, `format`,
`gp`, `diffKey`, `explanationKey`, `queryParams`, `risConsultations`,
`statementRef`, `textMatch`). View models and German copy only the app reads
live in `app/utils/` (`spine`, `entryView`, `deadlines`, `outcomes`,
`lawPackage`, `draftFilters`, `statementRows`, `absaetze`, `annexNotes`,
`diffBadges`, `diffSides`), which Nuxt auto-imports the same way; they carry
no Vue, so Vitest keeps reaching them through relative imports.

Server internals (`server/utils/`), in folders since the September 2026
refactor — `upstream/`, `http/`, `cache/`, `parliament/`, `ris/`, `search/`
for the plumbing, and `lawtext/`, `diff/`, `annex/`, `kons/`,
`explanations/`, `text/`, `harness/` for the engines. Nitro auto-imports
them recursively into ONE namespace, so a name has to be unique across all
of them, whichever folder it sits in:

- `upstream/parliament.ts` — upstream client (`fetchFilterList`, `fetchGegenstand`, the GP and header assertions, the 404/502 mapping).
- `parliament/drafts.ts` — the cached leaves (`getCurrentGp`, `getDraftsForGp`, `getVorlagenForGp`, `getGegenstand`) and the cache architecture they follow.
- `parliament/statements.ts` — list 142 on both sides (`getStatementsForMe`, `getStatementsForRv`), the last-good fallback and `buildStatementsSummary`.
- `parliament/draftDetail.ts` — the **uncached** assemblies `getDraftDetail` and `getDraftOutcome`.
- `http/budget.ts` — `withinBudget(promise, ms)`: waits at most `ms`, then answers `null` WITHOUT aborting the call, so the dropped fetch still fills its cache for the next reader. Used for the RIS join on the detail page (2 s): after a restart the RIS corpus is ~46 requests cold, and on 2026-09-07 the first detail-page hit after a deploy took 61 s in production while the prewarm unit was still running. Only for enrichment whose absence the page already handles — never for a fact the page asserts.
- `ris/begutCorpus.ts` — RIS OGD client: full Begut corpus (paged, retries, HTTP-200 error envelope), flattened records with main-document URLs; `getRisMapForGp` joins the cached list 81 against it.
- `ris/risJoin.ts` — **pure**: the ME↔RIS join (ruleVersion 2), regression-tested against `data/ris-me-map-gp27.json` and the GP XXVIII fixtures.
- `ris/titleSimilarity.ts` / `ris/ministryCodes.ts` — **pure**: the toolkit the join was calibrated on (title normalisation, tokens, components, `daysBetween`; the `"CODE (long name)"` reader and the lineage groups), borrowed by `parliament/related.ts`, `parliament/precedingDraft.ts`, `ris/bgblJoin.ts`, `ris/risOnly.ts` and the full-text search instead of being re-derived per caller.
- `parliament/related.ts` — **pure**: same-title drafts (predecessor/successor) by exact equality of the normalised title tokens, evaluated on the 57 GP XXVII drafts without RV (§12.10). `parliament/draftDetail.ts` looks in this, the previous and — once the GP is over — the next GP, and keeps a predecessor only when it produced no RV.
- `lawtext/` / `diff/` — **pure**: Parliament Word-template HTML → § units (or Novellierungsanordnungen); article pairing by law name (the "Artikel n" marker is read from the heading text, not its class — the two documents disagree on the level), package scoping via `diffLawPackage`, unit alignment by heading, LCS word diff, editorial-vs-substantive rule. `lawDiffService.ts` fetches and caches around them.
- `parliament/lastgood.ts` — on-disk store for the last-good statements aggregation of one ME (one JSON record per ME, write-then-rename, versioned; read back only when the live list-142 fetch fails). State directory: `BM_STATE_DIR` → systemd `STATE_DIRECTORY` (`/var/lib/begutachtungs-monitor`) → `./.data`. Deliberately outside the app dir — `deploy.sh` rsyncs `.output/` with `--delete`.

**Cache rules (August 2026, forced by a real failure):**

1. **Cache leaves only.** Only the upstream calls themselves are cached.
   `getDraftDetail` is a derived aggregate and stays uncached — a
   cache on top of it freezes a snapshot of its inputs and stamps it as
   fresh. Observed: the detail cache held a nine-day-old statements count
   (`total: 1`) with a current `mtime`, while the leaf cache next to it
   already held the correct 4 entries. Qualified by rule 5: a derived value
   may be cached, but only in a layer that does not outlive the code that
   produced it.
2. **Set `swr: false` explicitly.** Nitro defaults to `swr: true`
   (`defaultCacheOptions`). With SWR an expired entry keeps serving the old
   value and only revalidates in the background — **and** the storage entry
   is written without a TTL. In dev mode the cache lives on disk
   (`.nuxt/cache`) and survives restarts: arbitrarily old data on the first
   request. Price: one upstream round trip per TTL window lands on a single
   request's latency, and an upstream outage leads to the error page instead
   of stale data (deliberate — the retry policy and `ErrorState` absorb it).
3. **One fact, one source per response.** `DraftDetail` excludes
   `statementCount` (list 81, `row[13]`) via `Omit`; the detail response
   carries only `statements.total` from list 142 — the same source as the
   breakdown. Otherwise two independently aged numbers for the same fact sat
   next to each other on one page (card said 4, detail said 1).
4. **Stale is never served as fresh — but it is served as stale.** List 142
   does not merely hiccup: it loses whole MEs for days (measured 2026-08-31,
   GP XXVIII: 47 of 132 MEs absent from the index, among them 88/ME with all
   707 Stellungnahmen — `docs/api-exploration.md` §list 142). So a failing
   list-142 fetch never caches a zero; it falls back to the last successful
   aggregation, persisted in `lastgood.ts` and labelled with `staleAsOf` in
   the UI ("Stand der Liste: …"). `getStatementsWithFallback` is the single
   place that decides this, because the detail summary and the list endpoint
   must not answer it differently — they did once: the summary served the
   last-good aggregation while the list below it showed an error box. The
   staleness sentence renders once per page: `StatementsPanel` suppresses
   its own when the summary above it is already flagged. Without any record the page degrades to
   the list-81 counter alone (`degraded: true`). An empty result is never
   remembered — "0 rows" is the shape the outage takes, and a stale zero
   would render as "Noch keine Stellungnahmen", the one degraded state that
   carries no staleness note.
5. **Cache by provenance, and in two layers (2026-09-09).** Rule 1 was
   quietly broken by the diff and annex work: a parse *is* a derived
   aggregate, and four of them had grown their own caches (`law-diff`,
   `text-comparison`, `para-titles`, `ris-map-gp`). Nitro's own guard does
   not catch it — the default integrity is `hash([fn, opts])`, which sees
   the cached wrapper's source and nothing about the parser the closure
   calls in another module. So editing a parser left localhost serving
   yesterday's parse for up to 24 h with nothing on screen to say so. That
   cost an hour on 2026-09-09, and worse than the hour: the stale page read
   as evidence that the fix had not worked. Each cached function now
   declares which half it is. **Documents we fetched** stay in the default
   `cache` mount, on disk in dev, because a restart must not re-fetch 46
   pages of RIS. **Anything we computed** takes `base: DERIVED_CACHE`
   (`server/utils/cache/base.ts`), mounted `memory` in dev
   (`nuxt.config.ts`), so it dies with the Nitro worker — which is to say
   with every edit to a server file. Production is untouched either way:
   the `node-server` preset mounts no storage, both layers are memory
   there, and `systemctl restart` empties them. A function that fetched
   *and* parsed could not be made correct without splitting it, because any
   invalidation that catches the parse throws away the fetch with it — so
   `kons-para-heading` became a cached document under a fresh parse
   (`kons-para-xml`), and the RIS corpus became cached pages under a
   derived flattening (`ris-begut-page`, politeness pause moved inside the
   cached call so it is paid on a miss, not on a hit; cached in dev only —
   in production page and corpus expire together, so the raw pages would
   hold the corpus a second time for no hit that would not have happened
   anyway: warm resident memory measured 133 MB with them and 90 MB
   without, of 952 on the VPS). That retired
   `CORPUS_SHAPE_VERSION`, a counter someone had to remember to bump.
   `tests/cacheLayers.test.ts` holds every cached function to the choice: a
   new one fails the suite until it is classified. Finished the same day: the
   last two persistent caches that still mapped rows were split too, so the
   persistent layer holds only upstream payloads, one entry per distinct call
   — `drafts-list` and `parliament-me-config` keep the answers, while
   `mapDraftRow` and `findGpCode` sit above them in the derived layer.
   List 142 is the single call with **no cached fetch underneath**, for two
   independent reasons: its rows name private persons, so only the classified
   result may be kept (§3), and a cached raw response would hand the
   empty-list retry of rule 4 the very answer it is retrying. Nothing has to
   be deleted by hand any more.
- `parliament/list81.ts`, `parliament/list101.ts`, `parliament/list142.ts`, `parliament/detailJson.ts` (with `htmlText.ts`, `dates.ts`, `rowCells.ts`, `organisations.ts` underneath) — rows→types. **List 81, 0-based:** 0 gp, 2 inr, 4 title, 5 citation, 6 ministry code, 7 path, 8 deadline (display), 10 arrival (ISO "Datesort"), 11 active `'J'`, 13 statement count, 14 fristsort (`yyyymmdd` → ISO; empty → null), 16 full ministry name. **List 142, 0-based:** 2 snmeInr, 4 date, 6 submitter (HTML `<a>`), 12 endorsements, 15 citation. Stage texts: strip HTML, extract + absolutize links.
- RV enrichment: last `/gegenstand/{gp}/I/{nr}` link from the stages (ME→RV is 1:n → the outcome takes the latest RV; the comparison, its Erläuterungen and its BGBl station take the RV whose Gesetzestext the draft's text evolution carries, `findComparisonRvLink`, §13 Nr. 4); RV JSON: `content.status.bgbllinks[]`, entry with `Abfrage=BgblAuth` (never blindly `[0]`).
- Documents: `content.documents[]`; text evolution: `content.statements.documents[]` (misleading key, intentional upstream!).

## 6. Component inventory (auto-import without path prefix, names globally unique)

**Division of labor with Nuxt UI (since the v1 refactor):** Generic
interactive primitives come from **Nuxt UI** — `UButton` (all
buttons/CTAs/chips), `UInput` (search), `UFieldGroup` (segmented controls),
`UApp` (root, German locale). **Exception `USelect`:** in the combination
Vite 8 (rolldown) + Nuxt UI 4.10 + reka-ui 2.10, reka-ui's `SelectItem`
reaches the browser without a render function and crashes the hydration of
the whole page (browser-verified, Aug 2026; no documented upstream issue
found). The list filters therefore use native `<select>` elements with token
styling — robust and accessible; try `USelect` again once the toolchain trio
is a few releases further along. The domain components in the table below
remain our own: they follow the dataviz spec and carry the product identity.
Theming: `app.config.ts` maps `primary` to our own `accent` scale and
`neutral` to `stone`; color mode and the `@nuxt/fonts` module are disabled —
light-only, and the one web font is self-hosted rather than fetched by a
module (§8).

The 36 components live in six folders — `chrome/`, `ui/`, `entry/`,
`draft/`, `statements/`, `compare/` — and are registered under their bare file
name: `components: [{ path: '~/components', pathPrefix: false }]` in
`nuxt.config.ts`. The folder is for reading, never for the template, so every
name has to stay globally unique.

**`chrome/` — the frame around every page**

| Component | Props | Purpose |
|---|---|---|
| `AppHeader` | – | Wordmark and the nav, capped at four items so it stays scannable: Aktuell `/`, Entwürfe `/entwuerfe`, So funktioniert's, Über |
| `AppFooter` | – | A colophon, not a marketing surface: both sources named (Parlamentsdirektion **and** RIS des Bundes, because CC BY binds for part of the data), a link to the per-source licence list in the Impressum, "kein amtliches Angebot", source code, contact, Impressum/Datenschutz |

**`ui/` — no domain knowledge, usable on any page**

| Component | Props | Purpose |
|---|---|---|
| `EmptyState` | `title: string; description?: string` + default slot | Empty state |
| `ErrorState` | `title?: string` + emit `retry` | Error state with "Erneut versuchen" |
| `LoadingState` | `label?: string` | Loading state |
| `FetchGate` | `status: AsyncDataRequestStatus; error: unknown; data: T\|null\|undefined; loadingLabel?: string; stateClass?: string` + emit `retry`, default slot | The three answers a page has while its data is on the way — loading, failed with a way back, or the page. Both list pages and both detail pages used to write the same three branches in the same order |
| `ExternalLink` | `href: string` + default slot | A link that leaves the site, with the a11y contract in ONE place: a new window, the decorative ↗ (aria-hidden) and the sr-only warning that owes for it. Always `target="_blank"` since 23.09.2026 — uniformly, against the repetition on statement rows that the 18.09.2026 rule was written to avoid |
| `ListHeader` | `id: string; to: string; noun: string; total?: number; visible?: number` + default slot | The head of a list section: its heading and the one way out of it (§12.24) — the counterpart to `ListMore` |
| `ListMore` | `visible: number; total: number; step: number; allAbove?: number` + emits `more`, `all` | The foot of a client-paginated list: "10 von 42 angezeigt" as the live region, the step button, and "Alle N anzeigen" above `allAbove` remaining |
| `SectionCredits` | default slot | The credit line at the foot of a comparison section: other people's documents, the licence, and last — rendered by the component itself, so both sections say it identically — „Markierung: Begutachtungs-Monitor" |
| `SubscribeLinks` | `ministry?: string` | The three ways to follow the corpus without an account: the deadline calendar for Apple/Outlook, the same for Google, the RSS feed |
| `TokenSelect` | `id?: string; ariaLabel?: string; block?: boolean` + default slot | Native `<select>` in token styling with the page-wide chevron. Native, not `USelect` — see the note above |

**`entry/` — one list row, and the things inside it**

| Component | Props | Purpose |
|---|---|---|
| `EntryItem` | `entry: EntryView` + slot `evidence` | **Every list entry on the site, in one anatomy** (§12.28): Titel · Kennung · Stellungnahmen · Stand, in fixed zones. One markup: a card under `md`, turned into the dense sheet's row by its `md:` classes (since 01.10.2026; until then a `density` prop and every entry rendered twice). Knows nothing about the kinds — what each kind puts in each zone is decided in `app/utils/entryView.ts` |
| `EntryList` | `entries: EntryView[]; ordered?: boolean; lead?: string` + slot `evidence` | **Every list of them** (§12.28): cards below `md`, from `md` up a sheet with a column header and rules, switched purely by CSS on ONE `ul` — the sheet's frame, rules and sticky header switch on at `md`. Until 01.10.2026 both versions stood in the HTML, every entry twice; one list took the DOM of a 50-row `/entwuerfe` from 1.990 to 1.132 nodes and the homepage's from 862 to 514, pixel-identical below `md`; from `md` the row's title is a heading like the card's and hyphenates like it, so a few long titles lose a line (main thread on a 4× throttled phone −8 % resp. −4 %). `ordered` → `ol`, only where the order is the statement; `lead` names the first column where the rows are not drafts |
| `EntryState` | `state: EntryState` | Zone 4: the state over what pins it down, as one box of two lines. One component for countdown, open Vorlagen window and every reached station — only a row someone can still act on is loud; everything closed is calm ink without pill or dot |
| `NewBadge` | – | „Neu" on a Begutachtung that began inside the last week (`isNewArrival`, `app/utils/deadlines.ts`); rendered by the call site's `v-if` and merging into the phrase that follows (§12.21) |
| `SearchEvidence` | `hit?: Pick<BegutSearchHit, 'place'\|'designation'\|'snippet'\|'ministryOnly'>\|null` | The evidence under a full-text hit: the Fundstelle plus the sentence the word stands in (§12.31). No frame — it already stands inside the hit's row |

**`draft/` — the two detail pages**

| Component | Props | Purpose |
|---|---|---|
| `DraftHeader` | `title: string` + slots `identity`, `source`, default | The top of a detail page: one meta row carrying identity and the source link, then the title. `identity` is where the two pages differ — a Ministerialentwurf leads with its Geschäftszahl, a RIS record does not have one |
| `DraftBackLink` | – | Back into the one list, unfiltered — one target, one word, on every detail page, because shared-link landers are the declared primary case |
| `DraftDescription` | `blocks: DescriptionBlock[]` | The Kurzinformation of a Ministerialentwurf, grouped into its own sections; folded parts use a native `<details>`, so no hydration, keyboard access as-is and the text stays in the SSR HTML |
| `DocumentList` | `documents: DocumentListItem[]; source?: string` | Document rows: title plus hint line, formats as small bordered accent tags with ↗ in two fixed columns (PDF, HTML). Tags, not buttons: buttons act inside the page, accent + ↗ leaves it. Used for Entwurfsdokumente, RIS documents and Spätere Textfassungen |
| `SpineRail` | `stations: Station[]; anchors?; comparisonAnchors?` | Where does this draft stand: one row per station — five for a Ministerialentwurf (`stations`), three for a Verordnungsentwurf (`regulationStations`, since 26.09.2026). The page builds the list; the bar answers three things and nothing else — where the text is now, what happened at each station it passed, what is still ahead — and each station links into the section that carries it (§12.26), or, where its record lives off the page, out to it (`Station.source`) |
| `AntragPathNote` | `path: AntragPath; gp: string; deadline: string\|null` | The Initiativantrag route under „Die Regierungsvorlage" on a draft without one (§12.10, 30.09.2026): which Antrag carried the text and where it was promulgated, that it was matched by wording and with which share, and — where it applies — that it was filed while the Frist ran. „Ein Teil dieses Gesetzestexts" where the Antrag carries less than half of the draft (`carriesDraft`) |
| ~~`BgblOutcomeBlock`~~ | — | Removed 26.09.2026: what became of a Verordnungsentwurf is the Bundesgesetzblatt-II row of its bar now, with the same asymmetry (§12.32) — up to 180 days after the Frist the row says it takes time, only after that that nothing can be found, and then with the search named and the way to check beside it |

**`statements/` — who filed, and on what**

| Component | Props | Purpose |
|---|---|---|
| `StatementsPanel` | `gp: string; inr: number; summary: StatementsSummary` | Summary tiles (total/orgs/private/non-public), top organisations; the full list lazy via the statements route and paginated client-side (`ListMore`, steps of 10), organisation search above 20 rows, persons as "Privatperson" |
| `StatementRow` | `date: string\|null; label: string; links?: { citation; href }[]\|null; detail?: string\|null; submitter?: string\|null` + slots `meta`, default | One row of the panel, in the grammar all three of its lists share: date · identity · citation(s) · Zustimmungen |
| `OrganisationStatementLinks` | `org: StatementsSummary['organisationList'][number]` | The statements of ONE organisation that filed more than once in the same Verfahren — the grouped row above cannot carry them, because a Zustimmung is counted per Stellungnahme |
| `StatementDocumentTag` | `pageUrl: string; citation: string; submitter?: string\|null` | The PDF of one Stellungnahme, as the same format tag `DocumentList` uses — one vocabulary for "here is a file" on the whole page. It appears ONLY where a file exists |
| `RvStatements` | `data: RvStatementsResponse; filingOpen?: boolean` | The Stellungnahmen filed on the Regierungsvorlage itself — the second round, which anyone can file in the Nationalrat the way they filed on the Ministerialentwurf |

**`compare/` — the comparison sections and their shared parts**

| Component | Props | Purpose |
|---|---|---|
| `TextComparisonSection` | `gp: string; inr: number` | „Was ändert der Entwurf?" — the ressort's own Textgegenüberstellung (`docs/api-exploration.md` §2c), available much earlier than the ME→RV diff and asking a different question |
| `LawDiffSection` | `gp: string; inr: number` | „Was sich nach der Begutachtung geändert hat": the § comparison between two versions of the law text (`docs/ris-join.md` §6, §12.18). Lazy client fetch of `/diff`; one folded group per Gesetz with count pills, rows as geändert / redaktionell / neu / entfallen / unverändert and an expandable word diff. Both sources linked, and the credit line is built per side rather than per pair (`lawDiffSourceCredit`, since 23.09.2026): RIS is CC BY 4.0, a parliamentary document a freies Werk (§ 7 UrhG), the Ministerialentwurf carries no claim (§13.1). Anchor `#textvergleich` |
| `ExplanationsSection` | `gp?: string; inr?: number; risId?: string` | „Was das Ressort begründet" — the Erläuterungen's Allgemeiner Teil (§12.29), where a reader's relevance check starts |
| `DiffGroup` | `title: string; badges: DiffBadgeCount[]; open: boolean` + emit `toggle`, default slot = the open body | One group of a comparison section: the law it collects, the summary pills, the chevron, and the body once open. Was `DiffGroupHeader` until 30.09.2026; the frame around the body was written out in both sections until then. A pinned bar with the law's name stood here from 30.09. to 01.10.2026 and was removed |
| `DiffToolbar` | `viewLabel: string; searchLabel: string` + models `view`, `query` | How to read a comparison, and a search over it — both scope the list below them and nothing above. Inline or side by side, GitHub's "unified / split" and for the same reason |
| `DiffText` | `segments: LawDiffSegment[]; side?: 'from'\|'to'; removedNormalWeight?: boolean` | A word diff as running text: removed words struck through on a red wash, inserted ones on a green wash. The convention everyone has read on GitHub, written out nine times between the two sections before this component |

## 7. Pages

- `/` **Dashboard**, in two halves — mitreden, then nachverfolgen, the order the H1 promises (§12.21): mission one-liner (plain text: the anchor into the accountability section went on 18.09.2026 — a promise is not navigation, and the reorder removed the distance it was saving), subscribe line, **one** "Jetzt in Begutachtung" list — Ministerialentwürfe and the Begutachtungen without a Gegenstand interleaved by deadline (§12.20; the four StatTiles were removed on 17.09.2026), **"Zweite Runde: Stellungnahme im Nationalrat möglich"** (the Regierungsvorlagen still taking Stellungnahmen — client-side and lazy, hidden when empty), **"Wo am meisten mitgeredet wurde"** (the GP's top by statement count, each closed row with its outcome chip), **"Zuletzt Gesetz geworden"** (the newest promulgations, each rendered as the Begutachtung it came out of — §12.23 replaced the "Zuletzt abgeschlossen" recency list here) — **all four cut to `HOME_LIST_LENGTH` = 5 and each with exactly one link, top right, to the filter that shows the same list uncut (§12.24: `ListHeader`, no `ListMore` on this page)**, and then the page simply ends. Its whole foot went on 18.09.2026, in three steps, and the reasoning is worth keeping because each step failed a different test. The lastSync note, because the field is one global index timestamp, identical for GP XX as for today, so it could never read "old" (`docs/api-exploration.md`). The scope sentence, because the accountability sections count over the CURRENT Gesetzgebungsperiode only and each names it in its own subline — a third statement at the foot added nothing. Note what was NOT done: moving the period down there as a footnote in the manner of the Quelle notes. A source note is looked up after reading and its absence leaves the sentence above true; the period is part of the claim — without it "die Entwürfe mit den meisten Stellungnahmen" reads as an all-time superlative the list is not, and a qualifier below the claim no longer qualifies it. And finally the pointer "Frühere Perioden – zurück bis 1979 – stehen unter Alle Entwürfe", which survived one round on the ground that "back to 1979" was stated nowhere else. Unique is not the same as useful: `/entwuerfe` is already in the main nav on every page and behind all four `ListHeader` links, and the corpus depth is not this project's claim — it is what list 81 hands to anyone who queries it, while the accountability chain is what has to be earned. A foot note advertising the range advertised the wrong thing, and for the older periods it also promises a depth the product does not deliver there (no diff layer, thin chain). Both dashboard fetches are server-side and started together, so both accountability sections are in the SSR HTML — they are what the page exists for, and client-only kept them out of crawls, shares and no-JS.
- `/entwuerfe` **List**, filtered on **two axes (§12.26)**: **station chips (multi-select: Begutachtung · Regierungsvorlage · Parlament · Bundesgesetzblatt — where a draft stands)** over the segmented control **Alle / Stellungnahme möglich / Abgeschlossen** (what a reader can do — „Stellungnahme möglich" is a running Frist OR an open Vorlagen-Formular, so „zweite Runde" is the cut `?status=open&station=rv`), **Art select — the one filter that names a HALF instead of narrowing the list, and therefore decides which endpoint is asked at all (23.09.2026)**: under „Ministerialentwürfe" the RIS half is not fetched, under „Verordnungsentwürfe u. a." `/api/drafts` is not, on the server either (`enabled`, watched on the half's own wanted-ness, so switching between the halves fetches only the one that is newly wanted). The server-rendered payload then carries only the half it renders — 218 KB unfiltered against 152 KB resp. 67 KB, measured 23.09.2026 — and count line, Ressort menu and „Darunter … in zweiter Runde" state what stands in the list rather than what was fetched. Its value is not passed to `/api/ris-drafts?art=`, which means the instrument kind (§5). GP select, ministry select (from the halves that are fetched), **sort select (Frist | Meiste Stellungnahmen — §12.24, client-side, the target of the homepage ranking's link)**, search field (debounced); filter state in the URL query; result counter; EmptyState. **The rows are paged, 50 at a time (`ListMore`, „Alle N anzeigen" above 50 remaining — 30.09.2026)**: all 339 rows of a period stood in the SSR HTML, each in both densities, 1,24 MB and 12.153 DOM nodes; paged it is 398 KB and 1.989 nodes, main thread on a 4× throttled phone 830 → 400 ms, measured on production builds. Only the render is cut — counts, Ressort menu and the full-text matching read the whole list — and under a search query the list stays uncut (§12.15's rule), so „stehen schon in der Liste oben" is only said of rows that are on the page. The page count is not in the URL and resets with every filter and sort change. Rows carry their station in the slot the Frist-Countdown owns while the Frist runs. A station chip takes the RIS half out entirely — those records have no station at all (§12.26) — and „Verordnungsentwürfe u. a." plus a station is an empty set that says so instead of showing an EmptyState. Under the list, when the status filter is „Stellungnahme möglich" and the stations allow it: the section **„Ohne Begutachtung: Stellungnahme im Nationalrat möglich"** (`#zweite-runde`, the anchor the homepage links to), which since §12.26 holds only the Vorlagen **without** a Begutachtung — the others are rows.
- `/entwuerfe/[gp]/[inr]` **Detail** (a Ministerialentwurf): `DraftHeader`, short info, CTA "Stellungnahme auf parlament.gv.at abgeben" (only when active) + "Auf parlament.gv.at ansehen", draft documents, statements panel, the comparison sections, source footnote — and `SpineRail`, the five stations (§12.26), each linking into the section that carries it. Closed without RV, the outcome card adds the measured base rate under the waiting sentence; once the draft's GP is over it leads with the boundary date instead ("Die XXVII. Gesetzgebungsperiode endete am 23.10.2024 – ohne Regierungsvorlage …", §12.10). Same-title drafts are linked in both lifecycle states: a predecessor without RV beside the station rail, a successor inside the no-RV card.
- `/entwuerfe/[id]` **Detail of a Begutachtung without a Gegenstand at Parliament** (§12.16): a RIS record, addressed by its `BEGUT_…` id. One link shape for every Entwurf since 18.09.2026 — the id shape decides which of the two detail pages renders, so a reader never has to know which half of the corpus a draft is in to guess its URL (§12.19). It deliberately has no statements panel and no ME→RV comparison: neither can exist here, because there is no Gegenstand to hang them on. What it does carry is the RIS documents, the Textgegenüberstellung where one exists, and — for a Verordnung, since 26.09.2026 — a three-station `SpineRail` (Entwurf · Begutachtung · Bundesgesetzblatt II) whose last row is what became of it (§12.32). A Gesetz or an untyped record keeps the card in words: no path after the Begutachtung can be read for them.
- `/so-funktionierts` **How it works**: the one canonical page for invariant background — static, zero data, zero ops. Every product page that needs the procedure explained links here and keeps at most a bridge sentence of its own. Since 18.09.2026 the outline is not the procedure but the three questions someone arriving from a shared link asks first (does this concern me, can I do anything, does it ever change anything); the stations are the scaffolding of the third answer. It is also where `redaktionell` is defined once, for both comparison sections.
- `/ueber` **About**: mission, how it works, data source/license, GDPR stance (why no names of private persons), lineage (OffenesParlament.at), prototype status.
- `/impressum` **Offenlegung under § 25 MedienG**, in full rather than under the "kleine Website" relief of § 25 Abs 5 — that relief is for sites without content capable of influencing public opinion, which is exactly this project's purpose, so claiming it would mean arguing against our own case. Carries the per-source licence list (`#imp-license`).
- `/datenschutz` **Datenschutzerklärung (Art 13 and 14 GDPR)**, written by hand rather than generated: almost every standard clause (cookies, analytics, newsletter, social plugins, server logs) describes something this project does not do, and a statement claiming processing that does not happen is as wrong as one that conceals some.
- `/live` — the stable address behind one Demokratiewoche event (22.10.2026). Reachable **by URL only, on purpose**: nothing on the site links here and `server/utils/feeds.ts` keeps it out of the sitemap, because the page belongs to one event on one evening and not to the product. It holds the event facts until `MEETING_URL` is set; from then on the same address 302s into the video room, so the event listing never needs touching again.
- `app/error.vue`: 404/500 in German, link to the home page.

Every page sets `useSeoMeta` (German `title` + `description`). Data fetching via `useFetch<Type>('/api/…')`; `pending` → LoadingState, `error` → ErrorState with `refresh()`.

## 8. Design system

Tokens in `app/assets/css/main.css` (`@theme`): surfaces `page #f9f9f7` / `surface #fcfcfb`, ink hierarchy (`ink`, `ink-secondary`, `ink-muted` — the latter darkened to `#57554f` for 7:1, since it carries real body text), hairlines, **one** accent `#2a78d6` with the full 50–950 scale from the validated sequential ramp, status colors (reserved for state, always paired with text). Body text is
system sans; headings, the wordmark and the stat values use Source Serif 4
SemiBold, self-hosted from `public/fonts` since 2026-08-27 (`--font-heading`,
`main.css:32`) — nothing is fetched from a third party at runtime.

**AAA contrast system (WCAG 2.2, all values computationally verified, never by eye):**

| Role | Token/value | Contrast | Target |
|---|---|---|---|
| Body text | `ink #0b0b0b` | 18.7:1 | 7:1 ✓ |
| Secondary text | `ink-secondary #52514e` | 7.5:1 | 7:1 ✓ |
| Muted text | `ink-muted #57554f` | 7.1:1 | 7:1 ✓ |
| Text links | `accent-deep #104281` (step 800) | 9.4:1 page / 7.5:1 on wash | 7:1 ✓ |
| Button text (white on filled) | `--ui-primary` = step 700 `#184f95` | 8.1:1 | 7:1 ✓ |
| Bar fill vs. track (non-text) | `#2a78d6` vs. wash | 3.3:1 | 3:1 ✓ |

Consequence: the gray hierarchy is flat (secondary ≈ muted) — hierarchy comes
from size and weight. `accent` (500) is reserved for bars/non-text.
Further AAA measures: link purpose clear from the link alone (aria-labels with context, WCAG 2.4.9),
every link that leaves the site opens a new window and says so (WCAG 2.2 3.2.5,
23.09.2026 — the announcement is what makes the uniform rule conformant),
`leading-relaxed` in text blocks, `prefers-reduced-motion` respected,
focus ring 2 px accent with offset.

**Target size is AA, not AAA — by decision (01.10.2026).** 44 px where the
primary pointer is coarse, 36 px under `@media (pointer: fine)` (global for
buttons/form fields via CSS, everything else via the `min-h-target` utility,
row links via the `-my/py` trick in `tap-target`). 2.5.5 AAA asks 44 px for
every pointer; 2.5.8 AA asks 24. The reason: 44 px on desktop made controls
taller than the list rows they sit under (a pagination footer outgrew the
row above it), and touch, where the size matters, keeps the full 44. `/ueber`
names this as the exception. Other known AAA limits (documented, not
claimed): 3.1.5 reading level (law titles are officialese) and 3.1.4
abbreviations (citation formats like "133/ME") are only partially
achievable; a formal audit with real Austrian users is pending (§12).

Look: generous whitespace, cards = `bg-surface` + hairline border + `rounded-xl`, at most `shadow-sm`, visible `focus-visible` rings, numbers formatted de-AT, date format `24.08.2026`.

**What a sheet may hold (18.09.2026):** rows (statement lists, document
lists) or one object with a job of its own (the station rail, the deadline
CTA) — never prose. Body text stands free under its section heading. The
case that settled it: the Regierungsvorlage's two outcome cards, a leftover
from when that station was a sub-heading inside the Begutachtung and the
card's edge was the only thing separating it. Once a station has its own
`page-section` heading, a border around its lead paragraph fences in a
second time what the heading already separates — the argument `page-section`
itself makes against a per-section background. Both branches are prose now,
like "Im Parlament" and "Im Bundesgesetzblatt"; with the box went the
repeated statement count, which the section directly above carries in full
and which was in the past tense against a Frist that can still be running
(7 of 91 in GP XXVIII have both windows open at once).

Viz rules (from the dataviz skill, binding for everything future): text never carries the data color; one series → no legend; status colors never as "series 4"; **every future multi-color categorical palette must pass `validate_palette.js`**, never by eye.

## 9. Tests

Vitest, 90 files, 1.581 cases, no network: everything under test is a pure
module with relative imports, which is why the modules are cut that way in
the first place. The two exceptions name themselves — `params.ts`, because
reading a request IS the Nitro boundary, and since 26.09.2026
`ris/bgblService.ts`, because the half of the Kundmachung lookup that reads
the CALENDAR cannot be cut pure (`tests/bgblService.test.ts`: which Jahrgänge
are asked of RIS, which of the two lifetimes each is read on, and that a Frist
still running survives the cached record). Both run against the handful of
Nitro names in `tests/helpers/nitroGlobals.ts`, which are added one at a time
on purpose: pulling in the generated `nitro-imports.d.ts` would declare all
900 auto-imports, and `scripts/` runs under vite-node where none of them
exists. `pnpm test` runs in under a second, `pnpm typecheck` covers
app/server/`shared`, and `pnpm typecheck:tools` covers `scripts/` and `tests/`
(`tsconfig.tools.json`) — the half that `nuxt typecheck` does not see and that
the log below blames twice for shipped bugs. `pnpm lint` (`@nuxt/eslint`,
flat config in `eslint.config.mjs`) is the fourth command. All four run in CI
on every push (`.github/workflows/ci.yml`).

- **Upstream → our types:** `htmlText` (entity decoding, stage HTML), `dates`
  (deadline parsing), `list81`/`list101`/`list142`/`detailJson`/`listHeaders`
  (row and JSON mapping, and finding a column by its header rather than its
  index), `draftList` (the list's Parliament half), `risRecord`/`risList`/
  `risConsultations` (its RIS half), `organisations` (the grouping algorithm),
  `privacy` (classifier: orgs, persons with titles/postal-code suffix,
  placeholder, edge cases → safe default), `gp` (Roman numerals), `related`,
  `draftAliases`, `budget`, `deadlines`, `outcomes` (the base rates quoted in
  the UI), `feeds` (RSS/ICS escaping), `upstreamFetch` (the one retry loop:
  attempts, backoff, size limit, the errors it raises), `lastgood`
  (round-trip, version/corruption/empty-record rejection, path validation, I/O
  failure degrades instead of throwing — point `BM_STATE_DIR` at a temp dir),
  `cacheLayers` (every cached function declares its layer, §5).
- **RIS join and the ME→RV diff:** `risJoin` (tiers), `titleSimilarity`,
  `ministryCodes` and `clearWinner` (its toolkit), `bgblJoin` and
  `bgblCitation` (draft → Kundmachung), `precedingDraft`, `lawDiff`,
  `wordDiff` (the word-level diff and `isEditorialChange`), `lawNames`,
  `draftArticles`, `lawStations`, `draftStations`, `lawPackage`.
- **Amendment engine (§12.12):** `novao` (instruction parsing),
  `instructionAddress`, `lawApply`, `applyGuard`, `applyReport`, `konsGate`,
  `konsLaw`, `tguOracle`, `risXml`, `normalize`, `designation`,
  `punctuationTokens`.
- **Textgegenüberstellung (§12.13):** `comparisonRows` (the XML table),
  `annexPdf` (page geometry), `annexBoundaries` (which heading opens a law),
  `annexDraft` and `draftText` (what the draft itself orders),
  `annexText`/`coverage`/`rightColumn`/`verdict`/`gateRows` (the gate),
  `annexGolden` and `annexGateGolden` (the two frozen real runs),
  `annexReport` (the drift alarm's own rules, §12.13).
- **Erläuterungen and the reasoning diff (§12.29, §12.30):**
  `risExplanations` (the RIS XML), `explanationsHtml` (Parliament's Word
  HTML), `explanationKey` (the key both sides build), `reasoningDiff`.
- **Search (§12.31):** `begutSearch` (blocks, hits, the ministry distributor),
  `searchHaystack` (the ressort mention), `textMatch` (one field, one rule for
  spaces).
- **What the page decides, as pure `app/utils` modules:** `entryView` (§12.28,
  what each kind puts in which zone), `spine` (the five stations),
  `draftFilters`, `draftOrder`, `statementRows`, `statementRef`, `absaetze`,
  `annexNotes`, `diffBadges`, `diffSides`, `diffKey`, `format`.

`annexGolden` was the first test on recorded documents rather than synthetic
ones, and deliberately: two real RIS documents are checked in verbatim
(CC-BY 4.0) because synthetic fixtures only ever contain what was already
understood. `annex-vkrg.xml` is the Textgegenüberstellung of the
Verbraucherkreditrechts-Änderungsgesetz 2026 — a
five-Artikel package whose Anhang splits its columns differently from its own
header — and `annex-uwg-pages.json` is the page geometry of the UWG-Novelle,
whose pages are turned a quarter turn (the geometry rather than the PDF, so the
test needs no pdf.js). They are not the only recorded documents in the tree,
though — `tests/fixtures/README.md` is the provenance table for all of them:
per file what it holds, the upstream source and its URL pattern, the licence,
and the date it was fetched.

Four invariants hold over every parse, whichever document and whichever path:
no elided row carries a change, no row shown as a change lacks a designation, a
word diff exists exactly where two sides differ and both carry text, and no row
claims a change it cannot show — with two exceptions, measured over the five
gate fixtures on 23.09.2026 and since asserted there: an elided row may differ
when the difference is the elision's own numbering, and a change may lack a
designation while it stands in a law's front matter, above its first designated
row (six rows). The first exception had one row when it was measured — "(1) bis
(54) …" against "(1) bis (55) …", the UGB's § 906 — and has none since the same
day, because `isElidedPair` now compares the two cells' digit runs and that row
stands as a change of § 906; the test freezes the zero so the exception cannot
grow back unnoticed. Neither exception is wrongly vouched for downstream —
`elision.ts` calls two differing cells elided only when neither holds
comparable text, and `gateRows.ts` counts a row without a designation as
`unchecked` — so what was too wide was the claim, not the
code. Four more hold over the gate and are checked
against the whole corpus by `scripts/harness/annexPdf.ts` (`runGate`), all of
them on nil: no row delivered as `verified` without a confirmed verdict, no §
missing from the verdict map, no withheld row still carrying text, and no
withheld § without a recorded cause — otherwise the split the page prints
would not sum to the total beside it.

The corpus can only ever report what the ressorts happen to have got wrong, so
`scripts/harness/faultInjection.ts` measures the gate from the other side: it
breaks §§ the gate has just confirmed — a sentence dropped from the left
column, another §'s standing text or its proposed text appended to the right
one — and prints what each rule catches, beside the false alarms the same
rules produce on the untouched corpus. Those false alarms are the two
right-column withholdings of `harness/annexPdf.ts` over the same population,
so the two harnesses cross-check each other, and the reach
`annex/rightColumn.ts` states is the number this one prints. It exists because that number was
measured once in a scratch file, and a claim whose instrument is gone is a
claim nobody can re-check (§12.13).

**Der SSR-Rauchtest über das gebaute Artefakt (26.09.2026).** Die Suite oben
ist netzfrei und ohne Nitro, und das ist ihre Stärke; ihre Blindstelle heißt
„vue-tsc grün, Laufzeit 500" und ist zweimal ausgeliefert worden — ein
Bezeichner, den nur ein `<template>` benutzt, und ein `shared/`-Modul, das
relativ importiert im Dev-Server, in vitest und im Typecheck läuft und erst
im Rollup-Bündel bricht (23.09.2026, `14a65d8`). `tests/templateImports.ts`
ist die statische Hälfte davon. `scripts/ci/ssrSmoke.ts` ist die andere: es
importiert `.output/server/index.mjs` — das Artefakt, das deployt würde, nicht
den Dev-Server und nicht `@nuxt/test-utils` — und holt sich vierzehn Routen:
jede gerenderte Seite, die drei Server-Routen (`feed.xml`, `kalender.ics`,
`sitemap.xml`), zwei Detailseiten, die aus der Liste des laufenden Servers
geholt werden statt mit fester Geschäftszahl dazustehen, und eine Nummer, die
es nicht gibt und die 404 sein muss und nicht 500.

Geprüft werden Statuscode UND ein Merkmal je Route, nämlich der `<title>`, den
die Seite selbst setzt: Nuxts Fehlerseite antwortet zwar mit 500, aber ein
Abschnitt, der still leer bleibt, antwortet 200.

Gestubbt wird an `upstream/fetch.ts` — genauer an dessen einzigem `fetch(`,
dem einen HTTP-Aufruf des ganzen `server/`-Baums. `globalThis.fetch` wird
ersetzt, bevor das Bündel importiert wird; die Kassette ist dieselbe Mechanik
wie beim Drift-Alarm (`scripts/lib/harnessCache.ts`), seit diesem Tag mit dem
Request-Body im Schlüssel, weil die Filter-API des Parlaments eine
POST-Adresse je Liste ist und erst der Body entscheidet, welche Periode
zurückkommt. Ehrlich benannt, wie dort: der Lauf merkt damit NICHT, wenn ein
Upstream ein Dokument nachträglich ändert. Was er merkt, ist jede Änderung an
unserem Code.

**Durch Fehlerinjektion geprüft**, weil ein Prüfstand, der nie rot war,
nichts prüft: `{{ (undefined as unknown as string).toUpperCase() }}` in
`app/pages/ueber.vue` lässt `pnpm typecheck` bei 0 Fehlern, `pnpm lint` grün
und `pnpm build` bei Exit 0 — und `/ueber` antwortet 500, während die übrigen
dreizehn Routen grün bleiben. Ein Bezeichner, den gar nichts bindet, fällt
dagegen schon dem Typecheck auf und ist deshalb nicht die Klasse, um die es
geht.

Nächtlich und nicht je Push (`.github/workflows/ssr-smoke.yml`, 02:41 UTC):
`ci.yml` läuft in anderthalb Minuten und soll das bleiben; ein Build plus
vierzehn gerenderte Seiten ist die Prüfung, die man einmal am Tag macht.

## 10. Operations (v1)

`npm run dev` (local), `npm run build` → `.output/` (Node server). Hosting (settled Aug 2026, §13.8): **netcup VPS pico G11s** (1 vCPU/1 GB, Ubuntu LTS, Nuremberg, DE) — Nitro bundle as a systemd service behind Caddy (auto-TLS). Build runs locally; the self-contained `.output/` is rsynced (no toolchain on the server; bootstrap adds a 1 GB swapfile). Runbook + scripts: `deploy/`; **live since 2026-08-26** — the inventory (domain/DNS at INWX, IPs, TLS, costs) is `deploy/infrastructure.md`. The one piece of persistent state is the last-good statements store in `/var/lib/begutachtungs-monitor` (systemd `StateDirectory=`, §5 cache rule 4) — losing it costs a degraded page, never data; there is nothing to back up.

**The deploy waits for the prewarm (25.09.2026).** `systemctl restart`
empties every cache: in production Nitro mounts no storage, so both layers
live in the very process systemd is replacing (§5, cache rule 5). Warming
*before* the restart is therefore pointless — it would warm the process about
to die — and the only thing a deploy can do about the cold window is not to
walk away in the middle of it. `deploy.sh` starts the prewarm unit without
`--no-block` since then, so `✔ deployed` means the next visitor finds a warm
server. Until that day the first `/entwuerfe` after every deploy ran its RIS
half ~15 s into an 8 s budget and answered „gerade nicht abrufbar" — honest,
and avoidable; the same window cost the station filter its answer, which is
what let the closed list claim too much (§12.26). A failed prewarm does not
fail the deploy: the app is up — the smoke check runs before it — and what is
lost is a warm cache, not a release; it is printed with the journal command
instead. `TimeoutStartSec=2000` on the unit is the sum of its own
`--max-time` budgets, so the wait has a stated upper bound rather than an
inherited one.

**Die Vorperiode wird mitgewärmt (26.09.2026).** Eine fünfte Zeile in der
Prewarm-Unit, `/api/stations/vorperiode`. Dasselbe Argument wie bei der
laufenden Periode, eine Periode zurück: Die Liste liest die Stationskarte
unter einem 2,5-s-Budget und antwortet sonst ohne Stationsfilter samt Hinweis
(§12.26) — und die abgeschlossene Periode ist die, in der „was ist daraus
geworden" überhaupt eine Antwort hat. Es ist die teure Zeile (650
Upstream-Anfragen gegen 227, 35,6 s kalt) und steht deshalb zuletzt: bricht
die Unit mitten drin ab, soll die Aufwärmung fehlen, die am wenigsten
besucht wird, nicht die der Startseite. `TimeoutStartSec` wächst auf 2.900,
weiter die Summe der eigenen Budgets.

`vorperiode` und nicht `XXVII`, aus demselben Grund, aus dem es `aktuell`
gibt: eine römische Zahl in einer Unit-Datei ist eine Zeile, die genau an dem
Tag falsch wird, an dem niemand hinsieht — dem Periodenwechsel, wo sie dann
die eben beendete Periode wärmt. Beide Wörter löst `gpFromParam` in
`server/utils/http/params.ts` auf; `previousGp` rechnet auf der Zahl und
nicht in `GP_STARTS`, damit die Auflösung am Tag der Konstituierung von GP
XXIX bereits stimmt.

**Gemessen und absichtlich nicht getan:** `/api/drafts/:gp/:inr/konsolidiert`
für die Entwürfe in Begutachtung vorwärmen (kalt ~12 s, warm 10 ms,
Tagescache). Drei Gründe, und der erste entscheidet. Dieser Abschnitt ist der
EINZIGE der Seite, der faul und clientseitig geholt wird
(`compare/TextComparisonSection.vue`, `server: false, lazy: true`): die Seite
rendert und liest sich ohne ihn und füllt sich dann — niemandem wird
inzwischen etwas Falsches gesagt, und genau das trennt ihn von der
Stationskarte und den BGBl-Jahrgängen. Zweitens ist er je Entwurf und nach
oben offen: 19 Entwürfe standen am 26.09.2026 offen, also gut vier Minuten
zusätzlich auf einem Deploy, der auf diese Unit wartet, und er wächst mit der
Zahl der ME — ein Deploy, der jeden Monat länger dauert, ist ein Deploy, den
niemand mehr fährt. Drittens zöge jeder Entwurf jeden § jedes geänderten
Gesetzes nächtlich aus dem RIS, für eine Schicht, die im Median an 12 % der
Paragraphen eines Entwurfs überhaupt existiert (§12.12a).

**EU sovereignty (hard invariant):** at runtime the application loads
**no** third-party resources — no web fonts (system sans), no icon/script
CDNs (icons bundled from the locally installed `@iconify-json/lucide`,
`icon.fallbackToApi: false` prevents runtime calls to api.iconify.design),
no analytics, no cookies. The only upstream source: parlament.gv.at. Hosting
only with **EU-owned providers** (no US hyperscaler, not even their EU
regions — CLOUD Act). The build-time dependency on the npm registry remains
(documented compromise; the mitigation would be an EU registry mirror).

**Dependency advisories (2026-09-09).** `pnpm audit` is clean. The seven
advisories GitHub reported that day were all build- or test-time, none of them
reachable from the deployed artefact — `tiptap`, `svgo` and `esbuild` appear in
zero files of `.output`, and the app has no editor and no user input at all.
Fixed regardless, because "not reachable today" is an argument that expires:
`vitest` moved to 4, `svgo` came right with a lockfile refresh, and
`fontless>esbuild` plus the whole `@tiptap` family are pinned in
`pnpm.overrides`. That tiptap block is long for a reason — `@nuxt/ui` declares
those packages in **both** `dependencies` (`^3.31.3`) and `peerDependencies`
(`^3`), pnpm resolves the loose peer, and the family pins itself to exact
versions, so it only moves as a unit. Cost: the `@nuxt/ui` 4.10 → 4.11 bump
that came with it adds ~0.2 MB gzip to the server bundle (now 5.26 MB, 1.23 MB
gzip).

Trap worth knowing before trusting a size number: `node_modules` keeps
orphaned packages across repeated installs and override changes, and Nitro's
dependency trace picks them up — the same commit built to 13.8 MB with a
polluted tree and 5.26 MB after `rm -rf node_modules .output`. It even
bundled two Vue runtimes that the lockfile did not contain. Measure only
after a clean install.

## 11. Why no …

- **No Pinia/state layer**: `useFetch` suffices; there is no shared client state.
- ~~**No component library**~~ **Revised (Aug 2026, at Manu's request):** Nuxt UI v4 provides the generic primitives (buttons, selects, inputs, field groups) — maintained a11y and less hand-rolling; the domain components remain our own (§6). Cost: ~1.3 MB more bundle; theming mapped onto our own tokens, color mode/fonts disabled.
- **No v-html for upstream content**: everything is stripped to plain text server-side (XSS surface zero; a real sanitizer only once formatted text is needed).

## 12. Deliberately deferred (with reasons)

1. **RIS integration** (clean XML draft texts, ME↔RIS join): ~~blocked on the join-key test at corpus level~~ the join is resolved (`docs/ris-join.md`, pure implementation in `server/utils/ris/risJoin.ts`, artefact `data/ris-me-map-gp27.json`). Still deferred: the nightly RIS fetch and wiring the RIS link into `DraftDetail`. Needed for the diff layer on GP XXVII and earlier (PDF-only on the Parliament side); GP XXVIII can be diffed from Parliament HTML alone.
2. **Diff layer ME→RV** (the actual accountability core): ~~needs RIS texts or parliament HTML parsing + a diff algorithm~~ **first version shipped 2026-09-08** from Parliament HTML (GP XXVIII on): `lawtext/`, `lawDiff.ts`, `lawDiffService.ts`, `GET /api/drafts/:gp/:inr/diff`, `LawDiffSection.vue` — `docs/ris-join.md` §6b. RIS XML path for GP XXVII and earlier shipped 2026-09-08 (§6c). Erläuterungen passage dropped on evidence (§6c). Still deferred: a diff of the Erläuterungen themselves, older RIS XML variants.
3. **Deadline alerts**: ~~e-mail/RSS~~ the stateless tier shipped Aug 2026 — own RSS feed (`/feed.xml`) and ICS deadline calendar (`/kalender.ics`), both without accounts or persistence (§5). Still deferred: **e-mail subscriptions** — they need everything the stateless design avoids (SQLite for subscribers + seen-set, nightly diff job, double opt-in + one-click unsubscribe, privacy page, EU-sovereign ESP with SPF/DKIM). Planned as a grant-funded work package, not prototype work: ops-heavy alerting is what killed the predecessor.
4. **Persistence & history**: detecting deadline extensions, statement growth over time, base rates for mechanism 2 ("evidence base") — needs snapshots instead of a cache.
5. **Broadlistening (stage 2)** — only once stage 1 has users.
6. **Dark mode** (tokens are prepared), **i18n**, **a11y audit** beyond the basics, **OG images**, sitemap/robots.
7. **Monitoring/uptime alerting** — ~~the predecessor died in operation; set up before a public launch.~~ **Done (2026-09-08), deliberately minimal:** `.github/workflows/uptime.yml` probes `/` from GitHub's runners twice an hour (HTTP 200 + keyword) and keeps exactly one `downtime` issue open while the site fails, @mentioning the owner — the issue is the alert and the state, so an outage is one mail, not one per run. Off-box by construction (a monitor on the VPS would go blind with it), no third-party account, no server component. Not built, on purpose: a health endpoint (stale upstream is already labelled on the pages), a dead man's switch for the prewarm timer (a failed prewarm costs the first visitor two seconds, not an outage), a status page. Trap: GitHub disables schedules after 60 commit-free days and mails about it — `deploy/infrastructure.md`. **Data canary since 2026-09-15:** the same run then loads `/entwuerfe/XXVIII/8` and requires the Österreichischer Rechtsanwaltskammertag among its Stellungnahmen. The name is in the SSR HTML only if list 142 was read, its columns sit where `mapStatementRow` expects them and the classifier recognised the row — the one failure the start-page probe cannot see is the silent one, where every submitter degrades to "Privatperson" and the site looks healthy. An upstream outage does not trip it: the page serves its last-good aggregation, name included, and labels the staleness itself.
8. **Nightly prewarm/sync cron** instead of cache-on-demand, once traffic is real. First instance exists (Sept 2026): a systemd timer warms the RIS↔ME map (`deploy/systemd/`, installed by `deploy.sh`), because that fetch is too slow to land on a visitor.
9. **Classifier review loop** — ~~a manual org allowlist~~ ~~a review loop that surfaces candidates~~ **Done (2026-09-15):** `scripts/audit/classifier.ts` (`pnpm audit:classifier -- --gp XXVIII`, `--ityp I` for the Regierungsvorlagen, `--inr` for one item) runs the classifier over a GP's list-142 rows and prints the two error classes: institutions filed as "person" (in full — candidates for a pattern or `ORG_ALLOWLIST`, each to be verified before it is added) and organisations whose naming segment is shaped like a person (masked — those are leaks). What the first run found, and what became of it: 334+ hidden rows led by the ministries' short form "BM f. …" (221), courts, the Datenschutzbehörde, the FMA, the Anwaltschaften, brand-style NGOs → patterns, checked against the comma-form persons of the corpus (zero hits each); ÖGB/ÖAMTC/SPÖ/ARBÖ hidden by JavaScript's ASCII-only `\b` before "Ö" → lookarounds; and the leak class (§3) → `leadsWithPersonName`. Occasion: a reader reported one hidden organisation (Presseclub Concordia); the audit showed it was a class. Re-run when a GP closes or a reader reports the next one. The classifier still runs inside the derived `statements-me` cache (memory-only, §5 cache rule 5), so a change shows on the next request and nothing has to be deleted by hand.
10. **Dead-ME marker** — shipped 2026-09-08 as a *boundary* statement, not a verdict. Upstream has no status field (`vhg_fertig` = `J` everywhere, `api-exploration.md` §5.5). The page therefore states (a) that the draft's Gesetzgebungsperiode is over, with the date from the constituent-session table in `shared/utils/gp.ts` (Art. 27 B-VG: GP n ends the day before GP n+1 convenes; verified against Wikipedia's GP table and the list-81 arrival boundary), (b) the measured rarity of a late Regierungsvorlage, and (c) same-title drafts before and after (`server/utils/parliament/related.ts`; predecessor only when it produced no RV). Base rates from `scripts/corpus/rvLatency.ts`, hand-copied into `app/utils/outcomes.ts` (re-run when a GP closes): **GP XXVII** 353 MEs → 296 RVs (84 %), median 40 d, p90 189 d, 89.5 % within the 180-day window the copy already used; 57 without RV, 10 of them with a Frist in the GP's last six months; **4 of 61** drafts open at the GP's end got an RV in GP XXVIII, linked in the old ME's stage list. **GP XXVI** 163 → 114 (70 %), 14 of 63 carried over — under a continuing coalition the carry-over is three times as common, which is why the copy says "selten", never "nicht mehr möglich". Title matching is exact on purpose: on the 57 dead XXVII drafts it found the real re-submissions (ElWG 310/ME → 32/ME, 173/ME → 3/ME) and the re-run Begutachtungen (41/ME → 55/ME), while every fuzzy threshold added different-law pairs; a generic title ("Tierschutzgesetz, Änderung") does match its next occurrence, so the copy claims "gleichlautend" and nothing more. Still deferred: the Initiativantrag path (a draft that became law via an MPs' motion reads as "keine RV" — the stage vocabulary never links `/A/` items), a state word in the archive list (needs one detail fetch per row), per-ministry rates once persistence exists (§12.4).

    **Nachtrag 30.09.2026 — das Zustandswort der Archivliste gibt es längst, und
    eines davon war falsch.** „Braucht einen Detailabruf je Zeile" stammt vom
    08.09.2026; seit dem 18.09. zahlt die Stationskarte (§12.26) genau diesen
    Abruf, für jede Periode, sechs Stunden gecacht, und `/api/drafts` hängt die
    Kette auch an die Zeilen einer beendeten Periode. Gemessen am Produktionsbuild
    (`pnpm build`, `PORT=3012 node .output/server/index.mjs`, erst
    `/api/stations/<GP>`, dann `/api/drafts?gp=<GP>`): **XXVII** 350 Zeilen, jede
    mit Station (57 Begutachtung, 1 Regierungsvorlage, 5 Parlament, 287 BGBl.),
    kalt 35,5 s; **XXVI** 163 (49/0/1/113), 17,8 s; **XXV** 329 (44/3/1/281),
    29,7 s; **XXIV** 543 (91/8/2/442), 62,1 s — alle `linked`. Neue Anfragen
    kostet das keine: Der Prewarm wärmt die laufende Periode und die Vorperiode,
    eine ältere zahlt den kalten Bau beim ersten Besuch, und die Liste antwortet
    bis dahin ohne Stationen und sagt das (2,5-s-Budget, unverändert).

    **Falsch war ein Wort, und nur in beendeten Perioden:** Eine Vorlage auf der
    Station `rv` hieß „Regierungsvorlage liegt vor" — über 2704 d.B. der GP XXVII,
    über 3 Vorlagen der XXV. und 8 der XXIV., die das Haus nie entschieden hat und
    die mit ihrer Periode verfallen sind. Die Detailseite nennt denselben Fall
    seit 23.09.2026 „Ohne Beschluss – Gesetzgebungsperiode beendet"; die Zeile
    sagt jetzt „Ohne Beschluss – GP beendet", die Kürzung der Leiste. Entschieden
    wird am Kalender der **Vorlage**, nicht des Entwurfs (`DraftChain.rvGpEnded`):
    Eine übertragene Vorlage (XXVII/352/ME → 127 d.B./XXVIII. GP) lebt in der
    laufenden Periode und liegt weiter vor. Derselbe Schalter sperrt seither in
    der Karte das Formular-Flag einer verfallenen Vorlage, wie es die Detailseite
    schon tat. **Nicht geändert:** „Bisher keine Regierungsvorlage" bleibt auf den
    Archivzeilen stehen — „bisher" stimmt dort weiter (4 von 61 bzw. 14 von 63
    Entwürfen kamen noch in der Folgeperiode), und die Grenze der Periode sagt die
    Detailseite in einem ganzen Satz. Ältere Perioden werden nicht vorgewärmt:
    Das wären über tausend Abrufe je Nacht für Seiten, die kaum jemand öffnet.

    **Der Initiativantrag-Pfad — gebaut 30.09.2026, und er ist kein Randfall.**
    Gezählt über die Stationskarte: Entwürfe mit abgelaufener Frist und ohne jede
    Regierungsvorlage gibt es in GP XXVI 49, in XXVII 57, in XXVIII bisher 34. Der
    ME→Antrag-Join (`pnpm corpus:me-antrag`, Stufe „belegt": ≥ 0,6 des kürzeren
    Gesetzestexts wörtlich im längeren) bindet davon **11, 25 und 6** an einen
    kundgemachten Initiativantrag — **42 von 140, fast ein Drittel** dessen, was
    bisher als „keine Regierungsvorlage" dastand. In XXVI stehen 9 der 11 im
    Juni/Juli 2019, nach dem Ende der Regierung; in XXVII und XXVIII wurden 8 der
    31 Anträge eingebracht, **während die Begutachtungsfrist noch lief** (die
    Pflegepakete 204–208/ME am 15.06.2022, Frist bis 21.06.). Kalibrierung XXVI:
    69 dokumentierte Entwurf→Vorlage-Paare (5-%-Quantil 0,53), kein einziges der
    100 versetzten falschen Paare über 0,026; 11 belegt, 0 schwach. Gelesen und
    bestätigt u. a.: 319/ME ↔ 4124/A (BRÄG 2024, der Antrag nimmt das RStDG dazu),
    159/ME ↔ 970/A (die Meldepflicht im B-KJHG, aufgegangen im
    Gewaltschutzgesetz 2019), 94/ME ↔ 1301/A (das Homeoffice-Paket ohne den
    EStG-Teil des Entwurfs).

    **Ein Fehler im Join-Skript, gefunden an XXVI:** Der Nachfolgezeiger nennt
    seine eigene Periode, das Skript las ihn aber mit der des Entwurfs — bei einer
    übertragenen Vorlage also eine andere Vorlage mit derselben Nummer (XXVI/I/1164
    gibt es nicht: 404). In XXVII verzerrte das vier Kalibrierungspaare (Recall
    99,1 % → 100 % nach der Korrektur); die Treffer beider Perioden sind
    Stück für Stück dieselben geblieben.

    **Zwei Stärken, weil „enthalten" nicht sagt, wer in wem steht.** Das Maß ist
    der Anteil des KÜRZEREN Texts im längeren: 72/A (570 Wörter) steht zu 77 % in
    6/ME (11.934), während 159/ME (198 Wörter) zu 97 % im Gewaltschutzgesetz
    steht. `scripts/corpus/meAntragTable.ts` rechnet aus Containment und Jaccard
    beide Richtungen aus und schreibt `shared/utils/antragPathTable.ts`. Trägt
    der Antrag mindestens die Hälfte des Entwurfstexts (`carriesDraft`, die
    Schwelle liegt in der Lücke 0,36 → 0,58 der 42 Werte), ist es der Weg des
    Entwurfs: 38 Entwürfe. Sonst nur der eines Teils: 4 (XXVI/27, XXVI/146,
    XXVII/94, XXVIII/6) — dort bleibt die Station, wo das Stufenprotokoll sie
    hinstellt, und die Seite nennt den Antrag in einem Satz.

    **Was die Oberfläche daraus macht:** Die Zeile sagt „Kundgemacht" mit der
    Fundstelle des Antrags und in Zone 2 „als Initiativantrag 1065/A" — die
    Station ist hier UNSERE Folgerung aus dem Wortlaut, also steht der Weg dabei
    (`DraftChain.antragCitation`, das eine erschlossene Feld der Kette). Die
    Stationskarte stellt diese Entwürfe auf `bgbl`: XXVII 57 → 33 Entwürfe an der
    Begutachtung, XXVI 49 → 40, XXVIII 40 → 35 (laufende Fristen inklusive). Die
    Detailseite überschreibt „Gesetz geworden – als Initiativantrag", die Leiste
    liest „keine – als Initiativantrag eingebracht", dann „Initiativantrag 1065/A
    · 20.11.2020" und die Kundmachung; unter „Die Regierungsvorlage" stehen statt
    der Wartesätze drei prüfbare: welcher Antrag, wie zugeordnet (mit dem Anteil),
    und — wo es zutrifft — dass er während der Frist eingebracht wurde. Zeitlich,
    nie ursächlich. Die Leiste hat dafür eine Regel gelockert: Eine erreichte
    Station spricht auch hinter einer nicht erreichten (`SpineRail`). Die
    Startseite und der Vorgänger-/Nachfolger-Hinweis folgen derselben Tabelle: Ein
    Vorgänger, der als Antrag Gesetz wurde, ist kein „zweiter Anlauf".

    **Kosten: keine Anfrage zur Laufzeit.** Der Join liest je Periode 700 bis
    1.100 Gesetzestexte und läuft deshalb von Hand, wie `rvLatency.ts` für die
    Basisraten; die Tabelle ist statisch. Für die laufende Periode veraltet sie
    ab `ANTRAG_PATHS_MEASURED` — ein neuer Antrag fehlt dann, und die Zeile sagt,
    was sie vorher sagte: die schwächere Aussage, keine falsche. Die Messung für
    XXVI kostete einmalig rund 700 Abrufe. **Nicht gebaut:** die Fälle MIT
    Vorlage, deren Text trotzdem als Antrag Gesetz wurde (XXVII/171, 240, 259/ME,
    XXVIII/2/ME — die Leiste zeigt dort weiter die belegte Vorlage, etwa „Im
    Parlament behandelt"), die schwache Stufe (20 in XXVII, 3 in XXVIII), die
    zu kurzen Anträge (2 in XXVI, 59 in XXVII, 6 in XXVIII), Perioden vor XXVI, und eine Erklärung des Wegs
    auf `/so-funktionierts`.

### 12.10b Ändert sich die Begründung? — gemessen, 22.09.2026

Das letzte offene Stück des Diff-Layers war eine Frage, keine Aufgabe: Der
Vergleich zeigt, wie sich der **Gesetzestext** zwischen Entwurf und
Regierungsvorlage ändert. Ändert sich auch die **Begründung** des Ressorts —
und lohnt dafür ein eigener Vergleich? Gemessen mit `pnpm corpus:erl-diff --
XXVIII`, alle 137 Entwürfe der Periode.

**Beide Seiten vom Parlament, mit demselben Parser.** Die Erläuterungen des
Entwurfs lägen auch im RIS als typisiertes XML, die der Regierungsvorlage
nicht — das RIS führt keine parlamentarischen Dokumente. XML gegen Word-HTML
zu halten misst zuerst die beiden Konverter (die Lehre der sechsten Messung
in §12.12), also liest `parseParliamentHtml` beide Seiten.

| GP XXVIII, 137 Entwürfe | |
|---|---|
| ohne Regierungsvorlage | 46 |
| eine Seite ohne Erläuterungen-HTML | 13 |
| in einer **Sammelvorlage** (nicht vergleichbar) | 14 |
| **ausgewertete 1:1-Paare** | **64** |

**Die Antwort ist ja, und sie ist deutlich.** Median-Abweichung 8,9 % der
Wörter; 16 Paare praktisch unverändert (< 2 %), 40 merklich geändert
(2–20 %), 8 stark (≥ 20 %). Drei Viertel der Vorlagen tragen also eine
Begründung, die nicht mehr die des Entwurfs ist.

**Und sie sagt, wo der Vergleich hingehört:** in den **Besonderen Teil**
(Median 10,5 %), nicht in den Allgemeinen (3,9 %). Das ist die Ebene, auf der
die Seite die Begründung ohnehin schon führt — am Paragraphen (§12.30).
Paragraphweise über dieselben 64 Paare: 1.653 §§ im Entwurf, 1.851 in der
Vorlage, **1.515 auf beiden Seiten** (92 % der Entwurfs-§§), und bei **728
davon (48 %) hat sich die Begründung geändert**. Der Join trägt: 63 der 64
Paare haben gemeinsame Paragraphen.

*Zwei Fallen, beide in der ersten Fassung der Messung und beide korrigiert,
bevor eine Zahl hier stand.* Erstens verwarf die Auswertung 32 von 43 Paaren:
`diffTokens` liefert oberhalb von 2,5 Mio. Zellen keine Segmente mehr,
sondern nur noch eine Ähnlichkeit — und die verworfenen waren die **langen**
Dokumente, also genau die interessanten. Die Quote steht jetzt auf
`similarity`, die es auf beiden Wegen gibt. Zweitens standen ganz oben acht
Entwürfe mit 80–98 % „Abweichung", die alle auf **dieselbe** Vorlage zeigten
(I/129, ein Sammelvorhaben mit 47.199 Wörtern): Gemessen war das Vehikel,
nicht die Begründung. Sammelvorlagen werden seither getrennt ausgewiesen.

*Und eine Prüfung der Eingabe, weil ein unerkannt kaputter Eingabewert
schlimmer ist als ein fehlender:* Der Parser liest 94–96 % der Wörter eines
Dokuments (Word-HTML ist zu neun Zehnteln Formatierung); unter 80 % fliegt
ein Paar aus der Wertung, statt als „stark geändert" zu zählen. In dieser
Periode fiel keines darunter.

**Was daraus gebaut ist und was nicht.** Gebaut: `explanationsHtml.ts`, der
die Erläuterungen des Parlaments in Allgemeinen Teil und adressierte Passagen
zerlegt — mit der Adresslogik aus `explanations.ts` (`addressOf`,
`isAddressHeading`, seit heute exportiert), damit „Zu Z 4 (§ 54c Abs. 1a und
1b)" auf beiden Seiten denselben Paragraphen bedeutet. Nicht gebaut: Dienst,
Endpunkt und Anzeige. Die Anzeige gehört an den § im Vergleich, und diese
Komponenten sind gerade in Arbeit; ein zweiter Bearbeiter darin wäre ein
Konflikt und kein Fortschritt.

**Gebaut am 22.09.2026, nach der Messung:** `server/utils/explanations/reasoningDiffService.ts`,
`/api/drafts/:gp/:inr/begruendung?von=me&bis=rv` und der Aufklapper an der
Änderung in `LawDiffSection.vue`.

*Wo die Auskunft steht, und warum nicht überall.* An jeder Änderung, deren
Begründung sich geändert hat, steht ein zugeklapptes „Die Begründung des
Ressorts zu diesem Paragraphen hat sich geändert" mit dem Wortdiff darin —
dieselbe Form wie die Begründung an der Gegenüberstellung (§12.30), weil es
dieselbe Art Frage ist: die zweite, nicht die erste. Was **nicht** an jeder
Zeile steht, ist „unverändert": Das an 33 Zeilen zu drucken wäre Lärm. Die
Quote steht einmal über der Liste („Zu 10 von 16 Paragraphen, für die beide
Fassungen eine Begründung führen, hat das Ressort sie geändert"), und sie
nennt beide Seiten, weil eine *unveränderte* Begründung zu einem geänderten
Text eine eigene Aussage ist.

*Drei Regeln, die der Dienst einhält.* Nur `me→rv`: Die späteren Stationen
haben Ausschussberichte, keine fortgeschriebenen Erläuterungen, und etwas
Ähnliches zu vergleichen wäre schlechter als nichts. Nur wo **beide** Seiten
eine Begründung zum Paragraphen führen — fehlt eine, ist das eine Lücke im
Dokument und keine Änderung der Begründung. Und geschlüsselt nach `unitKey`
wie die §-Namen, weil die Einheiten die Nummerierung der Regierungsvorlage
tragen und ein selbstgebauter zweiter Schlüssel die Begründung an die falsche
Änderung hängte.

*Am laufenden Server geprüft:* 8/ME 10 von 16 Paragraphen mit geänderter
Begründung, 70/ME 8 von 13, 63/ME 1 von 2. Die beiden gelesenen Dokumente
stehen in der Quellenzeile des Abschnitts — wer Text zeigt, sagt woher, auch
wenn der Text zugeklappt ist. (Die erste Fassung nannte hier 27 von 33, 16
von 21 und 1 von 2 — sie zählte Anordnungen und schrieb „Paragraphen"; siehe
die drei Korrekturen am Ende dieses Abschnitts.)

*Und die Aufzählung, die dabei auffiel — gemessen statt nebenbei geändert.*
`addressOf` las den Bereich („§§ 12 bis 14"), aber nicht die Aufzählung
(„§§ 12 und 13"): Dort bekam nur der erste Paragraph die Passage, obwohl das
Ressort beide in einem Atemzug erklärt. Der Ausdruck ist geteilter Code mit
dem RIS-Pfad, also entschied dessen eigene Messung
(`pnpm corpus:erlaeuterungen -- --join`, vorher und nachher über dieselben 130
Entwürfe):

| Der Join | vorher | nachher |
|---|---|---|
| §§ mit Begründung am Paragraphen | 1.578 (77,8 %) | **1.597 (78,7 %)** |
| Einträge aus den Erläuterungen | 1.886 | 1.907 |
| Deckung je Entwurf, Median | 89 % | **90 %** |
| davon ohne § in der Beilage (Verlust) | 308 | 310 |

Klein, echt und ohne Gegenrichtung: Die zwei zusätzlichen „ohne Ziel" sind
Adressen, die die Beilage nicht führt — ungenutzt, nicht falsch. Erfunden
wird nichts, jede Nummer steht im Text (anders als beim Bereich, wo
„§§ 140a bis 140i" die Buchstaben dazwischen erfinden müsste und deshalb
weiterhin nur reine Zahlen expandiert werden).

*Drei Fehler, alle am selben Tag am Bildschirm aufgefallen und behoben — der
erste eine falsche Zahl in genau dem Satz, der die Auskunft trägt.*

**Gerechnet wird am Paragraphen, gezeigt an der Anordnung.** Die Erläuterungen
sind nach Paragraphen gegliedert, die Gegenüberstellung nach
Novellierungsanordnungen, und mehrere Anordnungen ändern regelmäßig denselben
Paragraphen: 8/ME führt 33 Anordnungen auf 17 Paragraphen, sechs davon allein
auf § 11. Die erste Fassung rechnete je Anordnung und nannte das Ergebnis dann
„Paragraphen" — „zu 27 von 33" statt richtig 10 von 16 — und legte denselben
Vergleich mehrfach in die Antwort, einmal je Anordnung. Seit 22.09. rechnet
`reasoningDiff.ts` je Paragraph, `units` schlägt von `unitKey` dorthin um, und
die Antwort für 8/ME fiel dabei von 112 auf 86 kB, obwohl sie jetzt mehr
trägt.

**Eine Nummer ohne Gesetz ist mehrdeutig, also bleibt sie weg.** Eine Passage
des Besonderen Teils trägt „§ 15", nicht das Gesetz dazu. In einem
Sammelgesetz ändern zwei Artikel je einen § 15 — bei 8/ME das Staatsschutz-
und Nachrichtendienst-Gesetz und das Bundesverwaltungsgerichtsgesetz —, und
`passagesByParagraph` legt beide unter dieselbe Nummer. Angezeigt worden wäre
die Begründung des einen Gesetzes unter dem Paragraphen des anderen. Wo zwei
Artikel dieselbe Nummer adressieren, zeigt die Schicht deshalb nichts:
dieselbe Regel wie bei den §-Namen, ein falscher Bezug ist schlechter als
keiner. Kostet bei 8/ME einen von 17 Paragraphen. Die bessere Lösung wäre der
Artikel aus der Adresszeile selbst („Zu Art. 5 (Änderung des …) Z 1 (§ 15)");
sie gehört am Korpus gemessen, bevor sie gebaut wird, und steht deshalb
nicht als Vermutung hier.

**Gemessen am 26.09.2026 — und 8/ME war der milde Fall.** Über alle Entwürfe,
deren Entwurf und Regierungsvorlage beide Erläuterungen als HTML führen (GP
XXVII: 207, XXVI: 69), durch denselben Weg wie der Dienst
(`pnpm corpus:aenderungsrate -- --gp XXVII --reasoning`; der Blockdurchlauf
ist gegen `parseExplanationsHtml` geprüft, 0 Abweichungen): **Mehrdeutig sind
14,7 % der vergleichbaren Paragraphen in XXVII (413 von 2.801) und 22,4 % in
XXVI (263 von 1.174)**, verteilt auf 80 bzw. 32 Entwürfe. Das ist keine
Randregel, sondern ein Siebtel der Schicht.

Ein Schlüssel aus Artikel und Paragraph brächte **292 der 413** zurück (XXVI:
138 von 263). Zurück heißt: Jede Passage, die den Paragraphen nennt, steht auf
beiden Seiten unter einer Artikelnummer, und mindestens ein Artikel der
Einheiten findet seine Passage auf beiden Seiten. Die Nummer der Entwurfsseite
geht dabei über `pairArticles` auf die der Vorlage — 18/ME nummeriert von
Artikel 3 und 4 auf 6 und 5 um, und die Passagen passen erst dann. Übrig
bleiben Einheiten ohne Artikelnummer (92 Paragraphen in 15 Entwürfen, etwa
zwei getrennte Bundesgesetze ohne Artikelgliederung, wo nur der Gesetzestitel
schlüsseln könnte), Überschriften über mehrere Artikel („Zu Art. 1 Z 5 …
sowie zu Art. 13 Z 1 bis 3 …" — dort ist die Verweigerung richtig, weil die
einzige Passage zu § 7 ein anderes Gesetz meint als die Einheiten) und Marken
nur auf einer Seite.

**Eine Falle, die der Bau vermeiden muss.** Als Marke ein nacktes
„Artikel N" aus jedem Block zu nehmen, macht Richtlinienzitate und
Tabellenzellen zu Artikelgrenzen: „Art. 15 der Richtlinie 2019/790" legte in
143/ME § 86 UrhG unter einen Artikel 15, über XXVII sind es 184 solche Blöcke.
Ein nacktes „Artikel N" zählt deshalb nur in einer Überschriften-Klasse des
Word-Exports; „Zu Art. N …" gilt überall, wie schon für `isAddressHeading`.
Die RIS-Seite (`risExplanations.ts`) tut das stillschweigend, weil sie Marken
nur aus Überschriften-Elementen liest.

**Und ein Teil davon ist gar keine Mehrdeutigkeit.** 60 der 413 Paragraphen
stehen in Entwürfen, deren Artikel sich überhaupt nicht paaren (27, 124, 169,
216/ME): dasselbe Gesetz unter dem Titel des Entwurfs und unter Artikel 1 der
Vorlage, also scheinbar zweimal. Das behebt kein zweiter Schlüssel, sondern die
Artikelpaarung — derselbe Fehler, der im Vergleich darüber alles als entfernt
und neu zeigt (§12.18, Nachtrag).

**Gebaut 27.09.2026.** `HtmlPassage.article` trägt den Artikel, die
Diff-Einheiten tragen `articleKey` und `fromArticleKey`, und `compareReasoning`
schlägt eine mehrdeutige Nummer unter (Artikel, §) nach. Durch denselben
Aufruf wie der Dienst gemessen kommen **249 Paragraphen der GP XXVII und 142
der XXVI** zurück (421 bzw. 234 Vergleiche je Artikel) — weniger als die 292
der Vorhersage, und der Grund ist gemessen: Die Obergrenze von 120 Einträgen
je Entwurf. In Einheitenreihenfolge gefüllt, hätte der zweite Schlüssel bei
43, 202 und 230/ME Begründungen verdrängt, die dort heute stehen; deshalb
füllen die eindeutigen Nummern die Grenze zuerst, und **kein vorher gezeigter
Paragraph geht verloren**. Ob die Grenze für Sammelgesetze höher gehört, ist
eine eigene Frage — sie begrenzt die Antwortgröße, nicht die Richtigkeit.
**Beantwortet am 27.09.2026** (`e9217eb`): ohne Grenze trägt ein Entwurf im
Median 8 Einträge, p99 129–175, höchstens 237 (XXVII 230/ME); fünf Entwürfe
lagen über 120. Die Grenze steht jetzt bei 250. Der Preis, am laufenden
Server gemessen: 230/ME 81 → 188 kB auf einer Seite, deren
Paragraphenvergleich allein 800 kB wiegt. Zurück kommen damit 314
Paragraphen in XXVII, 143 in XXVI, 165 in XXVIII.
Am laufenden Server: 18/ME führt § 4 jetzt zweimal, unter Artikel 5 und 6.

**Und der Aufklapper war leer, wo die Passage zu lang war.** `diffTokens` gibt
oberhalb von 2,5 Mio. Zellen keine Segmente zurück, sondern nur die
Ähnlichkeit — dieselbe Schranke, die schon die Messung oben in die Irre
geführt hatte. Der Dienst reichte das `null` durch, `changed` blieb zu Recht
wahr, und die Anzeige klappte eine leere Lade auf: 9 von 27 Aufklappern bei
8/ME, alle an § 11 und § 15. Jetzt legt der Dienst in genau diesem Fall beide
Fassungen im Ganzen bei, und die Anzeige stellt sie nebeneinander — dieselbe
Form wie im Vergleich darüber, damit eine technische Schranke nicht wie eine
andere Art von Änderung aussieht. Weggelassen wird nichts: Dass die Begründung
eine andere ist, ist der Befund, und die Schranke ist unsere, nicht die des
Ressorts.

**Gebaut am 01.10.2026: die Begründung an der Ziffer.** „Gerechnet am
Paragraphen, gezeigt an der Anordnung" war präziser, als die Quelle ist. Die
Ressorts erklären eine Novelle nach Ziffern („Zu Z 4 (§ 54c Abs. 1a):", „Zu
Art. 2 Z 1 (§ 7):", „Zu Z 1 bis 3:") und ein neues Gesetz nach Paragraphen
(„Zu § 9:"); über 658 Erläuterungen nennen 15.166 Passagen eine Ziffer und
7.450 nur einen §. Am Paragraphen gesammelt, stand unter jeder Anweisung die
Begründung aller Ziffern am selben § — unter jeder der sechs Ziffern zu § 11
von 8/ME alle sechs —, und „Begründung geändert" kam oft von einer *anderen*
Änderung desselben Paragraphen (§12.11: bei 63 von 111 Einheiten über mehrere
§§). Jetzt gilt:

- **Eine Anweisung, die es auf beiden Seiten gibt, bekommt die Passage ihrer
  Ziffer**, jede Seite in ihrer eigenen Nummerierung — die Vorlage über
  Ziffer und Artikel der Einheit, der Entwurf über `fromId` und
  `fromArticleKey`. Die Ziffern liest `ziffernOf` aus der Überschrift:
  außerhalb der Klammern, mit Listen und Bereichen („Zu Z 1, 14, 24 bis 27"),
  mit dem Artikel je Ziffer („Zu Art. 1 Z 5 sowie zu Art. 13 Z 1 bis 3"),
  nicht hinter einem §, Absatz oder einer Anlage („Zu § 4 Z 1:" ist die
  Ziffer eines neuen Gesetzes) und nicht, wo die Überschrift in Prosa
  weiterläuft („Zu Z 4: Diese Definition …", 169 von 14.246
  Ziffer-Überschriften, jede gelesene die Ziffer einer Begriffsbestimmung).
  Passagen, die das Ressort unter eine Ziffer ohne eigenen Text setzt („Zu
  Z 3 (§ 6 Abs. 4 und 5):", darunter „Zu § 6 Abs. 4:" und „Zu § 6 Abs. 5:"),
  gehören zu ihr — gelesen an ihrer eigenen Adresse, nicht an den §§, die ein
  in Prosa weiterlaufender Absatz zitiert („Zu § 77a Abs. 9 vertritt die
  Kommission … § 40 …", 55/ME XXVIII, sonst auf beiden Seiten abgeschnitten).
  Nennen zwei Passagen dieselbe Ziffer („Zu Z 6 und 7 (§§ 17 und 18 …)" und
  „Zu Z 5 und 6 (§ 23a …)", 2/ME XXVIII), entscheiden die §§ der
  Überschriften: Es bleibt, was einen § nennt, den die Anweisung ändert, und
  passt keine, bekommt die Anweisung keine. Eine *einzelne* Passage wird nicht
  nach ihren §§ beurteilt — ihre §-Liste ist die Kurzschrift des Ressorts für
  eine Reihe von Ziffern („Zu Z 54 bis 58 (§ 40 Abs. 1 … § 48 Abs. 9)"
  erklärt auch Z 54 an § 39, 61/ME XXVIII), und so beurteilt hätte die Wache
  78, 333 und 472 richtige Passagen verworfen; als Wache bei Kollisionen sind
  es 27, 113 und 72 in XXVIII, XXVII und XXVI. Wo eine Seite die Änderung
  nach § betitelt — häufig der Entwurf, den die Vorlage dann nach Ziffern
  neu überschreibt („Zu § 11
  Abs. 1b und 2:" gegen „Zu Z 9 und 10 (§ 11 Abs. 1b und 2):", 48/ME
  XXVIII) —, zählen auf dieser Seite die nur nach § betitelten Passagen. Die
  Passage einer *anderen* Ziffer bekommt eine Anweisung nicht mehr.
- **Gezählt wird die Passage, gezeigt an jeder Anweisung.** Ein Eintrag ist
  ein Paar von Passagen; „Zu Z 1 bis 3" ist eine Begründung, die an drei
  Anweisungen steht — derselbe Schutz, den der §-Join am 22.09. am
  Paragraphen gebaut hatte. Der Satz über dem Vergleich zählt deshalb
  Begründungen, nicht Paragraphen, und der Aufklapper sagt „zu dieser
  Änderung" und nennt die Überschrift der Vorlage.
- **Verglichen wird nur bei gleichem Umfang.** „Zu Z 1:" und „Zu Z 2:" im
  Entwurf gegen „Zu Z 1 und 2:" in der Vorlage ist eine Umgruppierung, keine
  Überarbeitung. Verglichen wird, wo die Passagen beider Seiten dieselben
  Einheiten umfassen, eingefügte und entfernte eingeschlossen: „Zu Z 26
  (§ 122 Abs. 1):" gegen „Zu Z 31 und 32 (§ 122 Abs. 1 und 2):", deren Z 32
  neu ist (41/ME XXVIII), erklärt jetzt eine zweite Änderung mit. Unter zehn
  Einheiten muss der Umfang gleich sein, darüber reicht ein Anteil von 0,9 —
  für die Querschnittspassage, deren Liste von zwanzig Ziffern in der Vorlage
  eine mehr führt (131/ME XXVI). Die Regel greift bei 242, 645 und 396
  Einheiten in XXVIII, XXVII und XXVI, 8–13 % der Anweisungen am
  Ziffer-Join. Nach Grund: verschiedene gepaarte Einheiten 79, 295 und 223;
  nur eingefügte 74, 127 und 49; nur entfernte 13, 50 und 14; eine entfernte
  auf der einen und eine eingefügte auf der anderen Seite 76, 173 und 110 —
  in den gelesenen Fällen oft dieselbe umgeschriebene Anweisung, die die
  Paarung nicht als eine erkannt hat (65/ME XXVIII).
- **Wo die Regel greift, steht die Begründung ohne Urteil.** Der Eintrag
  trägt beide Passagen (`comparable: false`, Überschrift und Text beider
  Seiten), einmal je Passagenpaar und an jeder Anweisung gezeigt wie die
  anderen; der Aufklapper heißt „Die Begründung des Ressorts zu dieser
  Änderung", sagt in einem Satz, warum nicht verglichen wird („Entwurf und
  Regierungsvorlage fassen die Begründung zu dieser Änderung verschieden
  zusammen; verglichen wird sie deshalb nicht."), und zeigt beide Texte unter
  ihren Überschriften — ohne „geändert", ohne „unverändert". Der Satz über
  dem Vergleich zählt weiter nur die verglichenen. So gezeigt sind 107, 288
  und 111 Passagenpaare in XXVIII, XXVII und XXVI. **Außer, die beiden Texte
  sind Wort für Wort gleich** (`sameWords`, nachgezogen am selben Tag): dann
  kann keine Umgruppierung ein falsches „geändert" erzeugen, und
  „unverändert" stimmt, wie immer die Ziffern gruppiert sind — 65/ME XXVIII
  stellte sonst „Redaktionelle Anpassungen." unter acht Ziffern zweimal
  nebeneinander. Das betraf 23, 68 und 46 Paare; die Zahl der geänderten
  rührt es nicht an.
- **Der Artikel wird gelesen, wie das Dokument ihn schreibt.** Ein einzelnes
  Gesetz, das eine Seite als „Artikel 1" führt und die andere nicht (124/ME
  und 268/ME XXVII), wird ohne Artikel geschlüsselt; ein Paket, dessen
  Erläuterungen keine Artikel markieren, nach Ziffer und § („Zu Z 7
  (§ 22):", 151/ME XXVI) — dort nur für einen § mit eindeutiger Nummer,
  dieselbe Wache wie beim §-Join.

**Was am Paragraphen bleibt.** Eine Einheit, die ein § *ist* (ein neues
Gesetz), jede andere Einheit und jeder Entwurf, dessen eines Dokument keine
Passage nach Ziffern betitelt: dort der §-Join unverändert, und gemessen hat
sich auf diesem Weg kein Urteil bewegt. Ebenso eingefügte und entfernte
Anweisungen: Ihnen fehlt auf der anderen Seite die Ziffer, gegen die man ihre
Passage halten könnte; ihr Eintrag sagt „Paragraph", weil sich mit ihnen die
Begründung des Paragraphen bewegt. Die Aufklapper an der Gegenüberstellung
(§12.30) bleiben je §, wie sie sind.

**Das Tor, ausdrücklich:** Nichts verliert eine Begründung, die es heute
zeigt. Gezählt werden die Einheiten mit einer gezeigten Begründung,
verglichen oder nicht (a′); verloren ist eine Einheit, die alt eine hatte und
neu keine, aufgefangen eine, die ihre über einen Rückfall bekommt — den
§-Join für eingefügte und entfernte Anweisungen, eine nach § betitelte
Passage oder die Anzeige ohne Urteil. Die Urteile (verglichen, geändert)
stehen getrennt daneben. Auf dem unveränderten §-Weg hat sich kein Urteil
bewegt.

*Alt gegen neu durch dieselben Funktionen gemessen*
(`pnpm corpus:aenderungsrate -- --gp <GP> --ziffer`:
`compareReasoningByParagraph` gegen `compareReasoning`):

| | XXVI | XXVII | XXVIII |
|---|---|---|---|
| (a′) Einheiten mit gezeigter Begründung | 2.036 → **2.461** | 4.864 → **5.772** | 2.272 → **2.455** |
| verloren | 63 | 90 | 83 |
| davon mit nur fremden Passagen | 37 | 24 | 55 |
| vom Rückfall aufgefangen | 620 | 1.354 | 526 |
| neu dazu | 488 | 998 | 266 |
| verglichene Begründungen | 1.237 → 1.328 | 3.102 → 3.589 | 1.357 → 1.556 |
| davon geändert | 560 → 485 | 1.454 → 1.429 | 628 → 602 |
| gezeigt ohne Urteil | 111 | 288 | 107 |
| „geändert" → „unverändert", die eigene Passage gleich | 191 | 356 | 150 |

Die größte Bewegung ist die gewollte: Anweisungen, deren eigene Passage
gleich geblieben ist und die nur „geändert" hießen, weil eine andere Ziffer
am selben § neu begründet wurde. Dazu kommen die Anweisungen über mehrere
§§, die seit dem 28.09. keine Begründung hatten: 169 der 327 gepaarten haben
jetzt eine. Das Tor hält in allen drei Perioden, deutlich: verloren 63, 90
und 83 Einheiten, davon 37, 24 und 55 mit einer Begründung, die nur aus
Passagen anderer Ziffern bestand. Die übrigen erklärt das Ressort auf einer
Seite weder nach ihrer Ziffer noch nach ihrem §. Die Obergrenze steigt von
250 auf 350 Einträge, weil eine Passage kürzer ist als alle Passagen ihres §
und die ohne Urteil gezeigten Paare mitzählen: höchstens 311 je Entwurf
(XXVII 230/ME).

### 12.11 Speaking names — mostly a lookup, not a language model

Asked for in user feedback (2026-09-08): speaking names for procedures and
for single changes, wherever they exist. A legistic instruction line ("In § 9
Abs. 1 wird nach der Wortfolge … eingefügt") is unreadable for anyone who is
not a policy specialist, and that is most readers.

**Shipped 2026-09-08, the free part.** A Novellierungsanordnung that installs
a whole § quotes that §'s own heading, and `segmentUnits` used to consume it
as a pending heading and drop it. It is now kept: as the unit's readable name
(`quotedHeading`) and as part of the compared text — because "lautet samt
Überschrift" changes the heading, so dropping it made a heading-only change
invisible. Corpus effect: 2 of 5.335 units moved from unchanged to changed
(125/ME, 69/ME), which is exactly the blind spot; nothing else shifted.

**Coverage measured, and it is small:** 266 of 3.092 changed units (9 %) get a
name this way. A quoted heading only exists where a whole § is re-enacted;
most instructions edit a phrase inside a § that keeps its title.

**Which is where the interesting finding is.** For those, the readable name is
the *title of the § being amended* — "In § 9 Abs. 1 …" → what is § 9 called in
the standing law? That is a **lookup in RIS Bundesrecht**, not a generated
summary: exact, quoted, no machine-generated marking, no running cost. It
shares its prerequisite with the consolidated-text package (§12.12), and the
lookup half is far smaller than an amendment engine — no Novellierung has to
be applied, only a heading resolved.

**Built 2026-09-09** (`server/utils/lawtext/draftArticles.ts`, `diff/paraTitleService.ts`,
`/api/drafts/:gp/:inr/paragraphtitel`). Named changes went from 11,2 %
to **32,6 %** of changed units, measured over 12 Novellen and 457 units.
8/ME now reads "Erweiterte Gefahrenerforschung und Schutz vor
verfassungsgefährdenden Angriffen" where it read "§ 6 Abs. 1 Z 9 lautet".

**The join is exact, not fuzzy** — which is why this was an afternoon and not
a research project. Every amending Artikel opens with its Promulgationsklausel
("Das Strafgesetzbuch, BGBl. Nr. 60/1974, … wird wie folgt geändert"), and RIS
carries the same pair as `StammnormPublikationsorgan` + `StammnormBgblnummer`.
`Kundmachungsorgannummer` narrows, the Stammnorm pair decides. Resolved on
25 of 25 Novellen tested. The Teil is load-bearing: `84/2001` is both the
Audiovisuelle Mediendienste-Gesetz (BGBl. I) and an Amtssitz law (BGBl. III).
Where the match is ambiguous the change simply keeps no name.

**Two traps, both of the "silently wrong" kind.**

1. *An instruction that creates a § names its anchor.* "Nach § 5 wird
   folgender § 5a eingefügt" addresses § 5, but the change is § 5a — titling
   it from § 5 would put a real heading from the standing law onto a
   paragraph it does not describe. `addressedParagraph` returns null for
   those; they carry the draft's own quoted heading anyway.
2. *A `Map` does not survive `defineCachedFunction`.* It serialises to JSON,
   so the resolved law came back as `{}` from the cache and the lookup worked
   exactly once per process. Cached shapes are plain records now. Second
   cache-shape bug of the day, after the missing field on `RisBegutFlat`
   (§12.13) — the pattern is that a cache turns a shape change into a *wrong
   answer*, not a stale one.

**Why its own endpoint.** A draft can address dozens of paragraphs across
three laws. On the diff's critical path that is a slow first request and a
shared failure; beside it, the names simply appear when they arrive.

**AI is therefore not what this needs.** It would buy something different: a
summary of what a change *does* ("Überwachung verschlüsselter Nachrichten"),
which is an optional product on top, not the precondition for legibility. If
it is ever built, three conditions hold, and the cost is why:

1. **Generated once per document into a data file**, keyed by a content hash
   of the unit text (published documents never change, so the hash is stable
   across parser changes too). Never an LLM call in the request path. The
   closest comparable project — a private German bill tracker using GPT-4 plus
   a hosted automation service — runs at ~€110/month and is donation-financed.
   This project's survival argument is the opposite: €40/year, boring, nothing
   that breaks when nobody looks for three months. The predecessor died in
   operation, not in construction.
2. **Marked as machine-generated**, and never replacing the legistic text —
   only sitting above it. netidee requires an AI disclosure regardless.
3. **Only for drafts, never for statements.** Draft texts and Vorblätter come
   from RIS and are CC-BY open data; the Begutachtungsverfahren — the
   Stellungnahmen above all — is excluded from open-data reuse altogether
   (§13.1). Do not blur that line.

The cheap half needs neither: a curated alias per procedure
(`shared/utils/draftAliases.ts`) — "Bundestrojaner" appears in no official title,
so the tool was unfindable under the name the public uses.

**Gemessen und zweimal repariert, 19.09.2026 — die Deckung war nie gezählt
worden.** §12.11 kannte nur die 9 % der zitierten Überschriften; wie viel der
*Nachschlag* auf dem ausgelieferten Pfad wirklich benennt, stand nirgends.
Über 10 Entwürfe der XXVIII. GP und 565 geänderte Einheiten: **47 %**
(Median je Entwurf 49 %) — und zwei Entwürfe bei exakt **0 %**, was nach
einem Schalter aussieht und keiner war, sondern zwei verschiedene Ursachen.

*Erste Ursache: Die Vorlage zählte als Inhalt.* Ein Entwurf ohne Artikelzeile
trägt seinen Titel als ganzen Satz — „Bundesgesetz, mit dem das
Lebensmittelsicherheits- und Verbraucherschutzgesetz **geändert wird**". Die
Stoppwortliste von `lawNameScore` kannte „Änderung", aber nicht die Verbform,
also zählten „geändert" und „wird" als Namensbestandteile: 2 von 4 gemeinsamen
Wörtern, Score 0,50, und `pickByName` verlangt 0,60. Das ist kein Randfall,
sondern genau der Fall, für den der Name da ist — BGBl. I Nr. 13/2006 schafft
**zwei** Gesetze (LMSVG und Kontroll- und Digitalisierungs-Durchführungsgesetz),
und ohne Entscheidung verweigert der Resolver. Mit den Verben auf der Liste
steht es 1,00 gegen 0,00. **70/ME: 0 → 14 von 20 Namen.**

*Zweite Ursache: eine Klausel, die nicht wie eine aussah.* „Das
Eltern-Kind-Pass-Gesetz, BGBl. I Nr. 82/2023, wird **in seinem Artikel 1** wie
folgt geändert" — zwischen Verb und Formel steht eine Einschränkung, und
`AMENDS_RE` verlangte sie nebeneinander. Betroffen sind ausgerechnet die
artikelgegliederten Gesetze. Der Ausfall war dreifach und still: Der Artikel
fehlte unter **„Geltendes Recht"** (60/ME zeigte zwei Gesetze, der Entwurf
ändert drei), seine §§ bekamen keinen Namen, und die konsolidierte Lesefassung
zählte sie nicht einmal in ihren *Nenner*. Der Ausdruck lässt jetzt eine
begrenzte Lücke ohne Satzzeichen zu — ein Querverweis im Text eines neuen
Gesetzes bleibt draußen (die Verwechslung von 101/ME), und ein Test hält beide
Seiten fest.

| 10 Entwürfe, 565 geänderte Einheiten | vorher | nachher |
|---|---|---|
| benannte Einheiten | 267 (47 %) | **281 (50 %)** |
| Median je Entwurf | 49 % | **70 %** |
| Entwürfe bei 0 % | 2 | **1** |

*Was die verbleibende Hälfte ist, ist damit zum ersten Mal gezählt* (Spur je
Einheit über dieselben Entwürfe): **keine Klausel für den Artikel** (79/ME: 16
von 25 — eine dritte, noch nicht untersuchte Ursache), **kein lesbarer § in
der Anweisung** (74/ME: 89 — Anlagen und Formen, die `addressedParagraph`
nicht liest), **§ nicht im aufgelösten Gesetz** (60/ME: alle 44 — das
artikelgegliederte Gesetz, dessen §§ das RIS unter dem Sammel-BGBl führt; die
Verweigerung ist hier richtig) und **§ ohne Überschrift im RIS** (einzelne).
Keine dieser Klassen ist ein Sprachmodell-Problem; drei davon sind
Nachschlagefehler und eine ist eine korrekte Verweigerung.

*Die größte dieser Klassen war eine Fehldiagnose, 26.09.2026.* „Keine Klausel
für den Artikel" klang nach einem Leseausfall und war keiner: Die 16 Einheiten
in 79/ME stehen alle im **Artikel 2, der das Verbraucherkreditgesetz 2026
erlässt** — ein neues Gesetz ändert nichts, hat also keine
Promulgationsklausel, kein geltendes Recht und nichts nachzuschlagen. Die
Verweigerung war richtig. Falsch war, den Namen woanders zu suchen: Der
Entwurf **druckt ihn selbst** über den Paragraphen („§ 1 Regelungsgegenstand",
„§ 2 Begriffsbestimmungen"), `segmentUnits` liest ihn seit jeher als
`heading`, und die Seite zeigte ihn auch — nur eben in der Zeile für „die
Überschrift, die der Block nicht ohnehin sagt", nicht als Namen. Gezählt wurde
er darum nirgends.

Die Regel ist jetzt eine Stelle mit drei Quellen (`shared/utils/unitName.ts`,
getestet): zitierte Überschrift der Anweisung, dann Nachschlag im geltenden
Recht, dann die eigene Überschrift des Entwurfs — **letztere nur für einen §**.
In einer Novelle ist die Einheit eine Novellierungsanordnung, und deren
Überschrift IST die Anweisungszeile (`novaoHeading`); als Name stünde der
halbe Satz zweimal (121/ME Z 9, 116/ME Z 2 sind genau das).

*Und was die Klasse wirklich enthält, über 40 Entwürfe mit Vergleich und 1.250
geänderte Einheiten gemessen:* 46 Einheiten ohne Klausel, davon **39 §§ neuer
Gesetze mit eigener Überschrift** (79/ME 16, 93/ME 23 — die sind jetzt
benannt), vier §§ neuer Gesetze, über denen der Entwurf gar keine Überschrift
druckt (nichts vorhanden, nichts zu holen), und **drei echte Ausfälle**: drei
Novellierungsanordnungen in Artikeln, deren Klausel dasteht und deren Zitat
nur anders geschrieben ist — der Rest der Ursache, und eine Frage an den
Zitatleser, nicht an die Namensregel. Der folgende Absatz behandelt sie.

Die Deckung hat seither einen Befehl statt einer Handrechnung:
`npx vite-node scripts/audit/paraTitle.ts XXVIII 40` zählt sie mit derselben
Regel, die die Seite anzeigt, und prüft im zweiten Block wie bisher die
Richtigkeit. Über 40 Entwürfe mit Vergleich und 1.250 geänderte Einheiten:

| Quelle des Namens | Einheiten |
|---|---|
| zitierte Überschrift der Anweisung | 101 |
| Nachschlag im geltenden Recht | 675 |
| **eigene Überschrift (neues Gesetz)** | **39** |
| benannt | **815 (65 %)**, vorher 776 (62 %) |
| Median je Entwurf | 73 % · Entwürfe ganz ohne Namen: 3 |

Der Richtigkeitsblock desselben Laufs: 415 angezeigte Namen, 238 mit Gesetz,
§ und Überschrift bestätigt, **0 falsche Überschriften**, 24 nicht unabhängig
prüfbar und 143, bei denen ein Bundesgesetzblatt mehrere Gesetze schafft — die
Auflösung hängt dort am Artikelnamen, den die Prüfung gerade nicht benutzen
darf, wenn sie unabhängig bleiben soll. Zehn Namen meldet sie als „falsches
Gesetz"; das ist die im Skriptkopf beschriebene Falschmeldungsklasse
(Abkürzung im Artikeltitel, seither umbenanntes Gesetz). **Keiner der zehn
liegt in einem Entwurf, dessen Zitat jetzt neu gelesen wird** — für 96/ME und
109/ME einzeln nachgeprüft: zehn aufgelöste Gesetze, null Abweichungen.

*Die Klausel, die das Ressort anders schreibt, 26.09.2026.* Über die 137
Entwürfe der XXVIII. GP mit RIS-Dokument: von 511 ändernden Artikeln nannten
**neun** ihre Stammnorm in einer Schreibweise, die `parseBgbl` nicht las — und
keiner davon zitierte etwas anderes, alle neun zitierten dasselbe anders
getippt. „BGBI." mit großem I statt kleinem l (20/ME, zweimal), „BGBl. Nr. I
Nr. 30/2006" mit doppeltem Kürzel (109/ME), „BGBl. I. Nr. 100/2018" mit Punkt
hinter dem Teil (20/ME), „dRGBl. S 219/1897" ohne Punkt hinter dem Kürzel
(UGB, 4/ME und 100/ME) und „BGBl. 624/1978" ganz ohne Kürzel (FSVG, 96/ME).
Der Ausdruck liest diese fünf Formen jetzt; `organKey` lässt beim Vergleich
das Kürzel weg, weil RIS es immer schreibt und das Ressort manchmal nicht.
**Der Teil wird dabei nie angetastet** — 30/2006 ist im Teil I das
Hochschulgesetz 2005 und im Teil III eine Grenzgänger-Durchführung.

Zwei bleiben ungelesen, und zwar richtig: „BGBl. I Nr. 29/200" (61/ME) ist
eine Jahreszahl mit drei Stellen, und aus ihr 2000 zu raten hieße, ein Gesetz
hinter eine Nummer zu stellen, die im Entwurf nicht steht; eine Klausel ohne
jedes Organ (4/ME, „…(GenRevG 1997), wird wie folgt geändert") hat keine
Stammnorm zu lesen.

**Alt gegen Neu über 475 Entwürfe** (XXVIII und XXVII, 1.465 ändernde
Artikel): **11 neu gelesen, 0 anders gelesen, 0 verloren.** Jedes der elf
wurde einzeln gegen das RIS geprüft — jedes löst auf das Gesetz auf, das der
Artikel in seiner Überschrift nennt, auch dort, wo ein Bundesgesetzblatt zwei
Gesetze schafft (BGBl. I Nr. 100/2018 → Selbständigen-Sozialversicherungs-
gesetz *und* Notarversorgungsgesetz, beide über den Artikelnamen getrennt).
Das ist der Grund, warum diese Weitung überhaupt vertretbar ist: ein falsches
Gesetz wäre schlimmer als keines, und die Messung zeigt, dass keine einzige
bisher richtige Auflösung sich bewegt hat.

Der Ausfall war wie am 19.09. dreifach — kein Name, kein Eintrag unter
„Geltendes Recht", kein Nenner in der Lesefassung —, und der dritte davon ist
der sichtbarste. **Am Tor gemessen, je Entwurf vorher/nachher**
(`harness:annex`): 100/ME (ESAP-Justizgesetz, XML-Pfad) bestätigt **2 → 4**
Paragraphen, ungeprüft 14 → 12, „Stammnorm im RIS nicht auflösbar" 2 → 0;
96/ME (Sozialversicherungspaket, PDF-Pfad) bestätigt **11 → 12**, ungeprüft
13 → 12, nicht auflösbar 1 → 0. Das ist Text in „Wie das Gesetz danach lauten
würde", der vorher fehlte. **Vier der fünf betroffenen Entwürfe der XXVIII. GP
stehen in der Drift-Grundlinie** (4/ME und 96/ME im PDF-, 100/ME und 109/ME im
XML-Pfad), der nächste Wochenlauf wird also Klasse-B-Bewegung melden — sie
gehört zu diesem Commit, und die Grundlinie wird aus dem Lauf-Artefakt neu
geschrieben.

*Und eine Einordnung, die aus dem neuen Kriterium folgt:* Dieses Paket trägt
keine der vier Kostenarten — kein Betrieb, kein Partner, keine
Rechnung, kein offener Ausgang. Es ist gewöhnliche Arbeit und steht seit
19.09.2026 nicht mehr unter den Antragspaketen.

*Der Paragraph vor dem Namen, seit 22.09.2026.* „Z 2" ist die Nummer der
Novellierungsanordnung, nicht die des Paragraphen. Ein Name wie „Erweiterte
Gefahrenerforschung und Schutz vor verfassungsgefährdenden Angriffen" schwebte
damit über einer Bezeichnung, die den § nirgends nennt — er stand nur im
Anweisungstext darunter —, und drei Anordnungen zu demselben Paragraphen sahen
aus wie dreimal dieselbe Zeile. Der adressierte Paragraph wird für die Suche
nach dem Namen ohnehin gebildet (`addressedParagraphOf`, jetzt eine Stelle für
alle Aufrufer); er geht seither als eigene Karte neben den Namen hinaus, auch
wo das RIS den Namen schuldig bleibt, denn „§ 6" allein ist schon eine
Auskunft. Angezeigt wird „§ 6 Erweiterte Gefahrenerforschung …" — und weg
bleibt der Vorsatz, wo die Einheit selbst der Paragraph ist
(Gegenüberstellung, neues Gesetz), sonst stünde er zweimal in einer Zeile.

*„Die §§ 6 und 7" ist kein § 6, seit 28.09.2026.* `novao` liest die Form als
**eine** Adresse mit Geschwistern (`para: '§ 6'`, `siblings: ['7']`), und
`addressedParagraph` nahm nur `para` — die Einheit bekam Karte, Namen und
Begründung des ersten Paragraphen. Die Stichproben zeigen, was das hieß: „In
den §§ 19, 24, 25, … und 87 wird die Wortfolge … ersetzt" stand als § 19, „Die
§§ 7 bis 12 werden durch folgende §§ 7 bis 9 ersetzt" als § 7. Seither zählen
Geschwister auf §-Ebene als Paragraphen, und für mehrere gilt die Regel, die
schon für „§ 4 … sowie § 4a" galt: kein Name. Ein halber Name ist schlechter
als keiner. **Zwei Fragen, zwei Funktionen:** Die Artikelpaarung ME→RV
(`diff/lawDiff.ts`) fragt nicht nach *einem* Namen, sondern nach der Menge der
adressierten §§ — für sie heißt die Form beide, nicht keiner
(`instructionParagraphs`). Gemessen über XXVI–XXVIII
(`corpus:aenderungsrate -- --reasoning`): Basisrate, Eimer und Phantompaare
**unverändert** in allen drei Perioden; der Begründungsvergleich verliert
97 Einheiten, netto **23 verglichene §§** (919 → 918, 2.461 → 2.443,
1.031 → 1.027), weil die meisten dieser §§ auch über eine andere Einheit
erreicht werden. Die Namensdeckung über 40 Entwürfe der XXVIII bewegt sich
nicht (861 → 863 ist Rauschen kalter RIS-Abrufe, beide Zeilen „nicht
unabhängig prüfbar" → „bestätigt"). Offen und jetzt beziffert: die 97
Einheiten mit **allen** ihren Paragraphen zu zeigen („§§ 65–68", je § die
Erläuterung) — eine Formänderung des Ergebnisses, kein Zweizeiler.

*Mehrere §§ in einer Anweisung: die Erläuterungen sind nach Ziffern
gegliedert, nicht nach Paragraphen — gemessen 30.09.2026, und darum nicht
gebaut.* Die Formänderung hing an einer Voraussetzung, die vorher zu lesen
war: dass der Besondere Teil eine solche Anweisung je Paragraph erklärt. Er
tut es fast nie. In den ME→RV-Vergleichen der XXVI.–XXVIII. GP, bei denen
beide Erläuterungen als HTML vorliegen, adressieren **449
Novellierungsanordnungen mehr als einen §** (zusammen 1.509 §§). Gelesen
wurde, welche Passagen die Ziffer der Einheit in ihrer Überschrift nennen
(`corpus:aenderungsrate -- --gp … --multi`; jede Einheit steht mit den
Überschriften und dem Anfang ihrer Passagen im Lauf, gelesen wurden sie
auch):

| Passagen zur Ziffer, Regierungsvorlage | Einheiten |
|---|---:|
| eine Passage für alle §§ der Anweisung | 173 |
| … davon zusammen mit anderen Ziffern („Zu Z 1 bis 3: Anpassung an das Bundesministeriengesetz") | 112 |
| eine Passage für einen Teil der §§ | 102 |
| keine Passage zur Ziffer | 106 |
| mehrere, gemischt — meist gleich nummerierte Ziffern anderer Artikel | 60 |
| **je § eine eigene Passage** („Zu Art. 2 Z 22 (§ 65):", „… (§ 66):") | **8 (1,8 %)** |

Im Entwurf sind es 12. Die acht sind alle Neufassungen eines Bereichs („Die
§§ 65 bis 68 samt Überschriften lauten", 74/ME XXVI — genau das Beispiel
der Frage —, 51/ME XXVIII, 75/ME, 76/ME und 165/ME XXVI), und selbst diese
Form wird häufiger gemeinsam erklärt („Zu Z 19 (§§ 23 und 24):", 56/ME
XXVI). Die Masse sind Querschnittsanordnungen — „In § 1 Abs. 1, § 7
Abs. 3, § 9 Abs. 1 … wird die Abkürzung ‚BBG' durch ‚BBezG' ersetzt" —, und
die begründet das Ressort mit einem Satz für die Ziffer.

*Was der Join am Paragraphen daraus machte, und warum das gegen die Liste
spricht.* `passagesByParagraph` sammelt je § alle Passagen, die ihn nennen,
auch die anderer Ziffern — für eine Einheit mit einem § ist das die
bewusste Entscheidung von §12.10b („am Paragraphen gerechnet, an der
Anweisung gezeigt"). Von den 449 Einheiten haben 111 auf allen ihren §§
beidseits eine Begründung, und bei **63** davon unterscheiden sich die Texte
von § zu §, obwohl das Ressort die Ziffer in einem Satz erklärt: Der
Unterschied sind die Begründungen *anderer* Änderungen am selben
Paragraphen. Weitere 207 Einheiten berühren eine §-Nummer, die ein zweiter
Artikel desselben Pakets ebenfalls adressiert. Eine Liste „je § die
Erläuterung" hätte unter einer Anordnung, die eine Ressortbezeichnung
tauscht, die Begründung fremder Ziffern ausgeklappt, oft dieselbe Passage
mehrmals — eine Genauigkeit, die in der Quelle nicht steht.

Was zur Quelle passen würde, ist ein anderer Join: die Passage an **ihrer
Ziffer** („Zu Z 22"), über `fromId` durch die Umnummerierung ME→RV geführt
und in Paketen mit dem Artikel geschlüsselt wie der zweite Schlüssel vom
27.09. Er beträfe auch die Einheiten mit einem einzigen §, unter denen heute
sechs Ziffern dieselbe Begründung von § 11 zeigen (8/ME) — eine Entscheidung
über §12.10b und nicht ein Nachtrag an dieser Stelle. Deshalb bleibt die
Einheit über mehrere §§ ohne Namen und ohne Begründung, wie seit dem 28.09.
*Die Begründung ist seit 01.10.2026 gebaut (§12.10b):* 169 der 327 gepaarten
Einheiten über mehrere §§ in XXVI–XXVIII haben sie jetzt, über ihre Ziffer;
einen Namen weiterhin nicht.

*Die Anweisung, deren Verb die Grammatik nicht kennt, nennt ihren § trotzdem —
gelesen seit 30.09.2026.* Die Klasse „kein lesbarer § in der Anweisung" war
zum großen Teil kein Problem der Adresse, sondern eines des Verbs: „In § 5
Abs. 1 entfällt die Wort- und Zeichenfolge …, nach der Wortfolge … wird …
eingefügt" verweigert `parseInstruction` („Streichung ohne Text"), und das
zu Recht für `kons/lawApply.ts`, das die Anweisung ausführen muss. Ein Name
fragt nur, *wo* sie geschieht. `addressedParagraph` liest die Adresse jetzt
dort nach, wo gar keine Operation herauskam, mit derselben Funktion wie die
Beilagenseite (`refusedAddresses` und ihre drei gemessenen Verweigerungen).
Die Artikelpaarung bleibt bei der getippten Lesung — `instructionParagraphs`
ist unverändert, und Basisrate, Eimer und Median stehen in allen drei
Perioden wie vorher.

**Alt gegen Neu über 27.203 Einheiten** der ME→RV-Vergleiche XXVI–XXVIII
(`corpus:aenderungsrate -- --gp … --addresses`, jede Abweichung gedruckt):
**602 Anweisungen neu gelesen** (430 davon geändert), **0 anders gelesen**.
Gelesen wurden alle, und fünf Formen ergaben dabei einen falschen § — die
erste Fassung las 660. Sie bleiben ungelesen, jede mit einem Test: das
Inhaltsverzeichnis in Wortlauten, die die Grammatik nicht als solches kennt
(„Der den § 56 betreffende Eintrag des Inhaltsverzeichnisses lautet:"), ein
§, den die Anweisung erst schafft („… ersetzt durch § 16 (neu) samt
Überschrift"), eine Gliederung neben einem § („Vor § 40 werden folgende
Abschnittsbezeichnung und Abschnittsüberschrift eingefügt", „§ 484 werden
folgende Bezeichnung und Überschrift vorangestellt"), ein § innerhalb eines
Artikels des Gesetzes („In Art. I § 9a …" — welcher § 9a gemeint ist, rät
der Name nicht) und alles, was weder §, Artikel, Anlage noch Anhang ist
(„Der bisherige Abschnitt Va …").

*Und eine Einheit, die selbst ein § ist, adressiert nichts.* Ihr Text ist
Gesetzestext, und Gesetzestext zitiert („… ihren Pflichten gemäß § 47
nachkommen", § 48 von 32/ME XXVIII). Als Anweisung gelesen kam das Zitat als
ihre Adresse heraus: **10 §-Einheiten** in den drei Perioden, jede ein Zitat.
Die Namenskarte stellte, wo die Einheit eine Überschrift trägt, den fremden
§ davor, und der Begründungsvergleich verglich die Begründung des zitierten
Paragraphen unter dem zitierenden.

**Namen**, gezählt mit der Regel der Seite
(`npx vite-node scripts/audit/paraTitle.ts XXVIII 40`, seit heute mit
`AUDIT_ORIGIN` gegen jeden laufenden Server): über 40 Entwürfe der XXVIII und 1.252 geänderte Einheiten
**863 → 884 benannt (69 → 71 %)**, Median je Entwurf 78 → 81 %, drei
Entwürfe weiter ganz ohne Namen. Der Nachschlag trägt die 21 (723 → 744).
Vorher gegen den laufenden Dev-Server, nachher gegen einen Produktionsbuild
mit kalten Caches; eine Schätzung ohne Neustart über dieselben Entwürfe (der
Titel eines Geschwisters mit demselben (Artikel, §), sonst ein Abruf im RIS)
kam auf 882. Richtigkeitsblock nachher: 451 angezeigte Namen, 279
bestätigt, **0 falsche Überschriften**, die drei „falschen Gesetze" dieselbe
Falschmeldungsklasse wie vorher.

**Begründungsvergleich**, Eintrag für Eintrag alt gegen neu (derselbe Lauf mit
`--reasoning`, beide Schlüssel wie ausgeliefert): 5.623 → **5.697** Einträge,
102 neu (38 mit geänderter Begründung), 28 weg. Von den 28 sind 4 die
§-Einheiten oben, gewollt; 16 stehen jetzt unter ihrem Artikel, weil die neue
Lesung einen zweiten Artikel mit derselben §-Nummer sichtbar macht — der
eindeutige Schlüssel hatte die Passagen zweier Gesetze verbunden —; 2 sind
die richtige Verweigerung desselben Falls dort, wo der Entwurf seine
Passagen keinem Artikel zuordnet (6/ME § 3 und 74/ME § 4, XXVI). **Sechs
sind ein Verlust**, in drei Entwürfen der XXVII, die dasselbe Gesetz im
Entwurf und in der Vorlage unter zwei Titeln führen, ohne dass die Paarung
sie verbindet (142/ME, 274/ME, 285/ME — „…mit dem das Freiwilligengesetz
geändert wird" gegen „…mit dem das Bundesgesetz zur Förderung von
freiwilligem Engagement …"): Die entfallenen Einheiten tragen den einen
Titel, die eingefügten den anderen, und die Mehrdeutigkeitsregel zählt zwei
Artikel — die bekannte
Klasse „nur scheinbar mehrdeutig" aus §12.10b, die jetzt drei Entwürfe mehr
erreicht, weil ihre entfallenen Einheiten erstmals einen § tragen.

*Absichtlich nicht angefasst:* die Obergrenze von 120 Nachschlägen je
Entwurf (`MAX_HEADINGS`). Sie ist, nicht die Lesung, der Grund, warum 74/ME
XXVIII namenlos bleibt: 194 verschiedene (Artikel, §), 119 davon geholt, und
108 seiner unbenannten geänderten Einheiten haben einen lesbaren §. Sie zu
heben ist eine Entscheidung über die Dauer einer kalten Anfrage, keine über
Lesen. Ebenso unberührt: Überschriften, die das RIS samt Bezeichnung führt
(„§ 37. Sonderformen der allgemeinbildenden höheren Schulen", SchOG) und die
auf der Seite als „§ 37 § 37. …" erscheinen, und die Verweigerung des
Inhaltsverzeichnisses in `konsGate.refusedUnits`, die dieselben Wortlaute
nicht kennt.

### 12.12 Consolidated law text — engine built, not yet published

Today a Novelle compares *amendment instructions*: "In § 9 Abs. 1 wird nach
der Wortfolge 'Eingriff in das' die Wortfolge … eingefügt". Since 2026-09-08
that reads as flowing text with the changes marked, which is a large step —
but it is still an instruction, not the law that comes out of it. The reading
a user expects (and asked for) is the paragraph as it now stands, against the
paragraph as the draft proposed it.

That needs two things this project does not have yet: the standing law from
**RIS Bundesrecht** (a second RIS application besides `Begut`, joined per law
and per version date), and an engine that **applies** Novellierungsanordnungen
to it — "in § 9 Abs. 1 nach der Wortfolge X die Wortfolge Y einfügen" as a
text operation, for every instruction form the legistic guidelines allow.
The instruction forms are the hard part, not the fetching.

The single strongest upgrade to the accountability core: it turns "42
instructions changed" into "this is what the paragraph now says". The cheap
half of the same prerequisite — resolving a § *title* without applying
anything — is what §12.11 needs for speaking names, so the two are one work
package with two stages, and only the second is large.

**And the cost is verification, not typing** (revised 2026-09-08). A wrongly
applied instruction publishes a law text that does not exist — the worst
error this tool can make, worse than showing the instruction. The work is
therefore: enumerate the instruction forms against a corpus, decide what
happens to the residue that cannot be applied with confidence, and above all
build the harness. There is an elegant one available: for a law already
promulgated, RIS holds the **later consolidated version**, so the engine can
be run against the truth and its hit rate measured exactly. Publish only what
that harness vouches for.

**Built 2026-09-08 — and measured before anything of it goes online.** Four
pure modules plus a harness, none of it wired to a page yet:

| Modul | Aufgabe |
|---|---|
| `server/utils/kons/novao.ts` | Novellierungsanordnung → typisierte Operation |
| `server/utils/lawtext/konsTree.ts` | RIS-BrKons-Paragraph → adressierbarer Baum (§ → Abs → Z → lit) |
| `server/utils/lawtext/draftArticles.ts` | Promulgationsklausel → Stammnorm; `articleBlocks` schneidet ein Paket in seine Gesetze |
| `server/utils/kons/lawApply.ts` | wendet die Operationen an, verweigert im Zweifel |
| `server/utils/ris/konsLaw.ts` | Client für den geltenden Bestand (`Applikation=BrKons`) |
| `scripts/corpus/novao.ts`, `corpus/novaoForms.ts` | Anweisungskorpus ernten, Grammatikdeckung messen |
| `server/utils/harness/applyReport.ts` | bewertet einen Lauf gegen die echte Fassung |
| `scripts/harness/kons.ts` | Prüfstand: BGBl-Anweisungen anwenden, Ergebnis gegen die echte Fassung vergleichen; `--sammel` je Artikel |
| `scripts/harness/me.ts` | Prüfstand für den Produktionspfad: Entwurfs-Anweisungen anwenden, gegen die Gegenüberstellung desselben Entwurfs halten |

**Die Grammatik ist klein, der Schwanz sitzt in der Adresse.** Über 6.576
Anweisungen aus 300 Entwürfen tragen sechs Verben 98,6 %: *lautet* 28 %,
*ersetzt* 26 %, *angefügt* 19 %, *eingefügt* 17 %, *entfällt* 13 %,
*Bezeichnung* 1,4 %. Typisiert werden 86 %; die 2.840 verschiedenen
Satzmuster entstehen durch die Adressierung („§ 9 Abs. 1 Z 3 lit. b zweiter
Satz", „§ 17 Abs. 4, § 19 Abs. 1 … und § 46 Abs. 2"), nicht durch die Verben.

**Der Prüfstand ist das eigentliche Ergebnis.** Für eine kundgemachte Novelle
führt das RIS beide Seiten: den Bestand davor und den danach. Der authentische
BGBl-Text (`Applikation=BgblAuth`) liefert die *beschlossenen* Anweisungen im
gleichen legistischen XML wie `Begut`, und jede konsolidierte Fassung nennt in
ihrem `Kundmachungsorgan` die Novelle, die sie erzeugt hat — das Fassungspaar
ist also exakt bestimmbar (`api-exploration.md` §2b). Über acht Ein-Gesetz-
Novellen, 209 Anweisungen, 117 geprüfte Paragraphen:

| | |
|---|---|
| grammatikalisch gelesen | 193 (92,3 %) |
| angewendet | 177 (84,7 %) |
| **identisch mit dem RIS** | **65 (55,6 %)** |
| unverändert gelassen | 12 (10,3 %) |
| unvollständig, nichts Eigenes erfunden | 12 (10,3 %) |
| **eigene Abweichung** | **28 (23,9 %)** |

Die letzte Zeile ist die einzige gefährliche Klasse, und sie ist mit knapp
einem Viertel **zu hoch, um irgendetwas davon zu veröffentlichen**. Die Engine
schreibt in jedem vierten Paragraphen Text, den das RIS nicht hat. Die
Trennung wird symmetrisch geprüft: eine selbst gelöschte Wortfolge zählt so
schwer wie eine erfundene, und ein Vergleich, der zu lang zum Rechnen war,
zählt als Abweichung und nie als bestanden.

**Vier Befunde, die den Aufwand neu einschätzen.**

0. *Der Prüfstand braucht selbst einen Prüfstand.* Die erste Messung meldete
   0,9 % gefährliche Abweichungen statt 23,9 %. Die Bewertungsfunktion filterte
   Diff-Segmente nach den Typen `insert` und `delete`, während
   `LawDiffSegment` `inserted` und `removed` heißt — beide Mengen blieben leer,
   jede Abweichung sah harmlos aus. Der Code lag in `scripts/`, und `scripts/`
   ist von `nuxt typecheck` nicht erfasst, also fiel der unmögliche Vergleich
   niemandem auf. Die Bewertungslogik liegt seit der Korrektur in
   `server/utils/harness/applyReport.ts` mit Tests: der Teil eines Prüfstands, der ein
   Urteil fällt, trägt genauso viel wie der geprüfte Code.

1. *Verweigern schlägt Deckung.* Eine Zwischenversion las 88,4 % der
   Anweisungen statt 86,2 % — aber die 144 zusätzlichen waren Zeilen mit zwei
   Operationen („A durch B **und** C durch D ersetzt"), von denen nur die
   erste angewendet wurde. Erfolg gemeldet, Gesetz halb geändert. Die
   niedrigere Zahl ist die bessere.
2. *Der Prüfstand ist grobkörniger als die Frage.* Das RIS schneidet eine
   Fassung pro Wirksamkeitsdatum. Fällt in denselben Schnitt eine langfristig
   terminierte Änderung aus einer früheren Novelle (GSpG § 17, BGBl. I Nr.
   187/2022), sieht das wie ein Fehler der Engine aus und ist keiner. Darum
   die Teilmengenprüfung statt eines reinen Textvergleichs.
3. *Datumsrechnen geht nicht.* Novellen wirken routinemäßig rückwirkend —
   GSpG § 20 wurde am 2022-12-06 kundgemacht und gilt ab 2022-01-01. Der
   Vorher-Stand lässt sich nur über das Fassungspaar bestimmen, nie über die
   Kundmachung.

**Was für die Veröffentlichung fehlt, ist nicht Politur.** Bei 23,9 % eigenen
Abweichungen (erste Messung; siehe die zweite weiter unten) ist die Engine
keine Quelle für angezeigten Gesetzestext. Die
gefundenen Ursachen waren bisher jedes Mal konkret und behebbar — ein Ziffern-
Marker, der ohne vorangehenden Absatz im Text hängen blieb; „folgender Satz
angefügt", das keine eigene Ebene hat und deshalb ganz verweigert wurde; beide
zusammen hoben *identisch* von 46,2 auf 55,6 % —, aber die verbleibenden
Abweichungen enthalten auch echte Überlöschungen, bei denen die Engine Text
entfernt, den das Gesetz behält. Erst wenn diese Klasse gegen null geht, ist
die Frage der Anzeige überhaupt dran.

**Und die Anzeige braucht die Engine womöglich gar nicht.** Rund 39 % der
Entwürfe tragen eine maschinenlesbare amtliche **Textgegenüberstellung**
(`api-exploration.md` §2c) — die Gegenüberstellung, die dieses Paket
nachbauen will, vom Ressort selbst erstellt und selbst hervorgehoben. Wo sie
existiert, ist sie die bessere Quelle; die Engine ist die Antwort für den
Rest, nicht der erste Schritt.

**Zweite Messung, 2026-09-09: 12,6 % statt 20,5 %.** Die erste Zahl war keine
Grenze, sondern der Punkt, an dem die Messung aufgehört hatte. Der Prüfstand
lief über 23 Novellen und 261 Paragraphen (vorher 17 und 210), und die
Abweichungsquote fiel, während der Korpus wuchs:

| | 2026-09-08 | 2026-09-09 |
|---|---|---|
| Novellen / Paragraphen | 17 / 210 | 23 / 261 |
| identisch mit dem RIS | 43,3 % | **53,3 %** |
| eigene Abweichung | 20,5 % | **12,6 %** |

Die Ursachen waren wieder konkret, und zwei davon waren gefährlicher als die
Quote nahelegte:

- **`<schlussteil>` fehlte in `parseRisXml`.** Der Abschlussteil einer
  Aufzählung („… hat jede Veränderung, insbesondere a) … e) … *der Behörde
  anzuzeigen*") wurde aus jedem RIS-XML-Dokument stillschweigend entfernt.
  `lawtext/konsTree.ts` kannte das Tag von Anfang an, `lawtext/risXml.ts` nicht — der
  Fehler blieb unsichtbar, weil **beide Seiten des ME→RV-Vergleichs** ihn
  symmetrisch trugen. Das betrifft nicht nur die Engine, sondern den
  ausgelieferten Diff für GP XXVII und früher. *Nachtrag 11.09.2026:* „von
  Anfang an" stimmt nur für die neuere Schreibweise. Das RIS führt denselben
  Abschlussteil je nach Konverter auch als `<schluss typ="…">`, und den kannte
  bis heute keines der beiden Module (§12.13, „Derselbe Abschlussteil, zwei
  Namen"); `parseRisXml` liest ihn seit 12.09.2026 ebenfalls.
- **Satzlöschung löschte den ganzen Absatz.** `case 'delete'` las `target.satz`
  nie, und `ORDINAL_SATZ` kannte nur die Form auf „-er", nicht den Nominativ
  („entfällt der zweite Satz"). Beides zusammen ist genau die Überlöschung,
  gegen die dieses Modul gebaut ist: geltendes Recht entfernt, Erfolg gemeldet.
- **Ein Ziel, mehrere Textblöcke.** „Die §§ 7 bis 9 werden durch folgende
  §§ 7 bis 14 ersetzt" setzte den ersten Block ein und verwarf sieben
  Paragraphen — als Erfolg gemeldet. Jetzt ein Splice mit Kollisionsprüfung,
  oder eine Verweigerung.
- **Artikelgegliederte Gesetze sind jetzt eine bewusste Verweigerung.**
  „Art. II § 1 Abs. 5 lautet" landete auf dem ersten § des ganzen Dokuments —
  im Lebensmittelbewirtschaftungsgesetz auf der Verfassungsbestimmung von
  Art. 1 — und verfehlte die falsche Änderung nur um einen Absatz. Solange
  der Artikel nicht Teil der Identität eines Paragraphen ist, wird die
  Adresse abgelehnt statt geraten.
- Kleineres: `Zitierung` fehlte im Operanden-Vokabular; das öffnende
  Anführungszeichen steht bei RIS *hinter* dem `gldsym` und überlebte den
  Strip; Phrasenoperationen konnten weder eine Überschrift noch einen
  einzelnen Satz adressieren.

**Der Prüfstand selbst war der Engpass.** Er hatte über den Kurztitel
gejoint, obwohl `resolveLawByBgbl` längst existierte — 8 von 25 Novellen
fielen ungemessen heraus. Über die Stammnorm sind es 23 von 25, und erst
dieser breitere Korpus macht die Quote belastbar: sie fiel, *während* 6
Gesetze und 51 Paragraphen dazukamen.

Ein Fund daraus betrifft die Produktion (§12.11): steht in der
Promulgationsklausel keine BGBl-Stammnorm (das UGB ist `dRGBl. S. 219/1897`),
nahm `parseBgbl` die erste BGBl-Zahl der Klausel — die letzte Novelle — und
löste auf ein **anderes Gesetz** auf, ohne Fehler. `stammnormOf` liest jetzt
nur den Kopf der Klausel und verweigert, wenn dort keine BGBl steht.

**Was bleibt.** 12,6 % sind immer noch zu viel für angezeigten Gesetzestext.
Die größte offene Klasse sind artikelgegliederte Gesetze (echte Unterstützung
statt Verweigerung), dann Adressformen wie „In den §§ 11 Abs. 5 und 180
Abs. 5", und `parseKonsParagraph`-Lücken (eine `<liste>` direkt unter dem
`<gldsym>` verliert alle Listenelemente). Keine davon sieht nach einer Grenze
aus; das ist der Grund, den Satz „geht nicht" nicht zu schreiben.

**Dritte Messung, 2026-09-09: 3,8 % auf 133 Novellen — und was ein Gate
daraus machen darf.** Der Tag begann mit einem Befund, der die Restquote
zweitrangig machte: Von 261 Paragraphen meldeten 190 keine Verweigerung, und
genau 12,6 % davon wichen ab — dieselbe Quote wie im Gesamtfeld. Die
Verweigerung erkennt, dass die Engine *nichts* getan hat, nicht, dass sie
etwas *falsch* getan hat. Ohne ein zweites Signal gibt es keine anzeigbare
Teilmenge, auch nicht bei 5 %.

*Zuerst war der Prüfstand falsch, nicht die Engine.* 5 der 33 Abweichungen
waren gestaffelte Wirksamkeitsdaten: „19,4%" wird ab 2027 zu „23%" und ab
2030 zu „21%" (Dienstgeberabgabegesetz § 1), das RIS schneidet pro Datum eine
Fassung, und der Prüfstand hielt den Endstand gegen den *ersten* Schnitt. Er
akzeptiert jetzt einen Treffer mit jeder Fassung, die diese BGBl erzeugt hat
— nur der *letzte* Schnitt wäre wieder falsch, weil das RIS auch beim
Außerkrafttreten eines Absatzes schneidet und dort „(Anm.: … außer Kraft
getreten)" druckt (LWA-G § 1). `versionPairFor` liefert deshalb `afters`.

*Dann die Engine, und die größte Klasse war ein Satz.* 46 von 459 Anweisungen
adressieren Sätze, in 26 Formen; gelesen wurde nur „der zweite Satz", alles
andere fiel auf den ganzen Absatz zurück — „entfallen die letzten beiden
Sätze" löschte Luftfahrtgesetz § 169 Abs. 3 komplett. Der Satztrenner schnitt
außerdem an jedem Punkt, also mitten durch „§ 5 Abs. 2". Beides ersetzt
(`parseSatz`, `splitSentences`), und ein Satzwort, das der Parser nicht
einordnen kann, verweigert die Adresse, statt sie zu weiten; ein Absatz mit
Liste hat keine zählbaren Sätze, nur Einleitungssatz und Schlussteil. Weitere
Klassen desselben Tages, jede mit der Novelle im Kommentar: Überschriften mit
eingedrucktem §-Zeichen, die in der Segmentierung verloren gingen oder in der
nächsten Anweisung auftauchten; halb angewendete zusammengesetzte Zeilen;
Umbenennungen, die nacheinander statt gleichzeitig liefen; „(neu)" ohne
vorangegangene Umbenennung; „in der jeweils grammatikalisch richtigen Form"
(nicht mechanisch — Verweigerung); „jeweils" bei mehreren Zielen; „/" durch
„bzw." ohne Fugen; „entfällt die Absatzbezeichnung" als Löschung des
Absatzes; „Nach § 408a wird folgender § 408b angefügt" als Kind von § 408a;
Tabellen im neuen wie im geltenden Text (nicht abbildbar, verweigert).

| Korpus | Novellen / §§ | identisch | eigene Abweichung | ohne Verweigerung: abweichend |
|---|---|---|---|---|
| A (bisheriger) vorher | 23 / 261 | 54,4 % | 11,1 % | 21 / 190 (11,1 %) |
| A nachher | 23 / 261 | **67,0 %** | **1,1 %** | **0 / 182** |
| B (Titelfilter auch für -ordnungen) vorher | 52 / 438 | 51,4 % | 11,6 % | 39 / 323 (12,1 %) |
| B nachher | 54 / 443 | 63,4 % | 0,9 % | 0 / 321 |
| C (bis 2023 zurück, *vor* Korrekturen daraus) | 133 / 1.198 | 62,8 % | 5,0 % | 31 / 888 (3,5 %) |
| C nachher | 133 / 1.199 | 63,6 % | **3,8 %** | **17 / 885 (1,9 %)** |

Die Zeile C-vorher ist die wichtigste: Sie ist der einzige *Held-out*-Wert.
Auf 54 Novellen stand nach den Korrekturen eine Null, die auf 79 weiteren,
älteren Novellen 3,5 % war. Jede Null in dieser Tabelle ist ein In-Sample-Wert
und so zu lesen; der ehrliche Erwartungswert für die nächste unbekannte
Novelle liegt bei einigen Prozent, nicht bei null.

*Der Detektor, gemessen gegen die alten Fehler.* `server/utils/kons/applyGuard.ts`
prüft ein Ergebnis zur Entwurfszeit auf Plausibilität — Umfang (weicht die
Textlänge um mehr als 4 Zeichen von dem ab, was die Operanden wiegen?),
Fugen, Marker im Text, unerklärte Wörter. `scripts/harness/guardEval.ts` spielt
einen Prüfstand-Dump durch das echte Modul; gemessen wurde bewusst am Dump
der Engine *vor* den Korrekturen (54 Fehler in 438 §§), weil das der beste
Ersatz für den nächsten unbekannten Fehler ist:

| Gate | lässt durch | davon abweichend | Recall korrekter §§ |
|---|---|---|---|
| nur Verweigerung | 314 | 38 (12,1 %) | 95,6 % |
| Verweigerung + Umfang | 297 | 27 (9,1 %) | 94,7 % |
| Verweigerung + Umfang + Fugen + Marker | 271 | 18 (6,6 %) | 87,6 % |
| alle Signale | 257 | 15 (5,8 %) | 84,0 % |

Auf Korpus C (45 Fehler in 1.199 §§): Verweigerung 17 (1,9 %) → mit Umfang 14
(1,6 %) bei 94,2 % Recall → alle Signale 12 (1,6 %) bei 85,4 %. Der Rest ist
immer von einer Art: *falsch gelesen und dann konsequent angewendet* —
Einleitungssatz als ganzer Absatz, eine verschluckte Umbenennung, ein Payload
mit verklebter Überschrift. Eine Prüfung des Ergebnisses gegen die eigene
Lesart kann das per Konstruktion nicht sehen. Der Detektor ist ein Filter am
Rand, keine Verifikation; das ist das Negativergebnis dieses Tages.

*Die zweite Quelle: das Orakel.* `server/utils/kons/tguOracle.ts` hält das
Ergebnis gegen die Textgegenüberstellung des Ministerialentwurfs (§12.13) —
vom Ressort geschrieben, am ersten Tag der Begutachtung, unabhängig von der
Engine. Drei Enthaltenseins-Prüfungen pro § statt Textgleichheit, weil der
Anhang Unverändertes auslässt und Marker druckt. Der Prüfstand
(`--oracle`) findet den Entwurf über BGBl → Regierungsvorlage (RIS
`Aenderung`) → Ministerialentwurf (Parlament `preconst`) → RIS-Begut-Satz
(Titel und Beginn). Über 54 Novellen: 11 mit lesbarem Orakel — 22 sind
Initiativanträge und hatten nie einen Entwurf, 3 Ausschussanträge, 5 Scans,
9 Regierungsvorlagen ohne Entwurf. 29 Paragraphen bestätigt, **0 davon
abweichend**. Wo ME und BGBl dieselben Anweisungen tragen, bestätigt es 17
von 33 und widerspricht 7 — 5 zu Recht (die Engine hatte weniger getan) und
2 wegen Tippfehlern im Anhang selbst („therapeutischem" gegen „-en"). Wo die
Regierungsvorlage den Entwurf geändert hat, widerspricht es, wie es soll;
in der Produktion liefe die Engine auf den Anweisungen des Entwurfs und
dieser Fall entfiele. Die Deckung ist der Engpass: rund ein Fünftel der
Novellen im Korpus, in der laufenden GP eher die Hälfte (§2c).

*Was ein Gate heute darf:* anzeigen, was ohne Verweigerung, plausibel und vom
Orakel bestätigt ist — im Korpus 21 von 443 Paragraphen, keiner davon falsch.
Alles andere bleibt Anweisung. Nichts davon ist an eine Seite angeschlossen.

**Vierte Messung, 2026-09-09: die harmlose Seite war zu groß.** `unvollständig`
hieß „jede Änderung, die die Engine gemacht hat, hat das RIS auch gemacht —
sie hat weniger getan, nicht etwas anderes", und der Test dazu verglich die
*Änderungen* als Mengen. Ein Fall fällt dabei durch: die Einfügung angewendet,
die zugehörige Löschung nicht. Kein Wort ist erfunden — jedes eingefügte Wort
fügt das RIS auch ein, und eine unterlassene Löschung ist überhaupt keine
Änderung — und der Paragraph trägt Text, den keine Fassung des Gesetzes je
hatte. Von 152 so eingeordneten Paragraphen waren 53 echte Auslassungen; der
größte der übrigen produzierte 547 Wörter gegen 414 im RIS, alle 414
enthalten.

`applyReport.ts` kennt dafür jetzt ein fünftes Urteil, `halbangewendet`, und
prüft eine echte Auslassung am *Ergebnis* statt an den Änderungen
(`isOmissionOf`: steht der Text der Engine im RIS-Text, in Reihenfolge, mit
ausgelassenen Wörtern?). Das braucht den Wortdiff nicht und schließt damit
eine Lücke — ein Paragraph mit dreitausend Wörtern war „nicht prüfbar" und
konnte nie als Auslassung erkannt werden.

| 133 BGBl, 1.059 Paragraphen | vorher | jetzt |
|---|---|---|
| identisch | 64,3 % | 64,3 % |
| unverändert gelassen | 18,3 % | 18,3 % |
| unvollständig | 14,3 % | **5,0 %** |
| halb angewendet | — | **9,3 %** |
| eigene Abweichung | 2,8 % | 2,8 % |

**Und damit die Zahl, auf die es für ein Gate ankommt:** Paragraphen ohne
jede Verweigerung, deren Text nicht das geltende Recht ist — **6,7 %**, nicht
1,5 %. Ein Gate misst sich daran, ob es falschen Gesetzestext anzeigt, und
das ist eine weitere Klasse als „ein erfundenes Wort". Das ist die Zahl für
den Förderantrag, nicht die alte.

**Die Population ist außerdem nicht die des Produkts.** Der Prüfstand filtert
über den Titel auf einzelgesetzliche Novellen; 64 der 109 Entwürfe mit
Beilage in der GP XXVIII sind Sammelnovellen (59 %). Die Engine ist auf
Sammelnovellen unvermessen und hat noch nie die Anweisungen eines
*Ministerialentwurfs* gelesen, sondern immer die des kundgemachten BGBl. Was
gemessen ist, ist BGBl→BrKons; was die Seite zeigen würde, ist etwas
anderes.

*Was bleibt, nach Gewicht.* Artikelgegliederte Gesetze (bewusste
Verweigerung, ~31 Anweisungen); `parseKonsParagraph` verliert eine `<liste>`
direkt unter dem `<gldsym>` (EStG § 124b, 835 Elemente) — das ist auch ein
Prüfstandsfehler, weil die Wahrheit dieselben Elemente verliert; die
Litera-Schreibweise „a." statt „a)"; Bindestriche, die BgblAuth mit Leerzeichen
druckt und BrKons ohne („MedKF - TG"); RIS-Fassungen, die *keinem*
Zwischenstand der Engine entsprechen, wenn eine Novelle staffelt *und* etwas
außer Kraft tritt (ORF-Beitrags-Gesetz § 5); ein Sammel-Titelfilter für
Sammelnovellen. Und der größte Hebel für die Deckung des Orakels: die
Gegenüberstellung der Regierungsvorlage aus dem Parlament lesen, wo der
Entwurf keine hat.

*Zwei Sätze davon sind seit der fünften Messung überholt und stehen nur
noch, damit die Reihenfolge der Befunde lesbar bleibt:* der Sammel-Filter
ist gebaut (`--sammel`), und der „größte Hebel" ist auf dem Produktionspfad
keiner — die Regierungsvorlage existiert zur Begutachtungszeit noch nicht.
Beides unten.

**Fünfte Messung, 18.09.2026: die Population, auf der das Produkt liefe.**
Der vorige Absatz endet mit dem Befund, der alle Quoten davor relativiert —
gemessen war BGBl→BrKons an Einzelnovellen, gezeigt würde ein
Ministerialentwurf, und 59 % der Entwürfe mit Beilage sind Sammelnovellen.
Beides ist jetzt gemessen, und beides verschiebt etwas.

*Sammelnovellen: der Prüfstand hat sie nie abgelehnt, weil sie schwer sind,
sondern weil er sie als **ein** Gesetz las.* Eine Sammelnovelle ist keine
Novelle, sondern n voneinander unabhängige, die sich ein Bundesgesetzblatt
teilen: jeder Artikel nennt sein Gesetz in seiner eigenen
Promulgationsklausel, nummeriert seine Anweisungen ab 1 und adressiert einen
§-Raum, den der nächste Artikel wiederverwendet. `resolveLaw` hat deshalb
„Sammelnovelle: n Stammnormen" gemeldet und das ganze BGBl fallen lassen.
Der Schnitt am gedruckten Artikel-Kopf (`lawtext/draftArticles.articleBlocks`, dieselbe
Grenze, an der `segmentUnits` seinen Zustand zurücksetzt und `draftArticles`
seine Einträge bildet) macht daraus n bewertete Gesetze. Auf dem alten
Einzelnovellen-Korpus ist der Lauf danach **zeichengleich** mit dem davor —
die Umstellung misst nichts anders, sie misst mehr.

Derselbe Korpus, einmal ohne und einmal mit den Paketen — die kontrollierte
Gegenüberstellung, weil beide Läufe dieselben 25 Bundesgesetzblätter lesen:

| 25 BGBl, jüngste zuerst | alter Filter | `--sammel` |
|---|---|---|
| Gesetze | 25 | 117 (110 auswertbar) |
| geprüfte Paragraphen | 264 | 698 |
| identisch | 66,7 % | 66,2 % |
| **eigene Abweichung** | **1,1 %** | **2,9 %** |
| kein geltender Text (ohne Verweigerung) | 2,7 % | **5,8 %** |

Und der größere Lauf, der ab hier die Referenz ist — 60 Bundesgesetzblätter,
31 davon Sammelnovellen, **208 Gesetze und 1.694 Paragraphen** statt der 133
Einzelnovellen und 1.059 Paragraphen der vierten Messung:

| | 4. Messung (nur Einzelnovellen) | 5. Messung (`--sammel`) |
|---|---|---|
| BGBl / Gesetze / §§ | 133 / 133 / 1.059 | 60 / 208 / 1.694 |
| identisch | 64,3 % | 61,6 % |
| unvollständig | 5,0 % | 5,1 % |
| halb angewendet | 9,3 % | **11,2 %** |
| eigene Abweichung | 2,8 % | 2,8 % |
| **kein geltender Text, ohne Verweigerung** | **6,7 %** | **7,7 %** |

Das ist die Antwort auf die Frage, wozu diese Messung zuerst kam: der
gemessene Korpus war **geschmeichelt**. Pro Paragraph ist eine Sammelnovelle
rund doppelt so gefährlich (2,7 → 5,8 % im kontrollierten Paar), und sie
bringt 4,7-mal so viele Gesetze pro BGBl mit. Jede Fehlerklasse, die an
Einzelnovellen priorisiert worden wäre, wäre an der falschen Verteilung
priorisiert worden. **7,7 %, nicht 6,7 %, ist die Zahl für den
Förderantrag** — und die erfundenen Wörter bleiben bei 2,8 %, der Zuwachs
sitzt ganz im halb Angewendeten.

*Der Rest des Joins, mit Namen.* 8 der 208 Gesetze bleiben unauflösbar, und
sie sind keine Zufallsauswahl: ABGB, ZPO, Notariatsordnung, Rechtsanwalts-
ordnung — die alten Kodifikationen, deren Stammnorm **kein**
Bundesgesetzblatt ist (JGS Nr. 946/1811, RGBl. Nr. 113/1895). `stammnormOf`
liefert dort null, und der Kurztitel-Rückfall scheitert, weil das RIS sie
unter ihrer Abkürzung führt („ZPO") und der Artikel „Änderung der
Zivilprozessordnung" heißt. Eine benannte, kleine, schließbare Lücke — und
sie trifft ausgerechnet die meistzitierten Gesetze des Landes.

*Der Ministerialentwurf: `scripts/harness/me.ts`.* Der zweite Prüfstand
wendet die Anweisungen eines **Entwurfs** auf den Bestand an, wie er am
ersten Tag der Begutachtung galt, und hält das Ergebnis gegen die
Textgegenüberstellung **desselben** Entwurfs. Er nennt bewusst **keine
Trefferquote**: zur Entwurfszeit existiert das Gesetz, das herauskommt, noch
nicht. Was das Orakel bestätigt, ist bestätigt; was es nicht bestätigt, ist
unbekannt, und eine Zahl, die beides mischte, wäre die Deckung des
Prüfstands, als Genauigkeit gedruckt.

| 40 Entwürfe, 29.05.–17.09.2026, 53 geänderte Gesetze | |
|---|---|
| grammatikalisch gelesen | 86,7 % (BGBl-Pfad: 84,7–90,0 %) |
| angewendet | 70,2 % (BGBl-Pfad: 75,0–76,7 %) |
| Paragraphen mit Text | 413 |
| ohne Verweigerung und plausibel | 272 (65,9 %) |
| **plausibel und vom Anhang bestätigt** | **107 (25,9 %)** |

Zwei Dinge daran sind neu. Erstens: **Entwurfsanweisungen lesen sich nicht
schlechter als beschlossene.** Der Unterschied liegt im Rauschen einzelner
Entwürfe, nicht in der Sprache — die Sorge, der Produktionspfad sei ein
anderer Dialekt, ist damit erledigt. Zweitens: **25,9 % statt der 4,7 %, die
oben stehen** (21 von 443). Der Grund steht schon in der dritten Messung und
war nur nie gemessen: dort lief das Orakel des *Entwurfs* gegen die
Anweisungen des *Bundesgesetzblatts*, und wo die Regierungsvorlage den
Entwurf geändert hatte, widersprach es zu Recht. Auf dem Produktionspfad
gehört der Anhang zu genau den Anweisungen, die angewendet werden, und
dieser Fall entfällt — wie vorhergesagt, jetzt belegt.

*Und der Befund, der die Reihenfolge der nächsten Schritte ändert.* Die
Deckung des Gates ist **exakt** die Deckung des Anhangs:

| 26 Entwürfe mit Paragraphen | Entwürfe | §§ | davon anzeigbar |
|---|---|---|---|
| mit lesbarer Gegenüberstellung | 15 | 260 | **107 (41 %)** |
| ohne | 11 | 153 | **0, per Konstruktion** |

13 der 15 Entwürfe mit Anhang würden mindestens einen konsolidierten
Paragraphen zeigen, im Median 12 % ihrer Paragraphen. Ohne Anhang zeigt
keiner einen — nicht weil die Engine dort schlechter wäre, sondern weil es
keine zweite Meinung gibt, und die Verweigerung allein korreliert
nachgewiesenermaßen nicht mit Richtigkeit.

**Damit ist der oben genannte größte Hebel für die Orakeldeckung auf dem
Produktionspfad keiner.** „Die Gegenüberstellung der Regierungsvorlage aus
dem Parlament lesen, wo der Entwurf keine hat" hilft dem *rückblickenden*
Prüfstand; auf einer laufenden Begutachtungsseite gibt es die
Regierungsvorlage noch nicht — sie kommt Monate später, wenn überhaupt. Für
die Anzeige bleiben genau zwei Wege: die Anhangsdeckung selbst erhöhen (die
PDF- und Scan-Anhänge lesbar machen — 5 Scans und 8 fehlende auf 29
ändernde Entwürfe in dieser Stichprobe) oder ein zweites, vom Anhang
unabhängiges Verifikationssignal finden. Das ist eine andere Aufgabe als die
notierte, und sie gehört vor die Fehlerklassen.

**Sechste Messung, 18.09.2026: die Anhangsquelle — dasselbe Dokument, zwei
Veröffentlicher.** Aus der fünften Messung folgte, dass die Deckung des
Anhangs die Obergrenze der Anzeige ist. Das Ressort schreibt die
Textgegenüberstellung aber nur einmal; veröffentlicht wird sie zweimal, im
RIS als XML und beim Parlament am Ministerialentwurf als HTML. Über alle 135
GP-XXVIII-Entwürfe:

| Parlament × RIS | n |
|---|---|
| HTML × XML lesbar | 61 |
| **nur PDF × Scan** | **41** |
| keine × keine | 12 |
| **HTML × RIS hat keinen** | **8** |
| Rest (Join-Fehlschlag, einseitig) | 13 |

*Zwei Schlüsse.* Erstens: **41 von 42 Scans sind auch beim Parlament nur
PDF** — der Scan ist die Einbringung des Ressorts, kein Konvertierungsverlust
im RIS. Damit ist eine Frage ans RIS erledigt, bevor sie gestellt wurde.
Zweitens: die Parlamentskopie ist die vollständigere, und sie trägt einen
stabilen Dokumenttitel („Textgegenüberstellung") statt der über fünfzehn
Freitext-Schreibweisen des RIS („TGÜ", „SAG_TGÜ",
„42. KFG-Nov.TGÜ.11.05.2026").

*Dazwischen lag ein Fehler derselben Bauart wie schon zweimal zuvor.* Die
Parlamentskopie ist die Word-Legistikvorlage und schreibt das
Gliederungssymbol als `<span class=991GldSymbol>&sect;&nbsp;1.</span>`, das
RIS als `<gldsym>`. `lawtext/parliamentHtml.ts` kennt beide seit jeher, `annex/comparisonRows.ts`
kannte nur die RIS-Form. Ergebnis: der Anhang parste, die Tabellen stimmten,
die Änderungen wurden gefunden — und **jede** Zeile kam ohne Bezeichnung
zurück, worauf `rowsByParagraph` sie alle verwarf und das Orakel zu jedem
Paragraphen schwieg. Ein leeres Ergebnis, das wie eine Aussage aussieht;
dieselbe Form wie `<schlussteil>` gegen `<schluss typ="…">` (§12.13).

*Was der Quellenwechsel wirklich bringt, Ende zu Ende gemessen* — 40
Entwürfe mit eindeutigem Join (27.03.–03.08.2026), 147 Gesetze, 863
Paragraphen, einmal je Quelle:

| | RIS | Parlament, RIS als Rückfall |
|---|---|---|
| Entwürfe mit lesbarem Anhang | 24 | **27** |
| ohne Anhang | 4 | **1** |
| Scans (auf beiden Seiten dieselben) | 7 | 7 |
| **anzeigbare Paragraphen** | **174 (20,2 %)** | **184 (21,3 %)** |

Paragraphweise: **12 nur mit der Parlamentskopie bestätigt, 2 nur mit der
RIS-Kopie.** Der Gewinn ist real, aber deutlich kleiner als die
Deckungszahlen nahelegen — die Entwürfe, die das Parlament hinzufügt, sind
die kleinen. Wer aus „+8 Prozentpunkte Anhangsdeckung" auf „+8 Prozentpunkte
anzeigbare Paragraphen" schließt, rechnet die Verteilung weg.

*Die zwei Verluste sind kein Parse-Fehler, sondern eine Eigenschaft des
Orakels.* Beide Kopien finden dieselben 32 Paragraphen; die
Parlamentsfassung schneidet nur feiner (302 Zeilen gegen 268 beim AWG 2002,
131/ME). Die dritte Enthaltensprüfung — „jedes Wort, das die Engine
eingefügt hat, fügt auch der Anhang ein" — läuft je Zeile und ist damit von
der Zeilengranularität abhängig. Zwei Fassungen desselben Dokuments können
deshalb verschieden urteilen, ohne dass eine falsch parst. Das ist eine
Grenze des Orakels, die vor jeder Ausweitung seiner Deckung zu kennen ist.

**Siebente Messung, 18.09.2026: die Fehlerklassen neu gewogen — und die
größte war keine Lücke, sondern eine falsch gelesene Ebene.** Die
Gewichtung, nach der die Restarbeit bisher sortiert war, stammte aus dem
Einzelnovellen-Korpus. Auf der wirklichen Population (60 BGBl, 208 Gesetze,
3.110 Anweisungen) sieht sie anders aus:

| Klasse | Anweisungen |
|---|---|
| verbundene Anweisungen / Operanden-Paarbildung | 158 |
| keine auflösbare Adresse | 91 |
| kein bekanntes Verb | 51 |
| *Anwendung:* Untereinheit nicht im Ausgangstext | **107** |
| *Anwendung:* Label unbekannt — davon artikelgegliedert **32**, echte Lücken 37 | 70 |
| *Anwendung:* Kaskade (eine frühere Anweisung hat das Ziel entfernt) | 46 |
| *Anwendung:* RIS-Dokument nicht als Paragraph lesbar | 27 |

Artikelgegliederte Gesetze stehen bei 32 — praktisch unverändert gegenüber
der Schätzung von ~31, aber nicht mehr die größte Klasse, sondern die achte:
die Population ist um sie herum gewachsen.

*Die 107 sind zur Hälfte ein einziger Adressfehler.* Sie konzentrieren sich
auf die Vergabegesetze (42 von 107), und der Grund steht in der Anweisung:

> „In den §§ 48 Abs. 13 **und 217 Abs. 13** wird die Wortfolge … ersetzt"

Nur der *erste* Paragraph trägt sein §-Zeichen; die übrigen stehen als nackte
Zahl. `parseAddressList` sieht deshalb nur eine Adresse und fällt auf
`parseAddress` zurück, und dort wird die 217 zum Geschwister der tiefsten
Komponente: gelesen wird **„§ 48 Abs. 217"**. Existiert dieser Absatz nicht,
verweigert die Anwendung mit einer unsinnigen Begründung — das sind die 107.

**Existiert er, ändert die Engine geltendes Recht, das die Anweisung nie
genannt hat.** Über 60 Bundesgesetzblätter tragen 40 Anweisungen diese Form.
36 verweigerten, **4 wurden angewendet** — auf je einen der genannten
Paragraphen:

| Anweisung nennt | Engine berührt | RIS-Urteil |
|---|---|---|
| §§ 138, 301 | § 138 | halb angewendet |
| §§ 184, 329, 359, 380 | §§ 184, 380 | halb angewendet |
| §§ 46, 47, 213, 214 | § 46 | unvollständig |
| §§ 30, 32, 33, 57 | § 30 | halb angewendet |

Das ist genau die Klasse, gegen die dieses Modul gebaut ist: kein erfundenes
Wort, Erfolg gemeldet, und drei Paragraphen tragen weiter den alten Text,
während die Seite sie als geändert zeigte. Für jede Prüfung der Engine gegen
die eigene Lesart unsichtbar.

*Zwei Signale trennen die Fälle, und beide sind gemessen.* Erstens: folgt der
aufgezählten Zahl eine **eigene Komponente** („und 217 **Abs.** 13"), ist sie
ein Paragraph und kein Geschwister. Zweitens, für die Form ohne nackte Zahl
(„§§ 30 Abs. 3 **zweiter Satz**, 32 Abs. 4 zweiter Satz"): steht das
**Pluralzeichen** in der Adresse — Zitate sind durch `maskQuotes` längst
ausgeblendet, sonst zählte jedes „die Wortfolge ‚§§ 41, 42'" mit — und zeigt
die gelesene Adresse trotzdem auf eine Unterebene, dann ist der erste
Paragraph der erste von mehreren. Über den Korpus: 16 solche Adressen bleiben
auf Paragraphenebene und sind echte, funktionierende Mehrfachadressen, 11
stehen auf einer Unterebene und meinen ausnahmslos mehrere Paragraphen. **Kein
Fehltreffer.**

Eine Adresse über mehrere Paragraphen kann das Modell nicht tragen — eine
Operation hat ein `target` —, also wird sie verweigert und nicht geraten,
dieselbe Entscheidung wie bei den artikelgegliederten Gesetzen.

*Erst verweigert, dann aufgelöst — und das Modell konnte es schon.* Die
Verweigerung war als sichere Hälfte gedacht, mit der Auflösung („mehrere
Ziele anwenden") als größerer nächster Stufe, die ein `targets` im
Operationsmodell brauche. **Das stimmte nicht.** `parseOne` bildet für
Phrasenoperationen längst `targets.map(…)` auf mehrere Ops ab, und
`instructionsFromUnits` legt für jedes Op eine eigene Instruction an. Gefehlt
hat allein die Zerlegung: `parseAddressList` trennt an Kommas und „und", und
in der Plural-Kurzschreibweise trägt nur der erste Paragraph sein Zeichen, so
dass nie zwei Teile mit § dastanden. `splitPluralParagraphs` setzt es zurück,
mit demselben Unterscheidungsmerkmal — eine Zahl mit eigener Komponente ist
ein Paragraph.

| 60 BGBl, 208 Gesetze, 1.694 §§ | vorher | nur Verweigerung | mit Auflösung |
|---|---|---|---|
| grammatikalisch gelesen | 2.796 (89,9 %) | 2.751 (88,5 %) | **2.859 (90,1 %)** |
| angewendet | 2.266 (72,9 %) | 2.261 | **2.342 (73,8 %)** |
| identisch mit dem RIS | 1.043 (61,6 %) | 1.043 | **1.081 (63,8 %)** |
| unverändert gelassen | 319 (18,8 %) | — | **288 (17,0 %)** |
| halb angewendet | 190 (11,2 %) | 190 | **180 (10,6 %)** |
| **eigene Abweichung** | **48 (2,8 %)** | 48 | **48 (2,8 %)** |
| kein geltender Text, ohne Verweigerung | 96 (7,7 %) | 95 | **91 (7,3 %)** |

Die entscheidende Zeile ist die vorletzte. Die Engine wendet 76 Anweisungen
mehr an und trifft 38 Paragraphen mehr exakt — **und erfindet kein einziges
Wort dazu**. Auch am Gate bleibt `abweichend` auf allen drei Stufen
unverändert (55 / 24 / 15), während `identisch` auf allen dreien steigt
(1.043 → 1.081, 1.022 → 1.060, 888 → 918). Mehr Deckung ohne mehr Risiko ist
selten; hier geht es, weil die Anweisung die weiteren Paragraphen ausdrücklich
nennt und nichts geraten wird.

*Ein Nebenbefund, der die Bauart bestätigt.* `annexDraft.ts` trug für
denselben Fehler eine eigene Notbremse: eine Zeile mit Pluralzeichen, die auf
weniger als zwei Bezeichnungen auflöst, wurde ganz verworfen (§12.13, vier
Einheiten im Bundesvergabegesetz). Sie greift jetzt von selbst nicht mehr,
weil beide Paragraphen herauskommen — und bleibt als Netz für die Formen
stehen, die die Zerlegung nicht auflösen kann. Zwei Module hatten denselben
Defekt von zwei Seiten gesehen; behoben wurde er an der Quelle.

**Achte Messung, 18.09.2026: „kein bekanntes Verb" war zu 80 % kein
Verbproblem.** Die Klasse zählte 51 Anweisungen. Aufgeschlüsselt zerfällt sie
in drei, und keine davon ist ein unbekanntes Verb:

| | |
|---|---|
| ausgeschriebene Umbenennung („erhält **Abs. 4** die Absatzbezeichnung") | 35 |
| fehlendes Operandennomen (Prozentsatz, Altersangabe) | 11 |
| Überschrift vorangestellt, Rest | 5 |

*Das Nomen.* „In § 4 Z 2 wird der **Prozentsatz** ‚65%' durch den Prozentsatz
‚50%' ersetzt" ist eine gewöhnliche Phrasenersetzung und scheiterte allein
daran, dass `PHRASE_OBJECT` das Wort nicht führte — dieselbe Lücke wie
seinerzeit bei `Zitierung`. Das Vokabular wächst gegen gemessene Zeilen und
nie auf Verdacht; ein Nomen, das nie vorkommt, verlängert nur die
Alternation.

*Die Umbenennung.* Zwischen Verb und Nomen darf ein Subjekt stehen: „In
§ 213 erhält **Abs. 4** die Absatzbezeichnung ‚(5)'". Die Adresse steht dabei
schon richtig — `parseAddress` liest das „Abs. 4" aus dem Schwanz hinter dem
§ —, es fehlte nur das Muster. **Eine Form bleibt ausdrücklich verweigert:**
„In § 10 erhält der bisherige *Inhalt* die Absatzbezeichnung ‚(1)'" benennt
nichts um, sondern zieht eine Ebene ein — der ganze Paragraphentext wird zu
Abs. 1. Andere Operation, andere Gefahr; sie als Umbenennung des Paragraphen
laufen zu lassen wäre genau die Sorte Näherung, die dieses Modul nicht macht.

**Was die drei Eingriffe dieses Tages zusammen ergeben** — Mehrfachadresse
aufgelöst, Operandennomen ergänzt, Umbenennung mit Subjekt gelesen, gemessen
über dieselben 60 Bundesgesetzblätter und 1.694 Paragraphen:

| | Beginn 18.09. | Ende 18.09. |
|---|---|---|
| grammatikalisch gelesen | 2.796 (89,9 %) | **2.885 (90,7 %)** |
| angewendet | 2.266 (72,9 %) | **2.388 (75,0 %)** |
| identisch mit dem RIS | 1.043 (61,6 %) | **1.087 (64,2 %)** |
| unverändert gelassen | 319 (18,8 %) | **278 (16,4 %)** |
| **eigene Abweichung** | **48 (2,8 %)** | **47 (2,8 %)** |
| kein geltender Text, ohne Verweigerung | 96 (7,7 %) | **91 (7,2 %)** |
| Gate „plausibel": identisch / abweichend | 888 / 15 | **924 / 15** |

Die letzte Zeile ist die, auf die es ankommt: **36 Paragraphen mehr, die das
Gate anzeigen dürfte, bei unverändert 15 Abweichungen.** Keiner der drei
Eingriffe hat die Engine mutiger gemacht — sie liest mehr von dem, was
dasteht, und rät an keiner Stelle mehr als vorher.

**Neunte Messung, 18.09.2026: die Zählung, nachdem drei Klassen behoben
sind.** Zwei der vier Zahlen, nach denen die Restarbeit sortiert war, waren
durch die Eingriffe desselben Tages veraltet. Der Prüfstand zählt die
Ursachen jetzt selbst (`--refusals=<datei>` schreibt jede nicht ausgeführte
Anweisung mit **vollem** Text und Grund; der Verbose-Log schnitt bei 100
Zeichen ab, was zum Wiedererkennen reicht und zum Nachparsen nicht).

*Dabei ein Prüfstandsfehler derselben Sorte wie schon zweimal.*
`missingCauses` wurde nur im `if (verbose)`-Zweig gefüllt — jeder
`--quiet`-Lauf druckte also eine **leere** Ursachentabelle, und die las sich
wie ein Befund („keine Ursachen") statt wie ein Artefakt des Schalters.

| Grammatik — nicht gelesen (297 von 3.182) | n |
|---|---|
| keine auflösbare Adresse | 91 |
| Operanden-Paarbildung, alle Varianten | 118 |
| Teil nicht gelesen | 27 |
| kein bekanntes Verb | 27 *(vorher 51)* |
| Bezeichnungs-Zuordnung unklar | 15 |
| Tabelle im neuen Text | 5 |

| Anwendung — gelesen, nicht ausgeführt (497) | n |
|---|---|
| nicht im geltenden Text (Adresse) | 175 + 27 |
| **Textstelle nicht gefunden / nicht eindeutig** | **146** |
| „(neu)" ohne vorangehende Umbenennung | 33 |
| eingefügte/angefügte Einheit nicht bestimmbar | 29 |
| Anker nicht im geltenden Text | 11 |

Und die RIS-Diagnose der 213 Adressfehlschläge: 71× „RIS kennt das Label
nicht" (davon 32 artikelgegliedert), 69× „Untereinheit nicht im
Ausgangstext" *(vorher 107 — die Mehrfachadresse war der Unterschied)*, 43×
Kaskade, 28× RIS-Dokument nicht als Paragraph lesbar.

**Die zweitgrößte Anwendungsklasse hat noch nie jemand angesehen:** 146
Fehlschläge beim *Finden* der zitierten Textstelle, nicht beim Adressieren.
Ein erster Schnitt durch die 68 „nicht gefunden" — nur die Zeilen, die sich
eindeutig einem Paragraphen zuordnen lassen, weil eine Zeile nach der
Mehrfachadress-Auflösung mehrere berühren kann:

| | n |
|---|---|
| Phrase steht nicht im § — echte Abwesenheit | 17 |
| Phrase steht im §, die Operation findet sie nicht — Zuschnitt | 15 |
| nicht entscheidbar (Zeile berührt mehrere §§) | 36 |

Also **keine einzelne Ursache**, sondern mindestens zwei etwa gleich große,
und die Hälfte der Fälle ist mit diesem Join gar nicht zu entscheiden.
Normalisierung erklärt sie nicht: Bindestrich und Whitespace machen zusammen
5 der 68 aus. Wer hier weiterarbeitet, braucht den Text der *adressierten
Untereinheit* (aus `beforeTree`), nicht den des Paragraphen — und sollte
nicht nach einer Lösung suchen, sondern nach zwei. Die Vermutung „das ist
die Bindestrich-Schreibweise" (§12.12, „Was bleibt") ist damit gemessen und
zu klein.

*Ein Vorbehalt zur Lockerung.* 78 der 146 sind „Textstelle 2× / 3× gefunden,
nicht eindeutig" — die Phrase kommt **mehrfach** vor. Jede Lockerung des
Vergleichs, die die 68 „nicht gefunden" verkleinern würde, vergrößert diese
78. Die beiden Hälften ziehen gegeneinander, und ein Eingriff, der nur die
eine misst, verschlechtert die andere still.

**Die größere Hälfte war gar keine Lockerung (26.09.2026).** „Mehrfach
gefunden" liest sich wie eine Schwelle, die man verschieben müsste, und ist
in der Mehrzahl der Fälle ein Wort: **„jeweils"**.

```
In § 81 Abs. 1 und 2 wird das Wort „Acten" jeweils durch „Akten" ersetzt.
In § 34 Abs. 1 und 2 und § 36 Abs. 1 und 4 entfällt jeweils „der Länder".
In § 12 Abs. 4 und 7 wird nach „oder Abs. 4" jeweils „oder § 46a" eingefügt.
```

Eine Adresse, mehrere Einheiten, die Phrase **einmal in jeder**. Über die
Vereinigung gefragt kommt sie zweimal vor, `uniqueSlot` verweigert, und die
ganze Anweisung fällt aus.

**Die Regel stand schon da, nur an der falschen Hälfte.** `everyOccurrence`
in `kons/novao.ts` schreibt seit seiner Entstehung: Mit mehreren Stellen
verteilt „jeweils" die Änderung über sie, „und inside each the phrase must
still be unique". Die *lesende* Hälfte hielt sich daran — sie schaltet
`everywhere` genau dann nicht ein. Die *anwendende* bekam die Einheiten nie
einzeln zu sehen: `phraseSlots` warf sie in eine Liste. Jetzt gruppiert
`phraseSlotGroups` je adressierter Einheit, und `eachUnit` reist mit der
Operation mit, weil es eine Aussage über den *Satz* ist und nur der Parser
sie hat.

**Ohne „jeweils" ändert sich nichts**, und das ist der Schutz: Die Adresse
bleibt EINE Stelle, wie viele Einheiten sie auch umspannt, und die Phrase muss
über alle eindeutig sein. Eine Anweisung, die zwei Paragraphen nennt und einen
meint, darf nicht in beide schreiben.

**Zwei Durchgänge, und der erste Entwurf hatte einen.** Einheit für Einheit
anzuwenden und beim ersten Fehlschlag zurückzukehren ließ die Einheiten davor
geändert und die Anweisung verweigert — eine halb angewendete Anweisung, das
eine Ergebnis, das diese Engine nie erzeugen darf. `locateInUnits` löst
deshalb alle Einheiten auf, bevor in eine geschrieben wird; ein Test hält es
fest.

**Gemessen über 40 Sammelnovellen, 2.079 Anweisungen, derselbe Korpus vorher
und nachher:**

| | vorher | nachher |
|---|---|---|
| angewendet | 1.595 (76,7 %) | **1.610 (77,4 %)** |
| identisch mit dem RIS | 716 | **725** |
| halb angewendet | 99 | **94** |
| unverändert gelassen | 140 | 137 |
| Verweigerungen gesamt | 484 | **469** |
| davon „nicht eindeutig" | 32 | **17** |

Von den Verweigerungsklassen bewegt sich **genau eine** — die, für die der
Eingriff gebaut ist —, und keine andere um eine einzige Zeile. −15
Verweigerungen, +15 angewendete Anweisungen, +9 Paragraphen, die der Text
sind, den das RIS wirklich führt.

**Der Preis, und er gehört genannt:** „ohne Verweigerung, abweichend" steigt
18 → 19 und „kein geltender Text" 43 → 44. Die Abweichung über *alle*
geprüften Paragraphen bleibt bei 34 — es entsteht also **kein neuer Fehler**;
ein Paragraph, der schon abwich und zusätzlich verweigert war, verliert seine
Verweigerung und steht jetzt im unverweigerten Topf. Für die Anzeige heißt das
wenig, weil das Tor zusätzlich die Bestätigung der Beilage verlangt (§12.12a)
— aber es ist die richtige Richtung, um es hier hinzuschreiben und nicht in
der Zusammenfassung zu verlieren.

**Die zweitgrößte Klasse war ein Satzzeichen (26.09.2026).** 71 der 469
Verweigerungen meldeten eine Zahl: „4 Operanden, Paarbildung unklar" (42),
„4 Operanden für eine Einfügung" (15), „Ersetzung ohne zwei Operanden" (9).
Die Zahl war nie die Ursache. Ein Satz trug **mehrere Anweisungen**, und ein
einziger Verbzweig bekam die Anführungen aller zu sehen:

```
In § 21 Abs. 1 Z 7 wird die Wortfolge „A" durch das Wort „B" ersetzt
  und es entfällt im Klammerausdruck die Wortfolge „C".
In § 4 Abs. 2 wird nach der Wortfolge „D" die Wortfolge „E" eingefügt,
  das Wort „F" durch „G" und das Wort „H" durch „I" ersetzt.
```

`splitCompound` trennte bis dahin am Strichpunkt und an „sowie/und" **nur vor
„folgende…"** — der Form, die eine Einheit erzeugt. Die Form, die Text ändert,
blieb ungelesen. Was einen Trenner zum Trenner macht, ist **ein Verb auf jeder
Seite**; die Prüfung stand schon da, sie galt nur dem Strichpunkt. Sie trägt,
weil ein legistischer Satz sein Verb ans Ende stellt: Vor dem „und" einer
Adressliste („In § 12 Abs. 1 Z 1 und § 13 Abs. 1 wird …"), einer Operandenliste
(„die Wortfolge „A" und die Wortfolge „B" entfallen") und einer Paarkette
(„der Ausdruck „A" durch „B", das Wort „C" durch „D" … ersetzt") steht keines.

**Das Komma gehört dazu, und das war keine Zugabe.** Ohne es wurde derselbe
Satz halb gelesen statt verweigert: „wird der Beistrich … durch das Wort
„sowie" ersetzt, entfällt die Z 6 und erhält die bisherige Z 7 …" führte die
Ersetzung aus und ließ die Streichung fallen (Ärztegesetz § 14) — der Zweig,
der die Klausel las, verbrauchte sie ganz. Erst die Messung zeigte es; der
Entwurf ohne Komma stand schon einen Lauf lang da.

**Das Trennen legte drei Fehler frei, die älter sind als es selbst** — jeder
einzelne gefährlicher als die Verweigerung, die ihn verdeckt hatte:

- *Der Anker war ein Operand.* „wird nach dem Ausdruck „AsylG 2005" das Wort
  „und" durch einen Beistrich ersetzt" — nach Position gepaart schrieb die
  Engine das Zitat über das Wort (BFA-VG § 14, im Korpuslauf gefunden).
  `operandQuotes` liest jetzt die **Rolle**: Was ein Anker einführt, ist kein
  Operand. Aufgelöst wird er nicht — die eigene Forderung der Engine, die
  Textstelle müsse in der adressierten Einheit **einmal** vorkommen, ist
  strenger als der Anker.
- *Der Plural fiel durch.* „es entfallen die Zitierungen „A" und „B"" traf
  `PHRASE_OBJECT` nicht (das Wortende steht am „g") und landete im Zweig
  darunter — der **Einheitenstreichung**, die den ganzen Absatz entfernt
  hätte. Die Nomen tragen jetzt ihre Pluralform, und eine Einheitenstreichung,
  die einen Text nennt, verweigert.
- *Die Überschrift nahm den Paragraphen mit.* „Es entfällt die Überschrift des
  § 6" adressiert eine Überschrift (`a.heading`), und `lawApply` las nur die
  Ebene: § 6 fiel aus dem Gesetz, und der Lauf meldete Erfolg. Allein stehend
  erreichbar, seit dem Trennen auch als Hälfte eines Satzes.

Dazu die **gemischte Ersetzung**: Ein Operand in Anführungszeichen, einer
benannt, weil ein einzelnes Zeichen keine Anführung trägt — „das Wort „oder"
durch einen Punkt ersetzt" und „der Strichpunkt am Ende durch das Wort „ oder"
ersetzt" sind die zwei Hälften einer Ziffernumnummerierung, und beide hießen
„Ersetzung ohne zwei Operanden". Welche Seite welche ist, entscheidet die
Stellung von „durch", nie die Reihenfolge der beiden.

**Gemessen über dieselben 40 Sammelnovellen, vorher und nachher, gleicher
Aufruf:**

| Paragraphen (geprüft 1.045 → 1.047) | vorher | nachher |
|---|---|---|
| identisch mit dem RIS | 725 | **749** |
| unverändert gelassen | 137 | **120** |
| halb angewendet | 94 | **78** |
| unvollständig | 55 | 66 |
| **eigene Abweichung** | **30** | **30** |
| ohne Verweigerung: identisch | 712 | **736** |
| ohne Verweigerung: abweichend | 16 | **14** |
| kein geltender Text (Rest des Tores) | 44 | **35** |
| Verweigerungen gesamt (Zeilen) | 469 | **453** |
| davon die Operandenklasse | 66 | **17** |

**Die schärfste Klasse bewegt sich nicht**: 30 vor und nach dem Eingriff, und
im unverweigerten Topf 16 → 14. Drei Paragraphen kommen hinzu, drei fallen
heraus; alle drei neuen tragen eine Verweigerung, und zwei davon sind gar
keine Erfindung der Engine — sie schreibt „GVG - B 2005", weil die Novelle es
so schreibt, und das RIS führt „GVG-B 2005". Der Wortdiff kann das nicht
trennen (→ die Normalisierungsklasse, § 5a Nr. 2).

**Was teurer wurde, gehört genannt:** „Teil nicht gelesen" steigt 25 → 38.
Das ist Buchhaltung, keine Verschlechterung — mehr Zeilen werden getrennt,
also haben mehr Zeilen **eine** ungelesene Hälfte, und `lawApply` verweigert
die ganze Zeile, sobald ihr Parse irgendeinen Grund trägt. Genau das macht das
Trennen ungefährlich: Es kann keine Anweisung halb ausführen.

**Die Anzeige bewegt sich nicht**, und das war die Vorhersage: Der
Drift-Lauf über beide Pfade (129 Tabellen-, 114 PDF-Beilagen) meldet **ohne
Befund** — keine Grundlinie war nachzuziehen. Das Tor verlangt zusätzlich die
Bestätigung durch die Beilage, und die ist anhangsgebunden; was hier wächst,
ist die Menge der Paragraphen, die überhaupt bestätigt werden *können*.

*Zur Vorsicht bei den Prozentsätzen dieses Prüfstands:* „Anweisungen",
„gelesen" und „angewendet" zählen **Operationen**, nicht Zeilen (2.079 →
2.173), weil eine getrennte Zeile zwei davon liefert. Vergleichbar über den
Eingriff hinweg sind die Paragraphenurteile und die Verweigerungen — beide
oben.

**Eine Fundstelle, zwei Schreibweisen (26.09.2026).** „Textstelle nicht
gefunden" stand 34× im Anwendungsteil, und die Vermutung im Plan war
Typografie. Die Durchsicht der 34 Zeilen sagt: **es ist keine Klasse.** Unser
Anteil daran ist eine einzige Form — dieselbe Fundstelle, anders gesetzt:

```
Novelle:               „(§ 1 Abs. 1 BBU - Errichtungsgesetz, BGBl. I Nr. 53/2019)"
geltender Text:         (§ 1 Abs. 1 BBU-Errichtungsgesetz, BGBl. I Nr. 53/2019)
Novelle:               „Grundversorgungsgesetz - Bund 2005 (GVG - B 2005), …"
geltender Text:         Grundversorgungsgesetz – Bund 2005 (GVG-B 2005), …
```

Der Operand einer Novelle ist ein **Zitat des geltenden Rechts**, und die
beiden Dokumente setzen denselben Namen nicht immer gleich. Die Anweisung
steht dabei nicht in Frage; verweigert wurde über ein Leerzeichen.

**Genau zwei Freiheiten, beide im Druck unsichtbar:** Ein Weißraumlauf trifft
jeden Weißraumlauf, und ein Gedankenstrich trifft jeden Gedankenstrich mit
beliebigem Abstand. **Nicht** toleriert wird der fehlende Punkt in „§ 20 Abs 1
und 7", eine andere Zahl, ein anderes Wort — das sind Unterschiede, die ein
Leser sieht, und dort zitiert das Ressort etwas anderes, als im Gesetz steht.
Gesucht wird die Toleranz erst, wenn die exakte Schreibweise **nirgends**
steht, und angewendet nur, wenn sie **genau eine** Stelle trifft: Zwei Treffer
heißen, dass erst die Toleranz die Mehrdeutigkeit erzeugt hat, und dann bleibt
es bei der Verweigerung.

**Die erste Fassung kaufte zwei Paragraphen und kostete zwei** — und die zwei
standen im unverweigerten Topf, also in dem, was eine Seite zeigen würde. Der
Grund stand im Wortdiff: Die Engine fand die Stelle und schrieb dann die
Schreibweise des Ressorts in ein Dokument, das sie eng setzt („+[GVG B]",
„+[BBU - Errichtungsgesetzes (BBU - G),]"). Der neue Text folgt seither dem
Dokument, in das er geschrieben wird, und zwar in dieser einen Hinsicht:
Schreibt der Paragraph den Namen selbst schon (und schreibt er ihn
einheitlich), gilt seine Schreibweise; sonst entscheidet die ersetzte Stelle,
und nur wenn sie alle ihre Striche eng setzt. Umgekehrt nie — ein Dokument,
das den Strich selbst weit setzt, bekommt den Entwurfstext unverändert.

| Paragraphen | vor der Toleranz | danach |
|---|---|---|
| identisch mit dem RIS | 749 | **753** |
| halb angewendet | 78 | **75** |
| unverändert gelassen | 120 | 119 |
| **eigene Abweichung** | **30** | **30** |
| ohne Verweigerung: identisch | 736 | **740** |
| ohne Verweigerung: abweichend | 17 | 17 |
| „Textstelle nicht gefunden" | 34 | **30** |

**Die übrigen 30 sind nicht unsere**, und das ist das eigentliche Ergebnis
dieser Messung: 2 adressieren die Überschrift eines *Abschnitts* oder
*Hauptstücks*, für die das Adressmodell keine Ebene hat (→ Klasse „keine
auflösbare Adresse"); 2 schreiben „§ 20 Abs 1 und 7" ohne Punkt; eine zitiert
„BGB. I Nr. 28/2010" statt „BGBl." — ein Tippfehler des Ressorts, der
verweigert bleiben muss; der Rest zitiert einen Wortlaut, der im geltenden
Text so nicht (mehr) steht, oder eine frühere Anweisung derselben Novelle hat
ihn schon geändert. **Eine Normalisierung, die diese 30 aufmacht, gibt es
nicht** — die Vermutung aus dem Plan ist damit beantwortet und die Klasse
geschlossen.

**Ein Eimer von 55 sagt nichts (26.09.2026).** „Keine auflösbare Adresse"
war die größte verbliebene Verweigerungsklasse und zugleich die
uninformativste: Sie nennt nicht, *was* nicht adressierbar war. Die Zeilen
nennen es sehr wohl, und sie verteilen sich auf acht Dinge, die nichts
miteinander zu tun haben:

| was die Adresse nennt | Zeilen | wo |
|---|---|---|
| `Anhang` mit eigenen Ziffern und Litera | 18 | Verbraucherbehördenkooperationsgesetz, UWG |
| `Tarifpost` samt `Anmerkung` | 13 | Gerichtsgebührengesetz |
| der `Titel` des Gesetzes | 7 | ORF-G, FinStrG, GlücksspielG, … |
| `Halbsatz` | 5 | RAO, Notariatsprüfungsgesetz, LFG |
| Überschrift eines `Hauptstücks` | 3 | AsylG 2005 |
| `Abschnitt`, `Teil` | je 2 | TDBG, UmgrStG, EAG |
| `Artikel` in römischer Zahl | 2 | GGG, ALSAG |
| nennt keine Einheit | 3 | |

Das ist der ganze Eingriff: Der Grund trägt jetzt das Wort, und **ohne
Doppelpunkt**, weil der Prüfstand seine Zählung am Doppelpunkt abschneidet
(`causeOf`) — mit einem wären alle acht wieder ein Eimer. Verweigert wird
genau wie vorher, und der Lauf bestätigt es: **jede Zahl des Prüfstands
identisch**, Zeile für Zeile.

Was daraus folgt, ist kein Tag Arbeit, sondern acht verschiedene: Drei der
Klassen brauchen den geltenden Text selbst — `StandingLaw` führt Paragraphen
und nichts darüber, also hat „Der Titel lautet:" keinen Ort, an den es
geschrieben werden könnte, und die Verweigerung ist dort die richtige
Antwort, nicht eine Lücke. Der `Anhang` dagegen ist die eine große und
geschlossene: zwei Gesetze, ein Dokument im RIS (`Anl. 1`), Ziffern und
Litera darin — und er steht damit ganz oben, wenn diese Klasse drankommt.

**„Artikelgegliederte Gesetze" waren zwei Zeilen und eine Zahlschrift
(26.09.2026).** Die vierte Restklasse stand ohne Zahl im Plan, und das war
der Grund, sie zuletzt zu nehmen. Gezählt über dieselben 40 Sammelnovellen:
**4 der 157 Gesetze** tragen überhaupt eine Einheit, die als `Art.` geprüft
wird, zusammen **11 Einheiten** — und 9 davon werden bereits richtig gelesen
(Bundes-Verfassungsgesetz 7/7 identisch, ALVG „Art. 1 § 1" identisch). Die
artikelqualifizierte Identität vom 25.09. (§12.12a) hatte die Klasse also
schon geschlossen; übrig blieben **zwei Zeilen**:

```
Dem Art. VI wird folgende Z 85 angefügt:      (Gerichtsgebührengesetz)
Dem Art. VII wird folgender Abs. 28 angefügt: (Altlastensanierungsgesetz)
```

Kein Strukturproblem, eine **Zahlschrift**: Die älteren Gesetze numerieren
ihre Artikel römisch, die Anweisung folgt ihnen, und das RIS führt die
Einheit als „Art. 6" und „Art. 7". `articleNumberKey` verbindet die beiden
Schreibweisen seit jeher — aber nur für den Artikel, der **vor** einem §
steht („Art. II § 7"); `PARA_RE` las als Ziel nur Ziffern. Jetzt beide, mit
der einen Schranke, dass hinter der römischen Zahl kein Buchstabe stehen
darf, sonst wäre „Art. Inkrafttreten" der Artikel 1.

Ertrag, gleicher Aufruf: **identisch 753 → 755**, unverändert gelassen 119 →
117, „Artikel in römischer Zahl" 2 → **0**, Abweichung in jedem Topf
unverändert (34 / 17). Damit ist die Klasse gezählt **und** erledigt, und die
Zählung ist das Ergebnis: Was wie eine Strukturklasse aussah, war der Rest
einer, die vor zwei Tagen gebaut wurde.

**Die Anlage war ein Paragraph mit derselben Nummer (26.09.2026).** Der
`Anhang` ist die größte der acht Adressklassen (18 Zeilen), und der erste
Schritt dorthin sollte nur sein, ihn überhaupt lesbar zu machen. Er legte
etwas anderes frei.

*Erstens, das RIS schreibt es anders, als eine Anweisung es schreibt.* Das
Gliederungssymbol einer Anlage lautet **„Anl. 1"**; `lawtext/konsTree.ts`
kannte beim Lesen der Kennung nur das Wort „Anlage" — das Wort der
**Anweisung**. Jede Anlage jedes Gesetzes kam damit mit der Kennung „?" an.
Am Anhang des Bundesgesetzes gegen den unlauteren Wettbewerb gemessen: 41
Ziffern, sauber geparst, und keine davon erreichbar.

*Zweitens, und das ist der eigentliche Fund: Kennung ist Zahl, und eine
Anlage 1 und ein § 1 haben dieselbe.* Drei Stellen suchten den Knoten allein
über die Zahl — `findParagraph`, `scopeOf` mit einer zweiten eigenen Suche,
und der **Prüfstand** beim Paaren von RIS-Etikett und Engine-Knoten. Solange
Anlagen die Kennung „?" trugen, konnte nichts kollidieren; mit der ersten
Korrektur wäre aus jeder dieser drei Stellen ein Paragraph mit dem Text einer
Anlage geworden. Alle drei fragen jetzt zusätzlich nach der **Art**, und die
steht im `marker` — der einzigen Stelle, die sie überlebt.

Was der Prüfstand daraufhin meldet, ist die Umkehrung dessen, was die erste
Messung zeigte: **acht Paragraphen verlassen die Klasse „eigene Abweichung",
und alle acht sind Anlagen.** Sie standen dort, weil das Messgerät den Text
einer Anlage gegen die Wahrheit eines gleichnumerierten Paragraphen hielt —
ein Artefakt des Instruments, nicht der Engine, und es lag vor diesem Tag
genauso da.

| | vorher | nachher |
|---|---|---|
| geprüfte Paragraphen | 1.047 | **1.050** |
| identisch mit dem RIS | 755 | **757** |
| **eigene Abweichung** | 30 | **22** |
| ohne Verweigerung: abweichend | 14 | **10** |
| kein geltender Text (Rest des Tores) | 35 | **31** |
| Gate: abweichend, plausibel | 7 | **3** |

**Der `Anhang` selbst ist damit noch nicht gelesen**, und das ist ehrlich
gesagt der kleinere Teil: Die 18 Zeilen schreiben „Z 1 lit. n **des
Anhangs**" ohne Nummer, weil das Gesetz genau einen hat. Der Engine-Pfad
könnte das schon — `findParagraph` nimmt die einzige Anlage, wenn die Adresse
keine Nummer nennt —, aber `PARA_RE` liest die nummernlose Form nicht, und
`konsGate.addressedLabels` baut aus einer Adresse immer ein Etikett „§ N", so
dass das Anlagendokument im Anfragepfad gar nicht erst geholt würde. Zwei
Stellen also, beide benannt, beide klein — aber sie gehören in denselben
Schritt wie die Messung, die sie rechtfertigt.

**Der bestimmte Artikel IST die Bezeichnung (26.09.2026).** Die 18 Zeilen der
`Anhang`-Klasse schreiben keine Nummer:

```
Z 1 lit. d des Anhangs entfällt.
Der Z 1 des Anhangs wird folgende lit. o angefügt:
Im Anhang wird nach Z 2 folgende Z 2a eingefügt:
```

Das Gesetz hat genau einen, also sagt „des Anhangs" schon alles. Die Adresse
bekommt die Nummer deshalb **nicht** angedichtet — welche Einheit gemeint
ist, beantwortet der geltende Text (`findParagraph` nimmt die einzige Anlage
und verweigert, wo es mehrere gibt), nicht der Parser.

**Zwei Fallen, beide beim ersten Lauf sichtbar geworden:**

- *Die Einheit steht VOR dem Dokument.* „Z 1 lit. d des Anhangs" — Deutsch
  stellt die Untergliederung voran, und `parseAddress` liest die Komponenten
  hinter der Bezeichnung, damit ein zitierter § nicht als Absatz gelesen
  wird. Von hinten gelesen war die Adresse der **ganze Anhang**, und die
  Streichung hätte ihn statt seiner Litera genommen. Bei einer Anlage werden
  die Komponenten daher aus der ganzen Adresse gelesen; steht die Nummer
  dahinter („Anlage 2 Z 3"), ändert das nichts.
- *„lautet" ist eine römische Zahl.* Die optionale Nummer stand als
  `[\dIVXL]+[a-z]*` da, und unter `/i` trifft `L` das „l" von „lautet" —
  „Z 1 lit. c des Anhangs lautet:" kam als Anlage „lautet" heraus. Die Zahl
  darf jetzt kein Wort anschließen.

Ertrag am selben Prüfstand: **gelesene Anweisungen 2.014 → 2.032** (genau die
18), angewendet 1.729 → 1.737, „Anhang ohne eigene Ebene" 18 → **0**,
identisch 757 → **758** — der Anhang des UWG ist jetzt Wort für Wort der
Text, den das RIS führt. **Die scharfen Klassen stehen still:** eigene
Abweichung 22, im unverweigerten Topf 10, „kein geltender Text" 31, alle drei
unverändert. Eine Anlage (IFG 2011) wandert von „unverändert gelassen" nach
„nicht prüfbar" — der Wortdiff des Prüfstands ist für ein Dokument dieser
Größe zu grob; das Tor verweigert sie deshalb, und das RIS sagt, der Text
wäre identisch gewesen.

**Auf der Seite ändert sich weiterhin nichts**, und diesmal mit einem
benannten Grund: `konsGate.addressedLabels` baut aus jeder Adresse ein
Etikett „§ N", und eine Adresse ohne Nummer liefert gar keines — das
Anlagendokument wird im Anfragepfad also nicht geholt.

**Die Schätzung dafür war „eine Stelle", und sie war falsch; es sind vier**,
und der Grund ist derselbe wie oben eine Ebene höher: **Der Anzeigepfad
schlüsselt jede Einheit über ihre nackte Nummer**, und eine Anlage hat keine
eigene. `addressedParagraphs` (die Kennung, zugleich der Nenner „X von Y"),
`addressedLabels` (das RIS-Etikett), die Auswahl der zu holenden Dokumente in
`kons/konsService.ts` und dort `nodeById`, das die Knoten mit „first
occurrence wins" über `node.id` in eine Map legt — eine Anl. 1 und ein § 1
fielen darin zusammen, genau wie im Prüfstand, nur unerreichbar, solange das
Anlagendokument gar nicht erst geholt wird. Dazu kommt die Frage, unter
welchem Schlüssel das Beilagen-Orakel eine Anhangszeile führt.

Das ist kein Verdrahten, sondern ein **Einheitenschlüssel, der die Art
trägt**, durch Bestand, Orakel, Wächter und Anzeige gezogen. Es gehört in
einen eigenen Schritt mit eigener Messung an einer Entwurfsseite — zehn
Entwürfe des Korpus tragen nummernlose Anhang-Anweisungen (Altlastenatlas-VO,
Kraftstoffverordnung, Suchtgiftverordnung, ETV 2020, UWG), also ist er
prüfbar.

**Ein Einheitenschlüssel, der die Art trägt (26.09.2026).** Die vier Stellen
aus der korrigierten Schätzung, plus die fünfte, die beim Bauen dazukam.
`text/designation.ts` hält jetzt `unitKey`: die nackte Nummer wie bisher, und
für eine Anlage ihre Art dazu („Anl. 1"); ohne Nummer „Anl.", die Form, die
eine Anweisung benutzt, wenn das Gesetz genau eine hat. Damit rechnen
`addressedParagraphs` (Kennung **und** Nenner), `addressedLabels`, die
Dokumentauswahl und `nodeById` in `kons/konsService.ts`, `findParagraph` in
`kons/lawApply.ts`, der Prüfstand — und seit diesem Schritt auch das
Beilagen-Orakel: `paraIdOfGld` liest „Anlage 1" als „Anl. 1", so dass eine
Anhangszeile der Beilage überhaupt unter einem Schlüssel steht. Wo Anweisung
(„Anl.") und Beilage („Anl. 1") verschieden schreiben, treffen sie sich an
der einzigen Anlage des Gesetzes und sonst nirgends.

**Ertrag am Prüfstand: keiner, und das ist die richtige Zahl** — jede Zeile
identisch, Drift ohne Befund. Der Schritt schließt eine Kollision, die
unerreichbar war, solange kein Anlagendokument geholt wurde, und macht den
Weg frei; er bewegt nichts, was vorher schon ging.

**Auf der Seite ist die Kette jetzt vollständig und trotzdem leer**, und der
Grund ist gemessen: Von den zehn Entwürfen des Korpus, deren Anweisungen eine
Anlage adressieren, tragen **zwei** überhaupt Anlagenzeilen in ihrer Beilage
(Suchtgiftverordnung 3, Tierarzneimittel-Anpassungsverordnung 8 von 61) — und
bei beiden zeigt die Lesefassung auch für ihre **Paragraphen** nichts, weil
der geltende Text dieser Verordnungen nicht auflöst. Es gibt in diesem Korpus
also keinen Entwurf, bei dem Adresse, Beilage und geltender Text zugleich
stimmen. Die Anzeige eines Anhangs wartet nicht mehr auf Code, sondern auf
einen Entwurf, der alle drei mitbringt.

**Der zweite Absatz fiel aus der Liste (26.09.2026).** Der Posten stand mit
„erst zählen" in § 5a, und die Zahl ist: **27 von 219** Adressen mit einem
„Abs. X und Y" verlieren das Y — über 300 Entwürfe, und keine davon wird
verweigert. Sie werden **halb ausgeführt**: Die Anweisung trifft Abs. 1 und
nicht Abs. 2, und der Lauf meldet Erfolg.

```
In § 9, § 10 Abs. 1 und 2, § 11a, § 13 Abs. 1 und 2, § 14, § 15 Abs. 4 …
                     ↑ dieses „2" trug kein §, also fiel es weg
```

`parseAddressList` trennt an „," und „und" und behielt dann nur die Teile,
die ein Gliederungssymbol tragen — das ist der Filter, der die Liste
überhaupt erst lesbar macht, und er wirft genau die Fortsetzung weg. Ein Teil
ohne eigene Bezeichnung ist **keine eigene Stelle, sondern die Fortsetzung
der vorigen**; wieder angehängt liest `siblingsAfter` ihn dort, wo er
hingehört. Allein stehend („In § 9 Abs. 1 und 2 wird …") war die Adresse
immer richtig — erst in der längeren Liste verlor der Teil sein § und damit
sein Zuhause.

**Ein erster Entwurf schnitt stattdessen an den Bezeichnungen** und brach 12
Tests: `PARA_RE` trifft auch „Art. 2", und ein Artikel, der einen Paragraphen
qualifiziert, ist keine zweite Adresse. Der Schnitt an den Trennern bleibt,
nur der Filter wird zum Zusammenlegen.

| | vorher | nachher |
|---|---|---|
| identisch mit dem RIS | 758 | **762** |
| halb angewendet | 76 | **72** |
| kein geltender Text (Rest des Tores) | 31 | **27** |
| ohne Verweigerung: identisch | 744 | **748** |
| eigene Abweichung | 22 | 22 |

Vier Paragraphen wechseln von „halb angewendet" nach „identisch", und die
schärfste Klasse steht still. Drift ohne Befund.

**„Tarifpost" ist keine Adressklasse, sondern die Tabelle (26.09.2026).** Von
den acht Adressklassen des Eimers von 55 stand `Tarifpost` 13 als die letzte,
die ohne neuen Bestand baubar schien. Sie ist es nicht, und der Grund liegt
eine Schicht tiefer.

Das RIS führt den **Tarif des Gerichtsgebührengesetzes gar nicht als eigenes
Dokument**: Unter der Gesetzesnummer des GGG stehen 67 Dokumente, §§ 1 bis 32
und ein Dutzend Übergangsartikel — und der ganze Tarif, alle Tarifposten mit
ihren Anmerkungen, steckt **in `Art. 1 § 32`**, 433 KB, als eine einzige
Tabelle hinter dem Satz über die Einbringung. Das Gebührengesetz 1957 macht
es anders und endet am selben Punkt: dort sind die Tarifposten
`<ueberschrift>`-Abschnitte innerhalb des § 14 („8 Einreise- und
Aufenthaltstitel"), und der Absatz, den eine Anweisung meint
(„§ 14 Tarifpost 8 Abs. 2"), ist eine von vielen Absatzkennungen desselben
Dokuments.

Beide Dokumente kommen aus `parseKonsParagraph` als `null` zurück, und zwar
**mit Absicht**: ein Dokument mit `<table>` wird nicht geladen, weil die
Zellen sonst in Dokumentreihenfolge als Absätze gelesen würden (Befund vom
09.09.2026, NEHG §§ 24, 26, 27). Die 13 GGG-Zeilen würden also, selbst wenn
die Adresse gelesen wäre, an derselben Stelle verweigert wie die vier des
GebG — nur mit einem anderen Grund. **Adressarbeit kauft hier nichts.**

Damit ist die Klasse neu vermessen und heißt anders:

| | Zahl |
|---|---|
| geholte Paragraphendokumente im Cache | 20.419 |
| davon mit `<table>`, also nie geladen | **693 (3,4 %)** |
| betroffene Gesetze | 151 von 607 |
| Verweigerungen „nicht im geltenden Text" gesamt | 108 von 437 |
| davon einer Tabelle zuzuordnen | **18** |
| dazu die GGG-Tarifposten | 13 |

Die größte verbliebene Verweigerungsklasse ist „nicht im geltenden Text"
(108), und die Tabelle erklärt davon 18. Der Rest ist nicht sie.

**Was daraus folgt.** Die Tabelle ist ein eigener Posten, kein
Adressenposten: Sie müsste als **undurchsichtiger Knoten** geladen werden —
der Paragraph kommt mit seinem übrigen Baum an, die Tabelle als ein Block,
den keine Anweisung betreten darf. Das gewinnt Anzeige (ein nicht geladener
Paragraph kann nie gezeigt werden) und hält die Zusage, dass keine Zelle als
Absatz gelesen wird. Es ist aber ein Eingriff in den sichersten Parser für
31 Anweisungen, und er gehört hinter die Posten, die zehnmal so viel bewegen.
Bis dahin ist die Verweigerung die richtige Antwort, und `Tarifpost` steht
nicht mehr unter den Adressklassen.

**Zehnte Messung, 19.09.2026: zwei Aufrufe, die den Namen wegwarfen, und ein
Vokabular, das drei Jahrhunderte übersah.** Beides betrifft dieselbe Frage
- welches Gesetz ändert dieser Artikel? -, beides ist klein, und beides
wirkt auf die sprechenden Namen (§12.11) genauso wie auf den konsolidierten
Text.

*Der Name lag daneben.* `resolveLawByBgbl` nimmt einen Namen entgegen, weil
ein Bundesgesetzblatt regelmäßig mehrere Gesetze schafft und das
Stammnorm-Paar sie nicht trennt; ohne ihn verweigert es. `paraTitleService`
und `amendedLawsService` übergaben die leere Zeichenkette - beide mit der
Artikel-Überschrift im Zugriff, die eine als Schlüssel der eigenen
Schleife, die andere eine Zeile weiter unten als Anzeigename.
`annexGuardService` reicht sie seit jeher durch; es waren zwei von drei
Aufrufern. Über 40 Entwürfe mit 116 ändernden Artikeln lösen **12 nur
mit der Überschrift** auf und keiner nur ohne - darunter UStG 1994,
Börsegesetz 2018, Umgründungssteuergesetz. Kein zusätzlicher Abruf: der
Name ist Teil des Cache-Schlüssels.

*Das Vokabular übersah die alten Kodifikationen.* ABGB (JGS Nr. 946/1811),
ZPO und Notariatsordnung (RGBl.), UGB (dRGBl. S. 219/1897) - `parseBgbl`
kannte nur BGBl., also war ihre Stammnorm null und der Artikel löste auf
nichts auf. Das RIS führt sie im **selben Feldpaar**, es fehlte also keine
zweite Verknüpfung, nur ein größeres Alphabet. Zwei Fallstricke: die
älteren Organe nummerieren mit Seite (S.) statt Nummer, und ihre
Schreibweise ist nicht kanonisch - JGS Nr. ohne Punkt nach der Abkürzung,
dRGBl. S mit. Das Organ wird deshalb übernommen, wie die Quelle es
schreibt, und `sameBgbl` vergleicht normalisiert, ohne den Teil einzuebnen
(84/2001 ist BGBl. I *und* BGBl. III).

| 60 BGBl | vorher | nachher |
|---|---|---|
| nicht auflösbare Gesetze | 8 | **2** |
| bewertete Gesetze / Paragraphen | 200 / 1.694 | **206 / 1.751** |
| identisch mit dem RIS | 1.087 (64,2 %) | **1.131 (64,6 %)** |
| eigene Abweichung | 47 (2,8 %) | 49 (**2,8 %**) |
| kein geltender Text, ohne Verweigerung | 91 (7,2 %) | 95 (**7,3 %**) |

Die sechs neu sichtbaren Gesetze sind ABGB (2x), ZPO, Notariatsordnung (2x)
und Rechtsanwaltsordnung. Ihre Paragraphen verhalten sich wie der Rest - die
Quoten bleiben, die Basis wächst. Übrig bleiben zwei: das ABBAG-Gesetz
(Stammnorm korrekt zitiert, im BrKons unter dieser Nummer nicht eindeutig)
und ein Artikel, der eine *Novelle* ändert statt eines Stammgesetzes.

*Methodischer Vorbehalt, der in jede Folgemessung gehört.* Die
Paragraphenquoten werden von wenigen großen Entwürfen getragen: das
Strafvollzugsgesetz stellt allein 42 der 108 Orakel-Widersprüche und 77 der
413 Paragraphen. Gepoolte Prozentsätze über einen Korpus dieser Größe sagen
mehr über die Stichprobe als über die Engine; die Zahl je Entwurf (Median
12 %, Anteil der Entwürfe mit mindestens einem anzeigbaren § 50 %) ist die
robustere und zugleich die, nach der ein Produkt fragt.

**„samt Überschrift" in einer Phrasenanweisung, 19.09.2026 — eine Klasse mit
zwei Fällen, und einer davon stand kurz vor der Anzeige.** „In § 22 samt
Überschrift, § 23 Abs. 1a und 2 … wird jeweils das Wort ‚Generalprokuratur'
durch das Wort ‚Bundesstaatsanwaltschaft' ersetzt": Die Engine benannte den
Rumpf um und ließ die Überschrift stehen. Der Paragraph war damit weder das
geltende Recht noch der Entwurf, sondern eine dritte Fassung, die es nie gab
— **und er kam ohne Verweigerung, plausibel und vom Anhang bestätigt durch
alle drei Tore.** Gefunden wurde er nicht von einer Messung, sondern beim
Nachlesen eines einzelnen Ergebnisses.

Der Grund war eine Ebene, keine Lücke: `withHeading` gab es längst, aber nur
für die Neufassung und den Entfall einer Einheit — die Überschrift ist in
`lawtext/konsTree` ein eigener Slot, und eine Phrasenoperation adressierte immer
den Text. Behoben nicht mit einem dritten Anwendungsmodus, sondern mit einer
**zweiten Operation**: Trägt eine Adresse „samt Überschrift", entsteht neben
ihr ein Zwilling auf den Überschriften-Slot, auf den Paragraphen hochgezogen
(„§ 15a Abs. 1 und 2 samt Überschrift" meint die Überschrift von § 15a).
Beide müssen ihre Wortfolge genau einmal finden, sonst verweigert die
Anweisung — die Regel, die überall sonst im Modul gilt, gilt damit auch hier.

*Die Population zuerst gemessen, dann repariert.* Über 6.576 geerntete
Anweisungen aus 300 Entwürfen (`.cache/novao/novao.jsonl`) tragen 387 ein
„samt Überschrift", aber nur **2** davon sind Phrasenoperationen; die
übrigen sind Neufassungen (159), Einfügungen (173) und Entfälle (45), die
den Zusatz längst lesen. Zwei von 6.576 ist keine Fehlerklasse, die eine
Quote bewegt — und genau deshalb steht sie hier: Sie bewegt die *Anzeige*.

*Der Beleg, dass der Eingriff nichts anderes anfasst.* Beide Prüfstände vor
und nach der Änderung, dieselben Korpora, dieselben Caches:

| | vorher | nachher |
|---|---|---|
| BGBl-Pfad: gelesen / angewendet | 2.976 / 2.469 | **unverändert** |
| BGBl-Pfad: identisch / eigene Abweichung | 1.131 / 49 | **unverändert** |
| Entwurfspfad: Plausibilität × Orakel (alle 10 Klassen) | — | **unverändert** |
| Entwurfspfad: Paragraphen mit geändertem Ergebnis | — | **1 von 413** |

Der eine geänderte Paragraph ist StPO § 22, und er ist jetzt richtig. Ein
Eingriff, der genau das anfasst, was er anfassen soll, sieht so aus.

**Elfte Messung, 23.09.2026: der dokumentierte Befehl maß einen Tag lang ein
Zehntel des Korpus — und vier Annahmen der Engine, denen nie jemand
widersprochen hat.**

*Zuerst das Messinstrument, weil ohne es keine der folgenden Zahlen etwas
wert ist.* `--discover=N` war seit 70fb8f3 (22.09.2026) wirkungslos:
`argAssigned('discover')` liefert den nackten Wert, der Aufrufer rechnete aber
weiter `Number(discover.split('=')[1] ?? 10)` — und `"60".split('=')[1]` ist
`undefined`. Der in diesem Abschnitt dokumentierte Befehl
(`pnpm harness:kons -- --discover=60 --sammel --cache`) maß deshalb **10
Bundesgesetzblätter, 14 Gesetze, 205 Paragraphen** statt 60 / 206 / 1.751 —
und druckte darüber einen vollständigen, in sich plausiblen Bericht. Genau
das macht die Klasse gefährlich: ein geschrumpfter Korpus sieht aus wie ein
Korpus. Derselbe Schnitzer stand im ME-Prüfstand (Vorgabe 20). Beide behoben,
und beide Kopfzeilen tragen jetzt den *angeforderten* neben dem erreichten
Korpus. Dazu ein zweiter Lesefehler: eine Liste expliziter BGBl-Kennungen kann
als eine einzige, leerzeichengetrennte argv-Zeile ankommen —
`scripts/harness/me.ts` teilt sie seit 18.09.2026, `kons.ts` tat es nicht;
jetzt beide, und der Kurztitel wird aus der geteilten Liste gelesen statt per
`indexOf` in der rohen argv.

*Die zehnte Messung ist damit reproduziert*, offline aus `.harness-cache`,
Zahl für Zahl: 60 Bundesgesetzblätter, 206 Gesetze, 1.751 geprüfte
Paragraphen, 1.131 identisch (64,6 %), 49 eigene Abweichungen (2,8 %), 95 ohne
geltenden Text und ohne Verweigerung (7,3 %).

*Vier bestätigte Fehlannahmen, alle von derselben Sorte:* Die Engine tat
etwas, niemand sagte ihr, dass es falsch war.

1. **Eine Untergliederung, die das Modell nicht kennt, wurde überlesen.**
   `NovaoAddress` endet bei der Litera, und `lawtext/konsTree` hat unter ihr
   keine Ebene — das RIS führt „aa)" als *Geschwister* von „a)". „§ 5 Z 20
   lit. a sublit. bb lautet:" schrieb also lit. a neu, „… sublit. bb entfällt."
   löschte lit. a, „In § 1 Abs. 1 Z 2 lautet der erste Teilstrich:" ersetzte
   die ganze Ziffer. Im Korpus (6.576 Anweisungen) 18 Adressen mit `sublit`, 19
   mit `Teilstrich`, 8 mit `Spiegelstrich`, 13 davon Ganzeinheits-Operationen.
   Jetzt verweigert, mit dem Wort im Grund („Untergliederung ohne eigene
   Ebene") — dieselbe Mechanik, mit der `SATZ_WORD` ein unplatzierbares
   Satzwort verweigert.
2. **Eine angefügte Ziffer landete hinter dem Schlussteil.** `append` schob sie
   ans Ende der Kinder statt ans Ende der Aufzählung, und der Schlusssatz
   („Die Anzeige hat schriftlich zu erfolgen.") stand danach *in* der Liste.
   Der Zweig für den angefügten Satz sucht die Schlussklausel seit jeher; der
   für die Einheit tat es nicht.
3. **„das Wort ‚Amt'" traf in „Amtsstelle".** Operanden wurden ausnahmslos als
   Teilzeichenketten gesucht. „Wort"/„Worte" verlangen jetzt beidseitig eine
   Wortgrenze, „Wortfolge" und „Zeichenfolge" bleiben wörtlich — welches
   Substantiv gemeint ist, sieht nur `kons/novao.ts`, also trägt die Operation
   die Entscheidung mit.
4. **Das Orakel las nur die Einfügungen.** Siehe unten.

| 60 BGBl, `--discover=60 --sammel` | vorher | nachher |
|---|---|---|
| grammatikalisch gelesen | 2.976 | **2.961** |
| angewendet | 2.469 | **2.470** |
| identisch mit dem RIS | 1.131 (64,6 %) | **1.133 (64,7 %)** |
| eigene Abweichung | 49 (2,8 %) | **48 (2,7 %)** |
| kein geltender Text, ohne Verweigerung | 95 (7,3 %) | **93 (7,1 %)** |

15 Anweisungen fallen neu unter „Untergliederung ohne eigene Ebene"; die
Anwendungsverweigerungen gehen um 16 zurück (507 → 491), weil dieselben Zeilen
vorher erst beim Ausführen scheiterten — mit einem Grund, der die Ursache nicht
nannte. Der Anteil von Nr. 1 daran, isoliert gemessen (derselbe Lauf, nur diese
Verweigerung abgeschaltet): eigene Abweichung 50 → **48**, kein geltender Text
94 → **93**, unverweigert geprüfte Paragraphen 1.311 → 1.310. Zwei Paragraphen
verlassen die schärfste Klasse, einer die Restgefahr des Tors.

*Das Orakel, und warum es die Löschung bestätigt hat.* Der Kopfkommentar von
`kons/tguOracle.ts` verspricht seit dem ersten Tag „jedes Wort, das die Engine
eingefügt **oder entfernt** hat" — geprüft wurde nur die Einfügung. Und die
Schleife über die vorgeschlagene Spalte übersprang jede Zeile mit leerer
Vorschlagszelle, also genau die Form, in der eine Gegenüberstellung eine
Streichung schreibt. Eine Löschung eine Ebene zu hoch erfindet kein Wort,
widerspricht keiner Zeile — und ging durch alle drei Tore. Jetzt symmetrisch:
jedes entfernte Wort muss in der *geltenden* Spalte dieses Paragraphen
vorkommen, und eine Zeile ohne Vorschlag verlangt, dass ihr Text im Ergebnis
verschwunden ist.

Der Preis steht in derselben Währung wie der Nutzen — Deckung:

| 40 Entwürfe, `--discover=40` | vor der Symmetrie | danach |
|---|---|---|
| Paragraphen mit Text | 413 | 413 |
| ohne Verweigerung und plausibel | 276 | 276 |
| davon vom Anhang bestätigt (das Anzeigbare) | 107 (25,9 %) | **102 (24,7 %)** |
| Orakel bestätigt / widersprochen | 111 / 108 | **106 / 113** |
| Orakel stumm / fremd / kein Anhang | 27 / 14 / 153 | unverändert |

Fünf Paragraphen wandern von „bestätigt" nach „widersprochen", keiner in die
andere Richtung. 1,2 Prozentpunkte Deckung für eine Fehlerklasse, die genau
die Art Fehler ist, gegen die das Tor existiert: ein Text, den es nie gab, mit
allen drei Signalen grün. Verweigern schlägt Deckung, auch hier.

**Wo die Verweigerungen am Abend des 26.09.2026 stehen — und warum das
Messgerät die Klassifikation schon mitbringt.** Nach den Schritten dieses
Tages sind es **424** über 40 Sammelnovellen. Die größte Klasse heißt „nicht
im geltenden Text" (103 mit den Ankern), und der Prüfstand hält zu **jeder**
dieser Zeilen die RIS-Wahrheit daneben — das muss niemand mehr von Hand
lesen:

| Was der Prüfstand gegen das RIS feststellt | Zeilen |
|---|---:|
| Untereinheit steht nicht im Ausgangstext (die Fassung ist älter als der Entwurf annimmt) | 48 |
| RIS kennt das Label nicht | 18 |
| **RIS-Dokument geladen, aber nicht als Paragraph lesbar** | 15 |
| Untereinheit stand im Ausgangstext — **eine frühere Anweisung hat sie entfernt** | 13 |
| Paragraph stand im Ausgangstext — eine frühere Anweisung hat ihn entfernt oder umbenannt | 8 |
| entsteht erst durch diese Novelle | 1 |

**Zwei Drittel sind keine Fehler von uns**: eine Anweisung, die eine Ziffer
ändert, die es in der Fassung zum Stichtag noch nicht gibt, gehört verweigert.
**Die 21 in der Mitte sind die nächste Klasse**: dort stand die Einheit im
Ausgangstext, und eine frühere Anweisung derselben Novelle hat sie
weggenommen — entweder wenden wir die frühere falsch an, oder die Reihenfolge
des Entwurfs ist wirklich so. Jede will einzeln gelesen werden, und keine
bewegt für sich mehr als eine Zeile.

*Eine Fährte, die keine war:* In den Verweigerungstexten steht der Operand
als leeres Anführungspaar („entfällt die Wendung """), was nach verlorenen
Operanden aussieht. Es ist `maskQuotes` — die Adresse wird ohne ihre Zitate
gelesen, weil ein Zitat nie eine Adresse ist, und der Grund druckt genau
diese maskierte Form.

**Und was der Bestand jetzt nicht mehr lesen kann**, nach Tabelle und „§ 0":
**422 von 20.700** geholten Paragraphendokumenten (2,0 %), und davon sind
**417 Absicht** — 275 Inhaltsverzeichnisse unter „§ 0", 142 Paragraphen mit
Tabelle, deren Bezeichnungen sich wiederholen. Die **fünf** übrigen sind
Anlagen, deren Inhalt ein **Bild** ist (`abbobj`: das Signet nach § 12
Denkmalschutzgesetz, ein Formular der Zulassungsstellenverordnung) oder eine
bloße Liste ohne Absatzstruktur. Vor heute waren es 968.

**Die „frühere Anweisung" war ein Ausschluss, keine Klassifikation — und
die 21 Zeilen waren sieben Lücken (26.09.2026, später am Abend).** Der
Absatz oben ist in zwei Punkten zu korrigieren. Das Etikett „eine frühere
Anweisung hat sie entfernt" vergab der Prüfstand, wenn die Engine „Nicht im
geltenden Text" meldete und `resolveTarget` Abs., Z oder lit. im
Ausgangstext trotzdem fand — es blieb nur die frühere Anweisung übrig.
Einzeln gelesen passte das auf **drei** der 21 Zeilen. Und „zwei Drittel
sind keine Fehler von uns" stimmt nicht: **21 der 48** Zeilen unter
„Untereinheit nicht im Ausgangstext" waren unsere.

| was die Zeile wirklich war | Zeilen | Schritt |
|---|---:|---|
| Satz eines § ohne Absatzzählung („In § 8 erster Satz") — der §-Knoten trägt nur seinen einen unbezifferten Absatz | 4 | `bodyOf` |
| Satz eines Absatzes mit Liste — verweigert, obwohl der Satz ganz in Einleitung oder Schlussteil steht | 4 | `listSentences` |
| ein Verb, mehrere Orte („in Z 1 … und im Schlussteil … ersetzt") — gelesen als der Schlussteil der Z 1 | 5 | `splitPlaces` |
| die zweite Satzhälfte adressiert die Einheit unter der Nummer, die die erste ihr gerade genommen hat | 2 | `opContext` |
| §-Liste: Prüfstand und Seite holten nur den ersten § | 3 | `namedParagraphs` |
| „Der bisherige Inhalt des § 29 erhält die Absatzbezeichnung ‚(1)'" — als Umbenennung des **§** in § 1 ausgeführt | 1 | `absatzDrawnIn` |
| Satzgrenze „Z 6. Die", Ordnungszahl „des 2. Teiles" | 2 | `splitSentences` |

Die erste Spalte ist erst messbar, seit die Engine sagt, *was* fehlt:
„Satz … nicht auffindbar" statt „Nicht im geltenden Text", wo die Einheit
dasteht und nur ihr Satz nicht zu zählen ist, und der Prüfstand fragt eine
§-Liste § für § ab. Alle 21 werden jetzt angewendet.

Beim Bauen kamen fünf Nachbarklassen dazu, die dieselbe Mechanik hatten
und sich unter anderen Etiketten versteckten — jede einzeln gemessen, jede
eigener Commit:

- **„…; folgende Z 5 und 6 werden angefügt"** — der gewöhnlichste Weg, eine
  Liste zu verlängern. Die zweite Hälfte nennt keinen Ort, die Adresse wurde
  aus ihrem eigenen Text gelesen („Z 5", die es noch nicht gibt). Das sind
  die 21 der 48 (`appendHost`).
- **Eine Satzhälfte ohne eigenen Ort erbte nur § und Absatz** — „… Z 6 wird A
  durch B ersetzt und entfällt das Wort ‚c'" strich im ganzen Absatz.
- **Eine Adresse nennt einen Ort.** „§ 48 Abs. 1 Z 2 und Abs. 4" verlor den
  Abs. 4, „Abs. 1 und Abs. 2" den Abs. 2, „lit. b, c, e und f entfällt"
  strich nur lit. b, „Abs. 3 und Abs. 6 Z 1" wurde zu „Abs. 3 Z 1" — jedes
  Mal angewendet und als Erfolg gemeldet (`siblingsAfter`, `onePlace`,
  `opensPlace`). Dazu zählte eine verweigerte Zeile nur ihren ersten § als
  verweigert, und auf der Seite war der Schlüssel dafür die nackte Zahl, so
  dass eine gescheiterte Anweisung an der Anl. 1 den § 1 sperrte und die
  Anlage frei ließ (`refusedUnits`).
- **Ein Zitat, das das Bundesgesetzblatt um einen Strich herum in mehrere
  `<n>`-Stücke setzt**, kam als „ARF - oder KSF - Leistungen" an (65 solcher
  Schnitte). Im alten Text überbrückte die tolerante Suche das, im neuen
  nicht — zwei Paragraphen standen allein deshalb unverweigert abweichend da.

| `--discover=40 --sammel --cache` | vorher | nachher |
|---|---:|---:|
| Verweigerungen | 424 | **355** |
| angewendet | 1.749 | 1.838 |
| identisch mit dem RIS | 770 | **830** |
| halb angewendet | 71 | 57 |
| ohne Verweigerung abweichend | 14 | **12** |
| eigene Abweichung | 22 | 16 |
| „kein geltender Text" ohne Verweigerung | 25 | 20 |
| ME-Prüfstand, anzeigbar über 120 Entwürfe | 509 | **537** |

Kein Schritt hat die Drift bewegt. Zwei Mal hat ein Schritt eine alte
Fehllesung sichtbar gemacht, indem er die Verweigerung aufhob, die sie
verdeckte (FPG § 81, KFG § 48); beide sind im jeweils nächsten Schritt
behoben. Die dritte ist am 27.09.2026 behoben: Beim AsylG 2005 § 59 fehlte
der neuen Überschrift das schließende Anführungszeichen („… der
‚Aufenthaltsberechtigung besonderer Schutz'"), weil es zweimal abgenommen
wurde — `stripQuotes` nahm jedes Zeichen am Ende, und `stripPayloadQuotes`
nahm von der schon entzitierten Überschriftszeile noch eines. Jetzt zählt
`stripQuotes`, ob das letzte Zeichen das Paar der Anordnung schließt, und
eine Überschriftszeile wird kein zweites Mal angefasst (identisch 830 → 831,
sonst nichts bewegt).

**Die Adressklassen über dem §** (`Titel`, `Hauptstück`, `Abschnitt`,
`Teil`) bleiben verweigert, und das ist nachgeprüft: Gruppenüberschriften
kommen in den Baum nur als `context` des ersten § und von dort auf keine
Seite, einen Titel führt das RIS als Dokument gar nicht. `StandingLaw` um
Einheiten über dem § zu erweitern, bewegte Zahlen des Prüfstands und nichts,
was jemand liest. `Halbsatz` gehört nicht dazu — er liegt unter dem Satz,
und zwei seiner fünf Zeilen sind gar keine Adressen: „wird nach dem Wort
‚X' **der Halbsatz** ‚…' eingefügt" benutzt ihn als Nomen des Zitats, wie
„die Wortfolge". Seit 27.09.2026 so gelesen, dazu „vor dem Punkt am Ende"
als Anker (`atEnd`: das Zeichen, auf das die Einheit endet — Zahnärztegesetz
§ 22 Abs. 2 trägt sechs Punkte); identisch 831 → 834.

**Der Halbsatz unter dem Satz (27.09.2026).** Die sieben übrigen Zeilen
brauchten eine Einheit unter dem Satz, und die Messung davor hat entschieden,
welche: **keine feste**. Alle sieben „lautet der erste Halbsatz" der 300
Entwürfe enden ihren neuen Text an einem Beistrich (einmal an einem
Doppelpunkt vor der Liste), LFG § 169 Abs. 5 im Prüfstand auch; RAO § 50
meint den Teil vor dem Strichpunkt, und ein Entwurf schreibt „der zweite
Halbsatz nach dem Strichpunkt", weil das Wort es allein nicht sagt. Eine
Grenzregel am Strichpunkt hätte in den sieben Zeilen den ganzen ersten Satz
ersetzt. Deshalb trägt die Adresse nur die Ordnungszahl (`halbsatz`), und die
Grenze kommt aus der Operation selbst:

- **Ersetzen:** Der neue Text ist der Zeuge (`halbsatzSpan`). Der alte
  Halbsatz endet, wo der alte Satz dieselben letzten zwei Wörter mit
  demselben Zeichen trägt, genau einmal; ein späterer beginnt hinter einem
  Satzzeichen mit den ersten zwei Wörtern des neuen. Ändert der neue Text
  gerade sein Ende, endet der alte am nächsten Strichpunkt, wo der neue mit
  einem schließt — einen Beistrich sucht die Regel nie —, sonst nur der
  letzte Halbsatz am Satzende. Alles andere wird verweigert.
- **Eine Phrase im Halbsatz** wird in dessen Satz gesucht und muss dort
  eindeutig sein.
- **Anfügen:** „… wird der Punkt am Ende durch einen Beistrich ersetzt und
  folgender Halbsatz angefügt" ist eine Handlung und eine Operation
  (`mergeEndMarks`): das Zeichen, auf das die Einheit oder der genannte Satz
  endet, wird ersetzt und der Halbsatz dahinter gesetzt. Getrennt machte die
  Ersetzung die Anfügung falsch — ohne ihren Punkt lief der erste Satz in den
  zweiten. Dieselbe Regel liest jetzt „folgender Satz angefügt" (7 Zeilen der
  Entwürfe, bisher verweigert) und den gewöhnlichsten Weg, eine Liste zu
  verlängern, wo die Ziffer mehr als einen Punkt trägt (9 Zeilen).
- **„der nachfolgende Halbsatz entfällt"** hinter „der Strichpunkt durch einen
  Punkt ersetzt" ist ebenfalls eine Operation (`truncate`): Der Satz endet am
  neuen Punkt.

Über die Schritte a3cf04e bis d095e19, gleicher Aufruf: Verweigerungen 352 →
336, identisch 834 → **849**, halb angewendet 57 → 52, ohne Verweigerung
abweichend 12 → 12, „kein geltender Text" ohne Verweigerung 20 → 19; im
Prüfstand steht keine Halbsatz-Zeile mehr verweigert. Nebenbei gefunden und
behoben: `parseKonsParagraph` klebte einen unbezifferten Absatzblock hinter
einer Liste an den Einleitungstext statt ihn als Schlussteil hinter die Liste
zu stellen (KFG § 102 Abs. 3a) — der geltende Text der Seite stand dort in
falscher Reihenfolge.

**Was nach der Halbsatz-Familie blieb (28.09.2026).** Sieben offene Posten,
Zeile für Zeile gelesen; die meisten Verweigerungen waren richtig, die
übrigen fielen in wenige Formen. Die Regel hinter allen: **Wo der Wortlaut
den Ort nicht eindeutig sagt, entscheidet der geltende Text — und wo auch der
nicht, bleibt die Zeile verweigert.**

- **Ein Wort ohne Anker gehört ans Ende seiner Einheit.** „der Z 3 das Wort
  ‚ oder' angefügt" hängt hinter alles, auch hinter den schließenden
  Beistrich — so zeigt es das RIS für alle belegten Fälle. „am Ende …
  eingefügt" sagt nicht, auf welcher Seite eines schließenden Zeichens, und
  gilt nur, wo die Einheit ohne eines endet (`bareEnd`); ebenso ein Text, der
  selbst mit einem Zeichen beginnt, und ein in Worten genanntes Zeichen
  („der lit. d ein Strichpunkt angefügt").
- **Ein Zeichen als Anker** („vor dem Strichpunkt die Wortfolge ‚…'") muss in
  der Einheit einmal stehen; der Punkt nie, den trägt jede Abkürzung.
- **Der Anker einer Ersetzung** („vor der Wortfolge ‚X' das Wort ‚Y' durch
  …") wurde überlesen, und das genügte, solange Y einmal stand. Steht es
  öfter, wird das Paar aus Operand und Anker gesucht, nebeneinander und
  seinerseits eindeutig (`beside`). Nötig wurde das auch innerhalb einer
  Zeile: Deren erste Hälfte fügt ein zweites Vorkommen ein, die zweite
  ersetzt eines davon (FPG § 76 Abs. 6).
- **Eine Zahl ist nie Teil einer längeren.** Mit „die Beträge ‚50' jeweils
  durch …" wäre „150" zu „170" geworden; das galt schon für „Betrag" und
  „Zahl", bevor ein neues Hauptwort es sichtbar machte.
- **Eine doppelte Bezeichnung** (zweimal „Z 3" unter einem Absatz) macht jede
  Adresse darauf unbestimmt (`uniqueChild`). Global beim Laden geprüft,
  kostete dieselbe Regel 16 identische §§ und 23 lesbare Dokumente — sie
  gehört an die Adresse, nicht an den Baum.
- **„z. B." beendet keinen Satz**, und **„(Anm. : …)"** ist eine
  RIS-Anmerkung wie „(Anm.: …)" — die Form, die die Anhangseite seit
  10.09.2026 entfernte, die RIS-Seite aber nicht: dieselbe Asymmetrie, vor
  der der Kommentar an `text()` warnt.

Die Halbsatz-Regel selbst ist dabei am echten Text geprüft worden: alle 11
angewendeten Halbsatz-Ersetzungen aus 300 Entwürfen (Tabakmonopol- und
Tabaksteuergesetz ×7, B-VG ×3, LFG, RAO) setzen die Grenze an das richtige
Zeichen, der Rest des Satzes steht unversehrt dahinter.

Über dc9e52f bis 45be622, gleicher Aufruf: Verweigerungen 336 → 319,
identisch 849 → **864**, halb angewendet 52 → 48, **eigene Abweichung
unverändert 15**, ohne Verweigerung abweichend 12 → 12; „kein geltender
Text" ohne Verweigerung 19 → 20, beide Zugänge Unterschiede, die vorher neben
einer Verweigerung standen. Entwürfe vom Anhang bestätigt 602 → 614;
Annex-Drift in jedem Schritt ohne Befund.

**Nachtrag, derselbe Tag.** Was danach noch offen stand, trug drei stille
Fehler, und alle drei hatte eine spätere Verweigerung **derselben Zeile**
verdeckt: Solange ein Satzteil scheiterte, wurde die ganze Zeile
verweigert; sobald er gelesen wurde, lief die falsche Hälfte davor mit. Die
Lehre für die Messung: Eine neue Regel, die eine Zeile ganz lesbar macht,
prüft auch deren übrige Teile — und die Zahl, die das zeigt, ist „kein
geltender Text" ohne Verweigerung, nicht „identisch".

- **Die Zerlegung schnitt Aufzählungen.** `splitCompound` teilte an jedem
  „und" mit einem Verb links und rechts: „entfallen die Z 2 und 3; im
  Schlussteil …" strich nur Z 2, „die Absatzbezeichnungen ‚(3)' und ‚(4)'"
  benannte Abs. 7 und 8 beide in (3) um, und ein Verb *im Zitat* zählte als
  Verb der Anordnung. Eine Konjunktion vor einer bloßen Bezeichnung oder vor
  einem Zitat setzt jetzt eine Aufzählung fort.
- **Eine Adresse hinter ihrem Verb** („… wird in den Z 5 und 7 lit. a …",
  „entfällt nach Abs. 2 der Abs. 3") galt als ein Ort, weil `onePlace` bis
  zum *ersten* Verb der Zeile prüfte, das vor ihr stand. Das strich in einem
  Entwurf Abs. 2 statt Abs. 3. Jetzt bis zum Verb hinter der Adresse; die
  Zeilen sind verweigert.
- **Die Nutzlast „§ 24. (1) …" unter „§ 24 Abs. 1 lautet:"** legte den
  ganzen § in den Absatz (RAO § 24) — jetzt auf die genannte Einheit
  ausgepackt, wo jeder Schritt der Adresse genau eine findet.
- **Gedankenstriche eine `ebene` tiefer** gehören zur Ziffer davor. Als
  Ziffern daneben gelesen, ersetzte „§ 4 Abs. 4 Z 8 lautet:" die Ziffer und
  ließ ihre alten Striche stehen (EStG) — 178 solche Striche im Prüfstand.

Dazu gelesen: „folgender Schlussteil angefügt", mehrere Einfügungen unter
einem „eingefügt", die Einträge des Inhaltsverzeichnisses als ganze Zeile.
Über b020075 bis 87f01a7: identisch 864 → **884**, eigene Abweichung 15 →
**13**, Verweigerungen 319 → 288, „kein geltender Text" ohne Verweigerung
20 → 18; vom Anhang bestätigt 614 → 621; Annex-Drift ohne Befund.

**Die Einzelfälle, je eine Zeile (30.09.2026).** Der Posten „bewusst
verweigert" hielt zehn Zeilen, von denen keine eine Klasse ist. Gelesen wird
seither nur, was eine Regel trägt, die sonst nirgends greift — geprüft als
Alt-gegen-Neu-Lesung über alle 10.464 Anweisungszeilen, die vorliegen (300
Entwürfe aus `.cache/novao`, die 150 des ME-Prüfstands, die Zeilen des
Sammelnovellen-Prüfstands): **13 Zeilen lesen sich anders, jede davon
gelesen.**

- **Zwei Sätze einer Einheit** („das Wort ‚…' im ersten und letzten Satz
  wird jeweils …") sind zwei Orte einer Textoperation, der Ausdruck in jedem
  genau einmal (AsylG 2005 § 22). Die Suche nach der Form fand zwei ältere
  stille Fehler: „im ersten und im zweiten Satz" las nur den zweiten, weil
  der Artikel dazwischen das Paar brach (Hochschulgesetz-Entwurf § 38c, vom
  Anhang bis dahin widersprochen, jetzt bestätigt), und „entfallen der
  zweite und der vierte Satz" wie „der vorletzte und der letzte Satz"
  strichen nur den zuletzt genannten. **Eine Einheitenoperation über zwei
  Sätze bleibt verweigert**: nacheinander ausgeführt, verschiebt die erste
  Streichung die Zählung der zweiten. Auch eine Textoperation kann eine
  Satzgrenze setzen („das Wort ‚ oder' durch einen Punkt"), deshalb läuft
  zuerst die Stelle, deren Änderung die andere nicht verschiebt: von vorn
  gezählt die spätere, bei „vorletzter und letzter" der vorletzte;
  „zweiter und vorletzter" hat keine sichere Reihenfolge und bleibt
  verweigert, ebenso das in Worten genannte Zeichen, dessen Zweig nur ein
  Ziel liest. Im BFA-VG § 52 Abs. 3 nennt die Novelle den ersten und
  zweiten Satz, das Wort steht im ersten und dritten — das RIS hat nach dem
  Sinn konsolidiert, die Engine verweigert.
- **Zwei Sätze unter einem Partizip** („… wird jeweils durch ‚B' und der
  Ausdruck ‚C' wird durch ‚D' ersetzt") sind zwei Anordnungen; als eine
  galt der Ort der ersten, zwei Sätze, auch für die zweite, und „C" wurde in
  einem Satz gesucht, in dem es nicht steht. Getrennt wird nur, wo rechts
  ein ganzer Satz mit eigenem Subjekt und eigenem „wird" steht — eine Zeile
  im Korpus. AsylG § 22 ist damit wortgleich bis auf eine überzählige
  schließende Klammer im RIS-Text, die die Novelle nicht setzt; der
  Prüfstand bucht ihn deshalb als „unvollständig", nicht als identisch.
- **Ein durch ein Leerzeichen zerbrochenes Hauptwort** („Wortfolg e",
  „Wortfol ge", „Wend ung" — drei Zeilen) wird außerhalb der Zitate wieder
  zusammengesetzt, nie darin: ein Operand bleibt, wie er gedruckt ist.
  Kontenregister- und Konteneinschaugesetz § 1 ist jetzt identisch; die
  Strafvollzugs-Zeile bleibt verweigert, weil ihre Zitate selbst zerbrochen
  sind („d ass", ein Anführungszeichen an falscher Stelle) und sich die
  Operanden nicht paaren lassen.
- **„In § 10 entfällt nach Abs. 2 der Abs. 3."** Die Ortsangabe fällt nur
  weg, wo sie nichts sagt als das: Die genannte Einheit steht unmittelbar
  vor der gestrichenen, auf derselben Ebene. „nach Abs. 7 der Absatz mit
  der Bezeichnung ‚(6)'" — eine Zählung außer der Reihe — ist ein zweiter
  Ort; und ein doppeltes „Abs. 3" verweigert `uniqueChild`. Der
  Seilbahn-Entwurf § 10 ist jetzt vom Anhang bestätigt und anzeigbar.
- **„der bisherige Abs. 8 als Abs. 9 bezeichnet"** ist eine Umbenennung ohne
  Zitat, nur auf derselben Ebene; „durch Abs. 11 bezeichnet" (eine Zeile)
  wird nicht gelesen, die Präposition der Ersetzung ist keine des Namens. Die
  Einfügung dahinter legte eine ältere Lücke frei: **Eine neue Untereinheit,
  deren Nutzlast keine eigene Bezeichnung druckt, ging ohne Nummer und ohne
  Text in den Baum und meldete Erfolg** — die Zeile stand als Überschrift
  da. Der Zweig für Paragraphen verweigert das seit jeher, der für Absatz,
  Ziffer und Litera nicht; jetzt tut er es. Der Bundesstraßengesetz-Entwurf
  § 7 bleibt damit verweigert, aus dem richtigen Grund. Die Regel steht
  deshalb vor der Umbenennung: in umgekehrter Reihenfolge wäre der § für
  einen Schritt unverweigert und ohne seinen neuen Absatz gewesen.

Über die sechs Schritte, `--discover=40 --sammel --cache`: Verweigerungen
288 → 286, identisch 884 → **885**, halb angewendet 46 → 45, **eigene
Abweichung unverändert 13, ohne Verweigerung abweichend unverändert 10**,
„kein geltender Text" ohne Verweigerung unverändert 18. Entwürfe
(`--discover=120 --cache`): gelesen 2.597 → 2.601, vom Anhang bestätigt
621 → **623**. Annex-Drift unverändert, beide Pfade.

**Weiter verweigert, mit Absicht:** IESG §§ 17a–43 (eine Kette
ineinandergreifender Umbauten), Hauptstück- und Abschnittsüberschriften und
UStG „Art. 21 Abs. 2 (Anhang) … zweiter Unterabsatz" (der Baum hat keine
Ebene dafür), AsylG § 72 „in den Z 5 und 7 lit. a" (Ziele auf zwei Ebenen),
AsylG § 36 „der Klammerausdruck nach dem Wort ‚Binnengrenzen'" (das alte
Zitat stünde nur im geltenden Text, und keine zweite Zeile trägt die Form),
EStG § 24 Abs. 7 „lautet … der zweite Halbsatz nach dem Strichpunkt ‚…'"
(der neue Text in der Zeile statt als Nutzlast; ein Entwurf ohne
Prüfsignal).

**Eine Lücke des Orakels, offen:** Der Seilbahn-§ 10 galt schon als
„bestätigt", als er verweigert war und sein Abs. 3 noch stand. Die Beilage
streicht ihn in einer *geänderten* Zeile, und die drei Enthaltensein-Proben
fragen, ob die vorgeschlagene Fassung im Ergebnis steht — nicht, ob das
Ergebnis mehr enthält. Hier harmlos, weil verweigert; ohne Verweigerung
hätte nur noch die Plausibilität die fehlende Streichung aufhalten können.

### 12.12a Die Lesefassung auf der Seite — und was das Tor kostet

Gebaut 19.09.2026: `server/utils/kons/konsGate.ts` (das Tor, rein und getestet),
`konsService.ts` (Nitro-Glue), `/api/drafts/:gp/:inr/konsolidiert` — und am
selben Abend **von einem eigenen Abschnitt zu einer dritten Schicht am
Paragraphen umgebaut**.

**Der eigene Abschnitt war eine Dopplung, und das ließ sich nachrechnen.** Er
stand als „Wie das Gesetz danach lauten würde" unter der Gegenüberstellung,
mit der Begründung, die Beilage beantworte die größere Frage für mehr
Paragraphen. Das stimmt, verfehlt aber den Einwand, den ein Leser sofort hat:
*Ist das nicht dasselbe?* Gemessen an 126/ME stehen **32 von 32** Paragraphen
der Lesefassung auch in der Gegenüberstellung — und das ist kein Zufall,
sondern Konstruktion: Das Tor zeigt nur, was die Beilage bestätigt, die
Lesefassung ist also **immer** eine Teilmenge. Zwei Blöcke mit derselben
Gesetzessprache untereinander, und der Unterschied war eine Erklärung im
Kleingedruckten.

**Der Unterschied ist trotzdem echt — und die Zahl dazu trägt jetzt die
Anzeige.** Die Beilage druckt den geänderten Absatz und kürzt den Rest des
Paragraphen zu „(2) bis (5) …": bei **26 der 32** Paragraphen von 126/ME, in
Zeichen **18.068 gegen 48.611**. Bei 132/ME 2 von 3 und 3.476 gegen 11.247.
Die Lesefassung zeigt also nicht dieselbe Stelle noch einmal, sondern die
Teile, die die Beilage weggelassen hat — aus dem authentischen RIS-Text statt
aus der Abschrift des Ressorts. „Diese Wortfolge wird ersetzt" gegen „so
liest sich die Bestimmung dann".

**Daraus folgt der Ort: am Paragraphen, nicht darunter.** Der § trägt jetzt
drei zugeklappte Schichten in einer Reihenfolge, die der Frage folgt, die ein
Leser stellt — *was ändert sich* (die Zeilen), *warum* (§12.30), *wie lautet
er dann*. Die dritte ist die seltenste (Median 12 % der Paragraphen eines
Entwurfs), deshalb steht sie unten und nicht oben.

**Der Nenner musste mitwandern**, sonst wäre die Bilanz verloren gegangen:
Über der Liste steht jetzt ein Satz, der beides tut — er sagt an, dass es die
Schicht überhaupt gibt (sonst findet sie nur, wer zufällig klickt), und nennt
die Deckung: „Bei 32 von 61 geänderten Paragraphen steht unten auch, wie die
Bestimmung danach ganz lautet … Wo das fehlt, ist der Paragraph nicht
unverändert, sondern ungeprüft."

**Der Schlüssel ist der des Tors, nicht ein zweiter.** `ConsolidatedParagraph`
trägt seit dem Umbau `annexLaw` — die Gesetzeszeile der Beilage („Änderung des
Richter- und Staatsanwaltschaftsdienstgesetzes"), nicht den Kurztitel
(„Richter- und Staatsanwaltschaftsdienstgesetz"), und `null`, wo das Tor den
Anhang ohne Gesetz befragt hat. Die Seite schlägt damit unter genau dem
Schlüssel nach, unter dem der § geprüft wurde; ein zweiter Schlüssel wäre eine
zweite Gelegenheit, dass beide auseinanderlaufen (dieselbe Regel wie §12.30).

**Eine Eigenschaft, die bleibt und richtig ist:** Zeigt eine Gesetzesgruppe
nur die ersten 30 Änderungen, fehlen die Paragraphen dahinter — und mit ihnen
ihre Lesefassung. An 126/ME sind das 4 von 32, sichtbar nach „Alle anzeigen".
Die Schicht folgt dem Paragraphen, zu dem sie gehört; sie hat keine eigene
Liste mehr, in der sie ihn überholen könnte.

**Zwei Befunde vom Umbau selbst, beide auf der Seite gesehen und dann
gemessen.**

*Der ganze Paragraph war ganz und sah nicht so aus.* Angezeigt wurde die
**Vergleichsform** des Textes — `plainText`, die „(1)", „3." und „b)" weglässt,
weil die Beilage ihre Marker anders setzt und ein Vergleich sonst an
Typografie scheitert (`tguOracle.stripMarkers` tut auf der anderen Seite
dasselbe). Für ein Urteil ist das richtig, für einen Gesetzestext ist es
fatal: § 54c des AVMD-G stand als ein Block Prosa ohne eine einzige
Absatznummer, und wer ihn neben der Beilage las — die „(1) …", „(1a) …"
druckt —, musste schließen, dass Teile fehlen. Sie fehlten nie: Der Text
trägt 4.066 Zeichen gegen 3.496 der geltenden Fassung, das Ende ist der
letzte Absatz. Seit 19.09.2026 gibt es deshalb **zwei Formen aus demselben
Baum**: `plainText` für das Orakel, `bodyText` für die Anzeige. Dieselbe
Trennung wie überall sonst im Haus, nur war sie hier nie gezogen worden —
§ 54c zeigt jetzt (1), (1a), (1b), (2) bis (5), § 69 achtzehn Absätze.

*„x Stellen unverändert" bleibt, auch wo die Lesefassung steht.* Die
Kontextzeile faltet die unveränderten Zeilen EINES Paragraphen, und die stehen
auch in der Lesefassung darunter — an 126/ME an 24 der 46 §§ mit Kontextzeile.
Sie kurz wegzulassen war naheliegend und falsch (probiert und zurückgenommen
am 19.09.2026): Es sind zwei Auskünfte, nicht eine. Die Kontextzeile zeigt,
**was das Ressort unverändert abgedruckt hat**, in der Spaltenlogik der
Beilage; die Lesefassung zeigt **unseren Text aus dem RIS**. Wer die Beilage
liest, liest die erste Frage; wer wissen will, wie die Bestimmung danach
lautet, klappt die zweite auf.

*Die Reihenfolge am § folgt der Frage, nicht der Datenherkunft.* Der
Aufklapper steht **unter** den geänderten Zeilen, nicht über ihnen: Die Zeilen
sind die Auskunft, wegen der jemand den § aufschlägt, der ganze Paragraph ist
die Anschlussfrage. Die Begründung (§12.30) bleibt oben, weil sie zur
Änderung gehört und nicht zum Ergebnis. Am § steht damit: Zeilen → Begründung
darüber, Lesefassung darunter.

*Und ein Absatz je Absatz.* `bodyText` trennt die Absätze mit einem
Zeilenumbruch, der Wortdiff normalisiert Weißraum — in den Segmenten war er
weg (0 von 3 gemessen). Ein § mit achtzehn Absätzen stand deshalb als eine
Wand, „(1) … (2) … (3) …" im Fließtext: die Marker zurück, die Gliederung
noch nicht. Getrennt wird jetzt an der Marke selbst, ohne die Segmentgrenzen
zu verletzen — ein eingefügter Absatz bleibt grün, auch wenn er einen eigenen
Block bekommt. Die Marke ist `(1)`, `(2a)`; „(EU) 2018/1808" trifft sie nicht
(Buchstaben), „Abs. 1" auch nicht (keine Klammern), und beide stehen im selben
Text daneben.

**Und eine Ziffer je Ziffer — gemessen, 26.09.2026.** Der Absatz war die
halbe Antwort. 1.051 von 3.433 Paragraphen (30,6 %) führen gar keine
Absatzmarke, und wer Ziffern trägt, stand weiter als Wand: § 111 RStDG, 2.792
Zeichen, bei 390 px rund 40 Zeilen. Die naheliegende zweite Regel geht nicht,
weil `1.` nicht selbstbegrenzend ist — „mit 1. Jänner 2027 in Kraft" trägt
dieselbe Form mitten im Satz. Was hilft, entscheidet kein Nachdenken, sondern
ein Korpus.

**Das Orakel liegt im Text selbst**, und darum kostet die Messung nichts
Zusätzliches: jeder `\n` in `bodyText` IST eine Blockgrenze, vom Baum
gesetzt, und die Anzeige sieht denselben Text ohne Umbrüche. Umbrüche
entfernen, die Kandidatenregel darauf laufen lassen, ihre Trennstellen gegen
die des Baums halten (`scripts/corpus/absatzMarker.ts`, `pnpm
corpus:absatz-marker`). Korpus: 3.433 Paragraphen aus 30 Gesetzen, die
Entwürfe der laufenden Periode ändern — 15.257 Blockgrenzen, davon 14.642
(96 %) überhaupt an einer Marke.

| Regel | gefunden | erfunden | §§ mit Erfindung |
| --- | --- | --- | --- |
| nur `(1)` (bis 26.09.) | 49,7 % | 3 | 3 (0,1 %) |
| jede Form `n.` | 92,9 % | 2.411 | 465 (13,5 %) |
| aufsteigende Ziffern ab 1 | 88,8 % | 173 | 35 (1,0 %) |
| dazu Litera | 95,5 % | 191 | 48 (1,4 %) |
| **dazu die Ausnahmen — ausgeliefert** | **95,5 %** | **14** | **8 (0,2 %)** |

Die naive Regel ist damit widerlegt: sie zerreißt in jedem siebenten
Paragraphen einen laufenden Satz des geltenden Rechts. Die aufsteigende Folge
ab 1 allein — der Vorschlag, mit dem die Frage in `TODO.md` stand — reicht
auch nicht, sie erfindet noch in jedem hundertsten. Drei Ausnahmen bringen
das auf 14 Stellen in 8 Paragraphen, und zwei dieser acht gehen auf die
Absatzregel zurück, die schon vorher stand („(247a)" als Verweisung in StGB
§ 52b): eine Zahl, hinter der ein Monatsname, eine Ordnungszahl-Einheit
(„6. Abschnitt", „2. Klasse") oder ein Jahrgang steht, ist keine Ziffer; eine
Zahl, vor der „Abs.", „Z", „§" oder „mit" steht, ist eine Verweisung; und
eine Literafolge unmittelbar hinter einer Ziffer steht im Fließtext DIESER
Ziffer, wo das RIS die Untergliederung nicht ausgezeichnet hat — die fällt
ganz, nicht nur ihr „a)", sonst bekäme „b)" einen Block und „a)" keinen.

**Verworfen, und zwar gemessen:** zusätzlich zu verlangen, dass das Wort
DAVOR einen Block abschließt. Das kostet 892 echte Grenzen (95,5 % → 89,4 %)
und spart gegenüber den Ausnahmen keine einzige Erfindung mehr.

Absatzgrenzen übersieht keine dieser Regeln — 0 von 7.278 in jeder Zeile.
Was die 4,5 % Rest ausmacht, sind Ziffernlisten, die nicht bei 1 anfangen,
und Schlussteile, die im Text gar kein Zeichen tragen, an dem sie zu erkennen
wären. An 126/ME gemessen: von 33 gezeigten Paragraphen steht seitdem keiner
mehr als Wand über 900 Zeichen, § 111 RStDG liest sich als sechs Blöcke. Die
Messung ruft die **ausgelieferte** Funktion auf (`blockStarts` in
`app/utils/absaetze.ts`), nicht einen Nachbau davon; die widerlegten
Varianten liegen im Skript, weil es sie sonst nirgends mehr gäbe.

**Das Tor ist das Modul, nicht die Funktion.** Drei Signale, und keines
reicht allein: keine Verweigerung, plausibel (`applyGuard`), vom Anhang
bestätigt (`tguOracle`). Es liegt in `server/utils` mit Tests, weil Befund 0
dieser Sektion sich sonst wiederholt — die urteilende Hälfte eines
Prüfstands, die in `scripts/` liegt, wird von keinem Typecheck erfasst.

**Was die Seite an einem echten Entwurf zeigt** (126/ME, Einführung einer
Bundesstaatsanwaltschaft, am laufenden Server gemessen): 32 von 61
Paragraphen, der Rest benannt statt verschwiegen — 18× eine Anweisung nicht
sicher anwendbar, 5× Anhang widerspricht, 4× unplausibel, 2× Anhang schweigt.
Über vier geprüfte Entwürfe: einer zeigt 32/61, einer 16/32, einer 0/28 („für
keinen Paragraphen bestätigt"), einer gar nichts, weil er ein Stammgesetz ist.
Warm 10 ms, kalt rund 12 s — deshalb clientseitig nachgeladen wie die
Vergleichsabschnitte, mit Tagescache.

**Die Bilanz unter der Liste ist kein Kleingedrucktes, sondern die Hälfte der
Aussage.** „Gezeigt sind 32 von 61 Paragraphen, die dieser Entwurf ändert.
Was hier fehlt, ist deshalb nicht unverändert — es ist ungeprüft." Ohne
diesen Satz liest sich eine Liste mit 12 % Deckung (der Median) wie „der Rest
bleibt, wie er ist", und das ist die eine Aussage, die diese Seite nie machen
darf (§12.27).

*Drei Nachbesserungen am selben Tag, alle drei an der Ehrlichkeit der
Anzeige und keine davon an ihrem Aussehen.*

1. **Ein gefangener Fehler wurde als Urteil zwischengespeichert** — genau der
   Fehler, gegen den `annexGuardService.ts` seinen eigenen Kommentar
   geschrieben hat. `resolveKonsLaw` und der §-Abruf standen hier mit
   `.catch(() => null)`, also machte ein RIS-Schluckauf aus einem Ausfall
   einen Befund über den Entwurf („18 × Eine Anweisung ließ sich nicht sicher
   anwenden") und legte ihn für einen Tag in den Cache. Jetzt steht der Abruf
   außerhalb des try und der Parse darin: Ein RIS, das nicht antwortet, wirft
   und die Sektion meldet sich unverfügbar; ein Dokument, das wir bekommen und
   nicht lesen können, ist null — eine stabile Eigenschaft dieses Dokuments.
2. **Die eigene Obergrenze gab sich als Verweigerung der Engine aus.** Was
   `MAX_PARAGRAPHS`/`MAX_LAWS` nicht mehr lädt, zählte als „Anweisung ließ
   sich nicht sicher anwenden". Auf einer großen Sammelnovelle (74/ME, 242
   geänderte Paragraphen) waren das **130 von 242** zurückgehaltenen
   Paragraphen — mehr als die Hälfte der Bilanz war eine falsche Aussage über
   die Engine. Eigener Grund, eigener Satz. Und die Artikel jenseits von
   `MAX_LAWS` fehlten bis dahin ganz im *Nenner*: Ein Entwurf mit fünfzehn
   Gesetzen behauptete, weniger Paragraphen zu ändern, als er ändert.
3. **Der Nenner ist jetzt getestet.** „Gezeigt sind 32 von 61" ist eine
   Aussage und keine Zwischenrechnung, also liegt sie rein und mit Tests in
   `konsGate.addressedParagraphs` — samt der Regel, die man beim Aufräumen
   zuerst kaputtmacht: **Eine Verweigerung nimmt den Paragraphen nicht aus dem
   Nenner.** Sonst stünde „12 von 12" über einer Liste, die den halben Entwurf
   verschweigt.

*Zwei Fehler, die erst der Screenshot zeigte, beide in der Typografie und
beide inhaltlich.* `plainText` eines Paragraphen beginnt mit seiner
Überschrift, also klebte sie am ersten Satz („Aufbau der Staatsanwaltschaften
Am Sitz jedes …"); Überschrift und Rumpf werden jetzt getrennt gediffed, was
die geänderte Überschrift zur auffälligsten Änderung macht, die sie ist. Und
ein `uppercase` auf der Bezeichnung machte aus „§ 212b" ein „§ 212B" —
streng genommen ein anderer Paragraph.

**Was die Deckung begrenzt — gemessen am 19.09.2026, und die naheliegende
Abkürzung gibt es nicht.** Über 15 Entwürfe der GP XXVIII zeigt das Tor **45
von 452 geänderten Paragraphen (10,0 %)**. Die Gründe, gezählt:

| Grund | n | von wem |
|---|---|---|
| Eine Anweisung ließ sich nicht sicher anwenden | 121 | uns |
| Mehr Paragraphen, als wir für eine Seite laden | 121 | uns |
| Die Beilage sagt zu diesem § nichts Prüfbares | 82 | dem Dokument |
| Keine lesbare Beilage | 39 | dem Dokument |
| Die Beilage widerspricht unserem Ergebnis | 22 | beiden |
| Plausibilitätsprüfung nicht bestanden | 22 | uns |

Das las sich nach einem billigen Gewinn: 264 der 407 zurückgehaltenen §§
gehen auf unsere eigenen Grenzen. **Beide Versuche, ihn zu heben, haben
nichts gebracht, und das ist der eigentliche Befund.**

*Erstens: die §§ überspringen, zu denen die Beilage schweigt.* Ihr Ausgang
steht fest, bevor ein Dokument geholt ist — also sie gar nicht erst holen und
das Budget für die anderen ausgeben. Das Ergebnis war **weniger** Deckung (45
→ 41): `applyNovelle` wendet die Anweisungen auf den *gesamten* geladenen
Bestand an, und eine Anweisung, deren Anker-§ fehlt, scheitert. An 100/ME
stieg „nicht sicher anwendbar" dadurch von 8 auf 11. Geblieben ist nur die
Reihenfolge: Wenn das Budget beißt, holt es die vom Anhang gedeckten §§
zuerst. Am Bestand ändert das nichts, solange es reicht.

*Zweitens: die Kappen heben.* „Mehr Paragraphen, als wir für eine Seite
laden" kommt nicht von `MAX_PARAGRAPHS` (80), sondern von `MAX_LAWS` (12) —
alle §§ ab dem dreizehnten Gesetz eines Sammelgesetzes. Mit `MAX_LAWS = 40`
verschwindet der Grund vollständig (30/ME: 66 → 0) und die Anzeige gewinnt
**keinen einzigen Paragraphen**: Die 66 verteilen sich auf „die Beilage
schweigt" (+26) und „nicht sicher anwendbar" (+31). Gekostet hätte es die
doppelte Antwortzeit (17,7 s → 33,1 s bei 30/ME). Also bleibt die Kappe bei
12 — sie verdeckt nichts Zeigbares, und ihr Satz sagt, was sie ist.

**Woran es wirklich liegt, ist die Anweisungsgrammatik**, und die ist
Fleißarbeit, kein Schalter. Über alle 140 Entwürfe der GP XXVIII liest die
Engine **5.714 von 6.362 Novellierungsanordnungen (89,8 %)**. Die 648
abgewiesenen, nach Häufigkeit: keine auflösbare Adresse (174), kein bekanntes
Verb (73), vier Operanden mit unklarer Paarbildung (52), Einfügung ohne Anker
und Text (44), Ersetzung ohne zwei Operanden (44).

*Ein Fall darin ist scharf umrissen:* **45 Abweisungen adressieren „Artikel
&lt;römisch&gt; § n"** — ein Gesetz, das selbst in Artikel gegliedert ist.
Reproduzierbar an `parseAddressList`: `§ 3 Abs. 2` wird gelesen, `Artikel II
§ 3 Abs. 2` nicht. **26 davon in einem einzigen Entwurf** (40/ME), der deshalb
bei 0 von 26 Anweisungen steht.

**Die Sicherheitsfrage davor ist beantwortet, und sie macht aus dem
Einzeiler ein kleines Vorhaben** (gemessen 19.09.2026): RIS führt die §§
solcher Gesetze **mit dem Artikel im Etikett** — das
Lebensmittelbewirtschaftungsgesetz 1997 hat „Art. 2 § 1", „Art. 2 § 2",
„Art. 2 § 3" …, keine doppelten Bezeichnungen. Zwei Folgen:

1. Den Artikel einfach wegzulassen wäre nicht nur unsicher, es funktionierte
   gar nicht: Gesucht würde „§ 3", und unter diesem Etikett führt RIS in
   diesem Gesetz nichts.
2. Die Schreibweise unterscheidet sich obendrein — der Entwurf schreibt
   römisch („Artikel II"), RIS arabisch („Art. 2").

Zu bauen ist also nicht ein Ausdruck, sondern eine **artikelqualifizierte
Paragraphenidentität**: in der Adresse (`novao.ts`), im Etikett, mit dem
`konsService` das §-Dokument sucht (römisch → arabisch), und im Schlüssel, mit
dem Tor und Orakel den § in der Beilage wiederfinden — die Beilage schreibt
„§ 3." ohne Artikel, also braucht auch sie den Kontext.

**Gebaut am 25.09.2026, und es waren vier Stellen, nicht drei.** Die vierte
stand hinter der Verweigerung und war von ihr verdeckt: `parseKonsParagraph`
las die Kennung aus der *ersten* Zahl des Gliederungssymbols, und „Art. 2 § 3"
kam damit als Kennung „2" an — als Zwilling des § 2 desselben Gesetzes. Solange
`novao.ts` jede Adresse in ein solches Gesetz abwies, fragte nie jemand danach;
mit dem ersten Schritt allein wäre daraus ein falscher § mit richtig
aussehendem Text geworden. Das ist das Muster, das diese Klasse teuer macht:
Eine Verweigerung hält nicht nur eine Anzeige zurück, sie hält auch alles
ungeprüft, was hinter ihr liegt.

Die Teile, jeder mit Tests: die Adresse trägt den Artikel **neben** der
Bezeichnung und nicht in ihr (`NovaoAddress.artikel`, arabisch normalisiert),
weil jeder Leser der Bezeichnung — `bareParaId`, das „§ 3." der Beilage, der
Nenner — den § allein will; `text/designation.articleNumberKey` verbindet
römisch und arabisch und gibt für eine Zahl, die es nicht lesen kann, `null`
zurück, was an jeder Aufrufstelle eine Verweigerung ist; `addressedLabels`
(`konsGate.ts`) liefert das RIS-Etikett je § und **verweigert den ganzen
Artikel**, sobald zwei adressierte §§ unter verschiedenen Artikeln dieselbe
Nummer tragen — der Bestand hängt an der nackten Kennung, zwei Dokumente unter
einem Schlüssel wären der erste, der für beide antwortet.

**Zwei Regeln, die beim Messen entstanden und beide eine Verengung sind.**
Erstens muss der § **unmittelbar** hinter dem Artikel stehen. „Art. n"
irgendwo vor einem § trifft auch ein Zitat („In Umsetzung von Art. 5 der
Richtlinie wird in § 3 …"), und `PARA_RE` liest das Zitat dann als Ziel: die
Änderung ginge an § 5 statt an § 3. Diese Form behält die Verweigerung, die
sie immer hatte — geöffnet wurde nur die anliegende. Zweitens **füllt eine
abgewiesene Zeile eine Lücke, widerspricht aber nie**: sie erzeugt weder
Operation noch Knoten, kann also keinen zweiten Bestand anlegen, und sie am
Konflikt teilnehmen zu lassen kostete 116/ME eines seiner 65 Gesetze an einer
Zeile, deren § anderswo einwandfrei adressiert war.

**Der Ertrag, gemessen — und er ist nicht der, der hier vorhergesagt stand.**
Über die 6.576 Anweisungen des Korpus (300 Entwürfe): 5.554 → **5.584**
vollständig gelesen, „keine auflösbare Adresse" 407 → **376**. An 40/ME
stimmt der Nenner erstmals (14 → **20** geänderte §§), 18 §-Dokumente werden
gefunden, geladen und angewandt, 33 von 36 Anweisungen greifen. **Gezeigt
wird weiterhin nichts**, und das lag nie am Artikel: Das Orakel prüft, ob die
geltende Spalte der Beilage als *zusammenhängende* Zeichenfolge im
Ausgangstext steht, und auf dem PDF-Pfad ist eine Zeile ein **ganzer
Paragraph**. Wo das Ressort darin unveränderte Strecken auslässt („1. ...
oder 2. ...", „(2) bis (4) ..."), ist die Zeile unser § mit Löchern, und die
Enthaltung kann nicht gelten; dazu stellt der PDF-Pfad die Gruppenüberschrift
(„Lenkungsmaßnahmen") voran, die RIS dem §-Text bewusst nicht zurechnet. Der
Tabellenpfad trifft das nicht, weil er am Absatz schneidet und die
ausgelassenen Zeilen mit `elided` kennzeichnet (126/ME: 272 Zeilen gegen 20).
**Der PDF-Pfad an sich ist nicht das Hindernis** — 88/ME wird daraus geprüft
und bestätigt zwei §§; das Hindernis ist die Auslassung *innerhalb* einer
Ganz-§-Zeile. Steht als eigener Posten in `TODO.md` § 5a.

Womit die Klasse nachträglich dorthin gehört, wo die anderen Restfehlerklassen
schon stehen: Sie hebt **nicht** die Anzeige, sondern die Menge dessen, was
überhaupt geprüft werden kann — plus einen verdeckten Fehler, der ohne sie
verdeckt geblieben wäre. Die Vorhersage „hebt, was das Tor zeigen kann" war
falsch, und sie war es, weil die Beilage lesbar war und daraus geschlossen
wurde, sie sei auch *feinkörnig genug*. Lesbarkeit und Korngröße sind zwei
Eigenschaften.

**Die Binnenauslassung ist gemessen und segmentiert (25.09.2026).** Erst die
Häufigkeit, denn sie entscheidet, ob die Klasse überhaupt gebaut gehört: über
die 400 jüngsten Begut-Sätze tragen **84 der 95 Entwürfe** mit lesbarer
PDF-Beilage (88,4 %) mindestens eine Substanzzeile mit einer Auslassungsmarke,
und **1.835 der 2.950 Substanzzeilen** (62,2 %) sind selbst eine; in der
vorgeschlagenen Spalte 1.801 (61,1 %). Auf dem Tabellenpfad, wo eine Zeile ein
Absatz ist, sind es 29 von 118 Entwürfen und 98 von 6.168 Zeilen (1,6 %). Die
Binnenauslassung ist also keine Randerscheinung des PDF-Pfads, sondern seine
Normalform — das Messgerät steht als `pnpm corpus:inner-elision`.

**Was die Segmentierung einbringt**, gemessen durch dieselbe Funktion, die der
Server benutzt (`annex/elision.ts`, `printedStretches`): Von den 1.585
markierten Zeilen, deren Paragraph sich im RIS auflösen lässt, bestand Check 1
vorher **0**, nachher **697 (44,0 %)**; auf dem Tabellenpfad 3 von 66 gegen
**58 (87,9 %)**. Dazu die Zusicherung, die das Ganze zu einer
Verallgemeinerung macht statt zu einer Lockerung: über die 3.550 Zeilen
**ohne** Marke urteilen alte und neue Prüfung Zeichen für Zeichen gleich —
**0 Abweichungen**. Eine Zelle ohne Marke kommt ungeteilt zurück, und die
einleitende Bezeichnungskette wird nur einer Strecke genommen, auf die eine
Marke *folgt*: „… gemäß § 5 Abs. 3" am Ende einer Zelle ist Gesetzestext, keine
Ankündigung.

**Beide Enthaltungsprüfungen, nicht nur die erste** — und das ist keine
Gründlichkeit, sondern die Bedingung dafür, dass der Umbau überhaupt etwas
bringt. Check 2 hält die vorgeschlagene Spalte gegen unser Ergebnis und hatte
dasselbe Problem, von demselben Ressort in derselben Zeile erzeugt. Nur
Check 1 zu öffnen hätte die Paragraphen aus `fremd` herausgeholt, damit sie
unmittelbar an Check 2 scheitern — und die Seite hätte dem Leser dann „die
Beilage widerspricht" gesagt, wo das Ressort bloß Text weggelassen hat. Eine
falsche Zurechnung ist schlechter als gar keine.

**In Reihenfolge und ohne Überlappung**, sonst wäre es keine Prüfung mehr:
drei einzeln nachgeschlagene Strecken dürften überall stehen, und eine Zelle,
deren Absätze in der falschen Ordnung ankommen — was eine falsch gelesene
Seite erzeugt —, ginge durch. Der Index wandert deshalb mit.

**Am Tor, Ende zu Ende** (laufender Server, 15 Entwürfe, vorher gegen nachher
am selben Tag): gezeigte Paragraphen **4 → 58** von 851 adressierten, 14 der
Entwürfe mit lesbarer Beilage. 40/ME, der Fall, an dem die Klasse gefunden
wurde, zeigt erstmals etwas — **0 → 4 von 20** (§§ 3, 4, 21, 25); 108/ME
0 → 11 von 92, 128/ME 0 → 8 von 28, 97/ME 0 → 5 von 15, 25/ME 2 → 9 von 22.
Drei bleiben bei null (81, 85 und der Tabellenpfad-Entwurf 77): die Klasse war
nicht die einzige Ursache, und diesmal steht die Vorhersage neben der Messung
statt vor ihr.

**Was jetzt bremst, ist der Kopf der Zeile — eine andere Ursache, gemessen und
nicht mitgebaut.** 888 der 1.585 Zeilen hängen weiter an Check 1, und der
Rest, an dem sie hängen, ist fast durchwegs derselbe: „1. Kapitel Allgemeine
Bestimmungen Verfahren für die Antragstellung", „3. Abschnitt Antragstellung
Inhalt des Mehrfachantrags" — der Stapel Gruppenüberschriften, den der
PDF-Pfad der Zeile voranstellt und den RIS dem §-Text bewusst nicht zurechnet.
**Der naheliegende Schnitt ist gemessen und zu grob:** alles vor der eigenen
Kennung der Zeile wegzunehmen hebt Check 1 auf 1.204 (76,0 %), schneidet aber
dort, wo eine Zeile ihren eigenen Paragraphen *zitiert*, 472 Zeichen echten
Textes weg und mitten in eine Auslassungskette hinein — aus „§ 1. bis § 3. …"
wird „bis". Den RIS-Kontext mitzugeben, also die Gruppenüberschriften, die
`fetchParagraphTree` als `context` führt, bringt **4 Zeilen** und damit
nichts. Eigener Posten in `TODO.md` § 5a.

**Auf dem Telefon angesehen — 25.09.2026, und die Schicht hält bis auf eine
Stelle.** Geprüft war sie bis dahin nur bei 1.100 px. Bei 390 px und bei
320 px läuft nichts über (`scrollWidth` gleich `clientWidth`, kein Element
rechts aus dem Bild), die Silbentrennung greift, der Aufklapper, die Fußnote
„Nicht amtliche Lesefassung" und die Überschrift des § sitzen richtig. Die
Messung braucht echte Viewport-Emulation: Chromes Fenster hat auf dem Mac
eine Untergrenze von rund 500 px, ein „390-px-Screenshot" ist sonst ein
Ausschnitt aus einem 500-px-Layout (`Emulation.setDeviceMetricsOverride`
über CDP kennt die Grenze nicht).

**Was nicht hält, ist der Befund vom 19.09. eine Ebene tiefer.** Der
Absatzschnitt (`absaetze.ts`) trennt an `(1)`, `(2a)`. § 111 RStDG hat
**keinen einzigen Absatzmarker** — er ist nach Ziffern gegliedert („1. das
Oberlandesgericht Wien … 5. der Oberste Gerichtshof …"), 2.792 Zeichen — und
steht deshalb als ein Block: bei 390 px rund 40 Zeilen, bei 320 px rund 55.
Die Ursache ist dieselbe wie damals: Die Segmente tragen **0
Zeilenumbrüche**, die Marke überlebt, die Gliederung nicht. Häufigkeit an
126/ME: 5 von 31 Paragraphen führen gar keinen Absatzmarker, 13 von 31
tragen Ziffern innerhalb ihrer Absätze.

**Der naheliegende Einzeiler ist nicht gebaut, und das ist die
Entscheidung.** `1.` ist nicht selbstbegrenzend wie `(1)`: „mit 1. Jänner
2027 in Kraft" würde einen Satz mitten durchschneiden, und ein falsch
gegliederter Gesetzestext ist schlimmer als eine Wand — dieselbe Lehre wie
bei den zwei zurückgenommenen Abkürzungen oben. Die sichere Regel (nur
schneiden, wo die Ziffern eine aufsteigende Folge ab 1 bilden) ist eine
Korpusmessung über die Lesefassungen einer GP, kein Abend. Steht als offener
Posten in `TODO.md` § 5d.

**Der Kopf der Ganz-§-Zeile: zwei Regeln, und die zweite ist eine Wache
(26.09.2026).** Der Posten stand seit dem 25.09. mit einer Zahl daneben: Nach
der Segmentierung an den Auslassungsmarken bestand Check 1 des Orakels 697
von 1.585 markierten Zeilen des PDF-Pfads, und an **888** hing weiter der
Kopf, den die Beilage vor die Zeile stellt. Zwei Kandidaten waren gemessen
und beide untauglich (alles vor der eigenen Kennung wegschneiden: 1.204, aber
472 Zeichen echten Textes verloren; den RIS-Kontext mitgeben: 4 Zeilen).
Gesucht war die strukturelle Regel. Es sind zwei, und sie liegen an ganz
verschiedenen Stellen.

*Die erste ist ein Anker, der zu eng geworden war.* `stripMarkers` warf die
Paragraphenkennung nur am **Anfang** der Zelle weg. Das war richtig, solange
eine Zelle ein Absatz ist — dort kann „§ 5." nur zuerst stehen. Auf dem
PDF-Pfad ist eine Zelle ein ganzer Paragraph, und die Beilage druckt die
Überschrift **vor** die Kennung: „Spielbedingungen und Vertrieb § 16. (1) Der
Konzessionär hat …". Die Kennung stand also mitten in der Zelle und blieb
stehen — gegen einen RIS-Text, der sie nie trägt (`konsTree` führt sie als
`marker`, `plainText` druckt sie nicht). Sie fällt jetzt überall, und weil
beide Seiten durch dieselbe Funktion gehen, bleibt der Vergleich symmetrisch.

*Die zweite ist der Stapel selbst.* „3. Abschnitt Antragstellung Inhalt des
Mehrfachantrags § 34. …" — die Gruppenüberschriften stehen über dem §, RIS
hält sie bewusst aus seinem Text heraus (`context`), und **es nützt nichts,
RIS danach zu fragen**: bei den gemessenen Fällen ist `context` leer, die
Überschriften wohnen in den Dokumenten der Gruppe, nicht im § . Also von der
Zeile her: Was vor dem eigenen Anfang des geltenden Textes steht, darf weg —
**wenn es mit einer Gruppeneinheit öffnet und kein eigenes Satzzeichen
trägt**. Diese Wache ist die halbe Regel. Ohne sie fiele auch der Schwanz des
vorigen Paragraphen mit („beträgt 75 000 € je Förderwerber Ausmaß der
Förderung"), und eine Zeile mit fremdem Text bestünde genau die Prüfung, die
fremden Text finden soll: über 60 Entwürfe lässt die Wache 24 echte Stapel
durch und weist 5 solche Zeilen ab.

| Check 1, PDF-Pfad (400 Entwürfe) | vorher | nachher |
|---|---|---|
| markierte Zeilen bestanden | 697 von 1.585 | **1.030 (65,0 %)** |
| Zeilen ohne Marke: neu bestanden | — | 48 |
| Zeilen ohne Marke: verloren | — | **0** |
| Tabellenpfad, markiert | 58 von 66 | 58 (+1 unmarkiert, 0 verloren) |

**Und dann maß das Messgerät das Falsche — zum zweiten Mal in dieser Woche.**
Der erste Ende-zu-Ende-Lauf über 120 Entwürfe zeigte **261 → 262** anzeigbare
Paragraphen, also nichts. Der Grund lag nicht am Ertrag, sondern am
Prüfstand: `harness/me.ts` las die Beilage **nur als XML** und buchte alles
andere als „Scan" oder „ohne Textgegenüberstellung" — 26 und 21 der 120
Entwürfe. Genau dort liegt der PDF-Pfad. Die Seite selbst liest ihn seit
jeher (`annex/annexPdfService.ts` über `kons/konsService.ts`), der Prüfstand
also gegen eine Auswahl, in der die Verbesserung gar nicht vorkommen konnte.
Mit dem PDF-Pfad im Prüfstand, derselbe Korpus, dasselbe Kommando:

| 120 Entwürfe, Ende zu Ende | vorher | nachher |
|---|---|---|
| **vom Anhang bestätigt — was heute anzeigbar wäre** | 359 (25,2 %) | **508 (35,7 %)** |
| plausibel, Orakel „fremd" | 216 | **99** |
| unplausibel, Orakel „fremd" | 128 | **86** |
| plausibel, Orakel „widersprochen" | 151 | 119 |
| unplausibel, Orakel „widersprochen" | 197 | 229 |
| unplausibel, Orakel bestätigt | 42 | 52 |

**149 Paragraphen mehr, die die Seite zeigen darf**, und die Bewegung liest
sich wie sie soll: „fremd" — wir konnten die geltende Spalte nicht einmal
lesen — schrumpft um 159, und was dabei herauskommt, ist überwiegend
Bestätigung, zum kleineren Teil ein Widerspruch, der vorher hinter der
Unlesbarkeit steckte und jetzt benannt ist. Der Engine-Prüfstand
(`harness:kons`) bleibt **Zeile für Zeile identisch** — richtig so, das
Orakel urteilt über das Ergebnis, es erzeugt keines. Drift über beide
Beilagenpfade ohne Befund.

**Nebenbei fiel eine Kopie** (`corpus/innerElision.ts`): Die Prüfung stand
dort ein zweites Mal, Zeichen für Zeichen dieselbe, damit der Vorher-Wert
erhalten bleibt. Das war einmal richtig und wurde in dem Augenblick falsch,
in dem die Prüfung um eine Regel wuchs — eine Messung, die eine Kopie misst,
berichtet den Ertrag des Servers nicht. Das Skript ruft jetzt
`unaccountedStretch` selbst auf.

### 12.12b Der Besondere Teil als zweites Verifikationssignal — gemessen, und er trägt nicht

Die teuerste offene Frage des Pakets ist, ob es neben der
Textgegenüberstellung ein zweites, unabhängiges Signal gibt: Ohne eines
bleibt die Hälfte der Entwürfe dauerhaft bei null Paragraphen, per
Konstruktion und nicht wegen der Engine. Der nächstliegende Kandidat ist der
**Besondere Teil der Erläuterungen** — er adressiert seine Passagen mit
derselben Adresse, die das Werkzeug ohnehin berechnet (§12.30), und er kommt
vom Ressort, nicht von uns. Gemessen am 19.09.2026 über denselben
40-Entwürfe-Korpus (`pnpm harness:me -- --discover=40 --erl --dump=…`), 413
erzeugte Paragraphen.

**Die Deckung ist gut — und das ist die Hälfte, die nichts kostet.** 293 von
413 Paragraphen (71 %) tragen eine Passage des Besonderen Teils. Wo der
Anhang nichts sagt (197 Paragraphen), sind es immer noch 108 (55 %), und
unter den dort plausiblen und unverweigerten 133 sind es 73. Wäre die Passage
ein Urteil, verdoppelte sie die Anzeige.

**Der Inhalt trägt nicht.** Nur 73 der 293 Passagen (25 %) zitieren
überhaupt Text, und von 180 Zitaten stehen **128 (71 %) weder im geltenden
noch im vorgeschlagenen Paragraphen** — sie zitieren Richtlinientitel,
Legaldefinitionen, andere Gesetze. Eine Regel „jedes Zitat der Begründung
muss in unserem Ergebnis vorkommen" widerspräche also fast überall, und zwar
zu Unrecht.

**Und das wortweise Signal trennt nicht.** Geprüft wurde die schwächere,
bessere Variante: Wie viele der Wörter, die die Engine *eingefügt* hat,
kommen in der Begründung vor? Als Wahrheit dient das Urteil des Anhangs.

| Regel „zeigen, wenn Deckung ≥ t" | bestätigt | widersprochen | Präzision |
|---|---|---|---|
| t = 0 (Basisrate) | 93 | 58 | 0,62 |
| t = 0,5 | 67 | 38 | 0,64 |
| t = 0,75 | 48 | 23 | 0,68 |
| t = 1,0 (jedes eingefügte Wort) | 32 | 14 | **0,70** |

Von 0,62 auf 0,70, und dafür zwei Drittel der Paragraphen verworfen. Das ist
kein Tor, das ist Rauschen mit einer Schwelle. Zum Vergleich: Der Anhang
selbst liefert unter den von ihm bestätigten Paragraphen im BGBl-Korpus
**null** Abweichungen.

*Zwei Vorbehalte, die zum Ergebnis gehören.* Erstens ist „widersprochen" des
Anhangs nicht dasselbe wie „die Engine irrt" — gemessen sind darunter auch
Tippfehler der Beilage und Granularitätsartefakte. Das Etikett rauscht, aber
es rauscht in beide Richtungen und rettet 0,62 → 0,70 nicht. Zweitens wäre
die strenge Fassung dieser Messung der BGBl-Prüfstand mit seiner echten
Wahrheit statt des Anhangs; das ist eine eigene Messung und lohnt erst, wenn
ein Kandidat überhaupt Trennschärfe zeigt.

**Was daraus folgt, auch für den Antrag.** Der Forschungs-Task „zweites
Verifikationssignal" bleibt offen, aber er ist um seinen billigsten Kandidaten
ärmer, und das ist ein Ergebnis und kein Verlust: Ein halber Tag Messung
erspart es, 100–150 Stunden gegen eine Annahme zu budgetieren, die sich in
einer Tabelle widerlegen lässt. Was der Besondere Teil dagegen sehr wohl
kann, ist **Kontext statt Urteil** — er steht seit 18.09.2026 am Paragraphen
der Gegenüberstellung, und seine 55 % Deckung dort, wo der Anhang schweigt,
sind das, was ein Leser bekommt, wenn wir ihm keinen Gesetzestext zeigen
dürfen.

### 12.13 „Was ändert der Entwurf?" — die amtliche Gegenüberstellung auf der Seite

Geliefert 2026-09-08, und zwar aus dem amtlichen Anhang, nicht aus der
Engine: `server/utils/annex/comparisonRows.ts` (Parser der XML-Tabelle),
`annexPdf.ts` (Seitengeometrie), `annex/` (das Tor),
`annexDraft.ts` (welche Paragraphen eine Novellierungsanordnung adressiert —
der Bezug von Regel 2), `textComparisonService.ts` (Nitro-Glue),
`/api/drafts/:gp/:inr/gegenueberstellung`,
`app/components/compare/TextComparisonSection.vue`. In GP XXVIII zeigt die Seite die
Gegenüberstellung für **109 von 132 Entwürfen** — 65 aus der XML-Tabelle,
44 aus der Textebene des PDF, seit beide Quellen angeschlossen sind
(2026-09-09, weiter unten). Die 65 sind die Zahl, mit der das hier begann.

**Warum diese Sektion über dem Textvergleich steht.** Der ME→RV-Vergleich
braucht eine Regierungsvorlage und kommt Monate später; die
Gegenüberstellung liegt am ersten Tag der Begutachtung vor — also dann, wenn
eine Stellungnahme noch etwas ändern kann. Sie beantwortet damit die Frage,
die jemand *vor* dem Schreiben hat, und nicht die Frage danach. Auf der Seite
ist sie deshalb die dritte Frage der Sequenz: worum geht es → was ändert der
Entwurf → was wurde daraus.

**Die Wortwahl ist keine Erfindung, sondern ein Nachschlagewerk** — dieselbe
Lektion wie bei den sprechenden Namen (§12.11). Die Spaltentitel *Geltende
Fassung* und *Vorgeschlagene Fassung* schreibt ein BKA-Rundschreiben vom
27.03.2002 vor; für eine berechnete, unverbindliche Fassung ist *nicht
amtliche konsolidierte Lesefassung* der etablierte deutschsprachige Begriff.
Die Seite braucht also weder „geprüft" noch „ungeprüft": solange die Quelle
der amtliche Anhang ist, steht dort schlicht, wessen Dokument man liest.

**Die Markierung des Ressorts ist verlässlich, aber unvollständig.** Von
8.430 Zeilenpaaren sind 3 hervorgehoben ohne Textunterschied, aber 1.395
unterscheiden sich ohne Hervorhebung. Angezeigt wird deshalb der berechnete
Wortdiff (vollständig, und dieselbe rot/grün-Sprache wie §12.10); die gelbe
Markierung wird mitgelesen, aber nicht verlassen.

**Der ausgelieferte Pfad war nie gemessen (2026-09-09).** Geprüft wurde die
Beilage nur auf dem *nicht* ausgelieferten PDF-Weg, und der Grund war die
Architektur: die Urteilslogik lag in `scripts/harness/annexPdf.ts`, also dort,
wo sie weder getestet noch angewendet werden kann — dieselbe Lektion wie bei
`applyReport.ts`, zum zweiten Mal. Sie liegt jetzt in
`server/utils/annex/` (rein, testbar), der Prüfstand bekommt `--xml`,
und beide Pfade messen mit demselben Maßstab: die linke Spalte behauptet, das
geltende Recht zu sein, und das RIS hält diesen Text unabhängig.

| GP XXVIII, Paragraphen mit Fließtext | ≥ 99 % gedeckt | < 80 % |
|---|---|---|
| XML-Beilagen | 86,9 % | 4,7 % |
| PDF-Beilagen (Textebene) | 70,2 % | — |

Der ausgelieferte Pfad ist damit *besser* als der PDF-Pfad, nicht schlechter.
Die 4,7 % sind trotzdem die gefährlichste Restklasse des Projekts, weil sie
ausgeliefert wird: 45 Paragraphen, 29 davon unter 50 % Deckung, jeder als
Wortdiff auf der Seite, über einem geltenden Text, zu dem die Zeile nicht
gehört — falsch gepaart oder gegen einen überholten Stand des Gesetzes
gestellt.

**Das Tor, drei Urteile je Paragraph.** `annexGuardService.ts` hält jeden
Paragraphen gegen RIS Bundesrecht, zum `BeginnBegutachtungsfrist` — dem Tag,
an dem das Ressort die Beilage geschrieben hat.

- **bestätigt**, wenn der Paragraph genug Fließtext für ein Urteil trug
  *und* der geltende Text ihn deckt. Nur das. Es ist eine Behauptung, die
  wir aufstellen, kein Standardwert.
- **einbehalten**, wenn der geltende Text die Spalte nicht deckt. Text und
  Wortdiff werden im Server geleert, nicht in der Komponente versteckt: eine
  falsche Gegenüberstellung darf von keinem Client darstellbar sein.
- **ungeprüft** in jedem anderen Fall — keine Stammnorm (ein Entwurf, der
  neues Recht schafft, hat keine; eine Verordnung steht nicht im
  Bundesrecht), kein solcher Paragraph im RIS, der RIS-Paragraph ist eine
  Tabelle, die Zeile zeigt zu wenig Text, die Zeile trägt gar keine
  Paragraphenangabe, oder die Prüfung lief nicht. Wird gezeigt und als
  ungeprüft benannt. Das zu verweigern hätte gesunde Arbeit weggeworfen,
  ohne etwas sicherer zu machen; „geprüft und falsch" und „nicht prüfbar"
  sind verschiedene Zustände.

Dazu **auffällig** für ein Gesetz, dessen Paragraphen gehäuft abweichen: ein
Satz für die Leserin, keine Einbehaltung. Wer 95 % Deckung über echten
Fließtext erreicht, hat das nicht zufällig getan — bei einem abweichenden
Stand sind also genau die unveränderten Paragraphen richtig, und ihre
Diffs auch. Eine erste Fassung verweigerte das ganze Gesetz und behielt 59
Paragraphen ein, die einzeln gegen RIS bestanden hatten. Ein Anteil braucht
außerdem einen Nenner: 14 der ursprünglich 18 Markierungen betrafen
Gesetze mit einem oder zwei geprüften Paragraphen.

Und **ein vierter Zustand über der ganzen Beilage**: `ran` sagt, ob überhaupt
ein Paragraph gegen RIS gehalten wurde, `notRunReason` warum nicht — „im RIS
fehlt der Beginn der Begutachtungsfrist", „der Entwurf schafft neues Recht
oder ist eine Verordnung", „die Gesetze der Beilage ließen sich nicht
abgrenzen". Ohne das kann die Seite „nichts konnte geprüft werden" nicht von
„nichts ist durchgefallen" unterscheiden: beide zählen null.

Wirkung über die 126 RIS-Datensätze mit lesbarer XML-Beilage (Stand
2026-09-10): 1.054 Paragraphen gegen das RIS gehalten, 1.040 davon mit genug
Fließtext für ein Urteil — 967 bestätigt, 73 einbehalten; weitere 764 werden
als ungeprüft gezeigt. **Kein gezeigter Paragraph** liegt noch unter der
Schwelle. Kalte Antwortzeit 8,3 s bei 400 Zeilen; die Sektion lädt
nachgelagert.

**Beide Quellen sind angeschlossen (2026-09-09).** Wo die RIS-XML eine echte
Tabelle ist, wird sie dort gelesen; wo RIS die Beilage in Bilder gerastert
hat, trägt das PDF desselben Dokuments den Text weiter, und `annexPdfService.ts`
liest die Zeilen aus der Seitengeometrie. Beide Parser liefern
`ComparisonRow`, also gilt alles danach — Prüfung, Zahlen, Sektion —
unverändert. Damit zeigt die GP XXVIII 109 von 132 Entwürfen statt 65, und
keine Absage lautet mehr „nur als Scan": von den 23 übrigen tragen 21 keine
Beilage und 2 haben keinen RIS-Datensatz.

| | Entwürfe | geprüft | bestätigt | einbehalten | Gesetze markiert |
|---|---:|---:|---:|---:|---:|
| XML-Tabelle | 65 | 651 | 618 (94,9 %) | 33 | 3 |
| PDF-Textebene | 44 | 821 | 676 (82,3 %) | 145 | 21 |

Das ist der Grund, warum das Tor zuerst kommen musste: der PDF-Pfad ist
messbar rauer, weil seine Zeilen erschlossen und nicht gelesen sind. Ohne
Tor wären das 145 Paragraphen mit fremdem Text auf der Seite; mit Tor keine
einzige — über alle 132 Entwürfe trägt keine einbehaltene Zeile noch Text.

Zwei Zurechnungen hängen daran. 21 der 24 markierten Gesetze liegen auf dem
PDF-Pfad, und dort ist eine Häufung mindestens so wahrscheinlich *unsere*
Zeilenzuordnung wie ein abweichender Stand beim Ressort — der Satz auf der
Seite nennt deshalb beide Ursachen, je nach `readFrom`. Und auf dem PDF-Pfad
sagt die Sektion offen, dass nicht nur die Markierung von uns kommt, sondern
auch die Zuordnung der Zeilen: „die Tabelle des Ressorts" und „der Text des
Ressorts, von uns gelesen" sind nicht dieselbe Behauptung.

*Was es kostet.* Der dynamische Import hält pdf.js (1,7 MB von 7,02 MB
Bundle) aus dem Startpfad; nur 44 der 132 Entwürfe brauchen es. Gegen den
gebauten Server gemessen: 52 MB Resident nach zwölf gleichzeitigen Anfragen,
sieben davon auf dem PDF-Pfad, 46 MB nach allen 132. Die Bytes werden nur im
Dev gecacht, wie die RIS-Ergebnisseiten — in Produktion hält der abgeleitete
Vergleich einen Tag, also wird jede Beilage höchstens einmal täglich geholt,
und alle 44 resident zu halten wäre dieselbe Rechnung, die die Rohseiten aus
dem Produktionsspeicher genommen hat.

**Die Schwellen sind gemessen, nicht gesetzt.** `MIN_PROSE_TOKENS` stammte
aus der Bewertung einzelner *Zeilen* und ließ jeden Paragraphen unter 15
vergleichbaren Wörtern ungeprüft durch. Die Bande 5–14 Wörter umfasst 66
Paragraphen und bestätigt mit 89 % genauso gut wie das Gesamtfeld — sieben
davon wurden zu Unrecht entschuldigt; die Bande 1–4 ist Rauschen, weil dort
ein fehlendes Wort 75 % bedeutet, und fällt zur Hälfte durch. Also fünf
(`--calibrate`).

**Ein Fallstrick beim Ausrollen, teuer und stumm.** Ein neues Feld auf
`RisBegutFlat` machte den persistierten Nitro-Cache still falsch: die
gespeicherten Datensätze hatten das Feld nicht, und ein fehlendes Feld liest
sich als „dieser Entwurf hat keine Textgegenüberstellung" — eine falsche
Antwort, keine veraltete, und das bis zu 20 Stunden nach dem Deploy. *Korrektur
2026-09-10:* hier stand, beide Cache-Schlüssel trügen jetzt
`CORPUS_SHAPE_VERSION` und seien bei jeder Formänderung hochzuzählen. Diese
Konstante existiert nicht mehr — die Trennung der Cache-Ebenen hat sie noch
am selben Tag ersetzt (§5). `flattenRisRecord` entscheidet, ob ein Entwurf
eine Beilage hat, also ist der Korpus etwas, das **wir** gemacht haben, und
`ris-begut-corpus` trägt `base: DERIVED_CACHE`: er liegt im Speicher und
stirbt mit dem Worker beziehungsweise mit `systemctl restart`. Persistent
bleiben nur die RIS-Rohseiten darunter, deren Form uns nicht gehört. Damit
ist der Fallstrick weg, ohne dass jemand einen Zähler erinnern muss —
`tests/cacheLayers.test.ts` hält jede neue gecachte Funktion an dieselbe
Entscheidung.

**Das Tor stand offen, wo niemand hingesehen hatte (2026-09-10).** Gemessen
war bisher die *Deckung* — welcher Anteil der linken Spalte im RIS steht —,
nicht die *Entscheidung*, die daraus folgt. Die Entscheidung lag im Service
und lautete `unchecked.has(key) ? 'unchecked' : 'verified'`: geprüft, außer
die Prüfung hat ausdrücklich widersprochen. Damit war „geprüft" der
Standardwert und kein Befund, und über die GP XXVIII trugen ihn:

- **21 Entwürfe, bei denen überhaupt kein Paragraph geprüft wurde** (6 auf
  dem Tabellen-, 15 auf dem PDF-Pfad) — jede Zeile davon als geprüft
  ausgeliefert;
- **83 Zeilen, die als Änderung gezeigt werden und gar keine
  Paragraphenangabe tragen**, also von keinem Urteil erreichbar sind (285
  Zeilen ohne Angabe insgesamt; auf dem PDF-Pfad 125, davon keine als
  Änderung gezeigt);
- **jeder Paragraph, der nachgeschlagen, aber nie beurteilt wurde** — kein
  Eintrag im RIS, RIS-Paragraph als Tabelle, zu wenig vergleichbarer Text,
  oder das Gesetz kam gar nicht erst zustande.

Ehrlich gezählt verschiebt das auf dem Tabellenpfad 180 Paragraphen von
„bestätigt" nach „ungeprüft" (584 → 764); 967 bleiben, die wirklich geprüft
und bestätigt sind.

Die Urteilslogik liegt jetzt vollständig in `annex/`: `verifyAnnex`
gibt eine Urteilstabelle je Paragraph zurück statt zweier Listen, und
`checkAnnexRows` setzt sie auf die Zeilen. Beide sind rein und getestet, der
Service macht nur noch I/O. Der Prüfstand ruft dieselben zwei Funktionen auf
(`harness/annexPdf.ts`, `runGate`) und prüft drei Zusicherungen über den
Korpus, die alle auf null stehen müssen und stehen: keine als geprüft
ausgelieferte Zeile ohne bestätigtes Urteil, kein Paragraph ohne Eintrag in
der Urteilstabelle, keine einbehaltene Zeile mit Text.

Damit sieht das Tor über die ganze GP XXVIII so aus (RIS-Begut-Population,
also einschließlich der Verordnungen — nicht die 132 Entwürfe des
Parlaments):

| 2026-09-10 | Entwürfe | bestätigt | einbehalten | ungeprüft | ohne jede Prüfung |
|---|---:|---:|---:|---:|---:|
| XML-Tabelle | 117 | 967 | 73 | 764 | 6 |
| PDF-Textebene | 96 | 895 | 198 | 2.388 | 15 |

Der PDF-Pfad ist auch hier der rauere: viermal so viele Paragraphen bleiben
ungeprüft, und die Ursachen stehen jetzt beim Namen — sechsmal „das RIS
Bundesrecht führt diese Paragraphen nicht", viermal „der geltende Paragraph
steht im RIS als Tabelle".

**Drei Fehler derselben Familie, mitgefunden.**

1. *„§ 5" fand „§ 5a".* Die Paragraphensuche baute aus der Kennung ein
   Präfix-Muster (`^§+\s*5(?![.\d])`) und nahm das erste passende RIS-Label —
   und dieses Muster passt auf **„§ 5a"**. Welcher der beiden Paragraphen
   gewann, entschied die Reihenfolge des RIS. Von 195.000 Labels im
   Zwischenspeicher tragen 34.000 einen Buchstabenzusatz, das ist kein
   Randfall. `designationKey` normalisiert und vergleicht jetzt exakt und
   liest dabei auch die Formen, die das Präfix-Muster nie traf: „§ 373i1"
   (zwei Provisionen, beide zu „373i" verkürzt), „Anl. 1/59" (nicht
   „Anl. 1"), „Art. 3 § 5" (ein Paragraph eines artikelgegliederten Gesetzes,
   der genau wie in der Engine unerreichbar bleiben *muss*). Auf dem
   Tabellenpfad sinkt die Zahl der einbehaltenen Paragraphen damit von 90 auf
   73 — Paragraphen, die gegen den Text eines *anderen* Paragraphen gemessen
   worden waren.
2. *Schwache Zuordnungen zeigten fremde Beilagen.* Die Sektion zeigte die
   Beilage zu jedem RIS-Datensatz mit `risId`, also auch zu `matched_weak` —
   Tier C, das nur über Fristen und Ressort zuordnet und den Titel gar nicht
   liest (`ris-join.md` §3a). Das ist der eine Fehler, den die RIS-Prüfung
   prinzipiell nicht fangen kann: die Beilage eines *anderen* Entwurfs zitiert
   das geltende Recht genauso getreu, besteht also jede Deckungsprüfung. Es
   ist selten (1 von 132 Entwürfen in der GP XXVIII, 1 von 350 in der GP
   XXVII) und deshalb gerade gefährlich. Jetzt verlangt die Sektion
   `status === 'matched'`; sonst nennt sie die Unsicherheit und verlinkt den
   Datensatz, damit die Leserin selbst nachsehen kann.
3. *Ein Ausfall wurde als Auskunft gecacht.* Jeder Aufruf im Service endete
   auf `.catch(() => null)`, und die Antwort daraus liegt 24 Stunden im
   Cache. Ein Timeout beim RIS wurde damit zu „Der Entwurf ließ sich keinem
   RIS-Dokument zuordnen", zu „liegt nur als Scan vor" (mitsamt Umschwenken
   auf den PDF-Pfad) oder zu einer Gegenüberstellung mit stillgelegtem Tor —
   einen Tag lang, als Tatsache über den Entwurf formuliert. Die Regel ist
   jetzt eine Zeile: **echte Zustände antworten, Ausfälle werfen.** Kein
   RIS-Datensatz, keine Beilage, ein Scan ohne PDF, ein Dokument, das kein
   Parser lesen kann — das sind Antworten und werden gecacht. Alles andere
   fliegt bis in die Route, die Sektion sagt „gerade nicht verfügbar", und der
   nächste Aufruf versucht es erneut. Auch `resolveKonsLaw` fängt nicht mehr:
   „das Gesetz gibt es nicht" ist eine cachebare Null, „das RIS antwortet
   nicht" ist keine.

**Was das Tor findet, muss auch dastehen (2026-09-10).** Das Tor unterscheidet
seit einem Tag drei Urteile, die Sektion sagte davon eines: Sie druckte einen
Satz nur, wenn mindestens ein Paragraph beurteilt worden war — und schwieg in
genau den 21 Entwürfen, in denen *nichts* geprüft werden konnte. Schweigen ist
auf einer Seite, die sonst über ihre Prüfungen berichtet, keine Enthaltung,
sondern ein Unbedenklichkeitszeugnis. Der Satz steht jetzt immer, im
Nichtprüf-Fall mit dem Grund aus `notRunReason` („die Beilage nennt keine
Paragraphen", „im RIS fehlt der Beginn der Begutachtungsfrist"), und er nennt
das **Datum**: geprüft wird gegen den Stand zum Beginn der Begutachtungsfrist,
nicht gegen heute (`verification.asOf`).

Drei Zahlen daran waren mehrdeutig oder alarmierend:

- *Einheiten.* „N Stellen werden nicht gezeigt" zählte Paragraphen, las sich
  aber als Zeilen — der Hinweis im Block daneben zählt Zeilen („2 Änderungen
  hier nicht gezeigt"). Jetzt nennt jeder Satzteil seine Einheit.
- *„ließen sich nicht prüfen"* zählte jeden Paragraphen ohne Urteil, also auch
  die, die keines brauchen: ein Paragraph, der nur Unverändertes zeigt, ist
  ohnehin eingeklappt, und ein **neu geschaffener** hat keinen geltenden Text
  — das ist sein Zweck, kein Mangel. Gezählt werden jetzt nur Paragraphen, die
  eine Änderung zeigen und kein Urteil tragen (`checkAnnexRows`).
- *Die Zählpille am Gesetzeskopf* zählte einbehaltene Zeilen mit, `stats` nicht
  — die Überschrift konnte „12 geändert" sagen, wo der Block darunter drei
  davon als nicht gezeigt auswies.

Dazu zwei Zurechnungen: der Einbehalt-Hinweis nennt auf dem PDF-Pfad *unsere*
Zeilenzuordnung als mögliche Ursache, so wie es der Auffällig-Satz schon tat;
und die Sektion verlinkt „Wie wir prüfen" auf `/so-funktionierts#gegenueberstellung`,
wo Herkunft (Rundschreiben 27.03.2002), Markierung, Prüfung und die beiden
Wörter „nicht gezeigt" und „nicht geprüft" einmal ausführlich stehen.

**„Nicht im RIS" ist nicht „gibt es nicht" (2026-09-10).** Der Service las die
Beilage ausschließlich über den RIS-Datensatz und schrieb sonst „Keine
Textgegenüberstellung: Sie ist nicht verpflichtend …" — eine Aussage über den
Entwurf, hergeleitet aus einer Eigenschaft *einer* Quelle. Gemessen über die
GP XXVIII: bei **11 der 130 zugeordneten Entwürfe** trägt die Dokumentenliste
des Parlaments eine Textgegenüberstellung, während der RIS-Datensatz keine hat
(8 davon auch als HTML, 3 nur als Bild-PDF). Auf einer Seite, deren ganzer
Anspruch das Nachverfolgen von Dokumenten ist, ist das die schlechteste Art
von falscher Antwort. Der Service fragt jetzt die Parlaments-Dokumentenliste
(`getGegenstand` + `mapDocuments`, dasselbe Muster wie `findDiffSources`),
bevor er so etwas behauptet — auch beim fehlenden und beim schwach
zugeordneten RIS-Datensatz, wo das Parlaments-Dokument sogar die *bessere*
Quelle ist, weil es unter der Nummer dieses Entwurfs liegt und die Zuordnung
gar nicht erst geraten werden muss. **Gelesen wird es nicht:** ein Parser für
den Parlaments-Anhang ist eigene Arbeit und nicht gebaut; die Zeile
verlinkt ihn.
Der Aufruf passiert nur in diesen Zweigen, also für rund 20 der 132 Entwürfe,
und er fängt keine Fehler — dieselbe Regel wie oben.

**Nachtrag 26.09.2026: Keiner der elf ist ein reiner Parlamentsfall.** Alle
elf Entwürfe, die hier als „beim Parlament, im RIS nicht" gezählt sind,
tragen die Gegenüberstellung auch im RIS-Datensatz — unter einem Namen, den
unsere Regel nicht liest („TGÜ Anpassung QJF-G", „IFG-TGÜ (2025-05-07)").
Der Satz oben stimmt also für das, was der Service sah, und nicht für das, was
das RIS hat. Befund und Folge stehen unten bei der präfixierten Abkürzung
(„Die Abkürzung mitten im Namen").

Und die Absagen werden genauer: sagt ein Parser, *wie* ihn ein Dokument
abgewiesen hat (`ComparisonParse.unreadable`, `AnnexParse.unreadable` — „Das
Dokument ist keine zweispaltige Gegenüberstellung", „Die beiden
Spaltenüberschriften waren nicht zu finden"), steht dieser Satz auf der Seite
statt des allgemeinen „ließ sich nicht auslesen".

**Das Tor prüft jetzt beide Spalten (2026-09-10).** Die Deckungsprüfung ist
einseitig: sie fragt, ob der geltende Paragraph die linke Spalte deckt, nie
ob die linke Spalte den Paragraphen deckt. Text, den der Parser links
*verliert*, kommt damit durch — und der Wortdiff malt ihn rechts grün an, die
Seite behauptet also, der Entwurf füge etwas hinzu, was das Gesetz längst
enthält. Mit Fehlerinjektion über den Korpus gemessen (zweiter Satz der linken
Spalte eines bestätigten Paragraphen gestrichen): **1.019 von 1.092 Fällen
bestehen das einseitige Tor weiterhin, 93,3 %.** Die rechte Spalte galt bis
dahin als unprüfbar. Sie ist es nicht — sie hat zwei Bezugspunkte:

- **„bereits geltend".** Eine als neu gezeigte Strecke von mindestens sechs
  vergleichbaren Wörtern, die als *zusammenhängende Folge* im geltenden
  Paragraphen steht und in der linken Spalte dieses Paragraphen nicht
  vorkommt. Ganze Strecke, zusammenhängend, exakt. Die linke Spalte ist
  ausgenommen, und das ist der Kern: ein bloß *verschobener* Satz steht dort
  und darf nicht melden. Auf dem Tabellenpfad — den eigenen Zellen des
  Ressorts — trifft die Regel 6 Paragraphen, alle echt: WiEReG § 5,
  Ärztegesetz §§ 12 und 12a, Organtransplantationsgesetz § 4, FSG § 26,
  IVS-Gesetz § 3. Vermutlich Beilagen, die gegen einen älteren Stand des
  Gesetzes geschrieben wurden.
- **„nicht im Entwurf".** Der Gesetzestext des Entwurfs liegt im selben
  RIS-Dokument neben der Beilage; jedes Wort, das die Beilage als neu zeigt,
  sollte dort vorkommen — und zwar in den Novellierungsanordnungen, die der
  Entwurf *diesem* Paragraphen widmet (der Bezug war einen Tag lang der ganze
  Entwurf, siehe „Der Bezug ist je Paragraph" unten). Über 1.145 Paragraphen
  mit mindestens zehn neuen Wörtern liegt der Fundanteil im Median bei 100 %
  und bei p10 bei 98 % — der Bezug ist also eng. Einbehalten wird ab **zehn neuen Wörtern, acht
  fehlenden und einem Fundanteil unter 0,9**. Die absolute Untergrenze ist
  nicht Zierrat: sie trennt die sechs echten Verunreinigungen —
  Glücksspielreformgesetz § 56 (89 %, darunter zweimal „daß", also Text von
  vor 1996), Geräte- und Maschinenlärm-VO § 2 (68 %), Bäderhygiene-VO § 36
  (80 %), AVG § 44g (56 %, 39 von 89), Energie-Control-Gesetz §§ 3 und 42 — von den
  Fehlalarmen mit zwei oder drei fehlenden Wörtern (ein Ministeriumsname, eine
  Schreibweise). Ein Anteil allein kann 2 von 12 nicht von 39 von 89
  unterscheiden.

**Keine der beiden Regeln darf etwas bestätigen.** „Bestätigt" heißt jetzt:
die linke Spalte ist durch den geltenden Paragraphen gedeckt *und* keine der
beiden Regeln hat gefeuert. Ein Paragraph ohne beurteilbaren linken Text
bleibt ungeprüft, außer eine Regel feuert — dann wird er einbehalten; ein
eingefügter Paragraph, dessen Text im Entwurf nicht vorkommt, ist genau der
Fall „erfundenes Recht". Umgekehrt darf die Sacktest-Regel niemanden
befördern: Müll aus einem anderen Teil desselben Entwurfs besteht sie mühelos.

**Zwei Varianten gemessen und verworfen**, damit sie niemand neu erfindet.
*Längster gemeinsamer Lauf* einer eingefügten Strecke im Paragraphen fängt
87 % der injizierten Verluste, feuert aber auf 191 Paragraphen des Korpus bei
k = 6 (116 bei k = 8, 60 bei k = 10) — juristische Sprache wiederholt Formeln,
„begeht eine Verwaltungsübertretung und ist von der FMA mit Geldstrafe bis zu
… zu bestrafen" steht 29 Token lang zweimal in BWG § 98. *Satzweise Prüfung*
der rechten Spalte fängt **weniger** als die Ganzstrecken-Regel (423 gegen 540
von 1.074) und holt sich Fehlalarme von rechtmäßig wiederholten Sätzen.

**Was das Tor damit erreicht, ehrlich beziffert** (dieselbe Injektion, 1.092
Paragraphen): Regel 1 fängt **464 (42,5 %)**, Regel 2 fängt 181 derselben
Fälle — ein Satz, den der Parser verliert, ist unverändertes Recht, also
zitieren ihn die Novellierungsanordnungen meist auch nicht —, zusammen
**567 (51,9 %)**. Die linke Prüfung allein fing 73, also 6,7 %.

Von den 628 Fällen, die Regel 1 nicht fängt, sind **464 gar keine Verfehlung**:
Dort ändert der Entwurf genau diesen Satz, seine vorgeschlagene Fassung ist
also wirklich neu, und keine ehrliche Regel darf feuern. 130 sind Formulierungen
der Beilage, die im RIS überhaupt nicht wörtlich stehen; 5 Sätze standen noch
links. Bleiben **29**, bei denen die Wörter im Eingefügten stehen, aber die
Streckengrenzen des Wortdiffs daneben liegen — meist weil der Diff den
verlorenen Satz mit echten Neuerungen zu *einer* längeren Strecke verschmilzt.
Auf der Teilmenge, auf der die Regel überhaupt anwendbar ist, fängt sie 464 von
628, also 74 %.

Das korrigiert eine plausible Vermutung: Ein „semantisches Aufräumen" des
Wortdiffs im Myers-Stil würde die Trefferquote **nicht** nennenswert heben —
das Problem sind nicht zerhackte, sondern zu lange Strecken, und beheben
könnte sie nur der Teillauf-Ansatz, der wegen 191 Fehlalarmen verworfen ist.
29 Fälle sind dieser Preis nicht wert.

**Der Bezug ist je Paragraph (10.09.2026).** Der erste Wurf von Regel 2 hielt
die als neu gezeigten Wörter gegen den *ganzen* Gesetzestext des Entwurfs, und
ein ganzer Entwurf ist blind für den Fehler, der am nächsten liegt: Text, der
aus einer **Nachbar**-Novellierungsanordnung desselben Entwurfs in die rechte
Spalte gerutscht ist, steht im Entwurf — nur an der falschen Stelle. Die
Fehlerinjektion bezifferte diese Blindheit als erste: von den injizierten
Nachbarsätzen (R-neu) fing die Regel 12,0 % auf dem PDF-Pfad und 32,5 % auf dem
Tabellenpfad, ihr schwächster Wert überhaupt.

Der Bezug ist jetzt die Menge der Anordnungen, die den einzelnen Paragraphen
adressieren. `annexDraft.ts` liest die Adressierung — jedes `target`/`anchor`
der Operationen, die neu *geschaffenen* Paragraphen einer Einfügung, die
Bereiche („§§ 7 bis 14"), beide Bezeichnungen einer Umbenennung, die
Gliederungssymbole eines „lautet:"-Textes und die Buchstaben-Unteranordnungen
innerhalb derselben Einheit —, `annex/rightColumn.draftBags` baut daraus die Säcke.
Drei Zutaten halten das ehrlich, und jede ist gemessen:

- **Der allgemeine Sack.** Eine Anordnung, deren Adresse niemand lesen kann,
  geht in einen Sack, den *jeder* Paragraph ihres Gesetzes bekommt. Über GP
  XXVIII nennen **4.686 von 5.007** Anordnungen des PDF-Korpus einen
  Paragraphen (93,6 %) und 2.613 von 2.797 auf dem Tabellenpfad (93,4 %); die
  übrigen dürfen die Prüfung schwächen und niemals einen Paragraphen
  durchfallen lassen.

  Diese Zahlen standen am 10.09.2026 bei 87,1 % und 86,1 %, und die Ursache
  war eine Verwechslung zweier Fragen (11.09.2026). Von den 731 Anordnungen,
  die der PDF-Korpus in den allgemeinen Sack legte, scheiterten nur 185 an
  der **Adresse**; die übrigen 546 hatten eine, die `parseAddressList` bereits
  gelesen hatte, und `parseInstruction` warf sie weg, weil es die **Operation**
  nicht typisieren konnte: „4 Operanden, Paarbildung unklar" (40),
  „3 Operanden" (40), „Ersetzung ohne zwei Operanden" (34), „kein bekanntes
  Verb" (90) und ein langer Schwanz derselben Form. Diese Verweigerungen sind
  für `lawApply.ts` richtig, das die Anweisung *ausführen* muss — für die
  Frage, welche Paragraphen eine Anordnung bedrucken darf, sind sie ohne
  Belang. `novao.refusedAddresses` liest die Adresse deshalb dort noch einmal,
  wo überhaupt keine Operation herauskam, nie *neben* einer: eine
  `toc`-Operation sagt absichtlich, dass sie keinen Paragraphen adressiert.

  Drei eigene Verweigerungen halten das ehrlich, jede am Korpus gemessen,
  denn eine **falsche** Adresse ist schlimmer als keine — sie nimmt die Wörter
  einer Anordnung aus dem allgemeinen Sack, und der Paragraph, dem sie
  wirklich gehören, zeigt sie dann als unerklärt: (1) kein legistisches Verb
  (oder ein Doppelpunkt, der den zitierten Text öffnet) — „der
  Regierungsberater gemäß § 5 Abs. 1 Bundes-Krisensicherheitsgesetz" ist
  Gesetzestext, den das RIS als `novao1` ausgezeichnet hat, und sein § ist ein
  Zitat; (2) ein „§§" im maskierten Kopf, aus dem nur **eine** Bezeichnung
  herauskam — „In den §§ 156 Abs. 2 und 317 Abs. 2 …" nennt zwei Bestimmungen,
  und § 317 verlöre die Wörter; (3) ein Verbundsatz, dessen anderer Teil nicht
  auflöst, denn der Text der Einheit deckt beide Hälften ab. Preis, gemessen:
  das Verb-Tor kostet 5 Anordnungen je Pfad — darunter zwei
  Ressort-Tippfehler („eingfügt", „entfälllt") und zweimal die
  Umbenennungsform „Der bisherige § 9 wird zu § 16.", die absichtlich im
  allgemeinen Sack bleibt (gelesen würde sie die Einheit unter § 9 ablegen,
  während § 16 dieselben Wörter verliert) —, das „§§"-Tor 4 auf dem PDF-Pfad
  und keine auf dem Tabellenpfad, alle vier im Bundesvergabegesetz.

  **Der Rest ist zweierlei, und die Prüfstände zählen es seitdem getrennt.**
  Von den verbliebenen 321 Anordnungen des PDF-Pfads nennen **173 zu Recht**
  keinen Paragraphen — Inhaltsverzeichnis, Titel, Abschnittsüberschrift, eine
  Anordnung an den ganzen Text —, und sie werden es immer tun, gleich was die
  Grammatik noch lernt; ungelesen bleiben **148**. Auf dem Tabellenpfad sind
  es 93 zu Recht und 91 ungelesen. Häufigste Gründe der ungelesenen, über die
  5.497 Anordnungen des PDF-Injektionslaufs: „keine auflösbare Adresse" (185)
  und, weit dahinter, „keine Novellierungsanordnung" (5) und einzelne
  Operanden-Fälle. Die Liste ist damit zugleich eine Aufgabenliste für
  `novao.ts` — und eine kurze.

  Verworfen und gemessen: **»…« wie ein Anführungszeichen zu maskieren.**
  `maskQuotes` maskiert nur "…", ein Zitat in Guillemets wird also als Adresse
  gelesen. Über GP XXVIII benutzen genau **8 Anordnungen** Guillemets, bei 4
  ändert die Maskierung die Adressierung — und nicht einheitlich zum Guten:
  zwei davon sind ganze Anordnungen, die *in* Guillemets stehen, und verlören
  ihren Paragraphen ganz. Für vier Fälle, von denen zwei schlechter würden,
  wird `maskQuotes` nicht angefasst, das die ME→RV-Ebene mitbenutzt.
- **Umbenennungen paaren zwei Bezeichnungen.** „Der bisherige § 3 erhält die
  Paragraphenbezeichnung „§ 4."" macht aus zwei Nummern eine Bestimmung, und
  die beiden Dokumente benutzen verschiedene: die Beilage druckt den
  Paragraphen so, wie das geltende Recht ihn bezeichnet, die folgenden
  Anordnungen adressieren ihn unter der neuen Nummer. Ohne dieses Paar lesen
  sich drei Paragraphen der Straßenverkehrs-Sicherheitsmanagement-Verordnung
  als unerklärt, obwohl an ihnen nichts falsch ist — dazu einer der
  Tierschutz-Sonderhaltungsverordnung, zusammen **4 der 7 Meldungen**, die
  nach der Regel unten noch übrig sind. Gepaart wird ein Schritt weit, nicht
  transitiv — sonst verschmilzt eine Kette („§ 2 wird § 3, § 3 wird § 4, …")
  die ganze Verordnung zu einem Sack und der Bezug ist wieder der alte.
- **Paragraphen ohne eigenen Block in der Beilage sind geerbt, nicht
  fehlend.** Druckt die Beilage keinen Block für § 8, dann fehlt sein Text
  nicht auf der Seite — er steht im Block des § 7, dessen Bezeichnung die
  Zeilen geerbt haben. „Steht nicht im Entwurf" wäre dort der falsche Befund:
  der Entwurf hat den Text, die *Seite* hat zwei Bestimmungen verschmolzen.
  Diese Unterscheidung bringt den Tabellenpfad von **15 Meldungen auf 7**
  (die Umbenennungs-Paare darüber dann von 7 auf 3) — und den PDF-Pfad nur
  von 21 auf 20, was der eigentliche Befund ist: dort *ist* eine Zeile eine
  Bestimmung, am Paragraphenzeichen geschnitten, also hat fast jeder
  Paragraph seinen eigenen Block und die Verschmelzung kann nicht passieren.
  Die Regel entschärft die Meldung; die Verschmelzung selbst blieb, und
  woher sie kommt, steht am Ende dieses Abschnitts („Zwei Bestimmungen unter
  einer Nummer", 11.09.2026).

Was das kostet und bringt, beide Pfade, mit `scripts/harness/faultInjection.ts`
in einem Lauf gemessen (die Schwellen 10 / 8 / 0,9 bleiben unverändert):

Die dritte Spalte ist die Adressierung von 11.09.2026 (93,6 % bzw. 93,4 %),
die zweite die von 10.09.2026 (87,1 % / 86,1 %) — derselbe Bezug, nur besser
adressiert; die Schwellen sind in beiden dieselben. Die Tabellenzeilen der
ersten und dritten Spalte sind seit der geteilten Markup-Regel und der zweiten
Bezeichnung je Zeile (beide unten) über 246/238/237 Stellen gemessen statt
244/236/235: Paragraphen, die die linke
Prüfung vorher an einem zerschnittenen Wort verfehlten, erreichen die
Injektion jetzt. Die PDF-Zeilen zählen 942/905/904 Stellen statt 918/881/880,
seit der Bundsteg aus den Zweispaltenzeilen gelesen wird, ein Gesetz nur vor
seiner ersten Anordnung benannt wird und der Abschlussteil in beiden
Schreibweisen gelesen wird (alle unten).

| Fehler | Regel 2, ganzer Entwurf | je Paragraph, 87 % adressiert | je Paragraph, 93 % adressiert |
|---|---:|---:|---:|
| R-neu (fremder Entwurfssatz), PDF-Pfad | 107 von 904 (11,8 %) | 665 (75,6 %) | **696 (77,0 %)** |
| R-neu, Tabellenpfad | 76 von 237 (32,1 %) | 184 (78,3 %) | **196 (82,7 %)** |
| R-alt (fremder geltender Satz), PDF | 222 von 905 (24,5 %) | 584 (66,3 %) | 596 (65,9 %) |
| R-alt, Tabellenpfad | 98 von 238 (41,2 %) | 178 (75,4 %) | 183 (76,9 %) |
| L (Satzverlust links), PDF | 146 von 942 (15,5 %) | 332 (36,2 %) | 350 (37,2 %) |
| L, Tabellenpfad | 49 von 246 (19,9 %) | 90 (36,9 %) | 95 (38,6 %) |

Zusammen mit Regel 1 steigt die Reichweite gegen den Satzverlust von 49,0 auf
62,1 % (PDF) und von 63,4 auf 69,5 % (Tabelle). **Der Preis** sind Meldungen
auf unversehrten Beilagen: über denselben Korpus 7 → 20 auf dem PDF-Pfad und
0 → 3 auf dem Tabellenpfad. Das ist mehr als eine Handvoll, deshalb wurde
jeder der sechzehn neuen Fälle einzeln gelesen. **Fünfzehn benennen eine
echte Abweichung** zwischen Beilage und Entwurf; der sechzehnte ist unsere
eigene Bezeichnungslesung:

- **Vier Paragraphen, die der Entwurf überhaupt nicht anordnet** —
  Niederlassungs- und Aufenthaltsgesetz §§ 58 und 58a (die Beilage zeigt dort
  einen eingefügten Satz, den der Entwurf den §§ 41, 41a, 47 und 49 widmet,
  nicht diesen beiden), Bundesvergabegesetz 2018 § 301,
  Bundesvergabegesetz Konzessionen 2018 § 81. Keine Anordnung des Entwurfs
  adressiert sie, auch keine unlesbare — das ist genau der Fall, für den die
  Regel gedacht ist.
- **Sechs Paragraphen, deren fehlende Wörter in einem *anderen Gesetz*
  desselben Sammelgesetzes stehen** — Energie-Control-Gesetz §§ 27, 41, 43 und
  44 (die Wörter stehen im neuen Elektrizitätswirtschaftsgesetz desselben
  Pakets), Immobilien-Investmentfondsgesetz § 43a, Wertpapieraufsichtsgesetz
  § 117. Dort zeigt der Block der Beilage ein Mehrfaches an neuem Text, als die
  Anordnung für diesen Paragraphen trägt.
- **Fünf Paragraphen mit Parallelbestimmungen** — NAG § 42,
  Landeslehrer-Dienstrechtsgesetz § 123, Land- und forstwirtschaftliches
  Landeslehrer-Dienstrechtsgesetz § 127, Blutspenderverordnung § 9,
  Strafprozeßordnung § 108a: dieselbe Wortfolge steht in einer benachbarten
  Bestimmung, die ihren **eigenen** Block hat — und die Anordnung zu diesem
  Paragraphen ist eine kleine Wortfolgen-Änderung, während die Beilage einen
  ganzen Absatz als neu zeigt (StPO § 108a: 4 Wörter in der Anordnung gegen
  33 als neu gezeigte).
- **Ein Fall ist unsere Schuld, und die Ursache lag zwei Module früher**
  (behoben am 10.09.2026): das Leerzeichen in „§ 1 3 ." steht in keinem
  Dokument, `cellText` erzeugt es. Die Ressorts markieren die geänderte
  Ziffer der Bezeichnung *selbst* gelb — `<gldsym>§ 32<i><span
  style="background:yellow">2</span></i>.</gldsym>` —, und weil dort jedes
  Tag zu einem Leerzeichen wurde, zerfiel die Nummer; `designationKey` liest
  davon den ersten Teil, also § 32 statt § 322. Sieben Bezeichnungen in drei
  Entwürfen, alle auf dem Tabellenpfad: StGB §§ 322, 323 und 324,
  GTelG § 28c, Blutspenderverordnung §§ 11, 13 und 14 — daneben 20 weitere
  Schreibweisen („§ 27 ." für § 27), die nur die Anzeige trafen, 153 Zeilen
  zusammen. Die Bezeichnung wird jetzt ohne Auszeichnungsmarkup gelesen
  (zunächst über ein eigenes `designationText`, seit der geteilten Regel
  unten über `lawtext/normalize.stripMarkup`).
  Was es kostete, ist gemessen und war **nicht** die befürchtete falsche
  Bestätigung: sechs der sieben zeigen links höchstens ein vergleichbares
  Wort und bleiben ungeprüft; § 11 dagegen wurde mit 11 % Deckung gegen den
  geltenden § 1 *einbehalten* und deckt den geltenden § 11 zu 100 % — dem
  Leser wurde geltendes Recht vorenthalten, nicht falsches bestätigt. Die
  Meldung der Regel 2 auf § 13 bleibt und hat einen zweiten, echten Grund:
  die Beilage zeigt dort eine Inkrafttretensbestimmung, die der Entwurf an
  anderer Stelle anordnet.

**Dieselbe Regel über alle drei Seiten (11.09.2026).** Die Bezeichnung war
nur der teuerste Fall; die Ressorts markieren die geänderten Buchstaben
*jedes* Wortes gelb — `Schlepplifte<i><span
style="background:yellow">n</span></i>,` —, und ein Tag als Leerzeichen macht
daraus zwei Wörter, die der geltende Paragraph nicht hat. Die
Unterscheidung liegt jetzt an einer Stelle (`lawtext/normalize.stripMarkup`): ein
Blocktag ist eine Wortgrenze, ein Auszeichnungstag nicht. Sie **musste**
geteilt werden — der Vergleich hat drei Seiten (Beilage, geltender Text aus
dem RIS, Gesetzestext des Entwurfs), und eine Regel auf nur einer davon baut
genau die Asymmetrie wieder auf, gegen die `ANNOTATION_RE` existiert. Der
geltende Text las übrigens nie über `lawtext/normalize`, sondern über eine zweite
Kopie derselben Zeile in `lawtext/konsTree.ts`; das war der Grund, warum die
Symmetrie vorher nicht zu sehen war.

*Gemessen* über die GP XXVIII (126 lesbare Beilagen, die 3.858 vom Tor
nachgeschlagenen geltenden Paragraphen, 240 Gesetzestexte): das Zerschneiden
von Wörtern ist fast nur eine Eigenschaft der **Beilage** — `i` steht dort
3.101-mal von 37.522 mitten im Wort, im geltenden Recht 11-mal von 4.664; für
`span` sind es 3.155 gegen **0**. Vergleichbare Wörter ändern sich in 314 von
45.920 Zellen, aber nur in 12 von 202.966 Blöcken des geltenden Rechts und 6
von 48.355 des Entwurfs. Wirkung: Tabellenpfad **982/65/800 → 986/60/801**
Paragraphen, ≥ 99 % gedeckt 936 → 961, alle vier Zusicherungen 0. Der
PDF-Pfad ist **Zeile für Zeile unverändert** — seine Beilage trägt gar kein
Markup, und die zwölf geänderten Blöcke des geltenden Rechts bewegen dort
kein Urteil.

**Sechs Paragraphen ändern ihr Urteil, alle auf dem Tabellenpfad, jeder
einzeln gelesen** — vier davon bekommt die Leserin dazu:

| Paragraph | vorher | nachher | Ursache |
|---|---|---|---|
| InfoSiG § 1 | einbehalten, 90,9 % | **bestätigt**, 96,0 % | fehlten: „klassifizierte", „volksanw", „schaft" |
| InfoSiG § 4 | einbehalten, 76,9 % | **bestätigt**, 100 % | dasselbe, auf 13 vergleichbaren Wörtern |
| StRegG 1968 § 9c | einbehalten, 93,8 % | **bestätigt**, 100 % | fehlten: „mitgliedsta", „ates" |
| BHygV § 56 | einbehalten, 84,6 % | **bestätigt**, 100 % | ein zerschnittenes Wort von zwölf |
| BHygV Anlage 5 | einbehalten, 60,0 % | **ungeprüft**, 100 % | n fällt von 5 auf 4, unter `MIN_PROSE_TOKENS` |
| MPBV § 11 | einbehalten (links), 95,0 % | einbehalten (**Regel 2**), 99,2 % | fehlten: „raft", „retens", „ärz" |

Die letzten beiden sind der Preis und beide sind ehrlicher als vorher.
**Anlage 5** deckt den geltenden Text jetzt vollständig, hat aber nach dem
Zusammenfügen ein vergleichbares Wort weniger als die Schwelle verlangt — die
Zeile ist zu kurz, um etwas zu beweisen, und „ungeprüft" ist dafür der
richtige Zustand, nicht „einbehalten". **MPBV § 11** besteht die linke Prüfung
jetzt und fällt dafür der Regel 2 zu (64 von 159 neuen Wörtern stehen nicht in
den Anordnungen zu diesem Paragraphen); dass sie im *ganzen* Entwurf stehen —
die Zeile „nicht im Entwurf, ganzer Entwurf" bleibt bei 0 — macht es zur
bekannten Klasse „der Entwurf ordnet diese Änderung an einer anderen Stelle
an", wie schon bei Blutspenderverordnung § 13. Der Paragraph war vorher
einbehalten und ist es weiter; geändert hat sich nur, dass der genannte Grund
stimmt.

**`<sup>`/`<sub>`/`<super>` bleiben draußen, gemessen.** Sie stehen 152-mal in
den Beilagen, 785-mal im geltenden Recht und 338-mal im Entwurf direkt an
einem Wort, und die beiden Bedeutungen sind **an der Form nicht zu
unterscheiden**: `CO<sub>2</sub>` gehört zum Wort, `Meerkatzen<super>1)</super>`
ist ein Fußnotenzeichen und gehört nicht dazu. Sie zusammenzuziehen bewegt
**kein einziges Urteil** auf beiden Pfaden, hebt aber die berichtete Deckung
von 961 auf 962 (Tabelle) und von 1.617 auf 1.622 Paragraphen (PDF). Dieser
Gewinn gehört zu einer *anderen* Asymmetrie und damit in einen eigenen
Schritt: die PDF-Textebene trägt überhaupt kein Markup, also ist
`KW<sub>el</sub>` dort ein Wort und hier zwei.

**Getrennt am Tag, nicht an der Form — und `<sub>` zusammengezogen
(30.09.2026).** Gezählt über alle gecachten RIS-Dokumente (Beilagen,
geltendes Recht, Entwürfe) trägt `<sub>` **nur Indizes**: SO₄, O₂, KMnO₄,
Q_A, G_F,Ei, kW_peak, die Fahrzeugklassen M₁ bis N₃ — und in 2.146
Vorkommen kein einziges Zeichen der Fußnotenformen „1)", „(Anm. 1)" oder
„*)". `<super>`/`<sup>` tragen beides, die Fußnoten („1)", „(Anm. 1)",
„*)", die Ziffern einer Stundentafel) *und* die Exponenten (m³,
km², 10⁻³⁴, „Abs. 2bis"), und die sind auch innerhalb des Tags an der Form
nicht zu trennen. Also zieht `stripMarkup` jetzt `<sub>` an sein Wort, wie
die PDF-Textebene es ohnehin tut, und `<sup>`/`<super>` bleiben ein
Leerzeichen. Nach rechts schließt ein Index fast immer an Leerzeichen,
Satzzeichen oder Bindestrich an („CO₂-Emissionen" → „CO2-Emissionen");
direkt an einen Buchstaben 97-mal, und das ist Chemie (N₂O, Na₂CO₃) bis auf
eine Handvoll Satzfehler des Ressorts („M₃sind").

*Gemessen* (Prüfstand, 400 jüngste Sätze, gegen den Stand davor):
Tabellenpfad **kein Urteil bewegt**, Deckung ≥ 99 % 1.234 → 1.235
(Bäderhygieneverordnung § 6, „KMnO4"). PDF-Pfad Deckung 1.886 → 1.894 in
fünf Entwürfen, und **drei Urteile gehen von einbehalten auf bestätigt**:
EAG-Investitionszuschüsseverordnung-Strom § 5 (kW_peak) und
EAG-Marktprämienverordnung §§ 5 und 12 (kW_peak, kW_el) — Tor 1.860 / 355 /
1.519 → 1.863 / 352 / 1.519. Gelesen: Die linke Spalte ist in allen drei der
geltende Paragraph zum Fristbeginn, Wort für Wort; einbehalten waren sie nur,
weil das RIS „kW peak" als zwei Wörter führte und das PDF als eines. Dass
die PDF-Lesung die Tabelle darin in Zeilenfolge statt Zellfolge druckt
(„Fördermi Technologie Fördercalls … ttel"), ist die bekannte Eigenschaft
dieses Pfads und keine der Änderung: Die linke Prüfung ist ein Sack und
verspricht die Reihenfolge nicht. Dass das Zusammenziehen am 11.09. „kein
Urteil" bewegte und jetzt drei, liegt am Korpus — beide EAG-Novellen sind
vom 23.12.2025. Fehlerinjektion: Tabellenpfad Zeile für Zeile gleich,
PDF-Pfad Grundmenge 2.717 → 2.720 (genau die drei), Fangquoten gleich;
`harness:me` gleich. Die Drift-Grundlinie ist aus denselben Berichten
nachgezogen: die sechs Entwürfe oben, alle nach oben, und dazu drei
Vermerke des PDF-Pfads, die schon vor dieser Änderung abwichen — der
Verweigerungssatz „Der Entwurf nennt keine Artikel, die Beilage schon" heißt
seit 3e2faf7 „Die Beilage ist in Artikel gegliedert, …", keine Zahl bewegt
sich daran.

**Nicht gebaut:** `<sup>`/`<super>` zusammenzuziehen. Eine Fußnote an ihrem
Wort („Meerkatzen1)") wäre ein Wort, das es nicht gibt, und die Exponenten
lassen sich von ihr nicht trennen, ohne die Bedeutung zu raten.

**Die bessere Adressierung (11.09.2026) kostete genau eine Meldung mehr**, und
sie ist keine falsche: PDF-Pfad 20 → 21 im Prüfstand, 16 → 17 im Tor mit
Deckelung; Tabellenpfad unverändert 3 → 3, dort ändert sich kein einziges
Urteil. Die eine ist die **Obstweinverordnung § 13** der
Weinrecht-Sammelverordnung 2024, und sie ist der Zielfall, hier ungestellt im
Korpus gefunden: Die rechte Spalte des § 13 endet nicht mit seinem Text,
sondern trägt dahinter den Anfang der nächsten Anordnung — „5. In
§ 16 Abs. 1 wird die Wortfolge „Kosten der Untersuchung: 60 Punkte = € 72
(Punktewert: € 1,20)" durch …". Der Regel ist es gleich, an diese Stelle
gehört der Text nicht. Die 8 fehlenden von 20 als neu gezeigten
Wörtern sind genau diese Gebührenformel, zweimal, weil beide Operanden
zitiert sind. Bis 10.09.2026 lag Anordnung 5 im allgemeinen Sack (ihre vier
Operanden ließen sich nicht paaren), § 13 durfte sich also daran bedienen und
die Regel schwieg. Das ist derselbe Fehler, den die Injektion als R-neu
künstlich erzeugt — nur echt, und auf der Seite grün als neues Recht.
Sonst ändert sich auf dem PDF-Pfad kein Urteil, und alle vier Zusicherungen
beider Prüfstände bleiben 0.

*Wer den Text dorthin gesetzt hat, ist seit 11.09.2026 beantwortet, und es ist
nicht unsere Zeilenlesung.* Nachgesehen in der Textebene des PDF, Seite 4: die
rechte Spalte dieser Beilage druckt nicht die vorgeschlagene **Fassung** der
Bestimmungen, sondern die **Novellierungsanordnungen des Entwurfs**, eine unter
der anderen und alle im selben Spaltenkasten — „2. Dem § 1 werden folgende Z 9
und 10 angefügt:" bei x = 426,2, „4. § 13 samt Überschrift lautet:" bei 426,2,
darunter das Zitat „Herstellungsmeldung … mitzuteilen.“ und unmittelbar darauf
„5. In § 16 Abs. 1 wird die Wortfolge …" wieder bei 426,2. Die Anführungszeichen
gehören dazu; für § 16 druckt die Beilage überhaupt keinen vorgeschlagenen Text,
sondern eben diese Anordnung. Links steht dabei sauber zeilenweise der geltende
Text (§ 13 bis x = 300,9, § 16 ab y = 149) — es ist also eine echte
Gegenüberstellungsseite und keine hereingeratene Gesetzestextseite, und die
Seite trägt ihr Kopfpaar („Geltender Text" / „Vorgeschlagener Text") wie jede
andere. **Unser Anteil ist allein die Zeilengrenze:** der PDF-Parser schneidet
eine Zeile am Paragraphenzeichen, und „5. In § 16 Abs. 1 …" eröffnet keinen
Paragraphen, fällt also in den Block des § 13. Die Beilage hätte hier nichts
anderes zu bieten, an dem sich schneiden ließe.

Das ist **eine von 114 Beilagen** der GP XXVIII — nur diese eine druckt
Anordnungen statt Fassungen in der rechten Spalte (15 solcher Zeilen von 685).
Ein Schnitt an der Nummer einer Novellierungsanordnung wäre die Regel, die
diesen Fall auflöste; sie ist am Korpus zu messen, bevor sie geschrieben
wird. Solange es sie nicht gibt, tut das Tor
genau das Richtige: § 13 wird einbehalten, der Text erreicht die Leserin nicht
als neues Recht, und der Grund, den die Seite nennt, stimmt.

**Gemessen 28.09.2026, und die Regel wird nicht geschrieben.** Über alle 118
PDF-Beilagen der jüngsten 400 Begut-Datensätze (3.948 Zeilenpaare, gelesen
mit `parseAnnexPdf` wie der Anfragepfad) trifft der Kopf einer
Novellierungsanordnung — Nummer, dann „In/Dem/Nach/Die … §/Art./Anlage" mit
Ziffer oder „§ N … lautet/entfällt/wird", und ein Änderungsverb binnen 160
Zeichen — **genau eine** Zelle der rechten Spalte: diese. In der linken Spalte,
der Kontrolle, keine. Von den übrigen 14 Anordnungszeilen dieser Beilage
findet das Muster keine in einer Zelle. Der erste Versuch, jede Nummer mit
`parseInstruction` zu prüfen, fand den Fall nicht: Die Anordnung endet in der
Zelle vor ihrem Verb („… durch di"), und der Parser verlangt eine vollständige
— eine Schnittregel müsste also am *Kopf* erkennen. Der Ertrag wäre ein
Paragraph, den das Tor schon richtig einbehält, der Preis eine Sonderregel im
PDF-Parser und eine bewegte Drift-Grundlinie. Taucht eine zweite solche
Beilage auf, findet sie dieselbe Prüfung in Minuten.

**Eine Variante gemessen und verworfen:** eine *Obergrenze* auf den
unerklärten Anteil. Sie liegt nahe, weil ein Block, der zwei Bestimmungen
umspannt, fast vollständig unerklärt ist, während ein bloß verunreinigter
Paragraph seinen eigenen neuen Text behält. Bei 50 % kostet sie den
Tabellenpfad seinen ganzen Gewinn: R-neu fällt von 184 auf 64 Treffer und
damit **unter** die 76 des ganzen Entwurfs — ein Paragraph mit wenig eigenem
neuen Text ist eben der Fall, in dem ein injizierter Satz den Anteil dominiert.

Und ein Satz auf der Seite musste sich ändern. „Text, der im Gesetzestext des
Entwurfs nicht vorkommt" war mit dem neuen Bezug in der Mehrheit der Fälle
schlicht **falsch** — der Text kommt vor, einen Paragraphen weiter. Der Befund
heißt jetzt „Text, den der Entwurf für diesen Paragraphen nicht anordnet", und
die Ursachenzeile nennt die neue Möglichkeit („der Entwurf ordnet diese
Änderung an einer anderen Stelle an") neben den beiden alten.

| 2026-09-10, GP XXVIII | bestätigt | einbehalten | davon links / bereits geltend / nicht im Entwurf | ungeprüft |
|---|---:|---:|---|---:|
| XML-Tabelle, vorher | 989 | 57 | 57 / – / – | 814 |
| XML-Tabelle, nachher | 983 | 63 | 57 / 6 / 0 | 814 |
| PDF-Textebene, vorher | 1.349 | 244 | 244 / – / – | 1.894 |
| PDF-Textebene, nachher | 1.286 | 312 | 243 / 63 / 6 | 1.889 |
| PDF-Textebene, nach dem Seitentor und der Kantenmessung (unten) | 1.347 | 234 | 212 / 15 / 7 | 1.902 |
| XML-Tabelle, mit dem Bezug je Paragraph | 981 | 66 | 57 / 6 / 3 | 813 |
| PDF-Textebene, mit dem Bezug je Paragraph | 1.342 | 243 | 212 / 15 / 16 | 1.898 |
| XML-Tabelle, nach der Bezeichnungslesung (oben) | 982 | 65 | 56 / 6 / 3 | 800 |
| XML-Tabelle, mit der geteilten Markup-Regel (11.09.2026) | 986 | 60 | 50 / 6 / 4 | 801 |
| XML-Tabelle, mit der zweiten Bezeichnung je Zeile (11.09.2026, unten) | 998 | 62 | 52 / 6 / 4 | 791 |
| PDF-Textebene, mit dem Bundsteg aus den Zweispaltenzeilen (11.09.2026, unten) | 1.342 | 244 | 212 / 15 / 17 | 1.897 |

Die „vorher"-Zeilen sind heute gegen den Stand des Repositoriums gemessen und
widersprechen deshalb der Tabelle weiter oben (967/73/764 und 895/198/2.388):
Entwurfszahl und „ohne jede Prüfung" sind identisch — 117 und 6, 96 und 15 —,
die Population also dieselbe; verschoben haben die Parser-Korrekturen desselben
Tages (Auslassungssyntax, Vorspann, verschachtelte Tabellen, Drehung, Anlagen).
Die obere Tabelle ist der Stand *vor* ihnen und bleibt als solcher stehen.

Die 63 auf dem PDF-Pfad sind zum großen Teil **eine Asymmetrie unseres
eigenen Parsers**, nicht der Beilagen: die Paragraphenüberschrift landet dort
oft nur in der rechten Spalte, also zeigt der Diff sie als „neu", und das
RIS führt sie längst. Das ist ein echter Fehler auf der Seite und gehört
einbehalten, solange er besteht — die Zahl fällt, sobald die Zeilenpaarung im
PDF-Pfad ihn nicht mehr erzeugt. Der Satz im Block nennt deshalb auf dem
PDF-Pfad unsere Lesung als erste mögliche Ursache, für alle drei Gründe
getrennt formuliert.

Die beiden letzten Zeilen sind der Bezug je Paragraph. Auf dem PDF-Pfad
meldet Regel 2 dort 16 statt 7 Paragraphen — vier weniger als die 20 des
Injektions-Prüfstands, weil `MAX_PARAGRAPHS` den Schwanz der Sammelnovellen
gar nicht erreicht. Bestätigt fällt um 5 (PDF) und 2 (Tabelle), einbehalten
steigt um 9 und 3: die Differenz kommt aus *ungeprüft*, denn ein eingefügter
Paragraph ohne beurteilbaren linken Text kann jetzt an der rechten Spalte
scheitern — genau der Fall „erfundenes Recht".

*Nachtrag desselben Tages:* genau das ist eingetreten. Die Ursache war die
asymmetrische Kantenmessung (unten, „Die Überschriften-Übernahme war
asymmetrisch"), und die Zahl fiel von 63 auf 15; der Tabellenpfad bleibt bei
6. Über beide Pfade zusammen meldet die Regel damit 21 Strecken, davon 13
eine Paragraphenüberschrift und 8 Fließtext — vorher waren es 70
Überschriften gegen dieselben 8. Die Überschrift ist also nicht mehr der
Hauptbefund der Regel, sondern ihr Restrisiko.

**Was die linke Prüfung liest — und was nicht (11.09.2026).** In den linken
Sack kommen nur die Zeilen, die die Seite als **Änderung** zeigt
(`annex/coverage.isDisplayedChange`): `changed` und `removed`, ohne Auslassungen.
Eine `inserted`-Zeile hat keine linke Spalte, das ist ihr Zweck. Eine
`unchanged`-Zeile aber **hat** eine, und ihr Text steht auf der Seite —
eingeklappt hinter „N Stellen unverändert", dann gedruckt. Eine falsch
abgelegte Zeile, die in beiden Spalten dasselbe druckt, ist damit unsichtbar.
Das stand als offenes Restrisiko in der Aufgabenliste; hier ist es gemessen.

Gemessen wurde die Gegenprobe durch dieselben ausgelieferten Funktionen, mit
einem **eigenen Sack** für die unveränderten Zeilen je Paragraph. Ein
*gemeinsamer* Sack schied vorher aus, und zwar an Zahlen: er verdünnt die
geänderten Zeilen und **befreit drei Paragraphen**, die das Tor heute
einbehält (u. a. GTelG § 21, 94,8 % → 98,1 %, weil 133 gut gedeckte
unveränderte Wörter den Nenner heben) — eine Prüfung, die sich durch mehr Text
beruhigen lässt, ist keine.

| GP XXVIII | unveränderte Zeilen | §§ mit Prosa | unter der Schwelle | neu einbehalten | davon heute bestätigt |
|---|---:|---:|---:|---:|---:|
| Tabellenpfad | 1.972 in 609 §§ | 366 | 63 | 59 | 54 |
| PDF-Textebene | 287 in 287 §§ | 129 | 34 | 34 | 0 |

*Stand der Lesung. Drei der 93 waren unsere eigene Lücke und sind noch am
selben Abend geschlossen worden (unten, „Derselbe Abschlussteil, zwei
Namen"); die Prüfstände drucken seitdem 11 bzw. 33 unter der Schwelle, davon
4 bzw. 0 heute bestätigt — die 11 nach dem Schritt, der die beidspaltigen
Überschriftszeilen zu Überschriften macht (unten).*

**Alle 93 wurden einzeln gelesen, und 91 sind die Beilage, die recht hat.**
Auf dem Tabellenpfad sind **52 von 59 die Gliederungsüberschriften des
Gesetzes selbst** — Teil, Abschnitt, Unterabschnitt, die Buchstabenabschnitte
einer Verordnung, die Überschrift des *folgenden* Paragraphen. Sie stehen
**über** dem Paragraphen, den sie überschreiben, werden also unter dem
Paragraphen davor abgelegt, und ihre Wörter stehen in keinem geltenden Text,
den dieses Tor je anfragt — 57 der 59 scheitern an einer Zeile, die gar keine
eigene Bezeichnung trägt. Strafvollzugsgesetz § 154 ist der Musterfall: „Fünfter
Abschnitt — Strafvollzug durch elektronisch überwachten Hausarrest", 0 %
gegen § 154, dessen gezeigte Änderungen den geltenden Text zu 100 % decken.
Dazu **3-mal die Notation der Beilage** („Anlage 1 (wird hier nicht
abgebildet)" zweimal, „[entfällt durch ein früher in Kraft tretendes
Vorhaben]"), **einmal Rechtschreibung** (Konfitürenverordnung § 5,
„In-Kraft-Treten" gegen „Inkrafttreten") — und **zweimal eine Lücke in
unserer eigenen RIS-Lesung**: bei StGB § 321c und BMSVG § 28 endete
`lawtext/konsTree.plainText` den Absatz mit seiner Aufzählung und ließ den Satz
danach weg („ist mit Freiheitsstrafe von einem bis zu zehn Jahren zu
bestrafen.", „Verordnungen der FMA nach diesem Absatz bedürfen der Zustimmung
des Bundesministers für Finanzen."). Die Beilage zitierte dort Recht, das der
Maßstab gar nicht anbot — zum dritten Mal in diesem Projekt hätte das
Messgerät seine eigene Lücke dem Ressort angeschrieben. Auf dem PDF-Pfad sind
33 der 34 Zeilen Inhaltsverzeichnis und Hauptstücküberschrift, und jede
einzelne sitzt in einem Paragraphen, der **überhaupt keine Änderung zeigt**;
die Regel nähme dort also niemandem etwas weg, was er sieht. Die 34. war
dieselbe Lücke wie die beiden anderen (Kulturgüterrückgabegesetz § 3,
„ausgeführt wurde,").

**Ein einziger Fall im ganzen Korpus ist der echte Befund**: GTelG § 23, dessen
unveränderte Zeilen einen Abs. 2 drucken, den der geltende Paragraph nicht hat
(„über *Portale*", zwei Ziffern, gegen „über *Anwendungen*", keine Ziffern) —
ein Versionsunterschied, den die Seite heute als unverändertes Recht zeigt.
Ein Treffer gegen 54 bestätigte Paragraphen, die ihren **ganzen** Wortdiff
verlören — nicht nur die unveränderte Zeile —, ist keine Regel, die dieses Tor
ausliefern darf: Regel 1 trifft auf dem Tabellenpfad 5 Paragraphen, alle echt,
und Regel 2 hat ihre Untergrenzen genau dafür.

**Was die Entscheidung umdrehen würde, ist die Ablage der Überschriften, keine
Schwelle.** Die Klassen trennen sich an keiner Zahl: Überschriften laufen von
0 bis 95 %, die echten Fälle von 44 bis 95 %; ab einem Boden von 20
vergleichbaren Wörtern fängt unterhalb von 90 % **gar nichts** mehr. Legt der
Tabellenparser eine beidspaltige Überschriftszeile unter den Paragraphen, den
sie überschreibt, statt unter den davor, verschwinden 52 der 59 — dann lohnt
der zweite Blick auf die restlichen sieben.

*Nachtrag desselben Tages, und die Erwartung stimmte zur Hälfte.* Die Ablage
ist es — aber **nicht als Ablage**. Die Zeile bloß unter den Paragraphen
darunter zu legen bringt fast nichts: „unter der Schwelle" fällt dann von **63
auf 62**, weil 41 Fälle verschwinden und 40 neue entstehen. Der Paragraph
darunter deckt die Überschrift genauso wenig, und der Grund ist der Maßstab —
von den 111 Zeilen, die auch nach dem Umzug unter 50 % bleiben, landen **99 auf
einem Paragraphen, dessen RIS-Dokument gar keinen `context` führt**. Das RIS
liefert die Teil-, Abschnitts- und Unterabschnittszeilen nicht in jedem
Paragraphendokument mit; das Strafvollzugsgesetz § 9 bekommt `context: []`,
während die Beilage sechs Überschriftszeilen darüber druckt. Je *Zeile*
gemessen wird die Ablage dabei deutlich richtiger — im geltenden Text ihres
Paragraphen gedeckt **32 → 169** von 506, unter 50 % **161 → 111** —, nur ist
eine Überschrift eben kein Satz des Paragraphen, und sie gegen dessen geltenden
Text zu halten fragt das Falsche.

**Was wirkt, ist `lift` eine Ebene höher.** Die beidspaltige Überschriftszeile
hört auf, eine Zeile zu sein, und wird zur `heading` des Paragraphen darunter —
genau das, was das Modul für die Paragraphenüberschrift (`typ="para"`) seit
jeher tut, 1.084-mal im Korpus, und was der spaltenübergreifenden Überschrift
und der Abschnittszeile nach Wortschatz (`DIVISION_RE`) ebenfalls längst
widerfährt. `lift` sieht nur `typ="para"`, und daran scheiterte alles eine
Ebene darüber: Teil, Abschnitt, Unterabschnitt, die Buchstabenabschnitte einer
Verordnung, der Titel des Gesetzes, die Überschrift des *folgenden* Paragraphen.

Grundmenge, über die 126 lesbaren Beilagen der GP XXVIII (11.09.2026): **507
solche Zeilen**, nach der Auszeichnung des RIS 226 `g2`, 124 `g1`, 46 `anlage`,
46 `titel`, 30 `erll`, 24 `g1min`, 4 `tgue`, 3 `erlz`, 2 `art`, 1 `para` — jede
einzelne ein `<ueberschrift>`, keine am Wortlaut erraten. **331 folgt eine
Zeile, die einen Paragraphen eröffnet**, die übrigen 176 eröffnen nichts unter
sich. Dazu 119 Zeilen derselben Form, deren Spalten sich *unterscheiden* — das
ist „samt Überschrift", eine gezeigte Änderung, und die bleibt unberührt.

| GP XXVIII, Tabellenpfad | unveränderte Zeilen | §§ mit Prosa | unter der Schwelle | neu einbehalten | davon heute bestätigt |
|---|---:|---:|---:|---:|---:|
| vorher | 1.972 in 609 §§ | 366 | 63 | 59 | 54 |
| nur die Ablage verschoben | 2.066 in 642 §§ | 384 | 62 | — | 47 |
| Überschrift des § darunter | 1.738 in 474 §§ | 330 | **13** | **10** | **6** |
| … und der Abschlussteil in beiden Schreibweisen gelesen (unten) | 1.738 in 474 §§ | 330 | **11** | — | **4** |

**Aufgelöst wird nur, wo darunter wirklich ein Paragraph aufgeht.** Die reine
Form — jede beidspaltige Überschriftszeile auflösen — käme auf 10 statt 13,
**kostet aber 17 Beilagen zusammen 74 Wörter von der Seite**: wo unter der
Überschrift kein Paragraph aufgeht, hängt sie sich an eine Zeile, deren Block
schon eine Überschrift trägt, und `TextComparisonSection` druckt nur die erste.
Am teuersten in der Tierversuchs-Verordnung, deren Anlage 1 ihre inneren
Gliederungszeilen („3.4. Mindestanforderungen für die Haltung von Hamstern
(Cricetini)") verlöre. Eine gedruckte Zeile für drei Diagnosezeilen zu opfern
ist derselbe Handel, den die alte Auslassungsregel über 919 Zeilen verloren
hat. Mit der Bedingung verliert die Seite **kein einziges Wort** und gewinnt
30.

Die 13, die bleiben, sind einzeln gelesen. **Sechs sind die Fälle von oben**:
StGB § 321c und BMSVG § 28 (die Lücke in unserer eigenen RIS-Lesung),
GTelG § 23 (der eine echte Befund), zweimal „Anlage N (wird hier nicht
abgebildet)" und Konfitürenverordnung § 5 (Rechtschreibung). **Drei sind
Überschriften, unter denen kein Paragraph aufgeht** und die deshalb Zeile
bleiben — StVG §§ 18c und 84, Apothekenbetriebsordnung § 65. **Eine ist der
Maßstab**: die Prüfungsordnung BMHS § 57g druckt zwei Überschriftsebenen mehr,
als das RIS in ihrem Paragraphendokument führt (`context` trägt „12c.
Unterabschnitt" und den Lehrgangstitel, nicht aber „Klausurprüfung" und
„Mündliche Prüfung"). **Drei sind Fließtext** und haben mit Überschriften
nichts zu tun: SchOG § 6, KSchG § 13a, Ärztegesetz § 7 — genau der Rest, den
der zweite Blick meint.

**Kein einziges Urteil bewegt sich**: Tabellenpfad 1.010/53/795 mit 44/5/4 nach
Ursache, die Urteilsliste Zeile für Zeile identisch, alle vier Zusicherungen 0;
der PDF-Pfad ist unberührt, weil `parseTextComparison` dort nicht aufgerufen
wird. Das ist erwartbar und kein Argument gegen den Schritt: die linke Prüfung
liest `unchanged`-Zeilen ohnehin nicht — sie ist der Grund, warum diese Zeilen
überhaupt unbemerkt falsch lagen. Was sich bewegt, ist die Voraussetzung: die
Grundmenge, über der eine spätere Regel entscheiden müsste, ist von 59 auf 10
gefallen.

*Gemessen und nicht gebaut, mit Zahlen, damit es niemand neu messen muss.*
Dieselbe Regel für die **geänderte** beidspaltige Überschrift — Zeile bleibt
Zeile, nur der Paragraph zieht um, also genau `heldHeadings` von 527297b eine
Ebene höher — bewegt **28 Urteile: 19 von einbehalten auf bestätigt**, 2 von
einbehalten auf ungeprüft, 2 von ungeprüft auf bestätigt (1.008/55/795 →
1.024/39/795, einbehalten wegen der geltenden Fassung 43 → 27). **Fünf
bestätigte Paragraphen verlören aber ihre Bestätigung**, und alle fünf sind
eine Klasse: der **Langtitel des Gesetzes**, den die Novelle mitändert. Die
Medizinproduktebetreiberverordnung § 1 fällt von 100 % auf 78 %, weil
„Verordnung der Bundesministerin für Gesundheit, Familie und Jugend über das
Errichten …" in ihre linke Spalte wandert — Text, den § 1 nie hatte; ebenso
drei Preisindex-Verordnungen und die LF-VGÜ § 6. Solange die Titelzeile nicht
als das gelesen wird, was sie ist, kostet diese Erweiterung eine Zusage, und
527297b hat für sich festgehalten, dass keine verlorenging. Eigener Schritt,
eigene Messung. Dieselbe Klasse zeigt sich auf der unveränderten Seite
harmlos: 35 der 507 Zeilen sind Titelzeilen, die jetzt zur Überschrift des
ersten Paragraphen ihres Gesetzes werden, und 15 davon sind Feldnamen der
RIS-Webansicht („Text" 9-mal, „Präambel/Promulgationsklausel" 2-mal, „Beachte
für folgende Bestimmung" 2-mal, „Langtitel", „Gesamte Rechtsvorschrift für
…"). Als Überschrift gedruckt sind sie Zierrat statt Recht, aber sie standen
vorher als Zeile in der Beilage und stehen in keinem Sack der Prüfung.

Bis dahin wird der blinde Fleck **benannt statt geschlossen**, und zwar mit
Zahlen, die jeder Lauf neu erzeugt. `harness/faultInjection.ts` hat dafür einen
vierten Fehler **U**: eine zusätzliche Zeile mit dem geltenden Text eines
*anderen* Paragraphen, in beiden Spalten gleich. Das Tor fängt **0 von 238**
auf dem Tabellenpfad und **0 von 883** auf dem PDF-Pfad — jede Meldung unter
der Injektion feuerte schon ohne sie —, und das ist keine Überraschung,
sondern Bauart: die linke Prüfung liest nur gezeigte Änderungen, beide
Regeln der rechten Spalte nur Eingefügtes. `harness/annexPdf.ts` druckt
seitdem die Grundmenge („Unveränderte Zeilen, nie gegen das RIS gehalten").

Was der Lauf **nicht** vorher wusste, ist die schärfere Hälfte: eine
beidspaltige Zeile ist nicht bloß ungeprüft, sie ist ein **Alibi**. Beide
Regeln der rechten Spalte nehmen aus, was links steht — richtig so, ein bloß
verschobener Satz darf nicht melden —, und jede Paarzeile zählt dafür mit.
Fehler U bringt damit in **1 von 883** Paragraphen des PDF-Pfads eine vorher
feuernde Regel zum Schweigen. Selten, aber es ist die Richtung, in der dieser
Ausschluss nicht nur etwas übersieht, sondern etwas kostet. Der neue Zähler
`silenced` misst das für alle vier Fehler (R-alt und R-neu je 1 auf dem
Tabellenpfad, L und U je 1 auf dem PDF-Pfad).

Kein Urteil hat sich bewegt: Tabellenpfad 1.008/55/795, PDF-Pfad
1.342/244/1.897, alle vier Zusicherungen 0, beide Prüfstände Zeile für Zeile
identisch bis auf die zwei neuen Zeilen.

**Derselbe Abschlussteil, zwei Namen (11.09.2026, abends).** Die drei oben
benannten Fälle waren nicht drei Paragraphen, sondern ein Tag. Das RIS
schreibt den Satz, der eine Aufzählung schließt, unter zwei Namen, und welcher
gilt, hängt am **Konverter, der das Dokument erzeugt hat**, nicht am Gesetz:
Version 4.1 schreibt `<schlussteil>`, die 3er-Reihe `<schluss typ="…">`, 4.0
liegt auf der Grenze. Über die 16.073 Paragraphendokumente des Offline-Korpus
tragen 2.824 den neuen Namen, 402 den alten, und **kein einziges beide** —
`lawtext/konsTree.ts` las nur den neuen und beendete damit jene 402 Paragraphen mit
ihrer Aufzählung: 880 Blöcke, 23.578 vergleichbare Wörter geltenden Rechts,
still verworfen. Gegen eine unabhängige flache Lesung derselben Dokumente
(jeder Block in Dokumentreihenfolge, ohne Baum) gibt der Baum die Reihenfolge
jetzt in 15.290 von 15.510 darstellbaren Dokumenten wieder statt in 14.906,
und **kein Dokument ist mehr zu kurz** (386 waren es).

Der alte Name nennt die Einheit, die der Satz schließt (`typ="Abs"` 462 Blöcke,
`"Ziff"` 276, `"Lit"` 83, `"e<n>"` 59 für die Ebene der gerade beendeten
Liste), und das wird gelesen, weil die Ablage zweimal zählt: die Aufzählung
kann nach dem Satz *weitergehen* — „oder" schließt Ziffer 1 des Börsegesetzes
§ 131 Abs. 1, Ziffer 2 folgt darauf —, und `lawApply.textSlot` löst „Im
Schlussteil des § X Abs. n" auf das **letzte** `schluss`-Kind des Absatzes auf.
Alles auf den Absatz zu legen, wäre einfacher und in **89 Paragraphen** falsch
(Börsegesetz § 131, BWG §§ 20, 22, 35, 78, KStG § 26c, B-VG Art. 50 …) und
kostete 33 Dokumente ihre Reihenfolge. Umgekehrt nimmt die Lesung nichts weg:
der Slot des Absatzes ändert sich in 317 Dokumenten, und in jedem einzelnen war
er vorher leer.

Wirkung auf die Urteile. Der **Tabellenpfad ist Zeile für Zeile identisch**
(1.010/53/795) bis auf die Grundmenge des blinden Flecks — 13 → 11 unter der
Schwelle, davon heute bestätigt 6 → 4, und das sind genau StGB § 321c
(66,7 % → 100 % über 15 vergleichbare Wörter) und BMSVG § 28 (86,2 % → 100 %
über 58). Auf dem **PDF-Pfad** steigt „≥ 99 % gedeckt" von 1.636 auf 1.645 und
das Tor von 1.364/250/1.869 auf **1.369/245/1.869**, Ursache „geltende Fassung
so nicht im RIS" 217 → 211. Fünf Paragraphen werden bestätigt, jeder einzeln
gelesen, und in jedem fehlten genau die Wörter des Schlusssatzes:
Geräuschemissionsverordnung § 11 (62,7 % → 100 % über 440 Wörter) und ihre
Anlage 8 (91,1 % → 99,0 %), FMABG § 7 (58,3 % → 100 %), Außenwirtschaftsgesetz
§ 68 (92,9 % → 98,2 %) und § 70 (80,8 % → 100 %). Der sechste, Anlage 6
derselben Verordnung, bleibt einbehalten und **wechselt nur den Grund**
(85,1 % → 99,6 %, dann Regel 2): eine Meldung, die vorher hinter der linken
Prüfung stand, steht jetzt für sich — dieselbe Form wie MPBV § 11, und der
Grund, den die Seite nennt, stimmt jetzt. Die Fehlerinjektion ist auf dem
Tabellenpfad identisch; auf dem PDF-Pfad wächst nur die Grundmenge um die sechs
Paragraphen, die jetzt eine Injektionsstelle tragen (936/899/898 →
942/905/904), bei gleichen Quoten (L 62,0 %, R-alt 66,2 %, R-neu 77,0 %) und
Fehlalarmen 19 und 22 statt 19 und 21. Alle vier Zusicherungen 0,
`droppedPages` 0, der Prüfstand der Änderungsmaschine (`harness/kons.ts`,
`--discover=8`) Zeile für Zeile unverändert.

**Was gemessen und nicht getan wurde.** `<schlussteil>` trägt dieselbe
Information in `ebene` — 0 und 0,5 für den Absatz (4.792 Blöcke), 1 für die
Ziffer (2.640), 2 und tiefer für die Litera (587) —, und sie zu lesen brächte
die Dokumente, deren `plainText` noch gegen die Dokumentreihenfolge läuft, von
220 auf 121. Sie bleibt vorerst ungelesen, weil sie in 2.352 Dokumenten den
Schlussteil-Slot des Absatzes *leert*, und ob die 406 Sätze mit `ebene="1"`,
die ihre Liste **beenden**, die Ziffer oder den Absatz schließen, ist genau die
Frage, die `ebene` allein nicht beantwortet. Das entscheidet der Prüfstand der
Änderungsmaschine über einen Korpus, nicht dieses Modul. Von den verbleibenden
220 sind mindestens 140 ohnehin eine andere Form: ein unnummerierter
Fortsetzungsblock, den das RIS *hinter* eine Liste druckt, wird an den Text des
Absatzes angehängt und deshalb **vor** der Liste ausgegeben. Für die linke
Prüfung ist das folgenlos (ein Sacktest kennt keine Reihenfolge), für Regel 1
kostet es Empfindlichkeit, weil sie zusammenhängende Wortfolgen sucht.

**Dieselbe Lücke stand in `lawtext/risXml.parseRisXml`** (geschlossen 12.09.2026), das die andere
RIS-XML-Sorte liest (Gesetzestext des Entwurfs, ME→RV für GP XXVII und früher,
Anweisungen der Änderungsmaschine): `RIS_BLOCK_RE` kennt `schlussteil`, nicht
`schluss`. Im Offline-Korpus sind das 98 Dokumente mit 712 Blöcken und 12.100
Wörtern; live in der GP XXVIII betrifft es die Gesetzestexte von **drei
Entwürfen des Tabellenpfads und vier des PDF-Pfads**. Dort — anders als bei den
Paragraphendokumenten — kommen beide Schreibweisen auch **im selben Dokument**
vor. `RIS_BLOCK_RE` liest jetzt beide Namen, und der ältere landet wie der
neuere als Fortsetzung des Absatzes an seiner Stelle in der Dokumentreihenfolge
— die flache Blockliste hat keinen Platz für die Ebene, die `typ` nennt, und
ihre Leser brauchen die Reihenfolge, nicht die Ebene. Gemessen über die GP
XXVIII: beide Prüfstände und beide Fehlerinjektionen sind **Zeile für Zeile
identisch** — keiner der sieben betroffenen Entwürfe hatte ein Urteil, das an
den fehlenden Wörtern hing. Was sich ändert, ist der Text, den der
ME→RV-Vergleich für GP XXVII und früher und die Änderungsmaschine lesen: die
712 Blöcke des Offline-Korpus stehen wieder in ihren Einheiten.

**Mitgefunden: eine Fußnote, die nur auf einer Seite verschwand.** RIS druckt
eigene redaktionelle Anmerkungen in den konsolidierten Text („(Anm.: Abs. 2
aufgehoben durch …)"); `lawtext/konsTree.ts` entfernt sie auf der RIS-Seite, und
`annex/annexText.ts` tat es mit demselben Muster auf der Spaltenseite. Über den
Korpus überlebten es trotzdem 110 Vorkommen von „Anm", und die Ursache war
eine einzige Form: **„(Anm. : aufgehoben durch …)"**, mit Leerzeichen vor dem
Doppelpunkt — so setzt die Textebene des PDF die Zeichenläufe zusammen. Die
Beilage trug damit Wörter, die der geltende Text nie angeboten bekam, und die
Asymmetrie wurde dem Parser angelastet (BWG §§ 7, 22, 35, 44, 63, 64, 70a,
77a, 79, 99c). Nicht mitgeweitet wurden zwei Nachbarformen: „(Anm. 1)" ist
eine Fußnotenmarke, die beide Seiten behalten, und „Anmerkung 4: …" in der
Anlage 1 der Bäderhygieneverordnung ist die **eigene** Fußnote der Anlage,
also Gesetzestext.

**Das Tor gilt jetzt je Seite, nicht je Dokument (2026-09-10).** Das Kopfpaar
belegt, dass die Spalten dort getrennt wurden, wo das Ressort sie getrennt
hat — aber es belegt das für *ein Dokument*. Die Spaltengrenze ist eine Zahl
für alle Seiten, also wird eine anders gesetzte Seite nicht anders gelesen,
sondern **falsch**, und zwar in Wörtern, die alle echt sind: eine
Hochformat-Fortsetzung in einer Querformat-Beilage, eine schräg gesetzte
Seite, ein gedrehter Block in einer sonst aufrechten. Nichts davon wäre
irgendwo weiter unten aufgefallen. `uprightRuns` berichtet deshalb je Seite,
was es entscheiden musste (`AnnexPage.geometry`, nicht optional: Läufe mit
Text, Läufe gegen die gewählte Vierteldrehung, Läufe schräg zu *jeder*
Vierteldrehung), und `parseAnnexPdf` verwirft eine Seite, deren Breite um mehr
als 1 % von der dominanten Breite des Dokuments abweicht, die einen schrägen
Lauf trägt oder deren abweichend gedrehte Läufe 5 % überschreiten — ein
einzelner Ausreißer darf keine gesunde Seite kosten, eine aufrecht gesetzte
Seitenzahl auf einer gedrehten Seite ist ein Lauf gegen dreißig. Seiten ohne
Text zählen nie mit: auf ihnen kann nichts falsch gelesen werden.
Spaltengrenze und Spaltenkanten werden nur über die belegten Seiten gemessen;
ist keine Seite belegt, liefert der Parser nichts und sagt, warum.

Die Zahl steht in `AnnexParse.droppedPages`, ist nicht optional und ist
**heute für alle 114 PDF-Beilagen 0** — genau das macht das Tor billig genug,
um es vor der ersten solchen Seite zu haben statt nach ihr. Sie geht bis in
die Antwort und auf die Seite (`TextComparisonResponse.droppedPages`, 0 auf
dem Tabellenpfad): fehlt etwas, sagt die Sektion neben dem PDF-Hinweis, wie
viele Seiten nicht gelesen wurden und dass hier fehlt, was auf ihnen steht.
Eine Gegenüberstellung mit einem stillen Loch wäre die schlechtere Antwort —
dieselbe Regel wie bei den einbehaltenen Paragraphen. Optional durfte das
Feld nicht sein: die Sektion prüft `> 0`, und `undefined > 0` ist stumm
falsch.

**Was das Seitentor nicht belegte, und was es seit 11.09.2026 belegt.** Es
belegte Breite, Drehung und Schräglage *innerhalb* einer Seite — nicht, dass
die Spalten dieser Seite dort liegen, wo sie im übrigen Dokument liegen. Das
war die härtere Fehlerart, denn die Spaltengrenze ist eine Zahl für alle
Seiten: eine Seite, deren Bundsteg woanders sitzt, wird nicht anders gelesen,
sondern falsch, und ihre beiden Spalten laufen ineinander — als „neu" und
„entfällt". Vier Kandidaten für ein Tor je Seite waren dafür schon gemessen
und verworfen, drei am 10.09. und einer am 11.09.:

- **Kopfzeile je Seite.** 78 einwandfreie Seiten in 16 Dokumenten drucken das
  Kopfpaar nicht — Titel- und Fortsetzungsseiten. Ein Tor daraus hätte
  gesunde Seiten verworfen.
- **Saubere Spaltengrenze.** 276 einwandfreie Seiten tragen einen Lauf über
  der Grenze, meist eine Überschrift, die sie definitionsgemäß kreuzt.
- **Anteil spannender Läufe.** Über 30 % nur auf Titelseiten und auf den
  Seiten von Sammelnovellen, wo Gesetzestitel über beide Spalten stehen — als
  Tor hätte er die Dokumente getroffen, die den Parser am meisten fordern.
- **Spaltenanfänge je Seite gegen die Seiten mit Kopfpaar** — der Kandidat,
  der als nächster vorgemerkt war. **Gemessen und verworfen (11.09.2026):** der linke
  Textrand einer Seite sagt nichts über ihr Layout, sondern über ihren Inhalt.
  320 einwandfreie Seiten weichen links um mehr als 8 pt vom Dokumentwert ab,
  272 rechts, im Höchstfall um 130 pt — Anlagen und Tabellenseiten, deren
  Zeilen allesamt eingerückt sind (Vergaberechtsgesetz 2026 S. 144–158,
  Pflanzgutverordnung, Abgrenzungsverordnung 2004). Eine Toleranz ohne Kosten
  an gesunden Seiten läge bei 131 pt und finge 1 von 683 gemessenen
  Verrutschungen; eine, die 88 % fängt (8 pt), verwürfe 440 gesunde Seiten
  (13,7 %). Kein Tor, sondern eine Messung des Einzugs.

Auch die Spaltengrenze je Seite zu messen ist *schlechter* als sie über das
Dokument zu messen: 46 Seiten liegen mehr als 10 pt neben der dokumentweiten
Grenze, eine dünn besetzte Titelseite 43 pt. Auf einer Seite mit wenig Text
ist der leerste Streifen nicht der Bundsteg, sondern leeres Papier. Mit einem
weiteren Fenster gemessen (11.09.2026) sind es 73 Seiten über 20 pt daneben,
und alle sind gesund: es sind die Seiten, auf denen eine Spalte fast leer ist,
weil der Entwurf dort einfügt.

**Das Kopfpaar sagt nicht nur, dass es da ist, sondern wo (11.09.2026).** Die
beiden Etiketten stehen zentriert über den beiden Spalten, also ist die Mitte
zwischen ihnen die Aussage des Ressorts darüber, wo seine Spalten *liegen*.
(Hier stand zuerst „dieselbe Zahl, die `columnBoundary` aus der Tinte schätzt";
das ist widerlegt — sie ist der Bundsteg nur bei gleich breiten Spalten, siehe
„Die Naht ist ein Verrückungsmesser" unten.) Diese **Naht** (`headerSeam`) ist
über den Korpus stabil, wie es
keiner der Inhaltswerte ist: von den 3.121 Seiten mit Kopfpaar liegen 3.118
innerhalb von 0,5 pt der Naht ihres Dokuments, drei zwischen 1,59 und 1,74 pt,
und 110 der 114 Beilagen drucken auf jeder Kopfseite denselben Wert. Die
*Anwesenheit* des Kopfpaars bleibt dabei eine Forderung an das Dokument und
wird keine an die Seite — je Seite geprüft wird nur seine **Lage**, und nur
dort, wo eine Seite es überhaupt druckt.

Einzeln genommen taugt kein Etikett dafür: die Weinrecht-Sammelverordnung 2024
setzt „Geltende Fassung" auf Seite 1 um 8,2 pt weiter rechts und
„Vorgeschlagene Fassung" um 4,9 pt weiter links, ein Tor auf ein Etikett hätte
also eine einwandfreie Seite verworfen. Die Etiketten sind aufeinander
zugerückt, die Naht zwischen ihnen ist um 1,6 pt gewandert. Dasselbe gilt für
die drei Beilagen, die die Überschrift qualifizieren („Geltende Fassung nach
Inkrafttreten EuGB-VVG") — das ändert die Breite eines Etiketts und nicht die
Mitte zwischen beiden.

Die Toleranz ist **4 pt**: mehr als das Doppelte der größten Abweichung, die
der Korpus druckt, und zugleich der weiteste Wert, der eine um 5 pt verrückte
Seite noch verwirft — 5 pt ist die kleinste Verrückung, die überhaupt gemessen
etwas ändert. Der Bezugswert ist nicht der Median der Nähte, sondern die
**Mehrheit**: mischt ein Dokument zwei Layouts, sind die Nähte zwei Haufen,
und der Median zwischen zwei Haufen ist ein Wert, den keine Seite gedruckt hat
— beide Haufen lägen jenseits der Toleranz und die ganze Beilage käme leer
heraus.

*Reichweite und Kosten, gemessen durch `parseAnnexPdf` selbst:* je eine Seite
jeder der 114 Beilagen um −40 bis +40 pt verschoben und neu geparst. Eine
Verschiebung um 5 pt ändert den Parse von 41 Beilagen, eine um 40 pt den von
104; das Tor verwirft **663 der 683 Verschiebungen, die etwas geändert haben
(97,1 %)** und **keine einzige der 3.213 unveränderten Seiten**. Von den 20
Verfehlungen sind 15 die zwei Zielseiten ohne Kopfpaar und 5 die eine Beilage,
deren Kopfpaar nur auf einer einzigen Seite steht — eine Seite, die gegen
nichts gehalten wird, wird gegen sich selbst gehalten (7 der 114 drucken es
genau einmal). Das ist die ehrliche Grenze des Tors, und sie ist die Grenze
des Belegs, nicht der Regel.

**Verworfen, mit Zahlen, auf demselben Prüfstand:**

- **Läufe über die Grenze ohne die spannenden.** Der alte Kandidat „ein Lauf
  kreuzt die Grenze" trifft 276 Seiten, weil er die Überschriften mitzählt;
  ohne sie tragen nur 12 Seiten einen solchen Lauf, zwei tragen zwei, keine
  drei. Ein Tor bei „mehr als zwei" kostet heute nichts und fängt 50 % — aber
  seine Reichweite schwankt zwischen 13 % (−20 pt) und 96 % (+20 pt) und
  bricht bei ±40 pt wieder ein, weil ein Lauf, der die Grenze um mehr als
  18 pt überhängt, definitionsgemäß als spannende Überschrift durchgeht. Er
  ist also gerade dort blind, wo der Fehler am größten ist, und feuert
  daneben auf 41 % der Seiten, die verrückt sind, ohne dass es etwas ändert.
- **Die Naht erst dann verlangen, wenn sie etwas ändert** — also nur
  verwerfen, wenn ein Lauf bei einem Schnitt an der eigenen Naht in der
  anderen Spalte landete. Das schonte 134 der 229 gesunden, aber verrückten
  Seiten und kostete 99 der 683 echten Fehler. Denn eine Seite kann auch über
  die **Spaltenkanten** falsch gelesen werden: ihre Zeilen werden gegen die
  Kante des Dokuments auf Umbruch geprüft, und genau so zeigten 70 Paragraphen
  einmal ihre eigene geltende Überschrift als neuen Text. Eine verworfene
  Seite ist ein Loch, von dem die Leserin erfährt; eine falsch gelesene sind
  Wörter, die niemand von denen des Ressorts unterscheiden kann. Also
  entscheidet die Naht und nicht ihre Folgen.

Und der Befund, der über allen steht: **GP XXVIII enthält keine solche Seite.**
Vier der 114 Beilagen drucken überhaupt mehr als einen Nahtwert, und deren
Streuung ist 1,74 pt. `droppedPages` bleibt für alle 114 bei 0, beide
Prüfstände Zeile für Zeile unverändert. Das Tor ist damit dasselbe Geschäft
wie das vom Vortag: es vor der ersten solchen Seite zu haben statt nach ihr.

**Die Naht ist ein Verrückungsmesser, kein Bundsteg (11.09.2026).** Naheliegend
war, sie auch *schneiden* zu lassen: das Ressort druckt doch, wo seine Spalten
sich teilen, während `columnBoundary` dieselbe Stelle aus der Tinte schätzt.
Über die 114 Beilagen liegen beide in **100** Fällen innerhalb von 0,5 pt
beieinander und in **112** innerhalb von 4 pt; genau zwei weichen weiter ab —
die **Abgrenzungsverordnung 2004** um 13,7 pt und das
**EU-ESG-Rating-Verordnung-Vollzugsgesetz** um 57,0 pt. An ihnen zeigt sich,
dass die Naht den Bundsteg gar nicht behaupten *kann*: jedes Etikett ist über
seiner eigenen Zelle zentriert, die Mitte zwischen ihnen ist also das Mittel
der beiden Spalten**mitten** — und das ist der Bundsteg nur bei gleich breiten Spalten,
sonst liegt es ein Viertel der Breitendifferenz daneben. Nachgerechnet an den
drei Beilagen, an denen es zählt:

| Beilage | Bundsteg | Tinte | Naht | rechte Spalte breiter um |
|---|---:|---:|---:|---:|
| EU-ESG-Rating-VO-Vollzugsgesetz | 438,01 | 381 | 437,98 | 0,2 pt |
| Abgabenänderungsgesetz 2025 | 412,96 | 413 | 415,93 | 19,1 pt |
| Abgrenzungsverordnung 2004 | 395,09 | 397 | 410,71 | 62,6 pt |

Die Verzerrung gehört der Vorlage und ist deshalb auf **jeder** Seite eines
Dokuments dieselbe. Genau das macht die Naht zum guten Tor und zum schlechten
Schätzer: eine um 5 pt verrückte Seite verschiebt ihre Naht um 5 pt, gleich wie
breit die Spalten sind.

*Was der Tausch gebracht und gekostet hätte, durch `parseAnnexPdf` selbst
gemessen.* Die Naht als Schnitt repariert **eine** Beilage. Das
EU-ESG-Vollzugsgesetz hat zwei Seiten, davon eine Titelseite, deren Block über
die volle Breite den größten Teil der Tinte des Dokuments stellt; der leerste
Streifen liegt deshalb bei 381 und damit *innerhalb* der linken Spalte, die bis
434,5 läuft. Das Wort „behördlichen" stand deshalb in der vorgeschlagenen
Fassung, wo es nicht hingehört (repariert noch am selben Tag, siehe „Der
Bundsteg steht in den Zeilen, die zwei Spalten haben" unten) — die Naht trifft
den Bundsteg dieser Beilage auf 0,03 pt. Sie zerstört dafür das
**Abgabenänderungsgesetz
2025**: 1.285 Läufe der rechten Spalte zerschneidet sie, die damit zu
spannenden Überschriften werden. 111 Paragraphen ändern ihren Text, § 73b
Mindestbesteuerungsgesetz und § 85a BAO verschwinden ganz, drei Urteile wandern
— darunter § 70 Mindestbesteuerungsgesetz von **einbehalten auf bestätigt**,
also eine Zusicherung über einen zerlegten Absatz. Dazu die
Abgrenzungsverordnung 2004, deren Anlagentabelle in § 7 zu Wortsalat wird.
Zusammen: 5 Beilagen betroffen, 3 besser, 2 schlechter, 7 Urteile bewegt.

Und der Gewinn wäre **kein Gewinn auf der Seite**: der eine reparierte
Paragraph, FMABG § 2, wird heute vom Tor einbehalten (94 % Deckung) und bliebe
es auch mit der Naht. Sein Text und sein Wortdiff werden also so oder so im
Server geleert; die Reparatur änderte für die Leserin nichts, der Schaden
dagegen ginge live.

**Drei weitere Regeln gemessen und verworfen**, damit sie niemand neu erfindet:

- **Die Naht als Anker des Suchfensters** statt als Antwort. `columnBoundary`
  sucht den leersten Streifen in [0,45 w; 0,55 w] — einem Fenster um die
  Seitenmitte, die niemandes Aussage über irgendetwas ist. Um die Naht gelegt,
  findet es beim EU-ESG-Vollzugsgesetz 416 statt 381; dort überhängt
  „behördlichen" den Schnitt aber um 18,5 pt, gilt damit als spannende
  Überschrift, und die ganze Zeile fällt aus *beiden* Spalten. Eine Beilage
  schlechter, keine besser.
- **Der Bundsteg als die Lücke, die die meisten Zeilen teilen** — Deckung je
  Zeile statt je Lauf, wobei jede Zeile nur ihre eigene größte Lücke frei
  lässt. Repariert die 7 Paragraphen des Informationsfreiheits-
  Anpassungsgesetzes BMWET, deren rechte Spaltenzeilen heute knapp als spannend
  gelesen werden, hilft dem EU-ESG-Vollzugsgesetz aber nicht: dessen Titelseite
  trägt drei Zeilen über die volle Breite, die überall decken. (Das ist die
  Richtung, die am selben Tag doch noch getragen hat — es fehlte ihr der Test,
  der eine Titelzeile von einer Zweispaltenzeile trennt; siehe „Der Bundsteg
  steht in den Zeilen, die zwei Spalten haben" unten.)
- **Beides nur über die Kopfseiten gemessen**, also über die Seiten, die
  überhaupt zwei Spalten tragen. Das trifft endlich das EU-ESG-Vollzugsgesetz
  (die Titelseite fällt heraus, Ergebnis 438) und kostet die
  Bilanzbuchhaltungsgesetz-Novelle, die ihr Kopfpaar auf 2 von 7 Seiten druckt:
  § 365m Gewerbeordnung verschwindet, §§ 365n und 366b werden zu Bruchstücken.

Auch die naheliegendste Notbremse — **die Beilage verweigern, wenn Tinte und
Naht zu weit auseinanderliegen** — ist keine Messung, sondern eine Zahl zwischen
zwei Punkten: zwischen 13,71 pt (Abgrenzungsverordnung, Tinte richtig) und
56,98 pt (EU-ESG, Naht richtig) liegt im Korpus nichts. Jede Schwelle dort ist
an n = 1 angepasst, und der Preis eines Irrtums wäre eine ganze Beilage.

**Also bleibt die Tinte der Schnitt und die Naht das Tor.** Kein Paragraph, kein
Urteil, keine Zeile ändert sich: PDF-Pfad 1.341/244/1.898, Tabellenpfad
986/60/801, `droppedPages` 0, alle vier Zusicherungen 0 — vorher wie nachher.
Die UWG-Beilage der Golden-Tests druckt auf allen neun Seiten dieselbe Naht
(420,89) und ihre Tinte liegt 0,11 pt daneben, die Fixture bewegt sich also
unter keiner der Regeln. Der Befund steht als Kommentar bei `columnBoundary`
und `headerSeam` und als Test in `tests/annexPdf.test.ts`: eine Beilage mit
ungleich breiten Spalten schneidet am Bundsteg, nicht an ihrer Naht.

**Der Bundsteg steht in den Zeilen, die zwei Spalten haben — nicht in der
Tinte (11.09.2026).** Die drei verworfenen Regeln oben haben eines gemeinsam:
sie suchen weiter im *ganzen* Papier nach einer Lücke. Die Titelseite des
EU-ESG-Vollzugsgesetzes ist aber nicht irgendeine Störung, sondern eine Seite,
die gar nicht zweispaltig gesetzt ist — und eine solche Seite hat nichts
darüber zu sagen, wo zwei Spalten sich teilen. Fünf der sieben Läufe, die den
echten Bundsteg bei 438 überdecken, stehen auf ihr; bei 381 hat das Dokument
zufällig eine Wortlücke, und deshalb landete der Schnitt *innerhalb* der linken
Spalte, die bis 434,5 läuft.

Gefragt werden deshalb zuerst die **Zeilen, die wirklich zwei Spalten tragen**.
Eine Zeile trägt zwei Spalten, wenn sie *eine* auffällig breite Lücke hat: ihre
größte muss mindestens doppelt so breit sein wie jede andere Lücke derselben
Zeile (`PARTING_DOMINANCE`). Der Test ist **maßstabsfrei**, und das ist der
Punkt — die beiden Formen, die nicht mitreden dürfen, scheitern beide daran,
dass bei ihnen keine Lücke heraussticht: eine **gesperrt gesetzte Titelzeile**
(alle Lücken 12 pt, auf derselben Titelseite auch alle 25 pt) und eine
**Tabellenzeile** (alle Spaltenabstände gleich breit). Eine absolute Schwelle
kann das nicht: 12 pt sind auf der Titelseite ein Wortabstand und 10 pt sind
der ganze Bundsteg der Abgrenzungsverordnung 2004.

Jede solche Zeile stimmt für ihre ganze Lücke ab; der Bundsteg ist das Band,
das *alle* freilassen — also der Schnitt der Lücken. Über die 114 Beilagen sind
80 einstimmig, 110 erreichen 92,9 %, und die Bänder sind 1 bis 13 pt breit
(Median 7).

**Das Band ist aber keine Antwort, und das ist gemessen.** Nur Zeilen mit
beiden Spalten stimmen ab, also kann eine einseitige Zeile *im* Band beginnen:
bei der Gewerbeordnungs-/Emissionsschutz-Beilage ist das Band [420, 426],
während die Fortsetzungszeile „linien umgesetzt:" bei 422,7 anfängt — in der
Mitte des Bandes geschnitten wird sie zur spannenden Überschrift, und § 382
verliert die Wörter „linien umgesetzt:" aus der vorgeschlagenen Fassung. Welche
Stelle des Bandes der Schnitt bekommt, ist eine Frage an *alle* Läufe, und die
beantwortet die Tinte, mit derselben Regel wie bisher — nur in einem kleineren
Heuhaufen. Beim EU-ESG-Vollzugsgesetz deckt die Titelseite das ganze Band
[435, 441] gleichmäßig, der Schnitt landet also in seiner Mitte: 438.

Die Tinte sucht das ganze Fenster nur noch, wenn die Zeilen sich auf kein Band
einigen, und die eine Bedingung dafür ist strukturell: **ein Band, das aus dem
Suchfenster hinausläuft, ist keines.** Die Abgrenzungsverordnung 2004 setzt
ihre rechte Spalte 62,6 pt breiter und rückt die meisten Zeilen ein, das
breiteste einige Band ist deshalb der Einzug und endet erst am Fensterrand 464
— die Tinte liest diese Beilage richtig (397) und behält sie. Über die 114
Beilagen entscheidet das Band 113-mal und die Tinte einmal.

*Verworfen, mit Zahlen:* eine **Mindest-Einigkeit** von 90 % auf das Band. Sie
klingt richtig — der Bundsteg ist auf *jeder* Zweispaltenzeile frei —,
entscheidet aber genau eine der 114 Beilagen (eine Lehrberufslisteverordnung
mit 87,3 %), bewegt dort keinen Paragraphentext und kein Urteil, und
verwirft die **bessere** Antwort: 424 liegt dort 6,2 pt von der linken Spalte
und 6,1 pt von der rechten, die 421 der Tinte dagegen 3,2 und 9,1. Eine Zahl,
die in die 4-Punkte-Lücke zwischen zwei Dokumenten gelegt wird und noch nie
recht hatte, ist keine Messung. Ebenso geprüft: `PARTING_DOMINANCE` 1,5 und
`MIN_PARTING` 4 und 10 ändern über den ganzen Korpus **keine einzige**
Spaltengrenze; erst 3,0 bewegt zwei Beilagen um 2 bis 3 pt, ohne dass ein
Paragraph oder ein Urteil folgt. Die Konstanten stehen also auf einer Ebene und
nicht an einer Kante.

*Wirkung, § für § durch `parseAnnexPdf` gemessen.* 23 der 114 Beilagen bekommen
eine andere Spaltengrenze, 21 davon um 2 oder 3 pt innerhalb ihres eigenen
Bundstegs und ohne jede Folge. **Keine Beilage verliert ein Zeichen**, eine
gewinnt 3.826: das Informationsfreiheits-Anpassungsgesetz BMWET, dessen Schnitt
von 421 auf 419 geht — dort ist der Bundsteg 0,1 pt breit (linke Spalte bis
419,1, rechte ab 419,2), und 30 Zeilen seiner rechten Spalte galten bei 421 als
spannende Überschriften. Sieben Paragraphen bekommen ihren Text zurück (§§ 8,
13, 21, 24, 29, 78, 93), darunter § 93 „… tritt" → „… tritt mit 1. September
2025 in Kraft." und § 13 „… tritt das Bundesgesetz zur" → „… außer Kraft.".

**Einer davon ist mehr als ein zurückgewonnener Satz**, und er ist der Grund,
warum diese Lesefehler zählen. Beim **Investitionskontrollgesetz § 21** brachen
*beide* Spalten an derselben Stelle ab — „… kann in seinem Zuständigkeitsbereich
und (6) bis (8) …" —, waren damit wortgleich, und die Seite zeigte den
Paragraphen als **unverändert**, hinter einer Zahl eingeklappt. Der Entwurf
ändert ihn aber: aus „haftet für die korrekte Behandlung" wird „haftet für die
korrekte bzw. die rechtmäßige Behandlung". Jetzt steht die Änderung da, und das
Tor bestätigt sie — 95,8 % Deckung über 72 vergleichbare Wörter, wo es vorher
19 waren und gar kein Urteil fällig war. Das ist das einzige Urteil, das sich
über den Korpus bewegt, und es bewegt sich von *ungeprüft* auf *bestätigt*.

Beim EU-ESG-Vollzugsgesetz wandert „behördlichen" aus der vorgeschlagenen in
die geltende Fassung, wo es hingehört; das Urteil bleibt (einbehalten, 94 %
Deckung), die Leserin bekommt dort also so oder so nichts zu sehen — der Gewinn
ist, dass die Lesung stimmt.

Prüfstände: PDF-Pfad **1.341/244/1.898 → 1.342/244/1.897** bei unveränderten
Ursachen 212 / 15 / 17, ≥ 99 % gedeckt 1.617 wie vorher, `droppedPages` 0, alle
vier Zusicherungen 0. **Der Tabellenpfad bewegt sich nicht**, Zeile für Zeile:
1.008/55/795, Ursachen 43 / 5 / 7. Die Fehlerinjektion ist auf dem Tabellenpfad
Zeile für Zeile identisch; auf dem PDF-Pfad wächst nur die Grundmenge um die
zwei Paragraphen, die jetzt genug Text für eine Injektionsstelle tragen (918 →
920, 881 → 883, 880 → 882), die Trefferquoten bleiben L 62,1 %, R-alt 67,0 %,
R-neu 77,0 % und die Fehlalarme ohne Injektion 18 und 21. Die UWG-Beilage der
Golden-Tests schneidet unverändert bei 421, die Fixture wurde nicht neu
erzeugt. Zeilen, die als spannende Überschrift gelesen werden, fallen über den
Korpus von 836 auf 810.

**Die Überschriften-Übernahme war asymmetrisch, und das kostete 70
Paragraphen (2026-09-10).** Eine Überschrift steht *über* dem Paragraphen,
den sie benennt, also übergibt `unitsOfColumn` beim Erreichen eines Markers
die kurzen Schlusszeilen der vorigen Einheit an die neue — „kurz" heißt: die
Zeile hat die Kante ihrer Spalte nicht erreicht, ist also nicht umbrochen.
Gemessen wurde die linke Spalte gegen den Bundsteg (421) und die rechte gegen
den **Seitenrand** (842). Die rechte Spalte endet aber im Median 84,8 pt vor
dem Seitenrand (min 18,5, max 88,5), also feuerte `> Breite − 18` dort nie:
über den ganzen Korpus zählte keine einzige rechte Zeile als umbrochen. An
der Radonschutzverordnung nachgesehen: die Zeile „Schutz vor Radon bei
Überschreitung des Referenzwertes und bei" endet links bei x = 407,2 (gegen
421 umbrochen, Übernahme gestoppt) und rechts bei 743,0 (gegen 842 nie
umbrochen, übernommen). Die Überschrift landete damit nur in der rechten
Spalte, der Wortdiff zeigte sie als **neu**, und das RIS führt sie längst.

Jede Spalte wird jetzt an ihrer eigenen Kante gemessen (`columnEdge`), und
die Kante wird aus den Zeilen selbst gelesen statt angenommen: die Beilagen
sind eine Vorlage (links 417,6 pt, rechts 757,1 pt auf 842 pt in fast allen
114), aber die eine, die es nicht ist — rechte Spalte von 382 bis 799 —,
würde jede Konstante falsch messen. **Die längste Zeile ist nicht die Kante:**
das Budgetbegleitgesetz 2027-2028 hat drei linke Zeilen jenseits seiner Kante
(438,7 / 435,7 / 422,6 gegen 417,6), und mit dem Maximum fielen die
umbrochenen Zeilen von 1.651 auf 3 — Fließtext wäre dann als Überschrift
gelesen worden. Also wird das oberste Prozent der Zeilenenden beiseitegelegt,
mindestens aber eine Zeile; unter zehn Zeilen gilt weiter die äußere Grenze
der Spalte, weil eine Kante aus einer Handvoll Zeilen keine Messung ist.

**Die Toleranz hat eine eigene Zahl bekommen.** „Nahe genug an der Kante" war
die Bundsteg-Toleranz (18 pt), und die Beilagen sind **im Blocksatz** gesetzt:
ein 1-pt-Histogramm des Abstands über 163.905 Zeilen zeigt 39.078 Zeilen
innerhalb eines Punktes ihrer Kante und 30.768 innerhalb von 3 bis 4 Punkten —
zwei Spitzen, die zweite ist die rechte Spalte, deren wenige breiteste Zeilen
die Schätzung 3,5 pt über das Ende ihres Fließtexts hinausschieben. Ab 6 pt
ist es ein dünner Schwanz: 868 Zeilen in 6–7 pt gegen 8.859 in 4–5. Also
`WRAP_TOLERANCE = 6`, getrennt von `GUTTER_TOLERANCE = 18`. Gegen die
RIS-Deckung durchgefahren (4, 6, 8, 12, 18): 18 verliert (72,3 %), 4 steht auf
der Spitze, 6 ist das Tal.

**Fünf Inhaltsverzeichnis-Einträge gingen als neues Recht hinaus
(2026-09-10).**
`unitsOfColumn` verwirft einen Eintrag schon, wo die Beilage den Paragraphen
auch selbst druckt — das längere Vorkommen gewinnt. Übrig blieben die
Einträge zu Paragraphen, die die Beilage *nie* druckt; die fanden in der
anderen Spalte keinen Partner und wurden deshalb als „neu" angekündigt. Vier
der fünf stehen seit Jahren in Geltung, mit genau der Überschrift, die die
Beilage druckt (§ 79a Mindestbesteuerungsgesetz, § 13a
GAP-Strategieplan-Anwendungsverordnung, § 11 Energie-Control-Gesetz, § 77d
BWG), und zwei dieser Entwürfe sagen ausdrücklich, dass sie das
*Inhaltsverzeichnis* ändern. Der fünfte, § 49a Schifffahrtsgesetz, ist
wirklich neu — seine Inhaltszeile stand im nachgedruckten
Inhaltsverzeichnis, während die Beilage §§ 47a, 47b, 48a und 49b darunter
vollständig druckt; verworfen wird also die Inhaltszeile, nicht die
Bestimmung. Die Regel dafür braucht keine Längenschranke: eine Bestimmung hat
einen Körper, und ein Körper enthält einen Satz. Die fünf Schwänze laufen von
20 bis 58 Zeichen und tragen kein einziges Satzzeichen. Ein blankes „§ 5." und
die Auslassung des Ressorts („§ 4a. Kontrollregister …") bleiben stehen: das
erste sagt etwas (ein Paragraph entfällt), das zweite sagt, dass die Beilage
den Text weggelassen hat.

**Ein Bindestrich wurde auf das Zeugnis der falschen Zeile aufgelöst
(2026-09-10).** Ein Wortumbruch ist im PDF nichts als ein Bindestrich am
Zeilenende, und die deutsche Rechtssprache ist voll von echten:
„Staatsschutz- und Nachrichtendienst-Gesetz". Aufgelöst werden darf er nur,
wenn die Zeile, **die ihn trägt**, bis an die Spaltenkante gelaufen ist —
`joinLines` fragte aber die Zeile *danach*. Die beiden Fehler sind
Spiegelbilder: ein echter Umbruch blieb stehen, wenn die Folgezeile zufällig
kurz war, und ein Ergänzungsstrich des Verfassers wurde verschweißt, wenn die
Folgezeile zufällig voll war („Staatsschutzund"). Der Fehler ist so alt wie
der Parser und war auf der rechten Spalte bis zu diesem Tag wirkungslos, weil
dort keine Zeile je als umbrochen zählte. Über die 114 PDF-Beilagen ändern sich
135 Zeilen (121 kürzer, 14 länger), netto −340 Zeichen von 7,46 Mio., und die
Deckung steigt: ≥ 99 % gedeckt 1.612 → 1.617, bestätigt 1.346 → 1.347,
einbehalten 235 → 234, kein Deckungsband unter 99 % wächst. Sichtbar an
„forstassistenten- ausbildungsverordnung" (§ 4 der
Forstassistenten-Ausbildungsverordnung, 94 → 97 %) und an
„genehmigungsaufla- gen" in der Gewerbeordnung (1 von 4 → 3 von 4
Paragraphen ≥ 99 %).

*Wirkung des Seitentors und der Kantenmessung zusammen*, beide Läufe mit
demselben Tor-Code gemessen:

| PDF-Pfad, GP XXVIII | vorher | nachher |
|---|---:|---:|
| geprüfte Paragraphen | 2.188 | 2.161 |
| ≥ 99 % im RIS gedeckt | 1.584 (72,4 %) | 1.612 (74,6 %) |
| p10 der Deckung | 90 % | 93 % |
| bestätigt | 1.286 | 1.346 |
| einbehalten | 312 | 235 |
| … geltende Fassung nicht im RIS | 243 | 213 |
| … zeigt Geltendes als neu | 63 | 15 |
| … nicht im Entwurf | 6 | 7 |
| ungeprüft | 1.889 | 1.902 |
| Zeilen insgesamt | 4.062 | 4.057 |
| unverändert / geändert / neu | 493 / 2.847 / 279 | 529 / 2.811 / 274 |
| ausgelassen / ohne Platz | 211 / 272 | 229 / 283 |

Zusicherungen: null, wie vorher. Je Paragraph gerechnet werden 80 besser und
15 schlechter; der schlechteste Fall ist die
Bundesvermögen-Ermächtigung § 4 des Budgetbegleitgesetzes (100 → 71 %), wo
ein Tabellenfragment mitgelesen wird — einbehalten, nicht falsch gezeigt, was
genau die Fehlerart ist, die das Tor haben soll.

**Gemessen und verworfen, damit es niemand neu erfindet.**

- **Zentrierung als Überschriftentest.** 833 Zeilen reinen Fließtexts sind so
  symmetrisch wie 1.564 Überschriften — eine Blocksatzzeile endet an der
  Kante und beginnt am Rand, also sind beide Abstände null. `AnnexLine.leftStart`
  wird deshalb von nichts gelesen und sagt das im Kommentar.
- **„Einmal begonnen, weiter übernehmen".** Die Überschriften-Übernahme
  fortzusetzen, sobald sie begonnen hat, senkt die Meldungen von 15 auf 7 —
  verschlechtert aber 35 Paragraphen statt der 15 oben, drei davon schwer
  (Deckung 100 → 43, 57 → 0, 38 → 0 %).
- **Maximum und p95 als Spaltenkante**, **Toleranz 4** (auf der Spitze des
  Histogramms) und ein **optionales `geometry`**: eine Seite, die nicht sagen
  kann, wie sie gelesen wurde, müsste geglaubt werden.

**Was offen bleibt.** Die 13 Überschriften-Meldungen, die die Regel noch
abgibt, stehen alle auf der Kante der Toleranz — dort unterscheiden sich die
beiden Spalten um etwa 4 pt in der Breite, also entscheidet sie und nicht der
Satz. Und `unplaced` mischt jetzt
zwei Dinge: den Vorspann einer Spalte und die Einträge eines nachgedruckten
Inhaltsverzeichnisses (272 → 283 Blöcke). Gezählt wird beides, gesagt wird
der Leserin keines von beiden.

**Zwei Bestimmungen unter einer Nummer: die Beilage hat die Zelle, wir haben
sie weggeworfen (11.09.2026).** Offen stand die Frage, ob die Beilage dort,
wo die Seite zwei Bestimmungen unter einer Nummer zeigt, wirklich keine
Zelle mit „§ 8." druckt oder ob unser Tabellenparser sie verliert. Nachgesehen
in den Beilagen selbst, Fall für Fall: **beides kommt vor, und die Mehrheit
ist unsere Schuld.**

- **Die Zelle steht in der *rechten* Spalte.** Benennt ein Entwurf eine
  Bestimmung um, druckt die Beilage beide Nummern in **einer** Zeile — links
  die geltende „§ 7.", rechts die vorgeschlagene „§ 8." —, und
  `parseTextComparison` las die linke und entfernte anschließend *jedes*
  `<gldsym>` aus dem Text. Die zweite Nummer verschwand damit vollständig:
  kein Etikett, kein Wort. Über die GP XXVIII tun das **42 Zeilen**, und sie
  sind fast durchwegs Umbenennungen — B-VG Art. 90a→94a, Konfitürenverordnung
  § 7→§ 8, Strafregistergesetz § 2→§ 1a, Blutspenderverordnung §§ 9 bis 14 um
  eins nach unten, StGB §§ 322/323/324→324/326/328. Das Etikett muss die
  **linke** Nummer bleiben — gegen sie hält die RIS-Prüfung die linke Spalte —,
  also bleibt die rechte künftig dort stehen, wo das Ressort sie gedruckt hat:
  im Text ihrer Spalte, wo der Wortdiff sie als das zeigt, was sie ist.
- **Die Beilage nennt den Paragraphen in ihrer Auslassungszeile.** „§ 16
  Abs. 1 bis 24 …" ist nach dem Rundschreiben die Aussage, dass § 16 hier
  beginnt und seine ersten 24 Absätze unverändert sind — ein `<gldsym>` steht
  dort keines. Im Verbrechensopfergesetz gingen der neue § 16 Abs. 25 und der
  neue § 9b Abs. 6 deshalb unter §§ 10 und 7c hinaus. Diese eine Beilage ist
  die ganze Grundmenge der GP XXVIII: **5 Zeilen dieser Form unter 2.285
  ausgelassenen**, die übrigen 121 lesbaren Beilagen haben keine. Gelesen wird
  sie nur mit Untergliederung (`Abs.`/`Z`/`lit`) und nur, wenn beide Spalten
  dieselbe Zeile drucken — „§§ 1. bis 26. …" lässt sechsundzwanzig Paragraphen
  aus und eröffnet keinen.
- **Die Beilage hat wirklich keine Zelle.** Im Strafvollzugsgesetz setzt das
  Ressort den neuen § 20a als fett-kursiv markierten *Text* in einen
  `<absatz typ="satz">` — „20a. (1) Die Strafvollzugsbehörden können …" —, und
  das Paragraphenzeichen fehlt in der XML ganz. Hier ist nichts zu reparieren,
  ohne aus Typografie eine Bezeichnung zu raten; dieselbe Entscheidung wie bei
  `<symbol>`, das eine Ziffer ist und keine Bestimmung.
- **Und ein Rest, der eine andere Frage ist:** eine *einseitige* Überschrift.
  Steht die `<ueberschrift typ="para">` eines neuen Paragraphen nur in der
  rechten Spalte, greift die Regel nicht, die eine beidseitig gedruckte
  Überschrift dem Paragraphen *darunter* zuschlägt, und die Zeile erbt den
  darüber: SchOG § 129 trägt so die Überschrift des § 130d, GTelG § 23 den
  „6. Abschnitt" samt Überschriften, Tierschutz-SV § 17 den „7. Abschnitt".
  Die Zeile einfach fallen zu lassen wäre falsch — sie *ist* eine Einfügung,
  und eine gezeigte Änderung verschwinden zu lassen ist derselbe Fehler wie
  bei der Auslassungssyntax. **Gemessen und beantwortet am 11.09.2026, unten.**

*Gemessen* (`harness/annexPdf.ts --xml`, GP XXVIII): Tabellenpfad
**986/60/801 → 998/62/791** Paragraphen, nach Ursache 50/6/4 → 52/6/4,
≥ 99 % gedeckt 961 → 973, Zeilen ohne Paragraphenangabe 273 → 266 (als
Änderung gezeigt 79 → 77), alle vier Zusicherungen 0. Der **PDF-Pfad ist
Zeichen für Zeichen unverändert** — `parseTextComparison` wird dort nicht
aufgerufen —, und die Fehlerinjektion bleibt in jeder Zelle gleich (Grundmenge
245/237/236 → 246/238/237, L 171, R-alt 183, R-neu 194 → 195; Fehlalarme ohne
Injektion unverändert 6 und 4, dieselben vier Paragraphen).

**Dreizehn Urteile ändern sich, jedes einzeln gelesen, keines zum
Schlechteren gegenüber einer Zusage:** elf gehen von *ungeprüft* auf
**bestätigt** (B-VG Art. 52a und 52b, StGB §§ 322, 323, 324, VOG § 7a,
Straßenverkehrs-Sicherheitsmanagement-VO § 8, StRegG § 15, Blutspender-VO
§§ 10 und 14, BohrarbV § 19), zwei von *ungeprüft* auf **einbehalten** (IVS-G
§§ 9 und 14). Die Ursache ist in allen dreizehn dieselbe: bei reiner
Umbenennung waren beide Spalten nach dem Entfernen der Bezeichnungen
wortgleich, die Zeile ging als **unverändert** hinaus und wurde hinter einer
Zahl eingeklappt — **25 Zeilen der GP XXVIII**, jede eine Umbenennung, die die
Leserin nicht sehen konnte. Jetzt sind es Änderungen, also wird der Paragraph
geprüft. Die beiden IVS-Paragraphen fallen dabei an einer *bekannten*
Schwäche durch, nicht an einer neuen: diese Beilage druckt die Überschrift des
nächsten Paragraphen ans Ende der Zelle des vorigen („… BGBl. Nr. 99/1988.
Strafbestimmung"), und weil die beiden Spalten verschiedene Überschriften
tragen, bleibt sie im Text stehen. Der Einbehalt ist damit richtig — die linke
Spalte, wie *wir* sie lesen, ist nicht der geltende § 9 —, und er trifft
Paragraphen, die vorher gar kein Urteil hatten. Dazu kommen vier neue
Paragraphen der Auslassungsregel (VOG §§ 2, 4, 9b, 16), von denen einer
bestätigt wird und drei ungeprüft bleiben, weil eine Einfügung keinen
geltenden Text hat, gegen den sie zu halten wäre.

**`designationKey` bleibt, wie es ist — und das ist gemessen, nicht
vermutet.** Der Schlüssel schneidet still ab: er liest die führende
Bezeichnung und ignoriert den Rest. Vorgeschlagen war, einen *unerklärten*
Rest zum `null` zu machen, damit eine Zeile lieber ungeprüft bleibt als gegen
den falschen Paragraphen gehalten zu werden. Über die GP XXVIII tragen von
**11.169 Zeilen mit Bezeichnung** genau **555** überhaupt etwas neben ihr, und
die Klassen sind sauber — sie sagen nur das Gegenteil: **434 davon sind
Anlagenüberschriften mit Titel** („Anlage 1 Mindestgliederung Bilanz", „Anlage
3 zu § 10 und § 11"), deren Schlüssel damals überwiegend und seit dem Schritt
unten durchgehend *richtig* ist. Die Regel würde also viele richtige Schlüssel
wegwerfen, um eine Handvoll falsche zu verhindern. Auf der RIS-Seite stellt
sich die Frage gar nicht: von den **1.959 verschiedenen Labels** der
beteiligten Gesetze trägt **keines** einen Rest, `indexOf` liest also reine
Bezeichnungen. (Was die Beinahe-Injektivität dieses Index angeht, hat die
Nachprüfung vom 11.09.2026 die damalige Aussage widerlegt — unten.)

Die Messung hat dafür einen anderen Rest benannt, und der war kein Abschneiden
sondern ein *falscher* Schlüssel: zitiert der Titel einer Anlage Paragraphen,
baute `designationKey` daraus einen zusammengesetzten Schlüssel („Anlage 3 zu
§ 10 und § 11" → `Anl 3 § 10 § 11`), den das RIS nie führt. **Erledigt
11.09.2026.** Die beiden Klassen trennen sich an einem Wort, ohne Rest: von
den **1.546 Bezeichnungen, die der Schlüssel als zusammengesetzt liest**, sind
**1.534 das „Art. 3 § 5" des RIS** — ein artikelgegliedertes Gesetz, wo der
Artikel wirklich zur Identität des Paragraphen gehört —, und jede einzelne
davon verbindet ihre Teile mit einem bloßen Leerzeichen. Die übrigen **12 sind
Anlagenüberschriften der Beilage**, und jede einzelne davon verbindet mit
„ zu ". Gelesen wird das Wort nur *zwischen* zwei Teilen: „Zu § 5", wie die
Erläuterungen ihre Abschnitte überschreiben, behält seinen Paragraphen, weil
es keinen früheren Teil gibt, von dem das Wort trennen könnte.

Die Nachschlageseite kann sich dabei nicht bewegen, und das ist nachgezählt:
über **alle 195.875 Label-Vorkommen** des Offline-Korpus (4.251 verschiedene)
trifft die Regel auf **kein einziges** Label zu.

Was sie bewegt, sind 12 Paragraphen und fünf Urteile. **Zwei werden
bestätigt** — Anlage 7 und Anlage 8 des Bildungsdokumentationsgesetzes 2020,
beide mit 100 % Deckung über 48 bzw. 36 vergleichbare Wörter und einem eigenen
Sack von 174 bzw. 132 Wörtern, der alles Gezeigte erklärt. **Zehn bleiben
ungeprüft**, aber die Prüfung hält jetzt den richtigen Grund fest: das RIS
führt sie als Tabelle, und eine Tabelle ist so nicht vergleichbar
(„RIS-Paragraph ist eine Tabelle" 25 → 35). Vorher hielt sie fest, das RIS
Bundesrecht führe diese Paragraphen *nicht* — eine Behauptung über eine fremde
Datenbank, und sie war falsch. Auf der Seite stand dieser Satz allerdings nie,
und das gehört dazu: `TextComparisonSection.vue` druckt den Grund nur, wenn
*gar nichts* geprüft werden konnte (`judged === 0`), und das trifft auf keinen
der vier betroffenen Entwürfe zu — „Entwürfe ohne jede Prüfung" bleibt bei 6
und die Gründe darunter bleiben Wort für Wort dieselben. Der Gewinn liegt
also in den zwei Urteilen und in dem, was die Prüfung über sich selbst
festhält, nicht in einem Satz, den eine Leserin heute anders läse.

**Drei Paragraphen sind der Preis, und sie benennen einen Fehler woanders.**
**Erledigt 11.09.2026** — die Auflösung steht unten („Ein Gesetz wird vor
seiner ersten Novellierungsanordnung benannt"). Die UH-Statistik- und
Bildungsdokumentationsverordnung verliert §§ 18, 35 und
37 an Regel 2 („nicht im Entwurf"), § 18 davon aus *bestätigt*. Der Grund ist
nicht die Regel: `lawtext/draftArticles` liest in diesem Entwurf eine
zitierte Anlagenüberschrift als **zweiten Artikel** („Anlage 1 zu § 6 Anhang
zum Diplom …", mit Promulgationsklausel), und die Zeilen der Beilage landen
alle in dieser zweiten Hälfte, während die Anordnungen zu §§ 16, 18, 35 und 37
in der ersten stehen. Die drei haben deshalb **keinen eigenen Sack**. Bisher
lieh ihnen der Zufall einen: die Anlagensäcke des Entwurfs (`Anl 2`,
`Anl 3`, `Anl 7`, `Anl 10`, `Anl 12`) trafen auf die zusammengesetzten
Schlüssel der Beilage nicht, galten damit als „Paragraphen, für die die
Beilage keinen eigenen Block zeigt", und wurden an jeden Paragraphen des
Gesetzes vererbt. Mit dem richtigen Schlüssel greift `shown` — wie gebaut —
und die Anleihe entfällt. Nachgemessen steht **jedes** der als fehlend
gemeldeten Wörter im Entwurf, nur unter dem anderen Gesetzesschlüssel; die
drei Meldungen sind also Fehlalarme einer bekannten Klasse mit benannter
Ursache in `lawtext/draftArticles.ts`, nicht in `designationKey`.

Gemessen über die GP XXVIII: Tabellenpfad **1.007/52/799 → 1.008/55/795**
Paragraphen, nach Ursache 43/5/4 → **43/5/7**, ≥ 99 % gedeckt 988 → **990**,
geprüfte Paragraphen 1.070 → 1.072, p10 der Deckung bleibt 100 %, Zeilen ohne
Paragraphenangabe unverändert 251, alle vier Zusicherungen 0. Die
Adressierungsdeckung **steigt**: Paragraphen der Beilage mit eigenem Sack
1.702 → **1.714**, ohne 146 → **134**. Der **PDF-Pfad ist Zeichen für Zeichen
unverändert**, Prüfstand wie Urteilsliste — `UNIT_RE` schneidet die
Bezeichnung dort vor dem Titel ab, sodass gar keine zusammengesetzte
Bezeichnung entsteht (0 von 3.483). Ebenso unverändert ist die Adressierung
der Anordnungen: von 9.904 Adressen des Entwurfs trägt keine einzige einen
Zitat-Titel. Die Fehlerinjektion bleibt auf beiden Pfaden in jeder
Injektionszelle gleich (Tabellenpfad 246/238/237 Stellen, L 69,5 %, R-alt
76,9 %, R-neu 82,7 %; PDF-Pfad Zeile für Zeile identisch); auf dem
Tabellenpfad steigen die Meldungen ohne Injektion von 5 und 4 auf 5 und 7 —
das sind dieselben drei Paragraphen.

**Gemessen und verworfen:** den Zitat-Titel nur für das *Nachschlagen*
abzuschneiden und für `shown` den zusammengesetzten Schlüssel zu behalten.
Das hätte die drei Fehlalarme vermieden und wäre genau der Fehler, vor dem
dieselbe Datei bei `tguOracle.paragraphKey` warnt: zwei Schlüssel für dieselbe
Sache, von denen einer stillschweigend der falsche ist. `shown` und `byLaw`
müssen denselben Schlüssel benutzen, sonst sagt der Mechanismus nichts.

**Ein Gesetz wird vor seiner ersten Novellierungsanordnung benannt — danach
ist jede Überschrift Zitat** (11.09.2026, `lawtext/draftArticles` und
`lawtext/lawUnits.segmentUnits`). Ordnet ein Entwurf eine Anlage, ein Kapitel oder
einen ganzen Gesetzestitel neu an, druckt er die Überschrift, die er einsetzt
— und das RIS zeichnet diese **zitierte** Überschrift genauso aus wie einen
Gesetzestitel: `ueberschrift typ="anlage"`, `"g2"`, `"titel"`. Als Name
gelesen benennt sie das Gesetz mitten im Entwurf um, und die Anordnungen davor
und dahinter liegen danach unter **zwei** Gesetzesschlüsseln.

Die Stellung trennt die beiden Klassen ohne Rest. Über die 400 Entwürfe der
GP XXVIII, 11.09.2026: von **651 Abschnittsüberschriften**, die diese Regel
als Gesetzesnamen annahm, stehen **649 vor der ersten Novellierungsanordnung
ihres Artikels und 2 dahinter**; von **405 Titelblöcken 390 davor und 15
dahinter**. Und alle **17** späten beginnen mit einem Anführungszeichen — das
zweite, unabhängige Signal, das dem ersten zustimmt. Die beiden Fälle unter
den Abschnittsüberschriften sind die UH-Statistik- und
Bildungsdokumentationsverordnung („Anlage 1
zu § 6 Anhang zum Diplom …"), die „Artikel 1" mit §§ 16, 18, 35, 37 und
Anlage 1 von ihren übrigen sechs Anlagen trennte, und die Wasserstraßen-
Verkehrsordnung („Schallzeichen, Sprechfunk, …"), die 26 Paragraphen von 57
trennte; die 15 sind Verordnungen, die ein Gesetz zur Gänze neu erlassen und
seinen Titel innerhalb der Anordnung drucken.

**Die Regel steht an zwei Stellen und musste an beiden weichen**, und das ist
gemessen, nicht vermutet — jede Hälfte für sich macht es schlimmer:

| Tabellenpfad, GP XXVIII | bestätigt/einbehalten/ungeprüft | Regel 2 ohne Injektion | eigener Sack / ohne |
|---|---|---|---|
| vorher | 1.008 / 55 / 795 | 7 | 1.714 / 134 |
| nur `draftArticles` | 989 / 78 / 791 | **29** | 1.653 / 195 |
| nur `segmentUnits` | 1.010 / 51 / 797 | 3 | **1.645 / 203** |
| beide | **1.010 / 53 / 795** | **4** | **1.722 / 126** |

Nur `draftArticles` verschiebt das Waisenproblem bloß: die Zeilen der Beilage
tragen dann den richtigen Schlüssel, aber `segmentUnits` teilt weiter, also
verlieren jetzt die *späteren* Anordnungen ihren Anschluss statt der früheren
— 22 Fehlalarme mehr. Nur `segmentUnits` räumt die Meldungen weg, indem es die
Regel **entschärft**: der Schlüssel der Beilage trifft dann auf gar kein
Gesetz, `draftReference` fällt auf den ganzen Entwurf zurück, und die
Adressierungsdeckung fällt mit — 1.714 → 1.645 Paragraphen mit eigenem Sack.
Erst beide zusammen nehmen die Fehlalarme **und** heben die Deckung.

**Zweitens fällt der Schlüssel jetzt auf die Artikelnummer zurück.**
`segmentUnits` schlüsselt seine Einheiten mit `articleTitle ?? articleNumber`;
`draftArticles` ließ `key` dagegen `null`, wo unter der Artikelzeile kein Name
stand — **13 der 1.052 Artikel** der GP XXVIII, 9 davon mit Artikelnummer und
**7 mit geändertem Gesetz**, und in einem Entwurf (Änderung VbA und LF-VbA)
sind es **beide** Artikel, die sich damit einen Schlüssel teilten, sodass
keines der zwei Gesetze aufgelöst wurde. Auf dem PDF-Pfad fallen die
**Zeilen außerhalb jeder Artikelgrenze von 33 auf 0**.

Gemessen über die GP XXVIII, beide Pfade. Tabellenpfad **1.008/55/795 →
1.010/53/795** Paragraphen, nach Ursache 43/5/7 → **44/5/4**, geprüfte
Paragraphen 1.072 → 1.074, ≥ 99 % gedeckt 990 → 991, Zeilen ohne
Gesetzeszuordnung 97 → 95, alle vier Zusicherungen 0. PDF-Pfad
**1.342/244/1.897 → 1.364/250/1.869**, nach Ursache 212/15/17 →
**217/16/17** — Regel 2 bewegt sich dort nicht —, geprüfte Paragraphen 2.162 →
2.193, ≥ 99 % 1.617 → 1.636, Paragraphen mit eigenem Sack 2.789 → 2.847.

**Kein Urteil geht verloren**, und das ist einzeln nachgezählt: von den 33
Paragraphen, deren Urteil sich bewegt, kommen 30 aus *ungeprüft*. Tabellenpfad
(5): UH-Statistik-VO § 18 einbehalten → **bestätigt**, §§ 35 und 37
einbehalten → **ungeprüft** (ihre gezeigten Änderungen tragen zu wenige
vergleichbare Wörter, was die Prosaschwelle seit jeher so beantwortet);
Anpassungsgesetz an das Informationsfreiheitsgesetz § 146 ungeprüft →
**bestätigt** und § 29 ungeprüft → **einbehalten** (die geltende Fassung deckt
die linke Spalte nicht). PDF-Pfad (28, alle aus *ungeprüft*, in zwei
Entwürfen): „Anpassung Materiengesetze an die Informationsfreiheit" — vom
Eisenbahngesetz 1957 §§ 77 und 82 bestätigt, § 40b einbehalten, vom vierten,
unter seiner Artikelzeile nicht benannten Gesetz §§ 8, 11 und 25 bestätigt;
und die Seen- und Fluss-Verkehrsordnung mit §§ 3, 4, 6, 9, 10, 11, 18, 30, 37,
45, 52, 63, 82, 86, 87, 90 und 127 bestätigt, §§ 35, 39, 64 und 96 einbehalten
(geltende Fassung) und § 44 einbehalten (bereits geltend).

Die Fehlerinjektion: auf dem **Tabellenpfad ist jede Injektionszelle Zeichen
für Zeichen unverändert** (246/238/237 Stellen, L 69,5 %, R-alt 76,9 %, R-neu
83,1 %), und die Meldungen ohne Injektion gehen von 5 und 7 auf **5 und 4** —
das sind genau die drei Paragraphen der UH-Statistik-VO, die der Prüfstand
selbst mit ihrem falschen Gesetzesschlüssel ausgewiesen hat. Auf dem
**PDF-Pfad wächst die Grundmenge**, weil 22 Paragraphen mehr bestätigt und
damit überhaupt injizierbar sind: 920/883/882 → **936/899/898** Stellen, L
zusammen 62,1 % unverändert, R-alt 67,0 % → 66,4 %, R-neu 77,0 % → 77,2 %,
Meldungen ohne Injektion 18 und 21 → **19 und 21**. Die eine Meldung mehr ist
§ 44 der Seen- und Fluss-Verkehrsordnung, also ein Paragraph, der vorher gar
nicht geprüft wurde.

**Der ME→RV-Vergleich liest dieselben Einheiten** (`segmentUnits`), und er
bewegt sich nicht mehr als nötig: über die GP XXVIII bleiben **10.530
Einheiten 10.530**, mit identischer Nummer, Überschrift und Textlänge; genau
**364 Einheiten in 13 Entwürfen** wechseln ihren Gesetzesschlüssel vom Zitat
auf den Namen, den der Entwurf selbst führt. Für den Vergleich ist das die
Verbesserung, nach der niemand gefragt hat: `lawDiff.pairArticles` paart die
Gesetze über die Wortüberschneidung ihrer Namen, und ein Name aus zitiertem
Text ist genau der, den die Regierungsvorlage mitändern kann — wo sie es tat,
fiel das Paar auseinander und die Paragraphen verließen den Vergleich als
„Gesetz nur im Entwurf". Nachgeprüft ist das nur an den Einheiten: die
Parlaments-HTML der Regierungsvorlagen liegt nicht im Offline-Korpus, der
Vergleich selbst also nicht.

**Gemessen und verworfen:** die Überschrift an ihrer *Form* zu erkennen, am
führenden Anführungszeichen. Sie trennt dieselben 17 Fälle — aber sie ist eine
Aussage über Zeichensetzung und nicht über Struktur, und die Stellung
spiegelt eine Regel, die dieselbe Funktion für die Promulgationsklausel schon
führt („die Klausel steht zwischen Artikelzeile und erster Anordnung"). Das
Anführungszeichen bleibt als zweites Signal in der Messung stehen, nicht im
Code — wie bei der Beförderung eines Absatzes zur Anordnung, wo zwei Signale
übereinstimmen mussten und nur eines entscheidet.

**Rest, benannt und nicht gebaut** (`indexOf`): die Aussage „kein
Gesetzesindex kollidiert" ist **widerlegt**. Nachgemessen über alle 195.875
Label-Vorkommen beanspruchen 15 Schlüssel mehr als ein Label, und **13 davon
kollidieren innerhalb einer einzigen RIS-Antwort** — der Grundmenge, aus der
`indexOf` seinen Index baut. Es ist eine Form: eine in Buchstabenteile
zerlegte Anlage. „Anl. 1/59" wird ganz gelesen, weil die Endung Ziffern sind,
während „Anl. 1/e", „Anl. 2/m1" und „Anl. 1/01.1" ihre verlieren und neben der
ganzen Anlage landen; „first wins" entscheidet dann. Drei Gesetze tragen das
(10008944, 10008568, 20009369), und **kein Entwurf der GP XXVIII ändert eines
davon** — im gemessenen Korpus wird also nichts gegen einen Bruchteil seiner
Anlage gehalten. Den Numeral-Teil zu weiten ist ein eigener Schritt mit eigener
Messung: er bewegt jede Bezeichnung auch auf der Beilagen- und der
Entwurfsseite, nicht nur die Labels.

**Geweitet, gemessen auf allen drei Seiten (30.09.2026).** Der Numeral-Teil
von `DESIGNATION_PART_RE` liest den Teil nach dem Schrägstrich jetzt ganz —
Ziffern, Buchstaben, Punktzahlen: „Anl. 1/e", „Anl. 2/m1", „Anl. 1/01.1",
„Anl. 1/PTS". *Labels:* über alle 325.716 Label-Vorkommen der 4.359
gecachten RIS-Antworten ändern **32 Labels** ihren Schlüssel, alle in vier
Lehrplan-Verordnungen (AHS, HAK/HAS, humanberufliche Schulen und — seit der
Zählung oben in den Cache gekommen — Polytechnische Schule mit „Anl. 1/PTS"),
und die mehrfach beanspruchten Schlüssel gehen von **14 auf 0**; „first wins"
entscheidet im Korpus nichts mehr. *Beilagen:* keine gecachte Beilage druckt
eine Bezeichnung, die die Weitung anders liest. *Entwürfe:* einer — eine
Lehrplan-Verordnung, deren Anordnungen „Anlage 1/PTS" nennen und deren
Beilage die Anlagen als „nicht abgebildet" führt; ihre Anordnungen landen im
Sack „Anl 1/pts" statt „Anl 1", und keine Zeile der Beilage fragt danach.
*Gemessen:* Prüfstand beider Pfade (400 jüngste Sätze) 140 → 140 und 120 →
120 Entwürfe, **kein Entwurf bewegt sich**, die Berichte bis auf den
Zeitstempel gleich; die Fehlerinjektion beider Pfade Zeile für Zeile gleich.
Die Weitung ist also im gemessenen Korpus ohne Wirkung auf ein Urteil — sie
nimmt einer Anlage, die erst ein künftiger Entwurf ändert, die Möglichkeit,
gegen ein Fünfzigstel ihrer selbst gehalten zu werden. Richtung der
Unsicherheit, die sie übrig lässt: Wo eine Beilage die ganze „Anlage 1"
druckt und das RIS nur ihre Teile führt, ist der Paragraph jetzt
*ungeprüft* statt gegen den erstbesten Teil gehalten — eine verlorene,
keine falsche Bestätigung.

**Eine einseitig gedruckte Überschrift gehört dem Paragraphen darunter
(11.09.2026).** Fügt ein Entwurf einen Paragraphen samt Überschrift ein oder
hebt er einen auf, ist die Spalte, in der die Bestimmung noch nicht oder nicht
mehr steht, leer — die Überschrift steht also **einseitig**. Die Regel, die
eine beidseitig gedruckte Überschrift dem Paragraphen *darunter* zuschlägt,
verlangt beide Spalten; einseitig ging die Zeile als gewöhnliche Einfügung oder
Streichung hinaus und erbte den Paragraphen **darüber**.

*Gemessen* über die 126 lesbaren Beilagen der GP XXVIII: **297 solche Zeilen
unter 11.448**, 244 rechts und 53 links gedruckt. **236 davon folgt eine Zeile,
die einen Paragraphen eröffnet** — und der ist ihrer: SchOG § 129 trug die
Überschrift des § 130d, die Blutspenderverordnung § 7 die des § 8, das AWG
§ 72a die des aufgehobenen § 72b, das GTelG § 23 den „6. Abschnitt" des § 24i,
die Tierschutz-Sonderhaltungsverordnung § 17 den „7. Abschnitt" des § 27. Die
übrigen 61 eröffnen nichts unter sich.

**Entschieden, und gegen die naheliegende Regel.** Die beidseitige Überschrift
verschwindet als Zeile und wird zum `heading` des Paragraphen darunter (seit
demselben Tag auch oberhalb der Paragraphenebene, `heldTwoSided`, oben in
diesem Abschnitt); das hier genauso zu tun wäre falsch. Eine beidseitig gedruckte Überschrift ist per
Definition unverändert, eine einseitige **ist die Änderung** — und eine
gezeigte Änderung verschwinden zu lassen ist derselbe Fehler, den die alte
Auslassungsregel über 919 Zeilen gemacht hat. Die Zeile bleibt also eine Zeile,
nur ihr Paragraph zieht um. Er ist beim Lesen der Zeile noch nicht bekannt, denn
er ist der, den die *nächste* Zeile eröffnet: die Überschrift wird
zurückgehalten und nimmt den Paragraphen, der offen ist, wenn die Zeile darunter
ausgegeben wird. Wo darunter keiner eröffnet, bleibt es beim Paragraphen
darüber — wo der Korpus nichts sagt, bleibt die Antwort die ausgelieferte.
Erkannt wird die Zeile an der **Auszeichnung des RIS**, nicht an der Form der
Zeile, dieselbe Entscheidung wie bei `isTableContent`: alle 297 sind als
`<ueberschrift>` ausgezeichnet, keine müsste am Wortlaut erkannt werden.

Eine Ausnahme, und sie ist dieselbe Regel eine Ebene höher: eine
**Anlagenüberschrift ist eine Bezeichnung und kein Titel**. Sie eröffnet ihre
eigene Anlage, statt auf einen Paragraphen zu warten, der nie kommt — was
`opensAnlage` für die beidseitige und die spaltenübergreifende Überschrift
schon tut und für die einseitige Zelle als einzige Stelle fehlte. **7 Zeilen**
der GP XXVIII, und sie standen unter der *vorigen* Anlage: die
Bäderhygieneverordnung zeigte ihre neue Anlage 11 unter Anlage 10, die
Medizinproduktebetreiberverordnung ihren aufgehobenen Anhang 5 unter Anhang 2.

*Gemessen* (`harness/annexPdf.ts --xml`, GP XXVIII): Tabellenpfad
**998/62/791 → 1.007/52/799** Paragraphen, nach Ursache 52/6/4 → 43/5/4,
≥ 99 % gedeckt 973 → 988, p10 der Deckung 99 % → 100 %, Zeilen ohne
Paragraphenangabe 266 → 251 (als Änderung gezeigt 77 → 75), alle vier
Zusicherungen 0. Der **PDF-Pfad ist Zeichen für Zeichen unverändert** —
`parseTextComparison` wird dort nicht aufgerufen. Die Fehlerinjektion behält
ihre Grundmenge (246/238/237) und ihre Fangquoten L 171 (69,5 %) und R-alt 183
(76,9 %); R-neu geht 195 → 196 (82,3 → 82,7 %), und die **Fehlalarme ohne
Injektion gehen bei Regel 1 von 6 auf 5**, bei Regel 2 bleiben sie bei 4
(dieselben vier Paragraphen).

**Zehn Urteile ändern sich, keines zum Schlechteren gegenüber einer Zusage** —
kein einziger bestätigter Paragraph verliert seine Bestätigung. Sieben gehen
von *einbehalten* auf **bestätigt**: Blutspenderverordnung § 7, AWG 2002
§ 72a, EU-JZG § 57 und IVS-G §§ 3, 9, 14, 15. Die Ursache ist in sechs davon
dieselbe — die einseitige Überschrift des Paragraphen darunter stand in ihrer
*linken* Spalte und wurde gegen ihren geltenden Text gehalten, was sie unter
die Deckungsschwelle drückte. Der siebte, IVS-G § 3, fiel an Regel 1
(„die vorgeschlagene Fassung zeigt Geltendes als neu"): die Beilage druckt
dessen Überschrift in zwei Zeilen, eine je Spalte, und die linke landete unter
§ 2 — also fehlte sie im linken Sack des § 3, und die rechte galt als neu.
Die Meldung war wahr über *die Seite* und falsch über die Beilage.

Drei Urteile gehen von *einbehalten* auf **ungeprüft**, und alle drei sind
ehrlicher als vorher: Schulzeitgesetz 1985 § 16a, die
EAG-Investitionszuschüsseverordnung-Strom § 18 und die
Tierschutz-Sonderhaltungsverordnung § 27 zeigten als einzige gedeckte Änderung
fremden Text — die Überschrift des § 16e, den Inhalt der Anlage 1 bzw. der
Anlage 4. Ohne ihn bleibt in ihrer linken Spalte nichts
Vergleichbares, und „nichts angesehen" ist dafür der richtige Zustand; die
Leserin bekommt den Text zurück, nur ohne Zusage. Dazu kommen **7 neue
Einheiten**, die es vorher gar nicht gab, weil ihre Zeilen unter der vorigen
Anlage standen: MPBV Anhang 5 und TSch-SV Anlage 4 werden **bestätigt**, fünf
bleiben ungeprüft, weil das RIS ihre Bezeichnung nicht führt (darunter „Anlage
3a zu § 18 Abs. 1 …", der zusammengesetzte Schlüssel von oben).

**Nicht gebaut, benannt.** Eine Überschrift *innerhalb* einer Textzelle — die
IVS-G-Beilage druckt die Überschrift des nächsten Paragraphen ans Ende der
Zelle des vorigen — ist keine Überschriftenzeile, und diese Regel erreicht sie
nicht. Ebenso wenig eine einseitig gedruckte **Artikelzeile**: „Artikel 2
Änderung der Zeugnisformularverordnung" nur in einer Spalte wird von
`candidateOf` gar nicht erst als Grenze angeboten, weil die Zeile weder
spaltenübergreifend noch spiegelgleich ist — **3 Zeilen** der GP XXVIII
(IKT-Schulverordnung zweimal, Bildungsdirektionen-Einrichtungsgesetz einmal).
Das ist eine Frage der Gesetzesabgrenzung und nicht der Paragraphenzuordnung,
also ein eigener Schritt mit eigener Messung.

**Die „einseitige" Artikelzeile ist eine über die Naht gesetzte — gemessen
und gebaut (30.09.2026).** Nachgelesen sind die drei Zeilen gar nicht
einseitig gedruckt: Die Vorlage des Ressorts teilt die Tabelle 1 + 3 (bzw.
1 + 4) Spalten, setzt die Artikelzeile `colspan="3"` (bzw. 4) und dahinter
eine leere Abstandszelle. Nicht die volle Breite, also keine Überschrift;
in der linken Spalte begonnen, also eine Zeile „entfällt: Artikel 2
Änderung der Zeugnisformularverordnung". Über die 140 Tabellenbeilagen des
Prüfstands gibt es **45 Zeilen, deren einzige gefüllte Zelle die Naht
überquert, und 42 davon sind gewöhnlicher Gesetzestext** — ein aufgehobener
Absatz über zwei Spalten gesetzt. Das Überqueren allein sagt also nichts.
`straddlingArticle` (`comparisonRows.ts`) verlangt drei Dinge zugleich: Die
Zelle überquert die Naht (das Layout), das RIS zeichnet ihren ganzen Inhalt
als `<ueberschrift>` aus (die Auszeichnung), und sie liest sich als
„Artikel N" *mit* Gesetzestitel (der Wortlaut). Dann wird sie
`resolveBoundaries` nur **angeboten** — die Grenze gilt erst, wenn der
Entwurf selbst diesen Artikel führt; sonst bleibt die Zeile die, die sie
war. Draußen bleibt damit bewusst die vierte einseitige Kandidatenzeile des
Korpus, ein bloßes „Artikel 4" in der rechten Spalte ohne Titel und ohne
Naht (Warenreparaturrichtlinie-Umsetzungsgesetz): Das ist in einem in
Artikel gegliederten Gesetz so oft eine Bestimmung wie eine Grenze.

*Gemessen* (Prüfstand, 400 jüngste Sätze): Tabellenpfad **zwei Entwürfe
bewegen sich, beide aus der Verweigerung heraus**, sonst keiner. Die
IKT-Schulverordnung samt Zeugnisformular- und Externistenprüfungsverordnung
war verweigert („Die Beilage überspringt ein Gesetz des Entwurfs") und zeigt
jetzt drei Artikel mit **21 bestätigten**, 2 einbehaltenen und 4 ungeprüften
Paragraphen; das Paket aus Bildungsdirektionen-Einrichtungsgesetz,
Bildungsdokumentationsgesetz 2020, IQS-Gesetz und Hochschulgesetz 2005 zeigt
vier Artikel mit **5 bestätigten** und 6 ungeprüften. Tor 1.271 / 80 / 787
→ 1.297 / 82 / 797, verweigerte Sammelgesetze 3 → 1, alle vier Zusicherungen
0. Der PDF-Pfad ist unberührt (`parseTextComparison` läuft dort nicht):
120 → 120, kein Entwurf bewegt. **Gelesen, Paragraph für Paragraph:** jeder
der 26 neu bestätigten ist gegen *sein* Gesetz gehalten und dort zu 100 %
gedeckt; der gleichnamige Paragraph eines Nachbargesetzes desselben Pakets
käme auf 26 bis 57 %, weit unter der Schwelle — eine Bestätigung über die
falsche Grenze ist darunter nicht. Die zwei einbehaltenen sind Anlagen, die
die Beilage als „(wird hier nicht abgebildet)" führt. Fehlerinjektion,
Tabellenpfad: Grundmenge 326 → 335, Fangquoten je Fehler gleich bis auf
Zehntel (R-alt je § 79,9 → 80,4 %, R-neu 81,4 → 81,5 %, L 38,7 → 38,2 %),
keine neue Meldung ohne Injektion. Die Grundlinie ist aus denselben
Berichten nachgezogen, die zwei Entwürfe nach oben.

**Der Drift-Alarm (16.09.2026).** Die Engine bricht nicht daran, dass wir sie
ändern — dafür gibt es 600+ Tests und `annexGolden.test.ts`, das zwei echte
Beilagen samt ihren Zahlen einfriert. Sie bricht daran, dass ein Ressort seine
Beilage anders setzt als bisher, und zwar lautlos: die Seite zeigt dann eine
Gegenüberstellung, die niemand als falsch erkennt, weil niemand hinsieht.
Nichts lief den Prüfstand je von selbst. `.github/workflows/annex-drift.yml`
misst jetzt wöchentlich beide Pfade und macht aus einem Befund ein Issue —
dieselbe Mechanik wie `uptime.yml` (ein Issue, beim nächsten sauberen Lauf
geschlossen), auf GitHubs Runnern und nicht als Dienst auf dem VPS.

**Klasse A ist das, was ohne Grundlinie feststeht** (`scripts/lib/annexReport.ts`,
rein und getestet — die Urteilslogik lag in diesem Kapitel schon zweimal im
CLI-Skript, wo kein Test sie erreicht): die vier Zusicherungen des Tors, die
Summe der drei Einbehaltungsgründe gegen `withheldParas`, nicht gelesene
Seiten, und ob der Lauf überhaupt etwas gemessen hat. Der Grund für den
Zuschnitt ist das wandernde Fenster: `Begut.Gesetzgebungsperiode` ignoriert das
RIS still, der Prüfstand misst also die 400 *jüngsten* Datensätze, und jede
Kennzahl, die mit der Zusammensetzung wandert, meldete wöchentlich eine
Änderung, bis niemand mehr hinsieht.

Welche Kennzahl dazugehört, war **nicht** aus den Zahlen im Kopf zu raten.
Gemessen am 16.09.2026 über GP XXVIII:

| Kennzahl | Tabellenpfad | PDF-Pfad |
|---|---|---|
| die vier Zusicherungen, `droppedPages` | 0 | 0 |
| `changeRowsNoPara` | **75** | 0 |
| Zeilen außerhalb jeder Artikelgrenze | **12** | 0 |

Die beiden unteren sind je auf einem Pfad null und auf dem anderen nicht, und
der Golden-Test friert ihre Null nur für seine zwei Beilagen ein. Als
Klasse-A-Regel hätten sie beim ersten Lauf angeschlagen und das Signal
entwertet; sie gehören in Klasse B (Vergleich je Entwurf gegen eine
eingecheckte Grundlinie — eine NOR-veröffentlichte Beilage ändert sich nie,
also ist dort Gleichheit die Regel und kein Band). Im Bericht stehen sie
trotzdem, damit Klasse B sie vorfindet.

Zwei Fallen, die der Workflow benennt, weil beide den Alarm still abgeschaltet
hätten: ein `run`-Schritt läuft ohne `shell: bash` als `bash -e {0}` **ohne**
pipefail, `skript | tee` trägt dann den Exit-Code von `tee`; und „konnte nicht
messen" (Exit 2) ist nicht „ohne Befund" — ein gescheiterter Lauf lässt den Job
rot werden, schließt aber keinen offenen Befund.

**Klasse B, dieselbe Sitzung.** `tests/fixtures/annex-baseline.json` hält je
Pfad und je RIS-Dokumentschlüssel 17 Kennzahlen fest (240 Entwürfe, 140 kB);
`classBFindings` meldet jeden Entwurf, der sich heute anders misst. Die Regel
ist **Gleichheit, kein Band**: eine NOR-veröffentlichte Beilage ändert sich
nie, und das Tor hält gegen das RIS zum `BeginnBegutachtungsfrist`, also gegen
ein festes Datum — derselbe Entwurf muss sich morgen genauso messen wie heute.
Neue Entwürfe zählen nicht mit (für sie gilt Klasse A), und dass einer aus dem
Fenster der 400 jüngsten rutscht, ist der Normalfall und keine Meldung; beides
zu melden hieße, wöchentlich die Bewegung des Fensters zu melden.

Der Schlüssel ist der **RIS-Dokumentschlüssel**, nicht `cite`. Das war eine
Messung und keine Vorsicht: die meisten Datensätze im Fenster sind
Verordnungen ohne Begutachtungsverfahrennummer und fallen auf den bei 34
Zeichen abgeschnittenen Kurztitel zurück — „Verordnung des Bundesministers
für" steht am 16.09.2026 **neunmal** allein im Tabellenpfad. Über `id` sind
es 126 von 126 und 114 von 114 eindeutig.

Geprüft wurde der Alarm so, wie das Kapitel alles prüft: durch einen
eingespielten Fehler. Ein Entwurf der Grundlinie bekam drei Paragraphen mehr
als bestätigt, drei weniger als ungeprüft und eine nicht gelesene Seite; der
Lauf meldet genau diesen einen Entwurf mit genau diesen drei Feldern und endet
mit 1. Ohne diesen Schritt wäre nur bewiesen, dass der Alarm schweigt.

Was der Cache im CI **verdeckt**, gehört dazu: er liefert bereits geholte
Dokumente von der Platte, also bemerkt Klasse B dort keine nachträgliche
Änderung an einem Dokument, das schon einmal geholt wurde. Im CI fängt sie
eine Verschiebung durch unseren eigenen Code und alles an neuen Entwürfen. Die
andere Frage — hat das RIS rückwirkend etwas angefasst — braucht einen Lauf
ohne Cache und ist Handarbeit, kein Wochenjob.

**Die Grundlinie altert auch von selbst.** Das Fenster wandert: schon zwischen
der ersten lokalen Messung und dem ersten CI-Lauf, keine Stunde später, war
ein Entwurf neu im Korpus (Mehrstimmrechtsaktien-Gesetz) und drei alte waren
unten herausgefallen. Für einen Entwurf, den die Grundlinie nicht kennt, gilt
nur Klasse A — die Deckung von Klasse B sinkt also ohne Zutun. Deshalb wird
die Grundlinie nicht nur bei einer Änderung nachgezogen, sondern auch dann und
wann ohne Anlass, aus den Berichten eines sauberen Laufs (sie hängen als
Artefakt `annex-reports` an jedem Lauf).

**Erinnert wird der Alarm selbst, nicht der Mensch** (17.09.2026). Die
Grundlinie trägt ein `at`, also ist ihr Alter prüfbar:
`maintenanceFindings` meldet ab **60 Tagen** einen Befund der Klasse
`wartung`, mit Alter, Anzahl der erfassten Entwürfe und dem Befehl, der es
behebt. Das öffnet ein Issue und schickt eine Mail wie jeder andere Befund —
eine Erinnerung, die vom Erinnern abhängt, ist keine, und dieser Punkt war der
einzige der ganzen Konstruktion, der auf Gedächtnis beruhte. Die 60 Tage sind
dieselbe Frist, nach der GitHub geplante Workflows in einem stillen Repository
abschaltet: zwei Wartungsfristen mit einer Zahl.

Der Befund sagt ausdrücklich „nichts ist kaputt": eine überalterte Grundlinie
ist keine Störung, sondern ein Alarm, der schleichend weniger prüft, und die
Meldung muss von einem echten Bruch unterscheidbar bleiben.

Nicht gebaut, und zwar bewusst: der Workflow könnte die Grundlinie bei einem
sauberen Lauf selbst fortschreiben. Das wäre ein Schreibrecht mehr im CI, und
vor allem könnte eine Grundlinie, die sich selbst nachzieht, genau die
Verschiebung aufsaugen, für deren Entdeckung sie da ist.

Die Regel dazu, ohne Ausnahme: **die Grundlinie wird im selben Commit
nachgezogen wie die Änderung, die sie bewegt**
(`ci/annexDrift.ts --grundlinie-schreiben=…`). Sonst ist der nächste Lauf ein
Befund über eine Verbesserung, und nach dem dritten Mal liest niemand mehr hin
— das ist die Art, wie ein Alarm stirbt, und sie ist häufiger als der Ausfall,
gegen den er gebaut wurde.

**Die zweite Kopie wird jetzt gelesen — und ihre Reihenfolge ist eine
Lizenzentscheidung, keine technische (19.09.2026).** Das Ressort schreibt die
Textgegenüberstellung einmal, veröffentlicht wird sie zweimal: im RIS als XML
und beim Parlament am Entwurf als Word-HTML. Bis heute las der ausgelieferte
Pfad nur das RIS und verlinkte die Parlamentskopie bloß.

*Warum RIS zuerst und das Parlament als Rückfall, obwohl gemessen die
Parlamentskopie die vollständigere ist* (§12.12, sechste Messung: 27 statt 24
von 40 Entwürfen, paragraphweise 12 Gewinne gegen 2 Verluste). Weil die beiden
Kopien sich nicht im Inhalt unterscheiden, sondern in der Lizenz: Das RIS
veröffentlicht die Beilage als CC BY 4.0 (Bundeskanzleramt), das Parlament
schließt die Begutachtungsverfahren ausdrücklich von der Weiterverwendung als
Open Data aus (die Lizenzfrage darüber ist offen, §13.1). Wo beide dasselbe
Dokument führen,
ist die geklärte Quelle die richtige. Wo das RIS keine führt, steht die Wahl
zwischen „aus der offenen Frage lesen" und „dem Leser eine Gegenüberstellung
vorenthalten, die es gibt" — und dann liest die Seite, sagt aber dazu, woher,
und behauptet **keine** CC-BY-Lizenz: Die Quellenzeile trägt ihre Lizenz seit
heute mit sich (`credit`), statt sie im Abschnitt festzuverdrahten.

*Ende zu Ende gemessen, 20 Entwürfe der XXVIII. GP am laufenden Server, je
einmal vor und nach der Umstellung:*

| | vorher | nachher |
|---|---|---|
| Entwürfe mit lesbarer Gegenüberstellung | 12 | **15** |
| Zeilen insgesamt | 1.483 | **1.666** |
| anzeigbare Paragraphen der Lesefassung (§12.12a) | 91 | **103** |
| Entwürfe, deren bisherige Quelle sich ändert | — | **0** |

Die letzte Zeile ist die wichtigste: Weil das RIS zuerst gelesen wird, ist der
Eingriff für jeden Entwurf, der schon eine Gegenüberstellung hatte, ein
No-op — Zeile für Zeile dieselbe Ausgabe. Die drei neuen sind genau die, zu
denen das RIS nichts führt. Damit entfallen auch die 2 gemessenen Verluste der
Parlament-zuerst-Variante, die aus deren feinerem Zeilenschnitt stammten.
Beispiel 105/ME: 158 Zeilen, 23 Paragraphen geprüft, 22 vom geltenden Recht
bestätigt — das Tor arbeitet auf der Parlamentskopie wie auf der RIS-Kopie.

*Eine Quelle, zwei Abschnitte.* Die Wahl liegt in **einer** Funktion
(`annexSourceFor`), die sich die Gegenüberstellung und die konsolidierte
Lesefassung teilen. Läsen die beiden verschiedene Kopien, könnte ein Paragraph
durch ein Tor gehen, dessen Beleg auf der Seite gar nicht steht.

*Und damit gibt es nichts zu OCRen — gezählt 28.09.2026.* Über den ganzen
Begut-Bestand des RIS (2006–2026) tragen **alle 527** Beilagen, deren XML
gerastert ist, ein PDF mit Textebene (`pagesOf`); keines ist reines Bild,
drei haben eine einzige Seite ohne Text. Auch die mit dem niedrigsten Anteil
gewöhnlicher Wörter sind echter Text — Lehrberufslisten und andere Tabellen.
„Anhangsdeckung" ist also keine Pipeline-Frage mehr: Was fehlt, sind Entwürfe
ganz ohne Beilage. Eine Simulation am Rand (gerenderte Seiten, OCR mit Apple
Vision, die Textebene als Wahrheit) zeigte außerdem, warum OCR hier auch
nicht vertrauenswürdig wäre: Beide Prüfungen des Tors sind Enthaltensein,
ein fehlendes Wort oder eine fehlende Zeile — der häufigste OCR-Fehler — fällt
durch, und rund ein Drittel der bestätigten §§ trug einen inhaltlichen
Fehler.

*Was der Satz „keine Textgegenüberstellung" weiterhin nicht sagen darf.* Liegt
sie beim Parlament nur als PDF (41 von 42 Scans sind auf beiden Seiten
dieselben), sagt die Seite das ausdrücklich und verlinkt sie, statt ihre
Existenz zu verneinen — die Lehre vom 10.09.2026 gilt unverändert, sie hat
jetzt nur einen Fall weniger zu tragen.

**Und am selben Tag wieder abgeschaltet — die Abwägung oben ging eine Station
zu weit (19.09.2026).** Sie war richtig gestellt („aus der offenen Frage
lesen" gegen „eine Gegenüberstellung vorenthalten, die es gibt") und hat die
Lizenz*angabe* sauber gelöst; was sie überging, ist, dass die Frage nicht nur
die Angabe betrifft, sondern die Handlung. Das Parlament nimmt die Daten des
Begutachtungsverfahrens von der Weiterverwendung aus; den Volltext einer
Beilage von parlament.gv.at auszulesen und abzudrucken, ist keine Metadate,
und „metadaten-only" ist für diese Stufe eine gesetzte Linie, keine
Vorsichtsmaßnahme. Für genau die betroffenen Entwürfe trägt auch das Argument
nicht, das sonst trüge — dass dasselbe Dokument im RIS unter CC BY steht —,
denn sie sind die, zu denen das RIS keines führt.

Gebaut bleibt alles: `READ_PARLIAMENT_COPY` steht auf `false`, `annexSourceFor`
gibt dann die Antwort des RIS-Pfades zurück. Der Preis ist gemessen und klein —
3 Entwürfe der GP XXVIII verlieren ihre Gegenüberstellung wieder (Obergrenze
8, bis 13) —, das Dokument bleibt verlinkt, und der Satz daneben sagt den
wahren Grund: **nicht** „ließ sich nicht auslesen" (das wäre eine Aussage über
ein Dokument, das wir gar nicht angefasst haben), sondern dass wir es
verlinken, solange die Weiterverwendung ungeklärt ist. Der Schalter zieht drei
Stellen mit sich, und sie stehen im Kommentar an ihm; die Fallunterscheidung
nach der Antwort der Parlamentsdirektion steht bei der offenen Lizenzfrage
(§13.1).

Die allgemeinere Lehre, weil sie sich wiederholen wird: **Eine Lizenzfrage ist
selten eine Frage der Beschriftung.** Ein `credit`-Feld pro Quelle ist die
richtige Mechanik und beantwortet trotzdem nur, *was man sagt* — nicht, *was
man tut*.

**Die präfixierte Abkürzung, gemessen und gelesen (26.09.2026).** Ein Ressort,
das die Gegenüberstellung einer Sammelnovelle je Gesetz schreibt, stellt der
Abkürzung den Kurznamen des Gesetzes voran — „SAG_TGÜ",
„GuKG-Novelle_2024_TGÜ", eines schreibt den Trenner doppelt. Der verankerte
Teil des Musters (`^TG(Ü|G|UE)$`) verfehlte das, und für die Seite hatten
diese Entwürfe damit **gar keine** Gegenüberstellung.

Über die 400 jüngsten Begut-Sätze sind es **4 Sätze**, und alle vier sind
lesbar: 19, 28, 12 und 81 Zeilen. Geweitet wird auf den Unterstrich und nicht
auf „irgendetwas vor TGÜ" — ein „AnhangTGÜ" bleibt draußen —, weil der
Unterstrich das ist, was der Korpus druckt.

**Die Drift-Signatur ist die, die eine rein additive Änderung haben muss:**
Der Prüfstand wächst auf dem Tabellenpfad von 126 auf 129 Entwürfe, und von
den schon gemessenen bewegt sich **kein einziger** — nicht eine Zahl, in
keinem der beiden Berichte. Die Klasse B des Alarms schweigt dazu von selbst,
weil ein Entwurf ohne Grundlinien-Eintrag kein Befund ist; die Grundlinie
musste für diesen Schritt also nicht gezogen werden. Der vierte Satz ist auf
dem PDF-Pfad und erscheint im Prüfstand erst, wenn dessen Fenster ihn kennt:
der Harness-Cache hält eine ältere Abfrage der 400 Sätze, und die
Schlüsselreihenfolge der Parameter gehört zum Cache-Schlüssel — zwei Läufe mit
denselben Parametern in anderer Reihenfolge lesen zwei verschiedene
Momentaufnahmen. Das ist keine Eigenschaft der Änderung, sondern eine des
Messgeräts, und sie gehört aufgeschrieben, weil sie beim nächsten Mal wieder
wie ein Befund aussieht.

Die Regel stand an drei Stellen — `ris/risRecord.ts` (der Erzeuger),
`annex/annexSource.ts` (die Parlamentsseite) und `scripts/lib/ris.ts` (die
Messskripte) —, absichtlich als drei Literale und von Hand im Gleichschritt:
Ein Skript darf nicht weiten können, was als Beilage zählt, ohne dass die
Seite mitweitet. **Seit 27.09.2026 ist es eine Regel** (`pickTextComparisons`
in `risRecord.ts`, importiert von beiden anderen): Der Grund für die drei
Literale ist genau, was ein Import garantiert und drei Literale nicht.

**Die Abkürzung mitten im Namen — gemessen 26.09., gebaut 27.09.2026.**
Die Weitung auf den Unterstrich hat die Klasse nicht geschlossen, sondern ihren
kleinsten Teil. Die Ressorts setzen die Abkürzung überall in den Namen, mit
Leerzeichen, Punkt, Bindestrich oder Klammer davor und danach: „TGÜ Anpassung
QJF-G", „42. KFG-Nov.TGÜ.11.05.2026", „IFG-TGÜ (2025-05-07)",
„BBG 2027-2028, BMFWF, TGÜ", dazu die Langformen „TxtGGÜ" und „TextGG" und
„TGUe". Über den ganzen RIS-Korpus (4.577 Sätze, Gesetzesentwürfe nach Beginn
der Frist) übersieht die Regel eine Gegenüberstellung, die im Satz steht, in
**11 von 139** Sätzen der GP XXVIII und **59 von 342** der GP XXVII
(`pnpm corpus:dokument-namen`). Von der Parlamentsseite her gezählt
(`pnpm corpus:tgu-deckung`): Wo das Parlament eine Gegenüberstellung führt und
der zugeordnete RIS-Satz nach unserer Regel keine, ist das in XXVIII **12 Mal
— 11 davon Namen, einer ohne Zuordnung, kein einziger ein Parlamentsfall**. In
XXVII 79 = 62 Namen, 12 ohne Zuordnung, 5 nur beim Parlament (davon 3 wieder
Namen, „Text GG" mit Leerzeichen).

**Warum das mehr ist als ein Etikett.** Seit `READ_PARLIAMENT_COPY` aus ist,
liest die Seite die Gegenüberstellung nur aus dem RIS. Ein verfehlter Name
heißt also: kein gelesener Vergleich, kein Paragraph am Tor, und der Satz, das
RIS führe keine — über ein Dokument, das dort unter CC BY liegt. Die
Quellenreihenfolge, die diese Seite aus Lizenzgründen einhält, wird durch die
Weitung nicht verschoben, sondern erst eingehalten.

**Was eine Weitung braucht.** NFC vor dem Vergleich (sieben Dokumentnamen im
Korpus sind zerlegt geschrieben, ä als a + U+0308, und sehen aus wie jeder
andere), dann die Abkürzung als Token zwischen Nicht-Buchstaben statt am Ende
— so bleibt „AnhangTGÜ" weiterhin draußen. Die drei Literale ziehen gemeinsam
(`scripts/corpus/tguDeckung.ts` liest die ausgelieferten aus dem Quelltext und
bricht ab, wenn sie auseinanderlaufen), und weil das Tor sich für laufende
Entwürfe bewegt, geht die Drift-Grundlinie im selben Commit mit. Die älteren
Formen — `begtxt`, `begmat`, „GGUe", „Textüberstellung" — sind ein zweiter
Schritt und kein Namensproblem: `begtxt` ist in 30 von 51 Fällen die
Gegenüberstellung und in den übrigen etwas anderes, das entscheidet der
Inhalt.

**Gebaut, und strikt additiv.** `textComparisonNameRank` gibt zwei Ränge:
2 für die alte Form, 1 für das Token (nach NFC, ohne Bündel wie
„Vbl.Erl.TxtGGÜ"), und gelesen wird nur der beste Rang eines Satzes. Wo die
alte Regel traf, liest die Seite also genau dieselben Dokumente in derselben
Reihenfolge — ein einziges geweitetes Muster hätte zwei Sätzen (2014, 2016)
neben der „Textgegenüberstellung" einen Teil „TGÜ_Anhänge" gegeben. Die
Drift, gemessen in zwei sauberen Arbeitsbäumen gegen denselben Cache:
Tabellenpfad 129 → **140** Entwürfe, PDF-Pfad 114 → **120**, **kein schon
gemessener Entwurf bewegt sich um eine Zahl**, der Alarm gegen die alte
Grundlinie ohne Befund. Die 17 neuen — die elf „Parlamentsfälle" und sechs
Verordnungen — tragen **224 geprüfte Paragraphen** am Tor; die Grundlinie ist
aus denselben Berichten nachgezogen, ihre 243 alten Einträge unverändert. Über
den ganzen Korpus liest die Seite jetzt in GP XXVIII die Beilage bei 124 von
139 Gesetzesentwürfen (die übrigen 15 führen keine), in XXVII bei 290 statt
227 von 342. Am laufenden Server: 105/ME (42. KFG-Novelle) zeigt 158 Zeilen
aus dem RIS, wo die Seite zuvor sagte, das RIS führe keine.

**Die älteren Formen, gemessen und gebaut (30.09.2026).** Über den ganzen
RIS-Korpus (4.577 Begut-Sätze) tragen **80 Sätze** einen Namen der alten
Formen und keinen, den die Regel oben liest: 74 „begtxt" (auch
„begtxtggue", „StRefG_2019-20_Begtxt"), fünf „GGUe", eine
„Textüberstellung" — GP XXIV bis XXVII, keiner in XXVIII. „begtxt" ist die
Form des BMF und steht neben „begmat" (dort die Erläuterungen) und
„begVorblatt_WFA". Gelesen mit den ausgelieferten Lesern: **79 der 80**
ergeben eine Gegenüberstellung, 44 aus der Tabelle, 35 aus dem PDF, weil
das RIS sie gerastert hat. Der Satz oben, `begtxt` sei in den übrigen Fällen
etwas anderes, hält am Inhalt gemessen nicht: Die übrigen sind die
gerasterten, und deren PDF druckt das Überschriftenpaar, ohne das der
PDF-Leser nichts liest. Die eine Ausnahme ist eine echte Gegenüberstellung,
die der Tabellenleser nicht kann — das Stabilitätsgesetz 2012 setzt eine
leere Abstandsspalte vor die beiden.

**Gebaut als Kandidat, nicht als Name.** `pickOlderTextComparisons`
(`risRecord.ts`) bietet diese Dokumente nur an, wo die Namensregel nichts
findet — ein Satz, den sie heute liest, kann keinen Kandidaten bekommen —,
und `textComparison`, das Dokument, auf das die Seite unter
„Textgegenüberstellung" verweist, bleibt unberührt. Ob ein Kandidat die
Beilage *ist*, entscheidet `holdsAsAnnex` (`annex/olderAnnex.ts`) beim Lesen:
Zeilen, und auf dem Tabellenpfad das Überschriftenpaar „Geltende Fassung" /
„Vorgeschlagene Fassung" in einer Tabellenzeile. Der Tabellenleser liest
sonst auch eine Tabelle ohne dieses Paar nach ihrer Zeilenform — richtig für
ein Dokument, das das Ressort „TGÜ" nennt, falsch für eines, dessen Name nur
„vielleicht" sagt, denn die zweispaltige Tabelle eines Vorblatts hat dieselbe
Form. Hält ein Kandidat nicht, antwortet die Seite wie vorher: keine
Gegenüberstellung. Die Gegenüberstellung und die konsolidierte Lesefassung
bekommen dieselben Dokumente als ein Wert (`AnnexDocuments`), damit keine der
beiden den Kandidaten vergisst.

**Additiv, gemessen in zwei Fenstern.** Im Fenster des Drift-Alarms (die 400
jüngsten Sätze, beide Pfade, derselbe Cache) ändert sich **nichts**:
Tabellenpfad 140 → 140, PDF-Pfad 120 → 120 Entwürfe, kein Entwurf bewegt
sich um eine Zahl, beide Berichte bis auf den Zeitstempel gleich. Die alten
Namen erreicht dieses Fenster nicht, also misst der Prüfstand den neuen Pfad
nur über den ganzen Korpus (`harness/annexPdf.ts --nur-inhalt
--limit=4600`, dafür liest die Schleife jetzt so viele Seiten, wie `--limit`
verlangt — sie hörte bei Seite 4 auf, gleich was verlangt war). Dort:
**Tabellenpfad 44 Entwürfe, 827 bestätigt / 57 einbehalten / 626 ungeprüft;
PDF-Pfad 35 Entwürfe, 1.239 / 78 / 683**; alle vier Zusicherungen auf beiden
Pfaden 0. Vorher hatten diese 79 Entwürfe gar keine Gegenüberstellung. Die
Ursachen des Ungeprüften, die der Prüfstand nennt, sind die bekannten —
darunter 326 Zeilen, deren Stammnorm das RIS nicht auflöst (156 Tabelle, 170
PDF) —, keine neue. Gelesen, nicht nur gezählt: bestätigte Paragraphen aus KMG 2019
(Börsegesetz 2018 §§ 39, 40, 42, 46), PKG-Novelle §§ 5, 6,
Endbesteuerungsgesetz §§ 1, 2 und Umsatzsteuerbetrugsbekämpfungsverordnung
§§ 2, 3, jeweils linke Spalte gegen den geltenden Text zum Fristbeginn — Wort
für Wort derselbe Text.

**Bewusst nicht gebaut.** *„begmat"/„Materialien" allein* — die Normalform
vor XXVI (§12.31), 936 Sätze ohne Namen der Regel, 584 davon vor XXIV — ist ein Bündel aus
Vorblatt, Erläuterungen und Gegenüberstellung. 36 solche Dokumente in XXIV
bis XXVII tragen das Überschriftenpaar oder sind gerastert. Als Ganzes
gelesen macht der Tabellenleser in 7 der 26 lesbaren aus den Tabellen des
Vorblatts „geänderte" Zeilen ohne Paragraph — 309 Zeilen, beim
Zahlungsbilanzstabilisierungsgesetz 25 von 39, beim Jahressteuergesetz 2018
alle 9 —, und der PDF-Leser findet in keinem der 9 gerasterten die
Spaltenüberschriften, weil die Prosaseiten die Geometrie bestimmen. Das
braucht einen Schnitt auf die Tabellen, die mit dem Überschriftenpaar
beginnen — ein eigener Schritt mit eigener Messung. *Der
Stabilitätsgesetz-Fall* (Abstandsspalte) bleibt beim Tabellenleser. *Der
Hinweis der Erläuterungen* auf die Gegenüberstellung (`hasAnnexDocument`)
fragt weiter nur den Namen: ob ein Kandidat hält, weiß erst der Leser, und
den soll dieser billige Hinweis nicht bezahlen.

**Eine Beilage in mehreren Dokumenten (26.09.2026).** 2 der 240 Sätze mit
Gegenüberstellung veröffentlichen sie in Teilen:
„Textgegenüberstellung (Verordnung)" neben „(Anlagen)" (Methodenverordnung
Wasser), „(Artikel1)" neben „(Artikel 2)"
(Weinrecht-Sammelverordnung). Gelesen wurde bisher das erste; das zweite war
weder gezeigt noch erwähnt.

**Der Befund ist nicht „ein Dokument fehlt", sondern „die Verweigerung war
unsere".** Die Gesetzesgrenzen werden gegen die **ganze** Artikelliste des
Entwurfs aufgelöst, und ein Teil für sich genommen deckt sie nicht: Allein
gelesen verweigert „(Artikel1)" mit „Die Beilage überspringt ein Gesetz des
Entwurfs" — ein Satz über das Dokument des Ressorts, der in Wahrheit von
unserer Lesung handelt. Zusammengelegt verschwindet die Verweigerung, und der
Entwurf zeigt **3 von 3** geprüften Paragraphen statt gar nichts.

**Zusammengelegt wird vor der Grenzauflösung**, auf dem Tabellenpfad die
`items` der Teile, auf dem PDF-Pfad ihre Seiten — nicht die fertigen Zeilen.
Zeilen eines verweigerten Teils tragen `law: null`, und eine Mischung aus
zugeordneten und nicht zugeordneten Zeilen ist schlechter als eine saubere
Verweigerung.

**Aber nur, wo die Teile auf demselben Papier stehen** (`sameTypesetting`).
Zusammengelegte Seiten werden als EIN Dokument vermessen: `dominantWidth`
nimmt die Breite, die die meisten Seiten teilen, und `isProven` verwirft jede
abweichende. Beide Teile der Weinrecht-Verordnung sind 842 pt breit, das
Zusammenlegen ist also das, was das Ressort auf Papier selbst getan hat. Die
Methodenverordnung druckt „(Verordnung)" auf 7 Querformatseiten zu 842 und
„(Anlagen)" auf 72 Hochformatseiten zu 595 — zusammengelegt gewinnen die 72
die Mehrheit, und die 7 Seiten, die die Gegenüberstellung tragen, fallen als
Fremdkörper heraus. Das ist das Gegenteil der Reparatur, gemessen.

**Und die Anlagen sind gar keine Gegenüberstellung.** Für sich gelesen sagt
der Parser das von selbst: „Die beiden Spaltenüberschriften der Beilage waren
nicht zu finden" — es ist eine einspaltige Liste von Methoden, 72 Seiten, null
Zeilen. Ein Teil, der eigens gelesen keine Zeile trägt, steuert deshalb auch
seine **nicht gelesenen Seiten nicht bei**: `droppedPages` heißt „Seiten
*dieser* Beilage, deren Geometrie wir nicht belegen konnten", und ein Dokument,
das keine zweispaltige Gegenüberstellung ist, ist eine andere Aussage — die,
die `unreadable` bereits macht. Ohne diese Unterscheidung meldete die Klasse A
des Alarms ab sofort jede Woche 10 nicht gelesene Seiten für einen Fall, den
wir verstanden haben.

**Die weiteren Teile bleiben in `otherDocuments`.** Dort findet sie ein Leser
heute unter dem Namen des Ressorts, und dort liest sie die Volltextsuche
(§12.31); sie herauszunehmen hieße, ein Dokument von der Seite zu entfernen,
um es besser einzuordnen.

**Drift:** genau **ein** Entwurf bewegt sich, und es ist der, der zu Unrecht
verweigert wurde (Verweigerung → null, geprüft 0 → 3, bestätigt 0 → 2). Die
Methodenverordnung bleibt Zahl für Zahl, wie sie war — das ist die richtige
Antwort, nicht ein ausbleibender Ertrag.

**Die Ebene des Schlussteils, und die Frage, die nur ein Korpus beantworten
konnte (26.09.2026).** Im Register der Restrisiken stand `<schlussteil
ebene="…">` als „gemessen und bewusst nicht getan": Die Ebene zu lesen nimmt
die Dokumente mit verletzter Dokumentreihenfolge von 220 auf 121, **leert
aber** in 2.352 Dokumenten den Schlussteil-Slot des Absatzes, an dem „Im
Schlussteil des § 169 Abs. 1" hängt. Und die 406 Klauseln mit `ebene="1"`,
die ihre Liste *beenden*, könnten ebenso gut den Absatz schließen wie die
Ziffer — das kann `ebene` aus sich heraus nicht sagen.

Beides hat jetzt eine Zahl, vom Prüfstand der Engine über 40 Sammelnovellen,
weil nur dort ein falsch abgelegter Schlussteil sichtbar wird — als Text, den
eine Anweisung nicht findet oder an der falschen Stelle ändert:

| | heute | Ebene gelesen | Ebene, aber die letzte Klausel dem Absatz |
|---|---|---|---|
| identisch mit dem RIS | 762 | **764** | 763 |
| halb angewendet | 72 | **71** | 72 |
| kein geltender Text (Rest des Tores) | 27 | **25** | 26 |
| eigene Abweichung | 22 | 22 | 22 |

Die geleerten Slots kosten also nichts, was sich zeigt, und die offene Frage
ist beantwortet: **eine Klausel schließt ihre Ziffer, auch wenn die Liste
danach endet** — die Variante, die sie dem Absatz gibt, ist um einen
Paragraphen schlechter. Anzeigbare Paragraphen über 120 Entwürfe 508 → 509,
Drift über beide Beilagenpfade ohne Befund.

**Die Obergrenze war die Größe des Korpus, nicht die einer Krankheit
(26.09.2026).** `MAX_PARAGRAPHS = 160` steht im Tor, damit ein einziges
Monster-Sammelgesetz keine Anfrage aufhängt, und im Register der Restrisiken
stand daneben nur, dass `REASON_CEILING` es wenigstens sagt. Was sie kostet,
war nie gemessen — messbar ist es nur, indem man sie hebt, also hat der
Prüfstand jetzt einen Knopf dafür (`--obergrenze=`).

**Sechs der 83 Entwürfe des PDF-Pfads von GP XXVIII adressieren mehr
Paragraphen als 160**, auf dem Tabellenpfad kein einziger (Größter dort:
105). Es sind das Vergaberechtsgesetz 2026 mit 413, das Budgetbegleitgesetz
2027-2028 mit 271, die Asyl- und Migrationspakt-Anpassung mit 252, das
Abgabenänderungsgesetz 2025 mit 210, das Gaswirtschaftsgesetz mit 194 und das
Finanzmarktsammelgesetz mit 170 — zusammen **550 Paragraphen, die das Tor nie
angesehen hat**, nicht weil es an ihnen zweifelte, sondern weil es vorher
aufhörte zu zählen.

| GP XXVIII, PDF-Pfad | 160 | 500 |
|---|---|---|
| bestätigt | 1.435 | **1.696** |
| einbehalten | 257 | 286 |
| ungeprüft | 1.799 | 1.509 |

**Der Preis ist ein RIS-Dokument je Paragraph**, und das kostet im Median
**0,05 s** (zehn Dokumente live gemessen, von einem Entwicklungsrechner aus,
nicht vom VPS): die 253 zusätzlichen Abrufe des größten Entwurfs sind bei
`CONCURRENCY` 4 rund drei Sekunden, einmal je Entwurf und Tag, weil die Seite
abgeleitet zwischengespeichert ist. Die Grenze steht jetzt bei **500** — über
allem, was GP XXVIII enthält, und immer noch eine Grenze: eine Beilage mit
tausend Paragraphen hört weiter auf.

Die Drift-Grundlinie geht im selben Commit mit hoch, und ihr Befund ist
genau die Vorhersage: **sechs Entwürfe, alle nach oben** (Vergaberecht
80 → 169, Asyl- und Migrationspakt 132 → 201, Budgetbegleitgesetz 85 → 150,
Abgabenänderung 115 → 144, Gaswirtschaft 1 → 8, Finanzmarktsammelgesetz
47 → 49), Tabellenpfad ohne Befund.

**Der erste Lauf sagte das Gegenteil, und schuld war wieder das Messgerät.**
`argAssigned` gibt `null` zurück, wenn die Option fehlt, nicht `undefined` —
der neue Knopf las daraus `Number(null) = 0`, setzte die Grenze auf null und
meldete für *jeden* Entwurf „bestätigt → 0, Grund: die Beilage nennt mehr
Paragraphen …". Dritter Fall an einem Tag, in dem der Befund am Instrument
hing und nicht an der Sache.

**Die Tabelle als undurchsichtiger Block, und der Wächter dahinter
(26.09.2026).** Der Posten stand am Vormittag als „eigener Schritt, hinter
allem, was zehnmal so viel bewegt" in `TODO.md` — die Posten davor sind
erledigt, und dies ist der Rest. Ein Dokument mit `<table>` wurde **ganz**
verworfen (Befund vom 09.09.2026 an NEHG §§ 24, 26, 27), weil die Zellen
eigene `<absatz>`-Blöcke tragen und in Dokumentreihenfolge zu Absätzen des
Paragraphen würden. Mit dem Dokument ging seine **Prosa** mit: 693 der 20.419
geholten Paragraphendokumente in 151 von 607 Gesetzen, und ein nicht
geladener Paragraph kann auch nie gezeigt werden.

**Zwei Hälften, und die zweite ist wieder die Wache.** `BLOCK_RE` nimmt
`<table>` auf, trifft also `<table>…</table>` am Stück; der Scan läuft
dahinter weiter, die Zellen werden nie als Blöcke gelesen. Der Text bleibt
trotzdem im Baum, als `schluss`-Knoten mit der Kennung `tabelle` — ein
Paragraph **ohne** seinen Tarif wäre ein falscher Text und nicht bloß ein
unvollständiger, und `sentenceSlot` in `kons/lawApply.ts` hält ihn mit
derselben Kennung aus dem Schlussteil-Slot heraus. Die zweite Hälfte: **ein
Paragraph, dessen Einheiten sich nicht auseinanderhalten lassen, wird
weiterhin nicht geladen.** Das Gebührengesetz druckt seine Tarifposten als
Überschriften *im* § 14, der Paragraph führt also ein Dutzend Absätze „(2)",
und „§ 14 Tarifpost 8 Abs. 2" würde den ersten davon ändern. Beide
Tarifparagraphen — GebG § 14 und GGG Art. 1 § 32 — bleiben damit genau so
unlesbar wie vorher, und die 13 GGG-Zeilen verweigern weiter an der Adresse.

| Prüfstand (40 Sammelnovellen) | vorher | nachher |
|---|---|---|
| angewendet | 1.737 | 1.749 |
| geprüfte Paragraphen | 1.050 | 1.072 |
| identisch mit dem RIS | 764 | **771** |
| unverändert gelassen | 122 | 137 |
| halb angewendet | 71 | 71 |
| eigene Abweichung | 27 / 14 | **27 / 14** |
| Verweigerungen | 437 | **424** |

Am Tor der Beilage: bestätigte Paragraphen **1.696 → 1.715** (PDF) und
**1.093 → 1.120** (Tabelle), einbehalten 286 → 306 und 63 → 67. Die
Lesefassung bewegt sich **nicht** (509 von 120 Entwürfen, 18 Paragraphen mehr
mit Text): was neu geladen wird, ist Text, den die Beilage nicht bestätigt.
Drift 33 Grundlinien, alle mit derselben Signatur — „der geltende Paragraph
steht im RIS als Tabelle" verschwindet als Grund —, Grundlinie im selben
Commit mitgehoben.

**Der Grund heißt deshalb anders.** `REASON_NOT_REPRESENTABLE` sagte „steht
im RIS als Tabelle"; eine Tabelle allein ist jetzt kein Grund mehr, also sagt
er „ist im RIS nicht eindeutig gegliedert", und `/so-funktionierts` sagt es
in denselben Worten.

**Der Nebenbefund war schlimmer als gedacht, und ist im nächsten Schritt
behoben.** RIS führt die Kundmachungsklausel eines Gesetzes unter dem Etikett
**„§ 0"** — 275 solche Dokumente im Cache —, und was darin steht, ist kein
Vorspann, sondern das **Inhaltsverzeichnis**: im Schnitt 5.624 Zeichen
„1. Hauptstück Allgemeine Bestimmungen § 1. Gegenstand § 2. …". Sie kamen
bisher nicht in den Baum, weil ihr Verzeichnis eine Tabelle ist — mit dem
Schritt oben wären es 134 Paragraphen geworden, die ein Inhaltsverzeichnis
als Bestimmung halten. Ein `§ 0` ist keine Bestimmung, keine
Novellierungsanordnung adressiert eines, und so bleibt es draußen.

Der Prüfstand sagt genau das: geprüfte Paragraphen 1.072 → **1.058**,
„unverändert gelassen" 137 → **124** — und identisch mit dem RIS 771 →
**770**, weil **ein** Inhaltsverzeichnis als Erfolg gezählt hatte. Die Quoten
werden dadurch wieder vergleichbar (71,9 % → 72,8 %, im unverweigerten Topf
89,9 % → 91,3 %). Am Tor ändert sich nichts (1.715 / 1.120 bestätigt wie
zuvor), Drift über beide Pfade ohne Befund — die Beilage hat nie ein „§ 0"
adressiert.

**Nicht der Paragraph ändert sich, sondern die Auslassung (26.09.2026).**
Seit dem Wortdiff stehen Zeilen auf der Seite, deren beide Spalten nichts als
die Auslassungssyntax der Beilage tragen und sich nur darin unterscheiden,
wie weit sie reicht: „(1) bis (54) …" gegen „(1) bis (55) …". Als „geändert"
gelesen behaupten sie, § 906 sei geändert worden — wahr über die Beilage,
falsch über das Gesetz. Der Posten stand mit „erst zählen" in `TODO.md`, weil
die Zahl zweimal veraltet war.

**Gezählt: 13** über 400 Entwürfe — 12 auf dem Tabellenpfad (6.366
Substanzzeilen) und **eine** auf dem PDF-Pfad (2.990), nicht die 48 aus der
ersten Schätzung. Zwei der zwölf unterscheiden sich nicht im Bereich, sondern
darin, wo die Kennung steht („(1) …" gegen „§ 37. (1) …"); sie lesen sich
gleich und gehören zur selben Klasse.

**Keine eigene Urteilsform für 13 Zeilen.** Das Abzeichen „redaktionell" gibt
es in diesem Abschnitt schon für einen Unterschied, der keiner der Substanz
ist; die Zeile bekommt es und darunter einen Satz, der sagt, welcher Fall es
ist: *„Nicht der Paragraph ändert sich, sondern der Bereich, den die Beilage
auslässt."* Der Wortdiff bleibt darunter stehen, und was wirklich neu ist —
im UGB der Abs. 56 mit dem Inkrafttreten — steht unverändert als „neu"
daneben. Am Entwurf 1098/ME nachgesehen und im Bild bestätigt.

**Der Test der Regel ist `printedStretches`, nicht `withoutElision`, und das
ist die halbe Sicherheit.** `withoutElision` löscht „v.H." zusammen mit den
Punkten, also reduzieren sich „20 v.H. ... 2026" und „50 v.H. ... 2026"
beide auf nichts — ein Satz, der von einem Fünftel auf die Hälfte geht, wäre
als Formalie abgelegt worden. Die erste Fassung der Regel tat genau das, und
der eigene Test hat sie erwischt; `printedStretches` schneidet nur die
Bezeichnungskette vor einer Marke weg und nie den Text hinter der letzten,
also behält jede Zelle, die etwas Eigenes druckt, ihre Änderung.

Am Tor ändert sich nichts (`change` und `elided` bleiben, wie sie waren),
Drift über beide Pfade ohne Befund.

### 12.14 Stellungnahmen zur Regierungsvorlage, der Dokument-Link und der Spaltenkopf

Three things from one round of user feedback (2026-09-15), all shipped the
same day; recorded together because they share a lesson about the upstream
contract.

**Stellungnahmen on the Regierungsvorlage.** Anyone can file on a Vorlage in
the Nationalrat the way they filed on the Ministerialentwurf, and the same
list 142 holds them (`BEZUG_ITYP: I`, item type `SN`, `api-exploration.md`
§list 142). The monitor showed only the first round until a reader pointed
at 2238 d.B., the IFG Vorlage, where the organisation that gave the feedback
had filed itself — one of ten, after 143 on the draft. GP XXVIII: 555 such
Stellungnahmen on 68 Vorlagen. In the Nachverfolgung reading this is the
input that can still change the text in the Ausschuss, so it belongs on the
Vorlage: a fact on the `rv` station ("10 Stellungnahmen zur Vorlage" —
"zur Vorlage" because the row above already carries the Begutachtung's
count, and two bare numbers in two rows read as one number said twice; zero
is not stated, most Vorlagen get none) and a block in the Regierungsvorlage
section with the organisations in the panel's row grammar
(`RvStatements.vue`). Client-side like the laws in force: enrichment of a
station the page already draws, off the SSR path. Sized before it is
fetched: without `showAll` the API returns one page plus the total, and
above `RV_STATEMENTS_CAP` (5,000) the rows are not fetched — the COVID-era
Vorlagen carry tens of thousands (1289 d.B.: 41,376), ten megabytes of names
for one line. No last-good fallback: a failed fetch costs a line, not the
page. Not built: the Ausschuss's answer to this input (that is the
parliament comparison, §12.2).

**Two of the three Reste closed on 26.09.2026.**

*Die anonymen Zeilen als Liste.* The panel counted them and showed only the
organisations, so „2 von Privatpersonen" was a fact about the Vorlage with
nothing behind it. What the row adds is everything about a Stellungnahme
that is public — the day it came in, its Geschäftszahl, its Zustimmungen and
the link to the document — and what stays withheld is the NAME, which is the
whole GDPR line (§3) and nothing more. So the endpoint ships `items` beside
the summary and the panel renders ONE list: organisations (grouped, named),
then Privatpersonen, then nicht-öffentlich, in the order of the partition
sentence above it, so the list reads as that sentence enumerates. Not the
big panel's four segments: they exist because 707 rows need narrowing, and a
Vorlage draws a handful (2238 d.B.: ten) — four buttons over eight rows
explain a list that fits on one screen. 2238 d.B. now renders its 7
organisations, 2 „Privatperson" rows and 1 „Nicht-öffentliche Stellungnahme",
each with its own citation link.

*Der >5.000-Fall.* The cap was written as „then only the count travels", and
that was one measurement short. List 142's hidden `TYP` column is a FILTER
dimension, not only a column (`api-exploration.md`, list 142): `TYP: ["I"]`
on the worst case the cap exists for — 1289 d.B. of GP XXVII — answers **17**
rows against its 41,376, and `TYP: ["P"]` the other 41,359, an exact
partition. The mass half of a mass campaign is the private persons, whom
this site never names anyway; what the cap threw away with them was
seventeen chambers, law firms and associations that can be named. So above
the cap the organisations are fetched on their own and `unlisted` carries
the rest. Three guards, because the API answers the UNFILTERED list for a
key it does not know and that would be 41,359 private persons under the
heading „Organisationen": the institution fetch is itself capped, every
returned row must carry the flag, and `mapStatementRow` classifies each one
the ordinary way — the flag can suppress a name, never publish one
(`privacy.ts`). The copy may not call the remainder Privatpersonen, and
that too is measured: over GP XXVIII's 6,325 SNME rows, 955 of the 3,459 `P`
rows are non-public, so „nicht als Organisation geführt" is the most the
flag supports.

*Kein Last-good-Rückfall* stays unbuilt, by design — this is enrichment of a
station the page already draws.

**The door follows the open window (2026-09-15, same day).** The head card
that holds the Frist and the "Stellungnahme abgeben" button used to exist
only while the Frist ran. Now it shows every window that is open: the
Begutachtung while its Frist runs, the Vorlage while parliament takes
Stellungnahmen on it (upstream's `statementsstate` on the RV's detail JSON,
read from the payload the BGBl link already comes from — `enactment.filingOpen`,
gated on the GP still running), and both when both are. Both is not a
corner case: in GP XXVIII 7 of 91 Regierungsvorlagen arrived before the
draft's Frist had ended, median lead 14 days (GP XXVII: 1 of 296,
`scripts/corpus/rvLatency.ts`). Then the parliamentary window is arguably the one
that still matters — the government has fixed its text, only the Ausschuss
can change it — so neither door hides the other; the card states the
overlap as a sequence of facts ("liegt bereits im Nationalrat, obwohl die
Frist noch läuft"), never as a verdict. The Vorlage has no published
deadline, so its door says so and offers no calendar entry. The RV block in
the section carries the same fact as one sentence with a link, not a second
button.

**Nachtrag 01.10.2026 — „gated on the GP still running": auf der Periode der
Vorlage, nicht des Entwurfs.** Die Detailseite prüfte den Formular-Schalter
gegen die Periode des **Entwurfs**, die Stationskarte seit 30.09.2026
(§12.10) gegen die der **Vorlage**. Für eine übertragene Vorlage
(XXVII/352/ME → 127 d.B./XXVIII. GP) hätte die Zeile damit „Stellungnahme
möglich" gesagt und die Detailseite dieselbe offene Tür verschwiegen. Beide
fragen jetzt dieselbe Funktion (`isVorlageFilingOpen` in
`parliament/detailJson.ts`) mit der Periode, die der Link der Vorlage nennt;
`enactmentOf` bekommt die Periode des Entwurfs gar nicht mehr, damit sie dort
nicht wieder hineinrutscht. **Live gelesen am 01.10.2026, sichtbar ändert sich
heute nichts:** Über XXV bis XXVIII haben 23 Entwürfe ihre letzte Vorlage in
der Folgeperiode (5 aus XXV, 14 aus XXVI, 4 aus XXVII → 255, 308, 127 und
89 d.B. der XXVIII. GP), und alle 23 sind kundgemacht, `statementsstate` steht
auf „0" oder — bei Vorlagen vor August 2021 — auf „9 Begutachtung erst ab
1.8.2021 …". Für die aus XXV und XXVI ist auch die Folgeperiode vorbei, dort
sind alter und neuer Schalter gleich. Der Fehler hätte erst beim nächsten
Periodenwechsel gegriffen, an einer Vorlage, die ein Entwurf der XXVIII. GP in
der XXIX. bekommt — genau dann, wenn die zweite Runde die einzige offene Tür
ist. **Nicht geändert, aber derselbe Fall:** Die Leiste der Detailseite sagt
„Ohne Beschluss – Gesetzgebungsperiode beendet" weiter nach der Periode des
Entwurfs (`DraftDetail.gpEnded` in `app/utils/spine.ts`); für eine übertragene,
noch unentschiedene Vorlage widerspräche sie der Zeile, die „liegt vor" sagt.
Heute trifft das keine Seite, weil alle 23 Vorlagen entschieden sind.

**The document link.** The row's citation leads to the Stellungnahme's page
upstream; a journalist working through fifty organisations' submissions
asked for the PDF itself. The PDF's URL is not in the list row and needs one
detail call per Stellungnahme, so a page of 700 rows must not fetch it in
advance. Each row therefore links our redirect
(`/api/stellungnahmen/{gp}/{SNME|SN}/{inr}/dokument`, `parliament/statementDocument.ts`),
resolved for the one document a reader opens: the PDF when one was uploaded,
the page when the text was typed into the web form — hence the label
"Dokument", not "PDF". The detail JSON names the person with postcode and
town and is fetched uncached like list 142; what is cached is the resolved
URL, derived layer, a week. Records in the last-good store from before the
field existed get the path restored from their page URL on recall.

**The header assertion.** The filter API answers positional rows and the
mappers read fixed indices; the only guard was that every row belongs to
the requested GP. The predecessor project's post-mortem — tight coupling to
an upstream layout, broken by a relaunch nobody noticed in time — applied
here in a quieter form: a reordered or inserted column would have passed
the GP check and degraded into "every submitter is a Privatperson", because
that is the classifier's safe default. `parliament/listHeaders.ts` now holds the
header of lists 81 and 142 against the columns we read, at fetch time and
before anything is cached; a mismatch is a 502 naming the column, the
last-good store serves the previous aggregation with its staleness visible.
Only the columns we read are asserted (appended columns shift nothing);
identity is `feld_name` where the API gives one and the display label
otherwise. The uptime workflow's data canary (§12.7) is the same guard from
the outside.

**What becomes of a statement on the Vorlage (read 24.09.2026).** The panel
shows them; it did not say where they go. Parliament's own page on
statements to legislative initiatives says approved statements "werden den
parlamentarischen Klubs und dem zuständigen Bundesministerium für ihre
Arbeit zur Verfügung gestellt" and are published at the Gegenstand; § 23b
GOG-NR (as amended by BGBl. I 81/2024) regulates the publication and nothing
more. The research service's Fachinfo on Begutachtungsverfahren (updated
03.02.2026) adds that the Parlamentsdirektion does no further processing —
no overviews, no evaluations — and that which statements are taken up "liegt
in der Verantwortung der zuständigen Ministerien oder der Abgeordneten".
There is no committee procedure and no duty to consider. One case read end
to end: the Informationsfreiheitsgesetz, 95/ME → 2238 d.B. (GP XXVII), 10
statements on the Vorlage. Our comparisons: ME→RV 21 of 34 units changed,
RV→Ausschuss 12 of 35 changed and 5 inserted, Ausschuss→Plenum 2 changed.
The committee report 2420 d.B. attributes the reworking to the roughly 200
Begutachtungs-Stellungnahmen on the ME and records a hearing with invited
experts, among them civil-society organisations; it does not mention any of
the 10 statements on the Vorlage. Two consequences, both small, and **the
first is built since 25.09.2026**: the panel says it in one sentence, under
the count and above the rows („Freigegebene Stellungnahmen gehen an die
parlamentarischen Klubs und an das zuständige Ministerium und werden beim
Gegenstand veröffentlicht; ein eigenes Verfahren im Ausschuss sieht die
Geschäftsordnung dafür nicht vor."), and in the empty state only while filing
is open — where nothing was filed and the window is shut, where it *would*
have gone is a fact about nothing. The third clause names the
Geschäftsordnung rather than an omission, which is what keeps it a rule and
not a verdict (framing rule, §4); what it must never grow into is a sentence
about what a Stellungnahme achieves, because the one case read end to end
says nothing either way and „ohne Wirkung" would be exactly the cynicism
engine this product may not become. The second consequence is unbuilt: the
hearings a committee report records — with the experts it names — are data
this station could show, once counted over a GP. What is *not* worth
measuring is a "weight": the research service's own count for GP XXVII has
only about 40 % of initiatives passing unchanged, so committee changes are
common with or without statements, and contested bills attract both.

**Counted on 26.09.2026 — and the example was the exception**
(`pnpm corpus:anhoerungen -- --gp XXVIII,XXVII`). § 40 Abs. 1 GOG-NR gives a
committee two ways to hear anyone, and they behave in opposite ways:

- **Oral** (Auskunftspersonen, Expert:innen, a public hearing) exists **only
  as prose** in the report. No field carries it — not the report's stages,
  not the Vorlage's Verlauf, not the names tables, whose whole function
  vocabulary is Pro, Contra, Regierungsbank, Berichterstatter. Among the
  committee reports our draft pages reach (a Vorlage that came from a
  Ministerialentwurf): **GP XXVIII 1 of 79**, and that one heard
  Parliament's own budget office; **GP XXVII 8 of 286**, and only one of them
  with civil society — 2420 d.B., seven invited experts (not eight, as noted
  above before the count). The others heard the ministry's own
  Sektionschefs, the Rechnungshof or the budget office. Across all committee
  reports it is 34 of 459 and 166 of 2,096, mostly on Berichte, Volksbegehren
  and in the budget committee. **Below the threshold, so no row:** a line
  that shows up once per period and mostly names officials would read as a
  channel that does not exist.
- **Written** — the Ausschussbegutachtung, a second, invited round of
  Stellungnahmen at the committee — is **structured**: the Vorlage's Verlauf
  carries one stage „Beschlussfassung auf Einholung schriftlicher
  Stellungnahmen im Rahmen einer Ausschussbegutachtung" and one stage per
  addressee („Antrag auf Einholung einer Stellungnahme von … – angenommen";
  RV 313: 98 addressees, median 193). Field and prose agree 8 of 8. On
  ME-derived Vorlagen: **GP XXVIII 2 of 79**, GP XXVII 0. Small, but it is the
  form that fits this product — an invitation, readable without a prose
  parser. **Answered and built on 27.09.2026:** the invited answers do
  arrive in list 142 on the Vorlage — 313 d.B. (from 19/ME) carries 21
  Stellungnahmen, every one flagged as an institution, dated 25.11.–03.12.2025,
  after the committee wrote to 98 bodies on 20.11. Under the panel's sentence
  they read as unsolicited input no procedure takes up. `readCommitteeConsultation`
  (`parliament/detailJson.ts`) reads the stage, the endpoint carries it, and
  the panel now names committee, day and number of bodies written to, and
  scopes the old sentence to what someone files on their own. A side finding
  on the same Vorlage: the panel says „18 von Organisationen, 3 von
  Privatpersonen" although all 21 rows carry the institution flag (column 19)
  — the classifier files three institutions as persons. The error is on the
  safe side (a name withheld, none published), but the label is wrong; a
  change to `privacy.ts` needs its corpus comparison first (§12 Nr. 9).
  **Fixed the same day (`5ff49dd`)** with three name patterns, not with the
  flag: the `I` flag measurably also marks persons (law firms under the
  lawyer's name, „Organisation; Mag. <name>", bare first and last names), so
  it cannot publish on its own. Old against new over list 142, row by row:
  27 rows newly public over four corpora, every name read, every one an
  organisation; none newly hidden. About 130 further `I`-flagged
  organisations remain filed as persons — a review queue, each to be checked
  before a pattern publishes it. **Worked through on 28.09.2026 (`21ca5c9`):**
  558 distinct `I`-flagged strings filed as persons, every one read — 427
  organisations, 43 persons or strings containing a person's name, 88
  unclear; only the first are published, through patterns measured safe
  against every row of both flags (compounds on -rat/-ausschuss rather than
  bare „rat", which hits Murat and surnames) and 183 allowlist heads whose
  person part after the semicolon stays hidden. Old against new, measured
  twice: 405 rows newly public, 266 distinct names, each an organisation, a
  public body or an office without a name; none newly hidden, no P-flag row
  published, the audit's leak candidates unchanged. The 6.184 rows of XXVII
  164/ME beyond the API cap were closed the next day through the `TYP`
  filter: all 8.611 institution rows of XXVII/ME fit in one answer, and the
  135 names not read before were read (`d0c182f`). The allowlist moved into
  its own data module (`parliament/orgAllowlist.ts`), with the two public
  bodies the audit's comma shape misreads listed there and in the audit as
  reviewed. What stays hidden is decided, not pending: 43 persons and 88
  strings whose identity is not certain — in doubt, no name.

  **The person behind the organisation (28.09.2026).** Neither comparison
  above had looked at GP XXVI, and GP XXVI showed a class the module never
  guarded: a published organisation string with a person *behind* the
  head — „Org*Mag. <Vorname Nachname>", and in the later periods
  „Org; Univ.-Prof. Dr. <Vorname Nachname>". Both guards read only the head
  for a person, the `I` flag does not veto, and the patterns printed the
  whole string. Live before any of the above: 18 such strings in GP XXVI
  and 14 in GP XXVII carried a titled name, and two of the 28.09. patterns
  (`klub`, `anstalt`) would have added two more in GP XXVI. Four changes
  in `privacy.ts`:
  - The star is GP XXVI's segment separator (1.519 rows) and is read as a
    semicolon — except the gender star („*in", „*innen…") and a star with
    no word after it.
  - `printedName`: after the head, a segment is printed only while it names
    an organisation or a department (a separate word list, never evidence
    for a head) and carries no title and no person shape once the
    department words are removed; within a segment a comma part with a
    title or a person shape ends it; „vertreten durch", „i.A.", „z.H." and
    a function followed by a name („Obmann", „…landesrätInnen",
    „Präsident" + two capitalised words that read as a person) end it too.
  - A title or a person shape in the first comma part of the head files the
    row as a person — the comma form reads the first two parts together,
    and the second carries the organisation word that cleared them.
  - `allowlistedName` takes the longest listed run of leading segments, so
    a verified name of two segments survives the star.

  Measured row by row against `9fbae9b` over GP XXVI/ME, XXVIII/ME,
  XXVIII/I, XXVII/I, XXVII/ME (100.000 rows) and all 8.611 institution rows
  of XXVII/ME: newly hidden 17 distinct strings, every one carrying a
  person; newly public 3 allowlisted heads; 18 organisations of the form
  „KÜRZEL*voller Name" that the star turned into the unsigned-head shape
  were read and listed whole, three more single ones likewise. Every
  shortened printed name was read (≈ 530 distinct): the cut removes names,
  functions and departments without a department word; what it keeps is an
  organisation. The price is detail, on the safe side — „Bundesarbeitskammer;
  Wirtschaftswissenschaft" prints as „Bundesarbeitskammer". After the change
  no published string carries a title, and a probe for a function followed
  by two capitalised words finds none. Untitled names in positions none of
  these rules reads remain possible; the audit reads raw strings, not the
  printed name, and so still lists two already-cut rows as leak candidates.

  **Die zwei Reste, am 30.09.2026.** Gelesen wurden diesmal nicht die
  Rohstrings, sondern alle 3.712 verschiedenen gedruckten Namen über GP
  XXVI–XXVIII (Entwürfe und Vorlagen, beide Flags; von XXVII/ME alle 8.611
  Institutionszeilen und 100.000 Personenzeilen), dazu eine Vornamen-Probe:
  ein großgeschriebenes Wort, das in den `P`-Zeilen der Form „Nachname,
  Vorname" als Vorname vorkommt, und das Wort danach. Drei Stellen, die
  keine Regel las:
  - eine Funktion, die die Liste nicht kannte: „<Partei> BundesrätInnen
    <Vorname Nachname> und <Vorname Nachname>" (4 Zeilen, GP XXVI). Die
    Funktionswörter vor einem Namen kennen jetzt auch Bundes-, National- und
    Gemeinderat, Abgeordnete, Minister und Staatssekretär.
  - ein Name ohne Titel, mit „und" an den Kopf der Organisation gehängt und
    durch die Zugehörigkeit in Klammern verortet: „<Verein …> und <Vorname
    Nachname> (TU Graz)" (1 Zeile, GP XXVIII). Die Regel verlangt die
    Klammer mit einem Organisationswort darin. Ohne sie kürzte derselbe Test
    70 veröffentlichte Namen („Bereich Bildung und Gesellschaft", „… und
    Klinische Chemie") und verbarg fünf — für einen einzigen Treffer unter
    ihnen.
  - ein e.U. unter dem Namen seines Inhabers: „<Vorname Nachname> e.U."
    (1 Zeile, GP XXVII). Der eingetragene Unternehmer ist eine natürliche
    Person; ob sie genannt wird, entscheidet jetzt, was vor der Rechtsform
    steht. Der Preis: ein e.U. unter einem Markennamen aus zwei Wörtern wird
    ebenso verborgen, und das Testbeispiel „Tischlerei Huber e.U." ist seither
    eine Person.

  Alt gegen neu, Zeile für Zeile über dieselben Korpora (212.626 Zeilen):
  zwei Strings gekürzt, beide um eine Person, keiner neu öffentlich; zwei
  neu verborgen, beide ein e.U.; keine Zeile mit `P`-Flag verändert.

  *Nicht gebaut.* Drei GmbH führen einen vollen Personennamen im Firmenwortlaut
  („<Vorname Nachname> GmbH"). Die e.U.-Regel auf GmbH, AG, OG und KG
  ausgedehnt verbarg 95 Strings, darunter Flughafen Wien AG und Bühnen Graz
  GmbH: die Form allein trennt einen Vornamen nicht von einem Ort oder einer
  Branche. Das braucht ein Vornamenverzeichnis im Klassifikator oder eine
  Produktentscheidung über Firmennamen, die eine Person nennen — beides
  offen; das Audit zeigt zwei der drei bei jedem Lauf maskiert an (die Probe
  kennt nur Vornamen, die in der Periode mindestens zweimal vorkommen). Ebenso bleibt
  ein Name ohne Titel nach „und" ohne Klammer eine Stelle, die nur die
  Probe liest, nicht der Klassifikator.

  *Das Audit liest, was gedruckt wird.* `scripts/audit/classifier.ts`
  klassifizierte den Rohstring, nachdem es den „(PLZ Ort)"-Zusatz selbst
  entfernt hatte — nicht auf dem Produktionsweg —, und prüfte Liste 2 am
  Rohstring. Jetzt läuft jede Zeile durch `mapStatementRow`, und Liste 2
  prüft den gedruckten Namen: das Namenssegment wie bisher, dazu die
  Vornamen-Probe, beides maskiert. `--typ I` liest alle Institutionszeilen
  einer Periode über die Kappung hinweg (XXVII/ME: 8.611 in einer Antwort);
  die Vornamen kommen dann aus einem zweiten Abruf der `P`-Zeilen. Liste 2
  vorher → nachher: XXVI/ME 2 → 0 (die zwei schon gekürzten Zeilen),
  XXVIII/ME 2 → 1, XXVII/ME vorher nicht lauffähig, nachher 2; XXVII/I und
  XXVIII/I 0 → 0. Die zwei Treffer von vorher in XXVIII/ME und fünf neue in
  XXVII/ME waren Organisationen in Kommaform, ein weiterer ein Namenspatron;
  gelesen, stehen sie in den Prüflisten des Audits. Was bleibt, sind
  Firmennamen, die eine Person nennen könnten — die zwei GmbH oben und eine
  KG, deren Name ein Gründer sein mag.

False positives read by eye and excluded: „Anhörung" and „Sachverständige"
in the law's own text (the IFG's right to be heard, AVG/StPO experts),
rejected motions for an Ausschussbegutachtung, and „Auskunftsperson" in the
Untersuchungsausschuss sense. Persons are counted, never printed.

### 12.15 Lange Stellungnahmen-Listen: zwei Faltungen und ein Suchfeld

Die Organisationsliste eines Entwurfs wurde ungekürzt gerendert — 8/ME sind
42 Zeilen, 32/ME 100, der Deckel (`ORG_LIST_CAP`) liegt bei 150 —, und die
Liste der Regierungsvorlage ebenso. Der Grund dafür steht im Kommentar zum
Deckel und gilt weiter: **jeder Name liegt im SSR-HTML**, damit eine
Organisation sich auf dieser Seite selbst findet. Eine Seitenpaginierung,
die die überzähligen Zeilen aus dem DOM nimmt, nimmt genau das zurück.

Deshalb zwei Faltungen, nicht eine, mit einer Regel, welche wann gilt:

- **Ohne Suchanfrage** bleiben alle Zeilen im DOM, und was hinter der ersten
  Seite liegt, trägt `hidden="until-found"`. Das Aufdecken macht der Browser,
  nicht unser JavaScript — die Seitensuche erreicht Zeile 90 also auch ohne
  JS, und ohne JS gibt es auch kein Suchfeld. Wo `until-found` fehlt,
  degradiert das Attribut zum gewöhnlichen `hidden`, also zur Slice, nie zu
  etwas Schlechterem. Vue 3.5 gibt den Wert unverändert ins SSR-HTML
  (`hidden` steht nicht in seiner Boolean-Attribut-Liste), Tailwind v4 nimmt
  `[hidden='until-found']` in Preflight aus.
- **Mit Suchanfrage** sind die nicht passenden Zeilen wirklich weg. Wer
  filtert, will sie weg haben; die Seitensuche darf nicht zurückholen, was
  der Filter ausgeschlossen hat.

**Zwei Fallen, beide in `main.css` (`divide-rows`) abgeräumt.** Erstens ist
`hidden="until-found"` *nicht* `display: none`, sondern
`content-visibility: hidden`: der Inhalt entfällt, die **Box der Zeile
bleibt**. Das Padding der 32 gefalteten Zeilen stand als 640 px leeres
Papier in der Liste — die Seite sah unterhalb der zehnten Zeile kaputt aus.
Zweitens ist Tailwinds `divide-y` in v4 `& > :not(:last-child)`; die letzte
*sichtbare* Zeile bekam damit eine Trennlinie direkt auf die Unterkante des
Containers. Beides löst dieselbe Utility: Trenner auf `:not([hidden]) ~
:not([hidden])` (was v3 tat, aus demselben Grund), Padding und Rahmen der
gefalteten Zeilen auf null.

**Das Suchfeld** (ab 20 Zeilen, nur im Segment Organisationen und im
RV-Block — die anderen Segmente listen „Privatperson", da ist nichts zu
suchen) ist kein Ersatz für Strg+F, sondern schlägt es auf dieser Liste
dreifach: es faltet „Oesterreichischer" auf „Österreichischer", es zeigt
Treffer, die `line-clamp-3` optisch abgeschnitten hat (und hinten stehen die
unterscheidenden Teile: „…; Abteilung 1 – Verfassungsdienst"), und es kann
auf die Suche nach dem Namen einer Privatperson **antworten**: Strg+F
schweigt, und Schweigen liest sich wie „hat nicht eingebracht", während die
Wahrheit „den Namen veröffentlichen wir nicht" ist (DSGVO). Gesucht wird
über Name und Geschäftszahl, tokenweise und in beliebiger Reihenfolge, damit
„wiener recht" das „Amt der Wiener Landesregierung; Magistratsdirektion -
Recht" findet. Die Faltung ist bewusst **nicht** `orgMatchKey`
(`parliament/organisations.ts`): die entscheidet über Dubletten und darf
unabhängig davon driften.

Seitengröße 10 statt 25 — die Liste sitzt auf einer Seite mit fünf weiteren
Abschnitten —, und ab 30 verbleibenden Zeilen steht „Alle N anzeigen"
daneben: das Suchfeld findet einen Namen, den man schon kennt, und
beantwortet „zeig mir alle" nicht. Die Fußzeile sagt „10 von 42 angezeigt"
und **nicht**, wie viele fehlen: „10 von 42" sagt es bereits, und der Knopf
darunter sagt, wie viele der nächste Druck bringt — eine dritte Zahl wäre
dieselbe Auskunft ein drittes Mal, genau dort, wo gezählt wird.

**Nebenbefund, am Geisterknopf aufgefallen:** `--ui-bg-elevated` war nicht
gemappt, Nuxt UIs Vorgabe ist neutral-100 (#f5f5f4) — gegen unseren
Seitengrund #f5f4ef praktisch dieselbe Farbe. Die neutralen Knöpfe hovern
alle auf `bg-elevated`, der Ghost-Knopf hatte damit gar keinen sichtbaren
Zustandswechsel und die umrandeten einen, den niemand sieht. Jetzt auf
#ebe9e1 gemappt, einen warmen Schritt unter dem Seitengrund Richtung
Hairline.

### 12.16 Die zweite Hälfte der Begutachtung: Entwürfe ohne Gegenstand im Parlament

Die Startseite sagte „Jetzt in Begutachtung" über eine Liste, die aus
Liste 81 kommt, und Liste 81 kennt nur Ministerialentwürfe. Am 17.09.2026
waren **4 von 8** laufenden Begutachtungen darin. Das ist kein engerer
Fokus, sondern eine falsche Vollständigkeitsbehauptung — und der schärfste
Fall stand im Leerzustand: „Derzeit keine offenen Begutachtungen" wäre in
jeder Woche ohne Ministerialentwurf, aber mit laufender Verordnung, schlicht
unwahr gewesen.

Aufgeworfen hat es der Begutachtungs-Beobachter einer NGO, aus der Praxis:
Er verfolgt die Verfahren über das RIS statt über die Parlamentsseite, weil
dort auch Verordnungsentwürfe stehen. Das Werkzeug konnte seinen Arbeitsweg
also gar nicht ablösen — nicht weil es schlechter war, sondern weil ihm
zwei Drittel des Korpus fehlten.

#### Was gemessen wurde, bevor gebaut wurde

`pnpm corpus:verordnungen` läuft über den ganzen Begut-Korpus durch den
**ausgelieferten** Mapper (`flattenRisRecord`), nicht durch eine zweite
Implementierung davon. Stand 17.09.2026, 4.574 Sätze:

| | Anteil |
|---|---|
| Verordnungen | **3.012 (65,9 %)** |
| Gesetze | 1.527 (33,4 %) |
| ohne Typwort im Titel | 35 (0,8 %) |

Der Verordnungsanteil liegt seit 2016 in jedem Jahr zwischen 54 % und 75 %.
Ein Tag ist eine Anekdote; das hier ist die Grundlinie.

**Die erste Notiz dazu lag daneben, und zwar in die bequeme Richtung.** Sie
hielt fest, ein Verordnungssatz trage „genau ein Hauptdokument, keine
Erläuterungen, keine Gegenüberstellung" — abgelesen an *einem* Satz. Über
den Korpus:

| Dokument | Verordnungen | Gesetze |
|---|---|---|
| Hauptdokument (XML **und** HTML) | 100 % | 100 % |
| Erläuterungen | **72,1 %** | 68,2 % |
| Begleitschreiben | **79,4 %** | 84,8 % |
| Textgegenüberstellung | 16,1 % | 44,8 % |

Verordnungen tragen also **häufiger** Erläuterungen als Gesetze. Dünn ist
allein die Gegenüberstellung, und das aus einem sachlichen Grund: viele
Verordnungen sind Neuerlassungen, denen keine geltende Fassung
gegenübersteht. Lehre, wieder einmal: n = 1 ist eine Hoffnung, keine Zahl.

#### Was über die Zugehörigkeit entscheidet — und was nur etikettiert

Ein Satz gehört in diese Liste, wenn der **ausgelieferte RIS↔ME-Join** ihm
keinen Ministerialentwurf zuordnen konnte. Das ist eine strukturelle
Tatsache über zwei amtliche Quellen, keine Vermutung über einen Titel.

`classifyRisRecord` **etikettiert** die Zeile danach nur noch. Die
Reihenfolge ist der Punkt: Der Klassifikator war als Score-Abzug im Join
gebaut, wo Datum und Titel ihn überstimmen konnten. Hätte er über die
Zugehörigkeit entschieden, wäre jeder seiner Fehler eine fehlende oder
erfundene Zeile geworden.

Als Etikett hat er einen Genauigkeitstest bekommen, den er nie hatte —
mit dem Join als Orakel: **Ein Satz, den der Join an einen
Ministerialentwurf gebunden hat, kann keine Verordnung sein**, denn
Liste 81 führt nur Gesetzesentwürfe. Über GP XXVII und XXVIII sind das
**472 Sätze, davon 0 als `verordnung` etikettiert.** Der Fehler ginge also,
wenn überhaupt, in die harmlose Richtung: eine Verordnung Gesetz nennen —
nie einem Gesetz seine Parlamentsseite absprechen.

#### Der Rest ist der eigentliche Fund

13 Sätze sehen aus wie Gesetze und haben keinen Ministerialentwurf. Neun
davon sind ein Artefakt der Test-Fixtures (das RIS-Fenster überlappt die
GP-Grenze, die ME-Liste nicht) und treten in der Produktion nicht auf, weil
dort gegen das richtige GP-Fenster gejoint wird. **Drei sind echt**, jeder
von Hand gegen den vollständigen Listen-81-Korpus (4.207 Zeilen) geprüft:

- **Teilpensionsgesetz**, Begutachtung ab 18.06.2025
- **Bäderhygienegesetz-Novelle**, ab 10.08.2026
- **UWG-Novelle 1984**, ab 10.06.2026

Das ist die Gegenrichtung zu den 12 von 350 MEs der GP XXVII, die *keinen*
RIS-Satz haben (`docs/ris-join.md` §2) — und zusammen ergeben beide die
einzige belegbare Aussage, die keine der zwei amtlichen Listen über sich
selbst aufstellen kann: **vollständiger als jede von beiden, weil beide
Lücken haben, und wir sagen welche.**

#### Warum eine eigene Liste und nicht ein Filter auf `/entwuerfe`

Das ist die Entscheidung, nicht der Aufwand. Zusammengeworfen ändert sich
still, was „Alle Entwürfe", die GP-Summen und die Stellungnahmen-Zahl
zählen — und **jede** Zeile hier hat genau die Beteiligungsdaten nicht, aus
denen jene Zahlen gebaut sind. Zwei Listen, die je sagen, was sie enthalten,
schlagen eine Liste, deren Nenner niemand benennen kann. Verbunden sind sie
über beide Richtungen: die Startseite zeigt beide Abschnitte untereinander
in derselben Kartenanatomie, jede Liste verlinkt die andere, Feed, Kalender
und Sitemap tragen beide.

Aus demselben Grund heißt die Kachel jetzt **„Offene Ministerialentwürfe"**
und nicht mehr „Offene Begutachtungen": Sie zählt Liste 81 und verlinkt auf
Liste 81. Die drei Kacheln daneben haben auf der RIS-Seite überhaupt kein
Gegenstück.

#### Was die Detailseite bewusst nicht hat — und eine Korrektur daran

Keine Stellungnahmen, keine Einbringer, kein ME→RV-Vergleich. Nichts davon
ist „noch nicht gebaut" — es kann nicht existieren, weil jedes davon aus
einem Parlaments-Gegenstand gespeist wird. Leer gerendert würde es „niemand
hat Stellung genommen" behaupten, wo „niemand veröffentlicht, wer Stellung
genommen hat" gilt.

**Bei der Stationenleiste war dieselbe Begründung zu bequem, und sie ist am
17.09.2026 korrigiert worden.** Der erste Entwurf dieser Seite ließ die
Leiste ganz weg, mit dem Argument „es gibt keine Kette". Das stimmt nicht:
Eine Verordnung hat sehr wohl einen weiteren Weg — Begutachtung, Erlassung
durch das Ressort, **Kundmachung im BGBl II** —, er läuft nur nicht durch
das Parlament. Und er ist grundsätzlich verfolgbar: `Applikation=BgblAuth`
führt Teil II mit (`BGBLA_2026_II_250`, geprüft 17.09.2026), und ihr
Hauptdokument ist dasselbe legistische XML wie das der Begutachtung (§2b).

Damit lagen zwei verschiedene Dinge unter einem Wort:

| | Status |
|---|---|
| **Beteiligung** (wer hat Stellung genommen) | strukturell nicht verfügbar |
| **Ergebnis** (was wurde daraus, BGBl II) | verfügbar, **nur nicht gebaut** |

Eine Seite, die beides verschweigt, behauptet stillschweigend, das Verfahren
ende hier — genau die Sorte falscher Implikation, die diese Arbeit auf der
Startseite beseitigt hat. Gebaut ist deshalb der ehrliche Mittelweg: **in
dem Slot, in dem die Entwurfsseite ihre fünf Stationen zeigt, steht eine
Karte, die dasselbe in Worten beantwortet** — wo der Entwurf gerade steht,
und was danach kommt, ausdrücklich mit „verfolgt der Monitor bisher nicht".
Eine echte Leiste, deren letzte Station dauerhaft „unbekannt" hieße, wäre
ein Versprechen, keine Karte. Eine solche Leiste wartet darauf, dass jede
Station dieses Wegs lesbar ist.

#### Dieselbe Anatomie wie die Entwurfsseite

Nach dem Vergleich beider Seiten am 17.09.2026 angeglichen, Slot für Slot,
damit nicht zwei Produkte entstehen:

| Slot | Entwurfsseite | Diese Seite |
|---|---|---|
| Rücksprung | „← Alle Entwürfe (GP …)" | „← Alle weiteren Entwürfe" |
| Metazeile über dem Titel | Geschäftszahl · Ressort-Badge (verlinkt) · Frist-Pille | **Typwort** · Ressort-Badge (verlinkt) · Frist-Pille |
| `h1` | Kurztitel | Kurztitel |
| Unterzeile | amtlicher Sammeltitel | langer RIS-Titel |
| Herkunftszeile | „Auf parlament.gv.at ansehen ↗" | „Im RIS ansehen ↗" (seit 26.09.2026 auch optisch) |
| Karte darunter | Status + SpineRail (5 Stationen) | Status + SpineRail (3 Stationen, seit 26.09.2026; Gesetz/unbestimmt: Verfahrensweg in Worten) |
| CTA-Karte | Frist + Stellungnahme-Knopf + `.ics` | Frist + Begleitschreiben-Knopf + `.ics` |
| Abschnitte | fünf, den Stationen folgend | einer: Dokumente — und dort die **Zitierform** |

Das Typwort steht dort, wo die Entwurfsseite die Geschäftszahl führt: Diese
Sätze haben keine, und das Typwort ist das, was sie einem Leser
identifiziert.

**Die Zeile „Herkunftszeile" behauptete eine Gleichheit, die sie nicht
hatte** — bis 26.09.2026, und es war eine halbe Utility-Klasse. Die
Entwurfsseite setzt `link-inline` (`text-accent-deep`, unterstrichen in
Ruhe), diese Seite hatte dieselbe Klassenliste von Hand nachgebaut, **ohne
die Farbe**: der eine Weg der Seite zu ihrer Quelle stand als grauer
Fließtext da, während derselbe Link daneben blau ist. Eine
Anatomie-Tabelle vergleicht Beschriftungen; sie sieht so etwas nicht. Lehre
für die nächste Angleichung: gemeinsame Klasse statt nachgebauter
Klassenliste.

**Die Zitierform stand bis 26.09.2026 nirgends, und das war die eine bewusste
Lücke dieser Tabelle.** „132/ME" ist der String, den man zitiert, in eine
Mail schreibt, in einer Anfrage nennt — diesen Sätzen fehlte sein
Gegenstück. Es gibt eines: die **RIS-Dokumentnummer**. Sie ist die Adresse,
unter der das RIS den Satz führt, sie ist das, was „Im RIS ansehen" auflöst,
und sie ist die eigene URL dieser Seite — sichtbar war sie nur in der
Adresszeile, ohne ein Wort dazu, was sie ist.

**Sie steht jetzt im Abschnitt „Dokumente", bei dem Satz, der die Quelle
ohnehin nennt — und der Kopf bleibt, wie er war.** Zwei verworfene Versuche
stehen hinter dieser Zeile, und beide sind der Grund für sie:

- *In der Metazeile*, neben dem Typwort, also dort, wo die Tabelle oben die
  Geschäftszahl führt. Kostete am Telefon **zwei zusätzliche Zeilen über der
  h1** — drei Metazeilen bei 500 px gegen die eine der Entwurfsseite. Grauer
  Code, der die Überschrift nach unten drückt, die sagt, worum es geht.
- *Eine Zeile tiefer, in der Herkunftszeile.* Nicht kleiner, sondern falsch
  in der Art: diese Zeile sind menschenlesbare Angaben mit „·" getrennt — ein
  Ressortname, eine Linkbeschriftung —, und eine 42-Zeichen-GUID in
  derselben Größe, Stärke und Farbe ist nicht dieselbe Sorte Ding. Sie las
  sich als Rauschen und schob den Link auf eine eigene Zeile.

**Der Fehler hinter beiden war, von der Anatomie-Tabelle her zu denken statt
vom String.** „137/ME" gehört in den Kopf, weil es kurz ist und Leute es
aussprechen; `BEGUT_C769778C_3342_41D1_A1DF_931D7F4BBF1B` ist ein
Nachschlageschlüssel, den niemand im Kopf trägt. Gleichheit der *Position*
war das falsche Ziel, Gleichheit des *Jobs* das richtige — und der Job ist
„zitieren und nachschlagen". Also steht die Nummer da, wo wer zitieren oder
herunterladen will ohnehin hinsieht, in einem eigenen typografischen Register
(`font-mono text-xs`), damit sie als Schlüssel liest und nicht als Fließtext.
Unten kostet ihre Länge nichts. Kein eigener Link auf der Nummer: er zeigte
auf die RIS-Seite, die der Kopf schon verlinkt, und die Entwurfsseite trennt
genauso — die Geschäftszahl ist Text, ihr Auflöser steht anderswo.

**Und die Gegenrechnung gehört dazu, weil sie knapp ausging:** Die Nummer
*ist* die URL dieser Seite (`/entwuerfe/BEGUT_…`), wer zitiert, kopiert also
ohnehin die Adresszeile. Der Zugewinn ist, dass sie kopierbar ist, ohne in
die Adresszeile zu greifen, und dass ein Wort danebensteht, was sie ist —
klein, aber echt, und im Fuß einer Seite billig genug dafür. Im Kopf war er
das nicht. Der `.ics`-Knopf hat hier mehr Gewicht als dort — auf einem
Ministerialentwurf ist die Frist einer von mehreren Wegen zu handeln, hier
ist sie zusammen mit dem Begleitschreiben die ganze Handlungsfläche.

Die Erläuterungen stehen dabei **über** dem Entwurfstext, gegen die
Dokumentreihenfolge des RIS. Das ist die Lesereihenfolge, die der
Beobachter beschrieben hat — erst der Allgemeine Teil, um Relevanz zu
entscheiden, dann der Text. Auf diesen Seiten wiegt das schwerer als
anderswo: Es gibt keine parlamentarische Kurzbeschreibung („Worum geht
es?"), auf die man ausweichen könnte. Auf Nachfrage hat er am 17.09.2026
bestätigt, dass ihm die parlamentarische Kurzbeschreibung für diese erste
Einschätzung ohnehin nicht reicht: Sie lasse für seine Arbeit wichtige
Gesichtspunkte aus und bleibe an der Oberfläche. Damit ist auch die
Erläuterungen-Frage entschieden, die dafür offen war.

#### Der Einreichweg: verlinkt, nicht ausgelesen

„Wohin schicke ich meine Stellungnahme?" ist die einzige Handlungsfrage, die
eine solche Seite beantworten kann — es gibt kein Parlamentsformular. Die
Antwort steht im Begleitschreiben (`ContentType: "Letter"`). Ausgelesen wird
es trotzdem nicht, und das ist gemessen entschieden: In einer Stichprobe von
**40 Sätzen trugen 34 Begleitschreiben gar keine Textebene** — reine
Bildscans. Ein Parser wäre also genau dort blind, wo er gebraucht wird. Die
sechs lesbaren nennen überdies die **persönliche Dienstadresse einer
namentlich genannten Person**; das zu republizieren ist eine eigene
Entscheidung, kein Nebeneffekt eines Parsers. Also: Dokument verlinken,
benennen was drinsteht, fertig.

#### Kosten und Zeitbudget

Kein zusätzlicher Upstream-Verkehr: Korpus und GP-Join sind dieselben
gecachten Blätter, die die Entwurfsseiten ohnehin lesen; darüber liegt ein
eigener 30-Minuten-Cache für die Ableitung. Warm antwortet der Endpunkt in
~10 ms.

Kalt ist er teuer — der Korpus sind 46 Anfragen mit Höflichkeitspause —,
deshalb wärmt die Prewarm-Unit ihn seit 17.09.2026 mit (`deploy/systemd/`).
Das Zeitbudget der Startseite steht auf 6 s statt der 4 s des
Outcomes-Abschnitts, der kalt in 0,41 s antwortet. Und weil dieser Abschnitt
eine **Richtigstellung** trägt und keine Anreicherung ist, steht der
erklärende Absatz außerhalb des Fetch-Ergebnisses: Auch wenn die Zeilen
fehlen, sagt die Seite weiterhin, dass es sie gibt und dass die Zahlen oben
sie nicht zählen.

#### Die Gegenüberstellung und die Lesefassung, seit 26.09.2026

Bis dahin hatten diese Seiten **einen** Abschnitt: Dokumente. Nicht, weil zu
einem Verordnungsentwurf weniger zu sagen wäre, sondern weil beide Dienste auf
(GP, Nummer) verschlüsselt waren — `getTextComparison` und
`getConsolidatedText` beginnen mit `getRisMapForGp(gp)`, und ein Satz ohne
Gegenstand hat dort keine Zeile. Eine Adressierung, kein Befund.

**Der Ertrag ist nicht klein:** von den 201 Begutachtungen ohne Gegenstand im
laufenden Fenster tragen **104 (51,7 %)** eine Textgegenüberstellung, und
jede einzelne zeigte bisher nichts. Über den ganzen RIS-Korpus sind es 582
der 3.012 Verordnungen (19,3 %). An der GAP-Strategieplan-Anwendungsverordnung
gemessen: 32 Zeilen aus dem PDF, 28 geprüfte Paragraphen, 24 bestätigt, und
die Lesefassung steht an 9 von 32 — auf einer Seite, die vorher darüber
schwieg.

**Gebaut als Geschwister, nicht als Parameter.** `getRisTextComparison(id)`
neben `getTextComparison(gp, inr)`, `getRisConsolidatedText(id)` neben
`getConsolidatedText(gp, inr)` — und das ist keine Verdopplung, weil sich
unterscheidet, was **über** dem Lesen liegt: Ein Ministerialentwurf wird über
den RIS↔ME-Join gefunden und kann zweifelhaft zugeordnet sein, und das
Parlament veröffentlicht eine zweite Kopie seiner Beilage, die die Seite
mindestens verlinken muss. Ein Satz ohne Gegenstand hat nichts davon — kein
Join, an dem zu zweifeln wäre, keine zweite Kopie. Die Sätze, die über diese
Zustände sprechen, wären hier Sätze über etwas, das es nicht geben kann.
Gemeinsam ist das Lesen, das Tor und das Zählen, und das steht einmal da
(`readAndCheck`, `consolidate`).

Drei Stellen tragen die Identität jetzt als **drei Felder statt zwei**
(`ris/draftIdentity.ts`): `gp`/`inr` für einen Ministerialentwurf, `risId` für
den Rest, und der Cache-Schlüssel der Prüfung ist eine Zeichenkette aus
beiden. Die Antworten führen alle drei, damit der Abschnitt nicht wissen muss,
welche Hälfte des Korpus er gerade zeichnet.

**Ein Nebeneffekt, der vorher ausdrücklich verneint war:** Die Erläuterungen
zu den einzelnen Paragraphen stehen auf diesen Seiten jetzt **am Paragraphen**
(§12.30). Der Kommentar dazu sagte „Nie am Paragraphen: die Seite rendert die
Gegenüberstellung nicht, sie verlinkt sie" — das war wahr und ist es nicht
mehr, und die Bedingung dafür ist dieselbe billige Hälfte der Frage wie
drüben: ob es eine Beilage *gibt*, nie ob sie sich auch lesen lässt.

#### Bekannt und offen

- **`ambiguous` im Join.** Eine unentschiedene Zeile wählt keinen RIS-Satz,
  also bliebe der zugehörige Satz unbeansprucht und stünde hier als „ohne
  Gegenstand" — das Einzige, was er nicht ist. Die Kandidaten auszuschließen
  ist nicht die Lösung: `candidates` ist *jeder* Satz im Datumsfenster, das
  würde die echten Verordnungen daneben verstecken. Die Zahl wird stattdessen
  angezeigt, sobald sie nicht null ist; sie ist in GP XXVII und XXVIII null.
- **Sätze ohne `EndeBegutachtungsfrist`** fallen aus jeder „offen"-Zählung,
  hier wie in der RIS-Abfrage `InBegutachtungAm`. Jede Zahl ist also eine
  Untergrenze. Gemessen: **1 von 4.574**.
- **`SAG_TGÜ`** — eine Sammelnovelle kann die Gegenüberstellung pro Gesetz
  präfixen (135/ME). Der verankerte Teil des Musters fand das nicht, und das
  Muster zu weiten ändert die Eingabe der Beilagen-Engine, deren Grundlinie je
  Entwurf festgenagelt und wöchentlich überwacht ist — also ein eigener
  Schritt mit eigener Messung. **Getan am 26.09.2026** (§12.13, „Die
  präfixierte Abkürzung"): 4 Sätze der 400 jüngsten, alle vier lesbar, und
  der Prüfstand bewegt **keinen einzigen** der schon gemessenen Entwürfe.
- **Der Name der Route** war eine Arbeitsentscheidung und ist seit dem
  18.09.2026 erledigt — nicht durch einen besseren Namen, sondern durch
  keinen: die Seiten liegen unter `/entwuerfe/:id`, ein eigenes Präfix haben
  sie nicht mehr (§12.19). `/verordnungen` wäre für drei Zeilen gelogen
  gewesen, `/weitere-entwuerfe` hat zwei Drittel des Korpus in jedem
  weitergegebenen Link „weitere" genannt. Gekostet hat die Umbenennung, was
  vorhergesagt war: eine Weiterleitung. Die Feed-UIDs hängen bewusst nicht
  an der Route und blieben unberührt.


### 12.17 Nebeneinander im Textvergleich — dieselben Daten, zweimal projiziert

Ein Domänen-Nutzer vergleicht Ministerialentwurf und Regierungsvorlage heute
mit einem fremden Vergleichswerkzeug und nannte als dessen Vorteil eine
**Side-by-side-Ansicht**. Zwei Dinge daran waren zu prüfen, und nur eines
stimmte.

**Der Kontext war schon da.** Die Notiz behauptete, die Zeile „12 Paragraphen
unverändert" lasse sich nur global über Filter oder Suche öffnen. Sie ist
seit dem 08.09.2026 ein `<details>` mit eigenem Aufklapper, eingebaut in
demselben Commit wie die harmonisierte Ansicht. Der Lesefluss ist: ein Klick
öffnet das Gesetz als Fließtext, die Kontextzeilen darin klappen einzeln
auf. Nichts zu tun.

**Die Spaltenansicht fehlte wirklich** — der `sm:grid-cols-2`-Block war der
Notfallzweig, der nur greift, wenn der Wortdiff die Zellobergrenze reißt
(`MAX_DP_CELLS`, grob ab 1.500 Wörtern je Seite). Gebaut ist jetzt ein
Umschalter `Fließtext | Nebeneinander` in der Werkzeugleiste, und er kostet
keinen Endpunkt und keine zweite Berechnung: `segments` trägt je Lauf
`equal | removed | inserted`, also ist die linke Spalte alles außer
`inserted` und die rechte alles außer `removed`. Dieselben Daten, zweimal
projiziert.

**Voreinstellung bleibt Fließtext.** Bei einer Handvoll getauschter Wörter
ist er strikt informativer — alt und neu stehen an derselben Stelle im Satz.
Der Gewinn der Spalten liegt beim **vollständig neu gefassten Paragraphen**,
wo inline erst den ganzen alten Text durchstreicht und dann den ganzen neuen
druckt: Der Leser muss zwei Fassungen im Kopf halten, um zu sehen, dass sie
Alternativen sind und keine Abfolge. Genau dort gewinnt das fremde Werkzeug.

**Nebenbei aufgeräumt:** Der Notfallzweig fällt jetzt in *dieselbe*
Spaltendarstellung, statt eine eigene zu haben. Vorher sah eine technische
Grenze aus wie eine andere Art von Änderung.

**Nachtrag 17.09.2026 — die Werkzeugleiste gibt es jetzt auch in der
Textgegenüberstellung, und dort trägt sie mehr.** Der Umschalter war hier
zuerst ausgelassen, weil `TextComparisonSection.vue` gar keine Leiste hatte
und eine zu entwerfen ein eigener Schritt ist. Beim Bauen wurde klar, dass
das Argument „die Beilage ist ohnehin schon ein Zweispalter" **für** den
Umschalter spricht und nicht gegen ihn: Die Beilage **ist** eine
zweispaltige Tabelle, „Geltende Fassung" neben „Vorgeschlagener Fassung",
und die Seite liest sie bewusst harmonisiert. `Nebeneinander` ist damit
keine Vorliebe, sondern **die Darstellung, die das Ressort selbst gewählt
hat** — zurückgegeben, ohne etwas neu zu berechnen, mit den Spaltentiteln
der Beilage darüber.

Das **Suchfeld** wiegt hier sogar schwerer als im §-Vergleich. Die
Gegenüberstellung ist konstruktionsgemäß vollständig — jeder Paragraph, den
die Beilage abdruckt, steht darin, unveränderte eingeschlossen —, also hat
ein Leser mit einem Begriff im Kopf („Verwaltungsstrafe", „§ 40") sonst
keinen Weg hinein. Eine Suche öffnet alle Gruppen, und ein Treffer in einer
*unveränderten* Stelle bekommt einen eigenen Block, statt in der
Kontextzeile zu verschwinden, die nur zählt.

**Und der Filter ist weg** (`Alle anzeigen (330)`, 17.09.2026). Er bot
**Isolation** („nur die neuen zeigen"), während die Aufgabe des Lesers
**Unterdrückung** ist („die redaktionellen ausblenden, damit ich die
Substanz sehe") — und die war nie im Angebot, weil die Auswahl einwertig
war. Er beantwortete also eine Frage, die kaum jemand stellt, während die
gestellte offen blieb; die Zahlen, die er trug, stehen ohnehin auf den
Gesetzesköpfen, dort je Gesetz statt je Seite. Verloren geht die einzige
gedruckte **Gesamtsumme**, was nur ein Sammelgesetz betrifft; die Pillen je
Gesetz sind die nützlichere Granularität, und eine schlichte Summenzeile
wäre billiger zu lesen als ein Auswahlfeld, falls die Summe fehlt. Damit
haben beide Vergleiche dieselbe Leiste: Umschalter und Suche — was
nachträglich begründet, warum die Gegenüberstellung keinen Filter bekommen
hat.

**Und eine Regel, die aus dem ersten Tag mit dem Stationswähler kam
(17.09.2026):** *Was ein Bedienelement ändert, muss bei ihm oder unter ihm
stehen — nie darüber.* Der Wähler saß in der Werkzeugleiste und schrieb bei
jeder Auswahl **vier Blöcke über sich** um: Überschrift, Beschreibungssatz,
Quellenzeile und die Hinweise zu Gesetzen, die nur eine Seite trägt. Das
Auge ist beim Regler; alles davon liegt außerhalb des Blickfelds. Drei
Änderungen folgen daraus:

1. **Die Überschrift steht fest** — sie bleibt „Was sich nach der
   Begutachtung geändert hat", die Frage des Standardpaars. Das ist kein
   Kompromiss: Sie benennt die **Epoche**, in die jeder dieser Vergleiche
   fällt (alles hier ist nach der Begutachtung), während die Zeile unter den
   Reglern den **Schritt** benennt. Außerdem behält sie die Formulierung,
   die die zwei Links hierher schon tragen. Die Paar-Frage erscheint nur für
   die *anderen* Paare — beim Standardpaar wäre sie die Überschrift ein
   zweites Mal, 40 px darunter.
2. **Der Wähler wandert in den Kopf des Abschnitts**, direkt unter die
   Überschrift, und die Leiste darunter behält nur Umschalter und Suche. Das
   entspricht dem Geltungsbereich: der Wähler ändert, **was** verglichen
   wird, die anderen zwei, **wie** das Ergebnis gelesen wird. Dabei kam ein
   latenter Fehler heraus: der Wähler stand im „verfügbar"-Zweig, also
   verschwand er genau dann, wenn ein Paar nur als PDF vorliegt oder eine
   Station fehlt — der Leser hätte eine Begründung gesehen und kein Mittel,
   zurückzukommen. Jetzt steht er außerhalb aller Zweige; `stations` liefert
   der Server ohnehin immer mit. Nachweis:
   `/entwuerfe/XXVII/1?von=me&bis=plenum` nennt „Im Plenum wurde keine
   geänderte Fassung des Gesetzestexts veröffentlicht." **und** behält die
   drei Paare, die es gibt.
3. **Die Quellenzeile steht unter der Liste**, in beiden Abschnitten. Eine
   Quellenangabe ist eine Fußnote: sie wird beim oder nach dem Lesen
   nachgesehen, nie vorher — so wie unter einer Tabelle und nicht über ihr.
   Sie war außerdem der vierte Block, der sich über dem Regler umschrieb.
   Die Lizenzaussage verliert dadurch nichts: sie steht unverändert und
   unbedingt im selben Abschnitt.

**Was nicht angefasst wurde, und warum es in die Antwort gehört statt in den
Code:** Gelobt wurde am fremden Werkzeug auch, dass es mit *verschobenen*
Paragraphen besser umgeht als git. Da ist der Monitor längst auf derselben
Seite — `lawDiff.ts` richtet über Artikel und §-Überschrift aus, bevor
Position zählt, gebaut wegen der 41 von 45 bloß umnummerierten §§ der
Erneuerbaren-Ausbau-Kette. Die Annahme, das Tool arbeite git-artig, ist eine
Informationslücke, kein Defekt.


### 12.18 Vergleich über die Regierungsvorlage hinaus: ein Stationswähler

Der §-Vergleich war auf ein Paar verdrahtet, Ministerialentwurf gegen
Regierungsvorlage. Die späteren Fassungen lagen die ganze Zeit als Dokumente
auf der Seite („Geändert im Ausschuss", „Geändert im Plenum"), und verglichen
hat sie nie jemand — dabei ist genau das die Naht, an der ein
Begutachtungsergebnis wieder verschwindet: der Abänderungsantrag im Ausschuss
oder im Plenum, nachdem alle aufgehört haben hinzusehen. Die Seite sagte den
Befund selbst schon, in einem Kommentar: 52 der 91 GP-XXVIII-Entwürfe, die
eine Vorlage erreichten, wurden danach **noch einmal** geändert.

**Gemessen vor dem Bau** (`scripts/corpus/stationen.ts`, `pnpm corpus:stationen`,
17.09.2026, GP XXVI–XXVIII, 651 Ministerialentwürfe), weil die Notiz zwei
Risiken vermutete und beide an der falschen Stelle lagen:

| | XXVI | XXVII | XXVIII |
|---|---|---|---|
| Ministerialentwürfe | 163 | 353 | 135 |
| … mit Regierungsvorlage | 112 | 296 | 91 |
| … mit Ausschussfassung | 40 | 80 | 40 |
| … mit Plenarfassung | 34 | 59 | 29 |
| vergleichbar ME → RV | 80 | 231 | 88 |
| vergleichbar RV → Ausschuss | 40 | 80 | 40 |
| vergleichbar RV → Plenum | 34 | 59 | 29 |

**Erstes Risiko, erledigt: „Verfügbarkeit je Station (HTML gegen nur PDF)".**
Von den 154 Ausschuss- und 122 Plenarfassungen der drei Perioden ist **keine
einzige** PDF-only. Die Sorge saß auf der anderen Seite — fehlendes HTML ist
ein Problem des *Entwurfstexts* in den älteren Perioden. Damit ist auch eine
Behauptung im Code korrigiert, die zu bequem formuliert war: „GP XXVII and
earlier are PDF-only" stand in `lawDiffService.ts`, aber 276 der 353
GP-XXVII-Entwürfe veröffentlichen ihren Gesetzestext als HTML und alle 296
Regierungsvorlagen ohnehin. PDF-only ist eine Eigenschaft des einzelnen
Dokuments, nie der Periode; der RIS-Rückfall hängt jetzt daran und nicht an
der GP.

**Zweites Risiko, echt: die Titel.** Upstream tippt die Stationsnamen von
Hand, und in derselben Liste stehen Dokumente, die **keine Fassung des
Gesetzestexts** sind — „Verhältnismäßigkeitsprüfung" (die EU-Prüfung für
reglementierte Berufe, 3 Entwürfe) und „Vertragstext" (ein Staatsvertrag, 2).
Als Station angeboten, hätte der §-Parser aus einer Beilage Paragraphen
gemacht. Also eine **gemessene Whitelist** exakter Titel
(`shared/utils/lawStations.ts`), kein Stichwort-Match — dieselbe Regel, die
`parliament/detailJson.ts` für die Shortinfo-Überschriften längst befolgt: das Tag lesen,
nie die Wortwahl. Die Dokumente behalten ihre Zeile in der Dokumentliste,
sie sind bloß nie eine Seite des Vergleichs (`TextVersion.stationId` ist
`null`).

Dasselbe auf der Entwurfsseite, und dort hat die Messung eine Falle
aufgedeckt: drei GP-XXVI-Entwürfe veröffentlichen „Gesetzestext, Vorblatt und
Erläuterungen" als **ein** Dokument. Ein Präfix-Match hätte diese Datei an
`parseLawUnits` gegeben und erläuternde Prosa gegen Gesetzestext verglichen.
Diese Entwürfe haben keinen isolierten Gesetzestext, und die ehrliche Antwort
ist, dass es nichts zu vergleichen gibt. Nebenbei mitgenommen:
„Gesetzestext (korrigierte Version)" wird jetzt erkannt (XXVII, 315/ME) — der
alte Gleichheitsvergleich auf das nackte Wort hat den Text dieses Entwurfs
schlicht übersehen.

**Die linke Seite folgt der rechten** (`?von=…&bis=…`, `von` ist optional).
Regel: die Station **unmittelbar vor** `bis`. Der Grund ist nicht die
Gewohnheit eines Nutzers, sondern Zurechenbarkeit: benachbarte Stationen
ordnen jede Änderung einem Akteur zu — ME→RV dem Ressort nach der
Begutachtung, RV→Ausschuss dem Ausschuss, RV→Plenum dem Nationalrat. Eine
fest auf ME verdrahtete linke Seite würde Ressort und Parlament in eine
Spalte mischen und keine der beiden Fragen beantworten. `?von=me&bis=plenum`
bleibt als **ausdrückliche** Wahl erhalten, denn „hat das
Begutachtungsergebnis bis zum Ende überlebt?" ist eine echte Frage — nur eine
andere.

**Ein Regler, der Vergleiche anbietet, nicht zwei, die Stationen anbieten.**
Die Frage des Lesers ist „was hat der Ausschuss geändert?", nicht „welche
zwei Dokumente wähle ich". Der Regler zählt die geordneten Paare der
vorhandenen Stationen auf, womit ein unmögliches Paar — verdreht oder mit
identischen Enden — gar nicht darstellbar ist; zwei unabhängige Selects
müssten das abfangen und erklären. Beide Enden bleiben frei wählbar, sie sind
nur aufgezählt. Bei den meisten Entwürfen gibt es genau ein Paar, und dann
erscheint der Regler nicht: ein Bedienelement, das man nicht bedienen kann,
ist schlechter als keines.

**Die Typen tragen das Paar jetzt im Namen.** `LawDiffUnit.meText/rvText`
hieß nach einem Paar, das nicht mehr fest ist, also heißt es `fromText`/
`toText` (ebenso `fromId`, `lawsOnlyInFrom/To`, `fromDocument`/`toDocument`,
`fromSource`). Die Zwischenlösung — Felder behalten, „bedeutet jetzt
links/rechts" dazuschreiben — wäre genau die Halbwahrheit, die der nächste
Leser teuer bezahlt: `meText` mit dem Text der Ausschussfassung darin. Der
Rename läuft durch `lawDiff.ts` mit, dessen Algorithmus nie von den zwei
konkreten Stationen abhing; die gemessenen Beispiele in den Kommentaren
(EABG-Kette, das IFG-Sammelgesetz) bleiben stehen, weil sie ME→RV betreffen.

**Was am Paar hängt, hängt wirklich am Paar:**

- **Die Überschrift** ist die Frage, die das Paar beantwortet
  (`lawStationPairQuestion`) — ME→RV behält „Was sich nach der Begutachtung
  geändert hat", weil die Ergebniskarte darauf verlinkt.
- **Der Hinweis auf den Grund** zeigt auf ein anderes Dokument: nach der
  Begutachtung auf die Erläuterungen der Regierungsvorlage, im Parlament auf
  den **Ausschussbericht**, wo die Abänderungsanträge festgehalten sind. Dass
  der Vergleich selbst keine Ursache zeigt, sagt jeder der Sätze weiter
  ausdrücklich.
- **Die Quellenangabe.** Sie hing am Paar und hängt seit 23.09.2026 an jeder
  **Seite** einzeln (`lawDiffSourceCredit`): ein RIS-Dokument ist CC BY 4.0,
  ein parlamentarisches Dokument ein freies Werk (§ 7 UrhG, so sagen es die
  Datensatzseiten des Parlaments selbst), der Ministerialentwurf trägt gar
  keine Lizenzbehauptung — er ist genau die offene Frage (§13.1). Die alte
  Fassung schrieb „CC BY 4.0" über zwei parlamentarische Fassungen und nannte
  damit eine Lizenz, die es für diese Dokumente nicht gibt.
- **Die §-Titel.** `/paragraphtitel` nimmt dasselbe Paar und cacht danach.
  Eine zwischen zwei Stationen umnummerierte Ziffer adressiert dort einen
  **anderen** Paragraphen, und ein aus einem fremden Paar übernommener Name
  wäre genau der falsche Name, den dieses Modul zu verweigern gebaut ist.

**Die Stationenleiste löst eine Reservierung ein.** `ComparisonId` kannte
`'parlament'` seit dem 15.09.2026, ungenutzt mit der Begründung „der
Vergleich ist nicht gebaut". Er ist es jetzt, also gibt die Station Parlament
ihre Frage aus — aber nur, wo eine Ausschuss- oder Plenarfassung existiert.
Der Link trägt eine Query und nicht bloß einen Anker: auf `#textvergleich`
allein zu landen zeigte den ME→RV-Vergleich, der die Frage „was hat das
Parlament geändert?" nicht beantwortet.

**Geprüft an echten Dokumenten** (40/ME XXVIII, 17.09.2026): RV→Ausschuss
eine geänderte Anordnung (Z 13), RV→Plenum vier (Z 2, Z 13, Z 17, Z 24),
Ausschuss→Plenum dieselben vier — weil das Plenum Z 13 **noch einmal**
angefasst hat, was sich im linken Text genau dieser einen Einheit zeigt. Die
Statistik von ME→Plenum gleicht der von ME→RV in den Zahlen und nicht in den
Texten: vier rechte Seiten unterscheiden sich. Beides sah nach Cache-Fehler
aus und war keiner — nachgesehen statt angenommen.

**Offen geblieben:** Der Vergleich endet an der Plenarfassung. Die
**kundgemachte** Fassung im BGBl ist eine Station weiter und liegt im RIS
(`BgblAuth`), aber sie ist kein Dokument des Gegenstands — sie braucht den
Join, den §12.16 für die Verordnungen schon notiert hat. Und die Auswahl
kennt nur, was Parlament als eigenes Dokument veröffentlicht: ein
**zugespielter** vollabändernder Abänderungsantrag, der vor der Sitzung
kursiert, ist kein Datensatz und wird keiner.

**Nachtrag 26.09.2026: Was der Vergleich über zwei ganze Perioden falsch
macht.** Die Änderungsrate (§12.38) hat den ME→RV-Vergleich über jeden
Entwurf der GP XXVII und XXVI laufen lassen, durch dieselben Module wie der
Dienst, und dabei vier Fehler der Seite freigelegt — keiner davon ist in einer
Stichprobe von Hand aufgefallen:

- **„Es liegt noch keine Regierungsvorlage vor" über zwei Entwürfe, die eine
  haben** (XXVI 79/ME → 331 d.B., 97/ME → 383 d.B.). Beides sind
  Art.-15a-Vereinbarungen, deren Text beim Parlament „Vertragstext" heißt. Die
  Whitelist lässt ihn aus guten Gründen aus (oben), aber
  `MISSING_STATION_REASON.rv` spricht dann über die Existenz der Vorlage statt
  über die ihres Gesetzestexts — genau die falsche Anschuldigung, die
  `stationMap.ts` ausschließen will.
- **Ein Gesetz geht in einem fremden Sammelgesetz auf.** Das Weingesetz (XXVI
  9/ME, eine Einheit) erscheint in der Vorlage als Artikel des
  Materien-Datenschutz-Anpassungsgesetzes; die Artikel paaren nicht, und die
  Seite meldet **1.119 Einheiten „neu"**. `lawsOnlyInTo` fängt es nicht, weil
  kein Gesetz *fehlt* — ein neues kommt nur dazu. Ebenso 115/ME
  (Brexit-Begleitgesetz), und von der anderen Seite XXVII 11/ME: zwei Ziffern,
  in einer 42-Einheiten-Novelle desselben Gesetzes aufgegangen.
- **Artikel paaren nicht, obwohl es dasselbe Gesetz ist** (XXVII 216/ME: „…
  geändert wird (Teuerungs-Entlastungspaket Teil II)" gegen „Änderung des
  Einkommensteuergesetzes 1988"; die Titelähnlichkeit in `pairArticles`
  bleibt unter 0,5). Dann steht alles als entfernt und neu. 7 Entwürfe der
  XXVII ohne jede Artikelpaarung, 3 der XXVI.
- **Gleiche Anordnungen als entfernt und neu** (XXVII 92/ME; 5 Entwürfe mit
  zusammen 67 Paaren gleichen Texts) — ein Fehler der Ausrichtung, nicht des
  Texts.

Alle vier verfälschen dasselbe: den *Umfang* der Änderung. Das ist der Grund,
warum die Rate aus §12.38 nicht vor ihnen auf die Seite gehört.

**Behoben am 27.09.2026, drei von vier:**

- „Vertragstext": `missingStationReason` fragt den Verlauf, und wo eine
  Vorlage verlinkt ist, nennt der Satz den fehlenden Gesetzestext statt einer
  fehlenden Vorlage.
- **Kein gepaarter Artikel, kein Vergleich.** Alle zehn Entwürfe ohne jede
  Artikelpaarung zeigten jede Einheit als entfallen und jede als neu — nicht
  einen schwachen Vergleich, sondern keinen (0 geändert, 0 unverändert je
  Entwurf). `diffLawPackage` meldet das als `unpaired`, und der Vergleich sagt
  den Grund statt der Einheiten. Darunter 9/ME mit seinen 1.119 „neuen"
  Einheiten.
- **Das Gesetz im Titel.** Ein dritter Durchgang in `pairArticles` paart den
  einen Artikel, dessen Gesetzesname im längeren Titel steht (216/ME:
  Einkommensteuergesetz im Titel des Teuerungs-Entlastungspakets) — nur bei
  genau einem Kandidaten und nie für einen Titel, der mehrere Gesetze nennt
  oder dessen Ziffern neu anfangen. Die erste Fassung ohne diese Wache paarte
  85/ME, das zwei Gesetze in einem Text führt, mit dem ersten allein; die
  Seite hätte das zweite „nur in der Regierungsvorlage" genannt. Nebenbei
  richtig gepaart: das ASVG in XXVI 76/ME, das die Klammer „(89. Novelle zum
  ASVG)" unter die Schwelle gedrückt hatte.
- Die Phantompaare der XXVII (67 in 5 Entwürfen) waren alle in Entwürfen ohne
  Paarung und sind mit ihnen verschwunden; in XXVI bleiben 11 in drei
  Entwürfen (162/ME: 9).

**Auch die übrigen zwei, am selben Tag gemessen und gebaut:**

- **Die Artikelnummer zählt nur mit den Paragraphen dahinter** (`c70a686`).
  Über GP XXVI–XXVIII machte der Rückfall auf die Nummer 50 Paare, und die
  Hälfte waren zwei Gesetze, die nach einer Umnummerierung dieselbe Nummer
  trugen (Notarversorgungsgesetz gegen GSVG, EStG gegen FSVG, StGB gegen
  Finanzstrafgesetz). Was sie trennt, ist, was die Novellierungsanordnungen
  adressieren: jedes falsche Paar überlappt in seinen Paragraphen zu 0–50 %,
  jedes richtige (ABGB, „Gewerbeordung", Bindestrich-Varianten) zu 100 %,
  und nach Titel gepaarte Artikel liegen schon am p10 bei 100 %. Die Nummer
  zählt jetzt ab 80 % Überlappung, oder wo keine Seite etwas adressiert. Für
  das Übrige paart ein vierter Durchgang nur mit zwei Belegen zugleich —
  Paragraphen UND Name (gleicher Anfang ohne Leerzeichen und Vorlagenwörter,
  oder eine Abkürzung wie „StGB", „ARHG") —, weil Artikel paralleler Gesetze
  ihre Paragraphen gemessen in 0,4–5 % der Fälle zufällig teilen; die erste
  Namensprobe (ein gemeinsames Stück irgendwo) paarte das GSVG mit dem BSVG.
  Zwölf Entwürfe bewegen sich, jeder von Hand gelesen; Inkrafttretens-Artikel
  zählen nicht mehr als Gesetz des Pakets. Messgerät:
  `pnpm corpus:aenderungsrate -- --gp <GP> --pairs`.
- **Die Artikel des Entwurfs, wo er sie setzt** (`a39ff34`). Die acht
  Entwürfe ohne lesbare Artikelgliederung hatten eine Ursache in sechs
  Formen: die Artikelzeile in `44UeberschrArt`, im Inhaltsverzeichnis, mit
  dem Namen in `11Titel`, der Titel eines Entwurfs ohne Artikel in
  `41UeberschrG1`, das kleine „x" als Platzhalter, gesperrtes „A r t i k e
  l". Ein gemeinsamer Nachlauf beider Parser (`lawtext/articleHeadings.ts`)
  liest sie, mit Wachen für Inhaltsverzeichnis-Tabellen und zitierten
  Änderungstext. Alle acht vergleichen jetzt (XXVII 274 → 279, XXVI 98 →
  101), keiner fällt in die Absage. Am Beilagen-Tor bewegten sich sechs
  Einträge der Grundlinie, alle von verweigert zu geprüft und gegen das RIS
  bestätigt (Hochschülerinnen- und Hochschülerschaftsgesetz 0 → 26
  bestätigte Paragraphen, LMSVG-Novelle 0 → 17); die Grundlinie ist im
  selben Commit nachgezogen.

**Und der Rest, am 28.09.2026** (`d92a946`, `63a8e17`, `3cc7ae8`,
`7ba81a3`), jeder Schritt über drei Perioden gemessen, und jeder bewegte nur
den Entwurf, um den es ging:

- **Ein Titel ohne Namen widerspricht nicht.** „Artikel 1" nennt kein
  Gesetz; dort hält die Nummer, solange die Paragraphen nicht dagegen
  sprechen (85/ME, dessen Artikel 1 nur einen neuen § einfügt), und in der
  Paragraphen-Probe entscheiden die Paragraphen allein (92/ME).
- **Der Kurztitel in der Klammer** paart zwei lange Titel desselben neuen
  Gesetzes — nur wo die Klammer ein Gesetzesname ist, nicht „(89. Novelle
  zum ASVG)" (76/ME: Notarversorgungsgesetz, 59 unverändert, 74 geändert).
- **Derselbe Name Buchstabe für Buchstabe**, ohne Bindestriche, Leerzeichen
  und Genitiv: die Umwandlung verliert den Bindestrich
  („BildungsdirektionenEinrichtungsgesetz", XXVIII 26/ME). Gleichheit, keine
  Ähnlichkeit; 12 Paare über drei Perioden, alle gelesen.
- Das kleine „x" auch in den drei Geschwister-Regeln von Beilage und
  Artikelliste; Drift ohne Befund.

Stand danach: **kein Entwurf in GP XXVI–XXVIII wird mehr abgesagt, weil kein
Artikel paart**; nicht vergleichbar bleiben nur Entwürfe, deren Gesetzestext
nur als PDF vorliegt (je 10 in XXVII und XXVI). Die Phantompaare in XXVI
standen am 28.09. schon bei 0 — die Paarungskorrekturen des Vortags hatten
sie mitgenommen. Die Basisrate verschiebt sich nicht (XXVII n 283, 46 / 63 /
75 %).


### 12.19 Eine Liste, ein Filter, zwei Zeilentypen

> **Teilweise revidiert durch §12.28 (18.09.2026).** Der Satz weiter unten,
> „jede Art behält ihre eigene Karte und Zeile — geteilt ist die Ordnung,
> nicht die Form", gilt nur noch für die **Typen**: drei Typen, drei
> Adapter, nie eine gepoolte Summe. Die *Form* ist seither eine einzige
> (`EntryItem`), weil sechs Komponenten für dieselben Fakten sechs Plätze
> ergaben — gemessen 168 px Drift der Stellungnahmen-Zahl über 14 Zeilen.

§12.16 hat die Begutachtungen ohne Gegenstand auf eine **eigene** Seite
gelegt, mit einem Argument, das ich weiter für richtig halte: Zusammenlegen
ändert, was „Alle Entwürfe", die GP-Summen und die Stellungnahmen-Summen
zählen, und zwei Drittel der Zeilen fehlt genau die Beteiligungsdaten, aus
denen diese Zahlen gebaut sind.

**Das Argument richtet sich gegen das Zusammenzählen, nicht gegen eine
gemeinsame Seite** — und auf die Seite angewandt kostete es mehr, als es
brachte. Aufgefallen ist das an drei Symptomen, alle am 17.09.2026 von Manu
benannt:

1. **Die zweite Liste hatte keinen Eingang.** Die Navigation ist bei vier
   Einträgen gedeckelt (`AppHeader.vue`: „Four items and capped there — a nav
   that stays scannable is the IA"), und die vier Labels sind bei 320 px
   Breite schon 31 px zu breit. Ein fünfter Eintrag war nie verfügbar; die
   Seite hing an einem Startseiten-Abschnitt.
2. **Sie erzwang einen Namen, der nichts sagt.** „Weitere Entwürfe" ist
   relational — weiter als was? — und liest sich wie „weniger wichtig" über
   zwei Drittel des Korpus. Der Namensdruck war ein *Symptom* der Teilung,
   keine eigene Frage.
3. **Sie beantwortete die Frage des Lesers an zwei Orten.** Wer wissen will,
   was gerade offen ist, musste zwei Seiten besuchen und addieren — genau die
   Deckungslücke, aus der diese Datenhälfte überhaupt entstanden ist.

**Gebaut ist jetzt:** `/entwuerfe` hält beide Arten, ein Filter
`?art=ministerialentwurf|verordnung` trennt sie, Voreinstellung ist **alle**.

**Und seit dem 18.09.2026 auch ein Link-Raum.** Die Detailseiten behielten
zunächst ihr eigenes Präfix, mit dem Argument aus §12.16: eigene Objekte,
eigene Seitenanatomie. Das Argument stimmt weiter — nur trägt es keinen
Pfad. Ein Präfix ist nichts, was man liest, sondern etwas, was man
weitergibt: jeder geteilte Link, jede Zeile im Feed, jeder Treffer bei Google
sagte „weitere Entwürfe" über zwei Drittel des Korpus, und wer eine URL
raten wollte, musste vorher wissen, in welcher Hälfte der Daten sein Entwurf
liegt. Die Seiten unterscheiden sich dort, wo der Unterschied sichtbar
gehört, nämlich in der Seite.

Also: **ein Namensraum, zwei Seitenformen.** `/entwuerfe/:gp/:inr` ist der
Ministerialentwurf, `/entwuerfe/:id` der Satz ohne Gegenstand; die Form der
Kennung entscheidet, nicht der Pfad. Alles unter `/weitere-entwuerfe` ist
301 — der nackte Pfad auf `?art=verordnung`, alles darunter auf denselben
Suffix unter `/entwuerfe` (Detailseiten und ihr `.ics`).

**Der Preis, und er ist echt:** `/entwuerfe/:id` beansprucht jedes einzelne
Segment unter `/entwuerfe`. Ohne Prüfung würde `/entwuerfe/xyz` nicht mehr
404en, sondern die RIS-Seite mit einem Fehlzustand rendern. Deshalb prüft die
Route gegen `RIS_ID_RE` (`shared/utils/risConsultations.ts`) — dasselbe
Muster, das der `.ics`-Handler und der API-Handler testen, an einer Stelle,
weil drei Kopien dieser Regel drei Chancen wären, einen gültigen Link zu
404en.

**Die Endpunkte heißen `/api/ris-drafts`** (vorher `/api/weitere-entwuerfe`),
benannt nach ihrer Quelle wie `/api/ris-map`. Zwei Endpunkte bleiben es: die
Daten sind wirklich zwei Hälften, und das ist keine Layout-Entscheidung —
ein gemeinsames Schema hieße, leere Felder zu erfinden. Nur der *Name* durfte
nicht bleiben, denn „weiter als was" war das ganze Problem des Wortes, in der
URL-Leiste wie im Netzwerk-Tab. Umbenannt am 18.09.2026, ohne Weiterleitung:
die Endpunkte sind intern, es gibt keine fremden Konsumenten, und ein 301 auf
einen internen Fetch wäre eine Zusage an niemanden.

**Was die Teilung richtig gesehen hat, bleibt erhalten:**

- **Keine gepoolte Gesamtzahl.** Die Zählzeile nennt jede Art getrennt
  („4 Ministerialentwürfe · 4 ohne Gegenstand im Parlament"); eine
  Schlagzeile „336 Entwürfe" würde die Stellungnahmen-Zahlen eines Drittels
  über alle legen. Nur der Platzhalter der Suche nennt die Summe, weil das
  eine Aussage über den Suchraum ist und nicht über den Korpus.
- **Zwei Zeilenformen, kein gemeinsames Schema.** Ein Ministerialentwurf hat
  Geschäftszahl und Stellungnahmen-Zahl, ein Satz ohne Gegenstand hat beides
  nicht und kann es nicht bekommen. Ein gemeinsames Schema hieße, leere
  Felder zu erfinden, und eine leere Stellungnahmen-Spalte liest sich als
  „niemand hat sich gekümmert", wo „niemand zählt" stimmt. Also behalten
  `DraftCard`/`DraftRow` und `RisConsultationCard`/`RisConsultationRow` ihre
  Form; geteilt ist nur die **Reihenfolge**.
- **Der Erklärkasten steht in der Liste**, nicht mehr auf einer eigenen
  Seite: zwei Arten von Zeilen, und nur zu einer gibt es Stellungnahmen.
- **Die Periode ist auf der RIS-Hälfte die schwächere Aussage** — diese
  Sätze tragen gar keine GP, ihre wird aus dem Beginn im Fensterbereich
  abgeleitet (`gpWindow`). Das steht weiterhin dabei.

**Eine Reihenfolge, nicht zwei** (`shared/utils/draftOrder.ts`). Die
RIS-Sortierung war von Anfang an „deliberately the SAME order `/api/drafts`
produces" — als Konvention, die jemand von Hand einhält. Jetzt ist es
buchstäblich dieselbe Funktion, `compareDrafts`, und `sortConsultations`
delegiert dorthin. Der Grund ist nicht Ästhetik: die Seite mischt die
Ergebnisse **zweier** Endpunkte im Client, und eine zweite Implementierung
würde die gemischte Liste anders sortieren als die Endpunkte, die sie
füllen — sichtbar als Zeilen, die zu springen scheinen, sobald ein Filter
auf eine Art einschränkt. Genau das prüft `tests/draftOrder.test.ts`: die
Reihenfolge der ME-Zeilen innerhalb der gemischten Liste muss ihrer
Reihenfolge allein gleichen.

**Geprüft am 17.09.2026**, gegen die beiden Endpunkte gerechnet und mit der
gerenderten Seite verglichen: acht offene Sätze der GP XXVIII erscheinen als
VO, ME, VO, ME, ME, VO, ME, VO — nach Frist verschränkt, und die vier mit
Frist 16.10. alphabetisch über beide Arten hinweg. Die DOM-Reihenfolge
entspricht `compareDrafts` exakt.

**Offen geblieben, bewusst:** die Startseite trägt weiterhin **zwei**
Abschnitte „Jetzt in Begutachtung". Ob die zusammenfallen, ist eine eigene
Frage — sie ändert, was die Kachel darüber zählt, und die gehört mit der
gemischten Liste vor Augen entschieden, nicht vorher geraten.
**Entschieden am 17.09.2026: sie fallen zusammen, und die Kachel fällt weg
— §12.20.**


### 12.20 Keine Kacheln: die Startseite zeigt Zeilen, keine Summen

Die vier StatTiles standen seit dem ersten Release (`bae33a8`, 22.08.2026):
offene Begutachtungen · enden in ≤7 Tagen · Stellungnahmen in der GP ·
Begutachtungen in der GP. Sie sind die KPI-Leiste eines Produkts, das
damals „eine Liste laufender Begutachtungen" war. Seither ist der
Nachverfolgungs-Teil dazugekommen, und an den Kacheln wurde seitdem nur
noch **geflickt**, damit sie wahr bleiben: Kachel 4 bekam am 27.08. ein
Label, das einen Link auf den Verlaufsabschnitt trägt (`9fdfe6b`), Kachel 1
am 17.09. den engeren Nenner „Ministerialentwürfe", weil sie sonst eine
falsche Vollständigkeit behauptet hätte (`80b7c42`).

**Der Befund, der die Entscheidung trägt:** in der gesammelten
Korrespondenz mit möglichen Nutzerinnen und Nutzern — NGOs, Journalismus,
Forschung, Verwaltung — steht **keine einzige Frage, die eine dieser vier
Zahlen beantwortet**. Gefragt wurde nach Abdeckung (Verordnungen), nach
Diffs, nach sprechenden Namen, nach Stellungnahmen zur Regierungsvorlage,
nach der Organisations-/Personen-Einstufung. Das sind Listen- und
Detailseiten-Anliegen. Eine Kennzahl war nie darunter.

Dazu drei Einzelbefunde:

- **Kachel 1 zählte, was direkt darunter steht.** Acht Karten, und die
  Kachel sagt „4" — eine Zahl, die das Auge im selben Blickfeld
  nachzählen kann, und seit der Zusammenlegung von `/entwuerfe` führte ihr
  Link auf eine Liste mit acht Zeilen.
- **Kachel 2 war am 17.09.2026 schlicht falsch im Zuschnitt:** „Enden in
  den nächsten 7 Tagen: 1", während eine Verordnung **an diesem Tag**
  endete. Sie zählt list 81; die Hälfte ohne Gegenstand kann sie
  strukturell nicht sehen.
- **Kachel 4 war ein Link im Kostüm einer Statistik.** Die Zahl („131")
  beantwortete nichts; getragen hat allein ihr Hinweis „Was wurde daraus?
  ↓" — bis zum 17.09. der einzige Zeiger auf den Verlaufsabschnitt über
  dem Falz. Der Zeiger bleibt, als Link im zweiten Satz der Dachzeile; die
  Zahl geht.

**Und keine Fließtext-Summe an ihrer Stelle.** Der naheliegende Ersatz war
ein Statussatz („Derzeit laufen 8 Begutachtungen – 4 Ministerialentwürfe
und 4 Verordnungsentwürfe …"). Dagegen spricht das Scan-Verhalten
wiederkehrender Leserinnen: wer eine Zahl sucht, springt zu Zahlen, und
eine Zahl mitten im Satz ist der schlechteste Ort, um gefunden zu werden.
Die Regel, die daraus folgt und die auch die Zählzeile auf dieser Seite
erledigt hat: **eine Zahl steht bei dem, was sie zählt** — nie in einer
Zusammenfassung darüber, nie in einem Satz. Das ist dieselbe Regel wie
§12.17 für Bedienelemente, eine Ebene weiter.

Die Zählzeile `4 Ministerialentwürfe · 4 ohne Gegenstand im Parlament`
steht deshalb auf `/entwuerfe` weiter (dort beschreibt sie einen Korpus
hinter Filtern, den niemand sehen kann) und auf der Startseite **nicht**
(dort wiederholt sie sechs sichtbare Karten). Was sie dort allein trug —
dass die RIS-Hälfte **fehlt** —, ist eine eigene Zeile geworden, die nur
erscheint, wenn sie fehlt, und direkt unter der Überschrift steht: eine
Korrektur an dem, was die Liste behauptet, kommt nicht als Fußnote unter
der Liste, sonst ist sie schon als vollständig gelesen worden.

**Der Typ steht jetzt auf der Zeile, nicht in der Überschrift.**
`DraftCard`/`DraftRow` führen ihre Metazeile mit „Ministerialentwurf
132/ME" an, `RisConsultationCard`/`-Row` mit „Verordnungsentwurf" — eine
Grammatik für beide. Vorher trug nur die RIS-Hälfte ein Typwort, und in
einer gemischten Liste ist das die falsche Asymmetrie: die unbeschriftete
Art liest sich als Normalfall, die beschriftete als Ausnahme. Sie ist die
**größere** Hälfte (Median 7 gleichzeitig offen gegen 6, gemessen am
17.09.2026 über 2025-01-01 → heute). „132/ME" erklärt sich außerdem nur
dem, der das System schon kennt; das Wort erklärt sich selbst, die Zahl
bleibt als Zitat daneben.

**Deckel bei 6 Zeilen.** Gemessen am 17.09.2026 über denselben Zeitraum
sind im Median 6 Ministerialentwürfe offen (p90 10, max 15) und 7
RIS-Datensätze (p90 18, max 25) — die gemischte Liste läuft also
typischerweise auf ~13 Zeilen und hat 40 berührt. Ungedeckelt schiebt sie
den Verlaufsabschnitt, für den es die Seite gibt, an einem gewöhnlichen
Wochentag hinter das dritte Bildschirmfenster. Gemessen nach dem Umbau:
`#open-heading` bei 416 px statt 698, drei Karten über dem Falz statt
keiner, `#outcomes-heading` bei 2.221 px statt 2.805 (1280×800).
**Seit 18.09.2026 sind es fünf** — dieselbe Messung, dasselbe Argument, nur
eine Länge für alle vier Listen der Seite statt vier (§12.24).

**Was bewusst NICHT gebaut wurde:** keine Quote „X % ohne Begutachtung"
und kein „X Entwürfe nach der Begutachtung geändert" an der Spitze. Die
erste hat keine Gewinnseite und braucht zwei Schutzsätze, die eine Kachel
nicht tragen kann; die zweite ist über eine ganze GP schlicht nicht
gemessen, und die vorhandene Zahl (52 von 91) zählt spätere **Textstände**
im Parlament, nicht Änderungen, die der Begutachtung zuzurechnen wären.
Die erste Zahl einer Startseite definiert, was das Produkt ist — und das
ist Nachverfolgung, kein Punktestand.


### 12.21 Die Reihenfolge der Listen: zuerst mitreden, dann nachverfolgen

Die Startseite trug am 17.09.2026 vier Listen in dieser Folge: *Jetzt in
Begutachtung* · *Zweite Runde* · *Zuletzt abgeschlossen* · *Die meisten
Stellungnahmen*. Gemessen an dem Tag: 8 offene Zeilen (6 sichtbar), 6
Regierungsvorlagen, 4 abgeschlossene Entwürfe plus eine
Kundmachungs-Karte, 5 Rangzeilen — rund 23 Karten.

**Der Befund an der letzten Liste.** „Die meisten Stellungnahmen" zeigte
fünf Zeilen, vier davon abgeschlossen, die älteste 13 Monate alt. Sie
wechselt ein paarmal pro Gesetzgebungsperiode und stand damit als
*letztes Wort* der Seite: eine Rangliste. Was sie misst, ist außerdem
nicht Bedeutung, sondern Mobilisierung — ohne Kampagne bleibt eine
Begutachtung bei Ländern und Kammern, und 846 gegen 707 rangiert dann
Aufrufe, nicht Entwürfe. Nach der Zählung aus §12.20 (keine der
gesammelten Rückmeldungen fragt nach einer Kennzahl) wäre der nächste
Schritt gewesen, sie zu streichen.

**Stattdessen: dieselben Zeilen mit dem, was aus ihnen wurde.** Gemessen
am 17.09.2026 über `/api/drafts/XXVIII/…`:

| Entwurf | Stellungnahmen | Stand |
|---|---|---|
| 126/ME Bundesstaatsanwaltschaft | 846 | bisher keine RV (Frist 31.08.2026 — normale Latenz) |
| 88/ME Umsatzsteuergesetz | 707 | **BGBl. I Nr. 37/2026** |
| 44/ME Kopftuchverbot an Schulen | 616 | Frist 23.10.2025, am 24.10. ans BMB übermittelt, **seither nichts** |
| 32/ME Elektrizitätswirtschaftsgesetz | 572 | **BGBl. I Nr. 91/2025** |
| 132/ME AVMD | 158 | läuft noch |

Das ist die Mission als vier Zeilen: zwei Gesetze, ein Entwurf mit 616
Stellungnahmen und elf Monaten Stille, einer zu früh für ein Urteil. Die
Zeilen standen längst auf der Seite — nur ohne die Spalte, für die es das
Werkzeug gibt. Sortiert bleibt nach Beteiligung, **nie** nach Ergebnis:
Nachverfolgung, kein Punktestand (dieselbe Regel wie im
Verlaufs-Endpunkt).

**Die Auswertung ist auf die laufende Gesetzgebungsperiode beschränkt,
und das steht seit 18.09.2026 auf der Seite.** Beide
Rechenschaftsabschnitte lesen Liste 81 bzw. 101 nur der aktuellen Periode;
gesagt wurde das bis dahin einmal, als „in dieser Gesetzgebungsperiode" —
ein Demonstrativpronomen, das auf nichts zeigt, was zu sehen ist. Jetzt
nennt jeder Abschnitt die Periode dort, wo er seine Aussage macht (die
Rangliste zusätzlich mit ihrem Beginn: eine Rangliste von Zählungen ist
eine Rangliste über ein Fenster), und am Fuß steht der Zeiger auf die
übrigen Perioden — ein Link ist eine Handlung und gehört ans Ende des
Lesens, nicht in seine Mitte.

**Warum der Zuschnitt nicht weiter wird — gemessen am 18.09.2026.** Über
GP XXVII lauten die fünf größten Begutachtungen **106.184**
(COVID-19-Impfpflichtgesetz), **35.296**, **19.026**, **16.534** und
**14.334** Stellungnahmen, vier davon Epidemiegesetz-Novellen. Eine
periodenübergreifende Rangliste ist damit ein COVID-Denkmal, das sich nie
wieder ändern kann und über das, was gerade entschieden wird, nichts
sagt — GP XXVIII's größte Begutachtung hat 846. Die Periodengrenze ist
nicht die bequeme Wahl, sie ist die, die diesen Abschnitt am Leben hält.

**Die Überschrift heißt seit 18.09.2026 nur „Wo am meisten mitgeredet
wurde"**, ohne „– und was daraus wurde" (dieselbe Kürzung wie §12.23): der
Satz darunter sagt es, und das Ergebnis steht als Chip auf jeder
abgeschlossenen Zeile. Was diesen Abschnitt von einer Rangliste
unterscheidet, war nie die Überschrift, sondern die Chips. Überschriften
sagen, was ein Abschnitt ist; beantwortet werden sie von den Zeilen.

**Und sie steht jetzt VOR der Verlaufsliste.** „Zuletzt abgeschlossen"
zeigt an einem gewöhnlichen Tag vier Karten „Bisher keine
Regierungsvorlage" — das ist ME→RV-Latenz, nicht Schubladisierung, und
der Erklärsatz darüber sagt das auch. Aber der Abschnitt, der den Block
eröffnet, bringt die Lektion bei, und vier Fehlanzeigen als Eröffnung
sind genau die Zynismus-Maschine, die die Rahmenregel (§4) verhindern
soll: ein Werkzeug, das nur Fehlanzeigen zeigt, beweist, dass Mitreden
nichts ändert. Die Rangliste eröffnet mit Erfolgen wie Fehlanzeigen und mit
Einsatz; die
Verlaufsliste liest sich danach als lebende Kante. Der Anker im zweiten
Satz der Dachzeile zeigt entsprechend auf den ersten der beiden
Abschnitte.

**Die Zweite Runde bleibt oben — Deckel statt Umzug.** Der erste Entwurf
dieser Umstellung schob sie ans Ende: keine Frist, Karten aus Juni bis
August, 1–8 Stellungnahmen, und sie kostet einen Bildschirm vor dem
eigentlichen Punkt. Dagegen steht, wofür Leute die Seite öffnen — *wo
kann ich mich einbringen* —, und beide offenen Türen gehören zusammen;
die H1 verspricht genau diese Reihenfolge („Was passiert in der
Begutachtung – und was wird daraus?"). Der Platz war das Problem, nicht
die Position: drei Zeilen, dann `ListMore`. Die Bestandsmessung
(6 von 117 Vorlagen am 15.09.2026) sagt nichts über den Ausreißer vor
einer Plenarwoche; ein Deckel begrenzt ihn, ein „alle ansehen" ginge
ins Leere, weil es für diese Auswahl keine eigene Seite gibt.

**Anatomie der rechten Spalte.** Beide Verlaufsabschnitte tragen jetzt
denselben Block: Chip, darunter die Frist — in der Rangliste mit der
Zahl als zusätzlicher Zeile darüber. Die erste Fassung stellte den Chip
unter die Frist, was ihn zwischen den beiden Abschnitten die Plätze
tauschen ließ; in einer Spalte, die man mit den Augen abfährt, ist das
der sichtbarste Unterschied und der bedeutungsloseste.
`StatementCountBlock` bekam dafür `showDeadline`, weil die Frist sonst
zweimal im selben Aside stünde.

**Zwei Quellen für eine Liste, absichtlich.** Die Zeilen kommen aus
`/api/dashboard` (serverseitig, billig), die Ergebnisse aus dem
Verlaufs-Endpunkt (bezahlt Upstream-Abrufe). Der Abschnitt rendert
deshalb in jedem Fall vollständig, und eine Zeile, deren Gegenstand
nicht gelesen werden konnte, trägt schlicht keinen Chip — **nie**
„bisher keine Regierungsvorlage", denn ein nicht aufgelöstes Ergebnis
und eine fehlende Regierungsvorlage sind zwei verschiedene Aussagen, und
nur eine davon ist unsere. Die Rangfolge selbst steht in
`shared/utils/draftOrder.ts`, damit die beiden Endpunkte sie nicht
getrennt herleiten und Chips auf anderen Zeilen landen als den
gezeigten.

**Nicht gebaut:** keine fünfte Liste. „Kommende Begutachtungen" hat keine
Quelle — die Parlaments-API kennt eine Begutachtung erst, wenn sie läuft
(offene Forschungsfrage); eine reine Erfolgsliste
(„Zuletzt Gesetz geworden") wäre ein Punktestand mit umgekehrtem
Vorzeichen, und Erfolge wie Fehlanzeigen stehen schon in zwei Abschnitten
nebeneinander;
eine Umschaltung zwischen „nach Beteiligung" und „zuletzt" würde die
Hälfte der Belege hinter einen Klick legen.


### 12.22 „Was ist neu" — eine Marke auf der Zeile, keine eigene Liste

Die Startseite beantwortete die zweithäufigste Frage einer
wiederkehrenden Leserin nicht: *was ist seit meinem letzten Besuch
dazugekommen?* Die Liste steht nach Frist, nicht nach Einlangen, und sie
ist gedeckelt (damals 6 Zeilen, seit 18.09.2026 fünf — §12.24) — ein
Entwurf, der heute mit sechswöchiger Frist einlangt, sortiert hinter
alles, was diese Woche endet.

**Keine zweite Liste.** Ihre Zeilen wären dieselben, die die offene Liste
schon zeigt; „Neu eingelangt" als eigener Abschnitt zeigte dieselbe
Karte zweimal auf einer Seite. Die Marke reist stattdessen mit der Zeile
und wirkt damit in jeder Liste, die eine rendert — Karte wie dichte
Zeile, Startseite wie `/entwuerfe`.

**Sieben Tage, und was das trifft.** Gemessen am 17.09.2026 über
2025-01-01 → heute: im Median tragen **3 der offenen Zeilen** die Marke
(p90 8, max 24) — auffindbare Minderheit einer Liste, die typischerweise
13 Zeilen lang ist.

**Und die Messung sagt zugleich, wo sie NICHT hilft:** von den 6
sichtbaren Startseiten-Zeilen trägt sie im Median **0** (p90 2, max 5),
eben weil neue Entwürfe mit langer Frist unter den Deckel rutschen. Am
17.09.2026 ist genau das zu sehen — 135/ME und 134/ME sind oben markiert,
136/ME (am selben Tag eingelangt) steht erst auf `/entwuerfe`. Die Marke
macht die Neuzugänge *auffindbar, wo alle Zeilen stehen*; den Deckel hebt
sie nicht auf.

**Das Sortierkriterium dazu gibt es seit 26.09.2026** — „Zuletzt
dazugekommen", die dritte Option des Sortier-Selects von `/entwuerfe`
(`compareByArrival`, `SortKey: 'neu'`). Die Marke macht Neuzugänge
auffindbar, erst eine Ordnung hebt sie nach oben: unter ihr stehen am
26.09.2026 genau die drei markierten Zeilen (139/ME, 137/ME, 138/ME) ganz
oben, darunter 135/ME, das mit kürzerer Frist unter „Nach Frist" über allen
dreien steht.

**Die Entscheidung in diesem Vergleicher: kein Offen/Geschlossen-Vorlauf.**
Die anderen beiden Ordnungen führen mit dem, was noch zu beeinflussen ist;
diese wird nach einer Chronologie gefragt, und eine Chronologie, die nach
Handlungsfähigkeit umsortiert, ist keine. Praktisch unterscheiden sich die
beiden kaum — ein Entwurf, der vor Tagen begonnen hat, läuft fast immer
noch —, aber wo sie es tun, entscheidet das Etikett. Und sie braucht
**keinen Vorbehaltssatz über der Liste**, anders als „Meiste
Stellungnahmen": `startedAt` ist das eine Feld, das alle drei Zeilenarten
führen (`rowOrderKey`), also muss keine Hälfte des Korpus hinten geparkt
werden. Eine Zeile ohne Datum sortiert nach hinten, der Titel bricht die
Gleichstände — und die sind hier der Normalfall, nicht die Ecke: ein Tag ist
eine grobe Einheit, und Ressorts versenden in Schüben.

Offen bleibt der **Zeiger von der Startseite** („3 neu" als Link auf
`/entwuerfe?sort=neu`): erst dieses Kriterium macht ihn möglich, ob er
gebaut wird, ist eine Produktentscheidung und keine Folge davon.

**Nicht gebaut:** keine Zählzeile „3 neu diese Woche" über oder unter der
Liste. Das ist die Zahl im Fließtext, die §12.20 gerade abgeschafft hat —
die Marke steht bei dem, was sie meint.


### 12.23 Das Ende der Kette steht auf der Vorlage, nicht auf dem Entwurf

**Überschrift: „Zuletzt Gesetz geworden", seit 18.09.2026 ohne den Zusatz
„– aus welcher Begutachtung".** Der Zusatz stand doppelt: der Satz unter
der Überschrift nennt die Begutachtung ohnehin („und die Begutachtung, aus
der sie hervorgegangen sind"), und jede Zeile führt ihren
Ministerialentwurf mit Geschäftszahl. Die Überschrift sagt, was der
Abschnitt ist; beantwortet wird sie von den Zeilen.

„Zuletzt abgeschlossen – was wurde daraus?" zeigte die vier zuletzt
beendeten Begutachtungen mit ihrem Ergebnis-Chip. Am 18.09.2026 ersetzt.

**Der Befund: der Chip war aus dem Datum daneben ablesbar.** Die
gemessene Latenz Fristende → erste Regierungsvorlage beträgt im Median
**40 Tage** (p90 189, `RV_BASE_RATES` aus GP XXVII). Die Zeilen des
Abschnitts waren konstruktionsbedingt die jüngsten Schließungen — am
17.09.2026 zwischen 13 und 17 Tage alt. In diesem Alter ist „bisher keine
Regierungsvorlage" kein Ergebnis, sondern die Definition des
Latenzfensters, und der Erklärsatz über der Liste sagte das auch. Ein
Abschnitt, dessen jede Zeile wiederholt, was die Überschrift schon
angekündigt hat, trägt keine Information — er kostet einen Bildschirm und
vier Fehlanzeigen hintereinander.

Getragen hat ihn allein sein Anhang: die eine Karte „Zuletzt
kundgemacht", die eine Sondersuche (`lastEnacted`) ins Leben gerufen
hatte, weil die Liste selbst nie eine Progression zeigte. Der Anhang ist
jetzt der Abschnitt.

**Warum die Daten von der Vorlage kommen müssen.** Der Ministerialentwurf
kennt sein eigenes Ende nicht: die Stationen von 88/ME enden mit
„Regierungsvorlage (474 d.B.)", die Kundmachung steht auf der Vorlage.
Über die eigenen geschlossenen Entwürfe zu laufen kostete zwei Abrufe je
Zeile für das, was ein Abruf auf der Vorlage sagt — und verfände ein
Gesetz nicht, dessen Begutachtung lange vor der Abstimmung endete.

Also: Liste 101 (ein Aufruf für die ganze GP, für die Zweite Runde
ohnehin gecacht), über die `Status`-Spalte auf die fertigen Vorlagen
verengt — **111 von 117** in GP XXVIII am 18.09.2026 —, dann ein Detail-
JSON je Vorlage für die 30 jüngsten. Gemessen am selben Tag: **30
parallele Gegenstand-Abrufe in 0,54 s** (0,42 s je Anfrage), der ganze
Endpunkt kalt **0,93 s**, warm **14 ms**. Serverseitig gerendert wie der
Rest der Rechenschaftsschicht.

**Sortiert wird nach der BGBl-Nummer, nicht nach einem Datum — und das
ist kein Ersatz, sondern die einzige richtige Ordnung.** Ein
Kundmachungsdatum erreicht uns nirgends: der Parlamentssatz führt den
BGBl-Link ohne Datum, und **jede** Datumsspalte der Liste 101 ist das
Einlangen (`DATUM`, `DATUMSORT`, `DATUM_VON`; `PHASEN_BIS` ist eine
Phasen-ID, „05", kein Datum). Und die Beschlussdaten ordnen die
Kundmachungen gerade nicht: 443 d.B. wurde am 03.06.2026 beschlossen und
als **BGBl. I 81/2026** kundgemacht — nach Gesetzen, die am 16.07.
beschlossen wurden und als 62–78/2026 erschienen. Innerhalb eines Jahres
läuft die Nummer in Veröffentlichungsreihenfolge; sie ist der Schlüssel
(`bgblOrderKey`, nur Teil I — Teil II und III führen eigene Serien).

**Der Scan-Deckel ist gemessen, nicht geraten.** Die Liste lässt sich nur
nach Einlangen verengen, und der Abstand Einlangen → Beschluss lief in
der Stichprobe bis **91 Tage** (449 d.B., 26.03. → 25.06.), während 30
Vorlagen bei 117 pro GP etwa einem halben Jahr Zugänge entsprechen —
zweifacher Sicherheitsabstand zum größten beobachteten Verzug.

**Zwei Dinge, die der Zuschnitt bewusst weglässt.** Ohne
Ministerialentwurf keine Zeile: 6 der 30 jüngsten Gesetze waren nie in
Begutachtung (Bundesfinanzgesetze, UWG-Novelle) — ein
Begutachtungs-Monitor beantwortete „aus welcher Begutachtung?" bei ihnen
mit Schweigen. Und ein Entwurf erscheint höchstens einmal: ME → RV ist
1:n und beide Stränge können ins Bundesgesetzblatt führen (74/ME → 443
und 444 d.B. → 81/2026 und 39/2026, §13.4); ohne Entdopplung stünde
dieselbe Karte zweimal, sobald zwei seiner Gesetze ins Fenster fallen.

**Was der Abschnitt nicht kann, und es sagt es selbst:** Der Nationalrat
beschließt in Blöcken — 17 Gesetze an zwei Tagen im Juli, dann nichts
bis Ende September. Die Liste steht zwei Monate still und wechselt dann
fast vollständig. Das ist der Rhythmus des Hauses, keine schale Seite,
und der Satz unter der Überschrift sagt es, damit niemand es für
Stillstand hält.

**Und die Schubladen-Hälfte geht dabei nicht verloren** (Rahmenregel,
Mechanismus 1 gegen 3). Sie steht einen Abschnitt weiter oben, auf den
Zeilen, wo aus dem Warten Evidenz geworden ist: 846 Stellungnahmen ohne
Regierungsvorlage, 616 seit elf Monaten. Die Bilanz verbessert sich
sogar — Schubladisierung dort, wo sie nach dem Latenzfenster etwas
bedeutet, Erfolge dort, wo sie frisch sind.


### 12.24 Vier Listen, eine Grammatik

Die Startseite trug am 18.09.2026 vier Listen mit **vier Längen, drei Arten
weiterzukommen und zwei Abschnitten ohne jeden Ausgang**:

| Abschnitt | Zeilen | Deckel steht in | Weg zum Rest |
| --- | --- | --- | --- |
| Jetzt in Begutachtung | 6 | Seite (`OPEN_ROW_CAP`) | Link oben rechts **und** Textlink unter der Liste — dieselbe URL |
| Zweite Runde | 3 | Seite (`SECOND_ROUND_STEP`) | `ListMore`, +3 auf der Seite |
| Wo am meisten mitgeredet wurde | 5 | Endpunkt (`RANKED_BY_STATEMENTS`) | keiner |
| Zuletzt Gesetz geworden | 4 | Endpunkt (`DISPLAY_COUNT`) | Link oben rechts, auf einen breiteren Filter |

Jede der vier Zahlen hatte ihr eigenes, gutes Argument — 6 war gegen die
Bildschirmhöhe gemessen (§12.20), 3 hielt einen Abschnitt ohne Frist klein,
5 ist die Länge, unter der eine Rangliste eine Anekdote wird, 4 war die
Anzahl, die der Kundmachungs-Endpunkt gerade lieferte. Zusammen ergeben sie
keines: vier Fenster auf vier Korpora, in vier Tiefen geschnitten, lesen
sich als vier Arten von Abschnitt. Die Leserin lernt dann eine Länge pro
Abschnitt statt einer Länge pro Seite — und die Frage „sehe ich hier alles?"
muss sie viermal neu stellen.

**Eine Länge: `HOME_LIST_LENGTH` = 5** (`shared/utils/draftOrder.ts`),
gelesen von beiden Deckeln in der Seite *und* von beiden Endpunkten. Fünf,
weil die Rangliste nicht kürzer darf und der Deckel der offenen Liste nicht
länger: §12.20 hat gemessen, was den Verlaufsabschnitt hinter das dritte
Bildschirmfenster schiebt. Die Kundmachungen gewinnen dabei eine Zeile, die
offene Liste verliert eine.

**Kein `ListMore` auf der Startseite.** Die Arbeitsteilung ist jetzt
explizit und steht in beiden Komponenten: `ListMore` gehört dorthin, wo
jemand eine Liste **abarbeitet** und der Rest die Sache derselben Seite ist
(`/entwuerfe`, das Stellungnahmen-Panel). Ein Abschnitt auf der Startseite
ist ein Fenster auf einen Korpus, der woanders wohnt. Der Knopf vergrößerte
die Startseite für den einen Menschen, der ihn drückt, und ließ dieselben
Zeilen für alle anderen unerreichbar — niemand teilt „Startseite,
zweimal aufgeklappt".

**Ein Link pro Abschnitt, oben rechts, aus einer Komponente**
(`ListHeader`, Gegenstück zu `ListMore`). Die offene Liste hatte zwei — oben
„Alle Entwürfe →", unter der Liste „Alle 13 offenen Entwürfe ansehen →" —,
zwei Abschnitte hatten keinen. Zwei Links auf dieselbe URL sind nicht der
doppelte Ausgang, sondern jemand, der prüft, ob sie sich unterscheiden.

**Die Zahl steht im Link, aber nur, wenn sie etwas sagt.** „Alle 7 offenen
Entwürfe →" über fünf Karten nennt genau das, was der Deckel kostet und was
der Abschnitt selbst nicht zeigen kann. „Alle 5 offenen Entwürfe →" über
fünf Karten zählt, was das Auge schon gezählt hat — das ist die Zahl, die
§12.20 abgeschafft hat, nur an einem neuen Ort. Also: Zahl, solange Zeilen
verborgen sind; sonst nennt der Link nur sein Ziel.

**Das Ziel ist der Filter, der dieselbe Liste erzeugt — notfalls wird er
gebaut.** Für „Wo am meisten mitgeredet wurde" gab es keinen: `/entwuerfe`
konnte nicht nach Stellungnahmen sortieren, ein Link dorthin hätte auf den
*Pool* gezeigt, aus dem die Rangliste gezogen ist, nicht auf ihre
Fortsetzung. Deshalb hat die Liste jetzt eine Sortierung
(`?sort=stellungnahmen`, clientseitig — beide Endpunkte liefern die
gefilterte Menge ohnehin ganz), mit demselben Vergleich wie
`rankByStatements`, Gleichstand-Regel inklusive. Gemessen am 18.09.2026:
`/entwuerfe?art=ministerialentwurf&sort=stellungnahmen` beginnt mit
126/ME · 88/ME · 44/ME · 32/ME · 132/ME — genau den fünf Zeilen der
Startseite, in derselben Reihenfolge, serverseitig gerendert.

Zwei Folgen davon, die dazugehören:

- **Die Hälfte ohne Gegenstand wird nicht bei 0 eingereiht.** Sie führt
  keine Stellungnahmen und wird nie welche führen (§12.16); „0" läse sich
  als „niemanden interessiert" über zwei Dritteln des Korpus. Diese Zeilen
  stehen hinter den gereihten, weiter nach Frist — und eine Zeile über der
  Liste sagt es, bevor die Reihenfolge gelesen ist, nicht darunter.
- **Die Sortierung greift auch auf den Abschnitt „Zweite Runde"** derselben
  Seite. Ein Bedienelement, das eine Liste unter sich auslässt, setzt zwei
  Ordnungen auf eine Seite. Was upstream nicht gezählt werden konnte
  (`statementCount: null`), steht hinten: kein Rang für „nicht gezählt".

**Der eine Link ohne Zahl** ist „Zuletzt Gesetz geworden" → `?status=closed`.
„Abgeschlossen" ist breiter als „Gesetz geworden", also wäre jede Zahl
daneben die Zahl einer anderen Menge. Ein echter Filter „im
Bundesgesetzblatt" braucht ein Ergebnis pro Zeile — 336
Gegenstand-Abrufe —, das ist ein Arbeitspaket und kein Link.

**Der Anker, der ins Leere zeigte.** „Zweite Runde" ist auf `/entwuerfe`
ein Abschnitt, kein Zeilenfilter — eine Regierungsvorlage steht nicht in
Begutachtung —, das Ziel ist deshalb
`/entwuerfe?status=open#zweite-runde`. Der Abschnitt lädt dort clientseitig
und lazy: der Browser springt genau einmal, findet nichts und bleibt oben.
Ein einmaliger Nachsprung, sobald die Zeilen stehen, macht den Link wahr
(verifiziert über CDP am 18.09.2026: `scrollY` 1172, Abschnittskante 24 px
unter der Fensteroberkante).

**Nicht gebaut:** keine Zählzeile unter einer Liste, die sagt „5 von 7
angezeigt" — das ist `ListMore`s Sprache für eine Liste, die hier wächst,
und sie wächst hier nicht. Und keine unterschiedlichen Längen „je nach
Wichtigkeit des Abschnitts": die Reihenfolge der Abschnitte sagt bereits,
was zuerst zu lesen ist (§12.21); die Länge dazu zu benutzen, hieße
dieselbe Rangfolge zweimal zu behaupten.


### 12.25 Die zweite Runde steht unter der Liste, nicht in ihr — und der Stationsfilter, der sie einmal ablösen wird

> **Überholt am selben Tag, 18.09.2026: §12.26.** Der Stationsfilter ist
> gebaut, die zweite Runde steht als Zeile IN der Liste, und der Abschnitt
> unter ihr gibt es nicht mehr. Dieser Abschnitt bleibt stehen, weil die
> Abwägung darin — warum ein Abschnitt und keine Zeilen, was der Filter
> kosten würde — die Voraussetzung ist, gegen die §12.26 gemessen wurde: die
> Kostenschätzung war zu hoch, die Sortier- und Filterbedenken haben sich
> mit der Stationskarte aufgelöst.

Auf `/entwuerfe` fehlte die Hälfte der Antwort auf die Frage, für die
jemand den Filter „In Begutachtung" drückt: *wo kann ich jetzt noch etwas
sagen?* Zu einer Regierungsvorlage kann im Nationalrat genauso Stellung
genommen werden, aber dieses Fenster war nur auf der Startseite und auf der
Detailseite eines Entwurfs sichtbar, der zufällig eine Vorlage hat — nicht
für jemanden, der über den RSS-Link oder eine geteilte URL hier landet.

**Naheliegend war, die Vorlagen als Zeilen unter die Erste-Runde-Zeilen zu
hängen. Dagegen sprechen drei Dinge, und alle drei sind Eigenschaften der
Seite, nicht Geschmack:**

1. **Das Filterlabel wäre über die eigenen Zeilen unwahr.** Eine
   Regierungsvorlage ist *nicht* in Begutachtung — das ist der ganze Grund,
   warum sie „zweite Runde" heißt.
2. **Die Ordnung hätte nichts zu ordnen.** Die offene Liste sortiert nach
   nächster Frist, also nach Dringlichkeit. Die Vorlage veröffentlicht
   keine Frist; das Formular schließt mit der Abstimmung. Die Zeilen fielen
   in den „offen ohne Frist"-Rest am Ende — unten, aber ohne sichtbaren
   Grund.
3. **Die Bedienelemente darüber erreichen sie nicht.** `OpenVorlage` trägt
   kein Ressort, und der Endpunkt antwortet nur für die laufende GP. Ein
   Ressort-Select, der einen Teil der Liste unter sich auslässt, ist genau
   der Fehler, den die Regel „was ein Control ändert, steht bei ihm oder
   darunter" benennt. Dazu käme die Zählzeile, die nach §12.19 bewusst nie
   summiert und eine dritte Art einrechnen müsste.

**Gebaut ist deshalb ein eigener Abschnitt unter der Liste**, mit eigener
Überschrift, eigenem Erklärsatz und eigener Zahl. Die Überschrift ist nicht
Dekoration, sondern das, was die Zeilen erklärt: wer die rechte Spalte
hinunterliest und statt „Noch 28 Tage" plötzlich „im Nationalrat seit
05.08.2026" findet, schließt sonst auf kaputte Fristdaten, nicht auf einen
anderen Verfahrensstand. Dieselbe Position, die die Zeilen-Variante gehabt
hätte — nur benannt.

**Zwei Dichten, wie die Liste darüber** (`SecondRoundRow` neben
`SecondRoundCard`): ab `md` schaltet die Seite auf Zeilen in einem Blatt um,
und sechs freistehende Karten unter einem Blatt lesen sich als andere Seite.
Die Zeile übernimmt die Positionen von `DraftRow` — Typwort und Zitat führen
die Metazeile, die Stellungnahmen stehen, wo `DraftRow` sie hat —, und die
feste rechte Spalte trägt das Datum statt der Frist.

**Nur bei „In Begutachtung".** Kurz stand der Abschnitt auch unter „Alle",
mit dem Superset-Argument: ein engerer Filter darf nicht *mehr* zeigen. Das
Argument verliert gegen die Seite — unter „Alle" sind es 336 Zeilen, der
Abschnitt landet darunter, wo ihn niemand erreicht, und verdünnt die eine
Lesart, zu der er gehört. Die Regel ist damit in einem Satz sagbar: der
Abschnitt erscheint dort, wo jemand gefragt hat, was offen ist.

**Der Nachfolger, bewusst zurückgestellt: ein Stationsfilter.** Statt
Status *offen/abgeschlossen* fragt die Liste dann, **wo** ein Entwurf steht —
mit dem Vokabular, das die Detailseite schon hat (`app/utils/spine.ts`:
`entwurf · begutachtung · rv · parlament · bgbl`). Das ist die
Rechenschaftsschicht als Filter: „alles, was es ins BGBl geschafft hat" und
„alles, was seit der Begutachtung liegt" sind die zwei Fragen, für die das
Projekt existiert, und die Liste ist der Ort, an dem man sie stellt. Beide
Richtungen fallen dabei von selbst gleich prominent aus — derselbe Filter,
keine zwei Tonlagen.

**„Zweite Runde" wäre darin keine Station, sondern eine zweite Achse.** Sie
ist eine Eigenschaft der Station Regierungsvorlage (Formular offen). Als
gleichrangiger Chip neben „Regierungsvorlage" bekäme, wer diese Station
wählt, auch alle längst beschlossenen Vorlagen. Ehrlich ist: Stationen als
Mehrfachauswahl (*wo steht es*) **plus ein getrennter Schalter „nur wo
Stellungnahme möglich"** (*was kann ich tun*) — laufende Frist ODER offenes
Vorlagen-Formular. In diesem Schalter löst sich der Abschnitt oben dann auf.

**Was ihn zurückstellt, ist nicht der Filter, sondern seine Datenlage.**
`DraftSummary` trägt keine Station; eine Station kostet ein bis zwei
Gegenstand-Abrufe pro Entwurf (`getDraftOutcome`) — für die 134
Ministerialentwürfe der GP XXVIII rund 250, für die 353 der XXVII rund 700.
Das ist eine GP-weite Stationskarte mit nächtlichem Prewarm, und damit
genau die Regel, die `app/utils/outcomes.ts` über sich selbst schreibt:
*keine Seite darf von 350 Upstream-Abrufen abhängen* — deshalb sind die Base
Rates dort handkopierte Konstanten aus einem Skript. Dieselbe Karte liefert
danach die Base Rates live: ein Paket, zwei Auszahlungen (Arbeitspaket 6).

Zwei Folgekosten, beide größer als der Filter selbst:

- **Die Zeile.** Rechts steht der Frist-Countdown; der bedeutet nur etwas,
  solange die Frist läuft. Eine stationsgefilterte Liste braucht eine
  stationsabhängige rechte Spalte (Frist / RV seit / BGBl-Nummer).
- **Zwei Drittel des Korpus haben keine Station.** Die Einträge ohne
  Gegenstand enden bei der Begutachtung (§12.16). „Bundesgesetzblatt" leert
  die Liste stillschweigend um zwei Drittel — das muss auf dem Schirm
  stehen, so wie es die Zählzeile heute tut.

### 12.26 Zwei Achsen: wo ein Entwurf steht, und was ich tun kann

§12.25 hat den „Zweite Runde"-Abschnitt unter die Liste gelegt und den
Stationsfilter als Nachfolger benannt — zurückgestellt, weil nicht der Filter
teuer ist, sondern seine Datenlage. Gebaut am 18.09.2026 auf Ansage, und die
Datenlage ist billiger ausgefallen als die Schätzung.

**Die Liste fragt jetzt zwei Dinge getrennt:**

| Achse | Control | Werte | URL |
| --- | --- | --- | --- |
| Wo steht es | Chips, Mehrfachauswahl | Begutachtung · Regierungsvorlage · Parlament · Bundesgesetzblatt | `?station=rv,bgbl` |
| Was kann ich tun | das bisherige Segment | Alle · Stellungnahme möglich · Abgeschlossen | `?status=open` |

Die Stationen sind die der Detailseite (`app/utils/spine.ts`) minus
`entwurf` — ein Dokument, kein Ort, an dem ein Verfahren stehen kann. Ein
Vokabular für Zeitleiste und Liste: wer die Stationen auf einer Seite lernt,
liest die andere.

**„Zweite Runde" ist kein fünfter Chip, und das ist der Kern.** Sie wäre
keine Station, sondern eine Eigenschaft von einer — wer „Regierungsvorlage"
wählte, bekäme sonst auch alle längst beschlossenen Vorlagen. Als Schnitt aus
beiden Achsen ist sie dagegen exakt benennbar und teilbar:
`?status=open&station=rv`. Dafür heißt `status=open` jetzt **„Stellungnahme
möglich"** — laufende Frist ODER offenes Formular zur Vorlage
(`canParticipate`). Das ist die Verschmelzung, die die Frage des Lesers
abbildet: *wo kann ich jetzt etwas sagen* kennt keine Verfahrensstufen.

**Was das mit dem Abschnitt aus §12.25 macht: er schrumpft auf seinen Rest.**
Ein Entwurf in zweiter Runde ist jetzt eine gewöhnliche Zeile — mit Ressort,
Titel, Stellungnahmenzahl und dem Chip „Zweite Runde" in der Spalte, in der
sonst der Countdown steht. Beides zu zeigen hieße, denselben Vorgang zweimal
aufzulisten. Übrig bleiben die rund ein Viertel Vorlagen **ohne**
Begutachtung: zu ihnen gibt es keinen Ministerialentwurf, also keine Zeile,
die sie tragen könnte — und ein offenes Fenster, das wir kennen.

**Und damit ändert sich der Name des Abschnitts, entgegen dem Grundsatz
„dieselbe Sache, derselbe Name".** Er hieß einen Nachmittag lang wörtlich wie
auf der Startseite. Nur ist es nicht mehr dieselbe Sache: die Startseite zeigt
alle sechs offenen Vorlagen, hier stehen fünf davon als Zeile und im Abschnitt
bleibt eine. „Zweite Runde" zu versprechen und eine von sechs zu zeigen liest
sich als Fehler — und wurde am 18.09.2026 auch prompt als einer gemeldet. Also
sagt der Name die Teilmenge: **„Ohne Begutachtung: Stellungnahme im
Nationalrat möglich"**, mit einem Satz darunter, der auf die Zeilen oben
zeigt. Der Grundsatz gilt weiter; er greift nur nicht, wenn die Menge eine
andere ist.

**Die rechte Spalte beantwortet eine Frage zur Zeit.** Solange die Frist
läuft, ist das „bis wann" — kein Stationschip darf den Countdown verdrängen,
weil die Frist das Einzige ist, worauf jemand noch reagieren kann. Danach hat
der Countdown nichts mehr zu zählen, und dieselbe Spalte trägt „was ist daraus
geworden" (`StationBlock`, Anatomie von `DeadlineBlock` und `OutcomeChip`).
In der dichten Zeile kürzt derselbe Satz, statt ein anderer zu werden:
„Kundgemacht: BGBl. I Nr. 69/2026" → „BGBl. I 69/2026". „Bisher" überlebt
jede Kürzung — es ist das Wort, das „keine Regierungsvorlage" zu einem Stand
macht statt zu einem Urteil.

#### Die Karte: warum vom Entwurf aus, nicht von der Vorlage

Der billige Weg wäre Liste 101 plus `preconst`: ein Abruf je Vorlage, jede
mit einem Zeiger zurück auf ihren Ministerialentwurf — halb so viele Abrufe.
`preconst` ist aber kein universelles Feld (`api-exploration.md` §101), ein
fehlender Zeiger also nicht von „nie eine Vorlage geworden" zu unterscheiden.
Genau diese Verwechslung darf dieses Produkt nicht machen: „Bisher keine
Regierungsvorlage" über einem Entwurf, der eine hat, ist eine falsche
Anschuldigung, erzeugt um einen Abruf zu sparen. Also wird **jeder Entwurf
über sein eigenes Stufenprotokoll gefragt** (`findLastRvLink`), dieselbe
Quelle, aus der die Detailseite ihre Kette nennt.

Der Weg ist nicht nur sicherer, er ist **vollständiger**: 592 d.B. trägt zwei
Ministerialentwürfe (96/ME und 103/ME), von denen die Vorlage einen nennt —
die Entwurfsseite findet beide.

**Gegenprobe, zweimal unabhängig bestanden.** Die Karte findet für GP XXVII
296 von 353 Entwürfen eine Regierungsvorlage und für GP XXVI 114 von 163 —
exakt die Zahlen, die `scripts/corpus/rvLatency.ts` am 08.09.2026 von Hand in
`app/utils/outcomes.ts` gemessen hat, live auf einem anderen Weg
reproduziert.

**Kosten, gemessen am 18.09.2026:** GP XXVIII = 135 Entwürfe → 135 Entwurfs-
+ 91 Vorlagen-Details + 1 Liste = 227 Abrufe; GP XXVII = 353 Entwürfe → 650
Abrufe, 35,6 s kalt bei 12 gleichzeitig, 8 ms warm. Daraus drei Regeln, und
alle drei stehen im Code:

1. **Eigener Cache, 6 Stunden** (`stations-gp`, derived). Eine Station
   bewegt sich in Tagen, nicht in Minuten.
2. **Ein Budget von 2,5 s in `/api/drafts`.** Läuft es ab, antwortet die
   Liste ohne Stationen, sagt das (`stationsAvailable: false`, Hinweis über
   den Zeilen) und filtert **nicht** — der Bau läuft im Hintergrund weiter,
   die nächste Anfrage hat ihn. Verifiziert an GP XXVI kalt: 2,66 s,
   ungefiltert, zwei Sekunden später gefiltert.
3. **Ein Prewarm, der den kalten Bau bezahlt**, wo niemand wartet:
   `/api/stations/:gp` wartet die Karte voll ab und ist der dritte Aufruf der
   Prewarm-Unit. Ein Filter, dessen Karte niemand wärmt, ist ein Filter, den
   niemand sieht.

`app/utils/outcomes.ts` formuliert die Regel, der das folgt: keine Seite
darf von 350 Upstream-Abrufen abhängen, *während jemand wartet*.

**Die Hälfte ohne Gegenstand steht bei der Begutachtung — und kommt nie
weiter.** Was daraus für die Stationsachse folgt, hat am 18.09.2026 zwei
Anläufe gebraucht, und beide Fehler sind lehrreich:

1. **Erst lief sie überall mit.** Der Chip „Begutachtung" zeigte 245 Zeilen,
   davon 198 Verordnungsentwürfe — die Station verschwand hinter der Hälfte
   des Korpus. Als Fehler gemeldet, und die Beobachtung war richtig.
2. **Dann flog sie ganz aus der Achse** — auch aus „Begutachtung". Das war
   die falsche Abhilfe gegen die richtige Beobachtung: die 245 sind der
   Korpus, kein Defekt. Der Preis zeigte sich sofort:
   „Begutachtung + Stellungnahme möglich" zeigte **4 statt 7** Zeilen, drei
   laufende Verordnungs-Begutachtungen verschwanden, und der Link der
   Startseite („Alle 7 offenen Entwürfe →") führte auf eine Liste mit vier.
   Eine Zahl auf der Startseite und dieselbe Zahl auf ihrem Ziel sind nicht
   verhandelbar.

**Die Regel, die beide Fehler vermeidet:** unter `begutachtung` gehören sie
dazu, weil sie dort *stehen*. Aus den **späteren** Stationen sind sie
draußen, weil sie sie nicht *erreichen können* — ohne Gegenstand im Parlament
keine Regierungsvorlage (§12.16). Das ist keine Auswahl, sondern das
Verfahren, und es steht als Satz über der Liste, sobald eine spätere Station
gewählt ist. Wer nur die eine Sorte will, hat den Art-Filter daneben; die
Zählzeile nennt die Hälften ohnehin einzeln und summiert nie (§12.19).

**„Verordnungsentwürfe u. a." plus eine spätere Station ist eine leere
Menge** — nicht „nichts gefunden". Dort steht dieser Satz statt des
EmptyState, mit dem Weg hinaus („alle Stationen" als Knopf). Vorher lief
genau diese Kombination in ein wortloses „Keine Entwürfe gefunden".

**Was die Karte nebenbei liefert:** `/api/stations/:gp` zählt die Stationen
einer Periode. Das ist die Basisrate einer *laufenden* Periode, live statt
handkopiert — die Datenschicht von Mechanismus 2 (Arbeitspaket 6), von der
bisher nur ein Skript existierte. Ob daraus eine Aussage auf einer Seite
wird, ist eine eigene Entscheidung; der Endpunkt stellt nur die Zahl bereit.

**Was die Links gewonnen haben.** §12.24 hielt fest, dass die Überschrift
„Zuletzt Gesetz geworden" auf `?status=closed` zeigen musste, weil es den
Filter „im Bundesgesetzblatt" nicht gab — „ein Arbeitspaket, kein Link". Den
gibt es jetzt: `?station=bgbl`. Umgekehrt zeigt „Jetzt in Begutachtung" auf
`?status=open&station=begutachtung`, weil die Zahl daneben laufende Fristen
zählt und `status=open` seit heute mehr umfasst.

**Die dritte Option hieß „Abgeschlossen" bis 25.09.2026 und versprach mehr,
als diese Seite wissen kann.** Die *Menge* stimmt seit dem Umbau oben:
`canParticipate` nimmt einen Entwurf heraus, zu dessen Regierungsvorlage im
Nationalrat noch Stellung genommen werden kann — 13 von 132 abgelaufenen der
GP XXVIII am 24.09.2026. Das *Wort* behauptete darüber hinaus, das Verfahren
sei zu Ende. Von den 119 Zeilen darunter sind 84 kundgemacht und **35 alles
andere als fertig**: 34 warten auf eine Regierungsvorlage, eine liegt im
Nationalrat. Wo ein Verfahren wirklich endet, sagt das die Zeile selbst
(„Kundgemacht", §12.28); der Filter beantwortet die Frage über ihm („Was
kann ich tun"), und die ehrliche Antwort für diese Menge ist **„Nicht
möglich"** — heute, nicht für immer, denn eine Vorlage kann das zweite
Fenster Monate später öffnen. Der Wert bleibt `closed`: Geteilte Links sind
das Einzige, was dieses Projekt nicht neu ausgeben kann (§12.19).

**Warum nicht die ausgeschriebene Form.** Bei 390 px steht die
Segmentgruppe auf 338 px gegen eine Zeile von 358. „Keine Stellungnahme
möglich" bringt sie auf 432 px, „Nicht mehr möglich" auf 366 — beide
sprengen die Zeile auf dem Telefon, und die Gruppe ist `shrink-0`.
„Nicht möglich" misst 329 px und liest sich in der Gruppe als die
Verneinung, die es ist (gemessen 24.09.2026).

**Und der eine Fall, in dem die Menge doch falsch ist, steht jetzt als Satz
über der Liste.** Ohne Stationskarte kennt die Liste `filingOpen` nicht, die
13 fallen herein, und ihre Zeilen sagen „Begutachtung abgeschlossen" über
einem offenen Fenster — die Karte ist Anreicherung mit 2,5-s-Budget, ihr
Fehlen also kein Ausnahmefall, sondern eine Minute nach jedem Neustart. Der
Hinweis, den es für den Stationsfilter schon gab, gilt seither auch unter
„Nicht möglich" („Hier zählt nur, ob die Frist abgelaufen ist: Zu einzelnen
Regierungsvorlagen kann im Nationalrat noch Stellung genommen werden"). Und
die Minute selbst ist seit demselben Tag kürzer: Der Deploy wartet auf den
Prewarm, statt ihn im Hintergrund zu starten (§10).

### 12.27 Eine Lücke ist kein Befund: wo die Seite über Stationen schweigen muss

Der Stationsfilter aus §12.26 hatte einen blinden Fleck, der genau die
Aussage betraf, für die es dieses Produkt gibt. „Bisher keine
Regierungsvorlage" wird aus dem Verfahrensdatensatz des Entwurfs gelesen. In
den alten Perioden endet dieser Datensatz bei **jedem** Entwurf an der
Begutachtung — und die Oberfläche machte daraus denselben Satz wie bei einem
Entwurf, der tatsächlich liegen geblieben ist.

**Wie groß das war:** Wer auf `/entwuerfe` die GP XVI wählte, bekam 297
Entwürfe, die alle aussahen, als wäre aus keinem etwas geworden. Dieselbe
Schnittstelle verzeichnet für dieselbe Periode 270 Regierungsvorlagen
(Zahlen und Methode: `docs/api-exploration.md` §3). Die Seite behauptete also
nicht bloß etwas Unbelegtes, sondern etwas, dem der Nachbardatensatz
widerspricht — eine Ablagequote von 100 %, erzeugt aus einer Archivlücke,
ohne dass ein Ministerium irgendetwas getan hätte. Das ist genau die
Zynismus-Maschine, die die Rahmenregel (§4) verhindern soll, und sie
entstand ohne Absicht.

**Warum es pro Entwurf nicht zu lösen ist.** Gemessen am 18.09.2026 trägt ein
GP-XVI-Entwurf exakt zwei Stage-Einträge — und ein wirklich liegengebliebener
GP-XX-Entwurf ebenfalls. Die beiden Fälle sind auf Einzelebene
ununterscheidbar. Erst die **Periode** trennt sie: verknüpft sie *irgendeinen*
ihrer Entwürfe mit einer Vorlage, dann trägt Abwesenheit wieder Information;
verknüpft sie keinen einzigen, ist Abwesenheit das Archiv.

**Die Regel** (`chainCoverageOf`, `shared/utils/draftStations.ts`) ist deshalb
abgeleitet und **kein hinterlegtes Jahr**: eine *beendete* Periode, in der
kein Entwurf über die Begutachtung hinauskommt, gilt als `unlinked`. Sie
korrigiert sich selbst, wenn das Parlament nachträglich verknüpft, und sie
braucht keine Pflege, wenn eine GP endet. Eine *laufende* Periode ist nie
`unlinked` — dass dort alles an der Begutachtung steht, ist der Kalender.
`unknown` (keine Karte, oder das Budget hat sie abgeschnitten) zählt überall
wie `unlinked`: **Schweigen ist reparabel, eine falsche Anschuldigung nicht.**

**Was die Oberfläche daraus macht:**

- Die Liste hängt in einer solchen Periode **keine Station an die Zeilen** und
  sagt über den Zeilen, warum — die Zeile zeigt stattdessen die Frist, die
  belegt ist. Ohne diesen Satz läse sich eine Liste ohne Stationen wie ein
  Befund.
- **Die Stationsleiste verschwindet dort.** Ein Chip, der nichts filtern kann,
  ist kein Bedienelement, sondern ein Versprechen (§12.24). Kommt ein
  `?station=` per URL, sagt der Satz zusätzlich, dass nicht gefiltert wurde.
- Die Detailseite ersetzt Überschrift, Fließtext **und** die Basisrate durch
  die Benennung der Lücke (`chainUnlinkedHeadlineDe`). Die Basisrate fiel mit,
  weil `rvBaseRateFor` sonst still auf die neueste gemessene Periode
  zurückfällt — auf einer GP-XVI-Seite standen damit GP-XXVII-Zahlen.

**Was bewusst NICHT passiert ist: die alten Perioden aus dem Periodenwähler
zu nehmen.** Titel, Dokumente und Stellungnahmen-Zahlen von 1979 sind echt und
kosten nichts. Das Problem war nie, dass die Zeilen existieren, sondern dass
Abwesenheit als Aussage gerendert wurde.

**Die Grenze dieser Lösung, offen benannt.** Sie greift nur bei *totaler*
Abwesenheit. In den Übergangsperioden (GP XVIII–XXI, RV-Link bei 3/8 bis 7/8
im Stichprobenmaß) ist ein Teil der fehlenden Links vermutlich ebenfalls
Archivlücke — nur lässt sich das dort nicht mehr sauber vom echten
Liegenbleiben trennen, und eine Warnung auf jeder zweiten Zeile wäre selbst
wieder eine Aussage. Diese Periodengruppe bleibt damit die schwächste Stelle
der Nachverfolgung; für Arbeitspaket 6 ist sie der Grund, die Basisraten bei
GP XXII zu beginnen.

### 12.28 Eine Zeile, vier Zonen

Bis zum 18.09.2026 trugen die beiden Listen **sechs Komponenten für drei
Zeilenarten** — `DraftCard`/`DraftRow`, `RisConsultationCard`/`Row`,
`SecondRoundCard`/`Row` —, und jede ordnete dieselbe Handvoll Fakten anders
an. Der Befund, der sie beendet hat, ist messbar. Auf
`/entwuerfe?status=open`, 14 Zeilen in einem Bildschirm, aus dem DOM
gelesen:

| Zeile | „… Stellungnahmen" beginnt bei |
| --- | --- |
| 132/ME „Social-Media-Verbot" | x = 556 |
| Abwasseremissionsverordnung | x = 474 |
| 135/ME (Neu) | x = 446 |
| Ökosoziale Kriterien-VO (Neu) | x = 513 |
| 117/ME | x = 392 |
| 589 d.B. | x = 550 |
| 96/ME | x = 389 |

**168 px Drift.** Die Ursache ist nicht Gestaltung, sondern Bau: die Zahl
war das *letzte Token einer Fließtextzeile variabler Länge*, also eine
Funktion aus Titellänge, Vorhandensein eines Debattennamens und der Frage,
ob „Neu" gefeuert hat. Eine Zahl, die keine Spalte bilden kann, kann nicht
verglichen werden — und Vergleichen ist das Einzige, wofür eine Zahl da ist.

Drei weitere Befunde aus demselben Bild: die rechte Spalte trug unter EINEM
Filter **fünf typografische Behandlungen** (fetter Countdown mit Wash,
fetter Countdown ohne, gelbe Pille mit Datum, zweizeiliges Graudatum,
einzeiliges Graudatum); **zwei Wortlaute für einen Fakt** („Endete am
14.09.2026" auf Verordnungszeilen, „Frist endete 04.09.2026" 200 px darunter
auf Entwurfszeilen); und die dichten ME-Zeilen trugen **gar kein
Startdatum**, die RIS-Zeilen schon. Dazu waren die gelben Stationspillen die
lautesten Objekte der Seite — lauter als ein Drei-Tage-Countdown zwei Zeilen
darüber.

#### Was die Klasse auflöst: drei Dinge, die vorher eines waren

- **Position** folgt der Identität des Fakts. Eine Zahl steht in der
  Zahlenspalte, in jedem Abschnitt, immer.
- **Lautstärke** folgt dem, was die Leserin tun kann. Nur ein offenes
  Fenster ist laut. Nicht die Sortierung, nicht der Abschnitt.
- **Reihenfolge** folgt der Sortierung, und sonst nichts.

Der verworfene Gegenentwurf war „die laute Zone folgt der Sortierung" (nach
Frist → Countdown laut, `?sort=stellungnahmen` → Zahl laut). Er scheitert an
zwei Dingen. Die Zeile **reist**: Startseite, `/entwuerfe`, Screenshot in
einer Mail — eine Zeile, die unter anderer Überschrift etwas anderes
bedeutet, kann niemand lernen. Und er war schon gebaut, als
`emphasis="volume"`: die Zahl in den rechten Slot zu heben **verdrängte dort
den Ausgang**. „846 Stellungnahmen → Bisher keine Regierungsvorlage" IST
aber die Nachverfolgung; §12.21 sagt es selbst — was diesen Abschnitt
aufhörte, eine Rangliste zu sein, waren die Chips. Eine gereihte Liste zeigt
ihren Schlüssel durch die Reihenfolge; die Zahl braucht Ausrichtung, keine
Vergrößerung.

#### Die Anatomie

Dicht (`md+`): `[Titel + Kennung, flex] [Stellungnahmen, 7–8 rem, rechts]
[Stand, 11–14 rem, rechts]`. Karte: dieselbe Reihenfolge, ab `sm` als rechte
Spalte neben dem Titelblock, darunter als eine Zeile — Zahl links, Stand
rechts.

| Zone | Ministerialentwurf | Verordnungsentwurf u. a. | Regierungsvorlage ohne Begutachtung |
| --- | --- | --- | --- |
| 1 Titel | Titel | Titel | Titel |
| 2 Kennung | `Ministerialentwurf 132/ME · BMWKMS · „Social-Media-Verbot"` | `Verordnungsentwurf · BMLUK` | `Regierungsvorlage 594 d.B. · ohne Begutachtung` |
| 3 Stellungnahmen | die Zahl, `0` inbegriffen | „nicht gezählt" — nie eine Ziffer | die Zahl; „nicht abrufbar", wenn der Abruf scheiterte |
| 4 Stand | Countdown → Station | Countdown → „Begutachtung abgeschlossen" | „Stellungnahme möglich" |

**Der Stand steht vor der Zahl.** Auf der Karte oben rechts, die
Stellungnahmen darunter; in der dichten Zeile als äußerste rechte Spalte,
die Zahl davor. Umgekehrt stand es im ersten Anlauf, und die Rangfolge
stimmte nicht: zuoberst liest sich als „das Wichtigste", und das Wichtigste
an einer Zeile ist, ob ich noch etwas tun kann — nicht, wie viele andere
schon etwas getan haben. Auch im Abschnitt, der nach der Zahl reiht: dort
trägt die REIHENFOLGE die Reihung.

**Zone 4 trägt immer zwei Zeilen: der Zustand, darunter das, was ihn
festmacht** — beide im selben Kasten, weil „Kundgemacht" und „BGBl. I Nr.
69/2026" eine Aussage und ihr Beleg sind.

| Lage | Zeile 1 | Zeile 2 |
| --- | --- | --- |
| Frist läuft | `Noch 3 Tage` | `bis Mo., 21.09.2026` |
| Fenster offen ohne Frist | `Stellungnahme möglich` | `zur Vorlage seit 08.07.2026` |
| Begutachtung vorbei, nichts dahinter | `Begutachtung abgeschlossen` | `Frist endete am 14.09.2026` |
| Keine Regierungsvorlage | `Bisher keine Regierungsvorlage` | `Frist endete am 04.09.2025` |
| Regierungsvorlage liegt vor | `Regierungsvorlage liegt vor` | `594 d.B.` |
| Im Parlament behandelt | `Im Parlament behandelt` | `594 d.B.` |
| Kundgemacht | `Kundgemacht` | `BGBl. I Nr. 69/2026` |

Vier Regeln stecken darin. **Ein Wortlaut je Fakt** — `Frist endete am …`
überall (seit 22.09.2026 auch in der Fristpille, `fristEndedDe`), „Endete am
…" ist weg. **Der Wochentag steht nur auf einem
künftigen Datum**: man plant um eine Frist herum, ein vergangenes Datum
schlägt man nach. **Auf einer erreichten Station belegt die Fundstelle, nicht
das Fristende** — zwei Fakten in einem Slot waren die alte Vermischung; bei
„bisher keine Regierungsvorlage" gibt es keine Fundstelle, und dort IST die
verstrichene Zeit die Aussage. Und **„Zweite Runde" verlässt die Zeile**: das
handlungsfähige Wort ist `Stellungnahme möglich`, und „zweite" wäre auf einer
Vorlage ohne Begutachtung schlicht falsch. Als Überschrift und Filter, wo es
eine MENGE benennt, bleibt es.

#### Abwesenheit, die sich nicht als Defekt liest

Der schwierigere Teil, und der Grund, warum die Zuordnung in
`app/utils/entryView.ts` liegt und nicht in einer Komponente: sie ist
testbar (`tests/entryView.test.ts`).

- **Zone 3 auf einer RIS-Zeile sagt „nicht gezählt"**, nie eine Ziffer —
  weder „0" (hieße „niemanden interessiert" über zwei Dritteln des Korpus)
  noch „–" (bei der Statistik Austria das Zeichen für *exakt null*).

  Das ist die dritte Fassung dieses Textes, und die beiden verworfenen
  ergeben die Regel dahinter. **„nicht veröffentlicht"** las sich neben
  einer laufenden Frist als „noch nicht" — als würde nachgereicht, was nie
  erscheinen wird. **„Stellungnahmen ans Ministerium"** sagte, WOHIN eine
  Stellungnahme geht: wahr, aber die Antwort auf eine Frage, die diese
  Spalte nicht stellt — und darum zugleich zu lang und zu unscharf. Die
  Spalte heißt „Stellungnahmen" und fragt „wie viele"; die wahre Antwort
  darauf ist, dass es die Zahl nicht gibt, weil sie niemand führt.

  **Eine Zelle beantwortet die Frage ihrer Spalte** — das ist die
  übertragbare Regel. Der Einreichweg geht dabei nicht verloren: die
  Detailseite sagt ihn in beiden Zuständen ganz („Eine Stellungnahme geht
  hier direkt an das Ministerium …"), und die Feeds tragen ihn über
  `risFilingNote` weiter, wo eine ganze Zeile Platz hat und kein Spaltenkopf
  eine andere Frage stellt. Und „nicht gezählt" enthält **keine Ziffer**:
  das Auge, das die Zahlenspalte abfährt, überspringt die Zeile — richtig
  so, sie nimmt am Vergleich nicht teil.
- **Zone 4 auf einer RIS-Zeile endet mit der Begutachtung.** Das ist ihre
  wahre Endstation, keine fehlende. Über den Korpus steht sie auf ~200
  Zeilen gleich — für sich genommen Deko —, aber sie steht zwischen
  Entwürfen, die etwas anderes sagen, und die leere Zelle wäre die einzige
  Variante, die als Defekt gelesen würde.
- **Kein Ressort auf einer Vorlage**, also kein Token. Als eigene dichte
  Spalte hinterließ es dort ein sichtbares Loch; ein fehlendes Token in
  einer Zeile sieht man gar nicht. Deshalb ist das Ressort jetzt Klartext in
  Zone 2 statt eines Badges in einer eigenen Spalte.
- **„ohne Begutachtung" nur, wo es geprüft ist.** Die Notiz hing bis
  18.09.2026 allein an einem fehlenden `preconst`-Zeiger — und der fehlt auf
  GP XXVIII bei 32 von 117 Regierungsvorlagen, ohne damit etwas über das
  Verfahren zu sagen (`api-exploration.md` §101). Der Zeiger entscheidet
  weiterhin über das *Ziel* der Zeile (eigene Seite oder Parlament), über die
  *Aussage* entscheidet jetzt eine Gegenprobe gegen Liste 81:
  Titelähnlichkeit gegen jeden Entwurf, der vor dem Einlangen begann
  (`server/utils/parliament/precedingDraft.ts`, kalibriert an den 85 belegten
  ME→RV-Paaren derselben Periode). Findet sie nichts, steht die Notiz und ist
  zweifach belegt; findet sie einen plausiblen Entwurf, verlinkt die Zeile
  genauso hinaus und sagt nichts dazu. Die Prüfung ist absichtlich in die
  vorsichtige Richtung unscharf: eine zurückgehaltene Notiz kostet eine
  Information, eine falsche behauptet öffentlich etwas über ein
  Regierungsvorhaben (`begutachtung-uebersprungen.md` §6).
- **Ohne gelesene Kette** sagt die Zeile `Begutachtung abgeschlossen`, nicht
  „bisher keine Regierungsvorlage" — der schwächste Stand, den die Belege
  tragen (§12.27 auf Zeilenebene).

#### Der Kasten steht immer — nur die Füllung wechselt

Der erste Anlauf setzte nur den kritischen Zustand in einen Kasten und alles
Übrige als freien Text. Damit **variierte die Form**, und eine Spalte, deren
Form je Zeile wechselt, liest sich nicht als Spalte: derselbe Fehler, den
dieser Abschnitt eine Ebene höher auflöst, eine Ebene tiefer wiederholt.
Seit 18.09.2026 steht der Kasten auf jeder Zeile, über **beiden** Zeilen des
Stands, und variiert wird nur der Grund:

| Ton | Grund | gilt für |
| --- | --- | --- |
| kritisch | `status-critical/15` | Frist ≤ 3 Tage |
| ernst | `status-serious/15` | Frist ≤ 7 Tage |
| neutral | `accent-50` | offenes Fenster ohne Eile |
| abgeschlossen | `ink-muted/15` | **jeder** erreichte Stand |

Drei Entscheidungen stecken darin.

**`accent-50`, nicht `accent-wash`.** Die offene Liste ist typischerweise 13
Zeilen lang, davon eine kritisch. Mit dem kräftigen `accent-wash` (#cde2fb)
stünden zwölf satte blaue Kästen neben einem blassen roten — die Farbe, die
am seltensten vorkommt, muss die auffälligste sein, sonst ist die Spalte
Dekoration.

**Ein Grau für alles Abgeschlossene**, „Kundgemacht" wie „Bisher keine
Regierungsvorlage". Das ist die Anti-Punktestand-Regel, die `OutcomeChip`
schon durchgesetzt hat: den Erfolg hervorzuheben oder das Schweigen zu
dämpfen wäre beides ein Urteil (Framing-Regel). **Gelb (`mark-wash`) bleibt
draußen** — in Listen hat der Textmarker genau eine Aufgabe, „Neu"; als
Grund jeder abgeschlossenen Zeile bedeutete er nichts mehr, und auf
`?station=bgbl` wären das 84 gelbe Kästen.

**Der Punkt ist weg.** Er war der zweite Tonträger neben dem Grund und im
eingefassten Kasten nur noch Rauschen. „Noch 3 Tage" sagt die Dringlichkeit
in Worten, also reitet die Bedeutung weiterhin nicht auf Farbe allein
(1.4.1).

**Beide Zeilen in `text-ink`.** Auf einem Wash bleibt nur ink AAA —
`ink-secondary` landet bei 6,0:1, `ink-muted` bei 5,6:1. Die Hierarchie
zwischen den Zeilen trägt deshalb die GRÖSSE, was die Regel des
Designsystems ohnehin ist.

**Der Kasten misst sich an seinem eigenen Inhalt**, nie an seinem Container.
Das war zweimal derselbe Fehler: auf der Karte `w-full` im `items-end`-Stapel
— da erbte er die Breite der Stellungnahmen-Zeile UNTER ihm —, in der
dichten Zeile die feste Spaltenbreite, wodurch aus dem Stand ein grauer
Balken wurde. Die Spalte ist fest, der Kasten sitzt rechts darin.

#### Ausrichtung und Schriftgrad: je Dichte eine Regel

**Unter `sm` ist alles linksbündig.** Dort steht der Aside nicht neben dem
Titel, sondern unter ihm, und rechtsbündiger Text unter linksbündigem Text
hat keine Kante, an der er sich ausrichten könnte — er hängt nur am rechten
Rand. Ab `sm` sitzt er in seiner eigenen Spalte und richtet sich nach rechts
aus, in der dichten Zeile immer. `EntryState` hat dafür **kein `align`-Prop**:
`text-align` erbt, und ein Prop müsste jeden dieser drei Fälle noch einmal
benennen, wo das Erben sie schon kennt. Das `ps-2.5`/`pe-2.5` an der Zahl
entspricht dem `px-2.5` des Kastens — so fluchtet die Textkante der Zahl mit
der Textkante IM Kasten darüber, auf der Seite, an der beide ausgerichtet
sind.

**Ein Schriftgrad je Zone.** „nicht gezählt" stand zuerst eine Stufe unter
der Zahl, die es vertritt (`text-xs` gegen `text-sm`). Das ist dieselbe
Varianz, gegen die dieser Abschnitt geschrieben ist, nur innerhalb einer
Zelle: die Zelle steht an derselben Stelle für dieselbe Frage und gehört
darum in denselben Grad. Dass dort keine Zahl steht, sagen die Farbe
(`ink-secondary` gegen ink) und das fehlende Ziffernbild — zwei Träger
reichen, ein dritter kostet die Ruhe der Spalte.

#### Nicht gebaut: der Kasten um die Stellungnahmen

Naheliegend, und trotzdem falsch: die Zahl in denselben farbigen Kasten zu
setzen wie den Stand. Drei Gründe.

**Der Kasten bedeutet etwas.** Seine Farbe ist die Dringlichkeit des
Verfahrens. Eine Zahl hat keine Dringlichkeit — „166 Stellungnahmen" auf
rotem Grund behauptete, die Zahl sei kritisch, und auf grauem, sie sei
erledigt. Die Farbe gehört zu einer Aussage, die die Zahl nicht macht.

**Zwei Kästen sind kein Kasten.** Der Grund, warum die Statusspalte über
hundert Zeilen funktioniert, ist ihre Seltenheit: EIN eingefasstes Objekt je
Zeile. Bekäme jede Zeile zwei, wäre die Seite ein Raster aus Chips, und
hervorgehoben wäre nichts mehr — genau der Zustand, aus dem die gelben
Stationspillen geholt wurden.

**Eine Zahl wird durch Ausrichtung verglichen, nicht durch Einfassung.** Die
Spalte lebt davon, dass 846, 166 und 0 dieselbe rechte Kante haben. Ein
Kasten legte um jede Zahl eine eigene, unterschiedlich breite Kante — die
Ränder konkurrierten mit der Ziffernflucht, die der einzige Zweck der Spalte
ist. Zahlen bekommen `tabular-nums` und eine Kante; Zustände bekommen einen
Grund. Das ist die Arbeitsteilung.

#### Hierarchie: genau zwei Dinge dürfen laut sein

Der **Titel** (laut durch Größe, nie durch Farbe) und **der Kasten in Zone
4** — laut aber durch seinen GRUND, nicht durch seinen Schriftgrad. Zone 4
Zeile 1 steht in jedem Zustand in `text-sm` medium, auch der laufende
Countdown, der zuerst eine Stufe größer gesetzt war: sobald die Farbe die
Dringlichkeit trägt, ist die Größe ein zweiter Träger derselben Aussage, und
die Spalte wippt dann zeilenweise zwischen zwei Graden — die Silhouette, für
die der Kasten da ist, ist damit wieder hin. Alles Übrige: Zahl `text-sm`
semibold ink, Zeile 2 `text-xs`, Kennung `text-sm` secondary mit nur dem
Debattennamen in ink.

Über hundert Zeilen findet das Auge damit zuerst den roten Kasten, dann die
blauen, dann liest es Titel; eine abgeschlossene Liste ist eine ruhige,
gleichförmige Statusspalte. Die Nachverfolgung verliert dadurch nichts: ihr
Träger sind die WORTE dieser Spalte und die zwei Abschnitte, die es für sie
gibt — nie die Farbe.

#### Zwei Folgen, die dazugehören

- **`DraftChain` trägt jetzt `rvDate`.** Eine Zeile in zweiter Runde hat
  keine Frist, an der sie sich datieren könnte, und das einzige Datum, das
  sie hat, ist das Einlangen der Vorlage. Es kostet keinen Abruf: die
  Vorlagenliste, die `parliament/stationMap.ts` ohnehin für den Hausstatus zieht, trägt
  es in derselben Zeile.
- **Jede Liste hat ab `md` einen Spaltenkopf** — `Entwurf ·
  Stellungnahmen · Stand`. Eine Tabelle benennt ihre Spalten einmal; erst
  dadurch dürfen die Zellen darunter ihre Einheitswörter ablegen (die Karte
  unter `md` hat keinen Kopf und trägt „165 Stellungnahmen" weiterhin ganz).

  **Revidiert am 18.09.2026.** Hier stand: „nur dort — über fünf
  Startseiten-Karten wäre ein Spaltenkopf mehr Gerüst als Inhalt." Das
  Argument zählte die Zeilen und übersah, was der Kopf tut: er ist die
  Bedingung dafür, dass die Zellen ihr Einheitswort ablegen, und ohne ihn
  fluchten die Ziffern nicht — die Startseite behielt also die Kartenform
  mit dem Stand ÜBER der Zahl, während dieselben Zeilen auf `/entwuerfe`
  die Zahl links vom Stand trugen. Zwei Anordnungen für eine Anatomie,
  einen Klick auseinander. Dazu kommt, was die Startseite von `/entwuerfe`
  unterscheidet: dort sind es **vier Listen untereinander**, und die
  Reihung nach Stellungnahmen ist nur zu lesen, wenn 846 und 12 über eine
  Abschnittsgrenze hinweg an derselben Kante stehen. Ein Kopf je Abschnitt
  kostet 29 px.

- **Der Titel steht ganz da — kein `truncate`, kein `line-clamp`, in keiner
  Dichte.** Die dichte Zeile kürzte auf eine Zeile, die Karte klammerte auf
  zwei; beides ist am 18.09.2026 gefallen.

  Gemessen über alle 336 Titel: Median 50 Zeichen, p90 117, Maximum 497.
  Eine gekürzte Zeile zeigte damit **31 %** der Titel vollständig, zwei
  Zeilen 75 %. Entscheidend ist aber nicht der Anteil, sondern WO gekürzt
  wird: Amtstitel sind vorne Formel und hinten Sache („Verordnung, mit der
  die GAP-Strategieplan-Anwendungsverordnung …", „Bundesgesetz über die
  Bundesstaatsanwaltschaft; Bundesgesetz zur Ein…"). Eine Kürzung von
  hinten nimmt genau das Unterscheidende weg, und „welcher Entwurf ist
  das" ist die Frage, für die jemand eine Liste überfliegt. Eine ruhige
  Liste, in der man den Gegenstand nicht erkennt, hat nichts gewonnen.

  **Der Preis ist gemessen und angenommen:** 85 der 336 Titel brauchen drei
  Zeilen oder mehr, einer davon vierzehn — eine Weinbau-Verordnung mit 497
  Zeichen. Solche Zeilen sind hoch und brechen den Takt der Liste. Die
  Entscheidung dagegen ist, dass die Zeilenhöhe dann ehrlich über den Titel
  ist, den das Amt vergeben hat; die Kürzung war es nicht. Damit ist das
  hier zugleich die Messlatte für das Arbeitspaket **„sprechende Namen"**:
  es hat die TITEL zu kürzen, nicht ihre Anzeige.

  **Gebaut als `EntryList`**, nicht als kopiertes Markup: der Kopf stand
  sonst an fünf Stellen und müsste mit den Zellen in `EntryItem` auf das
  Pixel fluchten. Die zwei Spaltenbreiten sind deshalb `@utility
  entry-col-count` / `entry-col-state` in `main.css` — eine Verabredung
  zwischen zwei Dateien, die niemand prüft, ist keine; ein Kopf, der um
  8 px neben seiner Spalte steht, behauptet eine Ausrichtung, die es nicht
  gibt. Der Kopf der ersten Spalte ist benennbar (`lead`), weil der
  Abschnitt „Zweite Runde" Regierungsvorlagen listet und kein Gerüst dem
  Inhalt widersprechen darf.

#### Was das an §12.19 revidiert — und was nicht

§12.19 sagt: „jede Art behält ihre eigene Karte und Zeile — geteilt ist die
Ordnung, nicht die Form." Die zweite Hälfte davon ist hiermit aufgehoben,
die Begründung dahinter nicht. Sie war gegen das **Erfinden leerer Felder**
geschrieben: `RisConsultation` darf keine nullbaren `citation`-,
`statementCount`- und `chain`-Felder bekommen, damit eine Form auf alles
passt — genau daraus entsteht „0 Stellungnahmen" über zwei Dritteln des
Korpus. Das gilt weiter und ist im Code so gebaut: drei Typen, drei Adapter,
**keine gepoolte Summe**. Geteilt ist die *Anatomie*, und jede Abwesenheit
darin ist benannt, je Art, an einer Stelle.

#### Nicht gebaut

Keine Farbe je Ausgang (grün Gesetz, rot keine RV) — Framing-Regel: Erfolg
und Liegenbleiben in einer Tinte, Farbe bekommt nur Dringlichkeit. Kein
gemeinsames Wort für zwei verschiedene offene Fenster: `Noch 12 Tage` und
`Stellungnahme möglich` müssen verschieden heißen, ein hartes Datum und ein
undatiertes Fenster sind verschiedene Fakten, und „Offen" verstecke genau
das, was sie unterscheidet. Kein Countdown UND eine Station auf derselben
Zeile — ein Zustand zur Zeit. Keine berechnete Spalte „X Monate ohne
Vorlage": `noRvVerdictDe` ist ein Satz der Detailseite mit seiner
Latenzklammer, auf einer Liste würde daraus der Punktestand, den die
Framing-Regel verbietet.

**Offen geblieben:** die Zeilenhöhe schwankt jetzt mit der Titellänge, und
bei den längsten Verordnungstiteln stark — siehe oben, bewusst. Ebenso: auf
der Karte stehen Zahl und Einheitswort in einer Zeile, rechtsbündig — die Ziffern fluchten dort also nicht untereinander,
nur ihre rechte Kante tut es. Auf dem Telefon, wo die Karte seit 18.09.2026
die einzige Fassung ist, ist das der bessere Tausch gegen zwei zusätzliche
Zeilen pro Karte; der Vergleichsfall ist die dichte Zeile, und dort ist die
Spalte echt. Ebenso bewusst in Kauf genommen: bei genau 768 px bricht
`Stellungnahme möglich` auf zwei Zeilen um. Die Spalte darf das, seit die
Pille weg ist — und die Alternative wäre gewesen, dem Titel weitere 40 px zu
nehmen, der bei 768 px ohnehin schon bei ~38 Zeichen abschneidet.

**Zwei Ressorts in Zone 2 (23.09.2026).** Ein Entwurf, den zwei Ministerien
gemeinsam aussenden, steht in Liste 81 zweimal — identisch bis auf die
Ressortspalte (GP XXVII: 302/ME BMFFIM ∥ BMJ, 266/ME BMF ∥ BMFFIM, 114/ME
BMJ ∥ BMDW; GP XXVIII heute keiner). Die Liste zeigte ihn zweimal, dann nach
der ersten Faltung einmal mit dem Ressort, das das Parlament zufällig zuerst
lieferte — und die Seite konnte ein anderes nennen als die Liste. Jetzt
trägt `DraftSummary.coMinistries` die weiteren Ressorts, eine Faltung
(`foldJointDraft`, `server/utils/parliament/draftList.ts`) sortiert die Zeilen
eines Entwurfs nach dem Kürzel — Codepunkt-Vergleich, damit die Führung nicht
von den ICU-Daten des Renderers abhängt — und Liste wie Seite nehmen dieselbe.
In Zone 2 steht je Ressort ein Kürzel, verbunden mit dem Mittelpunkt, den die
Zone ohnehin hat („Ministerialentwurf 302/ME · BMFFIM · BMJ"); ein zweites
Trennzeichen in einem verschmolzenen Token wäre für drei Zeilen in 350 eine
neue Regel zu lernen gewesen. Im Kopf der Entwurfsseite steht je Ressort ein
Abzeichen mit eigenem Filterlink — ein Abzeichen ist ein Ziel, und eines für
beide könnte nur auf eine der zwei gefilterten Listen zeigen —, in der
Prosazeile verbindet „und", weil dort der Mittelpunkt schon Fakten trennt.
Ressortfilter, Ressortmenü, Suche und Feeds kennen beide Kürzel. Die Führung
ist deterministisch, nicht inhaltlich: bei 302/ME führt BMFFIM, obwohl das
Justizministerium übermittelt hat. Soll das übermittelnde Ressort führen, ist
das eine andere Regel aus einer anderen Quelle (`invitedBy`).

### 12.29 Die Erläuterungen auf der Seite: der erste Schritt der Relevanzprüfung

Die Seite hatte für das größte Dokument des Verfahrens einen PDF-Link. Wer
einen neuen Entwurf prüft, fängt aber genau dort an — erst den **Allgemeinen
Teil der Erläuterungen** überfliegen (was soll das Gesetz?), dann den
Gesetzestext oder die Textgegenüberstellung, und erst bei einem Treffer den
Besonderen Teil zum einzelnen Paragraphen. Schritt 2 lieferte die Seite seit
§12.13, Schritt 1 nicht.

**Warum die Kurzbeschreibung des Parlaments das nicht abdeckt.** Sie steht
unter „Worum geht es?" und bleibt dort: Sie ist die Zehn-Sekunden-Auskunft.
Sie ist aber für den parlamentarischen Betrieb geschrieben, nicht die
Begründung des Ressorts — und einem **Verordnungsentwurf fehlt sie ganz**,
weil er nie ins Parlament kommt. Auf der RIS-Hälfte des Korpus, zwei Dritteln
aller Verfahren, sind die Erläuterungen damit die einzige Auskunft über den
Zweck, die das Verfahren überhaupt veröffentlicht.

**Kein Sprachmodell, ein Parser.** Was auf der Seite steht, sind die Absätze
des Ressorts in seiner Reihenfolge. Das RIS führt die Erläuterungen als
eigenes Dokument des Begut-Satzes, und sein XML ist typisiert statt bloß
formatiert: `<ueberschrift typ="erlz">` trägt die Teil-Überschriften,
`<ueberschrift typ="erll">` die Passagen — im Besonderen Teil in der Form
„Zu Z 4 (§ 54c Abs. 1a und 1b):". Gelesen wird über `parseRisXml`, denselben
Leser, den Entwurfstext und ME→RV-Vergleich benutzen
(`server/utils/explanations/risExplanations.ts`, rein; `explanationsService.ts` ist die
Nitro-Hälfte, `tests/risExplanations.test.ts` hält die Formen fest).

**Gemessen vor dem Bauen** (`pnpm corpus:erlaeuterungen`, 465 Dokumente mit
Fristbeginn ab 2024, gelesen durch den Produktionsparser):

| | |
|---|---:|
| Sätze im Fenster mit Erläuterungen-Dokument | 97,7 % |
| davon als XML (nicht nur PDF) | 100 % |
| davon ohne jeden Text (Scan im XML) | 4,1 % |
| lesbare Dokumente mit Allgemeinem Teil | **98,4 %** |
| davon vom Ressort selbst so benannt | 90,1 % |
| davon von uns erschlossen | 8,3 % |
| Länge des Allgemeinen Teils | Median 2.309, p90 7.727, max 40.335 Zeichen |
| Dokumente mit erkennbarem Besonderen Teil | 91,0 % |
| dessen Passagen, die einen § nennen | 76,3 % |

Die letzte Zeile ist die Vorarbeit für die zweite Hälfte des Pakets — die
Passagen am Paragraphen der Gegenüberstellung. Sie ist **hier nicht gebaut**:
Der Schlüssel ist gezählt, verbunden ist nichts.

**Vier Fallen, jede davon aus der Messung oder von der Seite, keine aus dem
Kopf:**

1. **Ein Dokument namens „Erläuterungen" sind nicht immer Erläuterungen.**
   Manche Ressorts legen Vorblatt und wirkungsorientierte Folgenabschätzung
   in dieselbe Datei; ihre Teile heißen dann „Ziel(e)", „Inhalt",
   „Maßnahmen", „Problemanalyse". Ein Formblatt unter der Zusage „die
   Begründung des Ministeriums" wäre die falsche Antwort in der Form der
   richtigen. Ein WFA-Teil wird deshalb erkannt und vertritt den Allgemeinen
   Teil nie (im Fenster: 2 Dokumente).
2. **Überschriften sind numeriert und gesperrt gesetzt** — „I. Allgemeiner
   Teil", „A. Allgemeiner Teil", „E r l ä u t e r u n g e n" (5 Dokumente).
   RIS normalisiert Leerraum auf ein Zeichen, die Wortgrenzen sind also weg,
   bevor wir lesen: Teil-Überschriften werden ohne jeden Leerraum verglichen.
3. **Ein Scan ist kein leeres Dokument.** Wo das Ressort Bilder geliefert
   hat, steht im XML nur `<absatz typ="abbobj">` mit dem GIF-Pfad — und ein
   Pfad ist Text. Der erste „Absatz" des Budgetbegleitgesetzes 2027-2028 kam
   als „/Dokumente/Begut/…0001.gif" heraus. Abbildungen zählen jetzt als
   verworfen statt als Prosa, womit der Scan als Scan sichtbar wird (dieselbe
   Unterscheidung wie `isScanned` bei der Beilage).
4. **Die Gliederung steht manchmal eine Ebene tiefer.** Die
   Studienbeitragsverordnung schreibt „Allgemeiner Teil:" und „Besonderer
   Teil:" als `erll`. Als Passagen gelesen galt das Dokument als
   ungegliedert, **und** sein Allgemeiner Teil endete auf einer leeren
   Überschrift „Besonderer Teil:" — an der Seite gesehen, nicht in der
   Messung. Nur diese zwei Namen werden eine Ebene hochgezogen; jede andere
   `erll`-Überschrift bliebe sonst ein Teil für sich.

**Zwei Regeln, die etwas erschließen — und beide sagen es.** Wo kein Teil
„Allgemeiner Teil" heißt, gilt die Prosa vor dem Besonderen Teil als solcher
(`generalInferred`), aber nur, wenn das Dokument keinen WFA-Teil trägt und
seine führenden Teile gar keine Überschriften haben: Ein Ressort, das seine
Teile benennt und keinen davon „allgemein" nennt, hat etwas gesagt. Und wo
ein Dokument ohne Trenner aus der Begründung in „Zu § 1:" läuft — das
Erneuerbaren-Ausbau-Beschleunigungsgesetz sind so 106.262 Zeichen unter einer
Überschrift —, wird an der ersten adressierten Passage getrennt; das ist die
Konvention der Legistischen Richtlinien selbst. Die Seite schreibt in beiden
Fällen dazu, dass die Abgrenzung von uns stammt.

**Was die Seite zeigt, und wo sie faltet.** Ein Zeichenbudget (1.400), nicht
eine Absatzzahl, und geprüft **bevor** ein Absatz dazukommt: Sonst rutscht
genau der lange Absatz noch ganz hinein, den zu falten der Zweck ist (132/ME
schreibt 3.000 Zeichen am Stück). Der erste Absatz steht immer — ein
Aufklapper als erstes Element wäre die Seite, die ihre eigene Antwort
versteckt —, und kein Absatz wird mitten im Satz abgeschnitten: Es ist der
Text des Ressorts. Der Rest liegt in einem nativen `<details>`, wie die
Kurzbeschreibung und die Kontextzeilen des Vergleichs.

**Serverseitig, aber mit Frist — entschieden 19.09.2026.** Zuerst wurde der
Abschnitt client-seitig geladen, wie `geltendesrecht` und die Vergleiche, mit
dem Argument, ein RIS-Abruf pro Entwurf gehöre nicht in den SSR-Pfad jeder
Detailseite. Das Argument stimmt, es trägt nur nicht so weit: Der Preis war,
dass der Text nicht im ausgelieferten HTML steht — bei einem Abschnitt, der
CC BY ist und die Substanz der Seite trägt, ist das die Substanz, die kein
Crawler und kein Leser ohne JavaScript sieht.

Beides geht, weil die Gegenseite schnell ist und die Frist kurz sein darf.
Gemessen am 19.09.2026 über zehn Entwürfe der GP XXVIII: kalt — das Dokument
noch nicht im Cache, also RIS-Abruf plus Parser — **40 bis 178 ms**, warm
Millisekunden; die Detailseite selbst rendert kalt rund 800 ms. Die Frist
steht deshalb bei **800 ms** (`useExplanations`), dem Vier- bis Fünffachen des
langsamsten gemessenen Kaltfalls. Nachgemessen an vier Entwürfen kostet der
Abschnitt im kalten Seitenaufbau 0 bis 200 ms, im warmen nichts.

**Was die Frist abwendet, ist kein Ausreißer, sondern eine Bauart:** `getText`
(`ris/konsLaw.ts`) wartet 20 s und versucht es dreimal, also könnte eine kranke
Gegenstelle eine Seitenauslieferung knapp eine Minute lang aufhalten. Der
Abbruch gilt dem **Rendern**, nicht dem Abruf — `Promise.race` lässt die
angefangene Anfrage weiterlaufen, sie füllt den Cache, und der Nachschlag des
Clients trifft ihn warm an. Ein `timeout` von `useAsyncData` hätte abgebrochen:
dieselbe Arbeit zweimal, und ein Fehlerzustand, der „das RIS ist weg" nicht
mehr von „wir haben nicht gewartet" unterscheidet. `null` heißt daher genau
eine Sache, und der Abschnitt zeigt dafür seinen **Lade-**, nicht seinen
Fehlerzustand: Im HTML, das ein Crawler zu sehen bekommt, darf über einem
Abschnitt, der eine Sekunde später da ist, nicht „nicht verfügbar" stehen.

**Zwei Fallen von Nuxt, beide gemessen statt vermutet** (19.09.2026, mit
`--dump-dom` und einer Sonde im Endpunkt): Ein `refresh` **während** der
Hydration wird aus der Nutzlast der Seite beantwortet — also mit genau dem
`null`, das er ersetzen soll; der Abschnitt blieb bis zum nächsten Seitenaufruf
auf „wird geladen" stehen. Er hängt jetzt an `onNuxtReady`. Und ein
gemeinsamer Schlüssel allein macht aus zwei Lesern noch keinen Abruf: Nuxts
Voreinstellung `dedupe: 'cancel'` ließ den zweiten Abschnitt den Abruf des
ersten abbrechen und einen eigenen starten — zwei Aufrufe je Seitenaufbau,
schon vor dieser Änderung. Mit `dedupe: 'defer'` ist es einer.

**Die Caches sind getrennt** (§5): das Dokument, wie RIS es geschickt hat,
persistent und 30 Tage (ein Begut-Dokument wird nicht revidiert, ein
korrigierter Entwurf bekommt einen neuen Satz); die Lesung davon `derived`
und einen Tag, weil `explanations.ts` genau die Sorte Parser ist, deren
Änderung sonst einen Tag lang unsichtbar bliebe. Und ein Fehler ist keine
Antwort: „keine Erläuterungen", „nur ein Scan" und „kein Allgemeiner Teil
ausgewiesen" sind Zustände, die RIS wirklich hat; ein Timeout fliegt und wird
nicht zwischengespeichert.


### 12.30 Die Begründung am Paragraphen: der Join, den die Ressorts selbst schon geschrieben haben

Die zweite Hälfte des Erläuterungen-Pakets (§12.29): Der Besondere Teil erklärt
Bestimmung für Bestimmung, die Textgegenüberstellung zeigt Bestimmung für
Bestimmung, was sich ändert — und bis 18.09.2026 standen die beiden in
verschiedenen Dokumenten. Jetzt trägt jeder § der Gegenüberstellung einen
Aufklapper „Warum? Die Begründung des Ressorts".

**Warum das kein zweites Ausrichtungsproblem ist.** Der Besondere Teil
überschreibt seine Passagen mit der Adresse, die das Werkzeug ohnehin
berechnet: „Zu Z 4 (§ 54c Abs. 1a und 1b):" nennt Novellierungsanordnung und
Paragraphen, „Zu Art. 2 (Änderung des KommAustria-Gesetzes)" das Gesetz des
Pakets. Die Beilage führt ihre Zeilen unter denselben zwei Schlüsseln
(`ComparisonRow.law`, `ComparisonRow.para`). Der Join ist ein Nachschlagen,
keine Ähnlichkeitssuche — `server/utils/explanations/explanationsJoin.ts`, und der
Schlüssel selbst steht in `shared/utils/explanationKey.ts`, weil ihn beide
Seiten bilden müssen.

**Gemessen** (`pnpm corpus:erlaeuterungen -- --join`, Fenster ab 2024: 277
Entwürfe mit allen drei Dokumenten als XML, davon 130 mit §§ in der Beilage
und Passagen im Besonderen Teil):

| | |
|---|---:|
| §§ in den Beilagen | 2.029 |
| davon mit Begründung am Paragraphen | **77,8 %** |
| Deckung je Entwurf | p10 43 %, Median 89 %, p90 100 % |
| Passagen ohne § in der Beilage | 16,3 % |
| Passagen verworfen (Gesetz nicht bestimmbar) | 20 |
| Entwürfe ganz ohne Treffer | 9 (6,9 %) |

**Die 16,3 % ohne Ziel sind kein Fehler, sondern der Zuschnitt der Beilage.**
Sie druckt, was sich ändert; die Erläuterungen erklären auch, was neu
erlassen wird und wo nichts gegenübergestellt werden kann — ein Stammgesetz
im selben Paket hat keine geltende Fassung neben sich.

**Drei Anläufe, und jeder wurde von der Messung korrigiert.** Das ist der
eigentliche Ertrag dieses Eintrags, weil jeder der drei Fehler eine Zahl
erzeugt hätte, die plausibel aussieht:

1. **30,1 %.** Der Eintrag trug `law: null`, „weil ein Entwurf mit einem
   einzigen Gesetz keinen Schlüssel führt". Die Beilage führt ihn sehr wohl,
   sobald der Entwurf einen benannten Artikel hat — auch bei genau einem. Bei
   der Honigverordnung Novelle 2025 passten alle neun §§ und trafen sich
   trotzdem nie.
2. **48,6 %.** Die Artikelüberschrift des Besonderen Teils steht bei vielen
   Ressorts nicht als `erlz`, sondern als Passage: „Zu Art. 1 (Änderung der
   Notariatsordnung)" (Berufsrechts-Änderungsgesetz 2024, 31 Passagen ohne
   Gesetz) oder als bloßes „Artikel 1" mit dem Gesetzesnamen in der Zeile
   darunter (EU-Batterienverordnung Begleitgesetz, 56 Passagen ohne Gesetz).
   Beide Formen sind jetzt Artikelmarken, und die Passage darf ihr Gesetz
   auch in der eigenen Überschrift nennen („Zu Art. 2 Z 1 (§ 7)").
3. **66,9 % → 77,8 %.** Dazwischen fiel auf, dass „Zu Z 3 bis 6 (§§ 23 bis 25
   NO)" nur § 23 erreichte: Nur der erste Paragraph eines Bereichs trägt das
   Zeichen. Bereiche aus glatten Zahlen werden jetzt aufgezählt; „§§ 140a bis
   140i" nicht, weil dafür die Buchstaben dazwischen erfunden werden müssten.

**Wo nichts angehängt wird, und zwar absichtlich.** Markiert die Beilage ihre
Gesetzesgrenzen nicht (6 Entwürfe im Fenster), tragen ihre Zeilen kein Gesetz,
die Passagen aber eines — dann findet der Schlüssel nichts, und das ist die
richtige Antwort: § 14 der einen Verordnung ist eine andere Bestimmung als
§ 14 der anderen, und die falsche Begründung am Paragraphen wäre schlimmer als
keine. Dieselbe Verweigerung spricht `ComparisonRow.law` über sich selbst
schon aus (§12.13). Ebenso verworfen wird eine Passage, deren Gesetz in einem
Mehrgesetzespaket unbestimmt bleibt — nach den drei Korrekturen sind das noch
20 von 1.906.

**Auf der Seite** steht der Aufklapper zugeklappt direkt unter der §-Zeile,
nicht unter den Absätzen: Die Frage an dieser Stelle ist „was ändert sich" —
das beantworten die Zeilen —, „warum" ist die Anschlussfrage. Bei einem § mit
zwölf Zeilen stünde sie am Fuß außer Sichtweite ihrer Überschrift. Der Text
des Ressorts wird ungekürzt gezeigt; diese Passagen sind kurz, eine zweite
Faltung wäre eine Tür hinter einer Tür.

**Der Abruf kostet nichts extra:** Es ist derselbe Endpunkt
(`/erlaeuterungen`), den der Abschnitt „Was das Ressort begründet" weiter oben
schon holt — `useFetch` schlüsselt nach URL. Und er darf scheitern, ohne den
Vergleich zu berühren: Die Gegenüberstellung ist die Auskunft, die Begründung
die Beigabe.

**Nur auf der Entwurfsseite.** Die RIS-Seite einer Begutachtung ohne
Gegenstand rendert die Gegenüberstellung nicht, sie verlinkt sie; dort gibt es
also keinen Paragraphen, an den sich etwas hängen ließe. Der Allgemeine Teil
steht dort trotzdem (§12.29).

**Und ein Satz weiter oben wusste nichts davon — nachgezogen 19.09.2026.** Der
Abschnitt des Allgemeinen Teils benennt, was er nicht druckt: „Die
Erläuterungen zu den einzelnen Paragraphen stehen im Dokument selbst." Seit
diesem Join ist das dort, wo es eine Gegenüberstellung gibt, die schlechtere
Hälfte der Wahrheit — der Satz schickt den Leser in ein PDF, während die
Stelle zwei Bildschirme tiefer auf derselben Seite liegt. Er hat jetzt zwei
Fassungen, und **welche gilt, sagt der Server** (`paragraphsAtAnnex`): Ein
Satz, der nach dem Laden der Gegenüberstellung seine Aussage wechselt, wäre
schlechter als einer, der von Anfang an stimmt.

**Die erste Fassung der Bedingung war nachgebaut, und sie hielt einen Tag.**
Sie fragte, was die Join-Zeile ohnehin weiß — Join `matched`, RIS führt ein
Beilagendokument —, weil das nichts kostet. Am selben Tag bekam
`textComparisonService` den Rückfall auf die Kopie des Parlaments, und damit
zeigte die Seite Gegenüberstellungen, von denen die nachgebaute Bedingung
nichts wusste. Gemessen über die GP XXVIII: **3 Entwürfe** werden aus der
Parlamentskopie gelesen, bei ihnen zeigte der Satz ins PDF, während die
Passagen zwei Bildschirme tiefer standen. Die Lehre ist billiger zu haben als
noch einmal: **Eine Bedingung, die eine andere spiegelt, altert genau so.**

Gefragt wird jetzt `hasAnnexDocument` — dieselbe Funktion, die auch der
Vergleich benutzt, um seine beiden Kopien zu finden. Sie beantwortet die
**billige Hälfte** der Frage („gibt es die Beilage, hier oder beim
Parlament?"). Die teure Hälfte — „und lässt sie sich lesen?" — bleibt
ungefragt, und das ist eine Messung, keine Bequemlichkeit: Der
Gegenüberstellungs-Endpunkt braucht kalt im **Median 3,9 s, im Maximum 33 s**
(40 Entwürfe, 19.09.2026), weil bei zwei von fünf ein PDF geparst und jeder §
gegen das RIS geprüft wird. In einem SSR-Pfad mit 800-ms-Frist wäre das der
sichere Fristbruch — der Preis für die genaue Antwort wäre der Text im HTML.

**Der Rest ist gemessen und ausgehalten**, und er wurde zweimal gemessen,
weil der Parlaments-Rückfall dazwischen abgeschaltet wurde (§12.12). Über
alle 110 Entwürfe der GP XXVIII mit Besonderem Teil und zugeordneten
Passagen:

| | Bedingung falsch |
|---|---|
| mit gelesener Parlamentskopie | 4 (3,6 %) — 20, 83, 119, 135/ME |
| ohne sie (heutiger Stand) | **1 (0,9 %)** — 119/ME |

Zu eng ist sie in beiden Zuständen nirgends. Die drei, die wegfallen, sind
die, deren Beilage nur beim Parlament liegt: Auf sie zeigt der Satz nicht
mehr, weil dort auch nichts mehr steht. Übrig bleibt 119/ME — das RIS führt
eine Beilage, auslesen ließ sie sich nicht. Die Asymmetrie ist gewollt — ein
Zeiger auf einen Abschnitt, der selbst sagt, woran es lag, kostet einen
Blick; ein Zeiger ins PDF, während die Stelle auf derselben Seite steht,
kostet den Weg zurück — und der Satz federt sie ab, indem er **nichts
wegnimmt**: „und vollständig im Dokument selbst" steht in beiden Fassungen.

### 12.31 Die Vehikel-Frage: Volltextsuche über die laufenden Begutachtungen

Ein Sammelgesetz heißt „Budgetbegleitgesetz" und ändert vierzig Gesetze. Wer
ein Anliegen verfolgt, erkennt den Entwurf, der es berührt, deshalb nicht am
Titel — die Frage ist nicht „wo finde ich einen Entwurf", sondern „steht in
einem der Entwürfe, die JETZT offen sind, etwas über mein Thema". `/suche`
beantwortet die zweite. Sie ist der billige Vorbau der Vehikel-Frage aus
Steinhammers Ablauf (§12.29) und die einzige Hälfte davon, die ohne
Themen-Taxonomie auskommt.

**Die Suche baut keinen Index — das RIS hat schon einen.** `Suchworte` am
Begut-Endpunkt durchsucht den Volltext ALLER Dokumente eines Satzes. Gemessen
am 18.09.2026: „Wolf" liefert 13 Sätze, bei keinem einzigen steht das Wort in
den Metadaten; „Überwachung" 1.025, „Klimaschutz" 453. Mit
`InBegutachtungAm=heute` ist das genau diese Seite, in einem Aufruf und in
~165 ms. Ein eigener Index wäre eine Kopie fremder Dokumente samt
Aktualisierung — Betrieb, an dem der Vorgänger gestorben ist, für eine
Fähigkeit, die es schon gibt.

**Die Semantik ist gemessen, nicht angenommen** (alle Zahlen 18.09.2026):

| Frage | Befund |
|---|---|
| Leerzeichen zwischen Wörtern | UND (`Klimaschutz Datenschutz` → 217 gegen 453 und 929) |
| `AND` / `OR` | keine Operatoren, sie gelten als weitere Suchwörter |
| Anführungszeichen | keine Phrasensuche — `"Klimaschutz"` ergibt dieselben 453 |
| Wortformen | keine Stammformen: „Biene" 1, „Bienen" 35; „Klimaschut" 0 |
| Trunkierung | `*` wirkt: `Klimaschutz*` 491 gegen 453 |
| Groß-/Kleinschreibung | egal; Umlaute müssen getippt werden („Ueberwachung" 1) |
| Antwortzeit | 0,2–2,1 s, unabhängig von der Seitengröße |

Das Werkzeug spiegelt diese Regeln, statt eigene zu erfinden: Die Fundstelle
sucht ganze Wörter und kennt den Stern, sonst fände sie im Dokument nicht,
was das RIS im selben Dokument gefunden hat.

**Was das RIS NICHT zurückgibt, ist die Fundstelle** — die Antwort ist der
gewöhnliche Metadatensatz. Und ohne sie behauptet eine Trefferliste das
Falsche: Bei „Fahrrad" steht das Wort in 7 von 20 Treffern im Entwurfstext
und in 16 von 20 in den Erläuterungen. „Das Gesetz handelt davon" und „das
Ressort erwähnt es in seiner Begründung" sind zwei verschiedene Auskünfte,
und die Rangfolge der Dokumente (Entwurfstext → Erläuterungen →
Textgegenüberstellung → Begleitschreiben) entscheidet, welche die Zeile gibt.
Gelesen wird mit `lawtext/risXml.parseRisXml`, also demselben Parser wie die
Gegenüberstellung — samt `gld`, weshalb die Zeile „im Entwurfstext, § 6."
sagen kann und nicht nur „im Entwurfstext".

**Zwei Durchgänge über alle Dokumente, nicht zwei Regeln je Dokument.** Der
zweite Durchgang sucht als Teilstring. Liefe er innerhalb eines Dokuments
gleich nach dem strengen, gewänne ein Entwurfstext mit „Klimaschutzgesetz"
gegen die Erläuterungen, in denen „Klimaschutz" wirklich steht — die
Rangfolge der Dokumente schlüge die Genauigkeit der Regel. So gewinnt erst
die Regel, dann die Rangfolge.

**Die Annahme, die die Messung widerlegt hat** (Stand 18.09.2026; was seither
dazukam, steht zwei Absätze weiter). 72,2 % der Treffer (79 aus
fünf Stichworten) lassen sich in Entwurfstext oder Erläuterungen benennen.
Für den Rest lautete der erste Entwurf der Zeile „steht in einer Anlage oder
einem gescannten PDF" — und das war geraten. Beim Industriestrompreisgesetz
steht „Klimaschutz" in KEINEM seiner Dokumente; die Erläuterungen schreiben
„Leitlinien für staatliche Klima-, Umweltschutz- und Energiebeihilfen", das
RIS trifft über die Wortbestandteile. Die Zeile sagt jetzt, was geprüft wurde
(„wörtlich nicht im Entwurfstext und nicht in den Erläuterungen"), und solche
Treffer stehen unten: ein belegter Treffer ist der stärkere.

**Drei Stufen statt einer, seit 21.09.2026 — und die dritte erklärt die
Treffer, die keine sind.** Ein Leser fragte, warum „klima" eine *Änderung der
Druckgeräteaufstellungsverordnung* liefert. Die Antwort stand im
Begleitschreiben, im **Verteiler**: „… 14. Bundesministerium für Land- und
Forstwirtschaft, Klima- und Umweltschutz, Regionen und Wasserwirtschaft 15.
…". Jedes Begleitschreiben listet alle Ministerien als Empfänger, jedes
Dokument trägt die Unterschriftszeile seines Hauses — also trifft jedes
Portfolio-Wort jeden Entwurf. Dieselbe Falle wie bei den Metadaten, eine
Ebene tiefer und diesmal im Index des RIS, an den wir nicht herankommen.

Benennen konnten wir sie zunächst nicht, und zwar aus einem Grund, den dieses
Projekt schon einmal gelernt hat: **Das XML des Begleitschreibens hat 943
Zeichen, das PDF desselben Dokuments 12.223.** Der Verteiler steht nur dort.
Wie bei den Beilagen (§12.9) war der Text nie weg — gelesen wurde das Format,
das ihn weggeworfen hat. `locate` geht deshalb jetzt:

1. **XML, ohne die Ressortnennungen.** Der Normalfall.
2. **PDF, ohne die Ressortnennungen.** Nur wo Stufe 1 nichts fand; gedeckelt
   auf 16 Dokumente je Suche, Bytes und ausgelesener Text in getrennten
   Cache-Schichten (`cache/base.ts`).
3. **Noch einmal, MIT den Ressortnennungen.** Findet erst dieser Durchgang
   etwas, steht das Wort ausschließlich in einem Ministeriumsnamen. Die Zeile
   sagt das dann — „Nur im Ressortnamen, im Begleitschreiben:" samt dem
   Ausschnitt, in dem der Verteiler zu sehen ist — und sortiert ans Ende.

**Gelöscht wird so ein Treffer nicht**, und das ist die eigentliche
Entscheidung: Das RIS hat den Satz geliefert, das Urteil gehört dem Leser.
Bei der UVP-G-Novelle wäre Wegwerfen auch schlicht falsch — sie ersetzt in
dutzenden §§ die Wortfolge „für Klimaschutz, Umwelt, Energie …" durch die
neue, dort IST der Ressortname der Gegenstand. Deshalb fällt in Stufe 1 und 2
auch nur die Nennung MIT Ministeranrede („des Bundesministers für …"), nie
das Portfolio für sich.

**Was das Streichen nebenbei verbessert hat:** die Fundstelle selbst. Das
Klimagesetz führt das Wort 164-mal, als Beleg stand vorher die
Ministerienaufzählung in § 5; jetzt steht dort „… je einem hochrangigen, für
**Klima** zuständigen Verwaltungsorgan eines jeden Bundeslandes".

**Gemessen am 21.09.2026 über zwölf Stichwörter, 65 Treffer:** **93,8 %
benannt** (61) gegen 72,2 % vor dem PDF-Rückfall, und **6,2 %** (4) sind
reine Ressortnennungen. Antwortzeit 0,3–0,9 s warm, 2,2 s kalt mit
PDF-Abrufen. Ein Treffer, den der Verteiler erklärt, ist damit nicht mehr
stumm, sondern beschriftet.

**Der Treffer führt auf unsere Seite, nicht auf die des RIS.** Die Antwort
ist eine Dokumentnummer; welche Seite sie meint, weiß der Korpus samt Join
(§12.16). Gehört der Satz zu einem Ministerialentwurf, ist die Zeile ein
Ministerialentwurf — mit Frist, Stellungnahmen, Stationen und dem Debattennamen
—, sonst der RIS-Satz. Beide in der Anatomie aus §12.28, mit dem Beleg als
Slot darunter.

**Warum nur die laufenden.** Es sind 7 bis 25 gleichzeitig (7 am 18.09.2026,
22 am 15.06., 16 am 15.03.), und das ist die Menge, über die die Frage
gestellt wird. Über den ganzen Korpus zu suchen ist eine andere Frage („kam
das schon einmal vor?"): Die Treffer verteilen sich dann über ein Dutzend
Gesetzgebungsperioden, und der Join oben kennt jeweils nur eine. Die leere
Antwort nennt deshalb die Korpusgröße — „‚Klimaschutz' kommt in den 7
laufenden Begutachtungen nicht vor" ist eine Auskunft, „keine Treffer" ist
keine — und verweist fürs Archiv ans RIS.

**Ein Feld, zwei Antworten — seit 21.09.2026.** Das Suchfeld auf
`/entwuerfe` durchsucht Titel, Zitat, Debattennamen und Ressortkürzel; der
Volltext lag daneben, auf einer eigenen Seite, erreichbar über einen Link im
Kopf der Liste. Das war dieselbe Frage an zwei Orten — das Argument, mit dem am 17.09.
die zwei Entwurfslisten eine wurden (§12.19) —, und der Preis war ein
falsches Negativ, das der Leser nicht bemerken kann: Wer „Klimaschutz"
eintippt, bekommt neun Zeilen über den Ressortnamen BMK und sieht nicht, dass
drei laufende Entwürfe das Wort in ihrem Text führen, zwei davon im
Entwurfstext selbst. Seither antwortet dasselbe Feld unter der Liste ein
zweites Mal, und der Link ist weg.

**Verschmolzen ist der Einstieg, nicht die Suche.** Drei Unterschiede
bleiben, und sie sind der Grund, warum die zweite Antwort ein eigener,
benannter Abschnitt ist und nie eine gepoolte Liste:

| | Liste | Volltext |
|---|---|---|
| Regel | Teilstring über Metadaten | ganze Wörter, UND, `*` |
| Menge | eine ganze Gesetzgebungsperiode, offen wie abgeschlossen | was heute offen ist |
| Preis | nichts, synchron | ein RIS-Aufruf (0,2–2,1 s) plus die Dokumente der Fundstelle |

Daraus folgt der Rest der Mechanik: eigene, längere Verzögerung (700 ms statt
300) und eine Mindestlänge von drei Zeichen, weil jeder Wert ein Aufruf ist;
clientseitig und lazy, damit die Liste nie darauf wartet; ein Ausfall wird
gesagt, nicht verschwiegen (§12.13). **Ein Entwurf, zweimal getroffen, steht
einmal da:** Was die Liste schon führt, bekommt den Beleg an seiner Zeile
(`EntryList`-Slot `evidence`), nur der Rest wird zur eigenen Liste darunter —
der Schlüssel dafür kommt aus demselben Adapter wie die Zeile (§12.28), damit
die Hälften nicht auseinanderlaufen.

**Der Block erscheint nur, wo er etwas sagen kann.** Unter „Abgeschlossen",
in einer alten Periode und unter einer Station nach der Begutachtung gibt es
nichts Laufendes zu durchsuchen; dort steht statt seiner eine Zeile ÜBER der
Liste, die sagt, dass hier nur die Titel durchsucht sind — dieselbe Regel wie
für jede andere Aussage darüber, was die Liste gerade nicht tut. Art und
Ressort dagegen schließen keine Suche aus, sie schneiden die Treffer.

**Und ein Satz, den erst das Fahren der Seite widerlegt hat.** Unter
„Verordnungsentwürfe" meldete der Block „‚Klimaschutz' kommt in den
Dokumenten der 9 laufenden Begutachtungen nicht vor" — das Wort kam in dreien
vor, der Art-Filter hatte sie entfernt. Eine Aussage über den Korpus, wo der
Leser nur seinen eigenen Filter gesehen hatte. Gezählt wird seither getrennt:
„kommt nicht vor" steht nur, wenn das RIS wirklich nichts hatte, und was die
Filter weggenommen haben, sagt eine eigene Zeile samt Weg zurück.

**Und was dieselbe Suche dabei über sich selbst preisgegeben hat: der
Ressortname gehört nicht in ein Freitextfeld.** Die zusammengelegte Suche
machte sichtbar, was vorher als „viele Treffer" durchging — „klima" führte 36
Zeilen, und in genau 2 davon stand das Wort in dem Text, den die Zeile zeigt.
Zwei unsichtbare Felder trafen: der **Ressortname** (BMLUK ist
„Bundesministerium für Land- und Forstwirtschaft, Klima- und Umweltschutz,
Regionen und Wasserwirtschaft") und der **amtliche Langtitel**, der bei jeder
Verordnung mit „Verordnung des Bundesministers für <dasselbe Portfolio>, mit
der …" beginnt. Ein Portfolio-Wort zog damit den gesamten Output eines
Hauses.

**Die Regel, die daraus folgt, ist eine Regel über Sichtbarkeit: gesucht
wird, was die Zeile zeigt.** Der Ressortname steht nirgends auf der Seite —
er fliegt aus dem Heuhaufen; das **Kürzel** steht in der Zeile und bleibt
(„BMJ" findet weiter 25 Zeilen des Hauses, und für das Ressort als Menge gibt
es die eigene Filterachse). Der **Kurztitel** bleibt unangetastet, auch wenn
er dieselbe Klausel trägt („Verordnung der Bundesministerin für
Landesverteidigung über den Krankentransport") — der Leser sieht das Wort,
also muss er danach suchen können. Aus dem **Langtitel**, den niemand sieht,
fällt die Ministerklausel (`server/utils/search/searchHaystack.ts`); der Rest des
Langtitels bleibt, weil bei einer Verordnung der Gegenstand dort und sonst
nirgends steht. Gemessen am 21.09.2026 über dieselben 338 Zeilen der GP
XXVIII:

| Suchwort | vorher | jetzt |
|---|---:|---:|
| klima | 36 | 2 |
| umwelt | 36 | 3 |
| gesundheit | 59 | 16 |
| wasser | 32 | 10 |
| justiz | 27 | 3 |
| sport | 12 | 2 |

**Gestrichen wird eng, und zweimal nachgeschärft.** Nur die Klausel „des
Bundesministers für <Portfolio>" fällt, nie das Portfolio für sich: „Finanzen",
„Justiz" und „Inneres" sind auch gewöhnliche Sachwörter, eine Verordnung ÜBER
die Finanzen von etwas muss auffindbar bleiben — „wasser" behält deshalb 10
von 32 Zeilen. Und der Abgleich läuft **wortweise statt auf den exakten
Namen**, weil zwei echte Titel die starre Fassung verfehlt hatten: einer
schreibt „Klima und Umweltschutz" ohne Bindestrich, einer nennt nur die halbe
Ressortbezeichnung. Das Muster bleibt an den echten Wörtern des Ressorts
verankert, rät also keine Grammatik. Die Streichliste ist das
Ressortvokabular der ganzen Periode, nicht das Ressort der Zeile — damit
fällt auch das zweite Haus („im Einvernehmen mit dem Bundesminister für
Finanzen").

**`/suche` ist am 22.09.2026 verschwunden.** Einen Tag lang stand sie noch
unverlinkt da, mit dem Argument, sie rendere serverseitig und funktioniere
ohne JavaScript. Das stimmt und wiegt trotzdem nicht auf, was sie ist: eine
zweite Adresse für dieselbe Frage — genau das, was das Zusammenlegen
abgeschafft hat. Eine Seite, die niemand verlinkt, aber jeder Index kennt,
ist die schlechteste Variante von beidem. Der Pfad **301t auf `/entwuerfe`**,
die Query reist mit (`?q=` landet auf `/entwuerfe?q=`), und aus der
`sitemap.xml` ist er raus: Ein Link ist das einzige, was dieses Projekt nicht
neu ausstellen kann — eine Weiterleitung anzupreisen ist trotzdem falsch.

**Alle Dokumente eines Satzes, nicht vier — und die Zahl dazu ist der
Grund.** Die Suche kannte vier Felder: Entwurfstext, Erläuterungen,
Textgegenüberstellung, Begleitschreiben. Gemessen am 22.09.2026 über die
8 laufenden Sätze führen deren Datensätze aber **41 Textdokumente**, und die
vier Felder greifen **25**. Nicht gelesen wurde damit jede WFA (8×), jeder
Digicheck (3×), jedes Vorblatt (2×), ein Anhang — geprüft an allen drei
unbenannten „datenschutz"-Treffern, die genau dort standen und seither ihre
Fundstelle zeigen („in „Digi-Ready-Check": … Anforderungen an den
**Datenschutz** und/oder die Datensicherheit?").

Zwei der 16 übersehenen Dokumente sind dabei keine fremde Dokumentart,
sondern **unsere eigenen Namensregeln**: `SAG_TGÜ` ist die
Gegenüberstellung einer Sammelnovelle mit Gesetzespräfix, `Entwurf EB
Klimagesetz` sind die Erläuterungen, vom Ressort als „EB" abgekürzt. Die
Suche liest beide jetzt — als „weiteres Dokument", mit dem Namen des
Ressorts als Etikett. Die Regeln selbst bleiben unangetastet: An ihnen hängen
die Anlagen-Maschine mit ihrer gepinnten Baseline und der
Erläuterungen-Abschnitt der Entwurfsseite, und **dass das Klimagesetz dort
keine Erläuterungen zeigt, ist ein eigener Befund mit eigener Messung**
(§12.11), nicht ein Nebeneffekt der Suche.

**Die erste der beiden Regeln ist seit 26.09.2026 geweitet** (§12.13): Die
Engine liest die präfixierte Gegenüberstellung selbst, `SAG_TGÜ` hat damit
ein eigenes Feld und steht nicht mehr unter „weiteres Dokument". Die zweite
steht noch — „EB" bleibt der Suche überlassen, weil eine Abkürzung, die im
Korpus einmal vorkommt, keine Regel trägt.

**Die Begründung war falsch — gezählt am 26.09.2026**
(`pnpm corpus:dokument-namen`). „EB" steht nicht einmal im Korpus, sondern an
19 Dokumenten, meist zwischen Unterstrichen („SVÄG_2024_EB_19.04.2024",
„EBs_TAMG_final"), wo `\b` nicht greift, weil der Unterstrich als
Wortzeichen gilt. Und „EB" ist nicht einmal die größte Lücke der Regel
`/erl(ä|ae|a)uterung/`. Von 139 Gesetzessätzen der GP XXVIII findet sie 133;
die sechs übrigen heißen einmal „EB", viermal „Erl"/„Erl." („42. KFG-Nov.
Erl. 11.05.2026", „Pol-W-G Erl") und einmal wörtlich „Erläuterungen" — in
zerlegter Schreibweise, ä als a + U+0308, die die Regel nicht sieht. In GP
XXVII findet sie 299 von 342; von den 43 übrigen sind 35 über den Namen zu
holen (2 zerlegt, 15 „EB", 18 „Erl"/„Erläut"/„Erläuternde Bemerkungen").
Vor XXVI ist „Materialien"/„begmat" die Normalform: ein Dokument mit
Vorblatt, Erläuterungen und Gegenüberstellung zugleich — das ist kein
Namensproblem, sondern ein anderes Dokument. Die Folge heute: Diese Entwürfe
zeigen keinen Allgemeinen Teil, weil `getExplanations` nur den RIS-Satz liest.
Die Regel ist damit ein Bauposten, kein Suchetikett mehr; an ihr hängt über
`scripts/harness/me.ts` auch die Anlagen-Grundlinie. **Gebaut 27.09.2026**
(`explanationsNameRank`, dieselben zwei Ränge wie für die Beilage, §12.13):
NFC, „EB" nur in Großbuchstaben, „Erl"/„Erläut"/„Erläuternde" als Token,
„Erledigung" und „Erlass" bleiben draußen. GP XXVIII: 139 von 139
Gesetzesentwürfen haben ihre Erläuterungen, XXVII 334 von 342; `harness/me.ts`
liest sie über dieselbe Funktion statt über eine eigene Kopie.

**Das Budget war danach die Grenze, nicht die Zeit.** Mit 16 PDFs je Suche
fiel die Benennungsquote auf 91,4 % — das Budget ging mitten in der
Trefferliste aus. Ohne Deckel sind es **100 % (58 von 58 über zwölf
Stichwörter)** bei unveränderten Antwortzeiten; 3,5 s nur für die allererste
Suche nach einem Kaltstart, danach 0,2–2,1 s. Der Deckel steht deshalb auf
48 und ist eine Reißleine gegen den pathologischen Satz, kein Zeitbudget.

**Ein Feld, eine Regel für Leerzeichen** (22.09.2026). Die Liste suchte den
ganzen Eingabestring als EINEN Teilstring: „klima gesetz" fand nichts,
während der Volltextblock darunter dieselben Wörter mit UND verknüpfte und
zwei Entwürfe zeigte. Auf zwei Seiten war das unauffällig, unter einem Feld
sind es zwei Regeln für dieselbe Taste. Beide Hälften verknüpfen jetzt mit
UND (`shared/utils/textMatch.ts`). Was INNERHALB eines Wortes gilt, bleibt
verschieden und muss es: Die Liste sucht Teilstrings („klimages" findet das
Klimagesetz), das RIS ganze Wörter mit Stern — der Unterschied zwischen
einem Titel aus acht Wörtern und einem Dokument aus achtzig Seiten.

**Blinde Stelle, gemessen:** In GP XXVIII führt Liste 81 135 Ministerialentwürfe,
134 RIS-Sätze tragen einen Gegenstand. Wer im RIS nicht steht, ist für diese
Suche unsichtbar — das ist ein Entwurf, kein struktureller Ausfall.

**Nicht gecacht, mit Absicht.** Der Cache-Schlüssel wäre die Eingabe des
Lesers, also unbegrenzt viele Schlüssel in einem Speicher, den die Produktion
im RAM hält (§5). Gecacht wird nur das Teure darunter: die Dokumente, im
dauerhaften Layer. Und ein Ausfall des RIS ist ein 502 mit einem Satz, keine
leere Trefferliste — „zu ‚Klimaschutz' gibt es nichts" wäre hier die
teuerste Lüge des Produkts (§12.13).

### 12.32 Verordnung → BGBl II: die Rechenschaftskette der anderen zwei Drittel

Zwei Drittel des Korpus sind Verordnungsentwürfe, und für sie endete der
Monitor bis 19.09.2026 mit der Frist. Auf der Seite stand das auch so: „Was
danach kommt – Erlassung durch das Ministerium und Kundmachung im
Bundesgesetzblatt Teil II – verfolgt der Monitor bisher nicht." Der Weg gibt
es nämlich, er läuft nur nicht durchs Parlament: Begutachtung → Erlassung
durch das Ressort → **Kundmachung im BGBl II**.

**Die Quelle trägt dieselbe Vokabel wie Begut.** `Applikation=BgblAuth` führt
Teil II mit `Bgblnummer` („BGBl. II Nr. 50/2026"), `Ausgabedatum`, `Typ` und
— entscheidend — einem `Einbringer` in derselben Schreibweise wie
`EinbringendeStelle` bei Begut („BMASGPK (Bundesministerium für …)"). Der
Ressortvergleich ist damit derselbe wie im RIS↔ME-Join, samt seiner
Abstammungsgruppen für den Regierungswechsel.

**Was die API NICHT kann** (geprüft 18.09.2026): `Teil`, `Jahrgang`, `Typ`,
`Einbringer` und `Kundmachungsnummer` werden ignoriert — jeder dieser Filter
liefert alle 18.925 Sätze. Es wirken `Bgblnummer` (exakt, ein Treffer) und
`VonKundmachungsdatum`/`BisKundmachungsdatum`. Der Korpus wird deshalb nach
**Jahrgang** geschnitten: ein stabiler Cache-Schlüssel, während ein gleitendes
Fenster jeden Tag einen neuen erzeugte. Teil II umfasst 421 (2024), 344
(2025) und 281 (2026 bis September) Kundmachungen.

**Der Join ist gemessen, in zwei Anläufen.** `pnpm corpus:bgbl2` über 291
Verordnungsentwürfe mit Fristende ab 2024:

| | erster Anlauf | nach der Korrektur |
|---|---:|---:|
| Treffer gesamt | 79,4 % | **84,2 %** |
| Frist über ein Jahr her | 83,8 % | **92,3 %** |
| an der Marge verworfen | 21 | 7 |

**Was der erste Anlauf falsch machte, stand in seinem eigenen Kommentar.**
Die Sortierung der Kandidaten sagte „bei Gleichstand das frühere Datum: Wird
derselbe Text zweimal geändert, ist die erste Kundmachung nach der Frist die
aus dieser Begutachtung" — und das Urteil darüber verwarf genau diese Fälle
als mehrdeutig. Viele Verordnungen werden jährlich geändert, die Kundmachungen
heißen Jahr für Jahr gleich („Änderung der Studienbeitragsverordnung" gibt es
2024, 2025 und 2026), und die Marge sah zwei gleich gute Titel und sagte
nichts. Aufgefallen ist es erst an der Liste der ältesten Nicht-Treffer: Dort
standen Kandidaten mit Punktzahl **1,000**. Seither entscheidet bei
Titelgleichstand die Zeit — die erste Kundmachung nach dem Fristende —, außer
die beiden liegen weniger als 60 Tage auseinander; dann sagt auch die
Reihenfolge nichts.

**Die Schwelle ist an ihren Beinahe-Treffern geprüft, nicht an ihren
Treffern.** Im Band 0,45–0,72 stehen fast ausschließlich echte Nicht-Paare:
„Schülerbeihilfen-Valorisierungsverordnung 2026" gegen
„Studienbeihilfen-Valorisierungsverordnung 2026", „12. Novelle der FSG-GV"
gegen „23. Novelle zur FSG-DV", und ein „Frauenförderungsplan BMWET", der
gegen vier verschiedene Entwürfe desselben Ressorts 0,600 erreicht. Tiefer zu
gehen hieße, falsche Kundmachungen zu behaupten — der teuerste Fehler dieses
Abschnitts. 83,3 % der akzeptierten Treffer sind wörtliche Titelgleichheit.

**Die Zeitkurve ist der eigentliche Fund, denn sie verbietet einen Satz.**
Nach Alter des Fristendes finden eine Kundmachung: **0 %** (bis 30 Tage),
31,6 % (31–90), 71,4 % (91–180), 92,2 % (181–365), 92,3 % (über ein Jahr).
Zwischen Fristende und Kundmachung liegen im Median 57 Tage, p90 196, max 538;
zwei Verordnungen wurden vor dem Fristende kundgemacht. „Bisher nicht
kundgemacht" in Woche sechs wäre damit keine Aussage über das Ressort,
sondern über die Uhr — und würde doch als die erste gelesen. Deshalb hat
`BgblOutcome` fünf Zustände und nicht zwei, und `ausstehend` trennt bis 180
Tage das Junge vom Liegengebliebenen.

**Und auch danach spricht die Zeile über uns, nicht über das Ressort.** Bei
92 % Deckung ist etwa jede zwölfte alte Verordnung ohne Fund entweder nie
erlassen worden — das ist die Auskunft, um die es geht — oder von uns
übersehen. Von hier sehen beide gleich aus, also sagt die Zeile, wonach
gesucht wurde, und stellt den Weg zum Nachsehen daneben (Framing-Regel: nie
ein Vorwurf, immer ein Verfahrensstand).

**Aufgewärmt wird es, weil ein kalter Lauf nicht nur langsam wäre.** Drei
Jahrgänge sind kalt rund 21 Anfragen ans RIS. Wer sie nicht hat, findet keine
Kundmachung — und schriebe „nicht kundgemacht" unter eine Verordnung, die
längst gilt. Der vierte `ExecStart` des Prewarm-Timers holt sie nächtlich und
nach jedem Deploy (`deploy/systemd/`), wie die RIS↔ME-Karte.

**Wo die Auskunft am 19.09.2026 überall angekommen ist** — der Ausgang war
zuerst nur ein Absatz auf der Entwurfsseite, und drei Stellen daneben
behaupteten weiter das Gegenteil:

- **Die Überschrift der Karte** sagte „Begutachtung beendet" über einem Text,
  der „Kundgemacht als BGBl. II Nr. 410/2024" las. Die Karte des
  Ministerialentwurfs nennt oben den Ausgang („Gesetz geworden"), diese nannte
  den Stand der Begutachtung — dieselbe Karte, zwei Logiken. Jetzt
  `regulationStatusDe`, und der Ausgang kommt **serverseitig** mit der
  Detailantwort: Eine Überschrift, die nach dem Laden ihre Aussage wechselt,
  wäre schlechter als eine, die wartet. Mit Budget (2,5 s) und Rückfall auf
  den client-seitigen Abruf, damit ein kalter Cache die Auskunft verzögert
  und nicht verschluckt.
- **Die Liste** schrieb auf jede abgeschlossene Zeile „Begutachtung
  abgeschlossen" — auf 159 von 198 Zeilen der laufenden Periode falsch. Zone 4
  zeigt jetzt „Kundgemacht / BGBl. II Nr. 225/2026", dieselbe Anatomie wie die
  Ministerialentwürfe daneben (§12.28). Berechnet wird das in EINEM Durchgang
  je Periode (`getBgblOutcomesForGp`), nicht je Zeile.
- **Der Stationsfilter** ließ `?station=bgbl` für diese Hälfte leer, mit der
  Begründung, sie könne die späteren Stationen nicht erreichen. Für `rv` und
  `parlament` stimmt das; für das Bundesgesetzblatt stimmte es nie, es hat nur
  niemand nachgesehen. Der Filter zeigt dort jetzt 159 Zeilen, und der
  Hinweis „Verordnungsentwürfe haben keine Station" erscheint nur noch, wo er
  wahr ist.

**Nur der BELEGTE Ausgang wandert nach oben.** Weder die Überschrift noch die
Spalte sagen je „bisher nicht kundgemacht". Der Ministerialentwurf darf
„Bisher keine Regierungsvorlage" behaupten, weil die Liste des Parlaments
vollständig ist; hier hängt der Negativbefund an einem gebauten Schlüssel mit
84,2 % Trefferquote, also wäre jede zwölfte solche Zeile falsch — und zwar in
der Richtung, die wie ein Vorwurf klingt. Der Negativbefund steht weiterhin
auf der Detailseite, in einem ganzen Satz, samt Weg zum Nachsehen.

**Dasselbe Prinzip beim Budget:** Als Spaltenwert darf der Ausgang fehlen (die
Zeile ist dann unvollständig, nicht falsch), als FILTER nicht — dort wird
gewartet, weil eine leere Liste „keine kundgemachten Verordnungen" behaupten
würde, was niemand geprüft hat (§12.13).

**Und die Grundrate steht jetzt auf der Seite, die das Verfahren erklärt.**
Die Station „Bundesgesetzblatt II" auf `/so-funktionierts` sagte unter „Im
Monitor" noch „Bisher nichts"; sie nennt jetzt die Kundmachung und die
Messung dazu — 84,2 % gefunden, 92,3 % bei Fristen von vor über einem Jahr,
Median 57 Tage. Das ist die Verordnungs-Version von Mechanismus 2, und sie
steht dort, wo die Methode ohnehin erklärt wird, nicht über jedem Ergebnis.

### 12.33 Die BGBl-Station — gebaut, und die fünf falschen Unterschiede, die sie aufgedeckt hat

Die Stationsleiste des §-Vergleichs endet bei der Plenarfassung (§12.18). Die
letzte Fassung ist aber die kundgemachte. `pnpm corpus:bgbl-station` misst, ob
sich diese Station bauen lässt — und die Messung hat mehr gefunden, als sie
sollte.

**Eine Korrektur vorweg.** Notiert war „derselbe Join, dieselbe Voraussetzung"
wie bei den Verordnungen (§12.32). Das stimmt nicht: Für einen
Ministerialentwurf liefert das Parlament die Fundstelle **strukturiert** —
`content.status.bgbllinks[]` mit `Dokumentnummer=BGBLA_2026_I_69`, in der
Detailantwort als `enactment.bgblRisUrl`. Ein Nachschlagen, keine
Ähnlichkeitssuche.

**Eine zweite Korrektur.** Notiert war auch, die Sammelgesetze seien eine
offene Produktfrage. Sie sind entschieden, seit `diffLawPackage` existiert:
Der Vergleich wird auf die Gesetze beschränkt, die BEIDE Seiten führen, der
Rest wird als gewachsenes oder geschrumpftes Paket benannt. Über die
gemessenen Paare trat der Fall gar nicht auf (`lawsOnlyInTo` = 0 durchgehend),
weil auf beiden Seiten derselbe Akt steht.

**Die Voraussetzungen sind erfüllt:** 22/22 Kundmachungen liegen als XML vor,
22/22 gliedert `parseLawUnitsFromRis` in Einheiten, und die Ausrichtung ist
exakt — `inserted` = 0 und `removed` = 0 über alle Paare.

**Was die Messung wirklich gefunden hat, war ein Defekt im Vergleich selbst.**
Zwischen der letzten parlamentarischen Fassung und der Kundmachung darf sich
nichts Inhaltliches ändern; gemeldet wurden aber bis zu 136 von 626 Einheiten
als geändert, keine davon als redaktionell. Fünf Klassen, alle behoben:

| Klasse | Beispiel | Ursache |
|---|---|---|
| Fundstellen-Platzhalter | `BGBl. I Nr. xxx/2025` → `50/2025` | `isPlaceholder` kannte den Schrägstrich nicht, also galt der Token als `word` — und ein `word` beendet `isEditorialChange` sofort |
| dasselbe mit Satzzeichen | `xxx/2025."` | `bare` räumt Anführungszeichen weg, den Punkt davor nicht |
| Weicher Trennstrich | `OTC­Derivaten` ↔ `OTC-Derivaten` | Parlaments-HTML setzt U+00AD, `normalizeText` löscht ihn, das RIS hat einen harten Strich |
| Füllpunkte | `monatlich...........` ↔ `monatlich` | Betragstabellen des Parlaments, im RIS ohne Punktreihe |
| Entität | `&deg;C` ↔ `°C` | `deg` fehlte in `NAMED_ENTITIES` |

**Wirkung, gemessen über 14 Entwürfe und rund 2.700 verglichene Einheiten:**

| | vorher | nachher |
|---|---:|---:|
| 9/ME (RV → Kundmachung), inhaltlich geändert | 11 | **0** |
| 10/ME | 7 | **0** |
| 12/ME (Budgetbegleitgesetz, 626 Einheiten) | 136 | **0** |
| 3/ME, 7/ME, 8/ME, 11/ME, 13/ME | 4/3/8/1/2 | **0** |
| Rest (Bindung an ein Satzzeichen, eine Akte) | | 23 (0,9 %) |

**Zehn von vierzehn Entwürfen zeigen damit null inhaltliche Änderung bei der
Kundmachung** — was die Wahrheit ist und vorher nicht zu sehen war.

**Zwei davon liegen in der Vergleichsform, nicht in der Anzeige.**
`compareKey` ignoriert jetzt Bindestriche und Füllpunkte; `normalizeText`
bleibt unverändert, der Leser sieht also weiter genau das, was im Dokument
steht. Der Preis ist benannt: Zwei Texte, die sich NUR in der Bindung
unterscheiden, gelten als gleich. In legistischem Deutsch ist das Typografie.

**Das zahlt auf die bestehenden Vergleiche ein**, nicht nur auf die geplante
Station: Der Pfad „Entwurf als RIS-XML gegen Parlaments-HTML" ist seit je der
Rückfall für die rund ein Fünftel der Entwürfe, die das Parlament nur als PDF
führt (§12.18) — dort haben dieselben fünf Klassen bisher still mitgezählt.

**Gebaut am 19.09.2026.** `LawStationId` trägt `bgbl`, die Beschriftung und
die Reihenfolge stehen in `shared/utils/lawStations.ts`, und der RIS-XML-Pfad
in `lawDiffService.ts` ist verallgemeinert: Er hing an der `me`-Seite, weil
nur der Entwurf als XML kommen konnte — jetzt trägt jede Station ihr Format
selbst (`ResolvedLawStation.xml`), und beide Seiten werden mit dem Parser
gelesen, der zu ihrer Quelle gehört. Der Weg zur Kundmachung ist ein
Nachschlagen: Regierungsvorlage → `status.bgbllinks` → `Bgblnummer` →
`getBgblDocument`. Scheitert etwas davon, fehlt die Station, und die anderen
vier funktionieren weiter.

**`plenum→bgbl` wird nicht angeboten**, und das ist die einzige Ausnahme von
der Reihenfolgeregel. Zwischen Beschluss und Kundmachung handelt kein Akteur;
das Paar wäre systematisch leer und verspräche eine Antwort, die es nicht
geben kann. Die Regel steht in `isLawStationPair`, also an EINER Stelle — der
Server lehnt ab, womit die Seite gar nicht erst wirbt, und die Ablehnung
nennt ihren eigenen Grund („Zwischen Plenarfassung und Kundmachung ändert
sich der Text nicht mehr") statt der falschen Reihenfolge-Begründung.

**Live geprüft an 9/ME** (Alternative Investmentfonds Manager-Gesetz): `rv→bgbl`
zeigt 58 Einheiten, 51 unverändert, 7 geändert — **alle sieben redaktionell**.
Die Seite sagt damit zum ersten Mal „die Regierungsvorlage wurde unverändert
Gesetz", und das ist genau die Auskunft, die den rund 29 % der Entwürfe ohne
veröffentlichte Fassung nach der Vorlage bisher fehlte. `me→bgbl` zeigt
dagegen die ganze Geschichte: 61 Einheiten, 25 geändert, 12 neu, 3 entfallen.

**Eine Lehre über Beschriftungen.** Die erste Fassung hieß „Kundgemachte
Fassung" und stand als „wird mit dem der Kundgemachte Fassung verglichen" auf
der Seite: Die Sätze setzen die Beschriftung in den Genitiv, die vier alten
Namen sind feminin auf -ung und ändern sich dabei nicht, ein Adjektiv schon.
Dass der Ministerialentwurf im selben Satz bereits eine Sonderbehandlung
brauchte, war die Warnung. Der Name ist jetzt „Fassung im Bundesgesetzblatt"
und überlebt jede Beugung.

#### Drei weitere Klassen, gemessen am 23.09.2026 — und was das Abzeichen kostet

Dieselbe Messstrecke, eine Ebene tiefer: 88 Paare Ministerialentwurf →
Regierungsvorlage der GP XXVIII, dazu die 33 Entwürfe, bei denen die
Rechenschaftskette „unverändert beschlossen" sagt.

**1. „Redaktionell" deckte geänderte Verweise, die keine Umnummerierung
waren.** `isEditorialChange` hielt jede zitatnahe Zahländerung für
redaktionell. Von 164 redaktionellen Einheiten hingen 70 an nichts anderem
als daran; 38 davon sind nachweislich Folgen einer Umnummerierung — **vier
aber sind Änderungen der Norm**, die unter „kein einziges Wort geändert"
standen: § 48 → § 48a BAO (27/ME Z 4), § 49c Abs. 4 Z 1 → § 49b Abs. 1a Z 10
(30/ME Z 12), ein geschrumpfter UGB-Bereich (4/ME Z 3) und eine
Verfassungsbestimmung, die „§ 169 Abs. 7" dazubekam (32/ME § 1). Die Regel
lautet jetzt: Ein Verweis ist nur dort redaktionell, wo **dieser Vergleich
selbst** den Paragraphen umnummeriert hat — die Ausrichtung also eine Einheit
mit der alten und der neuen Nummer gepaart hat (`renumberedParagraphs` in
`diff/lawDiff.ts`, nur §§, nie Novellierungsanordnungen). Daraus folgen die
drei Schnitte, die jeden der vier Fälle schließen: ein Verweis in ein
**anderes Gesetz** kann nie in der Karte stehen, eine **Abs.-/Z-Adresse** ist
keine Einheit dieses Vergleichs, und ein Verweis, den eine Seite **gar nicht
führt**, hat kein Gegenstück. Der Restfehler ist benannt statt versteckt: Die
Karte kennt nur die nackte Zahl, also liest sich „Abs. 6" → „Abs. 4" in einem
Entwurf, der auch § 6 zu § 4 gemacht hat, als erklärt.

**2. Formgleiche Anordnungen mit verschiedener Adresse wurden gepaart.**
„§ 63 entfällt samt Überschrift." (74/ME, ME Z 127) und „§ 4a entfällt samt
Überschrift." (RV Z 50) teilen jedes Wort; Schritt 3 der Ausrichtung paarte
sie bei Ähnlichkeit 0,86, und die Regel oben machte daraus einen geänderten
Verweis. Zwei Anordnungen, deren **einziger** Unterschied die adressierte
Bestimmung ist, sind nicht dieselbe Anordnung: Schritt 2 und 3 lehnen ein
solches Paar jetzt ab (`isAddressOnlyDifference`), und es wird zu einer
entfallenen plus einer neuen Einheit — was die Dokumente sagen. Nebenbei
korrigiert: Die Notiz sprach von „Einheiten ohne Überschrift". Eine
Novellierungsanordnung hat **immer** eine, ihre Anordnungszeile ist die
Überschrift; ohne Überschrift ist der Paragraph eines Stammgesetzes (74/ME: 0
von 521 bzw. 483 Einheiten mit `heading === null`). Die Ablehnung hängt daher
an der Anordnung, nicht an der fehlenden Überschrift.

**3. Der Worttokenizer faltete weniger weg als die Gleichheitsform.**
`compareKey` entscheidet, ob eine Einheit unverändert ist, `tokens()`, welche
Wörter darin markiert werden — und die beiden benutzten verschiedene Regeln.
War eine Einheit aus irgendeinem anderen Grund „geändert", zählte danach jedes
Leerzeichen vor einem Satzzeichen und jeder Bindestrich, den nur eine Seite
setzt, als geändertes **Wort**. `tokens()` liest jetzt `compareTokens`, das
dieselben Artefakte faltet wie `compareKey`, nur ohne das trennende
Leerzeichen zu verlieren.

| | vorher | nachher |
|---|---:|---:|
| Einheiten gesamt (88 Paare ME→RV) | 5.357 | 5.374 |
| unverändert | 2.276 | 2.276 |
| geändert | 1.841 | 1.824 |
| davon **redaktionell** | 164 | **94** |
| neu / entfallen | 888 / 352 | 905 / 369 |
| redaktionell, einzige Änderung eine zitatnahe Zahl | 70 | **32** |

Die 70 Einheiten der letzten Zeile teilen sich auf in 31, die redaktionell
bleiben, 23, die auf substanziell kippen, und 16, deren Paar sich auflöst.
Über **alle** Einheiten kippen 54, verlieren 18 ihr Paar, bleiben 92
redaktionell und werden 2 es neu. Die 54 sind mehr, als die Vorabanalyse
erwartet hatte, und der Grund ist benannt: Sie hatte nur Änderungen gezählt,
die **ausschließlich** aus zitatnahen Zahlen bestehen. Die Regel greift aber
auch dort, wo das geänderte Stück das Zitatwort selbst trägt („§ 49c Abs. 4
Z 1" → „§ 49b Abs. 1a Z 10") oder wo neben dem Verweis ein Artikel steht („In
§ 11g wird nach Abs. 3 …" → „Dem § 11g wird …", also ein **weggefallener**
Verweis) — und ohne diese beiden Formen bliebe der erste der vier Fälle oben
unentdeckt. Die aufgelösten Paare verteilen sich auf zwölf Entwürfe (20, 30,
32, 34, 40, 49, 52, 58, 66, 67, 69, 74/ME); netto sind es 17, weil in 74/ME
die freigewordene rechte Seite im selben Artikel ein anderes Gegenstück
findet.

**Nummer 3 hatte zwei Tage lang einen Fehler, und es war derselbe wie in
§12.12a — eine Urteilsform, die auf die Seite geriet (gefunden und behoben
25.09.2026).** `tokens()` las `compareTokens`, und der Wortdiff baute daraus
**auch seine Segmente**: die Angleichung und die Anzeige aus einem Array. Der
gefaltete Bindestrich stand damit im ausgelieferten Gesetzestext. 126/ME § 9
zeigte „des BundesKinder- und Jugendhilfegesetzes 2013" statt
„Bundes-Kinder-…" — der Name des Gesetzes falsch geschrieben in einem
Gesetzestext —, und über die ganze Lesefassung dieses Entwurfs überlebte
**kein einziger** innerer Bindestrich. Der Kommentar an `compareTokens`
behauptete das Gegenteil und widersprach sich dabei selbst („niemals die
ANZEIGEFORM: die Segmente, die der Leser sieht, werden aus diesen Token
gebaut").

**Die Trennung folgt der Frage, welche Faltung eine Wortgrenze bewegt.**
Füllpunkte und das Leerzeichen vor `.,;:` tun das — eine Punktreihe ist ein
Token, das es nur auf einer Seite gibt, „13 ," sind zwei Token gegen eines —,
also müssen sie fallen, bevor irgendetwas gezählt wird, und sie sind ohnehin
Satz und nicht Wort. Der Bindestrich bewegt keine Grenze; er steht **in** einem
Wort, und ihn zu falten schreibt das Wort um. Seit 25.09.2026 liefert
`displayTokens` deshalb die Anzeigeform und `compareToken` den Vergleichs-
schlüssel **je Token**: `INNER_HYPHEN_RE` braucht links und rechts ein
Zeichen, kann also kein Token teilen, zwei verbinden oder eines leeren — die
beiden Arrays laufen Index für Index. Angeglichen wird auf `compare`,
ausgegeben wird `display`.

Gemessen, beides: Über 147.131 Texte mit 16,7 Mio. Zeichen (300 Entwurfs-XML
plus die Erläuterungen der GP XXVIII), davon 9.747 mit innerem Bindestrich,
ist das Angleichungs-Array **bitgleich** mit dem alten — Ähnlichkeit, LCS-Pfad
und Segmentgrenzen können sich also nicht bewegt haben, nur der ausgegebene
Text. Über 998 Zeilenpaare aus 13 Textgegenüberstellungen ändert sich in 182
(18 %) die **Anzeige**, und `isEditorialChange` wie
`isAddressOnlyDifference` kippen in **null** Fällen. Die Tabelle oben gilt
unverändert.

Die Anzeige war nicht der einzige Schaden: Der gefaltete Bindestrich zählte im
Plausibilitätswächter als unerklärtes Wort, weil die Operanden ihn tragen und
das Segment nicht. Deshalb hielt das Tor Paragraphen zurück. An sechs
gemessenen Entwürfen 38 → **43** gezeigte §§ — 132/ME 0 → 3, 100/ME 5 → 6,
126/ME 31 → 32 (womit die 32 von 61 dieser Sektion wieder stimmen; § 212b
RStDG war der verlorene). Gefunden wurde das nicht am Text, sondern an der
einen fehlenden Zahl: Zwei Worktrees auf denselben RIS-Daten, einer auf
6475f6d, einer auf HEAD — dieselbe Beilage, ein § Unterschied.

**Dieselbe Frage noch einmal, eine Zeile weiter — die Füllpunkte, und dort
war die Regel in BEIDE Richtungen falsch (25.09.2026).** `LEADER_DOTS_RE` war
`/\.{3,}/`, kannte also nur die ASCII-Schreibweise. Gemessen an 1.566
Punktreihen (300 Entwurfs-XML, die Erläuterungen der GP XXVIII, 13
Textgegenüberstellungen), „…" für die drei Punkte gezählt, die es druckt:

| Gewicht | Vorkommen | was es ist |
|---|---:|---|
| genau 3 | **1.375** | die Auslassung der Beilage |
| 4–9 | 15 | Formularvorlagen und Tarifzeilen |
| 10+ | **176** | Spaltenfüller zur Zahl |

Die beiden Gebräuche überschneiden sich nicht, ein Schwellenwert trennt sie
also — und die fünfzehn dazwischen sind Füller, keine Auslassungen. Die alte
Regel trennte statt nach Gewicht nach **Schreibweise**, und das hieß: Von den
1.375 Auslassungen **löschte sie 660 aus der Anzeige und behielt 715** —
dieselbe Notation las sich auf der Seite zweierlei —, und von den 176 Füllern
**sah sie 133 nicht**, weil sie mit „…" gesetzt sind. Der Schutz, für den sie
gebaut wurde (15/ME, zwölf von 398 Einheiten „geändert" wegen einer
Punktreihe), griff für die häufigere Schreibweise gar nicht.

Seit 25.09.2026 entscheidet das Gewicht: `foldLeaders` nimmt ab 10 heraus und
lässt die Auslassung stehen, `foldDotRuns` nimmt für die Gleichheitsform beide
heraus, und `compareToken` vergleicht eine reine Punktreihe als „…", damit
„..." und „…" dieselbe Auskunft sind. Ein Stück der Reihe sind zwei Punkte
oder ein „…", nie ein einzelner Punkt: Sonst schluckt der Ausdruck den
Schlusspunkt der Ordnungszahl davor („3. bis 6. ...") — in der ersten Messung
289 von 1.566 Reihen, und genau daran wäre die Trennung gescheitert.

Gemessen über 2.236 Paare (13 Beilagen, 11 Gesetzesvergleiche): Die **Anzeige**
ändert sich in 198, `isEditorialChange` und `isAddressOnlyDifference` kippen in
**null** Fällen, und die Einheiten-Gleichheit (`compareKey`) bewegt sich dort in
**null** Fällen. Der Anzeigenteil ist gezählt: **1.243 Auslassungszeichen
erreichen den Leser, die vorher zur Hälfte verschwanden** (116/ME allein 355 in
den ausgelieferten Segmenten — „§ 41. (1) bis (3) ... (4) Zur
Beitragsgrundlage …", vorher „(1) bis (3) (4)").

**Die Null bei `compareKey` hielt nur bis zum Drift-Lauf, und das ist die
Pointe.** Über die 126 Entwürfe mit Beilage des Tabellenpfads meldete Klasse B
genau einen Entwurf (118/ME, `changeRowsNoPara` 2 → 1), und die Zeile dazu ist
der Beleg, den die 2.236 Paare nicht liefern konnten:

    links:  „§ 1 Abs. 1 bis 8 …"
    rechts: „§ 1 Abs. 1 bis 8"

Die Beilage lässt links aus und rechts nicht. Das alte `compareKey` sah „…"
nicht, die Spalten waren damit ungleich, und die Zeile zählte als **Änderung
des Gesetzes** — ein Fehlalarm derselben Klasse, für die die Faltung 2026 an
15/ME gebaut wurde, nur in der Schreibweise, die sie nie abdeckte. Der Ertrag
des Füllerteils ist also gemessen, wenn auch klein: ein falsches „geändert"
weniger auf 126 Entwürfe. Die Grundlinie
(`tests/fixtures/annex-baseline.json`) ist im selben Commit nachgezogen, wie
es `.github/workflows/annex-drift.yml` verlangt.

**Auf der Strecke Regierungsvorlage → Bundesgesetzblatt zahlt Nummer 3 genau
das ein, wofür sie gebaut ist, und Nummer 1 legt eine alte Asymmetrie frei.**
Mit Nummer 3 allein fallen 51/ME, 58/ME und 60/ME auf **null** substanzielle
Einheiten; übrig bleiben nur 26/27/ME (der 1:n-Fall, anderswo behandelt) und
88/ME. Mit Nummer 1 dazu melden 58/ME (6), 60/ME (2), 76/ME (2) und 88/ME (1)
wieder Einheiten — und alle elf sind **dieselbe Klasse**: Das
Parlamentsdokument wiederholt die Überschrift einer Anlage bzw. eines Anhangs
innerhalb des zitierten Textes („Anhang III", „Anlage 1"), das RIS-XML nicht.
Das ist eine Parser-Asymmetrie, kein Unterschied der Dokumente; sie war vorher
durch die Zitatregel verdeckt und ist jetzt sichtbar. Sie zu schließen ist die
nächste Arbeit an dieser Strecke, nicht ein Grund, die Regel zurückzunehmen.

**Geschlossen am 26.09.2026, und die Asymmetrie lag an einer Zeile.** RIS
markiert die Bezeichnung einer Anlage im zitierten Text als
`<ueberschrift typ="anlage">`; die Word-Vorlage des Parlaments gibt derselben
Zeile eine Klasse, die unsere Zuordnung nicht kennt, also landet sie dort als
`other`. `segmentUnits` nahm `other` in die Einheit auf und verwarf `section`
ausnahmslos — beide Leser sahen dieselbe Zeile, und nur einer behielt sie.

**Die Bezeichnung ist der ganze Test**, und das ist es, was die beiden Leser
gleich hält. Der *Titel* der Anlage („Liste der zentralen öffentlichen
Auftraggeber*)") ist auf **beiden** Seiten ein `section` und wird auf beiden
weiter verworfen; ihn hier mitzunehmen hieße, dieselbe Asymmetrie in die
andere Richtung zu bauen. Die öffnende Anführung taugte als Test nicht: Eine
Anordnung kann zwei Anlagen erlassen („Anhang VIII wird durch folgende Anhänge
VIII und IX ersetzt"), und die zweite Bezeichnung steht mitten im Zitat.
Ein Ressort setzt die „zu"-Klausel auf eine eigene Zeile („Anlage 3", „(zu
§ 10 Abs. 1a UStG)"), weshalb eine bloße Klammer **unmittelbar hinter** einer
Bezeichnung sie fortsetzt — und die Zeile danach ist wieder der Titel.

**Gemessen über die 84 Entwürfe mit Kundmachung** (`pnpm corpus:bgbl-station`):
substanziell geänderte Einheiten **37 → 24**, gleiche Einheiten 9.051 → 9.063,
und **kein Entwurf verliert** eine gleiche Einheit. 58/ME 6 → 0, 60/ME 2 → 0,
76/ME 2 → 0, 88/ME 1 → 0; dazu 14/ME 3 → 1, das in der Klasse nie gezählt war.

**Was bleibt, ist kein Parserfehler mehr, sondern der Befund selbst.** 14/ME
meldet „BGBl. I Nr.xxx/2025" gegen „BGBl. I Nr. 28/2025" — der Platzhalter des
Entwurfs, den die Kundmachung ausfüllt. Genau das soll die Station zeigen.

**Und der Preis, offen genannt:** Die Textgegenüberstellung
(`annex/comparisonRows.ts`) stellt zwei Spalten **desselben** Paragraphen
nebeneinander und kann deshalb nie eine Umnummerierung feststellen. Dort ist
seit diesem Tag **jeder** geänderte Verweis substanziell. Das ist die ehrliche
Antwort — die Alternative wäre, für einen Verweis „kein einziges Wort
geändert" zu behaupten, den wir nicht erklären können, also genau der Fehler,
den die vier Fälle oben gezeigt haben. Der Satz auf /so-funktionierts trägt
die Bedingung jetzt mit und sagt für die Gegenüberstellung ausdrücklich dazu,
dass sie dort nie erfüllt ist.

#### Ein Entwurf als Teil eines größeren Gesetzes — die Zahlen des Entwurfs, nicht die des Akts (30.09.2026)

**Die Beschriftung war schon erledigt.** Als Copy-Frage notiert war noch
„Fassung im Bundesgesetzblatt"; so heißt die Station seit 19.09.2026 in
`LAW_STATION_LABEL` (oben, „Eine Lehre über Beschriftungen"), und keine Seite
trägt die alte Form mehr. Die neuen Sätze unten folgen derselben Lehre: Den
Kurztitel eines Akts setzen sie nie in den Genitiv, sondern hinter einen
Doppelpunkt („als Teil eines größeren Gesetzes kundgemacht:
Budgetbegleitgesetz 2025, BGBl. I Nr. 25/2025"), weil ein Kurztitel jede
Nominalphrase sein kann.

**Der Befund.** `diffLawPackage` beschränkt einen Vergleich auf die Gesetze,
die beide Seiten führen. Das reicht, solange eine Seite der Entwurf ist.
Zwischen zwei späteren Stationen reicht es nicht: Ist der Entwurf in eine
Regierungsvorlage eingegangen, die mehrere Ministerialentwürfe bündelt, steht
auf **beiden** Seiten der ganze Sammelakt, jeder Artikel paart, und nichts
fällt heraus. 17/ME der GP XXVIII, einer der zwölf Informationsfreiheits-
Entwürfe, zählte unter „Regierungsvorlage → Fassung im Bundesgesetzblatt"
629 Einheiten des Informationsfreiheits-Anpassungsgesetzes, 6 davon
substanziell geändert. Der Entwurf selbst bringt 39, und davon ist eine
substanziell geändert. Die Zahlen beschrieben also den Akt, standen aber auf
der Seite des Entwurfs. Für Regierungsvorlage → Ausschuss- und → Plenarfassung
galt dasselbe; die BGBl-Station hat es nur am sichtbarsten gemacht.

**Gemessen** mit `pnpm corpus:bgbl-station -- --gp <GP> --scope`, offline über
den Harness-Cache, durch `findLawStations`, `findComparisonRvLink`,
`diffLawPackage` und `scopeToDraft`, also die Module der Seite. Von den
Entwürfen mit lesbarer Kundmachung und Parlaments-HTML des Entwurfs (XXVIII
81, XXVII 223, XXVI 78) trägt die Kundmachung bei 26, 48 und 29 Gesetze, die
der Entwurf nicht trägt. Das sind aber zwei verschiedene Fälle:

| | XXVIII | XXVII | XXVI |
|---|---:|---:|---:|
| Vorlage bündelt andere Entwürfe (`preconst`) | **14** | **5** | **11** |
| Vorlage nennt nur diesen Entwurf; das Ressort hat ein Gesetz dazugenommen | 12 | 44 | 18 |
| `preconst` fehlt | 0 | 0 | 0 |

Die zweite Zeile ist für XXVIII vollständig von Hand gelesen: 1/ME
(Tilgungsgesetz 1972), 47/ME (Gerichtsgebührengesetz), 60/ME
(eEltern-Kind-Pass-Gesetz), 95/ME (Suchtmittelgesetz) und die übrigen nahmen
nach der Begutachtung ein Gesetz in die eigene Vorlage auf; 7/ME tauschte
das UGB gegen das Arbeitsverfassungsgesetz. Ein Paarungsfehler ist nicht
darunter.

**Die Regel: Geschnitten wird nur, wo die Vorlage andere Entwürfe bündelt.**
Die Gesetze allein trennen die beiden Fälle nicht, der Datensatz des
Parlaments schon: `preconst[]` der Vorlage nennt jeden Entwurf, den sie
aufgenommen hat (129 d.B.: zwölf, 186 d.B.: nur 1/ME). Ein Gesetz, das das
Ressort seiner eigenen Vorlage beifügt, gehört zu **dieser** Vorlage, und was
der Ausschuss daran ändert, gehört in dessen Vergleich. Bei 1/ME trägt der
Tilgungsgesetz-Artikel unter Regierungsvorlage → Ausschussfassung eine
entfallene und eine neue Einheit. Ein Schnitt nach dem Entwurf allein hätte
genau das verschwiegen. Die Abfrage ist `bundlesOtherDrafts` in
`parliament/detailJson.ts`. Fehlt `preconst`, liefert sie `null`, und es wird
nicht geschnitten; gemessen fehlt es bei keinem betroffenen Entwurf.

**Wie geschnitten wird** (`scopeToDraft` in `diff/lawDiff.ts`): Es bleiben die
Artikel der früheren Station, die mit dem Entwurf paaren (dieselbe Paarung,
die ME → RV zeigt), und in der späteren Station das, was mit ihnen paart. Die
Brücke ist die frühere Station, nicht der Entwurf, weil zwei späte Fassungen
desselben Texts viel verlässlicher paaren als ein Entwurf mit seiner Vorlage.
Ein Artikel, der erst in der späteren Station dazukam, bleibt und wird wie
bisher als weiteres Gesetz genannt. Der Inkrafttretens-Artikel des Akts fällt
mit heraus, wenn er mit keinem des Entwurfs paart; in der ersten Fassung
blieb er, und bei XXVI 9/ME stand neben der einen Weingesetz-Einheit die
Übergangsbestimmung des Materien-Datenschutz-Anpassungsgesetzes. Als Gesetz
gezählt wird er nie. Der Kurztitel des Akts kommt aus demselben RIS-Datensatz
wie die Kundmachung (`getBgblDocument`), `preconst` aus der Vorlage, die für
die Fundstelle ohnehin geholt wird: keine zusätzliche Anfrage. Nur das
Dokument des Entwurfs wird bei einem späteren Paar jetzt mitgelesen, aus dem
Blatt-Cache.

**Wirkung, wie ausgeliefert.** Einheiten und substanziell geänderte
Einheiten, summiert über alle gemessenen Entwürfe, wobei die zwölf
IFG-Entwürfe denselben Akt je einmal zählten:

| | XXVIII | XXVII | XXVI |
|---|---:|---:|---:|
| rv→bgbl: Entwürfe bewegt | 14 | 5 | 11 |
| rv→bgbl: Einheiten | 10.860 → 4.848 | 11.994 → 11.732 | 11.767 → 5.787 |
| rv→bgbl: substanziell geändert | 373 → 294 | 422 → 412 | 314 → 150 |
| rv→ausschuss: substanziell geändert | 200 → 160 | 213 → 211 | 259 → 120 |
| rv→plenum: substanziell geändert | 283 → 214 | 165 → 160 | 253 → 109 |

Einzeln, rv→bgbl: 17/ME XXVIII 629 → 39 Einheiten (substanziell 6 → 1),
12/ME 629 → 12 (6 → 0), 77/ME 66 → 8 (Verbraucherkreditrechts-
Änderungsgesetz 2026, zusammen mit 79/ME); XXVI 9/ME, das Weingesetz aus
§12.18, 1.065 → 2 (24 → 0). Die zwölf Entwürfe der XXVIII mit eigener
Vorlage bewegen sich nicht. Am gebauten Server (`pnpm build`, API und
gerenderte Seite) ergeben 17/ME, 12/ME, 77/ME, 15/ME XXVIII und 9/ME, 12/ME,
162/ME XXVI dieselben Zahlen wie das Skript.

**Was die Seite sagt.** Über dem Vergleich eines späteren Paars steht:
„Die Regierungsvorlage fasst diesen Entwurf mit anderen Ministerialentwürfen
zusammen, und er wurde als Teil eines größeren Gesetzes kundgemacht:
Informationsfreiheits-Anpassungsgesetz, BGBl. I Nr. 50/2025. Verglichen und
gezählt wird nur, was zu diesem Entwurf gehört; nicht verglichen sind 126
weitere Gesetze: …". Den Halbsatz zum Akt gibt es nur, wo das Paar beim
Bundesgesetzblatt endet (`outsideDraftNote` in `app/utils/lawPackage.ts`).
Vom Entwurf aus (me→bgbl) nennt der bestehende Satz über weitere Gesetze
jetzt den Akt, statt den Mechanismus zu raten: „Im Parlament werden Vorlagen
zusammengefasst" stimmt nicht, wenn die Regierung gebündelt hat.

**Wo nichts zu schneiden ist, sagt die Seite auch das.** XXVII 6/ME und
11/ME ändern dasselbe eine Gesetz, beide in der Geldwäschenovelle 2020 (BGBl.
I Nr. 65/2020). Ein Schnitt nach Gesetzen findet dort nichts, und die 42
Einheiten sind die beider Entwürfe. Der Satz endet dann mit „Welche
Änderungen aus diesem Entwurf stammen, lässt sich im Text nicht trennen;
verglichen wird der ganze Text." (`bundledWithOtherDrafts`). So steht es
auch, wo der Text des Entwurfs nicht lesbar ist.

**Bewusst nicht getan:**

- **Kein Schnitt bei den 74 Entwürfen, deren Vorlage nur sie selbst nennt**,
  aus dem Grund oben. Unter ME → RV nennt der bestehende Satz diese Gesetze
  weiterhin als „weiteres Gesetz, das in diesem Entwurf nicht vorkommt".
- **Keine Trennung unterhalb der Gesetzesebene.** Zwei Entwürfe, die dasselbe
  Gesetz ändern (XXVII 6/11/ME), bleiben zusammen gezählt, und die Seite sagt
  es. Einzelne Ziffern einem Entwurf zuzuordnen hieße, die ME→RV-Ausrichtung
  gegen den Sammelakt laufen zu lassen. Das ist möglich, braucht aber eine
  eigene Messung.
- **Kein Fix der Paarung.** XXVI 162/ME führt das EU-JZG unter seinem
  Langtitel („Bundesgesetz über die justizielle Zusammenarbeit in Strafsachen
  mit den Mitgliedstaaten der Europäischen Union"), die Vorlage als
  „Änderung des EU-JZG". `pairArticles` paart die beiden nicht, und der
  Schnitt nimmt damit ein Gesetz des Entwurfs (46 Einheiten) aus den späteren
  Paaren. Unter ME → RV steht derselbe Fehler schon (das Gesetz auf beiden
  Seiten als nur dort vorhanden genannt). Betroffen ist einer von 30
  Entwürfen, und die Stelle für den Fix ist die Abkürzungsprobe in
  `pairArticles`.
- **Fünf gebündelte Entwürfe, deren Text das Parlament nur als PDF führt**
  (XXVII 6, 11; XXVI 12, 89, 92), liest die Seite aus dem RIS; das Messskript
  baut diesen Rückfall nicht nach und zählt sie nur. Am gebauten Server sind
  alle fünf geprüft: XXVI 12/ME 37 Einheiten (117 Gesetze ausgenommen), 89/ME
  105 (1), 92/ME 19 (10), XXVII 6/ME und 11/ME der Fall oben.
- **Die Entwurfsliste und die Stationsleiste nennen den Akt nicht**, nur der
  Vergleich, wo die Zahlen stehen.

### 12.34 Wie die Klubs abgestimmt haben — der letzte Fakt der Kette

**Gebaut am 24./25.09.2026.** Die Parlament-Station sagte bisher, *was* mit dem
Text geschehen ist („beschlossen", „im Ausschuss geändert", „abgelehnt"),
nicht, *wer* ihn getragen hat. Das Abstimmungsverhalten der Klubs liegt
strukturiert in genau der Antwort, die `draftDetail.ts` für die
BGBl-Nummer ohnehin holt: `content.vote` der Regierungsvorlage, ein Eintrag
je Klub mit `text`, `infavor`, Mandatszahl und Farbe. Kein neuer Request,
keine neue Quelle, keine laufende Pflicht — dieselbe Prüfung, an der die
Antragspakete hängen, fällt hier auf „gewöhnliche Arbeit".

**Abdeckung, gemessen über neun Gesetzgebungsperioden** (Liste 101,
`ITYP=I`, `VHG=RV`; die Spalten 31–35 führen dieselben Werte wie das
Detail-JSON, `api-exploration.md` §101): von den Vorlagen mit Status 5
tragen **110 von 111** (GP XXVIII) und **361 von 362** (XXVII) eine
Abstimmung; die ohne waren in Behandlung. Klub-Arrays haben davon 108 bzw.
360, in GP XXVI 107 von 115, in GP XX noch 398 von 423. Der Rest ist
Prosa-Vokabular statt Arrays — „Namentliche Abstimmung", „mehrstimmig",
„Einstimmig".

**Der Befund, der die Anzeige trägt: die Abstimmung ist nicht aus der
Koalition ablesbar.** Nur 32 % (XXVIII) bzw. 15 % (XXVII) der Vorlagen gehen
mit Koalitionsstimmen allein durch; 26 % bzw. 36 % haben keinen Klub gegen
sich, der Rest trägt Oppositionsstimmen. Eine Zeile, die in zwei Dritteln
der Fälle etwas anderes sagt als „die Regierung hat ihre Mehrheit", ist eine
Information. Und die 26–36 % ohne Gegenstimmen sind die Seite der
Rahmenregel, die sonst zu kurz kommt: ein umstrittener Entwurf, der am Ende
von allen Klubs getragen wird, ist ein Ergebnis, kein Versäumnis.

**Vier Dinge, die bewusst nicht gezeigt werden.**

1. **Nie „einstimmig", sondern „alle Klubs dafür".** Das Parlament zählt das
   Handzeichen je Klub, nicht je Abgeordnetem — das Stenographische
   Protokoll sagt „Das ist die Mehrheit, angenommen" und sonst nichts.
   Einstimmigkeit ist eine Aussage über Personen; wir haben eine über Klubs.
   Upstream führt „Einstimmig" ohnehin als eigenes Vokabular für die
   Datensätze, bei denen es das meint.
2. **Nichts aus `comment`.** Bei den Prosa-Fällen steht dort der einzige
   Zähler, den es gibt („abgegebene Stimmen: 176; davon Ja-Stimmen: 105") —
   aber in wechselndem Format, in GP XXV einmal als „abgegene Stimmen". Ein
   Parser darauf wäre unsere Lesart eines Satzes, kein Datensatz. Die zwei
   von 110 XXVIII-Vorlagen ohne Klubliste zeigen deshalb keine Zeile; eine
   fehlende Zeile ist ehrlicher als eine ungefähre.
3. **Keine Stimmenzahlen aus den Mandaten.** `fraction` ist die Klubstärke,
   nicht der Saal: die namentlichen Abstimmungen protokollieren 176 und 163
   abgegebene Stimmen bei 183 Mandaten. Eine Summe daraus wäre unsere
   Arithmetik im Gewand einer Zählung.
4. **Keine Klub-Bilanz.** Kein Profil je Partei, kein Filter „Gesetze, gegen
   die X gestimmt hat", keine Parteifarben als Blickfang. Die Abstimmung
   gilt dem ganzen Gesetz in dritter Lesung, nie einem Paragraphen, und
   schon gar nicht einer Stellungnahme — ein Klub kann dagegen stimmen und
   seinen Abänderungsantrag im Text darüber stehen haben. Deshalb steht der
   Satz auf der Seite hinter den Fassungen und nennt die Lesung, zu der er
   gehört; Nachbarschaft, keine Kausalität (Rahmenregel, §4).

**Der Ausschluss, der dabei präzisiert wurde.** `houseStatusText` trägt
dieselbe Abstimmung als Satz und wird weiterhin nicht gedruckt — der Grund
war immer die *unvermessene Prosa*, nie die Tatsache. Die strukturierte
Geschwister-Spalte ist ein Datensatz und wird gezeigt; beide Kommentare in
`shared/types/drafts.ts` sagen das jetzt gegeneinander.

**Und die Seite, die das Verfahren erklärt, zählt es mit auf.**
`/so-funktionierts` führt je Station eine Zeile „was der Monitor zeigt"; die
der Parlament-Station war ohne die Abstimmung unvollständig. Dort steht seit
25.09.2026 auch der Satz, den die Rahmenregel braucht: dass am Ende **eine
einzige** Abstimmung über das ganze Gesetz steht. Wer das gelesen hat, liest
die Klubs neben den Fassungen nicht als Urteil über einen Paragraphen.

**Lizenz:** die Datensatzseite Regierungsvorlagen stellt „die Ergebnislisten
der Filter und der API" und die Geschichtsseiten unter CC BY 4.0. Die
Abstimmung ist eine Station *nach* der Begutachtung und steht damit außerhalb
der offenen Frage E3 — eine der wenigen Stellen dieses Projekts mit einer
eindeutigen Rechtslage. `/impressum#imp-license` nennt sie seit diesem Tag
ausdrücklich.

**Wo es nicht steht:** auf Ausschussberichten (459 in GP XXVIII, null
Abstimmungen), auf den BNR-Gegenständen und bei Anträgen nur, wenn das
Plenum direkt über sie abgestimmt hat (64 von 1.047 in GP XXVIII) — für die
§4a-Fälle, die als Initiativantrag wiederkommen, ist die Zeile also meist
leer.

### 12.35 Der Periodenwechsel: ein benannter Rückfall, kein stiller Merge

**Gebaut am 25.09.2026, lange vor dem Tag, an dem er gebraucht wird** — und
genau deshalb: Am Stichtag ist der Umbau der schlechteste Zeitpunkt, weil die
Aufmerksamkeit dann am größten ist und die Daten am dünnsten.

Beide Rechenschaftsabschnitte der Startseite lesen Liste 81 bzw. 101 der
**laufenden** Gesetzgebungsperiode (`getCurrentGp()`, aus der
Seitenkonfiguration des Parlaments). An dem Tag, an dem eine neue Periode
sich konstituiert, ist diese Periode leer — und bleibt es nicht Tage,
sondern Monate.

**Gemessen am 25.09.2026 über die letzten beiden Wechsel**
(`scripts/corpus/periodenwechsel.ts`, Liste 81 und 101 direkt):

| | XXVI → XXVII (23.10.2019) | XXVII → XXVIII (24.10.2024) |
|---|---|---|
| 1. Ministerialentwurf der neuen GP | +15 Tage | **+54 Tage** |
| 5. Ministerialentwurf | +20 Tage | **+83 Tage** |
| erste Kundmachung aus einer Begutachtung | +14 Tage | **+201 Tage** |

Die Spannweite ist der eigentliche Befund. Nach der Wahl 2024 dauerte die
Regierungsbildung bis März 2025: kein Ressort schickte etwas in Begutachtung,
und die ersten fertigen Vorlagen der XXVIII (BGBl. I 159/2024, 9/2025) kamen
aus gar keiner — Budget- und Anlassgesetze. „Zuletzt Gesetz geworden" hätte
also rund **sieben Monate** den Satz „Aus dieser Gesetzgebungsperiode ist
bisher kein Entwurf im Bundesgesetzblatt kundgemacht worden" getragen. Er
wäre wahr gewesen und sieben Monate lang das Letzte, was die Seite sagt.

Und „Wo am meisten mitgeredet wurde" wäre in dieser Zeit nicht dünn gewesen,
sondern **weg**: der Abschnitt rendert auf `v-if="rankedRows.length"`. Danach
kommt der schlechtere Zustand — eine Handvoll frischer Entwürfe, deren
Stellungnahmen erst über ihre Frist einlaufen, also eine Rangliste von
Nullen unter einem Superlativ.

**Die Entscheidung: der Rückfall verschiebt das Fenster, er löst es nicht
auf.** §12.21 begründet ausführlich, warum diese Rangliste nicht über
Perioden hinweg zählen darf — über GP XXVII lauten die fünf größten
Begutachtungen 106.184, 35.296, 19.026, 16.534 und 14.334 Stellungnahmen,
vier davon Epidemiegesetz-Novellen, ein COVID-Denkmal, das sich nie wieder
ändert. Ein Rückfall, der die Perioden mischte, wäre genau diese Rangliste,
nur unabsichtlich. Also: **eine Periode, ganz, benannt** — und die Seite
sagt, welche.

**Zwei Bedingungen, weil die Abschnitte zu verschiedenen Zeitpunkten
umschalten** (die Tabelle oben: 83 gegen 201 Tage):

- **Rangliste** — `canRankPeriod` (`shared/utils/draftOrder.ts`): mindestens
  `HOME_LIST_LENGTH` Zeilen **und** irgendeine Stellungnahme. Beide Hälften
  sind nötig. Ohne die erste ist eine „Rangliste" von zwei Entwürfen eine
  Aufzählung; ohne die zweite rangiert sie bei fünf frischen Entwürfen die
  Geschäftszahlen.
- **Kundmachungen** — eine einzige Zeile genügt (`getRecentlyEnacted`). Eine
  Rangliste von eins ist keine Rangliste; eine Kundmachung ist ein ganzer
  Fakt, und „zuletzt Gesetz geworden" stimmt über sie, sobald es sie gibt.

Beide Bedingungen sind **monoton** — eine Periode gewinnt nur Entwürfe und
Stellungnahmen hinzu —, also kippen sie einmal und nie zurück. Und keine
braucht Pflege: `previousGp` rechnet auf der römischen Zahl statt in
`GP_STARTS` nachzuschlagen, damit der Rückfall an dem Tag funktioniert, an
dem noch niemand eine Zeile ergänzt hat. Das „(seit 24.10.2024)" der
Rangliste kommt weiter aus der Tabelle und fällt stillschweigend weg, solange
die neue Periode dort fehlt — die Seite wartet nie auf Wartung und druckt
nie ein falsches Datum.

**Eine Funktion für beide Ranglisten-Endpunkte** (`rankedPeriod.ts`).
`/api/dashboard` liefert die Zeilen, `/api/dashboard/outcomes` leitet
dieselbe Rangliste noch einmal her, um die Ergebnis-Chips daranzuhängen
(`HOME_LIST_LENGTH` sagt, warum). Fiele nur einer von beiden zurück, zeigte
die Seite fünf Zeilen der einen Periode mit den Chips der anderen — die
Drift, gegen die beide geschrieben sind, nur lautlos und nur im
Periodenwechsel. Jeder Schlüssel trägt seine GP (`${gp}-${inr}`), also
träfe schlicht nichts aufeinander und der Abschnitt verlöre die Hälfte,
für die es ihn gibt.

**Was die Seite sagt, und wo.** Der Grund steht in einem eigenen Satz **vor**
der Aussage, die er einschränkt. Die Periode nur im bestehenden Satz zu
nennen wäre korrekt und würde nicht gelesen: „der XXVIII." an einer Stelle,
an der „XXIX." erwartet wird, ist eine geänderte Ziffer mitten in einer
Zeile. Dazu tauscht der Kundmachungs-Abschnitt seinen Erklärsatz aus — „Der
Nationalrat beschließt in Blöcken" erklärt, warum sich hier gewöhnlich wochenlang
nichts rührt, und ist im Rückfall die falsche Erklärung: dann steht die Liste
still, weil ihre Periode vorbei ist. Ein Grund je Zustand, und der wahre.

**Und der Link geht mit.** Beide Abschnitte tragen genau einen Weg hinaus, auf
den Filter, der dieselbe Liste ungekürzt zeigt (§12.24). `/entwuerfe`
voreingestellt ist die **laufende** Periode, der Link liefe also in eine leere
Liste — im Rückfall trägt er deshalb `&gp=…`, sonst nicht: im Normalfall ist
die Periode ohnehin die Voreinstellung und der Parameter brächte nur einen
aktiven Filter-Chip bei der Ankunft. Aus demselben Grund gehört die Zahl im
Kopf der Rangliste zur **zurückgefallenen** Periode: „Alle 138
Ministerialentwürfe →" ist die Größe der Menge hinter dem Link, und die des
laufenden Fensters wäre eine Zahl über eine andere Liste.

**Was der Rückfall NICHT ist.** Er verschiebt nicht die Periode der *Zeilen*,
sondern die der gelesenen Liste. Dass eine Regierungsvorlage einen
Ministerialentwurf der Vorperiode trägt, ist der Normalfall rund um einen
Wechsel und war immer schon abgedeckt: vier der ersten sechs Gesetze der
XXVII kamen aus Begutachtungen der XXVI (BGBl. I 111/2019 aus XXVI/161/ME,
18/2020 aus 148/ME, 19/2020 aus 170/ME, 20/2020 aus 162/ME). Der Abschnitt
liest das Ende der Kette auf der Vorlage (§12.23), und genau deshalb erzählt
er über den Wechsel hinweg die richtige Geschichte — „deine Stellungnahme aus
der letzten Periode ist gerade Gesetz geworden" ist Mechanismus 3, nicht ein
Randfall.

### 12.36 Eine laufende Frist ist eine laufende Frist — die offene Liste über den Wechsel

**Gebaut am 25.09.2026, unmittelbar nach §12.35 und beim Messen dafür
gefunden.** Am Stichtag liefen noch Begutachtungen der alten Periode: 2 am
24.10.2024 (352/ME bis +18 Tage), 4 am 23.10.2019 (169/ME bis +40 Tage). Sie
verschwanden in dem Moment von `/`, aus `/feed.xml` und aus `/kalender.ics`,
in dem `getCurrentGp()` umsprang — obwohl ihre Frist lief und jede und jeder
noch eine Stellungnahme einbringen konnte. Mit erzwungener GP XXIX
nachgestellt: offene Liste leer, RIS-Hälfte leer, Feed und Kalender **null**
Einträge.

Das ist kein Rechenschafts-, sondern ein **Teilnahmeproblem**, und damit das
schwerere: §12.35 kostet Sichtbarkeit, das hier kostet die Mitwirkung selbst.
Am härtesten im Kalender, weil ein Abo keine Liste ist, die man neu lädt,
sondern eine Menge, die die App bei jedem Refresh **ersetzt** — die noch 18
Tage entfernte Frist von 352/ME wäre den Abonnentinnen und Abonnenten am
24.10.2024 schlicht aus dem Kalender gefallen. Und es trifft genau den
Ersatz, der gebaut wurde, um die Betriebslast der E-Mail-Alerts zu vermeiden
(§12.3).

**Hier ein Merge, kein benannter Rückfall — und der Unterschied ist nicht
Geschmack.** Bei den Rechenschaftsabschnitten IST die Periode die Aussage
(„die meisten Stellungnahmen DIESER Periode"), deshalb muss sie benannt
werden. Hier ist sie Verwaltung: diese Abschnitte behaupten „jetzt", nicht
„in dieser Periode", und tragen darum auch keine Periodenangabe, die falsch
werden könnte. Eine laufende Frist ist eine laufende Frist.

**Zwei Hälften, zwei verschiedene Ursachen, zwei verschiedene Abhilfen** —
das ist der eigentliche Befund. Liste 81 ist hart nach GP partitioniert, der
RIS-Bestand nach **Datum**:

- **Parlaments-Hälfte:** die noch offenen Entwürfe der Vorperiode werden
  dazugelesen (`carryOver.ts`) und in `open`, `/feed.xml` und
  `/kalender.ics` eingemischt.
- **RIS-Hälfte:** hier fehlt der neuen Periode nicht der Inhalt, sondern die
  **Kalenderzeile**. `gpWindow` kennt sie nicht, also liefert
  `getRisOnlyForGp` gar nichts — und zwar nicht wochenlang, sondern bis
  jemand `GP_STARTS` ergänzt. Das sind rund die Hälfte aller offenen
  Verfahren (§12.16), unbefristet weg, abhängig von einer Handbearbeitung an
  genau dem Tag, an dem nichts von Hand passieren darf. Die Vorperiode
  antwortet daher für sie — **ganz**, Fenster und Join-Map zusammen
  (`windowPeriodFor`). Ihr Fenster ist ohnehin offen nach hinten, weil
  `gpEndedOn` den Beginn der Nachfolgerin liest und genau diese Zeile fehlt.

Nur das Fenster der Vorperiode zu nehmen und die Map der neuen wäre der
Fehler, nach dem es aussieht: die Map entscheidet, welche Records ein
Ministerialentwurf schon beansprucht, und eine leere Map veröffentlichte
jeden davon erneut als „ohne Gegenstand im Parlament" — neben dem Entwurf,
zu dem er gehört.

**Ohne Bedingung, und das ist die Entscheidung.** Eine Schwelle müsste am
Alter der neuen Periode hängen, und genau das trägt nicht: 2024 kam ihr
erster Entwurf +54 Tage nach der Konstituierung, die alten Fristen waren bei
+18 vorbei — 2019 kam er +15 Tage, während die alten bis +40 liefen. Jede
Schwelle über die neue Periode wäre an einem der beiden Wechsel falsch
gewesen. Also wird immer nachgesehen und nur behalten, was läuft. Folgenlos
im Normalbetrieb, und das ist gemessen, nicht gehofft: über die
abgeschlossenen Perioden XXVII, XXVI, XXV und XXIV — 1.390 Entwürfe,
25.09.2026 — trägt **kein einziger** noch `AKTIV='J'`. Die Menge ist dort
leer, nicht beinahe leer. Beide Regeln schalten sich außerdem selbst ab:
`windowPeriodFor` greift nur für die Periode direkt nach der neuesten
Tabellenzeile und hört auf, sobald sie ergänzt ist.

**`/entwuerfe` geht mit — aber nur, wenn der Aufruf keine Periode genannt
hat.** Die Liste trägt einen sichtbaren Periodenwähler; quer über die Grenze
zu lesen änderte, was dieser Wähler bedeutet. Also entscheidet nicht die
Seite, sondern die Frage: `?gp=XXVII` ist eine Frage nach einer Periode und
wird periodenrein beantwortet, ohne `gp` fragt jemand „was gibt es gerade",
und dann gehört eine Frist, die den Wechsel überlebt, zur Antwort. Wählt
jemand oben eine Periode, hört das Mitlesen von selbst auf. Ohne diese Regel
zeigte der eine Weg hinaus aus „Jetzt in Begutachtung" im Übergangsfenster
**9 gegen 0** Zeilen — §12.24 gebrochen in genau den Wochen, um die es hier
geht.

**Und die Liste sagt es.** Der Periodenwähler zeigt in diesen Wochen die
laufende Periode, während ein paar Zeilen aus der davor stammen; zwei
Perioden stillschweigend unter einem Etikett ist das, was §12.21 ablehnt.
Ein Satz über den Zeilen nennt sie, und beide Endpunkte melden nur, was das
Filtern überlebt hat — `status=closed` siebt die mitgelesenen Zeilen ohnehin
alle aus.

**Die Stationskarte bleibt bei ihrer Periode.** `chains` ist nach `inr`
allein verschlüsselt, und Geschäftszahlen fangen in jeder Periode wieder bei
1 an: eine mitgelesene Zeile bekäme sonst die Station eines fremden Entwurfs
mit derselben Nummer aufgesetzt. Sie bleibt deshalb ohne Chain und fällt in
`filterDraftList` auf `begutachtung` zurück — für eine laufende Frist die
richtige und zugleich schwächste Behauptung. Eine zweite Karte zu bauen wäre
für diese paar Zeilen ein kalter 35-Sekunden-Lauf (§12.26).

### 12.37 Drei Tage Versatz: derselbe Entwurf zweimal auf der Startseite

**Beim Prüfen von §12.36 gefunden, am 25.09.2026, und es lag schon vorher
da.** Eine RIS-Begutachtung wird ihrer Periode nach dem **Beginn**
zugeschlagen, ihr Ministerialentwurf nach dem **Einlangen** im Parlament —
und die beiden Daten liegen ein paar Tage auseinander, weil RIS die
Begutachtung veröffentlicht, wenn sie beginnt, und das Parlament den Entwurf
verzeichnet, wenn er einlangt.

An einer Periodengrenze fallen sie damit auf verschiedene Seiten: der
Entwurf steht noch in Liste 81 der alten Periode, sein Record schon im
Fenster der neuen. `getRisMapForGp` der neuen Periode kennt nur deren eigene
Entwürfe, beansprucht ihn also nicht — und der Record erscheint als
„Begutachtung ohne Gegenstand im Parlament", was das eine ist, was er nicht
ist.

**Mit dem Carry-over daneben wird daraus eine sichtbare Doppelung.**
Nachgestellt mit einer Grenze am 20.09.2026 (Produktionsbuild, kalte Caches):
137/ME Klimagesetz, 138/ME UVP-G und 139/ME CO2-Speicherungsgesetz standen
zweimal auf der Startseite — einmal als Ministerialentwurf aus dem
Carry-over, einmal als Verordnungsentwurf aus der RIS-Hälfte. In der Karte
der XXVIII sind alle drei sauber `matched`; es fehlte nicht der Join,
sondern die Frage.

**Also zwei Karten.** `getRisOnlyForGp` beansprucht einen Record jetzt auch
dann, wenn ihn die Karte der **Vorperiode** hält. Nur diese eine Richtung,
und die ist nicht symmetrisch gewählt: der Versatz geht „Entwurf früher,
Record später", die fehlende Karte ist damit immer die der Periode davor.

**Im Normalbetrieb ändert das nichts, und das ist gemessen, nicht gehofft:**
am 25.09.2026 trägt die Karte der XXVIII 137 Zeilen mit `risId`, und
`withGegenstand` der XXVIII ist 137 — Differenz null, die zweite Karte
beansprucht heute keinen einzigen zusätzlichen Record. Sie greift an der
Grenze und sonst nie.

(Eine Warnung zur Messmethode nebenbei: zwei frühere Zahlenpaare zu dieser
Stelle waren in sich widersprüchlich, weil der `derived`-Cache des
Dev-Servers Einträge aus der Zeit vor einer Änderung hielt und der
RIS-Bestand zwischen zwei Messungen wächst. Was hier steht, ist an einem
frischen Produktionsbuild auf eigenem Port gemessen — bei Fragen an dieser
Kette ist das der einzige verlässliche Weg.)

### 12.38 Die erste Änderungsrate einer ganzen Periode — und warum sie so nicht auf die Seite kommt

„Wie viele Entwürfe haben sich nach der Begutachtung geändert?" ist die
Hälfte von Mechanismus 2, die neben „wie viele kommen überhaupt durch" fehlte
(`app/utils/outcomes.ts`, §12.10 Nr. 10). Gerechnet einmal über jede
abgeschlossene Periode, als Rechenzeit und ohne Betrieb, mit
`pnpm corpus:aenderungsrate -- --gp XXVII` (kalt 85 s, warm 8 s). Der Weg ist
der des Dienstes: dieselben Module für Stationen, Gesetzestexte, Artikelpaarung
und Vergleich; wo `getLawDiff` nicht importierbar ist, eine Kopie, die ein
zweiter Lauf mit dem Alias gegen die ausgelieferte Stationenauflösung hält
(0 Abweichungen in beiden Perioden).

**Das Ergebnis.** GP XXVII: 350 Entwürfe; 57 ohne Regierungsvorlage (die
296/353 aus `outcomes.ts` reproduziert), 10 nicht vergleichbar (der
Gesetzestext nur als PDF beim Parlament und nicht im RIS), **3 textgleich, 0
nur redaktionell, 280 geändert — 98,9 % der 283 verglichenen**. GP XXVI:
**101 von 104 (97,1 %)**. Von Hand nachgesehen, weil eine so hohe Zahl zuerst
nach Messfehler aussieht: 13/ME ist wirklich zeichengleich, 203/ME auch;
221/ME halbiert einen Rabatt, 23/ME fasst eine Prüfregel neu, 30/ME ersetzt
„XXX" durch ein Datum und ändert einen Plural. Parser-Asymmetrie und Paare
gleichen Texts betreffen weniger als zehn Entwürfe je Periode.

**Warum das keine Konstante für die Seite ist.** „296 von 353 wurden zur
Regierungsvorlage" trennt: Wer keine hat, ist in der Minderheit, und die Zahl
ordnet den einzelnen Entwurf ein. „280 von 283 wurden geändert" trennt
nichts — es sagt dem Leser eines Entwurfs nur, dass seiner vermutlich auch
geändert wurde, und das zeigt ihm der Vergleich auf derselben Seite genauer.
Was trägt, ist **das Wieviel**: Der Median der berührten Einheiten liegt bei
rund zwei Dritteln, der der Einheiten mit Wortänderung bei 16 je Entwurf
(p10: 3); vier Entwürfe ändern nur das Inkrafttreten, 65 kommen mit einem
anders geschnittenen Paket an. Diese Verteilung ist aber genau die, die die
Vergleichsfehler aus §12.18 (Nachtrag) verfälschen — 1.119 „neue" Einheiten
bei einem Entwurf mit einer. Die Reihenfolge ist deshalb: erst die
Paarungsfehler, dann eine Umfangszahl, und welche, ist eine
Produktentscheidung.

**Was die Zahl nicht sagt.** Dass eine Stellungnahme eine Änderung bewirkt
hat. Die Ressorts arbeiten nach der Begutachtung praktisch immer weiter am
Text — das ist gemessen. Wodurch, wäre der Abgleich einer Stellungnahme mit
dem geänderten Paragraphen, eine andere Messung, und die Rahmenregel (§4)
verbietet, die eine Zahl als die andere zu lesen.

**Die Vorfrage war falsch gestellt.** Notiert war, die Rate sei für die
alten Perioden nicht ehrlich zu bilden, falls die amtliche
Textgegenüberstellung dort fehlt — eine Stichprobe von acht Entwürfen
deutete auf 1–3 von 8 gegen 7 von 8 heute. Beides trägt nicht:

- **Die Beilage steht nicht auf diesem Pfad.** Der ME→RV-Vergleich liest die
  Gesetzestexte beider Stationen (`diff/stationDocuments.ts`,
  `diff/lawDiffService.ts`); nichts in `server/utils/diff/` kennt die Beilage.
  Sie steht nur am Konsolidierungs-Tor (`kons/konsService.ts`,
  `kons/konsGate.ts`). Was die Rate begrenzt, ist die Vergleichbarkeit der
  beiden Texte: **64 · 70 · 87 · 93 · 97 · 100 %** der Entwürfe mit
  Regierungsvorlage in XXIII bis XXVIII. Das ist die Zahl, die ein Antrag für
  die alten Perioden nennen darf.
- **Und die Stichprobe lag falsch** (`pnpm corpus:tgu-deckung -- --gp
  XXIII,XXIV,XXV,XXVI,XXVII,XXVIII --probe`). Beim Parlament, ohne jeden Join
  gezählt, trägt die Beilage **40,8 · 60,4 · 67,8 · 86,5 · 86,9 · 89,9 %**
  der Entwürfe; mit den gebündelten „Materialien"-Dokumenten, geprüft an der
  Kopfzeile „Geltende Fassung | Vorgeschlagene Fassung", **71,7 · 75,9 ·
  82,7 · 86,5 · 86,9 · 89,9 %**. Die RIS-Seite sieht mit unserer Regel nur
  18,9 bis 81,2 %, und der Abstand ist in XXV–XXVIII **nicht der Join**
  (Zuordnung 82–99 %, die joinfreie Kontrolle über alle Gesetzessätze der
  Periode liegt gleich), sondern zum größten Teil der Name (§12.13, „Die
  Abkürzung mitten im Namen"). In XXIII und XXIV kommt ein unvollständiges RIS
  dazu: 124 Gesetzessätze für 233 Entwürfe. Das RIS beginnt am 17.12.2003
  und reicht damit in XXIII hinein, aber lückenhaft.

Offen bleibt damit nur, welche Umfangszahl — nicht, ob es eine gibt.

**Nach den Vergleichsfehlern (27.09.2026)** steht die Rate, wie sie stand:
XXVII **274 von 277 (98,9 %)**, XXVI **98 von 101 (97,0 %)**. Neun der zehn
Entwürfe ohne Artikelpaarung zählen jetzt als nicht vergleichbar statt als
geändert, der zehnte (216/ME) als echter Vergleich; die Verteilung des Umfangs ist damit
die, auf der eine Umfangszahl stehen kann.

**Das Maß, gemessen und gebaut (27.09.2026, `d160d32`, `a39ff34`).** Drei
Kandidaten gegen den Korpus gehalten: Die Zahl geänderter Einheiten hängt an
der Länge des Gesetzes (p10 2, p90 42 in XXVII), der Anteil aller berührten
Einheiten zählt mit, was die Vorlage hinzufügt. Was trägt, ist der **Anteil
der eigenen Bestimmungen des Entwurfs, den die Vorlage im Wortlaut geändert
oder gestrichen hat**, redaktionelle Änderungen nicht gezählt
(`shared/utils/changeShare.ts`, eine Definition für Seite und Messung): XXVII
p25 46 %, Median 63 %, p75 75 % (n 282), XXVI 34 / 50 / 73 % (n 104); die
Parser-Korrekturen desselben Tages haben daran nichts verschoben. Die Seite
sagt es im Vergleich Entwurf gegen Vorlage, mit der Zahl des Entwurfs und
der mittleren Hälfte seiner Periode (eine laufende Periode gegen die
jüngste abgeschlossene): „Von den 15 Änderungsanordnungen des Entwurfs hat
die Regierungsvorlage 3 (20 %) geändert oder gestrichen, bloß redaktionelle
Änderungen nicht mitgezählt. Zum Vergleich: In der XXVII.
Gesetzgebungsperiode lag dieser Anteil bei der Hälfte der Entwürfe zwischen
46 und 75 %." Eine Spanne, kein Urteil; über die Wirkung einer
Stellungnahme sagt der Satz nichts.

**Eine Vorlage aus der laufenden Begutachtung (29.09.2026, `7d7032c`).**
Die Spanne ist an Vorlagen gemessen, die nach der Begutachtung kamen. An
115/ME XXVIII stand sie neben einer, die es nicht tat: Die Regierungsvorlage
525 d.B. ist vom selben Tag wie der Entwurf, zwei Wochen vor dessen
Fristende, und „übernimmt die 8 Änderungsanordnungen im Wortlaut" las sich
daneben wie eine übergangene Begutachtung — die Lesart, die §4 ausschließt.
Gemessen über dieselben Zeilen (`XXVIII-rows.json` bzw. `XXVII-rows.json`
dieses Skripts), das Datum der Vorlage aus ihrem Einlangen, die Frist aus
Liste 81 (XXVII aus `scripts/corpus/rvLatency.ts`): In der **XXVIII. GP**
liegt die Vorlage bei **7 von 91** Entwürfen am oder vor dem Fristende (33,
45, 46, 92, 115, 116, 117/ME), bei vieren sogar am oder vor dem Tag des
Entwurfs selbst; der Anteil geändert liegt bei ihnen im Median bei **0 %**,
gegen 60 % bei den übrigen 84. In der **XXVII. GP** ist es **1 von 296**
(132/ME) — die Spanne oben ist davon nicht verfälscht, der Fall aber in der
laufenden Periode kein Einzelfall. Die Seite behält für diese Entwürfe die
Zählung und ersetzt die Spanne durch das Datum: „Eingebracht wurde sie am
10.06.2026, am selben Tag, an dem der Entwurf in Begutachtung ging — die
Frist für Stellungnahmen lief bis 24.06.2026.", dazu der Zeiger auf den
nächsten Vergleich, wo es einen gibt. Zeitlich, nicht kausal: Bei 45/ME kam
die Vorlage fünf Tage vor Fristende, und drei der elf Stellungnahmen lagen
da schon vor (zwei weitere kamen am selben Tag) — „konnte nicht aufnehmen"
wäre dort falsch. Der Tag des Fristendes zählt mit, und die Rechnung ist dieselbe wie
das „noch vor Fristende" am Verfahrensstrang (`tabledBeforeFristEnd`,
`app/utils/outcomes.ts`).

## 13. Open questions

1. **Legal (restated 2026-09-16 — the old wording asked the wrong question).** It assumed the metadata was CC-BY and only the full texts excluded. Parliament's licence page for the Begutachtungsverfahren excludes *Beteiligungen zu Ministerialentwürfen* from open-data reuse as such, and no licensed dataset covers Ministerialentwürfe at all. So the question is now: **on what basis may the metadata of lists 81/142/305 be reused?** Two halves — the factual one (how is that sentence meant, is a case-by-case release possible) goes to the Parlamentsdirektion, the legal one (is factual metadata protectable at all; Datenbankherstellerrecht §§ 76c ff vs. § 42h UrhG) to a university partner. The inline web-form texts remain a sub-question of it, not a separate one. It blocks a blanket CC-BY claim on the site, which was removed on 2026-09-16. **And "stage 1 is metadata-only either way", which stood here until 2026-09-19, is not quite true — one block breaks it.** Under „Worum geht es?" the draft page prints Parliament's `shortinfo`: Ziele, Inhalt, Hauptgesichtspunkte. That is prose from the excluded dataset, and no enumeration of "Fristen, Geschäftszahlen, Anzahl" covers it. The obvious escape was measured and does not hold (`pnpm corpus:kurzinfo`, GP XXVII, 337 drafts): the Kurzinformation is *not* simply the ministry's text, which RIS publishes CC BY. 53 % of drafts carry no prose at all, only the Vorblatt lists (67 % of all characters, untested here because the Vorblatt is a RIS document the corpus mapper does not carry); where there is prose, a median of 60 % of its eight-word windows occur verbatim in the ministry's documents, p10 25 %, and only 6.6 % of drafts are covered to 90 % or more. It is Parliament's editorial work on the ministry's material — related, but not the same document, so it cannot be sourced from RIS instead. Consequence: `/impressum` and `/ueber` name it since 2026-09-19, and **the question to the Parlamentsdirektion has to name it too** — an answer of the form "only the contents of the Stellungnahmen are excluded" would not settle it, because the Kurzinformation is neither a Stellungnahme nor a metadatum. And a third block, found 23.09.2026, which unlike the Kurzinformation sits in code: the § comparison reads the Ministerialentwurf's Gesetzestext from Parliament's HTML wherever Parliament publishes one (`diff/lawDiffService.ts`, RIS XML only where it does not), and the Begründungsvergleich reads the draft's Erläuterungen from the same copy on both sides (`explanations/reasoningDiffService.ts`) — both for a measured reason, one Word template on both sides (§12.12, sixth measurement), and both against the source order the Textgegenüberstellung follows (`annex/annexSource.ts`). The argument that carries it is the one the annex switch refuses for the drafts RIS does not hold — the same documents stand in RIS under CC BY — and for those drafts (12 of 350 in GP XXVII) the comparison shows Parliament's text with no RIS twin. `/ueber` and `/impressum` name it since 23.09.2026. Open, and part of the question above: whether to read the draft's text RIS-first like the annex, at the measured cost to the alignment, or to keep the parser symmetry and say so — as the copy now does. Read live on 23.09.2026, Parliament's own dataset pages (Regierungsvorlagen, Anträge, Ausschussberichte, Beschlüsse — one template) call the documents of those items „freie Werke und somit ohne Lizenzierung frei nutzbar“ and license only the result lists, the API and the history pages as CC BY 4.0; the exclusion sentence on the Beteiligungen page names *Beteiligungen* zu Ministerialentwürfen, not the drafts or their documents. (What stood here until 30.09.2026 — that the Beteiligungen lists are CC BY and that the Stellungnahmen zur Regierungsvorlage, §12.14, run under that grant — was a misreading: the Beteiligungen dataset is „Aktuelle Beteiligungen", list 143, items open for participation on the day of the query, and its page says „Ministerialentwürfe und Stellungnahmen fallen nicht darunter"; the Regierungsvorlagen page excludes „sämtliche Informationen zu Stellungnahmen" from free use and licensing, for data protection and copyright. The Stellungnahmen zur Regierungsvorlage therefore carry no licence either, and `/impressum` says so since 30.09.2026.) So the sharp form of the question to the Parlamentsdirektion is whether „die Dokumente selbst sind freie Werke“ holds for a Ministerialentwurf's documents too — and, separately, on what basis list 81 as such and the Kurzinformation may be reused. **The § comparison's own credit line was corrected to those facts on 23.09.2026:** it claimed „CC BY 4.0" whenever neither side was the Ministerialentwurf (`isLicensedPair`), which named a licence Parliament does not grant for these documents — the correct note for a Regierungsvorlage, Ausschuss- or Plenarfassung read from Parliament is „Dokumente: freie Werke, § 7 UrhG", a RIS-sourced side stays CC BY 4.0, and the Ministerialentwurf is credited by name with no claim at all, because what may be claimed for it is precisely this open question (`lawDiffSourceCredit`).
2. ~~Join key RIS↔Parliament at corpus level~~ **Resolved (Sept 2026):** GP XXVII corpus test, 337/350 matched, 0 ambiguous, 12 without any RIS record, no one-sided extensions — `docs/ris-join.md`.
3. Is list-81 `Frist` updated on deadline extensions? (Affects future alerts and history.) **Being measured since 24.09.2026:** one call a day is not enough to see it — the list shows a deadline, never its history — so a daily copy of list 81 is kept on the server (`deploy/bin/list81-snapshot.sh`, systemd timer, `/var/lib/begutachtungs-monitor/list81/`) and read as a series by `pnpm corpus:list81-drift`. The same run sizes the persistence package: how many rows change per day at all, and how much of that is only the statement counter. The measurement is weak in one direction by construction — with six Begutachtungen open on the day it started, an unchanged `Frist` over two weeks is a small sample, not a No; only an observed extension that leaves the field untouched would settle it. Which is why the same question is put to the Parlamentsdirektion directly as well, and asked there independently of what the series shows.
4. Multiple RVs (ME→RV 1:n): is "latest RV" enough or does the UI need all strands? **Corpus evidence 2026-09-08:** it happens — 27/ME (IFG-Anpassung BMF) has two, 134 d.B. and 129 d.B., both dated 18.06.2025, and its diff against the one we pick reports 25 laws as absent that are plausibly in the other. Until this is decided, the comparison says "in dieser Regierungsvorlage" and adds that a draft can end up in more than one — it must never read as "the law was dropped". **Read again 2026-09-28 — it is a split, not a choice.** In the four drafts of XXVI–XXVIII where the text-evolution list and the stage order name different Vorlagen (XXVII 21/ME; XXVIII 26/, 27/, 74/ME), every Vorlage is a different law and every one was kundgemacht — 26/ME went into 128, 130 and 129 d.B. with three Bundesgesetzblätter. So there is no „right" Vorlage to find; there is one coherent strand per Vorlage. Until then one page mixed two: 26/ME compared its §§ against 130 d.B. (Bildungsdirektionen-Einrichtungsgesetz), its Erläuterungen against 129 d.B. (Informationsfreiheits-Anpassungsgesetz) and, at `rv → bgbl`, 130's text against 129's Kundmachung. Since then the comparison, the Begründungsvergleich and the BGBl station all stand on the Vorlage whose Gesetzestext Parliament attaches to the draft (`findComparisonRvLink`, falling back to the latest). Measured with `corpus:aenderungsrate -- --reasoning`: base rate and buckets unchanged in all three periods, Begründungsvergleich XXVII 2.443 → 2.450 and XXVIII 1.027 → 1.028 compared §§. Outcome, station map and the Stellungnahmen panel stay on the latest link. **Still open, and now the only question:** whether the page shows every strand.
5. ~~Marker for dead MEs (never became an RV): watch the `vhg_fertig` field.~~ **Resolved (Sept 2026):** the field is constant across all states; the marker is the GP boundary plus measured base rates — §12.10.
6. Rate limits of the Parliament API are undocumented; behavior under load unknown. Weigh cache TTL (30 min) against freshness for tight deadlines.
7. ~~Type-filter vocabulary of list 101~~ **Resolved (Sept 2026):** `VHG`/`DOKTYP` values such as `VOLKBG`, `E`, `PET`, `BI` — `docs/volksbegehren.md` §5.1.
8. ~~Hosting~~ **Settled (Aug 2026): netcup VPS pico G11s 12M** (€1.85/month incl. 20% AT VAT — the list price €1.84 carries 19% DE VAT —, 12-month term, €0 setup, Nuremberg). EU-owned (DE) like all candidates. Decisive arithmetic: Hetzner's real no-commitment price (CX23, €7.19/month incl. VAT) means one netcup *year* ≈ three Hetzner *months* — the 12-month commitment risks at most ~€15 even if the project stops early, and the app is stateless, so a later provider move is ~30 min (scripts are provider-agnostic). (Historical fallback while the limited pico batch could have been sold out: Hetzner CX23.) Ordered and **live since 2026-08-26**. Setup: `deploy/README.md`; inventory: `deploy/infrastructure.md`.
9. Product name (working title remains "Begutachtungs-Monitor").
10. Semantics of list-81 column "Engagement". **`content.status.number` resolved (23.09.2026):** it is list 101's `Status`, and 5 is *erledigt*, not *promulgated* — seven finished GP-XXVII/XXVIII Vorlagen carry status 5 and no BGBl link at all (1435, 2455, 474, 1929, 381 d.B., 80 and 87 d.B.). The vocabulary read live: `1` Einlangen im Nationalrat, `2` in Behandlung, `3` zurückverwiesen an den Ausschuss, `5` erledigt. The free text beside it (`status.description`) says which kind of erledigt — beschlossen, abgelehnt, zurückgezogen — and is read by `houseOutcomeOf` (`app/utils/spine.ts`); it is never printed, being upstream prose.
