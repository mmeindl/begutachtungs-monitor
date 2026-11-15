<script setup lang="ts">
import type { EuRailStation } from '~/utils/euRail'

/**
 * The card an EU page opens with — an act's, a proposal's, an
 * initiative's: a draft's `ProcedureCard` with the EU rail in it. The
 * heading says where the object stands and nothing else, the way out to
 * every path a text can take („Alle Wege im Überblick", `/wege`) sits on
 * the same line, the rail follows. No explaining line under the heading:
 * what the stand rests on stands in the rail. The default slot is the
 * card's last part, under the rail, as in `ProcedureCard`.
 *
 * One component since 15.11.2026: the three pages each wrote the card by
 * hand, and the link was missing on all three.
 */
withDefaults(defineProps<{
  status: string
  stations: EuRailStation[]
  /** The rail's accessible name. */
  label: string
  howTo?: string
}>(), { howTo: '/wege' })
</script>

<template>
  <div class="mt-6">
    <div class="rounded-xl border border-hairline bg-surface p-4">
      <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 class="font-sans text-base font-semibold text-ink">
          {{ status }}
        </h2>
        <NuxtLink :to="howTo" class="tap-target text-sm font-medium link-quiet">
          Alle Wege im Überblick →
        </NuxtLink>
      </div>
      <EuRail class="mt-4" :stations="stations" :label="label" />
      <slot />
    </div>
  </div>
</template>
