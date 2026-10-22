<script setup lang="ts">
/**
 * A Salzburg draft (`LandDraftPage`). A static segment, so it wins over
 * `[gp]/[inr]` — whose `validate` would refuse „salzburg" as a period anyway.
 */
definePageMeta({
  validate: (route) => /^\d{1,9}$/.test(String(route.params.id ?? '')),
})
const route = useRoute()
</script>

<template>
  <LandDraftPage land="sbg" :number="String(route.params.id)" />
</template>
