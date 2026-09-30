<script setup lang="ts">
/**
 * The top of a detail page: one meta row carrying identity, then the title.
 * The countdown is not in the meta row since 30.09.2026 — it stands once, in
 * the Stellungnahme card, whose ground carries the tone, where the date and
 * the action are. Both detail pages have this anatomy. The Ressort is not in
 * the meta row since 30.09.2026 — it is written out and linked in each page's
 * byline (`MinistryLinks`), where the code chip used to repeat it.
 *
 * `#source` is the provenance link, in the same row: it opens this very
 * record upstream, so it stands with the identity rather than in the byline,
 * which since 30.09.2026 carries only who sent the draft.
 *
 * `#identity` is where they differ and why it is a slot: a Ministerialentwurf
 * leads with its Geschäftszahl („Ministerialentwurf 132/ME"), a RIS record
 * has none and leads with the type word, which is what identifies it to a
 * reader.
 *
 * Everything BELOW the h1 stays with the page, in the default slot. The two
 * carry different subtitles — one the Sammeltitel, the other the long Titel,
 * set differently — and a different provenance line, pointing at a different
 * document in a different link style. A shell for that would be four more
 * exclusive slots, which is the shape this page anatomy was explicitly not
 * to grow (refactor-plan.md §4.3).
 */
defineProps<{
  title: string
}>()
</script>

<template>
  <header>
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <div class="flex flex-wrap items-center gap-2">
        <slot name="identity" />
      </div>
      <!-- The record at its source, beside the identifier it resolves —
           „135/ME" is Parliament's own number. Two groups under
           `justify-between`, not `ml-auto` behind a breakpoint: while the
           row fits, the link sits at its right end; once it wraps, it is
           alone on its line and `space-between` starts a lone item at the
           left. A breakpoint cannot know when the row wraps — between `sm`
           and the width the row needs, it stranded the link at the right
           edge. -->
      <span v-if="$slots.source" class="text-sm">
        <slot name="source" />
      </span>
    </div>
    <!-- German compounds: "Elektrizitätswirtschaftsgesetz" at text-2xl is
         wider than a 320px viewport's content box, so the title hyphenates
         (lang="de-AT" is set) and breaks as a last resort rather than
         scrolling the page sideways. -->
    <h1
      class="mt-3 text-2xl font-semibold text-ink hyphens-auto break-words sm:text-3xl"
    >
      {{ title }}
    </h1>
    <slot />
  </header>
</template>
