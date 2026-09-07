<script setup lang="ts">
import type { StatementsSummary } from '#shared/types'

/**
 * The statements of ONE organisation that filed more than once in the same
 * Verfahren (132/ME: Amt der Tiroler Landesregierung as 95/SN on 26.08.2026
 * and 103/SN on 07.09.2026). The panel groups such submissions into a single
 * row — this is where they stay individually reachable, in the SSR HTML like
 * every other name and citation on the page.
 *
 * Only rendered for grouped rows; a single-statement row links its name
 * directly and never mounts this.
 */
const props = defineProps<{
  org: StatementsSummary['organisationList'][number]
}>()

/* The date is the useful discriminator between two submissions of one
 * office; the citation is the precise one and the only handle when upstream
 * ships no date. Both are shown — the citation is what a reader quotes. */
function linkLabel(date: string | null): string {
  return date ? formatDateDe(date) : 'ohne Datum'
}

function endorsementLabel(n: number): string {
  return countLabelDe(n, 'Zustimmung', 'Zustimmungen')
}

const orgName = computed(() => props.org.name)
</script>

<template>
  <ul class="mt-1.5 flex flex-wrap gap-x-5 gap-y-1">
    <li
      v-for="st in org.statements"
      :key="st.parliamentUrl"
      class="flex items-baseline gap-2 text-sm"
    >
      <ExternalLink
        :href="st.parliamentUrl"
        :aria-label="`Stellungnahme ${st.citation} von ${orgName} auf parlament.gv.at öffnen`"
        class="tap-target tabular-nums text-accent-deep hover:underline"
      >
        {{ linkLabel(st.date) }}
      </ExternalLink>
      <span class="text-ink-muted">{{ st.citation }}</span>
      <span v-if="st.endorsements > 0" class="tabular-nums text-ink-secondary">
        {{ endorsementLabel(st.endorsements) }}
      </span>
    </li>
  </ul>
</template>
