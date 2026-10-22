<script setup lang="ts">
import type { DraftDocument, LandCode, LandDraftDetail } from '#shared/types'
import type { Fact } from '~/components/ui/FactList.vue'
import { LAND_HOST, LAND_NAME, LAND_PUBLICATION_NOTE, landDraftPath, landShortTitle } from '#shared/utils/laender'
import { RIS_KIND_LABEL } from '#shared/utils/risConsultations'
import { citeLineDe } from '#shared/utils/citations'
import { formatDateDe } from '#shared/utils/format'
import { fristFact, fristStateDe } from '~/utils/deadlines'
import type { StationId } from '~/utils/spine'
import { landStations, landStatusDe } from '~/utils/spine'

/**
 * A Land's draft (22.10.2026), behind `/entwuerfe/<land>/<number>`.
 *
 * The RIS page's anatomy where the facts are the same kind — header,
 * procedure card, door card while the Frist runs, „Der Entwurf", „Die
 * Begutachtung" — and nothing measured on the Bund's procedure: no Frist bar
 * (its Regelfall and medians are measured on Bund drafts and would be the
 * wrong yardstick here). Its bar runs to the Kundmachung where the monitor
 * follows the draft that far, and names the gap where it does not
 * (`landStations`).
 *
 * What a Land publishes differs, and the page shows each part only where
 * the Land has it: Oberösterreich's Kurzinformation and its Landtag's
 * record (`LandStationSections`), Wien's filing address per Magistratsabteilung and
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

/* The Land's Textgegenüberstellung (`landTguService`): Oberösterreich's is a
   document of its own; Wien's stands at the end of the draft's PDF, so the
   section always asks there and the server says when there is none. */
const hasTgu = computed(() => props.land === 'w' || (props.land === 'ooe' && (draft.value?.documents ?? []).some((d) => /gegenüber/i.test(d.title))))

const documents = computed<DraftDocument[]>(() =>
  (draft.value?.documents ?? []).map((d) => ({ title: d.title, formats: [{ type: 'pdf', url: d.url }] })))

const fristFacts = computed<Fact[]>(() => {
  const d = draft.value
  return d?.deadline ? [fristFact(d.startedAt, d.deadline)] : []
})

const stationList = computed(() =>
  draft.value ? landStations(draft.value, data.value?.statements?.length ?? null, data.value?.procedure) : [])
/* Every station links into the section that holds it, as on the
   Ministerialentwurf's page (`LandStationSections`, which renders the same
   conditions); a station without a section stays plain text. */
const stationAnchors = computed<Partial<Record<StationId, string>>>(() => {
  const steps = data.value?.procedure ?? []
  const stage = draft.value?.stage
  const has = (id: 'rv' | 'parlament' | 'bgbl') => steps.some((s) => s.station === id)
  const inLandtag = steps.some((s) => s.station !== 'rv' && s.station !== 'bgbl')
  return {
    entwurf: '#entwurf',
    begutachtung: '#begutachtung',
    ...(has('rv') ? { rv: '#regierungsvorlage' } : {}),
    ...(inLandtag ? { parlament: '#landtag' } : {}),
    ...(stage && stage !== 'unknown' && stage.station === 'bgbl' && stage.detail ? { bgbl: '#landesgesetzblatt' } : {}),
  }
})

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

        <!-- The ME page's card, in the same place, on every Land's draft:
             where the monitor does not follow the draft past its
             Begutachtung, the last row says so (`landStations`). -->
        <ProcedureCard
          :status="landStatusDe(detail.draft)"
          :stations="stationList"
          :anchors="stationAnchors"
          :comparison-anchors="{ begutachtung: '#textvergleich-rv', parlament: '#textvergleich-ausschuss' }"
          how-to="/so-funktionierts#laender"
        />

        <!-- The one place to act, while the Frist runs — the RIS page's
             card. Where it goes is the Land's: an address (a mail link in
             the sentence, copied by the primary button), the Land's own
             form, or — where the Land's page names neither — the draft. -->
        <DraftDoorCard
          v-if="detail.draft.active"
          frist
          :deadline="detail.draft.deadline"
          :filing-href="detail.filing.kind === 'form' ? detail.filing.url : null"
          :ics-href="`${landDraftPath(land, detail.draft.id)}/frist.ics`"
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
          <!-- Both ways to the address: the link in the sentence opens the
               mail program, the button copies it for wherever one writes. -->
          <template v-if="detail.filing.kind === 'email'" #primary>
            <CopyButton :text="detail.filing.address" what="E-Mail-Adresse">E-Mail-Adresse kopieren</CopyButton>
          </template>
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
            <!-- What the draft would do to the law in force, § by §, read
                 from the Land's own Textgegenüberstellung — where the
                 Ministerialentwurf's page asks the same question, after the
                 summary and before the documents (22.10.2026). -->
            <LandLawDiffSection v-if="hasTgu" :land="land" :number="number" from="geltend" to="entwurf" />
            <!-- Named like the Dokumente of the other draft pages, and OPEN
                 where they fold (22.10.2026): there the documents follow the
                 comparison and the Erläuterungen, here they are the only way
                 to read the draft — folded, a Salzburg or Wien page would show
                 a heading over a closed fold where its content belongs. -->
            <PageSubsection id="dokumente" heading="Dokumente">
              <DocumentList :documents="documents" :source="LAND_HOST[land]" :cite-as="citeAs" />
              <p class="mt-3 text-sm text-ink-secondary">
                Quelle: Land {{ landName }} · Nummer
                <span class="font-mono text-xs text-ink">{{ number }}</span>.
                <template v-if="detail.retentionNote">{{ detail.retentionNote }}</template>
              </p>
            </PageSubsection>
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

            <LandStatements
              :statements="detail.statements"
              :statements-url="detail.statementsUrl"
              :active="detail.draft.active"
              :publication-note="publicationNote"
              :land-name="landName"
            />
          </div>
        </section>

        <!-- The stations after the Begutachtung, one section each, where
             the Land records them (OÖ). -->
        <LandStationSections :draft="detail.draft" :procedure="detail.procedure" :landtag="detail.landtag" :land-name="landName" :land="land" :number="number" />
      </template>
    </FetchGate>
  </div>
</template>
