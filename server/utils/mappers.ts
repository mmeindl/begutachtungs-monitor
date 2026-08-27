/**
 * Row/JSON mappers for the Parliament API → shared/types.
 *
 * PURE MODULE — no Nuxt auto-imports, only relative imports,
 * so vitest can execute the module directly.
 *
 * Row indices: docs/architecture.md §5 / docs/api-exploration.md §1,
 * verified live on 2026-08-15 (list 81: 18 columns, list 142: 23 columns).
 */
import type {
  ConsultationDocument,
  ConsultationSummary,
  DescriptionBlock,
  DocumentFormat,
  StatementMeta,
  TraceLink,
  TraceStep,
} from '../../shared/types'
import { GP_RE } from '../../shared/utils/gp'
import { classifySubmitter } from './privacy'

export const PARLIAMENT_BASE = 'https://www.parlament.gv.at'

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

// ---------------------------------------------------------------------------
// Base helpers: HTML → text, entities, URLs, date formats
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  shy: '',
  auml: 'ä',
  Auml: 'Ä',
  ouml: 'ö',
  Ouml: 'Ö',
  uuml: 'ü',
  Uuml: 'Ü',
  szlig: 'ß',
  eacute: 'é',
  egrave: 'è',
  agrave: 'à',
  ndash: '–',
  mdash: '—',
  sect: '§',
  euro: '€',
  hellip: '…',
  bdquo: '„',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  laquo: '«',
  raquo: '»',
}

/**
 * Only decode code points that are legal, non-control, non-surrogate text.
 * `String.fromCodePoint` THROWS a RangeError above 0x10FFFF (a crafted
 * `&#x110000;` would 500 the whole endpoint), and control characters from
 * refs like `&#8;` would make generated XML feeds not well-formed.
 */
function safeFromCodePoint(code: number): string {
  if (!Number.isInteger(code) || code > 0x10ffff) return ''
  if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) return ''
  if (code === 0x7f || (code >= 0xd800 && code <= 0xdfff)) return ''
  return String.fromCodePoint(code)
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeFromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => safeFromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name] ?? match)
}

/** Make site-relative parliament links absolute; leave absolute ones untouched. */
export function absolutizeUrl(url: string): string {
  const trimmed = url.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (trimmed.startsWith('//')) return `https:${trimmed}`
  return `${PARLIAMENT_BASE}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`
}

/** HTML → single-line plain text (tags removed, entities decoded, whitespace collapsed). */
export function stripHtmlToText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim()
}

/** Extract all <a href> pairs from an HTML fragment, absolutizing the URLs. */
export function extractLinks(html: string): TraceLink[] {
  const links: TraceLink[] = []
  const re = /<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html)) !== null) {
    const href = (match[1] ?? match[2] ?? '').trim()
    if (!href) continue
    const url = absolutizeUrl(href)
    const label = stripHtmlToText(match[3] ?? '') || url
    links.push({ label, url })
  }
  return links
}

/** Date parts (regex groups) → "yyyy-mm-dd" with a (loose) range check, else null. */
function toIsoDate(year?: string, month?: string, day?: string): string | null {
  if (!year || !month || !day) return null
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31) return null
  return `${year}-${month}-${day}`
}

/** "dd.mm.yyyy" → "yyyy-mm-dd", else null. */
export function parseGermanDate(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim())
  if (!m) return null
  const [, day, month, year] = m
  return toIsoDate(year, month, day)
}

/** ISO timestamp/date ("2026-08-03T00:00:00") → "2026-08-03", else null. */
export function parseIsoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim())
  return m?.[1] ?? null
}

/**
 * List-81 "Fristsort" (yyyymmdd as number OR string) → ISO date.
 * Empty/0/invalid → null (deadlines are optional upstream).
 */
export function parseFristsort(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const s = typeof value === 'number' ? String(value) : value.trim()
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(s)
  if (!m) return null
  const [, year, month, day] = m
  return toIsoDate(year, month, day)
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function asNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return Number(v.trim())
  return 0
}

// ---------------------------------------------------------------------------
// List 81 — Ministerialentwürfe (18 columns, 0-based)
// 0 gp · 2 inr · 4 title · 5 citation · 6 ministry code · 7 path ·
// 8 deadline (display) · 10 arrival (ISO datesort) · 11 active 'J' ·
// 13 statement count · 14 fristsort yyyymmdd · 16 full ministry name
// ---------------------------------------------------------------------------

export function mapConsultationRow(row: unknown[]): ConsultationSummary {
  const gp = asString(row[0])
  const inr = asNumber(row[2])
  const path = asString(row[7]) || `/gegenstand/${gp}/ME/${inr}`
  return {
    gp,
    inr,
    citation: asString(row[5]),
    title: stripHtmlToText(asString(row[4])),
    ministryCode: asString(row[6]),
    ministryName: asString(row[16]),
    arrivedAt: parseIsoDate(row[10]) ?? parseGermanDate(asString(row[3])) ?? '',
    deadline: parseFristsort(row[14] as number | string | null | undefined),
    active: row[11] === 'J',
    statementCount: asNumber(row[13]),
    parliamentUrl: absolutizeUrl(path),
  }
}

// ---------------------------------------------------------------------------
// List 142 — Stellungnahmen (23 columns, 0-based)
// 0 gp · 2 snmeInr · 4 date (display) · 5 dateSort (ISO) ·
// 6 submitter (HTML <a> or placeholder text) · 12 endorsements ·
// 15 citation
// Deviation from §5 noted: [5] DATUM_SORT is ISO and preferred;
// [4] (dd.mm.yyyy) serves only as fallback.
// ---------------------------------------------------------------------------

/**
 * Display normalization for organisation names, whitespace/separators ONLY:
 * upstream free text carries space runs and inconsistent separator spacing
 * ("Fakultät ; Institut" vs. "Fakultät; Institut"), which renders as
 * duplicate-looking rows. Deliberately NO fuzzy matching or grouping —
 * distinct institutes of one organisation must stay distinct.
 */
export function normalizeOrgName(name: string): string {
  return name
    .replace(/\s+/g, ' ')
    // "Fakultät ; Institut" / "Arbeiter,und" → "Fakultät; Institut" /
    // "Arbeiter, und". Letter-lookahead spares decimal commas ("1,5").
    .replace(/\s*([;,])\s*(?=\p{L})/gu, '$1 ')
    .trim()
}

export function mapStatementRow(row: unknown[]): StatementMeta {
  const gp = asString(row[0])
  const snmeInr = asNumber(row[2])
  const citation = asString(row[15])

  // "<a …>Mustermann, Maria (237/SN-126/ME)</a>" → "Mustermann, Maria"
  const rawSubmitter = stripHtmlToText(asString(row[6])).replace(
    /\s*\(\d+\/SN-[^)]*\)\s*$/,
    '',
  )
  const { kind, name } = classifySubmitter(rawSubmitter)

  return {
    citation,
    date: parseIsoDate(row[5]) ?? parseGermanDate(asString(row[4])),
    submitterKind: kind,
    submitterName: name !== null ? normalizeOrgName(name) : null,
    endorsements: asNumber(row[12]),
    parliamentUrl: `${PARLIAMENT_BASE}/gegenstand/${gp}/SNME/${snmeInr}`,
  }
}

// ---------------------------------------------------------------------------
// Detail JSON: stages, documents, text evolution, short info, RV/BGBl
// ---------------------------------------------------------------------------

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
}

/**
 * LAST /gegenstand/{gp}/I/{nr} link in the process history = latest
 * Regierungsvorlage (ME→RV is 1:n, docs/architecture.md §5).
 */
export function findLastRvLink(trace: TraceStep[]): RvLink | null {
  let found: RvLink | null = null
  for (const step of trace) {
    for (const link of step.links) {
      const m = /\/gegenstand\/([IVXLC]+)\/I\/(\d+)(?:[/?#]|$)/.exec(link.url)
      if (m?.[1] && m[2]) {
        found = {
          gp: m[1],
          inr: Number(m[2]),
          label: link.label || `${m[2]} d.B.`,
          url: link.url,
        }
      }
    }
  }
  return found
}

/** content.documents[] → draft documents with pdf/html formats. */
export function mapDocuments(groups: RawDocumentGroup[] | null | undefined): ConsultationDocument[] {
  if (!Array.isArray(groups)) return []
  const result: ConsultationDocument[] = []
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
 * content.statements.documents[] (misleading key!) → text-evolution links:
 * Gesetzestext (RV) → amended in committee → amended in plenary.
 */
export function mapTextEvolution(groups: RawDocumentGroup[] | null | undefined): TraceLink[] {
  const links: TraceLink[] = []
  for (const doc of mapDocuments(groups)) {
    for (const format of doc.formats) {
      links.push({ label: `${doc.title} (${format.type.toUpperCase()})`, url: format.url })
    }
  }
  return links
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

// ---------------------------------------------------------------------------
// Roman numerals (GP codes) — for availableGps
// ---------------------------------------------------------------------------

const ROMAN_TOKENS: [string, number][] = [
  ['C', 100],
  ['XC', 90],
  ['L', 50],
  ['XL', 40],
  ['X', 10],
  ['IX', 9],
  ['V', 5],
  ['IV', 4],
  ['I', 1],
]

export function intToRoman(n: number): string {
  if (!Number.isInteger(n) || n <= 0 || n > 399) return ''
  let rest = n
  let out = ''
  for (const [token, value] of ROMAN_TOKENS) {
    while (rest >= value) {
      out += token
      rest -= value
    }
  }
  return out
}

/** Strict inverse — "IIX" and the like → null. */
export function romanToInt(roman: string): number | null {
  if (!GP_RE.test(roman)) return null
  let total = 0
  let i = 0
  for (const [token, value] of ROMAN_TOKENS) {
    while (roman.startsWith(token, i)) {
      total += value
      i += token.length
    }
  }
  if (i !== roman.length) return null
  return intToRoman(total) === roman ? total : null
}
