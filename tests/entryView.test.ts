/**
 * The one anatomy (§12.28) — and precisely the half of it that can be
 * tested: WHAT stands in which zone, per kind.
 *
 * These tests exist because exactly these decisions used to lie spread over
 * six Vue components, where they were checkable only by screenshot. Three of
 * them are claims about the world, not formatting:
 *
 *  - A Verordnungsentwurf row NEVER carries a number. „0" would mean „nobody
 *    is interested" over two thirds of the corpus, where the truth is
 *    „nobody counts" (§12.16).
 *  - „Bisher keine Regierungsvorlage" may only stand where we looked. Without
 *    a chain that was read, the row states the last documented status.
 *  - A station AFTER the Begutachtung does not exist for a
 *    Verordnungsentwurf — its terminus is the Begutachtung itself.
 */
import { describe, expect, it } from 'vitest'
import type { ClosedOutcome, DraftDetail, DraftSummary, OpenVorlage, RisConsultation } from '../shared/types'
import { todayIso } from '../shared/utils/format'
import { isVorlageGpEnded } from '../server/utils/parliament/detailJson'
import { procedureStatusDe, stations } from '../app/utils/spine'
import {
  viewOfDraft,
  viewOfOutcome,
  viewOfRis,
  viewOfVorlage,
} from '../app/utils/entryView'
import { draftSummary, risConsultation } from './helpers/builders'

/** A deadline far in the past, so `active` never has a say. */
const PAST = '2025-08-31'

/** 126/ME Bundesstaatsanwaltschaft — 846 Stellungnahmen, the row with the number. */
const draft = (overrides: Partial<DraftSummary> = {}): DraftSummary => draftSummary({
  inr: 126,
  citation: '126/ME',
  title: 'Bundesgesetz über die Bundesstaatsanwaltschaft',
  ministryCode: 'BMJ',
  ministryName: 'Bundesministerium für Justiz',
  arrivedAt: '2025-06-30',
  deadline: PAST,
  statementCount: 846,
  parliamentUrl: 'https://www.parlament.gv.at/gegenstand/XXVIII/ME/126',
  ...overrides,
})

/** A Verordnungsentwurf, the case with no parliamentary Gegenstand. */
const ris = (overrides: Partial<RisConsultation> = {}): RisConsultation => risConsultation({
  id: 'BEGUT_COO_2026_100_2_1836568',
  title: 'Abwasseremissionsverordnung Tierkörperverwertung',
  ministryCode: 'BMLUK',
  ministryName: 'Bundesministerium für Land- und Forstwirtschaft',
  startedAt: '2026-08-27',
  deadline: '2026-10-08',
  ...overrides,
})

function vorlage(overrides: Partial<OpenVorlage> = {}): OpenVorlage {
  return {
    citation: '594 d.B.',
    title: 'Glücksspielgesetz, Änderung',
    date: '2026-08-05',
    parliamentUrl: 'https://www.parlament.gv.at/gegenstand/XXVIII/I/594',
    statementCount: 1,
    consultation: { kind: 'none' },
    ...overrides,
  }
}

describe('Zone 3 — Stellungnahmen', () => {
  it('gives a Ministerialentwurf its count, and 0 is a real count', () => {
    expect(viewOfDraft(draft()).participation).toEqual({ kind: 'count', count: 846 })
    expect(viewOfDraft(draft({ statementCount: 0 })).participation).toEqual({
      kind: 'count',
      count: 0,
    })
  })

  /* The core: there is no state in which this row carries a number — open
   * or closed. A „0" here would be the false statement §12.16 was written
   * against. */
  it('never gives a record without a Gegenstand a number, in either state', () => {
    expect(viewOfRis(ris({ active: true })).participation).toEqual({ kind: 'unpublished' })
    expect(viewOfRis(ris({ active: false })).participation).toEqual({ kind: 'unpublished' })
  })

  /* „Nicht gezählt" and „we could not look" are two statements, and only one
   * of them is permanent. */
  it('separates a failed count from one that structurally cannot exist', () => {
    expect(viewOfVorlage(vorlage({ statementCount: null })).participation).toEqual({
      kind: 'unavailable',
    })
    expect(viewOfVorlage(vorlage({ statementCount: 0 })).participation).toEqual({
      kind: 'count',
      count: 0,
    })
  })
})

describe('Zone 4 — Stand', () => {
  it('counts down while the Frist runs, and dates it by weekday', () => {
    const state = viewOfDraft(draft({ active: true, deadline: '2099-10-16' })).state
    expect(state.actionable).toBe(true)
    expect(state.label).toMatch(/^Noch /)
    expect(state.detail).toMatch(/^bis \w+\., 16\.10\.2099$/)
  })

  it('names a short or full window in zone 2, on an open entry only', () => {
    const open = (arrivedAt: string, deadline: string) =>
      viewOfDraft(draft({ active: true, arrivedAt, deadline })).note
    expect(open('2099-10-02', '2099-10-16')).toBe('Kurze Frist: 2 Wochen')
    expect(open('2099-09-04', '2099-10-16')).toBe('Volle Frist: 6 Wochen')
    expect(open('2099-09-18', '2099-10-16')).toBeNull()
    // Closed: the archive carries no class, the detail page says it.
    expect(viewOfDraft(draft({ active: false, arrivedAt: '2025-08-17', deadline: PAST })).note).toBeNull()
    // And never in the Stand box, whose height every row shares.
    expect(viewOfDraft(draft({ active: true, arrivedAt: '2099-10-02', deadline: '2099-10-16' })).state)
      .not.toHaveProperty('span')
  })

  /* A status reached is evidenced by its citation, not by the deadline's end
   * — two facts in one slot was the old conflation. */
  it('pins a reached station with its citation', () => {
    expect(viewOfOutcome({
      ...draft(),
      rvCitation: '594 d.B.',
      bgblNumber: 'Bundesgesetzblatt I Nr. 37/2026',
    } as ClosedOutcome).state).toMatchObject({
      label: 'Kundgemacht',
      detail: 'BGBl. I Nr. 37/2026',
      actionable: false,
    })

    expect(viewOfOutcome({
      ...draft(),
      rvCitation: '594 d.B.',
      bgblNumber: null,
    } as ClosedOutcome).state).toMatchObject({
      label: 'Regierungsvorlage liegt vor',
      detail: '594 d.B.',
    })
  })

  /* Here the deadline's end is the statement: the time that has passed IS
   * the finding, and „bisher" holds it as a status rather than a verdict. */
  it('dates the no-Vorlage state by the Frist that ended', () => {
    expect(viewOfOutcome({ ...draft(), rvCitation: null, bgblNumber: null } as ClosedOutcome).state)
      .toMatchObject({
        label: 'Bisher keine Regierungsvorlage',
        detail: 'Frist endete am 31.08.2025',
      })
  })

  /* Without a chain that was read, the row says what it can evidence — not
   * that no Vorlage exists (§12.27). */
  it('claims no missing Vorlage when the chain was never read', () => {
    expect(viewOfDraft(draft()).state).toMatchObject({
      label: 'Begutachtung abgeschlossen',
      detail: 'Frist endete am 31.08.2025',
      actionable: false,
    })
  })

  /* The second open window, named as what somebody can do TODAY. „Zweite
   * Runde" stays a heading and a filter. */
  it('calls the open Vorlage form what it is, dated by the RV', () => {
    const state = viewOfDraft(
      draft({
        chain: {
          station: 'rv',
          rvCitation: '594 d.B.',
          rvDate: '2026-07-08',
          bgblNumber: null,
          filingOpen: true,
        },
      }),
    ).state
    expect(state).toMatchObject({
      label: 'Stellungnahme möglich',
      detail: 'zur Vorlage seit 08.07.2026',
      actionable: true,
      tone: 'neutral',
    })
  })

  /* The archive row (§12.10, 30.09.2026): a Vorlage whose period is over
   * and that the house never decided does not „liegen vor". A carry-over
   * Vorlage in the running period still does — the flag is the Vorlage's
   * period, not the draft's. */
  it('does not say „liegt vor" about a Vorlage of a closed period', () => {
    const chain = { station: 'rv' as const, rvCitation: '2704 d.B.', rvDate: '2024-09-18', bgblNumber: null, filingOpen: false }
    expect(viewOfDraft(draft({ gp: 'XXVII', chain: { ...chain, rvGpEnded: true } })).state).toMatchObject({
      label: 'Ohne Beschluss – GP beendet',
      detail: '2704 d.B.',
      actionable: false,
    })
    expect(viewOfDraft(draft({ chain: { ...chain, rvGpEnded: false } })).state.label).toBe('Regierungsvorlage liegt vor')
    expect(viewOfDraft(draft({ chain })).state.label).toBe('Regierungsvorlage liegt vor')
  })

  /* Row and page for the SAME Vorlage, each built from its own payload by
   * the one function both payloads are filled with (`isVorlageGpEnded`).
   * Until 02.10.2026 the page judged by the draft's period, and a carry-over
   * the house still had read „liegt vor" here and „Ohne Beschluss –
   * Gesetzgebungsperiode beendet" there (docs/architecture.md §12.14). */
  it('says the same as the detail page about a carried-over Vorlage', () => {
    const both = (rvGp: string, currentGp: string) => {
      const rvGpEnded = isVorlageGpEnded(rvGp, currentGp)
      const row = viewOfDraft(draft({
        gp: 'XXVIII',
        chain: { station: 'rv', rvCitation: '127 d.B.', rvDate: '2026-03-04', bgblNumber: null, filingOpen: false, rvGpEnded },
      })).state.label
      // Only what the headline and the Parlament row read; the draft's own
      // period is over in every case — XXVIII under a running XXIX.
      const page = {
        active: false,
        gpEnded: true,
        textEvolution: [],
        statements: { total: 0 },
        enactment: {
          rvCitation: '127 d.B.',
          rvDate: '2026-03-04',
          bgblNumber: null,
          amendedIn: [],
          houseStatus: '2',
          houseStatusText: 'Zugewiesen an den Verfassungsausschuss',
          vote: null,
          filingOpen: false,
          rvGpEnded,
        },
      } as unknown as DraftDetail
      const parlament = stations(page).find((s) => s.id === 'parlament')!.facts
      return { row, headline: procedureStatusDe(page), parlament }
    }
    // Draft XXVIII, Vorlage carried into XXIX, XXIX running: still before the house.
    expect(both('XXIX', 'XXIX')).toEqual({
      row: 'Regierungsvorlage liegt vor',
      headline: 'Im Parlament',
      parlament: ['in Behandlung'],
    })
    // The same Vorlage once XXIX is over too: one word on both surfaces.
    expect(both('XXIX', 'XXX')).toEqual({
      row: 'Ohne Beschluss – GP beendet',
      headline: 'Ohne Beschluss – Gesetzgebungsperiode beendet',
      parlament: ['GP beendet'],
    })
    // A Vorlage of the draft's own, ended period: unchanged since 30.09.2026.
    expect(both('XXVIII', 'XXIX')).toMatchObject({ row: 'Ohne Beschluss – GP beendet', parlament: ['GP beendet'] })
  })

  /* A Verordnungsentwurf has no station after the Begutachtung, and that is
   * not a missing value: its road ends there. */
  it('ends a record without a Gegenstand at its own Begutachtung', () => {
    expect(viewOfRis(ris({ active: false, deadline: '2026-09-14' })).state).toMatchObject({
      label: 'Begutachtung abgeschlossen',
      detail: 'Frist endete am 14.09.2026',
      actionable: false,
    })
  })

  /* A Vorlage without a Begutachtung has no deadline by nature — its window
   * closes with the vote, not on a date. */
  it('gives the Vorlage an open window without inventing a Frist', () => {
    expect(viewOfVorlage(vorlage()).state).toMatchObject({
      label: 'Stellungnahme möglich',
      detail: 'zur Vorlage seit 05.08.2026',
      actionable: true,
    })
    expect(viewOfVorlage(vorlage({ date: '' })).state.detail).toBeNull()
  })
})

describe('Zone 2 — Kennung', () => {
  it('leads every kind with its type word', () => {
    expect(viewOfDraft(draft()).kindLabel).toBe('Ministerialentwurf')
    expect(viewOfRis(ris()).kindLabel).toBe('Verordnungsentwurf')
    expect(viewOfVorlage(vorlage()).kindLabel).toBe('Regierungsvorlage')
  })

  /* No ressort in the data means: no token. As a column of its own that was
   * a visible hole and read like a defect. */
  it('carries no ministry where the data has none', () => {
    expect(viewOfVorlage(vorlage()).ministry).toBeNull()
    expect(viewOfDraft(draft()).ministry).toEqual({
      code: 'BMJ',
      name: 'Bundesministerium für Justiz',
    })
  })

  /* A draft two ressorts sent jointly names both — one token each, so zone 2
   * keeps its single separator and every code keeps its own full name. Three
   * drafts of GP XXVII (`server/utils/parliament/draftList.ts`); on every
   * other kind of row the list is empty, which renders as nothing at all. */
  it('names every ressort of a jointly issued Entwurf, and none elsewhere', () => {
    const joint = viewOfDraft(
      draft({
        ministryCode: 'BMFFIM',
        ministryName: 'Bundesministerium für Finanzen',
        coMinistries: [{ code: 'BMJ', name: 'Bundesministerium für Justiz' }],
      }),
    )
    expect(joint.ministry).toEqual({ code: 'BMFFIM', name: 'Bundesministerium für Finanzen' })
    expect(joint.coMinistries).toEqual([{ code: 'BMJ', name: 'Bundesministerium für Justiz' }])

    expect(viewOfDraft(draft()).coMinistries).toEqual([])
    expect(viewOfRis(ris()).coMinistries).toEqual([])
    expect(viewOfVorlage(vorlage()).coMinistries).toEqual([])
  })

  /* The procedural fact, never as an accusation: the Vorlage never went to
   * Begutachtung, so the monitor has no page for it. */
  it('sends a Vorlage without a Begutachtung outside, and says so', () => {
    const v = viewOfVorlage(vorlage())
    expect(v.to).toBeNull()
    expect(v.href).toContain('parlament.gv.at')
    expect(v.note).toBe('ohne Begutachtung')

    const withDraft = viewOfVorlage(
      vorlage({ consultation: { kind: 'draft', gp: 'XXVIII', inr: 125 } }),
    )
    expect(withDraft.to).toBe('/entwuerfe/XXVIII/125')
    expect(withDraft.note).toBeNull()
  })

  /* The third possibility, and the reason for the whole state: no pointer in
   * the Gegenstand, but a draft that might fit it. The row then leads out
   * just the same — but claims nothing. */
  it('withholds the claim where the Vorgeschichte is only unverified', () => {
    const v = viewOfVorlage(vorlage({ consultation: { kind: 'unknown' } }))
    expect(v.to).toBeNull()
    expect(v.href).toContain('parlament.gv.at')
    expect(v.note).toBeNull()
  })

  /* „Neu" is tied to a running procedure: on a closed one it would mark the
   * one thing nobody can change any more. */
  it('never marks a closed entry as new', () => {
    // The Vienna day, as `isNewArrival` measures it — the UTC day this used to
    // take is tomorrow's date in Austria between 22:00 and 24:00 UTC, and the
    // first expectation then failed for two hours a night.
    const today = todayIso()
    expect(viewOfRis(ris({ startedAt: today, active: true })).isNew).toBe(true)
    expect(viewOfRis(ris({ startedAt: today, active: false })).isNew).toBe(false)
  })
})
