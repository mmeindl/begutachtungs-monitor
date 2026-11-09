/**
 * Which laws may say „ohne Begutachtung" (`server/utils/ris/skippedLaws.ts`,
 * docs/architecture.md §12.68).
 *
 * The four classes are claims about a named law on a public page, so what
 * these tests guard is the DIRECTION: every doubt — a draft behind it, a
 * budget law, a plausible title, a check that could not run — must end in a
 * row that is not there, never in one that says too much.
 */
import { describe, expect, it } from 'vitest'
import type { AntragPath } from '../shared/types'
import type { BgblRecord } from '../server/utils/ris/bgblJoin'
import { bgblIKey, classifySkippedLaws, isLawOfPeriod, type ParliamentItem, type SkippedLawsInput } from '../server/utils/ris/skippedLaws'
import { EXEMPT, budgetExemptReason, exemptReasonFor, isBudgetLawTitle } from '../shared/utils/budgetExempt'
import { draftSummary } from './helpers/builders'

function record(over: Partial<BgblRecord> = {}): BgblRecord {
  return {
    id: 'BGBLA_2026_I_14',
    teil: 'Teil1',
    nummer: 'BGBl. I Nr. 14/2026',
    datum: '2026-03-31',
    kurztitel: 'Änderung des Allgemeinen Sozialversicherungsgesetzes',
    titel: 'Bundesgesetz, mit dem das Allgemeine Sozialversicherungsgesetz geändert wird',
    stelle: null,
    gp: 'XXVIII',
    regierungsvorlagen: [],
    initiativantraege: [667],
    typ: 'Bundesgesetz',
    datumNationalrat: '2026-02-25',
    ...over,
  }
}

const antrag = (inr: number, title = 'Allgemeines Sozialversicherungsgesetz u.a., Änderung', date = '2026-01-28'): ParliamentItem =>
  ({ inr, citation: `${inr}/A`, title, date })
const vorlage = (inr: number, title: string, date = '2026-01-14'): ParliamentItem =>
  ({ inr, citation: `${inr} d.B.`, title, date })

/** XXVIII/42/ME → 460/A, the Stromkosten-Ausgleichsgesetz (`antragPathTable.ts`). */
const PATH_460: AntragPath = {
  antrag: { citation: '460/A', inr: 460, title: 'Stromkosten-Ausgleichsgesetz 2025 – SAG 2025', einlangen: '2025-09-24', bgblNumber: 'Bundesgesetzblatt I Nr. 67/2025' },
  draftShare: 1,
  antragShare: 1,
  duringFrist: false,
}

function input(over: Partial<SkippedLawsInput> = {}): SkippedLawsInput {
  return {
    gp: 'XXVIII',
    records: [record()],
    chains: [],
    antragPaths: {},
    vorlagen: [],
    antraege: [antrag(667)],
    // A draft on another law, before the Antrag: the title check runs and finds nothing.
    drafts: [draftSummary({ title: 'Umsatzsteuergesetz, Änderung', arrivedAt: '2025-12-01' })],
    ...over,
  }
}

const classOf = (i: SkippedLawsInput) => classifySkippedLaws(i).map((c) => c.class)

describe('classifySkippedLaws — none', () => {
  it('names the carrying item and Parliament\'s title where every check ran and found nothing', () => {
    expect(classOf(input())).toEqual([
      { kind: 'none', item: { kind: 'antrag', inr: 667, citation: '667/A' }, title: 'Allgemeines Sozialversicherungsgesetz u.a., Änderung' },
    ])
  })

  it('reads only federal laws of the period, once each', () => {
    const records = [
      record(),
      record(), // the same record from an overlapping page
      record({ id: 'BGBLA_2026_I_15', gp: 'XXVII' }),
      record({ id: 'BGBLA_2026_II_80', teil: 'Teil2', typ: 'Verordnung', gp: null }),
      record({ id: 'BGBLA_2026_I_16', typ: 'Kundmachung' }),
    ]
    expect(classifySkippedLaws(input({ records })).map((c) => c.record.id)).toEqual(['BGBLA_2026_I_14'])
    expect(isLawOfPeriod(record(), 'XXVIII')).toBe(true)
    expect(isLawOfPeriod(record({ typ: null }), 'XXVIII')).toBe(false)
  })
})

describe('classifySkippedLaws — consulted', () => {
  it('via a Vorlage a draft\'s stage record links — of any period', () => {
    const r = record({ initiativantraege: [], regierungsvorlagen: [127] })
    // XXVII/352/ME → 127 d.B. of GP XXVIII: the carry-over names the next period.
    const chains = [{ rvLinks: [{ gp: 'XXVIII', inr: 127 }] }]
    expect(classOf(input({ records: [r], chains, vorlagen: [vorlage(127, 'X')] }))).toEqual([{ kind: 'consulted', via: 'vorlage' }])
    // The same number in another period is another Vorlage.
    const other = [{ rvLinks: [{ gp: 'XXVII', inr: 127 }] }]
    expect(classOf(input({ records: [r], chains: other, vorlagen: [vorlage(127, 'Gewerbeordnung, Änderung')] }))[0]!.kind).toBe('none')
  })

  it('via every Vorlage of a split, not only the last one the chain names', () => {
    // XXVIII/26/ME → 128, 130 and 129 d.B.
    const chains = [{ rvLinks: [{ gp: 'XXVIII', inr: 128 }, { gp: 'XXVIII', inr: 130 }, { gp: 'XXVIII', inr: 129 }] }]
    const r = record({ initiativantraege: [], regierungsvorlagen: [128] })
    expect(classOf(input({ records: [r], chains }))[0]).toEqual({ kind: 'consulted', via: 'vorlage' })
  })

  it('via the Kundmachung a draft\'s chain reached, in either spelling', () => {
    const chains = [{ bgblNumber: 'Bundesgesetzblatt I Nr. 14/2026' }]
    expect(classOf(input({ chains }))[0]).toEqual({ kind: 'consulted', via: 'bgbl' })
    expect(bgblIKey('BGBl. I Nr. 14/2026')).toBe('I 14/2026')
    expect(bgblIKey('Bundesgesetzblatt I Nr. 14/2026')).toBe('I 14/2026')
    expect(bgblIKey('BGBl. II Nr. 14/2026')).toBeNull()
  })

  it('via the Antrag table, whatever share of the draft the Antrag carries', () => {
    const r = record({ nummer: 'BGBl. I Nr. 67/2025', initiativantraege: [460] })
    expect(classOf(input({ records: [r], antragPaths: { XXVIII: { 42: PATH_460 } } }))[0]).toEqual({ kind: 'consulted', via: 'antrag' })
    // 72/A carries 3 % of XXVIII/6/ME — still a consulted text in the Antrag.
    const weak = { ...PATH_460, antrag: { ...PATH_460.antrag, inr: 667, citation: '667/A', bgblNumber: 'Bundesgesetzblatt I Nr. 99/2099' }, draftShare: 0.03 }
    expect(classOf(input({ antragPaths: { XXVIII: { 6: weak } } }))[0]).toEqual({ kind: 'consulted', via: 'antrag' })
  })

  it('via an Antrag a draft of the period before carries, by its Kundmachung', () => {
    const r = record({ nummer: 'BGBl. I Nr. 67/2025', initiativantraege: [460] })
    expect(classOf(input({ records: [r], antragPaths: { XXVII: { 999: PATH_460 } } }))[0]).toEqual({ kind: 'consulted', via: 'antrag' })
  })

  it('wins when a record names a Vorlage and an Antrag, whichever carries the draft', () => {
    // A Vorlage whose Ausschuss absorbed an Antrag: one law, one record.
    const r = record({ regierungsvorlagen: [300], initiativantraege: [667] })
    const viaRv = classOf(input({ records: [r], chains: [{ rvLinks: [{ gp: 'XXVIII', inr: 300 }] }], vorlagen: [vorlage(300, 'ASVG, Änderung')] }))
    expect(viaRv[0]!.kind).toBe('consulted')
    const viaAntrag = classOf(input({ records: [r], vorlagen: [vorlage(300, 'ASVG, Änderung')], antragPaths: { XXVIII: { 1: { ...PATH_460, antrag: { ...PATH_460.antrag, inr: 667 } } } } }))
    expect(viaAntrag[0]!.kind).toBe('consulted')
  })
})

describe('classifySkippedLaws — exempt', () => {
  it('by the table, keyed by the carrying item', () => {
    const r = record({ initiativantraege: [], regierungsvorlagen: [68], kurztitel: 'Bundesfinanzgesetz 2026' })
    expect(classOf(input({ records: [r], vorlagen: [vorlage(68, 'Bundesfinanzgesetz 2026')] }))[0]).toEqual({
      kind: 'exempt',
      reason: EXEMPT['XXVIII/I/68'],
    })
  })

  it('by the title rule, for a year nobody curated — in either title', () => {
    const r = record({ initiativantraege: [], regierungsvorlagen: [900], kurztitel: 'Bundesfinanzgesetz 2029' })
    expect(classOf(input({ records: [r], vorlagen: [vorlage(900, 'Bundesfinanzgesetz 2029')] }))[0]!.kind).toBe('exempt')
    // RIS spells it otherwise, Parliament's title carries the name.
    const ris = record({ initiativantraege: [], regierungsvorlagen: [901], kurztitel: 'Änderung des Bundesfinanzrahmengesetzes' })
    expect(classOf(input({ records: [ris], vorlagen: [vorlage(901, 'Bundesfinanzrahmengesetz 2029 bis 2032, Änderung')] }))[0]!.kind).toBe('exempt')
  })

  it('never by a budget word elsewhere in the title', () => {
    for (const title of ['Budgetsanierungsmaßnahmengesetz 2025 Teil II', 'Gesetzliches Budgetprovisorium 2025', 'Bundeshaushaltsgesetz 2013, Änderung', 'Änderung des Bundesfinanzgesetzes 2026']) {
      expect(isBudgetLawTitle(title)).toBe(false)
    }
    expect(isBudgetLawTitle('Bundesfinanzgesetz 2027')).toBe(true)
    expect(isBudgetLawTitle('  Bundesfinanzrahmengesetz 2027 bis 2030')).toBe(true)
  })

  it('loses to consulted', () => {
    const r = record({ initiativantraege: [], regierungsvorlagen: [68] })
    expect(classOf(input({ records: [r], chains: [{ rvLinks: [{ gp: 'XXVIII', inr: 68 }] }] }))[0]!.kind).toBe('consulted')
  })

  it('keeps the table as the measurement reads it', () => {
    expect(exemptReasonFor('XXVIII', 'I', 66)).toMatch(/Bundesfinanzrahmengesetz/)
    expect(exemptReasonFor('XXVIII', 'I', '494')).toMatch(/Bundesfinanzgesetz 2027/)
    expect(exemptReasonFor('XXVIII', 'A', 71)).toBeNull() // Budgetprovisorium stays in, on purpose
    expect(budgetExemptReason('XXVII', [{ ityp: 'A', inr: 1560 }], [])).toMatch(/Vorbelastungen/)
  })
})

describe('classifySkippedLaws — unknown', () => {
  it('where a plausible draft began before the item', () => {
    const drafts = [draftSummary({ title: 'Allgemeines Sozialversicherungsgesetz u.a., Änderung', arrivedAt: '2025-11-03' })]
    expect(classOf(input({ drafts }))[0]).toEqual({ kind: 'unknown', reason: 'preceding-draft' })
  })

  it('but not by a draft that began after it', () => {
    const drafts = [draftSummary({ title: 'Allgemeines Sozialversicherungsgesetz u.a., Änderung', arrivedAt: '2026-02-10' })]
    expect(classOf(input({ drafts }))[0]!.kind).toBe('none')
  })

  it('where a list could not be read, or does not hold the item', () => {
    expect(classOf(input({ drafts: null }))[0]).toEqual({ kind: 'unknown', reason: 'unchecked' })
    expect(classOf(input({ antraege: null }))[0]).toEqual({ kind: 'unknown', reason: 'unchecked' })
    expect(classOf(input({ antraege: [antrag(1)] }))[0]).toEqual({ kind: 'unknown', reason: 'unchecked' })
  })

  it('where one of several items has a plausible draft, or cannot be checked', () => {
    const r = record({ regierungsvorlagen: [300], initiativantraege: [667] })
    const drafts = [draftSummary({ title: 'Glücksspielgesetz, Änderung', arrivedAt: '2025-11-03' })]
    const both = input({ records: [r], vorlagen: [vorlage(300, 'Glücksspielgesetz, Änderung')], drafts })
    expect(classOf(both)[0]).toEqual({ kind: 'unknown', reason: 'preceding-draft' })
    expect(classOf(input({ records: [r], vorlagen: null }))[0]).toEqual({ kind: 'unknown', reason: 'unchecked' })
  })

  it('where RIS names no item at all', () => {
    expect(classOf(input({ records: [record({ initiativantraege: [] })] }))[0]).toEqual({ kind: 'unknown', reason: 'no-item' })
  })
})

describe('classifySkippedLaws — the row', () => {
  it('is about the Vorlage where a record names a Vorlage and an Antrag', () => {
    const r = record({ regierungsvorlagen: [300], initiativantraege: [667] })
    const c = classOf(input({ records: [r], vorlagen: [vorlage(300, 'Glücksspielgesetz, Änderung')] }))[0]
    expect(c).toEqual({ kind: 'none', item: { kind: 'rv', inr: 300, citation: '300 d.B.' }, title: 'Glücksspielgesetz, Änderung' })
  })

  it('comes oldest Kundmachung first', () => {
    const records = [record({ id: 'b', nummer: 'BGBl. I Nr. 20/2026', datum: '2026-04-30' }), record({ id: 'a' })]
    expect(classifySkippedLaws(input({ records })).map((c) => c.record.id)).toEqual(['a', 'b'])
  })
})
