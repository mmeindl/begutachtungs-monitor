<script lang="ts">
import type { InjectionKey, Ref } from 'vue'

/** The select's value, for `TokenOption` to mark itself `selected`. */
export const TOKEN_SELECT_MODEL: InjectionKey<Ref<string>> = Symbol('TokenSelectModel')
</script>

<script setup lang="ts">
/**
 * Native <select> in token styling with the page-wide lucide chevron instead
 * of the browser's own. Native, not USelect: in Vite 8 (rolldown) + Nuxt UI
 * 4.10, reka-ui's SelectItem reaches the browser without a render function
 * and crashes hydration (Aug 2026). Options come through the slot; the
 * caller labels the control with a <label for> on `id` — an `aria-label`
 * attribute would fall through to the wrapper, not the <select>.
 *
 * Options in the slot are `TokenOption`, not a bare <option> (15.11.2026).
 * Vue's SSR compiler writes `selected` only onto the <option>s that stand in
 * the same template as the `v-model` <select>; slot content is the caller's
 * template and never gets it. The server HTML then carried no selection,
 * and every select showed its first option until hydration — the current period for a link to `?gp=XXVII`. `TokenOption` reads the value
 * provided here and marks itself.
 */
const model = defineModel<string>({ required: true })
provide(TOKEN_SELECT_MODEL, model)
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
/* `disabled` reaches the <select> itself (22.10.2026): attributes fall
 * through to the wrapper, and a disabled wrapper disables nothing. */
const props = defineProps<{
  id?: string
  block?: boolean
  disabled?: boolean
  /**
   * Why the select cannot be used here, or null/absent when it can — the
   * `unavailable` of `ToggleChip` (10.11.2026): the select stays in place,
   * keeps its value, cannot be changed, and states the reason as its title
   * and, through `aria-describedby`, to assistive technology.
   */
  unavailable?: string | null
  /**
   * Folds the select to its chevron, a 44 px segment (18.11.2026), for a
   * caller whose own box shows the value in another form: the Zeitraum on
   * /entwuerfe, where „Eigener Zeitraum" stands as its two dates. It is a
   * prop and not a second select so the <select> stays the same element —
   * keyboard focus stays on it when the reader picks the value that folds
   * it, and pressing the chevron opens the whole list as before. The
   * caller's box carries border, background and hover; the segment brings
   * only the hairline to its left. The label is pushed out of the content
   * box by the padding, not hidden by colour: Firefox paints the open
   * list's options in the select's own text colour.
   */
  chevronOnly?: boolean
  /**
   * An icon before the value (25.11.2026), for a select whose label is
   * visually hidden: the phone's sort on /entwuerfe carries the column
   * headers' sort arrows instead of the word „Sortieren". Decoration for
   * the eye only; the <label for> still names the control.
   */
  icon?: string
}>()
const reasonId = computed(() => (props.id ? `${props.id}-reason` : undefined))
</script>

<template>
  <!-- Shrink-to-fit, but never wider than the container: a native <select>
       takes its width from the widest option (a Ressort name runs 60-odd
       characters), and its automatic minimum size would otherwise defeat the
       caller's max-width and push the page into horizontal scroll on mobile.
       Callers that are flex items need min-w-0 for the same reason. -->
  <span
    class="relative min-w-0 max-w-full"
    :class="chevronOnly ? 'flex w-11 shrink-0' : block ? 'flex w-full' : 'inline-flex'"
  >
    <select
      :id="id"
      v-model="model"
      :disabled="disabled || !!unavailable"
      :title="unavailable ?? undefined"
      :aria-describedby="unavailable ? reasonId : undefined"
      class="w-full min-w-0 appearance-none truncate text-sm text-ink"
      :class="chevronOnly
        ? 'rounded-r-md border-l border-baseline bg-transparent pl-11 pr-0'
        : [icon ? 'pl-9' : 'pl-3', 'min-h-target rounded-md border border-baseline bg-surface py-2 pr-9 hover:border-hover-edge hover:bg-hover disabled:cursor-not-allowed disabled:border-dashed disabled:bg-page disabled:text-ink-muted disabled:hover:bg-page']"
    >
      <slot />
    </select>
    <UIcon
      v-if="icon && !chevronOnly"
      :name="icon"
      class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
      aria-hidden="true"
    />
    <span v-if="unavailable" :id="reasonId" class="sr-only">{{ unavailable }}</span>
    <UIcon
      name="i-lucide-chevron-down"
      class="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-ink-muted"
      :class="chevronOnly ? 'right-3.5' : 'right-3'"
      aria-hidden="true"
    />
  </span>
</template>
