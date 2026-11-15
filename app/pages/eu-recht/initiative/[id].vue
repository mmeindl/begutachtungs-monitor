<script setup lang="ts">
/**
 * One initiative of the Commission's portal „Ihre Meinung zählt" —
 * `/eu-recht/initiative/13192`, by the portal's own number (step 3 of the
 * EU cycle, 15.11.2026). An open window of the list on `/eu-recht`, or one
 * that closed: a closed window stays a page, with what was open, until
 * when, and how many contributions the portal counts.
 *
 * THE DETAIL PAGES' GRAMMAR (`docs/decisions.md`, „The detail pages"): the
 * head (`DraftHeader`), the state card of every detail page
 * (`ProcedureCard`) with the EU rail in it (`EuRail`), then a section per
 * reached station in the rail's order (`EuStationSection`). Every word
 * comes from `euInitiativeView`.
 *
 * THE DOOR STANDS TWICE. While a window is open, a draft's door card under
 * the state card leads to the portal's page of the initiative, where the
 * contribution is made (`EuWindowAction`, shared with a proposal's page);
 * the same door stands once more at the end of the section that holds the
 * window (`EuRailSection.door`).
 *
 * Nothing about a person: the page shows only what `parseInitiative`'s
 * fixed list of fields lets through, never an official's name or address.
 */
import type { EuInitiativeResponse } from '#shared/types'
import { EU_PAGE_TITLE_DE, euInitiativeId, euPath } from '#shared/utils/eu'
import { todayIso } from '#shared/utils/format'
import { EU_INITIATIVE_DE as DE, euInitiativeView } from '~/utils/euInitiative'

definePageMeta({
  // One address per initiative: a number with leading zeros 301s to the
  // plain one; anything that is no number still 404s below.
  middleware: [
    (to) => {
      const raw = String(to.params.id ?? '')
      const plain = raw.replace(/^0+(?=\d)/, '')
      if (raw !== plain && euInitiativeId(plain) !== null) {
        return navigateTo({ path: euPath('initiative', plain), query: to.query, hash: to.hash }, { redirectCode: 301 })
      }
    },
  ],
})

const route = useRoute()
const id = euInitiativeId(String(route.params.id))
if (id === null) throw createError({ statusCode: 404, statusMessage: 'Vorhaben nicht gefunden', fatal: true })

const { data, status, error, refresh } = await useFetch<EuInitiativeResponse>(`/api/eu-recht/initiative/${id}`, { lazy: true })

/* `today` decides whether a window is still open; the Vienna day, so server and client agree. */
const view = computed(() => (data.value?.state === 'gefunden' ? euInitiativeView(data.value.initiative, todayIso()) : null))

/* The portal proved there is no such number (404): said in the page, not as an error to retry; a crawler still gets the status. */
const unknown = computed(() => (error.value as { statusCode?: number } | null)?.statusCode === 404)
if (import.meta.server && unknown.value) {
  const event = useRequestEvent()
  if (event) setResponseStatus(event, 404)
}

usePageSeo({
  title: () => view.value?.title ?? DE.seo.fallbackTitle,
  description: () => (view.value ? DE.seo.description(view.value.status) : DE.seo.fallbackDescription),
})

const back = `${euPath()}#eu-fenster`
</script>

<template>
  <div class="mx-auto w-full max-w-4xl">
    <template v-if="unknown">
      <h1 class="page-title">
        {{ EU_PAGE_TITLE_DE }}
      </h1>
      <EmptyState class="mt-10" :title="DE.unknown(id!)" :description="DE.unknownDescription">
        <NuxtLink :to="back" class="link-quiet font-medium">{{ DE.back }}</NuxtLink>
      </EmptyState>
    </template>
    <FetchGate
      v-else
      :status="status"
      :error="error"
      :data="data"
      :loading-label="DE.loading"
      @retry="refresh()"
    >
      <template #default="{ data: answer }">
        <BackLink :to="back" :label="DE.back" />
        <template v-if="answer.state === 'ungelesen'">
          <h1 class="page-title mt-4">
            {{ DE.untitled(answer.id) }}
          </h1>
          <GapNote kind="unavailable" class="mt-6 text-ink-secondary" role="status">
            {{ DE.unread }}
            <ExternalLink :href="answer.url" class="link-inline">{{ DE.unreadLink }}</ExternalLink>
          </GapNote>
        </template>
        <template v-else-if="view">
          <DraftHeader :title="view.title">
            <template #source>
              <ExternalLink :href="view.url" class="link-inline tap-target">{{ DE.source }}</ExternalLink>
            </template>
            <template #identity>
              <span class="text-sm font-medium text-ink-muted">{{ DE.identity }}</span>
            </template>
            <p v-if="view.titleNote" class="mt-1 text-sm text-ink-muted">
              {{ view.titleNote }}
            </p>
            <p v-if="view.actType" class="mt-2 text-sm text-ink-secondary">
              {{ view.actType }}
            </p>
          </DraftHeader>

          <!-- The state card of every detail page, with the EU rail. -->
          <ProcedureCard :status="view.status">
            <template #rail>
              <EuRail class="mt-4" :stations="view.stations" :label="view.heading" />
            </template>
          </ProcedureCard>

          <!-- The door: under the state card, where a draft's page has it. -->
          <EuWindowAction v-if="view.action" :action="view.action" />

          <EuStationSection v-for="sec in view.sections" :key="sec.id" :section="sec" />
        </template>
      </template>
    </FetchGate>
  </div>
</template>
