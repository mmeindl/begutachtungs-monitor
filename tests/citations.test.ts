import { describe, expect, it } from 'vitest'
import { beilageOfUrl, bgblEliUrl, bgblShortDe, blgNrDe, citeLineDe, draftCitationDe, erlRvPassageDe, latestAmendmentOf, lawCiteDe, rvCitationDe } from '../shared/utils/citations'

describe('citations', () => {
  it('cites a draft as Parliament does, a Vorlage as a footnote does', () => {
    expect(draftCitationDe('115/ME', 'XXVIII')).toBe('Ministerialentwurf 115/ME XXVIII. GP')
    expect(rvCitationDe('525 d.B.', 'XXVIII')).toBe('RV 525 BlgNR 28. GP')
  })

  it('shortens the BGBl number from either upstream form', () => {
    expect(bgblShortDe('Bundesgesetzblatt I Nr. 69/2026')).toBe('BGBl. I Nr. 69/2026')
    expect(bgblShortDe('BGBl. II Nr. 410/2024')).toBe('BGBl. II Nr. 410/2024')
    expect(bgblShortDe('dRGBl. S. 219/1897')).toBeNull()
  })

  it('builds the ELI address, and none before the authentic BGBl', () => {
    expect(bgblEliUrl('Bundesgesetzblatt I Nr. 69/2026')).toBe('https://www.ris.bka.gv.at/eli/bgbl/I/2026/69')
    expect(bgblEliUrl('BGBl. II Nr. 410/2024')).toBe('https://www.ris.bka.gv.at/eli/bgbl/II/2024/410')
    expect(bgblEliUrl('BGBl. I Nr. 12/1999')).toBeNull()
  })

  it('joins only the parts that exist', () => {
    expect(citeLineDe('Erläuterungen', 'Ministerialentwurf 115/ME XXVIII. GP', 'https://x')).toBe(
      'Erläuterungen, Ministerialentwurf 115/ME XXVIII. GP, https://x',
    )
    expect(citeLineDe('BGBl. I Nr. 69/2026', null, ' https://x ')).toBe('BGBl. I Nr. 69/2026, https://x')
  })
})

describe('latestAmendmentOf — the „idF" of a law citation', () => {
  it('takes the newest Novelle across the § versions, by year and then number', () => {
    expect(latestAmendmentOf([
      'BGBl. I Nr. 120/2002 zuletzt geändert durch BGBl. I Nr. 50/2024 ',
      'BGBl. I Nr. 120/2002 zuletzt geändert durch BGBl. I Nr. 177/2023',
      'BGBl. I Nr. 120/2002 zuletzt geändert durch BGBl. I Nr. 9/2024',
      'BGBl. I Nr. 120/2002',
      null,
    ])).toBe('BGBl. I Nr. 50/2024')
  })

  // Bundesvergabegesetz Verteidigung und Sicherheit 2012 (22.10.2026): II Nr.
  // 20/2026 (10.02.) won over I Nr. 8/2026 (27.02.) because 20 > 8.
  it('never compares numbers across Teile: two Teile in the newest year give no „idF"', () => {
    expect(latestAmendmentOf([
      'BGBl. I Nr. 10/2012 zuletzt geändert durch BGBl. I Nr. 8/2026 ',
      'BGBl. I Nr. 10/2012 zuletzt geändert durch BGBl. II Nr. 20/2026 ',
    ])).toBeNull()
    // The year still decides across Teile, and one Teil in the newest year is read by number.
    expect(latestAmendmentOf([
      'BGBl. I Nr. 10/2012 zuletzt geändert durch BGBl. II Nr. 200/2025',
      'BGBl. I Nr. 10/2012 zuletzt geändert durch BGBl. I Nr. 8/2026',
      'BGBl. I Nr. 10/2012 zuletzt geändert durch BGBl. I Nr. 3/2026',
    ])).toBe('BGBl. I Nr. 8/2026')
  })

  it('reads the pre-1997 form without a Teil, and says nothing for a law never amended', () => {
    expect(latestAmendmentOf(['BGBl. Nr. 340/1993 zuletzt geändert durch BGBl. Nr. 72/1996'])).toBe('BGBl. Nr. 72/1996')
    expect(latestAmendmentOf(['BGBl. I Nr. 77/2020'])).toBeNull()
  })

  it('cites the law with its Stammnorm and, where there is one, its latest Novelle', () => {
    expect(lawCiteDe('Universitätsgesetz 2002', 'BGBl. I Nr. 120/2002', 'BGBl. I Nr. 50/2024', 'https://x')).toBe(
      'Universitätsgesetz 2002, BGBl. I Nr. 120/2002 idF BGBl. I Nr. 50/2024, https://x',
    )
    expect(lawCiteDe('Privathochschulgesetz', 'BGBl. I Nr. 77/2020', null, 'https://x')).toBe('Privathochschulgesetz, BGBl. I Nr. 77/2020, https://x')
  })
})

describe('BlgNR — the Beilagen as a footnote cites them', () => {
  it('cites Vorlage, Erläuterungen and committee report with the period in Arabic numerals', () => {
    expect(blgNrDe('RV', '525 d.B.', 'XXVIII')).toBe('RV 525 BlgNR 28. GP')
    expect(blgNrDe('ErläutRV', '297 d.B.', 'XXVIII')).toBe('ErläutRV 297 BlgNR 28. GP')
    expect(blgNrDe('AB', '567 d.B.', 'XXVIII')).toBe('AB 567 BlgNR 28. GP')
    expect(blgNrDe('RV', '416/A', 'XXVIII')).toBeNull()
  })

  it('reads the Beilage off a Parliament document address, and nothing else', () => {
    expect(beilageOfUrl('https://www.parlament.gv.at/dokument/XXVIII/I/297/fnameorig_1722543.html')).toEqual({ citation: '297 d.B.', gp: 'XXVIII' })
    expect(beilageOfUrl('https://www.parlament.gv.at/dokument/XXVIII/ME/40/fname_1.pdf')).toBeNull()
  })

  it('names the passage by the Ressort’s own heading', () => {
    expect(erlRvPassageDe('ErläutRV 297 BlgNR 28. GP', 'Zu Z 4 (Art. II § 1 Abs. 5):')).toBe('ErläutRV 297 BlgNR 28. GP, zu Z 4 (Art. II § 1 Abs. 5)')
    expect(erlRvPassageDe('ErläutRV 297 BlgNR 28. GP', '§ 54c')).toBe('ErläutRV 297 BlgNR 28. GP, zu § 54c')
  })

  it('keeps Parliament’s form for a Vorlage it cannot cite as a Beilage', () => {
    expect(rvCitationDe('525 d.B.', 'XXVIII')).toBe('RV 525 BlgNR 28. GP')
  })
})
