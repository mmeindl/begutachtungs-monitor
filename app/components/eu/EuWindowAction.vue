<script setup lang="ts">
import type { EuWindowActionView } from '~/utils/euInitiative'

/**
 * The door of an EU page while a window is open: a draft's door card
 * (`DraftDoorCard`) directly under the state card — the pages of an
 * initiative of the Commission, a proposal and a Citizens' Initiative, so
 * the action reads the same on all three and on every detail page.
 *
 * THE DRAFT'S DOOR AS IT IS: the heading is its countdown and date
 * („Noch 56 Tage · bis So., 10.01.2027"), the ground its tone. Where the
 * source names no last day there is nothing to count: the view's own
 * heading stands (`#heading`).
 *
 * A body sentence only where it says what the button cannot (as the Land's
 * card lost „…das Formular des Landes" over a button that said the same):
 * none on the Commission's door, whose heading says the day and whose
 * button names the portal; on a Citizens' Initiative's, that the link leads
 * to its collection system, which is sometimes the organisers' own site.
 * Above the button, what giving feedback brings in the Commission's own
 * words (`SourceQuote`, `euFeedbackQuote.ts`), where one was read. Where
 * the source names no address to go to, there is no button, and a gap
 * sentence says so.
 *
 * Several windows open at once with different last days are several cards,
 * one per day, each naming its windows (`station`, `stacked`): one
 * countdown can only count to one day (`DraftDoorCard`, 20.11.2026).
 *
 * The same door stands once more at the end of the section where the
 * decision is made (`EuStationSection`, `EuRailSection.door`).
 */
defineProps<{ action: EuWindowActionView; stacked?: boolean }>()
</script>

<template>
  <DraftDoorCard frist :deadline="action.end" :filing-href="action.href" :station="action.station" :stacked="stacked">
    <template v-if="action.heading" #heading>
      {{ action.heading }}
    </template>
    <p v-if="action.note" class="mt-2 text-sm text-ink-secondary">
      {{ action.note }}
    </p>
    <GapNote v-if="action.gap" :text="action.gap" class="mt-2 text-sm text-ink-secondary" />
    <SourceQuote v-if="action.quote && action.href" :text="action.quote.text" :source="action.quote.source" />
    <template #filing>
      {{ action.label }}
    </template>
  </DraftDoorCard>
</template>
