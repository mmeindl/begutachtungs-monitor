<script setup lang="ts">
import type { DraftDocument, LandCode, LandDraftDetail } from '#shared/types'
import type { Fact } from '~/components/ui/FactList.vue'
import { LAND_HOST, LAND_NAME, landShortTitle } from '#shared/utils/laender'
import { RIS_KIND_LABEL } from '#shared/utils/risConsultations'
import { citeLineDe } from '#shared/utils/citations'
import { countLabelDe, formatDateDe } from '#shared/utils/format'
import { fristFact, fristStateDe } from '~/utils/deadlines'

/**
 * A Land's draft (22.10.2026), behind `/entwuerfe/<land>/<number>`.
 *
 * The RIS page's anatomy where the facts are the same kind — header,
 * door card while the Frist runs, „Der Entwurf", „Die Begutachtung" — and
 * nothing that would describe the Bund's procedure: no station card (the
 * Land's path after the Begutachtung is not read yet), no Frist bar (its
 * Regelfall and medians are measured on Bund drafts and would be the wrong
 * yardstick here).
 *
 * The page exists for every draft in the Land's register, running or
 * closed, so a shared link does not die when the Frist ends — the reason
 * the rows only link here since the register is read.
 */
const props = defineProps<{
  land: LandCode
  number: string
}>()

const { data, error, refresh, status } = await useFetch<LandDraftDetail>(
  () => `/api/laender/${props.land}/${props.number}`,
  { lazy: true },
)

const notFound = () => createError({ statusCode: 404, statusMessage: 'Entwurf nicht gefunden', fatal: true })
if (error.value?.statusCode === 404) throw notFound()
watch(error, (e) => {
  if (e?.statusCode === 404) showError(notFound())
})

const landName = computed(() => LAND_NAME[props.land])
const draft = computed(() => data.value?.draft ?? null)
/* The row's short name as the heading where the title ends with one; the
   whole title then stands under it, as on the RIS page. */
const shortTitle = computed(() => (draft.value ? landShortTitle(draft.value.title) : null))
const kindLabel = computed(() => (draft.value ? RIS_KIND_LABEL[draft.value.kind] : ''))
const citeAs = computed(() => (draft.value ? `${kindLabel.value} „${draft.value.title}“ (Land ${landName.value})` : ''))

const documents = computed<DraftDocument[]>(() =>
  (draft.value?.documents ?? []).map((d) => ({ title: d.title, formats: [{ type: 'pdf', url: d.url }] })))

const fristFacts = computed<Fact[]>(() => {
  const d = draft.value
  return d?.deadline ? [fristFact(d.startedAt, d.deadline)] : []
})

const named = computed(() => (data.value?.statements ?? []).filter((s) => s.name))
const unnamed = computed(() => (data.value?.statements ?? []).filter((s) => !s.name))

usePageSeo({
  title: () => truncate(shortTitle.value ?? draft.value?.title ?? 'Entwurf', 60),
  description: () => {
    const d = draft.value
    if (!d) return undefined
    return `${kindLabel.value} des Landes ${landName.value}, ${fristStateDe(d.active, d.deadline, 'clause')}`
  },
})
useSeoMeta({ ogTitle: () => draft.value?.title ?? 'Entwurf', ogType: 'article' })
</script>

<template>
  <div class="mx-auto w-full max-w-3xl">
    <FetchGate
      :status="status"
      :error="error"
      :data="data"
      loading-label="Entwurf wird geladen …"
      @retry="refresh()"
    >
      <template #loading="{ label }">
        <DraftSkeleton :label="label" />
      </template>
      <template #default="{ data: detail }">
        <DraftBackLink />

        <DraftHeader :title="shortTitle ?? detail.draft.title">
          <template #source>
            <span class="inline-flex flex-wrap items-center gap-x-4">
              <ExternalLink
                :href="detail.draft.url"
                class="link-inline tap-target"
              >Beim Land {{ landName }} ansehen</ExternalLink>
              <CiteButton :text="citeLineDe(citeAs, detail.draft.url)" subject="Den Entwurf" />
            </span>
          </template>
          <!-- The Land stands where a Bund draft names its Ministerium. -->
          <template #identity>
            <span class="text-sm font-medium text-ink-muted">
              {{ kindLabel }} · Land {{ landName }}
            </span>
          </template>
          <p v-if="shortTitle" class="mt-1 text-sm text-ink-secondary">
            {{ detail.draft.title }}
          </p>
        </DraftHeader>

        <!-- The one place to act, while the Frist runs — the RIS page's
             card. The Land takes Stellungnahmen by e-mail; DoorButton opens
             web addresses only, so the address is a plain mailto link. -->
        <DraftDoorCard v-if="detail.draft.active" frist :deadline="detail.draft.deadline">
          <p class="mt-2 text-sm text-ink">
            Stellungnahmen gehen per E-Mail an das Land:
            <a :href="`mailto:${detail.filingEmail}`" class="link-inline font-medium">{{ detail.filingEmail }}</a>.
            Veröffentlicht werden sie nur, wenn Sie dem ausdrücklich zustimmen.
          </p>
        </DraftDoorCard>

        <section id="entwurf" class="page-section scroll-mt-6" aria-labelledby="entwurf-heading">
          <h2 id="entwurf-heading" class="section-heading">Der Entwurf</h2>
          <div class="mt-4">
            <DocumentList :documents="documents" :source="LAND_HOST[land]" :cite-as="citeAs" />
            <p class="mt-3 text-sm text-ink-secondary">
              Quelle: Land {{ landName }} · Nummer
              <span class="font-mono text-xs text-ink">{{ number }}</span>.
            </p>
          </div>
        </section>

        <section id="begutachtung" class="page-section scroll-mt-6" aria-labelledby="begutachtung-heading">
          <h2 id="begutachtung-heading" class="section-heading">Die Begutachtung</h2>
          <div class="mt-4 space-y-8">
            <FactList v-if="fristFacts.length" :facts="fristFacts" />
            <!-- A closed draft comes from the register, which keeps the
                 start and not the Frist: said, not left blank. -->
            <p v-else class="text-sm text-ink-secondary">
              <template v-if="detail.draft.startedAt">In Begutachtung gegangen am {{ formatDateDe(detail.draft.startedAt) }}. </template>
              Die Frist nennt das Land nur, solange die Begutachtung läuft.
            </p>

            <PageSubsection heading="Stellungnahmen">
              <p v-if="detail.statements === null" class="text-sm text-ink-secondary">
                Gerade nicht abrufbar –
                <ExternalLink :href="detail.statementsUrl" class="link-inline font-medium">beim Land nachsehen</ExternalLink>.
              </p>
              <p v-else-if="!detail.statements.length" class="text-sm text-ink-secondary">
                <template v-if="detail.draft.active">Bisher keine veröffentlicht.</template>
                <template v-else>Das Land hat zu diesem Entwurf keine Stellungnahmen veröffentlicht.</template>
                Das Land veröffentlicht eine Stellungnahme nur mit Zustimmung derer, die sie einreichen.
              </p>
              <template v-else>
                <p class="text-sm text-ink-secondary">
                  {{ countLabelDe(detail.statements.length, 'veröffentlichte Stellungnahme', 'veröffentlichte Stellungnahmen') }}
                  – das Land veröffentlicht nur mit Zustimmung derer, die sie einreichen.
                </p>
                <ul class="mt-3 divide-y divide-hairline border-y border-hairline">
                  <li v-for="s in named" :key="s.url" class="flex items-center justify-between gap-3 py-2 text-sm">
                    <span class="text-ink">{{ s.name }}</span>
                    <ExternalLink :href="s.url" class="link-inline shrink-0">PDF</ExternalLink>
                  </li>
                  <!-- Without a name, as on Bund drafts: the monitor names
                       organisations only (`classifySubmitter`). -->
                  <li v-for="(s, i) in unnamed" :key="s.url" class="flex items-center justify-between gap-3 py-2 text-sm">
                    <span class="text-ink-secondary">Stellungnahme {{ unnamed.length > 1 ? i + 1 : '' }} (Einbringer nicht angezeigt)</span>
                    <ExternalLink :href="s.url" class="link-inline shrink-0">PDF</ExternalLink>
                  </li>
                </ul>
                <p class="mt-3 text-sm text-ink-secondary">
                  Namen nennt der Monitor nur bei Organisationen.
                  <ExternalLink :href="detail.statementsUrl" class="link-inline">Alle beim Land ansehen</ExternalLink>
                </p>
              </template>
            </PageSubsection>
          </div>
        </section>
      </template>
    </FetchGate>
  </div>
</template>
