import { describe, expect, it } from 'vitest'
import type { EnactedLaw, EnactedParagraph, ParagraphExplanationView } from '#shared/types'
import { enactedHaystack, everyLawEnd, newLawGapDe, newLawGroups, newLawTagDe } from '../app/utils/newLawGroups'

const para = (id: string, text = `Text ${id}`): EnactedParagraph => ({ id: `§ ${id}`, heading: `Titel ${id}`, lines: [{ text, sub: false }] })
const passage = (law: string, p: string): ParagraphExplanationView => ({ law, para: p, heading: `Zu § ${p}:`, text: ['…'] })
const law = (name: string, ...ids: string[]): EnactedLaw => ({ law: name, paragraphs: ids.map((id) => para(id)) })
const options = (query = '', limit = Number.POSITIVE_INFINITY) => ({ query, haystack: enactedHaystack, limitFor: () => limit })

describe('newLawGroups', () => {
  it('puts each passage at its § and keeps for the end only what names no § of the text', () => {
    const rest = [{ law: 'ElWG', outcomes: [], explanations: [passage('ElWG', '1'), passage('ElWG', '1'), passage('ElWG', '9')] }]
    const [g] = newLawGroups(rest, [law('ElWG', '1', '2')], options())
    expect(g!.total).toBe(2)
    expect(g!.paragraphs.map((p) => p.explanations.length)).toEqual([2, 0])
    expect(g!.end).toEqual({ outcomes: [], explanations: [passage('ElWG', '9')] })
  })

  it('makes no group for a law without text, and no end where nothing is left', () => {
    const rest = [{ law: 'ElWG', outcomes: [], explanations: [passage('ElWG', '1')] }, { law: 'Andere', outcomes: [], explanations: [] }, { law: null, outcomes: [], explanations: [] }]
    const groups = newLawGroups(rest, [law('ElWG', '1')], options())
    expect(groups.map((g) => g.law)).toEqual(['ElWG'])
    expect(groups[0]!.end).toBeNull()
  })

  it('searches the text, hides a law without a hit, and cuts after the limit', () => {
    const rest = [{ law: 'A', outcomes: [], explanations: [] }, { law: 'B', outcomes: [], explanations: [] }]
    const laws = [{ law: 'A', paragraphs: [para('1', 'Netzzugang'), para('2', 'Netzzugang und mehr'), para('3', 'anderes')] }, law('B', '1')]
    const [a, ...others] = newLawGroups(rest, laws, options('netzzugang', 1))
    expect(others).toEqual([])
    expect(a!.total).toBe(3)
    expect(a!.matches).toBe(2)
    expect(a!.paragraphs.map((p) => p.paragraph.id)).toEqual(['§ 1'])
    expect(a!.more).toBe(1)
  })

  it('gives a law without a placed passage its group only through everyLawEnd', () => {
    const laws = [law('Neu', '1', '2')]
    expect(newLawGroups([], laws, options())).toEqual([])
    const [g] = newLawGroups(everyLawEnd([], laws), laws, options())
    expect(g!.paragraphs.map((p) => p.paragraph.id)).toEqual(['§ 1', '§ 2'])
    expect(g!.end).toBeNull()
  })

  it('keeps a law\'s passages when every law gets an end', () => {
    const rest = [{ law: 'Neu', outcomes: [], explanations: [passage('Neu', '2')] }]
    const [g] = newLawGroups(everyLawEnd(rest, [law('Neu', '1', '2')]), [law('Neu', '1', '2')], options())
    expect(g!.paragraphs.map((p) => p.explanations.length)).toEqual([0, 1])
  })

  it('counts Anlagen apart from Paragraphen on the pill', () => {
    const laws = [{ law: 'Neu', paragraphs: [para('1'), { id: 'Anlage 1', heading: null, lines: [{ text: 'x', sub: false }] }] }]
    const [g] = newLawGroups(everyLawEnd([], laws), laws, options())
    expect([g!.total, g!.schedules]).toEqual([2, 1])
    expect(newLawTagDe(2, 1)).toBe('Neues Gesetz · 1 Paragraph · 1 Anlage')
    expect(newLawTagDe(7, 0)).toBe('Neues Gesetz · 7 Paragraphen')
  })

  it('names why a new law shows no text, and says nothing where it shows one', () => {
    const empty = { laws: [], footnotes: [], otherArticles: [], source: null }
    expect(newLawGapDe(empty)).toMatch(/^Nicht lesbar: Im RIS fand/)
    expect(newLawGapDe({ ...empty, source: { label: 'Entwurf im RIS', url: 'https://www.ris.bka.gv.at/x' } })).toMatch(/^Nicht lesbar: Den Gesetzestext/)
    expect(newLawGapDe({ ...empty, laws: [law('Neu', '1')] })).toBeNull()
    expect(newLawGapDe({ ...empty, otherArticles: [para('1')] })).toBeNull()
  })
})
