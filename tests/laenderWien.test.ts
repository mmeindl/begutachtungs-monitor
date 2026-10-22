import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decodeWien, parseWienList, parseWienStatements } from '../server/utils/laender/wien'
import { LandSourceError } from '../server/utils/laender/gate'

const fixture = (name: string) => decodeWien(readFileSync(new URL(`./fixtures/laender/${name}`, import.meta.url)))
const LIST = fixture('wien-2026-10-22.html')
const STATEMENTS = fixture('wien-stellungnahmen-2026-10-22.html')

describe('Wien — the page, as served on 22.10.2026', () => {
  const entries = parseWienList(LIST)

  it('reads every entry still on the page, running and ended, and none that is commented out', () => {
    expect(entries.map((e) => e.draft.id)).toEqual(['w-2026009', 'w-2026008', 'w-2026007', 'w-2026006', 'w-2026003'])
  })

  it('reads start and end of the Frist, and who takes the Stellungnahmen', () => {
    const [reinhalte] = entries
    expect(reinhalte!.draft).toMatchObject({
      title: 'Gesetz, mit dem das Wiener Reinhaltegesetz geändert wird',
      kind: 'gesetz',
      startedAt: '2026-10-09',
      deadline: '2026-11-06',
      url: 'https://www.wien.gv.at/recht/landesrecht-wien/begutachtung/pdf/2026009.pdf',
    })
    expect(reinhalte!.recipient).toBe('Magistratsabteilung 22')
    expect(reinhalte!.address).toBe('post@ma22.wien.gv.at')
  })

  it('keeps every version with its date, the newest as the one to read', () => {
    const pflanzenschutz = entries.find((e) => e.draft.id === 'w-2026003')!.draft
    expect(pflanzenschutz.documents.map((d) => [d.title, d.date])).toEqual([
      ['Entwurf, Stand 18.03.2026', '2026-03-18'],
      ['Entwurf, Stand 05.05.2026', '2026-05-05'],
    ])
    expect(pflanzenschutz.url).toMatch(/2026003-05052026\.pdf$/)
  })

  it('tells a Verordnung from a Gesetz by its title', () => {
    expect(entries.find((e) => e.draft.id === 'w-2026007')!.draft.kind).toBe('verordnung')
  })

  it('refuses a page without its two sections, and an entry without an address', () => {
    expect(() => parseWienList('<html><body>Wartung</body></html>')).toThrow(LandSourceError)
    expect(() => parseWienList(LIST.replace(/<a href=mailto:post@ma22[^>]*>/, ''))).toThrow(LandSourceError)
  })
})

describe('Wien — published Stellungnahmen', () => {
  it('reads those of one draft, names as Wien writes them', () => {
    const statements = parseWienStatements(STATEMENTS, '2026007')
    expect(statements).toHaveLength(25)
    expect(statements[0]).toEqual({ name: 'Landwirtschaftskammer Wien', url: 'https://www.wien.gv.at/recht/landesrecht-wien/begutachtung/pdf/2026007s1.pdf' })
    expect(statements.map((s) => s.name)).toContain('Wiener Pflege- und Patient*innenanwaltschaft')
    // „&gt;AUGE Wien" in Wien's markup: the stray mark never reaches a name.
    expect(statements.some((s) => s.name?.startsWith('>'))).toBe(false)
  })

  it('has none for a draft without any', () => {
    expect(parseWienStatements(STATEMENTS, '2026009')).toEqual([])
  })
})
