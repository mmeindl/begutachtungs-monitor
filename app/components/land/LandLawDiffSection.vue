<script setup lang="ts">
import type { Ref } from 'vue'
import type { LandCode, LandExplanationsResponse, LandLawDiffResponse, LandReasoningResponse, ReasoningDiffEntry, LandTextStation, LawDiffSegment, LawDiffUnit, LawStationId } from '#shared/types'
import { isNovelleUnits } from '#shared/utils/changeShare'
import { diffUnitKey } from '#shared/utils/diffKey'
import { formatDateDe } from '#shared/utils/format'
import { landDiffKey, landExplanationsKey, landLawGroupTitle, landReasoningKey, landShortTitle } from '#shared/utils/laender'
import { lawStationPairQuestion } from '#shared/utils/lawStations'
import { displayId, extraHeading, unitName } from '#shared/utils/unitName'
import { BADGE_CLASS, type DiffBadge, PILL_CLASS, badgeCounts, badgeLabels } from '~/utils/diffBadges'
import { IN_FORCE_MARK, moveTargets, reachesGroups, renumberedNote, withheldGroups, type Reach } from '~/utils/landWithheld'
import { annexDroppedPagesNote } from '~/utils/annexNotes'
import { readsSideBySide, splitSegments } from '~/utils/diffSides'
import ListBox from '~/components/ui/ListBox.vue'
import LandWithheldNotes from '~/components/land/LandWithheldNotes.vue'

/**
 * What became of a Land's draft, § by § (22.10.2026): the Begutachtungsentwurf
 * against the Kundmachung, under „Im Landesgesetzblatt" — where the
 * Ministerialentwurf's page hangs the comparison of the whole way, and with
 * the same question, pieces and filters (`DiffToolbar`, `DiffGroup`,
 * `DiffBody`).
 *
 * Its own component rather than `LawDiffSection`: that one is the
 * Parliament's path — steps between station texts, the Erläuterungen
 * compared beside each change, § names from RIS — and a Land has none of
 * them. What the two share is the view, and the view is shared.
 *
 * Lazy and client-side, like every comparison on the draft pages: two
 * documents and a PDF parse the page must not wait for, and the section
 * says „lädt" meanwhile — nothing false in the time it takes.
 *
 * NOTHING ABOVE THE LIST but a rare warning (23.10.2026), as on the
 * Ministerialentwurf's page. Three sentences stood there: the counts, which
 * the legend and the groups' pills state already; the Begründungen changed,
 * which for the step after the Begutachtung is a row of the Vorlage's frame
 * now (`useLandVorlageOutcome`), as the Bund's; and the §§ the
 * Textgegenüberstellung withheld, which its law's group counts („nicht
 * gezeigt") and names when opened. What stays above is what the Bund keeps
 * there too: that what follows may be misread (`ComparisonCaveats`).
 */
const props = withDefaults(defineProps<{
  land: LandCode
  number: string
  /** The two texts; the draft against the Kundmachung unless said. */
  from?: LandTextStation
  to?: LandTextStation
}>(), { from: 'entwurf', to: 'lgbl' })

/* Keyed by draft and pair: the Vorlage's frame reads the same request for
   its counts (`useLandVorlageOutcome`). */
const { data, status } = useFetch<LandLawDiffResponse>(
  () => `/api/laender/${props.land}/${props.number}/vergleich`,
  {
    query: { von: props.from, bis: props.to },
    key: () => landDiffKey(props.land, props.number, props.from, props.to),
    lazy: true,
    server: false,
    dedupe: 'defer',
  },
)

/* The Land's reasoning at each § of its Textgegenüberstellung, as the
   ministry's stands at each § of its own (`TextComparisonSection`) — the
   particular part of the Erläuterungen, one request shared with „Was das
   Land begründet" (`LandExplanationsSection`) by its key.

   Registered only by the instance that reads it, and the Begründungen below
   only by the step after the Begutachtung: a shared key keeps the options of
   whoever registers it first, and the Textgegenüberstellung's instance, first
   on the page, registered the Begründungen with `enabled: false` for every
   later one — the Vorlage's frame never got its count (23.10.2026). The
   condition is a prop's, fixed for an instance's life. */
const explanations: Ref<LandExplanationsResponse | null | undefined> = props.from === 'geltend'
  ? useFetch<LandExplanationsResponse>(
    () => `/api/laender/${props.land}/${props.number}/erlaeuterungen`,
    { key: () => landExplanationsKey(props.land, props.number), lazy: true, server: false, dedupe: 'defer' },
  ).data
  : shallowRef(null)
/* „Oö. Krankenanstaltengesetz 1997" and „Krankenanstaltengesetz 1997" name one law. */
const lawKey = (law: string | null) => (law ?? '').replace(/^(?:Oö\.|Salzburger|Wiener)\s+/, '').toLowerCase()
function reasonsFor(u: LawDiffUnit) {
  if (props.from !== 'geltend') return []
  const n = /^§(\S+)$/.exec(u.id)?.[1]
  if (!n) return []
  return (explanations.value?.particular ?? []).filter((e) => e.paras.includes(n) && (!e.law || !u.article || lawKey(e.law) === lawKey(u.article)))
}

/* The Land's reasoning, draft against Vorlage, at each change after the
   Begutachtung — the Ministerialentwurf's Begründungsvergleich, by the same
   rule: shown where it changed, or where the two group it differently
   (`LawDiffSection.reasoningOf`, §12.54). */
const vorlageStep = props.from === 'entwurf' && props.to === 'rv'
// Shared with the Vorlage's frame, which counts the same Begründungen.
const reasoning: Ref<LandReasoningResponse | null | undefined> = vorlageStep
  ? useFetch<LandReasoningResponse>(
    () => `/api/laender/${props.land}/${props.number}/begruendung`,
    { key: () => landReasoningKey(props.land, props.number), lazy: true, server: false, dedupe: 'defer' },
  ).data
  : shallowRef(null)
function reasoningOf(u: LawDiffUnit): ReasoningDiffEntry | null {
  if (!vorlageStep) return null
  const key = reasoning.value?.units?.[diffUnitKey(u)]
  const entry = key ? reasoning.value?.entries?.[key] : null
  return entry && (entry.changed || !entry.comparable) ? entry : null
}

/* The Bund's question for the same pair, word for word (`lawStationPairQuestion`). */
const AS_LAW_STATION: Record<Exclude<LandTextStation, 'geltend'>, LawStationId> = { entwurf: 'me', rv: 'rv', ausschuss: 'ausschuss', lgbl: 'bgbl' }
const LABEL: Record<LandTextStation, string> = { geltend: 'Geltende Fassung', entwurf: 'Entwurf', rv: 'Regierungsvorlage', ausschuss: 'Ausschussfassung', lgbl: 'Kundmachung' }
/* „im Entwurf" — where the earlier text has a law the later one does not. */
const IN_FROM: Record<LandTextStation, string> = { geltend: 'in der geltenden Fassung', entwurf: 'im Entwurf', rv: 'in der Regierungsvorlage', ausschuss: 'in der Ausschussfassung', lgbl: 'in der Kundmachung' }
/* A unit the later text numbers otherwise: „§ 13 → § 9", for every pair of
   texts this section compares (26.10.2026) — the federal Beilage's form
   (`TextComparisonSection`), which replaced „(in der geltenden Fassung § 13)". */
const movedFrom = (u: LawDiffUnit) => (u.fromId && u.fromId !== u.id ? displayId(u.fromId) : null)

/* Each comparison's anchor, which the bar and inbound links use. Two
   comparisons end at the Kundmachung on a Salzburg page — the Landtag's step
   and the whole way — and both were `textvergleich-lgbl` until 23.10.2026,
   so the bar's link could not tell them apart. The whole way keeps it. */
const ANCHOR: Record<string, string> = {
  'geltend>entwurf': 'gegenueberstellung',
  'entwurf>rv': 'textvergleich-rv',
  'rv>ausschuss': 'textvergleich-ausschuss',
  'rv>lgbl': 'textvergleich-landtag',
  'entwurf>lgbl': 'textvergleich-lgbl',
}
const anchor = ANCHOR[`${props.from}>${props.to}`] ?? `textvergleich-${props.from}-${props.to}`

/* The law in force against the draft is the Ministerialentwurf's
   „Was ändert der Entwurf?" — its heading and its anchor. */
const ofDraft = computed(() => props.from === 'geltend')
const heading = computed(() => (props.from === 'geltend' || props.to === 'geltend'
  ? 'Was ändert der Entwurf?'
  : lawStationPairQuestion(AS_LAW_STATION[props.from], AS_LAW_STATION[props.to])))
const FROM_LABEL = computed(() => LABEL[props.from])
const TO_LABEL = computed(() => LABEL[props.to])
const isNovelle = computed(() => isNovelleUnits(units.value))
const unitNoun = (n: number) => (isNovelle.value ? (n === 1 ? 'Änderungsanordnung' : 'Änderungsanordnungen') : (n === 1 ? 'Paragraph' : 'Paragraphen'))
const BADGE_LABEL = badgeLabels('entfallen')

function badgeOf(u: LawDiffUnit): DiffBadge {
  return u.editorial ? 'editorial' : u.change
}

const { query, hiddenKinds, folding, toggleGroup, groupOpen, showAll, limitFor } = useDiffFilters()

const units = computed(() => (data.value?.available ? data.value.units : []))
const haystacks = computed(() =>
  units.value.map((u) => [u.id, u.fromId, u.heading, u.article, u.fromText, u.toText].filter(Boolean).join('\n').toLowerCase()))
const searched = computed(() => {
  const q = query.value.trim().toLowerCase()
  return q ? units.value.filter((_, i) => haystacks.value[i]!.includes(q)) : units.value
})
const kindCounts = computed(() => {
  const counts: Record<DiffBadge, number> = { unchanged: 0, changed: 0, editorial: 0, inserted: 0, removed: 0 }
  for (const u of searched.value) counts[badgeOf(u)]++
  return counts
})
const visible = computed(() =>
  hiddenKinds.value.length ? searched.value.filter((u) => !hiddenKinds.value.includes(badgeOf(u))) : searched.value)

interface UnitView { unit: LawDiffUnit; label: string | null }
/* What a block carries, it carries computed (`LawDiffSection`, the same
   reason): the template asked for the Begründung up to five times a row, on
   every keystroke of the search. */
type Block =
  | ({ kind: 'unit'; from: LawDiffSegment[]; to: LawDiffSegment[]; split: boolean; reasoning: ReasoningDiffEntry | null; reasons: ReturnType<typeof reasonsFor> } & UnitView)
  | { kind: 'context'; units: UnitView[] }

const viewOf = (u: LawDiffUnit): UnitView => ({ unit: u, label: unitName(u, null, diffUnitKey(u)) ?? extraHeading(u) })

/**
 * The §§ the Textgegenüberstellung withheld, per group: counted in the
 * group's header („nicht gezeigt", the Bund's dashed pill) and named at the
 * top of its body. A § filed under no law joins the only group there is; a
 * § of another law stands in that law's group (`withheldGroups`). A search
 * hides them, as the Bund's: there is no text of theirs to find.
 */
const withheldByGroup = computed(() => {
  if (!data.value?.available || query.value.trim()) return new Map<string, LandLawDiffResponse['withheld']>()
  return withheldGroups(data.value.withheld, units.value.map((u) => u.article))
})

/* The title of a group of §§ the reader filed under no law of the package. */
const UNFILED = 'Ohne Zuordnung zu einem Gesetz'

/* Where nothing is shown: the same §§, by the law each is filed under. */
const unshownByLaw = computed(() => (data.value && !data.value.available ? withheldGroups(data.value.withheld ?? [], []) : new Map<string, LandLawDiffResponse['withheld']>()))

/* Instructions that reach §§ they do not name, by the group of their law (26.10.2026); hidden by a search, as the withheld §§. */
const reachesByGroup = computed(() => {
  if (!data.value || query.value.trim()) return new Map<string, Reach[]>()
  return reachesGroups(data.value.reaches ?? [], data.value.available ? units.value.map((u) => u.article) : [])
})
/* Every law the unshown list names, by §§ or by instruction. */
/* Laws the draft enacts anew, whose text the Land's document does not print (26.10.2026): a group each, named. */
const enactedLaws = computed(() => new Set(query.value.trim() ? [] : (data.value?.enacted ?? [])))
const unshownLaws = computed(() => [...new Set([...unshownByLaw.value.keys(), ...reachesByGroup.value.keys(), ...enactedLaws.value])])

/* Pages of the document the reader did not read: said above the list, as the Bund's annex says it. */
const droppedNote = computed(() => annexDroppedPagesNote(data.value?.droppedPages ?? 0))
/* The numbers §§ move to, per group (26.10.2026): a § struck or withheld
   under such a number is the one in force there, „§ 33 (alt)" — beside
   „§ 34 → § 33" it read as the same §. Not narrowed by a search. */
const movedToByGroup = computed(() => {
  const out = new Map<string, Set<string>>()
  const add = (key: string, entries: readonly { id: string; fromId?: string | null }[]) => {
    for (const id of moveTargets(entries)) out.set(key, (out.get(key) ?? new Set<string>()).add(id))
  }
  for (const u of units.value) add(u.article ?? '', [u])
  const withheld = data.value?.available ? withheldGroups(data.value.withheld, units.value.map((u) => u.article)) : unshownByLaw.value
  for (const [key, items] of withheld) add(key, items)
  return out
})
const inForceNumber = (u: LawDiffUnit) => u.change === 'removed' && (movedToByGroup.value.get(u.article ?? '')?.has(u.id) ?? false)

/* A renumbering the comparison could not pair old → new: there the list goes by number (26.10.2026). Only beside a list. */
const renumberNote = computed(() => renumberedNote(data.value?.renumbered ?? []))

/* One group per Gesetz of the package, folded; runs of unchanged
   instructions fold into one line — as on the Ministerialentwurf's page. */
const groups = computed(() => {
  const byArticle = new Map<string, { article: string; units: LawDiffUnit[]; counts: Record<DiffBadge, number> }>()
  const groupOf = (key: string) => {
    let g = byArticle.get(key)
    if (!g) {
      g = { article: key, units: [], counts: { unchanged: 0, changed: 0, editorial: 0, inserted: 0, removed: 0 } }
      byArticle.set(key, g)
    }
    return g
  }
  for (const u of visible.value) {
    const g = groupOf(u.article ?? '')
    g.units.push(u)
    g.counts[badgeOf(u)]++
  }
  for (const key of withheldByGroup.value.keys()) groupOf(key)
  for (const key of reachesByGroup.value.keys()) groupOf(key)
  for (const key of enactedLaws.value) groupOf(key)
  return [...byArticle.values()].map((g) => {
    const limit = limitFor(g.article)
    const blocks: Block[] = []
    let context: UnitView[] = []
    let shown = 0
    let hidden = 0
    const flush = () => {
      if (context.length) blocks.push({ kind: 'context', units: context })
      context = []
    }
    for (const u of g.units) {
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
        reasons: reasonsFor(u),
      })
      shown++
    }
    flush()
    // A group of §§ only withheld, under no law: the reader could not tell which law of the package they are (Kärnten, 25.10.2026).
    return { ...g, title: landLawGroupTitle(g.article) || (g.units.length ? '' : UNFILED), blocks, hidden, withheld: withheldByGroup.value.get(g.article) ?? [], reaches: reachesByGroup.value.get(g.article) ?? [] }
  })
})

const addedLaws = computed(() => new Set(data.value?.addedLaws ?? []))
const droppedLaws = computed(() => new Set(data.value?.droppedLaws ?? []))

/* Where a search found nothing — said in the box, as the Bund's (`NoMatches`). */
const hasUnits = computed(() => units.value.length > 0)
</script>

<template>
  <PageSubsection :id="anchor" :heading="heading">
    <ListSkeleton v-if="status === 'pending' || status === 'idle'" class="mt-3">
      {{ FROM_LABEL }} und {{ TO_LABEL }} werden verglichen …
    </ListSkeleton>
    <p v-else-if="status === 'error' || !data" class="text-sm text-ink-secondary">
      Der Vergleich ist gerade nicht verfügbar.
    </p>
    <template v-else-if="!data.available">
      <p class="text-sm text-ink-secondary">
        {{ data.unavailableReason }}
      </p>
      <!-- Read, and none of it shown: every § is named all the same, by law
           and with why (25.10.2026) — Kärnten 15193/2025 said „keine
           Paragraphen" and named none of the 21 its Novelle changes. -->
      <ComparisonCaveats v-if="droppedNote" :notes="[droppedNote]" class="mt-3" />
      <ListBox v-if="unshownLaws.length" class="mt-3">
        <DiffGroup
          v-for="law in unshownLaws"
          :key="law"
          :title="landLawGroupTitle(law) || UNFILED"
          :badges="[]"
          :withheld="unshownByLaw.get(law)?.length ?? 0"
          :open="groupOpen(law)"
          @toggle="toggleGroup(law)"
        >
          <LandWithheldNotes :items="unshownByLaw.get(law) ?? []" :reaches="reachesByGroup.get(law) ?? []" :enacted="enactedLaws.has(law)" :moved-to="movedToByGroup.get(law)" :document-url="data.fromDocument?.url ?? null" alone />
        </DiffGroup>
      </ListBox>
    </template>
    <template v-else>
      <!-- Two Begutachtungen, one law: said before the list, or the other
           draft's changes read as changes made to this one after its
           Begutachtung (2023-16039 and 2024-16064, LGBl. Nr. 95/2024). The
           one sentence that stays above, in the Bund's form for a warning
           that what follows may be misread. -->
      <ComparisonCaveats v-if="data.sharedWith.length || droppedNote || renumberNote" :notes="[droppedNote, renumberNote]" class="mb-4">
        <p v-if="data.sharedWith.length">
          Dieselbe Kundmachung setzt auch
          <template v-for="(other, i) in data.sharedWith" :key="other.path"><template v-if="i > 0">{{ i === data.sharedWith.length - 1 ? ' und ' : ', ' }}</template>den Entwurf
            <NuxtLink :to="other.path" class="link-inline">„{{ landShortTitle(other.title) ?? other.title }}“</NuxtLink><template v-if="other.deadline"> (Frist bis {{ formatDateDe(other.deadline) }})</template></template>
          um. Was hier als neu erscheint, kann aus {{ data.sharedWith.length > 1 ? 'jenen Entwürfen' : 'jenem Entwurf' }} stammen.
        </p>
      </ComparisonCaveats>
      <ListBox>
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
          v-for="g in groups"
          :key="g.article"
          :title="g.title"
          :badges="badgeCounts(g.counts, BADGE_LABEL)"
          :withheld="g.withheld.length"
          :open="groupOpen(g.article)"
          :more="g.hidden"
          @toggle="toggleGroup(g.article)"
          @more="showAll(g.article)"
        >
          <!-- What the Land's document shows and this list does not: a § is
               shown only where RIS confirms our reading of its text in force
               (`landTguService`), and only where the reader composed its new
               text. Named where the header counts it, each cause in its own
               words (`withheldNotes`), with the way to the document that does
               show it — so the §§ shown are not read as all the draft changes. -->
          <LandWithheldNotes :items="g.withheld" :reaches="g.reaches" :enacted="enactedLaws.has(g.article)" :moved-to="movedToByGroup.get(g.article)" :document-url="data.fromDocument?.url ?? null" />
          <p v-if="addedLaws.has(g.article)" class="border-b border-hairline px-4 py-2.5 text-sm text-ink-secondary">
            Dieses Gesetz kommt {{ IN_FROM[from] }} nicht vor; es ist auf dem Weg hinzugekommen.
          </p>
          <p v-else-if="droppedLaws.has(g.article)" class="border-b border-hairline px-4 py-2.5 text-sm text-ink-secondary">
            {{ FROM_LABEL === 'Entwurf' ? 'Der Entwurf' : `Die ${FROM_LABEL}` }} änderte dieses Gesetz; die {{ TO_LABEL }} ändert es nicht mehr.
          </p>
          <template v-for="b in g.blocks" :key="b.kind === 'unit' ? `u|${diffUnitKey(b.unit)}` : `c|${diffUnitKey(b.units[0]!.unit)}`">
            <details v-if="b.kind === 'context'" class="group border-b border-hairline last:border-b-0">
              <summary class="flex min-h-target cursor-pointer list-none items-center gap-2 px-4 py-2 text-xs text-ink-muted hover:bg-hover [&::-webkit-details-marker]:hidden">
                <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
                {{ b.units.length }} {{ unitNoun(b.units.length) }} unverändert
              </summary>
              <div class="space-y-3 px-4 pb-3 pl-10 text-sm leading-relaxed text-ink-secondary">
                <p v-for="u in b.units" :key="diffUnitKey(u.unit)" class="hyphens-auto">
                  <span class="font-medium text-ink"><template v-if="movedFrom(u.unit)">{{ movedFrom(u.unit) }}<span aria-hidden="true">&nbsp;→ </span><span class="sr-only"> wird zu </span></template>{{ displayId(u.unit.id) }}</span>
                  <!-- &nbsp;, not a space: Vue drops a whitespace-only first text node, and the heading stood glued to the number („§ 10Geschäftsordnung"). -->
                  <span v-if="u.label" class="font-medium text-ink">&nbsp;{{ u.label }}</span>
                  <span> — {{ u.unit.toText }}</span>
                </p>
              </div>
            </details>
            <div v-else class="border-b border-hairline px-4 py-3 last:border-b-0">
              <p class="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                <!-- A § the later text numbers otherwise says so where its number
                     stands, as the Bund's Beilage does: the arrow is for the eye,
                     a screen reader hears „wird zu". -->
                <span class="font-medium text-ink"><template v-if="movedFrom(b.unit)">{{ movedFrom(b.unit) }}<span aria-hidden="true">&nbsp;→ </span><span class="sr-only"> wird zu </span></template>{{ displayId(b.unit.id) }}<template v-if="inForceNumber(b.unit)">&nbsp;{{ IN_FORCE_MARK }}</template></span>
                <span v-if="b.label" class="min-w-0 text-ink-secondary">{{ b.label }}</span>
              </p>
              <!-- The Land's reasoning, where the question arises: under the
                   §'s own line, in ink, indented and without a gutter — the
                   ministry's disclosure on the Bund's page, same shape. -->
              <Disclosure v-if="b.reasons.length" size="xs" tone="ink" class="mb-2">
                <template #summary>Begründung des Landes</template>
                <div class="mt-1 pl-6">
                  <div v-for="(e, ei) in b.reasons" :key="ei" :class="ei > 0 ? 'mt-3' : ''">
                    <p class="text-xs text-ink-muted">{{ e.heading }}</p>
                    <p v-for="(t, ti) in e.text" :key="ti" class="mt-1 hyphens-auto text-sm leading-relaxed text-ink-secondary">{{ t }}</p>
                  </div>
                </div>
              </Disclosure>
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
                :from-label="FROM_LABEL"
                :to-label="TO_LABEL"
              >
                <!-- The Land's reasoning at this change, as the ministry's on
                     the Bund's page: closed, it answers a second question. -->
                <Disclosure v-if="b.reasoning" size="xs" tone="secondary" class="mt-2">
                  <template #summary>
                    <template v-if="!b.reasoning.comparable">Die Begründung des Landes zu dieser Änderung</template>
                    <template v-else>
                      Die Begründung des Landes zu diesem Paragraphen hat sich geändert
                      <span v-if="b.reasoning.editorial" :class="[PILL_CLASS, BADGE_CLASS.editorial]">{{ BADGE_LABEL.editorial }}</span>
                    </template>
                  </template>
                  <div v-if="!b.reasoning.comparable || !b.reasoning.segments" class="pb-2 pl-6">
                    <p class="mb-2 text-xs text-ink-muted">
                      {{ b.reasoning.comparable ? 'Für einen Wortvergleich ist die Passage zu lang — hier beide Fassungen im Ganzen.' : 'Entwurf und Regierungsvorlage fassen die Begründung zu dieser Änderung verschieden zusammen; verglichen wird sie deshalb nicht.' }}
                    </p>
                    <SideBySide :from-label="FROM_LABEL" :to-label="TO_LABEL">
                      <template v-if="b.reasoning.fromText" #from>
                        <p class="hyphens-auto text-ink">{{ b.reasoning.fromText }}</p>
                      </template>
                      <template #to>
                        <p class="hyphens-auto text-ink">{{ b.reasoning.toText }}</p>
                      </template>
                    </SideBySide>
                  </div>
                  <p v-else class="hyphens-auto pb-2 pl-6 text-sm leading-relaxed text-ink">
                    <DiffText :segments="b.reasoning.segments ?? []" />
                  </p>
                </Disclosure>
              </DiffBody>
            </div>
          </template>
        </DiffGroup>
        <NoMatches v-if="hasUnits" :found="visible.length > 0" />
      </ListBox>
      <!-- Whose texts and whose reading: the Land's and the Landtag's PDFs,
           RIS's Kundmachung, and the comparison ours — read from PDFs,
           which the Bund's drafts are not (§12.44). -->
      <SectionCredits :sources="[]" :marked="false" method="/so-funktionierts#laender">
        <span v-for="doc in [data.fromDocument, data.toDocument]" :key="doc?.label">
          <template v-if="doc">
            {{ doc.publisher }}: <ExternalLink v-if="doc.url" :href="doc.url" class="link-muted">{{ doc.label }}</ExternalLink><template v-else>{{ doc.label }}</template>
          </template>
        </span>
        <span>{{ ofDraft ? 'Lesart und Abgleich' : 'Vergleich' }}: Begutachtungs-Monitor</span>
      </SectionCredits>
    </template>
  </PageSubsection>
</template>
