/**
 * Upstream client for the Parliament API (docs/architecture.md §2/§5).
 *
 * The Nitro server is a caching proxy in front of POST /Filter/api/filter/
 * data/{81,142} and GET /gegenstand/…. Rules: showAll=true WITHOUT pagesize,
 * sortrnr=11&ascDesc=DESC on list 81, sanity check every row against the
 * dimension that was filtered after every list call (the API silently
 * ignores unknown filter keys) — row[0]===gp on lists 81/101, the parent
 * path on list 142 — 2 retries on 5xx/network errors.
 */
import { checkListHeader } from '../parliament/listHeaders'
import { statementRowMatchesParent, type StatementParentType } from '../parliament/list142'
import { PARLIAMENT_BASE } from '../parliament/htmlText'
import type {
  RawBgblLink,
  RawDocumentGroup,
  RawName,
  RawShortinfo,
  RawStage,
} from '../parliament/detailJson'
import { upstreamJson, UpstreamHttpError, type UpstreamPolicy } from './fetch'

/**
 * Timeout per attempt. Deliberately tight: the risk is not the fast 502 but
 * the hanging upstream — timeout × (1 + MAX_RETRIES) is how long an SSR
 * render blocks in the worst case before the error page appears. At 20 s
 * that was over 60 s. 8 s is ~70× the measured p90 (90–110 ms on list 81),
 * leaving plenty of headroom while capping the worst case at ~25 s.
 */
const TIMEOUT_MS = 8_000
const MAX_RETRIES = 2
const RETRY_BACKOFF_MS = 300
const PARLIAMENT_POLICY: UpstreamPolicy = {
  timeoutMs: TIMEOUT_MS,
  retries: MAX_RETRIES,
  backoffMs: () => RETRY_BACKOFF_MS,
  accept: 'application/json',
}

export interface FilterListResponse {
  pages?: number
  count?: number
  lastSync?: string | null
  header?: unknown[]
  rows?: unknown[][]
}

export interface GegenstandResponse {
  content?: {
    stages?: RawStage[] | null
    documents?: RawDocumentGroup[] | null
    names?: RawName[] | null
    shortinfo?: RawShortinfo | null
    statements?: { documents?: RawDocumentGroup[] | null } | null
    status?: { bgbllinks?: RawBgblLink[] | null } | null
    /** "1" while the item takes Stellungnahmen, "0" afterwards (`isFilingOpen`). */
    statementsstate?: string | number | null
    /**
     * Predecessors of this item — on a Regierungsvorlage the Ministerialentwurf
     * it came from (`ityp: 'ME'`). **Not a universal field:** 126 d.B. carries
     * no `preconst` key at all, so its absence is not proof that no
     * Begutachtung happened; cross-check against list 81
     * (`docs/begutachtung-uebersprungen.md` §2).
     */
    preconst?: { gp_code?: string | null; ityp?: string | null; inr?: number | string | null }[] | null
  } | null
}

/**
 * GET/POST with the policy above: 8-s timeout, 2 retries on 5xx and network
 * errors, 300 ms backoff, 4xx not retried. The statuses are translated here
 * and nowhere else — `upstream/fetch.ts` stays free of Nitro globals, so it
 * cannot know that a 404 from this API is a 404 for the reader.
 */
async function parliamentJson<T>(
  url: string,
  init: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<T> {
  try {
    return await upstreamJson<T>(url, { ...PARLIAMENT_POLICY, ...init })
  } catch (err) {
    if (err instanceof UpstreamHttpError) {
      if (err.status === 404) {
        throw createError({ statusCode: 404, statusMessage: 'Gegenstand nicht gefunden' })
      }
      throw createError({
        statusCode: 502,
        statusMessage: `Parlament-API antwortete mit Status ${err.status}`,
      })
    }
    throw createError({
      statusCode: 502,
      statusMessage: 'Parlament-API nicht erreichbar',
      cause: err,
    })
  }
}

/** The ME list's page configuration, as served. */
export function fetchMeListConfig(): Promise<unknown> {
  return parliamentJson<unknown>(
    `${PARLIAMENT_BASE}/recherchieren/gegenstaende/ministerialentwuerfe?json=True`,
  )
}

/**
 * POST to a filter list. `showAll=true` returns all matches —
 * this only works WITHOUT pagesize (an explicit pagesize wins otherwise).
 *
 * `all: false` OMITS the parameter: the API then answers one default page
 * (20 rows) plus `count`, the total — the cheap way to size a list before
 * fetching it. The parameter's presence is what counts upstream, not its
 * value; `showAll=false` still returns everything (verified 2026-09-15).
 */
export function fetchFilterList(
  listId: number,
  body: Record<string, unknown>,
  query: Record<string, string> = {},
  options: { all?: boolean } = {},
): Promise<FilterListResponse> {
  const params = new URLSearchParams({
    js: 'eval',
    ...(options.all === false ? {} : { showAll: 'true' }),
    ...query,
  })
  const url = `${PARLIAMENT_BASE}/Filter/api/filter/data/${listId}?${params.toString()}`
  return parliamentJson<FilterListResponse>(url, { method: 'POST', body })
}

/** GET /gegenstand/{gp}/{ityp}/{inr}?json=True */
export function fetchGegenstand(gp: string, ityp: string, inr: number): Promise<GegenstandResponse> {
  const url = `${PARLIAMENT_BASE}/gegenstand/${gp}/${ityp}/${inr}?json=True`
  return parliamentJson<GegenstandResponse>(url)
}

/**
 * The API silently ignores unknown filter keys — a typo once returned the
 * unfiltered full dataset. Therefore: every row must belong to the requested
 * GP, otherwise abort.
 */
export function assertRowsMatchGp(rows: unknown[][], gp: string, listId: number): void {
  for (const row of rows) {
    if (!Array.isArray(row) || row[0] !== gp) {
      throw createError({
        statusCode: 502,
        statusMessage: `Upstream-Filter hat nicht gegriffen (Liste ${listId}, GP ${gp})`,
      })
    }
  }
}

/**
 * The same guard for list 142, which cannot use the one above: it is
 * dimensioned by its PARENT (`BEZUG_GP_CODE`/`BEZUG_ITYP`/`BEZUG_INR`),
 * while column 0 holds the Gesetzgebungsperiode of the Stellungnahme itself.
 * Checking column 0 against the requested GP therefore did not check the
 * filter — it refused legitimate rows. Every Stellungnahme filed after a new
 * period convened failed it: XXVII 351/ME and 352/ME collected 7 such rows
 * in late 2024, and their statements endpoint answered 502 ever since, with
 * no last-good record to fall back on because the first fetch already threw.
 * `statementRowMatchesParent` compares the parent path instead, which is the
 * dimension that was actually filtered.
 */
export function assertRowsMatchParent(
  rows: unknown[][],
  gp: string,
  ityp: StatementParentType,
  inr: number,
): void {
  for (const row of rows) {
    if (!statementRowMatchesParent(row, gp, ityp, inr)) {
      throw createError({
        statusCode: 502,
        statusMessage: `Upstream-Filter hat nicht gegriffen (Liste 142, ${gp}/${ityp}/${inr})`,
      })
    }
  }
}

/**
 * The header names the columns the mappers read by position
 * (`parliament/listHeaders.ts`). Checked wherever rows are trusted, i.e. next to the GP
 * check and, like it, before anything is cached — a reordered column would
 * otherwise degrade silently into "every submitter is a Privatperson".
 * Only when there are rows: an empty list has no columns to misread.
 */
export function assertListHeader(listId: number, res: FilterListResponse): void {
  if (!(res.rows ?? []).length) return
  const mismatch = checkListHeader(listId, res.header)
  if (mismatch) {
    throw createError({
      statusCode: 502,
      statusMessage: `Spaltenlayout der Parlaments-API hat sich geändert – ${mismatch}`,
    })
  }
}
