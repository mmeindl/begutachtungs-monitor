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

/**
 * The column boundary: the emptiest vertical strip in the middle of the page.
 *
 * Two anchors were tried and both failed. The page midline is wrong because
 * the columns are not symmetric — on one annex the proposed column *starts* at
 * x = 414,7 while the midline is 421, so 1.321 right-column lines were filed
 * as crossing both columns and produced 1.258 phantom Artikel rows. The
 * midpoint between the two header labels is no better: it landed at 415,9,
 * still to the *right* of that column's first character, so the same lines
 * still straddled it.
 *
 * What the layout does guarantee is a gutter: a strip of page that no line of
 * either column reaches into. Counting how many text runs cover each
 * horizontal position and taking the minimum finds it without assuming
 * symmetry, a header, or a template — a spanning heading crosses the gutter,
 * but only a handful do, while every body line piles up on one side or the
 * other (2026-09-09).
 */
export function columnBoundary(pages: readonly AnnexPage[]): number {
  const width = pages[0]?.width ?? 842
  // A narrow band around the middle. The real offsets measured are under
  // 8 pt on an 842 pt page — about 1 % — so a ±5 % window covers every annex
  // while keeping the answer from wandering off on a sparsely filled page,
  // where the emptiest strip is not the gutter but simply blank paper.
  const from = Math.floor(width * 0.45)
  const to = Math.ceil(width * 0.55)
  const coverage = new Array<number>(to - from + 1).fill(0)
  for (const page of pages) {
    for (const item of page.items) {
      if (!item.text.trim()) continue
      const a = Math.max(from, Math.floor(item.x))
      const b = Math.min(to, Math.ceil(item.x + item.width))
      for (let x = a; x <= b; x++) coverage[x - from]!++
    }
  }
  let best = Math.round(width / 2)
  let least = Number.POSITIVE_INFINITY
  // Ties go to the strip nearest the middle of the page, which is where the
  // gutter sits in every annex measured.
  for (let i = 0; i < coverage.length; i++) {
    const x = from + i
    const score = coverage[i]!
    if (score < least || (score === least && Math.abs(x - width / 2) < Math.abs(best - width / 2))) {
      least = score
      best = x
    }
  }
  return best
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
 *
 * An Anlage counts too, and it may open behind the annex's own elision
 * bracket: "[...] Anlage 2 zu § 5 Festlegungen für …". Requiring the marker at
 * the very start of the line meant every schedule of a Verordnung was appended
 * to whichever § happened to be open — the Radonschutzverordnung filed all six
 * of its Anlagen onto §§ 1 to 6 and scored 11–45 % against the wrong
 * provisions (2026-09-09). The marker itself is group 1, without the prefix.
 */
const UNIT_RE = /^(?:\[\s*(?:\.\.\.|…)\s*\]\s*|(?:\.\.\.|…)\s*)*(§\s*\d+[a-z]*\.|Art(?:\.|ikel)\s*\d+[a-z]*(?=\s)|Anlage\s+[\dIVXL]+[a-z]?|Anhang\s+[\dIVXL]+[a-z]?)/
/**
 * A law boundary inside a package: "Artikel 3", "Artikel 3 (Änderung des …)",
 * "Artikel VI". Three things this must *not* match, all observed:
 * "Art. 31 EUStA-VO" is a citation, "Artikel 10. (1) Bundessache ist …" is a
 * *provision* of a law that is itself organised in Artikel (B-VG), and
 * "Artikel 29b der Bilanz-Richtlinie" is a citation whose title starts with an
 * article. Hence: the full word, no trailing period, and a title that does not
 * open with a genitive article (2026-09-09).
 */
const LAW_BOUNDARY_RE = /^Artikel\s+(X?\d+[a-z]?|[IVXL]+)(?:\s+(?!der\b|des\b|Abs\.)(.+))?$/
/** "Änderung des Aktiengesetzes" — the law's name, printed under its Artikel line. */
const LAW_TITLE_RE = /^(?:Änderung(?:en)?\s+(?:des|der)\b|Bundesgesetz,|Aufhebung\s+(?:des|der)\b)/i

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
export function linesFromPage(page: AnnexPage, boundary?: number): AnnexLine[] {
  const mid = boundary ?? page.width / 2
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
  /** The heading the annex printed over this provision, across both columns */
  context: string | null
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
function unitsOfColumn(lines: readonly { text: string; wrapped: boolean; context?: string }[]): ColumnUnit[] {
  const units: { gld: string | null; context: string | null; parts: { text: string; wrapped: boolean }[] }[] = []
  let current: { gld: string | null; context: string | null; parts: { text: string; wrapped: boolean }[] } = { gld: null, context: null, parts: [] }

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
    current = { gld: normalizeText(marker[1] ?? marker[0]), context: line.context ?? null, parts: [...carried, line] }
  }
  if (current.gld !== null || current.parts.length > 0) units.push(current)

  // The identifier has to carry the *kind*, not just the number. "§ 1.",
  // "Artikel 1" and "Anlage 1" all reduce to "1", and joining the two columns
  // on that alone paired the Radonschutzverordnung's Anlage 1 with the
  // proposed § 1 — six schedules scored 11–45 % against unrelated provisions
  // (2026-09-09).
  const built = units.map((u) => ({ id: u.gld ? idOfMarker(u.gld) : null, gld: u.gld, context: u.context, text: joinLines(u.parts) }))

  // A designation may occur twice in one column, because many annexes reprint
  // the law's **Inhaltsverzeichnis** first: "§ 1. Unmittelbare
  // Bundesvollziehung", "§ 2. Bezugnahme auf Unionsrecht", one line each. Read
  // as provisions, a table of contents became 100+ phantom § — the
  // Gaswirtschaftsgesetz alone produced 187 rows, 22 % of the whole corpus,
  // and 95 % of them matched nothing (2026-09-09). The substantive occurrence
  // is the longer one; a § that only ever appears in the contents keeps its
  // title, which is honest, rather than displacing the real text.
  const longest = new Map<string, { id: string | null; gld: string | null; context: string | null; text: string }>()
  for (const unit of built) {
    if (!unit.id) continue
    const seen = longest.get(unit.id)
    if (!seen || unit.text.length > seen.text.length) longest.set(unit.id, unit)
  }
  return built.filter((u) => u.id === null || longest.get(u.id) === u)
}

function idOfMarker(gld: string): string | null {
  const number = /(\d+[a-z]*|[IVXL]+)/.exec(gld)?.[1]
  if (!number) return null
  const kind = /^(?:Anlage|Anhang)/i.test(gld) ? 'anlage' : /^Art/i.test(gld) ? 'artikel' : 'para'
  return `${kind}:${number}`
}

function rowOf(gld: string | null, current: string, proposed: string, context: string | null = null): ComparisonRow | null {
  if (!current && !proposed) return null
  const elided = ELIDED_RE.test(current) && ELIDED_RE.test(proposed)
  const change = classify(current, proposed)
  const segments = change === 'changed' && !elided ? diffTokens(current, proposed).segments : null
  return {
    kind: 'pair',
    heading: context,
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
  const boundary = columnBoundary(pages)
  const lines = pages.flatMap((page) => linesFromPage(page, boundary)).filter((line) => !isChrome(line))

  // An Artikel heading spans both columns and starts a new law inside a
  // package. Everything between two of them is one law's comparison, parsed
  // per column and joined on the designation.
  const sections: { heading: string | null; lines: AnnexLine[] }[] = [{ heading: null, lines: [] }]
  /** Context headings waiting for the provision they stand over. */
  let pendingHeading: string[] = []
  const contextFor = new Map<AnnexLine, string>()
  for (const line of lines) {
    // Two different things, and conflating them cost five tests. A run that
    // genuinely *crosses* the column boundary is a heading. Text that merely
    // reads the same in both columns is the ordinary case for a provision the
    // draft leaves unchanged — treating that as a heading swallowed the law.
    const crossing = line.spanning
    const mirrored = line.left && line.left === line.right ? line.left : null
    const section = sections[sections.length - 1]!

    // A law boundary is printed either way: spanning, or repeated in each cell.
    const boundary = [crossing, mirrored].find((t) => t && LAW_BOUNDARY_RE.test(t))
    if (boundary) {
      sections.push({ heading: boundary, lines: [] })
      continue
    }
    // The law's name sits on the line below its Artikel number and completes it.
    const title = [crossing, mirrored].find((t) => t && LAW_TITLE_RE.test(t))
    if (title && section.heading && section.lines.length === 0) {
      section.heading = `${section.heading} — ${title}`
      continue
    }
    // Every *other* heading across both columns — Abschnitt, Hauptstück, a
    // heading over a group of §§ — is context for the provision beneath it,
    // not a group of its own. Emitting one row each turned 109 annexes into
    // 2.154 "Artikel" rows where there are some 400 boundaries.
    //
    // It goes into the row's `heading`, not into its text. Written inline it
    // was identical on both sides and so harmless to the diff, but it put
    // words into the provision that the standing law files above it — every
    // such § then failed the check against RIS through no fault of the parse
    // (2026-09-09).
    if (crossing) {
      pendingHeading.push(crossing)
      continue
    }
    if (pendingHeading.length > 0) {
      contextFor.set(line, pendingHeading.join(' '))
      pendingHeading = []
    }
    section.lines.push(line)
  }

  for (const section of sections) {
    if (section.heading) {
      rows.push({ kind: 'article', heading: section.heading, gld: null, current: '', proposed: '', change: 'unchanged', marked: false, elided: false, segments: null, editorial: false })
    }
    const left = unitsOfColumn(section.lines.map((l) => ({ text: l.left, wrapped: l.leftWrapped, context: contextFor.get(l) })))
    const right = unitsOfColumn(section.lines.map((l) => ({ text: l.right, wrapped: l.rightWrapped, context: contextFor.get(l) })))
    const byId = new Map(left.filter((u) => u.id).map((u) => [u.id!, u]))
    const used = new Set<string>()

    for (const unit of right) {
      const mate = unit.id ? byId.get(unit.id) : undefined
      if (mate?.id) used.add(mate.id)
      const row = rowOf(unit.gld ?? mate?.gld ?? null, mate?.text ?? '', unit.text, unit.context ?? mate?.context ?? null)
      if (row) rows.push(row)
    }
    // A § the draft repeals appears only on the left. Printed in the proposed
    // column's order everything else follows, it would otherwise vanish.
    for (const unit of left) {
      if (!unit.id || used.has(unit.id)) continue
      const row = rowOf(unit.gld, unit.text, '', unit.context)
      if (row) rows.push(row)
    }
  }
  return rows
}
