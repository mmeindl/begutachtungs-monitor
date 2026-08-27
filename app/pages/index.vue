<script setup lang="ts">
import type { DashboardPayload } from '#shared/types'

const pageDescription =
  'Laufende Begutachtungen österreichischer Gesetzesentwürfe: Fristen und Stellungnahmen – und danach: Regierungsvorlage, Bundesgesetzblatt oder bisher nichts.'

useSeoMeta({
  title: 'Aktuell',
  description: pageDescription,
  // Homepage shares (the demo case) get the product name, not "Aktuell".
  ogTitle: 'Begutachtungs-Monitor',
  ogDescription: pageDescription,
})

const { data, error, refresh, status } = await useFetch<DashboardPayload>('/api/dashboard')

const topMax = computed(() => data.value?.topByStatements[0]?.statementCount ?? 0)

// lastSync arrives ISO-normalized from the server (or null → line is omitted).
const lastSyncLabel = computed(() =>
  data.value?.lastSync ? formatDateTimeDe(data.value.lastSync) : null,
)
</script>

<template>
  <div class="mx-auto w-full max-w-5xl">
    <header class="max-w-2xl">
      <h1 class="text-2xl font-semibold text-ink sm:text-3xl">
        Was passiert in der Begutachtung – und was wird daraus?
      </h1>
      <p class="mt-3 text-ink-secondary">
        Alle laufenden Begutachtungen österreichischer Gesetzesentwürfe:
        Fristen und Stellungnahmen auf einen Blick. Und für jeden Entwurf
        danach: Regierungsvorlage, Bundesgesetzblatt – oder bisher nichts.
      </p>
    </header>

    <div v-if="status === 'pending' && !data" class="mt-10">
      <LoadingState label="Daten werden geladen …" />
    </div>
    <div v-else-if="error" class="mt-10">
      <ErrorState @retry="refresh()" />
    </div>
    <template v-else-if="data">
      <div class="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Offene Begutachtungen" :value="data.stats.openCount" />
        <StatTile
          :label="`Enden in den nächsten ${DEADLINE_SERIOUS_DAYS} Tagen`"
          :value="data.stats.closingWithin7Days"
        />
        <StatTile
          label="Stellungnahmen in der GP"
          :value="data.stats.statementsTotalGp"
          :hint="`Gesetzgebungsperiode ${data.gp}`"
        />
        <StatTile
          label="Begutachtungen in der GP"
          :value="data.stats.consultationsTotalGp"
        />
      </div>

      <section class="mt-12" aria-labelledby="open-heading">
        <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h2 id="open-heading" class="text-lg font-semibold text-ink">
            Läuft gerade
          </h2>
          <NuxtLink
            to="/begutachtungen"
            class="inline-flex min-h-11 items-center rounded text-sm font-medium text-accent-deep hover:underline"
          >
            Alle Begutachtungen →
          </NuxtLink>
        </div>
        <ul v-if="data.open.length" class="mt-4 space-y-3">
          <li v-for="c in data.open" :key="`${c.gp}-${c.inr}`">
            <ConsultationCard :consultation="c" />
          </li>
        </ul>
        <div v-else class="mt-4">
          <EmptyState
            title="Derzeit keine offenen Begutachtungen"
            description="Neue Ministerialentwürfe erscheinen hier, sobald sie zur Begutachtung aufliegen."
          />
        </div>
      </section>

      <section
        v-if="data.topByStatements.length"
        class="mt-12"
        aria-labelledby="top-heading"
      >
        <h2 id="top-heading" class="text-lg font-semibold text-ink">
          Die meisten Stellungnahmen
        </h2>
        <div class="mt-4 space-y-3">
          <VolumeBar
            v-for="c in data.topByStatements"
            :key="`${c.gp}-${c.inr}`"
            :label="c.title"
            :value="c.statementCount"
            :max="topMax"
            :href="`/begutachtungen/${c.gp}/${c.inr}`"
          />
        </div>
      </section>

      <p v-if="lastSyncLabel" class="mt-12 text-xs text-ink-muted">
        Datenstand: {{ lastSyncLabel }}
      </p>
    </template>
  </div>
</template>
