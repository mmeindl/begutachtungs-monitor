/**
 * What the comparisons say about the Begründungen they could not show: the
 * line at one change, and the sentence for a whole comparison. No count of
 * changed Begründungen since 17.11.2026 — neither above the list nor in the
 * Vorlage's frame: a reader asks at the Paragraph, where a changed one opens.
 */
import { gapDe, splitGap } from '#shared/utils/gaps'
import type { ExplanationsMissing, LandReasoningResponse, ReasoningGap } from '#shared/types'

/**
 * The line at a change whose Begründung could not be attached (14.11.2026),
 * in place of the disclosure a found one opens. Without it, a change with no
 * disclosure read like one whose Begründung was found and left unchanged —
 * „kept" where the truth is „we could not tell". For every change present on
 * both sides where both documents carry Erläuterungen, whichever join it
 * took (`ReasoningDiffResponse.gaps`, 19.11.2026); where one has none,
 * nothing at the change could be attached in the first place.
 */
const REASONING_GAP_DE: Record<ReasoningGap, string> = {
  numbering: 'Begründung: nicht zuzuordnen – die Erläuterungen zählen die Ziffern anders.',
  missingBefore: 'Begründung: nicht zuzuordnen – im Entwurf nicht gefunden.',
  missingAfter: 'Begründung: nicht zuzuordnen – in der Regierungsvorlage nicht gefunden.',
  missingBoth: 'Begründung: nicht zuzuordnen – in keinem der beiden Dokumente gefunden.',
  // The documents name the change in a line the reader did not take as a
  // heading: no reason we could prove, so none is given.
  unread: 'Begründung: nicht zuzuordnen.',
}

export function reasoningGapNote(gap: ReasoningGap | null | undefined): string | null {
  return gap ? REASONING_GAP_DE[gap] : null
}

/**
 * The sentence above the comparison when a side's Erläuterungen could not
 * be read (14.11.2026; a row of the Vorlage's frame until 17.11.2026) —
 * before it, silence read like a comparison that had nothing to say. Parliament's record proves only
 * what it lists, never that nothing was published, so the sentence says
 * „nicht gelesen" and names what the record shows: an Erläuterungen document
 * only as PDF, or none listed under that title.
 */
const EXPLANATIONS_OF_DE = { me: 'des Entwurfs', rv: 'der Regierungsvorlage' } as const

export function explanationsMissingNote(missing: readonly ExplanationsMissing[] | null | undefined): string | null {
  if (!missing?.length) return null
  // „Nicht lesbar", not „Nicht veröffentlicht", for both: the record does
  // not prove that nothing was published (`shared/utils/gaps.ts`).
  const sentence = ({ side, kind }: ExplanationsMissing) =>
    kind === 'pdfOnly'
      ? `Die Erläuterungen ${EXPLANATIONS_OF_DE[side]} gibt es nur als PDF.`
      : `Erläuterungen ${EXPLANATIONS_OF_DE[side]} führt das Parlament nicht als eigenes Dokument.`
  return gapDe('unreadable', `${missing.map(sentence).join(' ')} Die Begründungen sind deshalb nicht verglichen.`)
}

/**
 * The same for a Land's draft against its Vorlage, above that comparison
 * (`LandLawDiffSection`; the frame's row „Begründung" until 17.11.2026).
 * Not compared is said, never left out (24.10.2026): without it a change
 * that shows no Begründung read as „the reasons did not change".
 *
 * The service's own gap sentence where it gives one; where both texts were
 * read and share no Paragraph, that. Nothing while the comparison found
 * Begründungen to hold against each other, and nothing for a reason that is
 * no gap sentence — the comparison under it says that one itself.
 */
export function landReasoningGapNote(r: Pick<LandReasoningResponse, 'available' | 'unavailableReason' | 'stats'> | null | undefined): string | null {
  if (!r) return null
  if (r.available) {
    return r.stats.compared
      ? null
      : gapDe('outOfScope', 'ein Vergleich der Begründungen. Die Erläuterungen beider Texte decken keinen gemeinsamen Paragraphen ab.')
  }
  return splitGap(r.unavailableReason) ? `${r.unavailableReason} Die Begründungen sind deshalb nicht verglichen.` : null
}
