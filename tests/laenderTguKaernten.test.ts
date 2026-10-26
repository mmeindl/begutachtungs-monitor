import { describe, expect, it } from 'vitest'
import type { AnnexItem, AnnexPage } from '../server/utils/annex/annexPdf'
import { divisionOf, gutterOf, ktnLines, ktnTguParagraphs, ktnTguReading, promulgatedName, rangeNumbers, readInstruction } from '../server/utils/laender/landTguKaernten'

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
    // A list of §§ each with its Absatz (842/2022, 26.10.2026): every one of them, not the first alone.
    expect(read('In den §§ 61 Abs. 1, 62 Abs. 1, 63 Abs. 1 und 65 Abs. 1 wird das Wort „a“ jeweils durch das Wort „b“ ersetzt.').touches).toEqual(['61', '62', '63', '65'])
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
    expect(read('Im ganzen Gesetz wird das Wort „Bezirk“ durch das Wort „Region“ ersetzt.')).toMatchObject({ all: true, quoted: 'Bezirk' })
    // A division's words or the division itself (26.10.2026): not every § of the law.
    expect(read('Im V. Abschnitt wird jeweils der Ausdruck „Kindergärtner(innen)“ durch „Elementarpädagogen“ ersetzt.')).toMatchObject({ all: false, op: { kind: 'divisionWording', division: { level: 'Abschnitt', designation: '5' }, quoted: 'Kindergärtner(innen)' } })
    expect(read('Der 1. Abschnitt des Gesetzes („Auskunft“) entfällt.')).toMatchObject({ all: false, op: { kind: 'divisionDelete', division: { level: 'Abschnitt', designation: '1' } } })
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
    // The numbering skips an instruction: whatever it changes, nobody read it — and the page says so (26.10.2026).
    expect(because([body(R, '1. In § 5 Abs. 1 wird das Wort „wie“ durch „als“ ersetzt.', 450), body(R, '3. § 7 entfällt.', 400)])).toEqual([['5', 'gap'], ['7', 'gap']])
  })

  it('names every § a range creates, not only those the left column prints (25.10.2026)', () => {
    expect(rangeNumbers(['51a', '51d'])).toEqual(['51a', '51b', '51c', '51d'])
    expect(rangeNumbers(['5', '7'])).toEqual(['5', '6', '7'])
    expect(rangeNumbers(['5', '7a'])).toEqual([])
    const right = [body(R, '1. Nach § 7 wird folgender 3. Abschnitt mit den §§ 7a bis 7c eingefügt:', 450), centre(R, '3. Abschnitt', 438)]
    // § 7 is where the new division stands, not a § it changes (26.10.2026).
    const ps = ktnTguParagraphs([page([...leftLaw(), ...right])], laws)
    expect(unreadOf(ps)).toEqual(['7a', '7b', '7c'])
    expect(ps.every((p) => p.because === 'division')).toBe(true)
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
    // Filed under the Artikel's own designation, so that two such Artikel do not run into one (26.10.2026).
    expect(ktnTguParagraphs([page([...leftLaw(), ...second, ...inserts])], ['Kärntner Beispielgesetz', 'Kärntner Zweitgesetz']).find((p) => p.number === '9a')).toMatchObject({ law: 'Artikel IV', unread: true, old: [], neu: [] })
  })

  it('reads nothing from a portrait document', () => {
    expect(ktnTguParagraphs([{ width: 595, items: leftLaw(), geometry: { runs: 1, offTurn: 0, skewed: 0 } }], laws)).toEqual([])
  })
})

describe('ktnTguParagraphs — what was lost or named falsely until 26.10.2026', () => {
  const laws = ['Kärntner Beispielgesetz']
  const pick = (ps: ReturnType<typeof ktnTguParagraphs>) => ps.map((p) => [p.number, p.unread ? (p.because ?? 'unread') : 'shown']).sort((a, b) => a[0]!.localeCompare(b[0]!))

  /** The law with §§ 5 to 7, § 6 and § 7 in its 3. Abschnitt. */
  function divided(): AnnexItem[] {
    const items = leftLaw()
    const at = items.findIndex((i) => i.text === '§ 6')
    const y = items[at]!.y
    // Make room: the division heading and its name stand above § 6.
    return [...items.slice(0, at), centre(L, '3. Abschnitt', y + 6), centre(L, 'Pflichten und Strafen', y + 3), ...items.slice(at)]
  }

  it('names the §§ of a division the Novelle prints anew and the reader cannot read (48376/2024)', () => {
    const right = [body(R, '1. Der 3. Abschnitt lautet:', 450), centre(R, '3. Abschnitt', 438), centre(R, 'Neue Regeln', 426), body(R, 'Ein Text ohne einen einzigen Paragraphen.', 414)]
    expect(pick(ktnTguParagraphs([page([...divided(), ...right])], laws))).toEqual([['6', 'division'], ['7', 'division']])
  })

  it('nests the divisions as the law\'s headings come, a Teil inside an Abschnitt, and reads a new division after its long title (48376/2024)', () => {
    const left = [
      body(L, 'Kärntner Beispielgesetz - K-BspG', 488), body(L, 'StF: LGBl Nr 1/2000', 476),
      centre(L, '4. Abschnitt', 464), centre(L, '1. Teil', 452), centre(L, '§ 21', 440), body(L, 'Der Abschnitt gilt für die Gesellschaft und ihre Organe.', 428),
      centre(L, '2. Teil', 416), centre(L, '§ 22', 404), body(L, 'Die Aufnahme folgt den Regeln des zweiten Abschnitts.', 392),
    ]
    const right = [
      body(R, '1. Der 4. Abschnitt lautet:', 470), centre(R, '4. Abschnitt', 458),
      { x: R.margin + 8, y: 446, width: R.edge - R.margin - 16, text: 'Objektivierung in der Landeskrankenanstalten-Betriebsgesellschaft –' },
      centre(R, 'KABEG', 434), centre(R, '§ 21', 422), body(R, 'Der Abschnitt gilt für die Gesellschaft.', 410),
    ]
    expect(pick(ktnTguParagraphs([page([...left, ...right])], laws))).toEqual([['21', 'shown'], ['22', 'division']])
  })

  it('shows what a new division prints of a § in force, and names the § it no longer prints', () => {
    const right = [body(R, '1. Der 3. Abschnitt lautet:', 450), centre(R, '3. Abschnitt', 438), centre(R, '§ 6', 426), centre(R, 'Pflichten', 414), body(R, 'Neu gefasst.', 402)]
    expect(pick(ktnTguParagraphs([page([...divided(), ...right])], laws))).toEqual([['6', 'shown'], ['7', 'division']])
  })

  it('takes a division\'s §§ from the instruction where it lists them, and not a § another instruction addresses (44393/2023, 44/2021)', () => {
    // „mit den §§ 6": § 7, printed under the same heading, is not the division's.
    expect(pick(ktnTguParagraphs([page([...divided(), body(R, '1. Der 3. Abschnitt mit dem § 6 entfällt.', 450), body(R, '2. § 7 entfällt.', 430)])], laws))).toEqual([['6', 'division'], ['7', 'shown']])
    // The column leaves out the heading of the division § 7 stands in; another instruction addresses it, so it is not the replaced one's.
    const right = [body(R, '1. Der 3. Abschnitt lautet:', 450), centre(R, '3. Abschnitt', 438), centre(R, '§ 6', 426), centre(R, 'Pflichten', 414), body(R, 'Neu gefasst.', 402), body(R, '2. § 7 entfällt.', 380)]
    expect(pick(ktnTguParagraphs([page([...divided(), ...right])], laws))).toEqual([['6', 'shown'], ['7', 'shown']])
  })

  it('compares a § another division\'s new text prints by its number, rather than name it (20258/2025)', () => {
    const right = [
      body(R, '1. Der 3. Abschnitt lautet:', 450), centre(R, '3. Abschnitt', 438), centre(R, '§ 6', 426), body(R, 'Neu gefasst.', 414),
      body(R, '2. Nach § 7 wird folgender 4. Abschnitt angefügt:', 390), centre(R, '4. Abschnitt', 378), centre(R, '§ 8', 366), body(R, 'Ganz neu.', 354),
    ]
    // § 7, not printed by the new 3. Abschnitt, is named; were it printed by another instruction, it would be compared.
    expect(pick(ktnTguParagraphs([page([...divided(), ...right])], laws))).toEqual([['6', 'shown'], ['7', 'division'], ['8', 'shown']])
  })

  it('names the §§ of a division repealed whole, and those of one whose words change throughout, saying the instruction for the law', () => {
    expect(pick(ktnTguParagraphs([page([...divided(), body(R, '1. Der 3. Abschnitt entfällt.', 450)])], laws))).toEqual([['6', 'division'], ['7', 'division']])
    const wording = ktnTguReading([page([...divided(), body(R, '1. Im 3. Abschnitt wird jeweils das Wort „Person“ durch das Wort „Mensch“ ersetzt.', 450)])], laws)
    expect(pick(wording.paragraphs)).toEqual([['6', 'wording']])
    expect(wording.reaches).toEqual([{ law: 'Kärntner Beispielgesetz', instruction: 'Im 3. Abschnitt wird jeweils das Wort „Person“ durch das Wort „Mensch“ ersetzt.' }])
  })

  it('says an instruction for the whole law for its law, and names the §§ its words stand in', () => {
    const r = ktnTguReading([page([...leftLaw(), body(R, '1. Im ganzen Gesetz wird das Wort „Person“ durch das Wort „Mensch“ ersetzt.', 450)])], laws)
    expect(pick(r.paragraphs)).toEqual([['6', 'wording']])
    expect(r.reaches?.map((x) => x.instruction)).toEqual(['Im ganzen Gesetz wird das Wort „Person“ durch das Wort „Mensch“ ersetzt.'])
  })

  it('reads the Artikel of a law organised in Artikel (K-LVG, 1203/2020)', () => {
    const left = [
      body(L, 'Kärntner Landesverfassung - K-LVG', 488), body(L, 'StF: LGBl Nr 85/1996', 476),
      centre(L, 'Artikel 19', 464), centre(L, 'Landtag', 452), absatz(L, '(1) Der Landtag besteht aus sechsunddreißig Abgeordneten.', 440),
      centre(L, 'Artikel 20', 428), centre(L, 'Wahl', 416), absatz(L, '(1) Die Abgeordneten werden gewählt.', 404),
    ]
    const right = [body(R, '1. Art. 19 lautet:', 450), centre(R, 'Artikel 19', 438), centre(R, 'Landtag', 426), absatz(R, '(1) Der Landtag besteht aus Abgeordneten.', 414), body(R, '2. In Art. 20 Abs. 1 wird das Wort „gewählt“ durch „bestimmt“ ersetzt.', 380)]
    const ps = ktnTguParagraphs([page([...left, ...right])], ['Kärntner Landesverfassung'])
    expect(pick(ps)).toEqual([['Art. 19', 'shown'], ['Art. 20', 'wording']])
    expect(ps.find((p) => p.number === 'Art. 19')).toMatchObject({ old: ['Landtag', '(1) Der Landtag besteht aus sechsunddreißig Abgeordneten.'], neu: ['Landtag', '(1) Der Landtag besteht aus Abgeordneten.'] })
  })

  it('reads an Artikel whose single instruction carries no number, after the sentence that names its law (11829/2021)', () => {
    expect(promulgatedName('Das Kärntner Beispielgesetz, LGBl Nr 1/2000, zuletzt geändert durch LGBl Nr 5/2020, wird wie folgt geändert:')).toBe('Kärntner Beispielgesetz')
    const right = [centre(R, 'Artikel I', 497), body(R, 'Das Kärntner Beispielgesetz, LGBl Nr 1/2000, wird wie folgt geändert:', 485), body(R, '§ 7 entfällt.', 470)]
    expect(pick(ktnTguParagraphs([page([...leftLaw(), ...right])], laws))).toEqual([['7', 'shown']])
  })

  it('reads a one-law draft that opens with the sentence naming its law, without an Artikel above it', () => {
    const right = [body(R, 'Das Kärntner Beispielgesetz, LGBl Nr 1/2000, wird wie folgt geändert:', 485), body(R, '1. § 7 entfällt.', 470)]
    expect(pick(ktnTguParagraphs([page([...leftLaw(), ...right])], laws))).toEqual([['7', 'shown']])
  })

  it('says what an Artikel changes in another Novelle\'s article for that article, with or without the sentence that opens it (227/2022, 698/2021)', () => {
    const right = [
      centre(R, 'Artikel II', 497), centre(R, 'Änderung des Artikels II des Gesetzes LGBl. Nr. 93/2019', 485),
      absatz(R, 'Art. II des Gesetzes LGBl. Nr. 93/2019 wird wie folgt geändert:', 473),
      body(R, 'In Art. II Abs. 2 wird das Datum „30. Juni 2023“ durch das Datum „31. Dezember 2024“ ersetzt.', 461),
      centre(R, 'Artikel III', 400), centre(R, 'Änderung des Art. II des Gesetzes LGBl. Nr. 1/2013', 388),
      body(R, 'Im Art. II Abs. 2 des Gesetzes LGBl. Nr. 1/2013 wird nach dem Wort „a“ das Wort „b“ eingefügt.', 376),
    ]
    const r = ktnTguReading([page([...leftLaw(), ...right])], laws)
    // Under the article it amends, not under the one law of the draft's title.
    expect(r.reaches).toEqual([
      { law: 'Art. II des Gesetzes LGBl. Nr. 93/2019', instruction: 'In Art. II Abs. 2 wird das Datum „30. Juni 2023“ durch das Datum „31. Dezember 2024“ ersetzt.' },
      { law: 'Art. II des Gesetzes LGBl. Nr. 1/2013', instruction: 'Im Art. II Abs. 2 des Gesetzes LGBl. Nr. 1/2013 wird nach dem Wort „a“ das Wort „b“ eingefügt.' },
    ])
  })

  it('pairs an Artikel with its law by a name the column wrapped at its hyphen, and keeps an Artikel that amends another Novelle out of the pairing (1037/2021)', () => {
    const left = [
      body(L, 'Gesetz über die Personalvertretung (Kärntner Gemeinde- Personalvertretungsgesetz - K-GPVG)', 488), body(L, 'StF: LGBl Nr 1/1983', 476),
      centre(L, '§ 21', 464), body(L, 'Die Personalvertretung besteht aus gewählten Mitgliedern.', 452),
    ]
    const right = [
      centre(R, 'Artikel I', 497), centre(R, 'Änderung des Kärntner Gemeinde-Personalvertretungsgesetzes', 485), body(R, '1. § 21 entfällt.', 470),
      centre(R, 'Artikel II', 400), centre(R, 'Änderung des Landesgesetzes LGBl. Nr. 117/2022', 388),
      absatz(R, 'Das Landesgesetz LGBl. Nr. 117/2022 wird wie folgt geändert:', 376),
      body(R, 'In Art. III Abs. 2 wird die Zahl „2023“ durch die Zahl „2024“ ersetzt.', 364),
    ]
    const r = ktnTguReading([page([...left, ...right])], ['Kärntner Gemeinde-Personalvertretungsgesetz'])
    expect(r.paragraphs.map((p) => [p.law, p.number, p.unread ?? false])).toEqual([['Kärntner Gemeinde-Personalvertretungsgesetz', '21', false]])
    expect(r.reaches).toEqual([{ law: 'Landesgesetz LGBl. Nr. 117/2022', instruction: 'In Art. III Abs. 2 wird die Zahl „2023“ durch die Zahl „2024“ ersetzt.' }])
  })

  it('takes a numbered line whose § sign was lost for an instruction, not for a gap in the numbering (2314, „4. 8 Abs. 3 Z 2 entfällt.")', () => {
    const right = [body(R, '1. § 7 entfällt.', 450), body(R, '2. 6 Abs. 3 entfällt.', 430), body(R, '3. § 5 entfällt.', 410)]
    // Read as instruction 2, it leaves the law's other instructions to be performed, and names its own §.
    expect(pick(ktnTguParagraphs([page([...leftLaw(), ...right])], laws))).toEqual([['5', 'shown'], ['6', 'unread'], ['7', 'shown']])
  })

  it('names an Anlage an instruction replaces, and no § for it', () => {
    const right = [body(R, '1. § 7 entfällt.', 450), body(R, '2. Die Anlage 2 lautet:', 430), body(R, '„Anlage 2 Neue Tabelle“', 418)]
    expect(pick(ktnTguParagraphs([page([...leftLaw(), ...right])], laws))).toEqual([['7', 'shown'], ['Anlage 2', 'annex']])
  })

  it('knows a division by its level and number, in words or in Roman numerals', () => {
    expect(divisionOf('Der 4. Abschnitt lautet:')).toMatchObject({ level: 'Abschnitt', designation: '4' })
    expect(divisionOf('Im V. Abschnitt wird jeweils …')).toMatchObject({ level: 'Abschnitt', designation: '5' })
  })
})

describe('ktnTguParagraphs — a number out of turn (26.10.2026)', () => {
  const laws = ['Kärntner Beispielgesetz']
  const pick = (ps: ReturnType<typeof ktnTguParagraphs>) => ps.map((p) => [p.number, p.unread ? (p.because ?? 'unread') : 'shown']).sort((a, b) => a[0]!.localeCompare(b[0]!))
  const read = (right: AnnexItem[]) => pick(ktnTguParagraphs([page([...leftLaw(), ...right])], laws))
  const all = [['5', 'shown'], ['6', 'shown'], ['7', 'shown']]

  it('takes an instruction printed after the next one for the one it is (2193/2019: 1, 3, 2, 4)', () => {
    expect(read([body(R, '1. § 7 entfällt.', 450), body(R, '3. § 5 entfällt.', 430), body(R, '2. § 6 Abs. 3 entfällt.', 410)])).toEqual(all)
  })

  it('takes an instruction numbered as an earlier one where the next skips a number for the skipped one, but not a reprint (539/2021, 2038/2020)', () => {
    expect(read([body(R, '1. § 7 entfällt.', 450), body(R, '1. § 6 Abs. 3 entfällt.', 430), body(R, '3. § 5 entfällt.', 410)])).toEqual(all)
    // The same instruction printed twice is still one we cannot place: the number stays missing.
    expect(read([body(R, '1. § 7 entfällt.', 450), body(R, '1. § 7 entfällt.', 430), body(R, '3. § 5 entfällt.', 410)])).toEqual([['5', 'gap'], ['7', 'gap']])
  })

  it('takes the next number without its full stop, after a sentence ends (18119/2023, 1037/2021, 59470/2025)', () => {
    expect(read([body(R, '1. § 7 entfällt.', 450), body(R, '2 § 6 Abs. 3 entfällt.', 430), body(R, '3. § 5 entfällt.', 410)])).toEqual(all)
  })

  it('takes the next number from the end of the line above a head, and leaves it out of that line (1037/2021)', () => {
    const ps = ktnTguParagraphs([page([...leftLaw(), body(R, '1. § 6 Abs. 2 lautet:', 450), absatz(R, '(2) Die neue Fassung.2.', 438), body(R, '§ 5 Abs. 2 entfällt.', 426), body(R, '3. § 7 entfällt.', 414)])], laws)
    expect(pick(ps)).toEqual(all)
    expect(ps.find((p) => p.number === '6')!.neu).toContain('(2) Die neue Fassung.')
  })

  it('still names every § of a law whose numbering misses a number no line carries', () => {
    expect(read([body(R, '1. § 7 entfällt.', 450), body(R, '3. § 5 entfällt.', 410)])).toEqual([['5', 'gap'], ['7', 'gap']])
  })

  it('names there the § a payload prints whole under no head of its own too (35244/2025, § 5a)', () => {
    const right = [
      body(R, '1. In § 5 Abs. 1 wird das Wort „wie“ durch „als“ ersetzt.', 450),
      centre(R, '§ 5a', 438), centre(R, 'Neu', 426), absatz(R, '(1) Ein neuer Paragraph.', 414),
      body(R, '3. § 7 entfällt.', 400),
    ]
    expect(read(right)).toEqual([['5', 'gap'], ['5a', 'gap'], ['7', 'gap']])
  })
})

describe('ktnTguParagraphs — a head without its colon (26.10.2026)', () => {
  const laws = ['Kärntner Beispielgesetz']

  it('ends the head where its payload\'s § begins, and names no § the new text cites (32262/2025, § 87 K-LTWO)', () => {
    const right = [
      body(R, '1. Nach § 7 wird folgender § 7a eingefügt', 450),
      centre(R, '§ 7a', 438),
      centre(R, 'Fristen', 426),
      absatz(R, '§ 87 K-LTWO gilt sinngemäß.', 414),
    ]
    const ps = ktnTguParagraphs([page([...leftLaw(), ...right])], laws)
    expect(ps.map((p) => [p.number, p.unread ?? false])).toEqual([['7a', false]])
    expect(ps[0]!.neu).toEqual(['Fristen', '§ 87 K-LTWO gilt sinngemäß.'])
  })

  it('keeps a head that runs on over lines, where no centred § follows', () => {
    const right = [body(R, '1. In § 6 Abs. 3 wird das Wort „bleibt“ durch das Wort', 450), body(R, '„geht“ ersetzt.', 438)]
    expect(ktnTguParagraphs([page([...leftLaw(), ...right])], laws).map((p) => [p.number, p.because ?? null])).toEqual([['6', 'wording']])
  })
})

describe('ktnTguReading — a law repealed whole (26.10.2026)', () => {
  it('says the sentence that repeals a law for that law, and pairs the other Artikel as before (1082/2019)', () => {
    const right = [
      centre(R, 'Artikel I', 497),
      centre(R, 'Aufhebung des Kärntner Altgesetzes', 485),
      absatz(R, 'Das Kärntner Altgesetz – K-AG, LGBl. Nr. 1/2000, in der Fassung des Gesetzes', 473),
      body(R, 'LGBl. Nr. 2/2010, tritt mit Inkrafttreten dieses Gesetzes außer Kraft.', 461),
      centre(R, 'Artikel II', 449),
      centre(R, 'Änderung des Kärntner Beispielgesetzes', 437),
      body(R, '1. § 7 entfällt.', 425),
    ]
    const r = ktnTguReading([page([...leftLaw(), ...right])], ['Kärntner Beispielgesetz'])
    expect(r.paragraphs.map((p) => [p.law, p.number, p.unread ?? false])).toEqual([['Kärntner Beispielgesetz', '7', false]])
    expect(r.reaches).toEqual([{ law: 'Kärntner Altgesetz', instruction: 'Das Kärntner Altgesetz – K-AG, LGBl. Nr. 1/2000, in der Fassung des Gesetzes LGBl. Nr. 2/2010, tritt mit Inkrafttreten dieses Gesetzes außer Kraft.' }])
  })
})

describe('ktnTguParagraphs — a renumbered § (26.10.2026)', () => {
  const laws = ['Kärntner Beispielgesetz']
  const pick = (ps: ReturnType<typeof ktnTguParagraphs>) => ps.map((p) => [p.from ?? null, p.number, p.unread ? (p.because ?? 'unread') : 'shown'])

  it('shows the § in force under its new number, from its old, where nothing else edits it (15193/2025)', () => {
    const ps = ktnTguParagraphs([page([...leftLaw(), body(R, '1. Der bisherige § 7 erhält die Bezeichnung „§ 7a“.', 450)])], laws)
    expect(pick(ps)).toEqual([['7', '7a', 'shown']])
    expect(ps[0]!.old).toEqual(ps[0]!.neu)
  })

  it('names it as moved where another instruction edits it, once and with that instruction\'s reason (840/2021)', () => {
    const right = [body(R, '1. Der bisherige § 6 erhält die Bezeichnung „§ 6a“.', 450), body(R, '2. In § 6a Abs. 3 wird das Wort „bleibt“ durch das Wort „geht“ ersetzt.', 430)]
    expect(pick(ktnTguParagraphs([page([...leftLaw(), ...right])], laws))).toEqual([['6', '6a', 'wording']])
  })

  it('takes a § the Novelle inserts under the number a renumbering frees for a new one', () => {
    const right = [
      body(R, '1. Nach § 6 wird folgender § 7 eingefügt:', 450), centre(R, '§ 7', 438), centre(R, 'Neu', 426), absatz(R, '(1) Ganz neu.', 414),
      body(R, '2. Der bisherige § 7 erhält die Bezeichnung „§ 8“.', 400),
    ]
    const ps = ktnTguParagraphs([page([...leftLaw(), ...right])], laws)
    expect(pick(ps)).toEqual([[null, '7', 'shown'], ['7', '8', 'shown']])
    expect(ps[0]!.old).toEqual([])
  })
})
