<script setup lang="ts">
/**
 * Native <select> in token styling with the page-wide lucide chevron instead
 * of the browser's own. Native, not USelect: in Vite 8 (rolldown) + Nuxt UI
 * 4.10, reka-ui's SelectItem reaches the browser without a render function
 * and crashes hydration (Aug 2026). Options come through the slot; the
 * caller labels the control (aria-label or a <label for>).
 */
const model = defineModel<string>({ required: true })
/**
 * `block` gives the width away to the caller.
 *
 * A native <select> takes its intrinsic width from its WIDEST option, not
 * from the selected one, and German option labels are compounds: „Alle
 * Arten" rendered 267 px wide because „Verordnungsentwürfe und andere"
 * stands below it in the list, „Nach Frist" 202 px because of „Meiste
 * Stellungnahmen". On /entwuerfe the four selects together claimed 837 px of
 * a 896 px row that way, and the toolbar wrapped into four ragged rows whose
 * breaks were an accident of the viewport.
 *
 * With `block` the control fills its wrapper instead, so a grid track
 * decides the width and the row breaks where the layout says. Shrink-to-fit
 * stays the default: a lone select in a section (LawDiffSection) should
 * still be as wide as its content.
 */
defineProps<{ id?: string; ariaLabel?: string; block?: boolean }>()
</script>

<template>
  <!-- Shrink-to-fit, but never wider than the container: a native <select>
       takes its width from the widest option (a Ressort name runs 60-odd
       characters), and its automatic minimum size would otherwise defeat the
       caller's max-width and push the page into horizontal scroll on mobile.
       Callers that are flex items need min-w-0 for the same reason. -->
  <span class="relative min-w-0 max-w-full" :class="block ? 'flex w-full' : 'inline-flex'">
    <select
      :id="id"
      v-model="model"
      :aria-label="ariaLabel"
      class="min-h-11 w-full min-w-0 appearance-none truncate rounded-md border border-hairline bg-surface py-2 pl-3 pr-9 text-sm text-ink hover:border-baseline"
    >
      <slot />
    </select>
    <UIcon
      name="i-lucide-chevron-down"
      class="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
      aria-hidden="true"
    />
  </span>
</template>
