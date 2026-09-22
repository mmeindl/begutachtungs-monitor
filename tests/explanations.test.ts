import { describe, expect, it } from 'vitest'
import { hasReadableText, parseExplanations } from '../server/utils/explanations'
import { explanationsByParagraph } from '../server/utils/explanationsJoin'
import { explanationParaId } from '../shared/utils/explanations'

/**
 * The shapes below are the ones the corpus actually delivers
 * (`pnpm audit:erlaeuterungen`, 465 documents of the 2024+ window): the typed
 * RIS Erläuterungen XML, the letter-spaced heading, the document that never
 * says „Besonderer Teil", the scan, and the WFA form-sheet in an Erläuterungen
 * costume.
 */
const doc = (body: string): string =>
  `<?xml version="1.0" encoding="utf-8"?><risdok xmlns="http://www.bka.gv.at"><metadaten /><nutzdaten><abschnitt nr="1" typ="ns">${body}</abschnitt></nutzdaten></risdok>`

const head = (typ: string, text: string): string => `<ueberschrift typ="${typ}" halign="c">${text}</ueberschrift>`
const text = (t: string): string => `<absatz typ="erltext" halign="j">${t}</absatz>`

describe('parseExplanations — the parts', () => {
  const standard = doc(
    head('erlz', 'Erläuterungen') +
    head('erlz', 'Allgemeiner Teil') +
    head('erll', 'Hauptgesichtspunkte des Entwurfs:') +
    text('Die Richtlinie soll umgesetzt werden.') +
    head('erll', 'Kompetenzgrundlage:') +
    text('Art. 10 Abs. 1 Z 6 B-VG.') +
    head('erlz', 'Besonderer Teil') +
    head('erlz', 'Zu Art. 1 (Änderung des Aktiengesetzes)') +
    head('erll', 'Zu Z 1 (§ 12 Abs. 3):') +
    text('Die Bestimmung entfällt.') +
    head('erll', 'Zu Z 2 (§ 12b):') +
      text('Neu eingefügt.'),
  )

  it('splits the document at the part headings the ministry typed', () => {
    const parsed = parseExplanations(standard)
    expect(parsed.general?.heading).toBe('Allgemeiner Teil')
    expect(parsed.generalInferred).toBe(false)
    expect(parsed.special?.heading).toBe('Besonderer Teil')
    expect(parsed.specialInferred).toBe(false)
    expect(parsed.general?.passages.map((p) => p.heading)).toEqual(['Hauptgesichtspunkte des Entwurfs:', 'Kompetenzgrundlage:'])
  })

  it('does not let the document title open a part of its own', () => {
    expect(parseExplanations(standard).parts.map((p) => p.heading)).toEqual(['Allgemeiner Teil', 'Besonderer Teil'])
  })

  it('keeps the Artikel heading of the Besonderer Teil on its passages, not as a part', () => {
    const passages = parseExplanations(standard).special!.passages
    expect(passages.map((p) => p.article)).toEqual(['Zu Art. 1 (Änderung des Aktiengesetzes)', 'Zu Art. 1 (Änderung des Aktiengesetzes)'])
  })

  it('reads the address out of a passage heading — the join key for the annex', () => {
    const passages = parseExplanations(standard).special!.passages
    expect(passages[0]!.items).toEqual(['Z 1'])
    expect(passages[0]!.paragraphs).toEqual(['§ 12'])
    expect(passages[1]!.paragraphs).toEqual(['§ 12b'])
  })

  it('matches part headings through numbering and letter-spacing', () => {
    // „E r l ä u t e r u n g e n" and „I. Allgemeiner Teil" both occur in the
    // corpus; RIS collapses the spacing to single spaces before we see it.
    const parsed = parseExplanations(
      doc(head('erlz', 'E r l ä u t e r u n g e n') + head('erlz', 'I. Allgemeiner Teil') + text('Zweck des Entwurfs.') + head('erlz', 'II. Besonderer Teil') + head('erll', 'Zu § 1:') + text('Dazu.')),
    )
    expect(parsed.general?.heading).toBe('I. Allgemeiner Teil')
    expect(parsed.special?.heading).toBe('II. Besonderer Teil')
    expect(parsed.parts).toHaveLength(2)
  })
})

describe('parseExplanations — the documents that break the tidy rule', () => {
  it('takes unlabelled prose as the general part, and says that it inferred it', () => {
    const parsed = parseExplanations(doc(text('Derzeit haben Studierende aus der Ukraine keinen Beitrag zu entrichten.') + text('Das soll verlängert werden.')))
    expect(parsed.generalInferred).toBe(true)
    expect(parsed.general?.passages[0]!.text).toHaveLength(2)
  })

  it('refuses the inference where a WFA form-sheet sits in the same document', () => {
    // Printing „Ziel(e) — Inhalt — Maßnahmen" as the ministry's reasoning would
    // put a form in place of the argument.
    const parsed = parseExplanations(doc(head('erlz', 'Ziel(e)') + text('Anhebung der Grenze.') + head('erlz', 'Inhalt') + text('Eine Tabelle.')))
    expect(parsed.general).toBeNull()
    expect(parsed.parts.map((p) => p.kind)).toEqual(['wfa', 'wfa'])
  })

  it('refuses the inference where the ministry named its parts but named none of them general', () => {
    const parsed = parseExplanations(doc(head('erlz', 'Zu den einzelnen Bestimmungen') + text('Dazu.')))
    expect(parsed.general).toBeNull()
  })

  it('divides a document that runs from general prose into "Zu § 1:" with no divider', () => {
    // The EABG shape: 106.262 characters under „Allgemeiner Teil", all but
    // three passages per-§ commentary.
    const parsed = parseExplanations(
      doc(
        head('erlz', 'Allgemeiner Teil') +
        head('erll', 'Hintergrund:') +
        text('Warum das Gesetz kommt.') +
        head('erll', 'Zu § 1:') +
        text('Begriffsbestimmungen.') +
        head('erll', 'Zu § 2:') +
        text('Anwendungsbereich.'),
      ),
    )
    expect(parsed.general?.passages.map((p) => p.heading)).toEqual(['Hintergrund:'])
    expect(parsed.specialInferred).toBe(true)
    expect(parsed.special?.passages.map((p) => p.heading)).toEqual(['Zu § 1:', 'Zu § 2:'])
  })

  it('does not divide on a topic heading that merely cites a §', () => {
    const parsed = parseExplanations(doc(head('erlz', 'Allgemeiner Teil') + head('erll', 'Zum Verhältnis zu § 5 DSG:') + text('Dazu.')))
    expect(parsed.special).toBeNull()
    expect(parsed.general?.passages).toHaveLength(1)
  })

  it('reads a scan as a scan, not as an Erläuterung whose text is a GIF path', () => {
    // The whole Budgetbegleitgesetz 2027-2028 arrives like this.
    const scan = doc(
      '<absatz typ="abbobj"><binary datatype="gif"><src>/Dokumente/Begut/BEGUT_04AE/Temp77ec.0001.gif</src></binary></absatz>' +
      '<absatz typ="abbobj"><binary datatype="gif"><src>/Dokumente/Begut/BEGUT_04AE/Temp77ec.0002.gif</src></binary></absatz>',
    )
    const parsed = parseExplanations(scan)
    expect(hasReadableText(parsed)).toBe(false)
    expect(parsed.general).toBeNull()
    expect(parsed.parts[0]?.dropped).toBe(2)
  })

  it('counts a table out of the prose instead of printing its cells as sentences', () => {
    const parsed = parseExplanations(
      doc(head('erlz', 'Allgemeiner Teil') + text('Der Entwurf sieht Folgendes vor.') + '<table><tr><td><absatz typ="tabtext">2026</absatz></td><td><absatz typ="tabtext">4,9 %</absatz></td></tr></table>'),
    )
    expect(parsed.general?.passages[0]!.text).toEqual(['Der Entwurf sieht Folgendes vor.'])
    expect(parsed.general?.dropped).toBe(2)
  })
})

describe('parseExplanations — the part heading one level down', () => {
  it('reads "Allgemeiner Teil:" typed as erll as the division it is', () => {
    // Studienbeitragsverordnung: the ressort divides the document, but types
    // the two names as passage headings. Read as passages they left the
    // general part ending on an empty „Besonderer Teil:".
    const parsed = parseExplanations(
      doc(
        head('erll', 'Allgemeiner Teil:') +
        text('Ukrainische Studierende sollen weiter befreit bleiben.') +
        head('erll', 'Besonderer Teil:') +
        head('erll', 'Zu § 1:') +
        text('Dazu.'),
      ),
    )
    expect(parsed.general?.heading).toBe('Allgemeiner Teil:')
    expect(parsed.generalInferred).toBe(false)
    expect(parsed.special?.heading).toBe('Besonderer Teil:')
    expect(parsed.general?.passages.every((p) => p.heading !== 'Besonderer Teil:')).toBe(true)
  })

  it('promotes those two names only — every other erll stays a passage', () => {
    const parsed = parseExplanations(
      doc(head('erlz', 'Allgemeiner Teil') + head('erll', 'Kompetenzgrundlage:') + text('Art. 10 B-VG.')),
    )
    expect(parsed.parts).toHaveLength(1)
    expect(parsed.general?.passages.map((p) => p.heading)).toEqual(['Kompetenzgrundlage:'])
  })
})

describe('explanationsByParagraph — die Passage an ihrem Paragraphen', () => {
  const articles = (...as: { numeral: string | null; key: string }[]) =>
    as.map((a, index) => ({ index, number: a.numeral ? `Artikel ${a.numeral}` : null, numeral: a.numeral, title: a.key, key: a.key, amends: true, bgbl: null }))

  const besonderer = (body: string) => parseExplanations(doc(head('erlz', 'Besonderer Teil') + body))

  it('trägt den Gesetzesschlüssel der Zeilen, auch wenn das Paket nur ein Gesetz hat', () => {
    // Die Beilage führt ihre Zeilen unter dem Artikelschlüssel, sobald es
    // einen gibt — „null, wenn nur ein Gesetz" war die erste Fassung, und sie
    // traf bei der Honigverordnung 0 von 9.
    const parsed = besonderer(head('erll', 'Zu Z 1 (§ 3 Z 2):') + text('Dazu.'))
    const only = articles({ numeral: null, key: 'Honigverordnung, Änderung' })
    expect(explanationsByParagraph(parsed, only)).toEqual([
      { law: 'Honigverordnung, Änderung', para: '3', heading: 'Zu Z 1 (§ 3 Z 2):', text: ['Dazu.'] },
    ])
  })

  it('liest die Artikelüberschrift des Besonderen Teils, auch als Passage gesetzt', () => {
    // Berufsrechts-Änderungsgesetz 2024: „Zu Art. 1 (Änderung der
    // Notariatsordnung)" steht als `erll`, nicht als `erlz`.
    const parsed = besonderer(
      head('erll', 'Zu Art. 1 (Änderung der Notariatsordnung)') +
      head('erll', 'Zu Z 1 (§ 7 Abs. 1 Z 3 NO)') +
      text('Dazu.') +
      head('erll', 'Zu Art. 2 (Änderung der Rechtsanwaltsordnung)') +
      head('erll', 'Zu Z 1 (§ 7)') +
      text('Und dazu.'),
    )
    const pack = articles({ numeral: '1', key: 'Änderung der Notariatsordnung' }, { numeral: '2', key: 'Änderung der Rechtsanwaltsordnung' })
    expect(explanationsByParagraph(parsed, pack)).toEqual([
      { law: 'Änderung der Notariatsordnung', para: '7', heading: 'Zu Z 1 (§ 7 Abs. 1 Z 3 NO)', text: ['Dazu.'] },
      { law: 'Änderung der Rechtsanwaltsordnung', para: '7', heading: 'Zu Z 1 (§ 7)', text: ['Und dazu.'] },
    ])
  })

  it('verwirft eine Passage, deren Gesetz im Mehrgesetzespaket unbestimmt bleibt', () => {
    const parsed = besonderer(head('erll', 'Zu Z 1 (§ 7):') + text('Dazu.'))
    const pack = articles({ numeral: '1', key: 'Änderung der Notariatsordnung' }, { numeral: '2', key: 'Änderung der Rechtsanwaltsordnung' })
    expect(explanationsByParagraph(parsed, pack)).toEqual([])
  })

  it('hängt eine Passage über mehrere §§ an jeden von ihnen, Bereiche eingeschlossen', () => {
    const parsed = besonderer(head('erll', 'Zu Z 3 bis 6 (§§ 23 bis 25 NO):') + text('Dazu.'))
    const only = articles({ numeral: null, key: 'NO' })
    expect(explanationsByParagraph(parsed, only).map((e) => e.para)).toEqual(['23', '24', '25'])
  })

  it('macht aus „Zu Art. 2 Z 1 (§ 7)" keine Artikelüberschrift — sie erklärt einen §', () => {
    const parsed = besonderer(head('erll', 'Zu Art. 2 Z 1 (§ 7):') + text('Dazu.'))
    const pack = articles({ numeral: '1', key: 'Änderung der Notariatsordnung' }, { numeral: '2', key: 'Änderung der Rechtsanwaltsordnung' })
    expect(explanationsByParagraph(parsed, pack)).toEqual([
      { law: 'Änderung der Rechtsanwaltsordnung', para: '7', heading: 'Zu Art. 2 Z 1 (§ 7):', text: ['Dazu.'] },
    ])
  })

  it('normalisiert die Bezeichnung auf beiden Seiten — und nimmt keine Anlage für einen §', () => {
    expect(explanationParaId('§ 54c.')).toBe('54c')
    expect(explanationParaId('§ 54C')).toBe('54c')
    expect(explanationParaId('Anlage 1 zu § 6')).toBeNull()
    expect(explanationParaId(null)).toBeNull()
  })
})
