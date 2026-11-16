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
 * The head is WHITE since the second pass on 02.10.2026, in three layers
 * that every box shares: the `tabs` slot chooses WHAT is listed
 * (`ListTabs`), the `header` slot narrows and searches it in one tool row,
 * and the column header inside the sheet orders it. It stood on the paper
 * tone for a few hours first, because the outlined segments were drawn for
 * that ground; with underlined tabs and fewer outlined buttons the reason
 * fell away, and a tinted band over three rows of controls was the heaviest
 * thing in the box. A hairline under each layer — under the tabs too where
 * they are a select on the phone, so the layers read the same at every
 * width and the box need not know which form the tabs took.
 *
 * A `frame` slot, above the tabs (16.11.2026): a row about the list as a
 * whole whose control changes the tabs' counts too — the feedback list's
 * „Gelesen sind … von …" with „Weitere … lesen" (`EuFeedbackPanel`). What
 * a control changes stands at it or below it, so it cannot sit in the tool
 * row under the tabs.
 *
 * A `sr-only` live region inside takes no gap (absolutely positioned
 * children are no flex items).
 *
 * The foot is not a slot: each row under the list carries its own
 * `border-t border-hairline px-4 py-3`, so a row that has nothing to say
 * leaves no empty band (the pager goes visually silent once everything is
 * shown, but stays mounted as a live region, see `ListMore`).
 *
 * `overflow-clip`, not `overflow-hidden`: both keep the rounded corners,
 * but `hidden` makes the sheet a scroll container, and a sticky header
 * inside (`DiffGroup`, `ColumnHeader`) would stick to it instead of
 * the window.
 */
defineProps<{
  /**
   * Classes on the tool row — for a row whose content is all
   * breakpoint-bound (the Stellungnahmen panel's phone-only sort select):
   * hiding the content alone would leave an empty padded band.
   */
  headerClass?: string | false
}>()
</script>

<template>
  <div class="overflow-clip rounded-xl border border-hairline bg-surface">
    <div v-if="$slots.frame || $slots.tabs || $slots.header" class="border-b border-hairline">
      <div v-if="$slots.frame" class="flex flex-col gap-3 px-4 py-3">
        <slot name="frame" />
      </div>
      <div v-if="$slots.tabs" class="px-4" :class="$slots.frame && 'border-t border-hairline'">
        <slot name="tabs" />
      </div>
      <!-- The line between tabs and tool row is the tool row's own top edge,
           so a tool row hidden at some width takes it along. -->
      <div v-if="$slots.header" class="flex flex-col gap-3 px-4 py-3" :class="[($slots.tabs || $slots.frame) && 'border-t border-hairline', headerClass]">
        <slot name="header" />
      </div>
    </div>
    <slot />
  </div>
</template>
