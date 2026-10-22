<script setup lang="ts">
import type { SourceCode } from '#shared/utils/laender'
import { LAENDER_TOTAL, LAND_CODES, SOURCE_CODES, SOURCE_NAME } from '#shared/utils/laender'

/**
 * „Entwürfe von: Bund · Oberösterreich · Salzburg · Wien" — which sources
 * the list below draws from (22.10.2026).
 *
 * Checkboxes that ADD to the one list, not a Bund/Länder switch: the
 * question the list answers — where can I still say something, and what is
 * due first — is one question, and two lists would each show half of what
 * is urgent. The Bund is one of them since the closed Länder drafts came,
 * so a list can show one Land alone.
 *
 * The choice is the site's (`useSourceChoice`), so this component only
 * shows it and toggles it. What changes stands directly below: the list.
 * The last source stays ticked and says why — the list is never empty by
 * choice.
 *
 * The coverage stands beside the chips, always: the monitor reads some of
 * nine Länder, and a list that does not say so claims the rest are quiet.
 */
const props = defineProps<{
  /** Per source, why it cannot join this view; absent where it can. */
  unavailable?: Partial<Record<SourceCode, string | null>>
  /** One sentence under the chips, where the view needs it (the period as a time window). */
  note?: string | null
}>()

const { chosen, isLast, toggle } = useSourceChoice()

const LOCKED = 'Mindestens eine Quelle bleibt ausgewählt'
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span class="text-sm text-ink-secondary">Entwürfe von:</span>
      <ToggleChip
        v-for="code in SOURCE_CODES"
        :key="code"
        :pressed="chosen.includes(code)"
        :unavailable="props.unavailable?.[code] ?? null"
        :locked="isLast(code) ? LOCKED : null"
        @toggle="toggle(code)"
      >
        {{ SOURCE_NAME[code] }}
      </ToggleChip>
      <span class="text-sm text-ink-muted">{{ LAND_CODES.length }} von {{ LAENDER_TOTAL }} Ländern</span>
    </div>
    <p v-if="note" class="mt-2 text-sm text-ink-muted">{{ note }}</p>
  </div>
</template>
