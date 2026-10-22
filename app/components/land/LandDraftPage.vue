<script setup lang="ts">
import type { DraftDocument, LandCode, LandDraftDetail } from '#shared/types'
import type { Fact } from '~/components/ui/FactList.vue'
import { LAND_HOST, LAND_NAME, LAND_PUBLICATION_NOTE, landShortTitle } from '#shared/utils/laender'
import { RIS_KIND_LABEL } from '#shared/utils/risConsultations'
import { citeLineDe } from '#shared/utils/citations'
import { countLabelDe, formatDateDe } from '#shared/utils/format'
import { fristFact, fristStateDe } from '~/utils/deadlines'

/**
 * A Land's draft (22.10.2026), behind `/entwuerfe/<land>/<number>`.
 *
 * The RIS page's anatomy where the facts are the same kind — header,
 * door card while the Frist runs, „Der Entwurf", „Die Begutachtung" — and
 * nothing that would describe the Bund's procedure: no station card, no
 * Frist bar (its Regelfall and medians are measured on Bund drafts and
 * would be the wrong yardstick here).
 *
 * What a Land publishes differs, and the page shows each part only where
 * the Land has it: Oberösterreich's Kurzinformation and its Landtag's
 * record („Im Landtag"), Wien's filing address per Magistratsabteilung and
 * its one-year limit. Everything here is the Land's own statement; the
 * monitor adds no reading of its own.
 *
 * A page that the Land has stopped publishing answers 410 with the Land's
 * reason (Wien keeps a draft a year) — never a bare 404 for something that
 * existed.
 */
const props = defineProps<{
  land: LandCode
  number: string
}>()

const { data, error, refresh, status } = await useFetch<LandDraftDetail>(
  () => `/api/laender/${props.land}/${props.number}`,
  { lazy: true },
)

/* 404 and 410 become the site's error page; 410 carries the Land's reason,
   in the body (`data.reason`) because a status message loses its umlauts. */
function raise(e: { statusCode?: number; data?: unknown } | null | undefined): void {
  if (e?.statusCode === 404) throw createError({ statusCode: 404, statusMessage: 'Entwurf nicht gefunden', fatal: true })
  if (e?.statusCode === 410) {
    const reason = (e.data as { data?: { reason?: string } } | undefined)?.data?.reason
    throw createError({ statusCode: 410, statusMessage: 'Gone', data: { reason: reason ?? 'Diesen Entwurf führt das Land nicht mehr.' }, fatal: true })
  }
}
raise(error.value)
watch(error, (e) => {
  try {
    raise(e)
  } catch (err) {
    showError(err as Error)
  }
})

const landName = computed(() => LAND_NAME[props.land])
const publicationNote = computed(() => LAND_PUBLICATION_NOTE[props.land])
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
             card. Where it goes is the Land's: an address (DoorButton opens
             web addresses only, so a plain mailto link), the Land's own
             form, or — where the Land's page names neither — the draft. -->
        <DraftDoorCard
          v-if="detail.draft.active"
          frist
          :deadline="detail.draft.deadline"
          :filing-href="detail.filing.kind === 'form' ? detail.filing.url : null"
        >
          <p class="mt-2 text-sm text-ink">
            <template v-if="detail.filing.kind === 'email'">
              Stellungnahmen gehen per E-Mail an
              <template v-if="detail.filing.recipient">die {{ detail.filing.recipient }}</template><template v-else>das Land</template>:
              <a :href="`mailto:${detail.filing.address}`" class="link-inline font-medium">{{ detail.filing.address }}</a>.
            </template>
            <template v-else-if="detail.filing.kind === 'form'">
              Stellungnahmen gehen über das Formular des Landes.
            </template>
            <template v-else>
              Wohin eine Stellungnahme geht, steht im Entwurf.
            </template>
            <template v-if="publicationNote"> {{ publicationNote }}</template>
          </p>
          <template #filing>Stellungnahme einbringen</template>
        </DraftDoorCard>

        <section id="entwurf" class="page-section scroll-mt-6" aria-labelledby="entwurf-heading">
          <h2 id="entwurf-heading" class="section-heading">Der Entwurf</h2>
          <div class="mt-4 space-y-8">
            <!-- The Land's own summary, where it writes one (OÖ). Its words,
                 point by point, as the Landtag's page lists them. -->
            <PageSubsection v-if="detail.summary?.length" heading="Kurzinformation des Landes">
              <ul class="list-disc space-y-1 pl-5 text-sm text-ink">
                <li v-for="point in detail.summary" :key="point">{{ point }}</li>
              </ul>
            </PageSubsection>
            <div>
              <DocumentList :documents="documents" :source="LAND_HOST[land]" :cite-as="citeAs" />
              <p class="mt-3 text-sm text-ink-secondary">
                Quelle: Land {{ landName }} · Nummer
                <span class="font-mono text-xs text-ink">{{ number }}</span>.
                <template v-if="detail.retentionNote">{{ detail.retentionNote }}</template>
              </p>
            </div>
          </div>
        </section>

        <section id="begutachtung" class="page-section scroll-mt-6" aria-labelledby="begutachtung-heading">
          <h2 id="begutachtung-heading" class="section-heading">Die Begutachtung</h2>
          <div class="mt-4 space-y-8">
            <FactList v-if="fristFacts.length" :facts="fristFacts" />
            <!-- A closed draft read from a register keeps its start and not
                 its Frist: said, not left blank. -->
            <p v-else class="text-sm text-ink-secondary">
              <template v-if="detail.draft.startedAt">In Begutachtung gegangen am {{ formatDateDe(detail.draft.startedAt) }}. </template>
              Die Frist nennt das Land nicht mehr.
            </p>

            <PageSubsection heading="Stellungnahmen">
              <p v-if="detail.statements === null" class="text-sm text-ink-secondary">
                <template v-if="detail.statementsUrl">
                  Gerade nicht abrufbar –
                  <ExternalLink :href="detail.statementsUrl" class="link-inline font-medium">beim Land nachsehen</ExternalLink>.
                </template>
                <template v-else>Das Land veröffentlicht zu diesem Entwurf keine Stellungnahmen.</template>
              </p>
              <p v-else-if="!detail.statements.length" class="text-sm text-ink-secondary">
                <template v-if="detail.draft.active">Bisher keine veröffentlicht.</template>
                <template v-else>Das Land hat zu diesem Entwurf keine Stellungnahmen veröffentlicht.</template>
                <template v-if="publicationNote"> {{ publicationNote }}</template>
              </p>
              <template v-else>
                <p class="text-sm text-ink-secondary">
                  {{ countLabelDe(detail.statements.length, 'veröffentlichte Stellungnahme', 'veröffentlichte Stellungnahmen') }}.
                  <template v-if="publicationNote">{{ publicationNote }}</template>
                </p>
                <ul class="mt-3 divide-y divide-hairline border-y border-hairline">
                  <li v-for="s in named" :key="s.url" class="flex items-center justify-between gap-3 py-2 text-sm">
                    <span class="text-ink">{{ s.name }}</span>
                    <span class="flex shrink-0 items-center gap-3">
                      <span v-if="s.date" class="text-ink-muted tabular-nums">{{ formatDateDe(s.date) }}</span>
                      <ExternalLink :href="s.url" class="link-inline">PDF</ExternalLink>
                    </span>
                  </li>
                  <!-- Without a name, as on Bund drafts: the monitor names
                       organisations only (`classifySubmitter`). -->
                  <li v-for="(s, i) in unnamed" :key="s.url" class="flex items-center justify-between gap-3 py-2 text-sm">
                    <span class="text-ink-secondary">Stellungnahme{{ unnamed.length > 1 ? ` ${i + 1}` : '' }} (Einbringer nicht angezeigt)</span>
                    <span class="flex shrink-0 items-center gap-3">
                      <span v-if="s.date" class="text-ink-muted tabular-nums">{{ formatDateDe(s.date) }}</span>
                      <ExternalLink :href="s.url" class="link-inline">PDF</ExternalLink>
                    </span>
                  </li>
                </ul>
                <p class="mt-3 text-sm text-ink-secondary">
                  Namen nennt der Monitor nur bei Organisationen.
                  <ExternalLink v-if="detail.statementsUrl" :href="detail.statementsUrl" class="link-inline">Alle beim Land ansehen</ExternalLink>
                </p>
              </template>
            </PageSubsection>
          </div>
        </section>

        <!-- What came after, as the Land's Landtag records it (OÖ):
             Regierungsvorlage, sittings, committee, Beschluss, LGBl — its
             words and dates, in its order. No reading of ours, so no claim
             about what changed between the draft and the Vorlage. Only
             where there is a step: before the Vorlage, an empty section
             would announce a wait, not a fact. -->
        <section
          v-if="detail.procedure?.length"
          id="landtag"
          class="page-section scroll-mt-6"
          aria-labelledby="landtag-heading"
        >
          <h2 id="landtag-heading" class="section-heading">Im Landtag</h2>
          <!-- Where the record ends in the Landesgesetzblatt: the
               Kundmachung in RIS, citable, as the Bund's draft pages give
               their BGBl (22.10.2026). -->
          <p
            v-if="detail.draft.stage && detail.draft.stage !== 'unknown' && detail.draft.stage.station === 'bgbl' && detail.draft.stage.url"
            class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
          >
            <span>
              Kundgemacht im Landesgesetzblatt:
              <ExternalLink :href="detail.draft.stage.url" class="link-inline font-medium">{{ detail.draft.stage.detail }}</ExternalLink><template v-if="detail.draft.stage.date">, am {{ formatDateDe(detail.draft.stage.date) }}</template>
            </span>
            <CiteButton :text="citeLineDe(detail.draft.stage.detail, detail.draft.stage.url)" subject="Die Kundmachung" />
          </p>
          <ol class="mt-4 divide-y divide-hairline border-y border-hairline">
            <li v-for="(step, i) in detail.procedure" :key="i" class="flex gap-4 py-2 text-sm">
              <span class="w-24 shrink-0 text-ink-muted tabular-nums">{{ step.date ? formatDateDe(step.date) : '' }}</span>
              <span class="min-w-0">
                <ExternalLink v-if="step.url" :href="step.url" class="link-inline">{{ step.label }}</ExternalLink>
                <template v-else>{{ step.label }}</template>
              </span>
            </li>
          </ol>
          <p class="mt-3 text-sm text-ink-secondary">
            Quelle: Landtag {{ landName }}, wie er das Verfahren selbst verzeichnet.
          </p>
        </section>
      </template>
    </FetchGate>
  </div>
</template>
