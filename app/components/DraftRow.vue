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
        <!-- Same one token as DraftCard: the dense row sits in the same
             mixed list, so it needs the same type word. -->
        <span class="text-ink">Ministerialentwurf</span>
        <span>{{ draft.citation }}</span>
        <template v-if="debateName(draft)">
          <span aria-hidden="true">·</span>
          <span class="text-ink">„{{ debateName(draft) }}“</span>
        </template>
        <template v-if="isNewArrival(draft.arrivedAt, draft.active)">
          <span aria-hidden="true">·</span>
          <NewBadge />
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
    <!-- Fixed column width aligns the countdown down the list — and, once
         a Frist is over, the station that answers what became of it
         (§12.26). One column, one question at a time: while the Frist runs
         it is „bis wann", afterwards „was ist daraus geworden". -->
    <div class="w-44 shrink-0 text-right">
      <StationBlock
        v-if="!draft.active && draft.chain"
        :chain="draft.chain"
        :deadline="draft.deadline"
        dense
        class="inline-block"
      />
      <DeadlineBlock
        v-else
        :deadline="draft.deadline"
        :active="draft.active"
        class="inline-block"
      />
    </div>
  </NuxtLink>
</template>
