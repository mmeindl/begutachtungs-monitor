<script setup lang="ts">
/**
 * „Ganzer Paragraph danach (nicht amtlich)" — one § of our own Lesefassung,
 * folded (docs/architecture.md §12.12a).
 *
 * Its own component since 26.10.2026, because it now stands in two places:
 * under the § of the Textgegenüberstellung it was checked against, and — for
 * a § the page could not place there — in the list at the end of its law
 * (`placeLesefassung`). One markup, so the two cannot drift.
 */
import type { ConsolidatedParagraph } from '#shared/types'
import { absaetze } from '~/utils/absaetze'

defineProps<{ paragraph: ConsolidatedParagraph }>()
</script>

<template>
  <Disclosure size="xs" tone="ink">
    <template #summary>Ganzer Paragraph danach (nicht amtlich)</template>
    <div class="mt-1 pl-6">
      <!-- „nicht amtlich" stands IN the summary since 30.09.2026, so it is
           read before the disclosure opens, not after; inside, only the way
           to how the text is made (RIS in force plus this draft's
           instructions, confirmed by the ressort's own Gegenüberstellung). -->
      <!-- The text in force it starts from, per § (26.10.2026): the section's
           credit linked the first shown §'s law only, which in a package is
           the wrong law for every other one. -->
      <p class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
        <NuxtLink to="/so-funktionierts#lesefassung" class="link-inline">Wie diese Lesefassung entsteht</NuxtLink>
        <ExternalLink v-if="paragraph.risUrl" :href="paragraph.risUrl" class="link-muted">Geltender Text im RIS</ExternalLink>
      </p>
      <p v-if="paragraph.headingSegments" class="mt-2 text-sm font-semibold text-ink">
        <DiffText :segments="paragraph.headingSegments" removed-normal-weight />
      </p>
      <!-- One paragraph per Absatz: that is how the law is structured, and
           eighteen of them in one block are no structure at all. -->
      <p
        v-for="(abs, ai) in absaetze(paragraph.segments)"
        :key="ai"
        class="mt-2 hyphens-auto text-sm leading-relaxed text-ink"
      >
        <DiffText :segments="abs" />
      </p>
    </div>
  </Disclosure>
</template>
