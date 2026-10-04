/**
 * The Textgegenüberstellung's rows as `TextComparisonSection` shows them:
 * grouped by law, filtered by the search and the legend, counted in §§, and
 * cut into one block per Paragraph (04.10.2026, out of the component).
 *
 * Pure, so the rules a reader cannot see are pinned by a test
 * (tests/annexGroups.test.ts): which § is withheld, which one „nicht
 * geprüft", that the pill is marked once per §, what a search keeps and what
 * a hidden kind takes away. The legend's counts and the groups used to filter
 * the rows twice, each loop with its own copy of the search and the elided
 * rule; they share one pass now.
 */
import type { AnnexWithheldCause, ConsolidatedParagraph, LawDiffSegment, ParagraphExplanationView, TextComparisonRow } from '#shared/types'
import { type DiffBadge, paragraphBadge } from './diffBadges'
import { readsSideBySide, splitSegments } from './diffSides'

/**
 * A row whose two columns are nothing but the annex's elision notation, reaching
 * differently far („(1) bis (54) …" against „(1) bis (55) …"), is not the § changing
 * — it is the ressort leaving one Absatz more out. 13 such rows in the corpus
 * (26.09.2026). „redaktionell" is the pill this section already has for a
 * difference that is not one of substance, so it gets no sixth word; the line
 * below the pill says which case it is.
 */
export function annexBadge(row: TextComparisonRow): DiffBadge {
  return row.editorial || row.elisionRange ? 'editorial' : row.change
}

export interface AnnexGroup {
  /** Stable identity for the open/expanded state — the law, not its label */
  key: string
  article: string
  rows: TextComparisonRow[]
  /** The header's pills, in §§ (`paragraphBadge`). */
  counts: Record<DiffBadge, number>
  /** §§ the check withheld — a pill of their own, so a collapsed group says
   *  itself that something is missing. */
  withheld: number
  /** §§ shown with a change the check could not reach (`nicht geprüft`). */
  unchecked: number
  /** Why, as the server worded it — distinct, first seen first. */
  uncheckedReasons: Set<string>
}

/**
 * The § a row belongs to, as the check keys it (`gateRows`: `gld ?? para`).
 * A row without one is a unit of its own — counting it into a „§ null"
 * would merge unrelated rows.
 */
function paragraphKeyOf(row: TextComparisonRow, index: number): string {
  return row.gld ?? row.para ?? `#${index}`
}

/** One § per law: the key both the legend and the filter count by. */
function paragraphIdOf(row: TextComparisonRow, index: number): string {
  return `${row.law ?? ''}|${paragraphKeyOf(row, index)}`
}

/** Owed a check and did not get one — „nicht geprüft". Whether a check is
 *  owed is the server's call (`owesCheck`, `gateRows`), never re-derived here. */
function isUnchecked(row: TextComparisonRow): boolean {
  return row.check === 'unchecked' && row.owesCheck
}

const noCounts = (): Record<DiffBadge, number> => ({ unchanged: 0, changed: 0, editorial: 0, inserted: 0, removed: 0 })

export interface AnnexFilter {
  /** The search: whether a row matches it; null while nothing is searched. */
  matches: ((row: TextComparisonRow) => boolean) | null
  /** Kinds of change the legend switched off — whole §§ (`paragraphBadge`). */
  hidden: readonly DiffBadge[]
}

/**
 * One group per **law** of the package, not per heading the annex prints —
 * and the legend's counts, in §§ over the rows the search leaves.
 *
 * Grouping by heading made one group per Abschnitt, per Hauptstück and per
 * heading over a group of §§: one draft showed 38 groups for its 5 laws.
 * `row.law` is the law the draft itself names (`annexBoundaries.ts`), so a
 * heading that divides *one* law now stands over its rows instead of
 * splitting the comparison.
 *
 * Rows the ressort abbreviated to "2. bis 26b. …" carry no text and only
 * interrupt the read, so they drop out — the context line already says how
 * much is unchanged. Since 2026-09-10 a row is `elided` only when it consists
 * of nothing *but* that syntax (`isElidedPair`), so the skip drops exactly
 * what it means to: the 919 rows that carried a real change behind a trailing
 * "…" are no longer among them.
 *
 * `rows`: the response's rows, or none where it is not `available`.
 */
export function groupAnnexRows(
  rows: readonly TextComparisonRow[],
  { matches, hidden }: AnnexFilter,
): { groups: AnnexGroup[]; kindCounts: Record<DiffBadge, number> } {
  // The query filters here rather than in a step of its own: an `article`
  // row is structural — it opens a group and carries the law's title — so it
  // always survives, and a group left without rows drops out below.
  const kept: { row: TextComparisonRow; index: number }[] = []
  for (const [index, row] of rows.entries()) {
    if (row.kind !== 'article' && (row.elided || (matches && !matches(row)))) continue
    kept.push({ row, index })
  }

  /*
   * Each §'s pill over the rows the search leaves — the same rule the group
   * headers apply below (`paragraphBadge`), and the same exclusion: a § the
   * check withheld is no kind of change on screen, so it is neither counted
   * nor ever hidden.
   */
  const byId = new Map<string, { badges: Set<DiffBadge>; withheld: boolean }>()
  for (const { row, index } of kept) {
    if (row.kind === 'article') continue
    const id = paragraphIdOf(row, index)
    let p = byId.get(id)
    if (!p) byId.set(id, (p = { badges: new Set(), withheld: false }))
    if (row.check === 'withheld') p.withheld = true
    else p.badges.add(annexBadge(row))
  }
  const kinds = new Map<string, DiffBadge>()
  for (const [id, p] of byId) if (!p.withheld && p.badges.size) kinds.set(id, paragraphBadge(p.badges))
  /** The legend's counts, in §§ over the whole comparison. */
  const kindCounts = noCounts()
  for (const badge of kinds.values()) kindCounts[badge]++

  const out: AnnexGroup[] = []
  const start = (row: TextComparisonRow): AnnexGroup => {
    const group: AnnexGroup = { key: row.law ?? `#${out.length}`, article: row.kind === 'article' ? (row.heading ?? '') : '', rows: [], counts: noCounts(), withheld: 0, unchecked: 0, uncheckedReasons: new Set() }
    out.push(group)
    return group
  }
  let current: AnnexGroup | null = null
  /* Per group and §: the pills of its shown rows, and the check's state.
   * The verdict is per §, so a § is withheld or unchecked as a whole. */
  const paras = new Map<AnnexGroup, Map<string, { badges: Set<DiffBadge>; withheld: boolean; unchecked: boolean }>>()
  for (const { row, index } of kept) {
    if (row.kind === 'article') {
      current = start(row)
      continue
    }
    if (hidden.length) {
      const kind = kinds.get(paragraphIdOf(row, index))
      if (kind && hidden.includes(kind)) continue
    }
    if (!current || (row.law !== null && current.key !== row.law)) current = start(row)
    current.rows.push(row)
    let byPara = paras.get(current)
    if (!byPara) paras.set(current, (byPara = new Map()))
    const key = paragraphKeyOf(row, index)
    let p = byPara.get(key)
    if (!p) byPara.set(key, (p = { badges: new Set(), withheld: false, unchecked: false }))
    // A withheld row keeps its `change` but lost its text, so counting it
    // would put a change in the header pill that the block below says is not
    // shown — and `stats` already leaves those rows out. It is counted as
    // what it is: a § not shown.
    if (row.check === 'withheld') p.withheld = true
    else p.badges.add(annexBadge(row))
    // Rows without a § too, one unit each: they owe a check no verdict can
    // reach (they stood in the status line as „ohne Paragraphenangabe").
    if (isUnchecked(row)) {
      p.unchecked = true
      if (row.uncheckedReason) current.uncheckedReasons.add(row.uncheckedReason)
    }
  }
  // In §§ since 02.10.2026, not rows: every pill counts the same unit, so a
  // law's pills add up to its §§ (`paragraphBadge`).
  for (const [group, byPara] of paras) {
    for (const p of byPara.values()) {
      if (p.withheld) group.withheld++
      else group.counts[paragraphBadge(p.badges)]++
      if (p.unchecked) group.unchecked++
    }
  }
  return { groups: out.filter((g) => g.rows.length > 0), kindCounts }
}

export type AnnexBlock =
  /** The two columns come along computed: the template asked for each of them
   *  twice per row, on every render, and a render happens per keystroke. */
  | { kind: 'row'; row: TextComparisonRow; from: LawDiffSegment[]; to: LawDiffSegment[]; split: boolean; unchecked: boolean }
  | { kind: 'context'; rows: TextComparisonRow[] }
  /**
   * Changes the RIS check would not vouch for. The server sends these rows
   * without their text (`server/utils/annex/gateRows.ts`), so there is
   * nothing to render but the fact — and that fact is worth a line: a
   * comparison that silently drops a § is a different kind of wrong answer
   * from one that says it did.
   */
  | { kind: 'withheld'; count: number; cause: AnnexWithheldCause | null }

/**
 * One block per **paragraph**, its Absätze beneath it.
 *
 * The annex prints one row per Absatz, so a § arrives as a run of rows of
 * which only the first carries the designation and the heading. Rendered row
 * by row that put the § heading over a single Absatz, repeated the
 * designation on every row that had one — and printed it twice, because the
 * text began with it as well — and set an inherited designation in a
 * different weight from an own one, which is a distinction about our parse
 * and not about the law. Collected per §, all three questions disappear:
 * designation and title stand once, on one line, the way law is printed.
 */
export interface AnnexPara {
  /**
   * The § this block belongs to — `row.para`, '' for the rows before the
   * first designation. Doubles as the `v-for` key, and is unique within a
   * group because `para` is INHERITED by every row that opens no designation
   * of its own: a § therefore arrives as one contiguous run, never twice.
   */
  key: string
  /** "§ 40." — null for rows that precede the first designation */
  gld: string | null
  /** The annex's own heading for the paragraph */
  heading: string | null
  blocks: AnnexBlock[]
  /** What the Ressort explains about this very §; empty when nothing was found. */
  explanations: ParagraphExplanationView[]
  /** The whole § as it would read after the draft; null where the gate withholds it. */
  consolidated: ConsolidatedParagraph | null
  /** Whether a row of this § already carries the „nicht geprüft" pill. */
  uncheckedMarked: boolean
}

export interface AnnexParaOptions {
  /** Changes printed before the group's „show the rest" line (`limitFor`). */
  limit: number
  /** Whether unchanged rows fold into a context line — not while searching:
   *  then the reader asked for these very rows, so an unchanged hit gets its
   *  own block instead of disappearing into a folded context line that says
   *  only how many there were. */
  folding: boolean
  explanationsFor: (law: string | null, para: string | null) => ParagraphExplanationView[]
  consolidatedFor: (law: string | null, para: string | null) => ConsolidatedParagraph | null
}

export function annexParas(g: AnnexGroup, { limit, folding, explanationsFor, consolidatedFor }: AnnexParaOptions): { paras: AnnexPara[]; hidden: number } {
  const paras: AnnexPara[] = []
  let current: AnnexPara = { key: '\u0000', gld: null, heading: null, blocks: [], explanations: [], consolidated: null, uncheckedMarked: false }
  let context: TextComparisonRow[] = []
  let shown = 0
  let hidden = 0
  let withheld = 0
  // Every withheld row of a § carries the same cause — the verdict is per §.
  let withheldCause: AnnexWithheldCause | null = null
  const flush = () => {
    // The context line also stands on §§ that carry a Lesefassung, and that
    // is a decision rather than an oversight (19.09.2026): it folds the
    // unchanged rows OF THE ANNEX, in the same column logic as the changed
    // ones above — the Lesefassung below is our text from RIS. For a reader
    // reading the annex, „was hat das Ressort hier unverändert abgedruckt" is
    // different information from „so lautet der Paragraph dann". Dropping it
    // on those §§ was tried briefly and undone.
    if (context.length) current.blocks.push({ kind: 'context', rows: context })
    context = []
    if (withheld > 0) current.blocks.push({ kind: 'withheld', count: withheld, cause: withheldCause })
    withheld = 0
    withheldCause = null
  }
  for (const row of g.rows) {
    const key = row.para ?? ''
    if (current.key !== key) {
      flush()
      current = { key, gld: row.para, heading: null, blocks: [], explanations: explanationsFor(row.law, row.para), consolidated: consolidatedFor(row.law, row.para), uncheckedMarked: false }
      paras.push(current)
    }
    // The heading belongs to the paragraph, not to the Absatz that carries it.
    current.heading ??= row.heading
    if (row.check === 'withheld') {
      withheld++
      withheldCause ??= row.withheldCause ?? null
      continue
    }
    if (row.change === 'unchanged' && folding) {
      context.push(row)
      continue
    }
    if (shown >= limit) {
      hidden++
      continue
    }
    flush()
    // „nicht geprüft" beside the change badge, once per § (02.10.2026): the
    // verdict is per §, and on every row of a five-row § it would repeat
    // itself. At the first SHOWN row that owed a check, so a fold cannot
    // swallow it. A row without a § is a unit of its own and always gets it.
    const unchecked = isUnchecked(row) && (row.para === null || !current.uncheckedMarked)
    if (unchecked && row.para !== null) current.uncheckedMarked = true
    current.blocks.push({ kind: 'row', row, ...splitSegments(row.segments, row.current, row.proposed), split: readsSideBySide(row.segments), unchecked })
    shown++
  }
  flush()
  return { paras: paras.filter((p) => p.blocks.length > 0), hidden }
}
