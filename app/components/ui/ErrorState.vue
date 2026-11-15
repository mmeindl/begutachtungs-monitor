<script setup lang="ts">
defineEmits<{
  retry: []
}>()
</script>

<template>
  <EmptyState role="alert" title="Gerade nicht abrufbar">
    <UButton color="primary" @click="$emit('retry')">Erneut versuchen</UButton>
  </EmptyState>
</template>
