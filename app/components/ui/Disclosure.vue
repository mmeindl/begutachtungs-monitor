<script setup lang="ts">
/**
 * The quiet toggle under running text: chevron first, its label, and what
 * it opens under it — „Weiterlesen", „Alle N Gesetze anzeigen", the
 * Begründung at a change, the unchanged context lines (04.10.2026; the same
 * <summary> was written out six times and had drifted in size, colour and
 * padding).
 *
 * A native <details>: usable without hydration, reachable by keyboard, and
 * the browser's find-in-page opens it instead of running past it.
 *
 * The hover grammar's disclosure line (main.css): ground over its own hit
 * area, rounded, bled out with -mx, and only as wide as its label (`w-fit`)
 * — what opens in place answers with ground, what goes somewhere
 * underlines. `py-1` only shows where a long label wraps; one line keeps
 * the target height.
 *
 * Not for a sub-section with a heading (`FoldSection`), and not for a row of
 * a sheet, which spans the sheet (`LawDiffSection`'s context rows).
 *
 * `tone`: the label's ink. `muted` is the context line's — a count of what
 * did not change, which must not outrank the changes around it; the others
 * are a label to act on and carry weight. The chevron is always muted: it
 * is the affordance, not the message.
 */
withDefaults(
  defineProps<{
    size?: 'xs' | 'sm'
    tone?: 'ink' | 'secondary' | 'muted'
  }>(),
  { size: 'sm', tone: 'ink' },
)

const TONE = {
  ink: 'font-medium text-ink',
  secondary: 'font-medium text-ink-secondary',
  muted: 'text-ink-muted',
} as const
</script>

<template>
  <details class="group">
    <summary
      class="-mx-2 flex w-fit min-h-target cursor-pointer list-none items-center gap-2 rounded px-2 py-1 hover:bg-hover [&::-webkit-details-marker]:hidden"
      :class="[size === 'xs' ? 'text-xs' : 'text-sm', TONE[tone]]"
    >
      <UIcon
        name="i-lucide-chevron-down"
        class="size-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180"
        aria-hidden="true"
      />
      <slot name="summary" />
    </summary>
    <slot />
  </details>
</template>
