/**
 * UNTIL WHEN a directive had to be transposed — EUR-Lex's Cellar, the
 * Publications Office's SPARQL endpoint (docs/api-exploration.md §2d).
 *
 * PURE MODULE — a CELEX in, dates out; no Nitro globals, relative imports
 * only. The service caches the answer per CELEX (`euService.ts`); the corpus
 * script caches it on disk.
 *
 *     GET https://publications.europa.eu/webapi/rdf/sparql?query=…
 *     Accept: application/sparql-results+json
 *
 * No key, no account. The query asks for the work whose `owl:sameAs` is the
 * CELEX resource and, optionally, its `cdm:directive_date_transposition`
 * (beside the adoption and entry-into-force days and the German title):
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
import type { EuOjReference } from '../../../shared/types/eu'
import { upstreamJson, type UpstreamPolicy } from '../upstream/fetch'

export const CELLAR_SPARQL = 'https://publications.europa.eu/webapi/rdf/sparql'

/**
 * Bumped whenever `transpositionQuery` asks for more: the service caches the
 * raw answer per CELEX for a month, and an answer to the old query would be
 * read as an act without the new columns (the adoption day was null on
 * every page for an hour, 04.11.2026). 3: the German title (05.11.2026).
 */
export const CELLAR_QUERY_VERSION = 3

/**
 * Only a CELEX of this shape is ever put into a query — sector 3, a
 * directive, regulation, decision or framework decision. F was missing until
 * 05.11.2026: the Cellar knows a Rahmenbeschluss like any act (32009F0315
 * answers with its adoption day and German title); only the transposition
 * date is a directive's column.
 */
export const CELEX_RE = /^3\d{4}[LRDF]\d{4}$/

/**
 * The Cellar answers in ~0,25 s (measured over ~420 acts, 04.11.2026). A
 * slow one is retried, not waited out; RIS-style retry on every status,
 * because a SPARQL endpoint's 4xx under load is a bad minute, not an answer.
 */
export const CELLAR_POLICY: UpstreamPolicy = {
  timeoutMs: 10_000,
  retries: 2,
  backoffMs: (attempt) => 1_000 * attempt,
  retryOnHttpError: true,
  accept: 'application/sparql-results+json',
  maxBytes: 256 * 1024,
  // A constant URL, but the redirect hops are held to the allowlist too.
  upstreamHostsOnly: true,
}

/**
 * A language of the Cellar's authority table (`…/authority/language/DEU`):
 * three capital letters, ISO 639-2/B as the Publications Office writes them.
 * German today; the English site asks for `ENG`. Validated, because it is
 * written into the query text as it is.
 */
export const CELLAR_LANGUAGE_RE = /^[A-Z]{3}$/

function languageUri(language: string): string {
  if (!CELLAR_LANGUAGE_RE.test(language)) throw new Error(`Keine Cellar-Sprache: ${language}`)
  return `http://publications.europa.eu/resource/authority/language/${language}`
}

/**
 * The SPARQL text for one CELEX, the title in `language` (German by
 * default; the default text is the one `CELLAR_QUERY_VERSION` names, so it
 * stays as it is). Throws on anything that is not a CELEX or a language.
 */
export function transpositionQuery(celex: string, language = 'DEU'): string {
  if (!CELEX_RE.test(celex)) throw new Error(`Keine CELEX-Nummer: ${celex}`)
  const lang = languageUri(language)
  return [
    'PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>',
    'PREFIX owl: <http://www.w3.org/2002/07/owl#>',
    'SELECT ?d ?adopted ?inforce ?title WHERE {',
    `  ?w owl:sameAs <http://publications.europa.eu/resource/celex/${celex}> .`,
    '  OPTIONAL { ?w cdm:directive_date_transposition ?d }',
    '  OPTIONAL { ?w cdm:work_date_document ?adopted }',
    '  OPTIONAL { ?w cdm:resource_legal_date_entry-into-force ?inforce }',
    // The expression's full title in the asked language — never
    // `expression_title_short`, which only some acts carry, as a comma list
    // of search aliases.
    '  OPTIONAL {',
    '    ?e cdm:expression_belongs_to_work ?w .',
    `    ?e cdm:expression_uses_language <${lang}> .`,
    '    ?e cdm:expression_title ?title',
    '  }',
    '}',
  ].join('\n')
}

/** The GET URL for one CELEX. */
export function transpositionUrl(celex: string, language = 'DEU'): string {
  return `${CELLAR_SPARQL}?query=${encodeURIComponent(transpositionQuery(celex, language))}`
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
  /**
   * The act's official German title (`expression_title` of the German
   * expression): „Richtlinie (EU) 2024/1069 des Europäischen Parlaments und
   * des Rates vom 11. April 2024 über den Schutz …". Null where it has none.
   */
  title: string | null
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
  const title = bindings.map((b) => b?.title?.value?.trim() ?? '').find((t) => t.length > 0) ?? null
  // The OPTIONALs multiply the rows; each column is read as its own set.
  return { found: bindings.length > 0, dates: days('d'), adopted: days('adopted')[0] ?? null, inForce: days('inforce')[0] ?? null, title }
}

/**
 * The Cellar's answer for one act, as it arrived — the service caches this
 * and parses fresh. Throws on a failure: an unreachable Cellar is not „keine
 * Frist", and the caller must not cache it as one.
 */
export function fetchTranspositionAnswer(celex: string, policy: UpstreamPolicy = CELLAR_POLICY, language = 'DEU'): Promise<SparqlAnswer> {
  return upstreamJson<SparqlAnswer>(transpositionUrl(celex, language), policy)
}

/** The transposition dates of one act, fetched and read. Throws on a failure, as above. */
export async function fetchTranspositionDates(celex: string, policy: UpstreamPolicy = CELLAR_POLICY, language = 'DEU'): Promise<TranspositionDates> {
  return parseTranspositionAnswer(await fetchTranspositionAnswer(celex, policy, language))
}

/*
 * WHERE IT WAS PUBLISHED — the Amtsblatt reference a footnote cites
 * (06.11.2026). A query of its own, not three more OPTIONALs in
 * `transpositionQuery`: those multiply its rows, and a new column there
 * would refetch every cached act for a fact only the act's page reads.
 *
 * Measured over the 230 acts of the map (06.11.2026): 153 in a numbered
 * issue, 77 published act by act (the Journal's form since 01.10.2023),
 * every one of them with its reference and an ELI.
 *
 *   - issue form: series and issue from the work's `oj:JOL_2022_333_R…`
 *     alias, the date from that issue (`published_in_official-journal`),
 *     the first page from the German manifestation. The alias decides the
 *     issue because two acts of 2004 (2004/84, 2004/113) link a second
 *     one, from 2006, beside the original.
 *   - act form: `official-journal-act_date_publication` and
 *     `resource_legal_reference_oj-act` („2023/2413"), the series from the
 *     `oj:L_202302413` alias.
 */

/**
 * The SPARQL text for one act's Amtsblatt reference; the first page is the
 * manifestation's in `language` (German by default). Throws on anything that
 * is not a CELEX or a language.
 */
export function ojQuery(celex: string, language = 'DEU'): string {
  if (!CELEX_RE.test(celex)) throw new Error(`Keine CELEX-Nummer: ${celex}`)
  const lang = languageUri(language)
  return [
    'PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>',
    'PREFIX owl: <http://www.w3.org/2002/07/owl#>',
    'SELECT ?eli ?ojid ?num ?pub ?pf ?apub ?aref WHERE {',
    `  ?w owl:sameAs <http://publications.europa.eu/resource/celex/${celex}> .`,
    '  OPTIONAL { ?w cdm:resource_legal_eli ?eli }',
    '  OPTIONAL { ?w owl:sameAs ?ojid FILTER(STRSTARTS(STR(?ojid), "http://publications.europa.eu/resource/oj/")) }',
    '  OPTIONAL { ?w cdm:resource_legal_published_in_official-journal ?oj .',
    '    ?oj cdm:official-journal_number ?num ; cdm:publication_general_date_publication ?pub }',
    '  OPTIONAL { ?w cdm:official-journal-act_date_publication ?apub }',
    '  OPTIONAL { ?w cdm:resource_legal_reference_oj-act ?aref }',
    '  OPTIONAL {',
    '    ?e cdm:expression_belongs_to_work ?w .',
    `    ?e cdm:expression_uses_language <${lang}> .`,
    '    ?m cdm:manifestation_manifests_expression ?e ; cdm:manifestation_official-journal_part_page_first ?pf',
    '  }',
    '}',
  ].join('\n')
}

/** What the Cellar says about where an act was published. */
export interface OjAnswer {
  oj: EuOjReference | null
  /** „http://data.europa.eu/eli/dir/2022/2555/oj"; null where the Cellar has none. */
  eli: string | null
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** The answer of `ojQuery`, read. A malformed one throws, as `parseTranspositionAnswer`. */
export function parseOjAnswer(answer: SparqlAnswer): OjAnswer {
  const bindings = answer?.results?.bindings
  if (!Array.isArray(bindings)) throw new Error('Cellar-Antwort ohne results.bindings')
  const values = (key: string): string[] => [...new Set(bindings.map((b) => b?.[key]?.value?.trim() ?? '').filter((v) => v.length > 0))]
  const day = (v: string | undefined): string | null => (v && DAY_RE.test(v.slice(0, 10)) ? v.slice(0, 10) : null)
  const eli = values('eli')[0] ?? null
  // `…/resource/oj/JOL_2022_333_R_0002` (issue) or `…/resource/oj/L_202302413` (act).
  const ojIds = values('ojid').map((u) => u.slice(u.lastIndexOf('/') + 1))

  const ref = values('aref')[0]
  const actDate = day(values('apub')[0])
  const actSeries = ojIds.map((id) => /^([LC])_\d+$/.exec(id)?.[1]).find(Boolean) as 'L' | 'C' | undefined
  if (ref && actDate && actSeries) return { oj: { form: 'act', series: actSeries, act: ref, date: actDate }, eli }

  for (const id of ojIds) {
    const m = /^JO([LC])_\d{4}_(\d+)_/.exec(id)
    if (!m) continue
    const issue = String(Number(m[2]))
    // The date of THAT issue: a second linked issue (a republication) has its own.
    const date = bindings
      .filter((b) => String(Number(b?.num?.value ?? NaN)) === issue)
      .map((b) => day(b?.pub?.value))
      .find((d): d is string => d !== null)
    if (!date) continue
    const pages = values('pf').map(Number).filter((n) => Number.isInteger(n) && n > 0)
    return { oj: { form: 'issue', series: m[1] as 'L' | 'C', issue, date, page: pages.length ? Math.min(...pages) : null }, eli }
  }
  return { oj: null, eli }
}

/** The Cellar's answer to `ojQuery`, as it arrived. Throws on a failure, as `fetchTranspositionAnswer`. */
export function fetchOjAnswer(celex: string, policy: UpstreamPolicy = CELLAR_POLICY, language = 'DEU'): Promise<SparqlAnswer> {
  return upstreamJson<SparqlAnswer>(`${CELLAR_SPARQL}?query=${encodeURIComponent(ojQuery(celex, language))}`, policy)
}

/** The deadline the page prints and the others for the footnote (rule D3). */
export function deadlineOf(dates: readonly string[]): { deadline: string; otherDates: string[] } | null {
  if (!dates.length) return null
  const sorted = [...new Set(dates)].sort()
  return { deadline: sorted.at(-1)!, otherDates: sorted.slice(0, -1) }
}
