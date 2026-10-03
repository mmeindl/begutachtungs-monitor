<script setup lang="ts">
import type { ComparisonId, Station, StationId } from '~/utils/spine'

/**
 * The map: where the procedure stands, as a heading, and the station bar
 * under it — the card both detail pages open with under their header, the
 * same card in the same place with the same weights.
 *
 * Five stations for a Ministerialentwurf, read vertically, so it needs no
 * more width than a paragraph and lives in the prose column like everything
 * else. Each station links into the section below that holds it, and each
 * comparison into the section that answers it — the bar is the page's table
 * of contents, in the page's order. Without stations (a RIS Gesetz or an
 * untyped record, which have no path that can be read to its end) the card
 * keeps the heading and says the rest in words, through the slot.
 *
 * The default slot is the card's last part, under the bar: the
 * „second attempt" fact on the draft page, the dates sentence on the RIS
 * page.
 */
withDefaults(defineProps<{
  /** The answer in a few words — `procedureStatusDe`, `regulationStatusDe`. */
  status: string
  stations: Station[]
  anchors?: Partial<Record<StationId, string>>
  comparisonAnchors?: Partial<Record<ComparisonId, string>>
  /** Where „Wie funktioniert das Verfahren?" leads. */
  howTo?: string
}>(), { howTo: '/so-funktionierts' })
</script>

<template>
  <div class="mt-6">
    <div class="rounded-xl border border-hairline bg-surface p-4">
      <!-- The card opens with the ANSWER, and the way out of it sits on
           the same line: at the bottom the link read as a footnote to
           the predecessor paragraph above it, which it is not.
           This line was the label "Der Text im Verfahren" until
           16.09.2026 — a name for the card that told a visitor nothing
           the five rows below did not already say, in the one place
           where the whole procedure can be answered in two words. The
           label survives where it is still doing work: as the list's
           accessible name in SpineRail. -->
      <!-- A HEADING, since 18.09.2026. It was a <p>, so a screen
           reader's heading navigation skipped exactly the block that
           answers the page's question: straight from the h1 to „Worum
           geht es?".

           The line carries the answer and the way out, nothing else.
           „Station n von 5" stood beside it for one day and went again
           on 18.09.2026: the number counted the list one is looking at.
           Its two jobs are carried by others — which station is meant is
           said by this heading in words, and that there are five is said
           by the five rows. The link carries link weight: text-xs
           text-ink-muted was the page's only orientation aid, set to be
           overlooked. -->
      <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 class="font-sans text-base font-semibold text-ink">
          {{ status }}
        </h2>
        <NuxtLink
          :to="howTo"
          class="tap-target text-sm font-medium link-quiet"
        >
          Wie funktioniert das Verfahren? →
        </NuxtLink>
      </div>
      <SpineRail
        v-if="stations.length"
        class="mt-4"
        :stations="stations"
        :anchors="anchors"
        :comparison-anchors="comparisonAnchors"
      />
      <slot />
    </div>
  </div>
</template>
