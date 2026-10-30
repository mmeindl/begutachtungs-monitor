/**
 * Niederösterreich's drafts in Begutachtung (30.10.2026).
 *
 * The Land's page „Bürgerbegutachtung" lists every running draft, Gesetze
 * and Verordnungen together, as „bis 2026-11-05: Verordnung über die
 * Naturschutzgebiete, Änderung", each linking a page of its own with the
 * Frist again, where Stellungnahmen go, and the documents — the draft, its
 * Erläuterungen and, for most, a Textgegenüberstellung.
 *
 * WHAT IS MISSING — and why the monitor shows a Niederösterreich draft only
 * while its Begutachtung runs: the Land keeps no archive. A draft leaves the
 * list when its Frist ends, and the monitor with it (`NOE_RETENTION`). The
 * start of a Begutachtung the Land names nowhere. The Stellungnahmen it
 * publishes on its Landtag's site, at the Gegenstand the draft becomes,
 * which its own page does not link (`NOE_STATEMENTS_GAP`). On 22.10.2026 the
 * page was offline („aus sicherheitstechnischen Gründen"); read again and
 * measured on 30.10.2026.
 *
 * THE NUMBER is the name of the draft's page, `NOe_KJHG_Aenderung1` — the
 * one stable thing the Land gives it.
 *
 * THE GATE: the list page must carry its heading and its list; a draft page
 * must carry its title and „Bürgerbegutachtung bis …" — any other page of
 * the Land's site under the same path is no draft (404, never a page).
 */
import type { LandConsultation, LandDocument } from '#shared/types'
import { safeExternalUrl } from '#shared/utils/safeExternalUrl'
import { decodeEntities } from '../parliament/htmlText'
import { draftKindOfTitle, landDate } from './draftKind'
import { LandSourceError } from './gate'

const ORIGIN = 'https://www.noe.gv.at'
const DIR = `${ORIGIN}/noe/Kontakt-Landesverwaltung/`
export const NOE_LIST = `${DIR}Buergerbegutachtung.html`

/** Where Stellungnahmen go, where a draft's page names no address. */
export const NOE_FILING_EMAIL = 'post.begutachtung@noel.gv.at'

/** A page name as the Land writes them: letters, digits, `_`, `-`, `.` and brackets. */
export const NOE_NUMBER_RE = /^[A-Za-z0-9][A-Za-z0-9_().-]{2,119}$/

export const NOE_RETENTION = 'Das Land Niederösterreich zeigt einen Entwurf nur, solange seine Begutachtung läuft.'

export const NOE_STATEMENTS_GAP = 'Das Land veröffentlicht die Stellungnahmen auf der Website des NÖ Landtags, beim Gegenstand, zu dem der Entwurf dort wird. Die Seite des Landes verknüpft den Entwurf nicht mit diesem Gegenstand; deshalb zeigt der Monitor sie hier nicht.'

export function noeDraftUrl(number: string): string {
  return `${DIR}${number}.html`
}

function text(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

/** The list → the running drafts, without their documents (their own pages hold them). */
export function parseNoeList(html: string): LandConsultation[] {
  if (!/<h1>Bürgerbegutachtung<\/h1>/.test(html) || !html.includes('class="listpage"')) {
    throw new LandSourceError('noe', 'Liste der Bürgerbegutachtungen fehlt')
  }
  const out: LandConsultation[] = []
  for (const [, href, body] of html.matchAll(/<a href="\/noe\/Kontakt-Landesverwaltung\/([^"/]+)\.html" class="article-link">([\s\S]*?)<\/a>/g)) {
    const heading = text(/<span class="art-h">([\s\S]*?)<\/span>/.exec(body!)?.[1] ?? '')
    // „Allgemeine Informationen – Bürgerbegutachtung" stands in the list too, without a Frist.
    const m = /^bis (\d{4}-\d{2}-\d{2}):\s*(.+)$/.exec(heading)
    if (!m) continue
    const number = decodeEntities(href!)
    const deadline = landDate(m[1]!)
    if (!deadline || !NOE_NUMBER_RE.test(number)) throw new LandSourceError('noe', `Eintrag nicht lesbar: ${heading}`)
    out.push({
      id: `noe-${number}`,
      land: 'noe',
      kind: draftKindOfTitle(m[2]!),
      title: m[2]!,
      startedAt: null,
      deadline,
      url: noeDraftUrl(number),
      documents: [],
      active: false,
    })
  }
  return out
}

export interface NoeDraftPage {
  title: string
  deadline: string
  documents: LandDocument[]
  email: string | null
}

/**
 * A draft's page → its title, Frist, documents and address; null for a page
 * that is no draft. „Download: Entwurf - NÖ Kinder- und Jugendhilfegesetz
 * (NÖ KJHG), Änderung (pdf, 0.1 MB)" is titled „Entwurf": the draft's name
 * after the dash is the page's, the size the Land's link text.
 */
export function parseNoeDraftPage(html: string, pageUrl: string): NoeDraftPage | null {
  const title = text(/<h1 id="after-sidenav">([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? '')
  const fristText = /Bürgerbegutachtung bis ([\d.]+)/.exec(html)?.[1]
  const deadline = fristText ? landDate(fristText) : null
  if (!title || !deadline) return null
  const documents: LandDocument[] = []
  const list = /<ul class="documents">([\s\S]*?)<\/ul>/.exec(html)?.[1] ?? ''
  for (const [, href, label] of list.matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const url = safeExternalUrl(new URL(decodeEntities(href!), pageUrl).href)
    const name = text(label!).replace(/^Download:\s*/, '').replace(/\s*\([a-z]+,\s*[\d.,]+\s*[KMG]?B\)$/i, '')
    const short = name.endsWith(` - ${title}`) ? name.slice(0, -(title.length + 3)) : name
    if (url && short) documents.push({ title: short, url })
  }
  const email = /href="mailto:([^"?]+)"/.exec(html.slice(html.indexOf('after-sidenav'), html.indexOf('contact-box') > 0 ? html.indexOf('contact-box') : undefined))?.[1] ?? null
  return { title, deadline, documents, email }
}
