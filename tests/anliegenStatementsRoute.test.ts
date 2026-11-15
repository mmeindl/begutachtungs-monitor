import { join } from 'node:path'
import type { H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeError, FakeEvent } from './helpers/nitroGlobals'

/**
 * The Stellungnahmen of one Anliegen
 * (`server/api/anliegen/[gp]/[kind]/[nr]/stellungnahmen.get.ts`, 15.11.2026):
 * which parent list 142 is asked for, and that the item is checked before.
 *
 * The handler is executed, not read. `getStatementsForItem` and its
 * neighbours are Nitro auto-imports, so they are globals here; the item check
 * (`getAnliegenDetail`) is mocked as a module. Imported by a computed path,
 * as in `draftSubroutes.test.ts`, because the handler names auto-imports the
 * tools project does not declare.
 */

vi.mock('../server/utils/parliament/anliegenService', () => ({
  getAnliegenDetail: vi.fn(),
}))
const { getAnliegenDetail } = vi.mocked(await import('../server/utils/parliament/anliegenService'))

const ROUTE = join(import.meta.dirname, '..', 'server', 'api', 'anliegen', '[gp]', '[kind]', '[nr]', 'stellungnahmen.get.ts')

type Handler = (event: H3Event) => Promise<Record<string, unknown>>

async function handler(): Promise<Handler> {
  const path: string = ROUTE
  return ((await import(/* @vite-ignore */ path)) as { default: Handler }).default
}

const request = (gp: string, kind: string, nr: string) =>
  ({ __params: { gp, kind, nr }, __query: {} }) satisfies FakeEvent as unknown as H3Event

const statements = vi.fn(async () => ({ total: 0, items: [], unlisted: 0 }))

beforeEach(() => {
  vi.stubGlobal('defineEventHandler', (h: Handler) => h)
  vi.stubGlobal('getCurrentGp', async () => 'XXVIII')
  vi.stubGlobal('getStatementsForItem', statements)
  vi.stubGlobal('buildStatementsSummary', () => ({ total: 0 }))
  vi.stubGlobal('STATEMENTS_CAP', 5000)
  getAnliegenDetail.mockReset()
  getAnliegenDetail.mockResolvedValue({} as never)
  statements.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the Stellungnahmen of an Anliegen', () => {
  it('asks list 142 for the kind\'s item type: PET, BI, and I for a Volksbegehren', async () => {
    const run = await handler()
    for (const [kind, ityp, citation, url] of [
      ['petition', 'PET', '13/PET', 'https://www.parlament.gv.at/gegenstand/XXVIII/PET/13'],
      ['buergerinitiative', 'BI', '13/BI', 'https://www.parlament.gv.at/gegenstand/XXVIII/BI/13'],
      ['volksbegehren', 'I', '13 d.B.', 'https://www.parlament.gv.at/gegenstand/XXVIII/I/13'],
    ] as const) {
      statements.mockClear()
      const answer = await run(request('XXVIII', kind, '13'))
      expect(statements).toHaveBeenCalledWith('XXVIII', ityp, 13)
      expect(answer).toMatchObject({ rvCitation: citation, rvUrl: url, committeeConsultation: null, predatesFiling: false })
    }
  })

  it('reads nothing for an item the monitor does not follow', async () => {
    const refusal: FakeError = { statusCode: 404, statusMessage: 'Kein Gegenstand, den der Monitor verfolgt' }
    getAnliegenDetail.mockRejectedValue(refusal)

    await expect((await handler())(request('XXVIII', 'volksbegehren', '313'))).rejects.toEqual(refusal)
    expect(statements).not.toHaveBeenCalled()
  })

  it('answers 400 for a kind that is no Anliegen, before any read', async () => {
    await expect((await handler())(request('XXVIII', 'vorlage', '13'))).rejects.toMatchObject({ statusCode: 400 })
    expect(getAnliegenDetail).not.toHaveBeenCalled()
    expect(statements).not.toHaveBeenCalled()
  })
})
