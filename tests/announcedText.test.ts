import { describe, expect, it } from 'vitest'
import { announcedKey, announcedReading, announcedVerdict, emptyAnnouncements } from '../server/utils/laender/announcedText'

/**
 * The text an instruction announces and the reader did not find in its
 * place (`server/utils/laender/announcedText.ts`, 19.11.2026). The cases are
 * the corpus's: Salzburg 33884 (Abschussplan), 33388, 32706, Oberösterreich
 * 16103 and 16120, Burgenland's two quotations in one instruction.
 */

// Salzburg 33884 as the draft's PDF reads: the two rows Z 2 announces stand after Z 3.
const DRAFT_Z2 = 'Im § 3 werden folgende Änderungen vorgenommen: 2.1. Im Wildraum 2 – Hohe Tauern Ost lautet die die Wildregion 2.3 betreffende Zeile: 2.2. Im Wildraum 8 – Niedere Tauern – Gstoder lautet die die Wildregion 8.2 betreffende Zeile:'
const DRAFT_Z3 = 'Im § 4 erhält der bisherige Text die Absatzbezeichnung „(1)“ und wird nach Abs 1 angefügt: „(2) Die §§ 1 und 3 treten mit dem auf die Kundmachung folgenden Tag in Kraft.“ „ 2.3 45 86 61 “ „ 8.2 35 80 50 “'
// The Landesgesetzblatt: each row under its instruction.
const LGBL_Z2 = 'Im § 3 werden folgende Änderungen vorgenommen: 2.1. Im Wildraum 2 - Hohe Tauern Ost lautet die die Wildregion 2.3 betreffende Zeile: 2.3 43 80 59 2.2. Im Wildraum 8 - Niedere Tauern - Gstoder lautet die die Wildregion 8.2 betreffende Zeile: 8.2 35 80 50'

describe('emptyAnnouncements', () => {
  it('counts each announcement with nothing after it but the next sub-instruction or the end', () => {
    expect(emptyAnnouncements(DRAFT_Z2, 'Z2')).toBe(2)
  })

  it('reads a row of figures after the colon as the announced text, not as sub-instruction 2.3', () => {
    expect(emptyAnnouncements(LGBL_Z2, 'Z2')).toBe(0)
  })

  it('reads unquoted new text as filled, its Ziffer being the new text’s (33388)', () => {
    expect(emptyAnnouncements('Im § 56 werden folgende Änderungen vorgenommen: 1.1. Z 12 lautet wie folgt: 12. Richtlinie 98/24/EG des Rates', 'Z1')).toBe(0)
  })

  it('reads a quotation after the colon as filled (16103)', () => {
    expect(emptyAnnouncements('Im Inhaltsverzeichnis wird nach der Eintragung zu § 49 folgende Eintragung eingefügt: „§ 49a Oö. Heizungs- und Klimaanlagendatenbank“', 'Z2')).toBe(0)
    expect(emptyAnnouncements('Im Inhaltsverzeichnis wird nach der Eintragung zu § 49 folgende Eintragung eingefügt:', 'Z2')).toBe(1)
  })

  it('takes Salzburg’s closing quote for a colon (32706)', () => {
    expect(emptyAnnouncements('Im Inhaltsverzeichnis werden folgende Änderungen vorgenommen: 2.1. Die den § 6 betreffende Zeile lautet“ 2.2. Die die §§ 15 bis 17 betreffenden Zeilen lauten:', 'Z2')).toBe(2)
  })

  it('knows Oberösterreich’s dash items as sub-instructions (16120)', () => {
    expect(emptyAnnouncements('Im Inhaltsverzeichnis werden folgende Änderungen vorgenommen: - Der Eintrag zu § 4 wird durch folgenden Eintrag ersetzt: - Nach dem Eintrag zu § 8a werden folgende Einträge eingefügt:', 'Z1')).toBe(2)
  })

  it('reads no § — a colon before a numbered list is the law’s own text', () => {
    expect(emptyAnnouncements('(1) Folgende Angaben sind zu machen: 1. der Name', '§15')).toBe(0)
  })
})

describe('announcedReading', () => {
  it('reads the quotations trailing the next instruction as the rows the one before left room for', () => {
    const r = announcedReading([
      { article: 'V', id: 'Z2', text: DRAFT_Z2 },
      { article: 'V', id: 'Z3', text: DRAFT_Z3 },
    ])
    expect(r.get(announcedKey('Z2', DRAFT_Z2))).toEqual({ empty: 2, displaced: false })
    expect(r.get(announcedKey('Z3', DRAFT_Z3))).toEqual({ empty: 0, displaced: true })
  })

  it('leaves an instruction its own two quotations where nothing before it is empty (Burgenland)', () => {
    const text = 'In § 4 Abs 1 werden folgende Z 5a eingefügt und folgende Z 8 und 9 angefügt: „5a. die Vertretung des Dienstgebers (§ 6a),“ „8. die Datenübermittlung, (§ 10), 9. die Rechtsnachfolge (§ 11).“'
    expect(announcedReading([{ article: 'B', id: 'Z3', text }]).get(announcedKey('Z3', text))).toEqual({ empty: 0, displaced: false })
  })

  it('does not take an Absatz or a Ziffer with its words for a displaced row, whatever is empty before', () => {
    const toc = 'Im Inhaltsverzeichnis lautet die den § 27 betreffende Zeile:'
    const own = 'Im § 5 lauten die Abs 2 und 3: „(2) Erstens.“ „(3) Zweitens.“'
    const r = announcedReading([{ article: 'S', id: 'Z1', text: toc }, { article: 'S', id: 'Z2', text: own }])
    expect(r.get(announcedKey('Z2', own))).toEqual({ empty: 0, displaced: false })
  })

  it('keys a unit by its text as the comparison carries it', () => {
    const r = announcedReading([{ article: 'V', id: 'Z2', text: DRAFT_Z2 }], (t) => t.toUpperCase())
    expect(r.has(announcedKey('Z2', DRAFT_Z2.toUpperCase()))).toBe(true)
  })
})

describe('announcedVerdict', () => {
  const none = { empty: 0, displaced: false }
  it('withholds where the sides read the announcement differently — the diff would show what both carry as new or gone', () => {
    expect(announcedVerdict('changed', { empty: 2, displaced: false }, none)).toBe('withhold')
    expect(announcedVerdict('changed', { empty: 0, displaced: true }, none)).toBe('withhold')
  })

  it('names as unread where both lack it alike, or the unit stands on one side only', () => {
    expect(announcedVerdict('unchanged', { empty: 1, displaced: false }, { empty: 1, displaced: false })).toBe('unread')
    expect(announcedVerdict('changed', { empty: 1, displaced: false }, { empty: 1, displaced: false })).toBe('unread')
    expect(announcedVerdict('inserted', undefined, { empty: 1, displaced: false })).toBe('unread')
  })

  it('leaves alone what lacks nothing, and a unit both sides read displaced alike', () => {
    expect(announcedVerdict('changed', none, none)).toBeNull()
    expect(announcedVerdict('unchanged', { empty: 0, displaced: true }, { empty: 0, displaced: true })).toBeNull()
  })
})
