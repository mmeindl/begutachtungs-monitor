<script setup lang="ts">
/**
 * Back into the one list, unfiltered — one target, one word, on every
 * detail page.
 *
 * Shared-link landers are the declared primary case and need a way into the
 * corpus. A back link that leads somewhere else depending on the record
 * (until 18.09.2026: filtered to the draft's GP on one page and to
 * `art=verordnung` on the other) claims an origin the lander never had —
 * and the list's own filter bar is where narrowing belongs
 * (docs/architecture.md §12.19).
 */
</script>

<template>
  <div class="mb-4">
    <NuxtLink
      to="/entwuerfe"
      class="inline-flex min-h-11 items-center rounded text-sm font-medium text-accent-deep hover:underline"
    >
      ← Alle Entwürfe
    </NuxtLink>
  </div>
</template>
