<script setup lang="ts">
import type { AmendedLawsResponse, DraftDocument, EuRechtResponse, LandBundesrechtResponse } from '#shared/types'
import { formatDateDe } from '#shared/utils/format'
import type { Component } from 'vue'
import { entwurfFrameCredits, entwurfFrameView, NEW_LAW_DE, type CarriedDraftLine, type EntwurfFrameMethod } from '~/utils/entwurfFrame'
import type { EuTimelineContext } from '~/utils/euRecht'
import { BUNDESRECHT_FACT_ANCHOR, EU_FACT_ANCHOR } from '~/utils/origin'
import MethodBundLand from '~/components/method/MethodBundLand.vue'
import MethodEuRecht from '~/components/method/MethodEuRecht.vue'

/**
 * The opening frame of „Der Entwurf" — the section's lede, in the unfilled
 * hairline frame of the facts you consult (box grammar, 03.10.2026), with
 * its credit line under the edge. `AmendedLawsFrame` until 06.11.2026, when
 * the draft's origin joined the law it changes: the rows mirror the Entwurf station's line — „Ändert" ·
 * „Setzt EU-Recht um" (the marker's own words: acts, related counts, the
 * deadline strip and its footnotes inside the frame, as the Frist bar sits
 * in the Begutachtung's) · on a Land's draft „Führt aus" (Grundsatzgesetze)
 * and „Setzt um" (Art.-15a agreements). A draft that creates a law has
 * „Neues Gesetz" in the place of „Ändert", its Gesetzestext linked
 * (20.11.2026): the one text such a draft has, which stood only in the
 * folded „Dokumente".
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
  /** An Initiativantrag's page: the consulted draft whose text it carries (`carriedDraftDe`). */
  carried?: CarriedDraftLine | null
  /** The draft's documents: „Neues Gesetz" links its Gesetzestext from them. */
  documents?: DraftDocument[] | null
  /** The draft as its documents are cited („Ministerialentwurf 120/ME XXVIII. GP"). */
  citeAs?: string | null
}>()

const LAW_FOLD_AT = 5
const view = computed(() => entwurfFrameView(props))
const credits = computed(() => entwurfFrameCredits(props, view.value))
const euId = EU_FACT_ANCHOR.slice(1)
const bundId = BUNDESRECHT_FACT_ANCHOR.slice(1)
/* The method texts the credit line's „Methode" opens, by the id the pure
   module returns (`entwurfFrameCredits.methods`). */
const METHOD: Record<EntwurfFrameMethod, Component> = { 'eu-recht': MethodEuRecht, 'bund-land': MethodBundLand }
</script>

<template>
  <div v-if="view.facts.length">
    <FactList id="recht" :facts="view.facts" class="scroll-mt-6">
      <template v-if="carried" #value-begutachtet>
        <p class="mt-1 text-ink-secondary">
          {{ carried.before }}<NuxtLink :to="carried.link.href" class="link-inline">{{ carried.link.label }}</NuxtLink>{{ carried.after }}
        </p>
      </template>
      <!-- Built like a law in `AmendedLawLine`: the link, „Zitieren", and
           the fact under it. Without a Gesetzestext among the documents (an
           Antrag publishes only itself) the row keeps its sentence. -->
      <template v-if="view.newLaw" #value-neu>
        <p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink">
          <ExternalLink :href="view.newLaw.url" class="link-inline">{{ view.newLaw.title }} ({{ view.newLaw.format }})</ExternalLink>
          <CiteButton v-if="view.newLaw.cite" :text="view.newLaw.cite" :subject="view.newLaw.title" />
        </p>
        <p class="mt-0.5 text-xs text-ink-muted">{{ NEW_LAW_DE }}</p>
      </template>
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
    <SectionCredits :sources="[]" :marked="false">
      <span v-if="credits.items.length || credits.landDocs.length">Quellen:</span>
      <span v-if="credits.landDocs.length"><template v-for="(doc, i) in credits.landDocs" :key="doc.url + doc.label"><template v-if="i > 0">{{ i === credits.landDocs.length - 1 ? ' und ' : ', ' }}</template><ExternalLink :href="doc.url" class="link-muted">{{ doc.label }}</ExternalLink></template> ({{ credits.landPublisher }})</span>
      <span v-for="item in credits.items" :key="item">{{ item }}</span>
      <span v-if="credits.asOf">Verlinkt in der Fassung vom {{ formatDateDe(credits.asOf) }}</span>
      <template v-if="credits.methods.length" #method>
        <component :is="METHOD[m]" v-for="m in credits.methods" :key="m" />
      </template>
    </SectionCredits>
  </div>
</template>
