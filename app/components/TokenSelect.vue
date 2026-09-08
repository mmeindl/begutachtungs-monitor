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
  <!-- Shrink-to-fit, but never wider than the container: a native <select>
       takes its width from the widest option (a Ressort name runs 60-odd
       characters), and its automatic minimum size would otherwise defeat the
       caller's max-width and push the page into horizontal scroll on mobile.
       Callers that are flex items need min-w-0 for the same reason. -->
  <span class="relative inline-flex min-w-0 max-w-full">
    <select
      :id="id"
      v-model="model"
      :aria-label="ariaLabel"
      class="min-h-11 w-full min-w-0 appearance-none truncate rounded-md border border-hairline bg-surface py-2 pl-3 pr-9 text-sm text-ink hover:border-baseline"
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
