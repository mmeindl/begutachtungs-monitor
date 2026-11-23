/* eslint-disable @typescript-eslint/no-explicit-any -- the records are loose JSON, broken on purpose one field at a time */
import { describe, expect, it } from 'vitest'
import { RoundRefused, buildGenauigkeitRecord, type RoundOptions } from '../scripts/lib/genauigkeitRound'

/**
 * A measurement round reaches `/genauigkeit` only when it passed its own
 * gates (20.11.2026). Each test breaks one record of an otherwise sound
 * round and expects the builder to refuse with a sentence naming that record
 * and the cause — the cases the builder let through until then.
 */

const AT = '2026-11-20T12:00:00.000Z'
const COMMIT = 'a147acce'
const stamp = { at: AT, commit: COMMIT }
const reach = (n: number) => ({ requested: n, reached: n, unreached: [] })
const period = { gp: 'XXVIII', from: '2024-10-24', to: null, listed: 120, complete: true }

function faultRecord(path: 'pdf' | 'table') {
  return {
    ...stamp, ...reach(120), path, period, drafts: 100,
    annex: [{ key: 'L', tried: 50, caught: 30 }],
    result: [
      { key: 'E', tried: 100, caught: 100, floored: true },
      { key: 'Lücke', tried: 40, caught: 40, floored: true },
      { key: 'Lücke-beide', tried: 10, caught: 3, floored: false },
    ],
    floor: { min: 95, passed: true, failed: [], unheld: [] },
    chain: [
      { key: 'zahl', tried: 100, withheld: 0, marked: 99, unmarked: 1, floored: true, floor: 'gehalten' },
      { key: 'rweg', tried: 50, withheld: 1, marked: 39, unmarked: 10, floored: false },
    ],
  }
}

/** A sound round: every record there, one day, one clean commit, the whole corpus. */
function round(): Record<string, any> {
  return {
    'kons.json': {
      ...stamp, ...reach(60), corpus: { bgbl: 60, laws: 207 }, checked: 1794,
      unrefused: { checked: 1486, identical: 1451, divergent: 6 },
      gate: { 'plausibel|bestätigt|identisch|ohne Verweigerung|XML': 459, 'plausibel|bestätigt|unvollständig|ohne Verweigerung|PDF': 1 },
      markers: { 'gleich|bestätigt|plausibel': 459, 'abweichend|widersprochen|plausibel': 2, 'abweichend|kein Orakel|unplausibel': 5 },
      witness: { 'gezeigt|identisch': 152, 'gezeigt|unvollständig': 1, 'pruefung|identisch': 95, 'kein PDF|identisch': 4 },
      draftPath: { drafts: 3, failed: 0, shown: 20, comparable: 10, identical: 10, differs: [], instructionChanged: 8, stockMoved: 1, noInstructionLine: 0, notAmended: 1 },
    },
    'fi-pdf.json': faultRecord('pdf'),
    'fi-xml.json': faultRecord('table'),
    'acc.json': { ...stamp, ...reach(2), reports: [{ citation: '1/ME', touched: 3, shown: 2, causes: { verweigert: 1 }, failures: [] }, { citation: '2/ME', touched: 1, shown: 1, causes: {}, failures: [] }] },
    'acc-ris.json': { ...stamp, ...reach(1), reports: [{ citation: '4D9E1224', touched: 1, shown: 0, causes: { 'kein-anhang': 1 }, failures: [] }] },
    'annex-pdf.json': { ...stamp, period, drafts: [{ note: null, verifiedParas: 5, withheldParas: 1, withheldStanding: 0, uncheckedParas: 0, shownParas: 5, unconfirmedParas: 1, markedParas: 0, markedWordParas: 1 }] },
    'annex-xml.json': { ...stamp, period, drafts: [] },
    'station.json': {
      ...stamp, ...reach(91), drafts: 91, pairs: 453, breaches: [], residues: [], nullUnits: { 'parlament-bgbl': 10, 'html-xml': 5 },
      mutations: { units: 50, classes: { ziffer: { tried: 40, änderung: 40, redaktionell: 0, unverändert: 0, unsichtbar: 0, ungepaart: 0 }, minus: { tried: 30, änderung: 28, redaktionell: 1, unverändert: 1, unsichtbar: 0, ungepaart: 0 } } },
    },
    'land-guard/summary.json': { ...stamp, lands: ['Wien'], documents: 1, compared: 2, shown: 2, judged: 1, found: 1, faults: [], strict: { held: 2, differs: 0, unchecked: 0, onlyStruck: 1, noWordCompared: 1, markedHeld: 1 },
      leftColumn: { faults: [{ key: 'Zahl links', beforeUnmarked: { tried: 10, unmarked: 4 } }] },
      struck: { keptSentenceStruck: { beforeUnmarked: 10, caught: 1 } },
      windows: { w: { listFetchedAt: '2026-11-04T14:24:46.791Z' } },
      reach: { w: { requested: 1, answered: 1, incomplete: 0, noDetail: 0, noTgu: 0, pdfMissing: 0, failed: 0 } },
      floor: { pct: 95, minTries: 20, classes: [{ key: 'Wort', verdict: 'gehalten' }] },
      baseline: { file: 'b.json', at: AT, findings: 0 },
      accounting: { documents: 2, compared: 3, shown: 3, withheld: 2, both: 0, neither: 0, unknownShown: 0 },
      kaernten: { shownChangedOrNew: 1, withheld: 1 },
    },
    'land-st/summary.json': {
      ...stamp, pairs: 1, compared: 1, hits: 0, accepted: 0, acceptedReader: 0, withheld: 0, withheldPairs: 0, unread: 0, unreadPairs: 0, stale: 0, breaches: 0,
      lands: { w: { requested: 1, compared: 1, unavailable: 0, missing: 0, errored: 0 } },
      mutations: { misses: [] },
      nullComparison: { units: 5, residues: 1, substantive: 0, came: 0, went: 0 },
    },
  }
}

const OPTIONS: RoundOptions = { head: () => 'deadbeef' }
const build = (records: Record<string, any>, options: Partial<RoundOptions> = {}) =>
  buildGenauigkeitRecord((name) => records[name], { ...OPTIONS, ...options })

/** The reasons the builder refuses the round with, or [] where it writes it. */
function refusals(records: Record<string, any>, options: Partial<RoundOptions> = {}): string[] {
  try {
    build(records, options)
    return []
  } catch (err) {
    if (err instanceof RoundRefused) return err.reasons
    throw err
  }
}

describe('a sound round', () => {
  it('is written, with the commit every record names rather than the one checked out', () => {
    const record = build(round())
    expect(record.commit).toBe(COMMIT)
    expect(record.date).toBe('2026-11-20')
    expect(record.lesefassung.bench.shown).toBe(460)
    expect(record.unheld).toBeUndefined()
    expect(record.mixed).toBeUndefined()
  })
})

describe('the accounting', () => {
  it('counts the residues that are a BGBl number the draft left open, and no other (23.11.2026)', () => {
    const editorial = (pieces: string[]) => ({ residue: { editorial: true, pieces } })
    const records = round()
    records['station.json'].residues = [
      editorial(['…BGBl. I Nr. ⟦-xxx/xxxx⟧ …', '… ⟦+60/2025⟧ tritt …']),
      editorial(['… ⟦-yyy/202Y,"⟧ …', '… ⟦+28/2026,"⟧ …']),
      editorial(['… Nr. ⟦-XXX⟧ …', '… ⟦+29/2026⟧ …']),
      editorial(['… Satz⟦-.⟧ …']),
      editorial(['… ⟦-Exxon⟧ …']),
    ]
    expect(build(records).stations.nullPlaceholders).toBe(3)
  })

  it('refuses a record with invariant failures, naming the record and the first failures', () => {
    const r = round()
    r['acc.json'].reports[0].failures = ['stumm: § 4 zeigt eine Änderung und sagt nichts zur Lesefassung']
    expect(refusals(r)).toEqual([expect.stringMatching(/^acc\.json records 1 invariant failure \(1\/ME: stumm: § 4/)])
  })

  it('refuses a draft /konsolidiert did not answer, though its 0 of 0 balances', () => {
    const r = round()
    r['acc-ris.json'] = { ...r['acc-ris.json'], reached: 0, unreached: [{ id: '4D9E1224', cause: 'keine Antwort von /konsolidiert' }] }
    expect(refusals(r)).toEqual(['acc-ris.json reached 0 of the 1 it was asked for: 4D9E1224 (keine Antwort von /konsolidiert)'])
  })
})

describe('the fault floor', () => {
  it('refuses a fault record that carries no floor result', () => {
    const r = round()
    delete r['fi-pdf.json'].floor
    expect(refusals(r)).toEqual(['fi-pdf.json carries no floor result: run faultInjection.ts with --mindestens=95'])
  })

  it('refuses a fault record whose floor failed, with the classes', () => {
    const r = round()
    r['fi-xml.json'].floor = { min: 95, passed: false, failed: ['E-neben'], unheld: [] }
    expect(refusals(r)).toEqual(['fi-xml.json: the floor of 95 % failed (E-neben)'])
  })

  it('refuses a floor below the one the page reads the shares against', () => {
    const r = round()
    r['fi-pdf.json'].floor.min = 50
    expect(refusals(r)).toEqual(['fi-pdf.json was held to 50 %, below the 95 % the page reads it against'])
  })

  it('refuses a floored class tried fewer than 20 times, and a class nobody floors is no concern', () => {
    const r = round()
    r['fi-pdf.json'].result[1] = { key: 'Lücke', tried: 14, caught: 14, floored: true }
    r['fi-xml.json'].result[1] = { key: 'Lücke', tried: 0, caught: 0, floored: true }
    const reasons = refusals(r)
    expect(reasons).toHaveLength(2)
    expect(reasons[0]).toBe('fi-pdf.json: the floored class „Lücke" was tried 14 times, fewer than 20, so the floor did not hold it: pass --erlaube-ungehalten=Lücke to write it anyway, named in the record')
    expect(reasons[1]).toMatch(/^fi-xml\.json: the floored class „Lücke" was tried 0 times/)
  })

  it('lets such a class stand when named, and writes it into the record', () => {
    const r = round()
    r['fi-pdf.json'].result[1] = { key: 'Lücke', tried: 14, caught: 14, floored: true }
    const record = build(r, { allowUnheld: ['Lücke'] })
    expect(record.unheld).toEqual([{ path: 'pdf', key: 'Lücke', tried: 14 }])
  })

  it('refuses an allowance that names no unheld class, so a stale flag cannot ride along', () => {
    expect(refusals(round(), { allowUnheld: ['Fehlt'] })).toEqual(['--erlaube-ungehalten names „Fehlt", which is no floored class tried fewer than 20 times'])
  })
})

describe('one round, one commit', () => {
  it('refuses records of different commits, naming each', () => {
    const r = round()
    r['station.json'].commit = 'bc83f677'
    const [reason] = refusals(r)
    expect(reason).toMatch(/^the records are not of one clean commit \(kons\.json a147acce, .*station\.json bc83f677.*\): pass --erlaube-gemischt/)
  })

  it('refuses a record of a dirty tree, and one that names no commit', () => {
    const dirty = round()
    dirty['kons.json'].commit = `${COMMIT}+dirty`
    expect(refusals(dirty)[0]).toContain('kons.json a147acce+dirty')
    const none = round()
    delete none['land-st/summary.json'].commit
    expect(refusals(none)[0]).toContain('land-st/summary.json (no commit)')
  })

  it('writes mixed records when told to, each commit named and the one given as the commit', () => {
    const r = round()
    r['station.json'].commit = 'bc83f677'
    const record = build(r, { allowMixed: true, commit: 'd511ba7d' })
    expect(record.commit).toBe('d511ba7d')
    expect(record.mixed?.['station.json']).toBe('bc83f677')
    expect(record.mixed?.['kons.json']).toBe(COMMIT)
    expect(build(r, { allowMixed: true }).commit).toBe('deadbeef')
  })

  it('refuses a --commit that contradicts the commit every record names', () => {
    expect(refusals(round(), { commit: 'deadbeef' })).toEqual(['--commit=deadbeef contradicts the commit all records name, a147acce'])
  })

  it('refuses a record without a time, and records of two days', () => {
    const r = round()
    delete r['annex-xml.json'].at
    expect(refusals(r)).toEqual(['annex-xml.json carries no "at": it cannot be placed in the round'])
    const days = round()
    days['kons.json'].at = '2026-11-19T12:00:00.000Z'
    expect(refusals(days)).toEqual(['the records span 2026-11-19 to 2026-11-20: one round, one day'])
  })
})

describe('the corpus', () => {
  it('refuses a run that reached less than it was asked for, naming what it missed', () => {
    const r = round()
    r['kons.json'] = { ...r['kons.json'], reached: 58, unreached: [{ id: 'BGBLA_2025_I_7', cause: 'offline' }] }
    expect(refusals(r)).toEqual(['kons.json reached 58 of the 60 it was asked for: BGBLA_2025_I_7 (offline)'])
  })

  it('refuses a record of its own harnesses that does not say what it reached, and one asked for nothing', () => {
    const r = round()
    delete r['station.json'].requested
    delete r['station.json'].reached
    r['fi-xml.json'] = { ...r['fi-xml.json'], requested: 0, reached: 0 }
    expect(refusals(r)).toEqual([
      'fi-xml.json was asked for no corpus at all',
      'station.json does not say how much of its corpus it reached (no "requested"/"reached"): it was written before 20.11.2026',
    ])
  })
})

describe('the gates it had before', () => {
  it('still refuses a missing record, a fault record of the wrong path, an accounting that does not balance and an invariant breach', () => {
    const gone = round()
    delete gone['station.json']
    expect(refusals(gone)).toEqual(['station.json is missing: a page with half its figures from another round says nothing about either'])
    const r = round()
    r['fi-pdf.json'].path = 'table'
    r['acc.json'].reports[0].shown = 1
    r['station.json'].breaches = [{}]
    r['land-st/summary.json'].hits = 2
    expect(refusals(r)).toEqual([
      'fi-pdf.json was written on the table path',
      'acc.json does not balance: 2 shown + 1 withheld ≠ 4 changed',
      'station.json records 1 invariant breaches',
      'land-st/summary.json records 2 invariant hits not accounted for',
    ])
  })
})

describe('the bench\'s designations and its second witness', () => {
  it('refuses a bench where a § the oracle confirmed carries other designations than the enacted text', () => {
    const r = round()
    r['kons.json'].markers['abweichend|bestätigt|unplausibel'] = 1
    expect(refusals(r)).toEqual(['kons.json: 1 § the page would show deviates from the enacted text in its designations („(2)", „3.", „b)"): the page would show the law under the wrong numbers'])
  })

  it('refuses a bench record written before the designations were counted', () => {
    const r = round()
    delete r['kons.json'].markers
    expect(refusals(r)).toEqual(['kons.json was written before the designations were counted (no "markers")'])
  })

  it('carries the §§ the second witness shows, and how many of them are the law, without a sentence reading them', () => {
    expect(build(round()).lesefassung.bench.witnessed).toEqual({ shown: 153, identical: 152 })
    const r = round()
    delete r['kons.json'].witness
    expect(build(r).lesefassung.bench.witnessed).toBeUndefined()
  })
})

describe('what the figures count', () => {
  it('reads „ohne die Prüfung" as the gate without the oracle: every plausible §, not every § without a refusal', () => {
    const records = round()
    records['kons.json'].gate = {
      'plausibel|bestätigt|identisch|ohne Verweigerung|XML': 459,
      'plausibel|bestätigt|unvollständig|ohne Verweigerung|PDF': 1,
      'plausibel|widersprochen|identisch|ohne Verweigerung|PDF': 900,
      'plausibel|widersprochen|abweichend|ohne Verweigerung|PDF': 4,
      'unplausibel|kein Orakel|identisch|ohne Verweigerung|—': 9,
      'unplausibel|kein Orakel|abweichend|verweigert|—': 16,
    }
    expect(build(records).lesefassung.bench.ungated).toEqual({ shown: 1364, identical: 1359 })
  })

  it('adds up what the page shows of the annex: the mark, not the gate\'s verdict (22.11.2026)', () => {
    const records = round()
    records['annex-xml.json'].drafts = [
      { note: null, verifiedParas: 3, withheldParas: 2, withheldStanding: 1, uncheckedParas: 4, shownParas: 7, unconfirmedParas: 2, markedParas: 1, markedWordParas: 0 },
      // A refused annex is left out, as it is of the gate's figures.
      { note: 'abgelehnt', verifiedParas: 0, withheldParas: 9, withheldStanding: 0, uncheckedParas: 0 },
    ]
    expect(build(records).annex.marks).toEqual({ shown: 12, unconfirmed: 3, unchecked: 2, clean: 7 })
  })

  it('takes a fault judged through the whole chain as caught where the § is withheld or marked, and says which class was held', () => {
    const { chain } = build(round()).annex
    expect(chain.pdf).toEqual([{ key: 'zahl', tried: 100, caught: 99, withheld: 0, held: true }, { key: 'rweg', tried: 50, caught: 40, withheld: 1 }])
    expect(chain.table).toEqual(chain.pdf)
  })

  it('refuses an annex record written before the mark, or one whose shown §§ are not the gate\'s', () => {
    const before = round()
    delete before['annex-pdf.json'].drafts[0].shownParas
    expect(refusals(before)).toEqual(['annex-pdf.json was written before the mark was counted (no "shownParas"): run annexPdf.ts on the code of the round'])
    const off = round()
    off['annex-pdf.json'].drafts[0].shownParas = 7
    expect(refusals(off)).toEqual(['annex-pdf.json does not balance: 7 §§ shown ≠ 5 the gate verified or left unchecked'])
    const more = round()
    more['annex-pdf.json'].drafts[0].unconfirmedParas = 5
    expect(refusals(more)).toEqual(['annex-pdf.json does not balance: 6 §§ marked of 5 shown'])
  })

  it('does not ask for a floored class the harness says cannot occur on the path', () => {
    const records = round()
    records['fi-xml.json'].result.push({ key: 'Lücke', tried: 0, caught: 0, floored: true, floor: 'nicht anwendbar' })
    expect(refusals(records)).toEqual([])
    // Tried too seldom where it can occur is still unheld.
    records['fi-pdf.json'].result.push({ key: 'Lücke', tried: 14, caught: 14, floored: true, floor: 'nicht gehalten' })
    expect(refusals(records)).toEqual([expect.stringContaining('fi-pdf.json: the floored class „Lücke" was tried 14 times')])
  })

  it('refuses a fault record without the chain, and one whose floored chain class fell', () => {
    const none = round()
    delete none['fi-xml.json'].chain
    expect(refusals(none)).toEqual(['fi-xml.json was written before faults were judged through the whole chain (no "chain"): run faultInjection.ts on the code of the round'])
    const fell = round()
    fell['fi-pdf.json'].chain[0] = { key: 'zahl', tried: 100, withheld: 0, marked: 90, unmarked: 10, floored: true, floor: 'verfehlt' }
    expect(refusals(fell)).toEqual(['fi-pdf.json: the chain\'s class „zahl" was held to the floor and fell (90 of 100 caught)'])
  })

  it('leaves out an annex fault at a § the gate had withheld before the fault: it says nothing about the fault', () => {
    const records = round()
    records['fi-pdf.json'].annex = [{ key: 'U', tried: 100, caught: 29, alreadyWithheld: 24 }]
    records['fi-xml.json'].annex = [{ key: 'U', tried: 50, caught: 0 }]
    const { faults } = build(records).annex
    expect(faults.pdf).toEqual([{ key: 'U', tried: 76, caught: 5 }])
    expect(faults.table).toEqual([{ key: 'U', tried: 50, caught: 0 }])
  })

  it('counts of the RIS-only drafts what can be composed at all: not a repealed §, not a § of a law enacted anew, not a draft with neither', () => {
    const records = round()
    records['acc-ris.json'].reports = [
      { citation: 'A', touched: 5, shown: 2, causes: { verweigert: 1, entfaellt: 2 }, failures: [] },
      { citation: 'B', touched: 3, shown: 0, causes: { 'neu-erlassen': 3 }, failures: [] },
      { citation: 'C', touched: 0, shown: 0, causes: {}, failures: [] },
    ]
    records['acc-ris.json'].requested = 3
    records['acc-ris.json'].reached = 3
    expect(build(records).lesefassung.risOnly).toEqual({ drafts: 3, changed: 8, shown: 2, outside: 5, composing: 1, witnessed: 0, notRun: {} })
  })

  it('carries the changes injected into the station comparison, caught where the page shows a change', () => {
    const record = build(round())
    expect(record.stations.faults).toEqual([{ key: 'ziffer', tried: 40, caught: 40 }, { key: 'minus', tried: 30, caught: 28 }])
  })

  it('refuses a station record that was not held to faults', () => {
    const records = round()
    delete records['station.json'].mutations
    expect(refusals(records)).toEqual([expect.stringMatching(/station\.json.*--mutationen/)])
  })
})

describe('what the audit of 23.11.2026 found the builder let through', () => {
  it('refuses a record that read the whole list instead of the period', () => {
    const records = round()
    records['annex-pdf.json'].period = null
    expect(refusals(records)).toEqual([expect.stringMatching(/annex-pdf\.json.*--nur-periode/)])
  })

  it('refuses a list that ends inside the period', () => {
    const records = round()
    records['fi-xml.json'].period = { ...period, complete: false }
    expect(refusals(records)).toEqual([expect.stringMatching(/fi-xml\.json.*--limit/)])
  })

  it('refuses two annex records over different lists', () => {
    const records = round()
    records['annex-xml.json'].period = { ...period, listed: 119 }
    expect(refusals(records)).toEqual([expect.stringMatching(/different lists/)])
  })

  it('refuses a bench without the draft path, and one that could not compose a draft', () => {
    const without = round()
    delete without['kons.json'].draftPath
    expect(refusals(without)).toEqual([expect.stringMatching(/--entwurf/)])
    const failed = round()
    failed['kons.json'].draftPath.failed = 1
    expect(refusals(failed)).toEqual([expect.stringMatching(/could not be composed/)])
  })

  it('refuses a § the second witness shows under designations the law does not carry', () => {
    const records = round()
    records['kons.json'].markers['abweichend|widersprochen|plausibel|gezeigt'] = 1
    expect(refusals(records)).toEqual([expect.stringMatching(/kons\.json.*designations/)])
  })

  it('refuses a Land run over part of its corpus', () => {
    const stations = round()
    stations['land-st/summary.json'].lands.w = { requested: 10, compared: 1, unavailable: 0, missing: 9, errored: 0 }
    expect(refusals(stations)).toEqual([expect.stringMatching(/land-st.*compared 1 of 10/)])
    const guard = round()
    guard['land-guard/summary.json'].reach.w.pdfMissing = 3
    expect(refusals(guard)).toEqual([expect.stringMatching(/land-guard.*did not reach every document/)])
  })

  it('refuses a Land run with breaches, missed changes, a failed floor or baseline findings', () => {
    const cases: [(r: Record<string, any>) => void, RegExp][] = [
      [(r) => { r['land-st/summary.json'].breaches = 2 }, /land-st.*breaches/],
      [(r) => { r['land-st/summary.json'].mutations.misses = ['x'] }, /land-st.*not shown as a change/],
      [(r) => { r['land-st/summary.json'].nullComparison.came = 1 }, /land-st.*null comparison/],
      [(r) => { r['land-guard/summary.json'].floor = null }, /land-guard.*no floor/],
      [(r) => { r['land-guard/summary.json'].floor.classes[0].verdict = 'verfehlt' }, /land-guard.*below its floor/],
      [(r) => { r['land-guard/summary.json'].baseline = null }, /land-guard.*baseline/],
      [(r) => { r['land-guard/summary.json'].baseline.findings = 2 }, /land-guard.*against the baseline/],
      [(r) => { r['land-guard/summary.json'].accounting.neither = 1 }, /land-guard.*does not balance/],
    ]
    for (const [breakIt, reason] of cases) {
      const records = round()
      breakIt(records)
      expect(refusals(records)).toEqual([expect.stringMatching(reason)])
    }
  })

  it('counts the period\'s drafts by where they ended, and the Länder\'s withheld without Kärnten', () => {
    const records = round()
    records['annex-pdf.json'].drafts.push({ note: 'keine Promulgationsklausel — Stammgesetz oder unlesbar', verifiedParas: 0, withheldParas: 0, withheldStanding: 0, uncheckedParas: 0 }, { note: 'verweigert: x', verifiedParas: 0, withheldParas: 0, withheldStanding: 0, uncheckedParas: 0 })
    const r = build(records)
    expect(r.annex.population).toEqual({ listed: 120, withAnnex: 3, readable: 1, noClause: 1, unreadable: 1 })
    expect(r.laender.tgu.withheldAll).toBe(1)
    expect(r.laender.tgu.left).toEqual([{ key: 'Zahl links', tried: 10, caught: 6 }])
    expect(r.laender.listFetchedAt).toBe('2026-11-04T14:24:46.791Z')
  })
})
