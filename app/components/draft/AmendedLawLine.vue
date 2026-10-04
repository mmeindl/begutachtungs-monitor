<script setup lang="ts">
import type { AmendedLaw } from '#shared/types'

/**
 * One law in force the draft would change, in the Entwurf's station frame:
 * its RIS link, and under it the Stammnorm.
 *
 * A law whose Stammnorm is no Bundesgesetzblatt has no consolidated RIS
 * entry to point at (the UGB's is "dRGBl. S. 219/1897"). Saying so beats
 * dropping it. „– im RIS nicht auffindbar" went on 18.09.2026: the reader's
 * question is why no BGBl number stands here, and the answer is a fact
 * about the law. That our search found nothing is a fact about us.
 *
 * „· im RIS …" where the draft cites the Stammnorm with a misprint and the
 * link goes to the law RIS holds under another number (`risBgbl`, 04.10.2026):
 * the citation stays as written, the fact stands beside it, no verdict.
 */
defineProps<{ law: AmendedLaw }>()
</script>

<template>
  <p class="text-sm text-ink">
    <ExternalLink v-if="law.risUrl" :href="law.risUrl" class="link-inline">{{ law.title }}</ExternalLink>
    <template v-else>{{ law.title }}</template>
  </p>
  <p class="mt-0.5 text-xs text-ink-muted">
    {{ law.bgbl ?? 'Stammfassung ist kein Bundesgesetzblatt' }}<template v-if="law.risBgbl"> · im RIS {{ law.risBgbl }}</template>
  </p>
</template>
