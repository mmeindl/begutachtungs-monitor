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
import type { LawDiffSegment, LawDiffUnit, LawStationId, ReasoningDiffEntry } from '#shared/types'
import { diffUnitKey } from '#shared/utils/diffKey'
import { countLabelDe, formatDateDe } from '#shared/utils/format'
import { isNovelleUnits } from '#shared/utils/changeShare'
import { type DiffBadge, badgeCounts, badgeLabels } from '~/utils/diffBadges'
import { readsSideBySide, splitSegments } from '~/utils/diffSides'
import { displayId, extraHeading, unitName } from '#shared/utils/unitName'
import { droppedLawsNote, mergedLawsNote, outsideDraftNote } from '~/utils/lawPackage'
import { lawDiffCredits } from '~/utils/lawDiffCredits'
import { reasoningRateNote } from '~/utils/reasoningNotes'
import {
  LAW_STATION_LABEL,
  PARLIAMENT_COMPARISON_QUESTION,
  type LawDiffScope,
  isLawStationId,
  lawDiffScopeOf,
  lawStationPairQuestion,
} from '#shared/utils/lawStations'
import { mixedPublishers } from '#shared/utils/provenance'

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
/** `#textvergleich` stays the Vorlage's: that anchor is in circulation. */
const anchorId = scope === 'rv' ? 'textvergleich' : `textvergleich-${scope}`

const route = useRoute()
const router = useRouter()

/* The step, the URL's pair, the three requests and what is on screen —
 * `useLawDiffStep`, where the reasons for their keys and their swapping
 * stand. */
const {
  steps,
  scopeDefault,
  enabled,
  enable,
  pair,
  data,
  status,
  paraTitles,
  reasoning,
  stepOptions,
  selectedStep,
} = useLawDiffStep({
  gp: () => props.gp,
  inr: () => props.inr,
  scope,
  parliamentTexts: props.parliamentTexts,
  deferred: props.deferred,
})

const root = useTemplateRef<HTMLElement>('root')

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
  }
})

// A deferred instance asks once it comes within 600 px — registered after
// the redirect above, which may have enabled it already.
useNearViewport(root, enable, '600px 0px', () => enabled.value)

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

/** The sentence above the comparison that explains the disclosures below
 *  it (`reasoningRateNote`). */
const reasoningNote = computed(() => reasoningRateNote(reasoning.value?.stats))

/** ME→RV states its counts in the Regierungsvorlage's station frame
 *  (`useVorlageOutcome`, 02.10.2026), so the comparison under it repeats
 *  none of them. */
const countsInFrame = computed(() => pair.value.from === 'me' && pair.value.to === 'rv')
/**
 * What this comparison shows, per document, and one entry per compared
 * version for the credit line (`lawDiffCredits`).
 */
const credits = computed(() => lawDiffCredits(data.value, reasoning.value, pair.value, namedCount.value))
const paraTitlesTag = computed(() => (mixedPublishers(credits.value.sources) ? ' (RIS)' : ''))
const paraTitlesAsOf = computed(() => (paraTitles.value?.asOf ? formatDateDe(paraTitles.value.asOf) : null))

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
 * The screen-reader announcement once the comparison is there (04.10.2026) —
 * the last of the three sections to get one: the list replaced the skeleton
 * mutely, and whoever reads the page linearly waited for an answer that
 * never came. The same mechanics as the Textgegenüberstellung's: empty while
 * loading, because the skeleton's sentence says that already and a region
 * that carries text when it is mounted is read out at once.
 *
 * It counts the changes, not the units: the unchanged ones are context, and
 * „413 Paragraphen" for a comparison with five changes would announce the
 * wrong thing. A step switch is announced only where its count differs: the
 * previous list stays on screen until the next arrives, so the region never
 * passes through „loading" in between (`useLawDiffStep`).
 */
const loadAnnouncement = computed(() => {
  if (status.value === 'pending' || status.value === 'idle') return ''
  if (status.value === 'error' || !data.value) return 'Der Vergleich ist gerade nicht verfügbar.'
  if (!data.value.available) return data.value.unavailableReason ?? ''
  const changes = data.value.units.filter((u) => badgeOf(u) !== 'unchanged').length
  return changes
    ? `Vergleich geladen, ${countLabelDe(changes, 'Änderung', 'Änderungen')}.`
    : 'Vergleich geladen, keine Änderungen.'
})

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
  // Server-decided: every changed piece is a citation, number, date or punctuation.
  return u.editorial ? 'editorial' : u.change
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
const { query, hiddenKinds, folding, toggleGroup, groupOpen, showAll, limitFor } = useDiffFilters()

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
 * closed until asked, a search opens everything — is in `useDiffFilters`.
 */

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
  // folded away behind a context line (`folding`).
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
    if (folding.value && badgeOf(u) === 'unchanged') {
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
  mergedLawsNote(
    data.value?.lawsOnlyInTo ?? [],
    pair.value.from,
    pair.value.to,
    data.value?.largerAct ?? null,
    data.value?.otherDrafts?.length ? { others: data.value.otherDrafts, gp: props.gp } : null,
  ),
)
/**
 * Laws the Regierungsvorlage added to a draft it was built from alone. They
 * stand in the list as groups of their own, every unit „neu" — and the
 * group says why, or „3 neu" reads as three new §§ in a law the draft
 * already changed (docs/architecture.md §12.40).
 */
const addedLaws = computed(() => new Set((data.value?.addedLaws ?? []).map((l) => l.article)))
/** The same for a law the Ressort took out of its own bill: said as a fact about the two texts, nothing about where it went. */
const droppedLaws = computed(() => new Set((data.value?.droppedLaws ?? []).map((l) => l.article)))
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
      <p class="sr-only" role="status">{{ loadAnnouncement }}</p>

      <template v-if="sentencesShown">
        <!-- Above the list only what is specific to THIS comparison. The
             ME→RV counts — how much changed, against the period's range, and
             how many Begründungen — and the way to the Erläuterungen stand in
             the Regierungsvorlage's station frame since 02.10.2026, as rows
             instead of two paragraphs (`useVorlageOutcome`). What stays: a
             reasoning rate for a pair the frame does not hold, and the
             warnings. -->
        <div class="space-y-3">
          <p v-if="reasoningNote && !countsInFrame" class="text-sm text-ink-secondary">{{ reasoningNote }}</p>
          <ComparisonCaveats :notes="[outsideNote, mergedNote, droppedNote]" />
        </div>
      </template>

      <!-- Without a list the step toggle stands alone where the list would,
           so a reader who picked a step that cannot be compared keeps the
           way back. With one it is in the list's head (below). -->
      <div v-if="!hasList && steps.length > 1" class="mt-4 border-b border-hairline">
        <ListTabs v-model="selectedStep" :options="stepOptions" group-label="Welcher Schritt im Parlament" />
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
              <ListTabs v-model="selectedStep" :options="stepOptions" group-label="Welcher Schritt im Parlament" />
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
              :more="g.hidden"
              @toggle="toggleGroup(g.article)"
              @more="showAll(g.article)"
            >
              <p v-if="addedLaws.has(g.article)" class="border-b border-hairline px-4 py-2.5 text-sm text-ink-secondary">
                Dieses Gesetz kommt im Entwurf nicht vor; die Regierungsvorlage ändert es zusätzlich.
              </p>
              <p v-else-if="droppedLaws.has(g.article)" class="border-b border-hairline px-4 py-2.5 text-sm text-ink-secondary">
                Der Entwurf änderte dieses Gesetz; die Regierungsvorlage ändert es nicht mehr.
              </p>
              <template v-for="b in g.blocks" :key="blockKey(b)">
                <details v-if="b.kind === 'context'" class="group border-b border-hairline last:border-b-0">
                  <summary class="flex min-h-target cursor-pointer list-none items-center gap-2 px-4 py-2 text-xs text-ink-muted hover:bg-hover [&::-webkit-details-marker]:hidden">
                    <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
                    {{ b.units.length }} {{ unitNoun(b.units.length) }} unverändert
                  </summary>
                  <div class="space-y-3 px-4 pb-3 pl-10 text-sm leading-relaxed text-ink-secondary">
                    <p v-for="u in b.units" :key="diffUnitKey(u.unit)" class="hyphens-auto">
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
                  <DiffBody
                    :badge="badgeOf(b.unit)"
                    :label="BADGE_LABEL[badgeOf(b.unit)]"
                    :change="b.unit.change"
                    :segments="b.unit.segments"
                    :from="b.from"
                    :to="b.to"
                    :split="b.split"
                    :from-text="b.unit.fromText"
                    :to-text="b.unit.toText"
                    :from-label="fromLabel"
                    :to-label="toLabel"
                  >
                    <!-- What the Ressort says about it — and whether it says
                         so differently after the Begutachtung than before.
                         Closed, like the reasoning at the
                         Textgegenüberstellung (docs/architecture.md §12.30):
                         it answers a second question, not the first. A native
                         <details>, so the browser's find-in-page opens it
                         instead of running past it. -->
                    <Disclosure v-if="b.reasoning" size="xs" tone="secondary" class="mt-2">
                      <!-- Says what was compared (01.10.2026): the passage on
                           this change, or — where the Erläuterungen are titled
                           by § — everything they say about the Paragraph. -->
                      <template #summary>
                        <template v-if="!b.reasoning.comparable">Die Begründung des Ressorts zu dieser Änderung</template>
                        <template v-else>{{ b.reasoning.basis === 'ziffer' ? 'Die Begründung des Ressorts zu dieser Änderung hat sich geändert' : 'Die Begründung des Ressorts zu diesem Paragraphen hat sich geändert' }}</template>
                      </template>
                      <!-- Shown, not compared (01.10.2026): the two documents
                           explain this change together with different others,
                           so a word diff would measure the regrouping. One
                           sentence says why, then the texts under their own
                           headings — no „geändert", no „unverändert". -->
                      <div v-if="!b.reasoning.comparable" class="pb-2 pl-6">
                        <p class="mb-2 text-xs text-ink-muted">Entwurf und Regierungsvorlage fassen die Begründung zu dieser Änderung verschieden zusammen; verglichen wird sie deshalb nicht.</p>
                        <SideBySide :from-label="fromLabel" :to-label="toLabel">
                          <template v-if="b.reasoning.fromText" #from>
                            <p class="mb-1 text-xs text-ink-muted">{{ b.reasoning.fromHeading }}</p>
                            <p class="hyphens-auto text-ink">{{ b.reasoning.fromText }}</p>
                          </template>
                          <template #to>
                            <p class="mb-1 text-xs text-ink-muted">{{ b.reasoning.label }}</p>
                            <p class="hyphens-auto text-ink">{{ b.reasoning.toText }}</p>
                          </template>
                        </SideBySide>
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
                          <SideBySide :from-label="fromLabel" :to-label="toLabel">
                            <template #from>
                              <p class="hyphens-auto text-ink">{{ b.reasoning.fromText }}</p>
                            </template>
                            <template #to>
                              <p class="hyphens-auto text-ink">{{ b.reasoning.toText }}</p>
                            </template>
                          </SideBySide>
                        </div>
                      </template>
                    </Disclosure>
                  </DiffBody>
                </div>
              </template>
            </DiffGroup>
            <NoMatches :found="visibleUnits.length > 0" />
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
        <SectionCredits :sources="credits.sources" method="/so-funktionierts#vergleich">
          <!-- Grouped by version since 30.09.2026: „Entwurf: Text ·
               Erläuterungen" instead of four links each carrying its version's
               name. The links are there for the reader. -->
          <span v-for="side in credits.sides" :key="side.station">
            {{ side.label }}:
            <ExternalLink v-if="side.text" :href="side.text.url" class="link-muted">Text{{ side.textTag }}</ExternalLink><template v-if="side.text && side.reasoning"> · </template><ExternalLink v-if="side.reasoning" :href="side.reasoning.url" class="link-muted">Erläuterungen{{ side.reasoningTag }}</ExternalLink>
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
