<script setup lang="ts">
import type { BgblLawsResponse, BgblOutcome } from '#shared/types'
import type { Fact } from '~/components/ui/FactList.vue'
import { formatDateDe } from '#shared/utils/format'
import { bgblEliUrl, bgblShortDe, citeLineDe } from '#shared/utils/citations'
import { risSource, type SourceEntry } from '#shared/utils/provenance'

/**
 * „Im Bundesgesetzblatt" of a Verordnungsentwurf's page (21.10.2026) — the
 * anatomy of the law's section (`BgblStationSection`): the Kundmachung with
 * its citation, then the geltende Fassung of what it changed.
 *
 * Until then the Kundmachung stood only in the rail's last row, with a link
 * out; a single link was all there was. With a citation and the laws in
 * force there is more than a row should carry — the rail summarises, the
 * section holds the details and the controls, as on the Ministerialentwurf's
 * page. The row links here.
 *
 * Rendered by the page only for a Kundmachung (`kundgemacht` with a number).
 */
const props = defineProps<{
  outcome: BgblOutcome
  /** The laws it changed, client-side and lazy; null while they load. */
  fassung: BgblLawsResponse | null
}>()

const nummer = computed(() => bgblShortDe(props.outcome.nummer ?? '') ?? props.outcome.nummer ?? '')

/* „BGBl. II Nr. 305/2026, https://www.ris.bka.gv.at/eli/bgbl/II/2026/305" —
 * the ELI address, as for the law (`BgblStationSection`). */
const cite = computed(() => {
  const url = bgblEliUrl(props.outcome.nummer ?? '') ?? props.outcome.url
  return url ? citeLineDe(nummer.value, url) : null
})

const FASSUNG_SOURCES: SourceEntry[] = [risSource('Geltende Fassung')]

/* One word for the title and the list's fold, which said „Gesetze" here
 * under a title counting „Verordnungen" (`GeltendeFassungList`). */
const FASSUNG_NOUN = 'Verordnungen'

const facts = computed<Fact[]>(() => {
  const out: Fact[] = [{ key: 'kundmachung', title: 'Kundgemacht' }]
  const f = props.fassung
  if (!f?.bgbl) return out
  if (!f.laws.length) {
    return [...out, { key: 'fassung', title: 'Geltende Fassung', text: 'Im RIS noch nicht eingearbeitet: Die konsolidierte Fassung folgt der Kundmachung mit einigen Tagen Verzug.' }]
  }
  return [...out, { key: 'fassung', title: f.laws.length === 1 ? 'Geltende Fassung' : `Geltende Fassung, ${f.laws.length} ${FASSUNG_NOUN}` }]
})
</script>

<template>
  <section
    id="bundesgesetzblatt"
    class="page-section scroll-mt-6"
    aria-labelledby="bgbl-heading"
  >
    <h2 id="bgbl-heading" class="section-heading">Im Bundesgesetzblatt</h2>
    <div class="mt-4">
      <FactList :facts="facts">
        <template #value-kundmachung>
          <p class="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              <ExternalLink v-if="outcome.url" :href="outcome.url" class="link-inline">{{ nummer }}</ExternalLink><span v-else>{{ nummer }}</span><template v-if="outcome.datum">, {{ formatDateDe(outcome.datum) }}</template>
            </span>
            <CiteButton v-if="cite" :text="cite" subject="Die Kundmachung" />
          </p>
        </template>
        <!-- Only with laws to list, or the empty slot hides the fact's
             „noch nicht eingearbeitet" (`BgblStationSection`). -->
        <template v-if="fassung?.laws.length" #value-fassung>
          <GeltendeFassungList :laws="fassung.laws" :noun="FASSUNG_NOUN" />
        </template>
      </FactList>
      <SectionCredits v-if="fassung?.laws.length" :sources="FASSUNG_SOURCES" :marked="false">
        <span>Verlinkt in der heute geltenden Fassung</span>
      </SectionCredits>
    </div>
  </section>
</template>
