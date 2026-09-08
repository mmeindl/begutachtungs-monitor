<script setup lang="ts">
/**
 * Native <select> in token styling with the page-wide lucide chevron instead
 * of the browser's own. Native, not USelect: in Vite 8 (rolldown) + Nuxt UI
 * 4.10, reka-ui's SelectItem reaches the browser without a render function
 * and crashes hydration (Aug 2026). Options come through the slot; the
 * caller labels the control (aria-label or a <label for>).
 */
const model = defineModel<string>({ required: true })
defineProps<{ id?: string; ariaLabel?: string }>()
</script>

<template>
  <span class="relative inline-flex">
    <select
      :id="id"
      v-model="model"
      :aria-label="ariaLabel"
      class="min-h-11 appearance-none rounded-md border border-hairline bg-surface py-2 pl-3 pr-9 text-sm text-ink hover:border-baseline"
    >
      <slot />
    </select>
    <UIcon
      name="i-lucide-chevron-down"
      class="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
      aria-hidden="true"
    />
  </span>
</template>
