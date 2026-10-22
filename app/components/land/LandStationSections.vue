<script setup lang="ts">
import type { LandConsultation, LandProcedureStep } from '#shared/types'
import type { Fact } from '~/components/ui/FactList.vue'
import { citeLineDe } from '#shared/utils/citations'
import { formatDateDe } from '#shared/utils/format'
import { afterFristDe } from '~/utils/spine'

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
 * other Länder (docs/architecture.md §12.43). The record's order survives:
 * the three sections follow it, and only the two steps that are stations
 * leave the list.
 *
 * Each section only where there is something in it. No reading of ours:
 * the record's words, its dates, its links — with one exception, said where
 * it stands: a Kundmachung the monitor found itself (`via: 'suche'`).
 */
const props = defineProps<{
  draft: LandConsultation
  /** The Landtag's record, station steps tagged (`ooeStationSteps`). */
  procedure: LandProcedureStep[] | null
  landName: string
}>()

const steps = computed(() => props.procedure ?? [])
const rvStep = computed(() => steps.value.find((s) => s.station === 'rv') ?? null)
/* The record without the two steps that have sections of their own. The
   Beschluss stays: it is the Landtag's own act, and the bar's row lands on
   its line. */
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
  </section>

  <!-- What came after, as the Landtag records it: sittings, committee,
       Beschluss — its words and dates, in its order. No claim about what
       changed between the draft and the Vorlage. -->
  <section
    v-if="landtagSteps.length"
    id="landtag"
    class="page-section scroll-mt-6"
    aria-labelledby="landtag-heading"
  >
    <h2 id="landtag-heading" class="section-heading">Im Landtag</h2>
    <ol class="mt-4 divide-y divide-hairline border-y border-hairline">
      <!-- A station's step wears the highlighter when the bar's row led
           here, as a linked Stellungnahme does (StatementRow). -->
      <li
        v-for="(step, i) in landtagSteps"
        :id="step.station ? `landtag-${step.station}` : undefined"
        :key="i"
        class="flex scroll-mt-24 gap-4 py-2 text-sm target:bg-mark-wash"
      >
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
  </section>
</template>
