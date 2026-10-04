<script setup lang="ts">
/**
 * „Nichts gefunden." under a comparison's groups — a row of the box, under
 * its head. Both sections wrote it out until 04.10.2026.
 *
 * A search box with no answer is worse than none: the section would just
 * end, and an empty comparison reads as a claim about the draft.
 *
 * Stays in the DOM as a live region and goes empty rather than disappearing:
 * a region that comes into being with its text is not announced — whoever
 * searched and found nothing would otherwise get silence back. Not
 * `ListBoxNotice`: its live region would have to switch `sr-only` against
 * its own padding, and its description carries a margin this line never had.
 */
defineProps<{ found: boolean }>()
</script>

<template>
  <p
    role="status"
    :class="found ? 'sr-only' : 'px-4 py-4 text-sm text-ink-secondary'"
  >{{ found ? '' : 'Nichts gefunden.' }}</p>
</template>
