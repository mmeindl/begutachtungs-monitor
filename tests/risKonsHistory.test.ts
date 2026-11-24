import { describe, expect, it } from 'vitest'
import { publishedAfter, versionPairFor } from '../server/utils/harness/risKonsHistory'
import type { KonsParagraphRef } from '../server/utils/ris/konsLaw'

/** One RIS version of a §: the day it took effect and the BGBl RIS names as its last amendment. */
function version(inkrafttreten: string, by: string | null, nor = `${inkrafttreten}|${by}`): KonsParagraphRef {
  return {
    nor,
    label: '§ 26',
    id: '26',
    inkrafttreten,
    ausserkrafttreten: null,
    kundmachungsorgan: by ? `BGBl. Nr. 400/1988 zuletzt geändert durch ${by}` : 'BGBl. Nr. 400/1988',
    stammnorm: null,
    gesetzesnummer: '10004570',
    xmlUrl: null,
  }
}

const day = (v: KonsParagraphRef | null) => (v ? `${v.inkrafttreten} ${v.kundmachungsorgan?.split('durch ')[1] ?? 'Stammfassung'}` : null)

describe('publishedAfter', () => {
  it('orders by year, then by number', () => {
    expect(publishedAfter('BGBl. I Nr. 88/2026', 'BGBl. I Nr. 62/2026')).toBe(true)
    expect(publishedAfter('BGBl. I Nr. 5/2026', 'BGBl. I Nr. 49/2025')).toBe(true)
    expect(publishedAfter('BGBl. I Nr. 144/2024', 'BGBl. I Nr. 62/2026')).toBe(false)
    expect(publishedAfter('BGBl. I Nr. 62/2026', 'BGBl. I Nr. 62/2026')).toBe(false)
  })

  it('knows nothing of a version without a BGBl', () => {
    expect(publishedAfter(null, 'BGBl. I Nr. 62/2026')).toBe(false)
  })
})

describe('versionPairFor', () => {
  // EStG § 26 as RIS lists it (24.11.2026): 88/2026 was issued after 62/2026
  // and took effect first; RIS rebuilt 01.01.2027 „zuletzt geändert durch
  // BGBl. I Nr. 88/2026" and kept 62/2026's own version on the older text.
  const estg = [
    version('2025-01-01', 'BGBl. I Nr. 110/2024'),
    version('2025-01-01', 'BGBl. I Nr. 144/2024'),
    version('2026-10-17', 'BGBl. I Nr. 88/2026'),
    version('2027-01-01', 'BGBl. I Nr. 62/2026'),
    version('2027-01-01', 'BGBl. I Nr. 88/2026'),
  ]

  it('builds on the text RIS built on, not on the later BGBl that took effect first', () => {
    const pair = versionPairFor(estg, 'BGBl. I Nr. 62/2026')!
    expect(day(pair.before)).toBe('2025-01-01 BGBl. I Nr. 144/2024')
    expect(day(pair.after)).toBe('2027-01-01 BGBl. I Nr. 62/2026')
    expect(pair.afters).toHaveLength(1)
  })

  it('reads the rebuild on either side of the day', () => {
    const swapped = [estg[0]!, estg[1]!, estg[2]!, estg[4]!, estg[3]!]
    expect(day(versionPairFor(swapped, 'BGBl. I Nr. 62/2026')!.before)).toBe('2025-01-01 BGBl. I Nr. 144/2024')
  })

  it('pairs the later BGBl with the version it was built on', () => {
    expect(day(versionPairFor(estg, 'BGBl. I Nr. 88/2026')!.before)).toBe('2025-01-01 BGBl. I Nr. 144/2024')
  })

  it('keeps the version before where no later BGBl rebuilt the day', () => {
    // RIS consolidated 62/2026 after 88/2026 and built on its text: no second version of 01.01.2027.
    const built = [estg[1]!, estg[2]!, estg[3]!]
    expect(day(versionPairFor(built, 'BGBl. I Nr. 62/2026')!.before)).toBe('2026-10-17 BGBl. I Nr. 88/2026')
  })

  it('keeps the plain case plain', () => {
    const plain = [version('1988-07-30', null), version('2024-10-10', 'BGBl. I Nr. 144/2024'), version('2026-10-17', 'BGBl. I Nr. 88/2026')]
    expect(day(versionPairFor(plain, 'BGBl. I Nr. 88/2026')!.before)).toBe('2024-10-10 BGBl. I Nr. 144/2024')
    expect(day(versionPairFor(plain, 'BGBl. I Nr. 144/2024')!.before)).toBe('1988-07-30 Stammfassung')
    expect(versionPairFor(plain, 'BGBl. I Nr. 62/2026')).toBeNull()
  })
})
