<script setup lang="ts">
withDefaults(
  defineProps<{
    label?: string
  }>(),
  {
    label: 'Wird geladen …',
  },
)
</script>

<template>
  <div
    role="status"
    class="flex items-center justify-center gap-2.5 px-6 py-12 text-center"
  >
    <span
      class="size-4 shrink-0 animate-spin rounded-full border-2 border-hairline border-t-accent"
      aria-hidden="true"
    />
    <span class="text-sm text-ink-secondary">{{ label }}</span>
  </div>
</template>
