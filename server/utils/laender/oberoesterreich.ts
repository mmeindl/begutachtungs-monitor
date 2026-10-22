/**
 * Oberösterreich's drafts in Begutachtung (22.10.2026).
 *
 * TWO KINDS, two systems:
 *
 *  - GESETZE stand on a CMS list (`35987.htm`; the closed ones on
 *    `187347.htm`, back to 2020) whose links lead into the Landtag's
 *    information system, one page per `jahr` + `nummer`. That page lives on
 *    for good and carries the whole path: Kurzinformation, the draft and its
 *    Textgegenüberstellung, every Stellungnahme dated and named, then the
 *    Regierungsvorlage, the Landtag's steps and in the end the LGBl. Its
 *    links carry a SessionID; the page answers without one, so the monitor
 *    drops it and keeps a stable address.
 *  - VERORDNUNGEN stand on a plain CMS page (`35986.htm`), grouped by
 *    Direktion, as PDFs with their Erläuterungen and plans nested below. No
 *    detail page and no number of their own: the CMS's link id is the key,
 *    and the monitor's page lives while the Land lists the draft. The Land
 *    keeps them listed for years (one from 2020 on 22.10.2026).
 *
 * Both lists keep expired entries; whether a Frist runs is decided per
 * request (`withLandActiveOn`).
 *
 * THE GATE. No stated counts: each page is held to its own heading, every
 * entry to a link and a Frist, and the detail page to its overview block. A
 * page that fails is refused (`LandSourceError`), and Oberösterreich reads
 * as „nicht abrufbar", never as „keine Begutachtung offen".
 */
import type { LandConsultation, LandDocument, LandLandtag, LandProcedureStep, LandStage, LandStatement } from '#shared/types'
import { safeExternalUrl } from '#shared/utils/safeExternalUrl'
import { lgblEliUrl } from '#shared/utils/citations'
import { decodeEntities } from '../parliament/htmlText'
import { classifySubmitter } from '../parliament/privacy'
import { LandSourceError } from './gate'

const SITE = 'https://www.land-oberoesterreich.gv.at/'
const LIS = 'https://www2.land-oberoesterreich.gv.at/internetltgbeilagen/'

export const OOE_GESETZE = `${SITE}35987.htm`
export const OOE_GESETZE_ARCHIV = `${SITE}187347.htm`
export const OOE_VERORDNUNGEN = `${SITE}35986.htm`

/** The Landtag's page of one draft, without the SessionID its links carry. */
export function ooeDetailUrl(jahr: string, nummer: string): string {
  return `${LIS}InternetLtgBeilagenAnzeige2020.jsp?jahr=${jahr}&nummer=${nummer}`
}

/** The Land's form for a Stellungnahme, as the detail page's button posts it. */
export function ooeFormUrl(jahr: string, nummer: string): string {
  return `${SITE}lisng.htm#/lisweb/${jahr}/${nummer}`
}

export const OOE_GESETZ_ID_RE = /^(20\d{2})-(\d{1,6})$/
export const OOE_VERORDNUNG_ID_RE = /^v(\d{1,9})$/

const MONTHS: Record<string, string> = {
  jänner: '01', januar: '01', februar: '02', märz: '03', april: '04', mai: '05', juni: '06',
  juli: '07', august: '08', september: '09', oktober: '10', november: '11', dezember: '12',
}

function text(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').replace(/\s+([.,)])/g, '$1').replace(/\(\s+/g, '(').trim()
}

function isoOf(d: string, m: string, y: string): string | null {
  const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  const date = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(iso) ? iso : null
}

/** „Begutachtungsfrist: 9. November 2026" → `2026-11-09`. */
export function ooeFristOf(html: string): string | null {
  const m = /Begutachtungsfrist:\s*(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]+)\s+(\d{4})/.exec(text(html))
  const month = m ? MONTHS[m[2]!.toLowerCase()] : undefined
  return m && month ? isoOf(m[1]!, month, m[3]!) : null
}

/** „09.10.2026" → `2026-10-09`. */
function isoOfDotted(s: string | undefined): string | null {
  const m = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(s ?? '')
  return m ? isoOf(m[1]!, m[2]!, m[3]!) : null
}

const ITEM_RE = /<li class="link-[^"]*"[^>]*>([\s\S]*?)<\/li>/g

/**
 * The Gesetze list, or its archive → every entry with its Landtag number and
 * Frist. `requireHeading` is the page's own h1; the archive has another.
 */
export function parseOoeGesetze(html: string, requireHeading: RegExp): LandConsultation[] {
  if (!requireHeading.test(html)) throw new LandSourceError('ooe', 'Gesetzesliste ohne ihre Überschrift')
  const out: LandConsultation[] = []
  for (const [, item] of html.matchAll(ITEM_RE)) {
    const href = decodeEntities(/href="([^"]+)"/.exec(item!)?.[1] ?? '')
    const jahr = /[?&]jahr=(\d{4})/.exec(href)?.[1]
    const nummer = /[?&]nummer=(\d+)/.exec(href)?.[1]
    if (!jahr || !nummer) continue // a link to the LIS start page, not a draft
    const title = text(/<span class="ooe-ueberschrift-link">([\s\S]*?)<\/span>/.exec(item!)?.[1] ?? '')
    const deadline = ooeFristOf(item!)
    if (!title || !deadline) throw new LandSourceError('ooe', `Gesetzentwurf ${jahr}/${nummer} ohne ${title ? 'Frist' : 'Titel'}`)
    const url = ooeDetailUrl(jahr, nummer)
    out.push({ id: `ooe-${jahr}-${nummer}`, land: 'ooe', kind: 'gesetz', title, startedAt: null, deadline, url, documents: [], active: false })
  }
  if (!out.length) throw new LandSourceError('ooe', 'Gesetzesliste ohne Eintrag')
  return out
}

/**
 * The Verordnungen page → one draft per entry with a Frist; the entries
 * nested below it (Erläuterungen, plans) are its further documents.
 */
export function parseOoeVerordnungen(html: string): LandConsultation[] {
  if (!/Begutachtungsentw(?:ü|&uuml;)rfe von Landesverordnungen/.test(html)) {
    throw new LandSourceError('ooe', 'Verordnungsseite ohne ihre Überschrift')
  }
  const out: LandConsultation[] = []
  const LINK_RE = /<li id="link_(\d+)">\s*<span class="stretched-link-box">\s*<a href="([^"]+)"[\s\S]*?<span class="ooe-ueberschrift-link">([\s\S]*?)<\/span>([\s\S]*?)<\/span>\s*(?=<ul>|<\/li>)/g
  for (const [, linkId, href, label, rest] of html.matchAll(LINK_RE)) {
    const url = safeExternalUrl(new URL(decodeEntities(href!), SITE).href)
    const title = text(label!)
    if (!url || !title) throw new LandSourceError('ooe', `Verordnungseintrag ${linkId} ohne ${url ? 'Titel' : 'Dokument'}`)
    const deadline = ooeFristOf(rest!)
    if (deadline) {
      out.push({ id: `ooe-v${linkId}`, land: 'ooe', kind: 'verordnung', title, startedAt: null, deadline, url, documents: [{ title: 'Entwurf', url }], active: false })
    } else if (out.length) {
      out.at(-1)!.documents.push({ title, url })
    } else {
      throw new LandSourceError('ooe', `Verordnungsdokument ${linkId} ohne Entwurf davor`)
    }
  }
  if (!out.length) throw new LandSourceError('ooe', 'Verordnungsseite ohne Eintrag')
  return out
}

export interface OoeDetail {
  title: string
  summary: string[] | null
  startedAt: string | null
  documents: LandDocument[]
  statements: LandStatement[]
  procedure: LandProcedureStep[]
  /** The form is offered only while the Land takes Stellungnahmen. */
  formOpen: boolean
}

/** A link's text without the size note: „Rechnungshof Österreich  (PDF-Dokument 161 KB)". */
function linkLabel(html: string): string {
  return text(html).replace(/\s*\((?:PDF|DOC|DOCX)-Dokument[^)]*\)\s*$/i, '').trim()
}

function lisUrl(href: string): string | null {
  return safeExternalUrl(new URL(decodeEntities(href).replace(/#page=$/, ''), LIS).href)
}

/**
 * What the Landtag's system answers for a number it cannot load — an unknown
 * one, and plausibly also its own outage. The caller tells them apart by
 * whether the Land's lists know the number.
 */
const NOT_LOADED_RE = /Informationen zur Landtagsbeilage konnten nicht geladen werden/

/** The Landtag's page of one Gesetz draft; null when it says it could not load it. */
export function parseOoeDetail(html: string): OoeDetail | null {
  if (NOT_LOADED_RE.test(html)) return null
  if (!html.includes('id="uebersicht"') || !/Langtitel:/.test(html)) {
    throw new LandSourceError('ooe', 'Landtagsseite ohne Übersicht')
  }
  const title = text(/Langtitel:[\s\S]*?<div class="col-sm-10">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? '')
  const info = /Kurzinformation:<\/strong><\/span><br>([\s\S]*?)<\/p>\s*(?:<form|<\/div>)/.exec(html)?.[1] ?? ''
  const points = [...info.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => text(m[1]!).replace(/[;.]$/, '')).filter(Boolean)
  const lead = text(info.replace(/<ul>[\s\S]*<\/ul>/, ''))
  const summary = points.length ? points : lead ? [lead] : null

  const section = (id: string) => {
    const at = html.indexOf(`id="${id}"`)
    if (at < 0) return ''
    const end = html.indexOf('</ul>', at)
    return html.slice(at, end > 0 ? end : undefined)
  }
  const entries = (id: string) => [...section(id).matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => {
    const block = m[1]!
    const date = isoOfDotted(/class="[^"]*datum[^"]*">([^<]*)/.exec(block)?.[1])
    const links = [...block.matchAll(/href='([^']+)'[^>]*>([\s\S]*?)<\/a>/g)].map((l) => ({
      url: lisUrl(l[1]!),
      label: linkLabel(l[2]!),
      // „(PDF-Dokument 0,32 KB)": a cover stub, its text is in the Beilage after it.
      stub: /\(PDF-Dokument 0,\d+ KB\)/.test(text(l[2]!)),
    }))
    const body = text(block.replace(/<span[^>]*datum[^>]*>[^<]*<\/span>/, ''))
    return { date, links, body }
  })

  const documents: LandDocument[] = []
  const statements: LandStatement[] = []
  for (const e of entries('vorher')) {
    if (/^Stellungnahme\b/.test(e.body)) {
      const first = e.links[0]
      const target = first?.stub ? (e.links[1] ?? first) : first
      if (!first || !target?.url) continue
      // The submitter is the first link's text; the second is only „Beilage 1".
      const c = classifySubmitter(first.label)
      statements.push({ name: c.kind === 'organisation' ? c.name : null, url: target.url, date: e.date })
    } else {
      for (const l of e.links) if (l.url) documents.push({ title: l.label || 'Dokument', url: l.url, date: e.date })
    }
  }
  const steps: LandProcedureStep[] = entries('verfahren').map((e) => {
    const label = e.body.replace(/\s*\((?:PDF|DOC|DOCX)-Dokument[^)]*\)/gi, '').trim()
    const link = e.links[0]
    // The link covers only the end („… XXIX. GP" + „Wortprotokolle des Oö.
    // Landtags"): said, so the page does not link the whole sentence.
    const linkText = link?.label && label.length > link.label.length && label.endsWith(link.label) ? link.label : undefined
    return { date: e.date, label, url: link?.url ?? null, ...(linkText ? { linkText } : {}) }
  }).filter((s) => s.label)
  const stationAt = ooeStationSteps(steps)
  const procedure = steps.map((s, i) => {
    const station = (Object.keys(stationAt) as LandStage['station'][]).find((k) => stationAt[k] === i)
    return station ? { ...s, station } : s
  })

  return {
    title,
    summary,
    startedAt: documents[0]?.date ?? null,
    documents,
    statements,
    procedure,
    formOpen: /value="Stellungnahme einbringen"/.test(html),
  }
}

/**
 * Which step of the Landtag's record stands for which station (22.10.2026).
 *
 * Measured over all 91 drafts on the Land's lists that day: the record
 * writes the three steps that matter in one form each — „Einlangen
 * Regierungsvorlage" (75), „Antrag angenommen – einstimmig / mehrstimmig"
 * (66), „Kundmachung im Landesgesetzblatt LGBl. Nr. 45/2026" (83, 18 of them
 * typed „LGBI" with a capital I). The last one of each form counts.
 * Anything else in the record (sittings, committees, motions) is the way,
 * not a station.
 *
 * One matcher for two readers: the stage (`ooeStageOf`) and the page, whose
 * bar lands each row on its step (`LandProcedureStep.station`).
 */
const OOE_STATION_STEP: Record<LandStage['station'], RegExp> = {
  rv: /^Einlangen Regierungsvorlage\b/,
  parlament: /^Antrag angenommen\b/,
  bgbl: /Kundmachung im Landesgesetzblatt/,
}

export function ooeStationSteps(procedure: readonly LandProcedureStep[]): Partial<Record<LandStage['station'], number>> {
  const at: Partial<Record<LandStage['station'], number>> = {}
  for (const [station, re] of Object.entries(OOE_STATION_STEP) as [LandStage['station'], RegExp][]) {
    const i = procedure.findLastIndex((s) => re.test(s.label))
    if (i >= 0) at[station] = i
  }
  return at
}

/**
 * The Landtag's handling of the Vorlage, from its record (22.10.2026) — for
 * the frame „Im Landtag", as „Im Parlament" gives Parliament's.
 *
 * Measured over the 90 readable drafts on the Land's lists that day, each in
 * one form: „Zuweisung an <Ausschuss>" (89), „Ausschussbericht Beilage
 * n/yyyy" (73), „Antrag angenommen - <vote>" (82), „Abänderungsantrag" /
 * „Zusatzantrag Beilage n/yyyy <vote>" (12), „Einsetzung eines
 * Unterausschusses" (12). The last of each counts, as for the stations.
 * Votes stay in the record's words — split votes name provisions and
 * clubs, and any reading of ours would be a claim.
 */
export function ooeLandtagOf(procedure: readonly LandProcedureStep[]): LandLandtag | null {
  if (!procedure.length) return null
  const last = (re: RegExp) => procedure.findLast((s) => re.test(s.label)) ?? null
  const committee = /^Zuweisung an (.+)$/.exec(last(/^Zuweisung an /)?.label ?? '')?.[1]?.trim() ?? null
  const decided = last(/^Antrag angenommen\b/)
  const vote = decided ? decided.label.replace(/^Antrag angenommen\s*[-–]?\s*/, '').trim() || null : null
  return {
    committee,
    subcommittee: procedure.some((s) => /^Einsetzung eines Unterausschusses\b/.test(s.label)),
    report: last(/^Ausschussbericht\b/),
    motions: procedure.filter((s) => /^(?:Abänderungsantrag|Zusatzantrag)\b/.test(s.label)),
    decision: decided ? { date: decided.date, vote } : null,
  }
}

/** The station a draft reached: the furthest one the record holds a step for. */
export function ooeStageOf(procedure: readonly LandProcedureStep[]): LandStage | null {
  const at = ooeStationSteps(procedure)
  const stepOf = (station: LandStage['station']) => {
    const i = at[station]
    return i === undefined ? undefined : procedure[i]
  }
  const lgbl = stepOf('bgbl')
  if (lgbl) {
    const nr = /LGB[lI]\.?\s*Nr\.\s*(\d+\/\d{4})/.exec(lgbl.label)?.[1]
    const detail = nr ? `LGBl. Nr. ${nr}` : null
    return { station: 'bgbl', label: 'Kundgemacht', detail, date: lgbl.date, url: detail ? lgblEliUrl('OB', detail) : null }
  }
  const decided = stepOf('parlament')
  if (decided) {
    const how = /angenommen\s*-\s*(einstimmig|mehrstimmig)/.exec(decided.label)?.[1]
    return { station: 'parlament', label: 'Im Landtag beschlossen', detail: how ?? null, date: decided.date }
  }
  const rv = stepOf('rv')
  if (rv) {
    return { station: 'rv', label: 'Regierungsvorlage', detail: rv.date ? `eingelangt am ${rv.date.split('-').reverse().join('.')}` : null, date: rv.date }
  }
  return null
}
