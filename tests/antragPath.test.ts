/**
 * The Initiativantrag route (docs/architecture.md §12.10, 30.09.2026): what
 * the table claims, and what each surface makes of it.
 *
 * The table is generated (`scripts/corpus/meAntragTable.ts`), so these tests
 * check the claims that must survive a re-run — not the numbers of one run:
 * every entry is a promulgated Antrag, the shares are shares, and the
 * threshold that moves a station sits in a gap of the data rather than
 * through it.
 */
import { describe, expect, it } from 'vitest'
import type { AntragPath, DraftDetail, DraftSummary } from '../shared/types'
import { ANTRAG_PATHS } from '../shared/utils/antragPathTable'
import { CARRIES_DRAFT_SHARE, antragPathFor, antragUrl, carriesDraft } from '../shared/utils/antragPath'
import { procedureStatusDe, stations } from '../app/utils/spine'
import { viewOfDraft } from '../app/utils/entryView'
import { draftSummary } from './helpers/builders'

const all = Object.entries(ANTRAG_PATHS).flatMap(([gp, rows]) =>
  Object.entries(rows).map(([inr, path]) => ({ gp, inr: Number(inr), path })),
)

describe('the table', () => {
  it('names only promulgated Anträge, with shares that are shares', () => {
    expect(all.length).toBeGreaterThan(0)
    for (const { path } of all) {
      expect(path.antrag.citation).toBe(`${path.antrag.inr}/A`)
      expect(path.antrag.bgblNumber).toMatch(/^Bundesgesetzblatt I Nr\. \d+\/\d{4}$/)
      expect(path.antrag.einlangen).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      for (const share of [path.draftShare, path.antragShare]) {
        expect(share).toBeGreaterThanOrEqual(0)
        expect(share).toBeLessThanOrEqual(1)
      }
      // The join's „belegt" step: the shorter text sits to at least 0,6 in
      // the longer, so ONE of the two shares carries it.
      expect(Math.max(path.draftShare, path.antragShare)).toBeGreaterThanOrEqual(0.55)
    }
  })

  /* The threshold is read off a gap, and the gap must still be there: a
   * draft right at the boundary would move its station on a rounding. */
  it('keeps the carries-the-draft threshold inside a gap of the data', () => {
    const near = all.filter(({ path }) => Math.abs(path.draftShare - CARRIES_DRAFT_SHARE) < 0.05)
    expect(near).toEqual([])
  })

  it('looks a draft up by period and number, and nothing else', () => {
    expect(antragPathFor('XXVII', 69)?.antrag.citation).toBe('1065/A')
    expect(antragPathFor('XXVIII', 69)).toBeNull()
    expect(antragPathFor('XVI', 1)).toBeNull()
    expect(antragUrl('XXVII', antragPathFor('XXVII', 69)!)).toBe('https://www.parlament.gv.at/gegenstand/XXVII/A/1065')
  })

  /* XXVIII/6/ME: the Antrag's 570 words sit in the draft, but they are 3 %
   * of it — a part of the draft took that route, not the draft. */
  it('does not let a partial match carry the draft', () => {
    expect(carriesDraft(antragPathFor('XXVIII', 6))).toBe(false)
    expect(carriesDraft(antragPathFor('XXVII', 69))).toBe(true)
    expect(carriesDraft(null)).toBe(false)
  })
})

const PATH: AntragPath = {
  antrag: { citation: '1065/A', inr: 1065, title: 'Schulorganisationsgesetz, Änderung', einlangen: '2020-11-20', bgblNumber: 'Bundesgesetzblatt I Nr. 19/2021' },
  draftShare: 0.81,
  antragShare: 0.8,
  duringFrist: false,
}

function detail(overrides: Partial<DraftDetail> = {}): DraftDetail {
  return {
    gp: 'XXVII',
    inr: 69,
    arrivedAt: '2020-10-01',
    deadline: '2020-11-03',
    active: false,
    gpEnded: true,
    handoff: null,
    textEvolution: [],
    statements: { total: 12, organisations: 10, privatePersons: 2, nonPublic: 0, organisationList: [] },
    enactment: null,
    antragPath: PATH,
    ...overrides,
  } as unknown as DraftDetail
}

describe('the spine on the Antrag route', () => {
  it('names the route in the headline', () => {
    expect(procedureStatusDe(detail())).toBe('Gesetz geworden – als Initiativantrag')
    expect(procedureStatusDe(detail({ antragPath: { ...PATH, draftShare: 0.1 } }))).toBe(
      'Ohne Regierungsvorlage – Gesetzgebungsperiode beendet',
    )
  })

  it('skips the Vorlage and reaches the house and the Bundesgesetzblatt', () => {
    const rows = Object.fromEntries(stations(detail()).map((s) => [s.id, s]))
    expect(rows.rv).toMatchObject({ state: 'never', facts: ['keine – als Initiativantrag eingebracht'] })
    expect(rows.parlament).toMatchObject({ state: 'done', facts: ['Initiativantrag 1065/A', '20.11.2020'] })
    expect(rows.bgbl).toMatchObject({ state: 'done', facts: ['BGBl. I Nr. 19/2021'] })
  })

  /* A partial match moves nothing: the bar says what it says without one. */
  it('leaves the stations alone on a partial match', () => {
    const rows = Object.fromEntries(stations(detail({ antragPath: { ...PATH, draftShare: 0.1 } })).map((s) => [s.id, s]))
    expect(rows.rv).toMatchObject({ state: 'never', facts: ['keine – GP beendet'] })
    expect(rows.bgbl).toMatchObject({ state: 'never', facts: [] })
  })
})

describe('the list row on the Antrag route', () => {
  const row = (over: Partial<DraftSummary> = {}) => viewOfDraft(draftSummary({ deadline: '2020-11-03', active: false, ...over }))

  it('reads Kundgemacht, and names the route beside the citation', () => {
    const v = row({
      chain: { station: 'bgbl', rvCitation: null, rvDate: null, bgblNumber: PATH.antrag.bgblNumber, filingOpen: false, antragCitation: '1065/A' },
    })
    expect(v.state).toMatchObject({ label: 'Kundgemacht', detail: 'BGBl. I Nr. 19/2021' })
    expect(v.note).toBe('als Initiativantrag 1065/A')
  })

  it('carries no note on the Vorlage route', () => {
    const v = row({
      chain: { station: 'bgbl', rvCitation: '594 d.B.', rvDate: null, bgblNumber: PATH.antrag.bgblNumber, filingOpen: false },
    })
    expect(v.note).toBeNull()
  })
})
