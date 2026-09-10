import { describe, expect, it } from 'vitest'
import { columnBoundary, linesFromPage, parseAnnexPdf, type AnnexItem, type AnnexPage, type PageGeometry } from '../server/utils/annexPdf'
import { uprightRuns, type RawRun } from '../server/utils/annexPdfPages'
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
    ...page([
      { y: 480, left: 'in besonderen Fällen', right: 'in besonderen Fällen' },
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
    expect(upright.items[0]).toMatchObject({ x: 60, y: 700, width: 76, text: 'Geltende Fassung' })
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
