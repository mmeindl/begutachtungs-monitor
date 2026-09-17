<script setup lang="ts">
import type { DraftStatus, RisConsultationKind, RisConsultationsResponse } from '#shared/types'

/**
 * Begutachtungen without a Gegenstand at Parliament — mostly
 * Verordnungsentwürfe (docs/architecture.md §12.16).
 *
 * A SEPARATE list, not a filter on /entwuerfe, and that is the design
 * decision rather than the cheap way out. Merging them would silently change
 * what "Alle Entwürfe", the GP totals and the Stellungnahmen sums count, and
 * every row here is missing the participation data those numbers are built
 * from. Two lists that each say what they contain beat one list whose
 * denominator nobody can name. Both link to each other, and the homepage
 * shows both, so nobody has to know the split exists to find a consultation.
 */
useSeoMeta({
  title: 'Weitere Entwürfe',
  description:
    'Begutachtungen ohne Gegenstand im Parlament – vor allem Verordnungsentwürfe der Ministerien, die nur im RIS veröffentlicht werden.',
})

const route = useRoute()
const router = useRouter()

const statusOptions: { value: DraftStatus; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'open', label: 'In Begutachtung' },
  { value: 'closed', label: 'Abgeschlossen' },
]

const artOptions: { value: '' | RisConsultationKind; label: string }[] = [
  { value: '', label: 'Alle Arten' },
  { value: 'verordnung', label: 'Verordnungsentwürfe' },
  { value: 'gesetz', label: 'Gesetzesentwürfe' },
  { value: 'unbestimmt', label: 'Ohne Typangabe' },
]

function parseStatus(v: unknown): DraftStatus {
  const s = firstQueryValue(v)
  return s === 'open' || s === 'closed' ? s : 'all'
}

function parseArt(v: unknown): '' | RisConsultationKind {
  const s = firstQueryValue(v)
  return s === 'verordnung' || s === 'gesetz' || s === 'unbestimmt' ? s : ''
}

const statusFilter = ref<DraftStatus>(parseStatus(route.query.status))
const art = ref<'' | RisConsultationKind>(parseArt(route.query.art))
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
  art: art.value || undefined,
  gp: gp.value || undefined,
  ministry: ministry.value || undefined,
  q: qDebounced.value || undefined,
}))

const { data, error, refresh, status } = await useFetch<RisConsultationsResponse>(
  '/api/weitere-entwuerfe',
  { query },
)

const selectedGp = computed({
  get: () => gp.value || data.value?.gp || '',
  set: (value: string) => {
    gp.value = value
  },
})

watch(query, (value) => {
  const urlQuery: Record<string, string> = {}
  if (value.status !== 'all') urlQuery.status = value.status
  if (value.art) urlQuery.art = value.art
  if (value.gp) urlQuery.gp = value.gp
  if (value.ministry) urlQuery.ministry = value.ministry
  if (value.q) urlQuery.q = value.q
  router.replace({ query: urlQuery })
})

const countLabel = computed(() =>
  countLabelDe(data.value?.total ?? 0, 'Entwurf', 'Entwürfe'),
)
</script>

<template>
  <div class="mx-auto w-full max-w-4xl">
    <header>
      <h1 class="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        Weitere Entwürfe
      </h1>
      <p class="mt-2 max-w-prose text-ink-secondary">
        Begutachtungen, zu denen das Parlament keinen Gegenstand führt – vor
        allem Verordnungsentwürfe. Die Ministerien veröffentlichen sie im
        Rechtsinformationssystem (RIS); eine Stellungnahme geht direkt an das
        Ressort, nicht über das Formular des Parlaments.
      </p>
    </header>

    <div v-if="status === 'pending' && !data" class="mt-10">
      <LoadingState label="Entwürfe werden geladen …" />
    </div>
    <div v-else-if="error" class="mt-10">
      <ErrorState @retry="refresh()" />
    </div>
    <template v-else-if="data">
      <!-- The denominator, stated rather than implied. This list is one half
           of the Begutachtungen of the period, and a reader who lands here
           from a search has no way to know that. -->
      <p class="mt-4 max-w-prose rounded-lg border border-hairline bg-surface p-4 text-sm text-ink-secondary">
        In dieser Gesetzgebungsperiode stehen
        <span class="font-semibold tabular-nums text-ink">{{ formatNumberDe(data.gpTotal) }}</span>
        solcher Entwürfe im RIS – dazu
        <NuxtLink
          to="/entwuerfe"
          class="font-medium text-accent-deep underline underline-offset-2 hover:no-underline"
        >{{ formatNumberDe(data.withGegenstand) }} Ministerialentwürfe</NuxtLink>
        mit einem Gegenstand im Parlament, zu denen es Stellungnahmen,
        Einbringer und den weiteren Weg bis zum Gesetz gibt.
        <template v-if="data.undecided > 0">
          <!-- Only rendered when it is not zero. A running count of a thing
               that never happens is noise; the day it happens it is the
               most important sentence on the page. -->
          Bei
          <span class="font-semibold tabular-nums text-ink">{{ data.undecided }}</span>
          Ministerialentwürfen konnte die Zuordnung zum RIS nicht eindeutig
          entschieden werden – so viele Zeilen kann diese Liste zu viel haben.
        </template>
      </p>

      <div class="mt-6 flex flex-wrap items-center gap-3">
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

        <div class="min-w-0">
          <label for="filter-art" class="sr-only">Art des Entwurfs</label>
          <TokenSelect id="filter-art" v-model="art">
            <option v-for="opt in artOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </TokenSelect>
        </div>

        <div class="min-w-0">
          <label for="filter-gp" class="sr-only">Gesetzgebungsperiode</label>
          <TokenSelect id="filter-gp" v-model="selectedGp">
            <option v-for="g in data.availableGps" :key="g" :value="g">
              GP {{ g }}
            </option>
          </TokenSelect>
        </div>

        <div class="min-w-0 max-w-64">
          <label for="filter-ministry" class="sr-only">Ressort</label>
          <TokenSelect id="filter-ministry" v-model="ministry">
            <option value="">Alle Ressorts</option>
            <option v-for="m in data.ministries" :key="m.code" :value="m.code">
              {{ m.name || m.code }}
            </option>
          </TokenSelect>
        </div>

        <UInput
          v-model="q"
          type="search"
          :placeholder="`In ${countLabelDe(data.total, 'Entwurf', 'Entwürfen')} suchen …`"
          aria-label="Suche"
          class="min-w-48 flex-1"
        />
      </div>

      <p class="mt-6 text-sm text-ink-muted" aria-live="polite">
        {{ countLabel }}
      </p>

      <h2 class="sr-only">Ergebnisse</h2>
      <!-- Two densities, CSS-switched (SSR-safe, no JS), as on /entwuerfe. -->
      <ul v-if="data.items.length" class="mt-3 space-y-3 md:hidden">
        <li v-for="c in data.items" :key="c.id">
          <RisConsultationCard :consultation="c" />
        </li>
      </ul>
      <div
        v-if="data.items.length"
        class="mt-3 hidden overflow-hidden rounded-xl border border-hairline bg-surface md:block"
      >
        <ul class="divide-y divide-hairline">
          <li v-for="c in data.items" :key="`row-${c.id}`">
            <RisConsultationRow :consultation="c" />
          </li>
        </ul>
      </div>
      <div v-if="!data.items.length" class="mt-3">
        <EmptyState
          title="Keine Entwürfe gefunden"
          description="Andere Filter oder einen anderen Suchbegriff versuchen."
        />
      </div>
    </template>
  </div>
</template>
