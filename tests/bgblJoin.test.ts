import { describe, expect, it } from 'vitest'
import {
  BGBL_ACCEPT,
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
    gp: null,
    regierungsvorlagen: [],
    datumNationalrat: null,
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

  it('drops a ministry name with commas whole, not only up to its first comma', () => {
    // BMLUK's name carries two commas; cut at the first, „klima und
    // umweltschutz regionen und wasserwirtschaft" stayed in every title of
    // the Ressort (21.10.2026).
    const core = bgblTitleCore(
      'Verordnung des Bundesministers für Land- und Forstwirtschaft, Klima- und Umweltschutz, Regionen und Wasserwirtschaft, mit der die Schutzwaldverordnung geändert wird',
    )
    expect(core).toBe('mit der die schutzwaldverordnung geändert wird')
    expect(bgblTitleCore(
      'Verordnung des Bundesministers für Land- und Forstwirtschaft, Klima- und Umweltschutz, Regionen und Wasserwirtschaft über die Vermarktung von Eiern',
    )).toBe('über die vermarktung von eiern')
  })

  it('keeps the first-comma cut where that comma lies inside the content', () => {
    // Both sides cut to the same tail, which is what matches them at 1,000.
    expect(bgblTitleCore(
      'Verordnung des Bundesministers für Finanzen über das Vorliegen einer vergleichbaren Zielsetzung bei Bildungsleistungen (USt-BildungsleistungsVO, UStBLV)',
    )).toBe('ustblv')
  })

  it('drops the word that stands on every record of Teil II', () => {
    // "Verordnung" here is what "Bundesgesetz" is in Teil I: on both sides of
    // every pair, so it can only inflate a score.
    expect(bgblTitleCore('Ratenzahlungs-Verordnung')).toBe('ratenzahlungs')
  })
})

describe('joinDraftToBgbl — the ministry name is no evidence', () => {
  it('does not give eight BMLUK drafts the one Schutzwaldverordnung', () => {
    const bmluk = 'BMLUK (Bundesministerium für Land- und Forstwirtschaft, Klima- und Umweltschutz, Regionen und Wasserwirtschaft)'
    const schutzwald = record({
      id: 'BGBLA_2026_II_303',
      nummer: 'BGBl. II Nr. 303/2026',
      datum: '2026-10-14',
      kurztitel: 'Änderung der Schutzwaldverordnung',
      titel: 'Verordnung des Bundesministers für Land- und Forstwirtschaft, Klima- und Umweltschutz, Regionen und Wasserwirtschaft, mit der die Schutzwaldverordnung geändert wird',
      stelle: bmluk,
    })
    const pre = 'Verordnung des Bundesministers für Land- und Forstwirtschaft, Klima- und Umweltschutz, Regionen und Wasserwirtschaft'
    const eier = draft({ kurztitel: 'Verordnung über die Vermarktung von Eiern', titel: `${pre} über die Vermarktung von Eiern`, stelle: bmluk, ende: '2026-06-15' })
    const own = draft({ kurztitel: 'Verordnung, mit der die Schutzwaldverordnung geändert wird', titel: `${pre}, mit der die Schutzwaldverordnung geändert wird`, stelle: bmluk, ende: '2026-06-24' })
    expect(joinDraftToBgbl(eier, [schutzwald])).toBeNull()
    expect(joinDraftToBgbl(own, [schutzwald])?.record.nummer).toBe('BGBl. II Nr. 303/2026')
  })
})

describe('joinDraftToBgbl — what it compares, and what it skips', () => {
  it('lets no foreign Stelle stand in the way of the own Ressort', () => {
    // Since 22.10.2026 a foreign record is skipped before its title is
    // compared — the verdict is the one the filtered ranking always gave: a
    // foreign Kundmachung with the same title is no rival, and no tie.
    const own = record({ id: 'OWN' })
    const foreign = record({ id: 'FOREIGN', datum: '2026-03-20', stelle: 'Vorstand der E-Control' })
    expect(joinDraftToBgbl(draft(), [foreign, own])?.record.id).toBe('OWN')
    // The measurement still sees both.
    expect(bgblCandidates(draft(), [foreign, own]).map((c) => c.record.id)).toEqual(['OWN', 'FOREIGN'])
  })

  it('reads the same record afresh for every draft that asks about it', () => {
    // What is kept per record (issue day, Stelle, title cores) must carry
    // nothing of the draft that asked first.
    const r = record()
    expect(joinDraftToBgbl(draft({ ende: '2026-01-15' }), [r])?.days).toBe(60)
    expect(joinDraftToBgbl(draft({ ende: '2026-03-01' }), [r])?.days).toBe(15)
    expect(joinDraftToBgbl(draft({ ende: '2026-03-01', stelle: 'BMF (Bundesministerium für Finanzen)' }), [r])).toBeNull()
    // Whole days across a leap day, as `daysBetween` counts them.
    expect(joinDraftToBgbl(draft({ ende: '2024-02-28' }), [record({ datum: '2024-03-01' })])?.days).toBe(2)
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

/**
 * A side of ONE word that matches only by its first eight letters
 * (22.10.2026). Measured on GP XXV–XXVIII: 13 of 1.405 matches rested on
 * it, nine of them plainly wrong — and each wrong one also tied with the
 * right Kundmachung of the same day and kept that draft from its own.
 * The titles below are the corpus's own.
 */
describe('joinDraftToBgbl — one word is no title', () => {
  const bmg = 'BMGF (Bundesministerium für Gesundheit und Frauen)'

  it('does not let a word stand for the Verordnung it only begins', () => {
    // „Psychotropen" (of the Grenzmengenverordnung) begins
    // „Psychotropenverordnung" — another Verordnung. Scored 0,900 until then.
    const d = draft({
      kurztitel: 'Änderung der Psychotropen-Grenzmengenverordnung',
      titel: 'Verordnung der Bundesministerin für Gesundheit und Frauen, mit der die Psychotropen-Grenzmengenverordnung geändert wird',
      stelle: bmg,
      ende: '2017-06-02',
    })
    const r = record({
      nummer: 'BGBl. II Nr. 291/2017',
      datum: '2017-10-30',
      kurztitel: 'Änderung der Psychotropenverordnung',
      titel: 'Verordnung der Bundesministerin für Gesundheit und Frauen, mit der die Psychotropenverordnung geändert wird',
      stelle: bmg,
    })
    expect(bgblTitleScore(d, r)).toBeLessThan(BGBL_ACCEPT)
    expect(joinDraftToBgbl(d, [r])).toBeNull()
  })

  it('still counts the one word where the other side carries it whole', () => {
    const d = draft({ kurztitel: 'Mutterschutzverordnung', titel: null })
    const r = record({ kurztitel: 'Mutterschutzverordnung – MSchV', titel: null })
    expect(bgblTitleScore(d, r)).toBe(0.9)
  })

  it('keeps the prefix match that the common beginning carries', () => {
    const d = draft({ kurztitel: 'Novelle der Schweinegesundheits-Verordnung', titel: null })
    const r = record({
      kurztitel: '1. Novelle der Schweinegesundheitsverordnung',
      titel: 'Verordnung des Bundesministers für Soziales, Gesundheit, Pflege und Konsumentenschutz, mit der die Schweinegesundheitsverordnung geändert wird (1. Novelle der Schweinegesundheitsverordnung)',
    })
    expect(bgblTitleScore(d, r)).toBeGreaterThanOrEqual(BGBL_ACCEPT)
  })

  it('gives the draft its own Kundmachung once the prefix rival is gone', () => {
    // Promulgated the same day: the Ausbildungsordnung and an amendment of
    // the Lehrberufsliste, which „Lehrberuf" in the draft's title used to
    // tie at 0,900 — a tie on the same day, so no answer at all.
    const bmwfw = 'BMWFW (Bundesministerium für Wissenschaft, Forschung und Wirtschaft)'
    const d = draft({
      kurztitel: 'Klavierbau-Ausbildungsordnung',
      titel: 'Verordnung des Bundesministers für Wissenschaft, Forschung und Wirtschaft über die Berufsausbildung im Lehrberuf Klavierbau (Klavierbau-Ausbildungsordnung)',
      stelle: bmwfw,
      ende: '2016-04-22',
    })
    const liste = record({ id: 'LISTE', nummer: 'BGBl. II Nr. 120/2016', datum: '2016-05-30', kurztitel: 'Änderung der Lehrberufsliste', titel: null, stelle: bmwfw })
    const own = record({ id: 'OWN', nummer: 'BGBl. II Nr. 126/2016', datum: '2016-05-30', kurztitel: 'Klavierbau-Ausbildungsordnung 2016', titel: null, stelle: bmwfw })
    expect(joinDraftToBgbl(d, [liste, own])?.record.id).toBe('OWN')
  })
})

/**
 * Which Kundmachung a tie on the title goes to (22.10.2026): the first after
 * the end of the Frist — what the comments always said, and what the plain
 * day count did not do, because the window's negative days sorted first.
 */
describe('joinDraftToBgbl — before and after the Frist', () => {
  const bmaw = 'BMAW (Bundesministerium für Arbeit und Wirtschaft)'
  const lehrberufsliste = (over: Partial<BgblRecord>) =>
    record({
      kurztitel: 'Änderung der Lehrberufslisteverordnung',
      titel: 'Verordnung des Bundesministers für Arbeit und Wirtschaft, mit der die Lehrberufslisteverordnung geändert wird',
      stelle: bmaw,
      ...over,
    })
  // Begutachtung 27.06.–25.07.2024.
  const d = draft({
    kurztitel: 'Änderung der Lehrberufslisteverordnung',
    titel: 'Verordnung des Bundesministers für Arbeit und Wirtschaft, mit der die Lehrberufslisteverordnung geändert wird',
    stelle: bmaw,
    ende: '2024-07-25',
  })
  // Issued while this draft was in Begutachtung — the previous draft's.
  const during = lehrberufsliste({ id: 'DURING', nummer: 'BGBl. II Nr. 179/2024', datum: '2024-07-03' })
  const after = lehrberufsliste({ id: 'AFTER', nummer: 'BGBl. II Nr. 376/2024', datum: '2024-12-18' })

  it('takes the first Kundmachung after the Frist over one issued during the Begutachtung', () => {
    const hit = joinDraftToBgbl(d, [during, after])
    expect(hit?.record.id).toBe('AFTER')
    expect(hit?.days).toBe(146)
    expect(bgblCandidates(d, [during, after]).map((c) => c.record.id)).toEqual(['AFTER', 'DURING'])
  })

  it('keeps one before the Frist where nothing equal came after it', () => {
    expect(joinDraftToBgbl(d, [during])?.days).toBe(-22)
  })

  it('still refuses when the one before the Frist lies close to the one after it', () => {
    // „Änderung der Suchtgiftverordnung", Frist 16.04.2020: Nr. 145/2020
    // seven days before, Nr. 215/2020 32 days after — the order alone would
    // pick the second; 39 days apart, the time says nothing.
    const soon = lehrberufsliste({ id: 'SOON', datum: '2024-08-20' })
    const close = lehrberufsliste({ id: 'CLOSE', datum: '2024-07-18' })
    expect(joinDraftToBgbl(d, [close, soon, after])).toBeNull()
  })

  it('refuses where the score prefers the one before the Frist and the time the one after it', () => {
    const words = 'Abwasseremissionen Fließgewässer Kanalisationen Siedlungsgebiete Einzelobjekte Extremlage Reinigungsanlagen Begrenzung Methoden Anpassung Messwerte Grenzwerte'
    const nearTie = draft({ kurztitel: words, titel: null, stelle: bmaw, ende: '2024-07-25' })
    const before = record({ id: 'BEFORE', datum: '2024-07-10', kurztitel: words, titel: null, stelle: bmaw })
    const later = record({ id: 'LATER', datum: '2024-11-02', kurztitel: `${words} Übergangsbestimmungen`, titel: null, stelle: bmaw })
    // 1,000 against 0,923: within the margin, so the time would decide — and
    // it points the other way.
    expect(bgblTitleScore(nearTie, before) - bgblTitleScore(nearTie, later)).toBeLessThan(0.08)
    expect(joinDraftToBgbl(nearTie, [before, later])).toBeNull()
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
