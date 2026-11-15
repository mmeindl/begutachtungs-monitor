<script setup lang="ts">
/**
 * One EU act and every draft of the window that names it, Bund and Länder
 * — `/eu-recht/richtlinie/2024/1069`,
 * the act's kind, year and number as its citation reads (`euActCelex`).
 *
 * THE PAGE FOLLOWS THE ACT'S RAIL (15.11.2026): a section per station, in
 * the rail's order; the drafts are the last station's section.
 *
 * NO TEXT ABOVE THE DRAFTS' LIST. The one caveat, what could not be
 * read, stands in the list box's head as on the overview; the window and
 * the Länder without a draft are the method's, not each act's (06.11.2026). The section opens with the timeline as one chart (`EuTimelineChart`): a
 * lane per draft, all on one track, each lane naming its own band and dot,
 * the deadline's label over the lanes. Then the
 * drafts as rows of the lists (`EntryList`, 05.11.2026) — the same anatomy
 * as on `/entwuerfe`, its Stellungnahmen and its Stand, instead of a row
 * grammar of this page's own.
 *
 * TWO DATES AND A STAND, NO VERDICT (rule D6): no colour on a row, no
 * „verspätet", no count of days. The dot is the rail's yellow where the
 * procedure still moves (today, a Beschluss before its Kundmachung) and ink
 * where it is fixed in a Gesetzblatt — the mark's one meaning, shared with
 * the draft's own timeline (`euDotOf`).
 *
 * The drafts that only restate the act — a Novelle repeating the whole
 * Umsetzungshinweis (rule D4) — follow apart under their own heading, in
 * the same rows (`EntryList`), without a lane in the chart.
 */
import type { EuActResponse } from '#shared/types'
import { euActCiteDe } from '#shared/utils/citations'
import { EU_PAGE_TITLE_DE, euActCelex } from '#shared/utils/eu'
import { todayIso } from '#shared/utils/format'
import { euActCredits, euActPageView } from '~/utils/euKarte'
import { euRailView } from '~/utils/euRail'

definePageMeta({
  // One address per act, as per draft (`/entwuerfe/[gp]/[inr]`): a kind in
  // capitals („/Richtlinie/", autocorrect) or a number with leading zeros
  // 301s to the canonical path, query and anchor along; anything that names
  // no act still 404s below.
  middleware: [
    (to) => {
      const kind = String(to.params.kind ?? '')
      const year = String(to.params.year ?? '')
      const number = String(to.params.number ?? '')
      const canonical = { kind: kind.toLowerCase(), number: number.replace(/^0+(?=\d)/, '') }
      if (!euActCelex(canonical.kind, year, canonical.number)) return
      if (kind !== canonical.kind || number !== canonical.number) {
        return navigateTo(
          { path: `/eu-recht/${canonical.kind}/${year}/${canonical.number}`, query: to.query, hash: to.hash },
          { redirectCode: 301 },
        )
      }
    },
  ],
})

const route = useRoute()
const celex = euActCelex(String(route.params.kind), String(route.params.year), String(route.params.number))
if (!celex) throw createError({ statusCode: 404, statusMessage: 'Rechtsakt nicht gefunden', fatal: true })

/* `lazy` (12.11.2026), as on the draft pages: a click shows this page at
 * once, in `FetchGate`'s loading state, instead of holding the previous one
 * until the answer is there. The server waits all the same, so the status
 * below is still set where the answer is known. */
const { data, status, error, refresh } = await useFetch<EuActResponse>(`/api/eu-recht/akte/${celex}`, { lazy: true })

const view = computed(() => (data.value ? euActPageView(data.value) : null))

/* The act's own rail and a section per station (15.11.2026), read from the
 * Cellar (`euRailView`). `today` only decides between „gilt ab" and „gilt
 * seit"; the Vienna day, so server and client agree.
 *
 * Every station has its section under the station's own name, as on a
 * draft's page, in the rail's order: the header card is the page's table
 * of contents. The last station's — „Umsetzung" or „Geltung" — is the
 * section of the drafts; the marked station leads there in one step. */
const rail = computed(() => (data.value ? euRailView(data.value, todayIso()) : null))
const effect = computed(() => rail.value?.sections.find((s) => s.id === 'wirkung') ?? null)
const earlierSections = computed(() => rail.value?.sections.filter((s) => s.id !== 'wirkung') ?? [])

/*
 * Two answers that are no failure to retry: an act no draft of the window
 * names (404), and a map not built yet (503). Each says what it is, in the
 * page, instead of the error card's „Erneut versuchen"; a crawler still
 * gets the status.
 */
const answer = computed<'unbekannt' | 'ungebaut' | null>(() => {
  const code = (error.value as { statusCode?: number } | null)?.statusCode
  return code === 404 ? 'unbekannt' : code === 503 ? 'ungebaut' : null
})
if (import.meta.server && answer.value) {
  const event = useRequestEvent()
  if (event) setResponseStatus(event, answer.value === 'unbekannt' ? 404 : 503)
}

usePageSeo({
  title: () => view.value?.title ?? 'EU-Rechtsakt',
  description: () => (view.value
    ? `${view.value.subject ? `${view.value.title} ${view.value.subject}` : view.value.title}: welche Entwürfe des Bundes und der Länder ${view.value.seoTail}.`
    : 'Welche Entwürfe des Bundes und der Länder einen Rechtsakt der Europäischen Union umsetzen oder durchführen.'),
})

/** The head as one line: „Beschlossen am 11.04.2024 · Umsetzungsfrist bis 07.05.2026¹". */
const headLine = computed(() => {
  const line = view.value?.head.join(' · ') ?? ''
  return line ? line[0]!.toUpperCase() + line.slice(1) : ''
})

/* The credit line, as on the overview (`/eu-recht`), plus where each stand
 * on the page comes from — only the ones a lane or row shows (`euActCredits`). */
const credits = computed(() => (data.value ? euActCredits(data.value) : null))

/* What „Zitieren" copies: the official title, the Amtsblatt reference, the
 * ELI (`euActCiteDe`) — the footnote of a Stellungnahme that argues from
 * the act, as on a draft's page (21.10.2026). */
const citation = computed(() => (data.value ? euActCiteDe(data.value.act, data.value.oj, data.value.eli) : ''))
</script>

<template>
  <div class="mx-auto w-full max-w-4xl">
    <template v-if="answer">
      <h1 class="page-title">
        {{ EU_PAGE_TITLE_DE }}
      </h1>
      <EmptyState
        class="mt-10"
        :title="answer === 'unbekannt' ? 'Zu diesem Rechtsakt kennt der Monitor keinen Entwurf.' : 'Gerade nicht abrufbar: Die Karte wird gerade erstellt.'"
        :description="answer === 'unbekannt' ? 'Kein Entwurf des Bundes oder der Länder im Fenster dieser Gesetzgebungsperiode nennt ihn.' : 'Sobald der Monitor die Entwürfe einmal gelesen hat, steht der Rechtsakt hier mit seinen Entwürfen.'"
      >
        <NuxtLink to="/eu-recht" class="link-quiet font-medium">Alle Rechtsakte</NuxtLink>
      </EmptyState>
    </template>
    <FetchGate
      v-else
      :status="status"
      :error="error"
      :data="view"
      loading-label="Rechtsakt wird geladen …"
      @retry="refresh()"
    >
      <template #default="{ data: page }">
        <BackLink to="/eu-recht" label="Alle Rechtsakte" />
        <!-- The detail pages' head (`DraftHeader`), as on a draft: the type
             word in the identity row, the record at its source beside it,
             then the title and what qualifies it. -->
        <DraftHeader :title="page.title">
          <template #source>
            <!-- The source link and the citation side by side, as on a
                 draft's page. -->
            <span class="inline-flex flex-wrap items-center gap-x-4">
              <ExternalLink :href="page.eurLexUrl" class="link-inline tap-target">Auf EUR-Lex ansehen</ExternalLink>
              <CiteButton :text="citation" subject="Den Rechtsakt" />
            </span>
          </template>
          <template #identity>
            <span class="text-sm font-medium text-ink-muted">Rechtsakt der Europäischen Union</span>
          </template>
          <!-- What the official title says after the name and date: the act's
               subject, which the citation alone does not tell — where a
               draft's page sets its long title. -->
          <p v-if="page.subject" class="mt-1 text-sm text-ink-secondary">
            {{ page.subject }}
          </p>
          <p class="mt-2 text-sm text-ink-secondary">
            {{ headLine }}
          </p>
          <p v-if="page.footnote" class="mt-1 text-xs text-ink-muted">
            {{ page.footnote }}.
          </p>
        </DraftHeader>

        <!-- The act's rail, in the card the national rail opens a draft's
             page with (`ProcedureCard`): the stations of the act's life, the
             last one marked — an adopted act is there. -->
        <div v-if="rail" class="mt-6">
          <div class="rounded-xl border border-hairline bg-surface p-4">
            <h2 class="font-sans text-base font-semibold text-ink">
              {{ rail.status ?? rail.heading }}
            </h2>
            <p v-if="rail.note" class="mt-1 text-sm text-ink-secondary">
              {{ rail.note }}
            </p>
            <EuRail class="mt-4" :stations="rail.stations" :label="rail.heading" />
          </div>
        </div>

        <!-- A section per station, in the rail's order and under the
             station's name, each in the draft pages' grammar
             (`EuStationSection`). The last one — „Umsetzung" or „Geltung" —
             holds the drafts. Where the Cellar's answer is missing the rail
             is still there, so are the sections. -->
        <template v-if="rail">
          <EuStationSection v-for="sec in earlierSections" :key="sec.id" :section="sec" :citation="citation" />
          <EuStationSection v-if="effect" :section="effect">
            <!-- The drafts first among what the section holds: the timeline
                 as one chart (`EuTimelineChart`), the drafts side by side
                 against the one deadline, then the drafts as every list of
                 drafts shows them (`EntryList`). -->
            <PageSubsection :heading="page.implementingHeading">
              <EuTimelineChart v-if="page.chart" :chart="page.chart" />
              <EntryList v-if="page.entries.length" :entries="page.entries" :class="page.chart ? 'mt-6' : ''">
                <!-- What could not be read, in the box's head — where the
                     overview and `/entwuerfe` say it, above the rows it
                     concerns. -->
                <template v-if="page.incomplete" #header>
                  <p class="text-sm text-ink-muted">
                    {{ page.incomplete }}
                  </p>
                </template>
                <!-- The dates the chart draws, said with the row: the lanes are
                     hidden from a screen reader, which hears each draft once. -->
                <template #evidence="{ entry }">
                  <span v-if="page.said[entry.key]" class="sr-only">{{ page.said[entry.key] }}</span>
                </template>
              </EntryList>
              <p v-if="!page.entries.length && page.incomplete" class="text-sm text-ink-muted">
                {{ page.incomplete }}
              </p>
              <p v-if="!page.entries.length" class="text-ink-secondary" :class="page.incomplete ? 'mt-4' : ''">
                {{ page.noneImplementing }}
              </p>
              <!-- The credit line of the drafts' list, under it. -->
              <SectionCredits v-if="credits" :sources="[]" :marked="false">
                <span>Quellen:</span>
                <span v-for="item in credits.items" :key="item">{{ item }}</span>
                <template #method>
                  <MethodEuRecht />
                </template>
              </SectionCredits>
            </PageSubsection>

            <!-- The same rows as above and on every list (`EntryList`), apart
                 under their heading and without a lane in the chart. -->
            <PageSubsection v-if="page.restating.length" heading="Weitere Entwürfe, die den Akt im geltenden Umsetzungshinweis nennen">
              <EntryList :entries="page.restating" />
            </PageSubsection>
          </EuStationSection>
        </template>
      </template>
    </FetchGate>
  </div>
</template>
