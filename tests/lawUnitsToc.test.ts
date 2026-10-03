import { describe, expect, it } from 'vitest'
import { parseLawUnitsFromRis } from '../server/utils/lawtext/lawUnits'

const doc = (body: string) => `<risdok><nutzdaten><abschnitt>${body}</abschnitt></nutzdaten></risdok>`
const toc = (n: number, title: string) => `<absatz typ="abs" halign="j"><gldsym>Artikel ${n}</gldsym> – ${title}</absatz>`
const article = (n: number, title: string) =>
  `<ueberschrift typ="g1">Artikel ${n}</ueberschrift><ueberschrift typ="g2">${title}</ueberschrift>` +
  `<absatz typ="promkleinlsatz">Das Gesetz, BGBl. Nr. ${n}/2000, wird wie folgt geändert:</absatz>` +
  `<absatz typ="novao1">1. In § ${n} wird das Wort „a" durch das Wort „b" ersetzt.</absatz>`

// XXVI 93/ME, XXVII 115/ME (03.10.2026): the package's table of contents
// came out as units under the bill title and was reported as a dropped law.
describe('parseLawUnitsFromRis: a package table of contents is no law', () => {
  it('drops the entries whose Artikel the document opens — even where the entry misnames it', () => {
    const units = parseLawUnitsFromRis(doc(
      `<ueberschrift typ="titel">Bundesgesetz, mit dem das Hochschulgesetz 2005 und das Bankwesengesetz geändert werden</ueberschrift>` +
      toc(1, 'Änderung des Hochschulgesetzes 2002') + toc(2, 'Änderung des Bankwesengesetzes') +
      article(1, 'Änderung des Hochschulgesetzes 2005') + article(2, 'Änderung des Bankwesengesetzes'),
    ))
    expect(units.map((u) => `${u.article} ${u.id}`)).toEqual([
      'Änderung des Hochschulgesetzes 2005 Z1',
      'Änderung des Bankwesengesetzes Z1',
    ])
  })

  it('keeps a law built from Artikel, which opens no package Artikel', () => {
    const units = parseLawUnitsFromRis(doc(
      `<ueberschrift typ="titel">Bundesverfassungsgesetz über etwas</ueberschrift>` + toc(1, 'Dies gilt.') + toc(2, 'Das auch.'),
    ))
    expect(units.map((u) => u.id)).toEqual(['Art.1', 'Art.2'])
  })
})
