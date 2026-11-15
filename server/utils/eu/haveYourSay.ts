/**
 * THE CONSULTATION BEHIND AN EU ACT — read from the Commission's portal
 * „Ihre Meinung zählt" (Have your say), step 2 of the EU cycle
 * (docs/research/eu-zyklus.md 1.2 and 2.2).
 *
 * PURE MODULE — a COM number in, URLs out; an answer in, an `EuInitiative`
 * out. No Nitro globals, relative imports only.
 *
 * AN UNDOCUMENTED INTERFACE. The portal is a single-page application that
 * loads JSON from its own addresses; no documentation and no word on reuse
 * was found (14.11.2026). The content is the Commission's, CC BY 4.0 by its
 * legal notice and Decision 2011/833/EU. So the reader is gentle — the
 * service asks one request at a time, 2.5 s apart — and narrow: two
 * addresses, the search by reference and one initiative. The list of
 * contributions (`api/allFeedback`) is never asked: it carries the names
 * of the people who wrote them.
 *
 * A FIXED LIST OF FIELDS. An initiative's record names, on every
 * publication, the official who wrote it — `authorName`, `authorSurname`,
 * `authorMail`, `authorPhoneNumber` — and on some a contact address
 * (`surveyContactMail`). `parseInitiative` builds its result field by
 * field from the names in `PUBLICATION_FIELDS`; nothing is copied or
 * spread, so a field that is not in that list cannot reach a cache, an
 * API answer or a page. A test feeds a whole record and asserts that none
 * of the values survives.
 *
 * THE JOIN IS PROVEN, NOT TRUSTED. The search's own `exactMatch` was wrong
 * in 8 of 51 lookups (14.11.2026). An initiative belongs to a proposal
 * only when one of its publications carries exactly the COM number
 * (`carriesReference`).
 *
 * WHAT IS NO ANSWER. HTTP 406 came back for 5 of 51 searches,
 * reproducibly and for no reason found; any error and any shape the reader
 * does not know are the same to the caller: not read. A parser that throws
 * says so; the service turns it into the state `ungelesen`, never into
 * „no consultation".
 */
import type { EuInitiative, EuPortalPublication } from '../../../shared/types/eu'
import type { UpstreamPolicy } from '../upstream/fetch'

export const PORTAL_HOST = 'ec.europa.eu'
const API = `https://${PORTAL_HOST}/info/law/better-regulation/brpapi`
const PAGES = `https://${PORTAL_HOST}/info/law/better-regulation/have-your-say/initiatives`

/** Bumped whenever the reader takes other fields: the service caches the parsed initiative. */
export const PORTAL_READER_VERSION = 3

/** The portal holds no proposals from before this year (0 of 15 in the sample of 14.11.2026). */
export const PORTAL_FIRST_YEAR = 2017

/** How many hits of a search are opened to prove the join: the right one was among the first three in every lookup that had one. */
export const PORTAL_SEARCH_HITS = 3

/**
 * One request at a time and 2.5 s apart is the service's (`SitePacer`);
 * this is the single request: no retry — a 406 is reproducible, and a
 * second request to an undocumented interface is not ours to spend — and a
 * ceiling sized for an initiative (97 kB measured for the largest read,
 * every title in 24 languages).
 */
export const PORTAL_POLICY: UpstreamPolicy = {
  timeoutMs: 15_000,
  retries: 0,
  accept: 'application/json',
  maxBytes: 1024 * 1024,
  upstreamHostsOnly: true,
}

/** The gap between two requests to the portal, and how long a request waits for its turn before it gives up. */
export const PORTAL_GAP_MS = 2_500
export const PORTAL_MAX_WAIT_MS = 20_000

/**
 * „COM(2022)177" — the portal's spelling — from the Cellar's „COM(2022)
 * 177"; null for anything that is no COM number. The year and the number
 * are all that is passed on, so nothing a reader typed reaches the URL.
 */
export function comReferenceOf(reference: string | null): { text: string; year: number } | null {
  const m = reference ? /^COM\s*\(\s*(\d{4})\s*\)\s*(\d{1,4})$/.exec(reference.trim()) : null
  if (!m) return null
  return { text: `COM(${m[1]})${Number(m[2])}`, year: Number(m[1]) }
}

/**
 * The search for a COM number, AS A PHRASE: the number in quotation marks.
 * Without them the search matches loosely — „COM(2022)71" returned 167
 * initiatives on 15.11.2026, the right one (12548) not among the first
 * ten, and the monitor said „nicht gefunden" for the directive on
 * corporate sustainability due diligence. Quoted, it returned that one
 * initiative. Throws on anything that is no COM number.
 */
export function searchUrl(comReference: string): string {
  if (!/^COM\(\d{4}\)\d{1,4}$/.test(comReference)) throw new Error(`Keine COM-Nummer: ${comReference}`)
  return `${API}/searchInitiatives?${new URLSearchParams({ text: `"${comReference}"`, size: String(PORTAL_SEARCH_HITS), language: 'EN' })}`
}

/** One initiative with its publications. */
export function initiativeUrl(id: number): string {
  if (!Number.isInteger(id) || id <= 0) throw new Error(`Keine Initiative: ${id}`)
  return `${API}/groupInitiatives/${id}`
}

/** The initiative's page on the portal, German. The page is the application's; it was not opened in a browser. */
export function initiativePageUrl(id: number): string {
  return `${PAGES}/${id}_de`
}

type Json = Record<string, unknown>
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
/** „2021/10/04 09:16:00" → „2021-10-04". */
const day = (v: unknown): string | null => {
  const m = typeof v === 'string' ? /^(\d{4})[/-](\d{2})[/-](\d{2})/.exec(v) : null
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}
const count = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null)

/** A search's hits: the ids on its first page, in its order, and how many hits it counts in all. */
export interface PortalSearch {
  ids: number[]
  /** `totalElements`; where it is more than the ids opened, the search has proven nothing about the rest. */
  total: number
}

/**
 * The ids of a search's hits and their total. `exactMatch` is not read: it
 * was wrong in 8 of 51 lookups. Throws on a shape that is no search answer
 * — the portal's „not_acceptable" (HTTP 406 as a JSON body) among them.
 */
export function parseSearch(answer: unknown): PortalSearch {
  const page = isObject(answer) ? answer.initiativeResultDtoPage : null
  const content = isObject(page) ? page.content : null
  if (!isObject(page) || !Array.isArray(content)) throw new Error('Portal: Suchantwort ohne Trefferliste')
  const ids = content.flatMap((hit) => {
    const id = isObject(hit) ? Number(hit.id) : Number.NaN
    return Number.isInteger(id) && id > 0 ? [id] : []
  })
  const total = count(page.totalElements) ?? ids.length
  return { ids, total: Math.max(total, ids.length) }
}

/** Every field of a publication the reader takes. Nothing else of the record is touched. */
export const PUBLICATION_FIELDS = ['frontEndStage', 'type', 'reference', 'publishedDate', 'endDate', 'totalFeedback', 'receivingFeedbackStatus'] as const

function publicationOf(raw: unknown): EuPortalPublication | null {
  if (!isObject(raw)) return null
  const stage = text(raw.frontEndStage)
  if (!stage) return null
  return {
    stage,
    type: text(raw.type),
    reference: text(raw.reference),
    published: day(raw.publishedDate),
    feedbackEnd: day(raw.endDate),
    feedbackCount: count(raw.totalFeedback),
    feedbackStatus: text(raw.receivingFeedbackStatus),
  }
}

/**
 * One initiative, read field by field (see the head: the fixed list). The
 * publications ascending by day, in the portal's order where two share
 * one. Throws on a shape that is no initiative.
 */
export function parseInitiative(answer: unknown): EuInitiative {
  if (!isObject(answer) || !Array.isArray(answer.publications)) throw new Error('Portal: Antwort ist keine Initiative')
  const id = Number(answer.id)
  if (!Number.isInteger(id) || id <= 0) throw new Error('Portal: Initiative ohne Nummer')
  const publications = answer.publications
    .map(publicationOf)
    .filter((p): p is EuPortalPublication => p !== null)
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (a.p.published ?? '9999').localeCompare(b.p.published ?? '9999') || a.i - b.i)
    .map(({ p }) => p)
  return { id, title: text(answer.shortTitle), url: initiativePageUrl(id), publications }
}

/** Whether one of the initiative's publications carries exactly this COM number — the proof of the join. */
export function carriesReference(initiative: EuInitiative, comReference: string): boolean {
  return initiative.publications.some((p) => p.reference !== null && p.reference.replace(/\s+/g, '') === comReference)
}
