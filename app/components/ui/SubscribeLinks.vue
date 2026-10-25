<script setup lang="ts">
/**
 * The ways to follow the corpus without an account: per source a deadline
 * calendar (Apple/Outlook, Google) and an RSS feed (25.10.2026: one feed per
 * source, the Bund and each Land, never mixed).
 *
 * One line closed, a list open. Six sources times three links cannot stand
 * on a line, and a select in front of three links (25.10.2026, the first
 * try) said neither what it chose nor that the links followed it. Open,
 * every row names its source, so nothing has to be inferred; the sources
 * the list shows come first, the one a reader most likely wants on top.
 *
 * A native <details> (`Disclosure`): opens in place, without hydration, by
 * keyboard. Not inside a <p> — the callers set it in a <div>.
 *
 * `ministry` adds that Ressort's own feed under the Bund: the ressort filter
 * is the moment somebody decides „dieses Ressort verfolge ich".
 */
import { SOURCE_CODES, SOURCE_NAME, type SourceCode } from '#shared/utils/laender'
import { feedUrlsOf } from '~/composables/useFeedUrls'
import Disclosure from '~/components/ui/Disclosure.vue'

const props = defineProps<{
  ministry?: string
}>()

const { bund, laender } = useSourceChoice()
const { siteUrl } = useRuntimeConfig().public

/* The list's sources first, in their order; the others after them. */
const rows = computed(() => {
  const chosen = SOURCE_CODES.filter((code) => (code === 'bund' ? bund.value : laender.value.includes(code)))
  const order: SourceCode[] = [...chosen, ...SOURCE_CODES.filter((code) => !chosen.includes(code))]
  return order.map((code) => ({ code, name: code === 'bund' ? 'Bund' : `Land ${SOURCE_NAME[code]}`, ...feedUrlsOf(siteUrl, code) }))
})
</script>

<template>
  <Disclosure>
    <template #summary>
      <UIcon name="i-lucide-calendar-plus" class="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
      Fristen abonnieren – als Kalender oder RSS-Feed
    </template>
    <ul class="mt-1 divide-y divide-hairline text-sm">
      <li
        v-for="row in rows"
        :key="row.code"
        class="flex flex-col gap-x-4 gap-y-0.5 py-2 sm:flex-row sm:items-baseline"
      >
        <span class="w-40 shrink-0 font-medium text-ink">{{ row.name }}</span>
        <span>
          <!-- A plain <a>, not ExternalLink: `webcal://` opens no page. The
               operating system hands it to Apple Calendar or Outlook and the
               tab stays here, so `_blank` would only leave an empty tab
               behind (Chrome), and „neues Fenster" and the ↗ would announce
               a window that never opens. Google and RSS are pages. -->
          <a :href="row.webcalUrl" class="tap-target link-inline">Apple/Outlook-Kalender</a>
          ·
          <ExternalLink :href="row.googleCalUrl" class="tap-target link-inline">Google-Kalender</ExternalLink>
          ·
          <ExternalLink :href="row.feedUrl" class="tap-target link-inline">RSS</ExternalLink>
          <template v-if="row.code === 'bund' && props.ministry">
            ·
            <ExternalLink
              :href="`/feed.xml?ressort=${encodeURIComponent(props.ministry)}`"
              class="tap-target link-inline"
            >RSS nur für dieses Ministerium</ExternalLink>
          </template>
        </span>
      </li>
    </ul>
  </Disclosure>
</template>
