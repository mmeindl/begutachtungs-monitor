<script setup lang="ts">
/**
 * External link with the a11y contract fixed in ONE place: target="_blank" +
 * rel="noopener" and the decorative ↗ arrow (aria-hidden). The label comes
 * through the slot; styling and aria-label via attribute fallthrough from
 * the caller.
 */
defineProps<{
  href: string
}>()
</script>

<template>
  <a :href="href" target="_blank" rel="noopener">
    <slot /><span aria-hidden="true"> ↗</span>
  </a>
</template>
