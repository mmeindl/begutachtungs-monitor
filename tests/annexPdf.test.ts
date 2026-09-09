import { describe, expect, it } from 'vitest'
import { columnBoundary, linesFromPage, parseAnnexPdf, type AnnexItem, type AnnexPage } from '../server/utils/annexPdf'
import type { DraftArticle } from '../server/utils/lawTitles'

/**
 * The draft the annex belongs to. Every law boundary in an annex has to be one
 * of the draft's own Artikel, so a fixture that expects a boundary has to say
 * which draft it is an annex to.
 */
function draft(...articles: { n?: string; title?: string | null; amends?: boolean }[]): DraftArticle[] {
  return articles.map((a, index) => ({
    index,
    number: a.n ? `Artikel ${a.n}` : null,
    numeral: a.n ?? null,
    title: a.title ?? null,
    key: a.title ?? (a.n ? `Artikel ${a.n}` : null),
    amends: a.amends ?? true,
    bgbl: null,
  }))
}

/** One law, no Artikel structure — the shape of two drafts in three. */
const ONE_LAW = draft({ title: 'Änderung des Sicherheitspolizeigesetzes' })

const parse = (pages: readonly AnnexPage[], articles: DraftArticle[] = ONE_LAW) => parseAnnexPdf(pages, articles).rows

/**
 * The annex is a two-column table. These fixtures place text runs the way a
 * Word-generated PDF does — no spaces between runs, position carries the
 * meaning — so the geometry is exercised without shipping a binary.
 */
const PAGE_WIDTH = 842
const LEFT_X = 60
const RIGHT_X = 470
const CHAR = 5

/** A line of runs in one column, at baseline `y`. */
function run(x: number, y: number, text: string): AnnexItem {
  return { x, y, width: text.length * CHAR, text }
}

function page(lines: { y: number; left?: string; right?: string; spanning?: string }[]): AnnexPage {
  const items: AnnexItem[] = []
  for (const l of lines) {
    if (l.left) items.push(run(LEFT_X, l.y, l.left))
    if (l.right) items.push(run(RIGHT_X, l.y, l.right))
    if (l.spanning) items.push(run(LEFT_X, l.y, l.spanning))
  }
  return { width: PAGE_WIDTH, items }
}

describe('linesFromPage', () => {
  it('splits the two columns at the midline', () => {
    const lines = linesFromPage(page([{ y: 700, left: 'Geltende Fassung', right: 'Vorgeschlagene Fassung' }]))
    expect(lines[0]!.left).toBe('Geltende Fassung')
    expect(lines[0]!.right).toBe('Vorgeschlagene Fassung')
  })

  // A centred title starts left of the midline and crosses it. Assigning runs
  // by their left edge filed "Textgegenüberstellung" as current law.
  it('treats a run that crosses the midline as spanning both columns', () => {
    const wide: AnnexPage = { width: PAGE_WIDTH, items: [{ x: 300, y: 700, width: 260, text: 'Artikel 1' }] }
    expect(linesFromPage(wide)[0]!.spanning).toBe('Artikel 1')
  })

  // A PDF moves the cursor instead of storing spaces, so the runs of one line
  // have to be re-spaced from their geometry — otherwise the text arrives as
  // "EinverfassungsgefährdenderAngriff".
  it('restores the spaces a PDF does not store', () => {
    const items: AnnexItem[] = [
      { x: 60, y: 700, width: 20, text: 'Ein' },
      { x: 86, y: 700, width: 55, text: 'verfassungsgefährdender' },
      { x: 147, y: 700, width: 35, text: 'Angriff' },
    ]
    expect(linesFromPage({ width: PAGE_WIDTH, items })[0]!.left).toBe('Ein verfassungsgefährdender Angriff')
  })

  it('does not insert a space inside a kerned word', () => {
    const items: AnnexItem[] = [
      { x: 60, y: 700, width: 20, text: 'Ver' },
      { x: 80.2, y: 700, width: 25, text: 'fahren' },
    ]
    expect(linesFromPage({ width: PAGE_WIDTH, items })[0]!.left).toBe('Verfahren')
  })
})

describe('parseAnnexPdf', () => {
  it('pairs a changed paragraph across the two columns', () => {
    const rows = parse([page([
      { y: 700, left: 'Geltende Fassung', right: 'Vorgeschlagene Fassung' },
      { y: 660, left: '§ 5. (1) Die Behörde entscheidet.', right: '§ 5. (1) Das Gericht entscheidet.' },
    ])])
    const pair = rows.find((r) => r.gld === '§ 5.')!
    expect(pair.change).toBe('changed')
    expect(pair.current).toBe('§ 5. (1) Die Behörde entscheidet.')
    expect(pair.proposed).toBe('§ 5. (1) Das Gericht entscheidet.')
    expect(pair.segments).not.toBeNull()
  })

  it('drops the column headers and the page number', () => {
    const rows = parse([page([
      { y: 760, right: '3 von 18' },
      { y: 700, left: 'Geltende Fassung', right: 'Vorgeschlagene Fassung' },
      { y: 660, left: '§ 5. Text.', right: '§ 5. Text.' },
    ])])
    expect(rows).toHaveLength(1)
    expect(rows[0]!.gld).toBe('§ 5.')
  })

  // The columns do not advance together. Where the draft inserts a §, the
  // proposed column runs on while the current column is blank — a single
  // shared cursor dragged the next heading of the current column into the
  // inserted § (8/ME: "Information Betroffener" became the standing text of
  // the new § 15c).
  it('does not borrow the other column’s text for an inserted paragraph', () => {
    const rows = parse([page([
      { y: 700, left: '§ 15. (1) Alt.', right: '§ 15. (1) Alt.' },
      { y: 660, right: '§ 15c. (1) Ganz neu.' },
      { y: 620, left: 'Information Betroffener', right: 'Information Betroffener' },
      { y: 600, left: '§ 16. (1) Bestehend.', right: '§ 16. (1) Bestehend.' },
    ])])
    const inserted = rows.find((r) => r.gld === '§ 15c.')!
    expect(inserted.change).toBe('inserted')
    expect(inserted.current).toBe('')
    // The heading sits above the § it names, in its own column.
    expect(rows.find((r) => r.gld === '§ 16.')!.current).toContain('Information Betroffener')
  })

  it('keeps a repealed paragraph that appears only on the left', () => {
    const rows = parse([page([
      { y: 700, left: '§ 7. (1) Wird aufgehoben.', right: '§ 8. (1) Bleibt.' },
    ])])
    const removed = rows.find((r) => r.gld === '§ 7.')!
    expect(removed.change).toBe('removed')
    expect(removed.proposed).toBe('')
  })

  // "§§ 242, 246 oder 247a StGB" is a citation inside running text. Treating
  // every line-initial § as a row boundary cut sentences in half.
  it('does not start a row on a citation', () => {
    const rows = parse([page([
      { y: 700, left: '§ 5. (1) Strafbar nach', right: '§ 5. (1) Strafbar nach' },
      { y: 680, left: '§§ 242, 246 oder 247a StGB.', right: '§§ 242, 246 oder 247b StGB.' },
    ])])
    expect(rows).toHaveLength(1)
    expect(rows[0]!.current).toBe('§ 5. (1) Strafbar nach §§ 242, 246 oder 247a StGB.')
  })

  it('opens a new section at an Artikel heading the draft confirms', () => {
    const rows = parse([{
      width: PAGE_WIDTH,
      items: [
        { x: 300, y: 700, width: 260, text: 'Artikel 2' },
        ...page([{ y: 660, left: '§ 1. Alt.', right: '§ 1. Neu.' }]).items,
      ],
    }], draft({ n: '1', title: 'Änderung des Aktiengesetzes' }, { n: '2', title: 'Änderung des GmbH-Gesetzes' }))
    // The heading is the draft's wording, not the annex's: the annex prints
    // "Artikel 2" bare, the draft names the law it amends.
    expect(rows[0]).toMatchObject({ kind: 'article', heading: 'Artikel 2 — Änderung des GmbH-Gesetzes', law: 'Änderung des GmbH-Gesetzes' })
    expect(rows[1]).toMatchObject({ gld: '§ 1.', law: 'Änderung des GmbH-Gesetzes' })
  })

  it('marks the ressort’s elision as elided rather than as a change', () => {
    const rows = parse([page([
      { y: 700, left: '§ 5. (1) und (2) …', right: '§ 5. (1) und (2) …' },
    ])])
    expect(rows[0]!.elided).toBe(true)
    expect(rows[0]!.change).toBe('unchanged')
  })
})

describe('columnBoundary', () => {
  // The columns are not symmetric. On one annex the proposed column starts at
  // x = 414,7 while the page midline is 421, so the midline filed its body
  // text as crossing both columns — 1.258 phantom Artikel rows. The gutter is
  // the only anchor the layout actually guarantees.
  it('finds the gutter when the right column starts left of the midline', () => {
    const items: AnnexItem[] = []
    for (let n = 0; n < 12; n++) {
      items.push({ x: 60, y: 700 - n * 14, width: 345, text: 'Text der geltenden Fassung in voller Breite' })
      items.push({ x: 414.7, y: 700 - n * 14, width: 360, text: 'Text der vorgeschlagenen Fassung in Breite' })
    }
    const boundary = columnBoundary([{ width: 841.92, items }])
    expect(boundary).toBeGreaterThan(405)
    expect(boundary).toBeLessThanOrEqual(414)
  })

  it('falls back to the middle when there is no text to find a gutter in', () => {
    expect(columnBoundary([{ width: 800, items: [] }])).toBe(400)
  })
})

describe('headings that span both columns', () => {
  const spanning = (y: number, text: string): AnnexItem => ({ x: 300, y, width: 260, text })

  it('opens a group only for a real Artikel line', () => {
    const rows = parse([{
      width: PAGE_WIDTH,
      items: [spanning(700, 'Artikel 2'), spanning(680, 'Änderung des Aktiengesetzes'), ...page([{ y: 640, left: '§ 1. Alt.', right: '§ 1. Neu.' }]).items],
    }], draft({ n: '1', title: 'Änderung des Bankwesengesetzes' }, { n: '2', title: 'Änderung des Aktiengesetzes' }))
    expect(rows.filter((r) => r.kind === 'article').map((r) => r.heading)).toEqual(['Artikel 2 — Änderung des Aktiengesetzes'])
  })

  // "3. Abschnitt", "10. Hauptstück" and a heading over a group of §§ all span
  // both columns too. One row each turned 109 annexes into 2.154 Artikel rows
  // where there are about 400 boundaries — and writing them into the text put
  // words into the provision that the standing law files above it.
  it('records any other spanning heading as the row’s context, not as its text', () => {
    const rows = parse([{
      width: PAGE_WIDTH,
      items: [spanning(700, '3. Abschnitt'), ...page([{ y: 660, left: '§ 4. Alt.', right: '§ 4. Neu.' }]).items],
    }])
    expect(rows.filter((r) => r.kind === 'article')).toHaveLength(0)
    expect(rows[0]!.heading).toBe('3. Abschnitt')
    expect(rows[0]!.current).toBe('§ 4. Alt.')
    expect(rows[0]!.gld).toBe('§ 4.')
  })

  // A provision the draft leaves untouched reads identically in both columns.
  // Treating identical text as a heading swallowed the law itself.
  it('does not mistake an unchanged provision for a heading', () => {
    const rows = parse([page([{ y: 700, left: '§ 9. (1) Unverändert.', right: '§ 9. (1) Unverändert.' }])])
    expect(rows).toHaveLength(1)
    expect(rows[0]!.change).toBe('unchanged')
    expect(rows[0]!.current).toBe('§ 9. (1) Unverändert.')
  })

  // "Art. 31 EUStA-VO" is a citation; "Artikel 10. (1) Bundessache ist …" is a
  // provision of a law that is itself organised in Artikel (B-VG).
  it('does not treat a citation or an Artikel-numbered provision as a boundary', () => {
    for (const text of ['Art. 31 EUStA-VO', 'Artikel 10. (1) Bundessache ist die Gesetzgebung.', 'Artikel 29b der Bilanz-Richtlinie']) {
      const rows = parse([{ width: PAGE_WIDTH, items: [spanning(700, text), ...page([{ y: 660, left: '§ 4. Alt.', right: '§ 4. Neu.' }]).items] }])
      expect(rows.filter((r) => r.kind === 'article'), text).toHaveLength(0)
    }
  })
})

describe('what looks like a provision but is not', () => {
  // Annexes reprint the law's Inhaltsverzeichnis: "§ 1. Unmittelbare
  // Bundesvollziehung", one line each. Such a line opens a § and ends without
  // a full stop — exactly the shape of a heading — so the carry that hands a
  // heading down to the § below it handed each entry to the next § instead,
  // dragging the whole table of contents three §§ forward. 126 of the
  // worst-scoring rows of the corpus were that one bug (2026-09-09).
  it('does not drag a table of contents into the provisions below it', () => {
    const rows = parse([page([
      { y: 700, left: '§ 1. Unmittelbare Bundesvollziehung', right: '§ 1. Unmittelbare Bundesvollziehung' },
      { y: 686, left: '§ 2. Bezugnahme auf Unionsrecht', right: '§ 2. Bezugnahme auf Unionsrecht' },
      { y: 672, left: '§ 3. Anwendungsbereich', right: '§ 3. Anwendungsbereich' },
      { y: 640, left: '§ 1. (1) Die Vollziehung ist Bundessache.', right: '§ 1. (1) Die Vollziehung ist Landessache.' },
    ])])
    expect(rows.find((r) => r.gld === '§ 2.')!.current).toBe('§ 2. Bezugnahme auf Unionsrecht')
    expect(rows.find((r) => r.gld === '§ 3.')!.current).toBe('§ 3. Anwendungsbereich')
    // The substantive occurrence wins over the entry in the contents.
    expect(rows.find((r) => r.gld === '§ 1.')!.current).toContain('Die Vollziehung ist Bundessache.')
  })

  // "Art. 92 Abs. 1 Buchstabe d der Verordnung (EU) 2024/1689" is a citation
  // inside running text. On a wrapped line it opened a provision that does
  // not exist, and the check against RIS looked it up as § 92.
  it('does not open a provision on a citation of an Artikel or an Anhang', () => {
    const rows = parse([page([
      { y: 700, left: '§ 5. (1) Die Behörde prüft die Anforderungen nach', right: '§ 5. (1) Das Gericht prüft die Anforderungen nach' },
      { y: 686, left: 'Art. 92 Abs. 1 Buchstabe d der Verordnung (EU) 2024/1689.', right: 'Art. 92 Abs. 1 Buchstabe d der Verordnung (EU) 2024/1689.' },
    ])])
    expect(rows).toHaveLength(1)
    expect(rows[0]!.gld).toBe('§ 5.')
    expect(rows[0]!.current).toContain('Art. 92 Abs. 1 Buchstabe d')
  })

  // A law numbered in decimals ("§ 1.08") lost everything after the first
  // period and every one of its §§ collapsed onto "§ 1".
  it('keeps a decimal paragraph number whole', () => {
    const rows = parse([page([
      { y: 700, left: '§ 1.08 Alte Fassung des Fahrverbots.', right: '§ 1.08 Neue Fassung des Fahrverbots.' },
      { y: 660, left: '§ 1.09 Alte Fassung der Sichtzeichen.', right: '§ 1.09 Neue Fassung der Sichtzeichen.' },
    ])])
    expect(rows.map((r) => r.gld)).toEqual(['§ 1.08', '§ 1.09'])
  })
})
