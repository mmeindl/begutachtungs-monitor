<script setup lang="ts">
const props = defineProps<{
  label: string
  value: number | string
  hint?: string
  /** Renders the tile as a link (route or in-page anchor). */
  to?: string
}>()

const NuxtLink = resolveComponent('NuxtLink')

/* Numbers get de-AT grouping; strings render as given.
 * Deliberately NO tabular-nums: large standalone values read best with the
 * font's proportional figures (dataviz rule — tabular only in columns). */
const display = computed(() =>
  typeof props.value === 'number' ? formatNumberDe(props.value) : props.value,
)
</script>

<template>
  <!-- Description above, number bottom-anchored: labels wrap freely while
       the row of figures keeps one shared baseline across all tiles — the
       hint therefore belongs to the description, never below the number. -->
  <component
    :is="to ? NuxtLink : 'div'"
    :to="to"
    class="flex h-full flex-col rounded-xl border border-hairline bg-surface p-5"
    :class="to ? 'transition-colors hover:border-baseline' : ''"
  >
    <p class="text-sm text-ink-secondary">{{ label }}</p>
    <p v-if="hint" class="mt-0.5 text-sm text-ink-muted">{{ hint }}</p>
    <p class="mt-auto pt-2 font-heading text-3xl font-semibold text-ink sm:text-4xl">
      {{ display }}
    </p>
  </component>
</template>
