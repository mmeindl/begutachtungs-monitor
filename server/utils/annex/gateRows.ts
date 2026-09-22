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
import type { AnnexVerification } from './verdict'

/**
 * The one sentence fragment the page needs when the check produced no verdict
 * at all — null when it produced one.
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
   * are unchanged is folded away behind a count, and a § the draft *inserts*
   * has no standing text to check against — that is the point of it, not a
   * gap. The number the page prints has to mean "this much of what you see is
   * unvouched-for", or it reads as an alarm about the ministry's annex.
   */
  uncheckedParagraphs: number
  /**
   * Rows the page shows as a change that carry no § designation at all, so no
   * § verdict can address them. Shown as `unchecked`.
   *
   * A property of the table path only. Measured 2026-09-10: it emits 285 rows
   * without a designation, 83 of them shown as a change. On the PDF path a
   * row *is* a provision — it is cut at the § marker — so a unit without one
   * is the annex's front matter, and since 2026-09-10 the parser drops it
   * instead of emitting it as new law (`annexPdf.ts`, `AnnexParse.unplaced`).
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
export function checkAnnexRows(rows: readonly ComparisonRow[], verification: AnnexVerification): CheckedComparison {
  let rowsWithoutParagraph = 0
  /** §§ the page shows at least one change for — the only ones a check is owed. */
  const showsChange = new Set<string>()
  for (const row of rows) {
    if (row.kind !== 'pair' || !isDisplayedChange(row)) continue
    const para = row.gld ?? row.para
    if (para !== null) showsChange.add(annexParagraphKey(row.law, para))
  }
  const out: TextComparisonRow[] = rows.map((row) => {
    // An Artikel heading is a divider, not law text: nothing to check, and
    // nothing to vouch for either.
    if (row.kind !== 'pair') return { ...row, check: 'unchecked' as const }
    const para = row.gld ?? row.para
    if (para === null) {
      if (isDisplayedChange(row)) rowsWithoutParagraph++
      return { ...row, check: 'unchecked' as const }
    }
    const key = annexParagraphKey(row.law, para)
    const verdict = verification.verdicts[key] ?? 'unchecked'
    if (verdict !== 'withheld') return { ...row, check: verdict }
    // The cause travels with the row, because the notice that replaces the
    // text stands inside the § and has to name what was found there.
    return { ...row, current: '', proposed: '', segments: null, check: 'withheld' as const, withheldCause: causeOf(verification, key) }
  })
  const withheldByCause: Record<AnnexWithheldCause, number> = { standing: 0, alreadyStanding: 0, notInDraft: 0 }
  for (const [key, verdict] of Object.entries(verification.verdicts)) {
    if (verdict === 'withheld') withheldByCause[causeOf(verification, key)]++
  }
  return {
    rows: out,
    stats: summarizeComparison(out.filter((r) => r.check !== 'withheld')),
    withheldParagraphs: Object.values(verification.verdicts).filter((v) => v === 'withheld').length,
    withheldByCause,
    uncheckedParagraphs: [...showsChange].filter((key) => (verification.verdicts[key] ?? 'unchecked') === 'unchecked').length,
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
