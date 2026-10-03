<script setup lang="ts" generic="T extends string">
/**
 * WHAT a list shows — the first of a list box's three layers (02.10.2026):
 * tabs choose the set, the tool row below narrows and searches it, the
 * column header orders it. One grammar for every list on the site, so a
 * reader who learned one box can operate the next.
 *
 * Underlined tabs, not a segmented group. The segments were outlined
 * buttons with a tinted fill, the same fill as the „geändert" pill in the
 * comparisons — a selected „Fließtext" read as a fifth badge — and every
 * control in a head looked equally important. A tab says „this is the set
 * you are looking at" and steps back from the controls under it.
 *
 * Buttons with `aria-pressed` in a labelled group, NOT `role="tablist"`:
 * the tabs pattern promises arrow-key roving and a tabpanel, and these
 * switch a filter that also resets the pager and the search. The pressed
 * state is the honest contract, and the one the segments had.
 *
 * The selected tab is told from the others by weight and its underline,
 * not by hue (so never by colour alone, WCAG 1.4.1). The underline is ink,
 * not blue, since 03.10.2026: blue means „you can do something here", and
 * a selected tab is the one tab you cannot act on. An ink underline is not
 * text — what it owes is 1.4.11's 3:1 for a state, and ink on white is
 * 18.4:1.
 *
 * `collapse`: below `sm` the strip becomes one native select. Four tabs
 * with counts need ~465 px, a phone's box ~326; scrolling them sideways was
 * tried until 30.09.2026 and hid „Alle" behind an edge with nothing to say
 * it was there, and a 2×2 grid cost three rows. A select is one row and
 * names every option. Without `collapse` the tabs wrap instead — for a
 * strip short enough that a phone fits it, where hiding the options behind
 * a menu would cost more than an occasional second line.
 */
const model = defineModel<T>({ required: true })

defineProps<{
  /**
   * `disabled` with a `reason`: a tab that cannot hold anything under the
   * current filters stays in its place, so the strip does not change shape —
   * `aria-disabled`, not `disabled`, so it stays focusable and the reason
   * can be read out. `selectLabel` names an option in the phone's select
   * where the tab's word leans on its neighbours („Alle" → „Alle Stationen").
   */
  options: { value: T; label: string; count?: number; disabled?: boolean; reason?: string; selectLabel?: string }[]
  /** Names the group (and the select): the axis the tabs are values of. */
  groupLabel: string
  collapse?: boolean
}>()

const selectId = useId()

/* The select hands back a string; its options are exactly the tabs' values. */
function choose(value: string) {
  model.value = value as T
}
</script>

<template>
  <div>
    <div
      role="group"
      :aria-label="groupLabel"
      class="flex-wrap gap-x-5"
      :class="collapse ? 'hidden sm:flex' : 'flex'"
    >
      <button
        v-for="opt in options"
        :key="opt.value"
        type="button"
        :aria-pressed="model === opt.value"
        :aria-disabled="opt.disabled || undefined"
        :title="opt.disabled ? opt.reason : undefined"
        class="inline-flex items-center gap-1.5 border-b-2 py-2 text-sm"
        :class="model === opt.value
          ? 'border-ink font-medium text-ink'
          : opt.disabled
            ? 'cursor-not-allowed border-transparent text-ink-muted/60'
            : 'border-transparent text-ink-secondary hover:border-baseline hover:text-ink'"
        @click="!opt.disabled && (model = opt.value)"
      >
        <!-- Every tab is as wide as its BOLD label, always: an invisible
             bold copy shares the grid cell, so selecting one changes its
             weight and moves nothing beside it. `invisible` is
             visibility:hidden — not read out twice. -->
        <span class="grid">
          <span class="col-start-1 row-start-1">{{ opt.label }}</span>
          <span class="invisible col-start-1 row-start-1 font-medium" aria-hidden="true">{{ opt.label }}</span>
        </span>
        <span v-if="opt.count !== undefined" class="font-normal tabular-nums text-ink-muted">{{ formatNumberDe(opt.count) }}</span>
        <span v-if="opt.disabled && opt.reason" class="sr-only">({{ opt.reason }})</span>
      </button>
    </div>
    <div v-if="collapse" class="py-3 sm:hidden">
      <label :for="selectId" class="sr-only">{{ groupLabel }}</label>
      <TokenSelect :id="selectId" :model-value="model" block @update:model-value="choose">
        <option v-for="opt in options" :key="opt.value" :value="opt.value" :disabled="opt.disabled">
          {{ opt.selectLabel ?? opt.label }}{{ opt.count !== undefined ? ` (${formatNumberDe(opt.count)})` : '' }}
        </option>
      </TokenSelect>
    </div>
  </div>
</template>
