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
