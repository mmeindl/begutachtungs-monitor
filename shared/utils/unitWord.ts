/**
 * What a law's unit is called where the page speaks about it (20.11.2026).
 *
 * Almost every law counts in Paragraphen. A few count in Artikel — the
 * B-VG above all — and there „Eine Anweisung des Entwurfs zu diesem
 * Paragraphen …" stood at „Artikel 94." and „§ 94" in the list at the end of
 * the law (82/ME and 127/ME XXVIII). Every sentence about one unit takes
 * its word from here; the default everywhere is the Paragraph, whose
 * wording did not move.
 *
 * Which of the two a block is, the annex's rows decide, once for the oracle
 * and the page (`articleUnitLaws` in `explanationKey.ts`); the placement
 * hands it down (`ParaPlacement.unit`). Never read off a display string.
 *
 * The forms are German and stand here together, so a second language
 * replaces this table and the sentences that take from it, and nothing in
 * between. Both words are masculine, which is why the sentences keep their
 * own articles („dieser", „diesem", „den", „kein", „ganzer").
 */
export type UnitKind = 'paragraph' | 'article'

export interface UnitWordDe {
  /** „Der Paragraph", „kein Artikel". */
  nominative: string
  /** Accusative and dative singular: „diesen Paragraphen", „zu diesem Artikel". */
  oblique: string
  /** „des Paragraphen", „des Artikels". */
  genitive: string
  /** Nominative and accusative plural: „die ganzen Paragraphen", „mehr Artikel". */
  plural: string
  /** In front of one number: „§ 12", „Art. 94". */
  sign: string
  /** In front of several: „§§ 12 und 14", „Art. 94 und 94a". */
  signs: string
}

export const UNIT_WORD_DE: Record<UnitKind, UnitWordDe> = {
  paragraph: { nominative: 'Paragraph', oblique: 'Paragraphen', genitive: 'Paragraphen', plural: 'Paragraphen', sign: '§', signs: '§§' },
  article: { nominative: 'Artikel', oblique: 'Artikel', genitive: 'Artikels', plural: 'Artikel', sign: 'Art.', signs: 'Art.' },
}

/** The unit of a law, from the one decision there is (`articleUnitLaws`). */
export function unitKindOf(articleUnits: boolean): UnitKind {
  return articleUnits ? 'article' : 'paragraph'
}

/**
 * The plural for a sentence about a whole draft, whose laws may count
 * differently: „Paragraphen", „Artikel", or „Paragraphen und Artikel" where
 * it carries both (127/ME XXVIII: the B-VG beside the
 * Verfassungsgerichtshofgesetz). „Paragraphen" where nothing is known.
 */
export function unitsPluralDe(kinds: Iterable<UnitKind>): string {
  const seen = new Set(kinds)
  const words = (['paragraph', 'article'] as const).filter((k) => seen.has(k)).map((k) => UNIT_WORD_DE[k].plural)
  return words.length ? words.join(' und ') : UNIT_WORD_DE.paragraph.plural
}
