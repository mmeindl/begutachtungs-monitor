<script setup lang="ts">
/**
 * A printed line of a law: its words, a run raised, lowered or underlined
 * where the document sets it so (m³, PM₁₀, the bar of a fraction).
 */
import type { LawTextPart } from '#shared/types'

defineProps<{ line: { text: string; parts?: LawTextPart[] } }>()
</script>

<template>
  <template v-if="line.parts">
    <template v-for="(part, i) in line.parts" :key="i">
      <sup v-if="part.pos === 'sup'">{{ part.text }}</sup>
      <sub v-else-if="part.pos === 'sub'">{{ part.text }}</sub>
      <span v-else-if="part.pos === 'u'" class="underline decoration-1 underline-offset-2">{{ part.text }}</span>
      <template v-else>{{ part.text }}</template>
    </template>
  </template>
  <template v-else>{{ line.text }}</template>
</template>
