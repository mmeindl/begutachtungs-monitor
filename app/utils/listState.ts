/**
 * What a list box says while its rows are on the way or failed to come
 * (16.11.2026, `ListBoxState`): the words every list shares. A list's own
 * loading line and failure stay in its own copy object; these are the
 * defaults behind them, so a second language replaces them here.
 *
 * A LIST SHOWS ITS FRAME WHILE LOADING (docs/decisions.md, „A list shows
 * its frame while loading"): heading, lede, the box, its column header and
 * the controls whose content is known without the data stand at once; the
 * loading line and the failure stand inside the box where the rows will be.
 */
import { GAP_LEAD_DE } from '#shared/utils/gaps'

export const LIST_STATE_DE = {
  /** The polite live region, once, when rows arrived after a loading line. */
  loaded: 'Die Liste ist geladen.',
  /** A failed request with nothing to name: the bare lead word, as `ErrorState` says it. */
  failed: GAP_LEAD_DE.unavailable,
  retry: 'Erneut versuchen',
} as const

/** The failure a list box shows in its rows' place: a label (object first) or a gap sentence, and what to add under it. */
export interface ListBoxFailure {
  /** „Anliegen: gerade nicht abrufbar" (`gapLabelDe`) or a whole gap sentence (`gapDe`); set through `GapNote`. */
  text: string
  description?: string
}

/** Where a list box's rows stand: on the way (with the list's own line), failed, or there. */
export type ListBoxStatus = { loading: string } | { failed: ListBoxFailure } | null

/**
 * A fetch's status as the box's: loading while `pending`/`idle` and no data
 * yet (a refresh keeps the rows — `FetchGate`'s rule), failed on an error
 * with no data, else nothing to say. Pure.
 */
export function listBoxStatusOf(
  fetch: { status: string; error: unknown; hasData: boolean },
  loading: string,
  failed: ListBoxFailure = { text: LIST_STATE_DE.failed },
): ListBoxStatus {
  if (fetch.hasData) return null
  if (fetch.status === 'pending' || fetch.status === 'idle') return { loading }
  if (fetch.error || fetch.status === 'error') return { failed }
  return null
}
