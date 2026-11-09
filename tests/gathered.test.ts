/**
 * How long a cached `Gathered` is kept (`server/utils/cache/gathered.ts`):
 * complete for the function's `maxAge`, failed for `ms`, and — since
 * 09.11.2026 — still building (`pending`) for `pendingMs` only, so a cold
 * start's gap does not outlive the build by ten minutes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { keepIncompleteFor, onlyComplete } from '../server/utils/cache/gathered'

const TEN_MIN = 10 * 60 * 1000
const FIVE_S = 5_000

describe('keepIncompleteFor', () => {
  afterEach(() => vi.useRealTimers())
  const at = (ageMs: number) => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000_000)
    return 1_000_000_000 - ageMs
  }
  const keep = keepIncompleteFor(TEN_MIN, FIVE_S)

  it('keeps a complete value whatever its age — the maxAge decides', () => {
    expect(keep({ value: { complete: true }, mtime: at(TEN_MIN * 100) })).toBe(true)
  })

  it('keeps a failed value for the long lifetime', () => {
    expect(keep({ value: { complete: false }, mtime: at(TEN_MIN - 1) })).toBe(true)
    expect(keep({ value: { complete: false }, mtime: at(TEN_MIN + 1) })).toBe(false)
    expect(keep({ value: { complete: false, pending: false }, mtime: at(60_000) })).toBe(true)
  })

  it('keeps a pending value for seconds only', () => {
    expect(keep({ value: { complete: false, pending: true }, mtime: at(FIVE_S - 1) })).toBe(true)
    expect(keep({ value: { complete: false, pending: true }, mtime: at(FIVE_S + 1) })).toBe(false)
    expect(keep({ value: { complete: false, pending: true }, mtime: at(60_000) })).toBe(false)
  })

  it('treats pending like a failure where no pendingMs is given — the old callers', () => {
    expect(keepIncompleteFor(TEN_MIN)({ value: { complete: false, pending: true }, mtime: at(60_000) })).toBe(true)
  })

  it('never keeps no value', () => {
    expect(keep({})).toBe(false)
    expect(onlyComplete({ value: { complete: false, pending: true } })).toBe(false)
  })
})
