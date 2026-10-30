/**
 * Burgenland's drafts in Begutachtung (30.10.2026).
 *
 * The Landesrecht application of the Land's Domino server (XPages), two
 * pages: „Aktuelle Begutachtungsentwürfe" — every running draft, Gesetze and
 * Verordnungen together — and „Abgeschlossene Begutachtungen", one view per
 * kind and year since 2007 (`?year=2026&typ=Gesetz`). Per draft, one panel:
 * the title, its documents as attachments, the end of the Frist — formatted
 * in English, „Nov 5, 2026" — and, once closed, the Stellungnahmen the Land
 * published, „Stellungnahme AK", each a file of its own.
 *
 * WHAT IS MISSING: the start of the Begutachtung. The Land names no date
 * but the Frist's end, and that end is what places a draft in a period
 * (`landDraftDate`). The archive keeps it, so every closed draft is placed.
 *
 * THE NUMBER is the document id of the draft's first attachment, 32 hex
 * digits: the Land gives a draft no number and no page of its own, and the
 * attachment is the same document on the running list and in the archive.
 * It also dates itself — a Notes document id carries the day it was created
 * (`bgldUnidYear`) — which only tells the reader of one draft which year of
 * the archive to open first; it is shown nowhere.
 *
 * PAGING: ten drafts a page, and the next page only by a postback of the
 * view's numbered pager link (`bgldNextPage`) — a session per chain of pages (`laender/session.ts`).
 * Measured 30.10.2026: 130 pages over 2007–2026, at most six per year.
 *
 * THE GATE: each page must carry its heading, and each panel a title and a
 * Frist; a page that fails makes Burgenland „nicht abrufbar".
 */
import type { LandConsultation, LandDocument, LandDraftKind, LandStatement } from '#shared/types'
import { safeExternalUrl } from '#shared/utils/safeExternalUrl'
import { decodeEntities } from '../parliament/htmlText'
import { classifySubmitter } from '../parliament/privacy'
import { draftKindOfTitle, landDate } from './draftKind'
import { LandSourceError } from './gate'
import { attr, hiddenInputs, pageForms } from './session'

export const BGLD_ORIGIN = 'https://apps.bgld.gv.at'
const BASE = `${BGLD_ORIGIN}/web/landesrecht.nsf`
export const BGLD_CURRENT = `${BASE}/begutachtungen_aktuell.xsp`
const ARCHIVE = `${BASE}/begutachtungen_abgeschlossen.xsp`

/** The first year the archive offers. */
export const BGLD_FIRST_YEAR = 2007

/** Where Stellungnahmen go: the Stabsabteilung Verfassung und Recht (`buergerbegutachtungen.xsp`). */
export const BGLD_FILING_EMAIL = 'post.vr@bgld.gv.at'

export const BGLD_NUMBER_RE = /^[0-9a-f]{32}$/

export function bgldArchiveUrl(year: number, kind: LandDraftKind): string {
  return `${ARCHIVE}?year=${year}&typ=${kind === 'gesetz' ? 'Gesetz' : 'Verordnung'}`
}

function text(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

const UNID_RE = /\/landesrecht\.nsf\/([0-9A-Fa-f]{32})\/fldFile\//

/**
 * The year a Notes document id was made in: its second half is a Notes
 * TIMEDATE, whose upper word holds the Julian day in its lower 24 bits.
 * `D2A48001B3DFEEB0C1258E8A0025530A` → 0x258E8A = 2.461.322 → 08.10.2026,
 * four weeks before that draft's Frist. Null where it reads as no plausible
 * year.
 */
export function bgldUnidYear(unid: string): number | null {
  if (!BGLD_NUMBER_RE.test(unid.toLowerCase())) return null
  const julianDay = parseInt(unid.slice(16, 24), 16) & 0xffffff
  const year = new Date((julianDay - 2440588) * 86_400_000).getUTCFullYear()
  return year >= 1990 && year <= 2100 ? year : null
}

/**
 * What Burgenland's labels abbreviate, where certain (30.10.2026). The Land
 * titles a Stellungnahme „Stellungnahme AK", and the Bund's rule
 * (`classifySubmitter`) names no abbreviation: 735 of 910 in the archive stood
 * „Ohne Namen", 207 of them „AK". Only an exact label whose meaning is
 * unambiguous is expanded — to the name it stood for, a ministry's of its
 * years; generic where the Land's own label does not say which branch
 * („AK" → „Arbeiterkammer"). Everything else keeps the rule's answer: unclear
 * abbreviations (VBNO, BURGEF, SV, VFG), bare place names — very likely the
 * Gemeinde, but that is an inference — and every surname. The expanded name
 * must still pass `classifySubmitter` — expansions it refused („Seniorenrat",
 * „Land&Forst Betriebe", „Die Grünen") were dropped rather than reworded to
 * pass. Reviewed label by label on that day's archive, old against new (docs/architecture.md §12.64):
 * named 175 → 672 of 910, none named before lost or changed, every newly
 * named one an organisation or a public body.
 */
const BGLD_SUBMITTERS: Readonly<Record<string, string>> = {
  AK: 'Arbeiterkammer',
  LK: 'Landwirtschaftskammer',
  LWK: 'Landwirtschaftskammer',
  WK: 'Wirtschaftskammer',
  'WK Bgld.': 'Wirtschaftskammer Burgenland',
  IV: 'Industriellenvereinigung',
  'IV Burgenland': 'Industriellenvereinigung Burgenland',
  BKA: 'Bundeskanzleramt',
  'BKA-VD': 'Bundeskanzleramt-Verfassungsdienst',
  'BKA VD': 'Bundeskanzleramt-Verfassungsdienst',
  'BKA-I/6': 'Bundeskanzleramt',
  'BKA II': 'Bundeskanzleramt',
  'BKA V': 'Bundeskanzleramt',
  'BKA Recht': 'Bundeskanzleramt',
  BMA: 'Bundesministerium für Arbeit',
  BMASGK: 'Bundesministerium für Arbeit, Soziales, Gesundheit und Konsumentenschutz',
  BMASGPK: 'Bundesministerium für Arbeit, Soziales, Gesundheit, Pflege und Konsumentenschutz',
  BMDW: 'Bundesministerium für Digitalisierung und Wirtschaftsstandort',
  BMF: 'Bundesministerium für Finanzen',
  BMFi: 'Bundesministerium für Finanzen',
  BMI: 'Bundesministerium für Inneres',
  BMJ: 'Bundesministerium für Justiz',
  BMK: 'Bundesministerium für Klimaschutz, Umwelt, Energie, Mobilität, Innovation und Technologie',
  BMKÖS: 'Bundesministerium für Kunst, Kultur, öffentlichen Dienst und Sport',
  BML: 'Bundesministerium für Land- und Forstwirtschaft, Regionen und Wasserwirtschaft',
  BMLRT: 'Bundesministerium für Landwirtschaft, Regionen und Tourismus',
  BMLUK: 'Bundesministerium für Land- und Forstwirtschaft, Klima- und Umweltschutz, Regionen und Wasserwirtschaft',
  BMLV: 'Bundesministerium für Landesverteidigung',
  BMSGPK: 'Bundesministerium für Soziales, Gesundheit, Pflege und Konsumentenschutz',
  BMVRDJ: 'Bundesministerium für Verfassung, Reformen, Deregulierung und Justiz',
  BMWET: 'Bundesministerium für Wirtschaft, Energie und Tourismus',
  BDA: 'Bundesdenkmalamt',
  BWB: 'Bundeswettbewerbsbehörde',
  BVAEB: 'Versicherungsanstalt öffentlich Bediensteter, Eisenbahnen und Bergbau',
  VA: 'Volksanwaltschaft',
  BLRH: 'Burgenländischer Landes-Rechnungshof',
  LRH: 'Burgenländischer Landes-Rechnungshof',
  LVwG: 'Landesverwaltungsgericht Burgenland',
  LvWG: 'Landesverwaltungsgericht Burgenland',
  'LVwG Burgenland': 'Landesverwaltungsgericht Burgenland',
  BehAnw: 'Behindertenanwaltschaft',
  Behindertenanwalt: 'Behindertenanwaltschaft',
  Jugendanwalt: 'Kinder- und Jugendanwaltschaft',
  Behindertenrat: 'Österreichischer Behindertenrat',
  ÖBR: 'Österreichischer Behindertenrat',
  ÖZIV: 'ÖZIV – Verband für Menschen mit Behinderungen',
  'ÖZIV BV': 'ÖZIV Bundesverband',
  GVV: 'Gemeindevertreterverband',
  Younion: 'younion – Die Daseinsgewerkschaft',
  'GÖD LL8': 'Gewerkschaft Öffentlicher Dienst',
  'GÖD LL24': 'Gewerkschaft Öffentlicher Dienst',
  'GÖD Burgenland': 'Gewerkschaft Öffentlicher Dienst, Burgenland',
  KRAGES: 'Burgenländische Krankenanstalten-Gesellschaft',
  'KRAGES ZBR': 'Burgenländische Krankenanstalten-Gesellschaft, Zentralbetriebsrat',
  Aek: 'Ärztekammer',
  ÖZÄK: 'Österreichische Zahnärztekammer',
  ARCHING: 'Kammer der Ziviltechniker:innen (arch+ing)',
  BLJV: 'Burgenländischer Landesjagdverband',
  VGT: 'Verein gegen Tierfabriken',
  'Tierfabriken VGT': 'Verein gegen Tierfabriken',
  BirdLife: 'BirdLife Österreich',
  OIB: 'Österreichisches Institut für Bautechnik',
  austroCONTROL: 'Austro Control GmbH',
  'MA Eisenstadt': 'Magistrat der Freistadt Eisenstadt',
  'MA Wien': 'Magistrat der Stadt Wien',
  'StGem Frauenkirchen': 'Stadtgemeinde Frauenkirchen',
  'Gem Schützen am Gebirge': 'Gemeinde Schützen am Gebirge',
  'Markgemeinde Wallern': 'Marktgemeinde Wallern',
  'Markgemeinde Podersdorf': 'Marktgemeinde Podersdorf',
  JUNOS: 'JUNOS – Junge liberale NEOS',
  JVP: 'Junge Volkspartei',
}

/** A Stellungnahme's label → whom the monitor names: an organisation, certainly, or nobody. */
export function bgldSubmitter(label: string): string | null {
  const rest = label.replace(/^Stellungnahmen?\s+(?:der\s+|des\s+|von\s+)?/i, '').trim()
  const c = classifySubmitter(BGLD_SUBMITTERS[rest] ?? rest)
  return c.kind === 'organisation' ? c.name : null
}

export interface BgldEntry {
  draft: LandConsultation
  statements: LandStatement[]
}

/** The links of one `<ul>`: title and absolute URL, on the Land's host only. */
function links(ul: string): { title: string; url: string }[] {
  const out: { title: string; url: string }[] = []
  for (const [, href, label] of ul.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const url = safeExternalUrl(new URL(decodeEntities(href!), BGLD_ORIGIN).href)
    const title = text(label!)
    if (url && title) out.push({ title, url })
  }
  return out
}

/**
 * One page of either list → its drafts. `kind` where the archive's view
 * says it; on the running list the title decides (`draftKindOfTitle`).
 */
export function parseBgldPage(html: string, pageUrl: string, kind?: LandDraftKind): BgldEntry[] {
  if (!/<h1>(?:Aktuelle Begutachtungsentw(?:ü|&uuml;)rfe|Abgeschlossene Begutachtungen)<\/h1>/.test(html)) {
    throw new LandSourceError('bgld', 'Überschrift der Liste fehlt')
  }
  const out: BgldEntry[] = []
  for (const panel of html.split('<div class="panel panel-default">').slice(1)) {
    const titleHtml = /computedField1">([\s\S]*?)<\/span>/.exec(panel)?.[1]
    // The archive's filter boxes are panels too, without a title.
    if (titleHtml === undefined) continue
    const title = text(titleHtml)
    const fristText = /(?:Ende der Begutachtungsfrist|Begutachtungsfrist abgelaufen am):([^<]*)</.exec(panel)?.[1]
    const deadline = fristText ? landDate(decodeEntities(fristText).replace(/\u00a0/g, ' ')) : null
    if (!title || !deadline) throw new LandSourceError('bgld', `Eintrag ohne Titel oder lesbare Frist: ${title || '?'}`)
    const [docsUl, statementsUl] = [...panel.matchAll(/<ul\b[^>]*>([\s\S]*?)<\/ul>/g)].map((m) => m[1]!)
    const documents: LandDocument[] = links(docsUl ?? '')
    const unid = UNID_RE.exec(documents[0]?.url ?? '')?.[1]?.toLowerCase()
    // A draft without a document has nothing to read and no number; the Land lists none such.
    if (!unid) continue
    const statements: LandStatement[] = links(statementsUl ?? '').map(({ title: label, url }) => ({ name: bgldSubmitter(label), url }))
    out.push({
      draft: {
        id: `bgld-${unid}`,
        land: 'bgld',
        kind: kind ?? draftKindOfTitle(title),
        title,
        startedAt: null,
        deadline,
        url: pageUrl,
        documents,
        active: false,
      },
      statements,
    })
  }
  return out
}

/**
 * The postback that turns a view to its next page, or null on its last: the
 * pager's link to the page after the one pressed, sent with the form's
 * hidden fields as the XPages runtime sends them. By the page's number, not
 * by the pager's „next" link — that one the server answers with HTTP 500
 * (30.10.2026), the numbered ones with the page.
 */
export function bgldNextPage(html: string): { action: string; form: URLSearchParams } | null {
  const links = [...html.matchAll(/<a\b[^>]*\sid="([^"]*pagerTop__Group__lnk__\d+)"[^>]*>/g)].map((m) => ({ tag: m[0], id: m[1]! }))
  const pressed = links.find((l) => attr(l.tag, 'aria-pressed') === 'true')
  const current = Number(/^Page (\d+)$/.exec(attr(pressed?.tag ?? '', 'aria-label') ?? '')?.[1] ?? 0)
  const next = links.find((l) => attr(l.tag, 'aria-label') === `Page ${current + 1}`)
  if (!current || !next) return null
  const form = pageForms(html).find((f) => f.body.includes(next.id))
  if (!form) return null
  const fields = hiddenInputs(form.body)
  fields.set(form.name, form.name)
  fields.set('$$xspsubmitid', decodeEntities(next.id))
  fields.set('$$xspexecid', '')
  fields.set('$$xspsubmitvalue', '')
  fields.set('$$xspsubmitscroll', '0|0')
  return { action: form.action, form: fields }
}
