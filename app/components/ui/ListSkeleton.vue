<script setup lang="ts">
/**
 * Grey bars where a comparison's list will stand while it loads, and the
 * loading sentence for screen readers only (02.10.2026).
 *
 * As visible text the sentence had the type of the findings above it and
 * read as one more of them. It stays plain text, not a live region: a region
 * that carries text when it is mounted is read out at once by some screen
 * readers — the end of loading is announced by the section itself
 * (`TextComparisonSection`'s `loadAnnouncement`).
 */
const WIDTHS = ['w-11/12', 'w-4/5', 'w-2/3'] as const
</script>

<template>
  <div class="space-y-2 border-y border-hairline px-3 py-3">
    <span class="sr-only"><slot /></span>
    <div
      v-for="w in WIDTHS"
      :key="w"
      :class="[w, 'h-3 animate-pulse rounded bg-hairline motion-reduce:animate-none']"
      aria-hidden="true"
    />
  </div>
</template>
