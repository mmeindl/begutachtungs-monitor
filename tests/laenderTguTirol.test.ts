import { describe, expect, it } from 'vitest'
import { lawOfArticle, pageLines, tirolTguParagraphs, type TirolRun, type TirolTguPage } from '../server/utils/laender/landTguTirol'

/*
 * Synthetic pages in the geometry Tirol's Textgegenüberstellung has once
 * uprighted (23.10.2026): landscape, 842 wide, the left column from x 85,
 * the right one from x 439, § headings centred (x 235 / 589), every glyph
 * 5 pt wide at a font size of 10. A changed character is coloured, and a
 * rule 1.1 pt under its baseline underlines it, one 2.3 pt above strikes it.
 */
const LEFT = 85
const RIGHT = 439

type Mark = 'plain' | 'ins' | 'del'

interface Piece { s: string; mark?: Mark }

/** One line of runs from x, each piece a run of its own; its rules alongside. */
function line(x: number, y: number, ...pieces: (string | Piece)[]): { runs: TirolRun[]; rules: TirolTguPage['rules'] } {
  const runs: TirolRun[] = []
  const rules: TirolTguPage['rules'] = []
  let at = x
  for (const p of pieces.map((q) => (typeof q === 'string' ? { s: q } : q))) {
    const w = p.s.length * 5
    const coloured = p.mark && p.mark !== 'plain'
    runs.push({ s: p.s, x: at, y, w, h: 10, coloured: [...p.s].map(() => !!coloured), widths: [...p.s].map((c) => (c === ' ' ? -1 : 500)) })
    if (p.mark === 'ins') rules.push([at, y - 1.3, at + w, y - 0.9])
    if (p.mark === 'del') rules.push([at, y + 2.1, at + w, y + 2.5])
    at += w
  }
  return { runs, rules }
}

function page(...lines: { runs: TirolRun[]; rules: TirolTguPage['rules'] }[]): TirolTguPage {
  return { width: 842, runs: lines.flatMap((l) => l.runs), rules: lines.flatMap((l) => l.rules) }
}

const ins = (s: string): Piece => ({ s, mark: 'ins' })
const del = (s: string): Piece => ({ s, mark: 'del' })

describe('pageLines', () => {
  it('leaves out the underlined characters for the law in force and the struck ones for the draft', () => {
    const p = page(line(LEFT, 400, 'Die Frist beträgt ', del('zehn'), ins('vierzehn'), ' Tage.'))
    const [l] = pageLines(p, 1)!.left
    expect(l).toMatchObject({ old: 'Die Frist beträgt zehn Tage.', neu: 'Die Frist beträgt vierzehn Tage.', marked: true, unsure: false })
  })

  it('takes a coloured character without a rule as unsure, and a black one under a rule as well', () => {
    const coloured = page(line(LEFT, 400, 'Text ', { s: 'blau', mark: 'plain' }))
    coloured.runs[1]!.coloured = [true, true, true, true]
    expect(pageLines(coloured, 1)!.left[0]!.unsure).toBe(true)
    const ruled = page(line(LEFT, 400, 'schwarz unter Strich'))
    ruled.rules.push([LEFT, 401.9, LEFT + 100, 402.3])
    expect(pageLines(ruled, 1)!.left[0]!.unsure).toBe(true)
  })

  it('reads each column top to bottom, the left before the right', () => {
    const p = page(line(RIGHT, 500, 'rechts oben'), line(LEFT, 400, 'links unten'), line(LEFT, 500, 'links oben'))
    const cols = pageLines(p, 1)!
    expect(cols.left.map((l) => l.raw)).toEqual(['links oben', 'links unten'])
    expect(cols.right.map((l) => l.raw)).toEqual(['rechts oben'])
  })

  it('refuses a page whose columns no gutter parts', () => {
    const p = page(line(LEFT, 400, 'eine Zeile, die quer über die ganze Seite läuft und den Bundsteg überdeckt, wie eine Tabelle es tut'))
    expect(pageLines(p, 1)).toBeNull()
  })

  it('keeps a superscript on its line: „m²", not „m" and a line „2"', () => {
    const p = page(line(LEFT, 400, 'bis zu 50 m'))
    p.runs.push({ s: '2', x: LEFT + 55, y: 403, w: 3, h: 6, coloured: [false], widths: [500] })
    expect(pageLines(p, 1)!.left.map((l) => l.raw)).toEqual(['bis zu 50 m2'])
  })

  it('drops the space a left-out word leaves before a punctuation mark', () => {
    const p = page(line(LEFT, 400, 'stehenden Personen ', ins('sowie Lehrlinge'), '.'))
    expect(pageLines(p, 1)!.left[0]!.old).toBe('stehenden Personen.')
  })
})

describe('tirolTguParagraphs', () => {
  const laws = ['Tiroler Vergabenachprüfungsgesetz 2018']

  it('reads a § from its centred heading across the column break, and closes it at an elision note', () => {
    const p = page(
      line(LEFT, 500, '§§ 1 bis 3 unverändert.'),
      line(235, 480, '§ 4'),
      line(211, 465, 'Verfahrenshilfe'),
      line(LEFT + 20, 450, del('(1) Der alte Absatz eins des Paragraphen.')),
      line(RIGHT + 20, 500, ins('(1) Der neue Absatz eins des Paragraphen.')),
      line(RIGHT + 20, 480, '(2) Ein Absatz, der bleibt.'),
      line(RIGHT + 20, 460, '§ 5 unverändert.'),
      line(RIGHT, 440, 'Text nach der Auslassung, der zu keinem § gehört.'),
    )
    const [p4, ...rest] = tirolTguParagraphs([p], laws)
    expect(rest).toEqual([])
    expect(p4).toEqual({
      law: 'Tiroler Vergabenachprüfungsgesetz 2018',
      number: '4',
      old: ['Verfahrenshilfe', '(1) Der alte Absatz eins des Paragraphen.', '(2) Ein Absatz, der bleibt.'],
      neu: ['Verfahrenshilfe', '(1) Der neue Absatz eins des Paragraphen.', '(2) Ein Absatz, der bleibt.'],
      changed: true,
    })
  })

  it('takes a § struck whole and the same § underlined whole as one provision', () => {
    const p = page(
      line(235, 500, del('§ 26')),
      line(LEFT + 20, 480, del('Die alte Fassung.')),
      line(589, 500, ins('§ 26')),
      line(RIGHT + 20, 480, ins('Die neue Fassung.')),
    )
    expect(tirolTguParagraphs([p], laws)).toEqual([{ law: laws[0], number: '26', old: ['Die alte Fassung.'], neu: ['Die neue Fassung.'], changed: true }])
  })

  it('reads a § underlined whole as new and one struck whole as deleted', () => {
    const p = page(
      line(235, 500, ins('§ 4a')),
      line(LEFT + 20, 480, ins('Ganz neuer Text.')),
      line(235, 460, del('§ 4b')),
      line(LEFT + 20, 440, del('Ganz alter Text.')),
    )
    expect(tirolTguParagraphs([p], laws).map((x) => [x.number, x.old, x.neu])).toEqual([
      ['4a', [], ['Ganz neuer Text.']],
      ['4b', ['Ganz alter Text.'], []],
    ])
  })

  it('withholds a renumbered § and keeps the new one that takes its number', () => {
    // 723/2026: a new § 72 inserted, the old § 72 now § 74 — „§ 72 74" with 72 struck.
    const p = page(
      line(235, 500, ins('§ 72')),
      line(LEFT + 20, 480, ins('Die neue Übergangsbestimmung.')),
      line(589, 500, '§ ', del('72'), ins('74')),
      line(RIGHT + 20, 480, 'Inkrafttreten.'),
    )
    expect(tirolTguParagraphs([p], laws)).toEqual([{ law: laws[0], number: '72', old: [], neu: ['Die neue Übergangsbestimmung.'], changed: true }])
  })

  it('names a § with an unsure line as one without text, so the RIS check withholds it', () => {
    const p = page(line(235, 500, '§ 5'), line(LEFT + 20, 480, 'Text ', { s: 'blau', mark: 'plain' }))
    p.runs[2]!.coloured = [true, true, true, true]
    expect(tirolTguParagraphs([p], laws)).toEqual([{ law: laws[0], number: '5', old: [], neu: [], changed: true }])
  })

  it('withholds the § that runs onto a page without a gutter', () => {
    const first = page(line(235, 500, '§ 5'), line(LEFT + 20, 480, 'Anfang des Textes.'))
    const table = page(line(LEFT, 500, 'eine Zeile, die quer über die ganze Seite läuft und den Bundsteg überdeckt, wie eine Tabelle es tut'))
    expect(tirolTguParagraphs([first, table], laws)).toEqual([{ law: laws[0], number: '5', old: [], neu: [], changed: true }])
  })

  it('puts a changed § heading into the text compared, which would otherwise read „unverändert"', () => {
    const p = page(
      line(235, 500, '§ 52'),
      line(180, 485, 'Herstellung des Zustandes', ins(' nach Abbruch')),
      line(LEFT + 20, 470, '(1) Text, der bleibt.'),
    )
    const [p52] = tirolTguParagraphs([p], laws)
    expect(p52!.old).toEqual(['Herstellung des Zustandes (1) Text, der bleibt.'])
    expect(p52!.neu).toEqual(['Herstellung des Zustandes nach Abbruch (1) Text, der bleibt.'])
  })

  it('files a package\'s §§ under the law each Artikel names', () => {
    const p = page(
      line(224, 500, 'Artikel I'),
      line(124, 485, 'Änderung des Tiroler Raumordnungsgesetzes 2022'),
      line(235, 470, '§ 9'),
      line(LEFT + 20, 455, del('alt'), ins('neu')),
      line(222, 440, 'Artikel II'),
      line(149, 425, 'Änderung der Tiroler Bauordnung 2022'),
      line(235, 410, '§ 9'),
      line(LEFT + 20, 395, del('alt'), ins('neu')),
    )
    expect(tirolTguParagraphs([p], ['Tiroler Bauordnung 2022', 'Tiroler Raumordnungsgesetz 2022']).map((x) => [x.law, x.number])).toEqual([
      ['Tiroler Raumordnungsgesetz 2022', '9'],
      ['Tiroler Bauordnung 2022', '9'],
    ])
  })

  it('reads nothing from the text layer alone: without rules and colour a struck word reads like an added one', () => {
    expect(tirolTguParagraphs([{ width: 842, items: [{ x: 235, y: 500, width: 20, text: '§ 4' }], geometry: { runs: 1, offTurn: 0, skewed: 0 } }], laws)).toEqual([])
  })
})

describe('lawOfArticle', () => {
  it('turns the genitive back into the name', () => {
    expect(lawOfArticle('Änderung des Tiroler Raumordnungsgesetzes 2022', [])).toBe('Tiroler Raumordnungsgesetz 2022')
    expect(lawOfArticle('Änderung des Gesetzes über den Landeskulturfonds', [])).toBe('Gesetz über den Landeskulturfonds')
    expect(lawOfArticle('Änderung der Tiroler Bauordnung 2022', [])).toBe('Tiroler Bauordnung 2022')
    // 723/2026 prints the nominative already.
    expect(lawOfArticle('Änderung des Tiroler Gas-, Heizungs- und Klimaanlagengesetz 2013', [])).toBe('Tiroler Gas-, Heizungs- und Klimaanlagengesetz 2013')
  })

  it('prefers the name the draft\'s title uses', () => {
    expect(lawOfArticle('Änderung des Tiroler Patientenentschädigungsfonds-Gesetzes', ['Tiroler Patientenentschädigungsfonds-Gesetz'])).toBe('Tiroler Patientenentschädigungsfonds-Gesetz')
    expect(lawOfArticle('Inkrafttreten', [])).toBeNull()
  })
})
