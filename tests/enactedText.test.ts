import { describe, expect, it } from 'vitest'
import { draftArticles } from '../server/utils/lawtext/draftArticles'
import { enactedLawsOf, otherArticlesOf } from '../server/utils/lawtext/enactedText'
import { parseRisXml, risFootnotes, risTables } from '../server/utils/lawtext/risXml'

const doc = (body: string) => `<risdok><nutzdaten><abschnitt>${body}</abschnitt></nutzdaten></risdok>`
const parse = (body: string) => {
  const blocks = parseRisXml(doc(body))
  return { blocks, articles: draftArticles(blocks) }
}
const para = (n: number, heading: string, text: string) =>
  `<ueberschrift typ="para">${heading}</ueberschrift><absatz typ="abs"><gldsym>§ ${n}.</gldsym> ${text}</absatz>`
const law = (body: string) => `<ueberschrift typ="titel">Bundesgesetz über Neues (Neugesetz)</ueberschrift>${body}`
const paragraphs = (body: string) => enactedLawsOf(parse(law(body)))[0]!.paragraphs

describe('a new law as its draft prints it', () => {
  it('opens the next § with the structure heading between two §§', () => {
    const [, second] = paragraphs(`${para(1, 'Ziel', 'Eins.')}<ueberschrift typ="g1">2. Abschnitt</ueberschrift><ueberschrift typ="g2">Behörden</ueberschrift>${para(2, 'Behörde', 'Zwei.')}`)
    expect(second).toMatchObject({ id: '§ 2', heading: 'Behörde', before: ['2. Abschnitt', 'Behörden'] })
  })

  it('makes an Anlage a unit of its own, with its subheading, instead of text of the last §', () => {
    const units = paragraphs(`${para(1, 'Ziel', 'Eins.')}<ueberschrift typ="anlage">Anlage 1</ueberschrift><ueberschrift typ="anlage">(zu § 1)</ueberschrift><absatz typ="abs">Der Inhalt.</absatz>`)
    expect(units.map((u) => u.id)).toEqual(['§ 1', 'Anlage 1'])
    expect(units[0]!.lines.map((l) => l.text)).toEqual(['Eins.'])
    expect(units[1]).toMatchObject({ heading: '(zu § 1)', lines: [{ text: 'Der Inhalt.' }] })
  })

  it('keeps a formula RIS sets as a heading in its place inside the §', () => {
    const [unit] = paragraphs(`${para(1, 'Berechnung', 'Es gilt:')}<ueberschrift typ="g1">A = B × C</ueberschrift><absatz typ="abs">Dabei ist A der Betrag.</absatz>`)
    expect(unit!.lines.map((l) => [l.text, l.heading ?? false])).toEqual([['Es gilt:', false], ['A = B × C', true], ['Dabei ist A der Betrag.', false]])
  })

  it('joins a raised or lowered run to its word, keeps a space set inside the run, and leaves the compared text alone', () => {
    const body = law(para(1, 'Werte', 'Je m<super>3</super> und N<sub>3 </sub>einem Wert.'))
    const [unit] = enactedLawsOf(parse(body))[0]!.paragraphs
    expect(unit!.lines[0]!.text).toBe('Je m3 und N3 einem Wert.')
    expect(unit!.lines[0]!.parts).toContainEqual({ text: '3', pos: 'sup' })
    expect(unit!.lines[0]!.parts).toContainEqual({ text: '3', pos: 'sub' })
    expect(parse(body).blocks.find((b) => b.parts)!.text).toContain('m 3')
  })

  it('reads the footnotes no block carries', () => {
    expect(risFootnotes('<fnen><fntext typ="f" nr="1"> Zur Ermittlung.</fntext></fnen>')).toEqual([{ nr: '1', text: 'Zur Ermittlung.' }])
  })

  const cell = (t: string) => `<td class="x"><absatz typ="tabtext">${t}</absatz></td>`
  const LIMITS = '<table id="T" title="Grenzwerte"><tr>' + ['<b>Stoff</b>', '<b>MW1</b>', '<b>TMW</b>'].map(cell).join('') + '</tr>' +
    `<tr>${cell('Schwefeldioxid')}<td class="x"/>${cell('120')}</tr><tr><td class="x" colspan="2"><absatz typ="tabtext">PM<sub>10</sub></absatz></td><td class="x"><nbsp/></td></tr></table>`

  it('keeps a table in rows and columns, empty cells and spans included', () => {
    const [t] = risTables(doc(LIMITS))
    expect(t!.title).toBe('Grenzwerte')
    expect(t!.rows.map((row) => row.map((c) => c.lines.map((l) => l.text).join(' ')))).toEqual([['Stoff', 'MW1', 'TMW'], ['Schwefeldioxid', '', '120'], ['PM10', '']])
    expect(t!.rows[0]!.every((c) => c.header)).toBe(true)
    expect(t!.rows[1]!.some((c) => c.header)).toBe(false)
    expect(t!.rows[2]![0]).toMatchObject({ colspan: 2, lines: [{ text: 'PM10', parts: [{ text: 'PM' }, { text: '10', pos: 'sub' }] }] })
  })

  it('drops a row that holds nothing, but not one a rowspan reaches into', () => {
    const [spacers] = risTables(doc(`<table><tr>${cell('A')}${cell('B')}</tr><tr><td class="x"/><td class="x"/></tr><tr>${cell('C')}${cell('D')}</tr><tr><td class="x"/><td class="x"/></tr></table>`))
    expect(spacers!.rows.map((row) => row[0]!.lines[0]!.text)).toEqual(['A', 'C'])
    const [spanned] = risTables(doc(`<table><tr><td class="x" rowspan="2"><absatz typ="tabtext">A</absatz></td>${cell('B')}</tr><tr><td class="x"/></tr></table>`))
    expect(spanned!.rows).toHaveLength(2)
  })

  it('keeps an underlined run, which is how RIS draws a fraction\'s bar', () => {
    const [t] = risTables(doc(`<table><tr><td class="x"><absatz typ="tabtext"><u>Zähler</u></absatz><absatz typ="tabtext">Nenner</absatz></td></tr></table>`))
    expect(t!.rows[0]![0]!.lines).toEqual([{ text: 'Zähler', parts: [{ text: 'Zähler', pos: 'u' }] }, { text: 'Nenner' }])
  })

  it('claims no header for a table bold throughout', () => {
    const [t] = risTables(doc(`<table><tr>${cell('<b>A</b>')}${cell('<b>B</b>')}</tr><tr>${cell('<b>C</b>')}${cell('<b>D</b>')}</tr></table>`))
    expect(t!.rows.flat().some((c) => c.header)).toBe(false)
  })

  it('prints a table as one line of its §, with the cells for the search', () => {
    const body = law(`${para(1, 'Werte', 'Es gelten:')}${LIMITS}<absatz typ="abs">Danach.</absatz>`)
    const [unit] = enactedLawsOf(parse(body), risTables(doc(body)))[0]!.paragraphs
    expect(unit!.lines.map((l) => (l.grid ? 'GRID' : l.text))).toEqual(['Es gelten:', 'GRID', 'Danach.'])
    expect(unit!.lines[1]!.text).toContain('Schwefeldioxid 120')
    expect(unit!.lines.some((l) => l.table)).toBe(false)
  })

  it('falls back to the run of cells, flagged, where the grid does not hold every cell of the parse', () => {
    const body = law(`${para(1, 'Werte', 'Es gelten:')}${LIMITS}`)
    const other = risTables(doc(LIMITS.replace('120', '121')))
    const [unit] = enactedLawsOf(parse(body), other)[0]!.paragraphs
    expect(unit!.lines.some((l) => l.grid)).toBe(false)
    expect(unit!.lines.find((l) => l.text === '120')).toMatchObject({ table: true })
    const [unknown] = enactedLawsOf(parse(body))[0]!.paragraphs
    expect(unknown!.lines.some((l) => l.grid)).toBe(false)
  })

  it('keeps a one-column table as a table: a fraction is set that way (297/ME XXVII)', () => {
    const body = law(`${para(1, 'Satz', 'Der Satz ist:')}<table><tr>${cell('Zähler')}</tr><tr>${cell('Nenner')}</tr></table>`)
    const [unit] = enactedLawsOf(parse(body), risTables(doc(body)))[0]!.paragraphs
    expect(unit!.lines[1]!.grid!.rows.map((row) => row[0]!.lines[0]!.text)).toEqual(['Zähler', 'Nenner'])
    expect(unit!.lines.some((l) => l.table)).toBe(false)
  })

  it('prints an Artikel without a § beside the law it stands with (139/ME XXVIII)', () => {
    const draft = parse('<ueberschrift typ="art">Artikel 1</ueberschrift><ueberschrift typ="g1">Aufhebung des Altgesetzes</ueberschrift><absatz typ="abs">Das Altgesetz tritt außer Kraft.</absatz>' +
      `<ueberschrift typ="art">Artikel 2</ueberschrift><ueberschrift typ="g1">Bundesgesetz über Neues</ueberschrift>${para(1, 'Ziel', 'Eins.')}`)
    expect(otherArticlesOf(draft)).toMatchObject([{ id: 'Artikel 1', heading: 'Aufhebung des Altgesetzes', lines: [{ text: 'Das Altgesetz tritt außer Kraft.' }] }])
    expect(enactedLawsOf(draft).map((l) => l.law)).toEqual(['Bundesgesetz über Neues'])
  })
})
