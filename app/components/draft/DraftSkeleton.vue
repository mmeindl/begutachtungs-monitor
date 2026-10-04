<script setup lang="ts">
/**
 * A draft page's shape while its data is on the way (04.10.2026).
 *
 * Every page fetch is `lazy` since that day: a click shows the next page at
 * once instead of holding the old one until the request returns — on a cold
 * cache one to four seconds in which a click looked like it had done
 * nothing. The server still waits for the data, so a shared link, a search
 * engine and a link preview never see this.
 *
 * Bars where the identity line, the title and the byline will stand, and the
 * procedure card's frame with its five stations: the page lands where it
 * will stay, rather than a spinner that the header then pushes down. The
 * back link is the real one — the way back works before the data does.
 *
 * The bars are `ListSkeleton`'s, and like there the label is for screen
 * readers only.
 */
defineProps<{
  label?: string
}>()

const STATIONS = ['w-1/2', 'w-2/5', 'w-3/5', 'w-1/3', 'w-2/5'] as const
const BAR = 'animate-pulse rounded bg-hairline motion-reduce:animate-none'
</script>

<template>
  <div role="status">
    <span class="sr-only">{{ label ?? 'Wird geladen …' }}</span>
    <DraftBackLink />
    <div aria-hidden="true">
      <div :class="[BAR, 'h-4 w-40']" />
      <!-- The h1's line height at both sizes, two lines: most titles wrap. -->
      <div :class="[BAR, 'mt-4 h-7 w-11/12 sm:h-8']" />
      <div :class="[BAR, 'mt-2 h-7 w-3/5 sm:h-8']" />
      <div :class="[BAR, 'mt-4 h-4 w-1/2']" />
      <div class="mt-6 space-y-4 rounded-xl border border-hairline bg-surface p-4">
        <div :class="[BAR, 'h-5 w-1/3']" />
        <div v-for="(w, i) in STATIONS" :key="i" :class="[BAR, 'h-3', w]" />
      </div>
    </div>
  </div>
</template>
