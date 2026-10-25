<script setup lang="ts">
/**
 * A Tirol draft (`LandDraftPage`), by its Landtag year and number:
 * `2026-722`; a Verordnung by its id in the IFG-Informationsregister. A static segment, so it wins over `[gp]/[inr]`.
 */
definePageMeta({
  validate: (route) => /^(?:20\d{2}-\d{1,5}|v[0-9a-f]{32})$/.test(String(route.params.id ?? '')),
})
const route = useRoute()
</script>

<template>
  <LandDraftPage land="t" :number="String(route.params.id)" />
</template>
