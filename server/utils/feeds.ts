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
import type { DraftSummary, RisConsultation } from '../../shared/types'
import { formatDateDe } from '../../shared/utils/format'
import { RIS_KIND_LABEL, risFilingNote } from '../../shared/utils/risConsultations'

/** Draft page URL inside the monitor. */
function pageUrl(siteUrl: string, item: DraftSummary): string {
  return `${siteUrl}/entwuerfe/${item.gp}/${item.inr}`
}

/**
 * Page URL of a Begutachtung without a parliamentary Gegenstand — the same
 * `/entwuerfe/` namespace as a draft's since 18.09.2026, told apart by the
 * RIS id instead of by a second path (docs/architecture.md §12.19). The
 * feed UIDs below deliberately do not derive from this, so the move costs
 * subscribers nothing.
 */
function risPageUrl(siteUrl: string, item: RisConsultation): string {
  return `${siteUrl}/entwuerfe/${item.id}`
}

/**
 * FROZEN — the feed UID domain token. Deliberately NOT derived from siteUrl:
 * UIDs must survive a domain move or product rename, otherwise every
 * subscriber gets 132 duplicate events after the switch. Treat as opaque.
 */
const FEED_UID_DOMAIN = 'begutachtungs-monitor.at'

/**
 * ONE identity per Entwurf, in both feeds: the RSS guid and the ICS UID are
 * the same string. It is built from gp and inr, never from the URL — a
 * subscriber's read-state must not depend on our route scheme, which is
 * exactly what the rename of the detail route would otherwise have cost
 * them.
 */
const feedUid = (item: DraftSummary) =>
  `me-${item.gp}-${item.inr}@${FEED_UID_DOMAIN}`

/**
 * The same identity rule for a Begutachtung without a Gegenstand: built from
 * the RIS document ID, which is the only stable handle these records have —
 * they carry no Geschäftszahl. The `ris-` prefix keeps the two namespaces
 * apart forever, so a subscriber's read-state cannot collide.
 */
const risFeedUid = (item: RisConsultation) => `ris-${item.id}@${FEED_UID_DOMAIN}`

/**
 * One entry, whatever it came from — the shape both builders sort and print.
 *
 * Introduced so the Verordnungsentwürfe reach the feeds by the same path as
 * the Ministerialentwürfe rather than by a parallel one: a subscriber asked
 * for "what is in Begutachtung", and answering that with only Parliament's
 * half is the very claim this work exists to correct.
 */
interface FeedEntry {
  uid: string
  url: string
  /** Leading text of the RSS title, before the Frist suffix. */
  title: string
  /** The RSS description line and the ICS DESCRIPTION prefix. */
  meta: string
  /** ISO date the item first appeared; '' when upstream has none. */
  publishedAt: string
  deadline: string | null
  /** SUMMARY of the calendar event. */
  calendarSummary: string
  /**
   * DESCRIPTION of the calendar event, before the URL. Kept separate from
   * `meta`: the RSS description leads with the Frist, which is the fact a
   * reader triages by — inside a calendar entry ON that date it would only
   * repeat what the event already is.
   */
  calendarDescription: string
  /** Stable tie-break within one date. */
  tieBreak: string
}

function draftEntry(siteUrl: string, item: DraftSummary): FeedEntry {
  return {
    uid: feedUid(item),
    url: pageUrl(siteUrl, item),
    title: `${item.citation}: ${item.title}`,
    // No statement count: guid-keyed readers freeze first-seen text, and the
    // count is near zero at publication — frozen forever.
    meta: [
      item.ministryName,
      item.deadline ? `Frist bis ${formatDateDe(item.deadline)}` : 'Ohne Frist',
    ].join(' · '),
    publishedAt: item.arrivedAt,
    deadline: item.deadline,
    calendarSummary: `Frist: ${item.title} (${item.citation})`,
    calendarDescription: item.ministryName,
    tieBreak: String(item.inr).padStart(9, '0'),
  }
}

function risEntry(siteUrl: string, item: RisConsultation): FeedEntry {
  const kind = RIS_KIND_LABEL[item.kind]
  return {
    uid: risFeedUid(item),
    url: risPageUrl(siteUrl, item),
    // The type word leads, where a Ministerialentwurf has its citation:
    // in a reader's list view it is the only thing that says why this
    // entry has no Stellungnahmen and no parliamentary page.
    title: `${kind}: ${item.title}`,
    meta: [
      item.ministryName,
      item.deadline ? `Frist bis ${formatDateDe(item.deadline)}` : 'Ohne Frist',
      risFilingNote(item.active),
    ].join(' · '),
    publishedAt: item.startedAt ?? '',
    deadline: item.deadline,
    calendarSummary: `Frist: ${item.title} (${kind})`,
    // The ministry AND the reason there is no parliament page: a calendar
    // entry is often read without the page behind it, and "send it where?"
    // is the only open question these procedures leave.
    calendarDescription: `${item.ministryName} – ${risFilingNote(item.active)}`,
    tieBreak: item.id,
  }
}

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
/**
 * FNV-1a 64-bit, as two 32-bit halves.
 *
 * The readable implementation uses BigInt, and this one did — but BigInt
 * *literals* are ES2020 while the server bundle is transpiled to ES2019, so
 * esbuild warned "may crash at run-time" on every build. Writing `BigInt(…)`
 * instead would only silence the warning: the arithmetic needs ES2020 either
 * way. Four 16-bit limbs need nothing beyond ES5, and save allocating a
 * BigInt per byte of every feed response.
 *
 * The multiply is four products rather than sixteen because only two limbs
 * of the prime 0x100000001b3 are non-zero: 0x01b3 at 2^0 and 0x0100 at 2^32.
 * Every intermediate stays below 2^31, so the shifts are safe.
 */
export function fnv1a64(bytes: Uint8Array): { hi: number; lo: number } {
  // Offset basis 0xcbf29ce484222325, least significant limb first.
  let h0 = 0x2325
  let h1 = 0x8422
  let h2 = 0x9ce4
  let h3 = 0xcbf2
  for (const byte of bytes) {
    h0 ^= byte
    const t0 = h0 * 0x01b3
    const t1 = h1 * 0x01b3
    const t2 = h2 * 0x01b3 + h0 * 0x0100
    const t3 = h3 * 0x01b3 + h1 * 0x0100
    const s1 = t1 + (t0 >>> 16)
    const s2 = t2 + (s1 >>> 16)
    const s3 = t3 + (s2 >>> 16)
    h0 = t0 & 0xffff
    h1 = s1 & 0xffff
    h2 = s2 & 0xffff
    h3 = s3 & 0xffff
  }
  return { hi: h3 * 0x10000 + h2, lo: h1 * 0x10000 + h0 }
}

/**
 * Strong ETag for a deterministic feed body — dependency-free (the server
 * tsconfig has no Node types, so no node:crypto here). Cache validation
 * needs collision-unlikeliness, not cryptographic strength.
 *
 * The low half is padded to the 7 base-36 digits 2^32-1 occupies, so the two
 * halves cannot run together into an ambiguous string.
 */
export function bodyEtag(body: string): string {
  const { hi, lo } = fnv1a64(utf8.encode(body))
  return `"${hi.toString(36)}${lo.toString(36).padStart(7, '0')}-${body.length.toString(36)}"`
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
const XML_ILLEGAL_RE =
  // eslint-disable-next-line no-control-regex -- the control characters are the subject here: they are what XML forbids
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
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
 *
 * With `ressort` the channel is scoped to one ministry (entity-scoped
 * following): title and self-link carry the scope so a reader's
 * subscription list stays legible. Filtering the items is the caller's
 * job — the builder only labels what it is given.
 */
export function buildRssFeed(
  siteUrl: string,
  items: DraftSummary[],
  ressort?: { code: string; name: string | null },
  risItems: RisConsultation[] = [],
): string {
  const sorted = [...items.map((i) => draftEntry(siteUrl, i)), ...risItems.map((i) => risEntry(siteUrl, i))]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || b.tieBreak.localeCompare(a.tieBreak))
    .slice(0, RSS_MAX_ITEMS)

  const entries = sorted.map((entry) => {
    // Deadline into the TITLE: list views of most readers show titles
    // only, and the Frist is the one fact a subscriber triages by.
    const fristSuffix = entry.deadline
      ? ` – Frist ${entry.deadline.slice(8, 10)}.${entry.deadline.slice(5, 7)}.`
      : ''
    const pubDate = rfc1123(entry.publishedAt)
    return [
      '    <item>',
      `      <title>${escapeXml(`${entry.title}${fristSuffix}`)}</title>`,
      `      <link>${escapeXml(entry.url)}</link>`,
      // isPermaLink="false": the guid is an identity, not an address. It
      // was the page URL until the route rename, so subscribers see the
      // current items once more — a one-time cost, paid to make every later
      // URL change free.
      `      <guid isPermaLink="false">${escapeXml(entry.uid)}</guid>`,
      ...(pubDate ? [`      <pubDate>${pubDate}</pubDate>`] : []),
      `      <description>${escapeXml(entry.meta)}</description>`,
      '    </item>',
    ].join('\n')
  })

  const lastBuild = sorted[0] ? rfc1123(sorted[0].publishedAt) : null

  const channelTitle = ressort
    ? `Begutachtungs-Monitor – Begutachtungsverfahren (${ressort.name ?? ressort.code})`
    : 'Begutachtungs-Monitor – Begutachtungsverfahren'
  const selfUrl = ressort
    ? `${siteUrl}/feed.xml?ressort=${encodeURIComponent(ressort.code)}`
    : `${siteUrl}/feed.xml`

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeXml(channelTitle)}</title>`,
    `    <link>${escapeXml(siteUrl)}</link>`,
    // "Gesetzes- und Verordnungsentwürfen": the feed stopped being about
    // Parliament's half only when the RIS records joined it, and a channel
    // description that names one half is the same wrong claim the homepage
    // heading carried (docs/architecture.md §12.16).
    '    <description>Neue Begutachtungsverfahren zu österreichischen Gesetzes- und Verordnungsentwürfen: Fristen, Stellungnahmen und was daraus wurde.</description>',
    '    <language>de-at</language>',
    `    <atom:link href="${escapeXml(selfUrl)}" rel="self" type="application/rss+xml"/>`,
    ...(lastBuild ? [`    <lastBuildDate>${lastBuild}</lastBuildDate>`] : []),
    ...entries,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Sitemap
// ---------------------------------------------------------------------------

/**
 * Sitemap of the static pages plus every draft detail page of the
 * current GP — organic search for a draft's name is how citizens who
 * submitted input find their consultation. Deterministic (no timestamps):
 * upstream provides no reliable per-item change date, and a wrong lastmod
 * is worse for crawlers than none.
 */
export function buildSitemap(
  siteUrl: string,
  items: DraftSummary[],
  risItems: RisConsultation[] = [],
): string {
  const urls = [
    siteUrl,
    // One list for both kinds since 17.09.2026 and one URL namespace since
    // 18.09.2026 (docs/architecture.md §12.19); everything under
    // `/weitere-entwuerfe` 301s into it and a sitemap must not advertise a
    // redirect.
    `${siteUrl}/entwuerfe`,
    `${siteUrl}/so-funktionierts`,
    `${siteUrl}/ueber`,
    `${siteUrl}/impressum`,
    `${siteUrl}/datenschutz`,
    ...items.map((item) => pageUrl(siteUrl, item)),
    // The same reasoning as for the drafts: searching a Verordnung by name
    // is how someone affected by it finds the consultation at all — and for
    // these there is no parliament page competing for the result.
    ...risItems.map((item) => risPageUrl(siteUrl, item)),
  ]
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((u) => `  <url><loc>${escapeXml(u)}</loc></url>`),
    '</urlset>',
    '',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// iCalendar (RFC 5545)
// ---------------------------------------------------------------------------

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
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
export function buildIcsCalendar(
  siteUrl: string,
  items: DraftSummary[],
  risItems: RisConsultation[] = [],
): string {
  const withDeadline = [
    ...items.map((i) => draftEntry(siteUrl, i)),
    ...risItems.map((i) => risEntry(siteUrl, i)),
  ]
    .filter((e): e is FeedEntry & { deadline: string } => e.deadline !== null)
    .sort((a, b) => a.deadline.localeCompare(b.deadline) || a.tieBreak.localeCompare(b.tieBreak))

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

  for (const entry of withDeadline) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${entry.uid}`,
      // DTSTAMP derives from the DEADLINE, not the arrival date: when a
      // ministry extends a Frist, DTSTAMP moves forward with it, so
      // UID-merging import paths (Google/Outlook file import) accept the
      // update instead of silently keeping the stale deadline. Still
      // deterministic — no Date.now().
      `DTSTAMP:${icsDate(entry.deadline)}T000000Z`,
      `DTSTART;VALUE=DATE:${icsDate(entry.deadline)}`,
      `DTEND;VALUE=DATE:${icsDateNextDay(entry.deadline)}`,
      `SUMMARY:${escapeIcsText(entry.calendarSummary)}`,
      `DESCRIPTION:${escapeIcsText(`${entry.calendarDescription} – ${entry.url}`)}`,
      `URL:${entry.url}`,
      // Informational deadlines must not block subscribers' days as "busy".
      'TRANSP:TRANSPARENT',
      'X-MICROSOFT-CDO-BUSYSTATUS:FREE',
      'END:VEVENT',
    )
  }

  lines.push('END:VCALENDAR')
  return `${lines.flatMap(foldIcsLine).join('\r\n')}\r\n`
}
