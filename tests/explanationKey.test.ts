import { describe, expect, it } from 'vitest'
import { annexUnitId, explanationKey, explanationParaId } from '../shared/utils/explanationKey'

describe('explanationParaId', () => {
  it('normalisiert die Bezeichnung auf beiden Seiten — und nimmt keine Anlage für einen §', () => {
    expect(explanationParaId('§ 54c.')).toBe('54c')
    expect(explanationParaId('§ 54C')).toBe('54c')
    expect(explanationParaId('Anlage 1 zu § 6')).toBeNull()
    expect(explanationParaId(null)).toBeNull()
  })

  // 707EA278: a Verordnung numbered by Kapitel. Read as „8", none of its
  // outcomes („8.03") met a § block (26.10.2026).
  it('nimmt eine Kapitelnummer ganz, den Punkt hinter der Zahl nicht', () => {
    expect(explanationParaId('§ 8.03')).toBe('8.03')
    expect(explanationParaId('§ 2.01.')).toBe('2.01')
    expect(explanationParaId('§ 5.')).toBe('5')
    expect(annexUnitId('§ 3.22')).toBe('3.22')
  })
})

// 18/ME and 116/ME XXVIII: the ZPO's and the JN's designation. The oracle
// reads it through this function since 20.11.2026, so the page does too.
describe('„§. 39." — the full stop after the sign', () => {
  it('is a § designation, on both sides of the annex', () => {
    expect(explanationParaId('§. 39.')).toBe('39')
    expect(explanationParaId('§. 517.')).toBe('517')
    expect(annexUnitId('§. 320.')).toBe('320')
    // A soft hyphen the text layer left between sign and number is no character a reader sees.
    expect(explanationParaId('§\u00ad 5.')).toBe('5')
  })
})

describe('explanationKey', () => {
  it('trägt das leere Gesetz als echten Wert', () => {
    expect(explanationKey(null, '5')).toBe('#5')
    expect(explanationKey('Änderung der Notariatsordnung', '54c')).toBe('Änderung der Notariatsordnung#54c')
  })
})
