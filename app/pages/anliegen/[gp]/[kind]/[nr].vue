<script setup lang="ts">
import type { AnliegenDetail, RvStatementsResponse } from '#shared/types'
import { anliegenApiBase, anliegenKindOfSegment, anliegenRootOf } from '#shared/utils/anliegen'
import { ANLIEGEN_BACK_DE, ANLIEGEN_LIST_DE, ANLIEGEN_PAGE_DE, anliegenLoadingLabelDe, anliegenView } from '~/utils/anliegenView'
import { NOT_FOLLOWED_DE, notFollowedOf, type NotFollowed } from '~/utils/notFollowed'

/**
 * The page of one Anliegen an das Parlament — a Petition
 * (`/anliegen/<GP>/petition/<nr>`), a parlamentarische Bürgerinitiative
 * (`…/buergerinitiative/<nr>`), a Volksbegehren (`…/volksbegehren/<nr>`,
 * its d.B. number), or a Petition an den Bundesrat
 * (`/anliegen/BR/petition-bundesrat/<nr>`: the Bundesrat has no period). Step 2 of
 * `docs/research/umsetzungsplan-petitionen-volksbegehren.md`.
 *
 * A DIFFERENT OBJECT FROM A DRAFT: no law has to result and none of the
 * three walks the five stations, so the page has a rail of its own
 * (`AnliegenRail`) and borrows the draft page's grammar, not its components
 * where those take a draft's types. Its order: header, the rail under the
 * one-line state, the door while the item's own flag is open, the counts,
 * the Stellungnahmen, the documents, and what the page cannot show.
 *
 * Every word comes from `anliegenView` (`app/utils/anliegenView.ts`), so a
 * second language replaces that module, not this template.
 */
definePageMeta({
  // One address per item, as on the item page of a Vorlage: lowercased,
  // uppercased or zero-padded links 301 to the canonical one.
  middleware: [
    (to) => {
      const gpParam = String(to.params.gp ?? '')
      const kindParam = String(to.params.kind ?? '')
      const nrParam = String(to.params.nr ?? '')
      const root = anliegenRootOf(gpParam.toUpperCase(), kindParam.toLowerCase(), nrParam)
      if (!root) return
      if (gpParam !== root.gp || kindParam !== root.kind || nrParam !== String(root.inr)) {
        return navigateTo({ path: `/anliegen/${root.gp}/${root.kind}/${root.inr}`, query: to.query, hash: to.hash }, { redirectCode: 301 })
      }
    },
  ],
  validate: (route) =>
    anliegenRootOf(String(route.params.gp ?? '').toUpperCase(), String(route.params.kind ?? '').toLowerCase(), String(route.params.nr ?? '')) !== null,
})

const route = useRoute()
const root = computed(() => anliegenRootOf(String(route.params.gp ?? ''), String(route.params.kind ?? ''), String(route.params.nr ?? '')))
const url = computed(() => (root.value ? anliegenApiBase(root.value) : ''))
const loadingLabel = computed(() => anliegenLoadingLabelDe(anliegenKindOfSegment(String(route.params.kind ?? ''))))

const { data, error, refresh, status } = await useFetch<AnliegenDetail>(url, { lazy: true })

/* A 404 is one of two things, as on the page of a Vorlage: Parliament has no
 * such item, or the record is another item (a Beilage that is no
 * Volksbegehren) — then the refusal carries the item's page at Parliament. */
const notFound = (refusal: NotFollowed | null) => createError({
  statusCode: 404,
  statusMessage: refusal ? NOT_FOLLOWED_DE.title : 'Gegenstand nicht gefunden',
  data: refusal ?? undefined,
  fatal: true,
})
if (error.value?.statusCode === 404 || error.value?.statusCode === 400) {
  throw notFound(notFollowedOf(error.value))
}
watch(error, (e) => {
  if (e?.statusCode !== 404 && e?.statusCode !== 400) return
  showError(notFound(notFollowedOf(e)))
})

const view = computed(() => (data.value ? anliegenView(data.value) : null))

/* The Stellungnahmen — client-side and lazy, as on the page of a Vorlage:
 * list 142 must not sit in the SSR path. Registered here only, where it is
 * read, so no other call site shares its options. */
const { data: statements, error: statementsError } = await useFetch<RvStatementsResponse>(() => `${url.value}/stellungnahmen`, {
  lazy: true,
  server: false,
  enabled: computed(() => Boolean(root.value)),
})
/* Shown where it says something the counts above do not: rows, or an open
 * window with none yet. A closed item with none has „Stellungnahmen: 0"
 * above, and whether one was ever possible is not read (`CLOSED_BOTH`). */
const statementsShown = computed(() => {
  if (statementsError.value) return true
  const s = statements.value
  if (!s) return false
  return s.total > 0 || data.value?.participation.statements === 'open'
})

useSeoMeta({
  title: () => view.value?.seo.title ?? loadingLabel.value,
  description: () => view.value?.seo.description ?? ANLIEGEN_LIST_DE.seoFallback,
  ogTitle: () => view.value?.seo.ogTitle ?? loadingLabel.value,
})
</script>

<template>
  <div class="mx-auto w-full max-w-3xl">
    <FetchGate
      :status="status"
      :error="error"
      :data="data"
      :loading-label="loadingLabel"
      @retry="refresh()"
    >
      <template #loading="{ label }">
        <AnliegenSkeleton :label="label" />
      </template>
      <template #default="{ data }">
        <article v-if="view">
          <BackLink :to="ANLIEGEN_BACK_DE.to" :label="ANLIEGEN_BACK_DE.label" />
          <DraftHeader :title="data.title">
            <template #source>
              <ExternalLink :href="data.parliamentUrl" class="link-inline tap-target">{{ ANLIEGEN_PAGE_DE.parliamentLink }}</ExternalLink>
            </template>
            <template #identity>
              <span class="text-sm font-medium text-ink-muted">
                <span class="text-ink">{{ view.identity.kind }}</span> {{ view.identity.rest }}
              </span>
            </template>
          </DraftHeader>

          <!-- The rail: the white card one operates, as `ProcedureCard`, its
               state as the heading. One weight for every state — success and
               shelving get one colour (framing rule). -->
          <div class="mt-6 rounded-xl border border-hairline bg-surface p-4">
            <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 class="font-sans text-base font-semibold text-ink">{{ view.headline.text }}</h2>
              <NuxtLink
                v-if="view.headline.link"
                :to="view.headline.link.href"
                class="tap-target text-sm font-medium link-quiet"
              >
                {{ view.headline.link.label }} →
              </NuxtLink>
            </div>
            <AnliegenRail class="mt-4" :rows="view.rail" :label="view.railLabel" />
          </div>

          <!-- The door only on the item's own open flag; closed, one muted
               line and no blue. -->
          <AnliegenDoor v-if="view.participation.door.open" :door="view.participation.door" />
          <p v-if="view.participation.closedLine" class="mt-6 max-w-prose text-sm text-ink-muted">
            {{ view.participation.closedLine }}
          </p>
          <p v-if="view.participation.volksbegehrenLine" class="mt-3 max-w-prose text-sm text-ink-muted">
            {{ view.participation.volksbegehrenLine }}
          </p>

          <section id="beteiligung" class="page-section scroll-mt-6" aria-labelledby="beteiligung-heading">
            <h2 id="beteiligung-heading" class="section-heading">{{ view.countsHeading }}</h2>
            <div class="mt-4">
              <FactList :facts="view.counts" />
              <SectionCredits :sources="[]" :marked="false">
                <span>Quelle: <ExternalLink :href="data.parliamentUrl" class="link-muted">{{ ANLIEGEN_PAGE_DE.source }}</ExternalLink></span>
              </SectionCredits>
            </div>
          </section>

          <!-- The Stellungnahmen as on a Regierungsvorlage: the same panel,
               the same classification, persons counted and never named. -->
          <section
            v-if="statementsShown"
            id="stellungnahmen"
            class="page-section scroll-mt-6"
            aria-labelledby="stellungnahmen-heading"
          >
            <h2 id="stellungnahmen-heading" class="section-heading">{{ view.statementsHeading }}</h2>
            <div class="mt-4">
              <p v-if="statementsError" class="max-w-prose text-sm text-ink-secondary">
                {{ ANLIEGEN_PAGE_DE.statementsFailed }}
                <ExternalLink :href="data.parliamentUrl" class="link-muted">{{ ANLIEGEN_PAGE_DE.statementsFailedLink }}</ExternalLink>.
              </p>
              <RvStatements
                v-else-if="statements"
                :data="statements"
                :filing-open="data.participation.statements === 'open'"
                :item="data.root.kind"
                bare
              />
            </div>
          </section>

          <!-- „Keine Veröffentlichung der Dokumente" (14 Petitionen an den
               Bundesrat): the section says so and lists none. -->
          <section
            v-if="data.documents.length || view.documentsNote"
            id="dokumente"
            class="page-section scroll-mt-6"
            aria-labelledby="dokumente-heading"
          >
            <h2 id="dokumente-heading" class="section-heading">{{ ANLIEGEN_PAGE_DE.documentsHeading }}</h2>
            <div class="mt-4">
              <p v-if="view.documentsNote" class="max-w-prose text-ink-secondary">{{ view.documentsNote }}</p>
              <DocumentList v-else :documents="data.documents" />
            </div>
          </section>

          <section id="nicht-gezeigt" class="page-section scroll-mt-6" aria-labelledby="nicht-gezeigt-heading">
            <h2 id="nicht-gezeigt-heading" class="section-heading">{{ view.notShownHeading }}</h2>
            <ul role="list" class="mt-4 max-w-prose list-disc space-y-3 pl-5 text-ink-secondary">
              <li v-for="(item, i) in view.notShown" :key="i">
                <template v-if="item.lead"><span class="font-medium text-ink">{{ item.lead }}</span>{{ ' ' }}</template>
                <AnliegenFactText :fact="item" />
              </li>
            </ul>
          </section>
        </article>
      </template>
    </FetchGate>
  </div>
</template>
