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
import { BADGE_CLASS, type DiffBadge, GUTTER_CLASS } from '~/utils/diffBadges'

defineProps<{
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
</script>

<template>
  <div class="border-l-2 pl-3" :class="GUTTER_CLASS[badge]">
    <p class="mb-1 text-sm">
      <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" :class="BADGE_CLASS[badge]">
        {{ label }}
      </span>
      <slot name="pill-after" />
    </p>

    <slot name="lead" />

    <!-- An unchanged one only reaches a block of its own while a search is
         running; both versions hold the same text, so it reads as the one
         sentence it is. -->
    <p v-if="change === 'unchanged'" class="hyphens-auto text-sm leading-relaxed text-ink-secondary">{{ unchangedText ?? toText }}</p>
    <!-- Inline: one sentence, old struck out where the new stands. Right for
         most changes; which ones read better as two columns is decided per
         change (`readsSideBySide`), not by a switch. -->
    <p v-else-if="change === 'changed' && segments && !split" class="hyphens-auto text-sm leading-relaxed text-ink">
      <DiffText :segments="segments" />
    </p>
    <!-- Side by side. ONE shape for two cases: the text was rewritten too
         thoroughly to read inline, or the word diff hit its ceiling and
         there are no segments to inline (then `splitSegments` marks each
         side whole). The fallback used to be its own layout, which made a
         technical limit look like a different kind of change. -->
    <SideBySide v-else-if="change === 'changed'" :from-label="fromLabel" :to-label="toLabel">
      <template #from>
        <p class="hyphens-auto text-ink">
          <DiffText :segments="from" side="from" />
        </p>
      </template>
      <template #to>
        <p class="hyphens-auto text-ink">
          <DiffText :segments="to" side="to" />
        </p>
      </template>
    </SideBySide>
    <!-- Only one side has a text; a column to hold nothing beside it would be
         a column about our layout, not about the law. -->
    <p v-else-if="change === 'inserted'" class="hyphens-auto rounded bg-status-good/15 px-2 py-1 text-sm leading-relaxed text-ink">{{ toText }}</p>
    <p v-else-if="change === 'removed'" class="hyphens-auto rounded bg-status-critical/10 px-2 py-1 text-sm leading-relaxed text-ink">{{ fromText }}</p>

    <slot />
  </div>
</template>
