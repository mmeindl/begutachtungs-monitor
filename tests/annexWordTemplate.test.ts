import { describe, expect, it } from 'vitest'
import { parseTextComparison } from '../server/utils/annex/comparisonRows'
import { wordTemplateAsRis } from '../server/utils/annex/wordTemplate'

const td = (width: number, inner: string, colspan?: number) => `<td width=${width}${colspan ? ` colspan=${colspan}` : ''} valign=top>${inner}</td>`
const p = (cls: string, text: string) => `<p class=${cls}>${text}</p>`
const gld = (d: string) => `<span class=991GldSymbol>&sect;&nbsp;${d}</span>`
const header = (spacer = false) => `<tr>${spacer ? `<td width=5><p class='MsoNormal'>&nbsp;</td>` : ''}${td(448, p('89TGUEUeberschrSpalte', 'Geltende Fassung'), 2)}${td(448, p('89TGUEUeberschrSpalte', 'Vorgeschlagene Fassung'), 2)}</tr>`
const doc = (...rows: string[]) => `<html><body><table>${rows.join('')}</table></body></html>`
const pairs = (html: string) => parseTextComparison(html).rows.filter((r) => r.kind === 'pair')

describe('Parliament\'s Word template, read as RIS is', () => {
  it('leaves a document without the template\'s classes untouched', () => {
    const xml = '<table><tr><td colspan="2"><ueberschrift typ="para">Tarif</ueberschrift></td></tr></table>'
    expect(wordTemplateAsRis(xml)).toBe(xml)
  })

  it('reads the columns by width, so an empty left cell is no spacer (XXVII 353 d.B., § 55)', () => {
    const rows = pairs(doc(
      header(true),
      `<tr>${td(448, p('51Abs', `${gld('55.')} (1) bis (47) ...`), 2)}${td(448, p('51Abs', `${gld('55.')} (1) bis (47) ...`), 2)}<td width=4><p class='MsoNormal'>&nbsp;</td></tr>`,
      `<tr>${td(448, p('51Abs', '&nbsp;'), 2)}${td(448, p('51Abs', '(48) Neuer Absatz.'), 2)}<td width=4><p class='MsoNormal'>&nbsp;</td></tr>`,
    ))
    expect(rows[1]).toMatchObject({ current: '', proposed: '(48) Neuer Absatz.', change: 'inserted', para: '§ 55.' })
  })

  it('keeps the same pair on one side each however the grid cuts it (XXVII 285 d.B.)', () => {
    const rows = pairs(doc(
      `<tr>${td(448, p('89TGUEUeberschrSpalte', 'Geltende Fassung'), 2)}${td(448, p('89TGUEUeberschrSpalte', 'Vorgeschlagene Fassung'))}<td width=5 colspan=2><p class='MsoNormal'>&nbsp;</td></tr>`,
      `<tr>${td(443, p('51Abs', `${gld('8.')} (1) alt`))}${td(455, p('51Abs', `${gld('8.')} (1) neu`), 3)}<td width=3><p class='MsoNormal'>&nbsp;</td></tr>`,
    ))
    expect(rows[0]).toMatchObject({ gld: '§ 8.', current: '(1) alt', proposed: '(1) neu' })
  })

  it('hands a one-sided § heading to the § below it (XXVII 2048 d.B., ASVG § 786)', () => {
    const rows = pairs(doc(
      header(),
      `<tr>${td(448, p('51Abs', `${gld('785.')} (1) Text`), 2)}${td(448, p('51Abs', `${gld('785.')} (1) Text`), 2)}</tr>`,
      `<tr>${td(448, p('51Abs', '&nbsp;'), 2)}${td(448, p('45UeberschrPara', 'Schlussbestimmungen zu Art. 4'), 2)}</tr>`,
      `<tr>${td(448, p('51Abs', '&nbsp;'), 2)}${td(448, p('51Abs', `${gld('786.')} (1) Neu`), 2)}</tr>`,
    ))
    expect(rows.find((r) => r.proposed === 'Schlussbestimmungen zu Art. 4')?.para).toBe('§ 786.')
  })

  it('keeps a table of the law inside its column (XXVII 287 d.B., Flugabgabegesetz § 5)', () => {
    const inner = `<table><tr><td width=220>${p('61TabText', 'Kurzstrecke')}</td><td width=218>${p('61TabText', '3,50 Euro')}</td></tr></table>`
    const rows = pairs(doc(
      header(),
      `<tr>${td(448, p('51Abs', `${gld('5.')} (1) Die Abgabe`), 2)}${td(448, p('51Abs', `${gld('5.')} (1) Die Abgabe`), 2)}</tr>`,
      `<tr>${td(448, inner, 2)}${td(448, p('23SatznachNovao', '&nbsp;'), 2)}</tr>`,
    ))
    expect(rows[1]).toMatchObject({ current: 'Kurzstrecke | 3,50 Euro', proposed: '', change: 'removed' })
  })

  it('reads an empty Gliederungssymbol as no designation (XXVII 862 d.B., SchUG § 37)', () => {
    const rows = pairs(doc(
      header(),
      `<tr>${td(448, p('51Abs', `${gld('37.')} (1) …`), 2)}${td(448, p('51Abs', `${gld('37.')} (1) …`), 2)}</tr>`,
      `<tr>${td(448, p('51Abs', '<span class=991GldSymbol>&nbsp;</span>'), 2)}${td(448, p('51Abs', '(1a) Neu.'), 2)}</tr>`,
    ))
    expect(rows[1]).toMatchObject({ gld: null, para: '§ 37.', proposed: '(1a) Neu.' })
  })

  it('opens a schedule only where the line says so (XXVII 2048 d.B., ASVG § 736)', () => {
    const rows = pairs(doc(
      header(),
      `<tr>${td(448, p('51Abs', `${gld('736.')} (1) …`), 2)}${td(448, p('51Abs', `${gld('736.')} (1) …`), 2)}</tr>`,
      `<tr>${td(448, p('51Abs', '&nbsp;'), 2)}${td(448, p('71Anlagenbez', 'IKT rückwirkend 5.5.2023'), 2)}</tr>`,
    ))
    expect(rows[1]).toMatchObject({ para: '§ 736.', proposed: 'IKT rückwirkend 5.5.2023' })
  })

  it('still opens a schedule from the template\'s class', () => {
    const rows = pairs(doc(
      header(),
      `<tr>${td(448, p('51Abs', `${gld('9.')} (1) Text`), 2)}${td(448, p('51Abs', `${gld('9.')} (1) Text`), 2)}</tr>`,
      `<tr>${td(448, p('71Anlagenbez', 'Anlage 1'), 2)}${td(448, p('71Anlagenbez', 'Anlage 1'), 2)}</tr>`,
    ))
    expect(rows.at(-1)?.para).toBe('Anlage 1')
  })
})
