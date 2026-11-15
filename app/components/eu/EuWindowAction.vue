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
 * The plain card (`frist: false`): no countdown and no tone on an EU
 * window, as the list of open windows carries none, and without the
 * Begutachtung's sentence about what became of earlier drafts.
 */
defineProps<{ action: EuWindowActionView }>()
</script>

<template>
  <DraftDoorCard :frist="false" :deadline="null">
    <template #heading>
      {{ action.heading }}
    </template>
    <p class="mt-2 text-sm text-ink-secondary">
      {{ action.note }}
    </p>
    <template #actions>
      <DoorButton :href="action.href">
        {{ action.label }}
      </DoorButton>
    </template>
  </DraftDoorCard>
</template>
