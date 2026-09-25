import { describe, expect, it } from 'vitest'
import { anlageLabelKey, articleNumberKey, bareParaId } from '../server/utils/text/designation'

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

describe('articleNumberKey', () => {
  it('joins the draft\'s roman numeral to the arabic one RIS keys by', () => {
    // The whole point: the draft writes "Artikel II § 3", RIS "Art. 2 § 3".
    expect(articleNumberKey('II')).toBe('2')
    expect(articleNumberKey('IX')).toBe('9')
    expect(articleNumberKey('XIV')).toBe('14')
  })

  it('leaves an arabic numeral alone', () => {
    expect(articleNumberKey('2')).toBe('2')
    expect(articleNumberKey(' 14 ')).toBe('14')
  })

  it('refuses a numeral it cannot read rather than picking an Artikel', () => {
    // Written back and compared, so only the canonical spelling counts.
    expect(articleNumberKey('IIII')).toBeNull()
    expect(articleNumberKey('VX')).toBeNull()
    expect(articleNumberKey('2a')).toBeNull()
    expect(articleNumberKey('')).toBeNull()
    expect(articleNumberKey('0')).toBeNull()
  })
})
