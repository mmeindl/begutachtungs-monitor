<script setup lang="ts">
/**
 * The line that opens a § of a law, in every section that prints one
 * (23.11.2026): the new law's text, the Textgegenüberstellung, the § comparison
 * and the Land's. The default slot is the designation, with whatever it
 * carries (a renumbering's arrow); `name` is the § heading.
 *
 * Dark and semibold, number and name alike. The name stood in the secondary
 * ink at regular weight and the number in medium, at the size of the text
 * below: legible, but a law of 83 §§ gave the eye nothing to scan by.
 *
 * Size and spacing come from the caller, whose row also holds „Zitieren".
 */
defineProps<{ name?: string | null }>()
</script>

<template>
  <p class="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 font-semibold text-ink">
    <span v-if="$slots.default"><slot /></span>
    <span v-if="name" class="min-w-0">{{ name }}</span>
  </p>
</template>
