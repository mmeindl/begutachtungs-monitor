import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveLawByName } from '../server/utils/ris/konsLaw'

/**
 * The law a Promulgationsklausel names without a Stammnorm we can read
 * (20.11.2026): 146/ME XXVIII cites the Mediengesetz only by its last
 * amendment, 145/ME the Biozidproduktegesetz as „BGBl I 2013/105", 61/ME
 * the Werbeabgabegesetz 2000 as „29/200". RIS answers are fakes; the
 * decision is the shipped one.
 */

const record = (gesetzesnummer: string, label: string, kurztitel: string, abkuerzung: string | null) => ({
  Data: {
    Metadaten: {
      Technisch: { ID: `NOR-${gesetzesnummer}-${label}` },
      Bundesrecht: {
        Kurztitel: kurztitel,
        BrKons: { ArtikelParagraphAnlage: label, Gesetzesnummer: gesetzesnummer, ...(abkuerzung ? { Abkuerzung: abkuerzung } : {}), StammnormPublikationsorgan: 'BGBl. Nr.', StammnormBgblnummer: '1/1981' },
      },
    },
    Dokumentliste: { ContentReference: { ContentType: 'MainDocument', Urls: { ContentUrl: { DataType: 'Xml', Url: `https://www.ris.bka.gv.at/${gesetzesnummer}-${label}.xml` } } } },
  },
})
const answer = (records: unknown[]) =>
  new Response(JSON.stringify({ OgdSearchResult: { OgdDocumentResults: { Hits: { '#text': String(records.length) }, OgdDocumentReference: records } } }), { status: 200 })

function ris(byTitle: unknown[], byNummer: Record<string, unknown[]>) {
  vi.stubGlobal('fetch', vi.fn((input: string) => {
    const url = new URL(String(input))
    const nummer = url.searchParams.get('Gesetzesnummer')
    return Promise.resolve(answer(nummer ? (byNummer[nummer] ?? []) : byTitle))
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('resolveLawByName — a law named without a Stammnorm we can read (20.11.2026)', () => {
  it('takes the one law whose Kurztitel is the clause\'s name, and reads it by its Gesetzesnummer', async () => {
    // The title search is fuzzy: it returns the Pflichtablieferungsverordnung for „Mediengesetz".
    ris(
      [record('10000719', '§ 33', 'Mediengesetz', 'MedienG'), record('20006424', '§ 1', 'Pflichtablieferungsverordnung', 'PflAV')],
      { 10000719: [record('10000719', '§ 33', 'Mediengesetz', 'MedienG'), record('10000719', '§ 34', 'Mediengesetz', 'MedienG')] },
    )
    const law = await resolveLawByName({ name: 'Mediengesetz', abbreviation: 'MedienG' }, '2026-10-21')
    expect(law?.gesetzesnummer).toBe('10000719')
    expect(Object.keys(law!.paragraphs)).toEqual(['§ 33', '§ 34'])
  })

  it('takes a law the clause names by its Abkürzung alone', async () => {
    ris([record('10003456', '§ 3', 'Genossenschaftsrevisionsgesetz 1997', 'GenRevG 1997')], { 10003456: [record('10003456', '§ 3', 'Genossenschaftsrevisionsgesetz 1997', 'GenRevG 1997')] })
    expect((await resolveLawByName({ name: 'GenRevG 1997', abbreviation: null }, '2025-01-13'))?.gesetzesnummer).toBe('10003456')
  })

  it('never takes a near name: a score is no proof', async () => {
    ris([record('20012143', '§ 2', 'Wertpapierfirmengesetz 2022', 'WPFG 2022')], {})
    expect(await resolveLawByName({ name: 'Wertpapierfirmengesetz', abbreviation: null }, '2025-06-18')).toBeNull()
  })

  it('refuses where two laws carry the name — the StbG is the Staatsbürgerschaftsgesetz 1985 and its Übergangsrecht', async () => {
    ris([record('10005579', '§ 1', 'Staatsbürgerschaftsgesetz 1985', 'StbG'), record('10005577', '§ 1', 'Staatsbürgerschafts-Übergangsrecht 1985', 'StbG')], {})
    expect(await resolveLawByName({ name: 'StbG', abbreviation: null }, '2026-10-23')).toBeNull()
  })

  it('throws where RIS ignores the Gesetzesnummer filter', async () => {
    ris([record('10000719', '§ 33', 'Mediengesetz', 'MedienG')], { 10000719: [record('99999999', '§ 1', 'Anderes Gesetz', null)] })
    await expect(resolveLawByName({ name: 'Mediengesetz', abbreviation: null }, '2026-10-21')).rejects.toThrow(/ignorierte den Filter/)
  })
})
