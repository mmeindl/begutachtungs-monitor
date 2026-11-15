import { describe, expect, it } from 'vitest'
import { ministryCodeOf, ministryScore } from '../server/utils/ris/ministryCodes'
import { ministryNameOf } from '../shared/utils/searchHaystack'

describe('ministry codes', () => {
  it('extracts the RIS ministry code and maps the two long-name variants', () => {
    expect(ministryCodeOf('BKA (Bundeskanzleramt)')).toBe('BKA')
    expect(ministryCodeOf('Bundesministerin für EU und Verfassung im Bundeskanzleramt')).toBe('BMEUV')
  })

  /* The other half of the same "CODE (long name)" string, read by the
   * RIS-only list and by the full-text search's ministry tokens. */
  it('extracts the long name, and falls back to the whole string', () => {
    expect(ministryNameOf('BMLUK (Bundesministerium für Land- und Forstwirtschaft)')).toBe(
      'Bundesministerium für Land- und Forstwirtschaft',
    )
    expect(ministryNameOf('Bundesministerium für Finanzen')).toBe('Bundesministerium für Finanzen')
    expect(ministryNameOf(null)).toBe('')
  })

  it('scores exact code 1, lineage 0.5, spelling variants as exact', () => {
    expect(ministryScore(new Set(['BMKÖS']), 'BMKOES')).toBe(1)
    expect(ministryScore(new Set(['BMK']), 'BMVIT')).toBe(0.5)
    expect(ministryScore(new Set(['BMF']), 'BMK')).toBe(0)
  })

  // The draft → BGBl. II join passes two RIS codes: both sides carry the
  // spelling without the umlaut, and a ministry is its own (BGBl. II
  // Nr. 214/2024, 215/2024 were refused as a foreign Ressort's).
  it('spells both sides alike before comparing', () => {
    expect(ministryScore(new Set(['BMKOES']), 'BMKOES')).toBe(1)
    expect(ministryScore(new Set(['BMKOES']), 'BMKÖS')).toBe(1)
    expect(ministryScore(new Set(['BMKOES']), 'BKA')).toBe(0.5)
  })

  // Energy moved from the BMK to the BMWET in March 2025 (BGBl. II
  // Nr. 76/2025); the BMWET is no kin of the BMK's other successors.
  it('knows the BMK → BMWET move, and only that pair', () => {
    expect(ministryScore(new Set(['BMK']), 'BMWET')).toBe(0.5)
    expect(ministryScore(new Set(['BMWET']), 'BMK')).toBe(0.5)
    expect(ministryScore(new Set(['BMLUK']), 'BMWET')).toBe(0)
  })
})
