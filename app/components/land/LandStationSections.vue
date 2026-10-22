<script setup lang="ts">
import type { LandCode, LandConsultation, LandLandtag, LandProcedureStep } from '#shared/types'
import type { Fact } from '~/components/ui/FactList.vue'
import { citeLineDe } from '#shared/utils/citations'
import { formatDateDe } from '#shared/utils/format'
import { afterFristDe } from '~/utils/spine'
import ListBox from '~/components/ui/ListBox.vue'

/**
 * The stations after a Land's Begutachtung, one section each, as the
 * Ministerialentwurf's page has them (22.10.2026): „Regierungsvorlage",
 * „Im Landtag", „Im Landesgesetzblatt" — so each row of the bar lands on a
 * heading with its own name.
 *
 * Until the same day the three stood in one section, the Landtag's record
 * as it lists itself. Two reasons took them apart: the Vorlage carries a
 * fact the list only implied — how it stood to the Frist, which on
 * 16120 was ten days BEFORE it ended — and the Kundmachung will exist
 * without any Landtag record once the Landesgesetzblatt is searched for the
 * other Länder (docs/architecture.md §12.43). „Im Landtag" then became
 * what „Im Parlament" is (22.10.2026): a frame of the facts — committee,
 * report, motions, vote — with the whole record folded under it, in the
 * Landtag's order and words.
 *
 * Each section only where there is something in it. No reading of ours:
 * the record's words, its dates, its links — with one exception, said where
 * it stands: a Kundmachung the monitor found itself (`via: 'suche'`).
 */
const props = defineProps<{
  draft: LandConsultation
  /** The Landtag's record, station steps tagged (`ooeStationSteps`). */
  procedure: LandProcedureStep[] | null
  /** What the Landtag did, read from that record (`ooeLandtagOf`). */
  landtag: LandLandtag | null
  landName: string
  /** The draft's address, for the comparison under the Kundmachung. */
  land?: LandCode
  number?: string
}>()

const steps = computed(() => props.procedure ?? [])
const rvStep = computed(() => steps.value.find((s) => s.station === 'rv') ?? null)
/* Whether the Landtag did anything past the Vorlage's arrival and the
   Kundmachung — the section exists only then. */
const landtagSteps = computed(() => steps.value.filter((s) => s.station !== 'rv' && s.station !== 'bgbl'))
const kundmachung = computed(() => {
  const s = props.draft.stage
  return s && s !== 'unknown' && s.station === 'bgbl' && s.detail ? s : null
})

/* „Beilage 1454/2026" — the Landtag's number for the Vorlage, from the
   record's own words. */
const beilage = computed(() => /Beilage\s+(\d+\/\d{4})/.exec(rvStep.value?.label ?? '')?.[1] ?? null)
const rvFacts = computed<Fact[]>(() => {
  const step = rvStep.value
  if (!step) return []
  const span = afterFristDe(props.draft.deadline, step.date, props.draft.startedAt)
  return [
    ...(step.date
      ? [{ key: 'eingelangt', title: 'Eingelangt im Landtag', text: span ? `${formatDateDe(step.date)}, ${span}` : formatDateDe(step.date) }]
      : []),
    ...(step.url ? [{ key: 'vorlage', title: 'Die Vorlage' }] : []),
  ]
})
const lgblFacts: Fact[] = [{ key: 'kundmachung', title: 'Kundgemacht' }]

/* The frame of „Im Landtag", in „Im Parlament"'s order: where it stands,
   the committee, the motions, the vote. A row is missing where the record
   names nothing — never „keine", which a step the record files under
   another wording would turn into a false negative. */
const landtagFacts = computed<Fact[]>(() => {
  const l = props.landtag
  if (!l) return []
  return [
    { key: 'stand', title: 'Stand', text: l.decision ? (l.decision.date ? `Beschlossen am ${formatDateDe(l.decision.date)}` : 'Beschlossen') : 'In Behandlung' },
    ...(l.committee || l.report ? [{ key: 'ausschuss', title: 'Im Ausschuss' }] : []),
    ...(l.motions.length ? [{ key: 'antraege', title: l.motions.length > 1 ? 'Anträge' : 'Antrag' }] : []),
    ...(l.decision?.vote ? [{ key: 'abstimmung', title: 'Abstimmung', text: l.decision.vote }] : []),
  ]
})
/* „Beilage 1420/2026" — what the report is cited by. */
const reportName = computed(() => {
  const r = props.landtag?.report
  return r ? (r.linkText ?? r.label.replace(/^Ausschussbericht\s*/, '')) : null
})
</script>

<template>
  <section
    v-if="rvStep"
    id="regierungsvorlage"
    class="page-section scroll-mt-6"
    aria-labelledby="regierungsvorlage-heading"
  >
    <h2 id="regierungsvorlage-heading" class="section-heading">Regierungsvorlage</h2>
    <div class="mt-4">
      <FactList :facts="rvFacts">
        <template #value-vorlage>
          <ExternalLink :href="rvStep.url!" class="link-inline">
            Regierungsvorlage<template v-if="beilage">, Beilage {{ beilage }}</template>
          </ExternalLink>
        </template>
      </FactList>
    </div>
    <!-- What changed after the Begutachtung: the draft against the
         Vorlage, the comparison the Bund's drafts lead with. -->
    <div v-if="land && number && rvStep.url" class="mt-8">
      <LandLawDiffSection :land="land" :number="number" from="entwurf" to="rv" />
    </div>
  </section>

  <!-- What the Landtag did, as „Im Parlament" says what Parliament did: a
       frame of facts to consult (§12.39), each in the record's words, and
       the record itself folded under it — until 22.10.2026 the record WAS
       the section, a ruled log of sittings and agendas in which the
       committee and the vote had to be found. -->
  <section
    v-if="landtagSteps.length"
    id="landtag"
    class="page-section scroll-mt-6"
    aria-labelledby="landtag-heading"
  >
    <h2 id="landtag-heading" class="section-heading">Im Landtag</h2>
    <div class="mt-4 space-y-8">
      <div v-if="landtagFacts.length">
        <FactList :facts="landtagFacts">
          <template #value-ausschuss>
            <p v-if="landtag?.committee">
              {{ landtag.committee }}<template v-if="landtag.subcommittee">, mit Unterausschuss</template>
            </p>
            <p v-if="landtag?.report && reportName">
              Bericht
              <ExternalLink v-if="landtag.report.url" :href="landtag.report.url" class="link-inline">{{ reportName }}</ExternalLink><template v-else>{{ reportName }}</template><template v-if="landtag.report.date">, {{ formatDateDe(landtag.report.date) }}</template>
            </p>
          </template>
          <template v-if="landtag?.motions.length" #value-antraege>
            <ul class="space-y-1">
              <li v-for="(m, i) in landtag.motions" :key="i">
                <LandStepText :step="m" />
              </li>
            </ul>
          </template>
        </FactList>
        <SectionCredits :sources="[]" :marked="false">
          <span>Quelle: Landtag {{ landName }}, wie er das Verfahren selbst verzeichnet</span>
        </SectionCredits>
      </div>
      <!-- What the committee changed: the Vorlage against the text in its
           report. Not against the Kundmachung, which adds the editing for
           publication („Hektar" → „ha") — not the committee's (§12.44). -->
      <LandLawDiffSection v-if="land && number && landtag?.report?.url && rvStep?.url" :land="land" :number="number" from="rv" to="ausschuss" />
      <!-- Every step, in the Landtag's order and words: the sittings,
           agendas and Wortprotokolle the frame leaves out. On the sheet the
           Land's Stellungnahmen stand on (22.10.2026), with their date
           track: a dated row that opens a document is the same row in both
           lists. Bare, the rows floated on the paper with nothing to end
           them. The link stays where the record puts it, inside the
           sentence — a step linked as a whole has no name a column of its
           own could carry. -->
      <FoldSection :heading="`Alle Schritte im Landtag (${steps.length})`">
        <div class="pb-2">
          <ListBox class="@container/list">
            <ol class="divide-y divide-hairline text-sm">
              <li
                v-for="(step, i) in steps"
                :key="i"
                class="grid grid-cols-1 items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5 row-cols:grid-cols-[6rem_minmax(0,1fr)]"
              >
                <span class="tabular-nums text-ink-muted">{{ formatDateDe(step.date) }}</span>
                <span class="min-w-0 text-ink"><LandStepText :step="step" /></span>
              </li>
            </ol>
          </ListBox>
        </div>
      </FoldSection>
    </div>
  </section>

  <!-- The Kundmachung in RIS, citable, as the Bund's „Im
       Bundesgesetzblatt". From the Landtag's record today; the section does
       not depend on it, so a Kundmachung found another way can stand here
       too. -->
  <section
    v-if="kundmachung"
    id="landesgesetzblatt"
    class="page-section scroll-mt-6"
    aria-labelledby="lgbl-heading"
  >
    <h2 id="lgbl-heading" class="section-heading">Im Landesgesetzblatt</h2>
    <div class="mt-4">
      <FactList :facts="lgblFacts">
        <template #value-kundmachung>
          <!-- Flex row like every line with „Zitieren" (`CiteButton`). -->
          <p class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              <ExternalLink v-if="kundmachung.url" :href="kundmachung.url" class="link-inline">{{ kundmachung.detail }}</ExternalLink><template v-else>{{ kundmachung.detail }}</template><template v-if="kundmachung.date">, am {{ formatDateDe(kundmachung.date) }}</template>
            </span>
            <CiteButton
              v-if="kundmachung.url"
              :text="citeLineDe(kundmachung.detail, kundmachung.url)"
              subject="Das Landesgesetzblatt"
            />
          </p>
        </template>
      </FactList>
      <!-- Whose finding it is: the Land records nothing after the
           Begutachtung, so the assignment is ours, by title (§12.43) — and
           can be wrong where the same law changed twice within two years. -->
      <p v-if="kundmachung.via === 'suche'" class="mt-3 text-sm text-ink-secondary">
        Vom Monitor über den Titel im Rechtsinformationssystem gefunden – das Land
        selbst ordnet seine Entwürfe keiner Kundmachung zu. Wurde dasselbe Gesetz
        kurz hintereinander zweimal geändert, kann die Zuordnung die frühere
        Änderung treffen.
      </p>
    </div>
    <!-- What became of the draft, § by § — only where the Land itself names
         the Kundmachung (`landLawDiffService`): against a Kundmachung of
         our own finding, a wrong match would report a whole law rewritten. -->
    <div v-if="kundmachung.via !== 'suche' && land && number" class="mt-8">
      <LandLawDiffSection :land="land" :number="number" from="entwurf" to="lgbl" />
    </div>
  </section>
</template>
