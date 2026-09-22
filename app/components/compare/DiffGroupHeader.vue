<script setup lang="ts">
/**
 * The header of one group in a comparison section: the law it collects, the
 * summary pills, and the chevron that opens it. Character-identical in both
 * sections before this component, down to the pill classes.
 */
import { BADGE_CLASS, type DiffBadgeCount } from '~/utils/diffBadges'

defineProps<{
  /** The law or Artikel this group collects; empty where the annex names none. */
  title: string
  badges: DiffBadgeCount[]
  open: boolean
}>()

defineEmits<{
  toggle: []
}>()
</script>

<template>
  <button
    type="button"
    class="flex w-full min-h-11 flex-col gap-2 bg-page px-3 py-3 text-left hover:bg-hairline/40"
    :aria-expanded="open"
    @click="$emit('toggle')"
  >
    <span class="flex w-full items-start gap-3">
      <!-- A group without a law name is the law text itself: a single-law
           draft, or an annex that marks no boundaries. -->
      <span class="min-w-0 flex-1 text-sm font-semibold text-ink">{{ title || 'Gesetzestext' }}</span>
      <UIcon
        name="i-lucide-chevron-down"
        class="mt-0.5 size-4 shrink-0 text-ink-muted transition-transform"
        :class="{ 'rotate-180': open }"
        aria-hidden="true"
      />
      <!-- NO sr-only „aufklappen/zuklappen": `aria-expanded` on the button
           already states the state, and the screen reader read it twice („…
           zuklappen, Schaltfläche, erweitert"). -->
    </span>
    <span class="flex flex-wrap gap-1.5">
      <span
        v-for="b in badges"
        :key="b.badge"
        class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums"
        :class="BADGE_CLASS[b.badge]"
      >
        {{ b.count }} {{ b.label }}
      </span>
    </span>
  </button>
</template>
