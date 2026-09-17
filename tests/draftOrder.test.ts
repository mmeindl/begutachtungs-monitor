import { describe, expect, it } from 'vitest'
import { compareDrafts, draftOrderKey, type OrderedDraft } from '../shared/utils/draftOrder'

/**
 * The one order both kinds of row use (docs/architecture.md §12.19).
 *
 * `risConsultations.test.ts` covers the rule itself through
 * `sortConsultations`, which delegates here. What earns its own tests is the
 * INTERLEAVING: `/entwuerfe` merges two endpoints' results client-side, and
 * the merged order has to be the one order — otherwise rows appear to jump
 * when a filter narrows the list to a single kind.
 */

function d(overrides: Partial<OrderedDraft> = {}): OrderedDraft {
  return { active: true, deadline: '2026-10-19', startedAt: '2026-09-08', title: 'Titel', ...overrides }
}

/** A Ministerialentwurf row as the page maps it: Einlangen → startedAt. */
const me = (title: string, o: Partial<OrderedDraft> = {}) => ({ tag: 'me', ...d({ title, ...o }) })
/** A record without a Gegenstand, which carries `startedAt` natively. */
const ris = (title: string, o: Partial<OrderedDraft> = {}) => ({ tag: 'ris', ...d({ title, ...o }) })

const order = (rows: (OrderedDraft & { tag: string })[]) =>
  [...rows].sort(compareDrafts).map((r) => `${r.tag}:${r.title}`)

describe('compareDrafts', () => {
  it('puts open before closed, whatever the dates say', () => {
    expect(
      order([
        ris('geschlossen', { active: false, deadline: '2026-12-01' }),
        me('offen', { active: true, deadline: '2026-01-01' }),
      ]),
    ).toEqual(['me:offen', 'ris:geschlossen'])
  })

  it('leads the open ones with the nearest Frist', () => {
    expect(
      order([
        me('spät', { deadline: '2026-11-30' }),
        ris('bald', { deadline: '2026-09-20' }),
        me('mittig', { deadline: '2026-10-15' }),
      ]),
    ).toEqual(['ris:bald', 'me:mittig', 'me:spät'])
  })

  it('sorts an open row without a Frist after the dated ones', () => {
    expect(
      order([ris('ohne', { deadline: null }), me('mit', { deadline: '2026-12-31' })]),
    ).toEqual(['me:mit', 'ris:ohne'])
  })

  it('orders the closed ones most recently ended first', () => {
    expect(
      order([
        me('älter', { active: false, deadline: '2025-03-01' }),
        ris('neuer', { active: false, deadline: '2026-03-01' }),
      ]),
    ).toEqual(['ris:neuer', 'me:älter'])
  })

  it('falls back to the start for a closed row with no Frist', () => {
    expect(
      order([
        ris('altbegonnen', { active: false, deadline: null, startedAt: '2025-01-01' }),
        me('neubegonnen', { active: false, deadline: null, startedAt: '2026-01-01' }),
      ]),
    ).toEqual(['me:neubegonnen', 'ris:altbegonnen'])
  })

  it('breaks a tie by title, across both kinds', () => {
    // Four Verordnungen shared one Frist on 2026-10-16; the tie-break is
    // what keeps the merged list stable between visits — and it must not
    // depend on which endpoint a row came from.
    expect(
      order([
        ris('Ökosoziale Kriterien-Verordnung', { deadline: '2026-10-16' }),
        me('Industriestrompreisgesetz', { deadline: '2026-10-16' }),
      ]),
    ).toEqual(['me:Industriestrompreisgesetz', 'ris:Ökosoziale Kriterien-Verordnung'])
  })
})

describe('draftOrderKey', () => {
  it('reads the Einlangen as the day the Begutachtung started', () => {
    expect(
      draftOrderKey({
        active: true,
        deadline: '2026-10-16',
        arrivedAt: '2026-09-08',
        title: 'Industriestrompreisgesetz',
      }),
    ).toEqual({
      active: true,
      deadline: '2026-10-16',
      startedAt: '2026-09-08',
      title: 'Industriestrompreisgesetz',
    })
  })

  it('orders a Ministerialentwurf against a RIS record the same way both pages do', () => {
    // `/` and `/entwuerfe` both interleave the kinds. The mapping is the
    // half of that which is NOT symmetric, so it belongs to the comparator
    // rather than to either page.
    const me = draftOrderKey({
      active: true,
      deadline: '2026-10-16',
      arrivedAt: '2026-09-08',
      title: 'Industriestrompreisgesetz',
    })
    const ris: OrderedDraft = {
      active: true,
      deadline: '2026-10-16',
      startedAt: '2026-09-03',
      title: 'Ökosoziale Kriterien-Verordnung',
    }
    expect(compareDrafts(me, ris)).toBeLessThan(0)
  })
})

describe('the merged list', () => {
  it('interleaves the two kinds by Frist rather than grouping them', () => {
    // The whole point of one list: what closes next leads, whether or not
    // Parliament happens to carry a Gegenstand for it.
    expect(
      order([
        me('ME spät', { deadline: '2026-11-01' }),
        ris('VO früh', { deadline: '2026-09-19' }),
        me('ME früh', { deadline: '2026-09-25' }),
        ris('VO spät', { deadline: '2026-12-01' }),
      ]),
    ).toEqual(['ris:VO früh', 'me:ME früh', 'me:ME spät', 'ris:VO spät'])
  })

  it('keeps each kind in its endpoint order when the list is filtered to one', () => {
    // A filter must not reshuffle: the sequence of the ME rows inside the
    // mixed list has to equal their sequence on their own.
    const mixed = [
      me('A', { deadline: '2026-10-01' }),
      ris('X', { deadline: '2026-09-15' }),
      me('B', { deadline: '2026-09-20' }),
      ris('Y', { deadline: '2026-11-11' }),
    ]
    const onlyMe = order(mixed.filter((r) => r.tag === 'me'))
    const fromMixed = order(mixed).filter((k) => k.startsWith('me:'))
    expect(fromMixed).toEqual(onlyMe)
  })

  it('is a total order — sorting twice changes nothing', () => {
    const rows = [
      me('gleich', { deadline: '2026-10-16' }),
      ris('gleich', { deadline: '2026-10-16' }),
      me('offen ohne Frist', { deadline: null }),
      ris('zu', { active: false, deadline: '2026-01-01' }),
    ]
    const once = order(rows)
    const twice = order([...rows].sort(compareDrafts))
    expect(twice).toEqual(once)
  })
})
