<script setup lang="ts">
import { fristLabel } from '#shared/utils/format'
import { deadlineCardClass, deadlineTone } from '~/utils/deadlines'

/**
 * Deadline, action and calendar welded into one card: a detail page's door,
 * the one place to act, in the same slot and shape on both detail pages.
 * The page decides when it shows (only while a window for input is open: an
 * expired window with a button is an invitation to waste an afternoon);
 * the card is the same card either way.
 *
 * `frist`: the Begutachtung's window is open. Then the card is the
 * countdown's box — the list row's tone (`deadlineGroundClass`, shared with
 * `EntryState`) over the whole card, not a chip inside the heading, which
 * broke the sentence and read as bolted on. The words say the urgency, the
 * ground repeats it, so meaning never rides on colour alone. A window
 * without a Frist (the Regierungsvorlage's, on the draft page) has no Frist
 * to tone and keeps the plain card, and brings its own heading (`#heading`).
 *
 * Slots, in the card's order: `heading`; the default slot, the body under
 * it; the Frist's context line (`context`); `after-context`; the button row
 * — `filing` (the door itself, a `DoorButton` while `filingHref` is set),
 * the .ics button, then `actions`; and `footer` under the row.
 */
const props = defineProps<{
  frist: boolean
  deadline: string | null | undefined
  /** The yardstick sentence (`fristContextFor`), shown while the Frist runs. */
  context?: string | null
  /** The Frist's .ics; offered while it runs and has a date. */
  icsHref?: string | null
  /** Where the door leads; its label is the `filing` slot. Shown while the Frist runs. */
  filingHref?: string | null
}>()

/* Decision and sign convention live in app/utils/deadlines.ts, next to
 * the other deadline rules and covered by tests — a flipped sign here would
 * tell a submitter the wrong date. */
const doorClass = computed(() =>
  props.frist
    ? deadlineCardClass(deadlineTone(props.deadline, true))
    : 'border-hairline bg-surface',
)
</script>

<template>
  <div class="mt-6 rounded-xl border p-4" :class="doorClass">
    <!-- A heading, not a paragraph (18.09.2026): this is the only action
         the page offers, and for heading navigation it did not appear in
         the outline at all. The countdown alone since 30.09.2026: the date
         stands in the bar directly above. -->
    <h2 class="font-sans text-base font-semibold text-ink">
      <slot name="heading">{{ fristLabel(deadline, true) }}</slot>
    </h2>
    <slot />
    <!-- How long the window is, measured against practice and the
         Verordnung — here while the Frist runs, because this card is
         where a reader decides whether a Stellungnahme is still
         feasible. When the window closes, the card goes and the sentence
         moves back under „Die Begutachtung": one place at a time, the one
         that matters now. -->
    <p v-if="frist && context" class="mt-2 text-sm text-ink">
      {{ context }}
    </p>
    <slot name="after-context" />
    <div class="mt-3 flex flex-wrap items-center gap-3">
      <DoorButton v-if="frist && filingHref" :href="filingHref">
        <slot name="filing" />
      </DoorButton>
      <UButton
        v-if="frist && deadline && icsHref"
        :to="icsHref"
        external
        color="neutral"
        variant="outline"
        class="min-h-target"
      >
        Frist in den Kalender (.ics)
      </UButton>
      <slot name="actions" />
    </div>
    <slot name="footer" />
  </div>
</template>
