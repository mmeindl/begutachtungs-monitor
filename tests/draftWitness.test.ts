import { describe, expect, it } from 'vitest'
import { renditionOfPages, witnessVerdict, type WitnessInstruction } from '../server/utils/kons/draftWitness'
import type { ComparisonRow } from '../server/utils/annex/comparisonRows'

/**
 * The second witness alone, on a word fault the fault injection found
 * shown by it (20.11.2026): the result's „Behörde" turned into the word
 * another line of the § writes.
 */
const changed = (current: string, proposed: string): ComparisonRow => ({
  kind: 'pair', law: null, heading: null, gld: '§ 21.', para: '§ 21.', paraAfter: '§ 21.', current, proposed,
  change: 'changed', elided: false, segments: null, editorial: false, elisionRange: false,
})

describe('witnessVerdict', () => {
  const before = 'Nach diesem Gesetz ist die zuständige Behörde und prüft den Antrag binnen einer Woche. Das Luftfahrzeug wird jährlich geprüft.'
  const line = 'In § 21 wird das Wort „Luftfahrzeug“ durch das Wort „Lufttüchtigkeit“ ersetzt.'
  const touching: WitnessInstruction[] = [{ op: { kind: 'replacePhrase', target: { para: '21' } as never, from: 'Luftfahrzeug', to: 'Lufttüchtigkeit', everywhere: false, eachUnit: false, wordBound: true }, line, payload: [] }]
  const pdf = renditionOfPages([`1 von 3\n5. ${line}`])
  const annex = [changed(before, 'Nach diesem Gesetz ist die zuständige Behörde und prüft den Antrag binnen einer Woche. Das Lufttüchtigkeit wird jährlich geprüft.')]

  it('shows no result where the payload stands more often than the instruction wrote it', () => {
    const faulted = 'Nach diesem Gesetz ist die zuständige Lufttüchtigkeit und prüft den Antrag binnen einer Woche. Das Lufttüchtigkeit wird jährlich geprüft.'
    expect(witnessVerdict('21', before, faulted, annex, touching, pdf)).toEqual({ released: false, reason: 'nicht-neuer-text' })
  })

  it('says why without a rendition', () => {
    expect(witnessVerdict('21', before, before, annex, touching, null)).toEqual({ released: false, reason: 'keine-fassung' })
  })
})
