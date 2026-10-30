import { describe, expect, it } from 'vitest'
import type { EnactedLaw, EnactedParagraph, ParagraphExplanationView } from '#shared/types'
import { enactedHaystack, newLawGroups } from '../app/utils/newLawGroups'

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
})
