import { describe, expect, it } from 'vitest'
import { extraTokens, isSubsetOfRis, verdictFor } from '../server/utils/applyReport'

const before = 'Zuständig ist die Behörde am Sitz der Partei.'

describe('extraTokens', () => {
  it('reports nothing when the engine made exactly the RIS changes', () => {
    const ris = 'Zuständig ist die Bezirksverwaltungsbehörde am Sitz der Partei.'
    expect(extraTokens(before, ris, ris)).toMatchObject({ inserted: [], removed: [], comparable: true })
  })

  it('names a word the engine invented', () => {
    const got = 'Zuständig ist die Bezirksverwaltungsbehörde am Wohnsitz der Partei.'
    const ris = 'Zuständig ist die Bezirksverwaltungsbehörde am Sitz der Partei.'
    expect(extraTokens(before, got, ris).inserted).toContain('Wohnsitz')
  })

  it('names a word the engine deleted on its own', () => {
    // The engine dropped "am Sitz der Partei" that RIS kept — as wrong as inventing.
    const got = 'Zuständig ist die Bezirksverwaltungsbehörde.'
    const ris = 'Zuständig ist die Bezirksverwaltungsbehörde am Sitz der Partei.'
    expect(extraTokens(before, got, ris).removed).toContain('Sitz')
    expect(isSubsetOfRis(before, got, ris)).toBe(false)
  })
})

describe('verdictFor', () => {
  const ris = 'Zuständig ist die Bezirksverwaltungsbehörde am Sitz der Partei.'

  it('separates the four outcomes', () => {
    expect(verdictFor(before, ris, ris)).toBe('identisch')
    expect(verdictFor(before, before, ris)).toBe('unverändert')
    // Doing less than RIS is safe; the paragraph is refused, not published.
    expect(verdictFor(before, 'Zuständig ist die Behörde am Sitz der Partei.', ris)).toBe('unverändert')
    expect(verdictFor(before, 'Zuständig ist die Bezirksverwaltungsbehörde am Wohnsitz der Partei.', ris)).toBe('abweichend')
  })

  it('counts a partial application as incomplete, not as wrong', () => {
    const twoChanges = 'Zuständig ist die Bezirksverwaltungsbehörde am Sitz des Antragstellers.'
    const halfDone = 'Zuständig ist die Bezirksverwaltungsbehörde am Sitz der Partei.'
    expect(verdictFor(before, halfDone, twoChanges)).toBe('unvollständig')
  })

  it('never passes a paragraph whose diff could not be computed', () => {
    // A very long pair skips the word diff; that must not read as harmless.
    const long = (word: string) => Array.from({ length: 3000 }, () => word).join(' ')
    expect(verdictFor(long('a'), long('b'), long('c'))).toBe('abweichend')
  })
})
