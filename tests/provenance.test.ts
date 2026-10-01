import { describe, expect, it } from 'vitest'
import {
  documentSource,
  groupSources,
  parliamentDataSource,
  parliamentDocumentSource,
  risSource,
  sourceLineDe,
} from '../shared/utils/provenance'

/**
 * The licence rules of every page (`shared/utils/provenance.ts`): RIS is
 * CC BY 4.0, Parliament's documents of the parliamentary stations are freie
 * Werke, and nothing of the Begutachtungsverfahren read from Parliament
 * carries a claim (docs/architecture.md §13.1).
 */
describe('documentSource', () => {
  it('claims CC BY 4.0 for RIS only', () => {
    expect(documentSource('Ministerialentwurf', 'me', 'ris').terms).toBe('cc-by')
    expect(documentSource('Fassung im Bundesgesetzblatt', 'bgbl', 'ris').terms).toBe('cc-by')
    expect(documentSource('Ministerialentwurf', 'me', 'parlament').terms).not.toBe('cc-by')
  })

  it('calls a parliamentary document a freies Werk, not CC BY 4.0', () => {
    // Read live on 23.09.2026: Parliament's dataset pages for
    // Regierungsvorlagen, Ausschussberichte and Beschlüsse say the DOCUMENTS
    // are „freie Werke und somit ohne Lizenzierung frei nutzbar".
    for (const station of ['rv', 'ausschuss', 'plenum'] as const) {
      expect(parliamentDocumentSource('x', station).terms).toBe('freies-werk')
    }
  })

  it('makes no claim for the Ministerialentwurf read from Parliament', () => {
    expect(parliamentDocumentSource('Ministerialentwurf', 'me').terms).toBe('keine-lizenz')
  })
})

describe('sourceLineDe', () => {
  it('names publishers, never a licence', () => {
    expect(sourceLineDe([risSource('Erläuterungen')])).toBe('Quelle: RIS')
    expect(sourceLineDe([
      parliamentDocumentSource('Ministerialentwurf', 'me'),
      parliamentDocumentSource('Regierungsvorlage', 'rv'),
      risSource('Paragraphenüberschriften'),
    ])).toBe('Quellen: Parlament, RIS')
    expect(sourceLineDe([])).toBeNull()
  })
})

describe('groupSources', () => {
  it('keeps ME and RV apart where one line used to join them', () => {
    // „Quellen: Parlament (Dokumente: freie Werke)" stood under ME→RV until
    // 01.10.2026 and read as covering the draft too.
    const groups = groupSources([
      parliamentDocumentSource('Ministerialentwurf', 'me'),
      parliamentDocumentSource('Regierungsvorlage', 'rv'),
    ])
    expect(groups).toEqual([
      { publisher: 'parlament', terms: 'freies-werk', items: ['Regierungsvorlage'] },
      { publisher: 'parlament', terms: 'keine-lizenz', items: ['Ministerialentwurf'] },
    ])
  })

  it('orders groups settled-first and names each item once, in reported order', () => {
    const groups = groupSources([
      parliamentDataSource('Angaben zum Begutachtungsverfahren', 'keine-lizenz'),
      risSource('Textgegenüberstellung'),
      parliamentDataSource('Verlauf nach der Begutachtung', 'cc-by'),
      risSource('Erläuterungen'),
      risSource('Textgegenüberstellung'),
    ])
    expect(groups.map((g) => [g.publisher, g.terms])).toEqual([
      ['ris', 'cc-by'],
      ['parlament', 'cc-by'],
      ['parlament', 'keine-lizenz'],
    ])
    expect(groups[0]!.items).toEqual(['Textgegenüberstellung', 'Erläuterungen'])
  })
})
