import { execSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { DIRTY, UNKNOWN_COMMIT, commitStamp, corpusReach, harnessStamp } from '../scripts/lib/harnessRecord'

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
