/**
 * The gate applied to the rows the response carries: which § may show its
 * text, and what the page is told about the ones that may not.
 *
 * PURE MODULE — relative imports only, so vitest runs it directly. Runs after
 * `annex/verdict.ts` has produced the verdict map.
 */
import { summarizeComparison, type ComparisonRow, type ComparisonStats } from './comparisonRows'
import type { AnnexWithheldCause, TextComparisonRow } from '../../../shared/types'
import { annexParagraphKey } from './annexText'
import { isDisplayedChange } from './coverage'
import { insertedStretches } from './rightColumn'
import { REASON_NOTHING_TO_COMPARE, REASON_UNREADABLE_DESIGNATION, type AnnexVerification } from './verdict'
import type { AnnexMark } from './annexMark'

/**
 * Why the check produced no verdict at all, draft-wide — null when it
 * produced one. The harness and the golden record read it; the page has not
 * since 03.10.2026, and says why per law instead (`uncheckedReason`).
 *
 * Keyed on `judged`, not on `ran`: a check that reached RIS for ten §§ and
 * found nothing judgeable in any of them has also said nothing, and the page
 * has to be able to say so rather than fall silent.
 */
export function notRunReason(verification: AnnexVerification): string | null {
  return verification.judged > 0 ? null : verification.reasons.join('; ') || null
}

/** The rows as the response carries them, with what the check made of each. */
export interface CheckedComparison {
  rows: TextComparisonRow[]
  /** Counted over the rows as sent, withheld ones excluded */
  stats: ComparisonStats
  /** §§ whose text was withheld, whichever of the three checks refused them */
  withheldParagraphs: number
  /**
   * The same number split by cause, and it always sums to it: a withheld §
   * carries exactly one cause. The page names them separately because they
   * are three different things to a reader — the ministry's left column not
   * matching RIS, the right column repeating law that already stands, and
   * the right column carrying text the draft does not order for this §.
   */
  withheldByCause: Record<AnnexWithheldCause, number>
  /**
   * §§ that show at least one change and carry no verdict.
   *
   * Only those. Counting every unchecked verdict put §§ into the sentence
   * "… ließen sich nicht prüfen" that need no check at all: a § whose rows
   * are unchanged is folded away behind a count. The number the page prints
   * has to mean "this much of what you see is unvouched-for", or it reads as
   * an alarm about the ministry's annex.
   *
   * A § the draft *inserts* has no standing text to check against, and was
   * left out on that ground until 20.11.2026 — but its new text was held by
   * nothing either, and went out unmarked. It is counted now unless rule 2
   * held its new text against the draft (`REASON_NOTHING_TO_COMPARE`).
   */
  uncheckedParagraphs: number
  /**
   * §§ shown „nicht bestätigt" (`check: 'unconfirmed'`, `annexMark.ts`):
   * their new text was held word for word and did not agree. Never also in
   * `uncheckedParagraphs`.
   */
  unconfirmedParagraphs: number
  /**
   * Rows the page shows as a change that carry no § designation at all, so no
   * § verdict can address them. Shown as `unchecked`.
   *
   * A property of the table path only. Measured 2026-09-10: it emits 285 rows
   * without a designation, 83 of them shown as a change. On the PDF path a
   * row *is* a provision — it is cut at the § marker — so a unit without one
   * is the annex's front matter, and since 2026-09-10 the parser drops it
   * instead of emitting it as new law (`annex/annexPdf.ts`, the `unplaced`
   * count on `AnnexParse`).
   * Every row that path emits carries a designation by construction, so this
   * is 0 there.
   */
  rowsWithoutParagraph: number
}

/**
 * Apply the check to the rows — the gate itself, and therefore pure.
 *
 * The shipped version of this lived in the service and read
 * `unchecked.has(key) ? 'unchecked' : 'verified'`, which vouches for a row
 * whenever the check has not named it: for a check that never ran, for every
 * row without a § designation, and for every § in a law that was judged but
 * carried no prose of its own.
 *
 * Measured over GP XXVIII on 2026-09-10: 21 drafts where not a single § was
 * ever compared and every row went out as *geprüft* all the same (6 on the
 * table path, 15 on the PDF path), and 83 rows shown as a change that carry
 * no designation for a verdict to address. Counting the rest honestly moves
 * 180 §§ of the table path out of "bestätigt" and into "ungeprüft" (584 →
 * 764), against 967 that really were judged and passed.
 *
 * A row is verified here only where its § stands as `verified`; a `withheld`
 * § loses its text before the response leaves the server, because a wrong
 * comparison must not be renderable by any client.
 */
export function checkAnnexRows(rows: readonly ComparisonRow[], verification: AnnexVerification, marks: ReadonlyMap<string, AnnexMark> = new Map()): CheckedComparison {
  let rowsWithoutParagraph = 0
  /**
   * The table's word on a § the gate let through (`annexMark.ts`, 21.11.2026):
   * „nicht geprüft" with a reason of its own, or „nicht bestätigt". Absent,
   * or `gate`, where the gate's own answer stands — the default, so a caller
   * that hands no marks gets the gate alone (the gate's tests and golden).
   */
  const markOf = (key: string): AnnexMark | undefined => {
    const mark = marks.get(key)
    return mark && mark.kind !== 'gate' && verification.verdicts[key] !== 'withheld' ? mark : undefined
  }
  /**
   * A § whose displayed changes carry no comparable word of text in force —
   * every change an insertion, or the left column elision alone („§ 20. (1)
   * bis (5) …") — and whose new text rule 2 held against the draft, or that
   * shows none. It shows a change but owes no check: there is nothing in
   * force to hold it against, and the draft held the rest
   * (`REASON_NOTHING_TO_COMPARE`).
   */
  const nothingOwed = (key: string) => verification.uncheckedReasons[key] === REASON_NOTHING_TO_COMPARE && markOf(key) === undefined
  /**
   * A row the page shows as a change: of text in force, or new text
   * (20.11.2026). New text is the claim „the draft writes this", and a check
   * is owed for it as much as for a changed line of the standing law.
   */
  const shownChange = (row: ComparisonRow): boolean => isDisplayedChange(row) || insertedStretches([row]).length > 0
  /** §§ the page shows at least one change for — the only ones a check is owed. */
  const showsChange = new Set<string>()
  for (const row of rows) {
    if (row.kind !== 'pair' || !shownChange(row)) continue
    const para = row.gld ?? row.para
    if (para !== null && !nothingOwed(annexParagraphKey(row.law, para))) showsChange.add(annexParagraphKey(row.law, para))
  }
  const out: TextComparisonRow[] = rows.map((row) => {
    // An Artikel heading is a divider, not law text: nothing to check, and
    // nothing to vouch for either.
    if (row.kind !== 'pair') return { ...row, check: 'unchecked' as const, owesCheck: false }
    const para = row.gld ?? row.para
    if (para === null) {
      const owes = shownChange(row)
      if (owes) rowsWithoutParagraph++
      return { ...row, check: 'unchecked' as const, owesCheck: owes, uncheckedReason: REASON_UNREADABLE_DESIGNATION }
    }
    const key = annexParagraphKey(row.law, para)
    const verdict = verification.verdicts[key] ?? 'unchecked'
    const owesCheck = shownChange(row) && !nothingOwed(key)
    // The table's mark replaces what the gate let through; the § keeps its text.
    const mark = markOf(key)
    if (mark?.kind === 'unconfirmed') return { ...row, check: 'unconfirmed' as const, owesCheck }
    if (mark?.kind === 'unchecked') return { ...row, check: 'unchecked' as const, owesCheck, uncheckedReason: mark.reason }
    // The reason travels with the row for the same cause as the withheld
    // one below: the page says it per law, and only the rows know their law.
    if (verdict === 'unchecked') return { ...row, check: verdict, owesCheck, uncheckedReason: verification.uncheckedReasons[key] ?? null }
    if (verdict !== 'withheld') return { ...row, check: verdict, owesCheck }
    // The cause travels with the row, because the notice that replaces the
    // text stands inside the § and has to name what was found there.
    return { ...row, current: '', proposed: '', segments: null, check: 'withheld' as const, owesCheck, withheldCause: causeOf(verification, key) }
  })
  const withheldByCause: Record<AnnexWithheldCause, number> = { standing: 0, alreadyStanding: 0, notInDraft: 0, repealUnproven: 0, repeated: 0 }
  for (const [key, verdict] of Object.entries(verification.verdicts)) {
    if (verdict === 'withheld') withheldByCause[causeOf(verification, key)]++
  }
  return {
    rows: out,
    stats: summarizeComparison(out.filter((r) => r.check !== 'withheld')),
    withheldParagraphs: Object.values(verification.verdicts).filter((v) => v === 'withheld').length,
    withheldByCause,
    uncheckedParagraphs: [...showsChange].filter((key) => markOf(key)?.kind === 'unchecked' || (markOf(key) === undefined && (verification.verdicts[key] ?? 'unchecked') === 'unchecked')).length,
    unconfirmedParagraphs: [...showsChange].filter((key) => markOf(key)?.kind === 'unconfirmed').length,
    rowsWithoutParagraph,
  }
}

/**
 * The recorded cause of a withholding, falling back to the one every
 * withholding meant before 2026-09-10.
 *
 * `verifyAnnex` writes verdict and cause together, so the fallback is
 * unreachable — and the harness keeps it that way (`withheldWithoutCause`
 * has to stay at zero over the corpus). It exists so that the split the page
 * prints always sums to the total it prints beside it.
 */
function causeOf(verification: AnnexVerification, key: string): AnnexWithheldCause {
  return verification.withheldCauses[key] ?? 'standing'
}
