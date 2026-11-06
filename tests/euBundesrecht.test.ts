import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { hintWindowParagraphs, askedOfLawInForce, bundesrechtHits, bundesrechtPhrase, bundesrechtSearchParams, transposesAct, typCountsAsBundesrecht } from '../server/utils/eu/bundesrecht'

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/eu/${name}`, import.meta.url), 'utf8'))

/* Rule D4, widened (§12.66): an act a Paragraph of Bundesrecht in force transposes gets no deadline line. */
describe('the law in force, asked over all of Bundesrecht', () => {
  it('is asked about every transposed act, dated or not — not about a regulation carried out elsewhere too (05.11.2026)', () => {
    expect(askedOfLawInForce('richtlinie')).toBe(true)
    expect(askedOfLawInForce('rahmenbeschluss')).toBe(true)
    expect(askedOfLawInForce('verordnung')).toBe(false)
    expect(askedOfLawInForce('beschluss')).toBe(false)
  })

  it('asks for the number as the laws write it, in both citation forms', () => {
    expect(bundesrechtPhrase('Richtlinie (EU) 2024/1069')).toBe('2024/1069')
    expect(bundesrechtPhrase('Richtlinie 2009/31/EG')).toBe('2009/31/EG')
    // Up to 1998 the number alone („94/22"), four digits and the suffix from 1999 on: the laws write
    // the organisation as they please (Burgenland: „76/207/EG" for 76/207/EWG), every hit is read by CELEX.
    expect(bundesrechtPhrase('Richtlinie 94/22/EG')).toBe('94/22')
    expect(bundesrechtPhrase('Richtlinie 76/207/EWG')).toBe('76/207')
    expect(bundesrechtPhrase('Richtlinie 1998/70/EG')).toBe('98/70')
    expect(bundesrechtPhrase('Verordnung (EWG) Nr. 1408/71')).toBe('1408/71')
    expect(bundesrechtPhrase('Richtlinie 1999/62/EG')).toBe('1999/62/EG')
    expect(bundesrechtPhrase('Verordnung (EG) Nr. 1907/2006')).toBe('1907/2006')
    expect(bundesrechtPhrase('IE-Richtlinie')).toBeNull()
    expect(bundesrechtSearchParams('2009/31/EG', '2025-07-07')).toEqual({ Suchworte: '"2009/31/EG"', 'Fassung.FassungVom': '2025-07-07', DokumenteProSeite: 'OneHundred' })
  })

  it('counts a Bundesgesetz, not a Staatsvertrag whose annex lists the act', () => {
    expect(typCountsAsBundesrecht('BG')).toBe(true)
    expect(typCountsAsBundesrecht('V')).toBe(true)
    expect(typCountsAsBundesrecht('Vertrag – Multilateral')).toBe(false)
    expect(typCountsAsBundesrecht('Vereinbarung gemäß Art. 15a B-VG')).toBe(false)
    expect(typCountsAsBundesrecht(undefined)).toBe(false)
  })

  it('reads a real answer: the Paragraphs of laws and regulations with their XML, the treaty left out, the total kept', () => {
    const { total, hits } = bundesrechtHits(fixture('brkons-2009-31-EG.json'))
    expect(total).toBe(18)
    expect(hits.map((h) => h.kurztitel)).toEqual(['Abfallwirtschaftsgesetz 2002', 'Kraftstoffverordnung 2012'])
    expect(hits[0]).toMatchObject({ nor: 'NOR40239297', xmlUrl: 'https://ogd.ris.bka.gv.at/Dokumente/Bundesnormen/NOR40239297/NOR40239297.xml' })
    expect(bundesrechtHits(fixture('brkons-2024-1069.json'))).toEqual({ total: 0, hits: [] })
    expect(bundesrechtHits({})).toEqual({ total: 0, hits: [] })
  })

  it('tells a Paragraph that transposes the act from one that merely refers to it', () => {
    const umsetzung = 'Umsetzungshinweis\n§ 30. Mit diesem Bundesgesetz wird die Richtlinie (EU) 2022/2464 des Europäischen Parlaments und des Rates vom 14. Dezember 2022, ABl. Nr. L 322 vom 16.12.2022 S. 15, umgesetzt.'
    const bezug = '§ 2. Unternehmen im Sinne der Richtlinie (EU) 2022/2464 haben den Bericht nach § 5 zu veröffentlichen.'
    expect(transposesAct(umsetzung, '32022L2464')).toBe(true)
    expect(transposesAct(umsetzung, '32024L1069')).toBe(false)
    expect(transposesAct(bezug, '32022L2464')).toBe(false)
    expect(transposesAct('§ 2. Mit diesem Bundesgesetz werden die erforderlichen begleitenden Regelungen zur Verordnung (EU) 2023/2631 getroffen.', '32023R2631')).toBe(true)
  })
})

/* The § a hint window's Novellierungsanordnung addresses — what D4 and the quoted Ziffer's gate read in force. */
describe('hintWindowParagraphs', () => {
  it('reads the § comparison\'s address where it has one', () => {
    expect(hintWindowParagraphs('1. In § 3 wird folgender Abs. 3 angefügt:')).toEqual(['§ 3'])
    expect(hintWindowParagraphs('3. In § 12 Z 4 wird folgender Spiegelstrich angefügt:')).toEqual(['§ 12'])
  })

  it('reads the § where only a unit below it has no level (Extraktionslösungsmittelverordnung, 06.11.2026)', () => {
    expect(hintWindowParagraphs('2. In § 5 wird am Ende des dritten Spiegelstrichs der Punkt durch einen Beistrich ersetzt; danach wird folgender Spiegelstrich angefügt:')).toEqual(['§ 5'])
    expect(hintWindowParagraphs('3. § 6 Abs. 2 sublit. aa lautet:')).toEqual(['§ 6'])
  })

  it('keeps any other refusal one — a renumbered § names the new number, not the § in force', () => {
    expect(hintWindowParagraphs('17. Der bisherige "§ 7" erhält die Bezeichnung "§ 8" und lautet:')).toEqual([])
  })
})
