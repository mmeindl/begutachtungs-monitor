<script setup lang="ts">
import { daysUntil, fristLabel, formatDateWeekdayDe } from '#shared/utils/format'
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
 * without a Frist (the Regierungsvorlage's, an Ausschussantrag's) has no
 * urgency to tone, but it is still a door: it takes the calm tone, the blue
 * of a Frist not yet close, and brings its own heading (`#heading`). It was
 * the white card until 15.11.2026, which by the box grammar (`FactList`)
 * means an instrument one operates, not a place to act — while the
 * Anliegen's door, equally without a Frist, was already blue.
 *
 * Slots, in the card's order: `heading`; the default slot, the body under
 * it; `after-context`; the button row
 * — `filing` (the door itself, a `DoorButton` while `filingHref` is set),
 * the .ics button, then `actions`; and `footer` under the row.
 */
const props = defineProps<{
  frist: boolean
  deadline: string | null | undefined
  /** The Frist's .ics; offered while it runs and has a date. */
  icsHref?: string | null
  /** Where the door leads; its label is the `filing` slot. Shown while the Frist runs. */
  filingHref?: string | null
}>()

/* Decision and sign convention live in app/utils/deadlines.ts, next to
 * the other deadline rules and covered by tests — a flipped sign here would
 * tell a submitter the wrong date. */
/* The countdown, then the date it counts to (15.11.2026): the days say how
 * urgent, the date — with its weekday — is what one plans by. Not on the
 * last day, where „Endet heute" names it, nor without a date. The countdown
 * stood alone from 30.09.2026, the date being in the bar above; on the
 * card one acts from, both belong together. */
const fristHeading = computed(() => {
  const label = fristLabel(props.deadline, true)
  const days = daysUntil(props.deadline)
  return props.deadline && days !== null && days > 0 ? `${label} · bis ${formatDateWeekdayDe(props.deadline)}` : label
})

const doorClass = computed(() =>
  props.frist
    ? deadlineCardClass(deadlineTone(props.deadline, true))
    : deadlineCardClass('neutral'),
)
</script>

<template>
  <div class="mt-6 rounded-xl border p-4" :class="doorClass">
    <!-- A heading, not a paragraph (18.09.2026): this is the only action
         the page offers, and for heading navigation it did not appear in
         the outline at all. Countdown, then date (`fristHeading`). -->
    <h2 class="font-sans text-base font-semibold text-ink">
      <slot name="heading">{{ fristHeading }}</slot>
    </h2>
    <slot />
    <slot name="after-context" />
    <div class="mt-3 flex flex-wrap items-center gap-3">
      <!-- The page's own primary action where it is not one link — a Land's
           address to copy (`CopyButton`, 22.10.2026), Parliament's two forms
           (`StatementFormDoors`, 15.11.2026) — first, where the form's button
           stands otherwise. -->
      <slot v-if="frist" name="primary" />
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
    <!-- No sentence about earlier drafts since 15.11.2026 („Entwürfe ändern
         sich nach der Begutachtung regelmäßig – was aus früheren Entwürfen
         wurde", from 14.11.2026): a claim without a figure on the card whose
         message is the Frist, linking only the list with a sort order. What
         became of a draft is what the page itself shows, station by station.
         What filing brings is said above the buttons, in Parliament's words
         (`SourceQuote`). -->
    <slot name="footer" />
  </div>
</template>
