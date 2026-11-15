<script setup lang="ts">
import { allRoutesLink, type ComparisonId, type Station, type StationId } from '~/utils/spine'

/**
 * The state card: where the item stands, as a heading, and its course under
 * it — the card every detail page opens with under its header, the same
 * card in the same place with the same weights. Drafts of the Bund and the
 * Länder, a RIS draft, a Vorlage or Antrag, a Land's law, an Anliegen.
 *
 * ITS ANATOMY IS FIXED, IN THIS ORDER (15.11.2026):
 *
 * 1. The heading — the STATE IN A FEW WORDS, nothing else: „In
 *    Begutachtung", „Bisher keine Regierungsvorlage", „Gesetz geworden".
 *    No sentence, no date, no count, no countdown (the door card below
 *    counts down). And NOTHING UNDER IT: the card has no slot between the
 *    heading and the rail, on purpose. A description there made the reader
 *    read two lines before the answer, and repeated what the rows say. A
 *    page that wants to say more says it in a row of the rail or in its
 *    own section below.
 *    Beside the heading, on its line, the one way out (`link`): the
 *    overview of every route (`/wege`), or an Anliegen's successor.
 * 2. The rail (`#rail`) — the five stations of a draft (`SpineRail`, from
 *    `stations`) by default; an Anliegen passes its own (`AnliegenRail`).
 *    Each station links into the section below that holds it, and each
 *    comparison into the section that answers it: the rail is the page's
 *    table of contents, in the page's order.
 * 3. The footer (`#footer`) — facts that close the card under the rail:
 *    the draft page's „second attempt", a term that explains the first
 *    station. Only ever under a rail: on a page without one it would stand
 *    under the heading, which (1) rules out.
 *
 * The rule's entry: `docs/decisions.md`, „The detail pages".
 *
 * The heading was the label „Der Text im Verfahren" until 16.09.2026, which
 * named the card and answered nothing; a <p> until 18.09.2026, so heading
 * navigation skipped the block that answers the page's question. „Station n
 * von 5" stood beside it for one day (18.09.2026): it counted the list one
 * is looking at.
 */
withDefaults(defineProps<{
  /** The state in a few words — `procedureStatusDe`, `regulationStatusDe`,
   *  `vorlageStatusDe`, `landStatusDe`, `anliegenHeadline`. */
  status: string
  /** The five stations, for the default rail. Empty where `#rail` is given. */
  stations?: Station[]
  anchors?: Partial<Record<StationId, string>>
  comparisonAnchors?: Partial<Record<ComparisonId, string>>
  /** The way out beside the heading. A station page passes its path's
   *  overview (`/wege?weg=…`); null shows none. */
  link?: { to: string; label: string } | null
}>(), { stations: () => [], anchors: undefined, comparisonAnchors: undefined, link: () => allRoutesLink() })
</script>

<template>
  <div class="mt-6">
    <div class="rounded-xl border border-hairline bg-surface p-4">
      <!-- (1) The answer, and the way out on the same line: at the bottom
           the link read as a footnote to the paragraph above it. -->
      <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 class="font-sans text-base font-semibold text-ink">
          {{ status }}
        </h2>
        <NuxtLink
          v-if="link"
          :to="link.to"
          class="tap-target text-sm font-medium link-quiet"
        >
          {{ link.label }} →
        </NuxtLink>
      </div>
      <!-- (2) The rail. -->
      <slot name="rail">
        <SpineRail
          v-if="stations.length"
          class="mt-4"
          :stations="stations"
          :anchors="anchors"
          :comparison-anchors="comparisonAnchors"
        />
      </slot>
      <!-- (3) The footer, under a rail only (see 1). -->
      <slot v-if="$slots.rail || stations.length" name="footer" />
    </div>
  </div>
</template>
