import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { deadlinesQuery, measuresQuery, parseUmsetzung, publicMeasureUrl, titlesQuery } from '../server/utils/eu/cellarUmsetzung'
import type { SparqlAnswer } from '../server/utils/eu/cellar'

/* Directives a country has to transpose (step 7): the Cellar's answers of
 * 15.11.2026, cut to five directives (tests/fixtures/eu-umsetzung). */

const fixture = (name: string): SparqlAnswer => JSON.parse(readFileSync(new URL(`./fixtures/eu-umsetzung/${name}.json`, import.meta.url), 'utf8'))
const list = (country: 'AUT' | 'DEU' | null) =>
  parseUmsetzung(fixture('fristen'), fixture('titel'), country ? fixture(`massnahmen-${country}`) : null)
const of = (rows: ReturnType<typeof list>, celex: string) => rows.find((r) => r.celex === celex)!

describe('parseUmsetzung', () => {
  it('lists every directive of the window by deadline, whether or not a measure was notified', () => {
    const rows = list('AUT')
    expect(rows.map((r) => r.celex)).toEqual(['32024L0299', '32024L1069', '32024L1346', '32024L1760', '32025L0516'].sort((a, b) => of(rows, a).deadline.localeCompare(of(rows, b).deadline) || a.localeCompare(b)))
    expect(rows.map((r) => r.deadline)).toEqual([...rows.map((r) => r.deadline)].sort())
    // Nothing notified is an empty list, not a missing directive.
    expect(of(rows, '32024L1069')).toMatchObject({ deadline: '2026-05-07', otherDates: [], measures: [], form: 'richtlinie' })
    expect(of(rows, '32024L1069').title).toMatch(/^Richtlinie \(EU\) 2024\/1069 /)
  })

  it('prints the latest date as the deadline and keeps the earlier ones (rule D3)', () => {
    expect(of(list('AUT'), '32025L0516')).toMatchObject({ deadline: '2028-07-01', otherDates: ['2025-04-14', '2026-12-31', '2027-01-01', '2028-06-30'] })
  })

  it('names the form the Cellar gives a directive', () => {
    expect(of(list('AUT'), '32024L0299').form).toBe('delegierte-richtlinie')
  })

  it('reads a notified measure as notified: title, kind, day, gazette, address', () => {
    const m = of(list('AUT'), '32024L1760').measures!
    expect(m).toHaveLength(2)
    expect(m[0]).toMatchObject({
      kind: 'Bundesgesetz',
      notified: '2026-01-19',
      gazette: { number: 'BGBl. I Nr. 65/2018', date: '2018-08-20' },
    })
    expect(m[0]!.title).toMatch(/^Bundesgesetz über die Vergabe von Aufträgen \(Bundesvergabegesetz 2018\);/)
    expect(m[0]!.title).not.toMatch(/\n/)
    expect(m[0]!.url).toMatch(/^https:\/\/www\.ris\.bka\.gv\.at\//)
    // By day of notification.
    expect(m.map((x) => x.notified)).toEqual(['2026-01-19', '2026-06-19'])
    expect(m[1]).toMatchObject({ kind: 'Landesgesetz', url: null })
  })

  it('passes on no address into the federal intranet', () => {
    const m = of(list('AUT'), '32024L1346').measures!
    expect(m).toHaveLength(5)
    expect(m.filter((x) => x.url === null).length).toBeGreaterThanOrEqual(2)
    expect(m.every((x) => !x.url || !x.url.includes('intra'))).toBe(true)
    expect(publicMeasureUrl('https://ris.bka.intra.gv.at/GeltendeFassung.wxe?x=1')).toBeNull()
    expect(publicMeasureUrl('http://www.ris.bka.gv.at/x')).toBeNull()
    expect(publicMeasureUrl('kein link')).toBeNull()
    expect(publicMeasureUrl('https://www.ris.bka.gv.at/Dokumente/BgblAuth/BGBLA_2018_I_65')).toBe('https://www.ris.bka.gv.at/Dokumente/BgblAuth/BGBLA_2018_I_65')
  })

  it('answers for another country from the same two first answers', () => {
    const rows = list('DEU')
    expect(rows).toHaveLength(5)
    expect(of(rows, '32024L1346').measures).toHaveLength(1)
    expect(of(rows, '32024L1346').measures![0]).toMatchObject({ url: null })
    expect(of(rows, '32024L1760').measures).toEqual([])
  })

  it('keeps „unknown" apart from „nothing notified" where the country\'s answer is missing', () => {
    expect(list(null).every((r) => r.measures === null)).toBe(true)
  })

  it('throws on what is no answer', () => {
    expect(() => parseUmsetzung({} as SparqlAnswer, fixture('titel'), null)).toThrow()
    expect(() => parseUmsetzung(fixture('fristen'), fixture('titel'), { results: {} })).toThrow()
  })
})

describe('the queries', () => {
  it('take only a window, a country and directives that are what they say', () => {
    expect(deadlinesQuery('2024-11-15', '2028-11-15')).toContain('"2024-11-15"^^xsd:date')
    expect(() => deadlinesQuery('2028-11-15', '2024-11-15')).toThrow()
    expect(() => deadlinesQuery('heute', '2028-11-15')).toThrow()
    expect(measuresQuery('AUT', '2024-11-15', '2028-11-15')).toContain('/authority/country/AUT>')
    expect(() => measuresQuery('at', '2024-11-15', '2028-11-15')).toThrow()
    expect(() => measuresQuery('AUT> } #', '2024-11-15', '2028-11-15')).toThrow()
    expect(titlesQuery(['32024L1069'])).toContain('"32024L1069"^^xsd:string')
    expect(() => titlesQuery(['32024R1689'])).toThrow()
    expect(() => titlesQuery([])).toThrow()
    expect(() => titlesQuery(['32024L1069'], 'de')).toThrow()
  })
})
