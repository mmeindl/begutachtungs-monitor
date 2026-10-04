<script setup lang="ts">
import type { AmendedLawsResponse } from '#shared/types'
import type { Fact } from '~/components/ui/FactList.vue'
import { formatDateDe } from '#shared/utils/format'
import { risSource, type SourceEntry } from '#shared/utils/provenance'

/**
 * The law in force the draft would change, as the Entwurf's station frame
 * (04.10.2026, out of the page) — the lede of „Der Entwurf".
 *
 * The section's lede, in the unfilled frame of the facts you consult
 * (03.10.2026; a white station card from 01.10.2026): what the draft would
 * change in the law in force, before the comparison that measures it. Below
 * the comparison and the reasoning it was the baseline read last. Keeps
 * `id="recht"`: that anchor is in circulation. The one text version we hold
 * no document for — what we can offer is the consolidated text in RIS, at
 * the version in force when the draft was filed (`amendedLawsService.ts`).
 *
 * Renders nothing where the response names no law and creates none.
 */
const props = defineProps<{
  laws: AmendedLawsResponse
}>()

/* A Sammelgesetz names forty; past five the rest fold. */
const LAW_FOLD_AT = 5

/* The credit line under the frame (02.10.2026): the laws it links are RIS's
 * consolidated texts. */
const AMENDED_LAWS_SOURCES: SourceEntry[] = [risSource('Geltende Fassung')]

const facts = computed<Fact[]>(() => {
  const a = props.laws
  if (a.createsNewLaw) {
    return [{
      key: 'neu',
      title: 'Geltendes Recht',
      text: 'Keines: Der Entwurf schafft neues Recht, es gibt keinen geltenden Text, gegen den er gehalten werden könnte.',
    }]
  }
  if (!a.laws.length) return []
  return [{ key: 'recht', title: a.laws.length === 1 ? 'Ändert' : `Ändert ${a.laws.length} Gesetze` }]
})
</script>

<template>
  <div v-if="facts.length">
    <FactList
      id="recht"
      :facts="facts"
      class="scroll-mt-6"
    >
      <template #value-recht>
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
    </FactList>
    <!-- Which version the links open is provenance, so it stands in the
         credit line under the frame, not inside a fact (02.10.2026). -->
    <SectionCredits v-if="laws.asOf" :sources="AMENDED_LAWS_SOURCES" :marked="false">
      <span>Verlinkt in der Fassung vom {{ formatDateDe(laws.asOf) }}</span>
    </SectionCredits>
  </div>
</template>
