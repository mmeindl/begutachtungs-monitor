<script setup lang="ts">
/**
 * One act in the EU overview's lists (`/eu-recht`): the map and the
 * section of acts drafts only restate share it, so the two read alike.
 *
 * The list row's anatomy (`EntryItem`): the whole row is the link, the
 * label ink and underlined under the pointer, the ground tinted — never a
 * blue inline link inside a list. The act's subject from its official
 * title stands whole, no clamp (the short name sits at its end).
 *
 * The deadline in the right-hand column, as `/entwuerfe` keeps its Stand
 * (06.11.2026): the same box (`EntryState`) in the same column
 * (`entry-col-state`), so the dates run down one edge and the eye can
 * compare them. Grey on every row (rule D6) — on a card below `md` it stands
 * under the counts.
 *
 * The drafts in a column of their own before it (16.11.2026,
 * `EuCountCell`), as the draft list keeps its Stellungnahmen and the
 * directives' list its drafts: the number, whose under it, the Länder by
 * name beside the title. Below `md` the card says the counts in words.
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
    <NuxtLink :to="row.path" class="group flex flex-col gap-3 px-4 py-3 hover:bg-hover md:flex-row md:items-center md:gap-4">
      <div class="min-w-0 flex-1">
        <component :is="level" class="font-medium text-ink group-hover:underline group-hover:decoration-2">{{ row.label }}</component>
        <p v-if="row.subject" class="mt-0.5 text-sm text-ink-secondary">
          {{ row.subject }}
        </p>
        <!-- The card says the counts in words; from `md` the column carries them, and the Länder stand here, said once in the cell's words. -->
        <p class="mt-0.5 text-sm text-ink-muted md:hidden">
          {{ row.drafts.said }}
        </p>
        <p v-if="row.landsLine" aria-hidden="true" class="mt-0.5 hidden text-sm text-ink-muted md:block">
          {{ row.landsLine }}
        </p>
      </div>
      <EuCountCell :cell="row.drafts" />
      <div class="flex md:entry-col-state md:justify-end">
        <EntryState :state="row.state" />
      </div>
    </NuxtLink>
  </li>
</template>
