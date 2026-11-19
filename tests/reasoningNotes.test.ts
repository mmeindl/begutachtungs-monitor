import { describe, expect, it } from 'vitest'
import { explanationsMissingNote, landReasoningGapNote, reasoningComparisonNote, reasoningGapNote } from '../app/utils/reasoningNotes'

const stats = (compared: number) => ({ compared, changed: 0, editorial: 0, uncompared: 0 })

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
      'Nicht lesbar: Die Erläuterungen der Regierungsvorlage gibt es nur als PDF. Die Begründungen sind deshalb nicht verglichen.',
    )
    expect(explanationsMissingNote([{ side: 'me', kind: 'notListed' }, { side: 'rv', kind: 'pdfOnly' }])).toBe(
      'Nicht lesbar: Erläuterungen des Entwurfs führt das Parlament nicht als eigenes Dokument. Die Erläuterungen der Regierungsvorlage gibt es nur als PDF. Die Begründungen sind deshalb nicht verglichen.',
    )
    expect(explanationsMissingNote([])).toBeNull()
    expect(explanationsMissingNote(undefined)).toBeNull()
  })
})

describe('landReasoningGapNote (17.11.2026)', () => {
  it('says nothing while Begründungen were compared, or before the answer', () => {
    expect(landReasoningGapNote(null)).toBeNull()
    expect(landReasoningGapNote({ available: true, unavailableReason: null, stats: stats(4) })).toBeNull()
  })

  it('says that two read texts share no Paragraph', () => {
    expect(landReasoningGapNote({ available: true, unavailableReason: null, stats: stats(0) })).toBe(
      'Nicht im Monitor: ein Vergleich der Begründungen. Die Erläuterungen beider Texte decken keinen gemeinsamen Paragraphen ab.',
    )
  })

  it('carries the service\'s gap sentence and what follows from it', () => {
    expect(landReasoningGapNote({ available: false, unavailableReason: 'Nicht lesbar: In einem der beiden Texte fand der Monitor keine Erläuterungen zu einzelnen Paragraphen.', stats: stats(0) })).toBe(
      'Nicht lesbar: In einem der beiden Texte fand der Monitor keine Erläuterungen zu einzelnen Paragraphen. Die Begründungen sind deshalb nicht verglichen.',
    )
  })

  it('leaves a reason that is no gap sentence to the comparison', () => {
    expect(landReasoningGapNote({ available: false, unavailableReason: 'Zu diesem Entwurf gibt es keine Regierungsvorlage.', stats: stats(0) })).toBeNull()
  })
})

// Before 19.11.2026 a failed /begruendung left every change without a
// Begründung and without a word — the page's grammar for „unchanged".
describe('reasoningComparisonNote (19.11.2026)', () => {
  const missing = { available: false, unavailableReason: 'Nicht lesbar: Die Erläuterungen des Entwurfs gibt es nicht als HTML; verglichen sind sie deshalb nicht.', explanationsMissing: [{ side: 'me' as const, kind: 'pdfOnly' as const }] }

  it('sagt, dass die Begründungen gerade nicht abrufbar sind, wo die Anfrage scheiterte und die Liste Änderungen zeigt', () => {
    expect(reasoningComparisonNote(undefined, true, 3)).toBe(
      'Gerade nicht abrufbar: die Begründungen des Ministeriums. Ob sie sich zu den Änderungen geändert haben, zeigt der Vergleich deshalb nicht.',
    )
    // Without changes there is nothing a Begründung would stand at.
    expect(reasoningComparisonNote(undefined, true, 0)).toBeNull()
    expect(reasoningComparisonNote(undefined, false, 3)).toBeNull()
  })

  it('sagt eine Lücke nur einmal: die nicht gelesenen Erläuterungen vor dem Grund des Dienstes', () => {
    expect(reasoningComparisonNote(missing, false, 3)).toBe(explanationsMissingNote(missing.explanationsMissing))
  })

  it('trägt den Lückensatz des Dienstes, nie einen Grund ohne Leitwort', () => {
    const unaddressed = 'Nicht lesbar: Die Erläuterungen dieses Entwurfs sind weder nach Ziffern noch nach Paragraphen gegliedert; ein Vergleich an der Änderung ginge daneben.'
    expect(reasoningComparisonNote({ available: false, unavailableReason: unaddressed }, false, 3)).toBe(unaddressed)
    expect(reasoningComparisonNote({ available: false, unavailableReason: 'Zu diesem Entwurf gibt es noch keine Regierungsvorlage.' }, false, 3)).toBeNull()
    expect(reasoningComparisonNote({ available: true, unavailableReason: null }, false, 3)).toBeNull()
  })
})

describe('landReasoningGapNote — die gescheiterte Anfrage (19.11.2026)', () => {
  it('sagt, dass die Begründungen des Landes gerade nicht abrufbar sind', () => {
    expect(landReasoningGapNote(undefined, true, 2)).toBe(
      'Gerade nicht abrufbar: die Begründungen des Landes. Ob sie sich zu den Änderungen geändert haben, zeigt der Vergleich deshalb nicht.',
    )
    expect(landReasoningGapNote(undefined, true, 0)).toBeNull()
    expect(landReasoningGapNote(undefined)).toBeNull()
  })
})
