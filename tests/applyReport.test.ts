import { describe, expect, it } from 'vitest'
import { extraTokens, isOmissionOf, isSubsetOfRis, verdictFor, verdictForTrees } from '../server/utils/applyReport'
import type { LawNode } from '../server/utils/lawStructure'

const before = 'Zuständig ist die Behörde am Sitz der Partei.'

describe('extraTokens', () => {
  it('reports nothing when the engine made exactly the RIS changes', () => {
    const ris = 'Zuständig ist die Bezirksverwaltungsbehörde am Sitz der Partei.'
    expect(extraTokens(before, ris, ris)).toMatchObject({ inserted: [], removed: [], comparable: true })
  })

  it('names a word the engine invented', () => {
    const got = 'Zuständig ist die Bezirksverwaltungsbehörde am Wohnsitz der Partei.'
    const ris = 'Zuständig ist die Bezirksverwaltungsbehörde am Sitz der Partei.'
    expect(extraTokens(before, got, ris).inserted).toContain('Wohnsitz')
  })

  it('names a word the engine deleted on its own', () => {
    // The engine dropped "am Sitz der Partei" that RIS kept — as wrong as inventing.
    const got = 'Zuständig ist die Bezirksverwaltungsbehörde.'
    const ris = 'Zuständig ist die Bezirksverwaltungsbehörde am Sitz der Partei.'
    expect(extraTokens(before, got, ris).removed).toContain('Sitz')
    expect(isSubsetOfRis(before, got, ris)).toBe(false)
  })
})

describe('verdictFor', () => {
  const ris = 'Zuständig ist die Bezirksverwaltungsbehörde am Sitz der Partei.'

  it('separates the four outcomes', () => {
    expect(verdictFor(before, ris, ris)).toBe('identisch')
    expect(verdictFor(before, before, ris)).toBe('unverändert')
    // Doing less than RIS is safe; the paragraph is refused, not published.
    expect(verdictFor(before, 'Zuständig ist die Behörde am Sitz der Partei.', ris)).toBe('unverändert')
    expect(verdictFor(before, 'Zuständig ist die Bezirksverwaltungsbehörde am Wohnsitz der Partei.', ris)).toBe('abweichend')
  })

  it('separates a half-applied change from a pure omission', () => {
    // Both did less than RIS, and only one of them left law behind. The
    // engine applied the first replacement and not the second, so the § still
    // says "der Partei" where the law says "des Antragstellers": no word was
    // invented, and the result is not a version the law ever had. Counting
    // that as harmless is what put 108 of 139 paragraphs on the safe side of
    // the report.
    const twoChanges = 'Zuständig ist die Bezirksverwaltungsbehörde am Sitz des Antragstellers.'
    const halfDone = 'Zuständig ist die Bezirksverwaltungsbehörde am Sitz der Partei.'
    expect(verdictFor(before, halfDone, twoChanges)).toBe('halbangewendet')

    // A pure omission: the engine's text is the law with words left out.
    expect(verdictFor(before, 'Zuständig ist die Bezirksverwaltungsbehörde am Sitz.', twoChanges)).toBe('unvollständig')
  })

  it('catches the insert applied without its delete', () => {
    // The shape of the largest case in the corpus: 547 words produced against
    // 414 in RIS, every one of the 414 present — the old text kept *and* the
    // new text added.
    const was = 'Die Behörde entscheidet.'
    const ris2 = 'Das Gericht entscheidet.'
    const kept = 'Die Behörde Das Gericht entscheidet.'
    // Every word the engine added, RIS added too — it simply never removed
    // the words RIS replaced.
    expect(isSubsetOfRis(was, kept, ris2)).toBe(true)
    expect(isOmissionOf(kept, ris2)).toBe(false)
    expect(verdictFor(was, kept, ris2)).toBe('halbangewendet')
  })

  it('judges an omission without needing the word diff', () => {
    // A very long pair skips the word diff. That must not stop a pure
    // omission from being recognised as one — the segment comparison could
    // never prove it, so every long paragraph fell through to a divergence.
    const long = (n: number) => Array.from({ length: n }, (_, i) => `wort${i}`).join(' ')
    expect(verdictFor(null, long(2000), long(3000))).toBe('unvollständig')
  })

  it('never passes a paragraph whose diff could not be computed', () => {
    // A very long pair skips the word diff; that must not read as harmless.
    // Its text is no omission either, so nothing rescues it.
    const long = (word: string) => Array.from({ length: 3000 }, () => word).join(' ')
    expect(verdictFor(long('a'), long('b'), long('c'))).toBe('abweichend')
  })
})

describe('verdictFor on a paragraph the Novelle creates', () => {
  // No earlier version exists, so `before` is null. The engine must still be
  // judged on whether it invented text, not counted dangerous by default.
  it('calls a fragment of the published text incomplete, not divergent', () => {
    expect(verdictFor(null, 'Der Bund traegt die Kosten.', 'Der Bund traegt die Kosten. Das Naehere regelt eine Verordnung.')).toBe('unvollständig')
  })

  it('still calls invented text divergent', () => {
    expect(verdictFor(null, 'Der Bund traegt saemtliche Kosten.', 'Der Bund traegt die Kosten.')).toBe('abweichend')
  })
})

describe('verdictForTrees', () => {
  const node = (text: string, children: string[] = []): LawNode => ({
    level: 'para',
    id: '1',
    marker: '§ 1.',
    heading: null,
    text,
    children: children.map((t, i) => ({ level: 'abs' as const, id: String(i + 1), marker: `(${i + 1})`, heading: null, text: t, children: [] })),
  })
  const long = (word: string) => Array.from({ length: 1700 }, () => word).join(' ')

  it('agrees with the text verdict where the diff is computable', () => {
    expect(verdictForTrees(node('', ['alt']), node('', ['neu']), node('', ['neu']))).toBe('identisch')
    expect(verdictForTrees(node('', ['alt']), node('', ['falsch']), node('', ['neu']))).toBe('abweichend')
  })

  it('falls back to the Absätze when the whole § is too long to diff', () => {
    // Two long Absätze: the § as a whole exceeds the DP grid, each Absatz does not.
    const before = node('', [long('a'), long('b')])
    const ris = node('', [long('a'), long('b'), 'Neu.'])
    expect(verdictForTrees(before, node('', [long('a'), long('b'), 'Neu.']), ris)).toBe('identisch')
    expect(verdictForTrees(before, node('', [long('a'), long('b')]), ris)).toBe('unverändert')
    expect(verdictForTrees(before, node('', [long('a'), long('b'), 'Falsch.']), ris)).toBe('abweichend')
    // An Absatz the engine has and RIS does not is invented law.
    expect(verdictForTrees(before, node('', [long('a'), long('b'), 'Neu.', 'Extra.']), ris)).toBe('abweichend')
  })
})
