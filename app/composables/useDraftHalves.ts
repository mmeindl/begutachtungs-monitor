/**
 * The halves `/entwuerfe` merges — the Ministerialentwürfe, the
 * Begutachtungen without a Gegenstand and, since 22.10.2026, the Länder — fetched, gated and retried as the
 * page needs them (docs/architecture.md §7, §12.19).
 *
 * Synchronous on purpose: both fetches start here and the page awaits
 * `ready` once its own fetch is started too, so all of them overlap instead
 * of queueing. Awaited one after the other, the RIS corpus's runtime was
 * added to that of the Ministerialentwürfe although neither needs anything
 * from the other — the homepage's pattern, for the same reason. (And an
 * `await` inside a composable would leave everything built after it outside
 * the component's scope.)
 */
import type { Ref } from 'vue'
import type { DraftsResponse, LaenderResponse, RisConsultationsResponse } from '#shared/types'
import type { ArtFilter } from '~/utils/draftFilters'
import { unionGps, unionMinistries } from '~/utils/draftFilters'
import type { DraftFilters } from '~/composables/useDraftFilters'

export function useDraftHalves(filters: {
  art: Ref<ArtFilter>
  gp: Ref<string>
  query: DraftFilters['query']
  /** The Bund is among the reader's sources (`useSourceChoice`, 22.10.2026). */
  bund: Ref<boolean>
  /** A chosen Land can join this view (the page decides, `landUnavailable`). */
  wantsLaender: Ref<boolean>
}) {
  const { art, gp, query, bund, wantsLaender } = filters

  /**
   * WHICH HALVES THIS `art` ASKS FOR — the filter decides the REQUEST, not
   * just the rows, since 23.09.2026 (docs/architecture.md §7).
   *
   * `art` is the one control here that does not narrow a list: it names one
   * of the two halves this page merges. `/api/drafts` holds
   * Ministerialentwürfe and nothing else, so under „Verordnungsentwürfe"
   * there is nothing for it to answer; the RIS half is the whole other half.
   * Both were fetched whatever the filter said until then and one of them
   * was dropped in the browser: the server-rendered payload of a filtered
   * list carried both halves in full, 218 KB, against the 152 KB
   * („Verordnungsentwürfe") resp. 67 KB („Ministerialentwürfe") it carries
   * now (measured 23.09.2026).
   *
   * NOT a query parameter of either endpoint. `/api/ris-drafts?art=` exists
   * but means something else — the instrument kind,
   * `verordnung|gesetz|unbestimmt` — and handing this filter's `verordnung`
   * to it would drop the three records of the half that are no Verordnungen
   * (198 of 201, measured 23.09.2026). Those are the „und andere" of the
   * label and they belong on the page.
   */
  const wantsMe = computed(() => bund.value && art.value !== 'verordnung')
  const wantsRis = computed(() => bund.value && art.value !== 'ministerialentwurf')

  /* `enabled` keeps the request from being made at all, on the server too, so
   * a filtered list ships only the half it renders. Watched is the half's own
   * wanted-ness and not `art`: switching between the halves then fetches the
   * one that is newly wanted and leaves the other untouched. Switching back
   * fetches again — the same as every other filter on this page, which are all
   * URL-driven and keyed into `useFetch`. */
  const draftsFetch = useFetch<DraftsResponse>('/api/drafts', {
    query,
    enabled: wantsMe,
    watch: [wantsMe],
    lazy: true,
  })

  /**
   * The other half, and it is the OPTIONAL one — as long as both are asked
   * for.
   *
   * Its rows come from the RIS Begut corpus — 46 paged requests with a pause
   * between them when the cache is cold, measured at 46 s right after a
   * restart against 0,22 s warm. The Ministerialentwürfe must never wait for
   * that, so this fetch carries a budget and the page renders without it: the
   * same rule as everywhere else here, enrichment is never a fact the page
   * depends on. A failure is stated, not swallowed — the count line must not
   * report "0 ohne Gegenstand" when the truth is "we could not look".
   *
   * Under „Verordnungsentwürfe" it stops being the optional half: nothing
   * stands beside it there, so it carries the page and the gate follows it
   * (`gateStatus`).
   */
  const risFetch = useFetch<RisConsultationsResponse>(
    '/api/ris-drafts',
    { query, timeout: 8000, enabled: wantsRis, watch: [wantsRis], lazy: true },
  )

  /* The THIRD half since 22.10.2026: the Länder's drafts for the period,
   * running and closed (`/api/laender?gp&status`). Only the period and the
   * status go upstream; the Land, the Art and the search apply on the page,
   * so one answer serves every choice. The generous timeout is Salzburg's
   * register, thirteen seconds cold — prewarmed, but a list may not cut it
   * off, or a period would lose Salzburg's closed drafts without a word. */
  const laenderQuery = computed(() => ({ gp: query.value.gp, status: query.value.status }))
  const laenderFetch = useFetch<LaenderResponse>('/api/laender', {
    query: laenderQuery,
    timeout: 30000,
    enabled: wantsLaender,
    watch: [wantsLaender],
    lazy: true,
  })

  const { data: meFetched, error, refresh, status } = draftsFetch
  const { data: risFetched, error: risError, status: risStatus, refresh: risRefresh } = risFetch
  const { data: laenderFetched, error: laenderError, status: laenderStatus, refresh: laenderRefresh } = laenderFetch

  /* What this `art` asks for, and nothing else. A `useFetch` handle keeps the
   * answer it last gave when it is switched off, so without this cut the count
   * line, the Ressort menu and „in zweiter Runde" would go on counting a half
   * that is not on the page any more after a toggle. */
  const meData = computed(() => (wantsMe.value ? meFetched.value : null))
  const risData = computed(() => (wantsRis.value ? risFetched.value : null))
  const laenderData = computed(() => (wantsLaender.value ? laenderFetched.value : null))

  /**
   * Both fetches are `lazy` (04.10.2026): a click shows the page at once
   * instead of holding the previous one until the halves have answered — the
   * RIS half's 8 s budget included. The server ignores `lazy` and waits, so
   * the HTML of a shared link or a crawl is what it was.
   *
   * After a click the gate therefore holds until every half that is asked
   * for has its FIRST answer: the RIS rows sort in between the others by
   * Frist, and a list drawn from one half would reorder under the reader and
   * count „0" of the other in the meantime. Only the first: a filter that
   * refetches keeps the rows standing, as before (`FetchGate`).
   */
  const firstAnswerPending = computed(() =>
    (wantsMe.value && !meFetched.value && !error.value) ||
    (wantsRis.value && !risFetched.value && !risError.value) ||
    (wantsLaender.value && !laenderFetched.value && !laenderError.value),
  )

  /**
   * The gate follows the half that carries the page.
   *
   * That is the Ministerialentwürfe wherever they are asked for; the RIS half
   * beside them stays enrichment, and its absence is stated in the count line
   * rather than by an error card. Under „Verordnungsentwürfe" nothing stands
   * beside it: it is the page's own data then, and it decides loading,
   * failure and retry the way the other half does otherwise.
   */
  /* With the Bund turned off (22.10.2026) the Länder carry the page alone. */
  const lead = computed<'me' | 'ris' | 'laender'>(() => (wantsMe.value ? 'me' : wantsRis.value ? 'ris' : 'laender'))
  /* Nothing asked for at all — the Bund off and the view excluding the
   * Länder (a later station): the page stands, with an empty list and the
   * chips saying why, instead of a gate waiting for a fetch never made. */
  const nothingWanted = computed(() => !wantsMe.value && !wantsRis.value && !wantsLaender.value)
  const gateStatus = computed(() => {
    if (nothingWanted.value) return 'success'
    if (firstAnswerPending.value) return 'pending'
    return { me: status.value, ris: risStatus.value, laender: laenderStatus.value }[lead.value]
  })
  const gateData = computed(() => {
    if (nothingWanted.value) return {}
    if (firstAnswerPending.value) return null
    return { me: meData.value, ris: risData.value, laender: laenderData.value }[lead.value]
  })

  /* Retries whichever halves this `art` asks for — a switched-off handle
   * refuses by itself (`enabled`). */
  function retry(): void {
    void refresh()
    void risRefresh()
    void laenderRefresh()
  }

  const selectedGp = computed({
    get: () => gp.value || meData.value?.gp || risData.value?.gp || laenderData.value?.gp || '',
    set: (value: string) => {
      gp.value = value
    },
  })

  /* The menus: the union of the halves that are asked for (`unionGps`). */
  const availableGps = computed(() => unionGps(meData.value?.availableGps, risData.value?.availableGps, laenderData.value?.availableGps))
  const ministries = computed(() => unionMinistries(meData.value?.ministries, risData.value?.ministries))

  /** Both fetches settled — the page awaits this beside its own fetch. */
  const ready: Promise<void> = Promise.all([draftsFetch, risFetch, laenderFetch]).then(() => {})

  return {
    wantsMe,
    wantsRis,
    meData,
    risData,
    /** The RIS half's failure — stated in the count line while it is enrichment. */
    risError,
    laenderData,
    laenderStatus,
    laenderError,
    gateStatus,
    gateData,
    retry,
    selectedGp,
    availableGps,
    ministries,
    ready,
  }
}
