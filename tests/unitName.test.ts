import { describe, expect, it } from 'vitest'
import type { LawDiffUnit } from '../shared/types'
import { displayId, extraHeading, unitName } from '../shared/utils/unitName'

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
