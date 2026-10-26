import { describe, expect, it } from 'vitest'
import { draftNameOf, kaerntenDated, readableLawName, tirolDated, wienTguStart } from '../server/utils/laender/landTguService'
import { amendedLawOf, amendedLawsOf, columnParagraphs, draftDeletes, joinLines, mergeParagraphs, onlyElided, searchPhrase, shareInRis, STANDS_IN_RIS, standsInRis, tguLines, tguParagraphs, tguUnits, withHeadings, type TguLine, type TguPage } from '../server/utils/laender/landTgu'

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

describe('tguParagraphs — units the reader lost until 26.10.2026', () => {
  const law = line('Oö. Gemeindeordnung 1990 (Oö. GemO 1990)')
  const ins = (raw: string): TguLine => ({ raw, old: '', neu: raw, marked: true })
  const del = (raw: string): TguLine => ({ raw, old: raw, neu: '', marked: true })

  it('opens a § printed with the opening quote of the draft, and leaves the closing quote out (2025-16106, § 65)', () => {
    const paras = tguParagraphs([law, line('4. Abschnitt'), ins('„§ 65'), ins('Urkunden'), ins('(1) Urkunden sind zu unterfertigen.“')])
    expect(paras).toEqual([{ law: 'Oö. Gemeindeordnung 1990', number: '65', old: [], neu: ['Urkunden', '(1) Urkunden sind zu unterfertigen.'], changed: true }])
  })

  it('leaves a § the text quotes after an instruction in the § that quotes it (2025-16094, § 5 of the Oö. Gemeindesanitätsdienstgesetz 2006)', () => {
    const paras = tguParagraphs([law, line('§ 5'), line('(4) § 42 bleibt mit der Maßgabe aufrecht, dass'), ins('1. § 16 lautet:'), ins('„§ 16'), ins('Geheimhaltung'), ins('Die Verpflichtung besteht auch danach.“')])
    expect(paras.map((p) => [p.number, p.neu])).toEqual([['5', ['(4) § 42 bleibt mit der Maßgabe aufrecht, dass', '1. § 16 lautet:', '„§ 16', 'Geheimhaltung', 'Die Verpflichtung besteht auch danach.“']]])
  })

  it('reads an Artikel of a law organised in Artikel as a unit of its own (2025-16094, Art. 46a)', () => {
    const paras = tguParagraphs([line('Oö. Landes-Verfassungsgesetz (Oö. L-VG)'), line('Artikel 46'), line('Amtsverschwiegenheit'), line('(1) Text.'), ins('Artikel 46a'), ins('Die Mitglieder sind verpflichtet.')])
    expect(paras.map((p) => [p.number, p.old, p.neu, p.changed])).toEqual([
      ['Art. 46', ['Amtsverschwiegenheit', '(1) Text.'], ['Amtsverschwiegenheit', '(1) Text.'], false],
      ['Art. 46a', [], ['Die Mitglieder sind verpflichtet.'], true],
    ])
  })

  it('reads a renumbered § as one § from its old number to its new, beside the § it replaces under that number (2026-16120; 26.10.2026)', () => {
    const paras = mergeParagraphs(tguParagraphs([
      law,
      del('§ 10'), del('Rechtsstellung der Mitglieder'), del('(1) Ehrenamtlich.'),
      { raw: '§ 10§ 14', old: '§ 14', neu: '§ 10', marked: true },
      line('Geschäftsordnung'),
      { raw: '(1) Die Geschäftsordnung gilt alt.', old: '(1) Die Geschäftsordnung gilt alt.', neu: '(1) Die Geschäftsordnung gilt.', marked: true },
    ]))
    // Read by number until then: § 10 compared the struck § 10 with § 14's text, and § 14 read as „entfallen".
    expect(paras.map((p) => [p.from ?? null, p.number, p.old, p.neu])).toEqual([
      [null, '10', ['Rechtsstellung der Mitglieder', '(1) Ehrenamtlich.'], []],
      ['14', '10', ['Geschäftsordnung', '(1) Die Geschäftsordnung gilt alt.'], ['Geschäftsordnung', '(1) Die Geschäftsordnung gilt.']],
    ])
    // Compared with itself: the unit in force under its old number, the new one under its new, paired.
    const { from, to } = tguUnits(paras.slice(1))
    expect([from[0]!.id, to[0]!.id, from[0]!.heading === to[0]!.heading]).toEqual(['§14', '§10', true])
  })

  it('names both numbers of a renumbered § as unsure where the marks do not say which is which', () => {
    const paras = tguParagraphs([law, { raw: '§ 61§ 57d', old: '§ 61§ 57d', neu: '§ 61§ 57d', marked: true }, line('(1) Text.')])
    expect(paras.map((p) => [p.number, p.unread, p.because])).toEqual([['61', true, 'unsure'], ['57d', true, 'unsure']])
    // Where one side reads as one number, the other number on the line is the other side's.
    const known = tguParagraphs([law, { raw: '§ 61§ 57d', old: '§ 57d', neu: '§ 61§ 57d', marked: true }, line('(1) Text.')])
    expect(known.map((p) => [p.from, p.number, p.old, p.neu])).toEqual([['57d', '61', ['(1) Text.'], ['(1) Text.']]])
  })

  it('closes a § at an Anlage, names the Anlage where it is changed, and passes over one it prints unchanged (2026-16111)', () => {
    const paras = tguParagraphs([
      law, line('§ 88'), line('(1) Schluss.'),
      del('Anlage 1'), del('CE-Konformitätskennzeichnung'), del('Die Kennzeichnung besteht aus den Buchstaben.'),
      line('Anlage 2'), line('Einbauzeichen'),
    ])
    expect(paras.map((p) => [p.number, p.old, p.unread ?? false, p.because ?? null])).toEqual([
      ['88', ['(1) Schluss.'], false, null],
      ['Anlage 1', ['CE-Konformitätskennzeichnung', 'Die Kennzeichnung besteht aus den Buchstaben.'], true, 'annex'],
    ])
  })

  it('opens no Anlage where a sentence the column wrapped goes on in it', () => {
    const paras = tguParagraphs([law, line('§ 5'), ins('(1) Die Form ergibt sich aus der'), ins('Anlage 1'), ins('zu diesem Gesetz.')])
    expect(paras.map((p) => [p.number, p.neu])).toEqual([['5', ['(1) Die Form ergibt sich aus der', 'Anlage 1', 'zu diesem Gesetz.']]])
  })

  it('opens nothing at a contents entry of an Anlage, which carries its title in brackets', () => {
    const paras = tguParagraphs([law, line('Inhaltsverzeichnis'), ins('Anlage 1 (CE-Konformitätskennzeichnung)'), line('§ 1'), line('(1) Text.')])
    expect(paras.map((p) => p.number)).toEqual(['1'])
  })

  it('does not close a § at a definition that begins like a division, and does close it at „7b. Abschnitt"', () => {
    const paras = tguParagraphs([
      law, line('§ 2'), line('18. Grenzwerte: Werte;'), line('19. Teil-Aktionsplan: Plan zur Regelung;'), line('IV. Teil, 4. Hauptstück, nach Inhalt gleichwertig;'), line('20. Beste verfügbare Techniken.'),
      line('7b. Abschnitt'), line('Umsetzung'), line('§ 3'), line('(1) Text.'),
    ])
    expect(paras[0]!.old).toEqual(['18. Grenzwerte: Werte;', '19. Teil-Aktionsplan: Plan zur Regelung;', 'IV. Teil, 4. Hauptstück, nach Inhalt gleichwertig;', '20. Beste verfügbare Techniken.'])
    expect(paras[1]!.old).toEqual(['(1) Text.'])
  })
})

describe('tguParagraphs — headings the draft changes (26.10.2026)', () => {
  const law = line('Oö. Gemeindeordnung 1990 (Oö. GemO 1990)')
  const ins = (raw: string): TguLine => ({ raw, old: '', neu: raw, marked: true })
  const del = (raw: string): TguLine => ({ raw, old: raw, neu: '', marked: true })

  it('hands a division heading the draft changes to the § below it on each side, and leaves an unchanged one out (2023-16060, 2026-16120)', () => {
    const paras = mergeParagraphs(tguParagraphs([
      law,
      line('1. Abschnitt'), line('Allgemeines'), line('§ 1'), line('(1) Text.'),
      del('4. Abschnitt'), del('Ehrungen'), ins('4. Abschnitt'), ins('Datenverarbeitungen'),
      line('§ 26'), line('(1) Daten.'),
      ins('5. Abschnitt'), ins('Neues'), ins('§ 27'), ins('(1) Neu.'),
    ]))
    expect(paras.map((p) => [p.number, p.division ?? null, p.changed])).toEqual([
      ['1', null, false],
      ['26', { old: '4. Abschnitt Ehrungen', neu: '4. Abschnitt Datenverarbeitungen' }, true],
      ['27', { neu: '5. Abschnitt Neues' }, true],
    ])
    // Not what RIS checks: the text in force stays the §'s own.
    expect(paras[1]!.old).toEqual(['(1) Daten.'])
    // Shown with the §, on the line of its first words.
    const { from, to } = tguUnits(paras.slice(1, 2))
    expect([from[0]!.text, to[0]!.text]).toEqual(['4. Abschnitt Ehrungen (1) Daten.', '4. Abschnitt Datenverarbeitungen (1) Daten.'])
  })

  it('keeps a struck division heading for the next § that stands on its side', () => {
    const paras = mergeParagraphs(tguParagraphs([law, del('5. Abschnitt'), del('Alt'), ins('§ 7'), ins('(1) Neu.'), del('§ 8'), del('(1) Alt.')]))
    expect(paras.map((p) => [p.number, p.division ?? null])).toEqual([['7', null], ['8', { old: '5. Abschnitt Alt' }]])
  })

  it('reads a renumbered division as a division, not as the § above it, „5. Abschnitt6.Abschnitt" (2026-16120)', () => {
    const paras = mergeParagraphs(tguParagraphs([law, line('§ 8'), line('(1) Text.'), { raw: '5. Abschnitt6.Abschnitt', old: '6.Abschnitt', neu: '5. Abschnitt', marked: true }, line('Ausbildung'), line('§ 9'), line('(1) Mehr.')]))
    expect(paras.map((p) => [p.number, p.old, p.division ?? null])).toEqual([
      ['8', ['(1) Text.'], null],
      ['9', ['(1) Mehr.'], { old: '6.Abschnitt Ausbildung', neu: '5. Abschnitt Ausbildung' }],
    ])
  })

  it('hands no division heading of the contents to a §', () => {
    const paras = tguParagraphs([law, line('Inhaltsverzeichnis'), ins('4. Abschnitt'), ins('Neu'), line('§ 24 Ehrungen'), line('4. Abschnitt'), line('Ehrungen'), line('§ 24'), line('(1) Text.')])
    expect(paras.map((p) => [p.number, p.division ?? null])).toEqual([['24', null]])
  })

  it('names a law title the draft changes once, under the law its §§ go under (2026-16118)', () => {
    const paras = tguParagraphs([
      ins('Landesgesetz'), ins('betreffend die Chancengleichheit von Menschen mit Behinderungen'), ins('(Oö. Chancengleichheitsgesetz - Oö. ChG)'),
      del('Landesgesetz betreffend die Chancengleichheit von Menschen'), del('mit Beeinträchtigungen (Oö. Chancengleichheitsgesetz - Oö. ChG)'),
      line('§ 1'), line('(1) Text.'),
    ])
    expect(paras.map((p) => [p.law, p.number, p.unread ?? false, p.because ?? null])).toEqual([
      ['Oö. Chancengleichheitsgesetz', 'Titel', true, 'title'],
      ['Oö. Chancengleichheitsgesetz', '1', false, null],
    ])
    expect(tguParagraphs([law, line('§ 1'), line('(1) Text.')]).map((p) => p.number)).toEqual(['1'])
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

  it('says where a renumbered § comes from although the document prints no text of it in force (2021-16019, § 61 → § 83)', () => {
    const paras = [{ law: 'G', number: '83', from: '61', old: [], neu: ['Verweise', '(1) Neu.'], changed: true }]
    const { from, to } = tguUnits(paras)
    expect(from).toEqual([])
    expect(withHeadings([{ ...to[0]!, article: 'G', fromId: null }], paras)[0]).toMatchObject({ id: '§83', fromId: '§61', heading: 'Verweise' })
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
  it('finds an article under its heading although RIS prints its designation in between (26.10.2026)', () => {
    expect(shareInRis('Landtag (1) Der Landtag besteht aus Abgeordneten.', '<nutzdaten>Landtag Art. 19 (1) Der Landtag besteht aus Abgeordneten.</nutzdaten>')).toBe(1)
  })
  it('keeps an article cited in a §\'s text, where RIS writes it „Art. 5" and the document „Art 5" (Salzburg 20708, § 13)', () => {
    const body = 'Zur sachgemäßen Ausübung der Fischerei, des Fischens, zur Abwehr von Fischereischäden und im Rahmen notwendiger wiederkehrender Fischbestandsuntersuchungen nach ART 5 und 8 oder eines Maßnahmenprogramms der Wasserrahmenrichtlinie sind der Bewirtschafter eines Fischwassers, dessen Mitarbeiter, die Fischereiausübungsberechtigten, die Fischereischutzorgane sowie die von der Behörde beauftragten Sachverständigen berechtigt, Grundstücke zu betreten und zu benützen, soweit dies unbedingt erforderlich ist.'
    // Taken out of RIS's text alone, the article's two words cost the § its place in the law (0,97).
    expect(shareInRis(`Benutzung von Grundstücken ${body.replace('ART', 'Art')}`, `<nutzdaten>Benutzung von Grundstücken § 13 ${body.replace('ART', 'Art.')}</nutzdaten>`)).toBeGreaterThanOrEqual(STANDS_IN_RIS)
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

  it('reads an article of a Novelle among the laws as one item, its own „geändert wird" included (Kärnten 842/2022, 227/2022; 26.10.2026)', () => {
    expect(amendedLawsOf('Gesetz, mit dem die Kärntner Landesverfassung, das Kärntner Schulbaufondsgesetz, Art. II des Gesetzes, mit dem das Kärntner Schulbaufondsgesetz geändert wird, das Kärntner Landesrechnungshofgesetz 1996, das Kärntner Regionalfondsgesetz und das Kärntner Schulgesetz geändert werden'))
      .toEqual(['Kärntner Landesverfassung', 'Kärntner Schulbaufondsgesetz', 'Art. II des Gesetzes, mit dem das Kärntner Schulbaufondsgesetz geändert wird', 'Kärntner Landesrechnungshofgesetz 1996', 'Kärntner Regionalfondsgesetz', 'Kärntner Schulgesetz'])
    expect(amendedLawsOf('Gesetz, mit dem das Kärntner Wohnbauförderungsgesetz 2017, Artikel II des Gesetzes LGBl. Nr. 93/2019 und Artikel II des Gesetzes LGBl. Nr. 99/2021 geändert werden'))
      .toEqual(['Kärntner Wohnbauförderungsgesetz 2017', 'Artikel II des Gesetzes LGBl. Nr. 93/2019', 'Artikel II des Gesetzes LGBl. Nr. 99/2021'])
  })

  it('files §§ under the law whose name heads them in a package', () => {
    const paras = columnParagraphs([
      { kind: 'pair', law: null, heading: 'Landesbeamten-Pensionsgesetz', para: '§ 37o.', current: '', proposed: '§ 37o. (1) Neu.', changed: true },
      { kind: 'pair', law: null, heading: 'Salzburger Objektivierungsgesetz 2017 Ausschreibung', para: '§ 3.', current: '(1) Alt.', proposed: '(1) Neu.', changed: true },
    ], ['Landesbeamten-Pensionsgesetz', 'Salzburger Objektivierungsgesetz 2017'])
    expect(paras.map((p) => [p.law, p.number])).toEqual([['Landesbeamten-Pensionsgesetz', '37o'], ['Salzburger Objektivierungsgesetz 2017', '3']])
  })

  it('names a changed annex row, and passes over one whose columns differ only by what stood in front of it (Salzburg, 26.10.2026)', () => {
    const paras = columnParagraphs([
      { kind: 'pair', law: null, para: '§ 76.', current: '§ 76. (1) Alt.', proposed: '§ 76. (1) Neu.', changed: true },
      { kind: 'pair', law: null, para: 'Anlage 1', current: '(1) bis (11) Anlage 1 EB 12 - - -', proposed: 'Anlage 1 EB 12 6.705,10 7.139,40 7.573,81', changed: true },
      { kind: 'pair', law: null, para: 'Anlage 2', current: '(1) bis (6) Anlage 2', proposed: 'Anlage 2', changed: true },
    ], ['Salzburger Vertragsbedienstetengesetz'])
    expect(paras.map((p) => [p.number, p.unread ?? false, p.because ?? null])).toEqual([['76', false, null], ['Anlage 1', true, 'annex']])
  })

  it('names the § above a row that is a cut-off piece of it as unsure, and opens no unit for the piece (Salzburg 18121)', () => {
    const paras = columnParagraphs([
      { kind: 'pair', law: null, para: '§ 75.', current: '§ 75. (1) Alt und ganz.', proposed: '§ 75. (1) Sind diese im Sinn der Kriterien nach', changed: true },
      { kind: 'pair', law: null, para: 'Anhang I', current: '', proposed: 'Anhang I Teil 2 und 3 der Verordnung (EG) Nr 1272/2008 einzustufen.', changed: true },
      { kind: 'pair', law: null, para: '§ 76.', current: '§ 76. (1) Alt.', proposed: '§ 76. (1) Neu.', changed: true },
    ], ['Salzburger Land- und Forstarbeitsgesetz'])
    expect(paras.map((p) => [p.number, p.unread ?? false, p.because ?? null])).toEqual([['75', true, 'unsure'], ['76', false, null]])
  })

  it('reads an article row as a unit „Art. N"', () => {
    const paras = columnParagraphs([
      { kind: 'pair', law: null, para: 'Artikel 16', current: 'Artikel 16 Landtag (1) Alt.', proposed: 'Artikel 16 Landtag (1) Neu.', changed: true },
    ], ['Salzburger Landes-Verfassungsgesetz 1999'])
    expect(paras).toEqual([{ law: 'Salzburger Landes-Verfassungsgesetz 1999', number: 'Art. 16', old: ['Landtag (1) Alt.'], neu: ['Landtag (1) Neu.'], changed: true }])
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
