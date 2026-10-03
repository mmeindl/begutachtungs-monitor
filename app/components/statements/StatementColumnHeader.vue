<script setup lang="ts">
import type { StatementSort } from '~/utils/statementRows'

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
 * Two of its labels ARE the sort since 02.10.2026 (`SortHeader`): the
 * panel's two orders are its Datum and Zustimmungen columns, so the button
 * group that stood above the list moved here. Still one control per sort —
 * two for one would be a reader checking whether they differ. Below
 * row-cols, where this header is not drawn, the same order is a select in
 * the panel's tool row; only one of the two is ever displayed.
 *
 * The citation and the PDF tag share one heading: they are the document and
 * its file, and the file column is empty on most rows (typed into
 * Parliament's web form) — a label of its own would mostly stand over
 * nothing.
 */
const sort = defineModel<StatementSort>('sort', { required: true })

/** Without a second row there is nothing to order: plain labels then. */
defineProps<{ sortable: boolean }>()
</script>

<template>
  <!-- `aria-hidden` per label, as in EntryList (`ColumnHeader`,
       `ColumnLabel`): the rows are not table cells, and the one value whose
       meaning the header carries visually — the Zustimmungen count — keeps
       its unit as screen-reader text in the cell. The sort buttons are the
       exception and stay reachable. Sticky inside the panel's sheet, so past
       the first screen of a long list the right-hand digits still have a
       name. -->
  <ColumnHeader :sortable="sortable" class="gap-x-3 row-cols:grid row-cols:statement-tracks">
    <ColumnLabel label="Datum" :sort="sortable ? { order: 'neueste zuerst', active: sort === 'date' } : null" @choose="sort = 'date'" />
    <ColumnLabel label="Eingebracht von" />
    <ColumnLabel label="Stellungnahme" class="col-span-2" />
    <ColumnLabel label="Zustimmungen" :sort="sortable ? { order: 'meiste zuerst', active: sort === 'endorsements' } : null" align="end" class="text-right" @choose="sort = 'endorsements'" />
  </ColumnHeader>
</template>
