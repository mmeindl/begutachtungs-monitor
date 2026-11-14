/**
 * The sentence above the § comparison that explains the disclosures below
 * it (`LawDiffSection`): how many of the Ressort's Begründungen changed
 * between two versions. Out of the component on 04.10.2026, so its wording
 * can be pinned by a test like its neighbours in `lawPackage.ts`.
 *
 * Here rather than on every row: printing „unverändert" on 33 rows would be
 * noise, naming the rate once is the information. And it names both numbers —
 * how often the reasoning moved with the text and how often it did not —
 * because an unchanged reasoning for a changed text is a statement of its
 * own.
 */
import type { ExplanationsMissing, ReasoningDiffResponse, ReasoningGap } from '#shared/types'

/**
 * The Begründungen the Ressort changed, as the page counts them: the
 * editorial ones not (`ReasoningDiffEntry.editorial`, 22.10.2026) — the
 * count of the § comparison, which leaves its „redaktionell" units out the
 * same way (`ownChangeShare`). One function for this sentence and the
 * Regierungsvorlage's row (`useVorlageOutcome`), so the two cannot count
 * differently.
 */
export function substantiveReasoningChanges(stats: Pick<ReasoningDiffResponse['stats'], 'changed' | 'editorial'>): number {
  return stats.changed - stats.editorial
}

export function reasoningRateNote(stats: ReasoningDiffResponse['stats'] | null | undefined, author = 'das Ressort'): string | null {
  if (!stats?.compared) return null
  const { compared } = stats
  const changed = substantiveReasoningChanges(stats)
  // Shorter since 30.09.2026; „— aufklappbar an der Änderung" went, the
  // disclosure at each change announces itself. Counts Begründungen since
  // 01.10.2026, not Paragraphen: what is compared is the ressort's passage to
  // a change — one passage on three Ziffern is one Begründung, and only where
  // the Erläuterungen are titled by § is it the Paragraph's.
  //
  // Shorter again on 01.10.2026: „die beide Fassungen zu den Änderungen
  // führen" became „die in beiden Fassungen stehen" — the same restriction,
  // the one the count needs to be read right.
  if (compared === 1) {
    return changed === 0
      ? `Die Begründung, die in beiden Fassungen steht, hat ${author} nicht geändert.`
      : `Die Begründung, die in beiden Fassungen steht, hat ${author} geändert.`
  }
  //
  // „…, die in beiden Fassungen stehen" left the plural on 02.10.2026: it
  // shares a paragraph with the pointer to the Erläuterungen now, and the
  // restriction stands on /so-funktionierts. The singular keeps it — „Die
  // Begründung" alone would not say which one.
  if (changed === 0) return `Keine der ${compared} Begründungen hat ${author} geändert.`
  if (changed === compared) return `Alle ${compared} Begründungen hat ${author} geändert.`
  return `${changed} der ${compared} Begründungen hat ${author} geändert.`
}

/**
 * The line at a change whose Begründung could not be attached (14.11.2026),
 * in place of the disclosure a found one opens. Without it, a change with no
 * disclosure read like one whose Begründung was found and left unchanged —
 * „kept" where the truth is „we could not tell". Only for changes where both
 * documents carry Erläuterungen (`ReasoningDiffResponse.gaps`); where one has
 * none, nothing at the change could be attached in the first place.
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
 * The Begründung row when a side's Erläuterungen could not be read
 * (14.11.2026) — until then the row went missing, and its silence read like
 * a comparison that had nothing to say. Parliament's record proves only
 * what it lists, never that nothing was published, so the sentence says
 * „nicht gelesen" and names what the record shows: an Erläuterungen document
 * only as PDF, or none listed under that title.
 */
const EXPLANATIONS_OF_DE = { me: 'des Entwurfs', rv: 'der Regierungsvorlage' } as const

export function explanationsMissingNote(missing: readonly ExplanationsMissing[] | null | undefined): string | null {
  if (!missing?.length) return null
  const sentence = ({ side, kind }: ExplanationsMissing) =>
    kind === 'pdfOnly'
      ? `Die Erläuterungen ${EXPLANATIONS_OF_DE[side]} liegen nur als PDF vor und konnten nicht gelesen werden.`
      : `Erläuterungen ${EXPLANATIONS_OF_DE[side]} konnten nicht gelesen werden: Das Parlament führt sie nicht als eigenes Dokument.`
  return `${missing.map(sentence).join(' ')} Die Begründungen sind deshalb nicht verglichen.`
}
