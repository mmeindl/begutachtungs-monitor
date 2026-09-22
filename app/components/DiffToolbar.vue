<script setup lang="ts">
/**
 * How to read a comparison, and a search over it. Both scope the list below
 * them and nothing above (the positional rule, Manu 17.09.2026).
 *
 * Inline or side by side — GitHub's "unified / split", and the same reason.
 * Inline is right for most changes and stays the default: a few swapped words
 * read fastest in one sentence with the old struck out and the new beside it.
 * It is WRONG for a paragraph that was completely rewritten — there inline
 * first strikes out the whole old text and then prints the whole new one, and
 * the reader has to hold two versions in their head to see that they are
 * alternatives rather than a sequence. That is the case a domain user named
 * as the one thing a dedicated comparison tool does better than this page.
 *
 * The two sections label the controls differently because they compare
 * different things — „Darstellung des Vergleichs" against „Darstellung der
 * Gegenüberstellung" — so both labels are props. Everything else was
 * identical, in the same order, so the two sections are operated alike.
 */
const view = defineModel<'inline' | 'split'>('view', { required: true })
const query = defineModel<string>('query', { required: true })

defineProps<{
  /** aria-label of the view switch */
  viewLabel: string
  /** aria-label of the search field */
  searchLabel: string
}>()

const VIEW_OPTIONS: { value: 'inline' | 'split'; label: string }[] = [
  { value: 'inline', label: 'Fließtext' },
  { value: 'split', label: 'Nebeneinander' },
]

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
  <div class="mt-4 flex flex-wrap items-center gap-3">
    <!-- Inline / nebeneinander. A two-button group, not a select: it is a
         binary view switch the reader flips back and forth, and it has to be
         readable as the current state at a glance. -->
    <UFieldGroup role="group" :aria-label="viewLabel" class="shrink-0">
      <UButton
        v-for="v in VIEW_OPTIONS"
        :key="v.value"
        :color="view === v.value ? 'primary' : 'neutral'"
        :variant="view === v.value ? 'subtle' : 'outline'"
        :aria-pressed="view === v.value"
        size="sm"
        class="min-h-11"
        @click="view = v.value"
      >
        {{ v.label }}
      </UButton>
    </UFieldGroup>
    <UInput
      v-model="typed"
      type="search"
      icon="i-lucide-search"
      placeholder="Im Text suchen …"
      :aria-label="searchLabel"
      class="ml-auto min-w-56 flex-1 sm:flex-none"
      :ui="{ base: 'min-h-11' }"
    />
  </div>
</template>
