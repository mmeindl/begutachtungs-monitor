<script setup lang="ts">
import type { EnactmentInfo, LawStationId } from '#shared/types'

/**
 * „Im Bundesgesetzblatt" of the draft page (04.10.2026, out of the page).
 *
 * Short by design: the end of the story, and one line is all of it. It used
 * to be a line inside the Regierungsvorlage card, where the law itself was a
 * footnote to the draft for it. This is also the natural home for a later
 * "so steht das Gesetz heute" link into RIS Bundesrecht.
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
defineProps<{
  /** The draft's Regierungsvorlage, with its own or its successor's BGBl number. */
  enactment: EnactmentInfo
  gp: string
  inr: number
  /** Parliament's versions, in order (`parliamentTexts`). */
  parliamentTexts: LawStationId[]
}>()
</script>

<template>
  <section
    id="bundesgesetzblatt"
    class="page-section scroll-mt-6"
    aria-labelledby="bgbl-heading"
  >
    <h2 id="bgbl-heading" class="section-heading">Im Bundesgesetzblatt</h2>
    <div class="mt-4 space-y-8">
      <FactList :facts="[{ key: 'kundmachung', title: 'Kundgemacht' }]">
        <template #value-kundmachung>
          <p v-if="enactment.bgblNumber">
            <ExternalLink
              v-if="enactment.bgblRisUrl"
              :href="enactment.bgblRisUrl"
              class="link-inline"
            >{{ enactment.bgblNumber }}</ExternalLink><span v-else>{{ enactment.bgblNumber }}</span>
          </p>
          <p v-else-if="enactment.successor?.bgblNumber">
            <ExternalLink
              v-if="enactment.successor.bgblRisUrl"
              :href="enactment.successor.bgblRisUrl"
              class="link-inline"
            >{{ enactment.successor.bgblNumber }}</ExternalLink><span v-else>{{ enactment.successor.bgblNumber }}</span>,
            über Initiativantrag
            <ExternalLink :href="enactment.successor.url" class="link-inline">{{ enactment.successor.citation }}</ExternalLink>
          </p>
        </template>
      </FactList>
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
