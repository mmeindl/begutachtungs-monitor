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
