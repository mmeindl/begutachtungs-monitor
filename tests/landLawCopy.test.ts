/**
 * The Begutachtung station of a Landesgesetz (`app/utils/landLaw.ts`): „ohne Begutachtung" only for `none`, never the words the product
 * does not use, pale wherever nothing or nothing certain is known, ink only
 * where a Begutachtung took place.
 */
import { describe, expect, it } from 'vitest'
import type { LandLaw, LandLawBegutachtung } from '../shared/types'
import { LAND_CODES } from '../shared/utils/laender'
import { landLawBegutachtungFacts } from '../app/utils/landLaw'
import { landLawStations } from '../app/utils/spine'

const FORBIDDEN = /übersprungen|umgangen|ohne Öffentlichkeit|keine Möglichkeit|Paragraf/i
const ALL: LandLawBegutachtung[] = [
  { kind: 'consulted', by: 'draft' }, { kind: 'consulted', by: 'heading' }, { kind: 'none' },
  ...(['unsupported', 'register-reach', 'budget', 'similar-draft', 'mentions', 'contradictory', 'unread', 'no-route', 'pending'] as const).map((reason) => ({ kind: 'silent' as const, reason })),
]
const route = (kind: 'vorlage' | 'antrag'): LandLaw['route'] => ({ kind, number: '1', url: 'https://example.invalid/1.pdf' })

describe('landLawBegutachtungFacts', () => {
  it('says „ohne Begutachtung" for none and for nothing else, pale unless one took place', () => {
    for (const land of LAND_CODES) for (const b of ALL) for (const r of [route('vorlage'), route('antrag'), null]) for (const covers of [true, false, null]) {
      const { facts, pale } = landLawBegutachtungFacts({ land, route: r, begutachtung: b, registerCovers: covers })
      const s = facts.join(' · ')
      expect(s).not.toMatch(FORBIDDEN)
      expect(s.includes('ohne Begutachtung')).toBe(b.kind === 'none')
      expect(pale).toBe(b.kind !== 'consulted')
    }
  })

  it('says a draft may have existed where the register does not reach back', () => {
    expect(landLawBegutachtungFacts({ land: 'w', route: null, begutachtung: { kind: 'silent', reason: 'unsupported' }, registerCovers: false }).facts)
      .toEqual(['nicht feststellbar', 'Wien veröffentlicht Entwürfe höchstens ein Jahr lang', 'ein Entwurf kann es gegeben haben und ist nicht mehr veröffentlicht'])
    expect(landLawBegutachtungFacts({ land: 'bgld', route: null, begutachtung: { kind: 'silent', reason: 'unsupported' }, registerCovers: true }).facts)
      .toEqual(['nicht feststellbar', 'kein Entwurf im Register des Landes zugeordnet'])
  })

  it('makes the heading a win: an ordinary station', () => {
    expect(landLawBegutachtungFacts({ land: 'sbg', route: route('vorlage'), begutachtung: { kind: 'consulted', by: 'heading' }, registerCovers: true }))
      .toEqual({ facts: ['laut Erläuterungen der Regierungsvorlage durchgeführt'], pale: false })
  })

  it('opens the bar, and the Initiativantrag station no longer says „ohne Begutachtung"', () => {
    const stations = landLawStations({ land: 'sbg', route: route('antrag'), begutachtung: { kind: 'none' }, registerCovers: true, decidedAt: '2025-07-02', nr: 'LGBl. Nr. 68/2025', date: '2025-07-21' })
    expect(stations.map((s) => s.id)).toEqual(['begutachtung', 'rv', 'parlament', 'bgbl'])
    expect(stations[0]).toMatchObject({ state: 'never', trail: 'not-walked' })
    const unknown = landLawStations({ land: 'w', route: null, begutachtung: { kind: 'silent', reason: 'unsupported' }, registerCovers: false, decidedAt: null, nr: 'LGBl. Nr. 44/2026', date: '2026-11-09' })
    expect(unknown[0]!.trail).toBe('unknown')
    const walked = landLawStations({ land: 'sbg', route: route('vorlage'), begutachtung: { kind: 'consulted', by: 'heading' }, registerCovers: true, decidedAt: null, nr: 'LGBl. Nr. 31/2026', date: '2026-04-14' })
    expect(walked[0]).toMatchObject({ state: 'done' })
    expect(walked[0]!.trail).toBeUndefined()
    expect(stations[1]!.facts).not.toContain('ohne Begutachtung')
  })
})

describe('the count line for Land laws (second round)', () => {
  it('counts covered and uncovered laws apart, never added', async () => {
    const { draftCountLabel } = await import('../app/utils/draftFilters')
    const silent = { kind: 'silent', reason: 'unsupported' } as const
    expect(draftCountLabel({
      me: null, vorlagen: [], ris: null, laterStationsOnly: false,
      landLaws: [
        { begutachtung: { kind: 'none' }, registerCovers: true },
        { begutachtung: silent, registerCovers: true },
        { begutachtung: silent, registerCovers: false },
        { begutachtung: silent, registerCovers: false },
      ],
    })).toBe('1 Gesetz ohne Begutachtung · 1 Landesgesetz ohne zugeordneten Entwurf · 2 Landesgesetze')
  })
})

describe('landFassungFacts', () => {
  it('says „noch nicht eingearbeitet" only while that is likely', async () => {
    const { landFassungFacts } = await import('../app/utils/landLaw')
    const empty = { bgbl: 'LGBl. Nr. 1/2026', laws: [], repealed: [] }
    expect(landFassungFacts(empty, '2026-11-01', '2026-11-10')[0]!.text).toMatch(/noch nicht eingearbeitet/)
    expect(landFassungFacts(empty, '2020-01-01', '2026-11-10')[0]!.text).toBe('Im RIS ist keine konsolidierte Fassung verzeichnet, die dieses Landesgesetzblatt nennt.')
  })
})
