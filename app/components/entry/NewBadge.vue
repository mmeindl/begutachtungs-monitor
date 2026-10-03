<script setup lang="ts">
/**
 * „Neu" on a row whose current station was reached inside the last week.
 * Until 03.10.2026 only a Begutachtung that began in it (`isNewArrival`,
 * `app/utils/deadlines.ts`); since then every station, because what
 * arrived as a Vorlage or became law this week is the same question —
 * a win as visible as a shelving (framing rule).
 *
 * The text comes in, it is not decided here (`EntryView.newLabel`), and it
 * always names the station reached — „Neu: Begutachtung", „Neu:
 * Regierungsvorlage", „Neu: Parlament", „Neu: Bundesgesetzblatt" — in the
 * words the list's tabs use (`DRAFT_STATION_LABEL`). No bare „Neu", not
 * even where the row is the event itself: the chip names the station and
 * the kind label the document, one rule without an exception.
 *
 * WHY A MARKER AND NOT A LIST (§12.21): the question "was ist seit meinem
 * letzten Besuch dazugekommen" is a real one, but its rows are the same
 * rows the open list already holds — a second list would show them twice.
 * The marker travels with the row instead, so it works in every list that
 * renders one.
 *
 * Wordless colour would break the design rule and the date alone is not
 * scannable; the chip carries the words, and with the station in them a
 * screen reader hears what is new, not a loose „Neu".
 *
 * The highlighter, because „Neu" says "look at this" — the marker's one
 * meaning (main.css). Ink on it, not the blue it once carried: blue means
 * "you can do something here", and the chip is not a target.
 */
defineProps<{
  /** The chip's text — `EntryView.newLabel`, never empty. */
  label: string
}>()
</script>

<template>
  <span
    class="inline-flex items-center rounded-md bg-mark-wash px-1.5 py-0.5 text-xs font-medium text-ink"
  >{{ label }}</span>
</template>
