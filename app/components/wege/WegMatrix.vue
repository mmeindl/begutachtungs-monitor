<script setup lang="ts">
/**
 * One matrix of `/wege` (16.11.2026, out of the page when the EU act, the
 * European Citizens' Initiative and the Anliegen got matrices of their own,
 * `WEG_MATRICES`): the stations of one rail as columns, its paths as rows
 * under their groups' bars. Drawn inside the page's one card (`ListBox`),
 * which holds the legend once for all of them.
 *
 * A real table from `lg` up — caption, column and row headers — so a screen
 * reader announces „Begutachtung: Stellungnahme möglich" per cell. Below
 * `lg` the same rows as one vertical rail each: five columns of German
 * compound names do not fit 320 px, and a table scrolled sideways hides the
 * stations on the right. `lg` and not `md` (14.11.2026): the station names
 * stand on one line, unbroken, and the five columns sized to them take
 * about 550 px — at `md` (card 718 px) that left the paths some 165 px, at
 * `lg` (894 px) they keep about 340. The switch is CSS only; the hidden half
 * is `display: none` and so out of the accessibility tree too. From `lg`
 * each matrix's station row sticks to the top of the window while its rows
 * scroll.
 *
 * Blue only where one can take part („you can do something here"), and
 * never alone: the mark has its own shape, a word for screen readers (the
 * row's own, `wegCellLabel`: „Rückmeldung möglich" on an EU act), and the
 * legend. `selected` marks one row in ink (selection is ink) with
 * `aria-current`, for the draft pages that link here with their own path.
 *
 * All copy is in `app/utils/wege.ts`.
 */
import { WEGE_COPY, type WegCell, type WegMatrix, wegCellLabel, wegStationLabel } from '~/utils/wege'
import { WEG_MARK_CLASS, WEG_MARK_GLYPH, WEG_SECTION_BAR } from '~/utils/wegeMarks'

defineProps<{
  matrix: WegMatrix
  /** The row `?weg=` names, or null. */
  selected: string | null
}>()

/* The column header's cells: sticky to the window, opaque on the card's
 * white, the hairline under each, so no row shows through. */
const HEAD_CELL = 'sticky top-0 z-10 border-b border-hairline bg-surface py-2 align-bottom font-medium'
/* A path row's cell: its own hairline (`border-separate`, see the table). */
const ROW_CELL = 'border-b border-hairline py-3 align-top'
/* The selected row (`?weg=`): an ink bar on its left edge, inside the inset. */
const SELECTED_BAR = 'shadow-[inset_3px_0_0_var(--color-ink)]'
/* The sticky header's height (one line, measured 14.11.2026) plus air, as
 * scroll margin on every row and link of the matrix — focus and `#weg-…`
 * never land under the header. */
const ROW_SCROLL = '[&_a]:scroll-mt-14 [&_tr]:scroll-mt-14'
/* The station columns (14.11.2026): each as wide as its own name on one
 * line plus `px-3` — `w-px` with `whitespace-nowrap` shrinks a column to
 * that — so each mark is centred under its own name; the path column
 * (`w-full`) takes all the rest, and its notes keep one or two lines. */
const STATION_COL = 'w-px whitespace-nowrap px-3 last:pr-4'

/* A cell's mark is shown on the phone's rail with its word only where the dot alone would not say it. */
const SAID_ON_RAIL = new Set<WegCell>(['stellungnahme', 'offen'])
</script>

<template>
  <div>
    <!-- From lg: the matrix. `border-separate`, not `collapse`: a collapsed
         border belongs to the table and stays behind when the header cell
         sticks, so the rows would show through under it. Each cell carries
         its own hairline instead; the last row leaves the next matrix's
         edge alone. -->
    <table class="hidden w-full border-separate border-spacing-0 text-sm lg:table [&_tbody:last-child_tr:last-child>*]:border-b-0">
      <caption class="sr-only">
        {{ matrix.caption }}
      </caption>
      <!-- STICKY to the window, not the card: `ListBox` clips its corners
           with `overflow: clip`, which is no scroll container. -->
      <thead>
        <tr>
          <th scope="col" :class="HEAD_CELL" class="w-full pl-4 pr-4 text-left text-ink-secondary">
            {{ matrix.pathColumn }}
          </th>
          <th
            v-for="station in matrix.stations"
            :key="station.id"
            scope="col"
            :class="[HEAD_CELL, STATION_COL]"
            class="text-center text-ink hyphens-none"
          >
            <NuxtLink v-if="station.href" :to="station.href" class="link-inline">
              {{ station.label }}
            </NuxtLink>
            <template v-else>
              {{ station.label }}
            </template>
          </th>
        </tr>
      </thead>

      <!-- Every link and every row keeps the header's height above it when
           the page scrolls it into view: WCAG 2.2 2.4.11, focus not hidden
           under the sticky row. -->
      <tbody v-for="group in matrix.groups" :key="group.key" :class="ROW_SCROLL">
        <tr>
          <th :colspan="matrix.stations.length + 1" scope="rowgroup" :class="WEG_SECTION_BAR">
            {{ group.label }}<span v-if="group.note" class="font-normal text-ink-secondary"> · {{ group.note }}</span>
          </th>
        </tr>
        <tr
          v-for="row in group.rows"
          :id="`weg-${row.id}`"
          :key="row.id"
          :aria-current="selected === row.id ? 'true' : undefined"
        >
          <th
            scope="row"
            :class="[ROW_CELL, selected === row.id && SELECTED_BAR]"
            class="pl-4 pr-4 text-left font-normal"
          >
            <NuxtLink
              v-if="row.href"
              :to="row.href"
              class="link-inline"
              :class="selected === row.id ? 'font-semibold' : 'font-medium'"
            >
              {{ row.label }}
            </NuxtLink>
            <span v-else class="text-ink" :class="selected === row.id ? 'font-semibold' : 'font-medium'">
              {{ row.label }}
            </span>
            <span v-if="row.note || row.source" class="mt-0.5 block text-ink-secondary">
              {{ row.note }}<template v-if="row.noteLink">
                ·
                <NuxtLink :to="row.noteLink.href" class="link-inline">{{ row.noteLink.label }}</NuxtLink>
              </template><template v-if="row.source">
                <template v-if="row.note"> · </template>
                <ExternalLink :href="row.source.href" class="link-inline">{{ row.source.label }}</ExternalLink>
              </template>
            </span>
            <span v-if="row.notFollowed" class="mt-0.5 block text-ink-secondary">
              <span class="font-medium text-ink">{{ WEGE_COPY.notFollowedPrefix }}</span> · {{ row.notFollowed }}
            </span>
            <GapNote v-if="row.gap" as="span" :text="row.gap" class="mt-0.5 block text-ink-secondary" />
          </th>
          <td v-for="station in matrix.stations" :key="station.id" :class="[ROW_CELL, STATION_COL]" class="text-center">
            <span class="inline-flex h-5 items-center justify-center" aria-hidden="true">
              <span :class="WEG_MARK_CLASS[row.cells[station.id]!]">{{ WEG_MARK_GLYPH[row.cells[station.id]!] }}</span>
            </span>
            <span class="sr-only">{{ wegCellLabel(row, row.cells[station.id]!) }}</span>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Below lg: one rail per path, the groups under the same bars. No
         column header here, so nothing sticks. -->
    <div class="lg:hidden">
      <section
        v-for="group in matrix.groups"
        :key="group.key"
        :aria-labelledby="`wege-${matrix.id}-${group.key}`"
        class="border-t border-hairline first:border-t-0"
      >
        <h2 :id="`wege-${matrix.id}-${group.key}`" :class="WEG_SECTION_BAR">
          {{ group.label }}<span v-if="group.note" class="block font-normal text-ink-secondary">{{ group.note }}</span>
        </h2>
        <ul class="divide-y divide-hairline">
          <li
            v-for="row in group.rows"
            :key="row.id"
            :aria-current="selected === row.id ? 'true' : undefined"
            class="px-4 py-4"
            :class="selected === row.id && SELECTED_BAR"
          >
            <p class="text-sm">
              <NuxtLink
                v-if="row.href"
                :to="row.href"
                class="link-inline"
                :class="selected === row.id ? 'font-semibold' : 'font-medium'"
              >
                {{ row.label }}
              </NuxtLink>
              <span v-else class="text-ink" :class="selected === row.id ? 'font-semibold' : 'font-medium'">
                {{ row.label }}
              </span>
              <span v-if="row.note || row.source" class="block text-ink-secondary">
                {{ row.note }}<template v-if="row.noteLink">
                  ·
                  <NuxtLink :to="row.noteLink.href" class="link-inline">{{ row.noteLink.label }}</NuxtLink>
                </template><template v-if="row.source">
                  <template v-if="row.note"> · </template>
                  <ExternalLink :href="row.source.href" class="link-inline">{{ row.source.label }}</ExternalLink>
                </template>
              </span>
              <span v-if="row.notFollowed" class="block text-ink-secondary">
                <span class="font-medium text-ink">{{ WEGE_COPY.notFollowedPrefix }}</span> · {{ row.notFollowed }}
              </span>
              <GapNote v-if="row.gap" as="span" :text="row.gap" class="block text-ink-secondary" />
            </p>
            <ol class="mt-2 space-y-1 text-sm">
              <li v-for="station in matrix.stations" :key="station.id" class="flex items-center gap-2">
                <span class="inline-flex w-4 shrink-0 justify-center" aria-hidden="true">
                  <span :class="WEG_MARK_CLASS[row.cells[station.id]!]">{{ WEG_MARK_GLYPH[row.cells[station.id]!] }}</span>
                </span>
                <span :class="row.cells[station.id] === 'entfaellt' ? 'text-ink-secondary' : 'text-ink'">
                  {{ wegStationLabel(row, station) }}
                </span>
                <span v-if="SAID_ON_RAIL.has(row.cells[station.id]!)" class="text-ink-secondary">
                  · {{ wegCellLabel(row, row.cells[station.id]!) }}
                </span>
                <span v-else class="sr-only">{{ wegCellLabel(row, row.cells[station.id]!) }}</span>
              </li>
            </ol>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
