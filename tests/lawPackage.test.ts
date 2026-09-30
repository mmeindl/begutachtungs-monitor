import { describe, expect, it } from 'vitest'
import { droppedLawsNote, formatLawList, mergedLawsNote, outsideDraftNote } from '../app/utils/lawPackage'

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

// A draft kundgemacht as one part of a larger act (docs/architecture.md
// §12.33): the act after a colon, never declined — a Kurztitel is any noun
// phrase, and the genitive is the mistake the station label made once.
describe('a draft inside a larger act', () => {
  const act = { citation: 'BGBl. I Nr. 50/2025', title: 'Informationsfreiheits-Anpassungsgesetz' }

  it('names the act and says the counts are the draft’s', () => {
    const s = outsideDraftNote(laws('A', 'B', 'C', 'D'), act)!
    expect(s).toContain('fasst diesen Entwurf mit anderen Ministerialentwürfen zusammen')
    expect(s).toContain('als Teil eines größeren Gesetzes kundgemacht: Informationsfreiheits-Anpassungsgesetz, BGBl. I Nr. 50/2025')
    expect(s).toContain('Verglichen und gezählt wird nur, was zu diesem Entwurf gehört')
    expect(s).toContain('nicht verglichen sind 4 weitere Gesetze: A, B, C und ein weiteres.')
  })

  it('singular, and without an act where the pair ends before the Bundesgesetzblatt', () => {
    const s = outsideDraftNote(laws('A'), null)!
    expect(s).toContain('nicht verglichen ist ein weiteres Gesetz: A.')
    expect(s).not.toContain('kundgemacht')
  })

  it('where nothing could be cut, says the counts are the whole text’s', () => {
    // XXVII 6/ME and 11/ME: two drafts, one law, the Geldwäschenovelle 2020.
    const s = outsideDraftNote([], { citation: 'BGBl. I Nr. 65/2020', title: 'Geldwäschenovelle 2020' })
    expect(s).toBe(
      'Die Regierungsvorlage fasst diesen Entwurf mit anderen Ministerialentwürfen zusammen, und er wurde als Teil eines größeren Gesetzes kundgemacht: Geldwäschenovelle 2020, BGBl. I Nr. 65/2020. ' +
      'Welche Änderungen aus diesem Entwurf stammen, lässt sich im Text nicht trennen; verglichen wird der ganze Text.',
    )
    expect(outsideDraftNote([], null)).not.toContain('kundgemacht')
  })

  it('without a Kurztitel, the citation alone', () => {
    expect(outsideDraftNote([], { citation: 'BGBl. I Nr. 50/2025', title: null })).toContain('kundgemacht: BGBl. I Nr. 50/2025.')
  })

  it('from the draft itself, the merged-laws note names the act instead of guessing the mechanism', () => {
    const s = mergedLawsNote(laws('A', 'B'), 'me', 'bgbl', act)!
    expect(s).toContain('Die Fassung im Bundesgesetzblatt ändert 2 weitere Gesetze, die in diesem Entwurf nicht vorkommen')
    expect(s).toContain('Der Entwurf wurde als Teil eines größeren Gesetzes kundgemacht: Informationsfreiheits-Anpassungsgesetz')
    expect(s).not.toContain('Im Parlament werden Vorlagen')
  })
})
