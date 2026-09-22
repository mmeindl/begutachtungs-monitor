<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string
  }>(),
  {
    title: 'Daten konnten nicht geladen werden',
  },
)

defineEmits<{
  retry: []
}>()
</script>

<template>
  <EmptyState role="alert" :title="title">
    <UButton color="primary" @click="$emit('retry')">Erneut versuchen</UButton>
  </EmptyState>
</template>
