<script setup lang="ts">
/**
 * A word diff as running text: removed words struck through on a red wash,
 * inserted words on a green one, everything else plain. The diff convention
 * everyone has read on GitHub, and the one shape both comparison sections
 * use — it was written out nine times between them before this component,
 * with the same class strings every time.
 *
 * `side` projects the same runs onto one column of the split view: the left
 * column is everything that is not `inserted`, the right everything that is
 * not `removed`. No second computation and no second endpoint — the same data
 * read twice (LawDiffSection's reasoning for the toggle).
 *
 * The trailing `{{ ' ' }}` is an interpolation rather than template
 * whitespace: the runs carry no spaces of their own, and template whitespace
 * around them is condensed away.
 */
import type { LawDiffSegment } from '#shared/types'

const props = withDefaults(
  defineProps<{
    segments: LawDiffSegment[]
    /** One column of the split view; unset renders every run. */
    side?: 'from' | 'to'
    /**
     * Set the removed run in normal weight. Only for a host that is bold
     * itself — the § heading of the Lesefassung — where the strikethrough
     * would otherwise be a bold one.
     */
    removedNormalWeight?: boolean
  }>(),
  { side: undefined, removedNormalWeight: false },
)

const shown = computed<LawDiffSegment[]>(() => {
  const side = props.side
  if (!side) return props.segments
  const drop = side === 'from' ? 'inserted' : 'removed'
  return props.segments.filter((s) => s.type !== drop)
})
</script>

<template>
  <template v-for="(s, i) in shown" :key="i">
    <del v-if="s.type === 'removed'" :class="['rounded bg-status-critical/10 px-0.5', removedNormalWeight ? 'font-normal' : '', 'text-ink line-through decoration-status-critical/70']">{{ s.text }}</del>
    <ins v-else-if="s.type === 'inserted'" class="rounded bg-status-good/15 px-0.5 text-ink no-underline">{{ s.text }}</ins>
    <span v-else>{{ s.text }}</span>
    {{ ' ' }}
  </template>
</template>
