/**
 * The figures of one measurement round, added up for `/genauigkeit`, and the
 * gates a round has to pass before they may stand there (20.11.2026).
 *
 * Pure: it is handed a reader for the round's records and returns the
 * record, or throws with every reason it refuses, one sentence each, naming
 * the record and the cause. `scripts/harness/genauigkeit.ts` is the command
 * around it; `tests/genauigkeitRound.test.ts` holds the gates.
 *
 * WHY GATES. Until 20.11.2026 the builder stopped on a missing file, a fault
 * record of the wrong path, an accounting that did not balance, station
 * breaches, Länder hits and two days — and on nothing the harnesses
 * themselves had failed: accounting.ts's invariant failures, a fault floor
 * that failed or was never run, a floored class tried fewer than 20 times,
 * records of different commits, a corpus reached in part. Each of those
 * went onto the page as a figure.
 */
import type { ConsolidatedWithheldCause, GenauigkeitFault, GenauigkeitRecord } from '../../shared/types'
import { DIRTY, FLOOR_MIN_TRIES, UNKNOWN_COMMIT } from './harnessRecord'

/** The floor the fault records have to have been held to (`faultInjection.ts --mindestens`). */
export const FLOOR_PERCENT = 95

export interface RoundOptions {
  /** `--erlaube-ungehalten=<Klasse,…>`: floored classes that may stand with fewer than 20 tries, written into the record. */
  allowUnheld?: readonly string[]
  /** `--erlaube-gemischt`: records of different commits or of a dirty tree, named in the record. */
  allowMixed?: boolean
  /** `--commit=<hash>`: the commit to name where the records do not agree on one (with `allowMixed` only). */
  commit?: string | null
  /** The commit checked out now: named where the records do not agree and no `commit` is given. */
  head: () => string
}

/** A record of the round as the reader hands it over; `undefined` where the file is missing. */
export type RoundReader = (name: string) => unknown

/** Thrown with every reason the round may not go on the page. */
export class RoundRefused extends Error {
  constructor(readonly reasons: string[]) {
    super(`the round may not go on the page:\n${reasons.map((r) => `  - ${r}`).join('\n')}`)
  }
}

interface Stamped {
  at?: string
  commit?: string
  requested?: number
  reached?: number
  unreached?: { id: string; cause: string }[]
}

interface KonsRecord extends Stamped {
  corpus: { bgbl: number; laws: number }
  checked: number
  unrefused: { checked: number; identical: number; divergent: number }
  gate: Record<string, number>
  /** The designations of the §§ whose text is the law's: `gleich|abweichend` `|Orakel|plausibel` (`markerSequence`, 20.11.2026). */
  markers?: Record<string, number>
  /** The second witness over the plausible §§ the oracle contradicts: `Ausgang|Ergebnis`. */
  witness?: Record<string, number>
}

/** `floor` on a floored class: „gehalten", „verfehlt", „nicht gehalten" (tried too seldom), or „nicht anwendbar" where the class cannot occur on the path. */
interface FaultClass extends GenauigkeitFault { floored?: boolean; floor?: string }
/** An annex fault class: `alreadyWithheld` of its `caught` sat at a § the gate withheld without the fault too. */
interface AnnexFaultClass extends GenauigkeitFault { alreadyWithheld?: number }
interface FaultRecord extends Stamped {
  path: 'pdf' | 'table'
  drafts: number
  annex: AnnexFaultClass[]
  result: FaultClass[]
  /** The floor's outcome (`--mindestens`); absent in a record written before 20.11.2026 or without the flag. */
  floor?: { min: number; passed: boolean; failed: string[]; unheld: string[] } | null
  /**
   * The same faults judged through the whole chain the page runs (21.11.2026):
   * withheld, marked with either pill, or shown without a mark, over the §§
   * the page showed without a mark before the fault. `floor` on a class held
   * to the floor: „gehalten", „verfehlt", or „nicht gehalten" where it was
   * tried too seldom.
   */
  chain?: { key: string; tried: number; withheld: number; marked: number; unmarked: number; floored?: boolean; floor?: string }[]
}

interface AccountingRecord extends Stamped {
  reports: { citation: string; touched: number; shown: number; witnessed?: number; causes: Record<string, number>; failures?: string[] }[]
}

interface AnnexRecord extends Stamped {
  drafts: {
    note: string | null
    verifiedParas: number
    withheldParas: number
    withheldStanding: number
    uncheckedParas: number
    /** The mark's own counts (21.11.2026): §§ shown, „nicht bestätigt", „nicht geprüft" by the gate and by the draft check. */
    shownParas?: number
    unconfirmedParas?: number
    markedParas?: number
    markedWordParas?: number
  }[]
}

interface StationRecord extends Stamped {
  drafts: number
  pairs: number
  breaches: unknown[]
  residues: { residue: { editorial: boolean; pieces?: string[] } }[]
  nullUnits?: Record<string, number>
  /** `station.ts --mutationen`: per class how often one changed token was tried, and how the page shows it (`änderung` is the catch). */
  mutations?: { units: number; classes: Record<string, { tried: number; änderung: number }> }
}

type LandGuardRecord = Stamped & { lands: string[]; documents: number; compared: number; shown: number; judged: number; found: number; faults: GenauigkeitFault[]; strict: { held: number; differs: number; unchecked: number; onlyStruck: number } }
type LandStationsRecord = Stamped & GenauigkeitRecord['laender']['stations'] & { stale: number }

/** The records a round reads, and the ones that read a corpus and must say how much of it they reached. */
const CORPUS_RECORDS = ['kons.json', 'fi-pdf.json', 'fi-xml.json', 'station.json', 'acc.json', 'acc-ris.json'] as const

/** A residue whose struck side is a BGBl number the draft left open: „xxx/2026“, „yyy/202Y“, „XXX“, „…/2026“. */
const OPEN_BGBL_RE = /⟦-[^⟧]*(?:(?<!\p{L})[xXyY]{2,}|(?:…|_{2,})\s*\/)/u

const vienna = (at: string): string => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna' }).format(new Date(at))

/** Adds the round up, or throws `RoundRefused` with every reason it may not go on the page. */
export function buildGenauigkeitRecord(readRecord: RoundReader, options: RoundOptions): GenauigkeitRecord {
  const refusals: string[] = []
  const stamps = new Map<string, Stamped>()
  const missing: string[] = []
  function read<T>(name: string): T {
    const value = readRecord(name) as (T & Stamped) | undefined
    if (value === undefined) {
      missing.push(name)
      return {} as T
    }
    stamps.set(name, value)
    return value
  }

  /* --- The Lesefassung -------------------------------------------------- */

  const kons = read<KonsRecord>('kons.json')
  const faults = { pdf: read<FaultRecord>('fi-pdf.json'), table: read<FaultRecord>('fi-xml.json') }
  const acc = read<AccountingRecord>('acc.json')
  const accRis = read<AccountingRecord>('acc-ris.json')
  const annexPdf = read<AnnexRecord>('annex-pdf.json')
  const annexXml = read<AnnexRecord>('annex-xml.json')
  const station = read<StationRecord>('station.json')
  const landGuard = read<LandGuardRecord>('land-guard/summary.json')
  const landStations = read<LandStationsRecord>('land-st/summary.json')
  if (missing.length) throw new RoundRefused(missing.map((name) => `${name} is missing: a page with half its figures from another round says nothing about either`))

  /* --- One round: one day, one clean commit, the whole corpus ------------- */

  for (const [name, r] of stamps) if (!r.at) refusals.push(`${name} carries no "at": it cannot be placed in the round`)
  const dated = [...stamps.values()].map((r) => r.at).filter((at): at is string => Boolean(at)).sort()
  const date = dated.length ? vienna(dated.at(-1)!) : ''
  if (dated.length && vienna(dated[0]!) !== date) refusals.push(`the records span ${vienna(dated[0]!)} to ${date}: one round, one day`)

  const commits = new Map([...stamps].map(([name, r]) => [name, r.commit ?? UNKNOWN_COMMIT]))
  const distinct = new Set(commits.values())
  const clean = distinct.size === 1 && ![...distinct][0]!.endsWith(DIRTY) && !distinct.has(UNKNOWN_COMMIT)
  let commit = clean ? [...distinct][0]! : null
  if (!clean && !options.allowMixed) {
    const named = [...commits].map(([name, c]) => `${name} ${c === UNKNOWN_COMMIT ? '(no commit)' : c}`).join(', ')
    refusals.push(`the records are not of one clean commit (${named}): pass --erlaube-gemischt to write them anyway, named in the record`)
  }
  if (clean && options.commit && options.commit !== commit) refusals.push(`--commit=${options.commit} contradicts the commit all records name, ${commit}`)
  if (!clean) commit = options.commit ?? options.head()

  for (const name of stamps.keys()) {
    const r = stamps.get(name)!
    const owned = (CORPUS_RECORDS as readonly string[]).includes(name)
    if (r.requested === undefined || r.reached === undefined) {
      if (owned) refusals.push(`${name} does not say how much of its corpus it reached (no "requested"/"reached"): it was written before 20.11.2026`)
      continue
    }
    if (r.requested === 0) refusals.push(`${name} was asked for no corpus at all`)
    else if (r.reached < r.requested) {
      const which = (r.unreached ?? []).slice(0, 3).map((u) => `${u.id} (${u.cause})`).join('; ')
      refusals.push(`${name} reached ${r.reached} of the ${r.requested} it was asked for${which ? `: ${which}` : ''}`)
    }
  }

  /* --- The Lesefassung -------------------------------------------------- */

  /** The gate's tally summed over the keys a predicate takes: `plausibel|Orakel|Ergebnis|Verweigerung|Weg`. */
  const gate = (pred: (p: string[]) => boolean): number =>
    Object.entries(kons.gate).filter(([k]) => pred(k.split('|'))).reduce((n, [, v]) => n + v, 0)
  const shown = (p: string[]) => p[0] === 'plausibel' && p[1] === 'bestätigt'
  const tallied = (tally: Record<string, number>, pred: (p: string[]) => boolean): number =>
    Object.entries(tally).filter(([k]) => pred(k.split('|'))).reduce((n, [, v]) => n + v, 0)

  // „identisch" compares the text without its designations: a confirmed §
  // under the wrong „(2)" would count as the law and be shown (19.11.2026).
  if (!kons.markers) refusals.push('kons.json was written before the designations were counted (no "markers")')
  else {
    const misnumbered = tallied(kons.markers, (p) => p[0] === 'abweichend' && p[1] === 'bestätigt')
    const which = misnumbered === 1 ? '1 § the oracle confirmed deviates from the enacted text in its' : `${misnumbered} §§ the oracle confirmed deviate from the enacted text in their`
    if (misnumbered) refusals.push(`kons.json: ${which} designations („(2)", „3.", „b)"): the page would show the law under the wrong numbers`)
  }

  for (const [path, record] of Object.entries(faults)) {
    const name = `fi-${path === 'table' ? 'xml' : 'pdf'}.json`
    if (record.path !== path) refusals.push(`${name} was written on the ${record.path} path`)
    if (!record.floor) refusals.push(`${name} carries no floor result: run faultInjection.ts with --mindestens=${FLOOR_PERCENT}`)
    else {
      if (record.floor.min < FLOOR_PERCENT) refusals.push(`${name} was held to ${record.floor.min} %, below the ${FLOOR_PERCENT} % the page reads it against`)
      if (!record.floor.passed) refusals.push(`${name}: the floor of ${record.floor.min} % failed${record.floor.failed.length ? ` (${record.floor.failed.join(', ')})` : ''}`)
    }
  }
  // The chain (21.11.2026): what the page does with a fault, not what one check does. A class the harness held to the floor
  // and that fell is a failed round, as a failed floor of the oracle's classes is.
  for (const [path, record] of Object.entries(faults)) {
    const name = `fi-${path === 'table' ? 'xml' : 'pdf'}.json`
    if (record.path !== undefined && !record.chain) refusals.push(`${name} was written before faults were judged through the whole chain (no "chain"): run faultInjection.ts on the code of the round`)
    for (const c of record.chain ?? []) {
      if (c.floored && c.floor === 'verfehlt') refusals.push(`${name}: the chain's class „${c.key}" was held to the floor and fell (${c.withheld + c.marked} of ${c.tried} caught)`)
    }
  }
  /**
   * Floored classes tried too seldom for their share to say anything, per
   * path: the oracle's and the chain's. Not a class the harness says cannot
   * occur on the path („nicht anwendbar", 21.11.2026: Lücke on the table
   * path, where a cell holds one unit and opens no §) — nothing was left
   * unmeasured there, and asking for `--erlaube-ungehalten` would name a
   * gap in the record that is none.
   */
  const unheld = Object.entries(faults).flatMap(([path, record]) => [
    ...(record.result ?? []).filter((f) => f.floored && f.floor !== 'nicht anwendbar' && f.tried < FLOOR_MIN_TRIES),
    ...(record.chain ?? []).filter((c) => c.floored && c.tried < FLOOR_MIN_TRIES),
  ].map((f) => ({ path, key: f.key, tried: f.tried })))
  const allowed = new Set(options.allowUnheld ?? [])
  for (const u of unheld) {
    if (!allowed.has(u.key)) refusals.push(`fi-${u.path === 'table' ? 'xml' : 'pdf'}.json: the floored class „${u.key}" was tried ${u.tried} times, fewer than ${FLOOR_MIN_TRIES}, so the floor did not hold it: pass --erlaube-ungehalten=${u.key} to write it anyway, named in the record`)
  }
  for (const key of allowed) {
    if (!unheld.some((u) => u.key === key)) refusals.push(`--erlaube-ungehalten names „${key}", which is no floored class tried fewer than ${FLOOR_MIN_TRIES} times`)
  }
  const classes = (list: GenauigkeitFault[]): GenauigkeitFault[] => list.map(({ key, tried, caught }) => ({ key, tried, caught }))
  /**
   * The annex faults without the sites the gate had withheld before the fault
   * (20.11.2026). Such a § stays withheld whatever is injected, so it counted
   * as a catch of every class: on the PDF path all 29 „caught" of a sentence
   * standing equal in both columns were of that kind but five.
   */
  const annexClasses = (list: AnnexFaultClass[]): GenauigkeitFault[] =>
    list.map(({ key, tried, caught, alreadyWithheld = 0 }) => ({ key, tried: tried - alreadyWithheld, caught: caught - alreadyWithheld }))

  function funnel(name: string, record: AccountingRecord) {
    const failures = record.reports.flatMap((r) => (r.failures ?? []).map((f) => `${r.citation}: ${f}`))
    if (failures.length) refusals.push(`${name} records ${failures.length} invariant failure${failures.length === 1 ? '' : 's'} (${failures.slice(0, 3).join('; ')}${failures.length > 3 ? '; …' : ''})`)
    const causes: Partial<Record<ConsolidatedWithheldCause, number>> = {}
    for (const r of record.reports) {
      for (const [cause, n] of Object.entries(r.causes)) causes[cause as ConsolidatedWithheldCause] = (causes[cause as ConsolidatedWithheldCause] ?? 0) + n
    }
    const changed = record.reports.reduce((n, r) => n + r.touched, 0)
    const shownCount = record.reports.reduce((n, r) => n + r.shown, 0)
    const withheld = Object.values(causes).reduce((n, v) => n + (v ?? 0), 0)
    if (shownCount + withheld !== changed) refusals.push(`${name} does not balance: ${shownCount} shown + ${withheld} withheld ≠ ${changed} changed`)
    /* By name, so two rounds' files differ only where a count moved. */
    const sorted = Object.fromEntries(Object.entries(causes).sort(([a], [b]) => a.localeCompare(b))) as typeof causes
    const witnessed = record.reports.reduce((n, r) => n + (r.witnessed ?? 0), 0)
    // Nothing to compose: a § the draft repeals has no new text, a § of a law enacted anew no old one.
    const outsideOf = (r: AccountingRecord['reports'][number]): number => (r.causes.entfaellt ?? 0) + (r.causes['neu-erlassen'] ?? 0)
    const outside = record.reports.reduce((n, r) => n + outsideOf(r), 0)
    const composing = record.reports.filter((r) => r.touched - outsideOf(r) > 0).length
    return { drafts: record.reports.length, changed, shown: shownCount, causes: sorted, witnessed, outside, composing }
  }
  const accounted = funnel('acc.json', acc)
  const risOnly = funnel('acc-ris.json', accRis)

  /* --- The annex -------------------------------------------------------- */

  const gated = [...annexPdf.drafts, ...annexXml.drafts].filter((d) => d.note === null)
  const annexSum = (pick: (d: AnnexRecord['drafts'][number]) => number): number => gated.reduce((n, d) => n + pick(d), 0)
  // The mark (21.11.2026): what a reader sees of a § is the mark's word, not the gate's. A record without it describes a
  // page that no longer exists; one whose shown §§ are not the gate's verified and unchecked ones counts something else.
  for (const [name, record] of [['annex-pdf.json', annexPdf], ['annex-xml.json', annexXml]] as const) {
    const own = record.drafts.filter((d) => d.note === null)
    if (own.some((d) => d.shownParas === undefined || d.unconfirmedParas === undefined || d.markedParas === undefined || d.markedWordParas === undefined)) {
      refusals.push(`${name} was written before the mark was counted (no "shownParas"): run annexPdf.ts on the code of the round`)
      continue
    }
    const shown = own.reduce((n, d) => n + d.shownParas!, 0)
    const gateShown = own.reduce((n, d) => n + d.verifiedParas + d.uncheckedParas, 0)
    if (shown !== gateShown) refusals.push(`${name} does not balance: ${shown} §§ shown ≠ ${gateShown} the gate verified or left unchecked`)
    const marked = own.reduce((n, d) => n + d.unconfirmedParas! + d.markedParas! + d.markedWordParas!, 0)
    if (marked > shown) refusals.push(`${name} does not balance: ${marked} §§ marked of ${shown} shown`)
  }
  const marks = {
    shown: annexSum((d) => d.shownParas ?? 0),
    unconfirmed: annexSum((d) => d.unconfirmedParas ?? 0),
    unchecked: annexSum((d) => (d.markedParas ?? 0) + (d.markedWordParas ?? 0)),
  }
  const chainOf = (record: FaultRecord) => (record.chain ?? []).map((c) => ({ key: c.key, tried: c.tried, caught: c.withheld + c.marked, withheld: c.withheld, ...(c.floored && c.floor === 'gehalten' ? { held: true } : {}) }))

  /* --- The Bund's stations and the Länder ------------------------------- */

  if (!station.nullUnits) refusals.push('station.json was written before the null comparisons counted their units')
  if (station.breaches.length) refusals.push(`station.json records ${station.breaches.length} invariant breaches`)
  if (!station.mutations) refusals.push('station.json was not held to faults: run station.ts with --mutationen')
  if (landStations.hits) refusals.push(`land-st/summary.json records ${landStations.hits} invariant hits not accounted for`)
  if (landStations.stale) refusals.push(`land-st/summary.json holds ${landStations.stale} stale accepted hits`)

  if (refusals.length) throw new RoundRefused(refusals)

  const record: GenauigkeitRecord = {
    date,
    commit: commit!,
    gp: 'XXVIII',
    lesefassung: {
      bench: {
        bgbl: kons.corpus.bgbl,
        laws: kons.corpus.laws,
        checked: kons.checked,
        shown: gate(shown),
        identical: gate((p) => shown(p) && p[2] === 'identisch'),
        invented: gate((p) => shown(p) && p[2] === 'abweichend'),
        incomplete: gate((p) => shown(p) && p[2] === 'unvollständig'),
        otherwise: gate((p) => shown(p) && !['identisch', 'abweichend', 'unvollständig'].includes(p[2]!)),
        // „Ohne die Prüfung" is the page's gate without the oracle: refusal and
        // plausibility still decide (`konsGate.ts`). Until 20.11.2026 this read
        // `unrefused` — every § without a refused instruction, the implausible
        // ones included, which no state of the page would have shown.
        ungated: { shown: gate((p) => p[0] === 'plausibel'), identical: gate((p) => p[0] === 'plausibel' && p[2] === 'identisch') },
        ...(kons.witness ? { witnessed: { shown: tallied(kons.witness, (p) => p[0] === 'gezeigt'), identical: tallied(kons.witness, (p) => p[0] === 'gezeigt' && p[1] === 'identisch') } } : {}),
      },
      faults: { pdf: classes(faults.pdf.result), table: classes(faults.table.result) },
      funnel: { drafts: accounted.drafts, changed: accounted.changed, shown: accounted.shown, causes: accounted.causes, witnessed: accounted.witnessed },
      risOnly: { drafts: risOnly.drafts, changed: risOnly.changed, shown: risOnly.shown, outside: risOnly.outside, composing: risOnly.composing },
    },
    annex: {
      drafts: gated.length,
      confirmed: annexSum((d) => d.verifiedParas),
      withheld: annexSum((d) => d.withheldParas),
      withheldStanding: annexSum((d) => d.withheldStanding),
      unchecked: annexSum((d) => d.uncheckedParas),
      faults: { pdf: annexClasses(faults.pdf.annex), table: annexClasses(faults.table.annex) },
      marks: { ...marks, clean: marks.shown - marks.unconfirmed - marks.unchecked },
      chain: { pdf: chainOf(faults.pdf), table: chainOf(faults.table) },
    },
    stations: {
      drafts: station.drafts,
      pairs: station.pairs,
      breaches: station.breaches.length,
      nullUnits: Object.values(station.nullUnits!).reduce((n, v) => n + v, 0),
      nullResidues: station.residues.length,
      nullSubstantive: station.residues.filter((r) => !r.residue.editorial).length,
      nullPlaceholders: station.residues.filter((r) => r.residue.editorial && OPEN_BGBL_RE.test((r.residue.pieces ?? []).join(' '))).length,
      faults: Object.entries(station.mutations!.classes).map(([key, c]) => ({ key, tried: c.tried, caught: c.änderung })),
    },
    laender: {
      tgu: { lands: landGuard.lands, documents: landGuard.documents, compared: landGuard.compared, shown: landGuard.shown, strict: { held: landGuard.strict.held, differs: landGuard.strict.differs, unchecked: landGuard.strict.unchecked, onlyStruck: landGuard.strict.onlyStruck }, judged: landGuard.judged, found: landGuard.found, faults: landGuard.faults },
      stations: {
        pairs: landStations.pairs,
        compared: landStations.compared,
        hits: landStations.hits,
        accepted: landStations.accepted,
        withheld: landStations.withheld,
        withheldPairs: landStations.withheldPairs,
        unread: landStations.unread,
        unreadPairs: landStations.unreadPairs,
      },
    },
  }
  if (unheld.length) record.unheld = unheld
  if (!clean) record.mixed = Object.fromEntries(commits)
  return record
}
