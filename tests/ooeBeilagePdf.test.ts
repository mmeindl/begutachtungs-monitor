/** Oberösterreich's Beilage page, as RIS links it for a Landesgesetz. */
import { describe, expect, it } from 'vitest'
import { ooeBeilagePdf } from '../server/utils/laender/oberoesterreich'

const PAGE = 'https://www2.land-oberoesterreich.gv.at/internetltgbeilagen/InternetLtgBeilagenAnzeige.jsp?jahr=2023&nummer=632&gp=XXIX'

describe('ooeBeilagePdf', () => {
  it('reads the Vorlage, not its Textgegenüberstellung', () => {
    const html = "<a href='Beilage 632&#x2f;2023 - Textgegen&uuml;berstellung.pdf?id=19673&n=632&j=2023#page=' target = '_blank'>x</a><a href='Beilage 632&#x2f;2023 - Regierungsvorlage.pdf?id=19672&n=632&j=2023#page=' target = '_blank'>Regierungsvorlage</a>"
    expect(ooeBeilagePdf(html, PAGE, 'vorlage')).toBe('https://www2.land-oberoesterreich.gv.at/internetltgbeilagen/Beilage%20632/2023%20-%20Regierungsvorlage.pdf?id=19672&n=632&j=2023')
    expect(ooeBeilagePdf(html, PAGE, 'antrag')).toBeNull()
  })
  it('reads an Initiativantrag', () => {
    const html = "<a href='Beilage 703&#x2f;2023 - Initiativantrag.pdf?id=19921&n=703&j=2023#page='>Initiativantrag</a>"
    expect(ooeBeilagePdf(html, PAGE, 'antrag')).toMatch(/Beilage%20703\/2023%20-%20Initiativantrag\.pdf\?id=19921/)
  })
})
