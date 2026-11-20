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
    expect(explainedParagraphs(parse, units, []).map((e) => [e.heading, e.paras])).toEqual([
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
    ].join('\n')])!
    expect(parse.particular.map((e) => e.article)).toEqual(['1', '1', '1', null, null, '2', null])
  })

  it('resolves no Ziffer whose Artikel is unknown where the draft numbers Ziffern in several', () => {
    const parse = { general: [], labelled: true, particular: [{ article: null, paras: [], heading: 'Zu Z 1:', text: ['Ohne Artikel.'] }] }
    expect(explainedParagraphs(parse, units, [])[0]!.paras).toEqual([])
    // One Artikel with Ziffern — the Novelle and its Inkrafttreten: the Ziffer is that Artikel's.
    expect(explainedParagraphs(parse, [units[0]!, unit('Artikel II', '§1', '§ 1')], [])[0]!.paras).toEqual(['3'])
  })
})
