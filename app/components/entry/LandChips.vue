<script setup lang="ts">
import { LAENDER_TOTAL, LAND_CODES, LAND_NAME } from '#shared/utils/laender'

/**
 * „Auch aus den Ländern": which Länder join the list below (22.10.2026).
 *
 * Chips that ADD to the one list, not a Bund/Länder switch: the question the
 * list answers — where can I still say something, and what is due first —
 * is one question, and two lists would each show half of what is urgent.
 * And nobody wants „all Länder", they want the Bund and their own.
 *
 * The choice is the site's (`useLandChoice`), so this component only shows
 * it and toggles it. What changes stands directly below: the list.
 *
 * The coverage stands beside the chips, always: the monitor reads some of
 * nine Länder, and a list that does not say so claims the rest are quiet.
 */
defineProps<{
  /** Why the Länder cannot join this view; null where they can. */
  unavailable?: string | null
}>()

const { chosen, toggle } = useLandChoice()
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
    <span class="text-sm text-ink-secondary">Auch aus den Ländern:</span>
    <ToggleChip
      v-for="land in LAND_CODES"
      :key="land"
      :pressed="chosen.includes(land)"
      :unavailable="unavailable"
      @toggle="toggle(land)"
    >
      {{ LAND_NAME[land] }}
    </ToggleChip>
    <span class="text-sm text-ink-muted">{{ LAND_CODES.length }} von {{ LAENDER_TOTAL }} Ländern</span>
  </div>
</template>
