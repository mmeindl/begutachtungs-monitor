<script setup lang="ts">
/**
 * The three ways to follow the corpus without an account: the deadline
 * calendar for Apple/Outlook, the same calendar for Google, the RSS feed.
 * The home page and the list page carried the same thirteen lines.
 *
 * Inline content, not a paragraph of its own: the two pages say something
 * different around it — the home page a lead („Keine Frist verpassen:"), the
 * list page the ressort the list is filtered to — and they set the line
 * differently, once in the page header and once as a note under the filter
 * bar. The paragraph stays where those differences are decided.
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
  <template v-if="ministry">
    <a
      :href="`/feed.xml?ressort=${ministry}`"
      class="tap-target rounded font-medium text-accent-deep underline underline-offset-2 hover:no-underline"
    >RSS-Feed für dieses Ministerium</a>
    ·
  </template>
  <a
    :href="webcalUrl"
    class="tap-target rounded font-medium text-accent-deep underline underline-offset-2 hover:no-underline"
  >Fristen-Kalender abonnieren</a>
  (Apple/Outlook) ·
  <ExternalLink
    :href="googleCalUrl"
    class="tap-target rounded font-medium text-accent-deep underline underline-offset-2 hover:no-underline"
  >Google Kalender</ExternalLink>
  ·
  <a
    href="/feed.xml"
    class="tap-target rounded font-medium text-accent-deep underline underline-offset-2 hover:no-underline"
  >RSS</a>
  – ohne Konto, ohne Tracking.
</template>
