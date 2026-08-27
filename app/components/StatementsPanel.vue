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

function endorsementLabel(n: number): string {
  return countLabelDe(n, 'Unterstützung', 'Unterstützungen')
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
</script>

<template>
  <div>
    <!-- Mini stats -->
    <dl class="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div v-for="stat in miniStats" :key="stat.label">
        <dt class="text-sm text-ink-secondary">{{ stat.label }}</dt>
        <dd class="mt-0.5 text-xl font-semibold text-ink">
          {{ formatNumberDe(stat.value) }}
        </dd>
      </div>
    </dl>

    <!-- Top organisations -->
    <section v-if="summary.topOrganisations.length" class="mt-6">
      <h3 class="text-sm font-medium text-ink">Top-Organisationen</h3>
      <ul class="mt-1 divide-y divide-hairline">
        <li
          v-for="org in summary.topOrganisations"
          :key="org.parliamentUrl"
          class="flex items-baseline justify-between gap-4 py-2.5"
        >
          <ExternalLink
            :href="org.parliamentUrl"
            :aria-label="`Stellungnahme von ${org.name} auf parlament.gv.at öffnen`"
            class="tap-target min-w-0 text-sm font-medium text-accent-deep hover:underline"
          >
            <span class="truncate">{{ org.name }}</span>
          </ExternalLink>
          <span class="shrink-0 text-sm tabular-nums text-ink-secondary">
            {{ endorsementLabel(org.endorsements) }}
          </span>
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
