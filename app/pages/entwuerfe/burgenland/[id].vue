<script setup lang="ts">
/**
 * A Burgenland draft (`LandDraftPage`), by the document id of its first attachment: the Land gives a draft no number (`burgenland.ts`). A static segment, so it wins over `[gp]/[inr]`.
 */
definePageMeta({
  validate: (route) => /^[0-9a-f]{32}$/.test(String(route.params.id ?? '')),
})
const route = useRoute()
</script>

<template>
  <LandDraftPage land="bgld" :number="String(route.params.id)" />
</template>
