<script setup lang="ts">
/**
 * A chapter of a prose page — /ueber, /impressum, /datenschutz,
 * /so-funktionierts: its h2 and the running text under it (03.10.2026).
 *
 * Owns what the four pages wrote out about thirty times:
 *   - the anchor pairing. The section carries `id`, its heading
 *     `${id}-heading`, and the one labels the other — the convention of the
 *     draft pages' station sections. The anchors themselves did not move:
 *     where an id stood on the h2 (`/impressum#imp-license`,
 *     `/ueber#about-privacy`) it now stands on the section, whose top is the
 *     heading's top. /so-funktionierts had ids but no label; it has both now.
 *   - the section rhythm. `page-section` per section, as on every other
 *     page; the wrapper with `space-y-14 sm:space-y-20` that three of the
 *     pages used instead computed the same gaps by a second mechanism.
 *   - the text's spacing and colour (`prose-flow`, main.css). A paragraph
 *     in the slot needs no class unless it differs.
 *
 * `first`: the first chapter right under the page's head sits 40 px below
 * it, not the 56/80 px between chapters — that gap is the one the wrapper
 * gave it. A chapter that follows something else (the table of contents on
 * /so-funktionierts) keeps the full section gap.
 */
defineProps<{
  id: string
  heading: string
  first?: boolean
}>()
</script>

<template>
  <section
    :id="id"
    :aria-labelledby="`${id}-heading`"
    class="prose-flow scroll-mt-6"
    :class="first ? 'mt-10' : 'page-section'"
  >
    <h2 :id="`${id}-heading`" class="section-heading">{{ heading }}</h2>
    <slot />
  </section>
</template>
