import { describe, expect, it } from 'vitest'
import { MUTATION_KINDS, isMiss, mutate, mutationOutcome, mutations } from '../scripts/lib/stationMutations'

describe('mutate — one fault per class, at the first place it applies', () => {
  const text = (t: string, kind: Parameters<typeof mutate>[1]) => mutate(t, kind)?.text ?? null

  it('changes one digit, and none inside a placeholder', () => {
    expect(text('Abs. 3 gilt', 'ziffer')).toBe('Abs. 4 gilt')
    expect(text('Frist von 9 Tagen', 'ziffer')).toBe('Frist von 0 Tagen')
    // „xxx/2026", „(xx)", „202x" are blanks a later stage fills; the first
    // real number after them takes the fault.
    expect(text('BGBl. I Nr. xxx/2026 und Abs. (xx) bis 202x, dann § 5', 'ziffer')).toBe('BGBl. I Nr. xxx/2026 und Abs. (xx) bis 202x, dann § 6')
    expect(text('BGBl. I Nr.xxx/2026', 'ziffer')).toBeNull()
    expect(text('ohne Zahl', 'ziffer')).toBeNull()
  })

  it('sets a minus sign before the first number that opens a token', () => {
    expect(text('bei 18 °C', 'minus')).toBe('bei -18 °C')
    expect(text('(1) Die Frist', 'minus')).toBe('(-1) Die Frist')
    expect(text('Covid-19 Pandemie', 'minus')).toBeNull()
  })

  it('strikes „nicht" as a whole word, and swaps „und" and „oder"', () => {
    expect(text('gilt nicht für Auskünfte', 'nicht')).toBe('gilt für Auskünfte')
    expect(text('Gerichte, die zunichte machen', 'nicht')).toBeNull()
    expect(text('Bund und Länder und Gemeinden', 'und-oder')).toBe('Bund oder Länder und Gemeinden')
    expect(text('Grund oder Boden', 'und-oder')).toBeNull()
    expect(text('Bescheid oder Urteil', 'oder-und')).toBe('Bescheid und Urteil')
    expect(text('Bund und Länder', 'oder-und')).toBeNull()
  })

  it('changes a sign where the text has one', () => {
    expect(text('bis zu 5 % der Umsatzerlöse', 'prozent')).toBe('bis zu 5 ‰ der Umsatzerlöse')
    expect(text('Eiweißausscheidung > 1g/l', 'vergleich')).toBe('Eiweißausscheidung < 1g/l')
    expect(text('weniger als < 3', 'vergleich')).toBe('weniger als > 3')
    expect(text('ohne Zeichen', 'prozent')).toBeNull()
  })

  it('joins two numbers, and collapses a range', () => {
    expect(text('gemäß Z 1 3 gilt', 'zahlen-verbunden')).toBe('gemäß Z 13 gilt')
    expect(text('mindestens 100 000 Euro.', 'zahlen-verbunden')).toBe('mindestens 100000 Euro.')
    expect(text('Abs. 3 und 4', 'zahlen-verbunden')).toBeNull()
    expect(text('die §§ 3-5 gelten', 'bereich-verbunden')).toBe('die §§ 35 gelten')
    expect(text('die §§ 3 - 5 gelten', 'bereich-verbunden')).toBe('die §§ 35 gelten')
    expect(text('Budgetbegleitgesetz 2027-2028,', 'bereich-verbunden')).toBe('Budgetbegleitgesetz 20272028,')
    expect(text('Covid-19', 'bereich-verbunden')).toBeNull()
  })

  it('lists every class that applies, in the order of MUTATION_KINDS', () => {
    const all = mutations('Nach § 5 und 6 gilt nicht mehr als 5 %.')
    expect(all.map((m) => m.kind)).toEqual(['ziffer', 'minus', 'nicht', 'und-oder', 'prozent'])
    expect(all.every((m) => MUTATION_KINDS.includes(m.kind) && m.text !== 'Nach § 5 und 6 gilt nicht mehr als 5 %.')).toBe(true)
  })
})

describe('mutationOutcome', () => {
  const eq = { type: 'equal' as const }
  const rm = { type: 'removed' as const }
  it('counts only a visible, substantive change as caught', () => {
    expect(mutationOutcome([{ change: 'changed', editorial: false, segments: [eq, rm] }])).toBe('änderung')
    expect(mutationOutcome([{ change: 'changed', editorial: true, segments: [eq, rm] }])).toBe('redaktionell')
    expect(mutationOutcome([{ change: 'unchanged', editorial: false, segments: null }])).toBe('unverändert')
    expect(mutationOutcome([{ change: 'changed', editorial: false, segments: [eq] }])).toBe('unsichtbar')
    expect(mutationOutcome([{ change: 'changed', editorial: false, segments: null }])).toBe('unsichtbar')
    expect(mutationOutcome([{ change: 'removed', editorial: false, segments: null }, { change: 'inserted', editorial: false, segments: null }])).toBe('ungepaart')
  })
  it('calls forgiving and hiding a miss, and an unpaired unit not', () => {
    expect(['änderung', 'ungepaart'].map((o) => isMiss(o as never))).toEqual([false, false])
    expect(['redaktionell', 'unverändert', 'unsichtbar'].map((o) => isMiss(o as never))).toEqual([true, true, true])
  })
})
