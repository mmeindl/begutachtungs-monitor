import { describe, expect, it } from 'vitest'
import type { RisConsultation } from '../shared/types'
import { gpWindow } from '../shared/utils/gp'
import {
  RIS_KIND_HINT,
  RIS_KIND_LABEL,
  RIS_KIND_PLURAL,
  risFilingNote,
  sortConsultations,
} from '../shared/utils/risConsultations'

/**
 * Vocabulary and order of the Begutachtungen without a parliamentary
 * Gegenstand (docs/architecture.md §12.16).
 */

function c(overrides: Partial<RisConsultation> = {}): RisConsultation {
  return {
    id: 'BEGUT_A',
    kind: 'verordnung',
    title: 'Änderung der Druckgeräteaufstellungsverordnung',
    longTitle: null,
    ministryCode: 'BMWET',
    ministryName: 'Bundesministerium für Wirtschaft, Energie und Tourismus',
    startedAt: '2026-09-08',
    deadline: '2026-10-19',
    active: true,
    risUrl: 'https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Begut&Dokumentnummer=BEGUT_A',
    ...overrides,
  }
}

const ids = (list: RisConsultation[]) => [...list].sort(sortConsultations).map((x) => x.id)

describe('RIS kind vocabulary', () => {
  it('names every kind in both registers', () => {
    for (const kind of ['verordnung', 'gesetz', 'unbestimmt'] as const) {
      expect(RIS_KIND_LABEL[kind]).toBeTruthy()
      expect(RIS_KIND_PLURAL[kind]).toBeTruthy()
    }
  })

  /* A hint is optional since 18.09.2026, and `unbestimmt` deliberately has
     none: its old sentence explained our own classifier („Der Titel nennt
     keine Rechtsform, deshalb steht hier keine") to a reader who asked
     about a draft. What the test still pins is that a hint is either a
     real sentence or nothing — never the empty string, which renders as a
     gap nobody chose. */
  it('carries a real sentence wherever it carries a hint at all', () => {
    for (const hint of Object.values(RIS_KIND_HINT)) {
      if (hint === null) continue
      expect(hint.trim().length).toBeGreaterThan(0)
    }
  })

  it('says nothing about the kind whose type the title does not name', () => {
    expect(RIS_KIND_HINT.unbestimmt).toBeNull()
  })

  it('claims no category for a record whose title names no type', () => {
    // "Sonstiges" would be a claim; the honest label is the plain noun.
    expect(RIS_KIND_LABEL.unbestimmt).toBe('Entwurf')
  })

  it('never frames a kind as a failing — Nachverfolgung, not blame', () => {
    // The framing rule in CLAUDE.md, pinned where the words actually live.
    for (const hint of Object.values(RIS_KIND_HINT)) {
      if (hint === null) continue
      expect(hint).not.toMatch(/versäum|verheimlich|umgeh|vermeid|trick/i)
    }
  })
})

describe('risFilingNote', () => {
  /* The label that replaced „nicht im Parlament". Pinned because it is what
     lets the four glosses elsewhere stay deleted: if it ever stops naming
     the ministry, the rows go back to describing an absence. */
  it('tells an open row where a Stellungnahme goes', () => {
    expect(risFilingNote(true)).toMatch(/Ministerium/)
  })

  it('tells a closed row why no count stands there', () => {
    expect(risFilingNote(false)).toMatch(/nicht veröffentlicht/)
  })

  it('never names the Parliament register a reader cannot know', () => {
    for (const active of [true, false]) {
      expect(risFilingNote(active)).not.toMatch(/Gegenstand|nicht im Parlament/i)
    }
  })
})

describe('sortConsultations', () => {
  it('puts open before closed, whatever the dates say', () => {
    const closedButNewer = c({ id: 'closed', active: false, deadline: '2026-12-01' })
    const openButOlder = c({ id: 'open', active: true, deadline: '2026-01-01' })
    expect(ids([closedButNewer, openButOlder])).toEqual(['open', 'closed'])
  })

  it('leads the open ones with the nearest Frist', () => {
    expect(
      ids([
        c({ id: 'late', deadline: '2026-11-30' }),
        c({ id: 'soon', deadline: '2026-09-20' }),
        c({ id: 'mid', deadline: '2026-10-15' }),
      ]),
    ).toEqual(['soon', 'mid', 'late'])
  })

  it('sorts an open record without a Frist after the dated ones', () => {
    expect(
      ids([
        c({ id: 'undated', deadline: null }),
        c({ id: 'dated', deadline: '2026-12-31' }),
      ]),
    ).toEqual(['dated', 'undated'])
  })

  it('orders the closed ones most recently ended first', () => {
    expect(
      ids([
        c({ id: 'older', active: false, deadline: '2025-03-01' }),
        c({ id: 'newer', active: false, deadline: '2026-03-01' }),
      ]),
    ).toEqual(['newer', 'older'])
  })

  it('falls back to the Beginn for a closed record with no Frist', () => {
    expect(
      ids([
        c({ id: 'byBeginnOld', active: false, deadline: null, startedAt: '2025-01-01' }),
        c({ id: 'byBeginnNew', active: false, deadline: null, startedAt: '2026-01-01' }),
      ]),
    ).toEqual(['byBeginnNew', 'byBeginnOld'])
  })

  it('breaks a tie by title, so the order is stable across requests', () => {
    // Four Verordnungen shared one Frist on 2026-10-16; without a tie-break
    // their order depended on the corpus fetch and moved between visits.
    expect(
      ids([
        c({ id: 'b', title: 'Ökosoziale Kriterien-Verordnung', deadline: '2026-10-16' }),
        c({ id: 'a', title: 'Industriestrompreisgesetz', deadline: '2026-10-16' }),
      ]),
    ).toEqual(['a', 'b'])
  })
})

describe('gpWindow', () => {
  it('bounds a finished period by the day before its successor convened', () => {
    expect(gpWindow('XXVII')).toEqual({ from: '2019-10-23', to: '2024-10-23' })
  })

  it('leaves the running period open-ended', () => {
    expect(gpWindow('XXVIII')).toEqual({ from: '2024-10-24', to: null })
  })

  it('is null for a period the calendar does not reach', () => {
    // The monitor reaches back to GP XIV, the verified date table to GP XX.
    // A guessed boundary would silently move records between periods.
    expect(gpWindow('XIV')).toBeNull()
    expect(gpWindow('nonsense')).toBeNull()
  })
})
