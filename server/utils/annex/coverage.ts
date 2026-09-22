/**
 * The left column against RIS: how much of what the annex prints as standing
 * law the standing law accounts for.
 *
 * PURE MODULE — relative imports only, so vitest runs it directly. First of
 * the three checks `annex/verdict.ts` runs over a §.
 */
import { normalizeText } from '../lawText'
import type { ComparisonRow } from '../textComparison'
import { comparableTokens } from './annexText'

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
/**
 * Below this many comparable words a § says nothing either way: a row that is
 * a heading plus "(1) bis (3) …" shows nothing of the provision on purpose,
 * so scoring it would measure the Rundschreiben rather than the parse.
 *
 * Measured, because every § under the floor is one the gate waves through
 * unexamined. Over the 1.040 §§ of the live corpus with any comparable words
 * (`annex-pdf-verify.ts --xml --calibrate`, 2026-09-09):
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
 * **`unchanged` rows are the third exclusion, and it is a decision rather than
 * a triviality** (measured 2026-09-11, docs/architecture.md §12.13). A row
 * printing the same text in both columns shows no change, but its left text
 * *is* on the page — folded behind „N Stellen unverändert", then printed —
 * and nothing here ever holds it against RIS. A mirrored row filed under the
 * wrong § is therefore invisible, which is what this note used to wave away
 * with "folded away behind a count".
 *
 * So the alternative was measured through these same functions over GP XXVIII,
 * scoring each §'s unchanged rows as a bag of their own (which cannot dilute
 * the changed rows, unlike one combined bag — that variant *frees* three §§ the
 * gate withholds today):
 *
 * | | unveränderte Zeilen | §§ mit Prosa | unter der Schwelle | neu einbehalten | davon heute bestätigt |
 * |---|---:|---:|---:|---:|---:|
 * | Tabellenpfad | 1.738 in 474 §§ | 330 | 11 |  — |  4 |
 * | PDF-Pfad     |   287 in 287 §§ | 129 | 33 | 33 |  0 |
 *
 * The table-path row is the state after `textComparison.heldTwoSided`
 * (11.09.2026): a two-sided heading row now becomes the *heading* of the § that
 * opens below it instead of a row of the § above, which took the class from 59
 * to 10. **When this was first measured it was 59 and 34, all 93 read one by
 * one, and 91 were the annex being right.** On the table path, 52 of 59 were
 * the law's own structural headings — Teil, Abschnitt,
 * Unterabschnitt, the lettered divisions of a Verordnung, the heading of the
 * *following* § — which stand *above* the § they head and were therefore filed
 * under the § before them (57 of the 59 failed on a row that carries no
 * designation of its own); 3 are the annex's own notation („Anlage 1
 * (wird hier nicht abgebildet)", „[entfällt durch ein früher in Kraft tretendes
 * Vorhaben]"); 1 is orthography (Konfitürenverordnung § 5, „In-Kraft-Treten"
 * against „Inkrafttreten"); and **2 were gaps in our own RIS reading**, closed the same evening
 * (`lawStructure` reads both RIS spellings of the closing clause) — StGB
 * § 321c and BMSVG § 28, where `lawStructure.plainText` ends an Absatz with its
 * enumeration and drops the clause after it („ist mit Freiheitsstrafe von einem
 * bis zu zehn Jahren zu bestrafen."), so the annex is quoting law the ruler
 * does not offer. That is the third time this project would have scored its own
 * gap as the ministry's. On the PDF path 33 of 34 were Inhaltsverzeichnis lines (the 34th the same
 * closing-clause gap, closed)
 * and Hauptstück headings, and every one of them sits in a § that shows **no
 * change at all**, so the rule would buy nothing a reader can see.
 *
 * **One case in the whole corpus is the real finding**: GTelG § 23, whose
 * unchanged rows print an Abs. 2 („über *Portale*", two Ziffern) that the
 * standing § does not have („über *Anwendungen*", no Ziffern) — a version
 * difference the page shows today as unchanged law. One true positive against
 * 54 confirmed §§ that would lose their whole word diff is not a rule this gate
 * may ship: rule 1's 5 table-path alarms are all true, rule 2's floors were set
 * precisely to keep 6 real contaminations apart from two-word false alarms.
 *
 * **What was expected to change the decision** was the heading filing, not a
 * threshold: no floor separates the classes (headings run 0–95 %, the real
 * cases 44–95 %), and at any floor of 20 comparable words nothing at all is
 * caught below 90 %. That half was right and the other half was not.
 * *Filing* a mirrored heading row under the § it heads buys almost nothing —
 * 63 → 62, because RIS's own § documents mostly carry no group headings either
 * (99 of the 111 rows still uncovered land on a § with an empty `context`).
 * What works is `lift` one level up: the row stops being a row and becomes the
 * § 's heading, which took the table path to **13 below the threshold, 10
 * newly withheld, 6 of them confirmed today** (docs/architecture.md §12.13,
 * 11.09.2026). The decision itself stands — one true positive against six
 * confirmations is still not a rule — but the residue is now small enough to
 * re-read. Until then the blind spot is stated rather than closed: fault **U** of
 * `scripts/annex-fault-injection.ts` injects exactly this row and the gate
 * catches **0 of 238** on the table path and **0 of 883** on the PDF path
 * (every alarm under the fault was already firing without it), and
 * `annex-pdf-verify.ts` prints the population on every run.
 *
 * One thing the injection did *not* settle in advance, and it is the sharper
 * half: a mirrored row is not merely unchecked, it is an **alibi**. Both
 * right-column rules exempt whatever stands in the left column
 * (`rightColumnCheck`), every pair row counts towards that, and fault U
 * silences a previously firing rule in 1 of 883 §§ of the PDF path. Rare, but
 * it is the direction in which this exclusion can cost rather than merely
 * miss.
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
