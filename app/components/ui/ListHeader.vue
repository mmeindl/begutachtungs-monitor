<script setup lang="ts">
/**
 * The head of a list section: its heading, and the one way out of it
 * (docs/architecture.md §12.24).
 *
 * The counterpart to `ListMore`, and the division of labour between them is
 * the rule this component exists to enforce: `ListMore` belongs where
 * someone is WORKING THROUGH a list and the rest of it is the same page's
 * business (`/entwuerfe`, the Stellungnahmen panel). A section on the
 * homepage is a window onto a corpus that lives elsewhere, so its way out
 * is a link to that corpus — never a button that grows the front page.
 *
 * ONE link per section, and it sits here. Until 18.09.2026 the open list
 * had two — „Alle Entwürfe →" beside the heading and „Alle 13 offenen
 * Entwürfe ansehen →" under the list — pointing at the same URL, while two
 * other sections had none. Two links to one place is not twice the way out;
 * it is a reader checking whether they differ.
 *
 * WHERE THE LINK POINTS is the other half of the rule: the filter that
 * produces this same list, uncut. Not a related page, not the parent list —
 * if no filter can express the section, the filter gets built (that is what
 * `?sort=stellungnahmen` on `/entwuerfe` is for) or the label stops
 * promising one.
 */
const props = defineProps<{
  /** Heading id, for the section's `aria-labelledby`. */
  id: string
  /** The filter that shows the same list, uncut. */
  to: string
  /** What the link is „Alle …" OF — declined for „alle": „offenen Entwürfe". */
  noun: string
  /** Size of the full set behind the link. Omitted → unknown, or not the same set. */
  total?: number
  /** How many rows the section is showing of it. */
  visible?: number
}>()

/**
 * The number appears exactly when it is news: when rows are hidden.
 *
 * „Alle 7 offenen Entwürfe →" above five cards says what the cap costs —
 * the one thing the section cannot show. „Alle 5 offenen Entwürfe →" above
 * five cards counts what the eye has already counted (§12.20), so the link
 * falls back to naming its destination.
 *
 * Unknown total, or a destination broader than the section („Zuletzt Gesetz
 * geworden" → alle abgeschlossenen): no number either, because the only
 * honest number there is one about a different set.
 */
const hiddenBehind = computed(() =>
  props.total !== undefined && props.visible !== undefined && props.total > props.visible
    ? props.total
    : null,
)

const label = computed(
  () => `Alle ${hiddenBehind.value ? `${formatNumberDe(hiddenBehind.value)} ` : ''}${props.noun} →`,
)
</script>

<template>
  <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
    <h2 :id="id" class="section-heading">
      <slot />
    </h2>
    <!-- Standalone link: quiet at rest, underlined on hover (main.css). -->
    <NuxtLink
      :to="to"
      class="inline-flex min-h-11 items-center rounded text-sm font-medium text-accent-deep hover:underline"
    >{{ label }}</NuxtLink>
  </div>
</template>
