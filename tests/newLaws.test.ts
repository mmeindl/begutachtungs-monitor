import { describe, expect, it } from 'vitest'
import {
  accountOf,
  bgblNumberOf,
  CONSOLIDATION_GRACE_DAYS,
  findingsOf,
  gapsIn,
  kindsOfLaw,
  lawOutcomeOf,
  poolOf,
  type BgblListing,
  type KonsLaw,
  type NewLawKonsRecord,
} from '../scripts/lib/newLaws'

/**
 * Scoring every new law (23.11.2026). What is held here is that nothing drops
 * out unsaid: a missing number, a law without an outcome, a kind of change no
 * rule was tested on.
 */
const listing = (number: number, over: Partial<BgblListing> = {}): BgblListing => ({
  year: 2026, number, id: `BGBLA_2026_I_${number}`, nummer: `BGBl. I Nr. ${number}/2026`, date: '2026-11-01', typ: 'Bundesgesetz', title: 'Gesetz', ...over,
})
const law = (number: number, over: Partial<KonsLaw> = {}): KonsLaw => ({
  bgbl: `BGBl. I Nr. ${number}/2026`, article: null, law: 'Gesetz', instructions: 1, read: 1, applied: 1, checked: 1, identical: 1, divergent: 0, note: null, kinds: [], ...over,
})
const record = (over: Partial<NewLawKonsRecord> = {}): NewLawKonsRecord => ({
  unreached: [], laws: [], removalFindings: [], gate: {}, witness: {}, markers: {}, ...over,
})

describe('gapsIn', () => {
  it('names a missing number, from the start and across a year', () => {
    const list = [{ year: 2026, number: 82 }, { year: 2026, number: 84 }, { year: 2027, number: 2 }]
    expect(gapsIn(list, { year: 2026, number: 82 })).toEqual(['BGBl. I Nr. 83/2026', 'BGBl. I Nr. 1/2027'])
  })

  it('ignores what lies before the start', () => {
    expect(gapsIn([{ year: 2025, number: 9 }, { year: 2026, number: 5 }, { year: 2026, number: 6 }], { year: 2026, number: 5 })).toEqual([])
  })
})

describe('poolOf', () => {
  const scope = { holdoutFrom: { year: 2026, number: 104 }, leftHoldout: ['BGBl. I Nr. 110/2026'] }

  it('counts only a law published after the freeze as holdout', () => {
    expect(poolOf(listing(103), scope)).toBe('trial')
    expect(poolOf(listing(104), scope)).toBe('holdout')
    expect(poolOf(listing(1, { year: 2027, nummer: 'BGBl. I Nr. 1/2027' }), scope)).toBe('holdout')
  })

  it('takes a law used to fix a rule out of the holdout', () => {
    expect(poolOf(listing(110), scope)).toBe('used')
  })
})

describe('lawOutcomeOf', () => {
  it('lets a law RIS has not consolidated wait, and only for so long', () => {
    const note = 'BGBl. I Nr. 88/2026 in keiner Fassung von ASVG als Kundmachungsorgan genannt'
    expect(lawOutcomeOf(note, CONSOLIDATION_GRACE_DAYS)).toBe('pending')
    expect(lawOutcomeOf(note, CONSOLIDATION_GRACE_DAYS + 1)).toBe('failed')
  })

  it('tells a new law from one the bench could not read', () => {
    expect(lawOutcomeOf(null, 0)).toBe('scored')
    expect(lawOutcomeOf('keine Promulgationsklausel — kein geändertes Gesetz', 0)).toBe('noAmendment')
    expect(lawOutcomeOf('Sammelnovelle: 2 Stammnormen', 0)).toBe('failed')
  })
})

describe('accountOf', () => {
  it('gives every entry exactly one outcome', () => {
    const list = [listing(1), listing(2, { typ: 'Kundmachung' }), listing(3), listing(4), listing(5)]
    const out = accountOf(list, record({
      unreached: [{ id: 'BGBLA_2026_I_4', cause: 'RIS antwortet nicht' }],
      laws: [law(1), law(3, { note: 'keine Promulgationsklausel — kein geändertes Gesetz' })],
    }), '2026-11-23')
    expect(out.map((a) => a.outcome)).toEqual(['scored', 'notLaw', 'noAmendment', 'failed', 'failed'])
    expect(out).toHaveLength(list.length)
  })

  it('does not hide a failed law of a Sammelnovelle behind the scored ones', () => {
    const [a] = accountOf([listing(1)], record({ laws: [law(1), law(1, { article: 'Artikel 2', note: 'Sammelnovelle: 2 Stammnormen' })] }), '2026-11-23')
    expect(a).toMatchObject({ outcome: 'failed', laws: 2, reason: 'Sammelnovelle: 2 Stammnormen' })
  })
})

describe('kindsOfLaw', () => {
  it('names the shape of the change and folds counts', () => {
    expect(kindsOfLaw({
      package: true,
      ops: [{ kind: 'delete', level: 'para', schedule: true }, { kind: 'replace', level: null, schedule: false }],
      refused: ['4 Operanden, Paarbildung unklar', '6 Operanden, Paarbildung unklar'],
      renumbered: true,
      wholeText: false,
      constitutional: true,
    })).toEqual(['anlage', 'anweisung:delete:para', 'anweisung:replace:ohne', 'sammelnovelle', 'umnummerierung', 'verfassungsbestimmung', 'verweigert:N Operanden, Paarbildung unklar'])
  })
})

describe('findingsOf', () => {
  const kinds = (r: NewLawKonsRecord, known: string[] = []) => findingsOf(r, new Set(known), []).map((f) => f.kind)

  it('is empty for a clean law of a known kind', () => {
    expect(kinds(record({ laws: [law(1, { kinds: ['sammelnovelle'] })], gate: { 'plausibel|bestätigt|identisch|ohne Verweigerung|PDF': 3 }, witness: { 'gezeigt|identisch': 2 } }), ['sammelnovelle'])).toEqual([])
  })

  it('reports a wrong repeal, but not one RIS could not settle', () => {
    expect(kinds(record({ removalFindings: ['falsch: BMSVG § 40', 'nicht prüfbar: BMSVG § 41'] }))).toEqual(['wrongRepeal'])
  })

  it('reports what the page would show and the law does not say', () => {
    expect(kinds(record({ gate: { 'plausibel|bestätigt|abweichend|ohne Verweigerung|XML': 1, 'plausibel|widersprochen|abweichend|ohne Verweigerung|XML': 1 }, witness: { 'gezeigt|unvollständig': 1, 'pruefung|abweichend': 1 } }))).toEqual(['shownNotIdentical', 'shownNotIdentical'])
    expect(kinds(record({ markers: { 'abweichend|bestätigt|plausibel|—': 1 } }))).toEqual(['misnumbered'])
  })

  it('names a kind of change once, at the first law that has it', () => {
    const found = findingsOf(record({ laws: [law(1, { kinds: ['anweisung:toc:para'] }), law(2, { kinds: ['anweisung:toc:para'] })] }), new Set(), [])
    expect(found).toHaveLength(1)
    expect(found[0]!.detail).toContain('BGBl. I Nr. 1/2026')
  })

  it('turns a failed outcome into a finding, and a waiting one not', () => {
    const accounts = accountOf([listing(1), listing(2)], record({ laws: [law(1, { note: 'Sammelnovelle: 2 Stammnormen' }), law(2, { note: 'BGBl. I Nr. 2/2026 in keiner Fassung von X als Kundmachungsorgan genannt' })] }), '2026-11-23')
    expect(findingsOf(record(), new Set(), accounts).map((f) => f.kind)).toEqual(['unscored'])
  })
})

describe('bgblNumberOf', () => {
  it('reads the citation', () => {
    expect(bgblNumberOf('BGBl. I Nr. 88/2026')).toEqual({ number: 88, year: 2026 })
    expect(bgblNumberOf('keine Nummer')).toBeNull()
  })
})
