import { describe, expect, it } from 'vitest'
import { draftSummary as draft, risConsultation } from './helpers/builders'
import {
  bodyEtag,
  buildIcsCalendar,
  buildRssFeed,
  buildSitemap,
  escapeIcsText,
  escapeXml,
  fnv1a64,
  foldIcsLine,
} from '../server/utils/feeds'

const SITE = 'https://begutachtungs-monitor.at'

/** 88/ME and the DGAV-Verordnung — the specimens the shared builders default to. */

describe('escapeXml', () => {
  it('escapes all five XML special characters', () => {
    expect(escapeXml(`<a & "b" 'c'>`)).toBe('&lt;a &amp; &quot;b&quot; &apos;c&apos;&gt;')
  })

  it('strips characters that are illegal in XML 1.0 even when escaped', () => {
    expect(escapeXml('a\u0008b\u0000c\u001fd')).toBe('abcd')
    expect(escapeXml('ok\ttab\nnewline')).toBe('ok\ttab\nnewline')
  })

  it('strips lone surrogates but keeps valid pairs', () => {
    expect(escapeXml('a\uD800b')).toBe('ab')
    expect(escapeXml('a😀b')).toBe('a😀b')
  })
})

describe('buildRssFeed', () => {
  it('produces a channel with self-link and the item, escaped', () => {
    const xml = buildRssFeed(SITE, [draft({ title: 'Bäckerei & Konditorei' })])
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain(`<atom:link href="${SITE}/feed.xml" rel="self"`)
    expect(xml).toContain('<title>88/ME: Bäckerei &amp; Konditorei – Frist 08.04.</title>')
    expect(xml).toContain(`<link>${SITE}/entwuerfe/XXVIII/88</link>`)
    // Identity, not address: the same string the ICS feed uses as UID, so a
    // route rename never costs subscribers their read-state again.
    expect(xml).toContain('<guid isPermaLink="false">me-XXVIII-88@begutachtungs-monitor.at</guid>')
  })

  it('formats pubDate as RFC 1123', () => {
    const xml = buildRssFeed(SITE, [draft({ arrivedAt: '2026-03-11' })])
    expect(xml).toContain('<pubDate>Wed, 11 Mar 2026 00:00:00 GMT</pubDate>')
  })

  it('sorts newest arrival first and caps at 50 items', () => {
    const many = Array.from({ length: 55 }, (_, i) =>
      draft({ inr: i + 1, citation: `${i + 1}/ME`, arrivedAt: `2026-01-${String((i % 28) + 1).padStart(2, '0')}` }),
    )
    const xml = buildRssFeed(SITE, many)
    expect((xml.match(/<item>/g) ?? []).length).toBe(50)
    const firstPubDate = xml.match(/<pubDate>([^<]+)<\/pubDate>/g)?.[0]
    expect(firstPubDate).toContain('28 Jan 2026')
  })

  it('handles an empty list without lastBuildDate', () => {
    const xml = buildRssFeed(SITE, [])
    expect(xml).not.toContain('lastBuildDate')
    expect(xml).toContain('</rss>')
  })

  it('uses stable absolute dates in descriptions, never countdowns', () => {
    const xml = buildRssFeed(SITE, [draft({ deadline: '2026-04-08', active: true })])
    expect(xml).toContain('Frist bis 08.04.2026')
    expect(xml).not.toMatch(/[Nn]och \d+ Tag/)
  })

  it('omits the Frist title suffix and keeps "Ohne Frist" without a deadline', () => {
    const xml = buildRssFeed(SITE, [draft({ deadline: null })])
    expect(xml).toContain('<title>88/ME: Umsatzsteuergesetz, Änderung</title>')
    expect(xml).toContain('Ohne Frist')
  })

  it('leaves the volatile statement count out of descriptions (frozen in readers)', () => {
    const xml = buildRssFeed(SITE, [draft({ statementCount: 707 })])
    expect(xml).not.toContain('707 Stellungnahmen')
  })

  it('omits pubDate (and lastBuildDate) for unparseable arrival dates', () => {
    const xml = buildRssFeed(SITE, [draft({ arrivedAt: '' })])
    expect(xml).not.toContain('pubDate')
    expect(xml).not.toContain('Invalid Date')
    expect(xml).not.toContain('lastBuildDate')
  })

  it('scopes channel title and self-link to a Ressort when given', () => {
    const xml = buildRssFeed(SITE, [draft()], {
      code: 'BMF',
      name: 'Bundesministerium für Finanzen',
    })
    expect(xml).toContain(
      '<title>Begutachtungs-Monitor – Begutachtungsverfahren (Bundesministerium für Finanzen)</title>',
    )
    expect(xml).toContain(`<atom:link href="${SITE}/feed.xml?ressort=BMF" rel="self"`)
  })

  it('falls back to the Ressort code when no name is known', () => {
    const xml = buildRssFeed(SITE, [], { code: 'BMF', name: null })
    expect(xml).toContain('(BMF)</title>')
    expect(xml).toContain('</rss>')
  })
})

describe('buildSitemap', () => {
  it('lists the static pages plus one loc per consultation', () => {
    const xml = buildSitemap(SITE, [draft()])
    expect(xml).toContain(`<loc>${SITE}</loc>`)
    expect(xml).toContain(`<loc>${SITE}/entwuerfe</loc>`)
    expect(xml).toContain(`<loc>${SITE}/so-funktionierts</loc>`)
    expect(xml).toContain(`<loc>${SITE}/ueber</loc>`)
    expect(xml).toContain(`<loc>${SITE}/impressum</loc>`)
    expect(xml).toContain(`<loc>${SITE}/datenschutz</loc>`)
    expect(xml).toContain(`<loc>${SITE}/entwuerfe/XXVIII/88</loc>`)
  })

  it('yields only the static pages for an empty list, well-formed', () => {
    const xml = buildSitemap(SITE, [])
    expect(xml.match(/<loc>/g)).toHaveLength(6)
    // `/suche` does NOT belong in here any more since 22.09.2026: the page
    // is gone, the field on `/entwuerfe` answers both (§12.31), and the path
    // 301s there — a sitemap must not advertise a redirect.
    expect(xml).not.toContain(`${SITE}/suche`)
    // Nothing under `/weitere-entwuerfe` belongs in a sitemap: the list is
    // a filter on /entwuerfe since 17.09.2026 and the detail pages moved
    // into the same namespace on 18.09.2026, so every old path is a 301 —
    // and a sitemap must not advertise a redirect.
    expect(xml).not.toContain(`${SITE}/weitere-entwuerfe`)
    expect(xml).toContain(`<loc>${SITE}/entwuerfe</loc>`)
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(xml.trimEnd().endsWith('</urlset>')).toBe(true)
  })

  it('lists a RIS-only consultation in the same /entwuerfe namespace as a draft', () => {
    const xml = buildSitemap(SITE, [draft()], [risConsultation()])
    expect(xml).toContain(
      `<loc>${SITE}/entwuerfe/BEGUT_C769778C_3342_41D1_A1DF_931D7F4BBF1B</loc>`,
    )
    expect(xml).toContain(`<loc>${SITE}/entwuerfe/XXVIII/88</loc>`)
    // One prefix for both kinds — a crawler (and a reader guessing a URL)
    // never has to know which half of the corpus a draft is in.
    expect(xml).not.toContain(`${SITE}/weitere-entwuerfe`)
  })
})

/**
 * Reverse of the RFC 5545 §3.1 folding, so an assertion can read the logical
 * content line. Without it every check on a DESCRIPTION longer than 75
 * octets fails on a `\r\n ` the spec requires to be there — which says
 * nothing about the value under test.
 */
const unfoldIcs = (ics: string) => ics.replaceAll('\r\n ', '')

describe('feeds carry the Begutachtungen without a parliamentary Gegenstand', () => {
  it('names the kind in the RSS title and the reason in the description', () => {
    const xml = buildRssFeed(SITE, [], undefined, [risConsultation()])
    expect(xml).toContain(
      '<title>Verordnungsentwurf: Änderung der Druckgeräteaufstellungsverordnung – DGAV – Frist 19.10.</title>',
    )
    expect(xml).toContain('Stellungnahme direkt ans Ministerium')
    expect(xml).toContain(`<link>${SITE}/entwuerfe/BEGUT_C769778C_3342_41D1_A1DF_931D7F4BBF1B</link>`)
  })

  it('keeps the two UID namespaces apart so read-state cannot collide', () => {
    const xml = buildRssFeed(SITE, [draft()], undefined, [risConsultation()])
    expect(xml).toContain('<guid isPermaLink="false">me-XXVIII-88@begutachtungs-monitor.at</guid>')
    expect(xml).toContain(
      '<guid isPermaLink="false">ris-BEGUT_C769778C_3342_41D1_A1DF_931D7F4BBF1B@begutachtungs-monitor.at</guid>',
    )
  })

  it('interleaves both kinds by date rather than appending one after the other', () => {
    const xml = buildRssFeed(
      SITE,
      [draft({ inr: 1, citation: '1/ME', arrivedAt: '2026-09-10' })],
      undefined,
      [
        risConsultation({ id: 'BEGUT_A', startedAt: '2026-09-15' }),
        risConsultation({ id: 'BEGUT_B', startedAt: '2026-09-01' }),
      ],
    )
    const order = [...xml.matchAll(/isPermaLink="false">([^<]+)</g)].map((m) => m[1])
    expect(order).toEqual([
      'ris-BEGUT_A@begutachtungs-monitor.at',
      'me-XXVIII-1@begutachtungs-monitor.at',
      'ris-BEGUT_B@begutachtungs-monitor.at',
    ])
  })

  it('emits a calendar event whose description says where a Stellungnahme goes', () => {
    const ics = unfoldIcs(buildIcsCalendar(SITE, [], [risConsultation()]))
    expect(ics).toContain('UID:ris-BEGUT_C769778C_3342_41D1_A1DF_931D7F4BBF1B@begutachtungs-monitor.at')
    expect(ics).toContain('DTSTART;VALUE=DATE:20261019')
    expect(ics).toContain('Stellungnahme direkt ans Ministerium')
    expect(ics).toContain(`URL:${SITE}/entwuerfe/BEGUT_C769778C_3342_41D1_A1DF_931D7F4BBF1B`)
  })

  it('skips a RIS record without a deadline, like a draft without one', () => {
    const ics = buildIcsCalendar(SITE, [], [risConsultation({ deadline: null })])
    expect(ics).not.toContain('BEGIN:VEVENT')
  })

  it('leaves the draft calendar description unchanged (subscribers keep theirs)', () => {
    const ics = unfoldIcs(buildIcsCalendar(SITE, [draft()]))
    expect(ics).toContain(
      `DESCRIPTION:Bundesministerium für Finanzen – ${SITE}/entwuerfe/XXVIII/88`,
    )
    // The Frist belongs in the RSS description, not here: inside a calendar
    // entry ON that date it would only repeat what the event already is.
    expect(ics).not.toContain('Frist bis')
  })
})

describe('escapeIcsText', () => {
  it('escapes backslash, semicolon, comma, and newline', () => {
    expect(escapeIcsText('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne')
  })
})

describe('foldIcsLine', () => {
  it('leaves short lines alone', () => {
    expect(foldIcsLine('SUMMARY:kurz')).toEqual(['SUMMARY:kurz'])
  })

  it('folds long lines at 75 octets with a leading space, reassemblable', () => {
    const line = `SUMMARY:${'ä'.repeat(100)}` // 2 bytes per ä
    const folded = foldIcsLine(line)
    expect(folded.length).toBeGreaterThan(1)
    for (const part of folded) {
      expect(Buffer.byteLength(part, 'utf8')).toBeLessThanOrEqual(75)
    }
    for (const cont of folded.slice(1)) {
      expect(cont.startsWith(' ')).toBe(true)
    }
    const reassembled = folded[0] + folded.slice(1).map((l) => l.slice(1)).join('')
    expect(reassembled).toBe(line)
  })
})

describe('buildIcsCalendar', () => {
  it('emits an all-day event with exclusive DTEND (month rollover)', () => {
    const ics = buildIcsCalendar(SITE, [draft({ deadline: '2026-06-30' })])
    expect(ics).toContain('DTSTART;VALUE=DATE:20260630')
    expect(ics).toContain('DTEND;VALUE=DATE:20260701')
    expect(ics).toContain('UID:me-XXVIII-88@begutachtungs-monitor.at')
  })

  it('keeps the UID domain frozen regardless of siteUrl', () => {
    const ics = buildIcsCalendar('https://some-new-domain.example', [draft()])
    expect(ics).toContain('UID:me-XXVIII-88@begutachtungs-monitor.at')
  })

  it('moves DTSTAMP with the deadline so extensions propagate on import', () => {
    const before = buildIcsCalendar(SITE, [draft({ deadline: '2026-04-08' })])
    const after = buildIcsCalendar(SITE, [draft({ deadline: '2026-05-08' })])
    expect(before).toContain('DTSTAMP:20260408T000000Z')
    expect(after).toContain('DTSTAMP:20260508T000000Z')
  })

  it('marks events transparent and includes refresh hints', () => {
    const ics = buildIcsCalendar(SITE, [draft()])
    expect(ics).toContain('TRANSP:TRANSPARENT')
    expect(ics).toContain('X-MICROSOFT-CDO-BUSYSTATUS:FREE')
    expect(ics).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT12H')
    expect(ics).toContain('X-PUBLISHED-TTL:PT12H')
  })

  it('emits the URL property raw (URI value, no TEXT escaping)', () => {
    const ics = buildIcsCalendar(SITE, [draft()])
    expect(ics).toContain(`URL:${SITE}/entwuerfe/XXVIII/88`)
  })

  it('skips consultations without a deadline', () => {
    const ics = buildIcsCalendar(SITE, [draft({ deadline: null })])
    expect(ics).not.toContain('VEVENT')
  })

  it('escapes text values', () => {
    const ics = buildIcsCalendar(SITE, [draft({ title: 'A, B; C' })])
    expect(ics).toContain('A\\, B\\; C')
  })

  it('uses CRLF endings and keeps every line within 75 octets', () => {
    const ics = buildIcsCalendar(SITE, [
      draft({ title: 'Bundesgesetz über die ganz besonders ausführliche Bezeichnung von Vorhaben, Änderung'.repeat(2) }),
    ])
    expect(ics.endsWith('\r\n')).toBe(true)
    for (const line of ics.split('\r\n')) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75)
    }
  })
})

describe('fnv1a64', () => {
  const utf8 = new TextEncoder()
  const hex = (s: string) => {
    const { hi, lo } = fnv1a64(utf8.encode(s))
    return hi.toString(16).padStart(8, '0') + lo.toString(16).padStart(8, '0')
  }

  it('matches the published FNV-1a 64 vectors', () => {
    expect(hex('')).toBe('cbf29ce484222325')
    expect(hex('a')).toBe('af63dc4c8601ec8c')
    expect(hex('foobar')).toBe('85944171f73967e8')
  })

  it('agrees with the BigInt implementation it replaced', () => {
    // The limb version exists only because BigInt literals need ES2020; it
    // must compute the same hash, not merely a plausible one.
    const reference = (input: string): string => {
      let hash = BigInt('0xcbf29ce484222325')
      const prime = BigInt('0x100000001b3')
      const mask = BigInt('0xffffffffffffffff')
      for (const byte of utf8.encode(input)) {
        hash ^= BigInt(byte)
        hash = (hash * prime) & mask
      }
      return hash.toString(16).padStart(16, '0')
    }
    const samples = ['', 'a', 'ä', '§ 5 Abs. 1', 'x'.repeat(1000), '\u0000\u00ff', 'Glücksspielgesetz — Novelle 2026']
    for (const sample of samples) expect(hex(sample), sample.slice(0, 20)).toBe(reference(sample))
  })
})

describe('bodyEtag', () => {
  it('is deterministic, quoted, and separates hash from length', () => {
    expect(bodyEtag('hello')).toBe(bodyEtag('hello'))
    expect(bodyEtag('hello')).toMatch(/^"[0-9a-z]+-[0-9a-z]+"$/)
  })

  it('distinguishes bodies of equal length', () => {
    // Length alone is a weak validator; the hash has to carry the difference.
    expect(bodyEtag('abcd')).not.toBe(bodyEtag('abce'))
  })

  it('pads the low half so two hashes cannot run together', () => {
    // hi=1, lo=0 must not render as "10" and collide with hi=10, lo=0.
    const short = bodyEtag('')
    expect(short.split('-')[0]!.length).toBeGreaterThanOrEqual(8)
  })
})
