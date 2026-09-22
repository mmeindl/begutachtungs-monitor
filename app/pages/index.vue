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
import { HOME_LIST_LENGTH, compareDrafts, draftOrderKey } from '#shared/utils/draftOrder'
import { viewOfDraft, viewOfOutcome, viewOfRis, viewOfVorlage } from '~/utils/entryView'
import { gpWindow } from '#shared/utils/gp'
import { SECOND_ROUND_WINDOW } from '~/utils/spine'

/* „Gesetzes- und Verordnungsentwürfe" since 18.09.2026. It said
   „Gesetzesentwürfe" from before the RIS half shipped, and then went on
   saying it over a list of which roughly half are Verordnungsentwürfe — in
   the one sentence that travels with every shared link and is the first
   thing a newcomer reads. */
const pageDescription =
  'Laufende Begutachtungen österreichischer Gesetzes- und Verordnungsentwürfe: Fristen und Stellungnahmen – und danach: Regierungsvorlage, Bundesgesetzblatt.'

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
  '/api/ris-drafts',
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
  | { kind: 'me'; draft: DraftSummary }
  | { kind: 'ris'; item: RisConsultation }

/**
 * Five rows, then out to the filter — `HOME_LIST_LENGTH`, the same length
 * every list on this page is cut to (§12.24).
 *
 * Measured 2026-09-17 over 2025-01-01 → today: 6 Ministerialentwürfe are
 * open at the median (p90 10, max 15) and 7 RIS-only records (p90 18, max
 * 25) — so the merged list runs at ~13 rows typically and has touched 40.
 * Uncapped it would push the accountability section, which is the reason
 * this page exists, past a third viewport on an ordinary week. What sits
 * behind the cap is named in the link above the list, and only there.
 */
const openRows = computed<OpenRow[]>(() => {
  const out: OpenRow[] = []
  for (const d of data.value?.open ?? []) out.push({ kind: 'me', draft: d })
  for (const c of risOnly.value?.items ?? []) out.push({ kind: 'ris', item: c })
  return out.sort((a, b) =>
    compareDrafts(
      a.kind === 'me' ? draftOrderKey(a.draft) : a.item,
      b.kind === 'me' ? draftOrderKey(b.draft) : b.item,
    ),
  )
})

/* Auf die Anatomie abgebildet wird HIER, nicht in der Vorlage: `EntryList`
 * bekommt fertige `EntryView`s, und jeder Abschnitt der Seite sagt in einer
 * Zeile, welcher Adapter für seine Art zuständig ist. */
const visibleOpenRows = computed(() =>
  openRows.value
    .slice(0, HOME_LIST_LENGTH)
    .map((row) => (row.kind === 'me' ? viewOfDraft(row.draft) : viewOfRis(row.item))),
)

/**
 * NO count line on this page, unlike `/entwuerfe`.
 *
 * There it states a corpus nobody can see (336 rows behind filters); here
 * the list is a handful of rows and every one of them says in its own
 * Kennung which kind it is, so "4 Ministerialentwürfe · 4 Verordnungsentwürfe und andere"
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
  return (data.value?.topByStatements ?? []).map((draft) =>
    viewOfDraft(draft, byKey.get(`${draft.gp}-${draft.inr}`) ?? null),
  )
})

/**
 * Five Vorlagen, and the rest on `/entwuerfe` — no longer three with a
 * „weitere anzeigen" button under them (§12.24).
 *
 * The section has no Frist to rank by — the door closes with the vote — so
 * it cannot be cut by urgency the way the open list is, and it sits between
 * the two halves the page promises. What changed on 18.09.2026 is not the
 * cutting but WHERE THE REST IS: the button grew this page for one reader
 * and left the same rows unreachable for everyone arriving from a shared
 * link. The list exists as a filter now, so the way out is a link like
 * every other section's.
 */
const visibleSecondRound = computed(
  () => secondRound.value?.items.slice(0, HOME_LIST_LENGTH).map(viewOfVorlage) ?? [],
)

/* Ungekappt: der Endpunkt liefert bereits `HOME_LIST_LENGTH` Zeilen — die
 * Kappung sitzt dort, wo die Vorlagen aus Liste 101 gelesen werden, nicht
 * hier. `?? []` unterscheidet nicht zwischen „nichts kundgemacht" und
 * „nicht abrufbar"; das tun die zwei Sätze in der Vorlage, die weiterhin
 * `enacted` selbst befragen. */
const enactedEntries = computed(() => enacted.value?.items.map(viewOfOutcome) ?? [])

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
</script>

<template>
  <div class="mx-auto w-full max-w-5xl">
    <header class="max-w-2xl">
      <h1 class="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        Was passiert in der Begutachtung – und was wird daraus?
      </h1>
      <!-- NO LINK in this sentence, since 18.09.2026. It carried an anchor
           to the accountability section, inherited from the stat tile's
           "Was wurde daraus? ↓" that had been the only pointer above the
           fold. Two reasons it goes: a promise is not navigation — underlined
           in the middle of the lede, "Regierungsvorlage, Bundesgesetzblatt"
           reads as a glossary link to a definition that does not exist — and
           the reorder took the distance away that an anchor was saving. The
           sentence still makes the promise; the sections below keep it. -->
      <p class="mt-3 text-ink-secondary">
        Alle laufenden Begutachtungen österreichischer Gesetzes- und
        Verordnungsentwürfe: Fristen und Stellungnahmen auf einen Blick. Und
        für jeden Entwurf danach: Regierungsvorlage, Bundesgesetzblatt.
      </p>

      <!-- The account-free alert tier, IN the header since 18.09.2026, not
           between it and the first section. It stood at `mt-8` with the
           80px section boundary under it — 1:3, too little to read as its
           own thing and too much to read as part of the lede, so it
           belonged to nothing. Its old comment called it "directly above
           the list of Fristen it applies to"; it was a heading and a
           section boundary away from that list.

           It is a line about the page, and the header is where the page
           speaks about itself. The move also takes it out of
           `v-else-if="data"`: `useFeedUrls()` touches no endpoint, so a
           failed `/api/dashboard` used to take the one still-working offer
           down with the data. Footer keeps the full version with the
           manual URL. -->
      <p class="mt-4 text-sm text-ink-secondary">
        <UIcon
          name="i-lucide-calendar-plus"
          class="me-1 inline-block size-4 align-text-bottom"
          aria-hidden="true"
        />
        Keine Frist verpassen:
        <SubscribeLinks />
      </p>
    </header>

    <FetchGate
      v-slot="{ data }"
      :status="status"
      :error="error"
      :data="data"
      loading-label="Daten werden geladen …"
      state-class="mt-10"
      @retry="refresh()"
    >
      <!-- ONE list, because the question is one: "was läuft gerade, wo kann
           ich noch mitreden?" (docs/architecture.md §12.20). Which official
           register happens to carry a record is plumbing, and plumbing does
           not belong in the page skeleton — it belongs on the row, which is
           why both row kinds now lead their meta line with the type word.

           The split cost the page its deadline order: on 17.09.2026 the
           first row was a Frist ending on the 21st while a Verordnung ended
           that same day, below a second heading. Urgency is the one thing
           two lists cannot preserve. -->
      <section class="page-section" aria-labelledby="open-heading">
        <ListHeader
          id="open-heading"
          to="/entwuerfe?status=open&station=begutachtung"
          noun="offenen Entwürfe"
          :total="openRows.length"
          :visible="visibleOpenRows.length"
        >
          Jetzt in Begutachtung
        </ListHeader>
        <!-- Directly under the heading, not under the list: this one is
             not provenance but a correction to what the list claims, and a
             reader who learns at the bottom that rows are missing has
             already read it as complete. Rendered only when they are. -->
        <!-- Names the missing rows by what they are, not by the register
             that does not carry them. „Die Entwürfe ohne Gegenstand im
             Parlament" put the site's densest piece of jargon in the one
             state where its gloss below the list was suppressed — the
             gloss only rendered when such a row was present, and this line
             only renders when none is. -->
        <p v-if="!risOnly" class="mt-2 max-w-prose text-sm text-ink-muted">
          Die Verordnungsentwürfe aus dem RIS sind gerade nicht abrufbar –
          <NuxtLink
            to="/entwuerfe?art=verordnung&status=open"
            class="font-medium text-accent-deep underline underline-offset-2 hover:no-underline"
          >noch einmal versuchen</NuxtLink>
          oder
          <ExternalLink
            href="https://www.ris.bka.gv.at/Begut/"
            class="font-medium text-accent-deep underline underline-offset-2 hover:no-underline"
          >im RIS nachsehen</ExternalLink>.
        </p>

        <EntryList v-if="visibleOpenRows.length" :entries="visibleOpenRows" class="mt-4" />
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
                class="tap-target link-inline font-medium"
              >Fristen-Kalender abonnieren</a>
              (Apple/Outlook) oder
              <ExternalLink
                :href="googleCalUrl"
                class="tap-target link-inline font-medium"
              >zu Google Kalender hinzufügen</ExternalLink>
              – die nächste Begutachtung landet automatisch im Kalender.
            </p>
          </EmptyState>
        </div>

        <!-- NO second link under the list since 18.09.2026: what sits
             behind the cap is the number in the link above („Alle 13
             offenen Entwürfe →"), and both pointed at the same URL
             (§12.24). -->

        <!-- NO gloss under the list since 18.09.2026. It explained
             „nicht im Parlament" with „Gegenstand", a word the site
             defines nowhere — a gloss that needs a gloss. The rows now
             state the fact the absence is made of („Stellungnahme direkt
             nicht gezählt"), so there is nothing left
             to explain here; the procedure behind it belongs on
             /so-funktionierts, not under the front door's list. -->

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
        <!-- The filter this section is a window onto is a SECTION on
             `/entwuerfe`, not a row filter — a Regierungsvorlage is not in
             Begutachtung and never appears in that list. The anchor is
             therefore part of the target, and `?status=open` is what makes
             the section render there at all. -->
        <ListHeader
          id="second-round-heading"
          to="/entwuerfe?status=open&station=rv"
          noun="Regierungsvorlagen"
          :total="secondRound.items.length"
          :visible="visibleSecondRound.length"
        >
          Zweite Runde: Stellungnahme im Nationalrat möglich
        </ListHeader>
        <p class="mt-2 max-w-prose text-sm text-ink-secondary">
          Auch zu einer Regierungsvorlage kann Stellung genommen werden – dort
          kann der Ausschuss den Text noch ändern. {{ SECOND_ROUND_WINDOW }}
        </p>
        <!-- Der Spaltenkopf heißt hier NICHT „Entwurf": diese Zeilen sind
             Regierungsvorlagen, und der Kopf ist die einzige Stelle, an der
             die Liste selbst sagt, was in ihr steht. -->
        <EntryList :entries="visibleSecondRound" lead="Regierungsvorlage" class="mt-4" />
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
        class="page-section"
        aria-labelledby="ranked-heading"
      >
        <!-- The link continues the ranking rather than pointing at the pool
             it was drawn from: `?sort=stellungnahmen` is the same order,
             uncut, and `?art=ministerialentwurf` is what the sort can
             speak about — a draft without a Gegenstand has no Stellungnahmen
             count and never will (§12.24). The count is the GP's
             Ministerialentwürfe, which is exactly the set behind the
             link. -->
        <ListHeader
          id="ranked-heading"
          to="/entwuerfe?art=ministerialentwurf&sort=stellungnahmen"
          noun="Ministerialentwürfe"
          :total="data.stats.consultationsTotalGp"
          :visible="rankedRows.length"
        >
          Wo am meisten mitgeredet wurde
        </ListHeader>
        <!-- „… – und was daraus wurde" left the heading on 18.09.2026, for
             the reason the section below it lost its second half: the
             sentence under the heading says it, and the outcome sits as a
             chip on every closed row. What made this section stop being a
             leaderboard was never the heading — it was the chips. -->
        <!-- Volumetric, not "gerade": the ranking spans the whole GP,
             open and closed — the Frist line under each count says which
             is which. -->
        <p class="mt-2 max-w-prose text-sm text-ink-secondary">
          Die Entwürfe mit den meisten Stellungnahmen der
          <template v-if="gpLabel">{{ gpLabel }}. </template>Gesetzgebungsperiode<template
            v-if="gpStart"
          > (seit {{ gpStart }})</template> – offene und abgeschlossene – und
          daneben, was aus ihnen geworden ist.
        </p>
        <!-- Dieselbe Anatomie wie überall, und hier ist das der Punkt: die
             Zahl, nach der gereiht wird, steht in DERSELBEN Spalte wie in
             jedem anderen Abschnitt, und daneben, nicht an ihrer Stelle,
             der Ausgang (§12.28).

             Bis 18.09.2026 hob dieser Abschnitt die Zahl in den rechten
             Slot — und verdrängte damit den Ausgang aus ihm. „846
             Stellungnahmen → Bisher keine Regierungsvorlage" IST aber die
             Nachverfolgung; das Paar ist die Aussage, nicht die Zahl allein
             (§12.21 sagt es selbst: was diesen Abschnitt aufhörte, eine
             Rangliste zu sein, waren die Chips). Eine gereihte Liste zeigt
             ihren Schlüssel durch die REIHENFOLGE — die Zahl braucht
             Ausrichtung, keine Vergrößerung. Eine geordnete Liste, weil
             hier die Reihenfolge Bedeutung trägt. -->
        <EntryList :entries="rankedRows" ordered class="mt-4" />
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
        <!-- Dieser Link zeigte auf „?status=closed", weil es den Filter
             „im Bundesgesetzblatt" nicht gab: der hätte eine Station pro
             Zeile gebraucht, und das war ein Arbeitspaket, kein Link
             (§12.24). Seit 18.09.2026 gibt es die Stationskarte (§12.26),
             also zeigt der Link auf genau die Menge, die die Überschrift
             nennt. Weiterhin ohne Zahl: der Abschnitt zeigt die neuesten
             Kundmachungen, die Zahl daneben wäre die aller. -->
        <ListHeader
          id="enacted-heading"
          to="/entwuerfe?station=bgbl"
          noun="kundgemachten Entwürfe"
        >
          Zuletzt Gesetz geworden
        </ListHeader>
        <!-- „… – aus welcher Begutachtung" stood in the heading until
             18.09.2026 and was a duplicate twice over: the sentence below
             says it in full, and every row names its Ministerialentwurf.
             The heading states what the section is, the rows answer it.

             The rhythm said out loud, because it is the section's one
             surprise: this list can stand still for two months and then
             turn over almost completely. Better read as the institution's
             calendar than as a stale page. -->
        <p class="mt-2 max-w-prose text-sm text-ink-secondary">
          Die jüngsten Kundmachungen im Bundesgesetzblatt aus der
          <template v-if="gpLabel">{{ gpLabel }}. </template>Gesetzgebungsperiode
          – und die Begutachtung, aus der sie hervorgegangen sind. Der
          Nationalrat beschließt in Blöcken: zwischen zwei Plenarwochen ändert
          sich hier nichts.
        </p>
        <!-- Same row and the same chip as the section above: the object
             is the Begutachtung, and what became of it goes in the aside. -->
        <EntryList v-if="enactedEntries.length" :entries="enactedEntries" class="mt-4" />
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
    </FetchGate>
  </div>
</template>
