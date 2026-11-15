/**
 * Which laws may say „ohne Begutachtung" (`server/utils/ris/skippedLaws.ts`).
 *
 * The four classes are claims about a named law on a public page, so what
 * these tests guard is the DIRECTION: every doubt — a draft behind it, a
 * budget law, a plausible title, a check that could not run — must end in a
 * row that is not there, never in one that says too much.
 */
import { describe, expect, it } from 'vitest'
import type { AntragPath } from '../shared/types'
import type { BgblRecord } from '../server/utils/ris/bgblJoin'
import { BGBL_AUTH_FROM, bgblIKey, classifySkippedLaws, isLawOfPeriod, yearsOfPeriod, type AusschussantragItem, type ParliamentItem, type SkippedLawsInput } from '../server/utils/ris/skippedLaws'
import { EXEMPT, budgetExemptReason, exemptReasonFor, isBudgetLawTitle } from '../shared/utils/budgetExempt'
import { periodAgainstSource } from '../shared/utils/gp'
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
    ausschussberichte: [],
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

  it('where a part of a consulted draft\'s text stands in the Antrag (below the table\'s step)', () => {
    // 667/A: 30 % of 20/ME — too little for consulted, too much for „ohne".
    expect(classOf(input({ antragPartial: { XXVIII: [667] } }))[0]).toEqual({ kind: 'unknown', reason: 'partial-text' })
    // Keyed by the Antrag's period: the same number in another period is another Antrag.
    expect(classOf(input({ antragPartial: { XXVII: [667] } }))[0]!.kind).toBe('none')
    // Even where the title check could not have run.
    expect(classOf(input({ antragPartial: { XXVIII: [667] }, drafts: null }))[0]).toEqual({ kind: 'unknown', reason: 'partial-text' })
  })

  it('but consulted and exempt still win over a partial text', () => {
    const partial = { XXVIII: [667] }
    expect(classOf(input({ antragPartial: partial, chains: [{ bgblNumber: 'Bundesgesetzblatt I Nr. 14/2026' }] }))[0]).toEqual({ kind: 'consulted', via: 'bgbl' })
    const budget = record({ kurztitel: 'Bundesfinanzgesetz 2029' })
    expect(classOf(input({ records: [budget], antragPartial: partial }))[0]!.kind).toBe('exempt')
  })

  it('where RIS names no item at all', () => {
    expect(classOf(input({ records: [record({ initiativantraege: [] })] }))[0]).toEqual({ kind: 'unknown', reason: 'no-item' })
  })
})

describe('classifySkippedLaws — a law from a committee\'s motion (decision 2, 14.11.2026)', () => {
  /* BGBl. I Nr. 156/2024: RIS names no Vorlage and no Antrag, only the
   * Ausschussbericht 14 — the BUA 14 d.B., „Bezug zu" 14/A. */
  const law = record({ id: 'BGBLA_2024_I_156', nummer: 'BGBl. I Nr. 156/2024', initiativantraege: [], ausschussberichte: [14], kurztitel: 'Bundesbezügegesetz', titel: 'Bundesgesetz, mit dem das Bundesbezügegesetz geändert wird' })
  const bua = (related: AusschussantragItem['related'] = [{ gp: 'XXVIII', ityp: 'A', inr: 14, consulted: false }], title = 'Bundesbezügegesetz, Änderung'): AusschussantragItem =>
    ({ inr: 14, citation: '14 d.B.', title, date: '2024-12-09', related })
  const buaInput = (over: Partial<SkippedLawsInput> = {}) =>
    input({ records: [law], antraege: [antrag(14, '2. Dienstrechts-Novelle 2024', '2024-11-20')], ausschussantraege: [bua()], ...over })

  it('becomes a row carried by the Ausschussantrag where every check ran and nothing was consulted', () => {
    expect(classOf(buaInput())).toEqual([
      { kind: 'none', item: { kind: 'ausschussantrag', inr: 14, citation: '14 d.B.' }, title: 'Bundesbezügegesetz, Änderung' },
    ])
    // A motion with no „Bezug zu" at all is the committee's own text: its own checks decide.
    expect(classOf(buaInput({ ausschussantraege: [bua([])] }))[0]!.kind).toBe('none')
  })

  it('says nothing where its „Bezug zu" parent was consulted', () => {
    // An Antrag in the route table (any share), or one with a part of a consulted text.
    expect(classOf(buaInput({ antragPaths: { XXVIII: { 42: { ...PATH_460, antrag: { ...PATH_460.antrag, inr: 14, citation: '14/A' } } } } }))[0])
      .toEqual({ kind: 'unknown', reason: 'related-consulted' })
    expect(classOf(buaInput({ antragPartial: { XXVIII: [14] } }))[0]).toEqual({ kind: 'unknown', reason: 'related-consulted' })
    // A Regierungsvorlage a draft's stage record links (365 d.B. → 312 d.B. → XXVIII/32/ME).
    const toRv = buaInput({ ausschussantraege: [bua([{ gp: 'XXVIII', ityp: 'I', inr: 312 }, { gp: 'XXVIII', ityp: 'GAA', inr: 3 }])], chains: [{ rvLinks: [{ gp: 'XXVIII', inr: 312 }] }] })
    expect(classOf(toRv)[0]).toEqual({ kind: 'unknown', reason: 'related-consulted' })
    // A parent whose own record names its draft or shows an Ausschussbegutachtung
    // (334 d.B. → 310 d.B., 225 Stellen), whatever the stage records link.
    expect(classOf(buaInput({ ausschussantraege: [bua([{ gp: 'XXVIII', ityp: 'A', inr: 14, consulted: true }])] }))[0])
      .toEqual({ kind: 'unknown', reason: 'related-consulted' })
  })

  it('errs towards silence on every other doubt', () => {
    // The motion's record could not be read.
    expect(classOf(buaInput({ ausschussantraege: [{ ...bua(), related: undefined }] }))[0]).toEqual({ kind: 'unknown', reason: 'unchecked' })
    // A parent whose own record was not read.
    expect(classOf(buaInput({ ausschussantraege: [bua([{ gp: 'XXVIII', ityp: 'A', inr: 14 }])] }))[0]).toEqual({ kind: 'unknown', reason: 'unchecked' })
    // A parent the period's lists do not hold, or of another period.
    expect(classOf(buaInput({ antraege: [] }))[0]).toEqual({ kind: 'unknown', reason: 'unchecked' })
    expect(classOf(buaInput({ ausschussantraege: [bua([{ gp: 'XXVII', ityp: 'A', inr: 14, consulted: false }])] }))[0]).toEqual({ kind: 'unknown', reason: 'unchecked' })
    // A plausible draft behind the parent, or behind the motion itself.
    const draft = draftSummary({ title: 'Bundesbezügegesetz, Änderung', arrivedAt: '2024-10-01' })
    expect(classOf(buaInput({ drafts: [draft] }))[0]).toEqual({ kind: 'unknown', reason: 'preceding-draft' })
    expect(classOf(buaInput({ drafts: null }))[0]).toEqual({ kind: 'unknown', reason: 'unchecked' })
    // The budget procedure.
    expect(classOf(buaInput({ ausschussantraege: [bua(undefined, 'Bundesfinanzgesetz 2029')] }))[0]!.kind).toBe('exempt')
  })

  it('stays no-item where the report number is no committee\'s motion of the period, and unchecked where the list is unread', () => {
    expect(classOf(buaInput({ ausschussantraege: [] }))[0]).toEqual({ kind: 'unknown', reason: 'no-item' })
    expect(classOf(buaInput({ ausschussantraege: null }))[0]).toEqual({ kind: 'unknown', reason: 'unchecked' })
    expect(classOf(buaInput({ ausschussantraege: undefined }))[0]).toEqual({ kind: 'unknown', reason: 'unchecked' })
    // A record with no report either: no item, as before.
    expect(classOf(buaInput({ records: [record({ initiativantraege: [] })] }))[0]).toEqual({ kind: 'unknown', reason: 'no-item' })
  })

  it('never takes a Vorlage\'s Ausschussbericht for a committee\'s motion', () => {
    // A law from 300 d.B. whose report number happens to be a BUA number: the Vorlage carries it.
    const r = record({ regierungsvorlagen: [300], initiativantraege: [], ausschussberichte: [14] })
    const c = classOf(buaInput({ records: [r], vorlagen: [vorlage(300, 'Glücksspielgesetz, Änderung')] }))[0]
    expect(c).toMatchObject({ kind: 'none', item: { kind: 'rv', inr: 300 } })
  })
})

describe('classifySkippedLaws — a law from a motion of the Bundesrat (14.11.2026)', () => {
  /* BGBl. I Nr. 44/2015: RIS puts the GABR's number 452 in `Regierungsvorlage`
   * (and AB 503 beside it); only list 101's DOKTYP says it is no Vorlage. */
  const law = record({
    id: 'BGBLA_2015_I_44', nummer: 'BGBl. I Nr. 44/2015', datum: '2015-04-22', gp: 'XXV',
    kurztitel: 'Änderung des Versicherungsaufsichtsgesetzes 2016', titel: 'Bundesgesetz, mit dem das Versicherungsaufsichtsgesetz 2016 geändert wird',
    regierungsvorlagen: [452], initiativantraege: [], ausschussberichte: [503], datumNationalrat: '2015-03-25',
  })
  const gabr = { inr: 452, citation: '452 d.B.', title: 'Versicherungsaufsichtsgesetz 2016, Änderung', date: '2014-12-19', variant: 'bundesrat' as const }
  const gabrInput = (over: Partial<SkippedLawsInput> = {}) =>
    input({ gp: 'XXV', records: [law], vorlagen: [], antraege: [], bundesratsantraege: [gabr], drafts: [draftSummary({ title: 'Umsatzsteuergesetz, Änderung', arrivedAt: '2014-10-01' })], ...over })

  it('is checked like an Antrag and carried by the motion, with who moved it', () => {
    expect(classOf(gabrInput())).toEqual([
      { kind: 'none', item: { kind: 'bundesratsantrag', inr: 452, citation: '452 d.B.', variant: 'bundesrat' }, title: 'Versicherungsaufsichtsgesetz 2016, Änderung' },
    ])
    expect(classOf(gabrInput({ bundesratsantraege: [{ ...gabr, variant: 'drittel' }] }))[0]).toMatchObject({ item: { kind: 'bundesratsantrag', variant: 'drittel' } })
  })

  it('runs the same checks: a plausible draft, the budget procedure, a draft\'s link', () => {
    const draft = draftSummary({ title: 'Versicherungsaufsichtsgesetz 2016, Änderung', arrivedAt: '2014-11-01' })
    expect(classOf(gabrInput({ drafts: [draft] }))[0]).toEqual({ kind: 'unknown', reason: 'preceding-draft' })
    expect(classOf(gabrInput({ drafts: null }))[0]).toEqual({ kind: 'unknown', reason: 'unchecked' })
    expect(classOf(gabrInput({ chains: [{ rvLinks: [{ gp: 'XXV', inr: 452 }] }] }))[0]).toEqual({ kind: 'consulted', via: 'vorlage' })
    expect(classOf(gabrInput({ records: [{ ...law, kurztitel: 'Bundesfinanzgesetz 2016' }] }))[0]!.kind).toBe('exempt')
  })

  it('stays unchecked where list 101 does not say what the number is', () => {
    // Before 14.11.2026: the number is no Vorlage of the list, and nothing else was asked.
    expect(classOf(gabrInput({ bundesratsantraege: undefined }))[0]).toEqual({ kind: 'unknown', reason: 'unchecked' })
    expect(classOf(gabrInput({ bundesratsantraege: null }))[0]).toEqual({ kind: 'unknown', reason: 'unchecked' })
    expect(classOf(gabrInput({ bundesratsantraege: [] }))[0]).toEqual({ kind: 'unknown', reason: 'unchecked' })
  })

  it('never takes a Vorlage for a motion where both lists hold the number', () => {
    const c = classOf(gabrInput({ vorlagen: [vorlage(452, 'Versicherungsaufsichtsgesetz 2016, Änderung', '2014-12-19')] }))[0]
    expect(c).toMatchObject({ kind: 'none', item: { kind: 'rv', inr: 452 } })
    expect(c).not.toHaveProperty('item.variant')
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

describe('a mention silences (12.11.2026)', () => {
  it('reads the item’s own documents but its Gesetzestext and TGÜ', async () => {
    const { mentionDocuments, mentionsBegutachtung } = await import('../server/utils/ris/skippedLaws')
    expect(mentionDocuments([
      { title: 'Gesetzestext', formats: [{ type: 'html', url: 'g' }] },
      { title: 'Erläuterungen', formats: [{ type: 'pdf', url: 'e.pdf' }, { type: 'html', url: 'e.html' }] },
      { title: 'TGÜ', formats: [{ type: 'html', url: 't' }] },
      { title: 'Initiativantrag (elektr. übermittelte Version)', formats: [{ type: 'html', url: 'a' }] },
    ])).toEqual(['e.html', 'a'])
    expect(mentionsBegutachtung('… der im Begutachtungsverfahren geäußerten Bedenken …')).toBe(true)
    expect(mentionsBegutachtung('… im Rahmen der Begutachtung der rezenten Novelle …')).toBe(true)
    expect(mentionsBegutachtung('Der Nationalrat wolle beschließen')).toBe(false)
  })
  it('turns a none into unknown on a mention, and on a failed read', async () => {
    const { refineByMention } = await import('../server/utils/ris/skippedLaws')
    const law = (inr: number) => ({ record: record(), class: { kind: 'none' as const, item: { kind: 'antrag' as const, inr, citation: `${inr}/A` }, title: 'X' } })
    const out = refineByMention([law(1), law(2), law(3)], (item) => (item.inr === 1 ? true : item.inr === 2 ? undefined : false))
    expect(out.map((l) => l.class)).toEqual([
      { kind: 'unknown', reason: 'mentions' },
      { kind: 'unknown', reason: 'unchecked' },
      law(3).class,
    ])
  })
})

/**
 * The Jahrgänge a period is read over. RIS's authentic Bundesgesetzblatt
 * begins on 01.01.2004 (`BGBL_AUTH_FROM`): a period that ended before it has
 * no years, so the list states a gap instead of reading empty years as „none".
 */
describe('yearsOfPeriod', () => {
  const today = '2026-11-15'

  it('has no years for a period that ended before the source begins', () => {
    expect(yearsOfPeriod('XIX', today)).toBeNull()
    expect(yearsOfPeriod('XXI', today)).toBeNull()
    expect(yearsOfPeriod('XIV', today)).toBeNull()
  })

  it('keeps the years of a period that only began before it', () => {
    expect(yearsOfPeriod('XXII', today)).toEqual([2002, 2003, 2004, 2005, 2006, 2007])
  })

  it('runs from the start to the year after the end, never past the running year', () => {
    expect(yearsOfPeriod('XXVII', today)).toEqual([2019, 2020, 2021, 2022, 2023, 2024, 2025])
    expect(yearsOfPeriod('XXVIII', today)).toEqual([2024, 2025, 2026])
  })

  it('has no years for a period the calendar does not hold', () => {
    expect(yearsOfPeriod('XIII', today)).toBeNull()
    expect(yearsOfPeriod('XXIX', today)).toBeNull()
  })
})

/**
 * Where a period stands against the source (15.11.2026): the service answers
 * `gap: 'beforeSource'` for `before`, and the page notes the missing early
 * laws for `straddles` (`coversFrom`, `lawsReachNoteDe`).
 */
describe('periodAgainstSource with the Bundesgesetzblatt in RIS', () => {
  it('puts every period that ended before 2004 wholly before the source', () => {
    for (const gp of ['XIV', 'XIX', 'XX', 'XXI']) expect(periodAgainstSource(gp, BGBL_AUTH_FROM)).toBe('before')
  })

  it('lets XXII straddle it: begun in December 2002, ended in 2006', () => {
    expect(periodAgainstSource('XXII', BGBL_AUTH_FROM)).toBe('straddles')
  })

  it('holds every later period whole, the running one included', () => {
    for (const gp of ['XXIII', 'XXVII', 'XXVIII']) expect(periodAgainstSource(gp, BGBL_AUTH_FROM)).toBe('within')
  })

  it('says nothing for a period the calendar does not hold', () => {
    expect(periodAgainstSource('XIII', BGBL_AUTH_FROM)).toBeNull()
    expect(periodAgainstSource('XXIX', BGBL_AUTH_FROM)).toBeNull()
  })
})
