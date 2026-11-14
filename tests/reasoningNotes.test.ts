import { describe, expect, it } from 'vitest'
import { explanationsMissingNote, reasoningGapNote, reasoningRateNote, substantiveReasoningChanges } from '../app/utils/reasoningNotes'

const stats = (compared: number, changed: number, editorial = 0) => ({ compared, changed, editorial, uncompared: 0 })

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

// The § comparison leaves its „redaktionell" units out of every count
// (`ownChangeShare`); the Begründungen follow it since 22.10.2026.
describe('substantiveReasoningChanges', () => {
  it('zählt redaktionell geänderte Begründungen nicht als geändert', () => {
    expect(substantiveReasoningChanges(stats(12, 3, 1))).toBe(2)
    expect(reasoningRateNote(stats(12, 1, 1))).toBe('Keine der 12 Begründungen hat das Ressort geändert.')
    expect(reasoningRateNote(stats(1, 1, 1))).toBe('Die Begründung, die in beiden Fassungen steht, hat das Ressort nicht geändert.')
    expect(reasoningRateNote(stats(33, 33, 1))).toBe('32 der 33 Begründungen hat das Ressort geändert.')
  })
})

describe('reasoningGapNote', () => {
  it('sagt an der Änderung, warum keine Begründung steht — mit Grund nur, wo er belegt ist', () => {
    expect(reasoningGapNote('numbering')).toBe('Begründung: nicht zuzuordnen – die Erläuterungen zählen die Ziffern anders.')
    expect(reasoningGapNote('missingBefore')).toBe('Begründung: nicht zuzuordnen – im Entwurf nicht gefunden.')
    expect(reasoningGapNote('missingAfter')).toBe('Begründung: nicht zuzuordnen – in der Regierungsvorlage nicht gefunden.')
    expect(reasoningGapNote('missingBoth')).toBe('Begründung: nicht zuzuordnen – in keinem der beiden Dokumente gefunden.')
    expect(reasoningGapNote('unread')).toBe('Begründung: nicht zuzuordnen.')
    expect(reasoningGapNote(undefined)).toBeNull()
  })
})

describe('explanationsMissingNote', () => {
  it('sagt, welche Erläuterungen nicht gelesen wurden — nie „nicht veröffentlicht"', () => {
    expect(explanationsMissingNote([{ side: 'rv', kind: 'pdfOnly' }])).toBe(
      'Die Erläuterungen der Regierungsvorlage liegen nur als PDF vor und konnten nicht gelesen werden. Die Begründungen sind deshalb nicht verglichen.',
    )
    expect(explanationsMissingNote([{ side: 'me', kind: 'notListed' }, { side: 'rv', kind: 'pdfOnly' }])).toBe(
      'Erläuterungen des Entwurfs konnten nicht gelesen werden: Das Parlament führt sie nicht als eigenes Dokument. Die Erläuterungen der Regierungsvorlage liegen nur als PDF vor und konnten nicht gelesen werden. Die Begründungen sind deshalb nicht verglichen.',
    )
    expect(explanationsMissingNote([])).toBeNull()
    expect(explanationsMissingNote(undefined)).toBeNull()
  })
})
