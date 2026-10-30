<script setup lang="ts">
import type { SourceCode } from '#shared/utils/laender'
import { SOURCE_CODES, SOURCE_NAME } from '#shared/utils/laender'

/**
 * Bund · Oberösterreich · Salzburg · Wien — which sources the list draws
 * from (22.10.2026), in the list's own box since the same day: the box's
 * head is where a list's controls stand (`ListBox`), and the chips change
 * only that list.
 *
 * Checkboxes that ADD to the one list, not a Bund/Länder switch: the
 * question the list answers — where can I still say something, and what is
 * due first — is one question, and two lists would each show half of what
 * is urgent. The Bund is one of them since the closed Länder drafts came,
 * so a list can show one Land alone.
 *
 * The choice is the site's (`useSourceChoice`), so this component only
 * shows it and toggles it. What changes stands directly below: the list.
 * The list is never empty by choice: turning off the last Land brings
 * the Bund back, and the Bund alone stays ticked and says why.
 *
 * No lead („Entwürfe von:"): the chips name themselves. Until 30.10.2026
 * „Weitere Länder folgen" stood at the row's end, while the chips were not
 * all nine; since then they are.
 */
const props = defineProps<{
  /** Per source, why it cannot join this view; absent where it can. */
  unavailable?: Partial<Record<SourceCode, string | null>>
}>()

const { chosen, isLocked, toggle } = useSourceChoice()

const LOCKED = 'Ohne andere Quelle bleibt der Bund ausgewählt'
</script>

<template>
  <div>
    <div role="group" aria-label="Quellen der Liste" class="flex flex-wrap items-center gap-2">
      <ToggleChip
        v-for="code in SOURCE_CODES"
        :key="code"
        :pressed="chosen.includes(code)"
        :unavailable="props.unavailable?.[code] ?? null"
        :locked="isLocked(code) ? LOCKED : null"
        @toggle="toggle(code)"
      >
        {{ SOURCE_NAME[code] }}
      </ToggleChip>
    </div>
  </div>
</template>
