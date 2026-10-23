import { describe, expect, it } from 'vitest'
import { headingParas, headingZiffern, parseLandExplanations } from '../server/utils/laender/landExplanations'

describe('a Land\'s Erläuterungen', () => {
  it('names the §§ of a heading, and no Absatz as one', () => {
    expect(headingParas('Zu Art. I Z 2 (§ 1 Abs. 3):')).toEqual(['1'])
    expect(headingParas('Zu Z 2 (§ 2 Abs. 9 bis 11):')).toEqual(['2'])
    expect(headingParas('Zu Z 4 (§§ 4, 5 und 7a):')).toEqual(['4', '5', '7a'])
  })

  it('reads the Ziffern of a heading that names no §', () => {
    expect(headingZiffern('Zu Z 1 und 3:')).toEqual([1, 3])
    expect(headingZiffern('Zu den Z 3 bis 5:')).toEqual([3, 4, 5])
  })

  it('splits the general part from the entries, without the page furniture', () => {
    const page = (n: number, ...lines: string[]) => ['Amt der Landesregierung', ...lines, `Seite ${n}`].join('\n')
    const parse = parseLandExplanations([
      page(1, 'A. Allgemeiner Teil', 'I. Anlass', 'Die Novelle setzt eine Vereinbarung um.', 'B. Besonderer Teil'),
      page(2, 'Zu Art. I Z 2 (§ 1 Abs. 3):', 'Die Anpassung folgt dem Bund.', 'Zu Art. I Z 3 und 4 (§ 3a Abs. 2 Z 1', 'und 2):', 'Ambulante Plätze werden angerechnet.'),
      page(3, 'Der Oö. Landtag hat beschlossen:', 'Artikel I'),
    ])!
    expect(parse.labelled).toBe(true)
    expect(parse.general.map((p) => p.heading)).toEqual(['A. Allgemeiner Teil', 'I. Anlass'])
    expect(parse.particular.map((e) => [e.heading, e.paras, e.text])).toEqual([
      ['Zu Art. I Z 2 (§ 1 Abs. 3):', ['1'], ['Die Anpassung folgt dem Bund.']],
      ['Zu Art. I Z 3 und 4 (§ 3a Abs. 2 Z 1 und 2):', ['3a'], ['Ambulante Plätze werden angerechnet.']],
    ])
  })
})
