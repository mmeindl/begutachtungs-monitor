<script setup lang="ts">
/**
 * A sub-section of a draft page's station section: its h3 and what stands
 * under it (02.10.2026).
 *
 * One owner for the heading's face and its distance to the content. Until
 * now four h3 lived in the page and two inside the components they headed
 * (`LawDiffSection`, `RvStatements`), and each child set its own top margin
 * (`mt-1`, `mt-4`, `mt-8`). The gaps came out equal only because the margins
 * happened to collapse into one another. The next child would have had to
 * know that.
 *
 * The distance BETWEEN sub-sections is not this component's either: the
 * section's body spaces its children (`space-y-8` in the page), so a
 * sub-section that is not rendered leaves no gap behind.
 *
 * Its content carries no outer margin. The `mt-4` here is the gap, and a
 * first child's own margin collapses into it rather than adding to it.
 */
defineProps<{
  heading: string
}>()
</script>

<template>
  <div class="scroll-mt-6">
    <h3 class="text-base font-semibold text-ink">
      <slot name="heading">{{ heading }}</slot>
    </h3>
    <div class="mt-4">
      <slot />
    </div>
  </div>
</template>
