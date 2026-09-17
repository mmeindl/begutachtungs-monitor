<script setup lang="ts">
/**
 * „Neu" on a Begutachtung that began inside the last week
 * (`isNewArrival`, `shared/utils/deadlines.ts`).
 *
 * WHY A MARKER AND NOT A LIST (§12.21): the question "was ist seit meinem
 * letzten Besuch dazugekommen" is a real one, but its rows are the same
 * rows the open list already holds — a second list would show them twice.
 * The marker travels with the row instead, so it works in every list that
 * renders one.
 *
 * Wordless colour would break the design rule and the date alone is not
 * scannable; the chip carries the word, and in the card it merges into the
 * phrase that follows it ("Neu in Begutachtung seit 17.09.2026"), so screen
 * readers get a sentence rather than a loose label.
 */
</script>

<template>
  <span
    class="inline-flex items-center rounded-md bg-mark-wash px-1.5 py-0.5 text-xs font-medium text-accent-deep"
  >Neu</span>
</template>
