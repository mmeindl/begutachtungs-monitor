/**
 * The EUR-Lex Cellar, cached — one door for the Bund's EU fact
 * (`euService.ts`) and the Länder's (`landEuService.ts`), so a directive
 * asked for by a Ministerialentwurf and a Landesgesetz is one entry, under
 * one name (docs/architecture.md §12.66).
 */
import { CELEX_RE, CELLAR_QUERY_VERSION, fetchTranspositionAnswer, parseTranspositionAnswer, type SparqlAnswer, type TranspositionDates } from './cellar'
import { PUBLISHED_DOCUMENT_TTL_S } from '../cache/ttl'

/**
 * The Cellar's answer for one CELEX, as it arrived. A month: a directive's
 * transposition dates are fixed in its own text; a later act that moves
 * them is an act of its own with its own CELEX.
 */
const fetchCellarAnswer = defineCachedFunction(
  (celex: string): Promise<SparqlAnswer> => fetchTranspositionAnswer(celex),
  { name: 'eu-cellar', getKey: (celex: string) => `${celex}|q${CELLAR_QUERY_VERSION}`, maxAge: PUBLISHED_DOCUMENT_TTL_S, swr: false },
)

/** One act's dates, or null where the Cellar did not answer. */
export async function transpositionOf(celex: string): Promise<TranspositionDates | null> {
  if (!CELEX_RE.test(celex)) return { found: true, dates: [], adopted: null, inForce: null }
  try {
    return parseTranspositionAnswer(await fetchCellarAnswer(celex))
  } catch {
    return null
  }
}
