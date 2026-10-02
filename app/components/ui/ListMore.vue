<script setup lang="ts">
/**
 * The foot of a client-paginated list: how far into it the reader is, and
 * the control that changes that.
 *
 * Presentational only — the count lives in the panel that owns the list, so
 * resetting it (a new filter, a new sort, a new search) stays one
 * assignment there instead of a call into here. The panel decides what
 * `total` means in the state it is in; this component only reports it.
 *
 * The count leads and the button follows, at the END of the list: that is
 * where a reader asks "how far in am I?", and the answer belongs beside the
 * control that answers it — not 25 rows above, where whoever is standing at
 * the button cannot see it.
 */
const props = defineProps<{
  /** How many rows the list is currently showing (may exceed `total`). */
  visible: number
  total: number
  /** How many more one press adds. */
  step: number
  /** Above this remainder, a second button skips to the end. Omitted → none. */
  allAbove?: number
  /** A row at the foot of a `ListBox` instead of a line under a list: the
   *  box's hairline and inset while there is something to show, nothing
   *  visible once everything is shown, so no empty band is left. */
  inset?: boolean
}>()

const emit = defineEmits<{ more: []; all: [] }>()

const remaining = computed(() =>
  Math.max(0, props.total - Math.min(props.visible, props.total)),
)

/* Mounted for as long as the list is pageable AT ALL, not only while
 * something is still hidden. This paragraph is the live region that tells a
 * screen-reader user the list grew, and the last press — the one that
 * removes the button from under the cursor — is the press that most needs
 * saying. So it stays and goes visually silent instead, the way the panel's
 * set line does: "35 von 35 angezeigt" beside no button describes nothing
 * to someone who can see there is nothing left. */
const pageable = computed(() => props.total > props.step)
</script>

<template>
  <!-- One line, the list's footer: position at the left edge where the rows
       are read, the control at the right (1.10.2026). Until then it was
       three centred tiers — count, then two separate bordered buttons — and
       took more height than a row of the list. The two actions share one
       border now, so neither reads as a caption beside the other (the
       reason the second button got its outline on 30.09.2026). Below sm
       it stacks, the control across the full column. -->
  <div
    v-if="pageable"
    class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
    :class="inset ? remaining > 0 && 'border-t border-hairline px-4 py-3' : 'mt-3'"
  >
    <p
      :class="['text-sm tabular-nums text-ink-muted', remaining === 0 && 'sr-only']"
      aria-live="polite"
    >{{ shownLabelDe(visible, total) }}<span class="sr-only"> angezeigt</span></p>

    <UFieldGroup v-if="remaining > 0" class="w-full sm:w-auto">
      <UButton
        color="neutral"
        variant="outline"
        class="min-h-target flex-1 justify-center tabular-nums sm:flex-none"
        @click="emit('more')"
      >
        {{ moreLabelDe(remaining, step) }}<span class="sr-only"> anzeigen</span>
      </UButton>
      <!-- The escape hatch for the long lists — 88/ME carries 707
           Stellungnahmen, where stepping in tens is 70 presses. Hidden on
           the short ones, where a second segment would only say what the
           first already says. -->
      <UButton
        v-if="allAbove !== undefined && remaining > allAbove"
        color="neutral"
        variant="outline"
        class="min-h-target flex-1 justify-center tabular-nums sm:flex-none"
        @click="emit('all')"
      >
        Alle {{ formatNumberDe(total) }}<span class="sr-only"> anzeigen</span>
      </UButton>
    </UFieldGroup>
  </div>
</template>
