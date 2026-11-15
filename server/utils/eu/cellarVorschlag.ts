/**
 * A PROPOSAL OF THE COMMISSION THAT LEFT THE COMMISSION — its procedure
 * between the institutions as far as the EUR-Lex Cellar records it (step 3
 * of the EU cycle, docs/research/umsetzungsplan-eu-zyklus.md).
 *
 * PURE MODULE — a CELEX in, an `EuProposalRecord` out; no Nitro globals,
 * relative imports only. The service caches the raw answer per CELEX
 * (`cellarService.ts`, `proposalOf`).
 *
 * ADDRESSED BY THE PROPOSAL'S CELEX, `5<year>PC<number padded to four>`
 * (COM(2026) 780 → 52026PC0780), through `owl:sameAs` on the CELEX
 * resource: 0.25 s an answer on 15.11.2026. The same address as a FILTER
 * on the CELEX literal took 55–90 s — never write it that way. The COM
 * number is turned into the CELEX by rule, not read from the Cellar: the
 * Cellar's own identifiers disagree with each other now and then
 * (32013L0059 lists `com:COM_2011_591` beside `celex:52011PC0593`), so a
 * page of an old proposal can show the document the CELEX names, not the
 * one the COM number was meant for. Not measured for proposals.
 *
 * ONE QUERY, TYPED ROWS, the house style of `cellarDossier.ts`: five UNION
 * branches, each row's kind in column `k` — `proposal` (a = the document's
 * day), `title` (a = title, b = language, German or English), `dossier`
 * (a = dossier, b = procedure number „2026/0307/COD", c = procedure type,
 * d/e/f = the pending, withdrawn and adopted flags as "0"/"1"), `event`
 * (a = dossier, b = step, c = type, d = day, e = institution), `act` (a =
 * dossier, b = CELEX of an act it produced). The `proposal` branch binds
 * its kind outside an OPTIONAL, so it gives exactly one row whenever the
 * Cellar knows the document: no such row is the Cellar's proof that it
 * does not know the number.
 *
 * WHICH FLAGS ARE READ, AND WHICH ARE NOT (15.11.2026). The three dossier
 * flags are read as they are and decided together by `euProposalStandOf`
 * (`shared/utils/euVorschlag.ts`): they contradict each other in one
 * dossier since 2019, so none of them alone is the stand. The Cellar's
 * separate field „file-status" is NOT read: it says PENDING on 22 of the
 * 52 withdrawn dossiers of 2019–2024 and ADOPTED on 6 pending ones. A
 * withdrawal is dated by the Commission's step `WDW_byCOM` — 50 of those
 * 52 withdrawn dossiers carry it with a day.
 *
 * THE STEPS through the act rail's own reading (`readEventRow`,
 * `procedureOf`), so a step is read, labelled and counted the same on both
 * pages.
 *
 * THE TITLE. The German one is missing on some fresh proposals (52026PC0780
 * on 15.11.2026: English only); the English one stands in, flagged.
 */
import type { EuProposalDossier, EuProposalFlags, EuProposalRecord } from '../../../shared/types/eu'
import { EU_EVENTS } from '../../../shared/utils/euEvents'
import { upstreamJson, type UpstreamPolicy } from '../upstream/fetch'
import { CELLAR_SPARQL, type SparqlAnswer } from './cellar'
import { DOSSIER_POLICY, OBSERVATORY_FILE, day, lastSegment, procedureOf, readEventRow, value, type DossierRows, type EventSink, type SparqlRow } from './cellarDossier'

/**
 * Bumped whenever `proposalQuery` asks for something else: the service
 * caches the raw answer per CELEX for a day, and an answer to an old query
 * would be read as if it were complete.
 */
export const PROPOSAL_QUERY_VERSION = 1

/**
 * The largest of the six answers of 15.11.2026 is 22 KB (a withdrawn
 * proposal with 33 steps); the dossier reader's half a megabyte fits.
 */
export const PROPOSAL_POLICY: UpstreamPolicy = DOSSIER_POLICY

/** A proposal's CELEX: sector 5, year, `PC`, four digits. No part number („(03)"): the address is one document. */
export const PROPOSAL_CELEX_RE = /^5(\d{4})PC(\d{4})$/

/** `52026PC0780` from year and number; null for anything that is no year of four digits and number of one to four. */
export function proposalCelex(year: number, number: number): string | null {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) return null
  if (!Number.isInteger(number) || number < 1 || number > 9999) return null
  return `5${year}PC${String(number).padStart(4, '0')}`
}

/**
 * The SPARQL text for one proposal. Throws on anything that is not a
 * proposal's CELEX: the number is written into the query as it is.
 */
export function proposalQuery(celex: string): string {
  if (!PROPOSAL_CELEX_RE.test(celex)) throw new Error(`Keine CELEX-Nummer eines Vorschlags: ${celex}`)
  return `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>
SELECT DISTINCT ?k ?a ?b ?c ?d ?e ?f WHERE {
  ?p owl:sameAs <http://publications.europa.eu/resource/celex/${celex}> .
  {
    BIND("proposal" AS ?k) OPTIONAL { ?p cdm:work_date_document ?a }
  } UNION {
    BIND("title" AS ?k) ?x cdm:expression_belongs_to_work ?p ; cdm:expression_title ?a ; cdm:expression_uses_language ?b .
    FILTER(?b IN (<http://publications.europa.eu/resource/authority/language/DEU>, <http://publications.europa.eu/resource/authority/language/ENG>))
  } UNION {
    BIND("dossier" AS ?k) ?a cdm:dossier_initiated_by_act_preparatory ?p .
    OPTIONAL { ?a cdm:procedure_code_interinstitutional_reference_procedure ?b }
    OPTIONAL { ?a cdm:procedure_code_interinstitutional_has_type_concept_type_procedure_code_interinstitutional ?c }
    OPTIONAL { ?a cdm:dossier_pending-proposal ?d }
    OPTIONAL { ?a cdm:dossier_withdrawn-proposal ?e }
    OPTIONAL { ?a cdm:dossier_adopted-proposal ?f }
  } UNION {
    BIND("event" AS ?k) ?a cdm:dossier_initiated_by_act_preparatory ?p .
    ?b cdm:event_legal_part_of_dossier ?a ; cdm:event_legal_has_type_concept_type_event_legal ?c .
    OPTIONAL { ?b cdm:event_legal_date ?d }
    OPTIONAL { ?b cdm:event_legal_initiated_by_institution ?e }
  } UNION {
    BIND("act" AS ?k) ?a cdm:dossier_initiated_by_act_preparatory ?p .
    { ?a cdm:dossier_produces_resource_legal ?w } UNION { ?w cdm:resource_legal_produced_by_dossier ?a }
    ?w cdm:resource_legal_id_celex ?b .
  }
}`
}

/** The GET URL for one proposal. */
export function proposalUrl(celex: string): string {
  return `${CELLAR_SPARQL}?query=${encodeURIComponent(proposalQuery(celex))}`
}

/**
 * The Cellar's answer for one proposal, as it arrived. Throws on a failure:
 * a Cellar that does not answer is not „unknown", and the caller must not
 * cache it as one.
 */
export function fetchProposalAnswer(celex: string, policy: UpstreamPolicy = PROPOSAL_POLICY): Promise<SparqlAnswer> {
  return upstreamJson<SparqlAnswer>(proposalUrl(celex), policy)
}

// ---------------------------------------------------------------------------
// Reading the answer
// ---------------------------------------------------------------------------

/** An act's CELEX as the `act` rows carry it. */
const ACT_CELEX_RE = /^3\d{4}[A-Z]\d{4}$/

/** "1"/"true" → true, "0"/"false" → false, anything else (or nothing) → null. */
function flag(v: string | null): boolean | null {
  if (v === '1' || v === 'true') return true
  if (v === '0' || v === 'false') return false
  return null
}

interface Gathered {
  rawReference: string | null
  type: string | null
  flags: EuProposalFlags
  sink: EventSink
  withdrawn: string[]
  dated: string[]
  acts: Set<string>
}

/**
 * The answer of `proposalQuery`, read. A malformed one throws: it is no
 * answer. Null where the answer holds no `proposal` row — the Cellar's
 * proof that it does not know the number, the one case the page may call
 * unknown. `celex` is the number the query asked for.
 */
export function parseProposalAnswer(answer: SparqlAnswer, celex: string): EuProposalRecord | null {
  const bindings = answer?.results?.bindings
  if (!Array.isArray(bindings)) throw new Error('Cellar-Antwort ohne results.bindings')
  const m = PROPOSAL_CELEX_RE.exec(celex)
  if (!m) throw new Error(`Keine CELEX-Nummer eines Vorschlags: ${celex}`)
  const rows = bindings.filter((b): b is SparqlRow => !!b && typeof b === 'object')

  let known = false
  let date: string | null = null
  const titles: { DEU?: string; ENG?: string } = {}
  const dossiers = new Map<string, Gathered>()
  const dossierOf = (uri: string): Gathered => {
    let d = dossiers.get(uri)
    if (!d) {
      d = { rawReference: null, type: null, flags: { pending: null, withdrawn: null, adopted: null }, sink: { events: new Map(), unread: new Set() }, withdrawn: [], dated: [], acts: new Set() }
      dossiers.set(uri, d)
    }
    return d
  }

  for (const row of rows) {
    const kind = value(row, 'k')
    if (kind === 'proposal') {
      known = true
      date ??= day(value(row, 'a'))
    } else if (kind === 'title') {
      const lang = lastSegment(value(row, 'b'))
      const text = value(row, 'a')
      if (text && (lang === 'DEU' || lang === 'ENG')) titles[lang] ??= text
    } else if (kind === 'dossier') {
      const uri = value(row, 'a')
      if (!uri) continue
      const d = dossierOf(uri)
      d.rawReference ??= value(row, 'b')
      d.type ??= lastSegment(value(row, 'c'))
      d.flags.pending ??= flag(value(row, 'd'))
      d.flags.withdrawn ??= flag(value(row, 'e'))
      d.flags.adopted ??= flag(value(row, 'f'))
    } else if (kind === 'event') {
      const uri = value(row, 'a')
      if (!uri) continue
      const d = dossierOf(uri)
      const step = readEventRow(row, d.sink)
      if (!step?.date) continue
      d.dated.push(step.date)
      if (EU_EVENTS[step.code]?.role === 'withdrawal') d.withdrawn.push(step.date)
    } else if (kind === 'act') {
      const uri = value(row, 'a')
      const act = value(row, 'b')
      if (uri && act && ACT_CELEX_RE.test(act)) dossierOf(uri).acts.add(act)
    }
  }
  if (!known) return null

  const year = m[1]!
  const number = String(Number(m[2]))
  const out: EuProposalDossier[] = [...dossiers.values()].map((d) => {
    const rows: DossierRows = { rawReference: d.rawReference, type: d.type, refType: 'COM', refYear: year, refNumber: number, proposalIds: [{ id: `celex:${celex}`, date }] }
    const acts = [...d.acts].sort()
    const procedure = procedureOf([rows], [...d.sink.events.values()], d.sink.unread.size)
    // A split procedure answers 404 at the Observatory under the plain number
    // (`OBSERVATORY_FILE`); each act's own page links its file.
    if (acts.some((a) => Object.hasOwn(OBSERVATORY_FILE, a))) procedure.observatoryUrl = null
    return {
      procedure,
      flags: d.flags,
      withdrawn: [...d.withdrawn].sort().at(-1) ?? null,
      lastStep: [...d.dated].sort().at(-1) ?? null,
      acts,
    }
  })
  // Code-unit order, never the locale's.
  out.sort((a, b) => {
    const x = a.procedure.reference ?? ''
    const y = b.procedure.reference ?? ''
    return x < y ? -1 : x > y ? 1 : 0
  })

  const title = titles.DEU ?? titles.ENG ?? null
  return { celex, date, title, titleIsGerman: !!titles.DEU, dossiers: out }
}
