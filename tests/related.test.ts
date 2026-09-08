import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { ConsultationSummary } from '../shared/types'
import { findRelatedDrafts, titleKey } from '../server/utils/related'

/** The RIS-join fixtures: every list-81 row of GP XXVII (353) and XXVIII (132, as of 2026-09-06). */
interface FixtureRow {
  gp: string
  inr: number
  cite: string
  title: string
  ministryCode: string
  arrival: string
  frist: string | null
}

const read = (p: string): FixtureRow[] =>
  JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8')) as FixtureRow[]

function toSummary(r: FixtureRow): ConsultationSummary {
  return {
    gp: r.gp,
    inr: r.inr,
    citation: r.cite,
    title: r.title,
    ministryCode: r.ministryCode,
    ministryName: '',
    arrivedAt: r.arrival,
    deadline: r.frist,
    active: false,
    statementCount: 0,
    parliamentUrl: '',
  }
}

const all = [...read('./fixtures/me-gp27.json'), ...read('./fixtures/me-gp28.json')].map(toSummary)
const me = (gp: string, inr: number) => all.find((c) => c.gp === gp && c.inr === inr)!

describe('titleKey', () => {
  it('is the sorted, stemmed, stop-word-free token set', () => {
    expect(titleKey('Tierschutzgesetz, Änderung')).toBe('tierschutzgesetz')
    expect(titleKey('Bundesgesetz, mit dem das Tierschutzgesetz geändert wird')).toBe('tierschutzgesetz')
    expect(titleKey('Schulorganisationsgesetz, Schulunterrichtsgesetz u.a., Änderung')).toBe(
      titleKey('Schulunterrichtsgesetz, Schulorganisationsgesetz, Änderung'),
    )
  })

  it('is empty when nothing survives normalisation — such titles relate to nothing', () => {
    expect(titleKey('Bundesgesetz, Änderung')).toBe('')
    expect(titleKey(null)).toBe('')
    const orphan = { gp: 'XXVIII', inr: 9999, title: 'Bundesgesetz, Änderung', arrivedAt: '2026-01-01' }
    expect(findRelatedDrafts(orphan, all)).toEqual({ predecessor: null, successor: null })
  })

  it('keeps years apart — "GuKG-Novelle 2022" is not "GuKG-Novelle 2024"', () => {
    expect(titleKey('GuKG-Novelle 2022')).not.toBe(titleKey('GuKG-Novelle 2024'))
  })
})

describe('findRelatedDrafts on the GP XXVII/XXVIII corpus', () => {
  it('finds the ElWG re-submission across the change of government (310/ME → 32/ME)', () => {
    const r = findRelatedDrafts(me('XXVII', 310), all)
    expect(r.predecessor).toBeNull()
    expect(r.successor).toMatchObject({ gp: 'XXVIII', inr: 32, citation: '32/ME', hasRv: null })
  })

  it('and the same pair from the successor side, with its deadline', () => {
    const r = findRelatedDrafts(me('XXVIII', 32), all)
    expect(r.predecessor).toMatchObject({ gp: 'XXVII', inr: 310, deadline: '2024-02-23' })
    expect(r.successor).toBeNull()
  })

  it('finds a re-run Begutachtung inside one GP (41/ME → 55/ME, three weeks later)', () => {
    expect(findRelatedDrafts(me('XXVII', 41), all).successor).toMatchObject({ gp: 'XXVII', inr: 55 })
    expect(findRelatedDrafts(me('XXVII', 55), all).predecessor).toMatchObject({ gp: 'XXVII', inr: 41 })
  })

  it('picks the NEAREST relative when a title recurs (school laws: 69 → 110 → … → 347/ME → 66/ME XXVIII)', () => {
    expect(findRelatedDrafts(me('XXVII', 69), all).successor).toMatchObject({ gp: 'XXVII', inr: 110 })
    expect(findRelatedDrafts(me('XXVII', 347), all).successor).toMatchObject({ gp: 'XXVIII', inr: 66 })
    expect(findRelatedDrafts(me('XXVIII', 66), all).predecessor).toMatchObject({ gp: 'XXVII', inr: 347 })
  })

  it('does not fuzz: a longer title naming more laws is a different draft', () => {
    // 57/ME "Strafgesetzbuch zur Umsetzung der Richtlinie … Geldwäsche, Änderung"
    // vs 235/ME "Strafgesetzbuch, Änderung" — fuzzy scores would pair them.
    expect(findRelatedDrafts(me('XXVII', 57), all)).toEqual({ predecessor: null, successor: null })
  })

  it('never relates a draft to its own dual-ministry duplicate row', () => {
    const dual = all.filter((c) => all.filter((d) => d.gp === c.gp && d.inr === c.inr).length > 1)
    expect(dual.length).toBeGreaterThan(0)
    for (const c of dual) {
      const r = findRelatedDrafts(c, all)
      expect(r.predecessor?.inr === c.inr && r.predecessor?.gp === c.gp).toBe(false)
      expect(r.successor?.inr === c.inr && r.successor?.gp === c.gp).toBe(false)
    }
  })
})
