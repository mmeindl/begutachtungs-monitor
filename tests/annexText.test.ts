import { describe, expect, it } from 'vitest'
import { comparableTokens, designationKey } from '../server/utils/annex/annexText'

describe('what is not comparable', () => {
  // Three of these were once the ruler blaming the parse for its own gaps.
  it('discounts the annex elision syntax', () => {
    expect(comparableTokens('(1) bis (3) …')).toEqual([])
    expect(comparableTokens('§ 21. bis § 25. …')).toEqual([])
    expect(comparableTokens('1. bis 100. …')).toEqual([])
    // "bis" is the annex's own word, not law text, and was the single most
    // frequent "missing" word in the corpus.
    expect(comparableTokens('(1) bis (3) … Der Rest bleibt.')).toEqual(['der', 'rest', 'bleibt'])
  })

  it("discounts the row's own designation but not a citation", () => {
    expect(comparableTokens('§ 217. Die Behörde entscheidet.')).toEqual(['die', 'behörde', 'entscheidet'])
    // A citation does not end in a period, so its number is law text and stays.
    expect(comparableTokens('Nach § 217 Abs. 2 entscheidet die Behörde.')).toContain('217')
  })

  it("discounts RIS's editorial notes and web-view boilerplate", () => {
    expect(comparableTokens('(Anm.: Abs. 2 aufgehoben durch BGBl. I Nr. 1/2020)')).toEqual([])
    expect(comparableTokens('Beachte für folgende Bestimmung Der Text gilt.')).toEqual(['der', 'text', 'gilt'])
  })
})

describe('designationKey', () => {
  it('reads the annex and RIS spellings of one provision onto the same key', () => {
    expect(designationKey('§ 5.')).toBe(designationKey('§ 5'))
    expect(designationKey('Anlage 1')).toBe(designationKey('Anl. 1'))
    expect(designationKey('Anhang 2')).toBe(designationKey('Anl. 2'))
    expect(designationKey('Artikel 3')).toBe(designationKey('Art. 3'))
    // A Gliederungssymbol that dropped its sign is still a §.
    expect(designationKey('5.')).toBe(designationKey('§ 5'))
  })

  it('keeps § 5 and § 5a apart', () => {
    // The shipped rule built `^§+\s*5(?![.\d])` and matched the RIS label
    // "§ 5a" with it, so whichever of the two RIS returned first decided —
    // and § 5 could be scored against § 5a's text.
    expect(designationKey('§ 5.')).not.toBe(designationKey('§ 5a'))
    expect(designationKey('§ 5a')).toBe(designationKey('§ 5A'))
  })

  it('keeps a § of an article-structured law out of reach', () => {
    // RIS files those as "Art. 3 § 5" (5.474 labels in the cached corpus).
    // The Artikel is part of the §'s identity there, which is exactly why
    // the amendment engine refuses such addresses too.
    expect(designationKey('Art. 3 § 5')).toBe('Art 3 § 5')
    expect(designationKey('§ 5')).not.toBe(designationKey('Art. 3 § 5'))
    expect(designationKey('Art. 3')).not.toBe(designationKey('Art. 3 § 5'))
  })

  it('keeps a split Anlage apart from the whole one', () => {
    expect(designationKey('Anl. 1/59')).not.toBe(designationKey('Anl. 1'))
  })

  it('reads the numeral forms RIS actually prints', () => {
    // "§ 373i1" and "§ 373i2" are two provisions; the old id regex cut both
    // to "373i" and then matched neither.
    expect(designationKey('§ 373i1')).toBe('§ 373i1')
    expect(designationKey('§ 373i1')).not.toBe(designationKey('§ 373i2'))
    expect(designationKey('§ 1.08')).toBe('§ 1.08')
    expect(designationKey('Anl. 1A')).toBe('Anl 1a')
  })

  it('refuses a text that names no provision', () => {
    expect(designationKey('Präambel')).toBeNull()
    expect(designationKey('')).toBeNull()
  })

  it('stops the number at the first space, and has to', () => {
    // Whitespace inside a designation is never the document's: it is what a
    // parser makes of markup or of PDF geometry, and it has to be taken out
    // where it appears (for the annex table, `lawText.stripMarkup`, which the
    // designation has been read through since 2026-09-11). Gluing the parts
    // back together *here* was measured and decided against — the sequence
    // "numeral, space, numeral, full stop" is also how a real pair of
    // designations reads, and it is common:
    expect(designationKey('§ 5 3. Abschnitt')).toBe('§ 5')
    expect(designationKey('§ 5 Abs. 3')).toBe('§ 5')
    expect(designationKey('§§ 5 und 6')).toBe('§ 5')
  })

  it('ignores whatever stands beside the designation, and that was measured', () => {
    // The truncation is silent, so the question was whether an *unexplained*
    // remainder should make the key null — a row unkeyed and therefore never
    // checked against a possibly wrong §. Measured over GP XXVIII on
    // 2026-09-11: of the 11.169 table-path rows carrying a designation, 555
    // have anything at all beside it, and the classes are clean — but they say
    // the opposite of that rule. 434 of the 555 are schedule headings the
    // annex prints with their title ("Anlage 1 Mindestgliederung Bilanz",
    // "Anlage 3 zu § 10 und § 11"), and unkeying those would cost the §§ whose
    // key is right today to save the handful whose key is wrong. On the RIS
    // side the question does not arise at all: of the 1.959 distinct labels
    // the GP-XXVIII laws carry, **none** has a remainder, so `indexOf` reads
    // pure designations and its near-injectivity is untouched.
    expect(designationKey('Anlage 1 Mindestgliederung Bilanz')).toBe('Anl 1')
    expect(designationKey('Anlage 1 (wird hier nicht abgebildet)')).toBe('Anl 1')
  })

  it('reads a schedule title that cites §§ as a title, not as a name', () => {
    // The residual the same measurement named, and it was a *wrong* key rather
    // than a truncation: "Anlage 3 zu § 10 und § 11" became `Anl 3 § 10 § 11`,
    // which RIS never holds, so the § was looked up, missed, and left
    // unchecked — 12 §§ of GP XXVIII until 2026-09-11.
    expect(designationKey('Anlage 3 zu § 10 und § 11')).toBe('Anl 3')
    expect(designationKey('Anl. 1 zu § 5 Abs. 1')).toBe('Anl 1')
    expect(designationKey('Anlage 1 zu den §§ 5 und 6')).toBe('Anl 1')
    // The longest of the twelve, verbatim from the Bildungsdokumentations-VO.
    expect(designationKey('Anlage 1 zu § 5 Abs. 1, § 7 Abs. 1 und § 25 Teil I Daten der Schulen')).toBe('Anl 1')
    // The cut is a *joiner* between two parts, never a prefix. "Zu § 5" is how
    // the Erläuterungen head a section, and it names § 5 as surely as "§ 5"
    // does — there is no earlier designation for the word to separate from.
    expect(designationKey('Zu § 5')).toBe('§ 5')
    expect(designationKey('(zu § 5 Abs. 2)')).toBe('§ 5')
    // …so the one composite RIS *does* hold has to survive, and it does: its
    // parts are joined by a plain space. Every composite label reading in the
    // GP-XXVIII laws is of this shape (1.534 of 1.546), and the rule's own
    // predicate matches no RIS label anywhere in the offline corpus —
    // 0 of 195.875 occurrences, 0 of 4.251 distinct (2026-09-11).
    expect(designationKey('Art. 3 § 5')).toBe('Art 3 § 5')
  })
})
