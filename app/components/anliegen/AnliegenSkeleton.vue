<script setup lang="ts">
/**
 * An Anliegen's page while its data is on the way — `DraftSkeleton`'s bars,
 * with this page's own back link (that one leads to the Entwürfe, which an
 * Anliegen is not) and the rail's four rows.
 */
import { ANLIEGEN_BACK_DE } from '~/utils/anliegenView'

defineProps<{
  label?: string
}>()

const STEPS = ['w-1/3', 'w-3/5', 'w-2/5', 'w-1/4'] as const
const BAR = 'animate-pulse rounded bg-hairline motion-reduce:animate-none'
</script>

<template>
  <div role="status">
    <span class="sr-only">{{ label ?? 'Wird geladen …' }}</span>
    <BackLink :to="ANLIEGEN_BACK_DE.to" :label="ANLIEGEN_BACK_DE.label" />
    <div aria-hidden="true">
      <div :class="[BAR, 'h-4 w-40']" />
      <div :class="[BAR, 'mt-4 h-7 w-11/12 sm:h-8']" />
      <div :class="[BAR, 'mt-2 h-7 w-3/5 sm:h-8']" />
      <div class="mt-6 space-y-4 rounded-xl border border-hairline bg-surface p-4">
        <div :class="[BAR, 'h-5 w-1/3']" />
        <div v-for="(w, i) in STEPS" :key="i" :class="[BAR, 'h-3', w]" />
      </div>
    </div>
  </div>
</template>
