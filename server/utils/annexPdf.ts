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
import { candidateOf, headingOf, resolveBoundaries, type BoundaryCandidate } from './annexBoundaries'
import { diffTokens, isEditorialChange } from './lawDiff'
import { normalizeText } from './lawText'
import type { DraftArticle } from './lawTitles'
import { classify, HEADER_CURRENT_RE, HEADER_PROPOSED_RE, isElidedPair, type ComparisonRow } from './textComparison'

/**
 * One positioned text run, in PDF user space: origin bottom-left, y upward,
 * x along the reading direction. A turned page is put into this frame by
 * `uprightRuns` in `annexPdfPages.ts`, so everything here can assume it.
 */
export interface AnnexItem {
  x: number
  y: number
  width: number
  text: string
}

/**
 * What `uprightRuns` had to decide to put this page into that frame.
 *
 * Not optional, and that is the point: every page the request path reads comes
 * from `uprightRuns`, and a page that cannot say how it was read would have to
 * be believed. The gate below is the same kind of check as the header pair —
 * evidence that the arrangement is the ressort's and not ours.
 */
export interface PageGeometry {
  /** Text runs on the page; a run without visible text says nothing. */
  runs: number
  /** Runs whose baseline points a different quarter turn from the frame chosen. */
  offTurn: number
  /** Runs whose baseline is off *every* quarter turn by more than a degree. */
  skewed: number
}

export interface AnnexPage {
  width: number
  items: readonly AnnexItem[]
  geometry: PageGeometry
}

/** A visual line, already split at the column boundary. */
interface AnnexLine {
  left: string
  right: string
  /** A heading that runs across both columns — an Artikel or a law title */
  spanning: string | null
  /**
   * Where each column's text starts. Not a heading test: a centred heading was
   * to be told from a wrapped body line by its equal slack on both sides, and
   * over the corpus that does not separate them — 833 lines of plain body text
   * are as symmetric as 1.564 headings, because a justified line ends at the
   * edge and starts at the margin, so both slacks are zero (2026-09-10). What
   * they are read for is `headerSeam`, on the one line whose two cells the
   * Rundschreiben fixes.
   */
  leftStart: number
  rightStart: number
  /** Where each column's text ends — the evidence that a line wrapped */
  leftEnd: number
  rightEnd: number
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

/** How far a page's width may fall from the document's before it is another page. */
const WIDTH_TOLERANCE = 0.01
/** Runs allowed to disagree with the frame the page was read in. */
const OFF_TURN_SHARE = 0.05

/**
 * Whether this page is set the way the rest of the document is.
 *
 * Everything below reads a column out of a coordinate, and the document-wide
 * boundary is one number for every page — so a page that is set differently is
 * not read differently, it is read *wrongly*, and in words that are all real.
 * A portrait continuation page in a landscape annex, a page whose text was
 * scanned at an angle, a block rotated inside an otherwise upright page: none
 * of those would show up anywhere downstream.
 *
 * Measured over the 3.213 pages of the 114 GP-XXVIII annexes: no document
 * mixes page widths, no page carries a run that disagrees with its majority
 * quarter turn, and no run is skewed (2026-09-10). **The gate costs nothing
 * today** — that is what makes it worth having before the corpus produces the
 * first such page rather than after.
 *
 * A single stray run must not refuse a sound page: a page number set upright
 * on an otherwise turned page is one run against thirty. Above a twentieth of
 * the page's runs the frame is no longer a majority but a coin toss.
 */
function isProven(page: AnnexPage, width: number): boolean {
  // A page without text cannot be misread, and refusing it would report a
  // loss the reader did not suffer.
  if (page.geometry.runs === 0) return true
  if (Math.abs(page.width - width) > width * WIDTH_TOLERANCE) return false
  if (page.geometry.skewed > 0) return false
  return page.geometry.offTurn <= page.geometry.runs * OFF_TURN_SHARE
}

/** The width the document is set in: the one most of its pages share. */
function dominantWidth(pages: readonly AnnexPage[]): number {
  const byWidth = new Map<number, number>()
  for (const page of pages) {
    const rounded = Math.round(page.width)
    byWidth.set(rounded, (byWidth.get(rounded) ?? 0) + 1)
  }
  // Insertion order is page order, so a tie keeps the earliest width. No
  // document in the corpus has one.
  let best = pages[0] ? Math.round(pages[0].width) : 842
  for (const [rounded, n] of byWidth) if (n > (byWidth.get(best) ?? 0)) best = rounded
  return best
}

/** Lines within this many points of each other sit on one baseline. */
const BASELINE_TOLERANCE = 2.5
/**
 * How far past the gutter a run has to reach before it belongs to neither
 * column. A left-column line may overhang the emptiest strip by a few points
 * — the strip is a point, the gutter is a band — and a centred heading crosses
 * it outright.
 */
const GUTTER_TOLERANCE = 18

/** Where each column's text ends, in x. */
interface ColumnEdges {
  left: number
  right: number
}

/**
 * A column's edge has to be measured from that column, and the same number
 * cannot serve both.
 *
 * "This line wrapped" is decided by whether the line reached the edge of its
 * column, and the rule used to measure the left column against the gutter and
 * the right column against the *page* edge. But the right column's text stops
 * some 85 pt short of the page (median over the 114 GP-XXVIII annexes: 84,8 pt;
 * min 18,5, max 88,5), so `> width − 18` never fired: over the whole corpus not
 * one right-column line counted as wrapped, while the left column's did.
 *
 * That asymmetry is not cosmetic. A § heading set over two lines has a first
 * line that fills the column — wrapped by the test on the left, not wrapped on
 * the right — so the carry in `unitsOfColumn` stopped at it on the left and
 * carried it on the right. The § then read as *changed*, with its own standing
 * heading shown as new text: 70 §§ over the corpus, "Schutz vor Radon bei
 * Überschreitung des Referenzwertes und bei" and the like (2026-09-10).
 *
 * The edge is read off the lines themselves rather than assumed: the annexes
 * are one template (left edge 417,6 pt, right 757,1 pt on an 842 pt page in
 * almost every one of the 114), but the one that is not — an annex whose right
 * column starts at 382 and ends at 799 — would be mis-measured by any constant.
 *
 * **The longest line is not the edge.** A handful of runs escape the column:
 * the Budgetbegleitgesetz 2027-2028 has three left-column lines beyond its
 * edge (438,7 / 435,7 / 422,6 against 417,6) and two on the right, and taking
 * the maximum moved the threshold far enough out that 1.651 wrapped lines
 * became 3 — body text would then have been read as headings. So the top 1 %
 * of lines is set aside, and at least one line always is. On the corpus that
 * lands on the edge in every one of the 114 documents, and the left column's
 * verdicts barely move (1.651 → 1.659 lines on the Budgetbegleitgesetz).
 */
function columnEdge(ends: readonly number[], limit: number): number {
  // An edge measured from a handful of lines is not measured. The smallest
  // column in the corpus prints 10 lines; below that the column's outer limit
  // stands, which is what the rule did everywhere before.
  if (ends.length < 10) return limit
  const sorted = [...ends].sort((a, b) => b - a)
  return sorted[Math.max(1, Math.round(sorted.length / 100))] ?? limit
}

function columnEdges(lines: readonly AnnexLine[], boundary: number, width: number): ColumnEdges {
  return {
    left: columnEdge(lines.filter((l) => l.left).map((l) => l.leftEnd), boundary),
    right: columnEdge(lines.filter((l) => l.right).map((l) => l.rightEnd), width),
  }
}

/**
 * Did this line run to the edge of its column, or did the drafter end it there?
 *
 * How close is close enough used to be the gutter tolerance, and is worth
 * its own number, because the annexes are set **justified**: over the 114
 * documents 39.078 lines stop within a point of their column's edge and 30.768
 * within 3 to 4 points of it — two spikes, the second being the right column,
 * whose few widest lines put the estimate 3,5 pt beyond where its body text
 * ends. From 6 pt outward the histogram is a thin tail (868 lines in 6–7 pt
 * against 8.859 in 4–5). A wrapped line therefore stops at the edge, and the
 * lines standing 6 to 18 pt short of it — which the old tolerance still called
 * wrapped — are centred headings and line-final text.
 */
const WRAP_TOLERANCE = 6

function reachedEdge(end: number, edge: number): boolean {
  return end > edge - WRAP_TOLERANCE
}

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
const UNIT_RE = /^(?:\[\s*(?:\.\.\.|…)\s*\]\s*|(?:\.\.\.|…)\s*)*(§\s*\d+[a-z]*\.\d+\.?|§\s*\d+[a-z]*\.|Art(?:\.|ikel)\s*\d+[a-z]*(?=\s)|Anlage\s+[\dIVXL]+[a-z]?|Anhang\s+[\dIVXL]+[a-z]?)/
/**
 * What follows a designation that is a *citation* rather than a provision.
 *
 * "Art. 92 Abs. 1 Buchstabe d der Verordnung (EU) 2024/1689" is running text,
 * and a wrapped line beginning with one opened a provision that does not
 * exist — which the check against RIS then looked up as § 92. A designation
 * that opens a provision is followed by the provision, not by a subdivision
 * of something else. 23 of the worst-scoring rows carrying real prose were
 * this one shape (2026-09-09).
 */
const CITATION_TAIL_RE = /^\s*(?:Abs\.|Z\s|lit\b|Buchstabe|Unterabsatz|Nr\.|Nummer|der\b|des\b|dieser\b|dieses\b|und\b|bis\b|sowie\b|zur\b|zum\b|in\b)/
/** "Artikel 3" with nothing else on the line. */
const BARE_ARTICLE_RE = /^Artikel\s+(?:X?\d+[a-z]?|[IVXL]+)$/
/** A qualifier that stands where the law's name would, and is not one. */
const QUALIFIER_RE = /^\((?:Verfassungs|Grundsatz)bestimmung(?:en)?\)$/i

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
  const buckets: { y: number; left: Run[]; right: Run[]; spanning: Run[]; leftEnd: number; rightEnd: number; leftStart: number; rightStart: number }[] = []

  for (const item of page.items) {
    if (!item.text.trim()) continue
    let bucket = buckets.find((b) => Math.abs(b.y - item.y) <= BASELINE_TOLERANCE)
    if (!bucket) {
      bucket = { y: item.y, left: [], right: [], spanning: [], leftEnd: 0, rightEnd: 0, leftStart: Number.POSITIVE_INFINITY, rightStart: Number.POSITIVE_INFINITY }
      buckets.push(bucket)
    }
    const right = item.x + item.width
    if (item.x < mid && right > mid + GUTTER_TOLERANCE) {
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
      bucket.rightStart = Math.min(bucket.rightStart, item.x)
    }
  }

  return buckets
    .sort((a, b) => b.y - a.y)
    .map((b) => ({
      left: joinRuns(b.left),
      right: joinRuns(b.right),
      spanning: b.spanning.length ? joinRuns(b.spanning) : null,
      leftStart: b.leftStart,
      rightStart: b.rightStart,
      leftEnd: b.leftEnd,
      rightEnd: b.rightEnd,
    }))
}

/**
 * The mandated header pair, left against right.
 *
 * It is chrome — it repeats on every page — and it is also the one piece of
 * evidence that the column geometry was read the way the ressort typeset it,
 * which is what `parseAnnexPdf` gates on.
 */
function isHeaderLine(line: AnnexLine): boolean {
  return HEADER_CURRENT_RE.test(line.left.trim()) && HEADER_PROPOSED_RE.test(line.right.trim())
}

/**
 * Where this page puts the seam between its two columns, said by the ressort.
 *
 * The header pair is centred over the two columns, so the midpoint between the
 * two labels is the page's own account of where one column ends and the other
 * begins — the very number `columnBoundary` estimates from the ink for the
 * whole document. A page whose columns sit elsewhere says so here.
 *
 * **Neither label on its own carries it.** A label's own centre moves when the
 * ressort re-sets the title page: the Weinrecht-Sammelverordnung 2024 sets
 * "Geltende Fassung" 8,2 pt further right on page 1 and "Vorgeschlagene
 * Fassung" 4,9 pt further left, so a gate on one label would refuse a page
 * that is set exactly like its neighbours. The midpoint of the two moves 1,6 pt
 * (2026-09-11) — the labels shifted toward each other, and the seam between
 * them did not move. Three of the 114 annexes qualify the wording ("Geltende
 * Fassung nach Inkrafttreten EuGB-VVG"), which changes a label's width and
 * again not the midpoint.
 */
function headerSeam(lines: readonly AnnexLine[]): number | null {
  for (const line of lines) {
    if (!isHeaderLine(line)) continue
    if (!Number.isFinite(line.leftStart) || !Number.isFinite(line.rightStart)) continue
    // The midpoint of the two label centres — ((l0 + l1)/2 + (r0 + r1)/2)/2.
    return (line.leftStart + line.leftEnd + line.rightStart + line.rightEnd) / 4
  }
  return null
}

/**
 * How far a page's seam may sit from the one its document agrees on.
 *
 * Measured over the 3.121 header pages of the 114 GP-XXVIII annexes
 * (2026-09-11): 3.118 lie within 0,5 pt of their document's seam and three
 * between 1,59 and 1,74 pt — two pages of the Informationsfreiheits-
 * anpassungsgesetz and the Weinrecht title page. Nothing lies between 1,74 pt
 * and the width of the page, so the tolerance is set at more than twice the
 * largest deviation the corpus prints, and it is still the widest value that
 * refuses a page displaced by 5 pt — the smallest displacement measured to
 * change the parse (41 of 114 annexes at +5 pt, 72 at −5 pt).
 */
const SEAM_TOLERANCE = 4

/**
 * The seam the document's header pages agree on: the one most of them share.
 *
 * A median would be the obvious choice and is the wrong one for exactly the
 * case this gate is for. Where a document mixes two layouts the seams are two
 * clusters, and the median of two clusters is the empty space between them —
 * both clusters would then be more than the tolerance away, and the parse
 * would refuse the whole annex rather than the odd page. Plurality cannot do
 * that: the winning value is one the pages actually printed.
 *
 * A tie keeps the earliest page's seam, as `dominantWidth` keeps the earliest
 * width. No document in the corpus needs the rule: 110 of the 114 print one
 * single seam value on every page they head, and the other four spread it over
 * 1,74 pt at most (2026-09-11).
 */
function agreedSeam(seams: readonly number[]): number | null {
  let best: number | null = null
  let support = 0
  for (const candidate of seams) {
    const n = seams.filter((seam) => Math.abs(seam - candidate) <= SEAM_TOLERANCE).length
    if (n > support) {
      support = n
      best = candidate
    }
  }
  return best
}

/** Page furniture the Rundschreiben requires on every page — not content. */
function isChrome(line: AnnexLine): boolean {
  const both = `${line.left} ${line.right} ${line.spanning ?? ''}`.trim()
  if (!both) return true
  if (PAGE_NUMBER_RE.test(line.right.trim()) && !line.left.trim()) return true
  if (PAGE_NUMBER_RE.test(line.left.trim()) && !line.right.trim()) return true
  if (TITLE_RE.test((line.spanning ?? both).replace(/\s+/g, ''))) return true
  return isHeaderLine(line)
}

/**
 * Wrapped lines are joined with a space; a hyphen is only dissolved when the
 * line actually reached the column edge.
 *
 * German legal drafting is full of legitimate trailing hyphens —
 * "Staatsschutz- und Nachrichtendienst-Gesetz" — so dissolving every
 * line-final hyphen would weld "Staatsschutzund". Reaching the margin is the
 * signal that the hyphen is the typesetter's rather than the drafter's.
 *
 * **And it is the line carrying the hyphen that has to have reached it.** This
 * asked `part.wrapped` — the flag of the line *after* the break, which says
 * nothing about why the line before it ended in a hyphen. The two mistakes are
 * mirror images: a hyphen at a real column edge stayed in the text when the
 * continuation line happened to be short, and a drafter's own hyphen was
 * dissolved when the line after it happened to be full. Present since the
 * parser was written and without effect on the right column until 2026-09-10,
 * because no right-column line ever counted as wrapped before each column was
 * measured against its own edge (`columnEdge`).
 */
function joinLines(parts: { text: string; wrapped: boolean }[]): string {
  let out = ''
  /** Whether the line that `out` currently ends with ran to its column's edge. */
  let carrierWrapped = false
  for (const part of parts) {
    if (!part.text) continue
    if (out === '') out = part.text
    else if (/[a-zäöüß]-$/.test(out) && carrierWrapped) out = `${out.slice(0, -1)}${part.text}`
    else out = `${out} ${part.text}`
    carrierWrapped = part.wrapped
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
/** The same marks, anywhere in a text: does this passage contain a sentence at all? */
const SENTENCE_MARK = /[.;:!?…]/

/**
 * A designation, a title, and nothing else, in one column only: the annex's
 * **Inhaltsverzeichnis**, not a provision.
 *
 * `unitsOfColumn` already drops a contents entry where the annex also prints
 * the § itself — the longer occurrence wins. What survived that were the
 * entries of §§ the annex never prints, and they left no mate in the other
 * column either, so the page announced them as *new law*. Four of the five in
 * the corpus are provisions that have been in force for years, with the very
 * heading the annex prints: § 79a Mindestbesteuerungsgesetz
 * ("Währungsumrechnungen"), § 13a GAP-Strategieplan-Anwendungsverordnung,
 * § 11 Energie-Control-Gesetz, § 77d BWG — and two of those drafts say in so
 * many words that they are amending the *table of contents* ("Im
 * Inhaltsverzeichnis werden nach dem Eintrag zu § 77c folgende Einträge …
 * eingefügt"). The fifth, § 49a Schifffahrtsgesetz, is a genuinely new § whose
 * contents entry stands in the reprinted Inhaltsverzeichnis at the head of the
 * annex while the annex prints §§ 47a, 47b, 48a and 49b in full below it — so
 * the line dropped there is the contents entry, not the provision
 * (all measured 2026-09-10).
 *
 * A provision has a body, and a body contains a sentence. A contents entry
 * does not: the five tails run from 20 to 58 characters and carry no sentence
 * mark at all. **Nothing after the designation** is a different case and stays
 * — a repealed "§ 5." with an empty proposed column says something — and so
 * does the ressort's elision, because "§ 4a. Kontrollregister …" is the annex
 * stating that it left the text out.
 */
function isContentsEntry(gld: string | null, text: string): boolean {
  if (gld === null) return false
  const at = text.indexOf(gld)
  if (at < 0) return false
  const tail = text.slice(at + gld.length).trim()
  return tail !== '' && !SENTENCE_MARK.test(tail)
}

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
  type Line = { text: string; wrapped: boolean }
  type Unit = { gld: string | null; context: string | null; parts: Line[]; opener: Line | null }
  const units: Unit[] = []
  let current: Unit = { gld: null, context: null, parts: [], opener: null }

  for (const line of lines) {
    if (!line.text) continue
    const marker = UNIT_RE.exec(line.text)
    // "§ 5." can only be a designation. "Art. 92", "Anlage 4" and "Anhang I"
    // are as often citations, and there the text after the number decides.
    const cited = marker !== null && !marker[1]!.startsWith('§') && CITATION_TAIL_RE.test(line.text.slice(marker[0].length))
    if (!marker || cited) {
      current.parts.push(line)
      continue
    }
    const carried: Line[] = []
    while (current.parts.length > 0 && carried.length < 3) {
      const last = current.parts[current.parts.length - 1]!
      // A unit's own marker line is never handed to the next unit. It could
      // be: a line that opens a § and ends without a full stop looks exactly
      // like a heading, and every line of an **Inhaltsverzeichnis** is of
      // that shape. Annexes reprint the table of contents, so each entry was
      // dragged three §§ forward — "[§ 5.] § 2. Bezugnahme auf Unionsrecht" —
      // and 126 of the worst-scoring rows in the corpus were that one bug
      // (2026-09-09).
      if (last === current.opener) break
      if (last.wrapped || SENTENCE_END.test(last.text)) break
      carried.unshift(current.parts.pop()!)
    }
    if (current.gld !== null || current.parts.length > 0) units.push(current)
    current = { gld: normalizeText(marker[1] ?? marker[0]), context: line.context ?? null, parts: [...carried, line], opener: line }
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
  // A law numbered in decimals ("§ 1.08") keeps the whole number: cut at the
  // first period, every one of its §§ collapses onto "1".
  const number = /(\d+[a-z]*(?:\.\d+)?|[IVXL]+)/.exec(gld)?.[1]
  if (!number) return null
  const kind = /^(?:Anlage|Anhang)/i.test(gld) ? 'anlage' : /^Art/i.test(gld) ? 'artikel' : 'para'
  return `${kind}:${number}`
}

function rowOf(law: string | null, gld: string | null, current: string, proposed: string, context: string | null = null): ComparisonRow | null {
  if (!current && !proposed) return null
  const elided = isElidedPair(current, proposed)
  const change = classify(current, proposed)
  const segments = change === 'changed' && !elided ? diffTokens(current, proposed).segments : null
  return {
    kind: 'pair',
    law,
    heading: context,
    gld,
    // A PDF row already collects a whole provision, so the § it belongs to is
    // the § it opens; there are no continuation rows to inherit anything.
    para: gld,
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
 * The text of a line that is a heading by construction, or null.
 *
 * Two structural facts do the work, and neither needs a font or a font size —
 * 30 of the real boundary headings are set at body size, so type is evidence
 * and not a test. A run that **crosses the gutter** cannot belong to either
 * column. A line that **did not reach the column edge** did not wrap, and a
 * heading never wraps while body text almost always does. Without the wrap
 * test a mirrored line of running text that happens to start "Artikel 8 EMRK
 * garantiert …" reads as a law boundary.
 */
function headingText(line: AnnexLine, edges: ColumnEdges): string | null {
  if (line.spanning) return line.spanning
  if (reachedEdge(line.leftEnd, edges.left) || reachedEdge(line.rightEnd, edges.right)) return null
  if (line.left && line.left === line.right) return line.left
  if (line.left && !line.right) return line.left
  if (line.right && !line.left) return line.right
  return null
}

/** What a line does in the document, decided before any of them is read as text. */
type Role =
  | { role: 'candidate'; at: number }
  | { role: 'title'; at: number }
  | { role: 'heading' }

/**
 * The lines that might open a law, with the title that belongs to each.
 *
 * The law's name sits on the line *below* its Artikel number, so a candidate
 * reaches forward for it — past "(Verfassungsbestimmung)", which stands where
 * the name would but is a qualifier, and stopping at anything that opens a
 * provision.
 */
function candidateLines(lines: readonly AnnexLine[], edges: ColumnEdges): { candidates: BoundaryCandidate[]; roles: Map<number, Role> } {
  const candidates: BoundaryCandidate[] = []
  const roles = new Map<number, Role>()

  for (const [i, line] of lines.entries()) {
    if (roles.has(i)) continue
    const text = headingText(line, edges)
    if (text === null) continue
    const candidate = candidateOf(text)
    if (!candidate) {
      if (line.spanning) roles.set(i, { role: 'heading' })
      continue
    }
    // A one-sided line is the ordinary shape of an inserted or repealed
    // provision, not of a heading. Only the bare "Artikel 3" is taken from
    // one — an annex that leaves the other cell empty at a boundary does
    // print it bare (2026-09-09).
    const oneSided = !line.spanning && line.left !== line.right
    if (oneSided && !BARE_ARTICLE_RE.test(text)) continue

    const at = candidates.length
    if (candidate.numeral !== null && !candidate.title) {
      for (let j = i + 1; j < lines.length; j++) {
        const next = headingText(lines[j]!, edges)
        if (next === null) break
        if (QUALIFIER_RE.test(next)) {
          roles.set(j, { role: 'title', at })
          continue
        }
        if (/^[§(]/.test(next) || candidateOf(next)?.numeral) break
        candidate.title = next
        roles.set(j, { role: 'title', at })
        break
      }
    }
    candidates.push(candidate)
    roles.set(i, { role: 'candidate', at })
  }
  return { candidates, roles }
}

export interface AnnexParse {
  rows: ComparisonRow[]
  /**
   * Why the package's laws could not be told apart, in words fit to show a
   * reader; null when they could. The rows are still worth showing — they
   * just carry no law of their own.
   */
  refusal: string | null
  /**
   * Why the PDF could not be read as a comparison at all. `rows` is then
   * empty, which the caller already treats as "not readable" — this only says
   * which of the ways it failed, for the harnesses and the log.
   */
  unreadable?: string
  /**
   * Blocks of the annex that belong to no provision and were left out —
   * everything a column prints before its first § marker, and the entries of
   * a reprinted Inhaltsverzeichnis that no provision of the annex answers.
   *
   * Optional and not yet read anywhere: a caller that wants to disclose "so
   * many blocks of the annex are not shown" can, and until one does the
   * number is at least in the harness output rather than nowhere.
   */
  unplaced?: number
  /**
   * Pages whose geometry the parse could not vouch for and therefore did not
   * read — 0 when none, which is every document of GP XXVIII (`isProven`).
   * Counted rather than explained: the caller phrases what a missing page
   * means to a reader, and only it knows how many rows are left.
   *
   * Pages without any text do not count: nothing on them could be misread.
   */
  droppedPages: number
}

/**
 * The annex PDF's pages → the same rows the XML path produces.
 *
 * Rows are cut at the paragraph designation: a PDF carries no row elements,
 * and the provision is the only boundary the two columns are guaranteed to
 * share. That is coarser than the XML path's cell pairs, and aligned on
 * something the layout actually promises.
 *
 * `articles` is the draft's own Artikel list (`draftArticles`). It is not
 * optional in substance: without it every heading that *looks* like a law
 * boundary would have to be believed, and the annex prints four different
 * things in that shape. Passing an empty list says "no draft to check
 * against", and the annex is then read as one undivided law.
 */
export function parseAnnexPdf(pages: readonly AnnexPage[], articles: readonly DraftArticle[] = []): AnnexParse {
  const rows: ComparisonRow[] = []
  // The pages this parse will stand behind. A page set differently from the
  // rest of the document is left unread rather than sliced at a boundary that
  // is not its own — twice over: `isProven` on its width, turn and skew, and
  // the seam of its header pair on where its columns lie. The boundary and the
  // column edges below are measured over the survivors alone.
  const width = dominantWidth(pages)
  const proven = pages.filter((page) => isProven(page, width))
  if (pages.length > proven.length && proven.every((page) => page.geometry.runs === 0)) {
    return { rows: [], refusal: null, droppedPages: pages.length - proven.length, unreadable: 'Auf keiner Seite der Beilage war die Seitengeometrie belegt: Breite, Drehung oder Schräglage der Textläufe weichen voneinander ab.' }
  }
  const estimate = columnBoundary(proven)
  const read = proven.map((page) => {
    const lines = linesFromPage(page, estimate)
    return { page, lines, seam: headerSeam(lines) }
  })

  // The second half of the page gate. `isProven` vouches for a page's width,
  // turn and skew — for how it was read *inside itself* — and not for its
  // columns standing where the document's do. That is the harder failure,
  // because the boundary is one number for every page: a page whose columns
  // sit elsewhere is not read differently but *wrongly*, in words that are all
  // real, and its two columns bleed into one another as "neu" and "entfällt".
  //
  // The header pair answers it where a page prints one, which is 3.121 of the
  // 3.213 pages. Measured 2026-09-11 by shifting one page of each annex
  // sideways and re-parsing through this very function: a displacement of 5 pt
  // already changes the parse of 41 annexes and one of 40 pt changes 104, and
  // the gate refuses 663 of the 683 displacements that changed anything
  // (97,1 %) while refusing none of the 3.213 pages as they stand. Of the 20 it
  // misses, 15 are the two pages that print no header pair, and 5 are the one
  // annex whose header pair appears on a single page — a page held against
  // nothing is held against itself (7 of the 114 print it once).
  //
  // The 92 pages without a header pair keep today's behaviour. A title or
  // continuation page states no seam, and 78 of them carry real two-column
  // lines, so refusing *those* was measured and rejected the day before.
  //
  // **A displaced page is refused even where it would have come out right** —
  // 176 of 229 such pages in the same run. Asking additionally that splitting
  // at the page's own seam would put some run in another column was measured:
  // it would spare 134 of them and lose 99 of the real faults, because a page
  // can also be misread through the column *edges* — its lines are judged for
  // wrapping against the document's edge, and that is how 70 §§ once showed
  // their own standing heading as new text. A refused page is a hole the
  // reader is told about; a misread one is words nobody can tell from the
  // ressort's. So the seam decides, not its consequences.
  const agreed = agreedSeam(read.map((p) => p.seam).filter((seam): seam is number => seam !== null))
  const vouched = agreed === null ? read : read.filter((p) => p.seam === null || Math.abs(p.seam - agreed) <= SEAM_TOLERANCE)
  const droppedPages = pages.length - vouched.length
  // Boundary and column edges are measured over the pages the parse stands
  // behind, so a page refused here must not be in them either. Re-measuring is
  // only worth it when the gate actually took one — today it never does.
  const boundary = vouched.length === read.length ? estimate : columnBoundary(vouched.map((p) => p.page))
  const placed = vouched.length === read.length ? vouched.flatMap((p) => p.lines) : vouched.flatMap((p) => linesFromPage(p.page, boundary))

  // The one structural check this path has. Everything below reads a column
  // out of a coordinate, and nothing in the text itself would reveal that the
  // coordinates were misread: the words are real, only their arrangement is
  // ours. The Rundschreiben's header pair, found as a left/right line, is the
  // proof that the two columns were separated where the ressort separated
  // them — 113 of the 114 GP-XXVIII PDF annexes print it, the 114th only
  // because its pages are turned (2026-09-10). Without it the geometry is a
  // guess, and a guessed comparison is worse than none.
  if (!placed.some(isHeaderLine)) {
    return { rows: [], refusal: null, droppedPages, unreadable: 'Die beiden Spaltenüberschriften der Beilage waren nicht zu finden; die Seitengeometrie ist damit nicht belegt.' }
  }
  const lines = placed.filter((line) => !isChrome(line))
  // Measured over the whole document, like the boundary: a single page need
  // not print one line that reaches its column's edge.
  const edges = columnEdges(placed, boundary, vouched[0]?.page.width ?? width)

  const { candidates, roles } = candidateLines(lines, edges)
  const resolution = resolveBoundaries(candidates, articles)

  const sections: { article: DraftArticle | null; opened: boolean; lines: AnnexLine[] }[] = [
    { article: resolution.whole, opened: false, lines: [] },
  ]
  /** Context headings waiting for the provision they stand over. */
  let pendingHeading: string[] = []
  const contextFor = new Map<AnnexLine, string>()

  for (const [i, line] of lines.entries()) {
    const role = roles.get(i)
    if (role?.role === 'candidate') {
      const article = resolution.accepted.get(role.at)
      if (article) {
        sections.push({ article, opened: true, lines: [] })
        continue
      }
      // A candidate the draft does not confirm is an internal heading — a
      // Roman division of one law, or a provision of a law that is itself
      // organised in Artikel. It stands over the rows below it.
      pendingHeading.push(candidates[role.at]!.text)
      continue
    }
    // The title line of a candidate: part of the heading when the candidate
    // opened a law, context for the rows below when it did not.
    if (role?.role === 'title') {
      if (!resolution.accepted.has(role.at)) pendingHeading.push(headingText(line, edges) ?? '')
      continue
    }
    // Every other heading across both columns — Abschnitt, Hauptstück, a
    // heading over a group of §§ — is context for the provision beneath it,
    // not a group of its own. Emitting one row each turned 109 annexes into
    // 2.154 "Artikel" rows where there are some 400 boundaries.
    //
    // It goes into the row's `heading`, not into its text. Written inline it
    // was identical on both sides and so harmless to the diff, but it put
    // words into the provision that the standing law files above it — every
    // such § then failed the check against RIS through no fault of the parse.
    if (role?.role === 'heading') {
      pendingHeading.push(headingText(line, edges) ?? '')
      continue
    }
    if (pendingHeading.length > 0) {
      contextFor.set(line, pendingHeading.filter(Boolean).join(' '))
      pendingHeading = []
    }
    sections[sections.length - 1]!.lines.push(line)
  }

  let unplaced = 0
  for (const section of sections) {
    const law = section.article?.key ?? null
    if (section.opened && section.article) {
      rows.push({ kind: 'article', law, heading: headingOf(section.article), gld: null, para: null, current: '', proposed: '', change: 'unchanged', marked: false, elided: false, segments: null, editorial: false })
    }
    const left = unitsOfColumn(section.lines.map((l) => ({ text: l.left, wrapped: reachedEdge(l.leftEnd, edges.left), context: contextFor.get(l) })))
    const right = unitsOfColumn(section.lines.map((l) => ({ text: l.right, wrapped: reachedEdge(l.rightEnd, edges.right), context: contextFor.get(l) })))
    const byId = new Map(left.filter((u) => u.id).map((u) => [u.id!, u]))
    const used = new Set<string>()

    // Everything a column prints before its first § marker is one unit
    // without an identifier: the annex's front matter — "Inhaltsverzeichnis",
    // "E n t w u r f", "Gesamte Rechtsvorschrift für …",
    // "Präambel/Promulgationsklausel", a Langtitel. The two columns share no
    // key for it, so it cannot be paired; emitted from the proposed side
    // alone it became an `inserted` row and the page said the draft *adds*
    // the table of contents — 134 such rows across 62 of the 114 GP-XXVIII
    // PDF annexes, one of them 94.000 characters of Inhaltsverzeichnis
    // (2026-09-10). The left column's front matter was already dropped
    // silently, so the asymmetry was the whole of the claim. Both sides are
    // dropped now, and counted.
    for (const unit of right) {
      if (!unit.id) {
        unplaced++
        continue
      }
      const mate = byId.get(unit.id)
      // A one-sided entry of the annex's Inhaltsverzeichnis, which would go
      // out as an insertion — counted, like the front matter above it.
      if (!mate && isContentsEntry(unit.gld, unit.text)) {
        unplaced++
        continue
      }
      if (mate?.id) used.add(mate.id)
      const row = rowOf(law, unit.gld ?? mate?.gld ?? null, mate?.text ?? '', unit.text, unit.context ?? mate?.context ?? null)
      if (row) rows.push(row)
    }
    // A § the draft repeals appears only on the left. Printed in the proposed
    // column's order everything else follows, it would otherwise vanish.
    for (const unit of left) {
      if (!unit.id) {
        unplaced++
        continue
      }
      if (used.has(unit.id)) continue
      if (isContentsEntry(unit.gld, unit.text)) {
        unplaced++
        continue
      }
      const row = rowOf(law, unit.gld, unit.text, '', unit.context)
      if (row) rows.push(row)
    }
  }
  return { rows, refusal: resolution.refusal, unplaced, droppedPages }
}
