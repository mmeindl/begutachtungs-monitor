/**
 * A new law as its draft prints it, from the parse (23.11.2026).
 *
 * PURE MODULE: relative imports only, so vitest runs it directly. The
 * fetching stands in `enactedLawsService.ts`.
 */
import type { EnactedLaw, EnactedLine, EnactedParagraph, LawTable } from '../../../shared/types/annex'
import { displayId } from '../../../shared/utils/unitName'
import type { DraftArticle } from './draftArticles'
import type { LawUnit, TextBlock } from './lawUnits'
import { ANLAGE_DESIGNATION_RE, RIS_SCHEDULE_DESIGNATION_CLS, segmentUnits } from './lawUnits'

/** The parse this module reads (`DraftText` of `draftArticlesService.ts`, which is not pure). */
interface ParsedDraft {
  blocks: TextBlock[]
  articles: DraftArticle[]
}

/** What a § prints below its heading: Absätze, Ziffern, and text the parser did not class. */
const BODY: ReadonlySet<TextBlock['kind']> = new Set(['abs', 'ziff', 'other'])

/** A block's words as printed: a raised or lowered run joined to its word (`TextBlock.parts`). */
const printedText = (b: TextBlock): string => (b.parts ? b.parts.map((p) => p.text).join('') : b.text)

const lineOf = (b: TextBlock): EnactedLine => ({
  text: printedText(b),
  sub: b.kind === 'ziff',
  ...(b.table ? { table: true as const } : {}),
  ...(b.parts ? { parts: b.parts } : {}),
})

const headingLine = (b: TextBlock): EnactedLine => ({ ...lineOf(b), sub: false, heading: true })

/**
 * Pure: the Artikel that enact or repeal without a § of their own, as printed
 * (23.11.2026). 139/ME XXVIII: „Artikel 1 – Aufhebung des Bundesgesetzes …"
 * is one sentence and no §, so `segmentUnits` makes no unit of it, and the
 * new law's section would have lost the repeal.
 */
export function otherArticlesOf(draft: ParsedDraft): EnactedParagraph[] {
  const withUnits = new Set(segmentUnits(draft.blocks).map((u) => u.article))
  const out: EnactedParagraph[] = []
  let current: EnactedParagraph | null = null
  for (const b of draft.blocks) {
    if (b.kind === 'article') {
      const a = draft.articles.find((x) => x.number === b.text && !x.amends && x.key !== null && !withUnits.has(x.key))
      current = a ? { id: b.text, heading: a.title, lines: [] } : null
      if (current) out.push(current)
    } else if (current && BODY.has(b.kind) && b.text.trim()) {
      current.lines.push(lineOf(b))
    }
  }
  return out.filter((a) => a.lines.length > 0)
}

/**
 * One law's units as the document prints them (23.11.2026).
 *
 * `segmentUnits` serves the comparisons: it drops the structure's headings
 * and reads a law's schedules as text of its last §, on both sides alike, and
 * that stays. A reader of the law needs what it leaves out, so this walks the
 * blocks again with the units as the guide: an Anlage becomes a unit of its
 * own (§ 55 of 149/ME XXVIII held nine of them), a heading between two units
 * opens the next one (`before`), and one inside a unit stays in its place,
 * which is where RIS sets a formula (213/ME XXVII).
 */
function printedUnits(
  blocks: readonly TextBlock[],
  units: readonly LawUnit[],
  names: readonly (string | null)[],
  tables: readonly LawTable[],
): EnactedParagraph[] {
  const unitOf = new Map<TextBlock, LawUnit>()
  for (const u of units) for (const b of u.blocks) unitOf.set(b, u)
  const grids = readableGrids(blocks, unitOf, tables)
  const placedGrids = new Set<number>()
  const first = blocks.findIndex((b) => unitOf.has(b))
  if (first < 0) return []
  const last = blocks.findLastIndex((b) => unitOf.has(b))
  const next = blocks.findIndex((b, i) => i > last && b.kind === 'article')
  const end = next < 0 ? blocks.length : next

  // The law's own headings above its first §, without the name its group prints.
  let pending: TextBlock[] = []
  for (let i = first - 1; i >= 0; i--) {
    const b = blocks[i]!
    if (b.kind === 'para_head') continue
    if (b.kind !== 'section') break
    if (!names.includes(b.text)) pending.unshift(b)
  }

  const out: EnactedParagraph[] = []
  const opened = new Set<LawUnit>()
  let current: EnactedParagraph | null = null
  let awaitsHeading = false
  const open = (id: string, heading: string | null) => {
    current = { id, heading, ...(pending.length ? { before: pending.map(printedText) } : {}), lines: [] }
    pending = []
    out.push(current)
  }
  for (let i = first; i < end; i++) {
    const b = blocks[i]!
    const u = unitOf.get(b)
    if (u && !opened.has(u)) {
      opened.add(u)
      // A second unit of the same number („#dup") is real text, printed
      // under the number the draft gives it (`displayId`).
      open(displayId(u.id), u.heading)
    }
    if (b.tableAt !== undefined && current && grids.has(b.tableAt)) {
      if (!placedGrids.has(b.tableAt)) {
        placedGrids.add(b.tableAt)
        const unit: EnactedParagraph = current
        const grid = grids.get(b.tableAt)!
        unit.lines.push(...pending.map(headingLine), { text: gridCells(grid).join(' '), sub: false, grid })
        pending = []
        awaitsHeading = false
      }
      continue
    }
    if (b.cls === RIS_SCHEDULE_DESIGNATION_CLS && ANLAGE_DESIGNATION_RE.test(b.text)) {
      open(printedText(b), null)
      awaitsHeading = true
    } else if (b.kind === 'section') {
      if (awaitsHeading && current) {
        (current as EnactedParagraph).heading = printedText(b)
        awaitsHeading = false
      } else {
        pending.push(b)
      }
    } else if (u && current && BODY.has(b.kind) && b.text.trim()) {
      const unit: EnactedParagraph = current
      unit.lines.push(...pending.map(headingLine), lineOf(b))
      pending = []
      awaitsHeading = false
    }
  }
  return out.filter((p) => p.lines.length > 0)
}

const gridCells = (grid: LawTable): string[] => grid.rows.flatMap((row) => row.flatMap((c) => c.lines.map((l) => l.text)))

/**
 * The tables this law can print as tables. One of a single column counts:
 * 297/ME XXVII sets its fractions that way, numerator over denominator, and
 * as lines the two would read as two sentences. A table is held to the parse:
 * its blocks stand in one unit, and each of them is a cell of the grid, so a
 * grid that lost a cell, or a cached parse of another version of the
 * document, falls back to the run of cells with its gap sentence.
 */
function readableGrids(blocks: readonly TextBlock[], unitOf: ReadonlyMap<TextBlock, LawUnit>, tables: readonly LawTable[]): Map<number, LawTable> {
  const byTable = new Map<number, TextBlock[]>()
  for (const b of blocks) if (b.tableAt !== undefined) byTable.set(b.tableAt, [...(byTable.get(b.tableAt) ?? []), b])
  const out = new Map<number, LawTable>()
  for (const [at, own] of byTable) {
    const grid = tables[at]
    if (!grid) continue
    const inUnits = new Set(own.flatMap((b) => (unitOf.has(b) ? [unitOf.get(b)!] : [])))
    if (inUnits.size !== 1) continue
    const cells = new Set(gridCells(grid))
    if (own.every((b) => cells.has(printedText(b)))) out.set(at, grid)
  }
  return out
}

/** Pure: the draft's parse → its new laws, each with its §§ and Anlagen. */
export function enactedLawsOf(draft: ParsedDraft, tables: readonly LawTable[] = []): EnactedLaw[] {
  const enacting = draft.articles.filter((a) => !a.amends && a.key !== null)
  if (enacting.length === 0) return []
  const units = segmentUnits(draft.blocks)
  return enacting
    .map((a) => ({
      law: a.key!,
      paragraphs: printedUnits(draft.blocks, units.filter((u) => u.article === a.key), [a.key, a.title], tables),
    }))
    .filter((l) => l.paragraphs.length > 0)
}
