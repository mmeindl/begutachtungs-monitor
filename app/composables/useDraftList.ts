/**
 * The rows of the draft list (`/entwuerfe`) for a filter state, and what
 * the list says about them: which parts are on their way or could not be
 * read, the count line, the notes above the rows.
 *
 * Moved out of the page on 17.11.2026 so that the site search (`/suche`)
 * counts and shows exactly the rows the list shows for the same `?q=` —
 * one code path, never a second reading of the same sources. The page keeps
 * the controls, the pager, the scroll anchor and the full text.
 *
 * Synchronous, as `useDraftHalves`: every fetch starts here and the caller
 * awaits `ready` once, so nothing is built after an `await` outside the
 * component's scope.
 */
import type { Ref } from 'vue'
import type {
  AntraegeResponse,
  StaatsvertraegeResponse,
  DashboardSecondRound,
  DraftStation,
  DraftsResponse,
  DraftSummary,
  LandCode,
  LandLawsResponse,
  LawsWithoutBegutachtung,
  RisConsultation,
  RisConsultationKind,
} from '#shared/types'
import { LAND_CODES, landStationsReason } from '#shared/utils/laender'
import { inDateWindow, landtagValue } from '#shared/utils/periodCalendar'
import {
  antragRow,
  treatyRow,
  compareRowsByFrist,
  compareRowsByStatements,
  type DraftListRow,
  draftRows,
  landRow,
  lawRow,
  meRow,
  risRow,
  rowDay,
  vorlageRow,
} from '#shared/utils/draftOrder'
import { antragRouteCitation } from '#shared/utils/antragPath'
import { viewOfRow } from '~/utils/entryView'
import {
  type ArtChoice,
  type ArtAnswers,
  type ArtSources,
  antragGapNotes,
  antragRowsOf,
  antragStationOf,
  treatyGapNotes,
  treatyRowsOf,
  treatyStationOf,
  artChoiceOf,
  artChoiceParams,
  artUnavailableBySources,
  artUnavailableFor,
  artUnavailableNote,
  choiceAdmitsBundLaw,
  choiceAdmitsDraft,
  choiceAdmitsLandLaw,
  choiceAdmitsMinisterialentwurf,
  choiceAdmitsOpenVorlage,
  openVorlageStationOf,
  otherOpenStation,
  otherStationPointerDe,
  coherentFilters,
  draftRowsOf,
  isOhneChoice,
  ohneSilentNoteDe,
  ohneUnreadCounts,
  ohneUnreadNoteDe,
  lawsReachNoteDe,
  registerReachNote,
  type SortKey,
  draftCountLabel,
  searchBundHalves,
  withoutDraftRequests,
  withoutDraftGapDe,
  withoutDraftRowsOf,
} from '~/utils/draftFilters'
import { matchesQuery } from '#shared/utils/textMatch'
import type { DraftFilters } from '~/composables/useDraftFilters'

export function useDraftList(filters: DraftFilters, sources: {
  /** The Bund is among the reader's sources (`useSourceChoice`). */
  bund: Ref<boolean>
  laender: Ref<LandCode[]>
}) {
  const { bund, laender: chosenLaender } = sources
  const { statusFilter, art, periodView, span, customSpan, laenderSpan, ministry, qDebounced, sort, reversed, stations, eu, begutachtung, query, urlQueryWith } = filters

  /**
   * A span of the reader's own (`?von=&bis=`, 18.11.2026) cuts every row set
   * where the search term cuts it, so the counts, the pointer and the
   * placeholder count what the list shows. The halves are fetched for the
   * Bund period the span lies in (`customSpan`, `span`); each row stays if
   * its day lies in the span (`rowDay`). Without such a span every row stays.
   */
  function inSpan(row: DraftListRow): boolean {
    const w = customSpan.value?.window
    return !w || inDateWindow(rowDay(row), w)
  }
  /**
   * One comparator per option, so adding an order is a line here rather
   * than another branch inside `rows`. The comparators live in
   * `shared/utils/draftOrder.ts`, next to the row kinds they order and where
   * vitest can reach them.
   */
  const rowComparators: Record<SortKey, (a: DraftListRow, b: DraftListRow, reversed: boolean) => number> = {
    frist: compareRowsByFrist,
    stellungnahmen: compareRowsByStatements,
  }

  /* „Ohne Entwurf" — chip „Ohne Begutachtung" until 10.11.2026, then „Ohne
   * Ministerialentwurf" with the Bund and „Ohne Begutachtung" for Salzburg alone,
   * one label from 14.11.2026 (`ohneApplied`): the Bund's term was false with
   * Länder selected beside it, and „Ohne Begutachtung" is false for the Bund's
   * Ausschussbegutachtung rows. The same day the chip went into the select
   * „Art" as the group „Ohne Entwurf" (`ART_CHOICES`): one control for what a
   * row is, instead of a chip that swapped the select's vocabulary. The option
   * the select shows is the pair `art` + `begutachtung` (`artChoiceOf`). */
  const chosenArt = computed<ArtChoice>({
    get: () => artChoiceOf(art.value, begutachtung.value),
    set: (choice) => {
      const params = artChoiceParams(choice)
      begutachtung.value = params.begutachtung
      art.value = params.art
    },
  })

  /**
   * Where the rows come from (`useSourceChoice`, 22.10.2026): the Bund, and
   * the Länder the reader chose — or one Land alone, with the Bund off.
   *
   * The Länder's drafts come running and closed, for the period used as a
   * TIME WINDOW: a draft belongs to GP XXVIII when its Begutachtung began
   * within that period's dates (`readLaenderInWindow`); the sentence under the
   * chips says so. What the Länder rows cannot answer, the chips say as their
   * reason, and they keep their state for the view that can: a later station
   * (the monitor follows a Land's draft no further than its Begutachtung)
   * and a Ressort while the Bund is on. The Art is no reason since
   * 23.10.2026: a Land's draft is a Gesetz or a Verordnung like the Bund's.
   */
  /* The stations each Land is followed to: `LAND_FOLLOWED_STATIONS`. For a
   * given station set (`st`, the tab's by default): the pointer to the other
   * Parliament tab asks for that tab's (16.11.2026, `rowsAt`). */
  function landUnavailableFor(land: LandCode, st: readonly DraftStation[] = stations.value): string | null {
    const byStation = landStationsReason(land, st)
    if (byStation) return byStation
    if (bund.value && ministry.value) return 'Länder-Entwürfe haben kein Ministerium'
    return null
  }
  const applyingLaenderAt = (st: readonly DraftStation[]) => chosenLaender.value.filter((land) => !landUnavailableFor(land, st))
  const applyingLaender = computed(() => applyingLaenderAt(stations.value))
  /* The reason the count line gives when no chosen source applies at all. */
  const landUnavailable = computed(() => (chosenLaender.value.length ? landUnavailableFor(chosenLaender.value[0]!) : null))
  const landsApply = computed(() => applyingLaender.value.length > 0)
  const sourceUnavailable = computed(() =>
    Object.fromEntries(LAND_CODES.map((land) => [land, landUnavailableFor(land)])))

  /* The halves the sources and `art` ask for, the gate over them, the period
   * and Ressort menus: `useDraftHalves`. */
  const halves = useDraftHalves({ ...filters, bund, wantsLaender: landsApply })
  const {
    wantsMe,
    wantsRis,
    meData,
    risData,
    risError,
    laenderData,
    laenderStatus,
    states: halfStates,
    pendingHalves,
    gateStatus,
    gateData,
    refreshing,
    retry,
    selectedGp,
    availableGps,
    ministries: ministriesFetched,
  } = halves

  /**
   * The Bund halves under the search term, searched HERE since 12.11.2026
   * (`searchBundHalves`): the endpoints are asked without `q`, so a term costs
   * no request and the rows stand instead of fading while it is typed — the
   * Länder rows, the open Vorlagen and the laws below were already searched on
   * the page, now every row kind is. Same predicates as the endpoints
   * (`shared/utils/searchHaystack.ts`), so a term finds the rows it found.
   *
   * A `?q=` link renders the same rows on the server: its render fetches the
   * unsearched halves and filters in setup, the payload carries them whole and
   * the browser hydrates into the same cut. The price: under a term the
   * payload holds the whole period instead of the matches — exactly what the
   * page ships without a term, so no page grows past its unsearched size.
   */
  const searched = computed(() => searchBundHalves(meData.value, risData.value, qDebounced.value))

  /* Whether the span in view is an earlier one than the running span — the
   * full text knows only what is open today (`useFullTextSearch`). */
  const pastSpan = computed(() => {
    const view = periodView.value
    if (view.mode === 'land') return !!span.value.gp || (!!span.value.landtag && span.value.landtag !== landtagValue(view.land, view.periods[0]!.id))
    const current = availableGps.value[0] ?? ''
    return !!span.value.gp && !!current && span.value.gp !== current
  })

  /**
   * The second open window — and since 18.09.2026 these are rows, not a section.
   *
   * Whoever lands here under „Stellungnahme möglich" is asking where they can
   * say something now, and a Regierungsvorlage in the Nationalrat is such a
   * place. The draft behind it is already a row — station „Regierungsvorlage",
   * chip „Zweite Runde". What this fetch adds are the Vorlagen with NO draft
   * behind them (about a quarter,
   * `docs/research/begutachtung-uebersprungen.md`): they have no row that could carry
   * them, so they become one themselves (`openVorlagen`).
   *
   * Two earlier attempts put them in a section under the list, and both failed
   * on the same thing: the homepage shows six open Vorlagen, the section then
   * showed one — „six there, one here" reads as a defect whatever the heading
   * says. A list answering „wo kann ich etwas sagen" must not split the answer
   * across two places.
   *
   * Client-side and lazy: nothing above this fetch depends on it, an empty
   * result is the normal case, and what may be missing must not hold the first
   * paint. Started before the halves are awaited, so the three overlap.
   */
  /* The Länder whose sources carry the statement „ohne Begutachtung" per law: Salzburg. */
  const OHNE_LANDS: readonly LandCode[] = ['sbg']
  const ohneLandsApply = computed(() => applyingLaender.value.some((land) => OHNE_LANDS.includes(land)))
  /* What the sources alone say about the select „Art" — before any answer. */
  const artSources = computed<ArtSources>(() => ({ bund: bund.value, landsApply: landsApply.value, ohneLandsApply: ohneLandsApply.value }))
  /* The option the sources leave chosen: one they rule out filters as „Alle
   * Arten" (`appliedArt` further down adds the answers' reasons). */
  const artBySources = computed<ArtChoice>(() => (artUnavailableBySources(artSources.value)[chosenArt.value] ? '' : chosenArt.value))
  /* Which of the three late answers this view asks for (`withoutDraftRequests`):
   * the rows its option shows, and under every option — the four draft options
   * included — the answers that decide whether an option of „Ohne Entwurf" can
   * be offered, so that is known before it is chosen. The open Vorlagen decide
   * nothing and are asked only where they are rows. */
  const requests = computed(() => withoutDraftRequests(artBySources.value, artSources.value))
  const vorlagenWanted = computed(() => requests.value.vorlagen)
  const secondRoundFetch = useFetch<DashboardSecondRound>(
    '/api/dashboard/zweite-runde',
    { lazy: true, server: false, enabled: vorlagenWanted, watch: [vorlagenWanted] },
  )

  /**
   * The other Parliament tab's Ministerialentwürfe, for the pointer above the
   * rows (16.11.2026, `otherStationPointer`). A draft's station filters on
   * the server (`filterDraftList`, by its chain), so the rows the reader would
   * see under the other tab are not in this page's answer: they are asked for
   * with the same query, the station swapped, and then go through the same
   * page-side steps as the visible half (`rowsAt`). Only where the pointer can
   * stand and the view asks for the Ministerialentwürfe at all; on the client,
   * lazily — the pointer is no part of the server's render. The RIS half needs
   * no such request: it holds no row at either tab (`risStationWants`).
   */
  const pointerStation = computed(() => otherOpenStation(statusFilter.value, stations.value))
  const otherMeWanted = computed(() => pointerStation.value !== null && wantsMe.value)
  const otherMeFetch = useFetch<DraftsResponse>('/api/drafts', {
    query: computed(() => ({ ...query.value, station: pointerStation.value ?? undefined })),
    lazy: true,
    server: false,
    enabled: otherMeWanted,
    watch: [otherMeWanted],
  })

  /**
   * The enacted laws of the period without a Ministerialentwurf —
   * rows of the default list since 10.11.2026, next to the drafts,
   * and what the chip „Ohne Entwurf" narrows to. Fetched like the
   * open Vorlagen above: on the client, lazily, so the drafts never wait for
   * them, and for the period in view (the chosen one, else the running one),
   * whenever the Bund is among the sources. An answer that is `pending` or
   * `unread` brings no row and no statement; the drafts stand as they are and
   * the laws join when the answer is complete (`lawsRetries`). Asked under
   * every option while the Bund is a source: the same answer decides whether
   * the options of „Ohne Entwurf" can be offered (`artUnavailable`).
   */
  const lawsWanted = computed(() => requests.value.bundLaws)
  const lawsFetch = useFetch<LawsWithoutBegutachtung>('/api/ohne-begutachtung', {
    query: computed(() => ({ gp: span.value.gp || undefined })),
    lazy: true,
    server: false,
    enabled: lawsWanted,
    watch: [lawsWanted],
  })

  /**
   * The Länder's laws without a draft in their register: rows by
   * default, next to the Länder's drafts, for the period in view — fetched
   * like the Bund's laws, on the client and lazily, so the drafts never wait
   * for them; only while a Land applies. The window is the Länder half's
   * (`laenderSpan`): a GP, or the one chosen Land's own period — Salzburg's
   * laws under „Ohne Entwurf" answer for the span its drafts are listed in.
   * Under the draft options only where Salzburg alone decides whether „Ohne
   * Entwurf" can be offered (`withoutDraftRequests`).
   */
  const landLawsWanted = computed(() => requests.value.landLaws)
  const landLawsFetch = useFetch<LandLawsResponse>('/api/laender/gesetze', {
    query: laenderSpan,
    lazy: true,
    server: false,
    enabled: landLawsWanted,
    watch: [landLawsWanted],
  })

  /**
   * Every Initiativantrag of the period in view, with its state — rows only
   * under „Alle Initiativanträge" (decision 1 of 14.11.2026) and, the open
   * ones, under „Stellungnahme möglich" (16.11.2026, `antragRowsOf`); asked
   * for only there and only with the Bund among the sources. On the client and lazily,
   * as the laws: up to a hundred records are read for the running period.
   */
  const antraegeWanted = computed(() => bund.value && antragRowsOf(artBySources.value, statusFilter.value))
  const antraegeFetch = useFetch<AntraegeResponse>('/api/antraege', {
    query: computed(() => ({ gp: span.value.gp || undefined })),
    lazy: true,
    server: false,
    enabled: antraegeWanted,
    watch: [antraegeWanted],
  })

  /**
   * Every treaty's Vorlage of the period in view — rows only under
   * „Staatsverträge" (decision 3 of 14.11.2026), asked for only there and only
   * with the Bund among the sources. List rows and cached Jahrgänge, no
   * detail records (`/api/staatsvertraege`).
   */
  const treatiesWanted = computed(() => bund.value && treatyRowsOf(artBySources.value))
  const treatiesFetch = useFetch<StaatsvertraegeResponse>('/api/staatsvertraege', {
    query: computed(() => ({ gp: span.value.gp || undefined })),
    lazy: true,
    server: false,
    enabled: treatiesWanted,
    watch: [treatiesWanted],
  })

  const { data: secondRound, error: secondRoundError } = secondRoundFetch
  const { data: otherMeData, error: otherMeError, status: otherMeStatus } = otherMeFetch
  const { data: lawsData, error: lawsError, refresh: refreshLaws } = lawsFetch
  const { data: landLawsData, error: landLawsError, refresh: refreshLandLaws } = landLawsFetch
  const { data: antraegeData, error: antraegeError } = antraegeFetch
  const { data: treatiesData, error: treatiesError } = treatiesFetch

  /**
   * `gap: 'pending'`: after a cold start the station maps are still being
   * built, and the answer changes within a minute. Ask again, a
   * bounded number of times with a pause, so the chip does not stay
   * unavailable until a reload — no loop without an end, stopped on unmount.
   */
  const LAWS_RETRY_MS = 20_000
  const LAWS_RETRIES = 6
  let lawsRetries = 0
  let lawsTimer: ReturnType<typeof setTimeout> | undefined
  /* `unread` too (12.11.2026), with a longer pause and fewer tries: a read
     that failed after a restart was often only the start-up's load, and the
     chip stood unavailable until a reload. */
  const LAWS_UNREAD_RETRY_MS = 60_000
  const LAWS_UNREAD_RETRIES = 3
  let lawsUnreadRetries = 0
  /* A `pending` answer the page will ask again: the laws are on their way, not
   * absent (`lawsPending`). */
  const lawsRetrying = ref(false)
  watch(lawsData, (laws) => {
    clearTimeout(lawsTimer)
    const retryPending = laws?.gap === 'pending' && lawsRetries < LAWS_RETRIES
    const retryUnread = laws?.gap === 'unread' && lawsUnreadRetries < LAWS_UNREAD_RETRIES
    /* Both count as on their way (15.11.2026): the options of „Ohne Entwurf"
       stay enabled (`bundLawsRetrying`) and the list says „noch geladen" —
       only the answer after the last retry says „nicht abrufbar". */
    lawsRetrying.value = retryPending || retryUnread
    if (retryPending) {
      lawsRetries++
      lawsTimer = setTimeout(() => void refreshLaws(), LAWS_RETRY_MS)
    } else if (retryUnread) {
      lawsUnreadRetries++
      lawsTimer = setTimeout(() => void refreshLaws(), LAWS_UNREAD_RETRY_MS)
    }
  }, { immediate: true })
  watch(span, () => { lawsRetries = 0; lawsUnreadRetries = 0 })
  onUnmounted(() => clearTimeout(lawsTimer))

  /* Salzburg's statements wait for the Landtag documents after a cold start
     (`LandLawSource.statements: 'pending'`): asked again as the Bund's laws
     are, a bounded number of times. While a retry is due the statements count
     as on their way (15.11.2026, `landLawsRetrying`): the options of „Ohne
     Entwurf" stay enabled and the Land's laws are said „noch geladen" under
     them (`landLawsPending`), as the Bund's are. */
  let landLawsRetries = 0
  let landLawsTimer: ReturnType<typeof setTimeout> | undefined
  const landLawsRetrying = ref(false)
  watch(landLawsData, (laws) => {
    clearTimeout(landLawsTimer)
    landLawsRetrying.value = !!laws?.sources.some((s) => s.statements === 'pending') && landLawsRetries < LAWS_RETRIES
    if (!landLawsRetrying.value) return
    landLawsRetries++
    landLawsTimer = setTimeout(() => void refreshLandLaws(), LAWS_RETRY_MS)
  })
  watch(laenderSpan, () => { landLawsRetries = 0 })
  onUnmounted(() => clearTimeout(landLawsTimer))

  /**
   * Where the EU map could not be read, per side, while „Setzt EU-Recht um" is
   * on: the side's rows then stand UNFILTERED and the note above the list says
   * so — the stations' rule (`stationsUnavailable`), for the same reason: a
   * list standing unfiltered under an active filter is the one variant nobody
   * notices. A Bund half answers `euAvailable: false`; the Länder answer
   * counts only as `true` (`LaenderResponse.euAvailable` is optional).
   */
  const bundEuMissing = computed(() =>
    meData.value?.euAvailable === false || risData.value?.euAvailable === false,
  )
  const laenderEuMissing = computed(() => !!laenderData.value && laenderData.value.euAvailable !== true)
  const euUnavailable = computed<'alle' | 'bund' | 'laender' | null>(() => {
    if (!eu.value || ohneApplied.value) return null
    const bundMissing = bund.value && bundEuMissing.value
    const landMissing = landsApply.value && laenderEuMissing.value
    if (bundMissing && (landMissing || !landsApply.value)) return 'alle'
    if (landMissing && !bund.value) return 'alle'
    return bundMissing ? 'bund' : landMissing ? 'laender' : null
  })

  /* Under the same controls as everything else, as far as they reach: the
   * Land chosen, the Art by the kind the Land names (`LandDraftKind`), the
   * search the same word rule (`matchesQuery`). Period and status went
   * upstream (`useDraftHalves`). */
  /* For a given station set (`st`): the tab's below, the other Parliament
   * tab's for the pointer (16.11.2026, `rowsAt`). */
  function landItemsAt(st: readonly DraftStation[]) {
    const applying = applyingLaenderAt(st)
    if (!applying.length) return []
    return (laenderData.value?.items ?? [])
      .filter((item) => applying.includes(item.land))
      /* The station tabs: a row's station is the one its Land recorded, the
       * Begutachtung where nothing came yet; an unread record matches none. */
      .filter((item) => {
        if (!st.length) return true
        if (item.stage === 'unknown') return false
        return st.includes(item.stage?.station ?? 'begutachtung')
      })
      .filter((item) => choiceAdmitsDraft(appliedArt.value, item.kind))
      /* „Setzt EU-Recht um": the two markers the fact leads with those words.
       * Without the map (`laenderEuMissing`) the rows stand unfiltered and the
       * note above them says so — a filter that silently drops every Land
       * row would read as „no Land implements anything". */
      .filter((item) => !eu.value || laenderEuMissing.value || item.eu === 'umsetzung' || item.eu === 'ueber-umsetzung')
      .filter((item) => matchesQuery(item.title, qDebounced.value))
      .filter((item) => inSpan(landRow(item)))
  }
  const landItems = computed(() => landItemsAt(stations.value))
  /* The station tabs: a row whose further way could not be read matches no
   * station. A correction of what the list shows now, so it stays at the list. */
  const unreadStageCount = computed(() => {
    if (!landsApply.value || laenderStatus.value !== 'success' || !stations.value.length) return 0
    return (laenderData.value?.items ?? []).filter((i) => applyingLaender.value.includes(i.land) && i.stage === 'unknown').length
  })

  /* A chosen Land that could not be read — a failed fetch counts as every
   * chosen Land unreadable, never as none open. A half the server's render
   * did not wait for (12.11.2026) is `success` with no answer: on its way,
   * not unreadable. */
  const unreadableLaender = computed(() => {
    if (!landsApply.value || laenderStatus.value === 'pending' || laenderStatus.value === 'idle') return []
    if (halfStates.value.laender === 'loading') return []
    const sources = laenderData.value?.sources
    return chosenLaender.value
      .map((land) => sources?.find((s) => s.land === land) ?? { land, state: 'unavailable' as const, listUrl: null })
      .filter((s) => s.state === 'unavailable')
  })

  /**
   * The third row kind, since 18.09.2026: a Regierungsvorlage that never had a
   * Begutachtung. It stood in a section under the list until then, and the
   * homepage's six open Vorlagen against the section's one read as a defect
   * whatever the heading said.
   *
   * So it belongs in the same list. That does not soften „two row
   * shapes, never a pooled total", it applies the same rule a third time: its
   * own row shape, its own count term, a shared order. The row shape and both
   * orders are in `shared/utils/draftOrder.ts`, next to the comparator they
   * call.
   *
   * Under the same controls as everything else, as far as they reach. Status:
   * only where „Stellungnahme möglich" is asked or nothing is filtered — an
   * open window has no business under „Nicht möglich". Station: each stands at
   * its own, the Regierungsvorlage or Parlament (`openVorlageStationOf`). Art: they are no Verordnungsentwürfe. Ressort:
   * `OpenVorlage` carries none, so the row steps back as soon as one is
   * filtered for. Search: the same word rule as above (`matchesQuery`).
   */
  /* Whether the view would show them at all — asked before the answer is
   * there, so the count line can say they are on their way (`vorlagenPending`). */
  function vorlagenInViewAt(st: readonly DraftStation[]): boolean {
    if (!bund.value || statusFilter.value === 'closed' || ministry.value) return false
    /* Only under the Arts that can hold one (`withoutDraftRowsOf`):
     * „Alle Arten", „Alle ohne Entwurf", „Regierungsvorlagen ohne Entwurf" —
     * no longer under „Gesetzesentwürfe" since 14.11.2026, a Vorlage without a
     * draft being no draft. Under the draft options an answer asked for
     * availability is never shown or announced. */
    if (!withoutDraftRowsOf(appliedArt.value).vorlagen) return false
    /* „Setzt EU-Recht um": a Vorlage carries no EU fact in the list, so it
     * steps back — unless the Bund's map is missing and the list stands
     * unfiltered anyway (`euUnavailable`). */
    if (eu.value && !bundEuMissing.value) return false
    /* A Regierungsvorlage stands at „Regierungsvorlage" or, once the
     * Nationalrat is done with it, at „Parlament"; a motion at „Parlament"
     * from the start (`openVorlageStationOf`); each row is filed by its own
     * station below. */
    if (st.length && !st.some((s) => s === 'rv' || s === 'parlament')) return false
    /* They are the running period's: an earlier one chosen holds none. */
    return !pastSpan.value
  }
  const vorlagenInView = computed(() => vorlagenInViewAt(stations.value))
  function openVorlagenAt(st: readonly DraftStation[]) {
    const list = secondRound.value
    if (!list || !vorlagenInViewAt(st)) return []
    if (selectedGp.value && selectedGp.value !== list.gp) return []
    return list.items
      // Each under the tab of its own station (16.11.2026), as a draft's row.
      .filter((v) => !st.length || st.includes(openVorlageStationOf(v)))
      // Under „Ohne Entwurf" only the rows that carry one of its two
      // notes (`none`, `committee`).
      .filter((v) => choiceAdmitsOpenVorlage(appliedArt.value, v.consultation.kind, v.kind))
      .filter((v) => matchesQuery(`${v.title} ${v.citation}`, qDebounced.value))
      .filter((v) => inSpan(vorlageRow(v)))
  }
  const openVorlagen = computed(() => openVorlagenAt(stations.value))

  /**
   * „Ohne Entwurf": the list shows ONLY the procedures no draft preceded.
   * For the Bund, those without a Ministerialentwurf: the period's enacted
   * laws from `/api/ohne-begutachtung` (station Bundesgesetzblatt) and the
   * open Vorlagen that say „ohne Begutachtung" or „Ausschussbegutachtung"
   * (station Regierungsvorlage). For the Länder, the laws that say „ohne
   * Begutachtung" — Salzburg's only (`OHNE_LANDS`); the other chosen Länder
   * are named above the rows (`ohneSilentNote`). Every draft — the
   * Ministerialentwürfe, the RIS records, the Länder's — steps back. A
   * procedural fact per row, never a ranking.
   *
   * Unavailable — with its reason, keeping its state, like „Stellungnahme
   * möglich" under „Bundesgesetzblatt" — without the Bund, and where the
   * period cannot carry the claim (`LawsWithoutBegutachtung.gap`): then the
   * filter steps back and the list is what it is without it.
   */
  /**
   * The options of the select „Art" that cannot be offered here, each with its
   * reason (14.11.2026, `artUnavailableFor`). What the sources alone rule out
   * stands disabled on the first render, on the server too: „Andere Entwürfe"
   * without the Bund, the three Bund-and-Salzburg options of „Ohne Entwurf"
   * with neither, „Landesgesetze ohne zugeordneten Entwurf" without a Land.
   * The rest waits for the answers, asked under every option
   * (`withoutDraftRequests`) — the Bund's laws, else Salzburg's: a period that
   * cannot carry the claim, an answer not read or a failed fetch. Until an
   * answer is there the option stays enabled: unknown is not unavailable —
   * nor is an answer the page will ask again for (`lawsRetrying`, 15.11.2026).
   * Such an option stands disabled, its reason after its label
   * (`artOptionReasonsFor`); a link that asks for it keeps it chosen, the list
   * steps back to „Alle Arten" (`appliedArt`) and one line says why
   * (`artNote`) — never a silent fallback.
   */
  const artAnswers = computed<ArtAnswers>(() => ({
    bundLaws: lawsData.value,
    bundLawsFailed: !!lawsError.value,
    bundLawsRetrying: lawsRetrying.value,
    sbgLaws: landLawsData.value?.sources.find((src) => src.land === 'sbg'),
    sbgLawsRetrying: landLawsRetrying.value,
    landLawsFailed: !!landLawsError.value,
    /* „als Initiativantrag": the Bund's period in view, and whether its rows
     * carry the chains that name the route — both in the server's render. */
    gp: span.value.gp || meData.value?.gp || '',
    chainsMissing: meData.value?.stationsAvailable === false,
  }))
  const artUnavailable = computed(() => artUnavailableFor(artSources.value, artAnswers.value))
  /* The option that filters: the chosen one, or „Alle Arten" where it cannot. */
  const appliedArt = computed<ArtChoice>(() => (artUnavailable.value[chosenArt.value] ? '' : chosenArt.value))
  /* Which draft halves the applied option shows rows of (`draftRowsOf`): under
   * „als Initiativantrag" the Ministerialentwürfe alone, those whose row names
   * the Antrag (`choiceAdmitsMinisterialentwurf`). The other options take every
   * row their halves bring, as before. */
  const halvesShown = computed(() => draftRowsOf(appliedArt.value))
  const meOfView = computed(() => (searched.value.me ?? []).filter((d) => choiceAdmitsMinisterialentwurf(appliedArt.value, d) && inSpan(meRow(d))))
  const risOfView = computed(() => (halvesShown.value.ris ? (searched.value.ris ?? []).filter((item) => inSpan(risRow(item))) : []))
  const artNote = computed(() => {
    const reason = artUnavailable.value[chosenArt.value]
    return reason ? artUnavailableNote(chosenArt.value, reason) : null
  })
  /* „Andere Entwürfe" is offered while the view holds one (`artSelectFor`):
   * known only where the RIS half came unnarrowed or narrowed to them. */
  const othersInView = computed(() => (searched.value.ris ?? []).some((c) => c.kind === 'unbestimmt'))

  /* Any option of the group „Ohne Entwurf" applies: every draft steps back. */
  const ohneApplied = computed(() => isOhneChoice(appliedArt.value))
  /* The chosen Länder whose sources cannot answer the question of „Alle ohne
   * Entwurf" and its two items: their laws step back (`landLawRows`) as every
   * draft does, so the page names them instead of letting their rows vanish in
   * silence. Not under „Landesgesetze ohne zugeordneten Entwurf", which every
   * Land answers as far as its register reaches (`landLawsBeyondReach`). */
  const ohneSilentLaender = computed(() =>
    ohneApplied.value && appliedArt.value !== 'ohne-landesgesetz'
      ? applyingLaender.value.filter((land) => !OHNE_LANDS.includes(land))
      : [])
  const ohneSilentNote = computed(() => ohneSilentNoteDe(ohneSilentLaender.value))

  /* While the chip applies, no Ressort (`coherentFilters`): one chosen before,
   * or carried by a link, is dropped — from the state, and so from the URL. */
  watch([ohneApplied, ministry], ([applies]) => {
    ministry.value = coherentFilters({ art: art.value, ministry: ministry.value }, begutachtung.value, applies).ministry
  }, { immediate: true })

  /* The chip's count: the rows it would show for the period in view, once
   * the laws are there. */

  /**
   * The laws under the other controls, as far as they reach — the rules
   * written above `openVorlagen`. Status: nothing can be filed any more, so
   * they stand under no filter and under „Nicht möglich". Station: the
   * Bundesgesetzblatt. Art: they are laws — under „Gesetzesentwürfe" too, not
   * under „Verordnungsentwürfe"; under the chip by the item they came as.
   * Ressort: they carry none, so a chosen Ressort leaves them out of the mixed
   * list (and under the chip no Ressort can be chosen). „Setzt EU-Recht um":
   * they carry no EU fact. Search: the same word rule. In the default list
   * and under the chip alike; without the Bund, or while the answer
   * is incomplete, none.
   */
  function lawsInViewAt(st: readonly DraftStation[]): boolean {
    if (!bund.value) return false
    if (statusFilter.value === 'open' || ministry.value || eu.value) return false
    /* Only under the Arts that can hold one (`withoutDraftRowsOf`) — no
     * longer under „Gesetzesentwürfe" since 14.11.2026: a law is no draft. */
    if (!withoutDraftRowsOf(appliedArt.value).bundLaws) return false
    return !st.length || st.includes('bgbl')
  }
  const lawsInView = computed(() => lawsInViewAt(stations.value))
  function lawRowsAt(st: readonly DraftStation[]) {
    const laws = lawsData.value
    if (!lawsInViewAt(st) || !laws?.available) return []
    if (selectedGp.value && selectedGp.value !== laws.gp) return []
    return laws.items
      .filter((l) => choiceAdmitsBundLaw(appliedArt.value, l.item.kind))
      .filter((l) => matchesQuery(`${l.title} ${l.item.citation} ${l.bgblNumber}`, qDebounced.value))
      .filter((l) => inSpan(lawRow(l)))
  }
  const lawRows = computed(() => lawRowsAt(stations.value))

  /**
   * The Länder's laws under the other controls, as far as they reach — the
   * rules of `lawRows`: nothing can be filed (no „Stellungnahme möglich"),
   * station Bundesgesetzblatt (the Landesgesetzblatt is that station for a
   * Land), they are laws (not under „Verordnungsentwürfe"), no EU fact, the
   * Land chosen, the same word rule. Under the chip only those that say „ohne
   * Begutachtung", by the item they came as where the Art asks for one.
   */
  function landLawsInViewAt(st: readonly DraftStation[]): boolean {
    if (!applyingLaenderAt(st).length) return false
    /* „Alle Arten" and the group „Ohne Entwurf" only — no draft kind
     * (14.11.2026, `withoutDraftRowsOf`). */
    if (statusFilter.value === 'open' || !withoutDraftRowsOf(appliedArt.value).landLaws) return false
    if (eu.value && !laenderEuMissing.value) return false
    return !st.length || st.includes('bgbl')
  }
  const landLawsInView = computed(() => landLawsInViewAt(stations.value))
  /* Every law of the applying Länder for the span in view, before the Art. */
  function landLawsOfViewAt(st: readonly DraftStation[]) {
    const data = landLawsData.value
    if (!landLawsInViewAt(st) || !data) return []
    /* The answer for the span in view only: a Land period's by its `landtag`,
     * a GP's by its code. */
    const asked = laenderSpan.value.landtag
    if (asked ? data.landtag !== asked : data.landtag || (selectedGp.value && selectedGp.value !== data.gp)) return []
    const applying = applyingLaenderAt(st)
    return data.items
      .filter((l) => applying.includes(l.land))
      .filter((l) => matchesQuery(`${l.title} ${l.shortTitle ?? ''} ${l.nr}`, qDebounced.value))
      .filter((l) => inSpan(lawRow(l)))
  }
  const landLawsOfView = computed(() => landLawsOfViewAt(stations.value))
  const landLawRowsAt = (st: readonly DraftStation[]) => landLawsOfViewAt(st).filter((l) => choiceAdmitsLandLaw(appliedArt.value, l))
  const landLawRows = computed(() => landLawRowsAt(stations.value))
  /* Under „Landesgesetze ohne zugeordneten Entwurf": the laws left out because
   * their Land's register does not reach back far enough to rule a draft out —
   * the plain „Landesgesetz" of the count line. Counted per Land and said
   * (`registerReachNote`): a gap never reads as an empty result. */
  const landLawsBeyondReach = computed(() => {
    if (appliedArt.value !== 'ohne-landesgesetz') return {}
    const counts: Partial<Record<LandCode, number>> = {}
    for (const l of landLawsOfView.value) if (!choiceAdmitsLandLaw('ohne-landesgesetz', l)) counts[l.land] = (counts[l.land] ?? 0) + 1
    return counts
  })
  const beyondReachNote = computed(() => registerReachNote(landLawsBeyondReach.value))
  /* Under „Ohne Entwurf": the laws whose „ohne Begutachtung" could not be read
   * (`ohneUnreadCounts`), said instead of dropped — not for a Land still „noch
   * geladen" (`landLawsPending`), whose wait already says the rows are short. */
  const ohneUnreadNote = computed(() => ohneUnreadNoteDe(ohneUnreadCounts(
    appliedArt.value,
    landLawsOfView.value.filter((l) => !landLawsPending.value.includes(l.land)),
  )))
  /* A chosen Land whose drafts came but whose laws could not be read: said, as an unreadable Land is —
   * only while the view would show its laws, as `lawsUnreadable` (a kept answer outlives its fetch). */
  const unreadableLandLaws = computed(() =>
    landLawsInView.value && landLawsData.value
      ? landLawsData.value.sources.filter((src) => src.state === 'unavailable' && applyingLaender.value.includes(src.land) && !unreadableLaender.value.some((u) => u.land === src.land))
      : [])

  /**
   * The laws on their way (14.11.2026): asked for by the view, but the answer
   * not there yet — never on the server (`server: false`), so the SSR HTML is
   * this state — or a `pending` answer the page will ask again
   * (`lawsRetrying`). Until 14.11.2026 they counted as none, and under „Ohne
   * Entwurf" the line said „0 Entwürfe" over a list that was only loading. A
   * failed fetch is no pending: it ends the wait.
   */
  const lawsPending = computed(() =>
    lawsInView.value && !lawsError.value && (!lawsData.value || lawsRetrying.value))
  /**
   * The Bund's laws that did not come (14.11.2026): asked for by the view, but
   * the fetch failed or the answer says it could not read them — `unread`, or
   * `pending` once the retries ran out. In the default list they stood out
   * without a word; now said where an unreadable Land's laws are
   * (`unreadableLandLaws`). Under „Ohne Entwurf" the chip steps back with the
   * same reason (`artUnavailable`), and this sentence then stands in the list
   * it steps back to.
   */
  const lawsUnreadable = computed(() => {
    if (!lawsInView.value) return false
    if (lawsError.value) return true
    const laws = lawsData.value
    return laws?.available === false && (laws.gap === 'unread' || laws.gap === 'pending') && !lawsRetrying.value
  })

  /**
   * How far the source of the Bund's laws reaches (15.11.2026,
   * `lawsReachNoteDe`): a period wholly before the Bundesgesetzblatt in RIS
   * says so, a period that began before it says which laws its list lacks.
   * Only while the view would show the laws, and not twice: where a chosen
   * option of „Ohne Entwurf" stepped back, `artNote` already carries the
   * reason.
   */
  const lawsReachNote = computed(() => {
    const laws = lawsData.value
    if (!lawsInView.value || !laws) return null
    if (selectedGp.value && selectedGp.value !== laws.gp) return null
    if (artNote.value && isOhneChoice(chosenArt.value)) return null
    return lawsReachNoteDe(laws)
  })

  /**
   * The open Regierungsvorlagen without a draft on their way (14.11.2026), as
   * the laws are (`lawsPending`): never on the server (`server: false`), so
   * the SSR HTML is this state. Until then the count line could stand without
   * them for a moment, and under „Ohne Entwurf" print a total they were
   * missing from. A failed fetch ends the wait and is said as failed.
   */
  const vorlagenPending = computed(() => vorlagenInView.value && !secondRoundError.value && !secondRound.value)
  const vorlagenFailed = computed(() => vorlagenInView.value && !!secondRoundError.value)
  /* What the count line is given for them (`draftCountLabel`). */
  const vorlagenForCount = computed(() =>
    vorlagenPending.value ? 'pending' as const : vorlagenFailed.value ? 'failed' as const : openVorlagen.value)

  /* The Länder whose laws are on their way: those the view counts them for —
   * under the chip only the Länder that can answer it (`OHNE_LANDS`). Once the
   * answer is there, under the group „Ohne Entwurf" also a Land whose
   * statements are still being read and asked again (`landLawsRetrying`,
   * 15.11.2026): its options pick laws by „ohne Begutachtung", which a row
   * without its statement cannot say yet — until then the list showed the
   * laws decided so far as if they were all. Under „Alle Arten" every law is
   * a row either way, so nothing waits there. */
  const landLawsPending = computed<LandCode[]>(() => {
    if (!landLawsInView.value || landLawsError.value) return []
    const data = landLawsData.value
    if (data) {
      if (!ohneApplied.value || !landLawsRetrying.value) return []
      return data.sources.filter((s) => s.statements === 'pending' && applyingLaender.value.includes(s.land)).map((s) => s.land)
    }
    return ohneApplied.value && appliedArt.value !== 'ohne-landesgesetz'
      ? applyingLaender.value.filter((land) => OHNE_LANDS.includes(land))
      : applyingLaender.value
  })
  /* Rows still to come, from any half or the laws: the list body then shows
   * its loading state rather than „Keine Entwürfe gefunden", and the search
   * field names no count. */
  const listPending = computed(() => latePending.value.length > 0)

  /* Every part that joins the list late, by name, while it is on its way: the
   * halves (`pendingHalves`), the Bund's laws, the Länder's laws and the open
   * Vorlagen — what `listPending` waits for and the scroll anchor below holds
   * the reader's place against. */
  /**
   * The Initiativanträge under „Alle Initiativanträge", under the other
   * controls as far as they reach: „Stellungnahme möglich" holds the rows
   * whose own flag said open, „Nicht möglich" the rest; the station tabs by
   * where each stands (`antragStationOf`); a Ressort or „Setzt EU-Recht um"
   * leaves them out — they carry neither; the same word rule as every row.
   * An Antrag whose draft's row already names it (the stated successor of a
   * Beschluss not promulgated, 2/ME → 416/A) is not listed twice.
   */
  const antraegeInView = computed(() => antraegeWanted.value && antragRowsOf(appliedArt.value, statusFilter.value) && !ministry.value && !eu.value)
  /* For a given station set and the Ministerialentwürfe standing beside them
   * there (`me`), whose rows may already name an Antrag (16.11.2026, `rowsAt`). */
  function antragItemsAt(st: readonly DraftStation[], me: readonly DraftSummary[]) {
    const data = antraegeData.value
    if (!antraegeInView.value || !data) return []
    if (selectedGp.value && selectedGp.value !== data.gp) return []
    const named = new Set(me.map((d) => antragRouteCitation(d)).filter((c): c is string => c !== null))
    return data.items
      .filter((a) => !named.has(a.citation))
      .filter((a) => statusFilter.value === 'all' || (statusFilter.value === 'open') === (a.state === 'open'))
      .filter((a) => !st.length || st.includes(antragStationOf(a.state)))
      .filter((a) => matchesQuery(`${a.title} ${a.citation}`, qDebounced.value))
      .filter((a) => inSpan(antragRow(a)))
  }
  const antragItems = computed(() => antragItemsAt(stations.value, meOfView.value))
  const antraegePending = computed(() => antraegeInView.value && !antraegeError.value && !antraegeData.value)
  /* What the count line is given for them (`draftCountLabel`). */
  const antraegeForCount = computed(() =>
    !antraegeInView.value ? undefined : antraegeError.value ? 'failed' as const : antraegePending.value ? 'pending' as const : antragItems.value.length)
  /* Where they did not come whole: one sentence per gap (`antragGapNotes`). */
  const antragNotes = computed(() => (antraegeInView.value ? antragGapNotes(antraegeData.value) : []))

  /* The treaties under „Staatsverträge", under the other controls as far as
   * they reach: none under „Stellungnahme möglich" — Parliament takes none on
   * a treaty —, the station tabs by where each stands (`treatyStationOf`), a
   * Ressort or „Setzt EU-Recht um" leaves them out. */
  const treatiesInView = computed(() => treatiesWanted.value && treatyRowsOf(appliedArt.value) && !ministry.value && !eu.value)
  function treatyItemsAt(st: readonly DraftStation[]) {
    const data = treatiesData.value
    if (!treatiesInView.value || !data) return []
    if (selectedGp.value && selectedGp.value !== data.gp) return []
    if (statusFilter.value === 'open') return []
    return data.items
      .filter((t) => !st.length || st.includes(treatyStationOf(t.state)))
      .filter((t) => matchesQuery(`${t.title} ${t.citation}`, qDebounced.value))
      .filter((t) => inSpan(treatyRow(t)))
  }
  const treatyItems = computed(() => treatyItemsAt(stations.value))
  const treatiesPending = computed(() => treatiesInView.value && !treatiesError.value && !treatiesData.value)
  const treatiesForCount = computed(() =>
    !treatiesInView.value ? undefined : treatiesError.value ? 'failed' as const : treatiesPending.value ? 'pending' as const : treatyItems.value.length)
  const treatyNotes = computed(() => (treatiesInView.value ? treatyGapNotes(treatiesData.value) : []))
  /* The Bund's items without a draft between their open window and their law
   * (16.11.2026, `withoutDraftGapDe`): no source of the list holds them, so
   * the tabs they would stand under say so instead of showing nothing. */
  const withoutDraftGap = computed(() => withoutDraftGapDe({
    bund: bund.value,
    status: statusFilter.value,
    stations: stations.value,
    art: appliedArt.value,
    ministry: ministry.value,
    eu: Boolean(eu.value),
  }))

  const latePending = computed<string[]>(() => [
    /* Under „als Initiativantrag" the RIS and Länder halves bring no row
     * (`halvesShown`): not waited for. */
    ...pendingHalves.value.filter((half) => ohneApplied.value || halvesShown.value[half]),
    ...(lawsPending.value ? ['laws'] : []),
    ...(landLawsPending.value.length ? ['landLaws'] : []),
    ...(vorlagenPending.value ? ['vorlagen'] : []),
    ...(antraegePending.value ? ['antraege'] : []),
    ...(treatiesPending.value ? ['treaties'] : []),
  ])

  /* A half that this `art` excludes was never fetched, and `meData`/`risData`
   * are null for it; „als Initiativantrag" cuts the halves it asks for
   * (`meOfView`, `risOfView`; `landItems` by `choiceAdmitsDraft`). */
  /* The rows under a given station set (16.11.2026): every row kind through
   * its own station step above, with the Bund's two halves as the server
   * answered for that set (`me`, `ris`; their station filters upstream).
   * Called for the tab in view (`rows`) and for the other Parliament tab
   * (`otherStationPointer`), so the pointer counts exactly what that tab
   * then shows. Unordered: the count needs no order. */
  function rowsAt(st: readonly DraftStation[], me: readonly DraftSummary[], ris: readonly RisConsultation[]): DraftListRow[] {
    const laws = [...lawRowsAt(st), ...landLawRowsAt(st)]
    return ohneApplied.value
      ? draftRows([], [], openVorlagenAt(st), [], laws)
      : [...draftRows(me, ris, openVorlagenAt(st), landItemsAt(st), laws), ...antragItemsAt(st, me).map(antragRow), ...treatyItemsAt(st).map(treatyRow)]
  }
  const rows = computed<DraftListRow[]>(() =>
    rowsAt(stations.value, meOfView.value, risOfView.value)
      .sort((a, b) => rowComparators[sort.value](a, b, reversed.value)),
  )

  /**
   * The ordered rows, put through one anatomy.
   *
   * The split is deliberate and it is the lesson of the six components this
   * replaced: `rows` decides WHAT stands in which order — with three row kinds
   * that keep their own types — and the adapter decides HOW each kind
   * falls onto the four zones. Both used to live in two components per kind,
   * which is why the same number could stand in six places in one list.
   */
  const entries = computed(() => rows.value.map(viewOfRow))

  /* Both are 0 for a half that was not fetched, so the sum is what stands in
   * the list — the search placeholder may name it (never the count line,
   * `draftCountLabel`). Counted after the search (12.11.2026): the endpoints'
   * `total` no longer knows the term. */
  const meTotal = computed(() => meOfView.value.length)
  const risTotal = computed(() => risOfView.value.length)
  /* Drafts and laws apart, never one pooled number: the
     placeholder names both where both stand in the list (10.11.2026). */
  const visibleTotal = computed(() =>
    ohneApplied.value
      ? openVorlagen.value.length
      /* Every row that is no law (16.11.2026): the open Vorlagen and motions,
         the Anträge and the treaties too — „In 0 Entwürfen suchen" stood over
         three listed motions. */
      : meTotal.value + risTotal.value + landItems.value.length + openVorlagen.value.length + antragItems.value.length + treatyItems.value.length,
  )
  const visibleLaws = computed(() => lawRows.value.length + landLawRows.value.length)

  /**
   * Only stations selected that a record WITHOUT a Gegenstand at Parliament
   * cannot reach — and since 19.09.2026 there are only two of them.
   *
   * „Everything but Begutachtung" was the rule while the Verordnung half
   * appeared nowhere after the Frist. But it is kundgemacht, in part II of the
   * Bundesgesetzblatt, and „Bundesgesetzblatt"
   * now carries 159 rows of the running period. The note „Diese Auswahl passt
   * nicht zu Verordnungsentwürfen" stood above exactly those rows for one
   * version.
   *
   * `rv` and `parlament` stay unreachable, and that is not a gap in the data
   * but the procedure.
   */
  const laterStationsOnly = computed(
    () =>
      stations.value.length > 0 &&
      !stations.value.includes('begutachtung') &&
      !stations.value.includes('bgbl'),
  )
  /* Stations and „Verordnungsentwürfe" exclude one another: the one half has no
   * Gegenstand at Parliament, the other half is the question about it. Instead
   * of „Keine Entwürfe gefunden" — which sounds like too narrow a search term —
   * the page says in that case that the combination itself is empty, and offers
   * the way out. */
  const stationConflict = computed(() => laterStationsOnly.value && art.value === 'verordnung')

  /* Two reasons why the rows carry no station, and they say fundamentally
   * different things: the map was not reachable just now (temporary, our
   * fault) — or the period does not link its drafts to Vorlagen at all
   * (permanent, the archive's). Only the second case needs the
   * explanation without an active station filter too, because a whole column
   * would otherwise vanish wordlessly. */
  const chainUnlinkedPeriod = computed(() => meData.value?.chainCoverage === 'unlinked')

  /* Zeilen der Vorperiode, deren Frist noch läuft — beide Hälften
   * melden das für sich, und gemeldet wird nur, was das Filtern überlebt hat.
   *
   * Die Liste MUSS das sagen. Sie trägt einen sichtbaren Periodenwähler, der
   * in diesen Wochen die laufende Periode zeigt, während ein paar Zeilen aus
   * der davor stammen. Die Endpunkte lesen nur mit, wenn der
   * Aufruf gar keine Periode genannt hat — sobald jemand oben eine auswählt,
   * ist die Antwort wieder periodenrein und dieser Satz verschwindet von
   * selbst. */
  /* Nach der Suche festgestellt (12.11.2026, `searchBundHalves`): die
   * Endpunkte kennen den Suchbegriff nicht mehr. */
  const carriedOverFrom = computed(() =>
    /* A carried-over row is a running Frist: never under „als Initiativantrag". */
    ohneApplied.value || appliedArt.value === 'als-antrag' ? null : searched.value.carriedOverFrom,
  )

  /* The station map costs hundreds of fetches on a cold build and can fail
   * (`server/utils/parliament/stationMap.ts`). The page then says that nothing
   * was filtered — a list standing unfiltered under an active filter is the
   * one variant nobody notices. */
  const stationsMissing = computed(
    () => meData.value?.stationsAvailable === false && !chainUnlinkedPeriod.value,
  )

  /* A THIRD case since 24.09.2026, and the only one where the missing map does
   * not cost a column but cuts the SET wrong: „Nicht möglich" excludes a draft
   * whose Regierungsvorlage parliament still takes Stellungnahmen on, and that
   * is known from the station map alone. Without it those rows fall in here
   * and say „Begutachtung abgeschlossen" over an open window — 13 of the
   * running period's 132 expired drafts on 24.09.2026. Rare (the deploy waits
   * for the prewarm since the same day, `deploy/deploy.sh`) and therefore
   * worth one sentence rather than a second data path. */
  const stationsUnavailable = computed(
    () => !ohneApplied.value && stationsMissing.value && (stations.value.length > 0 || statusFilter.value === 'closed'),
  )

  /**
   * „1 weitere unter „Parlament / Landtag“ →" (16.11.2026): under
   * „Stellungnahme möglich" on one of the two Parliament tabs, the rows the
   * other one holds under every other filter as it stands, with a link that
   * switches to it and keeps them (`urlQueryWith`). The homepage's door opens
   * on „Regierungsvorlage"; a tab joining the two was rejected.
   *
   * The count is the other tab's rows from the same steps as the list's own
   * (`rowsAt`), so the number is what the reader finds there. While any part
   * it depends on is on its way or failed — this list's halves, the other
   * tab's Ministerialentwürfe, the open Vorlagen, the Anträge, the Länder —
   * or the stations could not be read, no pointer stands: a number that
   * changes a moment later, or one counted without a part, would be false,
   * and none at all is only a missing convenience. Never „0 weitere".
   */
  const otherStationPointer = computed(() => {
    const other = pointerStation.value
    if (!other || chainUnlinkedPeriod.value || stationsUnavailable.value || listPending.value || !gateData.value) return null
    const st = [other]
    if (vorlagenInViewAt(st) && !secondRound.value) return null
    if (antraegeInView.value && !antraegeData.value) return null
    if (applyingLaenderAt(st).length && halfStates.value.laender !== 'ready') return null
    let me: DraftSummary[] = []
    if (wantsMe.value && !ohneApplied.value) {
      const data = otherMeData.value
      if (!data || otherMeError.value || otherMeStatus.value !== 'success' || data.stationsAvailable === false) return null
      me = (searchBundHalves(data, null, qDebounced.value).me ?? []).filter((d) => choiceAdmitsMinisterialentwurf(appliedArt.value, d) && inSpan(meRow(d)))
    }
    const text = otherStationPointerDe(rowsAt(st, me, []).length, other)
    return text ? { text, to: { query: urlQueryWith({ stations: st }) } } : null
  })

  /* Rows per kind — each set is the filtered one as it stands in the list. */
  function countByKind(items: readonly { kind: RisConsultationKind }[]) {
    const counts: Partial<Record<RisConsultationKind, number>> = {}
    for (const item of items) counts[item.kind] = (counts[item.kind] ?? 0) + 1
    return counts
  }

  /* The rows by kind, summed over the sources (`draftCountLabel`). A half
   * still on its way is said as such (12.11.2026), never counted: a number
   * that grows a moment later was false in the moment it stood. */
  /* The Art as the count line's empty term reads it: the applied option's. */
  const appliedArtParam = computed(() => artChoiceParams(appliedArt.value).art)
  /* The Länder whose laws the option counts: under „Landesgesetze ohne
   * zugeordneten Entwurf" every applying Land, under the rest Salzburg. */
  const landLawsCounted = computed(() => (appliedArt.value === 'ohne-landesgesetz' ? landsApply.value : ohneLandsApply.value))
  const countLabel = computed(() =>
    ohneApplied.value
      ? draftCountLabel({
          me: null,
          vorlagen: vorlagenForCount.value,
          ris: null,
          laterStationsOnly: false,
          art: appliedArtParam.value,
          laws: !bund.value || appliedArt.value === 'ohne-landesgesetz' ? undefined : lawsPending.value ? 'pending' : lawRows.value,
          landLaws: !landLawsCounted.value ? undefined : landLawsPending.value.length ? { pending: landLawsPending.value } : landLawRows.value,
        })
      : draftCountLabel({
        me: wantsMe.value ? meTotal.value : null,
        vorlagen: vorlagenForCount.value,
        ris: !wantsRis.value || !halvesShown.value.ris
          ? null
          : risError.value ? 'failed' : pendingHalves.value.includes('ris') ? 'pending' : countByKind(risOfView.value),
        laterStationsOnly: laterStationsOnly.value,
        art: appliedArtParam.value,
        laender: !landsApply.value || !halvesShown.value.laender
          ? null
          : pendingHalves.value.includes('laender') ? { pending: applyingLaender.value } : countByKind(landItems.value),
        /* The laws as the Länder half: on their way they are said, never
         * counted (14.11.2026); an answer without rows (`available: false`)
         * stays out of the line, the chip names its reason. */
        laws: lawsPending.value ? 'pending' : lawsInView.value && lawsData.value?.available ? lawRows.value : undefined,
        landLaws: landLawsPending.value.length ? { pending: landLawsPending.value } : landLawsInView.value && landLawsData.value ? landLawRows.value : undefined,
        antraege: antraegeForCount.value,
        treaties: treatiesForCount.value,
      }) || (landUnavailable.value ?? ''),
  )

  /** Every fetch settled — on the server, the late ones at their deadline at most. */
  const ready: Promise<void> = Promise.all([halves.ready, secondRoundFetch, otherMeFetch, lawsFetch, landLawsFetch, antraegeFetch, treatiesFetch]).then(() => {})

  return {
    ready,
    antragNotes,
    appliedArt,
    applyingLaender,
    artAnswers,
    artNote,
    artSources,
    availableGps,
    beyondReachNote,
    carriedOverFrom,
    chainUnlinkedPeriod,
    chosenArt,
    countLabel,
    entries,
    euUnavailable,
    gateData,
    gateStatus,
    laenderData,
    landItems,
    landLawsBeyondReach,
    landsApply,
    latePending,
    lawsReachNote,
    lawsUnreadable,
    listPending,
    ministriesFetched,
    ohneApplied,
    ohneSilentLaender,
    ohneSilentNote,
    ohneUnreadNote,
    otherStationPointer,
    othersInView,
    pastSpan,
    refreshing,
    retry,
    rows,
    searched,
    selectedGp,
    sourceUnavailable,
    stationConflict,
    stationsUnavailable,
    treatyNotes,
    unreadStageCount,
    unreadableLaender,
    unreadableLandLaws,
    visibleLaws,
    visibleTotal,
    withoutDraftGap,
  }
}
