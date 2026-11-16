import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { EnactmentInfo, VorlageDetail } from '../shared/types'
import {
  assembleVorlageDetail,
  bundesratVariantOf,
  committeeOfDescription,
  draftOfPreconst,
  ministryOf,
  moverClubsOf,
  officialTitleOf,
  pageKindOf,
  parentConsulted,
  relatedItemsOf,
  type VorlageContent,
} from '../server/utils/parliament/vorlageDetailAssembly'
import { parliamentStandDe, vorlageStations, vorlageStatusDe } from '../app/utils/spine'
import { itemBylineDe, itemCiteAsDe, itemCopyDe } from '../app/utils/itemKind'
import { wegFor } from '../app/utils/wege'

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
  it('takes a Regierungsvorlage, a law’s Antrag and a committee’s motion, nothing else of those types', () => {
    expect(pageKindOf('I', 'RV')).toBe('regierungsvorlage')
    expect(pageKindOf('A', 'A')).toBe('initiativantrag')
    expect(pageKindOf('I', 'BUA')).toBe('ausschussantrag')
    expect(pageKindOf('I', ' BUA ')).toBe('ausschussantrag')
    expect(pageKindOf('I', 'AUB')).toBeNull() // an Ausschussbericht
    expect(pageKindOf('A', 'A(E)')).toBeNull() // an Entschließungsantrag
    expect(pageKindOf('A', 'RV')).toBeNull() // the document type of the other item type
    expect(pageKindOf('I', null)).toBeNull()
  })
  it('takes the Bundesrat’s motions since 14.11.2026, and tells who moved them', () => {
    expect(pageKindOf('I', 'GABR')).toBe('bundesratsantrag')
    expect(pageKindOf('I', 'GABR13')).toBe('bundesratsantrag')
    expect(pageKindOf('A', 'GABR')).toBeNull()
    expect(bundesratVariantOf('GABR')).toBe('bundesrat')
    expect(bundesratVariantOf(' GABR13 ')).toBe('drittel')
    expect(bundesratVariantOf('RV')).toBeNull()
    expect(bundesratVariantOf(null)).toBeNull()
  })
  it('does not follow an Einspruch on a page of its own; a treaty has one since step 5', () => {
    expect(pageKindOf('I', 'EBR')).toBeNull()
    expect(pageKindOf('I', 'RVS')).toBe('staatsvertrag')
    expect(pageKindOf('A', 'RVS')).toBeNull()
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

describe('a committee’s motion (BUA, 14.11.2026)', () => {
  it('reads the committee from the description, in the nominative', () => {
    // The three descriptions as read on 14.11.2026 (14, 365, 683 d.B. XXVIII).
    expect(committeeOfDescription('Bericht und Antrag des Budgetausschusses über den Entwurf eines Bundesgesetzes, mit dem das Bundesbezügegesetz geändert wird'))
      .toBe('Budgetausschuss')
    expect(committeeOfDescription('Bericht und Antrag des Ausschusses für Wirtschaft, Industrie und Energie über den Entwurf eines Bundesgesetzes, mit dem das Erneuerbaren-Ausbau-Gesetz (EAG) und das Ökostromgesetz 2012 (ÖSG 2012) geändert werden'))
      .toBe('Ausschuss für Wirtschaft, Industrie und Energie')
    expect(committeeOfDescription('Bericht und Antrag des Verfassungsausschusses über den Entwurf eines Bundesgesetzes, mit dem das KommAustria-Gesetz geändert wird'))
      .toBe('Verfassungsausschuss')
  })
  it('names no committee where the sentence has another shape', () => {
    expect(committeeOfDescription('Bericht und Antrag des Ständigen Unterausschusses über den Entwurf eines Bundesgesetzes')).toBeNull()
    expect(committeeOfDescription('Bundesgesetz, mit dem das Behinderteneinstellungsgesetz geändert wird')).toBeNull()
    expect(committeeOfDescription(null)).toBeNull()
  })
  it('takes the bill’s title out of the description', () => {
    expect(officialTitleOf('I', record('XXVIII-I-14').description)).toBe('Bundesgesetz, mit dem das Bundesbezügegesetz geändert wird')
    expect(officialTitleOf('I', 'Bericht und Antrag des Budgetausschusses betreffend etwas anderes')).toBeNull()
  })
  it('lists „Bezug zu" as Parliament names it', () => {
    expect(relatedItemsOf(record('XXVIII-I-14').reference)).toEqual([
      { gp: 'XXVIII', ityp: 'A', inr: 14, citation: '14/A', title: '2. Dienstrechts-Novelle 2024', kind: null, path: null, consultedDraft: null },
    ])
    expect(relatedItemsOf(record('XXVIII-I-365').reference).map((r) => `${r.ityp} ${r.citation}`)).toEqual(['I 312 d.B.', 'GAA 3/GAA'])
    expect(relatedItemsOf([{ text: 'Siehe auch', url: '/gegenstand/XXVIII/A/1' }, { text: 'Bezug zu', url: 'https://example.org/gegenstand/XXVIII/A/1' }])).toEqual([])
  })

  const bua = (name: string, inr: number, overrides: Partial<VorlageDetail> = {}): VorlageDetail => ({
    ...assembleVorlageDetail({
      root: { gp: 'XXVIII', ityp: 'I', inr },
      content: record(name),
      enactment: enactment({ rvCitation: `${inr} d.B.`, bgblNumber: null, houseStatus: '2', houseStatusText: null, amendedIn: [] }),
      currentGp: 'XXVIII',
      withoutBegutachtung: false,
    }),
    ...overrides,
  })

  it('assembles the page: kind, committee, no Ressort, no Berichterstatter', () => {
    const d = bua('XXVIII-I-14', 14)
    expect(d).toMatchObject({ itemKind: 'ausschussantrag', citation: '14 d.B.', committee: 'Budgetausschuss', ministry: null, moverClubs: null, draftPath: null })
    // `names[]` holds only the Berichterstatter: nothing of it reaches the page.
    expect(JSON.stringify(d)).not.toContain('Berichterstatter')
    expect(itemBylineDe(d)).toBe('Eingebracht vom Budgetausschuss des Nationalrates')
    expect(itemBylineDe({ ...d, committee: null })).toBe('Eingebracht von einem Ausschuss des Nationalrates')
    expect(itemCiteAsDe(d)).toBe('AB 14 BlgNR 28. GP')
  })
  it('draws „Regierungsvorlage" pale, enters at „Parlament", and says „nicht feststellbar" for the Begutachtung, with the parent linked', () => {
    const related = [{ gp: 'XXVIII', ityp: 'A', inr: 14, citation: '14/A', title: null, kind: 'initiativantrag' as const, path: '/entwuerfe/XXVIII/antrag/14', consultedDraft: null }]
    const [begutachtung, item] = vorlageStations(bua('XXVIII-I-14', 14, { relatedItems: related }))
    expect(begutachtung).toMatchObject({ state: 'never', trail: 'unknown', facts: ['nicht feststellbar', 'ob ein Ministerialentwurf vorausging, ist hier nicht belegt'] })
    expect(begutachtung!.followUp).toEqual({ before: 'Bezug zu ', link: { href: '/entwuerfe/XXVIII/antrag/14', label: 'Initiativantrag 14/A →' }, after: '' })
    // A motion has no third station (16.11.2026): pale, with its reason.
    expect(item).toMatchObject({ id: 'rv', name: 'Regierungsvorlage', state: 'never', trail: 'not-walked', facts: ['keine', 'Antrag eines Ausschusses'] })
    expect(vorlageStations(bua('XXVIII-I-14', 14))[2]!.facts[0]).toBe('Ausschussantrag')
    // A parent without a page of ours: no line.
    expect(vorlageStations(bua('XXVIII-I-14', 14))[0]!.followUp).toBeUndefined()
  })
  it('reads a parent\'s own record for a Begutachtung behind it: its draft, or its committee\'s consultation', () => {
    expect(parentConsulted({ preconst: [{ ityp: 'ME', gp_code: 'XXVIII', inr: 32 }] })).toBe(true)
    expect(parentConsulted({ preconst: null, phase: null })).toBe(false)
    expect(parentConsulted(record('XXVIII-I-14'))).toBe(false)
  })
  it('says „ohne Begutachtung" only where the list classed the law `none`', () => {
    const related = [{ gp: 'XXVIII', ityp: 'A', inr: 14, citation: '14/A', title: null, kind: 'initiativantrag' as const, path: '/entwuerfe/XXVIII/antrag/14', consultedDraft: null }]
    const [begutachtung] = vorlageStations(bua('XXVIII-I-14', 14, { relatedItems: related, withoutBegutachtung: true }))
    expect(begutachtung).toMatchObject({ state: 'never', trail: 'not-walked', facts: ['ohne Begutachtung', 'kein Ministerialentwurf'] })
    expect(begutachtung!.followUp?.link?.href).toBe('/entwuerfe/XXVIII/antrag/14')
  })
  it('names a consulted parent and links its draft — never „nicht belegt", never „ohne Begutachtung"', () => {
    // 365 d.B. → 312 d.B., whose record names XXVIII/32/ME.
    const rv = { gp: 'XXVIII', ityp: 'I', inr: 312, citation: '312 d.B.', title: null, kind: 'regierungsvorlage' as const, path: '/entwuerfe/XXVIII/32', consultedDraft: { gp: 'XXVIII', inr: 32, path: '/entwuerfe/XXVIII/32' } }
    const gaa = { gp: 'XXVIII', ityp: 'GAA', inr: 3, citation: '3/GAA', title: null, kind: null, path: null, consultedDraft: null }
    for (const withoutBegutachtung of [false, true]) {
      const [begutachtung] = vorlageStations(bua('XXVIII-I-365', 365, { relatedItems: [rv, gaa], withoutBegutachtung }))
      expect(begutachtung).toMatchObject({ state: 'never', trail: 'unknown', facts: ['nicht feststellbar', 'für den Text des Ausschusses'] })
      expect(begutachtung!.followUp).toEqual({
        before: 'Der Ausschussantrag bezieht sich auf die Regierungsvorlage 312 d.B., deren ',
        link: { href: '/entwuerfe/XXVIII/32', label: 'Ministerialentwurf' },
        after: ' in Begutachtung war.',
      })
      expect(JSON.stringify(begutachtung)).not.toContain('nicht belegt')
    }
    // An Antrag that carries a consulted draft's text.
    const antrag = { gp: 'XXVIII', ityp: 'A', inr: 72, citation: '72/A', title: null, kind: 'initiativantrag' as const, path: '/entwuerfe/XXVIII/antrag/72', consultedDraft: { gp: 'XXVIII', inr: 6, path: '/entwuerfe/XXVIII/6' } }
    const line = vorlageStations(bua('XXVIII-I-14', 14, { relatedItems: [antrag] }))[0]!.followUp!
    expect(`${line.before}${line.link!.label}${line.after}`).toBe('Der Ausschussantrag bezieht sich auf den Initiativantrag 72/A, in dem Text eines begutachteten Ministerialentwurfs steht.')
    expect(line.link!.href).toBe('/entwuerfe/XXVIII/6')
  })
  it('says nothing about a Regierungsvorlage in „Im Parlament"', () => {
    const d = bua('XXVIII-I-365', 365, { enactment: enactment({ rvCitation: '365 d.B.', bgblNumber: null, houseStatus: '3', houseStatusText: null, amendedIn: [] }) })
    expect(parliamentStandDe(d, '2026-11-14', 'ausschussantrag')).not.toContain('Regierungsvorlage')
    expect(vorlageStatusDe(d)).toBe('Im Parlament')
  })
  it('walks its own row on /wege', () => {
    expect(wegFor({ source: 'vorlage', ityp: 'I', withoutBegutachtung: false, itemKind: 'ausschussantrag' })).toBe('ausschussantrag')
    expect(wegFor({ source: 'vorlage', ityp: 'I', withoutBegutachtung: false, itemKind: 'regierungsvorlage' })).toBeNull()
  })
})

describe('assembleVorlageDetail', () => {
  const detail = (name: string, ityp: 'I' | 'A', inr: number, e = enactment(), withoutBegutachtung = true): VorlageDetail =>
    assembleVorlageDetail({ root: { gp: 'XXVIII', ityp, inr }, content: record(name), enactment: e, currentGp: 'XXVIII', withoutBegutachtung })

  it('reads an Antrag’s record into the page', () => {
    const d = detail('XXVIII-A-372', 'A', 372)
    expect(d).toMatchObject({ itemKind: 'initiativantrag', citation: '372/A', title: 'Waffengesetz, Änderung', arrivedAt: '2025-07-09', ministry: null, committee: null, draftPath: null, gpEnded: false })
    expect(d.parliamentUrl).toBe('https://www.parlament.gv.at/gegenstand/XXVIII/A/372')
    expect(d.textEvolution.map((t) => t.title)).toEqual(['Geändert im Ausschuss', 'Geändert im Plenum'])
    expect(d.enactment.rvTextUrl).toBe('https://www.parlament.gv.at/dokument/XXVIII/A/372/fname_1702313.pdf')
  })
  it('lists a Vorlage unchanged by parliament with no later versions', () => {
    const d = detail('XXVIII-I-589', 'I', 589, enactment({ rvCitation: '589 d.B.', amendedIn: [] }))
    expect(d.citation).toBe('589 d.B.')
    expect(d.itemKind).toBe('regierungsvorlage')
    expect(itemBylineDe(d)).toBe('Eingebracht von der Bundesregierung, Bundesministerium für Arbeit, Soziales, Gesundheit, Pflege und Konsumentenschutz')
    expect(itemCiteAsDe(d)).toBe('RV 589 BlgNR 28. GP')
    expect(d.textEvolution).toEqual([])
    expect(d.documents.map((x) => x.title)).toEqual(['Gesetzestext', 'Erläuterungen', 'Vorblatt und WFA', 'Textgegenüberstellung'])
  })
})

describe('vorlageStations', () => {
  const d = (overrides: Partial<VorlageDetail> = {}): VorlageDetail => ({
    ...assembleVorlageDetail({ root: { gp: 'XXVIII', ityp: 'A', inr: 372 }, content: record('XXVIII-A-372'), enactment: enactment(), currentGp: 'XXVIII', withoutBegutachtung: true }),
    // 372/A's committee did consult (see below); these cases are about the rest.
    withoutBegutachtung: true,
    committeeConsultation: null,
    ...overrides,
  })

  it('opens with a pale Begutachtung station, „ohne Begutachtung" only on the list’s evidence', () => {
    expect(vorlageStations(d()).map((s) => s.id)).toEqual(['begutachtung', 'rv', 'parlament', 'bgbl'])
    expect(vorlageStations(d())[0]).toMatchObject({ name: 'Begutachtung', state: 'never', facts: ['ohne Begutachtung', 'kein Ministerialentwurf'] })
    expect(vorlageStations(d({ withoutBegutachtung: false }))[0]).toMatchObject({ state: 'never', trail: 'unknown', facts: ['nicht feststellbar', 'ob ein Ministerialentwurf vorausging, ist hier nicht belegt'] })
    expect(vorlageStations(d())[0]!.trail).toBe('not-walked')
  })
  it('draws a motion’s „Regierungsvorlage" pale and lets the motion enter at „Parlament" (16.11.2026)', () => {
    const [, rv, parlament] = vorlageStations(d(), { statementTotal: 466, amendedLawCount: 1, showsAnnex: true })
    expect(rv).toMatchObject({ id: 'rv', name: 'Regierungsvorlage', state: 'never', trail: 'not-walked', facts: ['keine', 'Antrag von Abgeordneten'], comparison: null })
    // The arrival first, what it changes, the house's record, the count last.
    expect(parlament).toMatchObject({ id: 'parlament', facts: ['Initiativantrag', '09.07.2025', 'ändert 1 Gesetz', 'im Ausschuss und im Plenum geändert', '466 Stellungnahmen'] })
    expect(parlament!.arrivalComparison).toEqual({ id: 'vorschlag', question: 'Was ändert der Entwurf?' })
    expect(parlament!.comparison).toMatchObject({ id: 'parlament' })
    // „ohne Begutachtung" stands on the first station only.
    expect(JSON.stringify(parlament)).not.toContain('ohne Begutachtung')
  })
  it('keeps a Regierungsvorlage’s own third station, named by the item', () => {
    const rv = assembleVorlageDetail({ root: { gp: 'XXVIII', ityp: 'I', inr: 589 }, content: record('XXVIII-I-589'), enactment: enactment({ rvCitation: '589 d.B.', amendedIn: [] }), currentGp: 'XXVIII', withoutBegutachtung: true })
    const [, item, parlament] = vorlageStations(rv, { statementTotal: 3 })
    expect(item).toMatchObject({ id: 'rv', name: 'Regierungsvorlage', state: 'done', facts: ['08.07.2026', '3 Stellungnahmen'] })
    expect(item!.trail).toBeUndefined()
    expect(parlament!.facts).toEqual(['Text unverändert beschlossen'])
  })
  it('keeps „Parlament" reached for a motion that lapsed with its period', () => {
    const lapsed = d({ gpEnded: true, enactment: enactment({ bgblNumber: null, houseStatus: '2', houseStatusText: null, amendedIn: [], rvGpEnded: true }) })
    expect(vorlageStations(lapsed)[2]).toMatchObject({ state: 'done', facts: ['Initiativantrag', '09.07.2025', 'GP beendet'] })
    expect(vorlageStations(lapsed)[3]).toMatchObject({ state: 'never', facts: [] })
  })
  it('says what a draft’s page says about Parlament and Bundesgesetzblatt', () => {
    const [, , parlament, bgbl] = vorlageStations(d())
    expect(parlament).toMatchObject({ state: 'done', facts: ['Initiativantrag', '09.07.2025', 'im Ausschuss und im Plenum geändert'] })
    expect(bgbl).toMatchObject({ state: 'done', facts: ['BGBl. I Nr. 56/2025'] })
    expect(vorlageStatusDe(d())).toBe('Gesetz geworden')
  })
  it('heads an open Vorlage’s card as a draft’s page heads its Vorlage', () => {
    const open = d({ enactment: enactment({ bgblNumber: null, houseStatus: '2', houseStatusText: null, amendedIn: [], filingOpen: true }) })
    expect(vorlageStatusDe(open)).toBe('Im Parlament')
    expect(vorlageStations(open)[2]).toMatchObject({ state: 'current', facts: ['Initiativantrag', '09.07.2025', 'in Behandlung'] })
  })

  /* A record without a text list (14.11.2026): 306 of GP XXVII carry no
     `statements` key, so `amendedStationsOf` gives null and the page's own
     list is empty. Whether the committee changed the text is unknown —
     1106/A of GP XXVII read „Text unverändert beschlossen". */
  describe('where the record carries no text list', () => {
    const withoutList = (name: string, ityp: 'I' | 'A', inr: number, e: EnactmentInfo): VorlageDetail => {
      const { statements: _, ...content } = record(name) as VorlageContent & { statements?: unknown }
      return {
        ...assembleVorlageDetail({ root: { gp: 'XXVIII', ityp, inr }, content, enactment: e, currentGp: 'XXVIII', withoutBegutachtung: true }),
        committeeConsultation: null,
      }
    }
    const motion = { session: null, amendments: [{ label: 'AA-24', url: 'https://www.parlament.gv.at/gegenstand/XXVIII/AA/24' }] }

    it('says „beschlossen" for an Antrag and for a Regierungsvorlage, never „unverändert"', () => {
      const antrag = withoutList('XXVIII-A-372', 'A', 372, enactment({ amendedIn: null }))
      expect(antrag.textEvolution).toEqual([])
      expect(vorlageStations(antrag)[2]).toMatchObject({ state: 'done', facts: ['Initiativantrag', '09.07.2025', 'beschlossen'] })
      expect(parliamentStandDe(antrag, undefined, 'antrag')).toBe('Der Nationalrat hat den Text beschlossen.')

      const rv = withoutList('XXVIII-I-589', 'I', 589, enactment({ rvCitation: '589 d.B.', amendedIn: null }))
      expect(vorlageStations(rv)[2]).toMatchObject({ state: 'done', facts: ['beschlossen'] })
      expect(parliamentStandDe(rv, undefined, 'rv')).toBe('Der Nationalrat hat den Text beschlossen.')
    })

    it('still says „im Plenum geändert" where the plenary adopted an Abänderungsantrag', () => {
      const antrag = withoutList('XXVIII-A-372', 'A', 372, enactment({ amendedIn: null, plenaryAmendments: motion }))
      expect(vorlageStations(antrag)[2]).toMatchObject({ facts: ['Initiativantrag', '09.07.2025', 'im Plenum geändert'] })
    })

    it('keeps „Text unverändert beschlossen" where the list is there and names no change', () => {
      const rv = withoutList('XXVIII-I-589', 'I', 589, enactment({ rvCitation: '589 d.B.', amendedIn: [] }))
      expect(vorlageStations(rv)[2]).toMatchObject({ facts: ['Text unverändert beschlossen'] })
      expect(parliamentStandDe(rv, undefined, 'rv')).toBe('Der Nationalrat hat den Text der Regierungsvorlage unverändert beschlossen.')
    })
  })
})

describe('the committee’s own consultation (10.11.2026)', () => {
  const at = (name: string, ityp: 'I' | 'A', inr: number) =>
    assembleVorlageDetail({ root: { gp: 'XXVIII', ityp, inr }, content: record(name), enactment: enactment(), currentGp: 'XXVIII', withoutBegutachtung: true })
  it('is read from the item’s Verlauf — 309 d.B. and 372/A, not 589 d.B.', () => {
    expect(at('XXVIII-I-309', 'I', 309).committeeConsultation).toEqual({ committee: 'Ausschuss für Wirtschaft, Industrie und Energie', date: '2025-11-20', invited: 99 })
    expect(at('XXVIII-A-372', 'A', 372).committeeConsultation).toEqual({ committee: 'Ausschuss für innere Angelegenheiten', date: '2025-09-04', invited: 58 })
    expect(at('XXVIII-I-589', 'I', 589).committeeConsultation).toBeNull()
  })
  it('outranks the list: never „ohne Begutachtung" beside it', () => {
    expect(at('XXVIII-A-372', 'A', 372).withoutBegutachtung).toBe(false)
    expect(at('XXVIII-I-589', 'I', 589).withoutBegutachtung).toBe(true)
  })
  it('makes the Begutachtung station an ordinary one, with Parliament’s word, and says it nowhere else', () => {
    const [begutachtung, item, parlament] = vorlageStations(at('XXVIII-A-372', 'A', 372))
    expect(begutachtung).toMatchObject({ state: 'done', facts: ['Ausschussbegutachtung', 'Ausschuss für innere Angelegenheiten', 'beschlossen am 04.09.2025', '58 Stellen angeschrieben'] })
    expect(item!.facts).not.toContain('ohne Begutachtung')
    expect(parlament!.facts).not.toContain('Ausschussbegutachtung')
  })
})

describe('a motion of the Bundesrat (GABR, GABR13; 14.11.2026)', () => {
  const at = (name: string, gp: string, inr: number, overrides: Partial<EnactmentInfo> = {}) =>
    assembleVorlageDetail({
      root: { gp, ityp: 'I', inr },
      content: record(name),
      enactment: enactment({ rvCitation: `${inr} d.B.`, bgblNumber: null, houseStatus: '2', houseStatusText: null, amendedIn: [], ...overrides }),
      currentGp: 'XXVIII',
      withoutBegutachtung: false,
    })

  it('assembles the Bundesrat’s own motion: kind, variant, the bill’s title, no Ressort', () => {
    const d = at('XXVII-I-21', 'XXVII', 21)
    expect(d).toMatchObject({ itemKind: 'bundesratsantrag', variant: 'bundesrat', citation: '21 d.B.', ministry: null, committee: null, moverClubs: null, draftPath: null })
    expect(d.officialTitle).toBe('Bundesgesetz, mit dem das Bundesministeriengesetz 1986 geändert wird')
    expect(itemBylineDe(d)).toBe('Eingebracht vom Bundesrat')
    expect(itemCopyDe(d).word).toBe('Gesetzesantrag des Bundesrates')
    expect(itemCiteAsDe(d)).toBe('21 BlgNR 27. GP')
  })
  it('tells a third of the members from the Bundesrat, and names none of them', () => {
    const d = at('XXVII-I-1940', 'XXVII', 1940)
    expect(d).toMatchObject({ itemKind: 'bundesratsantrag', variant: 'drittel' })
    expect(itemBylineDe(d)).toBe('Eingebracht von einem Drittel der Mitglieder des Bundesrates')
    expect(itemCopyDe(d).word).toBe('Gesetzesantrag von Mitgliedern des Bundesrates')
    // The description names the members before „betreffend": only what follows is taken.
    expect(d.officialTitle).toBe('Bundesgesetz, mit dem das Bundesministeriengesetz 1986 geändert wird')
    expect(officialTitleOf('I', 'Gesetzesantrag der Bundesrätinnen und Bundesräte A, B, Kolleginnen und Kollegen vom 1. März 2023 betreffend ein Bundesgesetz, mit dem X geändert wird'))
      .toBe('Bundesgesetz, mit dem X geändert wird')
    expect(officialTitleOf('I', 'Gesetzesantrag der Bundesrätinnen und Bundesräte A, B betreffend Pensionen')).toBeNull()
    // The pale third station's reason and „Parlament"'s first fact, the variant's words.
    expect(vorlageStations(d)[1]).toMatchObject({ id: 'rv', name: 'Regierungsvorlage', state: 'never', facts: ['keine', 'Antrag von Mitgliedern des Bundesrates'] })
    expect(vorlageStations(d)[2]!.facts[0]).toBe('Gesetzesantrag von Mitgliedern des Bundesrates')
    expect(vorlageStations(at('XXVII-I-21', 'XXVII', 21))[1]!.facts).toEqual(['keine', 'Antrag des Bundesrates'])
  })
  it('says “nicht feststellbar” for the Begutachtung, and never claims a window the flag does not open', () => {
    const d = at('XXVII-I-1940', 'XXVII', 1940)
    expect(vorlageStations(d)[0]).toMatchObject({ state: 'never', facts: ['nicht feststellbar', 'ob ein Ministerialentwurf vorausging, ist hier nicht belegt'] })
    expect(d.enactment.filingOpen).toBe(false)
    expect(parliamentStandDe(d, '2026-11-14', 'bundesratsantrag')).not.toContain('Regierungsvorlage')
    expect(wegFor({ source: 'vorlage', ityp: 'I', withoutBegutachtung: false, itemKind: 'bundesratsantrag' })).toBe('bundesrat-antrag')
  })
  it('follows 452 d.B. XXV to its law', () => {
    const d = at('XXV-I-452', 'XXV', 452, { bgblNumber: 'Bundesgesetzblatt I Nr. 44/2015', houseStatus: '5', houseStatusText: 'Beschlossen im Bundesrat' })
    expect(d).toMatchObject({ itemKind: 'bundesratsantrag', variant: 'bundesrat', gpEnded: true })
    expect(d.officialTitle).toBe('Bundesgesetz, mit dem das Versicherungsaufsichtsgesetz 2016 geändert wird')
    expect(itemCiteAsDe(d)).toBe('452 BlgNR 25. GP')
    expect(vorlageStatusDe(d)).toBe('Gesetz geworden')
    expect(JSON.stringify(d)).not.toMatch(/\/person\//)
  })
})
