import { describe, expect, it } from 'vitest'
import { explanationKey, explanationParaId } from '../shared/utils/explanationKey'

describe('explanationParaId', () => {
  it('normalisiert die Bezeichnung auf beiden Seiten — und nimmt keine Anlage für einen §', () => {
    expect(explanationParaId('§ 54c.')).toBe('54c')
    expect(explanationParaId('§ 54C')).toBe('54c')
    expect(explanationParaId('Anlage 1 zu § 6')).toBeNull()
    expect(explanationParaId(null)).toBeNull()
  })
})

describe('explanationKey', () => {
  it('trägt das leere Gesetz als echten Wert', () => {
    expect(explanationKey(null, '5')).toBe('#5')
    expect(explanationKey('Änderung der Notariatsordnung', '54c')).toBe('Änderung der Notariatsordnung#54c')
  })
})
