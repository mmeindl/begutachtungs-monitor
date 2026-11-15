<script setup lang="ts">
/**
 * One European Citizens' Initiative — `/eu-recht/buergerinitiative/2022/2`,
 * by its register number ECI(2022)000002 (step 5 of the EU cycle,
 * 15.11.2026). An object of its own with a rail of its own (decision 4 of
 * the plan): no field of the register joins it to a legal act.
 *
 * THE SIBLINGS' GRAMMAR: the detail pages' head (`DraftHeader`), the card
 * whose heading names the state, with the rail (`EuRail`), then a section
 * per reached station (`EuStationSection`). Every word comes from
 * `euBuergerinitiativeView`.
 *
 * ONE BLUE ELEMENT. While the collection runs, a door card under the header
 * card leads to where one signs (`EuWindowAction`, shared with the
 * Commission's initiatives and proposals), counting the days and taking the
 * draft door's tone.
 *
 * Nothing about a person: the page shows only what `parseEciDetails`'s
 * fixed list of fields lets through — no organiser, no funder, no logo, none
 * of the organisers' texts.
 */
import type { EuBuergerinitiativeResponse } from '#shared/types'
import { EU_CITIZENS_INITIATIVE_PATH_WORD, EU_PAGE_TITLE_DE, euCitizensInitiativeAddress, euCitizensInitiativeReference, euPath } from '#shared/utils/eu'
import { todayIso } from '#shared/utils/format'
import { EU_BUERGERINITIATIVE_DE as DE, euBuergerinitiativeView } from '~/utils/euBuergerinitiative'

definePageMeta({
  // One address per initiative: a number with leading zeros („000002", as
  // the register writes it) 301s to the plain one; anything else still
  // 404s below.
  middleware: [
    (to) => {
      const year = String(to.params.year ?? '')
      const raw = String(to.params.number ?? '')
      const plain = raw.replace(/^0+(?=\d)/, '')
      if (raw !== plain && euCitizensInitiativeAddress(year, plain, todayIso()) !== null) {
        return navigateTo({ path: euPath(EU_CITIZENS_INITIATIVE_PATH_WORD, year, plain), query: to.query, hash: to.hash }, { redirectCode: 301 })
      }
    },
  ],
})

const route = useRoute()
const address = euCitizensInitiativeAddress(String(route.params.year), String(route.params.number), todayIso())
if (!address) throw createError({ statusCode: 404, statusMessage: 'Bürgerinitiative nicht gefunden', fatal: true })
const reference = euCitizensInitiativeReference(address.year, address.number)

const { data, status, error, refresh } = await useFetch<EuBuergerinitiativeResponse>(`/api/eu-recht/buergerinitiative/${address.year}/${address.number}`, { lazy: true })

/* `today` decides whether the collection still runs; the Vienna day, so server and client agree. */
const view = computed(() => (data.value?.state === 'gefunden' ? euBuergerinitiativeView(data.value.initiative, todayIso()) : null))

/* The register proved there is no such number (404): said in the page, not as an error to retry; a crawler still gets the status. */
const unknown = computed(() => (error.value as { statusCode?: number } | null)?.statusCode === 404)
if (import.meta.server && unknown.value) {
  const event = useRequestEvent()
  if (event) setResponseStatus(event, 404)
}

usePageSeo({
  title: () => view.value?.title ?? DE.seo.fallbackTitle,
  description: () => (view.value ? DE.seo.description(reference, view.value.status) : DE.seo.fallbackDescription),
})

const back = `${euPath()}#eu-buergerinitiativen`
</script>

<template>
  <div class="mx-auto w-full max-w-4xl">
    <template v-if="unknown">
      <h1 class="page-title">
        {{ EU_PAGE_TITLE_DE }}
      </h1>
      <EmptyState class="mt-10" :title="DE.unknown(reference)" :description="DE.unknownDescription">
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
            {{ DE.untitled(answer.reference) }}
          </h1>
          <GapNote kind="unavailable" class="mt-6 text-ink-secondary" role="status">
            {{ DE.unread }}
            <ExternalLink :href="answer.url" class="link-inline">{{ DE.unreadLink }}</ExternalLink>
          </GapNote>
        </template>
        <template v-else-if="view">
          <DraftHeader :title="view.title">
            <template #source>
              <!-- The register's page of the initiative (`eciPageUrl`). -->
              <ExternalLink :href="view.registerUrl" class="link-inline tap-target">{{ DE.source }}</ExternalLink>
            </template>
            <template #identity>
              <span class="text-sm font-medium text-ink-muted">{{ view.identity }}</span>
            </template>
            <p v-if="view.titleNote" class="mt-1 text-sm text-ink-muted">
              {{ view.titleNote }}
            </p>
          </DraftHeader>

          <!-- The card the act page opens with: the state, and the rail. -->
          <EuProcedureCard :status="view.status" :stations="view.stations" :label="view.heading">
            <GapNote v-if="view.unknownSteps" :text="view.unknownSteps" class="mt-3 text-sm text-ink-secondary" />
          </EuProcedureCard>

          <!-- The door: under the header card, where a draft's page has it. -->
          <EuWindowAction v-if="view.action" :action="view.action" />

          <EuStationSection v-for="sec in view.sections" :key="sec.id" :section="sec" />
        </template>
      </template>
    </FetchGate>
  </div>
</template>
