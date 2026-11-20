import { describe, expect, it } from 'vitest'
import { lawNameOf } from '../shared/utils/lawName'
import { formatLawList } from '../app/utils/lawPackage'

describe('lawNameOf — a law\'s key is printed as its name (20.11.2026)', () => {
  // 127/ME XXVIII, as `/diff` answers: the group of the B-VG is keyed by the qualifier.
  const names = { '(Verfassungsbestimmung)': 'Änderung des Bundes-Verfassungsgesetzes' }

  it('prints the name for a key that is a qualifier, and any other key as it is', () => {
    expect(lawNameOf(names, '(Verfassungsbestimmung)')).toBe('Änderung des Bundes-Verfassungsgesetzes')
    expect(lawNameOf(names, 'Änderung des Verfassungsgerichtshofgesetzes 1953')).toBe('Änderung des Verfassungsgerichtshofgesetzes 1953')
  })

  it('keeps the key where the answer carries no names, and null for no law', () => {
    expect(lawNameOf(undefined, '(Verfassungsbestimmung)')).toBe('(Verfassungsbestimmung)')
    expect(lawNameOf(names, null)).toBeNull()
  })

  it('names the law in a sentence that lists laws', () => {
    const laws = [{ article: '(Verfassungsbestimmung)', units: 12 }, { article: 'Änderung des Verfassungsgerichtshofgesetzes 1953', units: 2 }]
    expect(formatLawList(laws.map((l) => ({ ...l, article: lawNameOf(names, l.article) })))).toBe('Änderung des Bundes-Verfassungsgesetzes und Änderung des Verfassungsgerichtshofgesetzes 1953')
  })
})
