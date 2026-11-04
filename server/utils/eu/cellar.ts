/**
 * UNTIL WHEN a directive had to be transposed — EUR-Lex's Cellar, the
 * Publications Office's SPARQL endpoint (docs/architecture.md §12.66,
 * docs/api-exploration.md §9).
 *
 * PURE MODULE — a CELEX in, dates out; no Nitro globals, relative imports
 * only. The service caches the answer per CELEX (`euService.ts`); the corpus
 * script caches it on disk.
 *
 *     GET https://publications.europa.eu/webapi/rdf/sparql?query=…
 *     Accept: application/sparql-results+json
 *
 * No key, no account. The query asks for the work whose `owl:sameAs` is the
 * CELEX resource and, optionally, its `cdm:directive_date_transposition`:
 * a binding without a date means the act exists and names no deadline (every
 * regulation, some directives); no binding at all means EUR-Lex knows no such
 * act — a citation error in the draft („Verordnung (EU) 2022/689" for
 * 2022/869), and such an act is not shown.
 *
 * SEVERAL DATES, NO LABEL. 50 of the 168 directives with a date carry more
 * than one (04.11.2026), and the Cellar does not say which is the general
 * deadline: for 2024/1275 it answers 2025-01-01 and 2026-05-29, and the
 * draft's Erläuterungen call the second the deadline „großteils". The page
 * therefore prints the LATEST as „Umsetzungsfrist" and the others as
 * „weitere Fristen für einzelne Bestimmungen" (rule D3).
 */
import { upstreamJson, type UpstreamPolicy } from '../upstream/fetch'

export const CELLAR_SPARQL = 'https://publications.europa.eu/webapi/rdf/sparql'

/**
 * Bumped whenever `transpositionQuery` asks for more: the service caches the
 * raw answer per CELEX for a month, and an answer to the old query would be
 * read as an act without the new columns (the adoption day was null on
 * every page for an hour, 04.11.2026).
 */
export const CELLAR_QUERY_VERSION = 2

/** Only a CELEX of this shape is ever put into a query — sector 3, a directive, regulation or decision. */
export const CELEX_RE = /^3\d{4}[LRD]\d{4}$/

/**
 * The Cellar answers in ~0,25 s (measured over ~420 acts, 04.11.2026). A
 * slow one is retried, not waited out; RIS-style retry on every status,
 * because a SPARQL endpoint's 4xx under load is a bad minute, not an answer.
 */
const CELLAR_POLICY: UpstreamPolicy = {
  timeoutMs: 10_000,
  retries: 2,
  backoffMs: (attempt) => 1_000 * attempt,
  retryOnHttpError: true,
  accept: 'application/sparql-results+json',
  maxBytes: 256 * 1024,
  // A constant URL, but the redirect hops are held to the allowlist too.
  upstreamHostsOnly: true,
}

/** The SPARQL text for one CELEX. Throws on anything that is not a CELEX. */
export function transpositionQuery(celex: string): string {
  if (!CELEX_RE.test(celex)) throw new Error(`Keine CELEX-Nummer: ${celex}`)
  return [
    'PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>',
    'PREFIX owl: <http://www.w3.org/2002/07/owl#>',
    'SELECT ?d ?adopted ?inforce WHERE {',
    `  ?w owl:sameAs <http://publications.europa.eu/resource/celex/${celex}> .`,
    '  OPTIONAL { ?w cdm:directive_date_transposition ?d }',
    '  OPTIONAL { ?w cdm:work_date_document ?adopted }',
    '  OPTIONAL { ?w cdm:resource_legal_date_entry-into-force ?inforce }',
    '}',
  ].join('\n')
}

/** The GET URL for one CELEX. */
export function transpositionUrl(celex: string): string {
  return `${CELLAR_SPARQL}?query=${encodeURIComponent(transpositionQuery(celex))}`
}

/** What the Cellar says about one act. */
export interface TranspositionDates {
  /** Whether EUR-Lex knows the act at all. */
  found: boolean
  /** Every transposition date, ISO, ascending, once each. Empty for a regulation. */
  dates: string[]
  /** The day the act was adopted (`work_date_document`), ISO — the left edge of the EU timeline. Null where the Cellar has none. */
  adopted: string | null
  /** The day it entered into force, ISO, the earliest where several are listed. */
  inForce: string | null
}

/** The JSON shape of a SPARQL SELECT answer, as far as it is read here. */
export interface SparqlAnswer {
  results?: { bindings?: Record<string, { value?: string } | undefined>[] }
}

/** The answer of `transpositionQuery`, read. A malformed one throws: it is no answer. */
export function parseTranspositionAnswer(answer: SparqlAnswer): TranspositionDates {
  const bindings = answer?.results?.bindings
  if (!Array.isArray(bindings)) throw new Error('Cellar-Antwort ohne results.bindings')
  const days = (key: string): string[] => [...new Set(bindings
    .map((b) => b?.[key]?.value?.slice(0, 10) ?? null)
    .filter((d): d is string => d !== null && /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort()
  // The OPTIONALs multiply the rows; each column is read as its own set.
  return { found: bindings.length > 0, dates: days('d'), adopted: days('adopted')[0] ?? null, inForce: days('inforce')[0] ?? null }
}

/**
 * The Cellar's answer for one act, as it arrived — the service caches this
 * and parses fresh. Throws on a failure: an unreachable Cellar is not „keine
 * Frist", and the caller must not cache it as one.
 */
export function fetchTranspositionAnswer(celex: string, policy: UpstreamPolicy = CELLAR_POLICY): Promise<SparqlAnswer> {
  return upstreamJson<SparqlAnswer>(transpositionUrl(celex), policy)
}

/** The transposition dates of one act, fetched and read. Throws on a failure, as above. */
export async function fetchTranspositionDates(celex: string, policy: UpstreamPolicy = CELLAR_POLICY): Promise<TranspositionDates> {
  return parseTranspositionAnswer(await fetchTranspositionAnswer(celex, policy))
}

/** The deadline the page prints and the others for the footnote (rule D3). */
export function deadlineOf(dates: readonly string[]): { deadline: string; otherDates: string[] } | null {
  if (!dates.length) return null
  const sorted = [...new Set(dates)].sort()
  return { deadline: sorted.at(-1)!, otherDates: sorted.slice(0, -1) }
}
