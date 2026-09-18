import { describe, expect, it } from 'vitest'
import type { DraftChain } from '../shared/types'
import { chainCoverageOf, furtherChain, mayClaimOutcome, stationFor } from '../shared/utils/draftChain'

/**
 * The three inferences behind the station filter (docs/architecture.md
 * §12.26, §12.27). Everything else in `stationMap.ts` is fetching and
 * folding; these decide what the list CLAIMS about a draft, which is the
 * part that must not drift.
 *
 * Values are upstream's own: list-101 `Status` is "5" once the house is done
 * with a Vorlage and "2" while it is not (`mapVorlageRow`, verified 117/117
 * on GP XXVIII).
 */
describe('stationFor', () => {
  it('puts a promulgated law at the Bundesgesetzblatt, whatever the house says', () => {
    expect(stationFor('Bundesgesetzblatt I Nr. 81/2026', '5')).toBe('bgbl')
    /* The list column can lag the Kundmachung — the BGBl link is the harder
     * fact, and it wins. */
    expect(stationFor('Bundesgesetzblatt I Nr. 81/2026', '2')).toBe('bgbl')
  })

  it('reads the house status only while nothing is promulgated', () => {
    expect(stationFor(null, '5')).toBe('parlament')
    expect(stationFor(null, '2')).toBe('rv')
  })

  it('falls back to the weakest claim when the house status is unknown', () => {
    /* The Vorlage exists — that came from the draft's own stage record. What
     * parliament did with it is what we failed to learn, so the row may not
     * say "behandelt". */
    expect(stationFor(null, null)).toBe('rv')
    expect(stationFor(null, '')).toBe('rv')
  })
})

describe('furtherChain', () => {
  const chain = (station: DraftChain['station'], rvCitation = '1 d.B.'): DraftChain => ({
    station,
    rvCitation,
    bgblNumber: station === 'bgbl' ? 'Bundesgesetzblatt I Nr. 1/2026' : null,
    filingOpen: false,
  })

  it('takes the first chain when there is nothing to compare', () => {
    expect(furtherChain(undefined, chain('rv'))).toEqual(chain('rv'))
  })

  it('keeps the further station when a draft produced two Vorlagen (§13.4)', () => {
    expect(furtherChain(chain('rv'), chain('bgbl')).station).toBe('bgbl')
    expect(furtherChain(chain('bgbl'), chain('rv')).station).toBe('bgbl')
  })

  it('never falls back from a reached station to Begutachtung', () => {
    /* A second row of the same draft whose lookup failed arrives as
     * `begutachtung` — that must not erase a Vorlage the first row found, or
     * the list would report "bisher keine Regierungsvorlage" about a law. */
    expect(furtherChain(chain('parlament'), chain('begutachtung')).station).toBe('parlament')
  })

  it('orders the four stations the way the procedure runs', () => {
    const order: DraftChain['station'][] = ['begutachtung', 'rv', 'parlament', 'bgbl']
    for (let i = 0; i < order.length - 1; i++) {
      expect(furtherChain(chain(order[i]!), chain(order[i + 1]!)).station).toBe(order[i + 1])
    }
  })
})

/**
 * The guard against the one claim this product must never invent (§12.27):
 * "bisher keine Regierungsvorlage" about a period whose archive never
 * recorded the link. Measured 18.09.2026 — GP XVI has 297 Ministerialentwürfe
 * of which not one links to a Vorlage, while list 101 holds 270
 * Regierungsvorlagen from that same period.
 */
describe('chainCoverageOf', () => {
  const at = (station: DraftChain['station']): DraftChain => ({
    station,
    rvCitation: station === 'begutachtung' ? null : '1 d.B.',
    bgblNumber: null,
    filingOpen: false,
  })

  it('calls an ended period unlinked when not one draft got past the Begutachtung', () => {
    /* The GP XVI case: many drafts, every record stopping at the same place.
     * Nothing shelved 297 drafts — the link is missing. */
    expect(chainCoverageOf([at('begutachtung'), at('begutachtung')], true)).toBe('unlinked')
  })

  it('calls the period linked as soon as a single draft reached further', () => {
    /* One link proves the archive records them, so absence is evidence again
     * for the rest — that is the whole accountability layer. */
    expect(chainCoverageOf([at('begutachtung'), at('rv')], true)).toBe('linked')
    expect(chainCoverageOf([at('begutachtung'), at('bgbl')], true)).toBe('linked')
  })

  it('never calls a RUNNING period unlinked', () => {
    /* Early in a GP every draft legitimately stands at its Begutachtung.
     * That is the calendar, not a gap, and it must not silence the list. */
    expect(chainCoverageOf([at('begutachtung'), at('begutachtung')], false)).toBe('linked')
  })

  it('answers unknown without a map, and without rows to judge by', () => {
    expect(chainCoverageOf(null, true)).toBe('unknown')
    expect(chainCoverageOf(undefined, true)).toBe('unknown')
    /* An empty period decides nothing either way — and `unknown` is the
     * silent side, so an empty answer can never produce an accusation. */
    expect(chainCoverageOf([], true)).toBe('unknown')
  })
})

describe('mayClaimOutcome', () => {
  it('permits a claim only on a linked period', () => {
    expect(mayClaimOutcome('linked')).toBe(true)
  })

  it('treats unknown exactly like unlinked', () => {
    /* The asymmetry that decides this: silence is recoverable, a false
     * accusation is not. A budget that ran out must fall silent, not guess. */
    expect(mayClaimOutcome('unlinked')).toBe(false)
    expect(mayClaimOutcome('unknown')).toBe(false)
  })
})
