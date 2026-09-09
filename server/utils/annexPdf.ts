/**
 * The Textgegenüberstellung as it survives in the PDF (docs/api-exploration.md §2c).
 *
 * PURE MODULE — relative imports only, so vitest runs it directly. The PDF is
 * turned into positioned text runs by the caller; this module never opens a
 * file, which is what makes the geometry testable without a fixture binary.
 *
 * **Why this exists.** `api-exploration.md` recorded that ~40 % of annexes are
 * "nur Scans" and unreadable. That was measured on the RIS *XML* rendering,
 * which rasterises them into `<binary datatype="gif">`. The **PDF** of the very
 * same annex is Word output with a full text layer: across all 44 rasterised
 * GP-XXVIII annexes there is not one image XObject and there are 955 font
 * references (measured 2026-09-09). The text was never lost — the project was
 * reading the one format that had thrown it away.
 *
 * The annex is a two-column table regulated by the BKA-Rundschreiben of
 * 27.03.2002: "Geltende Fassung" left, "Vorgeschlagene Fassung" right, aligned
 * so that corresponding provisions sit at the same height. A PDF has no row
 * elements, so a row has to be inferred — and the paragraph marker is the only
 * boundary the layout guarantees.
 */
import { diffTokens, isEditorialChange } from './lawDiff'
import { normalizeText } from './lawText'
import { classify, ELIDED_RE, HEADER_CURRENT, HEADER_PROPOSED, type ComparisonRow } from './textComparison'

/** One positioned text run, in PDF user space (origin bottom-left). */
export interface AnnexItem {
  x: number
  y: number
  width: number
  text: string
}

export interface AnnexPage {
  width: number
  items: readonly AnnexItem[]
}

/** A visual line, already split at the column boundary. */
interface AnnexLine {
  left: string
  right: string
  /** A heading that runs across both columns — an Artikel or a law title */
  spanning: string | null
  /** Left and right edge of the left column's text, for detecting a centred heading */
  leftStart: number
  leftEnd: number
  leftWrapped: boolean
  rightWrapped: boolean
}

/** Lines within this many points of each other sit on one baseline. */
const BASELINE_TOLERANCE = 2.5
/** A line whose text reaches this close to the column edge was wrapped, not ended. */
const MARGIN_TOLERANCE = 18

const PAGE_NUMBER_RE = /^\d+\s+von\s+\d+$/i
const TITLE_RE = /^textgeg(?:en)?b?ü?berstellung$/i
/**
 * A row boundary is a paragraph *opening*: a single § with a number and the
 * full stop that follows it ("§ 6.", "§ 5a."). The plural "§§" and a bare
 * "§ 6 Abs. 2" are citations inside running text — treating those as
 * boundaries cut sentences in half mid-clause (8/ME, 2026-09-09).
 */
const UNIT_RE = /^(?:§\s*\d+[a-z]*\.|Art(?:\.|ikel)\s*\d+[a-z]*\s|Anlage\s+[\dIVXL]+)/
const ARTICLE_RE = /^(?:Artikel|Art\.)\s*\d+/i

/**
 * A PDF stores no spaces between text runs — it moves the cursor instead. So
 * the runs of one line have to be re-spaced from their geometry, or the line
 * comes out as "EinverfassungsgefährdenderAngriffistdieBedrohung" (2026-09-09).
 * A gap wider than a quarter of the run's own average character advance is a
 * word break; anything narrower is kerning inside a word.
 */
function joinRuns(runs: { x: number; width: number; text: string }[]): string {
  const sorted = [...runs].sort((a, b) => a.x - b.x)
  let out = ''
  let cursor: number | null = null
  let charWidth = 5
  for (const run of sorted) {
    if (run.text.length > 0 && run.width > 0) charWidth = run.width / run.text.length
    const gap = cursor === null ? 0 : run.x - cursor
    if (cursor !== null && gap > charWidth * 0.25 && !/\s$/.test(out) && !/^\s/.test(run.text)) out += ' '
    out += run.text
    cursor = run.x + run.width
  }
  return out.replace(/\s+/g, ' ').trim()
}

/**
 * Positioned runs → visual lines, split at the page midline.
 *
 * A run is assigned by its **midpoint**, not its left edge: a centred heading
 * starts left of the midline and crosses it, and assigning by left edge filed
 * "Textgegenüberstellung" as current law.
 */
export function linesFromPage(page: AnnexPage): AnnexLine[] {
  const mid = page.width / 2
  type Run = { x: number; width: number; text: string }
  const buckets: { y: number; left: Run[]; right: Run[]; spanning: Run[]; leftEnd: number; rightEnd: number; leftStart: number }[] = []

  for (const item of page.items) {
    if (!item.text.trim()) continue
    let bucket = buckets.find((b) => Math.abs(b.y - item.y) <= BASELINE_TOLERANCE)
    if (!bucket) {
      bucket = { y: item.y, left: [], right: [], spanning: [], leftEnd: 0, rightEnd: 0, leftStart: Number.POSITIVE_INFINITY }
      buckets.push(bucket)
    }
    const right = item.x + item.width
    if (item.x < mid && right > mid + MARGIN_TOLERANCE) {
      bucket.spanning.push({ x: item.x, width: item.width, text: item.text })
      continue
    }
    if (item.x + item.width / 2 < mid) {
      bucket.left.push({ x: item.x, width: item.width, text: item.text })
      bucket.leftEnd = Math.max(bucket.leftEnd, right)
      bucket.leftStart = Math.min(bucket.leftStart, item.x)
    } else {
      bucket.right.push({ x: item.x, width: item.width, text: item.text })
      bucket.rightEnd = Math.max(bucket.rightEnd, right)
    }
  }

  return buckets
    .sort((a, b) => b.y - a.y)
    .map((b) => ({
      left: joinRuns(b.left),
      right: joinRuns(b.right),
      spanning: b.spanning.length ? joinRuns(b.spanning) : null,
      leftStart: b.leftStart,
      leftEnd: b.leftEnd,
      leftWrapped: b.leftEnd > mid - MARGIN_TOLERANCE,
      rightWrapped: b.rightEnd > page.width - MARGIN_TOLERANCE,
    }))
}

/** Page furniture the Rundschreiben requires on every page — not content. */
function isChrome(line: AnnexLine): boolean {
  const both = `${line.left} ${line.right} ${line.spanning ?? ''}`.trim()
  if (!both) return true
  if (PAGE_NUMBER_RE.test(line.right.trim()) && !line.left.trim()) return true
  if (PAGE_NUMBER_RE.test(line.left.trim()) && !line.right.trim()) return true
  if (TITLE_RE.test((line.spanning ?? both).replace(/\s+/g, ''))) return true
  const l = line.left.trim().toLowerCase()
  const r = line.right.trim().toLowerCase()
  return l === HEADER_CURRENT && r === HEADER_PROPOSED
}

/**
 * Wrapped lines are joined with a space; a hyphen is only dissolved when the
 * line actually reached the column edge.
 *
 * German legal drafting is full of legitimate trailing hyphens —
 * "Staatsschutz- und Nachrichtendienst-Gesetz" — so dissolving every
 * line-final hyphen would weld "Staatsschutzund". Reaching the margin is the
 * signal that the hyphen is the typesetter's rather than the drafter's.
 */
function joinLines(parts: { text: string; wrapped: boolean }[]): string {
  let out = ''
  for (const part of parts) {
    if (!part.text) continue
    if (!out) {
      out = part.text
      continue
    }
    const hyphenated = /[a-zäöüß]-$/.test(out) && part.wrapped
    out = hyphenated ? `${out.slice(0, -1)}${part.text}` : `${out} ${part.text}`
  }
  return normalizeText(out)
}

/** The lines of one column, already joined, keyed by the unit they describe. */
interface ColumnUnit {
  id: string | null
  gld: string | null
  text: string
}

const SENTENCE_END = /[.;:!?…]["»›)]?$/

/**
 * One column's lines → its units.
 *
 * The two columns of an annex do **not** advance together. Where the draft
 * inserts a §, the proposed column runs on while the current column is blank,
 * and a single shared row cursor then drags the next heading of the current
 * column up into the inserted §: 8/ME showed "Information Betroffener" — the
 * title of § 16 — as the standing text of the new § 15c (2026-09-09). So each
 * column is walked on its own and the two are joined afterwards, on the only
 * key they share: the paragraph designation.
 *
 * A heading sits *above* the § it names, so on reaching a marker the trailing
 * short lines of the previous unit are handed to the new one. A wrapped body
 * line reaches the column edge and a finished sentence ends in punctuation;
 * a heading does neither, which is what distinguishes it.
 */
function unitsOfColumn(lines: readonly { text: string; wrapped: boolean }[]): ColumnUnit[] {
  const units: { gld: string | null; parts: { text: string; wrapped: boolean }[] }[] = []
  let current: { gld: string | null; parts: { text: string; wrapped: boolean }[] } = { gld: null, parts: [] }

  for (const line of lines) {
    if (!line.text) continue
    const marker = UNIT_RE.exec(line.text)
    if (!marker) {
      current.parts.push(line)
      continue
    }
    const carried: { text: string; wrapped: boolean }[] = []
    while (current.parts.length > 0 && carried.length < 3) {
      const last = current.parts[current.parts.length - 1]!
      if (last.wrapped || SENTENCE_END.test(last.text)) break
      carried.unshift(current.parts.pop()!)
    }
    if (current.gld !== null || current.parts.length > 0) units.push(current)
    current = { gld: normalizeText(marker[0]), parts: [...carried, line] }
  }
  if (current.gld !== null || current.parts.length > 0) units.push(current)

  return units.map((u) => ({ id: u.gld ? (/(\d+[a-z]*)/.exec(u.gld)?.[1] ?? null) : null, gld: u.gld, text: joinLines(u.parts) }))
}

function rowOf(gld: string | null, current: string, proposed: string): ComparisonRow | null {
  if (!current && !proposed) return null
  const elided = ELIDED_RE.test(current) && ELIDED_RE.test(proposed)
  const change = classify(current, proposed)
  const segments = change === 'changed' && !elided ? diffTokens(current, proposed).segments : null
  return {
    kind: 'pair',
    heading: null,
    gld,
    current,
    proposed,
    change,
    // The ressort's yellow marking lives in the content stream's fill colours,
    // not in the text layer. The XML path already treats the marking as
    // recorded rather than relied on (§2c); the word diff decides.
    marked: false,
    elided,
    segments,
    editorial: isEditorialChange(segments),
  }
}

/**
 * The annex PDF's pages → the same rows the XML path produces.
 *
 * Rows are cut at the paragraph designation: a PDF carries no row elements,
 * and the provision is the only boundary the two columns are guaranteed to
 * share. That is coarser than the XML path's cell pairs, and aligned on
 * something the layout actually promises.
 */
export function parseAnnexPdf(pages: readonly AnnexPage[]): ComparisonRow[] {
  const rows: ComparisonRow[] = []
  const lines = pages.flatMap((page) => linesFromPage(page)).filter((line) => !isChrome(line))

  // An Artikel heading spans both columns and starts a new law inside a
  // package. Everything between two of them is one law's comparison, parsed
  // per column and joined on the designation.
  const sections: { heading: string | null; lines: AnnexLine[] }[] = [{ heading: null, lines: [] }]
  for (const line of lines) {
    const spanning = line.spanning ?? (line.left && line.left === line.right && ARTICLE_RE.test(line.left) ? line.left : null)
    if (spanning) sections.push({ heading: spanning, lines: [] })
    else sections[sections.length - 1]!.lines.push(line)
  }

  for (const section of sections) {
    if (section.heading) {
      rows.push({ kind: 'article', heading: section.heading, gld: null, current: '', proposed: '', change: 'unchanged', marked: false, elided: false, segments: null, editorial: false })
    }
    const left = unitsOfColumn(section.lines.map((l) => ({ text: l.left, wrapped: l.leftWrapped })))
    const right = unitsOfColumn(section.lines.map((l) => ({ text: l.right, wrapped: l.rightWrapped })))
    const byId = new Map(left.filter((u) => u.id).map((u) => [u.id!, u]))
    const used = new Set<string>()

    for (const unit of right) {
      const mate = unit.id ? byId.get(unit.id) : undefined
      if (mate?.id) used.add(mate.id)
      const row = rowOf(unit.gld ?? mate?.gld ?? null, mate?.text ?? '', unit.text)
      if (row) rows.push(row)
    }
    // A § the draft repeals appears only on the left. Printed in the proposed
    // column's order everything else follows, it would otherwise vanish.
    for (const unit of left) {
      if (!unit.id || used.has(unit.id)) continue
      const row = rowOf(unit.gld, unit.text, '')
      if (row) rows.push(row)
    }
  }
  return rows
}
