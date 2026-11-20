import { describe, expect, it } from 'vitest'
import { bodyText, parseKonsParagraph, plainText, type LawNode } from '../server/utils/lawtext/konsTree'

/**
 * Text inside a § that the reader lost or put out of order (20.11.2026): an
 * Absatz's own heading between two Absätze, and a closing part that leads
 * into the dashes below it. Both stood in the ressort's annex where RIS
 * prints them, and the oracle found the left column nowhere (61/ME XXVIII,
 * UStG 1994 § 21, EStG 1988 § 95: `anhang-fremd`).
 */
const shape = (n: LawNode): string[] => n.children.flatMap((c) => [`${c.level}:${c.id}`, ...shape(c).map((s) => `  ${s}`)])

describe('an Absatz heading inside the §', () => {
  // UStG 1994 § 21 Abs. 10a and 11 as RIS sends them.
  const xml = `<risdok><nutzdaten><abschnitt>
    <ueberschrift typ="para" ct="text">Voranmeldung und Vorauszahlung, Veranlagung</ueberschrift>
    <absatz typ="abs" ct="text"><gldsym>§ 21.</gldsym> (10a) Die Bestimmungen der Abs. 1 bis 5 gelten auch für Personen, die keine Unternehmer sind.</absatz>
    <ueberschrift typ="erll" ct="text">Antrag auf Erstattung von Vorsteuerbeträgen in einem anderen Mitgliedstaat</ueberschrift>
    <absatz typ="abs" ct="text">(11) Ein im Inland ansässiger Unternehmer hat den Antrag elektronisch einzureichen.</absatz>
  </abschnitt></nutzdaten></risdok>`

  it('stands between the Absätze, in the text the annex is held against', () => {
    const node = parseKonsParagraph(xml)!
    expect(plainText(node)).toContain('keine Unternehmer sind. Antrag auf Erstattung von Vorsteuerbeträgen in einem anderen Mitgliedstaat Ein im Inland')
    expect(bodyText(node)).toContain('Mitgliedstaat\n(11) Ein im Inland')
  })

  it('is no Absatz and goes with none', () => {
    expect(shape(parseKonsParagraph(xml)!)).toEqual(['abs:10a', 'schluss:ueberschrift', 'abs:11'])
  })

  it('stays out where no numbered Absatz follows it: inside a list it would land behind it', () => {
    const inList = xml.replace('<absatz typ="abs" ct="text">(11) Ein', '<absatz typ="abs" ct="text">Ein')
    expect(plainText(parseKonsParagraph(inList)!)).not.toContain('Antrag auf Erstattung')
  })
})

describe('a closing part that leads into dashes', () => {
  // EStG 1988 § 95 Abs. 2 Z 3.
  const xml = `<risdok><nutzdaten><abschnitt>
    <absatz typ="abs" ct="text"><gldsym>§ 95.</gldsym> (2) Abzugsverpflichteter ist:</absatz>
    <liste><aufzaehlung ebene="1"><listelem ct="text"><symbol>3.</symbol>Bei Einkünften aus Kryptowährungen:</listelem></aufzaehlung>
    <aufzaehlung ebene="2"><listelem ct="text"><symbol>a)</symbol>Bei laufenden Einkünften der inländische Schuldner;</listelem>
    <listelem ct="text"><symbol>b)</symbol>Bei realisierten Wertsteigerungen der inländische Dienstleister.</listelem></aufzaehlung>
    <schlussteil ebene="1" ct="text">Als inländische Dienstleister kommen in Betracht:</schlussteil>
    <aufzaehlung ebene="2"><listelem ct="text"><symbol>–</symbol>Dienstleister mit Sitz im Inland,</listelem>
    <listelem ct="text"><symbol>–</symbol>die inländische Zweigstelle.</listelem></aufzaehlung>
    <aufzaehlung ebene="1"><listelem ct="text"><symbol>4.</symbol>Bei Einkünften aus Derivaten:</listelem></aufzaehlung></liste>
  </abschnitt></nutzdaten></risdok>`

  it('keeps the dashes behind the sentence that introduces them, under the Ziffer', () => {
    const node = parseKonsParagraph(xml)!
    expect(plainText(node)).toContain('der inländische Dienstleister. Als inländische Dienstleister kommen in Betracht: Dienstleister mit Sitz im Inland, die inländische Zweigstelle. Bei Einkünften aus Derivaten')
    expect(shape(node)).toEqual(['abs:2', '  z:3', '    lit:a', '    lit:b', '    schluss:zwischentext', '    lit:-', '    lit:-', '  z:4'])
  })

  it('is no Schlussteil an instruction can mean', () => {
    const z3 = parseKonsParagraph(xml)!.children[0]!.children[0]!
    expect(z3.children.some((c) => c.level === 'schluss' && c.id === 'schluss')).toBe(false)
  })

  it('leaves a closing part that closes its list as it was', () => {
    const closing = xml.replace(/<schlussteil[\s\S]*?<\/aufzaehlung>/, '<schlussteil ebene="1" ct="text">Dies gilt sinngemäß.</schlussteil></aufzaehlung>')
    const z3 = parseKonsParagraph(closing)!.children[0]!.children[0]!
    expect(z3.children.at(-1)).toMatchObject({ level: 'schluss', id: 'schluss', text: 'Dies gilt sinngemäß.' })
  })
})
