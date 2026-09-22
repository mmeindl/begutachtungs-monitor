/**
 * Die eine Anatomie (§12.28) — und zwar die Hälfte davon, die sich testen
 * lässt: WAS in welcher Zone steht, je Art.
 *
 * Diese Tests existieren, weil genau diese Entscheidungen vorher in sechs
 * Vue-Komponenten verteilt lagen und dort nur per Screenshot prüfbar waren.
 * Drei von ihnen sind Behauptungen über die Welt, keine Formatierung:
 *
 *  - Eine Verordnungsentwurfs-Zeile führt NIE eine Zahl. „0" hieße
 *    „niemanden interessiert" über zwei Dritteln des Korpus, wo die Wahrheit
 *    „niemand zählt" ist (§12.16).
 *  - „Bisher keine Regierungsvorlage" darf nur stehen, wo wir nachgesehen
 *    haben. Ohne gelesene Kette sagt die Zeile den letzten belegten Stand.
 *  - Eine Station NACH der Begutachtung gibt es für einen Verordnungsentwurf
 *    nicht — seine Endstation ist die Begutachtung selbst.
 */
import { describe, expect, it } from 'vitest'
import type { ClosedOutcome, DraftSummary, OpenVorlage, RisConsultation } from '../shared/types'
import {
  viewOfDraft,
  viewOfOutcome,
  viewOfRis,
  viewOfVorlage,
} from '../app/utils/entryView'
import { draftSummary, risConsultation } from './helpers/builders'

/** Ein Fristende weit in der Vergangenheit, damit `active` nie hineinredet. */
const PAST = '2025-08-31'

/** 126/ME Bundesstaatsanwaltschaft — 846 Stellungnahmen, die Zeile mit der Zahl. */
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

/** Ein Verordnungsentwurf, der Fall ohne parlamentarischen Gegenstand. */
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

  /* Der Kern: es gibt keinen Zustand, in dem diese Zeile eine Zahl trägt —
   * offen wie abgeschlossen. Eine „0" hier wäre die Falschaussage, gegen
   * die §12.16 geschrieben wurde. */
  it('never gives a record without a Gegenstand a number, in either state', () => {
    expect(viewOfRis(ris({ active: true })).participation).toEqual({ kind: 'unpublished' })
    expect(viewOfRis(ris({ active: false })).participation).toEqual({ kind: 'unpublished' })
  })

  /* „Nicht gezählt" und „wir konnten nicht nachsehen" sind zwei Aussagen,
   * und nur eine davon ist dauerhaft. */
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

  /* Ein erreichter Stand wird durch seine Fundstelle belegt, nicht durch
   * das Fristende — zwei Fakten in einem Slot war die alte Vermischung. */
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

  /* Hier ist das Fristende die Aussage: die verstrichene Zeit IST der
   * Befund, und „bisher" hält ihn als Stand statt als Urteil. */
  it('dates the no-Vorlage state by the Frist that ended', () => {
    expect(viewOfOutcome({ ...draft(), rvCitation: null, bgblNumber: null } as ClosedOutcome).state)
      .toMatchObject({
        label: 'Bisher keine Regierungsvorlage',
        detail: 'Frist endete am 31.08.2025',
      })
  })

  /* Ohne gelesene Kette sagt die Zeile, was sie belegen kann — nicht, dass
   * keine Vorlage existiert (§12.27). */
  it('claims no missing Vorlage when the chain was never read', () => {
    expect(viewOfDraft(draft()).state).toMatchObject({
      label: 'Begutachtung abgeschlossen',
      detail: 'Frist endete am 31.08.2025',
      actionable: false,
    })
  })

  /* Das zweite offene Fenster, und zwar als das benannt, was jemand HEUTE
   * tun kann. „Zweite Runde" bleibt Überschrift und Filter. */
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

  /* Ein Verordnungsentwurf hat keine Station nach der Begutachtung, und das
   * ist kein fehlender Wert: sein Weg endet dort. */
  it('ends a record without a Gegenstand at its own Begutachtung', () => {
    expect(viewOfRis(ris({ active: false, deadline: '2026-09-14' })).state).toMatchObject({
      label: 'Begutachtung abgeschlossen',
      detail: 'Frist endete am 14.09.2026',
      actionable: false,
    })
  })

  /* Eine Vorlage ohne Begutachtung hat von Natur aus keine Frist — das
   * Fenster schließt mit der Abstimmung, nicht an einem Datum. */
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

  /* Kein Ressort in den Daten heißt: kein Token. Als eigene Spalte war das
   * ein sichtbares Loch, das sich als Defekt las. */
  it('carries no ministry where the data has none', () => {
    expect(viewOfVorlage(vorlage()).ministry).toBeNull()
    expect(viewOfDraft(draft()).ministry).toEqual({
      code: 'BMJ',
      name: 'Bundesministerium für Justiz',
    })
  })

  /* Der Verfahrensfakt, nie als Vorwurf: die Vorlage ging nie in
   * Begutachtung, also hat der Monitor keine Seite dafür. */
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

  /* Die dritte Möglichkeit, und der Grund für den ganzen Zustand: kein
   * Zeiger im Gegenstand, aber ein Entwurf, der dazu passen könnte. Die
   * Zeile führt dann genauso hinaus — behauptet aber nichts. */
  it('withholds the claim where the Vorgeschichte is only unverified', () => {
    const v = viewOfVorlage(vorlage({ consultation: { kind: 'unknown' } }))
    expect(v.to).toBeNull()
    expect(v.href).toContain('parlament.gv.at')
    expect(v.note).toBeNull()
  })

  /* „Neu" ist an ein laufendes Verfahren gebunden: auf einem
   * abgeschlossenen markierte es das eine, woran niemand mehr etwas ändern
   * kann. */
  it('never marks a closed entry as new', () => {
    const today = new Date().toISOString().slice(0, 10)
    expect(viewOfRis(ris({ startedAt: today, active: true })).isNew).toBe(true)
    expect(viewOfRis(ris({ startedAt: today, active: false })).isNew).toBe(false)
  })
})
