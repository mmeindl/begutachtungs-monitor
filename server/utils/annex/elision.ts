/**
 * The annex's own "unchanged, left out" notation — a designation plus three
 * dots, per the BKA Rundschreiben of 27.03.2002.
 *
 * PURE MODULE — relative imports only, so vitest runs it directly. Read by
 * `annex/comparisonRows.ts` and by the PDF path in `annex/annexPdf.ts`.
 */

/** Any of the annex's three-dots marks, anywhere in the text. */
const ELISION_MARK_RE = /\.\.\.|…/

/**
 * The row's own words, with the annex's elision syntax taken out.
 *
 * Mirrors `ELISION_RE` in `annex/annexText.ts`, which discounts the same syntax
 * before scoring a row against the standing law. Deliberately duplicated
 * rather than imported: that module is about coverage against RIS, this one
 * about what a row *is*, and welding the two together would mean every future
 * change to one silently moves the other. Kept in step by hand — both mean
 * "designations joined by bis/und, closed by three dots".
 *
 * Written as a chain of removals rather than as one anchored alternation, and
 * that is not a style choice: `^(?:token|token|…)*$` over an alternation that
 * can match a single character backtracks catastrophically, and it hung on
 * the first 2.000-character row it met. Removing one kind of token at a time
 * is linear, and "is anything left" answers the same question.
 *
 * Ranges are printed with a hyphen as often as with "bis" ("(1) - (4) …"),
 * designations run to litterae ("a. bis d. …") and to Anlagen, and the
 * ressort's placeholder for a number it has not fixed yet is "xx"
 * ("1. bis xxx. …") — all measured over the 3.352 rows the old rule called
 * elided (2026-09-10).
 */
function withoutElision(text: string): string {
  return text
    .replace(/\.\.\.|…/g, ' ')
    .replace(/\b(?:bis|und|sowie|oder)\b/gi, ' ')
    .replace(/§+/g, ' ')
    .replace(/\b(?:Abs|Z|lit|Art|Artikel|Anlage|Anhang|Teil|Abschnitt|Unterabschnitt|Hauptstück|Kapitel)\b\.?/gi, ' ')
    .replace(/\d+[a-z]*(?:\.\d+)?/gi, ' ')
    .replace(/\b[a-z]{1,2}\s*[).]/gi, ' ')
    .replace(/\bx{2,4}\b/gi, ' ')
    .replace(/[()[\].,;:\-–—"'/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * A § heading may stand in front of the elision; a provision may not.
 *
 * On the PDF path a row is a whole §, so a § the annex leaves out entirely
 * reads "Kennzeichnung § 7. (1) bis (6) …" — the heading, then nothing. 80
 * characters is where the corpus stops printing headings and starts printing
 * law: below it the remainders are heading stacks ("2. Unterabschnitt Prüfung
 * der Angebote und Ausscheiden von Angeboten"), above it whole Absätze.
 * Dropping an unchanged Absatz because it happens to end in dots is the same
 * mistake as the old rule, one size smaller.
 */
const ELISION_HEADING_MAX = 80

/**
 * Is this row nothing but the annex's own "unchanged, left out" notation?
 *
 * Per the Rundschreiben unchanged stretches are abbreviated as a designation
 * plus three dots. The old test — both cells *end* in dots — was true of any
 * row whose last Absatz was elided, and on the PDF path a row is a whole §:
 * 919 of the 3.352 rows it called elided carried a change, and an elided row
 * is dropped by the UI and skipped by the RIS check, so those changes left no
 * trace while `stats.changed` still counted them (measured 2026-09-10). The
 * GAP-Strategieplan-Anwendungsverordnung lost a definition of Grünland and a
 * rate going from 20 % to 50 % that way.
 *
 * So: the row has to consist *solely* of elision syntax. The one text allowed
 * in front of it is a heading, and only when both columns print it
 * identically — a heading that differs is a change ("samt Überschrift") and
 * has to stay visible. That leaves 48 rows elided-and-changed, every one of
 * them a difference in the elision itself ("1. bis 59. …" against "1. bis
 * 60. …", "..." against "…") over columns that carry no comparable text.
 */
export function isElidedPair(current: string, proposed: string): boolean {
  if (!ELISION_MARK_RE.test(current) || !ELISION_MARK_RE.test(proposed)) return false
  const rest = withoutElision(current)
  if (rest === '' && withoutElision(proposed) === '') return digitRun(current) === digitRun(proposed)
  return current === proposed && rest.length <= ELISION_HEADING_MAX
}

/**
 * Both columns are the annex's own notation and they differ only in how far
 * it reaches: „(1) bis (54) …" against „(1) bis (55) …".
 *
 * The row is NOT elided — `isElidedPair` refuses it on the digits, and rightly
 * so, because a cell reducing to nothing can still say something („20 v.H."
 * against „50 v.H."). But where nothing is left but the notation, what changed
 * is the **Auslassung**, not the provision: the ressort leaves one Absatz more
 * or less out. Shown as a change of the § it reads „§ 906 geändert" over two
 * lines of dots, which is true of the annex and false of the law.
 *
 * Counted 26.09.2026 over 400 drafts: **13 rows** — 12 on the table path
 * (6.366 substantive rows) and one on the PDF path (2.990). Two of the twelve
 * differ in where the designation stands rather than in the range („(1) …"
 * against „§ 37. (1) …"); they read the same way and belong to the same
 * class.
 *
 * **The test is `printedStretches`, not `withoutElision`**, and the
 * difference is the whole safety of it: `withoutElision` deletes „v.H." along
 * with the dots, so „20 v.H. ... 2026" against „50 v.H. ... 2026" — a rate
 * going from a fifth to a half — would reduce to nothing and be filed as a
 * formality. `printedStretches` cuts only the designation chain that
 * introduces a mark and never the text behind the last one, so a cell that
 * prints anything of its own keeps it and stays a change.
 */
export function isElisionRangeOnly(current: string, proposed: string): boolean {
  if (!ELISION_MARK_RE.test(current) || !ELISION_MARK_RE.test(proposed)) return false
  if (printedStretches(current).length > 0 || printedStretches(proposed).length > 0) return false
  return digitRun(current) !== digitRun(proposed)
}

/**
 * Every digit of a row, in printed order — the one thing `withoutElision`
 * throws away that a reader may not lose.
 *
 * The branch above asks whether both cells consist of nothing BUT elision
 * syntax, and the syntax includes its own designations, so `withoutElision`
 * deletes the numbers along with the dots. Two cells can therefore reduce to
 * the same nothing while saying different things: "20 v.H. ... 2026" against
 * "50 v.H. ... 2026" is a rate going from a fifth to a half, and
 * "............ 500" against "............ 700" is an amount in a table — both
 * would be dropped by the UI and skipped by the RIS check, which is the same
 * silence the old „both cells end in dots" rule produced over 919 rows.
 *
 * The row stays elided only where the numbers agree; where they do not, it is
 * a changed row and has to be visible. The 48 rows §12.12 records as
 * elided-and-changed are differences in the elision itself ("1. bis 59. …"
 * against "1. bis 60. …"), and they now say so instead of vanishing.
 */
function digitRun(text: string): string {
  return (text.match(/\d+/g) ?? []).join('.')
}

/**
 * "§ 16 Abs. 1 bis 24 …" — a single § whose *Absätze* the annex leaves out.
 *
 * The subordinate unit is what makes the line a designation rather than a
 * range, and it is the whole guard: "§ 21. bis 25. …" and "§§ 1. bis 26. …"
 * leave out five and twenty-six §§ and open none of them, so reading § 21 or
 * § 1 out of them would hand the rows below to a provision the annex never
 * showed. `Ab.` is not a typo of ours — the Verbrechensopfergesetz annex
 * writes it that way.
 */
const ELISION_HEAD_RE = /^(§\s*\d+[a-z]*(?:\.\d+)?)\s*(?:Abs?|Z|lit)\b/

/**
 * The § an elision line opens, when it names one — null otherwise.
 *
 * The Rundschreiben's own notation: an unchanged stretch is abbreviated as a
 * designation plus three dots, so "§ 16 Abs. 1 bis 24 …" *is* the annex saying
 * that § 16 begins here and its first 24 Absätze are unchanged. Where the
 * ressort writes it that way it prints no `<gldsym>`, and the § went on being
 * the one above: in the Verbrechensopfergesetz annex the new § 16 Abs. 25 and
 * the new § 9b Abs. 6 went out under §§ 10 and 7c — two provisions under one
 * number. That annex is the whole population of GP XXVIII: 5 lines of this
 * shape out of 2.285 elided rows, and the other 121 readable annexes have
 * none (measured 2026-09-11).
 *
 * Only where **both columns print the same line**, because a one-sided
 * elision is a change to the elision itself and says nothing about where a §
 * starts.
 *
 * The full stop is put back on because the annex writes its designations with
 * one everywhere else ("§ 10." in the `<gldsym>`), and the § is grouped by
 * that string: without it the same § 10 would stand on the page twice, once
 * under each spelling.
 */
export function elisionOpens(current: string, proposed: string): string | null {
  if (current !== proposed) return null
  const head = ELISION_HEAD_RE.exec(current)
  return head ? `${head[1]!.replace(/\s+/g, ' ').trim()}.` : null
}

/**
 * The stretches a cell actually prints, with its elision runs taken out.
 *
 * `isElidedPair` above answers whether a whole row is nothing but the
 * notation. This answers the other half, and it is the half the PDF path
 * needs: there a row is a **whole §**, so the ressort leaves unchanged
 * stretches out *inside* it — „Landwirtschaftliche Fläche § 25. (1) und (2)
 * … (3) Grünland sind Flächen, …" is one provision with holes, not an
 * elided row. Over the 400 most recent Begut records (25.09.2026) 1.835 of
 * the PDF path's 2.950 substantive rows carry such a hole, in 84 of its 95
 * drafts; on the table path, where a row is an Absatz, 98 of 6.168 in 29 of
 * 118 drafts.
 *
 * A caller that needs the cell's words unbroken — `annexText.comparableTokens`
 * for the coverage bag — does not want this; a caller that compares the cell
 * against a running text does, because the holes make the cell a subsequence
 * of that text and never a substring of it (`kons/tguOracle.ts`).
 *
 * **A stretch loses the designation chain that introduces the dots, and only
 * there.** „(2) bis (4) …" abbreviates three Absätze: „bis" is not law text
 * and „(4)" names what is missing rather than showing it. The chain is taken
 * off a stretch a mark FOLLOWS, never off the last one — a cell ending in
 * „… gemäß § 5 Abs. 3" ends in law, not in an announcement. That is what
 * keeps this a generalisation: a cell without a mark comes back whole, so
 * every row that reads correctly today reads identically.
 *
 * Same notation as `withoutElision`, and again written out rather than
 * imported: that function asks whether anything is left, this one where the
 * cuts are, and a shared regex would have to answer both. Kept in step by
 * hand — designations joined by bis/und, closed by three dots, and the
 * brackets some ressorts put around them („[…]", GAP-Strategieplan).
 */
const ELISION_RUN_RE = /\[\s*(?:\.{2,}|…+)\s*\]|\.{2,}|…+/g
const DESIGNATION_TOKEN = String.raw`(?:\(\s*\d+[a-z]*\s*\)|\d+[a-z]*(?:\.\d+)?\.?|[a-z]{1,2}[).]|x{2,4}\.?)`
const DESIGNATION_PART = String.raw`(?:§+\s*)?(?:(?:Abs|Z|lit|Art|Artikel|Anlage|Anhang|Teil|Abschnitt|Unterabschnitt|Hauptstück|Kapitel)\b\.?\s*)?${DESIGNATION_TOKEN}`
/** „bis", „und" — or a plain space, which is how a compound designation joins („(5) Z 1 …"). */
const DESIGNATION_JOIN = String.raw`(?:\s*(?:bis|und|sowie|oder|,|[-–—])\s*|\s+)`
/**
 * The chain at the end of a stretch, anchored at a word boundary and bounded
 * in length — both deliberately. Without `(?:^|\s)` the chain would eat the
 * last two letters of „Förderwerber." as a litera; without the `{0,8}` an
 * unbounded run of an optional unit backtracks, which is the trap
 * `withoutElision` records one function above.
 */
const ELISION_HEAD_RE_TAIL = new RegExp(String.raw`(?:^|\s)${DESIGNATION_PART}(?:${DESIGNATION_JOIN}${DESIGNATION_PART}){0,8}\s*$`, 'i')

export function printedStretches(text: string): string[] {
  const out: string[] = []
  let at = 0
  ELISION_RUN_RE.lastIndex = 0
  for (let mark = ELISION_RUN_RE.exec(text); mark; mark = ELISION_RUN_RE.exec(text)) {
    out.push(text.slice(at, mark.index).replace(ELISION_HEAD_RE_TAIL, ''))
    at = mark.index + mark[0].length
  }
  out.push(text.slice(at))
  return out.map((s) => s.trim()).filter((s) => s !== '')
}
