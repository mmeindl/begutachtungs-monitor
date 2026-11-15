import { describe, expect, it } from 'vitest'
import type { EnactmentInfo } from '../shared/types'
import { draftOfAntrag } from '../shared/utils/antragPath'
import { ANTRAG_PATHS } from '../shared/utils/antragPathTable'
import { mergedWithRefOf } from '../shared/utils/miterledigung'
import { filingPredatesSecondRound, statementsPredateSecondRound } from '../server/utils/parliament/detailJson'
import { mainItemOfReport, resolveMergedInto, type ReadRecord } from '../server/utils/parliament/mergedInto'
import { relatedWithPages } from '../server/utils/parliament/vorlageDetailAssembly'
import { PREDATES_FILING_DE, laterStations, mergedStandDe, parliamentStandDe, procedureStatusDe } from '../app/utils/spine'

/**
 * Follow-ups of the item pages of 14.11.2026: the Miterledigung's link
 * (`mergedInto.ts`), the sentence for items before § 23b GOG-NR, a treaty
 * whose RIS lookup did not answer, and the one Antrag→draft lookup.
 */

/* Parliament's wording, read 14.11.2026 (XXVI/496, XXVIII/A/188). */
const COMMITTEE_STEP = 'Ausschuss für Wirtschaft, Industrie und Energie: Miterledigt mit Bericht <a href="/gegenstand/XXVI/I/565">565 d.B.</a>'
const PLENARY_STATUS = 'Auf der Tagesordnung der <a href="/gegenstand/XXVI/NRSITZ/72">72. Sitzung des Nationalrates</a> Miterledigung'

/* The report's record, as Parliament ships it (565 d.B. XXVI, read 14.11.2026). */
const REPORT_565 = {
  content: {
    doktyp: 'AUB',
    reference: [
      { text: 'Hauptgegenstand des Berichts', zitation: '557 d.B.', url: '/gegenstand/XXVI/I/557', art: 'HG' },
      { text: 'Miterledigter Gegenstand des Berichts', zitation: '496 d.B.', url: '/gegenstand/XXVI/I/496', art: 'MG' },
    ],
  },
}

const reader = (records: Record<string, unknown>): ReadRecord => async (gp, ityp, inr) => {
  const r = records[`${gp}-${ityp}-${inr}`]
  if (!r) throw new Error('Parlament: not found')
  return r as { content?: unknown }
}

describe('the item a Miterledigung joined', () => {
  it('reads Parliament\'s link from the Verlauf where the status names none', () => {
    expect(mergedWithRefOf(PLENARY_STATUS, [{ stages: [{ text: COMMITTEE_STEP }, { text: PLENARY_STATUS }] }]))
      .toEqual({ gp: 'XXVI', ityp: 'I', inr: 565, citation: '565 d.B.' })
    expect(mergedWithRefOf('Verfassungsausschuss: Miterledigt mit Bericht <a href="/gegenstand/XXVII/I/1637">1637 d.B.</a>', null))
      .toEqual({ gp: 'XXVII', ityp: 'I', inr: 1637, citation: '1637 d.B.' })
    // No Miterledigung, no item.
    expect(mergedWithRefOf('Beschlossen im Nationalrat', [{ stages: [{ text: COMMITTEE_STEP }] }])).toBeNull()
  })

  it('resolves a report to the item it is on, and links our page of it', async () => {
    expect(mainItemOfReport(REPORT_565.content.reference)).toEqual({ gp: 'XXVI', ityp: 'I', inr: 557, citation: '557 d.B.' })
    const plain = await resolveMergedInto({ gp: 'XXVI', ityp: 'I', inr: 565, citation: '565 d.B.' }, reader({
      'XXVI-I-565': REPORT_565,
      'XXVI-I-557': { content: { doktyp: 'RV' } },
    }))
    expect(plain).toEqual({ report: '565 d.B.', citation: '557 d.B.', kind: 'regierungsvorlage', path: '/entwuerfe/XXVI/vorlage/557' })
    // A Vorlage that names its draft lives on the draft's page.
    const withDraft = await resolveMergedInto({ gp: 'XXVI', ityp: 'I', inr: 565, citation: '565 d.B.' }, reader({
      'XXVI-I-565': REPORT_565,
      'XXVI-I-557': { content: { doktyp: 'RV', preconst: [{ ityp: 'ME', gp_code: 'XXVI', inr: 120 }] } },
    }))
    expect(withDraft?.path).toBe('/entwuerfe/XXVI/120')
  })

  it('stays unlinked where a record cannot be read or the item is not followed', async () => {
    expect(await resolveMergedInto({ gp: 'XXVI', ityp: 'I', inr: 565, citation: '565 d.B.' }, reader({}))).toBeNull()
    expect(await resolveMergedInto({ gp: 'XXVI', ityp: 'I', inr: 565, citation: '565 d.B.' }, reader({
      'XXVI-I-565': REPORT_565,
      'XXVI-I-557': { content: { doktyp: 'A(E)' } },
    }))).toEqual({ report: '565 d.B.', citation: '557 d.B.', kind: null, path: null })
    expect(await resolveMergedInto(null, reader({}))).toBeNull()
  })

  it('words the „Stand" row with the item linked, or the citation alone', () => {
    const e = { mergedWith: '565 d.B.', houseStatusText: PLENARY_STATUS } as EnactmentInfo
    const linked = mergedStandDe({ ...e, mergedInto: { report: '565 d.B.', citation: '557 d.B.', kind: 'regierungsvorlage', path: '/entwuerfe/XXVI/vorlage/557' } }, 'bundesratsantrag')
    expect(linked.text).toBe('Der Antrag wurde mit dem Ausschussbericht 565 d.B. zur Regierungsvorlage 557 d.B. miterledigt, ohne eigenen Beschluss.')
    expect(linked.link).toEqual({ href: '/entwuerfe/XXVI/vorlage/557', label: 'Regierungsvorlage 557 d.B.' })
    const unresolved = mergedStandDe(e, 'antrag')
    expect(unresolved).toMatchObject({ link: null, text: 'Der Antrag wurde mit 565 d.B. miterledigt, ohne eigenen Beschluss.' })
    const direct = mergedStandDe({ ...e, mergedInto: { report: null, citation: '123/A', kind: 'initiativantrag', path: '/entwuerfe/XXVI/antrag/123' } }, 'antrag')
    expect(direct.text).toBe('Der Antrag wurde mit dem Initiativantrag 123/A miterledigt, ohne eigenen Beschluss.')
  })
})

describe('items before § 23b GOG-NR (01.08.2021)', () => {
  it('reads Parliament\'s flag for the date, not for every „9"', () => {
    // 60/A XXVII, read 14.11.2026.
    expect(filingPredatesSecondRound({ statementsstate: '9 Begutachtung erst ab 1.8.2021 bei dem Doktyp "A" möglich' })).toBe(true)
    expect(filingPredatesSecondRound({ statementsstate: '9 Begutachtung bei dem Doktyp "RVS" nicht möglich' })).toBe(false)
    expect(filingPredatesSecondRound({ statementsstate: '0' })).toBe(false)
    expect(filingPredatesSecondRound(null)).toBe(false)
  })
  it('holds for every item of a period that ended before the date, and for GP XXVII only on the flag', () => {
    // 557 d.B. XXVI: flag „0" (read 14.11.2026), period ended 22.10.2019.
    expect(statementsPredateSecondRound('XXVI', { statementsstate: '0' })).toBe(true)
    expect(statementsPredateSecondRound('XX', null)).toBe(true)
    // GP XXVII ran across the date: „0" is no reason, „9 … 1.8.2021" is.
    expect(statementsPredateSecondRound('XXVII', { statementsstate: '0' })).toBe(false)
    expect(statementsPredateSecondRound('XXVII', { statementsstate: '9 Begutachtung erst ab 1.8.2021 bei dem Doktyp "A" möglich' })).toBe(true)
    expect(statementsPredateSecondRound('XXVIII', { statementsstate: '1' })).toBe(false)
  })
  it('says what is missing and why, in one sentence', () => {
    expect(PREDATES_FILING_DE).toBe('Stellungnahmen an den Nationalrat waren erst ab 01.08.2021 möglich.')
  })
})

describe('a treaty whose RIS lookup did not answer (14.11.2026)', () => {
  const enactment = (over: Partial<EnactmentInfo>): EnactmentInfo => ({
    rvCitation: '510 d.B.', rvUrl: 'https://www.parlament.gv.at/gegenstand/XXVI/I/510', rvTextUrl: null, rvDate: '2019-01-10', furtherRv: [],
    bgblNumber: null, bgblRisUrl: null, amendedIn: [], committeeReport: null, plenaryAmendments: null,
    houseStatus: '5', houseStatusText: 'Beschlossen im Nationalrat', vote: null, filingOpen: false, rvGpEnded: true,
    notPromulgated: null, successor: null, treaty: 'staatsvertrag', ...over,
  })
  const page = (e: EnactmentInfo) => ({ enactment: e, textEvolution: [], gpEnded: true, active: false, antragPath: null })

  it('says „gerade nicht abrufbar", never „im RIS bisher nicht verzeichnet"', () => {
    const unread = enactment({ bgblUnread: true })
    const [, bgbl] = laterStations(page(unread), '2026-11-14')
    expect(bgbl.facts).toEqual(['gerade nicht abrufbar'])
    expect(procedureStatusDe({ ...page(unread), gp: 'XXVI', inr: 1, documents: [] } as never, '2026-11-14')).not.toMatch(/verzeichnet/)
    expect(parliamentStandDe(page(unread), '2026-11-14')).toBe('Der Nationalrat hat den Staatsvertrag genehmigt.')
    // RIS answered „no record": the statement about our search stands.
    expect(laterStations(page(enactment({})), '2026-11-14')[1].facts).toEqual(['im RIS bisher nicht verzeichnet'])
  })
})

describe('the one Antrag→draft lookup (task 7)', () => {
  it('a committee motion\'s parent Antrag names the draft whose text it carries, as `draftOfAntrag` reads it', async () => {
    // Every Antrag of the table, read as before: the draft keyed to it.
    for (const [gp, byDraft] of Object.entries(ANTRAG_PATHS)) {
      for (const [draftInr, path] of Object.entries(byDraft)) {
        expect(draftOfAntrag(gp, path.antrag.inr)?.inr).toBe(Number(draftInr))
      }
    }
    const related = await relatedWithPages({ reference: [{ text: 'Bezug zu', zitation: '72/A', url: '/gegenstand/XXVIII/A/72' }] }, async () => ({ content: { doktyp: 'A' } }))
    expect(related[0]).toMatchObject({ kind: 'initiativantrag', path: '/entwuerfe/XXVIII/antrag/72', consultedDraft: { gp: 'XXVIII', inr: 6, path: '/entwuerfe/XXVIII/6' } })
    expect(Object.keys(related[0]!.consultedDraft!)).toEqual(['gp', 'inr', 'path'])
  })
})
