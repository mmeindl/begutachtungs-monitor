/**
 * The cut of `/entwuerfe` when a late half's rows sort in (12.11.2026): a
 * re-taken cut that keeps every row the reader saw, and an opened „Alle"
 * (`Infinity`) that stays open. The composable around it runs on Nuxt's
 * auto-imports and is not reachable here (`vue` is not resolvable from the
 * test root); its cut is `slice(0, visible)`, which takes `Infinity` too.
 */
import { describe, expect, it } from 'vitest'
import { cutKeeping } from '../app/utils/pagedList'
import { shownLabelDe } from '../shared/utils/format'

const keys = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`)

describe('an opened „Alle" as Infinity', () => {
  it('cuts nothing and reads as everything shown in the footer', () => {
    const rows = keys('me', 150)
    expect(rows.slice(0, Infinity)).toHaveLength(150)
    expect(shownLabelDe(Infinity, 150)).toBe('150 von 150')
  })
})

describe('cutKeeping', () => {
  /* The merged list before and after the Länder arrive, sorted: the Bund's
   * rows with Länder rows sorted in between them. */
  const before = keys('me', 100)
  const after = before.flatMap((key, i) => (i % 5 === 0 ? [`land${i}`, key] : [key]))

  it('grows the cut so every row shown before stays shown', () => {
    const cut = cutKeeping(before, after, 50)
    const shownAfter = new Set(after.slice(0, cut))
    for (const key of before.slice(0, 50)) expect(shownAfter.has(key)).toBe(true)
    // 50 Bund rows and the ten Länder rows sorted in among them.
    expect(cut).toBe(60)
  })

  it('leaves the cut alone where nothing sorted in above its end', () => {
    expect(cutKeeping(before, [...before, 'land0'], 50)).toBe(50)
  })

  it('never shrinks the cut', () => {
    expect(cutKeeping(before, before.slice(0, 30), 50)).toBe(50)
  })

  it('keeps an opened „Alle" open', () => {
    expect(cutKeeping(before, after, Infinity)).toBe(Infinity)
  })

  it('keeps the footer\'s counts right: what is hidden is the rest of the merged list', () => {
    const cut = cutKeeping(before, after, 50)
    expect(after.length - cut).toBe(after.length - 60)
  })
})
