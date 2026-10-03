<script setup lang="ts">
import { BADGE_CLASS, BADGE_ORDER, type DiffBadge } from '~/utils/diffBadges'

/**
 * The tool row of a comparison: which kinds of change are shown, and a
 * search over them. Both narrow the list below and change nothing above it
 * (the positional rule, Manu 17.09.2026).
 *
 * THE KINDS ARE A LEGEND THAT HIDES, since 02.10.2026. A select „nur neu"
 * stood here once and was removed on 17.09.2026: it offered ISOLATION where
 * the reader's task is SUPPRESSION — hide the redaktionell changes to see
 * the substance — and being single-select it could not suppress at all.
 * These chips start all on, each is one press to hide its kind and one to
 * bring it back, and together they state the comparison's overall counts,
 * the one total the per-law pills do not print. Like a chart legend whose
 * entries switch their series off — the idiom readers know for exactly this.
 *
 * `aria-pressed` = shown, under a group named for that („Angezeigte
 * Änderungen"). A hidden kind is told apart by more than colour (1.4.1):
 * no fill, a dashed outline, its label struck through and an empty box.
 *
 * NO VIEW SWITCH any more („Fließtext / Nebeneinander", 17.09.–02.10.2026).
 * The case it existed for — a paragraph rewritten so thoroughly that the
 * inline diff strikes out one text and prints another — is decided per unit
 * now (`diffView.ts`), which is where the difference lies: one section holds
 * both kinds of change, and a global switch made the reader pick the view
 * that is wrong for half of them.
 */
const query = defineModel<string>('query', { required: true })
const hidden = defineModel<DiffBadge[]>('hidden', { required: true })

const props = defineProps<{
  /** Over the whole comparison (after the search), in the section's unit. */
  counts: Record<DiffBadge, number>
  labels: Record<DiffBadge, string>
  /** aria-label of the search field */
  searchLabel: string
}>()

/* Only the kinds this comparison has; a kind the search emptied stays while
 * it is hidden, or there would be no way to switch it back on. */
const kinds = computed(() => BADGE_ORDER.filter((b) => props.counts[b] > 0 || hidden.value.includes(b)))

function toggle(b: DiffBadge) {
  hidden.value = hidden.value.includes(b) ? hidden.value.filter((x) => x !== b) : [...hidden.value, b]
}

/**
 * The box types immediately, the section below follows 250 ms later.
 *
 * Without it every keystroke refiltered up to 413 units over six fields each
 * and rebuilt the blocks of every group, open or closed — the one control on
 * this page that can make a long draft feel slow. `/entwuerfe` debounces its
 * own field at 300 ms, but that one starts a request; nothing leaves the
 * browser here, so the wait is shorter.
 *
 * The input is bound to its own ref rather than to the model, because a
 * delayed field is the one thing a reader notices immediately.
 */
const typed = ref(query.value)
let timer: ReturnType<typeof setTimeout> | undefined
watch(typed, (value) => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    query.value = value
  }, 250)
})
// A query set from outside wins over what is in the box; setting it from the
// timer above lands here too and changes nothing.
watch(query, (value) => {
  if (value !== typed.value) typed.value = value
})
onUnmounted(() => clearTimeout(timer))
</script>

<template>
  <!-- No margin: it stands in a `ListBox` head, which spaces it. Kinds
       first, the search last, directly above the rows it searches. -->
  <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
    <div
      v-if="kinds.length > 1"
      role="group"
      aria-label="Angezeigte Änderungen"
      class="flex flex-wrap items-center gap-1.5"
    >
      <button
        v-for="b in kinds"
        :key="b"
        type="button"
        :aria-pressed="!hidden.includes(b)"
        class="inline-flex items-center gap-1 rounded-full border px-2.5 text-xs font-medium tabular-nums"
        :class="hidden.includes(b)
          ? 'border-dashed border-baseline bg-surface text-ink-muted line-through'
          : ['border-transparent', BADGE_CLASS[b]]"
        @click="toggle(b)"
      >
        <!-- A box, ticked when the kind is shown — the pills on the law
             headers below look the same and are no controls, and this says
             „switch". Both icons are one width, so switching a kind off
             does not shift the chips after it. The same icons as
             „Stellungnahme möglich" on `/entwuerfe`. -->
        <UIcon :name="hidden.includes(b) ? 'i-lucide-square' : 'i-lucide-square-check'" class="size-3.5 shrink-0" aria-hidden="true" />
        {{ formatNumberDe(counts[b]) }} {{ labels[b] }}
      </button>
      <UButton
        v-if="hidden.length"
        size="sm"
        color="neutral"
        variant="ghost"
        class="rounded-full"
        @click="hidden = []"
      >
        Alle zeigen
      </UButton>
    </div>
    <UInput
      v-model="typed"
      type="search"
      icon="i-lucide-search"
      placeholder="Im Text suchen …"
      :aria-label="searchLabel"
      class="ml-auto min-w-0 flex-1 basis-56 sm:max-w-72"
      :ui="{ base: 'min-h-target' }"
    />
  </div>
</template>
