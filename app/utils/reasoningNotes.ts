/**
 * What the comparisons say about the Begründungen they could not show: the
 * line at one change, and the sentence for a whole comparison. No count of
 * changed Begründungen since 17.11.2026 — neither above the list nor in the
 * Vorlage's frame: a reader asks at the Paragraph, where a changed one opens.
 */
import { gapDe, splitGap } from '#shared/utils/gaps'
import type { ExplanationsMissing, LandReasoningResponse, ReasoningDiffResponse, ReasoningGap } from '#shared/types'

/**
 * The line at a change whose Begründung could not be attached (14.11.2026),
 * in place of the disclosure a found one opens. Without it, a change with no
 * disclosure read like one whose Begründung was found and left unchanged —
 * „kept" where the truth is „we could not tell". For every change present on
 * both sides where both documents carry Erläuterungen, whichever join it
 * took (`ReasoningDiffResponse.gaps`, 19.11.2026), and for an inserted or
 * removed one whose own document names it nowhere (19.11.2026); where one
 * has none, nothing at the change could be attached in the first place.
 */
const REASONING_GAP_DE: Record<ReasoningGap, string> = {
  // Ours (19.11.2026): the join failed, so the lead word of a reading that
  // failed. Until then every line opened „Begründung: nicht zuzuordnen", an
  // exception to the lead words that left open whose gap it was.
  numbering: gapDe('unreadable', 'die Begründung – die Erläuterungen zählen die Ziffern anders.'),
  // The documents name the change in a line the reader did not take as a
  // heading: no reason we could prove, so none is given.
  unread: gapDe('unreadable', 'die Begründung – wo die Erläuterungen sie führen, liest der Monitor nicht sicher heraus.'),
  // The document's, and proven (`provesAbsence`): no heading and no „Zu …"
  // line names the change, and no block explains its law whole. A fact
  // about the document, not a gap of anyone's — so no lead word; and not
  // „nicht veröffentlicht", because prose elsewhere may still touch it.
  missingBefore: 'Begründung: Die Erläuterungen des Entwurfs haben dazu keinen Abschnitt.',
  missingAfter: 'Begründung: Die Erläuterungen der Regierungsvorlage haben dazu keinen Abschnitt.',
  missingBoth: 'Begründung: Die Erläuterungen beider Texte haben dazu keinen Abschnitt.',
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
 * The one sentence above the Bund comparison about its Begründungen as a
 * whole (19.11.2026), the first that applies:
 *
 *  1. a side's Erläuterungen were not read (`explanationsMissingNote`) — first,
 *     because the service then sets a „Nicht lesbar" reason of its own too,
 *     and the reader would get the gap twice;
 *  2. the service's own gap sentence where it compared nothing
 *     (`unavailableReason` with a lead word: „… weder nach Ziffern noch nach
 *     Paragraphen gegliedert"); a reason with none is a state the comparison
 *     says itself („noch keine Regierungsvorlage");
 *  3. the request failed (`failed`, a 4xx/5xx or a timeout) while the list
 *     shows changes. Before, the section then showed every change without a
 *     Begründung and without a word — the page's grammar for „unchanged";
 *     under Parliament's 429s 38 drafts of GP XXVII answered so.
 *
 * `failed` is the caller's to gate: only the step and the root a Begründung
 * comparison exists for (`useLawDiffStep.reasoningFailed`).
 */
export function reasoningComparisonNote(
  r: Pick<ReasoningDiffResponse, 'available' | 'unavailableReason' | 'explanationsMissing'> | null | undefined,
  failed: boolean,
  changes: number,
): string | null {
  return (
    explanationsMissingNote(r?.explanationsMissing) ??
    (r && !r.available && splitGap(r.unavailableReason) ? r.unavailableReason : null) ??
    (failed && changes > 0 ? REASONING_FAILED_DE.ministry : null)
  )
}

/** A Begründung request that failed: whose Begründungen, said with the lead word of a gap that passes. */
const REASONING_FAILED_DE = {
  ministry: gapDe('unavailable', 'die Begründungen des Ministeriums. Ob sie sich zu den Änderungen geändert haben, zeigt der Vergleich deshalb nicht.'),
  land: gapDe('unavailable', 'die Begründungen des Landes. Ob sie sich zu den Änderungen geändert haben, zeigt der Vergleich deshalb nicht.'),
} as const

/**
 * The same for a Land's draft against its Vorlage, above that comparison
 * (`LandLawDiffSection`; the frame's row „Begründung" until 17.11.2026).
 * Not compared is said, never left out (24.10.2026): without it a change
 * that shows no Begründung read as „the reasons did not change".
 *
 * The service's own gap sentence where it gives one; where both texts were
 * read and the § join found no Paragraph explained in both, that — of what
 * the monitor found, not of the documents (21.11.2026): the join reads no
 * new law's § by its own designation, and „decken keinen gemeinsamen
 * Paragraphen ab" stood under new laws explained § by § in both texts. Nothing while the comparison found
 * Begründungen to hold against each other, and nothing for a reason that is
 * no gap sentence — the comparison under it says that one itself. Where the
 * request failed and the list shows changes, that it is not to be had now
 * (19.11.2026; before, silence).
 */
export function landReasoningGapNote(
  r: Pick<LandReasoningResponse, 'available' | 'unavailableReason' | 'stats'> | null | undefined,
  failed = false,
  changes = 0,
): string | null {
  if (!r) return failed && changes > 0 ? REASONING_FAILED_DE.land : null
  if (r.available) {
    return r.stats.compared
      ? null
      : gapDe('outOfScope', 'ein Vergleich der Begründungen. Zu keiner Änderung fand der Monitor in beiden Texten eine Begründung zum selben Paragraphen.')
  }
  return splitGap(r.unavailableReason) ? `${r.unavailableReason} Die Begründungen sind deshalb nicht verglichen.` : null
}
