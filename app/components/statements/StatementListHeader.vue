<script setup lang="ts">
/**
 * The column header of the statements panel — the same scaffold the draft
 * lists carry (`EntryList`), on the same argument: it is the condition under
 * which the cells may drop their unit words, and only then is the
 * Zustimmungen column a column of digits instead of ten repetitions of one
 * word (02.10.2026).
 *
 * Shown from row-cols up only, the same container switch as `StatementRow`:
 * below it the row is a stacked card whose cells say their own units, and a
 * header would name columns that are not there. The tracks are the row's
 * (`statement-tracks`, main.css), so a label stands over the values it names.
 *
 * Labels, not sort controls: the order has its own button group above the
 * list, and two controls for one sort is a reader checking whether they
 * differ.
 *
 * The citation and the PDF tag share one heading: they are the document and
 * its file, and the file column is empty on most rows (typed into
 * Parliament's web form) — a label of its own would mostly stand over
 * nothing.
 */
</script>

<template>
  <!-- `aria-hidden`, as in EntryList: the rows are not table cells, and the
       one value whose meaning the header carries visually — the Zustimmungen
       count — keeps its unit as screen-reader text in the cell.
       Sticky inside the panel's sheet, so past the first screen of a long
       list the right-hand digits still have a name. -->
  <div
    aria-hidden="true"
    class="sticky top-0 z-10 hidden items-center gap-x-3 border-b border-hairline bg-surface px-4 py-2 text-xs font-medium uppercase tracking-wide text-ink-muted row-cols:grid row-cols:statement-tracks"
  >
    <span>Datum</span>
    <span>Eingebracht von</span>
    <span class="col-span-2">Stellungnahme</span>
    <span class="text-right">Zustimmungen</span>
  </div>
</template>
