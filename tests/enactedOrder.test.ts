import { describe, expect, it } from 'vitest'
import { pickEnacted } from '../server/utils/parliament/enactedOrder'

/**
 * „Zuletzt Gesetz geworden" — which laws the section shows, and in which
 * order (`server/utils/parliament/enactedOrder.ts`).
 *
 * It matters because the section's whole claim is that SELECTION IS NEVER A
 * JUDGEMENT: the Bundesgesetzblatt's own sequence decides, and nothing
 * else. A wrong order would not look broken — it would look like an
 * editorial choice nobody made.
 *
 * The `order` values below are `bgblOrderKey`'s output (year and number in
 * one sortable integer, `detailJson.ts`), which has its own tests; here it
 * is only the key.
 */

const candidate = (order: number, gp: string, inr: number, bgbl = `BGBl. I Nr. ${order % 1000}/2026`) =>
  ({ order, draft: { gp, inr }, bgblNumber: bgbl })

describe('pickEnacted', () => {
  it('puts the newest Kundmachung first', () => {
    const out = pickEnacted([
      candidate(2026039, 'XXVIII', 12),
      candidate(2026081, 'XXVIII', 74),
      candidate(2026007, 'XXVIII', 3),
    ])
    expect(out.map((c) => c.order)).toEqual([2026081, 2026039, 2026007])
  })

  it('orders across years by the same key', () => {
    const out = pickEnacted([
      candidate(2025120, 'XXVII', 300),
      candidate(2026001, 'XXVIII', 1),
    ])
    expect(out.map((c) => c.draft.inr)).toEqual([1, 300])
  })

  /* ME → RV is 1:n and both strands can reach the Bundesgesetzblatt: 74/ME
   * produced 443 and 444 d.B., promulgated as BGBl. I 81/2026 and 39/2026
   * (§13.4). Without the dedup the same card renders twice as soon as both
   * fall into the window. */
  it('shows one row per draft, and it is the newest Kundmachung', () => {
    const out = pickEnacted([
      candidate(2026039, 'XXVIII', 74, 'BGBl. I Nr. 39/2026'),
      candidate(2026081, 'XXVIII', 74, 'BGBl. I Nr. 81/2026'),
    ])
    expect(out).toHaveLength(1)
    expect(out[0]!.bgblNumber).toBe('BGBl. I Nr. 81/2026')
  })

  /* The key is the DRAFT, and a draft is a period plus a number: a Vorlage
   * may carry a draft from the period before it, where the same `inr` is a
   * different Entwurf entirely. */
  it('tells two periods apart', () => {
    const out = pickEnacted([
      candidate(2026081, 'XXVIII', 74),
      candidate(2026039, 'XXVII', 74),
    ])
    expect(out).toHaveLength(2)
    expect(out.map((c) => c.draft.gp)).toEqual(['XXVIII', 'XXVII'])
  })

  it('keeps the input order among equal keys and does not touch the input', () => {
    const input = [candidate(2026010, 'XXVIII', 1), candidate(2026010, 'XXVIII', 2)]
    const before = [...input]
    expect(pickEnacted(input).map((c) => c.draft.inr)).toEqual([1, 2])
    expect(input).toEqual(before)
  })

  it('answers an empty scan with an empty list', () => {
    expect(pickEnacted([])).toEqual([])
  })

  /* NO LIMIT HERE, on purpose: `getRecentlyEnacted` cuts the list only once
   * it has the list-81 row for each draft, because a candidate it cannot
   * describe is a card it cannot render and must not consume a slot. This
   * test is what says so — the function hands back everything. */
  it('does not cut the list itself', () => {
    const many = Array.from({ length: 12 }, (_, i) => candidate(2026100 - i, 'XXVIII', i))
    expect(pickEnacted(many)).toHaveLength(12)
  })
})
