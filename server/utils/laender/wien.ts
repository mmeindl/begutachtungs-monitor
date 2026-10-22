/**
 * Wien's drafts in Begutachtung (22.10.2026).
 *
 * ONE hand-maintained page (`/recht/landesrecht-wien/begutachtung/`), in
 * ISO-8859-1, with two sections: „Laufende" and „Abgelaufene
 * Begutachtungsverfahren". Wien keeps a draft there „bis zum Beschluss des
 * Landtages bzw. maximal 1 Jahr", then it is gone — from Wien's site and so
 * from the monitor's, which answers 410 with that sentence (`isWienNumber`).
 * Per entry: the title, „Auflagefrist: TT.MM.JJJJ bis TT.MM.JJJJ" (start
 * AND end, unlike Salzburg's list), one or more versions („Stand"), the
 * address of the Magistratsabteilung that takes Stellungnahmen, and — once
 * there are some — a link to them on `stellungnahmen.htm#<number>`.
 *
 * The number is the first PDF's name, `2026009`: year and sequence, which
 * is what lets a page for a number Wien no longer lists say why.
 *
 * Withdrawn entries stay in the source as HTML comments; they are stripped
 * before anything is read.
 *
 * THE GATE. No stated count; the page is held to its two section headings,
 * and every entry to a Frist, a numbered PDF and an address. One that fails
 * makes Wien „nicht abrufbar", never „keine Begutachtung offen".
 */
import type { LandConsultation, LandDocument, LandDraftKind, LandStatement } from '#shared/types'
import { safeExternalUrl } from '#shared/utils/safeExternalUrl'
import { decodeEntities } from '../parliament/htmlText'
import { classifySubmitter } from '../parliament/privacy'
import { LandSourceError } from './gate'

export const WIEN_LIST = 'https://www.wien.gv.at/recht/landesrecht-wien/begutachtung/'
export const WIEN_STATEMENTS = `${WIEN_LIST}stellungnahmen.htm`

/** A Wien draft number: year and three-digit sequence. */
export const WIEN_NUMBER_RE = /^(20\d{2})(\d{3})$/

const SECTION_RUNNING = 'Laufende Begutachtungsverfahren'
const SECTION_ENDED = 'Abgelaufene Begutachtungsverfahren'
const ENTRY_START_RE = /<li>((?:(?!<li>|<ul>)[\s\S])*?)<ul>\s*<li>\s*Auflagefrist:/g
const FRIST_RE = /Auflagefrist:\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*bis\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/
const PDF_RE = /href="(pdf\/(\d{7})[^"]*\.pdf)"/g
const STAND_RE = /Stand:\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/
const RECIPIENT_RE = /Stellungnahme an (?:die |den |das )?([^:<]+?):\s*<a href=["']?mailto:([^"'\s>]+)/
const END_RE = /<h2>Eingebrachte Gesetzesentw/

function text(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function isoOf(d: string, m: string, y: string): string | null {
  const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  const date = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(iso) ? iso : null
}

/** The page's bytes as text: Wien declares ISO-8859-1, whatever the header says. */
export function decodeWien(bytes: ArrayBuffer | Uint8Array): string {
  return new TextDecoder('windows-1252').decode(bytes)
}

export interface WienEntry {
  draft: LandConsultation
  recipient: string | null
  address: string
}

/** The page → every entry still on it, running and ended. */
export function parseWienList(html: string): WienEntry[] {
  const page = html.replace(/<!--[\s\S]*?-->/g, '')
  if (!page.includes(SECTION_RUNNING) || !page.includes(SECTION_ENDED)) {
    throw new LandSourceError('w', 'Seite ohne die Abschnitte „Laufend" und „Abgelaufen"')
  }
  const end = page.search(END_RE)
  const body = end > 0 ? page.slice(0, end) : page
  const starts = [...body.matchAll(ENTRY_START_RE)]
  const entries: WienEntry[] = []
  starts.forEach((m, i) => {
    const block = body.slice(m.index!, starts[i + 1]?.index ?? body.length)
    const title = text(m[1]!)
    const frist = FRIST_RE.exec(block)
    const startedAt = frist ? isoOf(frist[1]!, frist[2]!, frist[3]!) : null
    const deadline = frist ? isoOf(frist[4]!, frist[5]!, frist[6]!) : null
    const pdfs = [...block.matchAll(PDF_RE)]
    const recipient = RECIPIENT_RE.exec(block)
    if (!title || !startedAt || !deadline || !pdfs.length || !recipient) {
      throw new LandSourceError('w', `Eintrag „${title.slice(0, 40)}" ohne ${!deadline ? 'Frist' : !pdfs.length ? 'Dokument' : 'Adresse'}`)
    }
    /* Each „Stand" heads the PDFs below it; a single version has none. */
    const stands = [...block.matchAll(new RegExp(STAND_RE.source, 'g'))]
    const documents: LandDocument[] = pdfs.map((p) => {
      const stand = stands.filter((s) => s.index! < p.index!).at(-1)
      const date = stand ? isoOf(stand[1]!, stand[2]!, stand[3]!) : null
      return {
        title: stands.length > 1 && date ? `Entwurf, Stand ${date.split('-').reverse().join('.')}` : 'Entwurf',
        url: safeExternalUrl(new URL(p[1]!, WIEN_LIST).href)!,
        date,
      }
    })
    const number = pdfs[0]![2]!
    const kind: LandDraftKind = /^Verordnung\b/.test(title) ? 'verordnung' : 'gesetz'
    entries.push({
      draft: {
        id: `w-${number}`,
        land: 'w',
        kind,
        title,
        startedAt,
        deadline,
        // The newest version is what one reads.
        url: documents.at(-1)!.url,
        documents,
        active: false,
      },
      recipient: text(recipient[1]!) || null,
      address: recipient[2]!.trim(),
    })
  })
  if (!entries.length) throw new LandSourceError('w', 'kein Eintrag auf der Seite')
  return entries
}

/**
 * The Stellungnahmen page → those of one draft, under its anchor. Names are
 * the Land's own text here, not a file name; the same rule decides whether
 * the monitor prints them (`classifySubmitter`).
 */
export function parseWienStatements(html: string, number: string): LandStatement[] {
  const page = html.replace(/<!--[\s\S]*?-->/g, '')
  const at = page.indexOf(`name="${number}"`)
  if (at < 0) return []
  const next = page.indexOf('<a name="', at + 1)
  const block = page.slice(at, next > 0 ? next : undefined)
  const out: LandStatement[] = []
  for (const [, label, href] of block.matchAll(/<li>([^<]*?)\s*<a href="(pdf\/[^"]+\.pdf)"/g)) {
    const url = safeExternalUrl(new URL(href!, WIEN_LIST).href)
    if (!url) continue
    const raw = text(label!).replace(/^>\s*/, '').replace(/_/g, ' ')
    const c = classifySubmitter(raw)
    out.push({ name: c.kind === 'organisation' ? c.name : null, url })
  }
  return out
}
