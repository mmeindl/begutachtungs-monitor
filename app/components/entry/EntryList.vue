<script setup lang="ts">
import type { EntryView } from '~/utils/entryView'

/**
 * A list of entries, two densities, one column header — every list on the
 * site (docs/architecture.md §12.28).
 *
 * `EntryItem` settles what stands IN a row; this component settles what a
 * list of rows is: cards below `md`, from `md` up a sheet with a column
 * header and rules. Switched purely by CSS, without JS and without a client
 * hook — both versions stand in the SSR HTML.
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
 * full-text hit's Fundstelle (§12.31). Passed through to both densities and
 * evaluated per entry, because in a mixed list only some rows have one.
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
}>()
</script>

<template>
  <div>
    <!-- Cards up to `md`: enough width per row, two title lines, and every
         cell carries its own unit word — there is no header here that could
         say it for them. -->
    <component :is="ordered ? 'ol' : 'ul'" class="space-y-3 md:hidden">
      <li v-for="entry in entries" :key="entry.key">
        <EntryItem :entry="entry" density="card">
          <template v-if="$slots.evidence" #evidence>
            <slot name="evidence" :entry="entry" />
          </template>
        </EntryItem>
      </li>
    </component>

    <!-- From `md` a sheet: a table names its columns once. `aria-hidden`,
         because the rows below are links and not table cells — the header is
         a visual aid, the reading order stands in the row itself.

         The header is STICKY since 30.09.2026: past the first screen of a
         339-row list the two right columns were digits nobody had named.
         It sticks inside its own sheet only, so the homepage's four lists
         each carry theirs and hand over at the boundary. `overflow-clip`
         and not `overflow-hidden` on the sheet: both keep the rounded
         corners, but `hidden` makes the sheet a scroll container, and a
         sticky header inside one sticks to that and never to the window.
         Rows keep a scroll margin (`EntryItem`), so a row reached by Tab is
         never scrolled in under the header (WCAG 2.2 2.4.12). -->
    <div
      class="hidden overflow-clip rounded-xl border border-hairline bg-surface md:block"
    >
      <div
        aria-hidden="true"
        class="sticky top-0 z-10 flex items-center gap-4 border-b border-hairline bg-surface px-4 py-2 text-xs font-medium uppercase tracking-wide text-ink-muted"
      >
        <span class="min-w-0 flex-1">{{ lead ?? 'Entwurf' }}</span>
        <!-- One line, and any excess spills LEFT, into the empty gap: the
             label is 121 px against a 112 px column at `md` (128 in 128 at
             `lg`, measured 30.09.2026). The right edge is what has to meet
             the digits; `justify-end` keeps it there, where a plain
             right-aligned text box overflows to the right, and the site-wide
             `overflow-wrap: break-word` broke it as „STELLUNGNAHME / N". -->
        <span class="entry-col-count flex justify-end whitespace-nowrap">Stellungnahmen</span>
        <span class="entry-col-state">Stand</span>
      </div>
      <component :is="ordered ? 'ol' : 'ul'" class="divide-y divide-hairline">
        <li v-for="entry in entries" :key="entry.key">
          <EntryItem :entry="entry" density="row">
            <template v-if="$slots.evidence" #evidence>
              <slot name="evidence" :entry="entry" />
            </template>
          </EntryItem>
        </li>
      </component>
    </div>
  </div>
</template>
