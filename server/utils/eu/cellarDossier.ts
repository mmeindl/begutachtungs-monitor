/**
 * HOW AN EU ACT CAME ABOUT — its procedure between the institutions, read
 * from the act's dossier in the EUR-Lex Cellar (docs/api-exploration.md
 * §2d; the rail of an EU act, docs/research/eu-zyklus.md 2.1).
 *
 * PURE MODULE — a CELEX in, an `EuActRail` out; no Nitro globals, relative
 * imports only. The service caches the raw answer per CELEX
 * (`cellarService.ts`, `railOf`); the corpus script caches it on disk
 * (`scripts/corpus/euVerfahren.ts`).
 *
 * ONE QUERY, TYPED ROWS. The Cellar keeps, per act, the authors, the dates
 * of entry into force and application, and the dossier(s) of the
 * interinstitutional procedure with the initiating proposal and every
 * recorded step. Five UNION branches ask for all of it at once; each row
 * says what it is in its column `k` (`author`, `force`, `dossier`,
 * `proposal`, `event`) and carries the rest in `a`…`f`. One request per
 * act instead of five, and a branch that finds nothing costs no row — so
 * the rows of one branch never multiply another's, as OPTIONALs would.
 *
 * WHAT A ROW CAN BE MISSING. The dossier's procedure number and type, an
 * event's date, a date's type: the Cellar records them unevenly over the
 * decades (31976L0207 has a dossier with no procedure number; 32017R1926,
 * a Commission act, a dossier with neither). Every missing piece is read
 * as unknown and passed on as null — never filled in from another column
 * and never taken for „did not happen" (CLAUDE.md, „Say what cannot be
 * shown").
 *
 * WHO ADOPTED IT is read from the authors, not from the procedure type: a
 * Commission act has no dossier at all, an old directive of the Council
 * one without a type, and the station's name on the page must not depend
 * on a column that is missing in exactly those cases.
 */
import type { EuActRail, EuAdoptedBy, EuProcedure, EuProcedureEvent, EuProposal } from '../../../shared/types/eu'
import { isReadEuEvent } from '../../../shared/utils/euEvents'
import { upstreamJson, type UpstreamPolicy } from '../upstream/fetch'
import { CELEX_RE, CELLAR_POLICY, CELLAR_SPARQL, type SparqlAnswer } from './cellar'

/**
 * Bumped whenever `dossierQuery` asks for something else: the service caches
 * the raw answer per CELEX for a month (`railOf`), and an answer to an old
 * query would be read as if it were complete.
 */
export const DOSSIER_QUERY_VERSION = 1

/**
 * The largest dossier answer of the fourteen fixtures is 27 KB, and a
 * dossier records up to ~55 steps (15.11.2026); half a megabyte leaves
 * room for the long procedures without letting a runaway answer through.
 * The rest is the Cellar's policy (`CELLAR_POLICY`): ~0,25 s per answer,
 * a slow one retried, the redirect hops held to the allowlist.
 */
export const DOSSIER_POLICY: UpstreamPolicy = {
  ...CELLAR_POLICY,
  maxBytes: 512 * 1024,
  upstreamHostsOnly: true,
}

/**
 * The SPARQL text for one act's dossier. Throws on anything that is not a
 * CELEX: the number is written into the query as it is.
 *
 * Both directions of the link between act and dossier are asked
 * (`dossier_produces_resource_legal`, `resource_legal_produced_by_dossier`):
 * the Cellar records one or the other, depending on the act's age. The
 * date's type and comment (`EV`, `MA`, `MA/PART`) sit on an OWL axiom
 * annotating the date, not on the act.
 */
export function dossierQuery(celex: string): string {
  if (!CELEX_RE.test(celex)) throw new Error(`Keine CELEX-Nummer: ${celex}`)
  return `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>
PREFIX ann: <http://publications.europa.eu/ontology/annotation#>
SELECT DISTINCT ?k ?a ?b ?c ?d ?e ?f WHERE {
  ?w owl:sameAs <http://publications.europa.eu/resource/celex/${celex}> .
  {
    BIND("author" AS ?k) ?w cdm:work_created_by_agent ?a
  } UNION {
    BIND("force" AS ?k) ?w cdm:resource_legal_date_entry-into-force ?a .
    OPTIONAL { ?ax owl:annotatedSource ?w ; owl:annotatedProperty cdm:resource_legal_date_entry-into-force ; owl:annotatedTarget ?a .
      OPTIONAL { ?ax ann:type_of_date ?b } OPTIONAL { ?ax ann:comment_on_date ?c } }
  } UNION {
    BIND("dossier" AS ?k)
    { ?a cdm:dossier_produces_resource_legal ?w } UNION { ?w cdm:resource_legal_produced_by_dossier ?a }
    OPTIONAL { ?a cdm:procedure_code_interinstitutional_reference_procedure ?b }
    OPTIONAL { ?a cdm:procedure_code_interinstitutional_has_type_concept_type_procedure_code_interinstitutional ?c }
    OPTIONAL { ?a cdm:dossier_type_reference ?d }
    OPTIONAL { ?a cdm:dossier_year_reference ?e }
    OPTIONAL { ?a cdm:dossier_number_reference ?f }
  } UNION {
    BIND("proposal" AS ?k)
    { ?a cdm:dossier_produces_resource_legal ?w } UNION { ?w cdm:resource_legal_produced_by_dossier ?a }
    ?a cdm:dossier_initiated_by_act_preparatory ?p . ?p cdm:work_id_document ?b
    OPTIONAL { ?p cdm:work_date_document ?c }
  } UNION {
    BIND("event" AS ?k)
    { ?a cdm:dossier_produces_resource_legal ?w } UNION { ?w cdm:resource_legal_produced_by_dossier ?a }
    ?b cdm:event_legal_part_of_dossier ?a ; cdm:event_legal_has_type_concept_type_event_legal ?c .
    OPTIONAL { ?b cdm:event_legal_date ?d }
    OPTIONAL { ?b cdm:event_legal_initiated_by_institution ?e }
  }
}`
}

/** The GET URL for one act's dossier. */
export function dossierUrl(celex: string): string {
  return `${CELLAR_SPARQL}?query=${encodeURIComponent(dossierQuery(celex))}`
}

/**
 * The Cellar's answer for one act's dossier, as it arrived — the service
 * caches this and parses fresh. Throws on a failure: a Cellar that does not
 * answer is not „no procedure", and the caller must not cache it as one.
 */
export function fetchDossierAnswer(celex: string, policy: UpstreamPolicy = DOSSIER_POLICY): Promise<SparqlAnswer> {
  return upstreamJson<SparqlAnswer>(dossierUrl(celex), policy)
}

// ---------------------------------------------------------------------------
// Reading the answer
// ---------------------------------------------------------------------------

/** One row of a SPARQL answer, by column. Shared with the reader of a proposal (`cellarVorschlag.ts`). */
export type SparqlRow = Record<string, { value?: string } | undefined>
type Row = SparqlRow

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
/** „2022/0117/COD", the Cellar's spelling of a procedure number. */
const PROCEDURE_REF_RE = /^(\d{4})\/(\d{4})\/([A-Z]{2,4})$/
/** A Commission proposal's CELEX, sector 5 + year + PC + number, „(03)" for a part. */
const PROPOSAL_CELEX_RE = /^5\d{4}PC\d{4}(\(\d+\))?$/

const OEIL_PROCEDURE = 'https://oeil.europarl.europa.eu/oeil/en/procedure-file?reference='

/**
 * Where the Legislative Observatory can be expected to have a page. Its
 * German path answers with the English page anyway, so the link is built
 * with `/en/`. Measured on 15.11.2026 over all 187 procedure numbers of the
 * map's acts, one request each: procedures from before 1994 have no page
 * (1988/1016(CNS), 1990/0292(SYN), 1992/0412(COD)), nor has 2013/0033(NLE);
 * of the two procedures of type SYN and NLE that do have one, the rule
 * gives up the link (1996/0276(SYN), 2011/0254(NLE)) rather than promise a
 * page by type. Outside the rule no link is built and the page says nothing
 * about the Observatory: the procedure number stays a fact of its own.
 *
 * SPLIT PROCEDURES. 178 of the 181 numbers the rule links have a page.
 * The other three answer 404 under the number the Cellar carries, because
 * Parliament split each into files „A" and „B" („2016/0224A(COD)") and
 * the Cellar has no letter. Nothing the Cellar says tells a split
 * procedure from another, and Parliament's open-data API, which knows both
 * files, does not name the act a file ended in. So the four acts of the
 * map are written down in `OBSERVATORY_FILE`, each read on 15.11.2026 from
 * the file's own page, which names the act. The procedure NUMBER shown
 * stays the Cellar's; only the link carries the letter. A split procedure
 * that is not in the table still gets a dead link, so the numbers are
 * checked again when the map grows.
 */
export const OBSERVATORY_FIRST_YEAR = 1994
export const OBSERVATORY_TYPES: readonly string[] = ['COD', 'CNS', 'APP']

/** The file of a split procedure an act came out of, by the act's CELEX. */
export const OBSERVATORY_FILE: Readonly<Record<string, 'A' | 'B'>> = {
  '32021L2167': 'A', // 2018/0063A(COD), Kreditdienstleister und Kreditkäufer
  '32024R1348': 'A', // 2016/0224A(COD), Asylverfahrensverordnung
  '32024R1747': 'A', // 2023/0077A(COD), Elektrizitätsmarkt: the Verordnung
  '32024L1711': 'B', // 2023/0077B(COD), Elektrizitätsmarkt: the Richtlinie
}

/**
 * The Observatory's page for a procedure number „2022/0117(COD)", or null
 * where none can be expected. With the act's CELEX, a split procedure's
 * link names the file the act came out of.
 */
export function observatoryUrlOf(reference: string | null, celex?: string): string | null {
  const m = reference ? /^(\d{4}\/\d{4})\(([A-Z]{2,4})\)$/.exec(reference) : null
  if (!m || Number(m[1]!.slice(0, 4)) < OBSERVATORY_FIRST_YEAR || !OBSERVATORY_TYPES.includes(m[2]!)) return null
  const file = (celex && OBSERVATORY_FILE[celex]) || ''
  return OEIL_PROCEDURE + encodeURIComponent(`${m[1]}${file}(${m[2]})`)
}
const EUR_LEX_CELEX = 'https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:'

/** A document on EUR-Lex, German, by its CELEX — built, never fetched. */
export const eurLexCelexUrl = (celex: string): string => EUR_LEX_CELEX + encodeURIComponent(celex)

/** A column's value, trimmed; null where it is missing or empty. */
export const value = (row: Row, key: string): string | null => {
  const v = row[key]?.value?.trim()
  return v ? v : null
}
/** The ISO day at the head of a value, null for anything else. */
export const day = (v: string | null): string | null => (v && DAY_RE.test(v.slice(0, 10)) ? v.slice(0, 10) : null)
/** The last path segment of a URI: `…/corporate-body/EP` → `EP`, `…/procedure/OLP` → `OLP`. */
export const lastSegment = (uri: string | null): string | null => {
  if (!uri) return null
  const seg = uri.slice(uri.lastIndexOf('/') + 1)
  return seg || null
}
const ascendingUnique = (days: Iterable<string>): string[] => [...new Set(days)].sort()
/** Code-unit order, as `sort()` without a comparator — never the locale's. */
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
/** Ascending, null last. */
const cmpNullLast = (a: string | null, b: string | null): number => (a === b ? 0 : a === null ? 1 : b === null ? -1 : cmp(a, b))

/**
 * Who adopted the act, from the set of its authors' codes. A Directorate-
 * General beside the Commission (`MOVE`, `SANTE`) changes nothing; the
 * Council's name beside Parliament's is the joint act of the ordinary
 * procedure, the Council alone the special one or an old directive.
 */
export function adoptedByOf(authors: ReadonlySet<string>): EuAdoptedBy {
  const ep = authors.has('EP')
  const council = authors.has('CONSIL')
  if (ep && council) return 'parlament-rat'
  if (council) return 'rat'
  if (authors.has('COM') && !ep) return 'kommission'
  return 'unbekannt'
}

/** „2022/0117/COD" → „2022/0117(COD)", as Parliament's Observatory and the citations write it; null for anything else. */
export function procedureReference(raw: string | null): string | null {
  const m = raw ? PROCEDURE_REF_RE.exec(raw) : null
  return m ? `${m[1]}/${m[2]}(${m[3]})` : null
}

/** One dossier's rows, gathered. Shared with the reader of a proposal, which fills it from its own columns. */
export interface DossierRows {
  /** The Cellar's raw procedure number („2022/0117/COD"), if any row carries one. */
  rawReference: string | null
  type: string | null
  /** The initiating document's reference type, year and number (`COM`, `2022`, `177`). */
  refType: string | null
  refYear: string | null
  refNumber: string | null
  proposalIds: { id: string; date: string | null }[]
}

/**
 * The answer of `dossierQuery`, read. A malformed one throws: it is no
 * answer. An answer without a single row means the Cellar knows no such
 * act — the rail is then all unknown, never „no procedure" with a reason.
 */
export function parseDossierAnswer(answer: SparqlAnswer, celex?: string): EuActRail {
  const bindings = answer?.results?.bindings
  if (!Array.isArray(bindings)) throw new Error('Cellar-Antwort ohne results.bindings')
  const rows = bindings.filter((b): b is Row => !!b && typeof b === 'object')

  const authors = new Set<string>()
  const forceDates: { type: string; date: string; comment: string }[] = []
  const dossiers = new Map<string, DossierRows>()
  const dossierOf = (uri: string): DossierRows => {
    let d = dossiers.get(uri)
    if (!d) {
      d = { rawReference: null, type: null, refType: null, refYear: null, refNumber: null, proposalIds: [] }
      dossiers.set(uri, d)
    }
    return d
  }
  const sink: EventSink = { events: new Map(), unread: new Set() }

  for (const row of rows) {
    const kind = value(row, 'k')
    if (kind === 'author') {
      const code = lastSegment(value(row, 'a'))
      if (code) authors.add(code)
    } else if (kind === 'force') {
      const date = day(value(row, 'a'))
      // „{EV|http://…/fd_335/EV}": the code stands between the brace and the bar.
      const type = /^\{([^|}]+)\|/.exec(value(row, 'b') ?? '')?.[1] ?? null
      if (date && type) forceDates.push({ type, date, comment: value(row, 'c') ?? '' })
    } else if (kind === 'dossier') {
      const uri = value(row, 'a')
      if (!uri) continue
      const d = dossierOf(uri)
      d.rawReference ??= value(row, 'b')
      d.type ??= lastSegment(value(row, 'c'))
      d.refType ??= value(row, 'd')
      d.refYear ??= value(row, 'e')
      d.refNumber ??= value(row, 'f')
    } else if (kind === 'proposal') {
      const uri = value(row, 'a')
      const id = value(row, 'b')
      if (uri && id) dossierOf(uri).proposalIds.push({ id, date: day(value(row, 'c')) })
    } else if (kind === 'event') {
      readEventRow(row, sink)
    }
  }

  const earliestOf = (type: string): string | null => ascendingUnique(forceDates.filter((f) => f.type === type).map((f) => f.date))[0] ?? null
  // A partial day is typed „MA" with „MA/PART" in its comment — or, on some
  // older directives (2008/73, 2009/73, 2009/138), typed „MA/PART" itself.
  const isPartial = (f: { type: string; comment: string }): boolean => f.type === 'MA/PART' || (f.type === 'MA' && f.comment.includes('MA/PART'))
  const applies = ascendingUnique(forceDates.filter((f) => f.type === 'MA' && !isPartial(f)).map((f) => f.date))[0] ?? null
  const partialApplication = ascendingUnique(forceDates.filter(isPartial).map((f) => f.date)).filter((d) => d !== applies)

  return {
    adoptedBy: adoptedByOf(authors),
    procedure: dossiers.size ? procedureOf([...dossiers.values()], [...sink.events.values()], sink.unread.size, celex) : null,
    inForce: earliestOf('EV'),
    // A Beschluss addressed to someone is typed „PE" („Wirksamwerden"), not
    // „EV": 12 of the 13 decisions of the map (15.11.2026).
    effective: earliestOf('PE'),
    applies,
    partialApplication,
  }
}

/**
 * Where the steps of a procedure are gathered while the rows are read: the
 * steps the monitor reads, each (day, type) once, and the URIs of the
 * others, so each is counted once however many rows repeat it.
 */
export interface EventSink {
  events: Map<string, EuProcedureEvent>
  unread: Set<string>
}

/**
 * One `event` row (b = the step's URI, c = its type, d = its day) into the
 * sink — one reading of a step for the act's rail and the proposal's page
 * alike. A type off the allowlist is counted, never shown; a step the
 * Cellar does not date is not kept. Returns the step's type and day as
 * read, for a caller that needs every dated step (the proposal's last
 * recorded one); null for a row without a type.
 */
export function readEventRow(row: Row, sink: EventSink): { code: string; date: string | null } | null {
  const code = lastSegment(value(row, 'c'))
  if (!code) return null
  const date = day(value(row, 'd'))
  if (!isReadEuEvent(code)) {
    const uri = value(row, 'b')
    if (uri) sink.unread.add(uri)
    return { code, date }
  }
  if (date) sink.events.set(`${date}|${code}`, { code, date })
  return { code, date }
}

/**
 * The procedure from its dossier(s). Where an act hangs on two (Richtlinie
 * 2000/29/EG: 1995/0134 and 1997/0338), the number and type shown are the
 * most recent procedure's — the one whose number sorts last; a dossier
 * without a number sorts first. Both proposals and the steps of both stay.
 */
export function procedureOf(dossiers: DossierRows[], events: EuProcedureEvent[], otherEvents: number, celex?: string): EuProcedure {
  const latest = [...dossiers].sort((a, b) => cmp(a.rawReference ?? '', b.rawReference ?? ''))[dossiers.length - 1]!
  const reference = procedureReference(latest.rawReference)
  const proposals = dossiers
    .map(proposalOf)
    .filter((p): p is EuProposal => p !== null)
    .sort((a, b) => cmpNullLast(a.date, b.date) || cmpNullLast(a.reference, b.reference))
  return {
    reference,
    type: latest.type,
    observatoryUrl: observatoryUrlOf(reference, celex),
    proposals,
    events: events.sort((a, b) => cmp(a.date, b.date) || cmp(a.code, b.code)),
    otherEvents,
  }
}

/**
 * The Commission proposal a dossier began with, or null where the dossier
 * names none: no COM reference (a Commission act's dossier says
 * `OP_DATPRO` three times) and no proposal CELEX. The reference is built
 * from the dossier's own columns, „COM(1995) 722 - 3" as cited; the CELEX
 * comes only from a `celex:` identifier, never derived from the reference —
 * the Cellar's own identifiers disagree with it now and then (32013L0059
 * lists `com:COM_2011_591` beside `celex:52011PC0593`).
 */
function proposalOf(d: DossierRows): EuProposal | null {
  const number = d.refNumber?.trim().replace(/\s+/g, ' ') ?? ''
  const reference = d.refType === 'COM' && d.refYear && /^\d{4}$/.test(d.refYear) && number ? `COM(${d.refYear}) ${number}` : null
  const celex = d.proposalIds
    .map((p) => (p.id.startsWith('celex:') ? p.id.slice('celex:'.length) : ''))
    .find((c) => PROPOSAL_CELEX_RE.test(c)) ?? null
  if (!reference && !celex) return null
  const date = ascendingUnique(d.proposalIds.map((p) => p.date).filter((x): x is string => x !== null))[0] ?? null
  return { reference, celex, date, eurLexUrl: celex ? eurLexCelexUrl(celex) : null }
}
