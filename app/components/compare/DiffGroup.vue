<script setup lang="ts">
/**
 * One group of a comparison section: the law it collects, the summary pills,
 * the chevron that opens it, and — once open — its body. Both sections built
 * this frame character for character; since 30.09.2026 it is one component.
 *
 * A pinned one-line bar with the law's name (GitHub's sticky file header)
 * stood here from 30.09. to 01.10.2026 and was taken out again: the group
 * header scrolls away with the page.
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
  <section class="border-b border-hairline last:border-b-0">
    <button
      type="button"
      class="flex w-full min-h-target flex-col gap-2 bg-page px-3 py-3 text-left hover:bg-hairline/40"
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

    <div v-if="open" class="border-t border-hairline">
      <slot />
    </div>
  </section>
</template>
