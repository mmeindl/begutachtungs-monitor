<script setup lang="ts">
/**
 * A law the draft enacts anew, in the box of the Textgegenüberstellung
 * (30.10.2026).
 *
 * No annex covers it — there is no earlier version — so until then its
 * place said exactly that, followed by one disclosure of Begründung „zu
 * §§ 1, 4 bis 14, 16 bis 37 …", and the §§ it explained stood only in the
 * PDF. Now the law is a group like the annex's: its text, § by §, and each
 * passage at its own §.
 *
 * **The §§ are no changes**, and so not counted as „neu" in the legend: 190
 * of them beside the annex's three would carry the toolbar. The group says
 * what it is with one pill instead (`DiffGroup.tag`).
 *
 * **Open text, closed group.** A law is read, not scanned for marks: each §
 * prints its Absätze, and the group cuts after the first 30 like any other
 * (`limitFor`). A disclosure per § would have cost 190 clicks for the ElWG.
 */
import type { EnactedParagraph, ParagraphExplanationView } from '#shared/types'
import type { LawEnd } from '~/utils/lesefassung'

defineProps<{
  law: string
  /** How many §§ the law has, unfiltered — what the pill says. */
  total: number
  /** The §§ to print, each with its passages, after search and cut. */
  paragraphs: { paragraph: EnactedParagraph; explanations: ParagraphExplanationView[] }[]
  /** What stays for the law's end: passages on no § of the text, §§ without an outcome. */
  end: LawEnd | null
  open: boolean
  more: number
}>()

defineEmits<{ toggle: []; more: [] }>()
</script>

<template>
  <DiffGroup
    :title="law"
    :badges="[]"
    :tag="`Neues Gesetz · ${total} ${total === 1 ? 'Paragraph' : 'Paragraphen'}`"
    :open="open"
    :more="more"
    :more-noun="['Paragraph', 'Paragraphen']"
    @toggle="$emit('toggle')"
    @more="$emit('more')"
  >
    <section v-for="({ paragraph: p, explanations }, pi) in paragraphs" :key="`${p.id}-${pi}`" class="border-b border-hairline px-4 py-3 last:border-b-0">
      <!-- Designation and title on one line, as at the annex's §. -->
      <p class="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        <span class="font-medium text-ink">{{ p.id }}</span>
        <span v-if="p.heading" class="min-w-0 text-ink-secondary">{{ p.heading }}</span>
      </p>
      <!-- Closed, under the § line, in ink: as at the annex's §. -->
      <Disclosure v-if="explanations.length" size="xs" tone="ink" class="mb-2">
        <template #summary>Begründung des Ressorts</template>
        <ExplanationPassages :passages="explanations" />
      </Disclosure>
      <!-- No gutter: the green rule says „this row is new" against an
           earlier version, and here there is none — the pill says it once. -->
      <p
        v-for="(line, li) in p.lines"
        :key="li"
        class="hyphens-auto text-sm leading-relaxed text-ink"
        :class="[li > 0 && 'mt-1', line.sub && 'pl-4']"
      >{{ line.text }}</p>
    </section>
    <section v-if="end && !more" class="border-b border-hairline px-4 py-3 last:border-b-0">
      <AnnexLawEnd :end="end" />
    </section>
  </DiffGroup>
</template>
