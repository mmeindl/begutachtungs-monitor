import { describe, expect, it } from 'vitest'
import {
  BGBL_WINDOW_DAYS,
  bgblCandidates,
  bgblTitleCore,
  bgblTitleScore,
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
    // 1.000 (`pnpm audit:bgbl2`).
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
