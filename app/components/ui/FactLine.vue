<script setup lang="ts">
/**
 * A line of facts joined by „ · ", which breaks between the facts rather
 * than inside one.
 *
 * As a joined string the browser broke wherever the line ran out, and on a
 * phone that was usually mid-fact: „noch vor Fristende · 9 / Stellungnahmen"
 * on the spine, „· 1 nicht geprüft · / Zeilenzuordnung …" over the
 * comparison (measured at 390 px, 30.09.2026). Each fact is an
 * `inline-block` now: one that does not fit the rest of the line moves to
 * the next one whole, and one longer than a whole line still wraps inside
 * itself — `nowrap` would have scrolled the page sideways there, and some of
 * these facts are sentences.
 *
 * The dot stays at the end of the line it closes (no-break space before it),
 * so no line starts with one. A slot, if given, stands after the last fact
 * as one more — a link, typically.
 */
defineProps<{
  parts: readonly string[]
}>()

const slots = defineSlots<{ default?: () => unknown }>()
</script>

<template>
  <template v-for="(part, i) in parts" :key="i">
    <span class="inline-block">{{ part }}<template v-if="i < parts.length - 1 || slots.default">&nbsp;·</template></span>{{ ' ' }}
  </template>
  <slot />
</template>
