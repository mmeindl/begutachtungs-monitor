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

function faultRecord(path: 'pdf' | 'table') {
  return {
    ...stamp, ...reach(120), path, drafts: 100,
    annex: [{ key: 'L', tried: 50, caught: 30 }],
    result: [
      { key: 'E', tried: 100, caught: 100, floored: true },
      { key: 'Lücke', tried: 40, caught: 40, floored: true },
      { key: 'Lücke-beide', tried: 10, caught: 3, floored: false },
    ],
    floor: { min: 95, passed: true, failed: [], unheld: [] },
  }
}

/** A sound round: every record there, one day, one clean commit, the whole corpus. */
function round(): Record<string, any> {
  return {
    'kons.json': {
      ...stamp, ...reach(60), corpus: { bgbl: 60, laws: 207 }, checked: 1794,
      unrefused: { checked: 1486, identical: 1451, divergent: 6 },
      gate: { 'plausibel|bestätigt|identisch|ohne Verweigerung|XML': 459, 'plausibel|bestätigt|unvollständig|ohne Verweigerung|PDF': 1 },
    },
    'fi-pdf.json': faultRecord('pdf'),
    'fi-xml.json': faultRecord('table'),
    'acc.json': { ...stamp, ...reach(2), reports: [{ citation: '1/ME', touched: 3, shown: 2, causes: { verweigert: 1 }, failures: [] }, { citation: '2/ME', touched: 1, shown: 1, causes: {}, failures: [] }] },
    'acc-ris.json': { ...stamp, ...reach(1), reports: [{ citation: '4D9E1224', touched: 1, shown: 0, causes: { 'kein-anhang': 1 }, failures: [] }] },
    'annex-pdf.json': { ...stamp, drafts: [{ note: null, verifiedParas: 5, withheldParas: 1, withheldStanding: 0, uncheckedParas: 0 }] },
    'annex-xml.json': { ...stamp, drafts: [] },
    'station.json': { ...stamp, ...reach(91), drafts: 91, pairs: 453, breaches: [], residues: [], nullUnits: { 'parlament-bgbl': 10, 'html-xml': 5 } },
    'land-guard/summary.json': { ...stamp, lands: ['Wien'], documents: 1, compared: 2, shown: 2, judged: 1, found: 1, faults: [], strict: { held: 2, differs: 0, unchecked: 0 } },
    'land-st/summary.json': { ...stamp, pairs: 1, compared: 1, hits: 0, accepted: 0, withheld: 0, withheldPairs: 0, unread: 0, unreadPairs: 0, stale: 0 },
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
