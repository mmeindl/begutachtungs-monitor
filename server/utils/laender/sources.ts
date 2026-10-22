/**
 * The Länder the monitor reads, and how one request reads them (22.10.2026).
 *
 * Each Land is read on its own and fails on its own: one Land's relaunch
 * takes that Land's rows away and says so (`LandSourceState`), never the
 * others' and never the Bund's.
 *
 * Layers as `cache/base.ts` prescribes: the PAGES are the fetched payload
 * and are cached; the parses are not, they run per request and cost
 * milliseconds. A failed fetch throws and is therefore not cached — the
 * next request asks again.
 */
import type { LandCode, LandConsultation, LandDraftDetail, LandSourceState, LaenderResponse, LandStatement } from '#shared/types'
import { LAND_CODES } from '#shared/utils/laender'
import { todayIso } from '#shared/utils/format'
import { type UpstreamPolicy, upstreamText } from '../upstream/fetch'
import { UPSTREAM_LIST_TTL_S } from '../cache/ttl'
import { withinBudget } from '../http/budget'
import {
  SALZBURG_FILING_EMAIL,
  SALZBURG_LISTS,
  SALZBURG_REGISTERS,
  parseSalzburgList,
  parseSalzburgRegister,
  parseSalzburgStatements,
  salzburgDrafts,
  salzburgStatementsUrl,
} from './salzburg'

const LAND_POLICY: UpstreamPolicy = {
  timeoutMs: 15_000,
  retries: 1,
  backoffMs: () => 2_000,
  accept: 'text/html',
  maxBytes: 4 * 1024 * 1024,
}

/** One list page, or one draft's page of Stellungnahmen, as the Land served it. */
export const fetchLandPage = defineCachedFunction(
  (url: string): Promise<string> => upstreamText(url, LAND_POLICY),
  { name: 'land-list-page', getKey: (url: string) => url, maxAge: UPSTREAM_LIST_TTL_S, swr: false },
)

/**
 * A Land's whole register (Salzburg: every draft since 2004, 1,7 MB and
 * 12,7 s for the Verordnungen on 22.10.2026).
 *
 * THE ONE `swr: true` in this code base, on purpose. `ttl.ts` explains why
 * every other cache refuses it: an expired entry keeps serving the old
 * value. Here that is the right answer — a register a few hours old is
 * still correct for every draft it holds, and a draft too new for it comes
 * from the current list, which is fresh. Without SWR the first request
 * after expiry would wait thirteen seconds.
 */
const REGISTER_TTL_S = 60 * 60 * 6
const REGISTER_POLICY: UpstreamPolicy = { ...LAND_POLICY, timeoutMs: 45_000, maxBytes: 16 * 1024 * 1024 }
export const fetchLandRegister = defineCachedFunction(
  (url: string): Promise<string> => upstreamText(url, REGISTER_POLICY),
  { name: 'land-register-page', getKey: (url: string) => url, maxAge: REGISTER_TTL_S, swr: true },
)

/** How long the LIST waits for the register: its start dates are a garnish there. */
const REGISTER_BUDGET_MS = 1_500

const KINDS = ['gesetz', 'verordnung'] as const

async function salzburgCurrent(): Promise<LandConsultation[]> {
  const lists = await Promise.all(KINDS.map(async (kind) =>
    salzburgDrafts(parseSalzburgList(await fetchLandPage(SALZBURG_LISTS[kind]), SALZBURG_LISTS[kind]), kind)))
  return lists.flat()
}

async function salzburgRegister(): Promise<LandConsultation[]> {
  const registers = await Promise.all(KINDS.map(async (kind) =>
    salzburgDrafts(parseSalzburgRegister(await fetchLandRegister(SALZBURG_REGISTERS[kind]), SALZBURG_REGISTERS[kind]), kind)))
  return registers.flat()
}

/** The register's start date and documents laid onto a current entry. */
function withRegister(current: LandConsultation, registered: LandConsultation | undefined): LandConsultation {
  if (!registered) return current
  const urls = new Set(current.documents.map((d) => d.url))
  return {
    ...current,
    startedAt: registered.startedAt,
    documents: [...current.documents, ...registered.documents.filter((d) => !urls.has(d.url))],
  }
}

interface LandReader {
  /** The page a reader is sent to when the Land cannot be read. */
  listUrl: string
  /** The running drafts; the register only where it is already warm. */
  current: () => Promise<LandConsultation[]>
  /** One draft by the Land's number, running or closed; null when unknown. */
  detail: (number: string) => Promise<LandDraftDetail | null>
}

const READERS: Record<LandCode, LandReader> = {
  sbg: {
    listUrl: SALZBURG_LISTS.gesetz,
    current: async () => {
      const [current, register] = await Promise.all([
        salzburgCurrent(),
        withinBudget(salzburgRegister(), REGISTER_BUDGET_MS),
      ])
      const byId = new Map((register ?? []).map((d) => [d.id, d]))
      return current.map((d) => withRegister(d, byId.get(d.id)))
    },
    detail: async (number) => {
      const id = `sbg-${number}`
      /* Both sources may fail on their own; the page needs one of them. The
       * current list alone knows the Frist, the register alone a closed draft. */
      const [current, register] = await Promise.all([
        salzburgCurrent().catch(() => null),
        salzburgRegister().catch(() => null),
      ])
      if (!current && !register) throw createError({ statusCode: 503, statusMessage: 'Salzburg gerade nicht abrufbar' })
      const running = current?.find((d) => d.id === id)
      const registered = register?.find((d) => d.id === id)
      const draft = running ? withRegister(running, registered) : registered
      if (!draft) {
        // Unknown in a source that answered is a 404 only when BOTH answered.
        if (!current || !register) throw createError({ statusCode: 503, statusMessage: 'Salzburg gerade nicht abrufbar' })
        return null
      }
      const statementsUrl = salzburgStatementsUrl(number)
      const statements: LandStatement[] | null = await fetchLandPage(statementsUrl)
        .then((html) => parseSalzburgStatements(html, statementsUrl))
        .catch(() => null)
      return {
        draft: withLandActiveOn([draft])[0]!,
        statements,
        statementsUrl,
        filingEmail: SALZBURG_FILING_EMAIL,
        listUrl: SALZBURG_LISTS[draft.kind],
      }
    },
  },
}

/**
 * Whether a Frist runs on `day`: the current list's Frist decides, and a
 * draft without one (closed, read from the register) is not running.
 * Decided per request, never inside a cache (`withRisActiveOn`).
 */
export function withLandActiveOn(items: LandConsultation[], day: string = todayIso()): LandConsultation[] {
  return items.map((item) => ({ ...item, active: item.deadline !== null && item.deadline >= day }))
}

/**
 * Every Land the monitor reads. Only RUNNING Begutachtungen leave here:
 * some Länder leave expired entries on their list, and the lists have no
 * view for closed Länder drafts yet (`TODO.md` 5L).
 */
export async function readLaender(): Promise<LaenderResponse> {
  const results = await Promise.allSettled(LAND_CODES.map((land) => READERS[land].current()))
  const items: LandConsultation[] = []
  const sources: LandSourceState[] = LAND_CODES.map((land, i) => {
    const result = results[i]!
    if (result.status === 'fulfilled') items.push(...result.value)
    else console.warn(`[laender] ${land} nicht abrufbar:`, result.reason instanceof Error ? result.reason.message : result.reason)
    return { land, state: result.status === 'fulfilled' ? 'ok' : 'unavailable', listUrl: READERS[land].listUrl }
  })
  return {
    items: withLandActiveOn(items).filter((item) => item.active),
    sources,
  }
}

export function readLandDraft(land: LandCode, number: string): Promise<LandDraftDetail | null> {
  return READERS[land].detail(number)
}
