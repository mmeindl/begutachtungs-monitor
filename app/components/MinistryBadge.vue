<script setup lang="ts">
defineProps<{
  code: string
  name: string
}>()
</script>

<template>
  <span
    :title="name"
    class="inline-flex items-center rounded-md border border-hairline bg-page px-1.5 py-0.5 text-xs font-medium text-ink-secondary"
  >
    <!-- Sighted users see the short code; screen readers get the full name. -->
    <span aria-hidden="true">{{ code }}</span>
    <span class="sr-only">{{ name }}</span>
  </span>
</template>
