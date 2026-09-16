import { describe, expect, it } from 'vitest'
import { parseStatementRef, statementRefFromPageUrl } from '../shared/utils/statementRef'

/**
 * The address of one Stellungnahme travels from the row to the batch document
 * lookup and back. Both ends parse it here, so a ref the client derives and a
 * ref the endpoint accepts can never drift apart.
 */
describe('statementRefFromPageUrl', () => {
  it('reads the ref out of the statement page every row already links', () => {
    expect(statementRefFromPageUrl('https://www.parlament.gv.at/gegenstand/XXVIII/SNME/5408')).toBe(
      'XXVIII/SNME/5408',
    )
    // Stellungnahmen to a Regierungsvorlage are the same shape, type SN.
    expect(statementRefFromPageUrl('https://www.parlament.gv.at/gegenstand/XXVII/SN/912')).toBe(
      'XXVII/SN/912',
    )
    // Stored URLs carry a trailing slash often enough to matter.
    expect(statementRefFromPageUrl('https://www.parlament.gv.at/gegenstand/XXVII/SN/277139/')).toBe(
      'XXVII/SN/277139',
    )
  })

  it('is null for any other page — a missing value included', () => {
    expect(statementRefFromPageUrl(null)).toBeNull()
    expect(statementRefFromPageUrl(undefined)).toBeNull()
    expect(statementRefFromPageUrl('')).toBeNull()
    // The Ministerialentwurf itself is not a Stellungnahme.
    expect(statementRefFromPageUrl('https://www.parlament.gv.at/gegenstand/XXVIII/ME/132')).toBeNull()
  })
})

describe('parseStatementRef', () => {
  it('accepts what the client sends and normalizes the casing', () => {
    expect(parseStatementRef('XXVIII/SNME/5408')).toEqual({ gp: 'XXVIII', ityp: 'SNME', inr: 5408 })
    expect(parseStatementRef('xxviii/snme/5408')).toEqual({ gp: 'XXVIII', ityp: 'SNME', inr: 5408 })
  })

  /* The same shape guard the redirect endpoint applies (GP_RE is a character
   * class, not a roman-numeral parser): its job is to refuse input that must
   * not become an upstream URL. A well-formed but nonexistent GP costs a
   * lookup that fails and is dropped from the answer. */
  it('refuses malformed refs instead of building a request out of them', () => {
    expect(parseStatementRef('XXVIII/SNME')).toBeNull()
    expect(parseStatementRef('XXVIII/SNME/5408/extra')).toBeNull()
    expect(parseStatementRef('42/SNME/5408')).toBeNull()
    expect(parseStatementRef('XXVIII/ME/132')).toBeNull()
    expect(parseStatementRef('XXVIII/SNME/0')).toBeNull()
    expect(parseStatementRef('XXVIII/SNME/-3')).toBeNull()
    expect(parseStatementRef('XXVIII/SNME/abc')).toBeNull()
    expect(parseStatementRef('')).toBeNull()
  })
})
