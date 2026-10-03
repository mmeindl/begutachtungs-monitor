<script setup lang="ts">
/**
 * What a list box says where it has no rows to show — nothing matched, the
 * list could not be loaded — as a row of the sheet (`ListBox`).
 *
 * In the facts' grammar, a name and the fact under it, not an `EmptyState`
 * card: a bordered card with 48 px of air inside a bordered card was a box
 * in a box, and heavier than the rows it stood in for (02.10.2026). The
 * centred card stays for a page's own list.
 *
 * `title` is optional for the one notice that is a sentence rather than a
 * name (`/entwuerfe` while the full text is still answering). The default
 * slot stands under the text, `action` at the row's end — a retry beside
 * the failure it retries.
 */
defineProps<{
  title?: string
  description?: string
  /** `alert` for a failure, `status` for an answer that arrives late. */
  role?: 'status' | 'alert'
}>()
</script>

<template>
  <div :role="role" class="flex flex-wrap items-center justify-between gap-3 px-4 py-4 text-sm">
    <div>
      <p v-if="title" class="font-medium text-ink">{{ title }}</p>
      <p v-if="description" class="mt-0.5 text-ink-secondary">{{ description }}</p>
      <slot />
    </div>
    <slot name="action" />
  </div>
</template>
