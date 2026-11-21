/**
 * „nicht geprüft" at a § of a Land's Textgegenüberstellung whose new text
 * was not held word for word against the draft (20.11.2026), as the Bund's
 * annex marks a row that owed a check and got none (`annexUncheckedNote`).
 * Which § and why is the server's call (`LandLawDiffResponse.draftUnchecked`,
 * `notHeld` in `landTguGuard.ts`); this module finds each mark at its unit
 * and words the reasons, once per law. Until then such a § stood as if it
 * had been checked.
 *
 * Each reason is true of every § it is said of, and none says whose doing a
 * difference would be: what failed is the monitor's check, not the draft.
 */
import type { LandDraftUncheckedReason, LandLawDiffResponse } from '#shared/types'
import { diffUnitKey } from '#shared/utils/diffKey'
import { DRAFT_CHECK_LEAD_DE, DRAFT_CHECK_REASON_DE } from '#shared/utils/draftCheckReasons'

/** The marks by the unit they stand at (`diffUnitKey`): a removed § of the same number is another unit. */
export function landUncheckedMarks(marks: LandLawDiffResponse['draftUnchecked']): Map<string, LandDraftUncheckedReason> {
  return new Map((marks ?? []).map((m) => [diffUnitKey({ article: m.law, id: m.id, change: m.change }), m.reason]))
}

/** The line under a law's „nicht geprüft" pill, or null where none of its §§ carries the mark. */
export function landUncheckedNote(reasons: readonly LandDraftUncheckedReason[]): string | null {
  const distinct = [...new Set(reasons)]
  return distinct.length ? `${DRAFT_CHECK_LEAD_DE}: ${distinct.map((r) => DRAFT_CHECK_REASON_DE[r]).join('; ')}.` : null
}
