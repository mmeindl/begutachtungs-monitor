<script setup lang="ts">
import { NuxtLink } from '#components'
import type { OpenVorlage } from '#shared/types'

/**
 * One Regierungsvorlage that is still taking Stellungnahmen — the second
 * window for input.
 *
 * Same card anatomy as DraftCard (border, padding, title, meta line, a
 * right-hand slot for the one key fact), because it sits directly under
 * "Jetzt in Begutachtung" and the two lists must read as one column.
 *
 * The right-hand slot carries the Stellungnahmen count, in
 * StatementCountBlock's silhouette. It cannot carry a Frist — the Vorlage
 * publishes none, the form closes with the vote — and the first draft of
 * this card put "Stellungnahme möglich" there instead. That printed the
 * same two lines six times down the column: a slot whose value never varies
 * is decoration, and it drowned out the titles it sits next to. The state
 * is true of every row by construction, so it is stated ONCE, in the
 * section heading; the rows carry what actually differs.
 *
 * Two destinations, deliberately. A Vorlage that came out of a Begutachtung
 * links to the monitor's own page, where the whole chain is; one that did
 * not has no page here and links to parlament.gv.at, marked as what it is.
 * Roughly a quarter of Vorlagen have no Begutachtung behind them
 * (`docs/begutachtung-uebersprungen.md`) — hiding them because the data
 * model has no row for them would hide a real, open participation window.
 * The mark is phrased as a procedural fact, never as an accusation: what
 * happened, not who is to blame (framing rule, CLAUDE.md).
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
 * `<nuxtlink>` element: a card that looks finished and is not a link,
 * on the one half of this section that points at the monitor's own pages.
 * SSR resolved it, the browser did not, so the markup was right until
 * hydration replaced it. The import binds the component at compile time.
 */
const linkComponent = computed(() => (to.value ? NuxtLink : 'a'))

const CARD =
  'group flex h-full flex-col gap-3 rounded-xl border border-hairline bg-surface p-5 transition-colors hover:border-baseline sm:flex-row sm:items-start sm:gap-4'
</script>

<template>
  <component
    :is="linkComponent"
    v-bind="to ? { to } : { href: vorlage.parliamentUrl, target: '_blank', rel: 'noopener' }"
    :class="CARD"
  >
    <div class="flex min-w-0 flex-1 flex-col gap-2">
      <h3
        class="line-clamp-2 font-medium text-ink group-hover:underline"
        :title="vorlage.title"
      >
        {{ vorlage.title }}<span v-if="!to" aria-hidden="true"> ↗</span>
      </h3>
      <p class="mt-auto flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-ink-secondary">
        <span>{{ vorlage.citation }}</span>
        <!-- The procedural fact, stated plainly: this text never went
             through a Begutachtung, so the monitor has no page for it and
             the link leads to parliament. -->
        <template v-if="!to">
          <span aria-hidden="true">·</span>
          <span>ohne Begutachtung</span>
        </template>
      </p>
    </div>
    <div class="shrink-0 sm:text-right">
      <!-- Phrased as what was filed, never as what it achieved. Zero is a
           real and useful state here — and the most actionable one. -->
      <p
        v-if="vorlage.statementCount !== null"
        class="whitespace-nowrap text-base font-semibold leading-tight tabular-nums text-ink"
      >
        <template v-if="vorlage.statementCount === 0">
          <span class="font-medium">noch keine Stellungnahme</span>
        </template>
        <template v-else>
          {{ formatNumberDe(vorlage.statementCount) }}
          <span class="font-medium">{{
            vorlage.statementCount === 1 ? 'Stellungnahme' : 'Stellungnahmen'
          }}</span>
        </template>
      </p>
      <!-- Upstream can leave DATUMSORT empty; then the line is omitted
           rather than rendered as a dangling "seit". -->
      <p v-if="vorlage.date" class="mt-0.5 text-xs text-ink-secondary">
        im Nationalrat seit {{ formatDateDe(vorlage.date) }}
      </p>
    </div>
  </component>
</template>
