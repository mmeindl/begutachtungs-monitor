import { describe, expect, it } from 'vitest'
import type { LawDiffResponse, Publisher, ReasoningDiffResponse } from '#shared/types'
import { lawDiffCredits } from '../app/utils/lawDiffCredits'

const link = (label: string) => ({ label, url: `https://example.org/${encodeURIComponent(label)}` })

function diff(fromSource: Publisher | null, toSource: Publisher | null, over: Partial<LawDiffResponse> = {}): LawDiffResponse {
  return {
    available: true,
    fromDocument: link('ME-Text'),
    toDocument: link('RV-Text'),
    fromSource,
    toSource,
    ...over,
  } as LawDiffResponse
}

function reasoning(compared: number, uncompared = 0): ReasoningDiffResponse {
  return {
    sources: [link('ME-Erl'), link('RV-Erl')],
    stats: { compared, changed: 0, uncompared },
  } as unknown as ReasoningDiffResponse
}

const meRv = { from: 'me', to: 'rv' } as const

describe('lawDiffCredits', () => {
  it('credits nothing for a comparison that is not there', () => {
    expect(lawDiffCredits(null, null, meRv, 0)).toEqual({ sources: [], sides: [] })
    expect(lawDiffCredits(diff('parlament', 'parlament', { available: false }), null, meRv, 0).sources).toEqual([])
  })

  it('names no publisher at the links where one publisher stands behind the line', () => {
    const { sources, sides } = lawDiffCredits(diff('parlament', 'parlament'), reasoning(3), meRv, 0)
    expect(sources.map((s) => s.what)).toEqual([
      'Ministerialentwurf',
      'Erläuterungen zum Ministerialentwurf',
      'Regierungsvorlage',
      'Erläuterungen zur Regierungsvorlage',
    ])
    expect(sides.map((s) => [s.label, s.text?.label, s.textTag, s.reasoning?.label, s.reasoningTag])).toEqual([
      ['Ministerialentwurf', 'ME-Text', '', 'ME-Erl', ''],
      ['Regierungsvorlage', 'RV-Text', '', 'RV-Erl', ''],
    ])
  })

  it('names the publisher at each link of a side whose two documents differ', () => {
    const { sides } = lawDiffCredits(diff('ris', 'parlament'), reasoning(3), meRv, 0)
    expect(sides.map((s) => [s.label, s.textTag, s.reasoningTag])).toEqual([
      ['Ministerialentwurf', ' (RIS)', ' (Parlament)'],
      ['Regierungsvorlage (Parlament)', '', ''],
    ])
  })

  it('credits the Erläuterungen only where their comparison ran — uncompared passages count', () => {
    expect(lawDiffCredits(diff('parlament', 'parlament'), reasoning(0), meRv, 0).sides.every((s) => !s.reasoning)).toBe(true)
    expect(lawDiffCredits(diff('parlament', 'parlament'), reasoning(0, 2), meRv, 0).sides.every((s) => s.reasoning)).toBe(true)
  })

  it('has no Erläuterungen for a station after the Vorlage', () => {
    const { sides } = lawDiffCredits(diff('parlament', 'parlament'), reasoning(3), { from: 'rv', to: 'ausschuss' }, 0)
    expect(sides.map((s) => [s.station, s.reasoning?.label ?? null])).toEqual([['rv', 'RV-Erl'], ['ausschuss', null]])
  })

  it('adds the § names from RIS where any were shown, which mixes the line', () => {
    const { sources, sides } = lawDiffCredits(diff('parlament', 'parlament'), null, meRv, 4)
    expect(sources.at(-1)).toEqual({ what: 'Paragraphenüberschriften', publisher: 'ris', terms: 'cc-by' })
    expect(sides.map((s) => s.label)).toEqual(['Ministerialentwurf (Parlament)', 'Regierungsvorlage (Parlament)'])
  })
})
