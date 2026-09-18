<script setup lang="ts">
import type { DraftChain } from '#shared/types'

/**
 * Where a draft stands, in the slot the Frist-Countdown owns while the Frist
 * runs (docs/architecture.md §12.26).
 *
 * The same two-line anatomy as `DeadlineBlock` and `OutcomeChip` — chip over
 * date — because all three occupy one column down a list, and a reader
 * scanning it must not have to re-learn the shape three times. The wording
 * is `OutcomeChip`'s, kept letter for letter where the state is the same:
 * these sentences were chosen against the framing rule (CLAUDE.md) and one
 * uniform wash for every state, so nothing here reads as a scoreboard.
 *
 * Two wordings are this component's own:
 *  - **`rv` with an open filing** says „Zweite Runde: Stellungnahme möglich"
 *    rather than „Regierungsvorlage liegt vor". Both are true; only one of
 *    them is something the reader can act on today.
 *  - **`parlament`** says „Im Parlament behandelt" and nothing more. The
 *    upstream fact is that the house is done with the Vorlage — which covers
 *    beschlossen, abgelehnt and zurückgezogen alike, and this column may not
 *    turn that into a verdict it did not read.
 */
const props = defineProps<{
  chain: DraftChain
  /** ISO; the Fristende under the chip. Omitted → chip alone. */
  deadline?: string | null
  /**
   * The dense row's column is 11rem wide and the chip may not wrap, so
   * `dense` abbreviates the SAME statement — never a different one. „Bisher"
   * survives every abbreviation: it is the word that keeps „keine
   * Regierungsvorlage" a status instead of a verdict (framing rule,
   * CLAUDE.md). Without it the first draft of this clipped mid-number
   * („Kundgemacht: BGBl. I Nr. 69,") — measured on `/entwuerfe?station=bgbl`.
   */
  dense?: boolean
}>()

const label = computed(() => {
  const c = props.chain
  const d = props.dense
  switch (c.station) {
    case 'bgbl': {
      // "Bundesgesetzblatt I Nr. 69/2026" → "BGBl. I Nr. 69/2026" → dense
      // "BGBl. I 69/2026": the citation IS the Kundmachung, so the dense
      // form drops the word for it, not the number.
      const nr = (c.bgblNumber ?? '').replace(/^Bundesgesetzblatt\b/, 'BGBl.')
      return d ? nr.replace(/\bNr\.\s*/, '') : `Kundgemacht: ${nr}`
    }
    case 'parlament':
      return d ? 'Im Parlament' : 'Im Parlament behandelt'
    case 'rv':
      if (c.filingOpen) return d ? 'Zweite Runde' : 'Zweite Runde: Stellungnahme möglich'
      return d ? 'Regierungsvorlage' : 'Regierungsvorlage liegt vor'
    default:
      return d ? 'Bisher keine Vorlage' : 'Bisher keine Regierungsvorlage'
  }
})
</script>

<template>
  <div class="shrink-0 sm:text-right">
    <span
      class="inline-flex items-center whitespace-nowrap rounded-full bg-mark-wash px-2.5 py-0.5 text-xs font-medium text-accent-deep"
    >
      {{ label }}
    </span>
    <p v-if="deadline" class="mt-1 text-xs text-ink-secondary">
      Frist endete {{ formatDateDe(deadline) }}
    </p>
  </div>
</template>
