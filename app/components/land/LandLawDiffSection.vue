<script setup lang="ts">
import type { LandCode, LandLawDiffResponse, LawDiffSegment, LawDiffUnit } from '#shared/types'
import { diffUnitKey } from '#shared/utils/diffKey'
import { countLabelDe } from '#shared/utils/format'
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
const props = defineProps<{
  land: LandCode
  number: string
}>()

const { data, status } = useFetch<LandLawDiffResponse>(
  () => `/api/laender/${props.land}/${props.number}/vergleich`,
  { lazy: true, server: false },
)

const heading = lawStationPairQuestion('me', 'bgbl')
const FROM_LABEL = 'Entwurf'
const TO_LABEL = 'Kundmachung'
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
  if (!changes && !s.editorial) return 'Die Kundmachung übernimmt den Entwurf Wort für Wort.'
  const parts = [
    changes ? `${countLabelDe(changes, 'Änderung', 'Änderungen')} nach der Begutachtung` : 'Keine inhaltliche Änderung nach der Begutachtung',
    s.editorial ? `${countLabelDe(s.editorial, 'redaktionelle', 'redaktionelle')} dazu` : null,
    `${countLabelDe(s.unchanged, 'Anordnung', 'Anordnungen')} unverändert übernommen`,
  ]
  return `${parts.filter(Boolean).join(', ')}.`
})
</script>

<template>
  <PageSubsection id="textvergleich" :heading="heading">
    <ListSkeleton v-if="status === 'pending' || status === 'idle'" class="mt-3">
      Entwurf und Kundmachung werden verglichen …
    </ListSkeleton>
    <p v-else-if="status === 'error' || !data" class="text-sm text-ink-secondary">
      Der Vergleich ist gerade nicht verfügbar.
    </p>
    <p v-else-if="!data.available" class="text-sm text-ink-secondary">
      {{ data.unavailableReason }}
    </p>
    <template v-else>
      <p v-if="summary" class="text-sm text-ink">{{ summary }}</p>
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
            Dieses Gesetz kommt im Entwurf nicht vor; der Landtag hat es dem Paket hinzugefügt.
          </p>
          <p v-else-if="droppedLaws.has(g.article)" class="border-b border-hairline px-4 py-2.5 text-sm text-ink-secondary">
            Der Entwurf änderte dieses Gesetz; die Kundmachung ändert es nicht mehr.
          </p>
          <template v-for="b in g.blocks" :key="b.kind === 'unit' ? `u|${diffUnitKey(b.unit)}` : `c|${diffUnitKey(b.units[0]!.unit)}`">
            <details v-if="b.kind === 'context'" class="group border-b border-hairline last:border-b-0">
              <summary class="flex min-h-target cursor-pointer list-none items-center gap-2 px-4 py-2 text-xs text-ink-muted hover:bg-hover [&::-webkit-details-marker]:hidden">
                <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
                {{ b.units.length }} {{ b.units.length === 1 ? 'Änderungsanordnung' : 'Änderungsanordnungen' }} unverändert
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
                  <span v-if="b.unit.fromId && b.unit.fromId !== b.unit.id" class="font-normal text-ink-muted">(im Entwurf {{ displayId(b.unit.fromId) }})</span>
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
      <!-- Whose text and whose reading: the Land's PDF, RIS's Kundmachung,
           and the comparison ours — read from a PDF, which the Bund's
           drafts are not (§12.44). -->
      <SectionCredits :sources="[]" :marked="false" method="/so-funktionierts#laender">
        <span>
          Entwurf: Land Oberösterreich, <ExternalLink v-if="data.draft" :href="data.draft.url" class="link-muted">{{ data.draft.label }}</ExternalLink>
        </span>
        <span>
          Kundmachung: RIS (CC BY 4.0), <ExternalLink v-if="data.kundmachung?.url" :href="data.kundmachung.url" class="link-muted">{{ data.kundmachung.label }}</ExternalLink><template v-else>{{ data.kundmachung?.label }}</template>
        </span>
        <span>Vergleich aus dem PDF des Entwurfs: Begutachtungs-Monitor</span>
      </SectionCredits>
    </template>
  </PageSubsection>
</template>
