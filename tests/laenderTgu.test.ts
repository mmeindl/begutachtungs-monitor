import { describe, expect, it } from 'vitest'
import { draftNameOf, kaerntenDated, readableLawName, tirolDated, wienTguStart } from '../server/utils/laender/landTguService'
import { parseAnnexPdf, type AnnexItem, type AnnexPage } from '../server/utils/annex/annexPdf'
import { amendedLawOf, amendedLawsOf, columnParagraphs, draftDeletes, joinLines, mergeParagraphs, onlyElided, onlyListed, packageArticles, renumberingsOf, searchPhrase, shareInRis, STANDS_IN_RIS, standsInRis, tguLines, tguParagraphs, tguUnits, withHeadings, withRenumberings, type Renumbering, type TguLine, type TguPage, type TguParagraph } from '../server/utils/laender/landTgu'

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

  it('gives a hyphen that breaks a word at the line\'s end the marks of that word (Oö. 2026-16120, 2023-16043)', () => {
    // „Gleichbehandlungs-" struck, the rule stopping short of its hyphen.
    const struck = 'Stelle;die Gleichbehandlungs-'
    const [a] = tguLines({ items: [run(struck, 0, 100)], rules: [rule(0, 100, 7, 28, 'strike')], glyphs: glyphsOf(struck) })
    expect(a).toMatchObject({ old: 'Stelle;die Gleichbehandlungs-', neu: 'Stelle;' })
    // „Leichenbe-" struck, its hyphen underlined.
    const underlined = 'von Leichenbe-'
    const [b] = tguLines({ items: [run(underlined, 0, 100)], rules: [rule(0, 100, 4, 13, 'strike'), rule(0, 100, 13, 14, 'under')], glyphs: glyphsOf(underlined) })
    expect(b).toMatchObject({ old: 'von Leichenbe-', neu: 'von' })
    // A dash after a space is no word's.
    const dash = 'neu -'
    const [c] = tguLines({ items: [run(dash, 0, 100)], rules: [rule(0, 100, 0, 3, 'under')], glyphs: glyphsOf(dash) })
    expect(c).toMatchObject({ old: '-', neu: 'neu -' })
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

  it('lists only the laws a draft amends where it also enacts or repeals one (26.10.2026)', () => {
    // „… geändert, das … aufgehoben und das … erlassen werden": none at all until then (Salzburg 18161).
    expect(amendedLawsOf('Gesetz, mit dem das Salzburger Landeswappengesetz 1989 und das Jagdgesetz 1993 geändert, das Salzburger Landwirtschafts-Materialseilbahngesetz aufgehoben und das Salzburger Motorschlittengesetz 2016 erlassen werden'))
      .toEqual(['Salzburger Landeswappengesetz 1989', 'Jagdgesetz 1993'])
    // „… erlassen und das … aufgehoben sowie das …": the enacted and the repealed law lumped in until then (Kärnten 1082/2019).
    expect(amendedLawsOf('Gesetz, mit dem das Gesetz über die Pflege (Kärntner Pflegegesetz – K-PG) erlassen und das Kärntner Mindestsicherungsgesetz aufgehoben sowie das Kärntner Bestattungsgesetz und das Kärntner Chancengleichheitsgesetz geändert werden'))
      .toEqual(['Kärntner Bestattungsgesetz', 'Kärntner Chancengleichheitsgesetz'])
    expect(amendedLawsOf('Landesgesetz, mit dem das Oö. Tourismusgesetz 2018 geändert und das Oö. Campingplatzgesetz aufgehoben werden')).toEqual(['Oö. Tourismusgesetz 2018'])
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

describe('packageArticles — a package\'s laws, each read on its own (26.10.2026)', () => {
  const PACKAGE = 'Gesetz, mit dem das Landesbeamten-Pensionsgesetz und das Salzburger Bezügegesetz 1992 geändert werden'
  const LAWS = amendedLawsOf(PACKAGE)
  const TEXT = 'Der Salzburger Landtag hat beschlossen: Artikel V Das Landesbeamten-Pensionsgesetz, LGBl Nr 17/2001, zuletzt geändert durch das Gesetz LGBl Nr 140/2020, wird geändert wie folgt: 1. Im § 25 wird nach Abs 4a eingefügt: „(4b) Neu.“ Artikel VI Das Salzburger Bezügegesetz 1992, LGBl Nr 67/1992, zuletzt geändert durch das Gesetz LGBl Nr 22/2020, wird geändert wie folgt: 1. Im § 25 wird angefügt: „(20) Neu.“'

  it('reads each Artikel with the law its instructions amend, under the name the title gives it', () => {
    expect(packageArticles(TEXT, LAWS).map((a) => [a.number, a.numeral, a.key])).toEqual([['Artikel V', 'V', 'Landesbeamten-Pensionsgesetz'], ['Artikel VI', 'VI', 'Salzburger Bezügegesetz 1992']])
  })

  it('gives none for one law, or where no Artikel heads the instructions', () => {
    expect(packageArticles('Das Salzburger Bezügegesetz 1992, LGBl Nr 67/1992, wird geändert wie folgt: 1. Im § 25 wird angefügt: „(20) Neu.“', ['Salzburger Bezügegesetz 1992'])).toEqual([])
    expect(packageArticles(TEXT.replace(/Artikel [VI]+ /g, ''), LAWS)).toEqual([])
  })

  /** Salzburg's layout: the Artikel and the law centred across both columns, each § with its heading over it in both. */
  const at = (x: number, y: number, text: string): AnnexItem => ({ x, y, width: text.length * 5, text })
  const across = (y: number, text: string): AnnexItem => ({ x: 300, y, width: 260, text })
  const both = (y: number, left: string, right = left) => [at(60, y, left), at(470, y, right)]
  /** A heading, centred in each column as Salzburg sets it. */
  const centred = (y: number, text: string) => [at(230 - text.length * 2.5, y, text), at(640 - text.length * 2.5, y, text)]
  const page = (items: AnnexItem[]): AnnexPage => ({ width: 842, items, geometry: { runs: items.length, offTurn: 0, skewed: 0 } })
  const DOCUMENT = [page([
    ...both(800, 'Geltende Fassung', 'Vorgeschlagene Fassung'),
    across(760, 'Artikel V'),
    across(740, 'Änderungen des Landesbeamten-Pensionsgesetzes'),
    ...centred(720, 'Waisenversorgungsbezug'),
    ...centred(700, '§ 25.'),
    ...both(680, '(1) bis (4a)'),
    at(470, 660, '(4b) Besucht das Kind eine Einrichtung, gilt Abs 3 nur bei'),
    at(470, 645, 'ernsthaftem Studium.'),
    across(620, 'Artikel VI'),
    across(600, 'Änderungen des Salzburger Bezügegesetzes 1992'),
    ...centred(580, 'Inkrafttreten und Übergang'),
    ...centred(560, '§ 25.'),
    ...both(540, '(1) bis (19)'),
    at(470, 520, '(20) Neu.'),
  ])]

  // Salzburg 23522: read as one law, each column kept the longer of its two
  // § 25 — the Bezügegesetz's in force beside the Pensionsgesetz's new text.
  it('keeps two laws\' § 25 apart, each with its own two columns (Salzburg 23522)', () => {
    const rows = parseAnnexPdf(DOCUMENT, packageArticles(TEXT, LAWS)).rows.filter((r) => r.kind === 'pair')
    const paras = columnParagraphs(rows.map((r) => ({ kind: r.kind, law: r.law, heading: r.heading, para: r.para, current: r.current, proposed: r.proposed, changed: r.change !== 'unchanged' })), LAWS)
    expect(paras.map((p) => [p.law, p.number, p.old.at(-1), p.neu.at(-1)])).toEqual([
      ['Landesbeamten-Pensionsgesetz', '25', '(1) bis (4a)', '(1) bis (4a) (4b) Besucht das Kind eine Einrichtung, gilt Abs 3 nur bei ernsthaftem Studium.'],
      ['Salzburger Bezügegesetz 1992', '25', '(1) bis (19)', '(1) bis (19) (20) Neu.'],
    ])
    // Without the Artikel, the reader's one § 25 crosses the two laws.
    const crossed = parseAnnexPdf(DOCUMENT).rows.filter((r) => r.kind === 'pair')
    expect(crossed).toHaveLength(1)
    expect(crossed[0]!.current).toContain('(1) bis (19)')
    expect(crossed[0]!.proposed).toContain('(4b) Besucht')
  })
})

describe('renumberingsOf — the renumberings a draft orders in its own text (26.10.2026)', () => {
  const PACKAGE = ['S.EU-Rechtsvorschriften-Begleitgesetz', 'Salzburger Landeselektrizitätsgesetz 1999']

  it('reads one move, each sentence once, with the law whose instructions it stands among (Salzburg 32025)', () => {
    const text = 'Artikel I Das S.EU-Rechtsvorschriften-Begleitgesetz, LGBl Nr 35/2019, zuletzt geändert durch das Gesetz LGBl Nr 114/2022, wird geändert wie folgt: 1. § 1 lautet: … Artikel II Das Salzburger Landeselektrizitätsgesetz 1999, LGBl Nr 75/1999, zuletzt geändert durch das Gesetz LGBl Nr 14/2024, wird geändert wie folgt: 4. Der bisherige § 54a erhält die Paragraphenbezeichnung „§ 54b“ und lautet: … Zu Z 4: Der bisherige § 54a erhält die Paragraphenbezeichnung „§ 54b“.'
    expect(renumberingsOf(text, PACKAGE)).toEqual([
      { sentence: 'Der bisherige § 54a erhält die Paragraphenbezeichnung „§ 54b“', law: 'Salzburger Landeselektrizitätsgesetz 1999', moves: [{ from: '54a', to: '54b' }], spans: [] },
    ])
    // In a package, a sentence before any law's instructions is no law's.
    expect(renumberingsOf('Der bisherige § 5 erhält die Bezeichnung „§ 6“.', PACKAGE)[0]!.law).toBeNull()
    expect(renumberingsOf('In § 25 Abs 2 erfolgte eine Umnummerierung der lit g.', PACKAGE)).toEqual([])
  })

  it('pairs a list and a stretch one by one, a word the line broke joined again (Salzburg 18554)', () => {
    const text = '6. Die §§ 17, 18 und 20 bis 28 entfallen; die §§ 19 und 29 bis 34 erhalten die Paragraphenbe- zeichnungen „§ 17“ bis „§ 23“. 7. Die §§ 35 und 36 entfallen; die §§ 37 und 38 erhalten die Paragraphenbezeichnungen „§ 24“ bzw „§ 25“.'
    const [stretch, list] = renumberingsOf(text, ['Salzburger Abfallwirtschaftsgesetz 1998'])
    expect(stretch!.sentence).toBe('Die §§ 19 und 29 bis 34 erhalten die Paragraphenbezeichnungen „§ 17“ bis „§ 23“')
    expect(stretch!.moves.map((m) => `${m.from}>${m.to}`)).toEqual(['19>17', '29>18', '30>19', '31>20', '32>21', '33>22', '34>23'])
    expect(stretch!.spans).toEqual([[29, 34], [17, 23]])
    expect(list!.moves).toEqual([{ from: '37', to: '24' }, { from: '38', to: '25' }])
  })

  it('reads the verb first, after another renumbering (Salzburg 19504)', () => {
    const text = '18. Die bisherige Abschnittsbezeichnung „IIIa“ erhält die Abschnittsbezeichnung „IIIb“ und erhalten die bisherigen §§ 15a und 15b die Paragraphenbezeichnungen „§ 15b“ und „§ 15c“.'
    const [r] = renumberingsOf(text, ['Salzburger Behindertengesetz 1981'])
    expect(r!.sentence).toBe('Die bisherige Abschnittsbezeichnung „IIIa“ erhält die Abschnittsbezeichnung „IIIb“ und erhalten die bisherigen §§ 15a und 15b die Paragraphenbezeichnungen „§ 15b“ und „§ 15c“')
    expect(r!.moves).toEqual([{ from: '15a', to: '15b' }, { from: '15b', to: '15c' }])
  })

  it('pairs none where a stretch runs between lettered §§ or the counts differ', () => {
    expect(renumberingsOf('Die §§ 8c bis 8e erhalten die Paragraphenbezeichnungen „§ 8d“ bis „§ 8f“.', ['G'])[0]!.moves).toEqual([])
    expect(renumberingsOf('Die §§ 3 und 4 erhalten die Paragraphenbezeichnungen „§ 5“ bis „§ 7“.', ['G'])[0]!.moves).toEqual([])
  })
})

describe('withRenumberings — a renumbering the draft orders, read into two columns (26.10.2026)', () => {
  const LAW = 'Salzburger Landeselektrizitätsgesetz 1999'
  const p = (number: string, old: string[], neu: string[], law: string | null = null): TguParagraph => ({ law, number, old, neu, changed: true })
  const moves = (sentence: string, pairs: [string, string][], over: Partial<Renumbering> = {}): Renumbering => ({ sentence, law: LAW, moves: pairs.map(([from, to]) => ({ from, to })), spans: [], ...over })
  const view = (ps: TguParagraph[]) => ps.map((x) => `${x.from ? `${x.from}>` : ''}${x.number}:${x.old.join('|')}/${x.neu.join('|')}`)

  it('makes the § in force and the same § under its new number one entry, and leaves the new § under the old number its own (32025)', () => {
    const got = withRenumberings([p('54a', ['Erdverkabelung (1) Alt.'], ['Anschlussleitungen (1) Neu.']), p('54b', [], ['Erdverkabelung (1) Alt.'])], [moves('§ 54a → § 54b', [['54a', '54b']])])
    expect(view(got.paragraphs)).toEqual(['54a:/Anschlussleitungen (1) Neu.', '54a>54b:Erdverkabelung (1) Alt./Erdverkabelung (1) Alt.'])
    // Under the law the document files it under — here none, and RIS decides.
    expect(got.paragraphs[1]!.law).toBeNull()
    expect(got.unmapped).toEqual([])
  })

  it('follows a chain one move at a time (32075: § 8c → § 8d → § 8e → § 8f)', () => {
    const got = withRenumberings([
      p('8c', ['Konformität'], ['Ökodesign (1) Neu.']),
      p('8d', ['CE-Kennzeichnung'], ['Konformität']),
      p('8e', ['Unterrichtung'], ['CE-Kennzeichnung']),
      p('8f', [], ['Unterrichtung']),
    ], [moves('a', [['8c', '8d']]), moves('b', [['8d', '8e']]), moves('c', [['8e', '8f']])])
    expect(view(got.paragraphs)).toEqual(['8c:/Ökodesign (1) Neu.', '8c>8d:Konformität/Konformität', '8d>8e:CE-Kennzeichnung/CE-Kennzeichnung', '8e>8f:Unterrichtung/Unterrichtung'])
    expect(got.unmapped).toEqual([])
  })

  it('pairs nothing the document does not print, and says so (26924: § 17 → § 19, no § 19 printed)', () => {
    const paragraphs = [p('16', ['Alt 16'], ['Neu 16']), p('17', ['Alt 17'], ['Neu 17']), p('18', [], ['Alt 16'])]
    const got = withRenumberings(paragraphs, [moves('§ 16 → § 18', [['16', '18']]), moves('§ 17 → § 19', [['17', '19']])])
    expect(view(got.paragraphs)).toEqual(['16:/Neu 16', '17:Alt 17/Neu 17', '16>18:Alt 16/Alt 16'])
    expect(got.unmapped).toEqual(['§ 17 → § 19'])
  })

  it('pairs nothing where another law\'s §, a second entry, a lettered § in the stretch or another move could be meant', () => {
    const otherLaw = withRenumberings([p('5', ['A'], ['B'], 'Anderes Gesetz'), p('6', [], ['A'], 'Anderes Gesetz')], [moves('s', [['5', '6']])])
    expect(otherLaw.unmapped).toEqual(['s'])
    expect(otherLaw.paragraphs.every((x) => !x.from)).toBe(true)
    expect(withRenumberings([p('5', ['A'], ['B']), p('5', ['C'], []), p('6', [], ['A'])], [moves('s', [['5', '6']])]).unmapped).toEqual(['s'])
    expect(withRenumberings([p('29', ['A'], []), p('30a', ['X'], []), p('17', [], ['A'])], [moves('s', [['29', '17']], { spans: [[29, 34]] })]).unmapped).toEqual(['s'])
    expect(withRenumberings([p('5', ['A'], []), p('6', [], ['A']), p('7', [], ['A'])], [moves('s', [['5', '6']]), moves('t', [['5', '7']])]).unmapped).toEqual(['s', 't'])
    expect(withRenumberings([p('5', ['A'], []), p('6', [], ['A'])], [moves('s', [['5', '6']], { law: null })]).unmapped).toEqual(['s'])
  })
})

describe('finding a § by its own words', () => {
  it('takes eight plain words past the heading, from the longest stretch', () => {
    expect(searchPhrase('Hilfeleistungen (1) bis (2) … (3) Als Hilfeleistungen nach diesem Gesetz kommen in Betracht die Eingliederungshilfe und die Pflege.'))
      .toBe('Hilfeleistungen nach diesem Gesetz kommen in Betracht die')
    expect(searchPhrase('§ 3 Abs 1 Z 2 lit a')).toBeNull()
  })

  it('knows a § the document only lists, by the same few words on both sides (Salzburg 32075)', () => {
    expect(onlyListed({ old: ['Konformitätsbewertung und -erklärung'], neu: ['Konformitätsbewertung und -erklärung'] })).toBe(true)
    expect(onlyListed({ old: ['Fahrtkostenzuschuss'], neu: ['Fahrtkostenzuschuss', '(1) bis (9) (10) Neu.'] })).toBe(false)
    expect(onlyListed({ old: ['Begriffe (1) Begriffe sind so zu verstehen.'], neu: ['Begriffe (1) Begriffe sind so zu verstehen.'] })).toBe(false)
    expect(onlyListed({ old: [], neu: [] })).toBe(false)
  })

  it('takes an omission Salzburg prints without its „…" as one, and an Absatz\'s own „bis" or „und" not (26.10.2026)', () => {
    expect(onlyElided('Allgemeines (1) bis (5)')).toBe(true)
    expect(onlyElided('(3) bis (7)')).toBe(true)
    expect(onlyElided('(1) und (2)')).toBe(true)
    expect(onlyElided('(1) bis (4a)')).toBe(true)
    expect(onlyElided('(3) bis zum 31. Dezember 2025 gelten die bisherigen Bestimmungen weiter.')).toBe(false)
    expect(onlyElided('(3) Bis zum Ablauf des Jahres gelten die bisherigen Bestimmungen weiter.')).toBe(false)
    const ris = '<nutzdaten>Kostenbeiträge § 62. (1) Eins. (2) Zwei. (3) Drei. (4) Vier. (5) Fünf. (6) Die Kostenbeiträge gemäß Abs. 1, 3 und 4 sind für jedes Jahr neu festzusetzen.</nutzdaten>'
    // The stretch after the omission is what RIS checks; before, the bare „(1) bis (5)" counted as words of the text.
    expect(standsInRis('Kostenbeiträge (1) bis (5) (6) Die Kostenbeiträge gemäß Abs. 1, 3 und 4 sind für jedes Jahr neu festzusetzen.', ris)).toBe(true)
    expect(standsInRis('Kostenbeiträge (1) bis (5) (6) Die Kostenbeiträge gemäß Abs. 1, 3 und 4 sind für jedes Jahr anders festzusetzen.', ris)).toBe(false)
    // „die Absätze (1) und (2) gelten …": words of the Absatz, not an omission.
    expect(onlyElided('(4) Die Absätze (1) und (2) gelten sinngemäß.')).toBe(false)
    // „(1) und (2) …" is one omission: the heading before it stands in RIS whole (Salzburg 18750, § 54).
    const heading = '<nutzdaten>Leistungsbeurteilung für eine Schulstufe, Feststellungs- und Nachtragsprüfung § 54 (1) Eins. (2) Zwei.</nutzdaten>'
    expect(standsInRis('Leistungsbeurteilung für eine Schulstufe, Feststellungs- und Nachtragsprüfung (1) und (2) ...', heading)).toBe(true)
    expect(onlyElided('Leistungsbeurteilung (1) und (2) …')).toBe(true)
    expect(searchPhrase('Kostenbeiträge (1) bis (5) (6) Die Kostenbeiträge gemäß den Bestimmungen dieses Gesetzes sind jedes Jahr festzusetzen.')).toBe('Kostenbeiträge gemäß den Bestimmungen dieses Gesetzes sind jedes')
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
