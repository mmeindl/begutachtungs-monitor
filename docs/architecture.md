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
   already held the correct 4 entries.
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
9. **Classifier review loop**: ~~a manual org allowlist~~ the allowlist mechanism exists (`ORG_ALLOWLIST` in `server/utils/privacy.ts`, first entry: epicenter.works, Aug 2026). Still deferred: a review loop that surfaces *candidates* (e.g. hidden submitters with many endorsements) instead of finding them by accident. Note: in dev, Nitro persists cached-function results to `.nuxt/cache/nitro/` across restarts — after changes to the classifier or to the diff/join code (`law-diff`, `ris-map-gp`), delete that directory, or the dev server keeps serving results of the old code for up to 24 h.
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
Abweichungen ist die Engine keine Quelle für angezeigten Gesetzestext. Die
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
