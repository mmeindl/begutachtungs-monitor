/**
 * Landesgesetze without a draft in the register (`server/utils/laender/landLaws.ts`,
 * docs/architecture.md §12.70).
 *
 * What these tests guard is the DIRECTION, as for the Bund's laws: every
 * doubt — a join that could not be read, a budget law, a similar draft, a
 * document not read, a law RIS gives no route for, a Land whose sources
 * carry no statement — ends in silence, never in „ohne Begutachtung".
 */
import { describe, expect, it } from 'vitest'
import type { LandConsultation } from '../shared/types'
import {
  classifyLandLaw,
  docSignalOf,
  hasSimilarDraft,
  isLandBudgetLaw,
  landLawOf,
  lawMetaOf,
  lgblNrKey,
  materialsOf,
  routeOf,
  rowsFrom,
  titleDecisionDate,
  type LawFacts,
  type LgblLawMeta,
} from '../server/utils/laender/landLaws'
import { lawParams } from '../server/utils/laender/landLawParams'

const meta = (over: Partial<LgblLawMeta> = {}): LgblLawMeta => ({
  kurztitel: null, beschluss: null, periode: null, vorlage: null, vorlageUrl: null, antrag: null, antragUrl: null,
  ausschuss: null, ausschussUrl: null, materialien: null, materialienUrl: null, ...over,
})

const VORLAGE = { kind: 'vorlage' as const, number: '520', url: 'https://www.salzburg.gv.at/00201lpi/17Gesetzgebungsperiode/4Session/520.pdf' }
const ANTRAG = { kind: 'antrag' as const, number: '12', url: 'https://www.salzburg.gv.at/00201lpi/17Gesetzgebungsperiode/4Session/012.pdf' }
const noSignal = { heading: false, negative: false, mentions: false }

const facts = (over: Partial<LawFacts> = {}): LawFacts => ({
  land: 'sbg', joined: false, budget: false, similarDraft: false, route: VORLAGE, vorlage: noSignal, antrag: null, ...over,
})

describe('classifyLandLaw', () => {
  it('a joined draft is consulted, in every Land', () => {
    expect(classifyLandLaw(facts({ joined: true }))).toEqual({ kind: 'consulted', by: 'draft' })
    expect(classifyLandLaw(facts({ land: 'w', joined: true }))).toEqual({ kind: 'consulted', by: 'draft' })
  })

  it('the Vorlage heading is consulted — unless the Vorlage also says there was none', () => {
    expect(classifyLandLaw(facts({ vorlage: { heading: true, negative: false, mentions: true } }))).toEqual({ kind: 'consulted', by: 'heading' })
    expect(classifyLandLaw(facts({ vorlage: { heading: true, negative: true, mentions: true } }))).toEqual({ kind: 'silent', reason: 'contradictory' })
  })

  it('„ohne Begutachtung" only on full evidence: no join, no similar draft, the Vorlage read without the heading', () => {
    expect(classifyLandLaw(facts())).toEqual({ kind: 'none' })
  })

  it('every other Land says nothing, whatever its documents say', () => {
    expect(classifyLandLaw(facts({ land: 'bgld' }))).toEqual({ kind: 'silent', reason: 'unsupported' })
    expect(classifyLandLaw(facts({ land: 'w', vorlage: { heading: true, negative: false, mentions: true } }))).toEqual({ kind: 'silent', reason: 'unsupported' })
  })

  it('every doubt is silence', () => {
    expect(classifyLandLaw(facts({ budget: true }))).toEqual({ kind: 'silent', reason: 'budget' })
    expect(classifyLandLaw(facts({ similarDraft: true }))).toEqual({ kind: 'silent', reason: 'similar-draft' })
    expect(classifyLandLaw(facts({ joined: null }))).toEqual({ kind: 'silent', reason: 'unread' })
    expect(classifyLandLaw(facts({ similarDraft: null }))).toEqual({ kind: 'silent', reason: 'unread' })
    expect(classifyLandLaw(facts({ vorlage: null }))).toEqual({ kind: 'silent', reason: 'unread' })
    expect(classifyLandLaw(facts({ route: null }))).toEqual({ kind: 'silent', reason: 'no-route' })
    expect(classifyLandLaw(facts({ route: { ...VORLAGE, url: null } }))).toEqual({ kind: 'silent', reason: 'no-route' })
  })

  it('a budget law with the heading is still consulted — the heading is evidence, the exemption only silences', () => {
    expect(classifyLandLaw(facts({ budget: true, vorlage: { heading: true, negative: false, mentions: true } }))).toEqual({ kind: 'consulted', by: 'heading' })
  })

  it('an Initiativantrag: none only when read in full without a word of Begutachtung', () => {
    const antrag = facts({ route: ANTRAG, vorlage: null })
    expect(classifyLandLaw({ ...antrag, antrag: noSignal })).toEqual({ kind: 'none' })
    expect(classifyLandLaw({ ...antrag, antrag: { heading: false, negative: false, mentions: true } })).toEqual({ kind: 'silent', reason: 'mentions' })
    expect(classifyLandLaw({ ...antrag, antrag: null })).toEqual({ kind: 'silent', reason: 'unread' })
  })
})

describe('the committee report', () => {
  it('a report that names a Begutachtung is a doubt, one that says there was none is not', () => {
    const antrag = facts({ route: ANTRAG, vorlage: null, antrag: noSignal })
    expect(classifyLandLaw({ ...antrag, report: noSignal })).toEqual({ kind: 'none' })
    expect(classifyLandLaw({ ...antrag, report: { heading: false, negative: true, mentions: true } })).toEqual({ kind: 'none' })
    expect(classifyLandLaw({ ...antrag, report: { heading: false, negative: false, mentions: true } })).toEqual({ kind: 'silent', reason: 'mentions' })
    expect(classifyLandLaw({ ...antrag, report: null })).toEqual({ kind: 'silent', reason: 'unread' })
    expect(classifyLandLaw({ ...facts(), report: null })).toEqual({ kind: 'silent', reason: 'unread' })
  })
})

describe('docSignalOf', () => {
  it('reads the heading, a negative sentence and any mention', () => {
    expect(docSignalOf('… 4. Ergebnisse des  Begutachtungsverfahrens Im Begutachtungsverfahren …')).toEqual({ heading: true, negative: false, mentions: true })
    expect(docSignalOf('Von einer Begutachtung wurde wegen der Dringlichkeit abgesehen.')).toMatchObject({ heading: false, negative: true })
    expect(docSignalOf('Ein Begutachtungsverfahren wurde nicht durchgeführt.')).toMatchObject({ negative: true })
    expect(docSignalOf('Der Landtag wolle beschließen …')).toEqual(noSignal)
  })
})

describe('isLandBudgetLaw', () => {
  it('the yearly Landeshaushaltsgesetz and its amendments, not the organic law', () => {
    expect(isLandBudgetLaw('Gesetz vom 17. Dezember 2025, mit dem der Landeshaushalt für das Haushaltsjahr 2026, die mittelfristige …', 'Landeshaushaltsgesetz 2026 – LHG 2026; Erlassung')).toBe(true)
    expect(isLandBudgetLaw('Gesetz vom 6. Juli 2022, mit dem das Landeshaushaltsgesetz 2022 geändert wird', 'Landeshaushaltsgesetz 2022; Änderung')).toBe(true)
    expect(isLandBudgetLaw('Gesetz vom 2. Juli 2025, mit dem das Allgemeine Landeshaushaltsgesetz 2018 geändert wird', 'Allgemeines Landeshaushaltsgesetz 2018; Änderung')).toBe(false)
    expect(isLandBudgetLaw('Gesetz vom 30. September 2026, mit dem das Salzburger Kinder- und Jugendhilfegesetz geändert wird', null)).toBe(false)
  })
})

describe('routeOf and materialsOf', () => {
  it('states the route only as RIS states it', () => {
    expect(routeOf('sbg', meta({ vorlage: '520', vorlageUrl: VORLAGE.url }))).toEqual(VORLAGE)
    expect(routeOf('vbg', meta({ antrag: '60/2026' }))).toEqual({ kind: 'antrag', number: '60/2026', url: null })
    // Wien writes the word, not a number; and no field is no Vorlage.
    expect(routeOf('w', meta({ antrag: 'Initiativantrag', antragUrl: 'https://www.wien.gv.at/infodat/ergdt?detvid=110008' }))).toEqual({ kind: 'antrag', number: null, url: 'https://www.wien.gv.at/infodat/ergdt?detvid=110008' })
    expect(routeOf('w', meta({ materialien: 'Materialien' }))).toBeNull()
    expect(routeOf('stmk', meta({ materialien: 'XIX. GPStLT IA EZ 1498/1 AB EZ 1498/2' }))).toEqual({ kind: 'antrag', number: 'EZ 1498/1', url: null })
    expect(routeOf('stmk', meta({ materialien: 'XIX. GPStLT RV EZ 1409/1 AB EZ 1409/3' }))).toEqual({ kind: 'vorlage', number: 'EZ 1409/1', url: null })
    expect(routeOf('ktn', meta())).toBeNull()
    expect(routeOf('ktn', meta({ vorlage: 'Materialien zur RV; 1. Sitzg. d. Ktn. LReg', vorlageUrl: 'https://www.ktn.gv.at/Verwaltung/Regierungsvorlagen%202023' }))).toEqual({ kind: 'vorlage', number: null, url: null })
  })

  it('offers the Landtag item only where the link lands on it', () => {
    expect(materialsOf('w', meta({ materialien: 'Materialien', materialienUrl: 'https://www.wien.gv.at/infodat/ergdt?detvid=201957' }))).toEqual({ label: 'Gegenstand im Landtag', url: 'https://www.wien.gv.at/infodat/ergdt?detvid=201957' })
    expect(materialsOf('noe', meta({ materialien: 'Ltg.-1056/XX-2026', materialienUrl: 'https://noe-landtag.gv.at/gegenstaende/XX/XX-1056' }))?.label).toBe('Ltg.-1056/XX-2026')
    expect(materialsOf('noe', meta({ materialienUrl: 'https://www.landtag-noe.at/service/politik/landtag/xx' }))).toBeNull()
    expect(materialsOf('stmk', meta({ materialienUrl: 'http://service.stmk.gv.at/landtag-archiv-p19/documents?ez=1409' }))).toBeNull()
  })
})

describe('the law and its row', () => {
  it('reads the Beschluss from the field, else from the title', () => {
    expect(titleDecisionDate('Gesetz vom 7. Juli 2026, mit dem das Steiermärkische Feuerwehrgesetz geändert wird')).toBe('2026-07-07')
    expect(titleDecisionDate('Landesverfassungsgesetz vom 1. Jänner 2025, mit dem …')).toBe('2025-01-01')
    expect(titleDecisionDate('Änderung des NÖ Pflichtschulgesetzes 2018')).toBeNull()
    const entry = { nr: 'LGBl. Nr. 57/2026', typ: 'Landesgesetz', titel: 'Gesetz vom 7. Juli 2026, mit dem …', datum: '2026-07-20', url: null, meta: meta() }
    expect(landLawOf('stmk', entry, { kind: 'silent', reason: 'unsupported' })).toMatchObject({ year: 2026, number: 57, decidedAt: '2026-07-07' })
    expect(landLawOf('w', { ...entry, meta: meta({ beschluss: '2026-07-08' }) }, { kind: 'silent', reason: 'unsupported' })?.decidedAt).toBe('2026-07-08')
  })

  it('keys a number the same whoever spells it', () => {
    expect(lgblNrKey('LGBl. Nr. 57/2026')).toBe('57/2026')
    expect(lgblNrKey('LGBl.Nr. 57/2026')).toBe('57/2026')
  })

  it('reads RIS fields', () => {
    const m = lawMetaOf({ Kurztitel: ' X ', LgblAuth: { BeschlussDatum: '2026-09-30', Regierungsvorlage: '520', RegierungsvorlageLink: VORLAGE.url } })
    expect(m).toMatchObject({ kurztitel: 'X', beschluss: '2026-09-30', vorlage: '520', vorlageUrl: VORLAGE.url })
  })

  it('rows start where the register reaches two years before', () => {
    const d = (startedAt: string | null, kind: 'gesetz' | 'verordnung' = 'gesetz') => ({ id: 'x', land: 'sbg', kind, title: '', startedAt, deadline: null, url: '', documents: [], active: false }) as LandConsultation
    expect(rowsFrom([d('2004-03-01'), d('2010-01-01'), d('2001-01-01', 'verordnung')])).toBe('2006-03-01')
    expect(rowsFrom([d(null)])).toBeNull()
  })

  it('a similar draft before the Beschluss, within two years', () => {
    const draft = { id: 'sbg-1', land: 'sbg', kind: 'gesetz', title: 'Gesetz, mit dem das Salzburger Kinder- und Jugendhilfegesetz geändert wird', startedAt: '2026-03-01', deadline: null, url: '', documents: [], active: false } as LandConsultation
    const law = { titel: 'Gesetz vom 30. September 2026, mit dem das Salzburger Kinder- und Jugendhilfegesetz geändert wird', datum: '2026-10-07' }
    expect(hasSimilarDraft(law, '2026-09-30', [draft])).toBe(true)
    expect(hasSimilarDraft(law, '2026-09-30', [{ ...draft, startedAt: '2026-10-01' }])).toBe(false)
    expect(hasSimilarDraft(law, '2026-09-30', [{ ...draft, startedAt: '2023-01-01' }])).toBe(false)
    expect(hasSimilarDraft(law, '2026-09-30', [{ ...draft, title: 'Gesetz, mit dem das Salzburger Jagdgesetz geändert wird' }])).toBe(false)
  })

  it('checks a law address before anything is read', () => {
    expect(lawParams('sbg', '2026', '57', ['sbg'])).toEqual({ land: 'sbg', year: 2026, number: 57 })
    expect(lawParams('sbg', '2026', '057', ['sbg'])).toBeNull()
    expect(lawParams('xx', '2026', '57', ['sbg'])).toBeNull()
    expect(lawParams('sbg', '26', '57', ['sbg'])).toBeNull()
  })
})
