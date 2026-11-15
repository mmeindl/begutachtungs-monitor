<script setup lang="ts">
import type { EuWindowActionView } from '~/utils/euInitiative'

/**
 * The door of an EU page while a window is open: a card of its own
 * directly under the header card, in the slot and shape of a draft page's
 * door (`DraftDoorCard`) — the heading says until when, the sentence where,
 * the button (`DoorButton`, the page's one blue element) leads to where the
 * contribution is made: the portal's page of an initiative of the
 * Commission, or the collection system of a European Citizens' Initiative.
 * Shared by the pages of an initiative, a proposal and a Citizens'
 * Initiative, so the action reads the same on all three.
 *
 * THE DRAFT'S DOOR, with its countdown and its tone: the heading counts the
 * days to the window's last day and the card takes the ground a
 * Stellungnahme's door has when its Frist is close, so one state reads as
 * one colour on every detail page. The words say the urgency, the ground
 * repeats it. Without the Begutachtung's sentence about earlier drafts,
 * which is about Austrian drafts. Where the source names no last day there
 * is nothing to count: the view's own heading stands, on the plain ground.
 * Where it names no address to go to, there is no button, and a gap
 * sentence says so.
 */
defineProps<{ action: EuWindowActionView }>()
</script>

<template>
  <DraftDoorCard frist :deadline="action.end" :filing-href="action.href">
    <template v-if="action.heading" #heading>
      {{ action.heading }}
    </template>
    <p class="mt-2 text-sm text-ink-secondary">
      {{ action.note }}
    </p>
    <GapNote v-if="action.gap" :text="action.gap" class="mt-2 text-sm text-ink-secondary" />
    <template #filing>
      {{ action.label }}
    </template>
  </DraftDoorCard>
</template>
