import { describe, expect, it } from 'vitest'
import { bgblShort, daysUntil, endorsementLabel, formatNumberDe, fristLabel, moreLabelDe, shownLabelDe, todayIso } from '../shared/utils/format'

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

/**
 * The clock is pinned by passing it in, never by mocking Date: `todayIso`
 * and `daysUntil` both take `now`, so these run identically on a laptop in
 * Vienna and on the UTC server.
 */
describe('todayIso', () => {
  it('is already the next day at 00:30 Vienna time in summer', () => {
    /* CEST = UTC+2. This is the window the three definitions used to
     * disagree in: 22:00–24:00 UTC is 00:00–02:00 of the following day in
     * Austria, and the Frist is an Austrian calendar date. */
    expect(todayIso(new Date('2026-09-21T22:30:00Z'))).toBe('2026-09-22')
  })

  it('is still the same day one minute before', () => {
    expect(todayIso(new Date('2026-09-21T21:59:00Z'))).toBe('2026-09-21')
  })

  it('shifts one hour later in winter, not two', () => {
    /* CET = UTC+1, so the boundary moves to 23:00 UTC — which is why the
     * timezone is named and no fixed offset is added anywhere. */
    expect(todayIso(new Date('2026-01-15T23:30:00Z'))).toBe('2026-01-16')
    expect(todayIso(new Date('2026-01-15T22:59:00Z'))).toBe('2026-01-15')
  })

  it('returns exactly yyyy-mm-dd, zero-padded', () => {
    expect(todayIso(new Date('2026-01-05T12:00:00Z'))).toBe('2026-01-05')
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('daysUntil', () => {
  it('counts a Frist as over once Vienna is in the next day', () => {
    /* The bug, in one line: at 00:30 Vienna time the Frist of the 21st has
     * passed. The old expression read the process's LOCAL day, so on the
     * UTC server this returned 0 — „Endet heute" — while the reader's
     * browser in Vienna already showed „Frist abgelaufen". */
    expect(daysUntil('2026-09-21', new Date('2026-09-21T22:30:00Z'))).toBe(-1)
  })

  it('still counts it as today one minute before', () => {
    expect(daysUntil('2026-09-21', new Date('2026-09-21T21:59:00Z'))).toBe(0)
  })

  it('counts forward and backward in whole calendar days', () => {
    const now = new Date('2026-09-21T10:00:00Z')
    expect(daysUntil('2026-09-28', now)).toBe(7)
    expect(daysUntil('2026-09-20', now)).toBe(-1)
    expect(daysUntil(null, now)).toBeNull()
    expect(daysUntil('kaputt', now)).toBeNull()
  })
})

describe('fristLabel', () => {
  it('says „Endet heute" on the Austrian calendar day, at any hour', () => {
    /* Server and client render this from the same definition now — the
     * label that used to differ between the two for two hours a night. */
    expect(fristLabel(todayIso(), true)).toBe('Endet heute')
  })

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

describe('endorsementLabel', () => {
  it('keeps the word Parliament itself uses, singular exactly at one', () => {
    // Three components printed this line; the vocabulary has to survive the
    // click-through to parlament.gv.at.
    expect(endorsementLabel(1)).toBe('1 Zustimmung')
    expect(endorsementLabel(0)).toBe('0 Zustimmungen')
    expect(endorsementLabel(12)).toBe('12 Zustimmungen')
  })
})
