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

- `server/utils/privacy.ts`: `classifySubmitter(raw, upstreamFlag?) → { kind: 'organisation'|'person'|'nonpublic', name: string|null }`.
- Rules: placeholder `Nicht-öffentliche Stellungnahme` → `nonpublic`. Org indicators (GmbH, AG, Verein, Verband, Kammer, Ministerium, Bundes-, Universität, Institut, Stadt/Gemeinde/Land, Gewerkschaft, Gesellschaft, Stiftung, Österreich, …) → `organisation` with name. Person patterns ("Lastname, Firstname", academic titles, `(postal code town)` suffix) → `person`, name **null**.
- **Safe default: when in doubt, `person`** — an organisation misclassified as a person appears as "Privatperson" (a cosmetic bug); a person misclassified as an org would publish a name (a legal risk).
- **The naming segment decides (2026-09-15).** "Lastname, Firstname; Universität Salzburg" is a person with an affiliation, not an organisation — but the affiliation's keyword used to win, and the row was published whole: 239 rows in GP XXVII, 2 in GP XXVIII (`scripts/classifier-audit.ts`). `leadsWithPersonName` in `privacy.ts` now checks the segment before the first semicolon (or the first two comma parts, or the left of a single comma when the right carries the org signal) before any organisation rule runs, legal forms included. Price: a brand-style organisation filing as "Name Name; Abteilung" stays hidden like any other name the heuristic cannot place; the corpus comparison found four such in GP XXVII and each got a pattern or an allowlist entry.
- **A second oracle: list 142's own `TYP` flag (2026-09-16).** Column 19 carries `I` (institution) or `P` (person) on 100 % of rows — measured over 106,626 across GP XXVIII/ME, GP XXVII/ME and the RV Stellungnahmen; it agrees with the name heuristic on 96.8 / 99.7 / 94.2 %. It records **how the submitter registered**, not what the name denotes, which is why it sees the one class a name rule structurally cannot: a person standing *behind* an org-shaped naming segment ("Windland Energieerzeugungs GmbH; <Vorname Nachname>", "i.A. <Nachname>, <Verband>"). `leadsWithPersonName` inspects the segment before the first semicolon and looks straight past those. **It may only ever veto, never authorise:** `P` suppresses a name the string alone would publish; `I` changes nothing by itself, because publishing on an undocumented upstream column would hand it the hard invariant — one silent flip and the site republishes names. The `I` disagreements are printed by `scripts/classifier-audit.ts` as list 3, a review queue; `ORG_ALLOWLIST` is what publishes one, by hand, and therefore outranks the flag. Orthogonal to `nonpublic` (902 non-public rows are `P`, 13 are `I`), so the placeholder string stays the only truth there. Column 19 is asserted in `listHeaders.ts` by its `feld_name` (`TYP`; its `label` is literally `"?"`), so a move fails loudly. Adoption cost across all three corpora: **0 names newly published**, 5 + 24 + 0 rows no longer published — of the 29, roughly sixteen named a real person. `docs/api-exploration.md` §4 carries the numbers.
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

## 5. API contract (types: `shared/types.ts` — single source)

| Route | Response | Source |
|---|---|---|
| `GET /api/dashboard` | `DashboardPayload` | List 81 (current GP) |
| `GET /api/dashboard/outcomes` | `DashboardOutcomes` | Bounded fan-out over the most recently closed consultations (≤12 ME-Gegenstand + their RV leg, all through the 30-min leaf caches) + one deeper probe for the newest RV/BGBl item. Server-rendered on `/` with a 4 s timeout — measured 0.41 s fully cold, 5 ms warm, because the fan-out is parallel |
| `GET /api/drafts?gp&status&ministry&q` | `DraftsResponse` | List 81; `status`: `open\|closed\|all` (default `all`), `q` searches title/citation/ministry server-side |
| `GET /api/drafts/:gp/:inr` | `DraftDetail` | Detail JSON + list-81 row + statements summary + RV enrichment |
| `GET /api/drafts/:gp/:inr/statements` | `StatementsResponse` | List 142, GDPR-filtered, date descending; on failure the persisted last-good list with `staleAsOf` (cache rule 4), 502 only without any record |
| `GET /api/drafts/:gp/:inr/diff` | `LawDiffResponse` | The two Gesetzestext HTMLs (ME from `content.documents`, RV from `content.statements.documents`) → § units → **scoped to the laws both texts carry** → aligned → word diff; cached 24 h. `lawsOnlyInRv` / `lawsOnlyInMe` name the laws left out, with their unit counts — a Regierungsvorlage that merges several drafts would otherwise report hundreds of §§ as new (§6d). `available: false` with a German reason when no RV exists yet or a text is PDF-only (GP XXVII and earlier). `docs/ris-join.md` §6b |
| `GET /api/ris-map/:gp` (or `aktuell`) | `RisMapResponse` | RIS Begut record per ME of the GP with status/tier/score, RIS URL and document URLs, Beginn/Ende offsets (a non-zero Ende offset is a Fristabweichung). Cached 30 min on top of the 20-h corpus cache; the nightly prewarm timer calls `aktuell`. `docs/ris-join.md` §3a |
| `GET /feed.xml` | RSS 2.0 | Current GP, newest arrival first, max 50 items; deterministic output (no `Date.now()`, absolute dates in descriptions — never countdowns), ETag/304; builders in `server/utils/feeds.ts` (pure, tested) |
| `GET /kalender.ics` | iCalendar (RFC 5545) | All deadlines of the current GP as all-day transparent events; UID domain FROZEN (`@begutachtungs-monitor.at`, survives renames); DTSTAMP follows the deadline so extensions propagate through import paths; ETag/304 |

Param validation: `gp` = Roman numerals (`/^[IVXLC]+$/`), `inr` = positive integer; otherwise 400. Unknown item → 404.

Server internals (`server/utils/`):

- `parliament.ts` — upstream client (`fetchFilterList`, `fetchGegenstand`, `getCurrentGp`, cached `getDraftsForGp`, `getStatementsForMe`, `getGegenstand`; **uncached** assembly `getDraftDetail`).
- `budget.ts` — `withinBudget(promise, ms)`: waits at most `ms`, then answers `null` WITHOUT aborting the call, so the dropped fetch still fills its cache for the next reader. Used for the RIS join on the detail page (2 s): after a restart the RIS corpus is ~46 requests cold, and on 2026-09-07 the first detail-page hit after a deploy took 61 s in production while the prewarm unit was still running. Only for enrichment whose absence the page already handles — never for a fact the page asserts.
- `ris.ts` — RIS OGD client: full Begut corpus (paged, retries, HTTP-200 error envelope), flattened records with main-document URLs; `getRisMapForGp` joins the cached list 81 against it.
- `risJoin.ts` — **pure**: the ME↔RIS join (ruleVersion 2), regression-tested against `data/ris-me-map-gp27.json` and the GP XXVIII fixtures.
- `related.ts` — **pure**: same-title drafts (predecessor/successor) by exact equality of the normalised title tokens, evaluated on the 57 GP XXVII drafts without RV (§12.10). `parliament.ts` looks in this, the previous and — once the GP is over — the next GP, and keeps a predecessor only when it produced no RV.
- `lawText.ts` / `lawDiff.ts` — **pure**: Parliament Word-template HTML → § units (or Novellierungsanordnungen); article pairing by law name (the "Artikel n" marker is read from the heading text, not its class — the two documents disagree on the level), package scoping via `diffLawPackage`, unit alignment by heading, LCS word diff, editorial-vs-substantive rule. `lawDiffService.ts` fetches and caches around them.
- `lastgood.ts` — on-disk store for the last-good statements aggregation of one ME (one JSON record per ME, write-then-rename, versioned; read back only when the live list-142 fetch fails). State directory: `BM_STATE_DIR` → systemd `STATE_DIRECTORY` (`/var/lib/begutachtungs-monitor`) → `./.data`. Deliberately outside the app dir — `deploy.sh` rsyncs `.output/` with `--delete`.

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
   — `drafts-list` and `parliament-me-config` keep the answers, while
   `mapDraftRow` and `findGpCode` sit above them in the derived layer.
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
| `AppHeader` | – | Wordmark, nav: Aktuell `/`, Begutachtungen `/entwuerfe`, Über `/ueber` |
| `AppFooter` | – | Source attribution (Parlamentsdirektion **and** RIS des Bundes — both licensors are named because CC BY binds for part of the data), link to the per-source licence list in the Impressum, "kein amtliches Angebot", source code, contact, Impressum/Datenschutz |
| `StatTile` | `label: string; value: number\|string; hint?: string` | Stat tile: label sentence case without colon, value large/semibold, proportional figures, de-AT format |
| `DeadlineBadge` | `deadline: string\|null; active: boolean` | Deadline chip with text from `fristLabel()`; dot icon + status color: ≤3 days critical, ≤7 serious, otherwise neutral; expired: muted. **Color never without text** |
| `StageBar` | `arrivedAt; deadline; active; enactment; gpEnded?` | The ME→RV→BGBl track, dates/citations on reached stations; unreached ones carry a state word — `ausstehend` while the Frist runs, `bisher keine` after it, `keine – GP beendet` once the draft's Gesetzgebungsperiode is over (§12.10). State is always in text, never in dot fill alone |
| `VolumeBar` | `label: string; value: number; max: number; href?: string` | Single-color horizontal quantity bar: track `accent-wash`, fill `accent`, 8 px tall, 4 px rounded on the right/square on the left, value at the end in ink (never in the data color), `tabular-nums` in the value column |
| `MinistryBadge` | `code: string; name: string` | Ministry chip (code visible, full name as `title`/sr-only) |
| `DraftCard` | `draft: DraftSummary` | Linked row card: title (2-line clamp), ministry, DeadlineBadge, statement count, arrival date |
| `TraceTimeline` | `steps: TraceStep[]` | Vertical process timeline: date, text, link chips |
| `DocumentList` | `documents: DraftDocument[]; source?: string` | Document rows: title + hint line, formats as small bordered accent tags with ↗ in two fixed columns (PDF, HTML). Tags, not buttons: buttons and chips act inside the page, accent + ↗ leaves it. Used for Entwurfsdokumente, RIS documents and Spätere Textfassungen |
| `LawDiffSection` | `gp: string; inr: number` | "Was sich nach der Begutachtung geändert hat": lazy client fetch of `/diff`; filter chips (UFieldGroup), search (UInput), one folded group per Gesetz with count pills, rows with geändert / redaktionell / neu / entfallen / unverändert and an expandable word-level diff; both sources linked, without a licence label — the Regierungsvorlage is a licensed dataset, the Ministerialentwurf belongs to the excluded Begutachtungsverfahren, so one line cannot cover both (§13.1); a note above the list names laws only one of the two documents carries. Anchor `#textvergleich`, linked from the outcome card |
| `StatementsPanel` | `gp: string; inr: number; summary: StatementsSummary` | Summary tiles (total/orgs/private/non-public), top organisations; full list lazy via the statements route, paginated client-side (`ListMore`, steps of 10), organisation search above 20 rows, persons as "Privatperson" |
| `ListMore` | `visible: number; total: number; step: number; allAbove?: number` | Foot of a client-paginated list: "10 von 42 angezeigt" as the live region, the step button, and "Alle N anzeigen" above `allAbove` remaining |
| `EmptyState` | `title: string; description?: string` | Empty state |
| `ErrorState` | `title?: string; description?: string` + emit `retry` | Error state with "Erneut versuchen" |
| `LoadingState` | `label?: string` | Loading state |

## 7. Pages

- `/` **Dashboard**: mission one-liner, 4 StatTiles (open consultations, ending in ≤7 days, Stellungnahmen in the GP, Begutachtungen in the GP), "Jetzt in Begutachtung" cards (deadline ascending), **"Zweite Runde: Stellungnahme im Nationalrat möglich"** (the Regierungsvorlagen still taking Stellungnahmen — client-side and lazy, hidden when empty), **"Zuletzt abgeschlossen – was wurde daraus?"** (recently closed consultations with their outcome chip, plus the newest item that reached RV/BGBl — the accountability layer on the front door), "Die meisten Stellungnahmen" as VolumeBar top 5, lastSync note. Both dashboard fetches are server-side and started together, so the outcomes section is in the SSR HTML — it is the section the page exists for, and client-only kept it out of crawls, shares and no-JS.
- `/entwuerfe` **List**: segmented control Offen/Abgeschlossen/Alle, GP select, ministry select (from the response), search field (debounced); filter state in the URL query; result counter; EmptyState.
- `/entwuerfe/[gp]/[inr]` **Detail**: header (title, citation, MinistryBadge, DeadlineBadge, arrival/deadline), short info, CTA "Stellungnahme auf parlament.gv.at abgeben" (only when active) + "Auf parlament.gv.at ansehen", draft documents, statements panel, **"Was wurde daraus?"** (TraceTimeline + enactment callout RV/BGBl + text-evolution links), source footnote. Closed without RV, the outcome card adds the measured base rate under the waiting sentence; once the draft's GP is over it leads with the boundary date instead ("Die XXVII. Gesetzgebungsperiode endete am 23.10.2024 – ohne Regierungsvorlage …", §12.10). Same-title drafts are linked in both lifecycle states: a predecessor without RV under the StageBar, a successor inside the no-RV card.
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

Vitest, 27 files, ~650 cases, no network and no Nitro: everything under test is
a pure module with relative imports, which is why the modules are cut that way
in the first place. `pnpm test` runs in under a second, `pnpm typecheck` covers
app/server/`shared`, and `pnpm typecheck:tools` covers `scripts/` and `tests/`
(`tsconfig.tools.json`) — the half that `nuxt typecheck` does not see and that
the log below blames twice for shipped bugs. All three run in CI on every push
(`.github/workflows/ci.yml`).

- **Upstream → our types:** `mappers` (entity decoding, row mapping, deadline
  parsing, stage HTML), `privacy` (classifier: orgs, persons with
  titles/postal-code suffix, placeholder, edge cases → safe default), `gp`
  (Roman numerals), `related`, `aliases`, `budget`, `deadlines`, `outcomes`
  (the base rates quoted in the UI), `feeds` (RSS/ICS escaping), `lastgood`
  (round-trip, version/corruption/empty-record rejection, path validation, I/O
  failure degrades instead of throwing — point `BM_STATE_DIR` at a temp dir),
  `cacheLayers` (every cached function declares its layer, §5).
- **RIS join and the ME→RV diff:** `risJoin` (title normalisation, tiers),
  `lawDiff`, `lawTitles`, `lawPackage`.
- **Amendment engine (§12.12):** `novao` (instruction parsing), `lawApply`,
  `applyGuard`, `applyReport`, `tguOracle`.
- **Textgegenüberstellung (§12.13):** `textComparison` (the XML table),
  `annexPdf` (page geometry), `annexBoundaries` (which heading opens a law),
  `annexCheck` (the gate), `annexGolden`.

`annexGolden` is the only one that is not synthetic, and deliberately: two real
RIS documents are checked in verbatim (CC-BY 4.0) because synthetic fixtures
only ever contain what was already understood. `annex-vkrg.xml` is the
Textgegenüberstellung of the Verbraucherkreditrechts-Änderungsgesetz 2026 — a
five-Artikel package whose Anhang splits its columns differently from its own
header — and `annex-uwg-pages.json` is the page geometry of the UWG-Novelle,
whose pages are turned a quarter turn (the geometry rather than the PDF, so the
test needs no pdf.js).

Four invariants hold over every parse, whichever document and whichever path:
no elided row carries a change, no row shown as a change lacks a designation, a
word diff exists exactly where two sides differ and both carry text, and no row
claims a change it cannot show. Four more hold over the gate and are checked
against the whole corpus by `scripts/annex-pdf-verify.ts` (`runGate`), all of
them on nil: no row delivered as `verified` without a confirmed verdict, no §
missing from the verdict map, no withheld row still carrying text, and no
withheld § without a recorded cause — otherwise the split the page prints
would not sum to the total beside it.

The corpus can only ever report what the ressorts happen to have got wrong, so
`scripts/annex-fault-injection.ts` measures the gate from the other side: it
breaks §§ the gate has just confirmed — a sentence dropped from the left
column, another §'s standing text or its proposed text appended to the right
one — and prints what each rule catches, beside the false alarms the same
rules produce on the untouched corpus. Those false alarms are the two
right-column withholdings of `annex-pdf-verify.ts` over the same population,
so the two harnesses cross-check each other, and the reach `annexCheck.ts`
states is the number this one prints. It exists because that number was
measured once in a scratch file, and a claim whose instrument is gone is a
claim nobody can re-check (§12.13).

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

1. **RIS integration** (clean XML draft texts, ME↔RIS join): ~~blocked on the join-key test at corpus level~~ the join is resolved (`docs/ris-join.md`, pure implementation in `server/utils/risJoin.ts`, artefact `data/ris-me-map-gp27.json`). Still deferred: the nightly RIS fetch and wiring the RIS link into `DraftDetail`. Needed for the diff layer on GP XXVII and earlier (PDF-only on the Parliament side); GP XXVIII can be diffed from Parliament HTML alone.
2. **Diff layer ME→RV** (the actual accountability core): ~~needs RIS texts or parliament HTML parsing + a diff algorithm~~ **first version shipped 2026-09-08** from Parliament HTML (GP XXVIII on): `lawText.ts`, `lawDiff.ts`, `lawDiffService.ts`, `GET /api/drafts/:gp/:inr/diff`, `LawDiffSection.vue` — `docs/ris-join.md` §6b. RIS XML path for GP XXVII and earlier shipped 2026-09-08 (§6c). Erläuterungen passage dropped on evidence (§6c). Still deferred: a diff of the Erläuterungen themselves, older RIS XML variants.
3. **Deadline alerts**: ~~e-mail/RSS~~ the stateless tier shipped Aug 2026 — own RSS feed (`/feed.xml`) and ICS deadline calendar (`/kalender.ics`), both without accounts or persistence (§5). Still deferred: **e-mail subscriptions** — they need everything the stateless design avoids (SQLite for subscribers + seen-set, nightly diff job, double opt-in + one-click unsubscribe, privacy page, EU-sovereign ESP with SPF/DKIM). Planned as a grant-funded work package, not prototype work: ops-heavy alerting is what killed the predecessor.
4. **Persistence & history**: detecting deadline extensions, statement growth over time, base rates for mechanism 2 ("evidence base") — needs snapshots instead of a cache.
5. **Broadlistening (stage 2)** — only once stage 1 has users.
6. **Dark mode** (tokens are prepared), **i18n**, **a11y audit** beyond the basics, **OG images**, sitemap/robots.
7. **Monitoring/uptime alerting** — ~~the predecessor died in operation; set up before a public launch.~~ **Done (2026-09-08), deliberately minimal:** `.github/workflows/uptime.yml` probes `/` from GitHub's runners twice an hour (HTTP 200 + keyword) and keeps exactly one `downtime` issue open while the site fails, @mentioning the owner — the issue is the alert and the state, so an outage is one mail, not one per run. Off-box by construction (a monitor on the VPS would go blind with it), no third-party account, no server component. Not built, on purpose: a health endpoint (stale upstream is already labelled on the pages), a dead man's switch for the prewarm timer (a failed prewarm costs the first visitor two seconds, not an outage), a status page. Trap: GitHub disables schedules after 60 commit-free days and mails about it — `deploy/infrastructure.md`. **Data canary since 2026-09-15:** the same run then loads `/entwuerfe/XXVIII/8` and requires the Österreichischer Rechtsanwaltskammertag among its Stellungnahmen. The name is in the SSR HTML only if list 142 was read, its columns sit where `mapStatementRow` expects them and the classifier recognised the row — the one failure the start-page probe cannot see is the silent one, where every submitter degrades to "Privatperson" and the site looks healthy. An upstream outage does not trip it: the page serves its last-good aggregation, name included, and labels the staleness itself.
8. **Nightly prewarm/sync cron** instead of cache-on-demand, once traffic is real. First instance exists (Sept 2026): a systemd timer warms the RIS↔ME map (`deploy/systemd/`, installed by `deploy.sh`), because that fetch is too slow to land on a visitor.
9. **Classifier review loop** — ~~a manual org allowlist~~ ~~a review loop that surfaces candidates~~ **Done (2026-09-15):** `scripts/classifier-audit.ts` (`pnpm audit:classifier -- --gp XXVIII`, `--ityp I` for the Regierungsvorlagen, `--inr` for one item) runs the classifier over a GP's list-142 rows and prints the two error classes: institutions filed as "person" (in full — candidates for a pattern or `ORG_ALLOWLIST`, each to be verified before it is added) and organisations whose naming segment is shaped like a person (masked — those are leaks). What the first run found, and what became of it: 334+ hidden rows led by the ministries' short form "BM f. …" (221), courts, the Datenschutzbehörde, the FMA, the Anwaltschaften, brand-style NGOs → patterns, checked against the comma-form persons of the corpus (zero hits each); ÖGB/ÖAMTC/SPÖ/ARBÖ hidden by JavaScript's ASCII-only `\b` before "Ö" → lookarounds; and the leak class (§3) → `leadsWithPersonName`. Occasion: a reader reported one hidden organisation (Presseclub Concordia); the audit showed it was a class. Re-run when a GP closes or a reader reports the next one. The classifier still runs inside the derived `statements-me` cache (memory-only, §5 cache rule 5), so a change shows on the next request and nothing has to be deleted by hand.
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
Engine: `server/utils/textComparison.ts` (Parser der XML-Tabelle),
`annexPdf.ts` (Seitengeometrie), `annexCheck.ts` (das Tor),
`annexDraft.ts` (welche Paragraphen eine Novellierungsanordnung adressiert —
der Bezug von Regel 2), `textComparisonService.ts` (Nitro-Glue),
`/api/drafts/:gp/:inr/gegenueberstellung`,
`app/components/TextComparisonSection.vue`. In GP XXVIII zeigt die Seite die
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

Die Urteilslogik liegt jetzt vollständig in `annexCheck.ts`: `verifyAnnex`
gibt eine Urteilstabelle je Paragraph zurück statt zweier Listen, und
`checkAnnexRows` setzt sie auf die Zeilen. Beide sind rein und getestet, der
Service macht nur noch I/O. Der Prüfstand ruft dieselben zwei Funktionen auf
(`annex-pdf-verify.ts`, `runGate`) und prüft drei Zusicherungen über den
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
den Parlaments-Anhang ist eigene Arbeit (`TODO.md`), die Zeile verlinkt ihn.
Der Aufruf passiert nur in diesen Zweigen, also für rund 20 der 132 Entwürfe,
und er fängt keine Fehler — dieselbe Regel wie oben.

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
innerhalb derselben Einheit —, `annexCheck.draftBags` baut daraus die Säcke.
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

Was das kostet und bringt, beide Pfade, mit `scripts/annex-fault-injection.ts`
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
  unten über `lawText.stripMarkup`).
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
Unterscheidung liegt jetzt an einer Stelle (`lawText.stripMarkup`): ein
Blocktag ist eine Wortgrenze, ein Auszeichnungstag nicht. Sie **musste**
geteilt werden — der Vergleich hat drei Seiten (Beilage, geltender Text aus
dem RIS, Gesetzestext des Entwurfs), und eine Regel auf nur einer davon baut
genau die Asymmetrie wieder auf, gegen die `ANNOTATION_RE` existiert. Der
geltende Text las übrigens nie über `lawText`, sondern über eine zweite
Kopie derselben Zeile in `lawStructure.ts`; das war der Grund, warum die
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
diesen Fall auflöste; sie ist am Korpus zu messen, bevor sie geschrieben wird,
und sie steht in `TODO.md`, nicht hier. Solange es sie nicht gibt, tut das Tor
genau das Richtige: § 13 wird einbehalten, der Text erreicht die Leserin nicht
als neues Recht, und der Grund, den die Seite nennt, stimmt.

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
(`annexCheck.isDisplayedChange`): `changed` und `removed`, ohne Auslassungen.
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
`lawStructure.plainText` den Absatz mit seiner Aufzählung und ließ den Satz
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
Zeile, nur der Paragraph zieht um, also genau `heldHeadings` von d6c47ea eine
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
d6c47ea hat für sich festgehalten, dass keine verlorenging. Eigener Schritt,
eigene Messung. Dieselbe Klasse zeigt sich auf der unveränderten Seite
harmlos: 35 der 507 Zeilen sind Titelzeilen, die jetzt zur Überschrift des
ersten Paragraphen ihres Gesetzes werden, und 15 davon sind Feldnamen der
RIS-Webansicht („Text" 9-mal, „Präambel/Promulgationsklausel" 2-mal, „Beachte
für folgende Bestimmung" 2-mal, „Langtitel", „Gesamte Rechtsvorschrift für
…"). Als Überschrift gedruckt sind sie Zierrat statt Recht, aber sie standen
vorher als Zeile in der Beilage und stehen in keinem Sack der Prüfung.

Bis dahin wird der blinde Fleck **benannt statt geschlossen**, und zwar mit
Zahlen, die jeder Lauf neu erzeugt. `annex-fault-injection.ts` hat dafür einen
vierten Fehler **U**: eine zusätzliche Zeile mit dem geltenden Text eines
*anderen* Paragraphen, in beiden Spalten gleich. Das Tor fängt **0 von 238**
auf dem Tabellenpfad und **0 von 883** auf dem PDF-Pfad — jede Meldung unter
der Injektion feuerte schon ohne sie —, und das ist keine Überraschung,
sondern Bauart: die linke Prüfung liest nur gezeigte Änderungen, beide
Regeln der rechten Spalte nur Eingefügtes. `annex-pdf-verify.ts` druckt
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
`lawStructure.ts` las nur den neuen und beendete damit jene 402 Paragraphen mit
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
`droppedPages` 0, der Prüfstand der Änderungsmaschine (`kons-harness.ts`,
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

**Dieselbe Lücke stand in `lawText.parseRisXml`** (geschlossen 12.09.2026), das die andere
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
aufgehoben durch …)"); `lawStructure.ts` entfernt sie auf der RIS-Seite, und
`annexCheck.ts` tat es mit demselben Muster auf der Spaltenseite. Über den
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

*Gemessen* (`annex-pdf-verify.ts --xml`, GP XXVIII): Tabellenpfad
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
nicht die Regel: `lawTitles.draftArticles` liest in diesem Entwurf eine
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
Ursache in `lawTitles.ts`, nicht in `designationKey`.

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
ist jede Überschrift Zitat** (11.09.2026, `lawTitles.draftArticles` und
`lawText.segmentUnits`). Ordnet ein Entwurf eine Anlage, ein Kapitel oder
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

*Gemessen* (`annex-pdf-verify.ts --xml`, GP XXVIII): Tabellenpfad
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

**Der Drift-Alarm (16.09.2026).** Die Engine bricht nicht daran, dass wir sie
ändern — dafür gibt es 600+ Tests und `annexGolden.test.ts`, das zwei echte
Beilagen samt ihren Zahlen einfriert. Sie bricht daran, dass ein Ressort seine
Beilage anders setzt als bisher, und zwar lautlos: die Seite zeigt dann eine
Gegenüberstellung, die niemand als falsch erkennt, weil niemand hinsieht.
Nichts lief den Prüfstand je von selbst. `.github/workflows/annex-drift.yml`
misst jetzt wöchentlich beide Pfade und macht aus einem Befund ein Issue —
dieselbe Mechanik wie `uptime.yml` (ein Issue, beim nächsten sauberen Lauf
geschlossen), auf GitHubs Runnern und nicht als Dienst auf dem VPS.

**Klasse A ist das, was ohne Grundlinie feststeht** (`scripts/annex-report.ts`,
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
(`annex-drift.ts --grundlinie-schreiben=…`). Sonst ist der nächste Lauf ein
Befund über eine Verbesserung, und nach dem dritten Mal liest niemand mehr hin
— das ist die Art, wie ein Alarm stirbt, und sie ist häufiger als der Ausfall,
gegen den er gebaut wurde.

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
above `RV_STATEMENTS_CAP` (5,000) only the count travels — the COVID-era
Vorlagen carry tens of thousands (1289 d.B.: 41,376), ten megabytes of names
for one line. No last-good fallback: a failed fetch costs a line, not the
page. Not built: the anonymous rows as a list, and the Ausschuss's answer to
this input (that is the parliament comparison, §12.2).

**The door follows the open window (2026-09-15, same day).** The head card
that holds the Frist and the "Stellungnahme abgeben" button used to exist
only while the Frist ran. Now it shows every window that is open: the
Begutachtung while its Frist runs, the Vorlage while parliament takes
Stellungnahmen on it (upstream's `statementsstate` on the RV's detail JSON,
read from the payload the BGBl link already comes from — `enactment.filingOpen`,
gated on the GP still running), and both when both are. Both is not a
corner case: in GP XXVIII 7 of 91 Regierungsvorlagen arrived before the
draft's Frist had ended, median lead 14 days (GP XXVII: 1 of 296,
`scripts/rv-latency.mjs`). Then the parliamentary window is arguably the one
that still matters — the government has fixed its text, only the Ausschuss
can change it — so neither door hides the other; the card states the
overlap as a sequence of facts ("liegt bereits im Nationalrat, obwohl die
Frist noch läuft"), never as a verdict. The Vorlage has no published
deadline, so its door says so and offers no calendar entry. The RV block in
the section carries the same fact as one sentence with a link, not a second
button.

**The document link.** The row's citation leads to the Stellungnahme's page
upstream; a journalist working through fifty organisations' submissions
asked for the PDF itself. The PDF's URL is not in the list row and needs one
detail call per Stellungnahme, so a page of 700 rows must not fetch it in
advance. Each row therefore links our redirect
(`/api/stellungnahmen/{gp}/{SNME|SN}/{inr}/dokument`, `statementDocument.ts`),
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
that is the classifier's safe default. `listHeaders.ts` now holds the
header of lists 81 and 142 against the columns we read, at fetch time and
before anything is cached; a mismatch is a 502 naming the column, the
last-good store serves the previous aggregation with its staleness visible.
Only the columns we read are asserted (appended columns shift nothing);
identity is `feld_name` where the API gives one and the display label
otherwise. The uptime workflow's data canary (§12.7) is the same guard from
the outside.

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
(`mappers.ts`): die entscheidet über Dubletten und darf unabhängig davon
driften.

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

`pnpm audit:verordnungen` läuft über den ganzen Begut-Korpus durch den
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
ein Versprechen, keine Karte. Die verfolgte Fassung steht als eigener Punkt
in `TODO.md`.

#### Dieselbe Anatomie wie die Entwurfsseite

Nach dem Vergleich beider Seiten am 17.09.2026 angeglichen, Slot für Slot,
damit nicht zwei Produkte entstehen:

| Slot | Entwurfsseite | Diese Seite |
|---|---|---|
| Rücksprung | „← Alle Entwürfe (GP …)" | „← Alle weiteren Entwürfe" |
| Metazeile über dem Titel | Geschäftszahl · Ressort-Badge (verlinkt) · Frist-Pille | **Typwort** · Ressort-Badge (verlinkt) · Frist-Pille |
| `h1` | Kurztitel | Kurztitel |
| Unterzeile | amtlicher Sammeltitel | langer RIS-Titel |
| Herkunftszeile | „Auf parlament.gv.at ansehen ↗" | „Im RIS ansehen ↗" |
| Karte darunter | Status + SpineRail (5 Stationen) | Status + Verfahrensweg in Worten |
| CTA-Karte | Frist + Stellungnahme-Knopf + `.ics` | Frist + Begleitschreiben-Knopf + `.ics` |
| Abschnitte | fünf, den Stationen folgend | einer: Dokumente |

Das Typwort steht dort, wo die Entwurfsseite die Geschäftszahl führt: Diese
Sätze haben keine, und das Typwort ist das, was sie einem Leser
identifiziert. Der `.ics`-Knopf hat hier mehr Gewicht als dort — auf einem
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
  präfixen (135/ME). Der verankerte Teil des Musters findet das nicht. Das
  Muster zu weiten ändert die Eingabe der Beilagen-Engine, deren Grundlinie
  je Entwurf festgenagelt und wöchentlich überwacht ist — also ein eigener
  Schritt mit eigener Messung, kein Nebeneffekt dieser Arbeit.
- **Der Name der Route** (`/weitere-entwuerfe`) ist eine Arbeitsentscheidung:
  `/verordnungen` wäre für drei Zeilen gelogen. Eine spätere Umbenennung
  kostet eine Weiterleitung; die Feed-UIDs hängen bewusst nicht an der Route.


### 12.17 Nebeneinander im Textvergleich — dieselben Daten, zweimal projiziert

Ein Domänen-Nutzer vergleicht Ministerialentwurf und Regierungsvorlage heute
mit einem fremden Vergleichswerkzeug und nannte als dessen Vorteil eine
**Side-by-side-Ansicht**. Zwei Dinge daran waren zu prüfen, und nur eines
stimmte.

**Der Kontext war schon da.** Die Notiz behauptete, die Zeile „12 Paragrafen
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

**Nicht mitgemacht:** Die Textgegenüberstellung (`TextComparisonSection.vue`)
hat denselben Notfallzweig, aber gar keine Werkzeugleiste — dort einen
Umschalter zu setzen hieße, erst eine zu entwerfen. Eigener Schritt; und die
amtliche Beilage ist konzeptuell ohnehin schon ein Zweispalter, den die Seite
bewusst harmonisiert liest.

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

**Gemessen vor dem Bau** (`scripts/stations-corpus.ts`, `pnpm audit:stationen`,
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
`mappers.ts` für die Shortinfo-Überschriften längst befolgt: das Tag lesen,
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
- **Die Lizenz.** Steht der Ministerialentwurf auf einer Seite, wäre „CC BY
  4.0" für diese Hälfte falsch — das Begutachtungsverfahren ist von der
  Open-Data-Nutzung ausgenommen. Vergleicht der Leser zwei parlamentarische
  Fassungen, sind **beide** Seiten lizenzierte Datensätze, und dann steht die
  Angabe auch da (`isLicensedPair`).
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


## 13. Open questions

1. **Legal (restated 2026-09-16 — the old wording asked the wrong question).** It assumed the metadata was CC-BY and only the full texts excluded. Parliament's licence page for the Begutachtungsverfahren excludes *Beteiligungen zu Ministerialentwürfen* from open-data reuse as such, and no licensed dataset covers Ministerialentwürfe at all. So the question is now: **on what basis may the metadata of lists 81/142/305 be reused?** Two halves — the factual one (how is that sentence meant, is a case-by-case release possible) goes to the Parlamentsdirektion, the legal one (is factual metadata protectable at all; Datenbankherstellerrecht §§ 76c ff vs. § 42h UrhG) to a university partner. Tracked as E3 in `outreach/verfahrensfragen.md`. The inline web-form texts remain a sub-question of it, not a separate one. Nothing here blocks stage 1, which is metadata-only either way; it blocks a blanket CC-BY claim on the site, which was removed on 2026-09-16.
2. ~~Join key RIS↔Parliament at corpus level~~ **Resolved (Sept 2026):** GP XXVII corpus test, 337/350 matched, 0 ambiguous, 12 without any RIS record, no one-sided extensions — `docs/ris-join.md`.
3. Is list-81 `Frist` updated on deadline extensions? (Affects future alerts and history.)
4. Multiple RVs (ME→RV 1:n): is "latest RV" enough or does the UI need all strands? **Corpus evidence 2026-09-08:** it happens — 27/ME (IFG-Anpassung BMF) has two, 134 d.B. and 129 d.B., both dated 18.06.2025, and its diff against the one we pick reports 25 laws as absent that are plausibly in the other. Until this is decided, the comparison says "in dieser Regierungsvorlage" and adds that a draft can end up in more than one — it must never read as "the law was dropped".
5. ~~Marker for dead MEs (never became an RV): watch the `vhg_fertig` field.~~ **Resolved (Sept 2026):** the field is constant across all states; the marker is the GP boundary plus measured base rates — §12.10.
6. Rate limits of the Parliament API are undocumented; behavior under load unknown. Weigh cache TTL (30 min) against freshness for tight deadlines.
7. ~~Type-filter vocabulary of list 101~~ **Resolved (Sept 2026):** `VHG`/`DOKTYP` values such as `VOLKBG`, `E`, `PET`, `BI` — `docs/volksbegehren.md` §5.1.
8. ~~Hosting~~ **Settled (Aug 2026): netcup VPS pico G11s 12M** (€1.85/month incl. 20% AT VAT — the list price €1.84 carries 19% DE VAT —, 12-month term, €0 setup, Nuremberg). EU-owned (DE) like all candidates. Decisive arithmetic: Hetzner's real no-commitment price (CX23, €7.19/month incl. VAT) means one netcup *year* ≈ three Hetzner *months* — the 12-month commitment risks at most ~€15 even if the project stops early, and the app is stateless, so a later provider move is ~30 min (scripts are provider-agnostic). (Historical fallback while the limited pico batch could have been sold out: Hetzner CX23.) Ordered and **live since 2026-08-26**. Setup: `deploy/README.md`; inventory: `deploy/infrastructure.md`.
9. Product name (working title remains "Begutachtungs-Monitor").
10. Semantics of list-81 column "Engagement" and `content.status.number` (5 = promulgated?).
