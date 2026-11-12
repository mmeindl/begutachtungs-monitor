/**
 * The envelope every Land draft and Landesgesetz route shares: the address
 * checked before anything is read, the record read before the route's own
 * work, and the one rule for what goes wrong in between.
 *
 * **Why the address and the read are two calls and not one wrapper.** Two
 * routes (`vergleich` for a draft and for a law) refuse an unknown text pair
 * with a 400 BETWEEN the two: a malformed address is a 404 first, an
 * unknown pair is a 400 before the Land is asked. Folding both into one
 * wrapper would either reorder that or need a hook for it.
 *
 * **Why the record is read first** — the Bund's reason (`requireDraft`,
 * `tests/draftSubroutes.test.ts`): a well-formed but made-up number must
 * 404 before a cached function sees it, or each one leaves an entry in the
 * derived LRU.
 *
 * **The rule in the catch** is the codebase's „real states answer, failures
 * throw" (`server/utils/cache/gathered.ts`): an H3 error (404, 410, 503) is
 * an answer and passes as it is; anything else is the Land's page failing
 * the gate or the fetch, logged and answered 503 — never an empty answer.
 *
 * Not in `http/params.ts`, which reads requests and makes no upstream call;
 * this module reads the Land.
 */
import type { H3Event } from 'h3'
import type { LandCode, LandDraftDetail, LandLawDetail } from '#shared/types'
import { LAND_CODES } from '#shared/utils/laender'
import { lawParams } from './landLawParams'
import { readLandLawPage } from './landLawsService'
import { isLandNumber, readLandDraft } from './sources'

const NO_DRAFT = 'Entwurf nicht gefunden'
const NO_LAW = 'Gesetz nicht gefunden'
const UNAVAILABLE = 'Gerade nicht abrufbar'

/** `:land/:number` of a Land's draft — a Land the monitor knows and a number of its shape, else 404. */
export function landDraftParams(event: H3Event): { land: LandCode; number: string } {
  const land = getRouterParam(event, 'land') ?? ''
  const number = getRouterParam(event, 'number') ?? ''
  if (!(LAND_CODES as readonly string[]).includes(land) || !isLandNumber(land as LandCode, number)) {
    throw createError({ statusCode: 404, statusMessage: NO_DRAFT })
  }
  return { land: land as LandCode, number }
}

/**
 * The draft's record, then `run` on it. 404 where the Land knows no such
 * number. `label` names the route in the warning (`[laender] <label>
 * <land>/<number>: …`); the draft's own route logs without one.
 */
export async function withLandDraft<T>(
  land: LandCode,
  number: string,
  label: string,
  run: (detail: LandDraftDetail) => T | Promise<T>,
): Promise<T> {
  try {
    const detail = await readLandDraft(land, number)
    if (!detail) throw createError({ statusCode: 404, statusMessage: NO_DRAFT })
    return await run(detail)
  } catch (error) {
    if (isError(error)) throw error
    console.warn(`[laender] ${label ? `${label} ` : ''}${land}/${number}:`, error instanceof Error ? error.message : error)
    throw createError({ statusCode: 503, statusMessage: UNAVAILABLE })
  }
}

/** `:land/lgbl/:year/:nr` of a Landesgesetz (`lawParams`), else 404. */
export function landLawParams(event: H3Event): { land: LandCode; year: number; number: number } {
  const p = lawParams(getRouterParam(event, 'land'), getRouterParam(event, 'year'), getRouterParam(event, 'nr'), LAND_CODES)
  if (!p) throw createError({ statusCode: 404, statusMessage: NO_LAW })
  return { ...p, land: p.land as LandCode }
}

/**
 * The law's page from RIS, then `run` on it — `withLandDraft` for a
 * Landesgesetz. 404 where RIS holds no Landesgesetz of that number in the
 * Land. The warning reads `[laender] <label> <land>/<year>/<number>: …`.
 */
export async function withLandLaw<T>(
  p: { land: LandCode; year: number; number: number },
  label: string,
  run: (detail: LandLawDetail) => T | Promise<T>,
): Promise<T> {
  try {
    const detail = await readLandLawPage(p.land, p.year, p.number)
    if (!detail) throw createError({ statusCode: 404, statusMessage: NO_LAW })
    return await run(detail)
  } catch (error) {
    if (isError(error)) throw error
    console.warn(`[laender] ${label} ${p.land}/${p.year}/${p.number}:`, error instanceof Error ? error.message : error)
    throw createError({ statusCode: 503, statusMessage: UNAVAILABLE })
  }
}
