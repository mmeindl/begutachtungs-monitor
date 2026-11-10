/**
 * The corpus list's filter state: read from the URL, written back to it, and
 * turned into the query both list endpoints are asked with.
 *
 * The parsing and serialising half is `app/utils/draftFilters.ts`, where it
 * is tested. What is left here is the reactivity — which refs there are, when
 * the search term settles, when the URL is rewritten, and when a navigation
 * rewrites the state.
 */
import type { ComputedRef, Ref } from 'vue'
import type { DraftStation, DraftStatus } from '#shared/types'
import {
  type ArtFilter,
  type BegutachtungFilter,
  type DraftFilterValues,
  type EuFilter,
  type SortKey,
  draftApiQuery,
  draftFiltersFromQuery,
  draftUrlQuery,
  sameDraftFilters,
  coherentFilters,
} from '~/utils/draftFilters'
import { SOURCE_PARAM } from '#shared/utils/laender'

export interface DraftFilters {
  statusFilter: Ref<DraftStatus>
  art: Ref<ArtFilter>
  gp: Ref<string>
  ministry: Ref<string>
  /** What is in the search box right now. */
  q: Ref<string>
  /** The same term 300 ms later, trimmed — what actually filters. */
  qDebounced: Ref<string>
  sort: Ref<SortKey>
  reversed: Ref<boolean>
  stations: Ref<DraftStation[]>
  /** „Setzt EU-Recht um" — goes to both Bund endpoints; the Länder rows are filtered on the page. */
  eu: Ref<EuFilter>
  /** „Ohne Begutachtung" — the page's own filter, no endpoint takes it (`BegutachtungFilter`). */
  begutachtung: Ref<BegutachtungFilter>
  query: ComputedRef<ReturnType<typeof draftApiQuery>>
  /** Runs `handler` after a navigation has set the filters from its URL —
   *  for state the page keeps beside them. */
  onNavigate: (handler: () => void) => void
}

export function useDraftFilters(): DraftFilters {
  const route = useRoute()
  const router = useRouter()

  // Filter state, initialized from the URL so links are shareable.
  const initial = draftFiltersFromQuery(route.query)
  const statusFilter = ref<DraftStatus>(initial.status)
  const art = ref<ArtFilter>(initial.art)
  const gp = ref(initial.gp)
  const ministry = ref(initial.ministry)
  const q = ref(initial.q)
  const qDebounced = ref(initial.q)
  /* Client-side, unlike the filters above: both endpoints already ship the
   * whole filtered set, so reordering it costs no request — and the merge of
   * the two halves happens in the page anyway (`rows`). */
  const sort = ref<SortKey>(initial.sort)
  const reversed = ref(initial.reversed)
  const stations = ref<DraftStation[]>(initial.stations)
  const eu = ref<EuFilter>(initial.eu)
  const begutachtung = ref<BegutachtungFilter>(initial.begutachtung)

  let qTimer: ReturnType<typeof setTimeout> | undefined
  watch(q, (value) => {
    clearTimeout(qTimer)
    qTimer = setTimeout(() => {
      qDebounced.value = value.trim()
    }, 300)
  })
  onUnmounted(() => clearTimeout(qTimer))

  /* Only the six the endpoints take. `sort` must not be in this computed,
   * or reordering would hand `useFetch` a new object and refetch both lists
   * for something the browser does. `art` stays out for a different reason:
   * neither endpoint takes it in this vocabulary — it decides which of the
   * two the page asks at all, and the page watches it for that. */
  const query = computed(() =>
    draftApiQuery({
      status: statusFilter.value,
      stations: stations.value,
      gp: gp.value,
      ministry: ministry.value,
      q: qDebounced.value,
      eu: eu.value,
    }),
  )

  /* The filters as the URL carries them: the settled search term, not the
   * one still being typed. */
  const current = (): DraftFilterValues => ({
    status: statusFilter.value,
    stations: stations.value,
    art: art.value,
    gp: gp.value,
    ministry: ministry.value,
    q: qDebounced.value,
    sort: sort.value,
    reversed: reversed.value,
    eu: eu.value,
    begutachtung: begutachtung.value,
  })

  /* An Art the new state does not offer reads as „Alle Arten" — the chip
   * „Ohne Ministerialentwurf" has its own two (`coherentArt`, 10.11.2026). */
  watch(begutachtung, (b) => { art.value = coherentFilters({ art: art.value, ministry: ministry.value }, b, false).art })

  // Keep the URL in sync with the filters (defaults stay out of the URL).
  /* `quellen` is not this list's filter but the site's choice of sources
   * (`useSourceChoice`), and the write-back must not drop it. */
  function writeUrl(): void {
    const quellen = route.query[SOURCE_PARAM]
    router.replace({ query: { ...draftUrlQuery(current()), ...(quellen !== undefined ? { [SOURCE_PARAM]: quellen } : {}) } })
  }
  watch([query, art, sort, reversed, begutachtung], writeUrl)

  /* A link whose `art` the state does not offer (`coherentArt`) is read as
   * „Alle Arten" — and the value leaves the URL too, so the address says
   * what the list shows (10.11.2026). Nothing else is rewritten. */
  const strayArt = (routeQuery: Record<string, unknown>): boolean =>
    routeQuery.art !== undefined && draftUrlQuery(draftFiltersFromQuery(routeQuery)).art === undefined
  onMounted(() => {
    if (strayArt(route.query)) writeUrl()
  })

  /**
   * And the other way round: the filters follow a navigation that changes
   * only the query.
   *
   * Nuxt keys a page by its path, so the header's „Entwürfe" from a list the
   * homepage opened filtered, and Back or Forward between two such lists,
   * keep this component — and until 22.10.2026 its filters, which were read
   * once. The address said `/entwuerfe` under a list still filtered by chip,
   * tab and count. Remounting on every query (a `pageKey` of the full path)
   * would cure that and drop the search field's focus on each debounced
   * keystroke, because the write-back above is a navigation too.
   *
   * That write-back arrives here like any other navigation and is told apart
   * by what it says: the state it was written from (`sameDraftFilters`). Any
   * other query sets every filter as at setup — the typed and the settled
   * term together, so the debounce cannot bring the old term back.
   */
  const navigateHandlers: (() => void)[] = []
  watch(() => route.query, (routeQuery) => {
    const next = draftFiltersFromQuery(routeQuery)
    if (sameDraftFilters(next, current())) {
      // Same state, but a stray `art` in the address: take it out.
      if (strayArt(routeQuery)) writeUrl()
      return
    }
    clearTimeout(qTimer)
    statusFilter.value = next.status
    art.value = next.art
    gp.value = next.gp
    ministry.value = next.ministry
    q.value = next.q
    qDebounced.value = next.q
    sort.value = next.sort
    reversed.value = next.reversed
    stations.value = next.stations
    eu.value = next.eu
    begutachtung.value = next.begutachtung
    for (const handler of navigateHandlers) handler()
  })

  return {
    statusFilter,
    art,
    gp,
    ministry,
    q,
    qDebounced,
    sort,
    reversed,
    stations,
    eu,
    begutachtung,
    query,
    onNavigate: (handler) => {
      navigateHandlers.push(handler)
    },
  }
}
