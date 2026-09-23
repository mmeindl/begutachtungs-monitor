import { describe, expect, it } from 'vitest'
import {
  BGBL_SILENCE_MEANS_SOMETHING_DAYS,
  BGBL_WINDOW_DAYS,
  bgblCandidates,
  bgblOutcomeState,
  bgblTitleCore,
  bgblTitleScore,
  isRunningYear,
  joinDraftToBgbl,
  type BgblJoinDraft,
  type BgblRecord,
} from '../server/utils/ris/bgblJoin'

function record(over: Partial<BgblRecord> = {}): BgblRecord {
  return {
    id: 'BGBLA_2026_II_50',
    teil: 'Teil2',
    nummer: 'BGBl. II Nr. 50/2026',
    datum: '2026-03-16',
    kurztitel: 'Änderung der Honigverordnung',
    titel:
      'Verordnung der Bundesministerin für Arbeit, Soziales, Gesundheit, Pflege und Konsumentenschutz, mit der die Honigverordnung geändert wird',
    stelle: 'BMASGPK (Bundesministerium für Arbeit, Soziales, Gesundheit, Pflege und Konsumentenschutz)',
    ...over,
  }
}

function draft(over: Partial<BgblJoinDraft> = {}): BgblJoinDraft {
  return {
    kurztitel: 'Honigverordnung, Änderung',
    titel: 'Verordnung, mit der die Honigverordnung geändert wird',
    stelle: 'BMASGPK (Bundesministerium für Arbeit, Soziales, Gesundheit, Pflege und Konsumentenschutz)',
    ende: '2026-01-15',
    ...over,
  }
}

describe('bgblTitleCore', () => {
  it('drops the formulaic preamble, which says only what the Ressort field says', () => {
    const core = bgblTitleCore(
      'Verordnung des Bundesministers für Finanzen, mit der die Sachbezugswerteverordnung geändert wird',
    )
    expect(core).not.toContain('finanzen')
    expect(core).toContain('sachbezugswerteverordnung')
  })

  it('drops the word that stands on every record of Teil II', () => {
    // "Verordnung" here is what "Bundesgesetz" is in Teil I: on both sides of
    // every pair, so it can only inflate a score.
    expect(bgblTitleCore('Ratenzahlungs-Verordnung')).toBe('ratenzahlungs')
  })
})

describe('bgblTitleScore', () => {
  it('scores the same short title as a full match', () => {
    const d = draft({ kurztitel: 'Studienbeihilfen-Valorisierungsverordnung 2026', titel: null })
    const r = record({ kurztitel: 'Studienbeihilfen-Valorisierungsverordnung 2026', titel: null })
    expect(bgblTitleScore(d, r)).toBeGreaterThanOrEqual(0.99)
  })

  it('survives a hyphen the ministries set differently', () => {
    // Measured on the corpus: the draft writes „2. AltlastenatlasVO-Novelle
    // 2025", the Kundmachung „2. Altlastenatlas-VO-Novelle 2025". Plain
    // Jaccard scores that 0.50 and loses a correct match.
    const d = draft({ kurztitel: '2. AltlastenatlasVO-Novelle 2025', titel: null })
    const r = record({ kurztitel: '2. Altlastenatlas-VO-Novelle 2025', titel: null })
    expect(bgblTitleScore(d, r)).toBeGreaterThanOrEqual(0.72)
  })

  it('compares the long title too, for drafts that carry no Kurztitel', () => {
    const d = draft({ kurztitel: null })
    expect(bgblTitleScore(d, record())).toBeGreaterThanOrEqual(0.72)
  })

  it('does not tie two unrelated Verordnungen together', () => {
    const d = draft({ kurztitel: 'Schutzwaldverordnung, Änderung', titel: null })
    const r = record({ kurztitel: 'Ratenzahlungs-Verordnung', titel: null })
    expect(bgblTitleScore(d, r)).toBeLessThan(0.4)
  })
})

describe('joinDraftToBgbl', () => {
  it('finds the Kundmachung of a draft', () => {
    const hit = joinDraftToBgbl(draft(), [record()])
    expect(hit?.record.nummer).toBe('BGBl. II Nr. 50/2026')
    expect(hit?.days).toBe(60)
  })

  it('refuses a record of another Stelle, however well the title fits', () => {
    // Two bodies cannot promulgate the same Verordnung. A title can coincide;
    // this cannot — so it is a hard no, not a deduction.
    const hit = joinDraftToBgbl(draft(), [record({ stelle: 'Vorstand der E-Control' })])
    expect(hit).toBeNull()
  })

  it('accepts the successor ministry of a government reshuffle', () => {
    // Frist under one government, Kundmachung under the next: BMK → BMLUK is
    // a lineage group in `risJoin`, and without it every draft that straddles
    // March 2025 would read as "never promulgated".
    const d = draft({ stelle: 'BMK (Bundesministerium für Klimaschutz)', kurztitel: 'Honigverordnung, Änderung' })
    const hit = joinDraftToBgbl(d, [record({ stelle: 'BMLUK (Bundesministerium für Land- und Forstwirtschaft)' })])
    expect(hit?.ministry).toBe(0.5)
  })

  it('ignores Teil I — a Verordnung is never promulgated there', () => {
    expect(joinDraftToBgbl(draft(), [record({ teil: 'Teil1' })])).toBeNull()
  })

  it('ignores a Kundmachung outside the window', () => {
    const early = record({ datum: '2025-11-01' })
    const late = record({ datum: '2028-01-01' })
    expect(joinDraftToBgbl(draft(), [early, late])).toBeNull()
    expect(BGBL_WINDOW_DAYS[0]).toBeLessThan(0)
  })

  it('takes the first Kundmachung after the deadline when two titles tie', () => {
    // Annually amended Verordnungen carry the same title every year, so a
    // tie on the title is the NORMAL case, not an ambiguous one — and the
    // first promulgation after this consultation's deadline is the one it
    // produced. Refusing here cost 21 drafts on the corpus, some scoring
    // 1.000 (`pnpm corpus:bgbl2`).
    const a = record({ id: 'A', nummer: 'BGBl. II Nr. 50/2026', datum: '2026-03-16' })
    const b = record({ id: 'B', nummer: 'BGBl. II Nr. 180/2026', datum: '2026-07-01' })
    expect(joinDraftToBgbl(draft(), [a, b])?.record.id).toBe('A')
  })

  it('still refuses when the tied Kundmachungen sit close together', () => {
    // Within a couple of months the order says nothing: both can come from
    // the same consultation (a correction, a second part), and picking one
    // would be a coin toss dressed up as a fact.
    const a = record({ id: 'A', nummer: 'BGBl. II Nr. 50/2026', datum: '2026-03-16' })
    const b = record({ id: 'B', nummer: 'BGBl. II Nr. 60/2026', datum: '2026-04-02' })
    expect(joinDraftToBgbl(draft(), [a, b])).toBeNull()
  })

  it('takes the earlier Kundmachung when the margin is clear', () => {
    const a = record({ id: 'A', nummer: 'BGBl. II Nr. 50/2026', datum: '2026-03-16' })
    const b = record({ id: 'B', nummer: 'BGBl. II Nr. 180/2026', datum: '2026-07-01', kurztitel: 'Änderung der Zeugnisformularverordnung', titel: null })
    expect(joinDraftToBgbl(draft(), [a, b])?.record.id).toBe('A')
  })

  it('says nothing about a draft without a deadline', () => {
    expect(joinDraftToBgbl(draft({ ende: null }), [record()])).toBeNull()
    expect(bgblCandidates(draft({ ende: null }), [record()])).toEqual([])
  })

  it('ranks candidates for inspection even when it would refuse them', () => {
    // The measurement has to see what nearly matched: a threshold checked
    // only against its hits is not checked.
    const foreign = record({ stelle: 'Vorstand der E-Control' })
    expect(bgblCandidates(draft(), [foreign])[0]?.ministry).toBe(0)
  })
})

describe('isRunningYear', () => {
  it('reads the day own year as running and the one before it as closed', () => {
    expect(isRunningYear(2026, '2026-12-31')).toBe(true)
    expect(isRunningYear(2025, '2026-12-31')).toBe(false)
  })

  it('keeps the old Jahrgang running through January', () => {
    // The whole point of the grace period: on 01.01. the closed namespace
    // would pin the year that ended hours ago for 30 days, and a Kundmachung
    // of 30.12. that RIS indexes after that first read would surface in
    // February — by when `stateOf` says „keine" about a Verordnung that has
    // been in force all along (§12.32).
    expect(isRunningYear(2026, '2027-01-15')).toBe(true)
    expect(isRunningYear(2027, '2027-01-15')).toBe(true)
    // Two years back is closed even in January: the grace is one year wide.
    expect(isRunningYear(2025, '2027-01-15')).toBe(false)
  })

  it('lets the grace period end with January', () => {
    expect(isRunningYear(2026, '2027-02-01')).toBe(false)
    expect(isRunningYear(2027, '2027-02-01')).toBe(true)
  })
})

/**
 * The state the list column „Stand" prints for a Verordnungsentwurf — and
 * the one rule in it that reads as an accusation if it fires too early.
 *
 * It lived in `bgblService.ts` until 23.09.2026, unexported and under three
 * cached functions, so nothing could execute it. The 180 days are measured
 * (`pnpm corpus:bgbl2`): 31,6 % of the drafts find a Kundmachung after
 * 31–90 days, 71,4 % after 91–180. Before that, silence says something about
 * the clock, not about the Ressort.
 */
describe('bgblOutcomeState', () => {
  /** A fixed Vienna noon, so the boundary is the rule and not the hour. */
  const on = (iso: string) => new Date(`${iso}T12:00:00+02:00`)

  it('reports a found Kundmachung whatever the dates say', () => {
    expect(bgblOutcomeState('2026-01-15', false, true, on('2026-09-23'))).toBe('kundgemacht')
    // Even while the Frist still runs: an urgent Verordnung can be published
    // before the formal end of its Begutachtung (`BGBL_WINDOW_DAYS`).
    expect(bgblOutcomeState('2026-12-01', true, true, on('2026-09-23'))).toBe('kundgemacht')
  })

  it('says nothing about the outcome while the Frist runs', () => {
    expect(bgblOutcomeState('2026-12-01', true, false, on('2026-09-23'))).toBe('begutachtung')
  })

  /* THE BOUNDARY. One day either side of it is the difference between „noch
   * offen" and „bisher nicht kundgemacht" — a sentence about a Ressort. */
  it('turns from ausstehend to keine on the 180th day, not before', () => {
    // 2026-01-15 + 179 days = 2026-07-13, + 180 days = 2026-07-14.
    expect(bgblOutcomeState('2026-01-15', false, false, on('2026-07-12'))).toBe('ausstehend')
    expect(bgblOutcomeState('2026-01-15', false, false, on('2026-07-13'))).toBe('ausstehend')
    expect(bgblOutcomeState('2026-01-15', false, false, on('2026-07-14'))).toBe('keine')
    expect(bgblOutcomeState('2026-01-15', false, false, on('2026-07-15'))).toBe('keine')
  })

  it('reads the day whole, so the state does not change mid-afternoon', () => {
    // The millisecond difference this rule used to take crossed the
    // threshold in the middle of the day, and a day early on the UTC server.
    for (const hour of ['00:05', '13:37', '23:55']) {
      expect(
        bgblOutcomeState('2026-01-15', false, false, new Date(`2026-07-13T${hour}:00+02:00`)),
        hour,
      ).toBe('ausstehend')
    }
  })

  it('counts a Frist that ended today as young', () => {
    expect(bgblOutcomeState('2026-09-23', false, false, on('2026-09-23'))).toBe('ausstehend')
  })

  /* A failure is not an answer (§12.13): a Frist we cannot read must not
   * become „nicht kundgemacht" — it reads as young instead. */
  it('treats an absent or unparseable Frist as no statement, never as keine', () => {
    expect(bgblOutcomeState(null, false, false, on('2026-09-23'))).toBe('begutachtung')
    expect(bgblOutcomeState('unbekannt', false, false, on('2026-09-23'))).toBe('ausstehend')
    expect(bgblOutcomeState('', false, false, on('2026-09-23'))).toBe('begutachtung')
  })

  it('keeps the threshold where the corpus put it', () => {
    expect(BGBL_SILENCE_MEANS_SOMETHING_DAYS).toBe(180)
  })
})
