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
    // The designation lives in `gld`, not in the compared text — printed in
    // both it appeared twice on the page.
    expect(rows[0]!.gld).toBe('§ 5.')
    expect(rows[0]!.current).toBe('(1) Alter Text.')
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

  // The other half of that space, and the expensive one. Ressorts mark the
  // *changed digit of the designation itself* in yellow, so the number
  // arrives cut in two — "§ 32 2 ." for § 322 — and `designationKey` stops at
  // the first space and reads § 32, a provision the same law really has.
  // Seven designations in three drafts of GP XXVIII (2026-09-10).
  it('reads a designation the ressort marks inside the number as one number', () => {
    const gld = (d: string) => `<absatz typ="abs"><gldsym>${d}</gldsym> (1) Text.</absatz>`
    const rows = parse(
      annex([
        pair(gld(`§ 32<i>${marked('2')}</i>.`), gld(`§ 32<i>${marked('2')}</i>.`)),
        pair(gld(`§ 1${marked('3')}.`), gld(`§ 1${marked('3')}.`)),
        pair(gld(`§ 28${marked('c')}.`), gld(`§ 28${marked('c')}.`)),
        pair(gld(`Artikel 52a${marked('.')}`), gld(`Artikel 52a${marked('.')}`)),
      ]),
    )
    expect(rows.map((r) => r.gld)).toEqual(['§ 322.', '§ 13.', '§ 28c.', 'Artikel 52a.'])
  })

  it('still separates the designation from the text it stands against', () => {
    // The space is only wrong *inside* the designation: `</gldsym>` keeps its
    // own, or "§ 5." fuses into the first word of the provision.
    const rows = parse(annex([pair(`<gldsym>§ ${marked('5')}.</gldsym>Alter Text.`, '<gldsym>§ 5.</gldsym>Neuer Text.')]))
    expect(rows[0]!.gld).toBe('§ 5.')
    expect(rows[0]!.current).toBe('Alter Text.')
  })

  // The rest of the same finding, and the part that reaches the RIS check:
  // the ressorts mark the changed *letters* of a word, not only of a
  // designation. "Schlepplifte n," is two tokens the standing § does not
  // have, so the § was withheld for our own reading of it — six §§ of
  // GP XXVIII, and 314 of the 45.920 cells change a comparable word
  // (2026-09-11, `lawText.stripMarkup`).
  it('reads a word whose changed letters are marked as one word', () => {
    const rows = parse(
      annex([
        pair(`das Förderseil bei Schlepplifte${marked('n,')}`, `das Förderseil bei Schlepplifte<i>${marked('n,')}</i>`),
        pair('an der Universi<b>tät</b> tätig', 'an der Universi<b>tät</b> tätig'),
      ]),
    )
    expect(rows[0]!.current).toBe('das Förderseil bei Schleppliften,')
    expect(rows[1]!.current).toBe('an der Universität tätig')
  })

  it('still breaks a word at a block boundary and at a line break', () => {
    // The other half of the rule, and the reason it cannot simply drop every
    // tag: an `<absatz>`, a `<listelem>` and a `<br/>` are where one sentence
    // ends and the next begins.
    const rows = parse(
      annex([
        pair('<absatz typ="abs">Erster Satz</absatz><absatz typ="abs">Zweiter Satz</absatz>', '<absatz typ="abs">Erster Satz</absatz><absatz typ="abs">Dritter Satz</absatz>'),
        pair('1. Abschnitt<br/>Grundlagen', '1. Abschnitt<br/>Grundlagen neu'),
      ]),
    )
    expect(rows[0]!.current).toBe('Erster Satz Zweiter Satz')
    expect(rows[1]!.current).toBe('1. Abschnitt Grundlagen')
  })

  it('leaves a superscript where the two readings disagree about the word', () => {
    // `cm<super>2</super>` belongs to the token, `Meerkatzen<super>1)</super>`
    // is a footnote mark that does not, and nothing in the markup tells them
    // apart. Both sides of the comparison carry the tag, so a space is
    // symmetric — and welding them moved no verdict in either harness.
    const rows = parse(annex([pair('Mindestgrundfläche in cm<super>2</super>', 'Mindestgrundfläche in cm<super>2</super> je Tier')]))
    expect(rows[0]!.current).toBe('Mindestgrundfläche in cm 2')
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

describe('an annex that wraps its comparison in a layout table', () => {
  // Some annexes put the whole comparison inside one full-width cell of an
  // outer table. A non-greedy <tr>…</tr> match stopped at the *first* closing
  // tag, so the wrapper row was cut off at the inner table's first row and
  // every following row was lost — 53 rows in one GP-XXVIII annex, 90 in
  // another.
  const xml = `<table>
    <tr><td>Geltende Fassung</td><td>Vorgeschlagene Fassung</td></tr>
    <tr><td colspan="2"><table><tr><td><gldsym>§ 9.</gldsym>Alter Text.</td><td>Neuer Text.</td></tr></table></td></tr>
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

  // A nested table that prints the header pair itself is the comparison,
  // whatever wraps it.
  it('lifts a nested table that carries the header pair', () => {
    const wrapped = `<table><tr><td>Aussen</td><td><table>
      <tr><td>Geltende Fassung</td><td>Vorgeschlagene Fassung</td></tr>
      <tr><td><gldsym>§ 3.</gldsym>Alt.</td><td><gldsym>§ 3.</gldsym>Neu.</td></tr>
    </table></td></tr></table>`
    expect(parse(wrapped).find((r) => r.gld === '§ 3.')).toMatchObject({ current: 'Alt.', proposed: 'Neu.', change: 'changed' })
  })
})

describe('a table the law itself contains', () => {
  // The lift above was built for layout wrappers, and it fired on every nested
  // table. A wrapper row that already has two cells *is* a comparison row, so
  // a table inside one of its cells sits within a column — its columns are not
  // "geltend" and "vorgeschlagen". Read as a comparison, the
  // Finanzausgleichsgesetz § 11 reported "Grunderwerbsteuer" turning into
  // "5,702 0,556 93,742" and the Fruchtsaftverordnung produced 158 changed
  // rows out of a "Fruchtnektar aus | Mindestgehalt" table (2026-09-10).
  const rate = (bund: string) => `<absatz typ="abs"><gldsym>§ 11.</gldsym> Die Erträge werden geteilt:</absatz><table>
    <tr><td /><td>Bund</td><td>Länder</td><td>Gemeinden</td></tr>
    <tr><td>Grunderwerbsteuer</td><td>${bund}</td><td>0,556</td><td>93,742</td></tr>
  </table>`
  const xml = annex([pair(rate('5,702'), rate('4,000'))])

  it('does not turn its columns into a comparison of their own', () => {
    const rows = parse(xml)
    expect(rows).toHaveLength(1)
    expect(rows.some((r) => r.current === 'Grunderwerbsteuer')).toBe(false)
    expect(rows.some((r) => r.proposed.startsWith('Bund'))).toBe(false)
  })

  it('carries the table into both columns as text, so the word diff sees it', () => {
    const row = parse(xml)[0]!
    expect(row.gld).toBe('§ 11.')
    expect(row.current).toContain('Grunderwerbsteuer | 5,702 | 0,556 | 93,742')
    expect(row.proposed).toContain('Grunderwerbsteuer | 4,000 | 0,556 | 93,742')
    expect(row.change).toBe('changed')
    // The one number that moved, and nothing else.
    expect(row.segments!.filter((s) => s.type !== 'equal').map((s) => s.text)).toEqual(['5,702', '4,000'])
  })

  it('drops the spacer tables some annexes use for vertical rhythm', () => {
    const spacer = '<table><tr><td /><td /></tr><tr><td /><td /></tr></table>'
    const rows = parse(annex([pair(`<absatz typ="abs"><gldsym>§ 2.</gldsym> Alt.</absatz>${spacer}`, `<absatz typ="abs"><gldsym>§ 2.</gldsym> Alt.</absatz>${spacer}`)]))
    expect(rows[0]).toMatchObject({ current: 'Alt.', proposed: 'Alt.', change: 'unchanged' })
  })

  // The other half of the lift: a data table alone in a cell, its sibling
  // empty. It covers the width, so the width test alone lifted it and read
  // its two columns as "geltend" against "vorgeschlagen" — the
  // Bildungsdokumentation reported "Attribut" turning into "Wert", the
  // Hochschul-Curriculaverordnung "Bildungswissenschaftliche Grundlagen" into
  // "10". 18 tables in the corpus window, one of them the entire annex
  // (2026-09-10). RIS types those cells `typ="tabtext"` and never types a
  // provision that way, so the markup decides and the shape does not.
  it('does not lift a data table that stands alone in a cell', () => {
    const data = `<table>
      <tr><td><absatz typ="tabtext-fett">Module</absatz></td><td><absatz typ="tabtext-fett">ECTS-Anrechnungspunkte</absatz></td></tr>
      <tr><td><absatz typ="tabtext">Fachdidaktik</absatz></td><td><absatz typ="tabtext">20</absatz></td></tr>
    </table>`
    const rows = parse(annex([`<tr><td></td><td>${data}</td></tr>`]))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'pair', change: 'inserted', current: '' })
    expect(rows[0]!.proposed).toBe('Module | ECTS-Anrechnungspunkte Fachdidaktik | 20')
  })

  // …and the wrapper the lift exists for keeps working: the ABGB annex writes
  // `<td colspan="2">` with the comparison inside and an empty cell beside it,
  // and the rows inside carry provisions rather than table text.
  it('still lifts a comparison that stands alone in a cell', () => {
    const inner = `<table>
      <tr><td><absatz typ="abs"><gldsym>§ 1159.</gldsym> (6) Alt.</absatz></td><td><absatz typ="abs"><gldsym>§ 1159.</gldsym> (6) Neu.</absatz></td></tr>
    </table>`
    const rows = parse(annex([`<tr><td colspan="2">${inner}</td><td /></tr>`]))
    expect(rows.find((r) => r.gld === '§ 1159.')).toMatchObject({ current: '(6) Alt.', proposed: '(6) Neu.', change: 'changed' })
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
    expect(rows[0]!.current).toBe('(1) Alt.')
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

/**
 * The draft inserts a § with its heading, or repeals one: the column where the
 * provision does not yet — or no longer — exist is empty, so the heading row is
 * printed on **one** side. 297 rows of GP XXVIII, and they inherited the §
 * *above* (SchOG § 129 carried the heading of § 130d).
 */
describe('a § heading printed in one column only', () => {
  const heading = (typ: string, text: string) => `<ueberschrift typ="${typ}">${text}</ueberschrift>`
  const para = (n: string, text: string) => `<absatz typ="abs"><gldsym>§ ${n}.</gldsym> ${text}</absatz>`

  it('gives a right-only heading to the § the next row opens', () => {
    const rows = parse(annex([
      pair(para('129', '(1) Alt.'), para('129', '(1) Neu.')),
      pair('', heading('para', 'Übergangsbestimmung zur Sommerschule')),
      pair('', para('130d', '(1) Ganz neu.')),
    ]))
    // The heading is an insertion and stays one — dropping a shown change is
    // the mistake the old elision rule made.
    expect(rows.map((r) => [r.change, r.para])).toEqual([
      ['changed', '§ 129.'],
      ['inserted', '§ 130d.'],
      ['inserted', '§ 130d.'],
    ])
    expect(rows[1]!.proposed).toBe('Übergangsbestimmung zur Sommerschule')
  })

  it('gives a whole stack of one-sided headings to the same § below', () => {
    const rows = parse(annex([
      pair(para('23', '(1) Alt.'), para('23', '(1) Neu.')),
      pair('', heading('g1', '6. Abschnitt')),
      pair('', heading('g2', 'Grenzüberschreitende Gesundheitsversorgung')),
      pair('', heading('para', 'Allgemeine Bestimmungen')),
      pair('', para('24i', '(1) Ganz neu.')),
    ]))
    expect(rows.map((r) => r.para)).toEqual(['§ 23.', '§ 24i.', '§ 24i.', '§ 24i.', '§ 24i.'])
  })

  // The repealed § — its heading stands on the left, and scored against the §
  // above it took that § below the coverage threshold (AWG 2002 § 72a).
  it('gives a left-only heading to the repealed § below it', () => {
    const rows = parse(annex([
      pair(para('72a', '(1) Alt.'), para('72a', '(1) Neu.')),
      pair(heading('para', 'Elektronische Meldungen'), ''),
      pair(para('72b', '(1) Entfällt.'), ''),
    ]))
    expect(rows.map((r) => [r.change, r.para])).toEqual([
      ['changed', '§ 72a.'],
      ['removed', '§ 72b.'],
      ['removed', '§ 72b.'],
    ])
  })

  // Nothing opens below it, so there is no evidence to move it on — and the
  // answer that shipped is kept rather than guessed at.
  it('leaves a one-sided heading with the § above when no § follows', () => {
    const rows = parse(annex([
      pair(para('11', '(1) Alt.'), para('11', '(1) Neu.')),
      pair('', heading('erll', 'a. Verpflichtende Beratung')),
      pair('', '(2) Noch ein Absatz ohne eigene Bezeichnung.'),
    ]))
    expect(rows.map((r) => r.para)).toEqual(['§ 11.', '§ 11.', '§ 11.'])
  })

  // A schedule heading is a designation, not a title: it opens its own unit
  // instead of waiting for a § — the Bäderhygieneverordnung showed its new
  // Anlage 11 under Anlage 10.
  it('lets a one-sided schedule heading open its own Anlage', () => {
    const rows = parse(annex([
      pair('Anlage 10', 'Anlage 10'),
      pair('(1) Bestehende Anlage.', '(1) Bestehende Anlage.'),
      pair('', heading('anlage', 'Anlage 11')),
      pair('', '(1) Die neue Anlage.'),
    ]))
    expect(rows.map((r) => r.para)).toEqual(['Anlage 10', 'Anlage 10', 'Anlage 11', 'Anlage 11'])
  })

  // The two-sided case is untouched: an identical heading is not a change and
  // goes on being lifted out of the text into `heading`.
  it('still lifts a heading both columns print into the § below', () => {
    const rows = parse(annex([
      pair(heading('para', 'Aufbewahrung von Protokollen'), heading('para', 'Aufbewahrung von Protokollen')),
      pair(para('65a', '(1) Alt.'), para('65a', '(1) Neu.')),
    ]))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ gld: '§ 65a.', heading: 'Aufbewahrung von Protokollen' })
  })
})

/**
 * `lift` reads the § 's own heading only — RIS types that one `typ="para"` — so
 * a Teil, an Abschnitt, an Unterabschnitt or the heading of the *following* §
 * stayed an ordinary pair row and was filed under the § **above** it. 507 rows
 * of GP XXVIII, 331 of them followed by a row that opens a § (2026-09-11); the
 * Strafvollzugsgesetz § 154 carried „Fünfter Abschnitt — Strafvollzug durch
 * elektronisch überwachten Hausarrest", which heads the next §'s Abschnitt.
 */
describe('a heading of the law printed in both columns', () => {
  const heading = (typ: string, text: string) => `<ueberschrift typ="${typ}">${text}</ueberschrift>`
  const para = (n: string, text: string) => `<absatz typ="abs"><gldsym>§ ${n}.</gldsym> ${text}</absatz>`
  const both = (typ: string, text: string) => pair(heading(typ, text), heading(typ, text))

  it('gives an Abschnitt heading to the § that opens below it', () => {
    const rows = parse(annex([
      pair(para('154', '(1) Alt.'), para('154', '(1) Neu.')),
      both('g1min', 'Fünfter Abschnitt'),
      both('g2', 'Strafvollzug durch elektronisch überwachten Hausarrest'),
      pair(para('156b', '(1) Alt.'), para('156b', '(1) Neu.')),
    ]))
    // The heading stops being a row: it is the § 's title, not text claiming to
    // be the provision, and § 154 no longer carries the next Abschnitt's name.
    expect(rows.map((r) => [r.gld, r.heading])).toEqual([
      ['§ 154.', null],
      ['§ 156b.', 'Fünfter Abschnitt Strafvollzug durch elektronisch überwachten Hausarrest'],
    ])
  })

  it('keeps a heading the draft changes a visible change', () => {
    // „samt Überschrift" — the two columns differ, so the row *is* the change
    // and stays a row of its own, where the word diff can see it. 119 rows of
    // GP XXVIII. Its § is the one it had: moving that would move a *displayed*
    // change between the gate's paragraph bags, which is its own measurement.
    const rows = parse(annex([
      pair(para('12', '(1) Alt.'), para('12', '(1) Neu.')),
      pair(heading('g2', 'Alte Abschnittsüberschrift'), heading('g2', 'Neue Abschnittsüberschrift')),
      pair(para('13', '(1) Alt.'), para('13', '(1) Neu.')),
    ]))
    expect(rows.map((r) => [r.change, r.para])).toEqual([
      ['changed', '§ 12.'],
      ['changed', '§ 12.'],
      ['changed', '§ 13.'],
    ])
    expect(rows[1]!.current).toBe('Alte Abschnittsüberschrift')
    expect(rows[1]!.proposed).toBe('Neue Abschnittsüberschrift')
    expect(rows[1]!.segments!.filter((s) => s.type !== 'equal').map((s) => s.text)).toEqual(['Alte', 'Neue'])
  })

  it('leaves a heading with the § above when nothing opens below it', () => {
    // 176 of the 507 open nothing under them — inside a schedule, or before a
    // row that carries no designation of its own. The row stays a row and keeps
    // the § it had, so no line leaves the page.
    const rows = parse(annex([
      pair(para('18c', '(1) Alt.'), para('18c', '(1) Neu.')),
      both('g1min', 'Erster Unterabschnitt'),
      pair('<absatz typ="abs">(2) Ohne eigene Bezeichnung, alt.</absatz>', '<absatz typ="abs">(2) Ohne eigene Bezeichnung, neu.</absatz>'),
    ]))
    expect(rows.map((r) => [r.current, r.para])).toEqual([
      ['(1) Alt.', '§ 18c.'],
      ['Erster Unterabschnitt', '§ 18c.'],
      ['(2) Ohne eigene Bezeichnung, alt.', '§ 18c.'],
    ])
  })

  it('leaves the last heading of a law where it is', () => {
    // Nothing follows it at all, so there is no § to move it to — and dropping
    // it would take a line the annex printed off the page.
    const rows = parse(annex([
      pair(para('44', '(1) Alt.'), para('44', '(1) Neu.')),
      both('g2', 'Schluss- und Übergangsbestimmungen'),
    ]))
    expect(rows.map((r) => [r.current, r.para])).toEqual([
      ['(1) Alt.', '§ 44.'],
      ['Schluss- und Übergangsbestimmungen', '§ 44.'],
    ])
  })

  it('lets a two-sided schedule heading go on opening its own Anlage', () => {
    // An Anlage heading is a designation, not a title: it opens its own unit
    // instead of waiting for a § that never comes, and stays the pair row it is.
    const rows = parse(annex([
      pair(para('14', '(1) Alt.'), para('14', '(1) Neu.')),
      both('anlage', 'Anlage 1'),
      pair('<absatz typ="abs">a) Richtlinie 2000/31/EG, alt.</absatz>', '<absatz typ="abs">a) Richtlinie 2000/31/EG, neu.</absatz>'),
    ]))
    expect(rows.map((r) => [r.current, r.para])).toEqual([
      ['(1) Alt.', '§ 14.'],
      ['Anlage 1', 'Anlage 1'],
      ['a) Richtlinie 2000/31/EG, alt.', 'Anlage 1'],
    ])
  })

  it('carries a one-sided heading below a two-sided one to the same § below', () => {
    // The ressort inserts a § with its heading inside a new Abschnitt: the
    // Abschnitt stands in both columns, the § heading only in the right one.
    // The first becomes the § 's title, the second stays the insertion it is —
    // and both belong to the § the row below opens.
    const rows = parse(annex([
      pair(para('23', '(1) Alt.'), para('23', '(1) Neu.')),
      both('g1', '6. Abschnitt'),
      pair('', heading('para', 'Allgemeine Bestimmungen')),
      pair('', para('24i', '(1) Ganz neu.')),
    ]))
    expect(rows.map((r) => [r.change, r.para, r.heading])).toEqual([
      ['changed', '§ 23.', null],
      ['inserted', '§ 24i.', '6. Abschnitt'],
      ['inserted', '§ 24i.', null],
    ])
  })

  it('does not read law text that happens to be mirrored as a heading', () => {
    // The discriminator is RIS's own markup, not the shape of the line: all 507
    // rows of the corpus are `<ueberschrift>`, and an Absatz repeated unchanged
    // in both columns is law and stays a row of its own.
    const rows = parse(annex([
      pair('<absatz typ="abs"><gldsym>§ 3.</gldsym> (1) Alt.</absatz>', '<absatz typ="abs"><gldsym>§ 3.</gldsym> (1) Neu.</absatz>'),
      pair('<absatz typ="abs">(2) Unverändert.</absatz>', '<absatz typ="abs">(2) Unverändert.</absatz>'),
      pair('<absatz typ="abs"><gldsym>§ 4.</gldsym> Alt.</absatz>', '<absatz typ="abs"><gldsym>§ 4.</gldsym> Neu.</absatz>'),
    ]))
    expect(rows.map((r) => [r.current, r.para])).toEqual([
      ['(1) Alt.', '§ 3.'],
      ['(2) Unverändert.', '§ 3.'],
      ['Alt.', '§ 4.'],
    ])
  })
})

describe('a division of the law printed as an ordinary row', () => {
  // "9b. Abschnitt" typeset in both columns rather than as a heading. It
  // reached the comparison as a mirrored pair row and was filed under
  // whichever § stood open above it — 205 such rows in GP XXVIII.
  const gld = (n: string, text: string) => `<span class="gldsym"><gldsym>§ ${n}.</gldsym></span> ${text}`

  it('reads it as context, not as an unchanged provision', () => {
    const rows = parse(
      annex([
        pair(gld('2', '(1) Der alte Text.'), gld('2', '(1) Der neue Text.')),
        pair('9b. Abschnitt', '9b. Abschnitt'),
        pair(gld('54c', '(1) Etwas anderes.'), gld('54c', '(1) Etwas anderes.')),
      ]),
    )
    expect(rows.map((r) => r.current)).not.toContain('9b. Abschnitt')
    // The § below it keeps its own designation — the division is not a § and
    // must not become one.
    expect(rows.filter((r) => r.kind === 'pair').map((r) => r.gld)).toEqual(['§ 2.', '§ 54c.'])
  })

  it('leaves law text that merely looks like a heading where it is', () => {
    // Each of these is a mirrored row without a closing full stop, which is
    // what an earlier version of the rule keyed on: an Absatz introducing a
    // list, a Ziffer, a litera. Reading them as headings deleted law text.
    const lines = [
      '(3) Der Plattform-Anbieter hat darüber hinaus dafür zu sorgen, dass',
      '1. die mangelnde Funktionsfähigkeit',
      'a) des eingerichteten Melde- und Bewertungssystems nach § 54e Abs. 1 Z 1 bis 3,',
      'Teil der Anlage ist die Beschreibung der Verfahren',
    ]
    const rows = parse(annex(lines.map((l) => pair(l, l))))
    expect(rows.filter((r) => r.kind === 'pair').map((r) => r.current)).toEqual(lines)
  })
})

describe('which § a row belongs to', () => {
  // The annex prints one row per Absatz, so two rows in three open no § of
  // their own — 66 of 100 in one annex, 37 of them carrying a change. Those
  // read as "geändert" over a text beginning "(26) Für das Inkrafttreten …",
  // with nothing to say which § that is.
  it('inherits the § from the row that opened it', () => {
    const rows = parse(annex([
      pair('<absatz typ="abs"><gldsym>§ 82.</gldsym> (1) Alt.</absatz>', '<absatz typ="abs"><gldsym>§ 82.</gldsym> (1) Neu.</absatz>'),
      pair('<absatz typ="abs">(26) Für das Inkrafttreten gilt Folgendes: alt.</absatz>', '<absatz typ="abs">(26) Für das Inkrafttreten gilt Folgendes: neu.</absatz>'),
    ]))
    expect(rows.map((r) => [r.gld, r.para])).toEqual([['§ 82.', '§ 82.'], [null, '§ 82.']])
  })

  // A package's next law restarts its numbering, so the § does not carry over
  // a boundary.
  it('does not carry a § across a law boundary', () => {
    const pkg = draft({ n: '1', title: 'Änderung des Aktiengesetzes' }, { n: '2', title: 'Änderung des GmbH-Gesetzes' })
    const rows = parse(annex([
      '<tr><td colspan="2">Artikel 1 Änderung des Aktiengesetzes</td></tr>',
      pair('<absatz typ="abs"><gldsym>§ 82.</gldsym> (1) Alt.</absatz>', '<absatz typ="abs"><gldsym>§ 82.</gldsym> (1) Neu.</absatz>'),
      '<tr><td colspan="2">Artikel 2 Änderung des GmbH-Gesetzes</td></tr>',
      pair('<absatz typ="abs">(3) Ohne eigene Bezeichnung, alt.</absatz>', '<absatz typ="abs">(3) Ohne eigene Bezeichnung, neu.</absatz>'),
    ]), pkg)
    expect(rows.filter((r) => r.kind === 'pair').map((r) => r.para)).toEqual(['§ 82.', null])
  })

  // An Anlage leaves the § sequence instead of subdividing it, and the rows
  // beneath it used to inherit the last § before the schedule: in the VerKRÄG
  // annex fourteen rows of the Anhang went out as § 14 of the
  // Verbraucherbehördenkooperationsgesetz, which the RIS check then withheld
  // saying the standing text does not carry them — true of § 14, and false
  // about the annex. 951 rows in the corpus window, 230 of them shown as a
  // change (2026-09-10).
  it('leaves the § sequence at an Anlage and files the rows under it', () => {
    const rows = parse(annex([
      pair('<absatz typ="abs"><gldsym>§ 14.</gldsym> (1) Alt.</absatz>', '<absatz typ="abs"><gldsym>§ 14.</gldsym> (1) Neu.</absatz>'),
      pair('<ueberschrift typ="anlage">Anlage 1</ueberschrift>', '<ueberschrift typ="anlage">Anlage 1</ueberschrift>'),
      pair('<absatz typ="abs">a) Richtlinie 2000/31/EG, alt.</absatz>', '<absatz typ="abs">a) Richtlinie 2000/31/EG, neu.</absatz>'),
    ]))
    expect(rows.map((r) => r.para)).toEqual(['§ 14.', 'Anlage 1', 'Anlage 1'])
    // Named, so the RIS check can look the schedule up as RIS prints it
    // ("Anl. 1") instead of scoring it against the § before it.
    expect(rows[2]).toMatchObject({ change: 'changed', gld: null })
  })

  // Only Anlage and Anhang. A § runs on across an Abschnitt or a Hauptstück,
  // and resetting there would strip the designation from the rest of the law.
  it('carries the § across a division that only subdivides the law', () => {
    const rows = parse(annex([
      pair('<absatz typ="abs"><gldsym>§ 2.</gldsym> Alt.</absatz>', '<absatz typ="abs"><gldsym>§ 2.</gldsym> Neu.</absatz>'),
      pair('9b. Abschnitt', '9b. Abschnitt'),
      pair('<absatz typ="abs">(2) Ohne eigene Bezeichnung, alt.</absatz>', '<absatz typ="abs">(2) Ohne eigene Bezeichnung, neu.</absatz>'),
    ]))
    expect(rows.map((r) => r.para)).toEqual(['§ 2.', '§ 2.'])
  })

  // The markup is not always there: 12 rows of the corpus open a schedule
  // with the wording alone. The length cap is the division rule's — a
  // provision that merely begins with the word is longer than a heading.
  it('reads a schedule the annex opens without the markup', () => {
    const rows = parse(annex([
      pair('<absatz typ="abs"><gldsym>§ 9.</gldsym> Alt.</absatz>', '<absatz typ="abs"><gldsym>§ 9.</gldsym> Neu.</absatz>'),
      pair('ANHANG I', 'ANHANG I'),
      pair('<absatz typ="abs">1. Alt.</absatz>', '<absatz typ="abs">1. Neu.</absatz>'),
    ]))
    expect(rows.map((r) => r.para)).toEqual(['§ 9.', 'ANHANG I', 'ANHANG I'])
  })
})

// A draft that renumbers a provision prints both numbers in one row: the
// standing "§ 7." on the left and the proposed "§ 8." on the right. 42 rows of
// GP XXVIII do (2026-09-11), almost every one of them a renumbering — B-VG
// Art. 90a→94a, the Konfitürenverordnung § 7→§ 8, the Strafregistergesetz
// § 2→§ 1a, the Blutspenderverordnung shifting §§ 9 to 14 down by one.
describe('a row whose two columns carry different designations', () => {
  const renumbered = (a: string, b: string, text: string, text2 = text) =>
    pair(`<absatz typ="abs"><gldsym>${a}</gldsym> ${text}</absatz>`, `<absatz typ="abs"><gldsym>${b}</gldsym> ${text2}</absatz>`)

  it('files the row under the standing designation and leaves the proposed one in the text', () => {
    // The badge has to stay the *left* number: that is the § the RIS check
    // holds the left column against. Taking the right one out as well deleted
    // it from the page altogether — neither badge nor word — and the reader
    // saw two provisions under one number with nothing to say so.
    const rows = parse(annex([renumbered('§ 7.', '§ 8.', 'Durch diese Verordnung wird die Richtlinie umgesetzt.', 'Durch diese Verordnung werden folgende Richtlinien umgesetzt:')]))
    expect(rows[0]!.gld).toBe('§ 7.')
    expect(rows[0]!.current).toBe('Durch diese Verordnung wird die Richtlinie umgesetzt.')
    expect(rows[0]!.proposed).toBe('§ 8. Durch diese Verordnung werden folgende Richtlinien umgesetzt:')
  })

  it('shows a pure renumbering as a change instead of as unchanged text', () => {
    // Same words, new number. Stripping both designations made the two columns
    // identical, so the row went out as "unchanged" and the page folded it
    // away behind a count: 25 rows of GP XXVIII, every one a renumbering the
    // reader could not see.
    const rows = parse(annex([renumbered('§ 322.', '§ 324.', 'Wer die Tat begeht, ist zu bestrafen.')]))
    expect(rows[0]).toMatchObject({ gld: '§ 322.', change: 'changed' })
    expect(rows[0]!.proposed).toBe('§ 324. Wer die Tat begeht, ist zu bestrafen.')
  })

  it('still takes the designation out where both columns print the same one', () => {
    const rows = parse(annex([renumbered('§ 5.', '§ 5.', '(1) Alter Text.', '(1) Neuer Text.')]))
    expect(rows[0]!.current).toBe('(1) Alter Text.')
    expect(rows[0]!.proposed).toBe('(1) Neuer Text.')
  })

  it('reads a designation from the proposed column where the left has none', () => {
    // An inserted § — the left cell is empty, and the row is still that §'s.
    const rows = parse(annex([pair('<nbsp />', '<absatz typ="abs"><gldsym>§ 7.</gldsym> Neu.</absatz>')]))
    expect(rows[0]).toMatchObject({ gld: '§ 7.', change: 'inserted', proposed: 'Neu.' })
  })
})

// Per the Rundschreiben an unchanged stretch is abbreviated as a designation
// plus three dots, so "§ 16 Abs. 1 bis 24 …" *is* the annex saying that § 16
// begins here. Where a ressort writes it that way it prints no `<gldsym>`: in
// the Verbrechensopfergesetz annex the new § 16 Abs. 25 and the new § 9b
// Abs. 6 went out under §§ 10 and 7c (2026-09-11).
describe('an elision line that names its own §', () => {
  const open = pair('<absatz typ="abs"><gldsym>§ 10.</gldsym> (1) Alt.</absatz>', '<absatz typ="abs"><gldsym>§ 10.</gldsym> (1) Neu.</absatz>')

  it('opens the § it names, and the rows below inherit it', () => {
    const rows = parse(annex([
      open,
      pair('§ 16 Abs. 1 bis 24 …', '§ 16 Abs. 1 bis 24 …'),
      pair('', '<absatz typ="abs">(25) § 4 Abs. 5 tritt mit 1. Jänner 2026 in Kraft.</absatz>'),
    ]))
    expect(rows.map((r) => r.para)).toEqual(['§ 10.', '§ 16.', '§ 16.'])
    // The full stop is put back on so the § is grouped with its own
    // `<gldsym>` spelling rather than standing on the page twice.
    expect(rows[1]!.elided).toBe(true)
  })

  it('reads the spellings the corpus prints', () => {
    const rows = parse(annex([
      open,
      pair('§ 2 Z 1 bis 9 …', '§ 2 Z 1 bis 9 …'),
      pair('§ 4 Ab. 1 bis 4 …', '§ 4 Ab. 1 bis 4 …'),
    ]))
    expect(rows.map((r) => r.para)).toEqual(['§ 10.', '§ 2.', '§ 4.'])
  })

  it('refuses a line that leaves out a whole range of §§', () => {
    // "§§ 1. bis 26. …" omits twenty-six provisions and opens none of them.
    // Without the subordinate unit the line is a range, and reading § 1 out of
    // it would hand the rows below to a § the annex never showed.
    const rows = parse(annex([
      open,
      pair('§§ 1. bis 26. …', '§§ 1. bis 26. …'),
      pair('§ 21. bis 25. …', '§ 21. bis 25. …'),
    ]))
    expect(rows.map((r) => r.para)).toEqual(['§ 10.', '§ 10.', '§ 10.'])
  })

  it('refuses a one-sided elision', () => {
    // An elision the two columns print differently is a change to the elision
    // itself and says nothing about where a § starts.
    const rows = parse(annex([open, pair('§ 16 Abs. 1 bis 24 …', '§ 16 Abs. 1 bis 25 …')]))
    expect(rows.map((r) => r.para)).toEqual(['§ 10.', '§ 10.'])
  })
})
