import { describe, expect, it } from 'vitest'
import { decideLandEuMarker, entryHinweise, isLandEuHeading, normaliseLandHeading, readLandEuStatement, statementActs } from '../server/utils/eu/landErlaeuterungen'

/*
 * Fixtures cut from the Länder corpus of GP XXVIII (`.cache/eu-laender/`,
 * 04.11.2026), a dozen lines each, as the PDF reader gives them.
 */

/** stmk-569af1a4 („Vorblatt und Erläuterungen", Stmk. Seveso-Betriebe Gesetz 2017): the WFA heading. */
const STMK_WFA = [
  'Auswirkungen auf die Umwelt/das Klima',
  'Die beabsichtigte Regelung hat voraussichtlich keine Auswirkungen.',
  'Verhältnis zu den Rechtsvorschriften der Europäischen Union',
  'Mit dem Entwurf wird die Richtlinie 2012/18/EU des Europäischen Parlaments und des Rates vom',
  '4. Juli 2012 zur Beherrschung der Gefahren schwerer Unfälle mit gefährlichen Stoffen, zur Änderung und',
  'anschließenden Aufhebung der Richtlinie 96/82/EG des Rates („Seveso III-Richtlinie“) umgesetzt.',
  'Besonderheiten des Normerzeugungsverfahrens',
  'Der Gesetzesbeschluss unterliegt gemäß Art. 72 Abs. 2 L-VG nicht einer Volksabstimmung wegen',
  'Umsetzung von Unionsrecht.',
  'Kompetenzgrundlage',
  'Die Kompetenz des Landesgesetzgebers zur Änderung des Steiermärkischen Seveso-Betriebe Gesetzes',
  '2017 ergibt sich aus Art. 15 Abs. 1 B-VG.',
]

/** bgld-b4355ed0 (Burgenländische Rebzikadenverordnung 2026): the Vorblatt's heading without „den". */
const BGLD_VORBLATT = [
  'Keine.',
  'Verhältnis zu Rechtsvorschriften der Europäischen Union:',
  'Durch diese Verordnung wird die Verordnung (EU) 2016/2031 über Maßnahmen zum Schutz vor',
  'Pflanzenschädlingen, zur Änderung der Verordnungen (EU) Nr. 228/2013, (EU) Nr. 652/2014 und (EU)',
  'Nr. 1143/2014 des Europäischen Parlaments und des Rates und zur Aufhebung der Richtlinien',
  '69/464/EWG, 74/647/EWG, 93/85/EWG, 98/57/EG, 2000/29/EG, 2006/91/EG und 2007/33/EG des Rates,',
  'ABl. L 317 vom 23.11.2016 S. 4, durchgeführt (CELEX-Nr. 32016R2031).',
  'Auswirkungen betreffend verschiedene Gruppen der Gesellschaft, insbesondere Frauen und',
  'Männer:',
  'Die vorgeschlagenen Regelungen haben keine unterschiedlichen Auswirkungen auf Frauen und Männer.',
]

/** sbg-34413 (Kinder- und Jugendhilfegesetz): „3. Übereinstimmung mit dem Unionsrecht", as the Erläuterungen' reader passes it. */
const SBG_GENERAL = [
  { heading: '2. Gesetzliche Grundlage', text: ['Die Zuständigkeit des Landes ergibt sich aus Art. 15 Abs 1 B-VG.'] },
  {
    heading: '3. Übereinstimmung mit dem Unionsrecht',
    text: ['Das Unionsrecht steht den vorgeschlagenen Regelungen nicht entgegen. Es werden erforderliche Änderungen/Neuerungen betreffend die Richtlinien des Europäischen Parlaments und des Rates vom 14. Mai 2024 zur Bekämpfung von Gewalt gegen Frauen und häuslicher Gewalt, ABl Nr 2024/1385, vom 24. Mai 2024, und zur Änderung der Richtlinie 2011/36/EU zur Verhütung und Bekämpfung des Menschenhandels und zum Schutz seiner Opfer, ABl Nr L 2024/1712 vom 24. Juni 2024, fristgerecht umgesetzt.'],
  },
  { heading: '4. Finanzielle Auswirkungen', text: ['Kostenträger der Kinder- und Jugendhilfe sind das Land Salzburg und die Gemeinden.'] },
]

/** sbg-34087: Ziffern of a quoted Umsetzungshinweis that the Erläuterungen' reader took for headings. */
const SBG_FALSE = [
  { heading: '3. Übereinstimmung mit EU-Recht', text: ['Das Unionsrecht steht dem Vorhaben nicht entgegen.'] },
  { heading: '16. Richtlinie (EU) 2022/2041 des Europäischen Parlaments und des Rates', text: ['vom 19. Oktober 2022 über angemessene Mindestlöhne in der Europäischen Union.'] },
  { heading: '17. Richtlinie (EU) 2024/1233 des Europäischen Parlaments und des Rates', text: ['vom 24. April 2024 über ein einheitliches Verfahren.'] },
]

const NO_LAW = { signal: null, acts: [] }

describe('the Land\'s EU heading', () => {
  it('normalises numbering, hyphens and the colon', () => {
    expect(normaliseLandHeading('3. Übereinstimmung mit dem EU-Recht:')).toBe('übereinstimmung mit dem eu-recht')
    expect(normaliseLandHeading('V. Verhältnis zu Rechtsvorschriften der Europäischen Union')).toBe('verhältnis zu rechtsvorschriften der europäischen union')
    expect(normaliseLandHeading('EU - (EWR-) Konformität')).toBe('eu-(ewr-) konformität')
    expect(normaliseLandHeading('c) Unionsrecht')).toBe('unionsrecht')
  })

  it('matches every spelling the corpus showed, one list for nine Länder', () => {
    for (const h of [
      'Verhältnis zu den Rechtsvorschriften der Europäischen Union', 'Verhältnis zu Rechtsvorschriften der Europäischen Union',
      'EU - (EWR-) Konformität', '4. EU-Konformität', '3. Übereinstimmung mit dem EU-Recht', '3. Übereinstimmung mit EU-Recht',
      'II. Übereinstimmung mit dem EU-Recht', '3. Übereinstimmung mit den Unionsrecht', 'B. Übereinstimmung mit Unionsrecht',
      '3. Vereinbarkeit mit dem Unionsrecht', '4. EU-Recht', 'Verhältnis zum Unionsrecht', 'Bezug zum Unionsrecht',
    ]) expect(isLandEuHeading(h), h).toBe(true)
  })

  it('takes no quoted Ziffer, no Europaschutzgebiet and no sentence for a heading', () => {
    for (const h of [
      '12. Richtlinie (EU) 2024/1233 des Europäischen Parlaments und des Rates', '2. Kurzbeschreibung des Europaschutzgebiets',
      '1. Zeiten, die Bedienstete in einem Mitgliedstaat der Europäischen Union', 'Mit dem Entwurf werden folgende Richtlinien umgesetzt',
      'Geplante Vorgehensweise bezüglich der OIB- Richtlinie 6',
    ]) expect(isLandEuHeading(h), h).toBe(false)
  })
})

describe('readLandEuStatement', () => {
  it('reads Steiermark\'s WFA with the Bund\'s reader, and names its act', () => {
    const s = readLandEuStatement([], STMK_WFA)!
    expect(s.road).toBe('vorblatt')
    expect(s.cls).toBe('frei-umsetzung')
    expect(statementActs(s).map((a) => a.celex)).toEqual(['32012L0018'])
    const d = decideLandEuMarker(s, [], NO_LAW)
    expect([d.marker, d.source, d.actsAllowed]).toEqual(['umsetzung', 'vorblatt', true])
  })

  it('reads Burgenland\'s Vorblatt without „den", a regulation carried out', () => {
    const s = readLandEuStatement([], BGLD_VORBLATT)!
    expect(s.road).toBe('vorblatt')
    expect(s.cls).toBe('flankierend-vo')
    expect(statementActs(s).map((a) => a.celex)).toEqual(['32016R2031'])
  })

  it('reads Salzburg\'s headed passage as the Land\'s Vorblatt', () => {
    const s = readLandEuStatement(SBG_GENERAL, [])!
    expect([s.road, s.heading, s.cls]).toEqual(['erlaeuterungen', '3. Übereinstimmung mit dem Unionsrecht', 'frei-umsetzung'])
    const d = decideLandEuMarker(s, SBG_GENERAL, NO_LAW)
    expect([d.marker, d.source, d.actsAllowed]).toEqual(['umsetzung', 'erlaeuterungen', true])
  })

  it('reads the real heading beside Salzburg\'s false ones, and only its text', () => {
    const s = readLandEuStatement(SBG_FALSE, null)!
    expect(s.sentence).toBe('Das Unionsrecht steht dem Vorhaben nicht entgegen.')
    expect(s.cls).toBe('frei-nein')
    expect(decideLandEuMarker(s, SBG_FALSE, NO_LAW).marker).toBeNull()
  })

  it('reads a statement in the Land\'s own words with the prose reader, still as the statement (sbg-34443)', () => {
    const general = [
      { heading: '1. Verordnungsinhalt', text: ['Die Richtlinie (EU) 2024/1233 ist bis 21. Mai 2026 umzusetzen.'] },
      { heading: '3. Übereinstimmung mit EU-Recht', text: ['Die vorgeschlagenen Regelungen dienen der Umsetzung von Unionsrecht.'] },
    ]
    const s = readLandEuStatement(general, null)!
    expect(s.cls).toBe('freitext')
    const d = decideLandEuMarker(s, general, NO_LAW)
    expect([d.marker, d.source, d.actsAllowed]).toEqual(['umsetzung', 'erlaeuterungen', true])
  })

  it('falls to the general part, naming nothing, where the unknown statement gives no signal either', () => {
    const general = [
      { heading: 'Allgemeines', text: ['Mit der Novelle wird die Richtlinie (EU) 2024/1233 umgesetzt.'] },
      { heading: '3. Übereinstimmung mit EU-Recht', text: ['Siehe die Ausführungen oben.'] },
    ]
    const d = decideLandEuMarker(readLandEuStatement(general, null), general, NO_LAW)
    expect([d.marker, d.source, d.actsAllowed]).toEqual(['umsetzung', 'erlaeuterungen', false])
  })

  it('leaves prose without a heading to the D5 road, which names no act', () => {
    const general = [{ heading: 'Allgemeines', text: ['Der vorliegende Gesetzesentwurf dient der Umsetzung der Richtlinie (EU) 2024/1785 im Landesrecht.'] }]
    expect(readLandEuStatement(general, ['Allgemeines', 'Der vorliegende Gesetzesentwurf dient der Umsetzung.'])).toBeNull()
    const d = decideLandEuMarker(null, general, NO_LAW)
    expect([d.marker, d.source, d.actsAllowed]).toEqual(['umsetzung', 'erlaeuterungen', false])
  })
})

describe('entryHinweise', () => {
  const entry = (heading: string, ...text: string[]) => ({ heading, text })

  it('names the acts of the implementing sentence, not a scope list in a sentence that describes the directives (ooe-2026-16120)', () => {
    const hints = entryHinweise([
      entry('Zu Art. II Z 11 (§ 14 Abs. 1):', 'Umsetzungshinweis: Durch § 14 Abs. 1 Oö. ADG und § 27 Abs. 1 Oö. GBG 2021 werden Art. 4 der Richtlinie (EU) 2024/1499 sowie der gleichlautende Art. 4 der Richtlinie (EU) 2024/1500 umgesetzt. Ziel dieser beiden Richtlinien ist es, die Wirksamkeit von Gleichbehandlungsstellen zu sichern.'),
      entry('Zu Art. II Z 12 (§ 14 Abs. 5):', 'Umsetzungshinweis: Art. 5 Abs. 2 der Richtlinie (EU) 2024/1499 sowie Art. 5 Abs. 2 der Richtlinie (EU) 2024/1500 sehen vor, dass Mitgliedstaaten sicherstellen, dass Gleichbehandlungsstellen befugt sind, Maßnahmen zur Verhinderung von Diskriminierung im Sinn der Richtlinien 79/7/EWG, 2000/43/EG, 2000/78/EG, 2004/113/EG sowie 2006/54/EG und 2010/41/EU durchzuführen.'),
      entry('Zu Art. III Z 27 (§ 27 Abs. 1):', 'Umsetzungshinweis: § 27 Abs. 1 setzt die Vorgaben gemäß Art. 4, Art. 5 Abs. 2 und 3 der Richtlinie (EU) 2024/1499 und (EU) 2024/1500 um; sh. Näheres in den Erläuterungen zu § 14 Oö. ADG.'),
    ])
    expect(hints.map((h) => h.acts.map((a) => a.celex))).toEqual([
      ['32024L1499', '32024L1500'],
      ['32024L1499', '32024L1500'],
    ])
  })
})
