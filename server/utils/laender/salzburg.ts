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
import { lgblWords } from './lgblSearch'

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
/* „X - Anlage I", „X - TGÜ", „X - Plan": an annex, titled like its draft and what it is. */
const ANNEX_RE = /^(.*?)\s+-\s+((?:Anlage|Anhang|Beilage|Textgegenüberstellung|TGÜ|Erläuterung\p{L}*|(?:Lage)?[Pp]lan|Pläne|Planmappe|Übersichtskarte)(?![\p{L}\p{N}]).*)$/u
/* „X - Entwurf", „X - Text und Anlage 1": the draft itself, filed with a suffix. */
const MAIN_RE = /^(.*?)\s+-\s+(Entwurf|Text und Anlage(?!\p{L}).*)$/u
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
 * Entries → drafts: one draft, one row, however many entries the Land files
 * it under.
 *
 * An entry belongs to an earlier one when its title IS that title plus a
 * separator („ - ", „-", „; ", „ (") and an addition: „… geändert wird -
 * TGÜ", „… - Lageplan", „…; Plan", „… - Anlage 2 Blatt 3". Structural, not
 * a list of words alone, because the Land's words do not end — measured
 * over the register on 22.10.2026, 139 entries stood as drafts of their own
 * with Plan, Lageplan, TGÜ, Übersichtskarte, Planmappe, Gutachten, a
 * misspelt „Textgegenüerstellung" and more (docs/architecture.md §12.43).
 * A bare space is no separator: „… geändert wird und das Y …" would be
 * another law.
 *
 * And it must be filed with it: within a month, or — where the addition
 * names a kind of document — within a year (the Land filed the TGÜs of
 * 2015 in one batch in November, up to seven months late). The same
 * measurement found a dozen later DRAFTS whose titles extend an older one:
 * „… Kehrtarifs – Valorisierung 2025", „… Teilhabe - 2022", „(Maßnahmengebiet
 * Strobl 2025 bis 2033)", a 2020 draft „… (inkl. Textgegenüberstellung)"
 * twelve years after its namesake. Each is a Begutachtung of its own.
 *
 * It joins the draft with the longest such title, and among equal titles
 * the one with the highest number below its own — the same title returns
 * over the years („… Mindestsicherungsgesetz geändert wird" several times).
 *
 * An annex whose draft is not filed at all („X - Anlage 1", „X - Anlage 2
 * Blatt 1" … and no „X") becomes ONE row titled X, its documents the
 * annexes; an „X" filed within the month joins that row, first, and gives it
 * its number. So does an annex filed BEFORE its draft („X - Plan", then „X":
 * 7654, 34471, 34472). The twelve-entry Verordnung that was read as such
 * (31228) has its „X" — spelt „Riedelwaldplatte" where the annexes write
 * „Riedelwald-platte" (31215): titles that differ only in spacing and
 * punctuation are one (`letters`).
 *
 * Three more of the Land's habits, read over the register on 23.10.2026,
 * where one draft stood as two rows — the newest a running draft whose
 * Textgegenüberstellung had a page of its own:
 *  - The draft itself carries a suffix: „X - Entwurf", then „X -
 *    Erläuterungen" (29477, 32075), „X - Text und Anlage 1" (7517). It is
 *    the row X, its document named by the suffix.
 *  - The annex names the draft another way: „Verordnung, mit der die
 *    Grundversorgungs-Verordnung geändert wird - Textgegenüberstellung" for
 *    „Verordnung der Landesregierung, mit der …" (35594), „Wohnbauförderungs-
 *    gesetz" without „Salzburger", „Naturschutzgesetz 1998" for 1999, a law
 *    left out of a long list. Such an annex joins the draft the Land filed
 *    just before it — at most `ADJACENT_NUMBERS` apart, within the month —
 *    where every distinctive word of its title stands in the draft's
 *    (`lgblWords`): two drafts filed together differ in at least one.
 *  - A Textgegenüberstellung filed long after its draft, numbered right
 *    after it: 18171 and 18182, dated 2017 for drafts of 2015 and 2016. The
 *    number says they were filed together; the year limit does not apply.
 */
const ATTACHMENT_SEP_RE = /^(?:\s*[-–;]\s*|\s+\()(.+?)\)?\s*$/
/** An addition that names a kind of document, not a year or a name. */
const DOCUMENT_KIND_RE = /^(?:inkl\.\s*)?(?:\S*plan\S*|\S*pläne|\S*karten?\b|TGÜ|Text\s*gegen\S*|Gegenüberstellung|Anlage|Anhang|Beilage|Erläuterung|Gutachten|Abgrenzung|Planungsgebiet)/i
const SAME_FILING_DAYS = 31
const LATE_DOCUMENT_DAYS = 365
/** How far apart in the Land's numbering two entries filed together may be. */
const ADJACENT_NUMBERS = 2

/**
 * The same title but for spacing and punctuation: „Riedelwaldplatte" and
 * „Riedelwald-platte" (31215 and its eleven annexes, 13 numbers apart).
 */
const letters = (title: string) => title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

/** Every distinctive word of the annex's title stands in the draft's (`lgblWords`: no template, no years). */
function namesSameDraft(annexBase: string, draftTitle: string): boolean {
  const words = lgblWords(annexBase)
  if (!words.size) return false
  const own = lgblWords(draftTitle)
  for (const w of words) if (!own.has(w)) return false
  return true
}

export function salzburgDrafts(entries: RawEntry[], kind: LandDraftKind): LandConsultation[] {
  const drafts: LandConsultation[] = []
  /* Drafts born of an annex, still without their main document. */
  const awaitingMain = new Set<LandConsultation>()
  const numberOf = (url: string) => Number(documentNumber(url) ?? Number.NaN)
  const dateOf = (x: { startedAt?: string | null; deadline?: string | null }) => x.startedAt ?? x.deadline ?? null
  const daysApart = (a: string | null, b: string | null) =>
    a && b ? Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000 : 0

  const toDraft = (entry: RawEntry, title: string, doc: LandDocument): LandConsultation => ({
    id: `sbg-${documentNumber(entry.url) ?? entry.url}`,
    land: 'sbg',
    kind,
    title,
    startedAt: entry.startedAt ?? null,
    deadline: entry.deadline ?? null,
    url: entry.url,
    documents: [doc],
    active: false,
  })

  /* The draft an entry extends, and what it adds. `adjacent`: the draft the
     entry right before it in the Land's numbering went into. */
  const ownerOf = (entry: RawEntry, own: number, adjacent: LandConsultation | null): { draft: LandConsultation; addition: string } | null => {
    const { title } = entry
    let best: { draft: LandConsultation; addition: string } | null = null
    for (const d of drafts) {
      if (!(numberOf(d.url) < own) || !title.startsWith(d.title) || title.length === d.title.length) continue
      const addition = ATTACHMENT_SEP_RE.exec(title.slice(d.title.length))?.[1]
      if (!addition) continue
      const apart = daysApart(dateOf(d), dateOf(entry))
      if (apart > SAME_FILING_DAYS && !(DOCUMENT_KIND_RE.test(addition) && (apart <= LATE_DOCUMENT_DAYS || d === adjacent))) continue
      if (!best || d.title.length > best.draft.title.length ||
        (d.title.length === best.draft.title.length && numberOf(d.url) > numberOf(best.draft.url))) {
        best = { draft: d, addition }
      }
    }
    return best
  }

  /* The draft itself, filed after its annexes: first among them, and the
     row takes its number — the address it had before the annexes were
     folded, which links in circulation point to. */
  /* Each title's letters once: the lookups below compare against every draft. */
  const lettersOf = new Map<string, string>()
  const lettersFor = (title: string) => {
    let value = lettersOf.get(title)
    if (value === undefined) lettersOf.set(title, value = letters(title))
    return value
  }
  const awaiting = (title: string, entry: RawEntry) =>
    [...awaitingMain].find((d) => lettersFor(d.title) === lettersFor(title) && daysApart(dateOf(d), dateOf(entry)) <= SAME_FILING_DAYS)
  /* The draft an annex names in the same letters, filed before it within the
     month — the latest such. */
  const spelledAlike = (base: string, own: number, entry: RawEntry) => {
    const want = lettersFor(base)
    let best: LandConsultation | null = null
    for (const d of drafts) {
      if (numberOf(d.url) < own && lettersFor(d.title) === want && daysApart(dateOf(d), dateOf(entry)) <= SAME_FILING_DAYS &&
        (!best || numberOf(d.url) > numberOf(best.url))) best = d
    }
    return best
  }
  const asMain = (row: LandConsultation, entry: RawEntry, docTitle: string) => {
    row.documents.unshift({ title: docTitle, url: entry.url })
    row.url = entry.url
    row.id = `sbg-${documentNumber(entry.url) ?? entry.url}`
    awaitingMain.delete(row)
    return row
  }

  /** Where one entry goes; returns the draft it is now part of. */
  const place = (entry: RawEntry, own: number, adjacent: LandConsultation | null): LandConsultation => {
    const main = MAIN_RE.exec(entry.title)
    const waitingForSuffixed = main ? awaiting(main[1]!, entry) : undefined
    if (main && waitingForSuffixed) return asMain(waitingForSuffixed, entry, main[2]!)
    const owner = ownerOf(entry, own, adjacent)
    if (owner) {
      owner.draft.documents.push({ title: owner.addition, url: entry.url })
      return owner.draft
    }
    const waiting = awaiting(entry.title, entry)
    if (waiting) return asMain(waiting, entry, 'Entwurf')
    const annex = ANNEX_RE.exec(entry.title)
    if (annex && adjacent && daysApart(dateOf(adjacent), dateOf(entry)) <= SAME_FILING_DAYS && namesSameDraft(annex[1]!, adjacent.title)) {
      adjacent.documents.push({ title: annex[2]!, url: entry.url })
      return adjacent
    }
    const alike = annex ? spelledAlike(annex[1]!, own, entry) : null
    if (annex && alike) {
      alike.documents.push({ title: annex[2]!, url: entry.url })
      return alike
    }
    if (annex) {
      const draft = toDraft(entry, annex[1]!, { title: annex[2]!, url: entry.url })
      drafts.push(draft)
      awaitingMain.add(draft)
      return draft
    }
    const draft = main
      ? toDraft(entry, main[1]!, { title: main[2]!, url: entry.url })
      : toDraft(entry, entry.title, { title: 'Entwurf', url: entry.url })
    drafts.push(draft)
    return draft
  }

  // In the Land's order of filing: an annex comes after what it extends.
  let previous: { draft: LandConsultation; number: number } | null = null
  for (const entry of [...entries].sort((x, y) => numberOf(x.url) - numberOf(y.url))) {
    const own = numberOf(entry.url)
    const adjacent: LandConsultation | null = previous && own - previous.number <= ADJACENT_NUMBERS ? previous.draft : null
    previous = { draft: place(entry, own, adjacent), number: own }
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
