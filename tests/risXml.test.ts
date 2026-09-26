import { describe, expect, it } from 'vitest'
import { parseRisXml } from '../server/utils/lawtext/risXml'

describe('the closing clause of an enumeration, under both RIS spellings', () => {
  // RIS writes the clause that closes a list under two names, depending on
  // the converter that produced the document: `<schlussteil>` (4.1) and
  // `<schluss typ="…">` (3.x). In a Begut main document both can occur.
  it('<schluss typ="Abs"> after the Ziffern continues the Absatz, in document order', () => {
    const xml = `<risdok><nutzdaten><abschnitt>
      <absatz typ="abs"><gldsym>§ 5.</gldsym> (1) Der Betreiber hat</absatz>
      <listelem typ="ziff">1. jede Änderung und</listelem>
      <listelem typ="ziff">2. jede Störung</listelem>
      <schluss typ="Abs">der Behörde unverzüglich anzuzeigen.</schluss>
      </abschnitt></nutzdaten></risdok>`
    const blocks = parseRisXml(xml)
    expect(blocks.map((b) => b.kind)).toEqual(['abs', 'ziff', 'ziff', 'abs'])
    expect(blocks[3]!.text).toBe('der Behörde unverzüglich anzuzeigen.')
    expect(blocks[3]!.cls).toBe('schluss/Abs')
  })

  it('both spellings in one document are read alike', () => {
    const xml = `<risdok><nutzdaten><abschnitt>
      <absatz typ="abs"><gldsym>§ 5.</gldsym> (1) Der Betreiber hat</absatz>
      <listelem typ="ziff">1. jede Änderung</listelem>
      <schluss typ="Ziff">oder</schluss>
      <listelem typ="ziff">2. jede Störung</listelem>
      <schlussteil ebene="0">der Behörde anzuzeigen.</schlussteil>
      </abschnitt></nutzdaten></risdok>`
    const texts = parseRisXml(xml).map((b) => `${b.kind}:${b.text}`)
    expect(texts).toEqual(['abs:(1) Der Betreiber hat', 'ziff:1. jede Änderung', 'abs:oder', 'ziff:2. jede Störung', 'abs:der Behörde anzuzeigen.'])
  })
})

describe('parseRisXml strips what RIS prints around the text, not in it', () => {
  /**
   * The page furniture: `kzinhalt` is the header, `fzinhalt` the footer, and
   * both are RIS's own, not the document's. The footer came through as an
   * ordinary Absatz until 22.09.2026 — measured over the offline cache, 180
   * of 314 readable Erläuterungen documents carried it into a passage the
   * section shows. The two sibling parsers (`lawtext/konsTree.ts`,
   * `annex/comparisonRows.ts`) stripped all of it from the start.
   */
  const xml = `<risdok><nutzdaten><abschnitt>
      <kzinhalt><absatz typ="kzinhalt">Erläuterungen</absatz></kzinhalt>
      <absatz typ="abs">Zu Z 4 (§ 54c): Die Frist wird verlängert.</absatz>
      <fzinhalt><absatz typ="fz">www.ris.bka.gv.at Seite 2 von 2</absatz></fzinhalt>
      </abschnitt></nutzdaten></risdok>`

  it('leaves no block carrying the RIS page footer', () => {
    const blocks = parseRisXml(xml)
    expect(blocks.some((b) => b.text.includes('www.ris.bka.gv.at'))).toBe(false)
    expect(blocks.some((b) => b.text.includes('Seite 2 von 2'))).toBe(false)
  })

  it('keeps the document text itself', () => {
    expect(parseRisXml(xml).map((b) => b.text)).toEqual(['Zu Z 4 (§ 54c): Die Frist wird verlängert.'])
  })
})

describe('a quotation cut into Novellentext around a dash (26.09.2026)', () => {
  const read = (inner: string) => parseRisXml(`<risdok><nutzdaten><absatz typ="novao2" ct="text">${inner}</absatz></nutzdaten></risdok>`).map((b) => b.text)

  it('reads the dash the ressort wrote, without the spaces the tags would make', () => {
    // Transparenzdatenbankgesetz 2012 § 40b, BGBl. I Nr. 62/2026: read as „ARF - oder KSF - Leistungen".
    expect(read('In § 40b Abs. 2 wird der Ausdruck <n>„ARF-Leistungen“</n> jeweils durch die Wortfolge <n>„ARF</n><gdash /><n> oder KSF</n><gdash /><n>Leistungen“</n> ersetzt.')).toEqual([
      'In § 40b Abs. 2 wird der Ausdruck "ARF-Leistungen" jeweils durch die Wortfolge "ARF- oder KSF-Leistungen" ersetzt.',
    ])
    expect(read('die Wortfolge <n><b>„Einnahmen aus ORF</b></n><gdash /><n><b>Beiträgen“</b></n> ersetzt.')).toEqual(['die Wortfolge "Einnahmen aus ORF-Beiträgen" ersetzt.'])
  })

  it('keeps every other Novellentext boundary a word boundary', () => {
    expect(read('der Ausdruck <n>„A“</n> durch den Ausdruck <n>„B“</n> ersetzt.')).toEqual(['der Ausdruck "A" durch den Ausdruck "B" ersetzt.'])
  })
})
