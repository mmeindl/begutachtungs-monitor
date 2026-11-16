<script setup lang="ts">
/**
 * A count in its column of an EU list on `/eu-recht` (`app/utils/euCountCell.ts`):
 * the cell of the dense row from `md` up, where the draft list keeps its
 * Stellungnahmen (`entry-col-count`). Below `md` the row is a card and says
 * the observation in words itself (`cell.said`), so the cell is not drawn.
 */
import type { EuCountCell } from '~/utils/euCountCell'

defineProps<{ cell: EuCountCell }>()
</script>

<template>
  <div class="hidden md:block md:entry-col-count">
    <span class="sr-only">{{ cell.said }}</span>
    <span aria-hidden="true" class="block text-sm tabular-nums" :class="cell.counted ? 'font-semibold text-ink' : 'text-ink-muted'">{{ cell.value }}</span>
    <span v-if="cell.detail" aria-hidden="true" class="block text-xs text-ink-muted">{{ cell.detail }}</span>
  </div>
</template>
