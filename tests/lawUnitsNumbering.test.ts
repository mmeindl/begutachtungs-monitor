import { describe, expect, it } from 'vitest'
import { parseLawUnitsFromRis, segmentUnits, type TextBlock } from '../server/utils/lawtext/lawUnits'

const blk = (kind: TextBlock['kind'], text: string, gld: string | null = null): TextBlock => ({ kind, cls: '', text, gld })
const clause = blk('other', 'Das Testgesetz, BGBl. I Nr. 1/2000, wird wie folgt geändert:')
const ids = (blocks: TextBlock[]) => segmentUnits(blocks).map((u) => u.id)
const unit = (blocks: TextBlock[], id: string) => segmentUnits(blocks).find((u) => u.id === id)

// BGBl. I Nr. 8/2026 Art. 3 (BVergGVS), 546 d.B. (95/ME), 19.11.2026: „25a."
// was read as „25", and the short real Z 25 went out as a table-of-contents
// echo — in no unit, neither applied nor refused.
describe('segmentUnits: a lettered instruction keeps its letter, and the one before it stays', () => {
  it('„25." then „25a.": both units, each with its own line', () => {
    const blocks = [
      blk('article', 'Artikel 3'), clause,
      blk('novao', '24. In § 29 Abs. 1 wird das Wort „alt“ durch das Wort „neu“ ersetzt.'),
      blk('novao', '25. § 30 Abs. 8 entfällt; Abs. 9 erhält die Absatzbezeichnung „(8)“.'),
      blk('novao', '25a. In den §§ 32 Abs. 1 und 33 Abs. 1 wird der Ausdruck „§ 30 Abs. 9“ durch „§ 30 Abs. 8“ ersetzt.'),
      blk('novao', '26. In § 31 wird das Wort „x“ durch das Wort „y“ ersetzt.'),
    ]
    expect(ids(blocks)).toEqual(['Z24', 'Z25', 'Z25a', 'Z26'])
    expect(unit(blocks, 'Z25')!.text).toBe('§ 30 Abs. 8 entfällt; Abs. 9 erhält die Absatzbezeichnung „(8)“.')
    expect(unit(blocks, 'Z25a')!.heading).toMatch(/^In den §§ 32 Abs\. 1 und 33 Abs\. 1 wird/)
  })

  it('a committee run „1." „1a." „1b." loses nothing', () => {
    const blocks = [
      clause,
      blk('novao', '1. In § 6a Abs. 1 wird das Wort „neunmonatige“ durch das Wort „sechsmonatige“ ersetzt.'),
      blk('novao', '1a. In § 7 Abs. 1 Z 2 wird die Zahl „254“ durch die Zahl „257“ ersetzt.'),
      blk('novao', '1b. § 8 lautet:'),
      blk('abs', '„§ 8. Neuer Text."'),
    ]
    expect(ids(blocks)).toEqual(['Z1', 'Z1a', 'Z1b'])
  })

  it('a long „4." before „4a." and „4b." gives three keys, not two „Z4#dup"', () => {
    const blocks = [
      clause,
      blk('novao', '4. § 5 lautet:'),
      blk('abs', '„§ 5. (1) Ein Absatz, lang genug, dass er nie als Echo eines Inhaltsverzeichnisses gelten könnte, und dann noch etwas mehr Text."'),
      blk('novao', '4a. § 5a lautet:'),
      blk('abs', '„§ 5a. Text."'),
      blk('novao', '4b. § 5b entfällt.'),
    ]
    expect(ids(blocks)).toEqual(['Z4', 'Z4a', 'Z4b'])
  })

  it('a plain line after a lettered one still continues the sequence', () => {
    const blocks = [
      clause,
      blk('novao', '25. § 30 entfällt.'),
      blk('novao', '25a. § 30a entfällt.'),
      // RIS tags an instruction as plain text now and then (125/ME): promoted only when it is the next number.
      blk('abs', '26. In § 31 wird das Wort „x“ durch das Wort „y“ ersetzt.'),
    ]
    expect(ids(blocks)).toEqual(['Z25', 'Z25a', 'Z26'])
  })

  it('a sub-instruction „10.1." belongs to instruction 10, at any depth', () => {
    const blocks = [
      clause,
      blk('novao', '10. Im § 27 werden folgende Änderungen vorgenommen:'),
      blk('novao', '10.1. In der Z 1 wird der Ausdruck „57/2008“ durch den Ausdruck „109/2024“ ersetzt.'),
      blk('novao', '10.2. Im Abs 2 werden geändert:'),
      blk('novao', '10.2.1. Nach der Wendung „Inkrafttreten“ wird die Wendung „(§ 29 Abs 1)“ eingefügt.'),
      blk('novao', '11. § 28 entfällt.'),
    ]
    const units = segmentUnits(blocks)
    expect(units.map((u) => u.id)).toEqual(['Z10', 'Z11'])
    expect(units[0]!.blocks.map((b) => b.text.slice(0, 5))).toEqual(['Im § ', '10.1.', '10.2.', '10.2.'])
  })

  it('… also without the closing period, and under a lettered instruction — but only under its own', () => {
    const blocks = [
      clause,
      blk('novao', '21. Im § 46 werden folgende Änderungen vorgenommen:'),
      blk('novao', '21.1 Im Abs 1 wird die Wortfolge „oder einer Hauptschule“ durch die Worte „oder einer Mittelschule“ ersetzt.'),
      blk('novao', '21a. Im § 4 Z 2 werden folgende Änderungen vorgenommen:'),
      blk('novao', '21a.1. In der lit a wird der Strichpunkt durch einen Beistrich ersetzt.'),
      // Under 22, not under 21a: a number of its own.
      blk('novao', '21.2. Im Abs 2 entfällt der letzte Satz.'),
    ]
    expect(segmentUnits(blocks).map((u) => `${u.id}:${u.blocks.length}`)).toEqual(['Z21:2', 'Z21a:2', 'Z21#dup:1'])
  })

  it('a lettered sub-instruction „18.1a." stays in instruction 18 (LGBl. Salzburg, 19.11.2026)', () => {
    const blocks = [
      clause,
      blk('novao', '18. Im § 77b werden folgende Änderungen vorgenommen: 18.1. Im Abs 3 wird nach der Wortfolge „Bau“ das Wort „neu“ eingefügt.'),
      blk('novao', '18.1a. Nach Abs 5 wird eingefügt: „(5a) Die Landesregierung hat die Beträge kundzumachen.“'),
      blk('novao', '18.2. Nach Abs 6 wird eingefügt: „(6a) Eine Abgabenerklärung gilt auch für die Folgejahre.“'),
      blk('novao', '19. § 77c entfällt.'),
    ]
    expect(segmentUnits(blocks).map((u) => `${u.id}:${u.blocks.length}`)).toEqual(['Z18:3', 'Z19:1'])
  })

  it('a § echo from a table of contents is still dropped — it holds no instruction', () => {
    const blocks = [
      blk('abs', 'Anwendungsbereich', '§ 5.'),
      blk('para_head', 'Anwendungsbereich'),
      blk('abs', '(1) Dieses Bundesgesetz gilt für alles, was es regelt, und für nichts sonst, so lange es in Kraft steht.', '§ 5.'),
    ]
    const units = segmentUnits(blocks)
    expect(units.map((u) => u.id)).toEqual(['§5'])
    expect(units[0]!.text).toMatch(/^\(1\) Dieses Bundesgesetz/)
  })
})

// RV 69 d.B. XXVIII amends the VBG 1948 in Artikel 7 and Artikel 11: one
// title, so one key, and Artikel 11's Z 1 pushed Artikel 7's out.
describe('parseLawUnitsFromRis: two Artikel of the same title keep both instructions', () => {
  const doc = (body: string) => `<risdok><nutzdaten><abschnitt>${body}</abschnitt></nutzdaten></risdok>`
  const article = (n: number, line: string) =>
    `<ueberschrift typ="g1">Artikel ${n}</ueberschrift><ueberschrift typ="g2">Änderung des Vertragsbedienstetengesetzes 1948</ueberschrift>` +
    `<absatz typ="promkleinlsatz">Das Vertragsbedienstetengesetz 1948, BGBl. Nr. 86/1948, wird wie folgt geändert:</absatz>` +
    `<absatz typ="novao1">${line}</absatz>`

  it('the second is `#dup`, the first is still there', () => {
    const units = parseLawUnitsFromRis(doc(
      article(7, '1. In § 100 Abs. 107 wird die Zahlenfolge „2024/2025“ durch die Zahlenfolge „2026/2027“ ersetzt.') +
      article(11, '1. In § 2 Abs. 1 Z 5 wird das Wort „sieben“ durch das Wort „fünf“ ersetzt.'),
    ))
    expect(units.map((u) => `${u.articleNumber} ${u.id}`)).toEqual(['Artikel 7 Z1', 'Artikel 11 Z1#dup'])
    expect(units[0]!.text).toMatch(/§ 100 Abs\. 107/)
  })
})

// 78. Verordnung der Salzburger Landesregierung 2026 (OIB-Richtlinien),
// shortened: a table re-enacted in instruction 1, its cells set as plain text.
describe('segmentUnits: a table row „2.1" is not instruction 2', () => {
  it('keeps the row in instruction 1, and the printed „2." opens Z2 once', () => {
    const blocks = [
      clause,
      blk('novao', 'Im § 1 lautet die Tabelle:'),
      blk('other', '2'),
      blk('other', 'Brandschutz'),
      blk('other', '2.1'),
      blk('other', 'Brandschutz bei Betriebsbauten'),
      blk('other', '2.2'),
      blk('other', 'Brandschutz bei Garagen, überdachten Stellplätzen und Parkdecks'),
      blk('novao', '2. Im § 2 lauten die Z 1 bis 4:'),
    ]
    const units = segmentUnits(blocks)
    expect(units.map((u) => u.id)).toEqual(['Z1', 'Z2'])
    expect(units[0]!.blocks.map((b) => b.text)).toContain('2.1')
  })
})
