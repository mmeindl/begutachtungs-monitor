import { describe, expect, it } from 'vitest'
import { addressOf, hasReadableText, parseExplanations, splitHeading, ziffernOf } from '../server/utils/explanations/risExplanations'
import { explanationsByParagraph } from '../server/utils/explanations/explanationsJoin'

/**
 * The shapes below are the ones the corpus actually delivers
 * (`pnpm corpus:erlaeuterungen`, 465 documents of the 2024+ window): the typed
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
    as.map((a, index) => ({ index, number: a.numeral ? `Artikel ${a.numeral}` : null, numeral: a.numeral, title: a.key, key: a.key, amends: true, bgbl: null, clause: null }))

  const besonderer = (body: string) => parseExplanations(doc(head('erlz', 'Besonderer Teil') + body))

  it('trägt den Gesetzesschlüssel der Zeilen, auch wenn das Paket nur ein Gesetz hat', () => {
    // The annex carries its rows under the Artikel key as soon as there is
    // one — „null, wenn nur ein Gesetz" was the first version, and on the
    // Honigverordnung it hit 0 of 9.
    const parsed = besonderer(head('erll', 'Zu Z 1 (§ 3 Z 2):') + text('Dazu.'))
    const only = articles({ numeral: null, key: 'Honigverordnung, Änderung' })
    expect(explanationsByParagraph(parsed, only)).toEqual([
      { law: 'Honigverordnung, Änderung', para: '3', heading: 'Zu Z 1 (§ 3 Z 2):', text: ['Dazu.'] },
    ])
  })

  it('liest die Artikelüberschrift des Besonderen Teils, auch als Passage gesetzt', () => {
    // Berufsrechts-Änderungsgesetz 2024: „Zu Art. 1 (Änderung der
    // Notariatsordnung)" stands as `erll`, not as `erlz`.
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
})

describe('ziffernOf — die Novellierungsanordnungen einer Passagenüberschrift (01.10.2026)', () => {
  const read = (heading: string) => ziffernOf(heading).map((z) => `${z.article ?? '–'}:${z.ziffer}`)

  it('liest Ziffern, Listen und Bereiche', () => {
    expect(read('Zu Z 4 (§ 54c Abs. 1a):')).toEqual(['–:4'])
    expect(read('Zu Z 1 bis 3:')).toEqual(['–:1', '–:2', '–:3'])
    expect(read('Zu Z 1, 14, 24 bis 27 (§ 1):')).toEqual(['–:1', '–:14', '–:24', '–:25', '–:26', '–:27'])
    expect(read('Zu Z 89 und Z 90 (§ 18):')).toEqual(['–:89', '–:90'])
    expect(read('Zu Z 2 (§ 69b Abs. 1 Z 5) und 3 (§ 69 Abs. 1 Z 7):')).toEqual(['–:2', '–:3'])
    expect(read('Zu Z 1 lit. b und Z 4 (§ 9 Abs. 6 Z 6):')).toEqual(['–:1', '–:4'])
  })

  it('ordnet jede Ziffer dem Artikel zu, den die Überschrift vor ihr nennt', () => {
    expect(read('Zu Art. 2 Z 1 (§ 7):')).toEqual(['2:1'])
    expect(read('Zu Art. 1 Z 5 sowie zu Art. 13 Z 1 bis 3 (§ 6 und § 7 KfzStG):')).toEqual(['1:5', '13:1', '13:2', '13:3'])
    expect(read('Zu Art. II Z 3 bis Z 5:')).toEqual(['2:3', '2:4', '2:5'])
  })

  // „Zu § 4 Z 1:" is item 1 of § 4 in a new law, not an instruction.
  it('liest ein „Z" hinter einem §, Absatz oder einer Anlage nicht als Ziffer', () => {
    expect(read('Zu § 4 Z 1:')).toEqual([])
    expect(read('Zu § 18 Abs. 9 Z 3:')).toEqual([])
    expect(read('Zu Abs. 11 Z 1:')).toEqual([])
    expect(read('Zu Anlage 1 Z 3.20 BDG 1979:')).toEqual([])
    expect(read('Zu Art. 12 Abs. 1 Z 1 B-VG:')).toEqual([])
  })

  it('erfindet in „Z 5a bis 5c" keine Buchstaben dazwischen', () => {
    expect(read('Zu Z 5a bis 5c:')).toEqual(['–:5a', '–:5c'])
  })

  it('liest eine Überschrift, die in Prosa weiterläuft, als keine Anweisung', () => {
    expect(read('Zu Z 4: Diese Definition ergeht in Umsetzung des Art. 2 Z 9a der Richtlinie (EU) 2018/2001.')).toEqual([])
    expect(read('Zu Z 5 ist festzuhalten, dass der Gesamtwert …')).toEqual([])
  })

  it('füllt addressOf().items aus derselben Lesung', () => {
    expect(addressOf('Zu Z 1 bis 3 (§ 5 Abs. 2 Z 7):').items).toEqual(['Z 1', 'Z 2', 'Z 3'])
  })
})

describe('splitHeading — die Begründung auf der Überschriftszeile (02.10.2026)', () => {
  it('schneidet am Ende der Adresse und gibt den Rest als Prosa', () => {
    expect(splitHeading('Zu Z 5 (Aggregierung): Durch die Wortfolge "gemeinsam" soll zum Ausdruck gebracht werden, dass …')).toEqual({
      address: 'Zu Z 5 (Aggregierung):',
      prose: 'Durch die Wortfolge "gemeinsam" soll zum Ausdruck gebracht werden, dass …',
    })
    expect(splitHeading('Zu Abs. 3: Die Regelung knüpft an § 2 an.')).toEqual({ address: 'Zu Abs. 3:', prose: 'Die Regelung knüpft an § 2 an.' })
    // The colon inside the brackets is not the end of the address.
    expect(splitHeading('Zu Z 2 (§ 5: neu): Dazu ist nichts zu sagen.').address).toBe('Zu Z 2 (§ 5: neu):')
  })

  it('lässt eine Überschrift ohne Prosa hinter dem Doppelpunkt, wie sie ist', () => {
    expect(splitHeading('Zu Z 4 (§ 54c Abs. 1a und 1b):')).toEqual({ address: 'Zu Z 4 (§ 54c Abs. 1a und 1b):', prose: null })
  })

  it('nimmt eine Überschrift ohne Doppelpunkt, die mit einem Verb in ihren Satz läuft, ganz als Prosa', () => {
    // The address is the subject of the sentence: cut at the verb, „vertritt
    // die Kommission …" would be no sentence (55/ME XXVIII).
    expect(splitHeading('Zu § 77a Abs. 9 vertritt die Kommission die Auffassung, dass § 40 nicht genügt.')).toEqual({
      address: 'Zu § 77a Abs. 9',
      prose: 'Zu § 77a Abs. 9 vertritt die Kommission die Auffassung, dass § 40 nicht genügt.',
    })
    expect(splitHeading('Zu Z 9 (neu) ist auf die Ausführungen in ErläutRV 69 BlgNR XXVI. GP 230 zu verweisen.').address).toBe('Zu Z 9 (neu)')
    expect(splitHeading('Zu Abs. 3 siehe die Erläuterungen zu § 12b GTelG 2012.').address).toBe('Zu Abs. 3')
  })

  it('lässt eine Überschrift ohne Doppelpunkt ganz, wo kein Verb die Adresse beendet oder kein Satz endet', () => {
    // A title, an address that goes on into another act, an unclosed sentence.
    expect(splitHeading('Zu § 16 Abs. 2 allgemein und zur neuen Systematik des § 16').prose).toBeNull()
    expect(splitHeading('Zu Abs. 6 Z 4 - staatliche Lizenzen oder Konzessionen').prose).toBeNull()
    expect(splitHeading('Zu Art. 5 Abs. 5 der Richtlinie (EU) 2024/1799 ist vorweg darauf hinzuweisen, dass dies gilt.').prose).toBeNull()
    expect(splitHeading('Zu Abs. 3 ist festzuhalten, dass die Begriffe').prose).toBeNull()
  })

  it('schneidet keinen Titel ab: den eines §, den Gesetzestitel einer Artikelüberschrift, keine zweite Adresse', () => {
    expect(splitHeading('Zu § 1: Ziel').prose).toBeNull()
    expect(splitHeading('Zu § 69: Dokumentation des Warenausgangs aus einer öffentlichen Apotheke oder einer Apotheke einer akademischen Ausbildungsstätte').prose).toBeNull()
    expect(splitHeading('Zu Z 5: Nebenwirkungen').prose).toBeNull()
    expect(splitHeading('Zu Artikel 1: Elektrizitätswirtschaftsgesetz').prose).toBeNull()
    expect(splitHeading('Zu Artikel 10: Änderung des Pflichtschulerhaltungs-Grundsatzgesetzes:').prose).toBeNull()
    expect(splitHeading('Zu Art. 1: Zu Z 1:').prose).toBeNull()
  })

  it('nimmt einen nicht geschlossenen Satz unter einer Adresse ohne § als Prosa', () => {
    expect(splitHeading('Zu Abs. 1: Erarbeitung von Qualifikationen in Entwicklungsteams unter Beiziehung von').prose).toBe(
      'Erarbeitung von Qualifikationen in Entwicklungsteams unter Beiziehung von',
    )
  })

  it('gibt im RIS-Leser die Prosa als ersten Absatz und die §§ nur aus der Adresse', () => {
    const parsed = parseExplanations(
      doc(head('erlz', 'Besonderer Teil') + head('erll', 'Zu Z 90 (§ 91a): Bei Z 90 handelt es sich um eine Anpassung an § 5 KMG.') + text('Weiter.')),
    )
    // The Ziffern stay read from the whole line, as before: one that runs on names none.
    expect(parsed.special?.passages.map((p) => [p.heading, p.paragraphs, p.items, p.text])).toEqual([
      ['Zu Z 90 (§ 91a):', ['§ 91a'], [], ['Bei Z 90 handelt es sich um eine Anpassung an § 5 KMG.', 'Weiter.']],
    ])
  })
})
