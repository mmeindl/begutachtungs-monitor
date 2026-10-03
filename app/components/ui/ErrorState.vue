<script setup lang="ts">
defineEmits<{
  retry: []
}>()
</script>

<template>
  <EmptyState role="alert" title="Daten konnten nicht geladen werden">
    <UButton color="primary" @click="$emit('retry')">Erneut versuchen</UButton>
  </EmptyState>
</template>
