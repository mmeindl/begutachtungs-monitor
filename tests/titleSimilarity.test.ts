import { describe, expect, it } from 'vitest'
import {
  COMPONENT_MEMO_LIMIT,
  TOKEN_MEMO_LIMIT,
  daysBetween,
  normalizeTitleText,
  splitParliamentTitle,
  titleComponents,
  titleMemoSizes,
  titleTokens,
} from '../server/utils/ris/titleSimilarity'

describe('title normalisation', () => {
  it('splits Parliament package abbreviations off the core title', () => {
    const { core, abks } = splitParliamentTitle('Sanktionengesetz 2024 – SanktG 2024; FATF-Prüfungsanpassungsgesetz 2024')
    expect(core).toBe('Sanktionengesetz 2024; FATF-Prüfungsanpassungsgesetz 2024')
    expect([...abks]).toEqual(['sanktg 2024'])
  })

  it('keeps long dash segments as title text', () => {
    const { core, abks } = splitParliamentTitle('Bundesgesetz über X – Anpassung der Fristen des Gesetzes')
    expect(core).toContain('Anpassung der Fristen')
    expect(abks.size).toBe(0)
  })

  it('normalises the Parliament prefix, ß and punctuation away', () => {
    expect(normalizeTitleText('Ministerialentwurf betreffend Straßenverkehrsordnung, Änderung (33. StVO-Novelle)')).toBe(
      'strassenverkehrsordnung änderung 33 stvo novelle',
    )
  })

  it('stems Genitive and splits -novelle compounds', () => {
    expect(titleTokens('Novelle des Eisenbahngesetzes; Eisenbahngesetznovelle 2021')).toEqual([
      'novelle',
      'eisenbahngesetz',
      'eisenbahngesetz',
      'novelle',
      '2021',
    ])
  })
})

describe('daysBetween', () => {
  it('counts signed whole days from a to b', () => {
    expect(daysBetween('2024-10-11', '2024-10-10')).toBe(-1)
  })
})

/**
 * The memos remembered every title and every pair of titles for the life of
 * the process until 22.10.2026 — the BGBl-II join of GP XXVII alone left
 * 774 MB in them, twice the production heap.
 */
describe('the title memos', () => {
  it('stay under their ceiling however many titles pass through', () => {
    for (let i = 0; i < TOKEN_MEMO_LIMIT + 100; i++) titleTokens(`Testverordnung Nummer ${i}`)
    for (let i = 0; i < COMPONENT_MEMO_LIMIT + 100; i++) titleComponents(`Honigverordnung ${i}`, 'Honigverordnung')
    const sizes = titleMemoSizes()
    expect(sizes.tokens).toBe(TOKEN_MEMO_LIMIT)
    expect(sizes.components).toBe(COMPONENT_MEMO_LIMIT)
  })

  it('answers a title it has forgotten the same as before', () => {
    const tokens = titleTokens('Novelle des Eisenbahngesetzes; Eisenbahngesetznovelle 2021')
    const components = titleComponents('Honigverordnung', 'Änderung der Honigverordnung')
    for (let i = 0; i < TOKEN_MEMO_LIMIT; i++) titleTokens(`Füllverordnung ${i}`)
    for (let i = 0; i < COMPONENT_MEMO_LIMIT; i++) titleComponents(`Füllverordnung ${i}`, 'Honigverordnung')
    expect(titleTokens('Novelle des Eisenbahngesetzes; Eisenbahngesetznovelle 2021')).toEqual(tokens)
    expect(titleComponents('Honigverordnung', 'Änderung der Honigverordnung')).toEqual(components)
  })
})
