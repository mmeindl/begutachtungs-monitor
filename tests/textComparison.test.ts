import { describe, expect, it } from 'vitest'
import { isScanned, parseTextComparison, summarizeComparison } from '../server/utils/textComparison'

/** A Textgegenüberstellung in the shape RIS delivers (docs/api-exploration.md §2c). */
function annex(rows: string[]): string {
  return `<risdok><nutzdaten><abschnitt>
    <kzinhalt typ="p"><absatz typ="kz">Bundesrecht konsolidiert</absatz></kzinhalt>
    <ueberschrift typ="g2">Textgegenüberstellung</ueberschrift>
    <table id="Tabelle1">
      <tr><td><ueberschrift typ="tgue">Geltende Fassung</ueberschrift></td><td><ueberschrift typ="tgue">Vorgeschlagene Fassung</ueberschrift></td></tr>
      ${rows.join('')}
    </table></abschnitt></nutzdaten></risdok>`
}
const pair = (a: string, b: string) => `<tr><td>${a}</td><td>${b}</td></tr>`
const marked = (t: string) => `<span style="background:yellow">${t}</span>`

describe('parseTextComparison', () => {
  it('drops the repeated column headings and reads a paired row', () => {
    const rows = parseTextComparison(annex([pair('<absatz typ="abs"><gldsym>§ 5.</gldsym> (1) Alter Text.</absatz>', `<absatz typ="abs"><gldsym>§ 5.</gldsym> (1) ${marked('Neuer')} Text.</absatz>`)]))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'pair', gld: '§ 5.', change: 'changed', marked: true })
    expect(rows[0]!.current).toBe('§ 5. (1) Alter Text.')
  })

  it('spans an Artikel heading over both columns', () => {
    const rows = parseTextComparison(annex(['<tr><td colspan="2">Artikel 1 Änderung des Glücksspielgesetzes</td></tr>', pair('alt', 'neu')]))
    expect(rows[0]).toMatchObject({ kind: 'article', heading: 'Artikel 1 Änderung des Glücksspielgesetzes' })
  })

  it('reads an empty column as an insertion or a deletion', () => {
    const rows = parseTextComparison(annex([pair('', marked('26c. Neue Ziffer.')), pair('Alte Ziffer.', '')]))
    expect(rows.map((r) => r.change)).toEqual(['inserted', 'removed'])
  })

  it('marks the three-dots convention as elided, not as a change', () => {
    // Per the BKA Rundschreiben unchanged stretches are abbreviated this way.
    const rows = parseTextComparison(annex([pair('2. bis 26b. ...', '2. bis 26b. ...')]))
    expect(rows[0]).toMatchObject({ change: 'unchanged', elided: true, segments: null })
  })

  it('restores the space a marker loses against its text', () => {
    // RIS prints "<symbol>1.</symbol>Altersprädikat" with nothing in between.
    const rows = parseTextComparison(annex([pair('<listelem><symbol>1.</symbol>Altersprädikat: alt</listelem>', '<listelem><symbol>1.</symbol>Altersprädikat: neu</listelem>')]))
    expect(rows[0]!.current).toBe('1. Altersprädikat: alt')
  })

  it('separates an editorial change from a substantive one', () => {
    const rows = parseTextComparison(
      annex([
        pair('Gemäß § 4 Abs. 1 gilt Folgendes.', 'Gemäß § 4 Abs. 2 gilt Folgendes.'),
        pair('Die Behörde kann den Antrag ablehnen.', 'Die Behörde muss den Antrag ablehnen.'),
      ]),
    )
    expect(rows[0]!.editorial).toBe(true)
    expect(rows[1]!.editorial).toBe(false)
    expect(summarizeComparison(rows)).toMatchObject({ total: 2, changed: 2, editorial: 1 })
  })

  it('tells a scanned annex from an empty one', () => {
    // 40 % of the annexes are pages of GIFs; an empty parse must not read as
    // "nothing changed".
    const scan = '<risdok><nutzdaten><abschnitt><absatz typ="abbobj"><binary datatype="gif"><src>/x.gif</src></binary></absatz></abschnitt></nutzdaten></risdok>'
    expect(isScanned(scan)).toBe(true)
    expect(parseTextComparison(scan)).toEqual([])
    expect(isScanned(annex([pair('a', 'b')]))).toBe(false)
  })
})

describe('an annex that spans its columns', () => {
  // The rule "the first cell spans more than one column, so this is an Artikel
  // heading" only holds when each column is one cell wide. Where the header
  // itself reads colspan="2" twice, every ordinary pair row looked like a
  // heading: one annex turned 157 of 163 rows into headings (2026-09-09).
  const xml = `<table>
    <tr><td colspan="2">Geltende Fassung</td><td colspan="2">Vorgeschlagene Fassung</td></tr>
    <tr><td colspan="2"><gldsym>§ 5.</gldsym>Die Behoerde entscheidet.</td><td colspan="2">Das Gericht entscheidet.</td></tr>
    <tr><td colspan="4">Artikel 2</td></tr>
  </table>`

  it('reads a spanned pair row as a pair, not as a heading', () => {
    const rows = parseTextComparison(xml)
    const pair = rows.find((r) => r.kind === 'pair')!
    expect(pair.gld).toBe('§ 5.')
    expect(pair.current).toContain('Die Behoerde entscheidet.')
    expect(pair.proposed).toBe('Das Gericht entscheidet.')
    expect(pair.change).toBe('changed')
  })

  it('still reads a full-width cell as a heading', () => {
    expect(parseTextComparison(xml).filter((r) => r.kind === 'article').map((r) => r.heading)).toEqual(['Artikel 2'])
  })
})

describe('an annex with a nested table', () => {
  // A non-greedy <tr>…</tr> match stops at the *first* closing tag, so the
  // outer row was cut off at the inner table's first row. 17 of 65 annexes
  // nest tables; their rows are provisions, not decoration.
  const xml = `<table>
    <tr><td>Geltende Fassung</td><td>Vorgeschlagene Fassung</td></tr>
    <tr><td><table><tr><td><gldsym>§ 9.</gldsym>Alter Text.</td><td>Neuer Text.</td></tr></table></td><td></td></tr>
  </table>`

  it('keeps the nested row and its two columns', () => {
    const pairs = parseTextComparison(xml).filter((r) => r.kind === 'pair')
    const nested = pairs.find((r) => r.gld === '§ 9.')!
    expect(nested.current).toContain('Alter Text.')
    expect(nested.proposed).toBe('Neuer Text.')
  })

  it('does not repeat the nested text in the wrapping row', () => {
    const withAlt = parseTextComparison(xml).filter((r) => r.kind === 'pair' && r.current.includes('Alter Text.'))
    expect(withAlt).toHaveLength(1)
  })
})
