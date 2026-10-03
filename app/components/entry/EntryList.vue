<script setup lang="ts">
import type { EntryView } from '~/utils/entryView'

/**
 * A list of entries, two densities, one column header — every list on the
 * site (docs/architecture.md §12.28).
 *
 * `EntryItem` settles what stands IN a row; this component settles what a
 * list of rows is: ONE SHEET at every width, rows parted by rules, with a
 * column header from `md` up. Below `md` the row stacks and carries its own
 * unit words. Switched purely by CSS, without JS and without a client hook.
 *
 * ONE LIST, since 01.10.2026. Until then both versions stood in the SSR HTML
 * — every entry twice, a card list for phones and a sheet from `md`, one of
 * them `display: none`. Measured on a 50-row page of `/entwuerfe`: the
 * hidden half was 40 % of the DOM, parsed and hydrated on every device that
 * never shows it. Now one `ul`, and the row is the stacked layout with `md:`
 * classes (`EntryItem`).
 *
 * NO CARDS ON A PHONE, since 03.10.2026. Below `md` every row was a card of
 * its own, 12 px apart: about 14 px of gap and border per row, a phone
 * screen of nothing on a 50-row page, and the list's controls floated above
 * the cards while from `md` they stand in the sheet. The rows are all one
 * kind, so a rule parts them as well as a gap, and the list box is the same
 * box at every width.
 *
 * SINCE 18.09.2026 THAT INCLUDES THE HOMEPAGE. The header used to stand on
 * `/entwuerfe` only, on the argument that over five cards it is more scaffold
 * than content. That counted rows and missed what the header does: it is the
 * condition under which the cells may drop their unit words, and only then do
 * the digits line up. The homepage also carries FOUR lists under one another,
 * and what stands in the same column has to stand on the same edge across
 * the sections. One header per section costs 29 px and makes four lists one
 * anatomy.
 *
 * The `evidence` slot is the one exception to „a row says about the draft
 * what there is about it": it carries the reason the row IS THERE — a
 * full-text hit's Fundstelle (§12.31). Passed through and evaluated per
 * entry, because in a mixed list only some rows have one.
 *
 * The title stands whole in both densities and wraps as often as it must; the
 * measurement and the trade-off are in `EntryItem`, zone 1.
 */
defineProps<{
  entries: EntryView[]
  /**
   * `ol` instead of `ul`: only where the ORDER is itself the statement (the
   * ranking by Stellungnahmen). A deadline list is sorted, not ranked — that
   * is a display state, not a meaning.
   */
  ordered?: boolean
  /**
   * The first column's heading. „Entwurf" everywhere except where the rows
   * are not drafts: the „Zweite Runde" section lists Regierungsvorlagen, and
   * a header calling them „Entwurf" would be the one place where the scaffold
   * contradicts the content.
   */
  lead?: string
  /**
   * Columns whose label orders the list (`SortHeader`, 02.10.2026): the
   * order's key and what it does. Only `/entwuerfe` passes it; every other
   * list keeps plain labels. Below `md` there is no header to carry it, and
   * the page offers the same order as a select. The first column is never
   * one: neither the arrival order nor A–Z earned a place under „Entwurf"
   * (§12.22).
   */
  sortable?: Partial<Record<'count' | 'state', { key: string; order: string }>>
  /** The current order's key, with `sortable`. */
  sort?: string
  /** The search the rows were filtered by; each row marks its words. */
  query?: string | null
}>()

defineEmits<{ 'update:sort': [key: string] }>()
</script>

<template>
  <!-- One sheet at every width (`ListBox`, since 03.10.2026 the component
       itself — EntryList redrew its sheet and head until then). Up to `md`
       the rows stack: enough width per row, two title lines, and every cell
       carries its own unit word — there is no header here that could say it
       for them. From `md` the header below appears and the row lies flat.

       The list's controls stand in the box's head: `tabs` and `header` are
       passed through to `ListBox`'s slots of the same name. -->
  <ListBox>
    <template v-if="$slots.tabs" #tabs>
      <slot name="tabs" />
    </template>
    <template v-if="$slots.header" #header>
      <slot name="header" />
    </template>
    <!-- With `sortable`, `aria-hidden` moves from the row to its plain
         labels: the sort buttons are the one part a screen reader must
         reach (`SortHeader`). Sticky inside its own sheet (`ColumnHeader`). -->
    <ColumnHeader v-if="entries.length" :sortable="!!sortable" class="gap-4 md:flex">
      <ColumnLabel :label="lead ?? 'Entwurf'" class="min-w-0 flex-1" />
      <!-- One line, and any excess spills LEFT, into the empty gap: the
           label is 121 px against a 112 px column at `md` (128 in 128 at
           `lg`, measured 30.09.2026). The right edge is what has to meet
           the digits; `justify-end` keeps it there, where a plain
           right-aligned text box overflows to the right, and the site-wide
           `overflow-wrap: break-word` broke it as „STELLUNGNAHME / N". -->
      <ColumnLabel
        label="Stellungnahmen"
        :sort="sortable?.count ? { order: sortable.count.order, active: sort === sortable.count.key } : null"
        align="end"
        class="entry-col-count flex justify-end whitespace-nowrap"
        @choose="sortable?.count && $emit('update:sort', sortable.count.key)"
      />
      <ColumnLabel
        label="Stand"
        :sort="sortable?.state ? { order: sortable.state.order, active: sort === sortable.state.key } : null"
        align="end"
        class="entry-col-state"
        @choose="sortable?.state && $emit('update:sort', sortable.state.key)"
      />
    </ColumnHeader>
    <!-- No rows: the list's own empty state, in the sheet's grammar (a
         name, the fact under it) instead of a card in the card. -->
    <slot v-if="!entries.length" name="empty" />
    <component
      :is="ordered ? 'ol' : 'ul'"
      v-if="entries.length"
      class="divide-y divide-hairline"
    >
      <li v-for="entry in entries" :key="entry.key">
        <EntryItem :entry="entry" :query="query">
          <template v-if="$slots.evidence" #evidence>
            <slot name="evidence" :entry="entry" />
          </template>
        </EntryItem>
      </li>
    </component>
    <!-- The rows under the list, inside the sheet as a `ListBox`'s foot
         (03.10.2026): the pager stood under the frame on `/entwuerfe` while
         the Stellungnahmen panel carried it in its own. Each row brings its
         own hairline and inset (`ListMore`), so nothing here draws an empty
         band. -->
    <slot name="foot" />
  </ListBox>
</template>
