/**
 * Vorarlberg's drafts in Begutachtung (30.10.2026).
 *
 * ONE hand-kept page of the Land's site (Liferay), „Aktuelle
 * Begutachtungsentwürfe/Stellungnahmemöglichkeit": under „Derzeit sind
 * folgende Begutachtungsverfahren zu einem Gesetzesentwurf im Gange" one
 * block per draft — the title as a heading, the „Begutachtungsentwurf", the
 * „Erläuternde Bemerkungen" and the „Kunsttext", and „Ende der
 * Begutachtungsfrist: 10. November 2026".
 *
 * WHAT IS MISSING: Verordnungen — the page is the Gesetze's — and anything
 * past the Frist. A draft leaves the page when its Begutachtung ends, and the
 * monitor with it (`VBG_RETENTION`). The start the Land names nowhere, and
 * no Stellungnahmen on this page (`VBG_STATEMENTS_GAP`).
 *
 * The „Kunsttext" is the Land's Textgegenüberstellung: one column, the law
 * in force with the draft's changes marked in it — its own first line reads
 * „Textgegenüberstellung (Kunsttext)". It is listed under that name, so the
 * page says the Land published one and the monitor does not read its form.
 *
 * THE NUMBER is the id of the draft's folder in the Land's document library,
 * `/documents/302033/34682067/…` → `34682067`: every document of a draft
 * lies in one folder of its own.
 *
 * THE GATE: the page must carry its heading; each block a Frist and a
 * document. One that fails makes Vorarlberg „nicht abrufbar".
 */
import type { LandConsultation, LandDocument } from '#shared/types'
import { safeExternalUrl } from '#shared/utils/safeExternalUrl'
import { decodeEntities } from '../parliament/htmlText'
import { landDate } from './draftKind'
import { LandSourceError } from './gate'

const ORIGIN = 'https://vorarlberg.at'
export const VBG_LIST = `${ORIGIN}/-/aktuelle-begutachtungsverfahren`

/** The Land's form for a Stellungnahme, linked under every draft. */
export const VBG_FORM = `${ORIGIN}/-/stellungnahme-begutachtungsentwurf`

export const VBG_NUMBER_RE = /^\d{4,10}$/

export const VBG_RETENTION = 'Das Land Vorarlberg zeigt einen Entwurf nur, solange seine Begutachtung läuft.'

export const VBG_STATEMENTS_GAP = 'Auf seiner Seite der laufenden Begutachtungen veröffentlicht das Land keine Stellungnahmen.'

function text(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

const FOLDER_RE = /^\/documents\/\d+\/(\d+)\//

/** The page → every draft on it, running or — should the Land leave one standing — closed. */
export function parseVbgList(html: string): LandConsultation[] {
  const start = html.indexOf('Begutachtungsverfahren zu einem Gesetzesentwurf')
  if (start < 0) throw new LandSourceError('vbg', 'Überschrift der Begutachtungen fehlt')
  // The blocks end where the article does; the page's „Downloads" repeat the documents.
  const end = html.indexOf('class="contacts', start)
  const body = html.slice(start, end > 0 ? end : undefined)
  const out: LandConsultation[] = []
  for (const block of body.split(/<h4>/).slice(1)) {
    const title = text(block.slice(0, block.indexOf('</h4>')))
    const fristText = /Ende der Begutachtungsfrist:\s*(?:<[^>]+>\s*)*([^<]+)</.exec(block)?.[1]
    const deadline = fristText ? landDate(decodeEntities(fristText).replace(/\u00a0/g, ' ')) : null
    const documents: LandDocument[] = []
    let folder: string | null = null
    for (const [, href, label] of block.matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
      const path = decodeEntities(href!)
      const id = FOLDER_RE.exec(path)?.[1]
      if (!id) continue
      folder ??= id
      const url = safeExternalUrl(new URL(path, ORIGIN).href)
      const name = text(label!)
      if (url && name) documents.push({ title: /^Kunsttext$/i.test(name) ? 'Textgegenüberstellung (Kunsttext)' : name, url })
    }
    if (!title || !deadline || !folder) throw new LandSourceError('vbg', `Eintrag nicht lesbar: ${title || '?'}`)
    out.push({
      id: `vbg-${folder}`,
      land: 'vbg',
      kind: 'gesetz',
      title,
      startedAt: null,
      deadline,
      url: VBG_LIST,
      documents,
      active: false,
    })
  }
  return out
}
