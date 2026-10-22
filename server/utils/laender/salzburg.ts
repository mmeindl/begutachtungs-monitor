/**
 * Salzburg's drafts in Begutachtung (22.10.2026).
 *
 * Two server-rendered lists on the Land's publication service, one for
 * Gesetzesentwürfe and one for Verordnungsentwürfe. An entry is a title, a
 * link to one PDF (`/pub/get/<n>`, numbered upwards) and „Ende der
 * Begutachtungsfrist: TT.MM.JJJJ". No start date, no Geschäftszahl.
 *
 * THE GATE. The page states its own size („10 Einträge"), and that number is
 * what the parse is held to: a page whose stated count differs from the
 * entries read, an entry without a document or a Frist, or a page without
 * the count at all is refused (`LandSourceError`), and the Land then reads
 * as „nicht abrufbar". A maintenance page served with HTTP 200 must never
 * read as „keine Begutachtung offen" — that is the silent failure this
 * whole design is built against.
 *
 * ANNEXES. A Verordnung's annexes stand as entries of their own, titled
 * like the draft plus „ - Anlage I". They are folded into the draft as
 * further documents, so one draft is one row.
 */
import type { LandConsultation, LandDocument, LandDraftKind } from '#shared/types'
import { safeExternalUrl } from '#shared/utils/safeExternalUrl'
import { decodeEntities } from '../parliament/htmlText'
import { LandSourceError } from './gate'

export const SALZBURG_LISTS: Record<LandDraftKind, string> = {
  gesetz: 'https://service.salzburg.gv.at/pub/list/gesetz_entw/landesrecht-list',
  verordnung: 'https://service.salzburg.gv.at/pub/list/verord_entw/landesrecht-list',
}

const ENTRY_RE = /<li class="margin-bottom-big">([\s\S]*?)<\/li>/g
const LINK_RE = /<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/
const FRIST_RE = /Ende der Begutachtungsfrist:\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/
const COUNT_RE = /(\d+|Keine)\s+Eintr(?:ag|äge)\b/i
const ANNEX_RE = /^(.*?)\s+-\s+(Anlage\b.*)$/

function text(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function isoOf(d: string, m: string, y: string): string | null {
  const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  const date = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(iso) ? iso : null
}

interface RawEntry {
  title: string
  url: string
  deadline: string
}

/**
 * One list page → its entries, or `LandSourceError` when the page is not
 * the list it should be. Pure: the fixtures in `tests/` are real pages.
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

/** The Land's number for a document, from `/pub/get/<n>`. */
function documentId(url: string): string {
  return /\/get\/(\d+)/.exec(url)?.[1] ?? url
}

/**
 * Entries → drafts: an annex joins the draft whose title it extends, when
 * that draft is on the same list with the same Frist; otherwise it stays a
 * row of its own rather than vanish.
 */
export function salzburgDrafts(entries: RawEntry[], kind: LandDraftKind): LandConsultation[] {
  const drafts: LandConsultation[] = []
  const byTitle = new Map<string, LandConsultation>()
  const annexes: { base: string; doc: LandDocument; entry: RawEntry }[] = []

  for (const entry of entries) {
    const annex = ANNEX_RE.exec(entry.title)
    if (annex) {
      annexes.push({ base: annex[1]!, doc: { title: annex[2]!, url: entry.url }, entry })
      continue
    }
    const draft: LandConsultation = {
      id: `sbg-${documentId(entry.url)}`,
      land: 'sbg',
      kind,
      title: entry.title,
      deadline: entry.deadline,
      url: entry.url,
      documents: [{ title: 'Entwurf', url: entry.url }],
      active: false,
    }
    drafts.push(draft)
    byTitle.set(entry.title, draft)
  }
  for (const { base, doc, entry } of annexes) {
    const draft = byTitle.get(base)
    if (draft && draft.deadline === entry.deadline) draft.documents.push(doc)
    else drafts.push(...salzburgDrafts([{ ...entry, title: entry.title.replace(ANNEX_RE, '$1 ($2)') }], kind))
  }
  return drafts
}
