import { describe, expect, it } from 'vitest'
import { euActCiteDe, euOjCiteDe, beilageOfUrl, bgblEliUrl, bgblShortDe, blgNrDe, citeLineDe, draftCitationDe, erlRvPassageDe, latestAmendmentOf, lawCiteDe, annexParagraphCiteDe, landTextCiteDe, lawTextCiteDe, lawUnitCiteDe, lgblEliUrl, rvCitationDe } from '../shared/utils/citations'

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

describe('a changed unit of the § comparison, in the document it stands in', () => {
  const draft = { citation: '18/ME', gp: 'XXVIII' }
  const me = { label: 'Ministerialentwurf, Gesetzestext', url: 'https://www.parlament.gv.at/dokument/XXVIII/ME/18/fnameorig_1683900.html' }
  const rv = { label: 'Regierungsvorlage, Gesetzestext', url: 'https://www.parlament.gv.at/dokument/XXVIII/I/129/fnameorig_1693598.html' }
  const ab = { label: 'Ausschussfassung, Gesetzestext', url: 'https://www.parlament.gv.at/dokument/XXVIII/I/151/fnameorig_1696440.html' }
  const plenum = { label: 'Plenarfassung, Gesetzestext', url: 'https://www.parlament.gv.at/dokument/XXVIII/BNR/47/fnameorig_1701617.html' }
  const bgbl = { label: 'Bundesgesetzblatt I Nr. 50/2025 (RIS)', url: 'https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=BgblAuth&Dokumentnummer=BGBLA_2025_I_50' }

  it('cites each version by its document, the Kundmachung at its ELI', () => {
    expect(lawTextCiteDe('me', me, draft)).toEqual({ cited: 'Ministerialentwurf 18/ME XXVIII. GP', url: me.url })
    expect(lawTextCiteDe('rv', rv, draft)).toEqual({ cited: 'RV 129 BlgNR 28. GP', url: rv.url })
    expect(lawTextCiteDe('ausschuss', ab, draft, rv)).toEqual({ cited: 'AB 151 BlgNR 28. GP', url: ab.url })
    expect(lawTextCiteDe('bgbl', bgbl, draft)).toEqual({ cited: 'BGBl. I Nr. 50/2025', url: 'https://www.ris.bka.gv.at/eli/bgbl/I/2025/50' })
  })

  it('cites nothing it cannot name: the Plenarfassung, a missing document, a committee text at the Vorlage’s address', () => {
    expect(lawTextCiteDe('plenum', plenum, draft)).toBeNull()
    expect(lawTextCiteDe('rv', null, draft)).toBeNull()
    expect(lawTextCiteDe('rv', plenum, draft)).toBeNull()
    expect(lawTextCiteDe('ausschuss', { ...ab, url: rv.url }, draft, rv)).toBeNull()
    expect(lawTextCiteDe('bgbl', { label: 'Bundesgesetzblatt (RIS)', url: bgbl.url }, draft)).toBeNull()
  })

  it('names the unit after the document: Artikel and Ziffer, or the Paragraph', () => {
    expect(lawUnitCiteDe('RV 129 BlgNR 28. GP', 'Z1', '106', true)).toBe('RV 129 BlgNR 28. GP, Art. 106 Z 1')
    expect(lawUnitCiteDe('Ministerialentwurf 18/ME XXVIII. GP', '§5a', null, false)).toBe('Ministerialentwurf 18/ME XXVIII. GP, § 5a')
    expect(lawUnitCiteDe('BGBl. I Nr. 50/2025', 'Z12', null, false)).toBe('BGBl. I Nr. 50/2025, Z 12')
  })

  it('refuses a designation that would not find the unit', () => {
    expect(lawUnitCiteDe('RV 129 BlgNR 28. GP', 'Z18#dup', '1', true)).toBeNull()
    expect(lawUnitCiteDe('RV 129 BlgNR 28. GP', 'Z1', null, true)).toBeNull()
    expect(lawUnitCiteDe('RV 129 BlgNR 28. GP', 'Anlage 1', null, false)).toBeNull()
  })
})

describe('a unit of a Land’s comparison, and a § of a Textgegenüberstellung', () => {
  const citeAs = 'Gesetzesentwurf „Landesgesetz, mit dem das Oö. Feuerwehrgesetz 2015 geändert wird (Oö. Feuerwehrgesetz-Novelle 2024)“ (Land Oberösterreich)'
  const pdf = 'https://www2.land-oberoesterreich.gv.at/internetltgbeilagen/x.pdf'

  it('cites each of a Land’s texts in the record’s own words', () => {
    expect(landTextCiteDe('entwurf', { label: 'Begutachtungsentwurf', url: pdf }, citeAs)).toEqual({ cited: citeAs, url: pdf })
    expect(landTextCiteDe('rv', { label: 'Regierungsvorlage, Beilage 898/2024', url: pdf }, citeAs)?.cited).toBe('Regierungsvorlage, Beilage 898/2024')
    expect(landTextCiteDe('rv', { label: 'Regierungsvorlage, Nr 148 der Beilagen (6. Session der 16. GP)', url: pdf }, citeAs)?.cited).toBe('Regierungsvorlage, Nr 148 der Beilagen (6. Session der 16. GP)')
    expect(landTextCiteDe('ausschuss', { label: 'Ausschussbericht Beilage 951/2024', url: pdf }, citeAs)?.cited).toBe('Ausschussbericht Beilage 951/2024')
    expect(landTextCiteDe('lgbl', { label: 'LGBl. Nr. 95/2024', url: 'https://www.ris.bka.gv.at/eli/lgbl/OB/2024/95' }, citeAs)?.cited).toBe('LGBl. Nr. 95/2024')
    expect(landTextCiteDe('geltend', { label: 'Textgegenüberstellung', url: pdf }, citeAs)?.cited).toBe(`Textgegenüberstellung zu ${citeAs}`)
  })

  it('cites no Land text without a number to cite it by, an address, or the draft’s citation', () => {
    expect(landTextCiteDe('rv', { label: 'Regierungsvorlage, GZ 135/2026', url: pdf }, citeAs)).toBeNull()
    // An Initiativantrag only by a number that names one Beilage.
    expect(landTextCiteDe('antrag', { label: 'Initiativantrag, Beilage 703/2023', url: pdf }, citeAs)?.cited).toBe('Initiativantrag, Beilage 703/2023')
    expect(landTextCiteDe('antrag', { label: 'Initiativantrag, Nr 547 der Beilagen (4. Session der 17. GP)', url: pdf }, citeAs)?.cited).toBe('Initiativantrag, Nr 547 der Beilagen (4. Session der 17. GP)')
    expect(landTextCiteDe('antrag', { label: 'Initiativantrag, Nr. 547', url: pdf }, citeAs)).toBeNull()
    expect(landTextCiteDe('lgbl', { label: 'LGBl. Nr. 95/2024', url: null }, citeAs)).toBeNull()
    expect(landTextCiteDe('entwurf', { label: 'Begutachtungsentwurf', url: pdf }, '')).toBeNull()
    expect(landTextCiteDe('geltend', { label: 'Oö. Landesrecht, Fassung vom 09.02.2024 (Abgleich)', url: null }, citeAs)).toBeNull()
  })

  it('writes the Artikel as the document prints it where its title says so', () => {
    expect(lawUnitCiteDe('Regierungsvorlage, Beilage 898/2024', 'Z1', '1', true, 'Artikel I')).toBe('Regierungsvorlage, Beilage 898/2024, Art. I Z 1')
    expect(lawUnitCiteDe('RV 129 BlgNR 28. GP', 'Z1', '106', true, 'Änderung des Arbeits- und Sozialgerichtsgesetzes')).toBe('RV 129 BlgNR 28. GP, Art. 106 Z 1')
    expect(lawUnitCiteDe('X', 'Z1', '2', true, 'Artikel I')).toBe('X, Art. 2 Z 1')
  })

  it('cites a § of an annex, with its law where the annex has several', () => {
    expect(annexParagraphCiteDe('Ministerialentwurf 18/ME XXVIII. GP', '§ 29.', 'Artikel 1 Änderung des Arbeits- und Sozialgerichtsgesetzes', { severalLaws: true })).toBe(
      'Textgegenüberstellung zu Ministerialentwurf 18/ME XXVIII. GP, Artikel 1 Änderung des Arbeits- und Sozialgerichtsgesetzes, § 29',
    )
    expect(annexParagraphCiteDe('Ministerialentwurf 115/ME XXVIII. GP', '§ 207s.', null, { severalLaws: false })).toBe('Textgegenüberstellung zu Ministerialentwurf 115/ME XXVIII. GP, § 207s')
  })

  it('cites no § of an annex it could not be found by', () => {
    expect(annexParagraphCiteDe('Ministerialentwurf 18/ME XXVIII. GP', '§ 29.', null, { severalLaws: true })).toBeNull()
    expect(annexParagraphCiteDe('Ministerialentwurf 18/ME XXVIII. GP', '§ 5.', null, { severalLaws: false, repeated: true })).toBeNull()
    expect(annexParagraphCiteDe('Ministerialentwurf 18/ME XXVIII. GP', 'Anlage 1', null, { severalLaws: false })).toBeNull()
    expect(annexParagraphCiteDe('', '§ 5.', null, { severalLaws: false })).toBeNull()
  })
})

describe('lgblEliUrl — a Landesgesetzblatt in RIS', () => {
  it('builds the address from RIS’s Land code and the number', () => {
    expect(lgblEliUrl('OB', 'LGBl. Nr. 45/2026')).toBe('https://www.ris.bka.gv.at/eli/lgbl/OB/2026/45')
    expect(lgblEliUrl('OB', 'kein Blatt')).toBeNull()
  })
})

describe('EU acts — the Amtsblatt reference and the footnote', () => {
  it('cites a numbered issue with its page, and an act published on its own by its own number', () => {
    expect(euOjCiteDe({ form: 'issue', series: 'L', issue: '333', date: '2022-12-27', page: 80 })).toBe('ABl. L 333 vom 27.12.2022, S. 80')
    expect(euOjCiteDe({ form: 'issue', series: 'L', issue: '373', date: '2004-12-21', page: null })).toBe('ABl. L 373 vom 21.12.2004')
    expect(euOjCiteDe({ form: 'act', series: 'L', act: '2023/2413', date: '2023-10-31' })).toBe('ABl. L, 2023/2413, 31.10.2023')
  })

  it('copies the title without the EEA note, the reference and the ELI; label and EUR-Lex where the Cellar gave none', () => {
    const act = {
      label: 'Richtlinie (EU) 2022/2555',
      title: 'Richtlinie (EU) 2022/2555 des Europäischen Parlaments und des Rates vom 14. Dezember 2022 über Maßnahmen für ein hohes gemeinsames Cybersicherheitsniveau in der Union (NIS-2-Richtlinie) (Text von Bedeutung für den EWR)',
      eurLexUrl: 'https://eur-lex.europa.eu/eli/dir/2022/2555/oj/deu',
    }
    expect(euActCiteDe(act, { form: 'issue', series: 'L', issue: '333', date: '2022-12-27', page: 80 }, 'http://data.europa.eu/eli/dir/2022/2555/oj'))
      .toBe('Richtlinie (EU) 2022/2555 des Europäischen Parlaments und des Rates vom 14. Dezember 2022 über Maßnahmen für ein hohes gemeinsames Cybersicherheitsniveau in der Union (NIS-2-Richtlinie), ABl. L 333 vom 27.12.2022, S. 80, http://data.europa.eu/eli/dir/2022/2555/oj')
    expect(euActCiteDe({ ...act, title: null }, null, null)).toBe('Richtlinie (EU) 2022/2555, https://eur-lex.europa.eu/eli/dir/2022/2555/oj/deu')
  })
})
