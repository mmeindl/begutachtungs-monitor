import { describe, expect, it } from 'vitest'
import { joinLines, mergeParagraphs, shareInRis, tguLines, tguParagraphs, tguUnits, type TguLine, type TguPage } from '../server/utils/laender/landTgu'

/** A run at (x, y), each character 5 pt wide; glyph widths equal, so centres fall evenly. */
function run(s: string, x: number, y: number) {
  return { s, x, y, w: s.length * 5, h: 10 }
}
const glyphsOf = (...texts: string[]) => texts.flatMap((t) => [...t].map((u) => ({ u, w: 500 })))
/** A rule under (or through) characters [from, to) of a run that starts at x. */
const rule = (x: number, y: number, from: number, to: number, kind: 'under' | 'strike'): [number, number, number, number] => {
  const ry = kind === 'under' ? y - 2 : y + 3
  return [x + from * 5, ry, x + to * 5, ry + 0.5]
}
const line = (raw: string, old = raw, neu = raw, marked = false): TguLine => ({ raw, old, neu, marked })

describe('tguLines', () => {
  it('leaves out the underlined characters for the law in force and the struck ones for the draft', () => {
    const text = 'alt neu Rest'
    const page: TguPage = {
      items: [run(text, 0, 100)],
      rules: [rule(0, 100, 0, 3, 'strike'), rule(0, 100, 4, 7, 'under')],
      glyphs: glyphsOf(text),
    }
    const [l] = tguLines(page)
    expect(l).toMatchObject({ raw: 'alt neu Rest', old: 'alt Rest', neu: 'neu Rest', marked: true })
  })

  it('keeps two words apart where a left-out run held the space between them', () => {
    // „Mitwirkung der Landes-Personalvertretung" added, „des" struck, printed without a gap.
    const text = 'Mitwirkung der Landesdes'
    const page: TguPage = {
      items: [run(text, 0, 100)],
      rules: [rule(0, 100, 10, 21, 'under'), rule(0, 100, 21, 24, 'strike')],
      glyphs: glyphsOf(text),
    }
    const [l] = tguLines(page)
    expect(l!.old).toBe('Mitwirkung des')
    expect(l!.neu).toBe('Mitwirkung der Landes')
  })

  it('reads lines top to bottom', () => {
    const page: TguPage = { items: [run('unten', 0, 100), run('oben', 0, 200)], rules: [], glyphs: glyphsOf('unten', 'oben') }
    expect(tguLines(page).map((l) => l.raw)).toEqual(['oben', 'unten'])
  })
})

describe('tguParagraphs', () => {
  it('files each § under the short title of its law', () => {
    const paras = tguParagraphs([
      line('Landesgesetz über die bautechnischen Anforderungen an Bauwerke'),
      line('(Oö. Bautechnikgesetz 2013 - Oö. BauTG 2013)'),
      line('§ 5'),
      line('Begriffe'),
      line('(1) Text.'),
      line('Oö. Gemeindeordnung 1990 (Oö. GemO 1990)'),
      line('§ 5'),
      line('(1) Anderer Text.'),
    ])
    expect(paras.map((p) => [p.law, p.number, p.old])).toEqual([
      ['Oö. Bautechnikgesetz 2013', '5', ['Begriffe', '(1) Text.']],
      ['Oö. Gemeindeordnung 1990', '5', ['(1) Anderer Text.']],
    ])
  })

  it('takes the next law\'s long title back out of the last § of the law before', () => {
    const paras = tguParagraphs([
      line('Oö. Bauordnung 1994 (Oö. BauO 1994)'),
      line('§ 60'),
      line('(1) Schluss.'),
      line('Landesgesetz über die bautechnischen Anforderungen an Bauwerke und'),
      line('Bauprodukte'),
      line('(Oö. Bautechnikgesetz 2013 - Oö. BauTG 2013)'),
      line('§ 1'),
      line('(1) Anfang.'),
    ])
    expect(paras[0]!.old).toEqual(['(1) Schluss.'])
    expect(paras[1]!.law).toBe('Oö. Bautechnikgesetz 2013')
  })

  it('does not take a sentence that wraps onto „Landesgesetz" for a title', () => {
    const paras = tguParagraphs([
      line('Oö. Bauordnung 1994 (Oö. BauO 1994)'),
      line('§ 3'),
      line('(1) Nach diesem'),
      line('Landesgesetz ist anzuzeigen.'),
    ])
    expect(paras[0]!.old).toEqual(['(1) Nach diesem', 'Landesgesetz ist anzuzeigen.'])
  })

  it('closes a § at the next division heading', () => {
    const paras = tguParagraphs([line('Oö. Bauordnung 1994 (Oö. BauO 1994)'), line('§ 3'), line('(1) Text.'), line('2. Hauptstück'), line('Bauplätze')])
    expect(paras[0]!.old).toEqual(['(1) Text.'])
  })
})

describe('mergeParagraphs', () => {
  it('joins a § printed twice — struck whole, then underlined whole — into one', () => {
    const merged = mergeParagraphs([
      { law: 'G', number: '2', old: ['alt'], neu: [], changed: true },
      { law: 'G', number: '2', old: [], neu: ['neu'], changed: true },
      { law: 'H', number: '2', old: ['x'], neu: ['x'], changed: false },
    ])
    expect(merged).toEqual([
      { law: 'G', number: '2', old: ['alt'], neu: ['neu'], changed: true },
      { law: 'H', number: '2', old: ['x'], neu: ['x'], changed: false },
    ])
  })
})

describe('tguUnits and joinLines', () => {
  it('splits off a short heading and joins the lines', () => {
    const { from, to } = tguUnits([{ law: 'G', number: '7', old: ['Urkunden', '(1) Ein Gemeinde-', 'Bezügegesetz und', 'mehr.'], neu: [], changed: true }])
    expect(from[0]).toMatchObject({ id: '§7', article: 'G', heading: 'Urkunden', text: '(1) Ein Gemeinde-Bezügegesetz und mehr.' })
    expect(to).toEqual([])
  })

  it('keeps the space before „und" after a hyphen', () => {
    expect(joinLines(['Kinder-', 'und Jugendhilfe'])).toBe('Kinder- und Jugendhilfe')
  })
})

describe('shareInRis', () => {
  const ris = '<nutzdaten><ueberschrift>Urkunden</ueberschrift><absatz>(1) Urkunden sind zu unterfertigen. (Anm: LGBl. Nr. 1/2000)</absatz></nutzdaten> Im RIS seit 01.01.2000'
  it('is 1 where the text stands in RIS word for word, notes and trailer aside', () => {
    expect(shareInRis('Urkunden (1) Urkunden sind zu unterfertigen.', ris)).toBe(1)
  })
  it('falls with every word RIS does not have', () => {
    expect(shareInRis('Urkunden (1) Urkunden sind sofort zu unterfertigen.', ris)).toBeLessThan(0.98)
  })
  it('is 0 where the § does not start as RIS\'s does', () => {
    expect(shareInRis('Ganz anderer Paragraph mit Text.', ris)).toBe(0)
  })
})
