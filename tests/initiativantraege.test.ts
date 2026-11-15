/**
 * Step 3 of `docs/research/umsetzungsplan-weitere-wege.md` (14.11.2026):
 * every Initiativantrag — its state (`server/utils/parliament/antraege.ts`),
 * its row under „Alle Initiativanträge", and the row on an Antrag's page
 * that names the consulted draft whose text it carries (decision 9).
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { AntragRow, EnactmentInfo, VorlageDetail } from '../shared/types'
import { draftOfAntrag } from '../shared/utils/antragPath'
import { antragRow, compareRowsByFrist } from '../shared/utils/draftOrder'
import { antragRowOf, classifyAntrag, compareAntragRows, needsReading, readAntragDetail, readAntragOutcome } from '../server/utils/parliament/antraege'
import { mapAntragRow } from '../server/utils/parliament/list101'
import { assembleVorlageDetail, type VorlageContent } from '../server/utils/parliament/vorlageDetailAssembly'
import { carriedDraftDe } from '../app/utils/itemKind'
import { houseOutcomeOf, vorlageStations, vorlageStatusDe } from '../app/utils/spine'
import { mergedDe, mergedWithCitation, mergedWithOf } from '../shared/utils/miterledigung'
import { entwurfFrameCredits, entwurfFrameView } from '../app/utils/entwurfFrame'
import { viewOfAntrag } from '../app/utils/entryView'
import {
  antragGapNotes,
  antragRowsOf,
  antragStationOf,
  artChoiceOf,
  artChoiceParams,
  artSelectFor,
  artUnavailableBySources,
  choiceAdmitsBundLaw,
  choiceAdmitsDraft,
  choiceAdmitsMinisterialentwurf,
  choiceAdmitsOpenVorlage,
  coherentArt,
  draftCountLabel,
  draftFiltersFromQuery,
  draftRowsOf,
  withoutDraftRowsOf,
} from '../app/utils/draftFilters'

describe('readAntragOutcome — Parliament’s prose, read for the end it names', () => {
  it('tells a rejection from a withdrawal and a Miterledigung (GP XXVII, read 14.11.2026)', () => {
    expect(readAntragOutcome('Gesetzesantrag abgelehnt (<a href="/gegenstand/XXVII/I/123">123 d.B.</a>)')).toBe('rejected')
    expect(readAntragOutcome('135. Sitzung des Nationalrates: Gesetzesvorschlag in zweiter Lesung abgelehnt Abgelehnt (…)')).toBe('rejected')
    expect(readAntragOutcome('Zurückgezogen')).toBe('withdrawn')
    expect(readAntragOutcome('Verfassungsausschuss: Miterledigt mit Bericht <a href="/x">1637 d.B.</a>')).toBe('merged')
    expect(readAntragOutcome('Auf der Tagesordnung der 249. Sitzung des Nationalrates<br>Miterledigung')).toBe('merged')
  })
  it('never turns a Beschluss into a rejection', () => {
    expect(readAntragOutcome('Beschlossen im Bundesrat 6/BNR<br>Beschlossen im Nationalrat 6/BNR, Dafür: …, dagegen: …')).toBe('decided')
  })
  it('names nothing while the house still has it', () => {
    expect(readAntragOutcome('Zugewiesen an: Verfassungsausschuss, Beratungen noch nicht aufgenommen')).toBeNull()
    expect(readAntragOutcome(null)).toBeNull()
  })
  it('reads the flag as `isFilingOpen` does', () => {
    expect(readAntragDetail({ statementsstate: '1', status: { description: 'Zugewiesen an: …' } })).toEqual({ filingOpen: true, outcome: null, mergedWith: null })
    expect(readAntragDetail({ statementsstate: '9 Begutachtung erst ab 1.8.2021 bei dem Doktyp "A" möglich' })).toEqual({ filingOpen: false, outcome: null, mergedWith: null })
  })
})

describe('classifyAntrag', () => {
  const pending = { status: '2', voteCarried: false }
  it('says „open" only on the item’s own flag in the running period', () => {
    expect(classifyAntrag(pending, { running: true, promulgated: false, reading: { filingOpen: true, outcome: null, mergedWith: null } })).toBe('open')
    expect(classifyAntrag(pending, { running: true, promulgated: false, reading: { filingOpen: false, outcome: null, mergedWith: null } })).toBe('pending')
    expect(classifyAntrag(pending, { running: true, promulgated: false })).toBe('pending-unverified')
  })
  it('keeps an Antrag at the Bundesrat open while its flag is (status 4, § 23b GOG-NR)', () => {
    expect(classifyAntrag({ status: '4', voteCarried: true }, { running: true, promulgated: false, reading: { filingOpen: true, outcome: null, mergedWith: null } })).toBe('open')
    expect(classifyAntrag({ status: '4', voteCarried: true }, { running: true, promulgated: false, reading: { filingOpen: false, outcome: null, mergedWith: null } })).toBe('decided')
  })
  it('lets a found Kundmachung win', () => {
    expect(classifyAntrag({ status: '5', voteCarried: true }, { running: false, promulgated: true })).toBe('promulgated')
  })
  it('reads an erledigtes Antrag without a carried vote by its record, else as „erledigt"', () => {
    const done = { status: '5', voteCarried: false }
    expect(classifyAntrag(done, { running: true, promulgated: false, reading: { filingOpen: false, outcome: 'rejected', mergedWith: null } })).toBe('rejected')
    expect(classifyAntrag(done, { running: false, promulgated: false, reading: { filingOpen: false, outcome: 'merged', mergedWith: null } })).toBe('merged')
    expect(classifyAntrag(done, { running: false, promulgated: false })).toBe('ended')
  })
  it('lets one still in the house lapse with its period — and a failed second reading stays a rejection', () => {
    expect(classifyAntrag(pending, { running: false, promulgated: false })).toBe('lapsed')
    expect(classifyAntrag({ status: '4', voteCarried: false }, { running: false, promulgated: false, reading: { filingOpen: false, outcome: null, mergedWith: null } })).toBe('lapsed')
    expect(classifyAntrag({ status: '4', voteCarried: false }, { running: false, promulgated: false, reading: { filingOpen: false, outcome: 'rejected', mergedWith: null } })).toBe('rejected')
  })
  it('reads a record only where the row cannot answer', () => {
    expect(needsReading(pending, true, false)).toBe(true)
    expect(needsReading(pending, false, false)).toBe(false)
    expect(needsReading({ status: '5', voteCarried: true }, true, false)).toBe(false)
    expect(needsReading({ status: '5', voteCarried: false }, false, false)).toBe(true)
    expect(needsReading({ status: '5', voteCarried: false }, false, true)).toBe(false)
  })
})

describe('the Antrag row of list 101', () => {
  const ROW = ['XXVIII', 'A', '497', null, '15.10.2025', 'A', 'Fortpflanzungsmedizingesetz, Änderung (GRÜNE)', '497/A', '20251015', '02', '2', 'A', 'N', 'Selbständiger Antrag', '/gegenstand/XXVIII/A/497', null, '2025-10-15T00:00:00', 'ANTR', 'SELBST', '', '["5672"]', '["GRÜNE"]', '[]', '[]', '[]', '', 1, 497, 'XXVIII', 'NR', null, null, null, null, null, null]
  it('carries whether the third reading carried, and no club', () => {
    expect(mapAntragRow(ROW)).toMatchObject({ inr: 497, status: '2', voteCarried: false, title: 'Fortpflanzungsmedizingesetz, Änderung' })
    const voted = [...ROW]
    voted[31] = '1'
    expect(mapAntragRow(voted).voteCarried).toBe(true)
  })
  it('keeps the Kundmachung in Parliament’s spelling, and only on a promulgated row', () => {
    const row = mapAntragRow(ROW)
    expect(antragRowOf(row, 'promulgated', { nummer: 'BGBl. I Nr. 6/2025', datum: '2025-03-01' }).bgbl).toEqual({ number: 'Bundesgesetzblatt I Nr. 6/2025', date: '2025-03-01' })
    expect(antragRowOf(row, 'decided', { nummer: 'BGBl. I Nr. 6/2025', datum: '2025-03-01' }).bgbl).toBeNull()
  })
  it('sorts by participation, then by date — never by outcome', () => {
    const r = (state: AntragRow['state'], date: string, inr: number) => ({ state, date, inr })
    const sorted = [r('rejected', '2026-01-01', 1), r('open', '2025-01-01', 2), r('promulgated', '2025-06-01', 3), r('open', '2025-05-01', 4)].sort(compareAntragRows)
    expect(sorted.map((x) => x.inr)).toEqual([4, 2, 1, 3])
  })
})

function antrag(overrides: Partial<AntragRow> = {}): AntragRow {
  return { gp: 'XXVIII', inr: 497, citation: '497/A', title: 'Fortpflanzungsmedizingesetz, Änderung', date: '2025-10-15', parliamentUrl: 'https://www.parlament.gv.at/gegenstand/XXVIII/A/497', state: 'open', bgbl: null, mergedWith: null, ...overrides }
}

describe('viewOfAntrag — a row under „Alle Initiativanträge"', () => {
  it('is loud only on its own flag, and dates itself by the Einlangen', () => {
    expect(viewOfAntrag(antrag()).state).toEqual({ label: 'Stellungnahme möglich', detail: 'eingebracht am 15.10.2025', tone: 'neutral', actionable: true })
    expect(viewOfAntrag(antrag({ state: 'pending-unverified' })).state).toMatchObject({ label: 'Im Nationalrat in Behandlung', actionable: false })
  })
  it('names each end in one label', () => {
    expect(viewOfAntrag(antrag({ state: 'rejected' })).state.label).toBe('Im Nationalrat abgelehnt')
    expect(viewOfAntrag(antrag({ state: 'lapsed' })).state.label).toBe('Ohne Beschluss – Gesetzgebungsperiode beendet')
    expect(viewOfAntrag(antrag({ state: 'merged' })).state.label).toBe('Miterledigt')
    expect(viewOfAntrag(antrag({ state: 'promulgated', bgbl: { number: 'Bundesgesetzblatt I Nr. 6/2025', date: '2025-03-01' } })).state).toMatchObject({ label: 'Kundgemacht', detail: 'BGBl. I Nr. 6/2025' })
  })
  it('never says „ohne Begutachtung", names no club and links its own page', () => {
    const v = viewOfAntrag(antrag())
    expect(v.note).toBeNull()
    expect(v.ministry).toBeNull()
    expect(v.to).toBe('/entwuerfe/XXVIII/antrag/497')
    expect(v.kindLabel).toBe('Initiativantrag')
    expect(v.participation).toEqual({ kind: 'unasked' })
  })
  it('sorts an open Antrag among the open rows, a closed one by its date', () => {
    const open = antragRow(antrag())
    const closed = antragRow(antrag({ inr: 1, state: 'rejected', date: '2026-01-01' }))
    expect([closed, open].sort((a, b) => compareRowsByFrist(a, b))[0]).toBe(open)
  })
})

describe('the option „Alle Initiativanträge"', () => {
  it('round-trips through the URL as `art=initiativantraege`, and never beside `begutachtung`', () => {
    expect(artChoiceParams('initiativantraege')).toEqual({ art: 'initiativantraege', begutachtung: '' })
    expect(artChoiceOf('initiativantraege', '')).toBe('initiativantraege')
    expect(coherentArt('initiativantraege', 'ohne')).toBe('')
    expect(coherentArt('initiativantraege', 'mit')).toBe('')
    expect(draftFiltersFromQuery({ art: 'initiativantraege' }).art).toBe('initiativantraege')
  })
  it('stands outside „Alle Arten": the default list shows no Antrag row', () => {
    expect(antragRowsOf('')).toBe(false)
    expect(antragRowsOf('ohne')).toBe(false)
    expect(antragRowsOf('initiativantraege')).toBe(true)
    const groups = artSelectFor({ chosen: '', others: false, landSelected: false, unavailable: {} })
    expect(groups.at(-1)).toMatchObject({ label: 'Im Nationalrat', options: [{ value: 'initiativantraege', label: 'Alle Initiativanträge' }, { value: 'staatsvertraege', label: 'Staatsverträge' }] })
  })
  it('holds the Antrag rows and the drafts whose row names their Antrag — nothing else', () => {
    expect(draftRowsOf('initiativantraege')).toEqual({ me: true, ris: false, laender: false })
    expect(choiceAdmitsMinisterialentwurf('initiativantraege', { active: false, chain: { antragCitation: '1065/A' } })).toBe(true)
    expect(choiceAdmitsMinisterialentwurf('initiativantraege', { active: false, chain: null })).toBe(false)
    expect(choiceAdmitsDraft('initiativantraege', 'gesetz')).toBe(false)
    expect(choiceAdmitsOpenVorlage('initiativantraege', 'none')).toBe(false)
    expect(choiceAdmitsBundLaw('initiativantraege', 'antrag')).toBe(false)
    expect(withoutDraftRowsOf('initiativantraege')).toEqual({ vorlagen: false, bundLaws: false, landLaws: false })
  })
  it('is the Bund’s only', () => {
    expect(artUnavailableBySources({ bund: false, landsApply: true, ohneLandsApply: false }).initiativantraege).toBe('nur für Gesetze des Bundes')
    expect(artUnavailableBySources({ bund: true, landsApply: false, ohneLandsApply: false }).initiativantraege).toBeNull()
  })
  it('puts each state at its station', () => {
    expect(antragStationOf('open')).toBe('rv')
    expect(antragStationOf('pending-unverified')).toBe('rv')
    expect(antragStationOf('promulgated')).toBe('bgbl')
    expect(antragStationOf('rejected')).toBe('parlament')
  })
  it('counts them in a term of their own, and says a gap instead of a zero', () => {
    const base = { me: 6, vorlagen: [], ris: null, laterStationsOnly: false, art: 'initiativantraege' as const }
    expect(draftCountLabel({ ...base, antraege: 177 })).toBe('6 Gesetzesentwürfe · 177 Initiativanträge')
    expect(draftCountLabel({ ...base, me: 0, antraege: 'pending' })).toBe('Die Initiativanträge werden noch geladen')
    expect(draftCountLabel({ ...base, antraege: 'failed' })).toBe('6 Gesetzesentwürfe · die Initiativanträge sind gerade nicht abrufbar')
    expect(draftCountLabel({ ...base, me: 0, antraege: 0 })).toBe('0 Initiativanträge')
  })
  it('states each gap in a sentence of its own', () => {
    expect(antragGapNotes({ bgblUnread: false, items: [{ state: 'open' }] })).toEqual([])
    expect(antragGapNotes({ bgblUnread: true, items: [{ state: 'pending-unverified' }, { state: 'pending-unverified' }] })).toEqual([
      'Gerade nicht abrufbar: ob ein Initiativantrag kundgemacht ist.',
      'Gerade nicht abrufbar: ob eine Stellungnahme möglich ist, bei 2 Initiativanträgen.',
    ])
  })
  it('says a period before the Bundesgesetzblatt in RIS cannot be checked — never „gerade"', () => {
    const coversFrom = '2004-01-01'
    expect(antragGapNotes({ gp: 'XXI', coversFrom, bgblUnread: false, items: [{ state: 'decided' }] })).toEqual([
      'Nicht veröffentlicht: Das Bundesgesetzblatt dieser Gesetzgebungsperiode steht nicht im RIS; ob der Antrag kundgemacht wurde, lässt sich deshalb nicht prüfen.',
    ])
    expect(antragGapNotes({ gp: 'XXII', coversFrom, bgblUnread: false, items: [] })).toEqual([
      'Nicht veröffentlicht: Das Bundesgesetzblatt steht im RIS erst ab 2004; ob ein Initiativantrag vor dem 01.01.2004 kundgemacht wurde, lässt sich deshalb nicht prüfen.',
    ])
    expect(antragGapNotes({ gp: 'XXIII', coversFrom, bgblUnread: false, items: [] })).toEqual([])
  })
})

function record(name: string): VorlageContent {
  return JSON.parse(readFileSync(new URL(`./fixtures/vorlage/${name}.json`, import.meta.url), 'utf8')).content
}

function enactment(): EnactmentInfo {
  return {
    rvCitation: '372/A', rvUrl: 'https://www.parlament.gv.at/gegenstand/XXVIII/A/372', rvTextUrl: null, rvDate: '2025-07-09', furtherRv: [],
    bgblNumber: 'Bundesgesetzblatt I Nr. 56/2025', bgblRisUrl: null, amendedIn: [], committeeReport: null, plenaryAmendments: null,
    houseStatus: '5', houseStatusText: 'Beschlossen im Bundesrat', vote: null, filingOpen: false, rvGpEnded: false, notPromulgated: null, successor: null,
  }
}

/* An Antrag's page record, renumbered: the fixture is 372/A, the cases are
 * the table's 72/A (XXVIII, a part of 6/ME) and 2173/A (XXVII, all of 164/ME). */
function antragDetail(gp: string, inr: number): VorlageDetail {
  return {
    ...assembleVorlageDetail({ root: { gp: 'XXVIII', ityp: 'A', inr: 372 }, content: record('XXVIII-A-372'), enactment: enactment(), currentGp: 'XXVIII', withoutBegutachtung: false }),
    gp,
    inr,
    withoutBegutachtung: false,
    committeeConsultation: null,
  }
}

describe('an Antrag that carries a consulted draft’s text (decision 9)', () => {
  it('finds the draft from the Antrag', () => {
    expect(draftOfAntrag('XXVIII', 72)).toMatchObject({ gp: 'XXVIII', inr: 6 })
    expect(draftOfAntrag('XXVII', 2173)).toMatchObject({ gp: 'XXVII', inr: 164 })
    expect(draftOfAntrag('XXVIII', 497)).toBeNull()
  })
  it('words the row by the match', () => {
    const full = carriedDraftDe(antragDetail('XXVII', 2173))!
    expect(full.carries).toBe(true)
    expect(`${full.line.before}${full.line.link.label}${full.line.after}`).toBe('Der Text dieses Antrags ist der des Ministerialentwurfs 164/ME, der begutachtet wurde.')
    expect(full.line.link.href).toBe('/entwuerfe/XXVII/164')
    const part = carriedDraftDe(antragDetail('XXVIII', 72))!
    expect(part.carries).toBe(false)
    expect(`${part.line.before}${part.line.link.label}${part.line.after}`).toBe('Ein Teil dieses Antrags steht wörtlich im Ministerialentwurf 6/ME.')
    expect(carriedDraftDe(antragDetail('XXVIII', 497))).toBeNull()
  })
  it('shows the draft’s Begutachtung as reached only where the Antrag carries the draft', () => {
    expect(vorlageStations(antragDetail('XXVII', 2173))[0]).toMatchObject({ state: 'done', facts: ['Ministerialentwurf 164/ME'] })
    expect(vorlageStations(antragDetail('XXVIII', 72))[0]).toMatchObject({ state: 'never', trail: 'unknown', facts: ['nicht feststellbar', 'für den Antrag als Ganzes'] })
    // The sentence naming the draft is the frame's row, once — not the station's follow-up too.
    expect(vorlageStations(antragDetail('XXVIII', 72))[0]!.followUp).toBeUndefined()
    expect(vorlageStations(antragDetail('XXVII', 2173))[0]!.followUp).toBeUndefined()
  })
  it('opens the frame with the row, and credits the match by wording', () => {
    const carried = carriedDraftDe(antragDetail('XXVII', 2173))!.line
    const view = entwurfFrameView({ carried })
    expect(view.facts[0]).toEqual({ key: 'begutachtet', title: 'Ministerialentwurf' })
    expect(entwurfFrameCredits({}, view).items).toContain('Ministerialentwurf über den Wortlaut zugeordnet, das Parlament verweist nicht darauf')
  })
})

describe('a Miterledigung is neither a decision nor a lapse (14.11.2026)', () => {
  // Parliament's wording, read 14.11.2026: the committee's form (XXVII/34/A,
  // XXVI/496) and the plenary's (XXVII/60/A).
  const COMMITTEE = 'Verfassungsausschuss: Miterledigt mit Bericht <a href="/gegenstand/XXVII/I/1637">1637 d.B.</a>'
  const PLENARY = 'Auf der Tagesordnung der <a href="/gegenstand/XXVII/NRSITZ/249">249. Sitzung des Nationalrates</a><br>Miterledigung'
  it('reads the item it went with, where the record names one', () => {
    expect(mergedWithCitation(COMMITTEE)).toBe('1637 d.B.')
    expect(mergedWithCitation('Miterledigt mit Bericht 565 d.B.')).toBe('565 d.B.')
    expect(mergedWithCitation(PLENARY)).toBeNull()
    expect(mergedDe('565 d.B.')).toBe('Mit 565 d.B. miterledigt')
    expect(mergedDe(null)).toBe('Miterledigt')
  })
  it('falls back to the Verlauf where the status names the plenary only (XXVI/496)', () => {
    const status = 'Auf der Tagesordnung der <a href="/gegenstand/XXVI/NRSITZ/72">72. Sitzung des Nationalrates</a> Miterledigung'
    const phases = [{ stages: [
      { text: 'Ausschuss für Wirtschaft, Industrie und Energie: Miterledigt mit Bericht <a href="/gegenstand/XXVI/I/565">565 d.B.</a>' },
      { text: status },
    ] }]
    expect(mergedWithOf(status, phases)).toBe('565 d.B.')
    expect(mergedWithOf('Zugewiesen an: Verfassungsausschuss', phases)).toBeNull()
    expect(readAntragDetail({ statementsstate: '0', status: { description: status }, phase: phases }).mergedWith).toBe('565 d.B.')
  })
  it('is its own house outcome, ahead of every other word', () => {
    expect(houseOutcomeOf('5', COMMITTEE)).toBe('merged')
    expect(houseOutcomeOf('5', PLENARY)).toBe('merged')
  })
  it('heads the item’s page instead of „Ohne Beschluss – Gesetzgebungsperiode beendet"', () => {
    const lapsedTemplate = antragDetail('XXVII', 34)
    const d = { ...lapsedTemplate, enactment: { ...lapsedTemplate.enactment, bgblNumber: null, houseStatusText: COMMITTEE, rvGpEnded: true, amendedIn: [] } }
    expect(vorlageStatusDe(d)).toBe('Mit 1637 d.B. miterledigt')
    const parlament = vorlageStations(d).find((s) => s.id === 'parlament')!
    expect(parlament).toMatchObject({ state: 'done', facts: ['mit 1637 d.B. miterledigt'] })
    expect(vorlageStations(d).find((s) => s.id === 'bgbl')).toMatchObject({ state: 'never', facts: [] })
  })
  it('names the item on the list’s row', () => {
    expect(readAntragDetail({ statementsstate: '0', status: { description: COMMITTEE } })).toEqual({ filingOpen: false, outcome: 'merged', mergedWith: '1637 d.B.' })
    expect(viewOfAntrag(antrag({ state: 'merged', mergedWith: '1637 d.B.' })).state.label).toBe('Mit 1637 d.B. miterledigt')
    expect(viewOfAntrag(antrag({ state: 'merged', mergedWith: null })).state.label).toBe('Miterledigt')
  })
})
