import { describe, expect, it } from 'vitest'
import { FIGURE_NOT_COMPARED_DE, hasFigure } from '../shared/utils/figureMark'
import { splitGap } from '../shared/utils/gaps'

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
