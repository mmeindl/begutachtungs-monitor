<script setup lang="ts">
/**
 * The three ways to follow the corpus without an account: the deadline
 * calendar for Apple/Outlook, the same calendar for Google, the RSS feed.
 * The home page and the list page carried the same thirteen lines.
 *
 * Inline content, not a paragraph of its own: the two pages set the line
 * differently, once in the page header and once as a note under the title.
 * The paragraph stays where that difference is decided; the lead („Keine
 * Frist verpassen:") is the same on both and lives here, so the links can
 * be bare nouns — the lead says what they do.
 *
 * `ministry` puts that ressort's own feed first, where it belongs: the
 * ressort filter is the moment somebody decides „dieses Ressort verfolge
 * ich".
 */
defineProps<{
  ministry?: string
}>()

const { webcalUrl, googleCalUrl } = useFeedUrls()
</script>

<template>
  <UIcon
    name="i-lucide-calendar-plus"
    class="me-1 inline-block size-4 align-text-bottom"
    aria-hidden="true"
  />
  Keine Frist verpassen:
  <template v-if="ministry">
    <ExternalLink
      :href="`/feed.xml?ressort=${ministry}`"
      class="tap-target link-inline font-medium"
    >RSS-Feed für dieses Ministerium</ExternalLink>
    ·
  </template>
  <!-- A plain <a>, not ExternalLink: `webcal://` opens no page. The
       operating system hands it to Apple Calendar or Outlook and the tab
       stays here, so `_blank` would only leave an empty tab behind
       (Chrome), and „neues Fenster" and the ↗ would announce a window that
       never opens. Google and RSS are pages, so they get the arrow. -->
  <a
    :href="webcalUrl"
    class="tap-target link-inline font-medium"
  >Apple/Outlook-Kalender</a>
  ·
  <ExternalLink
    :href="googleCalUrl"
    class="tap-target link-inline font-medium"
  >Google-Kalender</ExternalLink>
  ·
  <ExternalLink
    href="/feed.xml"
    class="tap-target link-inline font-medium"
  >RSS</ExternalLink>
</template>
