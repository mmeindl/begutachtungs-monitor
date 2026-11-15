import { describe, expect, it } from 'vitest'
import { lawListOfTitle, lawsOfTitleList, pickLawByName, titleLawName, type NamedRecord } from '../server/utils/lawtext/titleLaws'

/**
 * The laws a text names in its own title (`server/utils/lawtext/titleLaws.ts`),
 * read where its clauses name none (14.11.2026). The titles are the real ones.
 */

/* 51 d.B. XXVII and 53 d.B. XXIV, motions of the Bundesrat amending the B-VG. */
const BVG = 'Bundesverfassungsgesetz, mit dem das Bundes-Verfassungsgesetz geändert wird'
/* 1859 d.B. XXVII: „und die" parts the list and stands inside the second name. */
const GLBG = 'Bundesgesetz, mit dem das Bundesgesetz über die Gleichbehandlung im Bereich des Bundes (Bundes-Gleichbehandlungsgesetz - B-GlBG) und das Bundesgesetz über die Gleichbehandlungskommission und die Gleichbehandlungsanwaltschaft (GBK/GAW-Gesetz) geändert wird'
/* 869 d.B. XXV: a list of three, the second with its Wiederverlautbarung in the name. */
const UEG = 'Bundesverfassungsgesetz, mit dem das Bundes-Verfassungsgesetz, das Übergangsgesetz vom 1. Oktober 1920, in der Fassung des B. G. Bl. Nr. 368 vom Jahre 1925 und das Bundesverfassungsgesetz betreffend Grundsätze für die Einrichtung und Geschäftsführung der Ämter der Landesregierungen außer Wien geändert werden'
/* 627 d.B. XXVI: „abgeändert", and a version cited inside the list. */
const SVOG = 'Bundesgesetz, mit dem das Sozialversicherungs-Organisationsgesetz (SV-OG) in der Fassung des BGBl. I Nr. 100/2018 abgeändert wird'

describe('lawListOfTitle — only the shape a law names what it amends in', () => {
  it('reads „mit dem das … geändert wird" and its lists', () => {
    expect(lawListOfTitle(BVG)).toBe('das Bundes-Verfassungsgesetz')
    expect(lawListOfTitle(GLBG)).toMatch(/^das Bundesgesetz über die Gleichbehandlung im Bereich des Bundes .* \(GBK\/GAW-Gesetz\)$/)
    expect(lawListOfTitle(UEG)).toMatch(/^das Bundes-Verfassungsgesetz, das Übergangsgesetz .* außer Wien$/)
    expect(lawListOfTitle(SVOG)).toBe('das Sozialversicherungs-Organisationsgesetz (SV-OG) in der Fassung des BGBl. I Nr. 100/2018')
  })

  it('reads no title that enacts, repeals, or quotes an EU act (120/ME XXVIII, 352/ME XXVII)', () => {
    expect(lawListOfTitle('Bundesgesetz hinsichtlich der Benennung der zentralen Kontaktstelle und der für die Anerkennung von strategischen Projekten zuständigen Stelle zur Durchführung der Verordnung (EU) 2024/1735 zur Schaffung eines Rahmens für Maßnahmen zur Stärkung des europäischen Ökosystems der Fertigung von Netto-Null-Technologien und zur Änderung der Verordnung (EU) 2018/1724 (Begleitmaßnahmengesetz Netto-Null-Industrie-Verordnung)')).toBeNull()
    expect(lawListOfTitle('Bundesgesetz, mit dem ein Bundesgesetz über Daten-Governance, Anbieter von Datenvermittlungsdiensten und datenaltruistische Organisationen nach der Verordnung (EU) 2022/868 über europäische Daten-Governance und zur Änderung der Verordnung (EU) 2018/1724 (Datenzugangsgesetz - DZG) erlassen wird')).toBeNull()
    expect(lawListOfTitle('Bundesgesetz, mit dem das Bundesgesetz über das Verbot der geologischen Speicherung von Kohlenstoffdioxid aufgehoben wird')).toBeNull()
    expect(lawListOfTitle('Änderung des Bundes-Verfassungsgesetzes')).toBeNull()
  })
})

describe('titleLawName — the name one piece of the list gives', () => {
  it('takes the bracketed short title, the abbreviation, and drops a cited version', () => {
    expect(titleLawName('das Bundes-Verfassungsgesetz')).toEqual({ name: 'Bundes-Verfassungsgesetz', abbreviation: null })
    expect(titleLawName('das Bundesgesetz über die Gleichbehandlung im Bereich des Bundes (Bundes-Gleichbehandlungsgesetz - B-GlBG)')).toEqual({ name: 'Bundes-Gleichbehandlungsgesetz', abbreviation: 'B-GlBG' })
    expect(titleLawName('das Bundesgesetz über die Gleichbehandlungskommission und die Gleichbehandlungsanwaltschaft (GBK/GAW-Gesetz)')).toEqual({ name: 'GBK/GAW-Gesetz', abbreviation: null })
    expect(titleLawName('das Sozialversicherungs-Organisationsgesetz (SV-OG) in der Fassung des BGBl. I Nr. 100/2018')).toEqual({ name: 'Sozialversicherungs-Organisationsgesetz', abbreviation: 'SV-OG' })
    expect(titleLawName('das Übergangsgesetz vom 1. Oktober 1920, in der Fassung des B. G. Bl. Nr. 368 vom Jahre 1925')).toEqual({ name: 'Übergangsgesetz vom 1. Oktober 1920', abbreviation: null })
  })

  it('refuses a piece that names an EU act', () => {
    expect(titleLawName('die Verordnung (EU) 2018/1724')).toBeNull()
  })
})

describe('lawsOfTitleList — every piece a law, or nothing', () => {
  // The Kurztitel RIS carries for these laws (read 14.11.2026).
  const ris = new Set(['Bundes-Verfassungsgesetz', 'Bundes-Gleichbehandlungsgesetz', 'GBK/GAW-Gesetz'])
  const resolve = async (piece: string) => {
    const n = titleLawName(piece)
    return n && ris.has(n.name) ? n.name : null
  }

  it('finds the reading where every piece names a law, though „und die" stands inside a name (1859 d.B. XXVII)', async () => {
    expect(await lawsOfTitleList(lawListOfTitle(GLBG)!, resolve)).toEqual(['Bundes-Gleichbehandlungsgesetz', 'GBK/GAW-Gesetz'])
    expect(await lawsOfTitleList(lawListOfTitle(BVG)!, resolve)).toEqual(['Bundes-Verfassungsgesetz'])
  })

  it('names nothing where one piece names no law — never part of the list (869 d.B. XXV)', async () => {
    // „Übergangsgesetz vom 1. Oktober 1920" is not RIS's „Übergangsgesetz 1920".
    expect(await lawsOfTitleList(lawListOfTitle(UEG)!, resolve)).toBeNull()
  })
})

describe('pickLawByName — the Kurztitel or Abkürzung exactly, one law', () => {
  const rec = (gesetzesnummer: string, kurztitel: string, abkuerzung: string, organ: string, nummer: string): NamedRecord => ({ gesetzesnummer, kurztitel, abkuerzung, stammnorm: { organ, nummer } })

  it('takes the Stammnorm most of the law\'s records carry (B-GlBG: 79 against 1, read 14.11.2026)', () => {
    const records = [
      ...Array.from({ length: 3 }, () => rec('10008858', 'Bundes-Gleichbehandlungsgesetz', 'B-GlBG', 'BGBl. Nr.', '100/1993')),
      rec('10008858', 'Bundes-Gleichbehandlungsgesetz', 'B-GlBG', 'BGBl. I Nr.', '135/2009'),
      rec('10008864', 'Geschäftsführung der Gleichbehandlungskommission gemäß dem Bundes-Gleichbehandlungsgesetz', '', 'BGBl. Nr.', '376/1993'),
    ]
    expect(pickLawByName(records, { name: 'Bundes-Gleichbehandlungsgesetz', abbreviation: 'B-GlBG' })).toEqual({ gesetzesnummer: '10008858', kurztitel: 'Bundes-Gleichbehandlungsgesetz', stammnorm: { organ: 'BGBl. Nr.', nummer: '100/1993' } })
  })

  it('refuses a near name and two laws of one name', () => {
    const asvg = [rec('10008147', 'Allgemeines Sozialversicherungsgesetz', 'ASVG', 'BGBl. Nr.', '189/1955')]
    expect(pickLawByName(asvg, { name: 'Allgemeine Sozialversicherungsgesetz', abbreviation: null })).toBeNull()
    const two = [rec('1', 'Testgesetz', '', 'BGBl. Nr.', '1/1990'), rec('2', 'Testgesetz', '', 'BGBl. Nr.', '2/1990')]
    expect(pickLawByName(two, { name: 'Testgesetz', abbreviation: null })).toBeNull()
  })
})
