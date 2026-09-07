<script setup lang="ts">
import type { StatementsSummary } from '#shared/types'

/**
 * The statements of ONE organisation that filed more than once in the same
 * Verfahren (132/ME: Amt der Tiroler Landesregierung as 95/SN on 26.08.2026
 * and 103/SN on 07.09.2026). The panel groups such submissions into a single
 * row — this is where they stay individually reachable, in the SSR HTML like
 * every other name and citation on the page.
 *
 * Mounted for every organisation that filed more than once. The row above
 * cannot carry this: a Zustimmung is counted per Stellungnahme, and which of
 * two submissions collected them is exactly what a grouped row would flatten
 * away into a sum.
 *
 * Same row grammar as every other list in the panel (StatementRow), indented
 * under the organisation that owns them. The identity column stays empty —
 * the name is on the row above — so the citations land in the same column,
 * and carry the link exactly as they do everywhere else.
 *
 * Zustimmungen stay on the sub-rows: upstream counts them per
 * Stellungnahme, and which of two submissions collected them is the point of
 * showing both. What made the same endorsement read as two was the group's
 * SUM printed identically one line above — the row above says "gesamt" now.
 */
defineProps<{
  org: StatementsSummary['organisationList'][number]
}>()


function endorsementLabel(n: number): string {
  return countLabelDe(n, 'Zustimmung', 'Zustimmungen')
}
</script>

<template>
  <!-- -mr-4 cancels the row padding this list sits inside, so the sub-rows
       end at the same right edge as their parent and the two fixed
       right-hand grid tracks stay one column down the panel.
       The rule brackets the sub-rows in both layouts. On a phone it is the
       only cue there is: a sub-row is just its meta line, with the identity
       column hidden. In the columns the hairlines (which divide the parent
       <li>s only, so a group is one unbroken band) and the indented date
       carry the nesting as well — the rule states plainly what those two
       leave to inference. -->
  <ul class="-mr-4 mt-1 border-l border-hairline pl-3 row-cols:pl-6">
    <StatementRow
      v-for="st in org.statements"
      :key="st.parliamentUrl"
      :date="st.date"
      label=""
      :links="[{ citation: st.citation, href: st.parliamentUrl }]"
      :submitter="org.name"
    >
      <template v-if="st.endorsements > 0" #meta>
        {{ endorsementLabel(st.endorsements) }}
      </template>
    </StatementRow>
  </ul>
</template>
