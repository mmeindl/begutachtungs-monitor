/**
 * The Textgegenüberstellung as it survives in the PDF (docs/api-exploration.md §2c).
 *
 * PURE MODULE — relative imports only, so vitest runs it directly. The PDF is
 * turned into positioned text runs by the caller; this module never opens a
 * file, which is what makes the geometry testable without a fixture binary.
 *
 * **Why this exists.** `docs/api-exploration.md` recorded that ~40 % of annexes are
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
import { diffTokens, isEditorialChange } from '../diff/wordDiff'
import { normalizeText } from '../lawtext/normalize'
import type { DraftArticle } from '../lawtext/draftArticles'
import { classify, designateAfter, type ComparisonRow } from './comparisonRows'
import { notationOnly } from './annexText'
import { isElisionRangeOnly, isElidedPair } from './elision'
import { HEADER_CURRENT_RE, HEADER_PROPOSED_RE } from './tableCells'
import { PARAGRAPH_NUMBER } from '../../../shared/utils/paragraphNumber'

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

/** Lines within this many points of each other sit on one baseline. */
const BASELINE_TOLERANCE = 2.5

/**
 * A page's runs, grouped into the visual lines they sit on.
 *
 * One definition of "a line" for the whole module: `columnBoundary` reads the
 * gap between the columns off these groups and `linesFromPage` splits the very
 * same groups at the boundary that comes out. A gutter measured over a
 * different grouping than the one it is then applied to would be measuring
 * something else.
 *
 * Order is preserved: a group's position is that of its first run, and within
 * a group the runs stand as the page listed them.
 */
const BASELINES = new WeakMap<AnnexPage, AnnexItem[][]>()

function baselines(page: AnnexPage): AnnexItem[][] {
  const known = BASELINES.get(page)
  if (known) return known
  const groups: { y: number; items: AnnexItem[] }[] = []
  // Which groups sit near a given y, without scanning all of them: two groups
  // are always MORE than one tolerance apart — closer and the second would
  // have joined the first — so a bucket one tolerance wide holds at most one
  // group, and a y's own bucket plus its two neighbours hold every candidate.
  // The scan was quadratic in a page's lines and ran two to four times per
  // page (`docs/refactor-plan.md` §6.8).
  const nearby = new Map<number, number[]>()
  for (const item of page.items) {
    if (!item.text.trim()) continue
    let found = -1
    for (const offset of [-BASELINE_TOLERANCE, 0, BASELINE_TOLERANCE]) {
      for (const i of nearby.get(Math.floor((item.y + offset) / BASELINE_TOLERANCE)) ?? []) {
        // The FIRST group in creation order that fits — what `groups.find`
        // chose, and two groups CAN both fit one item.
        if (Math.abs(groups[i]!.y - item.y) <= BASELINE_TOLERANCE && (found < 0 || i < found)) found = i
      }
    }
    if (found >= 0) {
      groups[found]!.items.push(item)
      continue
    }
    const bucket = Math.floor(item.y / BASELINE_TOLERANCE)
    nearby.set(bucket, [...(nearby.get(bucket) ?? []), groups.length])
    groups.push({ y: item.y, items: [item] })
  }
  const out = groups.map((g) => g.items)
  BASELINES.set(page, out)
  return out
}

/**
 * A gap narrower than this is a word space, not a parting of two columns.
 *
 * The floor is deliberately low — the tightest gutter in the corpus is the
 * 7,1 pt of the EU-ESG-Rating-Verordnung-Vollzugsgesetz (left column to 434,5,
 * right from 441,6) — because the test that does the work below is the
 * *relative* one, and an absolute number that decided anything would be a
 * number fitted to this corpus's page width.
 */
const MIN_PARTING = 6
/**
 * …and the parting has to be at least this much wider than the line's next
 * gap. This is the whole discriminator, and it is scale-free on purpose.
 *
 * A justified line of body text parts its columns with a gap several times its
 * word spacing: 26,9 pt against 7,6 pt on the EU-ESG line that carries
 * "behördlichen". The two shapes that must *not* vote both fail it by having
 * no gap that stands out — a **letter-spaced title line**, whose gaps are all
 * 12 pt (or all 25 pt: the same annex's title page prints both), and a **table
 * row**, whose column gaps are as wide as each other. Both are the reason an
 * absolute threshold cannot do this job: 12 pt is a word space on the title
 * page and 10 pt is the whole gutter of the Abgrenzungsverordnung 2004.
 */
const PARTING_DOMINANCE = 2

/**
 * Where this line parts its columns, or null if it does not say.
 *
 * "Says" is the point. Most lines of an annex carry ink in one column only, or
 * run across both as a heading, and such a line is evidence about its own
 * content and none about the layout. A line that carries one conspicuously
 * wide gap and text on both sides of it has parted two columns, and the gutter
 * is somewhere inside that gap.
 */
function columnParting(items: readonly AnnexItem[]): [number, number] | null {
  const sorted = [...items].sort((a, b) => a.x - b.x)
  let widest = 0
  let second = 0
  let at: [number, number] | null = null
  let cursor = sorted[0] ? sorted[0].x + sorted[0].width : 0
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i]!.x - cursor
    if (gap > widest) {
      second = widest
      widest = gap
      at = [cursor, sorted[i]!.x]
    } else if (gap > second) second = gap
    cursor = Math.max(cursor, sorted[i]!.x + sorted[i]!.width)
  }
  if (at === null || widest < MIN_PARTING || widest < second * PARTING_DOMINANCE) return null
  return at
}

/**
 * The widest stretch of `score` that carries its lowest value, as indices.
 *
 * The gutter is a band and not a point, at both steps below: the lines that
 * part their columns agree on a band, and inside it the ink is empty over a
 * band. Taking the widest one rather than the first keeps a single stray
 * position from deciding.
 */
function lowestStretch(score: readonly number[]): [number, number] {
  const least = Math.min(...score)
  let bestFrom = 0
  let bestTo = -1
  let start = -1
  for (let i = 0; i <= score.length; i++) {
    if (i < score.length && score[i] === least) {
      if (start < 0) start = i
    } else if (start >= 0) {
      if (i - 1 - start > bestTo - bestFrom) {
        bestFrom = start
        bestTo = i - 1
      }
      start = -1
    }
  }
  return [bestFrom, bestTo]
}

/**
 * The band the two-column lines agree the gutter lies in, or null when they
 * do not agree.
 *
 * Every line that parts its columns votes for the whole of its own gap, and
 * the gutter is where the votes pile up: it is the one strip that *every*
 * such line leaves free, so in a sound annex the maximum is the intersection
 * of all their gaps — the band between the left column's widest line and the
 * right column's leftmost one.
 *
 * Measured over the 114 GP-XXVIII annexes (2026-09-11): 80 are unanimous, 110
 * reach 92,9 %, and the lowest is 76,9 %.
 *
 * **A share threshold on that was measured and dropped.** It sounded right —
 * the gutter is free on *every* two-column line, so a band a tenth of them
 * print into is not the gutter — but at 90 % it decides exactly one annex of
 * the 114 (an annex to the Lehrberufsliste, at 87,3 %), changes no §'s text and
 * no verdict, and what it rejects is the *better* answer: 424 sits 6,2 pt from
 * that annex's left column and 6,1 from its right, where the ink's 421 sits
 * 3,2 and 9,1. A number that lies in the 4-point gap between two documents and
 * has never been right is not a measurement.
 *
 * **This is a band and not an answer**, and the difference is a measured one.
 * Only lines that print in *both* columns vote, so a one-sided line may begin
 * inside the band: on the Gewerbeordnung/Emissionsschutzgesetz annex the band
 * is [420, 426] while the continuation line "linien umgesetzt:" starts at
 * 422,7 — cutting at the band's middle turned it into a spanning heading and
 * § 382 lost the words "linien umgesetzt:" out of the proposed column
 * (2026-09-11). Which point of the band to cut at is a question about all the
 * ink, and `columnBoundary` answers it with the rule it always had.
 */
function gutterBand(pages: readonly AnnexPage[], from: number, to: number): [number, number] | null {
  const votes = new Array<number>(to - from + 1).fill(0)
  let voters = 0
  for (const page of pages) {
    for (const line of baselines(page)) {
      const parting = columnParting(line)
      if (parting === null || parting[1] < from || parting[0] > to) continue
      voters++
      for (let x = Math.max(from, Math.ceil(parting[0])); x <= Math.min(to, Math.floor(parting[1])); x++) votes[x - from]!++
    }
  }
  if (voters === 0) return null
  const [bestFrom, bestTo] = lowestStretch(votes.map((v) => -v))
  // **A band that runs off the search window is not a band this can measure**,
  // and it is the one guard the corpus needs. The Abgrenzungsverordnung 2004
  // sets its right column 62,6 pt wider than its left and indents most of its
  // rows, so the widest agreed strip is the indent rather than the gutter and
  // it leaves the window at 464 — the band would say 454 to 464 where the
  // gutter is 395,1. The ink reads that annex correctly (397), so the vote
  // stands aside — on that one annex of the 114, and on no other.
  if (bestFrom === 0 || bestTo === votes.length - 1) return null
  return [from + bestFrom, from + bestTo]
}

/**
 * The column boundary: where the two-column lines part, and failing that the
 * emptiest vertical strip in the middle of the page.
 *
 * Two anchors were tried and both failed. The page midline is wrong because
 * the columns are not symmetric — on the Abgabenänderungsgesetz 2025 the
 * proposed column *starts* at x = 414,7 while the midline is 421, so 1.321
 * right-column lines were filed as crossing both columns and produced 1.258
 * phantom Artikel rows. The midpoint between the two header labels is no
 * better: it landed at 415,9, still to the *right* of that column's first
 * character, so the same lines still straddled it.
 *
 * **And the reason that midpoint fails is arithmetic, not luck** (measured
 * again over all 114 GP-XXVIII annexes on 2026-09-11, §12.13). Both labels are
 * centred over their cells, so `headerSeam` is the mean of the two column
 * *centres* — and that equals the gutter only where the two columns are the
 * same width. Otherwise it sits a quarter of the width difference away from
 * it: on the Abgabenänderungsgesetz 2025 the right column is 19,1 pt wider,
 * the gutter is 412,96 and the seam 415,93, which slices 1.285 right-column
 * runs; on the Abgrenzungsverordnung 2004 the right column is 62,6 pt wider,
 * the gutter is 395,09 and the seam 410,71 — 11,9 pt past that column's first
 * character, slicing 101 of its runs.
 *
 * What the layout does guarantee is a gutter: a strip of page that no line of
 * either column reaches into. Counting how many text runs cover each
 * horizontal position and taking the minimum finds it without assuming
 * symmetry, a header, or a template — a spanning heading crosses the gutter,
 * but only a handful do, while every body line piles up on one side or the
 * other (2026-09-09).
 *
 * **The ink can be wrong, and once in the corpus it is** (2026-09-11). The
 * EU-ESG-Rating-Verordnung-Vollzugsgesetz sets two pages, one of them a title
 * page whose full-width block is most of the document's ink, so the emptiest
 * strip landed at 381 — inside the left column, whose text runs to 434,5 — and
 * one word of it ("behördlichen") was filed under the proposed version. The
 * cause is that ink counts every run of every page, and a page that is not set
 * in two columns has no business saying where two columns part: five of the
 * seven runs covering the real gutter at 438 belong to that title page, while
 * at 381 the whole document happens to have a word boundary.
 *
 * **So the search is narrowed before the ink counts, not after.** The lines
 * that really are two-column lines say which band the gutter lies in
 * (`gutterBand`), and inside that band the ink answers as it always did. That
 * is not a different statistic but a smaller haystack, and it is the whole
 * repair: on the EU-ESG annex the band is [435, 441], the title page's ink
 * covers all of it evenly, and the cut lands at 438 where the gutter is. Where
 * the two-column lines do not agree on a band — 1 of the 114 — the ink searches
 * the whole window, exactly as before.
 *
 * Over the 114 GP-XXVIII annexes the band decides 113 and the ink 1, and the
 * answer moves on 23 of them. 21 move by 2 or 3 pt inside their own gutter and
 * nothing follows — not a §'s text, not a verdict. The two that carry
 * something are the EU-ESG annex, 381 → 438, and the
 * Informationsfreiheits-Anpassungsgesetz BMWET, 421 → 419, whose gutter is
 * 0,1 pt wide and whose right column had 30 lines read as spanning headings
 * (§12.13). The bands are 1 to 13 pt wide, median 7.
 */
export function columnBoundary(pages: readonly AnnexPage[]): number {
  const width = pages[0]?.width ?? 842
  // A narrow band around the middle. The real offsets measured are under
  // 8 pt on an 842 pt page — about 1 % — so a ±5 % window covers every annex
  // while keeping the answer from wandering off on a sparsely filled page,
  // where the emptiest strip is not the gutter but simply blank paper.
  const from = Math.floor(width * 0.45)
  const to = Math.ceil(width * 0.55)
  const band = gutterBand(pages, from, to)
  const [searchFrom, searchTo] = band ?? [from, to]
  const coverage = new Array<number>(searchTo - searchFrom + 1).fill(0)
  for (const page of pages) {
    for (const item of page.items) {
      if (!item.text.trim()) continue
      const a = Math.max(searchFrom, Math.floor(item.x))
      const b = Math.min(searchTo, Math.ceil(item.x + item.width))
      for (let x = a; x <= b; x++) coverage[x - searchFrom]!++
    }
  }
  // Inside an agreed band the emptiest strip is a band of its own — on the
  // EU-ESG annex the ink is the same at every point of it — so the cut goes in
  // its middle. Without a band the old tie-break stands: nearest the middle of
  // the page, which is where the gutter sits in every annex measured.
  if (band) {
    const [lowFrom, lowTo] = lowestStretch(coverage)
    return Math.round((searchFrom + lowFrom + searchFrom + lowTo) / 2)
  }
  let best = Math.round(width / 2)
  let least = Number.POSITIVE_INFINITY
  for (let i = 0; i < coverage.length; i++) {
    const x = searchFrom + i
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

/**
 * Are two documents set alike — may their pages be read as ONE annex?
 *
 * A ressort may publish one draft's Gegenüberstellung in several PDFs, and
 * then the parts have to be joined before the law boundaries are resolved, or
 * half an annex is held against the whole draft (`annex/annexSource.ts`).
 * Joined pages, however, are measured as one document: `dominantWidth` picks
 * the width most pages share and `isProven` drops every page that disagrees.
 *
 * Both parts of the Weinrecht-Sammelverordnung are 842 pt, so joining them is
 * what the ressort itself did on paper. The Methodenverordnung Wasser prints
 * „(Verordnung)" on 7 landscape pages of 842 and „(Anlagen)" on 72 portrait
 * pages of 595 — joined, the 72 win the majority and the 7 pages that carry
 * the actual comparison are dropped as strangers. That is the opposite of the
 * repair (measured 26.09.2026), so a part set otherwise is read on its own.
 */
export function sameTypesetting(a: readonly AnnexPage[], b: readonly AnnexPage[]): boolean {
  const wa = dominantWidth(a)
  const wb = dominantWidth(b)
  return Math.abs(wa - wb) <= Math.max(wa, wb) * WIDTH_TOLERANCE
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

/**
 * Where a column's body text starts, or ends: the outermost start (end) that
 * a share of its lines have in common.
 *
 * Not the extreme, and not `columnEdge`: page numbers, elision brackets and
 * the few widest runs — which set the right column's edge some 3,5 pt beyond
 * its text (`WRAP_TOLERANCE`) — are few, and they move an extreme. Not the
 * most common position either: where a law is mostly lists, as the
 * Wasserstraßen-Verkehrsordnung is (RIS 707EA278), most lines start at a
 * list's indent, and the column's own margin is the outermost position that
 * many lines still share. Rounded to the point.
 */
const MARGIN_SHARE = 0.02
const MARGIN_LINES = 3

function columnMargin(xs: readonly number[], side: 'start' | 'end'): number | null {
  const counts = new Map<number, number>()
  for (const x of xs) if (Number.isFinite(x) && x > 0) counts.set(Math.round(x), (counts.get(Math.round(x)) ?? 0) + 1)
  const enough = Math.max(MARGIN_LINES, MARGIN_SHARE * xs.length)
  const common = [...counts].filter(([, n]) => n >= enough).map(([x]) => x)
  if (common.length === 0) return null
  return side === 'start' ? Math.min(...common) : Math.max(...common)
}

/**
 * A centred line's two margins differ by at most this many points, or this
 * share of their sum where that is more — a short heading is set to the point
 * less exactly than a long one is — and it keeps more than `CENTRE_MARGIN` on
 * each side.
 */
const CENTRE_TOLERANCE = 3
const CENTRE_TOLERANCE_SHARE = 0.06
const CENTRE_MARGIN = 2.5

/**
 * Does this line keep the same margin on both sides of its column — the shape
 * of a heading, never of a line of body text, which starts flush or at an
 * indent (`unitsOfColumn`)?
 *
 * The margins are the column's body text (`columnMargin`), not its measured
 * edge: on the right the edge lies some 3,5 pt beyond the text, and a heading
 * centred over that column then kept 3,5 pt more on its right than on its
 * left. For a line that ran to the edge, the left margin is what tells the two
 * apart: a justified body line starts where the column does, 0 to 1 pt from
 * it, and a heading nearly as wide as the column starts as far in as it ends
 * short — 4 and 4 pt on 58/ME XXVIII.
 */
function isCentred(start: number, end: number, margins: { start: number | null; end: number | null }): boolean {
  if (margins.start === null || margins.end === null || !Number.isFinite(start)) return false
  const before = start - margins.start
  const after = margins.end - end
  return before >= CENTRE_MARGIN && after >= CENTRE_MARGIN - CENTRE_TOLERANCE && Math.abs(before - after) <= Math.max(CENTRE_TOLERANCE, CENTRE_TOLERANCE_SHARE * (before + after))
}

/** Does this line start where the column's body text does, as a justified line does (`isCentred`)? */
function isFlush(start: number, margins: { start: number | null }): boolean {
  return margins.start !== null && Number.isFinite(start) && start - margins.start < CENTRE_MARGIN
}

const PAGE_NUMBER_RE = /^\d+\s+von\s+\d+$/i
const TITLE_RE = /^textgeg(?:en)?b?ü?berstellung$/i
/** The annex's title at the head of a heading, „Textgegenüberstellung: Novelle der …". */
const ANNEX_TITLE_RE = /^textgeg(?:en)?b?ü?berstellung\b/i
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
const UNIT_RE = new RegExp(String.raw`^(?:\[\s*(?:\.\.\.|…)\s*\]\s*|(?:\.\.\.|…)\s*)*(§\s*(?=\d+\.\d)${PARAGRAPH_NUMBER}\.?|§\s*${PARAGRAPH_NUMBER}\.|Art(?:\.|ikel)\s*\d+[a-z]*(?=\s)|Anlage\s+[\dIVXL]+[a-z]?|Anhang\s+[\dIVXL]+[a-z]?)`)
/**
 * What follows a designation that is a *citation* rather than a provision.
 *
 * "Art. 92 Abs. 1 Buchstabe d der Verordnung (EU) 2024/1689" is running text,
 * and a wrapped line beginning with one opened a provision that does not
 * exist — which the check against RIS then looked up as § 92. A designation
 * that opens a provision is followed by the provision, not by a subdivision
 * of something else. 23 of the worst-scoring rows carrying real prose were
 * this one shape (2026-09-09).
 *
 * Widened on 04.10.2026 from a word list to its shape (§12.41, five groups in
 * GP XXVIII): a heading's tail is a capitalised title, „zu § 5", a bracket or
 * nothing. So a tail that opens with any other lowercase word („Anhang XVI
 * gelten …", „Art. 6 oder Art. 7"), a comma, an EU act („Art. 39 Richtlinie
 * 2009/72/EG", „Art. 29a Bilanz-Richtlinie", „der Statusverordnung") or a
 * treaty („Art. 8 EMRK") is a citation. „Art. 8 EMRK" alone had filed a
 * § of the Asylgesetz under an Artikel the law does not have.
 *
 * **Written out, and by its part, a citation reads the same (26.10.2026)**:
 * „Artikel 16 Absatz 1 der Richtlinie 89/391/EWG" and „Anhang I Teil 2 und 3
 * der Verordnung (EG) Nr 1272/2008" each opened a unit of their own in the
 * Salzburger Landarbeitsordnung's Gegenüberstellung (Land Salzburg 18121),
 * where the Länder reader read it through here. „Absatz", „Satz", „Ziffer"
 * and „Teil 2 und …" join the subdivisions. A Ziffer is cited with its
 * number, „Z 3": „Z u s ä t z l i c h e" is a heading set letter by letter
 * (the Wasserstraßen-Verkehrsordnung's „§ 3.14 Z u s ä t z l i c h e
 * Bezeichnung …", RIS 707EA278).
 */
const CITATION_TAIL_RE = /^\s*(?:Abs(?:\.|atz\b)|Satz\b|Z\s+\d|Ziffer\b|Buchstabe|Unterabsatz|Teil\s+\d+\s+(?:und|bis|der|des)\b|Nr\.|Nummer|,|(?!zu\b)[a-zäöüß]|[\wÄÖÜäöüß-]*(?:[Rr]ichtlinie|[Vv]erordnung|-VO)\b|\((?:EU|EG|EWG)\)|(?:EMRK|B-VG|AEUV|EUV|GRC|DSGVO|StGG)\b)/
/** "Artikel 3" with nothing else on the line. */
const BARE_ARTICLE_RE = /^Artikel\s+(?:[Xx]?\d+[a-z]?|[IVXL]+)$/
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
 *
 * `boundary` is a test seam: production always lets the page decide.
 */
export function linesFromPage(page: AnnexPage, boundary?: number): AnnexLine[] {
  const mid = boundary ?? page.width / 2
  type Run = { x: number; width: number; text: string }
  const buckets: { y: number; left: Run[]; right: Run[]; spanning: Run[]; leftEnd: number; rightEnd: number; leftStart: number; rightStart: number }[] = []

  for (const group of baselines(page)) {
    const bucket = { y: group[0]!.y, left: [] as Run[], right: [] as Run[], spanning: [] as Run[], leftEnd: 0, rightEnd: 0, leftStart: Number.POSITIVE_INFINITY, rightStart: Number.POSITIVE_INFINITY }
    buckets.push(bucket)
    for (const item of group) {
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
 * two labels is the page's own account of where its columns lie. A page whose
 * columns sit elsewhere says so here.
 *
 * **It is a displacement detector and not the gutter**, and the two must not be
 * confused (measured 2026-09-11, `columnBoundary`): the midpoint of two centred
 * labels is the mean of the two column centres, so it coincides with the gutter
 * only where the columns are the same width and otherwise sits a quarter of the
 * width difference off — up to 15,6 pt in this corpus. That bias belongs to the
 * document's template, so it is the *same on every one of its pages*, which is
 * exactly what makes the seam a sound gate and an unsound estimator: a page
 * displaced sideways by 5 pt moves its seam by 5 pt whatever the column widths,
 * and that is all this number is asked.
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

/** The annex's title line, „Textgegenüberstellung". */
function isTitle(line: AnnexLine): boolean {
  const both = `${line.left} ${line.right} ${line.spanning ?? ''}`.trim()
  return both !== '' && TITLE_RE.test((line.spanning ?? both).replace(/\s+/g, ''))
}

/**
 * The lines a document of its own begins with inside the annex: the first
 * content line after each title that is not the annex's first.
 *
 * A ressort may publish one draft's Gegenüberstellung in several files, and
 * they are read as one (`annexPdfService.ts`); 12/ME XXVIII prints three in
 * one. Each opens with its title and its own front matter, and with nothing
 * between, the second file's Langtitel, „StF:" and Promulgationsklausel ran on
 * as text of the first file's last § — the Weinrecht-Sammelverordnung 2026's
 * § 4 of the Rebsortenverordnung (RIS 215AB69F) „changed" by the head of the
 * Verordnung that follows it.
 *
 * **A title on the page after a titled page is the running head of one
 * document**, not the start of another: some of Salzburg's
 * Textgegenüberstellungen print it on every page (sbg-20822, all 42), and
 * read as a new document each time it cut every § that ran over a page —
 * § 36 ended „Vorschüsse von", on both sides alike (26.10.2026). The
 * documents a file joins start on a page of their own, after one that
 * carries no title: 12/ME, RIS 7A666965 and 215AB69F, and the seven
 * Artikel of Salzburg's package 32075.
 */
function startsDocument(pages: readonly (readonly AnnexLine[])[]): Set<AnnexLine> {
  const out = new Set<AnnexLine>()
  let content = false
  let pending = false
  let titledBefore = false
  for (const lines of pages) {
    const titled = lines.some(isTitle)
    for (const line of lines) {
      if (isTitle(line)) {
        pending = content && !titledBefore
        continue
      }
      if (isChrome(line)) continue
      if (pending) out.add(line)
      pending = false
      content = true
    }
    titledBefore = titled
  }
  return out
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
function joinLines(parts: { text: string; wrapped: boolean }[], hyphensByWord = false): string {
  let out = ''
  /** Whether the line that `out` currently ends with ran to its column's edge. */
  let carrierWrapped = false
  for (const part of parts) {
    if (!part.text) continue
    if (out === '') out = part.text
    else if (hyphensByWord && /\p{L}-$/u.test(out)) out = joinedAtHyphen(out, part.text)
    else if (/[a-zäöüß]-$/.test(out) && carrierWrapped) out = joinedAtEdge(out, part.text)
    else out = `${out} ${part.text}`
    carrierWrapped = part.wrapped
  }
  return normalizeText(out)
}

/**
 * A hyphen on a line that ran to its column's edge is the typesetter's —
 * unless the word after it says the drafter put it there: „Kinder-" „und
 * Jugendhilfe", „Landes-" „Beamtengesetz", „(Mit-" „)Eigentümer". Until
 * 26.10.2026 every such hyphen went, in the Bund's Beilagen as in
 * Salzburg's, and the page printed „Kinderund" and „LandesBeamtengesetz".
 */
function joinedAtEdge(out: string, next: string): string {
  if (AFTER_DRAFTERS_HYPHEN_RE.test(next)) return `${out} ${next}`
  if (/^[A-ZÄÖÜ)\]]/.test(next)) return `${out}${next}`
  return `${out.slice(0, -1)}${next}`
}

/** The words after which a line-final hyphen is the drafter's: „Landes- und Bundesrecht", „sowohl Wohn- als auch …". */
const AFTER_DRAFTERS_HYPHEN_RE = /^(?:und|oder|bzw\.?|beziehungsweise|sowie|bis|als|wie|noch|sondern|aber)\b/

/**
 * A line ending in a hyphen and the line after it, where the word after
 * decides (`AnnexLayout.hyphensByWord`): a word in lower case after a lower
 * case letter goes on with the word the line broke — „Höchs-" „tausmaß" —
 * unless it is „und", „oder" and the like; a capital, or a hyphen after one,
 * keeps the hyphen in the word — „Landes-" „Beamtengesetz", „UVP-"
 * „pflichtig" — and so does a bracket closing it: „(Mit-" „)Eigentümer".
 */
function joinedAtHyphen(out: string, next: string): string {
  if (AFTER_DRAFTERS_HYPHEN_RE.test(next)) return `${out} ${next}`
  if (/[a-zäöüß]-$/.test(out) && /^[a-zäöüß]/.test(next)) return `${out.slice(0, -1)}${next}`
  if (/^[\p{L})\]]/u.test(next)) return `${out}${next}`
  return `${out} ${next}`
}

/** The lines of one column, already joined, keyed by the unit they describe. */
interface ColumnUnit {
  id: string | null
  gld: string | null
  /** The heading the annex printed over this provision, across both columns */
  context: string | null
  text: string
  /** Its text breaks off at a page the parse did not read (`AnnexLayout.cutAtGaps`). */
  cut?: true
  /** The column printed its designation more than once; this is the longest (`ComparisonRow.repeated`). */
  repeated?: true
}

/**
 * A line that ends a sentence: its closing mark, and behind it whatever
 * closes around a sentence — quotation marks, a bracket.
 *
 * **The German closing mark „“" was not among them until 26.10.2026**, nor
 * „”", „’", „«" and „‹". A § whose last sentence closes a quotation — a
 * Novelle quoting its new text, „… verwendet werden.“" — did not end there,
 * and its last line went to the unit below as that unit's heading: Salzburg
 * 20807 § 221 handed „Kundmachung folgenden Monatsersten in Kraft.“" to
 * Anlage 1, the Weinrecht-Sammelverordnung 2026 (RIS 215AB69F) its new § 2's
 * last line to § 3. „]" closes too: „[...]" is the annex's own omission,
 * the end of what it prints of the unit above.
 */
const SENTENCE_END = /[.;:!?…][\]"'»«›‹)“”’‘]*$/
/** The same marks, anywhere in a text: does this passage contain a sentence at all? */
const SENTENCE_MARK = /[.;:!?…]/

/**
 * A line that is a division's designation, with its name or without:
 * „3. Hauptstück", „1. Abschnitt", „6. Teil Raumordnungs-Aufsicht",
 * „Abschnitt 2". A name on the same line opens with a capital and a small
 * letter, so a list item „1. Teil A" is not read as one.
 */
const DIVISION_LINE_RE = /^(?:(?:\d+[a-z]?|[IVXL]+)\.\s*(?:Teil|Abschnitt|Hauptstück|Unterabschnitt)|(?:Teil|Abschnitt|Hauptstück|Unterabschnitt)\s+(?:\d+[a-z]?|[IVXL]+))(?:\s+\p{Lu}\p{Ll}[^.;:!?]*)?$/u

/**
 * Where a division heading starts in the lines a unit ends with, or null.
 *
 * Only after the unit's last sentence and never at or before its own marker:
 * what follows the last full stop and opens with „3. Hauptstück" is the
 * heading of the provisions below, all of it — the division, its name, the
 * next division and the § heading. 81/ME XXVIII prints five such lines over
 * its § 14, and § 22's new Abschnitt name runs to the column edge; the
 * three-line, unwrapped carry in `unitsOfColumn` left „1. Abschnitt" and
 * „4. Abschnitt Technische Unterstützung im Zusammenhang mit
 * Verteidigungsgütern" at the end of §§ 13 and 21, where the word diff showed
 * them as text the draft adds (25.10.2026). The Länder reader, which parses
 * through here, stripped the same thing downstream for Salzburg 33616
 * (`TRAILING_DIVISION_RE` in `laender/landTgu.ts`).
 */
function divisionStart(parts: readonly { text: string; wrapped: boolean }[], opener: unknown): number | null {
  let from = parts.length
  while (from > 0) {
    const line = parts[from - 1]!
    if (line === opener || SENTENCE_END.test(line.text)) break
    from--
  }
  for (let i = from; i < parts.length; i++) {
    const line = parts[i]!
    if (line.wrapped || !DIVISION_LINE_RE.test(line.text.trim())) continue
    // „Sonderbestimmungen für Minderjährige für das 3. bis 6. und das 12. bis"
    // / „14. Hauptstück" is one heading broken before a number (FPG 2005,
    // 2024 package): a line that ran to the edge or stops on a word that
    // cannot end a heading is continued by the next one.
    const before = i > from ? parts[i - 1]! : null
    if (before && (before.wrapped || CONTINUED_RE.test(before.text.trim()))) continue
    return i
  }
  return null
}

/** A line ending on a word no heading ends on — the next line continues it. */
const CONTINUED_RE = /(?:^|\s)(?:bis|und|oder|sowie|bzw\.|des|der|dem|den|die|das|im|in|zum|zur|vom|von|für|mit|nach|gemäß|über|auf|aus|bei|an|gegen|ohne)$/

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
 * A line that opens with an Absatz of the § it stands in — „(2)", „(3) bis
 * (7)" — or with RIS's note on a repealed one, „(Anm.: Abs. 11 aufgehoben
 * durch …)". The tail of the unit above, never the heading of the one below,
 * however short it is and whatever it does not end with: 141/ME XXVIII prints
 * „(2)" and „(3) bis (7)" without their „…" above „§ 23. bis § 23a", and
 * 108/ME the note on § 70 Abs. 11 above § 70a — both read as headings of the
 * § below, and on one side only. The same rule the oracle reads a heading row
 * by (`isHeadingRow` in `kons/tguOracle.ts`).
 *
 * Not a Ziffer („4.") or a litera: a law that numbers its divisions without
 * naming them heads them so — „2. Großhandel mit Tabakerzeugnissen" in the
 * Tabakmonopolgesetz, „8. Angelegenheiten nach dem EU-UmgrG" in the
 * Rechtspflegergesetz — and those are headings (measured 26.10.2026).
 */
const BODY_LINE_RE = /^\s*(?:\(\d+[a-z]*\)|\(Anm\b)/

/**
 * „(zu § 61 Abs. 5 und 5a)": the §§ a schedule names itself by, on the line
 * under its own designation — the Bäderhygieneverordnung's (RIS E9F4C208)
 * Anlage 11 and 12 had nothing else, and the line went to the next Anlage
 * as its heading. Only there: above a designation the same words are part
 * of the heading below it, „Hauptwahlbehörde (zu den §§ 6 und 10)" over § 98
 * of Salzburg's Gemeindewahlordnung (sbg-18058, 26.10.2026).
 */
const NAMES_ITS_PARAGRAPHS_RE = /^\s*\(zu\s/

/**
 * „§ 1. bis § 3. ...", „§ 92. und § 93. ...": one line leaving several §§ out
 * at once. No heading of its own stands over it, so in the front matter what
 * stands above it is the document's title — 08E3BE3E's „Novelle
 * Methodenverordnung Wasser, Fassung vom 26.08.2025" against „Novelle
 * Methodenverordnung Wasser" read as § 1 changing (`unitsOfColumn`).
 */
const SEVERAL_ELIDED_RE = /^(?:\[\s*(?:\.\.\.|…)\s*\]\s*|(?:\.\.\.|…)\s*)*§+\s*\d\S*\s+(?:bis|und)\s+§/

/**
 * „Text" on a line of its own: where RIS's print of a law ends its head —
 * Langtitel, „StF:", the „Änderung" list of Bundesgesetzblätter, the table of
 * contents — and the provisions begin. What stands before it is no heading of
 * the first §: the Weinrecht-Sammelverordnung 2026 (RIS 215AB69F) prints its
 * standing text so, and „BGBl. II Nr. 191/2023 BGBl. II Nr. 250/2024 Text"
 * stood as text its § 1 loses.
 */
const RIS_BODY_START_RE = /^Text$/

/** One line of one column, as `unitsOfColumn` reads it. */
interface ColumnLine {
  text: string
  /** The line ran to its column's edge (`reachedEdge`). */
  wrapped: boolean
  /** The line keeps the same margin on both sides of its column (`isCentred`). */
  centred?: boolean
  /** The line starts where the column's body text does (`isFlush`). */
  flush?: boolean
  /** The x of the line's middle, and how far it starts inside the column's body margin (`columnMargin`; null where none was measured). */
  centre?: number
  inset?: number | null
  /** The x of the column's middle, between its body margins; null where they were not both measured. */
  axis?: number | null
  /** The headings printed across both columns above this line (`parseAnnexPdf`). */
  context?: string
  /** The first line of a document of its own inside the annex (`startsDocument`): nothing above it is its heading. */
  barrier?: boolean
  /** The first line after a page the parse did not read (`AnnexLayout.cutAtGaps`). */
  gap?: boolean
}

/**
 * A schedule designated without a number, on a line of its own: „Anlage" — a
 * Verordnung's only one — or „Anlage A". `UNIT_RE` asks for a numeral, so
 * neither opened a unit, and the schedule's table ran on as text of the last
 * § before it: the Arzneimittel-Abgrenzungsverordnung's (RIS 6AAAFEB3) under
 * § 7, the AEV pflanzliche Nahrungs- und Futtermittel's Anlage A (RIS
 * 0F9A8F06) under § 6 — each a § „changing" by a table it does not hold.
 */
const SCHEDULE_ALONE_RE = /^((?:Anlage|Anhang)(?:\s+[A-Z])?)$/

/**
 * The line's unit marker, or null — where it has none, and where what reads
 * like one is a citation: "§ 5." can only be a designation, while "Art. 92",
 * "Anlage 4" and "Anhang I" are as often citations, and there the text after
 * the number decides.
 *
 * **A § designation that carries no full stop decides by its tail as well**
 * (26.10.2026). Only a Verordnung that numbers its §§ by Kapitel writes one
 * („§ 3.20 Bezeichnung …", `UNIT_RE`), and there a line may begin with a
 * citation the same way — the Wasserstraßen-Verkehrsordnung's „§ 3.22 und
 * 3.25, führen:", the second line of a Ziffer of § 3.20, opened a § 3.22 of
 * its own (RIS 707EA278).
 */
function markerOf(text: string): RegExpExecArray | null {
  const marker = UNIT_RE.exec(text) ?? SCHEDULE_ALONE_RE.exec(text.trim())
  if (marker === null) return null
  const paragraph = marker[1]!.startsWith('§')
  if (paragraph && marker[1]!.endsWith('.')) return marker
  // The letter a designation may end in („§ 6.01a") is the number's, not the tail's.
  const tail = text.slice(marker[0].length).replace(paragraph ? /^[a-z]+(?=\s|$)/ : /^(?!)/, '')
  return CITATION_TAIL_RE.test(tail) ? null : marker
}

/**
 * „Inhaltsverzeichnis" — on a line of its own that does not start where the
 * column's body text does (a word of running text that wrapped would), or
 * printed across both columns, so that it stands over the next line as its
 * `context`. Not „centred": 30/ME XXVIII sets the Zahlungsdienstegesetz's
 * contents as a table of their own, and the heading stands over that table.
 */
const CONTENTS_HEADING_RE = /^Inhaltsverzeichnis:?$/
const CONTENTS_CONTEXT_RE = /(?:^|\s)Inhaltsverzeichnis:?$/
/**
 * A line of a table of contents that names a unit: a designation at its
 * head, with or without its full stop — an entry the draft adds is often
 * printed without („§ 20a ESAP-Sammelstelle", 30/ME XXVIII).
 */
const CONTENTS_ENTRY_RE = /^(?:\[\s*(?:\.\.\.|…)\s*\]\s*|(?:\.\.\.|…)\s*)*(?:§|(?:Anlage|Anhang)\s+[\dIVXL])/
/** „…", „...", „[...]" on a line of their own — and RIS's „(Anm.: § 129a.)" where an entry was. */
const OMISSION_LINE_RE = /^(?:(?:\[\s*)?(?:\.{3,}|…+)(?:\s*\])?|\(Anm\.?\s*:.*\))$/
/**
 * A division in a table of contents, „2. Teil – Einsicht in das
 * Kontenregister" and „4. Kapitel" among them (97/ME XXVIII, RIS 707EA278):
 * a heading, not a Ziffer of a provision.
 */
const CONTENTS_DIVISION_RE = /^(?:\d+[a-z]?|[IVXL]+)\.\s*(?:Teil|Abschnitt|Unterabschnitt|Hauptstück|Kapitel|Titel)\b/i

/** A division's line, as the provisions or a table of contents print it. */
function isDivision(text: string): boolean {
  const t = text.trim()
  return DIVISION_LINE_RE.test(t) || CONTENTS_DIVISION_RE.test(t)
}
/**
 * A table-of-contents entry is a designation and a title of a line or two:
 * this many characters of its own and it is a provision. The divisions listed
 * between two entries are not its own, and they are not always centred where
 * the column's text is — 30/ME XXVIII sets the Zahlungsdienstegesetz's
 * contents as a table of their own, shifted to the right.
 */
const CONTENTS_ENTRY_CHARS = 300

/**
 * Does the unit whose marker stands on line `at` hold a provision, rather than
 * an entry of a table of contents?
 *
 * An entry is a designation, a title, perhaps the omission „…" — and nothing
 * else. A provision opens with its Absatz („§ 3. (1) …"), numbers a list
 * („1. Beim Stillliegen …": the Wasserstraßen-Verkehrsordnung's §§ have no
 * Absätze), runs longer than an entry does, or ends a sentence. Division
 * headings and centred lines are the next unit's and say nothing here.
 */
function opensProvision(lines: readonly ColumnLine[], at: number): boolean {
  const first = lines[at]!.text
  const marker = markerOf(first)
  if (marker === null) return false
  const tail = first.slice(marker[0].length).trim()
  if (/^\(\d/.test(tail)) return true
  let chars = tail.length
  let last = tail
  for (let k = at + 1; k < lines.length; k++) {
    const t = lines[k]!.text.trim()
    if (!t) continue
    if (markerOf(t) || CONTENTS_ENTRY_RE.test(t) || RIS_BODY_START_RE.test(t)) break
    // The omission „…" between entries is the annex's notation, no text.
    if (DIVISION_LINE_RE.test(t) || CONTENTS_DIVISION_RE.test(t) || lines[k]!.centred || OMISSION_LINE_RE.test(t)) continue
    // An Absatz or a Ziffer of its own. Not RIS's note „(Anm.: § 3
    // aufgehoben …)", which a table of contents prints where an entry was.
    if (/^\(\d/.test(t) || /^\d+[a-z]*\.\s/.test(t)) return true
    chars += t.length
    last = t
  }
  return chars > CONTENTS_ENTRY_CHARS || /[^.…]\.[\]"'»«›‹)“”’‘]*$/.test(last)
}

/**
 * The reprinted table of contents in one column: its lines, as indices, and
 * how many entries they name.
 *
 * **Not a provision, and no § of the comparison (26.10.2026).** Annexes reprint
 * the law's Inhaltsverzeichnis at the head of a law, and its entries open
 * with the very markers the provisions do. Read as provisions, each entry
 * became a § block of its own wherever the annex prints no body for that §:
 * „§ 75a ESAP-Sammelstelle § 76. bis § 79. …" as § 76 of the Börsegesetz,
 * the Pfandbriefgesetz's „4. Hauptstück" heading as a change of its § 27,
 * „Zugangsportal" — the end of a wrapped entry — as text the Pfandbriefgesetz's
 * § 30 gains, and the whole table of contents of the Bäderhygieneverordnung
 * (RIS E9F4C208) as its Anlage 1, which pushed the real Anlage 1 out of the
 * comparison. Each said „Anweisung nicht gefunden" for a change no instruction
 * makes: 30/ME, 27/ME, 81/ME, 85/ME, 97/ME, 123/ME, 148/ME XXVIII and RIS
 * 707EA278, 138B4B08, E9F4C208.
 *
 * Dropped as the table path drops it — RIS keeps the Inhaltsverzeichnis as a
 * document of its own (`<inhaltsvz>`, `comparisonRows.ts`), and the front
 * matter here already went the same way — and counted as `contents`. What
 * changes in it changes in the provisions it lists: an entry the draft adds
 * is the § the draft inserts, a renamed entry the § heading it renames.
 *
 * From the heading to the first provision (`opensProvision`), or to RIS's
 * „Text", which ends the contents of a printed law. The headings printed over
 * that first provision stay its own: the centred lines and divisions right
 * above it, up to the last line of an entry.
 */
function contentsRegions(lines: readonly ColumnLine[]): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const own = line.flush === false && CONTENTS_HEADING_RE.test(line.text.trim())
    if (!own && !CONTENTS_CONTEXT_RE.test(line.context ?? '')) continue
    // The heading's own line goes with it; a heading printed across both
    // columns is no line of this one, and the line it stands over is the
    // first entry — unless that line is already a provision.
    if (!own && opensProvision(lines, i)) continue
    let end = lines.length
    for (let j = i + 1; j < lines.length; j++) {
      const t = lines[j]!.text.trim()
      if (!t) continue
      if (RIS_BODY_START_RE.test(t) || (lines[j]!.flush === false && CONTENTS_HEADING_RE.test(t))) {
        end = j
        break
      }
      if (opensProvision(lines, j)) {
        end = j
        while (end - 1 > i) {
          const above = lines[end - 1]!
          const a = above.text.trim()
          if (a && (CONTENTS_ENTRY_RE.test(a) || !(DIVISION_LINE_RE.test(a) || CONTENTS_DIVISION_RE.test(a) || above.centred))) break
          end--
        }
        // Where that walk stopped short of a division, the nearest division
        // no entry follows heads the provisions, and so does all below it,
        // centred or not: Salzburg's S.EU-Rechtsvorschriften-Begleitgesetz
        // (sbg-26924) sets „Industrieanlagen, Fernwärme- und Fernkältenetze;
        // Kosten-Nutzen-Analyse" a point inside each margin, and its § 14
        // lost the heading under „5. Abschnitt" to the contents. Only in
        // contents with entries of their own: a table that lists divisions
        // alone ends on one of its own — „IX. Abschnitt (§ 185):" over § 65
        // of the Mineralrohstoffgesetz (27/ME XXVIII).
        if (!isDivision(lines[end]?.text ?? '')) {
          let division = -1
          for (let k = end - 1; k > i; k--) {
            const a = lines[k]!.text.trim()
            if (CONTENTS_ENTRY_RE.test(a)) {
              if (division >= 0) end = division
              break
            }
            if (division < 0 && isDivision(a)) division = k
          }
        }
        break
      }
    }
    out.push([i, end])
    i = end - 1
  }
  return out
}

/** The lines a column leaves out as table of contents, and how many entries they name. */
interface ContentsLines {
  lines: Set<number>
  entries: number
}

/**
 * Both columns' tables of contents, ending together.
 *
 * Each column finds its own (`contentsRegions`), and a column whose contents
 * end on a division the draft does not touch cannot tell that division from
 * the first heading of the provisions below — its other column can, where the
 * draft adds an entry after it: 9/ME XXVIII's Wertpapierfirmengesetz lists
 * „8. Abschnitt" on both sides and the new „§ 47a" on the right only, and
 * the left gave the division to its first § as a heading the right did not
 * have. The columns stand on the same lines, so a table of contents that
 * starts on the same line on both sides ends on the later of the two ends.
 */
function contentsInBoth(left: readonly ColumnLine[], right: readonly ColumnLine[]): { left: ContentsLines; right: ContentsLines } {
  const l = contentsRegions(left)
  const r = contentsRegions(right)
  for (const a of l) {
    const b = r.find((x) => x[0] === a[0])
    if (!b) continue
    a[1] = b[1] = Math.max(a[1], b[1])
  }
  const lines = (regions: readonly [number, number][], column: readonly ColumnLine[]): ContentsLines => {
    const out: ContentsLines = { lines: new Set(), entries: 0 }
    for (const [from, to] of regions) {
      for (let k = from; k < to; k++) {
        out.lines.add(k)
        if (CONTENTS_ENTRY_RE.test(column[k]!.text.trim())) out.entries++
      }
    }
    return out
  }
  return { left: lines(l, left), right: lines(r, right) }
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
 * line reaches the column edge, a finished sentence ends in punctuation, and a
 * line of the § above may open with its Absatz (`BODY_LINE_RE`); a heading
 * does none of these, which is what distinguishes it.
 *
 * **A centred line that ran to the edge is a heading all the same**
 * (26.10.2026). The edge is measured per column, and a heading nearly as wide
 * as its column was wrapped on one side and not on the other: 58/ME XXVIII's
 * „Vergabe von öffentlichen Aufträgen aufgrund von Rahmenvereinbarungen"
 * ended 4,6 pt short of the left edge and 4,4 pt short of the right one, so
 * § 155 read as gaining its own heading — and so did §§ 92, 226, 230, 235 and
 * 263 of that annex and § 35 of 108/ME. A body line that wraps starts flush or
 * at an indent; only a heading keeps the same margin on both sides
 * (`isCentred`). The edge test itself stays: dropping it was measured and
 * carried wrapped body text into the next § wherever a sentence lacked its
 * full stop or a citation began a line (41/ME § 49, 96/ME „§ 105.").
 */
function unitsOfColumn(lines: readonly ColumnLine[], contents: ContentsLines, layout: AnnexLayout = {}): { units: ColumnUnit[]; contents: number } {
  type Unit = { gld: string | null; context: string | null; parts: ColumnLine[]; opener: ColumnLine | null; cut?: true }
  const units: Unit[] = []
  let current: Unit = { gld: null, context: null, parts: [], opener: null }
  /** The heading printed across both columns over a table of contents, for the first unit below it. */
  let overContents: string | null = null

  for (const [i, line] of lines.entries()) {
    // A table of contents is left out (`contentsRegions`), and what stood
    // above it is no heading of what follows it: the Langtitel of 58/ME
    // XXVIII's Bundesvergabegesetz would otherwise reach § 2, two pages on.
    // The heading printed across both columns over it is another matter:
    // it heads the provisions the contents list. Salzburg's package 26924
    // names its Landeselektrizitätsgesetz over that law's contents alone,
    // and its §§ 47a and 77c went to the law before it (26.10.2026). Not the
    // annex's own title, „Textgegenüberstellung: Novelle der
    // Luftverkehrsregeln 2014" (RIS 4C25BC88): it heads no §.
    if (contents.lines.has(i)) {
      if (!contents.lines.has(i - 1)) {
        if (current.gld !== null || current.parts.length > 0) units.push(current)
        current = { gld: null, context: null, parts: [], opener: null }
        const heading = line.context?.replace(CONTENTS_CONTEXT_RE, '').trim() ?? ''
        overContents = heading && !ANNEX_TITLE_RE.test(heading) ? heading : null
      }
      continue
    }
    // A document of its own begins here: what stood above is no heading of
    // what follows, and its front matter is front matter again.
    if (line.barrier && (current.gld !== null || current.parts.length > 0)) {
      units.push(current)
      current = { gld: null, context: null, parts: [], opener: null }
    }
    // A page the parse did not read lies between this line and the one
    // before: the unit open there breaks off, and what follows it is no part
    // of it (`AnnexLayout.cutAtGaps`).
    if (line.gap && (current.gld !== null || current.parts.length > 0)) {
      if (current.gld !== null) current.cut = true
      units.push(current)
      current = { gld: null, context: null, parts: [], opener: null }
    }
    if (!line.text) continue
    // RIS's print starts its provisions here: what stood above is its head,
    // and the lines below begin like a document's front matter again.
    if (RIS_BODY_START_RE.test(line.text.trim())) {
      if (current.gld !== null || current.parts.length > 0) units.push(current)
      current = { gld: null, context: null, parts: [], opener: null }
      continue
    }
    const marker = markerOf(line.text)
    if (!marker) {
      current.parts.push(line)
      continue
    }
    // A division heading goes to the next unit whole (`divisionStart`); any
    // other heading is at most three short lines.
    const division = divisionStart(current.parts, current.opener)
    const carried: ColumnLine[] = division === null ? [] : current.parts.splice(division)
    // Over the front matter, an elision of several §§ takes no heading: what
    // stands there is the document's title (`SEVERAL_ELIDED_RE`).
    const takesHeading = division === null && !(current.gld === null && SEVERAL_ELIDED_RE.test(line.text))
    // Only over a designation that is itself centred: 19978 copies the law in
    // force into its left column with heading and „§ 51a" at the Absatz's indent.
    const centredLayout = layout.headingsCentred === true && BARE_DESIGNATION_RE.test(line.text.trim()) && (line.inset ?? 0) >= CENTRED_INSET
    while (takesHeading && current.parts.length > 0 && carried.length < 3) {
      const last = current.parts[current.parts.length - 1]!
      // A unit's own marker line is never handed to the next unit. It could
      // be: a line that opens a § and ends without a full stop looks exactly
      // like a heading, and every line of an **Inhaltsverzeichnis** is of
      // that shape. Annexes reprint the table of contents, so each entry was
      // dragged three §§ forward — "[§ 5.] § 2. Bezugnahme auf Unionsrecht" —
      // and 126 of the worst-scoring rows in the corpus were that one bug
      // (2026-09-09).
      if (last === current.opener) break
      // A word broken over two lines is one text: the line whose word the
      // carried line goes on with („Einzel-" over „handelsnutzungen …") goes
      // too, though it ran to the edge — the heading of § 39 of Salzburg's
      // Raumordnungsgesetz runs over three lines, the first set two points
      // inside the margin, and § 39 kept the rest of it (sbg-18131).
      const continued = carried.length > 0 && /\p{L}-$/u.test(last.text.trim()) && /^\p{Ll}/u.test(carried[0]!.text.trim())
      // Where the document centres its headings over the designation
      // (`AnnexLayout`), that is what makes a line one — not a missing full
      // stop: „… und die Beurteilung ihrer Person zu erhalten" went to § 8
      // as its heading (Salzburg 23522), „Verwaltungsgerichtshof" at a
      // Ziffer's indent to § 11c (22320). Elsewhere a line that ran to the
      // edge is body text, unless a centred heading's.
      // „entfällt", centred where the § above is repealed, is never a heading (22320, L-VBG § 8).
      const shaped = centredLayout ? onAxis(last, line) && !REPEALED_RE.test(last.text.trim()) : !(last.wrapped && !last.centred)
      if ((!shaped && !continued) || SENTENCE_END.test(last.text) || BODY_LINE_RE.test(last.text)) break
      if (current.parts.at(-2) === current.opener && NAMES_ITS_PARAGRAPHS_RE.test(last.text)) break
      carried.unshift(current.parts.pop()!)
    }
    // A line the line above runs on into is that line's end, on the middle
    // or not: a line as wide as the column is („ihrem Anforderungswert …
    // zugeordnet werden", the end of § 6 of 22320's Gehaltsgesetz, its full
    // stop missing), and so may one at a Ziffer's indent be („kein
    // Dienstverhältnis bestanden, ist nach Abs 1 bis 4 vorzugehen" over § 9d
    // of its L-BG). Not a line set well inside the column, as a heading's
    // short line is: „Netzen" under „… von Gigabit-" (35452, § 14b).
    while (centredLayout && carried.length > 0 && (carried[0]!.inset ?? 0) < HEADING_INSET && runsOn(current.parts.at(-1))) current.parts.push(carried.shift()!)
    if (current.gld !== null || current.parts.length > 0) units.push(current)
    current = { gld: normalizeText(marker[1] ?? marker[0]), context: line.context ?? overContents, parts: [...carried, line], opener: line }
    overContents = null
  }
  if (current.gld !== null || current.parts.length > 0) units.push(current)

  // The identifier has to carry the *kind*, not just the number. "§ 1.",
  // "Artikel 1" and "Anlage 1" all reduce to "1", and joining the two columns
  // on that alone paired the Radonschutzverordnung's Anlage 1 with the
  // proposed § 1 — six schedules scored 11–45 % against unrelated provisions
  // (2026-09-09).
  const built = units.map((u) => {
    const gld = u.gld === null ? null : (rangeEnd(u) ?? u.gld)
    return { id: gld ? idOfMarker(gld) : null, gld, context: u.context, text: joinLines(u.parts, layout.hyphensByWord), ...(u.cut ? { cut: true as const } : {}) }
  })

  // A designation may occur twice in one column, because many annexes reprint
  // the law's **Inhaltsverzeichnis** first: "§ 1. Unmittelbare
  // Bundesvollziehung", "§ 2. Bezugnahme auf Unionsrecht", one line each. Read
  // as provisions, a table of contents became 100+ phantom § — the
  // Gaswirtschaftsgesetz alone produced 187 rows, 22 % of the whole corpus,
  // and 95 % of them matched nothing (2026-09-09). The substantive occurrence
  // is the longer one; a § that only ever appears in the contents keeps its
  // title, which is honest, rather than displacing the real text.
  const longest = new Map<string, { id: string | null; gld: string | null; context: string | null; text: string }>()
  const repeated = new Set<string>()
  for (const unit of built) {
    if (!unit.id) continue
    const seen = longest.get(unit.id)
    if (seen) repeated.add(unit.id)
    if (!seen || unit.text.length > seen.text.length) longest.set(unit.id, unit)
  }
  return {
    units: built.filter((u) => u.id === null || longest.get(u.id) === u).map((u) => (u.id && repeated.has(u.id) ? { ...u, repeated: true as const } : u)),
    contents: contents.entries,
  }
}

/** „§ 6.01a" whole (`PARAGRAPH_NUMBER`), or a roman numeral. */
const MARKER_NUMBER_RE = new RegExp(String.raw`(${PARAGRAPH_NUMBER}|[IVXL]+)`)

/**
 * „§ 23. bis § 23a (2) ...": an omission from one § to an Absatz of a later
 * one, whose text then goes on — „(3) Über den Verbrauch …" is § 23a's
 * Abs. 3, and so is every change printed below it.
 */
const RANGE_INTO_RE = /^(?:\[\s*(?:\.\.\.|…)\s*\]\s*|(?:\.\.\.|…)\s*)*§+\s*\S+(?:\s*\(\S+\))?\s+bis\s+§+\s*(\d[^\s(]*?)\.?\s*\(\S+\)/

/**
 * The § a unit's rows belong to where its marker line leaves out a range that
 * ends inside a later § and text follows (`RANGE_INTO_RE`): that later §.
 * The marker names the first § of the range, so the change below it was
 * filed there — 141/ME XXVIII showed § 23a's new sentence as a change of
 * § 23, and the Biozidproduktegesetz's new § 25 Abs. 14 under § 23 („§ 23.
 * (1) bis § 25. (13) …", 145/ME). A range that ends with the omission keeps
 * the § it opens with: nothing is printed of the later one.
 */
function rangeEnd(unit: { parts: readonly ColumnLine[]; opener: ColumnLine | null }): string | null {
  if (unit.opener === null) return null
  const m = RANGE_INTO_RE.exec(unit.opener.text)
  const after = unit.parts.slice(unit.parts.indexOf(unit.opener) + 1)
  if (!m || !after.some((line) => line.text.trim() && !OMISSION_LINE_RE.test(line.text.trim()))) return null
  return `§ ${m[1]}.`
}

function idOfMarker(gld: string): string | null {
  // „Anlage", „Anlage A" (`SCHEDULE_ALONE_RE`): the schedule without a number.
  const alone = SCHEDULE_ALONE_RE.exec(gld)
  if (alone) return `anlage:${/\s([A-Z])$/.exec(gld)?.[1] ?? ''}`
  // A law numbered in decimals ("§ 1.08") keeps the whole number: cut at the
  // first period, every one of its §§ collapses onto "1".
  const number = MARKER_NUMBER_RE.exec(gld)?.[1]
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
    // The columns are paired by number, so the number is the one the § has
    // afterwards — or none, for a § printed in the left column only
    // (`designateAfter`, which decides it once the annex is read).
    paraAfter: null,
    current,
    proposed,
    change,
    elided,
    segments,
    // Notation alone („(Anm.: …)", „[Kommentar: …]") is no change of the law (`notationOnly`).
    editorial: isEditorialChange(segments) || (change !== 'unchanged' && notationOnly(current, proposed)),
    elisionRange: change === 'changed' && !elided && isElisionRangeOnly(current, proposed),
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
function candidateLines(lines: readonly AnnexLine[], edges: ColumnEdges, lawNames: readonly string[] = []): { candidates: BoundaryCandidate[]; roles: Map<number, Role> } {
  const candidates: BoundaryCandidate[] = []
  const roles = new Map<number, Role>()

  for (const [i, line] of lines.entries()) {
    if (roles.has(i)) continue
    const text = headingText(line, edges)
    if (text === null) continue
    // A law's bare name across both columns, or the same in each, where the
    // document heads its laws so (`AnnexLayout`) — titled as the draft names
    // it, which is what `resolveBoundaries` holds it against.
    const named = line.spanning || line.left === line.right ? lawNamed(text, lawNames, line.spanning !== null) : null
    const candidate = candidateOf(text) ?? (named ? { text: normalizeText(text), numeral: null, title: named } : null)
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

/**
 * What a caller knows of a document's layout that the parse cannot measure
 * on a page or two (26.10.2026). `headingsCentred`: the document centres
 * each heading over the bare designation below it, „§ 25." on a line of its
 * own (`onAxis`), so a line that is not is body text, even without its full
 * stop — and a centred one is a heading, even where it runs to the edge.
 * Salzburg's Textgegenüberstellungen do (`readSalzburg`); the Bund's annexes
 * are read without it. `isCentred` cannot tell: on a short document no line
 * end is common enough to fix the column's end margin, and it then held no
 * heading of Salzburg 28924 for one.
 */
export interface AnnexLayout {
  headingsCentred?: boolean
  /**
   * The document heads each law of a package with its bare name across both
   * columns — „Salzburger Nächtigungsabgabengesetz", „Benützungsgebührengesetz"
   * (Salzburg 30259) — or with the same name in each column („Salzburger
   * Campingplatzgesetz" | „Salzburger Campingplatzgesetz", 34728), not with
   * „Artikel 2" or „Änderung des …": such a line is a boundary where it names
   * one of the draft's Artikel clearly (`lawNamed`).
   */
  lawsByName?: boolean
  /**
   * A provision that runs on to or from a page the parse does not read is
   * cut there and marked (`ComparisonRow.cut`), rather than joined to what
   * follows the gap: Salzburg 18192, 25 of its pages unread, showed § 37b
   * ending „… innerhalb von vier" and § 46 going on with another §'s text.
   */
  cutAtGaps?: boolean
  /**
   * Whether a line-final hyphen is the typesetter's is told by the word
   * after it, not by the line having reached its column's edge (`joinLines`,
   * `joinedAtHyphen`). Salzburg's documents break words at lines that end
   * short of the edge — 1.447 times in 157 of them, against 10.959 at the
   * edge — and the right column's edge of a short one stands at its two
   * widest lines, 11 pt beyond the rest (18214): „Höchs- tausmaß" (18186),
   * „zu verbes- sern" (18214, § 86). And at the edge a drafter's hyphen went
   * with the word as well: „Kinderund Jugendhilfe" (34413, § 15a).
   */
  hyphensByWord?: boolean
}

/**
 * The one of the draft's laws this line is by name (`AnnexLayout.lawsByName`);
 * null where it is none or more than one. Not a sentence that names it:
 * 18116's title, „Gesetz vom …, mit dem das Salzburger
 * Landesverwaltungsgerichtsgesetz, das Salzburger Landes-Beamtengesetz 1987,
 * … geändert werden", opened the Landes-Beamtengesetz over the first law.
 * Across both columns (`loose`) give or take a short addition; in each column
 * the name alone — a paragraph's last line can begin with a law's name:
 * „Bautechnikgesetz 2015 in Kraft." (32075, § 29 of the
 * Bebauungsgrundlagengesetz) opened the Bautechnikgesetz there.
 */
function lawNamed(text: string, names: readonly string[], loose: boolean): string | null {
  const line = lawNameKey(text)
  const hits = names.filter((n) => {
    const name = lawNameKey(n)
    return line === name || (loose && ((line.startsWith(name) && line.length - name.length <= 20) || (name.startsWith(line) && name.length - line.length <= 20)))
  })
  return hits.length === 1 ? hits[0]! : null
}

/**
 * A law's name as `lawNamed` compares it: in lower case, without an
 * abbreviation after a dash and without the Land in front — 34728's document
 * heads „Salzburger Landesumweltanwaltschafts-Gesetz" what its draft amends
 * as „Landesumweltanwaltschafts-Gesetz – LUA-G".
 */
function lawNameKey(name: string): string {
  return normalizeText(name).toLowerCase().replace(/\s+/g, ' ').trim()
    .replace(/\s+[–-]\s+[\p{L}.\s-]*\d*$/u, '')
    .replace(/^(?:salzburger|kärntner|tiroler|wiener|oö\.)\s+/u, '')
}

/** „entfällt", „(3) entfallen": what a column prints for a § or an Absatz the draft repeals. */
const REPEALED_RE = /^(?:\(\d+[a-z]*\)\s*)?(?:entf(?:ällt|allen)|aufgehoben)\.?$/i

/** „§ 25." alone on its line — the designation Salzburg centres its heading over. */
const BARE_DESIGNATION_RE = /^[„"“]?\s*§\s*\d+[a-z]*\.?$/
/** How far a heading's middle may lie from its designation's or its column's, in points: 17,8 for 18159's of § 20; a line that ends a § stands 60 and more off. */
const AXIS_TOLERANCE = 20
/** How far inside its column a centred designation starts at least: some 150 pt in Salzburg's, 0 to 20 at the margin or an Absatz's indent. */
const CENTRED_INSET = 60

/**
 * Is this line set as a heading (`AnnexLayout`): its middle where the
 * designation's is, or the column's? Salzburg 28924's heading of § 5 stands
 * 0,05 pt off the middle of „§ 5.", on a document too short to measure its
 * column's margins; 23522's of § 2 0,1 pt off its column's middle, its „§ 2"
 * 10 pt off it. „… und die Beurteilung ihrer Person zu erhalten", the end of
 * § 7 before § 8's heading, 67 pt off.
 */
function onAxis(line: ColumnLine, designation: ColumnLine): boolean {
  if (line.centre === undefined) return false
  const near = (x: number | null | undefined) => typeof x === 'number' && Math.abs(line.centre! - x) <= AXIS_TOLERANCE
  return near(designation.centre) || near(line.axis)
}

/** How far inside its column a heading's short line starts at least — 100 pt and more in Salzburg's; a § ends on the margin or at a Ziffer's indent, 0 to 34 pt. */
const HEADING_INSET = 40

/** Does this line run on into the next — to its column's edge, without a sentence's end? */
const runsOn = (line: ColumnLine | undefined) => !!line && line.wrapped && !SENTENCE_END.test(line.text)

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
   * Blocks of the annex that belong to no provision and were left out.
   *
   * **Two different things, counted apart since 26.09.2026**, because they
   * would have to be phrased apart the moment a page discloses them:
   * `frontMatter` is everything a column prints before its first § marker —
   * „E n t w u r f", a Langtitel, a Promulgationsklausel, and one of them
   * 94.000 characters of Inhaltsverzeichnis — while `contents` is an entry of
   * a *reprinted* table of contents that no provision of the annex answers.
   * „We are not showing the front matter" is a triviality; „we are not
   * showing an entry the annex prints as a provision" is a statement about
   * coverage. `unplaced` stays as their sum so nothing that reads it moves.
   *
   * Optional and read by no shipping caller: one that wants to disclose "so
   * many blocks of the annex are not shown" can. Until one does, the number
   * is pinned by the two golden parses (`tests/annexGolden.test.ts`,
   * `tests/annexPdf.test.ts`), so a change in what the parse leaves out still
   * fails loudly instead of passing unnoticed. The debug printer that used
   * to be its other reader was removed on 22.09.2026.
   */
  unplaced?: number
  /** The two halves of `unplaced`, for a caller that has to name them. */
  unplacedKinds?: { frontMatter: number; contents: number }
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
 * against", and the annex is then read as one undivided law — a case only
 * the tests construct, which is why the parameter carries a default at all.
 */
export function parseAnnexPdf(pages: readonly AnnexPage[], articles: readonly DraftArticle[] = [], layout: AnnexLayout = {}): AnnexParse {
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
  //
  // **The seam gates the pages; it does not cut them**, and that was measured
  // rather than assumed (2026-09-11, §12.13). Over the 114 annexes the ink
  // estimate and the document's seam agree within 0,5 pt in 100 of them and
  // within 4 pt in 112; the two that disagree are the
  // EU-ESG-Rating-Verordnung-Vollzugsgesetz (57,0 pt, where the seam is right)
  // and the Abgrenzungsverordnung 2004 (13,7 pt, where the ink is). Cutting at
  // the seam repairs the first — one § of a two-page annex, whose one misplaced
  // word the gate withholds today and would go on withholding — and wrecks the
  // Abgabenänderungsgesetz 2025, whose 1.285 sliced runs turn into spanning
  // headings: 111 §§ change text, §§ 73b MinBestG and 85a BAO disappear, and
  // three verdicts move, one of them a § the check had *withheld* coming out
  // verified. Three further rules were measured and each cost an annex of its
  // own: the seam as the *anchor* of the ink's search window, and the gutter
  // measured as the gap most lines share, both drop that same EU-ESG § into a
  // heading instead of repairing it; measuring either over the header pages
  // alone finally reaches it and loses the Bilanzbuchhaltungsgesetz 2014
  // instead, which prints the header pair on 2 of its 7 pages. So the ink keeps
  // the cut.
  const boundary = vouched.length === read.length ? estimate : columnBoundary(vouched.map((p) => p.page))
  const pageLines = vouched.length === read.length ? vouched.map((p) => p.lines) : vouched.map((p) => linesFromPage(p.page, boundary))
  const placed = pageLines.flat()

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
  // The first line after each page the parse did not read, and whether the last read page was followed by one (`AnnexLayout.cutAtGaps`).
  const gapAt = new Set<AnnexLine>()
  if (layout.cutAtGaps) {
    const index = vouched.map((p) => pages.indexOf(p.page))
    index.forEach((k, n) => {
      const first = n > 0 && k - index[n - 1]! > 1 ? pageLines[n]!.find((l) => !isChrome(l)) : undefined
      if (first) gapAt.add(first)
    })
  }
  // Where a document of its own begins inside the annex: its title,
  // „Textgegenüberstellung", after the first content line (`startsDocument`).
  const documentStarts = startsDocument(pageLines)
  // Measured over the whole document, like the boundary: a single page need
  // not print one line that reaches its column's edge.
  const edges = columnEdges(placed, boundary, vouched[0]?.page.width ?? width)
  // Where each column's body text runs, for `isCentred` — over the content,
  // not the chrome: a page number on each of 113 pages is a common end too.
  const margins = {
    left: { start: columnMargin(lines.filter((l) => l.left).map((l) => l.leftStart), 'start'), end: columnMargin(lines.filter((l) => l.left).map((l) => l.leftEnd), 'end') },
    right: { start: columnMargin(lines.filter((l) => l.right).map((l) => l.rightStart), 'start'), end: columnMargin(lines.filter((l) => l.right).map((l) => l.rightEnd), 'end') },
  }

  const { candidates, roles } = candidateLines(lines, edges, layout.lawsByName ? articles.flatMap((a) => (a.title ? [a.title] : [])) : [])
  const resolution = resolveBoundaries(candidates, articles)

  const sections: { article: DraftArticle | null; opened: boolean; lines: AnnexLine[] }[] = [
    { article: resolution.whole, opened: false, lines: [] },
  ]
  /** Context headings waiting for the provision they stand over. */
  let pendingHeading: string[] = []
  const contextFor = new Map<AnnexLine, string>()
  /** The first line of a section that a new document of the annex begins with (`startsDocument`). */
  const startsPart = new Set<AnnexLine>()

  /** A document began on a line that went into no section — a heading, a law boundary — so the next one is its first. */
  let partPending = false
  /** The same for the first line after a page the parse did not read (`gapAt`). */
  let gapPending = false
  const gapStart = new Set<AnnexLine>()
  for (const [i, line] of lines.entries()) {
    if (documentStarts.has(line)) partPending = true
    if (gapAt.has(line)) gapPending = true
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
    if (documentStarts.has(line) || partPending) startsPart.add(line)
    partPending = false
    if (gapPending) gapStart.add(line)
    gapPending = false
    sections[sections.length - 1]!.lines.push(line)
  }

  let frontMatter = 0
  let contents = 0
  for (const section of sections) {
    const law = section.article?.key ?? null
    if (section.opened && section.article) {
      rows.push({ kind: 'article', law, heading: headingOf(section.article), gld: null, para: null, paraAfter: null, current: '', proposed: '', change: 'unchanged', elided: false, segments: null, editorial: false, elisionRange: false })
    }
    const at = (start: number, end: number, margin: { start: number | null; end: number | null }) => ({
      centre: (start + end) / 2,
      inset: margin.start === null ? null : start - margin.start,
      axis: margin.start === null || margin.end === null ? null : (margin.start + margin.end) / 2,
    })
    const leftLines = section.lines.map((l) => ({ text: l.left, wrapped: reachedEdge(l.leftEnd, edges.left), centred: isCentred(l.leftStart, l.leftEnd, margins.left), flush: isFlush(l.leftStart, margins.left), ...at(l.leftStart, l.leftEnd, margins.left), context: contextFor.get(l), barrier: startsPart.has(l), gap: gapStart.has(l) }))
    const rightLines = section.lines.map((l) => ({ text: l.right, wrapped: reachedEdge(l.rightEnd, edges.right), centred: isCentred(l.rightStart, l.rightEnd, margins.right), flush: isFlush(l.rightStart, margins.right), ...at(l.rightStart, l.rightEnd, margins.right), context: contextFor.get(l), barrier: startsPart.has(l), gap: gapStart.has(l) }))
    const toc = contentsInBoth(leftLines, rightLines)
    const leftRead = unitsOfColumn(leftLines, toc.left, layout)
    const rightRead = unitsOfColumn(rightLines, toc.right, layout)
    const left = leftRead.units
    const right = rightRead.units
    // The reprinted tables of contents, per column (`contentsRegions`).
    contents += leftRead.contents + rightRead.contents
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
        frontMatter++
        continue
      }
      const mate = byId.get(unit.id)
      // A one-sided entry of the annex's Inhaltsverzeichnis, which would go
      // out as an insertion — counted, like the front matter above it.
      if (!mate && isContentsEntry(unit.gld, unit.text)) {
        contents++
        continue
      }
      if (mate?.id) used.add(mate.id)
      const row = rowOf(law, unit.gld ?? mate?.gld ?? null, mate?.text ?? '', unit.text, unit.context ?? mate?.context ?? null)
      if (row) rows.push({ ...row, ...(unit.cut || mate?.cut ? { cut: true as const } : {}), ...(law === null && (unit.repeated || mate?.repeated) ? { repeated: true as const } : {}) })
    }
    // A § the draft repeals appears only on the left. Printed in the proposed
    // column's order everything else follows, it would otherwise vanish.
    for (const unit of left) {
      if (!unit.id) {
        frontMatter++
        continue
      }
      if (used.has(unit.id)) continue
      if (isContentsEntry(unit.gld, unit.text)) {
        contents++
        continue
      }
      const row = rowOf(law, unit.gld, unit.text, '', unit.context)
      if (row) rows.push({ ...row, ...(unit.cut ? { cut: true as const } : {}), ...(law === null && unit.repeated ? { repeated: true as const } : {}) })
    }
  }
  designateAfter(rows)
  return { rows, refusal: resolution.refusal, unplaced: frontMatter + contents, unplacedKinds: { frontMatter, contents }, droppedPages }
}
