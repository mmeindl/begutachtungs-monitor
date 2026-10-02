import { describe, expect, it } from 'vitest'
import type { RisConsultation } from '../shared/types'
import {
  asArray,
  flattenRisRecord,
  hasDocument,
  isOpenOn,
  risDocumentUrl,
  withRisActiveOn,
} from '../server/utils/ris/risRecord'

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

  it('matches a per-law prefixed annex (26.09.2026)', () => {
    // A ressort that writes one Gegenüberstellung per law of a Sammelnovelle
    // prefixes the abbreviation with the law's short name. Four records of
    // the 400 most recent carried nothing as far as the site was concerned,
    // and all four are readable (19, 28, 12, 81 rows). One ressort writes the
    // separator twice.
    for (const name of ['SAG_TGÜ', 'GuKG-Novelle_2024_TGÜ', 'GuK-EWRV-Novelle_2024__TGÜ', 'Bundesstraßen-Lärmimmissionsschutzverordnung-Novelle_TGÜ']) {
      const flat = flattenRisRecord(record([{ ...urls('Material', 'Xml', 'https://ogd.ris.bka.gv.at/t.xml'), Name: name }]))!
      expect(flat.textComparison?.xml, name).toBe('https://ogd.ris.bka.gv.at/t.xml')
    }
  })

  it('reads the abbreviation anywhere in the name, but not inside a word (27.09.2026)', () => {
    // Measured over the whole RIS corpus: 11 of 139 GP-XXVIII Gesetzesentwürfe
    // carried the Gegenüberstellung under names the anchored rule missed —
    // every one of the drafts counted as „nur beim Parlament" (§12.13).
    for (const name of ['TGÜ Anpassung QJF-G', '42. KFG-Nov.TGÜ.11.05.2026', 'IFG-TGÜ (2025-05-07)', 'BBG 2027-2028, BMFWF, TGÜ', 'TxtGGÜ', 'UbG-IPG-Nov TextGG', 'CBDF_TGUe_201008', 'Beilage TGÜ-Vergleich']) {
      const flat = flattenRisRecord(record([{ ...urls('Material', 'Xml', 'https://ogd.ris.bka.gv.at/t.xml'), Name: name }]))!
      expect(flat.textComparison?.xml, name).toBe('https://ogd.ris.bka.gv.at/t.xml')
    }
    // A letter on either side keeps a name out, and so does a bundle: a
    // document with Vorblatt, Erläuterungen and Gegenüberstellung in one is a
    // different document, not a differently named one.
    for (const name of ['AnhangTGÜ', 'WFA', 'Vbl.Erl.TxtGGÜ.14.FSG.Nov', 'KFG-Änd. Vorblatt Erl TxTGGÜ']) {
      const flat = flattenRisRecord(record([{ ...urls('Material', 'Xml', 'https://ogd.ris.bka.gv.at/t.xml'), Name: name }]))!
      expect(flat.textComparison, name).toBeNull()
    }
  })

  it('compares names in NFC — a decomposed „ä" looks the same and matched nothing', () => {
    const flat = flattenRisRecord(
      record([{ ...urls('Material', 'Xml', 'https://ogd.ris.bka.gv.at/e.xml'), Name: 'Erla\u0308uterungen' }]),
    )!
    expect(flat.explanations?.xml).toBe('https://ogd.ris.bka.gv.at/e.xml')
  })

  it('widens strictly: where the old rule matched, the same documents are read as before', () => {
    // Two records (2014, 2016) list „TGÜ_Anhänge" beside a „Textgegenüberstellung";
    // a single widened pattern would have given them a second part.
    const flat = flattenRisRecord(
      record([
        { ...urls('Material', 'Xml', 'https://ogd.ris.bka.gv.at/anh.xml'), Name: 'TGÜ_Anhänge' },
        { ...urls('Material', 'Xml', 'https://ogd.ris.bka.gv.at/t.xml'), Name: 'Textgegenüberstellung' },
        { ...urls('Material', 'Xml', 'https://ogd.ris.bka.gv.at/erl.xml'), Name: 'Erl_Beg' },
        { ...urls('Material', 'Xml', 'https://ogd.ris.bka.gv.at/e.xml'), Name: 'Erläuterungen' },
      ]),
    )!
    expect(flat.textComparisonParts.map((u) => u.xml)).toEqual(['https://ogd.ris.bka.gv.at/t.xml'])
    expect(flat.explanations?.xml).toBe('https://ogd.ris.bka.gv.at/e.xml')
  })

  it('offers the older annex names as candidates, never beside a named annex (30.09.2026)', () => {
    // „begtxt" (BMF, beside „begmat" and „begVorblatt_WFA"), „GGUe",
    // „Textüberstellung": 80 records of GP XXIV–XXVII, 79 of them readable
    // as a Gegenüberstellung. The content decides (`annex/olderAnnex.ts`).
    for (const name of ['begtxt', 'begtxt_1', 'StRefG_2019-20_Begtxt', 'begtxtggue', 'Aktionärsrechte_GGUe 190214', '20180419_KMG_GGUe_Entwurf', 'Textüberstellung']) {
      const flat = flattenRisRecord(record([{ ...urls('Material', 'Xml', 'https://ogd.ris.bka.gv.at/c.xml'), Name: name }]))!
      expect(flat.textComparison, name).toBeNull()
      expect(flat.textComparisonCandidates.map((u) => u.xml), name).toEqual(['https://ogd.ris.bka.gv.at/c.xml'])
      // Still where the reader found it before, under the ressort's name.
      expect(flat.otherDocuments.map((d) => d.name), name).toEqual([name])
    }
    // The bundle is not a candidate: Vorblatt, Erläuterungen and
    // Gegenüberstellung in one document read as a whole turn the Vorblatt's
    // tables into „changed" rows.
    for (const name of ['begmat', 'Materialien', 'RIS_Materialien', 'begVorblatt_WFA']) {
      const flat = flattenRisRecord(record([{ ...urls('Material', 'Xml', 'https://ogd.ris.bka.gv.at/c.xml'), Name: name }]))!
      expect(flat.textComparisonCandidates, name).toEqual([])
    }
    // Strictly additive: where the name rule reads a document, no candidate.
    const named = flattenRisRecord(
      record([
        { ...urls('Material', 'Xml', 'https://ogd.ris.bka.gv.at/c.xml'), Name: 'begtxt' },
        { ...urls('Material', 'Xml', 'https://ogd.ris.bka.gv.at/t.xml'), Name: 'Textgegenüberstellung' },
      ]),
    )!
    expect(named.textComparisonParts.map((u) => u.xml)).toEqual(['https://ogd.ris.bka.gv.at/t.xml'])
    expect(named.textComparisonCandidates).toEqual([])
  })

  it('offers a bundle only where neither name rule finds anything (02.10.2026)', () => {
    // „begmat"/„Materialien": Vorblatt, Erläuterungen and Gegenüberstellung
    // in one document, read only through the cut (`annexSection`).
    const xml = 'https://ogd.ris.bka.gv.at/m.xml'
    for (const name of ['begmat', 'Materialien', 'RIS_Materialien', 'Material', 'Vorblatt, Erläuterungen und TGÜ', '31.KFG-Nov.Vbl.Erl.TxtGGÜ 14.10.2011', 'Materialien (Vorblatt, Erläuterungen und TGG)']) {
      const flat = flattenRisRecord(record([{ ...urls('Material', 'Xml', xml), Name: name }]))!
      expect(flat.textComparisonBundles.map((u) => u.xml), name).toEqual([xml])
      expect(flat.textComparisonCandidates, name).toEqual([])
    }
    // The Vorblatt alone is no bundle, and an embedded image of the bundle
    // („Material-COO_….gif") carries no format at all.
    for (const name of ['begVorblatt_WFA', 'Material-COO_2026_100_2_1759915_Temp.gif']) {
      expect(flattenRisRecord(record([{ ...urls('Material', 'Xml', xml), Name: name }]))!.textComparisonBundles, name).toEqual([])
    }
    // Strictly additive: beside an older name or a named annex, no bundle.
    for (const other of ['begtxt', 'Textgegenüberstellung']) {
      const flat = flattenRisRecord(
        record([
          { ...urls('Material', 'Xml', xml), Name: 'begmat' },
          { ...urls('Material', 'Xml', 'https://ogd.ris.bka.gv.at/t.xml'), Name: other },
        ]),
      )!
      expect(flat.textComparisonBundles, other).toEqual([])
    }
  })

  it('sammelt alles Übrige, was der Satz an Text führt', () => {
    // Measured on 22.09.2026: 41 text documents over the running records,
    // the four named fields catch 25. The full-text search reads the rest
    // (§12.31), and one record can have several of them.
    const flat = flattenRisRecord(
      record([
        urls('MainDocument', 'Xml', 'https://ogd.ris.bka.gv.at/m.xml'),
        { ...urls('Material', 'Xml', 'https://ogd.ris.bka.gv.at/e.xml'), Name: 'Erläuterungen' },
        { ...urls('Material', 'Pdf', 'https://ogd.ris.bka.gv.at/wfa.pdf'), Name: 'WFA' },
        { ...urls('Material', 'Pdf', 'https://ogd.ris.bka.gv.at/dc.pdf'), Name: 'Digi-Ready-Check' },
      ]),
    )!
    // Whatever has a field of its own does NOT stand in the list again.
    expect(flat.otherDocuments.map((d) => d.name)).toEqual(['WFA', 'Digi-Ready-Check'])
    expect(flat.otherDocuments[0]!.urls.pdf).toBe('https://ogd.ris.bka.gv.at/wfa.pdf')
  })

  it('liest die Erläuterungen unter der Abkürzung des Ressorts (27.09.2026)', () => {
    // „EB" is not one form but three with „Erl" and the decomposed „ä" (§12.31):
    // 6 of 139 GP-XXVIII Gesetzesentwürfe showed no Allgemeiner Teil for it.
    for (const name of ['Entwurf EB Klimagesetz', 'SVÄG_2024_EB_19.04.2024', 'EBs_TAMG_final', '42. KFG-Nov. Erl. 11.05.2026', 'Pol-W-G Erl', 'Erläuternde Bemerkungen', 'Mobilpaket  Erläut', 'begerl']) {
      const flat = flattenRisRecord(record([{ ...urls('Material', 'Xml', 'https://ogd.ris.bka.gv.at/eb.xml'), Name: name }]))!
      expect(flat.explanations?.xml, name).toBe('https://ogd.ris.bka.gv.at/eb.xml')
      expect(flat.otherDocuments, name).toEqual([])
    }
    // „EB" only in capitals; „Erledigung" and „Erlass" are other words.
    for (const name of ['Erledigung (Einladung zur Begutachtung)', 'Erlass-VO-561_Entwurf', 'Webinar eb', 'WFA']) {
      const flat = flattenRisRecord(record([{ ...urls('Material', 'Xml', 'https://ogd.ris.bka.gv.at/x.xml'), Name: name }]))!
      expect(flat.explanations, name).toBeNull()
    }
  })

  it('zählt ein eingebettetes Bild nicht als Dokument', () => {
    // A record carries formulae and logos as GIFs; without a readable format
    // a reference is not a document.
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
   * (`server/utils/ris/risOnly.ts`). It lives here because the cached module
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
