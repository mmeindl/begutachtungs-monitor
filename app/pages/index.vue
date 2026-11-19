<script setup lang="ts">
import type {
  AnliegenListResponse,
  DashboardEnacted,
  DashboardLaender,
  DashboardOutcomes,
  DashboardPayload,
  DashboardSecondRound,
  DraftStation,
  EuBuergerinitiativenResponse,
  EuFensterResponse,
  LaenderResponse,
  LandCode,
  LandConsultation,
  LandSourceState,
  RisConsultationsResponse,
} from '#shared/types'
import { LAND_CODES, LAND_NAME, landStationsReason, type SourceCode } from '#shared/utils/laender'
import { HOME_LIST_LENGTH, compareRowsByFrist, draftRows } from '#shared/utils/draftOrder'
import { viewOfDraft, viewOfLand, viewOfOutcome, viewOfRow } from '~/utils/entryView'
import { landStationDate, mergeNewestFirst } from '#shared/utils/landRecent'
import { listDe } from '~/utils/geltendeFassung'
import { gpWindow } from '#shared/utils/gp'
import { MAX_LIST_QUERY_CHARS } from '#shared/utils/queryParams'
import { SEARCH_DE } from '~/utils/siteSearch'
import { halfState, pendingHalvesLine, type HalfState } from '~/utils/draftFilters'
import { blockStateLine, settledCount } from '~/utils/lateBlocks'
import { useLateFetch } from '~/composables/useLateFetch'
import { LIST_STATE_DE, type ListBoxStatus } from '~/utils/listState'
import {
  DOORS,
  HOME_DE,
  anliegenDoorAnswer,
  homeDoorOf,
  doorStatus,
  eciDoorAnswer,
  fensterDoorAnswer,
  parlamentDoorAnswer,
  type DoorAnswer,
  type DoorId,
} from '~/utils/doors'

/* The sentence that travels with every shared link (16.11.2026): where one
   can take part, then what became of a draft — the page's order. Until then
   it named the Begutachtung alone, the one door the page had. */
const pageDescription = HOME_DE.description

const { siteUrl } = useRuntimeConfig().public

usePageSeo({
  // The one title that does not follow the template: the home page is what a
  // search for the name finds, and a result reading „Start · …" says
  // nothing about what the site is. Name first, then what it is for.
  title: HOME_DE.title,
  description: pageDescription,
})
// Homepage shares (the demo case) lead with the product name — the
// preview's half overridden after `usePageSeo`, as its doc comment says.
useSeoMeta({ ogTitle: HOME_DE.ogTitle })

useHead({
  titleTemplate: '%s',
  // WebSite markup is what Google reads for the site name above a result —
  // without it the name is guessed from the domain.
  script: [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Begutachtungs-Monitor',
      url: `${siteUrl}/`,
      inLanguage: 'de-AT',
      description: pageDescription,
    }),
  }],
})

/* Both fetches are started here and awaited below, so they overlap instead
 * of queueing: the outcomes endpoint shares its cached leaves with
 * /api/dashboard, and awaiting them one after the other would add its
 * latency to the page's instead of hiding inside it.
 *
 * EVERY FETCH ON THIS PAGE IS `lazy` (04.10.2026). That changes the click:
 * the page appears at once and its sections fill in, instead of the
 * previous page standing still until the slowest endpoint has answered. It
 * changes nothing on the server, where `lazy` is ignored and the render
 * waits for every fetch that is not `server: false`.
 *
 * ONE BLOCK CARRIES THE PAGE, THE REST RACE A DEADLINE (12.11.2026). The
 * render used to wait for all of them, so the slowest addition held the
 * whole HTML: measured cold, 7,7 s on the live site and 6,1 s on a built
 * server — the RIS half's 6 s budget running out, after which the page
 * even said the Verordnungsentwürfe were „nicht abrufbar" when they were
 * only slow (56 s cold, 33 s for the Länder). Warm the page took 0,02–0,04 s
 * and still does. Now only `/api/dashboard` — the open Ministerialentwürfe,
 * the reason the page exists, and the ranking's rows — is awaited in full;
 * every other block goes through `useLateFetch`: the server waits for it two
 * seconds at most, and a block that misses them is rendered in the state a
 * click shows while it loads, and fetched by the browser after hydration.
 *
 * The trade-off: the HTML a crawler, a link preview or a reader without
 * JavaScript gets from a COLD server lacks the late blocks. Cold is rare —
 * the caches serve stale while they refresh, and the watchdog probes every
 * five minutes — and a page that takes six seconds to say anything was the
 * worse answer for every one of those readers too.
 *
 * So a missing block may mean „still on its way" on the server too, and
 * nothing here reads a fetch's `status` for that: a deadline the server
 * missed is `success` with `null`. Every state is read through `halfState`
 * (`… werden noch geladen` vs. `… gerade nicht abrufbar`), and no count
 * stands while a block it sums over is pending (`settledCount`). */
/* The carrying block's bound (12.11.2026): it had none, so a hanging list 81
 * held the page for the upstream's worst case, three attempts of 8 s. Cold
 * it answers in 0,15 s. Past 10 s the gate shows its failure and the way to
 * retry — the state it already had for an error. */
const dashboardFetch = useFetch<DashboardPayload>('/api/dashboard', { lazy: true, timeout: 10000 })

/* Server-rendered on purpose. This section IS the product's point
 * (mechanism 1: shelving visible, mechanism 3: wins equally visible), and
 * client-only kept it out of the SSR HTML entirely — invisible to crawlers
 * and shared previews, absent without JS, and a "Verläufe werden geladen …"
 * flash for everyone else, on the one section the homepage exists for.
 *
 * What this replaces: "resolving the outcome pool can hit ~24 cold upstream
 * fetches — that must never block the first paint." Measured 2026-09-07
 * against a cleared cache: the fan-out is parallel (Promise.all over the
 * pool, then the RV leg), one Gegenstand costs ~100 ms, and the endpoint
 * answers in 0.41 s fully cold — extension probe included — and 5 ms warm.
 * The request count was never the latency.
 *
 * Since 12.11.2026 the server's deadline (`useLateFetch`) is what keeps
 * that judgement safe if upstream turns slow, and the `timeout` is the
 * BROWSER's budget. It was 4 s while it guarded the server's render; in the
 * browser nothing waits for it any more, and this is the block that shows
 * the wins beside the shelving — it must not fall silent because a cold
 * cache took five seconds. 10 s, then the failure is said under the list.
 * No automatic retry beyond the one after hydration — during a real
 * upstream outage that would add one uncached fan-out per visitor and
 * change nothing. */
const outcomesFetch = useLateFetch<DashboardOutcomes>('/api/dashboard/outcomes', () => ({}), {
  timeout: 10000,
  key: 'home',
})

/* The end of the chain, read from the Vorlage side. Server-rendered
 * for the same reason as the outcomes above it: this is the section that
 * shows participation arriving somewhere, and it may not depend on
 * JavaScript. Measured cold on 2026-09-18: 0.93 s for the whole endpoint —
 * one list-101 call plus 30 parallel Gegenstand fetches at 0.54 s — and
 * 14 ms warm, so the 4 s budget is a guard, not a plan. Since 12.11.2026
 * the server waits two seconds at most (`useLateFetch`), and the browser's
 * budget is the outcomes' 10 s, for their reason: the end of the chain is
 * the other half of what the page promises. */
const enactedFetch = useLateFetch<DashboardEnacted>('/api/dashboard/enacted', () => ({}), {
  timeout: 10000,
  key: 'home',
})

/* „Beschlossen, noch nicht kundgemacht" left the homepage on 16.11.2026: it
 * is a station of one object, and the page is no longer organised along a
 * draft's stations. The set stays on `/entwuerfe` (the Parlament tab,
 * `status=closed`); its endpoint went the same day. */

/* THE DOORS' COUNTS (16.11.2026, `app/utils/doors.ts`). Each door after the
 * first reads the endpoint its own list reads, through `useLateFetch` with
 * the page's key like every other addition: the server waits two seconds at
 * most, so no door can hold the render, and a door that missed the deadline
 * stands in its loading words until the browser has asked again. Each
 * browser budget is its list's patience, so a slow answer is not called a
 * failure the list itself would not call one: the Anliegen wait up to 20 s
 * for lists and records together (`getAnliegenRows`), so 30 s here, as the
 * homepage's Anliegen section had; the EU's two answer from the portal and
 * the register, 20 s.
 *
 * The open Regierungsvorlagen were asked in the browser only (`server:
 * false`) while they were a section that could be absent; as a door they
 * state „derzeit keine" in the HTML when the server had the answer in time. */
const secondRoundFetch = useLateFetch<DashboardSecondRound>('/api/dashboard/zweite-runde', () => ({}), {
  timeout: 10000,
  key: 'home',
})
const anliegenFetch = useLateFetch<AnliegenListResponse>('/api/anliegen', () => ({}), {
  timeout: 30000,
  key: 'home',
})
const fensterFetch = useLateFetch<EuFensterResponse>('/api/eu-recht/fenster', () => ({}), {
  timeout: 20000,
  key: 'home',
})
const eciFetch = useLateFetch<EuBuergerinitiativenResponse>('/api/eu-recht/buergerinitiativen', () => ({}), {
  timeout: 20000,
  key: 'home',
})

/* The Begutachtungen Parliament has no Gegenstand for — mostly
 * Verordnungsentwürfe.
 *
 * SERVER-RENDERED, and that is the point. This is not a bonus block:
 * without it the open list (the first door, „Stellung nehmen zu einem
 * Entwurf") names a fraction of what is open and says nothing about the
 * rest — 4 of 8 on
 * 2026-09-17. A correction to a claim the page makes cannot be the one part
 * of the page that needs JavaScript to appear.
 *
 * It costs no upstream request the page does not already pay: the RIS corpus
 * and the GP's join map are the same cached leaves the draft pages read.
 *
 * Server-rendered when it is warm, that is — since 12.11.2026 it races the
 * server's deadline (`useLateFetch`), and the open list stands with the
 * Ministerialentwürfe meanwhile and says under the box that these rows are
 * still on their way (`pendingHalvesLine`), as `/entwuerfe` does. Until
 * then the list waited for this half, and on a cold server its 6 s budget
 * was the page's delivery time. */
const { data: risOnly, error: risError } = useLateFetch<RisConsultationsResponse>(
  '/api/ris-drafts',
  () => ({ status: 'open' }),
  // The browser's budget. This one sits on the RIS corpus — 46 upstream
  // requests with a politeness pause, warmed nightly by the prewarm unit and
  // held for 20 h. Warm it is milliseconds; cold it is a minute.
  { timeout: 6000, key: 'home' },
)

/* The Länder the reader chose (`useSourceChoice`, 22.10.2026). Server-rendered
 * like the RIS half, and for its reason: a chosen Land's rows sort in among
 * the others by Frist, so they cannot arrive after the list. Asked only when
 * a Land is chosen — the default homepage pays nothing for them. One answer
 * carries every Land; the choice is applied below. So it is asked again only
 * when the choice goes from none to some, never on a switch between Länder:
 * watching the list itself refetched on every chip and blanked the list
 * while it did (25.10.2026). Since 12.11.2026 a late block like the RIS
 * half (`useLateFetch`) — except where the Bund is unticked: then the
 * Länder are the list, and it shows its loading state until they come. */
const { bund, laender: chosenLaender, queryValue: sourcesQuery } = useSourceChoice()
const wantsLaender = computed(() => chosenLaender.value.length > 0)
const { data: laender, error: laenderError } = useLateFetch<LaenderResponse>(
  '/api/laender',
  () => ({}),
  { timeout: 6000, wanted: wantsLaender, key: 'home' },
)

const { data, error, refresh, status } = await dashboardFetch
const { data: outcomes, error: outcomesError } = await outcomesFetch
const { data: enacted, error: enactedError } = await enactedFetch

/* The chosen Länder in „Zuletzt Gesetz geworden" (30.10.2026): their newest
 * Kundmachungen beside the Bund's. (Their Landtag decisions still awaiting
 * one, the payload's other half, stood under „Beschlossen, noch nicht
 * kundgemacht" until 16.11.2026.) Asked only when a Land is chosen, like the open list's
 * Länder, and after the Bund's Kundmachungen, because their period is the
 * window the Länder are read over — 0.5 s warm, a cached cut of the
 * lists behind the section's link (`/api/dashboard/laender`).
 *
 * Registered after the Kundmachungen have settled, not beside them: the
 * period is part of the key, and the key the server rendered under must be
 * the key the browser hydrates with. When the Kundmachungen missed the
 * server's deadline it asks without a period (the endpoint's default, the
 * running one) and asks again once they arrive. So with a Land chosen and
 * both cold the server may wait two deadlines (12.11.2026). */
const { data: landRecent, error: landRecentError } = await useLateFetch<DashboardLaender>(
  '/api/dashboard/laender',
  () => ({ gp: enacted.value?.gp }),
  { timeout: 4000, wanted: wantsLaender, key: 'home' },
)
const chosenOf = (rows: readonly LandConsultation[] | undefined) =>
  (rows ?? []).filter((d) => chosenLaender.value.includes(d.land))

/* Where each late block stands (`halfState`): not asked for, on its way,
 * there, or failed — never read from the fetch's `status` (see above). */
const risState = computed(() => halfState(true, risOnly.value, risError.value))
const laenderState = computed(() => halfState(wantsLaender.value, laender.value, laenderError.value))
const outcomesState = computed(() => halfState(true, outcomes.value, outcomesError.value))
const enactedState = computed(() => halfState(true, enacted.value, enactedError.value))
const landRecentState = computed(() => halfState(wantsLaender.value, landRecent.value, landRecentError.value))

const unreadableRecent = computed(() => unreadableOf(landRecent.value?.sources, landRecentState.value))

/**
 * Which sources each box can draw from (30.10.2026). Every box whose rows
 * the choice decides carries the chips (`SourceChips`), and a Land that can
 * give a box no rows is dashed there with its reason — `/entwuerfe`'s
 * grammar, from the same station map (`LAND_FOLLOWED_STATIONS`). The
 * reasons are statements about the monitor, not about the Länder: some
 * Landtage run a Begutachtung of their own on bills before them (Kärnten,
 * Oberösterreich, Steiermark, Burgenland), none takes Stellungnahmen on a
 * Regierungsvorlage, and nobody here counts a Land's Stellungnahmen.
 */
type SourceReasons = Partial<Record<SourceCode, string | null>>
const everyLand = (reason: string): SourceReasons => Object.fromEntries(LAND_CODES.map((land) => [land, reason]))
const atStation = (station: DraftStation): SourceReasons =>
  Object.fromEntries(LAND_CODES.map((land) => [land, landStationsReason(land, [station])]))
/* The doors after the first are the Bund's and the EU's and carry no chips
 * (16.11.2026): their rows are not the choice's to decide. */
const RANKED_UNAVAILABLE = everyLand('Für die Länder zählt der Monitor keine Stellungnahmen')
const ENACTED_UNAVAILABLE = atStation('bgbl')

/**
 * The reason in words, where none of the chosen Länder can give the box a
 * row: a dashed chip's reason is its title, and a title reaches no phone
 * (`/entwuerfe` says it in its count line for the same reason). One reason
 * when they share it, else what they have in common.
 */
function noneApply(reasons: SourceReasons): string | null {
  const given = chosenLaender.value.map((land) => reasons[land] ?? null)
  if (!given.length || given.some((r) => r === null)) return null
  return new Set(given).size === 1 ? `${given[0]}.` : 'Die gewählten Länder verfolgt der Monitor nicht bis zu dieser Station.'
}
const applying = (reasons: SourceReasons) => chosenLaender.value.filter((land) => !reasons[land])

/* The chosen Länder's rows, and the chosen Länder that could not be read —
 * a failed fetch counts as every chosen Land unreadable, never as none open;
 * one still on its way counts as none unreadable (12.11.2026: that includes
 * the server's missed deadline, `success` with `null`). */
const chosenLandItems = computed(() =>
  (laender.value?.items ?? []).filter((item) => chosenLaender.value.includes(item.land)),
)
function unreadableOf(sources: readonly LandSourceState[] | undefined, state: HalfState) {
  if (!chosenLaender.value.length || state === 'off' || state === 'loading') return []
  return chosenLaender.value
    .map((land) => sources?.find((s) => s.land === land) ?? { land, state: 'unavailable' as const, listUrl: null })
    .filter((s) => s.state === 'unavailable')
}
const unreadableLaender = computed(() => unreadableOf(laender.value?.sources, laenderState.value))
/* The list links carry the choice when it came from the address alone: the
 * cookie would carry it otherwise, a shared link has none. */
const sourcesParam = computed(() => (sourcesQuery.value ? `&quellen=${sourcesQuery.value}` : ''))
const openDoor = homeDoorOf('begutachtung')
const openListHref = computed(() => `${openDoor.href}${sourcesParam.value}`)

/**
 * What is open right now, both kinds, in ONE deadline-ordered list.
 *
 * Same rows as `/entwuerfe` (`draftRows`): two row types, one order, never a
 * pooled total. What differs is the cap — this is the front door, not the
 * corpus view.
 *
 * Five rows, then out to the filter — `HOME_LIST_LENGTH`, the same length
 * every list on this page is cut to.
 *
 * Measured 2026-09-17 over 2025-01-01 → today: 6 Ministerialentwürfe are
 * open at the median (p90 10, max 15) and 7 RIS-only records (p90 18, max
 * 25) — so the merged list runs at ~13 rows typically and has touched 40.
 * Uncapped it would push the accountability section, which is the reason
 * this page exists, past a third viewport on an ordinary week. What sits
 * behind the cap is named in the link above the list, and only there.
 */
const openRows = computed(() =>
  draftRows(
    bund.value ? (data.value?.open ?? []) : [],
    bund.value ? (risOnly.value?.items ?? []) : [],
    [],
    chosenLandItems.value,
  ).sort(compareRowsByFrist),
)

/* The mapping onto the anatomy happens HERE, not in the template:
 * `EntryList` receives finished `EntryView`s, and every section of the page
 * says in one line which adapter is responsible for its kind. */
const visibleOpenRows = computed(() => openRows.value.slice(0, HOME_LIST_LENGTH).map(viewOfRow))

/**
 * The open list's late halves (12.11.2026). With the Bund ticked the
 * Ministerialentwürfe carry the list, and the RIS half and the chosen
 * Länder sort in when they come — said under the box meanwhile, never
 * counted as none. With the Bund unticked the Länder ARE the list, and its
 * wait is the list's own loading state. The rows' number in the header waits
 * for every half, like the count line on `/entwuerfe`.
 */
const openRisPending = computed(() => bund.value && risState.value === 'loading')
const openLaenderPending = computed(() => bund.value && laenderState.value === 'loading')
/** The loading lines of the homepage's list boxes, in the rows' place (`ListBoxState`). */
const HOME_LIST_DE = {
  openLoading: 'Offene Entwürfe werden geladen …',
  enactedLoading: 'Kundmachungen werden geladen …',
} as const
const openWaiting = computed(() =>
  (!bund.value && laenderState.value === 'loading') ||
  (!visibleOpenRows.value.length && (openRisPending.value || openLaenderPending.value)))
/*
 * The open list's box before it has rows (`ListBoxState`): with the Bund
 * ticked the dashboard carries the list, so its wait and its failure stand
 * in the rows' place (`FetchGate`'s rule: pending or idle without data is
 * loading, a refresh keeps the rows); then the late halves (`openWaiting`).
 */
const openState = computed<ListBoxStatus>(() => {
  if (bund.value && !data.value) {
    if (status.value === 'pending' || status.value === 'idle') return { loading: HOME_LIST_DE.openLoading }
    if (error.value) return { failed: { text: LIST_STATE_DE.failed } }
  }
  return openWaiting.value ? { loading: HOME_LIST_DE.openLoading } : null
})
const openPendingLine = computed(() =>
  pendingHalvesLine(openRisPending.value, openLaenderPending.value ? chosenLaender.value : null))
const openTotal = computed(() => settledCount(openRows.value.length, [
  bund.value ? risState.value : 'off',
  laenderState.value,
]))

/**
 * NO count line on this page, unlike `/entwuerfe`.
 *
 * There it states a corpus nobody can see (336 rows behind filters); here
 * the list is a handful of rows and every one of them says in its own
 * Kennung which kind it is, so "4 Ministerialentwürfe · 4 Verordnungsentwürfe und andere"
 * only restates what is visible — and a figure inside a line of prose is
 * the hardest place to find one when you are scanning for exactly that.
 *
 * The one thing the line did carry that the rows cannot is the ABSENCE of
 * the RIS half; that became its own line, rendered only when the half is
 * actually missing (template below).
 */

/**
 * The volume ranking, each row with the outcome that belongs to it.
 *
 * Two sources on purpose. The rows come from `/api/dashboard`, which is
 * server-rendered and cheap; the outcomes from the deferred endpoint, which
 * pays upstream fetches for them. So the section renders whole either way,
 * and a row whose Gegenstand could not be read simply carries no chip —
 * never "bisher keine Regierungsvorlage", which would be a claim we did not
 * verify. Open drafts are never in the map by construction: they have no
 * outcome yet, and their Frist block is the right aside for them.
 */
const rankedRows = computed(() => {
  const byKey = new Map(
    (outcomes.value?.rankedOutcomes ?? []).map((o) => [`${o.gp}-${o.inr}`, o]),
  )
  return (data.value?.ranked.items ?? []).map((draft) =>
    viewOfDraft(draft, byKey.get(`${draft.gp}-${draft.inr}`) ?? null),
  )
})

/**
 * Five Vorlagen, and the rest on `/entwuerfe` — no longer three with a
 * „weitere anzeigen" button under them.
 *
 * The section has no Frist to rank by — the door closes with the end of the
 * parliamentary procedure, the Bundesrat's Beschluss — so
 * it cannot be cut by urgency the way the open list is, and it sits between
 * the two halves the page promises. What changed on 18.09.2026 is not the
 * cutting but WHERE THE REST IS: the button grew this page for one reader
 * and left the same rows unreachable for everyone arriving from a shared
 * link. The list exists as a filter now, so the way out is a link like
 * every other section's.
 */
/* The Bund's alone, and so empty while the Bund is unticked: the box then
 * stays, with its chips and the reason, rather than ignore the choice. */
const rankedShown = computed(() => (bund.value ? rankedRows.value : []))
/* The outcomes on their way or failed, said under the ranking
 * (12.11.2026). The rows stand without their chips meanwhile, which claims
 * nothing — but the sentence above them promises „was aus ihnen geworden
 * ist", and the wins must not go missing in silence. Only where a closed
 * row is shown: an open draft has no outcome to wait for. */
const outcomesLine = computed(() =>
  bund.value && (data.value?.ranked.items ?? []).some((d) => !d.active)
    ? blockStateLine('Was aus den Entwürfen wurde,', 'singular', outcomesState.value)
    : null)

/* Uncapped: the endpoint already delivers `HOME_LIST_LENGTH` rows — the cap
 * sits where the Vorlagen are read from list 101, not here. `?? []` does not
 * tell „nichts kundgemacht" from „nicht abrufbar"; that is done by the two
 * sentences in the template, which still ask `enacted` themselves. */
const enactedMerged = computed(() =>
  mergeNewestFirst(
    bund.value ? (enacted.value?.items ?? []) : [], (o) => o.bgblDate,
    chosenOf(landRecent.value?.enacted), landStationDate,
  ).slice(0, HOME_LIST_LENGTH),
)
const enactedEntries = computed(() =>
  enactedMerged.value.map((m) => (m.from === 'a' ? viewOfOutcome(m.item) : viewOfLand(m.item))))

/**
 * The Gesetzgebungsperiode each accountability section is counted over,
 * spelled out rather than implied — and read PER SECTION, not once for the
 * page.
 *
 * Until 18.09.2026 the page said it once, in a subline, as „in dieser
 * Gesetzgebungsperiode" — a demonstrative pronoun pointing at nothing the
 * reader can see. It names the period now, and the start date with it: a
 * ranking of counts is a ranking over a window, and the window belongs on
 * screen.
 *
 * Until 25.09.2026 that name came from `data.gp`, the RUNNING period, for
 * both sections at once. From the day a new Gesetzgebungsperiode constitutes
 * itself that is the wrong name for either: each section falls back to the
 * period before on its own condition and at its own moment (the ranking
 * needs five rows and a count above zero, the Kundmachungen need one law),
 * so each carries its own period in its own payload and labels itself from
 * it.
 *
 * Why the scope is not WIDENED — one fallback period, never a merge
 * (measured 2026-09-18): across GP XXVII the top five by Stellungnahmen are
 * 106.184 (COVID-19-Impfpflichtgesetz), 35.296, 19.026, 16.534 and 14.334 —
 * four of them Epidemiegesetz-Novellen. A cross-period ranking is a COVID
 * monument that can never change again and says nothing about what is being
 * decided now; GP XXVIII's largest is 846. The period boundary is what keeps
 * this section alive, and the fallback moves it rather than dissolving it.
 */
const currentGp = computed(() => data.value?.gp ?? null)
const rankedGp = computed(() => data.value?.ranked.gp ?? null)
const enactedGp = computed(() => enacted.value?.gp ?? null)

/* „(seit 24.10.2024)" on the ranking, when the table knows the date.
 *
 * It needs no row added on the day of the Wechsel, and that is worth
 * stating: while the fallback is active the label is the PREVIOUS period,
 * which `GP_STARTS` has had a row for since it ended — and once the new
 * period takes the section over, `gpWindow` returns null for it and the
 * template simply omits the parenthesis until someone adds the row. The
 * page never waits for maintenance and never prints a wrong date. */
const rankedGpStart = computed(() => {
  const from = rankedGp.value ? gpWindow(rankedGp.value)?.from : null
  return from ? formatDateDe(from) : null
})

/* Each section's own answer to „is this the running period?". Both are
 * false in the ordinary case and for the whole life of a period; they turn
 * true only in the weeks after a Wechsel, and independently of each other —
 * measured 2026-09-25, the Kundmachungen of GP XXVIII were 201 days behind
 * the period while its ranking was usable after 83. */
function isFallbackGp(sectionGp: string | null): boolean {
  return !!sectionGp && !!currentGp.value && sectionGp !== currentGp.value
}
const rankedIsFallback = computed(() => isFallbackGp(rankedGp.value))
const enactedIsFallback = computed(() => isFallbackGp(enactedGp.value))

/* The section's one way out points at the filter that shows the same list
 * uncut — and during a fallback that filter needs the period
 * spelled into it, because `/entwuerfe` defaults to the RUNNING one and
 * would otherwise answer the link with an empty list. Only during the
 * fallback: in the ordinary case the period is already the default, and the
 * parameter would buy nothing but an active-filter chip on arrival. */
const rankedHref = computed(
  () =>
    '/entwuerfe?art=gesetz&sort=stellungnahmen' +
    (rankedIsFallback.value ? `&gp=${rankedGp.value}` : ''),
)
const enactedHref = computed(
  () => '/entwuerfe?station=bgbl' + (enactedIsFallback.value ? `&gp=${enactedGp.value}` : '') + sourcesParam.value,
)

/* The EU map's window (06.11.2026), the page's last section, went on
 * 14.11.2026: „EU-Recht" is in the header navigation, which is the door to
 * `/eu-recht` now (docs/decisions.md, EU law). */

/* „Zuletzt Gesetz geworden" with Länder chosen (30.10.2026). The Bund's
 * sentences below stay as they were for the Bund alone; with a Land the
 * section is two gazettes, and the sentence names both and the window each
 * is read over. A Land's window is the Bund's period as a time span
 * (`readLaenderInWindow`): it has its own legislative periods. */
const enactedLoading = computed(() =>
  (bund.value && enactedState.value === 'loading') || landRecentState.value === 'loading')
const enactedAnswered = computed(() => (!bund.value || !!enacted.value) && (!wantsLaender.value || !!landRecent.value))

/* As the gazettes call themselves: „Landesgesetzblatt für das Burgenland",
 * „… für die Steiermark", „… für Salzburg". */
const GAZETTE_FOR: Partial<Record<LandCode, string>> = { bgld: 'das Burgenland', stmk: 'die Steiermark' }
function landGazettesDe(lands: readonly LandCode[]): string {
  const names = lands.map((land) => GAZETTE_FOR[land] ?? LAND_NAME[land])
  return names.length === 1 ? `im Landesgesetzblatt für ${names[0]}` : `in den Landesgesetzblättern für ${listDe(names)}`
}
function landWindowDe(gp: string | null): string | null {
  const w = gp ? gpWindow(gp) : null
  if (!w) return null
  return w.to
    ? `aus Begutachtungen vom ${formatDateDe(w.from)} bis ${formatDateDe(w.to)}`
    : `aus Begutachtungen seit dem ${formatDateDe(w.from)}`
}
const enactedLaender = computed(() => applying(ENACTED_UNAVAILABLE))
/* One half still on its way while the other has rows (12.11.2026): said
 * under the box where a failed half is, in the words that tell the two
 * apart. The Bund's failure keeps its own line in the template. */
const enactedPendingLines = computed(() => [
  bund.value && enactedState.value === 'loading' ? blockStateLine('Die Kundmachungen des Bundes', 'plural', 'loading') : null,
  enactedLaender.value.length && landRecentState.value === 'loading' ? blockStateLine('Die Kundmachungen der Länder', 'plural', 'loading') : null,
].filter((line): line is string => line !== null))
const enactedLandLine = computed(() => {
  if (!enactedLaender.value.length) return null
  const gp = enactedGp.value ?? currentGp.value
  const land = [landGazettesDe(enactedLaender.value), landWindowDe(gp)].filter(Boolean).join(' ')
  const bundGazette = `im Bundesgesetzblatt${gp ? ` aus der ${gp}. Gesetzgebungsperiode` : ''}`
  const lead = !bund.value
    ? `Die jüngsten Kundmachungen ${land}`
    : enactedIsFallback.value
      ? `Aus der ${currentGp.value}. Gesetzgebungsperiode ist im Bundesgesetzblatt noch kein Entwurf kundgemacht. Hier stehen deshalb die jüngsten Kundmachungen ${bundGazette} und ${land}`
      : `Die jüngsten Kundmachungen ${bundGazette} und ${land}`
  const blocks = bund.value && !enactedIsFallback.value
    ? ' Der Nationalrat beschließt in Blöcken: zwischen zwei Plenarwochen ändert sich beim Bund nichts.'
    : ''
  // Whose finding a row is, said once where a row rests on ours (`isEnactedLandLaw`).
  const searched = enactedMerged.value.some((m) => m.from === 'b' && m.item.stage && m.item.stage !== 'unknown' && m.item.stage.via === 'suche')
    ? ' Wo ein Land die Kundmachung nicht selbst verzeichnet, hat sie unsere Suche im RIS gefunden.'
    : ''
  return `${lead} – und die Begutachtung, aus der sie hervorgegangen sind.${blocks}${searched}`
})

/**
 * The doors after the first, as rows (16.11.2026): each with where its
 * block stands (`halfState`) and its answer read by the door's own function
 * — the one its list counts with (`app/utils/doors.ts`). The Bund's choice
 * in the chips does not touch them: they are the Bund's and the EU's.
 */
const { data: secondRound, error: secondRoundError } = secondRoundFetch
const { data: anliegen, error: anliegenError } = anliegenFetch
const { data: fenster, error: fensterError } = fensterFetch
const { data: eci, error: eciError } = eciFetch
type DoorBlock = { data: unknown; error: unknown; answer: DoorAnswer | null }
const doorBlocks: Partial<Record<DoorId, () => DoorBlock>> = {
  parlament: () => ({ data: secondRound.value, error: secondRoundError.value, answer: secondRound.value ? parlamentDoorAnswer(secondRound.value) : null }),
  anliegen: () => ({ data: anliegen.value, error: anliegenError.value, answer: anliegen.value ? anliegenDoorAnswer(anliegen.value) : null }),
  'eu-rueckmeldung': () => ({ data: fenster.value, error: fensterError.value, answer: fenster.value ? fensterDoorAnswer(fenster.value) : null }),
  'eu-buergerinitiative': () => ({ data: eci.value, error: eciError.value, answer: eci.value ? eciDoorAnswer(eci.value) : null }),
}
/* In the module's order; the expanded door is the open list above them. */
const doorRows = computed(() => DOORS.filter((door) => !door.expanded).map((door) => {
  const block = doorBlocks[door.id]?.()
  return { door, status: doorStatus(door, halfState(true, block?.data, block?.error), block?.answer ?? null) }
}))

/* The way in for whoever arrives with a subject, not a date: the site
 * search (`/suche`, 17.11.2026), which answers per list — the drafts, the
 * Anliegen, the EU's lists. Until then the field led onto `/entwuerfe?q=`
 * and reached one list in three. A plain GET form, so it works before
 * hydration; with JavaScript the submit becomes a client-side navigation.
 * The site's choice of sources travels along, as on every link here. */
const searchTerm = ref('')
function submitSearch() {
  const q = searchTerm.value.trim()
  return navigateTo({ path: '/suche', query: { ...(q ? { q } : {}), ...(sourcesQuery.value ? { quellen: sourcesQuery.value } : {}) } })
}
</script>

<template>
  <div class="mx-auto w-full max-w-5xl">
    <!-- ACT FIRST, THEN FOLLOW (16.11.2026). The page was organised along one
         object's stations — a draft's Begutachtung, its Regierungsvorlage, the
         Beschluss, the Kundmachung — while four objects with four rails now
         take part: a draft, an Anliegen an das Parlament, an EU act, a
         European Citizens' Initiative. So it opens with ONE chapter whose
         structure is the doors, the ways of taking part that are open today
         (`/wege` made live, `DOORS` in `app/utils/doors.ts`): the first
         expanded into the open list, the others one row each with what is
         open and the list it leads to. Then ONE chapter for the following,
         the ranking and the newest laws. „Beschlossen, noch nicht
         kundgemacht" stays on `/entwuerfe`; the lists „Jetzt im Parlament"
         and „Anliegen an das Parlament" became door rows. -->
    <header>
      <h1 class="page-title">
        {{ HOME_DE.h1 }}
      </h1>
      <!-- NO LINK in this sentence, since 18.09.2026. It carried an anchor
           to the accountability section, inherited from the stat tile's
           "Was wurde daraus? ↓" that had been the only pointer above the
           fold. Two reasons it goes: a promise is not navigation — underlined
           in the middle of the lede, "Regierungsvorlage, Bundesgesetzblatt"
           reads as a glossary link to a definition that does not exist — and
           the reorder took the distance away that an anchor was saving. The
           sentence still makes the promise; the sections below keep it.

           „abgeben kann sie jede und jeder" (14.11.2026) answers „Betrifft
           mich das?", which stood on /so-funktionierts until that page was
           dissolved: a reader arriving cold has to learn here, once, that a
           Stellungnahme needs no organisation, training or form. One
           paragraph, not three: the header already offers the feeds, and the
           Verordnungen half shows itself in the list below.

           Since 16.11.2026 the first sentence says where in one line —
           Bund, Länder and EU — and leaves the doors to name themselves
           below (`HOME_DE.lede`); the claim about who may take part stays
           with the Stellungnahme, the one it is true of for every door that
           takes one. -->
      <p class="mt-3 text-ink-secondary">
        {{ HOME_DE.lede.join(' ') }}
      </p>

      <!-- On submit, not on input: a page change per keystroke takes the
           cursor out of the word (WCAG 3.2.2). One line in the header, not a
           hero field — the page's questions are „wo kann ich mitreden?" and
           „was wird daraus?". Full
           width like the search page's field it leads into, on the lede's
           edges, and in its words (`SEARCH_DE.field`). The placeholder names
           what is searched and counts nothing: the answers come per list. -->
      <form
        action="/suche"
        method="get"
        role="search"
        class="mt-6 flex gap-2"
        @submit.prevent="submitSearch"
      >
        <UInput
          v-model="searchTerm"
          name="q"
          type="search"
          :maxlength="MAX_LIST_QUERY_CHARS"
          icon="i-lucide-search"
          :placeholder="`${SEARCH_DE.field} …`"
          :aria-label="SEARCH_DE.field"
          class="min-w-0 flex-1"
          :ui="{ base: 'min-h-target' }"
        />
        <input v-if="sourcesQuery" type="hidden" name="quellen" :value="sourcesQuery">
        <UButton type="submit" color="neutral" variant="outline" class="min-h-target">
          Suchen
        </UButton>
      </form>

      <!-- The account-free alert tier, IN the header since 18.09.2026, not
           between it and the first section. It stood at `mt-8` with the
           80px section boundary under it — 1:3, too little to read as its
           own thing and too much to read as part of the lede, so it
           belonged to nothing. Its old comment called it "directly above
           the list of Fristen it applies to"; it was a heading and a
           section boundary away from that list.

           It is a line about the page, and the header is where the page
           speaks about itself. The move also takes it out of
           `v-else-if="data"`: `useFeedUrls()` touches no endpoint, so a
           failed `/api/dashboard` used to take the one still-working offer
           down with the data. Footer keeps the full version with the
           manual URL. -->
      <!-- `leading-7`: the links are `tap-target` boxes of 28 px in the line,
           so a text-sm line of 20 px made every wrapped line a different
           height on a phone. -->
      <div class="mt-4">
        <SubscribeLinks />
        <!-- „Wie vollständig die Länder-Entwürfe sind" stood here as a fold
             until 14.11.2026; each list box now names, under its chips, the
             chosen Länder it does not hold in full (`LandCoverageNote`). -->
      </div>
    </header>

    <!-- No gate over the sections since 16.11.2026 (a list shows its frame
         while loading): the open list's box stands at once and holds the
         dashboard's loading line or its failure with „Erneut versuchen"
         (`openState`); the doors' rows stand at once with their loading
         words; „Was daraus wurde" comes with the dashboard's answer. -->
    <section class="page-section" aria-labelledby="act-heading">
      <h2 id="act-heading" class="section-heading">
        {{ HOME_DE.actHeading }}
      </h2>
      <!-- The doors are a list: one item per way of taking part, the first
           expanded into its own list, the others one row each
           (16.11.2026). The first is a section like the lists under „Was
           daraus wurde": its heading in ink at `text-xl`, its one way out
           „Alle N offenen Entwürfe →" on the right. The other four are rows
           whose heading is a step below it (`text-lg`) and above the 16 px
           h4 of the list's rows, the label in blue — the row is what you
           act on, ending in the site's „→". Each of those four rows is bounded by a hairline above
           and below (maintainer, 16.11.2026), so the reader sees where
           each target begins and ends; the first door has no line above
           it, the chapter head is its edge. -->
      <ul role="list" class="mt-6">
        <li>
          <!-- ONE list, because the question is one: "was läuft gerade, wo
               kann ich noch mitreden?". Which official
               register happens to carry a record is plumbing, and plumbing does
               not belong in the page skeleton — it belongs on the row, which is
               why both row kinds now lead their meta line with the type word.

               The split cost the page its deadline order: on 17.09.2026 the
               first row was a Frist ending on the 21st while a Verordnung ended
               that same day, below a second heading. Urgency is the one thing
               two lists cannot preserve.

               The door's label is the list's heading (16.11.2026); it was
               „Jetzt in Begutachtung", a stage, under a chapter of its own. -->
          <ListHeader
            id="open-heading"
            :level="3"
            :to="openListHref"
            noun="offenen Entwürfe"
            :total="openState ? undefined : openTotal"
            :visible="visibleOpenRows.length"
          >
            {{ openDoor.label }}
          </ListHeader>
          <!-- Directly under the heading, not under the list: this one is
                 not provenance but a correction to what the list claims, and a
                 reader who learns at the bottom that rows are missing has
                 already read it as complete. Rendered only when they are. -->
          <!-- Names the missing rows by what they are, not by the register
                 that does not carry them. „Die Entwürfe ohne Gegenstand im
                 Parlament" put the site's densest piece of jargon in the one
                 state where its gloss below the list was suppressed — the
                 gloss only rendered when such a row was present, and this line
                 only renders when none is. -->
          <!-- A chosen Land that could not be read, said like the RIS half
                 below: its rows are missing, and the list must not read as if
                 that Land had nothing open. -->
          <GapNote v-for="s in unreadableLaender" :key="s.land" kind="unavailable" class="mt-2 text-sm text-ink-muted">
            {{ LAND_NAME[s.land] }}<template v-if="s.listUrl"> –
              <ExternalLink :href="s.listUrl" class="link-inline font-medium">beim Land nachsehen</ExternalLink></template>.
          </GapNote>
          <GapNote v-if="bund && risState === 'failed'" kind="unavailable" class="mt-2 text-sm text-ink-muted">
            die Verordnungsentwürfe aus dem RIS –
            <NuxtLink
              to="/entwuerfe?art=verordnung&status=open"
              class="link-inline font-medium"
            >noch einmal versuchen</NuxtLink>
            oder
            <ExternalLink
              href="https://www.ris.bka.gv.at/Begut/"
              class="link-inline font-medium"
            >im RIS nachsehen</ExternalLink>.
          </GapNote>

          <!-- Always the box, since the chips moved into its head (22.10.2026):
                 a list that vanished when empty would take the control that
                 could fill it with it. For the same reason the loading state
                 stands inside it (`#state`) rather than in its place: a chip
                 that blanked the box took itself away until the answer came. -->
          <EntryList :entries="visibleOpenRows" :state="openState" :heading-level="4" class="mt-4" @retry="refresh()">
            <!-- Where the rows come from (`SourceChips`), in the box's head
                   like every list's controls. -->
            <template #header>
              <SourceChips />
              <!-- The chosen Länder this list does not hold in full, under the
                     chips that chose them — true of this list only
                     (`landsIncompleteFor`, `laufend`). -->
              <LandCoverageNote :lands="chosenLaender" where="laufend" />
            </template>
            <!-- Until 12.11.2026 the list waited here for every half, because
                   the RIS rows sort in between the others by Frist and a list
                   drawn from one half reorders when they come. On the server
                   that wait was the page's delivery time, so the
                   Ministerialentwürfe stand now, and the halves on their way
                   are said under the box (`openPendingLine`). The skeleton
                   stays where nothing could stand yet: the Länder alone, or no
                   row at all while a half is pending — never „keine offen". -->
            <template #empty>
              <!-- The no-open moment is exactly the moment to subscribe. Said
                     only when every chosen half is known to be empty — with the
                     RIS half missing this would be a claim the page cannot make. -->
              <div v-if="!bund || risOnly" class="p-4">
                <EmptyState
                  title="Derzeit ist keine Begutachtung offen"
                  description="Neue Entwürfe erscheinen hier, sobald sie zur Begutachtung aufliegen."
                >
                  <!-- The header's own links (`SubscribeLinks`) rather than a
                         second set built here: one wording for the same three ways
                         to follow, wherever they stand. `leading-7` for the header's
                         reason, the links are `tap-target` boxes in the line. -->
                  <div>
                    <SubscribeLinks />
                  </div>
                </EmptyState>
              </div>
            </template>
          </EntryList>
          <!-- UNDER the box, not above it (12.11.2026): the line goes when the
                 rows come, and above the list it would pull the list up with it.
                 Where a failed half's line stands above, this one is not a
                 correction to the list but a note on its way to completion. -->
          <p v-if="openPendingLine && !openWaiting" class="mt-2 text-sm text-ink-muted">
            {{ openPendingLine }}
          </p>
        </li>
        <!-- The other doors, one row each (16.11.2026): the label is the way
             in, in blue — „you can do something here" —, beside it what is
             open, in the words of the list it leads to, or the loading words,
             or the gap sentence; a note under it where the label needs one.
             No tiles, no icons: a row of the list grammar, divided by the
             hairline. THE WHOLE ROW IS THE TARGET (16.11.2026), with one
             `<a>`: the label's link is stretched over the row by its
             `::after` (`relative` on the item), so the count, the note and
             a gap sentence lie under it while the link's name stays the
             label — they are read as what they are, not as a link's name.
             Hovering anywhere underlines the label, the site's one hover
             state; a bare row takes no ground (main.css, „naked bar/label:
             text only"); focus rings the label (`:focus-visible`). The notes
             are text only today; a link in one would need `relative z-10`
             to stay above the stretched one. `py-3` around a `text-lg` line
             is 52 px, above `min-h-target`. -->
        <li
          v-for="(row, i) in doorRows"
          :key="row.door.id"
          class="group relative border-b border-hairline py-3"
          :class="i === 0 ? 'mt-10 border-t' : ''"
        >
          <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <h3 class="text-lg font-semibold">
              <NuxtLink :to="row.door.href" class="link-quiet after:absolute after:inset-0 group-hover:underline group-hover:decoration-2">
                {{ row.door.label }}
              </NuxtLink>
            </h3>
            <!-- No „→" on the row (16.11.2026; tried at the row's end and
                 at the label within the hour): blue, bold, the hover's
                 underline and the lines around the row already say it leads
                 somewhere, and a fifth sign was decoration. The status has
                 the right end. -->
            <div class="ml-auto flex items-center">
              <GapNote v-if="row.status.kind === 'failed'" :text="row.status.text" class="text-sm text-ink-muted" />
              <p v-else-if="row.status.kind === 'loading'" class="text-sm text-ink-muted">
                {{ row.status.text }}
              </p>
              <!-- Something is open: the list rows' chip, in the calm blue
                   of a Frist not yet close (16.11.2026, `EntryState`) — the
                   same statement as „Stellungnahme möglich" in a row, so the
                   same sign, and all five doors end alike. One line: there
                   is one fact. Part of the row's link, no target of its own.
                   „Derzeit kein …" stays plain text: nothing to act on. -->
              <EntryState
                v-else-if="row.status.open && row.status.text"
                :state="{ label: row.status.text, detail: null, tone: 'neutral', actionable: true }"
              />
              <p v-else-if="row.status.text" class="text-sm tabular-nums text-ink-secondary">
                {{ row.status.text }}
              </p>
            </div>
          </div>
          <p v-if="row.door.note" class="mt-1 text-sm text-ink-secondary">
            {{ row.door.note }}
          </p>
          <template v-if="row.status.kind === 'answered'">
            <GapNote v-for="note in row.status.notes" :key="note" :text="note" class="mt-1 text-sm text-ink-muted" />
          </template>
        </li>
      </ul>
      <p class="mt-4">
        <NuxtLink :to="HOME_DE.wegeLink.href" class="tap-target text-sm font-medium link-quiet">
          {{ HOME_DE.wegeLink.label }} →
        </NuxtLink>
      </p>
    </section>

    <!-- WHAT BECAME OF IT (16.11.2026): one chapter for the following, the
         newest laws and the ranking, each a list of its own under it. -->
    <section v-if="data" class="page-section" aria-labelledby="follow-heading">
      <h2 id="follow-heading" class="section-heading">
        {{ HOME_DE.followHeading }}
      </h2>
      <!-- The chapter opens with the end of the chain since 17.11.2026
           (maintainer): participation that arrived somewhere, and the part
           of „Was daraus wurde" that changes, after every plenary week,
           where the ranking below spans the whole period. What stood here
           until 18.09.2026 was the most recently CLOSED Begutachtungen —
           four rows whose chip said "bisher keine Regierungsvorlage"
           because they were two weeks old and the median wait is 40 days.
           Predictable from the date beside it is not an outcome. The
           shelving half has not left the page; it sits below, on the rows
           where the wait has become evidence. -->
      <section class="mt-8" aria-labelledby="enacted-heading">
        <!-- This link pointed at „?status=closed" because the filter „im
             Bundesgesetzblatt" did not exist: it would have needed a station
             per row, which was a work package rather than a link.
             The station map exists since 18.09.2026, so the link now
             points at exactly the set the heading names. Still without a
             number: the section shows the newest Kundmachungen, and a number
             beside it would be the number of all of them. -->
        <ListHeader
          id="enacted-heading"
          :level="3"
          :to="enactedHref"
          noun="kundgemachten Entwürfe"
        >
          Zuletzt Gesetz geworden
        </ListHeader>
        <!-- „… – aus welcher Begutachtung" stood in the heading until
             18.09.2026 and was a duplicate twice over: the sentence below
             says it in full, and every row names its Ministerialentwurf.
             The heading states what the section is, the rows answer it.

             The rhythm said out loud, because it is the section's one
             surprise: this list can stand still for two months and then
             turn over almost completely. Better read as the institution's
             calendar than as a stale page. -->
        <!-- The Blöcke sentence explains why nothing moves here for weeks,
             and it is the wrong explanation during a fallback: then the list
             stands still because the period it belongs to is over. So the
             fallback replaces it rather than adding to it — one reason per
             state, and the true one. -->
        <p v-if="enactedLandLine" class="mt-2 text-sm text-ink-secondary">
          {{ enactedLandLine }}
        </p>
        <p v-else class="mt-2 text-sm text-ink-secondary">
          <template v-if="enactedIsFallback">Aus der {{ currentGp }}.
            Gesetzgebungsperiode ist noch kein Entwurf kundgemacht. Hier stehen
            deshalb die jüngsten Kundmachungen im Bundesgesetzblatt aus der
            {{ enactedGp }}. Gesetzgebungsperiode – und die Begutachtung, aus der
            sie hervorgegangen sind.</template>
          <template v-else>Die jüngsten Kundmachungen im Bundesgesetzblatt aus der
            <template v-if="enactedGp">{{ enactedGp }}. </template>Gesetzgebungsperiode
            – und die Begutachtung, aus der sie hervorgegangen sind. Der
            Nationalrat beschließt in Blöcken: zwischen zwei Plenarwochen ändert
            sich hier nichts.</template>
        </p>
        <!-- Same row and the same chip as the ranking below: the object
             is the Begutachtung, and what became of it goes in the aside.

             ALWAYS THE BOX since the chips stand in its head (30.10.2026),
             for the open list's reason: a box that vanished while loading or
             empty would take with it the control that could fill it. So the
             skeleton and both silences stand inside it. -->
        <!-- The chosen Länder cannot give this box a row: said in words
             (`noneApply`). Above the box while the Bund fills it, inside it
             where nothing does. -->
        <p v-if="bund && noneApply(ENACTED_UNAVAILABLE)" class="mt-2 text-sm text-ink-muted">
          {{ noneApply(ENACTED_UNAVAILABLE) }}
        </p>
        <EntryList :entries="enactedEntries" :heading-level="4" :state="!enactedEntries.length && enactedLoading ? { loading: HOME_LIST_DE.enactedLoading } : null" class="mt-4">
          <template #header>
            <SourceChips :unavailable="ENACTED_UNAVAILABLE" />
            <LandCoverageNote :lands="enactedLaender" where="kundgemacht" />
          </template>
          <template #empty>
            <!-- Two different silences, said differently: nothing promulgated
                 yet is a fact about the period, an unreachable endpoint is a
                 fact about us. -->
            <!-- Reached only when the period before has nothing either — the
                 fallback has already run by the time the page sees this. It
                 names the period rather than saying „dieser":
                 a demonstrative here points at nothing the reader
                 can see, and now there are two periods it could mean. -->
            <p v-if="!bund && noneApply(ENACTED_UNAVAILABLE)" class="p-4 text-sm text-ink-muted">
              {{ noneApply(ENACTED_UNAVAILABLE) }}
            </p>
            <p v-else-if="enactedAnswered && enactedLaender.length" class="p-4 text-sm text-ink-muted">
              Aus den gewählten Quellen ist in diesem Zeitraum bisher kein Entwurf
              kundgemacht worden.
            </p>
            <p v-else-if="enactedAnswered" class="p-4 text-sm text-ink-muted">
              Aus der <template v-if="enactedGp">{{ enactedGp }}. </template>Gesetzgebungsperiode
              ist bisher kein Entwurf im Bundesgesetzblatt kundgemacht worden.
            </p>
            <GapNote v-else kind="unavailable" text="die Kundmachungen." class="p-4 text-sm text-ink-muted" />
          </template>
        </EntryList>
        <!-- One half missing while the other has rows: said, so the list does
             not read as if that half had promulgated nothing. -->
        <template v-if="enactedEntries.length">
          <GapNote v-if="bund && enactedState === 'failed'" kind="unavailable" text="die Kundmachungen des Bundes." class="mt-2 text-sm text-ink-muted" />
          <p v-for="line in enactedPendingLines" :key="line" class="mt-2 text-sm text-ink-muted">
            {{ line }}
          </p>
          <GapNote v-for="s in unreadableRecent" :key="s.land" kind="unavailable" :text="`die Kundmachungen des Landes ${LAND_NAME[s.land]}.`" class="mt-2 text-sm text-ink-muted" />
        </template>
      </section>

      <!-- Below the newest laws since 17.11.2026 (maintainer): it spans the
           whole period and barely moves between visits. These five rows
           carry change and standstill with the stakes attached: 707
           Stellungnahmen that became a Gesetz, 616 that have been waiting
           since Oktober 2025. Ordered by participation, never by outcome:
           Nachverfolgung, kein Punktestand. Until 17.11.2026 it opened the
           chapter, because the list then below it was four rows of
           „bisher keine Regierungsvorlage" (ME→RV latency, not shelving);
           that list became the newest laws on 18.09.2026, and the reason
           went with it. -->
      <section
        v-if="rankedRows.length"
        class="mt-12"
        aria-labelledby="ranked-heading"
      >
        <!-- The link continues the ranking rather than pointing at the pool
             it was drawn from: `?sort=stellungnahmen` is the same order,
             uncut, and `?art=gesetz` keeps the Verordnungen out, which
             the sort cannot speak about — a draft without a Gegenstand has
             no Stellungnahmen count and never will. The count is
             the GP's Ministerialentwürfe: the ranked rows behind the link,
             ahead of the few law drafts without a Gegenstand (and any
             chosen Land's) that stand unranked after them since
             23.10.2026. -->
        <ListHeader
          id="ranked-heading"
          :level="3"
          :to="rankedHref"
          noun="Ministerialentwürfe"
          :total="bund ? data.ranked.total : undefined"
          :visible="rankedShown.length"
        >
          Wo am meisten mitgeredet wurde
        </ListHeader>
        <!-- „… – und was daraus wurde" left the heading on 18.09.2026, for
             the reason the section below it lost its second half: the
             sentence under the heading says it, and the outcome sits as a
             chip on every closed row. What made this section stop being a
             leaderboard was never the heading — it was the chips. -->
        <!-- Volumetric, not "gerade": the ranking spans the whole GP,
             open and closed — the Frist line under each count says which
             is which. -->
        <!-- The fallback says itself, in its own sentence and BEFORE the
             claim it qualifies. Naming the period inside the
             existing sentence would have been enough to be accurate and not
             enough to be read: „der XXVIII." where the reader expects
             „XXIX." is a single changed numeral in the middle of a line.
             The reason goes first, then the ordinary sentence with the
             ordinary period in it. -->
        <p class="mt-2 text-sm text-ink-secondary">
          <template v-if="rankedIsFallback">Die {{ currentGp }}. Gesetzgebungsperiode
            hat dafür noch zu wenige Begutachtungen. Hier stehen deshalb die
            Entwürfe</template><template v-else>Die Entwürfe</template> mit den
          meisten Stellungnahmen der
          <template v-if="rankedGp">{{ rankedGp }}. </template>Gesetzgebungsperiode<template
            v-if="rankedGpStart"
          > (seit {{ rankedGpStart }})</template> – offene und abgeschlossene – und
          daneben, was aus ihnen geworden ist.
        </p>
        <!-- The chosen Länder cannot give this box a row: said in words
             (`noneApply`). Above the box while the Bund fills it, inside it
             where nothing does. -->
        <p v-if="bund && noneApply(RANKED_UNAVAILABLE)" class="mt-2 text-sm text-ink-muted">
          {{ noneApply(RANKED_UNAVAILABLE) }}
        </p>
        <!-- The same anatomy as everywhere, and here that is the point: the
             number that is ranked by stands in THE SAME column as in every
             other section, and the outcome beside it rather than in its place.

             Until 18.09.2026 this section promoted the number into the
             right-hand slot and thereby EVICTED the outcome. But „846
             Stellungnahmen → Bisher keine Regierungsvorlage" IS the tracking;
             the pair is the statement, not the number alone (what stopped
             this section being a leaderboard were the
             chips). A ranked list shows its key by ORDER — the number needs
             alignment, not enlargement. An ordered list, because the order
             carries meaning here. -->
        <EntryList :entries="rankedShown" ordered :heading-level="4" class="mt-4">
          <template #header>
            <SourceChips :unavailable="RANKED_UNAVAILABLE" />
          </template>
          <template #empty>
            <p class="p-4 text-sm text-ink-muted">{{ noneApply(RANKED_UNAVAILABLE) }}</p>
          </template>
        </EntryList>
        <p v-if="outcomesLine" class="mt-2 text-sm text-ink-muted">
          {{ outcomesLine }}
        </p>
      </section>

      <!-- NO credit line of its own (03.10.2026, tried and removed within
           the hour): nothing here is a document and nothing shown is marked
           or classified by us, so the page has no per-section claim to
           make. The per-block lines are the draft page's grammar, where the
           publisher differs per section and our own marking must survive a
           screenshot; here the footer's „Datenquellen und Lizenzen im
           Impressum" link is the page's attribution — CC BY 4.0 § 3 a (2)
           allows a link to the page carrying it. -->
    </section>
  </div>
</template>
