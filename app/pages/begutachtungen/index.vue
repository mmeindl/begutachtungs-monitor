<script setup lang="ts">
import type { ConsultationStatus, ConsultationsResponse } from '#shared/types'

useSeoMeta({
  title: 'Begutachtungen',
  description:
    'Alle Ministerialentwürfe in Begutachtung – filterbar nach Status, Gesetzgebungsperiode und Ressort.',
})

const route = useRoute()
const router = useRouter()

// Default first: the leftmost segment reads as "where am I" — it must be
// the state the page actually lands in.
const statusOptions: { value: ConsultationStatus; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'open', label: 'Offen' },
  { value: 'closed', label: 'Abgeschlossen' },
]

function parseStatus(v: unknown): ConsultationStatus {
  const s = firstQueryValue(v)
  return s === 'open' || s === 'closed' ? s : 'all'
}

// Filter state, initialized from the URL so links are shareable.
const statusFilter = ref<ConsultationStatus>(parseStatus(route.query.status))
const gp = ref(firstQueryValue(route.query.gp) ?? '')
const ministry = ref(firstQueryValue(route.query.ministry) ?? '')
const q = ref(firstQueryValue(route.query.q) ?? '')
const qDebounced = ref(q.value)

let qTimer: ReturnType<typeof setTimeout> | undefined
watch(q, (value) => {
  clearTimeout(qTimer)
  qTimer = setTimeout(() => {
    qDebounced.value = value.trim()
  }, 300)
})
onUnmounted(() => clearTimeout(qTimer))

const query = computed(() => ({
  status: statusFilter.value,
  gp: gp.value || undefined,
  ministry: ministry.value || undefined,
  q: qDebounced.value || undefined,
}))

const { data, error, refresh, status } = await useFetch<ConsultationsResponse>(
  '/api/consultations',
  { query },
)

// Without an explicit gp param the server picks the current GP; the select
// mirrors that default until the user chooses one.
const selectedGp = computed({
  get: () => gp.value || data.value?.gp || '',
  set: (value: string) => {
    gp.value = value
  },
})

// Keep the URL in sync with the filters (defaults stay out of the URL).
// Derived from the same `query` the fetch uses, so the two can't drift.
watch(query, (value) => {
  const urlQuery: Record<string, string> = {}
  if (value.status !== 'all') urlQuery.status = value.status
  if (value.gp) urlQuery.gp = value.gp
  if (value.ministry) urlQuery.ministry = value.ministry
  if (value.q) urlQuery.q = value.q
  router.replace({ query: urlQuery })
})

const countLabel = computed(() =>
  countLabelDe(data.value?.total ?? 0, 'Begutachtung', 'Begutachtungen'),
)

/* Native <select> instead of USelect: in the combination Vite 8 (rolldown) +
 * Nuxt UI 4.10, reka-ui's SelectItem arrives in the browser without a render
 * function and crashes the page's hydration. Native selects are robust and
 * accessible; USelect can return once the upstream problem is fixed. */
const selectClasses =
  'rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink'
</script>

<template>
  <div class="mx-auto w-full max-w-4xl">
    <header>
      <h1 class="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        Begutachtungen
      </h1>
      <p class="mt-2 text-ink-secondary">
        Ministerialentwürfe im Begutachtungsverfahren – laufend und abgeschlossen.
      </p>
    </header>

    <div v-if="status === 'pending' && !data" class="mt-10">
      <LoadingState label="Begutachtungen werden geladen …" />
    </div>
    <div v-else-if="error" class="mt-10">
      <ErrorState @retry="refresh()" />
    </div>
    <template v-else-if="data">
      <div class="mt-8 flex flex-wrap items-center gap-3">
        <UFieldGroup role="group" aria-label="Status" class="shrink-0">
          <UButton
            v-for="opt in statusOptions"
            :key="opt.value"
            :color="statusFilter === opt.value ? 'primary' : 'neutral'"
            :variant="statusFilter === opt.value ? 'subtle' : 'outline'"
            :aria-pressed="statusFilter === opt.value"
            @click="statusFilter = opt.value"
          >
            {{ opt.label }}
          </UButton>
        </UFieldGroup>

        <div>
          <label for="filter-gp" class="sr-only">Gesetzgebungsperiode</label>
          <select id="filter-gp" v-model="selectedGp" :class="selectClasses">
            <option v-for="g in data.availableGps" :key="g" :value="g">
              GP {{ g }}
            </option>
          </select>
        </div>

        <div>
          <label for="filter-ministry" class="sr-only">Ressort</label>
          <select
            id="filter-ministry"
            v-model="ministry"
            class="max-w-64"
            :class="selectClasses"
          >
            <option value="">Alle Ressorts</option>
            <option v-for="m in data.ministries" :key="m.code" :value="m.code">
              {{ m.name || m.code }}
            </option>
          </select>
        </div>

        <!-- The corpus size in the placeholder is the trust signal
             (kleineAnfragen pattern) — and it tracks the active filters,
             which is what q actually searches within. -->
        <UInput
          v-model="q"
          type="search"
          :placeholder="`In ${countLabelDe(data.total, 'Begutachtung', 'Begutachtungen')} suchen …`"
          aria-label="Suche"
          class="min-w-48 flex-1"
        />
      </div>

      <p class="mt-6 text-sm text-ink-muted" aria-live="polite">
        {{ countLabel }}
        <!-- Entity-scoped following: the ministry filter is the moment a
             reader decides "I watch this Ressort" — offer the feed there. -->
        <template v-if="ministry">
          ·
          <a
            :href="`/feed.xml?ressort=${ministry}`"
            class="tap-target rounded font-medium text-accent-deep underline underline-offset-2 hover:no-underline"
          >RSS-Feed für dieses Ressort</a>
        </template>
      </p>

      <h2 class="sr-only">Ergebnisse</h2>
      <!-- Two densities, CSS-switched (SSR-safe, no JS): generous cards on
           mobile, a dense divider-list on md+ where scanning 100+ items
           is the job. -->
      <ul v-if="data.items.length" class="mt-3 space-y-3 md:hidden">
        <li v-for="c in data.items" :key="`${c.gp}-${c.inr}`">
          <ConsultationCard :consultation="c" />
        </li>
      </ul>
      <div
        v-if="data.items.length"
        class="mt-3 hidden overflow-hidden rounded-xl border border-hairline bg-surface md:block"
      >
        <ul class="divide-y divide-hairline">
          <li v-for="c in data.items" :key="`row-${c.gp}-${c.inr}`">
            <ConsultationRow :consultation="c" />
          </li>
        </ul>
      </div>
      <div v-if="!data.items.length" class="mt-3">
        <EmptyState
          title="Keine Begutachtungen gefunden"
          description="Andere Filter oder einen anderen Suchbegriff versuchen."
        />
      </div>
    </template>
  </div>
</template>
