/**
 * Scoring every new law against rules that were frozen before it existed
 * (23.11.2026, `scripts/harness/newLaws.ts`).
 *
 * WHY. Every figure on `/genauigkeit` comes from laws the rules were developed
 * on. A score on laws published after the rules were frozen is the only figure
 * that says how the monitor does on a law nobody has tuned it to.
 *
 * WHAT IT CANNOT PROMISE, AND WHAT IT DOES INSTEAD. Nothing proves that every
 * way a law can go wrong has been thought of. Three things can be held:
 *
 * 1. Every law was seen: BGBl I numbers run without a gap within a year, so a
 *    missed law is a missing number (`gapsIn`; 1–121/2025 and 1–103/2026 read
 *    on 23.11.2026).
 * 2. Every law ends in exactly one outcome, and the outcomes add up to the
 *    list (`accountOf`). A law RIS has not consolidated yet waits, and is said
 *    to wait; after `CONSOLIDATION_GRACE_DAYS` it is a finding.
 * 3. A law that does something no law of the development set did is named
 *    (`kindsOfLaw`, `findingsOf`), so a person reads it instead of its passing
 *    quietly.
 *
 * Pure, so all of it is held by `tests/newLaws.test.ts`.
 */
import { misnumberedShown } from '../harness/konsJudge'
import type { DraftPathRecord } from './konsDraftPath'

export interface BgblNumber {
  year: number
  number: number
}

/** One entry of the Bundesgesetzblatt, Teil I. */
export interface BgblListing extends BgblNumber {
  id: string
  /** „BGBl. I Nr. 88/2026" */
  nummer: string
  /** ISO date of issue. */
  date: string
  /** `Bundesgesetz`, `Kundmachung`, `Sonstiges`; null where RIS carries none. */
  typ: string | null
  title: string
}

/**
 * Which laws count as what, and against which rules.
 *
 * `holdoutFrom` is the first number published after the rules were frozen.
 * Laws from `trialFrom` up to it were out of the bench but open to whoever
 * worked on the rules: they are reported, and never as clean. A law used to
 * fix a rule moves to `leftHoldout` and stops counting.
 */
export interface NewLawScope {
  rules: {
    /** The git tag holding the frozen code. */
    tag: string | null
    /** Tree hashes of `server` and `shared` at that tag: other code is no frozen run. */
    tree: string | null
  }
  trialFrom: BgblNumber
  holdoutFrom: BgblNumber
  leftHoldout: string[]
  /** Every kind of change a law of the development set makes. */
  knownKinds: string[]
  /**
   * Findings a person has read and found no fault in, each with why. A
   * finding is matched by the start of `kind: detail`. Read, it is still
   * printed, and no longer turns the run red, week after week.
   */
  read: { finding: string; why: string }[]
}

export type Pool = 'trial' | 'holdout' | 'used'

/** One law as `kons.ts --json` reports it. */
export interface KonsLaw {
  bgbl: string
  article: string | null
  law: string
  instructions: number
  read: number
  applied: number
  checked: number
  identical: number
  divergent: number
  note: string | null
  kinds: string[]
}

/** The part of a `kons.ts --json` record this module reads. */
export interface NewLawKonsRecord {
  unreached: { id: string; cause: string }[]
  laws: KonsLaw[]
  draftPath?: DraftPathRecord
  removalFindings: string[]
  /** `plausibel|orakel|ergebnis|verweigerung|weg` */
  gate: Record<string, number>
  /** `Ausgang|Ergebnis` */
  witness: Record<string, number>
  /** One line per § the second witness released: „BGBl. … Gesetz § 5 — RIS: identisch, …". */
  witnessShown?: string[]
  /** `gliederung|orakel|plausibel|zeuge` */
  markers: Record<string, number>
}

export type LawOutcome = 'scored' | 'noAmendment' | 'pending' | 'failed'
export type BgblOutcome = LawOutcome | 'notLaw'

export interface BgblAccount {
  id: string
  nummer: string
  date: string
  outcome: BgblOutcome
  /** The laws this Bundesgesetzblatt carries, a Sammelnovelle several. */
  laws: number
  /** Why, where it is not scored. */
  reason: string | null
}

export type FindingKind = 'gap' | 'unreached' | 'unscored' | 'wrongRepeal' | 'shownNotIdentical' | 'misnumbered' | 'draftDiffers' | 'newKind'

export interface Finding {
  kind: FindingKind
  detail: string
}

/**
 * How long RIS may take to consolidate a law before its absence is a finding.
 * On 23.11.2026 every law up to the 29.10. issue was consolidated, so 60 days
 * is the generous side of what was read.
 */
export const CONSOLIDATION_GRACE_DAYS = 60

export function bgblNumberOf(nummer: string): BgblNumber | null {
  const m = /Nr\.\s*(\d+)\/(\d{4})/.exec(nummer)
  return m ? { number: Number(m[1]), year: Number(m[2]) } : null
}

/** Whether `a` was published at or after `b`, by its number. */
export function atOrAfter(a: BgblNumber, b: BgblNumber): boolean {
  return a.year > b.year || (a.year === b.year && a.number >= b.number)
}

/** Every number missing from `from` up to the highest of each year. The tail of a list cannot show here: the caller checks RIS's hit count. */
export function gapsIn(listings: readonly BgblNumber[], from: BgblNumber): string[] {
  const byYear = new Map<number, Set<number>>()
  for (const l of listings) {
    const numbers = byYear.get(l.year) ?? new Set<number>()
    numbers.add(l.number)
    byYear.set(l.year, numbers)
  }
  const out: string[] = []
  for (const [year, numbers] of [...byYear].sort(([a], [b]) => a - b)) {
    if (year < from.year) continue
    const highest = Math.max(...numbers)
    for (let n = year === from.year ? from.number : 1; n <= highest; n++) {
      if (!numbers.has(n)) out.push(`BGBl. I Nr. ${n}/${year}`)
    }
  }
  return out
}

export function poolOf(listing: BgblListing, scope: Pick<NewLawScope, 'holdoutFrom' | 'leftHoldout'>): Pool {
  if (scope.leftHoldout.includes(listing.nummer)) return 'used'
  return atOrAfter(listing, scope.holdoutFrom) ? 'holdout' : 'trial'
}

/** What became of one law, from the note the bench left on it. */
export function lawOutcomeOf(note: string | null, ageDays: number): LawOutcome {
  if (note === null) return 'scored'
  if (/keine Promulgationsklausel|keine Novellierungsanordnungen/.test(note)) return 'noAmendment'
  if (/in keiner Fassung|nicht im BrKons/.test(note)) return ageDays <= CONSOLIDATION_GRACE_DAYS ? 'pending' : 'failed'
  return 'failed'
}

const SEVERITY: readonly LawOutcome[] = ['failed', 'pending', 'scored', 'noAmendment']

const daysBetween = (from: string, to: string): number => Math.floor((Date.parse(to) - Date.parse(from)) / 86_400_000)

/**
 * One outcome per Bundesgesetzblatt, so that the outcomes add up to the list.
 * A Sammelnovelle takes its worst law's: one law that failed is not hidden
 * behind the nine that were scored.
 */
export function accountOf(listings: readonly BgblListing[], record: Pick<NewLawKonsRecord, 'laws' | 'unreached'>, today: string): BgblAccount[] {
  return listings.map((l) => {
    const base = { id: l.id, nummer: l.nummer, date: l.date }
    if (l.typ !== 'Bundesgesetz') return { ...base, outcome: 'notLaw' as const, laws: 0, reason: l.typ ?? 'ohne Typ' }
    const missed = record.unreached.find((u) => u.id === l.id)
    if (missed) return { ...base, outcome: 'failed' as const, laws: 0, reason: missed.cause }
    const laws = record.laws.filter((x) => x.bgbl === l.nummer)
    if (laws.length === 0) return { ...base, outcome: 'failed' as const, laws: 0, reason: 'kein Ergebnis des Prüfstands' }
    const age = daysBetween(l.date, today)
    const outcomes = laws.map((x) => ({ outcome: lawOutcomeOf(x.note, age), note: x.note }))
    const worst = SEVERITY.find((s) => outcomes.some((o) => o.outcome === s))!
    return { ...base, outcome: worst, laws: laws.length, reason: worst === 'scored' ? null : outcomes.find((o) => o.outcome === worst)!.note }
  })
}

/**
 * The kinds of change a law makes: the shape of its instructions, not its
 * subject. A kind no law of the development set has is what no rule was ever
 * tested on. Counts are folded („4 Operanden" and „6 Operanden" are one cause).
 */
export function kindsOfLaw(law: {
  package: boolean
  ops: readonly { kind: string; level: string | null; schedule: boolean }[]
  refused: readonly string[]
  renumbered: boolean
  wholeText: boolean
  constitutional: boolean
}): string[] {
  const kinds = new Set<string>()
  if (law.package) kinds.add('sammelnovelle')
  if (law.renumbered) kinds.add('umnummerierung')
  if (law.wholeText) kinds.add('ganzer-text')
  if (law.constitutional) kinds.add('verfassungsbestimmung')
  for (const op of law.ops) {
    kinds.add(`anweisung:${op.kind}:${op.level ?? 'ohne'}`)
    if (op.schedule) kinds.add('anlage')
  }
  for (const cause of law.refused) kinds.add(`verweigert:${cause.replace(/\d+/g, 'N')}`)
  return [...kinds].sort()
}

/** The findings a person has not read yet, and those read, each with why (`NewLawScope.read`). */
export function splitRead(findings: readonly Finding[], read: NewLawScope['read']): { open: Finding[]; read: (Finding & { why: string })[] } {
  const out = { open: [] as Finding[], read: [] as (Finding & { why: string })[] }
  for (const f of findings) {
    const known = read.find((r) => `${f.kind}: ${f.detail}`.startsWith(r.finding))
    if (known) out.read.push({ ...f, why: known.why })
    else out.open.push(f)
  }
  return out
}

/** What a person has to read. Each is a reason for the run to go red, until read (`splitRead`). */
export function findingsOf(record: NewLawKonsRecord, knownKinds: ReadonlySet<string>, accounts: readonly BgblAccount[]): Finding[] {
  const out: Finding[] = []
  for (const a of accounts) {
    if (a.outcome !== 'failed') continue
    out.push({ kind: a.laws === 0 ? 'unreached' : 'unscored', detail: `${a.nummer}: ${a.reason ?? 'ohne Grund'}` })
  }
  for (const line of record.removalFindings) {
    if (line.startsWith('falsch: ')) out.push({ kind: 'wrongRepeal', detail: line.slice('falsch: '.length) })
  }
  for (const [key, n] of Object.entries(record.gate)) {
    const [plausible, oracle, result] = key.split('|')
    if (plausible === 'plausibel' && oracle === 'bestätigt' && result !== 'identisch') out.push({ kind: 'shownNotIdentical', detail: `${n}× von der Textgegenüberstellung bestätigt, laut RIS ${result}` })
  }
  // By name where the record carries the lines, so that one can be read and marked as such.
  if (record.witnessShown) {
    for (const line of record.witnessShown) {
      const m = /^(.+?) — RIS: ([^,—]+)/.exec(line)
      if (m && m[2]!.trim() !== 'identisch') out.push({ kind: 'shownNotIdentical', detail: `${m[1]}: vom zweiten Zeugen freigegeben, laut RIS ${m[2]!.trim()}` })
    }
  } else {
    for (const [key, n] of Object.entries(record.witness)) {
      const [outcome, result] = key.split('|')
      if (outcome === 'gezeigt' && result !== 'identisch') out.push({ kind: 'shownNotIdentical', detail: `${n}× vom zweiten Zeugen freigegeben, laut RIS ${result}` })
    }
  }
  const misnumbered = misnumberedShown(record.markers)
  if (misnumbered > 0) out.push({ kind: 'misnumbered', detail: `${misnumbered} gezeigte(r) Paragraph(en) unter anderen Bezeichnungen als im Gesetz` })
  for (const d of record.draftPath?.differs ?? []) out.push({ kind: 'draftDiffers', detail: `${d.me} ${d.law} § ${d.id}` })
  const seen = new Set<string>()
  for (const law of record.laws) {
    for (const kind of law.kinds) {
      if (knownKinds.has(kind) || seen.has(kind)) continue
      seen.add(kind)
      out.push({ kind: 'newKind', detail: `${kind} (zuerst in ${law.bgbl}${law.article ? ` ${law.article}` : ''}, ${law.law})` })
    }
  }
  return out
}
