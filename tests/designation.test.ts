import { describe, expect, it } from 'vitest'
import { anlageLabelKey, bareParaId } from '../server/utils/text/designation'

describe('bareParaId', () => {
  it('reads the number out of a designation, whatever the kind', () => {
    expect(bareParaId('§ 285b.')).toBe('285b')
    expect(bareParaId('Anl. 2')).toBe('2')
    expect(bareParaId('Art. 3')).toBe('3')
    expect(bareParaId('§ 12.1')).toBe('12.1')
  })

  it('is null where no number stands, and for nothing at all', () => {
    expect(bareParaId('Schlussbestimmungen')).toBeNull()
    expect(bareParaId('')).toBeNull()
    expect(bareParaId(null)).toBeNull()
  })
})

describe('anlageLabelKey', () => {
  it('spells a schedule the way RIS prints it', () => {
    expect(anlageLabelKey('Anlage 2')).toBe('Anl. 2')
    expect(anlageLabelKey('Anhang  3')).toBe('Anl. 3')
    expect(anlageLabelKey('  § 5  ')).toBe('§ 5')
  })
})
