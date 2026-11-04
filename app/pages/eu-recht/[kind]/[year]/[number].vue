<script setup lang="ts">
/**
 * One EU act and every draft of the window that names it, Bund and Länder
 * (docs/architecture.md §12.66, Nachtrag 3) — `/eu-recht/richtlinie/2024/1069`,
 * the act's kind, year and number as its citation reads (`euActCelex`).
 *
 * THE ROWS FIRST. The section opens with the drafts that implement the act
 * — no text above the list; what the list cannot say (the window, the
 * Länder without a draft, what could not be read) stands under it. Each
 * row is its text on the left — who, which draft, its Begutachtung and
 * stand — and from `md` up its bar on the right, ALL ON ONE TRACK, so the
 * rows compare by eye; the labels stand once, under the last row
 * (`EuScaleAxis`). Below `md` the bar stands under its text.
 *
 * TWO DATES AND A STAND, NO VERDICT (rule D6): no colour on a row, no
 * „verspätet", no count of days. The dot is the rail's yellow where the
 * procedure still moves (today, a Beschluss before its Kundmachung) and ink
 * where it is fixed in a Gesetzblatt — the mark's one meaning.
 *
 * The drafts that only restate the act — a Novelle repeating the whole
 * Umsetzungshinweis (rule D4) — follow apart and muted, without a bar.
 */
import type { EuActResponse } from '#shared/types'
import { euActCelex } from '#shared/utils/eu'
import { eurLexSource, risSource, sourceItemsDe } from '#shared/utils/provenance'
import { euActPageView } from '~/utils/euKarte'

const route = useRoute()
const celex = euActCelex(String(route.params.kind), String(route.params.year), String(route.params.number))
if (!celex) throw createError({ statusCode: 404, statusMessage: 'Rechtsakt nicht gefunden', fatal: true })

const { data, status, error, refresh } = await useFetch<EuActResponse>(`/api/eu-recht/akte/${celex}`)

const view = computed(() => (data.value ? euActPageView(data.value) : null))

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
    ? `${view.value.title}: welche Entwürfe des Bundes und der Länder den Rechtsakt umsetzen, mit ihrer Begutachtung neben der Umsetzungsfrist.`
    : 'Welche Entwürfe des Bundes und der Länder einen Rechtsakt der Europäischen Union umsetzen.'),
})

/** The head as one line: „Beschlossen am 11.04.2024 · Umsetzungsfrist bis 07.05.2026¹". */
const headLine = computed(() => {
  const line = view.value?.head.join(' · ') ?? ''
  return line ? line[0]!.toUpperCase() + line.slice(1) : ''
})

/** „Heute" fits over its dot anywhere; a Gesetzblatt's name takes the edge rule (`DraftEuTimeline`). */
const valueAlign = (label: string) => (label.length <= 6 ? 'center' as const : 'auto' as const)
/** Yellow while the procedure still moves, ink once a Gesetzblatt fixed it. */
const dotOf = (label: string) => (label.endsWith('gesetzblatt') ? 'ink' as const : 'mark' as const)

/* The credit line, as on the overview (`/eu-recht`). */
const [bundItem, eurLexItem] = sourceItemsDe([risSource('Vorblatt'), risSource('Gesetzestext'), eurLexSource('Fristen')])
</script>

<template>
  <div class="mx-auto w-full max-w-4xl">
    <template v-if="answer">
      <h1 class="page-title">
        EU-Recht in der Begutachtung
      </h1>
      <EmptyState
        class="mt-10"
        :title="answer === 'unbekannt' ? 'Zu diesem Rechtsakt kennt der Monitor keinen Entwurf.' : 'Die Karte ist gerade nicht gebaut.'"
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
        <header>
          <p class="text-sm text-ink-muted">
            <NuxtLink to="/eu-recht" class="link-muted">EU-Recht in der Begutachtung</NuxtLink>
          </p>
          <h1 class="page-title mt-1">
            {{ page.title }}
          </h1>
          <p class="mt-3 text-ink-secondary">
            {{ headLine }}
          </p>
          <p v-if="page.footnote" class="mt-1 text-xs text-ink-muted">
            {{ page.footnote }}.
          </p>
          <p class="mt-2 text-sm">
            <ExternalLink :href="page.eurLexUrl" class="link-quiet font-medium">Auf EUR-Lex ansehen</ExternalLink>
          </p>
        </header>

        <section aria-labelledby="eu-umsetzung-heading" class="page-section">
          <h2 id="eu-umsetzung-heading" class="section-heading">{{ page.implementingHeading }}</h2>
          <!-- The rows, then the axis once under the last — in the unfilled
               frame: rows to consult, side by side on one scale. -->
          <div v-if="page.rows.length" class="mt-4 rounded-xl border border-hairline">
            <ul role="list" class="divide-y divide-hairline">
              <li
                v-for="row in page.rows"
                :key="row.key"
                class="grid gap-x-6 gap-y-1 px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-center"
              >
                <div class="min-w-0">
                  <p class="text-sm">
                    <strong class="font-semibold text-ink">{{ row.publisher }}</strong>
                  </p>
                  <NuxtLink :to="row.path" class="link-quiet font-medium">{{ row.title }}</NuxtLink>
                  <p class="mt-0.5 text-sm text-ink-secondary">
                    {{ row.kennung }}
                  </p>
                </div>
                <div v-if="row.bar" class="min-w-0" aria-hidden="true">
                  <!-- Decoration beside the row's text, which says the same dates in words. -->
                  <ScaleBar
                    :value="row.bar.value"
                    :value-label="row.bar.valueLabel"
                    :value-align="valueAlign(row.bar.valueLabel)"
                    :band="row.bar.band"
                    :from="row.bar.from"
                    :marks="row.bar.marks"
                    :labels="false"
                    :dot="dotOf(row.bar.valueLabel)"
                  />
                </div>
              </li>
            </ul>
            <div v-if="page.axis.length" class="grid gap-x-6 border-t border-hairline px-4 pb-1 pt-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div class="hidden md:block" />
              <EuScaleAxis :marks="page.axis" />
            </div>
          </div>
          <p v-else class="mt-4 text-ink-secondary">
            Kein Entwurf im Fenster setzt den Rechtsakt neu um; die Entwürfe unten
            nennen ihn, weil das geltende Recht ihn schon umsetzt.
          </p>

          <template v-if="page.restating.length">
            <PageSubsection heading="Weitere Entwürfe, die den Akt im geltenden Umsetzungshinweis nennen" class="mt-8">
              <ul role="list" class="space-y-1 text-sm text-ink-muted">
                <li v-for="row in page.restating" :key="row.key">
                  {{ row.publisher }} · <NuxtLink :to="row.path" class="link-quiet">{{ row.title }}</NuxtLink>
                </li>
              </ul>
            </PageSubsection>
          </template>

          <!-- What the list cannot say, under it: who has no draft, what
               the window is, what could not be read. -->
          <div class="mt-6 space-y-2 text-sm text-ink-muted">
            <p v-if="page.landsWithout">
              {{ page.landsWithout }}
            </p>
            <p>{{ page.window }}</p>
            <p v-if="page.incomplete">
              {{ page.incomplete }}
            </p>
          </div>

          <SectionCredits :sources="[]" :marked="false" method="/so-funktionierts#eu-recht">
            <span>Quellen:</span>
            <span>{{ bundItem }}</span>
            <span>Dokumente der Länder</span>
            <span>{{ eurLexItem }}</span>
          </SectionCredits>
        </section>
      </template>
    </FetchGate>
  </div>
</template>
