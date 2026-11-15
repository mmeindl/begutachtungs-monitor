import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { actMeasuresQuery, directivesQuery, measureCountsQuery, parseActMeasures, parseDirectives, parseMeasureCounts, publicMeasureUrl } from '../server/utils/eu/cellarUmsetzung'
import { directiveHeadOf, directiveLabel, umsetzungRows } from '../server/utils/eu/umsetzung'
import type { SparqlAnswer } from '../server/utils/eu/cellar'
import type { EuActSummary } from '../shared/types/eu'
import { euUmsetzungWindow } from '../shared/utils/eu'

/* Directives a country has to transpose (step 7): the Cellar's answers of
 * 15.11.2026, cut to five directives (tests/fixtures/eu-umsetzung). */

const fixture = (name: string): SparqlAnswer => JSON.parse(readFileSync(new URL(`./fixtures/eu-umsetzung/${name}.json`, import.meta.url), 'utf8'))
const directives = () => parseDirectives(fixture('richtlinien'))
const one = (celex: string) => directives().find((d) => d.celex === celex)!

describe('the directives of the window', () => {
  it('lists every directive by deadline, then by CELEX', () => {
    const rows = directives()
    expect(rows.map((r) => r.celex).sort()).toEqual(['32024L0299', '32024L1069', '32024L1346', '32024L1760', '32025L0516'])
    expect(rows.map((r) => r.deadline)).toEqual([...rows.map((r) => r.deadline)].sort())
    expect(one('32024L1069')).toMatchObject({ deadline: '2026-05-07', otherDates: [], form: 'richtlinie' })
    expect(one('32024L1069').title).toMatch(/^Richtlinie \(EU\) 2024\/1069 /)
  })

  it('prints the latest date as the deadline and keeps the earlier ones (rule D3)', () => {
    expect(one('32025L0516')).toMatchObject({ deadline: '2028-07-01', otherDates: ['2025-04-14', '2026-12-31', '2027-01-01', '2028-06-30'] })
  })

  it('names the form the Cellar gives a directive', () => {
    expect(one('32024L0299').form).toBe('delegierte-richtlinie')
  })

  it('throws on what is no answer', () => {
    expect(() => parseDirectives({} as SparqlAnswer)).toThrow()
    expect(() => parseMeasureCounts({ results: {} })).toThrow()
    expect(() => parseActMeasures({} as SparqlAnswer)).toThrow()
  })
})

describe('what a country notified', () => {
  it('counts the measures per directive; a directive without a row has none', () => {
    const counts = parseMeasureCounts(fixture('anzahl-AUT'))
    expect([...counts.entries()].sort()).toEqual([['32024L0299', 1], ['32024L1346', 118], ['32024L1760', 2]])
    expect(counts.has('32024L1069')).toBe(false)
  })

  it('reads a measure as notified: title, kind, day, gazette, address', () => {
    const m = parseActMeasures(fixture('massnahmen-AUT-32024L1760'))
    expect(m.map((x) => x.notified)).toEqual(['2026-01-19', '2026-06-19'])
    expect(m[0]).toMatchObject({ kind: 'Bundesgesetz', gazette: { number: 'BGBl. I Nr. 65/2018', date: '2018-08-20' } })
    expect(m[0]!.title).toMatch(/^Bundesgesetz über die Vergabe von Aufträgen \(Bundesvergabegesetz 2018\);/)
    expect(m[0]!.title).not.toMatch(/\n/)
    expect(m[0]!.url).toMatch(/^https:\/\/www\.ris\.bka\.gv\.at\//)
    expect(m[1]).toMatchObject({ kind: 'Landesgesetz', url: null })
  })

  it('reads nothing notified as an empty list', () => {
    expect(parseActMeasures(fixture('massnahmen-AUT-32024L1069'))).toEqual([])
  })

  it('passes on no address into the federal intranet', () => {
    const m = parseActMeasures(fixture('massnahmen-AUT-32024L1346'))
    expect(m).toHaveLength(5)
    expect(m.filter((x) => x.url === null).length).toBeGreaterThanOrEqual(2)
    expect(m.every((x) => !x.url || !x.url.includes('intra'))).toBe(true)
    expect(publicMeasureUrl('https://ris.bka.intra.gv.at/GeltendeFassung.wxe?x=1')).toBeNull()
    expect(publicMeasureUrl('http://www.ris.bka.gv.at/x')).toBeNull()
    expect(publicMeasureUrl('kein link')).toBeNull()
    expect(publicMeasureUrl('https://www.ris.bka.gv.at/Dokumente/BgblAuth/BGBLA_2018_I_65')).toBe('https://www.ris.bka.gv.at/Dokumente/BgblAuth/BGBLA_2018_I_65')
  })

  it('answers for another country', () => {
    const m = parseActMeasures(fixture('massnahmen-DEU-32024L1346'))
    expect(m).toHaveLength(1)
    expect(m[0]).toMatchObject({ url: null })
  })
})

describe('the queries', () => {
  it('take only a window, a country and a directive that are what they say', () => {
    expect(directivesQuery('2024-11-15', '2028-11-15')).toContain('"2024-11-15"^^xsd:date')
    expect(() => directivesQuery('2028-11-15', '2024-11-15')).toThrow()
    expect(() => directivesQuery('heute', '2028-11-15')).toThrow()
    expect(() => directivesQuery('2024-11-15', '2028-11-15', 'de')).toThrow()
    expect(measureCountsQuery('AUT', '2024-11-15', '2028-11-15')).toContain('/authority/country/AUT>')
    expect(() => measureCountsQuery('at', '2024-11-15', '2028-11-15')).toThrow()
    expect(() => measureCountsQuery('AUT> } #', '2024-11-15', '2028-11-15')).toThrow()
    expect(actMeasuresQuery('AUT', '32024L1069')).toContain('"32024L1069"^^xsd:string')
    expect(() => actMeasuresQuery('AUT', '32024R1689')).toThrow()
    expect(() => actMeasuresQuery('AUT', '32024L1069" } #')).toThrow()
  })

  it('look two years back and two ahead of the day', () => {
    expect(euUmsetzungWindow('2026-11-15')).toEqual({ from: '2024-11-15', to: '2028-11-15' })
    expect(euUmsetzungWindow('2028-02-29')).toEqual({ from: '2026-02-28', to: '2030-02-28' })
  })
})

describe('the list', () => {
  const summary = (celex: string, bund: number, laender: number) => ({ celex, counts: { bund, laender } }) as EuActSummary

  it('sets two observations beside each directive, in the order of the deadlines', () => {
    const rows = umsetzungRows(directives(), parseMeasureCounts(fixture('anzahl-AUT')), [summary('32024L1069', 1, 0)])
    expect(rows.map((r) => r.celex)).toEqual(directives().map((d) => d.celex))
    const slapp = rows.find((r) => r.celex === '32024L1069')!
    expect(slapp).toMatchObject({ label: 'Richtlinie (EU) 2024/1069', path: '/eu-recht/richtlinie/2024/1069', drafts: { bund: 1, laender: 0 }, measures: 0 })
    expect(rows.find((r) => r.celex === '32024L1346')).toMatchObject({ drafts: { bund: 0, laender: 0 }, measures: 118 })
  })

  it('keeps „unknown" apart from „none": no map, no notifications read', () => {
    const rows = umsetzungRows(directives(), null, null)
    expect(rows.every((r) => r.drafts === null && r.measures === null)).toBe(true)
  })

  it('names a directive as its title does, and by the CELEX where there is none', () => {
    expect(directiveLabel('32024L0299', one('32024L0299').title)).toMatch(/^Delegierte Richtlinie \(EU\) 2024\/299$/)
    expect(directiveLabel('32024L1069', null)).toBe('Richtlinie (EU) 2024/1069')
    expect(directiveLabel('32009L0138', null)).toBe('Richtlinie 32009L0138')
  })

  it('heads the page of a directive no draft names from the Cellar\'s record', () => {
    const head = directiveHeadOf('32024L1069', { found: true, dates: ['2026-05-07'], adopted: '2024-04-11', inForce: '2024-05-06', title: one('32024L1069').title })
    expect(head).toMatchObject({
      kind: 'richtlinie',
      label: 'Richtlinie (EU) 2024/1069',
      path: '/eu-recht/richtlinie/2024/1069',
      eurLexUrl: 'https://eur-lex.europa.eu/eli/dir/2024/1069/oj/deu',
      adopted: '2024-04-11',
      transposition: { deadline: '2026-05-07', otherDates: [] },
    })
    // Not for an act the Cellar does not know, and not for a regulation.
    expect(directiveHeadOf('32024L9999', { found: false, dates: [], adopted: null, inForce: null, title: null })).toBeNull()
    expect(directiveHeadOf('32024R1689', { found: true, dates: [], adopted: null, inForce: null, title: null })).toBeNull()
  })
})
