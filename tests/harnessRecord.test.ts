import { execSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { DIRTY, UNKNOWN_COMMIT, commitStamp, corpusReach, floorOf, harnessStamp, landListWindows } from '../scripts/lib/harnessRecord'

/**
 * Every harness record names its code and its reach (20.11.2026), so the
 * builder of `/genauigkeit` can hold the records of one round against each
 * other instead of stamping them with whatever is checked out when it writes.
 */

describe('commitStamp', () => {
  it('names the commit, and marks a tree with changes under the measured paths', () => {
    expect(commitStamp('a147acce\n', '')).toBe('a147acce')
    expect(commitStamp('a147acce\n', ' M server/utils/kons/consolidate.ts\n')).toBe(`a147acce${DIRTY}`)
    expect(commitStamp('a147acce', '?? scripts/harness/probe.ts\n')).toBe(`a147acce${DIRTY}`)
  })

  it('says it does not know rather than passing on what git did not answer', () => {
    expect(commitStamp('', '')).toBe(UNKNOWN_COMMIT)
    expect(commitStamp('fatal: not a git repository', '')).toBe(UNKNOWN_COMMIT)
  })
})

describe('harnessStamp', () => {
  it('stamps the time and the checkout it runs in', () => {
    const stamp = harnessStamp()
    expect(Number.isNaN(Date.parse(stamp.at))).toBe(false)
    const head = execSync('git rev-parse --short=8 HEAD', { encoding: 'utf8' }).trim()
    expect(stamp.commit.startsWith(head)).toBe(true)
  })

  it('does not know the commit outside a checkout', () => {
    expect(harnessStamp('/').commit).toBe(UNKNOWN_COMMIT)
  })
})

describe('corpusReach', () => {
  it('counts what was reached from what was asked for and what failed', () => {
    expect(corpusReach(60, [{ id: 'BGBLA_2025_I_7', cause: 'offline' }])).toEqual({ requested: 60, reached: 59, unreached: [{ id: 'BGBLA_2025_I_7', cause: 'offline' }] })
    expect(corpusReach(3, [])).toMatchObject({ requested: 3, reached: 3 })
  })
})

describe('floorOf', () => {
  it('holds a class tried 20 times or more to the floor, and fails it below', () => {
    const floor = floorOf([{ key: 'Payload', tried: 432, caught: 416 }, { key: 'E-neben', tried: 162, caught: 150 }], 95)
    expect(floor).toMatchObject({ min: 95, passed: false, failed: ['E-neben'], unheld: [] })
    expect(floor.status.get('Payload')).toBe('gehalten')
    expect(floor.status.get('E-neben')).toBe('verfehlt')
  })

  it('says „nicht gehalten" of a class tried fewer than 20 times, rather than passing it in silence', () => {
    const floor = floorOf([{ key: 'Fehlt', tried: 0, caught: 0 }, { key: 'Lücke', tried: 14, caught: 14 }, { key: 'E', tried: 133, caught: 133 }], 95)
    expect(floor).toMatchObject({ passed: true, failed: [], unheld: ['Fehlt', 'Lücke'] })
    expect(floor.status.get('Lücke')).toBe('nicht gehalten')
    expect(floor.status.get('E')).toBe('gehalten')
  })
})

describe('landListWindows — what a cached Länder list held, per Land (21.11.2026)', () => {
  it('gives each Land its latest Beginn and Frist, the drafts with neither, and when the list was fetched', () => {
    const at = new Date('2026-11-04T14:24:46Z')
    expect(landListWindows([
      { land: 'sbg', startedAt: '2026-11-04', deadline: '2026-12-02' },
      { land: 'sbg', startedAt: '2026-10-01', deadline: '2026-12-09' },
      { land: 'ooe', startedAt: null, deadline: '2026-11-20' },
      { land: 'bgld', startedAt: null, deadline: null },
    ], at)).toEqual({
      bgld: { newestStart: null, newestDeadline: null, undated: 1, listFetchedAt: '2026-11-04T14:24:46.000Z' },
      ooe: { newestStart: null, newestDeadline: '2026-11-20', undated: 0, listFetchedAt: '2026-11-04T14:24:46.000Z' },
      sbg: { newestStart: '2026-11-04', newestDeadline: '2026-12-09', undated: 0, listFetchedAt: '2026-11-04T14:24:46.000Z' },
    })
  })
})
