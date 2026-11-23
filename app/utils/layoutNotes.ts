/**
 * The sentences a law text owes where it prints what the comparison does not
 * compare (21.11.2026): an image („[Abbildung]", `FIGURE_NOT_COMPARED_DE`)
 * and a table read as a run of words (`TABLE_AS_TEXT_DE`).
 *
 * `DiffBody` says them under each change. Until then nothing said them where
 * the same texts are printed outside it: the folded „unverändert" units of
 * the § comparisons, the annex's unchanged rows, the Lesefassung and the
 * Begründung's disclosure — so an image swapped between two stations read
 * „unverändert" with no word that images are not compared. Measured over the
 * cached GP XXVIII station corpus: 11 unchanged units with the mark in 4
 * drafts, 35 unchanged units from a table in 6.
 */
import type { EnactedParagraph, LawDiffUnit } from '#shared/types'
import { FIGURE_IN_LAW_TEXT_DE, FIGURE_NOT_COMPARED_DE, TABLE_AS_TEXT_DE, TABLE_IN_LAW_TEXT_DE, hasFigure } from '#shared/utils/figureMark'

/** The figure sentence where any of the texts carries the mark; the table sentence where `table`. */
export function layoutNotes(texts: readonly (string | null | undefined)[], table = false): string[] {
  return [...(texts.some((t) => hasFigure(t)) ? [FIGURE_NOT_COMPARED_DE] : []), ...(table ? [TABLE_AS_TEXT_DE] : [])]
}

/** Under a § of a new law, which is printed and not compared. */
export function enactedLayoutNotes(lines: EnactedParagraph['lines']): string[] {
  return [
    ...(lines.some((l) => hasFigure(l.text)) ? [FIGURE_IN_LAW_TEXT_DE] : []),
    ...(lines.some((l) => l.table) ? [TABLE_IN_LAW_TEXT_DE] : []),
  ]
}

/** The same for a run of units printed together — a fold of unchanged units: each sentence once. */
export function unitLayoutNotes(units: readonly Pick<LawDiffUnit, 'fromText' | 'toText' | 'table'>[]): string[] {
  return layoutNotes(units.flatMap((u) => [u.fromText, u.toText]), units.some((u) => u.table))
}
