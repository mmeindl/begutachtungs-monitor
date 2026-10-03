<script setup lang="ts">
/**
 * The § comparison between two versions of the law text (docs/ris-join.md
 * §6, docs/architecture.md §12.18). Framing rule: shows both what moved and
 * what stayed, never a blame counter. Loaded lazily on the client: the first
 * request per pair fetches and parses two documents, and the page must not
 * wait for that.
 *
 * The pair is chosen by the reader and lives in the URL (`?von=…&bis=…`), so
 * a comparison can be linked to — unlike the view toggle and the search,
 * which change how the same thing is read. Default stays
 * Ministerialentwurf → Regierungsvorlage, the question this product is about.
 *
 * Three instances on a draft page since 01.10.2026, one per `scope`: each
 * shows the step that led into its station (`lawDiffSteps`) — ME→RV under
 * „Die Regierungsvorlage", the committee's and the plenary's steps under „Im
 * Parlament", the whole way from the draft under „Im Bundesgesetzblatt".
 * They share the one `?von=…&bis=…`: the instance whose scope holds `bis`
 * reads it, the others show their defaults, so a shared link still opens one
 * comparison.
 */
import ComparisonCaveats from '~/components/compare/ComparisonCaveats.vue'
import LawStepToggle from '~/components/compare/LawStepToggle.vue'
import ListBox from '~/components/ui/ListBox.vue'
import PageSubsection from '~/components/ui/PageSubsection.vue'
import type { LawDiffResponse, LawDiffSegment, LawDiffUnit, LawStationId, ParagraphTitlesResponse, Publisher, ReasoningDiffEntry, ReasoningDiffResponse } from '#shared/types'
import { diffUnitKey } from '#shared/utils/diffKey'
import { formatDateDe } from '#shared/utils/format'
import { isNovelleUnits } from '#shared/utils/changeShare'
import { BADGE_CLASS, type DiffBadge, GUTTER_CLASS, badgeCounts, badgeLabels } from '~/utils/diffBadges'
import { readsSideBySide, splitSegments } from '~/utils/diffSides'
import { displayId, extraHeading, unitName } from '#shared/utils/unitName'
import { droppedLawsNote, mergedLawsNote, outsideDraftNote } from '~/utils/lawPackage'
import {
  LAW_STATION_LABEL,
  PARLIAMENT_COMPARISON_QUESTION,
  type LawDiffScope,
  type LawStationPair,
  isLawStationId,
  lawDiffKey,
  lawDiffScopeOf,
  lawDiffSteps,
  lawReasoningKey,
  lawStationPairQuestion,
} from '#shared/utils/lawStations'
import { documentSource, mixedPublishers, parliamentDocumentSource, PUBLISHER_NAME_DE, risSource, type SourceEntry } from '#shared/utils/provenance'

const props = defineProps<{
  gp: string
  inr: number
  /** Which station's step this instance shows; „rv" by default. */
  scope?: LawDiffScope
  /** The parliamentary texts the draft has (`parliamentTexts`), which decide
   *  the steps under „Im Parlament". Known before the comparison loads, so
   *  the first request already asks for the right pair. */
  parliamentTexts?: readonly LawStationId[]
  /** Fetch only once the section nears the viewport: under „Im Parlament" it
   *  is the second comparison of the page, two more documents to parse, and
   *  most readers of a draft page never scroll that far. */
  deferred?: boolean
}>()

const scope: LawDiffScope = props.scope ?? 'rv'
const steps: LawStationPair[] = lawDiffSteps(scope, props.parliamentTexts ?? [])
/** The pair this instance shows when the URL names none of its own. */
const scopeDefault: LawStationPair = steps[0] ?? { from: 'me', to: 'rv' }
/** `#textvergleich` stays the Vorlage's: that anchor is in circulation. */
const anchorId = scope === 'rv' ? 'textvergleich' : `textvergleich-${scope}`

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
const enabled = ref(!props.deferred)

/* Keyed by draft and pair, so the Regierungsvorlage's station card, which
 * reads the same ME→RV count (`useVorlageOutcome`), shares this request — and
 * `defer`, because Nuxt's default `cancel` aborts the first caller's request
 * and sends it again (two requests on 11/ME XXVIII, measured 01.10.2026). */
const { data: fetchedDiff, status: fetchStatus, execute: executeDiff } = await useFetch<LawDiffResponse>(
  () => `/api/drafts/${props.gp}/${props.inr}/diff?von=${requested.value.from}&bis=${requested.value.to}`,
  {
    key: () => lawDiffKey(props.gp, props.inr, requested.value.from, requested.value.to),
    lazy: true,
    server: false,
    dedupe: 'defer',
    immediate: enabled.value,
  },
)

/**
 * The name of each amended § (docs/architecture.md §12.11), fetched
 * separately so a slow lookup never delays the comparison and a failing one
 * never takes it down. Names appear when they arrive.
 *
 * Keyed on the same pair as the comparison: a Ziffer renumbered between two
 * stations addresses a different §, so names from another pair would be
 * wrong names.
 */
const { data: fetchedTitles, execute: executeTitles } = await useFetch<ParagraphTitlesResponse>(
  () => `/api/drafts/${props.gp}/${props.inr}/paragraphtitel?von=${requested.value.from}&bis=${requested.value.to}`,
  { lazy: true, server: false, immediate: enabled.value },
)

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
const { data: fetchedReasoning, execute: executeReasoning } = await useFetch<ReasoningDiffResponse>(
  () => `/api/drafts/${props.gp}/${props.inr}/begruendung?von=${requested.value.from}&bis=${requested.value.to}`,
  {
    // Shared with the Vorlage's station card, which counts the same
    // Begründungen (`useVorlageOutcome`, 02.10.2026).
    key: () => lawReasoningKey(props.gp, props.inr, requested.value.from, requested.value.to),
    lazy: true,
    server: false,
    dedupe: 'defer',
    immediate: enabled.value,
  },
)

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

const root = useTemplateRef<HTMLElement>('root')
let observer: IntersectionObserver | null = null

function enable() {
  if (enabled.value) return
  enabled.value = true
  observer?.disconnect()
  observer = null
  void executeDiff()
  void executeTitles()
  void executeReasoning()
}

onMounted(() => {
  // A link from before 01.10.2026 — `?von=rv&bis=plenum#textvergleich` —
  // names a pair this instance holds and an anchor the Vorlage's carries.
  // Take the reader to the comparison the link meant, and fix the hash so
  // the address they share from here is the current one.
  // The URL's own `bis`, not `pair`: the pair falls back to this instance's
  // default, which is always in scope, and would claim every bare
  // `#textvergleich` — the Vorlage's anchor.
  const bis = route.query.bis
  if (scope !== 'rv' && route.hash === '#textvergleich' && isLawStationId(bis) && lawDiffScopeOf(bis) === scope) {
    enable()
    root.value?.scrollIntoView()
    void router.replace({ query: route.query, hash: `#${anchorId}` })
    return
  }
  if (enabled.value) return
  // No IntersectionObserver (old browser, jsdom): load straight away.
  if (!root.value || typeof IntersectionObserver === 'undefined') {
    enable()
    return
  }
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) enable()
    },
    { rootMargin: '600px 0px' },
  )
  observer.observe(root.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})

/**
 * The reasoning to show at one unit: a changed one, or one shown without a
 * comparison (`comparable: false`, the scope rule) — or nothing.
 *
 * Two steps, because there are two levels: computed per passage — the one on
 * the instruction's Ziffer, or where the Erläuterungen are titled by § the
 * Paragraph's (docs/architecture.md §12.10b, 01.10.2026) — and shown at the
 * Novellierungsanordnung; one passage „Zu Z 1 bis 3" serves three.
 */
function reasoningOf(u: LawDiffUnit): ReasoningDiffEntry | null {
  const key = reasoning.value?.units?.[diffUnitKey(u)]
  const entry = key ? reasoning.value?.entries?.[key] : null
  return entry && (entry.changed || !entry.comparable) ? entry : null
}

/**
 * The sentence above the comparison that explains the disclosures below it.
 *
 * Here rather than on every row: printing „unverändert" on 33 rows would be
 * noise, naming the rate once is the information. And it names both numbers —
 * how often the reasoning moved with the text and how often it did not —
 * because an unchanged reasoning for a changed text is a statement of its
 * own.
 */
const reasoningNote = computed<string | null>(() => {
  const stats = reasoning.value?.stats
  if (!stats?.compared) return null
  const { compared, changed } = stats
  // Shorter since 30.09.2026; „— aufklappbar an der Änderung" went, the
  // disclosure at each change announces itself. Counts Begründungen since
  // 01.10.2026, not Paragraphen: what is compared is the ressort's passage to
  // a change — one passage on three Ziffern is one Begründung, and only where
  // the Erläuterungen are titled by § is it the Paragraph's.
  //
  // Shorter again on 01.10.2026: „die beide Fassungen zu den Änderungen
  // führen" became „die in beiden Fassungen stehen" — the same restriction,
  // the one the count needs to be read right.
  if (compared === 1) {
    return changed === 0
      ? 'Die Begründung, die in beiden Fassungen steht, hat das Ressort nicht geändert.'
      : 'Die Begründung, die in beiden Fassungen steht, hat das Ressort geändert.'
  }
  //
  // „…, die in beiden Fassungen stehen" left the plural on 02.10.2026: it
  // shares a paragraph with the pointer to the Erläuterungen now, and the
  // restriction stands on /so-funktionierts. The singular keeps it — „Die
  // Begründung" alone would not say which one.
  if (changed === 0) return `Keine der ${compared} Begründungen hat das Ressort geändert.`
  if (changed === compared) return `Alle ${compared} Begründungen hat das Ressort geändert.`
  return `${changed} der ${compared} Begründungen hat das Ressort geändert.`
})

/* The two Erläuterungen, one per side. The service sends them as
 * [Entwurf, Regierungsvorlage] (`reasoningDiffService`), and only where both
 * were found. */
const reasoningDocs = computed(() => (reasoning.value?.sources?.length === 2 ? reasoning.value.sources : null))
/** ME→RV states its counts in the Regierungsvorlage's station card
 *  (`useVorlageOutcome`, 02.10.2026), so the comparison under it repeats
 *  none of them. */
const countsInCard = computed(() => pair.value.from === 'me' && pair.value.to === 'rv')
/** A side's Erläuterungen for the credit line — only where the comparison of them ran. */
function reasoningDocFor(station: LawStationId) {
  const stats = reasoning.value?.stats
  // Uncompared passages are text on the page too, so their documents are credited.
  if (!stats || stats.compared + (stats.uncompared ?? 0) === 0 || !reasoningDocs.value) return null
  if (station === 'me') return reasoningDocs.value[0] ?? null
  if (station === 'rv') return reasoningDocs.value[1] ?? null
  return null
}
/**
 * What this comparison shows, per document, for its credit line
 * (`#shared/utils/provenance`): each side's text where it was read, the
 * Erläuterungen where their comparison ran — those are always Parliament's
 * copies — and the § names from RIS.
 */
const REASONING_DE: Partial<Record<LawStationId, string>> = {
  me: 'Erläuterungen zum Ministerialentwurf',
  rv: 'Erläuterungen zur Regierungsvorlage',
}
const sources = computed<SourceEntry[]>(() => {
  const d = data.value
  if (!d?.available) return []
  const out: SourceEntry[] = []
  for (const side of [{ station: pair.value.from, publisher: d.fromSource }, { station: pair.value.to, publisher: d.toSource }]) {
    if (side.publisher) out.push(documentSource(LAW_STATION_LABEL[side.station], side.station, side.publisher))
    const reasoningName = REASONING_DE[side.station]
    if (reasoningName && reasoningDocFor(side.station)) out.push(parliamentDocumentSource(reasoningName, side.station))
  }
  if (namedCount.value) out.push(risSource('Paragraphenüberschriften'))
  return out
})
/**
 * One entry per compared version for the credit line: its name, its text, its
 * Erläuterungen — and, where the line mixes publishers, whose each is. The
 * Erläuterungen are always Parliament's copy, the text may be RIS's, so a
 * side whose two documents differ names the publisher at each link.
 */
const creditSides = computed(() => {
  const d = data.value
  if (!d) return []
  const mixed = mixedPublishers(sources.value)
  const tag = (p: Publisher | null) => (mixed && p ? ` (${PUBLISHER_NAME_DE[p]})` : '')
  return [
    { station: pair.value.from, text: d.fromDocument, textBy: d.fromSource },
    { station: pair.value.to, text: d.toDocument, textBy: d.toSource },
  ].flatMap(({ station, text, textBy }) => {
    const reasoning = reasoningDocFor(station)
    if (!text && !reasoning) return []
    const by = [...new Set([text ? textBy : null, reasoning ? 'parlament' as const : null].filter((p) => p !== null))]
    const oneBy = by.length === 1 ? by[0]! : null
    return [{
      station,
      label: `${LAW_STATION_LABEL[station]}${tag(oneBy)}`,
      text,
      textTag: oneBy ? '' : tag(textBy),
      reasoning,
      reasoningTag: oneBy ? '' : tag('parlament'),
    }]
  })
})
const paraTitlesTag = computed(() => (mixedPublishers(sources.value) ? ' (RIS)' : ''))
const paraTitlesAsOf = computed(() => (paraTitles.value?.asOf ? formatDateDe(paraTitles.value.asOf) : null))

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

/** The sentences above the list wait for a comparison to stand under: none
 *  on the first load (02.10.2026). Until then the reasoning rate, which often
 *  arrives first, stood alone at the top and the figure pushed in above it
 *  when the diff came. While a later step loads they stay — the previous
 *  data is kept (the watcher above), under „Im Parlament" they do not depend
 *  on the step, and the toggle below them must not jump. */
const sentencesShown = computed(() => status.value !== 'error' && !!data.value?.available)
/** A list to read, and with it the view switch and the search. */
const hasList = computed(() => status.value === 'success' && !!data.value?.available && data.value.units.length > 0)

/**
 * The section's heading never changes, and the question of the selected pair
 * stands BELOW the controls (Manu, 17.09.2026: "we should never change
 * things above because they can be missed easily").
 *
 * The rule is positional and worth stating as one: a reader's eye is at the
 * control they just used, so whatever a control changes has to be at it or
 * under it. Before this, picking a pair rewrote four blocks ABOVE the
 * select — heading, description, source line, package notes — and the select
 * itself was the only thing in view.
 *
 * The heading is the question of the station the instance stands under, in
 * the wording the links that point here already use: the Regierungsvorlage
 * and Parlament stations of the bar, and the outcome card. Under „Im
 * Parlament" the toggle names the step, by the body that took it; the pair's
 * own question line under it went on 02.10.2026 — it repeated the toggle.
 */
const heading = scope === 'parlament'
  ? PARLIAMENT_COMPARISON_QUESTION
  : lawStationPairQuestion(scopeDefault.from, scopeDefault.to)
const fromLabel = computed(() => LAW_STATION_LABEL[pair.value.from])
const toLabel = computed(() => LAW_STATION_LABEL[pair.value.to])

/** The three sources of a name and their order live in `#shared/utils/unitName`. */
function nameOf(u: LawDiffUnit): string | null {
  return unitName(u, paraTitles.value?.titles, diffUnitKey(u))
}

/** Whether any name on screen was looked up, which decides the source note. */
const namedCount = computed(() => Object.keys(paraTitles.value?.titles ?? {}).length)

/** „entfallen" for a whole § that is gone — the one word the two sections
 *  do not share (`diffBadges.ts`). */
const BADGE_LABEL = badgeLabels('entfallen')

function badgeOf(u: LawDiffUnit): DiffBadge {
  return isMinor(u) ? 'editorial' : u.change
}

/**
 * Searching, and HIDING kinds of change — not isolating them.
 *
 * A select „nur neu" was removed on 17.09.2026 (Manu, with the page in front
 * of him): it offered ISOLATION where the reader's task is SUPPRESSION („hide
 * the redaktionell ones so I see the substance"), and being single-select it
 * could not suppress at all. Since 02.10.2026 the kinds are a legend in the
 * tool row whose entries switch their kind off (`DiffToolbar`), all on by
 * default — suppression is one press, and the legend prints the overall
 * total the per-law pills do not.
 */
const query = ref('')
const hiddenKinds = ref<DiffBadge[]>([])

function key(u: LawDiffUnit): string {
  return diffUnitKey(u)
}

/**
 * The identity of a rendered block, for `v-for`.
 *
 * Not the index: the block list is rebuilt on every keystroke of the search
 * field, and a block that was a folded `<details>` of unchanged units can
 * land in the slot a changed unit held. The open state of a `<details>` is
 * DOM state, not vnode state, so Vue carries it to whatever it reuses the
 * element for — and the reader finds someone else's § open.
 *
 * The kind is part of the key for the same reason: it is what tells the two
 * shapes apart, and `diffUnitKey` alone cannot, because a context block is named
 * after the first unit it folds.
 */
function blockKey(b: Block): string {
  return b.kind === 'unit' ? `unit|${diffUnitKey(b.unit)}` : `context|${diffUnitKey(b.units[0]!.unit)}`
}

/**
 * One lowercased haystack per unit, built once per response instead of once
 * per keystroke: the six searchable fields of up to 413 units (58/ME) were
 * lowercased again on every character typed.
 *
 * Joined by a newline so a term cannot match across two fields — and a
 * single-line search box can never carry one, so nothing else changes.
 */
const haystacks = computed(() =>
  (data.value?.units ?? []).map((u) =>
    [u.id, u.fromId, u.heading, u.article, u.fromText, u.toText].filter(Boolean).join('\n').toLowerCase(),
  ),
)

/** The units the search leaves — what the legend counts. */
const searchedUnits = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return data.value?.units ?? []
  return (data.value?.units ?? []).filter((_, i) => haystacks.value[i]!.includes(q))
})

/** The legend's counts: over the whole comparison, in units like the pills. */
const kindCounts = computed(() => {
  const counts: Record<DiffBadge, number> = { unchanged: 0, changed: 0, editorial: 0, inserted: 0, removed: 0 }
  for (const u of searchedUnits.value) counts[badgeOf(u)]++
  return counts
})

const visibleUnits = computed(() =>
  hiddenKinds.value.length
    ? searchedUnits.value.filter((u) => !hiddenKinds.value.includes(badgeOf(u)))
    : searchedUnits.value,
)

/**
 * One group per Gesetz (article of the package), folded by default. 32/ME
 * has 330 units in three laws; a flat list is unreadable. A single-law text
 * is one group under its own title, so the page shows the summary pills and
 * one folded header until the reader asks for more.
 */
interface ArticleGroup {
  article: string
  units: LawDiffUnit[]
  /** `changed` excludes editorial units, so the pills add up to the group's total like the rows do */
  counts: Record<DiffBadge, number>
}

const groups = computed<ArticleGroup[]>(() => {
  const out: ArticleGroup[] = []
  const byArticle = new Map<string, ArticleGroup>()
  for (const u of visibleUnits.value) {
    const key = u.article ?? ''
    let g = byArticle.get(key)
    if (!g) {
      g = { article: key, units: [], counts: { unchanged: 0, changed: 0, editorial: 0, inserted: 0, removed: 0 } }
      byArticle.set(key, g)
      out.push(g)
    }
    g.units.push(u)
    g.counts[badgeOf(u)]++
  }
  return out
})
/**
 * What ONE click buys, since 08.09.2026: the whole law as flowing text with
 * the changes marked, instead of a row per amendment instruction that had to
 * be opened one by one — user feedback, and the argument behind it: without
 * attribution of a change to an actor (which Austria does not have),
 * splitting the instructions apart buys nothing. The rest of the folding —
 * closed until asked, a search opens everything — is in `useFoldedGroups`.
 */
const { toggleGroup, groupOpen, showAll, limitFor } = useFoldedGroups(query)

/**
 * Blocks in reading order: every change as flowing text, runs of untouched
 * units folded into one line of context — the way a diff reads on GitHub.
 * Nothing has to be opened to be read.
 *
 * What a block carries, it carries computed. The template used to ask for
 * the same four things two to five times per row — the name, the heading,
 * the two columns of the split view and the changed Begründung — on every
 * render, and a render happens on every keystroke of the search field.
 */
interface UnitView {
  unit: LawDiffUnit
  /** `unitLabel` — "§ 6 Erweiterte Gefahrenerforschung", "§ 6" where no name is known, null where neither is */
  label: string | null
  /**
   * `extraHeading` — the heading, only where it says something the block does
   * not AND is not already the name: a § of a new law is named by exactly
   * this heading, and the row would otherwise carry it twice.
   */
  extra: string | null
}

type Block =
  /** `split`: this unit reads better as two columns (`readsSideBySide`). */
  | ({ kind: 'unit'; from: LawDiffSegment[]; to: LawDiffSegment[]; split: boolean; reasoning: ReasoningDiffEntry | null } & UnitView)
  | { kind: 'context'; units: UnitView[] }

function viewOf(u: LawDiffUnit): UnitView {
  const label = unitLabel(u)
  const extra = extraHeading(u)
  return { unit: u, label, extra: extra === label ? null : extra }
}

function blocksOf(units: readonly LawDiffUnit[], article: string): { blocks: Block[]; hidden: number } {
  // Searching IS the reader asking for specific units — then nothing gets
  // folded away behind a context line.
  const folding = !query.value.trim()
  const limit = limitFor(article)
  const blocks: Block[] = []
  let context: UnitView[] = []
  let shown = 0
  let hidden = 0
  const flush = () => {
    if (context.length) blocks.push({ kind: 'context', units: context })
    context = []
  }
  for (const u of units) {
    if (folding && badgeOf(u) === 'unchanged') {
      context.push(viewOf(u))
      continue
    }
    if (shown >= limit) {
      hidden++
      continue
    }
    flush()
    blocks.push({
      kind: 'unit',
      ...viewOf(u),
      ...splitSegments(u.segments, u.fromText, u.toText),
      split: readsSideBySide(u.segments),
      reasoning: reasoningOf(u),
    })
    shown++
  }
  flush()
  return { blocks, hidden }
}

const renderedGroups = computed(() => groups.value.map((g) => ({ ...g, ...blocksOf(g.units, g.article) })))

/** What one unit is called, so a context line can count them. */
function unitNoun(n: number): string {
  if (isNovelle.value) return n === 1 ? 'Änderungsanordnung' : 'Änderungsanordnungen'
  return n === 1 ? 'Paragraph' : 'Paragraphen'
}

/** Server-decided: every changed piece is a citation, number, date or punctuation. */
function isMinor(u: LawDiffUnit): boolean {
  return u.editorial
}

/** A Novelle has no §§ of its own; its units are the numbered amendment instructions. */
const isNovelle = computed(() => isNovelleUnits(data.value?.units ?? []))

/**
 * The Paragraph a change amends — placed in front of the name.
 *
 * „Z 2" is the Novellierungsanordnung's number, not the Paragraph's; without
 * the § a name like „Erweiterte Gefahrenerforschung" floats above a
 * designation that never names it, and three instructions for one Paragraph
 * look like the same thing three times. It stays away where the unit IS the
 * Paragraph (Textgegenüberstellung, a new law) — it would then stand twice in
 * one line.
 */
function unitParagraph(u: LawDiffUnit): string | null {
  const para = paraTitles.value?.paragraphs?.[diffUnitKey(u)] ?? null
  return para && para !== displayId(u.id) ? para : null
}

/**
 * Paragraph and name as one line: „§ 6 Erweiterte Gefahrenerforschung" —
 * and the Paragraph alone where no name is known. „§ 6" is already the
 * answer to which provision a Ziffer changes (§12.11); until 01.10.2026 the
 * label went with the name, so a nameless Ziffer said only „Z 28".
 */
function unitLabel(u: LawDiffUnit): string | null {
  const name = nameOf(u)
  const para = unitParagraph(u)
  if (!name) return para
  return para ? `${para} ${name}` : name
}

/**
 * Laws only one document carries are reported as laws, never as their
 * paragraphs: a Regierungsvorlage that merges several drafts would otherwise
 * report hundreds of paragraphs as "neu" and read as a verdict on this draft.
 * The sentences live in app/utils/lawPackage.ts, where they are tested.
 */
const mergedNote = computed(() =>
  mergedLawsNote(data.value?.lawsOnlyInTo ?? [], pair.value.from, pair.value.to, data.value?.largerAct ?? null),
)
/**
 * Between two later stations of a Vorlage that bundles this draft with
 * others, the counts are the draft's — and this sentence is what says so
 * (docs/architecture.md §12.33). From the draft, `mergedNote` names the act.
 */
const outsideNote = computed(() =>
  pair.value.from === 'me' || !data.value?.bundledWithOtherDrafts
    ? null
    : outsideDraftNote(data.value.lawsOutsideDraft, data.value.largerAct),
)
const droppedNote = computed(() =>
  droppedLawsNote(data.value?.lawsOnlyInFrom ?? [], pair.value.from, pair.value.to),
)
</script>

<template>
  <!-- id: the outcome card above links here ("der Vergleich der beiden Texte"). -->
  <div :id="anchorId" ref="root" class="scroll-mt-24">
    <PageSubsection :heading="heading">
      <template v-if="sentencesShown">
        <!-- Above the list only what is specific to THIS comparison. The
             ME→RV counts — how much changed, against the period's range, and
             how many Begründungen — and the way to the Erläuterungen stand in
             the Regierungsvorlage's station card since 02.10.2026, as rows
             instead of two paragraphs (`useVorlageOutcome`). What stays: a
             reasoning rate for a pair the card does not hold, and the
             warnings. -->
        <div class="space-y-3">
          <p v-if="reasoningNote && !countsInCard" class="text-sm text-ink-secondary">{{ reasoningNote }}</p>
          <ComparisonCaveats :notes="[outsideNote, mergedNote, droppedNote]" />
        </div>
      </template>

      <!-- Without a list the step toggle stands alone where the list would,
           so a reader who picked a step that cannot be compared keeps the
           way back. With one it is in the list's head (below). -->
      <div v-if="!hasList && steps.length > 1" class="mt-4 border-b border-hairline">
        <LawStepToggle :steps="steps" :current="requested" @choose="chooseStep" />
      </div>

      <!-- Only on the first load: a later step keeps the previous list until
           the next arrives. -->
      <ListSkeleton v-if="status === 'pending' || status === 'idle'" class="mt-3">
        Der Gesetzestext {{ fromLabel === 'Ministerialentwurf' ? 'des Entwurfs' : `der ${fromLabel}` }}
        wird mit dem der {{ toLabel }} verglichen …
      </ListSkeleton>
      <p v-else-if="status === 'error' || !data" class="mt-3 text-sm text-ink-secondary">
        Der Vergleich ist gerade nicht verfügbar.
      </p>
      <p v-else-if="!data.available" class="mt-3 text-sm text-ink-secondary">{{ data.unavailableReason }}</p>

      <template v-else>
        <template v-if="hasList">
          <ListBox class="mt-4">
            <!-- The step is the box's tabs (02.10.2026): under „Im Parlament"
                 nothing above depends on it — no figure, no reasoning rate,
                 one hint for both — so it chooses what the list compares, the
                 first layer of the box (`ListBox`). -->
            <template v-if="steps.length > 1" #tabs>
              <LawStepToggle :steps="steps" :current="requested" @choose="chooseStep" />
            </template>
            <template #header>
              <DiffToolbar
                v-model:query="query"
                v-model:hidden="hiddenKinds"
                :counts="kindCounts"
                :labels="BADGE_LABEL"
                search-label="Im Text suchen"
              />
            </template>
            <DiffGroup
              v-for="g in renderedGroups"
              :key="g.article"
              :title="g.article"
              :badges="badgeCounts(g.counts, BADGE_LABEL)"
              :open="groupOpen(g.article)"
              @toggle="toggleGroup(g.article)"
            >
              <template v-for="b in g.blocks" :key="blockKey(b)">
                <details v-if="b.kind === 'context'" class="group border-b border-hairline last:border-b-0">
                  <summary class="flex min-h-target cursor-pointer list-none items-center gap-2 px-4 py-2 text-xs text-ink-muted hover:bg-page [&::-webkit-details-marker]:hidden">
                    <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
                    {{ b.units.length }} {{ unitNoun(b.units.length) }} unverändert
                  </summary>
                  <div class="space-y-3 px-4 pb-3 pl-10 text-sm leading-relaxed text-ink-secondary">
                    <p v-for="u in b.units" :key="key(u.unit)" class="hyphens-auto">
                      <span class="font-medium text-ink">{{ displayId(u.unit.id) }}</span>
                      <span v-if="u.label" class="font-medium text-ink"> {{ u.label }}</span>
                      <span v-else-if="u.extra"> {{ u.extra }}</span>
                      <span> — {{ u.unit.toText }}</span>
                    </p>
                  </div>
                </details>

                <div v-else class="border-b border-hairline px-4 py-3 last:border-b-0">
                  <!-- Designation and name on a line of their own, above the
                       badge. Beside it they had to share one line with the
                       status, so "geändert Z 4 Geheimhaltung" read as a single
                       token — and the Textgegenüberstellung, where a § heads
                       several Absätze, cannot put them there at all. One shape
                       for both sections: what this is, then how it changed. -->
                  <p class="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                    <span class="font-medium text-ink">
                      {{ displayId(b.unit.id) }}
                      <span v-if="b.unit.fromId && b.unit.fromId !== b.unit.id" class="font-normal text-ink-muted">({{ fromLabel === 'Ministerialentwurf' ? 'im Entwurf' : `in der ${fromLabel}` }} {{ displayId(b.unit.fromId) }})</span>
                    </span>
                    <span v-if="b.label" class="min-w-0 text-ink-secondary">{{ b.label }}</span>
                    <span v-else-if="b.extra" class="min-w-0 text-ink-secondary">{{ b.extra }}</span>
                  </p>
                  <div class="border-l-2 pl-3" :class="GUTTER_CLASS[badgeOf(b.unit)]">
                    <p class="mb-1 text-sm">
                      <span
                        class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                        :class="BADGE_CLASS[badgeOf(b.unit)]"
                      >
                        {{ BADGE_LABEL[badgeOf(b.unit)] }}
                      </span>
                    </p>

                    <!-- Inline: one sentence, old struck out where the new
                         stands. Right for most changes; which ones read
                         better as two columns is decided per unit
                         (`readsSideBySide`), not by a switch. -->
                    <p v-if="b.unit.change === 'changed' && !b.split && b.unit.segments" class="hyphens-auto text-sm leading-relaxed text-ink">
                      <DiffText :segments="b.unit.segments" />
                    </p>
                    <!-- Side by side. ONE shape for two cases: the unit was
                         rewritten too thoroughly to read inline, or the word
                         diff hit its ceiling
                         and there are no segments to inline (then
                         `splitSegments` marks each side whole). The fallback
                         used to be its own layout, which made a technical
                         limit look like a different kind of change. -->
                    <div v-else-if="b.unit.change === 'changed'" class="grid gap-x-4 gap-y-2 text-sm leading-relaxed sm:grid-cols-2">
                      <div>
                        <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{{ fromLabel }}</p>
                        <p class="hyphens-auto text-ink">
                          <DiffText :segments="b.from" side="from" />
                        </p>
                      </div>
                      <div>
                        <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{{ toLabel }}</p>
                        <p class="hyphens-auto text-ink">
                          <DiffText :segments="b.to" side="to" />
                        </p>
                      </div>
                    </div>
                    <p v-else-if="b.unit.change === 'inserted'" class="hyphens-auto rounded bg-status-good/15 px-2 py-1 text-sm leading-relaxed text-ink">{{ b.unit.toText }}</p>
                    <p v-else-if="b.unit.change === 'removed'" class="hyphens-auto rounded bg-status-critical/10 px-2 py-1 text-sm leading-relaxed text-ink">{{ b.unit.fromText }}</p>
                    <p v-else class="hyphens-auto text-sm leading-relaxed text-ink-secondary">{{ b.unit.toText }}</p>

                    <!-- What the Ressort says about it — and whether it says
                         so differently after the Begutachtung than before.
                         Closed, like the reasoning at the
                         Textgegenüberstellung (docs/architecture.md §12.30):
                         it answers a second question, not the first. A native
                         <details>, so the browser's find-in-page opens it
                         instead of running past it. -->
                    <details v-if="b.reasoning" class="group mt-2">
                      <summary class="-mx-1 flex min-h-target cursor-pointer list-none items-center gap-2 rounded px-1 py-2 text-xs font-medium text-ink-secondary hover:bg-page [&::-webkit-details-marker]:hidden">
                        <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180" aria-hidden="true" />
                        <!-- Says what was compared (01.10.2026): the passage on
                             this change, or — where the Erläuterungen are titled
                             by § — everything they say about the Paragraph. -->
                        <template v-if="!b.reasoning.comparable">Die Begründung des Ressorts zu dieser Änderung</template>
                        <template v-else>{{ b.reasoning.basis === 'ziffer' ? 'Die Begründung des Ressorts zu dieser Änderung hat sich geändert' : 'Die Begründung des Ressorts zu diesem Paragraphen hat sich geändert' }}</template>
                      </summary>
                      <!-- Shown, not compared (01.10.2026): the two documents
                           explain this change together with different others,
                           so a word diff would measure the regrouping. One
                           sentence says why, then the texts under their own
                           headings — no „geändert", no „unverändert". -->
                      <div v-if="!b.reasoning.comparable" class="pb-2 pl-6">
                        <p class="mb-2 text-xs text-ink-muted">Entwurf und Regierungsvorlage fassen die Begründung zu dieser Änderung verschieden zusammen; verglichen wird sie deshalb nicht.</p>
                        <div class="grid gap-x-4 gap-y-2 text-sm leading-relaxed" :class="b.reasoning.fromText ? 'sm:grid-cols-2' : ''">
                          <div v-if="b.reasoning.fromText">
                            <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{{ fromLabel }}</p>
                            <p class="mb-1 text-xs text-ink-muted">{{ b.reasoning.fromHeading }}</p>
                            <p class="hyphens-auto text-ink">{{ b.reasoning.fromText }}</p>
                          </div>
                          <div>
                            <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{{ toLabel }}</p>
                            <p class="mb-1 text-xs text-ink-muted">{{ b.reasoning.label }}</p>
                            <p class="hyphens-auto text-ink">{{ b.reasoning.toText }}</p>
                          </div>
                        </div>
                      </div>
                      <template v-else>
                        <!-- The Vorlage's heading, because one passage often
                           explains several changes („Zu Z 1 bis 3 (§ 5):") and
                           the same drawer then opens at each of them. -->
                        <p v-if="b.reasoning.basis === 'ziffer'" class="pb-1 pl-6 text-xs text-ink-muted">{{ b.reasoning.label }}</p>
                        <p v-if="b.reasoning.segments" class="hyphens-auto pb-2 pl-6 text-sm leading-relaxed text-ink">
                          <DiffText :segments="b.reasoning.segments ?? []" />
                        </p>
                        <!-- Without a word diff: both versions in full, side by
                           side as in the comparison above, so a technical
                           ceiling does not look like a different kind of
                           change. The drawer is never empty — that the
                           reasoning is a different one is the finding, and the
                           ceiling is ours, not the Ressort's. -->
                        <div v-else class="pb-2 pl-6">
                          <p class="mb-2 text-xs text-ink-muted">Für einen Wortvergleich ist die Passage zu lang — hier beide Fassungen im Ganzen.</p>
                          <div class="grid gap-x-4 gap-y-2 text-sm leading-relaxed sm:grid-cols-2">
                            <div>
                              <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{{ fromLabel }}</p>
                              <p class="hyphens-auto text-ink">{{ b.reasoning.fromText }}</p>
                            </div>
                            <div>
                              <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{{ toLabel }}</p>
                              <p class="hyphens-auto text-ink">{{ b.reasoning.toText }}</p>
                            </div>
                          </div>
                        </div>
                      </template>
                    </details>
                  </div>
                </div>
              </template>

              <button
                v-if="g.hidden"
                type="button"
                class="flex min-h-target w-full items-center gap-2 px-4 py-2 text-left text-xs font-medium text-accent-deep hover:bg-page"
                @click="showAll(g.article)"
              >
                <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0" aria-hidden="true" />
                {{ g.hidden }} weitere {{ g.hidden === 1 ? 'Änderung' : 'Änderungen' }} anzeigen
              </button>
            </DiffGroup>
            <!-- Stays in the DOM as a live region and goes empty rather than
                 disappearing: a region that comes into being with its text is
                 not announced — whoever searched and found nothing would
                 otherwise get silence back. A row of the box, under its head. -->
            <p
              role="status"
              :class="visibleUnits.length ? 'sr-only' : 'px-4 py-4 text-sm text-ink-secondary'"
            >{{ visibleUnits.length ? '' : 'Nichts gefunden.' }}</p>
          </ListBox>
        </template>

        <!-- Provenance under the text it belongs to, the way a source note
             sits under a table rather than over it (17.09.2026). It is looked
             up while or after reading, never before — and it is one more block
             that used to rewrite itself above the select.

             Who published each document, never the licence: what may be
             claimed hangs on publisher and station and stands once, in the
             Impressum (`#shared/utils/provenance`, 02.10.2026). Where the line
             mixes publishers each version names its own — „Quellen: Parlament,
             RIS" over two documents left open which came from where, and
             „Parlament (Dokumente: freie Werke)" under ME→RV read as covering
             the draft too. -->
        <SectionCredits :sources="sources" method="/so-funktionierts#vergleich">
          <!-- Grouped by version since 30.09.2026: „Entwurf: Text ·
               Erläuterungen" instead of four links each carrying its version's
               name. The links are there for the reader. -->
          <span v-for="side in creditSides" :key="side.station">
            {{ side.label }}:
            <ExternalLink v-if="side.text" :href="side.text.url" class="text-accent-deep hover:underline">Text{{ side.textTag }}</ExternalLink><template v-if="side.text && side.reasoning"> · </template><ExternalLink v-if="side.reasoning" :href="side.reasoning.url" class="text-accent-deep hover:underline">Erläuterungen{{ side.reasoningTag }}</ExternalLink>
          </span>
          <!-- The § names come from a third source; a page that shows text has
               to say where it is from, even when the text is one word long.
               The date stays here, beside the comparison it dates: it changes
               per section, the licence does not. -->
          <span v-if="namedCount">Paragraphenüberschriften{{ paraTitlesTag }}<template v-if="paraTitlesAsOf">: Stand {{ paraTitlesAsOf }}</template></span>
        </SectionCredits>
      </template>
    </PageSubsection>
  </div>
</template>
