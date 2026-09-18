<script setup lang="ts">
import type {
  DashboardEnacted,
  DashboardOutcomes,
  DashboardPayload,
  DashboardSecondRound,
  DraftSummary,
  RisConsultation,
  RisConsultationsResponse,
} from '#shared/types'
import { compareDrafts, draftOrderKey } from '#shared/utils/draftOrder'
import { gpWindow } from '#shared/utils/gp'

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

/* The end of the chain, read from the Vorlage side (§12.23). Server-rendered
 * for the same reason as the outcomes above it: this is the section that
 * shows participation arriving somewhere, and it may not depend on
 * JavaScript. Measured cold on 2026-09-18: 0.93 s for the whole endpoint —
 * one list-101 call plus 30 parallel Gegenstand fetches at 0.54 s — and
 * 14 ms warm, so the 4 s budget is a guard, not a plan. */
const enactedFetch = useFetch<DashboardEnacted>('/api/dashboard/enacted', {
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
const { data: outcomes } = await outcomesFetch
const { data: enacted } = await enactedFetch

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

/**
 * The volume ranking, each row with the outcome that belongs to it.
 *
 * Two sources on purpose. The rows come from `/api/dashboard`, which is
 * server-rendered and cheap; the outcomes from the deferred endpoint, which
 * pays upstream fetches for them. So the section renders whole either way,
 * and a row whose Gegenstand could not be read simply carries no chip —
 * never "bisher keine Regierungsvorlage", which would be a claim we did not
 * verify. Open drafts are never in the map by construction: they have no
 * outcome yet, and their Frist block is the right aside for them.
 */
const rankedRows = computed(() => {
  const byKey = new Map(
    (outcomes.value?.rankedOutcomes ?? []).map((o) => [`${o.gp}-${o.inr}`, o]),
  )
  return (data.value?.topByStatements ?? []).map((draft) => ({
    draft,
    outcome: byKey.get(`${draft.gp}-${draft.inr}`) ?? null,
  }))
})

/**
 * Three Vorlagen, then the rest on request.
 *
 * The section has no Frist to rank by — the door closes with the vote — so
 * it cannot be cut by urgency the way the open list is, and it sits between
 * the two halves the page promises. Six cards were a full screen of "no
 * deadline, 1–8 Stellungnahmen" ahead of the accountability layer. Three
 * name the window; the button admits the rest without sending anyone to a
 * page that does not exist.
 */
const SECOND_ROUND_STEP = 3
const secondRoundShown = ref(SECOND_ROUND_STEP)
const visibleSecondRound = computed(
  () => secondRound.value?.items.slice(0, secondRoundShown.value) ?? [],
)

/**
 * The Gesetzgebungsperiode everything below the open list is counted over,
 * spelled out rather than implied.
 *
 * Both accountability sections read list 81/101 of the CURRENT period only,
 * and until 18.09.2026 the page said so once, in a subline, as „in dieser
 * Gesetzgebungsperiode" — a demonstrative pronoun pointing at nothing the
 * reader can see. It names the period now, and the start date with it: a
 * ranking of counts is a ranking over a window, and the window belongs on
 * screen.
 *
 * Why the scope is not widened (measured 2026-09-18): across GP XXVII the
 * top five by Stellungnahmen are 106.184 (COVID-19-Impfpflichtgesetz),
 * 35.296, 19.026, 16.534 and 14.334 — four of them Epidemiegesetz-Novellen.
 * A cross-period ranking is a COVID monument that can never change again and
 * says nothing about what is being decided now; GP XXVIII's largest is 846.
 * The period boundary is what keeps this section alive.
 */
const gpLabel = computed(() => data.value?.gp ?? null)
const gpStart = computed(() => {
  const from = gpLabel.value ? gpWindow(gpLabel.value)?.from : null
  return from ? formatDateDe(from) : null
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
      <!-- The second sentence links to the section that keeps it. Until
           17.09.2026 the only pointer to the accountability layer above the
           fold was a stat tile's hint ("Was wurde daraus? ↓"); with the
           tiles gone the promise itself carries it, which is the better
           place for it anyway — and it is a fixed string, not a number that
           has to be read to be found. Since 18.09. it lands on the ranked
           section, the first of the two: it is the one where all three
           states are on screen at once, with the participation that was
           spent on them beside each. -->
      <p class="mt-3 text-ink-secondary">
        Alle laufenden Begutachtungen österreichischer Gesetzesentwürfe:
        Fristen und Stellungnahmen auf einen Blick. Und für jeden Entwurf
        <a
          href="#ranked-heading"
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
          <li v-for="v in visibleSecondRound" :key="v.citation">
            <SecondRoundCard :vorlage="v" />
          </li>
        </ul>
        <ListMore
          :visible="visibleSecondRound.length"
          :total="secondRound.items.length"
          :step="SECOND_ROUND_STEP"
          @more="secondRoundShown += SECOND_ROUND_STEP"
        />
      </section>

      <!-- The accountability layer opens HERE, not with the recency list
           below it (§12.21). On an ordinary day that list is four rows of
           „bisher keine Regierungsvorlage" — ME→RV latency, not shelving —
           and whichever section comes first teaches the reader what the
           tool is about. These five rows carry both directions with the
           stakes attached: 707 Stellungnahmen that became a Gesetz, 616
           that have been waiting since Oktober 2025. Ordered by
           participation, never by outcome: Nachverfolgung, kein
           Punktestand. -->
      <section
        v-if="rankedRows.length"
        class="page-section scroll-mt-6"
        aria-labelledby="ranked-heading"
      >
        <h2 id="ranked-heading" class="section-heading">
          Wo am meisten mitgeredet wurde
        </h2>
        <!-- „… – und was daraus wurde" left the heading on 18.09.2026, for
             the reason the section below it lost its second half: the
             sentence under the heading says it, and the outcome sits as a
             chip on every closed row. What made this section stop being a
             leaderboard was never the heading — it was the chips. -->
        <!-- Volumetric, not "gerade": the ranking spans the whole GP,
             open and closed — the Frist line under each count says which
             is which. -->
        <p class="mt-1 max-w-prose text-sm text-ink-secondary">
          Die Entwürfe mit den meisten Stellungnahmen der
          <template v-if="gpLabel">{{ gpLabel }}. </template>Gesetzgebungsperiode<template
            v-if="gpStart"
          > (seit {{ gpStart }})</template> – offene und abgeschlossene – und
          daneben, was aus ihnen geworden ist.
        </p>
        <!-- Same card anatomy as every other section, and the ranked figure
             in the same right-hand slot: right-aligned behind one suffix,
             the counts read as a column. Under it the outcome, so the aside
             reads in the order the procedure ran — wie viele, bis wann, was
             daraus wurde. An ordered list, because here the order carries
             meaning. -->
        <ol class="mt-4 space-y-3">
          <li v-for="row in rankedRows" :key="`${row.draft.gp}-${row.draft.inr}`">
            <DraftCard :draft="row.draft" emphasis="volume">
              <template v-if="row.outcome" #aside>
                <div class="shrink-0 sm:text-right">
                  <StatementCountBlock
                    :count="row.draft.statementCount"
                    :deadline="row.draft.deadline"
                    :active="row.draft.active"
                    :show-deadline="false"
                  />
                  <!-- Chip directly under the figure it answers, and the
                       Frist under the chip — the aside of the section below
                       with one line added on top, not a second arrangement
                       of the same three facts. -->
                  <OutcomeChip :outcome="row.outcome" class="mt-1.5" />
                </div>
              </template>
            </DraftCard>
          </li>
        </ol>
      </section>

      <!-- The end of the chain, and the page's last word on purpose
           (§12.23): participation that arrived somewhere. What stood here
           until 18.09.2026 was the most recently CLOSED Begutachtungen —
           four rows whose chip said "bisher keine Regierungsvorlage"
           because they were two weeks old and the median wait is 40 days.
           Predictable from the date beside it is not an outcome. The
           shelving half has not left the page; it sits above, on the rows
           where the wait has become evidence. -->
      <section class="page-section" aria-labelledby="enacted-heading">
        <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h2 id="enacted-heading" class="section-heading">
            Zuletzt Gesetz geworden
          </h2>
          <NuxtLink
            to="/entwuerfe?status=closed"
            class="inline-flex min-h-11 items-center rounded text-sm font-medium text-accent-deep hover:underline"
          >
            Alle abgeschlossenen →
          </NuxtLink>
        </div>
        <!-- „… – aus welcher Begutachtung" stood in the heading until
             18.09.2026 and was a duplicate twice over: the sentence below
             says it in full, and every row names its Ministerialentwurf.
             The heading states what the section is, the rows answer it.

             The rhythm said out loud, because it is the section's one
             surprise: this list can stand still for two months and then
             turn over almost completely. Better read as the institution's
             calendar than as a stale page. -->
        <p class="mt-1 max-w-prose text-sm text-ink-secondary">
          Die jüngsten Kundmachungen im Bundesgesetzblatt aus der
          <template v-if="gpLabel">{{ gpLabel }}. </template>Gesetzgebungsperiode
          – und die Begutachtung, aus der sie hervorgegangen sind. Der
          Nationalrat beschließt in Blöcken: zwischen zwei Plenarwochen ändert
          sich hier nichts.
        </p>
        <ul v-if="enacted?.items.length" class="mt-4 space-y-3">
          <!-- Same card and the same chip as the section above: the object
               is the Begutachtung, and what became of it goes in the aside. -->
          <li v-for="o in enacted.items" :key="`${o.gp}-${o.inr}`">
            <DraftCard :draft="o">
              <template #aside><OutcomeChip :outcome="o" /></template>
            </DraftCard>
          </li>
        </ul>
        <!-- Two different silences, said differently: nothing promulgated
             yet is a fact about the period, an unreachable endpoint is a
             fact about us. -->
        <p v-else-if="enacted" class="mt-4 text-sm text-ink-muted">
          Aus dieser Gesetzgebungsperiode ist bisher kein Entwurf im
          Bundesgesetzblatt kundgemacht worden.
        </p>
        <p v-else class="mt-4 text-sm text-ink-muted">
          Die Kundmachungen sind derzeit nicht abrufbar.
        </p>
      </section>

      <p v-if="lastSyncLabel" class="mt-12 text-xs text-ink-muted">
        Datenstand: {{ lastSyncLabel }}
      </p>
      <!-- The pointer, not a second scope statement: the sections name their
           period where they make their claim, and this says where the other
           periods are. A link is an action, so it stands where the reading
           ends, not in the middle of it. -->
      <p class="mt-2 max-w-prose text-xs text-ink-muted">
        Ausgewertet wird die laufende Gesetzgebungsperiode. Frühere Perioden –
        zurück bis 1979 – stehen unter
        <NuxtLink
          to="/entwuerfe"
          class="rounded font-medium text-accent-deep underline underline-offset-2 hover:no-underline"
        >Alle Entwürfe</NuxtLink>, dort lässt sich die Periode wechseln.
      </p>
    </template>
  </div>
</template>
