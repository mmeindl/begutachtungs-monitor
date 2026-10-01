import { describe, expect, it } from 'vitest'
import type { LawDiffUnit } from '../shared/types'
import { displayId, extraHeading, unitName, withoutOwnDesignation } from '../shared/utils/unitName'

function unit(u: Partial<LawDiffUnit>): LawDiffUnit {
  return {
    article: null,
    articleKey: null,
    fromArticleKey: null,
    id: '§1',
    fromId: null,
    heading: null,
    quotedHeading: null,
    change: 'changed',
    editorial: false,
    fromText: null,
    toText: null,
    segments: null,
    ...u,
  }
}

describe('unitName', () => {
  it('nimmt die zitierte Überschrift der Anweisung zuerst — den Namen nach der Novelle', () => {
    const u = unit({ id: 'Z3', quotedHeading: 'Landesausspielungen', heading: '§ 5 lautet samt Überschrift' })
    expect(unitName(u, { Z3: 'Sofortlotterien' }, 'Z3')).toBe('Landesausspielungen')
  })

  it('sonst den Namen aus dem geltenden Recht', () => {
    const u = unit({ id: 'Z3', heading: 'In § 9 Abs. 1 wird die Wortfolge …' })
    expect(unitName(u, { Z3: 'Sofortlotterien' }, 'Z3')).toBe('Sofortlotterien')
  })

  /**
   * Ein neues Gesetz ändert nichts, hat also keine Promulgationsklausel und
   * kein geltendes Recht — sein § trägt seinen Namen selbst (79/ME, VKrG 2026).
   */
  it('nennt den § eines neuen Gesetzes bei der Überschrift, die der Entwurf über ihn druckt', () => {
    const u = unit({ id: '§1', heading: 'Regelungsgegenstand', toText: 'Dieses Bundesgesetz regelt zur Umsetzung der Richtlinie …' })
    expect(unitName(u, {}, '§1')).toBe('Regelungsgegenstand')
  })

  /**
   * Die Überschrift einer Novellierungsanordnung IST die Anweisungszeile
   * (`novaoHeading`); als Name stünde der halbe Satz zweimal (121/ME Z 9).
   */
  it('macht aus einer Anweisungszeile keinen Namen', () => {
    const u = unit({
      id: 'Z9',
      heading: 'In § 9 Abs. 5, § 10 Abs. 1, § 13, § 14 Abs. 1 und 3 …',
      toText: 'In § 9 Abs. 5, § 10 Abs. 1, § 13, § 14 Abs. 1 und 3 wird das Wort "Strafgefangener" ersetzt.',
    })
    expect(unitName(u, {}, 'Z9')).toBeNull()
  })

  it('schweigt, wo niemand einen Namen kennt', () => {
    expect(unitName(unit({ id: '§2', heading: null }), {}, '§2')).toBeNull()
    expect(unitName(unit({ id: 'Z1', heading: 'Dem § 41a wird folgender Abs. 44 angefügt' }), null, 'Z1')).toBeNull()
  })
})

describe('extraHeading', () => {
  it('lässt weg, was ohnehin im Block steht', () => {
    const u = unit({ id: '§3', heading: 'Anwendungsbereich', toText: 'Anwendungsbereich § 3. Dieses Bundesgesetz gilt …' })
    expect(extraHeading(u)).toBeNull()
  })

  it('liest die gelöschte Seite, wo die Einheit entfällt', () => {
    const u = unit({ id: '§4', change: 'removed', heading: 'Übergangsbestimmung', fromText: 'Die Bestimmung tritt außer Kraft.', toText: null })
    expect(extraHeading(u)).toBe('Übergangsbestimmung')
  })
})

describe('displayId', () => {
  it('setzt das Leerzeichen, das die Bezeichnung lesbar macht', () => {
    expect(displayId('§5')).toBe('§ 5')
    expect(displayId('Z3')).toBe('Z 3')
    expect(displayId('§5#dup')).toBe('§ 5#dup')
  })
})

describe('withoutOwnDesignation', () => {
  it('drops the § the heading repeats — the card prints it in front already', () => {
    // SchOG § 37 as RIS serves it: „§ 37 § 37. Sonderformen …" on the card.
    expect(withoutOwnDesignation('§ 37. Sonderformen der allgemeinbildenden höheren Schulen', '§ 37')).toBe(
      'Sonderformen der allgemeinbildenden höheren Schulen',
    )
    expect(withoutOwnDesignation('§ 37 Sonderformen', '§ 37')).toBe('Sonderformen')
    expect(withoutOwnDesignation('§ 57a. Wiederkehrende Begutachtung', '§ 57a')).toBe('Wiederkehrende Begutachtung')
    // The trailing period of the heading itself stays: it is RIS's wording.
    expect(withoutOwnDesignation('§ 2. Begriffsbestimmungen.', '§ 2')).toBe('Begriffsbestimmungen.')
  })

  it('returns null where the designation is all there is', () => {
    expect(withoutOwnDesignation('§ 27.', '§ 27')).toBeNull()
    // The older form of the Genossenschaftsgesetz.
    expect(withoutOwnDesignation('§. 87.', '§ 87')).toBeNull()
  })

  it('never drops ANOTHER §', () => {
    expect(withoutOwnDesignation('§ 37a. Sonderformen', '§ 37')).toBe('§ 37a. Sonderformen')
    expect(withoutOwnDesignation('§ 370. Sonderformen', '§ 37')).toBe('§ 370. Sonderformen')
    expect(withoutOwnDesignation('§ 38. Sonderformen', '§ 37')).toBe('§ 38. Sonderformen')
  })

  it('leaves an ordinary heading alone, including one that merely starts like a designation', () => {
    expect(withoutOwnDesignation('Sonderformen', '§ 37')).toBe('Sonderformen')
    // GrEStG § 4: „Art" is a word here, not an Artikel.
    expect(withoutOwnDesignation('Art der Berechnung', '§ 4')).toBe('Art der Berechnung')
    expect(withoutOwnDesignation('§ 37. Sonderformen', 'Art. 3')).toBe('§ 37. Sonderformen')
  })
})
