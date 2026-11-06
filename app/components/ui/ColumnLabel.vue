<script setup lang="ts">
/**
 * One cell of a `ColumnHeader`: a plain label, or — with `sort` — the
 * button that orders the list by this column (`SortHeader`).
 *
 * The plain label is `aria-hidden` (the header is a visual aid); the button
 * is not, it is the one part of the header assistive tech must reach. The
 * root is the column's cell, so its track classes go on the component.
 */
defineProps<{
  label: string
  /**
   * The order this column stands for: what it does, whether it is on, and —
   * reversible since 06.11.2026 — what it does the other way round and
   * whether that way is on (`SortHeader`).
   */
  sort?: { order: string; reverseOrder: string; active: boolean; reversed?: boolean } | null
  /** Which edge the label sits on — the column's numbers are right-aligned. */
  align?: 'start' | 'end'
}>()

defineEmits<{ choose: [] }>()
</script>

<template>
  <span>
    <SortHeader
      v-if="sort"
      :label="label"
      :order="sort.order"
      :reverse-order="sort.reverseOrder"
      :active="sort.active"
      :reversed="sort.reversed ?? false"
      :align="align"
      @choose="$emit('choose')"
    />
    <span v-else aria-hidden="true">{{ label }}</span>
  </span>
</template>
