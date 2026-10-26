import { describe, expect, it } from 'vitest'
import type { AnnexItem, AnnexPage } from '../server/utils/annex/annexPdf'
import { gutterOf, ktnLines, ktnTguParagraphs, rangeNumbers, readInstruction } from '../server/utils/laender/landTguKaernten'

/**
 * Kärnten's layout, as measured (23.10.2026): the left column from 85 to 417,
 * the right one from 427 to 757, Absätze indented by 20, § lines and headings
 * centred. Each helper is one visual line.
 */
const L = { margin: 85, edge: 417 }
const R = { margin: 427, edge: 757 }
type Col = typeof L
const body = (c: Col, text: string, y: number): AnnexItem => ({ x: c.margin, y, width: c.edge - c.margin, text })
const absatz = (c: Col, text: string, y: number): AnnexItem => ({ x: c.margin + 20, y, width: c.edge - c.margin - 20, text })
const centre = (c: Col, text: string, y: number): AnnexItem => {
  const w = text.length * 5
  return { x: (c.margin + c.edge) / 2 - w / 2, y, width: w, text }
}
const page = (items: AnnexItem[]): AnnexPage => ({ width: 842, items, geometry: { runs: items.length, offTurn: 0, skewed: 0 } })

/** A left column printing the law with §§ 5 to 7, y from the top down. */
function leftLaw(y0 = 500): AnnexItem[] {
  let y = y0
  const next = () => (y -= 12)
  return [
    body(L, 'Kärntner Beispielgesetz - K-BspG', next()),
    body(L, 'StF: LGBl Nr 1/2000', next()),
    centre(L, '§ 5', next()),
    centre(L, 'Begriffe', next()),
    absatz(L, '(1) Begriffe sind in diesem Gesetz so zu verstehen, wie', next()),
    body(L, 'sie hier stehen, und nicht anders als hier.', next()),
    absatz(L, '(2) Der zweite Absatz des fünften Paragraphen bleibt.', next()),
    centre(L, '§ 6', next()),
    centre(L, 'Pflichten', next()),
    absatz(L, '(1) Jede Person hat die Pflichten nach diesem Gesetz zu', next()),
    body(L, 'erfüllen, soweit sie ihr obliegen.', next()),
    absatz(L, '(2) Die alte Fassung des zweiten Absatzes steht hier.', next()),
    absatz(L, '(3) Der dritte Absatz bleibt, wie er ist, unverändert.', next()),
    centre(L, '§ 7', next()),
    centre(L, 'Strafen', next()),
    body(L, 'Wer gegen dieses Gesetz verstößt, begeht eine Übertretung.', next()),
  ]
}

describe('gutterOf', () => {
  it('finds the gap between the columns wherever it lies', () => {
    const g = gutterOf([page([body(L, 'links', 100), body(R, 'rechts', 100), { x: 85, y: 90, width: 300, text: 'schmal' }, { x: 395, y: 90, width: 300, text: 'breit' }])])
    expect(g).toBeGreaterThan(385)
    expect(g).toBeLessThan(395)
  })
})

describe('ktnLines', () => {
  it('reads each column on its own baselines and drops the running head', () => {
    const lines = ktnLines([page([{ x: 705, y: 554, width: 52, text: 'Seite2von4' }, body(L, 'links oben', 500), body(R, 'rechts', 497), body(L, 'links unten', 488)])])
    expect(lines.map((l) => `${l.side[0]} ${l.text}`)).toEqual(['l links oben', 'r rechts', 'l links unten'])
  })
})

describe('readInstruction', () => {
  const read = (head: string) => readInstruction({ number: 1, head, payload: [], swallowed: [] })
  it('knows the whole-§ and whole-Absatz kinds', () => {
    expect(read('§ 16 lautet:').op?.kind).toBe('paragraphs')
    expect(read('Nach § 74 wird folgender § 74a eingefügt:').op).toMatchObject({ kind: 'paragraphs', replaces: false, numbers: ['74a'] })
    expect(read('Nach § 4a werden folgende §§ 4b und 4c eingefügt:').op).toMatchObject({ numbers: ['4b', '4c'] })
    expect(read('§ 53 entfällt.').op).toMatchObject({ kind: 'delete', numbers: ['53'] })
    expect(read('§ 19 Abs. 2 bis 4 lauten:').op).toMatchObject({ kind: 'absReplace', para: '19', labels: ['2', '4'], range: true })
    expect(read('Nach § 11 Abs. 2 wird folgender Abs. 2a eingefügt:').op).toMatchObject({ kind: 'absInsert', after: '2', labels: ['2a'] })
    expect(read('§ 15 wird folgender Abs. 7 angefügt:').op).toMatchObject({ kind: 'absInsert', after: null, labels: ['7'] })
    expect(read('§ 73 Abs. 3 entfällt.').op).toMatchObject({ kind: 'absDelete', labels: ['3'] })
  })

  it('performs nothing finer, and names what it touches outside the quotes', () => {
    const r = read('In § 7 Abs. 2 wird der Verweis „§ 5“ durch den Verweis „§ 6“ ersetzt.')
    expect(r.op).toBeNull()
    expect(r.touches).toEqual(['7'])
    expect(read('§ 6 Abs. 3 zweiter Satz lautet:').op).toBeNull()
    // The anchor of an insertion is not touched; the § sign lost still names the §.
    expect(read('Nach § 74 wird folgender § 74a eingefügt:').touches).toEqual(['74a'])
    expect(read('In 75 Abs. 1a wird das Wort „a“ durch das Wort „b“ ersetzt.').touches).toEqual(['75'])
  })

  it('names no § for an instruction about the table of contents, though it names §§ as its entries (25.10.2026)', () => {
    for (const head of [
      'Im Inhaltsverzeichnis entfällt der Eintrag zu § 93.',
      'Im Inhaltsverzeichnis wird nach dem Eintrag zu § 55a folgender Eintrag eingefügt:',
      'Im Inhaltsverzeichnis werden die bisherigen Einträge zu §§ 51a bis 51c durch folgende Einträge ersetzt:',
      'Im Inhaltsverzeichnis wird nach § 7 folgender § 7a samt Überschrift eingefügt:',
      'Vor dem § 1 wird folgendes Inhaltsverzeichnis eingefügt:',
      'Die Einträge im Inhaltsverzeichnis zum 2. Hauptstück (2. Hauptstück Vorverfahren, §§ 2, 3 und 4) entfallen.',
    ]) expect(read(head)).toMatchObject({ op: null, touches: [], ranges: [], all: false })
    // One that also addresses a § itself still names it.
    expect(read('Im Inhaltsverzeichnis und in § 5 Abs. 2 wird das Wort „a“ durch „b“ ersetzt.').touches).toEqual(['5'])
  })

  it('takes „Abs. 3 bis 5" of an insertion as a range (25.10.2026)', () => {
    expect(read('Dem § 95 werden folgende Abs. 3 bis 5 angefügt:').op).toMatchObject({ kind: 'absInsert', para: '95', after: null, labels: ['3', '5'], range: true })
    expect(read('Nach § 5 Abs. 2 werden folgende Abs. 2a bis 2c eingefügt:').op).toMatchObject({ kind: 'absInsert', after: '2', labels: ['2a', '2c'], range: true })
  })

  it('takes an instruction without a § for the whole law, unless it is about the contents, an Anlage or a division name', () => {
    expect(read('Im ganzen Gesetz wird das Wort „Bezirk“ durch das Wort „Region“ ersetzt.').all).toBe(true)
    expect(read('Im V. Abschnitt wird jeweils der Ausdruck „a“ durch „b“ ersetzt.').all).toBe(true)
    expect(read('Der 1. Abschnitt des Gesetzes („Auskunft“) entfällt.').all).toBe(true)
    expect(read('Das Inhaltsverzeichnis wird wie folgt geändert:').all).toBe(false)
    expect(read('Die bisherige Anlage 17 erhält die Bezeichnung „Anlage 18“.').all).toBe(false)
    expect(read('Abschnitt V erhält folgende Bezeichnung:').all).toBe(false)
    // The division named only inside the quotes (15193/2025, 25.10.2026).
    expect(read('Die Überschrift „3. Teil Tagesbetreuung“ wird durch die Überschrift „3. Teil Tagesbetreuung und Bildung“ ersetzt.')).toMatchObject({ all: false, touches: [] })
    // „jeweils" with a § named stays in it.
    expect(read('In § 9 Abs. 1 und 3 wird jeweils die Verweisung „x“ durch „y“ ersetzt.')).toMatchObject({ all: false, touches: ['9'] })
  })
})

describe('ktnTguParagraphs', () => {
  const laws = ['Kärntner Beispielgesetz']

  it('takes a § the Novelle prints whole as its new text, beside the § in force', () => {
    const right = [
      centre(R, 'Änderung des Kärntner Beispielgesetzes', 497),
      body(R, '1. § 5 lautet:', 450),
      centre(R, '§ 5', 438),
      centre(R, 'Begriffe', 426),
      absatz(R, '(1) Begriffe sind neu zu verstehen.“', 414),
    ]
    const [p, ...rest] = ktnTguParagraphs([page([...leftLaw(), ...right])], laws)
    expect(rest).toEqual([])
    expect(p).toEqual({
      law: 'Kärntner Beispielgesetz',
      number: '5',
      old: ['Begriffe', '(1) Begriffe sind in diesem Gesetz so zu verstehen, wie', 'sie hier stehen, und nicht anders als hier.', '(2) Der zweite Absatz des fünften Paragraphen bleibt.'],
      neu: ['Begriffe', '(1) Begriffe sind neu zu verstehen.'],
      changed: true,
    })
  })

  it('exchanges a whole Absatz on the § in force, and inserts and deletes whole §§', () => {
    const right = [
      body(R, '1. Nach § 5 wird folgender § 5a eingefügt:', 470),
      centre(R, '§ 5a', 458),
      centre(R, 'Ausnahmen', 446),
      body(R, 'Ausnahmen gibt es keine.', 434),
      body(R, '2. § 6 Abs. 2 lautet:', 400),
      absatz(R, '(2) Die neue Fassung des zweiten Absatzes.', 388),
      body(R, '3. § 7 entfällt.', 300),
    ]
    const out = ktnTguParagraphs([page([...leftLaw(), ...right])], laws)
    expect(out.map((p) => [p.number, p.old.length > 0, p.neu.length > 0])).toEqual([['5a', false, true], ['7', true, false], ['6', true, true]])
    expect(out.find((p) => p.number === '6')!.neu).toEqual([
      'Pflichten',
      '(1) Jede Person hat die Pflichten nach diesem Gesetz zu',
      'erfüllen, soweit sie ihr obliegen.',
      '(2) Die neue Fassung des zweiten Absatzes.',
      '(3) Der dritte Absatz bleibt, wie er ist, unverändert.',
    ])
  })

  /* What is not shown is handed on as `unread` — never dropped silently: the page names it (24.10.2026). */
  const shownOf = (ps: ReturnType<typeof ktnTguParagraphs>) => ps.filter((p) => !p.unread).map((p) => p.number)
  const unreadOf = (ps: ReturnType<typeof ktnTguParagraphs>) => ps.filter((p) => p.unread).map((p) => p.number).sort()

  it('leaves out a § any finer instruction also touches, and names it', () => {
    const right = [
      body(R, '1. § 6 Abs. 2 lautet:', 450),
      absatz(R, '(2) Die neue Fassung des zweiten Absatzes.', 438),
      body(R, '2. In § 6 Abs. 3 wird das Wort „bleibt“ durch das Wort „geht“ ersetzt.', 400),
    ]
    const ps = ktnTguParagraphs([page([...leftLaw(), ...right])], laws)
    expect(shownOf(ps)).toEqual([])
    expect(unreadOf(ps)).toEqual(['6'])
  })

  it('appends a range of whole Absätze, and leaves a § the contents name alone (25.10.2026)', () => {
    const right = [
      body(R, '1. Im Inhaltsverzeichnis wird nach dem Eintrag zu § 6 folgender Eintrag eingefügt:', 470),
      body(R, '„§ 6a Ausnahmen“', 458),
      body(R, '2. § 6 werden folgende Abs. 4 bis 5 angefügt:', 440),
      absatz(R, '„(4) Der vierte Absatz kommt neu hinzu.', 428),
      absatz(R, '(5) Der fünfte auch.“', 416),
    ]
    const ps = ktnTguParagraphs([page([...leftLaw(), ...right])], laws)
    expect(unreadOf(ps)).toEqual([])
    expect(ps.find((p) => p.number === '6')!.neu.slice(-2)).toEqual(['(4) Der vierte Absatz kommt neu hinzu.', '(5) Der fünfte auch.'])
  })

  it('leaves out a § whose Absatz the left column does not print, and names it', () => {
    const right = [body(R, '1. § 7 Abs. 2 lautet:', 450), absatz(R, '(2) Gibt es nicht.', 438)]
    const ps = ktnTguParagraphs([page([...leftLaw(), ...right])], laws)
    expect(shownOf(ps)).toEqual([])
    expect(unreadOf(ps)).toEqual(['7'])
  })

  it('leaves out the whole law where the numbering skips an instruction, or one reaches every §, naming what it names', () => {
    const gap = [body(R, '1. § 7 entfällt.', 450), body(R, '3. § 5 entfällt.', 400)]
    expect(shownOf(ktnTguParagraphs([page([...leftLaw(), ...gap])], laws))).toEqual([])
    expect(unreadOf(ktnTguParagraphs([page([...leftLaw(), ...gap])], laws))).toEqual(['5', '7'])
    const everywhere = [body(R, '1. § 7 entfällt.', 450), body(R, '2. Im ganzen Gesetz wird das Wort „Person“ durch „Mensch“ ersetzt.', 400)]
    expect(shownOf(ktnTguParagraphs([page([...leftLaw(), ...everywhere])], laws))).toEqual([])
  })

  it('says „wording" only of a § an instruction below a whole Absatz touches (25.10.2026)', () => {
    const because = (right: AnnexItem[]) => ktnTguParagraphs([page([...leftLaw(), ...right])], laws).filter((p) => p.unread).map((p) => [p.number, p.because ?? null])
    // A word changed: „einzelne Wörter, Sätze oder Ziffern" is true.
    expect(because([body(R, '1. In § 6 Abs. 3 wird das Wort „bleibt“ durch das Wort „geht“ ersetzt.', 450)])).toEqual([['6', 'wording']])
    // A whole Absatz the left column does not print: not a word changed.
    expect(because([body(R, '1. § 7 Abs. 2 lautet:', 450), absatz(R, '(2) Gibt es nicht.', 438)])).toEqual([['7', null]])
    // The numbering skips an instruction: whatever it changes, nobody read it.
    expect(because([body(R, '1. In § 5 Abs. 1 wird das Wort „wie“ durch „als“ ersetzt.', 450), body(R, '3. § 7 entfällt.', 400)])).toEqual([['5', null], ['7', null]])
  })

  it('names every § a range creates, not only those the left column prints (25.10.2026)', () => {
    expect(rangeNumbers(['51a', '51d'])).toEqual(['51a', '51b', '51c', '51d'])
    expect(rangeNumbers(['5', '7'])).toEqual(['5', '6', '7'])
    expect(rangeNumbers(['5', '7a'])).toEqual([])
    const right = [body(R, '1. Nach § 7 wird folgender 3. Abschnitt mit den §§ 7a bis 7c eingefügt:', 450), centre(R, '3. Abschnitt', 438)]
    expect(unreadOf(ktnTguParagraphs([page([...leftLaw(), ...right])], laws))).toEqual(['7', '7a', '7b', '7c'])
  })

  it('withholds the §§ a swallowed repeat of an instruction names', () => {
    // Kärnten prints „1. Im § 6 … sowie im § 5 …" beside both places: the repeat
    // lands in the next instruction's payload, which is then not its own.
    const right = [
      body(R, '1. Im § 6 Abs. 3 sowie im § 5 Abs. 1 entfällt das Wort „hier“.', 470),
      body(R, '2. § 6 Abs. 2 lautet:', 450),
      absatz(R, '(2) Die neue Fassung des zweiten Absatzes.', 438),
      body(R, '1. Im § 6 Abs. 3 sowie im § 5 Abs. 1 entfällt das Wort „hier“.', 426),
      body(R, '3. § 7 entfällt.', 300),
    ]
    expect(ktnTguParagraphs([page([...leftLaw(), ...right])], laws).filter((p) => !p.unread).map((p) => p.number)).toEqual(['7'])
  })

  it('files each Artikel under the law its heading names', () => {
    const second = [
      body(L, 'Kärntner Zweitgesetz - K-ZG', 290),
      body(L, 'StF: LGBl Nr 2/2001', 278),
      centre(L, '§ 5', 266),
      centre(L, 'Zweck', 254),
      body(L, 'Der Zweck des zweiten Gesetzes ist ein anderer als der des ersten.', 242),
    ]
    const right = [
      centre(R, 'Artikel I', 497),
      centre(R, 'Änderung des Kärntner Beispielgesetzes', 485),
      body(R, '1. § 7 entfällt.', 450),
      centre(R, 'Artikel II', 300),
      centre(R, 'Änderung des Kärntner Zweitgesetzes', 288),
      body(R, '1. § 5 entfällt.', 266),
    ]
    const out = ktnTguParagraphs([page([...leftLaw(), ...second, ...right])], ['Kärntner Beispielgesetz', 'Kärntner Zweitgesetz'])
    expect(out.map((p) => [p.law, p.number, p.old[0]])).toEqual([
      ['Kärntner Beispielgesetz', '7', 'Strafen'],
      ['Kärntner Zweitgesetz', '5', 'Zweck'],
    ])
  })

  it('names what an Artikel changes where no law of the left column is its, rather than drop it (25.10.2026)', () => {
    const second = [
      body(L, 'Kärntner Zweitgesetz - K-ZG', 290),
      body(L, 'StF: LGBl Nr 2/2001', 278),
      centre(L, '§ 5', 266),
      body(L, 'Der Zweck des zweiten Gesetzes ist ein anderer als der des ersten.', 242),
    ]
    // Three Artikel, two laws on the left, and no Artikel names its law.
    const right = [
      centre(R, 'Artikel I', 497), body(R, '1. In § 7 wird das Wort „a“ durch „b“ ersetzt.', 485),
      centre(R, 'Artikel II', 400), body(R, '1. In § 5 wird das Wort „c“ durch „d“ ersetzt.', 388),
      centre(R, 'Artikel III', 300), body(R, '1. In § 9 wird das Wort „e“ durch „f“ ersetzt.', 288),
    ]
    const out = ktnTguParagraphs([page([...leftLaw(), ...second, ...right])], ['Kärntner Beispielgesetz', 'Kärntner Zweitgesetz'])
    expect(out.map((p) => [p.number, p.unread, p.because])).toEqual([['7', true, 'wording'], ['5', true, 'wording'], ['9', true, 'wording']])
    // A § such an Artikel inserts whole is named too, and not handed to the RIS check under no law.
    const inserts = [...right, centre(R, 'Artikel IV', 200), body(R, '1. Nach § 9 wird folgender § 9a eingefügt:', 188), centre(R, '§ 9a', 176), body(R, 'Neu.', 164)]
    expect(ktnTguParagraphs([page([...leftLaw(), ...second, ...inserts])], ['Kärntner Beispielgesetz', 'Kärntner Zweitgesetz']).find((p) => p.number === '9a')).toMatchObject({ law: null, unread: true, old: [], neu: [] })
  })

  it('reads nothing from a portrait document', () => {
    expect(ktnTguParagraphs([{ width: 595, items: leftLaw(), geometry: { runs: 1, offTurn: 0, skewed: 0 } }], laws)).toEqual([])
  })
})
