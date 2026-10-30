/**
 * Steiermark's drafts in Begutachtung (30.10.2026).
 *
 * Not on the Land's site but in its Landtag's: Art 68 L-VG has the
 * Stellungnahmen published, and the Landesregierung files each draft it
 * sends out in PALLAST, the Landtag's document system (JSF), as a
 * „Begutachtungsverfahren (§ 24 GeoLT iVm Art 68 L-VG)". Per draft a page,
 * `document?ref=<uuid>`: the Geschäftszahl, the department, „eingebracht am"
 * — the day the Begutachtung began — the Frist, and the Beilagen: the cover
 * letter, the draft, its Erläuterungen, the Textgegenüberstellung and every
 * Stellungnahme, named „Stellungnahme Industriellenvereinigung Steiermark".
 *
 * EACH LANDTAG PERIOD IS A SYSTEM OF ITS OWN on the same host — XIX. GP
 * (since 18.12.2024) at `/pallast-p/`, XVIII. at `/pallast-18-p/`, XVII. at
 * `/pallast-17-p/` — with the same pages (`STMK_PERIODS`). The monitor reads
 * these three, back to June 2015, where RIS's Landesgesetzblatt begins too;
 * XVI. and older answer with other markup (measured 30.10.2026).
 *
 * WHAT IS MISSING: anything before June 2015, and Verordnungen, which the
 * Landtag does not receive. The Begutachtung's page
 * links nothing after it — no Vorlage, no Beschluss; the Kundmachung comes
 * from the monitor's own search (`matchLgbl`).
 *
 * THE DOCUMENTS have no address: each is the answer to a postback of the
 * page. They are linked, and read, as Tirol's are — the page with the
 * document's name after `#dok=` (`laender/session.ts`). A Stellungnahme is
 * linked by its place on the page, never by its name, which would carry the
 * name of a submitter the monitor shows „Ohne Namen" into the link
 * (`tirolStatementUrl`, 25.10.2026).
 *
 * THE NUMBER is the page's UUID, for a closed period with the period's
 * number before it: `18-2bfe7e22-…` (`stmkNumber`).
 *
 * THE LIST pages ten at a time by ajax; a postback with a larger page asks
 * for more (`stmkRowsPostback`) — but only a page size the table offers
 * (5 … 100): asked for 48 rows, PALLAST answers with a broken fragment and
 * no rows at all (30.10.2026). Measured that day: 38 drafts.
 *
 * THE GATE: the list must name its count and answer with as many rows; a
 * draft page must carry the Begutachtung's heading — any other document of
 * the Landtag is no draft (404).
 */
import type { LandConsultation, LandDocument, LandStatement } from '#shared/types'
import { decodeEntities } from '../parliament/htmlText'
import { classifySubmitter } from '../parliament/privacy'
import type { UpstreamPolicy } from '../upstream/fetch'
import { draftKindOfTitle, landDate } from './draftKind'
import { LandSourceError } from './gate'
import { LandSession, SitePacer, documentLink, documentLinkParts, pageForms, postbackDocument, type Postback } from './session'

export const STMK_ORIGIN = 'https://pallast2.stmk.gv.at'

/**
 * Every request to PALLAST, from every session in this process: one a
 * second, and two hours of silence after a 403 (`SitePacer`).
 */
export const STMK_PACER = new SitePacer(1_000, 2 * 60 * 60 * 1000)

/** One Landtag period's PALLAST: `key` prefixes its drafts' numbers — none for the current one. */
export interface StmkPeriod {
  key: string
  gp: string
  base: string
}

/** The periods read, the current first (see the module's head). */
export const STMK_PERIODS: readonly StmkPeriod[] = [
  { key: '', gp: 'XIX', base: `${STMK_ORIGIN}/pallast-p` },
  { key: '18', gp: 'XVIII', base: `${STMK_ORIGIN}/pallast-18-p` },
  { key: '17', gp: 'XVII', base: `${STMK_ORIGIN}/pallast-17-p` },
]
const CURRENT = STMK_PERIODS[0]!

export function stmkListUrl(period: StmkPeriod = CURRENT): string {
  return `${period.base}/pub/documents?type=BEGUTACHTUNGSVERFAHREN&sort=tssubmit&order=desc`
}
export const STMK_LIST = stmkListUrl()

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
export const STMK_NUMBER_RE = new RegExp(`^(?:(${STMK_PERIODS.filter((p) => p.key).map((p) => p.key).join('|')})-)?(${UUID})$`)

/** A draft's number: its UUID, after its period's key where that is a closed one. */
export function stmkNumber(ref: string, period: StmkPeriod = CURRENT): string {
  return period.key ? `${period.key}-${ref}` : ref
}

/** A number → its period and UUID; null for none. */
export function stmkPartsOf(number: string): { period: StmkPeriod; ref: string } | null {
  const m = STMK_NUMBER_RE.exec(number)
  if (!m) return null
  return { period: STMK_PERIODS.find((p) => p.key === (m[1] ?? ''))!, ref: m[2]! }
}

export function stmkDraftUrl(ref: string, period: StmkPeriod = CURRENT): string {
  return `${period.base}/pub/document?ref=${ref}`
}

function text(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

const TABLE = 'contentForm:documentsTable'

/** The list's rows: each draft's `ref` and title, in the list's order (newest first). */
export function parseStmkRows(html: string): { ref: string; title: string }[] {
  const out: { ref: string; title: string }[] = []
  const seen = new Set<string>()
  for (const [, ref, label] of html.matchAll(/<a href="[^"]*[?&](?:amp;)?ref=([0-9a-f-]{36})[^"]*"[^>]*>([\s\S]*?)<\/a>/g)) {
    if (seen.has(ref!)) continue
    seen.add(ref!)
    out.push({ ref: ref!, title: text(label!) })
  }
  return out
}

/** How many drafts the list says it holds. */
export function stmkRowCount(html: string): number {
  const count = /rowCount:(\d+)/.exec(html)?.[1]
  if (count === undefined) throw new LandSourceError('stmk', 'Liste ohne Trefferzahl')
  return Number(count)
}

/** The page sizes the list offers, smallest first — the only ones its postback accepts. */
export function stmkPageSizes(html: string): number[] {
  const select = /<select\b[^>]*\sname="contentForm:documentsTable_rppDD"[^>]*>([\s\S]*?)<\/select>/.exec(html)?.[1] ?? ''
  const sizes = [...select.matchAll(/<option\b[^>]*\svalue="(\d+)"/g)].map((m) => Number(m[1])).sort((a, b) => a - b)
  if (!sizes.length) throw new LandSourceError('stmk', 'Liste ohne Seitengrößen')
  return sizes
}

/**
 * The postback that asks the list for `rows` rows from row `first`: the
 * whole search form, as the browser sends it, with the table's paging
 * fields — the table answers with its rows only (a partial response).
 */
export function stmkRowsPostback(html: string, first: number, rows: number): { action: string; form: URLSearchParams; headers: Record<string, string> } {
  const form = pageForms(html).find((f) => f.name === 'contentForm')
  if (!form) throw new LandSourceError('stmk', 'Suchformular fehlt')
  const fields = new URLSearchParams()
  for (const [input] of form.body.matchAll(/<input\b[^>]*>/g)) {
    const name = /\sname="([^"]*)"/.exec(input)?.[1]
    const type = /\stype="([^"]*)"/.exec(input)?.[1] ?? 'text'
    if (!name || type === 'submit' || type === 'button' || ((type === 'checkbox' || type === 'radio') && !/\schecked/.test(input))) continue
    fields.append(decodeEntities(name), decodeEntities(/\svalue="([^"]*)"/.exec(input)?.[1] ?? ''))
  }
  // The selects' chosen options, as the browser sends them — the document type among them.
  for (const [, name, options] of form.body.matchAll(/<select\b[^>]*\sname="([^"]*)"[^>]*>([\s\S]*?)<\/select>/g)) {
    const chosen = /<option\b(?=[^>]*\sselected)[^>]*\svalue="([^"]*)"/.exec(options!)?.[1]
    if (chosen !== undefined) fields.append(decodeEntities(name!), decodeEntities(chosen))
  }
  for (const [k, v] of Object.entries({
    'javax.faces.partial.ajax': 'true',
    'javax.faces.source': TABLE,
    'javax.faces.partial.execute': TABLE,
    'javax.faces.partial.render': TABLE,
    [`${TABLE}_pagination`]: 'true',
    [`${TABLE}_first`]: String(first),
    [`${TABLE}_rows`]: String(rows),
    [`${TABLE}_skipChildren`]: 'true',
    [`${TABLE}_encodeFeature`]: 'true',
  })) fields.set(k, v)
  return { action: form.action, form: fields, headers: { 'Faces-Request': 'partial/ajax', 'X-Requested-With': 'XMLHttpRequest' } }
}

export interface StmkDraft {
  draft: LandConsultation
  statements: LandStatement[]
}

/** The Beilagen of a draft's page, in its order: the command links of the side form. */
function beilagen(html: string): string[] {
  const form = pageForms(html).find((f) => f.name === 'sidebarRightForm')
  return [...(form?.body ?? '').matchAll(/<a href="#" onclick="[^"]*mojarra\.jsfcljs[^"]*" class="piwik_download">([^<]+)<\/a>/g)].map((m) => text(m[1]!))
}

const STATEMENT_RE = /^Stellungnahmen?\b\s*(?:der\s+|des\s+|von\s+)?/i

/** A draft's page → the draft, its documents and its Stellungnahmen; null for a Landtag document that is no Begutachtung. */
export function parseStmkDraftPage(html: string, ref: string, period: StmkPeriod = CURRENT): StmkDraft | null {
  if (!/<h2>\s*Begutachtungsverfahren \(§ 24 GeoLT/.test(html)) return null
  const field = (label: string) => {
    const m = new RegExp(`<b>${label}:?\\s*</b>([\\s\\S]*?)</div>`).exec(html)
    return m ? text(m[1]!) : null
  }
  const title = text(/<b>Betreff:<\/b><\/div>\s*<div class="text"><b><i>([\s\S]*?)<\/i><\/b><\/div>/.exec(html)?.[1] ?? '')
  const startedAt = landDate(/eingebracht am (\d{2}\.\d{2}\.\d{4})/.exec(html)?.[1] ?? '')
  const fristText = field('Frist')
  const deadline = fristText ? landDate(fristText) : null
  if (!title) throw new LandSourceError('stmk', `Begutachtung ohne Betreff: ${ref}`)
  const url = stmkDraftUrl(ref, period)
  const documents: LandDocument[] = []
  const statements: LandStatement[] = []
  for (const label of beilagen(html)) {
    if (STATEMENT_RE.test(label)) {
      const c = classifySubmitter(label.replace(STATEMENT_RE, ''))
      statements.push({ name: c.kind === 'organisation' ? c.name : null, url: `${url}#stellungnahme-${statements.length + 1}` })
    } else {
      documents.push({ title: label, url: documentLink(url, label) })
    }
  }
  return {
    draft: {
      id: `stmk-${stmkNumber(ref, period)}`,
      land: 'stmk',
      kind: draftKindOfTitle(title),
      title,
      startedAt,
      deadline,
      url,
      documents,
      active: false,
    },
    statements,
  }
}

/** The page's link to a Beilage: a Mojarra command link of the side form, its text the Beilage's name. */
function stmkPostback(html: string, label: string): Postback | null {
  const form = pageForms(html).find((f) => f.name === 'sidebarRightForm')
  if (!form) return null
  for (const [, param, name] of form.body.matchAll(/<a href="#" onclick="[^"]*mojarra\.jsfcljs\(document\.getElementById\(\\'sidebarRightForm\\'\),\{\\'([^\\]+)\\'[^"]*" class="piwik_download">([^<]+)<\/a>/g)) {
    if (text(name!) === label) return { form, param: param! }
  }
  return null
}

const DOC_POLICY: UpstreamPolicy = { timeoutMs: 30_000, retries: 1, maxBytes: 30 * 1024 * 1024 }

export function isStmkDocumentUrl(url: string): boolean {
  const parts = documentLinkParts(url)
  return !!parts && STMK_PERIODS.some((p) => parts.page.startsWith(`${p.base}/pub/document?ref=`))
}

/** One Beilage of a draft, by its name — a session of its own per call. */
export function stmkDocumentBytes(url: string): Promise<Uint8Array> {
  if (!isStmkDocumentUrl(url)) throw new Error('Steiermark: keine Dokumentadresse')
  return postbackDocument(new LandSession(STMK_ORIGIN, DOC_POLICY, STMK_PACER), url, stmkPostback)
}
