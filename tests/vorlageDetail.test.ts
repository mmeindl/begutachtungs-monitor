import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { EnactmentInfo, VorlageDetail } from '../shared/types'
import {
  assembleVorlageDetail,
  draftOfPreconst,
  isPageItem,
  ministryOf,
  moverClubsOf,
  officialTitleOf,
  type VorlageContent,
} from '../server/utils/parliament/vorlageDetailAssembly'
import { vorlageStations, vorlageStatusDe } from '../app/utils/spine'

function record(name: string): VorlageContent {
  return JSON.parse(readFileSync(new URL(`./fixtures/vorlage/${name}.json`, import.meta.url), 'utf8')).content
}

function enactment(overrides: Partial<EnactmentInfo> = {}): EnactmentInfo {
  return {
    rvCitation: '372/A',
    rvUrl: 'https://www.parlament.gv.at/gegenstand/XXVIII/A/372',
    rvTextUrl: null,
    rvDate: '2025-07-09',
    furtherRv: [],
    bgblNumber: 'Bundesgesetzblatt I Nr. 56/2025',
    bgblRisUrl: null,
    amendedIn: ['ausschuss', 'plenum'],
    committeeReport: null,
    plenaryAmendments: null,
    houseStatus: '5',
    houseStatusText: 'Beschlossen im Bundesrat',
    vote: null,
    filingOpen: false,
    rvGpEnded: false,
    notPromulgated: null,
    successor: null,
    ...overrides,
  }
}

describe('which items get the page', () => {
  it('takes a Regierungsvorlage and a law’s Antrag, nothing else of those types', () => {
    expect(isPageItem('I', 'RV')).toBe(true)
    expect(isPageItem('A', 'A')).toBe(true)
    expect(isPageItem('I', 'AUB')).toBe(false) // an Ausschussbericht
    expect(isPageItem('A', 'A(E)')).toBe(false) // an Entschließungsantrag
    expect(isPageItem('I', null)).toBe(false)
  })
  it('finds the draft a Vorlage names, to redirect there', () => {
    expect(draftOfPreconst([{ gp_code: 'XXVIII', ityp: 'ME', inr: 2 }])).toEqual({ gp: 'XXVIII', inr: 2 })
    expect(draftOfPreconst([{ gp_code: 'XXVIII', ityp: 'A', inr: 2 }])).toBeNull()
    expect(draftOfPreconst(null)).toBeNull()
  })
})

describe('who brought it in', () => {
  it('names a Vorlage’s Ressort as Parliament does', () => {
    expect(ministryOf(record('XXVIII-I-589').names)).toBe('Bundesministerium für Arbeit, Soziales, Gesundheit, Pflege und Konsumentenschutz')
    expect(ministryOf(record('XXVIII-A-372').names)).toBeNull()
  })
  it('names an Antrag’s movers by club only, from the vote where it has one', () => {
    expect(moverClubsOf(record('XXVIII-A-1007').names, record('XXVIII-A-1007').vote)).toEqual(['ÖVP', 'SPÖ', 'NEOS'])
    // 372/A was decided by namentliche Abstimmung — no club list to read.
    expect(moverClubsOf(record('XXVIII-A-372').names, record('XXVIII-A-372').vote)).toEqual(['ÖVP', 'SPÖ', 'NEOS'])
  })
  it('names no club rather than some of them', () => {
    expect(moverClubsOf([{ funktext: 'Eingebracht von', frak_code: 'V' }, { funktext: 'Eingebracht von', frak_code: 'X' }], null)).toBeNull()
    expect(moverClubsOf([], null)).toBeNull()
  })
  it('takes the Antrag’s official title without its movers', () => {
    const t = officialTitleOf('A', record('XXVIII-A-372').description)
    expect(t).toBe('Bundesgesetz, mit dem das Waffengesetz 1996 geändert wird')
    expect(officialTitleOf('A', 'Antrag der Abgeordneten X betreffend Pensionen')).toBeNull()
    expect(officialTitleOf('I', record('XXVIII-I-589').description)).toBe('Bundesgesetz, mit dem das Behinderteneinstellungsgesetz geändert wird')
  })
})

describe('assembleVorlageDetail', () => {
  const detail = (name: string, ityp: 'I' | 'A', inr: number, e = enactment(), withoutBegutachtung = true): VorlageDetail =>
    assembleVorlageDetail({ root: { gp: 'XXVIII', ityp, inr }, content: record(name), enactment: e, currentGp: 'XXVIII', withoutBegutachtung })

  it('reads an Antrag’s record into the page', () => {
    const d = detail('XXVIII-A-372', 'A', 372)
    expect(d).toMatchObject({ citation: '372/A', title: 'Waffengesetz, Änderung', arrivedAt: '2025-07-09', ministry: null, draftPath: null, gpEnded: false })
    expect(d.parliamentUrl).toBe('https://www.parlament.gv.at/gegenstand/XXVIII/A/372')
    expect(d.textEvolution.map((t) => t.title)).toEqual(['Geändert im Ausschuss', 'Geändert im Plenum'])
    expect(d.enactment.rvTextUrl).toBe('https://www.parlament.gv.at/dokument/XXVIII/A/372/fname_1702313.pdf')
  })
  it('lists a Vorlage unchanged by parliament with no later versions', () => {
    const d = detail('XXVIII-I-589', 'I', 589, enactment({ rvCitation: '589 d.B.', amendedIn: [] }))
    expect(d.citation).toBe('589 d.B.')
    expect(d.textEvolution).toEqual([])
    expect(d.documents.map((x) => x.title)).toEqual(['Gesetzestext', 'Erläuterungen', 'Vorblatt und WFA', 'Textgegenüberstellung'])
  })
})

describe('vorlageStations', () => {
  const d = (overrides: Partial<VorlageDetail> = {}): VorlageDetail => ({
    ...assembleVorlageDetail({ root: { gp: 'XXVIII', ityp: 'A', inr: 372 }, content: record('XXVIII-A-372'), enactment: enactment(), currentGp: 'XXVIII', withoutBegutachtung: true }),
    ...overrides,
  })

  it('has no Begutachtung station, not even an empty one', () => {
    expect(vorlageStations(d()).map((s) => s.id)).toEqual(['rv', 'parlament', 'bgbl'])
  })
  it('names the first station by the item and carries the fact only on evidence', () => {
    const [first] = vorlageStations(d(), { statementTotal: 466 })
    expect(first).toMatchObject({ name: 'Initiativantrag', state: 'done', facts: ['09.07.2025', 'ohne Begutachtung', '466 Stellungnahmen'] })
    expect(vorlageStations(d({ withoutBegutachtung: false }))[0]!.facts).toEqual(['09.07.2025'])
  })
  it('says what a draft’s page says about Parlament and Bundesgesetzblatt', () => {
    const [, parlament, bgbl] = vorlageStations(d())
    expect(parlament).toMatchObject({ state: 'done', facts: ['im Ausschuss und im Plenum geändert'] })
    expect(bgbl).toMatchObject({ state: 'done', facts: ['BGBl. I Nr. 56/2025'] })
    expect(vorlageStatusDe(d())).toBe('Gesetz geworden')
  })
  it('heads an open Vorlage’s card as a draft’s page heads its Vorlage', () => {
    const open = d({ enactment: enactment({ bgblNumber: null, houseStatus: '2', houseStatusText: null, amendedIn: [], filingOpen: true }) })
    expect(vorlageStatusDe(open)).toBe('Im Parlament')
    expect(vorlageStations(open)[1]).toMatchObject({ state: 'current', facts: ['in Behandlung'] })
  })
})
