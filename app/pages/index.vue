<script setup lang="ts">
import type { DashboardOutcomes, DashboardPayload } from '#shared/types'

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

const { webcalUrl, googleCalUrl } = useFeedUrls()

// Deferred + client-only: resolving the outcome pool can hit ~24 cold
// upstream fetches — that must never block the dashboard's first paint.
const { data: outcomes, status: outcomesStatus } = useFetch<DashboardOutcomes>(
  '/api/dashboard/outcomes',
  { server: false, lazy: true },
)

const topMax = computed(() => data.value?.topByStatements[0]?.statementCount ?? 0)

// A concrete date means something to non-insiders; a roman numeral does
// not. The date alone is the load-bearing part — "Gesetzgebungsperiode"
// wording stays out of the hint (tile 4 already scopes the row, and the
// term is explained on /so-funktionierts). gp is server-derived and rolls
// over — map known GPs, fall back to the numeral.
const GP_START: Record<string, string> = { XXVIII: 'seit Okt. 2024' }
const gpHint = computed(() => {
  const gp = data.value?.gp
  if (!gp) return undefined
  return GP_START[gp] ?? `Gesetzgebungsperiode ${gp}`
})

// lastSync arrives ISO-normalized from the server (or null → line is omitted).
const lastSyncLabel = computed(() =>
  data.value?.lastSync ? formatDateTimeDe(data.value.lastSync) : null,
)
</script>

<template>
  <div class="mx-auto w-full max-w-5xl">
    <header class="max-w-2xl">
      <h1 class="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
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
      <!-- Tile row as a narrative: open → urgent → participation → outcomes. -->
      <div class="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile
          label="Offene Begutachtungen"
          :value="data.stats.openCount"
          to="/begutachtungen?status=open"
        />
        <StatTile
          :label="`Enden in den nächsten ${DEADLINE_SERIOUS_DAYS} Tagen`"
          :value="data.stats.closingWithin7Days"
        />
        <StatTile
          label="Stellungnahmen"
          :value="data.stats.statementsTotalGp"
          :hint="gpHint"
        />
        <StatTile
          label="Abgeschlossen in dieser Periode"
          :value="data.stats.consultationsTotalGp - data.stats.openCount"
          hint="Was wurde daraus? ↓"
          to="#outcomes-heading"
        />
      </div>

      <!-- The account-free alert tier at the moment of need — right where
           "Enden in den nächsten 7 Tagen" was just read. Footer keeps the
           full version with the manual URL. -->
      <p class="mt-4 text-sm text-ink-secondary">
        <UIcon
          name="i-lucide-calendar-plus"
          class="me-1 inline-block size-4 align-text-bottom"
          aria-hidden="true"
        />
        Keine Frist verpassen:
        <a
          :href="webcalUrl"
          class="tap-target rounded font-medium text-accent-deep underline underline-offset-2 hover:no-underline"
        >Fristen-Kalender abonnieren</a>
        (Apple/Outlook) ·
        <ExternalLink
          :href="googleCalUrl"
          class="tap-target rounded font-medium text-accent-deep underline underline-offset-2 hover:no-underline"
        >Google Kalender</ExternalLink>
        ·
        <a
          href="/feed.xml"
          class="tap-target rounded font-medium text-accent-deep underline underline-offset-2 hover:no-underline"
        >RSS</a>
        – ohne Konto, ohne Tracking.
      </p>

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
          <!-- The no-open moment is exactly the moment to subscribe. -->
          <EmptyState
            title="Derzeit keine offenen Begutachtungen"
            description="Neue Ministerialentwürfe erscheinen hier, sobald sie zur Begutachtung aufliegen."
          >
            <p class="text-sm text-ink-secondary">
              <a
                :href="webcalUrl"
                class="tap-target rounded font-medium text-accent-deep underline underline-offset-2 hover:no-underline"
              >Fristen-Kalender abonnieren</a>
              – die nächste Begutachtung landet automatisch im Kalender.
            </p>
          </EmptyState>
        </div>
      </section>

      <!-- The accountability layer on the front door: mechanism 1 (shelving
           visible) and mechanism 3 (wins equally visible) in one section. -->
      <section class="mt-12 scroll-mt-6" aria-labelledby="outcomes-heading">
        <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h2 id="outcomes-heading" class="text-lg font-semibold text-ink">
            Zuletzt abgeschlossen – was wurde daraus?
          </h2>
          <NuxtLink
            to="/begutachtungen?status=closed"
            class="inline-flex min-h-11 items-center rounded text-sm font-medium text-accent-deep hover:underline"
          >
            Alle abgeschlossenen →
          </NuxtLink>
        </div>
        <!-- The latency context belongs BEFORE the chips, not after them:
             it frames "bisher keine Regierungsvorlage" as "noch nicht"
             while the reader scans — a guard below the list fires too late. -->
        <p class="mt-1 max-w-prose text-sm text-ink-secondary">
          Zuletzt beendete Begutachtungen und ihr weiterer Weg – in beide
          Richtungen. Zwischen Begutachtungsende und Regierungsvorlage liegen
          häufig mehrere Monate – „bisher keine Regierungsvorlage“ heißt oft
          nur: noch nicht.
        </p>
        <div class="mt-4">
          <LoadingState
            v-if="outcomesStatus === 'pending' || outcomesStatus === 'idle'"
            label="Verläufe werden geladen …"
          />
          <template v-else-if="outcomes?.recent.length">
            <!-- Same card as "Läuft gerade" — only the aside differs
                 (outcome chip instead of deadline block). -->
            <ul class="space-y-3">
              <li v-for="o in outcomes.recent" :key="`${o.gp}-${o.inr}`">
                <ConsultationCard :consultation="o">
                  <template #aside><OutcomeChip :outcome="o" /></template>
                </ConsultationCard>
              </li>
            </ul>
            <template v-if="outcomes.lastEnacted">
              <h3 class="mt-4 text-sm font-medium text-ink">
                {{
                  outcomes.lastEnacted.bgblNumber
                    ? 'Zuletzt kundgemacht'
                    : 'Zuletzt mit Regierungsvorlage'
                }}
              </h3>
              <div class="mt-2">
                <ConsultationCard :consultation="outcomes.lastEnacted">
                  <template #aside>
                    <OutcomeChip :outcome="outcomes.lastEnacted" />
                  </template>
                </ConsultationCard>
              </div>
            </template>
          </template>
          <p v-else class="text-sm text-ink-muted">
            Die Verläufe sind derzeit nicht abrufbar.
          </p>
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
        <!-- Volumetric, not "gerade": the ranking spans the whole GP,
             open and closed — the suffix per bar says which is which. -->
        <p class="mt-1 text-sm text-ink-secondary">
          Die Entwürfe mit den meisten Stellungnahmen in dieser
          Gesetzgebungsperiode – offene und abgeschlossene.
        </p>
        <div class="mt-4 space-y-3">
          <VolumeBar
            v-for="c in data.topByStatements"
            :key="`${c.gp}-${c.inr}`"
            :label="c.title"
            :value="c.statementCount"
            :max="topMax"
            :href="`/begutachtungen/${c.gp}/${c.inr}`"
            :meta="c.active ? 'läuft noch' : 'abgeschlossen'"
          />
        </div>
      </section>

      <p v-if="lastSyncLabel" class="mt-12 text-xs text-ink-muted">
        Datenstand: {{ lastSyncLabel }}
      </p>
    </template>
  </div>
</template>
