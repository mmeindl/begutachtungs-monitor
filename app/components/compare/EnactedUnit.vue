<script setup lang="ts">
/**
 * One unit of a new law as the draft prints it (23.11.2026): the headings of
 * the law's structure that open here, the § or Anlage with its name, and its
 * text. The default slot stands under the § line, where the annex's § has its
 * Begründung.
 *
 * No gutter: the green rule says „this row is new" against an earlier
 * version, and here there is none. The group's pill says it once.
 */
import type { EnactedParagraph } from '#shared/types'
import { enactedLayoutNotes } from '~/utils/layoutNotes'

defineProps<{ unit: EnactedParagraph }>()
</script>

<template>
  <section class="border-b border-hairline px-4 py-3 last:border-b-0">
    <!-- One size above the § line, which is semibold too: law, Abschnitt, §. -->
    <p v-for="h in unit.before" :key="h" class="mb-1 text-base font-semibold text-ink first:mt-2">{{ h }}</p>
    <!-- Designation and title on one line, dark and semibold: a law of 83 §§
         is scanned by these lines. -->
    <LawUnitLine class="mb-1 text-sm" :name="unit.heading">{{ unit.id }}</LawUnitLine>
    <slot />
    <!-- Above the text: where a table could not be read as one, its values
         read wrongly until one knows the columns are gone. -->
    <GapNote v-for="note in enactedLayoutNotes(unit.lines)" :key="note" class="mb-2 text-xs text-ink-muted" :text="note" />
    <template v-for="(line, li) in unit.lines" :key="li">
      <EnactedTable v-if="line.grid" :table="line.grid" class="my-3" />
      <p
        v-else
        class="hyphens-auto text-sm leading-relaxed text-ink"
        :class="[li > 0 && 'mt-1', line.sub && 'pl-4', line.heading && 'font-medium']"
      ><EnactedText :line="line" /></p>
    </template>
  </section>
</template>
