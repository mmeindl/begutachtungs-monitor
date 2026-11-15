/**
 * The EUR-Lex Cellar, cached — one door for the Bund's EU fact
 * (`euService.ts`) and the Länder's (`landEuService.ts`), so a directive
 * asked for by a Ministerialentwurf and a Landesgesetz is one entry, under
 * one name.
 */
import { CELEX_RE, CELLAR_QUERY_VERSION, fetchOjAnswer, fetchTranspositionAnswer, parseOjAnswer, parseTranspositionAnswer, type OjAnswer, type SparqlAnswer, type TranspositionDates } from './cellar'
import { DOSSIER_QUERY_VERSION, fetchDossierAnswer, parseDossierAnswer } from './cellarDossier'
import { PUBLISHED_DOCUMENT_TTL_S } from '../cache/ttl'
import type { EuActRail } from '../../../shared/types/eu'

/**
 * At most two Cellar queries in flight, process-wide — the limit the corpus
 * runs held (`scripts/corpus/eu.ts`). A page asks for a handful of acts; the
 * EU map's build asks four drafts at once, and one draft can name 28 acts
 * (32/ME), each its own query. Only a miss waits here: a cached answer never
 * reaches the queue.
 */
const CELLAR_IN_FLIGHT = 2
let cellarActive = 0
const cellarQueue: (() => void)[] = []

async function inCellarTurn<T>(fn: () => Promise<T>): Promise<T> {
  // A finished query hands its slot straight to the next in line, so a
  // newcomer can never slip in between and make it three.
  if (cellarActive >= CELLAR_IN_FLIGHT) await new Promise<void>((resolve) => cellarQueue.push(resolve))
  else cellarActive++
  try {
    return await fn()
  } finally {
    const next = cellarQueue.shift()
    if (next) next()
    else cellarActive--
  }
}

/**
 * The Cellar's answer for one CELEX, as it arrived. A month: a directive's
 * transposition dates are fixed in its own text; a later act that moves
 * them is an act of its own with its own CELEX.
 */
const fetchCellarAnswer = defineCachedFunction(
  (celex: string): Promise<SparqlAnswer> => inCellarTurn(() => fetchTranspositionAnswer(celex)),
  { name: 'eu-cellar', getKey: (celex: string) => `${celex}|q${CELLAR_QUERY_VERSION}`, maxAge: PUBLISHED_DOCUMENT_TTL_S, swr: false },
)

/** One act's dates, or null where the Cellar did not answer. */
export async function transpositionOf(celex: string): Promise<TranspositionDates | null> {
  if (!CELEX_RE.test(celex)) return { found: true, dates: [], adopted: null, inForce: null, title: null }
  try {
    return parseTranspositionAnswer(await fetchCellarAnswer(celex))
  } catch {
    return null
  }
}

/**
 * Where an act was published, as it arrived — a month, like the dates: an
 * Amtsblatt reference never changes once printed. Only the act's page asks
 * (its „Zitieren" button), one query per page view at most.
 */
const fetchOjAnswerCached = defineCachedFunction(
  (celex: string): Promise<SparqlAnswer> => inCellarTurn(() => fetchOjAnswer(celex)),
  { name: 'eu-cellar-oj', getKey: (celex: string) => celex, maxAge: PUBLISHED_DOCUMENT_TTL_S, swr: false },
)

/** One act's Amtsblatt reference and ELI, or null where the Cellar did not answer — the page then cites without them. */
export async function ojReferenceOf(celex: string): Promise<OjAnswer | null> {
  if (!CELEX_RE.test(celex)) return null
  try {
    return parseOjAnswer(await fetchOjAnswerCached(celex))
  } catch {
    return null
  }
}

/**
 * One act's dossier, as it arrived — a month, like the dates: the
 * procedure of an act that is published is over, and what the Cellar adds
 * later (a step it had not recorded yet) waits a month at most. The key
 * carries the query's version, so a query that asks for more is never
 * answered from an old cache entry. Only the act's page asks, one query
 * per page view at most.
 */
const fetchDossierAnswerCached = defineCachedFunction(
  (celex: string): Promise<SparqlAnswer> => inCellarTurn(() => fetchDossierAnswer(celex)),
  { name: 'eu-cellar-dossier', getKey: (celex: string) => `${celex}|d${DOSSIER_QUERY_VERSION}`, maxAge: PUBLISHED_DOCUMENT_TTL_S, swr: false },
)

/**
 * One act's rail — who adopted it, its procedure, since when it is in force
 * and applies — or null where the Cellar did not answer: a Cellar that does
 * not answer is not „no procedure", and the page says it could not read
 * one. Null as well for anything that is no CELEX of an act.
 */
export async function railOf(celex: string): Promise<EuActRail | null> {
  if (!CELEX_RE.test(celex)) return null
  try {
    return parseDossierAnswer(await fetchDossierAnswerCached(celex), celex)
  } catch {
    return null
  }
}
