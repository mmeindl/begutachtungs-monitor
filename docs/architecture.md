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
- `User-Agent: begutachtungs-monitor/0.1 (ziviltech-prototyp)` — identify politely.
- Current GP: from the page configuration `GET /recherchieren/gegenstaende/ministerialentwuerfe?json=True` (field `…definition.params.GP_CODE[0]`, cached 24 h), fallback constant `'XXVIII'`. Never hardcode without a fallback path.

## 3. GDPR enforcement (hard, server-side)

The API delivers full names + postal code/town of private persons. **Our
pipeline filters before anything leaves the server** — including the SSR
payload:

- `server/utils/privacy.ts`: `classifySubmitter(raw) → { kind: 'organisation'|'person'|'nonpublic', name: string|null }`.
- Rules: placeholder `Nicht-öffentliche Stellungnahme` → `nonpublic`. Org indicators (GmbH, AG, Verein, Verband, Kammer, Ministerium, Bundes-, Universität, Institut, Stadt/Gemeinde/Land, Gewerkschaft, Gesellschaft, Stiftung, Österreich, …) → `organisation` with name. Person patterns ("Lastname, Firstname", academic titles, `(postal code town)` suffix) → `person`, name **null**.
- **Safe default: when in doubt, `person`** — an organisation misclassified as a person appears as "Privatperson" (a cosmetic bug); a person misclassified as an org would publish a name (a legal risk).
- SNME detail pages (incl. full texts) are **not fetched at all** in v1. Links point to parlament.gv.at (linking ≠ republishing).
- Unit tests for the classifier are mandatory (`tests/privacy.test.ts`).

## 4. Framing rule (binding for the UI)

**Nachverfolgung, not pillory.** The accountability section is called
"Was wurde daraus?" and shows the process history neutrally to positively:
amendments after Begutachtung are **wins** and are shown just as prominently
as standstill. No blame counters, no "ignored" rhetoric, no red accusation
badges. Tone: factual, precise, no exclamation marks.

## 5. API contract (types: `shared/types.ts` — single source)

| Route | Response | Source |
|---|---|---|
| `GET /api/dashboard` | `DashboardPayload` | List 81 (current GP) |
| `GET /api/dashboard/outcomes` | `DashboardOutcomes` | Bounded fan-out over the most recently closed consultations (≤12 ME-Gegenstand + their RV leg, all through the 30-min leaf caches) + one deeper probe for the newest RV/BGBl item. Server-rendered on `/` with a 4 s timeout — measured 0.41 s fully cold, 5 ms warm, because the fan-out is parallel |
| `GET /api/consultations?gp&status&ministry&q` | `ConsultationsResponse` | List 81; `status`: `open\|closed\|all` (default `all`), `q` searches title/citation/ministry server-side |
| `GET /api/consultations/:gp/:inr` | `ConsultationDetail` | Detail JSON + list-81 row + statements summary + RV enrichment |
| `GET /api/consultations/:gp/:inr/statements` | `StatementsResponse` | List 142, GDPR-filtered, date descending; on failure the persisted last-good list with `staleAsOf` (cache rule 4), 502 only without any record |
| `GET /api/consultations/:gp/:inr/diff` | `LawDiffResponse` | The two Gesetzestext HTMLs (ME from `content.documents`, RV from `content.statements.documents`) → § units → **scoped to the laws both texts carry** → aligned → word diff; cached 24 h. `lawsOnlyInRv` / `lawsOnlyInMe` name the laws left out, with their unit counts — a Regierungsvorlage that merges several drafts would otherwise report hundreds of §§ as new (§6d). `available: false` with a German reason when no RV exists yet or a text is PDF-only (GP XXVII and earlier). `docs/ris-join.md` §6b |
| `GET /api/ris-map/:gp` (or `aktuell`) | `RisMapResponse` | RIS Begut record per ME of the GP with status/tier/score, RIS URL and document URLs, Beginn/Ende offsets (a non-zero Ende offset is a Fristabweichung). Cached 30 min on top of the 20-h corpus cache; the nightly prewarm timer calls `aktuell`. `docs/ris-join.md` §3a |
| `GET /feed.xml` | RSS 2.0 | Current GP, newest arrival first, max 50 items; deterministic output (no `Date.now()`, absolute dates in descriptions — never countdowns), ETag/304; builders in `server/utils/feeds.ts` (pure, tested) |
| `GET /kalender.ics` | iCalendar (RFC 5545) | All deadlines of the current GP as all-day transparent events; UID domain FROZEN (`@begutachtungs-monitor.at`, survives renames); DTSTAMP follows the deadline so extensions propagate through import paths; ETag/304 |

Param validation: `gp` = Roman numerals (`/^[IVXLC]+$/`), `inr` = positive integer; otherwise 400. Unknown item → 404.

Server internals (`server/utils/`):

- `parliament.ts` — upstream client (`fetchFilterList`, `fetchGegenstand`, `getCurrentGp`, cached `getConsultationsForGp`, `getStatementsForMe`, `getGegenstand`; **uncached** assembly `getConsultationDetail`).
- `budget.ts` — `withinBudget(promise, ms)`: waits at most `ms`, then answers `null` WITHOUT aborting the call, so the dropped fetch still fills its cache for the next reader. Used for the RIS join on the detail page (2 s): after a restart the RIS corpus is ~46 requests cold, and on 2026-09-07 the first detail-page hit after a deploy took 61 s in production while the prewarm unit was still running. Only for enrichment whose absence the page already handles — never for a fact the page asserts.
- `ris.ts` — RIS OGD client: full Begut corpus (paged, retries, HTTP-200 error envelope), flattened records with main-document URLs; `getRisMapForGp` joins the cached list 81 against it.
- `risJoin.ts` — **pure**: the ME↔RIS join (ruleVersion 2), regression-tested against `data/ris-me-map-gp27.json` and the GP XXVIII fixtures.
- `related.ts` — **pure**: same-title drafts (predecessor/successor) by exact equality of the normalised title tokens, evaluated on the 57 GP XXVII drafts without RV (§12.10). `parliament.ts` looks in this, the previous and — once the GP is over — the next GP, and keeps a predecessor only when it produced no RV.
- `lawText.ts` / `lawDiff.ts` — **pure**: Parliament Word-template HTML → § units (or Novellierungsanordnungen); article pairing by law name (the "Artikel n" marker is read from the heading text, not its class — the two documents disagree on the level), package scoping via `diffLawPackage`, unit alignment by heading, LCS word diff, editorial-vs-substantive rule. `lawDiffService.ts` fetches and caches around them.
- `lastgood.ts` — on-disk store for the last-good statements aggregation of one ME (one JSON record per ME, write-then-rename, versioned; read back only when the live list-142 fetch fails). State directory: `BM_STATE_DIR` → systemd `STATE_DIRECTORY` (`/var/lib/begutachtungs-monitor`) → `./.data`. Deliberately outside the app dir — `deploy.sh` rsyncs `.output/` with `--delete`.

**Cache rules (August 2026, forced by a real failure):**

1. **Cache leaves only.** Only the upstream calls themselves are cached.
   `getConsultationDetail` is a derived aggregate and stays uncached — a
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
3. **One fact, one source per response.** `ConsultationDetail` excludes
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
   (`server/utils/cacheBase.ts`), mounted `memory` in dev
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
   — `consultations-list` and `parliament-me-config` keep the answers, while
   `mapConsultationRow` and `findGpCode` sit above them in the derived layer.
   List 142 is the single call with **no cached fetch underneath**, for two
   independent reasons: its rows name private persons, so only the classified
   result may be kept (§3), and a cached raw response would hand the
   empty-list retry of rule 4 the very answer it is retrying. Nothing has to
   be deleted by hand any more.
- `mappers.ts` — rows→types. **List 81, 0-based:** 0 gp, 2 inr, 4 title, 5 citation, 6 ministry code, 7 path, 8 deadline (display), 10 arrival (ISO "Datesort"), 11 active `'J'`, 13 statement count, 14 fristsort (`yyyymmdd` → ISO; empty → null), 16 full ministry name. **List 142, 0-based:** 2 snmeInr, 4 date, 6 submitter (HTML `<a>`), 12 endorsements, 15 citation. Stage texts: strip HTML, extract + absolutize links.
- RV enrichment: last `/gegenstand/{gp}/I/{nr}` link from the stages (ME→RV is 1:n → we take the latest RV); RV JSON: `content.status.bgbllinks[]`, entry with `Abfrage=BgblAuth` (never blindly `[0]`).
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
`neutral` to `stone`; color mode and the fonts module are disabled
(light-only, system sans).

| Component | Props | Purpose |
|---|---|---|
| `AppHeader` | – | Wordmark, nav: Aktuell `/`, Begutachtungen `/begutachtungen`, Über `/ueber` |
| `AppFooter` | – | Source attribution (Parlamentsdirektion, CC BY 4.0), prototype note, GitHub placeholder |
| `StatTile` | `label: string; value: number\|string; hint?: string` | Stat tile: label sentence case without colon, value large/semibold, proportional figures, de-AT format |
| `DeadlineBadge` | `deadline: string\|null; active: boolean` | Deadline chip with text from `fristLabel()`; dot icon + status color: ≤3 days critical, ≤7 serious, otherwise neutral; expired: muted. **Color never without text** |
| `StageBar` | `arrivedAt; deadline; active; enactment; gpEnded?` | The ME→RV→BGBl track, dates/citations on reached stations; unreached ones carry a state word — `ausstehend` while the Frist runs, `bisher keine` after it, `keine – GP beendet` once the draft's Gesetzgebungsperiode is over (§12.10). State is always in text, never in dot fill alone |
| `VolumeBar` | `label: string; value: number; max: number; href?: string` | Single-color horizontal quantity bar: track `accent-wash`, fill `accent`, 8 px tall, 4 px rounded on the right/square on the left, value at the end in ink (never in the data color), `tabular-nums` in the value column |
| `MinistryBadge` | `code: string; name: string` | Ministry chip (code visible, full name as `title`/sr-only) |
| `ConsultationCard` | `consultation: ConsultationSummary` | Linked row card: title (2-line clamp), ministry, DeadlineBadge, statement count, arrival date |
| `TraceTimeline` | `steps: TraceStep[]` | Vertical process timeline: date, text, link chips |
| `DocumentList` | `documents: ConsultationDocument[]; source?: string` | Document rows: title + hint line, formats as small bordered accent tags with ↗ in two fixed columns (PDF, HTML). Tags, not buttons: buttons and chips act inside the page, accent + ↗ leaves it. Used for Entwurfsdokumente, RIS documents and Spätere Textfassungen |
| `LawDiffSection` | `gp: string; inr: number` | "Was sich nach der Begutachtung geändert hat": lazy client fetch of `/diff`; filter chips (UFieldGroup), search (UInput), one folded group per Gesetz with count pills, rows with geändert / redaktionell / neu / entfallen / unverändert and an expandable word-level diff; both sources linked with CC BY attribution; a note above the list names laws only one of the two documents carries. Anchor `#textvergleich`, linked from the outcome card |
| `StatementsPanel` | `gp: string; inr: number; summary: StatementsSummary` | Summary tiles (total/orgs/private/non-public), top organisations; full list lazy via the statements route, paginated client-side (steps of 25), persons as "Privatperson" |
| `EmptyState` | `title: string; description?: string` | Empty state |
| `ErrorState` | `title?: string; description?: string` + emit `retry` | Error state with "Erneut versuchen" |
| `LoadingState` | `label?: string` | Loading state |

## 7. Pages

- `/` **Dashboard**: mission one-liner, 4 StatTiles (open consultations, ending in ≤7 days, Stellungnahmen in the GP, Begutachtungen in the GP), "Läuft gerade" cards (deadline ascending), **"Zuletzt abgeschlossen – was wurde daraus?"** (recently closed consultations with their outcome chip, plus the newest item that reached RV/BGBl — the accountability layer on the front door), "Die meisten Stellungnahmen" as VolumeBar top 5, lastSync note. Both dashboard fetches are server-side and started together, so the outcomes section is in the SSR HTML — it is the section the page exists for, and client-only kept it out of crawls, shares and no-JS.
- `/begutachtungen` **List**: segmented control Offen/Abgeschlossen/Alle, GP select, ministry select (from the response), search field (debounced); filter state in the URL query; result counter; EmptyState.
- `/begutachtungen/[gp]/[inr]` **Detail**: header (title, citation, MinistryBadge, DeadlineBadge, arrival/deadline), short info, CTA "Stellungnahme auf parlament.gv.at abgeben" (only when active) + "Auf parlament.gv.at ansehen", draft documents, statements panel, **"Was wurde daraus?"** (TraceTimeline + enactment callout RV/BGBl + text-evolution links), source footnote. Closed without RV, the outcome card adds the measured base rate under the waiting sentence; once the draft's GP is over it leads with the boundary date instead ("Die XXVII. Gesetzgebungsperiode endete am 23.10.2024 – ohne Regierungsvorlage …", §12.10). Same-title drafts are linked in both lifecycle states: a predecessor without RV under the StageBar, a successor inside the no-RV card.
- `/ueber` **About**: mission, how it works, data source/license, GDPR stance (why no names of private persons), lineage (OffenesParlament.at), prototype status.
- `app/error.vue`: 404/500 in German, link to the home page.

Every page sets `useSeoMeta` (German `title` + `description`). Data fetching via `useFetch<Type>('/api/…')`; `pending` → LoadingState, `error` → ErrorState with `refresh()`.

## 8. Design system

Tokens in `app/assets/css/main.css` (`@theme`): surfaces `page #f9f9f7` / `surface #fcfcfb`, ink hierarchy (`ink`, `ink-secondary`, `ink-muted` — the latter darkened to `#57554f` for 7:1, since it carries real body text), hairlines, **one** accent `#2a78d6` with the full 50–950 scale from the validated sequential ramp, status colors (reserved for state, always paired with text). System sans.

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
Further AAA measures: **44-px target sizes** (global for buttons/form fields
via CSS, link chips via `min-h-11`, row links via the `-my/py` trick),
link purpose clear from the link alone (aria-labels with context, WCAG 2.4.9),
`leading-relaxed` in text blocks, `prefers-reduced-motion` respected,
focus ring 2 px accent with offset. Known AAA limits (documented, not
claimed): 3.1.5 reading level (law titles are officialese) and 3.1.4
abbreviations (citation formats like "133/ME") are only partially
achievable; a formal audit with real Austrian users is pending (§12).

Look: generous whitespace, cards = `bg-surface` + hairline border + `rounded-xl`, at most `shadow-sm`, visible `focus-visible` rings, numbers formatted de-AT, date format `24.08.2026`.

Viz rules (from the dataviz skill, binding for everything future): text never carries the data color; one series → no legend; status colors never as "series 4"; **every future multi-color categorical palette must pass `validate_palette.js`**, never by eye.

## 9. Tests

`tests/privacy.test.ts` (classifier: orgs, persons with titles/postal-code suffix, placeholder, edge cases → safe default), `tests/mappers.test.ts` (row mapping, deadline parsing, stage HTML extraction), `tests/feeds.test.ts`, `tests/deadlines.test.ts` and `tests/lastgood.test.ts` (round-trip, version/corruption/empty-record rejection, path validation, I/O failure degrades instead of throwing — point `BM_STATE_DIR` at a temp dir) with Vitest; keep the modules involved free of Nuxt auto-imports (relative imports).

## 10. Operations (v1)

`npm run dev` (local), `npm run build` → `.output/` (Node server). Hosting (settled Aug 2026, §13.8): **netcup VPS pico G11s** (1 vCPU/1 GB, Ubuntu LTS, Nuremberg, DE) — Nitro bundle as a systemd service behind Caddy (auto-TLS). Build runs locally; the self-contained `.output/` is rsynced (no toolchain on the server; bootstrap adds a 1 GB swapfile). Runbook + scripts: `deploy/`; **live since 2026-08-26** — the inventory (domain/DNS at INWX, IPs, TLS, costs) is `deploy/infrastructure.md`. The one piece of persistent state is the last-good statements store in `/var/lib/begutachtungs-monitor` (systemd `StateDirectory=`, §5 cache rule 4) — losing it costs a degraded page, never data; there is nothing to back up.

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

1. **RIS integration** (clean XML draft texts, ME↔RIS join): ~~blocked on the join-key test at corpus level~~ the join is resolved (`docs/ris-join.md`, pure implementation in `server/utils/risJoin.ts`, artefact `data/ris-me-map-gp27.json`). Still deferred: the nightly RIS fetch and wiring the RIS link into `ConsultationDetail`. Needed for the diff layer on GP XXVII and earlier (PDF-only on the Parliament side); GP XXVIII can be diffed from Parliament HTML alone.
2. **Diff layer ME→RV** (the actual accountability core): ~~needs RIS texts or parliament HTML parsing + a diff algorithm~~ **first version shipped 2026-09-08** from Parliament HTML (GP XXVIII on): `lawText.ts`, `lawDiff.ts`, `lawDiffService.ts`, `GET /api/consultations/:gp/:inr/diff`, `LawDiffSection.vue` — `docs/ris-join.md` §6b. RIS XML path for GP XXVII and earlier shipped 2026-09-08 (§6c). Erläuterungen passage dropped on evidence (§6c). Still deferred: a diff of the Erläuterungen themselves, older RIS XML variants.
3. **Deadline alerts**: ~~e-mail/RSS~~ the stateless tier shipped Aug 2026 — own RSS feed (`/feed.xml`) and ICS deadline calendar (`/kalender.ics`), both without accounts or persistence (§5). Still deferred: **e-mail subscriptions** — they need everything the stateless design avoids (SQLite for subscribers + seen-set, nightly diff job, double opt-in + one-click unsubscribe, privacy page, EU-sovereign ESP with SPF/DKIM). Planned as a grant-funded work package, not prototype work: ops-heavy alerting is what killed the predecessor.
4. **Persistence & history**: detecting deadline extensions, statement growth over time, base rates for mechanism 2 ("evidence base") — needs snapshots instead of a cache.
5. **Broadlistening (stage 2)** — only once stage 1 has users.
6. **Dark mode** (tokens are prepared), **i18n**, **a11y audit** beyond the basics, **OG images**, sitemap/robots.
7. **Monitoring/uptime alerting** — ~~the predecessor died in operation; set up before a public launch.~~ **Done (2026-09-08), deliberately minimal:** `.github/workflows/uptime.yml` probes `/` from GitHub's runners twice an hour (HTTP 200 + keyword) and keeps exactly one `downtime` issue open while the site fails, @mentioning the owner — the issue is the alert and the state, so an outage is one mail, not one per run. Off-box by construction (a monitor on the VPS would go blind with it), no third-party account, no server component. Not built, on purpose: a health endpoint (stale upstream is already labelled on the pages), a dead man's switch for the prewarm timer (a failed prewarm costs the first visitor two seconds, not an outage), a status page. Trap: GitHub disables schedules after 60 commit-free days and mails about it — `deploy/infrastructure.md`.
8. **Nightly prewarm/sync cron** instead of cache-on-demand, once traffic is real. First instance exists (Sept 2026): a systemd timer warms the RIS↔ME map (`deploy/systemd/`, installed by `deploy.sh`), because that fetch is too slow to land on a visitor.
9. **Classifier review loop**: ~~a manual org allowlist~~ the allowlist mechanism exists (`ORG_ALLOWLIST` in `server/utils/privacy.ts`, first entry: epicenter.works, Aug 2026). Still deferred: a review loop that surfaces *candidates* (e.g. hidden submitters with many endorsements) instead of finding them by accident. Note: the classifier runs inside the `statements-me` cache, which is derived and therefore memory-only (§5 cache rule 5) — a change to `classifySubmitter` shows on the next request, and nothing has to be deleted by hand.
10. **Dead-ME marker** — shipped 2026-09-08 as a *boundary* statement, not a verdict. Upstream has no status field (`vhg_fertig` = `J` everywhere, `api-exploration.md` §5.5). The page therefore states (a) that the draft's Gesetzgebungsperiode is over, with the date from the constituent-session table in `shared/utils/gp.ts` (Art. 27 B-VG: GP n ends the day before GP n+1 convenes; verified against Wikipedia's GP table and the list-81 arrival boundary), (b) the measured rarity of a late Regierungsvorlage, and (c) same-title drafts before and after (`server/utils/related.ts`; predecessor only when it produced no RV). Base rates from `scripts/rv-latency.mjs`, hand-copied into `shared/utils/outcomes.ts` (re-run when a GP closes): **GP XXVII** 353 MEs → 296 RVs (84 %), median 40 d, p90 189 d, 89.5 % within the 180-day window the copy already used; 57 without RV, 10 of them with a Frist in the GP's last six months; **4 of 61** drafts open at the GP's end got an RV in GP XXVIII, linked in the old ME's stage list. **GP XXVI** 163 → 114 (70 %), 14 of 63 carried over — under a continuing coalition the carry-over is three times as common, which is why the copy says "selten", never "nicht mehr möglich". Title matching is exact on purpose: on the 57 dead XXVII drafts it found the real re-submissions (ElWG 310/ME → 32/ME, 173/ME → 3/ME) and the re-run Begutachtungen (41/ME → 55/ME), while every fuzzy threshold added different-law pairs; a generic title ("Tierschutzgesetz, Änderung") does match its next occurrence, so the copy claims "gleichlautend" and nothing more. Still deferred: the Initiativantrag path (a draft that became law via an MPs' motion reads as "keine RV" — the stage vocabulary never links `/A/` items), a state word in the archive list (needs one detail fetch per row), per-ministry rates once persistence exists (§12.4).

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

**Built 2026-09-09** (`server/utils/lawTitles.ts`, `paraTitleService.ts`,
`/api/consultations/:gp/:inr/paragraphtitel`). Named changes went from 11,2 %
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
3. **Only for drafts, never for statements.** Draft texts and Vorblätter are
   CC-BY open data; the licence exclusion that shapes this project covers the
   *Stellungnahmen* (§13.1). Do not blur that line.

The cheap half needs neither: a curated alias per procedure
(`shared/utils/aliases.ts`) — "Bundestrojaner" appears in no official title,
so the tool was unfindable under the name the public uses.

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
| `server/utils/novao.ts` | Novellierungsanordnung → typisierte Operation |
| `server/utils/lawStructure.ts` | RIS-BrKons-Paragraph → adressierbarer Baum (§ → Abs → Z → lit) |
| `server/utils/lawApply.ts` | wendet die Operationen an, verweigert im Zweifel |
| `server/utils/risKons.ts` | Client für den geltenden Bestand (`Applikation=BrKons`) |
| `scripts/novao-corpus.ts`, `novao-forms.ts` | Anweisungskorpus ernten, Grammatikdeckung messen |
| `server/utils/applyReport.ts` | bewertet einen Lauf gegen die echte Fassung |
| `scripts/kons-harness.ts` | Prüfstand: BGBl-Anweisungen anwenden, Ergebnis vergleichen |

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
   `server/utils/applyReport.ts` mit Tests: der Teil eines Prüfstands, der ein
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
  `lawStructure.ts` kannte das Tag von Anfang an, `lawText.ts` nicht — der
  Fehler blieb unsichtbar, weil **beide Seiten des ME→RV-Vergleichs** ihn
  symmetrisch trugen. Das betrifft nicht nur die Engine, sondern den
  ausgelieferten Diff für GP XXVII und früher.
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

*Der Detektor, gemessen gegen die alten Fehler.* `server/utils/applyGuard.ts`
prüft ein Ergebnis zur Entwurfszeit auf Plausibilität — Umfang (weicht die
Textlänge um mehr als 4 Zeichen von dem ab, was die Operanden wiegen?),
Fugen, Marker im Text, unerklärte Wörter. `scripts/guard-eval.ts` spielt
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

*Die zweite Quelle: das Orakel.* `server/utils/tguOracle.ts` hält das
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

### 12.13 „Was ändert der Entwurf?" — die amtliche Gegenüberstellung auf der Seite

Geliefert 2026-09-08, und zwar aus dem amtlichen Anhang, nicht aus der
Engine: `server/utils/textComparison.ts` (Parser), `textComparisonService.ts`
(Nitro-Glue), `/api/consultations/:gp/:inr/gegenueberstellung`,
`app/components/TextComparisonSection.vue`. In GP XXVIII tragen 65 von 132
Entwürfen eine lesbare Gegenüberstellung.

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
Architektur: die Urteilslogik lag in `scripts/annex-pdf-verify.ts`, also dort,
wo sie weder getestet noch angewendet werden kann — dieselbe Lektion wie bei
`applyReport.ts`, zum zweiten Mal. Sie liegt jetzt in
`server/utils/annexCheck.ts` (rein, testbar), der Prüfstand bekommt `--xml`,
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

**Das Tor, drei Zustände.** `annexGuardService.ts` hält jeden Paragraphen
gegen RIS Bundesrecht, zum `BeginnBegutachtungsfrist` — dem Tag, an dem das
Ressort die Beilage geschrieben hat.

- **einbehalten**, wenn der geltende Text die Spalte nicht deckt. Text und
  Wortdiff werden im Server geleert, nicht in der Komponente versteckt: eine
  falsche Gegenüberstellung darf von keinem Client darstellbar sein.
- **ungeprüft**, wenn gar nicht geprüft werden konnte — ein Entwurf, der
  neues Recht schafft, hat keine Stammnorm, eine Verordnung steht nicht im
  Bundesrecht. Wird gezeigt und als ungeprüft benannt. Das zu verweigern
  hätte gesunde Arbeit weggeworfen, ohne etwas sicherer zu machen; „geprüft
  und falsch" und „nicht prüfbar" sind verschiedene Zustände.
- **auffällig** für ein Gesetz, dessen Paragraphen gehäuft abweichen: ein
  Satz für die Leserin, keine Einbehaltung. Wer 95 % Deckung über echten
  Fließtext erreicht, hat das nicht zufällig getan — bei einem abweichenden
  Stand sind also genau die unveränderten Paragraphen richtig, und ihre
  Diffs auch. Eine erste Fassung verweigerte das ganze Gesetz und behielt 59
  Paragraphen ein, die einzeln gegen RIS bestanden hatten. Ein Anteil braucht
  außerdem einen Nenner: 14 der ursprünglich 18 Markierungen betrafen
  Gesetze mit einem oder zwei geprüften Paragraphen.

Wirkung über die 126 Entwürfe mit lesbarer Beilage: 1.055 Paragraphen
geprüft, 965 bestätigt, 90 einbehalten, 584 als ungeprüft gezeigt, 8 Gesetze
markiert — und **kein gezeigter Paragraph** liegt noch unter der Schwelle.
Kalte Antwortzeit 8,3 s bei 400 Zeilen; die Sektion lädt nachgelagert.

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
Antwort, keine veraltete, und das bis zu 20 Stunden nach dem Deploy. Beide
Cache-Schlüssel tragen jetzt `CORPUS_SHAPE_VERSION`; bei jeder Formänderung
hochzählen.

## 13. Open questions

1. **Legal:** do the inline full texts (web-form Stellungnahmen) fall under the CC-BY metadata or under the full-text exclusion? (Transport format ≠ license.) Clarify before stage 2, ideally with a university partner (§ 42h UrhG).
2. ~~Join key RIS↔Parliament at corpus level~~ **Resolved (Sept 2026):** GP XXVII corpus test, 337/350 matched, 0 ambiguous, 12 without any RIS record, no one-sided extensions — `docs/ris-join.md`.
3. Is list-81 `Frist` updated on deadline extensions? (Affects future alerts and history.)
4. Multiple RVs (ME→RV 1:n): is "latest RV" enough or does the UI need all strands? **Corpus evidence 2026-09-08:** it happens — 27/ME (IFG-Anpassung BMF) has two, 134 d.B. and 129 d.B., both dated 18.06.2025, and its diff against the one we pick reports 25 laws as absent that are plausibly in the other. Until this is decided, the comparison says "in dieser Regierungsvorlage" and adds that a draft can end up in more than one — it must never read as "the law was dropped".
5. ~~Marker for dead MEs (never became an RV): watch the `vhg_fertig` field.~~ **Resolved (Sept 2026):** the field is constant across all states; the marker is the GP boundary plus measured base rates — §12.10.
6. Rate limits of the Parliament API are undocumented; behavior under load unknown. Weigh cache TTL (30 min) against freshness for tight deadlines.
7. ~~Type-filter vocabulary of list 101~~ **Resolved (Sept 2026):** `VHG`/`DOKTYP` values such as `VOLKBG`, `E`, `PET`, `BI` — `docs/volksbegehren.md` §5.1.
8. ~~Hosting~~ **Settled (Aug 2026): netcup VPS pico G11s 12M** (€1.85/month incl. 20% AT VAT — the list price €1.84 carries 19% DE VAT —, 12-month term, €0 setup, Nuremberg). EU-owned (DE) like all candidates. Decisive arithmetic: Hetzner's real no-commitment price (CX23, €7.19/month incl. VAT) means one netcup *year* ≈ three Hetzner *months* — the 12-month commitment risks at most ~€15 even if the project stops early, and the app is stateless, so a later provider move is ~30 min (scripts are provider-agnostic). (Historical fallback while the limited pico batch could have been sold out: Hetzner CX23.) Ordered and **live since 2026-08-26**. Setup: `deploy/README.md`; inventory: `deploy/infrastructure.md`.
9. Product name (working title remains "Begutachtungs-Monitor").
10. Semantics of list-81 column "Engagement" and `content.status.number` (5 = promulgated?).
