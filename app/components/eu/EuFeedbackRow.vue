<script setup lang="ts">
/**
 * One contribution of an organisation on the Commission's portal, in the
 * grammar of a Stellungnahme's row (`StatementRow`): date · name · kind ·
 * country (15.11.2026; the country by its German name since 16.11.2026).
 *
 * The NAME carries the link here, not a citation: a contribution has no
 * handle of its own to quote, and the name is what a reader looks for. It
 * opens the contribution on the portal, where its text is read — the
 * monitor never fetches it. A row without a valid number on the portal is
 * listed without a link.
 *
 * One column below the list's threshold (`row-cols`, main.css), as the
 * Stellungnahmen: the name on its own line, date, kind and country in one
 * meta line under it. Four tracks from there up (`feedback-tracks`); the
 * name comes first in the DOM — it is what the row is about — so the tracks
 * are placed explicitly.
 */
import { formatDateDe } from '#shared/utils/format'
import { EU_FEEDBACK_DE as DE, type EuFeedbackRow } from '~/utils/euFeedback'

defineProps<{ row: EuFeedbackRow }>()
</script>

<template>
  <li class="grid grid-cols-1 items-baseline gap-x-3 gap-y-1 px-4 py-2.5 row-cols:feedback-tracks">
    <!-- Three lines at most, as the Stellungnahmen: what tells two
         organisations apart often sits at the end of the name. -->
    <span class="min-w-0 row-cols:col-start-2 row-cols:row-start-1">
      <span class="line-clamp-3 text-sm font-medium text-ink">
        <ExternalLink v-if="row.url" :href="row.url" :aria-label="row.linkLabel" class="tap-target link-quiet">{{ row.name }}</ExternalLink>
        <template v-else>{{ row.name }}</template>
      </span>
    </span>
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm row-cols:contents">
      <span class="tabular-nums text-ink-muted row-cols:col-start-1 row-cols:row-start-1">{{ formatDateDe(row.date) }}</span>
      <span class="text-ink-secondary hyphens-auto row-cols:col-start-3 row-cols:row-start-1">{{ row.kind }}</span>
      <span class="text-ink-secondary hyphens-auto row-cols:col-start-4 row-cols:row-start-1">
        <span class="sr-only">{{ DE.countrySaid }}: </span>
        <template v-if="row.countryName">{{ row.countryName }}</template>
        <template v-else><span aria-hidden="true">–</span><span class="sr-only">{{ DE.noCountry }}</span></template>
      </span>
    </div>
  </li>
</template>
