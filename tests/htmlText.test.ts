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
})

describe('helpers', () => {
  it('absolutizeUrl', () => {
    expect(absolutizeUrl('/gegenstand/XXVIII/ME/133')).toBe(
      'https://www.parlament.gv.at/gegenstand/XXVIII/ME/133',
    )
    expect(absolutizeUrl('https://example.org/x')).toBe('https://example.org/x')
  })

  it('stripHtmlToText decodes numeric entities', () => {
    expect(stripHtmlToText('<p>&#167; 5 &amp; &#x00A7; 6</p>')).toBe('§ 5 & § 6')
  })
})
