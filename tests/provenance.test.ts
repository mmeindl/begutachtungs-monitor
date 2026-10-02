import { describe, expect, it } from 'vitest'
import {
  documentSource,
  mixedPublishers,
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
  it('names the one publisher, never a licence', () => {
    expect(sourceLineDe([risSource('Erläuterungen')])).toBe('Quelle: RIS')
    expect(sourceLineDe([
      parliamentDocumentSource('Regierungsvorlage', 'rv'),
      parliamentDocumentSource('Ausschussfassung', 'ausschuss'),
    ])).toBe('Quelle: Parlament')
    expect(sourceLineDe([])).toBeNull()
  })

  it('leaves the publishers to the items where the line mixes them', () => {
    // „Quellen: Parlament, RIS" over two documents left open which came
    // from where — and that decides the claim.
    const sources = [parliamentDocumentSource('Ministerialentwurf', 'me'), risSource('Fassung im Bundesgesetzblatt')]
    expect(mixedPublishers(sources)).toBe(true)
    expect(sourceLineDe(sources)).toBe('Quellen:')
  })
})

describe('the ME→RV pair', () => {
  it('keeps the draft out of the Vorlage\'s claim', () => {
    // „Quellen: Parlament (Dokumente: freie Werke)" stood under ME→RV until
    // 01.10.2026 and read as covering the draft too.
    expect(parliamentDocumentSource('Ministerialentwurf', 'me').terms).toBe('keine-lizenz')
    expect(parliamentDocumentSource('Regierungsvorlage', 'rv').terms).toBe('freies-werk')
  })
})
