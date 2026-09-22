import { describe, expect, it } from 'vitest'
import {
  daysBetween,
  normalizeTitleText,
  splitParliamentTitle,
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
