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
 * same reason the deadline card carries full ink.
 *
 * Meaning never rides on colour alone: the pill says the state in words and
 * the gutter repeats it beside the block. The strikethrough is reserved for
 * the word-level diff, where deleted and inserted words share one sentence
 * and the line says which to skip — on a whole removed § it would only make
 * the passage this tool exists to show harder to read, and GitHub does not
 * strike removed lines either.
 */
/*
 * Every kind its own ground (21.10.2026): „geändert" amber, „redaktionell"
 * a neutral grey (main.css, `diff-*`), „unverändert" none — white with a
 * ring. Three forms, not three shades. Before, „geändert" was ink at 10 % — read as
 * disabled — and „redaktionell" was „unverändert" to the pixel, so the word
 * alone told them apart; readers asked for the categories in colour.
 *
 * The quiet pill carries a hairline ring: its ground is the page's, and
 * the group header stands on the page too, so there the pill was invisible
 * and only its padding remained — „38 unverändert" read as text indented by
 * 8 px, alone on a line of its own at 390 px (30.09.2026). Inset, so no pill
 * changes size; the ground and so the contrast stay as they were.
 */
export const BADGE_CLASS: Record<DiffBadge, string> = {
  changed: 'bg-diff-changed-wash text-ink',
  editorial: 'bg-diff-editorial-wash text-ink',
  unchanged: 'bg-surface text-ink-muted ring-1 ring-inset ring-hairline',
  inserted: 'bg-status-good/15 text-ink',
  removed: 'bg-status-critical/18 text-ink',
}

/**
 * The gutter repeats the pill's colour, so state reads at a glance down the
 * page: red gone, green new, amber edited, grey formalities, hairline
 * untouched.
 *
 * „Geändert" was blue until 03.10.2026 — blue means "you can do something
 * here", wrong on a fact — then ink until 21.10.2026, which made the
 * substance the quietest row. Amber is neither: not an action, and not
 * `mark` either, which stays the highlighter (docs/architecture.md §8).
 */
export const GUTTER_CLASS: Record<DiffBadge, string> = {
  changed: 'border-diff-changed',
  inserted: 'border-status-good',
  removed: 'border-status-critical',
  editorial: 'border-diff-editorial',
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

/** „nicht geprüft" — shown, but unverified: an outline like „unverändert",
 *  because nothing is missing, but dotted, so it no longer reads as that
 *  pill (21.10.2026). Dotted and not dashed: dashed is „nicht gezeigt", a
 *  gap. An outline, not a border, so the pill keeps its size. One class for
 *  the law header and the § (02.10.2026). */
export const UNCHECKED_PILL = 'inline-flex items-center rounded-full bg-page px-2 py-0.5 text-xs font-medium tabular-nums text-ink-muted outline-[1.5px] outline-dotted -outline-offset-[1.5px] outline-ink-muted/70'

/**
 * What one § is, from the pills of its rows — so a group header can count
 * §§ instead of rows (02.10.2026).
 *
 * The Textgegenüberstellung prints a § over as many rows as it has Absätze,
 * and its header counted rows: one new § with fourteen Absätze read „14 neu"
 * (§ 8a, 115/ME XXVIII), while the check beside it counts §§ — so the pills
 * did not add up to anything the line above them said.
 *
 * Not the strongest change: an existing § with one changed and four new
 * Absätze is a changed §, not a new one (§ 8 of the same draft). A § is new
 * only if all of it is new, gone only if all of it is gone; anything mixed
 * is „geändert".
 */
export function paragraphBadge(rows: ReadonlySet<DiffBadge>): DiffBadge {
  if (rows.size === 1) return [...rows][0]!
  if ([...rows].every((b) => b === 'unchanged' || b === 'editorial')) return 'editorial'
  return 'changed'
}

/** The summary pills of one group, in `BADGE_ORDER`; a zero gets no pill. */
export function badgeCounts(
  counts: Record<DiffBadge, number>,
  labels: Record<DiffBadge, string>,
): DiffBadgeCount[] {
  return BADGE_ORDER.filter((b) => counts[b] > 0).map((b) => ({ badge: b, count: counts[b], label: labels[b] }))
}
