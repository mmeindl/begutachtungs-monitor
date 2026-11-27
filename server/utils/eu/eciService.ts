/**
 * The register of the European Citizens' Initiative, paced and cached — the
 * one door to it (step 5 of the EU cycle; the reader is `eciRegister.ts`).
 *
 * GENTLE BY CONSTRUCTION, as the portal's service: every request goes
 * through one pacer of its own (the register is another host than the
 * portal), one at a time, 2.5 s apart, process-wide; a request that would
 * wait longer than twenty seconds for its turn gives up. No retry.
 *
 * ONLY WHAT WAS READ IS CACHED, never what arrived: the details name the
 * organisers and the sponsors, and the caches below hold only the reader's
 * fixed list of fields, so no cache layer, on disk or in memory, ever holds
 * a name. A day, served stale for a second day while it refreshes
 * (`ECI_REGISTER_STALE_S`, `staleWithin`): the list is one slow request (7 s
 * on 15.11.2026), the initiatives in collection one more each. A failure is
 * thrown and so never cached.
 *
 * THE INITIATIVES IN COLLECTION (`eciOpen`): the list, then the details of
 * each initiative with the status ONGOING — the list carries no deadline —
 * read IN SEQUENCE through the pacer, each cached a day. Cold, that is
 * about 7 s + 13 × 2.5 s ≈ 40–45 s (13 on 15.11.2026); one reading at a
 * time per process (`reading`): a second request that arrives while it runs
 * waits on the same promises instead of starting a second sequence. The
 * caller waits at most a budget for the details; a row whose details are not
 * at hand by then stays in the list as `ausstehend` (still being read), one
 * whose details failed as `ungelesen` — never dropped. The reading goes on
 * behind the budget and fills the cache, so the next view has the days.
 *
 * ON DEMAND, NO PREWARM: only the list on `/eu-recht`, an initiative's page
 * and the sitemap (the list alone) ask.
 */
import type { EciInitiative, EciOpenRow } from '../../../shared/types/eu'
import { staleWithin } from '../cache/stale'
import { DERIVED_ANALYSIS_TTL_S, ECI_REGISTER_STALE_S } from '../cache/ttl'
import { withinBudget } from '../http/budget'
import { SitePacer } from '../laender/session'
import { failureReason } from '../upstream/failureReason'
import { UpstreamHttpError, upstreamJson } from '../upstream/fetch'
import { ECI_GAP_MS, ECI_MAX_WAIT_MS, ECI_ONGOING, ECI_POLICY, ECI_READER_VERSION, eciDetailsUrl, eciListUrl, parseEciDetails, parseEciList, type EciList } from './eciRegister'

const pacer = new SitePacer(ECI_GAP_MS, 0, ECI_MAX_WAIT_MS)

async function eciJson(url: string): Promise<unknown> {
  await pacer.turn()
  return upstreamJson<unknown>(url, ECI_POLICY)
}

/** The register's list as the reader's fixed list of fields — a day, a second day stale. One key: the list has no parameter but the reader's version. */
const listCached = defineCachedFunction(
  async (): Promise<EciList> => parseEciList(await eciJson(eciListUrl())),
  { name: 'eu-eci-liste', getKey: () => `r${ECI_READER_VERSION}`, ...staleWithin(DERIVED_ANALYSIS_TTL_S, ECI_REGISTER_STALE_S) },
)

/**
 * One initiative as the reader's fixed list of fields — a day, a second day
 * stale. The answer must name the number asked for: one that names another
 * is no answer to the question, and is not cached.
 */
const detailsCached = defineCachedFunction(
  async (year: number, number: number): Promise<EciInitiative> => {
    const initiative = parseEciDetails(await eciJson(eciDetailsUrl(year, number)))
    if (initiative.year !== year || initiative.number !== number) throw new Error(`Register: Antwort nennt ${initiative.reference}`)
    return initiative
  },
  { name: 'eu-eci-initiative', getKey: (year: number, number: number) => `${year}-${number}|r${ECI_READER_VERSION}`, ...staleWithin(DERIVED_ANALYSIS_TTL_S, ECI_REGISTER_STALE_S) },
)

/**
 * The register's list, or null where it could not be read — never an empty
 * list for a failure: an empty list is the register's statement, and only a
 * successful reading may make it.
 *
 * This is the read the uptime check's EU canary watches, so a failure says
 * why in the log (27.11.2026) — as `failureReason` builds it, the kind of
 * the failure and never a word of the answer: the register's records name
 * organisers. An initiative's details stay silent.
 */
export async function eciList(): Promise<EciList | null> {
  try {
    return await listCached()
  } catch (error) {
    console.warn('[eu] Register der Bürgerinitiative nicht abrufbar:', failureReason(error))
    return null
  }
}

export type EciRead = { state: 'gefunden'; initiative: EciInitiative } | { state: 'unbekannt' } | { state: 'ungelesen' }

/**
 * One initiative by year and number. Three answers: found; `unbekannt` only
 * where the register answered 404, the one answer that proves there is none
 * (NOT measured against the register: what it answers for an unknown number
 * was not probed); `ungelesen` for every other failure. Never throws.
 */
export async function eciByNumber(year: number, number: number): Promise<EciRead> {
  try {
    return { state: 'gefunden', initiative: await detailsCached(year, number) }
  } catch (error) {
    return error instanceof UpstreamHttpError && error.status === 404 ? { state: 'unbekannt' } : { state: 'ungelesen' }
  }
}

/** How long the list waits for the details of the initiatives in collection, after the list itself: past it, a row says its day is still being read. */
export const ECI_OPEN_BUDGET_MS = 8_000

/** The one reading of the details in sequence, per process: the numbers it reads, the promise of all, and what has settled so far. */
interface Reading {
  key: string
  all: Promise<unknown>
  done: Map<string, EciRead>
}
let reading: Reading | null = null

const keyOf = (year: number, number: number) => `${year}/${number}`

/**
 * The details of these initiatives, each after the one before — through the
 * pacer, which would refuse a burst anyway. A reading already under way for
 * the same numbers is joined, not repeated.
 */
function readInSequence(numbers: readonly { year: number; number: number }[]): Reading {
  const key = numbers.map((n) => keyOf(n.year, n.number)).join(',')
  if (reading?.key === key) return reading
  const done = new Map<string, EciRead>()
  let previous: Promise<unknown> = Promise.resolve()
  for (const n of numbers) {
    // `eciByNumber` never throws, so one failure does not stop the sequence.
    previous = previous.then(async () => {
      done.set(keyOf(n.year, n.number), await eciByNumber(n.year, n.number))
    })
  }
  const own: Reading = { key, all: previous, done }
  reading = own
  void previous.finally(() => {
    if (reading === own) reading = null
  })
  return own
}

/** The initiatives one can support now, and the register's head counts. */
export interface EciOpen {
  rows: EciOpenRow[]
  counts: EciList['counts']
}

/**
 * The initiatives in collection: every entry of the list with the status
 * ONGOING, each with the day its collection ends where its details were
 * read within `budgetMs`. Null where the list itself could not be read.
 * Unsorted and unfiltered by day: the caller drops what ended since the
 * register was read (`eciOpenOn`) and the page orders by day.
 */
export async function eciOpen(budgetMs: number = ECI_OPEN_BUDGET_MS): Promise<EciOpen | null> {
  const list = await eciList()
  if (!list) return null
  const ongoing = list.entries.filter((e) => e.status === ECI_ONGOING)
  const run = readInSequence(ongoing)
  await withinBudget(run.all, budgetMs)
  // What settled within the budget is read now; what did not is still being read.
  const rows: EciOpenRow[] = ongoing.map((e) => {
    const read = run.done.get(keyOf(e.year, e.number))
    if (!read) return { ...e, deadline: null, details: 'ausstehend' }
    if (read.state !== 'gefunden') return { ...e, deadline: null, details: 'ungelesen' }
    return { ...e, deadline: read.initiative.deadline, details: 'gelesen' }
  })
  return { rows, counts: list.counts }
}
