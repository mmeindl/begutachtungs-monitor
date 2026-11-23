<script setup lang="ts">
/**
 * A table of a new law, in the rows and columns the document gives it
 * (23.11.2026). An empty cell stays a cell: it is what says that a limit value
 * stands under „TMW" and not under „MW8".
 *
 * Hairlines and nothing else, in the text's own size. A table wider than the
 * column scrolls inside its own box, so the page never does, and takes the
 * keyboard's focus so that it can be scrolled without a pointer (WCAG 2.1.1).
 * No hyphenation, and a short value stays on one line: „350 *)" broken in
 * two on a phone reads as two values.
 */
import type { LawTable } from '#shared/types'

/** Up to this many characters a cell's line does not wrap; a sentence in a cell does. */
const SHORT_VALUE = 16

const props = defineProps<{ table: LawTable }>()

const head = computed(() => props.table.rows.filter((row) => row.some((c) => c.header)))
const body = computed(() => props.table.rows.filter((row) => !row.some((c) => c.header)))
</script>

<template>
  <div role="region" :aria-label="table.title || 'Tabelle'" tabindex="0" class="max-w-full overflow-x-auto">
    <table class="w-full border-collapse text-sm text-ink">
      <thead v-if="head.length">
        <tr v-for="(row, r) in head" :key="r">
          <th
            v-for="(cell, c) in row"
            :key="c"
            scope="col"
            :colspan="cell.colspan"
            :rowspan="cell.rowspan"
            class="border border-hairline px-2 py-1 text-left align-top font-semibold"
          >
            <span v-for="(line, l) in cell.lines" :key="l" class="block" :class="line.text.length <= SHORT_VALUE && 'whitespace-nowrap'"><EnactedText :line="line" /></span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, r) in body" :key="r">
          <td
            v-for="(cell, c) in row"
            :key="c"
            :colspan="cell.colspan"
            :rowspan="cell.rowspan"
            class="border border-hairline px-2 py-1 align-top"
          >
            <span v-for="(line, l) in cell.lines" :key="l" class="block" :class="line.text.length <= SHORT_VALUE && 'whitespace-nowrap'"><EnactedText :line="line" /></span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
