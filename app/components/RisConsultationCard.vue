<script setup lang="ts">
import type { RisConsultation } from '#shared/types'

/**
 * One Begutachtung that Parliament has no Gegenstand for — mostly a
 * Verordnungsentwurf (docs/architecture.md §12.16).
 *
 * Same card anatomy as DraftCard (border, padding, title, meta line,
 * right-hand slot for the one key fact), because on the homepage it sits
 * directly under "Jetzt in Begutachtung" and the two lists must read as one
 * column rather than as two products.
 *
 * TWO DIFFERENCES, both deliberate:
 *
 * 1. The meta line LEADS with the type word. On a DraftCard the first token
 *    is the Geschäftszahl, which every row has and which identifies it;
 *    these records have none, and the one thing a reader needs before
 *    anything else is which kind of instrument this is. It is never left
 *    implicit — a Verordnung silently mixed into a list of Gesetzesentwürfe
 *    would trade one wrong completeness claim for a wrong category claim.
 * 2. The right-hand slot carries the Frist and nothing else. There is no
 *    Stellungnahmen count to put there and there cannot be one: without a
 *    parliamentary Gegenstand nobody publishes who filed. Showing "0" would
 *    read as "nobody cared" when it means "nobody counts".
 */
defineProps<{ consultation: RisConsultation }>()
</script>

<template>
  <NuxtLink
    :to="`/weitere-entwuerfe/${consultation.id}`"
    class="group flex h-full flex-col gap-3 rounded-xl border border-hairline bg-surface p-5 transition-colors hover:border-baseline sm:flex-row sm:items-start sm:gap-4"
  >
    <div class="flex min-w-0 flex-1 flex-col gap-2">
      <h3
        class="line-clamp-2 font-medium text-ink group-hover:underline"
        :title="consultation.longTitle ?? consultation.title"
      >
        {{ consultation.title }}
      </h3>
      <p
        class="mt-auto flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-ink-secondary"
      >
        <span class="text-ink">{{ RIS_KIND_LABEL[consultation.kind] }}</span>
        <span aria-hidden="true">·</span>
        <MinistryBadge
          v-if="consultation.ministryCode"
          :code="consultation.ministryCode"
          :name="consultation.ministryName"
        />
        <span v-if="consultation.ministryCode" aria-hidden="true">·</span>
        <span v-if="consultation.startedAt">
          in Begutachtung seit {{ formatDateDe(consultation.startedAt) }}
        </span>
        <!-- Said on every row, not only on the detail page: the reader is
             about to look for a Stellungnahmen count that the row does not
             have, and the reason is the interesting part. -->
        <span aria-hidden="true">·</span>
        <span>nicht im Parlament</span>
      </p>
    </div>
    <DeadlineBlock
      :deadline="consultation.deadline"
      :active="consultation.active"
      class="shrink-0"
    />
  </NuxtLink>
</template>
