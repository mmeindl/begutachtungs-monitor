/**
 * Wien's drafts in Begutachtung (22.10.2026; the relaunched site since
 * 30.10.2026).
 *
 * ONE hand-maintained page, „Entwürfe von Wiener Landesgesetzen", with two
 * sections: „Laufende" and „Abgelaufene Begutachtungsverfahren". Wien keeps
 * a draft there „bis zum Beschluss des Landtages bzw. maximal 1 Jahr", then
 * it is gone — from Wien's site and so from the monitor's, which answers 410
 * with that sentence (`isWienNumber`). Per entry, a heading and a list: the
 * title, „Auflagefrist: TT.MM.JJJJ bis TT.MM.JJJJ" (start AND end, unlike
 * Salzburg's list), one or more versions („Entwurf, Stand …"), the address
 * of the Magistratsabteilung that takes Stellungnahmen, and — once there are
 * some — a link to them on the page of Stellungnahmen.
 *
 * The relaunch (noticed 30.10.2026) moved the page from
 * `/recht/landesrecht-wien/begutachtung/` — whose address now ends in a
 * 404 — and its PDFs to `/pdf/ma53/lgbl-entwurf/`, serves UTF-8 instead of
 * ISO-8859-1, anchors the Stellungnahmen by a name of the law instead of the
 * draft's number, and states CC BY 4.0 for the page. What Wien publishes and
 * how it numbers did not change.
 *
 * The number is the first PDF's name, `2026009`: year and sequence, which
 * is what lets a page for a number Wien no longer lists say why. Wien names
 * each Stellungnahme's file after it too (`2026003s1.pdf`), and that — not
 * the anchor — is how they are found (`parseWienStatements`).
 *
 * Withdrawn entries may stand in the source as HTML comments; they are
 * stripped before anything is read.
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

export const WIEN_LIST = 'https://www.wien.gv.at/recht/landesgesetze-entwuerfe'
export const WIEN_STATEMENTS = 'https://www.wien.gv.at/recht/landesgesetze-entwuerfe-stellungnahmen'

/** A Wien draft number: year and three-digit sequence. */
export const WIEN_NUMBER_RE = /^(20\d{2})(\d{3})$/

const SECTION_RUNNING = 'id="laufende-begutachtungsverfahren"'
const SECTION_ENDED = 'id="abgelaufene-begutachtungsverfahren"'
const FRIST_RE = /Auflagefrist:\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*bis\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/
/** A version of the draft: its PDF, and the „Stand" after the link where there are several. */
const PDF_RE = /<a\s+href="([^"]*\/lgbl-entwurf\/(\d{7})[^"/]*\.pdf)"[^>]*>[^<]*<\/a>(?:\s*,\s*Stand\s*(\d{1,2})\.(\d{1,2})\.(\d{4}))?/g
const RECIPIENT_RE = /Stellungnahme an (?:die |den |das )?([^:<]+?):\s*<a\s+href="mailto:([^"?]+)"/
const STATEMENTS_LINK_RE = /<a\s+href="([^"]*landesgesetze-entwuerfe-stellungnahmen[^"]*)"/
const END_RE = /<h2>Eingebrachte Gesetzesentw/

function text(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function isoOf(d: string, m: string, y: string): string | null {
  const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  const date = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(iso) ? iso : null
}

export interface WienEntry {
  draft: LandConsultation
  recipient: string | null
  address: string
  /** Wien's link to this draft's Stellungnahmen, once there are some. */
  statementsUrl: string | null
}

/** The page → every entry still on it, running and ended. */
export function parseWienList(html: string): WienEntry[] {
  const page = html.replace(/<!--[\s\S]*?-->/g, '')
  const start = page.indexOf(SECTION_RUNNING)
  if (start < 0 || !page.includes(SECTION_ENDED)) {
    throw new LandSourceError('w', 'Seite ohne die Abschnitte „Laufend" und „Abgelaufen"')
  }
  const end = page.slice(start).search(END_RE)
  const body = end > 0 ? page.slice(start, start + end) : page.slice(start)
  const entries: WienEntry[] = []
  for (const block of body.split(/<h4>/).slice(1)) {
    const title = text(block.slice(0, block.indexOf('</h4>')))
    const frist = FRIST_RE.exec(block)
    const startedAt = frist ? isoOf(frist[1]!, frist[2]!, frist[3]!) : null
    const deadline = frist ? isoOf(frist[4]!, frist[5]!, frist[6]!) : null
    const pdfs = [...block.matchAll(PDF_RE)]
    const recipient = RECIPIENT_RE.exec(block)
    if (!title || !startedAt || !deadline || !pdfs.length || !recipient) {
      throw new LandSourceError('w', `Eintrag „${title.slice(0, 40)}" ohne ${!deadline ? 'Frist' : !pdfs.length ? 'Dokument' : 'Adresse'}`)
    }
    const documents: LandDocument[] = pdfs.map((p) => {
      const date = p[3] ? isoOf(p[3], p[4]!, p[5]!) : null
      return {
        title: pdfs.length > 1 && date ? `Entwurf, Stand ${date.split('-').reverse().join('.')}` : 'Entwurf',
        url: safeExternalUrl(new URL(decodeEntities(p[1]!), WIEN_LIST).href)!,
        date,
      }
    })
    const number = pdfs[0]![2]!
    const kind: LandDraftKind = /^Verordnung\b/.test(title) ? 'verordnung' : 'gesetz'
    const statementsHref = STATEMENTS_LINK_RE.exec(block)?.[1]
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
      statementsUrl: statementsHref ? safeExternalUrl(new URL(decodeEntities(statementsHref), WIEN_LIST).href) : null,
    })
  }
  if (!entries.length) throw new LandSourceError('w', 'kein Eintrag auf der Seite')
  return entries
}

/**
 * The Stellungnahmen page → those of one draft: the files Wien names after
 * its number (`2026003s1.pdf`). Names are the Land's own link text here, not
 * a file name; the same rule decides whether the monitor prints them
 * (`classifySubmitter`).
 */
export function parseWienStatements(html: string, number: string): LandStatement[] {
  const page = html.replace(/<!--[\s\S]*?-->/g, '')
  const out: LandStatement[] = []
  const file = new RegExp(`<a\\s+href="([^"]*/lgbl-entwurf/${number}s\\d+\\.pdf)"[^>]*>([\\s\\S]*?)</a>`, 'g')
  for (const [, href, label] of page.matchAll(file)) {
    const url = safeExternalUrl(new URL(decodeEntities(href!), WIEN_STATEMENTS).href)
    if (!url) continue
    const raw = text(label!).replace(/^>\s*/, '').replace(/_/g, ' ')
    const c = classifySubmitter(raw)
    out.push({ name: c.kind === 'organisation' ? c.name : null, url })
  }
  return out
}
