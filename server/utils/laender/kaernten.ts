/**
 * Kärnten's drafts in Begutachtung (23.10.2026).
 *
 * The Verfassungsdienst's pages, one CMS, all plain server HTML:
 *
 *  - `akt_Beg_LG`: the running Begutachtungen of Landesgesetze. Per entry a
 *    title, „Ende der Begutachtungsfrist: 9. November 2026" and the
 *    documents — Gesetz, Erläuterungen, TGÜ, now and then an Anlage.
 *  - „abgeschlossene Begutachtungen <Jahr>" (2021 on): the closed ones of
 *    that year, the same documents and a link to their Stellungnahmen — but
 *    NO DATE, neither start nor Frist. A closed draft therefore carries only
 *    what its chain records (`placedAt`).
 *  - „Regierungsvorlagen <Jahr>": the Vorlagen under „78. Regierungssitzung
 *    am 08.09.2026", each with Gesetz, Erläuterungen and TGÜ again.
 *  - „Gesetzesbeschlüsse <Jahr>": the Landtag's Beschlüsse under „39.
 *    Landtagssitzung am 01.10.2026", each linking the Regierungsvorlage it
 *    came from.
 *
 * THE KEY is the Geschäftszahl in the file names: „LG-113253_2025-38 …"
 * for the Begutachtung, „LG-113253_2025-73 …" for its Regierungsvorlage —
 * one Akt (113253/2025), one Stück each. A draft is its Akt and Stück
 * (`ktn-113253-2025-38`); its chain is joined by the Akt alone. The Land
 * spells the separator as „_" or „-" as it likes, and once typed
 * „LG-9845872024-54" for „LG-98458_2024-54" — the TGÜ's name, never the
 * Gesetz's, which is why the key is read from the Gesetz first. Until 2021
 * the number had no year in front of the Stück: „LG-1994-6", now and then
 * „LG-1927-42-2020" with the year behind it. Without one, the draft is
 * `ktn-1994-6` — no year is supplied that the Land did not write.
 *
 * The CMS signs its links with `?exp=…&fps=…`; the archive pages link the
 * same files without, and they answer so too. The monitor keeps them
 * unsigned: a signed link would change with every read of the page.
 *
 * Verordnungen stand elsewhere (a page of tiles that is not kept up) and
 * are not read.
 *
 * THE GATE. Each page is held to its own heading text; the running page to
 * a Frist for every entry. A page that fails is refused (`LandSourceError`),
 * and Kärnten reads as „nicht abrufbar", never as „keine Begutachtung offen".
 */
import type { LandConsultation, LandDocument, LandLandtag, LandProcedureStep, LandStage, LandStatement } from '#shared/types'
import { safeExternalUrl } from '#shared/utils/safeExternalUrl'
import { decodeEntities } from '../parliament/htmlText'
import { classifySubmitter } from '../parliament/privacy'
import { LandSourceError } from './gate'
import { lgblWords, type LgblEntry } from './lgblSearch'

const SITE = 'https://www.ktn.gv.at'
const BASE = `${SITE}/Verwaltung/Amt-der-Kaerntner-Landesregierung/Verfassungsdienst/Landesgesetzgebung/`

export const KTN_CURRENT = `${BASE}akt%5fBeg%5fLG`
export const KTN_FILING_EMAIL = 'abt1.verfassung@ktn.gv.at'

/** The first year the Land keeps a page of closed Begutachtungen for (2020 answers 404). */
export const KTN_FIRST_YEAR = 2021

export const ktnArchiveUrl = (year: number) => `${BASE}abgeschlossene%20Begutachtungen%20${year}`
export const ktnVorlagenUrl = (year: number) => `${BASE}Regierungsvorlagen%20${year}`
export const ktnBeschluesseUrl = (year: number) => `${BASE}Gesetzesbeschl%c3%bcsse%20${year}`

/** A Kärnten draft number: Akt, year where the Land wrote one, and Stück — „113253-2025-38", „1994-6". */
export const KTN_NUMBER_RE = /^\d{1,7}-(?:20\d{2}-)?\d{1,4}$/

/* „LG-113253_2025-38", „LG-11829_2023-26", „LG-104907-2025-32". */
const GZ_RE = /LG-(\d{1,7})[-_](20\d{2})-(\d{1,4})(?!\d)/
/* Until 2021: „LG-1994-6", „LG-1927-42-2020". */
const OLD_GZ_RE = /LG-(\d{1,7})-(\d{1,4})(?:-(20\d{2}))?(?!\d)/

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

/** „Ende der Begutachtungsfrist: 09. November 2026" → `2026-11-09`. */
function fristOf(line: string): string | null {
  const m = /Begutachtungsfrist:?\s*(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]+)\s+(\d{4})/.exec(line)
  const month = m ? MONTHS[m[2]!.toLowerCase()] : undefined
  return m && month ? isoOf(m[1]!, month, m[3]!) : null
}

/** „am 08.09.2026" → `2026-09-08`. */
function dottedDate(line: string): string | null {
  const m = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(line)
  return m ? isoOf(m[1]!, m[2]!, m[3]!) : null
}

/** A link of the CMS, absolute and without its signature. */
function fileUrl(href: string): string | null {
  const url = safeExternalUrl(new URL(decodeEntities(href), SITE).href)
  if (!url) return null
  const parsed = new URL(url)
  parsed.search = ''
  return parsed.href
}

/** The CMS writes the dot of „.pdf" as „%2e". */
const isPdf = (url: string) => /\.pdf$/i.test(decodeURIComponent(new URL(url).pathname))

/** The Geschäftszahl a link's file name carries: Akt, year (where written), Stück. */
export function ktnGzOf(url: string): { akt: string; year: string | null; stueck: string } | null {
  const name = decodeURIComponent(new URL(url).pathname)
  const m = GZ_RE.exec(name)
  if (m) return { akt: m[1]!, year: m[2]!, stueck: m[3]! }
  const old = OLD_GZ_RE.exec(name)
  return old ? { akt: old[1]!, year: old[3] ?? null, stueck: old[2]! } : null
}

const numberOf = (gz: { akt: string; year: string | null; stueck: string }) => [gz.akt, gz.year, gz.stueck].filter(Boolean).join('-')

/** The content column, between the CMS's own markers. */
function contentOf(html: string): string {
  const start = html.indexOf('<!-- CONTENT -->')
  const end = html.indexOf('<!-- /CONTENT -->', start)
  return start < 0 ? '' : html.slice(start, end > 0 ? end : undefined)
}

interface Token {
  kind: 'h2' | 'p'
  html: string
  text: string
}

/** The column as its headings and paragraphs, in order — the pages nest their articles at random. */
function tokens(content: string): Token[] {
  return [...content.matchAll(/<(h2|p)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => ({ kind: m[1] as Token['kind'], html: m[2]!, text: text(m[2]!) }))
}

const TITLE_RE = /^Entwurf\s+(?:eines|einer)\s+Gesetz/

function linksOf(html: string): { label: string; url: string }[] {
  // `href` need not come first: Abteilung 6 writes `<a target="_new" href=…>`.
  return [...html.matchAll(/<a\b[^>]*?\shref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].flatMap((m) => {
    const url = fileUrl(m[1]!)
    return url ? [{ label: text(m[2]!), url }] : []
  })
}

/** „Eläuterungen" (sic, 23.10.2026) and „TGÜ" as the document list names them. */
function documentTitle(label: string): string {
  if (/^Gesetz$/i.test(label)) return 'Entwurf'
  if (/^E(?:r)?läuterungen$/i.test(label)) return 'Erläuterungen'
  if (/^TGÜ$/i.test(label)) return 'Textgegenüberstellung'
  return label || 'Dokument'
}

export interface KtnEntry {
  draft: LandConsultation
  /** The page of its Stellungnahmen, on the archive; null on the running list. */
  statementsUrl: string | null
}

/**
 * The running list (`requireFrist`) or one year's archive → its drafts.
 * Entries without a Geschäftszahl in any file name are skipped, not
 * refused: the archive holds a few, and one would otherwise take every
 * Kärnten draft away.
 */
export function parseKtnList(html: string, { requireFrist }: { requireFrist: boolean }): KtnEntry[] {
  const heading = requireFrist ? /aktuelle Begutachtungen von Landesgesetzen/ : /abgeschlossene Begutachtungen \d{4}/
  if (!heading.test(html)) throw new LandSourceError('ktn', `Seite ohne „${requireFrist ? 'aktuelle' : 'abgeschlossene'} Begutachtungen"`)
  const all = tokens(contentOf(html))
  const out: KtnEntry[] = []
  for (let i = 0; i < all.length; i++) {
    if (all[i]!.kind !== 'p' || !TITLE_RE.test(all[i]!.text)) continue
    // „Entwurf eines Gesetzes, mit dem …": the title as the other Länder write it, „Gesetz, mit dem …".
    const title = all[i]!.text.replace(/^Entwurf\s+eine[sr]\s+Gesetze?s\b/, 'Gesetz')
    let deadline: string | null = null
    const documents: LandDocument[] = []
    let statementsUrl: string | null = null
    for (let j = i + 1; j < all.length && !TITLE_RE.test(all[j]!.text) && all[j]!.kind === 'p'; j++) {
      deadline ??= fristOf(all[j]!.text)
      for (const link of linksOf(all[j]!.html)) {
        if (/^Stellungnahmen$/i.test(link.label)) statementsUrl = link.url
        else if (isPdf(link.url)) documents.push({ title: documentTitle(link.label), url: link.url })
      }
    }
    if (requireFrist && !deadline) throw new LandSourceError('ktn', `Entwurf „${title.slice(0, 40)}" ohne Frist`)
    const gz = [...documents.filter((d) => d.title === 'Entwurf'), ...documents].map((d) => ktnGzOf(d.url)).find(Boolean) ??
      (statementsUrl ? ktnGzOf(statementsUrl) : null)
    if (!gz || !documents.length) continue
    const number = numberOf(gz)
    out.push({
      draft: {
        id: `ktn-${number}`,
        land: 'ktn',
        kind: 'gesetz',
        title,
        startedAt: null,
        deadline,
        url: documents[0]!.url,
        documents,
        active: false,
      },
      statementsUrl,
    })
  }
  if (requireFrist && !out.length && all.some((t) => TITLE_RE.test(t.text))) {
    throw new LandSourceError('ktn', 'Entwürfe ohne lesbare Geschäftszahl')
  }
  return out
}

/** A draft's page of Stellungnahmen → one per linked PDF, named only where an organisation. */
export function parseKtnStatements(html: string): LandStatement[] {
  if (!/Stellungnahmen:/.test(html)) throw new LandSourceError('ktn', 'Stellungnahmenseite ohne ihre Überschrift')
  return linksOf(contentOf(html)).filter((l) => isPdf(l.url)).map((l) => {
    const c = classifySubmitter(l.label)
    return { name: c.kind === 'organisation' ? c.name : null, url: l.url }
  })
}

/** One step of the chain, as the Land's yearly pages record it. */
export interface KtnChainStep {
  /** The Akt, „113253-2025": what joins it to the Begutachtung. */
  akt: string
  /** The Vorlage's Stück in its Akt — for a Beschluss, that of the Vorlage it links. */
  stueck: number
  date: string | null
  /** „78. Regierungssitzung am 08.09.2026", „39. Landtagssitzung am 01.10.2026". */
  sitting: string
  title: string
  /** The Vorlage's Gesetz, or the Beschluss's text. */
  url: string
  documents: LandDocument[]
}

/** The Akt of a draft number („113253-2025-38" → „113253-2025") and its Stück. */
export function ktnPartsOfNumber(number: string): { akt: string; stueck: number } {
  const parts = number.split('-')
  return { akt: parts.slice(0, -1).join('-'), stueck: Number(parts.at(-1)) }
}

const partsOf = (url: string) => {
  const gz = ktnGzOf(url)
  return gz ? { akt: [gz.akt, gz.year].filter(Boolean).join('-'), stueck: Number(gz.stueck) } : null
}

const SITTING_RE = /\d+\.\s*(?:Regierungssitzung am|Sitzung der (?:Kärntner )?Landesregierung vom)\s*\d{1,2}\.\d{1,2}\.\d{4}/

/** A year's Regierungsvorlagen → one step per Vorlage, under the sitting that passed it. */
export function parseKtnVorlagen(html: string): KtnChainStep[] {
  if (!/Beschlüsse der Kärntner Landesregierung/.test(html)) throw new LandSourceError('ktn', 'Vorlagenseite ohne ihre Überschrift')
  const out: KtnChainStep[] = []
  let sitting = ''
  const all = tokens(contentOf(html))
  for (let i = 0; i < all.length; i++) {
    const t = all[i]!
    /* „78. Regierungssitzung am 08.09.2026" as a heading since 2025; before,
     * „84. Sitzung der Kärntner Landesregierung vom 07.12.2021" in a
     * paragraph — read only as the first, the Vorlagen of 2021–2024 had no
     * sitting and no date, and their drafts no place in a period (24.10.2026). */
    const head = SITTING_RE.exec(t.text)
    if (head && !TITLE_RE.test(t.text)) {
      sitting = head[0]
      continue
    }
    if (t.kind === 'h2' || !TITLE_RE.test(t.text)) continue
    const documents: LandDocument[] = []
    for (let j = i + 1; j < all.length && all[j]!.kind === 'p' && !TITLE_RE.test(all[j]!.text); j++) {
      for (const link of linksOf(all[j]!.html)) documents.push({ title: documentTitle(link.label), url: link.url })
    }
    const gesetz = documents.find((d) => d.title === 'Entwurf') ?? documents[0]
    const parts = gesetz ? (partsOf(gesetz.url) ?? documents.map((d) => partsOf(d.url)).find(Boolean) ?? null) : null
    if (!gesetz || !parts) continue
    out.push({
      ...parts,
      date: dottedDate(sitting),
      sitting,
      title: t.text,
      url: gesetz.url,
      documents: documents.map((d) => ({ ...d, title: d.title === 'Entwurf' ? 'Regierungsvorlage' : `Regierungsvorlage, ${d.title}` })),
    })
  }
  return out
}

/**
 * A year's Gesetzesbeschlüsse → one step per Beschluss whose Regierungsvorlage
 * is linked; a Beschluss on an Initiativantrag has none and joins nothing.
 */
export function parseKtnBeschluesse(html: string): KtnChainStep[] {
  if (!/Gesetzesbeschlüsse des Kärntner Landtag(?:e)?s/.test(html)) throw new LandSourceError('ktn', 'Beschlussseite ohne ihre Überschrift')
  const out: (KtnChainStep & { linked: boolean })[] = []
  let sitting = ''
  for (const t of tokens(contentOf(html))) {
    const head = /(\d+\.\s*Landtagssitzung am \d{1,2}\.\d{1,2}\.\d{4})/.exec(t.text)
    if (head) {
      sitting = head[1]!
      continue
    }
    const links = linksOf(t.html)
    const beschluss = links.find((l) => TITLE_RE.test(l.label))
    if (beschluss) {
      out.push({ akt: '', stueck: 0, date: dottedDate(sitting), sitting, title: beschluss.label, url: beschluss.url, documents: [], linked: false })
      continue
    }
    // „(Regierungsvorlage, Erläuterungen, TGÜ)" under the Beschluss it belongs to.
    const vorlage = links.find((l) => /^Regierungsvorlage$/i.test(l.label))
    const last = out.at(-1)
    const parts = vorlage ? partsOf(vorlage.url) : null
    if (parts && last && !last.linked) Object.assign(last, parts, { linked: true })
  }
  return out.filter((s) => s.linked).map(({ linked: _, ...s }) => s)
}

/**
 * The Landesgesetzblatt of a Beschluss (23.10.2026): a Kärnten law is
 * kundgemacht as „Gesetz vom 1. Oktober 2026, mit dem …" — dated by the
 * Landtag's Beschluss, which the Land's own page records. The LGBl whose
 * title carries that date and the draft's distinctive words is the one;
 * where two would, none is taken.
 */
export function ktnKundmachung(beschluss: KtnChainStep, draftTitle: string, index: readonly LgblEntry[]): LgblEntry | null {
  if (!beschluss.date) return null
  const [y, m, d] = beschluss.date.split('-')
  const month = Object.entries(MONTHS).find(([name, v]) => v === m && name !== 'januar')?.[0]
  if (!month) return null
  const dated = new RegExp(`^(?:Landesverfassungsg|G)esetz vom ${Number(d)}\\. ${month} ${y}\\b`, 'i')
  const words = lgblWords(draftTitle)
  const hits = index.filter((e) => {
    if (!/^Landes(?:verfassungs)?gesetz$/.test(e.typ.trim()) || !dated.test(e.titel)) return false
    const own = lgblWords(e.titel)
    let shared = 0
    for (const w of words) if (own.has(w)) shared++
    return words.size > 0 && shared / words.size >= 0.8
  })
  return hits.length === 1 ? hits[0]! : null
}

/**
 * A draft's chain: its Vorlage, the Beschluss on that Vorlage, and the
 * Kundmachung that Beschluss dates — as the record its page shows and as
 * the station the lists sort it under.
 *
 * BY STÜCK, NOT BY AKT ALONE. Kärnten keeps one Akt per law for years: the
 * Feuerwehrgesetz's 2275/2021 holds its Begutachtung of 2021 and the
 * Novelle of 2025, and joined by the Akt the 2021 draft took the 2025
 * Beschluss (23.10.2026). The Stücke of an Akt only grow, so the draft's
 * Vorlage is the first one after its own Stück and before the Akt's next
 * Begutachtung (`nextStueck`); its Beschluss the one that links that very
 * Vorlage. Each part only where the Land's pages hold it; the Kundmachung
 * is the monitor's finding and says so (`via: 'suche'`, `certainBy:
 * 'beschluss'`).
 */
export function ktnChainOf(
  draft: { akt: string; stueck: number; nextStueck: number; title: string },
  vorlagen: readonly KtnChainStep[],
  beschluesse: readonly KtnChainStep[],
  index: readonly LgblEntry[] | null,
): { procedure: LandProcedureStep[]; stage: LandStage | null; landtag: LandLandtag | null; documents: LandDocument[] } {
  const vorlage = vorlagen
    .filter((v) => v.akt === draft.akt && v.stueck > draft.stueck && v.stueck < draft.nextStueck)
    .sort((a, b) => a.stueck - b.stueck)[0]
  const beschluss = vorlage ? beschluesse.find((b) => b.akt === vorlage.akt && b.stueck === vorlage.stueck) : undefined
  const procedure: LandProcedureStep[] = []
  if (vorlage) procedure.push({ date: vorlage.date, label: `Regierungsvorlage, beschlossen in der ${vorlage.sitting}`, url: vorlage.url, station: 'rv' })
  if (beschluss) procedure.push({ date: beschluss.date, label: `Gesetzesbeschluss in der ${beschluss.sitting}`, url: beschluss.url, station: 'parlament' })
  const lgbl = beschluss && index ? ktnKundmachung(beschluss, draft.title, index) : null
  // The Kundmachung is the monitor's finding, not a step of the Land's record: it stands as the stage only.
  let stage: LandStage | null = null
  if (lgbl) {
    stage = { station: 'bgbl', label: 'Kundgemacht', detail: lgbl.nr, date: lgbl.datum, url: lgbl.url, via: 'suche', unique: true, certainBy: 'beschluss' }
  } else if (beschluss) {
    stage = { station: 'parlament', label: 'Im Landtag beschlossen', detail: null, date: beschluss.date }
  } else if (vorlage) {
    stage = { station: 'rv', label: 'Regierungsvorlage', detail: vorlage.date ? `beschlossen am ${vorlage.date.split('-').reverse().join('.')}` : null, date: vorlage.date }
  }
  const landtag: LandLandtag | null = beschluss
    ? { committee: null, subcommittee: false, report: null, motions: [], decision: { date: beschluss.date, vote: null } }
    : null
  return { procedure, stage, landtag, documents: vorlage?.documents ?? [] }
}

/** For each draft number, the Stück of the next Begutachtung in its Akt (`ktnChainOf`). */
export function ktnNextStuecke(numbers: readonly string[]): Map<string, number> {
  const byAkt = new Map<string, number[]>()
  for (const n of numbers) {
    const { akt, stueck } = ktnPartsOfNumber(n)
    byAkt.set(akt, [...(byAkt.get(akt) ?? []), stueck])
  }
  return new Map(numbers.map((n) => {
    const { akt, stueck } = ktnPartsOfNumber(n)
    const later = (byAkt.get(akt) ?? []).filter((s) => s > stueck)
    return [n, later.length ? Math.min(...later) : Infinity]
  }))
}

/* ------------------------------------------------------------------ *
 * Verordnungen (23.10.2026)
 * ------------------------------------------------------------------ *
 *
 * Not the Verfassungsdienst's pages: „Themen A–Z › Begutachtungen ›
 * Verordnungsentwürfe", one tile per entry, each with a detail page of its
 * own (`detail=1631`) that the department filing it writes as it likes.
 * Measured over the 28 tiles of 23.10.2026: 27 are drafts, one is not (an
 * „Externe Meldestelle" page); nine state their Frist on the page („Ende der
 * Stellungsnahmefrist: 29.10.2026", „Die Begutachtungsfrist endet mit
 * 19.01.2026"); for the others the Frist is a sentence of the cover letter
 * — „wird um Stellungnahme innerhalb von vier Wochen ab Zustellung
 * ersucht" — beside the letter's own date (`ktnVoLetter`). Closed drafts stay
 * listed: the page is not cleared.
 */

export const KTN_VO_LIST = `${SITE}/Themen-AZ/Uebersicht?thema=168&subthema=169`
export const ktnVoDetailUrl = (detail: string) => `${SITE}/Themen-AZ/Details?thema=168&subthema=169&detail=${detail}`

/** The overview → each tile's detail number and title. */
export function parseKtnVoList(html: string): { detail: string; title: string }[] {
  if (!/Verordnungsentwürfe/.test(html)) throw new LandSourceError('ktn', 'Verordnungsseite ohne ihre Überschrift')
  const out = new Map<string, string>()
  for (const m of html.matchAll(/href="\/Themen-AZ\/Details\?thema=168&(?:amp;)?subthema=169&(?:amp;)?detail=(\d+)"[^>]*title="Details zum Thema: ([^"]*)"/g)) {
    if (!out.has(m[1]!)) out.set(m[1]!, decodeEntities(m[2]!).trim())
  }
  if (!out.size) throw new LandSourceError('ktn', 'Verordnungsseite ohne Eintrag')
  return [...out].map(([detail, title]) => ({ detail, title }))
}

export interface KtnVoDetail {
  title: string
  documents: LandDocument[]
  /** As the page states it; null where only the cover letter does. */
  deadline: string | null
  email: string | null
  /** The cover letter, where one is linked (`ktnVoLetter`). */
  letterUrl: string | null
}

/* „Ende der Begutachtungsfrist: 13.01.2026", „Stellungnahmefrist: 19. November 2024", „endet mit 24. Februar 2025". */
const VO_FRIST_RE = /(?:[Ff]rist|endet)[^0-9<]{0,40}?(\d{1,2})\.\s?(\d{1,2}\.|[A-ZÄ][a-zä]+)\s?(\d{4})/
const VO_LETTER_RE = /Anschreiben|Begleitschreiben|^Begutachtungsverfahren\b|^Begutachtung - Akt$/i
/* Where the draft's own sentence ends on the page: its documents, its Frist, its address. */
const VO_SENTENCE_END_RE = /\s+(?:–|-)\s+Begutachtung|\s+(?:Anlagen|Downloads?)\b|\s+(?:Stellungnahmefrist|Ende der|Begutachtungsfrist|Allfällige|Es wird ersucht|Begutachtung - Akt)\b|\s+(?=Begutachtungsentwurf\b)/
/* A document of the CMS's file store, whatever its type — two departments link .docx and files without an extension. */
const isRepoFile = (url: string) => /\/repos\/files\//.test(new URL(url).pathname)

/**
 * One tile's page; null where it is no draft (no Begutachtung or Entwurf
 * named, or no document). The title: the draft's own sentence where the
 * page gives one („Entwurf einer Verordnung der Kärntner Landesregierung,
 * mit der …"), else the tile's heading.
 */
export function parseKtnVoDetail(html: string): KtnVoDetail | null {
  const content = contentOf(html).replace(/<script\b[\s\S]*?<\/script>/g, '')
  const heading = text(/<h2[^>]*>([\s\S]*?)<\/h2>/.exec(content)?.[1] ?? '')
  const body = text(content)
  const documents = linksOf(content).filter((l) => isRepoFile(l.url)).map((l) => ({ title: l.label || 'Dokument', url: l.url }))
  if (!documents.length || !/Begutachtung|Entwurf/i.test(body)) return null
  const rest = body.slice(heading.length).trim()
  const start = /(?:Begutachtungsentwurf|Entwurf)(?:\s+eine[rs]\s+|-)Verordnung\b|^Verordnung\b/.exec(rest)
  const sentence = start ? rest.slice(start.index).split(VO_SENTENCE_END_RE)[0]!.replace(/[.\s]+$/, '') : null
  const title = sentence ? sentence.replace(/^(?:Begutachtungs)?[Ee]ntwurf(?:\s+eine[rs]\s+|-)/, '').trim() : heading
  const frist = VO_FRIST_RE.exec(body)
  const fristMonth = frist ? (/^\d/.test(frist[2]!) ? frist[2]!.replace('.', '') : MONTHS[frist[2]!.toLowerCase()]) : undefined
  return {
    title: title.replace(/^./, (c) => c.toUpperCase()),
    documents,
    deadline: frist && fristMonth ? isoOf(frist[1]!, fristMonth, frist[3]!) : null,
    email: /mailto:([^"?]+)/.exec(content)?.[1]?.trim() ?? null,
    letterUrl: linksOf(content).find((l) => isRepoFile(l.url) && VO_LETTER_RE.test(l.label))?.url ?? null,
  }
}

const WEEKS: Record<string, number> = { zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, acht: 8 }

/**
 * What a cover letter says about its Begutachtung, from its text: its date
 * („Datum 23.09.2026") and the Frist it sets as a span („innerhalb von v i
 * e r Wochen ab Zustellung" — letter-spaced in Abteilung 10's template).
 * Measured on the 18 letters of 23.10.2026: 15 state the span, every one
 * four weeks; where page and letter both speak (Turnersee) the page's
 * 29.10.2026 is the letter's 30.09.2026 plus four weeks and a day.
 */
export function ktnVoLetter(text: string): { date: string | null; weeks: number | null } {
  const flat = text.replace(/\s+/g, ' ')
  const d = /Datum\s+(\d{1,2})\.\s?(\d{1,2}\.|[A-ZÄ][a-zä]+)\s?(\d{4})/.exec(flat)
  const month = d ? (/^\d/.test(d[2]!) ? d[2]!.replace('.', '') : MONTHS[d[2]!.toLowerCase()]) : undefined
  const spaced = flat.replace(/\b((?:\p{L} ){2,}\p{L})\b/gu, (m) => m.replace(/ /g, ''))
  const span = /innerhalb von (\p{L}+|\d+) Wochen ab (?:Zustellung|Zusendung)/u.exec(spaced)?.[1]?.toLowerCase()
  return {
    date: d && month ? isoOf(d[1]!, month, d[3]!) : null,
    weeks: span ? (WEEKS[span] ?? (/^\d+$/.test(span) ? Number(span) : null)) : null,
  }
}

/** The letter's date plus its span, the day the Frist ends by its own rule. */
export function ktnVoDeadline(letter: { date: string | null; weeks: number | null }): string | null {
  if (!letter.date || !letter.weeks) return null
  const d = new Date(`${letter.date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + letter.weeks * 7)
  return d.toISOString().slice(0, 10)
}
