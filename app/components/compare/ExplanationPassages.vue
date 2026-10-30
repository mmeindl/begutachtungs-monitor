<script setup lang="ts">
/**
 * The Ressort's passages under one „Begründung des Ressorts" disclosure:
 * each under its own heading, unaltered and uncut. Indented without a rule —
 * a rule on the left is the gutter that marks a change in these sections
 * (18.09.2026). Written out at three places until 30.10.2026: the annex's §,
 * the end of a law, and a new law's §.
 */
import type { ParagraphExplanationView } from '#shared/types'

defineProps<{ passages: readonly ParagraphExplanationView[] }>()
</script>

<template>
  <div class="mt-1 pl-6">
    <div v-for="(e, ei) in passages" :key="ei" :class="ei > 0 ? 'mt-3' : ''">
      <p class="text-xs text-ink-muted">{{ e.heading }}</p>
      <p v-for="(t, ti) in e.text" :key="ti" class="mt-1 hyphens-auto text-sm leading-relaxed text-ink-secondary">{{ t }}</p>
    </div>
  </div>
</template>
