<script setup lang="ts">
/**
 * The credit line at the foot of a comparison section: other people's
 * documents, the licence — and last, that the marking is ours.
 *
 * Why at the foot: a source statement stands below the table, not above it —
 * it is looked up while or after reading, never before. Since 18.09.2026 it
 * is the only thing down here: a legend for „redaktionell" stood beside it
 * briefly and is gone again — a term that reads the same on every page
 * belongs on the page that explains it, not under every comparison.
 *
 * „Markierung" is rendered by the component itself and always last: other
 * people's things first, our own after — and the sentence is the same in both
 * sections because neither of them writes it. It answers the question a
 * red/green marked ministry text raises: who did the marking?
 */
</script>

<template>
  <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
    <slot />
    <span>Markierung: Begutachtungs-Monitor</span>
  </div>
</template>
