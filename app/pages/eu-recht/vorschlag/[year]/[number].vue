<script setup lang="ts">
/**
 * One proposal of the Commission that left the Commission —
 * `/eu-recht/vorschlag/2026/780`, by its COM number (step 3 of the EU
 * cycle, 15.11.2026): its procedure as far as the Cellar records it, and
 * the consultation behind it from the Commission's portal.
 *
 * THE INITIATIVE PAGE'S GRAMMAR: the detail pages' head (`DraftHeader`),
 * the card whose heading states the stand, with the rail (`EuRail`), then
 * a section per station in the rail's order (`EuStationSection`). Every
 * word comes from `euVorschlagView`.
 *
 * ONE BLUE ELEMENT. While the portal holds an open feedback period on this
 * proposal, the card carries the way to it (`EuWindowAction`), as an
 * initiative's page does.
 *
 * THE STRONGER ADDRESS WINS. Where the Cellar's dossier names exactly one
 * act the proposal produced and the monitor has that act's page, this
 * address answers 301 there (`EuVorschlagResponse.redirect`); with several
 * acts the page stays and links each.
 */
import type { EuVorschlagResponse } from '#shared/types'
import { EU_PAGE_TITLE_DE, EU_PROPOSAL_PATH_WORD, euPath, euProposalAddress } from '#shared/utils/eu'
import { todayIso } from '#shared/utils/format'
import { EU_VORSCHLAG_DE as DE, euVorschlagView } from '~/utils/euVorschlag'

definePageMeta({
  // One address per proposal: a number with leading zeros („0780", as the
  // CELEX writes it) 301s to the plain one; anything else still 404s below.
  middleware: [
    (to) => {
      const year = String(to.params.year ?? '')
      const raw = String(to.params.number ?? '')
      const plain = raw.replace(/^0+(?=\d)/, '')
      if (raw !== plain && euProposalAddress(year, plain, todayIso()) !== null) {
        return navigateTo({ path: euPath(EU_PROPOSAL_PATH_WORD, year, plain), query: to.query, hash: to.hash }, { redirectCode: 301 })
      }
    },
  ],
})

const route = useRoute()
const address = euProposalAddress(String(route.params.year), String(route.params.number), todayIso())
if (!address) throw createError({ statusCode: 404, statusMessage: 'Vorschlag nicht gefunden', fatal: true })
const reference = `COM(${address.year}) ${address.number}`

const { data, status, error, refresh } = await useFetch<EuVorschlagResponse>(`/api/eu-recht/vorschlag/${address.year}/${address.number}`, { lazy: true })

/* The proposal became exactly one act the monitor has a page for: that page
 * is the stronger address. On the server the answer is there before the
 * page renders; on a click it arrives later, and the watcher follows. */
if (data.value?.redirect) await navigateTo(data.value.redirect, { redirectCode: 301 })
watch(() => data.value?.redirect, (to) => {
  if (to) navigateTo(to, { replace: true })
})

/* `today` decides whether the feedback period is still open; the Vienna day, so server and client agree. */
const view = computed(() => (data.value && !data.value.redirect ? euVorschlagView(data.value, todayIso()) : null))

/* The Cellar proved there is no such number (404): said in the page, not as an error to retry; a crawler still gets the status. */
const unknown = computed(() => (error.value as { statusCode?: number } | null)?.statusCode === 404)
if (import.meta.server && unknown.value) {
  const event = useRequestEvent()
  if (event) setResponseStatus(event, 404)
}

usePageSeo({
  title: () => view.value?.title ?? DE.seo.fallbackTitle,
  description: () => (view.value ? DE.seo.description(reference, view.value.status) : DE.seo.fallbackDescription),
})

const back = euPath()
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
      :data="view"
      :loading-label="DE.loading"
      @retry="refresh()"
    >
      <template #default="{ data: page }">
        <BackLink :to="back" :label="DE.back" />
        <DraftHeader :title="page.title">
          <template #source>
            <ExternalLink :href="page.eurLexUrl" class="link-inline tap-target">{{ DE.source }}</ExternalLink>
          </template>
          <template #identity>
            <span class="text-sm font-medium text-ink-muted">{{ page.identity }}</span>
          </template>
          <p v-if="page.titleNote" class="mt-1 text-sm text-ink-muted">
            {{ page.titleNote }}
          </p>
        </DraftHeader>

        <!-- The card the act page opens with: the stand, the one action
             while a feedback period is open, the rail. -->
        <div class="mt-6 rounded-xl border border-hairline bg-surface p-4">
          <h2 class="font-sans text-base font-semibold text-ink">
            {{ page.status }}
          </h2>
          <GapNote v-if="page.statusNote" :text="page.statusNote" class="mt-1 text-sm text-ink-secondary" />
          <EuWindowAction v-if="page.action" :action="page.action" />
          <EuRail class="mt-4" :stations="page.stations" :label="page.heading" />
        </div>

        <EuStationSection v-for="sec in page.sections" :key="sec.id" :section="sec" />
      </template>
    </FetchGate>
  </div>
</template>
