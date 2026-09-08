<script setup lang="ts">
import type { ConsultationSummary } from '#shared/types'
import { aliasesFor } from '#shared/utils/aliases'

/**
 * Dense sibling of ConsultationCard for md+ list contexts (the archive
 * list, where journalists scan 100+ items): one row inside a divide-y
 * surface, deadline in a fixed-width right column so the values align
 * into a scannable countdown column.
 */
defineProps<{
  consultation: ConsultationSummary
}>()
/**
 * The debate name, where the procedure has one — the recognition key for
 * someone who searched "Bundestrojaner" and now has to spot their case in a
 * list of official Sammeltitel (`shared/utils/aliases.ts`). Quoted, because
 * it is someone else's word, not the tool's naming: only the first one, the
 * detail page carries the rest.
 */
const debateName = (c: ConsultationSummary) => aliasesFor(c.gp, c.inr)[0] ?? null

</script>

<template>
  <NuxtLink
    :to="`/begutachtungen/${consultation.gp}/${consultation.inr}`"
    class="group flex min-h-11 items-center gap-4 px-4 py-3 transition-colors hover:bg-page"
  >
    <div class="min-w-0 flex-1">
      <p
        class="truncate font-medium text-ink group-hover:underline"
        :title="consultation.title"
      >
        {{ consultation.title }}
      </p>
      <p class="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-ink-secondary">
        <span>{{ consultation.citation }}</span>
        <template v-if="debateName(consultation)">
          <span aria-hidden="true">·</span>
          <span class="text-ink">„{{ debateName(consultation) }}“</span>
        </template>
        <span aria-hidden="true">·</span>
        <span>
          <span class="font-semibold tabular-nums text-ink">{{
            formatNumberDe(consultation.statementCount)
          }}</span>
          {{ consultation.statementCount === 1 ? 'Stellungnahme' : 'Stellungnahmen' }}
        </span>
      </p>
    </div>
    <MinistryBadge
      :code="consultation.ministryCode"
      :name="consultation.ministryName"
      class="shrink-0"
    />
    <!-- Fixed column width aligns the countdown down the list. -->
    <div class="w-40 shrink-0 text-right">
      <DeadlineBlock
        :deadline="consultation.deadline"
        :active="consultation.active"
        class="inline-block"
      />
    </div>
  </NuxtLink>
</template>
