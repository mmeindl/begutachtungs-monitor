<script setup lang="ts">
import { NuxtLink } from '#components'
import type { OpenVorlage } from '#shared/types'

/**
 * Dense sibling of SecondRoundCard for md+ list contexts — the second-round
 * section under `/entwuerfe`, where the page switches to divider rows at the
 * same breakpoint as the list above it. Written when that section moved onto
 * the list page: six floating cards under a scannable sheet read as a
 * different page, and this page's pattern is one card AND one row per kind
 * (DraftRow, RisConsultationRow).
 *
 * Same anatomy, same positions: type word and Zitat lead the meta line, the
 * Stellungnahmen count sits where DraftRow puts it, and the fixed right
 * column carries the date. It cannot carry a Frist — the Vorlage publishes
 * none, the form closes with the vote — and putting "Stellungnahme möglich"
 * there instead was already rejected on the card: a value that never varies
 * is decoration, and the fact is stated once in the section heading.
 *
 * Two destinations, like the card: a Vorlage out of a Begutachtung links to
 * the monitor's own page, one without has no page here and links out, marked
 * as the procedural fact it is.
 */
const props = defineProps<{ vorlage: OpenVorlage }>()

const to = computed(() =>
  props.vorlage.draft
    ? `/entwuerfe/${props.vorlage.draft.gp}/${props.vorlage.draft.inr}`
    : null,
)

/**
 * NuxtLink as an imported value, never `resolveComponent('NuxtLink')`.
 * Resolved by name from inside the template expression it comes back
 * undefined in the client build, and Vue then renders a literal
 * `<nuxtlink>` element: a row that looks finished and is not a link,
 * on the one half of this section that points at the monitor's own pages.
 * SSR resolved it, the browser did not, so the markup was right until
 * hydration replaced it. The import binds the component at compile time.
 */
const linkComponent = computed(() => (to.value ? NuxtLink : 'a'))

const ROW = 'group flex min-h-11 items-center gap-4 px-4 py-3 transition-colors hover:bg-page'
</script>

<template>
  <component
    :is="linkComponent"
    v-bind="to ? { to } : { href: vorlage.parliamentUrl, target: '_blank', rel: 'noopener' }"
    :class="ROW"
  >
    <div class="min-w-0 flex-1">
      <p class="truncate font-medium text-ink group-hover:underline" :title="vorlage.title">
        {{ vorlage.title }}<span v-if="!to" aria-hidden="true"> ↗</span>
      </p>
      <p class="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-ink-secondary">
        <span class="text-ink">Regierungsvorlage</span>
        <span>{{ vorlage.citation }}</span>
        <template v-if="!to">
          <span aria-hidden="true">·</span>
          <span>ohne Begutachtung</span>
        </template>
        <!-- Phrased as what was filed, never as what it achieved. Zero is a
             real state here — and the most actionable one. Omitted when the
             count failed, rather than shown as a zero we did not measure. -->
        <template v-if="vorlage.statementCount !== null">
          <span aria-hidden="true">·</span>
          <span v-if="vorlage.statementCount === 0">noch keine Stellungnahme</span>
          <span v-else>
            <span class="font-semibold tabular-nums text-ink">{{
              formatNumberDe(vorlage.statementCount)
            }}</span>
            {{ vorlage.statementCount === 1 ? 'Stellungnahme' : 'Stellungnahmen' }}
          </span>
        </template>
      </p>
    </div>
    <!-- Same fixed width as the countdown column above, so the two sheets
         keep one silhouette. Upstream can leave DATUMSORT empty; then the
         column stays blank instead of rendering a dangling "seit". -->
    <div class="w-40 shrink-0 text-right text-sm text-ink-secondary">
      <span v-if="vorlage.date">im Nationalrat seit<br>{{ formatDateDe(vorlage.date) }}</span>
    </div>
  </component>
</template>
