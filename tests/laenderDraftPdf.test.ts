import { describe, expect, it } from 'vitest'
import { lawBlocksFromPdfPages } from '../server/utils/laender/draftPdfLaw'
import { diffLandDraft, landDraftUnits, lgblUnits, packageChanges } from '../server/utils/laender/landLawDiff'
import { draftByContent, draftCandidates, draftDocument, draftSource, notADraft, repairMacRoman } from '../server/utils/laender/texts/read'

/* Pages as the PDF's text layer gives them: one string per page, a line per
   printed line, „Seite n" on top. The texts are built for the rules, each
   after a real draft. */
const page = (...lines: string[]) => lines.join('\n')
const ids = (pages: string[]) => landDraftUnits(pages)!.map((u) => `${(u.articleNumber ?? '').split(' ').slice(0, 2).join(' ')} ${u.id}`)

describe('lawBlocksFromPdfPages — a Land draft from its PDF', () => {
  it('starts at the enacting clause, past the explanations in front', () => {
    const pages = [
      page('Begutachtungsentwurf', 'A. Allgemeiner Teil', '1. Anlass: die Richtlinie wird umgesetzt.'),
      page('Seite 2', 'Landesgesetz, mit dem das Oö. X-Gesetz geändert wird', 'Der Oö. Landtag hat beschlossen:', 'Artikel I',
        'Das Oö. X-Gesetz, LGBl. Nr. 1/2020, wird wie folgt geändert:', '1. § 2 lautet:', '„§ 2', '(1) Text.“'),
    ]
    expect(ids(pages)).toEqual(['Artikel I Z1'])
  })

  it('reads the Artikel title as part of its heading, and never the clause of an untitled one', () => {
    const titled = lawBlocksFromPdfPages([page('Der Oö. Landtag hat beschlossen:', 'Artikel I', 'Änderung des Oö. X-Gesetzes', 'Das Oö. X-Gesetz wird wie folgt geändert:', '1. § 1 entfällt.')])!
    expect(titled.find((b) => b.kind === 'article')!.text).toBe('Artikel I Änderung des Oö. X-Gesetzes')
    const untitled = lawBlocksFromPdfPages([page('Der Oö. Landtag hat beschlossen:', 'Artikel I', 'Das Oö. Sozialberufegesetz (Oö. SBG), LGBl. Nr. 63/2008, in der Fassung des Landesgesetzes', 'LGBl. Nr. 49/2017, wird wie folgt geändert:', '1. § 1 entfällt.')])!
    expect(untitled.find((b) => b.kind === 'article')!.text).toBe('Artikel I')
  })

  it('keeps a quoted list’s numbers in the payload', () => {
    const pages = [page('Der Oö. Landtag hat beschlossen:', 'Artikel I', 'Das Oö. X-Gesetz wird wie folgt geändert:',
      '1. § 3 lautet:', '„§ 3', '(1) Zu bestellen sind', '1. die Leiterin,', '2. die Stellvertreterin.“', '2. § 4 entfällt.')]
    expect(ids(pages)).toEqual(['Artikel I Z1', 'Artikel I Z2'])
  })

  it('survives a quote opened twice: the next number saying what it does (16120)', () => {
    const pages = [page('Der Oö. Landtag hat beschlossen:', 'Artikel I', 'Das Oö. X-Gesetz wird wie folgt geändert:',
      '1. § 4 erhält folgende Überschrift: „§ 4 „Auswahlverfahren“', '2. Im § 5 wird das Wort „a“ durch „b“ ersetzt.', '3. § 6 entfällt.')]
    expect(ids(pages)).toEqual(['Artikel I Z1', 'Artikel I Z2', 'Artikel I Z3'])
  })

  it('opens an instruction where the PDF dropped the space after its number (16120)', () => {
    const pages = [page('Der Oö. Landtag hat beschlossen:', 'Artikel II', 'Das Oö. Y-Gesetz wird wie folgt geändert:',
      '1. Die §§ 6 und 7 entfallen.', '2.Im § 8 wird das Wort „x“ gestrichen.')]
    expect(ids(pages)).toEqual(['Artikel II Z1', 'Artikel II Z2'])
  })

  it('takes no numbered table row of the payload for an instruction: the sequence must go on', () => {
    const pages = [page('Der Salzburger Landtag hat beschlossen:', 'Artikel I', 'Die Verordnung wird geändert wie folgt:',
      '1. In der Anlage lautet die Tabelle:', 'Modellfunktion Anforderung', '46. Operationstechnische Assistenz 1 hoch', '47. Operationstechnische Assistenz 2 mittel',
      '2. § 4 entfällt.', '3. § 5 entfällt.')]
    expect(ids(pages)).toEqual(['Artikel I Z1', 'Artikel I Z2', 'Artikel I Z3'])
  })

  it('keeps an instruction wrapped where its next line opens with a cited § or a date: the line above runs on (16118, 16120, Tirol 730; 21.11.2026)', () => {
    const blocks = lawBlocksFromPdfPages([page('Der Oö. Landtag hat beschlossen:', 'Artikel I', 'Das Oö. X-Gesetz wird wie folgt geändert:',
      '1. Im § 2 Abs. 1, § 27 Abs. 3 Z 5, Abs. 4 und Abs. 7 Z 1,', '§ 29 Abs. 4 und § 31 Abs. 1 wird jeweils das Wort „Beeinträchtigungen“ durch das Wort „Behinderungen“ ersetzt.',
      '2. Im § 8 wird die Wortfolge „auf Grund des Geschlechts“ durch die Wortfolge „aus einem der im', '§ 3 Abs. 1 genannten Gründe“ ersetzt.',
      '3. Im § 42a Abs. 1 wird die Wortfolge „für den Zeitraum vom 1. September des Vorjahres bis zum', '31. August des aktuellen Jahres“ durch die Wortfolge „für das laufende Kalenderjahr“ ersetzt.',
      '4. § 5 lautet:', '„§ 5', '(1) Die Behörde entscheidet nach', '§ 3 Abs. 2.“')])!
    expect(blocks.filter((b) => b.kind !== 'article').map((b) => `${b.kind} ${b.text.slice(0, 12)}`)).toEqual([
      'ziff Der Oö. Land', 'ziff Das Oö. X-Ge', 'novao 1. Im § 2 Ab', 'novao 2. Im § 8 wi', 'novao 3. Im § 42a ', 'novao 4. § 5 laute', 'ziff „§ 5', 'ziff (1) Die Behö',
    ])
    expect(blocks.find((b) => b.text.startsWith('3.'))!.text).toContain('bis zum 31. August des aktuellen Jahres“ durch')
  })

  it('counts instructions on from a first one numbered „0." (Salzburg 35591; 21.11.2026)', () => {
    const blocks = lawBlocksFromPdfPages([page('Der Salzburger Landtag hat beschlossen:', 'Das Salzburger Grundversorgungsgesetz wird wie folgt geändert:',
      '0. Im § 2 Abs 1 lautet die Z 2:', '„2. Personen mit besonderen Bedürfnissen,“', '1. Im § 4 werden folgende Änderungen vorgenommen:', '1.1. Die Z 1 lautet:', '„1. Fremde: Menschen;“', '2. § 5 entfällt.')])!
    expect(blocks.filter((b) => b.kind === 'novao').map((b) => b.text.slice(0, 2))).toEqual(['0.', '1.', '2.'])
  })

  it('still opens a numbered item after a line ending in „und" or a comma: a list goes on', () => {
    const blocks = lawBlocksFromPdfPages([page('Der Oö. Landtag hat beschlossen:', 'Artikel I', 'Das Oö. X-Gesetz wird wie folgt geändert:',
      '1. § 3 lautet:', '„§ 3', '(1) Zu bestellen sind', '1. die Leiterin,', '2. die Stellvertreterin und', '3. der Kassier.“')])!
    expect(blocks.filter((b) => /^\d\. d/.test(b.text)).map((b) => b.text)).toEqual(['1. die Leiterin,', '2. die Stellvertreterin und', '3. der Kassier.“'])
  })

  it('takes a single unnumbered instruction under the clause as the first (16039)', () => {
    const pages = [page('Der Oö. Landtag hat beschlossen:', 'Artikel I', 'Das Oö. Feuerwehrgesetz 2015 wird wie folgt geändert:',
      '§ 6 Abs. 1 letzter Satz lautet:', '„Die Kosten trägt die Gemeinde.“', 'Artikel II', 'Inkrafttreten', 'Dieses Landesgesetz tritt in Kraft.')]
    expect(ids(pages)).toEqual(['Artikel I Z1'])
  })

  it('leaves out a quoted division heading and table-of-contents entries, as the RIS parser does', () => {
    const blocks = lawBlocksFromPdfPages([page('Der Oö. Landtag hat beschlossen:', 'Artikel I', 'Das Oö. X-Gesetz wird wie folgt geändert:',
      '1. Im Inhaltsverzeichnis werden folgende Einträge eingefügt:', '„4. HAUPTSTÜCK FRÜHE FÖRDERUNG', '§ 50a Ziel', '§ 50b Leistungen der', 'Förderung“',
      '2. Nach § 7 wird folgender 4a. Abschnitt eingefügt:', '„4a. Abschnitt', 'Gleichbehandlungs-', 'stelle', '§ 7a', '(1) Text.“')])!
    const text = blocks.map((b) => b.text).join(' | ')
    expect(text).not.toMatch(/HAUPTSTÜCK|§ 50a|Förderung“|Abschnitt Gleich/)
    expect(text).toContain('§ 7a')
    // And the quote the dropped lines closed is closed: instruction 2 opened.
    expect(blocks.filter((b) => b.kind === 'novao')).toHaveLength(2)
  })

  it('takes a line opening with „lit." for text, not for a Roman division heading (ooe-2025-16101 § 12 Abs. 1, 12.11.2026)', () => {
    const blocks = lawBlocksFromPdfPages([page('Der Oö. Landtag hat beschlossen:', 'Artikel I', 'Das Oö. Sozialhilfe-Ausführungsgesetz wird wie folgt geändert:',
      '1. § 12 Abs. 1 lautet:', '„(1) Voraussetzung für die Leistung der Sozialhilfe ist insbesondere',
      'b) die aktive Arbeitssuche durch Bewerbungen von sich aus unabhängig von den Pflichten nach',
      'lit. a,',
      'c) die Bereitschaft, die für die Vermittelbarkeit am österreichischen Arbeitsmarkt erforderlichen',
      'Sprachkenntnisse zu erwerben,',
      'd) die Teilnahme an Maßnahmen der Hilfe zur Arbeit gemäß § 18 Abs. 1 Oö. SHG 1998 sowie',
      'e) die Inanspruchnahme einer Begleitung.“',
      '2. § 13 entfällt.')])!
    const text = blocks.map((b) => b.text).join(' | ')
    expect(text).toContain('nach lit. a, c) die Bereitschaft')
    expect(text).toContain('e) die Inanspruchnahme einer Begleitung.“')
    expect(blocks.filter((b) => b.kind === 'novao')).toHaveLength(2)
  })

  it('keeps a wrapped cross-reference and a table row that open with a Roman numeral (Stmk. Baugesetz § 97, Salzburg 34402)', () => {
    const blocks = lawBlocksFromPdfPages([page('Der Landtag hat beschlossen:', 'Artikel I', 'Das X-Gesetz wird wie folgt geändert:',
      '1. § 97 lautet:', '„§ 97', 'Für Gebäude hat die Behörde Erleichterungen gegenüber den Vorschriften des',
      'I. Teiles dieses Hauptstückes zuzulassen, wenn die Einhaltung dieser Vorschriften unter Berücksichtigung',
      'der Eigenart des Gebäudes entbehrlich ist.“',
      '2. Die Anlage lautet:', '„Gehaltsstufe Verwendungsgruppe D C B A', 'I. Dienstklasse', '1 2.221,40 2.287,90 - -', 'II. Dienstklasse', '1 2.370,60 2.490,40 2.490,40 -“')])!
    const text = blocks.map((b) => b.text).join(' | ')
    expect(text).toContain('des I. Teiles dieses Hauptstückes zuzulassen')
    expect(text).toContain('der Eigenart des Gebäudes entbehrlich ist.“')
    expect(text).toContain('I. Dienstklasse 1 2.221,40 2.287,90 - - II. Dienstklasse 1 2.370,60')
  })

  it('still leaves out a Roman division heading and its title: „IVa. Umsetzungshinweis, …", „VIIa. ABSCHNITT", „V. ABSCHNITT"', () => {
    // Salzburg's Benützungsgebührengesetz-Novelle, as its PDF prints it.
    const salzburg = lawBlocksFromPdfPages([page('Der Salzburger Landtag hat beschlossen:', 'Artikel I', 'Das Benützungsgebührengesetz wird geändert wie folgt:',
      '1. Der IVa. Abschnitt lautet:', '„IVa. Umsetzungshinweis, Verweisungen auf Unionsrecht, Verweisungen auf Bundesrecht',
      'Umsetzungshinweis, Verweisungen auf Unionsrecht', '§ 14c', '(1) Durch dieses Gesetz wird die Richtlinie umgesetzt.“', '2. § 15 entfällt.')])!
    const text = salzburg.map((b) => b.text).join(' | ')
    expect(text).not.toMatch(/IVa\. Umsetzungshinweis|\| Umsetzungshinweis, Verweisungen/)
    expect(text).toContain('§ 14c')
    expect(salzburg.filter((b) => b.kind === 'novao')).toHaveLength(2)
    for (const heading of ['„VIIa. ABSCHNITT', '„V. ABSCHNITT']) {
      const blocks = lawBlocksFromPdfPages([page('Der Landtag hat beschlossen:', 'Artikel I', 'Das X-Gesetz wird wie folgt geändert:',
        '1. Nach § 40 wird eingefügt:', heading, 'Sonderbestimmungen', '§ 41', '(1) Text.“')])!
      expect(blocks.map((b) => b.text).join(' | ')).not.toMatch(/ABSCHNITT|Sonderbestimmungen/)
    }
  })

  it('keeps a cross-reference to a division wrapped onto its own line: running text goes on in lower case (Tirol 2026-135 §§ 7, 86, 15.11.2026)', () => {
    const passed = lawBlocksFromPdfPages([page('Der Landtag hat beschlossen:', '§ 7', 'Ausschreibung',
      '(1) Die Ausschreibung darf keine Anmerkungen enthalten, die auf ein bestimmtes Geschlecht schließen lassen. Soweit jedoch Förderungsmaßnahmen nach dem',
      '4. Unterabschnitt geboten sind, ist in der Ausschreibung darauf hinzuweisen. Weiters sind in der',
      'Ausschreibung für höhere Verwendungen und Funktionen Frauen zur Bewerbung besonders zu ermuntern.',
      '(2) Text.')])!
    const text = passed.map((b) => b.text).join(' ')
    expect(text).toContain('nach dem 4. Unterabschnitt geboten sind, ist in der Ausschreibung darauf hinzuweisen.')
    expect(text).toContain('Frauen zur Bewerbung besonders zu ermuntern.')
    const vorlage = lawBlocksFromPdfPages([page('Der Landtag hat beschlossen:', '§ 86', 'Datenverarbeitung',
      '(1) Die Gemeinden dürfen folgende Daten verarbeiten, sofern diese Daten für die Erfüllung der ihnen nach dem',
      '2. Hauptstück dieses Gesetzes obliegenden Aufgaben jeweils erforderlich sind: Identifikationsdaten,',
      'Erreichbarkeitsdaten, Daten über Aus- und Weiterbildung.',
      '(2) Text.')])!
    expect(vorlage.map((b) => b.text).join(' ')).toContain('nach dem 2. Hauptstück dieses Gesetzes obliegenden Aufgaben jeweils erforderlich sind: Identifikationsdaten, Erreichbarkeitsdaten, Daten über Aus- und Weiterbildung.')
  })

  it('still leaves out a division heading — bare, titled, quoted, in capitals, without a space — and its title lines', () => {
    for (const heading of ['4. Abschnitt', '1. Abschnitt Dienstrecht und Organisationsrecht', '„2. Teil Gesundheitsbereich', 'V. ABSCHNITT', '2. ABSCHNITT 2. ABSCHNITT', '6.Abschnitt', '3. Hauptstück']) {
      const blocks = lawBlocksFromPdfPages([page('Der Landtag hat beschlossen:', '§ 1', 'Ziel', 'Dieses Gesetz regelt die Gleichbehandlung.',
        heading, 'Sonderbestimmungen', '§ 2', 'Geltung', '(1) Text.')])!
      const text = blocks.map((b) => b.text).join(' | ')
      expect(text, heading).not.toMatch(/Abschnitt|ABSCHNITT|Teil|Hauptstück|Sonderbestimmungen/)
      expect(text, heading).toContain('(1) Text.')
    }
  })

  it('ends the law at a Vorblatt after it, as at the Erläuterungen (Burgenland 85a6a5d5, 15.11.2026)', () => {
    for (const heading of ['Vorblatt', 'Vorblatt und Erläuterungen zur Änderung des Steiermärkischen X-Gesetzes']) {
      const blocks = lawBlocksFromPdfPages([page('Auf Grund des § 22e Bgld. RPG 2019 wird verordnet:',
        'Die Verordnung, LGBl. Nr. 47/2023, wird wie folgt geändert:', '1. § 1 lautet:', '„§ 1 Allgemeines',
        '(1) Die Abgabe beträgt 3 000 Euro.“', '2. § 2 entfällt.'),
      page(heading, 'Problem:', 'Die Abgabe betrifft die überörtliche Raumplanung.', 'Ziel:', 'Eine Bemessungsgrundlage.')])!
      const text = blocks.map((b) => b.text).join(' | ')
      expect(text, heading).toContain('2. § 2 entfällt.')
      expect(text, heading).not.toMatch(/Vorblatt|Problem|Raumplanung|Ziel/)
    }
  })

  it('reads on past the word „Vorblatt" in the law\'s own sentences', () => {
    const blocks = lawBlocksFromPdfPages([page('Der Landtag hat beschlossen:', '§ 1', 'Kosten',
      '(1) Die Kosten sind wie im', 'Vorblatt zu beziffern; siehe Vorblatt.', '(2) Text.', '§ 2', 'Inkrafttreten', 'Dieses Gesetz tritt in Kraft.')])!
    const text = blocks.map((b) => b.text).join(' | ')
    expect(text).toContain('(1) Die Kosten sind wie im Vorblatt zu beziffern; siehe Vorblatt.')
    expect(text).toContain('Dieses Gesetz tritt in Kraft.')
  })

  it('reads the law past a Vorblatt in front of it', () => {
    const blocks = lawBlocksFromPdfPages([page('Vorblatt', 'Problem:', 'Die Abgabe betrifft die Raumplanung.'),
      page('Der Landtag hat beschlossen:', '§ 1', 'Ziel', 'Dieses Gesetz regelt die Abgabe.', '§ 2', 'Inkrafttreten', 'Dieses Gesetz tritt in Kraft.')])!
    const text = blocks.map((b) => b.text).join(' | ')
    expect(text).toContain('Dieses Gesetz regelt die Abgabe.')
    expect(text).toContain('Dieses Gesetz tritt in Kraft.')
    expect(text).not.toMatch(/Vorblatt|Problem/)
  })

  it('joins a word split at the line end, and keeps a compound and a suspended part', () => {
    const blocks = lawBlocksFromPdfPages([page('Der Oö. Landtag hat beschlossen:', 'Artikel I', 'Das Oö. X-Gesetz wird wie folgt geändert:',
      '1. Im § 1 wird die Gleich-', 'behandlung im Oö. Agrarrecht-', 'Organisationsgesetz für die Land-', 'und Forstwirtschaft geregelt.')])!
    expect(blocks.at(-1)!.text).toBe('1. Im § 1 wird die Gleichbehandlung im Oö. Agrarrecht-Organisationsgesetz für die Land- und Forstwirtschaft geregelt.')
  })

  it('keeps a table value printed on a line of its own, and drops a bare number only at a page\'s edge (Salzburg 34234 § 130, 19.11.2026)', () => {
    const pages = [
      page('3', 'Der Salzburger Landtag hat beschlossen:', '§ 130', 'Zulagen', '(1) Die Zulage beträgt in Prozent:', 'Stufe A', '100', 'Stufe B', '60', 'Stufe C', '35', '4'),
      page('5', '(2) Text.'),
    ]
    const text = lawBlocksFromPdfPages(pages)!.map((b) => b.text).join(' | ')
    expect(text).toContain('Stufe A 100 Stufe B 60 Stufe C 35')
    expect(text).not.toMatch(/35 4|\| 5|^3 /)
    // Between two PDFs a changed cell is a change, not two values dropped alike.
    const other = [page(...pages[0]!.split('\n').map((l) => (l === '60' ? '80' : l))), pages[1]!]
    expect(diffLandDraft(landDraftUnits(pages)!, landDraftUnits(other)!).map((u) => u.change)).toEqual(['changed'])
  })

  it('drops Salzburg\'s running head wrapped onto two lines, and on a network path (33547; a 2024 draft)', () => {
    const law = (...head: string[]) => lawBlocksFromPdfPages([page('Der Salzburger Landtag hat beschlossen:', '§ 1', 'Höchstsätze', '(1) Der Tagsatz beträgt 35,82 Euro.', ...head, '(2) Das Format .docx ist zulässig.')])!.map((b) => b.text).join(' | ')
    expect(law('Q:\\2003\\GESETZ-BEARBEITEN-AKTUELL\\L-Tarifobergrenzen-Verordnung für', '2026.docx \\ 27.11.2025 07:29:00')).not.toMatch(/GESETZ-BEARBEITEN|27\.11\.2025/)
    expect(law('\\\\land-sbg\\daten\\Desktop\\A-Volksbefragungsgesetz Nov 24.docx \\ 08.05.2024 09:34:00')).not.toMatch(/land-sbg|Volksbefragungsgesetz/)
    expect(law()).toContain('(2) Das Format .docx ist zulässig.')
  })

  it('drops Kärnten\'s session stamp at a page\'s head, from the Artikel\'s title and from an instruction (ktn-104907-2025-32, Vorlage pages 1–2 and 4–5, 20.11.2026)', () => {
    const vorlage = (stamp: string[]) => [
      page(...stamp, '1 von 20', 'Regierungsvorlage', 'Gesetz vom ………….…….., mit dem die Kärntner Landesverfassung,', 'Der Landtag von Kärnten hat beschlossen:', 'Artikel II', 'Änderung des Kärntner Dienstrechtsgesetzes 1994'),
      page(...stamp, '2 von 20', 'Das Kärntner Dienstrechtsgesetz 1994 – K-DRG 1994, LGBl. Nr. 71, zuletzt in der Fassung des',
        'Gesetzes LGBl. Nr. 43/2026, wird wie folgt geändert:', '1. In § 4 Abs. 1 wird jeweils das Zitat „§ 3 Abs. 2“ durch das Zitat', '„§ 3 Abs. 4“ ersetzt.',
        '2. In § 5 Abs. 2 wird der letzte Satz durch folgende Bestimmungen ersetzt:', '„§ 10f Abs. 1 bis 5 gelten sinngemäß.“'),
      page(...stamp, '3 von 20', '3. § 5 Abs. 4 lautet:', '„(4) § 10g Abs. 1 und 2, Abs. 3 letzter Satz, Abs. 4 bis 7 sowie § 10h gelten sinngemäß.“'),
    ]
    const units = landDraftUnits(vorlage(['REG.SITZG.']))!
    expect(units.map((u) => `${u.article} ${u.id} ${u.text}`).join(' | ')).not.toMatch(/SITZG/)
    expect(units).toEqual(landDraftUnits(vorlage([]))!)
    // The other two spellings the cached Vorlagen print.
    for (const stamp of ['REG.SITZG', 'REG-SITZG.']) expect(landDraftUnits(vorlage([stamp]))).toEqual(units)
    // Only at the head: the same line inside a page is not furniture by its place.
    const inside = lawBlocksFromPdfPages([page('Gesetz vom ………….…….., mit dem die Kärntner Landesverfassung,', 'Der Landtag von Kärnten hat beschlossen:', 'Artikel I', 'Das Gesetz wird wie folgt geändert:', '1. § 1 lautet:', 'REG.SITZG.', '„§ 1 Text.“')])!
    expect(inside.map((b) => b.text).join(' ')).toContain('REG.SITZG.')
  })

  it('says null where no enacting clause marks a legal text', () => {
    expect(lawBlocksFromPdfPages([page('Erläuterungen', 'Allgemeiner Teil')])).toBeNull()
  })

  it('reads a new law § by §, past a contents list that prints its §§ the same way (16053)', () => {
    const units = landDraftUnits([page('Landesgesetz über die Jagd', 'Der Oö. Landtag hat beschlossen:', 'INHALTSVERZEICHNIS',
      '§ 1', 'Ziel', '§ 2', 'Begriffe', '§ 1', 'Ziel', 'Dieses Landesgesetz regelt die Jagd.', '§ 2', 'Begriffe',
      '(1) Im Sinn dieses Landesgesetzes', 'bedeutet Wild: …')])!
    expect(units.map((u) => [u.id, u.heading, u.text])).toEqual([
      ['§1', 'Ziel', 'Dieses Landesgesetz regelt die Jagd.'],
      ['§2', 'Begriffe', '(1) Im Sinn dieses Landesgesetzes bedeutet Wild: …'],
    ])
    expect(units[0]!.article).toBe('Landesgesetz über die Jagd')
  })

  it('reads a § cited at a line\'s end and wrapped onto its own line as the sentence\'s end, not a § (Salzburg 34234 § 81, 19.11.2026)', () => {
    const lines = (...cut: string[]) => [page('Gesetz vom …… über das Dienstrecht', 'Der Salzburger Landtag hat beschlossen:', 'Dienstbeginn', '§ 81',
      '(1) Das Dienstverhältnis beginnt mit der erstmaligen Ernennung durch die Landesregierung.', ...cut,
      '(3) Im Ernennungsbescheid sind die Modellstelle und die Planstelle anzuführen.', 'Abweichungen', '§ 82', '(1) Für Beamtinnen gilt Abweichendes.')]
    const wrapped = landDraftUnits(lines('(2) Die Erfordernisse für die erstmalige Ernennung entsprechen den Aufnahmevoraussetzungen gemäß', '§ 8.'))!
    const whole = landDraftUnits(lines('(2) Die Erfordernisse für die erstmalige Ernennung entsprechen den Aufnahmevoraussetzungen gemäß § 8.'))!
    expect(wrapped.map((u) => u.id)).toEqual(['§81', '§82'])
    expect(wrapped.map((u) => u.text)).toEqual(whole.map((u) => u.text))
    expect(diffLandDraft(wrapped, whole).map((u) => `${u.id} ${u.change}`)).toEqual(['§81 unchanged', '§82 unchanged'])
    // A § title above its „§ 1" ends in a noun: still a §.
    expect(landDraftUnits([page('Der Salzburger Landtag hat beschlossen:', 'Ziel', '§ 1', 'Dieses Gesetz regelt das Dienstrecht.', 'Begriffsbestimmungen', '§ 2', '(1) Text.')])!.map((u) => u.id)).toEqual(['§1', '§2'])
  })
})

describe('diffLandDraft — the draft against the Landesgesetzblatt', () => {
  /* The Landesgesetzblatt's RIS XML as it sets one Novelle: the Artikel as
     `art`, the clause, instructions as `novao1`, the opening quote of a
     quoted § in an element of its own. */
  const xml = (...instructions: string[]) => `<?xml version="1.0" encoding="utf-8"?><risdok xmlns="http://www.bka.gv.at"><nutzdaten><abschnitt>
    <absatz typ="promkleinlsatz">Der Oö. Landtag hat beschlossen:</absatz>
    <ueberschrift typ="art" halign="c">Artikel I<br />Änderung des Oö. X-Gesetzes</ueberschrift>
    <absatz typ="promkleinlsatz">Das Oö. X-Gesetz, LGBl. Nr. 1/2020, wird wie folgt geändert:</absatz>
    ${instructions.map((i) => `<absatz typ="novao1">${i}</absatz>`).join('')}
  </abschnitt></nutzdaten></risdok>`

  const draft = [page('Der Oö. Landtag hat beschlossen:', 'Artikel I', 'Änderung des Oö. X-Gesetzes', 'Das Oö. X-Gesetz, LGBl. Nr. 1/2020, wird wie folgt geändert:',
    '1. Im § 2 wird das Wort „zugleich Vorsitzende“ durch das Wort „Leiterin“ ersetzt.', '2. § 4 entfällt.', '3. Im § 5 wird das Wort „Median-', 'Entgelthöhe“ eingefügt.')]

  it('reports what changed, and nothing for a quote or a split compound', () => {
    const units = diffLandDraft(landDraftUnits(draft)!, lgblUnits(xml(
      '1. Im § 2 wird das Wort "zugleich Vorsitzende" durch das Wort "Leiterin" ersetzt.',
      '2. § 4 lautet: "§ 4 (1) Neu."',
      '3. Im § 5 wird das Wort "Median- Entgelthöhe" eingefügt.',
    )))
    // „§ 4 entfällt" against „§ 4 lautet: …": the same place, now one
    // changed instruction (the address pass).
    expect(units.map((u) => [u.id, u.change])).toEqual([['Z1', 'unchanged'], ['Z2', 'changed'], ['Z3', 'unchanged']])
  })

  it('pairs „Artikel 1" of the PDF with „Artikel I" of the Landesgesetzblatt (Salzburg 32923)', () => {
    const arabic = landDraftUnits([page('Der Oö. Landtag hat beschlossen:', 'Artikel 1', 'Änderung des Oö. X-Gesetzes', 'Das Oö. X-Gesetz, LGBl. Nr. 1/2020, wird wie folgt geändert:',
      '1. Im § 2 wird das Wort „zugleich Vorsitzende“ durch das Wort „Leiterin“ ersetzt.', '2. § 4 entfällt.')])!
    const units = diffLandDraft(arabic, lgblUnits(xml('1. Im § 2 wird das Wort "zugleich Vorsitzende" durch das Wort "Leiterin" ersetzt.', '2. § 4 entfällt.')))
    expect(units.map((u) => [u.id, u.change])).toEqual([['Z1', 'unchanged'], ['Z2', 'unchanged']])
  })

  it('pairs a draft of one law with the Artikel of the package that holds it word for word (Salzburg 33388)', () => {
    const single = landDraftUnits([page('Gesetz vom ........, mit dem das Oö. X-Gesetz geändert wird', 'Der Oö. Landtag hat beschlossen:',
      'Das Oö. X-Gesetz, LGBl. Nr. 1/2020, wird wie folgt geändert:', '1. Im § 2 wird das Wort „zugleich Vorsitzende“ durch das Wort „Leiterin“ ersetzt.', '2. § 4 entfällt.')])!
    const kundmachung = lgblUnits(xml('1. Im § 2 wird das Wort "zugleich Vorsitzende" durch das Wort "Leiterin" ersetzt.', '2. § 4 entfällt.').replace('</abschnitt>',
      '<ueberschrift typ="art">Artikel II<br />Änderung des Oö. Y-Gesetzes</ueberschrift><absatz typ="promkleinlsatz">Das Oö. Y-Gesetz wird wie folgt geändert:</absatz><absatz typ="novao1">1. § 9 entfällt.</absatz></abschnitt>'))
    const units = diffLandDraft(single, kundmachung)
    expect(units.filter((u) => u.change === 'unchanged').map((u) => u.id)).toEqual(['Z1', 'Z2'])
    expect(packageChanges(single, kundmachung)).toEqual({ added: ['Artikel II Änderung des Oö. Y-Gesetzes'], dropped: [] })
  })

  // Kärnten 67907-2025-9, Steiermark's Wohnunterstützungsgesetz (21.11.2026):
  // the Landtag's name stands inside the clause, which went unread, and the
  // reader started at the title instead — so the law went unnamed.
  it('starts at Kärnten\'s and Steiermark\'s enacting clause, and names the law by its title above it', () => {
    for (const clause of ['Der Landtag von Kärnten hat beschlossen:', 'Der Landtag Steiermark hat beschlossen:']) {
      const units = landDraftUnits([page('Begutachtungsentwurf', 'Gesetz vom ………, mit dem das X-Gesetz geändert wird', clause,
        'Das X-Gesetz, LGBl. Nr. 1/2020, wird wie folgt geändert:', '1. § 20 Abs. 3 entfällt.')])!
      expect(units.map((u) => [u.article, u.id])).toEqual([['Gesetz vom ………, mit dem das X-Gesetz geändert wird', 'Z1']])
    }
  })

  // Salzburg 33358 (19.11.2026): no „Artikel I" in the draft, and its new
  // texts differ from the Kundmachung in what the Kundmachung fills in. By
  // whole text they matched none, and stood as removed and inserted.
  it('pairs an unnamed Artikel by its instruction lines where the quoted texts differ in what the Kundmachung fills in', () => {
    const draftUnits = landDraftUnits([page('Verordnung der Landesregierung vom ……, mit der die X-Verordnung und die Y-Verordnung geändert werden', 'wird verordnet:',
      'Die X-Verordnung, LGBl Nr 1/2020, wird geändert wie folgt:', '1. Im § 2 wird die Zeile „Wolf 1.1. – 31.12.“ angefügt.', '2. Im § 3 wird angefügt:', '„(10) § 2 in der Fassung LGBl Nr …/2025 tritt in Kraft.“',
      'Artikel II', 'Die Y-Verordnung, LGBl Nr 2/2020, wird geändert wie folgt:', 'Im § 6 wird angefügt:', '„(22) Neu.“')])!
    const kundmachung = lgblUnits(xml('1. Im § 2 wird die Zeile "Wolf 1.1. - 31.12." angefügt.', '2. Im § 3 wird angefügt: "(10) § 2 in der Fassung LGBl Nr 126/2025 tritt in Kraft."').replace('</abschnitt>',
      '<ueberschrift typ="g1">Artikel II</ueberschrift><absatz typ="promkleinlsatz">Die Y-Verordnung, LGBl Nr 2/2020, wird geändert wie folgt:</absatz><absatz typ="novao1">Im § 6 wird angefügt: "(22) Neu."</absatz></abschnitt>'))
    const units = diffLandDraft(draftUnits, kundmachung)
    expect(units.filter((u) => u.change === 'inserted' || u.change === 'removed')).toEqual([])
    expect(units.map((u) => u.id)).toEqual(['Z1', 'Z2', 'Z1'])
  })

  it('reads a § whose one sentence was taken for its title, and stops at the Erläuterungen (Salzburg 33878)', () => {
    const units = landDraftUnits([page('Gesetz vom ........, mit dem das X-Gesetz 1998 aufgehoben wird', 'Der Salzburger Landtag hat beschlossen:',
      '§ 1', 'Das X-Gesetz 1998, LGBl Nr 47, wird mit Wirkung ab 1. Jänner 2027', 'aufgehoben.',
      '§ 2', 'Bis zum 31. Dezember 2026 gewährte Befrei-', 'ungen bleiben unberührt.'), page('Erläuterungen', '1. Allgemeines', 'Die Befreiung entfällt.')])!
    expect(units.map((u) => [u.id, u.text])).toEqual([
      ['§1', 'Das X-Gesetz 1998, LGBl Nr 47, wird mit Wirkung ab 1. Jänner 2027 aufgehoben.'],
      ['§2', 'Bis zum 31. Dezember 2026 gewährte Befreiungen bleiben unberührt.'],
    ])
  })

  it('does not name an Artikel after its „(Verfassungsbestimmung)" (LGBl. Nr. 76/2025)', () => {
    const units = lgblUnits('<abschnitt><ueberschrift typ="g1">Artikel 1</ueberschrift><ueberschrift typ="para">(Verfassungsbestimmung)</ueberschrift>' +
      '<absatz typ="promkleinlsatz">Das L-VG wird geändert wie folgt:</absatz><absatz typ="novao1">1. Art 28 entfällt.</absatz>' +
      '<ueberschrift typ="g1">Artikel 4</ueberschrift><ueberschrift typ="para">(Verfassungsbestimmung)</ueberschrift>' +
      '<absatz typ="promkleinlsatz">Das Stadtrecht wird geändert wie folgt:</absatz><absatz typ="novao1">1. § 4 entfällt.</absatz></abschnitt>')
    expect([...new Set(units.map((u) => u.article))]).toEqual(['Artikel 1', 'Artikel 4'])
  })

  it('pairs the Artikel by title, and names a law the Landtag added', () => {
    const kundmachung = lgblUnits(xml('1. Im § 2 wird das Wort "zugleich Vorsitzende" durch das Wort "Leiterin" ersetzt.').replace('</abschnitt>',
      '<ueberschrift typ="art">Artikel II<br />Änderung des Oö. Y-Gesetzes</ueberschrift><absatz typ="promkleinlsatz">Das Oö. Y-Gesetz wird wie folgt geändert:</absatz><absatz typ="novao1">1. § 9 entfällt.</absatz></abschnitt>'))
    expect(packageChanges(landDraftUnits(draft)!, kundmachung).added).toEqual(['Artikel II Änderung des Oö. Y-Gesetzes'])
  })

  it('joins Salzburg\'s sub-instructions of any depth and form to their instruction, on the Landesgesetzblatt\'s side as on the PDF\'s (32075, 19.11.2026)', () => {
    const lines = ['1. Im § 2 wird das Wort „alt“ durch das Wort „neu“ ersetzt.', '2. Im § 18 werden folgende Änderungen vorgenommen:', '2.1. Im Abs 1 werden geändert:',
      '2.1.1. In der Z 6 wird nach dem Wort „bereitstellt“ die Wortfolge „oder verwendet“ eingefügt.', '2.1a. Im Abs 2 wird die Z 16a angefügt.', '2.2 Abs 3 entfällt.',
      '3. Im § 77c werden folgende Änderungen vorgenommen:', '3.1.Nach Abs 1 wird eingefügt: „(1a) Text.“', '4. § 4 entfällt.']
    const lgbl = `<?xml version="1.0" encoding="utf-8"?><risdok xmlns="http://www.bka.gv.at"><nutzdaten><abschnitt>
      <absatz typ="promkleinlsatz">Der Salzburger Landtag hat beschlossen:</absatz>
      <ueberschrift typ="art" halign="c">Artikel I<br />Änderung des Salzburger X-Gesetzes</ueberschrift>
      <absatz typ="promkleinlsatz">Das Salzburger X-Gesetz, LGBl Nr 1/2020, wird geändert wie folgt:</absatz>
      ${lines.map((l) => `<absatz typ="${/^\d+\.\s/.test(l) ? 'novao1' : 'novao2'}">${l}</absatz>`).join('')}</abschnitt></nutzdaten></risdok>`
    const pdf = [page('Der Salzburger Landtag hat beschlossen:', 'Artikel I', 'Änderung des Salzburger X-Gesetzes', 'Das Salzburger X-Gesetz, LGBl Nr 1/2020, wird geändert wie folgt:', ...lines)]
    const kundmachung = lgblUnits(lgbl)
    expect(kundmachung.map((u) => u.id)).toEqual(['Z1', 'Z2', 'Z3', 'Z4'])
    // The instruction's own line stays, also where it is short.
    expect(kundmachung[2]!.text).toMatch(/^Im § 77c werden folgende Änderungen vorgenommen: 3\.1\.Nach Abs 1/)
    expect(diffLandDraft(landDraftUnits(pdf)!, kundmachung).map((u) => `${u.id} ${u.change}`)).toEqual(['Z1 unchanged', 'Z2 unchanged', 'Z3 unchanged', 'Z4 unchanged'])
  })

  it('keeps an instruction whose address opens with an ordinal division its own: „2. 3.Teil Z 16 lautet:" is no sub-instruction of 1 (review, 19.11.2026)', () => {
    const lgbl = `<risdok><nutzdaten><abschnitt><absatz typ="promkleinlsatz">Das Salzburger X-Gesetz, LGBl Nr 1/2020, wird geändert wie folgt:</absatz>
      <absatz typ="novao1">1. Im § 2 wird das Wort „alt“ durch das Wort „neu“ ersetzt.</absatz><absatz typ="novao1">2. 3.Teil Z 16 lautet:</absatz>
      <absatz typ="abs">„16. die Behörde;“</absatz><absatz typ="novao1">3. 2. Abschnitt entfällt.</absatz><absatz typ="novao1">4. § 4 entfällt.</absatz></abschnitt></nutzdaten></risdok>`
    expect(lgblUnits(lgbl).map((u) => u.id)).toEqual(['Z1', 'Z2', 'Z3', 'Z4'])
    const pdf = [page('Der Salzburger Landtag hat beschlossen:', 'Artikel I', 'Änderung des Salzburger X-Gesetzes', 'Das Salzburger X-Gesetz, LGBl Nr 1/2020, wird geändert wie folgt:',
      '1. Im § 2 wird das Wort „alt“ durch das Wort „neu“ ersetzt.', '2. 3.Teil Z 16 lautet:', '„16. die Behörde;“', '3. 2. Abschnitt entfällt.', '4. § 4 entfällt.')]
    expect(landDraftUnits(pdf)!.map((u) => u.id)).toEqual(['Z1', 'Z2', 'Z3', 'Z4'])
  })

  it('splits a package at Salzburg\'s Artikel, typed `g1`, so a new law in Artikel I keeps its §§', () => {
    // LGBl. Nr. 95/2022: unsplit, the instructions of Artikel II made the
    // whole document a Novelle, and the 73 §§ of the new law read as two units.
    const units = lgblUnits('<abschnitt><ueberschrift typ="g1">Artikel I</ueberschrift><ueberschrift typ="para">§ 1</ueberschrift><absatz typ="abs">(1) Erstens.</absatz>' +
      '<ueberschrift typ="para">§ 2</ueberschrift><absatz typ="abs">(1) Zweitens.</absatz>' +
      '<ueberschrift typ="g1">Artikel II</ueberschrift><absatz typ="promkleinlsatz">Das Y-Gesetz wird wie folgt geändert:</absatz><absatz typ="novao1">1. § 9 entfällt.</absatz></abschnitt>')
    expect(units.map((u) => u.id)).toEqual(['§1', '§2', 'Z1'])
  })

  it('pairs a reworded instruction at the same place as changed, and not two places of one §', () => {
    const draftAt = (...instructions: string[]) => landDraftUnits([page('Der Oö. Landtag hat beschlossen:', 'Artikel I', 'Änderung des Oö. X-Gesetzes',
      'Das Oö. X-Gesetz, LGBl. Nr. 1/2020, wird wie folgt geändert:', ...instructions)])!
    // 16101: the same Z 3a, worded anew.
    const same = diffLandDraft(
      draftAt('1. Im § 1 Abs. 2 wird folgende Z 3a eingefügt:', '„3a. Eltern dazu befähigen, ihren Kindern die bestmöglichen Chancen im Leben zu ermöglichen;“'),
      lgblUnits(xml('1. Im § 1 Abs. 2 wird nach Z 3 folgende Z 3a eingefügt: "3a. Eltern darin unterstützen, ihren Kindern die bestmöglichen Chancen für die Entwicklung zu ermöglichen;"')),
    )
    expect(same.map((u) => u.change)).toEqual(['changed'])
    // Too different for the engine's own pairing, close enough for the
    // address pass: paired at the same place, kept apart at Z 1 and Z 2.
    const before = '„1. die Gemeinde, in der der Hund überwiegend gehalten wird, sofern die Halterin dort wohnt;“'
    const after = 'die Bezirksverwaltungsbehörde, in deren Sprengel der Hund gehalten wird, sofern keine Gemeinde zuständig ist;"'
    const at = (z: string) => diffLandDraft(draftAt('1. § 22 Abs. 5 Z 1 lautet:', before), lgblUnits(xml(`1. § 22 Abs. 5 Z ${z} lautet: "${z}. ${after}`)))
    expect(at('1').map((u) => u.change)).toEqual(['changed'])
    expect(at('2').map((u) => u.change).sort()).toEqual(['inserted', 'removed'])
  })
})

describe('what the Land files as the draft (26.10.2026)', () => {
  const read = (...pages: string[]) => notADraft({ units: landDraftUnits(pages), text: pages.join('\n') })
  const DRAFT = ['Der Oö. Landtag hat beschlossen:', 'Artikel I', 'Das Oö. X-Gesetz, LGBl. Nr. 1/2020, wird wie folgt geändert:', '1. § 2 lautet:', '„§ 2', '(1) Text.“']

  // Salzburg 23088 files the Gemeindeverband's Stellungnahme as its „Entwurf".
  it('is none where it reads as a letter and prints no law text', () => {
    expect(read(page('Betrifft: Zahl: Datum:', 'Stellungnahme zu Do. Zl. 20031-VERF/107/192-2020', 'Sehr geehrte Damen und Herren!',
      'Bezugnehmend auf die oben bezeichneten Gesetzesentwürfe wird festgehalten, dass die genannten Änderungen positiv gesehen werden.', 'Mit freundlichen Grüßen'))).toBe(true)
  })

  // 18099 and 18140 file their Textgegenüberstellung so.
  it('is none where it opens as a Textgegenüberstellung', () => {
    expect(read(page('1 von 11', 'Textgegenüberstellung – Haushaltsrechts- und Verwaltungsabgabenreformgesetz 2018', 'Geltende Fassung Vorgeschlagene Fassung', '§ 5 Alter Text. § 5 Neuer Text.'))).toBe(true)
  })

  it('is one where it prints law text the reader does not divide, or sends a draft out with a letter', () => {
    expect(read(page('E n t w u r f', 'Gesetz vom …, mit dem das Gebrauchsabgabegesetz erlassen wird', '§ 1 Die Abgabe beträgt fünf Euro.'))).toBe(false)
    expect(read(page('Sehr geehrte Damen und Herren!', 'Wir ersuchen um Stellungnahme zum folgenden Entwurf.', 'Mit freundlichen Grüßen'), page(...DRAFT))).toBe(false)
    // A scan without a text layer says nothing either way.
    expect(read('')).toBe(false)
  })
})

describe('draftDocument', () => {
  // Kärnten v1065 and v1369: the letter that sends the Verordnung out stood in for it.
  it('passes over the Land\'s letter that sends the draft out', () => {
    expect(draftDocument([{ title: 'Anschreiben', url: 'a' }, { title: 'Verordnung', url: 'b' }, { title: 'Erläuterungen', url: 'c' }])?.title).toBe('Verordnung')
    expect(draftDocument([{ title: 'Begutachtung - Akt', url: 'a' }, { title: 'Begutachtung VOText', url: 'b' }])?.title).toBe('Begutachtung VOText')
  })
})

describe('draftByContent — the draft among several, by what it holds (14.11.2026)', () => {
  // Tirol t-v8bd158450… (Sillian, 19.10.2026): the covering letter carries
  // the draft's name, the Verordnung an abbreviation. The texts as the PDFs
  // give them, the letter shortened and the signature left out.
  const LETTER = page('Geschäftszahl – beim Antworten bitte angeben', 'RoBau-2-728/9/69-2026', 'Innsbruck, 19.10.2026',
    'Entwurf einer Verordnung der Landesregierung, mit der eine längere Frist für die zweite Fortschreibung des örtlichen Raumordnungskonzeptes der Marktgemeinde Sillian festgelegt wird; Begutachtung',
    'Sehr geehrte Damen und Herren!', 'Es wird ersucht, zum angeschlossenen Entwurf bis 16. November 2026 eine Stellungnahme abzugeben.', 'Mit freundlichen Grüßen')
  const VERORDNUNG = page('E n t w u r f', 'Verordnung der Landesregierung vom ………………, mit der eine längere Frist für die',
    'zweite Fortschreibung des örtlichen Raumordnungskonzeptes der Marktgemeinde Sillian', 'festgelegt wird',
    'Aufgrund des § 31d Abs. 1 des Tiroler Raumordnungsgesetzes 2022, LGBl. Nr. 43/2022, zuletzt', 'geändert durch das Gesetz LGBl. Nr. 51/2026, wird verordnet:',
    '§ 1', 'Fortschreibung, Fristen', '(1) Die Frist für die zweite Fortschreibung des örtlichen Raumordnungskonzeptes der Marktgemeinde', 'Sillian wird mit 13 Jahren festgelegt.',
    '§ 2', 'Inkrafttreten', 'Diese Verordnung tritt mit dem Ablauf des Tages der Kundmachung in Kraft.')
  const EB = page('1 von 2', 'Erläuternde Bemerkungen', 'zum Entwurf einer Verordnung der Landesregierung, mit der eine längere Frist für die zweite Fortschreibung festgelegt wird', 'Zu § 1:', 'Die Frist wird verlängert.')
  const docs = [
    { title: 'Entwurf einer Verordnung der Landesregierung, mit der eine längere Frist für die zweite Fortschreibung des örtlichen Raumordnungskonzeptes der Marktgemeinde Sillian festgelegt wird; Begutachtung', url: 'https://dokumente.tirol.gv.at/get/brief' },
    { title: 'FS ÖRK FV Sillian VO Begutachtung', url: 'https://dokumente.tirol.gv.at/get/vo' },
    { title: 'FS ÖRK FV Sillian EB Begutachtung', url: 'https://dokumente.tirol.gv.at/get/eb' },
  ]
  const texts: Record<string, string> = { brief: LETTER, vo: VERORDNUNG, eb: EB }
  const asked: string[] = []
  const pagesOf = async (url: string) => {
    asked.push(url)
    return [texts[url.split('/').at(-1)!]!]
  }

  it('takes the document with law text in it, not the letter titled as the draft', async () => {
    expect((await draftByContent(docs, pagesOf))?.doc.title).toBe('FS ÖRK FV Sillian VO Begutachtung')
    const read = await draftSource(docs, 'Land Tirol', pagesOf)!.read()
    expect(read.units?.map((u) => u.id)).toEqual(['§1', '§2'])
    expect(read.document?.label).toBe('FS ÖRK FV Sillian VO Begutachtung')
  })

  it('reads no further than the first with law text, and keeps the first where none holds any', async () => {
    asked.length = 0
    await draftByContent([docs[1]!, docs[0]!], pagesOf)
    expect(asked).toEqual(['https://dokumente.tirol.gv.at/get/vo'])
    expect((await draftByContent([docs[0]!, docs[2]!], pagesOf))?.doc.title).toBe(docs[0]!.title)
  })

  it('fails where a candidate it has to read fails — a document not read is not one without law text', async () => {
    const failing = async (url: string) => (url.endsWith('/vo') ? Promise.reject(new Error('503')) : pagesOf(url))
    await expect(draftByContent(docs, failing)).rejects.toThrow('503')
  })
})

// Tirol 2026-576 (20.11.2026): the Entwurf's text layer is Mac Roman, too
// short for the repair, and read no unit; the choice went on to „Leicht
// Lesen" and then to the „Regierungsvorlage" listed in the same record —
// Entwurf → Regierungsvorlage would have held the Vorlage against itself.
// Kärnten lists its Vorlage in the draft's record the same way.
describe('the draft is never read from another station\'s document', () => {
  const ENTWURF_576 = '1 von 1\nVD-1590/1/33-2026 Fassung vom 24. August 2026\nE n t w u r f\nGesetz vom …………, mit dem der Tiroler Landeswohnbaufonds aufgelˆst und das Gesetz\n¸ber die Errichtung eines Tiroler Landeswohnbaufonds aufgehoben werden\nDer Landtag hat beschlossen:\nß 1\nAuflˆsung\n(1) Der mit dem Gesetz ¸ber die Errichtung eines Tiroler Landeswohnbaufonds, LGBl. Nr. 27/1951,\nzuletzt ge‰ndert durch das Gesetz LGBl. Nr. 50/1970, errichtete Tiroler Landeswohnbaufonds wird mit\ndem Ablauf des 30. Dezember 2026 aufgelˆst.\n(2) Das Land Tirol tritt mit 31. Dezember 2026 in das Vermˆgen, die Forderungen und die\nVerbindlichkeiten dieses Fonds ein.\nß 2\nAufhebung\nDas Gesetz ¸ber die Errichtung eines Tiroler Landeswohnbaufonds, LGBl. Nr. 27/1951, zuletzt\nge‰ndert durch das Gesetz LGBl. Nr. 50/1970, wird aufgehoben.\nß 3\nInkrafttreten\n(1) Dieses Gesetz tritt mit dem Ablauf des Tages der Kundmachung in Kraft, soweit im Abs. 2 nichts\nanderes bestimmt ist.\n(2) ß 2 tritt mit 31. Dezember 2026 in Kraft.'
  const VORLAGE = page('Gesetz vom …, mit dem der Tiroler Landeswohnbaufonds aufgelöst wird', 'Der Landtag hat beschlossen:', '§ 1', 'Auflösung', '(1) Der Fonds wird aufgelöst.', '§ 2', 'Inkrafttreten', 'Dieses Gesetz tritt in Kraft.')
  const record = (n: string) => `https://lte.tirol.gv.at/public/ggs/risLink.xhtml?gn=576&gj=2026#dok=${n}`
  const docs = [
    { title: 'Entwurf', url: record('Begutachtungsentwurf') },
    { title: 'Erläuterungen', url: record('Begutachtungsentwurf%2FErl%C3%A4uternde%20Bemerkungen') },
    { title: 'Leicht Lesen', url: record('Begutachtungsentwurf%2FLeicht%20Lesen') },
    { title: 'Regierungsvorlage', url: record('Regierungsvorlage') },
    { title: 'Regierungsvorlage, Erläuterungen', url: record('Regierungsvorlage%2FErl%C3%A4uternde%20Bemerkungen') },
  ]

  it('admits neither the Vorlage nor the easy-language version as a candidate', () => {
    expect(draftCandidates(docs).map((d) => d.title)).toEqual(['Entwurf'])
    expect(draftCandidates([{ title: 'Entwurf', url: 'a' }, { title: 'Erläuterungen', url: 'b' }, { title: 'Regierungsvorlage', url: 'c' }]).map((d) => d.title)).toEqual(['Entwurf'])
  })

  it('reads the Entwurf where it holds no unit, and never the Vorlage in its place', async () => {
    const pagesOf = async (url: string) => [url.endsWith('#dok=Regierungsvorlage') ? VORLAGE : url.endsWith('#dok=Begutachtungsentwurf') ? '1 von 1\nE n t w u r f\nGesetz vom …' : 'Leicht Lesen']
    const read = await draftSource(docs, 'Land Tirol', pagesOf)!.read()
    expect(read.document).toBeUndefined()
    expect(read.units ?? []).toEqual([])
  })

  it('repairs a short text layer read as Mac Roman in which not one sign reads right', () => {
    const [repaired] = repairMacRoman([ENTWURF_576])
    expect(repaired).toContain('§ 1\nAuflösung')
    expect(repaired).toContain('über die Errichtung')
    expect(landDraftUnits([repaired!])?.map((u) => u.id)).toEqual(['§1', '§2', '§3'])
  })
})

// Tirol 575/2026 and 722/2026 (21.11.2026): the address of an instruction
// set in a misread font beside a quote set in a sound one.
describe('repairMacRoman — a „§" read as „ß"', () => {
  it('turns „ß" before a number back into „§" in a line the repair leaves alone for a real „§" beside it', () => {
    expect(repairMacRoman(['15. Im ß 16b Abs. 1 wird das Zitat „§ 2 Abs. 2a,“ aufgehoben.'])).toEqual(['15. Im § 16b Abs. 1 wird das Zitat „§ 2 Abs. 2a,“ aufgehoben.'])
    expect(repairMacRoman(['13. Im ß 22 Abs. 3 lit. b wird das Wort „ordnungsgemäßen“ durch das Wort „bestimmungsgemäßen“'])[0]).toBe('13. Im § 22 Abs. 3 lit. b wird das Wort „ordnungsgemäßen“ durch das Wort „bestimmungsgemäßen“')
  })

  it('leaves a „ß" inside a word alone, also before a number', () => {
    expect(repairMacRoman(['Das Maß 3 gilt; die Straße 12 ist gesperrt.'])).toEqual(['Das Maß 3 gilt; die Straße 12 ist gesperrt.'])
  })
})

// sbg-31605, Salzburg's Glücksspielgesetz (19.11.2026): both the PDFs and
// the Landesgesetzblatt's RIS XML lost the „§" of § 36, and § 38's title
// runs over two lines. Every one read as a change of the § before.
describe('a § whose sign is lost, and a title over two lines', () => {
  const law = (...lines: string[]) => [page('Der Salzburger Landtag hat beschlossen:', ...lines)]
  const ids = (pages: string[]) => landDraftUnits(pages)!.map((u) => u.id)
  const headings = (pages: string[]) => lawBlocksFromPdfPages(pages)!.filter((b) => b.kind === 'para_head').map((b) => b.text)

  it('reads a bare number as the next § where a title stands above it and „(1)" opens below', () => {
    const pages = law('Werbung', '§ 35', '(1) Werbung ist maßvoll.', 'Spielgeheimnis', '36', '(1) Alle Organe haben Verschwiegenheit zu bewahren.')
    expect(ids(pages)).toEqual(['§35', '§36'])
    expect(headings(pages)).toEqual(['Werbung', 'Spielgeheimnis'])
    // Not the next number, or no „(1)" below it: a value, as before.
    expect(ids(law('Werbung', '§ 35', '(1) Werbung ist maßvoll.', 'Höchstbetrag', '37', '(1) Alle Organe.'))).toEqual(['§35'])
    expect(ids(law('Werbung', '§ 35', '(1) Der Betrag beträgt in Euro', '36', 'für jedes Jahr.'))).toEqual(['§35'])
  })

  it('takes back a title over two lines, where the text before them ends a sentence', () => {
    const pages = law('Hinweisgeber', '§ 37', '(1) Meldungen sind vertraulich zu behandeln.', 'Verarbeitung personenbezogener Daten durch den Konzessionsinhaber, Beschränkung des Zu-', 'gangs zu personenbezogenen Daten', '§ 38', '(1) Der Konzessionsinhaber ist ermächtigt.')
    expect(headings(pages)).toEqual(['Hinweisgeber', 'Verarbeitung personenbezogener Daten durch den Konzessionsinhaber, Beschränkung des Zugangs zu personenbezogenen Daten'])
    expect(landDraftUnits(pages)![0]!.text).toMatch(/vertraulich zu behandeln\.$/)
    expect(headings(law('Ziel', '§ 3', '(1) Text eins.', 'Arten, Geltungsbereich', 'und Umfang der Bewilligung', '§ 4', '(1) Text vier.'))).toEqual(['Ziel', 'Arten, Geltungsbereich und Umfang der Bewilligung'])
  })

  it('reads the Landesgesetzblatt’s bare „36" heading as § 36 too', () => {
    const lgbl = '<?xml version="1.0" encoding="utf-8"?><risdok xmlns="http://www.bka.gv.at"><nutzdaten><abschnitt>' +
      '<ueberschrift typ="para">Werbung</ueberschrift><ueberschrift typ="para">§ 35</ueberschrift><absatz typ="abs">(1) Werbung ist maßvoll.</absatz>' +
      '<ueberschrift typ="para">Spielgeheimnis</ueberschrift><ueberschrift typ="para">36</ueberschrift><absatz typ="abs">(1) Alle Organe haben Verschwiegenheit zu bewahren.</absatz>' +
      '</abschnitt></nutzdaten></risdok>'
    expect(lgblUnits(lgbl).map((u) => u.id)).toEqual(['§35', '§36'])
  })
})

// A new law's „§ N" over a § with no title: its first line is text. Taken
// for the title, the page showed it as a heading the Landesgesetzblatt
// inserted (Salzburg 31933 § 1, 32477 § 2, 33078 § 3; 20.11.2026).
describe('the first line of an untitled § is its text, not its title', () => {
  const headings = (pages: string[]) => lawBlocksFromPdfPages(pages)!.filter((b) => b.kind === 'para_head').map((b) => b.text)
  const texts = (pages: string[]) => landDraftUnits(pages)!.map((u) => `${u.id} ${u.text}`)

  it('reads a line that fills the measure, with no „(1)" under it, as the start of the text (sbg-32477)', () => {
    const pages = [page('Verordnung der Salzburger Landesregierung vom ........................................... über die',
      'Umlegung der Landesstraße L 214 Kleinarler Straße im Bereich der Marktgemeinde',
      'Wagrain (Straßenumlegungsverordnung Marktgemeinde Wagrain)',
      'Auf Grund § 19 Abs 2 des Salzburger Landesstraßengesetzes 1972, LGBl Nr 119/1972, in der',
      'geltenden Fassung wird verordnet:',
      '§ 1',
      '(1) Die L 214 Kleinarler Landesstraße wird im Ortsgebiet von Wagrain wie folgt umgelegt:',
      'Die neue Trasse der L 214 Kleinarler Straße beginnt bei dem neu errichteten Kreisverkehr bei',
      'Bezugspunkt Straßenkilometer D 0,00 (neu), verläuft sodann westlich der Kleinarler Ache entlang des',
      'Grafenberges, schwenkt in der Folge in Richtung Süd-Osten und bindet im Bereich des',
      'Kirchbodenanschlusses beim neu errichteten Kreisverkehr bei Straßenkilometer D 0,51 (neu) wieder in',
      'den Bestand der L 214 ein.',
      '(2) Im Einzelnen ist der Verlauf der neuen Straßentrasse aus der einen wesentlichen Bestandteil',
      'dieser Verordnung bildenden Anlage (Verordnungsplan vom 14.02.2022, M 1:1000) zu entnehmen.',
      '§ 2',
      'Mit der Umlegung des neuen Straßenabschnittes gemäß § 1 gilt die bestehende L 214 Kleinarler',
      'Straße zwischen Bezugspunkt Straßenkilometer 0,00 (alt) und Bezugspunkt Straßenkilometer 0,36 (alt)',
      'als Landesstraße L aufgelassen.')]
    expect(headings(pages)).toEqual([])
    expect(texts(pages).at(-1)).toBe('§2 Mit der Umlegung des neuen Straßenabschnittes gemäß § 1 gilt die bestehende L 214 Kleinarler Straße zwischen Bezugspunkt Straßenkilometer 0,00 (alt) und Bezugspunkt Straßenkilometer 0,36 (alt) als Landesstraße L aufgelassen.')
  })

  it('reads a line closed by a full stop as text (Salzburg 32027 § 2)', () => {
    const pages = [page('Verordnung der Salzburger Landesregierung vom ...', 'wird verordnet:', '§ 1', '(1) Die Grenze wird geändert.',
      '§ 2', 'Diese Verordnung tritt mit 1. Juli 2025 in Kraft.')]
    expect(headings(pages)).toEqual([])
    expect(texts(pages).at(-1)).toBe('§2 Diese Verordnung tritt mit 1. Juli 2025 in Kraft.')
  })

  it('keeps a title as long, where „(1)" opens below it (Wettunternehmer, § 5)', () => {
    const pages = [page('Der Landtag hat beschlossen:', '§ 5',
      'Voraussetzungen für die Erteilung der Bewilligung als Wettunternehmer und Anzeigepflichten',
      '(1) Die Ausübung der Tätigkeit eines Wettunternehmers in einer oder mehreren Betriebsstätten',
      'bedarf einer Bewilligung.')]
    expect(headings(pages)).toEqual(['Voraussetzungen für die Erteilung der Bewilligung als Wettunternehmer und Anzeigepflichten'])
  })
})
