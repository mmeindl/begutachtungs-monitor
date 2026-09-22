<script setup lang="ts">
import type { BgblOutcome } from '#shared/types'
import { formatDateDe } from '#shared/utils/format'

/**
 * What became of a Verordnungsentwurf (docs/architecture.md §12.32).
 *
 * THREE STATES, AND TWO OF THEM ARE NOT THE SAME. Measured (`pnpm
 * corpus:bgbl2`, 291 drafts): a median 57 days between Fristende and
 * Kundmachung, p90 196. Of the drafts whose Frist ended less than 30 days ago
 * NOT ONE has a Kundmachung yet; after 181–365 days it is 92,2 %. So up to
 * 180 days the line says that it takes time, and only after that that nothing
 * can be found.
 *
 * AND EVEN THEN IT SAYS IT ABOUT US, not about the Ressort. The match runs
 * over title, Ressort and date and finds 84,2 % — 92,3 % for drafts whose
 * Frist is more than a year back. The rest are partly Verordnungen that were
 * never enacted (the information this is about) and partly our own failures.
 * Both look alike from here, so the way to check stands beside it. Framing
 * rule, CLAUDE.md: never an accusation, always a state of the procedure.
 */
const props = defineProps<{
  risId: string
  /**
   * The outcome out of the page's own response, where it already stood.
   *
   * The normal case since 19.09.2026: the card's heading needs it anyway, so
   * it comes along server-side — and then this section must not start a
   * second fetch for it. Null means „not determined inside the page's
   * budget", not „nicht kundgemacht"; it then fetches it itself, so a cold
   * cache only delays the information instead of swallowing it.
   */
  outcome?: BgblOutcome | null
}>()

const { data: fetched } = await useFetch<BgblOutcome>(() => `/api/ris-drafts/${props.risId}/kundmachung`, {
  lazy: true,
  server: false,
  immediate: !props.outcome,
})
const data = computed(() => props.outcome ?? fetched.value)
</script>

<template>
  <p v-if="data?.state === 'kundgemacht'" class="mt-3 max-w-prose text-sm text-ink-secondary">
    <span class="font-medium text-ink">Kundgemacht</span> als
    <ExternalLink
      v-if="data.url"
      :href="data.url"
      class="font-medium text-accent-deep underline underline-offset-2 hover:no-underline"
    >{{ data.nummer }}</ExternalLink>
    <template v-else>{{ data.nummer }}</template>
    <template v-if="data.datum">, ausgegeben am {{ formatDateDe(data.datum) }}</template>
    <template v-if="data.days !== null"> – {{ data.days }} Tage nach Ende der Begutachtungsfrist</template>.
  </p>

  <!-- The line for „it is still taking time". It names the figure, because
       without it the absence of a Kundmachung after six weeks looks like a
       finding and is none. -->
  <p v-else-if="data?.state === 'ausstehend'" class="mt-3 max-w-prose text-sm text-ink-secondary">
    Im Bundesgesetzblatt II steht dazu bisher keine Kundmachung. Zwischen
    Fristende und Kundmachung liegen üblicherweise rund zwei Monate.
  </p>

  <p v-else-if="data?.state === 'keine'" class="mt-3 max-w-prose text-sm text-ink-secondary">
    Im Bundesgesetzblatt II ist dazu keine Kundmachung zu finden. Gesucht wird
    über Titel, Ressort und Datum; das findet nicht jede –
    <ExternalLink
      href="https://www.ris.bka.gv.at/Bgbl-Auth/"
      class="font-medium text-accent-deep underline underline-offset-2 hover:no-underline"
    >im Bundesgesetzblatt nachsehen</ExternalLink>.
  </p>
</template>
