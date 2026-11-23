<script setup lang="ts">
/**
 * „Was regelt der Entwurf?" — the text of a draft that creates a law
 * (23.11.2026), where an amending draft has „Was ändert der Entwurf?".
 *
 * A section of its own and not a state of `TextComparisonSection`: none of
 * the 53 such Ministerialentwürfe of GP XXVII–XXVIII has a readable annex, so
 * the comparison would ask for an annex and a Lesefassung that cannot exist
 * and print its „unavailable" sentence above the law. What the two share is
 * the law's rendering (`NewLawGroup`) and the placement of the Begründung.
 *
 * **Open, unlike a comparison's groups.** There a closed header is the survey
 * of many laws; here the law is the section's whole content (one law in 51
 * of 53 drafts). The cut after 30 units stays, with „Alle N anzeigen": it
 * touches six laws, and the search reaches what stands behind it.
 */
import type { EnactedLawsResponse, EnactedParagraph } from '#shared/types'
import { risSource } from '#shared/utils/provenance'
import { BADGE_ORDER, badgeLabels, type DiffBadge } from '~/utils/diffBadges'
import { placeAtParagraphs } from '~/utils/annexGroups'
import { enactedHaystack, everyLawEnd, newLawGapDe, newLawGroups, newLawKey } from '~/utils/newLawGroups'

const props = defineProps<{
  gp: string
  inr: number
}>()

const root = useTemplateRef<HTMLElement>('root')
const { data, status, execute } = useFetch<EnactedLawsResponse>(
  () => `/api/drafts/${props.gp}/${props.inr}/neue-gesetze`,
  { lazy: true, server: false, immediate: false },
)
useNearViewportSection(root, () => void execute(), () => status.value !== 'idle')

/* One request with the Begründung's own section (`useExplanations`). */
const { data: explanations } = useExplanations(() => ({ gp: props.gp, inr: props.inr }))

const { query, hiddenKinds, toggleGroup, groupOpen, showAll, limitFor } = useDiffFilters()

/* A law has no kinds of change, so the toolbar is the search alone. */
const NO_KINDS = Object.fromEntries(BADGE_ORDER.map((b) => [b, 0])) as Record<DiffBadge, number>
const LABELS = badgeLabels('entfällt')

watch(() => data.value?.laws, (laws) => {
  for (const l of laws ?? []) {
    if (!groupOpen(newLawKey(l.law))) toggleGroup(newLawKey(l.law))
  }
}, { immediate: true })

const laws = computed(() => data.value?.laws ?? [])
const rest = computed(() => placeAtParagraphs([], null, explanations.value?.paragraphs ?? []).ends.rest)
const haystacks = computed(() => {
  const out = new Map<EnactedParagraph, string>()
  for (const p of [...laws.value.flatMap((l) => l.paragraphs), ...(data.value?.otherArticles ?? [])]) out.set(p, enactedHaystack(p))
  return out
})
const needle = computed(() => query.value.trim().toLowerCase())
const groups = computed(() =>
  newLawGroups(everyLawEnd(rest.value, laws.value), laws.value, {
    query: needle.value,
    haystack: (p) => haystacks.value.get(p) ?? '',
    limitFor,
  }),
)
/* An Artikel without a § (the repeal in 139/ME XXVIII). */
const articles = computed(() =>
  (data.value?.otherArticles ?? []).filter((a) => !needle.value || (haystacks.value.get(a) ?? '').includes(needle.value)),
)
/* Passages on a part of the draft that is no law of the text: kept, under its name. */
const outside = computed(() => {
  if (needle.value) return []
  const shown = new Set(laws.value.map((l) => l.law))
  return rest.value.filter((r) => r.explanations.length > 0 && (r.law === null || !shown.has(r.law)))
})
const found = computed(() => groups.value.length > 0 || articles.value.length > 0)
const gap = computed(() => (data.value ? newLawGapDe(data.value) : null))
const SOURCES = [risSource('Gesetzestext des Entwurfs')]

const announcement = computed(() => {
  if (status.value === 'pending' || status.value === 'idle') return ''
  if (status.value === 'error' || !data.value) return 'Gerade nicht abrufbar: der Gesetzestext des Entwurfs.'
  return gap.value ?? 'Gesetzestext geladen.'
})
</script>

<template>
  <div ref="root">
    <p class="sr-only" role="status">{{ announcement }}</p>

    <ListSkeleton v-if="status === 'pending' || status === 'idle'">
      Der Gesetzestext wird geladen …
    </ListSkeleton>

    <GapNote v-else-if="status === 'error' || !data" kind="unavailable" text="der Gesetzestext des Entwurfs." class="text-sm text-ink-secondary" />

    <template v-else>
      <GapNote v-if="gap" :text="gap" class="text-sm text-ink-secondary" />

      <ListBox v-else>
        <template #header>
          <DiffToolbar
            v-model:query="query"
            v-model:hidden="hiddenKinds"
            :counts="NO_KINDS"
            :labels="LABELS"
            search-label="Im Gesetzestext suchen"
          />
        </template>
        <EnactedUnit v-for="a in articles" :key="a.id" :unit="a" />
        <NewLawGroup
          v-for="g in groups"
          :key="g.key"
          :law="g.law"
          :total="g.total"
          :schedules="g.schedules"
          :paragraphs="g.paragraphs"
          :end="g.end"
          :open="groupOpen(g.key)"
          :more="g.more"
          @toggle="toggleGroup(g.key)"
          @more="showAll(g.key)"
        />
        <section v-for="r in outside" :key="r.law ?? ''" class="border-b border-hairline px-4 py-3 last-of-type:border-b-0">
          <p class="text-sm font-semibold text-ink">{{ r.law || 'Gesetzestext' }}</p>
          <AnnexLawEnd :end="r" class="mt-1" />
        </section>
        <!-- RIS keeps a law's footnotes apart from its text; the mark stands at the §. -->
        <section v-if="!needle && data.footnotes.length" class="border-b border-hairline px-4 py-3 last:border-b-0">
          <p class="mb-1 text-sm font-medium text-ink">Fußnoten</p>
          <p v-for="f in data.footnotes" :key="f.nr" class="mt-1 hyphens-auto text-sm leading-relaxed text-ink"><sup>{{ f.nr }}</sup> {{ f.text }}</p>
        </section>
        <NoMatches :found="found" />
      </ListBox>

      <SectionCredits v-if="data.source" :sources="SOURCES" :marked="false">
        <ExternalLink :href="data.source.url" class="link-muted">{{ data.source.label }}</ExternalLink>
      </SectionCredits>
    </template>
  </div>
</template>
