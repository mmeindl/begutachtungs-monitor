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
import { laterAmendmentLine, undividedText, unitList, unplacedText, type LawEnd } from '~/utils/lesefassung'

const props = defineProps<{
  end: LawEnd
  /** The law has no group in the annex at all — said once, before the rest. */
  outsideAnnex?: boolean
  /**
   * The draft enacts the law rather than amending it (`enactedLaws`): no
   * earlier version exists to set it against, so its absence from the annex
   * is no gap — and the page does not word it as one (30.10.2026).
   */
  enacted?: boolean
  /**
   * The annex's §§ could not be told apart by law (`boundaryNote`, said above
   * the rows): the law may well be in it, so „no part for it" would be false
   * — and that is why its Begründung stands here rather than at a §
   * (80/ME, 90/ME, 142/ME XXVIII).
   */
  undivided?: boolean
}>()

const withheldIds = computed(() => props.end.outcomes.filter((o) => o.lesefassung.kind === 'withheld').map((o) => o.id))
const shown = computed(() =>
  props.end.outcomes.flatMap((o): { id: string; paragraph: ConsolidatedParagraph }[] => (o.lesefassung.kind === 'shown' ? [{ id: o.id, paragraph: o.lesefassung.paragraph }] : [])),
)
/** A withheld § here for whose day RIS files a later BGBl's version, named, as at a block (`laterAmendmentLine`). */
const laterLines = computed(() => props.end.outcomes.flatMap((o) => laterAmendmentLine(o.lesefassung, unitList([o.id], props.end.unit), props.end.unit) ?? []))
/**
 * The §§ the passages explain, as law prints them, for the disclosure's
 * summary. Always §§: the Erläuterungen's passages are keyed by Paragraph
 * alone (`explanationParaId`), in a law of Artikel too.
 */
const explained = computed(() => unitList([...new Set(props.end.explanations.map((e) => e.para))]))
</script>

<template>
  <div class="space-y-3">
    <template v-if="outsideAnnex && !withheldIds.length">
      <p v-if="enacted" class="text-sm text-ink-secondary">
        Dieses Gesetz erlässt der Entwurf neu. Eine bisherige Fassung, der man es gegenüberstellen könnte, gibt es nicht; den ganzen Text enthält der Entwurf selbst.
      </p>
      <p v-else-if="undivided" class="text-sm text-ink-secondary">
        {{ undividedText(end.explanations.length > 0, end.unit) }}
      </p>
      <p v-else class="text-sm text-ink-secondary">
        Zu diesem Gesetz enthält die Gegenüberstellung des Ministeriums keinen Teil.
      </p>
    </template>
    <p v-if="withheldIds.length" class="text-sm text-ink-secondary">{{ unplacedText(withheldIds, end.unit) }}</p>
    <p v-for="line in laterLines" :key="line" class="text-xs text-ink-muted">{{ line }}</p>
    <div v-for="s in shown" :key="s.id">
      <p class="text-sm font-medium text-ink">{{ unitList([s.id], end.unit) }}</p>
      <LesefassungDisclosure :paragraph="s.paragraph" :unit="end.unit" class="mt-1" />
    </div>
    <!-- The Ressort's reasoning for §§ without a block, in the shape it has
         at a § (`TextComparisonSection`): closed, in ink, the passages
         unaltered under their own headings. -->
    <Disclosure v-if="end.explanations.length" size="xs" tone="ink">
      <template #summary>Begründung des Ministeriums zu {{ explained }}</template>
      <ExplanationPassages :passages="end.explanations" />
    </Disclosure>
  </div>
</template>
