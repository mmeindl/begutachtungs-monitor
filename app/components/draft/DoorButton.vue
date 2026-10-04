<script setup lang="ts">
/**
 * The door's button: the one that leaves for a form or a document in a new
 * window — Parliament's Stellungnahme form, a Begleitschreiben — with the ↗
 * and the screen reader's warning that a window opens. `FilingButton` until
 * 04.10.2026; the RIS page's door opens a document, not a filing.
 *
 * The second door, at the end of a station's section (03.10.2026).
 *
 * The action card at the top of the page stays the one place for the
 * countdown, the calendar and the context; it sits above the content so the
 * action does not sink below a long Gegenüberstellung. But the decision to
 * file is made after reading — at the Stellungnahmen list, where one sees who
 * has filed already — and that is screens below the card. So the same action,
 * with the card's own label, stands once more where the reading ends.
 *
 * Solid, as the card's (03.10.2026; outline for its first hours). Weight
 * is judged per screen, not per page: the card is screens above, and here
 * this is the one action in view — an outline would call it optional.
 * Outline stays what it is in the card: a second button in the same row.
 * Two solid buttons on one short page are the same action with the same
 * label, so they do not pull in different directions.
 *
 * No countdown, no tone — two deadline cards would read as two deadlines.
 * Render it only while that window is open, with the card's condition
 * copied, not paraphrased.
 *
 * The card's own buttons are this one too, so the door and its repetition
 * cannot drift apart. `variant` is for the card's row only: there the
 * Vorlage's button steps back to an outline beside the Begutachtung's.
 */
withDefaults(defineProps<{
  href: string
  variant?: 'solid' | 'outline'
}>(), { variant: 'solid' })
</script>

<template>
  <UButton
    :to="href"
    target="_blank"
    rel="noopener"
    color="primary"
    :variant="variant"
    class="min-h-target"
  >
    <slot /><span aria-hidden="true">&nbsp;↗</span><span class="sr-only"> (neues Fenster)</span>
  </UButton>
</template>
