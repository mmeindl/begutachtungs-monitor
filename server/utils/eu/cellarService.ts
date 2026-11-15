/**
 * The EUR-Lex Cellar, cached — one door for the Bund's EU fact
 * (`euService.ts`) and the Länder's (`landEuService.ts`), so a directive
 * asked for by a Ministerialentwurf and a Landesgesetz is one entry, under
 * one name.
 */
import { CELEX_RE, CELLAR_QUERY_VERSION, fetchOjAnswer, fetchTranspositionAnswer, parseOjAnswer, parseTranspositionAnswer, type OjAnswer, type SparqlAnswer, type TranspositionDates } from './cellar'
import { DOSSIER_QUERY_VERSION, fetchDossierAnswer, parseDossierAnswer } from './cellarDossier'
import { PROPOSAL_CELEX_RE, PROPOSAL_QUERY_VERSION, fetchProposalAnswer, parseProposalAnswer } from './cellarVorschlag'
import { UMSETZUNG_QUERY_VERSION, DIRECTIVE_CELEX_RE, actMeasuresQuery, directivesQuery, fetchUmsetzungAnswer, measureCountsQuery, parseActMeasures, parseDirectives, parseMeasureCounts } from './cellarUmsetzung'
import { DERIVED_ANALYSIS_TTL_S, PUBLISHED_DOCUMENT_TTL_S } from '../cache/ttl'
import type { EuActRail, EuDirectiveToTranspose, EuNationalMeasure, EuProposalRecord } from '../../../shared/types/eu'

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

/**
 * One proposal's record, as it arrived — a DAY, not a month like an act's
 * dossier: a pending procedure moves (a new step, a withdrawal, the act it
 * produced), and the page states the day of the last recorded step. The
 * key carries the query's version. A failure throws and so is never
 * cached; an answer without the proposal (the Cellar does not know the
 * number) is an answer and is cached like any other.
 */
const fetchProposalAnswerCached = defineCachedFunction(
  (celex: string): Promise<SparqlAnswer> => inCellarTurn(() => fetchProposalAnswer(celex)),
  { name: 'eu-cellar-vorschlag', getKey: (celex: string) => `${celex}|v${PROPOSAL_QUERY_VERSION}`, maxAge: DERIVED_ANALYSIS_TTL_S, swr: false },
)

/**
 * One proposal of the Commission, by its CELEX: the record; `unbekannt`
 * where the Cellar answered and does not know the number — the one answer
 * that proves it; `ungelesen` where the Cellar did not answer or answered
 * in a shape the reader does not know. Never a guess between the last two.
 */
export async function proposalOf(celex: string): Promise<{ state: 'gelesen'; record: EuProposalRecord } | { state: 'unbekannt' } | { state: 'ungelesen' }> {
  if (!PROPOSAL_CELEX_RE.test(celex)) return { state: 'ungelesen' }
  try {
    const record = parseProposalAnswer(await fetchProposalAnswerCached(celex), celex)
    return record ? { state: 'gelesen', record } : { state: 'unbekannt' }
  } catch {
    return { state: 'ungelesen' }
  }
}

/**
 * The directives with a transposition date in a window, as the Cellar
 * answered — a day: a new directive enters the list the day after it is in
 * the Cellar, and the window itself moves with the day. One answer for
 * every country.
 */
const fetchDirectivesAnswerCached = defineCachedFunction(
  (from: string, to: string): Promise<SparqlAnswer> => inCellarTurn(() => fetchUmsetzungAnswer(directivesQuery(from, to))),
  { name: 'eu-cellar-richtlinien', getKey: (from: string, to: string) => `${from}|${to}|u${UMSETZUNG_QUERY_VERSION}`, maxAge: DERIVED_ANALYSIS_TTL_S, swr: false },
)

/** The directives of the window by deadline, or null where the Cellar did not answer. */
export async function directivesToTranspose(from: string, to: string): Promise<EuDirectiveToTranspose[] | null> {
  try {
    return parseDirectives(await fetchDirectivesAnswerCached(from, to))
  } catch {
    return null
  }
}

/** How many measures a country notified per directive of the window, as the Cellar answered — a day: notifications arrive daily. */
const fetchMeasureCountsAnswerCached = defineCachedFunction(
  (country: string, from: string, to: string): Promise<SparqlAnswer> => inCellarTurn(() => fetchUmsetzungAnswer(measureCountsQuery(country, from, to))),
  { name: 'eu-cellar-massnahmen-anzahl', getKey: (country: string, from: string, to: string) => `${country}|${from}|${to}|u${UMSETZUNG_QUERY_VERSION}`, maxAge: DERIVED_ANALYSIS_TTL_S, swr: false },
)

/** CELEX → number of notified measures, or null where the Cellar did not answer: unknown, never „none". */
export async function measureCountsOf(country: string, from: string, to: string): Promise<Map<string, number> | null> {
  try {
    return parseMeasureCounts(await fetchMeasureCountsAnswerCached(country, from, to))
  } catch {
    return null
  }
}

/** One directive's measures of one country, as the Cellar answered — a day, as above. Only the directive's page asks. */
const fetchActMeasuresAnswerCached = defineCachedFunction(
  (country: string, celex: string): Promise<SparqlAnswer> => inCellarTurn(() => fetchUmsetzungAnswer(actMeasuresQuery(country, celex))),
  { name: 'eu-cellar-massnahmen', getKey: (country: string, celex: string) => `${country}|${celex}|u${UMSETZUNG_QUERY_VERSION}`, maxAge: DERIVED_ANALYSIS_TTL_S, swr: false },
)

/**
 * What a country notified for one directive, by day of notification; an
 * empty list where it notified nothing; null where the Cellar did not
 * answer or the act is no directive — the page must tell the three apart.
 */
export async function actMeasuresOf(country: string, celex: string): Promise<EuNationalMeasure[] | null> {
  if (!DIRECTIVE_CELEX_RE.test(celex)) return null
  try {
    return parseActMeasures(await fetchActMeasuresAnswerCached(country, celex))
  } catch {
    return null
  }
}
