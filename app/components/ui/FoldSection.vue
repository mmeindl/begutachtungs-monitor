<script setup lang="ts">
/**
 * A folded sub-section: the house <details> with the heading IN the
 * <summary> and the chevron on the right (04.10.2026; written out four
 * times — the draft page's two „Dokumente", the RIS page's, and the folded
 * parts of the Kurzinformation).
 *
 * The heading in the summary since 18.09.2026: the page's outline must not
 * depend on what the reader happens to have open, and a screen-reader jump
 * through the headings has to find the section closed too. Heading content
 * is allowed in <summary>. Native, so find-in-page opens it and nothing
 * above it moves when it opens.
 *
 * No border-t since 03.10.2026: the full-width hairline was the strongest
 * line inside a section and outranked the section boundary; the summary's
 * hover ground and the chevron carry the fold alone.
 *
 * `size`: `lg` is a station's sub-section (the h3 of `PageSubsection`),
 * `base` a part of the Kurzinformation, under its own sub-heading.
 */
withDefaults(
  defineProps<{
    heading: string
    /** For an anchor that points at the heading (`/entwuerfe/[id]#dokumente`). */
    headingId?: string
    size?: 'lg' | 'base'
  }>(),
  { headingId: undefined, size: 'lg' },
)
</script>

<template>
  <details class="group">
    <summary
      class="-mx-3 flex min-h-target cursor-pointer list-none items-center justify-between gap-3 rounded px-3 py-3 hover:bg-hover [&::-webkit-details-marker]:hidden"
    >
      <h3 :id="headingId" class="font-semibold text-ink" :class="size === 'lg' ? 'text-lg' : 'text-base'">
        {{ heading }}
      </h3>
      <UIcon
        name="i-lucide-chevron-down"
        class="size-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180"
        aria-hidden="true"
      />
    </summary>
    <slot />
  </details>
</template>
