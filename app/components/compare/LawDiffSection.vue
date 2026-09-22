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
 */
import type { LawDiffResponse, LawDiffSegment, LawDiffUnit, LawStationId, ParagraphTitlesResponse, ReasoningDiffEntry, ReasoningDiffResponse } from '#shared/types'
import { unitKey } from '#shared/utils/diffKey'
import { BADGE_CLASS, type DiffBadge, GUTTER_CLASS, badgeCounts, badgeLabels } from '~/utils/diffBadges'
import { splitSegments } from '~/utils/diffSides'
import { droppedLawsNote, mergedLawsNote } from '~/utils/lawPackage'
import {
  DEFAULT_LAW_STATION_PAIR,
  LAW_STATION_LABEL,
  defaultFromFor,
  isLawStationId,
  isLawStationPair,
  isLicensedPair,
  lawStationPairHint,
  lawStationPairQuestion,
} from '#shared/utils/lawStations'

const props = defineProps<{ gp: string; inr: number }>()

const route = useRoute()
const router = useRouter()

/**
 * The pair from the URL, falling back to the default rather than erroring:
 * a hand-typed or stale link should show the comparison everyone means, not
 * a validation message. The server validates the same query independently
 * (`readLawStationPair`), because a request can arrive without this page.
 */
function pairFromRoute(): { from: LawStationId; to: LawStationId } {
  const bis = route.query.bis
  const von = route.query.von
  const to = isLawStationId(bis) ? bis : DEFAULT_LAW_STATION_PAIR.to
  const from = isLawStationId(von) ? von : defaultFromFor(to)
  if (!from || !isLawStationPair(from, to)) return { ...DEFAULT_LAW_STATION_PAIR }
  return { from, to }
}
const pair = ref(pairFromRoute())

const { data, status } = await useFetch<LawDiffResponse>(
  () => `/api/drafts/${props.gp}/${props.inr}/diff?von=${pair.value.from}&bis=${pair.value.to}`,
  { lazy: true, server: false },
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
const { data: paraTitles } = await useFetch<ParagraphTitlesResponse>(
  () => `/api/drafts/${props.gp}/${props.inr}/paragraphtitel?von=${pair.value.from}&bis=${pair.value.to}`,
  { lazy: true, server: false },
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
const { data: reasoning } = await useFetch<ReasoningDiffResponse>(
  () => `/api/drafts/${props.gp}/${props.inr}/begruendung?von=${pair.value.from}&bis=${pair.value.to}`,
  { lazy: true, server: false },
)

/**
 * The changed reasoning for one unit, or nothing.
 *
 * Two steps, because there are two levels: computed per Paragraph, shown at
 * the Novellierungsanordnung — and several instructions point at the same
 * Paragraph (8/ME: six at § 11).
 */
function reasoningOf(u: LawDiffUnit): ReasoningDiffEntry | null {
  const para = reasoning.value?.units?.[unitKey(u)]
  const entry = para ? reasoning.value?.paragraphs?.[para] : null
  return entry?.changed ? entry : null
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
  if (changed === 0) return `Zu allen ${compared} Paragraphen, für die beide Fassungen eine Begründung führen, ist sie unverändert geblieben.`
  return `Zu ${changed} von ${compared} Paragraphen, für die beide Fassungen eine Begründung führen, hat das Ressort sie geändert — aufklappbar an der Änderung.`
})

/**
 * Every comparison this draft can show, as ordered pairs of the stations it
 * actually published a text for.
 *
 * ONE control offering comparisons, not two offering stations: the reader's
 * question is "what did the committee change?", not "which two documents
 * shall I pick". It also makes an impossible pair unrepresentable — no
 * flipped, no equal ends — which two independent selects would have to catch
 * and explain. Both ends stay freely selectable, they are just enumerated.
 *
 * A station whose text is PDF-only says so in the option: the § parser needs
 * the HTML export, and a reader who picks it should know beforehand rather
 * than get an explanation afterwards.
 */
const comparisons = computed(() => {
  const stations = data.value?.stations ?? []
  const out: { value: string; from: LawStationId; to: LawStationId; label: string }[] = []
  for (const from of stations) {
    for (const to of stations) {
      // `isLawStationPair` rather than an index comparison: since the BGBl
      // station the rule has an exception (no actor stands behind
      // plenum→bgbl, docs/architecture.md §12.33), and it may live in ONE
      // place only — the server checks what is offered here with the same
      // function.
      if (!isLawStationPair(from.id, to.id)) continue
      const pdfOnly = [from, to].filter((s) => !s.comparable).map((s) => s.label)
      out.push({
        value: `${from.id}>${to.id}`,
        from: from.id,
        to: to.id,
        label:
          `${from.label} → ${to.label}` +
          (pdfOnly.length ? ` (${pdfOnly.join(' und ')} nur als PDF)` : ''),
      })
    }
  }
  return out
})

/** The value of the select, kept in sync with the pair in the URL. */
const selectedComparison = computed({
  get: () => `${pair.value.from}>${pair.value.to}`,
  set: (value: string) => {
    const choice = comparisons.value.find((c) => c.value === value)
    if (!choice) return
    pair.value = { from: choice.from, to: choice.to }
    // `replace`, not `push`: the pair belongs in the URL so it can be
    // shared, but flipping between comparisons should not fill the back
    // button with steps the reader has to walk out of. The default pair
    // leaves the query empty, so the canonical URL of a draft stays clean.
    const query = { ...route.query }
    if (choice.from === DEFAULT_LAW_STATION_PAIR.from && choice.to === DEFAULT_LAW_STATION_PAIR.to) {
      delete query.von
      delete query.bis
    } else {
      query.von = choice.from
      query.bis = choice.to
    }
    router.replace({ query })
  },
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
 * The heading is the DEFAULT pair's question, and that is not a compromise:
 * it names the era every one of these comparisons belongs to — everything
 * here happened after the Begutachtung — while the line under the controls
 * names the step. It also keeps the wording the two links that point here
 * already use (the Regierungsvorlage station of the spine, and the outcome
 * card).
 */
const heading = lawStationPairQuestion(DEFAULT_LAW_STATION_PAIR.from, DEFAULT_LAW_STATION_PAIR.to)
const isDefaultPair = computed(
  () => pair.value.from === DEFAULT_LAW_STATION_PAIR.from && pair.value.to === DEFAULT_LAW_STATION_PAIR.to,
)
/** Only for the other pairs: on the default one it would repeat the heading. */
const question = computed(() => lawStationPairQuestion(pair.value.from, pair.value.to))
const fromLabel = computed(() => LAW_STATION_LABEL[pair.value.from])
const toLabel = computed(() => LAW_STATION_LABEL[pair.value.to])

/**
 * What to call a change. The draft's own quoted heading wins — it is the
 * name the § will carry once the amendment passes. Otherwise the heading it
 * carries today, looked up in the standing law. Both are quoted from an
 * official text; neither is generated, so neither needs a marking.
 */
function unitName(u: LawDiffUnit): string | null {
  return u.quotedHeading ?? paraTitles.value?.titles?.[unitKey(u)] ?? null
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
 * Searching, but no filtering by change kind — the select that offered it was
 * removed on 17.09.2026 (Manu, with the page in front of him).
 *
 * It offered ISOLATION ("show only neu") where the reader's actual task is
 * SUPPRESSION ("hide the redaktionell ones so I see the substance"), and
 * suppression was never on offer: the options were single-select. So it
 * answered a question almost nobody asks while the one they do ask stayed
 * unavailable — and the counts it carried are on the law headers anyway,
 * where they are per law instead of per page. What it cost is the only
 * printed OVERALL total, which matters just for a multi-law package; the
 * per-law pills are the more useful granularity, and a plain summary line
 * would be cheaper to read than a dropdown if the total is ever missed.
 */
const query = ref('')

function key(u: LawDiffUnit): string {
  return unitKey(u)
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
 * shapes apart, and `unitKey` alone cannot, because a context block is named
 * after the first unit it folds.
 */
function blockKey(b: Block): string {
  return b.kind === 'unit' ? `unit|${unitKey(b.unit)}` : `context|${unitKey(b.units[0]!.unit)}`
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

const visibleUnits = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return data.value?.units ?? []
  return (data.value?.units ?? []).filter((_, i) => haystacks.value[i]!.includes(q))
})

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
  /** `unitLabel` — "§ 6 Erweiterte Gefahrenerforschung", null where no name is known */
  label: string | null
  /** `extraHeading` — the heading, only where it says something the block does not */
  extra: string | null
}

type Block =
  | ({ kind: 'unit'; from: LawDiffSegment[]; to: LawDiffSegment[]; reasoning: ReasoningDiffEntry | null } & UnitView)
  | { kind: 'context'; units: UnitView[] }

function viewOf(u: LawDiffUnit): UnitView {
  return { unit: u, label: unitLabel(u), extra: extraHeading(u) }
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
      reasoning: reasoningOf(u),
    })
    shown++
  }
  flush()
  return { blocks, hidden }
}

const renderedGroups = computed(() => groups.value.map((g) => ({ ...g, ...blocksOf(g.units, g.article) })))

/**
 * Inline or side by side — the reasoning is at `DiffToolbar`, which offers
 * the choice. NO new endpoint and no second computation: `segments` already
 * carries `equal | removed | inserted` per run, so the left column is
 * everything that is not `inserted` and the right everything that is not
 * `removed` — the same data projected twice.
 */
const view = ref<'inline' | 'split'>('inline')

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
const isNovelle = computed(() => {
  const units = data.value?.units ?? []
  return units.length > 0 && units.every((u) => /^Z\d/.test(u.id))
})
const hasZiffern = computed(() => (data.value?.units ?? []).some((u) => /^Z\d/.test(u.id)))

/**
 * The heading, but only where it says something the block does not.
 *
 * For a § of a Stammgesetz it is the § title ("Anwendungsbereich") — real
 * information. For a Novellierungsanordnung it IS the instruction line, cut
 * at the colon or after 100 characters (`novaoHeading`): it exists so that
 * renumbered Ziffern can pair by heading, and it was the row label back when
 * the text sat behind a click. Now that every block shows its text, printing
 * a truncated copy of the same sentence above it is noise.
 */
function extraHeading(u: LawDiffUnit): string | null {
  if (!u.heading) return null
  const norm = (s: string) => s.replace(/\s*…\s*$/, '').replace(/\s+/g, ' ').trim().toLowerCase()
  const heading = norm(u.heading)
  const body = norm((u.change === 'removed' ? u.fromText : u.toText) ?? '')
  return heading && body.startsWith(heading) ? null : u.heading
}

/** "§5" → "§ 5", "Z3" → "Z 3" */
function displayId(id: string): string {
  return id.replace(/^§/, '§ ').replace(/^Z(\d)/, 'Z $1')
}

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
  const para = paraTitles.value?.paragraphs?.[unitKey(u)] ?? null
  return para && para !== displayId(u.id) ? para : null
}

/** Paragraph and name as one line: „§ 6 Erweiterte Gefahrenerforschung". */
function unitLabel(u: LawDiffUnit): string | null {
  const name = unitName(u)
  if (!name) return null
  const para = unitParagraph(u)
  return para ? `${para} ${name}` : name
}

/**
 * Laws only one document carries are reported as laws, never as their
 * paragraphs: a Regierungsvorlage that merges several drafts would otherwise
 * report hundreds of paragraphs as "neu" and read as a verdict on this draft.
 * The sentences live in app/utils/lawPackage.ts, where they are tested.
 */
const mergedNote = computed(() =>
  mergedLawsNote(data.value?.lawsOnlyInTo ?? [], pair.value.from, pair.value.to),
)
const droppedNote = computed(() =>
  droppedLawsNote(data.value?.lawsOnlyInFrom ?? [], pair.value.from, pair.value.to),
)
</script>

<template>
  <!-- id: the outcome card above links here ("der Vergleich der beiden Texte"). -->
  <div id="textvergleich" class="mt-8 scroll-mt-24">
    <h3 class="text-base font-semibold text-ink">{{ heading }}</h3>

    <!-- Section-level control, and therefore in the section's header rather
         than in the toolbar of the list: it changes WHAT is compared, while
         the toggle and the search below change how the result is read.
         Outside every branch on purpose — a pair whose text is PDF-only
         answers with a reason and no units, and with the select inside that
         branch the reader would lose the control that got them there. -->
    <div v-if="comparisons.length > 1" class="mt-2">
      <TokenSelect v-model="selectedComparison" aria-label="Welche zwei Fassungen vergleichen">
        <option v-for="c in comparisons" :key="c.value" :value="c.value">{{ c.label }}</option>
      </TokenSelect>
    </div>

    <p v-if="status === 'pending' || status === 'idle'" class="mt-1 text-sm text-ink-secondary">
      Der Gesetzestext {{ fromLabel === 'Ministerialentwurf' ? 'des Entwurfs' : `der ${fromLabel}` }}
      wird mit dem der {{ toLabel }} verglichen …
    </p>

    <p v-else-if="status === 'error' || !data" class="mt-1 text-sm text-ink-secondary">
      Der Vergleich ist gerade nicht verfügbar.
    </p>

    <template v-else-if="!data.available">
      <p class="mt-1 text-sm text-ink-secondary">{{ data.unavailableReason }}</p>
    </template>

    <template v-else>
      <!-- What the selected pair answers, where the selection happened. -->
      <p v-if="!isDefaultPair" class="mt-3 text-sm font-medium text-ink">{{ question }}</p>
      <!-- What „Z 1" is and what „redaktionell" means stood up here until
           18.09.2026. Both are vocabulary, not findings about this draft:
           they belong in the legend at the foot of the section, where they
           are looked up when the word turns up — not two screens earlier.
           What stays here says something about this text: that it amends an
           existing law, and which two versions are compared. -->
      <p class="mt-1 text-sm text-ink-secondary">
        <!-- „Z 1" stands in the parenthesis, not in a legend: it is the unit
             THIS comparison counts in, so a sentence about this draft. A
             glossary entry of its own was a footnote to a word that has to
             appear in the same sentence anyway. -->
        <template v-if="isNovelle">
          Dieser Text ändert ein bestehendes Gesetz — verglichen wird deshalb
          Änderungsanordnung für Änderungsanordnung (Z 1, Z 2 …),
          {{ fromLabel }} gegen {{ toLabel }}.
        </template>
        <template v-else-if="hasZiffern">
          Paragraph für Paragraph, {{ fromLabel }} gegen {{ toLabel }}; wo ein
          bestehendes Gesetz geändert wird, Anordnung für Anordnung (Z 1, Z 2 …).
        </template>
        <template v-else>Paragraph für Paragraph, {{ fromLabel }} gegen {{ toLabel }}.</template>
        {{ lawStationPairHint(pair.from, pair.to) }}
        <!-- „Unveränderte Stellen sind eingeklappt." went on 18.09.2026: the
             list shows the folded runs as rows of their own with their count
             („12 Paragraphen unverändert"). Telling a reader what he can see
             costs a line and says nothing.

             The way to the explanation, since 18.09.2026: this section
             carried the same badges as the Textgegenüberstellung but was the
             only one without a link to the page that explains them. Whoever
             does not know „redaktionell" stood here in front of the word with
             no way out. -->
        <NuxtLink to="/so-funktionierts#gegenueberstellung" class="link-inline">Wie wir vergleichen</NuxtLink>
      </p>

      <div v-if="mergedNote || droppedNote" class="mt-3 border-l-2 border-hairline pl-3 text-xs text-ink-secondary">
        <p v-if="mergedNote">{{ mergedNote }}</p>
        <p v-if="droppedNote" :class="mergedNote ? 'mt-1.5' : ''">{{ droppedNote }}</p>
      </div>

      <!-- The reasoning, once as a rate above the list instead of
           „unverändert" on every row (docs/architecture.md §12.10b). Arrives
           when its fetch does. -->
      <p v-if="reasoningNote" class="mt-3 max-w-prose text-sm text-ink-secondary">{{ reasoningNote }}</p>

      <template v-if="data.units.length">
        <!-- How to read the result, and a search: both scope the list below
             them and nothing above. -->
        <DiffToolbar
          v-model:view="view"
          v-model:query="query"
          view-label="Darstellung des Vergleichs"
          search-label="Im Text suchen"
        />

        <div class="mt-3 border-y border-hairline">
          <section v-for="g in renderedGroups" :key="g.article" class="border-b border-hairline last:border-b-0">
            <DiffGroupHeader
              :title="g.article"
              :badges="badgeCounts(g.counts, BADGE_LABEL)"
              :open="groupOpen(g.article)"
              @toggle="toggleGroup(g.article)"
            />
            <div v-if="groupOpen(g.article)" class="border-t border-hairline">
              <template v-for="b in g.blocks" :key="blockKey(b)">
                <details v-if="b.kind === 'context'" class="group border-b border-hairline last:border-b-0">
                  <summary class="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs text-ink-muted hover:bg-page [&::-webkit-details-marker]:hidden">
                    <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
                    {{ b.units.length }} {{ unitNoun(b.units.length) }} unverändert
                  </summary>
                  <div class="space-y-3 px-3 pb-3 pl-9 text-sm leading-relaxed text-ink-secondary">
                    <p v-for="u in b.units" :key="key(u.unit)" class="hyphens-auto">
                      <span class="font-medium text-ink">{{ displayId(u.unit.id) }}</span>
                      <span v-if="u.label" class="font-medium text-ink"> {{ u.label }}</span>
                      <span v-else-if="u.extra"> {{ u.extra }}</span>
                      <span> — {{ u.unit.toText }}</span>
                    </p>
                  </div>
                </details>

                <div v-else class="border-b border-hairline px-3 py-3 last:border-b-0">
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
                         stands. The default, and right for most changes. -->
                    <p v-if="b.unit.change === 'changed' && view === 'inline' && b.unit.segments" class="hyphens-auto text-sm leading-relaxed text-ink">
                      <DiffText :segments="b.unit.segments" />
                    </p>
                    <!-- Side by side. ONE shape for two cases: the reader
                         asked for columns, or the word diff hit its ceiling
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
                      <summary class="-mx-1 flex min-h-11 cursor-pointer list-none items-center gap-2 rounded px-1 py-2 text-xs font-medium text-ink-secondary hover:bg-page [&::-webkit-details-marker]:hidden">
                        <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180" aria-hidden="true" />
                        Die Begründung des Ressorts zu diesem Paragraphen hat sich geändert
                      </summary>
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
                    </details>
                  </div>
                </div>
              </template>

              <button
                v-if="g.hidden"
                type="button"
                class="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-accent-deep hover:bg-page"
                @click="showAll(g.article)"
              >
                <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0" aria-hidden="true" />
                {{ g.hidden }} weitere {{ g.hidden === 1 ? 'Änderung' : 'Änderungen' }} anzeigen
              </button>
            </div>
          </section>
        </div>
        <!-- Stays in the DOM as a live region and goes empty rather than
             disappearing: a region that comes into being with its text is not
             announced — whoever searched and found nothing would otherwise
             get silence back. -->
        <p
          role="status"
          :class="visibleUnits.length ? 'sr-only' : 'mt-2 text-sm text-ink-secondary'"
        >{{ visibleUnits.length ? '' : 'Nichts gefunden.' }}</p>
      </template>

      <!-- Provenance under the text it belongs to, the way a source note
           sits under a table rather than over it (17.09.2026). It is looked
           up while or after reading, never before — and it is one more block
           that used to rewrite itself above the select.

           The licence hangs on the pair, not on the page: with the
           Ministerialentwurf on one side a shared „CC BY 4.0" would be wrong
           for that half — the Vorlage is a licensed dataset, the draft belongs
           to the Begutachtungsverfahren, which Parliament excludes from
           open-data use (CLAUDE.md, Legal constraints). Comparing two
           parliamentary versions, both sides are licensed and the statement
           belongs there — the same per-source split as in the Impressum. -->
      <SectionCredits>
        <!-- BOTH sides decide the line now, not only the left one: the
             kundgemachte Fassung comes from RIS, and `rv→bgbl` would
             otherwise carry „Quellen (Parlament)" over a RIS document. -->
        <span>{{ data.fromSource === 'ris' || data.toSource === 'ris' ? 'Quellen (RIS und Parlament):' : 'Quellen (Parlament):' }}</span>
        <ExternalLink v-if="data.fromDocument" :href="data.fromDocument.url" class="text-accent-deep hover:underline">{{ data.fromDocument.label }}</ExternalLink>
        <ExternalLink v-if="data.toDocument" :href="data.toDocument.url" class="text-accent-deep hover:underline">{{ data.toDocument.label }}</ExternalLink>
        <span v-if="isLicensedPair(pair.from, pair.to)">CC BY 4.0</span>
        <!-- The § names come from a third source; a page that shows text has
             to say where it is from, even when the text is one word long. -->
        <span v-if="namedCount">§-Titel: RIS Bundesrecht, Stand {{ paraTitles?.asOf }}</span>
        <!-- The Erläuterungen are two more documents, and whoever shows text
             says where it is from — even when it is folded away. -->
        <template v-if="reasoning?.stats?.compared">
          <ExternalLink
            v-for="src in reasoning.sources"
            :key="src.url"
            :href="src.url"
            class="text-accent-deep hover:underline"
          >{{ src.label }}</ExternalLink>
        </template>
      </SectionCredits>
    </template>
  </div>
</template>
