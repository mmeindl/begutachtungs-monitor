import { describe, expect, it } from 'vitest'
import { ministryCodeOf, ministryNameOf, ministryScore } from '../server/utils/ris/ministryCodes'

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
})
