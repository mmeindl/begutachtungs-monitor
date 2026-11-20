import { describe, expect, it } from 'vitest'
import { parseLandExplanations } from '../server/utils/laender/landExplanations'
import { explainedParagraphs } from '../server/utils/laender/landExplanationsRead'
import type { LawUnit } from '../server/utils/lawtext/lawUnits'

const unit = (articleNumber: string | null, id: string, heading: string): LawUnit => ({ article: null, articleNumber, id, heading, quotedHeadings: [], text: '', blocks: [], stammnorm: null })

/*
 * A package's Erläuterungen head each law once — „Zu Artikel II" — and its
 * entries by Ziffer alone below it („Zu Z 1:"). Read from the entry's own
 * heading only, the Ziffer stood under no Artikel, was looked up in
 * Artikel I, and Artikel II's passage stood at Artikel I's § (20.11.2026).
 */
describe('a bare „Zu Z n:" stands under the Artikel heading above it', () => {
  const pages = [[
    'Erläuterungen',
    '1. Allgemeines:',
    'Die Novelle ändert zwei Gesetze.',
    '2. Zu den einzelnen Bestimmungen:',
    'Zu Artikel I',
    'Zu Z 1:',
    'Text eins zu Artikel I.',
    'Zu Artikel II',
    'Zu Z 1:',
    'Text zwei zu Artikel II.',
  ].join('\n')]
  const units = [unit('Artikel I', 'Z1', '§ 3 Abs 1 lautet:'), unit('Artikel II', 'Z1', '§ 7 lautet:')]

  it('carries the Artikel to the entries below it', () => {
    const parse = parseLandExplanations(pages)!
    expect(parse.particular.map((e) => [e.heading, e.article])).toEqual([
      ['Zu Artikel I', 'I'],
      ['Zu Z 1:', 'I'],
      ['Zu Artikel II', 'II'],
      ['Zu Z 1:', 'II'],
    ])
  })

  it('looks the Ziffer up in that Artikel', () => {
    const parse = parseLandExplanations(pages)!
    expect(explainedParagraphs(parse, units, '').map((e) => [e.heading, e.paras])).toEqual([
      ['Zu Artikel I', []],
      ['Zu Z 1:', ['3']],
      ['Zu Artikel II', []],
      ['Zu Z 1:', ['7']],
    ])
  })

  // Salzburg 32374, 35597, 32573: another act's Artikel, and one entry for several.
  it('takes no cited Artikel for the package\'s, and no Artikel from a heading over several', () => {
    const parse = parseLandExplanations([[
      'Erläuterungen',
      '1. Allgemeines:',
      'Die Novelle ändert zwei Gesetze.',
      '2. Zu den einzelnen Bestimmungen:',
      'Zu Art 1 (Landes-Verfassungsgesetz 1999):',
      'Text.',
      'Zu Art 28 Abs 3a:',
      'Text.',
      'Zu Z 2:',
      'Text.',
      'Zu Art 1 und Art 2 Z 2 (§ 1):',
      'Text.',
      'Zu Z 3:',
      'Text.',
      'Zu Art 2 Z 4 (§ 3):',
      'Text.',
      'Zu Art 7 bis 17:',
      'Text.',
      'Zu Art 3 Z 1:',
      'Text.',
      // A bracket left open runs on into prose and the next line (Burgenland): no Artikel of the address.
      'Zu Z 6 (§ 21 Abs. 3 Diese Bestimmung regelt das Inkrafttreten. Artikel 26 Änderung des Xgesetzes',
      'Text.',
    ].join('\n')])!
    expect(parse.particular.map((e) => e.article)).toEqual(['1', '1', '1', null, null, '2', null, '3', '3'])
  })

  it('resolves no Ziffer whose Artikel is unknown where the draft numbers Ziffern in several', () => {
    const parse = { general: [], labelled: true, particular: [{ article: null, paras: [], heading: 'Zu Z 1:', text: ['Ohne Artikel.'] }] }
    expect(explainedParagraphs(parse, units, '')[0]!.paras).toEqual([])
    // One Artikel with Ziffern — the Novelle and its Inkrafttreten: the Ziffer is that Artikel's.
    expect(explainedParagraphs(parse, [units[0]!, unit('Artikel II', '§1', '§ 1')], '')[0]!.paras).toEqual(['3'])
  })
})

/*
 * Which law an Artikel is, from the draft's own Artikel headings, never by
 * its place in the title (20.11.2026): the title's list of amended laws
 * leaves out a law the draft enacts, so Artikel II stood for the third law
 * of „… X erlassen und Y und Z geändert …", and with one amended law every
 * Artikel was that law — Kärnten 79014's two new Abgabengesetze in
 * Artikel I and II explained the Motorbootabgabegesetz's §§ 1 to 14.
 */
describe('an entry\'s law is the one its Artikel amends in the draft', () => {
  const entry = (heading: string, article: string | null, paras: string[]) => ({ article, paras, heading, text: ['Text.'] })
  const PACKAGE = 'Gesetz, mit dem das Salzburger Xgesetz erlassen und das Salzburger Ygesetz und das Salzburger Zgesetz geändert werden'
  const ONE_AMENDED = 'Gesetz, mit dem das Salzburger Xgesetz erlassen und das Salzburger Ygesetz geändert wird'
  const parse = {
    general: [],
    labelled: true,
    particular: [entry('Zu Art. I § 3:', 'I', ['3']), entry('Zu Art. II Z 1 (§ 7):', 'II', ['7']), entry('Zu Art. III Z 1 (§ 2):', 'III', ['2'])],
  }

  it('maps a package\'s Artikel by the law each one opens', () => {
    const text = [
      'Artikel I', 'Salzburger Xgesetz', '§ 3', 'Text.',
      'Artikel II', 'Das Salzburger Ygesetz, LGBl Nr 1/2000, zuletzt geändert durch das Gesetz LGBl Nr 2/2020, wird geändert wie folgt:', '1. § 7 lautet:',
      'Artikel III', 'Das Salzburger Zgesetz, LGBl Nr 3/2001, wird geändert wie folgt:', '1. § 2 lautet:',
    ].join('\n')
    const units = [unit('Artikel I', '§3', '§ 3'), unit('Artikel II', 'Z1', '§ 7 lautet:'), unit('Artikel III', 'Z1', '§ 2 lautet:')]
    expect(explainedParagraphs(parse, units, PACKAGE, text).map((e) => e.law)).toEqual([null, 'Salzburger Ygesetz', 'Salzburger Zgesetz'])
  })

  it('gives the one amended law only to the Artikel that amends', () => {
    const units = [unit('Artikel I', '§3', '§ 3'), unit('Artikel II', 'Z1', '§ 7 lautet:'), unit('Artikel III', '§2', '§ 2')]
    expect(explainedParagraphs(parse, units, ONE_AMENDED, null).map((e) => e.law)).toEqual([null, 'Salzburger Ygesetz', null])
  })

  it('names no law where the draft\'s Artikel say nothing of it', () => {
    expect(explainedParagraphs(parse, null, PACKAGE, null).map((e) => e.law)).toEqual([null, null, null])
    // One law and nothing enacted or repealed: every entry is that law's, the draft's text unread or not.
    expect(explainedParagraphs(parse, null, 'Gesetz, mit dem das Salzburger Ygesetz geändert wird', null).map((e) => e.law)).toEqual(['Salzburger Ygesetz', 'Salzburger Ygesetz', 'Salzburger Ygesetz'])
    // A draft without Artikel and one law: every entry is that law's.
    const plain = { ...parse, particular: [entry('Zu Z 1 (§ 7):', null, ['7'])] }
    expect(explainedParagraphs(plain, [unit(null, 'Z1', '§ 7 lautet:')], 'Gesetz, mit dem das Salzburger Ygesetz geändert wird', null)[0]!.law).toBe('Salzburger Ygesetz')
  })
})
