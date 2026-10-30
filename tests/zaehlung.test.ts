import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalisedPath } from '../server/utils/http/rateLimit'
import { istBot } from '../server/utils/zaehlung/bots'
import { herkunftHost } from '../server/utils/zaehlung/herkunft'
import { klassifiziere } from '../server/utils/zaehlung/klassen'
import { createZaehlung, ladeAlleTage, ladeTag, zaehlVerzeichnis } from '../server/utils/zaehlung/speicher'
import {
  ANDERE,
  HERKUNFT_HOECHSTENS,
  erfasse,
  leererTag,
  lies,
  serialisiere,
  verbinde,
  type Tagesstand,
} from '../server/utils/zaehlung/tag'

/**
 * The page-view count (docs/architecture.md §12.65). What costs the most if
 * it breaks: something personal reaching the file — a referrer's path, an
 * IP-literal host — or the prewarm's pages inflating the count. The second
 * is the plugin's job and is checked on a production build; these hold the
 * pure rules under it.
 */
const HTML = 'text/html;charset=utf-8'

function k(path: string, contentType: string | null = HTML) {
  return klassifiziere(normalisedPath(path), contentType)
}

describe('klassifiziere', () => {
  it('names every page of app/pages and server/routes', () => {
    expect(k('/')).toEqual({ klasse: 'start' })
    expect(k('/entwuerfe')).toEqual({ klasse: 'entwuerfe' })
    expect(k('/entwuerfe/?status=open')).toEqual({ klasse: 'entwuerfe' })
    expect(k('/entwuerfe/XXVIII/88')).toEqual({ klasse: 'entwurf-bund' })
    expect(k('/entwuerfe/BEGUT_COO_2026_100_2_1234567')).toEqual({ klasse: 'entwurf-bund' })
    expect(k('/so-funktionierts')).toEqual({ klasse: 'so-funktionierts' })
    expect(k('/ueber')).toEqual({ klasse: 'ueber' })
    expect(k('/impressum')).toEqual({ klasse: 'impressum' })
    expect(k('/datenschutz')).toEqual({ klasse: 'datenschutz' })
    expect(k('/statistik')).toEqual({ klasse: 'statistik' })
    expect(k('/feed.xml', 'application/rss+xml')).toEqual({ klasse: 'feed' })
    expect(k('/kalender.ics', 'text/calendar')).toEqual({ klasse: 'kalender' })
    expect(k('/entwuerfe/XXVIII/88/frist.ics', 'text/calendar')).toEqual({ klasse: 'frist-kalender' })
    expect(k('/entwuerfe/salzburg/2026001/frist.ics', 'text/calendar')).toEqual({ klasse: 'frist-kalender' })
    expect(k('/entwuerfe/BEGUT_X/frist.ics', 'text/calendar')).toEqual({ klasse: 'frist-kalender' })
  })

  it('gives each of the nine Länder its code', () => {
    expect(k('/entwuerfe/burgenland/12')).toEqual({ klasse: 'entwurf-land', land: 'bgld' })
    expect(k('/entwuerfe/kaernten/12')).toEqual({ klasse: 'entwurf-land', land: 'ktn' })
    expect(k('/entwuerfe/niederoesterreich/12')).toEqual({ klasse: 'entwurf-land', land: 'noe' })
    expect(k('/entwuerfe/oberoesterreich/12')).toEqual({ klasse: 'entwurf-land', land: 'ooe' })
    expect(k('/entwuerfe/salzburg/12')).toEqual({ klasse: 'entwurf-land', land: 'sbg' })
    expect(k('/entwuerfe/steiermark/12')).toEqual({ klasse: 'entwurf-land', land: 'stmk' })
    expect(k('/entwuerfe/tirol/12')).toEqual({ klasse: 'entwurf-land', land: 't' })
    expect(k('/entwuerfe/vorarlberg/12')).toEqual({ klasse: 'entwurf-land', land: 'vbg' })
    expect(k('/entwuerfe/Wien/12/')).toEqual({ klasse: 'entwurf-land', land: 'w' })
  })

  it('counts nothing that is not a page', () => {
    for (const path of [
      '/api/drafts',
      '/api/statistik',
      '/api',
      '/_nuxt/entry.abc123.js',
      '/__nuxt_error?statusCode=404',
      '/_ipx/w_200/og.png',
      '/fonts/SourceSerif4-Semibold.woff2',
      '/favicon.ico',
      '/favicon.svg',
      '/apple-touch-icon.png',
      '/robots.txt',
      '/og.png',
      '/sitemap.xml',
      '/entwuerfe/_payload.json',
      '/irgendwas.css',
    ]) expect(k(path), path).toBeNull()
  })

  it('counts another address only when it answered with HTML', () => {
    expect(k('/neue-seite')).toEqual({ klasse: 'sonstige' })
    expect(k('/neue-seite', 'application/json')).toBeNull()
    expect(k('/neue-seite', null)).toBeNull()
  })
})

describe('istBot', () => {
  it('knows crawlers, previews, scripts and monitors', () => {
    for (const ua of [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
      'Mozilla/5.0 (compatible; Yahoo! Slurp; http://help.yahoo.com/help/us/ysearch/slurp)',
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      'WhatsApp/2.23.20.0',
      'Mastodon/4.3.0 (http.rb/5.2.0; +https://chaos.social/)',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0 Safari/537.36',
      'python-requests/2.31.0',
      'curl/8.4.0',
      'Wget/1.21.4',
      'Go-http-client/2.0',
      'Feedly/1.0 (+http://www.feedly.com/fetcher.html; 3 subscribers)',
      'Mozilla/5.0 (compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)',
      'Chrome-Lighthouse',
      '',
    ]) expect(istBot(ua), ua).toBe(true)
    expect(istBot(undefined)).toBe(true)
  })

  it('leaves browsers and calendar apps alone', () => {
    for (const ua of [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
      'iOS/18.0 (22A3354) dataaccessd/1.0',
    ]) expect(istBot(ua), ua).toBe(false)
  })
})

describe('herkunftHost', () => {
  it('keeps the host and nothing else', () => {
    expect(herkunftHost('https://www.parlament.gv.at/x?y=1#z')).toBe('www.parlament.gv.at')
    expect(herkunftHost('https://WWW.Google.AT:8443/search?q=geheim')).toBe('www.google.at')
    expect(herkunftHost('http://example.org./pfad')).toBe('example.org')
    expect(herkunftHost('https://xn--mnchen-3ya.de/')).toBe('xn--mnchen-3ya.de')
  })

  it('drops this site, local hosts, IP literals and other schemes', () => {
    expect(herkunftHost('https://begutachtungs-monitor.at/entwuerfe')).toBeNull()
    expect(herkunftHost('https://www.begutachtungs-monitor.at/')).toBeNull()
    expect(herkunftHost('http://localhost:3000/')).toBeNull()
    expect(herkunftHost('http://127.0.0.1:3000/')).toBeNull()
    expect(herkunftHost('http://192.168.1.20/')).toBeNull()
    expect(herkunftHost('http://[2001:db8::1]/')).toBeNull()
    expect(herkunftHost('android-app://com.google.android.gm/')).toBeNull()
    expect(herkunftHost('file:///home/x.html')).toBeNull()
  })

  it('drops what is not a URL, and over-long names', () => {
    expect(herkunftHost(undefined)).toBeNull()
    expect(herkunftHost('')).toBeNull()
    expect(herkunftHost('nicht eine url')).toBeNull()
    expect(herkunftHost('https://')).toBeNull()
    expect(herkunftHost(`https://${'a'.repeat(95)}.example/`)).toBeNull()
  })
})

function tag(t = '2026-10-30'): Tagesstand {
  return leererTag(t)
}

describe('the day aggregate', () => {
  it('counts readers and bots apart, Länder twice, referrers for readers only', () => {
    const d = tag()
    erfasse(d, { klasse: 'entwurf-land', land: 'sbg', bot: false, herkunft: 'www.parlament.gv.at' })
    erfasse(d, { klasse: 'entwurf-land', land: 'sbg', bot: true, herkunft: 'www.parlament.gv.at' })
    erfasse(d, { klasse: 'start', bot: false, herkunft: null })
    expect(d.seiten).toEqual({ 'entwurf-land': { aufrufe: 1, bots: 1 }, start: { aufrufe: 1, bots: 0 } })
    expect(d.laender).toEqual({ sbg: { aufrufe: 1, bots: 1 } })
    expect(d.herkunft).toEqual({ 'www.parlament.gv.at': 1 })
  })

  it('folds hosts past the cap into „andere“', () => {
    const d = tag()
    for (let i = 0; i < HERKUNFT_HOECHSTENS + 5; i++) erfasse(d, { klasse: 'start', bot: false, herkunft: `h${i}.example` })
    erfasse(d, { klasse: 'start', bot: false, herkunft: 'h0.example' })
    expect(Object.keys(d.herkunft)).toHaveLength(HERKUNFT_HOECHSTENS + 1)
    expect(d.herkunft[ANDERE]).toBe(5)
    expect(d.herkunft['h0.example']).toBe(2)
  })

  it('merges two aggregates of a day, the cap over the sum, the larger hosts kept', () => {
    const a = tag()
    const b = tag()
    for (let i = 0; i < HERKUNFT_HOECHSTENS; i++) erfasse(a, { klasse: 'start', bot: false, herkunft: `a${i}.example` })
    erfasse(a, { klasse: 'entwurf-land', land: 'w', bot: false, herkunft: null })
    erfasse(b, { klasse: 'entwurf-land', land: 'w', bot: true, herkunft: null })
    for (let i = 0; i < 3; i++) erfasse(b, { klasse: 'feed', bot: false, herkunft: 'gross.example' })
    a.stand = '2026-10-30T10:00:00.000Z'
    b.stand = '2026-10-30T11:00:00.000Z'
    const m = verbinde(a, b)
    expect(m.seiten.start).toEqual({ aufrufe: HERKUNFT_HOECHSTENS, bots: 0 })
    expect(m.seiten['entwurf-land']).toEqual({ aufrufe: 1, bots: 1 })
    expect(m.seiten.feed).toEqual({ aufrufe: 3, bots: 0 })
    expect(m.laender.w).toEqual({ aufrufe: 1, bots: 1 })
    expect(Object.keys(m.herkunft)).toHaveLength(HERKUNFT_HOECHSTENS + 1)
    expect(m.herkunft['gross.example']).toBe(3)
    expect(m.herkunft[ANDERE]).toBe(1)
    expect(m.stand).toBe('2026-10-30T11:00:00.000Z')
    // Pure: neither input changed.
    expect(a.seiten.feed).toBeUndefined()
  })

  it('round-trips through its file form, and refuses a corrupt one', () => {
    const d = tag()
    erfasse(d, { klasse: 'entwurf-bund', bot: false, herkunft: 'derstandard.at' })
    erfasse(d, { klasse: 'entwurf-land', land: 't', bot: true, herkunft: null })
    d.stand = '2026-10-30T12:05:00.000Z'
    expect(lies(serialisiere(d))).toEqual(d)
    expect(lies('{')).toBeNull()
    expect(lies('[]')).toBeNull()
    expect(lies(JSON.stringify({ ...d, tag: '30.10.2026' }))).toBeNull()
    expect(lies(JSON.stringify({ ...d, seiten: { start: { aufrufe: -1, bots: 0 } } }))).toBeNull()
    expect(lies(JSON.stringify({ ...d, herkunft: { x: 'viele' } }))).toBeNull()
  })
})

describe('the store', () => {
  it('resolves its directory like the last-good store', () => {
    expect(zaehlVerzeichnis({ BM_STATE_DIR: '/x' }, '/app')).toBe('/x/zaehlung')
    expect(zaehlVerzeichnis({ STATE_DIRECTORY: '/var/lib/bm:/var/lib/bm/reports' }, '/app')).toBe('/var/lib/bm/zaehlung')
    expect(zaehlVerzeichnis({}, '/app')).toBe('/app/.data/zaehlung')
  })

  it('adds to the file a previous process left, and writes whole files only', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bm-zaehlung-'))
    const at = new Date('2026-10-30T09:00:00Z')
    const first = createZaehlung(dir, { now: () => at })
    first.erfasse({ klasse: 'start', bot: false, herkunft: 'www.parlament.gv.at' })
    first.erfasse({ klasse: 'start', bot: true, herkunft: null })
    await first.schreibe()

    // A restart: the new process finds the file and counts on top of it.
    const second = createZaehlung(dir, { now: () => at })
    second.erfasse({ klasse: 'start', bot: false, herkunft: 'www.parlament.gv.at' })
    await second.schreibe()
    // A second write of the same counts must not add them twice.
    second.erfasse({ klasse: 'ueber', bot: false, herkunft: null })
    await second.schreibe()

    const stored = await ladeTag(dir, '2026-10-30')
    expect(stored?.seiten).toEqual({ start: { aufrufe: 2, bots: 1 }, ueber: { aufrufe: 1, bots: 0 } })
    expect(stored?.herkunft).toEqual({ 'www.parlament.gv.at': 2 })
    expect(stored?.stand).toBe(at.toISOString())
    expect((await readdir(dir)).filter((f) => f.endsWith('.tmp'))).toEqual([])
  })

  it('writes the old day when the day changes, and starts the new one empty', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bm-zaehlung-'))
    let at = new Date('2026-10-30T23:59:00Z')
    const z = createZaehlung(dir, { now: () => at })
    z.erfasse({ klasse: 'start', bot: false, herkunft: null })
    at = new Date('2026-10-31T00:01:00Z')
    z.erfasse({ klasse: 'feed', bot: false, herkunft: null })
    await z.schreibe()
    expect((await ladeTag(dir, '2026-10-30'))?.seiten).toEqual({ start: { aufrufe: 1, bots: 0 } })
    expect((await ladeTag(dir, '2026-10-31'))?.seiten).toEqual({ feed: { aufrufe: 1, bots: 0 } })
  })

  it('skips corrupt and foreign files when reading all days', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bm-zaehlung-'))
    const z = createZaehlung(dir, { now: () => new Date('2026-10-29T08:00:00Z') })
    z.erfasse({ klasse: 'start', bot: false, herkunft: null })
    await z.schreibe()
    await writeFile(join(dir, '2026-10-30.json'), '{ kaputt')
    await writeFile(join(dir, 'notizen.json'), '{}')
    await writeFile(join(dir, '2026-10-31.json'), JSON.stringify(leererTag('2026-10-01')))
    const days = await ladeAlleTage(dir)
    expect(days.map((d) => d.tag)).toEqual(['2026-10-29'])
    expect(JSON.parse(await readFile(join(dir, '2026-10-29.json'), 'utf8')).tag).toBe('2026-10-29')
  })
})
