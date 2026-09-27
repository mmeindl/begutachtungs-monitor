/**
 * How much of a draft the Regierungsvorlage changed — the measure behind the
 * base rate of docs/architecture.md §12.38, defined once for the page and for
 * the script that measures the rate (`scripts/corpus/aenderungsrate.ts`), so
 * the number on a draft and the number it is compared with cannot mean two
 * things.
 *
 * WHY THIS MEASURE, measured 27.09.2026 over the comparable drafts of GP
 * XXVII and XXVI. „Changed yes/no" separates nothing: 274 of 277 drafts were
 * changed. The count of changed units depends on the size of the law more
 * than on the change (p10 2, p90 42). The share of all units touched counts
 * what the Vorlage ADDS, which is its own question. What stays is the share
 * of the draft's own units — the ones a Stellungnahme could have been about —
 * that the Vorlage changed in wording or dropped: p25 46 %, median 62 %,
 * p75 75 % in XXVII, and the spread is wide enough to say something about a
 * single draft.
 *
 * Changes the page marks as merely editorial (citations, numbers, dates,
 * punctuation — `EDITORIAL_BADGE_SENTENCE` in lawStations.ts) are not counted: they
 * are no change of wording in the sense a reader means.
 */

/** The counts of a comparison, as `summarizeDiff` gives them. */
export interface ChangeCounts {
  unchanged: number
  changed: number
  editorial: number
  removed: number
}

/** The draft's own units and how many of them the later text changed or dropped; null without any. */
export function ownChangeShare(stats: ChangeCounts): { changed: number; own: number; share: number } | null {
  const own = stats.unchanged + stats.changed + stats.removed
  if (own === 0) return null
  const changed = stats.changed - stats.editorial + stats.removed
  return { changed, own, share: changed / own }
}
