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
  type DraftFilterValues,
  type SortKey,
  draftApiQuery,
  draftFiltersFromQuery,
  draftUrlQuery,
  sameDraftFilters,
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
  stations: Ref<DraftStation[]>
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
  const stations = ref<DraftStation[]>(initial.stations)

  let qTimer: ReturnType<typeof setTimeout> | undefined
  watch(q, (value) => {
    clearTimeout(qTimer)
    qTimer = setTimeout(() => {
      qDebounced.value = value.trim()
    }, 300)
  })
  onUnmounted(() => clearTimeout(qTimer))

  /* Only the five the endpoints take. `sort` must not be in this computed,
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
  })

  // Keep the URL in sync with the filters (defaults stay out of the URL).
  /* `quellen` is not this list's filter but the site's choice of sources
   * (`useSourceChoice`), and the write-back must not drop it. */
  watch([query, art, sort], () => {
    const quellen = route.query[SOURCE_PARAM]
    router.replace({ query: { ...draftUrlQuery(current()), ...(quellen !== undefined ? { [SOURCE_PARAM]: quellen } : {}) } })
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
    if (sameDraftFilters(next, current())) return
    clearTimeout(qTimer)
    statusFilter.value = next.status
    art.value = next.art
    gp.value = next.gp
    ministry.value = next.ministry
    q.value = next.q
    qDebounced.value = next.q
    sort.value = next.sort
    stations.value = next.stations
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
    stations,
    query,
    onNavigate: (handler) => {
      navigateHandlers.push(handler)
    },
  }
}
