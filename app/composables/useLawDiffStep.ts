/**
 * Which step of the law text one `LawDiffSection` compares, and the three
 * requests that answer it: the comparison, the § names and the Ressort's
 * reasoning (04.10.2026, out of the section, which had grown to 950 lines).
 *
 * The pair is chosen by the reader and lives in the URL (`?von=…&bis=…`), so
 * a comparison can be linked to. The three instances of a draft page share
 * the one `?von=…&bis=…`: the instance whose scope holds `bis` reads it, the
 * others show their defaults, so a shared link still opens one comparison.
 *
 * Async because the requests are awaited, as they were in the section's
 * setup: everything that needs the component instance — the requests, the
 * watchers — is set up BEFORE the await, and the snapshot of what is on
 * screen is taken after it, where the section took it.
 */
import type { MaybeRefOrGetter } from 'vue'
import type { LawDiffResponse, LawStationId, ParagraphTitlesResponse, ReasoningDiffResponse } from '#shared/types'
import {
  LAW_STEP_LABEL,
  type LawDiffScope,
  type LawStationPair,
  isLawStationId,
  lawDiffKey,
  lawDiffSteps,
  lawReasoningKey,
} from '#shared/utils/lawStations'

export async function useLawDiffStep(options: {
  gp: MaybeRefOrGetter<string>
  inr: MaybeRefOrGetter<number>
  /** Which station's step this instance shows; „rv" by default. */
  scope?: LawDiffScope
  /** The parliamentary texts the draft has (`parliamentTexts`). */
  parliamentTexts?: readonly LawStationId[]
  /** Fetch only once `enable` is called. */
  deferred?: boolean
}) {
  const scope: LawDiffScope = options.scope ?? 'rv'
  const steps: LawStationPair[] = lawDiffSteps(scope, options.parliamentTexts ?? [])
  /** The pair this instance shows when the URL names none of its own. */
  const scopeDefault: LawStationPair = steps[0] ?? { from: 'me', to: 'rv' }

  const route = useRoute()
  const router = useRouter()

  /**
   * The pair from the URL, falling back to the default rather than erroring:
   * a hand-typed or stale link should show the comparison everyone means, not
   * a validation message. The server validates the same query independently
   * (`readLawStationPair`), because a request can arrive without this page.
   */
  function pairFromRoute(): LawStationPair {
    const bis = route.query.bis
    const von = route.query.von
    // Only a step of this section: a pair that ends at another station is that
    // instance's to show, and a pair offered before 01.10.2026 that is no step
    // (`?von=me&bis=plenum`) opens the section's default.
    const step = steps.find((s) => s.to === bis && (!isLawStationId(von) || s.from === von))
    return { ...(step ?? scopeDefault) }
  }
  /** The step the reader asked for: the requests, the URL and the toggle follow
   *  it at once. What is on screen follows it once its comparison is there
   *  (`pair` below). */
  const requested = ref(pairFromRoute())

  /** Whether the three requests below may go out — at once, unless `deferred`. */
  const enabled = ref(!options.deferred)

  const base = () => `/api/drafts/${toValue(options.gp)}/${toValue(options.inr)}`
  const pairQuery = () => `von=${requested.value.from}&bis=${requested.value.to}`

  /* Keyed by draft and pair, so the Regierungsvorlage's station frame, which
   * reads the same ME→RV count (`useVorlageOutcome`), shares this request — and
   * `defer`, because Nuxt's default `cancel` aborts the first caller's request
   * and sends it again (two requests on 11/ME XXVIII, measured 01.10.2026). */
  const diffFetch = useFetch<LawDiffResponse>(
    () => `${base()}/diff?${pairQuery()}`,
    {
      key: () => lawDiffKey(toValue(options.gp), toValue(options.inr), requested.value.from, requested.value.to),
      lazy: true,
      server: false,
      dedupe: 'defer',
      immediate: enabled.value,
    },
  )
  const { data: fetchedDiff, status: fetchStatus, execute: executeDiff } = diffFetch

  /**
   * The name of each amended § (docs/architecture.md §12.11), fetched
   * separately so a slow lookup never delays the comparison and a failing one
   * never takes it down. Names appear when they arrive.
   *
   * Keyed on the same pair as the comparison: a Ziffer renumbered between two
   * stations addresses a different §, so names from another pair would be
   * wrong names.
   */
  const titlesFetch = useFetch<ParagraphTitlesResponse>(
    () => `${base()}/paragraphtitel?${pairQuery()}`,
    { lazy: true, server: false, immediate: enabled.value },
  )
  const { data: fetchedTitles, execute: executeTitles } = titlesFetch

  /**
   * And whether the Ressort changed its **reasoning** for this provision
   * (docs/architecture.md §12.10b).
   *
   * Measured over GP XXVIII: for 48 % of the Paragraphen carrying a reasoning
   * on both sides it became a different one — so the question is worth asking.
   * A fetch of its own for the same reason as the names: two more documents
   * from Parliament must neither hold the comparison up nor take it down with
   * them.
   */
  const reasoningFetch = useFetch<ReasoningDiffResponse>(
    () => `${base()}/begruendung?${pairQuery()}`,
    {
      // Shared with the Vorlage's station frame, which counts the same
      // Begründungen (`useVorlageOutcome`, 02.10.2026).
      key: () => lawReasoningKey(toValue(options.gp), toValue(options.inr), requested.value.from, requested.value.to),
      lazy: true,
      server: false,
      dedupe: 'defer',
      immediate: enabled.value,
    },
  )
  const { data: fetchedReasoning, execute: executeReasoning } = reasoningFetch

  /**
   * What is on screen: one step with its comparison, its § names and its
   * reasoning, swapped together once the requested step's comparison has
   * arrived (02.10.2026). Rendering the requests directly made every switch
   * flicker: a new key empties the fetch, so for at least a frame the list and
   * the toolbar went and „wird verglichen …" stood in their place — measured
   * on 115/ME XXVIII, the section fell from 286 to 164 px and came back.
   *
   * The names and the reasoning swap with the comparison, never on their own:
   * a renumbered Ziffer addresses a different § in another step, so a name
   * from one step on the other's list would be a wrong name. Where they arrive
   * after the comparison they appear when they do, as on the first load.
   */
  const pair = shallowRef<LawStationPair>({ ...requested.value })
  const data = shallowRef(fetchedDiff.value)
  const status = shallowRef(fetchStatus.value)
  const paraTitles = shallowRef(fetchedTitles.value)
  const reasoning = shallowRef(fetchedReasoning.value)
  const isShown = () => pair.value.from === requested.value.from && pair.value.to === requested.value.to
  watch([fetchStatus, fetchedDiff], ([s]) => {
    if (s === 'success' || s === 'error') {
      pair.value = { ...requested.value }
      data.value = fetchedDiff.value
      paraTitles.value = fetchedTitles.value
      reasoning.value = fetchedReasoning.value
      status.value = s
    } else if (!data.value) {
      // Nothing to keep — the first load, or a step that failed: say that
      // the comparison is on its way.
      status.value = s
    }
  })
  watch(fetchedTitles, (v) => {
    if (isShown()) paraTitles.value = v
  })
  watch(fetchedReasoning, (v) => {
    if (isShown()) reasoning.value = v
  })

  function enable() {
    if (enabled.value) return
    enabled.value = true
    void executeDiff()
    void executeTitles()
    void executeReasoning()
  }

  /**
   * Where a section has two steps — the committee's and the plenary's — a
   * two-button toggle picks one, named by the body that took it. It replaced a
   * select of every ordered pair (up to nine) on 01.10.2026: most of those
   * mixed two actors in one column of differences, and none of them was the
   * question a section asks.
   */
  function chooseStep(step: LawStationPair) {
    // The pressed button changes nothing — not even the URL: rewritten
    // without its hash, the same query read as a link to the top of the page
    // (`app/router.options.ts`), and the reader landed in the header.
    if (step.from === requested.value.from && step.to === requested.value.to) return
    requested.value = { ...step }
    // `replace`, not `push`: the pair belongs in the URL so it can be
    // shared, but flipping between comparisons should not fill the back
    // button with steps the reader has to walk out of. The default pair
    // leaves the query empty, so the canonical URL of a draft stays clean —
    // and an empty query is what makes this instance show it again.
    const query = { ...route.query }
    if (step.from === scopeDefault.from && step.to === scopeDefault.to) {
      delete query.von
      delete query.bis
    } else {
      query.von = step.from
      query.bis = step.to
    }
    router.replace({ query })
  }

  /**
   * The toggle itself: „Im Ausschuss" or „Im Plenum", as `ListTabs`. It was
   * a component of its own (`LawStepToggle`) until 04.10.2026, because the
   * section renders it in two places that are one place on screen — as the
   * tabs of the list's box, and alone at that spot where there is no list to
   * read. Its two computeds live here now, beside the step they choose.
   *
   * Tabs since 02.10.2026: the step chooses WHAT is compared, the first layer
   * of a list box, not how it is read. Two short labels fit every phone, so
   * they never collapse into a select.
   */
  const keyOf = (step: LawStationPair) => `${step.from}>${step.to}`
  const stepOptions = steps.map((step) => ({ value: keyOf(step), label: LAW_STEP_LABEL[step.to] ?? step.to }))
  const selectedStep = computed({
    get: () => keyOf(requested.value),
    set: (value: string) => {
      const step = steps.find((s) => keyOf(s) === value)
      if (step) chooseStep(step)
    },
  })

  await Promise.all([diffFetch, titlesFetch, reasoningFetch])
  // The snapshot as the section took it, after its awaits: a request this
  // page already had in flight (the station frame's, same key) may have
  // answered while they ran.
  pair.value = { ...requested.value }
  data.value = fetchedDiff.value
  status.value = fetchStatus.value
  paraTitles.value = fetchedTitles.value
  reasoning.value = fetchedReasoning.value

  return { steps, scopeDefault, requested, enabled, enable, pair, data, status, paraTitles, reasoning, chooseStep, stepOptions, selectedStep }
}
