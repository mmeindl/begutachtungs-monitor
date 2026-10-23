<script setup lang="ts">
import type { LandCode, LandLawDiffResponse, LandTextStation, LawDiffSegment, LawDiffUnit, LawStationId } from '#shared/types'
import { isNovelleUnits } from '#shared/utils/changeShare'
import { diffUnitKey } from '#shared/utils/diffKey'
import { countLabelDe, formatDateDe } from '#shared/utils/format'
import { landShortTitle } from '#shared/utils/laender'
import { lawStationPairQuestion } from '#shared/utils/lawStations'
import { displayId, extraHeading, unitName } from '#shared/utils/unitName'
import { type DiffBadge, badgeCounts, badgeLabels } from '~/utils/diffBadges'
import { readsSideBySide, splitSegments } from '~/utils/diffSides'
import ListBox from '~/components/ui/ListBox.vue'

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
 */
const props = withDefaults(defineProps<{
  land: LandCode
  number: string
  /** The two texts; the draft against the Kundmachung unless said. */
  from?: LandTextStation
  to?: LandTextStation
}>(), { from: 'entwurf', to: 'lgbl' })

const { data, status } = useFetch<LandLawDiffResponse>(
  () => `/api/laender/${props.land}/${props.number}/vergleich`,
  { query: { von: props.from, bis: props.to }, lazy: true, server: false },
)

/* The Bund's question for the same pair, word for word (`lawStationPairQuestion`). */
const AS_LAW_STATION: Record<Exclude<LandTextStation, 'geltend'>, LawStationId> = { entwurf: 'me', rv: 'rv', ausschuss: 'ausschuss', lgbl: 'bgbl' }
const LABEL: Record<LandTextStation, string> = { geltend: 'Geltende Fassung', entwurf: 'Entwurf', rv: 'Regierungsvorlage', ausschuss: 'Ausschussfassung', lgbl: 'Kundmachung' }
/* „(im Entwurf Z 6)" — where the earlier text numbered the unit otherwise. */
const IN_FROM: Record<LandTextStation, string> = { geltend: 'in der geltenden Fassung', entwurf: 'im Entwurf', rv: 'in der Regierungsvorlage', ausschuss: 'in der Ausschussfassung', lgbl: 'in der Kundmachung' }
/* When the changes happened, temporal and never causal (framing rule). */
const WHEN: Record<string, string> = { 'entwurf>rv': 'nach der Begutachtung', 'rv>ausschuss': 'im Ausschuss', 'rv>lgbl': 'im Landtag', 'entwurf>lgbl': 'bis zur Kundmachung' }

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
type Block =
  | ({ kind: 'unit'; from: LawDiffSegment[]; to: LawDiffSegment[]; split: boolean } & UnitView)
  | { kind: 'context'; units: UnitView[] }

const viewOf = (u: LawDiffUnit): UnitView => ({ unit: u, label: unitName(u, null, diffUnitKey(u)) ?? extraHeading(u) })

/* One group per Gesetz of the package, folded; runs of unchanged
   instructions fold into one line — as on the Ministerialentwurf's page. */
const groups = computed(() => {
  const byArticle = new Map<string, { article: string; units: LawDiffUnit[]; counts: Record<DiffBadge, number> }>()
  for (const u of visible.value) {
    const key = u.article ?? ''
    let g = byArticle.get(key)
    if (!g) {
      g = { article: key, units: [], counts: { unchanged: 0, changed: 0, editorial: 0, inserted: 0, removed: 0 } }
      byArticle.set(key, g)
    }
    g.units.push(u)
    g.counts[badgeOf(u)]++
  }
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
      blocks.push({ kind: 'unit', ...viewOf(u), ...splitSegments(u.segments, u.fromText, u.toText), split: readsSideBySide(u.segments) })
      shown++
    }
    flush()
    return { ...g, blocks, hidden }
  })
})

const addedLaws = computed(() => new Set(data.value?.addedLaws ?? []))
const droppedLaws = computed(() => new Set(data.value?.droppedLaws ?? []))

/* What the comparison found, in one sentence above the box: the changes, and
   what stayed — the wins and the rest, both ways (framing rule). */
const summary = computed(() => {
  const s = data.value?.stats
  if (!s) return null
  // Counted as the pills count: an editorial change is not a change of
  // substance, and the two numbers must add up to what the box shows.
  const changes = s.changed - s.editorial + s.inserted + s.removed
  if (ofDraft.value) {
    const what = [
      // „ändert 1 Paragraphen", „ändert 12 Paragraphen": the accusative is one word for both.
      s.changed - s.editorial ? `ändert ${countLabelDe(s.changed - s.editorial, 'Paragraphen', 'Paragraphen')}` : null,
      s.inserted ? `fügt ${countLabelDe(s.inserted, 'neuen', 'neue')} ein` : null,
      s.removed ? `lässt ${s.removed} entfallen` : null,
    ].filter(Boolean)
    const editorial = s.editorial ? ` ${countLabelDe(s.editorial, 'Änderung ist', 'Änderungen sind')} redaktionell.` : ''
    return what.length ? `Der Entwurf ${what.join(', ').replace(/, ([^,]*)$/, ' und $1')}.${editorial}` : `Der Entwurf ändert keinen Paragraphen inhaltlich.${editorial}`
  }
  const when = WHEN[`${props.from}>${props.to}`] ?? ''
  if (!changes && !s.editorial) return `Die ${TO_LABEL.value} übernimmt ${props.from === 'entwurf' ? 'den Entwurf' : `die ${FROM_LABEL.value}`} Wort für Wort.`
  const parts = [
    changes ? `${countLabelDe(changes, 'Änderung', 'Änderungen')} ${when}` : `Keine inhaltliche Änderung ${when}`,
    s.editorial ? `${countLabelDe(s.editorial, 'redaktionelle', 'redaktionelle')} dazu` : null,
    `${s.unchanged} ${unitNoun(s.unchanged)} unverändert übernommen`,
  ]
  return `${parts.filter(Boolean).join(', ')}.`
})
</script>

<template>
  <PageSubsection :id="ofDraft ? 'gegenueberstellung' : `textvergleich-${to}`" :heading="heading">
    <ListSkeleton v-if="status === 'pending' || status === 'idle'" class="mt-3">
      {{ FROM_LABEL }} und {{ TO_LABEL }} werden verglichen …
    </ListSkeleton>
    <p v-else-if="status === 'error' || !data" class="text-sm text-ink-secondary">
      Der Vergleich ist gerade nicht verfügbar.
    </p>
    <p v-else-if="!data.available" class="text-sm text-ink-secondary">
      {{ data.unavailableReason }}
    </p>
    <template v-else>
      <!-- Two Begutachtungen, one law: said before the numbers, or the
           other draft's changes read as changes made to this one after its
           Begutachtung (2023-16039 and 2024-16064, LGBl. Nr. 95/2024). -->
      <p v-if="data.sharedWith.length" class="mb-3 text-sm text-ink">
        Dieselbe Kundmachung setzt auch
        <template v-for="(other, i) in data.sharedWith" :key="other.path"><template v-if="i > 0">{{ i === data.sharedWith.length - 1 ? ' und ' : ', ' }}</template>den Entwurf
          <NuxtLink :to="other.path" class="link-inline">„{{ landShortTitle(other.title) ?? other.title }}“</NuxtLink><template v-if="other.deadline"> (Frist bis {{ formatDateDe(other.deadline) }})</template></template>
        um. Was hier als neu erscheint, kann aus {{ data.sharedWith.length > 1 ? 'jenen Entwürfen' : 'jenem Entwurf' }} stammen.
      </p>
      <p v-if="summary" class="text-sm text-ink">{{ summary }}</p>
      <!-- What the Land's document shows and this list does not, counted:
           a § is shown only where RIS confirms our reading of its text in
           force (`landTguService`). -->
      <p v-if="data.withheld" class="mt-1 text-sm text-ink-secondary">
        {{ countLabelDe(data.withheld, 'weiterer Paragraph', 'weitere Paragraphen') }} der Textgegenüberstellung {{ data.withheld === 1 ? 'steht' : 'stehen' }} hier nicht: {{ data.withheld === 1 ? 'seinen' : 'ihren' }} geltenden Text fand der Monitor im RIS nicht wortgleich. Die Textgegenüberstellung selbst steht unter den Dokumenten.
      </p>
      <ListBox class="mt-4">
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
          :title="g.article"
          :badges="badgeCounts(g.counts, BADGE_LABEL)"
          :open="groupOpen(g.article)"
          :more="g.hidden"
          @toggle="toggleGroup(g.article)"
          @more="showAll(g.article)"
        >
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
                  <span class="font-medium text-ink">{{ displayId(u.unit.id) }}</span>
                  <span v-if="u.label" class="font-medium text-ink"> {{ u.label }}</span>
                  <span> — {{ u.unit.toText }}</span>
                </p>
              </div>
            </details>
            <div v-else class="border-b border-hairline px-4 py-3 last:border-b-0">
              <p class="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                <span class="font-medium text-ink">
                  {{ displayId(b.unit.id) }}
                  <span v-if="b.unit.fromId && b.unit.fromId !== b.unit.id" class="font-normal text-ink-muted">({{ IN_FROM[from] }} {{ displayId(b.unit.fromId) }})</span>
                </span>
                <span v-if="b.label" class="min-w-0 text-ink-secondary">{{ b.label }}</span>
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
                :from-label="FROM_LABEL"
                :to-label="TO_LABEL"
              />
            </div>
          </template>
        </DiffGroup>
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
