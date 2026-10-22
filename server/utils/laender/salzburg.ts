/**
 * Salzburg's drafts in Begutachtung (22.10.2026).
 *
 * THREE PAGES of the Land's publication service, all server-rendered:
 *
 *  - the CURRENT LIST per kind (`…/landesrecht-list`): title, one PDF
 *    (`/pub/get/<n>`, numbered upwards) and „Ende der Begutachtungsfrist".
 *    The only place the Frist stands.
 *  - the REGISTER per kind (`…/landesrecht-archiv`), which is no archive:
 *    every draft since July 2004 as one table, the running ones included
 *    from their first day. Its date is the START of the Begutachtung, and it
 *    is what keeps a draft's page alive after its Frist (measured
 *    22.10.2026: 836 Gesetze, 1.539 Verordnungen, 12 of 12 running drafts
 *    present; `TODO.md` 5L).
 *  - the STELLUNGNAHMEN of one draft (`/pub/get/attachments/<n>`): the PDFs
 *    the Land published, named after their submitter.
 *
 * THE GATE. The current list states its own size („10 Einträge"), and the
 * parse is held to it; the register states none, so it is held to its table
 * head and a floor of rows. A page that fails either is refused
 * (`LandSourceError`), and the Land then reads as „nicht abrufbar" — a
 * maintenance page served with HTTP 200 must never read as „keine
 * Begutachtung offen".
 *
 * ANNEXES. Annexes, Textgegenüberstellungen and Erläuterungen stand as
 * entries of their own, titled like the draft plus „ - Anlage I". They are
 * folded into the draft as further documents, so one draft is one row.
 */
import type { LandConsultation, LandDocument, LandDraftKind, LandStatement } from '#shared/types'
import { safeExternalUrl } from '#shared/utils/safeExternalUrl'
import { decodeEntities } from '../parliament/htmlText'
import { classifySubmitter } from '../parliament/privacy'
import { LandSourceError } from './gate'

const BASE = 'https://service.salzburg.gv.at/pub/'

export const SALZBURG_LISTS: Record<LandDraftKind, string> = {
  gesetz: `${BASE}list/gesetz_entw/landesrecht-list`,
  verordnung: `${BASE}list/verord_entw/landesrecht-list`,
}

export const SALZBURG_REGISTERS: Record<LandDraftKind, string> = {
  gesetz: `${BASE}list/gesetz_entw/landesrecht-archiv`,
  verordnung: `${BASE}list/verord_entw/landesrecht-archiv`,
}

/** Where a Stellungnahme goes, from the list page's own text. */
export const SALZBURG_FILING_EMAIL = 'Begutachtung@salzburg.gv.at'

export function salzburgStatementsUrl(number: string): string {
  return `${BASE}get/attachments/${number}`
}

/**
 * The register's floor. Measured 22.10.2026 at 836 and 1.539 rows and only
 * ever growing; a page with fewer is not the register.
 */
const REGISTER_MIN_ROWS = 500

const ENTRY_RE = /<li class="margin-bottom-big">([\s\S]*?)<\/li>/g
const LINK_RE = /<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/
const FRIST_RE = /Ende der Begutachtungsfrist:\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/
const COUNT_RE = /(\d+|Keine)\s+Eintr(?:ag|äge)\b/i
const REGISTER_ROW_RE = /<tr>\s*<td>([\s\S]*?)<\/td>\s*<td data-order="(\d{4}-\d{2}-\d{2})"/g
const ANNEX_RE = /^(.*?)\s+-\s+((?:Anlage|Anhang|Beilage|Textgegenüberstellung|Erläuterungen)\b.*)$/
const ATTACHMENT_RE = /<a href="([^"]*get\/attachment\/\d+)"[^>]*>([\s\S]*?)<\/a>/g

function text(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function isoOf(d: string, m: string, y: string): string | null {
  const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  const date = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(iso) ? iso : null
}

/** The Land's number for a document, from `/pub/get/<n>`. */
export function documentNumber(url: string): string | null {
  return /\/get\/(\d+)$/.exec(url)?.[1] ?? null
}

export interface RawEntry {
  title: string
  url: string
  /** The current list's Frist. */
  deadline?: string
  /** The register's start date. */
  startedAt?: string
}

/**
 * One current list page → its entries, or `LandSourceError` when the page
 * is not the list it should be. Pure: the fixtures in `tests/` are real pages.
 */
export function parseSalzburgList(html: string, listUrl: string): RawEntry[] {
  const count = COUNT_RE.exec(html)?.[1]
  if (count === undefined) throw new LandSourceError('sbg', 'keine Eintragszahl auf der Seite')
  const stated = /^keine$/i.test(count) ? 0 : Number(count)

  const entries: RawEntry[] = []
  for (const [, block] of html.matchAll(ENTRY_RE)) {
    const link = LINK_RE.exec(block!)
    const frist = FRIST_RE.exec(block!)
    const url = link ? safeExternalUrl(new URL(link[1]!, listUrl).href) : null
    const deadline = frist ? isoOf(frist[1]!, frist[2]!, frist[3]!) : null
    const title = link ? text(link[2]!) : ''
    if (!url || !deadline || !title) {
      throw new LandSourceError('sbg', `Eintrag ohne ${!url ? 'Dokument' : !deadline ? 'Frist' : 'Titel'}`)
    }
    entries.push({ title, url, deadline })
  }
  if (entries.length !== stated) {
    throw new LandSourceError('sbg', `Seite nennt ${stated} Einträge, gelesen ${entries.length}`)
  }
  return entries
}

/** One register page → every entry since 2004, or `LandSourceError`. */
export function parseSalzburgRegister(html: string, registerUrl: string): RawEntry[] {
  if (!/scope="col">Titel</.test(html) || !/scope="col">Datum</.test(html)) {
    throw new LandSourceError('sbg', 'Register ohne Tabellenkopf')
  }
  const entries: RawEntry[] = []
  for (const [, cell, date] of html.matchAll(REGISTER_ROW_RE)) {
    const link = LINK_RE.exec(cell!)
    const url = link ? safeExternalUrl(new URL(link[1]!, registerUrl).href) : null
    const title = link ? text(link[2]!) : ''
    if (url && title && documentNumber(url)) entries.push({ title, url, startedAt: date! })
  }
  if (entries.length < REGISTER_MIN_ROWS) {
    throw new LandSourceError('sbg', `Register mit nur ${entries.length} Einträgen`)
  }
  return entries
}

/**
 * Entries → drafts. An annex joins the draft whose title it extends — the
 * one with the highest number below its own, because the same title
 * returns over the years („… Mindestsicherungsgesetz geändert wird" stands
 * there several times). An annex without such a draft stays a row of its
 * own rather than vanish.
 */
export function salzburgDrafts(entries: RawEntry[], kind: LandDraftKind): LandConsultation[] {
  const drafts: LandConsultation[] = []
  const byTitle = new Map<string, LandConsultation[]>()
  const annexes: { base: string; doc: LandDocument; entry: RawEntry }[] = []
  const numberOf = (d: LandConsultation) => Number(d.id.slice(4))

  const toDraft = (entry: RawEntry, title: string): LandConsultation => ({
    id: `sbg-${documentNumber(entry.url) ?? entry.url}`,
    land: 'sbg',
    kind,
    title,
    startedAt: entry.startedAt ?? null,
    deadline: entry.deadline ?? null,
    url: entry.url,
    documents: [{ title: 'Entwurf', url: entry.url }],
    active: false,
  })

  for (const entry of entries) {
    const annex = ANNEX_RE.exec(entry.title)
    if (annex) {
      annexes.push({ base: annex[1]!, doc: { title: annex[2]!, url: entry.url }, entry })
      continue
    }
    const draft = toDraft(entry, entry.title)
    drafts.push(draft)
    byTitle.set(entry.title, [...(byTitle.get(entry.title) ?? []), draft])
  }
  for (const { base, doc, entry } of annexes) {
    const own = Number(documentNumber(entry.url))
    const draft = (byTitle.get(base) ?? [])
      .filter((d) => numberOf(d) < own)
      .sort((a, b) => numberOf(b) - numberOf(a))[0]
    if (draft) draft.documents.push(doc)
    else drafts.push(toDraft(entry, entry.title.replace(ANNEX_RE, '$1 ($2)')))
  }
  return drafts
}

/**
 * The submitter a file name gives: „Arbeiterkammer Salzburg WIRT-818-33.pdf"
 * → „Arbeiterkammer Salzburg". The Land's Geschäftszahl, the extension and
 * underscores go; what is left is what `classifySubmitter` decides on.
 */
export function submitterOfFile(file: string): string {
  return decodeEntities(file)
    .replace(/\.(?:pdf|docx?|odt|rtf)\s*$/i, '')
    .replace(/_/g, ' ')
    .replace(/\s+[A-Za-zÄÖÜ]{2,6}[- ]\d+(?:[- ]\d+)*-?(?=\s|$)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * One draft's page of Stellungnahmen → each file, named only where the
 * name is certainly an organisation (`classifySubmitter`, the Bund's rule).
 * Measured 22.10.2026 on 547 files of 100 drafts: 147 distinct names
 * published, every one an organisation; the 171 files withheld were
 * institutions too, except the one lawyer filing as a person — the error
 * stays on the side that hides a name.
 */
export function parseSalzburgStatements(html: string, pageUrl: string): LandStatement[] {
  const out: LandStatement[] = []
  for (const [, href, label] of html.matchAll(ATTACHMENT_RE)) {
    const url = safeExternalUrl(new URL(href!, pageUrl).href)
    if (!url) continue
    const c = classifySubmitter(submitterOfFile(text(label!)))
    out.push({ name: c.kind === 'organisation' ? c.name : null, url })
  }
  return out
}
