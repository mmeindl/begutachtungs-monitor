/**
 * The Gegenstand detail JSON → shared/types: stages, documents, text
 * evolution, short info, RV/BGBl.
 *
 * PURE MODULE — no Nuxt auto-imports, only relative imports,
 * so vitest can execute the module directly.
 */
import type {
  DraftDocument,
  DescriptionBlock,
  DocumentFormat,
  Handoff,
  TextVersion,
  TraceStep,
} from '../../../shared/types'
import { lawStationOf } from '../../../shared/utils/lawStations'
import { parseGermanDate, parseIsoDate } from './dates'
import { absolutizeUrl, extractLinks, stripHtmlToText } from './htmlText'

// ---------------------------------------------------------------------------
// Raw shapes of the detail JSONs (loosely typed — upstream is not contractual)
// ---------------------------------------------------------------------------

export interface RawStage {
  date?: string | null
  text?: string | null
}

export interface RawDocumentGroup {
  title?: string | null
  documents?: { link?: string | null; type?: string | null }[] | null
}

/**
 * Whether an item currently takes Stellungnahmen, from its detail JSON:
 * `statementsstate` is "1" while the form is open and "0" afterwards — on a
 * Ministerialentwurf while the Frist runs, on a Regierungsvorlage while the
 * Nationalrat has the text (verified 2026-09-15 on 132/ME with a running
 * Frist, the six newest GP-XXVIII Vorlagen and the enacted 2238 d.B.).
 * `statements.new` mirrors it as 1/0. Anything else reads as closed.
 */
export function isFilingOpen(content: { statementsstate?: unknown } | null | undefined): boolean {
  const state = content?.statementsstate
  return state === '1' || state === 1
}

export interface RawName {
  funktext?: string | null
  name?: string | null
}

export interface RawShortinfo {
  teil1?: string | null
  teil2?: string | null
}

export interface RawBgblLink {
  title?: string | null
  link?: string | null
}

/** content.stages[] → TraceSteps (HTML stripped, links extracted + absolutized). */
export function parseStages(stages: RawStage[] | null | undefined): TraceStep[] {
  if (!Array.isArray(stages)) return []
  return stages.map((stage) => {
    const html = stage?.text ?? ''
    return {
      date: parseGermanDate(stage?.date) ?? parseIsoDate(stage?.date),
      text: stripHtmlToText(html),
      links: extractLinks(html),
    }
  })
}

export interface RvLink {
  gp: string
  inr: number
  label: string
  url: string
  /** Date of the stage carrying the link, null when that stage is undated */
  date: string | null
}

/**
 * Every /gegenstand/{gp}/I/{nr} link in the process history, in stage order
 * = the Regierungsvorlagen this draft produced (ME→RV is 1:n,
 * docs/architecture.md §5). Each carries the date of the stage it sits in —
 * the RV station's date in the SpineRail, available nowhere else.
 */
export function findRvLinks(trace: TraceStep[]): RvLink[] {
  const found: RvLink[] = []
  for (const step of trace) {
    for (const link of step.links) {
      const m = /\/gegenstand\/([IVXLC]+)\/I\/(\d+)(?:[/?#]|$)/.exec(link.url)
      if (m?.[1] && m[2]) {
        found.push({
          gp: m[1],
          inr: Number(m[2]),
          label: link.label || `${m[2]} d.B.`,
          url: link.url,
          date: step.date,
        })
      }
    }
  }
  return found
}

/** The latest RV — the one the outcome and the BGBl enrichment hang off. */
export function findLastRvLink(trace: TraceStep[]): RvLink | null {
  return findRvLinks(trace).at(-1) ?? null
}

/**
 * The Übermittlung stage → who received the Stellungnahmen and when. Text
 * is ministries' free wording behind a fixed prefix ("Übermittlung an das
 * Bundesministerium für …", "… an das Bundeskanzleramt"), so match the
 * prefix and pass the rest through verbatim; no match → no claim.
 */
const HANDOFF_RE = /^Übermittlung an\s+(.+?)\s*$/

export function findHandoff(trace: TraceStep[]): Handoff | null {
  for (const step of trace) {
    const m = HANDOFF_RE.exec(step.text)
    if (m?.[1]) return { date: step.date, recipient: m[1] }
  }
  return null
}

/** content.documents[] → draft documents with pdf/html formats. */
export function mapDocuments(groups: RawDocumentGroup[] | null | undefined): DraftDocument[] {
  if (!Array.isArray(groups)) return []
  const result: DraftDocument[] = []
  for (const group of groups) {
    const formats: DocumentFormat[] = []
    for (const doc of group?.documents ?? []) {
      const link = doc?.link ?? ''
      const type = (doc?.type ?? '').toUpperCase()
      if (!link) continue
      if (type === 'PDF') formats.push({ type: 'pdf', url: absolutizeUrl(link) })
      else if (type === 'HTML') formats.push({ type: 'html', url: absolutizeUrl(link) })
    }
    if (formats.length > 0) {
      result.push({ title: stripHtmlToText(group?.title ?? '') || 'Dokument', formats })
    }
  }
  return result
}

/**
 * Upstream titles the stations by the document, not by the station. The
 * first entry is the Regierungsvorlage's text but is called "Gesetzestext"
 * — the same word the Ministerialentwurf's own text carries in the document
 * list on the same page, pointing at a different PDF. Rename to the station;
 * the later two already name theirs.
 */
export const RV_STATION = 'Regierungsvorlage'

const STATION_TITLES: Record<string, string> = {
  Gesetzestext: RV_STATION,
}

/**
 * content.statements.documents[] (misleading key!) → the law text at the
 * stations AFTER the Ministerialentwurf: Regierungsvorlage → geändert im
 * Ausschuss → geändert im Plenum.
 *
 * The field is "the text as it stands now", not "the text after the
 * Begutachtung": while no Regierungsvorlage exists it simply repeats the
 * draft's own Gesetzestext — in the XXVIII corpus for exactly the 42 of 132
 * consultations without an RV, byte-identical URLs, no exceptions. Those are
 * not a further version, so `excludeUrls` (the ME's own document URLs) drops
 * them and the section disappears instead of relisting the same PDF under a
 * heading that promises evolution.
 */
export function mapTextEvolution(
  groups: RawDocumentGroup[] | null | undefined,
  excludeUrls: ReadonlySet<string> = new Set(),
): TextVersion[] {
  const versions: TextVersion[] = []
  for (const doc of mapDocuments(groups)) {
    const station = STATION_TITLES[doc.title.trim()] ?? doc.title
    // Upstream's title stays the label; the id is what the comparison may
    // select. Null for the documents that share this list without being a
    // version of the law text — a Verhältnismäßigkeitsprüfung (3 drafts in
    // GP XXVI–XXVIII), a Vertragstext (2). They keep their row in the
    // document list and are never offered as a side to compare.
    const stationId = lawStationOf(station)
    for (const format of doc.formats) {
      if (excludeUrls.has(format.url)) continue
      versions.push({
        station,
        stationId,
        label: `${station} (${format.type.toUpperCase()})`,
        url: format.url,
      })
    }
  }
  return versions
}

/**
 * Block-level scanner for shortinfo HTML. Alternation groups:
 * 1 = heading level, 2 = heading body, 3 = ul|ol, 4 = list body, 5 = <p> body.
 */
const SHORTINFO_BLOCK_RE =
  /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>|<(ul|ol)\b[^>]*>([\s\S]*?)<\/\3\s*>|<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi

const LIST_ITEM_RE = /<li\b[^>]*>([\s\S]*?)<\/li\s*>/gi

/** Ministries use <br> as a paragraph break inside one <p> — split on it. */
function paragraphBlocks(html: string): DescriptionBlock[] {
  return html
    .split(/<\s*br\s*\/?\s*>/i)
    .map((chunk) => stripHtmlToText(chunk))
    .filter((text) => text.length > 0)
    .map((text) => ({ kind: 'paragraph', text }))
}

/**
 * content.shortinfo (teil1 + teil2) → typed blocks.
 *
 * Headings and lists come from the upstream TAGS, never from matching words
 * like "Ziel"/"Inhalt": the section names are ministries' free text (8/ME alone
 * adds "Hauptgesichtspunkte des Entwurfs", and writes `Inhalt&nbsp;`), the same
 * trap documented for document names in docs/api-exploration.md §1.
 * Text outside a recognised block tag is kept as loose paragraphs, not dropped.
 */
export function parseShortinfo(
  shortinfo: RawShortinfo | null | undefined,
): DescriptionBlock[] {
  if (!shortinfo) return []
  const html = [shortinfo.teil1, shortinfo.teil2].filter(Boolean).join('\n')

  const blocks: DescriptionBlock[] = []
  let cursor = 0
  SHORTINFO_BLOCK_RE.lastIndex = 0

  let match: RegExpExecArray | null
  while ((match = SHORTINFO_BLOCK_RE.exec(html)) !== null) {
    blocks.push(...paragraphBlocks(html.slice(cursor, match.index)))
    cursor = match.index + match[0].length

    if (match[2] !== undefined) {
      const text = stripHtmlToText(match[2])
      if (text) blocks.push({ kind: 'heading', text })
    } else if (match[4] !== undefined) {
      const items: string[] = []
      LIST_ITEM_RE.lastIndex = 0
      let item: RegExpExecArray | null
      while ((item = LIST_ITEM_RE.exec(match[4])) !== null) {
        const text = stripHtmlToText(item[1] ?? '')
        if (text) items.push(text)
      }
      if (items.length) blocks.push({ kind: 'list', items })
    } else {
      blocks.push(...paragraphBlocks(match[5] ?? ''))
    }
  }
  blocks.push(...paragraphBlocks(html.slice(cursor)))

  return blocks
}

/** content.names[] → minister with funktext "Übermittelt von" (submitted by). */
export function mapInvitedBy(names: RawName[] | null | undefined): string | null {
  if (!Array.isArray(names)) return null
  const entry = names.find((n) => n?.funktext === 'Übermittelt von')
  const name = entry?.name?.trim()
  return name || null
}

/**
 * content.status.bgbllinks[] of the RV → BGBl entry.
 * Selected via `Abfrage=BgblAuth` in the link — NEVER blindly [0]
 * (a "Kunsttext" entry exists alongside it).
 */
export function extractBgblLink(
  bgbllinks: RawBgblLink[] | null | undefined,
): { number: string | null; url: string } | null {
  if (!Array.isArray(bgbllinks)) return null
  const entry = bgbllinks.find((l) => (l?.link ?? '').includes('Abfrage=BgblAuth'))
  if (!entry?.link) return null
  return { number: entry.title?.trim() || null, url: entry.link }
}

/**
 * Publication order of a Bundesgesetzblatt citation as upstream words it
 * ("Bundesgesetzblatt I Nr. 65/2026"), or null for anything that is not
 * Teil I.
 *
 * WHY THE NUMBER AND NOT A DATE: within a year BGBl numbers are handed out
 * in publication order, and no date of promulgation reaches us — the
 * Parliament record carries the BGBl link without one, and every date column
 * of list 101 is the Einlangen date (`docs/api-exploration.md` §101).
 * Measured 2026-09-18 over the 30 most recently finished Vorlagen of GP
 * XXVIII: the decision dates do NOT order the promulgations (443 d.B. was
 * decided on 03.06. and published as 81/2026, after laws decided on 16.07.
 * that went out as 62–78/2026), so ordering by the number is not a
 * convenience — it is the only correct order available.
 *
 * Teil I only, deliberately: Teil III carries Staatsverträge, whose numbers
 * run in their own series, and comparing the two would interleave two
 * sequences into one wrong order. "Gesetz geworden" is Teil I anyway.
 */
export function bgblOrderKey(number: string | null | undefined): number | null {
  if (!number) return null
  const m = /\bNr\.\s*(\d+)\/(\d{4})\b/.exec(number)
  if (!m) return null
  // "Bundesgesetzblatt I Nr. …" — the part sits between the word and "Nr.".
  if (!/\bBundesgesetzblatt\s+I\s+Nr\./.test(number) && !/\bBGBl\.\s*I\s*Nr\./.test(number)) {
    return null
  }
  return Number(m[2]) * 100_000 + Number(m[1])
}
