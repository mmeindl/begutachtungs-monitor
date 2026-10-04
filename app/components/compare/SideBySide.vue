<script setup lang="ts">
/**
 * Two versions of one text beside each other, each under its version's name
 * — the shape both comparison sections fall back to where a change reads
 * better as two columns, and the reasoning drawer's where its two passages
 * cannot be compared word by word (04.10.2026; the grid and its labels were
 * written out six times).
 *
 * One column on a phone, the earlier version first. Where only the later
 * version has a text, leave `#from` out: one column then at every width,
 * rather than a column about our layout holding nothing.
 */
defineProps<{
  fromLabel: string
  toLabel: string
}>()
</script>

<template>
  <div class="grid gap-x-4 gap-y-2 text-sm leading-relaxed" :class="$slots.from ? 'sm:grid-cols-2' : ''">
    <div v-if="$slots.from">
      <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{{ fromLabel }}</p>
      <slot name="from" />
    </div>
    <div>
      <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{{ toLabel }}</p>
      <slot name="to" />
    </div>
  </div>
</template>
