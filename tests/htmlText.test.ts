import { describe, expect, it } from 'vitest'
import {
  absolutizeUrl,
  decodeEntities,
  extractLinks,
  stripHtmlToText,
} from '../server/utils/parliament/htmlText'

describe('decodeEntities', () => {
  it('decodes normal numeric and named references', () => {
    expect(decodeEntities('&#65;&#x42;&amp;')).toBe('AB&')
  })

  it('never throws on out-of-range code points (fromCodePoint RangeError)', () => {
    expect(decodeEntities('a&#x110000;b')).toBe('ab')
    expect(decodeEntities('a&#99999999;b')).toBe('ab')
  })

  it('drops control characters and surrogates instead of synthesizing them', () => {
    expect(decodeEntities('a&#8;b')).toBe('ab')
    expect(decodeEntities('a&#xD800;b')).toBe('ab')
    expect(decodeEntities('a&#10;b')).toBe('a\nb')
  })
})

describe('extractLinks', () => {
  it('extractLinks keeps absolute URLs and uses the URL as label fallback', () => {
    const links = extractLinks('<a href="https://www.ris.bka.gv.at/x">RIS</a> und <a href=\'/pfad\'></a>')
    expect(links).toEqual([
      { label: 'RIS', url: 'https://www.ris.bka.gv.at/x' },
      { label: 'https://www.parlament.gv.at/pfad', url: 'https://www.parlament.gv.at/pfad' },
    ])
  })

  /* Stage HTML is upstream data: a link it carries to any other host, or
   * with any other scheme, is dropped — the stage's text keeps its words. */
  it('drops links off the upstream allowlist', () => {
    const links = extractLinks(
      '<a href="https://evil.example/gegenstand/XXVIII/I/1">1 d.B.</a>' +
      '<a href="javascript:alert(1)">x</a>' +
      '<a href="//evil.example/x">y</a>' +
      '<a href="mailto:x@example.org">z</a>' +
      '<a href="/gegenstand/XXVIII/I/2">2 d.B.</a>',
    )
    expect(links).toEqual([{ label: '2 d.B.', url: 'https://www.parlament.gv.at/gegenstand/XXVIII/I/2' }])
  })
})

describe('helpers', () => {
  it('absolutizeUrl', () => {
    expect(absolutizeUrl('/gegenstand/XXVIII/ME/133')).toBe(
      'https://www.parlament.gv.at/gegenstand/XXVIII/ME/133',
    )
    expect(absolutizeUrl('dokument/x.pdf')).toBe('https://www.parlament.gv.at/dokument/x.pdf')
    expect(absolutizeUrl('http://www.ris.bka.gv.at/x')).toBe('https://www.ris.bka.gv.at/x')
  })

  it('absolutizeUrl refuses what the allowlist refuses', () => {
    expect(absolutizeUrl('https://example.org/x')).toBeNull()
    expect(absolutizeUrl('//example.org/x')).toBeNull()
    expect(absolutizeUrl('\\\\example.org/x')).toBeNull()
    expect(absolutizeUrl('javascript:alert(1)')).toBeNull()
    expect(absolutizeUrl('http://127.0.0.1:3000/api')).toBeNull()
    expect(absolutizeUrl('https://www.parlament.gv.at@evil.example/x')).toBeNull()
    expect(absolutizeUrl('   ')).toBeNull()
  })

  it('stripHtmlToText decodes numeric entities', () => {
    expect(stripHtmlToText('<p>&#167; 5 &amp; &#x00A7; 6</p>')).toBe('§ 5 & § 6')
  })
})
