/**
 * How much of a draft the Regierungsvorlage changed — the measure behind the
 * base rate, as the script measures it (`scripts/corpus/aenderungsrate.ts`).
 *
 * NOT ON THE PAGE since 17.11.2026. Until then the Vorlage's frame printed
 * the share as a row („Umgeschrieben oder gestrichen") and drew it against
 * the period's middle half. The row repeated what the comparison's legend
 * counts per kind, and the range (46–77 %) was too wide to place a single
 * draft, least of all one of three Paragraphen. The measure stays for the
 * corpus; the measured values are in `docs/decisions.md`, „The procedure".
 *
 * WHY THIS MEASURE, measured 27.09.2026 over the comparable drafts of GP
 * XXVII and XXVI. „Changed yes/no" separates nothing: 280 of 283 drafts were
 * changed. The count of changed units depends on the size of the law more
 * than on the change (p10 2, p90 42). The share of all units touched counts
 * what the Vorlage ADDS, which is its own question. What stays is the share
 * of the draft's own units — the ones a Stellungnahme could have been about —
 * that the Vorlage changed in wording or dropped: p25 46 %, median 63 %,
 * p75 77 % in XXVII (75 % until dropped laws were counted, 03.10.2026), and the spread is wide enough to say something about a
 * single draft.
 *
 * Changes the page marks as merely editorial (punctuation, articles, citation
 * words, a date written differently — `EDITORIAL_BADGE_DEFINITION` in lawStations.ts) are not counted: they
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

/**
 * Whether the counted units are Änderungsanordnungen: an Änderungsanordnung
 * is an „Änderung" in the page's words (30.09.2026), a § of a new law a
 * Paragraph. A Novelle has no §§ of its own; its units are the numbered
 * amendment instructions (`Z 1`, `Z 2`, …).
 */
export function isNovelleUnits(units: readonly { id: string }[]): boolean {
  return units.length > 0 && units.every((u) => /^Z\d/.test(u.id))
}
