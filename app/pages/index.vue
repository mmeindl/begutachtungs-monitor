<script setup lang="ts">
import type {
  DashboardOutcomes,
  DashboardPayload,
  DashboardSecondRound,
  RisConsultationsResponse,
} from '#shared/types'

const pageDescription =
  'Laufende Begutachtungen österreichischer Gesetzesentwürfe: Fristen und Stellungnahmen – und danach: Regierungsvorlage, Bundesgesetzblatt oder bisher nichts.'

useSeoMeta({
  title: 'Aktuell',
  description: pageDescription,
  // Homepage shares (the demo case) get the product name, not "Aktuell".
  ogTitle: 'Begutachtungs-Monitor',
  ogDescription: pageDescription,
})

/* Both fetches are started here and awaited below, so they overlap instead
 * of queueing: the outcomes endpoint shares its cached leaves with
 * /api/dashboard, and awaiting them one after the other would add its
 * latency to the page's instead of hiding inside it. */
const dashboardFetch = useFetch<DashboardPayload>('/api/dashboard')

/* Server-rendered on purpose. This section IS the product's point
 * (mechanism 1: shelving visible, mechanism 3: wins equally visible), and
 * client-only kept it out of the SSR HTML entirely — invisible to crawlers
 * and shared previews, absent without JS, and a "Verläufe werden geladen …"
 * flash for everyone else, on the one section the homepage exists for.
 *
 * What this replaces: "resolving the outcome pool can hit ~24 cold upstream
 * fetches — that must never block the first paint." Measured 2026-09-07
 * against a cleared cache: the fan-out is parallel (Promise.all over the
 * pool, then the RV leg), one Gegenstand costs ~100 ms, and the endpoint
 * answers in 0.41 s fully cold — extension probe included — and 5 ms warm.
 * The request count was never the latency.
 *
 * `timeout` is what keeps that judgement safe if upstream ever turns slow:
 * past it useFetch reports an error and the section falls back to its
 * "derzeit nicht abrufbar" line rather than holding the whole page. No
 * automatic client retry — during a real upstream outage that would add one
 * uncached fan-out per visitor and change nothing. */
const outcomesFetch = useFetch<DashboardOutcomes>('/api/dashboard/outcomes', {
  timeout: 4000,
})

/* The second window for input: Regierungsvorlagen that are taking
 * Stellungnahmen right now. Client-side and lazy on purpose — unlike the
 * outcomes section this is an ADDITION to the page, not the reason it
 * exists: nothing above it depends on the answer, an empty result is a
 * normal state, and a section that can be absent must never be able to hold
 * the first paint. Costs one list call plus a handful of detail fetches
 * behind the 30-min leaf caches (`/api/dashboard/zweite-runde`). */
const { data: secondRound } = await useFetch<DashboardSecondRound>(
  '/api/dashboard/zweite-runde',
  { lazy: true, server: false },
)

/* The Begutachtungen Parliament has no Gegenstand for — mostly
 * Verordnungsentwürfe (docs/architecture.md §12.16).
 *
 * SERVER-RENDERED, unlike the section above it, and that is the point. This
 * is not a bonus section: without it "Jetzt in Begutachtung" names a
 * fraction of what is open and says nothing about the rest — 4 of 8 on
 * 2026-09-17. A correction to a claim the page makes cannot be the one part
 * of the page that needs JavaScript to appear.
 *
 * It costs no upstream request the page does not already pay: the RIS corpus
 * and the GP's join map are the same cached leaves the draft pages read. */
const { data: risOnly, status: risOnlyStatus } = await useFetch<RisConsultationsResponse>(
  '/api/weitere-entwuerfe',
  // 4 s is the outcomes section's budget, and that endpoint answers in
  // 0.41 s cold. This one sits on the RIS corpus — 46 upstream requests with
  // a politeness pause, warmed nightly by the prewarm unit and held for 20 h.
  // Warm it is milliseconds; cold it is a minute, and no homepage may wait
  // for that. 6 s covers a slow-but-answering upstream without ever being
  // the reason first paint is late.
  { query: { status: 'open' }, timeout: 6000 },
)

const { data, error, refresh, status } = await dashboardFetch
const { data: outcomes, status: outcomesStatus } = await outcomesFetch

const { webcalUrl, googleCalUrl } = useFeedUrls()

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
        <!-- "Ministerialentwürfe", not "Begutachtungen": this tile counts
             list 81, it links to the list of list 81, and 4 of the 8
             consultations open on 2026-09-17 were not in it. The whole row
             is scoped by this first label — the three tiles beside it have
             no counterpart on the RIS side at all (nobody publishes
             Stellungnahmen or a Regierungsvorlage for a Verordnung). -->
        <StatTile
          label="Offene Ministerialentwürfe"
          :value="data.stats.openCount"
          to="/entwuerfe?status=open"
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

      <section class="page-section" aria-labelledby="open-heading">
        <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <!-- "Ministerialentwürfe", not "Begutachtungen". The heading used
               to be the unqualified "Jetzt in Begutachtung" over a list
               that held Parliament's half only — 4 of the 8 consultations
               open on 2026-09-17. The missing half now has its own section
               directly below, and this heading names its own denominator
               instead of claiming both. -->
          <h2 id="open-heading" class="section-heading">
            Jetzt in Begutachtung: Ministerialentwürfe
          </h2>
          <NuxtLink
            to="/entwuerfe"
            class="inline-flex min-h-11 items-center rounded text-sm font-medium text-accent-deep hover:underline"
          >
            Alle Entwürfe →
          </NuxtLink>
        </div>
        <ul v-if="data.open.length" class="mt-4 space-y-3">
          <li v-for="c in data.open" :key="`${c.gp}-${c.inr}`">
            <DraftCard :draft="c" />
          </li>
        </ul>
        <div v-else class="mt-4">
          <!-- The no-open moment is exactly the moment to subscribe. -->
          <!-- "keine offenen Begutachtungen" was flatly wrong on any week
               with a Verordnung in Begutachtung and no Ministerialentwurf —
               the section below can be full while this one is empty. -->
          <EmptyState
            title="Derzeit kein Ministerialentwurf in Begutachtung"
            description="Neue Ministerialentwürfe erscheinen hier, sobald sie zur Begutachtung aufliegen. Verordnungsentwürfe stehen im Abschnitt darunter."
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

      <!-- The other half of what is open right now. Directly under the
           Ministerialentwürfe, because the two together are the answer to
           "was läuft gerade?" and either one alone is a wrong answer.
           Two thirds of the whole pre-parliamentary corpus is here
           (3.012 of 4.574 records, `pnpm audit:verordnungen`).

           NOT hidden when empty, unlike the Zweite-Runde section below: an
           empty bonus section is noise, but this one carries a claim about
           coverage, and a reader who cannot see the section cannot know
           whether it is empty or missing. -->
      <section class="page-section" aria-labelledby="ris-only-heading">
        <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h2 id="ris-only-heading" class="section-heading">
            Jetzt in Begutachtung: Verordnungen und weitere Entwürfe
          </h2>
          <NuxtLink
            to="/entwuerfe?art=verordnung"
            class="inline-flex min-h-11 items-center rounded text-sm font-medium text-accent-deep hover:underline"
          >
            Alle Verordnungsentwürfe →
          </NuxtLink>
        </div>
        <p class="mt-1 max-w-prose text-sm text-ink-secondary">
          Diese Entwürfe haben keinen Gegenstand im Parlament – eine
          Stellungnahme geht direkt an das Ressort. Sie stehen nur im RIS,
          und damit auch nicht in den Zahlen oben.
        </p>
        <ul v-if="risOnly?.items.length" class="mt-4 space-y-3">
          <li v-for="c in risOnly.items" :key="c.id">
            <RisConsultationCard :consultation="c" />
          </li>
        </ul>
        <p
          v-else-if="risOnlyStatus === 'pending'"
          class="mt-4 text-sm text-ink-muted"
        >
          Wird geladen …
        </p>
        <p v-else-if="risOnly" class="mt-4 text-sm text-ink-muted">
          Derzeit ist kein Verordnungsentwurf in Begutachtung.
        </p>
        <!-- The rows can be missing; the correction above must not be. The
             intro paragraph renders either way, and this line keeps a way
             through instead of ending at "nicht abrufbar": the RIS corpus is
             46 upstream requests cold (warmed nightly, `deploy/systemd/`),
             so the empty-handed case is a restart, not an outage. -->
        <p v-else class="mt-4 text-sm text-ink-muted">
          Diese Liste ist gerade nicht abrufbar –
          <NuxtLink
            to="/entwuerfe?art=verordnung"
            class="font-medium text-accent-deep underline underline-offset-2 hover:no-underline"
          >noch einmal versuchen</NuxtLink>
          oder direkt im
          <ExternalLink
            href="https://www.ris.bka.gv.at/Begut/"
            class="font-medium text-accent-deep underline underline-offset-2 hover:no-underline"
          >RIS</ExternalLink>
          nachsehen.
        </p>
      </section>

      <!-- The second window for input, directly under the first. Both
           sections are "you can take part now"; this one exists because the
           Vorlage's door is otherwise invisible unless you happen to open
           the right detail page. Hidden entirely when nothing is open — a
           bonus section, unlike "Jetzt in Begutachtung", which states its
           emptiness because the product promises that list. -->
      <section
        v-if="secondRound?.items.length"
        class="page-section"
        aria-labelledby="second-round-heading"
      >
        <h2 id="second-round-heading" class="section-heading">
          Zweite Runde: Stellungnahme im Nationalrat möglich
        </h2>
        <p class="mt-1 max-w-prose text-sm text-ink-secondary">
          Auch zu einer Regierungsvorlage kann Stellung genommen werden – dort
          kann der Ausschuss den Text noch ändern. Für diese Runde gibt es
          keine veröffentlichte Frist: Sie endet mit der Abstimmung.
        </p>
        <ul class="mt-4 space-y-3">
          <li v-for="v in secondRound.items" :key="v.citation">
            <SecondRoundCard :vorlage="v" />
          </li>
        </ul>
      </section>

      <!-- The accountability layer on the front door: mechanism 1 (shelving
           visible) and mechanism 3 (wins equally visible) in one section. -->
      <section class="page-section scroll-mt-6" aria-labelledby="outcomes-heading">
        <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h2 id="outcomes-heading" class="section-heading">
            Zuletzt abgeschlossen – was wurde daraus?
          </h2>
          <NuxtLink
            to="/entwuerfe?status=closed"
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
            <!-- Same card as "Jetzt in Begutachtung" — only the aside differs
                 (outcome chip instead of deadline block). -->
            <ul class="space-y-3">
              <li v-for="o in outcomes.recent" :key="`${o.gp}-${o.inr}`">
                <DraftCard :draft="o">
                  <template #aside><OutcomeChip :outcome="o" /></template>
                </DraftCard>
              </li>
            </ul>
            <template v-if="outcomes.lastEnacted">
              <h3 class="mt-6 text-base font-semibold text-ink">
                {{
                  outcomes.lastEnacted.bgblNumber
                    ? 'Zuletzt kundgemacht'
                    : 'Zuletzt mit Regierungsvorlage'
                }}
              </h3>
              <div class="mt-2">
                <DraftCard :draft="outcomes.lastEnacted">
                  <template #aside>
                    <OutcomeChip :outcome="outcomes.lastEnacted" />
                  </template>
                </DraftCard>
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
        class="page-section"
        aria-labelledby="top-heading"
      >
        <h2 id="top-heading" class="section-heading">
          Die meisten Stellungnahmen
        </h2>
        <!-- Volumetric, not "gerade": the ranking spans the whole GP,
             open and closed — the Frist line under each count says which
             is which. -->
        <p class="mt-1 text-sm text-ink-secondary">
          Die Entwürfe mit den meisten Stellungnahmen in dieser
          Gesetzgebungsperiode – offene und abgeschlossene.
        </p>
        <!-- Same card anatomy as the sections above, and the ranked figure
             in the same right-hand slot the others use for their key fact:
             right-aligned behind one suffix, the counts read as a column.
             An ordered list, because here the order carries meaning. -->
        <ol class="mt-4 space-y-3">
          <li v-for="c in data.topByStatements" :key="`${c.gp}-${c.inr}`">
            <DraftCard :draft="c" emphasis="volume" />
          </li>
        </ol>
      </section>

      <p v-if="lastSyncLabel" class="mt-12 text-xs text-ink-muted">
        Datenstand: {{ lastSyncLabel }}
      </p>
    </template>
  </div>
</template>
