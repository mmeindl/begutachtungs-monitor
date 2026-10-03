<script setup lang="ts">
/**
 * The column header of a list box — its third layer, the one that orders
 * the rows (`ListBox`, 02.10.2026). The draft lists (`EntryList`) and the
 * Stellungnahmen panel (`StatementColumnHeader`) drew the same row twice
 * until 03.10.2026; the tracks differ, so the display and the grid come in
 * through `class` (`md:flex gap-4`, `row-cols:grid row-cols:statement-tracks`).
 *
 * A visual aid: the rows below are links, not table cells, and the reading
 * order stands in the row itself. So the labels are `aria-hidden`, label by
 * label (`ColumnLabel`) — the sort buttons are the one part a screen reader
 * must reach (`SortHeader`) — and a header without any is hidden whole.
 *
 * STICKY since 30.09.2026: past the first screen of a long list the
 * right-hand digits were values nobody had named. It sticks inside its own
 * sheet only (`ListBox` clips, it does not scroll), so the homepage's lists
 * each carry theirs and hand over at the boundary. Rows keep a scroll margin
 * (`EntryItem`), so a row reached by Tab is never scrolled in under it
 * (WCAG 2.2 2.4.12).
 */
defineProps<{
  /** Some label is a sort button: less padding, the button brings its own
   *  target height (main.css), and the row should not grow by it. */
  sortable?: boolean
}>()
</script>

<template>
  <div
    :aria-hidden="sortable ? undefined : 'true'"
    :class="sortable ? 'py-0.5' : 'py-2'"
    class="sticky top-0 z-10 hidden items-center border-b border-hairline bg-surface px-4 text-xs font-medium uppercase tracking-wide text-ink-muted"
  >
    <slot />
  </div>
</template>
