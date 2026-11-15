<script setup lang="ts">
/**
 * The one blue element of an EU page while a feedback window is open: the
 * sentence until when the Commission takes feedback, and the way to its
 * portal's page, where the contribution is made — the button a draft's page
 * uses for its Stellungnahme (`DoorButton`). Shared by the page of an
 * initiative and the page of a proposal (15.11.2026), so the action reads
 * the same on both. Every word comes from the caller's view; no countdown,
 * no tone (rule D6).
 */
defineProps<{
  action: { href: string; label: string; note: string }
}>()
</script>

<template>
  <div>
    <p class="mt-1 text-sm text-ink-secondary">
      {{ action.note }}
    </p>
    <div class="mt-3">
      <DoorButton :href="action.href">
        {{ action.label }}
      </DoorButton>
    </div>
  </div>
</template>
