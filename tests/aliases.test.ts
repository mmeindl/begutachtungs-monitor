import { describe, expect, it } from 'vitest'
import { aliasHaystack, aliasesFor, CONSULTATION_ALIASES } from '../shared/utils/aliases'

describe('consultation aliases', () => {
  it('finds the debate name of a procedure', () => {
    expect(aliasesFor('XXVIII', 8)).toContain('Bundestrojaner')
  })

  it('is empty for a procedure without one — most of them', () => {
    expect(aliasesFor('XXVIII', 1)).toEqual([])
    expect(aliasHaystack('XXVIII', 1)).toBe('')
  })

  it('feeds the search lowercased, so "bundestrojaner" matches', () => {
    expect(aliasHaystack('XXVIII', 8)).toContain('bundestrojaner')
  })

  it('keys are GP/inr and every entry has at least one name', () => {
    for (const [key, names] of Object.entries(CONSULTATION_ALIASES)) {
      expect(key).toMatch(/^[IVX]+\/\d+$/)
      expect(names.length).toBeGreaterThan(0)
      for (const n of names) expect(n.trim()).toBe(n)
    }
  })

  it('never carries an official title — an alias must add a name, not repeat one', () => {
    // "Änderung", "Gesetz", "Novelle" are what the official titles are made
    // of; an alias made of them would be a description, not a debate name.
    for (const names of Object.values(CONSULTATION_ALIASES)) {
      for (const n of names) expect(n).not.toMatch(/,\s*Änderung$/)
    }
  })
})
