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
 * service asks one request at a time, 2.5 s apart — and narrow: three
 * addresses, the search by reference, one initiative, and (step 3,
 * 15.11.2026) the list of every initiative with an open window. The list
 * of contributions (`api/allFeedback`) is read by its own module
 * (`portalFeedback.ts`, step 4) and only when a reader opens „Wer
 * Rückmeldung gegeben hat": it carries the names of the people who wrote
 * them, and what it may name is decided there.
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
import type { EuInitiative, EuOpenInitiative, EuPortalPublication, EuWindow } from '../../../shared/types/eu'
import type { UpstreamPolicy } from '../upstream/fetch'

export const PORTAL_HOST = 'ec.europa.eu'
const API = `https://${PORTAL_HOST}/info/law/better-regulation/brpapi`
const PAGES = `https://${PORTAL_HOST}/info/law/better-regulation/have-your-say/initiatives`

/** The portal's start page, German — the one `/quellen` links; where a reader goes when the monitor could not read the portal. */
export const PORTAL_PAGE_URL = `https://${PORTAL_HOST}/info/law/better-regulation/have-your-say_de`

/**
 * Bumped whenever the reader takes other fields: the service caches the
 * parsed initiative and the parsed list. 4 since 15.11.2026: the
 * initiative's German title and its foreseen act type, and the list of
 * open windows. 5 the same day: a publication's own number, which the list
 * of contributions is asked by (step 4).
 */
export const PORTAL_READER_VERSION = 5

/** The portal holds no proposals from before this year (0 of 15 in the sample of 14.11.2026). */
export const PORTAL_FIRST_YEAR = 2017

/** How many hits of a search are opened to prove the join: the right one was among the first three in every lookup that had one. */
export const PORTAL_SEARCH_HITS = 3

/**
 * One request at a time and 2.5 s apart is the service's (`SitePacer`);
 * this is the single request: no retry — a 406 is reproducible, and a
 * second request to an undocumented interface is not ours to spend — and a
 * ceiling sized for an initiative (97 kB measured for the largest read,
 * every title in 24 languages) and for a page of the open windows (193 kB
 * for 49 initiatives on 15.11.2026, so about 400 kB for a full page of 100).
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

/**
 * One contribution's page on the portal, German (step 4): the initiative's
 * page with the contribution's number behind an „F". Opened in a browser on
 * 15.11.2026: the portal adds the title's slug to the address itself. The
 * page holds the contribution's text — linked, never fetched. Throws on
 * anything that is no number.
 */
export function contributionPageUrl(initiativeId: number, feedbackId: number): string {
  if (!Number.isSafeInteger(initiativeId) || initiativeId <= 0) throw new Error(`Keine Initiative: ${initiativeId}`)
  if (!Number.isSafeInteger(feedbackId) || feedbackId <= 0) throw new Error(`Keine Rückmeldung: ${feedbackId}`)
  return `${PAGES}/${initiativeId}/F${feedbackId}_de`
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

/**
 * Every field of a publication the reader takes. Nothing else of the record
 * is touched. Of the initiative itself: `id`, `shortTitle`, the German
 * entry of `initiativeTranslations`, `foreseenActType`.
 */
export const PUBLICATION_FIELDS = ['id', 'frontEndStage', 'type', 'reference', 'publishedDate', 'endDate', 'totalFeedback', 'receivingFeedbackStatus'] as const

function publicationOf(raw: unknown): EuPortalPublication | null {
  if (!isObject(raw)) return null
  const stage = text(raw.frontEndStage)
  if (!stage) return null
  // Nine digits at most, as the monitor's address of the contributions takes them (15883 in the fixture).
  const id = Number(raw.id)
  return {
    id: Number.isInteger(id) && id > 0 && id <= 999_999_999 ? id : null,
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
  return {
    id,
    title: text(answer.shortTitle),
    titleDe: germanTitleOf(answer.initiativeTranslations),
    actType: text(answer.foreseenActType),
    url: initiativePageUrl(id),
    publications,
  }
}

/**
 * The German short title among an initiative's translations
 * (`initiativeTranslations`: `{ field, language, value }`, 24 languages on
 * 48 of the 49 open initiatives of 15.11.2026, 23 on one; German on all
 * 49). Only the entry whose field is `SHORT_TITLE` and whose language is
 * `DE`; null where there is none.
 */
function germanTitleOf(translations: unknown): string | null {
  if (!Array.isArray(translations)) return null
  for (const t of translations) {
    if (isObject(t) && t.field === 'SHORT_TITLE' && t.language === 'DE') {
      const value = text(t.value)
      if (value) return value
    }
  }
  return null
}

/* ------------------------------------------------------------------ *
 * The open windows (step 3 of the EU cycle)
 * ------------------------------------------------------------------ */

/** How many initiatives one page of the list asks for: every open window fit on one (49 on 15.11.2026). */
export const OPEN_WINDOWS_PAGE_SIZE = 100

/**
 * How many pages of the list the service reads at most. Three are 300
 * open initiatives, six times the count of 15.11.2026; beyond that the list
 * says how many it read of how many, and the next page waits for a day.
 */
export const OPEN_WINDOWS_MAX_PAGES = 3

/**
 * One page of the list of every initiative with an open window. The
 * parameter names are the portal's own form fields; `language=DE` changes
 * nothing in the answer measured (every title comes in every language) and
 * stays because it is the form's. Page 0 is the address measured on
 * 15.11.2026, and so it is written without `page`; a further page adds the
 * parameter by Spring's convention, which is NOT verified — the reader
 * checks the page number the answer reports instead of trusting it.
 */
export function openWindowsUrl(page: number): string {
  if (!Number.isInteger(page) || page < 0) throw new Error(`Keine Seite: ${page}`)
  const params = new URLSearchParams({ feedbackStatus: 'OPEN', size: String(OPEN_WINDOWS_PAGE_SIZE), language: 'DE' })
  if (page > 0) params.set('page', String(page))
  return `${API}/searchInitiatives?${params}`
}

/** Every field of a list row the reader takes. Nothing else of the row is touched. */
export const OPEN_WINDOW_FIELDS = ['id', 'reference', 'foreseenActType', 'shortTitle', 'initiativeTranslations', 'topics', 'currentStatuses'] as const
/** Every field of a row's status the reader takes. */
export const OPEN_WINDOW_STATUS_FIELDS = ['frontEndStage', 'receivingFeedbackStatus', 'feedbackStartDate', 'feedbackEndDate'] as const

/** One page of the list, read: its initiatives, and where it stands among the pages. */
export interface OpenWindowsPage {
  initiatives: EuOpenInitiative[]
  /** The page the answer says it is (`number`), 0-based. */
  page: number
  /** `totalPages` and `totalElements` as the answer counts them. */
  totalPages: number
  total: number
  /** How many rows the page carried, open windows or not — what „read" counts. */
  rows: number
}

/**
 * A status of a row, as a window — only where the portal says feedback is
 * `OPEN` (all 53 statuses of 15.11.2026). A status with another word is no
 * open window and is left out; one without a stage word is no shape the
 * reader knows.
 */
function windowOf(raw: unknown): EuWindow | null {
  if (!isObject(raw)) throw new Error('Portal: Status ist kein Objekt')
  const stage = text(raw.frontEndStage)
  if (!stage) throw new Error('Portal: Status ohne Stadium')
  if (raw.receivingFeedbackStatus !== 'OPEN') return null
  return { stage, start: day(raw.feedbackStartDate), end: day(raw.feedbackEndDate) }
}

function openInitiativeOf(raw: unknown): EuOpenInitiative {
  if (!isObject(raw)) throw new Error('Portal: Zeile ist kein Objekt')
  // The id arrives as a JSON number written „18953.0"; `Number` reads it.
  const id = Number(raw.id)
  // Nine digits at most, as the monitor's address takes them (`euInitiativePath`; 19,517 the highest on 15.11.2026).
  if (!Number.isInteger(id) || id <= 0 || id > 999_999_999) throw new Error('Portal: Zeile ohne Nummer')
  if (!Array.isArray(raw.currentStatuses)) throw new Error('Portal: Zeile ohne Status')
  const titleDe = germanTitleOf(raw.initiativeTranslations)
  const topics = Array.isArray(raw.topics) ? raw.topics.flatMap((t) => (isObject(t) && text(t.label) ? [text(t.label)!] : [])) : []
  return {
    id,
    reference: text(raw.reference),
    actType: text(raw.foreseenActType),
    title: titleDe ?? text(raw.shortTitle),
    titleIsGerman: titleDe !== null,
    topics,
    windows: raw.currentStatuses.map(windowOf).filter((w): w is EuWindow => w !== null),
  }
}

/**
 * One page of the list of open windows, read field by field
 * (`OPEN_WINDOW_FIELDS`): the row carries no person, but the rule of the
 * initiative's reader holds here too — nothing is copied or spread. Throws
 * on any shape the reader does not know — an answer without its page, a row
 * without a number or without its statuses — so a changed interface is
 * „not read", never a shorter list. A row whose statuses hold no open
 * window (none on 15.11.2026) is left out.
 */
export function parseOpenWindows(answer: unknown): OpenWindowsPage {
  const page = isObject(answer) ? answer.initiativeResultDtoPage : null
  const content = isObject(page) ? page.content : null
  if (!isObject(page) || !Array.isArray(content)) throw new Error('Portal: Liste ohne Seite')
  const initiatives = content.map(openInitiativeOf).filter((i) => i.windows.length > 0)
  const number = count(page.number) ?? 0
  const totalPages = count(page.totalPages) ?? number + 1
  const total = count(page.totalElements) ?? content.length
  return { initiatives, page: number, totalPages: Math.max(totalPages, number + 1), total: Math.max(total, content.length), rows: content.length }
}

/** The list as the service keeps it: the initiatives read, and whether the page cap cut it. */
export interface PortalOpenWindows {
  initiatives: EuOpenInitiative[]
  /** How many initiatives were read of how many the portal counts; null where all were. */
  cut: { read: number; total: number } | null
}

/**
 * The whole list, page by page, through the caller's fetch (the service's
 * paced one; a test's fixture). At most `OPEN_WINDOWS_MAX_PAGES` pages;
 * an initiative on two pages (the list moving between two requests) is
 * kept once. A page whose answer names another page number did not honour
 * the unverified parameter: the reading stops there and says it is cut,
 * rather than count the first page twice. A page that fails throws, so
 * nothing partial is cached as if it were the list.
 */
export async function readOpenWindows(fetchJson: (url: string) => Promise<unknown>): Promise<PortalOpenWindows> {
  const first = parseOpenWindows(await fetchJson(openWindowsUrl(0)))
  if (first.page !== 0) throw new Error('Portal: erste Seite trägt eine andere Nummer')
  const byId = new Map<number, EuOpenInitiative>()
  const keep = (p: OpenWindowsPage) => p.initiatives.forEach((i) => byId.has(i.id) || byId.set(i.id, i))
  keep(first)
  let rows = first.rows
  let complete = first.totalPages <= OPEN_WINDOWS_MAX_PAGES
  for (let p = 1; p < Math.min(first.totalPages, OPEN_WINDOWS_MAX_PAGES); p++) {
    const next = parseOpenWindows(await fetchJson(openWindowsUrl(p)))
    if (next.page !== p) {
      complete = false
      break
    }
    keep(next)
    rows += next.rows
  }
  return {
    initiatives: [...byId.values()],
    cut: complete && rows >= first.total ? null : { read: rows, total: first.total },
  }
}

/** The windows still open on a day: a list cached since yesterday may hold one that closed. */
export function windowsOpenOn(initiatives: readonly EuOpenInitiative[], today: string): EuOpenInitiative[] {
  return initiatives.flatMap((i) => {
    const windows = i.windows.filter((w) => w.end === null || w.end >= today)
    return windows.length ? [{ ...i, windows }] : []
  })
}

/** Whether one of the initiative's publications carries exactly this COM number — the proof of the join. */
export function carriesReference(initiative: EuInitiative, comReference: string): boolean {
  return initiative.publications.some((p) => p.reference !== null && p.reference.replace(/\s+/g, '') === comReference)
}
