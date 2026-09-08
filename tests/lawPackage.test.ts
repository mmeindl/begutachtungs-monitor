import { describe, expect, it } from 'vitest'
import { droppedLawsNote, formatLawList, mergedLawsNote } from '../shared/utils/lawPackage'

const laws = (...names: string[]) => names.map((article, i) => ({ article, units: i + 1 }))

describe('formatLawList', () => {
  it('enumerates up to three names, then counts the rest', () => {
    expect(formatLawList(laws('A'))).toBe('A')
    expect(formatLawList(laws('A', 'B'))).toBe('A und B')
    expect(formatLawList(laws('A', 'B', 'C'))).toBe('A, B und C')
    expect(formatLawList(laws('A', 'B', 'C', 'D'))).toBe('A, B, C und ein weiteres')
    expect(formatLawList(laws('A', 'B', 'C', 'D', 'E'))).toBe('A, B, C und 2 weitere')
  })

  it('says nothing about an empty package', () => {
    expect(formatLawList([])).toBe('')
  })
})

describe('the two notes agree in number', () => {
  it('merged, singular', () => {
    expect(mergedLawsNote(laws('Änderung des Datenschutzgesetzes'))).toContain('ein weiteres Gesetz, das in diesem Entwurf nicht vorkommt')
  })

  it('merged, plural', () => {
    const s = mergedLawsNote(laws('A', 'B'))!
    expect(s).toContain('2 weitere Gesetze, die in diesem Entwurf nicht vorkommen')
    expect(s).not.toContain('nicht vorkommt')
  })

  it('dropped, singular — and the law that may sit in another bill is "es"', () => {
    const s = droppedLawsNote(laws('A'))!
    expect(s).toContain('ein Gesetz, das in dieser Regierungsvorlage nicht vorkommt')
    expect(s).toContain('möglicherweise steht es in einer anderen')
  })

  it('dropped, plural', () => {
    const s = droppedLawsNote(laws('A', 'B', 'C', 'D'))!
    expect(s).toContain('4 Gesetze, die in dieser Regierungsvorlage nicht vorkommen')
    expect(s).toContain('möglicherweise stehen sie in einer anderen')
    expect(s).not.toContain('nicht vorkommt')
  })

  it('stays silent when both documents carry the same laws', () => {
    expect(mergedLawsNote([])).toBeNull()
    expect(droppedLawsNote([])).toBeNull()
  })
})
