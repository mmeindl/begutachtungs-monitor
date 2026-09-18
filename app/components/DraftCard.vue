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
        <!-- Type word first, Geschäftszahl with it — the same grammar
             RisConsultationCard uses, and for the same reason: in a list
             that mixes both kinds, labelling only one of them makes the
             unlabelled kind read as the norm and the other as the
             exception. It is the larger half. "132/ME" identifies the
             draft but only explains itself to someone who already knows
             the system; the word does the explaining, the number keeps
             the citation. No separator between them: one token. -->
        <span class="text-ink">Ministerialentwurf</span>
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
        <!-- Reads as one phrase with the line that follows it: "Neu in
             Begutachtung seit 17.09.2026". -->
        <NewBadge v-if="isNewArrival(draft.arrivedAt, draft.active)" />
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
         default, the ranked count under emphasis="volume", the station once
         the Frist is over and the list knows it, and the outcome chip when
         the dashboard's closed section fills the slot itself.

         Why the station only AFTER the Frist: while it runs, the one thing
         a reader can act on is the deadline, and no station may push it out
         of the slot. Afterwards the countdown has nothing left to count and
         the same slot answers the next question — was ist daraus geworden. -->
    <slot name="aside">
      <StatementCountBlock
        v-if="emphasis === 'volume'"
        :count="draft.statementCount"
        :deadline="draft.deadline"
        :active="draft.active"
        class="shrink-0"
      />
      <StationBlock
        v-else-if="!draft.active && draft.chain"
        :chain="draft.chain"
        :deadline="draft.deadline"
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
