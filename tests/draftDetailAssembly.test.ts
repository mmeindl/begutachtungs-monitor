import { describe, expect, it } from 'vitest'
import {
  assembleDraftDetail,
  type DraftDetailInputs,
} from '../server/utils/parliament/draftDetailAssembly'
import type { EnactmentInfo, RisMapRow, StatementMeta } from '../shared/types'
import { draftSummary } from './helpers/builders'

/**
 * What a detail page says once every fetch has answered
 * (`server/utils/parliament/draftDetailAssembly.ts`).
 *
 * Four decisions are asserted here, and all four are about what the page
 * may CLAIM when something is missing — the half of this product that has
 * to be careful, because a false accusation is not recoverable and silence
 * is (docs/architecture.md §12.27):
 *
 *  1. a failed list 142 degrades to the list-81 count, flagged;
 *  2. „bisher keine Regierungsvorlage" needs a period that links its drafts
 *     at all, so `chainCoverage` is `unknown` without the station map and
 *     `unlinked` only for a finished period in which not one draft moved;
 *  3. the second filing window closes with the Gesetzgebungsperiode,
 *     whatever upstream's flag still says;
 *  4. a Vorlage publishes its text twice and only one link may stand under
 *     the Kundmachung.
 *
 * Synthetic throughout — 88/ME's shape from `helpers/builders.ts`, and
 * organisation names that belong to nobody.
 */

const GP_XXVII_ENDED = { gp: 'XXVII', currentGp: 'XXVIII' }

function statement(over: Partial<StatementMeta> = {}): StatementMeta {
  return {
    citation: '1/SN-88/ME',
    date: '2026-03-20',
    submitterKind: 'organisation',
    submitterName: 'Muster GmbH',
    endorsements: 0,
    parliamentUrl: 'https://www.parlament.gv.at/gegenstand/XXVIII/SNME/1',
    ...over,
  }
}

function enactment(over: Partial<EnactmentInfo> = {}): EnactmentInfo {
  return {
    rvCitation: '2238 d.B.',
    rvUrl: 'https://www.parlament.gv.at/gegenstand/XXVIII/I/2238',
    rvTextUrl: null,
    rvDate: '2026-06-01',
    furtherRv: [],
    bgblNumber: null,
    bgblRisUrl: null,
    amendedIn: null,
    houseStatus: null,
    houseStatusText: null,
    vote: null,
    filingOpen: false,
    ...over,
  }
}

function inputs(over: Partial<DraftDetailInputs> = {}): DraftDetailInputs {
  return {
    gp: 'XXVIII',
    summary: draftSummary(),
    content: {},
    trace: [],
    currentGp: 'XXVIII',
    statements: { items: [], staleAsOf: null },
    risMap: null,
    stationMap: null,
    enactment: null,
    related: { predecessor: null, successor: null },
    ...over,
  }
}

describe('assembleDraftDetail — the statements number', () => {
  it('uses list 142 and keeps the list-81 counter beside it', () => {
    const detail = assembleDraftDetail(inputs({
      summary: draftSummary({ statementCount: 707 }),
      statements: { items: [statement(), statement({ submitterKind: 'person', submitterName: null })], staleAsOf: null },
    }))
    expect(detail.statements.total).toBe(2)
    expect(detail.statements.overviewTotal).toBe(707)
    expect(detail.statements.degraded).toBeUndefined()
    expect(detail.statements.organisations).toBe(1)
    expect(detail.statements.privatePersons).toBe(1)
  })

  /* The one place where the two upstream counts are allowed to be the same
   * number for different reasons: with list 142 gone, list 81's counter is
   * the only truth left, and it travels FLAGGED, because the breakdown
   * under it is not "all zero" but "unknown". */
  it('degrades to the list-81 count, flagged, when list 142 has nothing', () => {
    const detail = assembleDraftDetail(inputs({
      summary: draftSummary({ statementCount: 707 }),
      statements: null,
    }))
    expect(detail.statements).toEqual({
      total: 707,
      organisations: 0,
      privatePersons: 0,
      nonPublic: 0,
      organisationList: [],
      degraded: true,
    })
  })

  it('passes the staleness of a last-good aggregation through', () => {
    const detail = assembleDraftDetail(inputs({
      statements: { items: [statement()], staleAsOf: '2026-09-20T06:00:00.000Z' },
    }))
    expect(detail.statements.staleAsOf).toBe('2026-09-20T06:00:00.000Z')
    expect(detail.statements.degraded).toBeUndefined()
  })

  it('never carries the list-81 counter as the detail number', () => {
    // `statementCount` is destructured away: one response, one statements
    // number, and the other one only ever as `overviewTotal`.
    const detail = assembleDraftDetail(inputs({ summary: draftSummary({ statementCount: 707 }) }))
    expect('statementCount' in detail).toBe(false)
  })
})

describe('assembleDraftDetail — what the page may claim about the chain', () => {
  it('says `unknown` when the station map is missing', () => {
    // Failed fetch or budget: nothing to judge by, so no claim.
    expect(assembleDraftDetail(inputs({ stationMap: null })).chainCoverage).toBe('unknown')
    expect(assembleDraftDetail(inputs({ ...GP_XXVII_ENDED, stationMap: null })).chainCoverage).toBe('unknown')
  })

  it('says `unlinked` only for a finished period in which nothing left the Begutachtung', () => {
    const stuck = {
      1: { station: 'begutachtung' as const, rvCitation: null, rvDate: null, bgblNumber: null, filingOpen: false },
      2: { station: 'begutachtung' as const, rvCitation: null, rvDate: null, bgblNumber: null, filingOpen: false },
    }
    expect(assembleDraftDetail(inputs({ ...GP_XXVII_ENDED, stationMap: stuck })).chainCoverage).toBe('unlinked')
    // The same map in a RUNNING period is not evidence of anything: early in
    // a GP every draft stands at its Begutachtung legitimately.
    expect(assembleDraftDetail(inputs({ stationMap: stuck })).chainCoverage).toBe('linked')
  })

  it('says `linked` as soon as one draft of the period reached a Vorlage', () => {
    const one = {
      1: { station: 'begutachtung' as const, rvCitation: null, rvDate: null, bgblNumber: null, filingOpen: false },
      2: { station: 'rv' as const, rvCitation: '2238 d.B.', rvDate: '2026-06-01', bgblNumber: null, filingOpen: true },
    }
    expect(assembleDraftDetail(inputs({ ...GP_XXVII_ENDED, stationMap: one })).chainCoverage).toBe('linked')
  })

  it('marks a draft of a finished period as such', () => {
    expect(assembleDraftDetail(inputs(GP_XXVII_ENDED)).gpEnded).toBe(true)
    expect(assembleDraftDetail(inputs()).gpEnded).toBe(false)
  })
})

describe('assembleDraftDetail — the second filing window', () => {
  /* A Vorlage that lapsed with its Gesetzgebungsperiode takes nothing,
   * whatever a stale upstream flag says. The flag itself is read in
   * `enactmentOf`; what this file guards is that a finished period is never
   * shown as open. */
  it('is closed once the period has ended', () => {
    const detail = assembleDraftDetail(inputs({
      ...GP_XXVII_ENDED,
      enactment: enactment({ filingOpen: false }),
    }))
    expect(detail.gpEnded).toBe(true)
    expect(detail.enactment?.filingOpen).toBe(false)
  })

  it('stays open in a running period', () => {
    const detail = assembleDraftDetail(inputs({ enactment: enactment({ filingOpen: true }) }))
    expect(detail.gpEnded).toBe(false)
    expect(detail.enactment?.filingOpen).toBe(true)
  })
})

describe('assembleDraftDetail — the Vorlage’s text', () => {
  /** Upstream titles the Vorlage's own text „Gesetzestext"; `mapTextEvolution` renames it. */
  const rvDocuments = (links: string[]) => ({
    statements: {
      documents: [{
        title: 'Gesetzestext',
        documents: links.map((link) => ({ link, type: link.endsWith('.pdf') ? 'PDF' : 'HTML' })),
      }],
    },
  })

  it('prefers the PDF where the Vorlage published both', () => {
    const detail = assembleDraftDetail(inputs({
      content: rvDocuments([
        'https://www.parlament.gv.at/dokument/XXVIII/I/2238/fname_000001.html',
        'https://www.parlament.gv.at/dokument/XXVIII/I/2238/fname_000001.pdf',
      ]),
      enactment: enactment(),
    }))
    expect(detail.enactment?.rvTextUrl).toBe(
      'https://www.parlament.gv.at/dokument/XXVIII/I/2238/fname_000001.pdf')
  })

  it('takes the HTML when that is all there is', () => {
    const detail = assembleDraftDetail(inputs({
      content: rvDocuments(['https://www.parlament.gv.at/dokument/XXVIII/I/2238/fname_000001.html']),
      enactment: enactment(),
    }))
    expect(detail.enactment?.rvTextUrl).toEqual(expect.stringContaining('.html'))
  })

  it('leaves it null where the Vorlage published no text', () => {
    expect(assembleDraftDetail(inputs({ enactment: enactment() })).enactment?.rvTextUrl).toBeNull()
  })

  /* The RV's text is `enactment.rvTextUrl`, where the comparison offers it.
   * Listing it in `textEvolution` too put the same link under two headings. */
  it('keeps the Vorlage out of the later-stations list', () => {
    const detail = assembleDraftDetail(inputs({
      content: {
        statements: {
          documents: [
            { title: 'Gesetzestext', documents: [{ link: 'https://www.parlament.gv.at/a.pdf', type: 'PDF' }] },
            { title: 'Geändert im Ausschuss', documents: [{ link: 'https://www.parlament.gv.at/b.pdf', type: 'PDF' }] },
          ],
        },
      },
      enactment: enactment(),
    }))
    expect(detail.textEvolution.map((d) => d.title)).toEqual(['Geändert im Ausschuss'])
    expect(detail.enactment?.rvTextUrl).toBe('https://www.parlament.gv.at/a.pdf')
  })
})

describe('assembleDraftDetail — the enrichments that may simply be absent', () => {
  it('carries no RIS row when the join failed or ran past its budget', () => {
    expect(assembleDraftDetail(inputs({ risMap: null })).risDraft).toBeNull()
  })

  it('picks this draft’s row out of the period’s map', () => {
    const rows = [{ inr: 1, citation: '1/ME' }, { inr: 88, citation: '88/ME' }] as RisMapRow[]
    expect(assembleDraftDetail(inputs({ risMap: { rows } })).risDraft?.citation).toBe('88/ME')
    // A period whose map holds no row for this draft claims no RIS record.
    expect(assembleDraftDetail(inputs({ risMap: { rows: [rows[0]!] } })).risDraft).toBeNull()
  })

  it('keeps the list row it was handed', () => {
    const detail = assembleDraftDetail(inputs())
    expect(detail.citation).toBe('88/ME')
    expect(detail.ministryCode).toBe('BMF')
    // No parenthesised or comma-suffixed Kurztitel in 88/ME's title, so
    // there is no speaking name to derive — null, never the full title.
    expect(detail.shortTitle).toBeNull()
    expect(assembleDraftDetail(inputs({
      summary: draftSummary({ title: 'Bundesgesetz, mit dem das Ökostromgesetz geändert wird (Ökostromgesetz-Novelle)' }),
    })).shortTitle).toBe('Ökostromgesetz-Novelle')
  })
})
