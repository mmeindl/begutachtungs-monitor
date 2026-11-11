<script setup lang="ts">
/**
 * One act in the EU overview's lists (`/eu-recht`): the main list and the
 * fold of acts drafts only restate share it, so the two read alike.
 *
 * The list row's anatomy (`EntryItem`): the whole row is the link, the
 * label ink and underlined under the pointer, the ground tinted — never a
 * blue inline link inside a list. The act's subject from its official
 * title stands whole, no clamp (the short name sits at its end).
 *
 * The deadline in the right-hand column, as `/entwuerfe` keeps its Stand
 * (06.11.2026): the same box (`EntryState`) in the same column
 * (`entry-col-state`), so the dates run down one edge and the eye can
 * compare them. Grey on every row (rule D6) — on a card below `sm` it stands
 * under the counts.
 */
import type { EuActsRowView } from '~/utils/euKarte'

withDefaults(
  defineProps<{
    row: EuActsRowView
    /** `h4` inside the fold, whose own heading is the h3. */
    level?: 'h3' | 'h4'
  }>(),
  { level: 'h3' },
)
</script>

<template>
  <li>
    <NuxtLink :to="row.path" class="group flex flex-col gap-3 px-4 py-3 hover:bg-hover sm:flex-row sm:items-center sm:gap-4">
      <div class="min-w-0 flex-1">
        <component :is="level" class="font-medium text-ink group-hover:underline group-hover:decoration-2">{{ row.label }}</component>
        <p v-if="row.subject" class="mt-0.5 text-sm text-ink-secondary">
          {{ row.subject }}
        </p>
        <p class="mt-0.5 text-sm text-ink-muted">
          {{ row.counts }}<template v-if="row.lands.length"> ({{ row.lands.join(', ') }})</template>
        </p>
      </div>
      <div class="flex sm:entry-col-state sm:justify-end">
        <EntryState :state="row.state" />
      </div>
    </NuxtLink>
  </li>
</template>
