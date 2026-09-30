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

// Site-wide share defaults; each page sets its own ogTitle/ogDescription
// (`usePageSeo`), and home and the detail pages a preview of their own.
useSeoMeta({
  ogSiteName: 'Begutachtungs-Monitor',
  ogLocale: 'de_AT',
  ogType: 'website',
  // Same URL as the canonical: a share of a filtered list unfurls as the list.
  ogUrl: () => `${siteUrl}${route.path}`,
  ogImage: `${siteUrl}/og.png`,
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogImageAlt: 'Begutachtungs-Monitor – Was wurde aus den Stellungnahmen?',
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
