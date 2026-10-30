<script setup lang="ts">
/**
 * A Steiermark draft (`LandDraftPage`), by the UUID of its page in the Landtag's PALLAST, a closed period's with its key before it: `18-…` (`steiermark.ts`). A static segment, so it wins over `[gp]/[inr]`.
 */
definePageMeta({
  validate: (route) => /^(?:1[78]-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(String(route.params.id ?? '')),
})
const route = useRoute()
</script>

<template>
  <LandDraftPage land="stmk" :number="String(route.params.id)" />
</template>
