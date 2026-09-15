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
  <div v-if="pageable" class="mt-4 flex flex-col items-center gap-2">
    <p
      :class="['text-sm text-ink-muted', remaining === 0 && 'sr-only']"
      aria-live="polite"
    >{{ shownLabelDe(visible, total) }}</p>

    <div v-if="remaining > 0" class="flex flex-wrap items-center justify-center gap-2">
      <UButton color="neutral" variant="outline" class="min-h-11" @click="emit('more')">
        {{ moreLabelDe(remaining, step) }}
      </UButton>
      <!-- The escape hatch for the long lists — 88/ME carries 707
           Stellungnahmen, where stepping in tens is 70 presses. Hidden on
           the short ones, where a second button would only say what the
           first already says. -->
      <UButton
        v-if="allAbove !== undefined && remaining > allAbove"
        color="neutral"
        variant="ghost"
        class="min-h-11"
        @click="emit('all')"
      >
        Alle {{ formatNumberDe(total) }} anzeigen
      </UButton>
    </div>
  </div>
</template>
