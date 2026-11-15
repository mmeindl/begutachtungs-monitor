/**
 * THE REGISTER OF THE EUROPEAN CITIZENS' INITIATIVE — step 5 of the EU
 * cycle (docs/research/umsetzungsplan-eu-zyklus.md, „Step 5"; facts in
 * docs/research/eu-zyklus.md).
 *
 * PURE MODULE — numbers in, URLs out; an answer in, an object out. No Nitro
 * globals, relative imports only.
 *
 * TWO ADDRESSES of the register's JSON interface (measured 15.11.2026): the
 * list of every initiative (136 in one answer, 52 kB, 7 s) and one
 * initiative's details (120–230 kB: 24 language versions). The service
 * asks them one at a time, 2.5 s apart (`eciService.ts`).
 *
 * A FIXED LIST OF FIELDS, as in `haveYourSay.ts`. The details name the
 * organisers (`members`: full name, e-mail address, country of residence)
 * and the sponsors (`funding`) — personal data — and carry the organisers'
 * own texts (`objectives`, `annexText`, `website`, documents, a draft legal
 * act), to which the EU's legal notice reserves third parties' rights; the
 * logo is excluded from reuse by the same notice. None of it is read:
 * `parseEciDetails` and `parseEciList` build their results field by field
 * from the names below, nothing is copied or spread, so a field that is not
 * named here cannot reach a cache, an API answer or a page. The page links
 * the register for the texts. A test feeds invented organisers, funders and
 * texts and finds none of them in the result.
 *
 * DATES are `dd/mm/yyyy`, some with a time („13/11/2026 00:00"); each is
 * turned into an ISO day here. One that does not parse is null, never a
 * guess.
 *
 * WHAT IS NO ANSWER. Any shape the reader does not know throws, so a changed
 * interface is „not read" on the page, never a shorter list or an empty
 * rail. A step name the reader does not know is no shape error: it is kept
 * as it is and the page says that the register lists a step the monitor does
 * not know.
 */
import type { EciAnswerLink, EciHeadCounts, EciInitiative, EciListEntry, EciProgressStep, EciSupport } from '../../../shared/types/eu'
import type { UpstreamPolicy } from '../upstream/fetch'
import { eurLexCelexUrl } from './cellarDossier'

export const ECI_REGISTER_HOST = 'register.eci.ec.europa.eu'
const API = `https://${ECI_REGISTER_HOST}/core/api/register`

/** The register's public start page, German — the one the Impressum links; where a reader goes when the monitor could not read the register. */
export const ECI_REGISTER_PAGE_URL = 'https://citizens-initiative.europa.eu/_de'

/**
 * Bumped whenever the reader takes other fields: the service caches the
 * parsed list and the parsed initiatives. 1 since 15.11.2026.
 */
export const ECI_READER_VERSION = 1

/**
 * One request at a time and 2.5 s apart is the service's (`SitePacer`, an
 * instance of its own: another host than the portal's); this is the single
 * request. No retry, as for the portal. The list took 7 s on 15.11.2026,
 * hence the timeout; a ceiling sized for the largest details answer
 * measured (230 kB) with room.
 */
export const ECI_POLICY: UpstreamPolicy = {
  timeoutMs: 20_000,
  retries: 0,
  accept: 'application/json',
  maxBytes: 1024 * 1024,
  upstreamHostsOnly: true,
}

/** The gap between two requests to the register, and how long a request waits for its turn before it gives up. */
export const ECI_GAP_MS = 2_500
export const ECI_MAX_WAIT_MS = 20_000

/** The register's six-digit number: 2 → „000002". */
export const eciPadded = (number: number): string => String(number).padStart(6, '0')

const validNumber = (year: number, number: number) =>
  Number.isInteger(year) && year >= 2012 && year <= 9999 && Number.isInteger(number) && number > 0 && number <= 999_999

/**
 * The list of every initiative, German titles: `ALL` statuses, language
 * `DE`, the first 200 — one page held all 136 on 15.11.2026. The reader
 * checks `recordsFound` against the entries and throws where the page cut
 * the list.
 */
export const ECI_LIST_SIZE = 200
export function eciListUrl(): string {
  return `${API}/search/ALL/DE/0/${ECI_LIST_SIZE}`
}

/** One initiative's details, by year and number (the number padded to six digits, as the register addresses it). */
export function eciDetailsUrl(year: number, number: number): string {
  if (!validNumber(year, number)) throw new Error(`Keine Bürgerinitiative: ${year}/${number}`)
  return `${API}/details/${year}/${eciPadded(number)}`
}

/**
 * The initiative's public page at the register, German. Opened in a
 * browser on 15.11.2026 for ECI(2022)000002: the address resolves to the
 * initiative's page. One initiative was checked, not every year's.
 */
export function eciPageUrl(year: number, number: number): string {
  return `https://citizens-initiative.europa.eu/initiatives/details/${year}/${eciPadded(number)}_de`
}

type Json = Record<string, unknown>
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const count = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null)

/**
 * „13/11/2027" or „13/11/2026 00:00" → „2027-11-13"; null for anything
 * else — an empty string (the deadline of every initiative not in
 * collection), a day that does not exist, another order.
 */
export function eciDay(v: unknown): string | null {
  const m = typeof v === 'string' ? /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+\d{2}:\d{2}(?::\d{2})?)?$/.exec(v.trim()) : null
  if (!m) return null
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(y, mo - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

/** A web address the page may link: http(s), no userinfo, trimmed (the register's `defaultLink` can carry trailing whitespace); null otherwise. */
function webAddress(v: unknown): string | null {
  const raw = text(v)
  if (!raw) return null
  try {
    const url = new URL(raw)
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) return null
    return url.href
  } catch {
    return null
  }
}

/** „ECI(2022)000002" → year and number; null for anything else. */
function referenceOf(v: unknown): { year: number; number: number } | null {
  const m = typeof v === 'string' ? /^ECI\((\d{4})\)(\d{6})$/.exec(v.trim()) : null
  if (!m) return null
  const year = Number(m[1])
  const number = Number(m[2])
  return validNumber(year, number) ? { year, number } : null
}

/* ------------------------------------------------------------------ *
 * One initiative
 * ------------------------------------------------------------------ */

/**
 * Every field of the details the reader takes. Nothing else of the answer
 * is touched — above all not `members`, `funding`, `logo`, `categories`,
 * `preAnswer` (seen once, meaning unknown), and of a language version not
 * `objectives`, `annexText`, `website`, `treaties`, `additionalDocument`,
 * `draftLegal`.
 */
export const ECI_DETAILS_FIELDS = ['comRegNum', 'status', 'registrationDate', 'startCollectionDate', 'deadline', 'earlyClosureDate', 'latestUpdateDate', 'progress', 'linguisticVersions', 'sosReport', 'submission', 'answer'] as const
/** Of a language version. */
export const ECI_LANGUAGE_FIELDS = ['languageCode', 'original', 'title', 'supportLink', 'commissionDecision'] as const
/** Of a step of `progress`. */
export const ECI_PROGRESS_FIELDS = ['name', 'active', 'date', 'footnoteType'] as const
/** Of `sosReport` and `submission`: the total, the day, and of the per-country entries only the configured Member State's. */
export const ECI_COUNT_FIELDS = ['totalSignatures', 'onlineSosUpdateDate', 'entry', 'countryCodeType', 'total'] as const
/** Of `answer` and its links. */
export const ECI_ANSWER_FIELDS = ['decisionDate', 'links', 'defaultName', 'defaultLink', 'defaultLanguageCode', 'link', 'languageCode'] as const

/** The three kinds of link the Commission's answer carries (all three on the four answered initiatives read). */
const ANSWER_KINDS = new Set<EciAnswerLink['kind']>(['COMMUNICATION', 'PRESS_RELEASE', 'FOLLOW_UP'])

/** A CELEX of a Commission decision as the register gives it („32022D0482"); anything else builds no link. */
const CELEX_RE = /^3\d{4}[A-Z]\d{4}$/

function progressOf(raw: unknown): EciProgressStep[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) throw new Error('Register: progress ist keine Liste')
  return raw.flatMap((step) => {
    if (!isObject(step)) return []
    const name = text(step.name)
    if (!name) return []
    return [{ name, date: eciDay(step.date), active: step.active === true, earlyClosure: step.footnoteType === 'COLLECTION_EARLY_CLOSURE' }]
  })
}

/**
 * A count's entries per country, by the register's two-letter code. All of
 * them, not one country's: the reading knows no country (the EU's objects
 * get a home of their own, a country holds a view onto it), and the page
 * picks the entry of the country it serves.
 */
function byCountryOf(entries: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!Array.isArray(entries)) return out
  for (const e of entries) {
    if (!isObject(e) || typeof e.countryCodeType !== 'string' || !/^[A-Z]{2}$/.test(e.countryCodeType)) continue
    const n = count(e.total)
    if (n !== null) out[e.countryCodeType] = n
  }
  return out
}

function supportOf(raw: unknown): EciSupport | null {
  if (!isObject(raw)) return null
  const total = count(raw.totalSignatures)
  const byCountry = byCountryOf(raw.entry)
  return total === null && Object.keys(byCountry).length === 0 ? null : { total, byCountry }
}

function answerOf(raw: unknown): EciInitiative['answer'] {
  if (!isObject(raw)) return null
  const links = (Array.isArray(raw.links) ? raw.links : []).flatMap((l): EciAnswerLink[] => {
    if (!isObject(l)) return []
    const kind = l.defaultName as EciAnswerLink['kind']
    if (!ANSWER_KINDS.has(kind)) return []
    const german = Array.isArray(l.link) ? l.link.find((x) => isObject(x) && x.languageCode === 'DE') : undefined
    const germanUrl = isObject(german) ? webAddress(german.link) : null
    const url = germanUrl ?? webAddress(l.defaultLink)
    const defaultLanguage = typeof l.defaultLanguageCode === 'string' && /^[A-Z]{2}$/.test(l.defaultLanguageCode) ? l.defaultLanguageCode : null
    return url ? [{ kind, url, language: germanUrl ? 'DE' : defaultLanguage }] : []
  })
  return { date: eciDay(raw.decisionDate), links }
}

/**
 * One initiative's details, read field by field (see the head: the fixed
 * list). The counts per country are kept for every country the register
 * lists; which one a page shows is the page's choice. Throws on a shape that is no initiative — no number, no status,
 * no language versions.
 */
export function parseEciDetails(answer: unknown): EciInitiative {
  if (!isObject(answer)) throw new Error('Register: Antwort ist keine Initiative')
  const ref = referenceOf(answer.comRegNum)
  if (!ref) throw new Error('Register: Initiative ohne Nummer')
  const status = text(answer.status)
  if (!status) throw new Error('Register: Initiative ohne Status')
  if (!Array.isArray(answer.linguisticVersions)) throw new Error('Register: Initiative ohne Sprachfassungen')
  const versions = answer.linguisticVersions.filter(isObject)
  const de = versions.find((v) => v.languageCode === 'DE') ?? null
  const original = versions.find((v) => v.original === true) ?? null
  const titleDe = de ? text(de.title) : null
  const decision = de && isObject(de.commissionDecision) ? text(de.commissionDecision.celex) : null
  const sos = isObject(answer.sosReport) ? answer.sosReport : null
  const collected = sos ? supportOf(sos) : null
  return {
    year: ref.year,
    number: ref.number,
    reference: `ECI(${ref.year})${eciPadded(ref.number)}`,
    title: titleDe ?? (original ? text(original.title) : null),
    titleIsGerman: titleDe !== null,
    status,
    registered: eciDay(answer.registrationDate),
    collectionStart: eciDay(answer.startCollectionDate),
    deadline: eciDay(answer.deadline),
    earlyClosure: eciDay(answer.earlyClosureDate),
    progress: progressOf(answer.progress),
    supportLink: de ? webAddress(de.supportLink) : null,
    registrationDecisionUrl: decision && CELEX_RE.test(decision) ? eurLexCelexUrl(decision) : null,
    collected: collected && sos ? { ...collected, asOf: eciDay(sos.onlineSosUpdateDate) } : null,
    submitted: supportOf(answer.submission),
    answer: answerOf(answer.answer),
    updated: eciDay(answer.latestUpdateDate),
    registerUrl: eciPageUrl(ref.year, ref.number),
  }
}

/* ------------------------------------------------------------------ *
 * The list
 * ------------------------------------------------------------------ */

/** Every field of a list entry the reader takes. Not `logo`, not `supportLink` (the details give the German one). */
export const ECI_LIST_FIELDS = ['year', 'number', 'status', 'languageCode', 'title', 'totalSupporters', 'latestUpdateDate'] as const
/** The register's head counts on the list answer. */
export const ECI_HEAD_FIELDS = ['requests', 'registered', 'ongoing', 'answered', 'successful', 'all', 'recordsFound', 'entries'] as const

/** The list as the service keeps it. */
export interface EciList {
  entries: EciListEntry[]
  counts: EciHeadCounts
}

function entryOf(raw: unknown): EciListEntry {
  if (!isObject(raw)) throw new Error('Register: Eintrag ist kein Objekt')
  const year = Number(text(raw.year))
  const number = Number(text(raw.number))
  if (!validNumber(year, number)) throw new Error('Register: Eintrag ohne Nummer')
  const status = text(raw.status)
  if (!status) throw new Error('Register: Eintrag ohne Status')
  const title = text(raw.title)
  return {
    year,
    number,
    reference: `ECI(${year})${eciPadded(number)}`,
    title,
    // The list gives each title in the language asked for where there is one; `languageCode` says which it is.
    titleIsGerman: title !== null && raw.languageCode === 'DE',
    status,
    supporters: count(raw.totalSupporters),
    updated: eciDay(raw.latestUpdateDate),
  }
}

/**
 * The register's list, read field by field (`ECI_LIST_FIELDS`). Throws on
 * any shape the reader does not know, and where the answer counts more
 * records than it carries (`recordsFound` against `entries`): a cut list is
 * not read, never taken for the whole register.
 */
export function parseEciList(answer: unknown): EciList {
  if (!isObject(answer) || !Array.isArray(answer.entries)) throw new Error('Register: Liste ohne Einträge')
  const entries = answer.entries.map(entryOf)
  const found = count(answer.recordsFound)
  if (found !== null && found > entries.length) throw new Error(`Register: Liste gekürzt (${entries.length} von ${found})`)
  return {
    entries,
    counts: {
      requests: count(answer.requests),
      registered: count(answer.registered),
      ongoing: count(answer.ongoing),
      answered: count(answer.answered),
      successful: count(answer.successful),
      all: count(answer.all),
    },
  }
}

/** The register's status of an initiative in collection — the one status whose initiatives can be supported. */
export const ECI_ONGOING = 'ONGOING'

/**
 * The initiatives still in collection on a day: a list cached since
 * yesterday may hold one whose last day has passed. A row without a day
 * (details not read) stays — it is the register's ONGOING, and the page says
 * that its day could not be shown.
 */
export function eciOpenOn<R extends { deadline: string | null }>(rows: readonly R[], today: string): R[] {
  return rows.filter((r) => r.deadline === null || r.deadline >= today)
}
