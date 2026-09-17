<script setup lang="ts">
import type {
  DashboardOutcomes,
  DashboardPayload,
  DashboardSecondRound,
  DraftSummary,
  RisConsultation,
  RisConsultationsResponse,
} from '#shared/types'
import { compareDrafts, draftOrderKey } from '#shared/utils/draftOrder'

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
const { data: risOnly } = await useFetch<RisConsultationsResponse>(
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

/**
 * What is open right now, both kinds, in ONE deadline-ordered list
 * (docs/architecture.md §12.20).
 *
 * Same shape as `/entwuerfe`: two row types, one order, never a pooled
 * total. What differs is the cap — this is the front door, not the corpus
 * view.
 */
type OpenRow =
  | { kind: 'me'; key: string; draft: DraftSummary }
  | { kind: 'ris'; key: string; item: RisConsultation }

/**
 * Six rows, then "Alle Entwürfe →".
 *
 * Measured 2026-09-17 over 2025-01-01 → today: 6 Ministerialentwürfe are
 * open at the median (p90 10, max 15) and 7 RIS-only records (p90 18, max
 * 25) — so the merged list runs at ~13 rows typically and has touched 40.
 * Uncapped it would push the accountability section, which is the reason
 * this page exists, past a third viewport on an ordinary week. The cap is
 * what the count line below the list then has to account for.
 */
const OPEN_ROW_CAP = 6

const openRows = computed<OpenRow[]>(() => {
  const out: OpenRow[] = []
  for (const d of data.value?.open ?? []) {
    out.push({ kind: 'me', key: `me-${d.gp}-${d.inr}`, draft: d })
  }
  for (const c of risOnly.value?.items ?? []) {
    out.push({ kind: 'ris', key: `ris-${c.id}`, item: c })
  }
  return out.sort((a, b) =>
    compareDrafts(
      a.kind === 'me' ? draftOrderKey(a.draft) : a.item,
      b.kind === 'me' ? draftOrderKey(b.draft) : b.item,
    ),
  )
})

const visibleOpenRows = computed(() => openRows.value.slice(0, OPEN_ROW_CAP))

/** Whether the explanation below the list has anything to explain. */
const showsRisRow = computed(() => visibleOpenRows.value.some((r) => r.kind === 'ris'))

/**
 * NO count line on this page, unlike `/entwuerfe`.
 *
 * There it states a corpus nobody can see (336 rows behind filters); here
 * the list is six cards and every one of them says on its own row which
 * kind it is, so "4 Ministerialentwürfe · 4 ohne Gegenstand im Parlament"
 * only restates what is visible — and a figure inside a line of prose is
 * the hardest place to find one when you are scanning for exactly that.
 *
 * The one thing the line did carry that the rows cannot is the ABSENCE of
 * the RIS half; that became its own line, rendered only when the half is
 * actually missing (template below).
 */

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
      <!-- The second sentence links to the section that keeps it. Until
           17.09.2026 the only pointer to the accountability layer above the
           fold was a stat tile's hint ("Was wurde daraus? ↓"); with the
           tiles gone the promise itself carries it, which is the better
           place for it anyway — and it is a fixed string, not a number that
           has to be read to be found. -->
      <p class="mt-3 text-ink-secondary">
        Alle laufenden Begutachtungen österreichischer Gesetzesentwürfe:
        Fristen und Stellungnahmen auf einen Blick. Und für jeden Entwurf
        <a
          href="#outcomes-heading"
          class="rounded font-medium text-accent-deep underline underline-offset-2 hover:no-underline"
        >danach: Regierungsvorlage, Bundesgesetzblatt – oder bisher nichts</a>.
      </p>
    </header>

    <div v-if="status === 'pending' && !data" class="mt-10">
      <LoadingState label="Daten werden geladen …" />
    </div>
    <div v-else-if="error" class="mt-10">
      <ErrorState @retry="refresh()" />
    </div>
    <template v-else-if="data">
      <!-- The account-free alert tier, directly above the list of Fristen
           it applies to. Footer keeps the full version with the manual
           URL. -->
      <p class="mt-8 text-sm text-ink-secondary">
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

      <!-- ONE list, because the question is one: "was läuft gerade, wo kann
           ich noch mitreden?" (docs/architecture.md §12.20). Which official
           register happens to carry a record is plumbing, and plumbing does
           not belong in the page skeleton — it belongs on the row, which is
           why both card kinds now lead their meta line with the type word.

           The split cost the page its deadline order: on 17.09.2026 the
           first card was a Frist ending on the 21st while a Verordnung ended
           that same day, below a second heading. Urgency is the one thing
           two lists cannot preserve. -->
      <section class="page-section" aria-labelledby="open-heading">
        <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h2 id="open-heading" class="section-heading">
            Jetzt in Begutachtung
          </h2>
          <NuxtLink
            to="/entwuerfe?status=open"
            class="inline-flex min-h-11 items-center rounded text-sm font-medium text-accent-deep hover:underline"
          >
            Alle Entwürfe →
          </NuxtLink>
        </div>
        <!-- Directly under the heading, not under the list: this one is
             not provenance but a correction to what the list claims, and a
             reader who learns at the bottom that rows are missing has
             already read it as complete. Rendered only when they are. -->
        <p v-if="!risOnly" class="mt-2 max-w-prose text-sm text-ink-muted">
          Die Entwürfe ohne Gegenstand im Parlament fehlen hier gerade – sie
          lassen sich
          <NuxtLink
            to="/entwuerfe?art=verordnung&status=open"
            class="font-medium text-accent-deep underline underline-offset-2 hover:no-underline"
          >noch einmal abrufen</NuxtLink>
          oder direkt im
          <ExternalLink
            href="https://www.ris.bka.gv.at/Begut/"
            class="font-medium text-accent-deep underline underline-offset-2 hover:no-underline"
          >RIS</ExternalLink>
          nachsehen.
        </p>

        <ul v-if="visibleOpenRows.length" class="mt-4 space-y-3">
          <li v-for="row in visibleOpenRows" :key="row.key">
            <DraftCard v-if="row.kind === 'me'" :draft="row.draft" />
            <RisConsultationCard v-else :consultation="row.item" />
          </li>
        </ul>
        <div v-else-if="risOnly" class="mt-4">
          <!-- The no-open moment is exactly the moment to subscribe. Said
               only when BOTH halves are known to be empty — with the RIS
               half missing this would be a claim the page cannot make. -->
          <EmptyState
            title="Derzeit ist keine Begutachtung offen"
            description="Neue Entwürfe erscheinen hier, sobald sie zur Begutachtung aufliegen – Ministerialentwürfe aus dem Parlament und Verordnungsentwürfe aus dem RIS."
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

        <!-- What sits behind the cap, named rather than implied. -->
        <p
          v-if="openRows.length > visibleOpenRows.length"
          class="mt-3 text-sm text-ink-secondary"
        >
          <NuxtLink
            to="/entwuerfe?status=open"
            class="tap-target rounded font-medium text-accent-deep underline underline-offset-2 hover:no-underline"
          >Alle {{ formatNumberDe(openRows.length) }} offenen Entwürfe ansehen →</NuxtLink>
        </p>

        <!-- Under the list, like a note under a table: the reader meets
             „nicht im Parlament“ on a row first and looks for the reason
             afterwards. Only rendered when such a row is actually above. -->
        <p v-if="showsRisRow" class="mt-4 max-w-prose text-sm text-ink-muted">
          „Nicht im Parlament“ heißt: zu diesem Entwurf führt das Parlament
          keinen Gegenstand. Eine Stellungnahme geht direkt an das Ressort,
          und wer Stellung genommen hat, veröffentlicht niemand.
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
