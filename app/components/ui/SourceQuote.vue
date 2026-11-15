<script setup lang="ts">
/**
 * A short quotation with its source, on a door card above the buttons: what
 * an Unterstützung or a Stellungnahme brings, in the words of the
 * institution that receives it (`app/utils/statementQuote.ts`, the
 * Unterstützung's in `anliegenView.ts`). A sentence that qualifies an action
 * is read before acting, so it stands above the buttons.
 *
 * The source follows the quote on its last line, after a dash, the way a
 * quotation is signed in running text (15.11.2026). On a line of its own —
 * left, then right-aligned — it read as one more line of text, and a
 * right-aligned source under a wrapping quote stood alone anyway. Quote and
 * source stay a <blockquote> and a <figcaption>, only set inline; the source
 * never breaks from its dash.
 */
defineProps<{
  text: string
  source: string
}>()
</script>

<template>
  <figure class="mt-3 text-sm text-ink-secondary">
    <blockquote class="inline">„{{ text }}“</blockquote>{{ ' ' }}<figcaption class="inline whitespace-nowrap text-xs text-ink-muted">– {{ source }}</figcaption>
  </figure>
</template>
