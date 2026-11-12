/** What a Landesgesetz changed, § by § (`landLawChanges.ts`): every doubt is a § not compared. */
import { describe, expect, it } from 'vitest'
import { instructionLawFor, lgblInstructedParagraphs, isNamed, konsKey, konsUnit, lgblNamedParagraphs, namesAsLast, pairOf, repealedBy, type LandKonsVersion } from '../server/utils/laender/landLawChanges'

const v = (over: Partial<LandKonsVersion>): LandKonsVersion => ({ gesetzesnummer: '20001217', law: 'Salzburger Kinderbildungs- und -betreuungsgesetz 2019', key: '§5', from: null, to: null, organ: '', xmlUrl: 'x', stammnorm: '57/2019', ...over })

describe('versions', () => {
  it('keys §§ and Artikel, not § 0 or Anlagen', () => {
    expect(konsKey('§ 5')).toBe('§5')
    expect(konsKey('§ 15a')).toBe('§15a')
    expect(konsKey('Art. 19')).toBe('Art.19')
    expect(konsKey('§ 0')).toBeNull()
    expect(konsKey('Anl. 1')).toBeNull()
  })
  it('takes a version as this LGBl’s only where it is named last, and not as the repeal', () => {
    expect(namesAsLast('LGBl Nr 57/2019 zuletzt geändert durch LGBl Nr 31/2026', '31/2026')).toBe(true)
    expect(namesAsLast('LGBl Nr 57/2019 zuletzt geändert durch LGBl Nr 131/2026', '31/2026')).toBe(false)
    expect(namesAsLast('LGBl Nr 31/2026 zuletzt geändert durch LGBl Nr 40/2026', '31/2026')).toBe(false)
    expect(repealedBy('LGBl Nr 57/2019 aufgehoben durch LGBl Nr 31/2026', '31/2026')).toBe(true)
  })
  it('pairs only the version that ended the day before, and says why otherwise', () => {
    const neu = v({ from: '2026-04-15', xmlUrl: 'n' })
    const old = v({ from: '2023-01-01', to: '2026-04-14', xmlUrl: 'o' })
    expect(pairOf(neu, [neu, old])).toEqual({ kind: 'pair', old })
    expect(pairOf(neu, [neu])).toEqual({ kind: 'new' })
    expect(pairOf(neu, [neu, v({ from: '2023-01-01', to: '2026-03-01', xmlUrl: 'o' })])).toEqual({ kind: 'unpaired', why: 'gap' })
    expect(pairOf(neu, [neu, old, v({ from: '2026-01-01', to: '2026-04-14', xmlUrl: 'p' })])).toEqual({ kind: 'unpaired', why: 'several' })
    expect(pairOf(v({ from: null }), [old])).toEqual({ kind: 'unpaired', why: 'no-date' })
    // Began before the Kundmachung and since replaced: possibly the wording this LGBl replaced (RIS Kärnten).
    expect(pairOf({ ...neu, to: '2026-09-30' }, [neu, old], '2026-05-01')).toEqual({ kind: 'unpaired', why: 'early' })
    // Retroactive and still in force: the version is this Landesgesetzblatt's.
    expect(pairOf({ ...neu, to: null }, [neu, old], '2026-05-01')).toEqual({ kind: 'pair', old })
    expect(pairOf(neu, [neu, old], neu.from)).toEqual({ kind: 'pair', old })
  })
})

describe('instructions', () => {
  it('names every § an instruction addresses, none of its quoted wording', () => {
    expect(lgblNamedParagraphs('§ 6 Abs. 1 Z 9 lautet:')).toEqual(['§6'])
    expect(lgblNamedParagraphs('In den §§ 5, 7 und 9a wird …')).toEqual(['§5', '§7', '§9a'])
    expect(lgblNamedParagraphs('Die §§ 48 bis 53 lauten:')).toEqual(['§48', '§53', '§48-53'])
    expect(lgblNamedParagraphs('Im § 3 Abs. 2 und im § 8 wird …')).toEqual(['§3', '§8'])
    expect(lgblNamedParagraphs('Nach § 5 wird folgender § 5a eingefügt: „§ 5a … § 99 …“')).toEqual(['§5', '§5a'])
  })
  it('groups by the Artikel’s law, and finds it for a Kurztitel in the genitive', () => {
    const z = (article: string | null, heading: string) => ({ article, articleNumber: null, id: 'Z1', heading, quotedHeadings: [], text: '', blocks: [], stammnorm: null })
    const m = lgblInstructedParagraphs([z('Änderung des Salzburger Kinderbildungs- und -betreuungsgesetzes 2019', '§ 5 lautet:')])
    expect(instructionLawFor('Salzburger Kinderbildungs- und -betreuungsgesetz 2019', [...m.keys()])).toBe('Änderung des Salzburger Kinderbildungs- und -betreuungsgesetzes 2019')
    expect(instructionLawFor('Jagdgesetz 1993', [...m.keys()])).toBeUndefined()
    expect(instructionLawFor('Jagdgesetz 1993', [null])).toBeNull()
    expect(instructionLawFor('Wiener Pflanzenschutzmittelgesetz', ['Artikel I'], 1)).toBe('Artikel I')
    expect(instructionLawFor('Wiener Pflanzenschutzmittelgesetz', ['Artikel I', 'Artikel II'], 2)).toBeUndefined()
  })
})

describe('isNamed', () => {
  it('reads a range', () => {
    expect(isNamed(new Set(['§48-53']), '§51a')).toBe(true)
    expect(isNamed(new Set(['§48-53']), '§54')).toBe(false)
  })
})

describe('konsUnit', () => {
  it('reads the § heading and its text, not the metadata', () => {
    const xml = '<risdok><nutzdaten><absatz typ="erltext" ct="kurztitel">X</absatz><ueberschrift typ="para" ct="text">Bedarfsplanung</ueberschrift><ueberschrift typ="para" ct="text">§ 5</ueberschrift><absatz typ="abs" ct="text">(1) Die Bedarfsplanung …</absatz><listelem ct="text"><symbol>1.</symbol>die Bestandserhebung,</listelem></nutzdaten></risdok>'
    const u = konsUnit(xml, { key: '§5', law: 'X' }, 'X')!
    expect(u).toMatchObject({ id: '§5', heading: 'Bedarfsplanung', article: 'X' })
    expect(u.blocks.map((b) => b.text)).toEqual(['(1) Die Bedarfsplanung …', '1. die Bestandserhebung,'])
  })
  it('drops RIS’s notes on Landesgesetzblätter, never the law’s own words about them', () => {
    const xml = '<nutzdaten><absatz typ="abs" ct="text"><gldsym>§ 5.</gldsym> (1) Der Fonds trägt die Bezeichnung „Fonds“. <i>(Anm: LGBl.Nr. 96/2017, 22/2025)</i></absatz>' +
      '<absatz typ="satz" ct="text">*) Fassung LGBl.Nr. 2/2006, 55/2011, 27/2019</absatz>' +
      '<absatz typ="satz" ct="text">Anm.: in der Fassung LGBl. Nr.&#160;102/2005, LGBl. Nr. 103/2018</absatz>' +
      '<absatz typ="satz" ct="text">Anm.: in der Fassung LGBl. Nr. 136/2016, (seit LGBl. Nr. 97/2020 Steiermärkisches Gesetz)</absatz>' +
      '<absatz typ="abs" ct="text">(3) entfallen <i>(Anm: entfallen auf Grund LGBl Nr 103/2022)</i></absatz>' +
      '<absatz typ="abs" ct="text">(16) In der Fassung der 16. Novelle, LGBl. Nr. 103/2018, treten § 26 und § 29 in Kraft.</absatz></nutzdaten>'
    expect(konsUnit(xml, { key: '§5', law: 'X' }, 'X')!.blocks.map((b) => b.text)).toEqual([
      '(1) Der Fonds trägt die Bezeichnung „Fonds“.',
      '(3) entfallen (Anm: entfallen auf Grund LGBl Nr 103/2022)',
      '(16) In der Fassung der 16. Novelle, LGBl. Nr. 103/2018, treten § 26 und § 29 in Kraft.',
    ])
  })
})
