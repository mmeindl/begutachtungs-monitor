<script setup lang="ts">
const props = defineProps<{
  label: string
  value: number
  max: number
  href?: string
  /** Short status suffix ("läuft noch") — words, not color, per the
      no-meaning-on-color rule; stays visible while the label truncates. */
  meta?: string
}>()

const NuxtLink = resolveComponent('NuxtLink')

const widthPct = computed(() => {
  if (props.max <= 0 || props.value <= 0) return 0
  return Math.min(100, (props.value / props.max) * 100)
})
</script>

<template>
  <!-- Whole row is the link when href is given; label + value text carry the
       accessible name, the bar itself is decorative (aria-hidden). -->
  <component :is="href ? NuxtLink : 'div'" :to="href" class="group block min-h-11 py-1.5">
    <div class="flex items-baseline gap-2">
      <span
        class="min-w-0 truncate text-sm text-ink-secondary"
        :class="href ? 'transition-colors group-hover:text-ink group-hover:underline' : ''"
        :title="label"
      >
        {{ label }}
      </span>
      <span v-if="meta" class="shrink-0 text-sm text-ink-muted">· {{ meta }}</span>
      <!-- Value in ink, never in the data color; tabular so values column-align. -->
      <span class="ml-auto shrink-0 pl-2 text-sm tabular-nums text-ink">{{
        formatNumberDe(value)
      }}</span>
    </div>
    <div class="mt-1.5 h-2 w-full rounded-r-[4px] bg-accent-wash" aria-hidden="true">
      <div
        class="h-2 rounded-r-[4px] bg-accent"
        :style="{ width: `${widthPct}%` }"
      />
    </div>
  </component>
</template>
