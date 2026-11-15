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
 * 73 with the latest date passed, 51 with it to come.
 *
 * THREE QUERIES, EACH AS IT WAS RUN. The dates of the window; the titles
 * and types of those directives; one country's notified measures. Asking
 * dates and titles at once (GROUP BY with the title OPTIONAL) ran into the
 * Cellar's timeout, so they stay apart. The country is not part of the
 * first two: one answer serves every country's list.
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

/**
 * One country's measures for a four-year window are a large answer:
 * Austria's was 1.6 MB on 15.11.2026 (1,264 rows of eleven columns). The
 * Cellar's ordinary ceiling of 256 kB would cut it off.
 */
export const UMSETZUNG_POLICY: UpstreamPolicy = { ...CELLAR_POLICY, timeoutMs: 60_000, maxBytes: 6 * 1024 * 1024 }

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

const windowPattern = (from: string, to: string) => ` ?w cdm:directive_date_transposition ?d . FILTER(?d >= "${from}"^^xsd:date && ?d <= "${to}"^^xsd:date)
 ?w cdm:resource_legal_id_celex ?celex . FILTER(REGEX(STR(?celex),"^3[0-9]{4}L[0-9]{4}$"))`

/** Every directive with a transposition date in the window, one row per (directive, date). */
export function deadlinesQuery(from: string, to: string): string {
  assertWindow(from, to)
  return `${PREFIXES}
SELECT DISTINCT ?celex ?d WHERE {
${windowPattern(from, to)} }`
}

/** The titles (in `language`) and the Cellar's types of the given directives. */
export function titlesQuery(celexes: readonly string[], language = 'DEU'): string {
  if (!CELLAR_LANGUAGE_RE.test(language)) throw new Error(`Keine Cellar-Sprache: ${language}`)
  const bad = celexes.find((c) => !DIRECTIVE_CELEX_RE.test(c))
  if (bad !== undefined || !celexes.length) throw new Error(`Keine Richtlinie: ${bad ?? '(leer)'}`)
  return `${PREFIXES}
SELECT DISTINCT ?celex ?title ?type WHERE { VALUES ?celex { ${celexes.map((c) => `"${c}"^^xsd:string`).join(' ')} } ?w cdm:resource_legal_id_celex ?celex ; cdm:directive_date_transposition ?x .
 OPTIONAL { ?e cdm:expression_belongs_to_work ?w ; cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/${language}> ; cdm:expression_title ?title }
 OPTIONAL { ?w cdm:work_has_resource-type ?type } }`
}

/** What one country notified for the directives of the window, one row per measure (more where a column has two values). */
export function measuresQuery(country: string, from: string, to: string): string {
  assertWindow(from, to)
  if (!CELLAR_COUNTRY_RE.test(country)) throw new Error(`Kein Cellar-Land: ${country}`)
  return `${PREFIXES}
SELECT DISTINCT ?celex ?m ?title ?type ?notified ?ojname ?ojnum ?ojdate ?link ?ref ?doc WHERE {
${windowPattern(from, to)}
 ?m cdm:measure_national_implementing_implements_resource_legal ?w ; cdm:measure_national_implementing_implemented_by_country <http://publications.europa.eu/resource/authority/country/${country}> .
 OPTIONAL { ?m cdm:work_title ?title } OPTIONAL { ?m cdm:measure_national_implementing_type_act ?type } OPTIONAL { ?m cdm:measure_national_implementing_date_notification ?notified }
 OPTIONAL { ?m cdm:measure_national_implementing_name_official_journal ?ojname } OPTIONAL { ?m cdm:measure_national_implementing_number_official_journal ?ojnum } OPTIONAL { ?m cdm:measure_national_implementing_date_official_journal ?ojdate }
 OPTIONAL { ?m cdm:measure_national_implementing_national_website_link ?link } OPTIONAL { ?m cdm:measure_national_implementing_reference_member-state ?ref } OPTIONAL { ?m cdm:work_date_document ?doc } }`
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
 * The three answers, read into one list, ascending by deadline and then by
 * CELEX — the order of the dates, never of what was notified (rule D6).
 *
 * `measures` may be null: the country's answer is missing. Then every
 * directive comes back with `measures: null` (see the type).
 */
export function parseUmsetzung(
  deadlines: SparqlAnswer,
  titles: SparqlAnswer,
  measures: SparqlAnswer | null,
): EuDirectiveToTranspose[] {
  const dates = new Map<string, string[]>()
  for (const row of rowsOf(deadlines)) {
    const celex = text(row, 'celex')
    const d = day(row, 'd')
    if (!celex || !DIRECTIVE_CELEX_RE.test(celex) || !d) continue
    dates.set(celex, [...(dates.get(celex) ?? []), d])
  }

  const title = new Map<string, string>()
  const form = new Map<string, EuDirectiveForm>()
  for (const row of rowsOf(titles)) {
    const celex = text(row, 'celex')
    if (!celex) continue
    const t = text(row, 'title')
    if (t && !title.has(celex)) title.set(celex, t)
    const f = FORMS[text(row, 'type')?.split('/').pop() ?? '']
    if (f && !form.has(celex)) form.set(celex, f)
  }

  // One measure per Cellar URI; where a column has two values the first by sort order stands.
  const byDirective = new Map<string, Map<string, EuNationalMeasure>>()
  if (measures) {
    const sorted = [...rowsOf(measures)].sort((a, b) => cmp(JSON.stringify(a), JSON.stringify(b)))
    for (const row of sorted) {
      const celex = text(row, 'celex')
      const uri = text(row, 'm')
      if (!celex || !uri) continue
      const of = byDirective.get(celex) ?? new Map<string, EuNationalMeasure>()
      byDirective.set(celex, of)
      if (of.has(uri)) continue
      of.set(uri, {
        title: text(row, 'title'),
        kind: text(row, 'type'),
        notified: day(row, 'notified'),
        gazette: { name: text(row, 'ojname'), number: text(row, 'ojnum'), date: day(row, 'ojdate') },
        url: publicMeasureUrl(text(row, 'link')),
      })
    }
  }

  return [...dates.entries()]
    .map(([celex, ds]) => {
      const { deadline, otherDates } = deadlineOf(ds)!
      const own = [...(byDirective.get(celex)?.values() ?? [])].sort((a, b) =>
        cmp(a.notified ?? '9999', b.notified ?? '9999') || cmp(a.gazette.date ?? '', b.gazette.date ?? '') || cmp(a.title ?? '', b.title ?? ''))
      return { celex, title: title.get(celex) ?? null, form: form.get(celex) ?? null, deadline, otherDates, measures: measures ? own : null }
    })
    .sort((a, b) => cmp(a.deadline, b.deadline) || cmp(a.celex, b.celex))
}
