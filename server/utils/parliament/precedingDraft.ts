/**
 * Was there a Begutachtung before this Regierungsvorlage? — the second
 * opinion on `preconst`, without which „ohne Begutachtung" would be an
 * unchecked claim.
 *
 * WHY IT EXISTS. The Vorlage names its Ministerialentwurf in
 * `content.preconst[]` — structured, unambiguous, and therefore the only
 * basis on which a row may point at a draft page of our own. But `preconst`
 * is not a universal field (`api-exploration.md` §101): measured on
 * 18.09.2026, **32 of 117 Regierungsvorlagen in GP XXVIII carry no
 * `preconst` at all** — not one of them has the list without an ME entry,
 * it is simply missing. A missing pointer therefore means only „wir haben
 * keine Seite dafür", never „es gab keine Begutachtung" — and the second
 * is exactly what the row used to say.
 *
 * WHAT IS CHECKED. The same cross-check `begutachtung-uebersprungen.md`
 * §2 once ran offline: list 81 of the same GP, title comparison, and only
 * drafts that began before the Vorlage arrived. If it finds a plausible
 * draft, the row says nothing; if it finds none, „ohne Begutachtung" has
 * two independent sources.
 *
 * CALIBRATION (GP XXVIII, 18.09.2026, `titleComponents().jac` against the 85
 * real ME→RV pairs `preconst` names):
 *
 * | Threshold | real pairs found | fires on the 32 without a pointer |
 * |----------:|-----------------:|----------------------------------:|
 * |      0,40 |            72/81 |                                 3 |
 * |      0,50 |            72/81 |                                 3 |
 * |      0,60 |            69/81 |                                 1 |
 * |      0,70 |            63/81 |                                 0 |
 *
 * 0,50 is the knee: below it the check does not get more sensitive, above it
 * it loses real pairs. The three hits among the 32 are the generic ASVG
 * family that §2 already reported as false matches (293, 299 d.B. against
 * 38/ME, 405 d.B. against 23/ME) — they lose the note although they would
 * have deserved it. **The direction is deliberate:** a withheld note takes a
 * piece of information off a row, a wrong note makes a public claim about a
 * government's plan. The first is bearable, the second is not.
 *
 * WHAT IT CANNOT DO. Nine of the 81 real pairs stay below 0,50 because the
 * title really does change between Entwurf and Vorlage (Sammelnovellen,
 * renamings). For rows WITH a pointer that costs nothing — those are never
 * checked. For a row without one it means: roughly one in ten prior
 * histories that do exist would not be found by this check. And it sees its
 * own GP only; a draft from the previous period falls through.
 *
 * PURE MODULE — only relative imports, so vitest can execute it directly.
 */
import type { DraftSummary } from '../../../shared/types'
import { titleComponents } from '../ris/titleSimilarity'

/** See the calibration table above. */
const PRECEDING_DRAFT_MIN_JACCARD = 0.5

/**
 * The most plausible Ministerialentwurf before this Vorlage, or null.
 *
 * Jaccard, not the containment number from the RIS join: there `cont` is
 * load-bearing, because RIS enumerates every amended law and the shorter
 * title is contained in the longer one. Here both sides are Parliament
 * titles of the same writing convention, and `cont` turns into a trap —
 * „Allgemeines Sozialversicherungsgesetz, Änderung" is contained in every
 * ASVG-Sammelnovelle without a remainder and reaches 1,00 against a draft
 * the Vorlage has nothing to do with.
 */
export function findPrecedingDraft(
  vorlage: { title: string; date: string | null },
  drafts: DraftSummary[],
): DraftSummary | null {
  const filedAt = (vorlage.date ?? '').slice(0, 10)
  let best: { draft: DraftSummary; jac: number } | null = null
  for (const draft of drafts) {
    const startedAt = (draft.arrivedAt ?? '').slice(0, 10)
    // A draft that began after the Vorlage arrived cannot be its prior
    // history. With a date missing nothing is excluded — the title threshold
    // then carries the decision alone.
    if (filedAt && startedAt && startedAt > filedAt) continue
    const { jac } = titleComponents(draft.title, vorlage.title)
    if (jac < PRECEDING_DRAFT_MIN_JACCARD) continue
    if (!best || jac > best.jac) best = { draft, jac }
  }
  return best?.draft ?? null
}
