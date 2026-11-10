<script setup lang="ts">
/**
 * A Landesgesetz without a draft in the register (`LandLawPage`, §12.70):
 * `/entwuerfe/salzburg/lgbl/<year>/<nr>`. One file per Land, as the drafts' `[id].vue`.
 */
definePageMeta({
  validate: (route) => /^(?:19|20)\d{2}$/.test(String(route.params.year ?? '')) && /^[1-9]\d{0,3}$/.test(String(route.params.nr ?? '')),
})
const route = useRoute()
</script>

<template>
  <LandLawPage land="sbg" :year="String(route.params.year)" :nr="String(route.params.nr)" />
</template>
