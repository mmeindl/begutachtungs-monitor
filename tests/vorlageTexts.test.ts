import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { explanationsByParagraph } from '../server/utils/explanations/explanationsJoin'
import { explanationsDocumentOfHtml, parseExplanationsHtml } from '../server/utils/explanations/explanationsHtml'
import { draftArticles } from '../server/utils/lawtext/draftArticles'
import { parseParliamentHtml } from '../server/utils/lawtext/parliamentHtml'
import { mapDocuments } from '../server/utils/parliament/detailJson'
import { pickTextComparisons } from '../server/utils/ris/risRecord'
import { explanationsGroup } from '../server/utils/parliament/vorlageDetailAssembly'

/* Parliament's Word HTML of 97 d.B. XXVIII (tests/fixtures/README.md). */
function html(name: string): string {
  const bytes = readFileSync(new URL(`./fixtures/vorlage/${name}`, import.meta.url))
  const charset = /charset=["']?([\w-]+)/i.exec(bytes.subarray(0, 2048).toString('latin1'))?.[1] ?? 'utf-8'
  return new TextDecoder(charset).decode(bytes)
}
function record(name: string) {
  return JSON.parse(readFileSync(new URL(`./fixtures/vorlage/${name}.json`, import.meta.url), 'utf8')).content
}

describe('a Vorlage’s Erläuterungen from Parliament’s HTML', () => {
  const doc = explanationsDocumentOfHtml(parseExplanationsHtml(html('XXVIII-I-97-erlaeuterungen.html')), true)

  it('carries the Allgemeiner Teil and the Besonderer Teil in the reader’s shape', () => {
    expect(doc.general?.passages[0]?.text.length).toBeGreaterThan(5)
    expect(doc.generalInferred).toBe(false)
    expect(doc.special?.passages.map((p) => p.heading).slice(0, 3)).toEqual(['Zu § 1 EheG:', 'Zu § 6 EheG:', 'Zu § 10 EheG:'])
    expect(doc.chars).toBeGreaterThan(0)
  })

  it('goes through the draft’s join and its rule: no passage whose law is unknown', () => {
    const articles = draftArticles(parseParliamentHtml(html('XXVIII-I-97-gesetzestext.html')))
    // Two laws, and the passages name theirs only as „EheG" and „EPG" under
    // no Artikel heading: the join discards them rather than guess — as it
    // does for a draft's (`explanationsByParagraph`).
    expect(explanationsByParagraph(doc, articles)).toEqual([])
    // With one law to belong to, every addressed passage lands at its §.
    const one = articles.filter((a) => a.numeral === '1')
    const at = explanationsByParagraph(doc, one)
    expect(at.map((p) => p.heading).slice(0, 2)).toEqual(['Zu § 1 EheG:', 'Zu § 6 EheG:'])
    expect(at.length).toBeGreaterThanOrEqual(12)
    expect(at.every((p) => p.law === one[0]!.key && p.text.length > 0)).toBe(true)
  })

  it('says an unheaded general part is our reading', () => {
    expect(explanationsDocumentOfHtml({ general: ['Text'], special: [] }, false).generalInferred).toBe(true)
    expect(explanationsDocumentOfHtml({ general: [], special: [] }, false).general).toBeNull()
  })
})

describe('the Vorlage’s Textgegenüberstellung on its own document list', () => {
  it('is found under either name the ressorts give it', () => {
    const pick = (name: string) => pickTextComparisons(mapDocuments(record(name).documents), (d) => d.title).map((d) => d.title)
    expect(pick('XXVIII-I-97')).toEqual(['TGÜ'])
    expect(pick('XXVIII-I-589')).toEqual(['Textgegenüberstellung'])
    expect(pick('XXVIII-I-309')).toEqual([])
  })
})

describe('the Erläuterungen of a Vorlage among its documents', () => {
  it('are found under a title that only starts with the word', () => {
    const doc = (title: string) => ({ title, formats: [{ type: 'html' as const, url: `https://x/${title}` }] })
    expect(explanationsGroup([doc('Gesetzestext'), doc('Erläuterungen Sozialabgaben')])?.title).toBe('Erläuterungen Sozialabgaben')
    expect(explanationsGroup([doc('Erläuterungen')])?.title).toBe('Erläuterungen')
    expect(explanationsGroup([doc('Gesetzestext, Vorblatt und Erläuterungen')])).toBeNull()
  })
})
