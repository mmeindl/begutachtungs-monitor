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
import type { LocationQueryRaw } from 'vue-router'
import type { DraftStation, DraftStatus, LandCode } from '#shared/types'
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
import { type CustomSpan, type PeriodView, coherentSpan, customSpanOf, laenderSpanQuery, periodViewFor } from '#shared/utils/periodCalendar'

export interface DraftFilters {
  statusFilter: Ref<DraftStatus>
  art: Ref<ArtFilter>
  gp: Ref<string>
  /** A Land's own period, `sbg-17` (`?landtag=`), or '' — see `span` for what applies. */
  landtag: Ref<string>
  /** A span of the reader's own (`?von=&bis=`, 18.11.2026): ISO days, '' when unset; `bis` '' runs to today. */
  von: Ref<string>
  bis: Ref<string>
  /**
   * That span held against the Bund's calendar (`customSpanOf`): the period
   * its rows are fetched for, the days they are cut to, the part a
   * Periodenwechsel cuts off. Null while no such span applies.
   */
  customSpan: ComputedRef<CustomSpan | null>
  /** Which calendar names the span, by the sources (`periodViewFor`, 14.11.2026). */
  periodView: ComputedRef<PeriodView>
  /**
   * The span that APPLIES: `gp` and `landtag` held against the sources
   * (`coherentSpan`) — or, while a span of the reader's own applies, the
   * Bund period it is fetched for (`customSpan`), so every fetch and every
   * check of an answer's period works as for a chosen period. Read this,
   * never the refs, for anything that
   * filters — between a source toggle and the navigation it starts the refs
   * may still hold a span the control no longer offers.
   */
  span: ComputedRef<{ gp: string; landtag: string }>
  /** What the Länder endpoints are asked for (`laenderSpanQuery`). */
  laenderSpan: ComputedRef<{ gp?: string; landtag?: string }>
  ministry: Ref<string>
  /** What is in the search box right now. */
  q: Ref<string>
  /** The same term 300 ms later, trimmed — what actually filters, on the
   *  page and not upstream (`searchBundHalves`, 12.11.2026). */
  qDebounced: Ref<string>
  sort: Ref<SortKey>
  reversed: Ref<boolean>
  stations: Ref<DraftStation[]>
  /** „Setzt EU-Recht um" — goes to both Bund endpoints; the Länder rows are filtered on the page. */
  eu: Ref<EuFilter>
  /** „Ohne Entwurf" / „Alle mit Entwurf" — the page's own filter, no endpoint takes it (`BegutachtungFilter`); the select „Art" writes it with `art` (`artChoiceParams`). */
  begutachtung: Ref<BegutachtungFilter>
  query: ComputedRef<ReturnType<typeof draftApiQuery>>
  /**
   * The URL query of the filters as they stand, with `patch` applied — what
   * the page's own write-back puts in the address, so a link built with it
   * changes exactly the patched filter and keeps every other (16.11.2026,
   * the pointer to the other Parliament tab).
   */
  urlQueryWith: (patch: Partial<DraftFilterValues>) => LocationQueryRaw
  /** Runs `handler` after a navigation has set the filters from its URL —
   *  for state the page keeps beside them. */
  onNavigate: (handler: () => void) => void
}

export function useDraftFilters(sources: {
  /** The Bund is among the reader's sources (`useSourceChoice`). */
  bund: Ref<boolean>
  laender: Ref<LandCode[]>
}, options: {
  /**
   * Write the filters back into the address (default). Off where another
   * page reads the list's state from its own URL without owning it — the
   * site search (`/suche`, 17.11.2026) takes `?q=` and `?quellen=` and must
   * not have its address rewritten into the list's.
   */
  syncUrl?: boolean
} = {}): DraftFilters {
  const syncUrl = options.syncUrl ?? true
  const route = useRoute()
  const router = useRouter()

  /* Which spans the sources offer (14.11.2026): the Bund's periods, one
   * Land's own, or the Bund's by their dates (`periodViewFor`). */
  const periodView = computed(() => periodViewFor(sources.bund.value, sources.laender.value))
  /* The URL's filters with a span the sources do not offer dropped — the
   * running span of the calendar in view instead (`coherentSpan`). */
  /* A span of the reader's own the calendar cannot place (wholly before it)
   * is dropped like a period the sources do not offer. */
  const fromQuery = (routeQuery: Record<string, unknown>): DraftFilterValues => {
    const f = draftFiltersFromQuery(routeQuery)
    const range = customSpanOf(f.von, f.bis) ? { von: f.von, bis: f.bis } : { von: '', bis: '' }
    return { ...f, ...coherentSpan(f, periodView.value), ...range }
  }

  // Filter state, initialized from the URL so links are shareable.
  const initial = fromQuery(route.query)
  const statusFilter = ref<DraftStatus>(initial.status)
  const art = ref<ArtFilter>(initial.art)
  const gp = ref(initial.gp)
  const landtag = ref(initial.landtag)
  const von = ref(initial.von)
  const bis = ref(initial.bis)
  const customSpan = computed(() => customSpanOf(von.value, bis.value))
  const span = computed(() =>
    customSpan.value
      ? { gp: customSpan.value.gp, landtag: '' }
      : coherentSpan({ gp: gp.value, landtag: landtag.value }, periodView.value))
  const laenderSpan = computed(() => laenderSpanQuery(span.value, periodView.value))
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

  /* Only the five the endpoints are asked with. `sort` must not be in this
   * computed, or reordering would hand `useFetch` a new object and refetch
   * both lists for something the browser does. `art` stays out for a
   * different reason: neither endpoint takes it in this vocabulary — it
   * decides which of the two the page asks at all, and the page watches it
   * for that. And `qDebounced` since 12.11.2026, for `sort`'s reason: the
   * page searches the halves itself (`searchBundHalves`), so a term is no
   * request. */
  const query = computed(() =>
    draftApiQuery({
      status: statusFilter.value,
      stations: stations.value,
      gp: span.value.gp,
      ministry: ministry.value,
      eu: eu.value,
    }),
  )

  /* The filters as the URL carries them: the settled search term, not the
   * one still being typed. */
  const current = (): DraftFilterValues => ({
    status: statusFilter.value,
    stations: stations.value,
    art: art.value,
    ...span.value,
    von: customSpan.value ? von.value : '',
    bis: customSpan.value ? bis.value : '',
    ministry: ministry.value,
    q: qDebounced.value,
    sort: sort.value,
    reversed: reversed.value,
    eu: eu.value,
    begutachtung: begutachtung.value,
  })

  /* An Art the new state does not pair with reads as „Alle Arten" — the
   * group „Ohne Entwurf" has Arts of its own (`coherentArt`, 10.11.2026).
   * The select writes both parameters at once (`artChoiceParams`), so this
   * only acts on a pair written apart. */
  watch(begutachtung, (b) => { art.value = coherentFilters({ art: art.value, ministry: ministry.value }, b, false).art })

  // Keep the URL in sync with the filters (defaults stay out of the URL).
  /* `quellen` is not this list's filter but the site's choice of sources
   * (`useSourceChoice`), and the write-back must not drop it. */
  function urlQueryWith(patch: Partial<DraftFilterValues>): LocationQueryRaw {
    const quellen = route.query[SOURCE_PARAM]
    return { ...draftUrlQuery({ ...current(), ...patch }), ...(quellen !== undefined ? { [SOURCE_PARAM]: quellen } : {}) }
  }
  function writeUrl(): void {
    if (!syncUrl) return
    router.replace({ query: urlQueryWith({}) })
  }
  /* The refs, not `query`, which carries the applied `span`: a source
   * toggle changes `span` at once, before its own navigation has landed, and a write-back
   * then would carry the old `quellen` over the new. The refs follow once it
   * has landed (the navigation watcher below), and that writes. */
  const rawQuery = computed(() =>
    JSON.stringify([statusFilter.value, stations.value, gp.value, landtag.value, von.value, bis.value, ministry.value, eu.value]))
  watch([rawQuery, qDebounced, art, sort, reversed, begutachtung], writeUrl)

  /* A link whose `art` the state does not offer (`coherentArt`) is read as
   * „Alle Arten" — and the value leaves the URL too, so the address says
   * what the list shows (10.11.2026). Since 14.11.2026 the span too: a `gp`
   * or `landtag` the sources do not offer (`coherentSpan`) — after a source
   * toggle as well, which is a navigation. And `begutachtung` where it says
   * nothing or nothing new — `mit` beside a draft kind
   * (`coherentBegutachtung`, 14.11.2026). Nothing else is rewritten. */
  const STRAY_KEYS = ['art', 'begutachtung', 'gp', 'landtag', 'von', 'bis'] as const
  const strayParam = (routeQuery: Record<string, unknown>): boolean => {
    const url = draftUrlQuery(fromQuery(routeQuery))
    return STRAY_KEYS.some((key) => routeQuery[key] !== undefined && url[key] === undefined)
  }
  onMounted(() => {
    if (strayParam(route.query)) writeUrl()
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
    const next = fromQuery(routeQuery)
    if (sameDraftFilters(next, current())) {
      /* The refs take the applied span: a span the new sources do not offer
       * is dropped, not kept to come back with an older selection. */
      gp.value = next.gp
      landtag.value = next.landtag
      von.value = next.von
      bis.value = next.bis
      // Same state, but a stray `art` or span in the address: take it out.
      if (strayParam(routeQuery)) writeUrl()
      return
    }
    clearTimeout(qTimer)
    statusFilter.value = next.status
    art.value = next.art
    gp.value = next.gp
    landtag.value = next.landtag
    von.value = next.von
    bis.value = next.bis
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
    landtag,
    von,
    bis,
    customSpan,
    periodView,
    span,
    laenderSpan,
    ministry,
    q,
    qDebounced,
    sort,
    reversed,
    stations,
    eu,
    begutachtung,
    query,
    urlQueryWith,
    onNavigate: (handler) => {
      navigateHandlers.push(handler)
    },
  }
}
