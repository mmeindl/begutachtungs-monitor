<script setup lang="ts">
import type {
  StatementMeta,
  StatementsResponse,
  StatementsSummary,
} from '#shared/types'

const props = defineProps<{
  gp: string
  inr: number
  summary: StatementsSummary
}>()

const PAGE_SIZE = 25

const expanded = ref(false)
const listId = useId()
const filter = ref<'all' | 'organisations'>('all')
const filterOptions = [
  { value: 'all', label: 'Alle' },
  { value: 'organisations', label: 'Nur Organisationen' },
] as const
const visibleCount = ref(PAGE_SIZE)

/* Lazy: nothing is requested until the user expands the list the first time
 * (immediate: false leaves status at 'idle' until execute()). */
const { data, status, execute } = useFetch<StatementsResponse>(
  () => `/api/consultations/${props.gp}/${props.inr}/statements`,
  { immediate: false },
)

async function toggleList() {
  expanded.value = !expanded.value
  if (expanded.value && status.value === 'idle') {
    await execute()
  }
}

const filtered = computed<StatementMeta[]>(() => {
  const items = data.value?.items ?? []
  return filter.value === 'organisations'
    ? items.filter((s) => s.submitterKind === 'organisation')
    : items
})

const visible = computed(() => filtered.value.slice(0, visibleCount.value))
const hasMore = computed(() => filtered.value.length > visibleCount.value)

watch(filter, () => {
  visibleCount.value = PAGE_SIZE
})

/* GDPR defense in depth: persons and non-public submissions always render a
 * fixed label — never a name — regardless of what the API delivered. */
function submitterLabel(s: StatementMeta): string {
  if (s.submitterKind === 'organisation') return s.submitterName ?? 'Organisation'
  if (s.submitterKind === 'nonpublic') return 'Nicht-öffentliche Stellungnahme'
  return 'Privatperson'
}

/* "Zustimmung" is the Parliament's own term (upstream field: approvals) —
 * the vocabulary must survive the click-through to parlament.gv.at. */
function endorsementLabel(n: number): string {
  return countLabelDe(n, 'Zustimmung', 'Zustimmungen')
}

const miniStats = computed(() => [
  { label: 'Gesamt', value: props.summary.total },
  { label: 'Organisationen', value: props.summary.organisations },
  { label: 'Privatpersonen', value: props.summary.privatePersons },
  { label: 'Nicht öffentlich', value: props.summary.nonPublic },
])

/* The expandable list earns its button only when it adds entries beyond the
 * always-visible top organisations — otherwise it merely repeats them. */
const listAddsMore = computed(
  () => props.summary.total > props.summary.topOrganisations.length,
)

/* "Top" is only honest when the list actually is a selection. */
const orgHeading = computed(() =>
  props.summary.organisations <= props.summary.topOrganisations.length
    ? 'Organisationen'
    : 'Organisationen mit den meisten Zustimmungen',
)

/* Submitter mix as one stacked bar — "707, davon 96 % Privatpersonen" in a
 * glance (org-mobilization vs. citizen-wave is a journalistic signature).
 * The <dl> above IS the legend with exact numbers, so the bar itself stays
 * aria-hidden decoration; segment order mirrors the <dl>. */
const mixSegments = computed(() => {
  const t = props.summary.total
  if (t <= 0) return []
  return [
    { key: 'orgs', count: props.summary.organisations, class: 'bg-accent' },
    { key: 'persons', count: props.summary.privatePersons, class: 'bg-accent-200' },
    /* baseline, not hairline: hairline on surface is ~1.2:1, invisible */
    { key: 'nonpublic', count: props.summary.nonPublic, class: 'bg-baseline' },
  ]
    .filter((s) => s.count > 0)
    .map((s) => ({ ...s, pct: (s.count / t) * 100 }))
})

const maxEndorsements = computed(() =>
  Math.max(0, ...props.summary.topOrganisations.map((o) => o.endorsements)),
)

/* CSS max() keeps every non-zero bar visible: 1 of 355 is 0.3 % — sub-pixel
 * without the 3px floor, and the spread IS the story (355 vs 1). */
function endorsementBarWidth(endorsements: number): string {
  if (endorsements <= 0 || maxEndorsements.value <= 0) return '0'
  return `max(${(endorsements / maxEndorsements.value) * 100}%, 3px)`
}
</script>

<template>
  <div>
    <!-- Mini stats -->
    <dl class="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div v-for="stat in miniStats" :key="stat.label">
        <dt class="text-sm text-ink-secondary">{{ stat.label }}</dt>
        <!-- Number scale: tiles 3xl–4xl (StatTile), inline stats 2xl —
             nothing in between. -->
        <dd class="mt-0.5 font-heading text-2xl font-semibold text-ink">
          {{ formatNumberDe(stat.value) }}
        </dd>
      </div>
    </dl>

    <!-- Mix bar (decorative; the <dl> above is the legend) -->
    <div
      v-if="mixSegments.length"
      class="mt-3 flex h-2 w-full overflow-hidden rounded-[2px] border border-hairline"
      aria-hidden="true"
    >
      <div
        v-for="seg in mixSegments"
        :key="seg.key"
        :class="seg.class"
        :style="{ width: `${seg.pct}%` }"
      />
    </div>

    <!-- Visible text, not a tooltip: the two terms the panel can't do
         without, explained once (AAA: no hover-only information). -->
    <p class="mt-3 text-sm text-ink-secondary">
      Zustimmungen: Personen, die sich einer veröffentlichten Stellungnahme
      auf parlament.gv.at angeschlossen haben. Nicht öffentlich:
      Stellungnahmen, die auf Wunsch der Einbringer:innen nicht
      veröffentlicht wurden.
    </p>

    <!-- Top organisations -->
    <section v-if="summary.topOrganisations.length" class="mt-6">
      <h3 class="text-sm font-medium text-ink">{{ orgHeading }}</h3>
      <ul class="mt-1 divide-y divide-hairline">
        <li v-for="org in summary.topOrganisations" :key="org.parliamentUrl" class="py-2.5">
          <div class="flex items-baseline justify-between gap-4">
            <ExternalLink
              :href="org.parliamentUrl"
              :aria-label="`Stellungnahme von ${org.name} auf parlament.gv.at öffnen`"
              class="tap-target min-w-0 text-sm font-medium text-accent-deep hover:underline"
            >
              <span class="truncate">{{ org.name }}</span>
            </ExternalLink>
            <!-- Same guard as the lazy list below: a column of
                 "0 Zustimmungen" is pure noise on small consultations. -->
            <span
              v-if="org.endorsements > 0"
              class="shrink-0 text-sm tabular-nums text-ink-secondary"
            >
              {{ endorsementLabel(org.endorsements) }}
            </span>
          </div>
          <!-- Decorative scale (VolumeBar pattern: value in text, bar
               aria-hidden): the spread is the story — one Betriebsrat can
               out-mobilize the other hundred statements combined. -->
          <div
            v-if="maxEndorsements > 0"
            class="mt-1.5 h-1.5 w-full rounded-r-[2px] bg-accent-wash"
            aria-hidden="true"
          >
            <div
              class="h-1.5 rounded-r-[2px] bg-accent"
              :style="{ width: endorsementBarWidth(org.endorsements) }"
            />
          </div>
        </li>
      </ul>
    </section>

    <!-- Full list (lazy) -->
    <div v-if="listAddsMore" class="mt-6">
      <UButton
        color="neutral"
        variant="outline"
        :aria-expanded="expanded"
        :aria-controls="listId"
        @click="toggleList"
      >
        {{ expanded ? 'Alle Stellungnahmen ausblenden' : 'Alle Stellungnahmen anzeigen' }}
      </UButton>
    </div>

    <div v-if="expanded" :id="listId" class="mt-4">
      <LoadingState
        v-if="status === 'pending'"
        label="Stellungnahmen werden geladen …"
      />
      <ErrorState
        v-else-if="status === 'error'"
        title="Stellungnahmen konnten nicht geladen werden"
        @retry="execute()"
      />
      <template v-else-if="data">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <UFieldGroup role="group" aria-label="Stellungnahmen filtern">
            <UButton
              v-for="opt in filterOptions"
              :key="opt.value"
              :color="filter === opt.value ? 'primary' : 'neutral'"
              :variant="filter === opt.value ? 'subtle' : 'outline'"
              :aria-pressed="filter === opt.value"
              @click="filter = opt.value"
            >
              {{ opt.label }}
            </UButton>
          </UFieldGroup>
          <p class="text-sm text-ink-muted">
            <span class="tabular-nums">{{ formatNumberDe(visible.length) }}</span>
            von
            <span class="tabular-nums">{{ formatNumberDe(filtered.length) }}</span>
            angezeigt
          </p>
        </div>

        <EmptyState
          v-if="filtered.length === 0"
          title="Keine Stellungnahmen"
          description="Für diese Auswahl liegen keine Stellungnahmen vor."
          class="mt-4"
        />
        <ul v-else class="mt-2 divide-y divide-hairline">
          <li
            v-for="item in visible"
            :key="item.parliamentUrl"
            class="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3"
          >
            <span class="text-sm tabular-nums text-ink-muted">
              {{ formatDateDe(item.date) }}
            </span>
            <span class="min-w-0 text-sm font-medium text-ink">
              {{ submitterLabel(item) }}
            </span>
            <span
              v-if="item.endorsements > 0"
              class="text-sm text-ink-secondary"
            >
              {{ endorsementLabel(item.endorsements) }}
            </span>
            <ExternalLink
              :href="item.parliamentUrl"
              :aria-label="`Stellungnahme ${item.citation} auf parlament.gv.at öffnen`"
              class="tap-target ml-auto shrink-0 text-sm text-accent-deep hover:underline"
            >
              Auf parlament.gv.at
            </ExternalLink>
          </li>
        </ul>

        <div v-if="hasMore" class="mt-4 text-center">
          <UButton color="neutral" variant="outline" @click="visibleCount += PAGE_SIZE">
            Mehr laden
          </UButton>
        </div>
      </template>
    </div>
  </div>
</template>
