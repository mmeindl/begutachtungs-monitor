<script setup lang="ts">
import { de } from '@nuxt/ui/locale'

const route = useRoute()
const { siteUrl } = useRuntimeConfig().public

useHead({
  titleTemplate: (title) =>
    title ? `${title} · Begutachtungs-Monitor` : 'Begutachtungs-Monitor',
  // Canonical strips query strings: filtered list views are views of the
  // same resource, and shared URLs with params must not split page rank.
  link: [{ rel: 'canonical', href: () => `${siteUrl}${route.path}` }],
})

// Site-wide share defaults; pages override ogTitle/ogDescription where a
// specific preview matters (detail pages, home).
useSeoMeta({
  ogSiteName: 'Begutachtungs-Monitor',
  ogLocale: 'de_AT',
  ogType: 'website',
  ogImage: `${siteUrl}/og.png`,
  ogImageWidth: 1200,
  ogImageHeight: 630,
  twitterCard: 'summary_large_image',
})
</script>

<template>
  <UApp :locale="de">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
