# Architecture & Decisions (v1 prototype, August 2026)

This document is blueprint **and** decision log. §12/§13 collect what was
deliberately deferred and what is still open.

## 1. Stack & foundational decisions

- **Nuxt 4** (Vue 3, TypeScript strict), **Tailwind CSS v4** (CSS-first via `@theme`), **Nuxt UI v4** for generic primitives, SSR on.
- **No persistence layer of our own in v1.** The Nitro server is a caching
  proxy in front of the Parliament API (`defineCachedFunction`, 30 min TTL,
  **no SWR** — rationale in §5). Deliberately "boring": the predecessor died
  in operation, not in construction.
- **Parliament API only in v1, no RIS.** The Parliament API covers all UI
  features (incl. draft PDFs/HTML). RIS brings clean XML texts for the later
  diff layer but hangs on the unresolved join-key risk
  (`docs/api-exploration.md` §3/§5) → deferred.
- **German, light mode only, no i18n** in v1.

## 2. Data flow

```
Browser ──> Nuxt SSR / client nav
              └─> /api/* (Nitro)
                    └─> cached upstream calls (30 min TTL, no SWR — §5)
                          ├─> POST parlament.gv.at/Filter/api/filter/data/81   (ME list per GP)
                          ├─> POST .../filter/data/142                          (Stellungnahmen per ME)
                          ├─> GET  .../gegenstand/{GP}/ME/{INR}?json=True       (detail)
                          └─> GET  .../gegenstand/{GP}/I/{NR}?json=True         (RV enrichment)
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
| `GET /api/consultations?gp&status&ministry&q` | `ConsultationsResponse` | List 81; `status`: `open\|closed\|all` (default `all`), `q` searches title/citation/ministry server-side |
| `GET /api/consultations/:gp/:inr` | `ConsultationDetail` | Detail JSON + list-81 row + statements summary + RV enrichment |
| `GET /api/consultations/:gp/:inr/statements` | `StatementsResponse` | List 142, GDPR-filtered, date descending; on failure the persisted last-good list with `staleAsOf` (cache rule 4), 502 only without any record |
| `GET /feed.xml` | RSS 2.0 | Current GP, newest arrival first, max 50 items; deterministic output (no `Date.now()`, absolute dates in descriptions — never countdowns), ETag/304; builders in `server/utils/feeds.ts` (pure, tested) |
| `GET /kalender.ics` | iCalendar (RFC 5545) | All deadlines of the current GP as all-day transparent events; UID domain FROZEN (`@begutachtungs-monitor.at`, survives renames); DTSTAMP follows the deadline so extensions propagate through import paths; ETag/304 |

Param validation: `gp` = Roman numerals (`/^[IVXLC]+$/`), `inr` = positive integer; otherwise 400. Unknown item → 404.

Server internals (`server/utils/`):

- `parliament.ts` — upstream client (`fetchFilterList`, `fetchGegenstand`, `getCurrentGp`, cached `getConsultationsForGp`, `getStatementsForMe`, `getGegenstand`; **uncached** assembly `getConsultationDetail`).
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
| `VolumeBar` | `label: string; value: number; max: number; href?: string` | Single-color horizontal quantity bar: track `accent-wash`, fill `accent`, 8 px tall, 4 px rounded on the right/square on the left, value at the end in ink (never in the data color), `tabular-nums` in the value column |
| `MinistryBadge` | `code: string; name: string` | Ministry chip (code visible, full name as `title`/sr-only) |
| `ConsultationCard` | `consultation: ConsultationSummary` | Linked row card: title (2-line clamp), ministry, DeadlineBadge, statement count, arrival date |
| `TraceTimeline` | `steps: TraceStep[]` | Vertical process timeline: date, text, link chips |
| `DocumentList` | `documents: ConsultationDocument[]` | Document rows with PDF/HTML buttons (external, `rel="noopener"`) |
| `StatementsPanel` | `gp: string; inr: number; summary: StatementsSummary` | Summary tiles (total/orgs/private/non-public), top organisations; full list lazy via the statements route, paginated client-side (steps of 25), persons as "Privatperson" |
| `EmptyState` | `title: string; description?: string` | Empty state |
| `ErrorState` | `title?: string; description?: string` + emit `retry` | Error state with "Erneut versuchen" |
| `LoadingState` | `label?: string` | Loading state |

## 7. Pages

- `/` **Dashboard**: mission one-liner, 4 StatTiles (open consultations, ending in ≤7 days, Stellungnahmen in the GP, Begutachtungen in the GP), "Läuft gerade" cards (deadline ascending), "Die meisten Stellungnahmen" as VolumeBar top 5, lastSync note.
- `/begutachtungen` **List**: segmented control Offen/Abgeschlossen/Alle, GP select, ministry select (from the response), search field (debounced); filter state in the URL query; result counter; EmptyState.
- `/begutachtungen/[gp]/[inr]` **Detail**: header (title, citation, MinistryBadge, DeadlineBadge, arrival/deadline), short info, CTA "Stellungnahme auf parlament.gv.at abgeben" (only when active) + "Auf parlament.gv.at ansehen", draft documents, statements panel, **"Was wurde daraus?"** (TraceTimeline + enactment callout RV/BGBl + text-evolution links), source footnote.
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

1. **RIS integration** (clean XML draft texts, ME↔RIS join): blocked on the join-key test at corpus level; needed for the diff layer ("§5 was amended").
2. **Diff layer ME→RV** (the actual accountability core): needs RIS texts or parliament HTML parsing + a diff algorithm. v1 shows the chain + text-version links.
3. **Deadline alerts**: ~~e-mail/RSS~~ the stateless tier shipped Aug 2026 — own RSS feed (`/feed.xml`) and ICS deadline calendar (`/kalender.ics`), both without accounts or persistence (§5). Still deferred: **e-mail subscriptions** — they need everything the stateless design avoids (SQLite for subscribers + seen-set, nightly diff job, double opt-in + one-click unsubscribe, privacy page, EU-sovereign ESP with SPF/DKIM). Planned as an NLnet work package, not prototype work: ops-heavy alerting is what killed the predecessor.
4. **Persistence & history**: detecting deadline extensions, statement growth over time, base rates for mechanism 2 ("evidence base") — needs snapshots instead of a cache.
5. **Broadlistening (stage 2)** — only once stage 1 has users.
6. **Dark mode** (tokens are prepared), **i18n**, **a11y audit** beyond the basics, **OG images**, sitemap/robots.
7. **Monitoring/uptime alerting** — the predecessor died in operation; set up before a public launch.
8. **Nightly prewarm/sync cron** instead of cache-on-demand, once traffic is real.
9. **Classifier review loop**: ~~a manual org allowlist~~ the allowlist mechanism exists (`ORG_ALLOWLIST` in `server/utils/privacy.ts`, first entry: epicenter.works, Aug 2026). Still deferred: a review loop that surfaces *candidates* (e.g. hidden submitters with many endorsements) instead of finding them by accident. Note: in dev, Nitro persists cached-function results to `.nuxt/cache/nitro/` across restarts — after classifier changes, delete that directory.

## 13. Open questions

1. **Legal:** do the inline full texts (web-form Stellungnahmen) fall under the CC-BY metadata or under the full-text exclusion? (Transport format ≠ license.) Clarify before stage 2, ideally with a university partner (§ 42h UrhG).
2. **Join key RIS↔Parliament at corpus level** (deadline extension one-sided? consultations without a parliament counterpart?) — batch test across a whole GP.
3. Is list-81 `Frist` updated on deadline extensions? (Affects future alerts and history.)
4. Multiple RVs (ME→RV 1:n): is "latest RV" enough or does the UI need all strands?
5. Marker for dead MEs (never became an RV): watch the `vhg_fertig` field.
6. Rate limits of the Parliament API are undocumented; behavior under load unknown. Weigh cache TTL (30 min) against freshness for tight deadlines.
7. Type-filter vocabulary of list 101 (low priority, the `preconst` route bypasses it).
8. ~~Hosting~~ **Settled (Aug 2026): netcup VPS pico G11s 12M** (€1.85/month incl. 20% AT VAT — the list price €1.84 carries 19% DE VAT —, 12-month term, €0 setup, Nuremberg). EU-owned (DE) like all candidates. Decisive arithmetic: Hetzner's real no-commitment price (CX23, €7.19/month incl. VAT) means one netcup *year* ≈ three Hetzner *months* — the 12-month commitment risks at most ~€15 even if the project stops early, and the app is stateless, so a later provider move is ~30 min (scripts are provider-agnostic). (Historical fallback while the limited pico batch could have been sold out: Hetzner CX23.) Ordered and **live since 2026-08-26**. Setup: `deploy/README.md`; inventory: `deploy/infrastructure.md`.
9. Product name (working title remains "Begutachtungs-Monitor").
10. Semantics of list-81 column "Engagement" and `content.status.number` (5 = promulgated?).
