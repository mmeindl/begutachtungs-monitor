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
 * WHAT IS MISSING: Verordnungen — the page is the Gesetze's; whether the Land
 * publishes Verordnungsentwürfe elsewhere is not checked — and anything past
 * the Frist. A draft leaves this page when its Begutachtung ends, and the
 * monitor with it (`VBG_RETENTION`). The Land does not drop it: it keeps a
 * page per Gesetzesvorhaben („Laufende und kürzlich abgeschlossene
 * Gesetzesvorhaben") with the draft, the „Externe Stellungnahmen", the
 * Regierungsvorlage, the Gesetzesbeschluss and the Landesgesetzblatt, which
 * the monitor does not read yet (docs/research/datenlage-pruefung.md,
 * 14.11.2026). The start the Land names nowhere, and no Stellungnahmen on
 * this page (`VBG_STATEMENTS_GAP`).
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

/**
 * The page the Land links under every draft for a Stellungnahme. It is not
 * the form: it links on to it, one form for every draft, on the Land's form
 * server (`parseVbgFormUrl`).
 */
export const VBG_FORM = `${ORIGIN}/-/stellungnahme-begutachtungsentwurf`

const FORM_HOST = 'formulare.vorarlberg.gv.at'

/**
 * The form itself, read off `VBG_FORM`'s „Online-Formulare" (15.11.2026):
 * the door lands in the form, not one page before it (`docs/decisions.md`,
 * „A door lands in the form"). Read, not written down: the address carries
 * the form server's ids (`pid`, `pn`), which the Land can change unannounced.
 * Null when the page links none — the door then stays on `VBG_FORM`, one
 * click short, never dead.
 *
 * The host is checked here, exactly, and not added to `UPSTREAM_HOSTS`: the
 * server never fetches the form, so the list of what it may be pointed at
 * stays as it is (the EUR-Lex precedent in `safeExternalUrl.ts`).
 */
export function parseVbgFormUrl(html: string): string | null {
  for (const [, href] of html.matchAll(/<a href="([^"]+)"/g)) {
    let url: URL
    try {
      url = new URL(decodeEntities(href!))
    } catch {
      continue
    }
    if (url.protocol === 'https:' && url.hostname === FORM_HOST && url.pathname.startsWith('/formularserver/')) return url.href
  }
  return null
}

export const VBG_NUMBER_RE = /^\d{4,10}$/

export const VBG_RETENTION = 'Die Seite der laufenden Begutachtungen, die der Monitor liest, zeigt einen Entwurf nur bis zum Ende seiner Frist; danach führt ihn das Land Vorarlberg auf der Seite des Gesetzesvorhabens weiter, die der Monitor noch nicht liest.'

export const VBG_STATEMENTS_GAP = 'Auf seiner Seite der laufenden Begutachtungen veröffentlicht das Land keine Stellungnahmen. Es veröffentlicht sie auf der Seite des Gesetzesvorhabens, die der Monitor noch nicht liest.'

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
  // An empty heading under a title (`<h4>&nbsp;</h4>`, 06.11.2026) would split one entry in two.
  const body = html.slice(start, end > 0 ? end : undefined).replace(/<h4>(?:\s|&nbsp;)*<\/h4>/g, '')
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
