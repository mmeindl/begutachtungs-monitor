/**
 * The note on a door card names who decides, and that differs per door:
 * a wrong institution here tells a reader whom to expect something from.
 */
import { describe, expect, it } from 'vitest'
import { landStatementRound, STATEMENT_EXPECTATION_DE } from '../app/utils/statementQuote'

const text = STATEMENT_EXPECTATION_DE.text

describe('landStatementRound', () => {
  it('leaves the Landtag out of a Verordnung, in every Land', () => {
    expect(landStatementRound('vbg', 'verordnung')).toBe('land-verordnung')
    expect(landStatementRound('w', 'verordnung')).toBe('land-verordnung')
    expect(text('land-verordnung')).not.toContain('Landtag')
  })

  it('gives only a Vorarlberg Gesetz the list for the Landtag', () => {
    expect(landStatementRound('vbg', 'gesetz')).toBe('vorarlberg')
    expect(landStatementRound('bgld', 'gesetz')).toBe('land')
    expect(text('vorarlberg')).toContain('für den Landtag zusammen')
    expect(text('land')).not.toContain('zusammen')
  })
})

describe('STATEMENT_EXPECTATION_DE', () => {
  it('says no vote on every door', () => {
    for (const round of ['begutachtung', 'parlament', 'anliegen', 'ministerium', 'land', 'land-verordnung', 'vorarlberg'] as const) {
      expect(text(round)).toMatch(/^Eine Stellungnahme ist keine Abstimmung\./)
    }
  })

  it('names the ministry alone on a RIS draft', () => {
    expect(text('ministerium')).toContain('entscheidet das zuständige Ministerium.')
    expect(text('ministerium')).not.toContain('Abgeordneten')
  })

  it('links a source only where an institution has a page saying it', () => {
    expect(STATEMENT_EXPECTATION_DE.source('parlament')).not.toBeNull()
    expect(STATEMENT_EXPECTATION_DE.source('land')).toBeNull()
    expect(STATEMENT_EXPECTATION_DE.source('ministerium')).toBeNull()
  })
})
