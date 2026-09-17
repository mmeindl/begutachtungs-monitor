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
    expect(mergedLawsNote(laws('Änderung des Datenschutzgesetzes'), 'me', 'rv')).toContain('ein weiteres Gesetz, das in diesem Entwurf nicht vorkommt')
  })

  it('merged, plural', () => {
    const s = mergedLawsNote(laws('A', 'B'), 'me', 'rv')!
    expect(s).toContain('2 weitere Gesetze, die in diesem Entwurf nicht vorkommen')
    expect(s).not.toContain('nicht vorkommt')
  })

  it('dropped, singular — and the law that may sit in another bill is "es"', () => {
    const s = droppedLawsNote(laws('A'), 'me', 'rv')!
    expect(s).toContain('ein Gesetz, das in dieser Regierungsvorlage nicht vorkommt')
    expect(s).toContain('möglicherweise steht es in einer anderen')
  })

  it('dropped, plural', () => {
    const s = droppedLawsNote(laws('A', 'B', 'C', 'D'), 'me', 'rv')!
    expect(s).toContain('4 Gesetze, die in dieser Regierungsvorlage nicht vorkommen')
    expect(s).toContain('möglicherweise stehen sie in einer anderen')
    expect(s).not.toContain('nicht vorkommt')
  })

  it('stays silent when both documents carry the same laws', () => {
    expect(mergedLawsNote([], 'me', 'rv')).toBeNull()
    expect(droppedLawsNote([], 'me', 'rv')).toBeNull()
  })
})

describe('the notes name the pair they are about', () => {
  it('names the two parliamentary stations instead of the draft', () => {
    const merged = mergedLawsNote(laws('A'), 'rv', 'ausschuss')!
    expect(merged).toContain('Die Ausschussfassung ändert')
    expect(merged).toContain('in dieser Regierungsvorlage nicht vorkommt')
    // The Ministerialentwurf is not part of this comparison and must not be
    // named in it — the sentence would attribute the difference to the wrong
    // actor.
    expect(merged).not.toContain('Entwurf')

    const dropped = droppedLawsNote(laws('A'), 'rv', 'plenum')!
    expect(dropped).toContain('Die Regierungsvorlage ändert')
    expect(dropped).toContain('in dieser Plenarfassung nicht vorkommt')
  })

  it('explains only the mechanism that fits the pair', () => {
    // Bundling several Ministerialentwürfe is what a Regierungsvorlage does;
    // saying it about a committee version would be an invented explanation.
    expect(mergedLawsNote(laws('A'), 'me', 'rv')!).toContain('fasst häufig mehrere Ministerialentwürfe zusammen')
    expect(mergedLawsNote(laws('A'), 'rv', 'ausschuss')!).not.toContain('Ministerialentwürfe')
    expect(droppedLawsNote(laws('A'), 'rv', 'ausschuss')!).not.toContain('Regierungsvorlagen münden')
  })
})
