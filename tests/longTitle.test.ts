import { describe, expect, it } from 'vitest'
import { ledeLongTitle } from '../app/utils/longTitle'

describe('ledeLongTitle', () => {
  it('keeps only the abbreviation when the parenthetical is the heading plus one', () => {
    expect(ledeLongTitle(
      'Verordnung des Bundesministers für Finanzen, mit der … erlassen wird (FinanzOnline-Verordnung 2027-Anpassungsverordnung – FOnV 2027-AnpV)',
      'FinanzOnline-Verordnung 2027-Anpassungsverordnung',
    )).toBe('Verordnung des Bundesministers für Finanzen, mit der … erlassen wird (FOnV 2027-AnpV)')
  })

  it('accepts a hyphen for the dash', () => {
    expect(ledeLongTitle('Verordnung über X (Registerforschungsverordnung BMF - RFV BMF)', 'Registerforschungsverordnung BMF'))
      .toBe('Verordnung über X (RFV BMF)')
  })

  it('drops a parenthetical the heading already contains', () => {
    expect(ledeLongTitle('Verordnung über Saisonkontingente (Saisonkontingenteverordnung 2027 und 2028)', 'Saisonkontingenteverordnung 2027 und 2028'))
      .toBe('Verordnung über Saisonkontingente')
    expect(ledeLongTitle('Verordnung, mit der die DGAV geändert wird (Druckgeräteaufstellungsverordnung – DGAV)', 'Änderung der Druckgeräteaufstellungsverordnung – DGAV'))
      .toBe('Verordnung, mit der die DGAV geändert wird')
  })

  it('keeps a parenthetical that names the act differently', () => {
    const long = 'Verordnung, mit der die Zulassungsstellenverordnung geändert wird (17. Novelle zur ZustV)'
    expect(ledeLongTitle(long, '17. Novelle zur Zulassungsstellenverordnung')).toBe(long)
    const amsprv = 'Verordnung, mit der die Arbeitsmarktsprengelverordnung geändert wird (AMSprV)'
    expect(ledeLongTitle(amsprv, 'Änderung der Arbeitsmarktsprengelverordnung')).toBe(amsprv)
  })

  it('is null when nothing beyond the heading is left', () => {
    expect(ledeLongTitle('(Aushubverordnung)', 'Aushubverordnung')).toBeNull()
    expect(ledeLongTitle(null, 'Aushubverordnung')).toBeNull()
  })

  it('leaves a long title without a parenthetical alone', () => {
    expect(ledeLongTitle('Verordnung über die Ausbildung', 'Ausbildungsordnung')).toBe('Verordnung über die Ausbildung')
  })
})
