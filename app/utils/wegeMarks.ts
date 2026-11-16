/**
 * The marks of `/wege`, shared by the page's legend and its matrices
 * (`WegMatrix`): a round ink dot for a station, a blue square where one can
 * take part — shape and colour both — and a character for the other two.
 * The word stays beside it for screen readers (`WEG_CELL_LABEL`,
 * `wegCellLabel`).
 */
import type { WegCell } from './wege'

export const WEG_MARK_CLASS: Record<WegCell, string> = {
  durch: 'inline-block size-2.5 rounded-full bg-ink',
  stellungnahme: 'inline-block size-3.5 rounded-[3px] bg-accent',
  entfaellt: 'text-ink-secondary',
  offen: 'font-semibold text-ink-secondary',
}

export const WEG_MARK_GLYPH: Record<WegCell, string> = { durch: '', stellungnahme: '', entfaellt: '–', offen: '?' }

/* A group's bar inside the card, at both widths: the page's ground as a
 * quiet band between the white rows, the name in the rows' size AND in the
 * rows' typeface (`font-sans`, 16.11.2026): the bar is a `th` in a table
 * and an `h2` elsewhere, and the base style sets every h2 in the heading
 * serif — so „Nicht im Monitor" stood in another typeface than the bars
 * above it. */
export const WEG_SECTION_BAR = 'border-b border-hairline bg-page px-4 py-2 text-left font-sans text-sm font-semibold text-ink'
