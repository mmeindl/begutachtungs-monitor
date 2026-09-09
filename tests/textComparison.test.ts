import { describe, expect, it } from 'vitest'
import { classify, isScanned, parseTextComparison, summarizeComparison } from '../server/utils/textComparison'
import type { DraftArticle } from '../server/utils/lawTitles'

/**
 * The draft the annex belongs to. A law boundary the annex prints has to be
 * one of the draft's own Artikel, so a fixture expecting a boundary has to say
 * which draft it is an annex to.
 */
function draft(...articles: { n?: string; title?: string | null }[]): DraftArticle[] {
  return articles.map((a, index) => ({
    index,
    number: a.n ? `Artikel ${a.n}` : null,
    numeral: a.n ?? null,
    title: a.title ?? null,
    key: a.title ?? (a.n ? `Artikel ${a.n}` : null),
    amends: true,
    bgbl: null,
  }))
}

const ONE_LAW = draft({ title: 'Änderung des Aktiengesetzes' })
const parse = (xml: string, articles: DraftArticle[] = ONE_LAW) => parseTextComparison(xml, articles).rows

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
    const rows = parse(annex([pair('<absatz typ="abs"><gldsym>§ 5.</gldsym> (1) Alter Text.</absatz>', `<absatz typ="abs"><gldsym>§ 5.</gldsym> (1) ${marked('Neuer')} Text.</absatz>`)]))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'pair', gld: '§ 5.', change: 'changed', marked: true })
    expect(rows[0]!.current).toBe('§ 5. (1) Alter Text.')
  })

  it('spans an Artikel heading over both columns', () => {
    const rows = parse(annex(['<tr><td colspan="2">Artikel 1 Änderung des Glücksspielgesetzes</td></tr>', pair('alt', 'neu')]), draft({ n: '1', title: 'Änderung des Glücksspielgesetzes' }))
    // The heading is the draft's wording for the law, not the annex's line.
    expect(rows[0]).toMatchObject({ kind: 'article', heading: 'Artikel 1 — Änderung des Glücksspielgesetzes', law: 'Änderung des Glücksspielgesetzes' })
  })

  it('reads an empty column as an insertion or a deletion', () => {
    const rows = parse(annex([pair('', marked('26c. Neue Ziffer.')), pair('Alte Ziffer.', '')]))
    expect(rows.map((r) => r.change)).toEqual(['inserted', 'removed'])
  })

  it('marks the three-dots convention as elided, not as a change', () => {
    // Per the BKA Rundschreiben unchanged stretches are abbreviated this way.
    const rows = parse(annex([pair('2. bis 26b. ...', '2. bis 26b. ...')]))
    expect(rows[0]).toMatchObject({ change: 'unchanged', elided: true, segments: null })
  })

  it('restores the space a marker loses against its text', () => {
    // RIS prints "<symbol>1.</symbol>Altersprädikat" with nothing in between.
    const rows = parse(annex([pair('<listelem><symbol>1.</symbol>Altersprädikat: alt</listelem>', '<listelem><symbol>1.</symbol>Altersprädikat: neu</listelem>')]))
    expect(rows[0]!.current).toBe('1. Altersprädikat: alt')
  })

  it('separates an editorial change from a substantive one', () => {
    const rows = parse(
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
    expect(parse(scan)).toEqual([])
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
    const rows = parse(xml)
    const pair = rows.find((r) => r.kind === 'pair')!
    expect(pair.gld).toBe('§ 5.')
    expect(pair.current).toContain('Die Behoerde entscheidet.')
    expect(pair.proposed).toBe('Das Gericht entscheidet.')
    expect(pair.change).toBe('changed')
  })

  it('still reads a full-width cell as a heading', () => {
    const articles = draft({ n: '1', title: 'Änderung des Aktiengesetzes' }, { n: '2', title: 'Änderung des GmbH-Gesetzes' })
    expect(parse(xml, articles).filter((r) => r.kind === 'article').map((r) => r.heading)).toEqual(['Artikel 2 — Änderung des GmbH-Gesetzes'])
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
    const pairs = parse(xml).filter((r) => r.kind === 'pair')
    const nested = pairs.find((r) => r.gld === '§ 9.')!
    expect(nested.current).toContain('Alter Text.')
    expect(nested.proposed).toBe('Neuer Text.')
  })

  it('does not repeat the nested text in the wrapping row', () => {
    const withAlt = parse(xml).filter((r) => r.kind === 'pair' && r.current.includes('Alter Text.'))
    expect(withAlt).toHaveLength(1)
  })
})

describe('the laws of a package', () => {
  const pkg = draft({ n: '1', title: 'Änderung des Aktiengesetzes' }, { n: '2', title: 'Änderung des GmbH-Gesetzes' })

  // Two annexes print both their Artikel as headings *outside* the table, and
  // reading only table rows lost both boundaries (2026-09-09).
  it('reads a boundary that stands outside the table', () => {
    const xml = `<risdok><nutzdaten><abschnitt>
      <ueberschrift typ="g2">Textgegenüberstellung</ueberschrift>
      <ueberschrift typ="g1">Artikel 1</ueberschrift>
      <ueberschrift typ="g2">Änderung des Aktiengesetzes</ueberschrift>
      <table><tr><td><gldsym>§ 1.</gldsym>Alt.</td><td><gldsym>§ 1.</gldsym>Neu.</td></tr></table>
      <ueberschrift typ="g1">Artikel 2</ueberschrift>
      <ueberschrift typ="g2">Änderung des GmbH-Gesetzes</ueberschrift>
      <table><tr><td><gldsym>§ 1.</gldsym>Alt.</td><td><gldsym>§ 1.</gldsym>Neu 2.</td></tr></table>
    </abschnitt></nutzdaten></risdok>`
    const rows = parse(xml, pkg)
    expect(rows.filter((r) => r.kind === 'article').map((r) => r.heading)).toEqual([
      'Artikel 1 — Änderung des Aktiengesetzes',
      'Artikel 2 — Änderung des GmbH-Gesetzes',
    ])
    // The two § 1 are different provisions, and the law says which is which.
    expect(rows.filter((r) => r.gld === '§ 1.').map((r) => r.law)).toEqual(['Änderung des Aktiengesetzes', 'Änderung des GmbH-Gesetzes'])
  })

  // An Artikel line is often printed once per column instead of across both.
  // Read as an ordinary pair row the boundary was invisible.
  it('reads a boundary printed in both columns', () => {
    const xml = annex([
      pair('<ueberschrift typ="g1">Artikel 2</ueberschrift>', '<ueberschrift typ="g1">Artikel 2</ueberschrift>'),
      pair('<ueberschrift typ="g2">Änderung des GmbH-Gesetzes</ueberschrift>', '<ueberschrift typ="g2">Änderung des GmbH-Gesetzes</ueberschrift>'),
      pair('<gldsym>§ 4.</gldsym>Alt.', '<gldsym>§ 4.</gldsym>Neu.'),
    ])
    const rows = parse(xml, pkg)
    expect(rows.filter((r) => r.kind === 'article').map((r) => r.heading)).toEqual(['Artikel 2 — Änderung des GmbH-Gesetzes'])
    expect(rows.find((r) => r.gld === '§ 4.')?.law).toBe('Änderung des GmbH-Gesetzes')
  })

  // "3. Abschnitt" and a heading over a group of §§ span the width exactly as
  // a law boundary does. One group each turned a single-law Novelle into
  // dozens of groups.
  it('makes any other full-width heading context, not a group', () => {
    const rows = parse(annex(['<tr><td colspan="2">3. Abschnitt</td></tr>', pair('<gldsym>§ 4.</gldsym>Alt.', '<gldsym>§ 4.</gldsym>Neu.')]))
    expect(rows.filter((r) => r.kind === 'article')).toHaveLength(0)
    expect(rows[0]).toMatchObject({ gld: '§ 4.', heading: '3. Abschnitt', law: 'Änderung des Aktiengesetzes' })
  })

  it('attributes nothing when a package leaves its laws unmarked', () => {
    const { rows, refusal } = parseTextComparison(annex([pair('<gldsym>§ 5.</gldsym>Alt.', '<gldsym>§ 5.</gldsym>Neu.')]), pkg)
    expect(refusal).toContain('2 Gesetze')
    expect(rows.every((r) => r.law === null)).toBe(true)
  })
})

describe('what the annex prints that is not a comparison', () => {
  // RIS names the law's table of contents `<inhaltsvz>`, and annexes reprint
  // it. It is a two-column table of its own — "Paragraf" and "Gegenstand" —
  // so flattened into the comparison its two columns landed under "Geltende
  // Fassung" and "Vorgeschlagene Fassung", and the page reported that the
  // draft changes "§ 66." into "Kundmachung von Verordnungen": 222 rows over
  // 23 of the 65 readable annexes, every one marked "geändert" (2026-09-09).
  // An invented change, in the section whose justification is that it cannot
  // invent law text.
  it('drops the table of contents instead of comparing its columns', () => {
    const xml = annex([
      `<tr><td><table>
        <tr><td colspan="2"><inhaltsvz typ="ueberschrift">Inhaltsverzeichnis</inhaltsvz></td></tr>
        <tr><td><inhaltsvz typ="spalte">Paragraf</inhaltsvz></td><td><inhaltsvz typ="spalte">Gegenstand</inhaltsvz></td></tr>
        <tr><td><inhaltsvz typ="eintrag">§ 66.</inhaltsvz></td><td><inhaltsvz typ="eintrag">Kundmachung von Verordnungen</inhaltsvz></td></tr>
      </table></td></tr>`,
      pair('<absatz typ="abs"><gldsym>§ 66.</gldsym> (1) Alt.</absatz>', '<absatz typ="abs"><gldsym>§ 66.</gldsym> (1) Neu.</absatz>'),
    ])
    const rows = parse(xml)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ gld: '§ 66.', change: 'changed' })
    expect(rows.some((r) => r.proposed.includes('Kundmachung von Verordnungen'))).toBe(false)
  })

  // `<symbol>` is a list item's marker. Read as the row's designation it
  // printed "geändert 1." where 1. is a Ziffer inside a running Absatz — it
  // reads like a paragraph and is none.
  it('does not read a Ziffer marker as the row’s designation', () => {
    const rows = parse(annex([pair('<listelem><symbol>1.</symbol>Erste Ziffer alt</listelem>', '<listelem><symbol>1.</symbol>Erste Ziffer neu</listelem>')]))
    expect(rows[0]!.gld).toBeNull()
    expect(rows[0]!.current).toBe('1. Erste Ziffer alt')
  })
})

describe('the § heading inside the cell', () => {
  const withHeading = (heads: [string, string], texts: [string, string]) =>
    annex([pair(
      `<ueberschrift typ="para">${heads[0]}</ueberschrift><absatz typ="abs"><gldsym>§ 40.</gldsym> ${texts[0]}</absatz>`,
      `<ueberschrift typ="para">${heads[1]}</ueberschrift><absatz typ="abs"><gldsym>§ 40.</gldsym> ${texts[1]}</absatz>`,
    )])

  // The ressort puts the § heading in the same cell as the Absatz, so the
  // cell's text really reads "Wiederholung von Teilprüfungen … § 40. (1) …".
  // Faithful, and unreadable as prose: it belongs over the row.
  it('lifts a heading both columns share out of the text', () => {
    const rows = parse(withHeading(['Wiederholung von Teilprüfungen', 'Wiederholung von Teilprüfungen'], ['(1) Alt.', '(1) Neu.']))
    expect(rows[0]!.heading).toBe('Wiederholung von Teilprüfungen')
    expect(rows[0]!.current).toBe('§ 40. (1) Alt.')
  })

  // "§ 12a lautet samt Überschrift" — the draft changes the heading itself.
  // That is a change and has to stay where the word diff can see it.
  it('keeps a heading the draft changes inside the compared text', () => {
    const rows = parse(withHeading(['Alte Überschrift', 'Neue Überschrift'], ['(1) Text.', '(1) Text.']))
    expect(rows[0]!.heading).toBeNull()
    expect(rows[0]!.current).toContain('Alte Überschrift')
    expect(rows[0]!.proposed).toContain('Neue Überschrift')
    expect(rows[0]!.change).toBe('changed')
  })

  // Some annexes give the heading a row of its own, above the § it names.
  it('carries a heading that stands in its own row down to the § below it', () => {
    const rows = parse(annex([
      pair('<ueberschrift typ="para">Aufbewahrung von Protokollen</ueberschrift>', '<ueberschrift typ="para">Aufbewahrung von Protokollen</ueberschrift>'),
      pair('<absatz typ="abs"><gldsym>§ 65a.</gldsym> (1) Alt.</absatz>', '<absatz typ="abs"><gldsym>§ 65a.</gldsym> (1) Neu.</absatz>'),
    ]))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ gld: '§ 65a.', heading: 'Aufbewahrung von Protokollen' })
  })
})
