import { describe, expect, it } from 'vitest'
import type { RisConsultation } from '../shared/types'
import {
  asArray,
  flattenRisRecord,
  hasDocument,
  isOpenOn,
  risDocumentUrl,
  withRisActiveOn,
} from '../server/utils/risRecord'

/**
 * The RIS Begut record mapper (docs/api-exploration.md §2).
 *
 * The documents are what earn the tests here: the Erläuterungen and the
 * Begleitschreiben were added for the Verordnungen facet
 * (docs/architecture.md §12.16), and on a Verordnungsentwurf they are the
 * whole page — there is no parliamentary Gegenstand carrying a document
 * list beside them.
 */

/** The shape of one `OgdDocumentReference`, abbreviated to what we read. */
function record(refs: unknown[], meta: Record<string, unknown> = {}) {
  return {
    Data: {
      Metadaten: {
        Technisch: { ID: 'BEGUT_TEST_1', Organ: 'BMJ (Bundesministerium für Justiz)' },
        Allgemein: { Geaendert: '2026-09-08' },
        Bundesrecht: {
          Kurztitel: 'Mehrstimmrechtsaktien-Gesetz',
          Titel: 'Bundesgesetz, mit dem das Aktiengesetz geändert wird',
          Begut: {
            EinbringendeStelle: 'BMJ (Bundesministerium für Justiz)',
            BeginnBegutachtungsfrist: '2026-09-15',
            EndeBegutachtungsfrist: '2026-10-16',
            ...meta,
          },
        },
      },
      Dokumentliste: { ContentReference: refs },
    },
  }
}

const urls = (name: string, type: string, url: string) => ({
  ContentType: name,
  Name: name,
  Urls: { ContentUrl: { DataType: type, Url: url } },
})

describe('asArray', () => {
  it('wraps the bare object the XML-to-JSON conversion produces for one element', () => {
    expect(asArray({ a: 1 })).toEqual([{ a: 1 }])
    expect(asArray([{ a: 1 }, { a: 2 }])).toHaveLength(2)
    expect(asArray(null)).toEqual([])
    expect(asArray(undefined)).toEqual([])
  })
})

describe('flattenRisRecord', () => {
  it('reads the metadata and the main document in every offered format', () => {
    const flat = flattenRisRecord(
      record([
        {
          ContentType: 'MainDocument',
          Name: 'Hauptdokument',
          Urls: {
            ContentUrl: [
              { DataType: 'Xml', Url: 'https://ogd.ris.bka.gv.at/x.xml' },
              { DataType: 'Html', Url: 'https://ogd.ris.bka.gv.at/x.html' },
              { DataType: 'Pdf', Url: 'https://ogd.ris.bka.gv.at/x.pdf' },
              // Offered upstream, never read: nothing renders RTF.
              { DataType: 'Rtf', Url: 'https://ogd.ris.bka.gv.at/x.rtf' },
            ],
          },
        },
      ]),
    )!
    expect(flat.id).toBe('BEGUT_TEST_1')
    expect(flat.kurztitel).toBe('Mehrstimmrechtsaktien-Gesetz')
    expect(flat.stelle).toBe('BMJ (Bundesministerium für Justiz)')
    expect(flat.beginn).toBe('2026-09-15')
    expect(flat.ende).toBe('2026-10-16')
    expect(flat.mainDocument).toEqual({
      xml: 'https://ogd.ris.bka.gv.at/x.xml',
      html: 'https://ogd.ris.bka.gv.at/x.html',
      pdf: 'https://ogd.ris.bka.gv.at/x.pdf',
    })
  })

  it('returns null without a technical ID — the only identity these records have', () => {
    expect(flattenRisRecord({ Data: { Metadaten: { Technisch: {} } } })).toBeNull()
    expect(flattenRisRecord(null)).toBeNull()
  })

  it('picks up the Erläuterungen and the Begleitschreiben', () => {
    const flat = flattenRisRecord(
      record([
        urls('MainDocument', 'Xml', 'https://ogd.ris.bka.gv.at/main.xml'),
        { ...urls('Material', 'Html', 'https://ogd.ris.bka.gv.at/erl.html'), Name: 'Erläuterungen' },
        { ...urls('Letter', 'Pdf', 'https://ogd.ris.bka.gv.at/brief.pdf'), Name: 'Begleitschreiben Begutachtungsentwurf' },
      ]),
    )!
    expect(flat.explanations).toEqual({ html: 'https://ogd.ris.bka.gv.at/erl.html', xml: null, pdf: null })
    expect(flat.coverLetter).toEqual({ html: null, xml: null, pdf: 'https://ogd.ris.bka.gv.at/brief.pdf' })
  })

  it('finds the Begleitschreiben by ContentType, not by its wording', () => {
    // Ressorts word the name freely; `ContentType: "Letter"` is the part
    // RIS actually commits to.
    const flat = flattenRisRecord(
      record([{ ...urls('Letter', 'Pdf', 'https://ogd.ris.bka.gv.at/b.pdf'), Name: 'Schreiben an die Begutachtungsteilnehmer' }]),
    )!
    expect(flat.coverLetter?.pdf).toBe('https://ogd.ris.bka.gv.at/b.pdf')
  })

  it('leaves absent documents null rather than as empty format sets', () => {
    const flat = flattenRisRecord(record([urls('MainDocument', 'Xml', 'https://ogd.ris.bka.gv.at/m.xml')]))!
    expect(flat.explanations).toBeNull()
    expect(flat.coverLetter).toBeNull()
    expect(flat.textComparison).toBeNull()
  })

  it('matches the ressorts’ spellings of the Textgegenüberstellung', () => {
    for (const name of ['Textgegenüberstellung', 'TGÜ', 'TGG', 'Textgegenbüberstellung']) {
      const flat = flattenRisRecord(record([{ ...urls('Material', 'Xml', 'https://ogd.ris.bka.gv.at/t.xml'), Name: name }]))!
      expect(flat.textComparison?.xml, name).toBe('https://ogd.ris.bka.gv.at/t.xml')
    }
  })

  it('does NOT match a per-law prefixed annex — known, and its own step', () => {
    // "SAG_TGÜ" occurs on Sammelnovellen (135/ME, 2026-09-17). Widening the
    // pattern changes the annex engine's input, whose baseline is pinned per
    // draft and watched weekly, so it is a measured change of its own and
    // not a side effect of the Verordnungen work (see risRecord.ts).
    const flat = flattenRisRecord(record([{ ...urls('Material', 'Xml', 'https://ogd.ris.bka.gv.at/t.xml'), Name: 'SAG_TGÜ' }]))!
    expect(flat.textComparison).toBeNull()
  })

  it('sammelt alles Übrige, was der Satz an Text führt', () => {
    // Gemessen am 22.09.2026: 41 Textdokumente über die laufenden Sätze, die
    // vier benannten Felder greifen 25. Die Volltextsuche liest den Rest
    // (§12.31), und ein Satz kann mehrere davon haben.
    const flat = flattenRisRecord(
      record([
        urls('MainDocument', 'Xml', 'https://ogd.ris.bka.gv.at/m.xml'),
        { ...urls('Material', 'Xml', 'https://ogd.ris.bka.gv.at/e.xml'), Name: 'Erläuterungen' },
        { ...urls('Material', 'Pdf', 'https://ogd.ris.bka.gv.at/wfa.pdf'), Name: 'WFA' },
        { ...urls('Material', 'Pdf', 'https://ogd.ris.bka.gv.at/dc.pdf'), Name: 'Digi-Ready-Check' },
      ]),
    )!
    // Was ein eigenes Feld hat, steht NICHT noch einmal in der Liste.
    expect(flat.otherDocuments.map((d) => d.name)).toEqual(['WFA', 'Digi-Ready-Check'])
    expect(flat.otherDocuments[0]!.urls.pdf).toBe('https://ogd.ris.bka.gv.at/wfa.pdf')
  })

  it('nimmt die Gegenüberstellung und die Erläuterungen mit, die unsere Namensregeln verfehlen', () => {
    // Die billige Hälfte der bekannten Lücke: „SAG_TGÜ" und „EB" bleiben für
    // die Anlagen-Maschine unsichtbar (ihre Baseline ist gepinnt), die Suche
    // liest sie aber als weiteres Dokument.
    const flat = flattenRisRecord(
      record([
        { ...urls('Material', 'Xml', 'https://ogd.ris.bka.gv.at/t.xml'), Name: 'SAG_TGÜ' },
        { ...urls('Material', 'Xml', 'https://ogd.ris.bka.gv.at/eb.xml'), Name: 'Entwurf EB Klimagesetz' },
      ]),
    )!
    expect(flat.textComparison).toBeNull()
    expect(flat.explanations).toBeNull()
    expect(flat.otherDocuments.map((d) => d.name)).toEqual(['SAG_TGÜ', 'Entwurf EB Klimagesetz'])
  })

  it('zählt ein eingebettetes Bild nicht als Dokument', () => {
    // Ein Satz führt Formeln und Logos als GIF; ohne lesbares Format ist ein
    // Verweis kein Dokument.
    const flat = flattenRisRecord(
      record([
        urls('MainDocument', 'Xml', 'https://ogd.ris.bka.gv.at/m.xml'),
        { ...urls('EmbeddedAttachment', 'Gif', 'https://ogd.ris.bka.gv.at/logo.gif'), Name: 'Temp0001.gif' },
      ]),
    )!
    expect(flat.otherDocuments).toEqual([])
  })

  it('tolerates a single reference arriving as a bare object', () => {
    const doc = record([])
    // @ts-expect-error — reproducing the upstream shape on purpose
    doc.Data.Dokumentliste.ContentReference = urls('MainDocument', 'Pdf', 'https://ogd.ris.bka.gv.at/one.pdf')
    expect(flattenRisRecord(doc)!.mainDocument.pdf).toBe('https://ogd.ris.bka.gv.at/one.pdf')
  })

  it('truncates a timestamped date to the ISO day and nulls a missing one', () => {
    const flat = flattenRisRecord(record([], { BeginnBegutachtungsfrist: '2026-09-15T08:00:00', EndeBegutachtungsfrist: undefined }))!
    expect(flat.beginn).toBe('2026-09-15')
    expect(flat.ende).toBeNull()
  })
})

describe('hasDocument', () => {
  it('is true for any single offered format and false for none', () => {
    expect(hasDocument({ html: null, xml: null, pdf: 'x' })).toBe(true)
    expect(hasDocument({ html: 'x', xml: null, pdf: null })).toBe(true)
    expect(hasDocument({ html: null, xml: null, pdf: null })).toBe(false)
    expect(hasDocument(null)).toBe(false)
  })
})

describe('isOpenOn', () => {
  const r = { beginn: '2026-09-08', ende: '2026-10-19' }

  it('includes both boundary days — the Frist ends WITH its last day', () => {
    expect(isOpenOn(r, '2026-09-08')).toBe(true)
    expect(isOpenOn(r, '2026-10-19')).toBe(true)
    expect(isOpenOn(r, '2026-09-07')).toBe(false)
    expect(isOpenOn(r, '2026-10-20')).toBe(false)
  })

  it('is false without an Ende — the documented lower bound of every count', () => {
    // RIS's own `InBegutachtungAm` filter has the same bound: the field is
    // optional upstream, so "N open" is always at least N, never exactly N.
    // Measured 2026-09-17: 1 of 4.574 records lacks it.
    expect(isOpenOn({ beginn: '2026-09-08', ende: null }, '2026-09-10')).toBe(false)
    expect(isOpenOn({ beginn: null, ende: '2026-10-19' }, '2026-09-10')).toBe(false)
  })
})

describe('risDocumentUrl', () => {
  it('builds the human-readable RIS page and escapes the id', () => {
    expect(risDocumentUrl('BEGUT_COO_2026_100_2_1836568')).toBe(
      'https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Begut&Dokumentnummer=BEGUT_COO_2026_100_2_1836568',
    )
  })
})

describe('withRisActiveOn', () => {
  /**
   * The day rule that `getRisOnlyForGp` used to decide inside its own cache
   * (`server/utils/risOnly.ts`). It lives here because the cached module
   * cannot be imported without Nitro, and because the predicate it applies
   * is `isOpenOn` above.
   */
  function c(overrides: Partial<RisConsultation> = {}): RisConsultation {
    return {
      id: 'BEGUT_A',
      kind: 'verordnung',
      title: 'Änderung der Druckgeräteaufstellungsverordnung',
      longTitle: null,
      ministryCode: 'BMWET',
      ministryName: 'Bundesministerium für Wirtschaft, Energie und Tourismus',
      startedAt: '2026-09-08',
      deadline: '2026-10-19',
      active: false,
      risUrl: 'https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Begut&Dokumentnummer=BEGUT_A',
      outcome: null,
      ...overrides,
    }
  }

  it('decides the flag on the given day, both boundaries included', () => {
    const items = [c()]
    expect(withRisActiveOn(items, '2026-09-08')[0]!.active).toBe(true)
    expect(withRisActiveOn(items, '2026-10-19')[0]!.active).toBe(true)
    expect(withRisActiveOn(items, '2026-10-20')[0]!.active).toBe(false)
  })

  it('overrides whatever the cached record carried — the cache holds no answer', () => {
    // The whole point of the split: a record cached before midnight must not
    // hand its `active` to a request made after it.
    expect(withRisActiveOn([c({ active: true })], '2026-10-20')[0]!.active).toBe(false)
    expect(withRisActiveOn([c({ active: false })], '2026-10-01')[0]!.active).toBe(true)
  })

  it('leaves a record without a Frist inactive', () => {
    expect(withRisActiveOn([c({ deadline: null })], '2026-10-01')[0]!.active).toBe(false)
    expect(withRisActiveOn([c({ startedAt: null })], '2026-10-01')[0]!.active).toBe(false)
  })

  it('touches nothing else and keeps the input untouched', () => {
    const items = [c({ id: 'BEGUT_A' }), c({ id: 'BEGUT_B', active: true })]
    const out = withRisActiveOn(items, '2026-10-20')
    expect(out.map((x) => x.id)).toEqual(['BEGUT_A', 'BEGUT_B'])
    expect(items[1]!.active).toBe(true)
    // Unchanged records keep their identity, the way `reconcileActive` does.
    expect(out[0]).toBe(items[0])
  })
})
