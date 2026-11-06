<script setup lang="ts">
/**
 * The way to the EU map (`/eu-recht`, docs/architecture.md §12.66) from a
 * page header — always there, not only while „Setzt EU-Recht um" is on: the
 * map is a view of the drafts by act, and a door that appears only after a
 * filter is one most readers never see (06.11.2026).
 *
 * A row of the header's own kind: the geometry of the folds beside it
 * (`Disclosure` — `SubscribeLinks`, `LaenderCoverageFold`), an arrow in the
 * chevron's column because it goes somewhere instead of opening, so the
 * three read as one group and their texts start on one edge.
 */
</script>

<template>
  <NuxtLink
    to="/eu-recht"
    class="group -mx-2 flex w-fit min-h-target items-center gap-2 rounded px-2 py-1 text-sm font-medium text-ink hover:bg-hover"
  >
    <UIcon name="i-lucide-arrow-right" class="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
    <UIcon name="i-lucide-landmark" class="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
    <span class="group-hover:underline group-hover:decoration-2">EU-Recht: welche Rechtsakte die Entwürfe umsetzen</span>
  </NuxtLink>
</template>
