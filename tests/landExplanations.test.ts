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

  /** One page of lines, each `[text, bold]` — as `pdfStyledPages` reads them. */
  const styled = (lines: [string, boolean][]): [string[], boolean[][]] => [[lines.map(([t]) => t).join('\n')], [lines.map(([, b]) => b)]]

  it('takes a whole line in bold for a heading where only its weight tells (Wien)', () => {
    const [pages, bold] = styled([
      ['ERLÄUTERUNGEN', true],
      ['Allgemeiner Teil', true],
      ['Ziel und Inhalt der Novelle', true],
      ['Mit der Novelle soll der Magistrat Kosten pauschal verrechnen können.', false],
      ['Die Novelle tritt mit dem der Kundmachung folgenden Tag in Kraft.', true],
      ['Finanzielle Auswirkungen des Regelungsvorhabens auf den Haushalt der', true],
      ['Stadt Wien:', true],
      ['Es entstehen keine Kosten.', false],
      ['Vorbemerkungen zu den §§ 36 bis 44 (Übergangs-', true],
      ['bestimmung):', true],
      ['Die Bestimmungen werden neu gefasst.', false],
      ['Besonderer Teil', true],
      ['Zu Artikel II', true],
      ['Inkrafttreten', true],
      ['Artikel II regelt das Inkrafttreten.', false],
      ['TEXTGEGENÜBERSTELLUNG', true],
      ['Geltende Fassung Vorgeschlagene Fassung', true],
    ])
    const parse = parseLandExplanations(pages, bold)!
    expect(parse.general.map((p) => [p.heading, p.text])).toEqual([
      ['Allgemeiner Teil', []],
      // A bold sentence is emphasis: it stays text.
      ['Ziel und Inhalt der Novelle', ['Mit der Novelle soll der Magistrat Kosten pauschal verrechnen können. Die Novelle tritt mit dem der Kundmachung folgenden Tag in Kraft.']],
      ['Finanzielle Auswirkungen des Regelungsvorhabens auf den Haushalt der Stadt Wien', ['Es entstehen keine Kosten.']],
      ['Vorbemerkungen zu den §§ 36 bis 44 (Übergangsbestimmung)', ['Die Bestimmungen werden neu gefasst.']],
    ])
    // The entry ends where the Textgegenüberstellung begins, in capitals.
    expect(parse.particular.map((e) => [e.heading, e.text])).toEqual([['Zu Artikel II', ['Inkrafttreten', 'Artikel II regelt das Inkrafttreten.']]])
    // Without the weights, the same lines have only their numbered headings.
    expect(parseLandExplanations(pages)!.general.map((p) => p.heading)).toEqual(['Allgemeiner Teil'])
  })
})

describe('the rate note names who changed the reasoning', () => {
  it('says „das Land" on a Land\'s page', async () => {
    const { reasoningRateNote } = await import('../app/utils/reasoningNotes')
    expect(reasoningRateNote({ compared: 13, changed: 4, editorial: 0, uncompared: 0 }, 'das Land')).toBe('4 der 13 Begründungen hat das Land geändert.')
    expect(reasoningRateNote({ compared: 13, changed: 4, editorial: 0, uncompared: 0 })).toBe('4 der 13 Begründungen hat das Ressort geändert.')
  })
})

describe('parseLandExplanations — Burgenland\'s Vorblatt (30.10.2026)', () => {
  const pages = [
    'E n t w u r f\nGesetz vom ……, mit dem das Burgenländische Raumplanungsgesetz 2019 geändert wird\n§ 22h\nBatterie-Energiespeicheranlagen',
    [
      'Vorblatt',
      'Problem:',
      'Der Ausbau der erneuerbaren Energieträger schreitet rasch voran.',
      'Ziel und wesentlicher Inhalt:',
      'Das Hauptziel der Novelle ist eine klare Grundlage.',
      'Auswirkungen auf die verschiedenen Gruppen der Gesellschaft, insbesondere auf Frauen und',
      'Männer:',
      'Keine.',
      'Erläuterungen:',
      'Zur Änderung des Inhaltsverzeichnisses',
      'Das Inhaltsverzeichnis ist anzupassen.',
      'Zu § 22h',
      'Zur Vermeidung von Doppelbesicherungen wird vorgesehen, dass nichts doppelt gesichert wird.',
    ].join('\n'),
  ]

  it('reads the Vorblatt as the general part, a heading that wraps joined', () => {
    const parse = parseLandExplanations(pages, undefined, { vorblatt: true })!
    expect(parse.labelled).toBe(true)
    expect(parse.general.map((g) => g.heading)).toEqual([
      'Vorblatt',
      'Problem',
      'Ziel und wesentlicher Inhalt',
      'Auswirkungen auf die verschiedenen Gruppen der Gesellschaft, insbesondere auf Frauen und Männer',
    ])
  })

  it('opens an entry at „Zur Änderung …", never at prose that begins alike', () => {
    const parse = parseLandExplanations(pages, undefined, { vorblatt: true })!
    expect(parse.particular.map((p) => p.heading)).toEqual(['Zur Änderung des Inhaltsverzeichnisses', 'Zu § 22h'])
    expect(parse.particular[1]!.text.join(' ')).toMatch(/^Zur Vermeidung/)
  })

  it('reads a document without a Vorblatt as any other', () => {
    const without = [pages[0]!, pages[1]!.replace('Vorblatt\n', '')]
    expect(parseLandExplanations(without, undefined, { vorblatt: true })).toEqual(parseLandExplanations(without))
  })
})
