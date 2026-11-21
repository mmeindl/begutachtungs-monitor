import { describe, expect, it } from 'vitest'
import type { ComparisonRow } from '../server/utils/annex/comparisonRows'
import { chainedAbsaetze } from '../scripts/lib/faultSites'

const row = (proposed: string, over: Partial<ComparisonRow> = {}): ComparisonRow =>
  ({ kind: 'pair', law: null, para: '§ 5', gld: '§ 5', current: '', proposed, change: 'changed', elided: false, segments: null, editorial: false, ...over }) as ComparisonRow

// „Fehlt" drops an Absatz the annex names in an elision only (21.11.2026).
// On the PDF path a whole § is one changed row, never an elided one, so a
// rule that took its sites from elided rows alone found none there.
describe('chainedAbsaetze', () => {
  it('finds the chain inside a changed row of the PDF path, and not the Absätze printed with their words', () => {
    const sites = chainedAbsaetze([row('§ 5. Frist (1) Die Frist beträgt drei Monate. (2) bis (4) … (5) Der Antrag ist schriftlich einzubringen. (6) …')])
    expect([...sites.chained].sort()).toEqual(['2', '4', '6'])
    expect([...sites.withText].sort()).toEqual(['1', '5'])
  })

  it('still takes every marker of an elided row, the table path\'s shape', () => {
    const sites = chainedAbsaetze([row('(1) bis (26) …', { elided: true, change: 'unchanged' }), row('(27) Neu ist der Absatz.')])
    expect([...sites.chained].sort()).toEqual(['1', '26'])
    expect([...sites.withText]).toEqual(['27'])
  })

  it('takes no Absatz the geltende column prints with its words: „Fehlt" drops it from the standing text too', () => {
    const sites = chainedAbsaetze([row('§ 5. (1) Neu. (2) … (3) Neu.', { current: '§ 5. (1) Alt. (2) Die Frist beträgt drei Monate. (3) Alt.' })])
    expect([...sites.chained]).toEqual(['2'])
    expect(sites.withText.has('2')).toBe(true)
  })

  it('takes no Absatz whose opening is elided and whose Ziffern follow (Bilanzbuchhaltungsgesetz § 23)', () => {
    const sites = chainedAbsaetze([row('§ 23. (1) und (2) ... 1. ... 2. die Anmeldung zur Fachprüfung, 3. die Durchführung der Fachprüfung. (3) Die Prüfungsgebühren …')])
    expect(sites.chained.has('2')).toBe(true)
    expect(sites.withText.has('2')).toBe(true)
    expect(sites.withText.has('1')).toBe(false)
  })

  it('takes a marker glued to its „…" and reads further elision marks as no text', () => {
    const glued = chainedAbsaetze([row('§ 120. (1) bis (8)… (9a) Die §§ 8 bis 10 gelten.')])
    expect(glued.chained.has('8')).toBe(true)
    expect(glued.withText.has('8')).toBe(false)
    const marks = chainedAbsaetze([row('(1) bis (3) …', { elided: true, change: 'unchanged', current: '(1) bis (3) …' }), row('', { change: 'inserted', current: '' }), row('[...]', { elided: true, change: 'unchanged', current: '[...]' })])
    expect(marks.withText.has('3')).toBe(false)
  })

  it('reads a bracketed number inside a sentence as neither', () => {
    const sites = chainedAbsaetze([row('(1) Die Noten lauten sehr gut (1), gut (2) und genügend (4).')])
    expect([...sites.chained]).toEqual([])
    expect([...sites.withText]).toEqual(['1'])
  })
})
