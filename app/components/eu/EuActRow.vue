<script setup lang="ts">
/**
 * One act in the EU overview's lists (`/eu-recht`): the main list and the
 * fold of acts drafts only restate share it, so the two read alike.
 *
 * The list row's anatomy (`EntryItem`): the whole row is the link, the
 * label ink and underlined under the pointer, the ground tinted — never a
 * blue inline link inside a list. The act's subject from its official
 * title stands whole, no clamp (§12.28: the short name sits at its end).
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
    <NuxtLink :to="row.path" class="group block px-4 py-3 hover:bg-hover">
      <component :is="level" class="font-medium text-ink group-hover:underline group-hover:decoration-2">{{ row.label }}</component>
      <p v-if="row.subject" class="mt-0.5 text-sm text-ink-secondary">
        {{ row.subject }}
      </p>
      <p class="mt-0.5 text-sm text-ink-muted">
        <template v-if="row.deadline">{{ row.deadline }} · </template>{{ row.counts }}<template v-if="row.lands.length"> ({{ row.lands.join(', ') }})</template>
      </p>
    </NuxtLink>
  </li>
</template>
