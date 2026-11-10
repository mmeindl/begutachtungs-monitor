/**
 * The page's sentence about a Begutachtung before a Landesgesetz
 * (`app/utils/landLaw.ts`, §12.70): „ohne Begutachtung" only for `none`,
 * never the words the product does not use, and every other Land told why.
 */
import { describe, expect, it } from 'vitest'
import type { LandLaw, LandLawBegutachtung } from '../shared/types'
import { LAND_CODES } from '../shared/utils/laender'
import { landLawGapDe, landLawStatementDe } from '../app/utils/landLaw'

const FORBIDDEN = /übersprungen|umgangen|ohne Öffentlichkeit|keine Möglichkeit|Paragraf/i
const ALL: LandLawBegutachtung[] = [
  { kind: 'consulted', by: 'draft' }, { kind: 'consulted', by: 'heading' }, { kind: 'none' },
  ...(['unsupported', 'budget', 'similar-draft', 'mentions', 'contradictory', 'unread', 'no-route', 'pending'] as const).map((reason) => ({ kind: 'silent' as const, reason })),
]
const route = (kind: 'vorlage' | 'antrag'): LandLaw['route'] => ({ kind, number: '1', url: 'https://example.invalid/1.pdf' })

describe('landLawStatementDe', () => {
  it('says „ohne Begutachtung" for none and for nothing else', () => {
    for (const b of ALL) {
      for (const r of [route('vorlage'), route('antrag'), null]) {
        const s = landLawStatementDe({ route: r, begutachtung: b }) ?? ''
        expect(s).not.toMatch(FORBIDDEN)
        expect(s.includes('ohne Begutachtung')).toBe(b.kind === 'none')
      }
    }
  })

  it('states an Initiativantrag where RIS does, even without a statement', () => {
    expect(landLawStatementDe({ route: route('antrag'), begutachtung: { kind: 'silent', reason: 'unsupported' } })).toBe('Das Gesetz kam als Initiativantrag in den Landtag.')
    expect(landLawStatementDe({ route: route('vorlage'), begutachtung: { kind: 'silent', reason: 'unsupported' } })).toBeNull()
  })

  it('gives every Land a reason', () => {
    for (const land of LAND_CODES) expect(landLawGapDe(land)).toMatch(/\.$/)
  })
})
