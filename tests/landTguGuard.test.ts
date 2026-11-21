import { describe, expect, it } from 'vitest'
import type { LawDiffUnit } from '../shared/types'
import { lawBlocksFromPdfPages } from '../server/utils/laender/draftPdfLaw'
import { draftUnits } from '../server/utils/annex/annexDraft'
import { articleClauses, draftLawKey, draftUncheckedReason, guardTguUnits, installedDesignations, notHeld, refusedAddress, repeatsItsNumber } from '../server/utils/laender/landTguGuard'
import { STRICT_UNCHECKED } from '../server/utils/laender/landTguStrict'

const unit = (over: Partial<LawDiffUnit>): LawDiffUnit => ({
  article: null, articleKey: null, fromArticleKey: null, id: '§5', fromId: '§5', heading: null, quotedHeading: null,
  change: 'changed', editorial: false, fromText: '', toText: '', segments: null, ...over,
})

/** A Salzburg-shaped Novelle: one § restated, one inserted the Land's way. */
const DRAFT = [
  'Gesetz vom ……, mit dem das Fischereigesetz 2002 geändert wird',
  'Der Salzburger Landtag hat beschlossen:',
  'Das Fischereigesetz 2002, LGBl Nr 81/2002, wird geändert wie folgt:',
  '1. § 5 Abs 2 lautet:',
  '„(2) Die Landesregierung hat die Fischereiberechtigten über jede Änderung der Schonzeiten rechtzeitig schriftlich zu informieren und ihnen Gelegenheit zur Stellungnahme zu geben.“',
  '2. Nach § 21 wird eingefügt:',
  '„Maßnahmengebiete',
  '§ 21a',
  '(1) Der Landesfischereiverband kann durch Verordnung Teilbereiche oder eine Gesamtfläche von Fischwässern zu Maßnahmengebieten erklären und in diesen angepasste Maßnahmen festlegen.“',
].join('\n')
const blocks = lawBlocksFromPdfPages([DRAFT])!

describe('installedDesignations', () => {
  it('reads the § a payload opens with, after a heading or right after the quote', () => {
    expect(installedDesignations('Nach § 21 wird eingefügt: „Maßnahmengebiete § 21a (1) Der Landesfischereiverband …“')).toEqual(['§ 21a'])
    expect(installedDesignations('Nach § 20 wird ein neuer § 20a samt Überschrift eingefügt: „§ 20a Verweisungen (1) Soweit …“')).toEqual(['§ 20a'])
    expect(installedDesignations('Die bisherigen §§ 11 und 12 erhalten die Bezeichnung „§ 7“ und „§ 8“ und lauten: „§ 7 Bestellung (1) Die …“')).toEqual(['§ 7', '§ 8'])
    // A heading with a number in it, and a second § of the same payload after a sentence's end.
    expect(installedDesignations('Nach § 4 wird eingefügt: „Natura 2000-Landschaftspflegepläne § 4a (1) Zur Erhaltung … zu beachten. Gigabit-Netze § 4b (1) In …“')).toEqual(['§ 4a', '§ 4b'])
  })

  it('reads the verb past a place the instruction quotes before its payload (Oö. 2026-16124 § 44a, 21.11.2026)', () => {
    expect(installedDesignations('Nach der Überschrift „VII. Abschnitt - Schluss- und Übergangsbestimmungen“ wird folgender neuer § 44a eingefügt: „§ 44a Verweise (1) Soweit in diesem Landesgesetz …“')).toEqual(['§ 44a'])
    // A verb inside a quote is no verb of the instruction, nor a sub-instruction's after the first quote: a citation replaced is no § installed (Salzburg 32075, § 18).
    expect(installedDesignations('Im § 5 wird die Wortfolge „wird eingefügt“ gestrichen: „§ 7 Bestellung“')).toEqual([])
    expect(installedDesignations('Im § 18 werden folgende Änderungen vorgenommen: 15.1. In der Z 6 wird nach dem Wort „bereitstellt“ die Wortfolge „oder verwendet“ eingefügt. 15.2. Im Abs 3 wird das Zitat „§ 8c“ durch das Zitat „§ 8d“ ersetzt.')).toEqual([])
  })

  it('does not take a citation for a designation', () => {
    expect(installedDesignations('§ 5 Abs 2 lautet: „(2) Die Behörde hat gemäß § 7 Abs 1 zu entscheiden.“')).toEqual([])
    expect(installedDesignations('§ 5 lautet: „Die Frist nach § 7 beträgt …“')).toEqual([])
    // Not an instruction that writes anything.
    expect(installedDesignations('Im § 5 entfällt der „§ 7“ betreffende Satz.')).toEqual([])
  })
})

describe('refusedAddress — the § an instruction opens with, where the draft reader read none (21.11.2026)', () => {
  const draftUnit = (text: string, paras: string[] = []) => ({ law: null, id: 'Z1', paras, aliases: [], reason: paras.length ? null : 'keine auflösbare Adresse', text, adds: false })

  it('names the one § the line opens with (Oö. 2026-16123 § 41, 2026-16122 § 88, Salzburg 35597 § 55)', () => {
    expect(refusedAddress(draftUnit('Im § 41 wird im Abs. 1 das Zitat „BGBl. I Nr. 135/2023“ durch das Zitat „BGBl. I Nr. 50/2025“ und im Abs. 7 das Zitat „BGBl. I Nr. 88/2023“ durch das Zitat „BGBl. I Nr. 50/2025“ ersetzt.'))).toEqual(['§ 41'])
    expect(refusedAddress(draftUnit('In § 88 Abs. 3a wird der Punkt nach dem letzten Spiegelstrich durch einen Strichpunkt ersetzt und folgender Spiegelstrich angefügt: „- Text“'))).toEqual(['§ 88'])
    expect(refusedAddress(draftUnit('Im § 55 Abs 1 werden die beiden ersten Sätze durch folgende Bestimmungen ersetzt: „In jedes Wahllokal … nach § 12 …“'))).toEqual(['§ 55'])
  })

  it('names nothing where the reader read a §, the line names a second §, or opens with an anchor', () => {
    expect(refusedAddress(draftUnit('Im § 41 wird das Wort „a“ durch das Wort „b“ ersetzt.', ['§ 41']))).toEqual([])
    expect(refusedAddress(draftUnit('Im § 41 Abs. 1 und im § 42 Abs. 2 wird jeweils das Wort „a“ durch das Wort „b“ ersetzt.'))).toEqual([])
    expect(refusedAddress(draftUnit('In den §§ 38 bis 45a wird das Wort „a“ durch das Wort „b“ ersetzt.'))).toEqual([])
    expect(refusedAddress(draftUnit('Nach § 13 wird eingefügt: „§ 13a Text“'))).toEqual([])
  })

  it('holds the § word for word against the instruction (Oö. 2026-16123 § 41)', () => {
    const draft = lawBlocksFromPdfPages([[
      'Landesgesetz, mit dem das Oö. Jagdgesetz 2024 geändert wird', 'Der Oö. Landtag hat beschlossen:', 'Artikel I',
      'Das Oö. Jagdgesetz 2024, LGBl. Nr. 1/2024, wird wie folgt geändert:',
      '1. Im § 41 wird im Abs. 1 das Zitat „BGBl. I Nr. 135/2023“ durch das Zitat „BGBl. I Nr. 50/2025“, im Abs. 5 Z 2 erster Satz das Wort „Tiere“ durch das Wort „Katzen“ und im Abs. 7 das Zitat „BGBl. I Nr. 88/2023“ durch das Zitat „BGBl. I Nr. 50/2025“ ersetzt.',
    ].join('\n')])!
    expect(draftUnits(draft)[0]!.paras).toEqual([])
    const shown = unit({ id: '§41', fromId: '§41', fromText: 'x', toText: 'y', segments: [
      { type: 'equal', text: '(1) Es gilt das Tierschutzgesetz, BGBl. I Nr. 118/2004, zuletzt geändert durch das Bundesgesetz BGBl. I Nr. ' },
      { type: 'removed', text: '135/2023' }, { type: 'inserted', text: '50/2025' },
      { type: 'equal', text: '. (5) Das Jagdschutzorgan darf 2. Hunde und ' }, { type: 'removed', text: 'Tiere' }, { type: 'inserted', text: 'Katzen' }, { type: 'equal', text: ' töten.' },
    ] })
    expect(guardTguUnits([shown], draft).strict.get(0)!.state).toBe('holds')
  })
})

describe('an instruction\'s „§ 24 b" (Salzburg 32075; 21.11.2026)', () => {
  it('is read as § 24b, never as § 24, and „§§ 46 f" stays „und folgende"', () => {
    const draft = lawBlocksFromPdfPages([[
      'Gesetz vom ……, mit dem das Baupolizeigesetz 1997 geändert wird', 'Der Salzburger Landtag hat beschlossen:', 'Das Baupolizeigesetz 1997 wird geändert wie folgt:',
      '1. Im § 24 b wird nach Abs 13 folgender Abs 14 angefügt:', '„(14) Die §§ 46 f gelten für anhängige Bauverfahren sinngemäß.“',
    ].join('\n')])!
    const shown = unit({ id: '§24b', fromId: '§24b', fromText: '(13) Alt.', toText: '(13) Alt. (14) Die §§ 46 f gelten für anhängige Bauverfahren sinngemäß.', segments: [
      { type: 'equal', text: '(13) Alt. ' }, { type: 'inserted', text: '(14) Die §§ 46 f gelten für anhängige Bauverfahren sinngemäß.' },
    ] })
    expect(guardTguUnits([shown], draft).strict.get(0)!.state).toBe('holds')
  })
})

describe('draftLawKey', () => {
  it('names a package law by its declined Artikel title, or an untitled Artikel by its clause', () => {
    const keys = ['Artikel 1 Änderung des Tiroler Raumordnungsgesetzes 2022', 'Artikel 2 Änderung der Tiroler Bauordnung 2022']
    expect(draftLawKey('Tiroler Raumordnungsgesetz 2022', keys)).toBe(keys[0])
    const clauses = new Map([['Artikel I', 'Das Oö. Sozialhilfe-Ausführungsgesetz, LGBl. Nr. 107/2019, wird wie folgt geändert:'], ['Artikel II', 'Das Oö. Sozialhilfegesetz 1998, LGBl. Nr. 82/1998, wird wie folgt geändert:']])
    expect(draftLawKey('Oö. Sozialhilfegesetz 1998', ['Artikel I', 'Artikel II'], clauses)).toBe('Artikel II')
  })

  it('is undefined — the whole draft — where it cannot be named with certainty', () => {
    expect(draftLawKey('Oö. Informations- und Datenschutzgesetz', ['Artikel I Landesgesetz zur Umsetzung …', 'Artikel II Änderung des Oö. ADIG'])).toBeUndefined()
    expect(draftLawKey(null, ['Artikel I', 'Artikel II'])).toBeUndefined()
    expect(draftLawKey('Fischereigesetz 2002', [null])).toBeNull()
  })

  it('reads an untitled Artikel up to its first instruction', () => {
    const b = lawBlocksFromPdfPages(['Der Landtag hat beschlossen:\nArtikel I\nDas Oö. Sozialhilfegesetz 1998, LGBl. Nr. 82/1998, wird wie folgt geändert:\n1. § 5 lautet:\n„§ 5 Text“'])!
    expect(articleClauses(b).get('Artikel I')).toContain('Oö. Sozialhilfegesetz 1998')
  })
})

describe('guardTguUnits', () => {
  it('passes a § whose new words the draft carries for it — also one the Land inserts its way', () => {
    const restated = unit({
      id: '§5',
      fromText: '(2) Die Landesregierung hat die Fischereiberechtigten zu hören.',
      toText: '(2) Die Landesregierung hat die Fischereiberechtigten über jede Änderung der Schonzeiten rechtzeitig schriftlich zu informieren und ihnen Gelegenheit zur Stellungnahme zu geben.',
      segments: [
        { type: 'equal', text: '(2) Die Landesregierung hat die Fischereiberechtigten ' },
        { type: 'removed', text: 'zu hören.' },
        { type: 'inserted', text: 'über jede Änderung der Schonzeiten rechtzeitig schriftlich zu informieren und ihnen Gelegenheit zur Stellungnahme zu geben.' },
      ],
    })
    const inserted = unit({ id: '§21a', fromId: null, change: 'inserted', toText: '(1) Der Landesfischereiverband kann durch Verordnung Teilbereiche oder eine Gesamtfläche von Fischwässern zu Maßnahmengebieten erklären und in diesen angepasste Maßnahmen festlegen.' })
    // The Bund's grammar addresses the Land's insertion to its anchor alone — the gap `installedDesignations` closes.
    expect(draftUnits(blocks).find((u) => /Nach § 21/.test(u.text))!.paras).toEqual(['§ 21'])
    const guard = guardTguUnits([restated, inserted], blocks)
    expect(guard.read).toBe(true)
    expect(guard.checks.get(0)!.newWords).toBeGreaterThanOrEqual(10)
    expect(guard.checks.get(0)!.notInDraft).toBe(false)
    expect(guard.checks.get(1)!.newWords).toBeGreaterThanOrEqual(10)
    expect(guard.checks.get(1)!.notInDraft).toBe(false)
  })

  it('fires on new text the draft does not order for the §, with the Bund thresholds', () => {
    const foreign = unit({
      id: '§5',
      fromText: '(2) Die Landesregierung hat die Fischereiberechtigten zu hören.',
      toText: '(2) Die Landesregierung hat die Fischereiberechtigten zu hören. Die Gemeinde hat binnen vierzehn Tagen ein Verzeichnis sämtlicher Kraftfahrzeuge samt Kennzeichen elektronisch an die Bezirkshauptmannschaft zu übermitteln.',
      segments: [
        { type: 'equal', text: '(2) Die Landesregierung hat die Fischereiberechtigten zu hören. ' },
        { type: 'inserted', text: 'Die Gemeinde hat binnen vierzehn Tagen ein Verzeichnis sämtlicher Kraftfahrzeuge samt Kennzeichen elektronisch an die Bezirkshauptmannschaft zu übermitteln.' },
      ],
    })
    const check = guardTguUnits([foreign], blocks).checks.get(0)!
    expect(check.notInDraft).toBe(true)
    expect(check.missing).toContain('kraftfahrzeuge')
  })

  it('is silent below the floor, and disarmed where the draft could not be read', () => {
    const small = unit({ fromText: 'a', toText: 'a Kraftfahrzeuge Kennzeichen', segments: [{ type: 'equal', text: 'a ' }, { type: 'inserted', text: 'Kraftfahrzeuge Kennzeichen' }] })
    expect(guardTguUnits([small], blocks).checks.get(0)!.notInDraft).toBe(false)
    const unread = guardTguUnits([small], null)
    expect(unread.read).toBe(false)
    expect(unread.checks.get(0)!.notInDraft).toBe(false)
  })

  it('asks nothing of an unchanged or removed §', () => {
    const guard = guardTguUnits([unit({ change: 'unchanged' }), unit({ change: 'removed', fromText: 'x' })], blocks)
    expect(guard.checks.size).toBe(0)
  })
})

describe('notHeld — „nicht geprüft" at a § shown whose new text was not held word for word (20.11.2026)', () => {
  const restated = unit({
    id: '§5',
    fromText: '(2) Die Landesregierung hat die Fischereiberechtigten zu hören.',
    toText: '(2) Die Landesregierung hat die Fischereiberechtigten über jede Änderung der Schonzeiten rechtzeitig schriftlich zu informieren und ihnen Gelegenheit zur Stellungnahme zu geben.',
    segments: [
      { type: 'equal', text: '(2) Die Landesregierung hat die Fischereiberechtigten ' },
      { type: 'removed', text: 'zu hören.' },
      { type: 'inserted', text: 'über jede Änderung der Schonzeiten rechtzeitig schriftlich zu informieren und ihnen Gelegenheit zur Stellungnahme zu geben.' },
    ],
  })
  /* § 9: no instruction of the draft names it; two new words, so the bag rule says nothing either. */
  const unnamed = unit({ id: '§9', fromId: '§9', fromText: 'a', toText: 'a Kraftfahrzeuge Kennzeichen', segments: [{ type: 'equal', text: 'a ' }, { type: 'inserted', text: 'Kraftfahrzeuge Kennzeichen' }] })
  /* § 12: changed, but its word difference was not computed (`MAX_DP_CELLS`). */
  const undiffed = unit({ id: '§12', fromId: '§12', fromText: 'alt', toText: 'neu', segments: null })

  it('marks nothing the strict check held', () => {
    const guard = guardTguUnits([restated], blocks)
    expect(guard.strict.get(0)!.state).toBe('holds')
    expect(notHeld(guard)).toEqual(new Map())
  })

  it('marks a § the strict check could not hold, whatever the bag rule said, with a reason true of it', () => {
    const guard = guardTguUnits([restated, unnamed, undiffed, unit({ id: '§3', change: 'unchanged' }), unit({ id: '§4', change: 'removed', fromText: 'x' })], blocks)
    expect(guard.checks.get(1)!.notInDraft).toBe(false)
    expect(notHeld(guard)).toEqual(new Map([[1, 'unassigned'], [2, 'long']]))
  })

  it('marks every § shown as changed or new where the draft yields no law text, and none unchanged or removed', () => {
    const units = [restated, unit({ id: '§21a', fromId: null, change: 'inserted', toText: 'Neu.' }), unit({ id: '§3', change: 'unchanged' }), unit({ id: '§4', change: 'removed', fromText: 'x' })]
    for (const read of [null, []]) expect(notHeld(guardTguUnits(units, read))).toEqual(new Map([[0, 'draftUnread'], [1, 'draftUnread']]))
  })

  it('does not mark a § the rules withhold: that one is not shown', () => {
    const foreign = unit({
      id: '§5',
      fromText: '(2) Die Landesregierung hat die Fischereiberechtigten zu hören.',
      toText: '(2) Die Landesregierung hat die Fischereiberechtigten zu hören. Die Gemeinde hat binnen vierzehn Tagen ein Verzeichnis sämtlicher Kraftfahrzeuge samt Kennzeichen elektronisch an die Bezirkshauptmannschaft zu übermitteln.',
      segments: [
        { type: 'equal', text: '(2) Die Landesregierung hat die Fischereiberechtigten zu hören. ' },
        { type: 'inserted', text: 'Die Gemeinde hat binnen vierzehn Tagen ein Verzeichnis sämtlicher Kraftfahrzeuge samt Kennzeichen elektronisch an die Bezirkshauptmannschaft zu übermitteln.' },
      ],
    })
    expect(notHeld(guardTguUnits([foreign], blocks))).toEqual(new Map())
  })

  it('maps every reason the strict check gives to one of the reader\'s', () => {
    for (const reason of Object.values(STRICT_UNCHECKED)) expect(['unassigned', 'wording', 'long']).toContain(draftUncheckedReason(reason))
    expect(draftUncheckedReason(`${STRICT_UNCHECKED.quoteRole}„Pflicht“ in der jeweiligen grammatikalischen Form`)).toBe('wording')
  })
})

// Salzburg 22320, Artikel V (Landesbeamten-Pensionsgesetz): two instructions
// numbered „2.", read as one unit under § 74. Once § 74 was shown, § 79 came
// out „nicht im Entwurf" although the draft prints its Abs. 19 word for word.
describe('two instructions under one number (14.11.2026)', () => {
  const TWICE = [
    'Gesetz vom ……, mit dem das Landesbeamten-Pensionsgesetz geändert wird',
    'Der Salzburger Landtag hat beschlossen:',
    'Das Landesbeamten-Pensionsgesetz, LGBl Nr 17/2001, wird geändert wie folgt:',
    '1. § 40 Abs 6 entfällt.',
    '2. Im § 74 lautet die Z 1:',
    '„1. Allgemeines bürgerliches Gesetzbuch (ABGB), JGS Nr 946/1811; Gesetz BGBl I Nr 16/2020;“',
    '2. In § 79 wird folgender Abs 19 angefügt:',
    '„(19) § 40 Abs 1, 3, 4 und 5 und § 74 in der Fassung des Gesetzes LGBl Nr …/2020 treten mit dem auf die Kundmachung dieses Gesetzes folgenden Monatsersten in Kraft. Mit diesem Zeitpunkt wird auch der Entfall von § 40 Abs 6 wirksam.“',
  ].join('\n')
  const b = lawBlocksFromPdfPages([TWICE])!

  it('knows the unit that holds both', () => {
    expect(draftUnits(b).filter(repeatsItsNumber).map((u) => u.paras)).toEqual([['§ 74']])
    expect(repeatsItsNumber({ id: 'Z2', text: 'In § 1 werden folgende Änderungen vorgenommen: 2.1. Abs 2 entfällt. 2.2. In Abs 3 Z 1 entfällt der Ausdruck „x“.' })).toBe(false)
    expect(repeatsItsNumber({ id: 'Z1', text: 'Im Inhaltsverzeichnis entfällt der 1. Abschnitt samt den dazugehörigen Einträgen.' })).toBe(false)
  })

  it('does not hold the second § to the first one\'s words', () => {
    const u79 = unit({ id: '§79', fromId: '§79', fromText: '', toText: '(19) § 40 Abs 1, 3, 4 und 5 und § 74 in der Fassung des Gesetzes LGBl Nr …/2020 treten mit dem auf die Kundmachung dieses Gesetzes folgenden Monatsersten in Kraft. Mit diesem Zeitpunkt wird auch der Entfall von § 40 Abs 6 wirksam.', change: 'inserted' })
    const u74 = unit({ id: '§74', fromId: '§74', fromText: '1. ABGB, JGS Nr 946/1811; Gesetz BGBl I Nr 100/2018;', toText: '1. Allgemeines bürgerliches Gesetzbuch (ABGB), JGS Nr 946/1811; Gesetz BGBl I Nr 16/2020;', change: 'changed' })
    const g = guardTguUnits([u74, u79], b)
    expect(g.checks.get(1)?.newWords).toBeGreaterThan(10)
    expect(g.checks.get(1)?.notInDraft).toBe(false)
  })
})
