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

  it('reads „Zu Art 2 Z 1" as an entry, and keeps a „Zu …" row of the general part in it', () => {
    const parse = parseLandExplanations([[
      'Erläuterungen',
      '1. Allgemeines:',
      'Die Novelle ändert zwei Gesetze.',
      '2. Kosten:',
      'Zu Z 4:',
      'Die Kosten betragen 2 Mio €.',
      '3. Ergebnisse des Begutachtungsverfahrens:',
      'Die Stellungnahmen wurden berücksichtigt.',
      '4. Zu den einzelnen Bestimmungen:',
      'Zu Art 1 Z 1 (§ 6 Abs 4):',
      'Die Bestimmung wird klarer.',
      'Zu Art 2 Z 1 (§ 3):',
      'Die Bestimmung entfällt.',
    ].join('\n')])!
    expect(parse.general.map((p) => p.heading)).toEqual(['1. Allgemeines', '2. Kosten', '3. Ergebnisse des Begutachtungsverfahrens'])
    expect(parse.particular.map((e) => [e.heading, e.article, e.paras])).toEqual([
      ['Zu Art 1 Z 1 (§ 6 Abs 4):', '1', ['6']],
      ['Zu Art 2 Z 1 (§ 3):', '2', ['3']],
    ])
  })

  it('joins a heading that wraps mid-phrase, and does not take a numbered sentence for one', () => {
    const parse = parseLandExplanations([[
      'Erläuterungen',
      '1. Allgemeines:',
      'Die Novelle passt das Gesetz an.',
      'VI. Auswirkungen auf die verschiedenen Gruppen der Gesellschaft, insbesondere auf',
      'Frauen und Männer',
      'Die Regelungen betreffen alle gleich.',
      '2. Das konkrete Ausmaß der den Gemeinden zukommenden Ertragsanteile an der',
      'Landschaftsabgabe hängt vom allfälligen Aufkommen ab und lässt sich nicht beziffern.',
    ].join('\n')])!
    expect(parse.general.map((p) => p.heading)).toEqual(['1. Allgemeines', 'VI. Auswirkungen auf die verschiedenen Gruppen der Gesellschaft, insbesondere auf Frauen und Männer'])
    expect(parse.general[1]!.text).toEqual([
      'Die Regelungen betreffen alle gleich.',
      '2. Das konkrete Ausmaß der den Gemeinden zukommenden Ertragsanteile an der Landschaftsabgabe hängt vom allfälligen Aufkommen ab und lässt sich nicht beziffern.',
    ])
  })
})

describe('the rate note names who changed the reasoning', () => {
  it('says „das Land" on a Land\'s page', async () => {
    const { reasoningRateNote } = await import('../app/utils/reasoningNotes')
    expect(reasoningRateNote({ compared: 13, changed: 4, editorial: 0, uncompared: 0 }, 'das Land')).toBe('4 der 13 Begründungen hat das Land geändert.')
    expect(reasoningRateNote({ compared: 13, changed: 4, editorial: 0, uncompared: 0 })).toBe('4 der 13 Begründungen hat das Ressort geändert.')
  })
})
