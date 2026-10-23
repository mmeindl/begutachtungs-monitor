import { describe, expect, it } from 'vitest'
import { lawBlocksFromPdfPages } from '../server/utils/laender/draftPdfLaw'
import { diffLandDraft, landDraftUnits, lgblUnits, packageChanges } from '../server/utils/laender/landLawDiff'

/* Pages as the PDF's text layer gives them: one string per page, a line per
   printed line, „Seite n" on top. The texts are built for the rules, each
   after a draft the measurement read (docs/architecture.md §12.44). */
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

  it('joins a word split at the line end, and keeps a compound and a suspended part', () => {
    const blocks = lawBlocksFromPdfPages([page('Der Oö. Landtag hat beschlossen:', 'Artikel I', 'Das Oö. X-Gesetz wird wie folgt geändert:',
      '1. Im § 1 wird die Gleich-', 'behandlung im Oö. Agrarrecht-', 'Organisationsgesetz für die Land-', 'und Forstwirtschaft geregelt.')])!
    expect(blocks.at(-1)!.text).toBe('1. Im § 1 wird die Gleichbehandlung im Oö. Agrarrecht-Organisationsgesetz für die Land- und Forstwirtschaft geregelt.')
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
    // changed instruction (the address pass, §12.44 Nachtrag 3).
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
