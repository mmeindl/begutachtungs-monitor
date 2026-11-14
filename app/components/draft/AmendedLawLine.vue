<script setup lang="ts">
import type { AmendedLaw } from '#shared/types'
import { lawCiteDe } from '#shared/utils/citations'

/**
 * One law in force the draft would change, in the Entwurf's station frame:
 * its RIS link, and under it the Stammnorm.
 *
 * A law whose Stammnorm is no Bundesgesetzblatt has no consolidated RIS
 * entry to point at (the UGB's is "dRGBl. S. 219/1897"). Saying so beats
 * dropping it. „– im RIS nicht auffindbar" went on 18.09.2026: the reader's
 * question is why no BGBl number stands here.
 *
 * „Stammfassung ist kein Bundesgesetzblatt", the answer until 14.11.2026,
 * was a claim about the law that `bgbl: null` does not prove: null only says
 * the draft's clause gave no Stammnorm the reader could take. 452 d.B. XXV
 * cites the VAG 2016 as „BGBl. Nr. xx/2015" (a placeholder: the law was not
 * yet promulgated), 869 d.B. XXV the Übergangsgesetz as „B. G. Bl. Nr. 368
 * vom Jahre 1925" — a Bundesgesetzblatt in the old spelling. The line now
 * states what is known, which holds for the UGB as well.
 *
 * „· im RIS …" where the draft cites the Stammnorm with a misprint and the
 * link goes to the law RIS holds under another number (`risBgbl`, 04.10.2026):
 * the citation stays as written, the fact stands beside it, no verdict.
 */
const props = defineProps<{ law: AmendedLaw }>()

/* „Universitätsgesetz 2002, BGBl. I Nr. 120/2002 idF BGBl. I Nr. 50/2024,
 * <RIS>" (21.10.2026) — the law a Stellungnahme cites most, in the form it
 * is cited: the Stammnorm and its latest Novelle, at the version the link
 * opens (the draft's Einlangen). Only with a resolved law and a BGBl
 * Stammnorm; RIS's own where the draft misprinted it (`risBgbl`). */
const cite = computed(() => {
  const l = props.law
  const stammnorm = l.risBgbl ?? l.bgbl
  return l.risUrl && stammnorm ? lawCiteDe(l.title, stammnorm, l.amendedBy ?? null, l.risUrl) : null
})
</script>

<template>
  <p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink">
    <ExternalLink v-if="law.risUrl" :href="law.risUrl" class="link-inline">{{ law.title }}</ExternalLink>
    <template v-else>{{ law.title }}</template>
    <CiteButton v-if="cite" :text="cite" :subject="law.title" />
  </p>
  <p class="mt-0.5 text-xs text-ink-muted">
    {{ law.bgbl ?? 'Fundstelle der Stammfassung nicht lesbar' }}<template v-if="law.risBgbl"> · im RIS {{ law.risBgbl }}</template><template v-if="law.amendedBy">, zuletzt geändert durch {{ law.amendedBy }}</template>
  </p>
</template>
