<script setup lang="ts">
/**
 * Back into a detail page's list, unfiltered — one target, one word, on every
 * detail page („← Alle Entwürfe", „← Alle Rechtsakte").
 *
 * Shared-link landers are the declared primary case and need a way into the
 * corpus. A back link that leads somewhere else depending on the record
 * (until 18.09.2026: filtered to the draft's GP on one page and to
 * `art=verordnung` on the other) claims an origin the lander never had —
 * and the list's own filter bar is where narrowing belongs
 * (docs/architecture.md §12.19). `DraftBackLink` until 05.11.2026, when the
 * EU act page traded its eyebrow for the same link.
 */
defineProps<{ to: string; label: string }>()
</script>

<template>
  <div class="mb-4">
    <NuxtLink
      :to="to"
      class="inline-flex min-h-target items-center text-sm font-medium link-quiet"
    >
      ← {{ label }}
    </NuxtLink>
  </div>
</template>
