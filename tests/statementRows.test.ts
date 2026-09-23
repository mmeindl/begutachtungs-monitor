import { describe, expect, it } from 'vitest'
import type { StatementMeta, StatementsSummary } from '../shared/types'
import {
  availableStatementFilters,
  compareStatementRows,
  orgRowDate,
  orgRowsOf,
  orgSortDate,
  submitterLabel,
  submitterName,
} from '../app/utils/statementRows'

const meta = (o: Partial<StatementMeta>): StatementMeta => ({
  citation: '1/SN-1/ME',
  date: '2026-09-08',
  submitterKind: 'organisation',
  submitterName: null,
  endorsements: 0,
  parliamentUrl: 'https://example.invalid',
  ...o,
})

type OrgEntry = StatementsSummary['organisationList'][number]

const org = (
  name: string,
  endorsements: number,
  statements: { citation: string; date: string | null; endorsements?: number }[],
): OrgEntry => ({
  name,
  endorsements,
  statements: statements.map((s) => ({
    citation: s.citation,
    date: s.date,
    endorsements: s.endorsements ?? 0,
    parliamentUrl: `https://example.invalid/${s.citation}`,
  })),
})

const summary = (list: OrgEntry[]): StatementsSummary => ({
  total: 0,
  organisations: list.length,
  privatePersons: 0,
  nonPublic: 0,
  organisationList: list,
})

/**
 * The GDPR guard, and the reason this module exists as a module: a rule that
 * decides whether a private person's name reaches a public page has to be
 * executable by a test (GDPR, docs/architecture.md §3).
 */
describe('submitterLabel', () => {
  it('never names a private person — not even one upstream named', () => {
    // The API contract says `submitterName` is null for a person. This is
    // the second line of defence, for the day it is not.
    expect(submitterLabel(meta({ submitterKind: 'person', submitterName: 'Maria Musterfrau' })))
      .toBe('Privatperson')
    expect(submitterLabel(meta({ submitterKind: 'person', submitterName: null })))
      .toBe('Privatperson')
  })

  it('never names a non-public submission either', () => {
    expect(submitterLabel(meta({ submitterKind: 'nonpublic', submitterName: 'Irgendwer' })))
      .toBe('Nicht-öffentliche Stellungnahme')
  })

  it('names an organisation, which is the one kind that may be named', () => {
    expect(submitterLabel(meta({ submitterKind: 'organisation', submitterName: 'Amt der Tiroler Landesregierung' })))
      .toBe('Amt der Tiroler Landesregierung')
  })

  it('falls back to the kind where an organisation has no name', () => {
    expect(submitterLabel(meta({ submitterKind: 'organisation', submitterName: null })))
      .toBe('Organisation')
  })
})

describe('submitterName', () => {
  it('hands the accessible name only to an organisation', () => {
    expect(submitterName(meta({ submitterKind: 'organisation', submitterName: 'Arbeiterkammer' })))
      .toBe('Arbeiterkammer')
    expect(submitterName(meta({ submitterKind: 'person', submitterName: 'Maria Musterfrau' })))
      .toBeNull()
    expect(submitterName(meta({ submitterKind: 'nonpublic', submitterName: 'Irgendwer' })))
      .toBeNull()
  })
})

describe('compareStatementRows', () => {
  const a = { endorsements: 3, date: '2026-09-01' }
  const b = { endorsements: 1, date: '2026-09-09' }

  it('leads with the chosen key and keeps the other as the tie-break', () => {
    expect(compareStatementRows(a, b, 'endorsements')).toBeLessThan(0)
    expect(compareStatementRows(a, b, 'date')).toBeGreaterThan(0)
  })

  it('breaks an equal count by the newer date', () => {
    expect(
      compareStatementRows({ endorsements: 2, date: '2026-09-01' }, { endorsements: 2, date: '2026-09-09' }, 'endorsements'),
    ).toBeGreaterThan(0)
  })

  it('sorts a row without a date last, where it carries no position', () => {
    expect(
      compareStatementRows({ endorsements: 0, date: null }, { endorsements: 0, date: '2020-01-01' }, 'date'),
    ).toBeGreaterThan(0)
  })
})

describe('orgSortDate / orgRowDate', () => {
  const twoDays = org('Amt', 0, [
    { citation: '95/SN', date: '2026-09-03' },
    { citation: '103/SN', date: '2026-09-11' },
  ])

  it('sorts a group by its latest submission', () => {
    expect(orgSortDate(twoDays)).toBe('2026-09-11')
  })

  it('prints the one day where there is one, the latest otherwise', () => {
    expect(orgRowDate(org('Kammer', 0, [{ citation: '1/SN', date: '2026-09-05' }]))).toBe('2026-09-05')
    expect(orgRowDate(twoDays)).toBe('2026-09-11')
  })

  it('keeps a missing date missing rather than inventing one', () => {
    expect(orgRowDate(org('Ohne', 0, [{ citation: '1/SN', date: null }]))).toBeNull()
    expect(orgSortDate(org('Ohne', 0, [{ citation: '1/SN', date: null }]))).toBeNull()
  })
})

describe('orgRowsOf', () => {
  const list = [
    org('Beta', 2, [{ citation: '2/SN', date: '2026-09-02' }]),
    org('Alpha', 2, [{ citation: '1/SN', date: '2026-09-02' }]),
    org('Gamma', 9, [
      { citation: '3/SN', date: '2026-09-01' },
      { citation: '4/SN', date: '2026-09-07' },
    ]),
  ]

  it('ranks by endorsements and breaks the rest by name', () => {
    expect(orgRowsOf(summary(list), 'endorsements').map((r) => r.row.label)).toEqual([
      'Gamma',
      'Alpha',
      'Beta',
    ])
  })

  it('opens a group that filed more than once, and counts its parts', () => {
    const gamma = orgRowsOf(summary(list), 'endorsements')[0]!
    expect(gamma.expanded).toBe(true)
    expect(gamma.row.detail).toBe('2 Stellungnahmen')
    expect(gamma.row.links).toBeNull()
    expect(gamma.row.date).toBe('2026-09-07')
  })

  it('gives a single submission its link and no count', () => {
    const alpha = orgRowsOf(summary(list), 'endorsements')[1]!
    expect(alpha.expanded).toBe(false)
    expect(alpha.row.detail).toBeNull()
    expect(alpha.row.links).toEqual([{ citation: '1/SN', href: 'https://example.invalid/1/SN' }])
  })

  it('orders the sub-rows the way the reader asked', () => {
    const byDate = orgRowsOf(summary(list), 'date').find((r) => r.row.label === 'Gamma')!
    expect(byDate.org.statements.map((s) => s.citation)).toEqual(['4/SN', '3/SN'])
  })

  it('never sorts the summary it was handed', () => {
    const input = summary(list)
    const before = input.organisationList.map((o) => o.name)
    const beforeStatements = input.organisationList[2]!.statements.map((s) => s.citation)
    orgRowsOf(input, 'date')
    expect(input.organisationList.map((o) => o.name)).toEqual(before)
    expect(input.organisationList[2]!.statements.map((s) => s.citation)).toEqual(beforeStatements)
  })
})

/**
 * Which segments the panel offers, and — as the first of them — the one it
 * lands in. The case this exists for: a draft on which only private persons
 * filed used to open on an empty Organisationen list.
 */
describe('availableStatementFilters', () => {
  const counts = (organisations: number, privatePersons: number, nonPublic: number): StatementsSummary => ({
    total: organisations + privatePersons + nonPublic,
    organisations,
    privatePersons,
    nonPublic,
    organisationList: [],
  })

  it('lands in Organisationen wherever organisations filed', () => {
    expect(availableStatementFilters(counts(3, 40, 1))).toEqual([
      'organisations',
      'persons',
      'nonpublic',
      'all',
    ])
    expect(availableStatementFilters(counts(3, 0, 0))[0]).toBe('organisations')
  })

  it('lands in the first segment that has something in it', () => {
    expect(availableStatementFilters(counts(0, 12, 2))).toEqual(['persons', 'nonpublic', 'all'])
    expect(availableStatementFilters(counts(0, 0, 4))).toEqual(['nonpublic'])
  })

  it('offers no empty segment', () => {
    expect(availableStatementFilters(counts(5, 0, 2))).toEqual([
      'organisations',
      'nonpublic',
      'all',
    ])
  })

  /* One kind and no organisations: „Alle" would be that list under a second
   * name, and the panel then shows no filter at all. With organisations it
   * still differs — ungrouped, one row per Stellungnahme. */
  it('drops „Alle" only where it would duplicate the one segment left', () => {
    expect(availableStatementFilters(counts(0, 12, 0))).toEqual(['persons'])
    expect(availableStatementFilters(counts(7, 0, 0))).toEqual(['organisations', 'all'])
  })
})
