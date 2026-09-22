/**
 * The left column against RIS: how much of what the annex prints as standing
 * law the standing law accounts for.
 *
 * PURE MODULE — relative imports only, so vitest runs it directly. First of
 * the three checks `annex/verdict.ts` runs over a §.
 */
import { normalizeText } from '../lawtext/normalize'
import type { ComparisonRow } from './comparisonRows'
import { comparableTokens } from './annexText'

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
/**
 * Below this many comparable words a § says nothing either way: a row that is
 * a heading plus "(1) bis (3) …" shows nothing of the provision on purpose,
 * so scoring it would measure the Rundschreiben rather than the parse.
 *
 * Measured, because every § under the floor is one the gate waves through
 * unexamined. Over the 1.040 §§ of the live corpus with any comparable words
 * (`pnpm harness:annex -- --xml --calibrate`, 2026-09-09):
 *
 * | Wörter | §§  | ≥ 95 % |
 * |--------|-----|--------|
 * | 1–4    |  10 |   50 % |
 * | 5–14   |  66 |   89 % |
 * | 15–∞   | 964 |   87 % |
 *
 * The 5–14 band verifies at the same rate as the whole corpus, so those §§
 * are evidence and belong inside the gate; the floor of 15 was inherited
 * from scoring single *rows* and excused 66 of them, seven wrongly. The 1–4
 * band is noise: with four words one missing word is 75 %, and half the band
 * falls short. Hence five.
 */
export const MIN_PROSE_TOKENS = 5

/**
 * A § whose displayed changes fall below this share of coverage is not shown.
 * Calibrated on the live corpus, where the per-§ distribution runs median
 * 100 %, p25 100 %, p10 98 %: the band between 0.95 and 0.99 is hyphenation,
 * footnotes and stray designations, while everything genuinely mis-paired
 * sits far below — 29 of the 45 failures are under 50 %. Drawing the line at
 * 0.99 would withhold about 60 sound §§ to catch nothing extra.
 */
export const PARAGRAPH_THRESHOLD = 0.95

export interface Coverage {
  /** Share of the column's comparable words found in the standing text, 0–1 */
  ratio: number
  /** Words the standing text does not have, for the report */
  missing: string[]
  /** How many comparable words the column carried */
  comparable: number
  /**
   * Enough prose to be evidence either way.
   *
   * A `verified` field used to stand beside this one, computed as `!prose ||
   * ratio >= PARAGRAPH_THRESHOLD` — "passed, or nothing to judge". That is
   * the conflation the gate was built on and got wrong: a § nobody could
   * judge left the service labelled *geprüft*. Callers read `prose` and
   * `ratio` separately now, so the three states stay three.
   */
  prose: boolean
}

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
/**
 * How much of `column` the `standing` text accounts for.
 *
 * A bag test, deliberately: the annex breaks lines where the layout demands
 * and RIS where the structure does, so word order is not evidence. What it
 * catches is the case that matters — a column belonging to another provision
 * shares almost no vocabulary with this one.
 */
export function coverageOf(column: string, standing: string): Coverage {
  const want = comparableTokens(normalizeText(column))
  const have = new Set(comparableTokens(normalizeText(standing)))
  const missing = want.filter((w) => !have.has(w))
  const ratio = want.length === 0 ? 1 : 1 - missing.length / want.length
  return { ratio, missing, comparable: want.length, prose: want.length >= MIN_PROSE_TOKENS }
}

/**
 * The rows whose left column the page presents as a change.
 *
 * An `inserted` row has no left column to check — the provision it proposes
 * does not exist in the standing law, which is the point of it. An `elided`
 * row is the annex saying it left text out.
 *
 * **`unchanged` rows are the third exclusion, and it is a decision rather
 * than a triviality** (measured 2026-09-11, docs/architecture.md §12.13). A
 * row printing the same text in both columns shows no change, but its left
 * text *is* on the page — folded behind „N Stellen unverändert", then printed
 * — and nothing here ever holds it against RIS, so a mirrored row filed under
 * the wrong § is invisible.
 *
 * **Rejected, after measuring it through these same functions over
 * GP XXVIII:** scoring each §'s unchanged rows as a bag of their own would
 * newly withhold 33 §§ of the PDF path and 10 of the table path, of which 6
 * are confirmed today; 91 of the 93 cases first read one by one were the
 * annex being right (structural headings standing *above* the § they head,
 * the annex's own notation, one orthography) and 2 were gaps in our own RIS
 * reading, closed the same evening (`lawtext/konsTree.ts` reads both
 * spellings of the closing clause). The variant of one *combined* bag is
 * rejected twice over: it dilutes the changed rows and frees three §§ the
 * gate withholds today.
 *
 * **One case in the whole corpus is the real finding** — GTelG § 23, whose
 * unchanged rows print an Absatz the standing § does not have. One true
 * positive against 54 confirmed §§ that would lose their whole word diff is
 * not a rule this gate may ship.
 *
 * **Also measured and rejected:** a floor of comparable words separates
 * nothing (headings run 0–95 %, the real cases 44–95 %, and at a floor of 20
 * nothing at all is caught below 90 %), and *filing* a mirrored heading row
 * under the § it heads buys 63 → 62, because RIS's own § documents mostly
 * carry no group headings either. What did work is lifting such a row out of
 * the rows entirely, into the §'s heading (`annex/comparisonRows.ts`,
 * `heldTwoSided`, 11.09.2026).
 *
 * Until the residue is re-read the blind spot is stated rather than closed:
 * fault **U** of `scripts/harness/faultInjection.ts` injects exactly this row
 * and the gate catches **0 of 238** on the table path and **0 of 883** on the
 * PDF path, and `pnpm harness:annex` prints the population on every run. The
 * sharper half the injection did not settle in advance: a mirrored row is not
 * merely unchecked, it is an **alibi** — both right-column rules exempt
 * whatever stands in the left column (`rightColumnCheck`), and fault U
 * silences a previously firing rule in 1 of 883 §§ of the PDF path.
 */
export function isDisplayedChange(row: ComparisonRow): boolean {
  return row.kind === 'pair' && !row.elided && row.current.length > 0 && (row.change === 'changed' || row.change === 'removed')
}

export function displayedChangeRows(rows: readonly ComparisonRow[]): ComparisonRow[] {
  return rows.filter(isDisplayedChange)
}

/**
 * Coverage of every displayed change of one § at once.
 *
 * Per § rather than per row, because the annex splits one provision over as
 * many rows as its layout needs: a single Absatz continued on the next row
 * would score twice, and a row carrying six words would drag a sound §
 * below the line on its own.
 */
export function coverageOfParagraph(rows: readonly ComparisonRow[], standing: string): Coverage {
  return coverageOf(displayedChangeRows(rows).map((r) => r.current).join(' '), standing)
}
