import { describe, expect, it } from 'vitest'
import {
  isSafeLinkHref,
  parliamentPathname,
  safeExternalUrl,
  UPSTREAM_HOSTS,
} from '../shared/utils/safeExternalUrl'

/**
 * Every URL that arrives inside upstream data passes this guard before the
 * server fetches it or the page links it. What it must refuse is whatever a
 * compromised upstream could use to point the server at an internal address
 * or the page at script.
 */
describe('safeExternalUrl', () => {
  it('passes every allowlisted host as https', () => {
    for (const host of UPSTREAM_HOSTS) {
      expect(safeExternalUrl(`https://${host}/x`)).toBe(`https://${host}/x`)
    }
    expect(safeExternalUrl('https://www.parlament.gv.at/dokument/XXVIII/ME/1/fname_1.pdf')).toBe(
      'https://www.parlament.gv.at/dokument/XXVIII/ME/1/fname_1.pdf',
    )
  })

  it('upgrades http to https — RIS still sends its BGBl links as http', () => {
    expect(
      safeExternalUrl('http://www.ris.bka.gv.at/Dokument.wxe?Abfrage=BgblAuth&Dokumentnummer=BGBLA_2025_I_50'),
    ).toBe('https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=BgblAuth&Dokumentnummer=BGBLA_2025_I_50')
    expect(safeExternalUrl('HTTP://WWW.PARLAMENT.GV.AT/x')).toBe('https://www.parlament.gv.at/x')
    expect(safeExternalUrl('http://www.parlament.gv.at:80/x')).toBe('https://www.parlament.gv.at/x')
  })

  it('trims surrounding whitespace', () => {
    expect(safeExternalUrl('  https://www.parlament.gv.at/x \n')).toBe('https://www.parlament.gv.at/x')
  })

  it('refuses every scheme but http(s), in any case', () => {
    for (const url of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      ' javascript:alert(1)',
      'java\tscript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'ftp://www.parlament.gv.at/x',
      'mailto:x@parlament.gv.at',
    ]) {
      expect(safeExternalUrl(url), url).toBeNull()
    }
  })

  it('refuses relative and protocol-relative input — absolutizing is the caller’s step', () => {
    expect(safeExternalUrl('//www.parlament.gv.at/x')).toBeNull()
    expect(safeExternalUrl('/gegenstand/XXVIII/ME/1')).toBeNull()
    expect(safeExternalUrl('')).toBeNull()
    expect(safeExternalUrl(null)).toBeNull()
    expect(safeExternalUrl(undefined)).toBeNull()
  })

  it('matches hosts exactly, never by suffix or prefix', () => {
    for (const url of [
      'https://www.parlament.gv.at.evil.example/x',
      'https://evilparlament.gv.at/x',
      'https://evil.www.parlament.gv.at/x',
      'https://parlament.gv.at.evil.example/x',
      'https://example.org/x',
      'https://127.0.0.1/x',
      'http://localhost:3000/x',
      'https://[::1]/x',
    ]) {
      expect(safeExternalUrl(url), url).toBeNull()
    }
  })

  it('refuses userinfo, which would make the allowlisted name a user name', () => {
    expect(safeExternalUrl('https://www.parlament.gv.at@evil.example/x')).toBeNull()
    expect(safeExternalUrl('https://user:pw@www.parlament.gv.at/x')).toBeNull()
    expect(safeExternalUrl('https://user@www.parlament.gv.at/x')).toBeNull()
  })

  it('refuses an explicit port', () => {
    expect(safeExternalUrl('https://www.parlament.gv.at:8443/x')).toBeNull()
  })

  it('reads backslashes the way a browser does', () => {
    expect(safeExternalUrl('https:\\\\evil.example/x')).toBeNull()
    expect(safeExternalUrl('https:/\\evil.example')).toBeNull()
    expect(safeExternalUrl('https:\\\\www.parlament.gv.at\\x')).toBe('https://www.parlament.gv.at/x')
  })
})

describe('parliamentPathname', () => {
  it('is the path on Parliament’s host and null on any other', () => {
    expect(parliamentPathname('https://www.parlament.gv.at/gegenstand/XXVIII/I/1?x#y')).toBe('/gegenstand/XXVIII/I/1')
    expect(parliamentPathname('https://www.ris.bka.gv.at/gegenstand/XXVIII/I/1')).toBeNull()
    expect(parliamentPathname('https://evil.example/gegenstand/XXVIII/I/1')).toBeNull()
    expect(parliamentPathname(null)).toBeNull()
  })
})

describe('isSafeLinkHref', () => {
  it('passes same-site paths and absolute http(s) links to any host', () => {
    expect(isSafeLinkHref('/feed.xml')).toBe(true)
    expect(isSafeLinkHref('/feed.xml?ressort=BMJ')).toBe(true)
    expect(isSafeLinkHref('https://creativecommons.org/licenses/by/4.0/deed.de')).toBe(true)
    expect(isSafeLinkHref('http://www.ris.bka.gv.at/x')).toBe(true)
  })

  it('refuses script schemes, protocol-relative paths and userinfo', () => {
    for (const href of [
      'javascript:alert(1)',
      'JAVASCRIPT:alert(1)',
      '  javascript:alert(1)',
      'java\nscript:alert(1)',
      'data:text/html,x',
      'vbscript:x',
      '//evil.example/x',
      '/\\evil.example/x',
      '/\t/evil.example/x',
      'https:\\\\evil.example@x',
      'https://www.parlament.gv.at@evil.example/',
      'relative/path',
      '',
      null,
      undefined,
    ]) {
      expect(isSafeLinkHref(href), String(href)).toBe(false)
    }
  })
})
