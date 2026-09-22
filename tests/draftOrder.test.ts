import { describe, expect, it } from 'vitest'
import type { DraftSummary, OpenVorlage, RisConsultation } from '../shared/types'
import {
  compareDrafts,
  compareRowsByStatements,
  type DraftListRow,
  draftOrderKey,
  type OrderedDraft,
  rowOrderKey,
} from '../shared/utils/draftOrder'

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

/**
 * The three row kinds of `/entwuerfe`, and the two orders they share.
 *
 * `rowOrderKey` is the mapping each kind needs to enter the comparator above;
 * `compareRowsByStatements` is the list's second order, and the one that must
 * NOT interleave the unrankable half at zero.
 */
const meRow = (inr: number, statementCount: number, o: Partial<DraftSummary> = {}): DraftListRow => ({
  kind: 'me',
  key: `me-XXVIII-${inr}`,
  draft: {
    gp: 'XXVIII',
    inr,
    citation: `${inr}/ME`,
    title: `Entwurf ${inr}`,
    ministryCode: 'BMF',
    ministryName: 'Finanzen',
    arrivedAt: '2026-09-08',
    deadline: '2026-10-16',
    active: true,
    statementCount,
    parliamentUrl: 'https://example.invalid',
    ...o,
  } as DraftSummary,
})

const risRow = (id: string, o: Partial<RisConsultation> = {}): DraftListRow => ({
  kind: 'ris',
  key: `ris-${id}`,
  item: {
    id,
    kind: 'verordnung',
    title: `Verordnung ${id}`,
    longTitle: null,
    ministryCode: 'BMLUK',
    ministryName: 'Land- und Forstwirtschaft',
    startedAt: '2026-09-03',
    deadline: '2026-10-16',
    active: true,
    risUrl: 'https://example.invalid',
    ...o,
  } as RisConsultation,
})

const vorlageRow = (citation: string, date: string): DraftListRow => ({
  kind: 'vorlage',
  key: `rv-${citation}`,
  vorlage: {
    citation,
    title: `Vorlage ${citation}`,
    date,
    parliamentUrl: 'https://example.invalid',
    statementCount: null,
  } as OpenVorlage,
})

describe('rowOrderKey', () => {
  it('reads each kind through its own field', () => {
    expect(rowOrderKey(meRow(7, 0)).startedAt).toBe('2026-09-08')
    expect(rowOrderKey(risRow('BEGUT_1')).startedAt).toBe('2026-09-03')
  })

  it('dates a Regierungsvorlage by its Einlangen and claims no running Frist', () => {
    // Its form closes with the vote, so there is no Frist to be urgent about.
    expect(rowOrderKey(vorlageRow('594 d.B.', '2026-09-11'))).toEqual({
      active: false,
      deadline: null,
      startedAt: '2026-09-11',
      title: 'Vorlage 594 d.B.',
    })
  })

  it('reads a missing Einlangen as no date rather than as an empty string', () => {
    expect(rowOrderKey(vorlageRow('594 d.B.', '')).startedAt).toBeNull()
  })
})

describe('compareRowsByStatements', () => {
  const sorted = (rows: DraftListRow[]) => [...rows].sort(compareRowsByStatements).map((r) => r.key)

  it('leads with the most Stellungnahmen', () => {
    expect(sorted([meRow(1, 3), meRow(2, 240), meRow(3, 12)])).toEqual([
      'me-XXVIII-2',
      'me-XXVIII-3',
      'me-XXVIII-1',
    ])
  })

  it('breaks an equal count by the newer Geschäftszahl', () => {
    // The normal case early in a period: a shelf of drafts at 0. Without the
    // tie-break the order would follow whatever order the corpus arrived in.
    expect(sorted([meRow(4, 0), meRow(9, 0)])).toEqual(['me-XXVIII-9', 'me-XXVIII-4'])
  })

  it('keeps the unrankable half behind, never interleaved at zero', () => {
    // A record without a Gegenstand publishes no Stellungnahmen count and
    // never will — sorting it in at 0 would read as "nobody cared" about two
    // thirds of the corpus.
    expect(sorted([risRow('BEGUT_1'), meRow(1, 0), vorlageRow('594 d.B.', '2026-09-11')])).toEqual([
      'me-XXVIII-1',
      'ris-BEGUT_1',
      'rv-594 d.B.',
    ])
  })

  it('orders that half among itself by the list’s own Frist order', () => {
    expect(
      sorted([
        risRow('spaet', { deadline: '2026-12-01' }),
        risRow('bald', { deadline: '2026-09-20' }),
      ]),
    ).toEqual(['ris-bald', 'ris-spaet'])
  })
})
