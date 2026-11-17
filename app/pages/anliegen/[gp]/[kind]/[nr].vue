<script setup lang="ts">
import type { AnliegenDetail, RvStatementsResponse } from '#shared/types'
import { anliegenApiBase, anliegenKindOfSegment, anliegenRootOf } from '#shared/utils/anliegen'
import { ANLIEGEN_BACK_DE, ANLIEGEN_LIST_DE, ANLIEGEN_PAGE_DE, anliegenLoadingLabelDe, anliegenView, type AnliegenStationSection } from '~/utils/anliegenView'
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
 * one-line state, the door while the item's own flag is open, then ONE
 * SECTION PER STEP, under the rail row's own name and in its order
 * (15.11.2026; `anliegenSections`), and last what the page cannot show. The
 * rail carries each step's summary and links into its section; the section
 * carries the rest. The Einbringung's section holds the documents and the
 * Unterstützungen with their door, the committee's the Stellungnahmen with
 * theirs (`statementsAt`) — each door once more at the end of the section
 * where one decides to act (docs/decisions.md, „The door stands twice").
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

/* The door's actions split by section: Unterstützen at the end of the
 * Einbringung, the Stellungnahme's forms at the end of the Stellungnahmen. */
const supportActions = computed(() => view.value?.participation.door.actions.filter((a) => a.key === 'support') ?? [])
const statementActions = computed(() => view.value?.participation.door.actions.filter((a) => a.key !== 'support') ?? [])

/* A section's rows as `FactList` facts; the value is the fact line in the slot. */
const factsOf = (s: AnliegenStationSection) => s.rows.map((r) => ({ key: r.key, title: r.title }))

/* The Stellungnahmen — client-side and lazy, as on the page of a Vorlage:
 * list 142 must not sit in the SSR path. Registered here only, where it is
 * read, so no other call site shares its options. */
const { data: statements, error: statementsError } = await useFetch<RvStatementsResponse>(() => `${url.value}/stellungnahmen`, {
  lazy: true,
  server: false,
  enabled: computed(() => Boolean(root.value)),
})
/* Shown where it says something the section's rows do not: rows, or an
 * open window with none yet. A closed item with none has the row
 * „Stellungnahmen: 0" instead (`statementsCountRow`), and whether one was
 * ever possible is not read (`CLOSED_BOTH`). */
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

          <!-- The state card of every detail page (`ProcedureCard`), with
               the Anliegen's own rail in place of the five stations. One
               weight for every state — success and shelving get one colour
               (framing rule). -->
          <ProcedureCard
            :status="view.headline.text"
            :link="view.headline.link ? { to: view.headline.link.href, label: view.headline.link.label } : null"
          >
            <template #rail>
              <AnliegenRail class="mt-4" :rows="view.rail" :label="view.railLabel" />
            </template>
          </ProcedureCard>

          <!-- The door only on the item's own open flag; closed, one muted
               line and no blue. -->
          <AnliegenDoor v-if="view.participation.door.open" :door="view.participation.door" />
          <p v-if="view.participation.closedLine" class="mt-6 text-sm text-ink-muted">
            {{ view.participation.closedLine }}
          </p>
          <GapNote v-if="view.participation.volksbegehrenLine" :text="view.participation.volksbegehrenLine" class="mt-3 text-sm text-ink-muted" />

          <!-- One section per step, under the rail row's name: the rail is the
               table of contents, the rows here what its summary leaves out. -->
          <section
            v-for="section in view.sections"
            :id="section.anchor"
            :key="section.id"
            class="page-section scroll-mt-6"
            :aria-labelledby="`${section.anchor}-heading`"
          >
            <h2 :id="`${section.anchor}-heading`" class="section-heading">{{ section.heading }}</h2>
            <div class="mt-4 space-y-8">
              <div v-if="section.rows.length || section.note">
                <FactList v-if="section.rows.length" :facts="factsOf(section)">
                  <template v-for="r in section.rows" :key="r.key" #[`value-${r.key}`]>
                    <p class="leading-snug"><AnliegenFactLine :facts="r.facts" /></p>
                  </template>
                </FactList>
                <!-- An explanation, not a fact: under the facts, quieter. -->
                <p v-if="section.note" class="text-sm text-ink-secondary" :class="section.rows.length ? 'mt-3' : ''">{{ section.note }}</p>
                <SectionCredits :sources="[]" :marked="false">
                  <span>Quelle: <ExternalLink :href="data.parliamentUrl" class="link-muted">{{ ANLIEGEN_PAGE_DE.source }}</ExternalLink></span>
                </SectionCredits>
              </div>

              <!-- The item's own documents, with the step that brought it in.
                   „Keine Veröffentlichung der Dokumente" (14 Petitionen an den
                   Bundesrat): the sub-section says so and lists none. -->
              <PageSubsection
                v-if="section.id === 'eingebracht' && (data.documents.length || view.documentsNote)"
                id="dokumente"
                :heading="ANLIEGEN_PAGE_DE.documentsHeading"
              >
                <GapNote v-if="view.documentsNote" :text="view.documentsNote" class="text-ink-secondary" />
                <DocumentList v-else :documents="data.documents" />
              </PageSubsection>

              <!-- The Stellungnahmen as on a Regierungsvorlage: the same panel,
                   the same classification, persons counted and never named. -->
              <PageSubsection
                v-if="section.id === view.statementsAt && statementsShown"
                id="stellungnahmen"
                :heading="view.statementsHeading"
              >
                <GapNote v-if="statementsError" kind="unavailable" class="text-sm text-ink-secondary">
                  {{ ANLIEGEN_PAGE_DE.statementsFailed }}
                  <ExternalLink :href="data.parliamentUrl" class="link-muted">{{ ANLIEGEN_PAGE_DE.statementsFailedLink }}</ExternalLink>.
                </GapNote>
                <RvStatements
                  v-else-if="statements"
                  :data="statements"
                  :filing-open="data.participation.statements === 'open'"
                  :item="data.root.kind"
                  bare
                />
              </PageSubsection>

              <!-- The door once more, at the end of the section where one
                   decides (`DoorButton`): Unterstützen with the item, the
                   Stellungnahme's forms under the Stellungnahmen. -->
              <div v-if="section.id === 'eingebracht' && supportActions.length" class="flex flex-wrap items-center gap-3">
                <DoorButton v-for="a in supportActions" :key="a.key" :href="a.href">{{ a.label }}</DoorButton>
              </div>
              <div v-if="section.id === view.statementsAt && statementActions.length" class="flex flex-wrap items-center gap-3">
                <DoorButton v-for="a in statementActions" :key="a.key" :href="a.href">{{ a.label }}</DoorButton>
              </div>
            </div>
          </section>

          <section id="nicht-gezeigt" class="page-section scroll-mt-6" aria-labelledby="nicht-gezeigt-heading">
            <h2 id="nicht-gezeigt-heading" class="section-heading">{{ view.notShownHeading }}</h2>
            <ul role="list" class="mt-4 list-disc space-y-3 pl-5 text-ink-secondary">
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
