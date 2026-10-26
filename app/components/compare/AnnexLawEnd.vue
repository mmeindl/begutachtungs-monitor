<script setup lang="ts">
/**
 * What one law of the draft leaves over at the end of the
 * Textgegenüberstellung (`placeAtParagraphs`, its `ends`; 26.10.2026): the §§ the draft
 * amends that no § block of the annex took, and the Begründung passages on
 * a § no block stands for.
 *
 * Until then both were simply absent. The annex prints what the ministry
 * printed, the Lesefassung and the Begründung hung only under a § the annex
 * has, and a § the draft amends without an annex row — or a whole new law,
 * which no Textgegenüberstellung covers — stood nowhere on the page. A §
 * the gate did confirm but the page could not place under its block is
 * shown here whole, rather than lost to a key the page reads differently
 * from the server.
 */
import type { ConsolidatedParagraph } from '#shared/types'
import { unitList, unplacedText, type LawEnd } from '~/utils/lesefassung'

const props = defineProps<{
  end: LawEnd
  /** The law has no group in the annex at all — said once, before the rest. */
  outsideAnnex?: boolean
}>()

const withheldIds = computed(() => props.end.outcomes.filter((o) => o.lesefassung.kind === 'withheld').map((o) => o.id))
const shown = computed(() =>
  props.end.outcomes.flatMap((o): { id: string; paragraph: ConsolidatedParagraph }[] => (o.lesefassung.kind === 'shown' ? [{ id: o.id, paragraph: o.lesefassung.paragraph }] : [])),
)
/** The §§ the passages explain, as law prints them, for the disclosure's summary. */
const explained = computed(() => unitList([...new Set(props.end.explanations.map((e) => e.para))]))
</script>

<template>
  <div class="space-y-3">
    <p v-if="outsideAnnex && !withheldIds.length" class="text-sm text-ink-secondary">
      Zu diesem Teil des Entwurfs fanden wir in der Beilage keine Gegenüberstellung.
    </p>
    <p v-if="withheldIds.length" class="text-sm text-ink-secondary">{{ unplacedText(withheldIds) }}</p>
    <div v-for="s in shown" :key="s.id">
      <p class="text-sm font-medium text-ink">{{ unitList([s.id]) }}</p>
      <LesefassungDisclosure :paragraph="s.paragraph" class="mt-1" />
    </div>
    <!-- The Ressort's reasoning for §§ without a block, in the shape it has
         at a § (`TextComparisonSection`): closed, in ink, the passages
         unaltered under their own headings. -->
    <Disclosure v-if="end.explanations.length" size="xs" tone="ink">
      <template #summary>Begründung des Ressorts zu {{ explained }}</template>
      <div class="mt-1 pl-6">
        <div v-for="(e, ei) in end.explanations" :key="ei" :class="ei > 0 ? 'mt-3' : ''">
          <p class="text-xs text-ink-muted">{{ e.heading }}</p>
          <p v-for="(t, ti) in e.text" :key="ti" class="mt-1 hyphens-auto text-sm leading-relaxed text-ink-secondary">{{ t }}</p>
        </div>
      </div>
    </Disclosure>
  </div>
</template>
