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
 * Roughly 39 % of drafts have a readable one — of the 60 % that carry the
 * annex at all, 40 % are scanned images with no text (measured over the 200
 * drafts of the last twelve months, 2026-09-08). `parseTextComparison`
 * returns an empty list for those, which the caller must treat as "not
 * available", never as "nothing changed".
 */
import { candidateOf, headingOf, resolveBoundaries, type BoundaryCandidate } from './annexBoundaries'
import { diffTokens, isEditorialChange } from './lawDiff'
import { normalizeText } from './lawText'
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
const CELL_RE = /<td\b([^>]*)>([\s\S]*?)<\/td\s*>/g
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
/** The three-dots convention: "2. bis 26b. …" or a bare "…". */
export const ELIDED_RE = /(?:\.\.\.|…)\s*$/

export const HEADER_CURRENT = 'geltende fassung'
export const HEADER_PROPOSED = 'vorgeschlagene fassung'

function cellText(html: string): string {
  return normalizeText(
    decodeEntities(
      html
        .replace(/<nbsp\s*\/>/g, ' ')
        .replace(/<gdash\s*\/>/g, '-')
        .replace(/<br\s*\/?>/gi, ' ')
        // A marker sits flush against its text ("1.Altersprädikat"); the
        // space has to come back or the number fuses into the first word.
        .replace(/<\/(?:gldsym|symbol)>/g, '$& ')
        .replace(/<[^>]*>/g, ' '),
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

/**
 * Elements of one kind at the outermost nesting level, as their inner HTML.
 *
 * A non-greedy `<tr>…</tr>` regex stops at the *first* closing tag, so a row
 * containing a nested table was cut off at the inner table's first row and the
 * inner rows were then read as siblings of the outer one. 17 of the 65
 * readable annexes nest tables — 70 tables over 584 rows — and each of them
 * lost around 140 rows that way (measured 2026-09-09).
 */
function outermost(html: string, tag: string): { attrs: string; inner: string; at: number }[] {
  const re = new RegExp(`<(/?)${tag}\\b([^>]*)>`, 'gi')
  const out: { attrs: string; inner: string; at: number }[] = []
  let depth = 0
  let start = -1
  let attrs = ''
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const closing = m[1] === '/'
    const selfClosing = /\/\s*$/.test(m[2] ?? '')
    if (!closing && selfClosing) continue
    if (closing) {
      depth--
      if (depth === 0 && start >= 0) {
        out.push({ attrs, inner: html.slice(start, m.index), at: start })
        start = -1
      }
      if (depth < 0) depth = 0
      continue
    }
    if (depth === 0) {
      start = m.index + m[0].length
      attrs = m[2] ?? ''
    }
    depth++
  }
  return out
}

/**
 * A cell's own content, with any table it contains lifted out.
 *
 * The nested rows are content in their own right — they carry provisions, not
 * decoration — so they are flattened into the row sequence at the position
 * where they stood, and the cell keeps only the text that is genuinely its own.
 */
function liftTables(cellInner: string): { text: string; tables: string[] } {
  const tables = outermost(cellInner, 'table')
  if (tables.length === 0) return { text: cellInner, tables: [] }
  let text = cellInner
  for (const t of tables) text = text.replace(t.inner, ' ')
  return { text: text.replace(/<\/?table\b[^>]*>/gi, ' '), tables: tables.map((t) => t.inner) }
}

/**
 * Every row of the document in printed order, nested tables flattened in place.
 *
 * `at` is the position of the *outermost* row a nested one sits in, so that
 * document-level headings can be merged into the sequence without disturbing
 * the order of rows that came out of one table together.
 */
function rowsInOrder(html: string, at?: number): { attrs: string; inner: string; at: number }[] {
  const out: { attrs: string; inner: string; at: number }[] = []
  for (const row of outermost(html, 'tr')) {
    const pos = at ?? row.at
    const cells = outermost(row.inner, 'td')
    const nested = cells.flatMap((c) => liftTables(c.inner).tables)
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
type Item = { kind: 'heading'; text: string; at: number } | { kind: 'row'; inner: string; at: number }

function itemsInOrder(body: string): Item[] {
  const tables = outermost(body, 'table').map((t) => [t.at, t.at + t.inner.length] as const)
  const inTable = (at: number): boolean => tables.some(([from, to]) => at >= from && at < to)
  const headings: Item[] = [...body.matchAll(/<ueberschrift\b[^>]*>([\s\S]*?)<\/ueberschrift\s*>/g)]
    .filter((m) => !inTable(m.index))
    .map((m) => ({ kind: 'heading' as const, text: cellText(m[1]!), at: m.index }))
    .filter((h) => h.text !== '' && !ANNEX_TITLE_RE.test(h.text.replace(/\s+/g, '')))
  const rows: Item[] = rowsInOrder(body).map((r) => ({ kind: 'row' as const, inner: r.inner, at: r.at }))
  // A stable sort keeps the rows of one table in their own order while the
  // document-level headings fall into place between the tables.
  return [...headings, ...rows].sort((a, b) => a.at - b.at)
}

/**
 * Which columns a row's cells occupy, from the mandated header pair.
 *
 * The shipped rule was "the first cell spans more than one column, so this is
 * an Artikel heading". That is only true when each column is one cell wide.
 * Where the annex spans its *columns* — the header reads `colspan="2"` twice —
 * every ordinary pair row looked like a heading: 95/ME turned 157 of its 163
 * rows into headings and rendered a single-law Novelle as 161 groups with six
 * comparisons, and 221 pair rows were swallowed across 7 annexes (2026-09-09).
 */
function columnSpans(rows: readonly { inner: string }[]): { left: number; right: number } {
  for (const row of rows) {
    const cells = [...row.inner.matchAll(CELL_RE)]
    if (cells.length < 2) continue
    const first = cellText(liftTables(cells[0]![2]!).text).toLowerCase()
    const second = cellText(liftTables(cells[1]![2]!).text).toLowerCase()
    if (first === HEADER_CURRENT && second === HEADER_PROPOSED) {
      return { left: Number(COLSPAN_RE.exec(cells[0]![1]!)?.[1] ?? 1), right: Number(COLSPAN_RE.exec(cells[1]![1]!)?.[1] ?? 1) }
    }
  }
  return { left: 1, right: 1 }
}

/**
 * A row's cells, split into the current and the proposed column.
 *
 * Cells are assigned by where they *start*, not by their index: the current
 * side can be several cells wide.
 */
function columnsOf(cells: readonly { html: string; span: number }[], span: { left: number; right: number }): { currentHtml: string; proposedHtml: string } {
  let at = 0
  const leftHtml: string[] = []
  const rightHtml: string[] = []
  for (const cell of cells) {
    ;(at < span.left ? leftHtml : rightHtml).push(cell.html)
    at += cell.span
  }
  return { currentHtml: leftHtml.join(' '), proposedHtml: rightHtml.join(' ') }
}

export interface ComparisonParse {
  rows: ComparisonRow[]
  /**
   * Why the package's laws could not be told apart, in words fit to show a
   * reader; null when they could. The comparison is still worth showing —
   * it just carries no law of its own.
   */
  refusal: string | null
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

  // Pass 1: what each item is.
  const parsed: Parsed[] = []
  for (const item of items) {
    if (item.kind === 'heading') {
      parsed.push({ item, heading: item.text, mirrored: null, cells: [] })
      continue
    }
    const cells = outermost(item.inner, 'td').map((c) => {
      const lifted = liftTables(c.inner)
      return { html: lifted.text, span: Number(COLSPAN_RE.exec(c.attrs)?.[1] ?? 1) }
    })
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
    if (current.toLowerCase() === HEADER_CURRENT && proposed.toLowerCase() === HEADER_PROPOSED) continue
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
  for (const [i, p] of parsed.entries()) {
    const mark = candidateAt.get(i)
    if (mark) {
      const article = resolution.accepted.get(mark.at)
      if (article) {
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
      pendingHeading.push(p.heading)
      continue
    }

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
    const current = cellText(currentHtml)
    const proposed = cellText(proposedHtml)
    if (lift && !current && !proposed) {
      // The heading had a row of its own. It belongs to the § *below* it —
      // read in printed order it landed in the § before, which once put
      // another §'s title onto a provision.
      pendingHeading.push(ownHeading)
      continue
    }
    const gldMatch = GLD_RE.exec(currentHtml) ?? GLD_RE.exec(proposedHtml)
    const gld = gldMatch ? normalizeText(cellText(gldMatch[1]!)) : null
    if (gld) openPara = gld
    const elided = ELIDED_RE.test(current) && ELIDED_RE.test(proposed)
    const change = classify(current, proposed)
    // The ressort's yellow marking is reliable where present but incomplete:
    // of 8.430 row pairs, 1.395 differ in text without being marked, while
    // only 3 are marked without differing (measured 2026-09-08). So the word
    // diff decides what is shown, and the marking is recorded, not relied on.
    const segments = change === 'changed' && !elided ? diffTokens(current, proposed).segments : null
    rows.push({
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
    })
    pendingHeading = []
  }
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
