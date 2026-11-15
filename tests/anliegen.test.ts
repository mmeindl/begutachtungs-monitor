import { describe, expect, it } from 'vitest'
import { rootKey } from '../shared/utils/procedureRoot'
import {
  anliegenApiBase,
  anliegenCitation,
  anliegenItemType,
  anliegenKey,
  anliegenKindOf,
  anliegenKindOfSegment,
  anliegenParliamentUrl,
  anliegenPath,
  anliegenRootOf,
  anliegenRootOfHref,
} from '../shared/utils/anliegen'

describe('anliegenKindOf', () => {
  it('reads the three kinds off Parliament’s types', () => {
    expect(anliegenKindOf('PET', 'PET')).toBe('petition')
    expect(anliegenKindOf('BI', 'BI')).toBe('buergerinitiative')
    expect(anliegenKindOf('I', 'VOLKBG')).toBe('volksbegehren')
  })

  // A Regierungsvorlage is an `I` too: the type alone names no Volksbegehren.
  it('takes no other Beilage for a Volksbegehren', () => {
    expect(anliegenKindOf('I', 'RV')).toBeNull()
    expect(anliegenKindOf('I', null)).toBeNull()
    expect(anliegenKindOf('I', undefined)).toBeNull()
  })

  // Petitionen to the Bundesrat are not followed (measured 14.11.2026: 42,
  // none since April 2024); they must not pass as a Petition.
  it('reads a Petition an den Bundesrat and leaves everything else out', () => {
    expect(anliegenKindOf('PET-BR', 'PET-BR')).toBe('petition-bundesrat')
    expect(anliegenKindOf('A', 'A')).toBeNull()
    expect(anliegenKindOf(null, null)).toBeNull()
  })
})

describe('an Anliegen’s addresses', () => {
  const bi = { gp: 'XXVIII', kind: 'buergerinitiative', inr: 5 } as const
  const pet = { gp: 'XXVIII', kind: 'petition', inr: 21 } as const
  const vb = { gp: 'XXVIII', kind: 'volksbegehren', inr: 98 } as const

  it('names the kind in the path', () => {
    expect(anliegenPath(bi)).toBe('/anliegen/XXVIII/buergerinitiative/5')
    expect(anliegenPath(vb)).toBe('/anliegen/XXVIII/volksbegehren/98')
    expect(anliegenApiBase(pet)).toBe('/api/anliegen/XXVIII/petition/21')
  })

  it('leads to Parliament’s own page of the item', () => {
    expect(anliegenParliamentUrl(bi)).toBe('https://www.parlament.gv.at/gegenstand/XXVIII/BI/5')
    expect(anliegenParliamentUrl(vb)).toBe('https://www.parlament.gv.at/gegenstand/XXVIII/I/98')
  })

  it('cites as Parliament does: a Volksbegehren is a Beilage', () => {
    expect(anliegenCitation(pet)).toBe('21/PET')
    expect(anliegenCitation(bi)).toBe('5/BI')
    expect(anliegenCitation(vb)).toBe('98 d.B.')
  })

  it('maps kind and type both ways', () => {
    expect(anliegenItemType('petition')).toBe('PET')
    expect(anliegenItemType('volksbegehren')).toBe('I')
    expect(anliegenKindOfSegment('petition')).toBe('petition')
    expect(anliegenKindOfSegment('vorlage')).toBeNull()
  })

  it('reads a root off a path’s segments, and refuses what is none', () => {
    expect(anliegenRootOf('XXVIII', 'buergerinitiative', '5')).toEqual(bi)
    expect(anliegenRootOf('XXVIII', 'vorlage', '5')).toBeNull()
    expect(anliegenRootOf('XXVIII', 'petition', '0')).toBeNull()
    expect(anliegenRootOf('XXVIII', 'petition', '5a')).toBeNull()
    expect(anliegenRootOf('BR', 'petition', '56')).toBeNull()
  })

  // A Volksbegehren shares the Beilagen's number space, so its key is the
  // one a Vorlage of that number would have — and no Vorlage has it.
  it('keys by Parliament’s type, apart from a draft of the same number', () => {
    expect(anliegenKey(bi)).toBe('XXVIII-BI-5')
    expect(anliegenKey(pet)).toBe('XXVIII-PET-21')
    expect(anliegenKey(vb)).toBe('XXVIII-I-98')
    expect(anliegenKey(bi)).not.toBe(rootKey({ gp: 'XXVIII', ityp: 'ME', inr: 5 }))
  })
})

describe('anliegenRootOfHref', () => {
  // The predecessor's url in `reference[]` („Neuverteilung gem. § 21 Abs. 1a GOG-NR").
  it('reads an item path, relative or on Parliament’s host', () => {
    expect(anliegenRootOfHref('/gegenstand/XXVII/BI/53')).toEqual({ gp: 'XXVII', kind: 'buergerinitiative', inr: 53 })
    expect(anliegenRootOfHref('https://www.parlament.gv.at/gegenstand/XXVIII/PET/21?json=True')).toEqual({ gp: 'XXVIII', kind: 'petition', inr: 21 })
    expect(anliegenRootOfHref('/gegenstand/XXVII/I/2547')).toEqual({ gp: 'XXVII', kind: 'volksbegehren', inr: 2547 })
  })

  // The successor as the carry-over line cites it: „(5/BI/XXVI. GP)", „(2 d.B./XXVIII. GP)".
  it('reads the carry-over line’s citation', () => {
    expect(anliegenRootOfHref('5/BI/XXVI. GP')).toEqual({ gp: 'XXVI', kind: 'buergerinitiative', inr: 5 })
    expect(anliegenRootOfHref('2 d.B./XXVIII. GP')).toEqual({ gp: 'XXVIII', kind: 'volksbegehren', inr: 2 })
  })

  it('refuses everything else', () => {
    expect(anliegenRootOfHref('/gegenstand/XXVIII/A/5')).toBeNull()
    // „BR" only with „PET-BR", „PET-BR" only under „BR".
    expect(anliegenRootOfHref('/gegenstand/BR/PET/56')).toBeNull()
    expect(anliegenRootOfHref('/gegenstand/XXVII/PET-BR/56')).toBeNull()
    expect(anliegenRootOfHref('https://example.org/gegenstand/XXVIII/BI/5')).toBeNull()
    expect(anliegenRootOfHref('/gegenstand/XXVIII/BI/0')).toBeNull()
    expect(anliegenRootOfHref(null)).toBeNull()
  })
})

describe('the periods the list offers', () => {
  // XXII, where the reader's measurement starts (15.11.2026), up to the running period; nothing older.
  it('offers the running period down to XXII, and reads `?gp=` against it', async () => {
    const { anliegenListGps, anliegenListGpOf, ANLIEGEN_FIRST_LIST_GP } = await import('../shared/utils/anliegen')
    const { VOLKSBEGEHREN_FIRST_GP } = await import('../server/utils/parliament/anliegen')
    expect(anliegenListGps('XXVIII')).toEqual(['XXVIII', 'XXVII', 'XXVI', 'XXV', 'XXIV', 'XXIII', 'XXII'])
    // Equal by measurement, two constants on purpose.
    expect(ANLIEGEN_FIRST_LIST_GP).toBe(VOLKSBEGEHREN_FIRST_GP)
    expect(anliegenListGpOf('XXVII', 'XXVIII')).toBe('XXVII')
    expect(anliegenListGpOf('XXIV', 'XXVIII')).toBe('XXIV')
    expect(anliegenListGpOf('XXI', 'XXVIII')).toBe('')
    expect(anliegenListGpOf('XXI', null)).toBe('')
    expect(anliegenListGpOf('XXIX', 'XXVIII')).toBe('')
    expect(anliegenListGpOf('foo', null)).toBe('')
    expect(anliegenListGpOf(['XXVI'], null)).toBe('XXVI')
  })
})
