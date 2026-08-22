<script setup lang="ts">
import { de } from '@nuxt/ui/locale'

useHead({
  titleTemplate: (title) =>
    title ? `${title} · Begutachtungs-Monitor` : 'Begutachtungs-Monitor',
})
</script>

<template>
  <UApp :locale="de">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
