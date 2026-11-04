import { describe, expect, it } from 'vitest'
import { landLawPart, quotedHints, readLandLaw } from '../server/utils/eu/landGesetzestext'
import { entryHinweise } from '../server/utils/eu/landErlaeuterungen'
import { parseLandExplanations } from '../server/utils/laender/landExplanations'

/*
 * Fixtures cut from the Länder corpus of GP XXVIII (`.cache/eu-laender/`,
 * 04.11.2026), as the PDF reader gives the lines.
 */

/** sbg-34413 (Kinder- und Jugendhilfegesetz): the hint in force (§ 60) gains a quoted Ziffer, and the Erläuterungen follow in the same PDF. */
const SBG_34413 = [
  'Der Salzburger Landtag hat beschlossen:',
  'Das Salzburger Kinder- und Jugendhilfegesetz, LGBl Nr 32/2015, wird geändert wie folgt:',
  '15. Im § 60 werden folgende Änderungen vorgenommen:',
  '15.1. Die Z 6 lautet:',
  '„6. Richtlinie 2024/1712/EU zur Änderung der Richtlinie 2011/36/EU zur Verhütung und',
  'Bekämpfung des Menschenhandels und zum Schutz seiner Opfer des Europäischen Parlaments',
  'und des Rates der Europäischen Union, ABl L, 2024/1712 vom 24.6.2024;“',
  '15.2. In der Z 11 wird der abschließende Punkt durch einen Strichpunkt ersetzt und folgende Z 12',
  'angefügt:',
  '„12. Richtlinie 2024/1385/EU zur Bekämpfung von Gewalt gegen Frauen und häusliche Gewalt des',
  'Europäischen Parlaments und des Rates der Europäischen Union, ABl Nr L 2024/1385 vom',
  '24.5.2024.“',
  '4 von 7',
  'Erläuterungen',
  '1. Allgemeiner Teil',
  'Unter Anderem dient die Ergänzung auch der Umsetzung der Richtlinie (EU) 2024/1346, die mit diesem',
  'Gesetz umgesetzt wird.',
].join('\n')

/** bgld-8fff4c83 („Entwurf und Erläuterungen"): the law, then the Vorblatt, whose EU section names acts in prose. */
const BGLD_WITH_VORBLATT = [
  'Gesetz vom ……………… , mit dem das Burgenländische Straßengesetz 2005 geändert wird',
  'Der Landtag hat beschlossen:',
  'Das Burgenländische Straßengesetz 2005, LGBl. Nr. 79/2005, wird wie folgt geändert:',
  '1. § 39b Abs. 1 lautet:',
  '„(1) Die Benutzungsgebühr beträgt für ein Fahrzeug der Emissionsklasse EURO VI 990 Euro.“',
  'Vorblatt',
  'Verhältnis zu den Rechtsvorschriften der Europäischen Union:',
  'Es werden folgende Rechtsakte der Europäischen Union umgesetzt:',
  'Richtlinie 1999/62/EG über die Erhebung von Gebühren für die Benutzung von Straßeninfrastrukturen',
  'durch Fahrzeuge, ABl. Nr. L 187 vom 20.07.1999 S. 42.',
  'Erläuterungen:',
].join('\n')

/** bgld-67d9a831 (Pflanzenschutzmittelgesetz): a quoted list of references, not of implementations. */
const BGLD_REFERENCES = [
  'Der Landtag hat beschlossen:',
  '4. § 19 Abs. 2 lautet:',
  '„(2) Dieses Gesetz verweist auf folgende Rechtsakte der Europäischen Union:',
  '1. Verordnung (EG) Nr. 1107/2009 über das Inverkehrbringen von Pflanzenschutzmitteln und zur',
  'Aufhebung der Richtlinien 79/117/EWG und 91/414/EWG des Rates, ABl. Nr. L 309 vom 24.11.2009 S. 1;',
  '2. Durchführungsverordnung (EU) 2023/564 betreffend den Inhalt und das Format der Aufzeichnungen.“',
].join('\n')

/** ooe-2026-16110: Oberösterreich's EU-Begleitregelungs- und Umsetzungsgesetz, its hint's Ziffer replaced. */
const OOE_16110 = [
  'Artikel II',
  'Änderung des Oö. EU-Begleitregelungs- und Umsetzungsgesetzes',
  '2. § 1 Abs. 1 Z 6 lautet:',
  '„6. Art. 15 und 16 der Richtlinie (EU) 2018/2001 des Europäischen Parlaments und des Rates',
  'vom 11. Dezember 2018 zur Förderung der Nutzung von Energie aus erneuerbaren Quellen,',
  'ABl. Nr. L 328 vom 21.12.2018, S 82.“',
  '3. Der 6. Abschnitt entfällt.',
]

describe('the law text of a Land\'s draft', () => {
  it('ends where the Erläuterungen begin, and reads no act from them', () => {
    const part = landLawPart([SBG_34413])!
    expect(part.at(-1)).toBe('24.5.2024.“')
    const law = readLandLaw([SBG_34413])
    expect(law.acts.map((a) => a.celex)).toEqual(['32024L1712', '32024L1385'])
    expect(law.signal).toBe('umsetzung')
    expect(law.quotedOnly.map((a) => a.celex)).toEqual(['32024L1712', '32024L1385'])
  })

  it('ends at the Vorblatt: its prose names no law-text act', () => {
    const part = landLawPart([BGLD_WITH_VORBLATT])!
    expect(part.at(-1)).toBe('„(1) Die Benutzungsgebühr beträgt für ein Fahrzeug der Emissionsklasse EURO VI 990 Euro.“')
    expect(readLandLaw([BGLD_WITH_VORBLATT]).acts).toEqual([])
  })

  it('reads a quoted Ziffer that opens with an article of an act', () => {
    expect(quotedHints(OOE_16110).flatMap((q) => q.acts.map((a) => a.celex))).toEqual(['32018L2001'])
  })

  it('skips a quoted list the law introduces as references', () => {
    expect(quotedHints(BGLD_REFERENCES.split('\n'))).toEqual([])
  })

  it('reads nothing where the PDF has no law text to bound', () => {
    expect(readLandLaw(['Erläuterungen', 'Allgemeiner Teil', 'Mit dem Entwurf wird die Richtlinie (EU) 2024/1785 umgesetzt.']).read).toBe(false)
  })
})

describe('Oberösterreich\'s Umsetzungshinweis per provision', () => {
  /** ooe-2026-16120: the Besonderer Teil, „Umsetzungshinweis:" over each entry — eight times in the document, kept although it repeats. */
  const pages = [[
    'A. Allgemeiner Teil',
    'I. Anlass und Inhalt des Gesetzentwurfs',
    'Die Novelle setzt die Richtlinien über Gleichbehandlungsstellen um.',
    'B. Besonderer Teil',
    'Zu Art. II Z 8 und 9 (Überschrift des § 8 und § 8 Abs. 5):',
    'Umsetzungshinweis:',
    'Durch diese Bestimmung wird die jeweilige Vorgabe des Art. 10 Abs. 3 lit. b der Richtlinie',
    '(EU) 2024/1499 einerseits und der Richtlinie (EU) 2024/1500 andererseits umgesetzt.',
    'Zu Art. II Z 11 (§ 14 Abs. 1):',
    'Umsetzungshinweis:',
    'Durch § 14 Abs. 1 Oö. ADG und § 27 Abs. 1 Oö. GBG 2021 werden Art. 4 der Richtlinie',
    '(EU) 2024/1499 sowie der gleichlautende Art. 4 der Richtlinie (EU) 2024/1500 umgesetzt.',
    'Zu Art. II Z 16 (§ 14 Abs. 6):',
    'Umsetzungshinweis:',
    'Es werden Art. 12 Abs. 2 und 3 der Richtlinie (EU) 2024/1499 und der idente Art. 12 Abs. 2 und 3',
    'der Richtlinie (EU) 2024/1500 umgesetzt.',
    'Zu Art. III Z 28 (§ 27 Abs. 2):',
    'Das Formalerfordernis der Schriftlichkeit soll entfallen.',
    'Der Oö. Landtag hat beschlossen:',
  ].join('\n')]

  it('names the acts of each labelled entry, and none of an entry without the label', () => {
    const parse = parseLandExplanations(pages)!
    const hints = entryHinweise(parse.particular)
    expect(hints.map((h) => h.heading)).toEqual(['Zu Art. II Z 8 und 9 (Überschrift des § 8 und § 8 Abs. 5):', 'Zu Art. II Z 11 (§ 14 Abs. 1):', 'Zu Art. II Z 16 (§ 14 Abs. 6):'])
    expect(hints[1]!.acts.map((a) => a.celex)).toEqual(['32024L1499', '32024L1500'])
  })

  it('reads the label opening a paragraph too', () => {
    const hints = entryHinweise([{ heading: 'Zu Art. III Z 19 (§ 18 Abs. 4):', text: ['Umsetzungshinweis zu Abs. 4: Damit wird Art. 23 der Richtlinie (EU) 2023/970 umgesetzt.'] }])
    expect(hints.map((h) => h.acts.map((a) => a.celex))).toEqual([['32023L0970']])
  })
})
