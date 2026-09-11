/**
 * The ministry's own Textgegenüberstellung (docs/api-exploration.md §2c).
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * A Ministerialentwurf routinely carries an annex that already does what the
 * amendment engine tries to compute: the standing law and the proposed law
 * side by side, written and marked by the ressort itself. It is regulated by
 * a BKA Rundschreiben of 27.03.2002 — two columns headed "Geltende Fassung"
 * and "Vorgeschlagene Fassung", unchanged stretches abbreviated as a
 * designation plus three dots.
 *
 * Where it exists, it is a better source than anything derived: official,
 * paragraph-paired, and incapable of inventing law text. RIS publishes it as
 * XML; Parliament only as PDF, so this reads RIS.
 *
 * **This module reads the XML table only.** Where RIS rasterised the annex
 * into `<binary datatype="gif">` — 114 of the 240 GP-XXVIII annexes — the
 * same document's PDF still carries a full text layer, and `annexPdf.ts`
 * reads it from the page geometry. `isScanned` tells the two apart and the
 * caller picks the path (`textComparisonService.ts`); this one returns an
 * empty list for a rasterised document, which must be read as "not
 * available", never as "nothing changed". Both parsers emit `ComparisonRow`,
 * so everything downstream is the same for both (api-exploration §2c).
 */
import { candidateOf, headingOf, resolveBoundaries, type BoundaryCandidate } from './annexBoundaries'
import { diffTokens, isEditorialChange } from './lawDiff'
import { normalizeText, stripMarkup } from './lawText'
import type { DraftArticle } from './lawTitles'
import { decodeEntities } from './mappers'
import type { LawDiffSegment } from '../../shared/types'

/** How one row of the comparison differs. */
export type ComparisonChange = 'unchanged' | 'changed' | 'inserted' | 'removed'

export interface ComparisonRow {
  /** An Artikel heading spanning both columns, or a paired row of law text */
  kind: 'article' | 'pair'
  /**
   * Which law of the package the row belongs to — `segmentUnits`' article key,
   * so it joins onto the diff units and onto `promulgationByArticle`. Null
   * when the draft amends one law only, and null when the annex does not mark
   * its boundaries at all: § 5 of the second law is a different provision
   * from § 5 of the first, and guessing which is worse than not saying.
   */
  law: string | null
  /** Text of an article row */
  heading: string | null
  /** "§ 5." when the row *opens* a paragraph; null for a row that continues one */
  gld: string | null
  /**
   * The § the row belongs to — its own designation, or the one inherited from
   * the row that opened the paragraph.
   *
   * The annex prints one row per Absatz, so two thirds of the rows open no
   * paragraph of their own: 66 of 100 in one annex, 37 of them carrying a
   * change. Those read as "geändert" over a text beginning "(26) Für das
   * Inkrafttreten …", with nothing to say which § that is. `gld` cannot carry
   * it — "does this row open a paragraph" is a different question, and the
   * oracle's heading detection depends on the difference.
   */
  para: string | null
  current: string
  proposed: string
  change: ComparisonChange
  /** The ressort's own yellow marking on the proposed side */
  marked: boolean
  /**
   * "2. bis 26b. …" — unchanged text the annex deliberately leaves out, per
   * the Rundschreiben. Not a gap in the parse, and not something to diff.
   */
  elided: boolean
  /** Word-level diff for a changed row; null when unchanged, one-sided or too long */
  segments: LawDiffSegment[] | null
  /**
   * Changed, but only in citations, numbers, dates or punctuation — the same
   * filter the ME→RV comparison uses, so both sections mean the same thing by
   * "geändert".
   */
  editorial: boolean
}

/**
 * Removed before anything is read.
 *
 * `<inhaltsvz>` is the law's **table of contents**, and RIS names it as such.
 * Annexes reprint it, and it is a two-column table of its own — "Paragraf" and
 * "Gegenstand". Flattened into the comparison, those two columns landed under
 * "Geltende Fassung" and "Vorgeschlagene Fassung", so the page reported that
 * the draft changes "§ 21." into "Registrierungs- und Meldepflichten für
 * Abfälle": 222 rows across 23 of the 65 readable annexes, every one of them
 * marked "geändert" (measured 2026-09-09). Not a display problem — an invented
 * change, in the one section whose whole justification is that it cannot
 * invent law text. The Inhaltsverzeichnis is its own RIS document and no part
 * of any comparison.
 */
const STRIP = [
  /<kzinhalt[\s\S]*?<\/kzinhalt>/g,
  /<fzinhalt[\s\S]*?<\/fzinhalt>/g,
  /<layoutdaten[\s\S]*?<\/layoutdaten>/g,
  /<inhaltsvz[\s\S]*?<\/inhaltsvz>/g,
]
/**
 * The row's designation is the **Gliederungssymbol** only. `<symbol>` is the
 * marker of a list item, and reading it as the row's designation printed
 * "geändert 1." where 1. is a Ziffer inside a running Absatz — it reads like
 * a paragraph and is none. A row that opens with a Ziffer carries no
 * designation of its own, and saying nothing is right.
 */
const GLD_RE = /<gldsym\b[^>]*>([\s\S]*?)<\/gldsym>/
const COLSPAN_RE = /colspan="(\d+)"/i
const MARK_RE = /background\s*:\s*yellow/i

/**
 * The mandated column headings, in the wordings the corpus actually prints.
 *
 * The Rundschreiben says "Geltende Fassung" and "Vorgeschlagene Fassung", and
 * 111 of the 114 GP-XXVIII PDF annexes print exactly that. The other three
 * qualify or rename it — "Geltende Fassung nach Inkrafttreten EuGB-VVG",
 * "Geltender Text"/"Vorgeschlagener Text" — and an exact-equality test read
 * those as ordinary law text (2026-09-10). The XML side is uniform: 129
 * header cells, all "Geltende Fassung".
 */
export const HEADER_CURRENT_RE = /^geltende[rn]?\s+(?:fassung|text)\b/i
export const HEADER_PROPOSED_RE = /^vorgeschlagene[rn]?\s+(?:fassung|text)\b/i

/** Any of the annex's three-dots marks, anywhere in the text. */
const ELISION_MARK_RE = /\.\.\.|…/

/**
 * The row's own words, with the annex's elision syntax taken out.
 *
 * Mirrors `ELISION_RE` in `annexCheck.ts`, which discounts the same syntax
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
  if (rest === '' && withoutElision(proposed) === '') return true
  return current === proposed && rest.length <= ELISION_HEADING_MAX
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
function elisionOpens(current: string, proposed: string): string | null {
  if (current !== proposed) return null
  const head = ELISION_HEAD_RE.exec(current)
  return head ? `${head[1]!.replace(/\s+/g, ' ').trim()}.` : null
}

/**
 * A cell's own words.
 *
 * The block/inline distinction lives in `lawText.stripMarkup`, shared with the
 * two texts this one is scored against, and it is what keeps a marked word in
 * one piece: the ressorts mark the changed *characters* in yellow, so
 * `Schlepplifte<i><span style="background:yellow">n</span></i>,` used to come
 * out as "Schlepplifte n," — two tokens the standing § does not have, and the
 * § was withheld for our own reading of it. The same rule inside a `<gldsym>`
 * is what made "§ 322" read as "§ 32" (2026-09-10); the designation needs no
 * reading of its own since 2026-09-11.
 *
 * What stays a space here on top of the block tags: `<br/>` (a line break the
 * ressort typesets between a heading and its title), `<nbsp/>`, and the
 * closing tag of a marker — RIS prints "<symbol>1.</symbol>Altersprädikat"
 * with nothing between, so the number would fuse into the first word.
 */
function cellText(html: string): string {
  return normalizeText(
    decodeEntities(
      stripMarkup(
        html
          .replace(/<nbsp\s*\/>/g, ' ')
          .replace(/<gdash\s*\/>/g, '-')
          .replace(/<br\s*\/?>/gi, ' ')
          .replace(/<\/(?:gldsym|symbol)>/g, '$& '),
      ),
    ),
  )
}

/**
 * Is this document a real table, or a scan? 40 % of the annexes are pages of
 * GIFs wrapped in XML, and telling them apart matters: an empty result must
 * read as "no comparison available", never as "nothing changed".
 */
export function isScanned(xml: string): boolean {
  return !/<tr\b/.test(xml) && /<binary\b/.test(xml)
}

/**
 * A structural division of the law — "3. Abschnitt", "Abschnitt XI",
 * "2. Hauptstück", "7. Teil", with or without its title on the same line.
 *
 * Keyed on the vocabulary, and deliberately not on the shape of the line.
 * The obvious test — short, and without a closing full stop — matches 2.100
 * of the mirrored rows in GP XXVIII, and most of those are law text: an
 * Absatz that introduces a list ends in "dass", a Ziffer in a comma, a
 * litera in nothing at all. Lifting those out of the comparison would
 * delete law text from it, which is worse than the misfiling it fixes. The
 * vocabulary matches 210 rows, and every one is a division.
 *
 * The numeral is what makes it a division rather than a sentence that opens
 * with the same word: it stands either before the keyword ("3. Abschnitt")
 * or after it ("Abschnitt XI"), never neither. Without that test, "Teil der
 * Anlage ist die Beschreibung der Verfahren" reads as a heading and its text
 * leaves the comparison. The length cap is the same guard once more.
 */
const DIVISION_WORD = '(?:Abschnitt|Unterabschnitt|Hauptstück|Teil|Kapitel)'
const DIVISION_RE = new RegExp(`^(?:\\d+[a-z]*\\.\\s*${DIVISION_WORD}\\b|${DIVISION_WORD}\\s+(?:[IVXL]+|\\d+[a-z]*)\\b)`, 'i')
const DIVISION_MAX = 60

/**
 * Where an Anlage or Anhang begins — the one division that ends the paragraph
 * sequence instead of subdividing it.
 *
 * A § continues across an Abschnitt or a Hauptstück, so those leave the open
 * designation alone. A schedule does not: what stands under "Anhang" is
 * addressed as the Anlage, and everything the annex prints there carries no §
 * of its own. The rows inherited the last § before the schedule all the same
 * — in the VerKRÄG annex fourteen rows of the Anhang went out as § 14 of the
 * Verbraucherbehördenkooperationsgesetz, which the RIS check then withheld
 * with "der geltende Text dieser Stelle steht so nicht im RIS": true of § 14,
 * and false about the annex, which never claimed they were § 14. Measured
 * 2026-09-10 over the 400 most recent RIS-Begut records (126 readable XML
 * annexes): 951 rows in 61 schedules, 230 of them shown as a change.
 *
 * The schedule's own line becomes the designation rather than null, and that
 * is the point of doing it here: 213 of those 230 rows now carry a
 * designation RIS can be asked about ("Anlage 1" → `Anl. 1`), where before
 * they were scored against the § in front of the schedule. Where the line
 * names no numeral ("Anhang"), `designationKey` reads nothing and the rows
 * stay unchecked — which is what they were owed.
 *
 * Two tests, because both occur. `typ="anlage"` is RIS's own markup and says
 * it outright; it also sits on the subtitle lines beneath such a heading, and
 * resetting on those is harmless because the schedule is already open. The
 * wording is the fallback for the twelve rows in that window that open a
 * schedule without the markup ("Anlage 1", "ANHANG I"), and it carries the
 * same length cap as the division rule: a provision that merely starts with
 * the word "Anhang" is longer than a heading.
 */
const ANLAGE_TYP_RE = /<ueberschrift\b[^>]*\btyp="anlage"/i
const ANLAGE_TEXT_RE = /^(?:Anlage|Anhang)\b/i

function opensAnlage(text: string, html: string): boolean {
  if (ANLAGE_TYP_RE.test(html)) return true
  return text.length <= DIVISION_MAX && ANLAGE_TEXT_RE.test(text)
}

/** The § heading a cell carries, when it holds one. */
const PARA_HEADING_RE = /<ueberschrift\b[^>]*\btyp="para"[^>]*>([\s\S]*?)<\/ueberschrift\s*>/

function paraHeading(html: string): string | null {
  const m = PARA_HEADING_RE.exec(html)
  const text = m ? cellText(m[1]!) : ''
  return text || null
}

function stripParaHeading(html: string): string {
  return html.replace(PARA_HEADING_RE, ' ')
}

/** A heading of any level, not only a §'s own. */
const HEADING_RE = /<ueberschrift\b[^>]*>[\s\S]*?<\/ueberschrift\s*>/g

/**
 * Is this column nothing but heading?
 *
 * Asked of RIS's own markup rather than of the shape of the line, the same
 * discriminator `isTableContent` uses and for the same reason: a short line
 * without a closing full stop is as often a Ziffer as a heading. It costs
 * nothing here — of the 297 one-sided heading rows in GP XXVIII, RIS types
 * every single one as `<ueberschrift>`, and none has to be recognised from
 * its wording (measured 2026-09-11).
 */
function headingOnly(html: string): boolean {
  if (!/<ueberschrift\b/i.test(html)) return false
  return cellText(html.replace(HEADING_RE, ' ')) === ''
}

const GLD_ALL_RE = /<gldsym\b[^>]*>([\s\S]*?)<\/gldsym>/g

/**
 * Take the row's own designation out of the column's text — and only that one.
 *
 * A designation is data rather than prose and is already carried in `gld`, so
 * leaving it in the text as well printed it twice (below). But a row can carry
 * **two** designations, one per column, and then only one of them is the row's:
 * where a draft renumbers a provision the annex writes the standing "§ 7." on
 * the left and the proposed "§ 8." on the right, in one and the same row. The
 * row is filed under the left one — that is the § the RIS check holds the left
 * column against — and stripping every `<gldsym>` then deleted the second
 * number from the page altogether: neither a badge nor a word, so the reader
 * saw two provisions under one number with nothing to say so.
 *
 * 42 rows of GP XXVIII carry two designations that differ (2026-09-11), and
 * they are renumberings almost to the row: B-VG Art. 90a→94a, the
 * Konfitürenverordnung § 7→§ 8, the Strafregistergesetz § 2→§ 1a, the
 * Blutspenderverordnung shifting §§ 9 to 14 down by one. The second
 * designation now stays where the ressort printed it, inside its column's
 * text, and the word diff shows it as what it is — a change to the number.
 */
function stripGld(html: string, own: string | null): string {
  return html.replace(GLD_ALL_RE, (all, inner: string) => (own !== null && cellText(inner) === own ? ' ' : all))
}

/**
 * Elements of one kind at the outermost nesting level, as their inner HTML.
 *
 * A non-greedy `<tr>…</tr>` regex stops at the *first* closing tag, so a row
 * containing a nested table was cut off at the inner table's first row and the
 * inner rows were then read as siblings of the outer one. 17 of the 65
 * readable annexes nest tables — 70 tables over 584 rows — and each of them
 * lost around 140 rows that way (measured 2026-09-09).
 */
interface Element {
  attrs: string
  inner: string
  /** Where the inner HTML starts — the document order the rest of the parse sorts on. */
  at: number
  /** Where the opening tag starts and the closing tag ends, for cutting the element out. */
  open: number
  close: number
}

function outermost(html: string, tag: string): Element[] {
  const re = new RegExp(`<(/?)${tag}\\b([^>]*)>`, 'gi')
  const out: Element[] = []
  let depth = 0
  let start = -1
  let open = -1
  let attrs = ''
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const closing = m[1] === '/'
    const selfClosing = /\/\s*$/.test(m[2] ?? '')
    if (!closing && selfClosing) continue
    if (closing) {
      depth--
      if (depth === 0 && start >= 0) {
        out.push({ attrs, inner: html.slice(start, m.index), at: start, open, close: m.index + m[0].length })
        start = -1
      }
      if (depth < 0) depth = 0
      continue
    }
    if (depth === 0) {
      start = m.index + m[0].length
      open = m.index
      attrs = m[2] ?? ''
    }
    depth++
  }
  return out
}

/** Does this table open with the mandated header pair? Then it *is* a comparison. */
function isComparisonTable(inner: string): boolean {
  const first = outermost(inner, 'tr')[0]
  if (!first) return false
  const cells = outermost(first.inner, 'td')
  if (cells.length < 2) return false
  return HEADER_CURRENT_RE.test(cellText(cells[0]!.inner)) && HEADER_PROPOSED_RE.test(cellText(cells[1]!.inner))
}

/** A comparison has two columns. A wider table is one the law itself contains. */
function widerThanAComparison(inner: string): boolean {
  return outermost(inner, 'tr').some((r) => outermost(r.inner, 'td').length > 2)
}

/**
 * A table the *law* contains, rendered as text: cells joined by " | ", rows by
 * a space. Empty cells and empty rows drop out, or the spacer tables some
 * annexes use for vertical rhythm would print "| | |" into the provision.
 *
 * Kept as HTML fragments with literal separators between them rather than as
 * finished text, so `cellText` still decodes each entity exactly once.
 */
function flattenTable(inner: string): string {
  return outermost(inner, 'tr')
    .map((row) =>
      outermost(row.inner, 'td')
        .map((cell) => flattenCell(cell.inner))
        .filter((html) => cellText(html) !== '')
        .join(' | '),
    )
    .filter((row) => row !== '')
    .join(' ')
}

function flattenCell(cellInner: string): string {
  return liftTables(cellInner, false).text
}

/**
 * For each cell of a row: does every *other* cell hold no text? Then this one
 * covers the whole width, and a table inside it is the layout case above.
 *
 * `cellText` on the raw HTML is enough — it strips every tag, so a cell whose
 * only content is a nested table reads as that table's text, which is exactly
 * the question. Flattening first would give the same answer for twice the work.
 */
function coversTheWidth(cells: readonly Element[]): boolean[] {
  const filled = cells.map((c) => cellText(c.inner) !== '')
  return cells.map((_, i) => filled.every((f, j) => j === i || !f))
}

/**
 * A cell's own content, with any table it contains either lifted out into the
 * row sequence or flattened into the cell's text.
 *
 * Some annexes wrap the whole comparison in an outer table for page layout:
 * one row, one full-width cell, the comparison inside it. Those inner rows are
 * the comparison — 53 rows in one annex, 90 in another — and reading only the
 * outer table lost every one of them, so they are lifted into the sequence at
 * the position where they stood.
 *
 * **But most nested tables are not that.** Where the wrapper row's *other*
 * cell carries text of its own, the row is already a comparison row and the
 * table sits inside one of its two columns: it is a table of the law's own,
 * and its columns are not "geltend" and "vorgeschlagen". Lifting those
 * fabricated changes — the Finanzausgleichsgesetz § 11 reported
 * "Grunderwerbsteuer" turning into "5,702 0,556 93,742", the
 * Fruchtsaftverordnung produced 158 changed rows out of a "Fruchtnektar aus |
 * Mindestgehalt" table, and the Universitätsfinanzierungsverordnung 672 rows
 * out of an ISCED code list (2026-09-10).
 *
 * So `alone` is the test, and it is the same structural question the parse
 * asks of every row: does this cell cover the whole width, or one column? A
 * wrapper cell whose siblings are empty covers the width — the ABGB annex
 * writes exactly that, `<td colspan="2">` with the comparison inside and an
 * empty cell beside it, and a rule keyed on "one cell in the row" lost the
 * new § 1159 Abs. 6 from it. A nested table that prints the header pair
 * itself is a comparison whatever wraps it; one wider than two columns is
 * content whatever wraps it, because a comparison has two columns.
 *
 * **The width test alone is not enough for the header-less half** (measured
 * 2026-09-10 over the 2.000 most recent RIS-Begut records, 403 of them with a
 * readable XML annex). That branch fires on 73 nested tables, and it has to:
 * 6 of them carry §§ of their own — the ABGB's § 1159 among them — and others
 * hold an Artikel line or an Abschnitt that divides the comparison. But 18
 * are two-column tables *of the law*, sitting alone in a cell, and their two
 * columns were read as "geltend" against "vorgeschlagen": "Attribut | Wert"
 * from the Bildungsdokumentation, "Gattung oder Art | Schadorganismen" from
 * the Pflanzgutverordnung, "Module | ECTS-Anrechnungspunkte" from the
 * Hochschul-Curriculaverordnung — whose annex consists of nothing else, so
 * all 19 of its rows were invented changes and it now reports itself
 * unreadable instead.
 *
 * `isTableContent` refuses those, and it asks RIS's own markup rather than
 * guessing at the shape: `<absatz typ="tabtext…">` is how RIS types the text
 * of a table cell, and it is never how it types a provision. Every one of the
 * 18 is caught and none of the 6 comparisons is, so the discriminator has no
 * overlap with the real comparisons in the corpus; 128 rows shown as
 * "geändert" go away with them (9.819 → 9.691 over that window, 3.057 →
 * 3.037 over the 400 most recent records).
 */
function liftTables(cellInner: string, alone: boolean): { text: string; tables: string[] } {
  const tables = outermost(cellInner, 'table')
  if (tables.length === 0) return { text: cellInner, tables: [] }
  const lifted: string[] = []
  const kept: string[] = []
  let at = 0
  for (const table of tables) {
    kept.push(cellInner.slice(at, table.open))
    const lift = isComparisonTable(table.inner) || (alone && !widerThanAComparison(table.inner) && !isTableContent(table.inner))
    if (lift) lifted.push(table.inner)
    else kept.push(flattenTable(table.inner))
    at = table.close
  }
  kept.push(cellInner.slice(at))
  return { text: kept.join(' '), tables: lifted }
}

/** RIS's own type for the text of a table cell; a provision never carries it. */
const TABTEXT_RE = /<absatz\b[^>]*\btyp="tabtext/i
/** What a provision carries instead: a designation, a heading, or a typed Absatz. */
const PROVISION_MARKUP_RE = /<gldsym\b|<ueberschrift\b|<absatz\b[^>]*\btyp="(?!tabtext)/i

/**
 * Is this table content of the law rather than a comparison?
 *
 * Only asked of a table that does *not* print the mandated header pair, so
 * the question is genuinely open: without the header, nothing but the markup
 * says whether the two columns are the law's own or the annex's. Every
 * non-empty cell has to be typed as table text and none of them as a
 * provision — one Absatz, one heading or one Gliederungssymbol anywhere in it
 * is enough to leave the table alone, because the cost of refusing a real
 * comparison (its §§ vanish from the page) is worse than the cost of
 * flattening a data table (its cells read as "Zelle | Zelle" in both columns,
 * where the word diff still compares them).
 */
function isTableContent(inner: string): boolean {
  let cells = 0
  for (const row of outermost(inner, 'tr')) {
    for (const cell of outermost(row.inner, 'td')) {
      if (cellText(cell.inner) === '') continue
      if (PROVISION_MARKUP_RE.test(cell.inner) || !TABTEXT_RE.test(cell.inner)) return false
      cells++
    }
  }
  return cells > 0
}

/**
 * Every row of the document in printed order, nested tables flattened in place.
 *
 * `at` is the position of the *outermost* row a nested one sits in, so that
 * document-level headings can be merged into the sequence without disturbing
 * the order of rows that came out of one table together.
 */
function rowsInOrder(html: string, at?: number): Element[] {
  const out: Element[] = []
  for (const row of outermost(html, 'tr')) {
    const pos = at ?? row.at
    const cells = outermost(row.inner, 'td')
    const wide = coversTheWidth(cells)
    const nested = cells.flatMap((c, i) => liftTables(c.inner, wide[i]!).tables)
    // The wrapper row itself may hold nothing but the inner table; it then
    // contributes no text and falls out of the parse on its own.
    out.push({ ...row, at: pos })
    for (const table of nested) out.push(...rowsInOrder(table, pos))
  }
  return out
}

/** The annex's own title, printed once over the whole document. Chrome. */
const ANNEX_TITLE_RE = /^textgeg(?:en)?b?ü?berstellung$/i

/**
 * Headings and rows in printed order, including headings that stand outside
 * every table.
 *
 * A `<ueberschrift>` at document level divides the annex exactly as one inside
 * a table does — two annexes print *both* their Artikel that way, and reading
 * only table rows lost both boundaries (2026-09-09).
 */
type Item = { kind: 'heading'; text: string; at: number; html: string } | { kind: 'row'; inner: string; at: number }

function itemsInOrder(body: string): Item[] {
  const tables = outermost(body, 'table').map((t) => [t.at, t.at + t.inner.length] as const)
  const inTable = (at: number): boolean => tables.some(([from, to]) => at >= from && at < to)
  const headings: Item[] = [...body.matchAll(/<ueberschrift\b[^>]*>([\s\S]*?)<\/ueberschrift\s*>/g)]
    .filter((m) => !inTable(m.index))
    // The opening tag is kept: `typ="anlage"` is how RIS says that a schedule
    // starts, and the § sequence ends there (`opensAnlage`).
    .map((m) => ({ kind: 'heading' as const, text: cellText(m[1]!), at: m.index, html: m[0] }))
    .filter((h) => h.text !== '' && !ANNEX_TITLE_RE.test(h.text.replace(/\s+/g, '')))
  const rows: Item[] = rowsInOrder(body).map((r) => ({ kind: 'row' as const, inner: r.inner, at: r.at }))
  // A stable sort keeps the rows of one table in their own order while the
  // document-level headings fall into place between the tables.
  return [...headings, ...rows].sort((a, b) => a.at - b.at)
}

/**
 * Which columns a row's cells occupy, from the mandated header pair — or null
 * when the document is not a two-column comparison at all.
 *
 * The shipped rule was "the first cell spans more than one column, so this is
 * an Artikel heading". That is only true when each column is one cell wide.
 * Where the annex spans its *columns* — the header reads `colspan="2"` twice —
 * every ordinary pair row looked like a heading: 95/ME turned 157 of its 163
 * rows into headings and rendered a single-law Novelle as 161 groups with six
 * comparisons, and 221 pair rows were swallowed across 7 annexes (2026-09-09).
 */
function columnSpans(rows: readonly { inner: string }[]): { left: number; right: number } | null {
  const spanOf = (cell: Element): number => Number(COLSPAN_RE.exec(cell.attrs)?.[1] ?? 1)
  /** How often each row shape occurs, for the annexes that print no header. */
  const shapes = new Map<string, number>()
  for (const row of rows) {
    const cells = outermost(row.inner, 'td')
    if (cells.length < 2) continue
    const first = cellText(liftTables(cells[0]!.inner, false).text)
    const second = cellText(liftTables(cells[1]!.inner, false).text)
    if (HEADER_CURRENT_RE.test(first) && HEADER_PROPOSED_RE.test(second)) {
      return { left: spanOf(cells[0]!), right: spanOf(cells[1]!) }
    }
    const shape = cells.map(spanOf).join('+')
    shapes.set(shape, (shapes.get(shape) ?? 0) + 1)
  }
  // No header pair — 1 of the 126 readable GP-XXVIII annexes, and it *is* a
  // two-column comparison, it just omits the mandated heading (2026-09-10).
  // The shipped fallback assumed {1, 1} for it and happened to be right; that
  // is not a reason to keep assuming. The rows themselves say how wide the
  // columns are, and a document whose rows are not two cells wide is not a
  // comparison at all — pairing its cells would invent a Gegenüberstellung
  // out of an ordinary table, so it yields nothing instead.
  const dominant = [...shapes].sort((a, b) => b[1] - a[1])[0]
  const spans = dominant?.[0].split('+').map(Number) ?? []
  if (spans.length !== 2) return null
  return { left: spans[0]!, right: spans[1]! }
}

/**
 * A row's cells, split into the current and the proposed column.
 *
 * Cells are assigned by where they *start*, not by their index: the current
 * side can be several cells wide.
 *
 * **A row need not use the header's split.** The Verbraucherkreditrechts-
 * Änderungsgesetz heads its table `colspan="5"` against `colspan="1"` and then
 * typesets its Anhang `4` against `3`: the second cell starts at 4, which is
 * still inside the header's left column, so both cells landed under "Geltende
 * Fassung" and the proposed column came out empty. Eleven rows of that annex
 * read "Anhang Anhang" and were reported as **entfällt** — text the annex
 * prints unchanged in both columns, shown as deleted, and none of them carries
 * a § designation, so the RIS check never sees them (2026-09-10).
 *
 * A pair row has two sides by definition, so a split that leaves one empty is
 * wrong whatever the header said; the row's own widths are then the better
 * evidence, and the split that balances them best is taken. Measured over GP
 * XXVIII this fires on those 11 rows and nothing else — where the header's
 * split works, it is kept.
 */
function columnsOf(cells: readonly { html: string; span: number }[], span: { left: number; right: number }): { currentHtml: string; proposedHtml: string } {
  const sides: string[][] = [[], []]
  let at = 0
  for (const cell of cells) {
    sides[at < span.left ? 0 : 1]!.push(cell.html)
    at += cell.span
  }
  if (sides[1]!.length === 0 && cells.length >= 2) {
    const total = cells.reduce((sum, c) => sum + c.span, 0)
    let cut = 1
    let closest = Number.POSITIVE_INFINITY
    let left = 0
    for (let k = 1; k < cells.length; k++) {
      left += cells[k - 1]!.span
      const gap = Math.abs(left - (total - left))
      if (gap < closest) {
        closest = gap
        cut = k
      }
    }
    sides[0] = cells.slice(0, cut).map((c) => c.html)
    sides[1] = cells.slice(cut).map((c) => c.html)
  }
  return { currentHtml: sides[0]!.join(' '), proposedHtml: sides[1]!.join(' ') }
}

export interface ComparisonParse {
  rows: ComparisonRow[]
  /**
   * Why the package's laws could not be told apart, in words fit to show a
   * reader; null when they could. The comparison is still worth showing —
   * it just carries no law of its own.
   */
  refusal: string | null
  /**
   * Why the document could not be read as a comparison at all. `rows` is then
   * empty, which the caller already treats as "not readable" — this only says
   * which of the ways it failed, for the harnesses and the log.
   */
  unreadable?: string
}

/** What a heading or row does in the document, decided before any is emitted. */
interface Parsed {
  item: Item
  /** Heading text, for a heading row or a document-level heading */
  heading: string | null
  /** Set when the row is a pair row printing the same text in both columns */
  mirrored: string | null
  cells: { html: string; span: number }[]
}

/**
 * One Textgegenüberstellung XML → its rows, in printed order.
 *
 * `articles` is the draft's own Artikel list (`draftArticles`). Every law
 * boundary the annex prints has to be one of them: the annex sets an internal
 * Roman division, a provision of a law organised in Artikel, and a real law
 * boundary in the same shape, and § 5 of the second law of a package is a
 * different provision from § 5 of the first. Passing an empty list says "no
 * draft to check against", and the annex is then read as one undivided law.
 */
export function parseTextComparison(xml: string, articles: readonly DraftArticle[] = []): ComparisonParse {
  let body = xml
  for (const re of STRIP) body = body.replace(re, '')

  const items = itemsInOrder(body)
  const span = columnSpans(items.filter((i): i is Extract<Item, { kind: 'row' }> => i.kind === 'row'))
  if (span === null) return { rows: [], refusal: null, unreadable: 'Das Dokument ist keine zweispaltige Gegenüberstellung.' }

  // Pass 1: what each item is.
  const parsed: Parsed[] = []
  for (const item of items) {
    if (item.kind === 'heading') {
      parsed.push({ item, heading: item.text, mirrored: null, cells: [] })
      continue
    }
    const own = outermost(item.inner, 'td')
    const wide = coversTheWidth(own)
    const cells = own.map((c, i) => ({ html: liftTables(c.inner, wide[i]!).text, span: Number(COLSPAN_RE.exec(c.attrs)?.[1] ?? 1) }))
    if (cells.length === 0) continue
    // A heading occupies the whole width. Anything narrower is a pair row,
    // however many columns each of its cells happens to span.
    const firstFilled = cells.find((c) => cellText(c.html) !== '') ?? cells[0]!
    if (cells.length === 1 || firstFilled.span >= span.left + span.right) {
      const heading = cellText(firstFilled.html)
      if (heading) parsed.push({ item, heading, mirrored: null, cells })
      continue
    }
    const { currentHtml, proposedHtml } = columnsOf(cells, span)
    const current = cellText(currentHtml)
    const proposed = cellText(proposedHtml)
    // The mandated column headings repeat on every page; they are chrome.
    if (HEADER_CURRENT_RE.test(current) && HEADER_PROPOSED_RE.test(proposed)) continue
    if (!current && !proposed) continue
    // An Artikel line is often printed once per column rather than across
    // both, and read as an ordinary pair row it left the boundary invisible.
    parsed.push({ item, heading: null, mirrored: current && current === proposed ? current : null, cells })
  }

  // Pass 2: which of the heading-shaped lines open a law.
  const candidates: BoundaryCandidate[] = []
  /** Index in `parsed` → index in `candidates`, and whether the line was a heading row. */
  const candidateAt = new Map<number, { at: number; fromHeading: boolean }>()
  const titleOf = new Map<number, number>()
  for (const [i, p] of parsed.entries()) {
    if (candidateAt.has(i) || titleOf.has(i)) continue
    const text = p.heading ?? p.mirrored
    if (!text) continue
    const candidate = candidateOf(text)
    if (!candidate) continue
    const at = candidates.length
    // The law's name sits on the line below its Artikel number.
    if (candidate.numeral !== null && !candidate.title) {
      for (let j = i + 1; j < parsed.length; j++) {
        const next = parsed[j]!.heading ?? parsed[j]!.mirrored
        if (!next) break
        if (/^[§(]/.test(next) || candidateOf(next)?.numeral) break
        candidate.title = next
        titleOf.set(j, at)
        break
      }
    }
    candidates.push(candidate)
    candidateAt.set(i, { at, fromHeading: p.heading !== null })
  }
  const resolution = resolveBoundaries(candidates, articles)

  // Pass 3: emit.
  const rows: ComparisonRow[] = []
  let law = resolution.whole?.key ?? null
  /** The § currently open — a new law restarts the numbering. */
  let openPara: string | null = null
  let pendingHeading: string[] = []
  /**
   * One-sided heading rows waiting for the row below to say which § they are.
   *
   * A row is emitted in printed order, so they are flushed before the next row
   * is pushed and never outlive their law.
   */
  let heldHeadings: ComparisonRow[] = []
  const releaseHeadings = (): void => {
    for (const row of heldHeadings) rows.push({ ...row, para: openPara })
    heldHeadings = []
  }
  for (const [i, p] of parsed.entries()) {
    const mark = candidateAt.get(i)
    if (mark) {
      const article = resolution.accepted.get(mark.at)
      if (article) {
        // Still under the old law and the old §: there is no row below them
        // inside this Artikel to take them.
        releaseHeadings()
        law = article.key
        openPara = null
        rows.push({ kind: 'article', law, heading: headingOf(article), gld: null, para: null, current: '', proposed: '', change: 'unchanged', marked: false, elided: false, segments: null, editorial: false })
        pendingHeading = []
        continue
      }
      // A candidate the draft does not confirm is an internal heading. One
      // printed across the width is context for the rows below it; one printed
      // in both columns is law text and stays the pair row it is.
      if (mark.fromHeading) {
        pendingHeading.push(p.heading!)
        continue
      }
    }
    if (titleOf.has(i)) {
      if (!resolution.accepted.has(titleOf.get(i)!)) pendingHeading.push((p.heading ?? p.mirrored)!)
      continue
    }
    // Every other heading across both columns — Abschnitt, Hauptstück, a
    // heading over a group of §§ — is context for the provision beneath it,
    // not a group of its own.
    if (p.heading !== null) {
      if (opensAnlage(p.heading, p.item.kind === 'heading' ? p.item.html : p.item.inner)) openPara = p.heading
      pendingHeading.push(p.heading)
      continue
    }
    // The same, for a division the ressort typeset as an ordinary row in
    // both columns rather than as a heading. It reached the comparison as a
    // mirrored pair row and was filed under whichever § stood open above it
    // — "9b. Abschnitt" under § 2, "10. Abschnitt" under § 54j.
    if (p.mirrored !== null && p.mirrored.length <= DIVISION_MAX && DIVISION_RE.test(p.mirrored)) {
      pendingHeading.push(p.mirrored)
      continue
    }
    // An Anlage or Anhang ends the paragraph sequence rather than dividing it
    // (`opensAnlage`), so it becomes the designation the rows beneath it
    // inherit — its own, not the § before it. The line stays the pair row it
    // is: the annex prints it in both columns, and it is part of what changed
    // or did not.
    if (p.mirrored !== null && opensAnlage(p.mirrored, p.item.kind === 'row' ? p.item.inner : '')) openPara = p.mirrored

    const raw = columnsOf(p.cells, span)
    // The § heading sits in the *same* cell as the Absatz, above it — that is
    // how the ressort typesets it, so the cell's text really does read
    // "Wiederholung von Teilprüfungen … § 40. (1) Wurden …". Faithful, and
    // unreadable: it belongs over the row, not inside its text.
    //
    // Only lifted when both columns carry the same heading. One that differs
    // between them, or stands on one side only, is a change the draft makes
    // ("samt Überschrift") and has to stay where the word diff can see it.
    const ownHeading = paraHeading(raw.currentHtml)
    const lift = ownHeading !== null && ownHeading === paraHeading(raw.proposedHtml)
    const currentHtml = lift ? stripParaHeading(raw.currentHtml) : raw.currentHtml
    const proposedHtml = lift ? stripParaHeading(raw.proposedHtml) : raw.proposedHtml
    const gldMatch = GLD_RE.exec(currentHtml) ?? GLD_RE.exec(proposedHtml)
    const gld = gldMatch ? cellText(gldMatch[1]!) : null
    if (gld) openPara = gld
    // The designation is a `<gldsym>` element of its own, so it is data rather
    // than prose — and it is already carried in `gld`. Left in the text as
    // well, 1.183 of the 1.198 rows that have one printed it twice: "§ 40."
    // beside the badge and "§ 40. (1) Wurden …" underneath it. A consumer that
    // wants the provision as printed joins `gld` and `current`. A designation
    // the row does *not* carry stays in the text (`stripGld`).
    const current = cellText(stripGld(currentHtml, gld))
    const proposed = cellText(stripGld(proposedHtml, gld))
    if (lift && !current && !proposed) {
      // The heading had a row of its own. It belongs to the § *below* it —
      // read in printed order it landed in the § before, which once put
      // another §'s title onto a provision.
      pendingHeading.push(ownHeading)
      continue
    }
    // A row that prints nothing but the designation is a marker, not a
    // comparison; the § it opens is remembered and the next row inherits it.
    if (!current && !proposed) continue
    const elided = isElidedPair(current, proposed)
    // An elision line that names its § opens it (`elisionOpens`) — the row is
    // that §'s, and so are the rows below it until the next designation.
    if (elided && gld === null) openPara = elisionOpens(current, proposed) ?? openPara
    const change = classify(current, proposed)
    // The ressort's yellow marking is reliable where present but incomplete:
    // of 8.430 row pairs, 1.395 differ in text without being marked, while
    // only 3 are marked without differing (measured 2026-09-08). So the word
    // diff decides what is shown, and the marking is recorded, not relied on.
    const segments = change === 'changed' && !elided ? diffTokens(current, proposed).segments : null
    const row: ComparisonRow = {
      kind: 'pair',
      law,
      heading: [pendingHeading.join(' '), lift ? ownHeading : ''].filter(Boolean).join(' · ') || null,
      gld,
      para: openPara,
      current,
      proposed,
      change,
      marked: MARK_RE.test(proposedHtml) || MARK_RE.test(currentHtml),
      elided,
      segments,
      editorial: isEditorialChange(segments),
    }
    pendingHeading = []
    // A heading the annex prints in **one** column only belongs to the unit
    // below it, exactly as a two-sided one does — the draft inserts a § with
    // its heading, or repeals one, and the column where it does not yet (or no
    // longer) exist is empty. `lift` never sees those: it needs the heading in
    // both columns, so the row went out as an ordinary insertion or deletion
    // and inherited the § *above*. SchOG § 129 carried the heading of § 130d,
    // the Blutspenderverordnung § 7 that of § 8, the AWG § 72a that of the
    // repealed § 72b.
    //
    // It may not vanish into `pendingHeading` the way a two-sided heading
    // does. One printed on both sides is unchanged by definition; a one-sided
    // heading *is* the change, and making a shown change disappear is the
    // mistake the old elision rule made over 919 rows. So the row stays a row
    // and only its § moves.
    //
    // Which § that is cannot be known yet: it is the one the *next* row opens.
    // Held until then, the row takes whatever § is open when the row below is
    // emitted — the new § where the row below opens one, and the § above where
    // it does not, so where the corpus says nothing the answer is the one that
    // shipped.
    //
    // Measured over the 126 readable GP-XXVIII annexes (2026-09-11): 297 rows
    // of this shape out of 11.448, 244 printed right and 53 left. 236 are
    // followed by a row that opens a §; the other 61 open nothing and keep the
    // § above. RIS types every one of the 297 as `<ueberschrift>` — none has to
    // be recognised from its wording (`headingOnly`).
    if (gld === null && (current === '') !== (proposed === '') && headingOnly(current === '' ? proposedHtml : currentHtml)) {
      const only = current || proposed
      // Unless it is a schedule heading, which is a designation and not a
      // title: what stands under "Anhang" is addressed as the Anlage, so the
      // line opens its own unit rather than waiting for a § that never comes
      // (`opensAnlage`, which the two-sided and the full-width heading already
      // ask). Seven rows of GP XXVIII, and they were filed under the *previous*
      // schedule — the Bäderhygieneverordnung showed its new Anlage 11 under
      // Anlage 10, the Medizinproduktebetreiberverordnung its repealed Anhang 5
      // under Anhang 2.
      if (opensAnlage(only, current === '' ? proposedHtml : currentHtml)) {
        openPara = only
        releaseHeadings()
        rows.push({ ...row, para: openPara })
        continue
      }
      heldHeadings.push(row)
      continue
    }
    releaseHeadings()
    rows.push(row)
  }
  releaseHeadings()
  return { rows, refusal: resolution.refusal }
}

export function classify(current: string, proposed: string): ComparisonChange {
  if (!current && proposed) return 'inserted'
  if (current && !proposed) return 'removed'
  return current === proposed ? 'unchanged' : 'changed'
}

export interface ComparisonStats {
  total: number
  changed: number
  editorial: number
  inserted: number
  removed: number
  unchanged: number
}

export function summarizeComparison(rows: readonly ComparisonRow[]): ComparisonStats {
  const pairs = rows.filter((r) => r.kind === 'pair')
  const count = (change: ComparisonChange) => pairs.filter((r) => r.change === change).length
  return {
    total: pairs.length,
    changed: count('changed'),
    editorial: pairs.filter((r) => r.editorial).length,
    inserted: count('inserted'),
    removed: count('removed'),
    unchanged: count('unchanged'),
  }
}
