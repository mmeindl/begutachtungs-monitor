import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DraftSummary } from '../shared/types'
import { chainCoverageOf } from '../shared/utils/draftStations'
import { viewOfDraft } from '../app/utils/entryView'
import type { VorlageRow } from '../server/utils/parliament/list101'
import { draftSummary } from './helpers/builders'
import { clearNitroCache, nitroCacheKeys, nitroCachedFunction } from './helpers/nitroCache'

/**
 * The station map when a draft's own record cannot be read
 * (`server/utils/parliament/stationMap.ts`; the §12.13 rule).
 *
 * Until 22.10.2026 `chainOf` answered a failed `getGegenstand` with a chain
 * at `begutachtung`, and the map kept it six hours. A chain at
 * `begutachtung` is what the list renders as „Bisher keine
 * Regierungsvorlage" — a claim about a stage record nobody read, and on a
 * draft whose Vorlage exists the false accusation the map was built to
 * avoid. The rule the list rows follow is older than the map: a claim
 * stands only where we looked, and a row without a chain says „Begutachtung
 * abgeschlossen" (`app/utils/entryView.ts`, `tests/entryView.test.ts`).
 *
 * Now an unread draft is left out of the map, and a map with a gap is kept
 * ten minutes instead of six hours. Asserted end to end: the map is built
 * by the real `chainOf` over Parliament's stage records, and the row is
 * rendered by the real `viewOfDraft`. Faked are the upstream reads and
 * Nitro's cache, as one that keeps (`helpers/nitroCache.ts`); the clock is
 * fake for `Date` only, so the TTLs can be walked past.
 */

vi.stubGlobal('defineCachedFunction', nitroCachedFunction)

vi.mock('../server/utils/parliament/drafts', () => ({
  getGegenstand: vi.fn(),
  getDraftsForGp: vi.fn(),
  getCurrentGp: vi.fn(async () => 'XXVIII'),
  getVorlagenForGp: vi.fn(),
}))
vi.mock('../server/utils/ris/bgblService', () => ({
  findBgblIForVorlage: vi.fn(async () => null),
  getBgblIssueDate: vi.fn(async () => null),
}))

const { getDraftsForGp, getGegenstand, getVorlagenForGp } = vi.mocked(await import('../server/utils/parliament/drafts'))
const { getStationMapForGp } = await import('../server/utils/parliament/stationMap')

// ---------------------------------------------------------------------------
// Two closed drafts of the running period: 1/ME became 10 d.B., 2/ME did not
// ---------------------------------------------------------------------------

const WITH_RV = draftSummary({ inr: 1, citation: '1/ME', active: false, deadline: '2026-01-15' })
const WITHOUT_RV = draftSummary({ inr: 2, citation: '2/ME', active: false, deadline: '2026-01-20' })

/** The draft's stage record, with or without the link to its Vorlage. */
const meRecord = (rv: boolean) => ({
  content: {
    stages: [
      { date: '01.12.2025', text: 'Einlangen im Nationalrat' },
      ...(rv ? [{ date: '01.02.2026', text: '<a href="https://www.parlament.gv.at/gegenstand/XXVIII/I/10">10 d.B.</a>' }] : []),
    ],
  },
})

const VORLAGE: VorlageRow = {
  gp: 'XXVIII',
  inr: 10,
  citation: '10 d.B.',
  title: 'Testgesetz',
  date: '2026-02-01',
  status: '2',
  parliamentUrl: 'https://www.parlament.gv.at/gegenstand/XXVIII/I/10',
}

/** Which records do not arrive, by `ityp-inr`. */
const unreachable = new Set<string>()

/** The row as the list renders it, with the chain the map holds for it. */
async function rowState(draft: DraftSummary): Promise<string> {
  const chains = await getStationMapForGp('XXVIII')
  return viewOfDraft({ ...draft, chain: chains[draft.inr] }).state.label
}

const MINUTE = 60_000

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-22T08:00:00Z'))
  clearNitroCache()
  unreachable.clear()
  getDraftsForGp.mockResolvedValue({ items: [WITH_RV, WITHOUT_RV] } as never)
  getVorlagenForGp.mockResolvedValue([VORLAGE])
  getGegenstand.mockImplementation((async (_gp: string, ityp: string, inr: number) => {
    if (unreachable.has(`${ityp}-${inr}`)) throw new Error('Parlament: The operation was aborted due to timeout')
    return ityp === 'ME' ? meRecord(inr === WITH_RV.inr) : { content: {} }
  }) as never)
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('every record answers', () => {
  it('says what the stage records say — the Vorlage, and the real absence of one', async () => {
    expect(await rowState(WITH_RV)).toBe('Regierungsvorlage liegt vor')
    expect(await rowState(WITHOUT_RV)).toBe('Bisher keine Regierungsvorlage')
  })

  it('keeps the map six hours', async () => {
    await getStationMapForGp('XXVIII')
    const calls = getGegenstand.mock.calls.length
    vi.setSystemTime(Date.now() + 5 * 60 * MINUTE)
    await getStationMapForGp('XXVIII')
    expect(getGegenstand).toHaveBeenCalledTimes(calls)
    vi.setSystemTime(Date.now() + 61 * MINUTE)
    await getStationMapForGp('XXVIII')
    expect(getGegenstand.mock.calls.length).toBeGreaterThan(calls)
  })
})

describe('a draft\'s own record does not arrive', () => {
  it('leaves the draft out of the map: its row says „Begutachtung abgeschlossen", never „Bisher keine Regierungsvorlage"', async () => {
    unreachable.add('ME-1')
    const chains = await getStationMapForGp('XXVIII')
    expect(chains[WITH_RV.inr]).toBeUndefined()
    expect(await rowState(WITH_RV)).toBe('Begutachtung abgeschlossen')
    // What was read still stands — the real absence included.
    expect(await rowState(WITHOUT_RV)).toBe('Bisher keine Regierungsvorlage')
  })

  it('keeps that map ten minutes, not six hours — and then the row says what the record says', async () => {
    unreachable.add('ME-1')
    await getStationMapForGp('XXVIII')
    expect(nitroCacheKeys()).toEqual(['stations-gp:XXVIII'])

    // Upstream recovers; inside the ten minutes the map is not rebuilt.
    unreachable.clear()
    vi.setSystemTime(Date.now() + 9 * MINUTE)
    expect(await rowState(WITH_RV)).toBe('Begutachtung abgeschlossen')

    vi.setSystemTime(Date.now() + 2 * MINUTE)
    expect(await rowState(WITH_RV)).toBe('Regierungsvorlage liegt vor')
  })

  it('a period in which every record failed is `unknown`, not a period in which nothing moved', async () => {
    unreachable.add('ME-1')
    unreachable.add('ME-2')
    const chains = await getStationMapForGp('XXVIII')
    expect(Object.keys(chains)).toEqual([])
    // A running period: had every row stood at `begutachtung`, this would be
    // `linked`, and every row of the list would claim „Bisher keine
    // Regierungsvorlage".
    expect(chainCoverageOf(Object.values(chains), false)).toBe('unknown')
  })
})

describe('a Vorlage\'s record does not arrive', () => {
  it('keeps the chain at the weakest claim the stage record supports, and the map only ten minutes', async () => {
    unreachable.add('I-10')
    const chains = await getStationMapForGp('XXVIII')
    expect(chains[WITH_RV.inr]).toMatchObject({ station: 'rv', rvCitation: '10 d.B.', filingOpen: false })

    unreachable.clear()
    getGegenstand.mockClear()
    vi.setSystemTime(Date.now() + 11 * MINUTE)
    await getStationMapForGp('XXVIII')
    expect(getGegenstand).toHaveBeenCalledWith('XXVIII', 'I', 10)
  })

  it('and so does a Vorlagen list that does not arrive', async () => {
    getVorlagenForGp.mockRejectedValueOnce(new Error('Parlament: fetch failed'))
    await getStationMapForGp('XXVIII')
    getVorlagenForGp.mockClear()
    vi.setSystemTime(Date.now() + 11 * MINUTE)
    await getStationMapForGp('XXVIII')
    expect(getVorlagenForGp).toHaveBeenCalledTimes(1)
  })
})
