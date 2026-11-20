import { describe, expect, it } from 'vitest'
import { bodyText, parseKonsParagraph, plainText, type LawNode } from '../server/utils/lawtext/konsTree'

/**
 * Designations RIS prints together in one symbol or one line (20.11.2026):
 * a Ziffer and its first Litera („3. a)"), an Absatz and its first Ziffer
 * and Litera („(1) 1. a) …"). Read as one unit, the Ziffer did not exist,
 * and „§ 9 Z 3 lautet" (16/ME XXVIII, GrEStG 1987) was refused.
 */
const shape = (n: LawNode): string[] => n.children.flatMap((c) => [`${c.level}:${c.id}`, ...shape(c).map((s) => `  ${s}`)])

describe('a Ziffer and its first Litera in one symbol', () => {
  // GrEStG 1987 § 9 as RIS sends it.
  const xml = `<risdok><nutzdaten><abschnitt>
    <absatz typ="abs" ct="text"><gldsym>§ 9.</gldsym> Steuerschuldner sind</absatz>
    <liste><aufzaehlung ebene="1"><listelem ct="text"><symbol>2a.</symbol>bei Erwerben gemäß § 1 Abs. 1 Z 4 jene Person,</listelem></aufzaehlung>
    <aufzaehlung ebene="2"><listelem ct="text"><symbol stellen="5">3.\u00a0a)</symbol>bei der Änderung des Gesellschafterbestandes die Personengesellschaft,</listelem>
    <listelem ct="text"><symbol>b)</symbol>bei der Vereinigung der Anteile derjenige,</listelem></aufzaehlung>
    <aufzaehlung ebene="1"><listelem ct="text"><symbol>4.</symbol>bei allen übrigen Erwerbsvorgängen</listelem></aufzaehlung></liste>
  </abschnitt></nutzdaten></risdok>`

  it('opens the Ziffer and hangs the Literae under it', () => {
    const node = parseKonsParagraph(xml)!
    expect(shape(node)).toEqual(['abs:', '  z:2a', '  z:3', '    lit:a', '    lit:b', '  z:4'])
  })

  it('prints them on one line, as RIS does, and keeps the words', () => {
    const node = parseKonsParagraph(xml)!
    expect(bodyText(node)).toContain('3. a) bei der Änderung des Gesellschafterbestandes')
    expect(plainText(node)).toContain('jene Person, bei der Änderung des Gesellschafterbestandes')
  })
})

describe('an Absatz that opens into its first Ziffer and Litera in its own line', () => {
  // GrEStG 1987 § 7 Abs. 1.
  const xml = `<risdok><nutzdaten><abschnitt>
    <absatz typ="abs" ct="text"><gldsym>§\u00a07.</gldsym>\u00a0(1)\u00a01.\u00a0a) Ein Erwerb gilt als</absatz>
    <liste><aufzaehlung ebene="3"><listelem ct="text"><symbol>–</symbol>unentgeltlich,</listelem><listelem ct="text"><symbol>–</symbol>entgeltlich</listelem></aufzaehlung>
    <schlussteil ebene="2" ct="text">des Grundstückswertes beträgt.</schlussteil>
    <aufzaehlung ebene="2"><listelem ct="text"><symbol>b)</symbol>Ein Erwerb gilt als unentgeltlich.</listelem></aufzaehlung>
    <aufzaehlung ebene="2"><listelem ct="text"><symbol>2.\u00a0a)</symbol>Die Steuer beträgt</listelem></aufzaehlung></liste>
    <absatz typ="abs" ct="text">(2) Zweiter Absatz.</absatz>
  </abschnitt></nutzdaten></risdok>`

  it('opens Abs. 1, Z 1 and lit. a, and files the dashes, the closing part and lit. b where RIS puts them', () => {
    const node = parseKonsParagraph(xml)!
    expect(shape(node)).toEqual(['abs:1', '  z:1', '    lit:a', '      lit:-', '      lit:-', '      schluss:schluss', '    lit:b', '  z:2', '    lit:a', 'abs:2'])
    expect(bodyText(node).split('\n')[0]).toBe('(1) 1. a) Ein Erwerb gilt als')
  })

  it('never reads a date as a Ziffer: the list has to go on with the next designation', () => {
    const date = `<risdok><nutzdaten><abschnitt>
      <absatz typ="abs" ct="text"><gldsym>§ 5.</gldsym> (2) 1. Jänner 2020 ist der Stichtag.</absatz>
      <absatz typ="abs" ct="text">(3) Dritter Absatz.</absatz>
    </abschnitt></nutzdaten></risdok>`
    const node = parseKonsParagraph(date)!
    expect(shape(node)).toEqual(['abs:2', 'abs:3'])
    expect(node.children[0]!.text).toBe('1. Jänner 2020 ist der Stichtag.')
  })

  it('reads „(3) 1. Text" with the Ziffer 2 below as Abs. 3 Z 1 (ZDG § 37c)', () => {
    const z = `<risdok><nutzdaten><abschnitt>
      <absatz typ="abs" ct="text"><gldsym>§ 37c.</gldsym> (3) 1. Der Rechtsträger hat insbesondere</absatz>
      <liste><aufzaehlung ebene="2"><listelem ct="text"><symbol>a)</symbol>Informationen zu erteilen,</listelem></aufzaehlung>
      <aufzaehlung ebene="1"><listelem ct="text"><symbol>2.</symbol>Zweitens.</listelem></aufzaehlung></liste>
    </abschnitt></nutzdaten></risdok>`
    expect(shape(parseKonsParagraph(z)!)).toEqual(['abs:3', '  z:1', '    lit:a', '  z:2'])
  })
})
