<script setup lang="ts">
/**
 * The sheet a list of rows stands on, with everything that operates on the
 * list inside it (02.10.2026): the controls in its head, the pager and the
 * way to more of the same in rows at its foot.
 *
 * Until now the controls stood above the sheet and the pager below it, so
 * a list was up to three loose rows of controls, a card, a pager and a
 * link. GitHub's boxes, Stripe's and Linear's tables carry a list's
 * toolbar in their header and its pagination in their footer. A control
 * still sits above what it changes, now inside the box that shows it.
 *
 * What stays OUTSIDE: the caption (`SectionCredits`), which stands under
 * the frame as under a chart, and warnings on how to read the list, above
 * it. A page-level filter bar (`/entwuerfe`) is the page's, not a box's.
 *
 * The head stands on the paper tone (`bg-page`), GitHub's box header: the
 * controls were drawn for that ground (outline buttons, segment groups),
 * the white search field reads as a field on it, and the box has three
 * zones (controls, rows, foot) instead of one white slab. Tried white
 * first, on 02.10.2026, and it was too much white. Not the argument
 * against the comparison's tinted group headers: those were a stack of
 * grey bars, and a box has one head. The foot stays white, a hairline
 * over it; the pager is one row, a second band would add weight without
 * structure. Rows in the head are spaced by `gap-3`, and a `sr-only` live
 * region inside takes no gap (absolutely positioned children are no flex
 * items).
 *
 * The foot is not a slot: each row under the list carries its own
 * `border-t border-hairline px-4 py-3`, so a row that has nothing to say
 * leaves no empty band (the pager goes visually silent once everything is
 * shown, but stays mounted as a live region, see `ListMore`'s `inset`).
 *
 * `overflow-clip`, not `overflow-hidden`: both keep the rounded corners,
 * but `hidden` makes the sheet a scroll container, and a sticky header
 * inside (`DiffGroup`, `StatementListHeader`) would stick to it instead of
 * the window.
 */
</script>

<template>
  <div class="overflow-clip rounded-xl border border-hairline bg-surface">
    <div v-if="$slots.header" class="flex flex-col gap-3 border-b border-hairline bg-page px-4 py-3">
      <slot name="header" />
    </div>
    <slot />
  </div>
</template>
