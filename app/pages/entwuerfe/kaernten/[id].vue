<script setup lang="ts">
/**
 * A Kärnten draft (`LandDraftPage`), by its Geschäftszahl: `113253-2025-38`,
 * before 2022 `1994-6`; a Verordnung by its tile, `v1631`; a Begutachtung of
 * the Landtag's own without a Geschäftszahl by its Landtag Zahl, `lt17-2-33`.
 * A static segment, so it wins over `[gp]/[inr]`.
 */
definePageMeta({
  validate: (route) => /^(?:\d{1,7}-(?:20\d{2}-)?\d{1,4}|v\d{1,6}|lt\d{1,3}-\d{1,3}-\d{1,4})$/.test(String(route.params.id ?? '')),
})
const route = useRoute()
</script>

<template>
  <LandDraftPage land="ktn" :number="String(route.params.id)" />
</template>
