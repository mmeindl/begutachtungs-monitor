<script setup lang="ts">
import type { AmendedLawsResponse, EuRechtResponse, LandBundesrechtResponse } from '#shared/types'
import { formatDateDe } from '#shared/utils/format'
import { entwurfFrameCredits, entwurfFrameView } from '~/utils/entwurfFrame'
import type { EuTimelineContext } from '~/utils/euRecht'
import { BUNDESRECHT_FACT_ANCHOR, EU_FACT_ANCHOR } from '~/utils/origin'

/**
 * The opening frame of „Der Entwurf" — the section's lede, in the unfilled
 * hairline frame of the facts you consult (box grammar, 03.10.2026), with
 * its credit line under the edge. `AmendedLawsFrame` until 06.11.2026, when
 * the draft's origin joined the law it changes (docs/architecture.md
 * §12.66, §12.67): the rows mirror the Entwurf station's line — „Ändert" ·
 * „Setzt EU-Recht um" (the marker's own words: acts, related counts, the
 * deadline strip and its footnotes inside the frame, as the Frist bar sits
 * in the Begutachtung's) · on a Land's draft „Führt aus" (Grundsatzgesetze)
 * and „Setzt um" (Art.-15a agreements).
 *
 * Keeps `id="recht"`: that anchor is in circulation; the rows carry
 * `eu-recht-fakt` and `bundesrecht-fakt`. A Sammelgesetz names forty laws;
 * past five the rest fold. Renders nothing without a row.
 */
const props = defineProps<{
  laws?: AmendedLawsResponse | null
  eu?: EuRechtResponse | null
  bundesrecht?: LandBundesrechtResponse | null
  /** The page's side of the EU strip; without it the dates stay a row of text. */
  timeline?: EuTimelineContext | null
  /** A Land's draft: who published the documents read, „Land Tirol". */
  publisher?: string | null
}>()

const LAW_FOLD_AT = 5
const view = computed(() => entwurfFrameView(props))
const credits = computed(() => entwurfFrameCredits(props, view.value))
const euId = EU_FACT_ANCHOR.slice(1)
const bundId = BUNDESRECHT_FACT_ANCHOR.slice(1)
</script>

<template>
  <div v-if="view.facts.length">
    <FactList id="recht" :facts="view.facts" class="scroll-mt-6">
      <template v-if="laws" #value-recht>
        <ul role="list" class="mt-1 space-y-2">
          <li v-for="law in laws.laws.slice(0, LAW_FOLD_AT)" :key="law.title">
            <AmendedLawLine :law="law" />
          </li>
        </ul>
        <Disclosure v-if="laws.laws.length > LAW_FOLD_AT" class="mt-2">
          <template #summary>
            <span class="group-open:hidden">Alle {{ laws.laws.length }} Gesetze anzeigen</span>
            <span class="hidden group-open:inline">Weniger anzeigen</span>
          </template>
          <ul role="list" class="mt-1 space-y-2">
            <li v-for="law in laws.laws.slice(LAW_FOLD_AT)" :key="law.title">
              <AmendedLawLine :law="law" />
            </li>
          </ul>
        </Disclosure>
      </template>
      <template #value-eu>
        <div :id="euId" class="mt-1 scroll-mt-6">
          <DraftEuFact :data="eu" :timeline="timeline" />
        </div>
      </template>
      <template #value-fuehrt-aus>
        <ul :id="bundId" role="list" class="mt-1 scroll-mt-6 space-y-1 text-ink-secondary">
          <li v-for="r in view.fuehrtAus" :key="r.key">
            <NuxtLink v-if="r.path" :to="r.path" class="link-inline">{{ r.label }}</NuxtLink><template v-else>{{ r.label }}</template>{{ r.citation }}<template v-if="r.partial">, teilweise</template>
          </li>
        </ul>
      </template>
      <template #value-setzt-um>
        <ul :id="view.fuehrtAus.length ? undefined : bundId" role="list" class="mt-1 scroll-mt-6 space-y-1 text-ink-secondary">
          <li v-for="r in view.setztUm" :key="r.key">
            {{ r.label }}<template v-if="r.partial">, teilweise</template>
          </li>
        </ul>
      </template>
    </FactList>
    <!-- ONE line for every row: which documents, of whom, which Fassung. -->
    <SectionCredits :sources="[]" :marked="false" :method="credits.method ?? undefined">
      <span v-if="credits.items.length || credits.landDocs.length">Quellen:</span>
      <span v-if="credits.landDocs.length"><template v-for="(doc, i) in credits.landDocs" :key="doc.url + doc.label"><template v-if="i > 0">{{ i === credits.landDocs.length - 1 ? ' und ' : ', ' }}</template><ExternalLink :href="doc.url" class="link-muted">{{ doc.label }}</ExternalLink></template> ({{ credits.landPublisher }})</span>
      <span v-for="item in credits.items" :key="item">{{ item }}</span>
      <span v-if="credits.asOf">Verlinkt in der Fassung vom {{ formatDateDe(credits.asOf) }}</span>
    </SectionCredits>
  </div>
</template>
