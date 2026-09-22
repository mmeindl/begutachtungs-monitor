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
      v-model="query"
      type="search"
      icon="i-lucide-search"
      placeholder="Im Text suchen …"
      :aria-label="searchLabel"
      class="ml-auto min-w-56 flex-1 sm:flex-none"
      :ui="{ base: 'min-h-11' }"
    />
  </div>
</template>
