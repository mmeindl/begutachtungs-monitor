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
 * ONE SHARED RULE and one difference:
 *
 * 1. The meta line LEADS with the type word — and since 2026-09-17 so does
 *    DraftCard, which adds its Geschäftszahl to the same token. This used
 *    to be a difference: the type word stood here because these records
 *    have no Geschäftszahl to lead with. In a list that mixes both kinds
 *    that was the wrong asymmetry — labelling one kind and not the other
 *    makes the unlabelled kind read as the norm and this one as the
 *    exception, when it is in fact the larger half (median 7 open against
 *    6, measured 2026-09-17 over 2025-01-01 → today).
 * 2. The right-hand slot carries the Frist and nothing else. There is no
 *    Stellungnahmen count to put there and there cannot be one: without a
 *    parliamentary Gegenstand nobody publishes who filed. Showing "0" would
 *    read as "nobody cared" when it means "nobody counts".
 */
defineProps<{ consultation: RisConsultation }>()
</script>

<template>
  <NuxtLink
    :to="`/entwuerfe/${consultation.id}`"
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
        <NewBadge v-if="isNewArrival(consultation.startedAt, consultation.active)" />
        <span v-if="consultation.startedAt">
          in Begutachtung seit {{ formatDateDe(consultation.startedAt) }}
        </span>
        <!-- Said on every row, not only on the detail page: the reader is
             about to look for a Stellungnahmen count that the row does not
             have, and the reason is the interesting part. Since 18.09.2026
             the row states the fact instead of naming the absence
             („nicht im Parlament"), which is what lets the four glosses
             elsewhere go — see `risFilingNote`. -->
        <span aria-hidden="true">·</span>
        <span>{{ risFilingNote(consultation.active) }}</span>
      </p>
    </div>
    <DeadlineBlock
      :deadline="consultation.deadline"
      :active="consultation.active"
      class="shrink-0"
    />
  </NuxtLink>
</template>
