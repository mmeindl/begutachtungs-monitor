import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { LandTextStation } from '../shared/types'
import { isMiss, mutationOutcome, mutations } from '../scripts/lib/stationMutations'
import { nitroCachedFunction } from './helpers/nitroCache'

/**
 * A real pair per Land, frozen (21.11.2026, audit of 20.11.2026, G077 and
 * G115): until this file no real Land document stood behind the station
 * readers on a push. The tests of `draftPdfLaw` and `lgblUnits` build their
 * texts for the rules, and a reader change that broke a real Kärnten,
 * Oberösterreich or Salzburg document passed CI, noticed only at a hand run
 * of `scripts/harness/landStations.ts`.
 *
 * Each fixture is a Begutachtungsentwurf as `pagesOfBytes` reads its PDF —
 * the pages of the law text only, the Erläuterungen left out — and the
 * Landesgesetzblatt's RIS XML without the signatures under the law. Pinned:
 * every unit id each reader finds, and the outcome of every unit of the
 * comparison the route serves (`compareReadTexts`) — the same as over the
 * whole documents in the harness's run of 21.11.2026. And every fault class
 * of the Bund (`stationMutations.ts`) set into the Landesgesetzblatt's units
 * has to come out a change of substance.
 *
 * A golden that moves is a reader change to read, not a number to update:
 * read the unit's two texts first.
 */

vi.stubGlobal('defineCachedFunction', nitroCachedFunction)
vi.stubGlobal('DERIVED_CACHE', 'derived')

const fixture = (land: string) => JSON.parse(readFileSync(new URL(`./fixtures/laender/stations-${land}.json`, import.meta.url), 'utf8')) as { draft: string; lgbl: string; pages: string[]; xml: string }
const FIXTURES = { ktn: fixture('ktn'), ooe: fixture('ooe'), sbg: fixture('sbg') }
const XML_URL = (land: string) => `https://www.ris.bka.gv.at/Dokumente/LgblAuth/${land}.xml`

// The Landesgesetzblatt is read as the route reads it (`readLgbl`), its XML from the fixture.
vi.mock('../server/utils/upstream/fetch', async (original) => ({
  ...(await original<typeof import('../server/utils/upstream/fetch')>()),
  upstreamText: async (url: string) => {
    const land = Object.keys(FIXTURES).find((l) => url === XML_URL(l))
    if (!land) throw new Error(`not in the fixture: ${url}`)
    return FIXTURES[land as keyof typeof FIXTURES].xml
  },
}))

const { readLgbl, readPdf } = await import('../server/utils/laender/texts/read')
const { compareReadTexts } = await import('../server/utils/laender/landLawDiffService')

async function compared(land: keyof typeof FIXTURES) {
  const f = FIXTURES[land]
  const draft = await readPdf(`https://example.invalid/${land}.pdf`, async () => f.pages)
  const lgbl = await readLgbl(XML_URL(land))
  const doc = (label: string) => ({ label, url: null, publisher: '' })
  const value = compareReadTexts('entwurf', 'lgbl', [draft, lgbl], [doc('Entwurf'), doc(f.lgbl)])
  return { draft, lgbl, value }
}

const outcome = (u: { article: string | null; fromId: string | null; id: string; change: string; editorial: boolean }) =>
  `${u.article ?? '—'} | ${u.fromId ?? '—'}→${u.id} ${u.change}${u.editorial ? ' redaktionell' : ''}`

/* Salzburg's draft names its law by the placeholder title, the Landesgesetzblatt by its own: the comparison files every unit under the latter. */
const SBG_DRAFT = 'Gesetz vom ........................, mit dem das Salzburger Wohnbauförderungsgesetz 2025 geändert wird'
const SBG_LGBL = '5. Gesetz vom 5. November 2025, mit dem das Salzburger Wohnbauförderungsgesetz 2025 geändert wird'

const GOLDEN: Record<keyof typeof FIXTURES, { draft: string[]; lgbl: string[]; units: string[] }> = {
  // Kärnten 7700/2026-12 → LGBl. Nr. 57/2026: every outcome once, the instruction Z 2 reworded at another place.
  ktn: {
    draft: [
      'Artikel I | Z1',
      'Artikel I | Z2',
      'Artikel I | Z3',
    ],
    lgbl: [
      'Artikel I | Z1',
      'Artikel I | Z2',
      'Artikel I | Z3',
    ],
    units: [
      'Artikel I | Z1→Z1 changed',
      'Artikel I | —→Z2 inserted',
      'Artikel I | Z2→Z2 removed',
      'Artikel I | Z3→Z3 unchanged',
    ],
  },
  // Oberösterreich 16116 → LGBl. Nr. 45/2026: the draft's law text behind five pages of Erläuterungen.
  ooe: {
    draft: [
      'Artikel I | Z1',
      'Artikel I | Z2',
      'Artikel I | Z3',
      'Artikel I | Z4',
      'Artikel I | Z5',
    ],
    lgbl: [
      'Artikel I | Z1',
      'Artikel I | Z2',
      'Artikel I | Z3',
      'Artikel I | Z4',
      'Artikel I | Z5',
    ],
    units: [
      'Artikel I | Z1→Z1 changed',
      'Artikel I | Z2→Z2 unchanged',
      'Artikel I | Z3→Z3 unchanged',
      'Artikel I | Z4→Z4 unchanged',
      'Artikel I | Z5→Z5 changed',
    ],
  },
  // Salzburg 32850 → LGBl. Nr. 5/2026: Salzburg's running head (a drive path and Word's save stamp), sub-instructions „4.1.", two changes badged editorial.
  sbg: {
    draft: [
      `${SBG_DRAFT} | Z1`,
      `${SBG_DRAFT} | Z2`,
      `${SBG_DRAFT} | Z3`,
      `${SBG_DRAFT} | Z4`,
      `${SBG_DRAFT} | Z5`,
    ],
    lgbl: [
      `${SBG_LGBL} | Z1`,
      `${SBG_LGBL} | Z2`,
      `${SBG_LGBL} | Z3`,
      `${SBG_LGBL} | Z4`,
      `${SBG_LGBL} | Z5`,
    ],
    units: [
      `${SBG_LGBL} | Z1→Z1 changed redaktionell`,
      `${SBG_LGBL} | Z2→Z2 unchanged`,
      `${SBG_LGBL} | Z3→Z3 changed`,
      `${SBG_LGBL} | Z4→Z4 unchanged`,
      `${SBG_LGBL} | Z5→Z5 changed redaktionell`,
    ],
  },
}

describe('the station readers over a real pair per Land', () => {
  for (const land of ['ktn', 'ooe', 'sbg'] as const) {
    it(`${land}: ${FIXTURES[land].draft} → ${FIXTURES[land].lgbl}, every unit and its outcome`, async () => {
      const { draft, lgbl, value } = await compared(land)
      expect(value.available).toBe(true)
      expect({
        draft: (draft.units ?? []).map((u) => `${u.article ?? '—'} | ${u.id}`),
        lgbl: (lgbl.units ?? []).map((u) => `${u.article ?? '—'} | ${u.id}`),
        units: value.units.map(outcome),
      }).toEqual(GOLDEN[land])
      expect(value.withheld).toEqual([])
    })
  }

  it('every fault set into a real Landesgesetzblatt\'s units is a change of substance', async () => {
    const misses: string[] = []
    let tried = 0
    for (const land of ['ktn', 'ooe', 'sbg'] as const) {
      const { lgbl } = await compared(land)
      for (const unit of lgbl.units ?? []) {
        for (const m of mutations(unit.text)) {
          tried++
          const doc = { label: 'Einheit', url: null, publisher: '' }
          const got = compareReadTexts('rv' as LandTextStation, 'lgbl', [{ units: [unit], text: unit.text }, { units: [{ ...unit, text: m.text }], text: m.text }], [doc, doc])
          const o = mutationOutcome(got.units)
          if (isMiss(o)) misses.push(`${land} ${unit.id} ${m.kind} → ${o}`)
        }
      }
    }
    expect(tried).toBeGreaterThan(30)
    expect(misses).toEqual([])
  })
})
