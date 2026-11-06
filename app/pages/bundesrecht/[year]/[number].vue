<script setup lang="ts">
/**
 * One Grundsatzgesetz by its Kundmachung — `/bundesrecht/2025/44` — and the
 * Land drafts of the window that carry it out (docs/architecture.md
 * §12.67). The EU act page's anatomy (`/eu-recht/<kind>/<year>/<number>`):
 * the detail pages' head, then the drafts — one chart with the Kundmachung
 * as the mark over the lanes (`EuTimelineChart`), then the drafts as the
 * lists' rows (`EntryList`).
 *
 * THE FRIST IN THE ACT'S OWN WORDS (rule D6): „Die Ausführungsgesetze der
 * Länder sind binnen eines Jahres zu erlassen." quoted, never a computed
 * date, a countdown, „überfällig" or a day count — the clause counts from a
 * day the act sets itself, and a Land's draft may be a second step.
 * Counts are drafts, never Länder.
 *
 * NO OVERVIEW, NO NAV ENTRY: about five Grundsatzgesetze a year — an index
 * would look empty. The pages are reached from the Land drafts' fact and
 * from the Ministerialentwurf's line.
 */
import type { BundLandActResponse } from '#shared/types'
import { bundLandActPageView } from '~/utils/bundesrecht'

definePageMeta({
  validate: (route) => /^(?:19|20)\d{2}$/.test(String(route.params.year ?? '')) && /^[1-9]\d{0,3}$/.test(String(route.params.number ?? '')),
})

const route = useRoute()
const { data, status, error, refresh } = await useFetch<BundLandActResponse>(`/api/bundesrecht/${route.params.year}/${route.params.number}`)
const view = computed(() => (data.value ? bundLandActPageView(data.value) : null))

/* An act the map does not hold (404) and a map not built yet (503) are no
 * failure to retry — each is said in the page, as on the EU act page. */
const answer = computed<'unbekannt' | 'ungebaut' | null>(() => {
  const code = (error.value as { statusCode?: number } | null)?.statusCode
  return code === 404 ? 'unbekannt' : code === 503 ? 'ungebaut' : null
})
if (import.meta.server && answer.value) {
  const event = useRequestEvent()
  if (event) setResponseStatus(event, answer.value === 'unbekannt' ? 404 : 503)
}

usePageSeo({
  title: () => view.value?.title ?? 'Grundsatzgesetz',
  description: () => (view.value
    ? `${view.value.title}${view.value.subject ? ` – ${view.value.subject}` : ''}: welche Entwürfe der Länder das Grundsatzgesetz ausführen.`
    : 'Welche Entwürfe der Länder ein Grundsatzgesetz des Bundes ausführen.'),
})

const citation = computed(() => (view.value ? `${view.value.subject ? `${view.value.subject}, ` : ''}${view.value.title}` : ''))
</script>

<template>
  <div class="mx-auto w-full max-w-4xl">
    <template v-if="answer">
      <h1 class="page-title">
        Grundsatzgesetz des Bundes
      </h1>
      <EmptyState
        class="mt-10"
        :title="answer === 'unbekannt' ? 'Unter dieser Nummer kennt der Monitor kein Grundsatzgesetz.' : 'Die Übersicht ist gerade nicht gebaut.'"
        :description="answer === 'unbekannt' ? 'Weder ein Entwurf der Länder im Fenster dieser Gesetzgebungsperiode noch die Suche im Bundesgesetzblatt nennt es.' : 'Sobald der Monitor die Entwürfe der Länder einmal gelesen hat, steht das Gesetz hier mit seinen Entwürfen.'"
      >
        <NuxtLink to="/entwuerfe" class="link-quiet font-medium">Alle Entwürfe</NuxtLink>
      </EmptyState>
    </template>
    <FetchGate
      v-else
      :status="status"
      :error="error"
      :data="view"
      loading-label="Grundsatzgesetz wird geladen …"
      @retry="refresh()"
    >
      <template #default="{ data: page }">
        <BackLink to="/entwuerfe" label="Alle Entwürfe" />
        <DraftHeader :title="page.title">
          <template #source>
            <span class="inline-flex flex-wrap items-center gap-x-4">
              <ExternalLink :href="page.risUrl" class="link-inline tap-target">Im RIS ansehen</ExternalLink>
              <CiteButton :text="citation" subject="Das Gesetz" />
            </span>
          </template>
          <template #identity>
            <span class="text-sm font-medium text-ink-muted">Grundsatzgesetz des Bundes</span>
          </template>
          <p v-if="page.subject" class="mt-1 text-sm text-ink-secondary">
            {{ page.subject }}
          </p>
          <p class="mt-2 text-sm text-ink-secondary">
            <template v-if="page.kundmachung">{{ page.kundmachung }}</template><template v-if="page.vorlage"><template v-if="page.kundmachung"> · </template>Vorlage {{ page.vorlage }}</template><template v-if="page.me"> · Ministerialentwurf <NuxtLink :to="page.me.path" class="link-inline">{{ page.me.citation }}</NuxtLink></template>
          </p>
          <!-- The Frist as the act sets it, in its own words (D6). -->
          <p v-if="page.fristClause" class="mt-2 text-sm text-ink-secondary">
            Laut Grundsatzgesetz: „{{ page.fristClause.replace(/\.$/, '') }}“.
          </p>
        </DraftHeader>

        <section aria-labelledby="bund-land-heading" class="page-section">
          <h2 id="bund-land-heading" class="section-heading">Entwürfe der Länder, die es ausführen</h2>
          <p v-if="page.count" class="mt-2 text-sm text-ink-secondary">{{ page.count }}</p>
          <EuTimelineChart v-if="page.chart" :chart="page.chart" class="mt-4" />
          <EntryList v-if="page.entries.length" :entries="page.entries" class="mt-6">
            <template v-if="page.incomplete" #header>
              <p class="text-sm text-ink-muted">{{ page.incomplete }}</p>
            </template>
            <template #evidence="{ entry }">
              <span v-if="page.partial[entry.key]" class="text-sm text-ink-muted">{{ page.partial[entry.key] }}</span>
              <span v-if="page.said[entry.key]" class="sr-only">{{ page.said[entry.key] }}</span>
            </template>
          </EntryList>
          <template v-else>
            <p v-if="page.incomplete" class="mt-4 text-sm text-ink-muted">{{ page.incomplete }}</p>
            <p class="mt-4 text-ink-secondary">
              Noch kein Entwurf der Länder im Fenster führt es aus.
            </p>
          </template>

          <SectionCredits :sources="[]" :marked="false" method="/so-funktionierts#bund-land">
            <span>Quellen:</span>
            <span>Bundesgesetzblatt (RIS)</span>
            <span v-if="page.entries.length">Dokumente der Länder</span>
          </SectionCredits>
        </section>
      </template>
    </FetchGate>
  </div>
</template>
