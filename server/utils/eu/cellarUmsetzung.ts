/**
 * WHICH DIRECTIVES A COUNTRY HAS TO TRANSPOSE, and what it told the
 * Commission it did — read from the EUR-Lex Cellar (step 7 of the EU
 * cycle, docs/research/umsetzungsplan-eu-zyklus.md).
 *
 * PURE MODULE — a window and a country in, `EuDirectiveToTranspose[]` out;
 * no Nitro globals, relative imports only.
 *
 * THE POPULATION COMES FROM THE CELLAR, NOT FROM DRAFTS: every directive
 * with a transposition date inside the window, whether or not anybody in
 * the country works on it. Measured on 15.11.2026 for the four years
 * around that day (15.11.2024 – 15.11.2028): 124 directives — 96 of
 * Parliament and Council or the Council, 21 delegated, 7 implementing —
 * 72 with the latest date passed, 52 with it that day or to come. A
 * directive is in the list for ANY date in the window; its deadline is its
 * latest date, which for 13 lies beyond the window.
 *
 * THREE SMALL QUERIES, EACH AS IT WAS RUN on 15.11.2026, each answered in
 * under a second: the directives of the window with their dates, titles
 * and types (132 kB); per country, how many measures it notified for each
 * (17 kB); and one directive's measures in full, asked by the directive's
 * own page. The list never loads the measures themselves — Austria's for
 * the whole window are 1.6 MB — only their count. The first query knows no
 * country: one answer serves every country's list.
 *
 * A NOTIFIED MEASURE IS THE MEMBER STATE'S CLAIM
 * (`cdm:measure_national_implementing_*`). Austria notified 1,264 measures
 * for 80 of the 124 directives, 465 of them dated before the directive's
 * own year: existing law it says already covers the directive. Germany
 * notified 252 for 78. The Commission does not confirm completeness in
 * this data, so nothing here says „umgesetzt" — the reader passes on what
 * was notified, when, and where it was promulgated.
 *
 * WHAT IS UNEVEN. Every Austrian measure carries a title, a kind, the day
 * of notification and the gazette's day; 1,255 of 1,264 a gazette number;
 * 766 an address, nearly all in the RIS. Germany's carry no address and a
 * gazette name in 8 of 252. Fifteen Austrian addresses point into the
 * federal intranet (`ris.bka.intra.gv.at`): an address is passed on only
 * where it is https and no intranet host, null otherwise.
 */
import type { EuDirectiveForm, EuDirectiveToTranspose, EuNationalMeasure } from '../../../shared/types/eu'
import { upstreamJson, type UpstreamPolicy } from '../upstream/fetch'
import { CELLAR_LANGUAGE_RE, CELLAR_POLICY, CELLAR_SPARQL, deadlineOf, type SparqlAnswer } from './cellar'

/** Bumped whenever one of the three queries asks for something else. */
export const UMSETZUNG_QUERY_VERSION = 1

/** One directive can have well over a hundred measures (139 for 32023L2413, 145 kB): above the Cellar client's ordinary ceiling. */
export const UMSETZUNG_POLICY: UpstreamPolicy = { ...CELLAR_POLICY, maxBytes: 2 * 1024 * 1024 }

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
/** A directive's CELEX: sector 3, the year, „L", the number. */
export const DIRECTIVE_CELEX_RE = /^3\d{4}L\d{4}$/
/** A country of the Cellar's authority table (`…/authority/country/AUT`): three capital letters. */
export const CELLAR_COUNTRY_RE = /^[A-Z]{3}$/

const PREFIXES = `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>`

function assertWindow(from: string, to: string): void {
  if (!DAY_RE.test(from) || !DAY_RE.test(to) || from > to) throw new Error(`Kein Zeitfenster: ${from} – ${to}`)
}

const windowPattern = (from: string, to: string, v = 'd') => ` ?w cdm:directive_date_transposition ?${v} . FILTER(?${v} >= "${from}"^^xsd:date && ?${v} <= "${to}"^^xsd:date)
 ?w cdm:resource_legal_id_celex ?celex . FILTER(REGEX(STR(?celex),"^3[0-9]{4}L[0-9]{4}$"))`

/** Every directive with a transposition date in the window, with ALL its dates, its title (in `language`) and type: one row per (directive, date). */
export function directivesQuery(from: string, to: string, language = 'DEU'): string {
  assertWindow(from, to)
  if (!CELLAR_LANGUAGE_RE.test(language)) throw new Error(`Keine Cellar-Sprache: ${language}`)
  // `?in` in the window picks the directive; `?d` is every date it has, so
  // the deadline is the latest one also where that lies beyond the window
  // (32024L1760: 26.07.2028 in the window, 26.07.2029 the latest).
  return `${PREFIXES}
SELECT DISTINCT ?celex ?d ?title ?type WHERE {
${windowPattern(from, to, 'in')}
 ?w cdm:directive_date_transposition ?d .
 OPTIONAL { ?e cdm:expression_belongs_to_work ?w ; cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/${language}> ; cdm:expression_title ?title }
 OPTIONAL { ?w cdm:work_has_resource-type ?type } }`
}

const countryUri = (country: string): string => {
  if (!CELLAR_COUNTRY_RE.test(country)) throw new Error(`Kein Cellar-Land: ${country}`)
  return `<http://publications.europa.eu/resource/authority/country/${country}>`
}

/** How many measures one country notified for each directive of the window; a directive without one has no row. */
export function measureCountsQuery(country: string, from: string, to: string): string {
  assertWindow(from, to)
  return `${PREFIXES}
SELECT ?celex (COUNT(DISTINCT ?m) AS ?n) WHERE {
${windowPattern(from, to)}
 ?m cdm:measure_national_implementing_implements_resource_legal ?w ; cdm:measure_national_implementing_implemented_by_country ${countryUri(country)} . } GROUP BY ?celex`
}

/** What one country notified for one directive, one row per measure (more where a column has two values). */
export function actMeasuresQuery(country: string, celex: string): string {
  if (!DIRECTIVE_CELEX_RE.test(celex)) throw new Error(`Keine Richtlinie: ${celex}`)
  return `${PREFIXES}
SELECT DISTINCT ?m ?title ?type ?notified ?ojname ?ojnum ?ojdate ?link WHERE {
 ?w cdm:resource_legal_id_celex "${celex}"^^xsd:string .
 ?m cdm:measure_national_implementing_implements_resource_legal ?w ; cdm:measure_national_implementing_implemented_by_country ${countryUri(country)} .
 OPTIONAL { ?m cdm:work_title ?title } OPTIONAL { ?m cdm:measure_national_implementing_type_act ?type } OPTIONAL { ?m cdm:measure_national_implementing_date_notification ?notified }
 OPTIONAL { ?m cdm:measure_national_implementing_name_official_journal ?ojname } OPTIONAL { ?m cdm:measure_national_implementing_number_official_journal ?ojnum } OPTIONAL { ?m cdm:measure_national_implementing_date_official_journal ?ojdate }
 OPTIONAL { ?m cdm:measure_national_implementing_national_website_link ?link } }`
}

/** The Cellar's answer to one of the queries, as it arrived. Throws on a failure: no answer is not „nothing notified". */
export function fetchUmsetzungAnswer(query: string, policy: UpstreamPolicy = UMSETZUNG_POLICY): Promise<SparqlAnswer> {
  return upstreamJson<SparqlAnswer>(`${CELLAR_SPARQL}?query=${encodeURIComponent(query)}`, policy)
}

type Row = Record<string, { value?: string } | undefined>

function rowsOf(answer: SparqlAnswer): Row[] {
  const bindings = answer?.results?.bindings
  if (!Array.isArray(bindings)) throw new Error('Cellar-Antwort ohne results.bindings')
  return bindings
}

const text = (row: Row, key: string): string | null => {
  const v = row[key]?.value?.replace(/\s+/g, ' ').trim()
  return v ? v : null
}
const day = (row: Row, key: string): string | null => {
  const v = row[key]?.value?.slice(0, 10)
  return v && DAY_RE.test(v) ? v : null
}
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

const FORMS: Readonly<Record<string, EuDirectiveForm>> = {
  DIR: 'richtlinie',
  DIR_DEL: 'delegierte-richtlinie',
  DIR_IMPL: 'durchfuehrungsrichtlinie',
}

/** A measure's address, only where anybody can open it: https, and no intranet host. */
export function publicMeasureUrl(raw: string | null): string | null {
  if (!raw) return null
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:' || /(^|\.)intra\./.test(u.hostname)) return null
    return u.toString()
  } catch {
    return null
  }
}

/**
 * The directives of the window, ascending by deadline and then by CELEX —
 * the order of the dates, never of what was notified (rule D6).
 */
export function parseDirectives(answer: SparqlAnswer): EuDirectiveToTranspose[] {
  const dates = new Map<string, string[]>()
  const title = new Map<string, string>()
  const form = new Map<string, EuDirectiveForm>()
  for (const row of rowsOf(answer)) {
    const celex = text(row, 'celex')
    const d = day(row, 'd')
    if (!celex || !DIRECTIVE_CELEX_RE.test(celex) || !d) continue
    dates.set(celex, [...(dates.get(celex) ?? []), d])
    const t = text(row, 'title')
    if (t && !title.has(celex)) title.set(celex, t)
    const f = FORMS[text(row, 'type')?.split('/').pop() ?? '']
    if (f && !form.has(celex)) form.set(celex, f)
  }
  return [...dates.entries()]
    .map(([celex, ds]) => ({ celex, title: title.get(celex) ?? null, form: form.get(celex) ?? null, ...deadlineOf(ds)! }))
    .sort((a, b) => cmp(a.deadline, b.deadline) || cmp(a.celex, b.celex))
}

/** CELEX → the number of measures notified. A directive that is not in the map has none: the query returns no row for it. */
export function parseMeasureCounts(answer: SparqlAnswer): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rowsOf(answer)) {
    const celex = text(row, 'celex')
    const n = Number(text(row, 'n'))
    if (celex && Number.isInteger(n) && n > 0) counts.set(celex, n)
  }
  return counts
}

/**
 * One directive's notified measures, by day of notification. One measure
 * per Cellar URI; where a column has two values the first by sort order
 * stands, so the same answer always reads the same.
 */
export function parseActMeasures(answer: SparqlAnswer): EuNationalMeasure[] {
  const byUri = new Map<string, EuNationalMeasure>()
  const sorted = [...rowsOf(answer)].sort((a, b) => cmp(JSON.stringify(a), JSON.stringify(b)))
  for (const row of sorted) {
    const uri = text(row, 'm')
    if (!uri || byUri.has(uri)) continue
    byUri.set(uri, {
      title: text(row, 'title'),
      kind: text(row, 'type'),
      notified: day(row, 'notified'),
      gazette: { name: text(row, 'ojname'), number: text(row, 'ojnum'), date: day(row, 'ojdate') },
      url: publicMeasureUrl(text(row, 'link')),
    })
  }
  return [...byUri.values()].sort((a, b) =>
    cmp(a.notified ?? '9999', b.notified ?? '9999') || cmp(a.gazette.date ?? '', b.gazette.date ?? '') || cmp(a.title ?? '', b.title ?? ''))
}
