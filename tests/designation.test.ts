import { describe, expect, it } from 'vitest'
import { anlageLabelKey, articleKeysNamed, articleNumberKey, bareParaId, leadingArticleKey } from '../server/utils/text/designation'

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

describe('leadingArticleKey', () => {
  it('reads the Artikel a heading opens with, roman or arabic', () => {
    expect(leadingArticleKey('Artikel 3')).toBe('3')
    expect(leadingArticleKey('Zu Art. II (Änderung des Weingesetzes)')).toBe('2')
    expect(leadingArticleKey('Zu Art. 2 Z 1 (§ 7)')).toBe('2')
  })

  it('refuses what it cannot read, and a heading that opens with no Artikel', () => {
    expect(leadingArticleKey('Zu Art. 2a (…)')).toBeNull()
    expect(leadingArticleKey('Zu Z 4 (§ 54c Abs. 1a):')).toBeNull()
    expect(leadingArticleKey(null)).toBeNull()
  })
})

describe('articleKeysNamed', () => {
  it('names every Artikel of a heading, once', () => {
    expect(articleKeysNamed('Zu Art. 1 Z 5 sowie zu Art. 13 Z 1 bis 3 (§ 6 und § 7 KfzStG)')).toEqual(['1', '13'])
    expect(articleKeysNamed('Zu Z 3 (§ 5):')).toEqual([])
  })

  it('does not read the letters inside a word as an Artikel', () => {
    expect(articleKeysNamed('Zu Z 2 (§ 3 Startart 5)')).toEqual([])
  })
})
