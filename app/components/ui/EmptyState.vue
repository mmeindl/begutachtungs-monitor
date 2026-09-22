<script setup lang="ts">
defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <div
    class="flex flex-col items-center justify-center gap-1 rounded-xl border border-hairline bg-surface px-6 py-12 text-center"
  >
    <p class="font-medium text-ink">{{ title }}</p>
    <p v-if="description" class="max-w-md text-sm text-ink-secondary">
      {{ description }}
    </p>
    <div v-if="$slots.default" class="mt-3">
      <slot />
    </div>
  </div>
</template>
