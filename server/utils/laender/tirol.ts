/**
 * Tirol's drafts in Begutachtung (23.10.2026).
 *
 * TWO SYSTEMS, one object:
 *
 *  - The Land's list (`gesetzentwuerfe-in-begutachtung/`, TYPO3): per entry
 *    the title, „Fassung: 28. September 2026 - Begutachtungsfrist: 30.
 *    Oktober 2026", and a link into the Landtag's records,
 *    `risLink.xhtml?gn=722&gj=2026`. Expired entries stay on it for weeks;
 *    older ones go. There is no archive page.
 *  - The Landtagsevidenz (JSF): ONE Geschäftsgegenstand per draft, under the
 *    same number for its whole way. It opens as „Begutachtungsverfahren/
 *    Stellungnahmen" with the Begutachtungsentwurf, its Erläuternde
 *    Bemerkungen, its Textgegenüberstellung and every Stellungnahme named by
 *    its submitter; it becomes „Regierungsvorlage / Gesetzesvorlage" with
 *    the Vorlage's documents added, the committees' handling under
 *    „Behandlungen", „Annahme Ausschuss" and „Annahme Landtag" under
 *    „Erledigungen", and at the end „LGBl Nr. 39/2026" and the
 *    Kundmachungsdatum in its own fields. Measured on 135/2026 (TGADG): every
 *    station, the Land's own record.
 *
 * THE DOCUMENTS HAVE NO ADDRESS. Each is a form post in the page's session
 * („PrimeFaces.addSubmitParam(…)"), answered by a redirect to one servlet
 * that serves whatever the session last asked for. So a document's `url`
 * here is its Gegenstand's page with the document named in the fragment —
 * `risLink.xhtml?gn=722&gj=2026#dok=Begutachtungsentwurf%2FTextgegenüberstellung`
 * — which is where a reader lands to open it, and what `tirolDocumentBytes`
 * reads it from: a fresh session, the row whose label is that name (rows
 * move as the Vorlage's documents are added above them), the post, the
 * servlet.
 *
 * THE GATE. The list is held to its heading and every entry to a Landtag
 * link and a Frist; the Landtag's page to its „Allgemein" block with a GZ.
 * A page that fails is refused (`LandSourceError`), and Tirol reads as
 * „nicht abrufbar", never as „keine Begutachtung offen".
 */
import type { LandConsultation, LandDocument, LandLandtag, LandProcedureStep, LandStage, LandStatement } from '#shared/types'
import { lgblEliUrl } from '#shared/utils/citations'
import { safeExternalUrl } from '#shared/utils/safeExternalUrl'
import { decodeEntities } from '../parliament/htmlText'
import { classifySubmitter } from '../parliament/privacy'
import { USER_AGENT } from '../upstream/fetch'
import { LandSourceError } from './gate'

export const TIROL_LIST = 'https://www.tirol.gv.at/buergerservice/landesgesetze-verordnungen-und-richtlinien/gesetzentwuerfe-in-begutachtung/'
const LTE = 'https://lte.tirol.gv.at'

/** A Tirol draft number: the Landtag's year and number, „2026-722". */
export const TIROL_NUMBER_RE = /^(20\d{2})-(\d{1,5})$/

/** The Landtag's page of one Gegenstand: stable, and the one a reader can open. */
export function tirolRecordUrl(year: string, number: string): string {
  return `${LTE}/public/ggs/risLink.xhtml?gn=${number}&gj=${year}`
}

const MONTHS: Record<string, string> = {
  jänner: '01', januar: '01', februar: '02', märz: '03', april: '04', mai: '05', juni: '06',
  juli: '07', august: '08', september: '09', oktober: '10', november: '11', dezember: '12',
}

function text(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').replace(/\s+([.,:)])/g, '$1').trim()
}

function isoOf(d: string, m: string, y: string): string | null {
  const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  const date = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(iso) ? iso : null
}

function longDate(s: string | undefined): string | null {
  const m = /(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]+)\s+(\d{4})/.exec(s ?? '')
  const month = m ? MONTHS[m[2]!.toLowerCase()] : undefined
  return m && month ? isoOf(m[1]!, month, m[3]!) : null
}

function dottedDate(s: string | undefined): string | null {
  const m = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(s ?? '')
  return m ? isoOf(m[1]!, m[2]!, m[3]!) : null
}

/** The address a Stellungnahme goes to, as the list states it. */
export function tirolFilingEmail(html: string): string | null {
  return /Stellungnahmen können direkt an\s*<a href="mailto:([^"]+)"/.exec(html)?.[1]?.trim() ?? null
}

/**
 * The list → every entry on it, running or not. The start is the entry's
 * „Fassung" — the day the draft was sent out; the Landtag files it a day
 * later (Einbringerdatum).
 */
export function parseTirolList(html: string): LandConsultation[] {
  if (!/<h1>\s*Gesetzentwürfe in Begutachtung\s*<\/h1>/.test(html)) throw new LandSourceError('t', 'Liste ohne ihre Überschrift')
  const out: LandConsultation[] = []
  for (const [, item] of html.matchAll(/<li data-list-item-id="[^"]*">([\s\S]*?)<\/li>/g)) {
    const links = [...item!.matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({ href: decodeEntities(m[1]!), label: text(m[2]!) }))
    // Two links to the same record: the title, and the line with its dates.
    const record = links.find((l) => /risLink\.xhtml/.test(l.href))
    const gn = /[?&]gn=(\d+)/.exec(record?.href ?? '')?.[1]
    const gj = /[?&]gj=(20\d{2})/.exec(record?.href ?? '')?.[1]
    const dates = links.find((l) => /Begutachtungsfrist/.test(l.label))?.label ?? ''
    const title = links.find((l) => /risLink\.xhtml/.test(l.href) && !/Begutachtungsfrist/.test(l.label))?.label ?? ''
    const deadline = longDate(/Begutachtungsfrist:?\s*(.+)$/.exec(dates)?.[1])
    if (!gn || !gj || !title || !deadline) {
      throw new LandSourceError('t', `Eintrag „${title.slice(0, 40)}" ohne ${!gn || !gj ? 'Landtagsnummer' : 'Frist'}`)
    }
    const url = tirolRecordUrl(gj, gn)
    out.push({
      id: `t-${gj}-${gn}`,
      land: 't',
      kind: /^Verordnung\b/.test(title) ? 'verordnung' : 'gesetz',
      title,
      startedAt: longDate(/Fassung:?\s*(.+?)\s*-\s*Begutachtungsfrist/.exec(dates)?.[1]),
      deadline,
      url,
      documents: [],
      active: false,
    })
  }
  if (!out.length) throw new LandSourceError('t', 'Liste ohne Eintrag')
  return out
}

export interface TirolRecord {
  title: string
  /** „Begutachtungsverfahren/Stellungnahmen", „Regierungsvorlage / Gesetzesvorlage". */
  type: string
  gz: string
  /** The Einbringerdatum: the Begutachtung's start, once a Vorlage the Vorlage's. */
  filedAt: string | null
  kundmachungAt: string | null
  /** „LGBl. Nr. 39/2026" */
  lgbl: string | null
  documents: LandDocument[]
  statements: LandStatement[]
  procedure: LandProcedureStep[]
  landtag: LandLandtag | null
  stage: LandStage | null
}

/** Each of the page's tables by its heading: its rows' cells as text. */
function tables(html: string): Map<string, string[][]> {
  const out = new Map<string, string[][]>()
  const parts = html.split(/<h2[^>]*>/).slice(1)
  for (const part of parts) {
    const heading = text(part.slice(0, part.indexOf('</h2>')))
    const body = part.slice(part.indexOf('</h2>'))
    const tbody = /<tbody[^>]*>([\s\S]*?)<\/tbody>/.exec(body)?.[1] ?? ''
    const rows = [...tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
      .map((r) => [...r[1]!.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => text(c[1]!.replace(/<span[^>]*>(?:file_pdf|file_word|file_excel)<\/span>/g, ''))))
      .filter((cells) => !(cells.length === 1 && /^Keine Daten vorhanden!?$/.test(cells[0]!)))
    if (!out.has(heading)) out.set(heading, rows)
  }
  return out
}

/** The „Allgemein" block's fields: „GZ" → „722/2026". */
function fields(html: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of html.matchAll(/<label[^>]*>(?:\s|<span[^>]*><\/span>)*<div[^>]*>([^<]+)<\/div><\/label>\s*<span[^>]*>([\s\S]*?)<\/span>\s*<\/div>/g)) {
    out.set(text(m[1]!), text(m[2]!))
  }
  return out
}

/** A document of the Gegenstand, at its page with its name in the fragment (see the module's head). */
export function tirolDocumentUrl(recordUrl: string, label: string): string {
  return `${recordUrl}#dok=${encodeURIComponent(label)}`
}

/* The draft's documents, then the Vorlage's — titled as Kärnten's are (`kaernten.ts`), which the reasoning service reads. */
const DRAFT_DOC: [RegExp, string][] = [
  [/^Begutachtungsentwurf$/, 'Entwurf'],
  [/^Begutachtungsentwurf\/Erläuternde Bemerkungen$/, 'Erläuterungen'],
  [/^Begutachtungsentwurf\/Textgegenüberstellung$/, 'Textgegenüberstellung'],
  [/^Begutachtungsentwurf\/Leicht Lesen$/, 'Leicht Lesen'],
  [/^Regierungsvorlage$/, 'Regierungsvorlage'],
  [/^Regierungsvorlage\/Erläuternde Bemerkungen$/, 'Regierungsvorlage, Erläuterungen'],
]

/**
 * The Landtag's page of one Gegenstand → the draft's documents, its
 * Stellungnahmen, its way through the Landtag and the station it reached.
 */
export function parseTirolRecord(html: string, recordUrl: string): TirolRecord {
  const at = html.indexOf('id="contentwrapper"')
  // PrimeFaces sets a <script> inside each document's cell.
  const page = (at >= 0 ? html.slice(at) : html).replace(/<script\b[\s\S]*?<\/script>/g, '')
  const f = fields(page)
  const gz = f.get('GZ') ?? ''
  if (!/<h2[^>]*>\s*Allgemein\s*<\/h2>/.test(page) || !/^\d+\/20\d{2}$/.test(gz)) {
    throw new LandSourceError('t', 'Landtagsseite ohne Geschäftszahl')
  }
  const t = tables(page)
  const labels = (t.get('Dokumente') ?? []).map((r) => r[0] ?? '').filter(Boolean)
  const docUrl = (label: string) => tirolDocumentUrl(recordUrl, label)

  const documents: LandDocument[] = []
  for (const [re, title] of DRAFT_DOC) {
    const label = labels.find((l) => re.test(l))
    if (label) documents.push({ title, url: docUrl(label) })
  }
  const statements: LandStatement[] = labels.filter((l) => /^Stellungnahme\s+\S/.test(l)).map((l) => {
    const c = classifySubmitter(l.replace(/^Stellungnahme\s+/, ''))
    return { name: c.kind === 'organisation' ? c.name : null, url: docUrl(l) }
  })

  const type = f.get('Typ') ?? ''
  const filedAt = dottedDate(f.get('Einbringerdatum'))
  const kundmachungAt = dottedDate(f.get('Kundmachungsdatum'))
  const lgblNr = /(\d+\/20\d{2})/.exec(f.get('LGBl Nr.') ?? '')?.[1]
  const lgbl = lgblNr ? `LGBl. Nr. ${lgblNr}` : null
  const isVorlage = /^Regierungsvorlage\b/.test(type)

  const procedure: LandProcedureStep[] = []
  const vorlage = labels.find((l) => /^Regierungsvorlage$/.test(l))
  if (isVorlage) procedure.push({ date: filedAt, label: `Regierungsvorlage, GZ ${gz}, eingebracht`, url: vorlage ? docUrl(vorlage) : recordUrl, station: 'rv' })
  const erledigungen = (t.get('Erledigungen') ?? []).map(([date, art, sitting]) => ({ date: dottedDate(date), art: art ?? '', sitting: sitting ?? '' }))
  const plenary = erledigungen.findLast((e) => /^Annahme Landtag$/.test(e.art))
  for (const [date, sitting, decision] of t.get('Behandlungen') ?? []) {
    // A plenary sitting stands once per day it had the item on its agenda,
    // and without a word of what it did: the Erledigung below says that.
    if (!decision && sitting && (sitting === plenary?.sitting || procedure.some((s) => s.label === sitting))) continue
    const label = [sitting, decision].filter(Boolean).join(': ')
    if (label) procedure.push({ date: dottedDate(date), label, url: null })
  }
  const committee = erledigungen.findLast((e) => /^Annahme Ausschuss$/.test(e.art))
  const beschluss = labels.find((l) => /^Gesetz nach Beschlussfassung im Landtag\b/.test(l))
  if (plenary) procedure.push({ date: plenary.date, label: `Annahme im Landtag, ${plenary.sitting}`, url: beschluss ? docUrl(beschluss) : null, station: 'parlament' })
  if (lgbl) procedure.push({ date: kundmachungAt, label: `Kundmachung im Landesgesetzblatt ${lgbl}`, url: lgblEliUrl('TI', lgbl), station: 'bgbl' })
  procedure.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))

  let stage: LandStage | null = null
  if (lgbl) stage = { station: 'bgbl', label: 'Kundgemacht', detail: lgbl, date: kundmachungAt, url: lgblEliUrl('TI', lgbl) }
  else if (plenary) stage = { station: 'parlament', label: 'Im Landtag beschlossen', detail: null, date: plenary.date }
  else if (isVorlage) stage = { station: 'rv', label: 'Regierungsvorlage', detail: filedAt ? `eingebracht am ${filedAt.split('-').reverse().join('.')}` : null, date: filedAt }

  const landtag: LandLandtag | null = isVorlage
    ? {
        committee: /Sitzung des (.+?) am \d/.exec(committee?.sitting ?? '')?.[1]?.replace(/^Ausschusses/, 'Ausschuss').replace(/^Finanzausschusses/, 'Finanzausschuss') ?? null,
        subcommittee: false,
        report: null,
        motions: [],
        decision: plenary ? { date: plenary.date, vote: null } : null,
      }
    : null

  return { title: f.get('Betreff')?.replace(/^ein\s+/, '') ?? '', type, gz, filedAt, kundmachungAt, lgbl, documents, statements, procedure, landtag, stage }
}

/* ------------------------------------------------------------------ *
 * The documents (see the module's head)
 * ------------------------------------------------------------------ */

const DOC_TIMEOUT_MS = 30_000
const DOC_MAX_BYTES = 30 * 1024 * 1024

/** Whether a URL is a Tirol document in the form `tirolDocumentUrl` makes it. */
export function isTirolDocumentUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.origin === LTE && u.pathname === '/public/ggs/risLink.xhtml' && u.hash.startsWith('#dok=')
  } catch {
    return false
  }
}

function cookieOf(res: Response, jar: Map<string, string>) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(';')
    const eq = pair!.indexOf('=')
    if (eq > 0) jar.set(pair!.slice(0, eq).trim(), pair!.slice(eq + 1).trim())
  }
}

async function step(url: string, jar: Map<string, string>, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('user-agent', USER_AGENT)
  if (jar.size) headers.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '))
  const res = await fetch(url, { ...init, headers, redirect: 'manual', signal: AbortSignal.timeout(DOC_TIMEOUT_MS) })
  cookieOf(res, jar)
  return res
}

/** Follow redirects by hand — on the Landtag's host only — keeping the session. */
async function follow(url: string, jar: Map<string, string>, init: RequestInit = {}): Promise<{ res: Response; url: string }> {
  let current = url
  let res = await step(current, jar, init)
  for (let hops = 0; res.status >= 300 && res.status < 400 && hops < 5; hops++) {
    const next = new URL(res.headers.get('location') ?? '', current)
    if (next.origin !== LTE) throw new Error(`Tirol: Weiterleitung auf ${next.host}`)
    current = next.href
    res = await step(current, jar)
  }
  return { res, url: current }
}

/** One attribute's value in a tag, whatever the attributes' order. */
function attr(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]
}

/** One document of a Gegenstand, by its name — a session of its own per call. */
export async function tirolDocumentBytes(url: string): Promise<Uint8Array> {
  if (!isTirolDocumentUrl(url)) throw new Error('Tirol: keine Dokumentadresse')
  const u = new URL(url)
  const label = decodeURIComponent(u.hash.slice('#dok='.length))
  u.hash = ''
  const jar = new Map<string, string>()
  const { res: pageRes, url: pageUrl } = await follow(u.href, jar)
  if (!pageRes.ok) throw new Error(`Tirol: Landtagsseite ${pageRes.status}`)
  const html = (await pageRes.text()).replace(/<script\b[\s\S]*?<\/script>/g, '')
  const forms = [...html.matchAll(/(<form\b[^>]*>)([\s\S]*?)<\/form>/g)]
  for (const [, open, body] of forms) {
    const name = attr(open!, 'name')
    const action = attr(open!, 'action')
    if (!name || !action) continue
    for (const row of body!.matchAll(/<a\b[^>]*onclick="PrimeFaces\.addSubmitParam\('([^']+)',\{'([^']+)':'[^']+'\}\)[^"]*"[^>]*>([\s\S]*?)<\/a>/g)) {
      const rowLabel = text(row[3]!.replace(/<span[^>]*>(?:file_pdf|file_word|file_excel)<\/span>/g, ''))
      if (row[1] !== name || rowLabel !== label) continue
      const form = new URLSearchParams()
      for (const [input] of body!.matchAll(/<input\b[^>]*type="hidden"[^>]*>/g)) {
        const field = attr(input, 'name')
        if (field) form.set(decodeEntities(field), decodeEntities(attr(input, 'value') ?? ''))
      }
      form.set(row[2]!, row[2]!)
      const { res } = await follow(new URL(decodeEntities(action!), pageUrl).href, jar, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form,
      })
      if (!res.ok || !/application\/pdf/.test(res.headers.get('content-type') ?? '')) throw new Error(`Tirol: Dokument „${label}" ${res.status}`)
      const declared = Number(res.headers.get('content-length') ?? 0)
      if (declared > DOC_MAX_BYTES) throw new Error(`Tirol: Dokument „${label}" zu groß`)
      const bytes = new Uint8Array(await res.arrayBuffer())
      if (bytes.length > DOC_MAX_BYTES) throw new Error(`Tirol: Dokument „${label}" zu groß`)
      return bytes
    }
  }
  throw new Error(`Tirol: Dokument „${label}" nicht auf der Landtagsseite`)
}

/* ------------------------------------------------------------------ *
 * Verordnungen (24.10.2026)
 * ------------------------------------------------------------------ *
 *
 * Not on the Land's site: its page „Verordnungsentwürfe in Begutachtung"
 * sends the reader to the IFG-Informationsregister on data.gv.at, search
 * term „Verordnungsbegutachtungen Tirol". One dataset per draft, with the
 * draft, its Erläuterungen, the cover letter and the Stellungnahmen as
 * distributions (CC BY 4.0, `dokumente.tirol.gv.at`), the department that
 * takes Stellungnahmen as `contact_point`.
 *
 * Measured 23.10.2026: 174 datasets under the term — 16 of the
 * Landesregierung, 158 traffic ordinances of the Bezirkshauptmannschaften
 * (road works, speed limits), which are no drafts of Landesrecht and are
 * not read. THE REGISTER HAS NO FRIST: no field, and the dates in the
 * documents are as often the Verordnung's own deadlines („bis spätestens
 * 30. September 2029") as the Begutachtung's. So a draft here carries
 * `fristUnknown` and the date it entered the register, and no `deadline`
 * the monitor would have to guess.
 */

export const TIROL_VO_SEARCH = 'https://www.data.gv.at/api/hub/search/search'
const TIROL_VO_TERM = '"Verordnungsbegutachtungen Tirol"'
export const TIROL_VO_PAGE = 'https://www.tirol.gv.at/buergerservice/landesgesetze-verordnungen-und-richtlinien/verordnungsentwuerfe-in-begutachtung/'

/** The register's search, page by page (`page` from 0), newest first. */
export function tirolVoSearchUrl(page: number): string {
  const params = new URLSearchParams({ q: TIROL_VO_TERM, filter: 'dataset', limit: '50', page: String(page), sort: 'modified+desc' })
  return `${TIROL_VO_SEARCH}?${params}`
}

/** A Tirol Verordnung's number: the register's dataset id, `v` + 32 hex digits. */
export const TIROL_VO_NUMBER_RE = /^v[0-9a-f]{32}$/

export interface TirolVoDraft {
  draft: LandConsultation
  statements: LandStatement[]
  email: string | null
  /** The department, „Amt der Tiroler Landesregierung - Abteilung …". */
  recipient: string | null
}

/* eslint-disable @typescript-eslint/no-explicit-any -- the register's envelope */
/** One page of the register's answer → its total and its datasets. */
export function parseTirolVoSearch(json: any): { count: number; results: any[] } {
  const result = json?.result
  if (!result || !Array.isArray(result.results) || typeof result.count !== 'number') {
    throw new LandSourceError('t', 'Informationsregister ohne Trefferliste')
  }
  return { count: result.count, results: result.results }
}

/** „Stellungnahme Arbeiterkammer Tirol,   Änderung der …" → „Arbeiterkammer Tirol". */
function submitterOf(title: string): string {
  return title.replace(/^Stellungnahme\s+(?:de[rs]\s+)?/i, '').split(/\s*,\s*|\s+zu[rm]?\s+/)[0]!.trim()
}

/**
 * One dataset → a draft of the Landesregierung; null for anything else
 * (a Bezirkshauptmannschaft's ordinance, a dataset not tagged as a
 * Verordnungsbegutachtung, one without a document).
 */
export function tirolVoOf(x: any): TirolVoDraft | null {
  const tagged = Array.isArray(x?.keywords) && x.keywords.some((k: any) => k?.id === 'verordnungsbegutachtungen-tirol')
  const contact = x?.contact_point?.[0]
  const office = typeof contact?.name === 'string' ? contact.name.trim() : ''
  if (!tagged || !/^Amt der Tiroler Landesregierung\b/.test(office) || !/^[0-9a-f]{32}$/.test(String(x?.id))) return null
  const files = (Array.isArray(x.distributions) ? x.distributions : []).flatMap((d: any) => {
    const url = safeExternalUrl(d?.access_url?.[0])
    const title = typeof d?.title?.de === 'string' ? d.title.de.replace(/\s+/g, ' ').trim() : ''
    return url ? [{ title: title || 'Dokument', url }] : []
  }) as { title: string; url: string }[]
  const documents: LandDocument[] = files.filter((f) => !/^Stellungnahme\b/i.test(f.title))
  if (!documents.length) return null
  const statements: LandStatement[] = files.filter((f) => /^Stellungnahme\b/i.test(f.title)).map((f) => {
    const c = classifySubmitter(submitterOf(f.title))
    return { name: c.kind === 'organisation' ? c.name : null, url: f.url }
  })
  const raw = typeof x.title?.de === 'string' ? x.title.de.replace(/\s+/g, ' ').trim() : ''
  const title = raw.replace(/^Begutachtung\s+/i, '').replace(/[,;]?\s*(?:–\s*)?Begutachtung(?:sverfahren)?\s*$/i, '').trim() || raw
  const issued = /^(\d{4}-\d{2}-\d{2})/.exec(String(x.catalog_record?.issued ?? x.issued ?? ''))?.[1] ?? null
  const email = /^(?:mailto:)?([^\s@]+@[^\s@]+)$/.exec(String(contact?.email ?? ''))?.[1] ?? null
  return {
    draft: {
      id: `t-v${x.id}`,
      land: 't',
      kind: 'verordnung',
      title,
      // The day it entered the register: the day the public could read it.
      startedAt: issued,
      deadline: null,
      fristUnknown: true,
      url: `https://www.data.gv.at/katalog/datasets/${x.id}`,
      documents,
      active: false,
    },
    statements,
    email,
    recipient: office || null,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
