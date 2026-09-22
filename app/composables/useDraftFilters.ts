/**
 * The corpus list's filter state: initialised from the URL, written back to
 * it, and turned into the query both list endpoints are asked with.
 *
 * The parsing and serialising half is `app/utils/draftFilters.ts`, where it
 * is tested. What is left here is the reactivity — which refs there are, when
 * the search term settles, and when the URL is rewritten.
 */
import type { ComputedRef, Ref } from 'vue'
import type { DraftStation, DraftStatus } from '#shared/types'
import {
  type ArtFilter,
  type SortKey,
  draftApiQuery,
  draftFiltersFromQuery,
  draftUrlQuery,
} from '~/utils/draftFilters'

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
  toggleStation: (value: DraftStation) => void
  query: ComputedRef<ReturnType<typeof draftApiQuery>>
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

  /* One chip on/off. An empty selection means „alle Stationen" and does not
   * go into the URL — a filter that excludes nothing does not belong in a
   * link somebody passes on. */
  function toggleStation(value: DraftStation): void {
    stations.value = stations.value.includes(value)
      ? stations.value.filter((s) => s !== value)
      : [...stations.value, value]
  }

  let qTimer: ReturnType<typeof setTimeout> | undefined
  watch(q, (value) => {
    clearTimeout(qTimer)
    qTimer = setTimeout(() => {
      qDebounced.value = value.trim()
    }, 300)
  })
  onUnmounted(() => clearTimeout(qTimer))

  /* Only the five the endpoints take: `art` and `sort` must not be in this
   * computed, or changing either would hand `useFetch` a new object and
   * refetch both lists for a cut that happens in the browser. */
  const query = computed(() =>
    draftApiQuery({
      status: statusFilter.value,
      stations: stations.value,
      gp: gp.value,
      ministry: ministry.value,
      q: qDebounced.value,
    }),
  )

  // Keep the URL in sync with the filters (defaults stay out of the URL).
  watch([query, art, sort], () => {
    router.replace({
      query: draftUrlQuery({
        status: statusFilter.value,
        stations: stations.value,
        art: art.value,
        gp: gp.value,
        ministry: ministry.value,
        q: qDebounced.value,
        sort: sort.value,
      }),
    })
  })

  return { statusFilter, art, gp, ministry, q, qDebounced, sort, stations, toggleStation, query }
}
