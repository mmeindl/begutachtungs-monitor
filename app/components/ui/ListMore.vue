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
 *
 * A row at the foot of a `ListBox`, and only that since 03.10.2026 (the
 * `inset` switch went with the last line-under-a-list caller): the box's
 * hairline and inset while there is something to show, nothing visible once
 * everything is shown, so no empty band is left.
 */
const props = defineProps<{
  /** How many rows the list is currently showing (may exceed `total`). */
  visible: number
  total: number
  /** How many more one press adds. */
  step: number
}>()

const emit = defineEmits<{ more: []; all: [] }>()

const root = useTemplateRef<HTMLElement>('root')
const status = useTemplateRef<HTMLElement>('status')

const remaining = computed(() =>
  Math.max(0, props.total - Math.min(props.visible, props.total)),
)

/* The last press takes the buttons away from under the focus, which then
 * fell to <body>, where a screen reader starts over at the top of the page.
 * It goes to the count line instead: mounted for this very press, it says
 * what the press did, and it keeps the focus at the list's foot, where the
 * earlier presses leave it, so the next Tab goes on from there. Only when
 * a button had the focus: a click in a browser that does not focus buttons
 * moves nothing. */
async function press(action: 'more' | 'all') {
  const hadFocus = root.value?.contains(document.activeElement) ?? false
  if (action === 'more') emit('more')
  else emit('all')
  if (!hadFocus) return
  await nextTick()
  if (remaining.value === 0) status.value?.focus()
}

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
    ref="root"
    class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
    :class="remaining > 0 && 'border-t border-hairline px-4 py-3'"
  >
    <!-- Focusable only once it stands in for the buttons (`press`). -->
    <p
      ref="status"
      :tabindex="remaining === 0 ? -1 : undefined"
      :class="['text-sm tabular-nums text-ink-muted', remaining === 0 && 'sr-only']"
      aria-live="polite"
    >{{ shownLabelDe(visible, total) }}<span class="sr-only"> angezeigt</span></p>

    <!-- The verb is visible since 15.10.2026. „Weitere 8" alone read as a
         count beside the count, not as a control: a reader looking for
         their own organisation stopped at row ten.
         „Weitere" only while a press would not show the rest (23.10.2026):
         with ten or fewer left, „Weitere 5" and „Alle 15" are the same
         press, and the one that names the list's end is kept. -->
    <UFieldGroup v-if="remaining > 0" class="w-full sm:w-auto">
      <UButton
        v-if="remaining > step"
        color="neutral"
        variant="outline"
        class="min-h-target flex-1 justify-center tabular-nums sm:flex-none"
        @click="press('more')"
      >
        {{ moreLabelDe(remaining, step) }} anzeigen
      </UButton>
      <!-- Always, while anything is hidden (23.10.2026): the way to the
           end of the list in one press — 88/ME carries 707 Stellungnahmen,
           where stepping in tens is 70 presses. -->
      <UButton
        color="neutral"
        variant="outline"
        class="min-h-target flex-1 justify-center tabular-nums sm:flex-none"
        @click="press('all')"
      >
        Alle {{ formatNumberDe(total) }} anzeigen
      </UButton>
    </UFieldGroup>
  </div>
</template>
