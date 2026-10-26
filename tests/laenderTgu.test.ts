import { describe, expect, it } from 'vitest'
import { draftNameOf, kaerntenDated, readableLawName, tirolDated, wienTguStart } from '../server/utils/laender/landTguService'
import { amendedLawOf, amendedLawsOf, columnParagraphs, draftDeletes, joinLines, mergeParagraphs, onlyElided, searchPhrase, shareInRis, standsInRis, tguLines, tguParagraphs, tguUnits, withHeadings, type TguLine, type TguPage } from '../server/utils/laender/landTgu'

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
  it('splits off a short heading and joins the lines, pairing both sides as one §', () => {
    const paras = [{ law: 'G', number: '7', old: ['Urkunden', '(1) Ein Gemeinde-', 'Bezügegesetz und', 'mehr.'], neu: ['Urkunden', '(1) bis (6) …', '(7) Neu.'], changed: true }]
    const { from, to } = tguUnits(paras)
    expect(from[0]).toMatchObject({ id: '§7', article: 'G', text: '(1) Ein Gemeinde-Bezügegesetz und mehr.' })
    // The document says both sides are § 7: one marker, whatever they share.
    expect(from[0]!.heading).toBe(to[0]!.heading)
    expect(withHeadings([{ ...from[0]!, article: 'G' }], paras)[0]!.heading).toBe('Urkunden')
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

describe('two-column Textgegenüberstellung (Wien)', () => {
  const ris = '<nutzdaten>Strafbestimmungen § 6. (1) Wer entgegen § 2 Abs. 1 Straßen verunreinigt, ist mit einer Geldstrafe von 50 Euro zu bestrafen. (2) Wer Aufträgen nicht nachkommt, ist zu bestrafen. (3) Bei allen Übertretungen können Organstrafverfügungen ergehen. (4) Weiter. (5) Ende.</nutzdaten>'

  it('checks every stretch between elisions, and the § designation nowhere', () => {
    expect(standsInRis('Strafbestimmungen (1) Wer entgegen § 2 Abs. 1 Straßen verunreinigt, ist mit einer Geldstrafe von 50 Euro zu bestrafen. (2) bis (3) … (4) Ganz anders formuliert als im Gesetz stehend.', ris)).toBe(false)
    expect(standsInRis('Strafbestimmungen (1) Wer entgegen § 2 Abs. 1 Straßen verunreinigt, ist mit einer Geldstrafe von 50 Euro zu bestrafen. (2) bis (5) …', ris)).toBe(true)
    expect(standsInRis('Strafbestimmungen (1) Wer entgegen § 2 Abs. 1 Straßen verunreinigt, ist mit einer Geldstrafe von 70 Euro zu bestrafen. (2) bis (5) …', ris)).toBe(false)
  })

  it('joins a §\'s rows and puts its heading on a line of its own', () => {
    const paras = columnParagraphs([
      { kind: 'pair', law: null, para: '§ 2.', current: 'Reinhaltung öffentlicher Flächen § 2. (1) bis (7) …', proposed: 'Reinhaltung öffentlicher Flächen § 2. (1) bis (7) …', changed: false },
      { kind: 'pair', law: null, para: '§ 2.', current: '(8) Alt.', proposed: '(8) Neu.', changed: true },
    ], ['Wiener Reinhaltegesetz'])
    expect(paras).toEqual([{ law: 'Wiener Reinhaltegesetz', number: '2', old: ['Reinhaltung öffentlicher Flächen', '(1) bis (7) …', '(8) Alt.'], neu: ['Reinhaltung öffentlicher Flächen', '(1) bis (7) …', '(8) Neu.'], changed: true }])
  })

  it('leaves the next division\'s heading out of the § before it, and a reference to a division in', () => {
    const paras = columnParagraphs([
      { kind: 'pair', law: null, para: '§ 16a.', current: '', proposed: '§ 16a. (5) Darzulegen sind die Kriterien. 6. Teil Raumordnungs-Aufsicht', changed: true },
      { kind: 'pair', law: null, para: '§ 17.', current: '§ 17. (1) Es gilt das nach dem 6. Teil.', proposed: '§ 17. (1) Es gilt das nach dem 6. Teil.', changed: false },
    ], ['Salzburger Raumordnungsgesetz 2009'])
    expect(paras[0]!.neu).toEqual(['(5) Darzulegen sind die Kriterien.'])
    expect(paras[1]!.old).toEqual(['(1) Es gilt das nach dem 6. Teil.'])
  })

  // The federal reader hands a division heading to the § below it whole, also
  // the headings of divisions whose §§ the document leaves out (33616: the
  // 6. Teil over § 80). RIS prints over § 80 only what opens there.
  it('keeps over a § only the last division heading the reader handed to it', () => {
    const paras = columnParagraphs([
      { kind: 'pair', law: null, para: '§ 80.', current: '6. Teil Raumordnungs-Aufsicht 5. Abschnitt Schlussbestimmungen Umsetzungshinweis § 80. Dieses Gesetz dient der Umsetzung.', proposed: '6. Teil Raumordnungs-Aufsicht 5. Abschnitt Schlussbestimmungen Umsetzungshinweis § 80. Dieses Gesetz dient der Umsetzung.', changed: false },
    ], ['Salzburger Raumordnungsgesetz 2009'])
    expect(paras[0]!.old).toEqual(['5. Abschnitt Schlussbestimmungen Umsetzungshinweis', 'Dieses Gesetz dient der Umsetzung.'])
  })

  it('names the laws a draft amends from its title, without their abbreviation', () => {
    expect(amendedLawOf('Gesetz, mit dem das Wiener Reinhaltegesetz geändert wird')).toBe('Wiener Reinhaltegesetz')
    expect(amendedLawOf('Gesetz, mit dem das Salzburger Schulorganisations-Ausführungsgesetz 1995 – SchuOG 1995 geändert wird')).toBe('Salzburger Schulorganisations-Ausführungsgesetz 1995')
    expect(amendedLawsOf('Gesetz, mit dem die Dienstordnung 1994, die Besoldungsordnung 1994 und das Wiener Bedienstetengesetz geändert werden'))
      .toEqual(['Dienstordnung 1994', 'Besoldungsordnung 1994', 'Wiener Bedienstetengesetz'])
  })

  it('files §§ under the law whose name heads them in a package', () => {
    const paras = columnParagraphs([
      { kind: 'pair', law: null, heading: 'Landesbeamten-Pensionsgesetz', para: '§ 37o.', current: '', proposed: '§ 37o. (1) Neu.', changed: true },
      { kind: 'pair', law: null, heading: 'Salzburger Objektivierungsgesetz 2017 Ausschreibung', para: '§ 3.', current: '(1) Alt.', proposed: '(1) Neu.', changed: true },
    ], ['Landesbeamten-Pensionsgesetz', 'Salzburger Objektivierungsgesetz 2017'])
    expect(paras.map((p) => [p.law, p.number])).toEqual([['Landesbeamten-Pensionsgesetz', '37o'], ['Salzburger Objektivierungsgesetz 2017', '3']])
  })

  it('takes a § as deleted only where the draft says so', () => {
    expect(draftDeletes('2. § 15 samt Überschrift entfällt.', '15')).toBe(true)
    expect(draftDeletes('3. Die §§ 14 und 15 entfallen.', '15')).toBe(true)
    expect(draftDeletes('2. § 15 Abs 1 lautet: „(1) Neu."', '15')).toBe(false)
    expect(draftDeletes('2. § 150 entfällt.', '15')).toBe(false)
  })
})

describe('finding a § by its own words', () => {
  it('takes eight plain words past the heading, from the longest stretch', () => {
    expect(searchPhrase('Hilfeleistungen (1) bis (2) … (3) Als Hilfeleistungen nach diesem Gesetz kommen in Betracht die Eingliederungshilfe und die Pflege.'))
      .toBe('Hilfeleistungen nach diesem Gesetz kommen in Betracht die')
    expect(searchPhrase('§ 3 Abs 1 Z 2 lit a')).toBeNull()
  })

  it('knows a § with nothing but elisions to check', () => {
    expect(onlyElided('(1) bis (4) …')).toBe(true)
    expect(onlyElided('(1) bis (4) … (5) Die Landesregierung hat durch Verordnung festzulegen.')).toBe(false)
  })
})

describe('draftNameOf — one law under RIS\'s name and the draft\'s (23.10.2026)', () => {
  it('maps RIS\'s short title with its abbreviation back to the draft\'s name', () => {
    expect(draftNameOf('Kärntner Jagdgesetz 2000 - K-JG', ['Kärntner Jagdgesetz 2000'])).toBe('Kärntner Jagdgesetz 2000')
    expect(draftNameOf('Kärntner Fischereigesetz-K-FG', ['Kärntner Fischereigesetz'])).toBe('Kärntner Fischereigesetz')
  })

  it('leaves another law alone', () => {
    expect(draftNameOf('Kärntner Jagdgesetz 2000 - K-JG', ['Kärntner Fischereigesetz'])).toBeNull()
    expect(draftNameOf('Kärntner Landes-Gleichbehandlungsgesetz 2022', ['Kärntner Landarbeiterkammergesetz 1979'])).toBeNull()
  })

  it('takes the abbreviation after a comma for the same law (25.10.2026)', () => {
    expect(draftNameOf('Kärntner Landes-Pflanzenschutzmittelgesetz, K-LPG', ['Kärntner Landes-Pflanzenschutzmittelgesetz'])).toBe('Kärntner Landes-Pflanzenschutzmittelgesetz')
    expect(draftNameOf('Kärntner Berg- und Schiführergesetz, K-BSFG', ['Kärntner Sportgesetz 1997', 'Kärntner Berg- und Schiführergesetz'])).toBe('Kärntner Berg- und Schiführergesetz')
    // RIS's word order is no abbreviation.
    expect(draftNameOf('Bauordnung 2022, Tiroler', ['Tiroler Bauordnung 2022'])).toBe('Tiroler Bauordnung 2022')
    expect(draftNameOf('Kärntner Schulgesetz - K-SchG', ['Kärntner landwirtschaftliche Schulgesetz 1993'])).toBeNull()
  })
})

describe('tguUnits — a heading the draft changes (24.10.2026)', () => {
  const para = (old: string[], neu: string[]) => ({ law: 'Tiroler Bauordnung 2022', number: '52', old, neu, changed: true })

  it('is a change, not „unverändert"', () => {
    const { from, to } = tguUnits([para(['Herstellung des gesetzmäßigen Zustandes', '(1) Text.'], ['Herstellung des gesetzmäßigen Zustandes nach Abbruch', '(1) Text.'])])
    expect(from[0]!.text).not.toBe(to[0]!.text)
  })

  it('still sets an unchanged heading aside', () => {
    const { from, to } = tguUnits([para(['Geltungsbereich', '(1) Alt.'], ['Geltungsbereich', '(1) Neu.'])])
    expect(from[0]!.text).toBe('(1) Alt.')
    expect(to[0]!.text).toBe('(1) Neu.')
  })
})

describe('law names folded into one (24.10.2026)', () => {
  it.each([
    ['Geschäftsordnung des Kärntner Landtages - K-LTGO', 'Gesetz über die Geschäftsordnung des Kärntner Landtages'],
    ['Kärntner Bauvorschriften- K-BV', 'Kärntner Bauvorschriften'],
    ['Bauordnung 2022, Tiroler', 'Tiroler Bauordnung 2022'],
    ['Gemeinde-Investitionsfonds, Gesetz über den', 'Gesetz über den Gemeinde-Investitionsfonds'],
  ])('%s is the draft\'s %s', (ris, draft) => {
    expect(draftNameOf(ris, [draft])).toBe(draft)
  })

  it('keeps a law whose last word only looks like an abbreviation', () => {
    expect(draftNameOf('Kärntner Landes-Gleichbehandlungsgesetz 2022', ['Kärntner Landes'])).toBeNull()
  })

  it('turns RIS\'s order round where no draft names the law', () => {
    expect(readableLawName('Bauordnung 2022, Tiroler')).toBe('Tiroler Bauordnung 2022')
    expect(readableLawName('Gemeinde-Investitionsfonds, Gesetz über den')).toBe('Gesetz über den Gemeinde-Investitionsfonds')
    expect(readableLawName('Landeskulturfonds, Gesetz')).toBe('Landeskulturfonds, Gesetz')
  })
})

describe('the date a Textgegenüberstellung gives itself (24.10.2026)', () => {
  it('Kärnten: the first of the month it names', () => {
    expect(kaerntenDated([{ items: [{ text: 'Begutachtungsentwurf' }, { text: 'Oktober 2026' }, { text: 'zu Zl. LAD-VD-LG-37427/2025-79' }] }])).toBe('2026-10-01')
    expect(kaerntenDated([{ items: [{ text: 'Textgegenüberstellung' }] }])).toBeNull()
  })

  it('Tirol: the day of its version', () => {
    expect(tirolDated([{ runs: [{ s: '1 von 12' }, { s: 'VD-173/2-2026 Fassung vom 9. März 2026' }] }])).toBe('2026-03-09')
  })
})

describe('where Wien\'s Textgegenüberstellung starts (25.10.2026)', () => {
  const page = (...texts: string[]) => ({ items: texts.map((text) => ({ text })) })
  it('finds its title in any case', () => {
    expect(wienTguStart([page('Gesetz, mit dem …'), page('TEXTGEGENÜBERSTELLUNG', '25. Novelle des Wiener Schulgesetzes')])).toBe(1)
    expect(wienTguStart([page('Erläuterungen'), page('Textgegenüberstellung')])).toBe(1)
  })

  it('takes the template\'s header pair where the title is missing, and nothing else', () => {
    expect(wienTguStart([page('Entwurf'), page('Geltende Fassung', 'Vorgeschlagene Fassung')])).toBe(1)
    expect(wienTguStart([page('Geltende Fassung'), page('Die Textgegenüberstellungen folgen.')])).toBe(-1)
  })
})
