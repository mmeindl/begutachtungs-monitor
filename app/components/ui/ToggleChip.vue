<script setup lang="ts">
/**
 * A chip that is on or off — „Stellungnahme möglich" on `/entwuerfe`, and
 * since 22.10.2026 each Land (`LandChips`). One component, so the two read
 * as the same kind of control.
 *
 * Ticked, it is ink and not blue (03.10.2026): selection is ink (main.css),
 * so „on" is the subtle variant's ink-tinted ground with an ink ring in
 * place of its grey one. The ring is the selection and the tick says what is
 * selected — the ground alone is also what an unticked chip shows under the
 * pointer.
 *
 * UNAVAILABLE is drawn as unavailable, not as a faded „on": no tint, the
 * page's grey, muted text and a dashed outline, the tick kept. Fading the
 * tinted chip read as „on, a bit lighter" (03.10.2026). The dashes are an
 * outline, not a border: like the variants' ring it takes no space, so the
 * chip keeps its width either way. `aria-disabled` keeps it focusable with
 * its reason.
 */
const props = defineProps<{
  pressed: boolean
  /** Why it cannot be used here; null or absent where it can. */
  unavailable?: string | null
}>()

const emit = defineEmits<{ toggle: [] }>()

function press(): void {
  if (!props.unavailable) emit('toggle')
}
</script>

<template>
  <UButton
    color="neutral"
    :variant="pressed && !unavailable ? 'subtle' : 'outline'"
    :aria-pressed="pressed"
    :aria-disabled="unavailable ? true : undefined"
    :title="unavailable ?? undefined"
    class="shrink-0"
    :class="unavailable ? 'cursor-not-allowed outline-1 outline-dashed -outline-offset-1 outline-baseline bg-page text-ink-muted ring-0 hover:bg-page' : pressed && 'ring-ink'"
    @click="press"
  >
    <!-- A box, ticked when on: says „toggle" in both states, and both
         icons are one width, so pressing moves nothing. -->
    <UIcon :name="pressed ? 'i-lucide-square-check' : 'i-lucide-square'" class="size-4 shrink-0" aria-hidden="true" />
    <slot />
    <span v-if="unavailable" class="sr-only">({{ unavailable }})</span>
  </UButton>
</template>
