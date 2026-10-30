<script setup lang="ts">
/**
 * A Vorarlberg draft (`LandDraftPage`), by the id of its documents' folder: `34682067` (`vorarlberg.ts`). A static segment, so it wins over `[gp]/[inr]`.
 */
definePageMeta({
  validate: (route) => /^\d{4,10}$/.test(String(route.params.id ?? '')),
})
const route = useRoute()
</script>

<template>
  <LandDraftPage land="vbg" :number="String(route.params.id)" />
</template>
