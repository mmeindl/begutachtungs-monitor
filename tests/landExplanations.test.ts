import { describe, expect, it } from 'vitest'
import { headingParas, headingZiffern, parseLandExplanations } from '../server/utils/laender/landExplanations'
import { explainedParagraphs, readLandExplanations } from '../server/utils/laender/landExplanationsRead'
import { draftExplanationsDocument } from '../server/utils/laender/texts/read'
import type { LawUnit } from '../server/utils/lawtext/lawUnits'

describe('a Land\'s Erläuterungen', () => {
  it('names the §§ of a heading, and no Absatz as one', () => {
    expect(headingParas('Zu Art. I Z 2 (§ 1 Abs. 3):')).toEqual(['1'])
    expect(headingParas('Zu Z 2 (§ 2 Abs. 9 bis 11):')).toEqual(['2'])
    expect(headingParas('Zu Z 4 (§§ 4, 5 und 7a):')).toEqual(['4', '5', '7a'])
  })

  it('reads the Ziffern of a heading that names no §', () => {
    expect(headingZiffern('Zu Z 1 und 3:')).toEqual(['1', '3'])
    expect(headingZiffern('Zu den Z 3 bis 5:')).toEqual(['3', '4', '5'])
  })

  // 19.11.2026: „Zu Z 11a" was read as 11 and explained the § Ziffer 11 changes.
  it('keeps a Ziffer\'s letter, and a range takes the lettered Ziffern within it', () => {
    expect(headingZiffern('Zu Z 11a:')).toEqual(['11a'])
    expect(headingZiffern('Zu Z 2, 11a und 12:')).toEqual(['2', '11a', '12'])
    expect(headingZiffern('Zu den Z 3 bis 5:', ['2', '3', '3a', '4', '5', '5a'])).toEqual(['3', '3a', '4', '5'])
    expect(headingZiffern('Zu Z 11a bis 11c:')).toEqual(['11a', '11b', '11c'])
    expect(headingZiffern('Zu Z 10 bis 11a:')).toEqual(['10', '11', '11a'])
  })

  it('files „Zu Z 11a" under the § instruction 11a changes, not the one of 11', () => {
    const unit = (id: string, heading: string): LawUnit => ({ article: null, articleNumber: null, id, heading, quotedHeadings: [], text: '', blocks: [], stammnorm: null })
    const units = [unit('Z11', '§ 7 Abs. 2 lautet:'), unit('Z11a', 'Im § 9 Abs. 1 entfällt der zweite Satz.'), unit('Z12', '§ 10 lautet:')]
    const entry = (heading: string) => ({ article: null, paras: [], heading, text: ['Die Änderung ist redaktionell.'] })
    const parse = { general: [], labelled: true, particular: [entry('Zu Z 11a:'), entry('Zu Z 11 bis 12:')] }
    expect(explainedParagraphs(parse, units, 'Gesetz, mit dem das Salzburger Testgesetz geändert wird').map((e) => e.paras)).toEqual([['9'], ['7', '9', '10']])
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

  it('takes no line of prose for the title „Erläuterungen" (16120)', () => {
    const parse = parseLandExplanations([[
      'A. Allgemeiner Teil',
      'I. Anlass und Inhalt des Gesetzentwurfs',
      'Die Novelle setzt zwei Richtlinien um.',
      'B. Besonderer Teil',
      'Zu Art. III Z 26 (§ 21 Abs. 4):',
      'Zur Zuständigkeit siehe die',
      'Erläuterungen zu § 14 Oö. ADG.',
      'Zu Art. III Z 28 (§ 27 Abs. 2):',
      'Die Schriftlichkeit soll entfallen.',
      'Der Oö. Landtag hat beschlossen:',
    ].join('\n')])!
    expect(parse.labelled).toBe(true)
    expect(parse.general.map((p) => p.heading)).toEqual(['A. Allgemeiner Teil', 'I. Anlass und Inhalt des Gesetzentwurfs'])
    expect(parse.particular.map((e) => e.heading)).toEqual(['Zu Art. III Z 26 (§ 21 Abs. 4):', 'Zu Art. III Z 28 (§ 27 Abs. 2):'])
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

describe('parseLandExplanations — the Landesregierung\'s motion ends a Vorlage\'s Erläuterungen (21.11.2026)', () => {
  it('leaves Salzburg\'s and Oberösterreich\'s motion, and the signature under it, out of the last entry', () => {
    const salzburg = [
      'Erläuterungen\n1. Allgemeines:\nDas Gesetz regelt das Beispiel.\nBesonderer Teil',
      'Zu § 14 (Inkrafttreten):\nDas Gesetz soll mit 28. August 2025 in Kraft treten.\nDie Landesregierung stellt sohin den\nAntrag,\nder Salzburger Landtag wolle beschließen:\n1. Das vorstehende Gesetz wird zum Beschluss erhoben.',
    ]
    expect(parseLandExplanations(salzburg)!.particular.map((e) => e.text)).toEqual([['Das Gesetz soll mit 28. August 2025 in Kraft treten.']])
    const ooe = [
      'Erläuterungen\nI. Allgemeiner Teil\nDas Gesetz regelt das Beispiel.\nII. Besonderer Teil',
      'Zu § 24:\nDie Bescheide bleiben aufrecht.\nDie Oö. Landesregierung beantragt, der Oö. Landtag möge das Landesgesetz über die\nGewährung von Beispielen beschließen.\nLinz, am 28. September 2026\nFür die Oö. Landesregierung:\nLandesrat',
    ]
    expect(parseLandExplanations(ooe)!.particular.map((e) => e.text)).toEqual([['Die Bescheide bleiben aufrecht.']])
  })

  it('keeps a sentence of the Begründung that quotes the Landesregierung, and law text', () => {
    const pages = ['Erläuterungen\n1. Allgemeines:\nDas Gesetz regelt das Beispiel.\nBesonderer Teil\nZu § 4:\n„Die Landesregierung stellt den Gemeinden das Werkzeug zur Verfügung.“\n(4) Die Landesregierung stellt durch Verordnung fest, welche Sportarten anerkannt sind.']
    expect(parseLandExplanations(pages)!.particular[0]!.text.join(' ')).toContain('stellt durch Verordnung fest')
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

describe('the draft\'s own Erläuterungen, never the Vorlage\'s (20.11.2026)', () => {
  // As Kärnten (`kaernten.ts`) and Tirol (`tirol.ts`) list a record: the draft's documents, then the Vorlage's, „Regierungsvorlage, …".
  const doc = (title: string, file: string) => ({ title, url: `https://www.ktn.gv.at/DE/repos/files/${file}.pdf` })
  const draftDocs = [doc('Entwurf', 'entwurf'), doc('Erläuterungen', 'erl'), doc('Textgegenüberstellung', 'tgue')]
  const vorlageDocs = [doc('Regierungsvorlage', 'rv'), doc('Regierungsvorlage, Erläuterungen', 'rv-erl'), doc('Regierungsvorlage, Windkraftanlagen - Erläuterungs- und Umweltbericht samt Anhänge', 'rv-wind')]

  it('takes the draft\'s Erläuterungen, and none where only the Vorlage\'s are listed', () => {
    expect(draftExplanationsDocument([...vorlageDocs, ...draftDocs])?.title).toBe('Erläuterungen')
    expect(draftExplanationsDocument(vorlageDocs)).toBeNull()
    // Burgenland's draft and Erläuterungen in one, Tirol's Verordnungen, Salzburg's own document.
    expect(draftExplanationsDocument([doc('Entwurf und Erläuterungen', 'e')])?.title).toBe('Entwurf und Erläuterungen')
    expect(draftExplanationsDocument([doc('Tiroler Aufzugs- und Hebeanlagenverordnung - Erläuterungen', 'e')])).not.toBeNull()
  })

  it('reads the draft\'s PDF, not the Vorlage\'s Erläuterungen, where the draft has none of its own', async () => {
    const pagesRead: string[] = []
    const pagesOf = async (url: string) => {
      pagesRead.push(url)
      return url.endsWith('/rv-erl.pdf') ? ['Erläuterungen', 'Allgemeiner Teil', 'Die Vorlage regelt das Beispiel.'] : ['Gesetz vom …, mit dem das Kärntner Beispielgesetz geändert wird', '1. § 1 lautet:']
    }
    const read = await readLandExplanations('ktn', { draft: { title: 'Kärntner Beispielgesetz', documents: [doc('Entwurf', 'entwurf'), ...vorlageDocs] } }, async () => new Uint8Array(), pagesOf)
    expect(pagesRead).not.toContain('https://www.ktn.gv.at/DE/repos/files/rv-erl.pdf')
    expect(read.response.document?.url).toBe('https://www.ktn.gv.at/DE/repos/files/entwurf.pdf')
    // „In den Dokumenten des Landes fand der Monitor keine Erläuterungen" until
    // 21.11.2026: true, and loose — the record lists readable ones, the
    // Vorlage's. Said of the draft, and of the list, which proves no absence elsewhere.
    expect(read.response.unavailableReason).toBe('Nicht lesbar: Im Entwurf fand der Monitor keine Erläuterungen, die er lesen kann. Unter den Dokumenten zu diesem Entwurf stehen Erläuterungen nur zur Regierungsvorlage.')
  })

  it('keeps the sentence of the Land\'s documents where no Vorlage\'s are listed', async () => {
    const read = await readLandExplanations('ktn', { draft: { title: 'Kärntner Beispielgesetz', documents: [doc('Entwurf', 'entwurf')] } }, async () => new Uint8Array(), async () => ['Gesetz vom …, mit dem das Kärntner Beispielgesetz geändert wird', '1. § 1 lautet:'])
    expect(read.response.unavailableReason).toBe('Nicht lesbar: In den Dokumenten des Landes fand der Monitor keine Erläuterungen, die er lesen kann.')
  })
})
