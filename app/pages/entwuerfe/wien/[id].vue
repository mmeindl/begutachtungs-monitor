<script setup lang="ts">
/**
 * A Wien draft (`LandDraftPage`). The number is Wien's own, year and
 * sequence: `2026009`. A static segment, so it wins over `[gp]/[inr]`.
 */
definePageMeta({
  validate: (route) => /^20\d{2}\d{3}$/.test(String(route.params.id ?? '')),
})
const route = useRoute()
</script>

<template>
  <LandDraftPage land="w" :number="String(route.params.id)" />
</template>
