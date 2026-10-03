/**
 * The two halves `/entwuerfe` merges — the Ministerialentwürfe and the
 * Begutachtungen without a Gegenstand — fetched, gated and retried as the
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
import type { DraftsResponse, RisConsultationsResponse } from '#shared/types'
import type { ArtFilter } from '~/utils/draftFilters'
import { unionGps, unionMinistries } from '~/utils/draftFilters'
import type { DraftFilters } from '~/composables/useDraftFilters'

export function useDraftHalves(filters: {
  art: Ref<ArtFilter>
  gp: Ref<string>
  query: DraftFilters['query']
}) {
  const { art, gp, query } = filters

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
  const wantsMe = computed(() => art.value !== 'verordnung')
  const wantsRis = computed(() => art.value !== 'ministerialentwurf')

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
    { query, timeout: 8000, enabled: wantsRis, watch: [wantsRis] },
  )

  const { data: meFetched, error, refresh, status } = draftsFetch
  const { data: risFetched, error: risError, status: risStatus, refresh: risRefresh } = risFetch

  /* What this `art` asks for, and nothing else. A `useFetch` handle keeps the
   * answer it last gave when it is switched off, so without this cut the count
   * line, the Ressort menu and „in zweiter Runde" would go on counting a half
   * that is not on the page any more after a toggle. */
  const meData = computed(() => (wantsMe.value ? meFetched.value : null))
  const risData = computed(() => (wantsRis.value ? risFetched.value : null))

  /**
   * The gate follows the half that carries the page.
   *
   * That is the Ministerialentwürfe wherever they are asked for; the RIS half
   * beside them stays enrichment, and its absence is stated in the count line
   * rather than by an error card. Under „Verordnungsentwürfe" nothing stands
   * beside it: it is the page's own data then, and it decides loading,
   * failure and retry the way the other half does otherwise.
   */
  const gateStatus = computed(() => (wantsMe.value ? status.value : risStatus.value))
  const gateError = computed(() => (wantsMe.value ? error.value : risError.value))
  const gateData = computed(() => (wantsMe.value ? meData.value : risData.value))

  /* Retries whichever halves this `art` asks for — a switched-off handle
   * refuses by itself (`enabled`). */
  function retry(): void {
    void refresh()
    void risRefresh()
  }

  const selectedGp = computed({
    get: () => gp.value || meData.value?.gp || risData.value?.gp || '',
    set: (value: string) => {
      gp.value = value
    },
  })

  /* The menus: the union of the halves that are asked for (`unionGps`). */
  const availableGps = computed(() => unionGps(meData.value?.availableGps, risData.value?.availableGps))
  const ministries = computed(() => unionMinistries(meData.value?.ministries, risData.value?.ministries))

  /** Both fetches settled — the page awaits this beside its own fetch. */
  const ready: Promise<void> = Promise.all([draftsFetch, risFetch]).then(() => {})

  return {
    wantsMe,
    wantsRis,
    meData,
    risData,
    /** The RIS half's failure — stated in the count line while it is enrichment. */
    risError,
    gateStatus,
    gateError,
    gateData,
    retry,
    selectedGp,
    availableGps,
    ministries,
    ready,
  }
}
