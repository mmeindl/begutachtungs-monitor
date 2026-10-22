<script setup lang="ts">
/**
 * An Oberösterreich draft (`LandDraftPage`). The number: `2026-16124` for a
 * Gesetz (the Landtag's year and number), `v560198` for a Verordnung (the
 * link id of the Land's page). A static segment, so it wins over
 * `[gp]/[inr]`.
 */
definePageMeta({
  validate: (route) => /^(?:20\d{2}-\d{1,6}|v\d{1,9})$/.test(String(route.params.id ?? '')),
})
const route = useRoute()
</script>

<template>
  <LandDraftPage land="ooe" :number="String(route.params.id)" />
</template>
