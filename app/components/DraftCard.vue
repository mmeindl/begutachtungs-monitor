<script setup lang="ts">
import type { DraftSummary } from '#shared/types'
import { aliasesFor } from '#shared/utils/aliases'

withDefaults(
  defineProps<{
    draft: DraftSummary
    /**
     * What the right-hand slot leads with. 'deadline' (default) is the Frist
     * countdown; 'volume' promotes the Stellungnahmen count into that slot —
     * for the section that ranks by it — and drops it from the meta line, so
     * the figure appears exactly once per card.
     */
    emphasis?: 'deadline' | 'volume'
  }>(),
  { emphasis: 'deadline' },
)
/**
 * The debate name, where the procedure has one — the recognition key for
 * someone who searched "Bundestrojaner" and now has to spot their case in a
 * list of official Sammeltitel (`shared/utils/aliases.ts`). Quoted, because
 * it is someone else's word, not the tool's naming: only the first one, the
 * detail page carries the rest.
 */
const debateName = (c: DraftSummary) => aliasesFor(c.gp, c.inr)[0] ?? null

</script>

<template>
  <NuxtLink
    :to="`/entwuerfe/${draft.gp}/${draft.inr}`"
    class="group flex h-full flex-col gap-3 rounded-xl border border-hairline bg-surface p-5 transition-colors hover:border-baseline sm:flex-row sm:items-start sm:gap-4"
  >
    <div class="flex min-w-0 flex-1 flex-col gap-2">
      <h3
        class="line-clamp-2 font-medium text-ink group-hover:underline"
        :title="draft.title"
      >
        {{ draft.title }}
      </h3>
      <p
        class="mt-auto flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-ink-secondary"
      >
        <span>{{ draft.citation }}</span>
        <template v-if="debateName(draft)">
          <span aria-hidden="true">·</span>
          <span class="text-ink">„{{ debateName(draft) }}“</span>
        </template>
        <span aria-hidden="true">·</span>
        <MinistryBadge
          :code="draft.ministryCode"
          :name="draft.ministryName"
        />
        <span aria-hidden="true">·</span>
        <span>in Begutachtung seit {{ formatDateDe(draft.arrivedAt) }}</span>
        <!-- Weight-based emphasis: 786 Stellungnahmen must look different
             from 3 — the count is the news signal on a card. Omitted under
             emphasis="volume", where the aside carries it as the figure. -->
        <template v-if="emphasis !== 'volume'">
          <span aria-hidden="true">·</span>
          <span>
            <span class="font-semibold tabular-nums text-ink">{{
              formatNumberDe(draft.statementCount)
            }}</span>
            {{ draft.statementCount === 1 ? 'Stellungnahme' : 'Stellungnahmen' }}
          </span>
        </template>
      </p>
    </div>
    <!-- Right-hand slot, one card anatomy for every list: the Frist by
         default, the ranked count under emphasis="volume", and the outcome
         chip when the dashboard's closed section fills the slot itself. -->
    <slot name="aside">
      <StatementCountBlock
        v-if="emphasis === 'volume'"
        :count="draft.statementCount"
        :deadline="draft.deadline"
        :active="draft.active"
        class="shrink-0"
      />
      <DeadlineBlock
        v-else
        :deadline="draft.deadline"
        :active="draft.active"
        class="shrink-0"
      />
    </slot>
  </NuxtLink>
</template>
