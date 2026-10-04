import { describe, expect, it } from 'vitest'
import { reasoningRateNote } from '../app/utils/reasoningNotes'

const stats = (compared: number, changed: number) => ({ compared, changed, uncompared: 0 })

describe('reasoningRateNote', () => {
  it('says nothing where no Begründung was compared', () => {
    expect(reasoningRateNote(null)).toBeNull()
    expect(reasoningRateNote(stats(0, 0))).toBeNull()
  })

  it('keeps the restriction in the singular', () => {
    expect(reasoningRateNote(stats(1, 0))).toBe('Die Begründung, die in beiden Fassungen steht, hat das Ressort nicht geändert.')
    expect(reasoningRateNote(stats(1, 1))).toBe('Die Begründung, die in beiden Fassungen steht, hat das Ressort geändert.')
  })

  it('names both numbers in the plural', () => {
    expect(reasoningRateNote(stats(33, 0))).toBe('Keine der 33 Begründungen hat das Ressort geändert.')
    expect(reasoningRateNote(stats(33, 33))).toBe('Alle 33 Begründungen hat das Ressort geändert.')
    expect(reasoningRateNote(stats(33, 16))).toBe('16 der 33 Begründungen hat das Ressort geändert.')
  })
})
