<script setup lang="ts">
import type { EuWindowActionView } from '~/utils/euInitiative'

/**
 * The door of an EU page while a feedback window is open: a card of its own
 * directly under the header card, in the slot and shape of a draft page's
 * door (`DraftDoorCard`) — the heading says until when, the sentence where,
 * the button (`DoorButton`, the page's one blue element) leads to the
 * portal's page, where the contribution is made. Shared by the page of an
 * initiative and the page of a proposal, so the action reads the same on
 * both.
 *
 * THE DRAFT'S DOOR, with its countdown and its tone: the heading counts the
 * days to the window's last day and the card takes the ground a
 * Stellungnahme's door has when its Frist is close, so one state reads as
 * one colour on every detail page. The words say the urgency, the ground
 * repeats it. Without the Begutachtung's sentence about earlier drafts,
 * which is about Austrian drafts. Where the portal names no last day there
 * is nothing to count: the view's own heading stands, on the plain ground.
 */
defineProps<{ action: EuWindowActionView }>()
</script>

<template>
  <DraftDoorCard frist :deadline="action.end" :filing-href="action.href" :evidence="false">
    <template v-if="action.heading" #heading>
      {{ action.heading }}
    </template>
    <p class="mt-2 text-sm text-ink-secondary">
      {{ action.note }}
    </p>
    <template #filing>
      {{ action.label }}
    </template>
  </DraftDoorCard>
</template>
