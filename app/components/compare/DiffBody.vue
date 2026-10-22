<script setup lang="ts">
/**
 * The body of one change in a comparison section: the coloured gutter, the
 * pill that names the kind of change, and the text — inline, in two
 * columns, or whole. One shape for the § comparison's units and the
 * Gegenüberstellung's rows, which wrote it out twice until 04.10.2026 —
 * the two sections answer neighbouring questions, and a second visual
 * language would suggest a difference that is not there.
 *
 * Slots: `pill-after` beside the pill (the check's state), `lead` between
 * pill and text (a sentence that says how to read it), and the default slot
 * under the text, still inside the gutter (the reasoning drawer).
 */
import type { LawDiffSegment, LawUnitChange } from '#shared/types'
import { absaetze } from '~/utils/absaetze'
import { BADGE_CLASS, type DiffBadge, GUTTER_CLASS, PILL_CLASS } from '~/utils/diffBadges'

const props = defineProps<{
  badge: DiffBadge
  /** The pill's word — the sections differ in one (`badgeLabels`). */
  label: string
  change: LawUnitChange
  /** The word diff; null where it hit its ceiling. */
  segments: LawDiffSegment[] | null
  /** The two columns (`splitSegments`). */
  from: LawDiffSegment[]
  to: LawDiffSegment[]
  /** This change reads better as two columns (`readsSideBySide`). */
  split: boolean
  fromText: string | null
  toText: string | null
  /** What an unchanged one prints — `toText` unless given. */
  unchangedText?: string | null
  fromLabel: string
  toLabel: string
}>()

/*
 * Every text here in its Absätze, Ziffern and Litera, not as one wall
 * (22.10.2026) — by the rule measured for the Lesefassung (`absaetze`,
 * docs/architecture.md §12.12a), which until then was the only place that
 * broke a § up. In columns each side is cut on its own text: a struck „(2)"
 * must not open a block on the side that no longer has it.
 */
const plain = (text: string | null | undefined): string[] =>
  text ? absaetze([{ type: 'equal', text }]).map((block) => block.map((s) => s.text).join(' ')) : []
const inline = computed(() => (props.segments ? absaetze(props.segments) : []))
const fromBlocks = computed(() => absaetze(props.from.filter((s) => s.type !== 'inserted')))
const toBlocks = computed(() => absaetze(props.to.filter((s) => s.type !== 'removed')))
const unchangedBlocks = computed(() => plain(props.unchangedText ?? props.toText))
const insertedBlocks = computed(() => plain(props.toText))
const removedBlocks = computed(() => plain(props.fromText))
</script>

<template>
  <div class="border-l-2 pl-3" :class="GUTTER_CLASS[badge]">
    <p class="mb-1 text-sm">
      <span :class="[PILL_CLASS, BADGE_CLASS[badge]]">
        {{ label }}
      </span>
      <slot name="pill-after" />
    </p>

    <slot name="lead" />

    <!-- An unchanged one only reaches a block of its own while a search is
         running; both versions hold the same text, so it reads as the one
         sentence it is. -->
    <div v-if="change === 'unchanged'" class="space-y-1.5 hyphens-auto text-sm leading-relaxed text-ink-secondary">
      <p v-for="(block, i) in unchangedBlocks" :key="i">{{ block }}</p>
    </div>
    <!-- Inline: one sentence, old struck out where the new stands. Right for
         most changes; which ones read better as two columns is decided per
         change (`readsSideBySide`), not by a switch. -->
    <div v-else-if="change === 'changed' && segments && !split" class="space-y-1.5 hyphens-auto text-sm leading-relaxed text-ink">
      <p v-for="(block, i) in inline" :key="i"><DiffText :segments="block" /></p>
    </div>
    <!-- Side by side. ONE shape for two cases: the text was rewritten too
         thoroughly to read inline, or the word diff hit its ceiling and
         there are no segments to inline (then `splitSegments` marks each
         side whole). The fallback used to be its own layout, which made a
         technical limit look like a different kind of change. -->
    <SideBySide v-else-if="change === 'changed'" :from-label="fromLabel" :to-label="toLabel">
      <template #from>
        <div class="space-y-1.5 hyphens-auto text-ink">
          <p v-for="(block, i) in fromBlocks" :key="i"><DiffText :segments="block" side="from" /></p>
        </div>
      </template>
      <template #to>
        <div class="space-y-1.5 hyphens-auto text-ink">
          <p v-for="(block, i) in toBlocks" :key="i"><DiffText :segments="block" side="to" /></p>
        </div>
      </template>
    </SideBySide>
    <!-- Only one side has a text; a column to hold nothing beside it would be
         a column about our layout, not about the law. -->
    <div v-else-if="change === 'inserted'" class="space-y-1.5 hyphens-auto rounded bg-status-good/15 px-2 py-1 text-sm leading-relaxed text-ink">
      <p v-for="(block, i) in insertedBlocks" :key="i">{{ block }}</p>
    </div>
    <div v-else-if="change === 'removed'" class="space-y-1.5 hyphens-auto rounded bg-status-critical/10 px-2 py-1 text-sm leading-relaxed text-ink">
      <p v-for="(block, i) in removedBlocks" :key="i">{{ block }}</p>
    </div>

    <slot />
  </div>
</template>
