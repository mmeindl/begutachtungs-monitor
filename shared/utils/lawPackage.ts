/**
 * The two sentences above the § comparison that name laws only one of the
 * two documents carries (docs/ris-join.md §6d).
 *
 * Here rather than in the component so the number agreement is testable: a
 * Regierungsvorlage that merges several drafts carries over a hundred of
 * them, and "die … nicht vorkommt" is wrong German for all but one of them.
 *
 * Framing rule (CLAUDE.md): both sentences state what the two texts contain,
 * never a verdict. A law missing from this Regierungsvorlage is not a law
 * that was dropped — a draft can end up in more than one (architecture.md
 * §13.4), and the sentence says so.
 */
import type { LawPackageEntry } from '../types'

/** How many law names a sentence lists before it counts the rest. */
const MAX_NAMES = 3

/** "A", "A und B", "A, B, C und ein weiteres", "A, B, C und 132 weitere" */
export function formatLawList(entries: readonly LawPackageEntry[], max = MAX_NAMES): string {
  const names = entries.map((e) => e.article)
  if (names.length > max) {
    const rest = names.length - max
    return `${names.slice(0, max).join(', ')} und ${rest === 1 ? 'ein weiteres' : `${rest} weitere`}`
  }
  if (names.length > 1) return `${names.slice(0, -1).join(', ')} und ${names.at(-1)}`
  return names[0] ?? ''
}

/** Laws the Regierungsvorlage carries and the draft never had. */
export function mergedLawsNote(laws: readonly LawPackageEntry[]): string | null {
  if (!laws.length) return null
  const clause =
    laws.length === 1
      ? 'ein weiteres Gesetz, das in diesem Entwurf nicht vorkommt'
      : `${laws.length} weitere Gesetze, die in diesem Entwurf nicht vorkommen`
  return (
    `Die Regierungsvorlage ändert ${clause}: ${formatLawList(laws)}. ` +
    'Eine Regierungsvorlage fasst häufig mehrere Ministerialentwürfe zusammen; verglichen wird deshalb, was in beiden Texten steht.'
  )
}

/** Laws the draft carried and this Regierungsvorlage does not. */
export function droppedLawsNote(laws: readonly LawPackageEntry[]): string | null {
  if (!laws.length) return null
  const one = laws.length === 1
  const clause = one
    ? 'ein Gesetz, das in dieser Regierungsvorlage nicht vorkommt'
    : `${laws.length} Gesetze, die in dieser Regierungsvorlage nicht vorkommen`
  return (
    `Der Entwurf ändert ${clause}: ${formatLawList(laws)}. ` +
    `Ein Entwurf kann in mehrere Regierungsvorlagen münden — möglicherweise ${one ? 'steht es' : 'stehen sie'} in einer anderen.`
  )
}
