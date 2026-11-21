import { describe, expect, it } from 'vitest'
import { landReasonsAt, unplacedLandReasons } from '../app/utils/landReasons'

const entry = (heading: string, law: string | null, paras: string[]) => ({ heading, law, paras, text: ['Text.'] })

/*
 * A passage whose law the reader could not tell stood at the § of that
 * number in every law of a package (20.11.2026): the Land's passage on law
 * A's § 3 at law B's § 3, a wrong Begründung, which the Bund never shows
 * (`explanationsJoin.ts` discards such a passage in a package).
 */
describe('the Land\'s Begründung at a § of its Textgegenüberstellung', () => {
  const particular = [entry('Zu Art. I Z 1 (§ 3):', 'Salzburger Ygesetz', ['3']), entry('Zu Z 1 (§ 3):', null, ['3'])]

  it('takes a passage without a law only where the comparison holds one law', () => {
    expect(landReasonsAt(particular, { id: '§3', article: 'Salzburger Ygesetz' }, new Map(), ['Salzburger Ygesetz']).map((e) => e.heading)).toEqual(['Zu Art. I Z 1 (§ 3):', 'Zu Z 1 (§ 3):'])
    expect(landReasonsAt(particular, { id: '§3', article: 'Salzburger Ygesetz' }, new Map(), ['Salzburger Ygesetz', 'Salzburger Zgesetz']).map((e) => e.heading)).toEqual(['Zu Art. I Z 1 (§ 3):'])
    expect(landReasonsAt(particular, { id: '§3', article: 'Salzburger Zgesetz' }, new Map(), ['Salzburger Ygesetz', 'Salzburger Zgesetz'])).toEqual([])
  })

  it('takes no passage of a law at a § filed under none, in a package', () => {
    expect(landReasonsAt(particular, { id: '§3', article: null }, new Map(), ['Salzburger Ygesetz', 'Salzburger Zgesetz', null])).toEqual([])
    // Beside one law, a § under none is that law's (`withheldGroups`).
    expect(landReasonsAt(particular, { id: '§3', article: null }, new Map(), ['Salzburger Ygesetz', null])).toHaveLength(2)
  })

  it('keeps in a package what it could not set at a §, for the list\'s end', () => {
    expect(unplacedLandReasons(particular, ['Salzburger Ygesetz', 'Salzburger Zgesetz']).map((e) => e.heading)).toEqual(['Zu Z 1 (§ 3):'])
    expect(unplacedLandReasons(particular, ['Salzburger Ygesetz'])).toEqual([])
    // An entry naming no § stands at none anyway (an Artikel's heading, the Inkrafttreten).
    expect(unplacedLandReasons([entry('Zu Artikel II', null, [])], ['A', 'B'])).toEqual([])
  })
})
