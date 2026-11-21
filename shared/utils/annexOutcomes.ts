/**
 * Where an outcome of our Lesefassung stands in the Textgegenüberstellung:
 * the join of a § block of the annex to the server's outcomes, by the law
 * and the designation the § carries after the draft (26.10.2026; moved here
 * out of `app/utils/lesefassung.ts` and `app/utils/annexGroups.ts` on
 * 21.11.2026).
 *
 * Shared, because the page and the server both need it: the page places
 * each outcome at its block (`placeAtParagraphs`), and the server asks which
 * § of the annex the oracle confirmed, so that the annex's § may be shown
 * without a mark (`oracleConfirmedRows`, `server/utils/annex/annexMark.ts`).
 * Two copies of one join would be two chances for the mark and the page to
 * disagree about which § a Lesefassung belongs to.
 */
import type { ConsolidatedLaterAmendment, ConsolidatedParagraph, ConsolidatedTextResponse, ConsolidatedWithheldCause } from '../types'
import { annexUnitId, articleUnitLaws, explanationKey, numberedUnitId } from './explanationKey'

/** What the join reads of an annex row — the server's rows and the page's both carry it. */
export interface AnnexJoinRow {
  kind: string
  law: string | null
  gld: string | null
  para: string | null
  paraAfter: string | null
  elided: boolean
}

/**
 * Why a § carries no Lesefassung: the server's causes, and one only the page
 * can see — the annex shows a change at a § for which the draft's
 * instructions, as we read them, name none (`nicht-gefunden`).
 */
export type LesefassungCause = ConsolidatedWithheldCause | 'nicht-gefunden'

export type Lesefassung =
  | { kind: 'shown'; paragraph: ConsolidatedParagraph }
  | { kind: 'withheld'; cause: LesefassungCause; laterAmendment?: ConsolidatedLaterAmendment }

/** One outcome of the server, as the placement takes it. */
export interface Outcome {
  /** As the server keys it: „12", „Anl. 1". */
  id: string
  law: string | null
  lesefassung: Lesefassung
}

/**
 * The server's outcomes, looked up by the law and designation a § block
 * stands for — and taken once a block has them, so what is left at the end
 * is exactly what no block took. Null while there is nothing to place: no
 * response yet, or a run that did not happen (`notRun`, said once by
 * `lesefassungNotRunText`).
 */
export interface OutcomeIndex {
  /**
   * The outcome a § block of `law` with designation `designation` stands
   * for, or null. The lookups, in order, and why each:
   *  1. law and unit, the key the gate asked the annex with (`annexLaw`);
   *  2. the unit alone where the server filed the § under no law — a
   *     single-law Novelle asks the annex without one, while its row carries
   *     one anyway;
   *  3. the unnumbered schedule („Anl.") at the law's numbered one: an
   *     instruction „des Anhangs" can only mean a law's only schedule, and the
   *     annex prints its number — so only where the annex prints one schedule
   *     for that law (`soleSchedule`). Without that condition the one outcome
   *     stood at every numbered schedule of a law: the refusal of 571847EF's
   *     unnumbered „Anlage" also at its Anhänge 2 and 4, which no instruction
   *     touches (19.11.2026);
   *  4. a block without a law in a package — the annex does not divide its
   *     laws (`boundaryNote`): the § number alone, which only says something
   *     where a single law of the package has such a §, and otherwise says
   *     exactly that (`anhang-ungeteilt`).
   */
  at(law: string | null, designation: string | null): { lesefassung: Lesefassung; outcomes: Outcome[] } | null
  /** Mark outcomes as placed. */
  take(outcomes: readonly Outcome[]): void
  /** Everything not placed, in the server's order. */
  untaken(): Outcome[]
}

/** What the annex rows say about a law, for `outcomeIndex`. */
export interface AnnexLawShape {
  /**
   * Whether a law (as the annex rows name it) prints exactly one schedule —
   * the condition of lookup 3. Without it, no block takes the unnumbered
   * „Anl.", and it stands at the end of its law.
   */
  soleSchedule?: (law: string | null) => boolean
  /**
   * The laws whose units are Artikel (`articleUnitLaws`, the oracle's own
   * decision): there a block designated „Artikel 53." stands for the unit
   * „53".
   */
  articleLaws?: ReadonlySet<string>
}

export function outcomeIndex(response: ConsolidatedTextResponse | null, { soleSchedule = () => false, articleLaws = new Set() }: AnnexLawShape = {}): OutcomeIndex | null {
  if (!response || response.notRun) return null
  const all: Outcome[] = [
    ...response.paragraphs.map((p): Outcome => ({ id: p.id, law: p.annexLaw, lesefassung: { kind: 'shown', paragraph: p } })),
    ...(response.withheld ?? []).map((w): Outcome => ({ id: w.id, law: w.annexLaw, lesefassung: { kind: 'withheld', cause: w.cause, ...(w.laterAmendment ? { laterAmendment: w.laterAmendment } : {}) } })),
  ]
  const byKey = new Map<string, Outcome>()
  const byUnit = new Map<string, Outcome[]>()
  for (const o of all) {
    const unit = o.id.toLowerCase()
    const key = explanationKey(o.law, unit)
    if (!byKey.has(key)) byKey.set(key, o)
    byUnit.set(unit, [...(byUnit.get(unit) ?? []), o])
  }
  const taken = new Set<Outcome>()
  return {
    at(law, designation) {
      const unit = annexUnitId(designation, articleLaws.has(law ?? ''))
      if (!unit) return null
      const found = byKey.get(explanationKey(law, unit)) ??
        (law !== null ? byKey.get(explanationKey(null, unit)) : undefined) ??
        (unit.startsWith('anl. ') && soleSchedule(law) ? (byKey.get(explanationKey(law, 'anl.')) ?? byKey.get(explanationKey(null, 'anl.'))) : undefined)
      if (found) return { lesefassung: found.lesefassung, outcomes: [found] }
      if (law !== null) return null
      const candidates = (byUnit.get(unit) ?? []).filter((o) => o.law !== null)
      if (candidates.length === 0) return null
      return { lesefassung: candidates.length === 1 ? candidates[0]!.lesefassung : { kind: 'withheld', cause: 'anhang-ungeteilt' }, outcomes: candidates }
    },
    take(outcomes) {
      for (const o of outcomes) taken.add(o)
    },
    untaken: () => all.filter((o) => !taken.has(o)),
  }
}

/** One § as the annex prints it: a contiguous stretch of rows under one `para`. */
export interface ParagraphRun<R extends AnnexJoinRow = AnnexJoinRow> {
  key: string
  rows: R[]
}

export function paragraphRuns<R extends AnnexJoinRow>(rows: readonly R[]): ParagraphRun<R>[] {
  const runs: ParagraphRun<R>[] = []
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
export function openedParagraphs<R extends AnnexJoinRow>(rows: readonly R[]): R[][] {
  const out: R[][] = []
  for (const row of rows) {
    const last = out[out.length - 1]
    if (last && last[0]!.paraAfter === row.paraAfter) last.push(row)
    else out.push([row])
  }
  return out
}

/**
 * The number a designation of one law carries, as the placement compares it
 * (`numberedUnitId`): a §'s, and an Artikel's in a law whose units are
 * Artikel. Through `explanationParaId` alone „Artikel 90a." and „Artikel
 * 94a." were both nothing, so equal, and 127/ME XXVIII's renumbered Artikel
 * were placed as if they kept their number: the vacated Art. 90a stood at
 * the law's end as a unit the annex prints no rows for (20.11.2026). Not a
 * schedule's number: a schedule is not renumbered into a §'s place.
 */
export type UnitNumber = (designation: string | null) => string | null

/** A § as the Erläuterungen and the Lesefassung may address it. */
export interface Addressed {
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
 *
 * `numberIn` reads a designation's number in the run's law (`UnitNumber`):
 * in a law whose units are Artikel, the Artikel's.
 */
export function annexAddressedParagraphs(runs: readonly ParagraphRun[], numberIn: (law: string | null) => UnitNumber): Addressed[][] {
  const opened = runs.map((run) => openedParagraphs(run.rows).map((rows) => ({ own: rows[0]!.para, after: rows[0]!.paraAfter, numberOf: numberIn(run.rows[0]!.law) })))
  /** How many §§ of the law carry each number after the draft. */
  const carriers = new Map<string, number>()
  for (const { after, numberOf } of opened.flat()) {
    const id = numberOf(after)
    if (id !== null) carriers.set(id, (carriers.get(id) ?? 0) + 1)
  }
  return opened.map((paragraphs) =>
    paragraphs.map(({ own, after, numberOf }) => {
      const id = numberOf(own)
      const others = (carriers.get(id ?? '') ?? 0) - (id !== null && numberOf(after) === id ? 1 : 0)
      return { own, after, ownTaken: others > 0 }
    }),
  )
}

/** What one addressed § finds under `lookup` (see `annexAddressedParagraphs`). */
export function lookUp<T>(law: string | null, p: Addressed, numberOf: UnitNumber, lookup: (law: string | null, para: string | null) => T, found: (t: T) => boolean): T | null {
  if (p.after !== null) {
    const hit = lookup(law, p.after)
    if (found(hit)) return hit
    if (numberOf(p.after) === numberOf(p.own)) return null
  }
  return p.ownTaken ? null : lookup(law, p.own)
}

/**
 * The rows whose § the oracle confirmed: the outcome its block finds, as the
 * page finds it (`placeAtParagraphs`), is a § of the Lesefassung shown
 * without the second witness (`ConsolidatedParagraph.draftWitness`). Null
 * where the run offers no outcomes (`notRun`, or no response).
 *
 * The blocks as the page cuts them: the pair rows of one law in order, the
 * elided ones left out (`groupAnnexRows`), each run of one `para`
 * (`paragraphRuns`) and the §§ it opens (`annexAddressedParagraphs`). A block that
 * finds a confirmed outcome counts as confirmed even where the page shows
 * that outcome at another block of the same unit (one outcome, one block):
 * the oracle confirmed the unit, and both blocks print it.
 */
export function oracleConfirmedRows<R extends AnnexJoinRow>(rows: readonly R[], consolidated: ConsolidatedTextResponse | null): Set<R> | null {
  if (!consolidated || consolidated.notRun) return null
  const articleLaws = articleUnitLaws(rows)
  // One group per law as `groupAnnexRows` opens them: at an Artikel row, or where a row names another law.
  const groups: R[][] = []
  let current: { law: string | null; rows: R[] } | null = null
  for (const row of rows) {
    if (row.kind === 'article') {
      current = null
      continue
    }
    if (row.elided) continue
    if (!current || (row.law !== null && current.law !== row.law)) {
      current = { law: row.law, rows: [] }
      groups.push(current.rows)
    }
    current.rows.push(row)
  }
  const schedulesOf = new Map<string | null, Set<string>>()
  for (const group of groups) {
    for (const run of paragraphRuns(group)) {
      const { law, para } = run.rows[0]!
      const unit = annexUnitId(para)
      if (unit?.startsWith('anl.')) schedulesOf.set(law, (schedulesOf.get(law) ?? new Set()).add(unit))
    }
  }
  const outcomes = outcomeIndex(consolidated, { soleSchedule: (law) => schedulesOf.get(law)?.size === 1, articleLaws })
  if (!outcomes) return null
  const out = new Set<R>()
  for (const group of groups) {
    const runs = paragraphRuns(group)
    const addressed = annexAddressedParagraphs(runs, (law) => (designation) => numberedUnitId(designation, articleLaws.has(law ?? '')))
    for (const [i, run] of runs.entries()) {
      const first = run.rows[0]!
      const numberOf: UnitNumber = (designation) => numberedUnitId(designation, articleLaws.has(first.law ?? ''))
      for (const p of addressed[i] ?? []) {
        const hit = lookUp(first.law, p, numberOf, (law, para) => outcomes.at(law, para), (o) => o !== null)
        if (hit?.lesefassung.kind !== 'shown' || hit.lesefassung.paragraph.draftWitness) continue
        for (const row of run.rows) if (row.paraAfter === p.after) out.add(row)
      }
    }
  }
  return out
}
