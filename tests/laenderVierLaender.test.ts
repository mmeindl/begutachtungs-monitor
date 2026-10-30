/**
 * The four Länder read since 30.10.2026 — Burgenland, Niederösterreich,
 * Steiermark, Vorarlberg — against their pages as served that day
 * (`tests/fixtures/laender/*-2026-10-30.html`, trimmed to what the parsers
 * read; Burgenland's archive only with panels whose Stellungnahmen come from
 * organisations, so no private person's name enters the repository).
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { bgldNextPage, bgldSubmitter, bgldUnidYear, parseBgldPage } from '../server/utils/laender/burgenland'
import { draftKindOfTitle, landDate } from '../server/utils/laender/draftKind'
import { LandSourceError } from '../server/utils/laender/gate'
import { noeDraftUrl, parseNoeDraftPage, parseNoeList } from '../server/utils/laender/niederoesterreich'
import { LandSiteBlockedError, SitePacer, documentLink, documentLinkParts } from '../server/utils/laender/session'
import { STMK_PERIODS, isStmkDocumentUrl, parseStmkDraftPage, parseStmkRows, stmkPageSizes, stmkPartsOf, stmkRowCount, stmkRowsPostback } from '../server/utils/laender/steiermark'
import { parseVbgList } from '../server/utils/laender/vorarlberg'

const fx = (name: string) => readFileSync(`tests/fixtures/laender/${name}`, 'utf8')

describe('landDate', () => {
  it('reads every form the four Länder write a date in', () => {
    expect(landDate('Nov 5, 2026')).toBe('2026-11-05')
    expect(landDate('Oct 28, 2026')).toBe('2026-10-28')
    expect(landDate('10. November 2026')).toBe('2026-11-10')
    expect(landDate('3. Jänner 2027')).toBe('2027-01-03')
    expect(landDate('05.11.2026')).toBe('2026-11-05')
    expect(landDate('2026-11-05')).toBe('2026-11-05')
  })
  it('refuses what is no date, rather than guess', () => {
    expect(landDate('Feb 30, 2026')).toBeNull()
    expect(landDate('demnächst')).toBeNull()
  })
})

describe('draftKindOfTitle', () => {
  it('takes the first of the two words the title names', () => {
    expect(draftKindOfTitle('Entwurf eines Gesetzes, mit dem das Burgenländische Straßengesetz 2005 geändert wird')).toBe('gesetz')
    expect(draftKindOfTitle('Verordnung, mit der die Übertragung von Zuständigkeiten des Burgenländischen Kinder- und Jugendhilfegesetzes festgesetzt wird')).toBe('verordnung')
    expect(draftKindOfTitle('NÖ Sozialbetreuungsberufe-Ausbildungsverordnung 2007 (NÖ SBB-AV 2007), Änderung')).toBe('verordnung')
    expect(draftKindOfTitle('Dienstrechts-Novelle 2026 – NÖ Landes-Bedienstetengesetz (NÖ LBG), Änderung')).toBe('gesetz')
  })
})

describe('Burgenland', () => {
  const current = parseBgldPage(fx('burgenland-aktuell-2026-10-30.html'), 'https://apps.bgld.gv.at/web/landesrecht.nsf/begutachtungen_aktuell.xsp')
  const archiveHtml = fx('burgenland-abgeschlossen-gesetz-2026-2026-10-30.html')
  const archive = parseBgldPage(archiveHtml, 'https://apps.bgld.gv.at/web/landesrecht.nsf/begutachtungen_abgeschlossen.xsp?year=2026&typ=Gesetz', 'gesetz')

  it('reads the running list: title, the English-formatted Frist, documents, the first attachment as number', () => {
    expect(current).toHaveLength(4)
    const first = current[0]!.draft
    expect(first.id).toBe('bgld-d2a48001b3dfeeb0c1258e8a0025530a')
    expect(first.kind).toBe('verordnung')
    expect(first.deadline).toBe('2026-11-05')
    expect(first.startedAt).toBeNull()
    expect(first.documents.map((d) => d.title)).toEqual(['Entwurf und Erläuterungen', 'Anlage 1', 'Umweltbericht'])
    expect(first.documents[0]!.url).toMatch(/^https:\/\/apps\.bgld\.gv\.at\/web\/landesrecht\.nsf\/xsp\/.+\.pdf$/)
    expect(current.every((e) => e.statements.length === 0)).toBe(true)
  })

  it('reads the archive with its kind, its Frist and the Stellungnahmen, named only where certainly an organisation', () => {
    expect(archive.map((e) => e.draft.deadline)).toEqual(['2026-10-28', '2026-10-27', '2026-10-19'])
    expect(archive.every((e) => e.draft.kind === 'gesetz')).toBe(true)
    // „AK" is certain (`bgldSubmitter`); „Seniorenrat" the Bund's rule does not name: listed, without a name.
    expect(archive[2]!.statements.map((s) => s.name)).toEqual(['Arbeiterkammer', null])
  })

  it('expands only the labels whose meaning is certain, and names no surname and no bare place', () => {
    expect(bgldSubmitter('Stellungnahme BMJ')).toBe('Bundesministerium für Justiz')
    expect(bgldSubmitter('Stellungnahme IV Burgenland')).toBe('Industriellenvereinigung Burgenland')
    expect(bgldSubmitter('Stellungnahme Mustermann')).toBeNull()
    expect(bgldSubmitter('Stellungnahme Horitschon')).toBeNull()
    expect(bgldSubmitter('Stellungnahme SV')).toBeNull()
    expect(bgldSubmitter('Stellungnahme BGM Oberwart')).toBeNull()
  })

  it('names no private person from a Stellungnahme label', () => {
    const panel = (label: string) => archiveHtml.replace(/Stellungnahme Seniorenrat/g, label)
    const named = parseBgldPage(panel('Stellungnahme Maria Mustermann'), 'https://apps.bgld.gv.at/x', 'gesetz')
    expect(named.flatMap((e) => e.statements).map((s) => s.name)).not.toContain('Maria Mustermann')
  })

  it('finds the pager postback for the next page of a view', () => {
    const next = bgldNextPage(archiveHtml)
    expect(next?.action).toBe('/web/landesrecht.nsf/begutachtungen_abgeschlossen.xsp')
    expect(next?.form.get('$$xspsubmitid')).toBe('page:_id1:_id2:cb_content:pagerTop__Group__lnk__1')
    expect(next?.form.get('$$viewid')).toMatch(/^!.+!$/)
    expect(bgldNextPage(fx('burgenland-aktuell-2026-10-30.html'))).toBeNull()
  })

  it('dates a document id to its year, for the reader of one draft', () => {
    expect(bgldUnidYear('d2a48001b3dfeeb0c1258e8a0025530a')).toBe(2026)
    expect(bgldUnidYear('nothex')).toBeNull()
  })

  it('refuses a page that is not the list', () => {
    expect(() => parseBgldPage('<html><h1>Wartung</h1></html>', 'https://apps.bgld.gv.at/x')).toThrow(LandSourceError)
  })
})

describe('Niederösterreich', () => {
  it('reads the running list, without the information page that stands in it', () => {
    const list = parseNoeList(fx('niederoesterreich-liste-2026-10-30.html'))
    expect(list.map((d) => d.id)).toEqual([
      'noe-NOe_KJHG_Aenderung1',
      'noe-VO_NatSchG_Aenderung',
      'noe-NOe_Sozialbetreuungsberufe-AusbildungsVO_2007_Aenderung',
      'noe-NOe_LBG_DPL1972_LVBG_Aenderung',
      'noe-VO_Festsetzung_Hoechsttarife_Rauchfangkehrer',
      'noe-NOe_Lebensmittelkontrollgebuehrengesetz_(NOe_LMKGG)-_Aender',
    ])
    expect(list[1]).toMatchObject({ kind: 'verordnung', deadline: '2026-11-05', title: 'Verordnung über die Naturschutzgebiete, Änderung' })
  })

  it('reads a draft page: documents named without the draft\'s title and size, and the address', () => {
    const page = parseNoeDraftPage(fx('niederoesterreich-NOe_KJHG_Aenderung1-2026-10-30.html'), noeDraftUrl('NOe_KJHG_Aenderung1'))
    expect(page?.deadline).toBe('2026-10-30')
    expect(page?.documents.map((d) => d.title)).toEqual(['Entwurf', 'Erläuterungen', 'Textgegenüberstellung'])
    expect(page?.email).toBe('post.begutachtung@noel.gv.at')
  })

  it('takes a page without a Frist for no draft', () => {
    expect(parseNoeDraftPage('<h1 id="after-sidenav">Allgemeine Informationen</h1>', noeDraftUrl('Buergerbegutachtung_Allgemeininfo1'))).toBeNull()
  })

  it('refuses a page that is not the list', () => {
    expect(() => parseNoeList('<p>Diese Seite ist aus sicherheitstechnischen Gründen nicht erreichbar.</p>')).toThrow(LandSourceError)
  })
})

describe('Vorarlberg', () => {
  const list = parseVbgList(fx('vorarlberg-2026-10-30.html'))

  it('reads each block: title, Frist, the folder as number', () => {
    expect(list.map((d) => [d.id, d.deadline])).toEqual([['vbg-34682067', '2026-11-10'], ['vbg-34773103', '2026-11-20']])
    expect(list[0]!.title).toBe('Gesetz über eine Änderung des Vergabenachprüfungsgesetzes')
  })

  it('lists the Kunsttext as the Textgegenüberstellung it is, and the documents once', () => {
    expect(list[0]!.documents.map((d) => d.title)).toEqual(['Begutachtungsentwurf', 'Erläuternde Bemerkungen', 'Textgegenüberstellung (Kunsttext)'])
  })

  it('refuses a page without its heading', () => {
    expect(() => parseVbgList('<h1>Seite nicht gefunden</h1>')).toThrow(LandSourceError)
  })
})

describe('Steiermark', () => {
  const ref = '569af1a4-93f5-4285-bef6-4ef9de12a0db'
  const parsed = parseStmkDraftPage(fx('steiermark-569af1a4-2026-10-30.html'), ref)

  it('reads a draft page: start, Frist, title', () => {
    expect(parsed?.draft).toMatchObject({
      id: `stmk-${ref}`,
      kind: 'gesetz',
      title: 'Entwurf eines Gesetzes, mit dem das Steiermärkische Seveso-Betriebe Gesetz 2017 geändert wird',
      startedAt: '2025-02-26',
      deadline: '2025-03-14',
    })
  })

  it('links each document through the page, and each Stellungnahme by its place — never by its name', () => {
    expect(parsed?.draft.documents.map((d) => d.title)).toEqual(['Versendeschreiben', 'Stmk. Seveso-Betriebe Gesetz 2017 Entwurf', 'Vorblatt und Erläuterungen', 'Textgegenüberstellung'])
    expect(parsed?.draft.documents.every((d) => isStmkDocumentUrl(d.url))).toBe(true)
    expect(parsed?.statements).toEqual([{ name: 'Industriellenvereinigung Steiermark', url: `https://pallast2.stmk.gv.at/pallast-p/pub/document?ref=${ref}#stellungnahme-1` }])
  })

  it('numbers a closed period\'s drafts with the period\'s key, and reads them at its address', () => {
    const xviii = STMK_PERIODS.find((p) => p.gp === 'XVIII')!
    const old = parseStmkDraftPage(fx('steiermark-569af1a4-2026-10-30.html'), ref, xviii)!
    expect(old.draft.id).toBe(`stmk-18-${ref}`)
    expect(old.draft.url).toBe(`https://pallast2.stmk.gv.at/pallast-18-p/pub/document?ref=${ref}`)
    expect(old.draft.documents.every((d) => isStmkDocumentUrl(d.url))).toBe(true)
    expect(stmkPartsOf(`18-${ref}`)).toEqual({ period: xviii, ref })
    expect(stmkPartsOf(ref)?.period.gp).toBe('XIX')
    expect(stmkPartsOf(`16-${ref}`)).toBeNull()
  })

  it('takes another kind of Landtag document for no draft', () => {
    expect(parseStmkDraftPage('<h2>Selbstständiger Antrag von Abgeordneten (§ 21 GeoLT)</h2>', ref)).toBeNull()
  })

  it('reads the list\'s count, rows and page sizes, and builds the postback that asks for more', () => {
    const html = fx('steiermark-liste-2026-10-30.html')
    expect(stmkRowCount(html)).toBe(38)
    expect(parseStmkRows(html)).toHaveLength(10)
    // Only these: PALLAST answers a page size it does not offer with no rows at all.
    expect(stmkPageSizes(html)).toEqual([5, 10, 15, 25, 50, 100])
    const postback = stmkRowsPostback(html, 0, 50)
    expect(postback.form.get('contentForm:documentsTable_rows')).toBe('50')
    expect(postback.form.get('contentForm:documentSearchCriteriaPanel:documentTypeSelect_input')).toBe('BEGUTACHTUNGSVERFAHREN')
    expect(postback.form.get('javax.faces.ViewState')).toBeTruthy()
    expect(postback.headers['Faces-Request']).toBe('partial/ajax')
  })

  it('reads the rows of the partial response the postback answers with', () => {
    const xml = `<partial-response><changes><update id="contentForm:documentsTable"><![CDATA[<tr><td><a href="/pallast-p/pub/document?dswid=-1259&amp;ref=${ref}&amp;inner=false">Entwurf eines Gesetzes</a></td></tr>]]></update></changes></partial-response>`
    expect(parseStmkRows(xml)).toEqual([{ ref, title: 'Entwurf eines Gesetzes' }])
  })
})

describe('documentLink', () => {
  it('round-trips a page and a document name', () => {
    const url = documentLink('https://pallast2.stmk.gv.at/pallast-p/pub/document?ref=x', 'Vorblatt und Erläuterungen')
    expect(documentLinkParts(url)).toEqual({ page: 'https://pallast2.stmk.gv.at/pallast-p/pub/document?ref=x', label: 'Vorblatt und Erläuterungen' })
    expect(documentLinkParts('https://pallast2.stmk.gv.at/pallast-p/pub/document?ref=x#stellungnahme-1')).toBeNull()
  })
})

describe('SitePacer', () => {
  it('spaces the requests of every session, and goes silent after a block', async () => {
    const pacer = new SitePacer(50, 60_000)
    const started = Date.now()
    await Promise.all([pacer.turn(), pacer.turn(), pacer.turn()])
    // Three turns: the first at once, the others 50 and 100 ms later.
    expect(Date.now() - started).toBeGreaterThanOrEqual(95)
    pacer.block()
    await expect(pacer.turn()).rejects.toBeInstanceOf(LandSiteBlockedError)
  })
})
