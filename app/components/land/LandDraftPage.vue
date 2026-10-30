<script setup lang="ts">
import type { DraftDocument, LandCode, LandDraftDetail } from '#shared/types'
import type { Fact } from '~/components/ui/FactList.vue'
import { LAND_HOST, LAND_NAME, LAND_PUBLICATION_NOTE, landDraftPath, landPublisherDe, landShortTitle } from '#shared/utils/laender'
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

/* A number the Land filed as a document of another draft — an annex once
   read as a draft of its own (`salzburgDrafts`, 23.10.2026) — answers with
   that draft, and the address moves to the draft's own: one page per draft,
   and an old link still lands on it. */
const canonicalPath = computed(() => (data.value ? landDraftPath(props.land, data.value.draft.id) : null))
function toCanonical() {
  const path = canonicalPath.value
  return path && path !== landDraftPath(props.land, `${props.land}-${props.number}`)
    ? navigateTo(path, { redirectCode: 301, replace: true })
    : undefined
}
await toCanonical()
watch(canonicalPath, () => {
  void toCanonical()
})

const landName = computed(() => LAND_NAME[props.land])
/* Tirol's Verordnungen live in the IFG-Informationsregister, not in the Landtag's records — and so do their Stellungnahmen. */
const publicationNote = computed(() => (props.land === 't' && draft.value?.kind === 'verordnung'
  ? 'Das Land veröffentlicht die Stellungnahmen im Informationsregister beim Entwurf.'
  : LAND_PUBLICATION_NOTE[props.land]))
const draft = computed(() => data.value?.draft ?? null)
/* The row's short name as the heading where the title ends with one; the
   whole title then stands under it, as on the RIS page. */
const shortTitle = computed(() => (draft.value ? landShortTitle(draft.value.title) : null))
const kindLabel = computed(() => (draft.value ? RIS_KIND_LABEL[draft.value.kind] : ''))
const citeAs = computed(() => (draft.value ? `${kindLabel.value} „${draft.value.title}“ (${landPublisherDe(draft.value)})` : ''))

/* The Land's Textgegenüberstellung, where the server offers it (`LandDraftDetail.comparisons`). */
const hasTgu = computed(() => (data.value?.comparisons ?? []).some(([a, b]) => a === 'geltend' && b === 'entwurf'))
/* An amending draft asks „Was ändert der Entwurf?" whether or not the Land
   answers it, as on the Bund's page (23.10.2026): without a
   Textgegenüberstellung the section says so, instead of being missing. Not
   where the title says one is inside the draft („inkl.
   Textgegenüberstellung"), which the monitor does not read. */
const amends = computed(() => {
  const title = draft.value?.title ?? ''
  return /geändert (?:wird|werden)|Änderung|Novelle/.test(title) && !/gegenüberstellung|\bTGÜ/i.test(title)
})

/* A Textgegenüberstellung the Land published in a form the monitor does
   not read yet (Kärnten, Tirol, 23.10.2026): said so, never „keine". */
const tguListed = computed(() => (draft.value?.documents ?? []).some((d) => /gegenüberstellung|\bTGÜ/i.test(d.title) && !/^Regierungsvorlage\b/.test(d.title)))

/* The span of a reckoned Frist, as the Land's letter writes it. */
const WEEKS_DE: Record<number, string> = { 2: 'zwei', 3: 'drei', 4: 'vier', 5: 'fünf', 6: 'sechs', 8: 'acht' }

const documents = computed<DraftDocument[]>(() =>
  (draft.value?.documents ?? []).map((d) => ({ title: d.title, formats: [{ type: 'pdf', url: d.url }] })))

const fristFacts = computed<Fact[]>(() => {
  const d = draft.value
  return d?.deadline ? [fristFact(d.startedAt, d.deadline)] : []
})

const stationList = computed(() =>
  draft.value ? landStations(draft.value, data.value?.statements?.length ?? null, data.value?.procedure, data.value?.comparisons) : [])
/* Where the bar's comparison links land: the Landtag's is the committee's
   (Oberösterreich) or the way to the Kundmachung (Salzburg). */
const comparisonAnchors = computed(() => ({
  begutachtung: '#textvergleich-rv',
  parlament: (data.value?.comparisons ?? []).some(([a, b]) => a === 'rv' && b === 'ausschuss') ? '#textvergleich-ausschuss' : '#textvergleich-landtag',
}))
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
          <!-- The Land stands where a Bund draft names its Ministerium — or
               its Landtag, where the Begutachtung is the Landtag's (`runBy`). -->
          <template #identity>
            <span class="text-sm font-medium text-ink-muted">
              {{ kindLabel }} · {{ draft ? landPublisherDe(draft) : `Land ${landName}` }}
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
          :comparison-anchors="comparisonAnchors"
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
              Wohin eine Stellungnahme geht, steht {{ detail.filing.in ?? 'im Entwurf' }}.
            </template>
            <template v-if="publicationNote">{{ ` ${publicationNote}` }}</template>
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
            <PageSubsection v-else-if="amends" id="gegenueberstellung" heading="Was ändert der Entwurf?">
              <p v-if="tguListed" class="text-sm text-ink-secondary">Das Land hat eine Textgegenüberstellung veröffentlicht; sie steht unter den Dokumenten. Ihre Form liest der Monitor noch nicht.</p>
              <p v-else class="text-sm text-ink-secondary">Das Land hat zu diesem Entwurf keine Textgegenüberstellung veröffentlicht.</p>
            </PageSubsection>
            <!-- The Land's reasons, after what the draft changes — the order of
                 the Ministerialentwurf's page. -->
            <LandExplanationsSection :land="land" :number="number" />
            <!-- Named like the Dokumente of the other draft pages, and OPEN
                 where they fold (22.10.2026): there the documents follow the
                 comparison and the Erläuterungen, here they are the only way
                 to read the draft — folded, a Salzburg or Wien page would show
                 a heading over a closed fold where its content belongs. -->
            <PageSubsection id="dokumente" heading="Dokumente">
              <DocumentList :documents="documents" :source="LAND_HOST[land]" :cite-as="citeAs" author="des Landes" />
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
            <!-- A Frist the monitor reckoned from the Land's cover letter
                 (Kärnten's Verordnungen, `ktnVoLetter`): measured against the
                 drafts where page and letter both speak, it can be off by two
                 days — said, so the date above is read as what it is. -->
            <p v-if="detail.draft.deadlineFrom" class="text-sm text-ink-secondary">
              Einen Tag nennt das Land nicht: Es ersucht um Stellungnahme innerhalb von
              {{ WEEKS_DE[detail.draft.deadlineFrom.weeks] ?? detail.draft.deadlineFrom.weeks }} Wochen ab Zustellung
              seines Schreibens vom {{ formatDateDe(detail.draft.deadlineFrom.letterDate) }}. Das Ende der Frist ist
              danach gerechnet und kann um ein, zwei Tage abweichen.
            </p>
            <!-- Tirol's Verordnungen (`fristUnknown`): the register they are
                 published in has no field for the Frist, and the documents'
                 dates are as often the Verordnung's own deadlines. Its own
                 v-if chain, apart from the reckoned-Frist sentence above: tied
                 to it, „nennt das Land nicht mehr" stood under every Frist
                 that was shown (24.10.2026). -->
            <p v-if="!fristFacts.length && detail.draft.fristUnknown" class="text-sm text-ink-secondary">
              <template v-if="detail.draft.startedAt">Im Informationsregister veröffentlicht am {{ formatDateDe(detail.draft.startedAt) }}. </template>
              Eine Frist nennt das Land dort nicht; wenn überhaupt, steht sie im
              Begutachtungsschreiben unter den Dokumenten. Ob der Entwurf noch
              offen ist, sagt der Monitor deshalb nicht.
              <!-- The way to file, which the door card above gives only for
                   a running Frist (24.10.2026). -->
              <template v-if="detail.filing.kind === 'email'">
                Stellungnahmen nimmt <template v-if="detail.filing.recipient">das {{ detail.filing.recipient }}</template><template v-else>das Land</template>
                per E-Mail an <a :href="`mailto:${detail.filing.address}`" class="link-inline font-medium">{{ detail.filing.address }}</a> entgegen.
              </template>
            </p>
            <!-- A closed draft read from a register keeps its start and not
                 its Frist (Salzburg); Kärnten's archive keeps neither. Said,
                 not left blank. -->
            <p v-else-if="!fristFacts.length && detail.draft.startedAt" class="text-sm text-ink-secondary">
              In Begutachtung gegangen am {{ formatDateDe(detail.draft.startedAt) }}. Die Frist nennt das Land nicht mehr.
            </p>
            <!-- The Landtag's own Begutachtung (`runBy`, Kärnten § 18a K-LTGO):
                 its committee sent an Antrag out through the Verfassungsdienst,
                 and the date that places it is that decision, read off the
                 president's letter — never a Regierungsvorlage, which an
                 Antrag does not have. -->
            <p v-else-if="!fristFacts.length && detail.draft.runBy === 'landtag'" class="text-sm text-ink-secondary">
              Diese Begutachtung führt der Landtag: Sein Ausschuss hat den Antrag<template v-if="detail.draft.placedAt">
                am {{ formatDateDe(detail.draft.placedAt) }}</template> in Begutachtung geschickt, versandt hat ihn der
              Verfassungsdienst. Beginn und Frist nennt das Land nicht.
            </p>
            <p v-else-if="!fristFacts.length" class="text-sm text-ink-secondary">
              Weder Beginn noch Frist dieser Begutachtung nennt das Land<template v-if="detail.draft.placedAt">; in der Liste steht der Entwurf beim Datum seiner Regierungsvorlage</template>.
            </p>

            <LandStatements
              :statements="detail.statements"
              :statements-url="detail.statementsUrl"
              :statements-gap="detail.statementsGap"
              :active="detail.draft.active || !!detail.draft.fristUnknown"
              :publication-note="publicationNote"
              :land-name="landName"
            />
          </div>
        </section>

        <!-- The stations after the Begutachtung, one section each, where
             the Land records them (OÖ). -->
        <LandStationSections :draft="detail.draft" :procedure="detail.procedure" :landtag="detail.landtag" :land-name="landName" :land="land" :number="number" :comparisons="detail.comparisons" />
      </template>
    </FetchGate>
  </div>
</template>
