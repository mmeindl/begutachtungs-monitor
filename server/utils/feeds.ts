/**
 * RSS 2.0 and iCalendar (RFC 5545) feed builders — the "subscribe" layer
 * (docs/architecture.md §12.3: feeds now, e-mail alerts later).
 *
 * PURE MODULE — no Nuxt auto-imports, only relative imports, so vitest can
 * execute it directly. Both builders are deterministic for a given item
 * list: no `Date.now()`, all timestamps derive from item data — including
 * the RSS descriptions (absolute dates, never "noch N Tage" countdowns:
 * guid-keyed readers freeze the first-seen text forever, content-tracking
 * readers would surface daily phantom updates). Deterministic bodies are
 * also what make the routes' ETag/304 handling effective.
 */
import type { ConsultationSummary } from '../../shared/types'
import { countLabelDe, formatDateDe } from '../../shared/utils/format'

/** Consultation page URL inside the monitor. */
function pageUrl(siteUrl: string, item: ConsultationSummary): string {
  return `${siteUrl}/begutachtungen/${item.gp}/${item.inr}`
}

/**
 * Strong ETag for a deterministic feed body — FNV-1a 64-bit, dependency-free
 * (the server tsconfig has no Node types, so no node:crypto here). Cache
 * validation needs collision-unlikeliness, not cryptographic strength.
 */
export function bodyEtag(body: string): string {
  let hash = 0xcbf29ce484222325n
  const prime = 0x100000001b3n
  const mask = 0xffffffffffffffffn
  for (const byte of utf8.encode(body)) {
    hash ^= BigInt(byte)
    hash = (hash * prime) & mask
  }
  return `"${hash.toString(36)}-${body.length.toString(36)}"`
}

// ---------------------------------------------------------------------------
// RSS 2.0
// ---------------------------------------------------------------------------

const RSS_MAX_ITEMS = 50

/**
 * Characters that are illegal in XML 1.0 even when escaped (plus lone
 * surrogates). One such character anywhere makes the whole document not
 * well-formed — strict parsers reject the entire feed, not just one item.
 */
// eslint-disable-next-line no-control-regex
const XML_ILLEGAL_RE =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

export function escapeXml(s: string): string {
  return s
    .replace(XML_ILLEGAL_RE, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * "2025-04-08" → "Tue, 08 Apr 2025 00:00:00 GMT" (RFC 1123, as RSS expects).
 * Null for anything unparseable — the mapper falls back to '' for broken
 * upstream dates, and an omitted pubDate degrades far more gracefully in
 * readers than the literal string "Invalid Date".
 */
function rfc1123(isoDate: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null
  const d = new Date(`${isoDate}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d.toUTCString()
}

/**
 * RSS feed of consultations, newest arrival first. Deterministic:
 * lastBuildDate is the newest item's arrival date, not "now".
 */
export function buildRssFeed(siteUrl: string, items: ConsultationSummary[]): string {
  const sorted = [...items]
    .sort((a, b) => b.arrivedAt.localeCompare(a.arrivedAt) || b.inr - a.inr)
    .slice(0, RSS_MAX_ITEMS)

  const entries = sorted.map((item) => {
    const url = pageUrl(siteUrl, item)
    const description = [
      item.ministryName,
      item.deadline ? `Frist bis ${formatDateDe(item.deadline)}` : 'Ohne Frist',
      countLabelDe(item.statementCount, 'Stellungnahme', 'Stellungnahmen'),
    ].join(' · ')
    const pubDate = rfc1123(item.arrivedAt)
    return [
      '    <item>',
      `      <title>${escapeXml(`${item.citation}: ${item.title}`)}</title>`,
      `      <link>${escapeXml(url)}</link>`,
      `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
      ...(pubDate ? [`      <pubDate>${pubDate}</pubDate>`] : []),
      `      <description>${escapeXml(description)}</description>`,
      '    </item>',
    ].join('\n')
  })

  const lastBuild = sorted[0] ? rfc1123(sorted[0].arrivedAt) : null

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    '    <title>Begutachtungs-Monitor – Begutachtungsverfahren</title>',
    `    <link>${escapeXml(siteUrl)}</link>`,
    '    <description>Neue Begutachtungsverfahren zu österreichischen Gesetzesentwürfen: Fristen, Stellungnahmen und was daraus wurde.</description>',
    '    <language>de-at</language>',
    `    <atom:link href="${escapeXml(`${siteUrl}/feed.xml`)}" rel="self" type="application/rss+xml"/>`,
    ...(lastBuild ? [`    <lastBuildDate>${lastBuild}</lastBuildDate>`] : []),
    ...entries,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// iCalendar (RFC 5545)
// ---------------------------------------------------------------------------

/**
 * FROZEN — the UID domain token. Deliberately NOT derived from siteUrl:
 * UIDs must survive a domain move or product rename, otherwise every
 * subscriber gets 132 duplicate events after the switch. Treat as opaque.
 */
const ICS_UID_DOMAIN = 'begutachtungs-monitor.at'

/** TEXT escaping per RFC 5545 §3.3.11 — backslash first, then , ; newline.
 * TEXT values only; URI values (URL property) are emitted raw. */
export function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

const utf8 = new TextEncoder()

/**
 * Content-line folding per RFC 5545 §3.1: lines longer than 75 octets are
 * split; continuation lines begin with a single space. Folding happens
 * between code points (never inside a UTF-8 sequence).
 */
export function foldIcsLine(line: string): string[] {
  const out: string[] = []
  let current = ''
  let bytes = 0
  // First line may carry 75 octets; continuations start with " " (1 octet).
  let limit = 75
  for (const ch of line) {
    const chBytes = utf8.encode(ch).length
    if (bytes + chBytes > limit) {
      out.push(current)
      current = ' '
      bytes = 1
      limit = 75
    }
    current += ch
    bytes += chBytes
  }
  out.push(current)
  return out
}

/** "2025-06-03" → "20250603" */
function icsDate(isoDate: string): string {
  return isoDate.replaceAll('-', '')
}

/** Day after an ISO date (all-day DTEND is exclusive per RFC 5545). */
function icsDateNextDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10).replaceAll('-', '')
}

/**
 * Calendar of Begutachtungsfristen as all-day events — every consultation
 * of the GP that has a deadline, past ones included (dropping them would
 * delete events from subscribed calendars). UIDs are stable per procedure.
 */
export function buildIcsCalendar(siteUrl: string, items: ConsultationSummary[]): string {
  const withDeadline = items
    .filter((item): item is ConsultationSummary & { deadline: string } => item.deadline !== null)
    .sort((a, b) => a.deadline.localeCompare(b.deadline) || a.inr - b.inr)

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Begutachtungs-Monitor//Fristen//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Begutachtungsfristen',
    // Refresh hints (RFC 7986 + de-facto): consultation windows run only
    // 2–6 weeks; the clients that honor these must not default to weekly.
    'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
    'X-PUBLISHED-TTL:PT12H',
  ]

  for (const item of withDeadline) {
    const url = pageUrl(siteUrl, item)
    lines.push(
      'BEGIN:VEVENT',
      `UID:me-${item.gp}-${item.inr}@${ICS_UID_DOMAIN}`,
      // DTSTAMP derives from the DEADLINE, not the arrival date: when a
      // ministry extends a Frist, DTSTAMP moves forward with it, so
      // UID-merging import paths (Google/Outlook file import) accept the
      // update instead of silently keeping the stale deadline. Still
      // deterministic — no Date.now().
      `DTSTAMP:${icsDate(item.deadline)}T000000Z`,
      `DTSTART;VALUE=DATE:${icsDate(item.deadline)}`,
      `DTEND;VALUE=DATE:${icsDateNextDay(item.deadline)}`,
      `SUMMARY:${escapeIcsText(`Frist: ${item.title} (${item.citation})`)}`,
      `DESCRIPTION:${escapeIcsText(`${item.ministryName} – ${url}`)}`,
      `URL:${url}`,
      // Informational deadlines must not block subscribers' days as "busy".
      'TRANSP:TRANSPARENT',
      'X-MICROSOFT-CDO-BUSYSTATUS:FREE',
      'END:VEVENT',
    )
  }

  lines.push('END:VCALENDAR')
  return `${lines.flatMap(foldIcsLine).join('\r\n')}\r\n`
}
