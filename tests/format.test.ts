import { describe, expect, it } from 'vitest'
import { bgblShort, formatNumberDe, fristLabel, moreLabelDe, shownLabelDe } from '../shared/utils/format'

describe('shownLabelDe', () => {
  it('states position only — the remainder is not spelled out', () => {
    /* "10 von 35" already says 25 are left, and the button below says what
     * the next press adds. A third number would be the same fact again. */
    expect(shownLabelDe(10, 35)).toBe('10 von 35 angezeigt')
  })

  it('reads the same at the end of the list', () => {
    expect(shownLabelDe(35, 35)).toBe('35 von 35 angezeigt')
  })

  it('never claims more rows than the list holds', () => {
    /* The panel steps `visibleCount` past the total on the last press. */
    expect(shownLabelDe(40, 35)).toBe('35 von 35 angezeigt')
  })

  it('groups thousands through the shared number formatting', () => {
    /* Composed, not spelled out: de-AT groups with a narrow no-break space
     * in Node's ICU, and this line must not be the one place that pins it. */
    expect(shownLabelDe(10, 1234)).toBe(`10 von ${formatNumberDe(1234)} angezeigt`)
  })
})

describe('moreLabelDe', () => {
  it('names the step', () => {
    expect(moreLabelDe(25, 10)).toBe('Weitere 10 anzeigen')
  })

  it('names the remainder on the last page', () => {
    expect(moreLabelDe(3, 10)).toBe('Weitere 3 anzeigen')
  })

  it('stays German at one', () => {
    expect(moreLabelDe(1, 10)).toBe('Eine weitere anzeigen')
  })
})

describe('fristLabel', () => {
  it('says the one wording for a Frist that has ended', () => {
    /* Same sentence as the row detail under „Begutachtung abgeschlossen"
       (`fristEndedDe`), which used to read „Frist endete 24.08.2026" while
       the chip read „Endete am 24.08.2026" — one fact, two spellings. */
    expect(fristLabel('2026-08-24', false)).toBe('Frist endete am 24.08.2026')
  })

  it('keeps the dateless sibling', () => {
    expect(fristLabel(null, false)).toBe('Frist abgelaufen')
  })
})

describe('bgblShort', () => {
  it('shortens the long spelling and leaves the short one alone', () => {
    expect(bgblShort('Bundesgesetzblatt I Nr. 69/2026')).toBe('BGBl. I Nr. 69/2026')
    expect(bgblShort('BGBl. II Nr. 50/2026')).toBe('BGBl. II Nr. 50/2026')
  })
})
