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
  <component
    :is="to ? NuxtLink : 'div'"
    :to="to"
    class="block rounded-xl border border-hairline bg-surface p-5"
    :class="to ? 'transition-colors hover:border-baseline' : ''"
  >
    <p class="text-sm text-ink-secondary">{{ label }}</p>
    <p class="mt-1 font-heading text-3xl font-semibold text-ink sm:text-4xl">
      {{ display }}
    </p>
    <p v-if="hint" class="mt-1 text-sm text-ink-muted">{{ hint }}</p>
  </component>
</template>
