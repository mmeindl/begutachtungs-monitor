/**
 * The halves `/entwuerfe` merges — the Ministerialentwürfe, the
 * Begutachtungen without a Gegenstand and, since 22.10.2026, the Länder — fetched, gated and retried as the
 * page needs them.
 *
 * Synchronous on purpose: both fetches start here and the page awaits
 * `ready` once its own fetch is started too, so all of them overlap instead
 * of queueing. Awaited one after the other, the RIS corpus's runtime was
 * added to that of the Ministerialentwürfe although neither needs anything
 * from the other — the homepage's pattern, for the same reason. (And an
 * `await` inside a composable would leave everything built after it outside
 * the component's scope.)
 *
 * THE LIST NO LONGER WAITS FOR EVERY HALF (12.11.2026). Until then it
 * showed rows only once each half asked for had answered — on the server
 * too, which ignores `lazy`. The Länder half carries a 30 s budget for a
 * cold read (Salzburg's register), so a reader with a Land chosen could
 * look at a skeleton for up to 30 s, and a shared link's HTML waited as
 * long. Now the rows that are there stand, and a half on its way is said
 * in the count line, in the register of a failed one (`draftCountLabel`).
 * The RIS and Länder halves race a server deadline (`useLateFetch`, which
 * was this file's `useLateHalf` until the homepage needed it too); the
 * Ministerialentwürfe do not — they carry the page.
 */
import type { Ref } from 'vue'
import type { DraftsResponse, LaenderResponse, RisConsultationsResponse } from '#shared/types'
import type { ArtFilter } from '~/utils/draftFilters'
import { draftKindArt, halfState, lateHalves, unionGps, unionMinistries } from '~/utils/draftFilters'
import type { DraftFilters } from '~/composables/useDraftFilters'
import { useLateFetch } from '~/composables/useLateFetch'

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
   * just the rows, since 23.09.2026.
   *
   * `/api/drafts` holds Ministerialentwürfe and nothing else, all of them
   * law drafts, so under „Verordnungsentwürfe" there is nothing for it to
   * answer. Both halves were fetched whatever the filter said until then and
   * one of them was dropped in the browser: the server-rendered payload of a
   * filtered list carried both in full, 218 KB, against the 152 KB resp.
   * 67 KB it carried filtered (measured 23.09.2026).
   *
   * The RIS half is asked for under every Art since the filter names kinds
   * (23.10.2026) — it holds law drafts too, four in GP XXVIII — and narrowed
   * upstream: `/api/ris-drafts?art=` takes the instrument kind in the same
   * words, so „Gesetzesentwürfe" ships four records, not 210. Under „Alle
   * Arten" it goes without `art`, the records of kind `unbestimmt` included.
   */
  /* The chip's two Art values (`vorlage`, `antrag`) are no draft kind: the
   * halves read them as „Alle Arten" (`draftKindArt`). */
  const kindArt = computed(() => draftKindArt(art.value))
  const wantsMe = computed(() => bund.value && kindArt.value !== 'verordnung')
  const wantsRis = computed(() => bund.value)
  const risQuery = computed(() => (kindArt.value ? { ...query.value, art: kindArt.value } : query.value))

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
  const risFetch = useLateFetch<RisConsultationsResponse>(
    '/api/ris-drafts',
    () => risQuery.value,
    { timeout: 8000, wanted: wantsRis },
  )

  /* The THIRD half since 22.10.2026: the Länder's drafts for the period,
   * running and closed (`/api/laender?gp&status`). Only the period and the
   * status go upstream; the Land, the Art and the search apply on the page,
   * so one answer serves every choice. The generous timeout is Salzburg's
   * register, thirteen seconds cold — prewarmed, but a list may not cut it
   * off, or a period would lose Salzburg's closed drafts without a word.
   * Since 12.11.2026 that budget no longer holds the list (`useLateFetch`). */
  const laenderFetch = useLateFetch<LaenderResponse>(
    '/api/laender',
    () => ({ gp: query.value.gp, status: query.value.status }),
    { timeout: 30000, wanted: wantsLaender },
  )

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
   * Every fetch is `lazy` (04.10.2026): a click shows the page at once
   * instead of holding the previous one until the halves have answered.
   *
   * Where each half stands (`halfState`). Until 12.11.2026 the gate held
   * until EVERY half asked for had its first answer, on the argument that
   * the RIS and Länder rows sort in between the others by Frist, and a list
   * drawn from one half would reorder under the reader and count „0" of the
   * other meantime. Revised because the wait it bought was measured at up to
   * 30 s (a cold Länder read): the gate follows the lead half only. The
   * other two arguments are answered where they arise — the count line says
   * which half is still on its way instead of counting it as 0
   * (`draftCountLabel`), and the rows sorting in keep the reader's cut and
   * scroll position (`/entwuerfe`, `cutKeeping`). Once per page load: a
   * filter that refetches keeps the rows standing, as before.
   */
  const states = computed(() => ({
    me: halfState(wantsMe.value, meFetched.value, error.value),
    ris: halfState(wantsRis.value, risFetched.value, risError.value),
    laender: halfState(wantsLaender.value, laenderFetched.value, laenderError.value),
  }))

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
    return ({ off: 'idle', loading: 'pending', ready: 'success', failed: 'error' } as const)[states.value[lead.value]]
  })
  const gateData = computed(() => {
    if (nothingWanted.value) return {}
    if (states.value[lead.value] !== 'ready') return null
    return { me: meData.value, ris: risData.value, laender: laenderData.value }[lead.value]
  })
  /** The halves still on their way beside rows already shown (12.11.2026). */
  const pendingHalves = computed(() => lateHalves(lead.value, states.value))
  /* The rows on screen answer the PREVIOUS filter (24.10.2026): some half
   * that is asked for is fetching again after an answer. The list keeps
   * them standing and marks them stale instead of passing them off as the
   * answer — any half, not only the lead, because the RIS and Länder rows
   * sort in among the others. A half with no answer yet is not stale but
   * pending (`pendingHalves`). */
  const refreshing = computed(() =>
    (states.value.me === 'ready' && status.value === 'pending') ||
    (states.value.ris === 'ready' && risStatus.value === 'pending') ||
    (states.value.laender === 'ready' && laenderStatus.value === 'pending'),
  )

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

  /** The fetches settled — on the server, the late halves at their
   *  deadline at most. The page awaits this beside its own fetch. */
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
    states,
    pendingHalves,
    gateStatus,
    gateData,
    refreshing,
    retry,
    selectedGp,
    availableGps,
    ministries,
    ready,
  }
}
