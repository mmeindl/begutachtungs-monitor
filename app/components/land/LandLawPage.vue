<script setup lang="ts">
import type { BgblLawsResponse, LandCode, LandLawDetail } from '#shared/types'
import type { Fact } from '~/components/ui/FactList.vue'
import type { ComparisonId, StationId } from '~/utils/spine'
import { landLawStations } from '~/utils/spine'
import { LAND_NAME, landLawName, landLawPath } from '#shared/utils/laender'
import { citeLineDe } from '#shared/utils/citations'
import { formatDateDe } from '#shared/utils/format'
import { risSource } from '#shared/utils/provenance'
import { displayId } from '#shared/utils/unitName'
import { fassungSources } from '~/utils/geltendeFassung'
import { landFassungFacts } from '~/utils/landLaw'

/**
 * A Landesgesetz without a draft in the Land's register (10.11.2026,
 * docs/architecture.md §12.70), behind `/entwuerfe/<land>/lgbl/<year>/<nr>`
 * — from RIS alone, for every Land.
 *
 * The Land draft page's frame and the Bund's page of a law without a
 * Begutachtung (§12.69) in one: header, the procedure
 * card (its first station the Begutachtung, pale where none is known),
 * „Das Gesetz", „Im Landtag", „Im Landesgesetzblatt". What RIS does not
 * hold for this Land or year, the section says in one neutral sentence —
 * never a gap left blank that would read as „none".
 *
 * A law that a draft of the register joins to has its story on the draft's
 * page: the page moves there (301), as a Vorlage with a Ministerialentwurf
 * does on the Bund's side.
 */
const props = defineProps<{
  land: LandCode
  year: string
  nr: string
}>()

const url = computed(() => `/api/laender/${props.land}/lgbl/${props.year}/${props.nr}`)
const { data, error, refresh, status } = await useFetch<LandLawDetail>(url, { lazy: true })

const notFound = () => createError({ statusCode: 404, statusMessage: 'Gesetz nicht gefunden', fatal: true })
if (error.value?.statusCode === 404) throw notFound()
watch(error, (e) => {
  if (e?.statusCode === 404) showError(notFound())
})

if (data.value?.draftPath) await navigateTo(data.value.draftPath, { redirectCode: 301, replace: true })
watch(() => data.value?.draftPath, (path) => {
  if (path) navigateTo(path, { replace: true })
})

/* The Landtag documents of a Salzburg law may still be being read
   (`pending`): ask again, a bounded number of times, as the list does. */
const RETRY_MS = 20_000
const RETRIES = 3
let retries = 0
let timer: ReturnType<typeof setTimeout> | undefined
watch(data, (d) => {
  clearTimeout(timer)
  const b = d?.law.begutachtung
  if (!import.meta.client || b?.kind !== 'silent' || b.reason !== 'pending' || retries >= RETRIES) return
  retries++
  timer = setTimeout(() => void refresh(), RETRY_MS)
}, { immediate: true })
onUnmounted(() => clearTimeout(timer))

const landName = computed(() => LAND_NAME[props.land])
const law = computed(() => data.value?.law ?? null)
const heading = computed(() => (law.value ? landLawName(law.value) : 'Landesgesetz'))
const citeAs = computed(() => (law.value ? `${law.value.nr} (${landName.value})` : ''))
/* The law's address in the comparison API (`LandLawDiffSection`): its page's own. */
const lawNumber = computed(() => `lgbl/${props.year}/${props.nr}`)

const stations = computed(() => (data.value ? landLawStations(data.value.law, data.value.procedure, data.value.comparisons) : []))
const offersVorlage = computed(() => (data.value?.comparisons ?? []).some(([a, b]) => a === 'rv' && b === 'lgbl'))
const anchors = computed<Partial<Record<StationId, string>>>(() => ({ rv: '#landtag', parlament: '#landtag', bgbl: '#landesgesetzblatt' }))
const comparisonAnchors = computed<Partial<Record<ComparisonId, string>>>(() => (offersVorlage.value ? { parlament: '#textvergleich-landtag' } : {}))

/* „Im Landtag": how it came, the committee, the motions, the Beschluss —
   each in RIS's or the report's words, each only where there; where RIS
   gives nothing for a row the reader needs, one sentence says so. */
const landtagFacts = computed<Fact[]>(() => {
  const d = data.value
  if (!d) return []
  const l = d.landtag
  return [
    { key: 'weg', title: 'Eingebracht' },
    ...(l?.committee || l?.report ? [{ key: 'ausschuss', title: 'Im Ausschuss' }] : []),
    ...(l?.motions.length ? [{ key: 'antraege', title: l.motions.length > 1 ? 'Anträge' : 'Antrag' }] : []),
    { key: 'beschluss', title: 'Beschluss', text: l?.decision?.date ? `${formatDateDe(l.decision.date)}${l.decision.vote ? `, ${l.decision.vote.replace(/^./, (c) => c.toLowerCase())}` : ''}` : undefined },
    ...(d.materials || d.materialsText ? [{ key: 'materialien', title: 'Unterlagen des Landtags' }] : []),
  ]
})
const reportName = computed(() => {
  const r = data.value?.landtag?.report
  return r ? (r.linkText ?? r.label.replace(/^Ausschussbericht,?\s*/, '')) : null
})
/* The record's steps beyond the frame, where a report was read (Salzburg). */
const fromReport = computed(() => data.value?.procedureFrom === 'bericht')
const steps = computed(() => (fromReport.value ? data.value!.procedure : []))

/* The laws it changed, at their geltende Fassung — lazy, client-side, as on
   the Bund's page (`BgblStationSection`). */
const { data: fassung, error: fassungError } = useFetch<BgblLawsResponse>(() => `${url.value}/geltende-fassung`, { lazy: true, server: false })
const fassungRows = computed<Fact[]>(() => landFassungFacts(fassung.value, law.value?.date ?? null))
const fassungCredits = computed(() => fassungSources(fassung.value))

const lgblFacts: Fact[] = [{ key: 'kundmachung', title: 'Kundgemacht' }]

useSeoMeta({
  title: () => (law.value ? `${heading.value} (${law.value.nr})` : 'Landesgesetz'),
  description: () => (law.value ? `${law.value.typ} des Landes ${landName.value}, ${law.value.nr}: Verlauf im Landtag und Text, wie kundgemacht.` : undefined),
  ogTitle: () => law.value?.title ?? 'Landesgesetz',
})
</script>

<template>
  <div class="mx-auto w-full max-w-3xl">
    <FetchGate
      :status="status"
      :error="error"
      :data="data"
      loading-label="Gesetz wird geladen …"
      @retry="refresh()"
    >
      <template #loading="{ label }">
        <DraftSkeleton :label="label" />
      </template>
      <template #default="{ data: detail }">
        <article>
          <BackLink to="/entwuerfe" label="Alle Entwürfe" />
          <DraftHeader :title="heading">
            <template #source>
              <span class="inline-flex flex-wrap items-center gap-x-4">
                <ExternalLink v-if="detail.law.url" :href="detail.law.url" class="link-inline tap-target">Im RIS ansehen</ExternalLink>
                <CiteButton
                  :text="citeLineDe(citeAs, detail.law.title, detail.law.url ?? landLawPath(land, detail.law))"
                  subject="Das Gesetz"
                />
              </span>
            </template>
            <template #identity>
              <span class="text-sm font-medium text-ink-muted">
                <span class="text-ink">{{ detail.law.typ }}</span> · Land {{ landName }}
              </span>
            </template>
            <p v-if="detail.law.title !== heading" class="mt-1 text-sm text-ink-secondary">
              {{ detail.law.title }}
            </p>
          </DraftHeader>

          <!-- What is known about a Begutachtung before the law stands once,
               as the card's first station (`landLawBegutachtungFacts`): pale
               where none took place or none can be told. -->
          <ProcedureCard
            status="Gesetz geworden"
            :stations="stations"
            :anchors="anchors"
            :comparison-anchors="comparisonAnchors"
            how-to="/so-funktionierts#laender"
          />

          <section id="gesetz" class="page-section scroll-mt-6" aria-labelledby="gesetz-heading">
            <h2 id="gesetz-heading" class="section-heading">Das Gesetz</h2>
            <div class="mt-4 space-y-8">
              <!-- What it changes: the Artikel of a package name each law;
                   a law without Artikel names its law in the title — no
                   reader of ours derives more, and the page says so. -->
              <!-- What it changed, created or repealed, each law at its
                   geltende Fassung — as RIS's consolidation itself ties them
                   to this Landesgesetzblatt (`landKonsLaws.ts`), never a name
                   read off a title. Lazy, as on the Bund's page. -->
              <PageSubsection heading="Was das Gesetz ändert">
                <div v-if="fassung">
                  <FactList :facts="fassungRows">
                    <template v-if="fassung.laws.length" #value-fassung>
                      <GeltendeFassungList :laws="fassung.laws" noun="Gesetze" />
                    </template>
                  </FactList>
                  <SectionCredits v-if="fassungCredits.length" :sources="fassungCredits" :marked="false">
                    <span v-if="fassung.laws.length">Verlinkt in der heute geltenden Fassung</span>
                  </SectionCredits>
                </div>
                <p v-else-if="fassungError" class="text-sm text-ink-secondary">
                  Welche Gesetze es ändert, ist gerade nicht aus dem Rechtsinformationssystem abrufbar.
                </p>
                <div v-else class="h-12 animate-pulse rounded-xl bg-hairline motion-reduce:animate-none" aria-hidden="true" />
              </PageSubsection>
              <FoldSection v-if="detail.text?.length" :heading="`Gesetzestext, wie kundgemacht (${detail.text.reduce((n, g) => n + g.units.length, 0)})`">
                <div class="space-y-6 pb-2">
                  <div v-for="(g, i) in detail.text" :key="i">
                    <p v-if="g.article" class="text-sm font-semibold text-ink">{{ g.article }}</p>
                    <dl class="mt-2 space-y-3 text-sm">
                      <div v-for="u in g.units" :key="u.id">
                        <dt class="font-medium text-ink">{{ displayId(u.id) }}<template v-if="u.heading"> – {{ u.heading }}</template></dt>
                        <dd class="mt-0.5 whitespace-pre-line text-ink-secondary">{{ u.text }}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </FoldSection>
              <p v-else-if="!detail.text" class="text-sm text-ink-secondary">
                Den Text dieses Gesetzes konnte der Monitor gerade nicht aus dem Rechtsinformationssystem lesen; er steht dort unter dem Link oben.
              </p>
              <SectionCredits v-if="detail.text?.length" :sources="[risSource('Gesetzestext')]" :marked="false" />
            </div>
          </section>

          <section id="landtag" class="page-section scroll-mt-6" aria-labelledby="landtag-heading">
            <h2 id="landtag-heading" class="section-heading">Im Landtag</h2>
            <div class="mt-4 space-y-8">
              <div>
                <FactList :facts="landtagFacts">
                  <template #value-weg>
                    <p v-if="detail.law.route">
                      Als
                      <ExternalLink v-if="detail.law.route.url" :href="detail.law.route.url" class="link-inline">{{ detail.law.route.kind === 'vorlage' ? 'Regierungsvorlage' : 'Initiativantrag' }}<template v-if="detail.law.route.number"> {{ detail.law.route.number }}</template></ExternalLink><template v-else>{{ detail.law.route.kind === 'vorlage' ? 'Regierungsvorlage' : 'Initiativantrag' }}<template v-if="detail.law.route.number"> {{ detail.law.route.number }}</template></template>
                    </p>
                    <p v-if="detail.law.route && !detail.law.route.url" class="text-ink-secondary">
                      {{ detail.law.route.kind === 'vorlage' ? 'Die Regierungsvorlage' : 'Der Initiativantrag' }} ist im RIS nicht verlinkt.
                    </p>
                    <p v-if="!detail.law.route" class="text-ink-secondary">
                      Ob das Gesetz als Regierungsvorlage oder als Initiativantrag in den Landtag kam, nennt das RIS {{ land === 'w' ? 'nur bei Initiativanträgen' : 'für dieses Gesetz nicht' }}.
                    </p>
                  </template>
                  <template #value-ausschuss>
                    <p v-if="detail.landtag?.committee">{{ detail.landtag.committee }}</p>
                    <p v-if="detail.landtag?.report && reportName">
                      Bericht
                      <ExternalLink v-if="detail.landtag.report.url" :href="detail.landtag.report.url" class="link-inline">{{ reportName }}</ExternalLink><template v-else>{{ reportName }}</template><template v-if="detail.landtag.report.date">, {{ formatDateDe(detail.landtag.report.date) }}</template>
                    </p>
                    <p v-if="detail.landtag?.report && !detail.landtag.report.url" class="text-ink-secondary">Der Bericht ist im RIS nicht verlinkt.</p>
                  </template>
                  <template v-if="detail.landtag?.motions.length" #value-antraege>
                    <ul class="space-y-1">
                      <li v-for="(m, i) in detail.landtag.motions" :key="i"><LandStepText :step="m" /></li>
                    </ul>
                  </template>
                  <template v-if="!detail.landtag?.decision?.date" #value-beschluss>
                    <p class="text-ink-secondary">Den Tag des Beschlusses nennt das RIS für dieses Gesetz nicht.</p>
                  </template>
                  <template #value-materialien>
                    <p v-if="detail.materials">
                      <ExternalLink :href="detail.materials.url" class="link-inline">{{ detail.materials.label }}</ExternalLink>
                    </p>
                    <p v-else-if="detail.materialsText">{{ detail.materialsText }}</p>
                  </template>
                </FactList>
                <SectionCredits :sources="[]" :marked="false">
                  <span v-if="fromReport">Quelle: Bericht des Ausschusses, mit Regierungsvorlage und Landesgesetzblatt im Rechtsinformationssystem verknüpft</span>
                  <span v-else>Quelle: RIS, Angaben zum Landesgesetzblatt</span>
                </SectionCredits>
              </div>
              <!-- What the Landtag changed: the Vorlage against the
                   Kundmachung, as on a Salzburg draft's page (`rv → lgbl`). -->
              <LandLawDiffSection v-if="offersVorlage" :land="land" :number="lawNumber" from="rv" to="lgbl" />
              <FoldSection v-if="steps.length" :heading="`Alle Schritte im Landtag (${steps.length})`">
                <ol class="space-y-1.5 pb-2 text-sm">
                  <li v-for="(step, i) in steps" :key="i" class="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3">
                    <span class="tabular-nums text-ink-muted">{{ formatDateDe(step.date) }}</span>
                    <span class="min-w-0 text-ink"><LandStepText :step="step" /></span>
                  </li>
                </ol>
              </FoldSection>
            </div>
          </section>

          <section id="landesgesetzblatt" class="page-section scroll-mt-6" aria-labelledby="lgbl-heading">
            <h2 id="lgbl-heading" class="section-heading">Im Landesgesetzblatt</h2>
            <div class="mt-4">
              <FactList :facts="lgblFacts">
                <template #value-kundmachung>
                  <p class="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>
                      <ExternalLink v-if="detail.law.url" :href="detail.law.url" class="link-inline">{{ detail.law.nr }}</ExternalLink><template v-else>{{ detail.law.nr }}</template>, am {{ formatDateDe(detail.law.date) }}
                    </span>
                    <CiteButton v-if="detail.law.url" :text="citeLineDe(detail.law.nr, detail.law.url)" subject="Das Landesgesetzblatt" />
                  </p>
                </template>
              </FactList>
              <SectionCredits :sources="[risSource('Landesgesetzblatt')]" :marked="false" />
            </div>
          </section>
        </article>
      </template>
    </FetchGate>
  </div>
</template>
