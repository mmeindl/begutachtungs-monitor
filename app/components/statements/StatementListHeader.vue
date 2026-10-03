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
  <!-- `aria-hidden` per label, as in EntryList: the rows are not table
       cells, and the one value whose meaning the header carries visually —
       the Zustimmungen count — keeps its unit as screen-reader text in the
       cell. The sort buttons are the exception and stay reachable.
       Sticky inside the panel's sheet, so past the first screen of a long
       list the right-hand digits still have a name. -->
  <!-- Less padding where the labels are buttons: the button brings its own
       target height (main.css), and the row should not grow by it. -->
  <div
    :class="sortable ? 'py-0.5' : 'py-2'"
    class="sticky top-0 z-10 hidden items-center gap-x-3 border-b border-hairline bg-surface px-4 text-xs font-medium uppercase tracking-wide text-ink-muted row-cols:grid row-cols:statement-tracks"
  >
    <span><SortHeader v-if="sortable" label="Datum" order="neueste zuerst" :active="sort === 'date'" @choose="sort = 'date'" /><span v-else aria-hidden="true">Datum</span></span>
    <span aria-hidden="true">Eingebracht von</span>
    <span aria-hidden="true" class="col-span-2">Stellungnahme</span>
    <span class="text-right"><SortHeader v-if="sortable" label="Zustimmungen" order="meiste zuerst" align="end" :active="sort === 'endorsements'" @choose="sort = 'endorsements'" /><span v-else aria-hidden="true">Zustimmungen</span></span>
  </div>
</template>
