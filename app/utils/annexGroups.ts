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
import type { AnnexWithheldCause, ConsolidatedTextResponse, LawDiffSegment, ParagraphExplanationView, TextComparisonRow } from '#shared/types'
import { annexUnitId, explanationKey, explanationParaId } from '#shared/utils/explanationKey'
import { type DiffBadge, paragraphBadge } from './diffBadges'
import { readsSideBySide, splitSegments } from './diffSides'
import { outcomeIndex, showsInstructedChange, type LawEnd, type Lesefassung } from './lesefassung'

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

/** A division of the law, which an elision line may name instead of a part of its §. */
const DIVISION_RE = /^\s*(?:Art(?:ikel)?\b|Anlage|Anhang|Teil\b|Abschnitt|Unterabschnitt|Hauptstück|Kapitel|\d+[a-z]*\.\s*(?:Teil|Abschnitt|Unterabschnitt|Hauptstück|Kapitel)\b)/i

/**
 * Whether an elided row says that ITS § has standing text the draft leaves
 * alone — „(1) bis (4) …", „2. bis 26b. …" under § 54, or the § opening with
 * its own elision („§ 54." and „(1) bis (3) …").
 *
 * Not a line that names other units: „§§ 21 bis 25 …" leaves out five §§ and
 * inherits its `para` from the § above without being part of it
 * (`elisionOpens` in server/utils/annex/elision.ts), and neither is an
 * Abschnitt left out.
 */
function keepsStandingText(row: TextComparisonRow): boolean {
  if (row.gld !== null) return true
  const named = explanationParaId(row.current)
  if (named !== null) return named === explanationParaId(row.para)
  return !DIVISION_RE.test(row.current)
}

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
 * Dropped from the rows, not from what the § is: an elided row is the
 * ressort saying the § has standing text it leaves alone, so a § whose only
 * printed row is a new Absatz is „geändert", not „neu" — StVO § 54 on 62/ME
 * XXVIII prints its new (4a) between „(1) bis (4) …" and „(5) bis (7) …"
 * (`keepsStandingText`). „neu" is a claim about all of the §
 * (`paragraphBadge`).
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
  /** §§ (`paragraphIdOf`) with standing text the annex leaves out — whatever the search keeps. */
  const standing = new Set<string>()
  for (const [index, row] of rows.entries()) {
    if (row.kind !== 'article' && row.elided) {
      if (keepsStandingText(row)) standing.add(paragraphIdOf(row, index))
      continue
    }
    if (row.kind !== 'article' && matches && !matches(row)) continue
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
    if (!p) byId.set(id, (p = { badges: new Set(standing.has(id) ? ['unchanged'] : []), withheld: false }))
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
    if (!p) byPara.set(key, (p = { badges: new Set(standing.has(paragraphIdOf(row, index)) ? ['unchanged'] : []), withheld: false, unchecked: false }))
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

/**
 * The laws the comparison has a group for, before any search or hidden kind
 * — what a caveat ABOVE the toolbar may depend on (25.10.2026). The note on
 * a doubtful law no group carries was computed from the filtered groups, so
 * a search that left that law's group out put the note above the very box
 * whose search had moved it: a control may change nothing above itself.
 */
export function annexLawKeys(rows: readonly TextComparisonRow[]): Set<string> {
  return new Set(groupAnnexRows(rows, { matches: null, hidden: [] }).groups.map((g) => g.key))
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
   *
   * `count`: the CHANGES withheld — rows that carry one. The verdict is per
   * §, so its unchanged Absätze are withheld with it, and counting rows put
   * „8 Änderungen hier nicht gezeigt" over a § with one (95/ME XXVIII § 7).
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
   * first designation — and the `v-for` key, so it has to be unique within a
   * group. `para` is inherited by every row that opens no designation of its
   * own, so a § usually arrives as one contiguous run; where a draft
   * renumbers, it does not. 51/ME XXVIII prints the new § 5 and, three §§
   * later, the repealed old § 5 — two blocks of one `para`. The second
   * occurrence of a `para` is keyed „§ 5.#2".
   */
  key: string
  /** "§ 40." — null for rows that precede the first designation */
  gld: string | null
  /**
   * The number the § stands under after the draft, where that is another one
   * — „§ 14." → „§ 22." (51/ME XXVIII, `TextComparisonRow.paraAfter`). Only
   * where the whole block is that one §: a run that opens two §§ (2/ME's § 2
   * beside the new § 1a) names them in its Lesefassungen instead, and a
   * repealed § says it with its struck rows.
   */
  renumberedTo: string | null
  /** The annex's own heading for the paragraph */
  heading: string | null
  blocks: AnnexBlock[]
  /** What the Ressort explains about this very §; empty when nothing was found. */
  explanations: ParagraphExplanationView[]
  /**
   * Our Lesefassung of the §§ this block stands for after the draft — shown,
   * or why not (`placeAtParagraphs`). Usually one; two where a run opens two
   * §§ (2/ME XXVIII: § 2 and the new § 1a), each under its designation.
   * Empty only where there is nothing to say: the run has not answered, or
   * the § shows no change an instruction would make.
   */
  lesefassungen: PlacedLesefassung[]
  /** Whether a row of this § already carries the „nicht geprüft" pill. */
  uncheckedMarked: boolean
}

/** One § of our Lesefassung at a block: the designation it carries after the draft, and its outcome. */
export interface PlacedLesefassung {
  designation: string | null
  lesefassung: Lesefassung
}

/** What one § block takes (`placeAtParagraphs`). */
export interface ParaPlacement {
  explanations: ParagraphExplanationView[]
  lesefassungen: PlacedLesefassung[]
}

export interface AnnexParaOptions {
  /** Changes printed before the group's „show the rest" line (`limitFor`) —
   *  reached within a §, the § is still printed whole. */
  limit: number
  /** Whether unchanged rows fold into a context line — not while searching:
   *  then the reader asked for these very rows, so an unchanged hit gets its
   *  own block instead of disappearing into a folded context line that says
   *  only how many there were. */
  folding: boolean
  /**
   * What each row's § block takes, by row (`placeAtParagraphs`) — decided
   * once over the whole annex, so a search that narrows the rows cannot move
   * a Begründung or a Lesefassung to another § or to the end of its law.
   */
  placed: ReadonlyMap<TextComparisonRow, ParaPlacement> | null
}

/** One § as the annex prints it: a contiguous stretch of rows under one `para`. */
interface ParagraphRun {
  key: string
  rows: TextComparisonRow[]
}

function paragraphRuns(rows: readonly TextComparisonRow[]): ParagraphRun[] {
  const runs: ParagraphRun[] = []
  for (const row of rows) {
    const key = row.para ?? ''
    const last = runs[runs.length - 1]
    if (last && last.key === key) last.rows.push(row)
    else runs.push({ key, rows: [row] })
  }
  return runs
}

/**
 * The §§ a run opens, each with the designation it carries AFTER the draft —
 * the one the Erläuterungen and the Lesefassung address it by.
 *
 * The server decides that per § (`TextComparisonRow.paraAfter`, from the
 * right column's own Gliederungssymbol) and writes it onto every row of it,
 * so a run splits where it changes. Usually it does not. It does where the
 * annex opens the same `para` twice in a row: 2/ME XXVIII pairs the standing
 * § 2 Abs. 1 to 3 with the new § 1a („§ 2." left, „§ 1a." right) and then
 * prints § 2 itself — one run, two §§ after the draft, each with its own
 * Begründung. Until 26.10.2026 the page read „§ 22." back out of the proposed
 * column's text, which a withheld row no longer has.
 */
function openedParagraphs(rows: readonly TextComparisonRow[]): TextComparisonRow[][] {
  const out: TextComparisonRow[][] = []
  for (const row of rows) {
    const last = out[out.length - 1]
    if (last && last[0]!.paraAfter === row.paraAfter) last.push(row)
    else out.push([row])
  }
  return out
}

/** A § as the Erläuterungen and the Lesefassung may address it. */
interface Addressed {
  /** The designation after the draft (`TextComparisonRow.paraAfter`); null where it is repealed. */
  after: string | null
  /** Its designation before — the row's `para`. */
  own: string | null
  /** Whether another § of the law carries `own` after the draft. */
  ownTaken: boolean
}

/**
 * Who each run is, for the two lookups: one entry per § it opens.
 *
 * The designation after the draft comes first, and the one before is the
 * fallback — because the corpus addresses a renumbered § both ways. 51/ME
 * XXVIII re-enacts the law and writes „Zu § 22: § 14 wird zum § 22"; 2/ME
 * amends § 14a and renumbers it afterwards, and writes „Zu Z 33 und 34
 * (§ 14a Abs. 3 …)" with nothing under § 15. So: what stands under the new
 * number, else what stands under the old one — but the old one only where no
 * other § of the law carries it after the draft. Where one does (51/ME: the
 * new § 14), „Zu § 14" explains that one, and the renumbered or repealed §
 * gets nothing rather than its successor's Begründung.
 */
function addressedParagraphs(runs: readonly ParagraphRun[]): Addressed[][] {
  const opened = runs.map((run) => openedParagraphs(run.rows).map((rows) => ({ own: rows[0]!.para, after: rows[0]!.paraAfter })))
  /** How many §§ of the law carry each number after the draft. */
  const carriers = new Map<string, number>()
  for (const { after } of opened.flat()) {
    const id = explanationParaId(after)
    if (id !== null) carriers.set(id, (carriers.get(id) ?? 0) + 1)
  }
  return opened.map((paragraphs) =>
    paragraphs.map(({ own, after }) => {
      const id = explanationParaId(own)
      const others = (carriers.get(id ?? '') ?? 0) - (id !== null && explanationParaId(after) === id ? 1 : 0)
      return { own, after, ownTaken: others > 0 }
    }),
  )
}

/** What one addressed § finds under `lookup` (see `addressedParagraphs`). */
function lookUp<T>(law: string | null, p: Addressed, lookup: (law: string | null, para: string | null) => T, found: (t: T) => boolean): T | null {
  if (p.after !== null) {
    const hit = lookup(law, p.after)
    if (found(hit)) return hit
    if (explanationParaId(p.after) === explanationParaId(p.own)) return null
  }
  return p.ownTaken ? null : lookup(law, p.own)
}

/** Passages that answer for several designations („Zu §§ 1a und 2") stand once. */
function distinctPassages(passages: readonly ParagraphExplanationView[]): ParagraphExplanationView[] {
  const seen = new Set<string>()
  return passages.filter((e) => {
    const key = `${e.heading}\u0000${e.text.join('\u0000')}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function annexParas(g: AnnexGroup, { limit, folding, placed }: AnnexParaOptions): { paras: AnnexPara[]; hidden: number } {
  const paras: AnnexPara[] = []
  const runs = paragraphRuns(g.rows)
  /** How often each `para` opened a block so far — for a unique `key`. */
  const seen = new Map<string, number>()
  /*
   * The limit cuts BETWEEN §§ (25.10.2026). It cut between rows, so the §
   * that reached it lost its remaining Absätze, and every § after it was
   * still printed — heading, „Begründung des Ressorts", „N Stellen
   * unverändert", the withheld notice and the Lesefassung, only without its
   * changes: a § that read as having none. Now a § is printed whole or not
   * at all, and once the limit is reached the rest of the group waits behind
   * the button.
   *
   * `hidden` keeps its unit — the rows that print as a change once the
   * button is pressed (`shows`) — so „N weitere Änderungen" is exactly what
   * appears. Where nothing of that kind is left, nothing is cut: the button
   * would have nothing to announce, and a § behind no button is a § gone.
   */
  const shows = (row: TextComparisonRow) => row.check !== 'withheld' && !(folding && row.change === 'unchanged')
  const rest: number[] = []
  for (let i = runs.length - 1, sum = 0; i >= 0; i--) rest[i] = sum += runs[i]!.rows.filter(shows).length
  let shown = 0
  let hidden = 0
  for (const [i, run] of runs.entries()) {
    if (shown >= limit && rest[i]! > 0) {
      hidden = rest[i]!
      break
    }
    const first = run.rows[0]!
    const n = (seen.get(run.key) ?? 0) + 1
    seen.set(run.key, n)
    // Any row of the § answers for it: the placement filed every row of it.
    const at = placed?.get(first) ?? null
    const afters = new Set(run.rows.map((r) => r.paraAfter))
    const [after] = afters
    const current: AnnexPara = {
      key: n === 1 ? run.key : `${run.key}#${n}`,
      gld: first.para,
      renumberedTo: afters.size === 1 && after != null && after !== first.para ? after : null,
      heading: null,
      blocks: [],
      explanations: at?.explanations ?? [],
      lesefassungen: at?.lesefassungen ?? [],
      uncheckedMarked: false,
    }
    paras.push(current)
    let context: TextComparisonRow[] = []
    /** Withheld rows, and the changes among them (`AnnexBlock` 'withheld'). */
    let withheld = 0
    let withheldChanges = 0
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
      if (withheld > 0) current.blocks.push({ kind: 'withheld', count: withheldChanges, cause: withheldCause })
      withheld = 0
      withheldChanges = 0
      withheldCause = null
    }
    for (const row of run.rows) {
      // The heading belongs to the paragraph, not to the Absatz that carries it.
      current.heading ??= row.heading
      if (row.check === 'withheld') {
        withheld++
        // The server empties the text and keeps `change` (`gateRows`).
        if (row.change !== 'unchanged') withheldChanges++
        withheldCause ??= row.withheldCause ?? null
        continue
      }
      if (row.change === 'unchanged' && folding) {
        context.push(row)
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
  }
  // One layout per § (22.10.2026): `readsSideBySide` decides per row, and a §
  // whose (3) stood in two columns and whose (4) ran inline switched shape
  // between two Absätze of one provision — it read as inconsistency, not as a
  // choice. Where one shown row of a § needs the columns, every changed row
  // of it gets them; a switch between §§ is one the reader can follow.
  // Inserted and removed rows have one side only and stay a single block
  // (`DiffBody`), so no column ever stands empty.
  for (const p of paras) {
    if (!p.blocks.some((b) => b.kind === 'row' && b.split)) continue
    for (const b of p.blocks) if (b.kind === 'row') b.split = true
  }
  return { paras: paras.filter((p) => p.blocks.length > 0), hidden }
}

/**
 * Where everything the page knows about a § goes — ONE pass over the whole
 * annex, before any search or legend (26.10.2026).
 *
 * Each § block takes, under the designation it carries AFTER the draft
 * (`addressedParagraphs`), the Ressort's Begründung and our Lesefassung —
 * one source of truth for both, so a renumbered § gets its own of each and
 * never its successor's (51/ME XXVIII: the old § 14, now § 22). What no
 * block takes is not dropped but kept for the end of its law (`ends`): the
 * §§ the draft amends that the annex prints no block for, and the passages
 * on a § without one — a new law above all, which no Textgegenüberstellung
 * covers (126/ME: 15 of 88 passages). Until then both were simply absent,
 * and nothing on the page said so.
 *
 * Every row maps to its block's placement, so `annexParas` finds it from
 * whichever row of the § the search left first.
 *
 * `consolidated` and `explanations` arrive separately and either may be
 * missing; each places what it has. `nicht-gefunden` — a § that shows a
 * change no instruction names — is said only once the Lesefassung's run has
 * answered (`outcomeIndex`).
 */
export function placeAtParagraphs(
  rows: readonly TextComparisonRow[],
  consolidated: ConsolidatedTextResponse | null,
  explanations: readonly ParagraphExplanationView[],
): { byRow: Map<TextComparisonRow, ParaPlacement>; groupKeys: string[]; ends: { byGroup: Map<string, LawEnd>; rest: (LawEnd & { law: string | null })[] } } {
  const { groups } = groupAnnexRows(rows, { matches: null, hidden: [] })
  const groupKeys = groups.map((g) => g.key)
  const outcomes = outcomeIndex(consolidated)

  // The passages under the key the section looks them up by: the law the
  // Erläuterungen file them under, and the bare §.
  const passages = new Map<string, ParagraphExplanationView[]>()
  for (const e of explanations) {
    const key = explanationKey(e.law, e.para)
    passages.set(key, [...(passages.get(key) ?? []), e])
  }
  const passagesAt = (law: string | null, para: string | null): ParagraphExplanationView[] => {
    const id = explanationParaId(para)
    return id ? (passages.get(explanationKey(law, id)) ?? []) : []
  }
  const placedPassages = new Set<ParagraphExplanationView>()

  const byRow = new Map<TextComparisonRow, ParaPlacement>()
  for (const g of groups) {
    const runs = paragraphRuns(g.rows)
    const addressed = addressedParagraphs(runs)
    for (const [i, run] of runs.entries()) {
      const first = run.rows[0]!
      const ps = addressed[i] ?? []
      const matched = ps.flatMap((p) => lookUp(first.law, p, passagesAt, (xs) => xs.length > 0) ?? [])
      for (const e of matched) placedPassages.add(e)

      const lesefassungen: PlacedLesefassung[] = []
      if (outcomes) {
        // The § that keeps the run's number first (2/ME's § 2 also opens the
        // new § 1a, and stays § 2), then the others, each under the number
        // it carries after the draft.
        const keeps = (p: (typeof ps)[number]): boolean => p.after !== null && explanationParaId(p.after) === explanationParaId(p.own)
        for (const p of [...ps.filter(keeps), ...ps.filter((p) => !keeps(p))]) {
          const hit = lookUp(first.law, p, (law, para) => outcomes.at(law, para), (o) => o !== null)
          if (!hit || hit.outcomes.every((o) => lesefassungen.some((l) => l.lesefassung === o.lesefassung))) continue
          outcomes.take(hit.outcomes)
          lesefassungen.push({ designation: p.after ?? p.own, lesefassung: hit.lesefassung })
          // A § this block shows under a new number leaves its old one
          // behind: the number is vacated (`entfaellt`), or another § holds
          // it — and that one is placed at its own block.
          if (p.after !== null && explanationParaId(p.after) !== explanationParaId(p.own)) {
            const old = outcomes.at(first.law, p.own)
            if (old && old.lesefassung.kind === 'withheld' && old.lesefassung.cause === 'entfaellt') outcomes.take(old.outcomes)
          }
        }
        // A § the annex shows changing, of which the Lesefassung knows
        // nothing: the draft's instructions, as we read them, name no such §.
        // Only at a § or a schedule — the Lesefassung is kept per unit, and
        // rows before the first designation (a heading, the table of
        // contents) are none. And only where a § of the block stands after
        // the draft: a repealed one is struck rows that say it already, and
        // where a new § took its number, that one's outcome is the new §'s
        // (51/ME XXVIII: the old §§ 5, 6, 8, 10 to 13 and 16).
        // Named by the number it stands under afterwards: 20/ME XXVIII's old
        // § 82 is § 83, and „§ 82" belongs to the old § 81 beside it.
        const standsAfter = ps.find((p) => p.after !== null)?.after ?? null
        if (lesefassungen.length === 0 && standsAfter !== null && annexUnitId(standsAfter) && showsInstructedChange(run.rows)) {
          lesefassungen.push({ designation: standsAfter, lesefassung: { kind: 'withheld', cause: 'nicht-gefunden' } })
        }
      }
      const placement: ParaPlacement = { explanations: distinctPassages(matched), lesefassungen }
      for (const row of run.rows) byRow.set(row, placement)
    }
  }

  // What no block took, per law; then per group of the annex, or after the
  // last group where the annex has none for that law. A single-law draft
  // files its §§ and passages under no law; they go to the one group, or
  // after the groups where the annex happens to divide itself.
  const leftovers = new Map<string | null, LawEnd>()
  const endOf = (law: string | null): LawEnd => {
    let end = leftovers.get(law)
    if (!end) leftovers.set(law, (end = { outcomes: [], explanations: [] }))
    return end
  }
  // A § of a law the draft enacts anew stands for a block of the annex by
  // construction (`enactedParagraphs`); one the page found no block for is
  // no § „der Entwurf ändert hier auch", which is what the end of a law says.
  for (const o of outcomes?.untaken() ?? []) {
    if (o.lesefassung.kind === 'withheld' && o.lesefassung.cause === 'neu-erlassen') continue
    endOf(o.law).outcomes.push({ id: o.id, lesefassung: o.lesefassung })
  }
  for (const e of explanations) if (!placedPassages.has(e)) endOf(e.law).explanations.push(e)
  const byGroup = new Map<string, LawEnd>()
  const rest: (LawEnd & { law: string | null })[] = []
  for (const [law, end] of leftovers) {
    const key = law === null ? (groupKeys.length === 1 ? groupKeys[0]! : null) : (groupKeys.includes(law) ? law : null)
    if (key !== null) byGroup.set(key, end)
    else rest.push({ law, ...end })
  }
  return { byRow, groupKeys, ends: { byGroup, rest } }
}
