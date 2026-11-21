/**
 * The verdict of every § of a Land's Textgegenüberstellung as the page gets
 * it from the draft rules (21.11.2026): what `tests/landTguGolden.test.ts`
 * pins over real documents and `scripts/ci/landTguGoldenRecord.ts` records.
 * Asked as `withoutUndrafted` (`landTguService.ts`) asks them, of the §§
 * the reader hands the guard, before it withholds any.
 */
import type { LandDraftUncheckedReason, LawDiffUnit } from '../../shared/types'
import type { TextBlock } from '../../server/utils/lawtext/lawUnits'
import { guardTguUnits, notHeld, undrafted } from '../../server/utils/laender/landTguGuard'

/**
 * One § and where it ends: withheld with the draft rules' reason, shown with
 * „nicht geprüft" and the page's reason, or shown. A § shown unchanged or
 * removed is not asked and stands as shown.
 */
export interface TguVerdict {
  law: string | null
  id: string
  fromId: string | null
  change: LawDiffUnit['change']
  verdict: 'withheld' | 'marked' | 'shown'
  reason?: 'notInDraft' | 'draftDiffers' | LandDraftUncheckedReason
}

export function tguVerdicts(units: readonly LawDiffUnit[], blocks: readonly TextBlock[] | null): TguVerdict[] {
  const guard = guardTguUnits(units, blocks)
  const off = undrafted(guard)
  const marks = notHeld(guard)
  return units.map((u, i) => {
    const at = { law: u.article, id: u.id, fromId: u.fromId, change: u.change }
    if (off.has(i)) return { ...at, verdict: 'withheld', reason: off.get(i)! }
    if (marks.has(i)) return { ...at, verdict: 'marked', reason: marks.get(i)! }
    return { ...at, verdict: 'shown' }
  })
}
