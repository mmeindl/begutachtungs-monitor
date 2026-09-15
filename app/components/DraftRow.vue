<script setup lang="ts">
import type { DraftSummary } from '#shared/types'
import { aliasesFor } from '#shared/utils/aliases'

/**
 * Dense sibling of DraftCard for md+ list contexts (the archive
 * list, where journalists scan 100+ items): one row inside a divide-y
 * surface, deadline in a fixed-width right column so the values align
 * into a scannable countdown column.
 */
defineProps<{
  draft: DraftSummary
}>()
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
    class="group flex min-h-11 items-center gap-4 px-4 py-3 transition-colors hover:bg-page"
  >
    <div class="min-w-0 flex-1">
      <p
        class="truncate font-medium text-ink group-hover:underline"
        :title="draft.title"
      >
        {{ draft.title }}
      </p>
      <p class="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-ink-secondary">
        <span>{{ draft.citation }}</span>
        <template v-if="debateName(draft)">
          <span aria-hidden="true">·</span>
          <span class="text-ink">„{{ debateName(draft) }}“</span>
        </template>
        <span aria-hidden="true">·</span>
        <span>
          <span class="font-semibold tabular-nums text-ink">{{
            formatNumberDe(draft.statementCount)
          }}</span>
          {{ draft.statementCount === 1 ? 'Stellungnahme' : 'Stellungnahmen' }}
        </span>
      </p>
    </div>
    <MinistryBadge
      :code="draft.ministryCode"
      :name="draft.ministryName"
      class="shrink-0"
    />
    <!-- Fixed column width aligns the countdown down the list. -->
    <div class="w-40 shrink-0 text-right">
      <DeadlineBlock
        :deadline="draft.deadline"
        :active="draft.active"
        class="inline-block"
      />
    </div>
  </NuxtLink>
</template>
