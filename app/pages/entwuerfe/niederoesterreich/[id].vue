<script setup lang="ts">
/**
 * A Niederösterreich draft (`LandDraftPage`), by the name of its page on the Land's site: `NOe_KJHG_Aenderung1` (`niederoesterreich.ts`). A static segment, so it wins over `[gp]/[inr]`.
 */
definePageMeta({
  validate: (route) => /^[A-Za-z0-9][A-Za-z0-9_().-]{2,119}$/.test(String(route.params.id ?? '')),
})
const route = useRoute()
</script>

<template>
  <LandDraftPage land="noe" :number="String(route.params.id)" />
</template>
