<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string
    description?: string
  }>(),
  {
    title: 'Daten konnten nicht geladen werden',
    description: undefined,
  },
)

defineEmits<{
  retry: []
}>()
</script>

<template>
  <EmptyState role="alert" :title="title" :description="description">
    <UButton color="primary" @click="$emit('retry')">Erneut versuchen</UButton>
  </EmptyState>
</template>
