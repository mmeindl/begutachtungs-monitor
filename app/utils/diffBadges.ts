/**
 * The pill and gutter styles both comparison sections use, in one place.
 *
 * They were written twice, identically but for one word: the § comparison
 * calls a removed unit „entfallen", the Textgegenüberstellung calls a removed
 * row „entfällt" — a whole paragraph is gone, a provision falls away. The
 * tables are shared, the word is a parameter, and neither section has to give
 * up its own.
 */
import type { LawUnitChange } from '#shared/types'

/** What a pill can say: the four changes, plus the editorial class. */
export type DiffBadge = LawUnitChange | 'editorial'

/**
 * One pill style for rows and group summaries alike.
 *
 * Red for what goes, green for what arrives — the diff convention everyone
 * has read on GitHub (Manu, 08.09.2026; the note in main.css follows). Text
 * on a wash is always `text-ink`: ink-secondary drops below 7:1 there, the
 * same reason DeadlineBadge carries full ink.
 *
 * Meaning never rides on colour alone: the pill says the state in words and
 * the gutter repeats it beside the block. The strikethrough is reserved for
 * the word-level diff, where deleted and inserted words share one sentence
 * and the line says which to skip — on a whole removed § it would only make
 * the passage this tool exists to show harder to read, and GitHub does not
 * strike removed lines either.
 */
export const BADGE_CLASS: Record<DiffBadge, string> = {
  changed: 'bg-accent-50 text-accent-deep',
  editorial: 'bg-page text-ink-muted',
  unchanged: 'bg-page text-ink-muted',
  inserted: 'bg-status-good/15 text-ink',
  removed: 'bg-status-critical/10 text-ink',
}

/**
 * The gutter repeats the pill's colour, so state reads at a glance down the
 * page: red gone, green new, blue edited, grey formalities. `mark` stays out
 * of it — it is the brand's "what became of the input" ground, and a fifth
 * colour in one row helps nobody.
 */
export const GUTTER_CLASS: Record<DiffBadge, string> = {
  changed: 'border-accent-deep/50',
  inserted: 'border-status-good',
  removed: 'border-status-critical',
  editorial: 'border-hairline',
  unchanged: 'border-hairline',
}

/**
 * Strongest event first: whole paragraphs appearing or disappearing, then
 * edits deep before shallow, the unchanged baseline last — the order every
 * diff view has trained readers on. The pills on the law headers follow it.
 */
export const BADGE_ORDER: DiffBadge[] = ['inserted', 'removed', 'changed', 'editorial', 'unchanged']

/** The words on the pills; only the removed one differs between sections. */
export function badgeLabels(removedLabel: string): Record<DiffBadge, string> {
  return {
    changed: 'geändert',
    editorial: 'redaktionell',
    unchanged: 'unverändert',
    inserted: 'neu',
    removed: removedLabel,
  }
}

export interface DiffBadgeCount {
  badge: DiffBadge
  count: number
  label: string
}

/** The summary pills of one group, in `BADGE_ORDER`; a zero gets no pill. */
export function badgeCounts(
  counts: Record<DiffBadge, number>,
  labels: Record<DiffBadge, string>,
): DiffBadgeCount[] {
  return BADGE_ORDER.filter((b) => counts[b] > 0).map((b) => ({ badge: b, count: counts[b], label: labels[b] }))
}
