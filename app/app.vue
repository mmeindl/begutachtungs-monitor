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
    <!-- A client-side navigation keeps the old page on screen until the new
         one's awaited fetches resolve — on a cold cache one to four seconds
         in which a click looked like it had done nothing. The bar says it
         did. Ink, not blue or yellow: it is neither something to do nor
         something to look at (one hue, one meaning). Nuxt's 200 ms throttle
         keeps it off warm navigations. -->
    <NuxtLoadingIndicator color="var(--color-ink)" :height="2" />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
