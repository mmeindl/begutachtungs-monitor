import { describe, expect, it } from 'vitest'
import { FIGURE_NOT_COMPARED_DE, hasFigure } from '../shared/utils/figureMark'
import { splitGap } from '../shared/utils/gaps'
import { compareKey } from '../server/utils/lawtext/normalize'
import { diffLawUnits } from '../server/utils/diff/lawDiff'
import { isEditorialChange } from '../server/utils/diff/wordDiff'
import type { LawUnit } from '../server/utils/lawtext/lawUnits'

describe('the image mark (19.11.2026)', () => {
  it('finds the mark both readers write, and the annex’s with its alt text', () => {
    expect(hasFigure('Zusatztafel [Abbildung] wie abgebildet')).toBe(true)
    expect(hasFigure('[Abbildung: Kamerasymbol]')).toBe(true)
    expect(hasFigure('Abbildung 3 zeigt')).toBe(false)
    expect(hasFigure(null)).toBe(false)
  })

  it('says what is not compared with the lead word of the monitor’s own scope', () => {
    expect(splitGap(FIGURE_NOT_COMPARED_DE)?.kind).toBe('outOfScope')
  })
})

// The Landesgesetzblatt from RIS sets the mark where the Land's draft, read
// from PDF, carries none: Salzburg's units came out „geändert" by
// „+[Abbildung]" alone (sbg-33675 Z 6, 19.11.2026).
describe('a mark alone makes no change (19.11.2026)', () => {
  const u = (text: string): LawUnit => ({ article: 'G', articleNumber: null, id: 'Z6', heading: null, quotedHeadings: [], text, blocks: [], stammnorm: null })

  it('leaves the unit unchanged where only one side sets the mark', () => {
    expect(compareKey('Zusatztafel [Abbildung] wie abgebildet')).toBe(compareKey('Zusatztafel wie abgebildet'))
    expect(diffLawUnits([u('Der Betrag errechnet sich wie folgt: Lf')], [u('Der Betrag errechnet sich wie folgt: [Abbildung] Lf')])[0]!.change).toBe('unchanged')
  })

  it('keeps a change of the words beside it, and the mark beside a word-free change editorial', () => {
    expect(diffLawUnits([u('Die Frist beträgt vier Wochen.')], [u('Die Frist beträgt [Abbildung] sechs Wochen.')])[0]!.change).toBe('changed')
    expect(isEditorialChange([{ type: 'equal', text: 'Gemäß § 5' }, { type: 'inserted', text: '[Abbildung]' }, { type: 'removed', text: ',' }, { type: 'inserted', text: ';' }])).toBe(true)
  })
})
