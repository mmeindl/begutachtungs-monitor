/**
 * WHO GAVE FEEDBACK — the contributions to one publication on the
 * Commission's portal „Ihre Meinung zählt" (step 4 of the EU cycle,
 * 15.11.2026; docs/decisions.md, „Who gave feedback on the Commission's
 * portal").
 *
 * PURE MODULE — a publication's number in, URLs out; an answer in, counts
 * and the organisations the monitor may name out. No Nitro globals,
 * relative imports only.
 *
 * A ROW CARRIES PEOPLE. Every row of `api/allFeedback` holds the sender's
 * first name and surname (empty where the sender chose to stay anonymous),
 * the contribution's text, its attachments and the sender's login. None of
 * it leaves this module: `rowOf` builds its result from the fields in
 * `FEEDBACK_ROW_FIELDS` (and, for a named row, `FEEDBACK_NAMED_ROW_FIELDS`)
 * and nothing else, and the one place the names are read is the name
 * witness inside `namedOrganisationOf` — compared there, never copied into
 * a returned value, a log or an error. A test feeds a row with all of them
 * and asserts that none of the values survives.
 *
 * A NAMED ROW IS A ROW OF THE LIST, A COUNTED ROW A NUMBER (maintainer,
 * 15.11.2026). A row that names an organisation keeps its day and its
 * number, so the page can list it and link it on the portal. A counted row
 * — a person, „Sonstige", an organisation without a name, a row not
 * published — keeps its kind, whether it is published and its country, and
 * nothing that could single it out: no day, no number, no link. The two are
 * two shapes (`FeedbackRow`), so a counted row cannot carry them by
 * mistake; a test feeds both with a day and a number and finds neither in a
 * counted row.
 *
 * THE TEXT ARRIVES AND IS DROPPED (decision 9 of the plan). The portal sends
 * a contribution's text in the same row as its metadata; it is never read,
 * parsed, stored or shown. The page links the contribution on the portal
 * for it (`contributionPageUrl`).
 *
 * NO COUNTRY. The reading is the same for every member state's page: it
 * keeps each row's country (and per-country counts of the citizens), and
 * the view picks the one it serves.
 *
 * WHO IS NAMED is one pure function, `namedOrganisationOf`, and the rule is
 * the maintainer's (15.11.2026). In doubt a sender is a person: any missing
 * or odd field is counted, never named.
 */
import type { EuFeedbackContribution, EuFeedbackKind, EuFeedbackOrganisationType, EuFeedbackReading } from '../../../shared/types/eu'
import { EU_FEEDBACK_MAX_PAGES, EU_FEEDBACK_ORGANISATION_TYPES, EU_FEEDBACK_PAGE_SIZE, EU_FEEDBACK_STEP_PAGES } from '../../../shared/utils/euPortal'
import { PORTAL_HOST, contributionPageUrl } from './haveYourSay'

const API = `https://${PORTAL_HOST}/info/law/better-regulation/api`

/**
 * Bumped whenever the reader or the naming rule changes: the service caches
 * the reading under it, and a changed rule must not serve names the old one
 * allowed. 2 since 15.11.2026: a named row keeps its day and its number,
 * and the reading lists each contribution with its link. 3 since 16.11.2026:
 * the service caches page one apart and the whole reading with the moment
 * its names were read (`portalService.ts`), a changed cached shape. 4 since
 * 16.11.2026: the reading goes on in steps of five pages on request, and
 * the service caches each step's progress (`FeedbackProgress`) under its
 * number of pages.
 */
export const FEEDBACK_READER_VERSION = 4

/** One page of the list: the portal caps `size` at 100 (size=500 returned 100 on 15.11.2026). */
export const FEEDBACK_PAGE_SIZE = EU_FEEDBACK_PAGE_SIZE

/** One step of the reading: five pages. The first reading is one step (the newest 500); each „Weitere … lesen" asks for one more. */
export const FEEDBACK_STEP_PAGES = EU_FEEDBACK_STEP_PAGES

/** At most fifty pages, 5,000 rows, per window: beyond it the page says how many of how many were read, and offers no more. */
export const FEEDBACK_MAX_PAGES = EU_FEEDBACK_MAX_PAGES
export const FEEDBACK_MAX_ROWS = FEEDBACK_MAX_PAGES * FEEDBACK_PAGE_SIZE

/** Whether a number of pages is a step the reader may be asked for: 5, 10, … 50. */
export const isFeedbackStep = (pages: number): boolean =>
  Number.isInteger(pages) && pages >= FEEDBACK_STEP_PAGES && pages <= FEEDBACK_MAX_PAGES && pages % FEEDBACK_STEP_PAGES === 0

/** The displayed name's ceiling: some senders type a description of a few hundred characters into the field. */
export const ORGANISATION_NAME_MAX = 120

/**
 * One page of the contributions to a publication, newest first. The
 * parameter names are the portal's own (measured on 15.11.2026 with
 * `page`, `size` and `language`). Throws on anything that is no
 * publication number or page.
 */
export function feedbackUrl(publicationId: number, page: number): string {
  if (!Number.isInteger(publicationId) || publicationId <= 0 || publicationId > 999_999_999) throw new Error(`Keine Veröffentlichung: ${publicationId}`)
  if (!Number.isInteger(page) || page < 0) throw new Error(`Keine Seite: ${page}`)
  return `${API}/allFeedback?${new URLSearchParams({ publicationId: String(publicationId), page: String(page), size: String(FEEDBACK_PAGE_SIZE), language: 'EN' })}`
}

type Json = Record<string, unknown>
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const count = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null)

/** Whitespace — line breaks and runs of spaces included — collapsed to one space, trimmed. */
export const collapseWhitespace = (s: string): string => s.replace(/\s+/gu, ' ').trim()

/**
 * The words of a text for the name witness: runs of letters, at least three,
 * lower case, NFC — and with their accents taken off, so „José" in the
 * name matches „JOSE" in the organisation. Folding counts more rows, never
 * fewer: in doubt a sender is a person.
 */
function wordsOf(s: string): Set<string> {
  const folded = s.normalize('NFD').replace(/\p{M}+/gu, '').normalize('NFC').toLowerCase()
  return new Set((folded.match(/\p{L}+/gu) ?? []).filter((w) => Array.from(w).length >= 3))
}

const ORGANISATION_TYPES: ReadonlySet<string> = new Set(EU_FEEDBACK_ORGANISATION_TYPES)
/** A size a sole trader cannot have: the portal's `MICRO` is up to nine people, and the eight person-bearing names of 934 read were all MICRO. */
const WITNESS_SIZES: ReadonlySet<string> = new Set(['SMALL', 'MEDIUM', 'LARGE'])
const PUBLICATION_MODES: ReadonlySet<string> = new Set(['WITHINFO', 'ANONYMOUS'])

/** A number of five or more digits (separators between the digits allowed), or an e-mail address: not a name. */
const IDENTIFIER_RE = /\d(?:[ .\-/]?\d){4,}|@/u

/** Where a sender's addition to the name begins: a semicolon, a web address, or „Contact:" in the languages seen. */
const TAIL_RE = /\s*(?:;|[[(]?\s*(?:https?:\/\/|www\.)|\b(?:contact|kontakt|contacto|contatto|ansprechpartner(?:in)?)\s*:).*$/isu

/** A string field that may be absent or null; any other kind is odd. */
const optionalText = (v: unknown): string | null | undefined => (v === undefined || v === null ? null : typeof v === 'string' ? v : undefined)

/**
 * THE NAMING RULE (maintainer, 15.11.2026). A row names an organisation —
 * and this returns the name the page shows — only if all hold:
 *
 * 1. its status is `PUBLISHED`;
 * 2. its kind is one of the eight organisation kinds
 *    (`EU_FEEDBACK_ORGANISATION_TYPES`); `EU_CITIZEN`, `NON_EU_CITIZEN`,
 *    `OTHER` and any kind not known are counted, never named;
 * 3. it was published with the sender's details or anonymously
 *    (`WITHINFO`, `ANONYMOUS`) — for an organisation the portal publishes
 *    the organisation's name either way and withholds only the person's
 *    (its own form says so); any other word is odd;
 * 4. `organization` is not empty once its whitespace is collapsed;
 * 5. a structural witness: the size is `SMALL`, `MEDIUM` or `LARGE`, or
 *    the row carries a number in the EU Transparency Register. A `MICRO`
 *    or size-less row without one is counted: a sole trader carries their
 *    own name as the business name;
 * 6. a name witness: no word of the sender's first name or surname (letters
 *    only, three or more, case and accents ignored) is a word of the
 *    organisation's name.
 *
 * 7. the name is a name: it carries no number of five or more digits and
 *    no e-mail address. A sender typed eight digits and a letter as the organisation
 *    (seen 15.11.2026) — the shape of a personal identity number; a tax
 *    number, a telephone number or an address in that field says more
 *    about a person than about an organisation.
 * 8. only the head of the field is shown, and only a head of at most
 *    `ORGANISATION_NAME_MAX` characters: it is cut at the first „;", at a
 *    web address and at „Contact:" and its like, and a longer text is a
 *    description, counted. Senders append a sentence to the name,
 *    and two of 2,078 distinct names read on 15.11.2026 named a person
 *    there („… Contact: <name>", „…; <name> … is the co-author"), on rows
 *    that carry no sender's name to compare with. Tests 6 and 7 read the
 *    whole field, the stricter reading.
 *
 * Otherwise null — counted, not named. What remains possible: a person
 * named inside the head in a form no test knows; the names are the
 * portal's own published organisation names, and are kept in memory only. The first name and surname are read
 * here, for test 6, and nowhere else; they are never returned, logged or
 * put into an error. `server/utils/parliament/privacy.ts` is not the
 * witness here: it reads Austrian submitter lines, and called 62 % of these
 * international organisation names a person while missing 3 of the 8 real
 * cases (15.11.2026).
 */
export function namedOrganisationOf(raw: unknown): string | null {
  if (!isObject(raw)) return null
  if (raw.status !== 'PUBLISHED') return null
  if (typeof raw.userType !== 'string' || !ORGANISATION_TYPES.has(raw.userType)) return null
  if (typeof raw.publication !== 'string' || !PUBLICATION_MODES.has(raw.publication)) return null
  if (typeof raw.organization !== 'string') return null
  const organisation = collapseWhitespace(raw.organization)
  if (!organisation) return null
  if (IDENTIFIER_RE.test(organisation)) return null

  const size = optionalText(raw.companySize)
  const register = optionalText(raw.trNumber)
  if (size === undefined || register === undefined) return null
  // A register number has digits; a word typed into the field is no witness.
  const registered = register !== null && /\d/.test(register)
  if (!(size !== null && WITNESS_SIZES.has(size)) && !registered) return null

  const first = optionalText(raw.firstName)
  const last = optionalText(raw.surname)
  if (first === undefined || last === undefined) return null
  const organisationWords = wordsOf(organisation)
  for (const w of wordsOf(`${first ?? ''} ${last ?? ''}`)) {
    if (organisationWords.has(w)) return null
  }
  const head = collapseWhitespace(organisation.replace(TAIL_RE, ''))
  // Longer than a name gets: a description („… is transforming regional air travel with …", 13 of 2,078), and who knows whom it names further on.
  if (!head || Array.from(head).length > ORGANISATION_NAME_MAX) return null
  return head
}

/**
 * Every field of a row the reader takes for its result, any row. The
 * sender's names are read by `namedOrganisationOf` for its comparison
 * alone; the text (`feedback`, `feedbackTextUserLanguage`), `attachments`,
 * `login` and everything else are not touched.
 */
export const FEEDBACK_ROW_FIELDS = ['status', 'userType', 'country'] as const

/** What a row that names an organisation keeps besides: its day and its number, for the list and the link. Never read on a counted row. */
export const FEEDBACK_NAMED_ROW_FIELDS = ['dateFeedback', 'id'] as const

/** A row that names an organisation: a row of the list. Always published, always of an organisation kind (`namedOrganisationOf`). */
export interface NamedFeedbackRow {
  named: true
  type: EuFeedbackOrganisationType
  /** As `namedOrganisationOf` returns it. */
  name: string
  /** ISO alpha-3 („AUT"); null for anything else. */
  country: string | null
  /** The day it was given, ISO; null where `dateFeedback` is no date. */
  date: string | null
  /** The contribution's number on the portal; null where it is no positive integer — the row is listed then, without a link. */
  id: number | null
}

/** A row that is counted: its kind, whether it is published and where it is from — nothing that singles it out. */
export interface CountedFeedbackRow {
  named: false
  /** The portal's code of the kind; empty where the row carries none. */
  type: string
  published: boolean
  /** ISO alpha-3 („AUT"); null for anything else. */
  country: string | null
}

export type FeedbackRow = NamedFeedbackRow | CountedFeedbackRow

const countryOf = (v: unknown): string | null => (typeof v === 'string' && /^[A-Z]{3}$/.test(v) ? v : null)

/** „2026/11/15 18:15:22" → „2026-11-15"; null for anything that is no day of the calendar. */
export function feedbackDay(v: unknown): string | null {
  const m = typeof v === 'string' ? /^(\d{4})\/(\d{2})\/(\d{2})(?: \d{2}:\d{2}(?::\d{2})?)?$/.exec(v.trim()) : null
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(y, mo - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null
  return `${m[1]}-${m[2]}-${m[3]}`
}

/** A contribution's number: a positive integer, nothing else. */
const feedbackIdOf = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v : null)

/**
 * A row, field by field. Throws on a row that is no object: a changed
 * interface is „not read", never a shorter count. The counted shape is
 * built before the name is known to be allowed, from its three fields
 * alone, so the day and the number are read only for a named row.
 */
export function rowOf(raw: unknown): FeedbackRow {
  if (!isObject(raw)) throw new Error('Portal: Rückmeldung ist kein Objekt')
  const country = countryOf(raw.country)
  const name = namedOrganisationOf(raw)
  if (name === null) {
    return { named: false, type: typeof raw.userType === 'string' ? raw.userType : '', published: raw.status === 'PUBLISHED', country }
  }
  // `namedOrganisationOf` has proven the kind one of the eight.
  return { named: true, type: raw.userType as EuFeedbackOrganisationType, name, country, date: feedbackDay(raw.dateFeedback), id: feedbackIdOf(raw.id) }
}

/** One page of the list, read. */
export interface FeedbackPage {
  rows: FeedbackRow[]
  /** The page the answer says it is (`number`), 0-based. */
  page: number
  /** `totalElements`: how many contributions the portal counts. */
  total: number
  /** Whether the answer says it is the last page (`last`); also where it carried fewer rows than asked. */
  last: boolean
}

/** One page, read row by row. Throws on any shape that is no page of the list. */
export function parseFeedbackPage(answer: unknown): FeedbackPage {
  const content = isObject(answer) ? answer.content : null
  if (!isObject(answer) || !Array.isArray(content)) throw new Error('Portal: Rückmeldungen ohne Seite')
  const rows = content.map(rowOf)
  const total = count(answer.totalElements)
  if (total === null) throw new Error('Portal: Rückmeldungen ohne Gesamtzahl')
  return {
    rows,
    page: count(answer.number) ?? 0,
    total: Math.max(total, rows.length),
    last: answer.last === true || rows.length < FEEDBACK_PAGE_SIZE,
  }
}

const CITIZENS: ReadonlySet<string> = new Set(['EU_CITIZEN', 'NON_EU_CITIZEN'])

/**
 * The rows read, as the page's list and figures. Every row is in exactly
 * one figure: a row that is not published counts apart, of no kind; an
 * organisation kind's row in its kind (named or not); a citizen in
 * `citizens`; `OTHER` and any kind not known in `other`. A named row is
 * also a contribution of the list, in the portal's order and linked on the
 * portal under `initiativeId` — never merged with another row of the same
 * name: two contributions are two rows.
 */
export function summarize(rows: readonly FeedbackRow[], total: number, initiativeId: number): EuFeedbackReading {
  const kinds = new Map<EuFeedbackOrganisationType, EuFeedbackKind>()
  const contributions: EuFeedbackContribution[] = []
  const citizens = { count: 0, byCountry: {} as Record<string, number> }
  let other = 0
  let unpublished = 0
  const kindOf = (type: EuFeedbackOrganisationType): EuFeedbackKind => {
    const known = kinds.get(type)
    if (known) return known
    const fresh = { type, count: 0, unnamed: 0 }
    kinds.set(type, fresh)
    return fresh
  }
  for (const row of rows) {
    if (row.named) {
      kindOf(row.type).count++
      contributions.push({ name: row.name, type: row.type, country: row.country, date: row.date, url: row.id === null ? null : contributionPageUrl(initiativeId, row.id) })
      continue
    }
    if (!row.published) {
      unpublished++
      continue
    }
    if (CITIZENS.has(row.type)) {
      citizens.count++
      if (row.country) citizens.byCountry[row.country] = (citizens.byCountry[row.country] ?? 0) + 1
      continue
    }
    if (!ORGANISATION_TYPES.has(row.type)) {
      other++
      continue
    }
    const kind = kindOf(row.type as EuFeedbackOrganisationType)
    kind.count++
    kind.unnamed++
  }
  return {
    total: Math.max(total, rows.length),
    read: rows.length,
    contributions,
    kinds: EU_FEEDBACK_ORGANISATION_TYPES.flatMap((type) => kinds.get(type) ?? []),
    citizens,
    other,
    unpublished,
  }
}

/**
 * The contributions to one publication of one initiative: page one, then
 * one step (`pages`, five by default — the newest 500), through the
 * caller's fetch (the service's paced one; a test's fake). The initiative
 * is asked for nothing; its number only builds the contributions' links.
 * A page that fails throws, so nothing partial is cached as if it were the
 * whole.
 */
export async function readFeedback(fetchJson: (url: string) => Promise<unknown>, initiativeId: number, publicationId: number, pages: number = FEEDBACK_STEP_PAGES): Promise<EuFeedbackReading> {
  const first = await readFirstFeedbackPage(fetchJson, publicationId)
  const { progress } = await readFeedbackStep(fetchJson, publicationId, progressOfFirstPage(first), pages)
  return progressReading(progress, initiativeId)
}

/**
 * The first step of the two (16.11.2026): page one alone, read row by row
 * (`rowOf` has run on every row, so a counted row already keeps no day and
 * no number). What the service caches to answer before the whole reading
 * is in, and hands to `readFeedbackStep`, so page one is never asked twice.
 */
export async function readFirstFeedbackPage(fetchJson: (url: string) => Promise<unknown>, publicationId: number): Promise<FeedbackPage> {
  const first = parseFeedbackPage(await fetchJson(feedbackUrl(publicationId, 0)))
  if (first.page !== 0) throw new Error('Portal: erste Seite trägt eine andere Nummer')
  return first
}

/** Page one alone as a reading: `read` its rows, `total` the portal's count — the whole reading where page one is the last. */
export function firstPageReading(first: FeedbackPage, initiativeId: number): EuFeedbackReading {
  return summarize(first.rows, first.total, initiativeId)
}

/** Whether page one is all there is to read: the portal says it is the last page. */
export const isWholeReading = (first: FeedbackPage): boolean => first.last

/**
 * How far the reading of one window has come: what a step starts from and
 * what the service caches per step (16.11.2026). Every row has passed the
 * naming rule (`rowOf`): a counted row keeps no day, no number, no link.
 */
export interface FeedbackProgress {
  /** Every row read, newest first: one unbroken run of the portal's list. */
  rows: FeedbackRow[]
  /**
   * The portal's count at the read the rows' places are measured from: page
   * one's, or that of a later read of page one which added the rows that
   * had arrived since (`readFeedbackStep`, „the newest").
   */
  anchor: number
  /** The portal's count at the latest page read — what the page shows as „von N". */
  total: number
  /** The step it answers, in pages: 1 for page one alone, then 5, 10, … 50. It holds at most `pages × 100` rows. */
  pages: number
}

/** Page one as the progress every reading starts from. */
export function progressOfFirstPage(first: FeedbackPage): FeedbackProgress {
  return { rows: [...first.rows], anchor: first.total, total: first.total, pages: 1 }
}

/** A progress as the page's reading: its rows, the latest count. */
export function progressReading(progress: FeedbackProgress, initiativeId: number): EuFeedbackReading {
  return summarize(progress.rows, progress.total, initiativeId)
}

/** Whether two rows can be the same row of the list: a named row by its number (or, without one, by all it keeps), a counted row by the three things it keeps. */
function sameRow(a: FeedbackRow, b: FeedbackRow): boolean {
  if (a.named && b.named) return a.id !== null || b.id !== null ? a.id === b.id : a.name === b.name && a.type === b.type && a.country === b.country && a.date === b.date
  if (a.named || b.named) return false
  return a.type === b.type && a.published === b.published && a.country === b.country
}

const namedIds = (rows: readonly FeedbackRow[]): Set<number> => new Set(rows.flatMap((r) => (r.named && r.id !== null ? [r.id] : [])))
const repeatsANamedRow = (rows: readonly FeedbackRow[], seen: ReadonlySet<number>): boolean => rows.some((r) => r.named && r.id !== null && seen.has(r.id))

/** What reading one page did to a progress: added its rows, found the list shifted in a way the arithmetic does not explain, or found a page that is not the one asked. */
type PageOutcome = 'added' | 'misfit' | 'stop'

/**
 * The next older rows: the page that holds the first row not read yet. The
 * list is newest first, so a contribution that arrived since the anchor's
 * read stands above everything read and pushes every row down by one: with
 * the count grown by k, the row after the last one read stands at
 * `rows + k`, and the first rows of its page are rows already read. They
 * are skipped — and compared first, row by row, with the rows read last,
 * so a skip the arithmetic got wrong is caught where the rows can tell
 * (a named row by its number, a counted row by kind, status and country).
 * A count lower than at the read before, a skip that does not fall on the
 * page, a repeat that does not match, or a named row already read among the
 * kept ones is a misfit: the caller reads again from page one.
 */
async function readOlder(fetchJson: (url: string) => Promise<unknown>, publicationId: number, p: FeedbackProgress): Promise<PageOutcome> {
  const read = p.rows.length
  const pageNo = Math.floor((read + p.total - p.anchor) / FEEDBACK_PAGE_SIZE)
  const page = parseFeedbackPage(await fetchJson(feedbackUrl(publicationId, pageNo)))
  // A page whose answer names another number did not honour the parameter: stop there rather than count a page twice.
  if (page.page !== pageNo) return 'stop'
  if (page.total < p.total) return 'misfit'
  const skip = read + (page.total - p.anchor) - pageNo * FEEDBACK_PAGE_SIZE
  if (skip < 0 || skip > read || skip > page.rows.length || (skip === page.rows.length && !page.last)) return 'misfit'
  for (let i = 0; i < skip; i++) {
    if (!sameRow(page.rows[i]!, p.rows[read - skip + i]!)) return 'misfit'
  }
  const kept = page.rows.slice(skip)
  if (repeatsANamedRow(kept, namedIds(p.rows))) return 'misfit'
  p.rows.push(...kept)
  p.total = page.total
  return 'added'
}

/**
 * The newer rows: once the run from the anchor down is read to its end,
 * what arrived since stands at the head of page one. They are taken from a
 * fresh page one — after the rows below them were compared with the head of
 * what was read — and the anchor moves to that read. More new rows than a
 * page holds is a misfit.
 */
async function readNewer(fetchJson: (url: string) => Promise<unknown>, publicationId: number, p: FeedbackProgress): Promise<PageOutcome> {
  const page = parseFeedbackPage(await fetchJson(feedbackUrl(publicationId, 0)))
  if (page.page !== 0) return 'stop'
  if (page.total < p.total) return 'misfit'
  const fresh = page.total - p.anchor
  if (fresh <= 0 || fresh > page.rows.length) return 'misfit'
  const below = page.rows.slice(fresh)
  for (let i = 0; i < below.length && i < p.rows.length; i++) {
    if (!sameRow(below[i]!, p.rows[i]!)) return 'misfit'
  }
  const head = page.rows.slice(0, fresh)
  if (repeatsANamedRow(head, namedIds(p.rows))) return 'misfit'
  p.rows.unshift(...head)
  p.anchor = page.total
  p.total = page.total
  return 'added'
}

/** What a step did: the progress it reached, and whether it had to begin again at page one (its names are then newer than the progress it started from). */
export interface FeedbackStepResult {
  progress: FeedbackProgress
  restarted: boolean
}

/**
 * ONE STEP (16.11.2026): from a progress, on to `pages` pages' worth of
 * rows (`pages × 100`, at most 5,000), asking the portal at most `requests`
 * times (five: one step's pages, so a step fits the endpoint's 30 s at the
 * pacer's 2.5 s) and never for a page already read unless the list moved.
 * Older rows first, down the list; where the list is read to its end and
 * contributions arrived since the anchor, the newer ones from page one.
 * Stops early at the end of the list, at a page that answers with another
 * number, or when the requests are used up — the progress then holds fewer
 * rows than the step's, and the next step goes on from there.
 *
 * ROWS THAT MOVE BETWEEN READS. A counted row keeps no number and no day,
 * so a row read twice cannot be told afterwards; the guard is the portal's
 * count at each read (`readOlder`, `readNewer`). Where the list moved in a
 * way the count does not explain, the step begins again from page one,
 * once, within the same requests; a second misfit throws, and nothing of
 * the step is cached. What the count cannot see: a contribution withdrawn
 * below the last row read while another arrives, between two reads — the
 * count stays, the rows move up by one, and the first row of the next page
 * is one already read. A named row is caught by its number; a counted row
 * is counted twice.
 */
export async function readFeedbackStep(
  fetchJson: (url: string) => Promise<unknown>,
  publicationId: number,
  from: FeedbackProgress,
  pages: number,
  requests: number = FEEDBACK_STEP_PAGES,
): Promise<FeedbackStepResult> {
  const target = Math.min(pages, FEEDBACK_MAX_PAGES) * FEEDBACK_PAGE_SIZE
  let p: FeedbackProgress = { ...from, rows: [...from.rows], pages }
  let left = requests
  let restarted = false
  while (left > 0 && p.rows.length < Math.min(target, p.total)) {
    const outcome = p.rows.length < p.anchor ? await readOlder(fetchJson, publicationId, p) : await readNewer(fetchJson, publicationId, p)
    left--
    if (outcome === 'stop') break
    if (outcome === 'misfit') {
      if (restarted) throw new Error('Portal: die Liste der Rückmeldungen hat sich beim Lesen verschoben')
      // No request left for page one: the rows read so far stand (the misfit page added nothing), and the next step meets the list again.
      if (left === 0) break
      restarted = true
      p = { ...progressOfFirstPage(await readFirstFeedbackPage(fetchJson, publicationId)), pages }
      left--
    }
  }
  // Newer rows taken at the head may push the step past its rows: the oldest go, and the run stays unbroken.
  if (p.rows.length > target) p.rows = p.rows.slice(0, target)
  return { progress: p, restarted }
}

/** A reading of a window without a single contribution: the portal's own count says so, and nothing is asked. */
export function emptyReading(): EuFeedbackReading {
  return { total: 0, read: 0, contributions: [], kinds: [], citizens: { count: 0, byCountry: {} }, other: 0, unpublished: 0 }
}
