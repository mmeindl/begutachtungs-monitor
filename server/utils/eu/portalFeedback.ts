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
 * `FEEDBACK_ROW_FIELDS` and nothing else, and the one place the names are
 * read is the name witness inside `namedOrganisationOf` — compared there,
 * never copied into a returned value, a log or an error. A test feeds a row
 * with all of them and asserts that none of the values survives.
 *
 * THE TEXT ARRIVES AND IS DROPPED (decision 9 of the plan). The portal sends
 * a contribution's text in the same row as its metadata; it is never read,
 * parsed, stored or shown. The page links the portal for it.
 *
 * WHO IS NAMED is one pure function, `namedOrganisationOf`, and the rule is
 * the maintainer's (15.11.2026). In doubt a sender is a person: any missing
 * or odd field is counted, never named.
 */
import type { EuFeedbackGroup, EuFeedbackOrganisation, EuFeedbackOrganisationType, EuFeedbackReading } from '../../../shared/types/eu'
import { EU_FEEDBACK_ORGANISATION_TYPES } from '../../../shared/utils/euPortal'
import { PORTAL_HOST } from './haveYourSay'

const API = `https://${PORTAL_HOST}/info/law/better-regulation/api`

/**
 * Bumped whenever the reader or the naming rule changes: the service caches
 * the reading under it, and a changed rule must not serve names the old one
 * allowed.
 */
export const FEEDBACK_READER_VERSION = 1

/** One page of the list: the portal caps `size` at 100 (size=500 returned 100 on 15.11.2026). */
export const FEEDBACK_PAGE_SIZE = 100

/** At most 500 rows per window (decision 10): five pages, newest first. Beyond it the page says how many of how many were read. */
export const FEEDBACK_MAX_ROWS = 500
export const FEEDBACK_MAX_PAGES = FEEDBACK_MAX_ROWS / FEEDBACK_PAGE_SIZE

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
 * Every field of a row the reader takes for its result. The sender's names
 * are read by `namedOrganisationOf` for its comparison alone; the text
 * (`feedback`, `feedbackTextUserLanguage`), `attachments`, `login`, the
 * row's `id` and everything else are not touched.
 */
export const FEEDBACK_ROW_FIELDS = ['status', 'userType', 'country'] as const

/** One row as the reader keeps it: its kind, whether it is published, where it is from, and the name only where the rule allows it. */
export interface FeedbackRow {
  /** The portal's code of the kind; empty where the row carries none. */
  type: string
  published: boolean
  /** ISO alpha-3 („AUT"); null for anything else. */
  country: string | null
  /** The organisation's name as the page shows it, only where `namedOrganisationOf` allows it. */
  name: string | null
}

/** A row, field by field. Throws on a row that is no object: a changed interface is „not read", never a shorter count. */
export function rowOf(raw: unknown): FeedbackRow {
  if (!isObject(raw)) throw new Error('Portal: Rückmeldung ist kein Objekt')
  return {
    type: typeof raw.userType === 'string' ? raw.userType : '',
    published: raw.status === 'PUBLISHED',
    country: typeof raw.country === 'string' && /^[A-Z]{3}$/.test(raw.country) ? raw.country : null,
    name: namedOrganisationOf(raw),
  }
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
const collator = new Intl.Collator('de', { sensitivity: 'base' })

/**
 * The rows read, as the page's figures. Every row is in exactly one: a row
 * that is not published counts apart, of no kind; an organisation kind's
 * row in its group (named or not); a citizen in `citizens`; `OTHER` and
 * any kind not known in `other`. Within a kind an organisation is named
 * once, by its name without regard to case, and the names stand
 * alphabetically — no order by count or by anything else.
 */
export function summarize(rows: readonly FeedbackRow[], total: number): EuFeedbackReading {
  const groups = new Map<EuFeedbackOrganisationType, { count: number; unnamed: number; byName: Map<string, EuFeedbackOrganisation> }>()
  let citizens = 0
  let other = 0
  let unpublished = 0
  for (const row of rows) {
    if (!row.published) {
      unpublished++
      continue
    }
    if (CITIZENS.has(row.type)) {
      citizens++
      continue
    }
    if (!ORGANISATION_TYPES.has(row.type)) {
      other++
      continue
    }
    const type = row.type as EuFeedbackOrganisationType
    const g = groups.get(type) ?? { count: 0, unnamed: 0, byName: new Map() }
    groups.set(type, g)
    g.count++
    if (!row.name) {
      g.unnamed++
      continue
    }
    const key = row.name.toLocaleLowerCase('de')
    const known = g.byName.get(key)
    if (known) {
      known.rows++
      if (row.country && !known.countries.includes(row.country)) known.countries.push(row.country)
    } else {
      g.byName.set(key, { name: row.name, countries: row.country ? [row.country] : [], rows: 1 })
    }
  }
  const organisations: EuFeedbackGroup[] = EU_FEEDBACK_ORGANISATION_TYPES.flatMap((type) => {
    const g = groups.get(type)
    if (!g) return []
    return [{ type, count: g.count, named: [...g.byName.values()].sort((a, b) => collator.compare(a.name, b.name)), unnamed: g.unnamed }]
  })
  return { total: Math.max(total, rows.length), read: rows.length, organisations, citizens, other, unpublished }
}

/**
 * The contributions to one publication, page by page through the caller's
 * fetch (the service's paced one; a test's fake): until the answer says it
 * is the last page, or until `FEEDBACK_MAX_ROWS` rows. `total` is the first
 * page's count. A page whose answer names another page number did not
 * honour the parameter: the reading stops there, and the page says how
 * many of how many were read, rather than count a page twice. A page that
 * fails throws, so nothing partial is cached as if it were the whole.
 *
 * Not deduplicated across pages: the row's number is not kept. A
 * contribution arriving between two requests (2.5 s apart) shifts one row
 * onto the next page and counts it twice; for a window still open the
 * figures are those of a moment anyway, and the portal's count stands
 * beside them.
 */
export async function readFeedback(fetchJson: (url: string) => Promise<unknown>, publicationId: number): Promise<EuFeedbackReading> {
  const first = parseFeedbackPage(await fetchJson(feedbackUrl(publicationId, 0)))
  if (first.page !== 0) throw new Error('Portal: erste Seite trägt eine andere Nummer')
  const rows = [...first.rows]
  let last = first.last
  for (let p = 1; !last && p < FEEDBACK_MAX_PAGES && rows.length < FEEDBACK_MAX_ROWS; p++) {
    const next = parseFeedbackPage(await fetchJson(feedbackUrl(publicationId, p)))
    if (next.page !== p) break
    rows.push(...next.rows)
    last = next.last
  }
  return summarize(rows.slice(0, FEEDBACK_MAX_ROWS), first.total)
}

/** A reading of a window without a single contribution: the portal's own count says so, and nothing is asked. */
export function emptyReading(): EuFeedbackReading {
  return { total: 0, read: 0, organisations: [], citizens: 0, other: 0, unpublished: 0 }
}
