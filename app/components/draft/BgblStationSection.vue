<script setup lang="ts">
import type { BgblLawsResponse, EnactmentInfo, LawStationId } from '#shared/types'
import type { Fact } from '~/components/ui/FactList.vue'
import { risSource, type SourceEntry } from '#shared/utils/provenance'
import { bgblEliUrl, bgblShortDe, citeLineDe } from '#shared/utils/citations'

/**
 * „Im Bundesgesetzblatt" of the draft page (04.10.2026, out of the page).
 *
 * Short by design: the end of the story, and one line is all of it. It used
 * to be a line inside the Regierungsvorlage card, where the law itself was a
 * footnote to the draft for it. Since 21.10.2026 it also carries the
 * "so steht das Gesetz heute" link into RIS Bundesrecht it was planned for:
 * „Geltende Fassung", one link per law the BGBl changed.
 *
 * Also where the Vorlage's own Beschluss was not promulgated and Parliament
 * names the Antrag that replaced it, once that Antrag is in the
 * Bundesgesetzblatt (80 d.B. → 416/A → BGBl. I Nr. 65/2025, §12.33,
 * 03.10.2026): the text did become law, on a route Parliament states. The
 * section says which route.
 *
 * The page decides whether it renders (`sections.bgbl`, which the bar's
 * anchors read too) and hands in the Vorlage it renders for.
 */
const props = defineProps<{
  /** The draft's Regierungsvorlage, with its own or its successor's BGBl number. */
  enactment: EnactmentInfo
  gp: string
  inr: number
  /** Parliament's versions, in order (`parliamentTexts`). */
  parliamentTexts: LawStationId[]
}>()

/* „BGBl. I Nr. 69/2026, https://www.ris.bka.gv.at/eli/bgbl/I/2026/69" — the
 * ELI address, where the link beside it opens the same document through
 * RIS's internal number; the link the reader already has where ELI has none
 * (21.10.2026). */
/* The laws the BGBl changed, each at its geltende Fassung in RIS
 * (21.10.2026; „Kundgemacht" led to the Bundesgesetzblatt alone). Asked
 * for by readers who work with the law as it stands, not with the
 * amendment. Client-side and lazy like „Geltendes Recht" on the draft: the
 * RIS search behind it walks pages for a Sammelgesetz. Read from the BGBl,
 * not the draft's list — Artikel come and go between the two
 * (`ris/bgblLaws.ts`). */
const { data: fassung } = await useFetch<BgblLawsResponse>(
  () => `/api/drafts/${props.gp}/${props.inr}/geltende-fassung`,
  { lazy: true, server: false },
)

const FASSUNG_SOURCES: SourceEntry[] = [risSource('Geltende Fassung')]

const facts = computed<Fact[]>(() => {
  const f = fassung.value
  const out: Fact[] = [{ key: 'kundmachung', title: 'Kundgemacht' }]
  if (!f?.bgbl) return out
  if (!f.laws.length) {
    // RIS consolidates after the Kundmachung, with a lag of days to weeks;
    // until then there is no Fassung carrying this change to link.
    return [...out, { key: 'fassung', title: 'Geltende Fassung', text: 'Im RIS noch nicht eingearbeitet: Die konsolidierte Fassung folgt der Kundmachung mit einigen Tagen Verzug.' }]
  }
  return [...out, { key: 'fassung', title: f.laws.length === 1 ? 'Geltende Fassung' : `Geltende Fassung, ${f.laws.length} Gesetze` }]
})

function bgblCite(number: string | null, risUrl: string | null): string | null {
  if (!number) return null
  const url = bgblEliUrl(number) ?? risUrl
  return url ? citeLineDe(bgblShortDe(number) ?? number, url) : null
}
</script>

<template>
  <section
    id="bundesgesetzblatt"
    class="page-section scroll-mt-6"
    aria-labelledby="bgbl-heading"
  >
    <h2 id="bgbl-heading" class="section-heading">Im Bundesgesetzblatt</h2>
    <div class="mt-4 space-y-8">
      <div>
        <FactList :facts="facts">
          <template #value-kundmachung>
            <!-- Flex rows like every line with „Zitieren": the button's
                 overhang (`CiteButton`) centres on the line only in one. -->
            <p v-if="enactment.bgblNumber" class="flex flex-wrap items-center gap-x-3 gap-y-1">
              <ExternalLink
                v-if="enactment.bgblRisUrl"
                :href="enactment.bgblRisUrl"
                class="link-inline"
              >{{ enactment.bgblNumber }}</ExternalLink><span v-else>{{ enactment.bgblNumber }}</span>
              <CiteButton
                v-if="bgblCite(enactment.bgblNumber, enactment.bgblRisUrl)"
                :text="bgblCite(enactment.bgblNumber, enactment.bgblRisUrl)!"
                subject="Das Bundesgesetzblatt"
              />
            </p>
            <p v-else-if="enactment.successor?.bgblNumber" class="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>
                <ExternalLink
                  v-if="enactment.successor.bgblRisUrl"
                  :href="enactment.successor.bgblRisUrl"
                  class="link-inline"
                >{{ enactment.successor.bgblNumber }}</ExternalLink><span v-else>{{ enactment.successor.bgblNumber }}</span>,
                über Initiativantrag
                <ExternalLink :href="enactment.successor.url" class="link-inline">{{ enactment.successor.citation }}</ExternalLink>
              </span>
              <CiteButton
                v-if="bgblCite(enactment.successor.bgblNumber, enactment.successor.bgblRisUrl)"
                :text="bgblCite(enactment.successor.bgblNumber, enactment.successor.bgblRisUrl)!"
                subject="Das Bundesgesetzblatt"
              />
            </p>
          </template>
          <template #value-fassung>
            <GeltendeFassungList :laws="fassung!.laws" />
          </template>
        </FactList>
        <!-- Which version the links open is provenance: the credit line under
             the frame, as under „Geltendes Recht" on the draft. Today's, so the
             change this BGBl made is in it — and every one after it. -->
        <SectionCredits v-if="fassung?.laws.length" :sources="FASSUNG_SOURCES" :marked="false">
          <span>Verlinkt in der heute geltenden Fassung</span>
        </SectionCredits>
      </div>
      <!-- The one comparison that is no step: the whole way from the draft
           to the law, at the station where „what became of it" can first
           be answered in full (`lawDiffSteps`, 01.10.2026). The steps and
           who took them stand in the sections above. Deferred, as the
           parliament's. -->
      <!-- Only for the Vorlage's own Kundmachung. The comparison reads
           the number off the Vorlage's record itself (`lawDiffService`),
           and a successor Antrag is a text of its own: holding the
           Vorlage against it would compare two different bills. -->
      <LawDiffSection
        v-if="enactment.bgblNumber"
        :gp="gp"
        :inr="inr"
        scope="bgbl"
        :parliament-texts="parliamentTexts"
        deferred
      />
    </div>
  </section>
</template>
