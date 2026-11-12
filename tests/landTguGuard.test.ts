import { describe, expect, it } from 'vitest'
import type { LawDiffUnit } from '../shared/types'
import { lawBlocksFromPdfPages } from '../server/utils/laender/draftPdfLaw'
import { draftUnits } from '../server/utils/annex/annexDraft'
import { articleClauses, draftLawKey, guardTguUnits, installedDesignations } from '../server/utils/laender/landTguGuard'

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

  it('does not take a citation for a designation', () => {
    expect(installedDesignations('§ 5 Abs 2 lautet: „(2) Die Behörde hat gemäß § 7 Abs 1 zu entscheiden.“')).toEqual([])
    expect(installedDesignations('§ 5 lautet: „Die Frist nach § 7 beträgt …“')).toEqual([])
    // Not an instruction that writes anything.
    expect(installedDesignations('Im § 5 entfällt der „§ 7“ betreffende Satz.')).toEqual([])
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
