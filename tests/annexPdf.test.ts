import { describe, expect, expectTypeOf, it } from 'vitest'
import { columnBoundary, linesFromPage, parseAnnexParts, parseAnnexPdf, sameTypesetting, type AnnexItem, type AnnexLayout, type AnnexPage, type AnnexParse, type PageGeometry } from '../server/utils/annex/annexPdf'
import { fromMacRoman, isMacRomanMisread, spelledOut, spellingOf, uprightRuns, type RawRun } from '../server/utils/annex/annexPdfPages'
import type { DraftArticle } from '../server/utils/lawtext/draftArticles'
import { draftArticles as draft } from './helpers/builders'
import type { TextComparisonResponse } from '../shared/types'

/** One law, no Artikel structure — the shape of two drafts in three. */
const ONE_LAW = draft({ title: 'Änderung des Sicherheitspolizeigesetzes' })

/**
 * The mandated header pair, on a title page of its own.
 *
 * `parseAnnexPdf` refuses a PDF that never prints it: it is the only evidence
 * that the two columns were split where the ressort split them, and every
 * annex repeats it on every page. Prepending it leaves each fixture's own
 * geometry untouched.
 */
const headerPage = (): AnnexPage => page([{ y: 800, left: 'Geltende Fassung', right: 'Vorgeschlagene Fassung' }])

const parse = (pages: readonly AnnexPage[], articles: DraftArticle[] = ONE_LAW) => parseAnnexPdf([headerPage(), ...pages], articles).rows

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

/** A run whose advance is stated rather than derived: for setting a column's edge. */
function wide(x: number, y: number, text: string, advance: number): AnnexItem {
  return { x, y, width: advance, text }
}

/**
 * A page as `uprightRuns` hands it over, evidence included.
 *
 * `PageGeometry` is required on purpose — `parseAnnexPdf` does not read a page
 * that cannot say how it was read — and these runs are axis-aligned by
 * construction, so nothing disagrees with the frame and nothing is skewed.
 * The geometry gate's own tests pass their own numbers.
 */
function pageOf(items: readonly AnnexItem[], width = PAGE_WIDTH, geometry: Partial<PageGeometry> = {}): AnnexPage {
  return { width, items, geometry: { runs: items.filter((i) => i.text.trim()).length, offTurn: 0, skewed: 0, ...geometry } }
}

function page(lines: { y: number; left?: string; right?: string; spanning?: string }[]): AnnexPage {
  const items: AnnexItem[] = []
  for (const l of lines) {
    if (l.left) items.push(run(LEFT_X, l.y, l.left))
    if (l.right) items.push(run(RIGHT_X, l.y, l.right))
    if (l.spanning) items.push(run(LEFT_X, l.y, l.spanning))
  }
  return pageOf(items)
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
    const crossing = pageOf([{ x: 300, y: 700, width: 260, text: 'Artikel 1' }])
    expect(linesFromPage(crossing)[0]!.spanning).toBe('Artikel 1')
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
    expect(linesFromPage(pageOf(items))[0]!.left).toBe('Ein verfassungsgefährdender Angriff')
  })

  it('does not insert a space inside a kerned word', () => {
    const items: AnnexItem[] = [
      { x: 60, y: 700, width: 20, text: 'Ver' },
      { x: 80.2, y: 700, width: 25, text: 'fahren' },
    ]
    expect(linesFromPage(pageOf(items))[0]!.left).toBe('Verfahren')
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
    const rows = parse([pageOf([
      { x: 300, y: 700, width: 260, text: 'Artikel 2' },
      ...page([{ y: 660, left: '§ 1. Alt.', right: '§ 1. Neu.' }]).items,
    ])], draft({ n: '1', title: 'Änderung des Aktiengesetzes' }, { n: '2', title: 'Änderung des GmbH-Gesetzes' }))
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
    const boundary = columnBoundary([pageOf(items, 841.92)])
    expect(boundary).toBeGreaterThan(405)
    expect(boundary).toBeLessThanOrEqual(414)
  })

  it('falls back to the middle when there is no text to find a gutter in', () => {
    expect(columnBoundary([pageOf([], 800)])).toBe(400)
  })
})

/**
 * The gutter is measured over the lines that part two columns, not over all
 * the ink — the EU-ESG-Rating-Verordnung-Vollzugsgesetz in miniature
 * (2026-09-11).
 *
 * That annex sets two pages, one of them a title page whose blocks run the
 * full width of the paper. Counted as ink, those blocks are most of the
 * document and they cover the real gutter, so the emptiest strip landed at
 * 381 — inside the left column, whose text runs to 434,5 — and the word
 * "behördlichen" went out under the *proposed* version.
 *
 * The fixture reproduces the mechanism exactly: the left column ends at 434,
 * the right begins at 442, and the title page carries one block that covers
 * the gutter, one that stops short of it, and two that are letter-spaced, so
 * the ink is emptiest at 378 — well inside the left column.
 */
describe('a document whose title page carries most of the ink', () => {
  const LEFT_END = 434
  const RIGHT_START = 442
  /**
   * A title block of evenly spaced runs. Every gap is the same width, so the
   * line has no gap that stands out and says nothing about where two columns
   * part — which is exactly what tells it from a two-column line.
   */
  const spaced = (y: number, ...runs: [number, number][]): AnnexItem[] =>
    runs.map(([x, advance]) => wide(x, y, 'Titel', advance))

  const title = pageOf([
    // The Langtitel, one run across the whole page
    wide(76, 800, 'Bundesgesetz, mit dem das Vollzugsgesetz erlassen wird', 724),
    ...spaced(788, [76, 292], [380, 120], [512, 288]),
    ...spaced(776, [76, 292], [380, 33], [425, 375]),
    wide(430, 764, 'und das Finanzmarktaufsichtsbehördengesetz geändert wird', 370),
  ])

  const body = (y: number, left: string, right: string): AnnexItem[] => [
    wide(105, y, left, LEFT_END - 105),
    wide(RIGHT_START, y, right, 770 - RIGHT_START),
  ]
  const rows = pageOf([
    // The header pair, each label centred over its own column
    wide(235, 800, 'Geltende Fassung', 69),
    wide(571, 800, 'Vorgeschlagene Fassung', 70),
    ...body(780, '§ 2. (1) und (2) ...', '§ 2. (1) und (2) ...'),
    // The one line that fills the left column, and its last word is a run of
    // its own — the shape in which "behördlichen" changed columns.
    wide(105, 760, '(3) Zur Wertpapieraufsicht zählt die Wahrnehmung der', 275),
    wide(382, 760, 'behördlichen', 52),
    wide(RIGHT_START, 760, '(3) Zur Wertpapieraufsicht zählt die Wahrnehmung der behördlichen', 328),
    // …and eight ragged lines, which is why the ink is emptiest to the left
    ...[740, 720, 700, 680, 660, 640, 620, 600].flatMap((y) => [
      wide(105, y, 'Aufgaben und Befugnisse, die', 195),
      wide(RIGHT_START, y, 'Aufgaben und Befugnisse, die', 328),
    ]),
  ])

  it('cuts in the gutter and not in the emptiest strip', () => {
    const boundary = columnBoundary([title, rows])
    expect(boundary).toBeGreaterThan(LEFT_END)
    expect(boundary).toBeLessThan(RIGHT_START)
  })

  it('keeps the left column’s last word in the current version', () => {
    const parsed = parseAnnexPdf([title, rows], ONE_LAW).rows
    expect(parsed).toHaveLength(1)
    expect(parsed[0]!.current).toContain('Wahrnehmung der behördlichen')
    // Once, from the ressort's own right-hand cell — not twice
    expect(parsed[0]!.proposed.match(/behördlichen/g)).toHaveLength(1)
  })

  // The mechanism, pinned: at the strip the ink alone would have chosen, the
  // left column's last word is filed under the proposed version.
  it('would file that word as proposed if the emptiest strip were the cut', () => {
    const line = linesFromPage(rows, 379).find((l) => l.right.startsWith('behördlichen'))
    expect(line).toBeDefined()
    expect(line!.left).not.toContain('behördlichen')
  })

  // Nothing here reads a header: the pages that state the gutter are the ones
  // set in two columns, and a title or continuation page prints no header pair.
  it('needs no header pair to find the gutter', () => {
    const bare = pageOf(rows.items.filter((i) => !/Fassung$/.test(i.text)))
    expect(columnBoundary([title, bare])).toBe(columnBoundary([title, rows]))
  })
})

/**
 * One column nearly empty — an inserted § — and the emptiest strip is blank
 * paper rather than the gutter. A single line that parts the two columns is
 * enough to say where they part.
 */
describe('a document whose left column is nearly empty', () => {
  /** A letter-spaced heading across the page: even gaps, so it says nothing. */
  const heading = (y: number): AnnexItem[] => [
    wide(200, y, 'Neunter Abschnitt', 180),
    wide(392, y, 'Kontrolle', 78),
    wide(482, y, 'der Anlagen', 78),
  ]
  const page = pageOf([
    wide(235, 800, 'Geltende Fassung', 69),
    wide(571, 800, 'Vorgeschlagene Fassung', 70),
    ...heading(780),
    ...heading(768),
    wide(105, 756, '§ 7. Der Antrag ist schriftlich einzubringen.', 329),
    wide(442, 756, '§ 7. Der Antrag ist elektronisch einzubringen.', 328),
    ...[740, 728, 716, 704, 692, 680, 668, 656].map((y) => wide(442, y, '(2) Die Behörde entscheidet binnen vier Wochen.', 328)),
  ])

  it('takes the gutter from the one line that parts the columns', () => {
    const boundary = columnBoundary([page])
    expect(boundary).toBeGreaterThan(434)
    expect(boundary).toBeLessThan(442)
  })

  // The emptiest strip is the heading's word space, not the gutter: with one
  // column all but empty there is more blank paper inside the left column than
  // between the two. Cut there, the standing § 7 overhangs the cut and is
  // filed as a heading crossing both columns — gone from the comparison.
  it('is not the emptiest strip on the page', () => {
    expect(linesFromPage(page, 391).find((l) => l.spanning?.startsWith('§ 7. Der Antrag ist schriftlich'))).toBeDefined()
    const line = linesFromPage(page, columnBoundary([page])).find((l) => l.left.startsWith('§ 7.'))
    expect(line?.right).toBe('§ 7. Der Antrag ist elektronisch einzubringen.')
  })
})

/**
 * The agreed band is a band and not an answer (2026-09-11).
 *
 * Only lines printing in *both* columns vote, so a one-sided continuation line
 * may begin inside the band they agree on. On the annex to the Gewerbeordnung/
 * Emissionsschutzgesetz the band is [420, 426] while the right column's
 * continuation line "linien umgesetzt:" starts at 422,7: cutting in the band's
 * middle made it a heading crossing both columns, and § 382 lost those words
 * out of the proposed version. Inside the band the ink decides, and the ink
 * sees that line.
 */
describe('a band with a one-sided line inside it', () => {
  const page = pageOf([
    wide(235, 800, 'Geltende Fassung', 69),
    wide(571, 800, 'Vorgeschlagene Fassung', 70),
    ...[780, 768, 756, 744].flatMap((y) => [
      wide(105, y, '§ 9. Die Behörde hat die Anlage zu genehmigen.', 313),
      wide(428, y, '§ 9. Die Behörde hat die Anlage zu genehmigen.', 342),
    ]),
    // The continuation line: right column only, and it starts inside the band
    wide(421, 732, 'linien umgesetzt:', 79),
  ])

  it('cuts left of a one-sided line that starts inside the band', () => {
    const boundary = columnBoundary([page])
    expect(boundary).toBeLessThanOrEqual(421)
    const lines = linesFromPage(page, boundary)
    expect(lines.filter((l) => l.spanning !== null)).toHaveLength(0)
    expect(lines.find((l) => l.right.startsWith('linien'))).toBeDefined()
  })
})

/**
 * The seam gates the pages; the ink cuts them. Measured 2026-09-11.
 *
 * The header pair states where a page's columns lie and is what `parseAnnexPdf`
 * holds every page against — but it is not the gutter, and the difference is
 * arithmetic: both labels are centred over their cells, so their midpoint is
 * the mean of the two column *centres*, which is the gutter only where the two
 * columns are the same width. This annex's right column is 45 pt wider, so its
 * seam lands a quarter of that past the gutter — 407,5 + 11,25 = 418,75, which
 * is past the right column's first character at 415, where it would slice every
 * one of its lines and file them as spanning headings.
 *
 * That is the Abgabenänderungsgesetz 2025 in miniature: cutting at the seam
 * moves 1.285 of its runs, rewrites 111 §§, loses two, and turns a § the check
 * had withheld into a verified one. The gutter is 407,5 and the ink finds it.
 */
describe('a document whose header pair states a seam that is not its gutter', () => {
  const LEFT_A = 60, LEFT_B = 400, RIGHT_A = 415, RIGHT_B = 800
  /** The two labels, each centred over its own column. */
  const labels = (y: number): AnnexItem[] => [
    wide(195, y, 'Geltende Fassung', 70),
    wide(572.5, y, 'Vorgeschlagene Fassung', 70),
  ]
  const body = (y: number, left: string, right: string): AnnexItem[] => [
    wide(LEFT_A, y, left, LEFT_B - LEFT_A),
    wide(RIGHT_A, y, right, RIGHT_B - RIGHT_A),
  ]
  const uneven = pageOf([
    ...labels(800),
    ...body(700, '§ 5. (1) Die Behörde entscheidet über den Antrag.', '§ 5. (1) Das Gericht entscheidet über den Antrag.'),
    ...body(680, '§ 6. (1) Die Frist beträgt vier Wochen ab Zustellung.', '§ 6. (1) Die Frist beträgt sechs Wochen ab Zustellung.'),
  ])

  it('cuts at the gutter, so both columns arrive as columns', () => {
    const rows = parseAnnexPdf([uneven], ONE_LAW).rows
    expect(rows.map((r) => r.gld)).toEqual(['§ 5.', '§ 6.'])
    expect(rows[0]!.current).toBe('§ 5. (1) Die Behörde entscheidet über den Antrag.')
    expect(rows[0]!.proposed).toBe('§ 5. (1) Das Gericht entscheidet über den Antrag.')
  })

  // The mechanism, pinned: at the seam the right column's own lines overhang
  // the cut by more than `GUTTER_TOLERANCE` and stop being a column at all.
  it('would file the right column as spanning headings if the seam were the cut', () => {
    const seam = (195 + 265 + 572.5 + 642.5) / 4
    expect(seam).toBe(418.75)
    expect(columnBoundary([uneven])).toBeLessThan(RIGHT_A)
    const atSeam = linesFromPage(uneven, seam)
    expect(atSeam.filter((l) => l.spanning !== null)).toHaveLength(2)
    expect(linesFromPage(uneven, columnBoundary([uneven])).filter((l) => l.spanning !== null)).toHaveLength(0)
  })
})

describe('headings that span both columns', () => {
  const spanning = (y: number, text: string): AnnexItem => ({ x: 300, y, width: 260, text })

  it('opens a group only for a real Artikel line', () => {
    const rows = parse([pageOf([spanning(700, 'Artikel 2'), spanning(680, 'Änderung des Aktiengesetzes'), ...page([{ y: 640, left: '§ 1. Alt.', right: '§ 1. Neu.' }]).items])],
      draft({ n: '1', title: 'Änderung des Bankwesengesetzes' }, { n: '2', title: 'Änderung des Aktiengesetzes' }))
    expect(rows.filter((r) => r.kind === 'article').map((r) => r.heading)).toEqual(['Artikel 2 — Änderung des Aktiengesetzes'])
  })

  // "3. Abschnitt", "10. Hauptstück" and a heading over a group of §§ all span
  // both columns too. One row each turned 109 annexes into 2.154 Artikel rows
  // where there are about 400 boundaries — and writing them into the text put
  // words into the provision that the standing law files above it.
  it('records any other spanning heading as the row’s context, not as its text', () => {
    const rows = parse([pageOf([spanning(700, '3. Abschnitt'), ...page([{ y: 660, left: '§ 4. Alt.', right: '§ 4. Neu.' }]).items])])
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
      const rows = parse([pageOf([spanning(700, text), ...page([{ y: 660, left: '§ 4. Alt.', right: '§ 4. Neu.' }]).items])])
      expect(rows.filter((r) => r.kind === 'article'), text).toHaveLength(0)
    }
  })
})

describe('a division heading between two provisions', () => {
  // 81/ME XXVIII: five heading lines stand between § 13 and § 14, and the
  // carry took the last three — „3. Hauptstück", its name and, on the right,
  // „1. Abschnitt" stayed at the end of § 13, and the word diff showed the
  // division the draft renames as text it appends to § 13 (25.10.2026).
  it('hands the whole division heading to the provision below it', () => {
    const rows = parse([page([
      { y: 700, left: '§ 13. (1) Die Dokumente sind festzulegen.', right: '§ 13. (1) Die Dokumente sind festzulegen.' },
      { y: 686, left: '3. Hauptstück', right: '3. Hauptstück' },
      { y: 672, left: 'Beschränkungen im Verkehr mit Drittstaaten', right: 'Beschränkungen im Verkehr mit Drittstaaten' },
      { y: 658, left: '1. Abschnitt', right: '1. Abschnitt' },
      { y: 644, left: 'Beschränkungen im Güterverkehr', right: 'Allgemeine Beschränkungen' },
      { y: 630, left: 'Genehmigungspflichten', right: 'Genehmigungspflichten' },
      { y: 616, left: '§ 14. (1) Eine Genehmigung ist erforderlich.', right: '§ 14. (1) Eine Genehmigung ist erforderlich.' },
    ])])
    const thirteen = rows.find((r) => r.gld === '§ 13.')!
    expect(thirteen.current).toBe('§ 13. (1) Die Dokumente sind festzulegen.')
    expect(thirteen.proposed).toBe('§ 13. (1) Die Dokumente sind festzulegen.')
    expect(thirteen.change).toBe('unchanged')
    const fourteen = rows.find((r) => r.gld === '§ 14.')!
    expect(fourteen.current).toBe('3. Hauptstück Beschränkungen im Verkehr mit Drittstaaten 1. Abschnitt Beschränkungen im Güterverkehr Genehmigungspflichten § 14. (1) Eine Genehmigung ist erforderlich.')
    expect(fourteen.proposed.startsWith('3. Hauptstück')).toBe(true)
  })

  // A reference to a division ends its sentence, so it is no heading.
  it('leaves a reference to a division in its sentence', () => {
    const rows = parse([page([
      { y: 700, left: '§ 16. (1) Es gilt das nach dem', right: '§ 16. (1) Es gilt das nach dem' },
      { y: 686, left: '6. Teil.', right: '6. Teil.' },
      { y: 672, left: 'Aufsicht', right: 'Aufsicht' },
      { y: 658, left: '§ 17. (1) Die Aufsicht obliegt dem Land.', right: '§ 17. (1) Die Aufsicht obliegt dem Bund.' },
    ])])
    expect(rows.find((r) => r.gld === '§ 16.')!.current).toBe('§ 16. (1) Es gilt das nach dem 6. Teil.')
    expect(rows.find((r) => r.gld === '§ 17.')!.current).toBe('Aufsicht § 17. (1) Die Aufsicht obliegt dem Land.')
  })

  // FPG 2005: „Sonderbestimmungen für Minderjährige für das 3. bis 6. und das
  // 12. bis" / „14. Hauptstück" is one heading broken before a number; read
  // as a division, it split there and left its first line behind.
  it('does not split a heading broken before a division number', () => {
    const rows = parse([page([
      { y: 700, left: '§ 9. (1) bis (5) ...', right: '§ 9. (1) bis (5) ...' },
      { y: 686, left: 'Sonderbestimmungen für Minderjährige für das 3. bis 6. und das 12. bis', right: 'Sonderbestimmungen für Minderjährige für das 3. bis 6. und das 12. bis' },
      { y: 672, left: '14. Hauptstück', right: '14. Hauptstück' },
      { y: 658, left: '§ 12. (1) Minderjährige sind zu hören.', right: '§ 12. (1) Minderjährige sind anzuhören.' },
    ])])
    expect(rows.find((r) => r.gld === '§ 9.')!.current).toBe('§ 9. (1) bis (5) ...')
    expect(rows.find((r) => r.gld === '§ 12.')!.current.startsWith('Sonderbestimmungen für Minderjährige')).toBe(true)
  })
})

describe('where one § ends and the next begins, as the ministries set it (21.11.2026)', () => {
  /**
   * The template of the Bund's annexes, measured on the three documents: body
   * text from 89 to 417,5 on the left and from 424 to 753,3 on the right, an
   * Absatz or a designation indented by 19 to 20 pt, headings centred. Ten
   * body lines in each column, so the edges and margins are measured
   * (`columnEdge`, `columnMargin`).
   */
  const [L0, LE, R0, RE] = [89, 417.5, 424, 753.3]
  const at = (x: number, y: number, text: string, end: number): AnnexItem => wide(x, y, text, end - x)
  const header = (y: number): AnnexItem[] => [at(215, y, 'Geltende Fassung', 290.7), at(537, y, 'Vorgeschlagene Fassung', 641.1)]
  const filler = (y: number): AnnexItem[] => Array.from({ length: 10 }, (_, i) => [
    at(L0, y - i * 12, 'die Behörde hat die Voraussetzungen von Amts wegen zu prüfen und', LE),
    at(R0, y - i * 12, 'die Behörde hat die Voraussetzungen von Amts wegen zu prüfen und', RE),
  ]).flat()
  const read = (items: AnnexItem[]) => parseAnnexPdf([pageOf([...header(800), ...items])], ONE_LAW).rows

  // Luftfahrtgesetz (RIS C118A7EB): the right column prints „kundzumachen"
  // without its full stop, and it went to § 120c with the heading under it.
  it('leaves a § the last word a line running to the edge goes on into, full stop or none', () => {
    const rows = read([
      at(108, 780, '§ 120a. (1) Die Regelungen sind', 260), at(444, 780, '§ 120a. (1) Die Regelungen sind', 600),
      ...filler(766),
      at(108, 640, '(3) Die Regelungen gemäß Abs. 1 und 2 sind in luftfahrtüblicher Weise', 417.4), at(444, 640, '(6) Die Regelungen gemäß Abs. 1 und 5 sind in luftfahrtüblicher Weise', 753.3),
      at(L0, 628, 'kundzumachen.', 151.7), at(R0, 628, 'kundzumachen', 485),
      at(235, 616, 'Aufsicht', 270.9), at(571, 616, 'Aufsicht', 606.9),
      at(108, 604, '§ 120c. (1) …', 164.5), at(444, 604, '§ 120c. (1) …', 500.4),
      at(108, 592, '(2) Der Bundesminister ist die nationale Aufsichtsbehörde.', 380), at(444, 592, '(2) Die Bundesministerin ist die nationale Aufsichtsbehörde.', 720),
    ])
    expect(rows.find((r) => r.gld === '§ 120a.')!.proposed.endsWith('in luftfahrtüblicher Weise kundzumachen')).toBe(true)
    const c = rows.find((r) => r.gld === '§ 120c.')!
    expect(c.proposed.startsWith('Aufsicht § 120c.')).toBe(true)
    expect(c.current.startsWith('Aufsicht § 120c.')).toBe(true)
  })

  // Fluorierte Treibhausgase-Gesetz (RIS 1174CDB5): the left column prints
  // no „§ 8." at its first row, only at the next („§ 8. (2) …"), and the row
  // ran on as struck text of § 7 while § 8 kept no left half.
  it('opens the § the other column opens at the same Absatz, under a heading', () => {
    const rows = read([
      at(108, 780, '§ 7. (1) Wer gegen die Pflichten verstößt, ist zu bestrafen.', 380), at(444, 780, '§ 7. (1) Wer gegen die Pflichten verstößt, ist zu bestrafen.', 716),
      ...filler(766),
      at(L0, 640, 'zu bestrafen. Der Versuch ist strafbar.', 260), at(R0, 640, 'zu bestrafen. Der Versuch ist strafbar.', 595),
      at(223, 628, 'Vollziehung', 280), at(563, 628, 'Vollziehung', 619),
      at(105, 616, '(1) Mit der Vollziehung dieses Bundesgesetzes ist der Bundesminister betraut.', 417.4), at(445, 616, '§ 8. (1) Mit der Vollziehung dieses Bundesgesetzes ist die Bundesministerin betraut.', 753.3),
      at(105, 604, '§ 8. (2) …', 147), at(445, 604, '§ 8. (2) …', 486),
    ])
    expect(rows.find((r) => r.gld === '§ 7.')!.current.endsWith('Der Versuch ist strafbar.')).toBe(true)
    const eight = rows.find((r) => r.gld === '§ 8.')!
    expect(eight.current).toBe('Vollziehung § 8. (1) Mit der Vollziehung dieses Bundesgesetzes ist der Bundesminister betraut. § 8. (2) …')
    expect(eight.proposed.startsWith('Vollziehung § 8. (1)')).toBe(true)
  })

  // Bundesabgabenordnung in the Abgabenänderungsgesetz 2025 (RIS 24E5B4AA):
  // „§ 86." on a line of its own, and its „(1)" beside the left's „§ 86a. (1)".
  it('leaves an Absatz with the § its column has open, whatever the other column opens beside it', () => {
    const rows = read([
      ...filler(780),
      at(L0, 640, 'ohne unnötigen Aufschub zu entscheiden.', 288), at(R0, 640, 'ohne unnötigen Aufschub zu entscheiden.', 560),
      at(550, 628, 'Mängelbehebung', 622),
      at(105, 616, '§ 86. Anbringen können mündlich vorgebracht werden.', 408), at(434, 616, '§ 86.', 455),
      at(105, 604, '§ 86a. (1) Anbringen können eingereicht werden.', 407), at(434, 604, '(1) Mängel von Anbringen berechtigen nicht zur Zurückweisung.', 753),
    ])
    expect(rows.find((r) => r.gld === '§ 86.')!.proposed).toContain('(1) Mängel von Anbringen')
    expect(rows.find((r) => r.gld === '§ 86a.')!.proposed).toBe('')
  })

  // A RIS print sets its headings flush: under a heading line handed on that
  // starts at the margin, a line at the margin is the heading's too
  // (Verbraucherzahlungskontogesetz, RIS F36AA3A2).
  it('hands on a flush heading line over a flush heading line', () => {
    const rows = read([
      at(108, 780, '§ 22. (1) Die Bank hat das Konto zu führen.', 380), at(444, 780, '§ 22. (1) Die Bank hat das Konto zu führen.', 716),
      ...filler(766),
      at(L0, 640, 'Verbraucherzahlungskonten, den Wechsel von Verbraucherzahlungskonten', 413.0), at(R0, 640, 'Verbraucherzahlungskonten, den Wechsel von Verbraucherzahlungskonten', 751.0),
      at(L0, 628, 'und den Zugang zu Verbraucherzahlungskonten', 300), at(R0, 628, 'und den Zugang zu Verbraucherzahlungskonten', 636),
      at(L0, 616, 'Funktionen (Verbraucherzahlungskontogesetz – VZKG)', 330), at(R0, 616, 'Funktionen (Verbraucherzahlungskontogesetz – VZKG)', 666),
      at(108, 604, '§ 23. (1) bis (6) ...', 180.8), at(444, 604, '§ 23. (1) bis (6) ...', 516.8),
      at(108, 592, '(7) Die Bestimmungen berühren nicht die Pflichten.', 380), at(444, 592, '(7) Die Bestimmungen berühren nicht die Pflichten des Instituts.', 720),
    ])
    expect(rows.find((r) => r.gld === '§ 23.')!.current.startsWith('und den Zugang zu Verbraucherzahlungskonten Funktionen')).toBe(true)
  })

  // Bankwesengesetz (RIS 70112EBB): „IV. Abschnitt: …", a division with a
  // colon, stayed at the end of § 19g as text the draft adds to it.
  it('hands a division designated with a colon to the § below it', () => {
    const rows = read([
      at(444, 780, '§ 19g. (1) Die FMA hat mit den zuständigen Behörden zusammenzuarbeiten.', 753.3),
      ...filler(766),
      at(444, 640, '(5) Die FMA hat in ihrer Rolle als federführende zuständige Behörde gemäß', 753.0),
      at(R0, 628, 'Abs. 3 eine angemessene Koordinierung und Zusammenarbeit mit den', 753.1),
      at(R0, 616, 'einschlägigen Aufsichtsbehörden von Drittländern sicherzustellen.', 691.1),
      at(146, 604, 'Eigentümerbestimmungen und Bewilligungen', 360.4), at(443, 604, 'IV. Abschnitt: Eigentümerbestimmungen, prudenziell relevante', 735.0),
      at(491, 592, 'Transaktionen und sonstige Bewilligungen', 687.1),
      at(482, 580, '1. Unterabschnitt: Eigentümerbestimmungen', 695.5),
      at(189, 568, 'Verfahren für die Beurteilung', 317.2), at(525, 568, 'Verfahren für die Beurteilung', 653.1),
      at(108, 556, '§ 20a. (1) Die FMA hat dem interessierten Erwerber umgehend zu antworten.', 417.1), at(444, 556, '§ 20a. (1) Die FMA hat dem interessierten Erwerber umgehend zu antworten.', 753.0),
    ])
    expect(rows.find((r) => r.gld === '§ 19g.')!.proposed.endsWith('von Drittländern sicherzustellen.')).toBe(true)
    expect(rows.find((r) => r.gld === '§ 20a.')!.proposed).toBe('IV. Abschnitt: Eigentümerbestimmungen, prudenziell relevante Transaktionen und sonstige Bewilligungen 1. Unterabschnitt: Eigentümerbestimmungen Verfahren für die Beurteilung § 20a. (1) Die FMA hat dem interessierten Erwerber umgehend zu antworten.')
  })

  // Zentrale Gegenparteien-Vollzugsgesetz (RIS 048969A7): „§ 11a Dieses
  // Bundesgesetz dient …", the new § printed without the full stop after its
  // number, ran on as the end of § 11, heading and all.
  it('opens a § printed without its full stop under a centred heading', () => {
    const rows = read([
      at(108, 780, '§ 11. (1) …', 160), at(444, 780, '§ 11. (1) …', 496),
      ...filler(766),
      at(108, 640, '(2) Soweit in diesem Bundesgesetz auf die Verordnung (EU) Nr. 648/2012', 417.5), at(444, 640, '(2) Soweit in diesem Bundesgesetz auf die Verordnung (EU) Nr. 648/2012', 753.5),
      at(L0, 628, 'verwiesen wird, ist sie anzuwenden.', 300), at(425, 628, 'verwiesen wird, ist sie anzuwenden.', 636),
      at(108, 616, '(3) ...', 130.1), at(444, 616, '(3) ...', 466.1),
      at(547, 604, 'Umsetzungshinweis', 630.8),
      at(425, 592, '§ 11a Dieses Bundesgesetz dient dem Wirksamwerden der', 753.3),
      at(425, 580, 'Verordnung (EU) 2024/2987 des Europäischen Parlaments und des Rates vom', 753.3),
      at(425, 568, 'Nr. L 2024/2987 vom 04.12.2024.', 560.0),
    ])
    expect(rows.find((r) => r.gld === '§ 11.')!.proposed.endsWith('(3) ...')).toBe(true)
    expect(rows.find((r) => r.gld === '§ 11a')).toMatchObject({ change: 'inserted', proposed: 'Umsetzungshinweis § 11a Dieses Bundesgesetz dient dem Wirksamwerden der Verordnung (EU) 2024/2987 des Europäischen Parlaments und des Rates vom Nr. L 2024/2987 vom 04.12.2024.' })
  })

  // The same shape anywhere else is a citation that wrapped to a line's head
  // (BWG, „gemäß" / „§ 46 BaSAG bestellte …"): no § of its own.
  it('reads a § without its full stop under running text as the citation it is', () => {
    const rows = read([
      at(444, 780, '§ 30. (1) Die Bestimmung ist auch anzuwenden, wenn es sich bei den', 753.3),
      ...filler(766),
      at(R0, 640, 'betroffenen Personen um von der FMA gemäß', 640),
      at(R0, 628, '§ 46 BaSAG bestellte vorläufige Verwalter handelt.', 700),
    ])
    expect(rows.map((r) => r.gld)).toEqual(['§ 30.'])
  })

  // E-ControlG (RIS EA7560E7): the left column copies § 25b's heading from
  // a RIS print, flush and over three lines, and all three stood at the end
  // of § 25a.
  it('hands on a flush heading of three lines under a finished sentence', () => {
    const rows = read([
      at(108, 780, '§ 25a. (1) Die E-Control kann Ermittlungen durchführen.', 380), at(444, 780, '§ 25a. (1) Die E-Control kann Ermittlungen durchführen.', 716),
      ...filler(766),
      at(L0, 640, 'Die Bestimmungen des Allgemeinen Verwaltungsverfahrensgesetzes 1991 gelten sinngemäß.', 330), at(R0, 640, 'Die Bestimmungen des Allgemeinen Verwaltungsverfahrensgesetzes 1991 gelten sinngemäß.', 666),
      at(L0, 628, 'Sonderbestimmungen in Bezug auf die Untersuchungs- und', 417.7),
      at(L0, 616, 'Überwachungsbefugnisse im Dienste der Strafrechtspflege bei Verdacht auf', 417.2),
      at(L0, 604, 'Missbrauch einer Insider-Information', 240.8),
      at(108, 592, '§ 25b. Im Ermittlungsverfahren zur Aufklärung des Verdachts des', 417.1),
      at(L0, 580, 'Missbrauchs einer Insider-Information ist die E-Control verpflichtet.', 380),
    ])
    expect(rows.find((r) => r.gld === '§ 25a.')!.current.endsWith('gelten sinngemäß.')).toBe(true)
    expect(rows.find((r) => r.gld === '§ 25b.')!.current.startsWith('Sonderbestimmungen in Bezug auf die Untersuchungs- und Überwachungsbefugnisse im Dienste der Strafrechtspflege bei Verdacht auf Missbrauch einer Insider-Information § 25b.')).toBe(true)
  })

  // ASVG, GSVG and BSVG (RIS CF28D2C0): a § the draft repeals, whose right
  // cell prints „Aufgehoben" beside its heading and beside each Absatz, but
  // not its designation. The first two went to the end of § 79c, the last
  // two to the heading of § 823.
  it('files a repeal word beside a § only the left column opens under that §, not under its neighbours', () => {
    const rows = read([
      at(444, 780, '§ 79c. (1) Der Dachverband ist verpflichtet, einmal jährlich den Anteil', 753.2),
      ...filler(766),
      at(444, 640, '(5) Das Bundesministerium hat die Quote jährlich zu evaluieren. Der', 753.1),
      at(R0, 628, 'Evaluierungsbericht ist dem Nationalrat zuzuleiten.', 516.1),
      at(104, 616, 'Besondere Höherversicherung für erwerbstätige PensionsbezieherInnen', 401.9), at(564, 616, 'Aufgehoben', 614.2),
      at(108, 604, '§ 248c. (1) Wird neben dem Bezug einer Alterspension', 417.1), at(444, 604, 'Aufgehoben', 492.1),
      at(L0, 592, 'Regelpensionsalters eine Erwerbstätigkeit ausgeübt, so gebührt ein', 417.2),
      at(L0, 580, 'besonderer Höherversicherungsbetrag.', 251.8),
      at(108, 568, '(2) Für die Bemessung des besonderen Höherversicherungsbetrages sind die', 417.2), at(444, 568, 'Aufgehoben', 492.1),
      at(L0, 556, 'Beiträge mit einem Faktor zu vervielfachen.', 191.8),
      at(437, 544, 'Schlussbestimmungen zu Art. 1 des Bundesgesetzes BGBl. I Nr. xxx/2026', 740.6),
      at(444, 532, '§ 823. (1) § 79c samt Überschrift in der Fassung des Bundesgesetzes', 753.1),
      at(R0, 520, 'BGBl. I Nr. xxx/2026 tritt mit dem der Kundmachung folgenden Tag in Kraft.', 734.0),
    ])
    expect(rows.find((r) => r.gld === '§ 79c.')!.proposed.endsWith('dem Nationalrat zuzuleiten.')).toBe(true)
    expect(rows.find((r) => r.gld === '§ 823.')!.proposed.startsWith('Schlussbestimmungen zu Art. 1 des Bundesgesetzes')).toBe(true)
    expect(rows.find((r) => r.gld === '§ 248c.')).toMatchObject({ change: 'removed', proposed: '' })
    expect(rows.filter((r) => r.proposed.includes('Aufgehoben'))).toEqual([])
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

  // FPRG 2021 (RIS 68ACFF3F, 19.11.2026): the annex re-opens § 3 at
  // „(10) bis (11) …" to print its new Abs. 12. Keeping the longest print
  // showed § 3 confirmed and without it.
  it('joins a § the annex re-opens at a later Absatz, in printed order', () => {
    const rows = parse([page([
      { y: 714, left: '§ 3. (1) bis (8) … (9) Anfragen des Fiskalrats sind', right: '§ 3. (1) bis (8) … (9) Anfragen des Fiskalrats sind' },
      { y: 700, left: 'von den Gebietskörperschaften zu beantworten.', right: 'von den Gebietskörperschaften unverzüglich zu beantworten.' },
      { y: 686, left: '§ 3. (10) bis (11) …', right: '§ 3. (10) bis (11) …' },
      { y: 672, right: '(12) Der Fiskalrat ist alle fünf Jahre zu evaluieren.' },
    ])])
    expect(rows).toHaveLength(1)
    expect(rows[0]!.proposed).toContain('(9) Anfragen des Fiskalrats sind von den Gebietskörperschaften unverzüglich zu beantworten.')
    expect(rows[0]!.proposed).toContain('(12) Der Fiskalrat ist alle fünf Jahre zu evaluieren.')
    expect(rows[0]!.ambiguous).toBeUndefined()
  })

  // AVG § 18a (RIS 68850B92): two variants of one new §, each opening at
  // „(1)". Neither continues the other, so neither may stand for the §.
  it('marks a § printed twice as a provision, not a continuation, as ambiguous', () => {
    const rows = parse([page([
      { y: 700, right: '§ 18a. (1) Soweit nichts anderes bestimmt ist, gilt Variante A.' },
      { y: 672, right: '§ 18a. (1) Die oberste Behörde bestimmt die Variante B.' },
    ])])
    expect(rows).toHaveLength(1)
    expect(rows[0]!.ambiguous).toBe(true)
  })

  // A contents line the reader did not recognise as one („§ 21. und § 21a.
  // ...", BWG package RIS 70112EBB) carries no provision; the real § wins,
  // and nothing is ambiguous.
  it('drops a print of a § that carries no provision, without marking the § ambiguous', () => {
    const rows = parse([page([
      { y: 700, left: '§ 21. und § 21a. ...', right: '§ 21. und § 21a. ...' },
      { y: 640, left: '§ 21. (1) Für jede Verschmelzung ist eine Bewilligung nötig.', right: '§ 21. (1) Für jede Verschmelzung ist eine Bewilligung der FMA nötig.' },
    ])])
    const row = rows.find((r) => r.gld === '§ 21.')!
    expect(row.current).toContain('Für jede Verschmelzung')
    expect(row.current).not.toContain('§ 21a.')
    expect(row.ambiguous).toBeUndefined()
  })

  // BWG § 19a (RIS 70112EBB): „… keine qualifizierte Zweigstelle eines
  // ausländischen Kreditinstituts gemäß" over „§ 19b.". The citation opened
  // a § 19b, and § 19a ended at „gemäß" without its Abs. 2 and 3.
  it('does not open a provision on a citation the line above runs on into', () => {
    const rows = parse([page([
      { y: 700, right: '§ 19a. (1) Die Zweigstelle ist keine qualifizierte Zweigstelle gemäß' },
      { y: 686, right: '§ 19b.' },
      { y: 672, right: '(2) Die FMA hat die Einstufung jährlich zu überprüfen.' },
    ])])
    expect(rows).toHaveLength(1)
    expect(rows[0]!.gld).toBe('§ 19a.')
    expect(rows[0]!.proposed).toContain('(2) Die FMA hat die Einstufung jährlich zu überprüfen.')
  })

  // GAP-Strategieplan-Anwendungsverordnung (RIS C3F4E0AD): an
  // Inkrafttretensbestimmung's list of citations wrapped to „§ 223b., § 4
  // Abs. 6, …" and beat the real new § 223b.
  it('does not open a provision on a designation followed by a comma', () => {
    const rows = parse([page([
      { y: 700, right: '§ 242. (12) Die Bestimmungen' },
      { y: 686, right: '§ 223b., § 4 Abs. 6 und § 25 Abs. 3 treten mit 1. Jänner 2027 in Kraft.' },
    ])])
    expect(rows.map((r) => r.gld)).toEqual(['§ 242.'])
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

  // The shapes GP XXVIII still filed as provisions: a treaty, a
  // directive by name, a lowercase continuation. And the two that must stay
  // headings: a title, and „zu § 14".
  it.each([
    'Art. 8 EMRK führen würde.',
    'Art. 39 Richtlinie 2009/72/EG bzw. Art. 43 der Richtlinie 2009/73/EG.',
    'Art. 29a Bilanz-Richtlinie erstellt wurde.',
    'Art. 6 oder Art. 7 Abs. 1 bis 11 der Verordnung.',
    'Anhang XVI gelten ausschließlich die Bestimmungen dieses Abschnittes.',
    'Anhang XVI, oder bei Verkehrsdiensten.',
    // Salzburg's Landarbeitsordnung (sbg-18121) names the part in full words.
    'Anhang I Teil 2 und 3 der Verordnung (EG) Nr 1272/2008 zu verstehen.',
  ])('reads „%s" on a wrapped line as a citation', (text) => {
    const rows = parse([page([
      { y: 700, left: '§ 5. (1) Die Behörde entscheidet nach', right: '§ 5. (1) Das Gericht entscheidet nach' },
      { y: 686, left: text, right: text },
    ])])
    expect(rows.map((r) => r.gld)).toEqual(['§ 5.'])
  })

  // And the Absatz in full words, at the head of a line that ran to the edge
  // of its column — no heading, so read as a provision of its own (sbg-18121).
  it('reads „Artikel 16 Absatz 1 …" at the head of a wrapped line as a citation', () => {
    const rows = parse([pageOf([
      ...page([{ y: 700, left: '§ 5. (1) Es gelten die Pflichten nach', right: '§ 5. (1) Es gelten die Pflichten nach' }]).items,
      wide(LEFT_X, 686, 'Artikel 16 Absatz 1 der Richtlinie 89/391/EWG des Rates über die', 356),
      wide(RIGHT_X, 686, 'Artikel 16 Absatz 1 der Richtlinie 89/391/EWG des Rates über die', 366),
      ...page([{ y: 672, left: 'Durchführung von Maßnahmen.', right: 'Durchführung von Maßnahmen.' }]).items,
    ])])
    expect(rows.map((r) => r.gld)).toEqual(['§ 5.'])
  })

  it.each(['Anlage 5 zu § 14 Liquiditätsmanagement-Instrumente', 'Anhang III Liste der zentralen öffentlichen Auftraggeber'])('keeps „%s" a heading', (text) => {
    const rows = parse([page([
      { y: 700, left: '§ 5. (1) Die Behörde entscheidet.', right: '§ 5. (1) Das Gericht entscheidet.' },
      { y: 660, left: text, right: text },
    ])])
    expect(rows.map((r) => r.gld)).toContain(text.split(' ').slice(0, 2).join(' '))
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

  // 707EA278: „§ 6.01a" opened as „§ 6.01", and its rows fell onto § 6.01 (26.10.2026).
  it('keeps the letter behind a decimal paragraph number', () => {
    const rows = parse([page([
      { y: 700, left: '§ 6.01 Alte Fassung.', right: '§ 6.01 Neue Fassung.' },
      { y: 660, left: '§ 6.01a Alte Fassung der Ausnahme.', right: '§ 6.01a Neue Fassung der Ausnahme.' },
    ])])
    expect(rows.map((r) => r.gld)).toEqual(['§ 6.01', '§ 6.01a'])
  })

  // The Wasserstraßen-Verkehrsordnung (RIS 707EA278) prints its designations
  // without a closing full stop, so a citation at the head of a line has the
  // same shape: „§ 3.22 und 3.25, führen:" opened a § 3.22 of its own.
  it('reads a decimal § with a lowercase continuation as a citation', () => {
    const rows = parse([page([
      { y: 700, left: '§ 3.14 Alte Bezeichnung der Fahrzeuge, die nach', right: '§ 3.14 Neue Bezeichnung der Fahrzeuge, die nach' },
      { y: 686, left: '§ 3.22 und 3.25, führen:', right: '§ 3.22 und 3.25, führen:' },
      { y: 672, left: '§ 3.15 Alte Fassung.', right: '§ 3.15 Neue Fassung.' },
    ])])
    expect(rows.map((r) => r.gld)).toEqual(['§ 3.14', '§ 3.15'])
    expect(rows[0]!.current).toContain('§ 3.22 und 3.25, führen:')
  })

  // RIS prints the §§ of the Jurisdiktionsnorm and the old ZPO as „§. 121.".
  // Unread, § 121 JN was front matter of its Artikel and its change reached no
  // row (Budgetbegleitgesetz 2027-2028, RIS 04AE704E, 19.11.2026).
  it('opens a § printed with a full stop after the sign', () => {
    const rows = parse([page([
      { y: 700, left: '§. 121. Die Beglaubigung von Unterschriften und die', right: '§. 121. Die Beglaubigung von Unterschriften und die' },
      { y: 686, left: 'gerichtliche Aufnahme letztwilliger Anordnungen.', right: 'Vidimirung von Abschriften.' },
      { y: 672, left: '§. 122. Alte Fassung.', right: '§. 122. Neue Fassung.' },
    ])])
    expect(rows.map((r) => r.gld)).toEqual(['§. 121.', '§. 122.'])
    expect(rows[0]!.change).toBe('changed')
  })
})

describe('the tail of one unit and the heading of the next', () => {
  // „(zu § 61 Abs. 5 und 5a)" under a schedule's designation names the §§ it
  // belongs to (RIS E9F4C208); above a designation the same words are the
  // heading's (Salzburg's Gemeindewahlordnung, sbg-18058).
  it('keeps „(zu …)" under its designation, and hands it on above one', () => {
    const rows = parse([page([
      { y: 700, left: 'Anlage 11', right: 'Anlage 11' },
      { y: 686, left: '(zu § 61 Abs. 5 und 5a)', right: '(zu § 61 Abs. 5 und 5a)' },
      { y: 672, left: 'Anlage 12', right: 'Anlage 12' },
      { y: 658, left: '(zu § 2 Z 4 lit. g)', right: '(zu § 2 Z 4 lit. g)' },
    ]), page([
      { y: 700, left: '§ 94. (1) Die §§ 3 und 5 sind anzuwenden.', right: '§ 94. (1) Die §§ 3 und 5 sind anzuwenden.' },
      { y: 686, left: 'Hauptwahlbehörde', right: 'Hauptwahlbehörde' },
      { y: 672, left: '(zu den §§ 6 und 10)', right: '(zu den §§ 6 und 10)' },
      { y: 658, left: '§ 98. (1) Die Mitglieder sind zu bestellen.', right: '§ 98. (1) Die Mitglieder werden bestellt.' },
    ])])
    expect(rows.find((r) => r.gld === 'Anlage 11')!.current).toBe('Anlage 11 (zu § 61 Abs. 5 und 5a)')
    expect(rows.find((r) => r.gld === 'Anlage 12')!.current).toBe('Anlage 12 (zu § 2 Z 4 lit. g)')
    expect(rows.find((r) => r.gld === '§ 94.')!.current).toBe('§ 94. (1) Die §§ 3 und 5 sind anzuwenden.')
    expect(rows.find((r) => r.gld === '§ 98.')!.current.startsWith('Hauptwahlbehörde (zu den §§ 6 und 10) § 98.')).toBe(true)
  })

  // „… in Kraft.“ ends a sentence: the closing quote of a quoted provision
  // stood after the full stop, and Salzburg's § 221 (sbg-20807) lost its last
  // line to Anlage 1 as that schedule's heading.
  it('ends a sentence at a closing quote', () => {
    const rows = parse([page([
      { y: 700, left: '§ 221. (1) bis (16) …', right: '§ 221. (1) bis (16) … (17) Diese Fassung tritt mit dem auf dessen' },
      { y: 686, right: 'Kundmachung folgenden Monatsersten in Kraft.“' },
      { y: 672, left: 'Anlage 1', right: 'Anlage 1' },
      { y: 658, left: 'Verwendungsgruppe A (Höherer Dienst)', right: 'Verwendungsgruppe A (Höherer Dienst)' },
    ])])
    expect(rows.find((r) => r.gld === '§ 221.')!.proposed).toContain('Monatsersten in Kraft.')
    expect(rows.find((r) => r.gld === 'Anlage 1')!.proposed).toBe('Anlage 1 Verwendungsgruppe A (Höherer Dienst)')
  })
})

describe('a title over the annex’s pages', () => {
  /** „Textgegenüberstellung" across both columns, as the annex heads its first page. */
  const title = (y: number): AnnexItem => ({ x: 300, y, width: 260, text: 'Textgegenüberstellung' })
  const withTitle = (lines: Parameters<typeof page>[0]): AnnexPage => pageOf([title(780), ...headerPage().items.map((i) => ({ ...i, y: 760 })), ...page(lines).items])

  // Salzburg prints it on every page of some documents (sbg-20822, all 42),
  // and read as the start of a new document each time it cut the § that ran
  // over the page: § 36 ended „Vorschüsse von", on both sides alike.
  it('is a running head on every page, and a § runs on over the page', () => {
    const rows = parseAnnexPdf([
      withTitle([{ y: 700, left: '§ 36. (1) Die Gemeinden haben Vorschüsse von', right: '§ 36. (1) Die Gemeinden haben Vorschüsse von' }]),
      withTitle([{ y: 700, left: 'je 22,5 % zu leisten.', right: 'je 22,5 % zu leisten.' }]),
    ], ONE_LAW).rows
    expect(rows.map((r) => r.gld)).toEqual(['§ 36.'])
    expect(rows[0]!.current).toBe('§ 36. (1) Die Gemeinden haben Vorschüsse von je 22,5 % zu leisten.')
  })

  // Several files read as one annex each open with the title on a page of
  // their own (12/ME XXVIII, RIS 215AB69F): what follows is the next
  // document's front matter, no text of the § before it.
  it('starts a document of its own on a page after one without it', () => {
    const rows = parseAnnexPdf([
      withTitle([{ y: 700, left: '§ 4. (1) Die Rebsorten sind zugelassen.', right: '§ 4. (1) Die Rebsorten sind zugelassen.' }]),
      page([{ y: 700, left: '§ 5. (1) Weiter.', right: '§ 5. (1) Weiter.' }]),
      withTitle([
        { y: 700, left: 'Langtitel', right: 'Langtitel' },
        { y: 686, left: 'Verordnung über das Weinbaukataster.', right: 'Verordnung über das Weinbaukataster.' },
        { y: 672, left: 'Auf Grund des Weingesetzes wird verordnet:', right: 'Auf Grund des Weingesetzes wird verordnet:' },
        { y: 658, left: '§ 1. (1) Das Kataster ist zu führen.', right: '§ 1. (1) Das Kataster wird geführt.' },
      ]),
    ], ONE_LAW).rows
    expect(rows.find((r) => r.gld === '§ 5.')!.current).toBe('§ 5. (1) Weiter.')
    expect(rows.find((r) => r.gld === '§ 1.')!.current).toBe('§ 1. (1) Das Kataster ist zu führen.')
  })
})

describe('the header pair as the gate on the geometry', () => {
  // Every line of this path is read out of a coordinate, and nothing in the
  // text itself would reveal that the coordinates were misread — the words
  // are real, only their arrangement is ours. The Rundschreiben's header pair,
  // found as a left/right line, is the proof that the columns were split where
  // the ressort split them; 113 of the 114 GP-XXVIII PDF annexes print it, and
  // the 114th only fails because its pages are turned (2026-09-10).
  it('refuses a PDF that never prints the two column headings', () => {
    const parsed = parseAnnexPdf([page([
      { y: 700, left: '§ 5. (1) Die Behörde entscheidet.', right: '§ 5. (1) Das Gericht entscheidet.' },
    ])], ONE_LAW)
    expect(parsed.rows).toEqual([])
    expect(parsed.unreadable).toContain('Spaltenüberschriften')
  })

  // Three of the 114 qualify or rename the heading — "Geltende Fassung nach
  // Inkrafttreten EuGB-VVG", "Geltender Text"/"Vorgeschlagener Text" — and an
  // exact-equality test read those as ordinary law text.
  it('accepts the wordings the corpus prints, and keeps them out of the rows', () => {
    for (const [left, right] of [['Geltende Fassung nach Inkrafttreten EuGB-VVG', 'Vorgeschlagene Fassung'], ['Geltender Text', 'Vorgeschlagener Text']]) {
      const rows = parseAnnexPdf([page([
        { y: 800, left, right },
        { y: 700, left: '§ 5. Alt.', right: '§ 5. Neu.' },
      ])], ONE_LAW).rows
      expect(rows.map((r) => r.gld), left).toEqual(['§ 5.'])
    }
  })
})

describe('the page geometry as the second gate', () => {
  const full = (pages: readonly AnnexPage[]) => parseAnnexPdf([headerPage(), ...pages], ONE_LAW)
  const provision = (gld: string) => page([{ y: 700, left: `${gld} (1) Alt.`, right: `${gld} (1) Neu.` }])

  // The column boundary is one number for the whole document, so a page set
  // differently is not read differently — it is read wrongly, in words that
  // are all real. No document of GP XXVIII mixes page widths, no page carries
  // a run against its majority turn and no run is skewed (3.213 pages,
  // 2026-09-10): the gate costs nothing today, which is why it can be had
  // before the first such page rather than after.
  it('does not read a page that is not set like the rest of the document', () => {
    const odd = pageOf(provision('§ 9.').items, 595)
    const parsed = full([provision('§ 5.'), odd])
    expect(parsed.rows.map((r) => r.gld)).toEqual(['§ 5.'])
    expect(parsed.droppedPages).toBe(1)
  })

  it('does not read a page whose text is skewed off every quarter turn', () => {
    const parsed = full([provision('§ 5.'), pageOf(provision('§ 9.').items, PAGE_WIDTH, { skewed: 1 })])
    expect(parsed.rows.map((r) => r.gld)).toEqual(['§ 5.'])
    expect(parsed.droppedPages).toBe(1)
  })

  it('does not read a page a tenth of whose runs disagree with its frame', () => {
    const parsed = full([provision('§ 5.'), pageOf(provision('§ 9.').items, PAGE_WIDTH, { runs: 20, offTurn: 2 })])
    expect(parsed.rows.map((r) => r.gld)).toEqual(['§ 5.'])
    expect(parsed.droppedPages).toBe(1)
  })

  // A page number set upright on an otherwise turned page is one run against
  // thirty. `uprightRuns` reads such a page in the majority's frame, and that
  // is the right answer, not a defect to refuse.
  it('reads a page that carries a single stray run in another frame', () => {
    const parsed = full([pageOf(provision('§ 9.').items, PAGE_WIDTH, { runs: 20, offTurn: 1 })])
    expect(parsed.rows.map((r) => r.gld)).toEqual(['§ 9.'])
    expect(parsed.droppedPages).toBe(0)
  })

  it('says which way it failed when no page can be vouched for', () => {
    const parsed = parseAnnexPdf([pageOf(provision('§ 5.').items, PAGE_WIDTH, { skewed: 3 })], ONE_LAW)
    expect(parsed.rows).toEqual([])
    expect(parsed.droppedPages).toBe(1)
    expect(parsed.unreadable).toContain('Seitengeometrie')
  })

  it('counts no dropped page for a document read whole', () => {
    expect(full([provision('§ 5.')]).droppedPages).toBe(0)
  })

  /**
   * The count reaches the reader, and that is a claim about a type.
   *
   * There is no cheap runtime test for the rest of the way: the service needs
   * Nitro and the sentence lives in a Vue component. The shape can still be
   * held, because `tsconfig.tools.json` typechecks this file — so an
   * `AnnexParse.droppedPages` that stopped being a required number, or a
   * response that lost the field, fails `pnpm typecheck:tools` instead of
   * failing quietly in a browser. Optional is the harmful shape: the section
   * prints its sentence on `> 0`, and `undefined > 0` is silently false, so
   * the page would go back to showing a comparison with an unmentioned hole
   * in it.
   */
  it('travels to the response as a required number, 0 on the table path', () => {
    expectTypeOf<AnnexParse['droppedPages']>().toEqualTypeOf<number>()
    expectTypeOf<TextComparisonResponse['droppedPages']>().toEqualTypeOf<number>()
    const fromTable: Pick<TextComparisonResponse, 'readFrom' | 'droppedPages'> = { readFrom: 'table', droppedPages: 0 }
    expect(fromTable.droppedPages).toBe(0)
  })
})

describe('the seam of the header pair as the third gate', () => {
  const full = (pages: readonly AnnexPage[]) => parseAnnexPdf([headerPage(), ...pages], ONE_LAW)
  /** A page with the mandated header pair over a provision, both columns set. */
  const spread = (gld: string) => page([
    { y: 800, left: 'Geltende Fassung', right: 'Vorgeschlagene Fassung' },
    { y: 700, left: `${gld} (1) Alt.`, right: `${gld} (1) Neu.` },
  ])
  /** The same page, its whole content moved sideways — the fault the gate is for. */
  const moved = (p: AnnexPage, by: number): AnnexPage => ({ ...p, items: p.items.map((i) => ({ ...i, x: i.x + by })) })

  /**
   * The two labels are centred over the two columns, so the midpoint between
   * them is the page's own account of where the columns part. Over the 3.213
   * pages of the 114 GP-XXVIII annexes it deviates from its document's by more
   * than 0,5 pt on three pages and never by more than 1,74 pt; a displacement
   * of 5 pt already changes the parse of 41 annexes (2026-09-11).
   *
   * This page's runs would still fall in the right columns — the fixture's
   * text sits nowhere near the boundary — and it is refused all the same. That
   * is the decision, not an accident of the fixture: a refused page is a hole
   * the reader is told about, a misread one is not.
   */
  it('does not read a page whose header pair puts the columns elsewhere', () => {
    const parsed = full([spread('§ 5.'), moved(spread('§ 9.'), 40)])
    expect(parsed.rows.map((r) => r.gld)).toEqual(['§ 5.'])
    expect(parsed.droppedPages).toBe(1)
  })

  // The tolerance is not zero on purpose: a ressort re-sets the labels of a
  // title page by a point or two without moving the columns.
  it('reads a page whose seam is a point off', () => {
    const parsed = full([spread('§ 5.'), moved(spread('§ 9.'), 3)])
    expect(parsed.rows.map((r) => r.gld)).toEqual(['§ 5.', '§ 9.'])
    expect(parsed.droppedPages).toBe(0)
  })

  // 92 pages of the corpus print no header pair, 78 of them with real
  // two-column lines. They state no seam, so the gate has nothing to hold them
  // against and they keep the behaviour they had.
  it('reads a page that prints no header pair, wherever its text sits', () => {
    const parsed = full([moved(page([{ y: 700, left: '§ 9. (1) Alt.', right: '§ 9. (1) Neu.' }]), 30)])
    expect(parsed.rows.map((r) => r.gld)).toEqual(['§ 9.'])
    expect(parsed.droppedPages).toBe(0)
  })

  /**
   * Plurality, not the median: where a document mixes two layouts the seams
   * are two clusters, and the median between them is a value no page printed —
   * both clusters would be refused and the annex would come out empty.
   */
  it('keeps the layout most of the pages share and drops the odd one', () => {
    const parsed = parseAnnexPdf([moved(spread('§ 1.'), 40), spread('§ 5.'), spread('§ 9.')], ONE_LAW)
    expect(parsed.rows.map((r) => r.gld)).toEqual(['§ 5.', '§ 9.'])
    expect(parsed.droppedPages).toBe(1)
  })

  it('counts no dropped page for a document set one way throughout', () => {
    expect(full([spread('§ 5.'), spread('§ 9.')]).droppedPages).toBe(0)
  })
})

describe('each column measured against its own edge', () => {
  /**
   * A § whose heading runs over two lines, printed in **both** columns.
   *
   * Ten body lines state where each column's text ends — 340 pt of type, so
   * the left column ends at 400 and the right at 810; fewer than ten lines is
   * not a measurement and the column's outer limit would stand instead. The
   * heading's first line is set 10 pt wider, which is what a centred heading
   * that nearly fills its column looks like.
   *
   * The rule used to measure the left column against the gutter (421) and the
   * right against the page edge (842), so that first line counted as wrapped
   * on the left — where it blocked the carry — and never on the right, where
   * it was handed to § 5 as if the draft had written it. 70 §§ of the corpus
   * showed their own standing heading as new text this way (2026-09-10). Both
   * columns now measure against their own edge, so the same line falls the
   * same way twice, and § 5 reads as the unchanged provision it is.
   */
  const heading = 'Besondere Voraussetzungen für die Bewilligung von Anlagen'
  const body = (n: number, y: number): AnnexItem[] => [
    wide(LEFT_X, y, `(${n}) Die Behörde hat die Voraussetzungen von Amts wegen zu prüfen.`, 340),
    wide(RIGHT_X, y, `(${n}) Die Behörde hat die Voraussetzungen von Amts wegen zu prüfen.`, 340),
  ]
  const twoLineHeading = (): AnnexPage => pageOf([
    ...page([{ y: 740, left: '§ 4. (1) Die Behörde entscheidet mit Bescheid.', right: '§ 4. (1) Die Behörde entscheidet mit Bescheid.' }]).items,
    ...Array.from({ length: 10 }, (_, i) => body(i + 2, 720 - i * 20)).flat(),
    wide(LEFT_X, 500, heading, 350),
    wide(RIGHT_X, 500, heading, 350),
    // The short second line centred, as the annexes set a heading: one that
    // starts at the margin under a line run to the edge is that line's end
    // (21.11.2026).
    wide(LEFT_X + 120, 480, 'in besonderen Fällen', 100),
    wide(RIGHT_X + 120, 480, 'in besonderen Fällen', 100),
    ...page([
      { y: 460, left: '§ 5. (1) Der Antrag ist schriftlich zu stellen.', right: '§ 5. (1) Der Antrag ist schriftlich zu stellen.' },
    ]).items,
  ])

  it('hands a two-line heading to the same side twice', () => {
    const rows = parse([twoLineHeading()])
    const five = rows.find((r) => r.gld === '§ 5.')!
    expect(five.current).toBe(five.proposed)
    expect(five.change).toBe('unchanged')
    // The heading's short second line is carried to the § it stands over; its
    // first line reached the edge of both columns and stays with § 4 — in both
    // columns, which is the whole point.
    expect(five.current).toContain('in besonderen Fällen')
    expect(five.current).not.toContain('Besondere Voraussetzungen')
    const four = rows.find((r) => r.gld === '§ 4.')!
    expect(four.change).toBe('unchanged')
    expect(four.current).toContain('Besondere Voraussetzungen')
  })

  // A word broken over two lines is one text. Salzburg's Raumordnungsgesetz
  // (sbg-18131) heads its § 39 with three lines, the first set two points in
  // from the margin and running to the edge; the carry stopped there and § 38
  // ended in „Flächen für Einzel-".
  it('hands on the line whose word the heading goes on with', () => {
    const rows = parse([pageOf([
      ...page([{ y: 740, left: '§ 38. (1) Die Behörde entscheidet mit Bescheid.', right: '§ 38. (1) Die Behörde entscheidet mit Bescheid.' }]).items,
      ...Array.from({ length: 10 }, (_, i) => body(i + 2, 720 - i * 20)).flat(),
      wide(LEFT_X + 2, 500, 'Kennzeichnung von Flächen für Einzel-', 336),
      wide(RIGHT_X + 2, 500, 'Kennzeichnung von Flächen für Einzel-', 336),
      ...page([
        { y: 480, left: 'handelsnutzungen', right: 'handelsnutzungen' },
        { y: 460, left: '§ 39. (1) Der Antrag ist schriftlich zu stellen.', right: '§ 39. (1) Der Antrag ist schriftlich zu stellen.' },
      ]).items.map((i) => ({ ...i, x: i.text === 'handelsnutzungen' ? i.x + 130 : i.x })),
    ])])
    expect(rows.find((r) => r.gld === '§ 38.')!.current).not.toContain('Einzel')
    expect(rows.find((r) => r.gld === '§ 39.')!.current.startsWith('Kennzeichnung von Flächen für Einzelhandelsnutzungen § 39.')).toBe(true)
  })
})

describe('a layout that centres its headings over the designation (Salzburg, 26.10.2026)', () => {
  /** Salzburg's two columns: body from the margin to the edge, heading and „§ n." centred over it. */
  const FULL = 340
  const centre = (x: number) => (x === LEFT_X ? LEFT_X + FULL / 2 : RIGHT_X + FULL / 2)
  const both = (y: number, text: string, advance = text.length * CHAR): AnnexItem[] => [wide(LEFT_X, y, text, advance), wide(RIGHT_X, y, text, advance)]
  const centred = (y: number, text: string): AnnexItem[] => [LEFT_X, RIGHT_X].map((x) => wide(centre(x) - (text.length * CHAR) / 2, y, text, text.length * CHAR))
  const body = (y: number) => both(y, 'Die Behörde hat die Bewerberinnen und Bewerber davon schriftlich zu', FULL)
  const document = (tail: AnnexItem[]) => [pageOf([
    ...centred(740, 'Informationsrecht'),
    ...centred(725, '§ 7.'),
    // Ten lines at least, or the column's edge is not measured (`columnEdge`).
    ...Array.from({ length: 10 }, (_, i) => body(710 - i * 11)).flat(),
    ...tail,
    ...centred(560, 'Ausschreibung'),
    ...centred(545, '§ 8.'),
    ...both(530, '(1) Jede Stelle ist auszuschreiben.'),
  ])]
  const rows = (pages: AnnexPage[], layout: AnnexLayout = { headingsCentred: true }) => parseAnnexPdf([headerPage(), ...pages], ONE_LAW, layout).rows

  // Salzburg 23522 prints § 7's last line without its full stop; read as a
  // heading, it went to § 8, and § 7's new text ended mid-sentence.
  it('leaves a § its last line, full stop or none, where that line stands off the middle', () => {
    const pages = document(both(599, 'und die Beurteilung ihrer Person zu erhalten'))
    const [seven, eight] = [rows(pages).find((r) => r.gld === '§ 7.')!, rows(pages).find((r) => r.gld === '§ 8.')!]
    expect(seven.proposed.endsWith('und die Beurteilung ihrer Person zu erhalten')).toBe(true)
    expect(eight.proposed.startsWith('Ausschreibung § 8.')).toBe(true)
    // Read without the layout, the line stays with § 7 too since 21.11.2026:
    // it starts at the margin under a line that ran to the edge.
    expect(rows(pages, {}).find((r) => r.gld === '§ 8.')!.proposed.startsWith('Ausschreibung § 8.')).toBe(true)
  })

  // 22320, § 6 of the Gehaltsgesetz: as wide as the column, the last line
  // stands on the middle too; the line above runs on into it.
  it('leaves a § a last line as wide as the column where the line above runs on into it', () => {
    const pages = document(both(599, 'ihrem Anforderungswert entsprechenden Einkommensband zugeordnet werden', FULL))
    expect(rows(pages).find((r) => r.gld === '§ 7.')!.proposed.endsWith('zugeordnet werden')).toBe(true)
    expect(rows(pages).find((r) => r.gld === '§ 8.')!.proposed.startsWith('Ausschreibung § 8.')).toBe(true)
  })

  it('hands a heading on, however it ends, and never „entfällt"', () => {
    const pages = document([...both(599, 'zu verständigen.'), ...centred(580, 'entfällt')])
    expect(rows(pages).find((r) => r.gld === '§ 7.')!.proposed.endsWith('zu verständigen. entfällt')).toBe(true)
    expect(rows(pages).find((r) => r.gld === '§ 8.')!.proposed.startsWith('Ausschreibung § 8.')).toBe(true)
  })

  // 35399 sets „§ 15." and „§ 175." of its Landesbedienstetengesetz over the
  // whole table, under a heading across both columns: one run across the
  // gutter, which the column its middle fell in took — the other ran the §
  // on into the one before it.
  it('gives a designation set across the gutter to both columns (`designationsAcross`)', () => {
    // The columns as 35399 sets them: 90 to 415 and 426 to 751.
    const line = (y: number, left: string, right = left): AnnexItem[] => [wide(90, y, left, 325), wide(426, y, right, 325)]
    const pages = [pageOf([
      wide(240, 740, '§ 14.', 25), wide(576, 740, '§ 14.', 25),
      ...Array.from({ length: 10 }, (_, i) => line(725 - i * 11, 'Die Landesregierung hat die Modellstellen fortlaufend zu')).flat(),
      ...line(600, 'überprüfen.'),
      wide(316, 580, 'Einreihungsplan- und Modellstellen-Verordnung', 209),
      wide(410, 565, '§ 15.', 20),
      ...line(550, '(1) Die Landesregierung hat festzulegen.', '(1) Die Landesregierung hat neu festzulegen.'),
    ])]
    const fifteen = (layout: AnnexLayout) => rows(pages, layout).find((r) => r.gld === '§ 15.')!
    expect(fifteen({ headingsCentred: true, designationsAcross: true })).toMatchObject({
      heading: 'Einreihungsplan- und Modellstellen-Verordnung',
      current: '§ 15. (1) Die Landesregierung hat festzulegen.',
      proposed: '§ 15. (1) Die Landesregierung hat neu festzulegen.',
    })
    expect(rows(pages, { headingsCentred: true, designationsAcross: true }).find((r) => r.gld === '§ 14.')!.change).toBe('unchanged')
    // Without it, the right column's § 15 is the end of its § 14.
    expect(fifteen({ headingsCentred: true }).proposed).toBe('')
    expect(rows(pages).find((r) => r.gld === '§ 14.')!.proposed.endsWith('neu festzulegen.')).toBe(true)
  })
})

describe('a package that heads its laws by their bare names (Salzburg, 26.10.2026)', () => {
  const across = (y: number, text: string): AnnexItem => ({ x: 300, y, width: 260, text })
  const ARTICLES = draft({ n: 'I', title: 'Salzburger Nächtigungsabgabengesetz' }, { n: 'II', title: 'Benützungsgebührengesetz' })
  const PACKAGE = [pageOf([
    across(760, 'Gesetz, mit dem das Salzburger Nächtigungsabgabengesetz und das Benützungsgebührengesetz geändert werden'),
    across(740, 'Salzburger Nächtigungsabgabengesetz'),
    ...page([{ y: 720, left: '§ 11. (1) Die Abgabe ist jährlich zu entrichten.', right: '§ 11. (1) Die Abgabe ist jährlich samt Beitrag zu entrichten.' }]).items,
    across(680, 'Benützungsgebührengesetz'),
    ...page([{ y: 660, left: '§ 11. (1) Die Gebühr wird fällig. Sonst später.', right: '§ 11. (1) Die Gebühr wird fällig.' }]).items,
  ])]
  const read = (layout: AnnexLayout) => parseAnnexPdf([headerPage(), ...PACKAGE], ARTICLES, layout)

  // 30259 prints „Salzburger Nächtigungsabgabengesetz" over its first law, not
  // „Artikel I": read as one law, its two § 11 became one, of two laws.
  it('opens a law at its name, and not at a sentence that names it', () => {
    const parsed = read({ lawsByName: true })
    expect(parsed.refusal).toBeNull()
    expect(parsed.rows.filter((r) => r.kind === 'pair').map((r) => [r.law, r.current])).toEqual([
      ['Salzburger Nächtigungsabgabengesetz', '§ 11. (1) Die Abgabe ist jährlich zu entrichten.'],
      ['Benützungsgebührengesetz', '§ 11. (1) Die Gebühr wird fällig. Sonst später.'],
    ])
    // Without the layout, the package is refused and read as one.
    expect(read({}).refusal).not.toBeNull()
  })

  // 34728 prints each law's name in each column, the Land in front, and its
  // draft amends „Landesumweltanwaltschafts-Gesetz – LUA-G".
  const NAMED = draft({ n: 'I', title: 'Salzburger Campingplatzgesetz' }, { n: 'II', title: 'Landesumweltanwaltschafts-Gesetz – LUA-G' })
  const named = (tail: { y: number; left: string; right: string }[]) => parseAnnexPdf([headerPage(), page([
    { y: 740, left: 'Salzburger Campingplatzgesetz', right: 'Salzburger Campingplatzgesetz' },
    { y: 720, left: '§ 8. (1) Der Betrieb ist anzuzeigen.', right: '§ 8. (1) Der Betrieb ist elektronisch anzuzeigen.' },
    ...tail,
    { y: 680, left: 'Salzburger Landesumweltanwaltschafts-Gesetz', right: 'Salzburger Landesumweltanwaltschafts-Gesetz' },
    { y: 660, left: '§ 8. (1) Der Landesumweltanwaltschaft kommt Parteistellung zu.', right: '§ 8. (1) Der Landesumweltanwaltschaft kommt Parteistellung zu. Neu.' },
  ])], NAMED, { lawsByName: true })

  it('opens a law at its name printed in each column, without the Land in front or the abbreviation after it', () => {
    const parsed = named([])
    expect(parsed.refusal).toBeNull()
    expect(parsed.rows.filter((r) => r.kind === 'pair').map((r) => [r.law, r.proposed])).toEqual([
      ['Salzburger Campingplatzgesetz', '§ 8. (1) Der Betrieb ist elektronisch anzuzeigen.'],
      ['Landesumweltanwaltschafts-Gesetz – LUA-G', '§ 8. (1) Der Landesumweltanwaltschaft kommt Parteistellung zu. Neu.'],
    ])
  })

  // 32075: „Bautechnikgesetz 2015 in Kraft." ended § 29 of the Bebauungsgrundlagengesetz, and opened the Bautechnikgesetz.
  it('does not open a law at a line in each column that only begins with its name', () => {
    const parsed = named([{ y: 700, left: 'Landesumweltanwaltschafts-Gesetz in Kraft.', right: 'Landesumweltanwaltschafts-Gesetz in Kraft.' }])
    expect(parsed.rows.find((r) => r.kind === 'pair' && r.law === 'Salzburger Campingplatzgesetz')!.current).toBe('§ 8. (1) Der Betrieb ist anzuzeigen. Landesumweltanwaltschafts-Gesetz in Kraft.')
  })
})

describe('a page the parse does not read, between two it does (Salzburg 18192, 26.10.2026)', () => {
  const first = page([{ y: 700, left: '§ 5. (1) Die Behörde entscheidet', right: '§ 5. (1) Die Behörde entscheidet' }])
  const skipped = pageOf(page([{ y: 700, left: 'über den Antrag.', right: 'über den Antrag binnen einer Woche.' }]).items, PAGE_WIDTH, { skewed: 3 })
  const third = page([{ y: 700, left: 'Ende eines anderen Paragraphen.', right: 'Ende eines anderen Paragraphen.' }, { y: 680, left: '§ 6. (1) Alt.', right: '§ 6. (1) Neu.' }])
  const read = (layout: AnnexLayout) => parseAnnexPdf([headerPage(), first, skipped, third], ONE_LAW, layout)

  it('cuts the provision that runs on to it and marks it, and joins nothing across it', () => {
    const parsed = read({ cutAtGaps: true })
    expect(parsed.droppedPages).toBe(1)
    const five = parsed.rows.find((r) => r.gld === '§ 5.')!
    expect(five.cut).toBe(true)
    expect(five.current).toBe('§ 5. (1) Die Behörde entscheidet')
    expect(parsed.rows.find((r) => r.gld === '§ 6.')!.cut).toBeUndefined()
    // Read without the layout, § 5 goes on with the text after the gap.
    expect(read({}).rows.find((r) => r.gld === '§ 5.')!.current).toContain('Ende eines anderen Paragraphen')
  })

  it('is cut the same way in a Bund annex (21.11.2026)', () => {
    // The Bund read its annexes without the layout, so a § across an unread
    // page took the text after the gap for its own, unmarked.
    const five = parseAnnexParts([[headerPage(), first, skipped, third]], ONE_LAW)!.rows.find((r) => r.gld === '§ 5.')!
    expect(five.cut).toBe(true)
    expect(five.current).toBe('§ 5. (1) Die Behörde entscheidet')
  })
})

describe('a line-final hyphen', () => {
  /**
   * The evidence that a hyphen is the typesetter's is that the line *carrying*
   * it ran to the edge of its column — not that the line after it did, which
   * is what `joinLines` used to ask. With fewer than ten lines a column's
   * outer limit stands (`columnEdge`), so the left column's edge here is the
   * gutter at 421 and a run reaching 416 counts as wrapped.
   */
  const both = (y: number, text: string, advance: number): AnnexItem[] => [
    wide(LEFT_X, y, text, advance),
    wide(RIGHT_X, y, text, advance),
  ]
  const REACHES = 356
  const SHORT = 120

  it('is dissolved when its own line ran to the column edge', () => {
    const rows = parse([pageOf([
      ...both(700, '§ 5. (1) Die Aufsicht führt der Nachrichten-', REACHES),
      // The continuation line is short, which is what the old rule read.
      ...both(680, 'dienst.', SHORT),
    ])])
    expect(rows.find((r) => r.gld === '§ 5.')!.current).toBe('§ 5. (1) Die Aufsicht führt der Nachrichtendienst.')
  })

  it('stays where the drafter put it, whatever the next line does', () => {
    const rows = parse([pageOf([
      ...both(700, '§ 6. (1) Das Staatsschutz-', SHORT),
      // …and this one does reach the edge, which used to weld the two words.
      ...both(680, 'und Nachrichtendienst-Gesetz ist anzuwenden,', REACHES),
      ...both(660, 'soweit nichts anderes bestimmt ist.', SHORT),
    ])])
    expect(rows.find((r) => r.gld === '§ 6.')!.current)
      .toBe('§ 6. (1) Das Staatsschutz- und Nachrichtendienst-Gesetz ist anzuwenden, soweit nichts anderes bestimmt ist.')
  })

  // Salzburg breaks words at lines that end short of the edge („Höchs-
  // tausmaß", 18186), and a drafter's hyphen at the edge went with the word
  // („Kinderund Jugendhilfe", 34413): there the word after decides.
  it('is told by the word after it where the layout says so (`hyphensByWord`)', () => {
    const read = (layout: AnnexLayout) => parseAnnexPdf([headerPage(), pageOf([
      ...both(700, '§ 7. (1) Bis zum Höchs-', SHORT),
      ...both(680, 'tausmaß der Kinder-', REACHES),
      ...both(660, 'und Jugendhilfe gilt das Landes-', REACHES),
      ...both(640, 'Beamtengesetz für (Mit-', REACHES),
      ...both(620, ')Eigentümer.', SHORT),
    ])], ONE_LAW, layout).rows.find((r) => r.gld === '§ 7.')!.current
    expect(read({ hyphensByWord: true })).toBe('§ 7. (1) Bis zum Höchstausmaß der Kinder- und Jugendhilfe gilt das Landes-Beamtengesetz für (Mit-)Eigentümer.')
    // Without it only a hyphen at the edge goes — and the word after still says whether it is the drafter's.
    expect(read({})).toBe('§ 7. (1) Bis zum Höchs- tausmaß der Kinder- und Jugendhilfe gilt das Landes-Beamtengesetz für (Mit-)Eigentümer.')
  })
})

describe('a superscript (Salzburg 25409, 26.10.2026)', () => {
  // „m²": the „2" set in type of 6,48 and raised 3,48 pt over a line of
  // 9,96 — a baseline of its own, read as a line between its line and the
  // one above: „über- 2 deckte Fläche … 35 m betragen.".
  const SIZE = 9.96
  const typed = (x: number, y: number, text: string, width: number, size: number | undefined): AnnexItem => ({ x, y, width, text, ...(size ? { size } : {}) })
  const read = (sized: boolean) => {
    const items = [LEFT_X, RIGHT_X].flatMap((x) => [
      typed(x, 700, '§ 7b. (1) Die von Zelten über-', 356, sized ? SIZE : undefined),
      typed(x, 689, 'deckte Fläche darf nicht mehr als 35 m', 180, sized ? SIZE : undefined),
      typed(x + 180, 692.48, '2 ', 5.8, sized ? 6.48 : undefined),
      typed(x + 185.8, 689, 'betragen.', 37, sized ? SIZE : undefined),
    ])
    // Salzburg's layout, where the word after a hyphen decides (`hyphensByWord`).
    return parseAnnexPdf([headerPage(), pageOf(items)], ONE_LAW, { hyphensByWord: true }).rows.find((r) => r.gld === '§ 7b.')!.current
  }

  it('is read on the line it is raised over, as a word of its own — as RIS reads `<sup>`', () => {
    expect(read(true)).toBe('§ 7b. (1) Die von Zelten überdeckte Fläche darf nicht mehr als 35 m 2 betragen.')
    // Without the type sizes, it stands where its baseline puts it.
    expect(read(false)).toBe('§ 7b. (1) Die von Zelten über- 2 deckte Fläche darf nicht mehr als 35 m betragen.')
  })
})

describe('an entry of the annex’s own table of contents', () => {
  // Five one-sided rows of the corpus were entries of a reprinted
  // Inhaltsverzeichnis for §§ the annex never prints — announced as new law.
  // Four of them have been in force for years with exactly the heading the
  // annex prints (§ 79a Mindestbesteuerungsgesetz, § 13a GAP-Strategieplan-
  // Anwendungsverordnung, § 11 Energie-Control-Gesetz, § 77d BWG), and two of
  // those drafts say in so many words that they amend the *table of contents*
  // (2026-09-10). A provision has a body; a contents entry has none.
  it('is not shown as an inserted provision, and is counted', () => {
    const parsed = parseAnnexPdf([headerPage(), page([
      { y: 700, left: '§ 12. (1) Bestehend.', right: '§ 12. (1) Bestehend.' },
      { y: 680, right: '§ 13a. Verbot der Umgehung rechtlicher Vorschriften' },
      // The mirror image has no case in the corpus and would read as a
      // repeal: "the draft deletes § 11a", over a line that is a contents
      // entry. Both sides are dropped, as with the front matter.
      { y: 660, left: '§ 11a. Arbeitsweise der Regulierungskommission' },
      { y: 640, left: '§ 14. (1) Weiter.', right: '§ 14. (1) Weiter.' },
    ])], ONE_LAW)
    expect(parsed.rows.map((r) => r.gld)).toEqual(['§ 12.', '§ 14.'])
    expect(parsed.unplaced).toBe(2)
    // The two are different things and are counted apart (26.09.2026): both
    // of these are contents entries, and no front matter stands here — which
    // is the point of the split, since the corpus is 236 blocks of front
    // matter against 4 contents entries in 105 PDF annexes.
    expect(parsed.unplacedKinds).toEqual({ frontMatter: 0, contents: 2 })
  })

  // Under its heading the whole table is left out, as the table path drops
  // RIS's <inhaltsvz>: its entries were §§ of their own wherever the annex
  // prints no body for them, and „Anweisung nicht gefunden" for a change no
  // instruction makes (30/ME XXVIII and nine more, 26.10.2026). The division
  // no entry follows heads the first provision, whatever its margins
  // (Salzburg 26924), and so does the heading printed over the contents —
  // the law's name, in a package (also 26924).
  it('is left out under its heading, with the headings of the first provision kept', () => {
    const law = (y: number): AnnexItem => ({ x: 300, y, width: 260, text: 'Salzburger Landeselektrizitätsgesetz 1999' })
    const parsed = parseAnnexPdf([headerPage(), pageOf([
      law(730),
      run(LEFT_X + 100, 716, 'Inhaltsverzeichnis'),
      run(RIGHT_X + 100, 716, 'Inhaltsverzeichnis'),
      ...page([
        { y: 702, left: '§ 1. Geltungsbereich', right: '§ 1. Geltungsbereich' },
        { y: 688, left: '§ 2. Begriffsbestimmungen', right: '§ 2. Begriffe' },
        { y: 674, left: '1. Abschnitt', right: '1. Abschnitt' },
        { y: 660, left: 'Allgemeines', right: 'Allgemeines' },
        { y: 646, left: '§ 1. (1) Dieses Gesetz gilt für alle.', right: '§ 1. (1) Dieses Gesetz gilt für jeden.' },
      ]).items,
    ])], ONE_LAW)
    expect(parsed.rows.map((r) => r.gld)).toEqual(['§ 1.'])
    expect(parsed.rows[0]!.current).toBe('1. Abschnitt Allgemeines § 1. (1) Dieses Gesetz gilt für alle.')
    expect(parsed.rows[0]!.heading).toBe('Salzburger Landeselektrizitätsgesetz 1999')
    // Each column's entries.
    expect(parsed.unplacedKinds).toEqual({ frontMatter: 0, contents: 4 })
  })

  // Two shapes stay: an elision is the annex saying it left the text out, and
  // a designation with nothing after it says something of its own — a § the
  // draft repeals, with an empty proposed column.
  it('is not the ressort’s elision, and not a bare designation', () => {
    const rows = parse([page([
      { y: 700, left: '§ 12. (1) Bestehend.', right: '§ 12. (1) Bestehend.' },
      { y: 680, right: '§ 13a. Kontrollregister …' },
      { y: 660, left: '§ 15.', right: '' },
    ])])
    expect(rows.map((r) => r.gld)).toEqual(['§ 12.', '§ 13a.', '§ 15.'])
  })
})

describe('uprightRuns', () => {
  /** pdf.js's viewport for an unrotated A4 portrait page: the y flip, nothing else. */
  const A4 = { transform: [1, 0, 0, -1, 0, 841.92], width: 595.32, height: 841.92 }
  const run = (transform: number[], width: number, text: string): RawRun => ({ transform, width, text })

  it('leaves an upright page where it was, in PDF user space', () => {
    // 113 of the 114 GP-XXVIII annexes are this case, and it has to come
    // through bit for bit: x is the run's own x, y grows upward.
    const upright = uprightRuns([run([10, 0, 0, 10, 60, 700], 76, 'Geltende Fassung')], A4)
    expect(upright.width).toBeCloseTo(595.32, 2)
    expect(upright.items[0]).toMatchObject({ x: 60, y: 700, width: 76, text: 'Geltende Fassung', size: 10 })
  })

  // The UWG annex sets `/Rotate 0` and turns the *text matrix* instead: every
  // run reads [0, 9.96, -9.96, 0, x, y], so the baseline runs along the y axis
  // and the two columns arrive stacked — "Geltende Fassung" at (121, 215) and
  // "Vorgeschlagene Fassung" at (121, 537) are one line, not two columns.
  it('turns a page whose text matrix is a quarter turn back upright', () => {
    const turned = uprightRuns([
      run([0, 10, -10, 0, 121, 215], 76, 'Geltende Fassung'),
      run([0, 10, -10, 0, 121, 537], 104, 'Vorgeschlagene Fassung'),
      run([0, 10, -10, 0, 156, 89], 63, 'Bundesgesetz'),
    ], A4)
    // The long side of the page becomes its width.
    expect(turned.width).toBeCloseTo(841.92, 2)
    const [current, proposed, below] = turned.items
    // The two headings share a baseline, and the current column is left of the
    // proposed one.
    expect(current!.y).toBeCloseTo(proposed!.y, 2)
    expect(current!.x).toBeLessThan(proposed!.x)
    expect(current!.x).toBeCloseTo(215, 2)
    expect(proposed!.x).toBeCloseTo(537, 2)
    // A later line sits lower on the page, which is what `linesFromPage` sorts
    // on — and the advance along the baseline is unchanged by a quarter turn.
    expect(below!.y).toBeLessThan(current!.y)
    expect(below!.width).toBe(63)
    // …and so is the type size, which tells a superscript from its line.
    expect(below!.size).toBe(10)
  })

  it('finds the two columns of a turned page where the parse expects them', () => {
    const turned = uprightRuns([
      run([0, 10, -10, 0, 121, 215], 76, 'Geltende Fassung'),
      run([0, 10, -10, 0, 121, 537], 104, 'Vorgeschlagene Fassung'),
      run([0, 10, -10, 0, 156, 215], 60, '§ 5. Alt.'),
      run([0, 10, -10, 0, 156, 537], 60, '§ 5. Neu.'),
    ], A4)
    const lines = linesFromPage(turned, columnBoundary([turned]))
    expect(lines[0]).toMatchObject({ left: 'Geltende Fassung', right: 'Vorgeschlagene Fassung' })
    expect(lines[1]).toMatchObject({ left: '§ 5. Alt.', right: '§ 5. Neu.' })
  })

  it('takes the majority turn when a page carries a stray run of its own', () => {
    // A page number set upright on an otherwise turned page must not decide
    // the frame for the body text.
    const turned = uprightRuns([
      run([10, 0, 0, 10, 41, 727], 30, '1 von 9'),
      run([0, 10, -10, 0, 121, 215], 76, 'Geltende Fassung'),
      run([0, 10, -10, 0, 121, 537], 104, 'Vorgeschlagene Fassung'),
    ], A4)
    expect(turned.width).toBeCloseTo(841.92, 2)
    expect(turned.items[1]!.y).toBeCloseTo(turned.items[2]!.y, 2)
  })
})

describe('a letter-spaced word (RIS 707EA278, 26.10.2026)', () => {
  // pdf.js's operator list: `showText` with the glyphs of one text operation,
  // a number between two of them where the document widens the gap.
  const SHOW_TEXT = 44
  const operation = (text: string) => [[...text].flatMap((c, i) => [...(i > 0 ? [-134] : []), { unicode: c, isSpace: c === ' ' }])]
  const page = (...operations: string[]) => spellingOf(operations.map(() => SHOW_TEXT), operations.map(operation), SHOW_TEXT)

  it('is read as the words it spells, where the document set its spaces', () => {
    expect(spelledOut('B e g r i f f s b e s t i m m u n g e n', page('§ 1.01', 'Begriffsbestimmungen'))).toBe('Begriffsbestimmungen')
    // Every gap reads as a space to pdf.js, the one between two words too.
    expect(spelledOut('M i t f ü h r e n d e r V e r o r d n u n g', page('Mitführen der Verordnung'))).toBe('Mitführen der Verordnung')
  })

  it('keeps a quotation mark at its word where the text operation changes', () => {
    expect(spelledOut('1. „V e r b a n d “: ein Schleppverband', page('1. „', 'Verband', '“: ein Schleppverband'))).toBe('1. „Verband“: ein Schleppverband')
  })

  it('leaves single letters the document sets apart, and a run its glyphs do not spell', () => {
    expect(spelledOut('lit. a b c und d', page('gemäß lit. a b c und d'))).toBe('lit. a b c und d')
    expect(spelledOut('V e r b o t', page('Gebot'))).toBe('V e r b o t')
  })

  // The operations as the RIS PDFs set them (captured 14.11.2026): the dash
  // and the Fugen-s stand in operations of their own, with no space glyph.
  it('joins a dash or a letter in an operation of its own, inside a letter-spaced word', () => {
    expect(spelledOut('B l e i b - w e g - S i g n a l', page('Bleib', '-', 'weg', '-', 'Signal'))).toBe('Bleib-weg-Signal')
    expect(spelledOut('19. „ B o d e n s e e – S c h i f f f a h r t s – O r d n u n g “ :', page('19. ', '„', 'Bodensee', '–', 'Schifffahrt', 's', '–', 'Ordnung', '“', ':')))
      .toBe('19. „Bodensee–Schifffahrts–Ordnung“:')
    // The Ergänzungsstrich keeps the space the document set after it.
    expect(spelledOut('7. „ W a t t - o d e r T a g e s f a h r t “ :', page('7. ', '„', 'Watt', '- ', 'oder Tagesfahrt', '“', ':'))).toBe('7. „Watt- oder Tagesfahrt“:')
  })

  it('keeps the spaces of single characters no operation shows to be letter-spaced', () => {
    // A Word document sets „Abs 2 Z 2" token by token, no space glyph between.
    expect(spelledOut('Abs 2 Z 2', page('Abs', '2', 'Z', '2'))).toBe('Abs 2 Z 2')
  })

  // Kärnten types a heading with a space after each letter (ktn-1003-2021-21,
  // ktn-1037-2021-73): one space between the letters, two around the word.
  it('reads a word typed with a space after each letter', () => {
    expect(spelledOut('5. A b s c h n i t t', page('5.  A b s c h n i t t'))).toBe('5. Abschnitt')
    expect(spelledOut('6.1 E r n e n n u n g s e r f o r d e r n i s s e :', page('6.1 E r n e n n u n g s e r f o r d e r n i s s e :  ')))
      .toBe('6.1 Ernennungserfordernisse:')
    // Single spaces all along: the word cannot be told from its neighbours.
    expect(spelledOut('von v i e r Wochen', page('von v i e r Wochen'))).toBe('von v i e r Wochen')
    expect(spelledOut('lit. a b c d', page('lit. a b c d'))).toBe('lit. a b c d')
  })
})

describe('sameTypesetting — when several PDFs are one annex (26.09.2026)', () => {
  // 2 of the 240 records with a Gegenüberstellung publish it in parts. Joined
  // pages are measured as ONE document, so the question is not „is this the
  // same draft" but „is this the same paper".
  it('joins parts set on the same paper', () => {
    expect(sameTypesetting([pageOf([], 842)], [pageOf([], 842)])).toBe(true)
    // The Weinrecht-Sammelverordnung: „(Artikel1)" and „(Artikel 2)", both
    // landscape. Joined, its refusal („Die Beilage überspringt ein Gesetz des
    // Entwurfs") disappears — it was our reading, not the document.
    expect(sameTypesetting([pageOf([], 841.92)], [pageOf([], 842)])).toBe(true)
  })

  it('keeps a part set on other paper apart', () => {
    // The Methodenverordnung Wasser: 7 landscape pages of comparison against
    // 72 portrait pages of schedules. Joined, the 72 take the majority and
    // the 7 that carry the comparison are dropped as strangers — the opposite
    // of the repair.
    expect(sameTypesetting([pageOf([], 842)], [pageOf([], 595)])).toBe(false)
  })

  it('reads the width most pages share, not the first page', () => {
    // A title page in another format must not decide what the document is.
    const doc = [pageOf([], 595), pageOf([], 842), pageOf([], 842), pageOf([], 842)]
    expect(sameTypesetting(doc, [pageOf([], 842)])).toBe(true)
  })
})

describe('parseAnnexParts — the parts of one annex (19.11.2026)', () => {
  const part = () => [headerPage(), page([{ y: 700, left: '§ 1. (1) Die Behörde entscheidet.', right: '§ 1. (1) Das Gericht entscheidet.' }])]

  it('reads the parts that can be read as one annex', () => {
    expect(parseAnnexParts([part()], ONE_LAW)!.rows).toHaveLength(1)
  })

  // A damaged part comes out of pdf.js as an empty document. Skipped, its
  // laws read as absent from the annex — „in der Beilage fanden wir zu ihnen
  // keine Gegenüberstellung", or the package refused for skipping a law.
  it('refuses the whole annex where one part could not be read, and says why', () => {
    for (const unread of [null, [pageOf([])]]) {
      const parse = parseAnnexParts([part(), unread], ONE_LAW)!
      expect(parse.rows).toEqual([])
      expect(parse.unreadable).toMatch(/^Nicht lesbar: Eines der 2 Dokumente der Textgegenüberstellung ließ sich nicht auslesen\./)
    }
  })

  it('answers null where no part could be read at all, as before', () => {
    expect(parseAnnexParts([null, [pageOf([])]], ONE_LAW)).toBeNull()
  })

  // The Methodenverordnung Wasser (RIS 08E3BE3E): its „Textgegenüberstellung
  // (Anlagen)", 72 portrait pages without the header pair, yielded no row and
  // left no trace — the page showed seven §§ and not a word about the
  // schedules.
  it('counts the pages of a part set otherwise that yields no row as unread', () => {
    const portrait = (y: number, text: string) => pageOf([run(LEFT_X, y, text)], 595)
    const schedules = [portrait(700, 'Anlage A Methodenvorschriften für Emissionsmessungen'), portrait(700, 'Abschnitt I Abwassermengenmessung'), pageOf([], 595)]
    const parse = parseAnnexParts([part(), schedules], ONE_LAW)!
    expect(parse.rows).toHaveLength(1)
    expect(parse.droppedPages).toBe(2)
  })
})

describe('front matter that differs between the columns (19.11.2026, audit A3)', () => {
  const body = { y: 600, left: '§ 1. (1) Die Behörde entscheidet.', right: '§ 1. (1) Das Gericht entscheidet.' }
  const front = (lines: { y: number; left?: string; right?: string }[], articles: DraftArticle[] = ONE_LAW) =>
    parseAnnexPdf([headerPage(), page([...lines, body])], articles).frontMatterDiffers

  // The Versorgungssicherungsgesetz (RIS 9E5072AC): its Art. I opens no unit,
  // and „31. Dezember 2026" → „2036" was in no row and on no page.
  it('names the law whose text before the first § differs', () => {
    expect(front([
      { y: 700, left: 'Artikel I (Verfassungsbestimmung)', right: 'Artikel I (Verfassungsbestimmung)' },
      { y: 686, left: '(1) … sind bis zum Ablauf des 31. Dezember 2026 Bundessache.', right: '(1) … sind bis zum Ablauf des 31. Dezember 2036 Bundessache.' },
    ])).toEqual(['Änderung des Sicherheitspolizeigesetzes'])
  })

  it('names nothing where the two columns say the same there', () => {
    expect(front([{ y: 700, left: 'Verordnung des Bundesministers für Inneres', right: 'Verordnung des Bundesministers für Inneres' }])).toEqual([])
  })

  it('does not count a line set otherwise, a hyphen, the word „Entwurf" or a page counter as a difference', () => {
    expect(front([
      { y: 720, left: 'ENTWURF - Stand: 29.11.2024', right: '1 von 7' },
    ])).toEqual([])
    expect(front([
      { y: 720, right: 'E n t w u r f' },
      { y: 700, left: 'Bundesgesetz über den Rundfunk (ORF-Gesetz,', right: 'Bundesgesetz über den Rundfunk (ORF-Gesetz -' },
      { y: 686, left: 'DAC-Verordnung „Kamptal"', right: 'DAC- Verordnung „Kamptal"' },
    ])).toEqual([])
  })

  it('names the law of the section, in a package divided into laws', () => {
    const articles = draft({ n: '1', title: 'Änderung des Aktiengesetzes' }, { n: '2', title: 'Änderung des GmbH-Gesetzes' })
    const parsed = parseAnnexPdf([headerPage(), pageOf([
      { x: 300, y: 760, width: 260, text: 'Artikel 1' },
      ...page([{ y: 740, left: '§ 1. Alt.', right: '§ 1. Neu.' }]).items,
      { x: 300, y: 700, width: 260, text: 'Artikel 2' },
      ...page([
        { y: 680, left: '(1) Dieser Artikel tritt mit 1. Jänner 2017 in Kraft.', right: '(1) Dieser Artikel tritt mit 1. Jänner 2027 in Kraft.' },
        { y: 660, left: '§ 2. Alt.', right: '§ 2. Neu.' },
      ]).items,
    ])], articles)
    expect(parsed.frontMatterDiffers).toEqual(['Änderung des GmbH-Gesetzes'])
  })
})

describe('a text layer read in the wrong code page', () => {
  // 119/ME XXVIII: Windows-1252 read as Mac Roman — „§" came out as „ß", so no
  // § mark was ever found and the annex yielded no row (06.10.2026).
  const pageOf = (...texts: string[]): AnnexPage => ({ items: texts.map((text) => ({ text })) }) as unknown as AnnexPage

  it('turns a misread run back, „ﬂ" to „ß" and „ß 13" to „§ 13"', () => {
    expect(fromMacRoman('ß 13. Auﬂenabfl¸ge gem‰ﬂ Abs. 2 unber¸hrt ˆffentlichen')).toBe('§ 13. Außenabflüge gemäß Abs. 2 unberührt öffentlichen')
  })

  it('leaves a correctly set run alone, even in a misread document', () => {
    expect(fromMacRoman('(„Interoperabilitäts-Verordnung")')).toBe('(„Interoperabilitäts-Verordnung")')
    expect(fromMacRoman('Pflicht und Fläche')).toBe('Pflicht und Fläche')
    expect(fromMacRoman('Maß … Ende')).toBe('Maß … Ende')
  })

  it('decides by the whole document, and tolerates one correct font among many misread runs', () => {
    const misread = Array.from({ length: 25 }, () => 'f¸r die Fl‰chen')
    expect(isMacRomanMisread([pageOf(...misread, 'Interoperabilitäts')])).toBe(true)
    expect(isMacRomanMisread([pageOf('§ 5. Die Behörde prüft', 'f¸r')])).toBe(false)
    expect(isMacRomanMisread([pageOf('Ein Text mit 5 ‰ Promille')])).toBe(false)
  })
})
